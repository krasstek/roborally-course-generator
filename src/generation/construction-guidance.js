// Robo Rally Course Randomizer - construction guidance: calibrated predictions and ranking of board and checkpoint proposals
//
// Calibration schema 3 (tools/calibration-fit-guidance.R) predicts, at each
// construction stage, the units production accepts on: difficulty in RE per
// programming turn and length in wall-clock turns (both fitted on a log scale),
// route work in expansions, and (before boards) the chance the construction
// survives to a finished course. Rule variants enter as their measured
// same-course effects; layout variants are model terms.
//
// Guidance is soft: it ranks proposals and tilts variant chances, it never makes
// a construction illegal. It starts mild and leans harder after each attempt that
// misses the requested bands, learning from those misses which way it is off
// (see getConstructionGuidanceFeedback).
import { VARIANT_DEFINITIONS } from "../../variants.js";
import {
  buildCalibrationConstructionSnapshot,
  getCalibrationExpansionIds,
  summarizeCalibrationBoardProfiles,
  summarizeCalibrationLayout
} from "./calibration-features.js";
import {
  CONSTRUCTION_GUIDANCE_STAGE_POLICIES,
  getConstructionGuidanceModePolicy
} from "./generation-modes.js";
import { clamp } from "../shared/math.js";
import { getSelectedExpansionIds, normalizeBoardSpread } from "./preferences.js";
import { sample, sampleManyWeighted } from "./random.js";
import { getDifficultyThresholds, getProductionLengthThresholds } from "./targets.js";
import { getMinimumSmallOnlyBoardCount } from "./variant-availability.js";

// Rule variants need this many paired observations before their effect is used.
const MIN_RULE_VARIANT_EFFECT_SAMPLES = 5;
// Feedback: misses are averaged with this many phantom zero-residual courses, so
// one surprising course moves the correction only partly.
const FEEDBACK_SHRINKAGE_COURSES = 2;
// Variant tilt: how strongly a variant's predicted move toward (or away from) the
// requested bands changes its chance, at the first attempt and per missed course.
const VARIANT_TILT_BASE_STRENGTH = 0.15;
const VARIANT_TILT_STRENGTH_PER_MISS = 0.1;
const VARIANT_TILT_RANGE = Object.freeze([0.1, 3]);

const OUTCOMES = Object.freeze({
  difficulty: getDifficultyThresholds,
  length: getProductionLengthThresholds
});

// ---- Inputs ----------------------------------------------------------------------

export function getConstructionGuidanceInventoryPreset(calibration, preferences = {}, pieceMap = {}) {
  const supported = new Set(calibration?.domain?.inventoryPresets ?? []);
  if (!supported.size) return null;

  const selected = [...getSelectedExpansionIds(preferences)].sort();
  const all = getCalibrationExpansionIds(pieceMap);
  const sameIds = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );

  if (supported.has("all") && sameIds(selected, all)) return "all";
  if (selected.length === 1) {
    if (selected[0] === "roborally" && supported.has("core")) return "core";
    const smallPreset = `small:${selected[0]}`;
    if (supported.has(smallPreset)) return smallPreset;
  }
  if (selected.length === 2 && selected.includes("roborally")) {
    const preset = `core+${selected.find((id) => id !== "roborally")}`;
    if (supported.has(preset)) return preset;
  }
  // Collections the calibration did not sample directly (three or more sets) are
  // closest to the everything-owned preset.
  if (selected.length > 2 && selected.includes("roborally") && supported.has("all")) return "all";
  return null;
}

// The variant rules active for a construction, as calibration recorded them.
export function getConstructionGuidanceActiveVariantIds(preferences = {}) {
  const recoveryRule = preferences.recoveryRule ?? null;
  return VARIANT_DEFINITIONS.map((variant) => variant.id).filter((id) => (
    Boolean(preferences[id]) ||
    (id === "dynamicArchiving" && recoveryRule === "dynamic_archiving") ||
    (id === "homeReboot" && recoveryRule === "home_reboot")
  ));
}

function getBaseFeatures(calibration, preferences, pieceMap, boardCount, flagCount) {
  const inventory = getConstructionGuidanceInventoryPreset(calibration, preferences, pieceMap);
  const players = Number(preferences.playerCount);
  if (!inventory || !Number.isFinite(players) || !Number.isFinite(Number(boardCount)) || !Number.isFinite(Number(flagCount))) {
    return null;
  }
  const features = {
    players: String(players),
    boards: String(Number(boardCount)),
    flags: String(Number(flagCount)),
    spread: normalizeBoardSpread(preferences.boardSpread),
    inventory
  };
  const active = new Set(getConstructionGuidanceActiveVariantIds(preferences));
  for (const variant of VARIANT_DEFINITIONS) features[`v_${variant.id}`] = active.has(variant.id) ? 1 : 0;
  return features;
}

function getBoardFeatures(boardPlacements = [], pieceMap = {}) {
  const profiles = summarizeCalibrationBoardProfiles(boardPlacements, pieceMap).means;
  const layout = summarizeCalibrationLayout(boardPlacements, pieceMap);
  return {
    profile_overall: profiles.overall,
    profile_hazard: profiles.hazard,
    profile_congestion: profiles.congestion,
    profile_complexity: profiles.complexity,
    profile_swinginess: profiles.swinginess,
    profile_density: profiles.density,
    compactness: layout.compactness,
    adjacency: layout.adjacencyCount,
    diameter: layout.graphDiameter
  };
}

// Same snapshot calibration records, so the features match the fit exactly.
function getCheckpointFeatures(context) {
  const snapshot = buildCalibrationConstructionSnapshot(context);
  const shape = snapshot?.shape ?? {};
  const pick = (primary, fallback) => (Number.isFinite(primary) ? primary : fallback);
  return {
    overlay_boards: snapshot?.overlayBoardCount,
    overlay_tiles: snapshot?.overlayTileCount,
    first_distance: pick(shape.firstStartStaticMean, shape.firstStartManhattanMean),
    sequential_distance: pick(shape.sequentialStaticSum, shape.sequentialManhattanSum),
    final_distance: pick(shape.finalStaticDistance, shape.finalManhattan),
    convergence: shape.convergenceMean,
    board_depth: shape.boardDepthMean,
    represented_boards: shape.representedBoardCount,
    shallow_checkpoints: shape.shallowCheckpointCount
  };
}

// ---- Models ----------------------------------------------------------------------

function getFactorContribution(factor, rawLevel, name) {
  const index = factor.levels.indexOf(String(rawLevel));
  if (index >= 0) return factor.coefficients[index];
  // Player count may fall between calibrated levels; interpolate inside the range.
  if (name !== "players") return null;
  const requested = Number(rawLevel);
  const numeric = factor.levels.map((level, levelIndex) => ({ value: Number(level), coefficient: factor.coefficients[levelIndex] }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => left.value - right.value);
  for (let index = 1; index < numeric.length; index += 1) {
    const lower = numeric[index - 1];
    const upper = numeric[index];
    if (requested < lower.value || requested > upper.value) continue;
    const fraction = (requested - lower.value) / (upper.value - lower.value);
    return lower.coefficient + (upper.coefficient - lower.coefficient) * fraction;
  }
  return null;
}

// Linear predictor of one model, or null when an input is outside what it knows.
export function evaluateConstructionGuidanceModel(model, features = {}) {
  if (!model) return null;
  let linearPredictor = model.intercept;
  for (const [name, factor] of Object.entries(model.factors)) {
    const contribution = getFactorContribution(factor, features[name], name);
    if (!Number.isFinite(contribution)) return null;
    linearPredictor += contribution;
  }
  for (const [name, coefficient] of Object.entries(model.numeric)) {
    const value = Number(features[name]);
    if (!Number.isFinite(value)) return null;
    linearPredictor += coefficient * value;
  }
  return linearPredictor;
}

// Summed paired log effect of the active rule variants (the fit's offset).
function getRuleVariantLogOffset(calibration, activeIds, outcome) {
  let offset = 0;
  for (const id of activeIds) {
    const effect = calibration.ruleVariantEffects[id]?.[`${outcome}Log`];
    if (effect && effect.n >= MIN_RULE_VARIANT_EFFECT_SAMPLES) offset += effect.mean;
  }
  return offset;
}

// Chance that rule variants leave a built course routable, from paired switches.
function getRuleVariantSurvival(calibration, activeIds) {
  let survival = 1;
  for (const id of activeIds) {
    const rate = calibration.ruleVariantEffects[id]?.failureRateWhenSwitchedOn;
    if (Number.isFinite(rate)) survival *= 1 - clamp(rate, 0, 0.95);
  }
  return survival;
}

// Per-run correction learned from analysed candidates (log scale).
export function getConstructionGuidanceFeedback(preferences = {}) {
  const feedback = preferences.generationGuidanceFeedback ?? null;
  return {
    difficultyLogShift: Number(feedback?.difficultyLogShift) || 0,
    lengthLogShift: Number(feedback?.lengthLogShift) || 0,
    misses: Math.max(0, Number(feedback?.misses) || 0)
  };
}

// Folds one analysed course into the run's feedback: its log residual against
// the checkpoints-known prediction (without the shift that prediction already
// carried), and whether it missed a requested band. The shift is the mean
// residual shrunk toward zero by FEEDBACK_SHRINKAGE_COURSES.
export function updateConstructionGuidanceFeedback(feedback = null, prediction = null, metrics = null, preferences = {}) {
  const next = {
    observations: feedback?.observations ?? 0,
    misses: feedback?.misses ?? 0,
    difficultyResidualSum: feedback?.difficultyResidualSum ?? 0,
    lengthResidualSum: feedback?.lengthResidualSum ?? 0
  };
  const actual = {
    difficulty: Number(metrics?.difficultyTurnRE),
    length: Number(metrics?.lengthWallClockTurnIndex)
  };
  if (!(actual.difficulty > 0) || !(actual.length > 0)) return feedback;
  const used = prediction?.feedback ?? {};
  const predictedDifficulty = Number(prediction?.difficulty?.logPrediction) - (Number(used.difficultyLogShift) || 0);
  const predictedLength = Number(prediction?.length?.logPrediction) - (Number(used.lengthLogShift) || 0);
  if (Number.isFinite(predictedDifficulty) && Number.isFinite(predictedLength)) {
    next.observations += 1;
    next.difficultyResidualSum += Math.log(actual.difficulty) - predictedDifficulty;
    next.lengthResidualSum += Math.log(actual.length) - predictedLength;
  }
  const missed = Object.entries(OUTCOMES).some(([outcome, thresholds]) => {
    const band = targetPreference(preferences, outcome);
    if (!band || band === "any" || !thresholds()[band]) return false;
    const [low, high] = thresholds()[band];
    return actual[outcome] < low || actual[outcome] >= high;
  });
  if (missed) next.misses += 1;
  const denominator = next.observations + FEEDBACK_SHRINKAGE_COURSES;
  next.difficultyLogShift = next.difficultyResidualSum / denominator;
  next.lengthLogShift = next.lengthResidualSum / denominator;
  return next;
}

function makeOutcomePrediction(model, linearPredictor) {
  const value = Math.exp(linearPredictor);
  const rmse = model.evidence.heldOutRmse;
  const lowerOffset = Number.isFinite(model.evidence.signedP05) ? model.evidence.signedP05 : -2 * rmse;
  const upperOffset = Number.isFinite(model.evidence.signedP95) ? model.evidence.signedP95 : 2 * rmse;
  return {
    raw: Number(value.toFixed(2)),
    logPrediction: linearPredictor,
    rmse,
    rSquared: model.evidence.heldOutRSquared ?? null,
    sampleSize: model.evidence.n ?? null,
    interval: {
      low: Number(Math.exp(linearPredictor + lowerOffset).toFixed(2)),
      high: Number(Math.exp(linearPredictor + upperOffset).toFixed(2)),
      lowerOffset,
      upperOffset
    }
  };
}

export function predictConstructionGuidanceStage(
  calibration,
  stage,
  {
    preferences = {},
    pieceMap = {},
    boardCount = null,
    flagCount = null,
    boardPlacements = [],
    dockPlacements = [],
    overlayPlacements = [],
    checkpoints = [],
    starts = [],
    tileMap = new Map()
  } = {}
) {
  const models = calibration?.stages?.[stage];
  if (!models) return null;
  const resolvedBoardCount = Number.isFinite(Number(boardCount)) ? Number(boardCount) : boardPlacements.length;
  const resolvedFlagCount = Number.isFinite(Number(flagCount)) ? Number(flagCount) : checkpoints.length;
  const baseFeatures = getBaseFeatures(calibration, preferences, pieceMap, resolvedBoardCount, resolvedFlagCount);
  if (!baseFeatures) return null;
  const features = { ...baseFeatures };
  if (stage === "boardsKnown" || stage === "checkpointsKnown") {
    Object.assign(features, getBoardFeatures(boardPlacements, pieceMap));
  }
  if (stage === "checkpointsKnown") {
    Object.assign(features, getCheckpointFeatures({
      boardPlacements, dockPlacements, overlayPlacements, checkpoints, starts, tileMap, pieceMap, preferences
    }));
  }

  const activeIds = getConstructionGuidanceActiveVariantIds(preferences);
  const feedback = getConstructionGuidanceFeedback(preferences);
  const predictOutcome = (outcome) => {
    const linear = evaluateConstructionGuidanceModel(models[outcome], features);
    if (!Number.isFinite(linear)) return null;
    const shift = outcome === "difficulty" ? feedback.difficultyLogShift : feedback.lengthLogShift;
    return makeOutcomePrediction(models[outcome], linear + getRuleVariantLogOffset(calibration, activeIds, outcome) + shift);
  };
  const difficulty = predictOutcome("difficulty");
  const length = predictOutcome("length");
  const routeLinear = evaluateConstructionGuidanceModel(models.routeCost, features);
  if (!difficulty || !length || !Number.isFinite(routeLinear)) return null;

  let structuralSuccessProbability = null;
  if (models.structuralSuccess) {
    const linear = evaluateConstructionGuidanceModel(models.structuralSuccess, features);
    if (Number.isFinite(linear)) {
      const probability = linear >= 0 ? 1 / (1 + Math.exp(-linear)) : Math.exp(linear) / (1 + Math.exp(linear));
      structuralSuccessProbability = clamp(probability * getRuleVariantSurvival(calibration, activeIds), 0, 1);
    }
  }

  const routeEvidence = models.routeCost.evidence;
  const routeP95 = Number.isFinite(routeEvidence.signedP95)
    ? Math.max(0, Math.expm1(routeLinear + routeEvidence.signedP95))
    : null;
  return {
    stage,
    inventoryPreset: baseFeatures.inventory,
    boardCount: resolvedBoardCount,
    flagCount: resolvedFlagCount,
    length,
    difficulty,
    routeCost: {
      predictedExpansions: Math.round(Math.max(0, Math.expm1(routeLinear))),
      log1pPrediction: routeLinear,
      rmseLog: routeEvidence.heldOutRmse ?? null,
      signedP95LogResidual: routeEvidence.signedP95 ?? null,
      p95Expansions: Number.isFinite(routeP95) ? Math.round(routeP95) : null,
      rSquared: routeEvidence.heldOutRSquared ?? null,
      sampleSize: routeEvidence.n ?? null
    },
    structuralSuccessProbability: Number.isFinite(structuralSuccessProbability)
      ? Number(structuralSuccessProbability.toFixed(4))
      : null,
    feedback,
    features
  };
}

// ---- Target fit -------------------------------------------------------------------

function getLogBandDistance(logValue, band, thresholds) {
  const [low, high] = thresholds[band];
  const logLow = low > 0 ? Math.log(low) : -Infinity;
  const logHigh = Number.isFinite(high) ? Math.log(high) : Infinity;
  if (logValue < logLow) return logLow - logValue;
  if (logValue >= logHigh) return logValue - logHigh;
  return 0;
}

// Gaussian fit of the predicted value to the requested band, on the log scale the
// model's error lives on: 1 inside the band, falling with distance in RMSEs.
export function getConstructionGuidanceBandScore(outcomePrediction, preference, thresholds) {
  if (!preference || preference === "any") return 1;
  if (!outcomePrediction || !thresholds?.[preference]) return 0;
  const distance = getLogBandDistance(outcomePrediction.logPrediction, preference, thresholds);
  const rmse = Number(outcomePrediction.rmse);
  if (!Number.isFinite(distance) || !(rmse > 0)) return 0;
  const z = distance / rmse;
  return Math.exp(-0.5 * z * z);
}

export function getMedianFinite(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const targetPreference = (preferences, outcome) => {
  if (outcome === "difficulty" && preferences.targetGuidanceOnlyDifficulty) return "any";
  if (outcome === "length" && preferences.targetGuidanceOnlyLength) return "any";
  return preferences[outcome];
};

export function getConstructionGuidancePredictionSignals(prediction, preferences = {}) {
  if (!prediction) {
    return {
      targetDesirability: 1,
      lengthDesirability: 1,
      difficultyDesirability: 1,
      structuralSuccessModifier: 1,
      predictedRouteExpansions: null,
      p95RouteExpansions: null,
      routeSignedP95LogResidual: null
    };
  }
  const lengthDesirability = getConstructionGuidanceBandScore(prediction.length, preferences.length, getProductionLengthThresholds());
  const difficultyDesirability = getConstructionGuidanceBandScore(prediction.difficulty, preferences.difficulty, getDifficultyThresholds());
  const structuralSuccessModifier = Number.isFinite(prediction.structuralSuccessProbability)
    ? 0.55 + prediction.structuralSuccessProbability * 0.45
    : 1;
  return {
    targetDesirability: Math.max(1e-6, lengthDesirability * difficultyDesirability),
    lengthDesirability,
    difficultyDesirability,
    structuralSuccessModifier,
    predictedRouteExpansions: prediction.routeCost?.predictedExpansions ?? null,
    p95RouteExpansions: prediction.routeCost?.p95Expansions ?? null,
    routeSignedP95LogResidual: prediction.routeCost?.signedP95LogResidual ?? null
  };
}

// ---- Ranking ----------------------------------------------------------------------

export function applyConstructionGuidanceRanking(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return [];
  const policy = getConstructionGuidanceModePolicy(preferences);
  const predictionKey = options.predictionKey ?? "prediction";
  const routeReference = getMedianFinite(candidates.map((candidate) => (
    getConstructionGuidancePredictionSignals(candidate[predictionKey], preferences).predictedRouteExpansions
  )));

  const scored = candidates.map((candidate) => {
    const prediction = candidate[predictionKey];
    const signals = getConstructionGuidancePredictionSignals(prediction, preferences);
    const stagePolicy = CONSTRUCTION_GUIDANCE_STAGE_POLICIES[prediction?.stage] ??
      CONSTRUCTION_GUIDANCE_STAGE_POLICIES.checkpointsKnown;
    const rankingTargetDesirability = Number.isFinite(Number(candidate.rankingTargetDesirability))
      ? Number(candidate.rankingTargetDesirability)
      : signals.targetDesirability;

    // Weak early target evidence is blended toward neutral, so a small band-fit
    // score cannot dominate board and flag counts.
    const targetBase = 1 - stagePolicy.targetBlend + stagePolicy.targetBlend * Math.max(1e-6, rankingTargetDesirability);
    const targetComponent = Math.pow(Math.max(1e-6, targetBase), policy.calibrationStrength);
    const effectiveRouteWorkPressure = policy.routeWorkPressure * stagePolicy.routeWorkMultiplier;
    const effectiveTailRiskPressure = (policy.routeWorkTailRiskPressure ?? 0) * (stagePolicy.routeWorkTailRiskMultiplier ?? 0);
    let workComponent = 1;
    let tailRiskComponent = 1;
    if (
      effectiveRouteWorkPressure > 0 &&
      routeReference > 0 &&
      signals.predictedRouteExpansions > 0
    ) {
      // Relative work keeps the policy meaningful across board sizes and machines;
      // expensive proposals are only de-prioritized.
      workComponent = Math.pow(clamp(routeReference / signals.predictedRouteExpansions, 0.25, 4), effectiveRouteWorkPressure);
    }
    if (
      effectiveTailRiskPressure > 0 &&
      routeReference > 0 &&
      signals.p95RouteExpansions > routeReference
    ) {
      tailRiskComponent = Math.pow(1 / clamp(signals.p95RouteExpansions / routeReference, 1, 24), effectiveTailRiskPressure);
    }
    const calibratedScore = targetComponent * signals.structuralSuccessModifier * workComponent * tailRiskComponent;
    return {
      ...candidate,
      calibrationSignals: {
        ...signals,
        routeReference,
        stageTargetBlend: stagePolicy.targetBlend,
        rankingTargetDesirability,
        targetComponent,
        effectiveRouteWorkPressure,
        workComponent,
        effectiveTailRiskPressure,
        tailRiskComponent,
        calibratedScore
      }
    };
  });

  const maxScore = Math.max(...scored.map((candidate) => Number(candidate.calibrationSignals?.calibratedScore) || 0), 1e-9);
  return scored.map((candidate) => {
    const normalized = clamp((Number(candidate.calibrationSignals?.calibratedScore) || 0) / maxScore, 0, 1);
    // explorationFloor is the randomizer tail: every proposal keeps some weight.
    const weight = policy.explorationFloor + (1 - policy.explorationFloor) * normalized;
    return { ...candidate, weight: Math.max(1e-6, weight) };
  });
}

export function sampleConstructionGuidanceRankedCandidate(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return null;
  const ranked = applyConstructionGuidanceRanking(candidates, preferences, options);
  return sampleManyWeighted(ranked, 1)[0] ?? sample(ranked);
}

// ---- Early checkpoint gate ------------------------------------------------------------

export function getConstructionGuidanceIntervalMismatch(outcomePrediction, preference, thresholds, metric) {
  if (!preference || preference === "any" || !outcomePrediction || !thresholds?.[preference]) return null;
  const [low, high] = thresholds[preference];
  const predictedLow = Number(outcomePrediction.interval?.low);
  const predictedHigh = Number(outcomePrediction.interval?.high);
  if (!Number.isFinite(predictedLow) || !Number.isFinite(predictedHigh)) return null;
  const mismatch = (direction, boundary) => ({
    metric,
    direction,
    requested: preference,
    predicted: outcomePrediction.raw,
    predictedLow,
    predictedHigh,
    boundary
  });
  if (Number.isFinite(low) && predictedHigh < low) return mismatch("low", low);
  if (Number.isFinite(high) && predictedLow >= high) return mismatch("high", high);
  return null;
}

// A checkpoint proposal whose whole 5-95% interval misses a requested band.
export function getConstructionGuidanceGrossMismatch(prediction, preferences = {}) {
  if (!prediction) return { abort: false, mismatches: [] };
  const mismatches = Object.entries(OUTCOMES).map(([outcome, thresholds]) => (
    getConstructionGuidanceIntervalMismatch(prediction[outcome], targetPreference(preferences, outcome), thresholds(), outcome)
  )).filter(Boolean);
  return { abort: mismatches.length > 0, mismatches };
}

// ---- Board and flag counts ---------------------------------------------------------

export function getCalibratedConstructionPlan(
  maxBoards,
  hasLargeBoards,
  preferences = {},
  pieceMap = {},
  calibration = null
) {
  const explicitBoardCount = Number(preferences.calibrationBoardCount);
  const explicitFlagCount = Number(preferences.calibrationFlagCount);
  if (
    !calibration?.stages?.countsKnown ||
    (Number.isInteger(explicitBoardCount) && explicitBoardCount > 0) ||
    (Number.isInteger(explicitFlagCount) && explicitFlagCount > 0)
  ) {
    return null;
  }

  const minimumBoardCount = Math.max(
    hasLargeBoards ? 1 : getMinimumSmallOnlyBoardCount(),
    preferences.sandwichedDock ? 2 : 1
  );
  const boardCounts = calibration.domain.boardCounts
    .filter((count) => Number.isInteger(count) && count >= minimumBoardCount && count <= maxBoards)
    .sort((left, right) => left - right);
  const flagCounts = calibration.domain.flagCounts
    .filter((count) => Number.isInteger(count) && count >= 1)
    .sort((left, right) => left - right);
  if (!boardCounts.length || !flagCounts.length) return null;
  // Do not extrapolate the board-count factor past what calibration sampled.
  if (!hasLargeBoards && maxBoards > Math.max(...calibration.domain.boardCounts)) return null;

  const candidates = [];
  for (const boardCount of boardCounts) {
    for (const flagCount of flagCounts) {
      const prediction = predictConstructionGuidanceStage(calibration, "countsKnown", {
        preferences,
        pieceMap,
        boardCount,
        flagCount
      });
      if (!prediction) continue;
      const signals = getConstructionGuidancePredictionSignals(prediction, preferences);
      candidates.push({
        boardCount,
        flagCount,
        stage: "countsKnown",
        inventoryPreset: prediction.inventoryPreset,
        predictedLengthRaw: prediction.length.raw,
        predictedDifficultyRaw: prediction.difficulty.raw,
        lengthDesirability: Number(signals.lengthDesirability.toFixed(4)),
        difficultyDesirability: Number(signals.difficultyDesirability.toFixed(4)),
        targetDesirability: Number(signals.targetDesirability.toFixed(4)),
        structuralSuccessProbability: prediction.structuralSuccessProbability,
        predictedRouteExpansions: prediction.routeCost.predictedExpansions,
        lengthRmse: prediction.length.rmse,
        difficultyRmse: prediction.difficulty.rmse,
        routeCostRmseLog: prediction.routeCost.rmseLog,
        sampleSize: prediction.length.sampleSize,
        prediction
      });
    }
  }
  if (!candidates.length) return null;

  // More flags correlate with longer courses in the samples; do not turn that into
  // an instruction to add flags for Long. Target fit is averaged over flag counts
  // per board count, so it steers board scale; flag count follows work and
  // structural success.
  const targetByBoardCount = new Map();
  for (const boardCount of boardCounts) {
    const group = candidates.filter((candidate) => candidate.boardCount === boardCount);
    if (group.length) {
      targetByBoardCount.set(boardCount, group.reduce((sum, candidate) => sum + candidate.targetDesirability, 0) / group.length);
    }
  }
  const selected = sampleConstructionGuidanceRankedCandidate(
    candidates.map((candidate) => ({
      ...candidate,
      rankingTargetDesirability: targetByBoardCount.get(candidate.boardCount) ?? candidate.targetDesirability
    })),
    preferences,
    { predictionKey: "prediction" }
  );
  if (!selected) return null;
  const { prediction, calibrationSignals, weight, rankingTargetDesirability, ...plan } = selected;
  return {
    ...plan,
    ranking: calibrationSignals
      ? {
        routeReference: calibrationSignals.routeReference,
        workComponent: calibrationSignals.workComponent,
        calibratedScore: calibrationSignals.calibratedScore,
        samplingWeight: weight
      }
      : null
  };
}

// ---- Variant selection --------------------------------------------------------------

// Log-scale centre of a requested band; open-ended bands use a point just inside.
function getLogBandCentre(thresholds, band) {
  const [low, high] = thresholds[band] ?? [];
  if (!Number.isFinite(high)) return Number.isFinite(low) && low > 0 ? Math.log(low * 1.15) : null;
  if (!(low > 0)) return Math.log(high * 0.85);
  return (Math.log(low) + Math.log(high)) / 2;
}

// Chance multipliers for the optional variants, from how each one is predicted to
// move difficulty and length relative to the requested bands. Before boards are
// known the course is predicted over every board and flag count; the multiplier
// rewards a variant whose effect closes the gap to the band centres and penalises
// one that widens it, scaled by the model's own error. Strength grows with misses
// in this run. Returns null (neutral) when calibration cannot judge the setup.
export function getConstructionGuidanceVariantTilts(calibration, preferences = {}, candidateIds = [], pieceMap = {}) {
  const models = calibration?.stages?.countsKnown;
  if (!models || !candidateIds.length) return null;
  const outcomes = Object.keys(OUTCOMES).filter((outcome) => {
    const preference = targetPreference(preferences, outcome);
    return preference && preference !== "any";
  });
  if (!outcomes.length) return null;

  const gaps = {};
  const variances = {};
  for (const outcome of outcomes) {
    const centre = getLogBandCentre(OUTCOMES[outcome](), preferences[outcome]);
    const predictions = [];
    for (const boardCount of calibration.domain.boardCounts) {
      for (const flagCount of calibration.domain.flagCounts) {
        const prediction = predictConstructionGuidanceStage(calibration, "countsKnown", {
          preferences, pieceMap, boardCount, flagCount
        });
        if (prediction) predictions.push(prediction[outcome].logPrediction);
      }
    }
    if (!predictions.length || !Number.isFinite(centre)) return null;
    gaps[outcome] = centre - predictions.reduce((sum, value) => sum + value, 0) / predictions.length;
    variances[outcome] = Math.max(1e-4, models[outcome].evidence.heldOutRmse ** 2);
  }

  const effectOf = (variantId, outcome) => {
    const rule = calibration.ruleVariantEffects[variantId]?.[`${outcome}Log`];
    if (rule && rule.n >= MIN_RULE_VARIANT_EFFECT_SAMPLES) return rule.mean;
    return Number(models[outcome].numeric[`v_${variantId}`]) || 0;
  };
  const { misses } = getConstructionGuidanceFeedback(preferences);
  const strength = VARIANT_TILT_BASE_STRENGTH + VARIANT_TILT_STRENGTH_PER_MISS * misses;
  const tilts = {};
  for (const variantId of candidateIds) {
    // Improvement of squared distance to the band centre, in model variances.
    let improvement = 0;
    for (const outcome of outcomes) {
      const effect = effectOf(variantId, outcome);
      improvement += (2 * gaps[outcome] * effect - effect * effect) / variances[outcome];
    }
    tilts[variantId] = clamp(Math.exp(strength * improvement), VARIANT_TILT_RANGE[0], VARIANT_TILT_RANGE[1]);
  }
  return tilts;
}

export function guidanceLevelForAttempt(attempt) {
  if (attempt >= 36) return 2;
  if (attempt >= 13) return 1;
  return 0;
}
