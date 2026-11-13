// Robo Rally Course Randomizer - preflight gate (ROADMAP D5). Right after the
// quick course preflight, the fitted model (calibration/preflight-gate.json,
// from tools/preflight-fit.R on scripts/preflight-study.mjs data) predicts the
// chance that this attempt ends as an acceptable course. Attempts below the
// mode's threshold stop there, before full routing, which is where most of a
// rejected attempt's time goes. The features must match tools/preflight-fit.R.
import { getDifficultyThresholds, getProductionLengthThresholds } from "./targets.js";
import { getNearestTargetBandForLog } from "./target-selection.js";

// Chance below which an attempt stops after the preflight. Fit 2026-11-09
// (900 attempts, out-of-fold): 0.02 stops ~47% of attempts and saves ~31% of
// attempt time for ~2.5% of acceptable attempts; 0.01: ~27% saved for ~1%.
// The thorough modes keep more of the borderline ones.
export const PREFLIGHT_GATE_THRESHOLDS = {
  fastest: 0.02,
  fast: 0.02,
  standard: 0.02,
  balanced: 0.01,
  thorough: 0.01
};

function logBand([low, high]) {
  return [low > 0 ? Math.log(low) : -Infinity, Number.isFinite(high) ? Math.log(high) : Infinity];
}

function bandGap(predictedLog, band) {
  if (!band || !Number.isFinite(predictedLog)) return null;
  const [low, high] = logBand(band);
  if (predictedLog < low) return low - predictedLog;
  if (predictedLog > high) return predictedLog - high;
  return 0;
}

function linear(coefficients, features) {
  let sum = Number(coefficients["(Intercept)"]) || 0;
  for (const [name, weight] of Object.entries(coefficients)) {
    if (name === "(Intercept)") continue;
    const value = features[name];
    if (!Number.isFinite(value)) return null;
    sum += Number(weight) * value;
  }
  return sum;
}

// inputs: { preferences, preflightMetrics, preflight (sequence result),
//   guidance (checkpointsKnown prediction), boards, checkpoints, sourceStarts,
//   variantCount }. Returns { probability, threshold, stop, features } or null
// when the gate has no model or the inputs are incomplete.
export function evaluatePreflightGate(gate, inputs) {
  if (!gate?.acceptable || !gate?.difficulty || !gate?.length) return null;
  const { preferences = {}, preflightMetrics, preflight, guidance } = inputs;
  const difficultyRaw = Number(preflightMetrics?.difficultyRaw);
  const lengthRaw = Number(preflightMetrics?.lengthRaw);
  if (!(difficultyRaw > 0) || !(lengthRaw > 0)) return null;
  const routed = Number(preflight?.openingRoutedCount);
  const required = Number(preflight?.requiredOpeningCount);
  const sourceStarts = Math.max(1, Number(inputs.sourceStarts) || 1);
  const guidanceDifficulty = Number(guidance?.difficulty?.logPrediction);
  const guidanceLength = Number(guidance?.length?.logPrediction);
  const features = {
    gd_d: Number.isFinite(guidanceDifficulty) ? guidanceDifficulty : Number(gate.defaults?.gd_d),
    gd_l: Number.isFinite(guidanceLength) ? guidanceLength : Number(gate.defaults?.gd_l),
    log_pf_d: Math.log(difficultyRaw),
    log_pf_l: Math.log(lengthRaw),
    players: Number(preferences.playerCount) || 4,
    boards: Number(inputs.boards) || 0,
    checkpoints: Number(inputs.checkpoints) || 0,
    routed_share: routed / sourceStarts,
    routed_slack: routed - required,
    log_exp: Math.log1p(Math.max(0, Number(preflight?.work?.expansions) || 0)),
    variants: Number(inputs.variantCount) || 0,
    fast: preferences.generationMode === "fast" ? 1 : 0
  };
  const predictedDifficulty = linear(gate.difficulty, features);
  const predictedLength = linear(gate.length, features);
  // A target the user left at "Any" only steers construction; acceptance does
  // not hold the course to it (targetGuidanceOnly...), so it is never missed.
  features.gap_d = preferences.targetGuidanceOnlyDifficulty
    ? 0
    : bandGap(predictedDifficulty, getDifficultyThresholds()[
      getNearestTargetBandForLog(preferences, "difficulty", predictedDifficulty, getDifficultyThresholds())
    ]);
  // As in tools/preflight-fit.R, the short band is open below. Several picked
  // bands: the gap to the nearest one.
  const lengthBandId = getNearestTargetBandForLog(preferences, "length", predictedLength, getProductionLengthThresholds());
  const lengthBand = getProductionLengthThresholds()[lengthBandId];
  features.gap_l = preferences.targetGuidanceOnlyLength
    ? 0
    : bandGap(
      predictedLength,
      lengthBand && lengthBandId === "short" ? [0, lengthBand[1]] : lengthBand
    );
  const logit = linear(gate.acceptable, features);
  if (!Number.isFinite(logit)) return null;
  const probability = 1 / (1 + Math.exp(-logit));
  const threshold = PREFLIGHT_GATE_THRESHOLDS[preferences.generationMode] ?? PREFLIGHT_GATE_THRESHOLDS.standard;
  return {
    probability,
    threshold,
    stop: probability < threshold,
    predictedDifficulty: Math.exp(predictedDifficulty),
    predictedLength: Math.exp(predictedLength),
    features
  };
}
