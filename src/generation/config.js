// Robo Rally Course Randomizer - generation configuration: directions and docks, generation-mode profiles, traffic, preflight and start-balance tuning
import { ROUTE_ENERGY_ECONOMY_DEFAULTS } from "../../analyze.js";

export const ROTATIONS = [0, 90, 180, 270];
export const FACINGS = ["N", "E", "S", "W"];
export const DOCK_SIDES = ["left", "top", "right", "bottom"];
export const CARDINAL_DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};
export const LASER_BUNDLE_DEFINITIONS = [
  {
    startPhysicalId: "mb-tile-12",
    midPhysicalId: "mb-tile-11",
    endPhysicalId: "mb-tile-13",
    startId: "mb-tile-12a",
    midId: "mb-tile-11b",
    endId: "mb-tile-13a"
  },
  {
    startPhysicalId: "mb-tile-5",
    midPhysicalId: "mb-tile-4",
    endPhysicalId: "mb-tile-8",
    startId: "mb-tile-5b",
    midId: "mb-tile-4b",
    endId: "mb-tile-8b"
  }
];
export const OPPOSITE_DIRS = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};
export const GENERATION_EMERGENCY_ATTEMPT_RESERVE = 3;
export const DEFAULT_GENERATION_MODE = "standard";
export const GENERATION_MODE_LABELS = Object.freeze({
  fastest: "Fastest",
  fast: "Fast",
  standard: "Standard",
  balanced: "Careful",
  thorough: "Thorough"
});
// Generation modes change search effort and trust in guidance, never route
// legality or course semantics. Calibration is proposal guidance: hidden Any
// targets, predicted work and structural priors may reorder candidates, but only
// explicit user targets may reject a finished course.
export const NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD = 3.2;
export const NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN = 1.5;
export const NORMAL_FULL_COURSE_TRAFFIC_PASSES = 1;
export const NORMAL_PRUNE_BATCH_SIZE = 2;
export const NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE = 0.65;

// v49al generation-mode contract -----------------------------------------------
// Modes never change route legality, reachability semantics, Energy valuation,
// traffic scoring, or the definition of a hard-valid course. They change how
// strongly construction guidance is trusted and how many broadly qualifying
// course evaluations are collected before final ranking. Traffic-feedback route
// judgement now uses one shared Standard-strength contract in every mode; the
// universal six-search ceiling is a safety backstop, not a mode quality tier.
// Primary-witness/preflight breadth remains mode-dependent for now and is a
// separate follow-up boundary, so this patch does not silently rewrite the whole
// construction/evaluation envelope at once.
export const COMMON_TRAFFIC_ROUTING_PROFILE = Object.freeze({
  trafficEnabled: true,
  trafficEpochs: 2,
  trafficAlternateMaxNewSearchesPerEpoch: 6,
  trafficAlternateMaxNewSearchesTotal: 6,
  trafficAlternateExpansions: 320,
  trafficAlternateMaxActions: 30,
  trafficAlternateCachedProbeMargin: 0.75,
  trafficAlternateCachedProbeMaxSimilarity: 0.84,
  trafficAlternateLegsPerStart: 1,
  trafficExplorationUncertaintyShare: 0,
  trafficExplorationConfidenceFloor: 1,
  trafficAlternateUncertaintyEffortFloor: 0.18,
  trafficAlternateUncertaintyEffortExponent: 1.15
});
export const GENERATION_MODE_PROFILES = Object.freeze({
  fastest: Object.freeze({
    maxAttempts: 5,
    acceptableCandidateTarget: 1,
    softExpansionBudget: 140000,
    softBudgetMinAttempts: 3,
    preflightOpeningExpansions: 800,
    preflightLaterExpansions: 700,
    lightStartExpansions: 4200,
    fullCourseExpansions: 32000,
    primaryWitnessRoutes: 1,
    ...COMMON_TRAFFIC_ROUTING_PROFILE,
  }),
  fast: Object.freeze({
    maxAttempts: 8,
    acceptableCandidateTarget: 2,
    softExpansionBudget: 240000,
    softBudgetMinAttempts: 4,
    preflightOpeningExpansions: 1000,
    preflightLaterExpansions: 850,
    lightStartExpansions: 5200,
    fullCourseExpansions: 38000,
    primaryWitnessRoutes: 2,
    ...COMMON_TRAFFIC_ROUTING_PROFILE,
  }),
  standard: Object.freeze({
    // v49j: three broadly qualifying candidates before near-best selection.
    maxAttempts: 12,
    acceptableCandidateTarget: 3,
    softExpansionBudget: 360000,
    softBudgetMinAttempts: 6,
    preflightOpeningExpansions: 1200,
    preflightLaterExpansions: 1000,
    lightStartExpansions: 6000,
    fullCourseExpansions: 44000,
    primaryWitnessRoutes: 2,
    ...COMMON_TRAFFIC_ROUTING_PROFILE,
  }),
  balanced: Object.freeze({
    maxAttempts: 20,
    acceptableCandidateTarget: 4,
    softExpansionBudget: 500000,
    softBudgetMinAttempts: 8,
    preflightOpeningExpansions: 1400,
    preflightLaterExpansions: 1200,
    lightStartExpansions: 7000,
    fullCourseExpansions: 52000,
    primaryWitnessRoutes: 3,
    ...COMMON_TRAFFIC_ROUTING_PROFILE,
  }),
  thorough: Object.freeze({
    maxAttempts: 36,
    acceptableCandidateTarget: 5,
    softExpansionBudget: 850000,
    softBudgetMinAttempts: 10,
    preflightOpeningExpansions: 1800,
    preflightLaterExpansions: 1600,
    lightStartExpansions: 9500,
    fullCourseExpansions: 68000,
    primaryWitnessRoutes: 4,
    ...COMMON_TRAFFIC_ROUTING_PROFILE,
  })
});
export const DIAGNOSTIC_ATTEMPTS = 24;
export const DIAGNOSTIC_PLAYER_COUNTS = [2, 4, 6];
export const DIAGNOSTIC_DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
export const DIAGNOSTIC_LENGTHS = ["short", "moderate", "long", "epic"];
export const MIN_LENGTH_RAW = 28;
export const MIN_SHARED_EDGE = 5;
export const DOCK_BRIDGE_GAP = 3;
export const MAX_DOCK_COUNT = 2;
export const DEFAULT_STARTING_ENERGY = ROUTE_ENERGY_ECONOMY_DEFAULTS.startingEnergy;
export const DEFAULT_STARTING_UPGRADE_CARDS = ROUTE_ENERGY_ECONOMY_DEFAULTS.startingUpgradeCards;
export const SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY = 3;

// Start-Energy balancing uses the v37 card-aware fixed-route pricing economy.
// Route search itself stays on the shared flattened production scorer; pricing
// replays already-discovered routes from startingEnergy±adjustment before the
// opening Upgrade Phase and respects starting cards, future draw/install capacity,
// the storage cap, and remaining race horizon. Moving baseline, one-at-a-time
// endpoint pruning, selector breakpoint fit, and player-floor safeguards are
// shared by Pay to Win and Subsidized Starts.
// Passive border geometry that may coexist with a No-Docks starting square.
// Active edge devices (lasers, push panels, flamethrowers) are deliberately
// excluded even though they are encoded directionally on an edge: a player
// should not be offered a start directly on an active emitter/pusher tile.
export const NO_DOCK_START_EDGE_FEATURE_TYPES = new Set([
  "wall",
  "redWall",
  "greenWall",
  "repulsor",
  "ledge"
]);
// Virtual Bots use the same clear-floor concept as No Docks, but the shared
// entry may be anywhere on the assembled course. Facing is a separate soft
// preference: immediately nonsensical directions are excluded, while nearby
// lethal floor features and exposed course edges only bias the random choice.
export const VIRTUAL_BOT_AUTOKILL_FEATURE_TYPES = new Set([
  "pit",
  "crusher",
  "trapdoor"
]);
export const VIRTUAL_BOT_FACING_LOOKAHEAD = 4;
export const VIRTUAL_BOT_FORWARD_DANGER_PENALTY = Object.freeze({
  2: 3,
  3: 1.5,
  4: 0.6
});
export const VIRTUAL_BOT_EDGE_PROXIMITY_PENALTY = Object.freeze({
  1: 2.4,
  2: 1.4,
  3: 0.7,
  4: 0.3
});
// v49j soft-fit collection. Hard validity is non-compensatory; ordinary target,
// pacing, board-use and balance mismatches compete in one continuous fit score.
// 45 is a modest tightening after the first empirical pass and remains exposed
// in diagnostics so it can be tuned from real candidate distributions.
export const SOFT_CANDIDATE_RETENTION_LIMIT = 45;
// v49ag: strong target-axis misses are non-compensatory for ordinary acceptance.
// They remain eligible for clearly labelled closest-match fallback after the
// search is exhausted; this is an acceptance gate, not a physical hard failure.
// Keep these aligned with player-facing mismatch severity in course-notes.js.
export const TARGET_STRONG_DIFFICULTY_FIT = 42;
export const TARGET_STRONG_EASY_DIFFICULTY_FIT = 48;
export const TARGET_STRONG_LENGTH_FIT = 24;
export const NEAR_BEST_MIN_BIN_WIDTH = 2;

// Extra Docks remains a special forced-request fallback until the later variant
// policy audit. Ordinary quality mismatches no longer acquire fallback cliffs.
export const FALLBACK_SOFT_FAILURE_PENALTIES = new Map([
  ["extra-docks", 100]
]);
export const OVERLAY_UPDATE_INTERVAL = 4;
export const LIGHT_START_SURPLUS = 2;
export const LIGHT_START_MAX_EXPANSIONS = 7000;
export const LIGHT_START_MAX_ACTIONS = 18;
// Universal cheap course preflight. These searches intentionally use a much
// smaller budget than final contextual analysis: they are an audition, never a
// proof of reachability. A capped or short-horizon route sketch is recorded as
// incomplete and handed to the exact contextual pass instead of causing a retry.
export const COURSE_PREFLIGHT_OPENING_MAX_ACTIONS = 18;
export const COURSE_PREFLIGHT_LATER_MAX_ACTIONS = 20;
// v12 design invariant: cheap pruning may reduce how many Normal/priced starts
// receive rich follow-up, but it must use the same Energy-economy objective as
// production whenever Energy/upgrades are active. Energy Crisis (lighterGame)
// is currently the only rule that removes that economy entirely.
//
// This bounded coherent audition is therefore allowed to be *less exhaustive*,
// not strategically different. Competitive never uses it: Competitive evaluates
// every physical start because players themselves block spaces before selection.
export const COURSE_PREFLIGHT_DIFFICULTY_MARGIN = 35;
export const COURSE_PREFLIGHT_LENGTH_MARGIN = 40;
export const FULL_START_OUTLIER_Z = 2.25;
export const NORMAL_FINAL_TAIL_CLEANUP_Z = 2.0;
export const NORMAL_START_FAIRNESS_STDDEV_LIMIT = 14;
// v49bo Normal RE-native fairness. v49cq also moves Competitive strategic
// blocking/choice-set balance into completed effective RE; priced-start modes
// already use their selector-aware completed-RE economy path.
export const NORMAL_EFFECTIVE_RE_OUTLIER_Z = 2.25;
export const NORMAL_EFFECTIVE_RE_MINIMUM_DELTA = 2.5;
// v49dx: Normal/economy fairness is range-first. The tolerated best↔worst
// completed-RE gap grows with full-course programming extent; SD/outlier z are
// diagnostics and pruning-direction tie-breakers, not independent targets.
export const NORMAL_EFFECTIVE_RE_RANGE_MIN = 3.0;
export const NORMAL_EFFECTIVE_RE_RANGE_PER_TURN = 0.60;
// v49dy: once the expected range is met, fairness contributes zero candidate-fit
// pressure. A modest overflow may still be retained at the player-count floor
// and compete as a soft penalty; larger overflow is closest-match territory.
export const NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_MIN = 0.75;
export const NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_FRACTION = 0.25;
// A forced Pay to Win / Subsidized Starts course that produces no visible
// starting-Energy change is mechanically legal but a weak realization of a
// Must request. Penalize selection rather than inventing an unnecessary price.
export const FORCED_ECONOMY_NO_EFFECT_FIT_PENALTY = 12;
export const NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT = 3.5; // diagnostic/Competitive anchor only
// Main owns the RE-to-score conversion used by the residual Normal scorer;
// do not depend on a private analyzer constant.
export const NORMAL_EFFECTIVE_RE_SCORE_PER_RE = 6.4;
export const NORMAL_REGISTER_RANGE_GUARDRAIL_MIN = 12;
export const NORMAL_REGISTER_RANGE_GUARDRAIL_FRACTION = 0.45;
// v49ec: Competitive fairness is range-first after the sequential player-block
// simulation. Keep Competitive calibration separate from Normal even though the
// provisional length response currently shares the same 3RE / 0.6RE-per-turn
// shape. SD/z remain diagnostics only. The hard ceiling preserves the historical
// 1.5x soft/hard separation while multi-course calibration is still pending.
export const COMPETITIVE_EFFECTIVE_RE_RANGE_MIN = 3.0;
export const COMPETITIVE_EFFECTIVE_RE_RANGE_PER_TURN = 0.60;
export const COMPETITIVE_EFFECTIVE_RE_HARD_RANGE_MULTIPLIER = 1.50;
