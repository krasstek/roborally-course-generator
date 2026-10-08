// Robo Rally Course Randomizer - preference normalisation: board spread, overlays, Act Fast modes, expansions
import { titleCaseWords } from "./labels.js";

export function getTuningDifficulty(difficultyPreference) {
  return difficultyPreference === "brutal" ? "hard" : (difficultyPreference ?? "moderate");
}

export function isHardestDifficulty(preferences = {}) {
  return preferences.difficulty === "brutal";
}

export const BOARD_SPREAD_MODES = Object.freeze({
  random: "random",
  tight: "tight"
});

export function normalizeBoardSpread(value) {
  return value === BOARD_SPREAD_MODES.tight
    ? BOARD_SPREAD_MODES.tight
    : BOARD_SPREAD_MODES.random;
}

export const OVERLAY_MODES = {
  no: "no",
  tokens: "tokens",
  boards: "boards",
  yes: "yes"
};

export const OVERLAY_MODE_CYCLE = [
  OVERLAY_MODES.no,
  OVERLAY_MODES.tokens,
  OVERLAY_MODES.boards,
  OVERLAY_MODES.yes
];

export const ACT_FAST_CONTROL_CHOICES = [
  { id: "off", variantState: "off", mode: null, shortLabel: "No", label: "Not allowed" },
  { id: "allowed", variantState: "allowed", mode: null, shortLabel: "Yes", label: "Allowed; timer mode is chosen if Act Fast is used" },
  { id: "forced_random", variantState: "forced", mode: null, shortLabel: "Must", label: "Always on; choose a timer mode randomly" },
  { id: "countdown_3m", variantState: "forced", mode: "countdown_3m", shortLabel: "3 min", label: "Always on: 3-minute programming timer" },
  { id: "countdown_2m", variantState: "forced", mode: "countdown_2m", shortLabel: "2 min", label: "Always on: 2-minute programming timer" },
  { id: "countdown_1m", variantState: "forced", mode: "countdown_1m", shortLabel: "1 min", label: "Always on: 1-minute programming timer" },
  { id: "countdown_30s", variantState: "forced", mode: "countdown_30s", shortLabel: "30 sec", label: "Always on: 30-second programming timer" },
  { id: "last_player_30s", variantState: "forced", mode: "last_player_30s", shortLabel: "Last 30s", label: "Always on: last player has 30 seconds" }
];
export const ACT_FAST_MODE_IDS = new Set(ACT_FAST_CONTROL_CHOICES.filter((choice) => choice.mode).map((choice) => choice.mode));

export function formatActFastMode(mode) {
  return ({
    countdown_3m: "3 min",
    countdown_2m: "2 min",
    countdown_1m: "1 min",
    countdown_30s: "30 sec",
    last_player_30s: "Last player 30 sec"
  })[mode] ?? "Yes";
}

export function normalizeOverlayMode(mode) {
  return Object.prototype.hasOwnProperty.call(OVERLAY_MODES, mode) ? mode : OVERLAY_MODES.yes;
}

export function formatOverlayMode(mode) {
  return {
    no: "No",
    tokens: "Tokens",
    boards: "Boards",
    yes: "Both"
  }[normalizeOverlayMode(mode)];
}

export function shouldUseBoardOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.boards;
}

export function shouldUseMiniOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.tokens;
}

export function getSelectedExpansionIds(preferences = {}) {
  const selected = preferences.selectedExpansions ?? { roborally: true };
  return new Set(Object.entries(selected)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([expansionId]) => expansionId));
}

export function formatExpansionName(expansionId) {
  const labels = {
    roborally: "Robo Rally (2023)",
    "30th-anniversary": "Robo Rally: 30th Anniversary",
    "thrills-and-spills": "Thrills & Spills",
    "master-builder": "Master Builder",
    "wet-and-wild": "Wet & Wild",
    "chaos-and-carnage": "Chaos & Carnage",
    "contamination": "Contamination",
    "rr-dice": "Robo Rally Dice"
  };

  return labels[expansionId] ?? titleCaseWords(expansionId);
}
