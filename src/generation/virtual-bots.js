// Robo Rally Course Randomizer - Virtual Bots: entry point and facing, virtual robot starts
import { getFlagCandidateAreaPenalty } from "./checkpoints.js";
import {
  CARDINAL_DIRS,
  VIRTUAL_BOT_AUTOKILL_FEATURE_TYPES,
  VIRTUAL_BOT_EDGE_PROXIMITY_PENALTY,
  VIRTUAL_BOT_FACING_LOOKAHEAD,
  VIRTUAL_BOT_FORWARD_DANGER_PENALTY
} from "./config.js";
import { cloneTileMap, getOppositeSide } from "./layout-geometry.js";
import { isBlockedBetween } from "./moving-targets.js";
import { isNoDockStartTileClear } from "./no-docks.js";
import { getTuningDifficulty } from "./preferences.js";
import { sampleManyWeighted } from "./random.js";

export function pickVirtualBotEntry(flagCandidates, tileMap, boardPlacements, pieceMap, preferences = {}) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const eligible = flagCandidates
    .filter((candidate) => isNoDockStartTileClear(tileMap.get(`${candidate.x},${candidate.y}`)))
    .filter((candidate) => getVirtualBotEntryDirections(tileMap, candidate).length > 0)
    .map((candidate) => {
      // Borrow only the checkpoint sampler's nearby-area hazard preference. The
      // entry square itself is already required to be clear, and route geometry
      // is deliberately not used to turn this into a checkpoint-like target.
      const areaPenalty = getFlagCandidateAreaPenalty(
        candidate,
        tileMap,
        difficulty,
        preferences
      );
      const baseWeight = Math.max(0.05, Number(candidate.weight) || 1);
      return {
        ...candidate,
        weight: Math.max(0.01, baseWeight / (1 + areaPenalty))
      };
    });
  return sampleManyWeighted(eligible, 1)[0] ?? null;
}

export function hideVirtualFlagZeroFeature(tileMap, flagZero) {
  if (!flagZero) return tileMap;
  const next = cloneTileMap(tileMap);
  const key = `${flagZero.x},${flagZero.y}`;
  const tile = next.get(key);
  if (tile) {
    tile.features = (tile.features || []).filter((feature) => feature.type !== "checkpoint");
    next.set(key, tile);
  }
  return next;
}

export function getVirtualBotEntryDirections(tileMap, point) {
  return Object.entries(CARDINAL_DIRS).filter(([dir, d]) => {
    const to = { x: point.x + d.dx, y: point.y + d.dy };
    const toTile = tileMap.get(`${to.x},${to.y}`);
    if (!toTile) return false;
    if (isBlockedBetween(tileMap, point, to, dir)) return false;
    return !(toTile.features || []).some((feature) => (
      VIRTUAL_BOT_AUTOKILL_FEATURE_TYPES.has(feature.type)
    ));
  }).map(([dir]) => dir);
}

export function getVirtualBotForwardDangerPenalty(tileMap, point, dir) {
  const delta = CARDINAL_DIRS[dir];
  if (!delta) return 0;

  let previous = { x: point.x, y: point.y };
  for (let distance = 1; distance <= VIRTUAL_BOT_FACING_LOOKAHEAD; distance += 1) {
    const next = {
      x: point.x + delta.dx * distance,
      y: point.y + delta.dy * distance
    };

    // An adjacent wall is already a hard exclusion. Farther walls simply end
    // this straight-ahead look; hazards beyond them should not bias facing.
    if (isBlockedBetween(tileMap, previous, next, dir)) {
      return 0;
    }

    const tile = tileMap.get(`${next.x},${next.y}`);
    if (!tile) {
      return distance === 1
        ? Infinity
        : (VIRTUAL_BOT_FORWARD_DANGER_PENALTY[distance] ?? 0);
    }
    if ((tile.features || []).some((feature) => (
      VIRTUAL_BOT_AUTOKILL_FEATURE_TYPES.has(feature.type)
    ))) {
      return distance === 1
        ? Infinity
        : (VIRTUAL_BOT_FORWARD_DANGER_PENALTY[distance] ?? 0);
    }

    previous = next;
  }

  return 0;
}

export function getVirtualBotCourseEdgeDistance(tileMap, point, dir) {
  const delta = CARDINAL_DIRS[dir];
  if (!delta) return null;

  for (let distance = 1; distance <= VIRTUAL_BOT_FACING_LOOKAHEAD; distance += 1) {
    const tile = tileMap.get(`${point.x + delta.dx * distance},${point.y + delta.dy * distance}`);
    if (!tile) return distance;
  }

  return null;
}

export function getVirtualBotCourseEdgeOrientationPenalty(tileMap, point, facing) {
  let penalty = 0;

  for (const edgeDir of Object.keys(CARDINAL_DIRS)) {
    const distance = getVirtualBotCourseEdgeDistance(tileMap, point, edgeDir);
    if (!distance) continue;
    const proximityPenalty = VIRTUAL_BOT_EDGE_PROXIMITY_PENALTY[distance] ?? 0;
    if (!proximityPenalty) continue;

    if (facing === edgeDir) {
      // Facing toward a nearby exposed edge should look less natural even when
      // a wall or another local detail prevents the edge from being an immediate
      // crash. Straight-ahead void also receives the danger penalty above.
      penalty += proximityPenalty;
    } else if (facing !== getOppositeSide(edgeDir)) {
      // A sideways-facing robot on an exposed edge is legal, but players tend
      // to expect edge starts to face inward. Fade that preference with depth.
      penalty += proximityPenalty * 0.45;
    }
  }

  return penalty;
}

export function pickVirtualBotEntryFacing(tileMap, point) {
  const weightedDirections = getVirtualBotEntryDirections(tileMap, point)
    .map((dir) => {
      const penalty = (
        getVirtualBotForwardDangerPenalty(tileMap, point, dir) +
        getVirtualBotCourseEdgeOrientationPenalty(tileMap, point, dir)
      );
      return {
        dir,
        weight: Number.isFinite(penalty) ? 1 / (1 + penalty) : 0
      };
    })
    .filter((entry) => entry.weight > 0);

  return sampleManyWeighted(weightedDirections, 1)[0]?.dir ?? null;
}

export function buildVirtualRobotStarts(flagZero, playerCount = 4, startupSpinUp = false) {
  if (!flagZero) return [];
  return Array.from({ length: Math.max(1, playerCount) }, (_, index) => ({
    x: flagZero.x,
    y: flagZero.y,
    ...(startupSpinUp ? {} : { facing: flagZero.facing ?? "E" }),
    virtualRobotIndex: index
  }));
}
