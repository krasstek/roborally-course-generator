// Robo Rally Course Randomizer - requested difficulty/length targets: thresholds, production length bands and gross-mismatch abort bands
import { MIN_LENGTH_RAW } from "./config.js";

// v49dp production difficulty owner. These are deliberately non-overlapping
// bands on completed non-tempo RE per programming turn. Intermediate,
// Advanced and R.M.D. retain the v49de calibration cuts. Beginner is now
// deliberately stricter: browser/visual review showed courses near the old
// 4.3 boundary could still carry distinctly non-beginner local RE burdens.
// The 4.0 ceiling creates a semantic safety margin while remaining purely
// RE-native; no legacy hazard/visual score participates in classification.
export function getDifficultyThresholds() {
  return {
    easy: [0, 4.0],
    moderate: [4.0, 4.8],
    hard: [4.8, 5.8],
    brutal: [5.8, Infinity]
  };
}

// Construction guidance and the cheap preflight models were trained against
// the historical score-space difficulty scalar. They remain generation-speed
// infrastructure until the later construction-calibration pass; they are not
// semantic difficulty owners after v49de.
export function getLegacyDifficultyThresholds() {
  return {
    easy: [0, 95],
    moderate: [90, 155],
    hard: [150, Infinity],
    brutal: [180, Infinity]
  };
}

export function getLengthThresholds() {
  // Legacy raw-score envelopes retained for construction/preflight guidance
  // and saved-presentation fallback only. Production semantic length no longer
  // uses this score space after v49dv.
  return {
    short: [MIN_LENGTH_RAW, 150],
    moderate: [145, 210],
    long: [205, 270],
    epic: [265, 400]
  };
}

// v49dv production wall-clock bands. These use the final relative wall-clock
// turn index (five wall-clock register-index units per reference turn), not the
// transitional raw score. The cuts preserve the accepted v49dl 4-player
// elapsed-play anchors while allowing player count, Act Fast and upgrade-economy
// phase time to move the same physical course between semantic length bands.
// Epic remains bounded for fit purposes so an extremely long course can still
// be reported as "very long, even for Epic".
export const WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN = 20;
export const MIN_WALL_CLOCK_TURN_INDEX = MIN_LENGTH_RAW / WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN;
export function getProductionLengthThresholds() {
  return {
    short: [MIN_WALL_CLOCK_TURN_INDEX, 6.25],
    moderate: [6.25, 9.5],
    long: [9.5, 13],
    epic: [13, 20]
  };
}

// Gross-mismatch limits are intentionally much wider than the actual
// acceptance bands. They are used only after one complete course analysis,
// and only to avoid spending additional physical-pruning/reanalysis passes on
// a candidate that is already implausibly far from the requested target.
export const GROSS_DIFFICULTY_ABORT_BANDS = {
  easy: { max: 165 },
  moderate: { min: 35, max: 225 },
  hard: { min: 75 },
  brutal: { min: 90 }
};

export const GROSS_LENGTH_ABORT_BANDS = {
  short: { max: 220 },
  moderate: { min: 70, max: 285 },
  long: { min: 90, max: 390 },
  epic: { min: 140, max: 520 }
};

export function getGrossCourseMismatch(metrics, preferences = {}) {
  const difficultyBand = preferences.targetGuidanceOnlyDifficulty
    ? null
    : GROSS_DIFFICULTY_ABORT_BANDS[preferences.difficulty];
  const lengthBand = preferences.targetGuidanceOnlyLength
    ? null
    : GROSS_LENGTH_ABORT_BANDS[preferences.length];

  if (difficultyBand && Number.isFinite(metrics?.difficultyRaw)) {
    if (
      Number.isFinite(difficultyBand.min) &&
      metrics.difficultyRaw < difficultyBand.min
    ) {
      return {
        abort: true,
        reason: "difficulty-too-low",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.min,
        requested: preferences.difficulty
      };
    }

    if (
      Number.isFinite(difficultyBand.max) &&
      metrics.difficultyRaw > difficultyBand.max
    ) {
      return {
        abort: true,
        reason: "difficulty-too-high",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.max,
        requested: preferences.difficulty
      };
    }
  }

  if (lengthBand && Number.isFinite(metrics?.lengthFitRaw)) {
    if (
      Number.isFinite(lengthBand.min) &&
      metrics.lengthFitRaw < lengthBand.min
    ) {
      return {
        abort: true,
        reason: "length-too-low",
        metric: "length",
        value: metrics.lengthFitRaw,
        limit: lengthBand.min,
        requested: preferences.length
      };
    }

    if (
      Number.isFinite(lengthBand.max) &&
      metrics.lengthFitRaw > lengthBand.max
    ) {
      return {
        abort: true,
        reason: "length-too-high",
        metric: "length",
        value: metrics.lengthFitRaw,
        limit: lengthBand.max,
        requested: preferences.length
      };
    }
  }

  return {
    abort: false,
    reason: null,
    metric: null,
    value: null,
    limit: null,
    requested: null
  };
}

export function formatGrossCourseMismatch(mismatch) {
  if (!mismatch?.abort) {
    return "";
  }

  const comparison = mismatch.reason.endsWith("too-low") ? "<" : ">";
  return `${mismatch.metric} ${Number(mismatch.value).toFixed(1)} ${comparison} gross ${mismatch.requested} limit ${mismatch.limit}`;
}
