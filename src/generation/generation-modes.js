// Robo Rally Course Randomizer - generation modes: profiles, construction-guidance trust policies and mode labels
import {
  DEFAULT_GENERATION_MODE,
  GENERATION_MODE_LABELS,
  GENERATION_MODE_PROFILES
} from "./config.js";
import { clamp } from "../shared/math.js";
import { BOARD_SPREAD_MODES, normalizeBoardSpread } from "./preferences.js";

export function normalizeGenerationMode(value) {
  return Object.prototype.hasOwnProperty.call(GENERATION_MODE_PROFILES, value)
    ? value
    : DEFAULT_GENERATION_MODE;
}

export function getGenerationModeProfile(preferences = {}) {
  return GENERATION_MODE_PROFILES[normalizeGenerationMode(preferences.generationMode)];
}

// Generation mode controls how strongly the *same* learned construction
// landscape is trusted. Calibration never changes legality. Fastest spends its
// expensive routing budget on the cheapest promising proposals first; Thorough
// keeps a much flatter random tail. These values shape stochastic ordering only:
// no candidate is made illegal or permanently unreachable by calibration.
// Stage trust is deliberately asymmetric. Counts-known has almost no geometry,
// so it must not turn correlations such as "more flags -> longer/harder" into a
// strong construction prescription. At that stage calibration mainly helps us
// avoid expensive construction scales. Actual board/layout information earns more
// target authority, and checkpoint geometry earns the most.
export const CONSTRUCTION_GUIDANCE_STAGE_POLICIES = Object.freeze({
  countsKnown: Object.freeze({
    targetBlend: 0.20,
    routeWorkMultiplier: 1.60,
    // Counts-known route-work residuals are very broad because geometry is not
    // known yet. Use only a small fraction of that tail evidence so uncertainty
    // does not collapse the randomizer toward the smallest construction.
    routeWorkTailRiskMultiplier: 0.25
  }),
  boardsKnown: Object.freeze({
    targetBlend: 0.65,
    routeWorkMultiplier: 1.15,
    routeWorkTailRiskMultiplier: 0.70
  }),
  checkpointsKnown: Object.freeze({
    targetBlend: 1.00,
    routeWorkMultiplier: 1.00,
    routeWorkTailRiskMultiplier: 1.00
  })
});

export const CONSTRUCTION_GUIDANCE_MODE_POLICIES = Object.freeze({
  fastest: Object.freeze({
    calibrationStrength: 1.5,
    routeWorkPressure: 0.9,
    routeWorkTailRiskPressure: 0.80,
    explorationFloor: 0.12,
    boardProposalCount: 7,
    checkpointProposalCount: 6,
    grossMismatchExplorationRate: 0.08
  }),
  fast: Object.freeze({
    calibrationStrength: 1.32,
    routeWorkPressure: 0.72,
    routeWorkTailRiskPressure: 0.62,
    explorationFloor: 0.18,
    boardProposalCount: 6,
    checkpointProposalCount: 5,
    grossMismatchExplorationRate: 0.12
  }),
  standard: Object.freeze({
    calibrationStrength: 1.12,
    routeWorkPressure: 0.48,
    routeWorkTailRiskPressure: 0.38,
    explorationFloor: 0.25,
    boardProposalCount: 5,
    checkpointProposalCount: 4,
    grossMismatchExplorationRate: 0.2
  }),
  balanced: Object.freeze({
    calibrationStrength: 0.92,
    routeWorkPressure: 0.24,
    routeWorkTailRiskPressure: 0.18,
    explorationFloor: 0.36,
    boardProposalCount: 4,
    checkpointProposalCount: 4,
    grossMismatchExplorationRate: 0.35
  }),
  thorough: Object.freeze({
    calibrationStrength: 0.72,
    routeWorkPressure: 0.08,
    routeWorkTailRiskPressure: 0.06,
    explorationFloor: 0.52,
    boardProposalCount: 3,
    checkpointProposalCount: 3,
    grossMismatchExplorationRate: 0.55
  })
});

export function isCalibrationHarnessGeneration(preferences = {}) {
  return Boolean(
    preferences.calibrationObserveTargetMisses ||
    preferences.calibrationSingleCheckpointProposal ||
    preferences.calibrationUnguidedBoardSelection ||
    Number.isFinite(Number(preferences.calibrationBoardCount)) ||
    Number.isFinite(Number(preferences.calibrationFlagCount)) ||
    Number.isFinite(Number(preferences.calibrationConstructionGuidanceStrength))
  );
}

export function getConstructionGuidanceModePolicy(preferences = {}) {
  const mode = normalizeGenerationMode(preferences.generationMode);
  const base = CONSTRUCTION_GUIDANCE_MODE_POLICIES[mode] ?? CONSTRUCTION_GUIDANCE_MODE_POLICIES.standard;

  // Calibration collection must not train on production ranking. Keep its
  // proposal path single-sample/unranked while preserving the explicit
  // calibrationConstructionGuidanceStrength used by the harness itself.
  if (isCalibrationHarnessGeneration(preferences)) {
    return {
      ...base,
      routeWorkPressure: 0,
      routeWorkTailRiskPressure: 0,
      explorationFloor: 1,
      // Random remains a literal single raw proposal in calibration. Tight is
      // itself a construction treatment, so it needs several unguided proposals
      // from which to choose the smallest board bounding box.
      boardProposalCount: normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight ? 6 : 1,
      checkpointProposalCount: 1,
      grossMismatchExplorationRate: 1
    };
  }

  // If early preferred proposals fail, progressively flatten the learned order
  // rather than hard-pruning the expensive tail. This keeps "slow result" as a
  // fallback while making early attempts materially speed-aware.
  const profile = getGenerationModeProfile(preferences);
  const attempt = Math.max(1, Number(preferences.generationAttempt) || 1);
  const maxAttempts = Math.max(1, Number(profile.maxAttempts) || 1);
  const progress = maxAttempts > 1
    ? clamp((attempt - 1) / (maxAttempts - 1), 0, 1)
    : 0;
  return {
    ...base,
    // Every mode flattens after failed attempts. The older interpolation toward
    // 1 accidentally strengthened target pressure for Balanced/Thorough because
    // their base exponent is below 1. Decrease the exponent itself instead.
    calibrationStrength: Math.max(0.35, base.calibrationStrength * (1 - progress * 0.55)),
    routeWorkPressure: base.routeWorkPressure * (1 - progress * 0.7),
    routeWorkTailRiskPressure: base.routeWorkTailRiskPressure * (1 - progress * 0.78),
    explorationFloor: clamp(
      base.explorationFloor + (0.68 - base.explorationFloor) * progress * 0.75,
      0,
      0.8
    ),
    grossMismatchExplorationRate: clamp(
      base.grossMismatchExplorationRate +
        (0.72 - base.grossMismatchExplorationRate) * progress * 0.65,
      0,
      0.85
    )
  };
}

export function getConstructionGuidanceStrength(preferences = {}) {
  // The calibration runner can still explicitly control its neutral proposal
  // guidance strength; production uses the generation-mode trust profile above.
  const calibrationStrength = Number(preferences.calibrationConstructionGuidanceStrength);
  if (Number.isFinite(calibrationStrength) && calibrationStrength > 0) {
    return clamp(calibrationStrength, 0.2, 2);
  }
  return getConstructionGuidanceModePolicy(preferences).calibrationStrength;
}

export function formatGenerationModeLabel(value) {
  const mode = normalizeGenerationMode(value);
  return GENERATION_MODE_LABELS[mode] ?? GENERATION_MODE_LABELS[DEFAULT_GENERATION_MODE];
}

export function getScenarioGenerationMode(scenario) {
  const explicitMode = scenario?.generationDiagnostics?.generationMode ?? scenario?.preferences?.generationMode;
  // Scenarios saved before the Mode control existed used today's Balanced
  // search budgets. Preserve that meaning when reopening an old snapshot.
  return explicitMode ? normalizeGenerationMode(explicitMode) : "balanced";
}

export function getScenarioGenerationMaxAttempts(scenario) {
  const diagnostics = scenario?.generationDiagnostics ?? null;
  const diagnosticsMax = Number(diagnostics?.maxAttempts);
  const emergencyReserve = Number(diagnostics?.emergencyAttemptReserve) || 0;
  if (Number.isFinite(diagnosticsMax) && diagnosticsMax > 0) {
    return diagnostics?.emergencyActivated
      ? Math.floor(diagnosticsMax + Math.max(0, emergencyReserve))
      : Math.floor(diagnosticsMax);
  }
  return getGenerationModeProfile({ generationMode: getScenarioGenerationMode(scenario) }).maxAttempts;
}
