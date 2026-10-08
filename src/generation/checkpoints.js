// Robo Rally Course Randomizer - checkpoints: candidates, spacing expectations, Hazardous Checkpoints claimability, weighting and picking, flag overrides
import { simulateAction } from "../../analyze.js";
import { buildResolvedMap, placePiece } from "../../board.js";
import { getEffectiveLaserDamage, getTilePenaltyForFeature } from "../../feature-weights.js";
import {
  getCalibrationCheckpointSamplingRegime,
  getCandidateBoardDepth,
  getFlagCandidateApproachStats
} from "./calibration-features.js";
import { applyConstructionGuidanceRanking } from "./construction-guidance.js";
import { cloneTileMap, manhattanDistance } from "./layout-geometry.js";
import { getMovingCheckpointTrace } from "./moving-targets.js";
import { getTuningDifficulty } from "./preferences.js";
import { sample, sampleManyWeighted } from "./random.js";
import { makeGenerationStopRequestedError } from "./scheduling.js";
import {
  getVariantPreferenceState,
  isCheckpointActiveFeature,
  isHazardousFlagEligibleUnderlyingFeature
} from "./variant-availability.js";

export function getFlagCandidates(placements, pieceMap) {
  // A checkpoint site is a resolved coordinate, not one candidate per stacked
  // board/overlay placement. Duplicate coordinates used to silently overweight
  // overlay-covered spaces. Keep the first structural owner (boards/docks are
  // passed before overlays) while merging the sampling weight conservatively.
  const byCoordinate = new Map();

  for (const [placementIndex, placement] of placements.entries()) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) continue;

    const placed = placePiece(piece, placement);
    for (const tile of placed.tiles || []) {
      const x = tile.x;
      const y = tile.y;
      const key = `${x},${y}`;
      const weight = piece.kind === "dock" ? 0.45 : 1;
      const existing = byCoordinate.get(key);
      if (existing) {
        existing.weight = Math.max(existing.weight, weight);
        continue;
      }
      byCoordinate.set(key, {
        x,
        y,
        pieceId: placement.pieceId,
        placementIndex,
        weight
      });
    }
  }

  return [...byCoordinate.values()];
}

export function areFlagsTooClose(left, right, minDistance = 3) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) < minDistance;
}

// Checkpoint geometry has two layers. The technical floor prevents duplicate or
// nearly identical objectives from dominating proposal sampling. The stronger
// profile is retained as construction/debug evidence only; player-facing checkpoint
// quality is judged from routed register demand after analysis.
export const CHECKPOINT_TECHNICAL_SPACING = Object.freeze({
  consecutive: 2,
  openingNearest: 2,
  openingAverage: 3
});
export const CHECKPOINT_SPACING_EXPECTATIONS = Object.freeze({
  consecutive: 4,
  final: 6,
  openingNearest: 4,
  openingAverage: 7
});

export function getConsecutiveFlagDistanceThreshold() {
  return CHECKPOINT_TECHNICAL_SPACING.consecutive;
}

export function getFirstFlagDistanceThresholds() {
  return {
    nearest: CHECKPOINT_TECHNICAL_SPACING.openingNearest,
    average: CHECKPOINT_TECHNICAL_SPACING.openingAverage
  };
}

export function isFirstFlagFarEnough(flag, starts, thresholds, options = {}) {
  if (!starts.length) return true;
  const entries = starts.map((start) => ({
    start,
    distance: manhattanDistance(flag, start),
    zoneKey: start.noDockZoneKey ?? null
  }));
  const zoneKeys = new Set(entries.map((entry) => entry.zoneKey).filter(Boolean));
  const multiZoneNoDocks = Boolean(options.noDocks && zoneKeys.size > 1);
  if (!multiZoneNoDocks) {
    const distances = entries.map((entry) => entry.distance);
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    return nearest >= thresholds.nearest && averageDistance >= thresholds.average;
  }
  const playerCount = Math.max(1, Number(options.playerCount ?? starts.length));
  const qualifying = entries.filter((entry) => entry.distance >= thresholds.nearest);
  if (qualifying.length < Math.min(playerCount, starts.length)) return false;
  const extraDocksForced = options.extraDocksState === "forced" ||
    getVariantPreferenceState(options, "extraDocks") === "forced";
  if (extraDocksForced) {
    const qualifyingZones = new Set(qualifying.map((entry) => entry.zoneKey).filter(Boolean));
    if (qualifyingZones.size < Math.min(2, zoneKeys.size)) return false;
  }
  const retainedDistances = qualifying
    .map((entry) => entry.distance)
    .sort((left, right) => right - left)
    .slice(0, Math.min(playerCount, qualifying.length));
  const retainedAverage = retainedDistances.reduce((sum, value) => sum + value, 0) /
    Math.max(1, retainedDistances.length);
  return retainedAverage >= thresholds.average;
}

export function isValidFlagSequence(flags) {
  const minDistance = getConsecutiveFlagDistanceThreshold();
  for (let index = 1; index < flags.length; index += 1) {
    if (areFlagsTooClose(flags[index - 1], flags[index], minDistance)) return false;
  }
  return true;
}

// Stronger Manhattan spacing is retained for construction/debug diagnostics only.
// It is not route legality, acceptance, fit scoring, proposal preference, or a
// player-facing checkpoint warning.
export function getCheckpointSpacingExpectationProfile(flags = [], starts = [], preferences = {}) {
  const playableFlags = flags.filter(Boolean);
  if (!playableFlags.length) return { acceptable: true, penalty: 0, deviations: [], opening: null, legs: [] };
  const deviations = [];
  let penalty = 0;
  let opening = null;
  if (starts.length) {
    const distances = starts.map((start) => manhattanDistance(playableFlags[0], start));
    const nearest = Math.min(...distances);
    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const thresholds = {
      nearest: CHECKPOINT_SPACING_EXPECTATIONS.openingNearest,
      average: CHECKPOINT_SPACING_EXPECTATIONS.openingAverage
    };
    const acceptable = isFirstFlagFarEnough(playableFlags[0], starts, thresholds, preferences);
    const nearestDeficit = Math.max(0, thresholds.nearest - nearest);
    const averageDeficit = Math.max(0, thresholds.average - average);
    opening = {
      nearest: Number(nearest.toFixed(2)),
      average: Number(average.toFixed(2)),
      expectedNearest: thresholds.nearest,
      expectedAverage: thresholds.average,
      acceptable
    };
    if (!acceptable) {
      const severity = Math.max(1, nearestDeficit * 1.4 + averageDeficit * 0.8);
      penalty += severity * 7;
      deviations.push({
        type: "opening",
        severity: Number(severity.toFixed(2)),
        nearest: opening.nearest,
        average: opening.average,
        expectedNearest: thresholds.nearest,
        expectedAverage: thresholds.average
      });
    }
  }
  const legs = [];
  for (let index = 1; index < playableFlags.length; index += 1) {
    const distance = manhattanDistance(playableFlags[index - 1], playableFlags[index]);
    const finalLeg = index === playableFlags.length - 1;
    const expectedMinimum = finalLeg ? CHECKPOINT_SPACING_EXPECTATIONS.final : CHECKPOINT_SPACING_EXPECTATIONS.consecutive;
    const deficit = Math.max(0, expectedMinimum - distance);
    const acceptable = deficit <= 0;
    legs.push({ from: index, to: index + 1, distance, expectedMinimum, finalLeg, acceptable });
    if (!acceptable) {
      const severity = deficit * (finalLeg ? 1.5 : 1);
      penalty += severity * (finalLeg ? 8 : 5);
      deviations.push({
        type: finalLeg ? "final" : "consecutive",
        severity: Number(severity.toFixed(2)),
        from: index,
        to: index + 1,
        distance,
        expectedMinimum
      });
    }
  }
  return {
    acceptable: deviations.length === 0,
    penalty: Number(penalty.toFixed(2)),
    deviations,
    opening,
    legs
  };
}

export function sampleCheckpointProposalWithExpectations(candidates = [], preferences = {}, applySpacingPreference = false) {
  if (!candidates.length) return null;
  const ranked = applyConstructionGuidanceRanking(candidates, preferences, { predictionKey: "prediction" });
  const weighted = ranked.map((candidate) => {
    const penalty = Number(candidate.spacingExpectation?.penalty) || 0;
    const expectationComponent = applySpacingPreference ? 1 / (1 + penalty / 12) : 1;
    return {
      ...candidate,
      weight: Math.max(1e-6, (Number(candidate.weight) || 1) * expectationComponent)
    };
  });
  return sampleManyWeighted(weighted, 1)[0] ?? sample(weighted);
}

export function canUseCheckpointTile(candidate, tileMap, starts, preferences = {}) {
  if (!preferences.hazardousFlags) {
    return true;
  }

  if (starts.some((start) => start.x === candidate.x && start.y === candidate.y)) {
    return false;
  }

  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  if ((tile?.features || []).some((feature) => feature.type === "pit")) return false;
  // With Moving Targets the checkpoint rides the same conveyors as the robot, so
  // the static claim test below does not apply.
  return preferences.movingTargets || isHazardousCheckpointClaimable(tileMap, candidate);
}

// Hazardous Flags keeps the board element under a checkpoint active for robots,
// and a checkpoint is claimed only at the very end of a register, after board
// elements. A checkpoint on, say, an express conveyor is therefore claimable
// only if some robot that ends its programmed move nearby is left on the
// checkpoint once the board elements have acted. This checks exactly that with
// the movement simulator (a Wait from every nearby space, for every register),
// so placement never asks route search to prove an unclaimable leg impossible,
// which makes it exhaust the whole board. Robot-on-robot pushes are ignored.
export const HAZARDOUS_CHECKPOINT_CLAIM_RADIUS = 3;
export const HAZARDOUS_CHECKPOINT_WAIT_ACTION = Object.freeze({ id: "WAIT", type: "wait" });
export const hazardousCheckpointClaimCache = new WeakMap();

export function isHazardousCheckpointClaimable(tileMap, checkpoint) {
  const checkpointTile = tileMap.get(`${checkpoint.x},${checkpoint.y}`);
  const covered = (checkpointTile?.features || []).some((feature) => (
    isHazardousFlagEligibleUnderlyingFeature(feature)
  ));
  if (!covered) return true;

  let cache = hazardousCheckpointClaimCache.get(tileMap);
  if (!cache) {
    cache = new Map();
    hazardousCheckpointClaimCache.set(tileMap, cache);
  }
  const key = `${checkpoint.x},${checkpoint.y}`;
  if (cache.has(key)) return cache.get(key);

  const simulationOptions = { portalMap: new Map() };
  let claimable = false;
  for (let dy = -HAZARDOUS_CHECKPOINT_CLAIM_RADIUS; dy <= HAZARDOUS_CHECKPOINT_CLAIM_RADIUS && !claimable; dy += 1) {
    const span = HAZARDOUS_CHECKPOINT_CLAIM_RADIUS - Math.abs(dy);
    for (let dx = -span; dx <= span && !claimable; dx += 1) {
      const x = checkpoint.x + dx;
      const y = checkpoint.y + dy;
      const tile = tileMap.get(`${x},${y}`);
      if (!tile || (tile.features || []).some((feature) => feature.type === "pit")) continue;
      for (let registerIndex = 0; registerIndex < 5 && !claimable; registerIndex += 1) {
        const result = simulateAction(
          tileMap,
          { x, y, facing: "N" },
          HAZARDOUS_CHECKPOINT_WAIT_ACTION,
          { ...simulationOptions, registerIndex }
        );
        claimable = !result.rebooted && result.to.x === checkpoint.x && result.to.y === checkpoint.y;
      }
    }
  }
  cache.set(key, claimable);
  return claimable;
}

export function getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences = {}) {
  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  const features = tile?.features || [];
  let penalty = 0;

  for (const feature of features) {
    if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall" || feature.type === "homingMissile") {
      continue;
    }

    let featurePenalty = getTilePenaltyForFeature(feature, {
      batteryActive: !preferences.lighterGame,
      cuttingFloor: preferences.cuttingFloor,
      criticalSpam: preferences.criticalSpam,
      criticalHaywire: preferences.criticalHaywire,
      permanentShutdown: preferences.permanentShutdown,
      flamingOil: preferences.flamingOil,
      repulsorOverdrive: preferences.repulsorOverdrive,
      setToKill: preferences.setToKill,
      setToStun: preferences.setToStun
    });

    if (feature.type === "flamethrower") {
      featurePenalty += 5.5;
    } else if (feature.type === "laser") {
      featurePenalty += 3.5 + getEffectiveLaserDamage(feature, preferences) * 0.5;
    } else if (feature.type === "push") {
      featurePenalty += 2.8;
    } else if (feature.type === "belt") {
      featurePenalty += feature.speed === 2 ? 1.6 : 0.7;
      if (preferences.movingTargets) {
        featurePenalty *= 0.25;
      }
    } else if (feature.type === "oil") {
      featurePenalty += 2.2;
    } else if (feature.type === "portal") {
      featurePenalty += 3;
    } else if (feature.type === "teleporter") {
      featurePenalty += 3.6;
    }

    penalty += featurePenalty;
  }

  const scale = difficulty === "easy"
    ? 0.72
    : difficulty === "moderate"
      ? 0.32
      : 0;

  return Number((penalty * scale).toFixed(2));
}

export function getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences = {}) {
  if (difficulty === "hard") {
    return 0;
  }

  let penalty = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > 2) {
        continue;
      }

      const tile = tileMap.get(`${candidate.x + dx},${candidate.y + dy}`);
      if (!tile) {
        penalty += difficulty === "easy" ? 0.7 : 0.25;
        continue;
      }

      for (const feature of tile.features || []) {
        if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall" || feature.type === "homingMissile") {
          continue;
        }

        let featurePenalty = getTilePenaltyForFeature(feature, {
          batteryActive: !preferences.lighterGame,
          cuttingFloor: preferences.cuttingFloor,
          criticalSpam: preferences.criticalSpam,
          criticalHaywire: preferences.criticalHaywire,
          permanentShutdown: preferences.permanentShutdown,
          flamingOil: preferences.flamingOil,
          repulsorOverdrive: preferences.repulsorOverdrive,
          setToKill: preferences.setToKill,
          setToStun: preferences.setToStun
        }) * (dist === 1 ? 0.32 : 0.16);

        if (feature.type === "portal" || feature.type === "teleporter") {
          featurePenalty += dist === 1 ? 1.2 : 0.5;
        } else if (feature.type === "flamethrower") {
          featurePenalty += dist === 1 ? 1.8 : 0.8;
        } else if (feature.type === "laser") {
          featurePenalty += dist === 1 ? 1.1 : 0.45;
        } else if (feature.type === "belt" && feature.speed === 2) {
          featurePenalty += dist === 1 ? 0.7 : 0.25;
        }

        penalty += featurePenalty;
      }
    }
  }

  const scale = difficulty === "easy" ? 0.85 : 0.35;
  return Number((penalty * scale).toFixed(2));
}

export function getCalibrationCheckpointDistanceTargets(regime, finalLeg = false) {
  if (regime === "compact") {
    return { openingAverage: 5, openingNearest: 2.5, leg: finalLeg ? 5 : 4 };
  }
  if (regime === "stretched") {
    return { openingAverage: 15, openingNearest: 6, leg: finalLeg ? 17 : 14 };
  }
  return { openingAverage: 9, openingNearest: 4, leg: finalLeg ? 10 : 8 };
}

export function calibrationDistanceMultiplier(value, target, spread, peak = 5) {
  const safeSpread = Math.max(0.5, Number(spread) || 1);
  const z = (Number(value) - Number(target)) / safeSpread;
  // Keep every technically valid distance sampleable, but make the experimental
  // compact / ordinary / stretched strata visibly different in the observed
  // geometry. This is calibration-only proposal weighting, never legality.
  return 0.08 + peak * Math.exp(-0.5 * z * z);
}

export function getCalibrationFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, flagCount, previousFlag = null, picked = [], boardPlacements = [], pieceMap = {}) {
  // Calibration must learn what geometry does to length/difficulty rather than
  // reproducing production's requested-band heuristics. Compact / ordinary /
  // stretched are experimental sampling strata only; they are never predictors.
  const regime = getCalibrationCheckpointSamplingRegime(preferences) ?? "ordinary";
  let weight = candidate.weight ?? 1;
  const approachStats = getFlagCandidateApproachStats(tileMap, candidate);
  const boardUse = getCandidateBoardDepth(candidate, boardPlacements, pieceMap);
  const representedBoards = new Set(
    picked
      .map((flag) => getCandidateBoardDepth(flag, boardPlacements, pieceMap).boardIndex)
      .filter((index) => index >= 0)
  );

  // Keep only mild, target-neutral site-quality shaping so the study does not
  // spend most observations on pathological checkpoint tiles.
  weight += approachStats.openCount * 0.45;
  weight += approachStats.convergencePotential * 0.2;
  weight -= approachStats.pitCount * 0.35;
  weight -= approachStats.voidCount * 0.25;
  weight -= approachStats.blockedCount * 0.2;
  if (boardUse.boardIndex >= 0) {
    weight += Math.min(1.4, boardUse.depth * 0.3);
    if (!representedBoards.has(boardUse.boardIndex)) weight += 0.7;
  }

  // Distance is the experimental treatment. Apply it multiplicatively after
  // mild site-quality shaping so local hazards/approach geometry cannot swamp the
  // compact / ordinary / stretched assignment, while retaining a nonzero tail.
  const siteWeight = Math.max(0.15, weight);
  const finalLeg = sequenceIndex === flagCount - 1;
  const targets = getCalibrationCheckpointDistanceTargets(regime, finalLeg);
  let distanceMultiplier = 1;
  if (sequenceIndex === 0 && starts.length) {
    const distances = starts.map((start) => manhattanDistance(candidate, start));
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const averageSpread = regime === "compact" ? 3 : regime === "stretched" ? 5 : 4;
    const nearestSpread = regime === "compact" ? 1.8 : regime === "stretched" ? 3 : 2.4;
    const averageMultiplier = calibrationDistanceMultiplier(
      averageDistance,
      targets.openingAverage,
      averageSpread
    );
    const nearestMultiplier = calibrationDistanceMultiplier(
      nearest,
      targets.openingNearest,
      nearestSpread,
      4
    );
    // Geometric mean avoids making the two opening-distance criteria behave like
    // independent hard gates.
    distanceMultiplier = Math.sqrt(averageMultiplier * nearestMultiplier);
  } else if (previousFlag) {
    const legSpread = regime === "compact" ? 3 : regime === "stretched" ? 5 : 4;
    distanceMultiplier = calibrationDistanceMultiplier(
      manhattanDistance(previousFlag, candidate),
      targets.leg,
      legSpread,
      finalLeg ? 5.5 : 5
    );
  }

  return Math.max(0.02, Number((siteWeight * distanceMultiplier).toFixed(3)));
}

export function getFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, flagCount, thresholds, previousFlag = null, picked = [], boardPlacements = [], pieceMap = {}, movingTargetTraceCache = null) {
  if (preferences.calibrationCaptureEvidence && getCalibrationCheckpointSamplingRegime(preferences)) {
    return getCalibrationFlagCandidateWeight(
      candidate, tileMap, starts, preferences, sequenceIndex, flagCount, previousFlag, picked, boardPlacements, pieceMap
    );
  }

  // Retained cheap production proposal policy. Calibration uses a separate,
  // target-neutral geometry sampler above so the new study can identify the
  // effects of checkpoint spacing instead of baking the requested band into it.
  let weight = candidate.weight ?? 1;
  const approachStats = getFlagCandidateApproachStats(tileMap, candidate);
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const lengthPreference = preferences.length ?? "moderate";
  const tilePenalty = getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences);
  const areaPenalty = getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences);
  const boardUse = getCandidateBoardDepth(candidate, boardPlacements, pieceMap);
  const representedBoards = new Set(picked.map((flag) => getCandidateBoardDepth(flag, boardPlacements, pieceMap).boardIndex).filter((index) => index >= 0));

  weight += approachStats.openCount * (difficulty === "easy" ? 1.8 : 1.25);
  weight += approachStats.convergencePotential * (difficulty === "easy" ? 0.5 : difficulty === "hard" ? 1.25 : 0.9);
  weight -= approachStats.pitCount * (difficulty === "easy" ? 2.2 : 0.9);
  weight -= approachStats.voidCount * (difficulty === "easy" ? 1.4 : 0.55);
  weight -= approachStats.blockedCount * (difficulty === "easy" ? 1.5 : 0.65);
  weight -= tilePenalty + areaPenalty;

  // Dynamic Archiving is intentionally not a checkpoint-placement preference.
  // Its recovery value is route-dependent and is scored only after a route has
  // actually ended registers on archive-capable spaces.

  // A shallow edge checkpoint should not be enough by itself to make a board
  // feel intentional. Deeper sites and not-yet-represented boards get a modest
  // proposal bonus, but no board is required to contain a checkpoint because a
  // route may use it meaningfully in transit.
  if (boardUse.boardIndex >= 0) {
    weight += Math.min(2.4, boardUse.depth * 0.55);
    if (!representedBoards.has(boardUse.boardIndex)) weight += 1.1;
  }

  if (sequenceIndex === 0 && starts.length) {
    const distances = starts.map((start) => manhattanDistance(candidate, start));
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const targetAverage = lengthPreference === "short" ? 7 : lengthPreference === "epic" ? 15 : lengthPreference === "long" ? 12 : 9;
    weight += Math.min(3.2, Math.max(-2, (averageDistance - targetAverage + 3) * 0.32));
    if (nearest >= thresholds.nearest && averageDistance >= thresholds.average) weight += 1.2;
  }

  if (previousFlag) {
    const legDistance = manhattanDistance(previousFlag, candidate);
    const finalLeg = sequenceIndex === flagCount - 1;
    if (lengthPreference === "short") {
      weight += legDistance <= 8 ? 1.4 : legDistance <= 11 ? 0.5 : -1.2;
    } else {
      const desired = finalLeg
        ? (lengthPreference === "epic" ? 14 : lengthPreference === "long" ? 11 : 9)
        : (lengthPreference === "epic" ? 12 : lengthPreference === "long" ? 9 : 7);
      weight += Math.min(finalLeg ? 3.6 : 2, Math.max(-1.2, (legDistance - desired + 3) * (finalLeg ? 0.55 : 0.3)));
    }
  }

  if (preferences.movingTargets) {
    const trace = getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences);
    if (trace.moving) {
      const baseBonus = difficulty === "easy" ? 0.9 : difficulty === "moderate" ? 2.8 : 4.4;
      weight += baseBonus + Math.min(2.8, Math.max(0, trace.pathLength - 1) * 0.55) + trace.turnCount * 0.4 + trace.fastCount * 0.3;
    }
  }

  return Math.max(0.05, Number(weight.toFixed(2)));
}

export function sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, thresholds, boardPlacements, pieceMap, movingTargetTraceCache = null) {
  const pool = [...flagCandidates];
  const picked = [];
  const minSequentialDistance = getConsecutiveFlagDistanceThreshold();

  while (pool.length && picked.length < flagCount) {
    const sequenceIndex = picked.length;
    const previousFlag = picked[sequenceIndex - 1] ?? null;
    const eligible = pool
      .filter((candidate) => (
        canUseCheckpointTile(candidate, tileMap, starts, preferences) &&
        (sequenceIndex !== 0 || isFirstFlagFarEnough(candidate, starts, thresholds, preferences)) &&
        (!previousFlag || !areFlagsTooClose(previousFlag, candidate, minSequentialDistance))
      ))
      .map((candidate) => {
        const rawWeight = getFlagCandidateWeight(
          candidate, tileMap, starts, preferences, sequenceIndex, flagCount, thresholds, previousFlag, picked, boardPlacements, pieceMap, movingTargetTraceCache
        );
        return { ...candidate, weight: Math.max(0.02, rawWeight) };
      });

    if (!eligible.length) break;
    const [chosen] = sampleManyWeighted(eligible, 1);
    if (!chosen) break;
    picked.push(chosen);
    const chosenIndex = pool.findIndex((candidate) => candidate.x === chosen.x && candidate.y === chosen.y);
    if (chosenIndex >= 0) pool.splice(chosenIndex, 1);
  }

  return picked;
}

export function pickFlags(flagCandidates, flagCount, boardPlacements, dockPlacements, pieceMap, starts = [], preferences = {}) {
  const firstFlagThresholds = getFirstFlagDistanceThresholds();
  const { tileMap } = buildResolvedMap([...boardPlacements, ...(dockPlacements || [])], pieceMap);
  const movingTargetTraceCache = preferences.movingTargets ? new Map() : null;
  const movingCandidates = preferences.movingTargets
    ? new Set(flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences).moving).map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  const hazardousFlagCandidates = preferences.hazardousFlags
    ? new Set(flagCandidates.filter((candidate) => {
      const tile = tileMap.get(`${candidate.x},${candidate.y}`);
      return (tile?.features || []).some((feature) => (
        isHazardousFlagEligibleUnderlyingFeature(feature, { movingTargets: preferences.movingTargets })
      ));
    }).map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  if (preferences.movingTargets && !movingCandidates?.size) return null;
  if (preferences.hazardousFlags && !hazardousFlagCandidates?.size) return null;
  const requiresMovingTarget = Boolean(preferences.movingTargets);
  const requiresHazardousFlag = Boolean(preferences.hazardousFlags);

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const sampled = sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, firstFlagThresholds, boardPlacements, pieceMap, movingTargetTraceCache);
    if (sampled.length !== flagCount) continue;
    if (!isValidFlagSequence(sampled)) continue;
    if (!isFirstFlagFarEnough(sampled[0], starts, firstFlagThresholds, preferences)) continue;
    if (requiresMovingTarget && !sampled.some((flag) => movingCandidates.has(`${flag.x},${flag.y}`))) continue;
    if (requiresHazardousFlag && !sampled.some((flag) => hazardousFlagCandidates.has(`${flag.x},${flag.y}`))) continue;
    return sampled.map(({ x, y }) => ({ x, y }));
  }

  return null;
}

export async function pickFlagsCooperative(
  flagCandidates,
  flagCount,
  boardPlacements,
  dockPlacements,
  pieceMap,
  starts = [],
  preferences = {},
  control = {}
) {
  const firstFlagThresholds = getFirstFlagDistanceThresholds();
  const { tileMap } = buildResolvedMap([...boardPlacements, ...(dockPlacements || [])], pieceMap);
  const movingTargetTraceCache = preferences.movingTargets ? new Map() : null;
  const movingCandidates = preferences.movingTargets
    ? new Set(flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences).moving).map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  const hazardousFlagCandidates = preferences.hazardousFlags
    ? new Set(flagCandidates.filter((candidate) => {
      const tile = tileMap.get(`${candidate.x},${candidate.y}`);
      return (tile?.features || []).some((feature) => (
        isHazardousFlagEligibleUnderlyingFeature(feature, { movingTargets: preferences.movingTargets })
      ));
    }).map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  if (preferences.movingTargets && !movingCandidates?.size) return null;
  if (preferences.hazardousFlags && !hazardousFlagCandidates?.size) return null;
  const requiresMovingTarget = Boolean(preferences.movingTargets);
  const requiresHazardousFlag = Boolean(preferences.hazardousFlags);
  const shouldStopRequested = typeof control.shouldStopRequested === "function"
    ? control.shouldStopRequested
    : () => false;
  const cooperativeYield = typeof control.cooperativeYield === "function"
    ? control.cooperativeYield
    : null;
  const yieldEvery = Math.max(1, Math.floor(Number(control.yieldEvery) || 12));

  for (let attempt = 0; attempt < 250; attempt += 1) {
    if (shouldStopRequested()) throw makeGenerationStopRequestedError();
    const sampled = sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, firstFlagThresholds, boardPlacements, pieceMap, movingTargetTraceCache);
    if (
      sampled.length === flagCount &&
      isValidFlagSequence(sampled) &&
      isFirstFlagFarEnough(sampled[0], starts, firstFlagThresholds, preferences) &&
      (!requiresMovingTarget || sampled.some((flag) => movingCandidates.has(`${flag.x},${flag.y}`))) &&
      (!requiresHazardousFlag || sampled.some((flag) => hazardousFlagCandidates.has(`${flag.x},${flag.y}`)))
    ) {
      return sampled.map(({ x, y }) => ({ x, y }));
    }
    if (cooperativeYield && (attempt + 1) % yieldEvery === 0) {
      await cooperativeYield({
        phase: "checkpoint-proposal-sampling",
        attempts: attempt + 1,
        maxAttempts: 250
      });
      if (shouldStopRequested()) throw makeGenerationStopRequestedError();
    }
  }

  return null;
}

export function applyFlagOverrides(tileMap, goals, options = {}) {
  const next = cloneTileMap(tileMap);
  const hazardousFlags = Boolean(options.hazardousFlags);
  const movingTargets = Boolean(options.movingTargets);

  goals.forEach((goal, index) => {
    const key = `${goal.x},${goal.y}`;
    const tile = next.get(key) ?? { x: goal.x, y: goal.y, features: [] };

    if (!hazardousFlags) {
      tile.features = tile.features.filter((feature) => (
        isCheckpointActiveFeature(feature, { movingTargets })
      ));
    }
    tile.features = tile.features.filter((feature) => feature.type !== "checkpoint");
    tile.features.push({
      type: "checkpoint",
      id: index + 1
    });

    next.set(key, tile);
  });

  return next;
}

export function getPlayableCheckpoints(checkpoints = [], virtualBots = false) {
  return virtualBots ? checkpoints.slice(1) : checkpoints;
}

export function filterStartsForGoals(starts, goals) {
  const goalKeys = new Set((goals || []).map((goal) => `${goal.x},${goal.y}`));
  return (starts || []).filter((start) => !goalKeys.has(`${start.x},${start.y}`));
}
