// Robo Rally Course Randomizer - presentation labels for difficulty, length, bands and estimated game turns
import {
  getDifficultyThresholds,
  getLegacyDifficultyThresholds,
  getLengthThresholds,
  getProductionLengthThresholds
} from "./targets.js";

export function titleCaseWords(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatLengthLabel(lengthPreference) {
  if (lengthPreference === "any") {
    return "any";
  }
  return lengthPreference === "moderate" ? "medium" : String(lengthPreference ?? "medium");
}

export function formatDifficultyLabel(difficultyPreference) {
  const labels = {
    any: "any",
    easy: "beginner",
    moderate: "intermediate",
    hard: "advanced",
    brutal: "Robots. Must. Die."
  };

  return labels[difficultyPreference] ?? String(difficultyPreference ?? "intermediate");
}

export function formatSummaryBandLabel(value) {
  const text = String(value ?? "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

export function isValueInBand(value, band) {
  return Array.isArray(band) && value >= band[0] && value < band[1];
}

export function presentationNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export function formatActualDifficultyLabel(difficultyTurnRE) {
  const value = presentationNumber(difficultyTurnRE);
  if (!Number.isFinite(value)) return "Unknown";
  const thresholds = getDifficultyThresholds();
  if (isValueInBand(value, thresholds.brutal)) {
    return formatSummaryBandLabel(formatDifficultyLabel("brutal"));
  }
  const match = ["easy", "moderate", "hard"]
    .find((band) => isValueInBand(value, thresholds[band]));
  if (match) return formatSummaryBandLabel(formatDifficultyLabel(match));
  return value < thresholds.easy[0] ? "Beginner" : "Robots. Must. Die.";
}

export function formatLegacyDifficultyLabel(difficultyRaw) {
  const value = presentationNumber(difficultyRaw);
  if (!Number.isFinite(value)) return "Unknown";
  const thresholds = getLegacyDifficultyThresholds();
  if (isValueInBand(value, thresholds.brutal)) {
    return formatSummaryBandLabel(formatDifficultyLabel("brutal"));
  }
  const matches = ["easy", "moderate", "hard"]
    .filter((band) => isValueInBand(value, thresholds[band]))
    .map((band) => formatSummaryBandLabel(formatDifficultyLabel(band)));
  if (matches.length) return matches.join("–");
  return value < thresholds.easy[0] ? "Beginner" : "Advanced";
}

export function formatPresentedDifficultyLabel(metrics = null) {
  const turnDifficulty = presentationNumber(metrics?.difficultyTurnRE);
  if (Number.isFinite(turnDifficulty)) return formatActualDifficultyLabel(turnDifficulty);
  // Saved presentation snapshots from before the RE-turn production migration
  // can still be shown while compatibility cleanup is pending. In that narrow
  // fallback case, retain the label that belonged to the saved legacy scalar.
  return formatLegacyDifficultyLabel(metrics?.difficultyRaw);
}

export function formatLegacyLengthLabel(lengthRaw) {
  const value = presentationNumber(lengthRaw);
  if (!Number.isFinite(value)) return "Unknown";
  const thresholds = getLengthThresholds();
  const matches = ["short", "moderate", "long", "epic"]
    .filter((band) => isValueInBand(value, thresholds[band]))
    .map((band) => formatSummaryBandLabel(formatLengthLabel(band)));
  if (matches.length) return matches.join("–");
  return value < thresholds.short[0] ? "Short" : "Epic";
}

export function formatActualLengthLabel(lengthWallClockTurnIndex) {
  const value = presentationNumber(lengthWallClockTurnIndex);
  if (!Number.isFinite(value)) return "Unknown";
  const thresholds = getProductionLengthThresholds();
  const match = ["short", "moderate", "long", "epic"]
    .find((band) => isValueInBand(value, thresholds[band]));
  if (match) return formatSummaryBandLabel(formatLengthLabel(match));
  return value < thresholds.short[0] ? "Short" : "Epic";
}

export function getProductionLengthTurnIndex(metrics = null) {
  const direct = presentationNumber(metrics?.lengthWallClockTurnIndex);
  if (Number.isFinite(direct)) return direct;
  const nested = presentationNumber(
    metrics?.lengthMetrics?.productionWallClockOwner?.effectiveWallClockTurnIndex
  );
  return Number.isFinite(nested) ? nested : NaN;
}

export function formatPresentedLengthLabel(metrics = null) {
  const wallClockTurnIndex = getProductionLengthTurnIndex(metrics);
  if (Number.isFinite(wallClockTurnIndex)) {
    return formatActualLengthLabel(wallClockTurnIndex);
  }
  return formatLegacyLengthLabel(metrics?.lengthFitRaw ?? metrics?.lengthRaw);
}

export const GAME_TURN_APPROX_RECOVERY_SHARE_THRESHOLD = 0.20;
export const GAME_TURN_APPROX_RECOVERY_REGISTERS_THRESHOLD = 5;

export function getEstimatedGameTurnsLabel(scenario) {
  const lengthMetrics = scenario?.metrics?.lengthMetrics;
  const productionExtent = lengthMetrics?.productionExtentOwner ?? null;
  const productionTurns = Number(
    productionExtent?.expectedPlayProgrammingTurns
      ?? lengthMetrics?.ownerObservationV49dl?.playTimeAmplification?.expectedPlayProgrammingTurns
  );
  if (Number.isFinite(productionTurns)) {
    const rounded = Math.max(1, Math.ceil(productionTurns));
    const nominalRegisters = Number(productionExtent?.nominalRegisters);
    const recoveryRegisters = Number(productionExtent?.reNativeExpectedExtraRegisters);
    const recoveryShare = Number.isFinite(nominalRegisters) && nominalRegisters > 0 && Number.isFinite(recoveryRegisters)
      ? recoveryRegisters / nominalRegisters
      : 0;
    const materiallyApproximate = Boolean(
      Number.isFinite(recoveryRegisters) &&
      recoveryRegisters >= GAME_TURN_APPROX_RECOVERY_REGISTERS_THRESHOLD &&
      recoveryShare >= GAME_TURN_APPROX_RECOVERY_SHARE_THRESHOLD
    );
    const prefix = materiallyApproximate ? "~" : "";
    return `${prefix}${rounded}+ game turn${rounded === 1 ? "" : "s"}`;
  }
  const routeActions = Number(lengthMetrics?.inputs?.totalActionLoad);
  if (!Number.isFinite(routeActions)) return null;
  const recoveryActions = Number(lengthMetrics?.contributions?.forecastEquivalentActions);
  const adjustedActions = routeActions + (Number.isFinite(recoveryActions) ? recoveryActions : 0);
  const turns = Math.max(1, Math.ceil(adjustedActions / 5));
  // Compatibility fallback lacks the full RE-native extent owner, so keep the
  // approximation marker while still presenting the rounded-up floor.
  return `~${turns}+ game turn${turns === 1 ? "" : "s"}`;
}

export function getScenarioPresentationMetrics(scenario) {
  if (scenario?.hydrationPresentationFallback && scenario?.savedPresentationMetrics) {
    return scenario.savedPresentationMetrics;
  }
  return scenario?.metrics ?? null;
}
