// Robo Rally Course Randomizer - production runtime
// Mobile browsers may auto-detect number-like rule text and restyle it as a
// tappable link even though the app emitted ordinary text. Keep rules/course
// annotations visually plain; this is presentation-only and does not disable
// any deliberate controls elsewhere in the UI.
function installMobilePlainTextGuards() {
  if (typeof document === "undefined") return;

  let formatMeta = document.querySelector('meta[name="format-detection"]');
  if (!formatMeta) {
    formatMeta = document.createElement("meta");
    formatMeta.setAttribute("name", "format-detection");
    document.head?.appendChild(formatMeta);
  }
  formatMeta.setAttribute(
    "content",
    "telephone=no,date=no,address=no,email=no,url=no"
  );

  if (!document.getElementById("mobile-plain-text-guard")) {
    const style = document.createElement("style");
    style.id = "mobile-plain-text-guard";
    style.textContent = `
      .rules-note a,
      .rules-note a:link,
      .rules-note a:visited,
      .rules-note a:hover,
      .rules-note a:active,
      .rules-note [x-apple-data-detectors],
      .rules-note [data-detected-address],
      .rules-note [data-detected-date],
      .rules-note [data-detected-phone] {
        color: inherit !important;
        text-decoration: none !important;
        font: inherit !important;
        letter-spacing: inherit !important;
        cursor: text !important;
      }
    `;
    document.head?.appendChild(style);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMobilePlainTextGuards, { once: true });
  } else {
    installMobilePlainTextGuards();
  }
}

const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { render },
  { analyzeCourse, analyzeFullCourse, analyzeFullCourseCooperative, analyzeFlagLeg, clearAnalysisCaches, evaluateFullCourseFocusPaymentCurveUnderOccupancy, evaluateRouteUpgradePotential, estimateInitialUpgradeOpportunitiesRemaining, getAnalysisTelemetrySnapshot, getCourseMaxEnergy, getCourseStartingEnergy, getCourseStartingUpgradeCards, getRouteEnergyEconomyConfig, getRouteEnergyGainUtility, getRouteMarginalEnergyUtility, getRouteUpgradePotential, recomputeFirstLegPressure, resetAnalysisTelemetry, ROUTE_ENERGY_ECONOMY_DEFAULTS, scoreFlagArea, summarizeIntrinsicRouteForecastConfidence, summarizePowerUpOpportunityBenchmark, summarizeProgramSequencePressure, summarizePowerUpProgramFeasibility },
  {
    buildMainFootprintTiles,
    buildResolvedMap,
    getDockFrontageLength,
    getBoundaryEdges,
    getValidDockRuns,
    groupBoundaryRuns,
    getPlacedRect,
    placePiece,
    projectDockPlacement,
    rotatedDimensions,
    validateDockPlacement,
    validateMainBoardLayout
  },
  {
    BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS,
    BOARD_PROFILE_DENSITY_WEIGHT,
    PROGRAMMING_CONTROL_PRESSURE_WEIGHTS,
    getBoardProfileDelta,
    getEffectiveLaserDamage,
    getTilePenaltyForFeature
  },
  { formatFeatureLabel },
  {
    getVariantAvailabilityRule,
    getVariantDefinition: getRegisteredVariantDefinition,
    getVariantExclusiveGroupConflict,
    getVariantGuidanceRules,
    getVariantRequirementIds,
    VARIANT_CONTROL_IDS,
    VARIANT_DEFINITIONS,
    VARIANT_STATES,
    applyVariantAnalysisOptions,
    applyVariantGenerationOptions,
    applyVariantScenarioState,
    buildVariantBundle
  },
  { buildCourseNotesHtml, clearCourseNotesCache, getCheckpointPlacementAdvisory }
] = await Promise.all([
  import(versionedPath("./render.js")),
  import(versionedPath("./analyze.js")),
  import(versionedPath("./board.js")),
  import(versionedPath("./feature-weights.js")),
  import(versionedPath("./feature-meta.js")),
  import(versionedPath("./variants.js")),
  import(versionedPath("./course-notes.js"))
]);

// Versioned strings stored in diagnostic `method` fields are compatibility
// identifiers, not ordinary comments. They may appear in saved/debug output and
// should only be renamed alongside an explicit migration or schema decision.

// Cache clearing is a performance optimization, not a correctness requirement.
// Keep startup/generation working if the browser temporarily resolves an older
// analyze.js module that does not expose this helper.
const clearAnalysisCachesSafe = typeof clearAnalysisCaches === "function"
  ? clearAnalysisCaches
  : () => {};

const resetAnalysisTelemetrySafe = typeof resetAnalysisTelemetry === "function"
  ? resetAnalysisTelemetry
  : () => {};
const analyzeFullCourseCooperativeSafe = typeof analyzeFullCourseCooperative === "function"
  ? analyzeFullCourseCooperative
  : async (...args) => analyzeFullCourse(...args);

const getAnalysisTelemetrySnapshotSafe = typeof getAnalysisTelemetrySnapshot === "function"
  ? getAnalysisTelemetrySnapshot
  : () => ({
    routeSearches: [],
    routeSearchCount: 0,
    totalExpansions: 0,
    totalDurationMs: 0,
    cappedSearches: 0,
    slowestSearch: null,
    totalsByKind: {},
    physicalCacheTotals: { hits: 0, misses: 0 },
    contextualProfileTotals: {
      queueMs: 0,
      currentKeyMs: 0,
      goalCompletionMs: 0,
      simulationMs: 0,
      actionScoringMs: 0,
      historyBuildMs: 0,
      destinationBuildMs: 0,
      nextKeyMs: 0,
      dominanceMs: 0,
      actionCandidates: 0,
      simulationCalls: 0,
      blockedTransitions: 0,
      destinationCandidates: 0,
      acceptedStates: 0,
      dominatedStates: 0,
      completedGoals: 0,
      searchesWithGoal: 0,
      cappedZeroGoalSearches: 0,
      cappedWithGoalSearches: 0,
      firstGoalExpansionTotal: 0,
      postFirstGoalExpansions: 0,
      optionalCompletionSearches: 0,
      optionalCompletionStops: 0,
      optionalCompletionShortReturns: 0,
      cappedZeroGoalExpansions: 0,
      cappedWithGoalExpansions: 0,
      exactContextualSearches: 0,
      exactContextualExpansions: 0,
      horizonSolidSearches: 0,
      horizonUncertainSearches: 0,
      horizonSpeculativeSearches: 0,
      horizonFirstGoalUncertain: 0,
      horizonFirstGoalSpeculative: 0,
      horizonOptionalSuppressed: 0,
      physicalCacheHits: 0,
      physicalCacheMisses: 0,
      dominanceKeysFull: 0,
      dominanceKeysPhysical: 0,
      dominanceKeysPhysicalPhase: 0,
      dominanceKeysNoProgramDetail: 0,
      dominanceKeysNoPrevious: 0,
      dominanceKeysNoUsage: 0,
      dominanceKeysNoAgain: 0,
      dominanceKeysNoAbsolute: 0,
      dominanceKeysNoEnergy: 0,
      dominanceKeysNoCards: 0,
      dominanceKeysNoEconomyShadow: 0,
      dominanceKeysNoGoal: 0,
      dominanceUsageParetoStates: 0,
      dominanceUsageParetoDominated: 0,
      dominanceUsageParetoMultiStateGroups: 0,
    }
  });

const ROTATIONS = [0, 90, 180, 270];
const FACINGS = ["N", "E", "S", "W"];
const DOCK_SIDES = ["left", "top", "right", "bottom"];
const CARDINAL_DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};
const LASER_BUNDLE_DEFINITIONS = [
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
const OPPOSITE_DIRS = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};
const GENERATION_EMERGENCY_ATTEMPT_RESERVE = 3;
const DEFAULT_GENERATION_MODE = "standard";
const GENERATION_MODE_LABELS = Object.freeze({
  fastest: "Fastest",
  fast: "Fast",
  standard: "Standard",
  balanced: "Balanced",
  thorough: "Thorough"
});
// Generation modes change search effort and trust in guidance, never route
// legality or course semantics. Calibration is proposal guidance: hidden Any
// targets, predicted work and structural priors may reorder candidates, but only
// explicit user targets may reject a finished course.
const NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD = 3.2;
const NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN = 1.5;
const NORMAL_FULL_COURSE_TRAFFIC_PASSES = 1;
const NORMAL_PRUNE_BATCH_SIZE = 2;
const NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE = 0.65;

// v35 generation-mode contract -------------------------------------------------
// Modes never change route legality, reachability semantics, Energy valuation,
// Normal fairness criteria, traffic scoring, or the minimum useful reroute gain.
// They change only how much evidence/search effort the generator is willing to
// buy. Balanced/Thorough may inspect some high raw congestion beyond Standard's
// confidence horizon, but final route selection still uses the ordinary shared
// confidence-weighted traffic score.
const GENERATION_MODE_PROFILES = Object.freeze({
  fastest: Object.freeze({
    maxAttempts: 5,
    softExpansionBudget: 140000,
    softBudgetMinAttempts: 3,
    preflightOpeningExpansions: 800,
    preflightLaterExpansions: 700,
    lightStartExpansions: 4200,
    fullCourseExpansions: 32000,
    primaryWitnessRoutes: 1,
    // Fastest still measures traffic on the full-course witnesses it already paid
    // to realize. Zero epochs and zero alternate-search budgets mean traffic can
    // score/rerank those witnesses, but cannot buy traffic-driven geometry.
    trafficEnabled: true,
    trafficEpochs: 0,
    trafficAlternateMaxNewSearchesPerEpoch: 0,
    trafficAlternateExpansions: 0,
    trafficAlternateMaxActions: 0,
    trafficAlternateCachedProbeMargin: 0,
    trafficAlternateCachedProbeMaxSimilarity: 0.84,
    trafficAlternateLegsPerStart: 1,
    trafficExplorationUncertaintyShare: 0,
    trafficExplorationConfidenceFloor: 1,
    trafficAlternateUncertaintyEffortFloor: 0.10,
    trafficAlternateUncertaintyEffortExponent: 1.45,
  }),
  fast: Object.freeze({
    maxAttempts: 8,
    softExpansionBudget: 240000,
    softBudgetMinAttempts: 4,
    preflightOpeningExpansions: 1000,
    preflightLaterExpansions: 850,
    lightStartExpansions: 5200,
    fullCourseExpansions: 38000,
    primaryWitnessRoutes: 2,
    trafficEnabled: true,
    trafficEpochs: 1,
    // Fast may accept a useful already-paid witness, but never opens new geometry.
    trafficAlternateMaxNewSearchesPerEpoch: 0,
    trafficAlternateExpansions: 0,
    trafficAlternateMaxActions: 0,
    trafficAlternateCachedProbeMargin: 0,
    trafficAlternateCachedProbeMaxSimilarity: 0.84,
    trafficAlternateLegsPerStart: 1,
    trafficExplorationUncertaintyShare: 0,
    trafficExplorationConfidenceFloor: 1,
    trafficAlternateUncertaintyEffortFloor: 0.12,
    trafficAlternateUncertaintyEffortExponent: 1.35,
  }),
  standard: Object.freeze({
    // v34 frozen reference behavior.
    maxAttempts: 12,
    softExpansionBudget: 360000,
    softBudgetMinAttempts: 6,
    preflightOpeningExpansions: 1200,
    preflightLaterExpansions: 1000,
    lightStartExpansions: 6000,
    fullCourseExpansions: 44000,
    primaryWitnessRoutes: 2,
    trafficEnabled: true,
    trafficEpochs: 1,
    trafficAlternateMaxNewSearchesPerEpoch: 6,
    trafficAlternateExpansions: 320,
    trafficAlternateMaxActions: 30,
    trafficAlternateCachedProbeMargin: 0.75,
    trafficAlternateCachedProbeMaxSimilarity: 0.84,
    trafficAlternateLegsPerStart: 1,
    trafficExplorationUncertaintyShare: 0,
    trafficExplorationConfidenceFloor: 1,
    trafficAlternateUncertaintyEffortFloor: 0.18,
    trafficAlternateUncertaintyEffortExponent: 1.15,
  }),
  balanced: Object.freeze({
    maxAttempts: 20,
    softExpansionBudget: 500000,
    softBudgetMinAttempts: 8,
    preflightOpeningExpansions: 1400,
    preflightLaterExpansions: 1200,
    lightStartExpansions: 7000,
    fullCourseExpansions: 52000,
    primaryWitnessRoutes: 3,
    trafficEnabled: true,
    trafficEpochs: 2,
    trafficAlternateMaxNewSearchesPerEpoch: 10,
    trafficAlternateExpansions: 450,
    trafficAlternateMaxActions: 34,
    trafficAlternateCachedProbeMargin: 0.40,
    trafficAlternateCachedProbeMaxSimilarity: 0.88,
    trafficAlternateLegsPerStart: 1,
    // Exploration only: admit 18% of the raw/effective gap while confidence is
    // still at least .20. Final candidate value never uses this relaxed score.
    trafficExplorationUncertaintyShare: 0.18,
    trafficExplorationConfidenceFloor: 0.20,
    trafficAlternateUncertaintyEffortFloor: 0.26,
    trafficAlternateUncertaintyEffortExponent: 0.95,
  }),
  thorough: Object.freeze({
    maxAttempts: 36,
    softExpansionBudget: 850000,
    softBudgetMinAttempts: 10,
    preflightOpeningExpansions: 1800,
    preflightLaterExpansions: 1600,
    lightStartExpansions: 9500,
    fullCourseExpansions: 68000,
    primaryWitnessRoutes: 4,
    trafficEnabled: true,
    trafficEpochs: 3,
    trafficAlternateMaxNewSearchesPerEpoch: 16,
    trafficAlternateExpansions: 600,
    trafficAlternateMaxActions: 36,
    trafficAlternateCachedProbeMargin: 0.15,
    trafficAlternateCachedProbeMaxSimilarity: 0.92,
    trafficAlternateLegsPerStart: 2,
    // Exploration only: look farther into high raw congestion, but never below
    // .10 confidence and never use this relaxed value to choose the final route.
    trafficExplorationUncertaintyShare: 0.35,
    trafficExplorationConfidenceFloor: 0.10,
    trafficAlternateUncertaintyEffortFloor: 0.36,
    trafficAlternateUncertaintyEffortExponent: 0.78,
  })
});
const DIAGNOSTIC_ATTEMPTS = 24;
const DIAGNOSTIC_PLAYER_COUNTS = [2, 4, 6];
const DIAGNOSTIC_DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
const DIAGNOSTIC_LENGTHS = ["short", "moderate", "long", "epic"];
const MIN_LENGTH_RAW = 28;
const MIN_SHARED_EDGE = 5;
const DOCK_BRIDGE_GAP = 3;
const MAX_DOCK_COUNT = 2;
const DEFAULT_STARTING_ENERGY = ROUTE_ENERGY_ECONOMY_DEFAULTS.startingEnergy;
const DEFAULT_STARTING_UPGRADE_CARDS = ROUTE_ENERGY_ECONOMY_DEFAULTS.startingUpgradeCards;

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
const NO_DOCK_START_EDGE_FEATURE_TYPES = new Set([
  "wall",
  "redWall",
  "greenWall",
  "repulsor",
  "ledge"
]);
// Closest-match fallback is intentionally broader than exact acceptance. These
// failures describe courses that are still structurally playable but materially
// worse fallback choices. Unknown/new hard-failure labels remain ineligible by
// default so a future structural rule cannot silently leak into closest-match.
const FALLBACK_SOFT_FAILURE_PENALTIES = new Map([
  ["normal-start-balance", 45],
  ["competitive-start-balance", 60],
  ["priced-start-balance", 55],
  ["competitive-start-availability", 90],
  ["unused-board", 50],
  ["too-short", 80]
]);
const OVERLAY_UPDATE_INTERVAL = 4;
const LIGHT_START_SURPLUS = 2;
const LIGHT_START_MAX_EXPANSIONS = 7000;
const LIGHT_START_MAX_ACTIONS = 18;
// Universal cheap course preflight. These searches intentionally use a much
// smaller budget than final contextual analysis: they are an audition, never a
// proof of reachability. A capped or short-horizon route sketch is recorded as
// incomplete and handed to the exact contextual pass instead of causing a retry.
const COURSE_PREFLIGHT_OPENING_MAX_ACTIONS = 18;
const COURSE_PREFLIGHT_LATER_MAX_ACTIONS = 20;
// v12 design invariant: cheap pruning may reduce how many Normal/priced starts
// receive rich follow-up, but it must use the same Energy-economy objective as
// production whenever Energy/upgrades are active. Energy Crisis (lighterGame)
// is currently the only rule that removes that economy entirely.
//
// This bounded coherent audition is therefore allowed to be *less exhaustive*,
// not strategically different. Competitive never uses it: Competitive evaluates
// every physical start because players themselves block spaces before selection.
const COURSE_PREFLIGHT_DIFFICULTY_MARGIN = 35;
const COURSE_PREFLIGHT_LENGTH_MARGIN = 40;
const FULL_START_OUTLIER_Z = 2.25;
const NORMAL_START_FAIRNESS_STDDEV_LIMIT = 14;
const NORMAL_START_FAIRNESS_STDDEV_FLOOR = 9;

function getNormalStartFairnessStdDevLimit(startCount, playerCount) {
  // With surplus starts, Normal can ask for a somewhat tighter field without
  // changing legality or making player count the target. As surplus disappears,
  // relax smoothly back to the ordinary 14-point fairness limit.
  const players = Math.max(1, Math.floor(Number(playerCount) || 1));
  const starts = Math.max(players, Math.floor(Number(startCount) || players));
  const excessPerPlayer = Math.max(0, starts - players) / players;
  const tighteningShare = excessPerPlayer / (1 + excessPerPlayer);
  return NORMAL_START_FAIRNESS_STDDEV_LIMIT -
    (NORMAL_START_FAIRNESS_STDDEV_LIMIT - NORMAL_START_FAIRNESS_STDDEV_FLOOR) * tighteningShare;
}

function getNormalStartPruneBatchSize(startCount, playerCount) {
  // Make coarse progress while the field has abundant surplus, then recompute
  // after each individual removal once we reach 2x the requested player count.
  // Example: 4 players with 12 starts prunes 12 -> 10 -> 8 in batches of two,
  // then uses single-start passes only if the recomputed field still needs work.
  const players = Math.max(1, Math.floor(Number(playerCount) || 1));
  const starts = Math.max(players, Math.floor(Number(startCount) || players));
  return starts > players * 2 ? 2 : 1;
}

const SCENARIO_RENDER_INTERVAL_MS = 125;
const BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD = 0.16;
const BOARD_PROFILE_HAZARD_DENSITY_WEIGHT = 2.4;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
const AUDIT_RENDER_MARGIN = 30;
const BOARD_VIEW_MODES = {
  photos: "photos",
  icons: "icons"
};
const AUDIT_FEATURE_TYPES = [
  { id: "battery", label: "Batteries" },
  { id: "belt", label: "Conveyors" },
  { id: "chopShop", label: "Chop Shops" },
  { id: "checkpoint", label: "Checkpoints" },
  { id: "crusher", label: "Crushers" },
  { id: "flamethrower", label: "Flamethrowers" },
  { id: "gear", label: "Gears" },
  { id: "homingMissile", label: "Homing Missiles" },
  { id: "laser", label: "Lasers" },
  { id: "ledge", label: "Ledges" },
  { id: "oil", label: "Oil" },
  { id: "pit", label: "Pits" },
  { id: "portal", label: "Portals" },
  { id: "push", label: "Push Panels" },
  { id: "randomizer", label: "Randomizers" },
  { id: "radiation", label: "Radiation" },
  { id: "radioactiveWaste", label: "Radioactive Waste" },
  { id: "ramp", label: "Ramps" },
  { id: "redWall", label: "Red Walls" },
  { id: "repulsor", label: "Repulsor Fields" },
  { id: "greenWall", label: "Green Walls" },
  { id: "start", label: "Starts" },
  { id: "teleporter", label: "Teleporters" },
  { id: "trapdoor", label: "Trapdoors" },
  { id: "wall", label: "Walls" },
  { id: "water", label: "Water" }
].sort((left, right) => left.label.localeCompare(right.label));
const PIECE_DATA_FILES = [
  "30th-docking-bay-a",
  "30th-docking-bay-b",
  "all-roads",
  "assembly",
  "black-gold",
  "blueprint",
  "cactus",
  "circles",
  "circuit-trap",
  "coliseum",
  "coming-and-going",
  "concentric",
  "confusion",
  "convergence",
  "docking-bay-a",
  "docking-bay-b",
  "double-helix",
  "double-zap",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "in-and-out",
  "chasm",
  "falling",
  "gear-box",
  "labyrinth",
  "laser-maze",
  "links",
  "locked",
  "meeple",
  "mergers",
  "merry-go-round",
  "mb-docking-bay-a",
  "mb-docking-bay-b",
  "mb-tile-1a",
  "mb-tile-1b",
  "mb-tile-2a",
  "mb-tile-2b",
  "mb-tile-3a",
  "mb-tile-3b",
  "mb-tile-4a",
  "mb-tile-4b",
  "mb-tile-5a",
  "mb-tile-5b",
  "mb-tile-6a",
  "mb-tile-6b",
  "mb-tile-7a",
  "mb-tile-7b",
  "mb-tile-8a",
  "mb-tile-8b",
  "mb-tile-9a",
  "mb-tile-9b",
  "mb-tile-10a",
  "mb-tile-10b",
  "mb-tile-11a",
  "mb-tile-11b",
  "mb-tile-12a",
  "mb-tile-12b",
  "mb-tile-13a",
  "mb-tile-13b",
  "mb-tile-14a",
  "mb-tile-14b",
  "mb-tile-15a",
  "mb-tile-15b",
  "mb-tile-16a",
  "mb-tile-16b",
  "mb-tile-17a",
  "mb-tile-17b",
  "misdirection",
  "portal-palace",
  "pushy",
  "sampler",
  "spin-class",
  "sidewinder",
  "steps",
  "stop-and-go",
  "straight-a-ways",
  "styx",
  "tabula-rasa",
  "tempest",
  "the-abyss",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-pits",
  "the-wave",
  "the-x",
  "the-zone",
  "toasted",
  "transition",
  "trench-run",
  "vacancy",
  "water-park",
  "winding",
  "whirlpool"
];
const DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES = new Set(["wall", "laser"]);

function isCheckpointActiveFeature(feature, options = {}) {
  if (DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES.has(feature?.type)) {
    return true;
  }

  return Boolean(options.movingTargets && feature?.type === "belt");
}

let currentScenario = null;
let cachedAssets = null;
let scenarioAnimationFrameId = null;
let lastScenarioRenderTime = 0;
let isGenerating = false;
let generationStopRequested = false;
let boardAuditInitialized = false;
let boardAuditState = {
  pieceId: null,
  hoverTile: null,
  selectedFeatures: new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id))
};
let courseExplanationState = {
  scenarioRef: null,
  userPinnedOpen: false,
  manualClosedScenarioRef: null
};
let routeInspectionState = {
  kind: null,
  key: null
};
let traceSelectionState = {
  startIndices: new Set()
};
let lastRenderDiagnostics = {
  blankFallbackTriggered: false
};

function createVariantRuleNameElement(variant) {
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = variant.label;
  return nameEl;
}

function createVariantCategoryBulkRow(category) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule variant-bulk-rule";

  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";

  const buttonEl = document.createElement("button");
  buttonEl.className = "variant-state";
  buttonEl.type = "button";
  buttonEl.dataset.variantAction = "toggle-category";
  buttonEl.dataset.variantCategory = category;

  rowEl.append(nameEl, buttonEl);
  return rowEl;
}

function getOverlayControlButtons() {
  return Array.from(document.querySelectorAll("[data-overlay-control]"));
}

function isOverlayModeAvailable(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (!pieceMap) {
    return true;
  }
  const expansionIds = getSelectedExpansionIds(preferences);
  return getAvailableOverlayIds(pieceMap, expansionIds).length > 0;
}

function getOverlayUnavailabilityReason(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  return isOverlayModeAvailable(preferences, pieceMap)
    ? null
    : "Requires overlay-capable boards or tokens in the selected sets.";
}

function setOverlayModeControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getOverlayControlButtons();
  if (!targets.length) {
    return;
  }

  const normalized = normalizeOverlayMode(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.overlayMode = normalized;
    button.dataset.state = normalized === OVERLAY_MODES.no
      ? "off"
      : normalized === OVERLAY_MODES.yes
        ? "forced"
        : "allowed";
    button.textContent = formatOverlayMode(normalized);
    button.title = `Overlays: ${formatOverlayMode(normalized)}. Click to cycle No, Tokens, Boards, Both.`;
    button.setAttribute("aria-label", button.title);
  });
}

function updateOverlayAvailability(preferences = getPreferencesFromControls()) {
  const reason = getOverlayUnavailabilityReason(preferences);
  getOverlayControlButtons().forEach((buttonEl) => {
    if (reason) {
      buttonEl.dataset.unavailableReason = reason;
      buttonEl.classList.add("unavailable");
      buttonEl.setAttribute("aria-disabled", "true");
      buttonEl.title = reason;
      buttonEl.setAttribute("aria-label", `Overlays: unavailable. ${reason}`);
    } else {
      delete buttonEl.dataset.unavailableReason;
      buttonEl.classList.remove("unavailable");
      buttonEl.removeAttribute("aria-disabled");
      const mode = normalizeOverlayMode(buttonEl.value);
      buttonEl.title = `Overlays: ${formatOverlayMode(mode)}. Click to cycle No, Tokens, Boards, Both.`;
      buttonEl.setAttribute("aria-label", buttonEl.title);
    }
  });
}

function cycleOverlayModeControl() {
  const buttonEl = document.getElementById("overlay-mode");
  if (!buttonEl) {
    return;
  }
  if (buttonEl.dataset.unavailableReason) {
    showToast(buttonEl.dataset.unavailableReason);
    return;
  }

  const current = normalizeOverlayMode(buttonEl.value);
  const currentIndex = OVERLAY_MODE_CYCLE.indexOf(current);
  const next = OVERLAY_MODE_CYCLE[(currentIndex + 1) % OVERLAY_MODE_CYCLE.length];
  setOverlayModeControl(next);
  updateVariantSummary();
}

function createOverlayModeRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Controls whether available overlay-capable boards and tokens may be placed as overlays.";
  rowEl.dataset.ruleSearch = "overlays board layout setup layout master builder tokens boards";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Overlays";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Setup & Layout";
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = "Allows overlay-capable boards, tokens, or both to be placed over the main factory layout.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "overlay-mode";
  }
  buttonEl.className = "variant-state overlay-state";
  buttonEl.type = "button";
  buttonEl.dataset.overlayControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("overlay-mode");
  setOverlayModeControl(primary?.value ?? OVERLAY_MODES.yes, buttonEl);
  return rowEl;
}

function normalizeActFastControlChoice(choice, variantState = null, mode = null) {
  if (ACT_FAST_CONTROL_CHOICES.some((entry) => entry.id === choice)) {
    return choice;
  }
  if (mode && ACT_FAST_MODE_IDS.has(mode)) {
    return mode;
  }
  const normalizedState = normalizeVariantState(variantState);
  return normalizedState === "allowed" ? "allowed" : normalizedState === "off" ? "off" : "allowed";
}

function getActFastControlChoice(buttonEl = null) {
  const button = buttonEl ?? document.getElementById(VARIANT_CONTROL_IDS.actFast);
  return normalizeActFastControlChoice(
    button?.dataset.actFastChoice,
    button?.dataset.state,
    button?.dataset.actFastMode
  );
}

function getActFastModeFromControls() {
  const button = document.getElementById(VARIANT_CONTROL_IDS.actFast);
  const mode = button?.dataset.actFastMode ?? null;
  return ACT_FAST_MODE_IDS.has(mode) ? mode : null;
}

function setActFastControlChoice(choice, buttonEl = null) {
  const normalizedChoice = normalizeActFastControlChoice(choice);
  const choiceDef = ACT_FAST_CONTROL_CHOICES.find((entry) => entry.id === normalizedChoice) ?? ACT_FAST_CONTROL_CHOICES[0];
  const targets = buttonEl
    ? [buttonEl]
    : Array.from(document.querySelectorAll('[data-variant-id="actFast"]'));
  targets.forEach((button) => {
    button.dataset.state = choiceDef.variantState;
    button.dataset.actFastChoice = choiceDef.id;
    if (choiceDef.mode) {
      button.dataset.actFastMode = choiceDef.mode;
    } else {
      delete button.dataset.actFastMode;
    }
    button.textContent = choiceDef.shortLabel;
    button.title = choiceDef.label;
    button.setAttribute("aria-label", `Act Fast: ${choiceDef.label}`);
  });
}

function cycleActFastControlChoice() {
  const current = getActFastControlChoice();
  const currentIndex = ACT_FAST_CONTROL_CHOICES.findIndex((entry) => entry.id === current);
  const next = ACT_FAST_CONTROL_CHOICES[(currentIndex + 1) % ACT_FAST_CONTROL_CHOICES.length];
  setActFastControlChoice(next.id);
  if (next.variantState === "forced") {
    getConflictingVariantIds("actFast").forEach((conflictId) => {
      if (getVariantControlState(conflictId) === "forced") {
        setVariantControlState(conflictId, "off");
        showToast(`${getVariantDefinitionLabel(conflictId)} was turned off because Act Fast is fixed.`);
      }
    });
  }
  updateVariantAvailability();
  updateVariantSummary();
}

function createVariantRuleRow(variant, options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = variant.description;
  rowEl.dataset.ruleSearch = [
    variant.label,
    variant.officialName,
    variant.sourceLabel,
    variant.description,
    variant.category,
    getVariantUiCategoryLabel(variant)
  ].filter(Boolean).join(" ").toLowerCase();

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = createVariantRuleNameElement(variant);
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = getVariantUiCategoryLabel(variant);
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription && variant.description) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = variant.description;
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = variant.controlId;
  }
  buttonEl.className = "variant-state";
  buttonEl.type = "button";
  buttonEl.dataset.variantId = variant.id;
  if (options.mirror) {
    buttonEl.dataset.variantMirror = "true";
  }

  rowEl.append(nameWrapEl, buttonEl);
  if (variant.id === "actFast") {
    const primary = document.getElementById(VARIANT_CONTROL_IDS.actFast);
    setActFastControlChoice(primary ? getActFastControlChoice(primary) : variant.defaultState, buttonEl);
  } else {
    setVariantControlState(variant.id, options.mirror ? getVariantControlState(variant.id) : variant.defaultState, buttonEl);
  }
  return rowEl;
}

function renderOptionalRulesIndex() {
  const listEl = document.getElementById("optional-rules-index-list");
  if (!listEl) {
    return;
  }
  listEl.replaceChildren();
  const entries = [
    { type: "overlay", label: "Overlays" },
    ...VARIANT_DEFINITIONS.map((variant) => ({ type: "variant", label: variant.label, variant }))
  ].sort((left, right) => left.label.localeCompare(right.label));

  entries.forEach((entry) => {
    if (entry.type === "overlay") {
      listEl.appendChild(createOverlayModeRow({ mirror: true, showCategory: true, showDescription: true }));
      return;
    }
    listEl.appendChild(createVariantRuleRow(entry.variant, { mirror: true, showCategory: true, showDescription: true }));
  });
  updateVariantAvailability();
}

function filterOptionalRulesIndex(query = "") {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll("#optional-rules-index-list .variant-rule").forEach((rowEl) => {
    const haystack = rowEl.dataset.ruleSearch ?? rowEl.textContent?.toLowerCase() ?? "";
    rowEl.classList.toggle("hidden", Boolean(normalized) && !haystack.includes(normalized));
  });
}

function openOptionalRulesDialog() {
  const dialog = document.getElementById("optional-rules-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  const searchEl = document.getElementById("optional-rules-search");
  if (searchEl) {
    searchEl.value = "";
    filterOptionalRulesIndex("");
    requestAnimationFrame(() => searchEl.focus());
  }
}

function closeOptionalRulesDialog() {
  const dialog = document.getElementById("optional-rules-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function renderVariantControls() {
  const menuEls = Array.from(document.querySelectorAll("[data-variant-menu]"));
  if (!menuEls.length) {
    return;
  }

  menuEls.forEach((menuEl) => {
    const category = menuEl.dataset.variantCategory;
    const variants = getVariantsForUiCategory(category);
    menuEl.replaceChildren();

    const bulkRowEl = createVariantCategoryBulkRow(category);
    menuEl.appendChild(bulkRowEl);

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      menuEl.appendChild(createOverlayModeRow());
    }

    variants.forEach((variant) => {
      menuEl.appendChild(createVariantRuleRow(variant));
    });
  });

  renderOptionalRulesIndex();
  updateVariantSummary();
}

function getVariantDefinitionLabel(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.label ?? variantId;
}

function getVariantDefinition(variantId) {
  return getRegisteredVariantDefinition(variantId);
}

function getVariantStateCopy(variantId, state) {
  const normalized = normalizeVariantState(state);
  return getVariantDefinition(variantId)?.stateLabels?.[normalized] ?? VARIANT_STATES[normalized];
}

function getVariantPreferenceState(preferences = {}, variantId) {
  const directState = preferences.allowedVariantRules?.[variantId];
  if (directState !== undefined) {
    return normalizeVariantState(directState);
  }

  if (variantId === "staggeredBoards" && typeof preferences.alignedLayout === "boolean") {
    return preferences.alignedLayout ? "off" : "forced";
  }

  return normalizeVariantState(
    VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.defaultState ?? "off"
  );
}

function getExtraDockModeState(preferences = {}) {
  if (preferences.extraDocks === true) {
    return "forced";
  }
  if (preferences.extraDocks === false) {
    return "off";
  }
  return getVariantPreferenceState(preferences, "extraDocks");
}

async function loadJSON(path) {
  // Browser generation uses fetch as before. The calibration runner imports this
  // module directly in Node, where project data should be read from disk rather
  // than through a web server. No external package is needed for either path.
  if (typeof window === "undefined" && typeof process !== "undefined") {
    const { readFile } = await import("node:fs/promises");
    const fileUrl = new URL(path, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
  }

  const res = await fetch(versionedPath(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function loadOptionalJSON(path) {
  try {
    return await loadJSON(path);
  } catch {
    // Calibration is an optimization only. A missing or stale calibration file
    // must never prevent ordinary course generation.
    return null;
  }
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = versionedPath(src);
  });
}

async function loadPieceImage(assets, pieceId) {
  const piece = assets.pieceMap[pieceId];
  if (!piece?.image) {
    return null;
  }

  if (assets.imageMap[pieceId]) {
    return assets.imageMap[pieceId];
  }

  if (!assets.imageLoadPromises.has(pieceId)) {
    const promise = loadImage(piece.image)
      .then((img) => {
        assets.imageMap[pieceId] = img;
        return img;
      })
      .catch((error) => {
        console.warn(`Unable to load piece image for ${pieceId}: ${piece.image}`, error);
        return null;
      })
      .finally(() => {
        assets.imageLoadPromises.delete(pieceId);
      });
    assets.imageLoadPromises.set(pieceId, promise);
  }

  return assets.imageLoadPromises.get(pieceId);
}

async function loadPieceImages(assets, pieceIds) {
  await Promise.all([...new Set(pieceIds)].map((pieceId) => loadPieceImage(assets, pieceId)));
}

function getPlacementImagePieceIds(placements = [], pieceMap = {}) {
  return placements
    .map((placement) => placement.pieceId)
    .filter((pieceId) => pieceMap[pieceId]?.image);
}

async function ensureScenarioImages(assets, scenario) {
  await loadPieceImages(assets, getPlacementImagePieceIds(scenario.placements, scenario.pieceMap));
}

function pruneImageCache(assets, keepPieceIds = []) {
  const keep = new Set(keepPieceIds);

  for (const pieceId of Object.keys(assets.imageMap)) {
    if (!keep.has(pieceId)) {
      delete assets.imageMap[pieceId];
    }
  }
}

async function loadAssets() {
  if (cachedAssets) {
    return cachedAssets;
  }

  const [pieces, rawConstructionGuidance] = await Promise.all([
    Promise.all(
      PIECE_DATA_FILES.map(async (pieceId) => loadJSON(`./data/${pieceId}.json`))
    ),
    loadOptionalJSON("./calibration/construction-guidance.json")
  ]);
  const pieceMap = Object.fromEntries(
    pieces.map((piece) => [piece.id, piece])
  );
  const constructionGuidance = normalizeConstructionGuidanceCalibration(rawConstructionGuidance);

  for (const piece of Object.values(pieceMap)) {
    piece.overlayCapable = piece.expansionId === "master-builder" && (
      piece.kind === "overlay" ||
      (piece.width === 6 && piece.height === 6)
    );
  }

  for (const piece of Object.values(pieceMap)) {
    piece.boardProfile = deriveBoardProfile(piece);
    piece.derivedBias = piece.boardProfile.bias;
  }

  cachedAssets = {
    pieceMap,
    imageMap: {},
    imageLoadPromises: new Map(),
    constructionGuidance
  };
  return cachedAssets;
}

let activeGenerationRandom = null;
let devFrozenGenerationSeed = null;

function createSeededGenerationRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generationRandom() {
  return activeGenerationRandom ? activeGenerationRandom() : Math.random();
}

async function withGenerationRandomSeed(seed, callback) {
  const previousRandom = activeGenerationRandom;
  activeGenerationRandom = Number.isInteger(seed)
    ? createSeededGenerationRandom(seed)
    : null;
  try {
    return await callback();
  } finally {
    activeGenerationRandom = previousRandom;
  }
}

function createDevGenerationSeed() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] >>> 0;
  }
  return ((Date.now() ^ Math.floor((typeof performance !== "undefined" ? performance.now() : 0) * 1000)) >>> 0);
}

function formatDevGenerationSeed(seed) {
  return Number(seed >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

function parseDevGenerationSeed(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const hexText = text.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{1,8}$/.test(hexText)) {
    return Number.parseInt(hexText, 16) >>> 0;
  }

  if (/^[0-9]{1,10}$/.test(text)) {
    const decimal = Number(text);
    if (Number.isSafeInteger(decimal) && decimal >= 0 && decimal <= 0xFFFFFFFF) {
      return decimal >>> 0;
    }
  }

  return null;
}

function sample(items) {
  return items[Math.floor(generationRandom() * items.length)];
}

function shuffle(items) {
  const out = [...items];

  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(generationRandom() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }

  return out;
}

function sampleManyWeighted(items, count) {
  const pool = [...items];
  const out = [];

  while (pool.length && out.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(0, item.weight ?? 1), 0);
    if (totalWeight <= 0) {
      break;
    }

    let roll = generationRandom() * totalWeight;
    let index = 0;

    for (; index < pool.length; index += 1) {
      roll -= Math.max(0, pool[index].weight ?? 1);
      if (roll <= 0) {
        break;
      }
    }

    out.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }

  return out;
}

function countConnectedComponents(graph) {
  if (!graph?.nodes?.length) {
    return 0;
  }

  const seen = new Set();
  let components = 0;

  for (const node of graph.nodes) {
    if (seen.has(node.index)) {
      continue;
    }

    components += 1;
    const queue = [node.index];
    seen.add(node.index);

    while (queue.length) {
      const current = queue.shift();
      for (const next of graph.adjacency.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  return components;
}

function getGraphDiameter(graph) {
  if (!graph?.nodes?.length) {
    return 0;
  }

  let diameter = 0;

  for (const node of graph.nodes) {
    const seen = new Set([node.index]);
    const queue = [{ index: node.index, depth: 0 }];

    while (queue.length) {
      const current = queue.shift();
      diameter = Math.max(diameter, current.depth);

      for (const nextIndex of graph.adjacency.get(current.index) || []) {
        if (seen.has(nextIndex)) {
          continue;
        }
        seen.add(nextIndex);
        queue.push({ index: nextIndex, depth: current.depth + 1 });
      }
    }
  }

  return diameter;
}

function isSingleSmallBoardCourseAllowed(preferences = {}) {
  return (preferences.difficulty ?? "moderate") === "easy" && (preferences.length ?? "moderate") === "short";
}

function isSmallBoardLayoutAcceptable(boardPlacements, pieceMap, layoutValidation, preferences = {}) {
  const smallBoardPlacements = boardPlacements.filter((placement) => pieceMap[placement.pieceId]?.kind === "small");
  const allSmallBoards = smallBoardPlacements.length === boardPlacements.length && boardPlacements.length > 0;
  const lengthPreference = preferences.length ?? "moderate";

  if (!allSmallBoards) {
    return true;
  }

  if (boardPlacements.length === 1) {
    return isSingleSmallBoardCourseAllowed(preferences);
  }

  if ((lengthPreference === "long" || lengthPreference === "epic") && boardPlacements.length < 4) {
    return false;
  }

  if (boardPlacements.length < 4) {
    return true;
  }

  const rects = buildBoardRects(boardPlacements, pieceMap);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const spanWidth = maxX - minX;
  const spanHeight = maxY - minY;
  const aspectRatio = Math.max(spanWidth, spanHeight) / Math.max(1, Math.min(spanWidth, spanHeight));
  const graph = layoutValidation?.graph;
  const degrees = graph?.nodes?.map((node) => (graph.adjacency.get(node.index) || []).length) ?? [];
  const maxDegree = degrees.length ? Math.max(...degrees) : 0;
  const leafCount = degrees.filter((degree) => degree <= 1).length;
  const diameter = getGraphDiameter(graph);
  const chainLike = leafCount <= 2 && maxDegree <= 2 && diameter >= boardPlacements.length - 1;

  if (chainLike && boardPlacements.length >= 5) {
    return false;
  }

  if (aspectRatio > 3.2) {
    return false;
  }

  return true;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}


function generationNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function formatGenerationDuration(ms) {
  if (!Number.isFinite(ms)) return "0.0s";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function getGenerationConstraintHint(preferences = {}) {
  const mode = normalizeGenerationMode(preferences.generationMode);
  const length = preferences.length ?? "any";
  const playerCount = Number(preferences.playerCount) || 4;

  if (length === "epic") {
    return "Epic courses can take substantially longer to check.";
  }
  if (mode === "fastest" || mode === "fast") {
    return "This mode might be faster.";
  }
  if (mode === "balanced" || mode === "thorough") {
    return "This mode might take a little longer.";
  }
  if (length === "long") {
    return "Long courses can take longer to check.";
  }
  if (playerCount >= 6) {
    return "More players can make some layouts take longer to check.";
  }
  if (preferences.difficulty !== "any" || preferences.length !== "any") {
    return "A specific difficulty or length can take a few tries.";
  }
  return "";
}

const CONTEXTUAL_PROFILE_TIME_KEYS = [
  "queueMs",
  "currentKeyMs",
  "goalCompletionMs",
  "simulationMs",
  "actionScoringMs",
  "historyBuildMs",
  "destinationBuildMs",
  "nextKeyMs",
  "dominanceMs"
];
const CONTEXTUAL_PROFILE_COUNT_KEYS = [
  "actionCandidates",
  "simulationCalls",
  "blockedTransitions",
  "programLegalityPrunes",
  "destinationCandidates",
  "acceptedStates",
  "dominatedStates",
  "completedGoals",
  "searchesWithGoal",
  "cappedZeroGoalSearches",
  "cappedWithGoalSearches",
  "firstGoalExpansionTotal",
  "postFirstGoalExpansions",
  "optionalCompletionSearches",
  "optionalCompletionStops",
  "optionalCompletionShortReturns",
  "cappedZeroGoalExpansions",
  "cappedWithGoalExpansions",
  "exactContextualSearches",
  "exactContextualExpansions",
  "horizonSolidSearches",
  "horizonUncertainSearches",
  "horizonSpeculativeSearches",
  "horizonFirstGoalUncertain",
  "horizonFirstGoalSpeculative",
  "horizonOptionalSuppressed",
  "physicalCacheHits",
  "physicalCacheMisses",
  "dominanceKeysFull",
  "dominanceKeysPhysical",
  "dominanceKeysPhysicalPhase",
  "dominanceKeysNoProgramDetail",
  "dominanceKeysNoPrevious",
  "dominanceKeysNoUsage",
  "dominanceKeysNoAgain",
  "dominanceKeysNoAbsolute",
  "dominanceKeysNoEnergy",
  "dominanceKeysNoCards",
  "dominanceKeysNoEconomyShadow",
  "dominanceKeysNoGoal",
  "dominanceUsageParetoStates",
  "dominanceUsageParetoDominated",
  "dominanceUsageParetoMultiStateGroups",
];

function createEmptyContextualProfile() {
  return Object.fromEntries([
    ...CONTEXTUAL_PROFILE_TIME_KEYS,
    ...CONTEXTUAL_PROFILE_COUNT_KEYS
  ].map((key) => [key, 0]));
}

function addContextualProfile(target, source) {
  if (!source) return target;
  for (const key of CONTEXTUAL_PROFILE_TIME_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  }
  for (const key of CONTEXTUAL_PROFILE_COUNT_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  }
  return target;
}

function finalizeContextualProfile(profile) {
  const finalized = { ...profile };
  for (const key of CONTEXTUAL_PROFILE_TIME_KEYS) {
    finalized[key] = Number((finalized[key] ?? 0).toFixed(2));
  }
  return finalized;
}

function summarizeRouteSearchDelta(before, after) {
  const beforeCount = before?.routeSearchCount ?? 0;
  const searches = (after?.routeSearches ?? []).slice(beforeCount);
  const expansions = searches.reduce((sum, entry) => sum + (entry.expansions ?? 0), 0);
  const durationMs = searches.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  const capped = searches.filter((entry) => entry.hitExpansionCap).length;
  const slowest = searches.reduce(
    (best, entry) => !best || (entry.durationMs ?? 0) > (best.durationMs ?? 0) ? entry : best,
    null
  );
  const totalsByKind = {};
  const contextualProfile = createEmptyContextualProfile();
  let contextualSearches = 0;
  let contextualExpansions = 0;
  let contextualDurationMs = 0;
  for (const entry of searches) {
    const kind = entry.kind ?? "unknown";
    const bucket = totalsByKind[kind] ?? {
      searches: 0,
      expansions: 0,
      durationMs: 0,
      capped: 0
    };
    bucket.searches += 1;
    bucket.expansions += entry.expansions ?? 0;
    bucket.durationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) bucket.capped += 1;
    totalsByKind[kind] = bucket;

    if (entry.contextualProfile) {
      contextualSearches += 1;
      contextualExpansions += entry.expansions ?? 0;
      contextualDurationMs += entry.durationMs ?? 0;
      addContextualProfile(contextualProfile, entry.contextualProfile);
    }
  }
  Object.values(totalsByKind).forEach((bucket) => {
    bucket.durationMs = Number(bucket.durationMs.toFixed(2));
  });
  return {
    searches: searches.length,
    expansions,
    durationMs: Number(durationMs.toFixed(2)),
    capped,
    slowest,
    totalsByKind,
    contextualSearches,
    contextualExpansions,
    contextualDurationMs: Number(contextualDurationMs.toFixed(2)),
    contextualProfile: finalizeContextualProfile(contextualProfile)
  };
}

function cloneContextualSearchHealth(health = null) {
  if (!health) return null;
  return {
    zeroRouteCapFailures: health.zeroRouteCapFailures ?? 0,
    distinctStarts: health.distinctStarts ?? 0,
    cappedContextsThisLeg: health.cappedContextsThisLeg ?? 0,
    cappedStartsThisLeg: health.cappedStartsThisLeg ?? 0,
    survivingStarts: health.survivingStarts ?? 0,
    maximumPossibleStarts: health.maximumPossibleStarts ?? health.survivingStarts ?? 0,
    requiredStarts: health.requiredStarts ?? 0,
    preferredStarts: health.preferredStarts ?? null,
    sourceStarts: health.sourceStarts ?? 0,
    processedStartsThisLeg: health.processedStartsThisLeg ?? null,
    lostStarts: health.lostStarts ?? 0,
    legIndex: health.legIndex ?? null,
    legNumber: health.legNumber ?? null,
    flagCount: health.flagCount ?? 0,
    seededOpeningStarts: health.seededOpeningStarts ?? 0,
    catalogueEntries: health.catalogueEntries ?? 0,
    catalogueLookups: health.catalogueLookups ?? 0,
    catalogueCacheHits: health.catalogueCacheHits ?? 0,
    catalogueSearches: health.catalogueSearches ?? 0,
    catalogueCappedSearches: health.catalogueCappedSearches ?? 0,
    catalogueExhaustedSearches: health.catalogueExhaustedSearches ?? 0,
    catalogueSuppressedCappedLookups: health.catalogueSuppressedCappedLookups ?? 0,
    catalogueReplayRouteChecks: health.catalogueReplayRouteChecks ?? 0,
    catalogueCompatibleLineages: health.catalogueCompatibleLineages ?? 0,
    catalogueCompatibleRoutes: health.catalogueCompatibleRoutes ?? 0,
    catalogueIncompatibleLineages: health.catalogueIncompatibleLineages ?? 0,
    catalogueRefinementSearches: health.catalogueRefinementSearches ?? 0,
    catalogueEnrichmentSearches: health.catalogueEnrichmentSearches ?? 0,
    catalogueEnrichmentSuccesses: health.catalogueEnrichmentSuccesses ?? 0,
    catalogueEnrichmentSuppressed: health.catalogueEnrichmentSuppressed ?? 0,
    survivorHistory: Array.isArray(health.survivorHistory)
      ? health.survivorHistory.map((entry) => ({ ...entry }))
      : []
  };
}

function compactRouteWork(work = null) {
  if (!work) return null;
  return {
    searches: work.searches ?? 0,
    expansions: work.expansions ?? 0,
    durationMs: work.durationMs ?? 0,
    capped: work.capped ?? 0
  };
}

function getGenerationRejectionCategory(scenario, fallbackReason = "") {
  const failures = scenario?.metrics?.hardFailures ?? [];
  if (failures.includes("normal-start-balance")) return "balance";
  if (failures.includes("competitive-start-balance")) return "competitive-balance";
  if (failures.includes("competitive-start-availability")) return "competitive-start-capacity";
  if (failures.includes("usable-starts") || failures.includes("reachable-starts")) return "start-capacity";
  if (failures.includes("unused-board")) return "unused-board";
  if (failures.includes("too-short")) return "too-short";
  if (failures.some((failure) => String(failure).startsWith("leg-"))) return "later-leg";
  if ((scenario?.metrics?.difficultyFit ?? 0) > 0) return "difficulty";
  if ((scenario?.metrics?.lengthFit ?? 0) > 0) return "length";

  const text = String(fallbackReason || "").toLowerCase();
  if (text.includes("route capacity")) return "route-capacity";
  if (text.includes("gross mismatch")) return "gross-mismatch";
  if (text.includes("checkpoint") || text.includes("choosing checkpoints")) return "checkpoint-layout";
  if (text.includes("reboot")) return "reboot-layout";
  if (text.includes("sandwiched")) return "sandwiched-layout";
  if (text.includes("subsidized")) return "subsidized-starts";
  if (text.includes("pay to win")) return "pay-to-win";
  if (text.includes("extra dock")) return "extra-docks";
  return "other";
}

function addRouteSearchKindTotals(target = {}, source = null) {
  if (!source || typeof source !== "object") return target;
  for (const [kind, bucket] of Object.entries(source)) {
    if (!bucket) continue;
    const current = target[kind] ?? {
      searches: 0,
      expansions: 0,
      durationMs: 0,
      capped: 0
    };
    current.searches += bucket.searches ?? 0;
    current.expansions += bucket.expansions ?? 0;
    current.durationMs += bucket.durationMs ?? 0;
    current.capped += bucket.capped ?? 0;
    target[kind] = current;
  }
  return target;
}

function finalizeRouteSearchKindTotals(totals = null) {
  if (!totals || typeof totals !== "object") return null;
  return Object.fromEntries(Object.entries(totals).map(([kind, bucket]) => [kind, {
    searches: bucket.searches ?? 0,
    expansions: bucket.expansions ?? 0,
    durationMs: Number((bucket.durationMs ?? 0).toFixed(2)),
    capped: bucket.capped ?? 0
  }]));
}

function formatRouteSearchKindBreakdown(totals = null) {
  if (!totals || typeof totals !== "object") return "n/a";
  const entries = Object.entries(totals)
    .filter(([, bucket]) => (bucket?.searches ?? 0) > 0)
    .sort((left, right) => (
      (right[1]?.durationMs ?? 0) - (left[1]?.durationMs ?? 0) ||
      (right[1]?.expansions ?? 0) - (left[1]?.expansions ?? 0) ||
      left[0].localeCompare(right[0])
    ));
  if (!entries.length) return "n/a";
  return entries.map(([kind, bucket]) => (
    `${kind} ${formatGenerationDuration(bucket.durationMs ?? 0)}/${bucket.searches ?? 0}s/${bucket.expansions ?? 0}exp/${bucket.capped ?? 0}cap`
  )).join("; ");
}

function summarizeGenerationRejectionEvents(events = []) {
  const byCategory = new Map();
  for (const event of events) {
    const category = event.category || "other";
    const current = byCategory.get(category) ?? {
      category,
      count: 0,
      routeSearches: 0,
      routeExpansions: 0,
      routeSearchMs: 0,
      cappedRouteSearches: 0,
      contextualSearches: 0,
      contextualExpansions: 0,
      contextualDurationMs: 0,
      contextualProfile: createEmptyContextualProfile(),
      routeSearchTotalsByKind: {}
    };
    current.count += 1;
    current.routeSearches += event.routeSearches ?? 0;
    current.routeExpansions += event.routeExpansions ?? 0;
    current.routeSearchMs += event.routeSearchMs ?? 0;
    current.cappedRouteSearches += event.cappedRouteSearches ?? 0;
    current.contextualSearches += event.contextualSearches ?? 0;
    current.contextualExpansions += event.contextualExpansions ?? 0;
    current.contextualDurationMs += event.contextualDurationMs ?? 0;
    addContextualProfile(current.contextualProfile, event.contextualProfile);
    addRouteSearchKindTotals(current.routeSearchTotalsByKind, event.routeSearchTotalsByKind);
    byCategory.set(category, current);
  }

  const categories = [...byCategory.values()]
    .map((entry) => ({
      ...entry,
      routeSearchMs: Number(entry.routeSearchMs.toFixed(2)),
      contextualDurationMs: Number(entry.contextualDurationMs.toFixed(2)),
      contextualProfile: finalizeContextualProfile(entry.contextualProfile),
      routeSearchTotalsByKind: finalizeRouteSearchKindTotals(entry.routeSearchTotalsByKind)
    }))
    .sort((left, right) => (
      right.routeExpansions - left.routeExpansions ||
      right.count - left.count ||
      left.category.localeCompare(right.category)
    ));

  return {
    total: events.length,
    totalRouteExpansions: categories.reduce((sum, entry) => sum + entry.routeExpansions, 0),
    totalCappedRouteSearches: categories.reduce((sum, entry) => sum + entry.cappedRouteSearches, 0),
    categories
  };
}

function formatContextualProfile(profile) {
  if (!profile) return "n/a";
  const timed = [
    ["simulate", profile.simulationMs ?? 0],
    ["actionScore", profile.actionScoringMs ?? 0],
    ["keys", (profile.currentKeyMs ?? 0) + (profile.nextKeyMs ?? 0)],
    ["dominance", profile.dominanceMs ?? 0],
    ["heap", profile.queueMs ?? 0],
    ["history", profile.historyBuildMs ?? 0],
    ["build", profile.destinationBuildMs ?? 0],
    ["goal", profile.goalCompletionMs ?? 0]
  ].sort((left, right) => right[1] - left[1]);
  return timed
    .map(([label, ms]) => `${label} ${formatGenerationDuration(ms)}`)
    .join(", ");
}

function formatContextualProfileShare(profile, contextualDurationMs) {
  if (!profile || !Number.isFinite(contextualDurationMs) || contextualDurationMs <= 0) {
    return "n/a";
  }
  const timed = [
    ["simulate", profile.simulationMs ?? 0],
    ["actionScore", profile.actionScoringMs ?? 0],
    ["keys", (profile.currentKeyMs ?? 0) + (profile.nextKeyMs ?? 0)],
    ["dominance", profile.dominanceMs ?? 0],
    ["heap", profile.queueMs ?? 0],
    ["history", profile.historyBuildMs ?? 0],
    ["build", profile.destinationBuildMs ?? 0],
    ["goal", profile.goalCompletionMs ?? 0]
  ].sort((left, right) => right[1] - left[1]);
  const accountedMs = timed.reduce((sum, entry) => sum + entry[1], 0);
  const otherMs = Math.max(0, contextualDurationMs - accountedMs);
  if (otherMs >= 0.5) timed.push(["other", otherMs]);
  return timed
    .filter(([, ms]) => ms >= 0.5)
    .map(([label, ms]) => {
      const share = Math.round((ms / contextualDurationMs) * 100);
      return `${label} ${share}%/${formatGenerationDuration(ms)}`;
    })
    .join(", ");
}

function formatContextualEfficiency(profile, contextualExpansions = 0) {
  if (!profile) return "n/a";
  const cacheTotal = (profile.physicalCacheHits ?? 0) + (profile.physicalCacheMisses ?? 0);
  const cacheRate = cacheTotal > 0
    ? `${Math.round(((profile.physicalCacheHits ?? 0) / cacheTotal) * 100)}%`
    : "n/a";
  const simulations = profile.simulationCalls ?? 0;
  const blockedRate = simulations > 0
    ? `${Math.round(((profile.blockedTransitions ?? 0) / simulations) * 100)}%`
    : "n/a";
  const stateOutcomes = (profile.acceptedStates ?? 0) + (profile.dominatedStates ?? 0);
  const dominatedRate = stateOutcomes > 0
    ? `${Math.round(((profile.dominatedStates ?? 0) / stateOutcomes) * 100)}%`
    : "n/a";
  const actionsPerExpansion = contextualExpansions > 0
    ? ((profile.actionCandidates ?? 0) / contextualExpansions).toFixed(2)
    : "n/a";
  return [
    `actions/exp ${actionsPerExpansion}`,
    `physical-cache ${cacheRate}`,
    `blocked ${blockedRate}`,
    `dominated ${dominatedRate}`,
    `accepted ${profile.acceptedStates ?? 0}`,
    `goals ${profile.completedGoals ?? 0}`
  ].join(", ");
}

function formatContextualGoalSearchHealth(profile, contextualSearches = 0) {
  if (!profile || !(contextualSearches > 0)) return null;
  const searchesWithGoal = profile.searchesWithGoal ?? 0;
  const cappedZero = profile.cappedZeroGoalSearches ?? 0;
  const cappedWithGoal = profile.cappedWithGoalSearches ?? 0;
  const firstGoalAvg = searchesWithGoal > 0
    ? Math.round((profile.firstGoalExpansionTotal ?? 0) / searchesWithGoal)
    : null;
  const afterFirst = profile.postFirstGoalExpansions ?? 0;
  const cappedZeroExp = profile.cappedZeroGoalExpansions ?? 0;
  const cappedWithGoalExp = profile.cappedWithGoalExpansions ?? 0;
  return [
    `goal found ${searchesWithGoal}/${contextualSearches} searches`,
    `first-goal avg ${firstGoalAvg ?? "n/a"} exp`,
    `post-first-goal ${afterFirst} exp`,
    `optional stops ${profile.optionalCompletionStops ?? 0}/${profile.optionalCompletionSearches ?? 0}`,
    `short returns ${profile.optionalCompletionShortReturns ?? 0}`,
    `capped zero-goal ${cappedZero}/${cappedZeroExp} exp`,
    `capped with-goal ${cappedWithGoal}/${cappedWithGoalExp} exp`
  ].join(", ");
}

function formatContextualFidelityHealth(profile) {
  if (!profile) return null;
  const solid = profile.horizonSolidSearches ?? 0;
  const uncertain = profile.horizonUncertainSearches ?? 0;
  const speculative = profile.horizonSpeculativeSearches ?? 0;
  if (!(solid > 0 || uncertain > 0 || speculative > 0)) return null;
  return [
    `breadth horizon solid/uncertain/speculative ${solid}/${uncertain}/${speculative}`,
    `first-goal uncertain/speculative ${profile.horizonFirstGoalUncertain ?? 0}/${profile.horizonFirstGoalSpeculative ?? 0}`,
    `optional searches suppressed ${profile.horizonOptionalSuppressed ?? 0}`,
    `exact expansions ${profile.exactContextualExpansions ?? 0}`
  ].join(", ");
}
function formatContextualDominanceKeyDiagnostics(profile) {
  const full = profile?.dominanceKeysFull ?? 0;
  if (!(full > 0)) return null;

  const physical = profile.dominanceKeysPhysical ?? 0;
  const physicalPhase = profile.dominanceKeysPhysicalPhase ?? 0;
  const fragmentation = physical > 0 ? `${(full / physical).toFixed(1)}x` : "n/a";
  const collapse = (value) => `${Math.max(0, Math.round((1 - ((value ?? full) / full)) * 100))}%`;

  return [
    `full ${full}`,
    `physical ${physical} (${fragmentation})`,
    `physical+phase ${physicalPhase}`,
    `potential collapse if ignored: program-detail ${collapse(profile.dominanceKeysNoProgramDetail)}`,
    `previous ${collapse(profile.dominanceKeysNoPrevious)}`,
    `card-use ${collapse(profile.dominanceKeysNoUsage)}`,
    `Again ${collapse(profile.dominanceKeysNoAgain)}`,
    `absolute-action ${collapse(profile.dominanceKeysNoAbsolute)}`,
    `Energy ${collapse(profile.dominanceKeysNoEnergy)}`,
    `useful-cards ${collapse(profile.dominanceKeysNoCards)}`,
    `economy-shadow ${collapse(profile.dominanceKeysNoEconomyShadow)}`,
    `moving-goal ${collapse(profile.dominanceKeysNoGoal)}`
  ].join(", ");
}

function formatContextualUsageParetoDiagnostics(profile) {
  const states = profile?.dominanceUsageParetoStates ?? 0;
  const dominated = profile?.dominanceUsageParetoDominated ?? 0;
  if (!(states > 0)) return null;
  const rate = `${Math.round((dominated / states) * 100)}%`;
  return `tracked-card Pareto ${dominated}/${states} (${rate}) potentially dominated across ${profile?.dominanceUsageParetoMultiStateGroups ?? 0} multi-state groups`;
}

function roundCourseEvaluationNumbers(text) {
  if (typeof text !== "string" || !text) {
    return text;
  }

  return text.replace(
    /(^|[^A-Za-z0-9_])(-?\d+\.\d{3,})(?![A-Za-z0-9_])/g,
    (match, prefix, numeric) => {
      const value = Number(numeric);
      if (!Number.isFinite(value)) {
        return match;
      }
      const decimals = Math.abs(value) < 10 ? 3 : 2;
      let rendered = value.toFixed(decimals);
      rendered = rendered
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
      return `${prefix}${rendered}`;
    }
  );
}

function formatContextualCounts(profile) {
  if (!profile) return "n/a";
  return [
    `actions ${profile.actionCandidates ?? 0}`,
    `simulations ${profile.simulationCalls ?? 0}`,
    `blocked ${profile.blockedTransitions ?? 0}`,
    `card-illegal ${profile.programLegalityPrunes ?? 0}`,
    `destinations ${profile.destinationCandidates ?? 0}`,
    `accepted ${profile.acceptedStates ?? 0}`,
    `dominated ${profile.dominatedStates ?? 0}`,
    `goals ${profile.completedGoals ?? 0}`,
    `physicalCache ${profile.physicalCacheHits ?? 0}/${(profile.physicalCacheHits ?? 0) + (profile.physicalCacheMisses ?? 0)} hits`
  ].join(", ");
}

function describeGenerationRejection(scenario, fallbackStage = "") {
  if (!scenario) {
    return fallbackStage
      ? `no scenario after ${fallbackStage}`
      : "candidate rejected before final classification";
  }
  const reasons = [...(scenario.metrics?.hardFailures ?? [])];
  if (!scenario.preferences?.targetGuidanceOnlyDifficulty && (scenario.metrics?.difficultyFit ?? 0) > 0) {
    reasons.push(`difficulty ${scenario.metrics.difficultyDirection ?? "mismatch"}`);
  }
  if (!scenario.preferences?.targetGuidanceOnlyLength && (scenario.metrics?.lengthFit ?? 0) > 0) {
    reasons.push(`length ${scenario.metrics.lengthDirection ?? "mismatch"}`);
  }
  return reasons.length ? reasons.join(", ") : "better fit still required";
}

function compactGenerationStage(stage = "") {
  return String(stage)
    .replace(/^Evaluating starting spaces — /, "Routing starts — ")
    .replace(/^Checking route fairness and removable pieces — /, "Checking fairness — ")
    .replace(/^Rejecting gross mismatch — /, "Rejected: ")
    .trim();
}

function titleCaseWords(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLengthLabel(lengthPreference) {
  if (lengthPreference === "any") {
    return "any";
  }
  return lengthPreference === "moderate" ? "medium" : String(lengthPreference ?? "medium");
}

function formatDifficultyLabel(difficultyPreference) {
  const labels = {
    any: "any",
    easy: "beginner",
    moderate: "intermediate",
    hard: "advanced",
    brutal: "Robots. Must. Die."
  };

  return labels[difficultyPreference] ?? String(difficultyPreference ?? "intermediate");
}

function getTuningDifficulty(difficultyPreference) {
  return difficultyPreference === "brutal" ? "hard" : (difficultyPreference ?? "moderate");
}

function isHardestDifficulty(preferences = {}) {
  return preferences.difficulty === "brutal";
}

const OVERLAY_MODES = {
  no: "no",
  tokens: "tokens",
  boards: "boards",
  yes: "yes"
};

const OVERLAY_MODE_CYCLE = [
  OVERLAY_MODES.no,
  OVERLAY_MODES.tokens,
  OVERLAY_MODES.boards,
  OVERLAY_MODES.yes
];

const ACT_FAST_CONTROL_CHOICES = [
  { id: "off", variantState: "off", mode: null, shortLabel: "No", label: "Not allowed" },
  { id: "allowed", variantState: "allowed", mode: null, shortLabel: "Yes", label: "Allowed; timer mode is chosen if Act Fast is used" },
  { id: "countdown_3m", variantState: "forced", mode: "countdown_3m", shortLabel: "3 min", label: "Always on: 3-minute programming timer" },
  { id: "countdown_2m", variantState: "forced", mode: "countdown_2m", shortLabel: "2 min", label: "Always on: 2-minute programming timer" },
  { id: "countdown_1m", variantState: "forced", mode: "countdown_1m", shortLabel: "1 min", label: "Always on: 1-minute programming timer" },
  { id: "countdown_30s", variantState: "forced", mode: "countdown_30s", shortLabel: "30 sec", label: "Always on: 30-second programming timer" },
  { id: "last_player_30s", variantState: "forced", mode: "last_player_30s", shortLabel: "Last 30s", label: "Always on: last player has 30 seconds" }
];
const ACT_FAST_MODE_IDS = new Set(ACT_FAST_CONTROL_CHOICES.filter((choice) => choice.mode).map((choice) => choice.mode));

function formatActFastMode(mode) {
  return ({
    countdown_3m: "3 min",
    countdown_2m: "2 min",
    countdown_1m: "1 min",
    countdown_30s: "30 sec",
    last_player_30s: "Last player 30 sec"
  })[mode] ?? "Yes";
}

function normalizeOverlayMode(mode) {
  return Object.prototype.hasOwnProperty.call(OVERLAY_MODES, mode) ? mode : OVERLAY_MODES.yes;
}

function formatOverlayMode(mode) {
  return {
    no: "No",
    tokens: "Tokens",
    boards: "Boards",
    yes: "Both"
  }[normalizeOverlayMode(mode)];
}

function shouldUseBoardOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.boards;
}

function shouldUseMiniOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.tokens;
}

function getSelectedExpansionIds(preferences = {}) {
  const selected = preferences.selectedExpansions ?? { roborally: true };
  return new Set(Object.entries(selected)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([expansionId]) => expansionId));
}

function formatExpansionName(expansionId) {
  const labels = {
    roborally: "Robo Rally (2023)",
    "30th-anniversary": "Robo Rally: 30th Anniversary",
    "thrills-and-spills": "Thrills & Spills",
    "master-builder": "Master Builder",
    "wet-and-wild": "Wet & Wild",
    "chaos-and-carnage": "Chaos & Carnage",
    "rr-dice": "Robo Rally Dice"
  };

  return labels[expansionId] ?? titleCaseWords(expansionId);
}

function getDifficultyThresholds() {
  return {
    easy: [0, 95],
    moderate: [90, 155],
    hard: [150, Infinity],
    // Robots. Must. Die. is intentionally a distinct top-end target rather
    // than merely Hard with a different label. The generation tuning still
    // uses the hard profile, but acceptance continues until the raw course
    // difficulty reaches this higher floor.
    brutal: [180, Infinity]
  };
}

function getLengthThresholds() {
  return {
    // Keep only a small five-point neighbor overlap. Ordinary construction is
    // target-centered; closest-match fallback remains responsible for courses
    // that miss these exact envelopes after the search budget is exhausted.
    short: [MIN_LENGTH_RAW, 150],
    moderate: [145, 210],
    long: [205, 270],
    // Epic is a bounded top-end target, not an unbounded "Long+" bucket.
    // Keeping the five-point overlap preserves the same neighbor-band behavior
    // as the existing tiers while giving very large courses an explicit ceiling.
    epic: [265, 400]
  };
}

// Gross-mismatch limits are intentionally much wider than the actual
// acceptance bands. They are used only after one complete course analysis,
// and only to avoid spending additional physical-pruning/reanalysis passes on
// a candidate that is already implausibly far from the requested target.
const GROSS_DIFFICULTY_ABORT_BANDS = {
  easy: { max: 165 },
  moderate: { min: 35, max: 225 },
  hard: { min: 75 },
  brutal: { min: 90 }
};

const GROSS_LENGTH_ABORT_BANDS = {
  short: { max: 220 },
  moderate: { min: 70, max: 285 },
  long: { min: 90, max: 390 },
  epic: { min: 140, max: 520 }
};

function getGrossCourseMismatch(metrics, preferences = {}) {
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

function formatGrossCourseMismatch(mismatch) {
  if (!mismatch?.abort) {
    return "";
  }

  const comparison = mismatch.reason.endsWith("too-low") ? "<" : ">";
  return `${mismatch.metric} ${Number(mismatch.value).toFixed(1)} ${comparison} gross ${mismatch.requested} limit ${mismatch.limit}`;
}

function getReverseSideName(pieceId, pieceMap) {
  const piece = pieceMap[pieceId];
  if (!piece?.physicalBoardId) {
    return null;
  }

  const reverseSide = Object.values(pieceMap).find((candidate) => (
    candidate.id !== pieceId &&
    candidate.physicalBoardId === piece.physicalBoardId
  ));

  return reverseSide?.name ?? null;
}

function sameTile(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

function isAuditFeatureVisible(featureType) {
  return boardAuditState.selectedFeatures.has(featureType);
}

function formatBoardLabel(pieceId, pieceMap) {
  const piece = pieceMap[pieceId];
  const name = piece?.name ?? titleCaseWords(pieceId);
  const expansion = formatExpansionName(piece?.expansionId ?? "unknown");
  const reverseSide = getReverseSideName(pieceId, pieceMap);

  return reverseSide
    ? `${name} (${expansion}; reverse side: ${reverseSide})`
    : `${name} (${expansion})`;
}


function summarizeFeature(feature) {
  return formatFeatureLabel(feature);
}

function appendAuditReadoutLine(readout, text, options = {}) {
  const line = document.createElement("div");

  if (options.strong) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    line.append(strong);
  } else {
    line.textContent = text;
  }

  readout.append(line);
}

function buildAuditFeatureFilterLabel(feature) {
  const fragment = document.createDocumentFragment();
  const text = document.createElement("span");
  text.textContent = feature.label;
  fragment.append(text);
  return fragment;
}

function countBoardLasers(tileMap) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === "laser").length;
  }
  return total;
}

function countFeatureTypeInTileMap(tileMap, featureType) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === featureType).length;
  }
  return total;
}

function countFeatureTypeInSelectedSets(featureType, pieceMap = cachedAssets?.pieceMap ?? null, preferences = {}) {
  if (!pieceMap) {
    return 0;
  }

  const expansionIds = getSelectedExpansionIds(preferences);
  let total = 0;

  for (const piece of Object.values(pieceMap)) {
    if (expansionIds && !expansionIds.has(piece.expansionId)) {
      continue;
    }
    for (const tile of piece.tiles || []) {
      total += (tile.features || []).filter((feature) => feature.type === featureType).length;
    }
  }

  return total;
}

function isNoDocksSandwichedDockPair(leftVariantId, rightVariantId) {
  return new Set([leftVariantId, rightVariantId]).size === 2 &&
    [leftVariantId, rightVariantId].includes("noDocks") &&
    [leftVariantId, rightVariantId].includes("sandwichedDock");
}

function variantsConflict(leftVariantId, rightVariantId) {
  const pair = new Set([leftVariantId, rightVariantId]);
  // Energy Crisis / A Lighter Game removes Energy and upgrades from the game, so
  // starting-Energy prices or subsidies have no rules meaning. Keep this guard
  // local even if the variant registry also declares the incompatibility.
  if (
    pair.has("lighterGame") &&
    (pair.has("payToWin") || pair.has("subsidizedStarts"))
  ) {
    return true;
  }
  if (getVariantExclusiveGroupConflict(leftVariantId, rightVariantId)) {
    return true;
  }
  const left = getVariantDefinition(leftVariantId);
  const right = getVariantDefinition(rightVariantId);
  return Boolean(
    left?.incompatibleWith?.includes(rightVariantId) ||
    right?.incompatibleWith?.includes(leftVariantId)
  );
}

// No Docks and Sandwiched Dock are compatible as user preferences: both may be
// Allowed so the generator can choose either setup. They still cannot be active
// on the same generated course, and Must + Must is an impossible request.
function variantsConflictInGeneratedCourse(leftVariantId, rightVariantId) {
  return variantsConflict(leftVariantId, rightVariantId) ||
    isNoDocksSandwichedDockPair(leftVariantId, rightVariantId);
}

function forcedVariantPreferencesConflict(leftVariantId, rightVariantId) {
  return variantsConflictInGeneratedCourse(leftVariantId, rightVariantId);
}

function normalizeForcedVariantPreferenceConflicts(preferences = {}) {
  const allowedVariantRules = { ...(preferences.allowedVariantRules ?? {}) };
  const forcedIds = VARIANT_DEFINITIONS
    .filter((variant) => getVariantPreferenceState(preferences, variant.id) === "forced")
    .map((variant) => variant.id)
    .sort((left, right) => left.localeCompare(right));
  const keptForcedIds = [];
  const relaxedIds = [];

  forcedIds.forEach((variantId) => {
    if (keptForcedIds.some((keptId) => forcedVariantPreferencesConflict(variantId, keptId))) {
      allowedVariantRules[variantId] = "allowed";
      relaxedIds.push(variantId);
      return;
    }
    allowedVariantRules[variantId] = "forced";
    keptForcedIds.push(variantId);
  });

  return {
    preferences: {
      ...preferences,
      allowedVariantRules
    },
    relaxedIds
  };
}

function getConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflict(variantId, variant.id))
    .map((variant) => variant.id);
}

function getCourseConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflictInGeneratedCourse(variantId, variant.id))
    .map((variant) => variant.id);
}

function getMissingRequiredVariantIds(variantId, preferences = {}, activeVariants = null, options = {}) {
  const selfState = options.selfState ?? getVariantPreferenceState(preferences, variantId);
  if (selfState === "forced" && options.allowForcedOverride !== false) {
    return [];
  }

  const requiredIds = getVariantRequirementIds(variantId);
  if (!requiredIds.length) {
    return [];
  }

  const satisfied = requiredIds.some((requiredId) => (
    activeVariants
      ? Boolean(activeVariants[requiredId])
      : getVariantPreferenceState(preferences, requiredId) !== "off"
  ));

  return satisfied ? [] : requiredIds;
}

function showToast(message) {
  const stack = document.getElementById("toast-stack");
  if (!stack || !message) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 2600);
}

function getVariantUnavailabilityReason(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (variantId === "competitiveMode" && pieceMap) {
    const playerCount = preferences.playerCount ?? 4;
    const requiredStarts = playerCount * 2;
    const noDocksState = getVariantPreferenceState(preferences, "noDocks");
    if (noDocksState === "off") {
      const expansionIds = getSelectedExpansionIds(preferences);
      const dockIds = getEligibleDockIds(pieceMap, expansionIds);
      const potentialPreferences = {
        ...preferences,
        playerCount,
        competitiveMode: true,
        allowedVariantRules: {
          ...(preferences.allowedVariantRules ?? {}),
          extraDocks: getVariantPreferenceState(preferences, "extraDocks") === "forced" ? "forced" : "allowed"
        }
      };
      const potentialCapacity = getMaximumAvailableDockStartCapacity(dockIds, pieceMap, potentialPreferences);
      if (potentialCapacity < requiredStarts) {
        return `Competitive Mode with ${playerCount} players needs ${requiredStarts} starting spaces. The selected sets can provide at most ${potentialCapacity} with available docking bays; allow No Docks, reduce the player count, or select sets with more starting capacity.`;
      }
    }
  }

  if (["extraDocks", "noDocks", "sandwichedDock"].includes(variantId)) {
    const otherStartLayoutModes = ["extraDocks", "noDocks", "sandwichedDock"]
      .filter((id) => id !== variantId);
    const forcedOther = otherStartLayoutModes.find((id) => (
      getVariantPreferenceState(preferences, id) === "forced"
    ));
    if (forcedOther) {
      return `Unavailable while ${getVariantDefinitionLabel(forcedOther)} is set to Must. Extra Docks, No Docks, and Sandwiched Dock are mutually exclusive starting-layout options.`;
    }
  }

  const forcedConflictIds = getConflictingVariantIds(variantId).filter((conflictId) => (
    getVariantPreferenceState(preferences, conflictId) === "forced"
  ));
  if (forcedConflictIds.length) {
    const exclusiveConflict = forcedConflictIds
      .map((conflictId) => ({
        conflictId,
        group: getVariantExclusiveGroupConflict(variantId, conflictId)
      }))
      .find((entry) => entry.group);
    if (exclusiveConflict) {
      return `Unavailable while ${getVariantDefinitionLabel(exclusiveConflict.conflictId)} is set to Must. ${exclusiveConflict.group.description ?? "Only one rule from this mutually exclusive group can be active."}`;
    }
    return `Unavailable while ${forcedConflictIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} is set to Must.`;
  }

  const missingRequiredIds = getMissingRequiredVariantIds(variantId, preferences);
  if (missingRequiredIds.length) {
    return `Requires ${missingRequiredIds.map((id) => getVariantDefinitionLabel(id)).join(" or ")} unless ${getVariantDefinitionLabel(variantId)} is set to Must.`;
  }

  const availabilityRule = getVariantAvailabilityRule(variantId);
  if (!availabilityRule) {
    return null;
  }

  if (availabilityRule.type === "physicalDockGroupsAtLeast") {
    if (variantId === "extraDocks" && getVariantPreferenceState(preferences, "noDocks") !== "off") {
      return null;
    }
    if (!pieceMap) {
      return null;
    }
    const expansionIds = getSelectedExpansionIds(preferences);
    const physicalDockCount = getDockFaceGroups(
      getAvailableDockIds(pieceMap, expansionIds),
      pieceMap
    ).length;
    return physicalDockCount >= availabilityRule.count
      ? null
      : availabilityRule.reason;
  }

  if (availabilityRule.type === "featureTypeAvailable") {
    return countFeatureTypeInSelectedSets(availabilityRule.featureType, pieceMap, preferences) > 0
      ? null
      : availabilityRule.reason;
  }

  if (availabilityRule.type === "featureTypesAnyAvailable") {
    return (availabilityRule.featureTypes || []).some((featureType) => (
      countFeatureTypeInSelectedSets(featureType, pieceMap, preferences) > 0
    ))
      ? null
      : availabilityRule.reason;
  }

  return null;
}

function getAuditBoardOptions(pieceMap) {
  return Object.values(pieceMap)
    .filter((piece) => piece.image && piece.width > 0 && piece.height > 0)
    .sort((left, right) => formatBoardLabel(left.id, pieceMap).localeCompare(formatBoardLabel(right.id, pieceMap)));
}

function getAuditPiece(assets) {
  return boardAuditState.pieceId ? assets.pieceMap[boardAuditState.pieceId] ?? null : null;
}

function getAuditTileMap(piece) {
  return buildResolvedMap([{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }], { [piece.id]: piece }).tileMap;
}

function getTileFromAuditCanvas(evt, canvas, piece) {
  if (!piece || !canvas.width || !canvas.height) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const localX = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const localY = (evt.clientY - rect.top) * (canvas.height / rect.height);
  const tileX = Math.floor(localX / (canvas.width / piece.width));
  const tileY = Math.floor(localY / (canvas.height / piece.height));

  if (tileX < 0 || tileX >= piece.width || tileY < 0 || tileY >= piece.height) {
    return null;
  }

  return { x: tileX, y: tileY };
}

function getTileFromAuditRenderCanvas(evt, canvas, piece) {
  if (!piece || !canvas.width || !canvas.height) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const localX = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const localY = (evt.clientY - rect.top) * (canvas.height / rect.height);
  const tileSize = (canvas.width - AUDIT_RENDER_MARGIN * 2) / piece.width;
  const tileX = Math.floor((localX - AUDIT_RENDER_MARGIN) / tileSize);
  const tileY = Math.floor((localY - AUDIT_RENDER_MARGIN) / tileSize);

  if (tileX < 0 || tileX >= piece.width || tileY < 0 || tileY >= piece.height) {
    return null;
  }

  return { x: tileX, y: tileY };
}

function drawAuditImageCanvas(canvas, piece, img, hoverTile = null) {
  const ctx = canvas.getContext("2d");
  if (!piece || !img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const tileWidth = canvas.width / piece.width;
  const tileHeight = canvas.height / piece.height;

  ctx.save();
  ctx.strokeStyle = "rgba(26, 43, 58, 0.35)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= piece.width; x += 1) {
    const px = x * tileWidth;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= piece.height; y += 1) {
    const py = y * tileHeight;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }

  if (hoverTile) {
    ctx.fillStyle = "rgba(228, 103, 36, 0.18)";
    ctx.strokeStyle = "rgba(228, 103, 36, 0.96)";
    ctx.lineWidth = 3;
    ctx.fillRect(hoverTile.x * tileWidth, hoverTile.y * tileHeight, tileWidth, tileHeight);
    ctx.strokeRect(hoverTile.x * tileWidth + 1.5, hoverTile.y * tileHeight + 1.5, tileWidth - 3, tileHeight - 3);
  }

  ctx.restore();
}

function drawAuditRenderHover(canvas, piece, hoverTile = null) {
  if (!piece || !hoverTile) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const tileSize = (canvas.width - AUDIT_RENDER_MARGIN * 2) / piece.width;
  const left = AUDIT_RENDER_MARGIN + hoverTile.x * tileSize;
  const top = AUDIT_RENDER_MARGIN + hoverTile.y * tileSize;

  ctx.save();
  ctx.fillStyle = "rgba(228, 103, 36, 0.16)";
  ctx.strokeStyle = "rgba(228, 103, 36, 0.96)";
  ctx.lineWidth = 3;
  ctx.fillRect(left, top, tileSize, tileSize);
  ctx.strokeRect(left + 1.5, top + 1.5, tileSize - 3, tileSize - 3);
  ctx.restore();
}

function updateAuditReadout(assets) {
  const readout = document.getElementById("audit-readout");
  const piece = getAuditPiece(assets);
  readout.replaceChildren();

  if (!piece) {
    appendAuditReadoutLine(readout, "Tile Readout", { strong: true });
    appendAuditReadoutLine(readout, "Select a board to inspect.");
    return;
  }

  const lines = [
    piece.name,
    `${piece.width}x${piece.height} tiles`,
    `${formatExpansionName(piece.expansionId ?? "unknown")}`
  ];

  if (boardAuditState.hoverTile) {
    const tileMap = getAuditTileMap(piece);
    const tile = tileMap.get(`${boardAuditState.hoverTile.x},${boardAuditState.hoverTile.y}`);
    const features = (tile?.features || [])
      .filter((feature) => isAuditFeatureVisible(feature.type))
      .map(summarizeFeature)
      .sort((left, right) => left.localeCompare(right));
    const starts = (piece.starts || [])
      .filter(() => isAuditFeatureVisible("start"))
      .filter((start) => start.x === boardAuditState.hoverTile.x && start.y === boardAuditState.hoverTile.y)
      .map((start) => `start ${start.facing ?? "E"}`);

    lines.push(`Tile (${boardAuditState.hoverTile.x}, ${boardAuditState.hoverTile.y})`);
    if (features.length || starts.length) {
      lines.push([...features, ...starts].join(" | "));
    } else {
      lines.push("No encoded features on this tile.");
    }
  } else {
    lines.push("Hover a tile in either pane to inspect its encoding.");
  }

  lines.forEach((line, index) => {
    appendAuditReadoutLine(readout, line, { strong: index === 0 });
  });
}

function renderBoardAudit(assets) {
  const piece = getAuditPiece(assets);
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");

  if (!piece) {
    const imageCtx = imageCanvas.getContext("2d");
    const jsonCtx = jsonCanvas.getContext("2d");
    imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    jsonCtx.clearRect(0, 0, jsonCanvas.width, jsonCanvas.height);
    updateAuditReadout(assets);
    return;
  }

  if (piece.image && !assets.imageMap[piece.id]) {
    loadPieceImage(assets, piece.id).then(() => {
      if (getAuditPiece(assets)?.id === piece.id) {
        renderBoardAudit(assets);
      }
    });
  }

  drawAuditImageCanvas(imageCanvas, piece, assets.imageMap[piece.id], boardAuditState.hoverTile);
  render(jsonCanvas, assets.pieceMap, assets.imageMap, {
    placements: [{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }],
    showBoardLabels: false,
    showStartFacing: true,
    showWalls: true,
    showPieceImages: false,
    showFootprints: false,
    showFeatureIcons: true,
    visibleFeatureTypes: boardAuditState.selectedFeatures
  });
  drawAuditRenderHover(jsonCanvas, piece, boardAuditState.hoverTile);


  updateAuditReadout(assets);
}

function updateBoardAuditVisibility() {
  const visible = isDevViewEnabled() && isBoardAuditEnabled();
  document.getElementById("board-audit-panel")?.classList.toggle("hidden", !visible);
}

function initializeBoardAudit(assets) {
  if (boardAuditInitialized) {
    renderBoardAudit(assets);
    return;
  }

  const select = document.getElementById("audit-board-select");
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");
  const featureFilters = document.getElementById("audit-feature-filters");
  const allButton = document.getElementById("audit-filter-all");
  const noneButton = document.getElementById("audit-filter-none");
  const options = getAuditBoardOptions(assets.pieceMap);

  select.innerHTML = "";
  options.forEach((piece) => {
    const option = document.createElement("option");
    option.value = piece.id;
    option.textContent = formatBoardLabel(piece.id, assets.pieceMap);
    select.appendChild(option);
  });

  boardAuditState.pieceId = options[0]?.id ?? null;
  select.value = boardAuditState.pieceId ?? "";

  featureFilters.innerHTML = "";
  AUDIT_FEATURE_TYPES.forEach((feature) => {
    const label = document.createElement("label");
    label.className = "audit-filter-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = boardAuditState.selectedFeatures.has(feature.id);
    input.dataset.featureType = feature.id;
    input.addEventListener("change", () => {
      if (input.checked) {
        boardAuditState.selectedFeatures.add(feature.id);
      } else {
        boardAuditState.selectedFeatures.delete(feature.id);
      }
      renderBoardAudit(assets);
    });

    label.append(input, buildAuditFeatureFilterLabel(feature));
    featureFilters.appendChild(label);
  });

  allButton.addEventListener("click", () => {
    boardAuditState.selectedFeatures = new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id));
    featureFilters.querySelectorAll("input[type=\"checkbox\"]").forEach((input) => {
      input.checked = true;
    });
    renderBoardAudit(assets);
  });

  noneButton.addEventListener("click", () => {
    boardAuditState.selectedFeatures = new Set();
    featureFilters.querySelectorAll("input[type=\"checkbox\"]").forEach((input) => {
      input.checked = false;
    });
    renderBoardAudit(assets);
  });

  select.addEventListener("change", () => {
    boardAuditState.pieceId = select.value || null;
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });

  imageCanvas.addEventListener("mousemove", (evt) => {
    const nextTile = getTileFromAuditCanvas(evt, imageCanvas, getAuditPiece(assets));
    if (!sameTile(boardAuditState.hoverTile, nextTile)) {
      boardAuditState.hoverTile = nextTile;
      renderBoardAudit(assets);
    }
  });

  jsonCanvas.addEventListener("mousemove", (evt) => {
    const nextTile = getTileFromAuditRenderCanvas(evt, jsonCanvas, getAuditPiece(assets));
    if (!sameTile(boardAuditState.hoverTile, nextTile)) {
      boardAuditState.hoverTile = nextTile;
      renderBoardAudit(assets);
    }
  });

  imageCanvas.addEventListener("mouseleave", () => {
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });

  jsonCanvas.addEventListener("mouseleave", () => {
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });


  boardAuditInitialized = true;
  renderBoardAudit(assets);
}

function updateSetupSummary(scenario) {
  const fitNoteEl = document.getElementById("fit-note");
  const summary = document.getElementById("setup-summary");
  const boardsEl = document.getElementById("setup-boards");
  const overlayBoardsRowEl = document.getElementById("setup-overlay-boards-row");
  const overlayBoardsEl = document.getElementById("setup-overlay-boards");
  const overlayTilesRowEl = document.getElementById("setup-overlay-tiles-row");
  const overlayTilesEl = document.getElementById("setup-overlay-tiles");
  const flagsEl = document.getElementById("setup-flags");
  const explanationToggleEl = document.getElementById("course-explanation-toggle");
  const explanationPanelEl = document.getElementById("course-explanation-panel");
  const explanationCopyEl = document.getElementById("course-explanation-copy");

  if (
    !fitNoteEl ||
    !summary ||
    !boardsEl ||
    !overlayBoardsRowEl ||
    !overlayBoardsEl ||
    !overlayTilesRowEl ||
    !overlayTilesEl ||
    !flagsEl ||
    !explanationToggleEl ||
    !explanationPanelEl ||
    !explanationCopyEl
  ) {
    return;
  }

  if (!scenario) {
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
    summary.classList.add("hidden");
    boardsEl.textContent = "";
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
    flagsEl.textContent = "";
    explanationCopyEl.innerHTML = "";
    explanationPanelEl.classList.add("hidden");
    explanationToggleEl.setAttribute("aria-expanded", "false");
    courseExplanationState = {
      ...courseExplanationState,
      scenarioRef: null,
      manualClosedScenarioRef: null
    };
    return;
  }

  if (courseExplanationState.scenarioRef !== scenario) {
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
    courseExplanationState = {
      ...courseExplanationState,
      scenarioRef: scenario,
      manualClosedScenarioRef: null
    };
  }

  const boardLabels = scenario.mainBoardIds.map((pieceId) => (
    formatBoardLabel(pieceId, scenario.pieceMap)
  ));
  const overlayBoardLabels = (scenario.overlayPlacements || [])
    .filter((placement) => !isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  const overlayTileLabels = (scenario.overlayPlacements || [])
    .filter((placement) => isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  boardsEl.textContent = boardLabels.join(", ");
  if (overlayBoardLabels.length) {
    overlayBoardsEl.textContent = overlayBoardLabels.join(", ");
    overlayBoardsRowEl.classList.remove("hidden");
  } else {
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
  }
  if (overlayTileLabels.length) {
    overlayTilesEl.textContent = overlayTileLabels.join(", ");
    overlayTilesRowEl.classList.remove("hidden");
  } else {
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
  }
  const visibleCheckpointCount = scenario.virtualBots
    ? Math.max(0, scenario.checkpoints.length - 1)
    : scenario.checkpoints.length;
  flagsEl.textContent = `${visibleCheckpointCount} checkpoint${visibleCheckpointCount === 1 ? "" : "s"}${scenario.virtualBots ? " + entry" : ""}`;
  const noteParts = [];
  const difficultyFit = scenario.metrics.difficultyFit ?? 0;
  const lengthFit = scenario.metrics.lengthFit ?? 0;
  const requestedDifficulty = scenario.preferences.difficulty;
  const moderateDifficultyThreshold = requestedDifficulty === "easy" ? 20 : 14;
  const strongDifficultyThreshold = requestedDifficulty === "easy" ? 48 : 42;
  const difficultyStrength = difficultyFit >= strongDifficultyThreshold
    ? "a lot"
    : difficultyFit >= moderateDifficultyThreshold
      ? "somewhat"
      : scenario.generationBestMatch && difficultyFit > 0
        ? "slightly"
        : null;
  const lengthStrength = lengthFit >= 24
    ? "a lot"
    : lengthFit >= 14
      ? "somewhat"
      : scenario.generationBestMatch && lengthFit > 0
        ? "slightly"
        : null;

  if (scenario.preferences.difficulty !== "any" && difficultyStrength) {
    noteParts.push(scenario.metrics.difficultyDirection === "low"
      ? `${difficultyStrength} easier`
      : `${difficultyStrength} harder`);
  }

  if (scenario.preferences.length !== "any" && lengthStrength) {
    noteParts.push(scenario.metrics.lengthDirection === "low"
      ? `${lengthStrength} shorter`
      : `${lengthStrength} longer`);
  }

  const shouldSuggestReroll = (
    noteParts.length >= 2 ||
    difficultyFit >= strongDifficultyThreshold ||
    lengthFit >= 24
  );
  const checkpointPlacementAdvisory = getCheckpointPlacementAdvisory(scenario);
  const checkpointPlacementSentence = checkpointPlacementAdvisory?.active
    ? ` ${checkpointPlacementAdvisory.bannerText}`
    : "";

  if (scenario.generationBestMatch && noteParts.length) {
    const mismatchText = ` It is ${noteParts.join(" and ")} than requested.`;
    fitNoteEl.textContent =
      `Closest match found.${mismatchText}${checkpointPlacementSentence} Regenerating may find a closer match.`;
    fitNoteEl.classList.remove("hidden");
  } else if (scenario.generationBestMatch && checkpointPlacementAdvisory?.active) {
    fitNoteEl.textContent = `Closest match found.${checkpointPlacementSentence} Regenerating may find a closer match.`;
    fitNoteEl.classList.remove("hidden");
  } else if (noteParts.length) {
    const rerollText = shouldSuggestReroll || checkpointPlacementAdvisory?.active
      ? " Regenerating may give a better match."
      : "";
    fitNoteEl.textContent = `Closest fit: this course is ${noteParts.join(" and ")} than requested.${checkpointPlacementSentence}${rerollText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (checkpointPlacementAdvisory?.active) {
    fitNoteEl.textContent = `Course generated.${checkpointPlacementSentence} Regenerate if you prefer a more conventional layout.`;
    fitNoteEl.classList.remove("hidden");
  } else {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
  }

  const autoOpenExplanation = noteParts.length > 0 || checkpointPlacementAdvisory?.active;
  const explanationVisible = Boolean(
    courseExplanationState.userPinnedOpen ||
    (
      autoOpenExplanation &&
      courseExplanationState.manualClosedScenarioRef !== scenario
    )
  );
  if (explanationVisible) {
    explanationCopyEl.innerHTML = buildCourseNotesHtml(scenario, noteParts, {
      includeDiagnostics: Boolean(document.getElementById("dev-view")?.checked)
    });
  } else {
    // Course Notes are deliberately lazy: do not synthesize or retain prose
    // for a scenario the user has not opened.
    explanationCopyEl.innerHTML = "";
  }
  explanationPanelEl.classList.toggle("hidden", !explanationVisible);
  explanationToggleEl.setAttribute("aria-expanded", explanationVisible ? "true" : "false");
  summary.classList.remove("hidden");
}

function averageValues(values = []) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


function formatLegLabel(leg) {
  return leg.from === "dock" ? "Dock -> 1" : `${leg.from} -> ${leg.to}`;
}

const UI_SETUP_LAYOUT_CATEGORY = "setup-layout";

function getVariantUiCategory(variantOrCategory) {
  const category = typeof variantOrCategory === "string"
    ? variantOrCategory
    : variantOrCategory?.category;

  return category === "setup" || category === "board-layout" || category === UI_SETUP_LAYOUT_CATEGORY
    ? UI_SETUP_LAYOUT_CATEGORY
    : category;
}

function getVariantUiCategoryLabel(variantOrCategory) {
  const category = getVariantUiCategory(variantOrCategory);
  return category === UI_SETUP_LAYOUT_CATEGORY
    ? "Setup & Layout"
    : String(category ?? "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVariantsForUiCategory(category) {
  return VARIANT_DEFINITIONS.filter((variant) => getVariantUiCategory(variant) === category);
}

function getVariantCategoryStates(category) {
  return getVariantsForUiCategory(category)
    .map((variant) => ({
      id: variant.id,
      label: variant.label,
      state: getVariantControlState(variant.id)
    }));
}

function getVariantCategoryAllAllowed(category, states = getVariantCategoryStates(category)) {
  const variantsAllowed = states.every((entry) => entry.state === "allowed" || entry.state === "forced");
  if (category !== UI_SETUP_LAYOUT_CATEGORY) {
    return variantsAllowed;
  }
  const preferences = getPreferencesFromControls();
  if (!isOverlayModeAvailable(preferences)) {
    return variantsAllowed;
  }
  return variantsAllowed && normalizeOverlayMode(document.getElementById("overlay-mode")?.value) === OVERLAY_MODES.yes;
}

function countSelectedOptionalRules() {
  const variantCount = VARIANT_DEFINITIONS.filter((variant) => getVariantControlState(variant.id) !== "off").length;
  const preferences = getPreferencesFromControls();
  const overlayCount = isOverlayModeAvailable(preferences) && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no ? 1 : 0;
  return variantCount + overlayCount;
}

function updateVariantSummary() {
  document.querySelectorAll("[data-variant-summary]").forEach((summaryEl) => {
    const category = summaryEl.dataset.variantCategory;
    const states = getVariantCategoryStates(category);
    const enabled = states.filter((entry) => entry.state !== "off");
    let selectedCount = enabled.length;

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      const preferences = getPreferencesFromControls();
      const overlayAvailable = isOverlayModeAvailable(preferences);
      const overlayLabel = formatOverlayMode(preferences.overlayMode);
      if (overlayAvailable && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no) {
        selectedCount += 1;
      }
      summaryEl.title = [
        ...states.map((entry) => `${entry.label}: ${getVariantStateCopy(entry.id, entry.state).label}`),
        `Overlays: ${overlayLabel}${overlayAvailable ? "" : " (unavailable)"}`
      ].join(", ");
    } else {
      summaryEl.title = states.map((entry) => `${entry.label}: ${entry.id === "actFast" && getActFastModeFromControls() ? formatActFastMode(getActFastModeFromControls()) : getVariantStateCopy(entry.id, entry.state).label}`).join(", ");
    }
    summaryEl.textContent = `${selectedCount} selected`;

    const menuEl = document.querySelector(`[data-variant-menu][data-variant-category="${category}"]`);
    const bulkButton = menuEl?.querySelector('[data-variant-action="toggle-category"]');
    if (!bulkButton) {
      return;
    }

    const allAllowed = getVariantCategoryAllAllowed(category, states);
    bulkButton.textContent = allAllowed ? "No" : "Yes";
    const categoryLabel = getVariantUiCategoryLabel(category);
    bulkButton.title = allAllowed
      ? `Set optional ${categoryLabel} rules to No`
      : `Set ${categoryLabel} rules to Yes`;
    bulkButton.setAttribute("aria-label", bulkButton.title);
    const bulkName = bulkButton.parentElement?.querySelector(".variant-rule-name");
    if (bulkName) {
      bulkName.textContent = allAllowed ? "Allow none" : "Allow all";
    }
  });

  const indexButton = document.getElementById("optional-rules-title");
  if (indexButton) {
    const selectedCount = countSelectedOptionalRules();
    indexButton.textContent = `Optional Rules · ${selectedCount} selected`;
    indexButton.setAttribute("aria-label", `Open searchable optional rules list. ${selectedCount} selected.`);
  }
}

function toggleVariantCategoryStates(category) {
  const states = getVariantCategoryStates(category);
  const allAllowed = getVariantCategoryAllAllowed(category, states);

  states.forEach(({ id, state }) => {
    if (allAllowed) {
      if (state === "allowed") {
        setVariantControlState(id, "off");
      }
      return;
    }

    if (state === "off") {
      setVariantControlState(id, "allowed");
    }
  });

  if (category === UI_SETUP_LAYOUT_CATEGORY) {
    const preferences = getPreferencesFromControls();
    if (isOverlayModeAvailable(preferences)) {
      setOverlayModeControl(allAllowed ? OVERLAY_MODES.no : OVERLAY_MODES.yes);
    }
  }

  updateVariantAvailability();
  updateVariantSummary();
}

function updateExpansionSummary() {
  const summaryEl = document.getElementById("expansion-summary");
  const enabled = [];

  if (document.getElementById("expansion-roborally").checked) {
    enabled.push(formatExpansionName("roborally"));
  }
  if (document.getElementById("expansion-rr-dice").checked) {
    enabled.push(formatExpansionName("rr-dice"));
  }
  if (document.getElementById("expansion-30th-anniversary").checked) {
    enabled.push(formatExpansionName("30th-anniversary"));
  }
  if (document.getElementById("expansion-master-builder").checked) {
    enabled.push(formatExpansionName("master-builder"));
  }
  if (document.getElementById("expansion-thrills-and-spills").checked) {
    enabled.push(formatExpansionName("thrills-and-spills"));
  }
    if (document.getElementById("expansion-chaos-and-carnage").checked) {
    enabled.push(formatExpansionName("chaos-and-carnage"));
  }
  if (document.getElementById("expansion-wet-and-wild").checked) {
    enabled.push(formatExpansionName("wet-and-wild"));
  }

  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = enabled.length ? enabled.join(", ") : "None";
  updateVariantAvailability();
}

function closeVariantPicker() {
  document.querySelectorAll(".variant-picker").forEach((picker) => {
    picker.removeAttribute("open");
  });
}

function hasSuppressedCheckpointFeatures(scenario) {
  if (!scenario?.placements?.length || !scenario?.checkpoints?.length) {
    return false;
  }

  const { tileMap } = buildResolvedMap(scenario.placements, scenario.pieceMap);

  return scenario.checkpoints.some((checkpoint) => {
    const tile = tileMap.get(`${checkpoint.x},${checkpoint.y}`);
    return (tile?.features || []).some((feature) => (
      !isCheckpointActiveFeature(feature, { movingTargets: scenario.movingTargets }) &&
      feature.type !== "checkpoint"
    ));
  });
}

function hasHazardousFlagsEffect(scenario) {
  if (!scenario?.hazardousFlags) {
    return false;
  }

  return hasCheckpointBoardFeatures(
    scenario,
    (feature) => !isCheckpointActiveFeature(feature, { movingTargets: scenario.movingTargets })
  );
}

function hasMovingTargetsEffect(scenario) {
  return Boolean(scenario?.movingTargets && scenario?.movingTargetStats?.activeCount);
}

function getVariantImpactSummary(scenario) {
  if (!scenario) {
    return "";
  }

  const boardLaserCount = countBoardLasers(scenario.goalTileMap);
  const repulsorCount = countFeatureTypeInTileMap(scenario.goalTileMap, "repulsor");
  const batteryCount = countFeatureTypeInTileMap(scenario.goalTileMap, "battery");
  const chopShopCount = countFeatureTypeInTileMap(scenario.goalTileMap, "chopShop");
  const upgradeSpaceCount = batteryCount + chopShopCount;
  const activeImpacts = [];
  const idleImpacts = [];
  const addImpact = (variantId, detail = "") => {
    const label = getRegisteredVariantDefinition(variantId)?.label ?? variantId;
    activeImpacts.push(detail ? `${label} (${detail})` : label);
  };
  const addIdle = (variantId, detail = "") => {
    const label = getRegisteredVariantDefinition(variantId)?.label ?? variantId;
    idleImpacts.push(detail ? `${label} (${detail})` : label);
  };

  if (scenario.actFast) {
    addImpact("actFast");
  }
  if (scenario.lighterGame) {
    if (upgradeSpaceCount > 0) {
      addImpact("lighterGame", `${upgradeSpaceCount} upgrade space${upgradeSpaceCount === 1 ? "" : "s"} with Energy/upgrade effects disabled`);
    } else {
      addIdle("lighterGame", "no batteries or chop shops on this course");
    }
  }
  if (scenario.upgradeWorld) {
    if (upgradeSpaceCount > 0) {
      addImpact("upgradeWorld", `${upgradeSpaceCount} upgrade space${upgradeSpaceCount === 1 ? "" : "s"}`);
    } else {
      addIdle("upgradeWorld", "no batteries or chop shops on this course");
    }
  }
  if (scenario.lessSpammyGame) {
    addImpact("lessSpammyGame");
  }
  if (scenario.criticalSpam) {
    addImpact("criticalSpam");
  }
  if (scenario.criticalHaywire) {
    addImpact("criticalHaywire");
  }
  if (scenario.permanentShutdown) {
    if (scenario.criticalSpam) {
      addImpact("permanentShutdown");
    } else {
      addIdle("permanentShutdown", "mostly dormant without Critical Spam");
    }
  }
  if (scenario.lessDeadlyGame) {
    addImpact("lessDeadlyGame");
  }
  if (scenario.moreDeadlyGame) {
    addImpact("moreDeadlyGame");
  }
  if (scenario.cuttingFloor) {
    if (boardLaserCount > 0) {
      addImpact("cuttingFloor", `${boardLaserCount} board laser${boardLaserCount === 1 ? "" : "s"}`);
    } else {
      addIdle("cuttingFloor", "no board lasers on this course");
    }
  }
  if (scenario.flamingOil) {
    const oilCount = countFeatureTypeInTileMap(scenario.goalTileMap, "oil");
    if (oilCount > 0) {
      addImpact("flamingOil", `${oilCount} oil slick${oilCount === 1 ? "" : "s"}`);
    } else {
      addIdle("flamingOil", "no oil slicks on this course");
    }
  }
  if (scenario.repulsorOverdrive) {
    if (repulsorCount > 0) {
      addImpact("repulsorOverdrive", `${repulsorCount} repulsor field${repulsorCount === 1 ? "" : "s"}`);
    } else {
      addIdle("repulsorOverdrive", "no repulsor fields on this course");
    }
  }
  if (scenario.setToKill) {
    addImpact("setToKill");
  }
  if (scenario.setToStun) {
    addImpact("setToStun");
  }
  if (scenario.recoveryRule === "dynamic_archiving") {
    addImpact("dynamicArchiving");
  }
  if (scenario.recoveryRule === "home_reboot") {
    addImpact("homeReboot");
  }
  if (scenario.hazardousFlags) {
    if (hasHazardousFlagsEffect(scenario)) {
      addImpact("hazardousFlags");
    } else {
      addIdle("hazardousFlags", "no hazardous checkpoint overlap on this course");
    }
  }
  if (scenario.repairStations) {
    const stationCount = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots).length;
    addImpact("repairStations", `${stationCount} repair station${stationCount === 1 ? "" : "s"}`);
  }
  if (scenario.movingTargets) {
    if (hasMovingTargetsEffect(scenario)) {
      addImpact("movingTargets", `${scenario.movingTargetStats?.activeCount ?? 0} moving checkpoint${(scenario.movingTargetStats?.activeCount ?? 0) === 1 ? "" : "s"}`);
    } else {
      addIdle("movingTargets", "no checkpoints ended up on conveyors");
    }
  }
  if (scenario.extraDocks) {
    addImpact("extraDocks");
  }
  if (scenario.noDocks) {
    addImpact("noDocks");
  }
  if (scenario.sandwichedDock) {
    addImpact("sandwichedDock");
  }
  if (scenario.factoryRejects) {
    addImpact("factoryRejects");
  }
  if (scenario.startupSpinUp) {
    addImpact("startupSpinUp");
  }
  if (scenario.virtualBots) {
    addImpact("virtualBots");
  }
  if (scenario.competitiveMode) {
    addImpact("competitiveMode");
  }
  if (scenario.subsidizedStarts) {
    const offeredStarts = (scenario.sequence.firstLeg.starts || []).filter((start) => (
      Number.isFinite(start.energyCost) && !start.payToWinUnavailable
    ));
    addImpact("subsidizedStarts", `${offeredStarts.length} offered start${offeredStarts.length === 1 ? "" : "s"}`);
  } else if (scenario.payToWin) {
    const pricedStarts = (scenario.sequence.firstLeg.starts || []).filter((start) => (
      Number.isFinite(start.energyCost) && !start.payToWinUnavailable
    ));
    addImpact("payToWin", `${pricedStarts.length} priced start${pricedStarts.length === 1 ? "" : "s"}`);
  }
  if (scenario.classicSharedDeck) {
    addImpact("classicSharedDeck");
  }
  if (scenario.lessForeshadowing) {
    addImpact("lessForeshadowing");
  }
  if (scenario.staggeredBoards) {
    addImpact("staggeredBoards");
  }

  if (!activeImpacts.length && !idleImpacts.length) {
    return "";
  }

  const parts = [];
  if (activeImpacts.length) {
    parts.push(`Variant impact on this course: ${activeImpacts.join(", ")}.`);
  }
  if (idleImpacts.length) {
    parts.push(`Currently idle here: ${idleImpacts.join(", ")}.`);
  }
  return parts.join(" ");
}

function formatRuleReference({
  source = "rulebook",
  edition = 2023,
  page = null,
  section = null,
  relation = "direct",
  qualifier = null
} = {}) {
  let sourceText = "";

  if (source === "rulebook") {
    const editionText = edition == null || String(edition).trim() === ""
      ? ""
      : `${edition} `;
    sourceText = `${editionText}rulebook`;
    if (section) sourceText += `: ${section}`;
    if (page !== null && page !== undefined && page !== "") {
      sourceText += `${section ? "," : ""} p. ${page}`;
    }
  } else if (source === "previous-editions") {
    sourceText = "previous Robo Rally editions";
  } else {
    sourceText = String(source ?? "").trim();
  }

  if (!sourceText) return "";
  if (qualifier) sourceText += `; ${qualifier}`;

  if (relation === "altered") return `Altered from ${sourceText}`;
  if (relation === "patterned") return `Patterned after ${sourceText}`;
  return sourceText.charAt(0).toUpperCase() + sourceText.slice(1);
}

function appendRuleReference(text, referenceOptions = {}) {
  const reference = formatRuleReference(referenceOptions);
  const trimmed = String(text ?? "").trim();
  if (!trimmed || !reference) return trimmed;
  const base = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  return `${base} (${reference}).`;
}

function getActFastRuleText(mode) {
  switch (mode) {
    case "countdown_3m":
      return appendRuleReference("Act Fast: use a 3-minute programming timer.", { page: 32 });
    case "countdown_2m":
      return appendRuleReference("Act Fast: use a 2-minute programming timer.", { page: 32 });
    case "countdown_1m":
      return appendRuleReference("Act Fast: use a 1-minute programming timer.", { page: 32, relation: "altered" });
    case "countdown_30s":
      return appendRuleReference("Act Fast: use a 30-second programming timer.", { page: 32, relation: "altered" });
    case "last_player_30s":
      return appendRuleReference("Act Fast: when only one player remains, that player has 30 seconds to finish programming.", { source: "previous-editions" });
    default:
      return null;
  }
}

function hasCheckpointBoardFeatures(scenario, featureFilter = null) {
  if (!scenario?.placements?.length || !scenario?.checkpoints?.length) {
    return false;
  }

  const { tileMap } = buildResolvedMap(scenario.placements, scenario.pieceMap);

  return scenario.checkpoints.some((checkpoint) => {
    const tile = tileMap.get(`${checkpoint.x},${checkpoint.y}`);
    return (tile?.features || []).some((feature) => (
      feature.type !== "checkpoint" && (!featureFilter || featureFilter(feature))
    ));
  });
}

function isVariantGuidanceSourceActive(scenario, variantId, activation = "active") {
  if (!scenario || !variantId) return false;
  if (activation === "forced") {
    return isVariantExplicitlyForced(scenario.preferences ?? {}, variantId);
  }
  return Boolean(scenario[variantId]) || (
    variantId === "dynamicArchiving" && scenario.recoveryRule === "dynamic_archiving"
  ) || (
    variantId === "homeReboot" && scenario.recoveryRule === "home_reboot"
  );
}

function isVariantGuidanceTargetActive(scenario, variantId) {
  if (!scenario || !variantId) return false;
  if (variantId === "dynamicArchiving") return scenario.recoveryRule === "dynamic_archiving";
  if (variantId === "homeReboot") return scenario.recoveryRule === "home_reboot";
  return Boolean(scenario[variantId]);
}

function variantGuidanceTargetIsLegal(variantId, scenario) {
  if (!variantId || !scenario) return false;
  const preferences = scenario.preferences ?? {};
  const pieceMap = cachedAssets?.pieceMap ?? null;
  if (!variantIsAvailable(variantId, preferences, pieceMap)) return false;

  const conflicts = getCourseConflictingVariantIds(variantId);
  return !conflicts.some((conflictId) => isVariantGuidanceTargetActive(scenario, conflictId));
}

function buildVariantRuleGuidanceNotes(scenario) {
  if (!scenario) return [];
  const suggestions = [];
  const warnings = [];

  for (const source of VARIANT_DEFINITIONS) {
    const rules = getVariantGuidanceRules(source.id) || [];
    for (const rule of rules) {
      if (!isVariantGuidanceSourceActive(scenario, source.id, rule.sourceActivation ?? "active")) {
        continue;
      }

      const targetId = rule.targetId ?? null;
      const targetActive = targetId ? isVariantGuidanceTargetActive(scenario, targetId) : false;
      if (rule.kind === "suggest") {
        if (targetId && (targetActive || !variantGuidanceTargetIsLegal(targetId, scenario))) {
          continue;
        }
        if (rule.text) suggestions.push(rule.text);
        continue;
      }

      if (rule.kind === "warning") {
        if (targetId && !targetActive) continue;
        if (rule.text) warnings.push(rule.text);
      }
    }
  }

  return [
    ...suggestions.map((text) => `Suggestion: ${text}`),
    ...warnings.map((text) => `Note: ${text}`)
  ];
}

function updateRulesNote(scenario) {
  const topRulesBlockEl = document.getElementById("rules-block-top");
  const bottomRulesBlockEl = document.getElementById("rules-block-bottom");
  const topAnchorEl = document.getElementById("rules-anchor-top");
  const bottomAnchorEl = document.getElementById("rules-anchor-bottom");
  const checkpointNoteEl = document.getElementById("checkpoint-note");
  const photoRulesNoteEl = document.getElementById("photo-rules-note");
  const noteEl = document.getElementById("rules-note");
  const adviceNoteEl = document.getElementById("rules-advice-note");
  const checkpointNotes = [];
  const photoNotes = [];
  const notes = [];

  if (!scenario) {
    topAnchorEl?.appendChild(topRulesBlockEl);
    bottomAnchorEl?.appendChild(bottomRulesBlockEl);
    topRulesBlockEl?.classList.add("hidden");
    bottomRulesBlockEl?.classList.add("hidden");
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
    photoRulesNoteEl.textContent = "";
    photoRulesNoteEl.classList.add("hidden");
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    if (adviceNoteEl) {
      adviceNoteEl.textContent = "";
      adviceNoteEl.classList.add("hidden");
    }
    return;
  }

  if (!scenario.hazardousFlags && hasSuppressedCheckpointFeatures(scenario)) {
    checkpointNotes.push(
      scenario.movingTargets
        ? appendRuleReference(
          "Checkpoint spaces suppress board elements other than walls, lasers, and conveyors carrying moving checkpoints.",
          { page: 15, qualifier: "Moving Targets variant" }
        )
        : appendRuleReference(
          "Checkpoint spaces suppress board elements other than walls and lasers.",
          { page: 15 }
        )
    );
  }

  if (scenario.recoveryRule === "dynamic_archiving") {
    notes.push(appendRuleReference(
      "Dynamic Archiving: do not use reboot tokens. A robot archives when it ends a register on a checkpoint or battery space.",
      { page: 32 }
    ));
  }

  if (scenario.recoveryRule === "home_reboot") {
    notes.push(appendRuleReference(
      "Home Reboot: a robot reboots at the token on the dock where its starting Archive Token was placed.",
      { source: "previous-editions" }
    ));
  }

  const actFastRuleText = getActFastRuleText(scenario.actFastMode);
  if (scenario.actFast && actFastRuleText) {
    notes.push(actFastRuleText);
  }

  if (hasHazardousFlagsEffect(scenario)) {
    notes.push(appendRuleReference(
      "Hazardous Flags: board elements under checkpoints remain active, but do not affect the checkpoints.",
      { source: "previous-editions" }
    ));
  }

  if (hasMovingTargetsEffect(scenario)) {
    notes.push(appendRuleReference(
      "Moving Targets: during each register, checkpoints on conveyors move with the belts. If one would leave the conveyor or stop moving, return it to its marked re-entry space (R#).",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.repairStations) {
    notes.push(appendRuleReference(
      "Repair Stations: at the end of the fifth register, a robot on an ordinary checkpoint may remove one Damage card from its deck, discard pile, hand, or registers and place it in the damage discard pile.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (getBoardViewMode() === BOARD_VIEW_MODES.photos && (scenario.overlayPlacements?.length ?? 0) > 0) {
    photoNotes.push("Board photos are for general layout reference only. With overlays, use the physical boards or Icon View for exact placement of walls, ledges, and other border elements.");
  }

  if (scenario.noDocks) {
    if (scenario.subsidizedStarts) {
      notes.push("No Docks: do not use a docking bay. The subsidized starting spaces along the indicated outer board edge replace docking-bay starting spaces.");
    } else if (scenario.payToWin) {
      notes.push("No Docks: do not use a docking bay. The priced starting spaces along the indicated outer board edge replace docking-bay starting spaces.");
    } else if (scenario.startupSpinUp) {
      notes.push("No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces.");
    } else {
      notes.push("No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces; robots begin facing into the factory.");
    }
    if (scenario.startupSpinUp) {
      notes.push(appendRuleReference(
        "Startup Spin-Up with No Docks: players may choose their robots' initial facing freely.",
        { source: "previous-editions", relation: "patterned" }
      ));
    }
  }

  if (scenario.competitiveMode) {
    notes.push(
      `Competitive Mode: before the game, players take turns blocking starting spaces, then choose strategically from the remaining starts. ` +
      appendRuleReference(
        `All shown starting spaces are available when blocking begins. Good blocking rewards players who can read the course and identify the strongest starts before the race.`,
        { page: 32 }
      )
    );

    if (scenario.generationBestMatch) {
      const competitiveFailures = new Set(scenario.metrics?.hardFailures ?? []);
      const unavailableIndices = scenario.sequence?.firstLeg?.summary?.competitiveStaging?.unavailableIndices
        ?? scenario.blockedStartIndices
        ?? [];
      if (competitiveFailures.has("competitive-start-availability") || unavailableIndices.length) {
        const unavailableText = unavailableIndices.length
          ? ` #${unavailableIndices.map((index) => index + 1).join(", #")}`
          : "";
        notes.push(
          `Competitive starting-space warning: do not use ${unavailableIndices.length || "some"} starting space${unavailableIndices.length === 1 ? "" : "s"}${unavailableText}. These are unavailable for this course and are not player blocks.`
        );
      }
      if (competitiveFailures.has("competitive-start-balance")) {
        notes.push(
          "Competitive starting-space warning: this closest-match course may leave the final starting choices less even than usual after blocking."
        );
      }
    }
  }

  if (scenario.subsidizedStarts) {
    const subsidyPricing = scenario.sequence.firstLeg.summary.payToWin;
    const baseStartingEnergy = subsidyPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY;
    const maximumEnergy = subsidyPricing?.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy;
    if (subsidyPricing?.hasLatePriceDifference) {
      const firstLatePlayer = subsidyPricing.lateSelectorStart ?? scenario.playerCount;
      const lastLatePlayer = subsidyPricing.lateSelectorEnd ?? scenario.playerCount;
      const singleLatePlayer = firstLatePlayer === lastLatePlayer;
      const latePlayerText = singleLatePlayer
        ? `player ${firstLatePlayer}`
        : `players ${firstLatePlayer}–${lastLatePlayer}`;
      const hasUnavailableSelectors = (
        (subsidyPricing.earlyUnavailableCount ?? 0) > 0 ||
        (subsidyPricing.lateUnavailableCount ?? 0) > 0
      );
      const dashText = hasUnavailableSelectors
        ? " A dash in either position means that starting space cannot be sufficiently compensated for that selector group; a fully unavailable space uses the prohibited-start marker instead of a subsidy."
        : "";
      notes.push(
        `Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy, never exceeding the ${maximumEnergy}E storage limit. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first subsidy.${dashText} Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`
      );
    } else {
      notes.push(`Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy, never exceeding the ${maximumEnergy}E storage limit; a prohibited starting space cannot be sufficiently compensated even at the storage cap. Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`);
    }
  }

  if (scenario.payToWin) {
    const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
    const baseStartingEnergy = payToWinPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY;
    if (payToWinPricing?.hasLatePriceDifference) {
      const firstLatePlayer = payToWinPricing.lateSelectorStart
        ?? scenario.playerCount;
      const lastLatePlayer = payToWinPricing.lateSelectorEnd ?? scenario.playerCount;
      const singleLatePlayer = firstLatePlayer === lastLatePlayer;
      const latePlayerText = singleLatePlayer
        ? `player ${firstLatePlayer}`
        : `players ${firstLatePlayer}–${lastLatePlayer}`;
      const hasUnavailableSelectors = (
        (payToWinPricing.earlyUnavailableCount ?? 0) > 0 ||
        (payToWinPricing.lateUnavailableCount ?? 0) > 0
      );
      const dashText = hasUnavailableSelectors
        ? " A dash in either position means that starting space is unavailable to that selector group; a fully unavailable space uses the prohibited-start marker instead of a price."
        : "";
      notes.push(
        `Pay to Win: green starting spaces show starting Energy costs. Pay the shown cost from your ${baseStartingEnergy} starting Energy when choosing a starting space. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first cost.${dashText} Resolve Pay to Win starting-space selection before dealing or revealing any starting upgrade cards.`
      );
    } else {
      notes.push(`Pay to Win: green starting spaces show the starting Energy cost for choosing that space. Pay that cost from your ${baseStartingEnergy} starting Energy when choosing a starting space; a start whose cost exceeds your available starting Energy is unavailable. Resolve Pay to Win starting-space selection before dealing or revealing any starting upgrade cards.`);
    }
  }

  if (scenario.factoryRejects) {
    notes.push(appendRuleReference(
      "Factory Rejects: hand size is 7 instead of 9.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.lessDeadlyGame) {
    notes.push(appendRuleReference(
      "Walled In: board edges act as walls.",
      { section: "A Less Deadly Game", page: 32 }
    ));
  }

  if (scenario.lessSpammyGame) {
    notes.push(appendRuleReference(
      "SPAM Filter: at the end of the programming phase, discard all SPAM cards from your hand to your discard pile.",
      { section: "A Less SPAM-Y Game", page: 32 }
    ));
  }

  if (scenario.criticalSpam) {
    notes.push(appendRuleReference(
      "Critical Spam: after a SPAM card resolves, put it in the player's discard pile instead of the damage discard pile. Shutdown removes SPAM normally.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.criticalHaywire) {
    notes.push(appendRuleReference(
      "Critical Haywire: Haywire cards on registers count against hand size when drawing cards at the start of the programming phase.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.permanentShutdown) {
    notes.push(appendRuleReference(
      "Permanent Shutdown: if you have nothing but SPAM in your hand after drawing cards at the beginning of programming phase, your robot is destroyed and you are out of the game. If only one robot is left, that player wins the game!",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.moreDeadlyGame) {
    notes.push(appendRuleReference(
      "Hard Reboot: rebooting deals 3 damage instead of 2.",
      { section: "A More Deadly Game", page: 28 }
    ));
  }

  if (scenario.cuttingFloor) {
    notes.push("Cutting Floor: all board lasers deal double damage; for example, a double board laser deals 4 damage.");
  }

  if (scenario.flamingOil) {
    notes.push("Flaming Oil: the first time each register that a robot enters, exits, or starts in an oil slick, it takes 1 damage.");
  }

  if (scenario.repulsorOverdrive) {
    notes.push("Repulsor Overdrive: repulsors push robots twice the full distance of the triggering Move card.");
  }

  if (scenario.setToKill) {
    notes.push(appendRuleReference(
      "Set to Kill: robots' main lasers deal 1 extra damage.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.setToStun) {
    notes.push("Set to Stun: SPAM drawn because of a robot's main laser is immediately discarded to the damage discard pile without effect.");
  }

  if (scenario.virtualBots) {
    const entry = scenario.checkpoints?.[0];
    const dirText = entry?.facing ? ` facing ${entry.facing}` : "";
    const entryName = scenario.recoveryRule === "reboot_tokens" ? "starting reboot" : "entry";
    const markerDescription = scenario.recoveryRule === "reboot_tokens"
      ? "the reboot token with an orange energy cube on it"
      : "a reboot token with an orange energy cube on it";

    if (scenario.startupSpinUp) {
      notes.push(
        appendRuleReference(
          `Virtual Bots: do not use a docking bay or starting spaces. The ${entryName} is marked by ${markerDescription}. Place every player's Archive Token there. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
      notes.push(
        appendRuleReference(
          `Startup Spin-Up with Virtual Bots: in priority order, players choose the initial facing of their Virtual Bots freely at the ${entryName}.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
    } else {
      notes.push(
        appendRuleReference(
          `Virtual Bots: do not use a docking bay or starting spaces. The ${entryName} is marked by ${markerDescription}${dirText}. Place every player's Archive Token there facing in the direction shown by the marker. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
    }
  }

  if (scenario.startupSpinUp && !scenario.virtualBots && !scenario.noDocks) {
    notes.push(appendRuleReference(
      "Startup Spin-Up: during setup, robots can start with any facing.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.upgradeWorld) {
    notes.push(appendRuleReference(
      "Upgrade World: in addition to their usual effect, robots draw one upgrade card when activating batteries and chop shops.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.classicSharedDeck) {
    notes.push(appendRuleReference(
      "Shared Deck: shuffle all players' programming decks together into one shared deck. SPAM cards go to hand instead of into a player's deck.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.lighterGame) {
    notes.push(appendRuleReference(
      scenario.recoveryRule === "dynamic_archiving"
        ? "Energy Crisis: remove upgrade cards from the game; Battery and Chop Shop spaces provide no Energy or upgrade effects. Battery spaces are still used for archiving."
        : "Energy Crisis: remove upgrade cards from the game; Battery and Chop Shop spaces provide no Energy or upgrade effects.",
      { section: "A Lighter Game", page: 32 }
    ));
  }

  if (scenario.lessForeshadowing) {
    notes.push(appendRuleReference(
      "Less Foreshadowing: reshuffle each programming deck every turn.",
      { page: 32 }
    ));
  }

  // v39a: Special Rules may also surface optional rule guidance. This is distinct
  // from Course Notes: these entries describe relationships between rules, while
  // Course Notes remain solely about the character of the generated course.
  //
  // Guidance is registry-driven. Suggestions are shown only when their target is
  // legal and available for the current collection/preferences; warnings may be
  // authored later for combinations that are legal but noteworthy. Hard blocks,
  // prerequisites, and collection availability remain separate registry concepts.
  const guidanceNotes = buildVariantRuleGuidanceNotes(scenario);
  if (adviceNoteEl) {
    if (guidanceNotes.length) {
      adviceNoteEl.textContent = `RULES NOTES: ${guidanceNotes.join(" ")}`;
      adviceNoteEl.classList.remove("hidden");
    } else {
      adviceNoteEl.textContent = "";
      adviceNoteEl.classList.add("hidden");
    }
  }

  if (checkpointNotes.length) {
    checkpointNoteEl.textContent = checkpointNotes.join(" ");
    checkpointNoteEl.classList.remove("hidden");
  } else {
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
  }

  if (photoNotes.length) {
    photoRulesNoteEl.textContent = photoNotes.join(" ");
    photoRulesNoteEl.classList.remove("hidden");
  } else {
    photoRulesNoteEl.textContent = "";
    photoRulesNoteEl.classList.add("hidden");
  }

  bottomAnchorEl?.appendChild(bottomRulesBlockEl);
  bottomRulesBlockEl?.classList.toggle("hidden", !checkpointNotes.length && !photoNotes.length);

  const hasTopRules = notes.length > 0;
  topAnchorEl?.appendChild(topRulesBlockEl);
  topRulesBlockEl?.classList.toggle("hidden", !hasTopRules);
  if (notes.length) {
    noteEl.textContent = `SPECIAL RULES: ${notes.join(" ")}`;
    noteEl.classList.remove("hidden");
  } else {
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
  }
}

function describeAllowedVariants(preferences = {}) {
  const variants = [];
  const entries = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    label: variant.label,
    state: getVariantPreferenceState(preferences, variant.id)
  }));

  for (const entry of entries) {
    const { id, label, state } = entry;
    const normalized = normalizeVariantState(state);
    if (normalized === "off") {
      continue;
    }
    if (id === "actFast" && normalized === "forced" && ACT_FAST_MODE_IDS.has(preferences.actFastMode)) {
      variants.push(`${label} (${formatActFastMode(preferences.actFastMode)})`);
    } else {
      variants.push(`${label} (${getVariantStateCopy(id, normalized).label})`);
    }
  }

  return variants.length ? variants.join(", ") : "none";
}

function updateLegend(scenario) {
  const rebootTokenEl = document.getElementById("legend-reboot-token");
  const payToWinStartEl = document.getElementById("legend-pay-to-win-start");
  if (rebootTokenEl) {
    rebootTokenEl.textContent = scenario?.virtualBots
      ? (scenario?.rebootTokens?.length
        ? "Green markers: Virtual Bots entry and reboot token"
        : "Green marker + orange cube: Virtual Bots entry")
      : "Green marker: reboot token";
  }
  rebootTokenEl?.classList.toggle("hidden", !scenario?.virtualBots && !["reboot_tokens", "home_reboot"].includes(scenario?.recoveryRule));
  if (payToWinStartEl) {
    payToWinStartEl.textContent = scenario?.subsidizedStarts
      ? "Light-blue square: extra starting Energy subsidy"
      : "Green square: Pay to Win starting Energy cost";
  }
  payToWinStartEl?.classList.toggle("hidden", !(scenario?.payToWin || scenario?.subsidizedStarts));
}

function normalizeVariantState(value) {
  if (value === true) return "allowed";
  if (value === false) return "off";
  return value === "forced" || value === "allowed" || value === "off" ? value : "off";
}

function getVariantControlState(variantId) {
  const button = document.getElementById(VARIANT_CONTROL_IDS[variantId]);
  return normalizeVariantState(button?.dataset.state ?? "off");
}

function setVariantControlState(variantId, state, buttonEl = null) {
  const normalized = normalizeVariantState(state);
  if (variantId === "actFast") {
    if (normalized === "off" || normalized === "allowed") {
      setActFastControlChoice(normalized, buttonEl);
      return;
    }
    const currentChoice = getActFastControlChoice(buttonEl);
    setActFastControlChoice(ACT_FAST_MODE_IDS.has(currentChoice) ? currentChoice : "allowed", buttonEl);
    return;
  }

  const targets = buttonEl
    ? [buttonEl]
    : Array.from(document.querySelectorAll(`[data-variant-id="${variantId}"]`));
  if (!targets.length) {
    return;
  }
  const stateCopy = getVariantStateCopy(variantId, normalized);

  targets.forEach((button) => {
    button.dataset.state = normalized;
    button.textContent = stateCopy.shortLabel;
    button.title = stateCopy.label;
    button.setAttribute("aria-label", `${getVariantDefinitionLabel(variantId)}: ${stateCopy.label}`);
  });
}

function cycleVariantControlState(variantId) {
  const current = getVariantControlState(variantId);
  const next = current === "off"
    ? "allowed"
    : current === "allowed"
      ? "forced"
      : "off";
  setVariantControlState(variantId, next);
  if (next === "forced") {
    getConflictingVariantIds(variantId).forEach((conflictId) => {
      if (getVariantControlState(conflictId) === "forced") {
        setVariantControlState(conflictId, "off");
        showToast(`${getVariantDefinitionLabel(conflictId)} was turned off because ${getVariantDefinitionLabel(variantId)} is set to Must.`);
      }
    });
  }
  updateVariantAvailability();
  updateVariantSummary();
}

function sampleVariantComplexityBudget(preferences = {}) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const budgets = {
    easy: [0, 0, 0, 0, 1, 1, 1, 2],
    moderate: [0, 0, 1, 1, 1, 2, 2, 3],
    hard: [0, 1, 2, 2, 3, 3, 4, 4, 5, 6]
  };

  return sample(budgets[difficulty] || budgets.moderate);
}

function getVariantBaseChance(variantId, preferences = {}) {
  const hardestBlockedVariants = new Set([
    "lighterGame",
    "lessSpammyGame",
    "lessDeadlyGame",
    "setToStun",
    "startupSpinUp"
  ]);
  if (
    isHardestDifficulty(preferences) &&
    hardestBlockedVariants.has(variantId) &&
    getVariantPreferenceState(preferences, variantId) !== "forced"
  ) {
    return 0;
  }

  const difficulty = getTuningDifficulty(preferences.difficulty);
  const byVariant = {
    actFast: { easy: 0.08, moderate: 0.16, hard: 0.2 },
    lighterGame: { easy: 0.42, moderate: 0.28, hard: 0.18 },
    lessSpammyGame: { easy: 0.32, moderate: 0.22, hard: 0.14 },
    criticalSpam: { easy: 0.08, moderate: 0.15, hard: 0.24 },
    criticalHaywire: { easy: 0.08, moderate: 0.14, hard: 0.22 },
    permanentShutdown: { easy: 0.02, moderate: 0.06, hard: 0.12 },
    lessDeadlyGame: { easy: 0.3, moderate: 0.2, hard: 0.14 },
    moreDeadlyGame: { easy: 0.05, moderate: 0.14, hard: 0.26 },
    cuttingFloor: { easy: 0.04, moderate: 0.12, hard: 0.2 },
    flamingOil: { easy: 0.04, moderate: 0.1, hard: 0.18 },
    repulsorOverdrive: { easy: 0.01, moderate: 0.03, hard: 0.06 },
    setToKill: { easy: 0.05, moderate: 0.14, hard: 0.22 },
    setToStun: { easy: 0.12, moderate: 0.14, hard: 0.08 },
    upgradeWorld: { easy: 0.08, moderate: 0.14, hard: 0.18 },
    classicSharedDeck: { easy: 0.01, moderate: 0.07, hard: 0.2 },
    competitiveMode: { easy: 0.08, moderate: 0.16, hard: 0.22 },
    payToWin: { easy: 0.1, moderate: 0.18, hard: 0.2 },
    subsidizedStarts: { easy: 0.1, moderate: 0.18, hard: 0.2 },
    dynamicArchiving: { easy: 0.24, moderate: 0.4, hard: 0.34 },
    extraDocks: { easy: 0.08, moderate: 0.2, hard: 0.26 },
    factoryRejects: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    startupSpinUp: { easy: 0.08, moderate: 0.14, hard: 0.1 },
    hazardousFlags: { easy: 0.08, moderate: 0.16, hard: 0.24 },
    repairStations: { easy: 0.2, moderate: 0.15, hard: 0.1 },
    movingTargets: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    homeReboot: { easy: 0.06, moderate: 0.12, hard: 0.18 },
    lessForeshadowing: { easy: 0.07, moderate: 0.16, hard: 0.24 },
    staggeredBoards: { easy: 0.18, moderate: 0.42, hard: 0.5 },
    virtualBots: { easy: 0.06, moderate: 0.14, hard: 0.2 },
    noDocks: { easy: 0.07, moderate: 0.16, hard: 0.22 },
    sandwichedDock: { easy: 0.04, moderate: 0.04, hard: 0.04 }
  };

  return byVariant[variantId]?.[difficulty] ?? 0.2;
}

function getLateEasyVariantRescueBonus(variantId, preferences = {}) {
  const attempt = preferences.generationAttempt ?? 1;
  const difficulty = getTuningDifficulty(preferences.difficulty);

  if (difficulty !== "easy" || attempt < 28) {
    return 0;
  }

  const latePhase = attempt >= 36 ? 2 : 1;
  const easingVariants = {
    lighterGame: latePhase === 2 ? 0.34 : 0.18,
    lessSpammyGame: latePhase === 2 ? 0.28 : 0.14,
    lessDeadlyGame: latePhase === 2 ? 0.24 : 0.12
  };
  const hardeningVariants = {
    actFast: -0.06,
    moreDeadlyGame: -0.12,
    classicSharedDeck: -0.08,
    competitiveMode: -0.05,
    payToWin: -0.04,
    subsidizedStarts: -0.04,
    factoryRejects: -0.08,
    hazardousFlags: -0.08,
    movingTargets: -0.1,
    lessForeshadowing: -0.08
  };

  return easingVariants[variantId] ?? hardeningVariants[variantId] ?? 0;
}

function chooseVariantBundle(preferences = {}, options = {}) {
  const { preferences: normalizedPreferences } = normalizeForcedVariantPreferenceConflicts(preferences);
  const definitions = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    cost: variant.cost,
    defaultState: variant.defaultState
  }));
  const active = Object.fromEntries(definitions.map((entry) => [entry.id, false]));
  let usedBudget = 0;
  const pieceMap = options.pieceMap ?? cachedAssets?.pieceMap ?? null;
  const collectionAvailableEntries = definitions.filter((entry) => (
    variantIsAvailable(entry.id, normalizedPreferences, pieceMap)
  ));

  const forcedEntries = collectionAvailableEntries.filter((entry) => getVariantPreferenceState(normalizedPreferences, entry.id) === "forced");
  forcedEntries.forEach((entry) => {
    if (getCourseConflictingVariantIds(entry.id).some((conflictId) => active[conflictId])) {
      return;
    }
    active[entry.id] = true;
  });

  const sampledBudget = sampleVariantComplexityBudget(normalizedPreferences);
  const budget = sampledBudget;
  const allowedEntries = collectionAvailableEntries
    .filter((entry) => getVariantPreferenceState(normalizedPreferences, entry.id) === "allowed")
    .map((entry) => ({
      ...entry,
      chance: clamp(
        getVariantBaseChance(entry.id, normalizedPreferences) + getLateEasyVariantRescueBonus(entry.id, normalizedPreferences),
        0,
        0.95
      )
    }));
  const orderedEntries = weightedOrder(
    allowedEntries,
    (entry) => Math.max(0.01, entry.chance + generationRandom() * 0.08)
  ).sort((left, right) => {
    if (left.id === "permanentShutdown" && right.id !== "permanentShutdown") {
      return 1;
    }
    if (right.id === "permanentShutdown" && left.id !== "permanentShutdown") {
      return -1;
    }
    return 0;
  });

  for (const entry of orderedEntries) {
    if (usedBudget + entry.cost > budget) {
      continue;
    }

    let chance = entry.chance;
    const forcedConflictIds = getCourseConflictingVariantIds(entry.id).filter((variantId) => active[variantId] && getVariantPreferenceState(normalizedPreferences, variantId) === "forced");
    const activeConflictIds = getCourseConflictingVariantIds(entry.id).filter((variantId) => active[variantId]);
    const missingRequiredIds = getMissingRequiredVariantIds(entry.id, normalizedPreferences, active);
    if (
      activeConflictIds.length ||
      missingRequiredIds.length ||
      forcedConflictIds.length
    ) {
      chance = 0;
    }

    if (generationRandom() < chance) {
      active[entry.id] = true;
      usedBudget += entry.cost;
    }
  }

  return buildVariantBundle(active, { budget, usedBudget });
}

function isVariantForced(preferences = {}, variantId) {
  return getVariantPreferenceState(preferences, variantId) === "forced";
}

function isVariantExplicitlyForced(preferences = {}, variantId) {
  if (isVariantForced(preferences, variantId)) {
    return true;
  }
  return variantId === "actFast" && Boolean(preferences.actFastMode);
}

function chooseActFastMode(preferences = {}) {
  const fixedMode = ACT_FAST_MODE_IDS.has(preferences.actFastMode) ? preferences.actFastMode : null;
  if (fixedMode && getVariantPreferenceState(preferences, "actFast") === "forced") {
    return fixedMode;
  }

  const difficulty = getTuningDifficulty(preferences.difficulty);
  const table = {
    easy: [
      "countdown_3m",
      "countdown_3m",
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_1m"
    ],
    moderate: [
      "last_player_30s",
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_3m",
      "countdown_1m",
      "countdown_30s"
    ],
    hard: [
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_1m",
      "countdown_1m",
      "countdown_30s",
      "countdown_3m"
    ]
  };

  return sample(table[difficulty] || table.moderate);
}

function normalizeGenerationMode(value) {
  return Object.prototype.hasOwnProperty.call(GENERATION_MODE_PROFILES, value)
    ? value
    : DEFAULT_GENERATION_MODE;
}

function getGenerationModeProfile(preferences = {}) {
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
const CONSTRUCTION_GUIDANCE_STAGE_POLICIES = Object.freeze({
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

const CONSTRUCTION_GUIDANCE_MODE_POLICIES = Object.freeze({
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

function isCalibrationHarnessGeneration(preferences = {}) {
  return Boolean(
    preferences.calibrationObserveTargetMisses ||
    preferences.calibrationSingleCheckpointProposal ||
    preferences.calibrationUnguidedBoardSelection ||
    Number.isFinite(Number(preferences.calibrationBoardCount)) ||
    Number.isFinite(Number(preferences.calibrationFlagCount)) ||
    Number.isFinite(Number(preferences.calibrationConstructionGuidanceStrength))
  );
}

function getConstructionGuidanceModePolicy(preferences = {}) {
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
      boardProposalCount: 1,
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

function getConstructionGuidanceStrength(preferences = {}) {
  // The calibration runner can still explicitly control its neutral proposal
  // guidance strength; production uses the generation-mode trust profile above.
  const calibrationStrength = Number(preferences.calibrationConstructionGuidanceStrength);
  if (Number.isFinite(calibrationStrength) && calibrationStrength > 0) {
    return clamp(calibrationStrength, 0.2, 2);
  }
  return getConstructionGuidanceModePolicy(preferences).calibrationStrength;
}

function formatGenerationModeLabel(value) {
  const mode = normalizeGenerationMode(value);
  return GENERATION_MODE_LABELS[mode] ?? GENERATION_MODE_LABELS[DEFAULT_GENERATION_MODE];
}

function getScenarioGenerationMode(scenario) {
  const explicitMode = scenario?.generationDiagnostics?.generationMode ?? scenario?.preferences?.generationMode;
  // Scenarios saved before the Mode control existed used today's Balanced
  // search budgets. Preserve that meaning when reopening an old snapshot.
  return explicitMode ? normalizeGenerationMode(explicitMode) : "balanced";
}

function getScenarioGenerationMaxAttempts(scenario) {
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

function getAvailableConcretePreferenceValues(selectId) {
  if (typeof document === "undefined") {
    return [];
  }

  const select = document.getElementById(selectId);
  if (!select) {
    return [];
  }

  return Array.from(select.options ?? [])
    .filter((option) => {
      const value = String(option.value ?? "").trim();
      const parent = option.parentElement;
      const parentDisabled = parent?.tagName === "OPTGROUP" && Boolean(parent.disabled);
      return Boolean(
        value &&
        value !== "any" &&
        !option.disabled &&
        !option.hidden &&
        !parentDisabled
      );
    })
    .map((option) => String(option.value).trim());
}

function resolveAnyPreferencesForGeneration(preferences = {}) {
  const effectivePreferences = { ...preferences };
  const resolution = {};

  for (const [key, selectId] of [["difficulty", "difficulty"], ["length", "length"]]) {
    if (effectivePreferences[key] !== "any") {
      continue;
    }

    const choices = getAvailableConcretePreferenceValues(selectId);
    if (!choices.length) {
      throw new Error(`Cannot resolve Any ${key}: no concrete ${key} options are currently available.`);
    }

    // Epic is deliberately opt-in until the fresh Epic-aware calibration exists.
    // Any is guidance-only and may omit unusually costly target combinations;
    // after recalibration this pool can become work-aware instead of hard-coded.
    const ordinaryChoices = key === "length"
      ? choices.filter((value) => value !== "epic")
      : choices;
    const selectionPool = ordinaryChoices.length ? ordinaryChoices : choices;
    const selectedIndex = Math.min(
      selectionPool.length - 1,
      Math.floor(generationRandom() * selectionPool.length)
    );
    const selected = selectionPool[selectedIndex];
    effectivePreferences[key] = selected;
    resolution[key] = selected;
  }

  // Any is a hidden construction target only. It may steer calibrated proposal
  // ranking, but it must never become an acceptance/rejection requirement.
  effectivePreferences.targetGuidanceOnlyDifficulty = preferences.difficulty === "any";
  effectivePreferences.targetGuidanceOnlyLength = preferences.length === "any";

  return {
    effectivePreferences,
    resolution: Object.keys(resolution).length ? resolution : null
  };
}

function getPreferencesFromControls() {
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    generationMode: normalizeGenerationMode(document.getElementById("generation-mode")?.value),
    overlayMode: normalizeOverlayMode(document.getElementById("overlay-mode")?.value),
    actFastMode: getActFastModeFromControls(),
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "rr-dice": document.getElementById("expansion-rr-dice").checked,
      "30th-anniversary": document.getElementById("expansion-30th-anniversary").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "chaos-and-carnage": document.getElementById("expansion-chaos-and-carnage").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked
    },
    allowedVariantRules: Object.fromEntries(
      VARIANT_DEFINITIONS.map((variant) => [variant.id, getVariantControlState(variant.id)])
    )
  };
}

function applyPreferencesToControls(preferences) {
  if (!preferences) {
    return;
  }

  const {
    preferences: normalizedPreferences,
    relaxedIds
  } = normalizeForcedVariantPreferenceConflicts(preferences);

  document.getElementById("player-count").value = String(normalizedPreferences.playerCount ?? 4);
  document.getElementById("difficulty").value = normalizedPreferences.difficulty ?? "any";
  document.getElementById("length").value = normalizedPreferences.length ?? "any";
  const generationModeEl = document.getElementById("generation-mode");
  if (generationModeEl) {
    // Missing means a pre-Mode saved scenario, whose search behavior was the
    // current Balanced profile. Fresh pages still default to Standard in HTML.
    generationModeEl.value = normalizedPreferences.generationMode
      ? normalizeGenerationMode(normalizedPreferences.generationMode)
      : "balanced";
  }
  setOverlayModeControl(normalizedPreferences.overlayMode);
  document.getElementById("expansion-roborally").checked = normalizedPreferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-rr-dice").checked = normalizedPreferences.selectedExpansions?.["rr-dice"] ?? false;
  document.getElementById("expansion-30th-anniversary").checked = normalizedPreferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = normalizedPreferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = normalizedPreferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = normalizedPreferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = normalizedPreferences.selectedExpansions?.["wet-and-wild"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    if (variant.id === "actFast") {
      return;
    }
    setVariantControlState(variant.id, getVariantPreferenceState(normalizedPreferences, variant.id));
  });
  const actFastState = getVariantPreferenceState(normalizedPreferences, "actFast");
  const actFastChoice = actFastState === "forced" && ACT_FAST_MODE_IDS.has(normalizedPreferences.actFastMode)
    ? normalizedPreferences.actFastMode
    : actFastState === "allowed"
      ? "allowed"
      : "off";
  setActFastControlChoice(actFastChoice);
  updateExpansionSummary();

  if (relaxedIds.length) {
    showToast(
      `Conflicting saved Must rules were normalized. ${relaxedIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} changed to Yes.`
    );
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}

function deriveBoardProfile(piece) {
  if (piece.kind !== "base" && piece.kind !== "small") {
    return {
      bias: {
        hazard: 1,
        congestion: 1,
        complexity: 1
      },
      swinginess: 1,
      overall: 1,
      band: "neutral"
    };
  }

  const tiles = piece.tiles || [];
  const area = Math.max(1, piece.width * piece.height);
  let hazardWeight = 0;
  let congestionWeight = 0;
  let complexityWeight = 0;
  let swingWeight = 0;
  let pitCount = 0;
  let beltCount = 0;
  let portalCount = 0;
  let teleporterCount = 0;
  let randomizerCount = 0;
  let crusherCount = 0;
  let pushCount = 0;
  let hazardCount = 0;

  for (const tile of tiles) {
    for (const feature of tile.features || []) {
      const delta = getBoardProfileDelta(feature);
      hazardWeight += delta.hazardWeight;
      congestionWeight += delta.congestionWeight;
      complexityWeight += delta.complexityWeight;
      swingWeight += delta.swingWeight;
      pitCount += delta.pitCount;
      beltCount += delta.beltCount;
      portalCount += delta.portalCount;
      teleporterCount += delta.teleporterCount;
      randomizerCount += delta.randomizerCount;
      crusherCount += delta.crusherCount;
      pushCount += delta.pushCount;
      hazardCount += delta.hazardCount;
    }
  }

  const bias = {
    hazard: normalizeBias(hazardWeight / area * 1.4),
    congestion: normalizeBias(congestionWeight / area * 1.2),
    complexity: normalizeBias(complexityWeight / area * 1.2)
  };
  const swinginess = normalizeBias(swingWeight / area * 1.4);
  const density = (
    hazardCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.hazard +
    beltCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.belt +
    portalCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.portal +
    pushCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.push
  ) / area;
  const hazardDensity = hazardCount / area;
  const hazardPressure = Math.max(
    0,
    (hazardDensity - BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD) * BOARD_PROFILE_HAZARD_DENSITY_WEIGHT
  );
  const overall = Number(clamp(
    bias.hazard * 0.4 +
    bias.congestion * 0.22 +
    bias.complexity * 0.24 +
    swinginess * 0.14 +
    density * BOARD_PROFILE_DENSITY_WEIGHT +
    hazardPressure,
    1,
    3.6
  ).toFixed(2));
  const band = overall <= 1.7
  ? "intro"
  : overall <= 2.25
    ? "standard"
    : overall <= 3.0
      ? "challenging"
      : "extreme";

  return {
    bias,
    swinginess,
    overall,
    density: Number(density.toFixed(3)),
    hazardDensity: Number(hazardDensity.toFixed(3)),
    band,
    signals: {
      pitCount,
      beltCount,
      portalCount,
      teleporterCount,
      randomizerCount,
      crusherCount,
      pushCount,
      hazardCount,
      hazardPressure: Number(hazardPressure.toFixed(3))
    }
  };
}

function guidanceLevelForAttempt(attempt) {
  if (attempt >= 36) return 2;
  if (attempt >= 13) return 1;
  return 0;
}

function normalizeConstructionGuidanceResidualSpread(spread = null) {
  if (!spread || typeof spread !== "object") return null;
  const normalized = {};
  for (const key of ["absoluteP50", "absoluteP80", "absoluteP90", "absoluteP95", "signedP05", "signedP95"]) {
    const value = Number(spread[key]);
    if (Number.isFinite(value)) normalized[key] = value;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeConstructionGuidanceEvidence(evidence = null) {
  if (!evidence || typeof evidence !== "object") return {};
  const normalized = {};
  for (const key of [
    "sampleSize",
    "heldOutRmse",
    "heldOutMae",
    "heldOutRSquared",
    "actualRate",
    "predictedRate",
    "heldOutBrier",
    "baselineBrier"
  ]) {
    const value = Number(evidence[key]);
    if (Number.isFinite(value)) normalized[key] = value;
  }
  const spread = normalizeConstructionGuidanceResidualSpread(evidence.outOfFoldResidualSpread);
  if (spread) normalized.outOfFoldResidualSpread = spread;
  if (evidence.predictedRange && typeof evidence.predictedRange === "object") {
    normalized.predictedRange = Object.fromEntries(
      Object.entries(evidence.predictedRange)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => Number.isFinite(value))
    );
  }
  if (Array.isArray(evidence.calibrationBins)) {
    normalized.calibrationBins = evidence.calibrationBins.map((row) => ({
      bin: String(row?.bin ?? ""),
      n: Number(row?.n) || 0,
      predictedMean: Number.isFinite(Number(row?.predictedMean)) ? Number(row.predictedMean) : null,
      actualRate: Number.isFinite(Number(row?.actualRate)) ? Number(row.actualRate) : null
    }));
  }
  return normalized;
}

function normalizeConstructionGuidanceModel(model, expectedType = null) {
  if (!model || typeof model !== "object") return null;
  const type = String(model.type ?? "");
  if (!["linear", "logistic"].includes(type) || (expectedType && type !== expectedType)) {
    return null;
  }

  const coefficients = Object.fromEntries(
    Object.entries(model.coefficients ?? {})
      .map(([key, value]) => [String(key), Number(value)])
      .filter(([, value]) => Number.isFinite(value))
  );
  if (!Number.isFinite(coefficients["(Intercept)"])) return null;

  const factorLevels = Object.fromEntries(
    Object.entries(model.factorLevels ?? {})
      .map(([key, levels]) => [
        String(key),
        Array.isArray(levels) ? levels.map((level) => String(level)) : []
      ])
      .filter(([, levels]) => levels.length > 0)
  );
  if (!Object.keys(factorLevels).length) return null;

  const targetTransform = type === "linear"
    ? String(model.targetTransform ?? "identity")
    : "logit";
  if (type === "linear" && !["identity", "log1p"].includes(targetTransform)) {
    return null;
  }

  return {
    type,
    targetTransform,
    formula: String(model.formula ?? ""),
    coefficients,
    factorLevels,
    evidence: normalizeConstructionGuidanceEvidence(model.evidence)
  };
}

function normalizeConstructionGuidanceCalibration(calibration) {
  if (
    Number(calibration?.schemaVersion) !== 2 ||
    calibration?.calibration !== "robo-rally-construction-guidance-production-v2" ||
    calibration?.policy?.guidanceOnly !== true ||
    calibration?.policy?.routeLegalityAuthority !== false ||
    calibration?.policy?.bandAuthority !== false
  ) {
    return null;
  }

  const normalLandscape = {};
  for (const stage of ["countsKnown", "boardsKnown", "checkpointsKnown"]) {
    const source = calibration?.normalLandscape?.[stage];
    const length = normalizeConstructionGuidanceModel(source?.length, "linear");
    const difficulty = normalizeConstructionGuidanceModel(source?.difficulty, "linear");
    const routeCost = normalizeConstructionGuidanceModel(source?.routeCost, "linear");
    if (!length || !difficulty || !routeCost) return null;
    normalLandscape[stage] = { length, difficulty, routeCost };
  }

  const structuralSuccessPrior = normalizeConstructionGuidanceModel(
    calibration?.structuralSuccessPrior,
    "logistic"
  );

  const normalizeStringArray = (values) => Array.isArray(values)
    ? values.map((value) => String(value))
    : [];
  const normalizeNumberArray = (values) => Array.isArray(values)
    ? values.map(Number).filter(Number.isFinite)
    : [];

  const dynamicArchiving = calibration?.treatments?.dynamicArchiving ?? {};
  const structuralBoardOverlay = calibration?.treatments?.structuralBoardOverlay ?? {};
  const overlayWorkPrior = structuralBoardOverlay?.analysisWorkPrior ?? {};

  const dynamicArchivingContextual = dynamicArchiving.contextualModelEnabled === true;
  const dynamicArchivingLengthContextModel = dynamicArchivingContextual
    ? normalizeConstructionGuidanceModel(dynamicArchiving.lengthContextModel, "linear")
    : null;
  if (
    dynamicArchivingContextual &&
    (
      String(dynamicArchiving.lengthContextStage ?? "") !== "checkpointsKnown" ||
      !dynamicArchivingLengthContextModel
    )
  ) {
    return null;
  }

  const overlayWorkContextual = overlayWorkPrior.contextualModelEnabled === true;
  const overlayWorkLogRatioContextModel = overlayWorkContextual
    ? normalizeConstructionGuidanceModel(overlayWorkPrior.logRatioContextModel, "linear")
    : null;
  if (
    structuralBoardOverlay.lengthDifficultyOffsetEnabled === true ||
    overlayWorkPrior.overlayCountSpecificEnabled === true ||
    overlayWorkPrior.pieceIdentityEnabled === true ||
    (
      overlayWorkContextual &&
      (
        String(overlayWorkPrior.contextualStage ?? "") !== "checkpointsKnown" ||
        !overlayWorkLogRatioContextModel
      )
    )
  ) {
    return null;
  }

  return {
    schemaVersion: 2,
    calibration: calibration.calibration,
    source: calibration.source ?? null,
    policy: calibration.policy ?? null,
    domain: {
      players: normalizeNumberArray(calibration?.domain?.players),
      requestedBoardCounts: normalizeNumberArray(calibration?.domain?.requestedBoardCounts),
      requestedFlagCounts: normalizeNumberArray(calibration?.domain?.requestedFlagCounts),
      difficulties: normalizeStringArray(calibration?.domain?.difficulties),
      lengths: normalizeStringArray(calibration?.domain?.lengths),
      inventoryPresets: normalizeStringArray(calibration?.domain?.inventoryPresets)
    },
    normalLandscape,
    structuralSuccessPrior,
    treatments: {
      dynamicArchiving: {
        lengthEffectMean: Number(dynamicArchiving.lengthEffectMean),
        lengthEffectMedian: Number(dynamicArchiving.lengthEffectMedian),
        lengthEffectP10: Number(dynamicArchiving.lengthEffectP10),
        lengthEffectP90: Number(dynamicArchiving.lengthEffectP90),
        difficultyEffectMean: Number(dynamicArchiving.difficultyEffectMean),
        difficultyEffectMedian: Number(dynamicArchiving.difficultyEffectMedian),
        difficultyEffectP10: Number(dynamicArchiving.difficultyEffectP10),
        difficultyEffectP90: Number(dynamicArchiving.difficultyEffectP90),
        contextualModelEnabled: dynamicArchivingContextual,
        lengthContextStage: dynamicArchivingContextual ? "checkpointsKnown" : null,
        lengthContextModel: dynamicArchivingLengthContextModel
      },
      structuralBoardOverlay: {
        lengthDifficultyOffsetEnabled: Boolean(structuralBoardOverlay.lengthDifficultyOffsetEnabled),
        analysisWorkPrior: {
          medianExpansionIncrease: Number(overlayWorkPrior.medianExpansionIncrease),
          medianExpansionRatio: Number(overlayWorkPrior.medianExpansionRatio),
          p90ExpansionRatio: Number(overlayWorkPrior.p90ExpansionRatio),
          contextualModelEnabled: overlayWorkContextual,
          contextualStage: overlayWorkContextual ? "checkpointsKnown" : null,
          logRatioContextModel: overlayWorkLogRatioContextModel,
          overlayCountSpecificEnabled: Boolean(overlayWorkPrior.overlayCountSpecificEnabled),
          pieceIdentityEnabled: Boolean(overlayWorkPrior.pieceIdentityEnabled)
        }
      }
    },
    uncertaintyNotes: calibration.uncertaintyNotes ?? null
  };
}

function getConstructionGuidanceInventoryPreset(calibration, preferences = {}, pieceMap = {}) {
  const supported = new Set(calibration?.domain?.inventoryPresets ?? []);
  if (!supported.size) return null;

  const selected = [...getSelectedExpansionIds(preferences)].sort();
  const all = getCalibrationExpansionIds(pieceMap);
  const sameIds = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );

  if (supported.has("all") && sameIds(selected, all)) {
    return "all";
  }
  if (selected.length === 1) {
    if (selected[0] === "roborally" && supported.has("core")) {
      return "core";
    }
    const smallPreset = `small:${selected[0]}`;
    return supported.has(smallPreset) ? smallPreset : null;
  }
  if (selected.length === 2 && selected.includes("roborally")) {
    const expansionId = selected.find((id) => id !== "roborally");
    const preset = `core+${expansionId}`;
    return supported.has(preset) ? preset : null;
  }
  return null;
}

function getConstructionGuidanceFactorContribution(model, factorName, rawLevel) {
  const levels = model?.factorLevels?.[factorName] ?? [];
  if (!levels.length) return null;
  const requestedLevel = String(rawLevel);
  const coefficientForLevel = (level) => {
    if (level === levels[0]) return 0;
    // R drops aliased coefficients from the exported snapshot. For a known
    // factor level, an absent coefficient therefore represents the rank-reduced
    // zero contribution rather than an unknown level.
    const value = Number(model.coefficients?.[`${factorName}${level}`]);
    return Number.isFinite(value) ? value : 0;
  };

  if (levels.includes(requestedLevel)) {
    return coefficientForLevel(requestedLevel);
  }

  // Player count was calibrated at 2/4/6/8 while the app also supports the odd
  // counts between them. Interpolate only inside that observed range; never
  // extrapolate beyond it or interpolate any other categorical factor.
  if (factorName === "player_factor") {
    const requested = Number(rawLevel);
    const numericLevels = levels
      .map((level) => ({ level, value: Number(level) }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((left, right) => left.value - right.value);
    if (
      Number.isFinite(requested) &&
      numericLevels.length >= 2 &&
      requested >= numericLevels[0].value &&
      requested <= numericLevels.at(-1).value
    ) {
      for (let index = 1; index < numericLevels.length; index += 1) {
        const lower = numericLevels[index - 1];
        const upper = numericLevels[index];
        if (requested < lower.value || requested > upper.value) continue;
        const span = upper.value - lower.value;
        if (!(span > 0)) return coefficientForLevel(lower.level);
        const fraction = (requested - lower.value) / span;
        const lowerContribution = coefficientForLevel(lower.level);
        const upperContribution = coefficientForLevel(upper.level);
        return lowerContribution + (upperContribution - lowerContribution) * fraction;
      }
    }
  }

  return null;
}

function evaluateConstructionGuidanceModel(model, features = {}) {
  if (!model) return null;
  let linearPredictor = Number(model.coefficients?.["(Intercept)"]);
  if (!Number.isFinite(linearPredictor)) return null;

  const factorCoefficientKeys = new Set();
  for (const [factorName, levels] of Object.entries(model.factorLevels ?? {})) {
    const contribution = getConstructionGuidanceFactorContribution(
      model,
      factorName,
      features[factorName]
    );
    if (!Number.isFinite(contribution)) return null;
    linearPredictor += contribution;
    for (const level of levels.slice(1)) {
      factorCoefficientKeys.add(`${factorName}${level}`);
    }
  }

  for (const [term, coefficient] of Object.entries(model.coefficients ?? {})) {
    if (term === "(Intercept)" || factorCoefficientKeys.has(term)) continue;
    const value = Number(features[term]);
    if (!Number.isFinite(value)) return null;
    linearPredictor += Number(coefficient) * value;
  }

  if (model.type === "logistic") {
    const probability = linearPredictor >= 0
      ? 1 / (1 + Math.exp(-linearPredictor))
      : Math.exp(linearPredictor) / (1 + Math.exp(linearPredictor));
    return {
      linearPredictor,
      value: clamp(probability, 0, 1)
    };
  }

  const value = model.targetTransform === "log1p"
    ? Math.max(0, Math.expm1(linearPredictor))
    : linearPredictor;
  return { linearPredictor, value };
}

function getConstructionGuidanceBaseFeatures(
  calibration,
  preferences,
  pieceMap,
  boardCount,
  flagCount
) {
  const inventoryPreset = getConstructionGuidanceInventoryPreset(
    calibration,
    preferences,
    pieceMap
  );
  if (!inventoryPreset) return null;

  const difficulty = String(preferences.difficulty ?? "");
  const length = String(preferences.length ?? "");
  if (
    !calibration.domain.difficulties.includes(difficulty) ||
    !calibration.domain.lengths.includes(length)
  ) {
    return null;
  }

  const safeBoardCount = Number(boardCount);
  const safeFlagCount = Number(flagCount);
  const playerCount = Number(preferences.playerCount);
  if (
    !Number.isFinite(playerCount) ||
    !calibration.domain.requestedBoardCounts.includes(safeBoardCount) ||
    !calibration.domain.requestedFlagCounts.includes(safeFlagCount)
  ) {
    return null;
  }

  return {
    player_factor: String(playerCount),
    board_factor: String(safeBoardCount),
    flag_factor: String(safeFlagCount),
    difficulty_factor: difficulty,
    length_factor: length,
    inventory_factor: inventoryPreset
  };
}

function getConstructionGuidanceBoardFeatures(boardPlacements = [], pieceMap = {}) {
  const profileSummary = summarizeCalibrationBoardProfiles(boardPlacements, pieceMap);
  const layout = summarizeCalibrationLayout(boardPlacements, pieceMap);
  const features = {
    profile_overall: profileSummary.means.overall,
    profile_hazard: profileSummary.means.hazard,
    profile_congestion: profileSummary.means.congestion,
    profile_complexity: profileSummary.means.complexity,
    profile_swinginess: profileSummary.means.swinginess,
    profile_density: profileSummary.means.density,
    compactness: layout.compactness,
    adjacency_count: layout.adjacencyCount,
    graph_diameter: layout.graphDiameter
  };
  return Object.values(features).every((value) => Number.isFinite(Number(value)))
    ? features
    : null;
}

function getConstructionGuidanceCheckpointFeatures({
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = [],
  starts = [],
  tileMap = new Map(),
  pieceMap = {},
  preferences = {}
} = {}) {
  const snapshot = buildCalibrationConstructionSnapshot({
    boardPlacements,
    dockPlacements,
    overlayPlacements,
    checkpoints,
    starts,
    tileMap,
    pieceMap,
    preferences
  });
  const boardFeatures = getConstructionGuidanceBoardFeatures(boardPlacements, pieceMap);
  if (!boardFeatures) return null;

  // v47 production guidance keeps checkpoint-stage coverage when static topology
  // cannot be summarized. Match calibration-analysis.R exactly: fall back each
  // unavailable static distance to its Manhattan counterpart and carry one
  // explicit missingness indicator. Missing static topology is uncertainty/work
  // evidence only; it is never interpreted as route impossibility.
  const finiteSnapshotNumber = (value) => (
    typeof value === "number" && Number.isFinite(value) ? value : null
  );
  const firstStartManhattan = finiteSnapshotNumber(snapshot?.shape?.firstStartManhattanMean);
  const firstStartStatic = finiteSnapshotNumber(snapshot?.shape?.firstStartStaticMean);
  const sequentialManhattan = finiteSnapshotNumber(snapshot?.shape?.sequentialManhattanSum);
  const sequentialStatic = finiteSnapshotNumber(snapshot?.shape?.sequentialStaticSum);
  const finalManhattan = finiteSnapshotNumber(snapshot?.shape?.finalManhattan);
  const finalStatic = finiteSnapshotNumber(snapshot?.shape?.finalStaticDistance);
  const staticTopologyMissing = Number(
    firstStartStatic === null ||
    sequentialStatic === null ||
    finalStatic === null
  );

  const features = {
    ...boardFeatures,
    first_start_manhattan_mean: firstStartManhattan,
    first_start_static_mean: firstStartStatic,
    first_start_static_fallback: firstStartStatic ?? firstStartManhattan,
    sequential_manhattan_sum: sequentialManhattan,
    sequential_static_sum: sequentialStatic,
    sequential_static_fallback: sequentialStatic ?? sequentialManhattan,
    final_manhattan: finalManhattan,
    final_static_distance: finalStatic,
    final_static_fallback: finalStatic ?? finalManhattan,
    static_topology_missing: staticTopologyMissing,
    board_depth_mean: finiteSnapshotNumber(snapshot?.shape?.boardDepthMean),
    represented_board_count: finiteSnapshotNumber(snapshot?.shape?.representedBoardCount),
    shallow_checkpoint_count: finiteSnapshotNumber(snapshot?.shape?.shallowCheckpointCount)
  };

  // Raw static values are retained for diagnostics and may legitimately be null.
  // Validate only the full-coverage production feature set consumed by the v47
  // checkpoint models; evaluateConstructionGuidanceModel will independently reject
  // any future coefficient term for which a required numeric feature is absent.
  const requiredProductionFeatures = [
    ...Object.keys(boardFeatures),
    "first_start_manhattan_mean",
    "first_start_static_fallback",
    "sequential_manhattan_sum",
    "sequential_static_fallback",
    "final_manhattan",
    "final_static_fallback",
    "static_topology_missing",
    "board_depth_mean",
    "represented_board_count",
    "shallow_checkpoint_count"
  ];
  return requiredProductionFeatures.every((key) => Number.isFinite(features[key]))
    ? features
    : null;
}

function getConstructionGuidanceOutcomeInterval(model, predictedValue, treatment = null) {
  const spread = model?.evidence?.outOfFoldResidualSpread ?? {};
  const rmse = Number(model?.evidence?.heldOutRmse);
  let lowerOffset = Number(spread.signedP05);
  let upperOffset = Number(spread.signedP95);
  if (!Number.isFinite(lowerOffset)) lowerOffset = Number.isFinite(rmse) ? -2 * rmse : 0;
  if (!Number.isFinite(upperOffset)) upperOffset = Number.isFinite(rmse) ? 2 * rmse : 0;

  if (treatment) {
    const directLowerOffset = treatment.lowerOffset == null
      ? Number.NaN
      : Number(treatment.lowerOffset);
    const directUpperOffset = treatment.upperOffset == null
      ? Number.NaN
      : Number(treatment.upperOffset);
    if (Number.isFinite(directLowerOffset)) {
      lowerOffset += directLowerOffset;
    } else {
      const mean = Number(treatment.mean);
      const p10 = Number(treatment.p10);
      if (Number.isFinite(mean) && Number.isFinite(p10)) lowerOffset += p10 - mean;
    }
    if (Number.isFinite(directUpperOffset)) {
      upperOffset += directUpperOffset;
    } else {
      const mean = Number(treatment.mean);
      const p90 = Number(treatment.p90);
      if (Number.isFinite(mean) && Number.isFinite(p90)) upperOffset += p90 - mean;
    }
  }

  return {
    low: predictedValue + lowerOffset,
    high: predictedValue + upperOffset,
    lowerOffset,
    upperOffset
  };
}

function getConstructionGuidanceDynamicArchivingTreatment(
  calibration,
  outcome,
  preferences = {},
  stage = null,
  features = null
) {
  if (!isDynamicArchivingActive(preferences)) return null;
  const treatment = calibration?.treatments?.dynamicArchiving;
  if (!treatment) return null;

  if (
    outcome === "length" &&
    treatment.contextualModelEnabled === true &&
    stage === treatment.lengthContextStage &&
    stage === "checkpointsKnown" &&
    treatment.lengthContextModel &&
    features
  ) {
    const evaluated = evaluateConstructionGuidanceModel(treatment.lengthContextModel, features);
    if (evaluated) {
      const spread = treatment.lengthContextModel?.evidence?.outOfFoldResidualSpread ?? {};
      const rmse = Number(treatment.lengthContextModel?.evidence?.heldOutRmse);
      let lowerOffset = Number(spread.signedP05);
      let upperOffset = Number(spread.signedP95);
      if (!Number.isFinite(lowerOffset)) lowerOffset = Number.isFinite(rmse) ? -2 * rmse : 0;
      if (!Number.isFinite(upperOffset)) upperOffset = Number.isFinite(rmse) ? 2 * rmse : 0;
      return {
        kind: "dynamic-archiving-contextual",
        mean: evaluated.value,
        p10: null,
        p90: null,
        lowerOffset,
        upperOffset
      };
    }
  }

  const prefix = outcome === "length" ? "length" : "difficulty";
  const mean = Number(treatment[`${prefix}EffectMean`]);
  const p10 = Number(treatment[`${prefix}EffectP10`]);
  const p90 = Number(treatment[`${prefix}EffectP90`]);
  return {
    kind: "dynamic-archiving-constant",
    mean: Number.isFinite(mean) ? mean : 0,
    p10: Number.isFinite(p10) ? p10 : null,
    p90: Number.isFinite(p90) ? p90 : null,
    lowerOffset: null,
    upperOffset: null
  };
}

function isConstructionGuidanceStructuralSuccessApplicable(preferences = {}, overlayPlacements = [], pieceMap = {}) {
  const structuralOverlayCount = (overlayPlacements ?? []).filter((placement) => (
    !isMiniOverlayPiece(pieceMap[placement.pieceId])
  )).length;
  return !Boolean(
    structuralOverlayCount ||
    isDynamicArchivingActive(preferences) ||
    preferences.competitiveMode ||
    preferences.payToWin ||
    preferences.subsidizedStarts ||
    preferences.virtualBots ||
    preferences.noDocks ||
    preferences.extraDocks ||
    preferences.sandwichedDock ||
    preferences.staggeredBoards ||
    preferences.movingTargets
  );
}

function predictConstructionGuidanceStage(
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
  const models = calibration?.normalLandscape?.[stage];
  if (!models) return null;

  const resolvedBoardCount = Number.isFinite(Number(boardCount))
    ? Number(boardCount)
    : boardPlacements.length;
  const resolvedFlagCount = Number.isFinite(Number(flagCount))
    ? Number(flagCount)
    : checkpoints.length;
  const baseFeatures = getConstructionGuidanceBaseFeatures(
    calibration,
    preferences,
    pieceMap,
    resolvedBoardCount,
    resolvedFlagCount
  );
  if (!baseFeatures) return null;

  let numericFeatures = {};
  if (stage === "boardsKnown" || stage === "checkpointsKnown") {
    numericFeatures = getConstructionGuidanceBoardFeatures(boardPlacements, pieceMap);
    if (!numericFeatures) return null;
  }
  if (stage === "checkpointsKnown") {
    numericFeatures = getConstructionGuidanceCheckpointFeatures({
      boardPlacements,
      dockPlacements,
      overlayPlacements,
      checkpoints,
      starts,
      tileMap,
      pieceMap,
      preferences
    });
    if (!numericFeatures) return null;
  }
  const features = { ...baseFeatures, ...numericFeatures };

  const makeOutcome = (outcome) => {
    const model = models[outcome];
    const evaluated = evaluateConstructionGuidanceModel(model, features);
    if (!evaluated) return null;
    let predictedValue = evaluated.value;
    let treatment = null;
    if (outcome === "length" || outcome === "difficulty") {
      treatment = getConstructionGuidanceDynamicArchivingTreatment(
        calibration,
        outcome,
        preferences,
        stage,
        features
      );
      if (treatment) predictedValue += Number(treatment.mean) || 0;
    }
    if (outcome === "length") {
      predictedValue += computeActFastLengthLoad(preferences, Number(preferences.playerCount) || 4);
    }
    return {
      raw: Number(predictedValue.toFixed(2)),
      modelRaw: Number(evaluated.value.toFixed(2)),
      linearPredictor: evaluated.linearPredictor,
      rmse: Number.isFinite(Number(model.evidence?.heldOutRmse))
        ? Number(model.evidence.heldOutRmse)
        : null,
      rSquared: Number.isFinite(Number(model.evidence?.heldOutRSquared))
        ? Number(model.evidence.heldOutRSquared)
        : null,
      sampleSize: Number.isFinite(Number(model.evidence?.sampleSize))
        ? Number(model.evidence.sampleSize)
        : null,
      interval: getConstructionGuidanceOutcomeInterval(model, predictedValue, treatment),
      treatment: treatment ? {
        kind: treatment.kind,
        mean: treatment.mean,
        p10: treatment.p10,
        p90: treatment.p90,
        lowerOffset: treatment.lowerOffset,
        upperOffset: treatment.upperOffset
      } : null
    };
  };

  const length = makeOutcome("length");
  const difficulty = makeOutcome("difficulty");
  const routeEvaluation = evaluateConstructionGuidanceModel(models.routeCost, features);
  if (!length || !difficulty || !routeEvaluation) return null;

  let predictedRouteExpansions = Math.max(0, routeEvaluation.value);
  let overlayWorkMultiplier = 1;
  let overlayWorkMode = "none";
  let overlayWorkLogAdjustment = 0;
  let overlayWorkContextP95LogResidual = 0;
  const structuralOverlayCount = (overlayPlacements ?? []).filter((placement) => (
    !isMiniOverlayPiece(pieceMap[placement.pieceId])
  )).length;
  if (structuralOverlayCount > 0) {
    const workPrior = calibration?.treatments?.structuralBoardOverlay?.analysisWorkPrior;
    let contextualApplied = false;
    if (
      workPrior?.contextualModelEnabled === true &&
      stage === workPrior.contextualStage &&
      stage === "checkpointsKnown" &&
      workPrior.logRatioContextModel
    ) {
      const contextual = evaluateConstructionGuidanceModel(
        workPrior.logRatioContextModel,
        { ...features, overlay_board_count: structuralOverlayCount }
      );
      if (contextual && Number.isFinite(contextual.value)) {
        overlayWorkLogAdjustment = contextual.value;
        overlayWorkMultiplier = Math.exp(overlayWorkLogAdjustment);
        predictedRouteExpansions = Math.max(
          0,
          Math.expm1(Math.log1p(predictedRouteExpansions) + overlayWorkLogAdjustment)
        );
        const contextualP95 = Number(
          workPrior.logRatioContextModel?.evidence?.outOfFoldResidualSpread?.signedP95
        );
        overlayWorkContextP95LogResidual = Number.isFinite(contextualP95) ? contextualP95 : 0;
        overlayWorkMode = "contextual";
        contextualApplied = true;
      }
    }

    if (!contextualApplied) {
      const ratio = Number(workPrior?.medianExpansionRatio);
      if (
        Number.isFinite(ratio) && ratio > 0 &&
        !workPrior?.overlayCountSpecificEnabled &&
        !workPrior?.pieceIdentityEnabled
      ) {
        overlayWorkMultiplier = ratio;
        predictedRouteExpansions *= ratio;
        overlayWorkMode = "constant";
      }
    }
  }

  let structuralSuccessProbability = null;
  if (
    stage === "countsKnown" &&
    calibration.structuralSuccessPrior &&
    isConstructionGuidanceStructuralSuccessApplicable(preferences, overlayPlacements, pieceMap)
  ) {
    const structural = evaluateConstructionGuidanceModel(
      calibration.structuralSuccessPrior,
      features
    );
    if (structural) structuralSuccessProbability = structural.value;
  }

  const routeResidualSpread = models.routeCost.evidence?.outOfFoldResidualSpread ?? null;
  const routeSignedP95Log = Number(routeResidualSpread?.signedP95);
  const routeP95Expansions = Number.isFinite(routeSignedP95Log)
    ? (
      overlayWorkMode === "contextual"
        ? Math.max(
          0,
          Math.expm1(
            routeEvaluation.linearPredictor +
            routeSignedP95Log +
            overlayWorkLogAdjustment +
            overlayWorkContextP95LogResidual
          )
        )
        : Math.max(0, Math.expm1(routeEvaluation.linearPredictor + routeSignedP95Log)) * overlayWorkMultiplier
    )
    : null;

  return {
    stage,
    inventoryPreset: baseFeatures.inventory_factor,
    boardCount: resolvedBoardCount,
    flagCount: resolvedFlagCount,
    length,
    difficulty,
    routeCost: {
      predictedExpansions: Math.round(predictedRouteExpansions),
      modelPredictedExpansions: Math.round(Math.max(0, routeEvaluation.value)),
      log1pPrediction: routeEvaluation.linearPredictor,
      rmseLog: Number.isFinite(Number(models.routeCost.evidence?.heldOutRmse))
        ? Number(models.routeCost.evidence.heldOutRmse)
        : null,
      signedP95LogResidual: Number.isFinite(routeSignedP95Log) ? routeSignedP95Log : null,
      p95Expansions: Number.isFinite(routeP95Expansions) ? Math.round(routeP95Expansions) : null,
      rSquared: Number.isFinite(Number(models.routeCost.evidence?.heldOutRSquared))
        ? Number(models.routeCost.evidence.heldOutRSquared)
        : null,
      sampleSize: Number.isFinite(Number(models.routeCost.evidence?.sampleSize))
        ? Number(models.routeCost.evidence.sampleSize)
        : null,
      structuralOverlayWorkMultiplier: overlayWorkMultiplier,
      structuralOverlayWorkMode: overlayWorkMode,
      structuralOverlayWorkLogAdjustment: overlayWorkMode === "contextual"
        ? overlayWorkLogAdjustment
        : null
    },
    structuralSuccessProbability: Number.isFinite(structuralSuccessProbability)
      ? Number(structuralSuccessProbability.toFixed(4))
      : null,
    features
  };
}

function getConstructionGuidanceBandScore(outcomePrediction, preference, thresholds) {
  if (preference === "any") return 1;
  if (!outcomePrediction || !thresholds?.[preference]) return 0;
  const distance = bandDistance(outcomePrediction.raw, preference, thresholds);
  const rmse = Number(outcomePrediction.rmse);
  if (!Number.isFinite(distance) || !(rmse > 0)) return 0;
  const z = distance / rmse;
  return Math.exp(-0.5 * z * z);
}

function getMedianFinite(values = []) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getConstructionGuidancePredictionSignals(prediction, preferences = {}) {
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

  const lengthDesirability = getConstructionGuidanceBandScore(
    prediction.length,
    preferences.length,
    getLengthThresholds()
  );
  const difficultyDesirability = getConstructionGuidanceBandScore(
    prediction.difficulty,
    preferences.difficulty,
    getDifficultyThresholds()
  );
  const targetDesirability = Math.max(
    1e-6,
    lengthDesirability * difficultyDesirability
  );
  const structuralSuccessModifier = Number.isFinite(prediction.structuralSuccessProbability)
    ? 0.55 + prediction.structuralSuccessProbability * 0.45
    : 1;

  return {
    targetDesirability,
    lengthDesirability,
    difficultyDesirability,
    structuralSuccessModifier,
    predictedRouteExpansions: Number.isFinite(Number(prediction.routeCost?.predictedExpansions))
      ? Number(prediction.routeCost.predictedExpansions)
      : null,
    p95RouteExpansions: Number.isFinite(Number(prediction.routeCost?.p95Expansions))
      ? Number(prediction.routeCost.p95Expansions)
      : null,
    routeSignedP95LogResidual: Number.isFinite(Number(prediction.routeCost?.signedP95LogResidual))
      ? Number(prediction.routeCost.signedP95LogResidual)
      : null
  };
}

function applyConstructionGuidanceRanking(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return [];
  const policy = getConstructionGuidanceModePolicy(preferences);
  const predictionKey = options.predictionKey ?? "prediction";
  const routeReference = getMedianFinite(candidates.map((candidate) => (
    getConstructionGuidancePredictionSignals(candidate[predictionKey], preferences).predictedRouteExpansions
  )));

  const scored = candidates.map((candidate) => {
    const prediction = candidate[predictionKey];
    const signals = getConstructionGuidancePredictionSignals(
      prediction,
      preferences
    );
    const stagePolicy = CONSTRUCTION_GUIDANCE_STAGE_POLICIES[prediction?.stage] ??
      CONSTRUCTION_GUIDANCE_STAGE_POLICIES.checkpointsKnown;
    const rankingTargetDesirability = Number.isFinite(Number(candidate.rankingTargetDesirability))
      ? Number(candidate.rankingTargetDesirability)
      : signals.targetDesirability;

    // Blend weak early target evidence toward neutral rather than letting a tiny
    // band-fit score dominate flag/board counts. Counts-known can additionally
    // supply a flag-marginalized target score, so the target may influence board
    // scale without turning flag count itself into a Short/Long control knob.
    const targetBase = (
      1 - stagePolicy.targetBlend +
      stagePolicy.targetBlend * Math.max(1e-6, rankingTargetDesirability)
    );
    const targetComponent = Math.pow(
      Math.max(1e-6, targetBase),
      policy.calibrationStrength
    );
    const effectiveRouteWorkPressure = (
      policy.routeWorkPressure * stagePolicy.routeWorkMultiplier
    );
    let workComponent = 1;
    let tailRiskComponent = 1;
    const effectiveTailRiskPressure = (
      (policy.routeWorkTailRiskPressure ?? 0) *
      (stagePolicy.routeWorkTailRiskMultiplier ?? 0)
    );
    if (
      effectiveRouteWorkPressure > 0 &&
      Number.isFinite(routeReference) &&
      routeReference > 0 &&
      Number.isFinite(signals.predictedRouteExpansions) &&
      signals.predictedRouteExpansions > 0
    ) {
      // Relative work keeps the same production policy meaningful across board
      // sizes and machines. Counts-known deliberately cares more about this than
      // target fit; later stages know enough geometry to trade work against target
      // character more intelligently. Expensive proposals are only de-prioritized.
      const relative = clamp(
        routeReference / signals.predictedRouteExpansions,
        0.25,
        4
      );
      workComponent = Math.pow(relative, effectiveRouteWorkPressure);
    }
    if (
      effectiveTailRiskPressure > 0 &&
      Number.isFinite(routeReference) &&
      routeReference > 0 &&
      Number.isFinite(signals.p95RouteExpansions) &&
      signals.p95RouteExpansions > routeReference
    ) {
      // The v7 work models include held-out signed P95 residuals on log1p work.
      // Use that evidence only as a convex ranking penalty for candidates whose
      // plausible overrun tail is large relative to the current proposal pool.
      // This never rejects a candidate: the random floor and later-attempt
      // flattening preserve the expensive tail as fallback.
      const tailRelative = clamp(
        signals.p95RouteExpansions / routeReference,
        1,
        24
      );
      tailRiskComponent = Math.pow(1 / tailRelative, effectiveTailRiskPressure);
    }
    const calibratedScore = (
      targetComponent *
      signals.structuralSuccessModifier *
      workComponent *
      tailRiskComponent
    );
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

  const maxScore = Math.max(
    ...scored.map((candidate) => Number(candidate.calibrationSignals?.calibratedScore) || 0),
    1e-9
  );
  return scored.map((candidate) => {
    const normalized = clamp(
      (Number(candidate.calibrationSignals?.calibratedScore) || 0) / maxScore,
      0,
      1
    );
    // explorationFloor is the literal randomizer tail: even the weakest
    // calibrated proposal keeps non-zero sampling weight.
    const weight = policy.explorationFloor +
      (1 - policy.explorationFloor) * normalized;
    return {
      ...candidate,
      weight: Math.max(1e-6, weight)
    };
  });
}

function sampleConstructionGuidanceRankedCandidate(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return null;
  const ranked = applyConstructionGuidanceRanking(candidates, preferences, options);
  return sampleManyWeighted(ranked, 1)[0] ?? sample(ranked);
}

function getConstructionGuidanceIntervalMismatch(outcomePrediction, preference, thresholds, metric) {
  if (preference === "any" || !outcomePrediction || !thresholds?.[preference]) return null;
  const [low, high] = thresholds[preference];
  const predictedLow = Number(outcomePrediction.interval?.low);
  const predictedHigh = Number(outcomePrediction.interval?.high);
  if (!Number.isFinite(predictedLow) || !Number.isFinite(predictedHigh)) return null;

  if (Number.isFinite(low) && predictedHigh < low) {
    return {
      metric,
      direction: "low",
      requested: preference,
      predicted: outcomePrediction.raw,
      predictedLow,
      predictedHigh,
      boundary: low
    };
  }
  if (Number.isFinite(high) && predictedLow >= high) {
    return {
      metric,
      direction: "high",
      requested: preference,
      predicted: outcomePrediction.raw,
      predictedLow,
      predictedHigh,
      boundary: high
    };
  }
  return null;
}

function hasConstructionGuidanceTargetGateIncompatibleVariant(preferences = {}, overlayPlacements = []) {
  // Neither the Normal target models nor the paired structural-board treatment
  // establish safe hard-gate behavior for arbitrary overlay tiles. Keep all
  // overlays on the soft-guidance path; structural board overlays still receive
  // their measured route-work multiplier below.
  const hasAnyOverlay = Boolean((overlayPlacements ?? []).length);
  return Boolean(
    hasAnyOverlay ||
    preferences.actFastMode ||
    preferences.competitiveMode ||
    preferences.payToWin ||
    preferences.subsidizedStarts ||
    preferences.virtualBots ||
    preferences.lighterGame ||
    preferences.lessSpammyGame ||
    preferences.criticalSpam ||
    preferences.criticalHaywire ||
    preferences.lessForeshadowing ||
    preferences.classicSharedDeck ||
    preferences.movingTargets ||
    preferences.cuttingFloor ||
    preferences.flamingOil ||
    preferences.repulsorOverdrive ||
    preferences.setToKill ||
    preferences.setToStun ||
    preferences.lessDeadlyGame ||
    preferences.moreDeadlyGame ||
    preferences.homeReboot ||
    preferences.hazardousFlags ||
    preferences.repairStations ||
    preferences.factoryRejects ||
    preferences.upgradeWorld ||
    preferences.startupSpinUp ||
    preferences.extraDocks ||
    preferences.noDocks ||
    preferences.sandwichedDock ||
    preferences.staggeredBoards
  );
}

function getConstructionGuidanceGrossMismatch(
  prediction,
  preferences = {},
  overlayPlacements = []
) {
  if (
    !prediction ||
    hasConstructionGuidanceTargetGateIncompatibleVariant(preferences, overlayPlacements)
  ) {
    return { abort: false, mismatches: [] };
  }
  // Routed raw length adds uncertainty-weighted late-register
  // time. The current calibration length models were fit to the pre-uncertainty
  // metric, so they may still rank proposals but must not hard-abort a checkpoint
  // proposal on length until calibration is regenerated for the new target.
  const mismatches = [
    getConstructionGuidanceIntervalMismatch(
      prediction.difficulty,
      preferences.targetGuidanceOnlyDifficulty ? "any" : preferences.difficulty,
      getDifficultyThresholds(),
      "difficulty"
    )
  ].filter(Boolean);
  return {
    abort: mismatches.length > 0,
    mismatches
  };
}

function getCalibratedConstructionPlan(
  maxBoards,
  hasLargeBoards,
  preferences = {},
  pieceMap = {},
  calibration = null
) {
  const explicitBoardCount = Number(preferences.calibrationBoardCount);
  const explicitFlagCount = Number(preferences.calibrationFlagCount);
  if (
    !calibration ||
    !calibration.normalLandscape?.countsKnown ||
    (Number.isInteger(explicitBoardCount) && explicitBoardCount > 0) ||
    (Number.isInteger(explicitFlagCount) && explicitFlagCount > 0)
  ) {
    return null;
  }

  const supportedBoardCounts = (calibration.domain.requestedBoardCounts ?? [])
    .filter((count) => Number.isInteger(count) && count >= 1 && count <= maxBoards)
    .sort((left, right) => left - right);
  const supportedFlagCounts = (calibration.domain.requestedFlagCounts ?? [])
    .filter((count) => Number.isInteger(count) && count >= 1)
    .sort((left, right) => left - right);
  if (!supportedBoardCounts.length || !supportedFlagCounts.length) return null;

  const maxSupportedBoardCount = Math.max(...supportedBoardCounts);
  // The calibrated count domain ends at four boards. Do not silently extrapolate
  // the categorical model to five/six-board small-board layouts.
  if (!hasLargeBoards && maxBoards > maxSupportedBoardCount) {
    return null;
  }

  const minimumBoardCount = Math.max(
    hasLargeBoards ? 1 : getMinimumSmallOnlyBoardCount(),
    preferences.sandwichedDock ? 2 : 1
  );
  const boardCounts = supportedBoardCounts.filter((count) => count >= minimumBoardCount);
  if (!boardCounts.length) return null;

  const candidates = [];

  for (const boardCount of boardCounts) {
    for (const flagCount of supportedFlagCounts) {
      const prediction = predictConstructionGuidanceStage(
        calibration,
        "countsKnown",
        {
          preferences,
          pieceMap,
          boardCount,
          flagCount
        }
      );
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

  // The counts calibration is observational: more flags naturally correlated
  // with longer courses in the sampled proposal distribution. Do not convert
  // that correlation into a production instruction to add flags for Long/Hard.
  // Marginalize target desirability over all supported flag counts for each board
  // count. Early target guidance may still steer the overall board scale, while
  // flag count itself is chosen mainly by predicted work, structural plausibility
  // and the mode's explicit random tail. Actual geometry gets stronger target
  // authority at boardsKnown/checkpointsKnown.
  const targetByBoardCount = new Map();
  for (const boardCount of boardCounts) {
    const group = candidates.filter((candidate) => candidate.boardCount === boardCount);
    if (!group.length) continue;
    targetByBoardCount.set(
      boardCount,
      group.reduce((sum, candidate) => sum + candidate.targetDesirability, 0) / group.length
    );
  }
  const rankedCandidates = candidates.map((candidate) => ({
    ...candidate,
    rankingTargetDesirability: targetByBoardCount.get(candidate.boardCount) ?? candidate.targetDesirability
  }));

  const selected = sampleConstructionGuidanceRankedCandidate(
    rankedCandidates,
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


// Neutral fallbacks are deliberately target-agnostic. Missing calibration may
// reduce efficiency, but it must not silently revive the old hand-written
// Short/Long/Easy/Hard construction policy.
function neutralFlagCount(maxFlags) {
  const candidates = [];
  for (let count = 2; count <= Math.min(6, maxFlags); count += 1) {
    candidates.push(count);
  }
  return sample(candidates.length ? candidates : [Math.max(1, Math.min(2, maxFlags))]);
}

function getMinimumSmallOnlyBoardCount() {
  // Small-board viability is enforced by layout/dock/start checks. Requested
  // length/difficulty are not structural minimum-board rules.
  return 1;
}

function neutralBoardCount(maxBoards) {
  const candidates = [];
  for (let count = 1; count <= maxBoards; count += 1) {
    candidates.push(count);
  }
  return sample(candidates.length ? candidates : [1]);
}

function getAvailableMainBoardIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "base" || piece.kind === "small")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function getAvailableDockIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "dock")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function getRequiredDockStartCount(preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;
  const competitiveModeEnabled = typeof preferences.competitiveMode === "boolean"
    ? preferences.competitiveMode
    : getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  return competitiveModeEnabled ? playerCount * 2 : playerCount;
}

function getMaximumDockCount(preferences = {}, availableDockCount = 1) {
  const mode = getExtraDockModeState(preferences);
  const desired = mode === "off" ? 1 : MAX_DOCK_COUNT;
  return Math.max(1, Math.min(desired, availableDockCount));
}

function getDockStartCapacity(dockIds, pieceMap) {
  return dockIds.reduce((sum, dockId) => sum + (pieceMap[dockId]?.starts?.length ?? 0), 0);
}

function getDockFaceGroups(dockIds, pieceMap) {
  const groups = new Map();

  dockIds.forEach((dockId) => {
    const physicalDockId = pieceMap[dockId]?.physicalBoardId ?? dockId;
    if (!groups.has(physicalDockId)) {
      groups.set(physicalDockId, []);
    }
    groups.get(physicalDockId).push(dockId);
  });

  return [...groups.values()];
}

function variantIsAvailable(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  return !getVariantUnavailabilityReason(variantId, preferences, pieceMap);
}

function getVariantCourseUnavailabilityReason(variantId, tileMap) {
  const availabilityRule = getVariantAvailabilityRule(variantId);
  if (!availabilityRule) {
    return null;
  }

  if (availabilityRule.type === "featureTypeAvailable") {
    return countFeatureTypeInTileMap(tileMap, availabilityRule.featureType) > 0
      ? null
      : `No ${availabilityRule.featureType} features on this course.`;
  }

  if (availabilityRule.type === "featureTypesAnyAvailable") {
    return (availabilityRule.featureTypes || []).some((featureType) => (
      countFeatureTypeInTileMap(tileMap, featureType) > 0
    ))
      ? null
      : `None of ${availabilityRule.featureTypes.join(", ")} are on this course.`;
  }

  return null;
}

function applyCourseVariantAvailability(variantBundle, tileMap, preferences = {}) {
  const nextBundle = { ...variantBundle };
  const blockedForced = [];

  for (const variant of VARIANT_DEFINITIONS) {
    if (!nextBundle[variant.id]) {
      continue;
    }

    const unavailableReason = getVariantCourseUnavailabilityReason(variant.id, tileMap);
    if (!unavailableReason) {
      continue;
    }

    if (isVariantForced(preferences, variant.id)) {
      blockedForced.push({ id: variant.id, reason: unavailableReason });
      continue;
    }

    nextBundle[variant.id] = false;
  }

  return {
    variantBundle: nextBundle,
    blockedForced
  };
}

function getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences = {}) {
  const dockFaceGroups = getDockFaceGroups(dockIds, pieceMap);
  const maxDockCount = getMaximumDockCount(preferences, dockFaceGroups.length);
  return dockFaceGroups
    .map((group) => Math.max(...group.map((dockId) => pieceMap[dockId]?.starts?.length ?? 0)))
    .sort((left, right) => right - left)
    .slice(0, maxDockCount)
    .reduce((sum, startCount) => sum + startCount, 0);
}

function updatePlayerCountAvailability(preferences = getPreferencesFromControls()) {
  const select = document.getElementById("player-count");
  if (!select || !cachedAssets?.pieceMap) {
    return;
  }

  const competitiveModeEnabled = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const expansionIds = getSelectedExpansionIds(preferences);
  const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds);
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessOptionPermitted = noDocksState !== "off";

  Array.from(select.options).forEach((option) => {
    const playerCount = Number(option.value);
    option.disabled = false;
    option.title = "";

    if (!competitiveModeEnabled) {
      return;
    }

    const requiredStarts = playerCount * 2;
    const capacityPreferences = { ...preferences, playerCount, competitiveMode: true };
    const dockCapacity = getMaximumAvailableDockStartCapacity(
      dockIds,
      cachedAssets.pieceMap,
      capacityPreferences
    );
    const supportedByDocks = dockCapacity >= requiredStarts;
    if (!supportedByDocks && !docklessOptionPermitted) {
      option.disabled = true;
      option.title = `Competitive Mode with ${playerCount} players needs ${requiredStarts} starting spaces; current dock settings provide at most ${dockCapacity}. Allow a compatible starting-layout option with enough capacity, reduce the player count, or select sets with more dock capacity.`;
    } else if (!supportedByDocks && docklessOptionPermitted) {
      option.title = `Competitive Mode needs ${requiredStarts} starts. The selected docks provide ${dockCapacity}, so this player count requires a single No Docks edge with at least ${requiredStarts} legal starting spaces.`;
    } else {
      option.title = `Competitive Mode needs ${requiredStarts} starts; the current dock settings can provide ${dockCapacity}.`;
    }
  });

  const selectedOption = select.selectedOptions?.[0];
  select.title = competitiveModeEnabled
    ? (selectedOption?.title || `Competitive Mode needs twice as many starting spaces as players.`)
    : "";
}

function updateVariantAvailability() {
  let preferences = getPreferencesFromControls();

  const competitiveModeForced = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const extraDocksState = getVariantPreferenceState(preferences, "extraDocks");
  if (competitiveModeForced && noDocksState === "off" && extraDocksState === "off" && cachedAssets?.pieceMap) {
    const expansionIds = getSelectedExpansionIds(preferences);
    const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds);
    const requiredStarts = getRequiredDockStartCount({ ...preferences, competitiveMode: true });
    const currentCapacity = getMaximumAvailableDockStartCapacity(dockIds, cachedAssets.pieceMap, preferences);
    const relaxedPreferences = {
      ...preferences,
      allowedVariantRules: {
        ...(preferences.allowedVariantRules ?? {}),
        extraDocks: "allowed"
      }
    };
    const relaxedCapacity = getMaximumAvailableDockStartCapacity(
      dockIds,
      cachedAssets.pieceMap,
      relaxedPreferences
    );
    if (currentCapacity < requiredStarts && relaxedCapacity >= requiredStarts) {
      setVariantControlState("extraDocks", "allowed");
      showToast(
        `Extra Docks was set to Yes because Competitive Mode with ${preferences.playerCount} players needs ${requiredStarts} starting spaces.`
      );
      preferences = getPreferencesFromControls();
    }
  }

  VARIANT_DEFINITIONS.forEach((variant) => {
    const buttons = Array.from(document.querySelectorAll(`[data-variant-id="${variant.id}"]`));
    if (!buttons.length) {
      return;
    }

    const available = variantIsAvailable(variant.id, preferences);
    const primaryButton = document.getElementById(variant.controlId) ?? buttons[0];
    const previousState = normalizeVariantState(primaryButton.dataset.state ?? variant.defaultState);

    if (!available) {
      const reason = getVariantUnavailabilityReason(variant.id, preferences)
        ?? `${variant.label} is unavailable with the current setup.`;
      const fallbackState = previousState === "forced" || previousState === "allowed" ? "allowed" : "off";
      setVariantControlState(variant.id, fallbackState);
      buttons.forEach((button) => {
        button.disabled = false;
        button.dataset.unavailableReason = reason;
        button.classList.add("unavailable");
        button.setAttribute("aria-disabled", "true");
        button.title = reason;
        button.setAttribute("aria-label", `${variant.label}: unavailable. ${reason}`);
      });
      if (previousState === "forced") {
        showToast(
          `${variant.label} was relaxed to Yes. ${reason}`
        );
      }
    } else {
      buttons.forEach((button) => {
        button.disabled = false;
        delete button.dataset.unavailableReason;
        button.classList.remove("unavailable");
        button.removeAttribute("aria-disabled");
        if (variant.id === "actFast") {
          const choiceDef = ACT_FAST_CONTROL_CHOICES.find((entry) => entry.id === getActFastControlChoice(button)) ?? ACT_FAST_CONTROL_CHOICES[0];
          button.title = choiceDef.label;
          button.setAttribute("aria-label", `Act Fast: ${choiceDef.label}`);
        } else {
          button.title = getVariantStateCopy(variant.id, button.dataset.state ?? variant.defaultState).label;
          button.setAttribute("aria-label", `${variant.label}: ${button.title}`);
        }
      });
    }
  });

  preferences = getPreferencesFromControls();
  updatePlayerCountAvailability(preferences);
  updateOverlayAvailability(preferences);
  updateVariantSummary();
}

function canSupportRequiredDockStarts(dockIds, pieceMap, preferences = {}) {
  return getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences) >= getRequiredDockStartCount(preferences);
}

function getEligibleDockIds(pieceMap, expansionIds = null) {
  return getAvailableDockIds(pieceMap, expansionIds)
    .filter((dockId) => (pieceMap[dockId]?.starts?.length ?? 0) > 0);
}

function getDockSelectionWeight(piece, preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;
  const startCount = piece?.starts?.length ?? 0;

  if (startCount <= 0) {
    return 0;
  }

  if (piece?.physicalBoardId === "master-builder-docking-bay") {
    if (playerCount >= 6) {
      return 0.3;
    }
    if (playerCount >= 5) {
      return 0.45;
    }
  }

  return 1 + Math.min(0.6, startCount * 0.04);
}

function weightedOrder(items, getWeight) {
  const remaining = [...items];
  const ordered = [];

  while (remaining.length) {
    const weights = remaining.map((item) => Math.max(0, Number(getWeight(item)) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (total <= 0) {
      ordered.push(...shuffle(remaining));
      break;
    }

    let pick = generationRandom() * total;
    let selectedIndex = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      pick -= weights[index];
      if (pick <= 0) {
        selectedIndex = index;
        break;
      }
    }

    ordered.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  return ordered;
}

function getDockConfigurations(availableDockIds, pieceMap, preferences = {}) {
  const extraDockMode = getExtraDockModeState(preferences);
  const allowExtraDock = extraDockMode !== "off";
  const requireExtraDock = extraDockMode === "forced";
  const dockFaceGroups = getDockFaceGroups(availableDockIds, pieceMap);
  const configs = [];

  dockFaceGroups.forEach((group) => {
    group.forEach((dockId) => {
      if ((pieceMap[dockId]?.starts?.length ?? 0) > 0) {
        configs.push([dockId]);
      }
    });
  });

  if (allowExtraDock) {
    for (let left = 0; left < dockFaceGroups.length; left += 1) {
      for (let right = left + 1; right < dockFaceGroups.length; right += 1) {
        for (const leftDockId of dockFaceGroups[left]) {
          for (const rightDockId of dockFaceGroups[right]) {
            const dockIds = [leftDockId, rightDockId];
            if (getDockStartCapacity(dockIds, pieceMap) > 0) {
              configs.push(dockIds);
            }
          }
        }
      }
    }
  }

  return configs
    .filter((dockIds) => (!requireExtraDock || dockIds.length > 1))
    .filter((dockIds) => dockIds.length <= getMaximumDockCount(preferences, dockFaceGroups.length))
    .filter((dockIds) => getDockStartCapacity(dockIds, pieceMap) >= getRequiredDockStartCount(preferences));
}

function getAvailableOverlayIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.overlayCapable)
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function getPhysicalBoardId(piece) {
  return piece.physicalBoardId ?? piece.id;
}

function countPhysicalBoards(boardIds, pieceMap) {
  return new Set(boardIds.map((boardId) => getPhysicalBoardId(pieceMap[boardId]))).size;
}

function boardIdsCanSupportDock(boardIds, pieceMap, dockPieceId) {
  const dockPiece = pieceMap[dockPieceId];
  if (!dockPiece) {
    return false;
  }

  const totalSpanCapacity = boardIds.reduce((sum, boardId) => {
    const piece = pieceMap[boardId];
    return sum + Math.max(piece?.width ?? 0, piece?.height ?? 0);
  }, 0);

  return totalSpanCapacity >= getDockFrontageLength(dockPiece);
}

function getDockTileKeys(dockPlacement, pieceMap) {
  const dockPiece = pieceMap[dockPlacement.pieceId];
  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const keys = new Set();

  for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      keys.add(`${x},${y}`);
    }
  }

  return keys;
}

function getDockTileKeySet(dockPlacements = [], pieceMap) {
  const keys = new Set();
  dockPlacements.forEach((dockPlacement) => {
    getDockTileKeys(dockPlacement, pieceMap).forEach((key) => keys.add(key));
  });
  return keys;
}

function rotateTileOffset(x, y, piece, rotation) {
  if (rotation === 90) {
    return { x: piece.height - 1 - y, y: x };
  }
  if (rotation === 180) {
    return { x: piece.width - 1 - x, y: piece.height - 1 - y };
  }
  if (rotation === 270) {
    return { x: y, y: piece.width - 1 - x };
  }
  return { x, y };
}

function getFullRectOffsets(piece, rotation = 0) {
  const dims = rotatedDimensions(piece, rotation);
  const offsets = [];

  for (let y = 0; y < dims.height; y += 1) {
    for (let x = 0; x < dims.width; x += 1) {
      offsets.push({ x, y });
    }
  }

  return offsets;
}

function getPlacementOccupiedOffsets(piece, rotation = 0, options = {}) {
  const useFullRect = Boolean(options.fullRect);

  if (useFullRect || !piece?.tiles?.length) {
    const dims = rotatedDimensions(piece, rotation);
    const offsets = [];

    for (let y = 0; y < dims.height; y += 1) {
      for (let x = 0; x < dims.width; x += 1) {
        offsets.push({ x, y });
      }
    }

    return offsets;
  }

  return piece.tiles.map((tile) => rotateTileOffset(tile.x, tile.y, piece, rotation));
}

function getPlacementOccupiedTiles(piece, placement) {
  const fullRect = Boolean(placement?.overlay && !isMiniOverlayPiece(piece));
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0, { fullRect }).map(({ x, y }) => (
    `${placement.x + x},${placement.y + y}`
  ));
}

function isMiniOverlayPiece(piece) {
  return piece?.kind === "overlay";
}

function isBlankCustomBoardPiece(piece) {
  return piece?.expansionId === "master-builder" &&
    piece?.kind === "small" &&
    (piece?.tiles?.length ?? 0) === 0;
}

function chooseWeightedCount(maxCount, weightForCount) {
  if (maxCount <= 0) {
    return 0;
  }

  const bag = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = Math.max(1, Math.round(weightForCount(count)));
    for (let copy = 0; copy < copies; copy += 1) {
      bag.push(count);
    }
  }

  return sample(bag);
}

function chooseBlankBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(maxCount, (count) => {
    if (count === 0) {
      return 2;
    }

    const ratio = count / Math.max(1, maxCount);
    if (ratio >= 0.3 && ratio <= 0.7) {
      return ratio >= 0.4 && ratio <= 0.6 ? 6 : 5;
    }
    if (ratio >= 0.2 && ratio <= 0.8) {
      return 3;
    }
    return 1;
  });
}

function chooseLargeBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(4, maxCount), (count) => {
    const weights = [4, 4, 3, 2, 1];
    return weights[count] ?? 1;
  });
}

function chooseSmallBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(1, maxCount), (count) => {
    const weights = [4, 1];
    return weights[count] ?? 1;
  });
}

function getPlacementSupportTiles(placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  const supportTiles = new Set();

  for (const { x, y } of getFullRectOffsets(piece, placement.rotation ?? 0)) {
    supportTiles.add(`${placement.x + x},${placement.y + y}`);
  }

  return supportTiles;
}

function getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles) {
  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return [];
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const placements = [];

  for (const rotation of ROTATIONS) {
    const dims = rotatedDimensions(overlayPiece, rotation);
    const occupiedOffsets = isMiniOverlayPiece(overlayPiece)
      ? getPlacementOccupiedOffsets(overlayPiece, rotation)
      : getFullRectOffsets(overlayPiece, rotation);

    for (let y = minY; y <= maxY - dims.height + 1; y += 1) {
      for (let x = minX; x <= maxX - dims.width + 1; x += 1) {
        const valid = occupiedOffsets.every(({ x: dx, y: dy }) => {
          const key = `${x + dx},${y + dy}`;
          return supportTiles.has(key) && !dockTiles.has(key);
        });

        if (valid) {
          placements.push({
            pieceId: overlayPiece.id,
            x,
            y,
            rotation,
            overlay: true
          });
        }
      }
    }
  }

  return placements;
}

function getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap) {
  const blankBoards = [];
  const otherBoards = [];

  for (const placement of [...boardOverlayPlacements, ...structuralPlacements]) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) {
      continue;
    }

    if (isBlankCustomBoardPiece(piece)) {
      blankBoards.push(placement);
      continue;
    }

    otherBoards.push(placement);
  }

  return { blankBoards, otherBoards };
}

function getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap) {
  const supportTiles = getPlacementSupportTiles(targetPlacement, pieceMap);
  if (targetPlacement.overlay) {
    return supportTiles;
  }

  for (const overlayPlacement of boardOverlayPlacements) {
    for (const key of getPlacementOccupiedTiles(pieceMap[overlayPlacement.pieceId], overlayPlacement)) {
      supportTiles.delete(key);
    }
  }

  return supportTiles;
}

function getOppositeSide(side) {
  return {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[side] ?? side;
}

function tileHasWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "wall" && (feature.sides || []).includes(side));
}

function tileHasRepulsorOnEdge(features = [], edge) {
  return features.some((feature) => feature.type === "repulsor" && (feature.sides || []).includes(edge));
}

function tileHasRedWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "redWall" && (feature.sides || []).includes(side));
}

function tileHasLedgeOnSide(features = [], side) {
  return features.some((feature) => feature.type === "ledge" && (feature.sides || []).includes(side));
}

function tileHasLaserSupportBlock(features = [], side, options = {}) {
  if (
    tileHasWallOnSide(features, side) ||
    tileHasRepulsorOnEdge(features, side) ||
    tileHasRedWallOnSide(features, side)
  ) {
    return true;
  }

  // A ledge only provides a physical laser-support wall from its LOWER tile.
  // The neighboring upper/platform tile does not have a wall face on that edge.
  // Green wall markers never provide support by themselves.
  return Boolean(options.includeLowerLedge && tileHasLedgeOnSide(features, side));
}

function tileHasLaserInDirection(features = [], dir) {
  return features.some((feature) => feature.type === "laser" && feature.dir === dir);
}

function getPlacedTileFeatureMap(piece, placement) {
  const placed = placePiece(piece, placement);
  return new Map(placed.tiles.map((tile) => [`${tile.x},${tile.y}`, tile.features || []]));
}

function getCombinedPlacedTileFeatureMap(placements, pieceMap) {
  const featureMap = new Map();

  placements.forEach((placement) => {
    const placed = placePiece(pieceMap[placement.pieceId], placement);
    placed.tiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      const existing = featureMap.get(key) || [];
      featureMap.set(key, [...existing, ...(tile.features || [])]);
    });
  });

  return featureMap;
}

function placementSuppresssTrackedHazard(placement, piece, currentTileMap) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const tile = currentTileMap.get(`${placement.x + x},${placement.y + y}`);
    return (tile?.features || []).some((feature) => (
      feature.type === "laser" || feature.type === "flamethrower"
    ));
  });
}

function laserTileHasValidContinuation(tile, laser, candidateFeatureMap, currentTileMap, supportTiles) {
  const sideChecks = [laser.dir, getOppositeSide(laser.dir)];

  return sideChecks.every((side) => {
    const currentFeatures = tile.features || [];
    if (tileHasLaserSupportBlock(currentFeatures, side, { includeLowerLedge: true })) {
      return true;
    }

    const delta = CARDINAL_DIRS[side];
    const neighborX = tile.x + delta.dx;
    const neighborY = tile.y + delta.dy;
    const neighborKey = `${neighborX},${neighborY}`;
    if (!supportTiles.has(neighborKey)) {
      return !currentTileMap.has(neighborKey);
    }

    const neighborFeatures = candidateFeatureMap.get(neighborKey) ?? currentTileMap.get(neighborKey)?.features ?? [];
    if (tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side), { includeLowerLedge: false })) {
      return true;
    }

    return tileHasLaserInDirection(neighborFeatures, laser.dir);
  });
}

function placementHasValidLaserSupport(placement, piece, currentTileMap, supportTiles, candidateFeatureMap = null) {
  const placed = placePiece(piece, placement);
  const effectiveFeatureMap = candidateFeatureMap ?? getPlacedTileFeatureMap(piece, placement);

  return placed.tiles.every((tile) => {
    const lasers = (tile.features || []).filter((feature) => feature.type === "laser");
    if (!lasers.length) {
      return true;
    }

    return lasers.every((laser) => laserTileHasValidContinuation(tile, laser, effectiveFeatureMap, currentTileMap, supportTiles));
  });
}

function rotateBundleOffset(offset, length, rotation) {
  if (rotation === 90) {
    return { x: 0, y: offset };
  }
  if (rotation === 180) {
    return { x: length - 1 - offset, y: 0 };
  }
  if (rotation === 270) {
    return { x: 0, y: length - 1 - offset };
  }
  return { x: offset, y: 0 };
}

function getAvailableLaserBundlePatterns(groupedMiniOverlayIds, maxTiles) {
  const patterns = [];

  LASER_BUNDLE_DEFINITIONS.forEach((definition) => {
    const hasStart = groupedMiniOverlayIds.has(definition.startPhysicalId);
    const hasMid = groupedMiniOverlayIds.has(definition.midPhysicalId);
    const hasEnd = groupedMiniOverlayIds.has(definition.endPhysicalId);

    if (hasStart && hasMid && hasEnd && maxTiles >= 3) {
      patterns.push({ ids: [definition.endId, definition.midId, definition.startId], weight: 5 });
    }
    if (hasStart && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.startId], weight: 3 });
    }
    if (hasStart && hasMid && maxTiles >= 2) {
      patterns.push({ ids: [definition.midId, definition.startId], weight: 2 });
    }
    if (hasMid && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.midId], weight: 2 });
    }
    if (hasMid && maxTiles >= 1) {
      patterns.push({ ids: [definition.midId], weight: 1 });
    }
  });

  return patterns;
}

function sampleWeightedLaserBundle(patterns) {
  const bag = [];
  patterns.forEach((pattern) => {
    for (let copy = 0; copy < pattern.weight; copy += 1) {
      bag.push(pattern);
    }
  });
  return bag.length ? sample(bag) : null;
}

function tryPlaceLaserBundleOnBoard(groupedMiniOverlayIds, pieceMap, supportTiles, dockTiles, occupiedMiniOverlayTiles, currentTileMap, remainingSlots) {
  const bundlePattern = sampleWeightedLaserBundle(getAvailableLaserBundlePatterns(groupedMiniOverlayIds, remainingSlots));
  if (!bundlePattern) {
    return null;
  }

  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return null;
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bundleLength = bundlePattern.ids.length;
  const candidateBundles = [];

  for (const rotation of ROTATIONS) {
    const width = rotation === 90 || rotation === 270 ? 1 : bundleLength;
    const height = rotation === 90 || rotation === 270 ? bundleLength : 1;

    for (let y = minY; y <= maxY - height + 1; y += 1) {
      for (let x = minX; x <= maxX - width + 1; x += 1) {
        const placements = bundlePattern.ids.map((pieceId, index) => {
          const offset = rotateBundleOffset(index, bundleLength, rotation);
          return {
            pieceId,
            x: x + offset.x,
            y: y + offset.y,
            rotation,
            overlay: true
          };
        });

        const occupiedKeys = placements.flatMap((placement) => getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement));
        if (!occupiedKeys.every((key) => supportTiles.has(key) && !dockTiles.has(key) && !occupiedMiniOverlayTiles.has(key))) {
          continue;
        }
        if (placements.some((placement) => placementSuppresssTrackedHazard(placement, pieceMap[placement.pieceId], currentTileMap))) {
          continue;
        }

        const candidateFeatureMap = getCombinedPlacedTileFeatureMap(placements, pieceMap);
        if (!placements.every((placement) => (
          placementHasValidLaserSupport(placement, pieceMap[placement.pieceId], currentTileMap, supportTiles, candidateFeatureMap)
        ))) {
          continue;
        }

        candidateBundles.push(placements);
      }
    }
  }

  if (!candidateBundles.length) {
    return null;
  }

  return sample(candidateBundles);
}

function placementTouchesSupportEdge(placement, piece, supportTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    return (
      !supportTiles.has(`${absoluteX},${absoluteY - 1}`) ||
      !supportTiles.has(`${absoluteX + 1},${absoluteY}`) ||
      !supportTiles.has(`${absoluteX},${absoluteY + 1}`) ||
      !supportTiles.has(`${absoluteX - 1},${absoluteY}`)
    );
  });
}

function placementTouchesOccupiedNeighbors(placement, piece, occupiedOverlayTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        if (occupiedOverlayTiles.has(`${absoluteX + dx},${absoluteY + dy}`)) {
          return true;
        }
      }
    }
    return false;
  });
}

function placeMiniOverlaysOnBoards(targetBoards, groupedMiniOverlayIds, pieceMap, dockPlacements, occupiedMiniOverlayTiles, countChooser, currentPlacements, boardOverlayPlacements) {
  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
  const placements = [];
  let currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;

  for (const targetPlacement of targetBoards) {
    const remainingGroups = [...groupedMiniOverlayIds.entries()];
    if (!remainingGroups.length) {
      break;
    }

    const targetCount = countChooser(remainingGroups.length, targetPlacement);
    if (targetCount <= 0) {
      continue;
    }

    const supportTiles = getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap);
    if (!supportTiles.size) {
      continue;
    }
    const targetPiece = pieceMap[targetPlacement.pieceId];
    const allowDensePacking = isBlankCustomBoardPiece(targetPiece);

    for (let placedCount = 0; placedCount < targetCount;) {
      let placed = false;
      const remainingSlots = targetCount - placedCount;
      const laserBundlePlacements = tryPlaceLaserBundleOnBoard(
        groupedMiniOverlayIds,
        pieceMap,
        supportTiles,
        dockTiles,
        occupiedMiniOverlayTiles,
        currentTileMap,
        remainingSlots
      );
      if (laserBundlePlacements?.length) {
        laserBundlePlacements.forEach((placement) => {
          getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement).forEach((key) => occupiedMiniOverlayTiles.add(key));
          placements.push(placement);
          currentPlacements.push(placement);
          groupedMiniOverlayIds.delete(getPhysicalBoardId(pieceMap[placement.pieceId]));
        });
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        placedCount += laserBundlePlacements.length;
        continue;
      }

      for (const [physicalBoardId, overlayIds] of shuffle([...groupedMiniOverlayIds.entries()])) {
        const chosenOverlayId = sample(overlayIds);
        const overlayPiece = pieceMap[chosenOverlayId];
        const legalPlacements = shuffle(
          getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles)
        ).filter((placement) => {
          if (!getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedMiniOverlayTiles.has(key))) {
            return false;
          }
          if (placementSuppresssTrackedHazard(placement, overlayPiece, currentTileMap)) {
            return false;
          }
          if (!placementHasValidLaserSupport(placement, overlayPiece, currentTileMap, supportTiles)) {
            return false;
          }
          return true;
        });

        if (!legalPlacements.length) {
          continue;
        }

        const preferredPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesSupportEdge(placement, overlayPiece, supportTiles) &&
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const fallbackPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const candidatePlacements = preferredPlacements.length
          ? preferredPlacements
          : (fallbackPlacements.length ? fallbackPlacements : legalPlacements);
        const chosenPlacement = candidatePlacements[0];
        getPlacementOccupiedTiles(overlayPiece, chosenPlacement).forEach((key) => occupiedMiniOverlayTiles.add(key));
        placements.push(chosenPlacement);
        currentPlacements.push(chosenPlacement);
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        groupedMiniOverlayIds.delete(physicalBoardId);
        placedCount += 1;
        placed = true;
        break;
      }

      if (!placed) {
        break;
      }
    }
  }

  return placements;
}

function getBoardOverlayCount(preferences, largeBoardCount, maxAvailable) {
  if (preferences.difficulty === "easy") {
    return 0;
  }

  const maxByDifficulty = preferences.difficulty === "moderate"
    ? Math.max(0, largeBoardCount - 1)
    : largeBoardCount;
  const maxCount = Math.min(maxAvailable, maxByDifficulty);
  if (maxCount <= 0) {
    return 0;
  }

  // Calibration can request an exact structural-overlay treatment, but it still
  // respects the production difficulty/count envelope above. Browser generation
  // never supplies this internal preference and therefore keeps the same random
  // overlay-count distribution.
  const calibrationBoardOverlayCount = preferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(preferences.calibrationBoardOverlayCount);
  if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount >= 0) {
    return Math.min(calibrationBoardOverlayCount, maxCount);
  }

  const choices = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = count === 0
      ? (preferences.difficulty === "moderate" ? 3 : 2)
      : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      choices.push(count);
    }
  }

  return sample(choices);
}

function getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  return getOverlayPlacementsForSupportTiles(
    overlayPiece,
    buildMainFootprintTiles(structuralPlacements, pieceMap),
    getDockTileKeySet(dockPlacements, pieceMap)
  );
}

function getAlignedEdgeOffsets(anchorStart, anchorLength, candidateLength) {
  if (anchorLength === candidateLength) {
    return [anchorStart];
  }

  if (candidateLength < anchorLength) {
    const slack = anchorLength - candidateLength;
    return [...new Set([
      anchorStart,
      anchorStart + Math.floor(slack / 2),
      anchorStart + slack
    ])];
  }

  const slack = candidateLength - anchorLength;
  return [...new Set([
    anchorStart - slack,
    anchorStart - Math.floor(slack / 2),
    anchorStart
  ])];
}

function createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const placements = [];

  if (side === "left" || side === "right") {
    const yOffsets = getAlignedEdgeOffsets(anchorPlacement.y, anchorDims.height, dims.height);
    const x = side === "left"
      ? anchorPlacement.x - dims.width
      : anchorPlacement.x + anchorDims.width;

    for (const y of yOffsets) {
      placements.push({ pieceId, x, y, rotation });
    }

    return placements;
  }

  const xOffsets = getAlignedEdgeOffsets(anchorPlacement.x, anchorDims.width, dims.width);
  const y = side === "top"
    ? anchorPlacement.y - dims.height
    : anchorPlacement.y + anchorDims.height;

  for (const x of xOffsets) {
    placements.push({ pieceId, x, y, rotation });
  }

  return placements;
}

function getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  if (overlayPiece.width !== 6 || overlayPiece.height !== 6) {
    return getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap);
  }

  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
  const placements = [];

  for (const basePlacement of structuralPlacements) {
    const basePiece = pieceMap[basePlacement.pieceId];
    const dims = rotatedDimensions(basePiece, basePlacement.rotation ?? 0);
    if (dims.width !== 12 || dims.height !== 12) {
      continue;
    }

    const anchors = [
      { dx: 0, dy: 0 },
      { dx: 6, dy: 0 },
      { dx: 0, dy: 6 },
      { dx: 6, dy: 6 },
      { dx: 3, dy: 3 }
    ];

    for (const rotation of ROTATIONS) {
      for (const anchor of anchors) {
        const placement = {
          pieceId: overlayPiece.id,
          x: basePlacement.x + anchor.dx,
          y: basePlacement.y + anchor.dy,
          rotation,
          overlay: true
        };

        let valid = true;
        for (let dy = 0; dy < 6 && valid; dy += 1) {
          for (let dx = 0; dx < 6; dx += 1) {
            if (dockTiles.has(`${placement.x + dx},${placement.y + dy}`)) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          placements.push(placement);
        }
      }
    }
  }

  return placements;
}

function chooseOverlayPlacements(structuralPlacements, dockPlacements, pieceMap, preferences, expansionIds) {
  if (normalizeOverlayMode(preferences.overlayMode) === OVERLAY_MODES.no) {
    return [];
  }

  const usedStructuralBoards = new Set(
    structuralPlacements.map((placement) => getPhysicalBoardId(pieceMap[placement.pieceId]))
  );
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionIds);
  const miniOverlayIds = shouldUseMiniOverlays(preferences)
    ? overlayIds.filter((overlayId) => isMiniOverlayPiece(pieceMap[overlayId]))
    : [];
  const boardOverlayIds = shouldUseBoardOverlays(preferences)
    ? overlayIds.filter((overlayId) => (
      !isMiniOverlayPiece(pieceMap[overlayId]) &&
      !usedStructuralBoards.has(getPhysicalBoardId(pieceMap[overlayId]))
    ))
    : [];

  const largeBoardCount = structuralPlacements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
  }).length;
  const groupedBoardOverlays = new Map();
  for (const overlayId of boardOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedBoardOverlays.has(physicalBoardId)) {
      groupedBoardOverlays.set(physicalBoardId, []);
    }
    groupedBoardOverlays.get(physicalBoardId).push(overlayId);
  }

  const placements = [];
  const occupiedBoardOverlayTiles = new Set();
  const occupiedMiniOverlayTiles = new Set();
  const currentPlacements = [
    ...structuralPlacements,
    ...dockPlacements
  ];
  const boardOverlayPlacements = [];

  const targetBoardOverlayCount = getBoardOverlayCount(preferences, largeBoardCount, groupedBoardOverlays.size);
  const calibrationBoardOverlayCount = preferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(preferences.calibrationBoardOverlayCount);
  const calibrationForcesBoardOverlays = Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount >= 0;
  const boardOverlayGroups = shuffle([...groupedBoardOverlays.values()]);
  const groupsToTry = calibrationForcesBoardOverlays
    ? boardOverlayGroups
    : boardOverlayGroups.slice(0, targetBoardOverlayCount);

  for (const groupOverlayIds of groupsToTry) {
    if (calibrationForcesBoardOverlays && boardOverlayPlacements.length >= targetBoardOverlayCount) {
      break;
    }

    const candidateOverlayIds = calibrationForcesBoardOverlays
      ? shuffle(groupOverlayIds)
      : [sample(groupOverlayIds)];
    let chosenPlacement = null;
    let chosenOverlayPiece = null;

    for (const chosenOverlayId of candidateOverlayIds) {
      const overlayPiece = pieceMap[chosenOverlayId];
      const legalPlacements = (
        preferences.alignedLayout
          ? getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
          : getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
      ).filter((placement) => (
        getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedBoardOverlayTiles.has(key))
      ));
      if (!legalPlacements.length) {
        continue;
      }
      chosenPlacement = sample(legalPlacements);
      chosenOverlayPiece = overlayPiece;
      break;
    }

    if (!chosenPlacement || !chosenOverlayPiece) {
      continue;
    }

    getPlacementOccupiedTiles(chosenOverlayPiece, chosenPlacement).forEach((key) => occupiedBoardOverlayTiles.add(key));
    placements.push(chosenPlacement);
    boardOverlayPlacements.push(chosenPlacement);
    currentPlacements.push(chosenPlacement);
  }

  const groupedMiniOverlays = new Map();
  for (const overlayId of miniOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedMiniOverlays.has(physicalBoardId)) {
      groupedMiniOverlays.set(physicalBoardId, []);
    }
    groupedMiniOverlays.get(physicalBoardId).push(overlayId);
  }

  const { blankBoards, otherBoards } = getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap);
  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(blankBoards),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseBlankBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseLargeBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) < 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseSmallBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  return placements;
}

function sampleDistinctBoardFaces(boardIds, count, pieceMap) {
  const pool = shuffle(boardIds);
  const selected = [];
  const usedPhysicalBoards = new Set();

  for (const boardId of pool) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
    if (usedPhysicalBoards.has(physicalBoardId)) {
      continue;
    }

    selected.push(boardId);
    usedPhysicalBoards.add(physicalBoardId);

    if (selected.length >= count) {
      break;
    }
  }

  return selected;
}

function smallBoardCompositionPenalty(boardIds, pieceMap) {
  const smallCount = boardIds.filter((boardId) => pieceMap[boardId]?.kind === "small").length;
  if (smallCount === 1) {
    return 1.8;
  }
  if (smallCount >= 2) {
    return 0.4;
  }
  return 0;
}

function boardSelectionCompositionPenalty(boardIds, pieceMap) {
  // Neutral composition quality only. A lone small board mixed into a large
  // layout tends to produce awkward geometry; this is not a target prediction.
  return smallBoardCompositionPenalty(boardIds, pieceMap);
}

function selectBoardIdsForCourse(boardIds, count, pieceMap) {
  const candidates = [];
  const attempts = Math.min(48, Math.max(12, boardIds.length * 2));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const selectedBoardIds = sampleDistinctBoardFaces(boardIds, count, pieceMap);
    if (selectedBoardIds.length !== count) continue;
    const penalty = boardSelectionCompositionPenalty(selectedBoardIds, pieceMap);
    candidates.push({
      selectedBoardIds,
      weight: 1 / (1 + Math.max(0, penalty))
    });
  }

  if (!candidates.length) {
    return { subsetBoardIds: [], selectedBoardIds: [] };
  }

  const selected = sampleManyWeighted(candidates, 1)[0] ?? sample(candidates);
  return {
    subsetBoardIds: [...boardIds],
    selectedBoardIds: selected?.selectedBoardIds ?? []
  };
}

function cloneTileMap(tileMap) {
  const copy = new Map();

  for (const [key, tile] of tileMap.entries()) {
    copy.set(key, {
      x: tile.x,
      y: tile.y,
      features: tile.features.map((feature) => structuredClone(feature))
    });
  }

  return copy;
}

function buildBoardRects(boardPlacements, pieceMap) {
  return boardPlacements.map((placement, index) => {
    const piece = pieceMap[placement.pieceId];
    const dims = rotatedDimensions(piece, placement.rotation ?? 0);

    return {
      index,
      pieceId: placement.pieceId,
      x: placement.x,
      y: placement.y,
      width: dims.width,
      height: dims.height
    };
  });
}

function pointOnRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function getWallsAtTile(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") continue;
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

function canStepForReboot(tileMap, boardRect, from, dir) {
  const delta = {
    N: { dx: 0, dy: -1 },
    E: { dx: 1, dy: 0 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 }
  }[dir];
  const opposite = {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[dir];
  const to = {
    x: from.x + delta.dx,
    y: from.y + delta.dy
  };

  if (!pointOnRect(to, boardRect)) {
    return false;
  }

  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  if (!toTile) {
    return false;
  }

  const fromWalls = getWallsAtTile(fromTile);
  const toWalls = getWallsAtTile(toTile);
  if (fromWalls.has(dir) || toWalls.has(opposite)) {
    return false;
  }

  return !(toTile.features || []).some((feature) => feature.type === "pit");
}

function scoreRebootDirection(tileMap, boardRect, point, dir, minRunway) {
  let runway = 0;
  let current = point;

  while (runway < 3 && canStepForReboot(tileMap, boardRect, current, dir)) {
    const delta = {
      N: { dx: 0, dy: -1 },
      E: { dx: 1, dy: 0 },
      S: { dx: 0, dy: 1 },
      W: { dx: -1, dy: 0 }
    }[dir];
    current = {
      x: current.x + delta.dx,
      y: current.y + delta.dy
    };
    runway += 1;
  }

  if (runway < minRunway) {
    return null;
  }

  return runway * 4;
}

function placeRebootTokens(boardRects, tileMap, checkpoints, playerCount) {
  const minRunway = playerCount >= 5 ? 2 : 1;
  const dirs = ["N", "E", "S", "W"];
  const tokens = [];

  for (const boardRect of boardRects) {
    const center = {
      x: boardRect.x + (boardRect.width - 1) / 2,
      y: boardRect.y + (boardRect.height - 1) / 2
    };
    let best = null;

    for (let y = boardRect.y; y < boardRect.y + boardRect.height; y += 1) {
      for (let x = boardRect.x; x < boardRect.x + boardRect.width; x += 1) {
        const point = { x, y };
        const tile = tileMap.get(`${x},${y}`) ?? { features: [] };
        const features = tile.features || [];

        if (checkpoints.some((checkpoint) => checkpoint.x === x && checkpoint.y === y)) {
          continue;
        }

        if (features.some((feature) => feature.type === "pit")) {
          continue;
        }

        const nonPassivePenalty = features.reduce((sum, feature) => {
          if (feature.type === "wall" || feature.type === "laser" || feature.type === "checkpoint") {
            return sum;
          }
          return sum + 5;
        }, 0);
        const nearestCheckpoint = checkpoints.length
          ? Math.min(...checkpoints.map((checkpoint) => manhattanDistance(point, checkpoint)))
          : 99;
        const centerDistance = Math.abs(point.x - center.x) + Math.abs(point.y - center.y);

        for (const dir of dirs) {
          const directionScore = scoreRebootDirection(tileMap, boardRect, point, dir, minRunway);
          if (directionScore === null) {
            continue;
          }

          const score = (
            nearestCheckpoint * 2.5 +
            directionScore * 3 -
            centerDistance * 3 -
            nonPassivePenalty
          );

          if (!best || score > best.score) {
            best = {
              boardIndex: boardRect.index,
              pieceId: boardRect.pieceId,
              x,
              y,
              dir,
              score
            };
          }
        }
      }
    }

    if (best) {
      tokens.push(best);
    }
  }

  return tokens;
}

function canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints = [], options = {}) {
  return checkpoints.some((checkpoint) => {
    const analysis = analyzeFlagLeg(tileMap, point, checkpoint, {
      facings: FACINGS,
      routesPerFacing: 1,
      maxDistinctRoutes: 1,
      maxExpansions: 8000,
      playerCount: 1,
      recoveryRule: "dynamic_archiving",
      lessDeadlyGame: options.lessDeadlyGame
    });

    return Number.isFinite(analysis.summary.bestRouteScore);
  });
}

function placeHomeRebootTokens(dockPlacements, pieceMap, starts = [], tileMap, checkpoints = [], options = {}) {
  const tokens = [];
  const startKeys = new Set(starts.map((start) => `${start.x},${start.y}`));
  const checkpointKeys = new Set(checkpoints.map((checkpoint) => `${checkpoint.x},${checkpoint.y}`));

  dockPlacements.forEach((dockPlacement, dockIndex) => {
    const dockStarts = starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap));
    if (!dockStarts.length) {
      return;
    }

    const piece = pieceMap[dockPlacement.pieceId];
    const occupiedOffsets = getPlacementOccupiedOffsets(piece, dockPlacement.rotation ?? 0);
    const candidatePoints = occupiedOffsets
      .map((offset) => ({
        x: dockPlacement.x + offset.x,
        y: dockPlacement.y + offset.y
      }))
      .filter((point) => !startKeys.has(`${point.x},${point.y}`))
      .filter((point) => !checkpointKeys.has(`${point.x},${point.y}`))
      .filter((point) => {
        const tile = tileMap?.get(`${point.x},${point.y}`) ?? { features: [] };
        return !(tile.features || []).some((feature) => feature.type === "pit");
      })
      .filter((point) => canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints, options));

    if (!candidatePoints.length) {
      return;
    }

    const dims = rotatedDimensions(piece, dockPlacement.rotation ?? 0);
    const center = {
      x: dockPlacement.x + (dims.width - 1) / 2,
      y: dockPlacement.y + (dims.height - 1) / 2
    };
    const token = candidatePoints
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - center.x) + Math.abs(left.y - center.y);
        const rightDistance = Math.abs(right.x - center.x) + Math.abs(right.y - center.y);
        return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
      })[0];

    tokens.push({
      dockIndex,
      pieceId: dockPlacement.pieceId,
      x: token.x,
      y: token.y,
      startKeys: dockStarts.map((start) => `${start.x},${start.y}`)
    });
  });

  return tokens;
}

function getNoDockEdgeTiles(boardRect, side) {
  const tiles = [];
  if (side === "N" || side === "S") {
    const y = side === "N" ? boardRect.y : boardRect.y + boardRect.height - 1;
    for (let x = boardRect.x; x < boardRect.x + boardRect.width; x += 1) tiles.push({ x, y });
  } else {
    const x = side === "W" ? boardRect.x : boardRect.x + boardRect.width - 1;
    for (let y = boardRect.y; y < boardRect.y + boardRect.height; y += 1) tiles.push({ x, y });
  }
  return tiles;
}

function getNoDockInwardFacing(side) {
  return { N: "S", E: "W", S: "N", W: "E" }[side];
}

function getDirectionDelta(dir) {
  return {
    N: { dx: 0, dy: -1, opposite: "S" },
    E: { dx: 1, dy: 0, opposite: "W" },
    S: { dx: 0, dy: 1, opposite: "N" },
    W: { dx: -1, dy: 0, opposite: "E" }
  }[dir];
}

function isNoDockStartTileClear(tile) {
  // The square itself only needs a clear floor. Passive border geometry is
  // allowed; floor features and active edge devices make the square unsuitable
  // as an offered No-Docks start.
  return Boolean(tile) && (tile.features || []).every((feature) => (
    NO_DOCK_START_EDGE_FEATURE_TYPES.has(feature.type)
  ));
}

function buildNoDockEdgeCandidate(boardRect, side, tileMap) {
  const facing = getNoDockInwardFacing(side);
  const outward = getDirectionDelta(side);
  const starts = [];
  const edgeTiles = getNoDockEdgeTiles(boardRect, side);
  const fullyExposed = edgeTiles.every((point) => (
    !tileMap.get(`${point.x + outward.dx},${point.y + outward.dy}`)
  ));
  if (!fullyExposed) {
    return {
      boardIndex: boardRect.index,
      pieceId: boardRect.pieceId,
      side,
      facing,
      edgeLength: edgeTiles.length,
      starts: [],
      longestRun: 0,
      score: 0
    };
  }

  for (const point of edgeTiles) {
    const tile = tileMap.get(`${point.x},${point.y}`);
    if (!isNoDockStartTileClear(tile)) continue;

    // Eligibility is about the starting square itself. An inward pit, wall,
    // ledge, or other route complication does not make the square occupied;
    // contextual routing will decide whether the start is actually useful.
    starts.push({ x: point.x, y: point.y, facing });
  }

  let longestRun = 0;
  let run = 0;
  let previous = null;
  for (const start of starts) {
    const coord = side === "N" || side === "S" ? start.x : start.y;
    run = previous !== null && coord === previous + 1 ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
    previous = coord;
  }

  return {
    boardIndex: boardRect.index,
    pieceId: boardRect.pieceId,
    side,
    facing,
    edgeLength: edgeTiles.length,
    starts,
    longestRun,
    score: starts.length * 10 + longestRun * 3
  };
}

function orderNoDockEdgeStartsCenterOut(edge) {
  const starts = [...(edge?.starts || [])];
  const horizontal = edge?.side === "N" || edge?.side === "S";
  starts.sort((left, right) => (
    horizontal ? left.x - right.x : left.y - right.y
  ));
  if (starts.length <= 2) return starts;

  const ordered = [];
  let left = Math.floor((starts.length - 1) / 2);
  let right = left + 1;
  ordered.push(starts[left]);
  left -= 1;
  while (left >= 0 || right < starts.length) {
    if (right < starts.length) ordered.push(starts[right++]);
    if (left >= 0) ordered.push(starts[left--]);
  }
  return ordered;
}

function getNoDockStartTargetCount(requiredStarts, options = {}) {
  const playerCount = Math.max(1, Number(options.playerCount ?? requiredStarts ?? 1));
  const competitiveMode = typeof options.competitiveMode === "boolean"
    ? options.competitiveMode
    : getVariantPreferenceState(options, "competitiveMode") === "forced";

  // Competitive deliberately needs its full 2P strategic candidate pool.
  // Normal and Pay to Win benefit from a small two-start reserve so one failed
  // route or fairness/pricing exclusion does not instantly make a P-player
  // No-Docks setup impossible. The reserve is a target, not a hard capacity
  // requirement: a legal edge with only P or P+1 starts can still be used.
  return competitiveMode
    ? Math.max(requiredStarts, playerCount * 2)
    : Math.max(requiredStarts, playerCount + 2);
}

function chooseNoDockStartingZones(boardRects, tileMap, requiredStarts, options = {}) {
  // v23: No Docks is deliberately a single-zone layout mode. Extra Docks and
  // Sandwiched Dock are mutually exclusive with it, so do not combine edges.
  const targetStarts = getNoDockStartTargetCount(requiredStarts, options);
  const candidates = [];

  for (const boardRect of boardRects) {
    for (const side of ["N", "E", "S", "W"]) {
      const edge = buildNoDockEdgeCandidate(boardRect, side, tileMap);
      if (edge.starts.length < requiredStarts) continue;

      const ordered = orderNoDockEdgeStartsCenterOut(edge);
      const starts = ordered.slice(0, Math.min(targetStarts, ordered.length));
      candidates.push({
        edges: [edge],
        starts,
        zoneCount: 1,
        requiredStarts,
        targetStarts,
        score: (edge.score || 0) + starts.length * 4
      });
    }
  }

  if (!candidates.length) return null;
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const nearBest = candidates.filter((candidate) => candidate.score >= bestScore - 10);
  return sample(nearBest);
}

function getFlagCandidates(placements, pieceMap) {
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

function areFlagsTooClose(left, right, minDistance = 3) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) < minDistance;
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getTileBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

function getTileWalls(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") {
      continue;
    }
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

function isBlockedBetween(tileMap, from, to, dir) {
  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  const fromWalls = getTileWalls(fromTile);
  const toWalls = getTileWalls(toTile);
  return fromWalls.has(dir) || toWalls.has(OPPOSITE_DIRS[dir]);
}

function getConveyorSuccessor(tileMap, point) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || !CARDINAL_DIRS[belt.dir]) {
    return null;
  }

  const vector = CARDINAL_DIRS[belt.dir];
  const next = {
    x: point.x + vector.dx,
    y: point.y + vector.dy
  };
  const nextTile = tileMap.get(`${next.x},${next.y}`);
  if (!nextTile || isBlockedBetween(tileMap, point, next, belt.dir) || !getTileBelt(nextTile)) {
    return null;
  }

  return next;
}

function getConveyorPredecessors(tileMap, point) {
  if (!tileMap) {
    return [];
  }

  const predecessors = [];
  for (const vector of Object.values(CARDINAL_DIRS)) {
    const previous = {
      x: point.x - vector.dx,
      y: point.y - vector.dy
    };
    const successor = getConveyorSuccessor(tileMap, previous);
    if (successor && successor.x === point.x && successor.y === point.y) {
      predecessors.push(previous);
    }
  }

  return predecessors;
}

function getMovingTraceStepLimit(tileMap, options = {}) {
  if (Number.isFinite(options.maxTraceSteps)) {
    return Math.max(1, options.maxTraceSteps);
  }

  return Math.min(180, Math.max(48, tileMap?.size ?? 48));
}

function pointStartsClosedConveyorLoop(tileMap, point, options = {}) {
  if (!tileMap) {
    return false;
  }

  const startKey = `${point.x},${point.y}`;
  const startTile = tileMap.get(startKey);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    return false;
  }

  const visited = new Set();
  let current = { x: point.x, y: point.y };

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);

  for (let step = 0; step < maxTraceSteps; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      return key === startKey;
    }
    visited.add(key);

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      return false;
    }

    current = next;
  }

  return false;
}

function getMovingCheckpointTrace(tileMap, point, cache = null, options = {}) {
  if (!tileMap) {
    return {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: []
    };
  }

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);
  const cacheKey = `${point.x},${point.y}:${maxTraceSteps}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const startTile = tileMap.get(`${point.x},${point.y}`);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    const result = {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: [{ x: point.x, y: point.y }]
    };
    cache?.set(cacheKey, result);
    return result;
  }

  const coverage = [];
  const visited = new Set();
  const directions = [];
  let current = { x: point.x, y: point.y };
  let wraps = false;
  let fastCount = 0;
  let hazardLoad = 0;

  for (let step = 0; step < maxTraceSteps; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      wraps = true;
      break;
    }

    visited.add(key);
    coverage.push({ x: current.x, y: current.y });
    const tile = tileMap.get(key);
    const belt = getTileBelt(tile);
    if (!belt || !CARDINAL_DIRS[belt.dir]) {
      break;
    }

    directions.push(belt.dir);
    if (belt.speed === 2) {
      fastCount += 1;
    }

    for (const feature of tile?.features || []) {
      if (feature.type === "checkpoint" || feature.type === "wall" || feature.type === "belt" || feature.type === "battery") {
        continue;
      }
      hazardLoad += getTilePenaltyForFeature(feature, {
        batteryActive: true,
        lessSpammyGame: options.lessSpammyGame,
        criticalSpam: options.criticalSpam,
        criticalHaywire: options.criticalHaywire,
        permanentShutdown: options.permanentShutdown
      });
    }

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      break;
    }

    current = next;
  }

  let turnCount = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) {
      turnCount += 1;
    }
  }

  const result = {
    moving: coverage.length > 1,
    wraps,
    pathLength: coverage.length,
    turnCount,
    fastCount,
    hazardLoad: Number(hazardLoad.toFixed(2)),
    coverage
  };
  cache?.set(cacheKey, result);
  return result;
}

function findMovingCheckpointReentryPoint(tileMap, point) {
  if (!tileMap) {
    return { x: point.x, y: point.y };
  }

  if (pointStartsClosedConveyorLoop(tileMap, point, { maxTraceSteps: getMovingTraceStepLimit(tileMap) })) {
    return { x: point.x, y: point.y };
  }

  const queue = [{ x: point.x, y: point.y, depth: 0 }];
  const visited = new Set([`${point.x},${point.y}`]);
  let best = { x: point.x, y: point.y, depth: 0 };

  while (queue.length) {
    const current = queue.shift();
    const predecessors = getConveyorPredecessors(tileMap, current);

    if (!predecessors.length) {
      if (
        current.depth > best.depth ||
        (current.depth === best.depth && `${current.x},${current.y}` < `${best.x},${best.y}`)
      ) {
        best = current;
      }
      continue;
    }

    for (const predecessor of predecessors) {
      const key = `${predecessor.x},${predecessor.y}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({
        x: predecessor.x,
        y: predecessor.y,
        depth: current.depth + 1
      });
    }
  }

  return { x: best.x, y: best.y };
}

function summarizeMovingTargets(tileMap, checkpoints = [], options = {}) {
  const traceCache = new Map();
  const active = checkpoints
    .map((checkpoint) => ({
      checkpoint,
      trace: getMovingCheckpointTrace(tileMap, checkpoint, traceCache, options)
    }))
    .filter((entry) => entry.trace.moving);

  if (!active.length) {
    return {
      activeCount: 0,
      totalPathLength: 0,
      totalTurns: 0,
      totalHazardLoad: 0,
      fastSegments: 0,
      coverageTiles: 0,
      wrapCount: 0,
      difficultyBonus: 0,
      lengthBonus: 0
    };
  }

  const coverageTiles = new Set();
  let totalPathLength = 0;
  let totalTurns = 0;
  let totalHazardLoad = 0;
  let fastSegments = 0;
  let wrapCount = 0;

  for (const { trace } of active) {
    totalPathLength += trace.pathLength;
    totalTurns += trace.turnCount;
    totalHazardLoad += trace.hazardLoad;
    fastSegments += trace.fastCount;
    if (trace.wraps) {
      wrapCount += 1;
    }
    trace.coverage.forEach((tile) => coverageTiles.add(`${tile.x},${tile.y}`));
  }

  const difficultyBonus = Number((
    active.length * 1.6 +
    Math.max(0, totalPathLength - active.length) * 0.42 +
    totalTurns * 0.3 +
    fastSegments * 0.22 +
    totalHazardLoad * 0.08
  ).toFixed(2));
  const lengthBonus = Number((
    active.length * 0.75 +
    Math.max(0, totalPathLength - active.length) * 0.25 +
    totalTurns * 0.14 +
    wrapCount * 0.2
  ).toFixed(2));

  return {
    activeCount: active.length,
    totalPathLength,
    totalTurns,
    totalHazardLoad: Number(totalHazardLoad.toFixed(2)),
    fastSegments,
    coverageTiles: coverageTiles.size,
    wrapCount,
    difficultyBonus,
    lengthBonus
  };
}

function moveCheckpointOneConveyorStep(tileMap, point, eligibleSpeed, reentry) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || belt.speed !== eligibleSpeed || !CARDINAL_DIRS[belt.dir]) {
    return { ...point };
  }

  const next = getConveyorSuccessor(tileMap, point);
  if (!next) {
    return { ...reentry };
  }

  return next;
}

function advanceMovingCheckpointRegister(tileMap, point, reentry) {
  let current = { ...point };

  for (let step = 0; step < 2; step += 1) {
    const next = moveCheckpointOneConveyorStep(tileMap, current, 2, reentry);
    if (next.x === current.x && next.y === current.y) {
      break;
    }
    current = next;
  }

  current = moveCheckpointOneConveyorStep(tileMap, current, 1, reentry);
  return current;
}

function buildMovingCheckpointTimeline(tileMap, checkpoint, id, options = {}) {
  const trace = getMovingCheckpointTrace(tileMap, checkpoint, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  if (!trace.moving) {
    return null;
  }

  const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
  const reentryTrace = getMovingCheckpointTrace(tileMap, reentry, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  const maxActions = options.maxActions ?? 16;
  const positions = [{ x: checkpoint.x, y: checkpoint.y }];
  const seen = new Map([[`${checkpoint.x},${checkpoint.y}`, 0]]);
  let current = { x: checkpoint.x, y: checkpoint.y };
  let periodStart = null;
  let periodLength = null;

  for (let action = 1; action <= maxActions; action += 1) {
    current = advanceMovingCheckpointRegister(tileMap, current, reentry);
    positions.push({ x: current.x, y: current.y });
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) {
      periodStart = seen.get(key);
      periodLength = action - periodStart;
      break;
    }
    seen.set(key, action);
  }

  return {
    id,
    reentry,
    positions,
    displayPositions: reentryTrace.coverage?.length ? reentryTrace.coverage : trace.coverage?.length ? trace.coverage : positions,
    periodStart: periodStart ?? Math.max(0, positions.length - 1),
    periodLength: periodLength ?? 0,
    maxActions,
    trace
  };
}

function buildMovingTargetTimelines(tileMap, checkpoints = [], enabled = false, options = {}) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  return checkpoints.map((checkpoint, index) => (
    buildMovingCheckpointTimeline(tileMap, checkpoint, index + 1, options)
  ));
}

function collectMovingTargetReentryMarkers(tileMap, checkpoints = [], enabled = false) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  const traceCache = new Map();
  const markers = checkpoints
    .map((checkpoint, index) => {
      const trace = getMovingCheckpointTrace(tileMap, checkpoint, traceCache);
      if (!trace.moving) {
        return null;
      }

      const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
      return {
        id: index + 1,
        label: `R${index + 1}`,
        x: reentry.x,
        y: reentry.y
      };
    })
    .filter(Boolean);

  const grouped = new Map();
  markers.forEach((marker) => {
    const key = `${marker.x},${marker.y}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(marker.id);
      existing.label = `R${existing.ids.join("/")}`;
      return;
    }

    grouped.set(key, {
      ...marker,
      ids: [marker.id]
    });
  });

  return [...grouped.values()];
}

function pickVirtualBotEntry(flagCandidates, tileMap, boardPlacements, pieceMap, preferences = {}) {
  const eligible = flagCandidates
    .filter((candidate) => getVirtualBotEntryDirections(tileMap, candidate).length > 0)
    .map((candidate) => {
      const approach = getFlagCandidateApproachStats(tileMap, candidate);
      const boardUse = getCandidateBoardDepth(candidate, boardPlacements, pieceMap);
      const rawWeight = Math.max(0.05,
        (candidate.weight ?? 1) +
        approach.openCount * 1.1 +
        approach.convergencePotential * 0.55 +
        Math.min(1.6, boardUse.depth * 0.35)
      );
      return { ...candidate, weight: Math.pow(rawWeight, getConstructionGuidanceStrength(preferences)) };
    });
  return sampleManyWeighted(eligible, 1)[0] ?? null;
}

// Checkpoint geometry has two layers. The technical floor prevents duplicate or
// nearly identical objectives from dominating proposal sampling. The stronger
// profile is retained as construction/debug evidence only; player-facing checkpoint
// quality is judged from routed register demand after analysis.
const CHECKPOINT_TECHNICAL_SPACING = Object.freeze({
  consecutive: 2,
  openingNearest: 2,
  openingAverage: 3
});
const CHECKPOINT_SPACING_EXPECTATIONS = Object.freeze({
  consecutive: 4,
  final: 6,
  openingNearest: 4,
  openingAverage: 7
});

function getConsecutiveFlagDistanceThreshold() {
  return CHECKPOINT_TECHNICAL_SPACING.consecutive;
}

function getFirstFlagDistanceThresholds() {
  return {
    nearest: CHECKPOINT_TECHNICAL_SPACING.openingNearest,
    average: CHECKPOINT_TECHNICAL_SPACING.openingAverage
  };
}

function isFirstFlagFarEnough(flag, starts, thresholds, options = {}) {
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

function isValidFlagSequence(flags) {
  const minDistance = getConsecutiveFlagDistanceThreshold();
  for (let index = 1; index < flags.length; index += 1) {
    if (areFlagsTooClose(flags[index - 1], flags[index], minDistance)) return false;
  }
  return true;
}

// Stronger Manhattan spacing is retained for construction/debug diagnostics only.
// It is not route legality, acceptance, fit scoring, proposal preference, or a
// player-facing checkpoint warning.
function getCheckpointSpacingExpectationProfile(flags = [], starts = [], preferences = {}) {
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

function sampleCheckpointProposalWithExpectations(candidates = [], preferences = {}, applySpacingPreference = false) {
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

function getFlagCandidateApproachStats(tileMap, point) {
  const directions = [
    { dir: "N", dx: 0, dy: -1 },
    { dir: "E", dx: 1, dy: 0 },
    { dir: "S", dx: 0, dy: 1 },
    { dir: "W", dx: -1, dy: 0 }
  ];
  let openCount = 0;
  let pitCount = 0;
  let voidCount = 0;
  let blockedCount = 0;

  for (const { dir, dx, dy } of directions) {
    const neighbor = { x: point.x + dx, y: point.y + dy };
    const tile = tileMap.get(`${neighbor.x},${neighbor.y}`);
    if (!tile) { voidCount += 1; continue; }
    if ((tile.features || []).some((feature) => feature.type === "pit")) { pitCount += 1; continue; }
    if (isBlockedBetween(tileMap, point, neighbor, dir)) { blockedCount += 1; continue; }
    openCount += 1;
  }

  return {
    openCount,
    pitCount,
    voidCount,
    blockedCount,
    // Several genuinely open sides are a cheap proxy for a checkpoint that can
    // receive robots from different lines. Final traffic analysis decides if it
    // actually becomes contested.
    convergencePotential: Math.max(0, openCount - 1)
  };
}

function canUseCheckpointTile(candidate, tileMap, starts, preferences = {}) {
  if (!preferences.hazardousFlags) {
    return true;
  }

  if (starts.some((start) => start.x === candidate.x && start.y === candidate.y)) {
    return false;
  }

  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  return !(tile?.features || []).some((feature) => feature.type === "pit");
}

function getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences = {}) {
  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  const features = tile?.features || [];
  let penalty = 0;

  for (const feature of features) {
    if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall") {
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

function getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences = {}) {
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
        if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall") {
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

function isDynamicArchivingActive(preferences = {}) {
  return preferences.recoveryRule === "dynamic_archiving";
}

function getCandidateBoardDepth(candidate, boardPlacements = [], pieceMap = {}) {
  let bestDepth = 0;
  let boardIndex = -1;
  boardPlacements.forEach((placement, index) => {
    if (!pointOnPlacement(candidate, placement, pieceMap)) return;
    const piece = pieceMap[placement.pieceId];
    const dims = rotatedDimensions(piece, placement.rotation ?? 0);
    const localX = candidate.x - placement.x;
    const localY = candidate.y - placement.y;
    const depth = Math.max(0, Math.min(localX, localY, dims.width - 1 - localX, dims.height - 1 - localY));
    if (boardIndex < 0 || depth > bestDepth) { bestDepth = depth; boardIndex = index; }
  });
  return { boardIndex, depth: bestDepth };
}

const CALIBRATION_CHECKPOINT_SAMPLING_REGIMES = Object.freeze(["compact", "ordinary", "stretched"]);

function getCalibrationCheckpointSamplingRegime(preferences = {}) {
  const regime = preferences.calibrationCheckpointSamplingRegime;
  return CALIBRATION_CHECKPOINT_SAMPLING_REGIMES.includes(regime) ? regime : null;
}

function getCalibrationCheckpointDistanceTargets(regime, finalLeg = false) {
  if (regime === "compact") {
    return { openingAverage: 5, openingNearest: 2.5, leg: finalLeg ? 5 : 4 };
  }
  if (regime === "stretched") {
    return { openingAverage: 15, openingNearest: 6, leg: finalLeg ? 17 : 14 };
  }
  return { openingAverage: 9, openingNearest: 4, leg: finalLeg ? 10 : 8 };
}

function calibrationDistanceMultiplier(value, target, spread, peak = 5) {
  const safeSpread = Math.max(0.5, Number(spread) || 1);
  const z = (Number(value) - Number(target)) / safeSpread;
  // Keep every technically valid distance sampleable, but make the experimental
  // compact / ordinary / stretched strata visibly different in the observed
  // geometry. This is calibration-only proposal weighting, never legality.
  return 0.08 + peak * Math.exp(-0.5 * z * z);
}

function getCalibrationFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, flagCount, previousFlag = null, picked = [], boardPlacements = [], pieceMap = {}) {
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

function getFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, flagCount, thresholds, previousFlag = null, picked = [], boardPlacements = [], pieceMap = {}, movingTargetTraceCache = null) {
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

function sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, thresholds, boardPlacements, pieceMap, movingTargetTraceCache = null) {
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

function pickFlags(flagCandidates, flagCount, boardPlacements, dockPlacements, pieceMap, starts = [], preferences = {}) {
  const firstFlagThresholds = getFirstFlagDistanceThresholds();
  const { tileMap } = buildResolvedMap([...boardPlacements, ...(dockPlacements || [])], pieceMap);
  const movingTargetTraceCache = preferences.movingTargets ? new Map() : null;
  const movingCandidates = preferences.movingTargets
    ? new Set(flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences).moving).map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  const requiresMovingTarget = Boolean(movingCandidates?.size);

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const sampled = sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, firstFlagThresholds, boardPlacements, pieceMap, movingTargetTraceCache);
    if (sampled.length !== flagCount) continue;
    if (!isValidFlagSequence(sampled)) continue;
    if (!isFirstFlagFarEnough(sampled[0], starts, firstFlagThresholds, preferences)) continue;
    if (requiresMovingTarget && !sampled.some((flag) => movingCandidates.has(`${flag.x},${flag.y}`))) continue;
    return sampled.map(({ x, y }) => ({ x, y }));
  }

  return null;
}

function applyFlagOverrides(tileMap, goals, options = {}) {
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

function hideVirtualFlagZeroFeature(tileMap, flagZero) {
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

function getVirtualBotEntryDirections(tileMap, point) {
  const deltas = {
    N: { dx: 0, dy: -1, opposite: "S" },
    E: { dx: 1, dy: 0, opposite: "W" },
    S: { dx: 0, dy: 1, opposite: "N" },
    W: { dx: -1, dy: 0, opposite: "E" }
  };
  return Object.entries(deltas).filter(([dir, d]) => {
    const fromTile = tileMap.get(`${point.x},${point.y}`);
    const toTile = tileMap.get(`${point.x + d.dx},${point.y + d.dy}`);
    if (!toTile) return false;
    if (getWallsAtTile(fromTile).has(dir) || getWallsAtTile(toTile).has(d.opposite)) return false;
    return !(toTile.features || []).some((feature) => feature.type === "pit");
  }).map(([dir]) => dir);
}

function getPlayableCheckpoints(checkpoints = [], virtualBots = false) {
  return virtualBots ? checkpoints.slice(1) : checkpoints;
}

function buildVirtualRobotStarts(flagZero, playerCount = 4, startupSpinUp = false) {
  if (!flagZero) return [];
  return Array.from({ length: Math.max(1, playerCount) }, (_, index) => ({
    x: flagZero.x,
    y: flagZero.y,
    ...(startupSpinUp ? {} : { facing: flagZero.facing ?? "E" }),
    virtualRobotIndex: index
  }));
}

function filterStartsForGoals(starts, goals) {
  const goalKeys = new Set((goals || []).map((goal) => `${goal.x},${goal.y}`));
  return (starts || []).filter((start) => !goalKeys.has(`${start.x},${start.y}`));
}

function getAttachmentRange(anchorPlacement, anchorPiece, candidatePiece, candidateRotation, side, minSharedEdge = MIN_SHARED_EDGE) {
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const candidateDims = rotatedDimensions(candidatePiece, candidateRotation);

  if (side === "left" || side === "right") {
    return {
      min: anchorPlacement.y - candidateDims.height + minSharedEdge,
      max: anchorPlacement.y + anchorDims.height - minSharedEdge
    };
  }

  return {
    min: anchorPlacement.x - candidateDims.width + minSharedEdge,
    max: anchorPlacement.x + anchorDims.width - minSharedEdge
  };
}

function createAttachedBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side);

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(generationRandom() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height, rotation };
}

function createBridgeBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation, dockPiece) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side, Math.max(dockPiece.width, dockPiece.height));

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(generationRandom() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width - DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width + DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height - DOCK_BRIDGE_GAP, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height + DOCK_BRIDGE_GAP, rotation };
}

function findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped) {
  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = getValidDockRuns(groupBoundaryRuns(getBoundaryEdges(footprintTiles)), dock);
  const dockFrontageLength = getDockFrontageLength(dock);
  const candidates = [];

  for (const run of boundaryRuns) {
    const oppositeSide = { E: "W", W: "E", N: "S", S: "N" }[run.side];

    for (const other of boundaryRuns) {
      if (other === run || other.side !== oppositeSide || other.orientation !== run.orientation) {
        continue;
      }

      if (Math.abs(other.line - run.line) !== DOCK_BRIDGE_GAP) {
        continue;
      }

      const overlapStart = Math.max(run.start, other.start);
      const overlapEnd = Math.min(run.end, other.end);
      if (overlapEnd - overlapStart < dockFrontageLength) {
        continue;
      }

      const preferredRun = run.side === "E" || run.side === "S" ? run : other;
      const offset = overlapStart - preferredRun.start;
      const dockPlacement = projectDockPlacement(preferredRun, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid) {
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: preferredRun
        });
      }
    }
  }

  return candidates.length ? sample(candidates) : null;
}

// Sandwiched Dock used to work with the legacy bridge helper above. Keep that
// path untouched and use this separate helper only for additional docks on a
// sandwich layout, whose factory boards are intentionally disconnected.
function canBridgeDisconnectedLayout(structuralPlacements, pieceMap, dockPieceId) {
  return Boolean(
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, false) ||
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, true)
  );
}

function tryExtendBoardLayout(existingPlacements, nextBoardId, pieceMap, dockPieceId, allowDockBridge = false, options = {}) {
  const nextBoard = pieceMap[nextBoardId];
  const dock = pieceMap[dockPieceId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    if (!options.bridgeOnly) {
    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createAttachedBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.valid) {
          return {
            placements: candidatePlacements,
            layoutValidation: validation
          };
        }

        if (allowDockBridge && validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }

    }

    if (!allowDockBridge) {
      continue;
    }

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createBridgeBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation, dock);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }
  }

  return null;
}

function tryExtendAlignedBoardLayout(existingPlacements, nextBoardId, pieceMap) {
  const nextBoard = pieceMap[nextBoardId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const candidates = createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);

        for (const nextPlacement of shuffle(candidates)) {
          const candidatePlacements = [...existingPlacements, nextPlacement];
          const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
            minSharedEdge: MIN_SHARED_EDGE
          });

          if (validation.valid) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }
  }

  return null;
}

function getBoardPlacementPlanningContext(pieceMap, expansionIds = null, preferences = {}) {
  const allowBlankMiniBoards = preferences.difficulty === "easy" || shouldUseMiniOverlays(preferences);
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds).filter((boardId) => (
    allowBlankMiniBoards || !isBlankCustomBoardPiece(pieceMap[boardId])
  ));
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  const maxBoards = Math.min(
    hasLargeBoards ? 4 : 6,
    countPhysicalBoards(mainBoardIds, pieceMap)
  );
  return { mainBoardIds, hasLargeBoards, maxBoards };
}

// Board construction deliberately does not accept a length target, guidance
// level, or attempt number. Those old hand-tuned levers were removed: the cheap
// board proposal should stay target-neutral, then staged calibration ranks the
// resulting geometry by target fit and predicted work.
function createBoardPlacements(
  pieceMap,
  preferences,
  expansionIds = null,
  dockPieceId = "docking-bay-a",
  constructionGuidance = null,
  constructionGuidancePlanOverride = null
) {
  const {
    mainBoardIds,
    hasLargeBoards,
    maxBoards
  } = getBoardPlacementPlanningContext(pieceMap, expansionIds, preferences);
  const constructionGuidancePlan = constructionGuidancePlanOverride ?? getCalibratedConstructionPlan(
    maxBoards,
    hasLargeBoards,
    preferences,
    pieceMap,
    constructionGuidance
  );
  const calibrationBoardCount = Number(preferences.calibrationBoardCount);
  let boardCount = Number.isInteger(calibrationBoardCount) && calibrationBoardCount > 0
    ? Math.min(maxBoards, calibrationBoardCount)
    : constructionGuidancePlan?.boardCount ?? neutralBoardCount(maxBoards);
  if (preferences.sandwichedDock && maxBoards >= 2) {
    boardCount = Math.max(2, boardCount);
  }
  const requireDockSupport = !preferences.noDocks && !preferences.virtualBots;
  const hasDockPiece = Boolean(dockPieceId && pieceMap[dockPieceId]);
  let boardIds = [];

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidateSelection = selectBoardIdsForCourse(
      mainBoardIds,
      boardCount,
      pieceMap
    );
    const candidateBoardIds = candidateSelection.selectedBoardIds ?? [];
    if (candidateBoardIds.length !== boardCount) {
      continue;
    }
    if (requireDockSupport && !boardIdsCanSupportDock(candidateBoardIds, pieceMap, dockPieceId)) {
      continue;
    }
    boardIds = candidateBoardIds;
    break;
  }

  if (boardIds.length !== boardCount || (preferences.sandwichedDock && boardCount < 2)) {
    return null;
  }
  const firstBoard = pieceMap[boardIds[0]];
  let placements = [{
    pieceId: firstBoard.id,
    x: 24,
    y: 24,
    rotation: sample(ROTATIONS)
  }];

  let layoutValidation = validateMainBoardLayout(placements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });

  for (const [index, nextBoardId] of boardIds.slice(1).entries()) {
    const isFinalBoard = index === boardIds.length - 2;
    const forceDockBridge = Boolean(preferences.sandwichedDock && isFinalBoard && hasDockPiece);
    const allowDockBridge = forceDockBridge || (!preferences.alignedLayout && isFinalBoard);
    let extension = null;

    if (forceDockBridge) {
      // A sandwiched dock is deliberately the bridge between two board components.
      // Staggering may offset the opposing long-side frontage; aligned layouts use
      // the same bridge geometry but require the dock frontage alignment below.
      extension = tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, true, {
        bridgeOnly: true
      });
    } else {
      extension = preferences.alignedLayout
        ? tryExtendAlignedBoardLayout(placements, nextBoardId, pieceMap)
        : tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, allowDockBridge && hasDockPiece);
    }

    if (!extension) {
      return null;
    }

    placements = extension.placements;
    layoutValidation = extension.layoutValidation;
  }

  if (!isSmallBoardLayoutAcceptable(placements, pieceMap, layoutValidation, preferences)) {
    return null;
  }

  return {
    placements,
    boardIds,
    boardCount,
    layoutValidation,
    constructionGuidancePlan
  };
}

function getDockFrontageTiles(dockPlacement, pieceMap) {
  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return [];
  }

  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const frontage = [];

  if (dockPlacement.startFacingOverride === "E") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x + dims.width, y });
    }
  } else if (dockPlacement.startFacingOverride === "W") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x - 1, y });
    }
  } else if (dockPlacement.startFacingOverride === "S") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y + dims.height });
    }
  } else if (dockPlacement.startFacingOverride === "N") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y - 1 });
    }
  }

  return frontage;
}

function getRectEdgeSpan(rect, facing) {
  if (facing === "E" || facing === "W") {
    return {
      start: rect.y,
      length: rect.height
    };
  }

  if (facing === "N" || facing === "S") {
    return {
      start: rect.x,
      length: rect.width
    };
  }

  return null;
}

function isAllowedSingleBoardDockAlignment(frontageTiles, rect, facing) {
  const edgeSpan = getRectEdgeSpan(rect, facing);
  if (!edgeSpan || !frontageTiles.length) {
    return false;
  }

  const frontageStart = (facing === "E" || facing === "W")
    ? frontageTiles[0].y
    : frontageTiles[0].x;
  const frontageLength = frontageTiles.length;
  const slack = edgeSpan.length - frontageLength;

  if (slack < 0) {
    return false;
  }

  const allowedStarts = new Set([
    edgeSpan.start,
    edgeSpan.start + slack
  ]);

  if (slack % 2 === 0) {
    allowedStarts.add(edgeSpan.start + slack / 2);
  }

  return allowedStarts.has(frontageStart);
}

function hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement) {
  const frontageTiles = getDockFrontageTiles(dockPlacement, pieceMap);
  if (!frontageTiles.length) {
    return false;
  }

  const boardRects = structuralPlacements.map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const spans = [];

  for (const point of frontageTiles) {
    const rect = boardRects.find((candidate) => pointOnRect(point, candidate));
    if (!rect) {
      return false;
    }

    const previous = spans[spans.length - 1];
    if (previous?.index === rect.index) {
      previous.length += 1;
    } else {
      spans.push({ index: rect.index, length: 1 });
    }
  }

  if (spans.length === 1) {
    return isAllowedSingleBoardDockAlignment(frontageTiles, boardRects[spans[0].index], dockPlacement.startFacingOverride);
  }

  if (spans.length !== 2) {
    return false;
  }

  return spans[0].length === spans[1].length;
}

function createDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped, options = {}) {
  const layoutValidation = validateMainBoardLayout(structuralPlacements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });
  if (!layoutValidation.valid && layoutValidation.errors.length === 1 && layoutValidation.errors[0] === "disconnected-layout") {
    return findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
  }

  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const dockFrontageLength = getDockFrontageLength(dock);
  const candidates = [];

  for (const run of shuffle(validRuns)) {
    const availableOffsets = run.length - dockFrontageLength;
    const offsets = [];
    for (let offset = 0; offset <= availableOffsets; offset += 1) {
      offsets.push(offset);
    }

    for (const offset of shuffle(offsets)) {
      const dockPlacement = projectDockPlacement(run, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid && (!options.alignedLayout || hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement))) {
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: run
        });
      }
    }
  }

  if (!options.alignedLayout && options.allowBridgePlacement) {
    const bridgeCandidate = findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
    if (bridgeCandidate) {
      candidates.push(bridgeCandidate);
    }
  }

  return candidates.length ? sample(candidates) : null;
}

function getDockBoundaryRun(structuralPlacements, dockPlacement, pieceMap) {
  const dock = pieceMap[dockPlacement.pieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const dockDims = rotatedDimensions(dock, dockPlacement.rotation ?? 0);
  const expectedSide = {
    E: "W",
    S: "N",
    W: "E",
    N: "S"
  }[dockPlacement.startFacingOverride] ?? null;

  return validRuns.find((run) => {
    if (expectedSide && run.side !== expectedSide) {
      return false;
    }

    return [false, true].some((flipped) => {
      const projected = projectDockPlacement(run, 0, dock, flipped);
      if (projected.rotation !== (dockPlacement.rotation ?? 0)) {
        return false;
      }

      if (run.side === "W" || run.side === "E") {
        return projected.x === dockPlacement.x && dockPlacement.y >= projected.y && dockPlacement.y + dockDims.height <= projected.y + run.length;
      }

      return projected.y === dockPlacement.y && dockPlacement.x >= projected.x && dockPlacement.x + dockDims.width <= projected.x + run.length;
    });
  }) ?? null;
}

function getDockPlacementsFromScenarioPlacements(placements = [], pieceMap = {}) {
  return placements.filter((placement) => pieceMap[placement.pieceId]?.kind === "dock");
}

function getIntervalCoverageLength(intervals = []) {
  if (!intervals.length) return 0;
  const ordered = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let total = 0;
  let currentStart = ordered[0]?.[0] ?? 0;
  let currentEnd = ordered[0]?.[1] ?? 0;

  for (const [start, end] of ordered.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  return total + Math.max(0, currentEnd - currentStart);
}

function getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap) {
  if (!dockPlacement) {
    return { valid: false, boardIndices: [] };
  }

  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return { valid: false, boardIndices: [] };
  }

  const dockRect = getPlacedRect(dockPiece, dockPlacement);
  const boardRects = (boardPlacements || []).map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const horizontal = dockRect.width >= dockRect.height;
  const sideA = [];
  const sideB = [];
  const sideAIndices = new Set();
  const sideBIndices = new Set();

  for (const rect of boardRects) {
    if (horizontal) {
      const start = Math.max(rect.x, dockRect.x);
      const end = Math.min(rect.x + rect.width, dockRect.x + dockRect.width);
      if (end <= start) continue;

      if (rect.y + rect.height === dockRect.y) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.y === dockRect.y + dockRect.height) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    } else {
      const start = Math.max(rect.y, dockRect.y);
      const end = Math.min(rect.y + rect.height, dockRect.y + dockRect.height);
      if (end <= start) continue;

      if (rect.x + rect.width === dockRect.x) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.x === dockRect.x + dockRect.width) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    }
  }

  const requiredCoverage = horizontal ? dockRect.width : dockRect.height;
  const sideACoverage = getIntervalCoverageLength(sideA);
  const sideBCoverage = getIntervalCoverageLength(sideB);
  const valid = (
    sideACoverage >= requiredCoverage &&
    sideBCoverage >= requiredCoverage &&
    sideAIndices.size > 0 &&
    sideBIndices.size > 0
  );

  return {
    valid,
    boardIndices: valid
      ? [...new Set([...sideAIndices, ...sideBIndices])]
      : [],
    sideACoverage,
    sideBCoverage,
    requiredCoverage
  };
}

function getProtectedSandwichBoardIndices(boardPlacements, dockPlacements, pieceMap) {
  const protectedIndices = new Set();

  for (const dockPlacement of dockPlacements || []) {
    const structure = getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap);
    if (!structure.valid) continue;
    structure.boardIndices.forEach((index) => protectedIndices.add(index));
  }

  return protectedIndices;
}

function hasPhysicalSandwichedDock(boardPlacements, dockPlacements, pieceMap) {
  return (dockPlacements || []).some((dockPlacement) => (
    getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap).valid
  ));
}

function buildDockSummaries(boardPlacements, dockPlacements, pieceMap) {
  return dockPlacements.map((dockPlacement) => ({
    pieceId: dockPlacement.pieceId,
    flipped: Boolean((dockPlacement.rotation ?? 0) % 180),
    boundaryRun: getDockBoundaryRun(boardPlacements, dockPlacement, pieceMap)
  }));
}

function getRouteAnalysisVariantOptions(options = {}) {
  // v38: variants.js is the authoritative route-analysis projection. Main only
  // layers non-variant route-economy tuning values and Act Fast's chosen mode on
  // top of that projection. This prevents registry mechanics such as Set to Kill,
  // Set to Stun, Repair Stations, or Less Foreshadowing from silently disappearing
  // in a second hand-maintained option list.
  const variantOptions = applyVariantAnalysisOptions({}, options);
  return {
    ...variantOptions,
    actFastMode: options.actFastMode ?? null,
    routeAwareBatteryScoring: options.routeAwareBatteryScoring,
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy ?? variantOptions.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta ?? variantOptions.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards ?? variantOptions.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta ?? variantOptions.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy ?? variantOptions.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn ?? variantOptions.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn ?? variantOptions.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost ?? variantOptions.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate ?? variantOptions.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall ?? variantOptions.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy ?? variantOptions.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn ?? variantOptions.routeRegistersPerTurn
  };
}

function getPayToWinTrafficScaleMultiplier(playerCount = 4) {
  return clamp((playerCount || 4) / 4, 0.5, 1);
}

function getPayToWinAnalysisOptions(options = {}, playerCount = 4) {
  return options.payToWin
    ? {
      ...options,
      trafficScaleMultiplier: getPayToWinTrafficScaleMultiplier(playerCount)
    }
    : options;
}

function getRouteEconomyReserveSamples(config) {
  if (!(config.maxEnergy > 0)) return [];
  const candidates = [1, config.startingEnergy, 6]
    .map((energy) => clamp(Math.floor(Number(energy) || 0), 0, Math.max(0, config.maxEnergy - 1)));
  return [...new Set(candidates)].sort((a, b) => a - b);
}

function buildRouteEnergyEconomyShadow(tileMap, startAnalyses = [], options = {}, benchmark = null) {
  const config = getRouteEnergyEconomyConfig(options);
  const routes = (startAnalyses || [])
    .map((analysis) => ({ index: analysis?.index, route: analysis?.fullCourseRoute }))
    .filter((entry) => entry.route && Array.isArray(entry.route.transitions) && entry.route.transitions.length);
  const medianActions = medianValue(routes.map((entry) => entry.route.actions ?? entry.route.transitions.length));
  const representative = routes.length
    ? [...routes].sort((a, b) => Math.abs((a.route.actions ?? a.route.transitions.length) - medianActions) - Math.abs((b.route.actions ?? b.route.transitions.length) - medianActions))[0]
    : null;
  const route = representative?.route ?? null;
  const horizonTurns = Number(benchmark?.medianFullCourseTurns) > 0
    ? Number(benchmark.medianFullCourseTurns)
    : (route ? route.transitions.length / config.registersPerTurn : 0);
  const registerScore = Number(benchmark?.registerScoreMedian) > 0 ? Number(benchmark.registerScoreMedian) : null;
  // P2W no longer uses a generic marginal-energy curve. Final pricing replays
  // each coherent route under the actual v45 cards+Energy state after payment.
  const p2wMarginals = [];
  const timeZeroLevels = Array.from({ length: config.maxEnergy + 1 }, (_, energy) => ({
    energy,
    utilityR: Number(getRouteUpgradePotential(
      energy,
      horizonTurns,
      config.startingUpgradeCards,
      options,
      horizonTurns
    ).toFixed(3))
  }));
  const reserveSamples = getRouteEconomyReserveSamples(config);
  const waitRegisterTurns = 1 / config.registersPerTurn;
  const waitTempoCostR = registerScore
    ? Number((Number(benchmark?.registerTempoCost ?? registerScore) / registerScore).toFixed(3))
    : null;
  const battery = [];
  const chopShop = [];
  const powerUp = [];
  const buildEnergySensitivity = (remainingTurns, initialRemaining) => reserveSamples.map((energy) => ({
    energy,
    valueR: Number(getRouteMarginalEnergyUtility(
      energy,
      remainingTurns,
      initialRemaining,
      options,
      horizonTurns
    ).plus.toFixed(3))
  }));
  if (route) {
    const seenBattery = new Set();
    const seenChopShop = new Set();
    const visitPoints = (transition) => {
      const points = [];
      const add = (point) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const key = `${point.x},${point.y}`;
        if (!points.some((item) => item.key === key)) points.push({ key, x: point.x, y: point.y });
      };
      add(transition?.from);
      (transition?.traversed || []).forEach((step) => { add(step?.from); add(step?.to); });
      add(transition?.to);
      return points;
    };
    const actionHistory = Array.isArray(route.actionHistory)
      ? route.actionHistory
      : route.transitions.map((item) => item?.action).filter(Boolean);
    route.transitions.forEach((transition, index) => {
      // Preserve the existing route-point treatment for Chop Shops.
      const elapsedTurns = index / config.registersPerTurn;
      const remainingTurns = Math.max(0, horizonTurns - elapsedTurns);
      const initialRemaining = estimateInitialUpgradeOpportunitiesRemaining(elapsedTurns, horizonTurns, config);
      visitPoints(transition).forEach((point) => {
        const features = tileMap?.get?.(point.key)?.features || [];
        if (features.some((feature) => feature.type === "chopShop") && !seenChopShop.has(point.key)) {
          seenChopShop.add(point.key);
          const reserveSensitivity = reserveSamples.map((energy) => {
            const energyOptionR = getRouteMarginalEnergyUtility(
              energy,
              remainingTurns,
              initialRemaining,
              options,
              horizonTurns
            ).plus;
            const cardOptionR = Math.max(0,
              getRouteUpgradePotential(energy, remainingTurns, initialRemaining + 1, options, horizonTurns) -
              getRouteUpgradePotential(energy, remainingTurns, initialRemaining, options, horizonTurns)
            );
            return {
              energy,
              energyOptionR: Number(energyOptionR.toFixed(3)),
              cardOptionR: Number(cardOptionR.toFixed(3)),
              shadowR: Number(Math.max(energyOptionR, cardOptionR).toFixed(3)),
              choice: cardOptionR > energyOptionR + 1e-9 ? "card" : "energy"
            };
          });
          chopShop.push({
            turn: Number(elapsedTurns.toFixed(2)),
            remainingTurns: Number(remainingTurns.toFixed(2)),
            initialUpgradeOpportunities: initialRemaining,
            reserveSensitivity,
            staticRouteWeight: getUpgradeFeaturePenaltyForAudit("chopShop", options, Boolean(options.upgradeWorld))
          });
        }
      });

      // Battery energy is collected at the post-register landing boundary. Merely
      // crossing a Battery during a movement transition does not create a charging
      // opportunity for the following Power Up register.
      const landing = transition?.to;
      if (!landing || !Number.isFinite(landing.x) || !Number.isFinite(landing.y)) return;
      const landingKey = `${landing.x},${landing.y}`;
      const landingFeatures = tileMap?.get?.(landingKey)?.features || [];
      if (!landingFeatures.some((feature) => feature.type === "battery")) return;

      const batteryElapsedTurns = (index + 1) / config.registersPerTurn;
      const batteryRemainingTurns = Math.max(0, horizonTurns - batteryElapsedTurns);
      const batteryInitialRemaining = estimateInitialUpgradeOpportunitiesRemaining(
        batteryElapsedTurns,
        horizonTurns,
        config
      );
      const encounterKey = `${landingKey}:${index}`;
      if (seenBattery.has(encounterKey)) return;
      seenBattery.add(encounterKey);

      const boundaryAbsoluteActions = index + 1;
      const priorHistory = actionHistory.slice(0, boundaryAbsoluteActions);
      const programFeasibility = typeof summarizePowerUpProgramFeasibility === "function"
        ? summarizePowerUpProgramFeasibility(priorHistory, boundaryAbsoluteActions)
        : null;
      const powerUpLegal = programFeasibility
        ? Boolean(programFeasibility.powerUp?.feasible)
        : true;
      const powerUpAgainLegal = programFeasibility
        ? Boolean(programFeasibility.powerUpAgain?.feasible)
        : ((boundaryAbsoluteActions + 1) % config.registersPerTurn) !== 0;
      const powerUpReason = programFeasibility?.powerUp?.reason ?? null;
      const powerUpAgainReason = programFeasibility?.powerUpAgain?.reason ?? null;
      const powerUpPressure = powerUpLegal && typeof summarizeProgramSequencePressure === "function"
        ? summarizeProgramSequencePressure(priorHistory, boundaryAbsoluteActions, ["WAIT"], options)
        : null;
      const powerUpAgainPressure = powerUpAgainLegal && typeof summarizeProgramSequencePressure === "function"
        ? summarizeProgramSequencePressure(priorHistory, boundaryAbsoluteActions, ["WAIT", "WAIT"], options)
        : null;
      const powerUpCardPressureR = registerScore && Number.isFinite(powerUpPressure?.penalty)
        ? Number((powerUpPressure.penalty / registerScore).toFixed(3))
        : null;
      const powerUpAgainCardPressureR = registerScore && Number.isFinite(powerUpAgainPressure?.penalty)
        ? Number((powerUpAgainPressure.penalty / registerScore).toFixed(3))
        : null;
      const reserveSensitivity = reserveSamples.map((energy) => {
        const arrivalValueR = getRouteEnergyGainUtility(
          energy,
          1,
          batteryRemainingTurns,
          batteryInitialRemaining,
          options,
          horizonTurns
        );
        // The reserve sample is the pre-arrival reserve. The Battery's +1E happens
        // first; Power Up/Again values below are additional charging opportunities
        // from the resulting reserve.
        const energyAfterArrival = clamp(energy + 1, 0, config.maxEnergy);
        const powerUpElapsed = batteryElapsedTurns + waitRegisterTurns;
        const powerUpRemaining = Math.max(0, horizonTurns - powerUpElapsed);
        const powerUpInitialRemaining = estimateInitialUpgradeOpportunitiesRemaining(
          powerUpElapsed,
          horizonTurns,
          config
        );
        const powerUpEnergyR = powerUpLegal
          ? getRouteEnergyGainUtility(
            energyAfterArrival,
            2,
            powerUpRemaining,
            powerUpInitialRemaining,
            options,
            horizonTurns
          )
          : null;
        const energyAfterPowerUp = clamp(energyAfterArrival + 2, 0, config.maxEnergy);
        const againElapsed = powerUpElapsed + waitRegisterTurns;
        const againRemaining = Math.max(0, horizonTurns - againElapsed);
        const againInitialRemaining = estimateInitialUpgradeOpportunitiesRemaining(
          againElapsed,
          horizonTurns,
          config
        );
        const againAdditionalEnergyR = powerUpAgainLegal
          ? getRouteEnergyGainUtility(
            energyAfterPowerUp,
            2,
            againRemaining,
            againInitialRemaining,
            options,
            horizonTurns
          )
          : null;
        const powerUpAgainEnergyR = powerUpAgainLegal && Number.isFinite(powerUpEnergyR) && Number.isFinite(againAdditionalEnergyR)
          ? powerUpEnergyR + againAdditionalEnergyR
          : null;
        const oneTempoR = Number.isFinite(waitTempoCostR) ? waitTempoCostR : null;
        const twoTempoR = Number.isFinite(waitTempoCostR) ? waitTempoCostR * 2 : null;
        const powerUpNetR = powerUpLegal && Number.isFinite(powerUpEnergyR) && Number.isFinite(oneTempoR) && Number.isFinite(powerUpCardPressureR)
          ? powerUpEnergyR - oneTempoR - powerUpCardPressureR
          : null;
        const powerUpAgainNetR = powerUpAgainLegal && Number.isFinite(twoTempoR) && Number.isFinite(powerUpAgainCardPressureR)
          ? powerUpAgainEnergyR - twoTempoR - powerUpAgainCardPressureR
          : null;
        return {
          energy,
          arrivalValueR: Number(arrivalValueR.toFixed(3)),
          powerUpLegal,
          powerUpReason,
          powerUpEnergyR: Number.isFinite(powerUpEnergyR) ? Number(powerUpEnergyR.toFixed(3)) : null,
          powerUpCardPressureR,
          powerUpNetBeforePositionR: Number.isFinite(powerUpNetR)
            ? Number(powerUpNetR.toFixed(3))
            : null,
          powerUpAgainLegal,
          powerUpAgainReason,
          powerUpAgainEnergyR: Number.isFinite(powerUpAgainEnergyR) ? Number(powerUpAgainEnergyR.toFixed(3)) : null,
          powerUpAgainAdditionalEnergyR: Number.isFinite(againAdditionalEnergyR) ? Number(againAdditionalEnergyR.toFixed(3)) : null,
          powerUpAgainCardPressureR,
          powerUpAgainNetBeforePositionR: Number.isFinite(powerUpAgainNetR)
            ? Number(powerUpAgainNetR.toFixed(3))
            : null
        };
      });
      battery.push({
        turn: Number(batteryElapsedTurns.toFixed(2)),
        remainingTurns: Number(batteryRemainingTurns.toFixed(2)),
        initialUpgradeOpportunities: batteryInitialRemaining,
        nextRegister: programFeasibility?.nextRegister ?? ((boundaryAbsoluteActions % config.registersPerTurn) + 1),
        waitRegisterTurns: Number(waitRegisterTurns.toFixed(3)),
        waitTempoCostR,
        currentProgramFeasible: programFeasibility?.currentProgramFeasible ?? null,
        currentProgramRequiresAgain: programFeasibility?.currentProgramRequiresAgain ?? null,
        powerUpLegal,
        powerUpReason,
        powerUpCardPressureR,
        powerUpAgainCardPressureR,
        powerUpAgainLegal,
        powerUpAgainReason,
        reserveSensitivity,
        staticRouteWeight: getUpgradeFeaturePenaltyForAudit("battery", options, Boolean(options.upgradeWorld))
      });
    });
    const sampleCount = Math.min(5, route.transitions.length);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const index = Math.min(route.transitions.length - 1, Math.floor(((sample + 0.5) * route.transitions.length) / sampleCount));
      const elapsedTurns = index / config.registersPerTurn;
      const remainingTurns = Math.max(0, horizonTurns - elapsedTurns);
      const initialRemaining = estimateInitialUpgradeOpportunitiesRemaining(elapsedTurns, horizonTurns, config);
      const strategicScore = Number(benchmark?.powerUpStrategicDeltaMedian);
      powerUp.push({
        turn: Number(elapsedTurns.toFixed(2)),
        remainingTurns: Number(remainingTurns.toFixed(2)),
        initialUpgradeOpportunities: initialRemaining,
        reserveSensitivity: buildEnergySensitivity(remainingTurns, initialRemaining),
        waitTempoCostR,
        strategicDeltaR: registerScore && Number.isFinite(strategicScore) ? Number((strategicScore / registerScore).toFixed(3)) : null
      });
    }
  }
  const selectedPoints = [0, 0.5, 0.9].map((fraction) => {
    const elapsed = horizonTurns * fraction;
    const remainingTurns = Math.max(0, horizonTurns - elapsed);
    const initialOps = estimateInitialUpgradeOpportunitiesRemaining(elapsed, horizonTurns, config);
    const detail = evaluateRouteUpgradePotential(
      config.startingEnergy,
      remainingTurns,
      initialOps,
      options,
      horizonTurns
    );
    return {
      turn: Number(elapsed.toFixed(2)),
      remainingTurns: Number(remainingTurns.toFixed(2)),
      initialUpgradeOpportunities: initialOps,
      installCapacity: detail.installCapacity,
      initialInstallCapacity: detail.initialInstallCapacity,
      futureInstallCapacity: detail.futureInstallCapacity,
      levels: Array.from({ length: config.maxEnergy + 1 }, (_, energy) => Number(getRouteUpgradePotential(
        energy,
        remainingTurns,
        initialOps,
        options,
        horizonTurns
      ).toFixed(3)))
    };
  });
  return {
    active: true,
    method: "route-energy-conversion-shadow-v1.2",
    representativeStartIndex: representative?.index ?? null,
    config,
    horizonTurns: Number(horizonTurns.toFixed(2)),
    registerScore,
    reserveSamples,
    p2wMarginals,
    timeZeroLevels,
    selectedPoints,
    battery,
    powerUp,
    chopShop
  };
}



function buildCourseEnergyEconomyDiagnostics(scenario) {
  if (!scenario?.goalTileMap || scenario.lighterGame) return null;
  const firstLeg = scenario.sequence?.firstLeg;
  const routeStarts = (firstLeg?.starts || []).filter((item) => (
    item?.reachable && item?.fullCourseRoute && Array.isArray(item.fullCourseRoute.transitions) && item.fullCourseRoute.transitions.length
  ));
  if (!routeStarts.length) return null;

  const options = {
    ...(scenario.preferences || {}),
    playerCount: scenario.playerCount ?? scenario.preferences?.playerCount,
    upgradeWorld: Boolean(scenario.upgradeWorld ?? scenario.preferences?.upgradeWorld),
    payToWin: Boolean(scenario.payToWin || scenario.subsidizedStarts),
    subsidizedStarts: Boolean(scenario.subsidizedStarts)
  };
  const benchmark = typeof summarizePowerUpOpportunityBenchmark === "function"
    ? summarizePowerUpOpportunityBenchmark(
      scenario.goalTileMap,
      routeStarts,
      firstLeg?.flags || scenario.checkpoints || [],
      options
    )
    : null;
  const config = getRouteEnergyEconomyConfig(options);
  const encounters = [];

  routeStarts.forEach((startAnalysis) => {
    const route = startAnalysis.fullCourseRoute;
    const routeTurns = (route.actions ?? route.transitions.length) / config.registersPerTurn;
    const routeBenchmark = benchmark
      ? { ...benchmark, medianFullCourseActions: route.actions ?? route.transitions.length, medianFullCourseTurns: routeTurns }
      : null;
    const routeShadow = buildRouteEnergyEconomyShadow(
      scenario.goalTileMap,
      [startAnalysis],
      options,
      routeBenchmark
    );
    (routeShadow.battery || []).forEach((battery) => {
      const progress = routeShadow.horizonTurns > 0 ? battery.turn / routeShadow.horizonTurns : 0;
      encounters.push({
        ...battery,
        startIndex: startAnalysis.index,
        horizonTurns: routeShadow.horizonTurns,
        progress: Number(clamp(progress, 0, 1).toFixed(3))
      });
    });
  });

  const sorted = [...encounters].sort((a, b) => a.progress - b.progress || a.turn - b.turn || a.startIndex - b.startIndex);
  const representative = [];
  const addUnique = (entry) => {
    if (!entry) return;
    const key = `${entry.startIndex}:${entry.turn}:${entry.remainingTurns}`;
    if (!representative.some((item) => `${item.startIndex}:${item.turn}:${item.remainingTurns}` === key)) {
      representative.push(entry);
    }
  };
  if (sorted.length) {
    addUnique(sorted[0]);
    addUnique([...sorted].sort((a, b) => Math.abs(a.progress - 0.5) - Math.abs(b.progress - 0.5))[0]);
    addUnique(sorted[sorted.length - 1]);
  }
  representative.sort((a, b) => a.progress - b.progress || a.turn - b.turn);

  const medianActions = medianValue(routeStarts.map((entry) => entry.fullCourseRoute.actions ?? entry.fullCourseRoute.transitions.length));
  const medianTurns = medianActions / config.registersPerTurn;
  const productionMetadata = scenario.sequence?.firstLeg?.summary?.coursePreflight?.routeAwareBatteryScoring ?? null;
  const productionRewardScores = routeStarts
    .map((entry) => Number(
      entry.fullCourseRoute?.routeEnergyEconomyRewardScore ??
      entry.fullCourseRoute?.batteryEconomyRewardScore
    ))
    .filter(Number.isFinite);
  const productionBatteryRewardScores = routeStarts
    .map((entry) => Number(entry.fullCourseRoute?.batteryEconomyRewardScore))
    .filter(Number.isFinite);
  const productionPowerUpRewardScores = routeStarts
    .map((entry) => Number(entry.fullCourseRoute?.powerUpEconomyRewardScore))
    .filter(Number.isFinite);
  const productionChopShopRewardScores = routeStarts
    .map((entry) => Number(entry.fullCourseRoute?.chopShopEconomyRewardScore))
    .filter(Number.isFinite);
  const productionPowerUpUses = routeStarts
    .map((entry) => (entry.fullCourseRoute?.transitions ?? []).filter(
      (transition) => transition?.action === "WAIT"
    ).length)
    .filter(Number.isFinite);
  const productionOpeningReserves = routeStarts.map((entry) => Number(entry.fullCourseRoute?.routeEnergyShadowReserveStart)).filter(Number.isFinite);
  const productionEndingReserves = routeStarts
    .map((entry) => entry.fullCourseRoute?.routeEnergyShadowReserveEnd)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  const overallShadow = buildRouteEnergyEconomyShadow(
    scenario.goalTileMap,
    routeStarts,
    options,
    benchmark ? { ...benchmark, medianFullCourseActions: medianActions, medianFullCourseTurns: medianTurns } : null
  );

  return {
    active: true,
    method: "course-route-upgrade-economy-diagnostics-v18-flat",
    routeCount: routeStarts.length,
    productionEnergyScoring: productionMetadata
      ? {
        ...productionMetadata,
        selectedRouteRewardMedian: productionRewardScores.length
          ? Number(medianValue(productionRewardScores).toFixed(2))
          : 0,
        selectedRouteRewardMax: productionRewardScores.length
          ? Number(Math.max(...productionRewardScores).toFixed(2))
          : 0,
        selectedRouteBatteryRewardMedian: productionBatteryRewardScores.length
          ? Number(medianValue(productionBatteryRewardScores).toFixed(2))
          : 0,
        selectedRouteBatteryRewardMax: productionBatteryRewardScores.length
          ? Number(Math.max(...productionBatteryRewardScores).toFixed(2))
          : 0,
        selectedRoutePowerUpRewardMedian: productionPowerUpRewardScores.length
          ? Number(medianValue(productionPowerUpRewardScores).toFixed(2))
          : 0,
        selectedRoutePowerUpRewardMax: productionPowerUpRewardScores.length
          ? Number(Math.max(...productionPowerUpRewardScores).toFixed(2))
          : 0,
        selectedRouteChopShopRewardMedian: productionChopShopRewardScores.length ? Number(medianValue(productionChopShopRewardScores).toFixed(2)) : 0,
        selectedRouteChopShopRewardMax: productionChopShopRewardScores.length ? Number(Math.max(...productionChopShopRewardScores).toFixed(2)) : 0,
        selectedRouteOpeningReserveMedian: productionOpeningReserves.length ? Number(medianValue(productionOpeningReserves).toFixed(2)) : null,
        selectedRoutePowerUpUsesMedian: productionPowerUpUses.length
          ? Number(medianValue(productionPowerUpUses).toFixed(2))
          : 0,
        selectedRoutePowerUpUsesMax: productionPowerUpUses.length
          ? Math.max(...productionPowerUpUses)
          : 0,
        selectedRouteEndingReserveMedian: productionEndingReserves.length
          ? Number(medianValue(productionEndingReserves).toFixed(2))
          : config.startingEnergy,
        selectedRouteEndingReserveMax: productionEndingReserves.length
          ? Number(Math.max(...productionEndingReserves).toFixed(2))
          : config.startingEnergy
      }
      : null,
    batteryEncounterCount: encounters.length,
    batteryRouteCount: new Set(encounters.map((entry) => entry.startIndex)).size,
    config,
    horizonTurns: overallShadow.horizonTurns,
    reserveSamples: overallShadow.reserveSamples,
    representativeBatteryEncounters: representative,
    selectedPoints: overallShadow.selectedPoints,
    benchmark,
    featureWeights: buildUpgradeFeatureWeightAudit(options)
  };
}

function getUpgradeFeaturePenaltyForAudit(featureType, options = {}, upgradeWorld = false) {
  try {
    const value = getTilePenaltyForFeature(
      { type: featureType },
      {
        ...options,
        batteryActive: true,
        lighterGame: false,
        upgradeWorld
      }
    );
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  } catch {
    return null;
  }
}

function buildUpgradeFeatureWeightAudit(options = {}) {
  const currentUpgradeWorld = Boolean(options.upgradeWorld);
  return {
    active: true,
    currentUpgradeWorld,
    battery: {
      base: getUpgradeFeaturePenaltyForAudit("battery", options, false),
      upgradeWorld: getUpgradeFeaturePenaltyForAudit("battery", options, true),
      current: getUpgradeFeaturePenaltyForAudit("battery", options, currentUpgradeWorld)
    },
    chopShop: {
      base: getUpgradeFeaturePenaltyForAudit("chopShop", options, false),
      upgradeWorld: getUpgradeFeaturePenaltyForAudit("chopShop", options, true),
      current: getUpgradeFeaturePenaltyForAudit("chopShop", options, currentUpgradeWorld)
    }
  };
}

function isSubsidizedStartsPricing(options = {}) {
  return Boolean(options.subsidizedStarts);
}

function getStartEnergyAdjustmentLimit(options = {}) {
  const startingEnergy = getCourseStartingEnergy(options);
  if (isSubsidizedStartsPricing(options)) {
    return Math.max(0, getCourseMaxEnergy(options) - startingEnergy);
  }
  return startingEnergy;
}

function getPayToWinDenialCost(options = {}) {
  // Kept under the mature P2W helper name because the pricing/pruning engine is
  // shared. For Subsidized Starts this is max subsidy + 1, i.e. 8E with the
  // standard 3E start and 10E storage cap.
  return getStartEnergyAdjustmentLimit(options) + 1;
}

function chooseSubsidizedStartAdjustment(paymentScores, baselineFullScore, maxAdjustment, denialCost) {
  const epsilon = 1e-9;
  const candidates = [];
  let canReachBaseline = false;

  // Include +0E in the closest-match candidates. A weak start may remain
  // slightly below the baseline when its first subsidy point has no modeled
  // benefit; in that case compensation should stay at +0E rather than grant
  // Energy that does not improve the balance. +1..max still determine whether
  // the start can be compensated at all.
  for (let adjustment = 0; adjustment <= maxAdjustment; adjustment += 1) {
    const postAdjustmentScore = Number(paymentScores?.[adjustment]);
    if (!Number.isFinite(postAdjustmentScore)) continue;

    // Lower full-course score is better. Positive delta means this start is
    // still weaker than the 0E baseline; negative means the subsidy has made
    // it stronger. A start is only offerable when the available storage cap
    // can reach/cross the baseline at least once.
    const delta = postAdjustmentScore - baselineFullScore;
    if (adjustment > 0 && delta <= epsilon) canReachBaseline = true;
    candidates.push({
      adjustment,
      delta,
      absoluteGap: Math.abs(delta),
      nonOvercompensating: delta >= -epsilon
    });
  }

  if (!canReachBaseline || !candidates.length) {
    return denialCost;
  }

  candidates.sort((left, right) => {
    const gapDifference = left.absoluteGap - right.absoluteGap;
    if (Math.abs(gapDifference) > epsilon) return gapDifference;

    // If two integer subsidies are equally close, do not make the start
    // stronger than the baseline when an equally good under-compensation
    // exists. If the modeled result is otherwise identical, use the lower
    // subsidy: Subsidized Starts is compensation, not a reason to grant Energy
    // that the shared economy says adds no balancing value.
    if (left.nonOvercompensating !== right.nonOvercompensating) {
      return left.nonOvercompensating ? -1 : 1;
    }
    return left.adjustment - right.adjustment;
  });

  return candidates[0].adjustment;
}

function getPayToWinRemovalBias(options = {}) {
  let bias = 0;
  // Endpoint pruning is the priced-start setup's one deliberate freedom to
  // reshape the offered course. Length is the primary reason for choosing which
  // end to trim; difficulty is a weaker tiebreaker.
  if (options.length === "short") {
    bias += 2;
  } else if (options.length === "long" || options.length === "epic") {
    bias -= 2;
  }

  if (options.difficulty === "easy") {
    bias += 1;
  } else if (options.difficulty === "hard" || options.difficulty === "brutal") {
    bias -= 1;
  }

  return bias;
}

function getPayToWinFullCourseScore(startAnalysis) {
  if (!startAnalysis?.fullCourseRoute) return null;
  const routeScore = Number(
    startAnalysis.courseEstimate?.totalScore ??
    startAnalysis.fullCourseRoute?.score
  );
  const trafficPenalty = Number(
    startAnalysis.courseEstimate?.fullCourseTrafficPenalty ??
    startAnalysis.fullCourseTrafficPenalty ??
    0
  );
  if (!Number.isFinite(routeScore) || !Number.isFinite(trafficPenalty)) {
    return null;
  }
  return routeScore + trafficPenalty;
}

function getPayToWinPricingBenchmark(tileMap, firstLeg, activeStarts, options = {}) {
  const benchmark = typeof summarizePowerUpOpportunityBenchmark === "function"
    ? summarizePowerUpOpportunityBenchmark(
      tileMap,
      activeStarts,
      firstLeg.flags || [],
      {
        ...options,
        payToWin: true,
        // Iterative pricing can run several passes. We only need the robust
        // productive-register scale and horizon here; the much more expensive
        // Power Up counterfactual remains a once-per-course diagnostic.
        skipPowerUpStrategicSamples: true
      }
    )
    : null;
  const fallbackRegisterScores = activeStarts.map((item) => {
    const score = Number(item.fullCourseRoute?.score);
    const actions = Number(item.fullCourseRoute?.actions);
    return Number.isFinite(score) && Number.isFinite(actions) && actions > 0
      ? score / actions
      : null;
  }).filter(Number.isFinite);
  const measuredRegisterScore = Number(benchmark?.registerScoreMedian);
  const registerTempoCost = Number(benchmark?.registerTempoCost);
  const registerScore = measuredRegisterScore > 0
    ? measuredRegisterScore
    : (medianValue(fallbackRegisterScores) || (registerTempoCost > 0 ? registerTempoCost : 6.4));
  const measuredTurns = Number(benchmark?.medianFullCourseTurns);
  const fallbackTurns = medianValue(activeStarts.map((item) => {
    const actions = Number(item.fullCourseRoute?.actions);
    return Number.isFinite(actions) ? actions / 5 : null;
  }));

  return {
    benchmark,
    registerScore: Number(registerScore.toFixed(2)),
    horizonTurns: Number((measuredTurns > 0 ? measuredTurns : fallbackTurns).toFixed(2))
  };
}

function getPayToWinRouteEconomyPricingOptions(firstLeg, options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  const production = firstLeg?.summary?.coursePreflight?.routeAwareBatteryScoring ?? null;
  const retainedRoutes = (firstLeg?.starts ?? [])
    .map((item) => item?.fullCourseRoute)
    .filter((route) => route && Number(route.actions) > 0 && Number.isFinite(Number(route.score)));
  const fallbackHorizonTurns = retainedRoutes.length
    ? medianValue(retainedRoutes.map((route) => Number(route.actions) / config.registersPerTurn))
    : 0;
  const fallbackRegisterScore = retainedRoutes.length
    ? medianValue(retainedRoutes.map((route) => Number(route.score) / Number(route.actions)))
    : 0;
  const horizonTurns = Number(production?.horizonTurns ?? options.routeEnergyHorizonTurns ?? fallbackHorizonTurns);
  const registerScore = Number(production?.registerScore ?? options.routeEnergyRegisterScore ?? fallbackRegisterScore);
  const routeAwareBatteryScoring = Boolean(
    !options.lighterGame && horizonTurns > 0 && registerScore > 0
  );
  return {
    ...options,
    payToWin: true,
    subsidizedStarts: Boolean(options.subsidizedStarts),
    routeAwareBatteryScoring,
    routeEnergyHorizonTurns: horizonTurns,
    routeEnergyRegisterScore: registerScore,
    routeEnergyReferenceReserve: config.startingEnergy,
    startingEnergy: config.startingEnergy,
    startingUpgradeCards: config.startingUpgradeCards,
    maxEnergy: config.maxEnergy,
    upgradeDrawsPerTurn: config.drawsPerTurn,
    upgradeInstallsPerTurn: config.installsPerTurn,
    upgradeDrawEnergyCost: config.drawEnergyCost,
    upgradeUsefulCardRate: config.usefulUpgradeCardRate,
    upgradeUsefulEnergyPerInstall: config.usefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: config.powerRegistersPerEnergy,
    routeRegistersPerTurn: config.registersPerTurn,
    payToWinMaxPayment: config.startingEnergy,
    subsidizedStartsMaxSubsidy: Math.max(0, config.maxEnergy - config.startingEnergy)
  };
}

function buildPayToWinUniformOccupancy(activeStarts, focusIndex, playerCount) {
  const others = activeStarts.filter((item) => item.index !== focusIndex);
  const targetCount = Math.min(
    Math.max(0, (playerCount ?? 1) - 1),
    others.length
  );
  const occupancy = new Map(activeStarts.map((item) => [item.index, 0]));
  occupancy.set(focusIndex, 1);
  if (!others.length || targetCount <= 0) return occupancy;
  const uniform = targetCount / others.length;
  others.forEach((item) => occupancy.set(item.index, uniform));
  return occupancy;
}

function buildPayToWinPaymentScoreCurves(
  firstLeg,
  tileMap,
  activeStarts,
  options = {}
) {
  const pricingOptions = getPayToWinRouteEconomyPricingOptions(firstLeg, options);
  const playerCount = Math.max(1, options.playerCount ?? 4);
  const scoreCurves = new Map();

  activeStarts.forEach((item) => {
    const occupancyByIndex = buildPayToWinUniformOccupancy(
      activeStarts,
      item.index,
      playerCount
    );
    const evaluation = evaluateFullCourseFocusPaymentCurveUnderOccupancy(
      tileMap,
      firstLeg,
      firstLeg.flags || [],
      item.index,
      occupancyByIndex,
      pricingOptions
    );
    const scores = (evaluation?.entries ?? [])
      .sort((left, right) => left.payment - right.payment)
      .map((entry) => entry.fullTotal);
    if (scores.length) {
      scoreCurves.set(item.index, scores);
    } else {
      scoreCurves.set(item.index, [getPayToWinFullCourseScore(item)]);
    }
  });

  return scoreCurves;
}

function buildPayToWinRegisterPricingState(
  activeStarts,
  scoreByIndex,
  pricingBenchmark,
  options = {},
  paymentScoreByIndex = null
) {
  const startingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const subsidizedStarts = isSubsidizedStartsPricing(options);
  const maxAdjustment = getStartEnergyAdjustmentLimit(options);
  const denialCost = getPayToWinDenialCost(options);
  const scoredStarts = activeStarts.map((item) => {
    const rawCurve = paymentScoreByIndex?.get(item.index);
    const overrideScore = scoreByIndex?.get(item.index);
    const curveZero = Array.isArray(rawCurve) ? Number(rawCurve[0]) : null;
    const fullScore = Number.isFinite(overrideScore)
      ? overrideScore
      : Number.isFinite(curveZero)
        ? curveZero
        : getPayToWinFullCourseScore(item);
    const paymentScores = Array.from(
      { length: maxAdjustment + 1 },
      (_, adjustment) => {
        const value = Array.isArray(rawCurve) ? Number(rawCurve[adjustment]) : null;
        return Number.isFinite(value)
          ? value
          : (adjustment === 0 && Number.isFinite(fullScore) ? fullScore : null);
      }
    );
    if (Number.isFinite(fullScore)) paymentScores[0] = fullScore;
    return {
      startAnalysis: item,
      index: item.index,
      adjustedScore: item.adjustedScore,
      fullScore,
      paymentScores
    };
  }).filter((entry) => Number.isFinite(entry.fullScore));

  if (!scoredStarts.length) {
    return {
      entries: [],
      costUnit: pricingBenchmark?.registerScore ?? 1,
      minScore: 0,
      maxScore: 0,
      pricingModel: null
    };
  }

  // Lower full-course score is the stronger/easier start. Pay to Win anchors
  // on the weakest/highest-score start and charges stronger starts. Subsidized
  // Starts anchors on the strongest/lowest-score start and grants Energy to
  // weaker starts until they catch up.
  const baseline = [...scoredStarts].sort((left, right) => (
    subsidizedStarts
      ? left.fullScore - right.fullScore || left.index - right.index
      : right.fullScore - left.fullScore || left.index - right.index
  ))[0];
  const registerScore = Math.max(
    0.01,
    Number(pricingBenchmark?.registerScore) || 6.4
  );
  const entries = scoredStarts.map((entry) => {
    const advantage = subsidizedStarts
      ? Math.max(0, entry.fullScore - baseline.fullScore)
      : Math.max(0, baseline.fullScore - entry.fullScore);
    const registerEquivalent = advantage / registerScore;
    let energyCost = 0;

    if (advantage > 1e-9) {
      if (subsidizedStarts) {
        // Subsidies are discrete and the card-aware fixed-route economy is
        // intentionally nonlinear/plateaued. Choose the available integer subsidy whose
        // post-subsidy route value is closest to the 0E baseline, while still
        // requiring that the +max storage-cap subsidy can compensate the start
        // at all. This avoids systematically taking the first overshoot.
        energyCost = chooseSubsidizedStartAdjustment(
          entry.paymentScores,
          baseline.fullScore,
          maxAdjustment,
          denialCost
        );
      } else {
        energyCost = denialCost;
        for (let adjustment = 1; adjustment <= maxAdjustment; adjustment += 1) {
          const postAdjustmentScore = Number(entry.paymentScores[adjustment]);
          const balanced = Number.isFinite(postAdjustmentScore) &&
            postAdjustmentScore + 1e-9 >= baseline.fullScore;
          if (balanced) {
            energyCost = adjustment;
            break;
          }
        }
      }
    }

    const payable = energyCost <= maxAdjustment;
    const evaluatedAdjustment = payable ? energyCost : maxAdjustment;
    const postPaymentFullScore = Number(entry.paymentScores[evaluatedAdjustment]);
    const paymentPenalty = Number.isFinite(postPaymentFullScore)
      ? subsidizedStarts
        ? Math.max(0, entry.fullScore - postPaymentFullScore)
        : Math.max(0, postPaymentFullScore - entry.fullScore)
      : null;
    const remainingAdvantage = Number.isFinite(postPaymentFullScore)
      ? subsidizedStarts
        ? Math.max(0, postPaymentFullScore - baseline.fullScore)
        : Math.max(0, baseline.fullScore - postPaymentFullScore)
      : advantage;

    return {
      ...entry,
      advantage: Number(advantage.toFixed(2)),
      registerEquivalent: Number(registerEquivalent.toFixed(2)),
      energyCost,
      postPaymentFullScore: Number.isFinite(postPaymentFullScore)
        ? Number(postPaymentFullScore.toFixed(2))
        : null,
      paymentPenalty: Number.isFinite(paymentPenalty)
        ? Number(paymentPenalty.toFixed(2))
        : null,
      remainingAdvantage: Number(remainingAdvantage.toFixed(2)),
      remainingRegisterEquivalent: Number((remainingAdvantage / registerScore).toFixed(2)),
      postAdjustmentDeltaScore: Number.isFinite(postPaymentFullScore)
        ? Number((postPaymentFullScore - baseline.fullScore).toFixed(2))
        : null,
      postAdjustmentDeltaRegisters: Number.isFinite(postPaymentFullScore)
        ? Number(((postPaymentFullScore - baseline.fullScore) / registerScore).toFixed(3))
        : null,
      paymentScores: entry.paymentScores.map((value) => (
        Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null
      ))
    };
  });

  const paymentPenalties = [];
  for (let adjustment = 1; adjustment <= maxAdjustment; adjustment += 1) {
    const impacts = scoredStarts.map((entry) => {
      const after = Number(entry.paymentScores[adjustment]);
      if (!Number.isFinite(after)) return null;
      return subsidizedStarts
        ? Math.max(0, entry.fullScore - after)
        : Math.max(0, after - entry.fullScore);
    }).filter(Number.isFinite);
    paymentPenalties.push({
      payment: adjustment,
      medianScore: impacts.length
        ? Number(medianValue(impacts).toFixed(2))
        : null,
      maxScore: impacts.length
        ? Number(Math.max(...impacts).toFixed(2))
        : null,
      medianRegisters: impacts.length
        ? Number((medianValue(impacts) / registerScore).toFixed(3))
        : null,
      maxRegisters: impacts.length
        ? Number((Math.max(...impacts) / registerScore).toFixed(3))
        : null
    });
  }

  const pricingModel = {
    method: subsidizedStarts
      ? "moving-baseline-card-aware-subsidy-v37"
      : "moving-baseline-card-aware-payment-v37",
    mode: subsidizedStarts ? "subsidy" : "payment",
    baselineIndex: baseline.index,
    baselineFullScore: Number(baseline.fullScore.toFixed(2)),
    registerScore,
    horizonTurns: pricingBenchmark?.horizonTurns ?? null,
    startingEnergy,
    maxEnergy,
    maxAdjustment,
    maxSubsidy: subsidizedStarts ? maxAdjustment : 0,
    denialCost,
    paymentPenalties,
    maxRegisterAdvantage: Number(Math.max(
      0,
      ...entries.map((entry) => entry.registerEquivalent)
    ).toFixed(2))
  };

  return {
    entries,
    costUnit: registerScore,
    minScore: Math.min(...scoredStarts.map((entry) => entry.fullScore)),
    maxScore: Math.max(...scoredStarts.map((entry) => entry.fullScore)),
    pricingModel
  };
}

function summarizePricedStartResidualBalance(entries = [], denialCost = Infinity, playerCount = 1, options = {}) {
  const costKey = options.costKey ?? "energyCost";
  const scoreKey = options.scoreKey ?? "postPaymentFullScore";
  const offered = entries.filter((entry) => (
    Number(entry?.[costKey]) < denialCost &&
    Number.isFinite(Number(entry?.[scoreKey]))
  ));
  const balanceEntries = offered.map((entry) => ({
    index: entry.index,
    balanceScore: Number(entry[scoreKey]),
    bestActions: Number(entry.startAnalysis?.fullCourseRoute?.actions ?? entry.startAnalysis?.bestActions),
    startAnalysis: entry.startAnalysis
  }));
  const stddev = getNormalStartDispersion(balanceEntries, "balanceScore");

  // v37b: Energy pricing is explicitly allowed to trade starting resources
  // against physical route advantage/disadvantage. Normal's action-z guard is
  // therefore not an independent rejection test here: using it after pricing
  // double-counts the same long/short route difference that the Energy curve
  // has just compensated. Keep action spread as a diagnostic, while residual
  // acceptance is judged by the post-adjustment score distribution itself.
  const scoreStats = getRobustOutlierStats(balanceEntries, "balanceScore");
  const minimumScoreDelta = Math.max(5, Math.abs(scoreStats.center) * 0.08);
  const outliers = balanceEntries
    .map((entry) => {
      const scoreDelta = entry.balanceScore - scoreStats.center;
      const scoreZ = Math.abs(scoreDelta) / scoreStats.robustScale;
      return { entry, scoreDelta, scoreZ };
    })
    .filter((item) => (
      item.scoreZ >= FULL_START_OUTLIER_Z &&
      Math.abs(item.scoreDelta) >= minimumScoreDelta
    ))
    .sort((left, right) => (
      right.scoreZ - left.scoreZ ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));
  const scores = balanceEntries.map((entry) => entry.balanceScore).filter(Number.isFinite);
  const actions = balanceEntries.map((entry) => entry.bestActions).filter(Number.isFinite);
  const minScore = scores.length ? Math.min(...scores) : null;
  const maxScore = scores.length ? Math.max(...scores) : null;
  const minActions = actions.length ? Math.min(...actions) : null;
  const maxActions = actions.length ? Math.max(...actions) : null;
  const acceptable = (
    offered.length >= Math.max(1, playerCount || 1) &&
    stddev <= NORMAL_START_FAIRNESS_STDDEV_LIMIT + 1e-9 &&
    outliers.length === 0
  );

  return {
    offeredCount: offered.length,
    stddev: Number(stddev.toFixed(2)),
    limit: NORMAL_START_FAIRNESS_STDDEV_LIMIT,
    outlierCount: outliers.length,
    outlierIndices: outliers.map((item) => item.entry.index),
    minScore: Number.isFinite(minScore) ? Number(minScore.toFixed(2)) : null,
    maxScore: Number.isFinite(maxScore) ? Number(maxScore.toFixed(2)) : null,
    scoreRange: Number.isFinite(minScore) && Number.isFinite(maxScore)
      ? Number((maxScore - minScore).toFixed(2))
      : null,
    actionMin: Number.isFinite(minActions) ? minActions : null,
    actionMax: Number.isFinite(maxActions) ? maxActions : null,
    actionRange: Number.isFinite(minActions) && Number.isFinite(maxActions)
      ? maxActions - minActions
      : null,
    actionRangeDiagnosticOnly: true,
    acceptable
  };
}

function getPayToWinCostEntries(firstLeg, tileMap, excludedIndices = new Set(), options = {}) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    item.fullCourseRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));

  if (!activeStarts.length) {
    return { entries: [], costUnit: 1, minScore: 0, maxScore: 0, pricingModel: null };
  }

  const pricingBenchmark = getPayToWinPricingBenchmark(
    tileMap,
    firstLeg,
    activeStarts,
    options
  );
  const paymentScoreByIndex = buildPayToWinPaymentScoreCurves(
    firstLeg,
    tileMap,
    activeStarts,
    options
  );
  return buildPayToWinRegisterPricingState(
    activeStarts,
    null,
    pricingBenchmark,
    options,
    paymentScoreByIndex
  );
}


// These are model-selection guards, not energy-price thresholds. They prevent a
// mathematically optimal but strategically trivial breakpoint from creating a
// second printed cost merely because of traffic noise near an integer boundary.
const PAY_TO_WIN_SELECTOR_SPLIT_MIN_GAIN_R = 0.05;
const PAY_TO_WIN_SELECTOR_SPLIT_MIN_RELATIVE_GAIN = 0.22;
const PAY_TO_WIN_SELECTOR_SPLIT_MIN_SEPARATION_R = 0.16;

function getPayToWinSelectorSurplusConfig(startCount, playerCount) {
  const safePlayerCount = Math.max(1, playerCount ?? 1);
  return {
    playerCount: safePlayerCount,
    surplusStarts: Math.max(0, startCount - safePlayerCount)
  };
}

function getPayToWinProfileDistance(leftState, rightState) {
  const rightByIndex = new Map((rightState?.entries ?? []).map((entry) => [
    entry.index,
    entry.registerEquivalent
  ]));
  const deltas = (leftState?.entries ?? []).map((entry) => {
    const rightValue = rightByIndex.get(entry.index);
    return Number.isFinite(entry.registerEquivalent) && Number.isFinite(rightValue)
      ? Math.abs(entry.registerEquivalent - rightValue)
      : null;
  }).filter(Number.isFinite);

  if (!deltas.length) return 0;
  const sorted = deltas.slice().sort((left, right) => left - right);
  const median = medianValue(sorted);
  const p75Index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * 0.75)
  );
  const p75 = sorted[p75Index];

  // One unusual starting space should not decide where the player-tier boundary
  // falls. Median carries most of the weight, while p75 keeps the fit sensitive
  // to a change that affects a meaningful minority of the starting field.
  return Number((median * 0.65 + p75 * 0.35).toFixed(4));
}

function averagePayToWinSelectorScores(
  selectorStates,
  selectors,
  activeStarts,
  field,
  fallbackByIndex
) {
  const scoreByIndex = new Map();

  for (const item of activeStarts) {
    const values = selectors.map((selector) => (
      selectorStates.get(selector)?.get(item.index)?.[field]
    )).filter(Number.isFinite);
    const fallback = fallbackByIndex.get(item.index);

    scoreByIndex.set(
      item.index,
      values.length ? averageValues(values) : fallback
    );
  }

  return scoreByIndex;
}


function averagePayToWinSelectorPaymentScores(
  selectorStates,
  selectors,
  activeStarts,
  fallbackByIndex
) {
  const result = new Map();
  for (const item of activeStarts) {
    const fallback = fallbackByIndex.get(item.index) ?? [];
    const paymentCount = Math.max(
      fallback.length,
      ...selectors.map((selector) => (
        selectorStates.get(selector)?.get(item.index)?.paymentScores?.length ?? 0
      ))
    );
    const averaged = Array.from({ length: paymentCount }, (_, payment) => {
      const values = selectors.map((selector) => (
        selectorStates.get(selector)?.get(item.index)?.paymentScores?.[payment]
      )).filter(Number.isFinite);
      const fallbackValue = Number(fallback[payment]);
      return values.length
        ? averageValues(values)
        : (Number.isFinite(fallbackValue) ? fallbackValue : null);
    });
    result.set(item.index, averaged);
  }
  return result;
}

function getPayToWinSelectorFitError(
  selectorPricingStates,
  selectors,
  representativeState
) {
  if (!selectors.length) return 0;
  const distances = selectors.map((selector) => (
    getPayToWinProfileDistance(
      selectorPricingStates.get(selector),
      representativeState
    )
  ));
  return Number(averageValues(distances).toFixed(4));
}

function getPayToWinAdaptiveSelectorSplit(
  activeStarts,
  selectorStates,
  selectorPricingStates,
  pricingBenchmark,
  playerCount,
  options = {}
) {
  const selectors = Array.from(
    { length: Math.max(1, playerCount) },
    (_, index) => index + 1
  );
  const baselineFullByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.full ?? getPayToWinFullCourseScore(item)
  ]));
  const baselineAdjustedByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.adjusted ?? item.adjustedScore
  ]));
  const baselinePaymentByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.paymentScores ?? [baselineFullByIndex.get(item.index)]
  ]));
  const buildRepresentative = (groupSelectors) => {
    const fullScoreByIndex = averagePayToWinSelectorScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      "full",
      baselineFullByIndex
    );
    const adjustedScoreByIndex = averagePayToWinSelectorScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      "adjusted",
      baselineAdjustedByIndex
    );
    const paymentScoreByIndex = averagePayToWinSelectorPaymentScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      baselinePaymentByIndex
    );
    return {
      selectors: groupSelectors,
      fullScoreByIndex,
      adjustedScoreByIndex,
      paymentScoreByIndex,
      pricingState: buildPayToWinRegisterPricingState(
        activeStarts,
        fullScoreByIndex,
        pricingBenchmark,
        options,
        paymentScoreByIndex
      )
    };
  };

  // With at most two displayed price columns, the design problem remains a
  // one-change-point approximation. The breakpoint is chosen from continuous
  // register-equivalent route profiles; each representative group then prices
  // starts with its own averaged post-payment v45 economy curves.
  const singleGroup = buildRepresentative(selectors);
  const noSplitError = getPayToWinSelectorFitError(
    selectorPricingStates,
    selectors,
    singleGroup.pricingState
  );
  const candidates = [];

  for (let cutoffAfter = 1; cutoffAfter < selectors.length; cutoffAfter += 1) {
    const earlySelectors = selectors.slice(0, cutoffAfter);
    const lateSelectors = selectors.slice(cutoffAfter);
    const early = buildRepresentative(earlySelectors);
    const late = buildRepresentative(lateSelectors);
    const earlyError = getPayToWinSelectorFitError(
      selectorPricingStates,
      earlySelectors,
      early.pricingState
    );
    const lateError = getPayToWinSelectorFitError(
      selectorPricingStates,
      lateSelectors,
      late.pricingState
    );
    const splitError = Number((
      (
        earlyError * earlySelectors.length +
        lateError * lateSelectors.length
      ) / selectors.length
    ).toFixed(4));
    const gain = Number(Math.max(0, noSplitError - splitError).toFixed(4));
    const relativeGain = noSplitError > 1e-9
      ? Number((gain / noSplitError).toFixed(4))
      : 0;
    const separation = getPayToWinProfileDistance(
      early.pricingState,
      late.pricingState
    );

    candidates.push({
      cutoffAfter,
      earlySelectors,
      lateSelectors,
      early,
      late,
      splitError,
      gain,
      relativeGain,
      separation
    });
  }

  const minGain = Number(
    options.payToWinSelectorSplitMinGainRegisters ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_GAIN_R
  );
  const minRelativeGain = Number(
    options.payToWinSelectorSplitMinRelativeGain ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_RELATIVE_GAIN
  );
  const minSeparation = Number(
    options.payToWinSelectorSplitMinSeparationRegisters ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_SEPARATION_R
  );
  const eligible = candidates.filter((candidate) => (
    candidate.gain >= minGain &&
    candidate.relativeGain >= minRelativeGain &&
    candidate.separation >= minSeparation
  ));
  const selected = eligible.sort((left, right) => (
    left.splitError - right.splitError ||
    right.separation - left.separation ||
    left.cutoffAfter - right.cutoffAfter
  ))[0] ?? null;

  if (!selected) {
    return {
      active: false,
      early: singleGroup,
      late: null,
      selectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        cutoffAfter: null,
        noSplitErrorR: noSplitError,
        splitErrorR: noSplitError,
        gainR: 0,
        relativeGain: 0,
        separationR: 0,
        minGainR: minGain,
        minRelativeGain,
        minSeparationR: minSeparation,
        candidates: candidates.map((candidate) => ({
          cutoffAfter: candidate.cutoffAfter,
          splitErrorR: candidate.splitError,
          gainR: candidate.gain,
          relativeGain: candidate.relativeGain,
          separationR: candidate.separation
        }))
      }
    };
  }

  return {
    active: true,
    early: selected.early,
    late: selected.late,
    selectorSplit: {
      method: "robust-one-breakpoint-register-profile-v1",
      selected: true,
      cutoffAfter: selected.cutoffAfter,
      lateSelectorStart: selected.cutoffAfter + 1,
      lateSelectorEnd: selectors.length,
      noSplitErrorR: noSplitError,
      splitErrorR: selected.splitError,
      gainR: selected.gain,
      relativeGain: selected.relativeGain,
      separationR: selected.separation,
      minGainR: minGain,
      minRelativeGain,
      minSeparationR: minSeparation,
      candidates: candidates.map((candidate) => ({
        cutoffAfter: candidate.cutoffAfter,
        splitErrorR: candidate.splitError,
        gainR: candidate.gain,
        relativeGain: candidate.relativeGain,
        separationR: candidate.separation
      }))
    }
  };
}

function unrankPayToWinCombination(items, chooseCount, rank) {
  if (chooseCount <= 0) {
    return [];
  }

  const result = [];
  let offset = 0;
  let remaining = chooseCount;
  let workingRank = Math.max(0, rank);

  while (remaining > 0 && offset < items.length) {
    for (
      let position = offset;
      position <= items.length - remaining;
      position += 1
    ) {
      const suffixCount = getCombinationCount(
        items.length - position - 1,
        remaining - 1,
        1000000000
      );

      if (workingRank < suffixCount) {
        result.push(items[position]);
        offset = position + 1;
        remaining -= 1;
        break;
      }

      workingRank -= suffixCount;
    }
  }

  return result;
}

function samplePayToWinKnownSelections(
  otherIndices,
  knownCount,
  sampleLimit = 6
) {
  if (knownCount <= 0) {
    return [[]];
  }
  if (knownCount >= otherIndices.length) {
    return [[...otherIndices]];
  }

  const total = getCombinationCount(
    otherIndices.length,
    knownCount,
    1000000000
  );
  const sampleCount = Math.max(1, Math.min(sampleLimit, total));

  if (total <= sampleCount) {
    const combinations = [];
    const chosen = [];
    const visit = (offset) => {
      if (chosen.length === knownCount) {
        combinations.push([...chosen]);
        return;
      }
      const needed = knownCount - chosen.length;
      for (
        let position = offset;
        position <= otherIndices.length - needed;
        position += 1
      ) {
        chosen.push(otherIndices[position]);
        visit(position + 1);
        chosen.pop();
      }
    };
    visit(0);
    return combinations;
  }

  const sampled = [];
  const seen = new Set();
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rank = Math.min(
      total - 1,
      Math.floor(((sample + 0.5) * total) / sampleCount)
    );
    const combination = unrankPayToWinCombination(
      otherIndices,
      knownCount,
      rank
    );
    const key = combination.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      sampled.push(combination);
    }
  }

  return sampled;
}

function getPayToWinLateCostEntries(
  firstLeg,
  tileMap,
  excludedIndices = new Set(),
  playerCount = 4,
  options = {},
  baseCostState = null
) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    item.fullCourseRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
  const config = getPayToWinSelectorSurplusConfig(
    activeStarts.length,
    playerCount
  );

  if (!activeStarts.length) {
    return {
      active: false,
      evaluated: false,
      entries: [],
      earlyEntries: [],
      costUnit: 1,
      earlyCostUnit: 1,
      minScore: 0,
      maxScore: 0,
      pricingModel: null,
      earlyPricingModel: null,
      scenarioSamples: 0,
      scenarioSamplesBySelector: {},
      lateSelectorStart: null,
      lateSelectorEnd: null,
      latePlayerCount: 0,
      selectorSplit: null,
      ...config
    };
  }

  const pricingBenchmark = baseCostState?.pricingModel
    ? {
      registerScore: baseCostState.pricingModel.registerScore,
      horizonTurns: baseCostState.pricingModel.horizonTurns
    }
    : getPayToWinPricingBenchmark(
      tileMap,
      firstLeg,
      activeStarts,
      options
    );
  const fallbackPaymentCurves = baseCostState
    ? new Map(baseCostState.entries.map((entry) => [entry.index, entry.paymentScores]))
    : buildPayToWinPaymentScoreCurves(firstLeg, tileMap, activeStarts, {
      ...options,
      playerCount: config.playerCount
    });
  const fallbackFullScores = new Map(activeStarts.map((item) => [
    item.index,
    Number(fallbackPaymentCurves.get(item.index)?.[0])
  ]));
  const baselinePricingState = baseCostState ?? buildPayToWinRegisterPricingState(
    activeStarts,
    fallbackFullScores,
    pricingBenchmark,
    options,
    fallbackPaymentCurves
  );
  const baselineEntryByIndex = new Map(
    baselinePricingState.entries.map((entry) => [entry.index, entry])
  );
  const baselineFullByIndex = new Map(activeStarts.map((item) => [
    item.index,
    baselineEntryByIndex.get(item.index)?.fullScore ?? getPayToWinFullCourseScore(item)
  ]));
  const baselinePaymentByIndex = new Map(activeStarts.map((item) => [
    item.index,
    baselineEntryByIndex.get(item.index)?.paymentScores ?? [baselineFullByIndex.get(item.index)]
  ]));

  if (config.surplusStarts <= 0 || config.playerCount <= 1) {
    return {
      ...buildInactivePayToWinLateCostState(
        baselinePricingState,
        getPayToWinDenialCost(options)
      ),
      evaluated: false,
      earlyEntries: baselinePricingState.entries,
      earlyCostUnit: baselinePricingState.costUnit,
      earlyPricingModel: baselinePricingState.pricingModel,
      scenarioSamplesBySelector: {},
      selectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        reason: "inactive-no-surplus"
      },
      ...config
    };
  }

  let scenarioSamples = 0;
  const scenarioSamplesBySelector = {};
  const activeIndices = activeStarts.map((item) => item.index);
  const selectorStates = new Map();
  const selectorOne = new Map(activeStarts.map((item) => [
    item.index,
    {
      adjusted: item.adjustedScore,
      full: baselineFullByIndex.get(item.index),
      paymentScores: baselinePaymentByIndex.get(item.index)
    }
  ]));
  selectorStates.set(1, selectorOne);

  for (let selector = 2; selector <= config.playerCount; selector += 1) {
    selectorStates.set(selector, new Map());
    scenarioSamplesBySelector[selector] = 0;
  }

  const pricingOptions = getPayToWinRouteEconomyPricingOptions(firstLeg, {
    ...options,
    playerCount: config.playerCount
  });

  for (const item of activeStarts) {
    const otherIndices = activeIndices.filter(
      (index) => index !== item.index
    );
    const baselineFirstTotal = (
      (item.bestScore ?? item.selectedRoute?.score ?? 0) +
      (item.trafficPenalty ?? 0)
    );
    const baselineFullTotal = baselineFullByIndex.get(item.index);
    const fallbackCurve = baselinePaymentByIndex.get(item.index) ?? [baselineFullTotal];

    for (let selector = 2; selector <= config.playerCount; selector += 1) {
      const scenarioScores = [];
      const scenarioPaymentCurves = [];
      const knownCount = Math.min(
        otherIndices.length,
        selector - 1
      );
      const knownSamples = samplePayToWinKnownSelections(
        otherIndices,
        knownCount,
        options.payToWinLateScenarioSamples ?? 6
      );

      for (const knownIndices of knownSamples) {
        const knownSet = new Set(knownIndices);
        const futurePlayers = Math.max(0, config.playerCount - selector);
        const unresolvedIndices = otherIndices.filter(
          (index) => !knownSet.has(index)
        );
        const futureOccupancy = unresolvedIndices.length
          ? Math.min(1, futurePlayers / unresolvedIndices.length)
          : 0;
        const occupancyByIndex = new Map(
          activeIndices.map((index) => [index, 0])
        );
        occupancyByIndex.set(item.index, 1);
        knownIndices.forEach((index) => (
          occupancyByIndex.set(index, 1)
        ));
        unresolvedIndices.forEach((index) => (
          occupancyByIndex.set(index, futureOccupancy)
        ));

        const scenario = evaluateFullCourseFocusPaymentCurveUnderOccupancy(
          tileMap,
          firstLeg,
          firstLeg.flags,
          item.index,
          occupancyByIndex,
          {
            ...pricingOptions,
            playerCount: config.playerCount,
            fullCourseTrafficPasses: 1
          }
        );
        const paymentEntries = scenario?.entries ?? [];
        const zero = paymentEntries.find((entry) => entry.payment === 0);
        if (!zero) continue;

        const firstLegDelta = zero.firstLegTotal - baselineFirstTotal;
        const fullCourseDelta = zero.fullTotal - baselineFullTotal;
        const adjustedScore = (
          item.adjustedScore +
          firstLegDelta +
          clamp(fullCourseDelta * 0.32, -10, 10)
        );
        if (Number.isFinite(adjustedScore)) {
          scenarioScores.push(adjustedScore);
        }
        const curve = paymentEntries
          .sort((left, right) => left.payment - right.payment)
          .map((entry) => entry.fullTotal);
        if (curve.length) scenarioPaymentCurves.push(curve);
        scenarioSamples += 1;
        scenarioSamplesBySelector[selector] += 1;
      }

      const paymentCount = fallbackCurve.length;
      const averagedCurve = Array.from({ length: paymentCount }, (_, payment) => {
        const values = scenarioPaymentCurves
          .map((curve) => curve[payment])
          .filter(Number.isFinite);
        const fallback = Number(fallbackCurve[payment]);
        return values.length
          ? averageValues(values)
          : (Number.isFinite(fallback) ? fallback : null);
      });
      selectorStates.get(selector).set(
        item.index,
        {
          adjusted: scenarioScores.length
            ? averageValues(scenarioScores)
            : item.adjustedScore,
          full: Number.isFinite(averagedCurve[0])
            ? averagedCurve[0]
            : baselineFullTotal,
          paymentScores: averagedCurve
        }
      );
    }
  }

  const selectorPricingStates = new Map();
  selectorPricingStates.set(1, baselinePricingState);
  for (let selector = 2; selector <= config.playerCount; selector += 1) {
    const fullScoreByIndex = new Map(activeStarts.map((item) => [
      item.index,
      selectorStates.get(selector)?.get(item.index)?.full
    ]));
    const paymentScoreByIndex = new Map(activeStarts.map((item) => [
      item.index,
      selectorStates.get(selector)?.get(item.index)?.paymentScores ?? baselinePaymentByIndex.get(item.index)
    ]));
    selectorPricingStates.set(
      selector,
      buildPayToWinRegisterPricingState(
        activeStarts,
        fullScoreByIndex,
        pricingBenchmark,
        options,
        paymentScoreByIndex
      )
    );
  }

  const adaptive = getPayToWinAdaptiveSelectorSplit(
    activeStarts,
    selectorStates,
    selectorPricingStates,
    pricingBenchmark,
    config.playerCount,
    options
  );
  const earlyState = adaptive.early.pricingState;
  const lateState = adaptive.active
    ? adaptive.late.pricingState
    : earlyState;
  const earlyAdjustedByIndex = adaptive.early.adjustedScoreByIndex;
  const lateAdjustedByIndex = adaptive.active
    ? adaptive.late.adjustedScoreByIndex
    : earlyAdjustedByIndex;
  const denialCost = getPayToWinDenialCost(options);
  const lateEntries = lateState.entries.map((entry) => ({
    ...entry,
    lateAdjustedScore: lateAdjustedByIndex.get(entry.index) ?? entry.adjustedScore,
    lateFullScore: entry.fullScore,
    lateAdvantage: entry.advantage,
    lateRegisterEquivalent: entry.registerEquivalent,
    calculatedLateEnergyCost: entry.energyCost,
    lateEnergyCost: entry.energyCost,
    lateUnavailable: entry.energyCost >= denialCost
  }));
  const lateSelectorStart = adaptive.active
    ? adaptive.selectorSplit.lateSelectorStart
    : null;
  const lateSelectorEnd = adaptive.active
    ? adaptive.selectorSplit.lateSelectorEnd
    : null;

  return {
    active: adaptive.active,
    evaluated: true,
    entries: lateEntries,
    earlyEntries: earlyState.entries,
    costUnit: lateState.costUnit,
    earlyCostUnit: earlyState.costUnit,
    minScore: lateState.minScore,
    maxScore: lateState.maxScore,
    pricingModel: lateState.pricingModel,
    earlyPricingModel: earlyState.pricingModel,
    scenarioSamples,
    scenarioSamplesBySelector,
    lateSelectorStart,
    lateSelectorEnd,
    latePlayerCount: adaptive.active
      ? config.playerCount - adaptive.selectorSplit.cutoffAfter
      : 0,
    selectorSplit: adaptive.selectorSplit,
    ...config
  };
}

function formatPayToWinEnergyCost(startAnalysis, options = {}) {
  if (startAnalysis?.energyCost === null || startAnalysis?.energyCost === undefined) {
    return null;
  }

  const subsidizedStarts = Boolean(options.subsidizedStarts);
  const formatValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return subsidizedStarts ? `+${numeric}` : String(numeric);
  };
  const normalCost = Number(startAnalysis.energyCost);
  const lateCost = Number(startAnalysis.lateEnergyCost);
  const earlyUnavailable = Boolean(startAnalysis.earlyUnavailable);
  const lateUnavailable = Boolean(startAnalysis.lateUnavailable);
  const normalLabel = formatValue(normalCost);
  const lateLabel = formatValue(lateCost);

  if (earlyUnavailable && lateUnavailable) {
    return "—/—";
  }

  if (earlyUnavailable) {
    return lateLabel !== null ? `—/${lateLabel}` : "—";
  }

  if (lateUnavailable) {
    return `${normalLabel}/—`;
  }

  if (lateLabel !== null && lateCost !== normalCost) {
    return `${normalLabel}/${lateLabel}`;
  }

  return normalLabel;
}

function choosePayToWinPruneEntry(entries, options = {}) {
  if (!entries.length) {
    return null;
  }

  // Pruning direction is intentionally tied to the requested course character.
  // Full-course score is used here (rather than opening adjustedScore) because
  // removing an endpoint is meant to reshape the race players actually play:
  // high score = weaker/longer/harder start, low score = stronger/shorter/easier.
  const bias = getPayToWinRemovalBias(options);
  if (bias > 0) {
    return [...entries].sort((left, right) =>
      right.fullScore - left.fullScore || left.index - right.index
    )[0];
  }
  if (bias < 0) {
    return [...entries].sort((left, right) =>
      left.fullScore - right.fullScore || left.index - right.index
    )[0];
  }

  const meanScore = averageValues(entries.map((entry) => entry.fullScore));
  return [...entries].sort((left, right) => (
    Math.abs(right.fullScore - meanScore) - Math.abs(left.fullScore - meanScore) ||
    left.fullScore - right.fullScore ||
    left.index - right.index
  ))[0];
}

function getActivePruningStarts(firstLeg, excludedIndices = new Set()) {
  return (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    Number.isFinite(item.balanceScore ?? item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
}

function runIterativeStartBalancing(firstLeg, tileMap, playerCount, analysisOptions = {}, chooser, options = {}) {
  const baseFirstLeg = {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      outliers: [...(firstLeg.summary.outliers || [])]
    }
  };
  const excludedIndices = new Set(options.initialExcludedIndices ?? []);
  const removals = [];
  // The incoming first-leg analysis already contains route-pressure scoring.
  // Recompute immediately only when an earlier lightweight stage has already
  // excluded starts; Pay to Win and untrimmed normal setups can reuse it.
  let currentFirstLeg = (
    excludedIndices.size &&
    !options.inputAlreadyReflectsExcluded &&
    !analysisOptions.skipTraffic
  )
    ? recomputeFirstLegPressure(tileMap, baseFirstLeg, {
      playerCount,
      ...analysisOptions,
      excludedIndices: [...excludedIndices]
    })
    : baseFirstLeg;

  const configuredPruneBatchSize = options.pruneBatchSize;
  for (let pass = 0; pass < (options.maxPasses ?? 12); pass += 1) {
    let batchActiveStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
    const requestedPruneBatchSize = typeof configuredPruneBatchSize === "function"
      ? configuredPruneBatchSize(batchActiveStarts.length, playerCount)
      : configuredPruneBatchSize;
    const pruneBatchSize = Math.max(1, Math.floor(Number(requestedPruneBatchSize) || 1));
    let removedThisPass = 0;

    while (removedThisPass < pruneBatchSize) {
      if (batchActiveStarts.length <= Math.max(1, playerCount || 1)) break;
      const removal = chooser({
        baseFirstLeg,
        currentFirstLeg,
        activeStarts: batchActiveStarts,
        excludedIndices,
        removals,
        pass: pass + 1,
        batchIndex: removedThisPass
      });

      if (!removal || excludedIndices.has(removal.index)) break;
      excludedIndices.add(removal.index);
      removals.push({
        ...removal,
        pass: pass + 1,
        batchIndex: removedThisPass
      });
      removedThisPass += 1;
      batchActiveStarts = batchActiveStarts.filter((entry) => entry.index !== removal.index);
    }

    if (!removedThisPass) break;

    // In the fast baseline, intrinsic full-course scores are already present and
    // traffic is intentionally disabled. Do not call the occupancy/pressure engine
    // merely to return zeros; continue pruning the frozen intrinsic field.
    if (!analysisOptions.skipTraffic) {
      // Traffic/occupancy is frozen within a batch, then recomputed exactly once.
      currentFirstLeg = recomputeFirstLegPressure(
        tileMap,
        analysisOptions.carryOccupancyScores ? currentFirstLeg : baseFirstLeg,
        {
          playerCount,
          ...analysisOptions,
          excludedIndices: [...excludedIndices]
        }
      );
    }
  }

  return {
    baseFirstLeg,
    currentFirstLeg,
    excludedIndices,
    removals
  };
}

function buildInactivePayToWinLateCostState(costState, denialCost) {
  return {
    active: false,
    evaluated: false,
    entries: (costState.entries ?? []).map((entry) => ({
      ...entry,
      lateAdjustedScore: entry.adjustedScore,
      lateFullScore: entry.fullScore ?? getPayToWinFullCourseScore(entry.startAnalysis),
      lateAdvantage: entry.advantage,
      lateRegisterEquivalent: entry.registerEquivalent,
      lateEnergyCost: entry.energyCost,
      lateUnavailable: entry.energyCost >= denialCost
    })),
    earlyEntries: costState.entries ?? [],
    costUnit: costState.costUnit,
    earlyCostUnit: costState.costUnit,
    minScore: costState.minScore,
    maxScore: costState.maxScore,
    pricingModel: costState.pricingModel ?? null,
    earlyPricingModel: costState.pricingModel ?? null,
    scenarioSamples: 0,
    scenarioSamplesBySelector: {},
    lateSelectorStart: null,
    lateSelectorEnd: null,
    latePlayerCount: 0,
    surplusStarts: 0,
    selectorSplit: null
  };
}

function evaluatePayToWinSelectorAwarePricingState(
  firstLeg,
  tileMap,
  excludedIndices,
  playerCount,
  pricingOptions,
  baseCostState = null
) {
  const denialCost = getPayToWinDenialCost(pricingOptions);
  const costState = baseCostState ?? getPayToWinCostEntries(
    firstLeg,
    tileMap,
    excludedIndices,
    pricingOptions
  );
  const selectorPricingEligible = costState.entries.length > playerCount;
  const lateCostState = selectorPricingEligible
    ? getPayToWinLateCostEntries(
      firstLeg,
      tileMap,
      excludedIndices,
      playerCount,
      pricingOptions,
      costState
    )
    : buildInactivePayToWinLateCostState(costState, denialCost);
  const earlyEntries = lateCostState.earlyEntries ?? costState.entries;
  const lateEntries = lateCostState.entries ?? [];
  const lateByIndex = new Map(lateEntries.map((entry) => [entry.index, entry]));
  const latePricingActive = Boolean(lateCostState.active);

  const earlyUnavailableCount = earlyEntries.filter((entry) => (
    entry.energyCost >= denialCost
  )).length;
  const lateUnavailableCount = lateEntries.filter((entry) => (
    entry.lateUnavailable
  )).length;
  const fullyUnavailableCount = earlyEntries.filter((entry) => {
    const lateEntry = lateByIndex.get(entry.index);
    return (
      entry.energyCost >= denialCost &&
      Boolean(lateEntry?.lateUnavailable ?? entry.energyCost >= denialCost)
    );
  }).length;
  const pricedStartCount = Math.max(0, earlyEntries.length - fullyUnavailableCount);
  const maxUnavailable = Math.max(0, earlyEntries.length - playerCount);
  const earlyAvailabilityValid = earlyUnavailableCount <= maxUnavailable;
  const lateAvailabilityValid = lateUnavailableCount <= maxUnavailable;
  const availabilityValid = (
    pricedStartCount >= playerCount &&
    earlyAvailabilityValid &&
    lateAvailabilityValid
  );

  const earlyResidual = summarizePricedStartResidualBalance(
    earlyEntries,
    denialCost,
    playerCount,
    { costKey: "energyCost", scoreKey: "postPaymentFullScore" }
  );
  const lateResidual = latePricingActive
    ? summarizePricedStartResidualBalance(
      lateEntries,
      denialCost,
      playerCount,
      { costKey: "lateEnergyCost", scoreKey: "postPaymentFullScore" }
    )
    : earlyResidual;
  const residualBalance = {
    method: "post-adjustment-normal-fairness-v37",
    early: earlyResidual,
    late: lateResidual,
    worstStdDev: Math.max(earlyResidual.stddev, lateResidual.stddev),
    worstOutlierCount: Math.max(earlyResidual.outlierCount, lateResidual.outlierCount),
    acceptable: earlyResidual.acceptable && lateResidual.acceptable
  };
  const balanceValid = residualBalance.acceptable;
  const requiredCount = Math.max(1, playerCount || 1);
  const penalty = (
    Math.max(0, requiredCount - earlyResidual.offeredCount) * 40 +
    Math.max(0, requiredCount - lateResidual.offeredCount) * 40 +
    residualBalance.worstOutlierCount * 18 +
    Math.max(0, residualBalance.worstStdDev - NORMAL_START_FAIRNESS_STDDEV_LIMIT) * 2
  );

  return {
    costState,
    lateCostState,
    selectorPricingEligible,
    latePricingActive,
    pricedStartCount,
    earlyOfferedCount: earlyResidual.offeredCount,
    lateOfferedCount: lateResidual.offeredCount,
    earlyUnavailableCount,
    lateUnavailableCount,
    maxUnavailable,
    availabilityValid,
    residualBalance,
    balanceValid,
    acceptable: availabilityValid && balanceValid,
    penalty: Number(penalty.toFixed(4))
  };
}

function applyPayToWinStartPricing(firstLeg, tileMap, playerCount, options = {}) {
  const analysisOptions = getPayToWinAnalysisOptions({
    ...options,
    ...getRouteAnalysisVariantOptions(options),
    payToWin: true
  }, playerCount);
  const pricingOptions = { ...options, playerCount };
  const bias = getPayToWinRemovalBias(options);

  // v37: pricing is downstream of the all-start route foundation. Endpoint
  // pruning is setup interpretation only: if the current Energy range cannot
  // express the route spread, remove one endpoint, rebuild occupancy/traffic,
  // and reprice. Never prune below the player-count floor.
  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ baseFirstLeg, currentFirstLeg, excludedIndices }) => {
      const costState = getPayToWinCostEntries(
        currentFirstLeg,
        tileMap,
        excludedIndices,
        pricingOptions
      );
      if (costState.entries.length <= playerCount) return null;

      // v37c: pruning decisions use the same selector-aware economy that owns the
      // final displayed prices. This closes the v37b gap where an endpoint could
      // look like it rescued an extra start under one-group pricing, only for that
      // gain to disappear after early/late selector occupancy was evaluated.
      const currentEconomy = evaluatePayToWinSelectorAwarePricingState(
        currentFirstLeg,
        tileMap,
        excludedIndices,
        playerCount,
        pricingOptions,
        costState
      );

      const sortedByFullScore = [...costState.entries].sort((left, right) => (
        left.fullScore - right.fullScore || left.index - right.index
      ));
      const endpointCandidates = [...new Map(
        [sortedByFullScore[0], sortedByFullScore.at(-1)]
          .filter(Boolean)
          .map((entry) => [entry.index, entry])
      ).values()];
      const preferred = choosePayToWinPruneEntry(costState.entries, options);
      const previews = endpointCandidates.map((candidate) => {
        const nextExcluded = new Set(excludedIndices);
        nextExcluded.add(candidate.index);

        // Match the state that runIterativeStartBalancing will actually create
        // after a committed prune: first rebuild occupancy/traffic for the smaller
        // field, then run the full selector-aware pricing interpretation on it.
        const previewFirstLeg = analysisOptions.skipTraffic
          ? currentFirstLeg
          : recomputeFirstLegPressure(
            tileMap,
            analysisOptions.carryOccupancyScores ? currentFirstLeg : baseFirstLeg,
            {
              playerCount,
              ...analysisOptions,
              excludedIndices: [...nextExcluded]
            }
          );
        const nextCostState = getPayToWinCostEntries(
          previewFirstLeg,
          tileMap,
          nextExcluded,
          pricingOptions
        );
        const nextEconomy = evaluatePayToWinSelectorAwarePricingState(
          previewFirstLeg,
          tileMap,
          nextExcluded,
          playerCount,
          pricingOptions,
          nextCostState
        );
        return {
          candidate,
          economy: nextEconomy,
          offerableGain: nextEconomy.pricedStartCount - currentEconomy.pricedStartCount,
          balanceGain: currentEconomy.penalty - nextEconomy.penalty,
          preferred: candidate.index === preferred?.index
        };
      });

      const rescueRequired = !currentEconomy.acceptable;
      const eligible = previews.filter((preview) => (
        rescueRequired
          ? preview.balanceGain > 1e-9
          : preview.offerableGain > 0 && preview.economy.acceptable
      ));
      if (!eligible.length) return null;

      const selectedPreview = eligible.sort((left, right) => (
        (right.economy.acceptable ? 1 : 0) - (left.economy.acceptable ? 1 : 0) ||
        right.offerableGain - left.offerableGain ||
        right.balanceGain - left.balanceGain ||
        (right.preferred ? 1 : 0) - (left.preferred ? 1 : 0) ||
        left.candidate.index - right.candidate.index
      ))[0];
      const removed = selectedPreview?.candidate ?? null;
      if (!removed) return null;

      const reasonLead = rescueRequired
        ? !currentEconomy.availabilityValid
          ? `selector-aware pricing left early/late ${currentEconomy.earlyOfferedCount}/${currentEconomy.lateOfferedCount} offerable starts for ${playerCount} players`
          : "selector-aware post-adjustment balance required a narrower field"
        : `selector-aware repricing increased offered starts ${currentEconomy.pricedStartCount}->${selectedPreview.economy.pricedStartCount}`;
      return {
        index: removed.index,
        score: removed.adjustedScore,
        fullScore: removed.fullScore,
        energyCost: removed.energyCost,
        registerEquivalent: removed.registerEquivalent,
        pricingModel: costState.pricingModel,
        offerableBefore: currentEconomy.pricedStartCount,
        offerableAfterPreview: selectedPreview.economy.pricedStartCount,
        earlyOfferableBefore: currentEconomy.earlyOfferedCount,
        lateOfferableBefore: currentEconomy.lateOfferedCount,
        earlyOfferableAfterPreview: selectedPreview.economy.earlyOfferedCount,
        lateOfferableAfterPreview: selectedPreview.economy.lateOfferedCount,
        balancePenaltyBefore: currentEconomy.penalty,
        balancePenaltyAfterPreview: selectedPreview.economy.penalty,
        selectorAwarePreview: true,
        reason: `${reasonLead}; ${
          bias > 0
            ? "removed the weak/long endpoint when otherwise comparable"
            : bias < 0
              ? "removed the strong/short endpoint when otherwise comparable"
              : "used the endpoint with the better economic repricing result"
        }`
      };
    },
    { maxPasses: 12 }
  );

  const { currentFirstLeg, excludedIndices, removals: pruned } = result;
  const startingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const startingUpgradeCards = getCourseStartingUpgradeCards(options);
  const denialCost = getPayToWinDenialCost(options);
  const finalCostState = getPayToWinCostEntries(
    currentFirstLeg,
    tileMap,
    excludedIndices,
    pricingOptions
  );

  // Preserve the existing selector-position model: evaluate each chooser position
  // under known/future occupancy, then retain at most one meaningful breakpoint.
  const selectorPricingEligible = finalCostState.entries.length > playerCount;
  const lateCostState = selectorPricingEligible
    ? getPayToWinLateCostEntries(
      currentFirstLeg,
      tileMap,
      excludedIndices,
      playerCount,
      pricingOptions,
      finalCostState
    )
    : buildInactivePayToWinLateCostState(finalCostState, denialCost);
  const earlyCostState = {
    entries: lateCostState.earlyEntries ?? finalCostState.entries,
    costUnit: lateCostState.earlyCostUnit ?? finalCostState.costUnit,
    minScore: finalCostState.minScore,
    maxScore: finalCostState.maxScore,
    pricingModel: lateCostState.earlyPricingModel ?? finalCostState.pricingModel
  };
  const latePricingActive = Boolean(lateCostState.active);

  const costByIndex = new Map(earlyCostState.entries.map((entry) => [entry.index, entry.energyCost]));
  const earlyUnavailableByIndex = new Map(earlyCostState.entries.map((entry) => [
    entry.index,
    entry.energyCost >= denialCost
  ]));
  const lateCostByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateEnergyCost]));
  const lateUnavailableByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateUnavailable]));
  const lateAdjustedScoreByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateAdjustedScore]));
  const earlyUnavailableCount = earlyCostState.entries.filter((entry) => earlyUnavailableByIndex.get(entry.index)).length;
  const lateUnavailableCount = lateCostState.entries.filter((entry) => entry.lateUnavailable).length;
  const fullyUnavailableEntries = earlyCostState.entries.filter((entry) => (
    earlyUnavailableByIndex.get(entry.index) &&
    lateUnavailableByIndex.get(entry.index)
  ));
  const fullyUnavailableIndices = new Set(fullyUnavailableEntries.map((entry) => entry.index));
  const fullyUnavailableCount = fullyUnavailableEntries.length;
  const maxUnavailable = Math.max(0, earlyCostState.entries.length - playerCount);
  const maxEarlyUnavailable = maxUnavailable;
  const maxLateUnavailable = maxUnavailable;
  const earlyAvailabilityValid = earlyUnavailableCount <= maxEarlyUnavailable;
  const lateAvailabilityValid = lateUnavailableCount <= maxLateUnavailable;
  const pricedStartCount = Math.max(0, earlyCostState.entries.length - fullyUnavailableCount);
  const availabilityValid = (
    pricedStartCount >= playerCount &&
    earlyAvailabilityValid &&
    lateAvailabilityValid
  );

  // Authoritative fairness is measured *after* payment/subsidy. A price is not
  // successful merely because it is numerically legal; it must actually collapse
  // the retained start field to the same Normal fairness bar.
  const earlyResidualBalance = summarizePricedStartResidualBalance(
    earlyCostState.entries,
    denialCost,
    playerCount,
    { costKey: "energyCost", scoreKey: "postPaymentFullScore" }
  );
  const lateResidualBalance = latePricingActive
    ? summarizePricedStartResidualBalance(
      lateCostState.entries,
      denialCost,
      playerCount,
      { costKey: "lateEnergyCost", scoreKey: "postPaymentFullScore" }
    )
    : earlyResidualBalance;
  const residualBalance = {
    method: "post-adjustment-normal-fairness-v37",
    early: earlyResidualBalance,
    late: lateResidualBalance,
    worstStdDev: Math.max(earlyResidualBalance.stddev, lateResidualBalance.stddev),
    worstOutlierCount: Math.max(earlyResidualBalance.outlierCount, lateResidualBalance.outlierCount),
    acceptable: earlyResidualBalance.acceptable && lateResidualBalance.acceptable
  };
  const balanceValid = residualBalance.acceptable;

  const hasLatePriceDifference = latePricingActive && lateCostState.entries.some((entry) => {
    if (!costByIndex.has(entry.index)) return false;
    const earlyUnavailable = earlyUnavailableByIndex.get(entry.index) ?? false;
    const lateUnavailable = Boolean(entry.lateUnavailable);
    if (earlyUnavailable !== lateUnavailable) return true;
    if (earlyUnavailable && lateUnavailable) return false;
    return entry.lateEnergyCost !== costByIndex.get(entry.index);
  });
  const latePriceHigherCount = latePricingActive ? lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost > costByIndex.get(entry.index)
  )).length : 0;
  const latePriceLowerCount = latePricingActive ? lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost < costByIndex.get(entry.index)
  )).length : 0;

  const activeScores = earlyCostState.entries.map((entry) => entry.adjustedScore);
  const meanScore = activeScores.length ? averageValues(activeScores) : 0;
  const prunedOutliers = pruned.map((item) => ({
    index: item.index,
    score: item.score,
    delta: Number((item.score - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinPruned: true,
      subsidizedStarts: isSubsidizedStartsPricing(options),
      energyCost: item.energyCost,
      outlierPass: item.pass,
      removalReason: item.reason,
      costThreshold: denialCost
    }
  }));
  const unavailableOutliers = fullyUnavailableEntries.map((item) => ({
    index: item.index,
    score: item.adjustedScore,
    delta: Number((item.adjustedScore - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinUnavailable: true,
      subsidizedStarts: isSubsidizedStartsPricing(options),
      energyCost: item.energyCost,
      lateEnergyCost: lateCostByIndex.get(item.index),
      startingEnergy,
      costThreshold: denialCost
    }
  }));
  const outliers = [...prunedOutliers, ...unavailableOutliers];
  const lateEntryByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry]));
  const pricingEntries = earlyCostState.entries.map((entry) => {
    const lateEntry = lateEntryByIndex.get(entry.index);
    return {
      index: entry.index,
      fullScore: entry.fullScore,
      advantage: entry.advantage,
      registerEquivalent: entry.registerEquivalent,
      energyCost: entry.energyCost,
      unavailable: entry.energyCost >= denialCost,
      postPaymentFullScore: entry.postPaymentFullScore,
      postAdjustmentDeltaScore: entry.postAdjustmentDeltaScore,
      postAdjustmentDeltaRegisters: entry.postAdjustmentDeltaRegisters,
      paymentScores: entry.paymentScores,
      lateEnergyCost: lateEntry?.lateEnergyCost ?? null,
      lateUnavailable: Boolean(lateEntry?.lateUnavailable),
      lateFullScore: lateEntry?.fullScore ?? null,
      latePostPaymentFullScore: lateEntry?.postPaymentFullScore ?? null,
      latePostAdjustmentDeltaRegisters: lateEntry?.postAdjustmentDeltaRegisters ?? null
    };
  });

  return {
    ...currentFirstLeg,
    starts: currentFirstLeg.starts.map((startAnalysis) => ({
      ...startAnalysis,
      energyCost: costByIndex.has(startAnalysis.index) ? costByIndex.get(startAnalysis.index) : null,
      earlyUnavailable: earlyUnavailableByIndex.get(startAnalysis.index) ?? false,
      lateEnergyCost: lateCostByIndex.has(startAnalysis.index) ? lateCostByIndex.get(startAnalysis.index) : null,
      lateUnavailable: lateUnavailableByIndex.get(startAnalysis.index) ?? false,
      payToWinUnavailable: fullyUnavailableIndices.has(startAnalysis.index),
      lateAdjustedScore: lateAdjustedScoreByIndex.has(startAnalysis.index)
        ? lateAdjustedScoreByIndex.get(startAnalysis.index)
        : null
    })),
    summary: {
      ...currentFirstLeg.summary,
      // For priced starts, public fairness is the residual field after the
      // displayed Energy adjustment, not the raw pre-price route spread.
      scoreStdDev: Number(residualBalance.worstStdDev.toFixed(2)),
      fairnessScore: Number(Math.max(0, 100 - residualBalance.worstStdDev * 4).toFixed(2)),
      outliers,
      payToWin: {
        active: true,
        mode: isSubsidizedStartsPricing(options) ? "subsidy" : "payment",
        subsidizedStarts: isSubsidizedStartsPricing(options),
        pricingEconomyMethod: "card-aware-fixed-route-expected-economy-v37",
        pruningPolicy: "selector-aware-endpoint-preview-v37c",
        startingEnergy,
        maxEnergy,
        startingUpgradeCards,
        maxSubsidy: isSubsidizedStartsPricing(options) ? getStartEnergyAdjustmentLimit(options) : 0,
        denialCost,
        costUnit: earlyCostState.costUnit,
        lateCostUnit: lateCostState.costUnit,
        pricingModel: earlyCostState.pricingModel,
        latePricingModel: lateCostState.pricingModel ?? null,
        selectorSplit: lateCostState.selectorSplit ?? null,
        selectorPricingEvaluated: Boolean(lateCostState.evaluated),
        selectorScenarioSamplesByPosition: lateCostState.scenarioSamplesBySelector ?? {},
        pruned,
        pricingEntries,
        pricedStartCount,
        trafficScaleMultiplier: getPayToWinTrafficScaleMultiplier(playerCount),
        lateSelectorStart: lateCostState.lateSelectorStart,
        lateSelectorEnd: lateCostState.lateSelectorEnd,
        surplusStarts: Math.max(0, pricedStartCount - playerCount),
        latePricingActive,
        lateTrafficModel: latePricingActive
          ? "adaptive-one-breakpoint"
          : (selectorPricingEligible ? "adaptive-no-meaningful-split" : "inactive-no-surplus"),
        lateScenarioSamples: lateCostState.scenarioSamples,
        earlyUnavailableCount,
        maxEarlyUnavailable,
        earlyAvailabilityValid,
        lateUnavailableCount,
        maxLateUnavailable,
        lateAvailabilityValid,
        fullyUnavailableCount,
        availabilityValid,
        residualBalance,
        balanceValid,
        latePriceHigherCount,
        latePriceLowerCount,
        hasLatePriceDifference
      }
    }
  };
}

function medianValue(values) {
  const finite = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!finite.length) {
    return 0;
  }
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

function getRobustOutlierStats(entries, scoreKey = "adjustedScore") {
  const values = entries.map((entry) => entry[scoreKey]).filter(Number.isFinite);
  const center = medianValue(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = medianValue(deviations);
  const robustScale = Math.max(1.5, mad * 1.4826);

  return {
    center,
    mad,
    robustScale
  };
}

function rankNormalStartOutliers(entries, scoreKey = "adjustedScore", zThreshold = FULL_START_OUTLIER_Z) {
  if (entries.length < 3) {
    return [];
  }

  const scoreStats = getRobustOutlierStats(entries, scoreKey);
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const minimumScoreDelta = Math.max(5, Math.abs(scoreStats.center) * 0.08);

  return entries
    .map((entry) => {
      const score = entry[scoreKey];
      const scoreDelta = score - scoreStats.center;
      const scoreZ = Math.abs(scoreDelta) / scoreStats.robustScale;
      const actionDelta = Number.isFinite(entry.bestActions)
        ? entry.bestActions - actionStats.center
        : 0;
      const actionZ = Number.isFinite(entry.bestActions)
        ? Math.abs(actionDelta) / actionStats.robustScale
        : 0;
      const qualifies = (
        scoreZ >= zThreshold && Math.abs(scoreDelta) >= minimumScoreDelta
      ) || (
        actionZ >= zThreshold + 0.35 && Math.abs(actionDelta) >= 2
      );

      return {
        entry,
        score,
        scoreDelta,
        scoreZ,
        actionDelta,
        actionZ,
        qualifies,
        strength: Math.max(scoreZ, actionZ * 0.9)
      };
    })
    .filter((item) => item.qualifies)
    .sort((left, right) => (
      right.strength - left.strength ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));
}

function getNormalStartDispersion(entries, scoreKey = "adjustedScore") {
  const values = entries
    .map((entry) => entry[scoreKey])
    .filter(Number.isFinite);
  if (values.length < 2) {
    return 0;
  }

  const mean = averageValues(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  );
}

function getNormalStartBalanceDiagnostics(entry, entries, scoreKey = "balanceScore") {
  const scoreStats = getRobustOutlierStats(entries, scoreKey);
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const scoreValue = Number(entry[scoreKey]);
  const scoreDelta = scoreValue - scoreStats.center;
  const actionDelta = Number.isFinite(entry.bestActions)
    ? entry.bestActions - actionStats.center
    : 0;

  return {
    scoreZ: Math.abs(scoreDelta) / scoreStats.robustScale,
    actionZ: Number.isFinite(entry.bestActions)
      ? Math.abs(actionDelta) / actionStats.robustScale
      : 0,
    scoreDelta,
    actionDelta
  };
}

function summarizeNormalRetainedBalance(entries = []) {
  const active = entries.filter((entry) => Number.isFinite(entry.balanceScore));
  if (!active.length) {
    return {
      count: 0,
      stdDev: 0,
      min: null,
      max: null,
      range: 0,
      worstScoreZ: 0,
      worstScoreIndex: null,
      worstActionZ: 0,
      worstActionIndex: null
    };
  }

  const values = active.map((entry) => entry.balanceScore);
  let worstScore = { z: -Infinity, index: null };
  let worstAction = { z: -Infinity, index: null };
  active.forEach((entry) => {
    const diagnostics = getNormalStartBalanceDiagnostics(entry, active, "balanceScore");
    if (diagnostics.scoreZ > worstScore.z) {
      worstScore = { z: diagnostics.scoreZ, index: entry.index };
    }
    if (diagnostics.actionZ > worstAction.z) {
      worstAction = { z: diagnostics.actionZ, index: entry.index };
    }
  });

  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    count: active.length,
    stdDev: Number(getNormalStartDispersion(active, "balanceScore").toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    range: Number((max - min).toFixed(2)),
    worstScoreZ: Number(Math.max(0, worstScore.z).toFixed(2)),
    worstScoreIndex: worstScore.index,
    worstActionZ: Number(Math.max(0, worstAction.z).toFixed(2)),
    worstActionIndex: worstAction.index
  };
}

function summarizePostBalanceStartResiduals(firstLeg, playerCount = 1) {
  const balance = firstLeg?.summary?.normalStartBalance ?? null;
  if (!balance?.active) {
    return null;
  }

  const excludedIndices = new Set([
    ...(balance.lightweightPruned ?? []),
    ...(balance.pressurePruned ?? []).map((entry) => entry.index),
    ...(balance.fullTrafficPruned ?? []).map((entry) => entry.index)
  ]);
  const active = getActivePruningStarts(firstLeg, excludedIndices)
    .filter((entry) => Number.isFinite(entry?.balanceScore));
  if (active.length < Math.max(2, playerCount || 1)) {
    return null;
  }

  const scoreCenter = averageValues(active.map((entry) => entry.balanceScore));
  const scoreStdDev = getNormalStartDispersion(active, "balanceScore");
  const actionValues = active.map((entry) => Number(entry.bestActions)).filter(Number.isFinite);
  const actionCenter = actionValues.length ? averageValues(actionValues) : 0;

  const componentSpecs = [
    {
      id: "traffic",
      label: "traffic pressure",
      value: (entry) => Number(entry.trafficPenalty ?? 0)
    },
    {
      id: "actions",
      label: "programmed route work",
      value: (entry) => Number(entry.selectedRoute?.actions ?? entry.bestActions)
    },
    {
      id: "hazard",
      label: "hazard exposure",
      value: (entry) => Number(entry.selectedRoute?.hazard ?? 0)
    },
    {
      id: "conveyor",
      label: "conveyor / forced-movement burden",
      value: (entry) => Number(entry.selectedRoute?.conveyorComplexity ?? 0)
    },
    {
      id: "forced",
      label: "forced movement",
      value: (entry) => Number(entry.selectedRoute?.forcedDistance ?? 0)
    },
    {
      id: "distance",
      label: "route distance",
      value: (entry) => Number(entry.selectedRoute?.distance ?? 0)
    }
  ];
  const componentStats = new Map(componentSpecs.map((spec) => {
    const values = active.map(spec.value).filter(Number.isFinite);
    const center = values.length ? averageValues(values) : 0;
    const stdDev = values.length >= 2
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length)
      : 0;
    return [spec.id, { center, stdDev }];
  }));

  const entries = active.map((entry) => {
    const scoreResidual = entry.balanceScore - scoreCenter;
    const actionResidual = Number.isFinite(entry.bestActions)
      ? entry.bestActions - actionCenter
      : 0;
    const scoreZ = scoreStdDev > 1e-9 ? scoreResidual / scoreStdDev : 0;
    const direction = scoreResidual < 0 ? -1 : 1;
    const reasonCandidates = componentSpecs.map((spec) => {
      const value = spec.value(entry);
      const stats = componentStats.get(spec.id);
      const delta = Number.isFinite(value) ? value - stats.center : 0;
      const z = stats.stdDev > 1e-9 ? delta / stats.stdDev : 0;
      return {
        id: spec.id,
        label: spec.label,
        value: Number.isFinite(value) ? Number(value.toFixed(2)) : null,
        delta: Number(delta.toFixed(2)),
        z: Number(z.toFixed(2)),
        alignedStrength: direction * z
      };
    });
    const alignedReasons = reasonCandidates
      .filter((reason) => reason.alignedStrength > 0.35)
      .sort((left, right) => (
        right.alignedStrength - left.alignedStrength ||
        Math.abs(right.delta) - Math.abs(left.delta) ||
        left.id.localeCompare(right.id)
      ));
    const dominantReason = alignedReasons[0] ?? null;

    return {
      index: entry.index,
      x: Number(entry.startAnalysis?.start?.x ?? entry.start?.x),
      y: Number(entry.startAnalysis?.start?.y ?? entry.start?.y),
      balanceScore: Number(entry.balanceScore.toFixed(2)),
      scoreResidual: Number(scoreResidual.toFixed(2)),
      scoreZ: Number(scoreZ.toFixed(2)),
      actions: Number.isFinite(entry.bestActions) ? entry.bestActions : null,
      actionResidual: Number(actionResidual.toFixed(2)),
      reasonId: dominantReason?.id ?? "overall",
      reasonLabel: dominantReason?.label ?? "overall route burden",
      reasonDelta: dominantReason?.delta ?? null,
      reasonZ: dominantReason?.z ?? null,
      reasonCandidates
    };
  });

  const absoluteFloor = Math.max(6, scoreStdDev * 0.8, Math.abs(scoreCenter) * 0.02);
  const notable = entries
    .filter((entry) => (
      Math.abs(entry.scoreZ) >= 1.15 &&
      Math.abs(entry.scoreResidual) >= absoluteFloor
    ))
    .sort((left, right) => (
      Math.abs(right.scoreZ) - Math.abs(left.scoreZ) ||
      Math.abs(right.scoreResidual) - Math.abs(left.scoreResidual) ||
      left.index - right.index
    ));

  const easiest = [...entries].sort((left, right) => (
    left.scoreResidual - right.scoreResidual || left.index - right.index
  ))[0] ?? null;
  const toughest = [...entries].sort((left, right) => (
    right.scoreResidual - left.scoreResidual || left.index - right.index
  ))[0] ?? null;
  const strongest = notable[0] ?? null;
  const courseNoteFloor = Math.max(8, Math.abs(scoreCenter) * 0.025);

  const reasonWeights = new Map();
  notable.forEach((entry) => {
    if (!entry.reasonId || entry.reasonId === "overall") return;
    reasonWeights.set(
      entry.reasonId,
      (reasonWeights.get(entry.reasonId) ?? 0) + Math.max(0.25, Math.abs(entry.reasonZ ?? 0))
    );
  });
  const dominantReasonId = [...reasonWeights.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
    ?? strongest?.reasonId
    ?? "overall";
  const dominantReasonLabel = componentSpecs.find((spec) => spec.id === dominantReasonId)?.label
    ?? "overall route burden";

  const courseNoteCandidate = strongest && Math.abs(strongest.scoreResidual) >= courseNoteFloor
    ? {
      active: true,
      kind: strongest.scoreResidual < 0 ? "cleaner-start" : "tougher-start",
      strength: Number(Math.min(2.5, Math.max(0, Math.abs(strongest.scoreZ) - 1)).toFixed(2)),
      severity: Math.abs(strongest.scoreZ) >= 1.7 ? "minor" : "trivial",
      reasonId: dominantReasonId,
      reasonLabel: dominantReasonLabel,
      notableCount: notable.length
    }
    : { active: false };

  return {
    active: true,
    stage: "post-final-normal-balance",
    metric: "full-course-balanceScore",
    retainedCount: entries.length,
    scoreCenter: Number(scoreCenter.toFixed(2)),
    scoreStdDev: Number(scoreStdDev.toFixed(2)),
    actionCenter: Number(actionCenter.toFixed(2)),
    notableThresholdZ: 1.15,
    notableAbsoluteFloor: Number(absoluteFloor.toFixed(2)),
    courseNoteAbsoluteFloor: Number(courseNoteFloor.toFixed(2)),
    notableCount: notable.length,
    notableIndices: notable.map((entry) => entry.index),
    easiestIndex: easiest?.index ?? null,
    toughestIndex: toughest?.index ?? null,
    entries,
    courseNoteCandidate
  };
}

function chooseNormalStartBalanceRemoval(entries, playerCount, stdDevLimit = null) {
  const minimumStarts = Math.max(1, playerCount || 1);
  // null/undefined mean "use the Normal default". Number(null) is 0 in JS,
  // so testing only Number.isFinite(Number(stdDevLimit)) would silently turn an
  // omitted limit into an impossible zero-dispersion target and prune until the
  // player-count floor.
  const hasExplicitStdDevLimit = stdDevLimit !== null && stdDevLimit !== undefined;
  const effectiveStdDevLimit = hasExplicitStdDevLimit && Number.isFinite(Number(stdDevLimit))
    ? Number(stdDevLimit)
    : getNormalStartFairnessStdDevLimit(entries.length, playerCount);
  if (entries.length <= minimumStarts) {
    return null;
  }

  const currentStdDev = getNormalStartDispersion(entries, "balanceScore");
  const rankedOutliers = rankNormalStartOutliers(
    entries,
    "balanceScore",
    FULL_START_OUTLIER_Z
  );

  if (rankedOutliers.length) {
    const ranked = rankedOutliers[0];
    const retained = entries.filter((entry) => entry.index !== ranked.entry.index);
    return {
      index: ranked.entry.index,
      score: ranked.entry.balanceScore,
      actions: ranked.entry.bestActions,
      balanceDispersionPruned: false,
      scoreZ: ranked.scoreZ,
      actionZ: ranked.actionZ,
      scoreDelta: ranked.scoreDelta,
      actionDelta: ranked.actionDelta,
      balanceStdDevBefore: currentStdDev,
      balanceStdDevAfterEstimate: getNormalStartDispersion(retained, "balanceScore"),
      balanceStdDevLimit: effectiveStdDevLimit
    };
  }

  if (currentStdDev <= effectiveStdDevLimit) {
    return null;
  }

  const candidates = entries.map((entry) => {
    const retained = entries.filter((item) => item.index !== entry.index);
    return {
      entry,
      scoreStdDev: getNormalStartDispersion(retained, "balanceScore"),
      actionStdDev: getNormalStartDispersion(retained, "bestActions")
    };
  }).sort((left, right) => (
    left.scoreStdDev - right.scoreStdDev ||
    left.actionStdDev - right.actionStdDev ||
    left.entry.index - right.entry.index
  ));

  const best = candidates[0];
  if (!best || best.scoreStdDev >= currentStdDev - 0.01) {
    return null;
  }

  const diagnostics = getNormalStartBalanceDiagnostics(best.entry, entries, "balanceScore");
  return {
    index: best.entry.index,
    score: best.entry.balanceScore,
    actions: best.entry.bestActions,
    balanceDispersionPruned: true,
    scoreZ: diagnostics.scoreZ,
    actionZ: diagnostics.actionZ,
    scoreDelta: diagnostics.scoreDelta,
    actionDelta: diagnostics.actionDelta,
    balanceStdDevBefore: currentStdDev,
    balanceStdDevAfterEstimate: best.scoreStdDev,
    balanceStdDevLimit: effectiveStdDevLimit
  };
}

function getCoursePreflightOpeningMinimum(startCount, playerCount, preferences = {}) {
  if (preferences.virtualBots) {
    return Math.min(startCount, 1);
  }
  if (preferences.payToWin) {
    return Math.min(startCount, Math.max(1, playerCount));
  }

  // Normal's hard preflight floor is only the number of robots that must be able
  // to start. Fairness surplus is decided later from full-course intrinsic quality
  // plus opening traffic; the cheap Flag-1 sketch must not pre-prune that choice.
  return Math.min(startCount, Math.max(1, playerCount));
}

function uniquePreflightStates(routes = []) {
  const seen = new Set();
  const states = [];
  for (const route of routes) {
    const state = route?.finalState;
    if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) continue;
    const key = `${state.x},${state.y},${state.facing ?? "E"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    states.push({ x: state.x, y: state.y, facing: state.facing ?? "E" });
  }
  return states;
}

function buildCoursePreflightSequence(tileMap, starts, flags, playerCount, options = {}) {
  const generationProfile = getGenerationModeProfile(options);
  if (!flags.length || !starts.length) {
    return {
      valid: false,
      reason: "no starts or checkpoints available for preflight",
      opening: null,
      sequence: null,
      openingRoutedCount: 0,
      requiredOpeningCount: 0,
      intrinsicOutliers: [],
      excludedIndices: new Set(),
      laterLegs: []
    };
  }

  const movingTargetTimelines = options.movingTargetTimelines ?? buildMovingTargetTimelines(
    tileMap,
    flags,
    options.movingTargets,
    { maxActions: 16 }
  );
  const firstGoal = flags[0];
  const requiredOpeningCount = getCoursePreflightOpeningMinimum(
    starts.length,
    playerCount,
    options
  );
  const opening = analyzeCourse(tileMap, starts, firstGoal, {
    flags: [firstGoal],
    maxRoutes: 1,
    skipTraffic: true,
    playerCount,
    maxActions: COURSE_PREFLIGHT_OPENING_MAX_ACTIONS,
    maxExpansions: Math.min(generationProfile.preflightOpeningExpansions, 700),
    physicalTimingOnly: true,
    physicalTelemetryKind: "physical-preflight-opening",
    optionalTemplateExpansions: 60,
    requiredReachableStarts: requiredOpeningCount,
    preferredReachableStarts: null,
    stopWhenPreferredReachableLost: false,
    recoveryRule: options.recoveryRule,
    ...getRouteAnalysisVariantOptions(options),
    startupSpinUp: options.startupSpinUp,
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoal: movingTargetTimelines?.[0] ?? null
  });
  const routedOpening = opening.starts.filter((analysis) => (
    analysis.reachable && analysis.selectedRoute
  ));

  // v23: preflight is an audition, never a Normal start-quality prune. The first
  // real prune happens only after every detailed candidate has a full-course
  // intrinsic route and Flag-1 traffic score.
  const normalOpeningPruning = {
    outliers: [],
    excludedIndices: new Set(),
    minimumPool: starts.length
  };

  const unresolvedOpeningCount = opening.summary?.capacityShortCircuit?.unresolvedStarts ?? 0;
  const incompleteOpeningSketch = routedOpening.length < requiredOpeningCount
    ? {
      routedStarts: routedOpening.length,
      requiredStarts: requiredOpeningCount,
      cappedOrUnresolvedStarts: unresolvedOpeningCount
    }
    : null;

  // The rest of preflight is deliberately representative, not a coherent
  // proof for every start. Its only job is to estimate the course profile and
  // detect a continuation that is obviously hostile to cheap routing.
  let routeStates = uniquePreflightStates(
    routedOpening.map((analysis) => analysis.selectedRoute)
  );
  const laterLegs = [];
  let incompleteLaterSketch = null;

  for (let legIndex = 1; legIndex < flags.length; legIndex += 1) {
    const leg = analyzeFlagLeg(tileMap, flags[legIndex - 1], flags[legIndex], {
      routesPerFacing: 1,
      maxDistinctRoutes: 4,
      maxActions: COURSE_PREFLIGHT_LATER_MAX_ACTIONS,
      maxExpansions: Math.min(generationProfile.preflightLaterExpansions, 600),
      physicalTimingOnly: true,
      physicalTelemetryKind: "physical-preflight-leg",
      optionalTemplateExpansions: 60,
      startStates: routeStates,
      playerCount,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: movingTargetTimelines?.[legIndex] ?? null
    });

    if (!leg.distinctRoutes?.length) {
      const cappedZeroRouteStarts = leg.summary?.routeSearchHealth?.cappedZeroRouteStarts ?? 0;
      incompleteLaterSketch = {
        leg: legIndex + 1,
        reason: cappedZeroRouteStarts > 0 ? "expansion-cap" : "cheap-horizon-exhausted",
        cappedZeroRouteStarts
      };
      break;
    }

    const intrinsicLeg = {
      ...leg,
      summary: {
        ...leg.summary,
        congestionScore: 0,
        diversityScore: 0,
        intraLegOverlap: 0,
        crossLegOverlap: 0,
        intraLegThreat: 0,
        crossLegThreat: 0
      }
    };
    laterLegs.push(intrinsicLeg);
    routeStates = uniquePreflightStates(leg.distinctRoutes);
  }

  const firstLeg = {
    ...opening,
    flags,
    summary: {
      ...opening.summary,
      averageTrafficPenalty: 0,
      averageOverlapPenalty: 0,
      averageLateralThreat: 0,
      averageRearThreat: 0
    }
  };
  const legs = [
    { from: "dock", to: 1, analysis: firstLeg },
    ...laterLegs.map((leg, index) => ({
      from: index + 1,
      to: index + 2,
      analysis: leg
    }))
  ];
  const totalDifficulty = Number((
    (firstLeg.summary.difficultyScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteScore ?? 0), 0)
  ).toFixed(2));
  const totalLength = Number((
    (firstLeg.summary.lengthScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteDistance ?? 0), 0)
  ).toFixed(2));
  const totalActions = Number((
    (firstLeg.summary.actionScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteActions ?? 0), 0)
  ).toFixed(2));

  return {
    valid: true,
    reason: null,
    opening,
    openingRoutedCount: routedOpening.length,
    requiredOpeningCount,
    intrinsicOutliers: normalOpeningPruning.outliers,
    excludedIndices: normalOpeningPruning.excludedIndices,
    laterLegs,
    incompleteOpeningSketch,
    incompleteLaterSketch,
    sequence: {
      starts,
      firstLeg,
      legs,
      movingTargetTimelines,
      summary: {
        totalDifficulty,
        totalLength,
        totalActions
      }
    }
  };
}

function buildRouteAwareBatteryScoringOptions(coursePreflight, options = {}) {
  // Design invariant: Energy Crisis / A Lighter Game is currently the only rule
  // that removes Energy and upgrades from route quality. Missing calibration
  // evidence may force a conservative fallback estimate, but must not silently
  // turn the economy off on an otherwise normal course.
  if (options.lighterGame) {
    return { routeAwareBatteryScoring: false };
  }

  const config = getRouteEnergyEconomyConfig(options);
  const horizonActions = Number(coursePreflight?.sequence?.summary?.totalActions);
  const measuredHorizonTurns = Number.isFinite(horizonActions) && horizonActions > 0
    ? horizonActions / config.registersPerTurn
    : 0;
  const registerSamples = [];
  const addRoute = (route) => {
    const actions = Number(route?.actions);
    const score = Number(route?.score);
    if (Number.isFinite(actions) && actions > 0 && Number.isFinite(score) && score > 0) {
      registerSamples.push(score / actions);
    }
  };

  (coursePreflight?.opening?.starts || []).forEach((analysis) => {
    if (analysis?.reachable) addRoute(analysis.selectedRoute);
  });
  (coursePreflight?.laterLegs || []).forEach((leg) => {
    (leg?.distinctRoutes || []).forEach(addRoute);
  });

  const measuredRegisterScore = medianValue(registerSamples);
  const fallbackHorizonTurns = Number(options.routeEnergyHorizonTurns) > 0
    ? Number(options.routeEnergyHorizonTurns)
    : 4;
  const fallbackRegisterScore = Number(options.routeEnergyRegisterScore) > 0
    ? Number(options.routeEnergyRegisterScore)
    : 6.4;
  const horizonTurns = measuredHorizonTurns > 0
    ? measuredHorizonTurns
    : fallbackHorizonTurns;
  const registerScore = measuredRegisterScore > 0
    ? measuredRegisterScore
    : fallbackRegisterScore;

  return {
    routeAwareBatteryScoring: true,
    routeEnergyHorizonTurns: Number(horizonTurns.toFixed(3)),
    routeEnergyRegisterScore: Number(registerScore.toFixed(3)),
    // Carry resolved economy parameters with the production scorer so later
    // setup variants can change them without hidden 3E/3-card assumptions.
    startingEnergy: config.startingEnergy,
    startingUpgradeCards: config.startingUpgradeCards,
    maxEnergy: config.maxEnergy,
    upgradeDrawsPerTurn: config.drawsPerTurn,
    upgradeInstallsPerTurn: config.installsPerTurn,
    upgradeDrawEnergyCost: config.drawEnergyCost,
    upgradeUsefulCardRate: config.usefulUpgradeCardRate,
    upgradeUsefulEnergyPerInstall: config.usefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: config.powerRegistersPerEnergy,
    routeRegistersPerTurn: config.registersPerTurn,
    // v18 keeps only reserve + race progress in production search. Unknown
    // upgrade cards are valued immediately as expectations; no persistent card
    // shadow survives into route dominance/cache state. The reference reserve
    // remains useful for Pay to Win / Subsidized Starts fixed-route repricing.
    routeEnergyReferenceReserve: config.startingEnergy
  };
}

function getPreflightGrossCourseMismatch(metrics, preferences = {}) {
  const difficultyBand = GROSS_DIFFICULTY_ABORT_BANDS[preferences.difficulty];
  const lengthBand = GROSS_LENGTH_ABORT_BANDS[preferences.length];

  if (difficultyBand && Number.isFinite(metrics?.difficultyRaw)) {
    if (
      Number.isFinite(difficultyBand.min) &&
      metrics.difficultyRaw + COURSE_PREFLIGHT_DIFFICULTY_MARGIN < difficultyBand.min
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
      metrics.difficultyRaw - COURSE_PREFLIGHT_DIFFICULTY_MARGIN > difficultyBand.max
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

  if (lengthBand && Number.isFinite(metrics?.lengthRaw)) {
    if (
      Number.isFinite(lengthBand.min) &&
      metrics.lengthRaw + COURSE_PREFLIGHT_LENGTH_MARGIN < lengthBand.min
    ) {
      return {
        abort: true,
        reason: "length-too-low",
        metric: "length",
        value: metrics.lengthRaw,
        limit: lengthBand.min,
        requested: preferences.length
      };
    }
    if (
      Number.isFinite(lengthBand.max) &&
      metrics.lengthRaw - COURSE_PREFLIGHT_LENGTH_MARGIN > lengthBand.max
    ) {
      return {
        abort: true,
        reason: "length-too-high",
        metric: "length",
        value: metrics.lengthRaw,
        limit: lengthBand.max,
        requested: preferences.length
      };
    }
  }

  return { abort: false };
}

function classifyCoursePreflight(preflight, preferences, context = {}) {
  if (!preflight?.sequence) return null;
  if (preflight.incompleteOpeningSketch || preflight.incompleteLaterSketch) {
    return {
      difficultyRaw: null,
      lengthRaw: null,
      lengthFitRaw: null,
      lengthMetrics: null,
      incompleteOpeningSketch: preflight.incompleteOpeningSketch ?? null,
      incompleteLaterSketch: preflight.incompleteLaterSketch ?? null
    };
  }
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints, preferences)
    : summarizeMovingTargets(null, [], preferences);
  const difficultyRaw = applyVariantDifficultyModifiers(
    computeDifficultyRaw(preflight.sequence, checkpointPressure),
    {
      ...preferences,
      movingTargetStats,
      goalTileMap: context.goalTileMap ?? context.tileMap
    },
    preflight.sequence
  );
  const lengthMetrics = computeLengthMetrics(
    preflight.sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );

  return {
    difficultyRaw,
    lengthRaw: lengthMetrics.raw,
    lengthFitRaw: shouldUseCompactLengthFit(preferences)
      ? lengthMetrics.compactnessRaw
      : lengthMetrics.raw,
    lengthMetrics
  };
}

// Legacy diagnostic helper. v33 production Normal no longer calls this as a
// pruning/eligibility stage; all structural starts go to full-course routing first.
function mergeLightweightPrunedStarts(firstLeg, prePruning, originalStartCount) {
  if (!prePruning.excludedIndices.size) {
    return firstLeg;
  }

  const fullByIndex = new Map(firstLeg.starts.map((analysis) => [analysis.index, analysis]));
  const lightweightByIndex = new Map(prePruning.analyses.map((analysis) => [analysis.index, analysis]));
  const mergedStarts = [];

  for (let index = 0; index < originalStartCount; index += 1) {
    if (fullByIndex.has(index)) {
      mergedStarts.push(fullByIndex.get(index));
      continue;
    }

    const lightweight = lightweightByIndex.get(index);
    if (!lightweight) {
      continue;
    }

    mergedStarts.push({
      ...lightweight,
      prePruned: true,
      fullCourseRoutes: [],
      fullCourseRoute: null,
      fullCourseRouteIndex: null,
      fullCourseTrafficPenalty: 0,
      courseEstimate: null,
      courseScoreAdjustment: 0
    });
  }

  return {
    ...firstLeg,
    starts: mergedStarts,
    summary: {
      ...firstLeg.summary,
      totalStarts: originalStartCount,
      // Pre-pruned starts only had the cheap first-leg check, so do not count
      // them as full-course reachable without running the expensive search.
      reachableStarts: firstLeg.summary.reachableStarts,
      outliers: [
        ...prePruning.outliers,
        ...(firstLeg.summary.outliers || []).filter((outlier) => !prePruning.excludedIndices.has(outlier.index))
      ],
      lightweightStartPruning: {
        active: true,
        minimumPool: prePruning.minimumPool,
        pruned: prePruning.outliers.map((outlier) => outlier.index),
        maxExpansions: LIGHT_START_MAX_EXPANSIONS
      }
    }
  };
}

function interleaveStartsByDock(starts = [], dockPlacements = [], pieceMap = {}) {
  const queues = dockPlacements.map((dockPlacement, dockIndex) => ({
    dockIndex,
    starts: starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap))
  }));
  const unassigned = starts.filter((start) => !dockPlacements.some((dockPlacement) => (
    pointOnPlacement(start, dockPlacement, pieceMap)
  )));
  const ordered = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const queue of queues) {
      if (!queue.starts.length) continue;
      ordered.push({ start: queue.starts.shift(), dockIndex: queue.dockIndex });
      progressed = true;
    }
  }

  unassigned.forEach((start) => ordered.push({ start, dockIndex: null }));
  return ordered;
}

function screenSandwichedExtraDockOpening(
  tileMap,
  starts,
  goal,
  dockPlacements,
  pieceMap,
  playerCount,
  options = {}
) {
  const generationProfile = getGenerationModeProfile(options);
  if (!goal || (dockPlacements?.length ?? 0) < 2 || options.movingTargets) {
    return { valid: true, tested: 0, reachable: 0, dockCoverage: 0, skipped: true };
  }

  const requiredReachable = Math.max(1, Number(playerCount ?? 1));
  const ordered = interleaveStartsByDock(starts, dockPlacements, pieceMap);
  const reachableDockIndices = new Set();
  let reachable = 0;
  let tested = 0;

  for (let offset = 0; offset < ordered.length; offset += 1) {
    const { start, dockIndex } = ordered[offset];
    tested += 1;
    const lightweight = analyzeCourse(tileMap, [start], goal, {
      flags: [goal],
      maxRoutes: 1,
      skipTraffic: true,
      playerCount: Math.max(1, Number(playerCount ?? 1)),
      maxActions: Math.max(24, LIGHT_START_MAX_ACTIONS),
      maxExpansions: generationProfile.lightStartExpansions,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
    });
    const analysis = lightweight.starts?.[0];
    if (analysis?.reachable && analysis.selectedRoute) {
      reachable += 1;
      if (dockIndex !== null) reachableDockIndices.add(dockIndex);
    }

    const everyDockRepresented = dockPlacements.every((_, index) => reachableDockIndices.has(index));
    if (reachable >= requiredReachable && everyDockRepresented) {
      return {
        valid: true,
        tested,
        reachable,
        dockCoverage: reachableDockIndices.size,
        skipped: false
      };
    }

    const remaining = ordered.length - offset - 1;
    if (reachable + remaining < requiredReachable) break;

    const uncoveredDockWithoutRemainingStart = dockPlacements.some((_, dockIndexCandidate) => (
      !reachableDockIndices.has(dockIndexCandidate) &&
      !ordered.slice(offset + 1).some((item) => item.dockIndex === dockIndexCandidate)
    ));
    if (uncoveredDockWithoutRemainingStart) break;
  }

  return {
    valid: false,
    tested,
    reachable,
    dockCoverage: reachableDockIndices.size,
    skipped: false
  };
}

function adjustNormalStartsAfterFullTraffic(
  firstLeg,
  totalLength,
  tileMap,
  playerCount,
  options = {}
) {
  const previousBalance = firstLeg.summary?.normalStartBalance ?? {};
  const initialExcludedIndices = new Set([
    ...(previousBalance.lightweightPruned ?? []),
    ...(previousBalance.pressurePruned ?? []).map((entry) => entry.index)
  ]);
  const analysisOptions = {
    ...getRouteAnalysisVariantOptions(options),
    playerCount,
    openingTrafficOnly: false,
    balanceTrafficScope: "full",
    trafficOccupancyUseBalanceScore: true,
    carryOccupancyScores: true,
    fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? 1
  };
  const initialActive = getActivePruningStarts(firstLeg, initialExcludedIndices);
  const initialStdDev = getNormalStartDispersion(initialActive, "balanceScore");
  const initialBalanceStdDevLimit = getNormalStartFairnessStdDevLimit(
    initialActive.length,
    playerCount
  );
  const maxIterations = Math.max(
    0,
    Math.min(
      Number(options.normalFullTrafficPrunePasses) || 0,
      initialActive.length - Math.max(1, playerCount || 1)
    )
  );

  if (!(maxIterations > 0)) {
    const remainingOutliers = rankNormalStartOutliers(
      initialActive,
      "balanceScore",
      FULL_START_OUTLIER_Z
    );
    const reject = (
      remainingOutliers.length > 0 ||
      initialStdDev > initialBalanceStdDevLimit
    );
    return {
      ...firstLeg,
      summary: {
        ...firstLeg.summary,
        normalStartBalance: {
          ...previousBalance,
          fullTrafficFeedback: true,
          fullTrafficIterations: 0,
          fullTrafficPruned: [],
          balanceStdDevAfterFullTraffic: Number(initialStdDev.toFixed(2)),
          balanceStdDevAfter: Number(initialStdDev.toFixed(2)),
          balanceStdDevLimit: initialBalanceStdDevLimit,
          remainingBadStarts: remainingOutliers.map((item) => ({
            index: item.entry.index,
            score: item.score,
            scoreZ: Number(item.scoreZ.toFixed(2)),
            actionZ: Number(item.actionZ.toFixed(2))
          })),
          reject
        }
      }
    };
  }

  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ activeStarts }) => chooseNormalStartBalanceRemoval(
      activeStarts,
      playerCount
    ),
    {
      initialExcludedIndices: [...initialExcludedIndices],
      inputAlreadyReflectsExcluded: true,
      pruneBatchSize: options.normalPruneBatchSize ?? getNormalStartPruneBatchSize,
      maxPasses: maxIterations
    }
  );

  const remainingActive = getActivePruningStarts(
    result.currentFirstLeg,
    result.excludedIndices
  );
  const remainingOutliers = rankNormalStartOutliers(
    remainingActive,
    "balanceScore",
    FULL_START_OUTLIER_Z
  );
  const remainingStdDev = getNormalStartDispersion(
    remainingActive,
    "balanceScore"
  );
  const finalBalanceStdDevLimit = getNormalStartFairnessStdDevLimit(
    remainingActive.length,
    playerCount
  );
  const newRemovals = result.removals.filter((removed) => (
    !initialExcludedIndices.has(removed.index)
  )).map((removed, removalIndex) => ({
    index: removed.index,
    score: removed.score,
    actions: removed.actions,
    pass: removed.pass,
    diagnostics: {
      normalBalancePruned: true,
      balanceDispersionPruned: Boolean(removed.balanceDispersionPruned),
      stage: removed.balanceDispersionPruned
        ? "iterative-full-traffic-dispersion"
        : "iterative-full-traffic-outlier",
      scoreZ: Number((removed.scoreZ ?? 0).toFixed(2)),
      actionZ: Number((removed.actionZ ?? 0).toFixed(2)),
      scoreDelta: Number((removed.scoreDelta ?? 0).toFixed(2)),
      actionDelta: Number((removed.actionDelta ?? 0).toFixed(2)),
      balanceStdDevBefore: Number((removed.balanceStdDevBefore ?? 0).toFixed(2)),
      balanceStdDevAfterEstimate: Number((removed.balanceStdDevAfterEstimate ?? 0).toFixed(2)),
      balanceStdDevLimit: Number((removed.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT).toFixed(2)),
      removalReason: "removed after full-course traffic/rerouting, then recomputed occupancy before the next feedback pass",
      totalCourseLength: Number((totalLength || 0).toFixed(2)),
      fullTrafficRemovalIndex: removalIndex
    }
  }));
  const combinedPressurePruned = [
    ...(previousBalance.pressurePruned ?? []),
    ...newRemovals
  ];
  const reject = (
    remainingOutliers.length > 0 ||
    remainingStdDev > finalBalanceStdDevLimit
  );

  return {
    ...result.currentFirstLeg,
    summary: {
      ...result.currentFirstLeg.summary,
      outliers: [
        ...(firstLeg.summary?.outliers ?? []),
        ...newRemovals.map((removal) => ({
          index: removal.index,
          score: removal.score,
          delta: 0,
          actionDelta: Number(removal.actions ?? 0),
          reasons: removal.diagnostics
        }))
      ],
      normalStartBalance: {
        ...previousBalance,
        pressurePruned: combinedPressurePruned,
        dispersionPruned: combinedPressurePruned
          .filter((item) => item.diagnostics?.balanceDispersionPruned)
          .map((item) => item.index),
        fullTrafficFeedback: true,
        fullTrafficIterations: new Set(newRemovals.map((item) => item.pass)).size,
        fullTrafficPruned: newRemovals,
        trafficRecomputations: (previousBalance.trafficRecomputations ?? 0) +
          new Set(newRemovals.map((item) => item.pass)).size,
        balanceStdDevBeforeFullTraffic: Number(initialStdDev.toFixed(2)),
        balanceStdDevAfterFullTraffic: Number(remainingStdDev.toFixed(2)),
        balanceStdDevAfter: Number(remainingStdDev.toFixed(2)),
        balanceStdDevLimit: finalBalanceStdDevLimit,
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          score: item.score,
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        reject
      }
    }
  };
}

function analyzeFlagSequence(tileMap, starts, flags, playerCount, options = {}) {
  const generationProfile = getGenerationModeProfile(options);
  // v35: generation modes are effort envelopes around one Normal model. They do
  // not select different route/fairness objectives. Dev View may still explicitly
  // disable traffic or traffic exploration for controlled comparisons.
  const trafficEnabled = typeof options.trafficEnabledOverride === "boolean"
    ? options.trafficEnabledOverride
    : Boolean(
      options.fastBaselineTrafficEnabled === true ||
      options.modeTrafficEnabled === true ||
      generationProfile.trafficEnabled === true
    );
  const trafficFeedbackLoopEnabled = Boolean(
    trafficEnabled &&
    options.contextualEstimatedPrimaryRouting &&
    (options.contextualTrafficFeedbackEnabled !== false) &&
    (Number(options.contextualTrafficEpochs ?? generationProfile.trafficEpochs) || 0) > 0
  );
  const trafficDrivenAlternatesEnabled = Boolean(
    trafficFeedbackLoopEnabled &&
    (options.contextualTrafficDrivenAlternates !== false)
  );
  const contextualOpeningRoutes = 1;
  const contextualLaterRoutes = 1;
  const contextualBeamWidth = 1;
  const contextualCompletionPool = 1;
  const contextualOptionalCompletionExpansions = 0;
  const contextualFullForecastShare = NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE;
  const contextualOpeningExpansions = options.contextualOpeningExpansions ?? generationProfile.preflightOpeningExpansions;
  const contextualLaterExpansions = options.contextualLaterExpansions ?? generationProfile.preflightLaterExpansions;
  const fullCourseTrafficScoringEnabled = Boolean(
    trafficEnabled &&
    options.contextualEstimatedPrimaryRouting
  );
  const normalOpeningTrafficFirst = Boolean(
    trafficEnabled &&
    !fullCourseTrafficScoringEnabled &&
    !options.virtualBots &&
    !options.payToWin &&
    !options.subsidizedStarts &&
    !options.skipNormalStartBalancing &&
    !options.skipFullCourseTraffic
  );
  const movingTargetTimelines = options.movingTargetTimelines ?? buildMovingTargetTimelines(
    tileMap,
    flags,
    options.movingTargets,
    { maxActions: options.movingTargetMaxActions ?? 16 }
  );
  // v33 production invariant: every structural start enters the contextual
  // estimate→realize pipeline. The old lightweight first-leg pruning helper is
  // retained below only for historical/targeted diagnostics; it is not a Normal
  // eligibility stage and cannot hide a start before full-course routing.
  const contextualLegSearch = true;
  const prePruning = {
    starts: starts.map((start, index) => ({
      ...start,
      analysisIndex: Number.isInteger(start.analysisIndex)
        ? start.analysisIndex
        : index
    })),
    analyses: [],
    excludedIndices: new Set(),
    outliers: [],
    minimumPool: starts.length,
    active: false
  };
  const lateRouteCount = contextualLaterRoutes;
  const fullCourseAnalyzer = typeof options.fullCourseAnalyzer === "function"
    ? options.fullCourseAnalyzer
    : analyzeFullCourse;
  const analyzedFirstLeg = fullCourseAnalyzer(
    tileMap,
    prePruning.starts,
    flags,
    getPayToWinAnalysisOptions({
      maxRoutes: lateRouteCount,
      maxActions: Math.max(24, flags.length * 18 + 8),
      maxExpansions: generationProfile.fullCourseExpansions,
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
      flags,
      playerCount,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoals: movingTargetTimelines,
      payToWin: options.payToWin,
      competitiveMode: options.competitiveMode,
      virtualBots: options.virtualBots,
      contextualLegSearch,
      contextualEarlyExit: Boolean(options.contextualEarlyExit),
      contextualOpeningRoutes,
      contextualLaterRoutes,
      contextualBeamWidth,
      contextualCompletionPool,
      contextualOptionalCompletionExpansions,
      contextualFullForecastShare,
      contextualUncertaintyBreadth: Boolean(
        options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
      ),
      contextualSharedLaterLegCatalogue: Boolean(options.contextualSharedLaterLegCatalogue),
      contextualEstimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
      contextualEstimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
      contextualTrafficFeedbackEnabled: trafficFeedbackLoopEnabled,
      contextualTrafficDrivenAlternates: trafficDrivenAlternatesEnabled,
      contextualTrafficEpochs: options.contextualTrafficEpochs ?? generationProfile.trafficEpochs,
      contextualTrafficAlternateDemandThreshold:
        options.contextualTrafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      contextualTrafficAlternateMinGain:
        options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      contextualTrafficAlternateMaxNewSearchesPerEpoch:
        options.contextualTrafficAlternateMaxNewSearchesPerEpoch ??
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      contextualTrafficAlternateExpansions:
        options.contextualTrafficAlternateExpansions ?? generationProfile.trafficAlternateExpansions,
      contextualTrafficAlternateMaxActions:
        options.contextualTrafficAlternateMaxActions ?? generationProfile.trafficAlternateMaxActions,
      contextualTrafficAlternateCachedProbeMargin:
        options.contextualTrafficAlternateCachedProbeMargin ?? generationProfile.trafficAlternateCachedProbeMargin,
      contextualTrafficAlternateCachedProbeMaxSimilarity:
        options.contextualTrafficAlternateCachedProbeMaxSimilarity ?? generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      contextualTrafficAlternateLegsPerStart:
        options.contextualTrafficAlternateLegsPerStart ?? generationProfile.trafficAlternateLegsPerStart,
      contextualTrafficExplorationUncertaintyShare:
        options.contextualTrafficExplorationUncertaintyShare ?? generationProfile.trafficExplorationUncertaintyShare,
      contextualTrafficExplorationConfidenceFloor:
        options.contextualTrafficExplorationConfidenceFloor ?? generationProfile.trafficExplorationConfidenceFloor,
      contextualTrafficAlternateUncertaintyEffortFloor:
        options.contextualTrafficAlternateUncertaintyEffortFloor ?? generationProfile.trafficAlternateUncertaintyEffortFloor,
      contextualTrafficAlternateUncertaintyEffortExponent:
        options.contextualTrafficAlternateUncertaintyEffortExponent ?? generationProfile.trafficAlternateUncertaintyEffortExponent,
      contextualTrafficUncertainty: options.contextualTrafficUncertainty,
      contextualSeedStartAnalyses: options.contextualSeedStartAnalyses,
      contextualSeedRouteStrategy: options.contextualSeedRouteStrategy,
      contextualOpeningSeedAnalyses: options.contextualOpeningSeedAnalyses,
      contextualRequiredStarts: options.contextualRequiredStarts,
      contextualPreferredStarts: options.contextualPreferredStarts,
      contextualStopWhenPreferredLost: options.contextualStopWhenPreferredLost,
      contextualOpeningExpansions,
      contextualLaterExpansions,
      contextualLegMaxActions: options.contextualLegMaxActions,
      contextualPhysicalTemplateRoutes: options.contextualPhysicalTemplateRoutes,
      contextualPrimaryWitnessRoutes: options.contextualPrimaryWitnessRoutes,
      contextualPhysicalTemplateExpansions: options.contextualPhysicalTemplateExpansions,
      contextualPhysicalTemplateMaxActions: options.contextualPhysicalTemplateMaxActions,
      contextualExactRepairExpansions: options.contextualExactRepairExpansions,
      contextualDetailedProfiling: Boolean(options.contextualDetailedProfiling),
      contextualDominanceKeyProfiling: Boolean(options.contextualDominanceKeyProfiling),
      cooperativeYield: options.cooperativeYield,
      shouldStopRequested: options.shouldStopRequested,
      contextualFastCardState: options.contextualFastCardState !== false,
      skipTraffic: Boolean(options.skipTraffic || !trafficEnabled),
      // The new loop evaluates full-course traffic before the stable pruning
      // checkpoint. Legacy opening-first traffic remains available outside the
      // estimate→realize path.
      trafficOccupancyUseBalanceScore: normalOpeningTrafficFirst,
      balanceTrafficScope: fullCourseTrafficScoringEnabled ? "full" : options.balanceTrafficScope,
      skipFullCourseTraffic: Boolean(
        options.skipFullCourseTraffic || !trafficEnabled || normalOpeningTrafficFirst
      ),
      diverseFullCourseSearch: false
    }, playerCount)
  );
  const finishSequence = (firstLeg) => {

  if (firstLeg?.summary) {
    // Keep the effective contextual contract beside the route diagnostics so a
    // future propagation regression is visible immediately in Dev View.
    firstLeg.summary.contextualSearchProfile = {
      generationMode: normalizeGenerationMode(options.generationMode),
      generationModeLabel: formatGenerationModeLabel(options.generationMode),
      primaryRoutePolicy: "single-estimate+internal-witnesses",
      uncertaintyBreadth: Boolean(
        options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
      ),
      uncertaintyMechanism: options.contextualEstimatedPrimaryRouting
        ? "soft-estimate+exact-whole-route-realization"
        : "exact-card-count-state",
      fastCardState: options.contextualFastCardState !== false,
      trafficEnabled,
      trafficFeedbackLoopEnabled,
      trafficAlternatesEnabled: trafficDrivenAlternatesEnabled,
      trafficEpochs: trafficFeedbackLoopEnabled
        ? (options.contextualTrafficEpochs ?? generationProfile.trafficEpochs)
        : 0,
      trafficAlternateDemandThreshold:
        options.contextualTrafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      trafficAlternateMinGain:
        options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      trafficAlternateMaxNewSearchesPerEpoch:
        options.contextualTrafficAlternateMaxNewSearchesPerEpoch ??
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      trafficAlternateExpansions:
        options.contextualTrafficAlternateExpansions ?? generationProfile.trafficAlternateExpansions,
      trafficAlternateMaxActions:
        options.contextualTrafficAlternateMaxActions ?? generationProfile.trafficAlternateMaxActions,
      trafficAlternateCachedProbeMargin:
        options.contextualTrafficAlternateCachedProbeMargin ?? generationProfile.trafficAlternateCachedProbeMargin,
      trafficAlternateCachedProbeMaxSimilarity:
        options.contextualTrafficAlternateCachedProbeMaxSimilarity ?? generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      trafficExplorationUncertaintyShare:
        options.contextualTrafficExplorationUncertaintyShare ?? generationProfile.trafficExplorationUncertaintyShare,
      trafficExplorationConfidenceFloor:
        options.contextualTrafficExplorationConfidenceFloor ?? generationProfile.trafficExplorationConfidenceFloor,
      trafficAlternateUncertaintyEffortFloor:
        options.contextualTrafficAlternateUncertaintyEffortFloor ?? generationProfile.trafficAlternateUncertaintyEffortFloor,
      trafficAlternateUncertaintyEffortExponent:
        options.contextualTrafficAlternateUncertaintyEffortExponent ?? generationProfile.trafficAlternateUncertaintyEffortExponent,
      estimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
      normalPruneBatchSize: options.normalPruneBatchSize ?? NORMAL_PRUNE_BATCH_SIZE,
      normalPruneBatchPolicy: options.normalPruneBatchSize !== null &&
        options.normalPruneBatchSize !== undefined &&
        Number.isFinite(Number(options.normalPruneBatchSize))
        ? "fixed"
        : "adaptive-2-above-2x-players-else-1",
      sharedLaterLegCatalogue: Boolean(options.contextualSharedLaterLegCatalogue),
      estimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
      openingExpansions: contextualOpeningExpansions,
      laterExpansions: contextualLaterExpansions,
      physicalTemplateRoutes: options.contextualPhysicalTemplateRoutes ?? 3,
      primaryWitnessRoutes: options.contextualPrimaryWitnessRoutes ?? 3,
      arrivalClassRouting: Boolean(options.contextualSharedLaterLegCatalogue),
      physicalTemplateExpansions: options.contextualPhysicalTemplateExpansions ?? 700,
      physicalTemplateMaxActions: options.contextualPhysicalTemplateMaxActions ?? 36,
      exactRepairExpansions: options.contextualExactRepairExpansions ?? 550
    };
  }

  const legs = [
    {
      from: "dock",
      to: 1,
      analysis: firstLeg
    }
  ];

  (firstLeg.expectedLegAnalyses || []).forEach((analysis, index) => {
    legs.push({
      from: index + 1,
      to: index + 2,
      analysis
    });
  });

  const totalLength = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.lengthScore !== undefined) {
      return sum + leg.analysis.summary.lengthScore;
    }

    return sum + leg.analysis.summary.averageRouteDistance;
  }, 0);
  const totalActions = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.actionScore !== undefined) {
      return sum + leg.analysis.summary.actionScore;
    }

    return sum + (leg.analysis.summary.averageRouteActions || 0);
  }, 0);
  // v36: Competitive uses the same route construction, programming realization,
  // Energy valuation and traffic model as Normal. The only semantic fork is the
  // pruning stage: P players make P sequential optimal blocks, one at a time,
  // then the best P remaining starts are evaluated against Normal's fairness bar.
  const courseAdjustedFirstLeg = options.competitiveMode
    ? applyCompetitiveStrategicBlocking(firstLeg, tileMap, playerCount, {
      ...options,
      skipTraffic: Boolean(options.skipTraffic || !trafficEnabled),
      competitiveBlockTrafficScope: trafficFeedbackLoopEnabled ? "full" : "opening",
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES
    })
    : (options.virtualBots || options.skipNormalStartBalancing)
      ? {
        ...firstLeg,
        summary: {
          ...firstLeg.summary,
          outliers: []
        }
      }
      : (options.payToWin || options.subsidizedStarts)
        ? options.skipStartEnergyPricing
          ? {
            ...firstLeg,
            summary: {
              ...firstLeg.summary,
              outliers: []
            }
          }
          : applyPayToWinStartPricing(firstLeg, tileMap, playerCount, {
            ...options,
            totalActions,
            totalLength
          })
        : adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, {
          ...getRouteAnalysisVariantOptions(options),
          totalActions,
          trafficOccupancyUseBalanceScore: true,
          carryOccupancyScores: true,
          balanceTrafficScope: trafficFeedbackLoopEnabled ? "full" : "opening",
          skipTraffic: Boolean(options.skipTraffic || !trafficEnabled),
          deferReject: normalOpeningTrafficFirst,
          normalPruneBatchSize: options.normalPruneBatchSize
        });

  let finalFirstLeg = courseAdjustedFirstLeg;
  if (normalOpeningTrafficFirst && !options.competitiveMode) {
    const balance = courseAdjustedFirstLeg.summary?.normalStartBalance ?? null;
    const excludedIndices = new Set([
      ...(balance?.lightweightPruned ?? []),
      ...(balance?.pressurePruned ?? []).map((entry) => entry.index)
    ]);
    finalFirstLeg = recomputeFirstLegPressure(tileMap, courseAdjustedFirstLeg, {
      ...getRouteAnalysisVariantOptions(options),
      playerCount,
      excludedIndices: [...excludedIndices],
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
      trafficOccupancyUseBalanceScore: true,
      balanceTrafficScope: "full",
      openingTrafficOnly: false
    });
    finalFirstLeg.summary.normalStartBalance = courseAdjustedFirstLeg.summary.normalStartBalance;
    finalFirstLeg.summary.outliers = courseAdjustedFirstLeg.summary.outliers;
    finalFirstLeg = adjustNormalStartsAfterFullTraffic(
      finalFirstLeg,
      totalLength,
      tileMap,
      playerCount,
      {
        ...options,
        fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
        normalPruneBatchSize: options.normalPruneBatchSize,
        normalFullTrafficPrunePasses: 0
      }
    );
  }

  if (finalFirstLeg?.summary?.normalStartBalance?.active) {
    finalFirstLeg.summary.normalStartBalance.startResiduals =
      summarizePostBalanceStartResiduals(finalFirstLeg, playerCount);
  }

  const adjustedLegs = [
    {
      ...legs[0],
      analysis: finalFirstLeg
    },
    ...(finalFirstLeg.expectedLegAnalyses || []).map((analysis, index) => ({
      from: index + 1,
      to: index + 2,
      analysis
    }))
  ];

  return {
    starts,
    firstLeg: finalFirstLeg,
    legs: adjustedLegs,
    movingTargetTimelines,
    summary: {
      totalDifficulty: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.difficultyScore !== undefined) {
            return sum + leg.analysis.summary.difficultyScore;
          }

          return sum + leg.analysis.summary.averageRouteScore + leg.analysis.summary.congestionScore - leg.analysis.summary.diversityScore * 0.2;
        }, 0)
      ).toFixed(2)),
      totalLength: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.lengthScore !== undefined) {
            return sum + leg.analysis.summary.lengthScore;
          }

          return sum + leg.analysis.summary.averageRouteDistance;
        }, 0)
      ).toFixed(2))
    }
  };
  };

  if (analyzedFirstLeg && typeof analyzedFirstLeg.then === "function") {
    return analyzedFirstLeg.then(finishSequence);
  }
  return finishSequence(analyzedFirstLeg);
}

function adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, options = {}) {
  const analysisOptions = {
    ...getRouteAnalysisVariantOptions(options),
    openingTrafficOnly: options.balanceTrafficScope !== "full",
    balanceTrafficScope: options.balanceTrafficScope,
    skipTraffic: Boolean(options.skipTraffic)
  };
  const prePrunedOutliers = (firstLeg.summary.outliers || []).filter(
    (item) => item.reasons?.lightweightPruned
  );
  const initialExcludedIndices = new Set(
    prePrunedOutliers.map((item) => item.index)
  );
  const initialActive = getActivePruningStarts(
    firstLeg,
    initialExcludedIndices
  );
  const initialStdDev = getNormalStartDispersion(initialActive, "balanceScore");
  const maximumNormalPasses = Math.max(
    0,
    initialActive.length - Math.max(1, playerCount || 1)
  );

  // Normal uses iterative full-course balancing, not player-count trimming. Traffic
  // is recomputed once per small batch; player count is a floor, never a target,
  // and surplus starts use the same static fairness target.
  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ activeStarts }) => chooseNormalStartBalanceRemoval(
      activeStarts,
      playerCount
    ),
    {
      initialExcludedIndices: [...initialExcludedIndices],
      maxPasses: maximumNormalPasses,
      pruneBatchSize: options.normalPruneBatchSize ?? getNormalStartPruneBatchSize
    }
  );

  const {
    currentFirstLeg,
    excludedIndices,
    removals
  } = result;
  const remainingActive = getActivePruningStarts(
    currentFirstLeg,
    excludedIndices
  );
  const remainingOutliers = rankNormalStartOutliers(
    remainingActive,
    "balanceScore",
    FULL_START_OUTLIER_Z
  );
  const remainingStdDev = getNormalStartDispersion(remainingActive, "balanceScore");
  const retainedBalance = summarizeNormalRetainedBalance(remainingActive);
  const legacyAdjustedScoreStdDev = Number(currentFirstLeg.summary?.scoreStdDev);
  const badLimit = Math.ceil((playerCount || 1) * 0.25);

  const pressureRemovals = removals.map((removed, removalIndex) => {
    const actualStdDevAfter = removalIndex + 1 < removals.length
      ? removals[removalIndex + 1].balanceStdDevBefore
      : remainingStdDev;
    return {
      index: removed.index,
      score: removed.score,
      actions: removed.actions,
      pass: removed.pass,
      diagnostics: {
        normalBalancePruned: true,
        balanceDispersionPruned: Boolean(removed.balanceDispersionPruned),
        stage: removed.balanceDispersionPruned
          ? "iterative-traffic-fairness-dispersion"
          : "iterative-traffic-fairness-outlier",
        scoreZ: Number((removed.scoreZ ?? 0).toFixed(2)),
        actionZ: Number((removed.actionZ ?? 0).toFixed(2)),
        scoreDelta: Number((removed.scoreDelta ?? 0).toFixed(2)),
        actionDelta: Number((removed.actionDelta ?? 0).toFixed(2)),
        balanceStdDevBefore: Number((removed.balanceStdDevBefore ?? 0).toFixed(2)),
        balanceStdDevAfter: Number((actualStdDevAfter ?? 0).toFixed(2)),
        balanceStdDevAfterEstimate: Number((removed.balanceStdDevAfterEstimate ?? 0).toFixed(2)),
        balanceStdDevLimit: Number((removed.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT).toFixed(2)),
        removalReason: removed.balanceDispersionPruned
          ? "removed to reduce start-score dispersion, then recomputed occupancy before the next pruning decision"
          : "removed traffic-aware outlier, then recomputed occupancy before the next pruning decision",
        totalCourseLength: Number((totalLength || 0).toFixed(2)),
        totalCourseActions: Number(
          (options.totalActions || 0).toFixed(2)
        )
      }
    };
  });

  // If the iterative process reaches the player-count floor or cannot improve
  // the field and it is still outside the Normal balance criteria, reject the
  // course rather than silently accepting an unbalanced start set.
  const finalBalanceStdDevLimit = getNormalStartFairnessStdDevLimit(
    remainingActive.length,
    playerCount
  );
  const provisionalReject = (
    remainingOutliers.length > 0 ||
    remainingStdDev > finalBalanceStdDevLimit
  );
  const shouldReject = options.deferReject ? false : provisionalReject;

  const activeScores = remainingActive
    .map((entry) => entry.balanceScore ?? entry.adjustedScore)
    .filter(Number.isFinite);
  const meanScore = activeScores.length
    ? averageValues(activeScores)
    : 0;

  const lateOutliers = pressureRemovals.map((removal) => ({
    index: removal.index,
    score: removal.score,
    delta: Number((removal.score - meanScore).toFixed(2)),
    actionDelta: Number((removal.actions ?? 0).toFixed(2)),
    reasons: removal.diagnostics
  }));
  const allOutliers = [
    ...prePrunedOutliers,
    ...lateOutliers
  ];

  return {
    ...currentFirstLeg,
    summary: {
      ...currentFirstLeg.summary,
      // v33: the public Normal fairness metric is the exact same retained
      // full-course balanceScore dispersion used by iterative pruning. Keep the
      // older first-leg adjusted-score spread only as an explicitly named audit.
      scoreStdDev: Number(remainingStdDev.toFixed(2)),
      fairnessScore: Number(Math.max(0, 100 - remainingStdDev * 4).toFixed(2)),
      outliers: allOutliers,
      normalStartBalance: {
        active: true,
        staged: true,
        iterative: true,
        intrinsicPrePruning: Boolean(
          firstLeg.summary.lightweightStartPruning?.active
        ),
        contextualLegRoutes: Boolean(
          firstLeg.summary.contextualLegRoutes
        ),
        lightweightPruned: prePrunedOutliers.map(
          (item) => item.index
        ),
        pressurePruned: pressureRemovals,
        dispersionPruned: pressureRemovals
          .filter((item) => item.diagnostics?.balanceDispersionPruned)
          .map((item) => item.index),
        trafficRecomputations: options.skipTraffic
          ? 0
          : new Set(pressureRemovals.map((item) => item.pass)).size + (initialExcludedIndices.size ? 1 : 0),
        pruneBatchSize: options.normalPruneBatchSize ?? NORMAL_PRUNE_BATCH_SIZE,
        pruneBatchPolicy: options.normalPruneBatchSize !== null &&
          options.normalPruneBatchSize !== undefined &&
          Number.isFinite(Number(options.normalPruneBatchSize))
          ? "fixed"
          : "adaptive-2-above-2x-players-else-1",
        balanceStdDevBefore: Number(initialStdDev.toFixed(2)),
        balanceStdDevAfter: Number(remainingStdDev.toFixed(2)),
        balanceStdDevLimit: finalBalanceStdDevLimit,
        retainedCount: retainedBalance.count,
        retainedScoreMin: retainedBalance.min,
        retainedScoreMax: retainedBalance.max,
        retainedScoreRange: retainedBalance.range,
        worstRemainingScoreZ: retainedBalance.worstScoreZ,
        worstRemainingScoreIndex: retainedBalance.worstScoreIndex,
        worstRemainingActionZ: retainedBalance.worstActionZ,
        worstRemainingActionIndex: retainedBalance.worstActionIndex,
        legacyAdjustedScoreStdDev: Number.isFinite(legacyAdjustedScoreStdDev)
          ? Number(legacyAdjustedScoreStdDev.toFixed(2))
          : null,
        fairnessMetric: "full-course-balanceScore",
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          score: item.score,
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        badLimit,
        provisionalReject,
        reject: shouldReject
      }
    }
  };
}

function isCourseReachableStartAnalysis(startAnalysis) {
  if (!startAnalysis?.reachable) return false;
  // Once contextual full-course fields exist, an opening-only route is not
  // enough to call the start reachable or usable for the generated course.
  if (Object.prototype.hasOwnProperty.call(startAnalysis, "fullCourseRoute")) {
    return Boolean(startAnalysis.fullCourseRoute);
  }
  return true;
}

function computeCourseReachableStarts(firstLeg) {
  return (firstLeg?.starts ?? []).filter(isCourseReachableStartAnalysis);
}

function computeUsableStarts(firstLeg, preferences = {}) {
  const courseReachable = computeCourseReachableStarts(firstLeg);
  if (preferences.competitiveMode) {
    const selectedIndices = firstLeg?.summary?.competitiveStartBalance?.selectedIndices ?? [];
    if (selectedIndices.length) {
      const selectedSet = new Set(selectedIndices);
      return courseReachable.filter((startAnalysis) => selectedSet.has(startAnalysis.index));
    }
    return courseReachable;
  }
  if (preferences.virtualBots) {
    return courseReachable;
  }

  const outlierSet = new Set((firstLeg.summary.outliers ?? []).map((item) => item.index));
  return courseReachable.filter((startAnalysis) => !outlierSet.has(startAnalysis.index));
}

function getFallbackHardFailurePenalty(scenario) {
  if (!scenario?.metrics) return Infinity;

  let penalty = 0;
  for (const failure of scenario.metrics.hardFailures || []) {
    const failureId = String(failure || "");
    if (failureId === "usable-starts" || failureId === "reachable-starts" || failureId.startsWith("leg-")) {
      return Infinity;
    }

    const softPenalty = FALLBACK_SOFT_FAILURE_PENALTIES.get(failureId);
    if (!Number.isFinite(softPenalty)) {
      return Infinity;
    }
    penalty += softPenalty;
  }
  return penalty;
}

function isViableFallbackScenario(scenario) {
  return Number.isFinite(getFallbackHardFailurePenalty(scenario));
}

function getFallbackScenarioScore(scenario) {
  if (!isViableFallbackScenario(scenario)) return Infinity;
  const fitScore = Number(scenario?.metrics?.fitScore);
  if (!Number.isFinite(fitScore)) return Infinity;
  return fitScore + getFallbackHardFailurePenalty(scenario);
}

function getCompetitiveBalanceProfile(entries = []) {
  const active = (entries || []).filter((entry) => Number.isFinite(entry?.balanceScore));
  const retained = summarizeNormalRetainedBalance(active);
  const outliers = rankNormalStartOutliers(
    active,
    "balanceScore",
    FULL_START_OUTLIER_Z
  );
  return {
    outliers,
    stdDev: retained.stdDev,
    scoreRange: retained.range,
    worstScoreZ: retained.worstScoreZ,
    worstScoreIndex: retained.worstScoreIndex,
    worstActionZ: retained.worstActionZ,
    worstActionIndex: retained.worstActionIndex
  };
}

function getCombinationCount(n, k, cap = 50001) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = (value * (n - k + index)) / index;
    if (value >= cap) return cap;
  }
  return Math.round(value);
}

function chooseCompetitiveStrategicBlock(entries = []) {
  const active = (entries || []).filter((entry) => Number.isFinite(entry?.balanceScore));
  if (!active.length) return null;

  // Competitive blocks are player decisions, not generator fairness repairs.
  // A rational blocker removes the strongest currently available start: lower
  // full-course balanceScore means a faster/easier start after current traffic.
  // Recompute the field after every single block before choosing the next one.
  const ordered = [...active].sort((left, right) => (
    left.balanceScore - right.balanceScore ||
    (left.bestActions ?? Infinity) - (right.bestActions ?? Infinity) ||
    left.index - right.index
  ));
  const chosen = ordered[0];
  const runnerUp = ordered[1] ?? null;
  const scoreStats = getRobustOutlierStats(active, "balanceScore");
  const robustScale = Math.max(0.01, Number(scoreStats.robustScale) || 0.01);
  const advantageVsMedian = Math.max(0, scoreStats.center - chosen.balanceScore);
  const decisionMargin = runnerUp
    ? Math.max(0, runnerUp.balanceScore - chosen.balanceScore)
    : 0;
  const advantageZ = advantageVsMedian / robustScale;
  const decisionMarginZ = decisionMargin / robustScale;
  const ambiguity = 1 - Math.min(1, decisionMarginZ / 1.25);
  const consequence = Math.min(1, advantageZ / 1.5);
  // Ambiguity itself is a Competitive skill burden even when a wrong block is
  // cheap; meaningful consequences amplify it. This feeds only the provisional
  // Competitive difficulty modifier, not the blocking choice or fairness gate.
  const strategicChallenge = ambiguity * (0.55 + 0.45 * consequence);
  return {
    index: chosen.index,
    score: chosen.balanceScore,
    actions: chosen.bestActions,
    intrinsic: Number(chosen.fullCourseRoute?.score),
    traffic: Number(chosen.fullCourseTrafficPenalty ?? 0),
    runnerUpIndex: runnerUp?.index ?? null,
    runnerUpScore: Number.isFinite(runnerUp?.balanceScore) ? runnerUp.balanceScore : null,
    advantageVsMedian: Number(advantageVsMedian.toFixed(2)),
    advantageZ: Number(advantageZ.toFixed(3)),
    decisionMargin: Number(decisionMargin.toFixed(2)),
    decisionMarginZ: Number(decisionMarginZ.toFixed(3)),
    ambiguity: Number(ambiguity.toFixed(3)),
    consequence: Number(consequence.toFixed(3)),
    strategicChallenge: Number(strategicChallenge.toFixed(3))
  };
}

function getCompetitiveStrategicDifficulty(blockSequence = [], selectedStdDev = 0) {
  const challenges = (blockSequence || [])
    .map((entry) => Number(entry?.strategicChallenge))
    .filter(Number.isFinite);
  const meanBlockChallenge = challenges.length
    ? challenges.reduce((sum, value) => sum + value, 0) / challenges.length
    : 0.5;
  const selectionAmbiguity = Math.max(
    0,
    Math.min(1, 1 - (Number(selectedStdDev) || 0) / NORMAL_START_FAIRNESS_STDDEV_LIMIT)
  );

  // Provisional v36c scale. Competitive previously carried a hand-tuned +1.8
  // difficulty adjustment. Preserve that approximate magnitude while letting the
  // actual strategic reading burden move it modestly: subtle block choices and a
  // close remaining field are harder to read; obvious choices are easier. Keep
  // this bounded until the later special-rules/calibration review can fit it from
  // generated-course evidence instead of hand tuning.
  const difficulty = Math.max(
    1.2,
    Math.min(
      2.4,
      1.8 + (meanBlockChallenge - 0.5) * 0.9 + (selectionAmbiguity - 0.5) * 0.3
    )
  );
  return {
    difficulty: Number(difficulty.toFixed(2)),
    meanBlockChallenge: Number(meanBlockChallenge.toFixed(3)),
    selectionAmbiguity: Number(selectionAmbiguity.toFixed(3)),
    calibrationCenter: 1.8,
    calibrationRange: [1.2, 2.4],
    provisional: true
  };
}

function selectCompetitiveBestStarts(entries = [], playerCount = 4) {
  const count = Math.max(1, Math.floor(Number(playerCount) || 1));
  return [...(entries || [])]
    .filter((entry) => Number.isFinite(entry?.balanceScore))
    .sort((left, right) => (
      left.balanceScore - right.balanceScore ||
      (left.bestActions ?? Infinity) - (right.bestActions ?? Infinity) ||
      left.index - right.index
    ))
    .slice(0, count);
}

function applyCompetitiveStrategicBlocking(
  firstLeg,
  tileMap,
  playerCount = 4,
  options = {}
) {
  const count = Math.max(1, Math.floor(Number(playerCount) || 1));
  const requiredOfferedStarts = count * 2;
  const sourceStartCount = firstLeg?.starts?.length ?? 0;
  const routedStarts = computeCourseReachableStarts(firstLeg);
  const routedIndexSet = new Set(routedStarts.map((entry) => entry.index));
  const unavailableIndices = (firstLeg?.starts || [])
    .map((entry) => entry.index)
    .filter((index) => !routedIndexSet.has(index))
    .sort((left, right) => left - right);

  let currentFirstLeg = {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      // Simulated player blocks are never rendered as generator-pruned starts.
      outliers: []
    }
  };
  const excludedIndices = new Set();
  const blockSequence = [];
  const desiredBlockCount = Math.min(
    count,
    Math.max(0, routedStarts.length - count)
  );
  const recomputeTraffic = !options.skipTraffic;
  const blockTrafficScope = options.competitiveBlockTrafficScope === "opening"
    ? "opening"
    : "full";
  const sharedPressureOptions = {
    ...getRouteAnalysisVariantOptions(options),
    playerCount: count,
    trafficOccupancyUseBalanceScore: true,
    carryOccupancyScores: true,
    fullCourseTrafficPasses:
      options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
    contextualTrafficAlternateMinGain:
      options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
  };
  const blockPressureOptions = {
    ...sharedPressureOptions,
    openingTrafficOnly: blockTrafficScope !== "full",
    balanceTrafficScope: blockTrafficScope
  };
  const finalPressureOptions = {
    ...sharedPressureOptions,
    openingTrafficOnly: false,
    balanceTrafficScope: "full"
  };

  for (let blockIndex = 0; blockIndex < desiredBlockCount; blockIndex += 1) {
    const activeStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
    if (activeStarts.length <= count) break;
    const block = chooseCompetitiveStrategicBlock(activeStarts);
    if (!block || excludedIndices.has(block.index)) break;

    excludedIndices.add(block.index);
    blockSequence.push({
      ...block,
      order: blockIndex + 1,
      fieldSizeBefore: activeStarts.length
    });

    // Competitive blocks are sequential game decisions. Unlike Normal's
    // two-at-a-time pruning batch, every player sees the traffic field created by
    // all earlier blocks, so occupancy is rebuilt after each individual block.
    if (recomputeTraffic) {
      currentFirstLeg = recomputeFirstLegPressure(
        tileMap,
        currentFirstLeg,
        {
          ...blockPressureOptions,
          excludedIndices: [...excludedIndices]
        }
      );
    }
  }

  const remainingStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
  const selectedBeforeFinalTraffic = selectCompetitiveBestStarts(
    remainingStarts,
    count
  );
  const selectedIndices = selectedBeforeFinalTraffic
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  const selectedIndexSet = new Set(selectedIndices);
  const unselectedRemainingIndices = remainingStarts
    .filter((entry) => !selectedIndexSet.has(entry.index))
    .map((entry) => entry.index)
    .sort((left, right) => left - right);

  // The simulated blocks remain invisible to players, but acceptance should model
  // the race that would actually be occupied: after P optimal blocks, assume the
  // P strongest remaining starts are selected. Re-evaluate traffic on that P-start
  // field before applying the same fairness standard used by Normal.
  let selectedFirstLeg = currentFirstLeg;
  const needsFinalTrafficRecompute = (
    recomputeTraffic &&
    selectedIndices.length &&
    (blockTrafficScope !== "full" || unselectedRemainingIndices.length > 0)
  );
  if (needsFinalTrafficRecompute) {
    const finalExcluded = new Set([
      ...excludedIndices,
      ...unselectedRemainingIndices
    ]);
    selectedFirstLeg = recomputeFirstLegPressure(
      tileMap,
      currentFirstLeg,
      {
        ...finalPressureOptions,
        excludedIndices: [...finalExcluded]
      }
    );
  }

  const selectedEntries = (selectedFirstLeg.starts || []).filter((entry) => (
    selectedIndexSet.has(entry.index) &&
    entry.reachable &&
    entry.fullCourseRoute &&
    Number.isFinite(entry.balanceScore)
  ));
  const profile = getCompetitiveBalanceProfile(selectedEntries);
  const selectedStdDev = profile.stdDev;
  const strategicDifficulty = getCompetitiveStrategicDifficulty(
    blockSequence,
    selectedStdDev
  );
  const sufficientPhysicalField = (
    sourceStartCount >= requiredOfferedStarts &&
    routedStarts.length >= requiredOfferedStarts &&
    unavailableIndices.length === 0
  );
  const acceptable = (
    sufficientPhysicalField &&
    blockSequence.length === count &&
    selectedEntries.length === count &&
    profile.outliers.length === 0 &&
    selectedStdDev <= NORMAL_START_FAIRNESS_STDDEV_LIMIT
  );
  const remainingIndices = remainingStarts
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  const competitiveStartBalance = {
    active: true,
    sequential: true,
    pruneBatchSize: 1,
    sourceStartCount,
    routedStartCount: routedStarts.length,
    requiredOfferedStarts,
    unavailableIndices,
    blockedStartCount: blockSequence.length,
    blockedIndices: blockSequence.map((entry) => entry.index),
    blockSequence,
    remainingStartCount: remainingStarts.length,
    remainingIndices,
    selectedStartCount: selectedEntries.length,
    selectedIndices,
    unselectedRemainingIndices,
    selectedStdDev: Number(selectedStdDev.toFixed(2)),
    balanceStdDevLimit: NORMAL_START_FAIRNESS_STDDEV_LIMIT,
    selectedOutlierCount: profile.outliers.length,
    remainingOutlierCount: profile.outliers.length,
    scoreRange: profile.scoreRange,
    worstScoreZ: profile.worstScoreZ,
    worstScoreIndex: profile.worstScoreIndex,
    worstActionZ: profile.worstActionZ,
    worstActionIndex: profile.worstActionIndex,
    blockTrafficScope,
    trafficRecomputations: recomputeTraffic
      ? blockSequence.length + (needsFinalTrafficRecompute ? 1 : 0)
      : 0,
    strategicDifficulty: strategicDifficulty.difficulty,
    strategicDifficultyEvidence: strategicDifficulty,
    acceptable,
    method: "sequential-optimal-best-start-blocks+best-p-selection"
  };

  return {
    ...selectedFirstLeg,
    summary: {
      ...selectedFirstLeg.summary,
      scoreStdDev: Number(selectedStdDev.toFixed(2)),
      fairnessScore: Number(Math.max(0, 100 - selectedStdDev * 4).toFixed(2)),
      outliers: [],
      competitiveStartBalance,
      competitiveStaging: {
        active: true,
        sourceStartCount,
        routedStartCount: routedStarts.length,
        offeredStartCount: sourceStartCount,
        requiredOfferedStarts,
        unavailableIndices,
        remainingAfterBlocks: remainingStarts.length,
        selectedStartCount: selectedEntries.length,
        selectedIndices,
        preliminaryScoreStdDev: Number(firstLeg.summary?.scoreStdDev ?? 0),
        method: "normal-route-foundation+sequential-optimal-blocks"
      }
    }
  };
}

function pointOnPlacement(point, placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  if (!piece) {
    return false;
  }

  if (placement.overlay) {
    return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some((offset) => (
      point.x === placement.x + offset.x &&
      point.y === placement.y + offset.y
    ));
  }

  const dims = rotatedDimensions(piece, placement.rotation ?? 0);

  return (
    point.x >= placement.x &&
    point.x < placement.x + dims.width &&
    point.y >= placement.y &&
    point.y < placement.y + dims.height
  );
}

function collectUsedBoardIndices(sequence, boardPlacements, pieceMap, usableStarts, checkpoints) {
  const used = new Set();

  checkpoints.forEach((checkpoint) => {
    boardPlacements.forEach((placement, index) => {
      if (pointOnPlacement(checkpoint, placement, pieceMap)) {
        used.add(index);
      }
    });
  });

  usableStarts.forEach((startAnalysis) => {
    const route = startAnalysis.selectedRoute;
    if (!route) {
      return;
    }

    route.path.forEach((point) => {
      boardPlacements.forEach((placement, index) => {
        if (pointOnPlacement(point, placement, pieceMap)) {
          used.add(index);
        }
      });
    });
  });

  sequence.legs.slice(1).forEach((leg) => {
    for (const route of leg.analysis.distinctRoutes || []) {
      route.path.forEach((point) => {
        boardPlacements.forEach((placement, index) => {
          if (pointOnPlacement(point, placement, pieceMap)) {
            used.add(index);
          }
        });
      });
    }
  });

  return used;
}

function overlayFitsWithinBoards(overlayPlacement, boardPlacements, pieceMap) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).every(({ x, y }) => (
    boardPlacements.some((placement) => (
      pointOnPlacement({ x: overlayPlacement.x + x, y: overlayPlacement.y + y }, placement, pieceMap)
    ))
  ));
}

function collectTrackedRouteTileKeys(sequence, usableStarts = []) {
  const keys = new Set();

  usableStarts.forEach((startAnalysis) => {
    (startAnalysis.selectedRoute?.path || []).forEach((point) => {
      keys.add(`${point.x},${point.y}`);
    });
  });

  sequence?.legs?.forEach((leg) => {
    (leg.analysis?.distinctRoutes || []).forEach((route) => {
      (route.path || []).forEach((point) => {
        keys.add(`${point.x},${point.y}`);
      });
    });
  });

  return keys;
}

function placementTouchesTrackedRoute(placement, pieceMap, routeTileKeys) {
  const piece = pieceMap[placement.pieceId];
  if (!piece || !routeTileKeys?.size) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => (
    routeTileKeys.has(`${placement.x + x},${placement.y + y}`)
  ));
}

function pruneUnusedDockPlacements(dockPlacements, pieceMap, sequence, usableStarts, checkpoints) {
  if ((dockPlacements?.length ?? 0) <= 1) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const keptDockPlacements = dockPlacements.filter((dockPlacement) => (
    usableStarts.some((startAnalysis) => pointOnPlacement(startAnalysis.start, dockPlacement, pieceMap)) ||
    checkpoints.some((checkpoint) => pointOnPlacement(checkpoint, dockPlacement, pieceMap)) ||
    placementTouchesTrackedRoute(dockPlacement, pieceMap, routeTileKeys)
  ));

  if (!keptDockPlacements.length) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  return {
    dockPlacements: keptDockPlacements,
    pruned: keptDockPlacements.length !== dockPlacements.length
  };
}

function overlayTouchesTrackedPlay(overlayPlacement, pieceMap, routeTileKeys, checkpoints = [], radius = 2) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => {
    const absolute = {
      x: overlayPlacement.x + x,
      y: overlayPlacement.y + y
    };

    if (checkpoints.some((checkpoint) => manhattanDistance(absolute, checkpoint) <= radius)) {
      return true;
    }

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) {
          continue;
        }
        if (routeTileKeys.has(`${absolute.x + dx},${absolute.y + dy}`)) {
          return true;
        }
      }
    }

    return false;
  });
}

function overlaySitsUnderCheckpoint(overlayPlacement, pieceMap, checkpoints = []) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => (
    checkpoints.some((checkpoint) => (
      checkpoint.x === overlayPlacement.x + x &&
      checkpoint.y === overlayPlacement.y + y
    ))
  ));
}

function overlayHasCheckpointActiveFeatures(overlayPlacement, pieceMap, checkpoints = [], options = {}) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  const placed = placePiece(piece, overlayPlacement);
  return placed.tiles.some((tile) => (
    checkpoints.some((checkpoint) => checkpoint.x === tile.x && checkpoint.y === tile.y) &&
    (tile.features || []).some((feature) => isCheckpointActiveFeature(feature, options))
  ));
}

function getPlacedOverlayTiles(overlayPlacement, pieceMap) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return [];
  }

  return placePiece(piece, overlayPlacement).tiles;
}

function placementHasLaserFeature(overlayPlacement, pieceMap) {
  return getPlacedOverlayTiles(overlayPlacement, pieceMap).some((tile) => (
    (tile.features || []).some((feature) => feature.type === "laser")
  ));
}

function placementsAreLaserLinked(sourcePlacement, candidatePlacement, pieceMap) {
  const sourceTiles = getPlacedOverlayTiles(sourcePlacement, pieceMap);
  const candidateFeatureMap = new Map(
    getPlacedOverlayTiles(candidatePlacement, pieceMap).map((tile) => [`${tile.x},${tile.y}`, tile.features || []])
  );

  return sourceTiles.some((tile) => {
    const lasers = (tile.features || []).filter((feature) => feature.type === "laser");
    return lasers.some((laser) => {
      const sides = [laser.dir, getOppositeSide(laser.dir)];
      return sides.some((side) => {
        if (tileHasLaserSupportBlock(tile.features || [], side, { includeLowerLedge: true })) {
          return false;
        }

        const delta = CARDINAL_DIRS[side];
        const neighborFeatures = candidateFeatureMap.get(`${tile.x + delta.dx},${tile.y + delta.dy}`);
        if (!neighborFeatures) {
          return false;
        }

        return (
          tileHasLaserSupportBlock(tile.features || [], side, { includeLowerLedge: true }) ||
          tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side), { includeLowerLedge: true }) ||
          tileHasLaserInDirection(neighborFeatures, laser.dir)
        );
      });
    });
  });
}

function pruneIrrelevantOverlayPlacements(overlayPlacements, pieceMap, sequence, usableStarts, checkpoints, options = {}) {
  if (!overlayPlacements?.length) {
    return {
      overlayPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const hazardousFlags = Boolean(options.hazardousFlags);
  const initiallyKept = overlayPlacements.filter((placement) => (
    (
      hazardousFlags ||
      !overlaySitsUnderCheckpoint(placement, pieceMap, checkpoints) ||
      overlayHasCheckpointActiveFeatures(placement, pieceMap, checkpoints, options)
    ) &&
    overlayTouchesTrackedPlay(placement, pieceMap, routeTileKeys, checkpoints, 2)
  ));
  const keptPlacements = [...initiallyKept];
  const keptKeys = new Set(keptPlacements.map((placement) => `${placement.pieceId}@${placement.x},${placement.y},${placement.rotation ?? 0}`));

  let changed = true;
  while (changed) {
    changed = false;
    overlayPlacements.forEach((placement) => {
      const placementKey = `${placement.pieceId}@${placement.x},${placement.y},${placement.rotation ?? 0}`;
      if (keptKeys.has(placementKey) || !placementHasLaserFeature(placement, pieceMap)) {
        return;
      }

      const linkedToKeptLaser = keptPlacements.some((keptPlacement) => (
        placementHasLaserFeature(keptPlacement, pieceMap) &&
        (
          placementsAreLaserLinked(keptPlacement, placement, pieceMap) ||
          placementsAreLaserLinked(placement, keptPlacement, pieceMap)
        )
      ));
      if (!linkedToKeptLaser) {
        return;
      }

      keptPlacements.push(placement);
      keptKeys.add(placementKey);
      changed = true;
    });
  }

  return {
    overlayPlacements: keptPlacements,
    pruned: keptPlacements.length !== overlayPlacements.length
  };
}

function pruneUnusedBoardPlacements(boardPlacements, overlayPlacements, pieceMap, sequence, usableStarts, checkpoints, options = {}) {
  if ((boardPlacements?.length ?? 0) <= 1) {
    return {
      boardPlacements,
      overlayPlacements,
      pruned: false
    };
  }

  const usedBoards = collectUsedBoardIndices(
    sequence,
    boardPlacements,
    pieceMap,
    usableStarts,
    checkpoints
  );
  for (const index of options.protectedBoardIndices || []) {
    if (Number.isInteger(index) && index >= 0 && index < boardPlacements.length) {
      usedBoards.add(index);
    }
  }

  if (usedBoards.size === 0 || usedBoards.size >= boardPlacements.length) {
    return {
      boardPlacements,
      overlayPlacements,
      pruned: false
    };
  }

  const nextBoardPlacements = boardPlacements.filter((_, index) => usedBoards.has(index));
  const nextOverlayPlacements = (overlayPlacements || []).filter((placement) => (
    overlayFitsWithinBoards(placement, nextBoardPlacements, pieceMap)
  ));

  return {
    boardPlacements: nextBoardPlacements,
    overlayPlacements: nextOverlayPlacements,
    pruned: nextBoardPlacements.length !== boardPlacements.length || nextOverlayPlacements.length !== (overlayPlacements || []).length
  };
}

function computeLaterCheckpointPressure(tileMap, checkpoints = [], preferences = {}) {
  if (!tileMap || checkpoints.length <= 1) {
    return 0;
  }

  const laterScores = checkpoints
    .slice(1)
    .map((checkpoint) => scoreFlagArea(tileMap, checkpoint, {
      playerCount: preferences.playerCount,
      lessDeadlyGame: preferences.lessDeadlyGame,
      lighterGame: preferences.lighterGame,
      flamingOil: preferences.flamingOil
    }))
    .filter((score) => Number.isFinite(score));

  return laterScores.length ? Number(averageValues(laterScores).toFixed(2)) : 0;
}

function computeDifficultyRaw(sequence, checkpointPressure = 0) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const avgLegScore = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.averageRouteScore, 0) / later.length : 0;
  const avgCongestion = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.congestionScore, 0) / later.length : 0;
  const avgDiversity = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.diversityScore, 0) / later.length : 0;
  const avgBacktrack = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.crossLegOverlap, 0) / later.length : 0;

  return Number((
    first.difficultyScore * 0.42 +
    first.averageTrafficPenalty * 0.9 +
    first.flagAreaScore * 1.15 +
    avgLegScore * 0.32 +
    avgCongestion * 0.65 +
    checkpointPressure * 0.42 +
    avgBacktrack * 20 -
    avgDiversity * 0.45
  ).toFixed(2));
}

function computePlayerTimeLoad(playerCount = 4) {
  const safePlayerCount = Math.max(1, playerCount || 4);
  // Every additional robot slows register resolution even on an open board:
  // more cards must be resolved and more ordering state must be tracked.
  // Keep that 2 -> 3 -> 4 growth explicit, then add a steeper coordination
  // cost for larger tables where interactions become harder to follow.
  const baseResolutionLoad = safePlayerCount * 1.55;
  const orderingLoad = Math.max(0, safePlayerCount - 1) * 0.55;
  const largeTableLoad = Math.max(0, safePlayerCount - 4) ** 2 * 0.55;

  return Number((baseResolutionLoad + orderingLoad + largeTableLoad).toFixed(2));
}

function computeBoardHarshness(boardPlacements = [], pieceMap = {}) {
  const profiles = boardPlacements
    .map((placement) => pieceMap?.[placement.pieceId]?.boardProfile)
    .filter(Boolean);

  if (!profiles.length) {
    return {
      overall: 1.7,
      swinginess: 1.6,
      hazard: 1.6,
      normalized: 0.4
    };
  }

  const totals = profiles.reduce((sum, profile) => ({
    overall: sum.overall + (profile.overall ?? 1.7),
    swinginess: sum.swinginess + (profile.swinginess ?? 1.6),
    hazard: sum.hazard + (profile.bias?.hazard ?? 1.6)
  }), {
    overall: 0,
    swinginess: 0,
    hazard: 0
  });
  const count = profiles.length;
  const overall = totals.overall / count;
  const swinginess = totals.swinginess / count;
  const hazard = totals.hazard / count;
  const normalized = clamp(
    ((overall - 1.35) / 1.55) * 0.5 +
    ((swinginess - 1.25) / 1.65) * 0.3 +
    ((hazard - 1.25) / 1.65) * 0.2,
    0,
    1
  );

  return {
    overall: Number(overall.toFixed(2)),
    swinginess: Number(swinginess.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    normalized: Number(normalized.toFixed(3))
  };
}


function meanFinite(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function getProgrammingPressureRouteEntries(sequence) {
  const starts = sequence?.firstLeg?.starts ?? [];
  const entries = starts
    .filter((entry) => entry?.reachable !== false && entry?.fullCourseRoute)
    .map((entry) => ({
      route: entry.fullCourseRoute,
      traffic: Number(entry.fullCourseTrafficPenalty ?? entry.trafficPenalty ?? 0) || 0
    }));
  if (entries.length) return entries;

  // Virtual/shared-entry or compatibility fallback: retain route geometry even if
  // there is no ordinary per-start array in an older saved scenario.
  const routes = sequence?.legs
    ?.flatMap((leg) => leg?.analysis?.distinctRoutes ?? [])
    ?.filter(Boolean) ?? [];
  return routes.map((route) => ({ route, traffic: 0 }));
}

function summarizeRouteControlPressure(route) {
  const weights = PROGRAMMING_CONTROL_PRESSURE_WEIGHTS ?? {};
  const transitions = route?.transitions ?? [];
  let gearTurns = 0;
  let conveyorTurns = 0;
  let conveyorForcedSpaces = 0;
  let otherForcedSpaces = 0;
  let pusherEvents = 0;
  let oilEvents = 0;
  let currentEvents = 0;
  let portalJumps = 0;
  let randomizerStarts = 0;

  for (const transition of transitions) {
    if (transition?.gearTurned) gearTurns += 1;
    const conveyorSteps = transition?.conveyorSteps ?? [];
    conveyorTurns += conveyorSteps.filter((step) => step?.turned).length;
    conveyorForcedSpaces += conveyorSteps.length;
    otherForcedSpaces += Math.max(0, (Number(transition?.forcedDistance) || 0) - conveyorSteps.length);
    for (const event of transition?.boardEvents ?? []) {
      if (event?.type === "pusher") pusherEvents += 1;
      else if (event?.type === "oil") oilEvents += 1;
      else if (event?.type === "current") currentEvents += 1;
    }
    portalJumps += (transition?.traversed ?? []).filter((point) => point?.jump).length;
    if (transition?.randomizerAtRegisterStart || transition?.randomizedAction) randomizerStarts += 1;
  }

  const controlUnits =
    gearTurns * (weights.gearTurn ?? 1) +
    conveyorTurns * (weights.conveyorTurn ?? 0.9) +
    conveyorForcedSpaces * (weights.conveyorForcedSpace ?? 0.16) +
    otherForcedSpaces * (weights.otherForcedSpace ?? 0.1) +
    pusherEvents * (weights.pusherEvent ?? 0.65) +
    oilEvents * (weights.oilEvent ?? 0.45) +
    currentEvents * (weights.currentEvent ?? 0.4) +
    portalJumps * (weights.portalJump ?? 0.55) +
    randomizerStarts * (weights.randomizerStart ?? 0.8);

  return {
    controlUnits,
    gearTurns,
    conveyorTurns,
    conveyorForcedSpaces,
    otherForcedSpaces,
    pusherEvents,
    oilEvents,
    currentEvents,
    portalJumps,
    randomizerStarts
  };
}

function computeProgrammingPressureProfile(sequence) {
  const entries = getProgrammingPressureRouteEntries(sequence);
  if (!entries.length) {
    return {
      active: false,
      routeCount: 0,
      averageActions: 0,
      hazardPerRegister: 0,
      trafficPerRegister: 0,
      controlPerRegister: 0,
      cardPerRegister: 0,
      againRate: 0,
      hazardPressure: 0,
      trafficPressure: 0,
      controlPressure: 0,
      cardPressure: 0,
      planningPressure: 0,
      timedPressure: 0,
      method: "route-hazard-traffic-control-v38"
    };
  }

  const actionCounts = [];
  const hazardTotals = [];
  const trafficTotals = [];
  const controlTotals = [];
  const cardTotals = [];
  const againRates = [];
  const controlDetails = [];

  for (const entry of entries) {
    const route = entry.route;
    const actions = Math.max(1, Number(route?.actions ?? route?.transitions?.length) || 1);
    const control = summarizeRouteControlPressure(route);
    const cardPenalty = Math.max(
      0,
      (Number(route?.cardAvailabilityPenalty) || 0) +
      (Number(route?.programPlausibilityPenalty) || 0) +
      (Number(route?.approximateCardPlausibilityPenalty) || 0)
    );
    const againUses = (route?.transitions ?? []).filter((transition) => (
      transition?.programCard === "AGAIN" ||
      transition?.programCardId === "AGAIN" ||
      transition?.approximateProgramCard === "AGAIN"
    )).length;

    actionCounts.push(actions);
    hazardTotals.push(Math.max(0, Number(route?.hazard) || 0));
    trafficTotals.push(Math.max(0, Number(entry.traffic) || 0));
    controlTotals.push(control.controlUnits);
    cardTotals.push(cardPenalty);
    againRates.push(againUses / actions);
    controlDetails.push(control);
  }

  const averageActions = meanFinite(actionCounts);
  const hazardPerRegister = meanFinite(hazardTotals.map((value, index) => value / actionCounts[index]));
  let trafficPerRegister = meanFinite(trafficTotals.map((value, index) => value / actionCounts[index]));
  // Some route families store only the aggregate selection traffic value.
  if (!(trafficPerRegister > 0)) {
    const aggregateTraffic = Number(sequence?.firstLeg?.summary?.fullCourseTraffic?.averagePenalty);
    if (Number.isFinite(aggregateTraffic) && averageActions > 0) {
      trafficPerRegister = aggregateTraffic / averageActions;
    }
  }
  const controlPerRegister = meanFinite(controlTotals.map((value, index) => value / actionCounts[index]));
  const cardPerRegister = meanFinite(cardTotals.map((value, index) => value / actionCounts[index]));
  const againRate = meanFinite(againRates);

  // These normalizers only put unlike evidence on a common 0..~1 scale. They are
  // not difficulty calibration constants; the later calibration pass should fit
  // the variant response to this evidence rather than replacing the evidence.
  const hazardPressure = clamp(hazardPerRegister / 1.15, 0, 1.5);
  const trafficPressure = clamp(trafficPerRegister / 4.25, 0, 1.5);
  const controlPressure = clamp(controlPerRegister / 0.42, 0, 1.5);
  const cardPressure = clamp(cardPerRegister / 0.28 + againRate * 0.8, 0, 1.25);

  // Random/limited programming rules are most consequential where robot traffic,
  // hazards, and factory-controlled movement make an imperfect program costly.
  const planningPressure = clamp(
    hazardPressure * 0.32 +
    trafficPressure * 0.34 +
    controlPressure * 0.27 +
    cardPressure * 0.07,
    0,
    1.5
  );
  // Timers lean a little more heavily on immediate control/traffic reasoning.
  const timedPressure = clamp(
    hazardPressure * 0.24 +
    trafficPressure * 0.35 +
    controlPressure * 0.35 +
    cardPressure * 0.06,
    0,
    1.5
  );

  const detailTotals = {
    gearTurns: meanFinite(controlDetails.map((item) => item.gearTurns)),
    conveyorTurns: meanFinite(controlDetails.map((item) => item.conveyorTurns)),
    forcedSpaces: meanFinite(controlDetails.map((item) => item.conveyorForcedSpaces + item.otherForcedSpaces)),
    pusherEvents: meanFinite(controlDetails.map((item) => item.pusherEvents)),
    portalJumps: meanFinite(controlDetails.map((item) => item.portalJumps))
  };

  return {
    active: true,
    routeCount: entries.length,
    averageActions: Number(averageActions.toFixed(2)),
    hazardPerRegister: Number(hazardPerRegister.toFixed(3)),
    trafficPerRegister: Number(trafficPerRegister.toFixed(3)),
    controlPerRegister: Number(controlPerRegister.toFixed(3)),
    cardPerRegister: Number(cardPerRegister.toFixed(3)),
    againRate: Number(againRate.toFixed(3)),
    hazardPressure: Number(hazardPressure.toFixed(3)),
    trafficPressure: Number(trafficPressure.toFixed(3)),
    controlPressure: Number(controlPressure.toFixed(3)),
    cardPressure: Number(cardPressure.toFixed(3)),
    planningPressure: Number(planningPressure.toFixed(3)),
    timedPressure: Number(timedPressure.toFixed(3)),
    averageGearTurns: Number(detailTotals.gearTurns.toFixed(2)),
    averageConveyorTurns: Number(detailTotals.conveyorTurns.toFixed(2)),
    averageForcedSpaces: Number(detailTotals.forcedSpaces.toFixed(2)),
    averagePusherEvents: Number(detailTotals.pusherEvents.toFixed(2)),
    averagePortalJumps: Number(detailTotals.portalJumps.toFixed(2)),
    method: "route-hazard-traffic-control-v38"
  };
}

function getActFastPressureWeight(mode) {
  return ({
    countdown_3m: 0,
    countdown_2m: 0.12,
    last_player_30s: 0.44,
    countdown_1m: 0.68,
    countdown_30s: 1
  })[mode] ?? 0;
}

function computeVariantDifficultyAccounting(raw, preferences = {}, sequence = null) {
  const programmingPressure = computeProgrammingPressureProfile(sequence);
  let adjusted = Number(raw) || 0;
  const contributions = [];
  const mechanicalRules = [];
  const add = (id, delta, kind = "residual", evidence = null) => {
    const value = Number(delta) || 0;
    if (Math.abs(value) > 0.0001) adjusted += value;
    contributions.push({
      id,
      kind,
      delta: Number(value.toFixed(2)),
      evidence
    });
  };
  const scale = (id, multiplier, kind = "residual", evidence = null) => {
    const before = adjusted;
    adjusted *= multiplier;
    contributions.push({
      id,
      kind,
      delta: Number((adjusted - before).toFixed(2)),
      multiplier: Number(multiplier.toFixed(4)),
      evidence
    });
  };
  const mechanical = (id, note) => mechanicalRules.push({ id, note });

  // These damage/recovery rules are already reflected in intrinsic hazards,
  // reboot costs, and/or robot traffic. v38 removes their old generic course-wide
  // multipliers so the same danger is not paid twice.
  if (preferences.lessSpammyGame) mechanical("lessSpammyGame", "hazard/traffic/reboot model");
  if (preferences.criticalSpam) mechanical("criticalSpam", "hazard/traffic/reboot model");
  if (preferences.criticalHaywire) mechanical("criticalHaywire", "hazard/traffic/reboot model");
  if (preferences.permanentShutdown && preferences.criticalSpam) mechanical("permanentShutdown", "damage-deck/reboot model");
  if (preferences.cuttingFloor) mechanical("cuttingFloor", "laser damage model");
  if (preferences.flamingOil) mechanical("flamingOil", "oil hazard model");
  if (preferences.setToKill) mechanical("setToKill", "robot-laser traffic model");
  if (preferences.setToStun) mechanical("setToStun", "robot-laser traffic model");
  if (preferences.repairStations) mechanical("repairStations", "checkpoint repair route value");

  // Energy Crisis removes a broad strategic resource system that the flattened
  // route economy does not fully express. Keep its small residual for now, but it
  // is explicitly separated for later calibration rather than hidden in route cost.
  if (preferences.lighterGame) {
    scale("lighterGame", 0.96, "residual-resource", { provisional: true });
  }

  if (preferences.lessForeshadowing) {
    add(
      "lessForeshadowing",
      programmingPressure.planningPressure * 4.4,
      "residual-programming",
      { planningPressure: programmingPressure.planningPressure }
    );
  }
  if (preferences.classicSharedDeck) {
    const sharedDeckPressure = getSharedDeckPlayerPressure(preferences.playerCount);
    add(
      "classicSharedDeck",
      programmingPressure.planningPressure * (4.3 + sharedDeckPressure * 1.7),
      "residual-programming",
      {
        planningPressure: programmingPressure.planningPressure,
        playerPressure: Number(sharedDeckPressure.toFixed(3))
      }
    );
  }
  if (preferences.factoryRejects) {
    add(
      "factoryRejects",
      programmingPressure.planningPressure * 3.2,
      "residual-programming",
      { planningPressure: programmingPressure.planningPressure }
    );
  }
  if (preferences.actFastMode) {
    const timerWeight = getActFastPressureWeight(preferences.actFastMode);
    add(
      "actFast",
      programmingPressure.timedPressure * 6.2 * timerWeight,
      "residual-programming",
      {
        mode: preferences.actFastMode,
        timerWeight,
        timedPressure: programmingPressure.timedPressure
      }
    );
  }
  if (preferences.movingTargetStats?.activeCount) {
    // Dynamic routing already pays the chase in actions/distance. Preserve only a
    // smaller residual for tracking/anticipating a moving objective in real play.
    add(
      "movingTargets",
      (preferences.movingTargetStats.difficultyBonus ?? 0) * 0.35,
      "residual-tracking",
      { routeAware: true, retainedFraction: 0.35 }
    );
  }

  if (preferences.competitiveMode) {
    const strategicDifficulty = Number(preferences.competitiveStrategicDifficulty);
    add(
      "competitiveMode",
      Number.isFinite(strategicDifficulty) ? strategicDifficulty : 1.8,
      "residual-setup",
      { provisional: true }
    );
  }
  if (preferences.payToWin || preferences.subsidizedStarts) {
    add(
      preferences.subsidizedStarts ? "subsidizedStarts" : "payToWin",
      1.4,
      "residual-setup",
      { provisional: true }
    );
  }

  return {
    base: Number((Number(raw) || 0).toFixed(2)),
    final: Number(adjusted.toFixed(2)),
    delta: Number((adjusted - (Number(raw) || 0)).toFixed(2)),
    contributions,
    mechanicalRules,
    programmingPressure,
    method: "mechanical-plus-residual-variant-accounting-v38"
  };
}

function getSharedDeckPlayerPressure(playerCount = 4) {
  return clamp(((playerCount || 4) - 2) / 4, 0, 1);
}

function applyVariantDifficultyModifiers(raw, preferences = {}, sequence = null) {
  return computeVariantDifficultyAccounting(raw, preferences, sequence).final;
}

function computeActFastLengthLoad(preferences = {}, playerCount = 4) {
  const safePlayerCount = playerCount || 4;
  const mode = preferences.actFastMode;
  const byMode = {
    countdown_1m: -4.5,
    countdown_30s: -7,
    last_player_30s: safePlayerCount >= 5
      ? -4
      : safePlayerCount >= 4
        ? -2.5
        : 0
  };

  return byMode[mode] ?? 0;
}

const LENGTH_FORECAST_SPECULATIVE_CONFIDENCE = 0.50;
const LENGTH_FORECAST_CONFIDENCE_FLOOR = 0.06;
const LENGTH_FORECAST_MAX_ACTION_UPLIFT = 0.55;
const LENGTH_FORECAST_UNCERTAINTY_EXPONENT = 0.90;

function computeExpectedLengthForecastProfile(sequence, preferences = {}) {
  const firstLeg = sequence?.firstLeg;
  if (!firstLeg?.starts?.length || typeof summarizeIntrinsicRouteForecastConfidence !== "function") {
    return {
      routeCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      averageEndConfidence: 1,
      uncertaintyEquivalentActions: 0,
      uncertainRegisters: 0,
      totalRegisters: 0
    };
  }

  const usable = computeUsableStarts(firstLeg, preferences);
  const candidates = usable.length
    ? usable
    : computeCourseReachableStarts(firstLeg);
  const profiles = candidates
    .map((entry) => entry?.fullCourseRoute)
    .filter(Boolean)
    .map((route) => summarizeIntrinsicRouteForecastConfidence(route, {
      trafficGraceRegisters: preferences.virtualBots ? 5 : 0
    }))
    .filter((profile) => profile?.registerCount > 0);

  if (!profiles.length) {
    return {
      routeCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      averageEndConfidence: 1,
      uncertaintyEquivalentActions: 0,
      uncertainRegisters: 0,
      totalRegisters: 0
    };
  }

  const routeEquivalentActions = [];
  const routeUncertainRegisters = [];
  let weightedConfidence = 0;
  let totalRegisters = 0;
  let minimumConfidence = 1;
  let endConfidenceSum = 0;

  for (const profile of profiles) {
    let exposure = 0;
    let uncertainRegisters = 0;
    for (const confidenceValue of profile.confidenceByRegister || []) {
      const confidence = clamp(Number(confidenceValue) || 0, LENGTH_FORECAST_CONFIDENCE_FLOOR, 1);
      weightedConfidence += confidence;
      totalRegisters += 1;
      minimumConfidence = Math.min(minimumConfidence, confidence);
      if (confidence >= LENGTH_FORECAST_SPECULATIVE_CONFIDENCE) continue;
      uncertainRegisters += 1;
      const normalized = clamp(
        (LENGTH_FORECAST_SPECULATIVE_CONFIDENCE - confidence) /
          (LENGTH_FORECAST_SPECULATIVE_CONFIDENCE - LENGTH_FORECAST_CONFIDENCE_FLOOR),
        0,
        1
      );
      exposure += Math.pow(normalized, LENGTH_FORECAST_UNCERTAINTY_EXPONENT);
    }
    routeEquivalentActions.push(exposure * LENGTH_FORECAST_MAX_ACTION_UPLIFT);
    routeUncertainRegisters.push(uncertainRegisters);
    endConfidenceSum += Number(profile.endConfidence) || 1;
    minimumConfidence = Math.min(minimumConfidence, Number(profile.minimumConfidence) || 1);
  }

  return {
    routeCount: profiles.length,
    averageConfidence: Number((totalRegisters ? weightedConfidence / totalRegisters : 1).toFixed(3)),
    minimumConfidence: Number(minimumConfidence.toFixed(3)),
    averageEndConfidence: Number((endConfidenceSum / profiles.length).toFixed(3)),
    uncertaintyEquivalentActions: Number(meanFinite(routeEquivalentActions).toFixed(2)),
    uncertainRegisters: Number(meanFinite(routeUncertainRegisters).toFixed(2)),
    totalRegisters: Number((totalRegisters / profiles.length).toFixed(2)),
    speculativeThreshold: LENGTH_FORECAST_SPECULATIVE_CONFIDENCE,
    maxActionUplift: LENGTH_FORECAST_MAX_ACTION_UPLIFT,
    exponent: LENGTH_FORECAST_UNCERTAINTY_EXPONENT,
    interactionTreatment: "traffic remains separate in congestion load"
  };
}

function computeLengthMetrics(sequence, flagCount, playerCount, boardCount, preferences = {}, boardHarshness = null) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const totalRouteDistance = first.lengthScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);
  const totalActionLoad = first.actionScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteActions || 0), 0);
  const totalCongestion = first.averageTrafficPenalty + later.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0);
  const safePlayerCount = Math.max(1, playerCount || 4);
  const harshness = boardHarshness ?? computeBoardHarshness();
  const programmingPressure = computeProgrammingPressureProfile(sequence);
  const forecastLengthProfile = computeExpectedLengthForecastProfile(sequence, preferences);
  const checkpointLoad = 0;
  const playerLoad = computePlayerTimeLoad(safePlayerCount);
  const actionLoad = totalActionLoad * 2.8;
  const forecastUncertaintyLoad = forecastLengthProfile.uncertaintyEquivalentActions * 2.8;
  const distanceLoad = totalRouteDistance * 0.75;
  // Traffic costs real play time even on a forgiving board. That cost rises
  // when more robots must be resolved and when collisions happen on harsher
  // boards, where displacement is more likely to trigger damage, reboots, or
  // consequential rerouting.
  const congestionWeight = (
    0.08 +
    harshness.normalized * 0.10 +
    Math.max(0, safePlayerCount - 2) * 0.015
  );
  const congestionLoad = totalCongestion * congestionWeight;
  const flagAreaLoad = 0;
  const difficultyLoad = 0;
  // v38: the moving target is already followed by the route solver. Its chase
  // therefore appears naturally in action/distance load; the old path-length
  // bonus is retained only as a diagnostic estimate, not added again here.
  const movingTargetLoad = 0;
  const movingTargetLegacyEstimate = preferences.movingTargetStats?.lengthBonus ?? 0;
  const actFastLoad = computeActFastLengthLoad(preferences, safePlayerCount);
  const preUncertaintyRouteLoad = actionLoad + distanceLoad;
  const routeLoad = preUncertaintyRouteLoad + forecastUncertaintyLoad;
  const baseFrictionLoad = congestionLoad + actFastLoad;
  const preUncertaintyRaw = playerLoad + preUncertaintyRouteLoad + baseFrictionLoad;
  const baseRaw = playerLoad + routeLoad + baseFrictionLoad;

  // Shared/reshuffled programming can lengthen a game when a course actually
  // punishes imperfect programs. Tie that residual to the same route evidence
  // used for difficulty instead of applying a course-wide multiplier.
  const lessForeshadowingLoad = preferences.lessForeshadowing
    ? baseRaw * programmingPressure.planningPressure * 0.022
    : 0;
  const preUncertaintyLessForeshadowingLoad = preferences.lessForeshadowing
    ? preUncertaintyRaw * programmingPressure.planningPressure * 0.022
    : 0;
  const sharedDeckPlayerPressure = preferences.classicSharedDeck
    ? getSharedDeckPlayerPressure(safePlayerCount)
    : 0;
  const sharedDeckLoad = preferences.classicSharedDeck
    ? baseRaw * programmingPressure.planningPressure * (0.016 + sharedDeckPlayerPressure * 0.012)
    : 0;
  const preUncertaintySharedDeckLoad = preferences.classicSharedDeck
    ? preUncertaintyRaw * programmingPressure.planningPressure * (0.016 + sharedDeckPlayerPressure * 0.012)
    : 0;
  const programmingVariantLoad = lessForeshadowingLoad + sharedDeckLoad;
  const frictionLoad = baseFrictionLoad + programmingVariantLoad;

  let compactnessRaw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));
  let raw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));
  let preUncertaintyFinalRaw = Number((
    preUncertaintyRaw +
    preUncertaintyLessForeshadowingLoad +
    preUncertaintySharedDeckLoad
  ).toFixed(2));
  const variantLengthContributions = [];
  if (lessForeshadowingLoad) {
    variantLengthContributions.push({
      id: "lessForeshadowing",
      kind: "residual-programming",
      delta: Number(lessForeshadowingLoad.toFixed(2)),
      evidence: { planningPressure: programmingPressure.planningPressure }
    });
  }
  if (sharedDeckLoad) {
    variantLengthContributions.push({
      id: "classicSharedDeck",
      kind: "residual-programming",
      delta: Number(sharedDeckLoad.toFixed(2)),
      evidence: {
        planningPressure: programmingPressure.planningPressure,
        playerPressure: Number(sharedDeckPlayerPressure.toFixed(3))
      }
    });
  }
  if (actFastLoad) {
    variantLengthContributions.push({
      id: "actFast",
      kind: "direct-timer",
      delta: Number(actFastLoad.toFixed(2)),
      evidence: { mode: preferences.actFastMode ?? null }
    });
  }

  // Energy Crisis still has unmodeled real-play speed effects beyond route
  // geometry; keep the old residual isolated until calibration can revisit it.
  if (preferences.lighterGame) {
    const before = raw;
    compactnessRaw = Number((compactnessRaw * 0.89).toFixed(2));
    raw = Number((raw * 0.89).toFixed(2));
    preUncertaintyFinalRaw = Number((preUncertaintyFinalRaw * 0.89).toFixed(2));
    variantLengthContributions.push({
      id: "lighterGame",
      kind: "residual-resource",
      delta: Number((raw - before).toFixed(2)),
      multiplier: 0.89,
      evidence: { provisional: true }
    });
  }

  // Damage-deck variants, Cutting Floor, Flaming Oil, Set to Kill/Stun, Repair
  // Stations, and similar physical rules are intentionally absent here: v38
  // relies on their route/hazard/traffic consequences instead of re-multiplying
  // total game length after those consequences have already been measured.

  return {
    raw,
    compactnessRaw,
    inputs: {
      flagCount,
      playerCount: playerCount || 4,
      totalActionLoad: Number(totalActionLoad.toFixed(2)),
      totalRouteDistance: Number(totalRouteDistance.toFixed(2)),
      totalCongestion: Number(totalCongestion.toFixed(2)),
      flagAreaScore: Number(first.flagAreaScore.toFixed(2)),
      totalDifficulty: Number(sequence.summary.totalDifficulty.toFixed(2)),
      boardCount,
      forecastConfidenceMean: forecastLengthProfile.averageConfidence,
      forecastConfidenceMin: forecastLengthProfile.minimumConfidence,
      forecastConfidenceEnd: forecastLengthProfile.averageEndConfidence,
      forecastUncertainRegisters: forecastLengthProfile.uncertainRegisters,
      forecastTotalRegisters: forecastLengthProfile.totalRegisters
    },
    contributions: {
      checkpointLoad: Number(checkpointLoad.toFixed(2)),
      playerLoad: Number(playerLoad.toFixed(2)),
      actionLoad: Number(actionLoad.toFixed(2)),
      forecastUncertaintyLoad: Number(forecastUncertaintyLoad.toFixed(2)),
      forecastEquivalentActions: forecastLengthProfile.uncertaintyEquivalentActions,
      forecastSpeculativeThreshold: forecastLengthProfile.speculativeThreshold ?? LENGTH_FORECAST_SPECULATIVE_CONFIDENCE,
      forecastMaxActionUplift: forecastLengthProfile.maxActionUplift ?? LENGTH_FORECAST_MAX_ACTION_UPLIFT,
      preUncertaintyRaw: preUncertaintyFinalRaw,
      distanceLoad: Number(distanceLoad.toFixed(2)),
      congestionLoad: Number(congestionLoad.toFixed(2)),
      congestionWeight: Number(congestionWeight.toFixed(3)),
      boardHarshness: Number(harshness.normalized.toFixed(3)),
      flagAreaLoad: Number(flagAreaLoad.toFixed(2)),
      difficultyLoad: Number(difficultyLoad.toFixed(2)),
      movingTargetLoad: Number(movingTargetLoad.toFixed(2)),
      movingTargetLegacyEstimate: Number(movingTargetLegacyEstimate.toFixed(2)),
      actFastLoad: Number(actFastLoad.toFixed(2)),
      lessForeshadowingLoad: Number(lessForeshadowingLoad.toFixed(2)),
      sharedDeckLoad: Number(sharedDeckLoad.toFixed(2)),
      programmingVariantLoad: Number(programmingVariantLoad.toFixed(2)),
      routeLoad: Number(routeLoad.toFixed(2)),
      frictionLoad: Number(frictionLoad.toFixed(2))
    },
    variantLengthContributions,
    programmingPressure,
    forecastLengthProfile,
    method: "route-derived-plus-forecast-uncertainty-plus-residual-variant-length-v44"
  };
}

function bandDistance(value, band, thresholds) {
  if (band === "any") {
    return 0;
  }
  const [low, high] = thresholds[band];
  if (value < low) return low - value;
  if (value >= high) return value - high;
  return 0;
}

function shouldUseCompactLengthFit(preferences = {}) {
  return preferences.length === "short" && getTuningDifficulty(preferences.difficulty) === "hard";
}

function getMovingTargetVolatilityPenalty(stats = {}, fairnessStdDev = 0, preferences = {}) {
  if (!stats?.activeCount) {
    return 0;
  }

  const playerScale = Math.max(1, (preferences.playerCount ?? 4) / 4);
  const raw = (
    stats.activeCount * 2 +
    Math.max(0, stats.totalPathLength - stats.activeCount) * 0.35 +
    stats.totalTurns * 0.3 +
    stats.fastSegments * 0.28 +
    stats.wrapCount * 0.5 +
    Math.max(0, fairnessStdDev - 6) * 0.16
  ) * playerScale;

  return Number(raw.toFixed(2));
}

function getFullCourseExpectedRoutes(sequence) {
  return (sequence?.firstLeg?.starts || [])
    .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.fullCourseRoute)
    .map((startAnalysis) => ({
      startIndex: startAnalysis.index,
      route: startAnalysis.fullCourseRoute
    }));
}

function getRouteDramaProfile(sequence, preferences = {}) {
  const entries = getFullCourseExpectedRoutes(sequence);
  if (entries.length <= 1) {
    return {
      level: "none",
      score: 0,
      penalty: 0,
      crossings: 0,
      sharedTiles: 0,
      sharedTilePairs: 0,
      reverseEdges: 0,
      pairCount: 0
    };
  }

  let sharedTilePairs = 0;
  let reverseEdges = 0;
  const sharedTiles = new Set();

  function routeTileIndex(route) {
    const map = new Map();
    (route.path || []).forEach((point, index) => {
      const key = `${point.x},${point.y}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(index);
    });
    return map;
  }

  function routeEdges(route) {
    const edges = new Set();
    const path = route.path || [];
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (to.jump) {
        continue;
      }
      edges.add(`${from.x},${from.y}>${to.x},${to.y}`);
    }
    return edges;
  }

  const indexed = entries.map((entry) => ({
    ...entry,
    tiles: routeTileIndex(entry.route),
    edges: routeEdges(entry.route)
  }));

  for (let left = 0; left < indexed.length; left += 1) {
    for (let right = left + 1; right < indexed.length; right += 1) {
      for (const key of indexed[left].tiles.keys()) {
        const rightIndices = indexed[right].tiles.get(key);
        if (!rightIndices) {
          continue;
        }
        sharedTiles.add(key);
        sharedTilePairs += 1;
      }

      for (const edge of indexed[left].edges) {
        const [from, to] = edge.split(">");
        if (indexed[right].edges.has(`${to}>${from}`)) {
          reverseEdges += 1;
        }
      }
    }
  }

  const pairCount = (entries.length * (entries.length - 1)) / 2;
  const normalizedShared = pairCount ? sharedTilePairs / pairCount : 0;
  const normalizedReverse = pairCount ? reverseEdges / pairCount : 0;
  const score = Number(Math.min(40, normalizedShared * 2.2 + normalizedReverse * 1.6).toFixed(2));
  const target = preferences.length === "short" || preferences.difficulty === "easy"
    ? 2.5
    : preferences.length === "long" || preferences.length === "epic" || preferences.difficulty === "hard" || preferences.difficulty === "brutal"
      ? 7
      : 5;
  const weakPenaltyScale = preferences.length === "short" || preferences.difficulty === "easy" ? 0.35 : 1;
  const weakPenalty = Math.max(0, target - score) * weakPenaltyScale;
  const excessivePenalty = Math.max(0, score - 20) * 0.45;
  const penalty = Number((weakPenalty + excessivePenalty).toFixed(2));
  const level = score >= 14 ? "high" : score >= 7 ? "moderate" : score >= 3 ? "low" : "none";

  return {
    level,
    score,
    penalty,
    crossings: sharedTilePairs,
    sharedTiles: sharedTiles.size,
    sharedTilePairs,
    reverseEdges,
    pairCount
  };
}

function getOpeningLegAnticlimax(sequence, preferences = {}, usableStarts = null) {
  const sourceStarts = Array.isArray(usableStarts)
    ? usableStarts
    : (sequence?.firstLeg?.starts || []).filter((entry) => entry.reachable);
  const actions = sourceStarts
    .map((entry) => entry.selectedRoute?.actions ?? entry.bestActions)
    .filter(Number.isFinite);
  if (!actions.length) {
    return {
      active: false,
      fastestActions: null,
      averageActions: null,
      expectedFastest: 4,
      expectedAverage: 6,
      penalty: 0,
      routeCount: 0
    };
  }
  const fastestActions = Math.min(...actions);
  const averageActions = actions.reduce((sum, value) => sum + value, 0) / actions.length;
  const fastestShortfall = Math.max(0, 4 - fastestActions);
  const averageShortfall = Math.max(0, 6 - averageActions);
  const lengthScale = preferences.targetGuidanceOnlyLength
    ? 0.5
    : preferences.length === "short"
      ? 0.2
      : preferences.length === "epic"
        ? 1.0
        : preferences.length === "long"
          ? 0.8
          : 0.5;
  const penalty = (
    fastestShortfall * fastestShortfall * 2.2 +
    averageShortfall * averageShortfall * 1.2
  ) * lengthScale;
  return {
    active: fastestShortfall > 0 || averageShortfall > 0,
    fastestActions,
    averageActions: Number(averageActions.toFixed(2)),
    expectedFastest: 4,
    expectedAverage: 6,
    penalty: Number(penalty.toFixed(2)),
    routeCount: actions.length
  };
}

function getIntermediateCheckpointPacing(sequence) {
  const intermediateLegs = (sequence?.legs || []).slice(1, -1);
  const legAverages = intermediateLegs
    .map((leg, index) => ({
      from: leg?.from ?? index + 1,
      to: leg?.to ?? index + 2,
      actions: leg?.analysis?.summary?.averageRouteActions
    }))
    .filter((entry) => Number.isFinite(entry.actions));
  if (!legAverages.length) {
    return {
      active: false,
      shortestAverageActions: null,
      averageActions: null,
      expectedShortestAverage: 4,
      expectedAverage: 6,
      penalty: 0,
      legs: []
    };
  }

  const shortestAverageActions = Math.min(...legAverages.map((entry) => entry.actions));
  const averageActions = legAverages.reduce((sum, entry) => sum + entry.actions, 0) / legAverages.length;
  const shortestShortfall = Math.max(0, 4 - shortestAverageActions);
  const averageShortfall = Math.max(0, 6 - averageActions);
  const penalty = (
    shortestShortfall * shortestShortfall * 1.4 +
    averageShortfall * averageShortfall * 0.8
  );
  return {
    active: shortestShortfall > 0 || averageShortfall > 0,
    shortestAverageActions: Number(shortestAverageActions.toFixed(2)),
    averageActions: Number(averageActions.toFixed(2)),
    expectedShortestAverage: 4,
    expectedAverage: 6,
    penalty: Number(penalty.toFixed(2)),
    legs: legAverages.map((entry) => ({ ...entry, actions: Number(entry.actions.toFixed(2)) }))
  };
}

function getMeaningfulBoardUseProfile(sequence, boardPlacements = [], pieceMap = {}, usableStarts = []) {
  if (boardPlacements.length <= 1) return { penalty: 0, boards: [] };
  const routes = [];
  usableStarts.forEach((entry) => { if (entry.selectedRoute) routes.push(entry.selectedRoute); });
  sequence?.legs?.slice(1).forEach((leg) => (leg.analysis?.distinctRoutes || []).forEach((route) => routes.push(route)));
  const boards = boardPlacements.map((placement, boardIndex) => {
    const routeTiles = new Set();
    let routeVisits = 0;
    routes.forEach((route) => {
      let touched = false;
      (route.path || []).forEach((point) => {
        if (!pointOnPlacement(point, placement, pieceMap)) return;
        routeTiles.add(`${point.x},${point.y}`);
        touched = true;
      });
      if (touched) routeVisits += 1;
    });
    return { boardIndex, uniqueRouteTiles: routeTiles.size, routeVisits };
  });
  // A board touched by only one or two route spaces is visually token use even
  // when a checkpoint technically lies there. Keep it legal, but make it a worse
  // fit than a course that traverses a meaningful part of every placed board.
  const penalty = boards.reduce((sum, board) => {
    if (board.uniqueRouteTiles === 0) return sum; // handled by unused-board gate
    if (board.uniqueRouteTiles <= 2) return sum + 8;
    if (board.uniqueRouteTiles <= 4) return sum + 3;
    return sum;
  }, 0);
  return { penalty: Number(penalty.toFixed(2)), boards };
}

function getFinalLegAnticlimax(sequence, preferences = {}) {
  const finalLeg = sequence?.legs?.at(-1);
  if (!finalLeg || sequence.legs.length <= 1) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const routes = finalLeg.analysis?.distinctRoutes || finalLeg.analysis?.routes || [];
  const actions = routes
    .map((route) => route.actions)
    .filter(Number.isFinite);
  if (!actions.length) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const fastestActions = Math.min(...actions);
  const shortfall = Math.max(0, 6 - fastestActions);
  const lengthScale = preferences.targetGuidanceOnlyLength
    ? 0.85
    : preferences.length === "short"
      ? 0.25
      : preferences.length === "epic"
        ? 1.5
        : preferences.length === "long"
          ? 1.25
          : 0.85;
  const difficultyScale = preferences.targetGuidanceOnlyDifficulty
    ? 0.9
    : preferences.difficulty === "easy"
      ? 0.55
      : preferences.difficulty === "hard" || preferences.difficulty === "brutal"
        ? 1.15
        : 0.9;
  const penalty = Number((shortfall * shortfall * 3.5 * lengthScale * difficultyScale).toFixed(2));

  return {
    active: penalty > 0,
    fastestActions,
    penalty,
    routeCount: routes.length
  };
}

function getRoutedCheckpointPacingExpectation(openingLegAnticlimax, intermediateCheckpointPacing, finalLegAnticlimax) {
  // Player-facing checkpoint quality is based on routed register demand, not
  // Manhattan distance. Opening and middle legs use field/route averages, while
  // the final leg protects the catch-up window by requiring more than one normal
  // five-register program for even the fastest route.
  const deviations = [];
  const openingFastest = openingLegAnticlimax?.fastestActions;
  const openingAverage = openingLegAnticlimax?.averageActions;
  if (Number.isFinite(openingFastest) && openingFastest < 4) {
    deviations.push({
      type: "opening-fastest",
      actual: openingFastest,
      expectedMinimum: 4,
      severity: 4 - openingFastest
    });
  }
  if (Number.isFinite(openingAverage) && openingAverage < 6) {
    deviations.push({
      type: "opening-average",
      actual: openingAverage,
      expectedMinimum: 6,
      severity: 6 - openingAverage
    });
  }

  const middleShortest = intermediateCheckpointPacing?.shortestAverageActions;
  const middleAverage = intermediateCheckpointPacing?.averageActions;
  if (Number.isFinite(middleShortest) && middleShortest < 4) {
    deviations.push({
      type: "middle-shortest-average",
      actual: middleShortest,
      expectedMinimum: 4,
      severity: 4 - middleShortest
    });
  }
  if (Number.isFinite(middleAverage) && middleAverage < 6) {
    deviations.push({
      type: "middle-average",
      actual: middleAverage,
      expectedMinimum: 6,
      severity: 6 - middleAverage
    });
  }

  const finalFastest = finalLegAnticlimax?.fastestActions;
  if (Number.isFinite(finalFastest) && finalFastest < 6) {
    deviations.push({
      type: "final-fastest",
      actual: finalFastest,
      expectedMinimum: 6,
      severity: 6 - finalFastest
    });
  }

  return {
    acceptable: deviations.length === 0,
    penalty: Number((
      (Number(openingLegAnticlimax?.penalty) || 0) +
      (Number(intermediateCheckpointPacing?.penalty) || 0) +
      (Number(finalLegAnticlimax?.penalty) || 0)
    ).toFixed(2)),
    deviations
  };
}

function classifyCandidate(sequence, preferences, context = {}) {
  const reachableStarts = computeCourseReachableStarts(sequence.firstLeg);
  const usableStarts = computeUsableStarts(sequence.firstLeg, preferences);
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const pricedStartBalance = sequence.firstLeg.summary.payToWin?.residualBalance ?? null;
  const fairnessStdDev = (preferences.payToWin || preferences.subsidizedStarts)
    ? (pricedStartBalance?.worstStdDev ?? sequence.firstLeg.summary.scoreStdDev)
    : sequence.firstLeg.summary.scoreStdDev;
  const skipCompetitiveBlockImpact = Boolean(context.skipCompetitiveBlockImpact);
  const competitiveBlockImpact = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? (sequence.firstLeg.summary.competitiveStartBalance ?? null)
    : null;
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints, preferences)
    : summarizeMovingTargets(null, [], preferences);
  const variantDifficultyAccounting = computeVariantDifficultyAccounting(
    computeDifficultyRaw(sequence, checkpointPressure),
    {
      ...preferences,
      competitiveStrategicDifficulty: competitiveBlockImpact?.strategicDifficulty ?? null,
      movingTargetStats,
      goalTileMap: context.goalTileMap ?? context.tileMap
    },
    sequence
  );
  let difficultyRaw = variantDifficultyAccounting.final;
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );
  const lengthRaw = lengthMetrics.raw;
  const lengthFitRaw = shouldUseCompactLengthFit(preferences)
    ? lengthMetrics.compactnessRaw
    : lengthRaw;

  const difficultyThresholds = getDifficultyThresholds();
  const lengthThresholds = getLengthThresholds();

  const hardFailures = [];
  if (lengthFitRaw < MIN_LENGTH_RAW) {
    hardFailures.push("too-short");
  }
  if (usableStarts.length < preferences.playerCount) {
    hardFailures.push("usable-starts");
  }

  if (reachableStarts.length < preferences.playerCount) {
    hardFailures.push("reachable-starts");
  }

  if (sequence.firstLeg.summary.normalStartBalance?.reject) {
    hardFailures.push("normal-start-balance");
  }
  if (
    (preferences.payToWin || preferences.subsidizedStarts) &&
    sequence.firstLeg.summary.payToWin?.balanceValid === false
  ) {
    hardFailures.push("priced-start-balance");
  }

  if (preferences.competitiveMode) {
    const staging = sequence.firstLeg.summary.competitiveStaging;
    const unavailableStartCount = staging?.unavailableIndices?.length
      ?? Math.max(0, (staging?.sourceStartCount ?? reachableStarts.length) - (staging?.routedStartCount ?? reachableStarts.length));
    const requiredCompetitiveStarts = Math.max(1, preferences.playerCount * 2);
    const competitiveCapacityShortfall = (
      (staging?.sourceStartCount ?? reachableStarts.length) < requiredCompetitiveStarts ||
      (staging?.routedStartCount ?? reachableStarts.length) < requiredCompetitiveStarts
    );
    if (unavailableStartCount > 0 || competitiveCapacityShortfall) {
      hardFailures.push("competitive-start-availability");
    }
    if (!skipCompetitiveBlockImpact && !competitiveBlockImpact?.acceptable) {
      hardFailures.push("competitive-start-balance");
    }
  }

  if (context.boardPlacements?.length > 1 && context.pieceMap && context.checkpoints) {
    const physicalUsageStarts = preferences.competitiveMode
      ? reachableStarts
      : usableStarts;
    const usedBoards = collectUsedBoardIndices(
      sequence,
      context.boardPlacements,
      context.pieceMap,
      physicalUsageStarts,
      context.checkpoints
    );

    if (usedBoards.size < context.boardPlacements.length) {
      hardFailures.push("unused-board");
    }
  }

  for (const leg of sequence.legs.slice(1)) {
    if (leg.analysis.summary.distinctRouteCount === 0) {
      hardFailures.push(`leg-${leg.from}-${leg.to}`);
    }
  }

  const difficultyGuidanceFit = bandDistance(difficultyRaw, preferences.difficulty, difficultyThresholds);
  const lengthGuidanceFit = bandDistance(lengthFitRaw, preferences.length, lengthThresholds);
  const difficultyFit = preferences.targetGuidanceOnlyDifficulty ? 0 : difficultyGuidanceFit;
  const lengthFit = preferences.targetGuidanceOnlyLength ? 0 : lengthGuidanceFit;
  const difficultyDirection = (preferences.difficulty === "any" || preferences.targetGuidanceOnlyDifficulty)
    ? "matched"
    : difficultyRaw < difficultyThresholds[preferences.difficulty][0]
      ? "low"
      : difficultyRaw >= difficultyThresholds[preferences.difficulty][1]
        ? "high"
        : "matched";
  const lengthDirection = (preferences.length === "any" || preferences.targetGuidanceOnlyLength)
    ? "matched"
    : lengthFitRaw < lengthThresholds[preferences.length][0]
      ? "low"
      : lengthFitRaw >= lengthThresholds[preferences.length][1]
        ? "high"
        : "matched";
  const fairnessPenalty = preferences.competitiveMode
    ? 0
    : fairnessStdDev >= 14 ? fairnessStdDev - 14 : 0;
  const competitiveBlockPenalty = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? (
      Math.max(0, preferences.playerCount - (competitiveBlockImpact?.selectedStartCount ?? 0)) * 18 +
      (competitiveBlockImpact?.selectedOutlierCount ?? competitiveBlockImpact?.remainingOutlierCount ?? 0) * 24 +
      Math.max(0, (competitiveBlockImpact?.selectedStdDev ?? 0) - NORMAL_START_FAIRNESS_STDDEV_LIMIT) * 2 +
      Math.max(0, (competitiveBlockImpact?.worstScoreZ ?? 0) - FULL_START_OUTLIER_Z) * 4 +
      Math.max(0, (competitiveBlockImpact?.worstActionZ ?? 0) - (FULL_START_OUTLIER_Z + 0.35)) * 3
    )
    : 0;
  const movingTargetVolatilityPenalty = getMovingTargetVolatilityPenalty(
    movingTargetStats,
    fairnessStdDev,
    preferences
  );
  const checkpointOpeningStarts = preferences.competitiveMode ? reachableStarts : usableStarts;
  const openingLegAnticlimax = getOpeningLegAnticlimax(sequence, preferences, checkpointOpeningStarts);
  const intermediateCheckpointPacing = getIntermediateCheckpointPacing(sequence);
  const finalLegAnticlimax = getFinalLegAnticlimax(sequence, preferences);
  const routedCheckpointPacingExpectation = getRoutedCheckpointPacingExpectation(
    openingLegAnticlimax,
    intermediateCheckpointPacing,
    finalLegAnticlimax
  );
  const meaningfulBoardUse = getMeaningfulBoardUseProfile(
    sequence,
    context.boardPlacements ?? [],
    context.pieceMap ?? {},
    preferences.competitiveMode ? reachableStarts : usableStarts
  );
  const routeDrama = getRouteDramaProfile(sequence, preferences);
  const spacingStarts = Array.isArray(context.activeStarts) && context.activeStarts.length
    ? context.activeStarts
    : (sequence?.firstLeg?.starts ?? []).map((entry) => entry.start).filter(Boolean);
  const checkpointSpacingExpectation = getCheckpointSpacingExpectationProfile(
    context.checkpoints ?? [],
    spacingStarts,
    preferences
  );
  const fitScore = (
    difficultyFit * 1.2 +
    lengthFit +
    fairnessPenalty * 0.5 +
    competitiveBlockPenalty +
    movingTargetVolatilityPenalty +
    openingLegAnticlimax.penalty +
    intermediateCheckpointPacing.penalty +
    finalLegAnticlimax.penalty +
    meaningfulBoardUse.penalty +
    routeDrama.penalty +
    Math.max(0, preferences.playerCount - usableStarts.length) * 20
  );

  return {
    reachableStarts: reachableStarts.length,
    usableStarts,
    difficultyRaw,
    lengthRaw,
    lengthFitRaw,
    difficultyFit,
    difficultyDirection,
    lengthMetrics,
    lengthFit,
    lengthDirection,
    fairnessStdDev,
    competitiveBlockImpact,
    checkpointPressure,
    variantDifficultyAccounting,
    programmingPressure: variantDifficultyAccounting.programmingPressure,
    movingTargetStats,
    movingTargetVolatilityPenalty,
    openingLegAnticlimax,
    intermediateCheckpointPacing,
    finalLegAnticlimax,
    routedCheckpointPacingExpectation,
    meaningfulBoardUse,
    routeDrama,
    checkpointSpacingExpectation,
    acceptable: hardFailures.length === 0 &&
      difficultyFit === 0 &&
      lengthFit === 0,
    hardFailures,
    fitScore: Number(fitScore.toFixed(2))
  };
}


function hashScenarioFingerprintPayload(payload) {
  const text = String(payload ?? "");
  if (!text) return null;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function getCourseConstructionFingerprint(
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = []
) {
  const placementKey = (placement) => [
    placement?.pieceId ?? "?",
    placement?.x ?? "?",
    placement?.y ?? "?",
    placement?.rotation ?? 0,
    placement?.flipped ? 1 : 0,
    placement?.overlay ? 1 : 0
  ].join(",");
  const checkpointKey = (checkpoint, index) => [
    checkpoint?.id ?? index + 1,
    checkpoint?.x ?? "?",
    checkpoint?.y ?? "?",
    checkpoint?.facing ?? "-"
  ].join(",");
  const payload = [
    `boards:${boardPlacements.map(placementKey).join(";")}`,
    `docks:${dockPlacements.map(placementKey).join(";")}`,
    `overlays:${overlayPlacements.map(placementKey).join(";")}`,
    `flags:${checkpoints.map(checkpointKey).join(";")}`
  ].join("|");
  return hashScenarioFingerprintPayload(payload);
}

function getScenarioSelectedRouteFingerprint(scenario) {
  const starts = scenario?.sequence?.firstLeg?.starts ?? [];
  const payload = starts
    .filter((entry) => Number.isInteger(entry?.index) && entry?.fullCourseRoute)
    .sort((left, right) => left.index - right.index)
    .map((entry) => {
      const route = entry.fullCourseRoute;
      const actions = Array.isArray(route.actionHistory) ? route.actionHistory.join(",") : "";
      const hits = Array.isArray(route.checkpointHits)
        ? route.checkpointHits.map((hit) => `${hit.checkpointId ?? hit.checkpointIndex}:${hit.action ?? "?"}:${hit.state?.x ?? "?"},${hit.state?.y ?? "?"},${hit.state?.facing ?? "?"}`).join(";")
        : "";
      return `${entry.index}|${actions}|${hits}|${route.score ?? "?"}`;
    })
    .join("||");

  return hashScenarioFingerprintPayload(payload);
}

function buildScenarioCopySummary(scenario) {
  if (!scenario) {
    return "No course generated.";
  }

  const summary = scenario.sequence?.firstLeg?.summary ?? {};
  const diagnostics = scenario.generationDiagnostics ?? null;
  const balance = summary.normalStartBalance ?? null;
  const competitive = scenario.metrics?.competitiveBlockImpact ?? null;
  const payToWin = summary.payToWin ?? null;
  const contextualCache = summary.contextualLegCache ?? null;
  const currentNormalEstimateModel = Boolean(
    contextualCache?.estimatedPrimaryRouting &&
    !scenario.payToWin &&
    !scenario.subsidizedStarts
  );
  const courseEnergyEconomy = buildCourseEnergyEconomyDiagnostics(scenario);
  const profile = diagnostics?.contextualProfileTotals ?? null;
  const playableCheckpoints = getPlayableCheckpoints(
    scenario.checkpoints ?? [],
    scenario.virtualBots
  );
  const selectedSets = [...getSelectedExpansionIds(scenario.preferences ?? {})]
    .map((id) => formatExpansionName(id))
    .join(", ") || "none";
  const variantImpact = getVariantImpactSummary(scenario) || "none";
  const scenarioMaxAttempts = getScenarioGenerationMaxAttempts(scenario);
  const hasExplicitTargetMismatch = (scenario.metrics?.difficultyFit ?? 0) > 0 || (scenario.metrics?.lengthFit ?? 0) > 0;
  const resultLabel = scenario.generationBestMatch
    ? `${hasExplicitTargetMismatch ? "closest match" : "fallback course"}, ${scenario.attempts ?? "?"} / ${scenarioMaxAttempts} attempt(s), termination ${scenario.generationTerminationReason ?? diagnostics?.terminationReason ?? "attempt-limit"}`
    : `accepted, ${scenario.attempts ?? "?"} / ${scenarioMaxAttempts} attempt(s)`;
  const openingPacing = scenario.metrics?.openingLegAnticlimax ?? null;
  const intermediatePacing = scenario.metrics?.intermediateCheckpointPacing ?? null;
  const finalPacing = scenario.metrics?.finalLegAnticlimax ?? null;
  const checkpointPlacementAdvisory = getCheckpointPlacementAdvisory(scenario);
  const checkpointPacingSummary = [
    Number.isFinite(openingPacing?.fastestActions) && Number.isFinite(openingPacing?.averageActions)
      ? `opening fastest/avg ${openingPacing.fastestActions}/${openingPacing.averageActions} vs 4/6 registers`
      : "opening n/a",
    Number.isFinite(intermediatePacing?.shortestAverageActions) && Number.isFinite(intermediatePacing?.averageActions)
      ? `middle shortest/avg ${intermediatePacing.shortestAverageActions}/${intermediatePacing.averageActions} vs 4/6 registers`
      : "middle n/a",
    Number.isFinite(finalPacing?.fastestActions)
      ? `final fastest ${finalPacing.fastestActions}/6 registers`
      : "final n/a",
    checkpointPlacementAdvisory?.active
      ? `player advisory severity ${checkpointPlacementAdvisory.severity}/${checkpointPlacementAdvisory.threshold}`
      : checkpointPlacementAdvisory?.hasDeviation
        ? `minor deviation ${checkpointPlacementAdvisory.severity}/${checkpointPlacementAdvisory.threshold} (no player note)`
        : "ordinary"
  ].join("; ");

  const lines = [
    `Requested: ${scenario.preferences?.playerCount ?? "?"}p, ${formatDifficultyLabel(scenario.preferences?.difficulty)} / ${formatLengthLabel(scenario.preferences?.length)}`,
    `Mode: ${formatGenerationModeLabel(getScenarioGenerationMode(scenario))}`,
    `Sets: ${selectedSets}`,
    `Variants: ${variantImpact}`,
    `Result: ${resultLabel}`
  ];

  if (Number.isInteger(scenario.devTestSeed)) {
    lines.push(`Dev test seed: ${formatDevGenerationSeed(scenario.devTestSeed)} (construction RNG frozen)`);
    const constructionFingerprint = scenario.constructionFingerprint ?? null;
    if (constructionFingerprint) lines.push(`Construction fingerprint: ${constructionFingerprint}`);
    const routeFingerprint = getScenarioSelectedRouteFingerprint(scenario);
    if (routeFingerprint) lines.push(`Selected-route fingerprint: ${routeFingerprint}`);
    const rejectedFingerprints = [...new Set(
      (diagnostics?.rejectionEvents ?? [])
        .filter((entry) => entry?.constructionFingerprint)
        .map((entry) => `e${entry.evaluation ?? "?"}:${entry.constructionFingerprint}`)
    )];
    if (rejectedFingerprints.length) {
      lines.push(`Rejected construction fingerprints: ${rejectedFingerprints.join(", ")}`);
    }
  }

  if (diagnostics) {
    lines.push(
      `Generation: ${formatGenerationDuration(diagnostics.totalMs)} total, ${formatGenerationDuration(diagnostics.routeSearchMs)} route search, ${diagnostics.routeSearches ?? 0} searches, ${diagnostics.routeExpansions ?? 0} expansions, ${diagnostics.cappedRouteSearches ?? 0} capped`
    );
    if (diagnostics.routeSearchTotalsByKind) {
      lines.push(`Route kinds: ${formatRouteSearchKindBreakdown(diagnostics.routeSearchTotalsByKind)}`);
    }
    if (diagnostics.searchProfile) {
      const search = diagnostics.searchProfile;
      lines.push(
        currentNormalEstimateModel
          ? `Search profile: ${diagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}; attempts ${diagnostics.maxAttempts ?? scenarioMaxAttempts}${diagnostics.emergencyAttemptReserve ? ` +${diagnostics.emergencyAttemptReserve} emergency only if no fallback` : ""}, preflight audition ${Math.min(Number(search.preflightOpeningExpansions) || 700, 700)}/${Math.min(Number(search.preflightLaterExpansions) || 600, 600)}exp, primary witnesses ${search.primaryWitnessRoutes ?? "?"}, traffic ${search.trafficEnabled ? `${search.trafficEpochs ?? 0} exploration epoch(s), alternates ${search.trafficAlternatesEnabled ? "on" : "off"}, common judgement demand≥${search.trafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD}/gain≥${search.trafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN}, bounded new-search ${search.trafficAlternateMaxNewSearchesPerEpoch ?? 0}/epoch @${search.trafficAlternateExpansions ?? 0}exp/${search.trafficAlternateMaxActions ?? 0}a, uncertainty effort floor ${search.trafficAlternateUncertaintyEffortFloor ?? 1}/curve ${search.trafficAlternateUncertaintyEffortExponent ?? 1}, explore-gap ${Math.round((search.trafficExplorationUncertaintyShare ?? 0) * 100)}% above conf ${search.trafficExplorationConfidenceFloor ?? 1}${search.devRouteModelOverrideActive ? ", Dev override" : ""}` : `off${search.devRouteModelOverrideActive ? " (Dev override)" : ""}`}`
          : scenario.competitiveMode
            ? `Search profile: ${diagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}; Competitive shares the regular route foundation and replaces only Normal pruning with sequential strategic blocks; attempts ${diagnostics.maxAttempts ?? scenarioMaxAttempts}, traffic ${search.trafficEnabled ? "on" : "off"}`
            : (scenario.payToWin || scenario.subsidizedStarts)
              ? `Search profile: ${diagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}; priced starts share the all-start estimate→realize route foundation, then apply card-aware Energy balancing; attempts ${diagnostics.maxAttempts ?? scenarioMaxAttempts}, traffic ${search.trafficEnabled ? "on" : "off"}`
              : `Search profile: special-setup routing path; attempts ${diagnostics.maxAttempts ?? scenarioMaxAttempts}, traffic ${search.trafficEnabled ? "on" : "off"}`
      );
    }
    if (diagnostics.slowestRouteSearch) {
      const slowest = diagnostics.slowestRouteSearch;
      lines.push(
        `Slowest: ${slowest.kind ?? "route"} ${formatGenerationDuration(slowest.durationMs)}, ${slowest.expansions ?? 0}/${slowest.maxExpansions ?? 0} expansions, ${slowest.returnedRoutes ?? 0} routes${slowest.hitActionHorizon ? `, horizon touched ${slowest.actionHorizonStops ?? 0}x (max local ${slowest.maxLocalActionsSeen ?? 0})` : ""}`
      );
    }
    if (profile) {
      const physicalCache = diagnostics.physicalCacheTotals ?? {
        hits: profile.physicalCacheHits ?? 0,
        misses: profile.physicalCacheMisses ?? 0
      };
      lines.push(
        `Physical cache: ${physicalCache.hits ?? 0}/${(physicalCache.hits ?? 0) + (physicalCache.misses ?? 0)} hits`
      );
      const contextualKind = diagnostics.routeSearchTotalsByKind?.["contextual-leg"] ?? null;
      if (contextualKind?.searches) {
        lines.push(
          `Contextual timing: ${formatGenerationDuration(contextualKind.durationMs)} across ${contextualKind.searches} searches/${contextualKind.expansions} exp; ${formatContextualProfileShare(profile, contextualKind.durationMs)}`,
          `Contextual efficiency: ${formatContextualEfficiency(profile, contextualKind.expansions)}`
        );
        const contextualGoalHealth = formatContextualGoalSearchHealth(profile, contextualKind.searches);
        if (contextualGoalHealth) lines.push(`Contextual goal search: ${contextualGoalHealth}`);
        const contextualFidelityHealth = formatContextualFidelityHealth(profile);
        if (contextualFidelityHealth) lines.push(`Contextual horizon: ${contextualFidelityHealth}`);
        const dominanceKeyDiagnostics = formatContextualDominanceKeyDiagnostics(profile);
        if (dominanceKeyDiagnostics) {
          lines.push(`Dominance key space (diagnostic only; not safe-to-prune claims): ${dominanceKeyDiagnostics}`);
        }
        const usageParetoDiagnostics = formatContextualUsageParetoDiagnostics(profile);
        if (usageParetoDiagnostics) {
          lines.push(`Program-resource Pareto (diagnostic upper bound; not a prune rule): ${usageParetoDiagnostics}`);
        }
      }
    }
    if (diagnostics.slowestRouteSearch?.contextualProfile) {
      const slowest = diagnostics.slowestRouteSearch;
      lines.push(
        `Slowest contextual profile: ${formatContextualProfileShare(slowest.contextualProfile, slowest.durationMs)}; ${formatContextualEfficiency(slowest.contextualProfile, slowest.expansions)}`
      );
    }
    const rejectionSummary = diagnostics.rejectionSummary ?? summarizeGenerationRejectionEvents(
      diagnostics.rejectionEvents ?? []
    );
    if (rejectionSummary.total > 0) {
      lines.push(
        `Rejected evaluations: ${rejectionSummary.total}; ${rejectionSummary.categories.map((entry) => `${entry.category} ${entry.count}`).join(", ")}`,
        `Rejected route work: ${rejectionSummary.categories.map((entry) => `${entry.category} ${entry.routeExpansions} exp/${entry.cappedRouteSearches} capped`).join(", ")}`
      );
      for (const entry of rejectionSummary.categories) {
        if (entry.routeSearchTotalsByKind) {
          lines.push(`Rejected kinds ${entry.category}: ${formatRouteSearchKindBreakdown(entry.routeSearchTotalsByKind)}`);
        }
        if (!(entry.contextualSearches > 0) || !(entry.contextualDurationMs > 0)) continue;
        lines.push(
          `Rejected profiler ${entry.category}: ${formatGenerationDuration(entry.contextualDurationMs)} contextual/${entry.contextualSearches} searches/${entry.contextualExpansions} exp; ${formatContextualProfileShare(entry.contextualProfile, entry.contextualDurationMs)}; ${formatContextualEfficiency(entry.contextualProfile, entry.contextualExpansions)}`
        );
        const rejectedGoalHealth = formatContextualGoalSearchHealth(entry.contextualProfile, entry.contextualSearches);
        if (rejectedGoalHealth) lines.push(`Rejected goal search ${entry.category}: ${rejectedGoalHealth}`);
        const rejectedFidelityHealth = formatContextualFidelityHealth(entry.contextualProfile);
        if (rejectedFidelityHealth) lines.push(`Rejected horizon ${entry.category}: ${rejectedFidelityHealth}`);
        const rejectedDominanceKeyDiagnostics = formatContextualDominanceKeyDiagnostics(entry.contextualProfile);
        if (rejectedDominanceKeyDiagnostics) {
          lines.push(`Rejected dominance keys ${entry.category} (diagnostic only): ${rejectedDominanceKeyDiagnostics}`);
        }
        const rejectedUsageParetoDiagnostics = formatContextualUsageParetoDiagnostics(entry.contextualProfile);
        if (rejectedUsageParetoDiagnostics) {
          lines.push(`Rejected program-resource Pareto ${entry.category} (diagnostic upper bound): ${rejectedUsageParetoDiagnostics}`);
        }
      }
    }

    const preflightFailureEvents = (diagnostics.rejectionEvents ?? []).filter(
      (event) => event.diagnostics?.preflight
    );
    for (const event of preflightFailureEvents.slice(0, 8)) {
      const detail = event.diagnostics.preflight;
      const profileBits = [];
      if (Number.isFinite(detail.difficultyRaw)) profileBits.push(`difficulty ${detail.difficultyRaw}`);
      if (Number.isFinite(detail.lengthRaw)) profileBits.push(`length ${detail.lengthRaw}`);
      lines.push(
        `Preflight rejection e${event.evaluation ?? "?"}: opening ${detail.openingRoutedCount ?? 0}/${detail.requiredOpeningCount ?? "?"}, searched ${detail.openingSearchedCount ?? "?"}${detail.openingUnresolvedCount ? ` (+${detail.openingUnresolvedCount} unresolved)` : ""}, intrinsic pruned ${(detail.intrinsicPruned ?? []).length}, ${detail.work?.expansions ?? event.routeExpansions ?? 0} exp/${detail.work?.capped ?? event.cappedRouteSearches ?? 0} capped${profileBits.length ? `, rough ${profileBits.join(", ")}` : ""}`
      );
    }

    const routePoolFailureEvents = (diagnostics.rejectionEvents ?? []).filter(
      (event) => event.diagnostics?.routePool
    );
    for (const event of routePoolFailureEvents.slice(0, 8)) {
      const detail = event.diagnostics.routePool;
      const health = detail.failureHealth ?? {};
      lines.push(
        `Route-pool rejection e${event.evaluation ?? "?"}: ${detail.mode ?? "course"}, opening ${detail.sourceOpeningCount ?? 0}, candidates ${detail.candidateCount ?? 0}, coherent ${detail.coherentRoutedCount ?? 0}/${detail.requiredCount ?? "?"}, ${detail.work?.expansions ?? event.routeExpansions ?? 0} exp/${detail.work?.capped ?? event.cappedRouteSearches ?? 0} capped${health.legNumber ? `, failed after leg ${health.legNumber}` : ""}${Number.isFinite(health.maximumPossibleStarts) ? `, max possible ${health.maximumPossibleStarts}` : ""}${Number.isFinite(health.processedStartsThisLeg) ? ` after ${health.processedStartsThisLeg} checked` : ""}`
      );
    }

    const targetGateFailureEvents = (diagnostics.rejectionEvents ?? []).filter(
      (event) => event.diagnostics?.targetGate
    );
    for (const event of targetGateFailureEvents.slice(0, 8)) {
      const detail = event.diagnostics.targetGate;
      if (detail.method === "calibrated-checkpoints-known") {
        const lengthInterval = detail.lengthInterval ?? {};
        const difficultyInterval = detail.difficultyInterval ?? {};
        lines.push(
          `Target-gate rejection e${event.evaluation ?? "?"}: calibrated checkpoints length ${detail.predictedLengthRaw ?? "?"} [${Number.isFinite(Number(lengthInterval.low)) ? Number(Number(lengthInterval.low).toFixed(1)) : "?"}..${Number.isFinite(Number(lengthInterval.high)) ? Number(Number(lengthInterval.high).toFixed(1)) : "?"}], difficulty ${detail.predictedDifficultyRaw ?? "?"} [${Number.isFinite(Number(difficultyInterval.low)) ? Number(Number(difficultyInterval.low).toFixed(1)) : "?"}..${Number.isFinite(Number(difficultyInterval.high)) ? Number(Number(difficultyInterval.high).toFixed(1)) : "?"}], work ~${detail.predictedRouteExpansions ?? "?"} expansions; exact routing skipped`
        );
      } else {
        lines.push(
          `Target-gate rejection e${event.evaluation ?? "?"}: difficulty ${detail.difficultyRaw ?? "?"}, length ${detail.lengthRaw ?? "?"}, fit-length ${detail.lengthFitRaw ?? "?"}, pool ${detail.routePoolSurvivors ?? 0}/${detail.routePoolRequired ?? "?"}, ${detail.work?.expansions ?? event.routeExpansions ?? 0} pool exp/${detail.work?.capped ?? event.cappedRouteSearches ?? 0} capped`
        );
      }
    }
  }

  const acceptedPreflight = summary.coursePreflight ?? null;
  if (acceptedPreflight?.active) {
    lines.push(
      `Preflight: opening ${acceptedPreflight.openingRoutedCount ?? 0}/${acceptedPreflight.requiredOpeningCount ?? "?"}, searched ${acceptedPreflight.openingSearchedCount ?? "?"}${acceptedPreflight.openingUnresolvedCount ? ` (+${acceptedPreflight.openingUnresolvedCount} unresolved)` : ""}, intrinsic pruned ${(acceptedPreflight.intrinsicPruned ?? []).length}, rough difficulty ${acceptedPreflight.difficultyRaw ?? "n/a"}, length ${acceptedPreflight.lengthRaw ?? "n/a"}, ${acceptedPreflight.routeExpansions ?? 0} exp/${acceptedPreflight.cappedRouteSearches ?? 0} capped, no traffic`
    );
    if (acceptedPreflight.routePool) {
      const pool = acceptedPreflight.routePool;
      lines.push(
        `Route pool: ${pool.mode ?? "course"}, candidates ${pool.candidateCount ?? 0}, coherent ${pool.coherentRoutedCount ?? 0}/${pool.requiredCount ?? "?"}, ${pool.routeExpansions ?? 0} exp/${pool.cappedRouteSearches ?? 0} capped${pool.openingReused ? ", opening reused" : ""}`
      );
    }
  }
  const constructionPrior = scenario.constructionGuidancePrior ?? scenario.lengthConstructionPrior ?? null;
  lines.push(
    `Course: ${scenario.boardCount ?? scenario.mainBoardIds?.length ?? 0} board(s), ${playableCheckpoints.length} flag(s)`,
    ...(constructionPrior
      ? [`Construction calibration: planned ${constructionPrior.boardCount} board(s) + ${constructionPrior.flagCount} flag(s) -> length ${constructionPrior.predictedLengthRaw ?? constructionPrior.predictedLength ?? "?"}, difficulty ${constructionPrior.predictedDifficultyRaw ?? "n/a"}, target fit ${Math.round((constructionPrior.targetDesirability ?? 0) * 100)}%, structural success ${Number.isFinite(constructionPrior.structuralSuccessProbability) ? `${Math.round(constructionPrior.structuralSuccessProbability * 100)}%` : "n/a"}, work ~${constructionPrior.predictedRouteExpansions ?? "n/a"} expansions, n ${constructionPrior.sampleSize ?? "?"}`]
      : []),
    `Boards: ${(scenario.mainBoardIds ?? []).map((pieceId, index) => `${pieceId}@${scenario.mainRotations?.[index] ?? 0}`).join(", ") || "none"}`,
    scenario.competitiveMode && summary.competitiveStaging?.active
      ? `Starts: physical ${summary.competitiveStaging.sourceStartCount ?? scenario.activeStarts?.length ?? "?"} -> exact ${summary.competitiveStaging.routedStartCount ?? scenario.metrics?.reachableStarts ?? "?"} -> simulated best-${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} ${scenario.metrics?.usableStarts?.length ?? "?"}; all validated physical starts remain user-visible`
      : contextualCache?.estimatedPrimaryRouting
        ? `Starts: structural ${scenario.activeStarts?.length ?? "?"} -> estimated ${contextualCache.estimatedMilestoneRoutes ?? "?"} -> exact ${contextualCache.survivingStarts ?? scenario.validatedStartIndices?.length ?? "?"} -> usable ${scenario.metrics?.usableStarts?.length ?? "?"}`
        : `Starts: ${scenario.metrics?.reachableStarts ?? summary.reachableStarts ?? "?"} reachable -> ${scenario.metrics?.usableStarts?.length ?? "?"} usable / ${scenario.activeStarts?.length ?? summary.coursePreflight?.sourceStartCount ?? summary.contextualStaging?.sourceStartCount ?? scenario.sequence?.starts?.length ?? "?"} total`
  );
  const calibrationStages = scenario.constructionGuidanceStages ?? null;
  if (calibrationStages?.boardsKnown || calibrationStages?.checkpointsKnown) {
    const formatStage = (label, prediction) => prediction
      ? `${label} L${prediction.length?.raw ?? "?"}/D${prediction.difficulty?.raw ?? "?"}/~${prediction.routeCost?.predictedExpansions ?? "?"}exp`
      : `${label} n/a`;
    lines.push(
      `Calibration stages: ${formatStage("boards", calibrationStages.boardsKnown)}; ${formatStage("checkpoints", calibrationStages.checkpointsKnown)}`
    );
  }

  if (!scenario.virtualBots) {
    if (contextualCache?.estimatedPrimaryRouting) {
      const structuralCount = scenario.activeStarts?.length ?? 0;
      const estimatedCount = contextualCache.estimatedMilestoneRoutes ?? 0;
      const realizedCount = contextualCache.survivingStarts ?? (scenario.validatedStartIndices ?? []).length;
      const physicalImpossible = contextualCache.estimatedPhysicalFailureStarts ?? Math.max(0, structuralCount - estimatedCount);
      const routingUnresolved = Math.max(0, estimatedCount - realizedCount);
      lines.push(
        `Start disposition: structural ${structuralCount}, estimated ${estimatedCount}, realized ${realizedCount}, physical-impossible ${physicalImpossible}, routing-unresolved ${routingUnresolved}${scenario.startDisposition ? `; normal-pruned ${scenario.startDisposition.normalPrunedIndices?.length ?? 0}, competitive-sim-blocked ${scenario.startDisposition.competitiveStrategicBlockIndices?.length ?? 0}, competitive-sim-selected ${scenario.startDisposition.competitiveSelectedIndices?.length ?? 0}, price-pruned ${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices)?.length ?? 0}, selector-unavailable ${scenario.startDisposition.selectorUnavailableIndices?.length ?? 0}, other ${scenario.startDisposition.otherBlockedIndices?.length ?? 0}` : ""}`
      );
    } else {
      lines.push(
        `Start disposition: physical ${scenario.activeStarts?.length ?? 0}, validated ${(scenario.validatedStartIndices ?? []).length}, generator-unavailable ${(scenario.blockedStartIndices ?? []).length}${scenario.startDisposition ? `; outside-pool ${scenario.startDisposition.outsidePoolIndices?.length ?? 0}, route-failed ${scenario.startDisposition.routeFailedIndices?.length ?? 0}, normal-pruned ${scenario.startDisposition.normalPrunedIndices?.length ?? 0}, competitive-sim-blocked ${scenario.startDisposition.competitiveStrategicBlockIndices?.length ?? 0}, competitive-sim-selected ${scenario.startDisposition.competitiveSelectedIndices?.length ?? 0}, price-pruned ${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices)?.length ?? 0}, selector-unavailable ${scenario.startDisposition.selectorUnavailableIndices?.length ?? 0}, other ${scenario.startDisposition.otherBlockedIndices?.length ?? 0}` : ""}`
      );
    }
  }

  if (balance?.active) {
    const pruned = balance.pressurePruned ?? [];
    const prunedText = pruned.length
      ? pruned.map((item) => {
        const diagnostics = item.diagnostics ?? {};
        const kind = diagnostics.balanceDispersionPruned ? "balance" : "outlier";
        const zBits = [];
        if (Number.isFinite(diagnostics.scoreZ)) zBits.push(`scoreZ ${diagnostics.scoreZ}`);
        if (Number.isFinite(diagnostics.actionZ)) zBits.push(`actionZ ${diagnostics.actionZ}`);
        return `#${item.index + 1} ${kind} p${item.pass ?? "?"}${zBits.length ? ` (${zBits.join(", ")})` : ""}`;
      }).join(", ")
      : "none";
    lines.push(
      `Normal balance: ${balance.iterative ? "iterative" : (balance.staged ? "staged" : "legacy")}, pruned ${prunedText}`,
      `Balance stddev: ${balance.balanceStdDevBefore ?? "n/a"} -> ${balance.balanceStdDevAfter ?? scenario.metrics?.fairnessStdDev ?? "n/a"} / ${balance.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, traffic recomputations ${balance.trafficRecomputations ?? 0}, fullTraffic iterations ${balance.fullTrafficIterations ?? 0}, fullTraffic pruned ${(balance.fullTrafficPruned ?? []).length}, remainingBad ${(balance.remainingBadStarts ?? []).length}, reject ${balance.reject ? "yes" : "no"}`,
      `Normal retained field: ${balance.retainedCount ?? scenario.metrics?.usableStarts?.length ?? "n/a"} start(s), balanceScore ${balance.retainedScoreMin ?? "n/a"}..${balance.retainedScoreMax ?? "n/a"} (range ${balance.retainedScoreRange ?? "n/a"}), worst remaining scoreZ ${balance.worstRemainingScoreZ ?? "n/a"}${Number.isInteger(balance.worstRemainingScoreIndex) ? ` (#${balance.worstRemainingScoreIndex + 1})` : ""}, actionZ ${balance.worstRemainingActionZ ?? "n/a"}${Number.isInteger(balance.worstRemainingActionIndex) ? ` (#${balance.worstRemainingActionIndex + 1})` : ""}; metric ${balance.fairnessMetric ?? "full-course-balanceScore"}`
    );
    const residuals = balance.startResiduals ?? null;
    if (residuals?.active) {
      const strongestResiduals = [...(residuals.entries ?? [])]
        .sort((left, right) => Math.abs(right.scoreResidual ?? 0) - Math.abs(left.scoreResidual ?? 0))
        .slice(0, 4)
        .map((entry) => `#${entry.index + 1} ${entry.scoreResidual >= 0 ? "+" : ""}${entry.scoreResidual} (${entry.scoreZ >= 0 ? "+" : ""}${entry.scoreZ}σ; actions ${entry.actionResidual >= 0 ? "+" : ""}${entry.actionResidual})`)
        .join(", ") || "none";
      const noteCandidate = residuals.courseNoteCandidate?.active
        ? `${residuals.courseNoteCandidate.severity ?? "minor"} ${residuals.courseNoteCandidate.reasonLabel ?? "overall route burden"}`
        : "none";
      lines.push(
        `Start residuals (post-balance): center ${residuals.scoreCenter}, stddev ${residuals.scoreStdDev}, notable ${residuals.notableCount ?? 0}; strongest ${strongestResiduals}; Course Notes candidate ${noteCandidate}`
      );
    }
  } else if (scenario.competitiveMode && competitive) {
    lines.push(
      `Competitive balance: sequential blocks ${competitive.blockedStartCount ?? 0}/${scenario.playerCount ?? scenario.preferences?.playerCount ?? "?"} [${(competitive.blockedIndices ?? []).map((index) => `#${index + 1}`).join(", ") || "none"}], remaining choices ${competitive.remainingStartCount ?? 0}, best-${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} selected [${(competitive.selectedIndices ?? []).map((index) => `#${index + 1}`).join(", ") || "none"}], stddev ${competitive.selectedStdDev ?? "n/a"}/${competitive.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, strategic difficulty +${competitive.strategicDifficulty ?? "n/a"} (block challenge ${competitive.strategicDifficultyEvidence?.meanBlockChallenge ?? "n/a"}, selection ambiguity ${competitive.strategicDifficultyEvidence?.selectionAmbiguity ?? "n/a"}), block traffic ${competitive.blockTrafficScope ?? "n/a"}, selectedOutliers ${competitive.selectedOutlierCount ?? competitive.remainingOutlierCount ?? "n/a"}, traffic recomputations ${competitive.trafficRecomputations ?? 0}, acceptable ${competitive.acceptable ? "yes" : "no"}, method ${competitive.method ?? "n/a"}`
    );
  } else if ((scenario.payToWin || scenario.subsidizedStarts) && payToWin?.active) {
    const subsidyMode = Boolean(scenario.subsidizedStarts);
    const pricingLabel = subsidyMode ? "Subsidized Starts" : "Pay to Win";
    const pricingShortLabel = subsidyMode ? "Subsidy" : "P2W";
    const pricingModel = payToWin.pricingModel ?? {};
    const selectorSplit = payToWin.selectorSplit ?? null;
    lines.push(
      `${pricingLabel}: model ${pricingModel.method ?? "n/a"}, economy ${payToWin.pricingEconomyMethod ?? "n/a"}, pruning ${payToWin.pruningPolicy ?? "legacy"}, baseline ${Number.isInteger(pricingModel.baselineIndex) ? `#${pricingModel.baselineIndex + 1}` : "n/a"}, startingEnergy ${payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}/${payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}, startingUpgradeCards ${payToWin.startingUpgradeCards ?? DEFAULT_STARTING_UPGRADE_CARDS} (unknown at start choice), priced ${payToWin.pricedStartCount ?? "n/a"}, pruned ${(payToWin.pruned ?? []).length}, fullyUnavailable ${payToWin.fullyUnavailableCount ?? 0}, earlyUnavailable ${payToWin.earlyUnavailableCount ?? 0}/${payToWin.maxEarlyUnavailable ?? 0}, lateUnavailable ${payToWin.lateUnavailableCount ?? 0}/${payToWin.maxLateUnavailable ?? 0}, residualStdDev ${payToWin.residualBalance?.worstStdDev ?? "n/a"}/${payToWin.residualBalance?.early?.limit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, residualOutliers ${payToWin.residualBalance?.worstOutlierCount ?? "n/a"}, balance ${payToWin.balanceValid === false ? "FAIL" : "pass"}, surplusStarts ${payToWin.surplusStarts ?? 0}, latePricing ${payToWin.latePricingActive ? "active" : "inactive"}, slashPrices ${payToWin.hasLatePriceDifference ? "yes" : "no"}`
    );
    if (payToWin.selectorPricingEvaluated && selectorSplit) {
      if (selectorSplit.selected) {
        lines.push(
          `${pricingShortLabel} selector split: after player ${selectorSplit.cutoffAfter} (early 1-${selectorSplit.cutoffAfter}, late ${selectorSplit.lateSelectorStart}-${selectorSplit.lateSelectorEnd}); one-group error ${selectorSplit.noSplitErrorR}R -> ${selectorSplit.splitErrorR}R, gain ${selectorSplit.gainR}R/${Number((selectorSplit.relativeGain * 100).toFixed(1))}%, separation ${selectorSplit.separationR}R`
        );
      } else {
        const bestCandidate = [...(selectorSplit.candidates ?? [])].sort((left, right) => (
          left.splitErrorR - right.splitErrorR ||
          right.separationR - left.separationR
        ))[0];
        lines.push(
          `${pricingShortLabel} selector split: none; one-group error ${selectorSplit.noSplitErrorR ?? "n/a"}R${bestCandidate ? `, best candidate after player ${bestCandidate.cutoffAfter} gain ${bestCandidate.gainR}R/${Number((bestCandidate.relativeGain * 100).toFixed(1))}% separation ${bestCandidate.separationR}R` : ""}`
        );
      }
    }
    if (pricingModel.paymentPenalties?.length) {
      const impactText = pricingModel.paymentPenalties.map((entry) => (
        subsidyMode
          ? `+${entry.payment}E benefit median/max ${entry.medianScore ?? "n/a"}/${entry.maxScore ?? "n/a"} score (${entry.medianRegisters ?? "n/a"}/${entry.maxRegisters ?? "n/a"}R)`
          : `${entry.payment}E median/max +${entry.medianScore ?? "n/a"}/+${entry.maxScore ?? "n/a"} score (${entry.medianRegisters ?? "n/a"}/${entry.maxRegisters ?? "n/a"}R)`
      )).join(", ");
      const denialText = subsidyMode
        ? `+${payToWin.maxSubsidy ?? pricingModel.maxSubsidy ?? 7}E max subsidy; ${pricingModel.denialCost ?? getPayToWinDenialCost({ startingEnergy: payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY, maxEnergy: payToWin.maxEnergy ?? 10, subsidizedStarts: true })}E = uncompensated/prune signal`
        : `${pricingModel.denialCost ?? getPayToWinDenialCost({ startingEnergy: payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY })}E = deny/prune`;
      lines.push(
        `${pricingShortLabel} final-field ${subsidyMode ? "subsidy benefit" : "payment impact"}: register ${pricingModel.registerScore ?? "n/a"} score, horizon ${pricingModel.horizonTurns ?? "n/a"} turns; ${impactText}; ${denialText}`
      );
    }
    if ((payToWin.pruned ?? []).length) {
      lines.push(
        `${pricingShortLabel} pruning passes: ${payToWin.pruned.map((item) => `p${item.pass} base ${Number.isInteger(item.pricingModel?.baselineIndex) ? `#${item.pricingModel.baselineIndex + 1}` : "n/a"} max ${item.pricingModel?.maxRegisterAdvantage ?? "n/a"}R -> #${item.index + 1} (${item.reason}${item.selectorAwarePreview ? `; verified offered ${item.offerableBefore}->${item.offerableAfterPreview}, early/late ${item.earlyOfferableBefore}/${item.lateOfferableBefore}->${item.earlyOfferableAfterPreview}/${item.lateOfferableAfterPreview}` : ""})`).join("; ")}; final base ${Number.isInteger(pricingModel.baselineIndex) ? `#${pricingModel.baselineIndex + 1}` : "n/a"}`
      );
    }
    if ((payToWin.pricingEntries ?? []).length) {
      const formatAdjustment = (value) => Number.isFinite(Number(value))
        ? `${subsidyMode ? "+" : ""}${Number(value)}E`
        : "—";
      lines.push(
        `${pricingShortLabel} post-adjustment starts: ${(payToWin.pricingEntries ?? []).map((entry) => {
          const early = entry.unavailable
            ? "unavailable"
            : `${formatAdjustment(entry.energyCost)} -> ${entry.postPaymentFullScore ?? "n/a"} (${entry.postAdjustmentDeltaRegisters ?? "n/a"}R vs baseline)`;
          const late = payToWin.latePricingActive
            ? `; late ${entry.lateUnavailable ? "unavailable" : `${formatAdjustment(entry.lateEnergyCost)} -> ${entry.latePostPaymentFullScore ?? "n/a"} (${entry.latePostAdjustmentDeltaRegisters ?? "n/a"}R)`}`
            : "";
          return `#${entry.index + 1} raw ${entry.fullScore ?? "n/a"}, ${early}${late}`;
        }).join(" | ")}`
      );
    }

  }

  if (courseEnergyEconomy?.active) {
    const economy = courseEnergyEconomy;
    const production = economy.productionEnergyScoring ?? null;
    // v33 copied diagnostics foreground the production economy only. The older
    // reserve/card shadow and static Battery sensitivity calculations remain in
    // code for targeted regression work, but no longer appear as if authoritative.
    lines.push(
      production?.active
        ? `Route Energy economy (flattened reserve+progress): start E${production.startingReserve ?? production.referenceReserve ?? "?"}, useful-card expectation ${production.usefulUpgradeCardRate ?? economy.config?.usefulUpgradeCardRate ?? "n/a"} applied immediately, install tranche ${production.usefulEnergyPerInstall ?? economy.config?.usefulEnergyPerInstall ?? "n/a"}E; no persistent upgrade-card shadow; post-opening reserve median E${production.selectedRouteOpeningReserveMedian ?? "?"}, selected-route reward median/max ${production.selectedRouteRewardMedian ?? 0}/${production.selectedRouteRewardMax ?? 0} score (Battery ${production.selectedRouteBatteryRewardMedian ?? 0}/${production.selectedRouteBatteryRewardMax ?? 0}, Power Up ${production.selectedRoutePowerUpRewardMedian ?? 0}/${production.selectedRoutePowerUpRewardMax ?? 0}, Chop Shop ${production.selectedRouteChopShopRewardMedian ?? 0}/${production.selectedRouteChopShopRewardMax ?? 0}), Power Up uses median/max ${production.selectedRoutePowerUpUsesMedian ?? 0}/${production.selectedRoutePowerUpUsesMax ?? 0}, end reserve median/max E${production.selectedRouteEndingReserveMedian ?? "?"}/E${production.selectedRouteEndingReserveMax ?? "?"}`
        : "Route Energy economy: inactive"
    );
  }

  lines.push(
    balance?.active
      ? `Fairness (retained full-course balance): stddev ${scenario.metrics?.fairnessStdDev ?? balance.balanceStdDevAfter ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`
      : scenario.competitiveMode
        ? `Fairness (Competitive simulated selected field): stddev ${scenario.metrics?.fairnessStdDev ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`
        : `Fairness: stddev ${scenario.metrics?.fairnessStdDev ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`,
    `Difficulty raw: ${scenario.metrics?.difficultyRaw ?? "n/a"}`,
    `Length raw: ${scenario.metrics?.lengthRaw ?? "n/a"}`,
    `Course scores: difficulty ${summary.difficultyScore ?? "n/a"}, length ${summary.lengthScore ?? "n/a"}, actions ${summary.actionScore ?? "n/a"}, overall ${summary.overallScore ?? "n/a"}`,
    `Checkpoint pacing: ${checkpointPacingSummary}`
  );

  if (contextualCache) {
    const routeStrategy = summary.fullCourseTraffic ?? null;
    const contextualProfile = summary.contextualSearchProfile ?? null;
    if (!contextualCache.estimatedPrimaryRouting) {
      lines.push(
        `Contextual cache: cappedContexts ${contextualCache.zeroRouteCapFailures ?? 0} across ${contextualCache.zeroRouteFailureStarts ?? 0} starts, survivors ${contextualCache.survivingStarts ?? summary.reachableStarts ?? "?"}/${contextualCache.requiredSurvivingStarts ?? scenario.preferences?.playerCount ?? "?"}, exactHits ${contextualCache.exactHits ?? 0}, templateHits ${contextualCache.templateHits ?? 0}, catalogue ${contextualCache.catalogueEntries ?? 0} classes/${contextualCache.catalogueSearches ?? 0} searches, finalVerifyFail ${contextualCache.finalProgrammingValidationFailures ?? 0}`
      );
    }
    if (contextualCache.estimatedPrimaryRouting) {
      const estimatedSourceStarts = contextualCache.survivorHistory?.find((entry) => entry.stage === "estimated")?.sourceStarts
        ?? contextualCache.survivorHistory?.find((entry) => entry.stage === "realized")?.sourceStarts
        ?? summary.totalStarts
        ?? "?";
      lines.push(
        `Estimate→realize: milestone-1 ${contextualCache.estimatedMilestoneRoutes ?? 0}/${estimatedSourceStarts} complete physical routes, forecast-card-intact ${contextualCache.estimatedForecastIntactRoutes ?? 0}/${contextualCache.estimatedMilestoneRoutes ?? 0}, physical failures ${contextualCache.estimatedPhysicalFailures ?? 0}; estimate cache ${contextualCache.estimatedLegCacheHits ?? 0} hits/${contextualCache.estimatedLegSearches ?? 0} searches/${contextualCache.estimatedLegWitnessesGenerated ?? 0} witnesses (${contextualCache.estimatedLegWidenedSearches ?? 0} exhaustive widenings), Energy guidance ${contextualCache.estimatedEnergyGuidance ? "on" : "off"}; exact realization direct/repaired/failed ${contextualCache.exactRealizationDirectSuccesses ?? 0}/${contextualCache.exactRealizationRepairedSuccesses ?? 0}/${contextualCache.exactRealizationFailures ?? 0} across ${contextualCache.exactRealizationAttempts ?? 0} checks; failure-point replans ${contextualCache.cardRepairReplans ?? 0}/${contextualCache.cardRepairFailurePoints ?? 0}, prefix backtracks ${contextualCache.cardRepairPrefixBacktracks ?? 0}, no-suffix ${contextualCache.cardRepairNoSuffix ?? 0}, downstream rebuild failures ${contextualCache.cardRepairDownstreamRebuildFailures ?? 0}, repeated candidates ${contextualCache.cardRepairRepeatedCandidates ?? 0}`
      );
      if ((contextualProfile?.trafficFeedbackLoopEnabled || contextualCache.trafficEpochsExecuted > 0) && routeStrategy) {
        lines.push(
          `Traffic feedback v35: epochs ${contextualCache.trafficEpochsExecuted ?? 0}/${contextualProfile?.trafficEpochs ?? 0}, demand ${contextualCache.trafficAlternateDemandStarts ?? 0} start-visits/${contextualCache.trafficAlternateDemandLegs ?? 0} legs (${contextualCache.trafficAlternateEffectiveDemandLegs ?? 0} effective/${contextualCache.trafficAlternateExploratoryDemandLegs ?? 0} exploratory), cached divergence checks ${contextualCache.trafficAlternateCachedWitnessChecks ?? 0}, probe-stops ${contextualCache.trafficAlternateCachedProbeStops ?? 0}, escalations ${contextualCache.trafficAlternateEscalations ?? 0}, new bounded searches ${contextualCache.trafficAlternateNewSearches ?? 0} (${contextualCache.trafficAlternateSearchNoRoutes ?? 0} no-route), exact alt checks/rejects ${contextualCache.trafficAlternateExactChecks ?? 0}/${contextualCache.trafficAlternateExactRejects ?? 0} [card ${contextualCache.trafficAlternateCardRejects ?? 0}, validation ${contextualCache.trafficAlternateValidationRejects ?? 0}], duplicates ${contextualCache.trafficAlternateDuplicateRejects ?? 0}, low-gain ${contextualCache.trafficAlternateLowGainRejects ?? 0}, downstream-miss ${contextualCache.trafficAlternateDownstreamRebuildFailures ?? 0}, candidates added ${contextualCache.trafficAlternateCandidatesAdded ?? 0}, best combined gain ${contextualCache.trafficAlternateBestGain ?? 0}; exploration gap ${(contextualCache.trafficExplorationUncertaintyShare ?? 0) * 100}% above conf ${contextualCache.trafficExplorationConfidenceFloor ?? 1}; traffic raw/effective avg ${routeStrategy.averageRawPenalty ?? 0}/${routeStrategy.averagePenalty ?? 0}, forecast confidence mean/min ${routeStrategy.averageForecastConfidence ?? 1}/${routeStrategy.minimumForecastConfidence ?? 1}`
        );
        const trafficHorizonText = (routeStrategy.averageTrafficByLeg ?? [])
          .map((entry) => {
            const label = entry.leg === 1 ? "S→F1" : `F${entry.leg - 1}→F${entry.leg}`;
            return `${label} raw ${entry.raw ?? 0} / effective ${entry.effective ?? 0} / conf ${entry.confidence ?? 1}`;
          })
          .join("; ");
        if (trafficHorizonText) {
          lines.push(`Traffic horizon by leg: ${trafficHorizonText}`);
          lines.push(scenario.virtualBots
            ? "Virtual Bots traffic confidence v38: full strategic traffic from R1; elapsed-time and traffic-interaction uncertainty are held through R5, then use the normal confidence curve from R6 onward; hazard uncertainty still applies immediately"
            : "Forecast time-only anchors v35: R5 0.990, R10 0.928, R15 0.827, R20 0.660, R25 0.472; hazards/interactions can move the horizon earlier");
        }
        const demandByLeg = new Map(
          (contextualCache.trafficAlternateDemandByLeg ?? [])
            .map((entry) => [entry.leg, entry.count ?? 0])
        );
        const candidatesByLeg = new Map(
          (contextualCache.trafficAlternateCandidatesByLeg ?? [])
            .map((entry) => [entry.leg, entry.count ?? 0])
        );
        const trafficAlternateLegText = [...new Set([
          ...demandByLeg.keys(),
          ...candidatesByLeg.keys()
        ])]
          .sort((left, right) => left - right)
          .map((leg) => {
            const label = leg === 1 ? "S→F1" : `F${leg - 1}→F${leg}`;
            return `${label} ${demandByLeg.get(leg) ?? 0}d/${candidatesByLeg.get(leg) ?? 0}c`;
          })
          .join("; ");
        if (trafficAlternateLegText) {
          lines.push(`Traffic alternate demand by leg: ${trafficAlternateLegText}`);
        }
      }
    }
    const arrivalClassText = (contextualCache.arrivalClassesByLeg ?? [])
      .filter((entry) => entry.leg > 1 && (entry.lineages > 0 || entry.classes > 0))
      .map((entry) => `F${entry.leg - 1}→F${entry.leg} ${entry.lineages}L/${entry.classes}C`)
      .join("; ");
    const witnessRankText = (contextualCache.catalogueWitnessRankSuccesses ?? [])
      .map((entry) => `#${entry.witness}:${entry.successes}`)
      .join("/");
    if (arrivalClassText || witnessRankText) {
      lines.push(
        contextualCache.estimatedPrimaryRouting
          ? `Milestone-1 arrival classes: ${arrivalClassText || "no later-leg classes"}`
          : `Arrival-class routing: ${arrivalClassText || "no later-leg classes"}; internal witnesses ${contextualCache.catalogueWitnessesGenerated ?? 0} generated, ${contextualCache.catalogueWitnessResolvedLineages ?? 0} lineages resolved directly, success by witness ${witnessRankText || "none"}`
      );
    }
    if (summary.contextualSearchMode || routeStrategy) {
      lines.push(
        contextualProfile?.estimatedPrimaryRouting
          ? `Contextual strategy: ${summary.contextualSearchMode ?? "standard"}, estimate-first cards soft rolling+frontier-guided + Energy-guided, realization exact rolling-count/economy replay, hotKeys numeric, traffic ${contextualProfile?.trafficEnabled ? "on" : "off"}${contextualProfile?.trafficFeedbackLoopEnabled ? ` (${contextualProfile.trafficEpochs ?? 0} exploration epoch max, ${contextualProfile?.trafficAlternatesEnabled ? `bounded alts @${contextualProfile?.trafficAlternateExpansions ?? "?"}exp/${contextualProfile?.trafficAlternateMaxActions ?? "?"}a, explore-gap ${Math.round((contextualProfile?.trafficExplorationUncertaintyShare ?? 0) * 100)}% above conf ${contextualProfile?.trafficExplorationConfidenceFloor ?? 1}` : "scoring-only"})` : ""}, shared judgement demand≥${contextualProfile?.trafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD}/gain≥${contextualProfile?.trafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN}, primary estimate ${contextualProfile?.physicalTemplateExpansions ?? "?"}exp/${contextualProfile?.physicalTemplateMaxActions ?? "?"}a then exhaustive-on-miss, exact failure repair by physical suffix, arrival classes ${contextualProfile?.arrivalClassRouting ? "yes" : "no"}, ${scenario.competitiveMode ? `Competitive all-start floor ${contextualCache.requiredSurvivingStarts ?? scenario.activeStarts?.length ?? "?"} physical (minimum ${Math.max(1, (scenario.playerCount ?? scenario.preferences?.playerCount ?? 1) * 2)})` : `acceptance floor ${contextualCache.requiredSurvivingStarts ?? scenario.preferences?.playerCount ?? "?"}`}, mode ${contextualProfile?.generationModeLabel ?? "?"}`
          : scenario.competitiveMode
            ? `Contextual strategy: regular route foundation with Competitive sequential one-at-a-time strategic blocking; final fairness is evaluated on the best ${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} remaining starts`
            : (scenario.payToWin || scenario.subsidizedStarts)
              ? `Contextual strategy: all-start shared route foundation; priced-start semantics run afterward with card-aware Energy repricing and selector-position occupancy`
              : `Contextual strategy: regular contextual route analysis`
      );
    }
    if (summary.programmingScarcity) {
      const scarcity = summary.programmingScarcity;
      lines.push(
        `Programming supply: selected ${scarcity.selectedRoutes ?? 0} routes, Again used on ${scarcity.routesUsingAgain ?? 0} route(s)/${scarcity.totalAgainTurns ?? 0} turn(s), consecutive required-Again turns ${scarcity.consecutiveTurnAgainReuse ?? 0}, literal program violations ${scarcity.literalProgramViolations ?? 0}, rolling two-turn violations ${scarcity.rollingWindowViolations ?? 0}; combination pressure routes ${scarcity.routesWithCombinationPressure ?? 0}, mean/max ${scarcity.meanProgramPlausibilityPenalty ?? 0}/${scarcity.maxProgramPlausibilityPenalty ?? 0}; scarcity/card copies 4+=0, 3=${scarcity.scarcityCostByCopies?.[3] ?? "?"}, 2=${scarcity.scarcityCostByCopies?.[2] ?? "?"}, 1=${scarcity.scarcityCostByCopies?.[1] ?? "?"}, Again repeat factor ${scarcity.againRepeatScarcityFactor ?? "?"}`
      );
    }
    if (routeStrategy) {
      const candidateDiagnostics = (routeStrategy.candidateDiagnostics ?? [])
        .filter((entry) => Number.isInteger(entry?.startIndex));
      const candidateCounts = candidateDiagnostics
        .map((entry) => Number(entry.candidateCount))
        .filter(Number.isFinite);
      const wholeSimilarities = candidateDiagnostics
        .map((entry) => entry.wholeMostDifferentSimilarity)
        .filter((value) => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      const laterSimilarities = candidateDiagnostics
        .map((entry) => entry.laterMostDifferentSimilarity)
        .filter((value) => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      const finalAltCount = candidateDiagnostics.filter((entry) => entry.trafficSwitched).length;
      const switchedDiagnostics = candidateDiagnostics.filter((entry) => (
        entry.trafficSwitched &&
        Number.isFinite(Number(entry.intrinsicCostSelectedVsBest)) &&
        Number.isFinite(Number(entry.trafficAdvantageSelectedVsBest)) &&
        Number.isFinite(Number(entry.strategicGainSelectedVsBest))
      ));
      const switchedIntrinsicCosts = switchedDiagnostics.map((entry) => Number(entry.intrinsicCostSelectedVsBest));
      const switchedTrafficAdvantages = switchedDiagnostics.map((entry) => Number(entry.trafficAdvantageSelectedVsBest));
      const switchedStrategicGains = switchedDiagnostics.map((entry) => Number(entry.strategicGainSelectedVsBest));
      const candidateMedian = candidateCounts.length
        ? Number(medianValue(candidateCounts).toFixed(2))
        : 0;
      const candidateRange = candidateCounts.length
        ? `${Math.min(...candidateCounts)}-${Math.max(...candidateCounts)}`
        : "0-0";
      const wholeMedian = wholeSimilarities.length
        ? Number(medianValue(wholeSimilarities).toFixed(3))
        : null;
      const laterMedian = laterSimilarities.length
        ? Number(medianValue(laterSimilarities).toFixed(3))
        : null;
      const selectedTrafficPenalties = candidateDiagnostics
        .map((entry) => Number(entry.selectedTrafficPenalty))
        .filter(Number.isFinite);
      const selectedTrafficAverage = selectedTrafficPenalties.length
        ? Number((selectedTrafficPenalties.reduce((sum, value) => sum + value, 0) / selectedTrafficPenalties.length).toFixed(2))
        : (routeStrategy.averagePenalty ?? 0);
      const selectedTrafficMax = selectedTrafficPenalties.length
        ? Number(Math.max(...selectedTrafficPenalties).toFixed(2))
        : (routeStrategy.maxPenalty ?? 0);
      lines.push(
        `Traffic candidates: ${candidateDiagnostics.length} starts, candidates median/range ${candidateMedian}/${candidateRange}, final alternate selections ${finalAltCount}, pass route-switches ${routeStrategy.routeSwitches ?? 0}, effective penalty avg/max ${selectedTrafficAverage}/${selectedTrafficMax}, raw avg ${routeStrategy.averageRawPenalty ?? selectedTrafficAverage}, confidence mean/min ${routeStrategy.averageForecastConfidence ?? 1}/${routeStrategy.minimumForecastConfidence ?? 1}, opening/later effective avg ${routeStrategy.averageOpeningPenalty ?? 0}/${routeStrategy.averageLaterPenalty ?? 0}; most-different similarity median whole/later ${wholeMedian ?? "n/a"}/${laterMedian ?? "n/a"} (0=different, 1=same)`
      );
      if (switchedDiagnostics.length) {
        const medianOrZero = (values) => values.length
          ? Number(medianValue(values).toFixed(2))
          : 0;
        const maxOrZero = (values) => values.length
          ? Number(Math.max(...values).toFixed(2))
          : 0;
        lines.push(
          `Traffic choice deltas: ${switchedDiagnostics.length} switched start(s), intrinsic cost median/max ${medianOrZero(switchedIntrinsicCosts)}/${maxOrZero(switchedIntrinsicCosts)}, traffic advantage median/max ${medianOrZero(switchedTrafficAdvantages)}/${maxOrZero(switchedTrafficAdvantages)}, final strategic gain median/max ${medianOrZero(switchedStrategicGains)}/${maxOrZero(switchedStrategicGains)} (intrinsic + confidence-weighted traffic; must remain ≥${NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN})`
        );
      }
      if (candidateDiagnostics.length) {
        lines.push(
          `Traffic diversity by start: ${candidateDiagnostics.map((entry) => (
            `#${entry.startIndex + 1} ${entry.candidateCount ?? 0}c whole ${entry.wholeMostDifferentSimilarity ?? "n/a"} later ${entry.laterMostDifferentSimilarity ?? "n/a"} selected ${Number.isInteger(entry.selectedRouteIndex) ? entry.selectedRouteIndex + 1 : "?"}${entry.trafficSwitched ? "*" : ""} spread ${entry.scoreSpread ?? 0}${Number.isFinite(Number(entry.intrinsicCostSelectedVsBest)) && Number.isFinite(Number(entry.trafficAdvantageSelectedVsBest)) && Number.isFinite(Number(entry.strategicGainSelectedVsBest)) ? ` Δintr ${entry.intrinsicCostSelectedVsBest} Δtraffic ${entry.trafficAdvantageSelectedVsBest} gain ${entry.strategicGainSelectedVsBest}` : ""}`
          )).join(" | ")}`
        );
      }
    }
    if (summary.contextualStaging?.active) {
      const staging = summary.contextualStaging;
      const stagedSourceLabel = staging.method === "coherent-preflight-pool+target-fit-gate"
        ? "coherent"
        : staging.method === "cheap-leg-sketch+geometry-target-gate"
          ? "opening-routed"
          : "first-leg-routed";
      lines.push(
        `Start staging: ${staging.sourceStartCount ?? "?"} source -> ${staging.preliminaryRoutedCount ?? "?"} ${stagedSourceLabel} -> ${staging.selectedStartCount ?? "?"} rich, target ${staging.targetPoolSize ?? "?"}, reserve-fill ${staging.unresolvedFillCount ?? 0}, escalated ${staging.escalated ? "yes" : "no"}${staging.escalationReason ? ` (${staging.escalationReason})` : ""}`
      );
      if (staging.method === "coherent-preflight-pool+target-fit-gate") {
        lines.push(
          `Target gate: difficulty ${staging.targetGateDifficultyRaw ?? "?"}, length ${staging.targetGateLengthRaw ?? "?"}, fit-length ${staging.targetGateLengthFitRaw ?? "?"}, routes reused/no traffic`
        );
      } else if (staging.method === "cheap-leg-sketch+geometry-target-gate") {
        const lengthInterval = staging.targetGateLengthInterval ?? {};
        const difficultyInterval = staging.targetGateDifficultyInterval ?? {};
        lines.push(
          staging.targetGateMethod === "calibrated-checkpoints-known"
            ? `Target gate: calibrated checkpoints length ${staging.targetGateLengthRaw ?? "?"} [${Number.isFinite(Number(lengthInterval.low)) ? Number(Number(lengthInterval.low).toFixed(1)) : "?"}..${Number.isFinite(Number(lengthInterval.high)) ? Number(Number(lengthInterval.high).toFixed(1)) : "?"}], difficulty ${staging.targetGateDifficultyRaw ?? "?"} [${Number.isFinite(Number(difficultyInterval.low)) ? Number(Number(difficultyInterval.low).toFixed(1)) : "?"}..${Number.isFinite(Number(difficultyInterval.high)) ? Number(Number(difficultyInterval.high).toFixed(1)) : "?"}], work ~${staging.targetGatePredictedRouteExpansions ?? "?"} expansions`
            : `Target gate: calibration unavailable/ineligible, preflight difficulty ${staging.targetGateDifficultyRaw ?? "?"}, preflight length ${staging.targetGateLengthRaw ?? "?"}, coherent pool skipped`
        );
      }
      if (staging.coherentCapacityGate?.active) {
        const gate = staging.coherentCapacityGate;
        lines.push(
          `Coherent capacity gate: ${gate.survivingStarts ?? "?"}/${gate.requiredStarts ?? "?"} starts survived, cap ${gate.maxExpansions ?? "?"}/leg, ${gate.work?.searches ?? 0} searches/${gate.work?.expansions ?? 0} exp/${gate.work?.capped ?? 0} capped`
        );
      }
    }
  }


  if (scenario.metrics?.hardFailures?.length) {
    lines.push(`Hard failures: ${scenario.metrics.hardFailures.join(", ")}`);
  }

  return roundCourseEvaluationNumbers(lines.join("\n"));
}

function buildScenarioReport(scenario, selectedLegIndex) {
  const summary = scenario.sequence.firstLeg.summary;
  const checkpointPlacementAdvisory = getCheckpointPlacementAdvisory(scenario);
  const legOptions = scenario.sequence.legs.map((leg, index) => (
    index === 0 ? (scenario.virtualBots ? "Entry -> 1" : "Dock -> 1") : `${leg.from} -> ${leg.to}`
  ));
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const goal = selectedLegIndex === null
    ? playableCheckpoints.at(-1) ?? playableCheckpoints[0]
    : playableCheckpoints[selectedLegIndex] ?? playableCheckpoints[0];
  const outlierReasonByIndex = new Map((summary.outliers || []).map((item) => [item.index, item.reasons ?? null]));
  // Keep report-only route-model state local to this builder. v37 accidentally
  // referenced these names before declaring them (one was only declared inside
  // the later per-start loop), causing a runtime ReferenceError after the board
  // had already rendered and leaving the Dev Course Evaluation visibly blank.
  const contextualCache = summary.contextualLegCache ?? null;
  const currentNormalRouteModel = Boolean(
    contextualCache?.estimatedPrimaryRouting &&
    !scenario.payToWin &&
    !scenario.subsidizedStarts
  );

  function formatOutlierReasons(reasons) {
    if (!reasons) {
      return "reason unavailable";
    }

    const parts = [];
    if (reasons.payToWinPruned) {
      const threshold = reasons.costThreshold ?? 5;
      if (reasons.subsidizedStarts) {
        parts.push(`Subsidized Starts spread required pruning; ${Number.isFinite(reasons.energyCost) ? `needed +${reasons.energyCost}E` : "outside the compensable range"} (limit +${Math.max(0, threshold - 1)}E)`);
      } else if (Number.isFinite(reasons.energyCost) && reasons.energyCost >= threshold) {
        parts.push(`Pay to Win cost ${reasons.energyCost} >= ${threshold}`);
      } else {
        parts.push(
          `Pay to Win price spread required pruning; removed start priced ${Number.isFinite(reasons.energyCost) ? `${reasons.energyCost}E` : "outside the retained range"}`
        );
      }
    }
    if (reasons.payToWinUnavailable) {
      const startingEnergy = reasons.startingEnergy ?? DEFAULT_STARTING_ENERGY;
      const early = Number.isFinite(reasons.energyCost) ? `${reasons.subsidizedStarts ? "+" : ""}${reasons.energyCost}E` : "unavailable";
      const late = Number.isFinite(reasons.lateEnergyCost) ? `${reasons.subsidizedStarts ? "+" : ""}${reasons.lateEnergyCost}E` : "unavailable";
      parts.push(reasons.subsidizedStarts
        ? `Subsidized Starts unable to compensate this start for all selectors (${early}/${late}; ${startingEnergy} base energy)`
        : `Pay to Win unavailable to all selectors (${early}/${late}; ${startingEnergy} starting energy)`);
    }
    if (reasons.normalBalancePruned) {
      const zText = Number.isFinite(reasons.scoreZ)
        ? ` (score z ${Number(reasons.scoreZ).toFixed(2)})`
        : "";
      if (reasons.balanceDispersionPruned) {
        const spreadText = Number.isFinite(reasons.balanceStdDevBefore) && Number.isFinite(reasons.balanceStdDevAfter)
          ? ` (stddev ${reasons.balanceStdDevBefore} -> ${reasons.balanceStdDevAfter})`
          : "";
        parts.push(`removed to tighten normal start balance${spreadText}`);
      } else {
        parts.push(`removed traffic-aware start outlier${zText}`);
      }
    }
    if (reasons.removalReason) {
      parts.push(reasons.removalReason);
    }
    if (reasons.outlierPass) {
      parts.push(`pass ${reasons.outlierPass}`);
    }

    return parts.join("; ") || "reason unavailable";
  }

  function describeMovingTargetHit(route) {
    if (!route?.movingTarget || !route.hitTarget) {
      return null;
    }

    const flagLabel = route.movingTarget.checkpointId ?? "?";
    const spaceLabel = route.movingTarget.space ?? "?";
    return `flag ${flagLabel} space ${spaceLabel} (${route.hitTarget.x},${route.hitTarget.y}) after ${route.actions} register${route.actions === 1 ? "" : "s"}`;
  }

  function describeLegMovingTargetHits(leg) {
    if (leg.analysis.starts) {
      return leg.analysis.starts
        .map((startAnalysis) => {
          const description = describeMovingTargetHit(startAnalysis.selectedRoute);
          return description ? `start #${startAnalysis.index + 1} -> ${description}` : null;
        })
        .filter(Boolean);
    }

    return (leg.analysis.distinctRoutes || [])
      .map((route, index) => {
        const description = describeMovingTargetHit(route);
        return description ? `route ${index + 1} -> ${description}` : null;
      })
      .filter(Boolean);
  }

  const movingTargetHitLines = scenario.sequence.legs
    .flatMap((leg) => describeLegMovingTargetHits(leg).map((description) => (
      `Leg ${leg.from} -> ${leg.to}: ${description}`
    )));

  const lines = [
    `Requested: ${scenario.preferences.playerCount} players, ${formatDifficultyLabel(scenario.preferences.difficulty)} difficulty, ${formatLengthLabel(scenario.preferences.length)} length`,
    `Generation mode: ${formatGenerationModeLabel(getScenarioGenerationMode(scenario))}`,
    `Layout mode: ${scenario.preferences.alignedLayout ? "aligned" : "freeform"}`,
    `Sets: ${[...getSelectedExpansionIds(scenario.preferences)].map((id) => formatExpansionName(id)).join(", ") || "none"}`,
    `Allowed variants: ${describeAllowedVariants(scenario.preferences)}`,
    `Variant complexity: ${scenario.variantComplexityUsed ?? 0}/${scenario.variantComplexityBudget ?? 0}`,
    `Variant impact: ${getVariantImpactSummary(scenario) || "none"}`,
    `Act Fast used: ${scenario.actFast ? scenario.actFastMode ?? "yes" : "no"}`,
    `Competitive Mode used: ${scenario.competitiveMode ? "yes" : "no"}`,
    `Virtual Bots used: ${scenario.virtualBots ? "yes" : "no"}`,
    `Pay to Win used: ${scenario.payToWin ? "yes" : "no"}`,
    `Subsidized Starts used: ${scenario.subsidizedStarts ? "yes" : "no"}`,
    `Extra Docks used: ${scenario.extraDocks ? "yes" : "no"}`,
    `No Docks used: ${scenario.noDocks ? "yes" : "no"}${scenario.noDocks && (scenario.noDockEdges?.length ?? 0) ? ` (${scenario.noDockEdges.map((edge) => `${edge.pieceId} ${edge.side} full edge${edge.edgeLength ? ` ${edge.edgeLength}-wide` : ""} facing ${edge.facing}`).join("; ")})` : scenario.noDockEdge ? ` (${scenario.noDockEdge.pieceId} ${scenario.noDockEdge.side} full edge, facing ${scenario.noDockEdge.facing})` : ""}`,
    `Factory Rejects used: ${scenario.factoryRejects ? "yes" : "no"}`,
    `Recovery used: ${scenario.recoveryRule}`,
    `Energy Crisis / A Lighter Game used: ${scenario.lighterGame ? "yes" : "no"}`,
    `SPAM Filter / A Less SPAM-Y Game used: ${scenario.lessSpammyGame ? "yes" : "no"}`,
    `Walled In / A Less Deadly Game used: ${scenario.lessDeadlyGame ? "yes" : "no"}`,
    `Hard Reboot / A More Deadly Game used: ${scenario.moreDeadlyGame ? "yes" : "no"}`,
    `Flaming Oil used: ${scenario.flamingOil ? "yes" : "no"}`,
    `Shared Deck used: ${scenario.classicSharedDeck ? "yes" : "no"}`,
    `Hazardous Flags used: ${scenario.hazardousFlags ? "yes" : "no"}`,
    `Repair Stations used: ${scenario.repairStations ? "yes" : "no"}`,
    `Moving Targets used: ${scenario.movingTargets ? "yes" : "no"}`,
    `Less Foreshadowing used: ${scenario.lessForeshadowing ? "yes" : "no"}`,
    `Staggered Boards used: ${scenario.staggeredBoards ? "yes" : "no"}`,
    scenario.generationBestMatch
      ? ((scenario.metrics?.difficultyFit ?? 0) > 0 || (scenario.metrics?.lengthFit ?? 0) > 0
        ? `Closest match after ${scenario.attempts} / ${getScenarioGenerationMaxAttempts(scenario)} attempt(s)`
        : `Fallback course after ${scenario.attempts} / ${getScenarioGenerationMaxAttempts(scenario)} attempt(s)`)
      : `Accepted after ${scenario.attempts} / ${getScenarioGenerationMaxAttempts(scenario)} attempt(s)`,
    scenario.generationBestMatch
      ? `Best-match termination: ${scenario.generationTerminationReason ?? "attempt-limit"}`
      : "Best-match termination: n/a",
    scenario.generationDiagnostics
      ? `Generation timing: total ${formatGenerationDuration(scenario.generationDiagnostics.totalMs)}, routeSearch ${formatGenerationDuration(scenario.generationDiagnostics.routeSearchMs)}, searches ${scenario.generationDiagnostics.routeSearches}, expansions ${scenario.generationDiagnostics.routeExpansions}, capped ${scenario.generationDiagnostics.cappedRouteSearches}, mode ${scenario.generationDiagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}, softBudget ${scenario.generationDiagnostics.softExpansionBudget ?? getGenerationModeProfile({ generationMode: getScenarioGenerationMode(scenario) }).softExpansionBudget}`
      : "Generation timing: n/a",
    scenario.generationDiagnostics?.searchProfile
      ? `Generation search profile: attempts ${scenario.generationDiagnostics.maxAttempts ?? getScenarioGenerationMaxAttempts(scenario)}, preflight ${scenario.generationDiagnostics.searchProfile.preflightOpeningExpansions}/${scenario.generationDiagnostics.searchProfile.preflightLaterExpansions}, witnesses ${scenario.generationDiagnostics.searchProfile.primaryWitnessRoutes ?? "?"}, traffic ${scenario.generationDiagnostics.searchProfile.trafficEnabled ? `${scenario.generationDiagnostics.searchProfile.trafficEpochs ?? 0} exploration epoch(s), new-search cap ${scenario.generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesPerEpoch ?? 0}/epoch, uncertainty effort floor ${scenario.generationDiagnostics.searchProfile.trafficAlternateUncertaintyEffortFloor ?? 1}/curve ${scenario.generationDiagnostics.searchProfile.trafficAlternateUncertaintyEffortExponent ?? 1}, uncertainty exploration ${Math.round((scenario.generationDiagnostics.searchProfile.trafficExplorationUncertaintyShare ?? 0) * 100)}% above confidence ${scenario.generationDiagnostics.searchProfile.trafficExplorationConfidenceFloor ?? 1}` : "off"}`
      : "Generation search profile: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch
      ? `Slowest route search: ${scenario.generationDiagnostics.slowestRouteSearch.kind} ${formatGenerationDuration(scenario.generationDiagnostics.slowestRouteSearch.durationMs)}, expansions ${scenario.generationDiagnostics.slowestRouteSearch.expansions}/${scenario.generationDiagnostics.slowestRouteSearch.maxExpansions}, returned ${scenario.generationDiagnostics.slowestRouteSearch.returnedRoutes}`
      : "Slowest route search: n/a",
    scenario.generationDiagnostics?.routeSearchTotalsByKind?.["contextual-leg"]
      ? `Contextual profiler timing: ${formatGenerationDuration(scenario.generationDiagnostics.routeSearchTotalsByKind["contextual-leg"].durationMs)} across ${scenario.generationDiagnostics.routeSearchTotalsByKind["contextual-leg"].searches} searches/${scenario.generationDiagnostics.routeSearchTotalsByKind["contextual-leg"].expansions} expansions; ${formatContextualProfileShare(scenario.generationDiagnostics.contextualProfileTotals, scenario.generationDiagnostics.routeSearchTotalsByKind["contextual-leg"].durationMs)}`
      : "Contextual profiler timing: n/a",
    scenario.generationDiagnostics?.contextualProfileTotals
      ? `Contextual profiler totals: ${formatContextualProfile(scenario.generationDiagnostics.contextualProfileTotals)}`
      : "Contextual profiler totals: n/a",
    scenario.generationDiagnostics?.contextualProfileTotals
      ? `Contextual profiler counts: ${formatContextualCounts(scenario.generationDiagnostics.contextualProfileTotals)}`
      : "Contextual profiler counts: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch?.contextualProfile
      ? `Slowest contextual breakdown: ${formatContextualProfile(scenario.generationDiagnostics.slowestRouteSearch.contextualProfile)}`
      : "Slowest contextual breakdown: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch?.contextualProfile
      ? `Slowest contextual counts: ${formatContextualCounts(scenario.generationDiagnostics.slowestRouteSearch.contextualProfile)}`
      : "Slowest contextual counts: n/a",
    ...(scenario.generationDiagnostics?.attempts?.length
      ? [
        "Generation attempts:",
        ...scenario.generationDiagnostics.attempts.map((entry) => {
          const range = entry.startAttempt === entry.endAttempt
            ? `${entry.startAttempt}`
            : `${entry.startAttempt}-${entry.endAttempt}`;
          const slowest = entry.slowestRouteSearch
            ? `, worstSearch ${formatGenerationDuration(entry.slowestRouteSearch.durationMs)}/${entry.slowestRouteSearch.expansions}exp`
            : "";
          const topStages = [...(entry.stages || [])]
            .filter((stage) => Number.isFinite(stage.ms) && stage.ms >= 25)
            .sort((left, right) => right.ms - left.ms)
            .slice(0, 3)
            .map((stage) => `${stage.stage} ${formatGenerationDuration(stage.ms)}`)
            .join(" | ");
          return `  attempt ${range}: ${formatGenerationDuration(entry.elapsedMs)}, ${entry.outcome}, routeSearches ${entry.routeSearches}, expansions ${entry.routeExpansions}, routeSearch ${formatGenerationDuration(entry.routeSearchMs)}${slowest}${topStages ? `, topStages ${topStages}` : ""}, reason ${entry.reason}`;
        })
      ]
      : []),
    `Board count: ${scenario.boardCount}`,
    `Overlays requested: ${formatOverlayMode(scenario.preferences.overlayMode)}`,
    `Boards: ${scenario.mainBoardIds.map((pieceId, index) => `${pieceId}@${scenario.mainRotations[index]}`).join(", ")}`,
    `Flags: ${scenario.checkpoints.map((flag, index) => `${scenario.virtualBots && index === 0 ? "#0" : `#${scenario.virtualBots ? index : index + 1}`}(${flag.x},${flag.y})${scenario.virtualBots && index === 0 && flag.facing ? `/${flag.facing}` : ""}`).join(", ")}`,
    scenario.rebootTokens?.length
      ? `Reboot tokens: ${scenario.rebootTokens.map((token) => `${token.pieceId}(${token.x},${token.y},${token.dir})`).join(", ")}`
      : "Reboot tokens: none",
    scenario.dockSummaries?.length
      ? `Docks: ${scenario.dockSummaries.map((dock, index) => `${index + 1}:${dock.pieceId}:${dock.boundaryRun?.side ?? "n/a"}:${dock.flipped ? "flipped" : "normal"}`).join(", ")}`
      : "Docks: none",
    `Showing leg: ${selectedLegIndex === null ? "All legs" : legOptions[selectedLegIndex]}`,
    `Goal flag: ${selectedLegIndex === null ? "all checkpoints" : `(${goal.x}, ${goal.y})`}`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.activeStarts?.length ?? scenario.sequence.firstLeg?.summary?.contextualStaging?.sourceStartCount ?? scenario.sequence.starts.length}`,
    scenario.virtualBots
      ? "Start disposition: virtual entry"
      : contextualCache?.estimatedPrimaryRouting
        ? `Start disposition: structural ${scenario.activeStarts?.length ?? 0}, estimated ${contextualCache.estimatedMilestoneRoutes ?? 0}, realized ${contextualCache.survivingStarts ?? (scenario.validatedStartIndices ?? []).length}, physical-impossible ${contextualCache.estimatedPhysicalFailureStarts ?? 0}, routing-unresolved ${Math.max(0, (contextualCache.estimatedMilestoneRoutes ?? 0) - (contextualCache.survivingStarts ?? (scenario.validatedStartIndices ?? []).length))}${scenario.startDisposition ? `; normal-pruned [${(scenario.startDisposition.normalPrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], price-pruned [${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], selector-unavailable [${(scenario.startDisposition.selectorUnavailableIndices ?? []).map((index) => index + 1).join(", ") || "none"}], other [${(scenario.startDisposition.otherBlockedIndices ?? []).map((index) => index + 1).join(", ") || "none"}]` : ""}`
        : `Start disposition: physical ${scenario.activeStarts?.length ?? 0}, validated ${(scenario.validatedStartIndices ?? []).length}, blocked ${(scenario.blockedStartIndices ?? []).length} [${(scenario.blockedStartIndices ?? []).map((index) => index + 1).join(", ") || "none"}]${scenario.startDisposition ? `; outside-pool [${(scenario.startDisposition.outsidePoolIndices ?? []).map((index) => index + 1).join(", ") || "none"}], route-failed [${(scenario.startDisposition.routeFailedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], normal-pruned [${(scenario.startDisposition.normalPrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], price-pruned [${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], selector-unavailable [${(scenario.startDisposition.selectorUnavailableIndices ?? []).map((index) => index + 1).join(", ") || "none"}], other [${(scenario.startDisposition.otherBlockedIndices ?? []).map((index) => index + 1).join(", ") || "none"}]` : ""}`,
    `Difficulty raw: ${scenario.metrics.difficultyRaw}`,
    scenario.metrics.variantDifficultyAccounting
      ? `Variant difficulty accounting v38: route/base ${scenario.metrics.variantDifficultyAccounting.base} -> final ${scenario.metrics.variantDifficultyAccounting.final} (residual delta ${scenario.metrics.variantDifficultyAccounting.delta}); residuals ${(scenario.metrics.variantDifficultyAccounting.contributions ?? []).map((entry) => `${entry.id} ${entry.delta >= 0 ? "+" : ""}${entry.delta} [${entry.kind}]`).join(", ") || "none"}; mechanically represented ${(scenario.metrics.variantDifficultyAccounting.mechanicalRules ?? []).map((entry) => `${entry.id} (${entry.note})`).join(", ") || "none"}`
      : "Variant difficulty accounting v38: n/a",
    scenario.metrics.programmingPressure
      ? `Programming pressure v38: combined ${scenario.metrics.programmingPressure.planningPressure}, timed ${scenario.metrics.programmingPressure.timedPressure}; hazard ${scenario.metrics.programmingPressure.hazardPressure} (${scenario.metrics.programmingPressure.hazardPerRegister}/reg), traffic ${scenario.metrics.programmingPressure.trafficPressure} (${scenario.metrics.programmingPressure.trafficPerRegister}/reg), control ${scenario.metrics.programmingPressure.controlPressure} (${scenario.metrics.programmingPressure.controlPerRegister}/reg), cards ${scenario.metrics.programmingPressure.cardPressure}; avg gears ${scenario.metrics.programmingPressure.averageGearTurns ?? 0}, conveyor turns ${scenario.metrics.programmingPressure.averageConveyorTurns ?? 0}, forced spaces ${scenario.metrics.programmingPressure.averageForcedSpaces ?? 0}`
      : "Programming pressure v38: n/a",
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Length inputs: flags ${scenario.metrics.lengthMetrics.inputs.flagCount}, players ${scenario.metrics.lengthMetrics.inputs.playerCount}, actionScore ${scenario.metrics.lengthMetrics.inputs.totalActionLoad}, distanceScore ${scenario.metrics.lengthMetrics.inputs.totalRouteDistance}, congestion ${scenario.metrics.lengthMetrics.inputs.totalCongestion}, flagArea ${scenario.metrics.lengthMetrics.inputs.flagAreaScore}, totalDifficulty ${scenario.metrics.lengthMetrics.inputs.totalDifficulty}`,
    `Length contributions: flags ${scenario.metrics.lengthMetrics.contributions.checkpointLoad}, players ${scenario.metrics.lengthMetrics.contributions.playerLoad}, actions ${scenario.metrics.lengthMetrics.contributions.actionLoad}, uncertainty ${scenario.metrics.lengthMetrics.contributions.forecastUncertaintyLoad ?? 0}, distance ${scenario.metrics.lengthMetrics.contributions.distanceLoad}, congestion ${scenario.metrics.lengthMetrics.contributions.congestionLoad} (weight ${scenario.metrics.lengthMetrics.contributions.congestionWeight}; harshness ${scenario.metrics.lengthMetrics.contributions.boardHarshness}), flagArea ${scenario.metrics.lengthMetrics.contributions.flagAreaLoad}, difficulty ${scenario.metrics.lengthMetrics.contributions.difficultyLoad}, moving-target residual ${scenario.metrics.lengthMetrics.contributions.movingTargetLoad} (legacy estimate ${scenario.metrics.lengthMetrics.contributions.movingTargetLegacyEstimate ?? 0}), act-fast ${scenario.metrics.lengthMetrics.contributions.actFastLoad}, reshuffle ${scenario.metrics.lengthMetrics.contributions.lessForeshadowingLoad ?? 0}, shared-deck ${scenario.metrics.lengthMetrics.contributions.sharedDeckLoad ?? 0}`,
    `Length uncertainty: pre-adjustment ${scenario.metrics.lengthMetrics.contributions.preUncertaintyRaw ?? scenario.metrics.lengthRaw}, forecast confidence mean/min/end ${scenario.metrics.lengthMetrics.inputs.forecastConfidenceMean ?? 1}/${scenario.metrics.lengthMetrics.inputs.forecastConfidenceMin ?? 1}/${scenario.metrics.lengthMetrics.inputs.forecastConfidenceEnd ?? 1}, speculative registers ${scenario.metrics.lengthMetrics.inputs.forecastUncertainRegisters ?? 0}/${scenario.metrics.lengthMetrics.inputs.forecastTotalRegisters ?? 0} avg, equivalent extra actions ${scenario.metrics.lengthMetrics.contributions.forecastEquivalentActions ?? 0}, threshold ${scenario.metrics.lengthMetrics.contributions.forecastSpeculativeThreshold ?? LENGTH_FORECAST_SPECULATIVE_CONFIDENCE}, max per-register action uplift ${Math.round((scenario.metrics.lengthMetrics.contributions.forecastMaxActionUplift ?? LENGTH_FORECAST_MAX_ACTION_UPLIFT) * 100)}%`,
    `Variant length accounting v38: ${(scenario.metrics.lengthMetrics.variantLengthContributions ?? []).map((entry) => `${entry.id} ${entry.delta >= 0 ? "+" : ""}${entry.delta} [${entry.kind}]`).join(", ") || "none"}; method ${scenario.metrics.lengthMetrics.method ?? "n/a"}`,
    `Moving target profile: active ${scenario.movingTargetStats?.activeCount ?? 0}, pathTiles ${scenario.movingTargetStats?.totalPathLength ?? 0}, uniqueCoverage ${scenario.movingTargetStats?.coverageTiles ?? 0}, turns ${scenario.movingTargetStats?.totalTurns ?? 0}, fastSegments ${scenario.movingTargetStats?.fastSegments ?? 0}, difficultyBonus ${scenario.movingTargetStats?.difficultyBonus ?? 0}, lengthBonus ${scenario.movingTargetStats?.lengthBonus ?? 0}`,
    `Moving target volatility penalty: ${scenario.metrics.movingTargetVolatilityPenalty ?? 0}`,
    Number.isFinite(scenario.metrics.openingLegAnticlimax?.fastestActions)
      ? `Opening checkpoint pacing: fastest/average ${scenario.metrics.openingLegAnticlimax.fastestActions}/${scenario.metrics.openingLegAnticlimax.averageActions ?? "n/a"} vs 4/6 registers; penalty ${scenario.metrics.openingLegAnticlimax.penalty ?? 0}`
      : "Opening checkpoint pacing: n/a",
    Number.isFinite(scenario.metrics.intermediateCheckpointPacing?.shortestAverageActions)
      ? `Middle checkpoint pacing: shortest/average leg ${scenario.metrics.intermediateCheckpointPacing.shortestAverageActions}/${scenario.metrics.intermediateCheckpointPacing.averageActions ?? "n/a"} vs 4/6 registers; penalty ${scenario.metrics.intermediateCheckpointPacing.penalty ?? 0}`
      : "Middle checkpoint pacing: n/a",
    Number.isFinite(scenario.metrics.finalLegAnticlimax?.fastestActions)
      ? `Final checkpoint pacing: fastest route ${scenario.metrics.finalLegAnticlimax.fastestActions}/6 registers; penalty ${scenario.metrics.finalLegAnticlimax.penalty ?? 0}`
      : "Final checkpoint pacing: n/a",
    (() => {
      const spacing = scenario.metrics.checkpointSpacingExpectation ?? null;
      const opening = spacing?.opening ?? null;
      const finalLeg = (spacing?.legs ?? []).find((entry) => entry.finalLeg) ?? null;
      const geometry = [
        opening ? `opening nearest/avg ${opening.nearest}/${opening.average} vs ${opening.expectedNearest}/${opening.expectedAverage}` : null,
        finalLeg ? `final ${finalLeg.distance}/${finalLeg.expectedMinimum}` : null
      ].filter(Boolean).join("; ") || "n/a";
      return `Checkpoint construction geometry (diagnostic only): ${geometry}`;
    })(),
    scenario.metrics.routedCheckpointPacingExpectation?.acceptable === false
      ? `Routed checkpoint pacing: deviations ${scenario.metrics.routedCheckpointPacingExpectation.deviations.map((entry) => `${entry.type} ${entry.actual}/${entry.expectedMinimum} registers`).join(", ")}; player advisory severity ${checkpointPlacementAdvisory?.severity ?? 0}/${checkpointPlacementAdvisory?.threshold ?? 6} (${checkpointPlacementAdvisory?.active ? "shown" : "suppressed"})`
      : "Routed checkpoint pacing: ordinary; player advisory not needed",
    scenario.metrics.meaningfulBoardUse
      ? `Meaningful board use penalty: ${scenario.metrics.meaningfulBoardUse.penalty}; route tiles by board ${scenario.metrics.meaningfulBoardUse.boards.map((board) => `#${board.boardIndex + 1}:${board.uniqueRouteTiles}`).join(", ")}`
      : "Meaningful board use penalty: n/a",
    scenario.metrics.routeDrama
      ? `Route drama: ${scenario.metrics.routeDrama.level}, score ${scenario.metrics.routeDrama.score}, penalty ${scenario.metrics.routeDrama.penalty}, sharedTiles ${scenario.metrics.routeDrama.sharedTiles}, crossings ${scenario.metrics.routeDrama.crossings}, reverseEdges ${scenario.metrics.routeDrama.reverseEdges}`
      : "Route drama: n/a",    scenario.metrics.competitiveBlockImpact
      ? `Competitive balance simulation: sequential optimal blocks ${(scenario.metrics.competitiveBlockImpact.blockSequence ?? []).map((entry) => `p${entry.order}:#${entry.index + 1}@${entry.score}${Number.isFinite(entry.advantageVsMedian) ? ` (adv ${entry.advantageVsMedian}` : ""}${Number.isFinite(entry.decisionMargin) ? `, gap ${entry.decisionMargin}` : ""}${Number.isFinite(entry.strategicChallenge) ? `, challenge ${entry.strategicChallenge}` : ""}${Number.isFinite(entry.advantageVsMedian) ? ")" : ""}`).join(" -> ") || "none"}; remaining ${scenario.metrics.competitiveBlockImpact.remainingStartCount}, best-${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} selected ${scenario.metrics.competitiveBlockImpact.selectedStartCount ?? "n/a"} [${(scenario.metrics.competitiveBlockImpact.selectedIndices ?? []).map((index) => index + 1).join(", ")}], stddev ${scenario.metrics.competitiveBlockImpact.selectedStdDev ?? "n/a"}/${scenario.metrics.competitiveBlockImpact.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, strategicDifficulty +${scenario.metrics.competitiveBlockImpact.strategicDifficulty ?? "n/a"} (center ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.calibrationCenter ?? 1.8}, blockChallenge ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.meanBlockChallenge ?? "n/a"}, selectionAmbiguity ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.selectionAmbiguity ?? "n/a"}, provisional ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.provisional ? "yes" : "no"}), outliers ${scenario.metrics.competitiveBlockImpact.selectedOutlierCount ?? scenario.metrics.competitiveBlockImpact.remainingOutlierCount}, scoreRange ${scenario.metrics.competitiveBlockImpact.scoreRange}, worstZ ${scenario.metrics.competitiveBlockImpact.worstScoreZ}/${scenario.metrics.competitiveBlockImpact.worstActionZ}, blockTraffic ${scenario.metrics.competitiveBlockImpact.blockTrafficScope ?? "n/a"}, trafficRecomputations ${scenario.metrics.competitiveBlockImpact.trafficRecomputations ?? 0}, acceptable ${scenario.metrics.competitiveBlockImpact.acceptable ? "yes" : "no"}, method ${scenario.metrics.competitiveBlockImpact.method}`
      : "Competitive balance simulation: n/a",
    summary.payToWin?.active
      ? `${summary.payToWin.subsidizedStarts ? "Subsidized Starts" : "Pay to Win"}: model ${summary.payToWin.pricingModel?.method ?? "n/a"}, economy ${summary.payToWin.pricingEconomyMethod ?? "n/a"}, baseline ${Number.isInteger(summary.payToWin.pricingModel?.baselineIndex) ? `#${summary.payToWin.pricingModel.baselineIndex + 1}` : "n/a"}, start ${summary.payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}E/max ${summary.payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}E, startingCards ${summary.payToWin.startingUpgradeCards ?? DEFAULT_STARTING_UPGRADE_CARDS}, priced ${summary.payToWin.pricedStartCount ?? "n/a"}, pruned ${(summary.payToWin.pruned ?? []).length}, residualStdDev ${summary.payToWin.residualBalance?.worstStdDev ?? "n/a"}/${summary.payToWin.residualBalance?.early?.limit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, residualOutliers ${summary.payToWin.residualBalance?.worstOutlierCount ?? "n/a"}, availability ${summary.payToWin.availabilityValid === false ? "FAIL" : "pass"}, balance ${summary.payToWin.balanceValid === false ? "FAIL" : "pass"}, latePricing ${summary.payToWin.latePricingActive ? "active" : "inactive"}, selectorSplit ${summary.payToWin.selectorSplit?.selected ? `after-p${summary.payToWin.selectorSplit.cutoffAfter}` : "none"}`
      : "Priced starts: n/a",
    summary.payToWin?.pricingEntries?.length
      ? `Priced start residuals: ${summary.payToWin.pricingEntries.map((entry) => {
        const prefix = summary.payToWin.subsidizedStarts ? "+" : "";
        const early = entry.unavailable
          ? "unavailable"
          : `${prefix}${entry.energyCost}E -> ${entry.postPaymentFullScore ?? "n/a"} (${entry.postAdjustmentDeltaRegisters ?? "n/a"}R)`;
        const late = summary.payToWin.latePricingActive
          ? ` / late ${entry.lateUnavailable ? "unavailable" : `${prefix}${entry.lateEnergyCost}E -> ${entry.latePostPaymentFullScore ?? "n/a"} (${entry.latePostAdjustmentDeltaRegisters ?? "n/a"}R)`}`
          : "";
        return `#${entry.index + 1} raw ${entry.fullScore ?? "n/a"}: ${early}${late}`;
      }).join(" | ")}`
      : "Priced start residuals: n/a",
    summary.normalStartBalance?.active
      ? `Normal start balance: iterative, pruned ${(summary.normalStartBalance.pressurePruned ?? []).length ? (summary.normalStartBalance.pressurePruned ?? []).map((item) => `#${item.index + 1}(${item.diagnostics?.balanceDispersionPruned ? "dispersion; " : "outlier; "}scoreZ ${item.diagnostics?.scoreZ ?? "n/a"}; actionZ ${item.diagnostics?.actionZ ?? "n/a"}; pass ${item.pass ?? "n/a"})`).join(", ") : "none"}, retained ${summary.normalStartBalance.retainedCount ?? scenario.metrics?.usableStarts?.length ?? "n/a"}, balanceScore ${summary.normalStartBalance.retainedScoreMin ?? "n/a"}..${summary.normalStartBalance.retainedScoreMax ?? "n/a"}, stddev ${summary.normalStartBalance.balanceStdDevBefore ?? "n/a"}->${summary.normalStartBalance.balanceStdDevAfter ?? "n/a"}/${summary.normalStartBalance.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, worst remaining z ${summary.normalStartBalance.worstRemainingScoreZ ?? "n/a"}/${summary.normalStartBalance.worstRemainingActionZ ?? "n/a"}, traffic recomputations ${summary.normalStartBalance.trafficRecomputations ?? 0}, remainingBad ${(summary.normalStartBalance.remainingBadStarts ?? []).length}, reject ${summary.normalStartBalance.reject ? "yes" : "no"}`
      : "Normal start balance: n/a",
    scenario.movingTargetReentryMarkers?.length
      ? `Moving target re-entry: ${scenario.movingTargetReentryMarkers.map((marker) => `${marker.label}(${marker.x},${marker.y})`).join(", ")}`
      : "Moving target re-entry: none",
    movingTargetHitLines.length
      ? `Moving target hits: ${movingTargetHitLines.join("; ")}`
      : "Moving target hits: none",
    `Fairness stddev (retained full-course balance when Normal): ${scenario.metrics.fairnessStdDev}`,
    `Course difficulty score: ${summary.difficultyScore}`,
    `Course length score: ${summary.lengthScore}`,
    `Course action score: ${summary.actionScore}`,
    `Flag area score: ${summary.flagAreaScore}`,
    currentNormalRouteModel
      ? "Traffic scoring: confidence-weighted full-course occupancy/laser/proximity model"
      : `Average traffic penalty: ${summary.averageTrafficPenalty}`,
    currentNormalRouteModel
      ? ""
      : (summary.courseContinuationWeighted
        ? `Start full-course continuation: mean ${summary.courseContinuationMean}, weighted into start scores`
        : "Start full-course continuation: n/a"),
    currentNormalRouteModel
      ? `Traffic feedback: epochs ${contextualCache?.trafficEpochsExecuted ?? 0}, demand ${contextualCache?.trafficAlternateDemandStarts ?? 0} starts/${contextualCache?.trafficAlternateDemandLegs ?? 0} legs (${contextualCache?.trafficAlternateEffectiveDemandLegs ?? 0} effective/${contextualCache?.trafficAlternateExploratoryDemandLegs ?? 0} exploratory), probe-stops ${contextualCache?.trafficAlternateCachedProbeStops ?? 0}, escalations ${contextualCache?.trafficAlternateEscalations ?? 0}, bounded searches ${contextualCache?.trafficAlternateNewSearches ?? 0}, alternate effort mean/min ${contextualCache?.trafficAlternateAverageEffortScale ?? 1}/${contextualCache?.trafficAlternateMinimumEffortScale ?? 1}, candidates ${contextualCache?.trafficAlternateCandidatesAdded ?? 0}, route switches ${summary.fullCourseTraffic?.routeSwitches ?? 0}, effective/raw avg ${summary.fullCourseTraffic?.averagePenalty ?? 0}/${summary.fullCourseTraffic?.averageRawPenalty ?? 0}, confidence mean/min ${summary.fullCourseTraffic?.averageForecastConfidence ?? 1}/${summary.fullCourseTraffic?.minimumForecastConfidence ?? 1}`
      : (summary.fullCourseTraffic
        ? `Full-course route pressure: passes ${summary.fullCourseTraffic.passes}, switches ${summary.fullCourseTraffic.routeSwitches}, avgPenalty ${summary.fullCourseTraffic.averagePenalty}`
        : "Full-course route pressure: n/a"),
    currentNormalRouteModel
      ? `Estimate route cache: ${contextualCache?.estimatedLegCacheHits ?? 0} hits/${contextualCache?.estimatedLegSearches ?? 0} searches/${contextualCache?.estimatedLegWitnessesGenerated ?? 0} witnesses, exhaustive primary widenings ${contextualCache?.estimatedLegWidenedSearches ?? 0}, exact realization direct/repaired/failed ${contextualCache?.exactRealizationDirectSuccesses ?? 0}/${contextualCache?.exactRealizationRepairedSuccesses ?? 0}/${contextualCache?.exactRealizationFailures ?? 0}`
      : (summary.contextualLegCache
        ? `Contextual leg cache: exactEntries ${summary.contextualLegCache.entries ?? 0}, templateEntries ${summary.contextualLegCache.templateEntries ?? 0}, exactHits ${summary.contextualLegCache.exactHits ?? 0}, templateHits ${summary.contextualLegCache.templateHits ?? 0}, misses ${summary.contextualLegCache.misses ?? 0}, templateFallbacks ${summary.contextualLegCache.templateFallbacks ?? 0}, cappedContexts ${summary.contextualLegCache.zeroRouteCapFailures ?? 0} across ${summary.contextualLegCache.zeroRouteFailureStarts ?? 0} starts, survivors ${summary.contextualLegCache.survivingStarts ?? "n/a"}/${summary.contextualLegCache.requiredSurvivingStarts ?? "n/a"}`
        : "Contextual leg cache: n/a"),
    summary.programmingScarcity
      ? `Programming supply: selected ${summary.programmingScarcity.selectedRoutes ?? 0} routes, Again used on ${summary.programmingScarcity.routesUsingAgain ?? 0} route(s)/${summary.programmingScarcity.totalAgainTurns ?? 0} turn(s), consecutive required-Again turns ${summary.programmingScarcity.consecutiveTurnAgainReuse ?? 0}, literal program violations ${summary.programmingScarcity.literalProgramViolations ?? 0}, rolling two-turn violations ${summary.programmingScarcity.rollingWindowViolations ?? 0}; combination pressure routes ${summary.programmingScarcity.routesWithCombinationPressure ?? 0}, mean/max ${summary.programmingScarcity.meanProgramPlausibilityPenalty ?? 0}/${summary.programmingScarcity.maxProgramPlausibilityPenalty ?? 0}; scarcity/card copies 4+=0, 3=${summary.programmingScarcity.scarcityCostByCopies?.[3] ?? "?"}, 2=${summary.programmingScarcity.scarcityCostByCopies?.[2] ?? "?"}, 1=${summary.programmingScarcity.scarcityCostByCopies?.[1] ?? "?"}, Again repeat factor ${summary.programmingScarcity.againRepeatScarcityFactor ?? "?"}`
      : "Programming supply: n/a",
    `Fairness score: ${summary.fairnessScore}`,
    `Overall course score: ${summary.overallScore}`,
    `Sequence total difficulty: ${scenario.sequence.summary.totalDifficulty}`,
    `Sequence total length: ${scenario.sequence.summary.totalLength}`,
    summary.outliers.length
      ? `Pruned starts: ${summary.outliers.map((item) => `#${item.index + 1} (${item.delta > 0 ? "+" : ""}${item.delta}; ${formatOutlierReasons(item.reasons)})`).join(", ")}`
      : "Pruned starts: none",
    "",
    "Leg summaries:",
    ...scenario.sequence.legs.map((leg) => {
      if (leg.analysis.summary.difficultyScore !== undefined) {
        return `Leg ${leg.from} -> ${leg.to}: difficulty ${leg.analysis.summary.difficultyScore}, length ${leg.analysis.summary.lengthScore}`;
      }

      return leg.analysis.summary.expectedRobotPaths
        ? `Leg ${leg.from} -> ${leg.to}: expectedPaths ${leg.analysis.summary.expectedRouteCount}, avgScore ${leg.analysis.summary.averageRouteScore}, avgLength ${leg.analysis.summary.averageRouteDistance}, congestion ${leg.analysis.summary.congestionScore}, backtrack ${leg.analysis.summary.crossLegOverlap}`
        : `Leg ${leg.from} -> ${leg.to}: routes ${leg.analysis.summary.routeCount}, distinct ${leg.analysis.summary.distinctRouteCount}, avgScore ${leg.analysis.summary.averageRouteScore}, avgLength ${leg.analysis.summary.averageRouteDistance}, diversity ${leg.analysis.summary.diversityScore}, congestion ${leg.analysis.summary.congestionScore}, backtrack ${leg.analysis.summary.crossLegOverlap}`;
    }),
    "",
    "Per-start best routes:"
  ];

  for (const startAnalysis of scenario.sequence.firstLeg.starts) {
    if (!startAnalysis.reachable) {
      lines.push(
        `Start #${startAnalysis.index + 1} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) unreachable`
      );
      continue;
    }

    const selected = startAnalysis.selectedRoute;
    const competitiveBalance = scenario.metrics?.competitiveBlockImpact ?? null;
    const simulatedBlock = (competitiveBalance?.blockSequence ?? []).find((entry) => entry.index === startAnalysis.index) ?? null;
    const simulatedSelected = (competitiveBalance?.selectedIndices ?? []).includes(startAnalysis.index);
    const usable = scenario.competitiveMode
      ? simulatedBlock
        ? `sim-block-p${simulatedBlock.order}`
        : simulatedSelected
          ? "sim-selected"
          : "available-unselected"
      : scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index) ? "usable" : "outlier";
    const outlierReason = !scenario.competitiveMode && usable === "outlier"
      ? ` reason ${formatOutlierReasons(outlierReasonByIndex.get(startAnalysis.index))}`
      : "";
    const adjustedLabel = usable === "outlier" ? "outlierEstimate" : "finalAdjusted";
    const formattedEnergyCost = (scenario.payToWin || scenario.subsidizedStarts)
      ? formatPayToWinEnergyCost(startAnalysis, { subsidizedStarts: scenario.subsidizedStarts })
      : null;
    const energyCost = formattedEnergyCost !== null
      ? ` energy ${formattedEnergyCost}${Number.isFinite(startAnalysis.lateAdjustedScore) ? ` lateAdjusted ${startAnalysis.lateAdjustedScore}` : ""}`
      : "";
    const courseEstimate = startAnalysis.courseEstimate
      ? ` courseAdj ${startAnalysis.courseScoreAdjustment ?? 0} courseScore ${startAnalysis.courseEstimate.totalScore} courseActions ${startAnalysis.courseEstimate.totalActions} courseTraffic ${startAnalysis.courseEstimate.fullCourseTrafficPenalty ?? 0} courseRoute ${(startAnalysis.courseEstimate.selectedRouteIndex ?? 0) + 1}/${startAnalysis.courseEstimate.candidateCount ?? 1}`
      : "";
    lines.push(
      currentNormalRouteModel
        ? `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) fullCourse intrinsic ${startAnalysis.fullCourseRoute?.score ?? selected.score}, traffic ${startAnalysis.fullCourseTrafficPenalty ?? 0}, balance ${startAnalysis.balanceScore ?? "n/a"}${energyCost}${courseEstimate}, distance ${startAnalysis.fullCourseRoute?.distance ?? selected.distance}, actions ${startAnalysis.fullCourseRoute?.actions ?? selected.actions}, hazard ${startAnalysis.fullCourseRoute?.hazard ?? selected.hazard}${outlierReason}`
        : `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) route ${startAnalysis.selectedRouteIndex + 1}/${startAnalysis.routes.length} ${adjustedLabel} ${startAnalysis.adjustedScore}${energyCost}${courseEstimate} raw ${selected.score} traffic ${startAnalysis.trafficPenalty} ranged ${startAnalysis.trafficRanged ?? startAnalysis.rearThreat ?? 0} nearby ${startAnalysis.trafficNearby ?? startAnalysis.lateralThreat ?? 0} competition ${startAnalysis.trafficCompetition ?? startAnalysis.overlapPenalty ?? 0} occupancy-scale ${startAnalysis.trafficScale ?? 0} distance ${selected.distance} actions ${selected.actions} forced ${selected.forcedDistance} hazard ${selected.hazard}${selected.movingTarget ? ` hit flag ${selected.movingTarget.checkpointId} space ${selected.movingTarget.space ?? "?"}` : ""}${outlierReason}`
    );
  }

  return lines.map(roundCourseEvaluationNumbers).join("\n");
}

let generationOverlayState = {
  attempt: 1,
  maxAttempts: 1,
  stage: "",
  preferences: null,
  stageContext: null,
  semanticKey: "general",
  semanticStartedAt: 0,
  slowTimerId: null
};

// UI-only provisional thresholds. Later calibration can replace these with observed
// stage percentiles without changing the wording/state architecture.
const GENERATION_SLOW_STAGE_MS = Object.freeze({
  building: 4200,
  checkpoints: 3200,
  routes: 3200,
  alternatives: 2800,
  balance: 2800,
  economy: 2600,
  competitive: 2800,
  movingTargets: 2800,
  retry: 4200,
  finishing: 3000,
  general: 4200
});

function classifyGenerationStage(stage = "", stageContext = null) {
  const raw = String(stage || "").toLowerCase();
  if (
    raw.includes("another course") || raw.includes("another checkpoint") ||
    raw.includes("no exact fit") || raw.includes("fallback") ||
    raw.includes("rejecting") || raw.includes("inconclusive")
  ) return "retry";
  if (raw.includes("loading") || raw.includes("setting up") || raw.includes("building") || raw.includes("layout")) return "building";
  if (raw.includes("checkpoint")) return stageContext?.movingTargets ? "movingTargets" : "checkpoints";
  if (raw.includes("subsid") || raw.includes("pricing") || raw.includes("pay to win")) return "economy";
  if (raw.includes("competitive")) return "competitive";
  if (raw.includes("alternate")) return "alternatives";
  if (raw.includes("fairness") || raw.includes("balanc") || raw.includes("removable")) return "balance";
  if (
    raw.includes("routing") || raw.includes("route") || raw.includes("starting spaces") ||
    raw.includes("preflight") || raw.includes("refining") || raw.includes("evaluating starting")
  ) return "routes";
  if (raw.includes("traffic")) return "alternatives";
  if (raw.includes("difficulty") || raw.includes("length") || raw.includes("final fit") || raw.includes("finishing") || raw.includes("candidate complete")) return "finishing";
  return "general";
}

function getGenerationSlowHint(key, stageContext = null) {
  if (stageContext?.movingTargets && (key === "movingTargets" || key === "routes" || key === "alternatives")) {
    return "Moving checkpoints give this layout a few more possibilities to check.";
  }
  if (stageContext?.competitiveMode && (key === "competitive" || key === "balance" || key === "routes")) {
    return "The extra starting choices are taking a little longer to compare.";
  }
  if ((stageContext?.payToWin || stageContext?.subsidizedStarts) && (key === "economy" || key === "balance" || key === "routes")) {
    return "The starting choices are taking a little longer to balance.";
  }
  if (stageContext?.recoveryRule === "dynamic_archiving" && key === "routes") {
    return "Flexible reboot choices give this layout a little more to check.";
  }
  if ((stageContext?.extraDocks || stageContext?.sandwichedDock) && (key === "routes" || key === "balance")) {
    return "Multiple starting areas give this layout more opening choices to compare.";
  }
  if (key === "alternatives") return "This layout has several plausible ways through the busy parts.";
  if (key === "routes") return "This layout has some tricky routes to check.";
  if (key === "balance" || key === "economy" || key === "competitive") return "This setup has several starting choices to compare.";
  if (key === "checkpoints" || key === "movingTargets") return "This layout has several checkpoint arrangements to consider.";
  if (key === "retry") return "Finding a close match is taking a few tries.";
  return "This course is taking a little longer to check.";
}

function getGenerationUserFacingState(stage = "", options = {}) {
  const stageContext = options.stageContext ?? null;
  const key = options.key ?? classifyGenerationStage(stage, stageContext);
  const elapsedMs = Math.max(0, Number(options.elapsedMs) || 0);
  const slowThreshold = GENERATION_SLOW_STAGE_MS[key] ?? GENERATION_SLOW_STAGE_MS.general;
  const slow = elapsedMs >= slowThreshold;

  let heading = "Generating course";
  let activity = "Trying a course setup and checking that it plays well.";
  if (key === "retry") {
    heading = "Trying another layout";
    activity = "The previous layout was not a close enough match, so another one is being tried.";
  } else if (key === "building") {
    heading = "Building the course";
    activity = "Choosing boards and arranging the course.";
  } else if (key === "checkpoints") {
    heading = "Placing checkpoints";
    activity = "Choosing checkpoint positions that make a playable race.";
  } else if (key === "movingTargets") {
    heading = "Placing moving checkpoints";
    activity = "Checking where the moving checkpoints work well on this layout.";
  } else if (key === "routes") {
    heading = slow ? "Checking some tricky routes" : "Checking the routes";
    activity = "Making sure the course works well from the available starts.";
  } else if (key === "alternatives") {
    heading = "Comparing route options";
    activity = "Looking for useful alternatives where the racing lines may get busy.";
  } else if (key === "balance") {
    heading = "Balancing the starts";
    activity = "Checking that the available starting choices make sense together.";
  } else if (key === "economy") {
    heading = "Balancing the starting choices";
    activity = "Checking the Energy adjustments for the available starts.";
  } else if (key === "competitive") {
    heading = "Checking competitive starts";
    activity = "Comparing the extra starting choices used for blocking and selection.";
  } else if (key === "finishing") {
    heading = "Finishing the course";
    activity = "Checking the final difficulty, length, and setup.";
  }

  return {
    key,
    heading,
    activity,
    slow,
    slowHint: slow ? getGenerationSlowHint(key, stageContext) : ""
  };
}

function setGenerationStopControlState(requested = false) {
  const button = document.getElementById("use-best-so-far");
  const note = document.getElementById("use-best-so-far-note");
  if (button) {
    button.disabled = Boolean(requested);
    button.textContent = requested ? "Stopping…" : "Use Best So Far";
    button.setAttribute("aria-disabled", requested ? "true" : "false");
  }
  if (note) {
    note.textContent = requested
      ? "Stop requested. The current check may finish before generation stops."
      : "Stops at the next safe point; the current check may finish first.";
  }
}

function requestGenerationStop() {
  if (!isGenerating || generationStopRequested) return;
  generationStopRequested = true;
  setGenerationStopControlState(true);
}

function renderGeneratingOverlayState() {
  const overlay = document.getElementById("generating-overlay");
  if (!overlay?.classList.contains("visible")) return;

  const now = generationNow();
  const elapsedMs = Math.max(0, now - (generationOverlayState.semanticStartedAt || now));
  const userState = getGenerationUserFacingState(
    generationOverlayState.stage,
    {
      key: generationOverlayState.semanticKey,
      elapsedMs,
      stageContext: generationOverlayState.stageContext
    }
  );
  const headingEl = document.getElementById("overlay-heading");
  const attemptEl = document.getElementById("overlay-attempt");
  const activityEl = document.getElementById("overlay-text");
  const hintEl = document.getElementById("overlay-hint");

  if (headingEl) headingEl.textContent = userState.heading;
  if (attemptEl) {
    attemptEl.textContent = `Course attempt ${Math.max(1, generationOverlayState.attempt)} / ${generationOverlayState.maxAttempts}`;
  }
  if (activityEl) activityEl.textContent = userState.activity;
  if (hintEl) {
    const hint = userState.slowHint || getGenerationConstraintHint(generationOverlayState.preferences ?? {});
    hintEl.textContent = hint;
    hintEl.classList.toggle("hidden", !hint);
  }
}

function scheduleGeneratingOverlaySlowRefresh() {
  if (generationOverlayState.slowTimerId !== null) {
    window.clearTimeout(generationOverlayState.slowTimerId);
    generationOverlayState.slowTimerId = null;
  }
  const key = generationOverlayState.semanticKey;
  const threshold = GENERATION_SLOW_STAGE_MS[key] ?? GENERATION_SLOW_STAGE_MS.general;
  const startedAt = generationOverlayState.semanticStartedAt;
  generationOverlayState.slowTimerId = window.setTimeout(() => {
    if (
      generationOverlayState.semanticKey === key &&
      generationOverlayState.semanticStartedAt === startedAt
    ) {
      renderGeneratingOverlayState();
    }
  }, threshold + 40);
}

function setGeneratingOverlay(visible, text = "", details = {}) {
  const overlay = document.getElementById("generating-overlay");
  if (!overlay) return;

  overlay.classList.toggle("visible", visible);
  if (!visible) {
    if (generationOverlayState.slowTimerId !== null) {
      window.clearTimeout(generationOverlayState.slowTimerId);
    }
    generationOverlayState.slowTimerId = null;
    return;
  }

  const now = generationNow();
  const attempt = details.attempt ?? generationOverlayState.attempt ?? 1;
  const stage = details.stage ?? generationOverlayState.stage ?? text;
  const stageContext = details.stageContext !== undefined
    ? details.stageContext
    : generationOverlayState.stageContext ?? null;
  const semanticKey = classifyGenerationStage(stage, stageContext);
  const attemptChanged = attempt !== generationOverlayState.attempt;
  const semanticChanged = semanticKey !== generationOverlayState.semanticKey;

  generationOverlayState = {
    ...generationOverlayState,
    ...details,
    attempt,
    maxAttempts: details.maxAttempts ?? generationOverlayState.maxAttempts ?? getGenerationModeProfile(details.preferences ?? generationOverlayState.preferences ?? {}).maxAttempts,
    stage,
    preferences: details.preferences ?? generationOverlayState.preferences ?? {},
    stageContext,
    semanticKey,
    semanticStartedAt: attemptChanged || semanticChanged || !generationOverlayState.semanticStartedAt
      ? now
      : generationOverlayState.semanticStartedAt,
    slowTimerId: generationOverlayState.slowTimerId
  };

  renderGeneratingOverlayState();
  scheduleGeneratingOverlaySlowRefresh();
}

function openAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.showModal || dialog.open) {
    return;
  }
  closeVariantPicker();
  dialog.showModal();
}

function closeAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.open) {
    return;
  }
  dialog.close();
}

function isDevViewEnabled() {
  // Browser Dev View is presentation/diagnostic state, not generation semantics.
  // Calibration imports Main directly in Node, where no DOM exists; headless runs
  // must therefore behave exactly like ordinary generation with Dev View disabled.
  if (typeof document === "undefined") return false;
  return document.getElementById("dev-view")?.checked ?? true;
}

function getRouteInspectionPrunedStatus(outlierInfo) {
  const reasons = outlierInfo?.reasons ?? {};
  if (!outlierInfo) return null;
  if (reasons.normalBalancePruned && !reasons.balanceDispersionPruned) return "outlier";
  if (reasons.normalBalancePruned) return "balance-pruned";
  if (reasons.subsidizedStarts) return "subsidy-pruned";
  if (reasons.payToWinPruned || reasons.payToWinUnavailable) return "price-pruned";
  return "pruned";
}

function getFocusedRouteEntry(scenario, legIndex) {
  if (routeInspectionState.kind !== "start") return null;
  const startIndex = Number(routeInspectionState.key);
  const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
  const fullRoute = startAnalysis?.fullCourseRoute;
  if (!fullRoute) return null;
  const route = legIndex === null ? fullRoute : fullRoute.legRoutes?.[legIndex];
  if (!route) return null;
  const outlierInfo = (scenario.sequence.firstLeg.summary.outliers || []).find((item) => item.index === startIndex) ?? null;
  const competitive = scenario.metrics?.competitiveBlockImpact ?? scenario.sequence.firstLeg.summary.competitiveStartBalance ?? null;
  const competitiveBlock = (competitive?.blockSequence ?? []).find((entry) => entry.index === startIndex) ?? null;
  const competitiveSelected = (competitive?.selectedIndices ?? []).includes(startIndex);
  const prunedStatus = competitiveBlock
    ? `simulated block p${competitiveBlock.order}`
    : competitiveSelected
      ? "simulated selected start"
      : getRouteInspectionPrunedStatus(outlierInfo);
  const statusText = prunedStatus ? ` (${prunedStatus})` : "";
  return {
    id: `start:${startIndex}`,
    label: legIndex === null
      ? `Start ${startIndex + 1}${statusText} — all legs`
      : `Start ${startIndex + 1}${statusText} — ${formatLegLabel(scenario.sequence.legs[legIndex])}`,
    route,
    startAnalysis,
    outlierInfo,
    prunedStatus
  };
}

function formatTraceState(state) {
  if (!state) return "";
  return `(${state.x},${state.y})${state.facing ? ` ${state.facing}` : ""}`;
}

function formatBoardTraceEvent(event) {
  if (!event) return null;
  if (event.type === "conveyor") {
    const facing = event.facingBefore && event.facingAfter && event.facingBefore !== event.facingAfter
      ? `; facing ${event.facingBefore}→${event.facingAfter}`
      : "";
    const phase = event.phase === "blue"
      ? `blue phase${Number.isFinite(Number(event.phaseStep)) ? ` ${event.phaseStep}` : ""}`
      : event.phase === "green"
        ? "green phase"
        : event.phase === "current"
          ? "current phase"
          : event.speed === 2
            ? "blue conveyor"
            : "conveyor";
    return `${phase}: ${event.dir} ${formatTraceState(event.from)}→${formatTraceState(event.to)}${facing}`;
  }
  if (event.type === "oil") return `oil slide ${event.dir} ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "pusher") return `pusher ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "gear") return `gear at (${event.at.x},${event.at.y}); facing ${event.facingBefore}→${event.facingAfter}`;
  return null;
}

const ROUTE_TRACE_REGISTER_COUNT = 5;
const ROUTE_TRACE_TIMED_FEATURE_TYPES = new Set(["push", "crusher", "trapdoor", "flamethrower"]);

function getRouteTraceTimedFeatures(tile) {
  return (tile?.features || []).filter((feature) => (
    ROUTE_TRACE_TIMED_FEATURE_TYPES.has(feature.type) &&
    Array.isArray(feature.timing) &&
    feature.timing.length > 0
  ));
}

function isRouteTraceTimedFeatureActive(feature, registerInTurn) {
  return Array.isArray(feature?.timing) && feature.timing.includes(registerInTurn);
}

function formatRouteTraceTiming(feature) {
  const timing = [...new Set(feature?.timing || [])].sort((a, b) => a - b);
  return `[${timing.map((register) => `R${register}`).join(",")}]`;
}

function formatRouteTraceTimedFeatureName(feature) {
  if (feature?.type === "push") return `pusher${feature.dir ? ` ${feature.dir}` : ""}`;
  if (feature?.type === "flamethrower") return "flamer";
  return feature?.type ?? "timed feature";
}

function sameTracePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function getActualTimedTraversalPoints(transition) {
  const points = Array.isArray(transition?.traversed) ? transition.traversed : [];
  return points.filter((point, index) => {
    if (!point) return false;
    // A paired portal moves onto its portal square and then jumps. Elements on
    // that entry/transit square are skipped; the jump destination still counts.
    const nextPoint = points[index + 1];
    return !(!point.jump && nextPoint?.jump);
  });
}

function getTimedFeatureTraceParts(tileMap, transition, registerInTurn) {
  if (!tileMap || !transition) return [];
  const parts = [];
  const pushEvents = (transition.boardEvents || []).filter((event) => event.type === "pusher");
  const actualTraversal = getActualTimedTraversalPoints(transition);
  const lastTraversal = actualTraversal.length ? actualTraversal[actualTraversal.length - 1] : null;
  const terminalFailure = Boolean(transition.rebooted || transition.crashed);

  // Trapdoors are open for the entire active register, so register-start
  // occupancy matters. Pushers and crushers are deliberately not reported
  // here: they only matter at their own later board-element phases. Flamers
  // likewise score on entry/pass-through and end-of-register occupancy.
  const startTile = tileMap.get(`${transition.from?.x},${transition.from?.y}`);
  for (const feature of getRouteTraceTimedFeatures(startTile)) {
    if (feature.type !== "trapdoor") continue;
    const name = formatRouteTraceTimedFeatureName(feature);
    const timing = formatRouteTraceTiming(feature);
    const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
    if (active && terminalFailure) {
      parts.push(`${name} ${timing}: ACTIVE → open at register start; ${transition.rebooted ? "dropped/rebooted" : "dropped"}`);
    } else {
      parts.push(`${name} ${timing}: ${active ? "ACTIVE" : "inactive"} at register start`);
    }
  }

  // Only trapdoors and flamers care about traversal itself. A robot may cross
  // a pusher or crusher tile earlier in the register without ever occupying it
  // when that feature's phase resolves, so such crossings are intentionally
  // silent here.
  actualTraversal.forEach((point) => {
    const tile = tileMap.get(`${point.x},${point.y}`);
    for (const feature of getRouteTraceTimedFeatures(tile)) {
      if (feature.type !== "flamethrower" && feature.type !== "trapdoor") continue;
      const name = formatRouteTraceTimedFeatureName(feature);
      const timing = formatRouteTraceTiming(feature);
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      const at = ` at (${point.x},${point.y})`;
      const isTerminalFailurePoint = sameTracePoint(point, lastTraversal) && terminalFailure;

      if (feature.type === "flamethrower") {
        parts.push(active
          ? `${name} ${timing}: ACTIVE → entry/pass-through +1 damage${at}`
          : `${name} ${timing}: inactive → crossed safely${at}`);
      } else if (!active) {
        parts.push(`${name} ${timing}: inactive → crossed safely${at}`);
      } else if (isTerminalFailurePoint && sameTracePoint(point, transition.from)) {
        // The register-start message already explains this drop.
        continue;
      } else if (isTerminalFailurePoint) {
        parts.push(`${name} ${timing}: ACTIVE → open; ${transition.rebooted ? "dropped/rebooted" : "dropped"}${at}`);
      } else {
        parts.push(`${name} ${timing}: ACTIVE → OPEN TILE CROSSED (unexpected)${at}`);
      }
    }
  });

  // Pusher diagnostics are phase-aware. If a timed pusher actually moves the
  // robot, the board event gives the exact pusher-phase position. If no push
  // occurs on a surviving transition, the final coordinates are also the
  // pusher-phase coordinates because gears only rotate and crushers do not
  // move a surviving robot.
  if (pushEvents.length) {
    for (const event of pushEvents) {
      const tile = tileMap.get(`${event.from?.x},${event.from?.y}`);
      const activeTimedPushes = getRouteTraceTimedFeatures(tile).filter((feature) => (
        feature.type === "push" && isRouteTraceTimedFeatureActive(feature, registerInTurn)
      ));
      for (const feature of activeTimedPushes) {
        parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ACTIVE → pushed ${formatTraceState(event.from)}→${formatTraceState(event.to)}`);
      }
    }
  } else if (!terminalFailure && transition.to) {
    const pusherTile = tileMap.get(`${transition.to.x},${transition.to.y}`);
    for (const feature of getRouteTraceTimedFeatures(pusherTile)) {
      if (feature.type !== "push") continue;
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ${active ? "ACTIVE → no displacement" : "inactive"} at pusher phase`);
    }
  }

  // Crushers resolve after gears. Report them only for the square occupied at
  // the crusher phase, never merely because that square was crossed earlier.
  // On a surviving transition that is transition.to. For a terminal crusher
  // result, resolveCrusherPhase records its square as the terminal traversal.
  let crusherPoint = null;
  if (!terminalFailure && transition.to) {
    crusherPoint = transition.to;
  } else if (lastTraversal) {
    const terminalTile = tileMap.get(`${lastTraversal.x},${lastTraversal.y}`);
    const hasActiveCrusher = getRouteTraceTimedFeatures(terminalTile).some((feature) => (
      feature.type === "crusher" && isRouteTraceTimedFeatureActive(feature, registerInTurn)
    ));
    if (hasActiveCrusher) crusherPoint = lastTraversal;
  }

  if (crusherPoint) {
    const crusherTile = tileMap.get(`${crusherPoint.x},${crusherPoint.y}`);
    for (const feature of getRouteTraceTimedFeatures(crusherTile)) {
      if (feature.type !== "crusher") continue;
      const name = formatRouteTraceTimedFeatureName(feature);
      const timing = formatRouteTraceTiming(feature);
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      const at = ` at (${crusherPoint.x},${crusherPoint.y})`;
      if (!active) {
        parts.push(`${name} ${timing}: inactive at crusher phase${at}`);
      } else if (terminalFailure) {
        parts.push(`${name} ${timing}: ACTIVE → ${transition.rebooted ? "crushed/rebooted" : "crushed"}${at}`);
      } else {
        parts.push(`${name} ${timing}: ACTIVE → SURVIVED CRUSHER (unexpected)${at}`);
      }
    }
  }

  if (!terminalFailure && transition.to) {
    const endTile = tileMap.get(`${transition.to.x},${transition.to.y}`);
    for (const feature of getRouteTraceTimedFeatures(endTile)) {
      if (feature.type !== "flamethrower") continue;
      if (!isRouteTraceTimedFeatureActive(feature, registerInTurn)) continue;
      parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ACTIVE → end-of-register +1 damage at (${transition.to.x},${transition.to.y})`);
    }
  }

  // Do not de-duplicate: repeated passes through an active flamer are separate
  // damage events and should remain visible in the trace.
  return parts;
}

function formatChronologicalRouteTrace(route, tileMap = null) {
  if (!route?.transitions?.length) return ["Trace: none"];

  const startAction = route.absoluteStartAction ?? 0;
  const checkpointHits = Array.isArray(route.checkpointHits)
    ? route.checkpointHits
    : route.checkpointHit ? [route.checkpointHit] : [];
  const hitsByAction = new Map();
  checkpointHits.forEach((hit) => {
    const absoluteAction = hit.action ?? route.absoluteActions;
    if (!Number.isFinite(absoluteAction)) return;
    const items = hitsByAction.get(absoluteAction) ?? [];
    items.push(hit);
    hitsByAction.set(absoluteAction, items);
  });

  const lines = [];
  route.transitions.forEach((transition, index) => {
    const absoluteRegister = startAction + index + 1;
    const turnNumber = Math.floor((absoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
    const registerInTurn = ((absoluteRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;
    const programmedActionLabel = transition?.programCard === "AGAIN"
      ? `${transition.action} (AGAIN)`
      : transition.action;
    const pieces = [
      `${absoluteRegister}. [T${turnNumber} R${registerInTurn}] ${programmedActionLabel}`,
      `${formatTraceState(transition.from)}→${formatTraceState(transition.to)}`
    ];
    const timedParts = getTimedFeatureTraceParts(tileMap, transition, registerInTurn);
    const hasTimedPusherMove = timedParts.some((part) => part.includes("pusher") && part.includes("ACTIVE → pushed"));
    const boardParts = (transition.boardEvents || [])
      .filter((event) => !(event.type === "pusher" && hasTimedPusherMove))
      .map(formatBoardTraceEvent)
      .filter(Boolean);
    if (boardParts.length) pieces.push(boardParts.join("; "));
    else if ((transition.conveyorSteps || []).length) {
      pieces.push(transition.conveyorSteps
        .map((step) => formatBoardTraceEvent({ type: "conveyor", ...step }))
        .join("; "));
    } else if (transition.gearTurned) {
      pieces.push("gear turn");
    }
    if (timedParts.length) pieces.push(timedParts.join("; "));

    const hits = hitsByAction.get(absoluteRegister) ?? [];
    if (hits.length) pieces.push(hits.map((hit) => `FLAG ${hit.checkpointId ?? hit.checkpointIndex + 1}`).join(", "));
    lines.push(pieces.join(" → "));

    if (registerInTurn === ROUTE_TRACE_REGISTER_COUNT && index < route.transitions.length - 1) {
      lines.push(`──────── end turn ${turnNumber} / start turn ${turnNumber + 1} ────────`);
    }
  });

  return lines;
}

function formatRouteDetail(scenario, entry) {
  const route = entry?.route;
  if (!route) {
    return [];
  }

  // Use the same effective tile map as route analysis. In particular, normal
  // flags remove underlying board features unless Hazardous Flags is active,
  // so diagnostics must not resurrect the raw printed feature under a flag.
  const traceTileMap = scenario?.goalTileMap ?? null;
  const lines = [
    `${entry.label}: ${route.actions} register${route.actions === 1 ? "" : "s"}, distance ${route.distance}, forced ${route.forcedDistance}, raw score ${route.score}`,
    ...formatChronologicalRouteTrace(route, traceTileMap)
  ];
  const literalProgramCards = (route.transitions || [])
    .map((transition) => {
      const cardId = transition?.programCard;
      if (typeof cardId !== "string") return null;
      return cardId === "AGAIN"
        ? `${transition.action} (AGAIN)`
        : cardId;
    })
    .filter((cardId) => typeof cardId === "string");
  if (literalProgramCards.length === (route.transitions || []).length && literalProgramCards.length) {
    lines.push(`Program cards: ${literalProgramCards.join(" → ")}`);
  }

  const cardScarcityPenalty = Math.max(0, Number(route.cardAvailabilityPenalty) || 0);
  const programPlausibilityPenalty = Math.max(0, Number(route.programPlausibilityPenalty) || 0);
  if (cardScarcityPenalty > 0 || programPlausibilityPenalty > 0) {
    lines.push(
      `Program availability pressure: scarcity ${cardScarcityPenalty.toFixed(2)}, combination ${programPlausibilityPenalty.toFixed(2)}`
    );
  }

  if (route.hazard || route.rebootCount || route.conveyorComplexity) {
    lines.push(`Pressure: hazard ${route.hazard}, conveyor ${route.conveyorComplexity}, reboots ${route.rebootCount}`);
  }

  if (route.movingTarget?.space && route.hitTarget) {
    lines.push(`Moving target: flag ${route.movingTarget.checkpointId} space ${route.movingTarget.space} at (${route.hitTarget.x}, ${route.hitTarget.y})`);
  }

  if (entry.startAnalysis) {
    const prunedStatus = entry.prunedStatus ?? getRouteInspectionPrunedStatus(entry.outlierInfo);
    const startStatus = entry.outlierInfo ? `${prunedStatus ?? "pruned"}; unusable` : "usable";
    const trafficPenalty = entry.startAnalysis.trafficPenalty ?? 0;
    const adjustedLabel = entry.outlierInfo
      ? (prunedStatus === "outlier" ? "Outlier pass estimate" : "Pruned-start adjusted score")
      : "Final adjusted score";
    lines.push(`${adjustedLabel}: ${entry.startAnalysis.adjustedScore} (${startStatus}; raw ${route.score} + traffic ${trafficPenalty})`);
    const startResidual = scenario.sequence.firstLeg.summary?.normalStartBalance?.startResiduals?.entries
      ?.find((item) => item.index === entry.startAnalysis.index) ?? null;
    if (startResidual && !entry.outlierInfo) {
      lines.push(
        `Post-balance residual: ${startResidual.scoreResidual >= 0 ? "+" : ""}${startResidual.scoreResidual} score (${startResidual.scoreZ >= 0 ? "+" : ""}${startResidual.scoreZ}σ), actions ${startResidual.actionResidual >= 0 ? "+" : ""}${startResidual.actionResidual} vs retained mean`
      );
    }
    if (entry.startAnalysis.energyCost !== null && entry.startAnalysis.energyCost !== undefined) {
      const subsidyMode = Boolean(scenario.subsidizedStarts);
      const pricingLabel = subsidyMode ? "Subsidized Starts" : "Pay to Win";
      const formattedCost = formatPayToWinEnergyCost(entry.startAnalysis, {
        subsidizedStarts: subsidyMode
      });
      const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
      const describeAdjustment = (value) => subsidyMode
        ? `grants +${value} starting Energy`
        : `costs ${value} starting Energy`;
      if (payToWinPricing?.hasLatePriceDifference && formattedCost?.includes("/")) {
        const firstLatePlayer = payToWinPricing.lateSelectorStart
          ?? scenario.playerCount;
        const lastLatePlayer = payToWinPricing.lateSelectorEnd ?? scenario.playerCount;
        const singleLatePlayer = firstLatePlayer === lastLatePlayer;
        const latePlayerText = singleLatePlayer
          ? `player ${firstLatePlayer}`
          : `players ${firstLatePlayer}–${lastLatePlayer}`;
        if (entry.startAnalysis.earlyUnavailable && entry.startAnalysis.lateUnavailable) {
          lines.push(`${pricingLabel}: unavailable to both earlier selectors and ${latePlayerText}`);
        } else if (entry.startAnalysis.earlyUnavailable) {
          lines.push(`${pricingLabel}: unavailable to earlier selectors; ${describeAdjustment(entry.startAnalysis.lateEnergyCost)} for ${latePlayerText}`);
        } else if (entry.startAnalysis.lateUnavailable) {
          lines.push(`${pricingLabel}: ${describeAdjustment(entry.startAnalysis.energyCost)} for earlier selectors; unavailable to ${latePlayerText}`);
        } else {
          lines.push(`${pricingLabel}: ${subsidyMode ? "grants" : "costs"} ${formattedCost} starting Energy; ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value`);
        }
      } else {
        lines.push(`${pricingLabel}: ${subsidyMode ? "grants" : "costs"} ${formattedCost} starting Energy`);
      }
    }
    if (entry.startAnalysis.courseEstimate) {
      lines.push(`Full-course estimate: ${entry.startAnalysis.courseEstimate.totalActions} registers, score ${entry.startAnalysis.courseEstimate.totalScore}, adjustment ${entry.startAnalysis.courseScoreAdjustment ?? 0}`);
      lines.push(`Full-course route pressure: candidate ${(entry.startAnalysis.courseEstimate.selectedRouteIndex ?? 0) + 1}/${entry.startAnalysis.courseEstimate.candidateCount ?? 1}, penalty ${entry.startAnalysis.courseEstimate.fullCourseTrafficPenalty ?? 0}`);
      lines.push("Map route: selected start's expected path through all checkpoints");
    }
    lines.push(`Traffic: ranged ${entry.startAnalysis.trafficRanged ?? entry.startAnalysis.rearThreat ?? 0}, nearby ${entry.startAnalysis.trafficNearby ?? entry.startAnalysis.lateralThreat ?? 0}, route competition ${entry.startAnalysis.trafficCompetition ?? entry.startAnalysis.overlapPenalty ?? 0}`);
    if (entry.outlierInfo) {
      lines.push(`Not comparable with final usable-start adjusted scores; this was measured in the pruning pass where it dropped.`);
      lines.push(`Outlier delta: score ${entry.outlierInfo.delta}, actions ${entry.outlierInfo.actionDelta}`);
    }
  }

  return lines;
}

function getCheckpointInspectionLines(scenario, checkpointIndex) {
  const checkpoint = scenario.checkpoints[checkpointIndex];
  if (!checkpoint) {
    return [];
  }

  const incomingLeg = scenario.sequence.legs[checkpointIndex];
  const areaScore = scoreFlagArea(scenario.goalTileMap, checkpoint, {
    playerCount: scenario.playerCount,
    ...getRouteAnalysisVariantOptions(scenario.preferences)
  });
  const lines = [
    `Checkpoint ${checkpointIndex + 1}: (${checkpoint.x}, ${checkpoint.y})`,
    `Incoming leg: ${incomingLeg ? formatLegLabel(incomingLeg) : "n/a"}`,
    `Area risk: ${areaScore}`
  ];

  if (incomingLeg?.analysis?.summary) {
    const summary = incomingLeg.analysis.summary;
    if (summary.difficultyScore !== undefined) {
      lines.push(`Route profile: difficulty ${summary.difficultyScore}, length ${summary.lengthScore}, traffic ${summary.averageTrafficPenalty}`);
      const incomingStarts = scenario.sequence.firstLeg.starts
        .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.selectedRoute)
        .map((startAnalysis) => ({
          startIndex: startAnalysis.index,
          actions: startAnalysis.selectedRoute.actions,
          score: startAnalysis.selectedRoute.score
        }));
      if (incomingStarts.length) {
        const fastest = [...incomingStarts].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingStarts].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingStarts].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingStarts.length}, fastest Start ${fastest.startIndex + 1} (${fastest.actions} registers), slowest Start ${slowest.startIndex + 1} (${slowest.actions}), hardest Start ${hardest.startIndex + 1} (score ${hardest.score})`);
      }
    } else {
      lines.push(summary.expectedRobotPaths
        ? `Route profile: ${summary.expectedRouteCount} expected robot paths, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`
        : `Route profile: ${summary.distinctRouteCount} distinct routes, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`);
      const incomingRoutes = incomingLeg.analysis.distinctRoutes || [];
      if (summary.expectedRobotPaths && incomingRoutes.length) {
        const fastest = [...incomingRoutes].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingRoutes].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingRoutes].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingRoutes.length}, fastest Start ${(fastest.startIndex ?? 0) + 1} (${fastest.actions} registers), slowest Start ${(slowest.startIndex ?? 0) + 1} (${slowest.actions}), hardest Start ${(hardest.startIndex ?? 0) + 1} (score ${hardest.score})`);
      }
    }
  }

  const timeline = scenario.movingTargetTimelines?.[checkpointIndex];
  if (timeline?.positions?.length > 1) {
    lines.push(`Moving target: re-entry (${timeline.reentry.x}, ${timeline.reentry.y}), ${timeline.displayPositions?.length ?? timeline.positions.length} path spaces`);
  }

  return lines;
}


function removeDevStartResidualTable() {
  document.getElementById("dev-start-residuals")?.remove();
}

function updateDevStartResidualTable(scenario) {
  if (typeof document === "undefined") return;

  const residuals = scenario?.sequence?.firstLeg?.summary?.normalStartBalance?.startResiduals ?? null;
  const notableEntries = residuals?.active
    ? (residuals.entries ?? [])
      .filter((entry) => (residuals.notableIndices ?? []).includes(entry.index))
      .sort((left, right) => (
        Math.abs(right.scoreZ ?? 0) - Math.abs(left.scoreZ ?? 0) ||
        left.index - right.index
      ))
    : [];

  if (!isDevViewEnabled() || !notableEntries.length) {
    removeDevStartResidualTable();
    return;
  }

  let details = document.getElementById("dev-start-residuals");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    const anchor = document.getElementById("inspection-detail")
      ?? document.getElementById("report-panel")
      ?? document.getElementById("run-diagnostics");
    const parent = anchor?.parentElement;
    if (!parent) return;

    details = document.createElement("details");
    details.id = "dev-start-residuals";
    details.style.margin = "0.6rem 0";
    details.style.padding = "0.45rem 0";
    if (anchor) {
      parent.insertBefore(details, anchor.nextSibling);
    } else {
      parent.append(details);
    }
  }

  details.replaceChildren();
  details.open = wasOpen;

  const summary = document.createElement("summary");
  summary.textContent = `Retained starting-space residuals (${notableEntries.length} notable)`;
  details.append(summary);

  const note = document.createElement("div");
  note.style.fontSize = "0.9em";
  note.style.margin = "0.35rem 0";
  note.textContent = "Post-final-balance diagnostics only. These rows do not affect pruning or route choice.";
  details.append(note);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.9em";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Start", "Residual", "Actions", "Main visible difference"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.style.textAlign = "left";
    th.style.padding = "0.2rem 0.35rem";
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  notableEntries.forEach((entry) => {
    const row = document.createElement("tr");
    const direction = (entry.scoreResidual ?? 0) < 0 ? "cleaner" : "tougher";
    const cells = [
      `#${entry.index + 1} (${entry.x}, ${entry.y})`,
      `${direction}; ${entry.scoreResidual >= 0 ? "+" : ""}${entry.scoreResidual} (${entry.scoreZ >= 0 ? "+" : ""}${entry.scoreZ}σ)`,
      `${entry.actions ?? "n/a"} (${entry.actionResidual >= 0 ? "+" : ""}${entry.actionResidual})`,
      entry.reasonLabel ?? "overall route burden"
    ];
    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.style.padding = "0.2rem 0.35rem";
      td.style.verticalAlign = "top";
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(tbody);
  details.append(table);
}

function updateInspectionDetail(scenario, selectedLegIndex) {
  const detailEl = document.getElementById("inspection-detail");
  if (!detailEl) {
    return;
  }

  const visible = Boolean(scenario && isDevViewEnabled() && routeInspectionState.kind);
  detailEl.classList.toggle("hidden", !visible);
  detailEl.replaceChildren();
  if (!visible) {
    return;
  }

  const focused = getFocusedRouteEntry(scenario, selectedLegIndex);
  const lines = routeInspectionState.kind === "start" && focused
    ? formatRouteDetail(scenario, focused)
    : routeInspectionState.kind === "checkpoint"
      ? getCheckpointInspectionLines(scenario, Number(routeInspectionState.key))
      : [];

  lines.forEach((line, index) => {
    const row = document.createElement("div");
    if (index === 0) {
      const strong = document.createElement("strong");
      strong.textContent = line;
      row.append(strong);
    } else {
      row.textContent = line;
    }
    detailEl.append(row);
  });
}

function isBoardAuditEnabled() {
  return document.getElementById("board-audit-toggle")?.checked ?? false;
}

function getBoardViewMode() {
  return document.getElementById("board-view-mode")?.value ?? BOARD_VIEW_MODES.photos;
}

function updateDevGenerationSeedControls(message = "") {
  const wrapper = document.getElementById("dev-generation-seed-controls");
  const toggle = document.getElementById("dev-generation-seed-toggle");
  const renew = document.getElementById("dev-generation-seed-renew");
  const input = document.getElementById("dev-generation-seed-input");
  const status = document.getElementById("dev-generation-seed-status");
  if (!wrapper || !toggle || !renew || !input || !status) {
    return;
  }

  const frozen = Number.isInteger(devFrozenGenerationSeed);
  toggle.textContent = frozen ? "Unfreeze test seed" : "Freeze test seed";
  renew.classList.toggle("hidden", !frozen);
  if (frozen && document.activeElement !== input) {
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
  }
  status.textContent = message || (frozen
    ? `Construction RNG frozen at ${formatDevGenerationSeed(devFrozenGenerationSeed)}. Rerolls repeat the same random construction sequence while settings and analyzer code remain editable.`
    : "Enter an 8-digit hex seed (for example 56BAC99D) and apply it, or freeze a new random seed.");
}

function ensureDevGenerationSeedControls() {
  if (document.getElementById("dev-generation-seed-controls")) {
    return;
  }

  const anchor = document.getElementById("run-diagnostics");
  const parent = anchor?.parentElement;
  if (!parent) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.id = "dev-generation-seed-controls";
  wrapper.className = "hidden";
  wrapper.style.margin = "0.5rem 0";

  const toggle = document.createElement("button");
  toggle.id = "dev-generation-seed-toggle";
  toggle.type = "button";

  const input = document.createElement("input");
  input.id = "dev-generation-seed-input";
  input.type = "text";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 10;
  input.placeholder = "Seed, e.g. 56BAC99D";
  input.value = "56BAC99D";
  input.setAttribute("aria-label", "Dev generation test seed");
  input.style.marginLeft = "0.4rem";
  input.style.width = "10.5rem";

  const apply = document.createElement("button");
  apply.id = "dev-generation-seed-apply";
  apply.type = "button";
  apply.textContent = "Apply seed";
  apply.style.marginLeft = "0.4rem";

  const renew = document.createElement("button");
  renew.id = "dev-generation-seed-renew";
  renew.type = "button";
  renew.textContent = "New test seed";
  renew.style.marginLeft = "0.4rem";

  const status = document.createElement("div");
  status.id = "dev-generation-seed-status";
  status.style.marginTop = "0.35rem";
  status.style.fontSize = "0.9em";

  const applyTypedSeed = () => {
    const parsed = parseDevGenerationSeed(input.value);
    if (!Number.isInteger(parsed)) {
      updateDevGenerationSeedControls("Invalid seed. Enter up to 8 hexadecimal digits, for example 56BAC99D.");
      return;
    }
    devFrozenGenerationSeed = parsed;
    input.value = formatDevGenerationSeed(parsed);
    updateDevGenerationSeedControls();
  };

  toggle.addEventListener("click", () => {
    if (Number.isInteger(devFrozenGenerationSeed)) {
      devFrozenGenerationSeed = null;
      updateDevGenerationSeedControls();
      return;
    }

    const typed = parseDevGenerationSeed(input.value);
    devFrozenGenerationSeed = Number.isInteger(typed)
      ? typed
      : createDevGenerationSeed();
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
    updateDevGenerationSeedControls();
  });

  apply.addEventListener("click", applyTypedSeed);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedSeed();
    }
  });

  renew.addEventListener("click", () => {
    devFrozenGenerationSeed = createDevGenerationSeed();
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
    updateDevGenerationSeedControls();
  });

  wrapper.append(toggle, input, apply, renew, status);
  parent.insertBefore(wrapper, anchor);
  updateDevGenerationSeedControls();
}

function isDevRouteModelOverrideActive() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-route-model-override-toggle")?.checked);
}

function isDevFastTrafficEnabled() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-fast-traffic-toggle")?.checked);
}

function isDevFastAlternatesEnabled() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-fast-alternates-toggle")?.checked);
}

function ensureDevFastBaselineControls() {
  if (document.getElementById("dev-fast-baseline-controls")) return;

  const anchor = document.getElementById("dev-generation-seed-controls") ??
    document.getElementById("run-diagnostics");
  const parent = anchor?.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("div");
  wrapper.id = "dev-fast-baseline-controls";
  wrapper.className = "hidden";
  wrapper.style.margin = "0.5rem 0";
  wrapper.style.padding = "0.45rem 0";

  const title = document.createElement("strong");
  title.textContent = "Current-mode traffic override";

  const purpose = document.createElement("div");
  purpose.style.fontSize = "0.9em";
  purpose.style.margin = "0.2rem 0 0.35rem";
  purpose.textContent = "Diagnostic experiment controls. Leave override off to use the selected generation mode exactly as designed.";

  const overrideLabel = document.createElement("label");
  overrideLabel.style.display = "block";
  overrideLabel.style.marginBottom = "0.25rem";
  const overrideToggle = document.createElement("input");
  overrideToggle.id = "dev-route-model-override-toggle";
  overrideToggle.type = "checkbox";
  overrideToggle.checked = false;
  overrideLabel.append(overrideToggle, document.createTextNode(" Override selected mode's traffic behavior for next generation"));

  const forcedControls = document.createElement("div");
  forcedControls.style.marginLeft = "1.1rem";

  const trafficLabel = document.createElement("label");
  trafficLabel.style.marginRight = "0.8rem";
  const traffic = document.createElement("input");
  traffic.id = "dev-fast-traffic-toggle";
  traffic.type = "checkbox";
  trafficLabel.append(traffic, document.createTextNode(" Traffic scoring enabled"));

  const alternatesLabel = document.createElement("label");
  const alternates = document.createElement("input");
  alternates.id = "dev-fast-alternates-toggle";
  alternates.type = "checkbox";
  alternatesLabel.append(alternates, document.createTextNode(" Traffic-driven alternate discovery enabled"));
  forcedControls.append(trafficLabel, alternatesLabel);

  const note = document.createElement("div");
  note.id = "dev-fast-baseline-status";
  note.style.fontSize = "0.9em";
  note.style.marginTop = "0.25rem";

  const getSelectedModeState = () => {
    const mode = normalizeGenerationMode(document.getElementById("generation-mode")?.value);
    const profile = getGenerationModeProfile({ generationMode: mode });
    return {
      mode,
      label: formatGenerationModeLabel(mode),
      profile,
      trafficEnabled: Boolean(profile.trafficEnabled),
      alternatesEnabled: Boolean(profile.trafficEnabled && profile.trafficEpochs > 0)
    };
  };
  const syncForcedControlsToMode = () => {
    const state = getSelectedModeState();
    traffic.checked = state.trafficEnabled;
    alternates.checked = state.alternatesEnabled;
  };
  const updateNote = () => {
    const state = getSelectedModeState();
    const overrideActive = overrideToggle.checked;
    traffic.disabled = !overrideActive;
    alternates.disabled = !overrideActive;
    forcedControls.style.opacity = overrideActive ? "1" : "0.6";
    if (!overrideActive) {
      const newSearchText = state.alternatesEnabled
        ? `${state.profile.trafficAlternateMaxNewSearchesPerEpoch ?? 0} bounded new search(es)/epoch`
        : "no alternate discovery";
      note.textContent = `${state.label} controls generation: traffic ${state.trafficEnabled ? "on" : "off"}, traffic-driven alternatives ${state.alternatesEnabled ? "on" : "off"} (${newSearchText}). Dev View is observational.`;
      return;
    }
    const effectiveAlternates = traffic.checked && alternates.checked;
    note.textContent = `Override active for ${state.label}: force traffic ${traffic.checked ? "on" : "off"}, force traffic-driven alternates ${effectiveAlternates ? "on" : "off"}${alternates.checked && !traffic.checked ? " (alternate discovery requires traffic)" : ""}. Other ${state.label} budgets remain unchanged.`;
  };

  syncForcedControlsToMode();
  overrideToggle.addEventListener("change", () => {
    if (overrideToggle.checked) syncForcedControlsToMode();
    updateNote();
  });
  traffic.addEventListener("change", updateNote);
  alternates.addEventListener("change", updateNote);
  document.getElementById("generation-mode")?.addEventListener("change", () => {
    if (!overrideToggle.checked) syncForcedControlsToMode();
    updateNote();
  });

  wrapper.append(title, purpose, overrideLabel, forcedControls, note);
  parent.insertBefore(wrapper, anchor);
  updateNote();
}

function updateDevView() {
  ensureDevGenerationSeedControls();
  ensureDevFastBaselineControls();
  const enabled = isDevViewEnabled();
  if (enabled) {
    ensureCourseEvaluationReportElement();
  }
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
  document.getElementById("board-audit-toggle-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("dev-generation-seed-controls")?.classList.toggle("hidden", !enabled);
  document.getElementById("dev-fast-baseline-controls")?.classList.toggle("hidden", !enabled);
  document.getElementById("run-diagnostics")?.classList.add("hidden");
  updateBoardAuditVisibility();
  updateDevStartResidualTable(currentScenario);
}

function canvasHasVisibleCourse(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return false;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return false;
  }

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelStride = Math.max(1, Math.floor((data.length / 4) / 4000));

  for (let index = 0; index < data.length; index += pixelStride * 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];

    if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) {
      return true;
    }
  }

  return false;
}

function drawCanvasFailureNotice(canvas, message) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  canvas.width = 880;
  canvas.height = 220;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f7f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#2a333a";
  ctx.font = "bold 26px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Course Render Failed", 36, 68);

  ctx.fillStyle = "#58636c";
  ctx.font = "16px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(message, 36, 108);

  ctx.fillStyle = "#7a4e00";
  ctx.font = "bold 15px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Try rerolling. If it happens again, inspect the generated scenario.", 36, 152);
}


function getCanvasTileFromEvent(event) {
  const canvas = document.getElementById("canvas");
  const state = canvas?.__roborallyRenderState;
  if (!canvas || !state) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const tileX = Math.floor((canvasX - state.margin) / state.tileSize) + state.bounds.minX;
  const tileY = Math.floor((canvasY - state.margin) / state.tileSize) + state.bounds.minY;

  if (tileX < state.bounds.minX || tileX > state.bounds.maxX || tileY < state.bounds.minY || tileY > state.bounds.maxY) {
    return null;
  }

  return { x: tileX, y: tileY };
}

function getInspectableAtTile(scenario, tile) {
  if (!scenario || !tile) {
    return null;
  }

  const startAnalysis = scenario.sequence.firstLeg.starts.find((analysis) => (
    analysis.start.x === tile.x && analysis.start.y === tile.y
  ));
  if (startAnalysis) {
    return {
      kind: "start",
      key: String(startAnalysis.index)
    };
  }

  const checkpointIndex = scenario.checkpoints.findIndex((checkpoint) => (
    checkpoint.x === tile.x && checkpoint.y === tile.y
  ));
  if (checkpointIndex >= 0) {
    return {
      kind: "checkpoint",
      key: String(checkpointIndex)
    };
  }

  return null;
}

function sameInspection(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.key === right.key);
}

function clearRouteInspection() {
  routeInspectionState = { kind: null, key: null };
}

function getTraceableStartIndices(scenario) {
  return scenario.sequence.firstLeg.starts
    .filter((entry) => entry.reachable && entry.fullCourseRoute)
    .map((entry) => entry.index);
}

function toggleTraceStart(startIndex) {
  const next = new Set(traceSelectionState.startIndices);
  if (next.has(startIndex)) next.delete(startIndex);
  else next.add(startIndex);
  traceSelectionState = { startIndices: next };
}

function selectAllTraceStarts(scenario) {
  traceSelectionState = { startIndices: new Set(getTraceableStartIndices(scenario)) };
}

function clearTraceStarts() {
  traceSelectionState = { startIndices: new Set() };
}

function applyRouteInspection(inspection) {
  if (!inspection) {
    clearRouteInspection();
    return;
  }
  if (inspection.kind === "start") {
    const startIndex = Number(inspection.key);
    toggleTraceStart(startIndex);
    routeInspectionState = { kind: "start", key: String(startIndex) };
    return;
  }
  routeInspectionState = sameInspection(routeInspectionState, inspection)
    ? { kind: null, key: null }
    : inspection;
}

function getSelectedTraceRoutes(scenario, selectedLegIndex) {
  const routes = [];
  for (const startIndex of traceSelectionState.startIndices) {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const fullRoute = startAnalysis?.fullCourseRoute;
    if (!fullRoute) continue;
    const route = selectedLegIndex === null ? fullRoute : fullRoute.legRoutes?.[selectedLegIndex];
    if (!route) continue;
    routes.push({ ...route, startIndex, traceIndex: startIndex });
  }
  return routes;
}

function tileTouchesVisibleTrace(scenario, tile, selectedLegIndex) {
  if (!tile) return false;
  return getSelectedTraceRoutes(scenario, selectedLegIndex).some((route) =>
    (route.path || []).some((point) => point.x === tile.x && point.y === tile.y)
  );
}


function getScenarioRenderState(scenario) {
  const legSelect = document.getElementById("leg-select");
  const devViewEnabled = isDevViewEnabled();
  const selectedLegValue = devViewEnabled ? (legSelect?.value ?? "all") : "all";
  const selectedLegIndex = selectedLegValue === "all" ? null : Number(selectedLegValue);
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const goal = selectedLegIndex === null
    ? playableCheckpoints.at(-1) ?? playableCheckpoints[0]
    : playableCheckpoints[selectedLegIndex] ?? playableCheckpoints[0];
  const renderAnalysis = devViewEnabled ? { routes: getSelectedTraceRoutes(scenario, selectedLegIndex) } : null;
  const boardViewMode = getBoardViewMode();
  const iconBoardView = boardViewMode === BOARD_VIEW_MODES.icons;
  const metricUnusableStartIndices = scenario.competitiveMode
    ? []
    : scenario.sequence.firstLeg.starts
      .filter((startAnalysis) => !scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index))
      .map((startAnalysis) => startAnalysis.index);
  const competitiveDevBlockIndices = (
    devViewEnabled && scenario.competitiveMode
      ? (scenario.startDisposition?.competitiveStrategicBlockIndices ?? [])
      : []
  );
  const unusableStartIndices = [...new Set([
    ...(scenario.blockedStartIndices ?? []),
    ...metricUnusableStartIndices,
    ...competitiveDevBlockIndices
  ])].sort((left, right) => left - right);
  // Number the physical start field, not merely the analyzed subset. Accepted
  // courses resolve every physical start to available or blocked, so Dev View
  // never needs the old unlabeled "S" fallback.
  const startNumberByKey = new Map(scenario.activeStarts.map((start, index) => [
    `${start.x},${start.y}`, index + 1
  ]));
  const energyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.energyCost
  ]));
  const lateEnergyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateEnergyCost
  ]));
  const earlyUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.earlyUnavailable ?? false
  ]));
  const lateUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateUnavailable ?? false
  ]));
  const selectedStartKeys = new Set(
    scenario.sequence.firstLeg.starts
      .filter((startAnalysis) => traceSelectionState.startIndices.has(startAnalysis.index))
      .map((startAnalysis) => `${startAnalysis.start.x},${startAnalysis.start.y}`)
  );
  const startLabels = devViewEnabled
    ? scenario.activeStarts.map((start) => startNumberByKey.get(`${start.x},${start.y}`) ?? "")
    : [];
  const selectedStartIndices = devViewEnabled
    ? scenario.activeStarts
      .map((start, index) => selectedStartKeys.has(`${start.x},${start.y}`) ? index : null)
      .filter((index) => index !== null)
    : [];
  const startEnergyPricing = Boolean(scenario.payToWin || scenario.subsidizedStarts);
  const startEnergyCosts = startEnergyPricing
    ? scenario.activeStarts.map((start) => energyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startLateEnergyCosts = startEnergyPricing
    ? scenario.activeStarts.map((start) => lateEnergyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startEarlyUnavailable = startEnergyPricing
    ? scenario.activeStarts.map((start) => earlyUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];
  const startLateUnavailable = startEnergyPricing
    ? scenario.activeStarts.map((start) => lateUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];

  return {
    devViewEnabled, goal, iconBoardView, renderAnalysis, selectedLegIndex,
    startLabels, selectedStartIndices, startEnergyCosts, startLateEnergyCosts,
    startEarlyUnavailable, startLateUnavailable,
    startEnergyIsSubsidy: Boolean(scenario.subsidizedStarts), unusableStartIndices
  };
}

function drawScenarioCanvas(scenario, options = {}) {
  if (!options.skipBlankCheck) {
    lastRenderDiagnostics.blankFallbackTriggered = false;
  }
  const {
    devViewEnabled,
    goal,
    iconBoardView,
    renderAnalysis,
    selectedLegIndex,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    startEnergyIsSubsidy,
    unusableStartIndices
  } = getScenarioRenderState(scenario);
  const canvas = document.getElementById("canvas");
  const renderOptions = {
    placements: scenario.placements,
    goal,
    analysis: renderAnalysis,
    goals: getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots),
    virtualBotEntry: scenario.virtualBots ? scenario.virtualBotEntry : null,
    reentryMarkers: hasMovingTargetsEffect(scenario) ? scenario.movingTargetReentryMarkers : [],
    // Moving-target path/timeline data is a Dev-only visualization. Normal view
    // keeps only the playable checkpoint plus its entry/re-entry marker; do not
    // even pass hidden path coordinates to the renderer, since they otherwise
    // expand canvas bounds despite the path itself being visually suppressed.
    movingTargetTimelines: devViewEnabled && hasMovingTargetsEffect(scenario)
      ? scenario.movingTargetTimelines
      : [],
    showMovingTargetDetails: devViewEnabled,
    showMovingTargetHits: devViewEnabled,
    starts: scenario.virtualBots ? [] : scenario.activeStarts,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    startEnergyIsSubsidy,
    rebootTokens: scenario.rebootTokens,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    edgeOutlineColor: scenario.lessDeadlyGame ? "#f2c230" : null,
    showBoardLabels: false,
    showStartFacing: devViewEnabled,
    showAllStartMarkers: devViewEnabled && !scenario.virtualBots,
    noDockStarts: Boolean(scenario.noDocks),
    hideUnusableStarts: Boolean(scenario.noDocks && !devViewEnabled && !(scenario.payToWin || scenario.subsidizedStarts)),
    showWalls: iconBoardView || devViewEnabled,
    showPieceImages: !iconBoardView,
    showFootprints: true,
    showFeatureIcons: iconBoardView
  };

  render(canvas, scenario.pieceMap, scenario.imageMap, renderOptions);

  if (!options.skipBlankCheck && !canvasHasVisibleCourse(canvas)) {
    render(canvas, scenario.pieceMap, scenario.imageMap, {
      ...renderOptions,
      showBoardLabels: false,
      showStartFacing: true,
      showWalls: true,
      showPieceImages: false,
      showFeatureIcons: true
    });

    if (!canvasHasVisibleCourse(canvas)) {
      console.warn("Scenario rendered blank", {
        preferences: scenario.preferences,
        placements: scenario.placements,
        checkpoints: scenario.checkpoints,
        boardCount: scenario.boardCount
      });
      lastRenderDiagnostics.blankFallbackTriggered = true;
      drawCanvasFailureNotice(canvas, "The generated course data could not be drawn to the board canvas.");
    }
  }

  return { devViewEnabled, selectedLegIndex };
}

function ensureScenarioAnimationLoop() {
  if (scenarioAnimationFrameId !== null) {
    return;
  }

  const tick = () => {
    scenarioAnimationFrameId = requestAnimationFrame(tick);
    if (!currentScenario || document.hidden || isGenerating) {
      return;
    }
    const now = performance.now();
    if (now - lastScenarioRenderTime < SCENARIO_RENDER_INTERVAL_MS) {
      return;
    }
    lastScenarioRenderTime = now;
    drawScenarioCanvas(currentScenario, { skipBlankCheck: true });
  };

  scenarioAnimationFrameId = requestAnimationFrame(tick);
}

function ensureCourseEvaluationReportElement() {
  const panel = document.getElementById("report-panel");
  const exact = document.getElementById("report");
  if (exact && (!panel || panel.contains(exact))) return exact;
  if (!panel) return exact ?? null;

  // Host markup has changed over time. Reuse a plausible existing report surface
  // inside the Dev panel if one exists; otherwise create the Course Summary body
  // ourselves. Do not accidentally write into an unrelated legacy #report node.
  const existing = panel.querySelector(
    "[data-course-evaluation-report], #course-evaluation-report, #course-summary-report, .course-evaluation-report, .course-summary-report, textarea, pre"
  );
  if (existing) {
    if (!existing.id) {
      existing.id = exact ? "course-evaluation-report" : "report";
    }
    existing.dataset.courseEvaluationReport = "true";
    return existing;
  }

  const reportEl = document.createElement("pre");
  reportEl.id = exact ? "course-evaluation-report" : "report";
  reportEl.dataset.courseEvaluationReport = "true";
  reportEl.className = "course-evaluation-report";
  reportEl.style.whiteSpace = "pre-wrap";
  reportEl.style.overflowWrap = "anywhere";
  reportEl.style.maxHeight = "32rem";
  reportEl.style.overflow = "auto";
  reportEl.style.margin = "0.75rem 0";
  panel.appendChild(reportEl);
  return reportEl;
}

function setCourseEvaluationReportText(text) {
  const reportEl = ensureCourseEvaluationReportElement();
  if (!reportEl) return;
  const value = String(text ?? "");
  // Some host versions render the report as a textarea/form control. Updating only
  // textContent changes the DOM child text but leaves the visible control value
  // blank. Keep both representations synchronized so the on-screen summary and
  // copy controls always see the same report.
  if ("value" in reportEl) {
    reportEl.value = value;
  }
  reportEl.textContent = value;
}

function getCourseEvaluationReportText() {
  const reportEl = ensureCourseEvaluationReportElement();
  if (!reportEl) return "";
  if ("value" in reportEl && typeof reportEl.value === "string" && reportEl.value) {
    return reportEl.value;
  }
  return reportEl.textContent ?? "";
}

function renderScenario(scenario) {
  updateDevView();
  updateSetupSummary(scenario);
  updateRulesNote(scenario);
  updateLegend(scenario);
  const legSelect = document.getElementById("leg-select");
  const legOptions = scenario.sequence.legs.map((leg, index) => ({
    value: String(index),
    label: index === 0 ? (scenario.virtualBots ? "Entry → 1" : "Start → 1") : `${leg.from} → ${leg.to}`
  }));
  const previousLegValue = legSelect?.value ?? "all";
  if (legSelect) {
    legSelect.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All legs";
    legSelect.appendChild(all);
    legOptions.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      legSelect.appendChild(el);
    });
    legSelect.value = previousLegValue === "all" || legOptions.some((o) => o.value === previousLegValue)
      ? previousLegValue
      : "all";
  }
  const renderState = drawScenarioCanvas(scenario);
  updateInspectionDetail(scenario, renderState.selectedLegIndex);
  updateDevStartResidualTable(scenario);
  setCourseEvaluationReportText(
    buildScenarioReport(scenario, renderState.selectedLegIndex)
  );
}

function validateSelectedInventory(assets, preferences) {
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(assets.pieceMap, expansionIds);
  const virtualBotsState = getVariantPreferenceState(preferences, "virtualBots");
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessSetupAvailable = virtualBotsState !== "off" || noDocksState !== "off";
  if (!availableDockIds.length && !docklessSetupAvailable) {
    return "The selected sets contain no docking bay. Enable No Docks or Virtual Bots, or select a set with a docking bay.";
  }
  const docklessSetupForced = virtualBotsState === "forced" || noDocksState === "forced";
  const docklessSetupPermitted = virtualBotsState !== "off" || noDocksState !== "off";
  if (!docklessSetupPermitted && availableDockIds.length && !canSupportRequiredDockStarts(availableDockIds, assets.pieceMap, preferences)) {
    const requiredStarts = getRequiredDockStartCount(preferences);
    const dockCapacity = getMaximumAvailableDockStartCapacity(availableDockIds, assets.pieceMap, preferences);
    return `The selected dock settings provide at most ${dockCapacity} starting spaces for this setup (${requiredStarts} needed). Allow Extra Docks or No Docks, reduce the player count, or select sets with more dock capacity.`;
  }
  if (!docklessSetupForced && availableDockIds.length && !getDockConfigurations(availableDockIds, assets.pieceMap, preferences).length && !docklessSetupPermitted) {
    return getExtraDockModeState(preferences) === "forced"
      ? "Extra Docks is required, but the selected sets do not provide a valid multiple-dock setup."
      : "The selected sets do not provide a valid docking bay setup for these rules.";
  }

  const availableMainBoardIds = getAvailableMainBoardIds(assets.pieceMap, expansionIds);
  if (!availableMainBoardIds.length) {
    return "The selected sets contain no supported main boards for course generation yet.";
  }

  return null;
}

function getFlagRetryBudget(preferences = {}, remainingEvaluations = 1) {
  // Calibration observations remain one-proposal samples. Production retries are
  // mode-driven, not target-driven: target fit is now handled by staged
  // calibration ranking rather than Easy/Hard or Short/Long retry tables.
  if (preferences.calibrationSingleCheckpointProposal) {
    return 1;
  }
  const retriesByMode = {
    fastest: 2,
    fast: 3,
    standard: 4,
    balanced: 5,
    thorough: 6
  };
  const retries = retriesByMode[normalizeGenerationMode(preferences.generationMode)] ?? 4;
  return Math.max(1, Math.min(remainingEvaluations, retries));
}

function getFlagRetryStallLimit(preferences = {}) {
  const limitsByMode = {
    fastest: 2,
    fast: 2,
    standard: 2,
    balanced: 3,
    thorough: 3
  };
  return limitsByMode[normalizeGenerationMode(preferences.generationMode)] ?? 2;
}

async function createRandomCandidate(assets, preferences, attempt = 1, remainingEvaluations = 1, onEvaluation = null, onStage = null, shouldStopBeforeRetry = null, shouldStopDuringAnalysis = null) {
  if (preferences?.difficulty === "any" || preferences?.length === "any") {
    throw new Error("Generation requires concrete difficulty and length targets; resolve Any before construction.");
  }

  const { pieceMap } = assets;
  let calibrationConstructionSnapshot = null;
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(pieceMap, expansionIds);
  const variantBundle = chooseVariantBundle(preferences, { pieceMap });
  const {
    actFast,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    extraDocks,
    noDocks,
    sandwichedDock,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing
  } = variantBundle;
  const startEnergyPricing = Boolean(payToWin || subsidizedStarts);
  let effectiveNoDocks = noDocks;
  if (effectiveNoDocks) {
    variantBundle.extraDocks = false;
    variantBundle.sandwichedDock = false;
  }
  const noDocksPreferenceState = getVariantPreferenceState(preferences, "noDocks");
  if (!availableDockIds.length && !virtualBots && noDocksPreferenceState !== "off") {
    effectiveNoDocks = true;
    variantBundle.noDocks = true;
  }
  if (competitiveMode && !virtualBots && !effectiveNoDocks && !sandwichedDock) {
    const competitiveDockPreferences = {
      ...preferences,
      playerCount: preferences.playerCount,
      competitiveMode: true,
      extraDocks: Boolean(variantBundle.extraDocks)
    };
    if (
      !canSupportRequiredDockStarts(availableDockIds, pieceMap, competitiveDockPreferences) &&
      noDocksPreferenceState !== "off"
    ) {
      effectiveNoDocks = true;
      variantBundle.noDocks = true;
      variantBundle.extraDocks = false;
    }
  }
  const actFastMode = actFast ? chooseActFastMode(preferences) : null;
  const generationPreferences = applyVariantGenerationOptions({
    ...preferences,
    generationAttempt: attempt,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    extraDocks,
    noDocks: effectiveNoDocks,
    sandwichedDock,
    virtualBots
  }, variantBundle);
  const generationStageContext = {
    movingTargets: Boolean(movingTargets),
    virtualBots: Boolean(virtualBots),
    competitiveMode: Boolean(competitiveMode),
    payToWin: Boolean(payToWin),
    subsidizedStarts: Boolean(subsidizedStarts),
    extraDocks: Boolean(extraDocks),
    sandwichedDock: Boolean(sandwichedDock),
    recoveryRule: recoveryRule ?? null,
    classicSharedDeck: Boolean(classicSharedDeck),
    lessForeshadowing: Boolean(lessForeshadowing),
    factoryRejects: Boolean(factoryRejects)
  };
  const reportStage = async (message, localEvaluation = 1) => {
    if (onStage) {
      await onStage(message, localEvaluation, generationStageContext);
    }
  };

  await reportStage("Building board and dock layout", 1);

  const docklessSetup = virtualBots || effectiveNoDocks;
  const dockConfigurations = docklessSetup ? [] : weightedOrder(
    getDockConfigurations(availableDockIds, pieceMap, generationPreferences).map((dockIds) => (
      [...dockIds].sort((left, right) => getDockSelectionWeight(pieceMap[right], generationPreferences) - getDockSelectionWeight(pieceMap[left], generationPreferences))
    )),
    (dockIds) => dockIds.reduce((sum, dockId) => sum + getDockSelectionWeight(pieceMap[dockId], generationPreferences), 0)
  );
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const orderedDockIds = weightedOrder(
    availableDockIds,
    (dockId) => getDockSelectionWeight(pieceMap[dockId], generationPreferences)
  );

  const boardPlanning = getBoardPlacementPlanningContext(
    pieceMap,
    expansionIds,
    generationPreferences
  );
  const sharedConstructionGuidancePlan = getCalibratedConstructionPlan(
    boardPlanning.maxBoards,
    boardPlanning.hasLargeBoards,
    generationPreferences,
    pieceMap,
    assets.constructionGuidance
  );
  const explicitCalibrationFlagCount = Number(generationPreferences.calibrationFlagCount);
  const planningFlagCount = Number.isInteger(explicitCalibrationFlagCount) && explicitCalibrationFlagCount > 0
    ? explicitCalibrationFlagCount
    : Number.isInteger(Number(sharedConstructionGuidancePlan?.flagCount))
      ? Number(sharedConstructionGuidancePlan.flagCount)
      : neutralFlagCount(6);

  const buildOneBoardDockProposal = () => {
    let proposalBoardLayout = null;
    let proposalDockPlacements = [];
    let proposalDockSummaries = [];

    if (docklessSetup) {
      const layoutAnchors = orderedDockIds.length ? orderedDockIds : [null];
      for (const candidateDockId of layoutAnchors) {
        const candidateBoardLayout = createBoardPlacements(
          pieceMap,
          generationPreferences,
          expansionIds,
          candidateDockId,
          assets.constructionGuidance,
          sharedConstructionGuidancePlan
        );
        if (candidateBoardLayout) {
          proposalBoardLayout = candidateBoardLayout;
          break;
        }
      }
    } else {
      const configuredDockSets = sandwichedDock
        ? orderedDockIds.map((dockId) => [dockId])
        : (dockConfigurations.length ? dockConfigurations : orderedDockIds.map((dockId) => [dockId]));

      for (const dockConfiguration of configuredDockSets) {
        // Preserve the established dock-placement semantics. Calibration ranks
        // complete cheap board+dock proposals after they are structurally valid.
        if (!sandwichedDock || dockConfiguration.length === 1) {
          const candidateDockId = dockConfiguration[0];
          const candidateBoardLayout = createBoardPlacements(
            pieceMap,
            generationPreferences,
            expansionIds,
            candidateDockId,
            assets.constructionGuidance,
            sharedConstructionGuidancePlan
          );
          if (!candidateBoardLayout) continue;

          const candidateDockPlacements = [];
          let validDockSet = true;
          for (const dockId of dockConfiguration) {
            const flipOrder = shuffle([false, true]);
            let placedDock = null;
            for (const candidateFlip of flipOrder) {
              if (sandwichedDock && candidateDockPlacements.length === 0) {
                placedDock = findBridgeDockPlacement(
                  candidateBoardLayout.placements,
                  pieceMap,
                  dockId,
                  candidateFlip
                );
                if (
                  placedDock &&
                  generationPreferences.alignedLayout &&
                  !hasAlignedDockFrontage(candidateBoardLayout.placements, pieceMap, placedDock.dockPlacement)
                ) {
                  placedDock = null;
                }
              } else {
                placedDock = createDockPlacement(
                  [...candidateBoardLayout.placements, ...candidateDockPlacements],
                  pieceMap,
                  dockId,
                  candidateFlip,
                  { alignedLayout: generationPreferences.alignedLayout, allowBridgePlacement: true }
                );
              }
              if (placedDock) {
                candidateDockPlacements.push(placedDock.dockPlacement);
                break;
              }
            }
            if (!placedDock) { validDockSet = false; break; }
          }
          if (!validDockSet || !candidateDockPlacements.length) continue;
          proposalBoardLayout = candidateBoardLayout;
          proposalDockPlacements = candidateDockPlacements;
          proposalDockSummaries = buildDockSummaries(
            proposalBoardLayout.placements,
            proposalDockPlacements,
            pieceMap
          );
          break;
        }
      }
    }

    if (!proposalBoardLayout) return null;
    const prediction = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "boardsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: proposalBoardLayout.placements.length,
        flagCount: planningFlagCount,
        boardPlacements: proposalBoardLayout.placements,
        dockPlacements: docklessSetup ? [] : proposalDockPlacements,
        overlayPlacements: []
      }
    );
    return {
      boardLayout: proposalBoardLayout,
      dockPlacements: proposalDockPlacements,
      dockSummaries: proposalDockSummaries,
      prediction
    };
  };

  const boardProposalCount = getConstructionGuidanceModePolicy(
    generationPreferences
  ).boardProposalCount;
  const boardProposals = [];
  const seenBoardProposalKeys = new Set();
  for (let proposalIndex = 0; proposalIndex < boardProposalCount; proposalIndex += 1) {
    const proposal = buildOneBoardDockProposal();
    if (!proposal) continue;
    const key = JSON.stringify({
      boards: proposal.boardLayout.placements.map((placement) => [
        placement.pieceId,
        placement.x,
        placement.y,
        placement.rotation
      ]),
      docks: proposal.dockPlacements.map((placement) => [
        placement.pieceId,
        placement.x,
        placement.y,
        placement.rotation,
        placement.flipped
      ])
    });
    if (seenBoardProposalKeys.has(key)) continue;
    seenBoardProposalKeys.add(key);
    boardProposals.push(proposal);
  }

  const selectedBoardProposal = sampleConstructionGuidanceRankedCandidate(
    boardProposals,
    generationPreferences,
    { predictionKey: "prediction" }
  );
  let boardLayout = selectedBoardProposal?.boardLayout ?? null;
  let dockPlacements = selectedBoardProposal?.dockPlacements ?? [];

  if (selectedBoardProposal?.prediction && boardProposals.length > 1) {
    await reportStage(
      `Choosing board layout — calibration ranked ${boardProposals.length} proposals; ` +
      `selected length ${selectedBoardProposal.prediction.length.raw}, ` +
      `difficulty ${selectedBoardProposal.prediction.difficulty.raw}, ` +
      `~${selectedBoardProposal.prediction.routeCost.predictedExpansions} route expansions`,
      1
    );
  }

  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const courseDockPlacements = docklessSetup ? [] : dockPlacements;
  const overlayPlacements = chooseOverlayPlacements(boardLayout.placements, courseDockPlacements, pieceMap, generationPreferences, expansionIds);
  const calibrationBoardOverlayCount = generationPreferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(generationPreferences.calibrationBoardOverlayCount);
  if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount > 0) {
    const placedBoardOverlayCount = overlayPlacements.filter((placement) => (
      !isMiniOverlayPiece(pieceMap[placement.pieceId])
    )).length;
    if (placedBoardOverlayCount < calibrationBoardOverlayCount) {
      return {
        scenario: null,
        evaluationsUsed: 1,
        rejectionEvents: [{
          evaluation: 0,
          category: "overlay-placement",
          reason: `Calibration requested ${calibrationBoardOverlayCount} structural board overlay(s), but this construction could place ${placedBoardOverlayCount}.`
        }]
      };
    }
  }
  const placements = [
    ...boardLayout.placements,
    ...courseDockPlacements,
    ...overlayPlacements
  ];
  const boardRects = buildBoardRects(boardLayout.placements, pieceMap);

  clearAnalysisCachesSafe();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const noDockSelection = effectiveNoDocks
    ? chooseNoDockStartingZones(
      boardRects,
      tileMap,
      getRequiredDockStartCount({ ...generationPreferences, competitiveMode }),
      {
        ...generationPreferences,
        playerCount: preferences.playerCount,
        competitiveMode,
        payToWin,
        extraDocksState: "off"
      }
    )
    : null;
  if (effectiveNoDocks && !noDockSelection) {
    return { scenario: null, evaluationsUsed: 1 };
  }
  const noDockEdges = noDockSelection?.edges ?? [];
  const noDockEdge = noDockEdges[0] ?? null;
  const noDockStarts = noDockSelection?.starts ?? [];
  const setupStarts = effectiveNoDocks ? noDockStarts : starts;
  const flagCandidates = getFlagCandidates(placements, pieceMap);
  const movingTargetsForced = isVariantForced(preferences, "movingTargets");
  const movingTargetTraceCache = movingTargets ? new Map() : null;
  const movingCheckpointCandidateCount = movingTargets
    ? flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, generationPreferences).moving).length
    : 0;

  await reportStage("Preparing checkpoint candidates", 1);

  if (movingTargetsForced && movingCheckpointCandidateCount === 0) {
    return {
      scenario: null,
      evaluationsUsed: 1
    };
  }

  const calibrationFlagCount = Number(generationPreferences.calibrationFlagCount);
  const plannedFlagCount = Number(boardLayout.constructionGuidancePlan?.flagCount);
  const usePlannedFlagCount = (
    Number.isInteger(plannedFlagCount) &&
    plannedFlagCount > 0 &&
    plannedFlagCount <= flagCandidates.length
  );
  const flagCount = Math.min(
    Number.isInteger(calibrationFlagCount) && calibrationFlagCount > 0
      ? calibrationFlagCount
      : usePlannedFlagCount
        ? plannedFlagCount
        : neutralFlagCount(flagCandidates.length),
    flagCandidates.length
  );
  const constructionGuidancePrior = usePlannedFlagCount && flagCount === plannedFlagCount
    ? { ...boardLayout.constructionGuidancePlan }
    : null;
  let boardsKnownGuidance = predictConstructionGuidanceStage(
    assets.constructionGuidance,
    "boardsKnown",
    {
      preferences: generationPreferences,
      pieceMap,
      boardCount: boardLayout.placements.length,
      flagCount,
      boardPlacements: boardLayout.placements,
      dockPlacements: courseDockPlacements,
      overlayPlacements
    }
  );
  const retryBudget = getFlagRetryBudget(generationPreferences, remainingEvaluations);
  const stallLimit = getFlagRetryStallLimit(generationPreferences);
  let evaluationsUsed = 0;
  let bestScenario = null;
  let staleRetries = 0;
  const rejectionEvents = [];
  let currentConstructionFingerprint = null;
  const recordRejectionEvent = (telemetryBefore, category, reason, details = null) => {
    const routeDelta = summarizeRouteSearchDelta(
      telemetryBefore,
      getAnalysisTelemetrySnapshotSafe()
    );
    rejectionEvents.push({
      evaluation: evaluationsUsed,
      category: category || "other",
      reason: reason || category || "candidate rejected",
      routeSearches: routeDelta.searches,
      routeExpansions: routeDelta.expansions,
      routeSearchMs: routeDelta.durationMs,
      cappedRouteSearches: routeDelta.capped,
      contextualSearches: routeDelta.contextualSearches,
      contextualExpansions: routeDelta.contextualExpansions,
      contextualDurationMs: routeDelta.contextualDurationMs,
      contextualProfile: routeDelta.contextualProfile,
      routeSearchTotalsByKind: routeDelta.totalsByKind,
      constructionFingerprint: currentConstructionFingerprint,
      ...(details ? { diagnostics: details } : {})
    });
  };

  for (let retry = 0; retry < retryBudget; retry += 1) {
    // The generation-level expansion budget is intentionally soft, but a
    // single board candidate can contain several checkpoint-layout retries.
    // Re-check before paying for another full contextual analysis so a viable
    // fallback does not overshoot the budget by an entire retry group.
    if (
      retry > 0 &&
      shouldStopBeforeRetry &&
      shouldStopBeforeRetry({ evaluationsUsed, bestScenario })
    ) {
      break;
    }

    evaluationsUsed += 1;
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      boardLayout.placements,
      courseDockPlacements,
      overlayPlacements,
      []
    );
    if (onEvaluation) {
      await onEvaluation(evaluationsUsed, retryBudget);
    }
    await reportStage(
      retryBudget > 1
        ? `Choosing checkpoints — checkpoint try ${retry + 1} / ${retryBudget}`
        : "Choosing checkpoints",
      evaluationsUsed
    );
    const retryTelemetryBefore = getAnalysisTelemetrySnapshotSafe();
    const checkpointPreferences = {
      ...generationPreferences,
      hazardousFlags,
      movingTargets,
      noDocks: effectiveNoDocks,
      extraDocksState: getVariantPreferenceState(preferences, "extraDocks")
    };
    const checkpointProposalCount = getConstructionGuidanceModePolicy(
      generationPreferences
    ).checkpointProposalCount;
    const checkpointProposals = [];
    const seenCheckpointProposalKeys = new Set();

    for (let proposalIndex = 0; proposalIndex < checkpointProposalCount; proposalIndex += 1) {
      const virtualEntryCandidate = virtualBots
        ? pickVirtualBotEntry(
          flagCandidates,
          tileMap,
          boardLayout.placements,
          pieceMap,
          checkpointPreferences
        )
        : null;
      if (virtualBots && !virtualEntryCandidate) {
        continue;
      }

      const checkpointCandidatePool = virtualEntryCandidate
        ? flagCandidates.filter((candidate) => (
          candidate.x !== virtualEntryCandidate.x ||
          candidate.y !== virtualEntryCandidate.y
        ))
        : flagCandidates;
      const pickedCheckpoints = pickFlags(
        checkpointCandidatePool,
        flagCount,
        boardLayout.placements,
        courseDockPlacements,
        pieceMap,
        virtualBots ? [virtualEntryCandidate] : setupStarts,
        checkpointPreferences
      );
      if (!pickedCheckpoints) continue;

      const virtualEntryDirections = virtualEntryCandidate
        ? getVirtualBotEntryDirections(tileMap, virtualEntryCandidate)
        : [];
      if (virtualBots && !virtualEntryDirections.length) continue;
      const flagZero = virtualBots
        ? {
          ...virtualEntryCandidate,
          id: 0,
          facing: sample(virtualEntryDirections)
        }
        : null;
      const checkpoints = virtualBots
        ? [flagZero, ...pickedCheckpoints]
        : pickedCheckpoints;
      const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
      const activeStarts = virtualBots
        ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
        : filterStartsForGoals(setupStarts, checkpoints);
      const prediction = predictConstructionGuidanceStage(
        assets.constructionGuidance,
        "checkpointsKnown",
        {
          preferences: generationPreferences,
          pieceMap,
          boardCount: boardLayout.placements.length,
          flagCount: playableCheckpoints.length,
          boardPlacements: boardLayout.placements,
          dockPlacements: courseDockPlacements,
          overlayPlacements,
          checkpoints: playableCheckpoints,
          starts: activeStarts,
          tileMap
        }
      );
      const mismatch = getConstructionGuidanceGrossMismatch(
        prediction,
        generationPreferences,
        overlayPlacements
      );
      const key = checkpoints
        .map((checkpoint) => `${checkpoint.x},${checkpoint.y},${checkpoint.facing ?? ""}`)
        .join("|");
      if (seenCheckpointProposalKeys.has(key)) continue;
      seenCheckpointProposalKeys.add(key);
      const spacingExpectation = getCheckpointSpacingExpectationProfile(
        playableCheckpoints,
        activeStarts,
        checkpointPreferences
      );
      checkpointProposals.push({
        flagZero,
        checkpoints,
        playableCheckpoints,
        activeStarts,
        prediction,
        mismatch,
        spacingExpectation
      });
    }

    if (!checkpointProposals.length) {
      recordRejectionEvent(
        retryTelemetryBefore,
        "checkpoint-layout",
        "checkpoint selection produced no valid flag sequence"
      );
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) {
        break;
      }
      continue;
    }

    // Stronger Manhattan spacing remains construction/debug evidence only.
    // Player-facing checkpoint quality is judged later from routed register demand,
    // so technically valid proposals are not preferred or rejected by this geometry.
    const expectationRankingPool = checkpointProposals;
    // Prefer proposals whose full OOF interval can still hit an explicit target.
    // Hidden Any targets are guidance-only and therefore never enter this gate.
    const targetCompatibleCheckpointProposals = expectationRankingPool.filter(
      (proposal) => !proposal.mismatch?.abort
    );
    const checkpointRankingPool = targetCompatibleCheckpointProposals.length
      ? targetCompatibleCheckpointProposals
      : expectationRankingPool;
    const selectedCheckpointProposal = sampleCheckpointProposalWithExpectations(
      checkpointRankingPool,
      generationPreferences,
      false
    );
    if (!selectedCheckpointProposal) {
      staleRetries += 1;
      continue;
    }

    if (selectedCheckpointProposal.prediction && checkpointProposals.length > 1) {
      await reportStage(
        `Choosing checkpoints — calibration ranked ${checkpointProposals.length} proposals; ` +
        `selected length ${selectedCheckpointProposal.prediction.length.raw}, ` +
        `difficulty ${selectedCheckpointProposal.prediction.difficulty.raw}, ` +
        `~${selectedCheckpointProposal.prediction.routeCost.predictedExpansions} route expansions`,
        evaluationsUsed
      );
    }

    const constructionGuidanceMismatch = selectedCheckpointProposal.mismatch ?? {
      abort: false,
      mismatches: []
    };
    const constructionGuidanceExploration = (
      constructionGuidanceMismatch.abort &&
      !generationPreferences.calibrationObserveTargetMisses
    )
      ? generationRandom() <
        getConstructionGuidanceModePolicy(generationPreferences).grossMismatchExplorationRate
      : false;
    if (
      constructionGuidanceMismatch.abort &&
      !constructionGuidanceExploration &&
      !generationPreferences.calibrationObserveTargetMisses
    ) {
      const mismatchText = constructionGuidanceMismatch.mismatches
        .map((entry) => (
          `${entry.metric} ${entry.direction} (pred ${Number(entry.predicted).toFixed(1)}, ` +
          `OOF interval ${Number(entry.predictedLow).toFixed(1)}..${Number(entry.predictedHigh).toFixed(1)})`
        ))
        .join("; ");
      const reason = `calibrated checkpoint guidance is grossly outside the requested target: ${mismatchText}`;
      console.debug(`Early course retry: ${reason}`);
      await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
      recordRejectionEvent(
        retryTelemetryBefore,
        "preflight-target",
        reason,
        {
          targetGate: {
            method: "calibrated-checkpoints-known",
            stage: selectedCheckpointProposal.prediction?.stage ?? null,
            predictedLengthRaw: selectedCheckpointProposal.prediction?.length?.raw ?? null,
            predictedDifficultyRaw: selectedCheckpointProposal.prediction?.difficulty?.raw ?? null,
            lengthInterval: selectedCheckpointProposal.prediction?.length?.interval ?? null,
            difficultyInterval: selectedCheckpointProposal.prediction?.difficulty?.interval ?? null,
            predictedRouteExpansions: selectedCheckpointProposal.prediction?.routeCost?.predictedExpansions ?? null,
            mismatches: constructionGuidanceMismatch.mismatches,
            routePoolSkipped: true
          }
        }
      );
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) break;
      continue;
    }

    const flagZero = selectedCheckpointProposal.flagZero;
    const checkpoints = selectedCheckpointProposal.checkpoints;
    const playableCheckpoints = selectedCheckpointProposal.playableCheckpoints;

    let scenarioBoardPlacements = boardLayout.placements;
    let scenarioDockPlacements = courseDockPlacements;
    let scenarioOverlayPlacements = overlayPlacements;
    let scenarioPlacements = placements;
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      scenarioBoardPlacements,
      scenarioDockPlacements,
      scenarioOverlayPlacements,
      checkpoints
    );
    let scenarioBoardRects = boardRects;
    let scenarioTileMap = tileMap;
    let goalTileMap = scenarioTileMap;
    let activeStarts = selectedCheckpointProposal.activeStarts;

    let checkpointsKnownGuidance = selectedCheckpointProposal.prediction;

    let rebootTokens = [];
    let sequence = null;
    let effectiveVariantBundle = variantBundle;
    let sequenceFailureCategory = "analysis";
    let sequenceFailureReason = "course analysis did not produce a sequence";
    let sequenceFailureDiagnostics = null;
    let coursePreflight = null;

    for (let pass = 0; pass < 4; pass += 1) {
      scenarioPlacements = [
        ...scenarioBoardPlacements,
        ...scenarioDockPlacements,
        ...scenarioOverlayPlacements
      ];
      currentConstructionFingerprint = getCourseConstructionFingerprint(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        scenarioOverlayPlacements,
        checkpoints
      );
      scenarioBoardRects = buildBoardRects(scenarioBoardPlacements, pieceMap);
      const resolved = buildResolvedMap(scenarioPlacements, pieceMap);
      scenarioTileMap = resolved.tileMap;
      rebootTokens = recoveryRule === "reboot_tokens"
        ? placeRebootTokens(scenarioBoardRects, scenarioTileMap, playableCheckpoints, preferences.playerCount)
        : recoveryRule === "home_reboot"
          ? placeHomeRebootTokens(scenarioDockPlacements, pieceMap, resolved.starts, scenarioTileMap, checkpoints, {
            lessDeadlyGame
          })
          : [];
      if (virtualBots && recoveryRule === "reboot_tokens" && flagZero) {
        const entryBoard = scenarioBoardRects.find((rect) => pointOnRect(flagZero, rect));
        if (entryBoard) {
          rebootTokens = rebootTokens.filter((token) => token.boardIndex !== entryBoard.index);
        }
      }
      if (recoveryRule === "home_reboot") {
        const dockCountWithStarts = scenarioDockPlacements.filter((dockPlacement) => (
          resolved.starts.some((start) => pointOnPlacement(start, dockPlacement, pieceMap))
        )).length;
        if (rebootTokens.length < dockCountWithStarts) {
          sequenceFailureCategory = "reboot-layout";
          sequenceFailureReason = "home reboot placement could not cover every dock with starts";
          sequence = null;
          break;
        }
      }
      if (virtualBots) {
        const withFlagZero = applyFlagOverrides(scenarioTileMap, [flagZero], { hazardousFlags, movingTargets: false });
        goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
        goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
      } else {
        goalTileMap = applyFlagOverrides(scenarioTileMap, checkpoints, { hazardousFlags, movingTargets });
      }
      const courseAvailability = applyCourseVariantAvailability(variantBundle, goalTileMap, preferences);
      if (courseAvailability.blockedForced.length) {
        sequenceFailureCategory = "variant-availability";
        sequenceFailureReason = `forced variant unavailable: ${courseAvailability.blockedForced.join(", ")}`;
        sequence = null;
        break;
      }
      effectiveVariantBundle = courseAvailability.variantBundle;
      activeStarts = virtualBots
        ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
        : effectiveNoDocks
          ? filterStartsForGoals(noDockStarts, checkpoints)
          : filterStartsForGoals(resolved.starts, checkpoints);
      if (pass === 0 && generationPreferences.calibrationCaptureEvidence) {
        calibrationConstructionSnapshot = buildCalibrationConstructionSnapshot({
          boardPlacements: scenarioBoardPlacements,
          dockPlacements: scenarioDockPlacements,
          overlayPlacements: scenarioOverlayPlacements,
          checkpoints: playableCheckpoints,
          starts: activeStarts,
          tileMap: scenarioTileMap,
          pieceMap,
          preferences: generationPreferences
        });
      }
      await reportStage(
        `Evaluating starting spaces — pass ${pass + 1} / 4; ${activeStarts.length} start${activeStarts.length === 1 ? "" : "s"} with contextual leg routes`,
        evaluationsUsed
      );
      try {
        // Shared estimate→realize predicate. Route semantics never depend on
        // whether difficulty/length are constrained: Any/Any uses the same Normal
        // physical-estimate -> exact-program realization foundation. The cheap
        // preflight is an audition only and never decides start eligibility here.
        const estimateThenRealizeSharedCandidate = (
          !startEnergyPricing &&
          !virtualBots &&
          !effectiveNoDocks &&
          !sandwichedDock &&
          scenarioDockPlacements.length === 1
        );
        const baseAnalysisOptions = applyVariantAnalysisOptions({
          // Keep resource-economy inputs explicit so future optional rules can
          // vary starting Energy/cards without adding another pricing-only path.
          ...getRouteAnalysisVariantOptions(generationPreferences),
          rebootTokens,
          boardRects: scenarioBoardRects,
          difficulty: generationPreferences.difficulty,
          length: generationPreferences.length,
          generationMode: generationPreferences.generationMode,
          contextualEarlyExit: true
        }, effectiveVariantBundle);
        const indexedActiveStarts = activeStarts.map((start, index) => ({
          ...start,
          analysisIndex: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index
        }));

        // Universal cheap audition: Flag 1 establishes intrinsic start quality,
        // while later legs use only a representative no-traffic sketch. Virtual
        // Bots share one entry, so one representative start is enough here.
        if (playableCheckpoints.length) {
          const preflightStarts = virtualBots
            ? indexedActiveStarts.slice(0, 1)
            : indexedActiveStarts;
          await reportStage(
            `Quick course preflight — ${virtualBots ? "shared entry" : `${preflightStarts.length} starts`}, no traffic`,
            evaluationsUsed
          );
          const preflightTelemetryBefore = getAnalysisTelemetrySnapshotSafe();
          coursePreflight = buildCoursePreflightSequence(
            goalTileMap,
            preflightStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...baseAnalysisOptions,
              ...effectiveVariantBundle,
              competitiveMode,
              payToWin: startEnergyPricing,
              subsidizedStarts,
              virtualBots,
              movingTargets
            }
          );
          coursePreflight.work = compactRouteWork(summarizeRouteSearchDelta(
            preflightTelemetryBefore,
            getAnalysisTelemetrySnapshotSafe()
          ));

          if (!coursePreflight.valid && !estimateThenRealizeSharedCandidate && !competitiveMode && !startEnergyPricing) {
            const reason = `preflight route sketch inconclusive: ${coursePreflight.reason}`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequenceFailureCategory = "preflight-route";
            sequenceFailureReason = reason;
            sequenceFailureDiagnostics = {
              preflight: {
                openingRoutedCount: coursePreflight.openingRoutedCount,
                requiredOpeningCount: coursePreflight.requiredOpeningCount,
                intrinsicPruned: coursePreflight.intrinsicOutliers?.map((entry) => entry.index) ?? [],
                openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
                openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
                work: coursePreflight.work
              }
            };
            sequence = null;
            break;
          }

          coursePreflight.metrics = classifyCoursePreflight(
            coursePreflight,
            {
              ...generationPreferences,
              ...effectiveVariantBundle,
              actFast,
              actFastMode,
              flagCount,
              classicSharedDeck,
              movingTargets
            },
            {
              boardPlacements: scenarioBoardPlacements,
              pieceMap,
              checkpoints: playableCheckpoints,
              tileMap: scenarioTileMap,
              goalTileMap
            }
          );
          const preflightMismatch = getPreflightGrossCourseMismatch(
            coursePreflight.metrics,
            generationPreferences
          );
          if (preflightMismatch.abort && !generationPreferences.calibrationObserveTargetMisses && !estimateThenRealizeSharedCandidate && !competitiveMode && !startEnergyPricing) {
            const mismatchText = formatGrossCourseMismatch(preflightMismatch);
            const reason = `preflight gross mismatch: ${mismatchText}`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequenceFailureCategory = "preflight-profile";
            sequenceFailureReason = reason;
            sequenceFailureDiagnostics = {
              preflight: {
                openingRoutedCount: coursePreflight.openingRoutedCount,
                requiredOpeningCount: coursePreflight.requiredOpeningCount,
                intrinsicPruned: coursePreflight.intrinsicOutliers?.map((entry) => entry.index) ?? [],
                openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
                openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
                difficultyRaw: coursePreflight.metrics?.difficultyRaw ?? null,
                lengthRaw: coursePreflight.metrics?.lengthRaw ?? null,
                work: coursePreflight.work
              }
            };
            sequence = null;
            break;
          }
        } else {
          coursePreflight = null;
        }

        const preflightExcludedIndices = (estimateThenRealizeSharedCandidate || competitiveMode || startEnergyPricing)
          ? new Set()
          : (coursePreflight?.excludedIndices ?? new Set());
        // Normal, Competitive, and priced starts never consume preflight outliers
        // as eligibility. Competitive must preserve every physical start for blocking;
        // priced starts must preserve the full field until downstream pricing.
        const openingSeedAnalyses = (coursePreflight?.opening?.starts ?? []).filter((entry) => (
          entry.reachable && entry.selectedRoute
        ));
        const routeAwareBatteryScoringOptions = buildRouteAwareBatteryScoringOptions(
          coursePreflight,
          { ...baseAnalysisOptions, ...effectiveVariantBundle }
        );
        const detailedSearchProfiling = Boolean(
          isDevViewEnabled() && Number.isInteger(devFrozenGenerationSeed)
        );
        const generationMode = normalizeGenerationMode(baseAnalysisOptions.generationMode);
        const generationModeProfile = getGenerationModeProfile({ generationMode });
        const devRouteModelOverrideActive = isDevRouteModelOverrideActive();
        const devTrafficEnabled = isDevFastTrafficEnabled();
        const devAlternatesEnabled = isDevFastAlternatesEnabled();
        const modeTrafficEnabled = Boolean(generationModeProfile.trafficEnabled);
        // v35a Dev semantics: Dev View is observational. Only the explicit
        // current-mode override changes traffic behavior for the next generation.
        // The two subordinate controls override traffic scoring and traffic-driven
        // alternate discovery while all other selected-mode budgets remain intact.
        const effectiveTrafficEnabled = devRouteModelOverrideActive
          ? devTrafficEnabled
          : modeTrafficEnabled;
        const effectiveTrafficFeedbackEnabled = Boolean(
          effectiveTrafficEnabled && generationModeProfile.trafficEpochs > 0
        );
        const effectiveTrafficDrivenAlternates = Boolean(
          effectiveTrafficFeedbackEnabled && (
            devRouteModelOverrideActive ? devAlternatesEnabled : true
          )
        );
        // The old up-front alternate breadth model is intentionally not controlled
        // by the Dev checkbox anymore. Gameplay alternatives now come from traffic
        // demand; keeping legacy breadth off gives the three clean benchmark states.
        const productionAnalysisOptions = {
          ...baseAnalysisOptions,
          ...routeAwareBatteryScoringOptions,
          // v35 mode contract. All modes share one exact Normal model. Modes vary
          // only the optional evidence/search effort around it. Balanced/Thorough
          // may explore some high raw congestion beyond Standard's confidence
          // horizon, but final traffic scoring remains identical.
          contextualFastCardState: true,
          contextualEstimatedEnergyGuidance: true,
          fullCourseAnalyzer: typeof shouldStopDuringAnalysis === "function"
            ? analyzeFullCourseCooperativeSafe
            : analyzeFullCourse,
          cooperativeYield: typeof shouldStopDuringAnalysis === "function" ? nextFrame : null,
          shouldStopRequested: typeof shouldStopDuringAnalysis === "function"
            ? shouldStopDuringAnalysis
            : () => false,
          fastBaselineTrafficEnabled: effectiveTrafficEnabled,
          modeTrafficEnabled,
          trafficEnabledOverride: effectiveTrafficEnabled,
          contextualTrafficFeedbackEnabled: effectiveTrafficFeedbackEnabled,
          contextualTrafficDrivenAlternates: effectiveTrafficDrivenAlternates,
          contextualTrafficEpochs: effectiveTrafficFeedbackEnabled
            ? generationModeProfile.trafficEpochs
            : 0,
          contextualTrafficAlternateDemandThreshold:
            NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
          contextualTrafficAlternateMinGain:
            NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
          contextualTrafficAlternateMaxNewSearchesPerEpoch:
            generationModeProfile.trafficAlternateMaxNewSearchesPerEpoch,
          contextualTrafficAlternateExpansions:
            generationModeProfile.trafficAlternateExpansions,
          contextualTrafficAlternateMaxActions:
            generationModeProfile.trafficAlternateMaxActions,
          contextualTrafficAlternateCachedProbeMargin:
            generationModeProfile.trafficAlternateCachedProbeMargin,
          contextualTrafficAlternateCachedProbeMaxSimilarity:
            generationModeProfile.trafficAlternateCachedProbeMaxSimilarity,
          contextualTrafficAlternateLegsPerStart:
            generationModeProfile.trafficAlternateLegsPerStart,
          contextualTrafficExplorationUncertaintyShare:
            generationModeProfile.trafficExplorationUncertaintyShare,
          contextualTrafficExplorationConfidenceFloor:
            generationModeProfile.trafficExplorationConfidenceFloor,
          // Confidence never weakens the representative primary route. It only
          // scales the effort spent on optional traffic alternatives.
          contextualTrafficAlternateUncertaintyEffortFloor:
            generationModeProfile.trafficAlternateUncertaintyEffortFloor,
          contextualTrafficAlternateUncertaintyEffortExponent:
            generationModeProfile.trafficAlternateUncertaintyEffortExponent,
          skipTraffic: !effectiveTrafficEnabled,
          skipFullCourseTraffic: !effectiveTrafficEnabled,
          // Legacy up-front retention stays disabled. Traffic-driven alternates use
          // the arrival-class witness cache and bounded on-demand leg searches.
          contextualTrafficAlternativeRetention: false,
          contextualOpeningExpansions: 650,
          contextualLaterExpansions: 550,
          contextualLegMaxActions: 30,
          // The uncertainty horizon only controls optional breadth. Literal
          // programming-card depletion stays exact; the fast baseline deliberately
          // keeps Energy as route scoring rather than another dominance dimension.
          contextualUncertaintyBreadth: true,
          // Detailed per-block performance.now() timing is useful for a frozen
          // diagnostic run but should not tax ordinary generation.
          contextualDetailedProfiling: detailedSearchProfiling,
          // The full dominance projection walks every retained search key again
          // after each search. We already established the physical/program split;
          // keep it off in routine frozen-seed performance tests so diagnostics do
          // not distort generation time. It can still be enabled explicitly by a
          // dedicated diagnostic caller.
          contextualDominanceKeyProfiling: false
        };

        const sharedEstimateThenRealizeRouting = estimateThenRealizeSharedCandidate;

        // v37 priced-start semantics: Pay to Win and Subsidized Starts now use the
        // same all-start route foundation as Normal/Competitive. The universal
        // preflight remains an audition only; no bounded shortlist may silently
        // remove a physical starting space before authoritative full-course routing.
        const analysisStarts = indexedActiveStarts;

        // Shared route foundation: do not quality-prune Normal or Competitive from
        // the cheap Flag-1 sketch. On the estimate→realize path every structural
        // start first receives a complete physical course estimate; only afterward
        // is that route subjected to exact rolling-card realization. Setup-specific
        // balance/pricing interpretation happens after those milestones.
        const detailedStarts = analysisStarts;
        if (
          pass === 0 &&
          sandwichedDock &&
          !virtualBots &&
          scenarioDockPlacements.length > 1 &&
          playableCheckpoints.length
        ) {
          await reportStage(
            `Screening multiple-dock opening routes — ${scenarioDockPlacements.length} docks`,
            evaluationsUsed
          );
          const sandwichPreflight = screenSandwichedExtraDockOpening(
            goalTileMap,
            activeStarts,
            playableCheckpoints[0],
            scenarioDockPlacements,
            pieceMap,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              movingTargets
            }
          );
          if (!sandwichPreflight.valid) {
            const reason = `sandwiched extra-dock opening screen failed: ${sandwichPreflight.reachable}/${preferences.playerCount} quick routes across ${sandwichPreflight.dockCoverage}/${scenarioDockPlacements.length} docks`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequence = null;
            break;
          }
        }


        if (startEnergyPricing && !virtualBots) {
          await reportStage(
            `${subsidizedStarts ? "Subsidizing" : "Pricing Pay to Win"} starts — routing all ${analysisStarts.length} physical choices`,
            evaluationsUsed
          );
          sequence = await analyzeFlagSequence(
            goalTileMap,
            analysisStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              // Share Normal's physical-estimate -> exact-program realization
              // foundation. Player count remains the survival floor, but every
              // physical start receives authoritative primary routing evidence.
              contextualSharedLaterLegCatalogue: true,
              contextualEstimatedPrimaryRouting: true,
              contextualPhysicalTemplateRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPrimaryWitnessRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPhysicalTemplateExpansions: 700,
              contextualPhysicalTemplateMaxActions: 36,
              contextualExactRepairExpansions: 380,
              contextualOpeningSeedAnalyses: null,
              contextualSeedStartAnalyses: null,
              contextualSeedRouteStrategy: null,
              contextualRequiredStarts: preferences.playerCount
            }
          );
          if (sequence?.firstLeg?.summary) {
            const validatedCount = sequence.firstLeg.starts.filter((entry) => (
              entry.reachable && entry.fullCourseRoute
            )).length;
            sequence.firstLeg.summary.contextualSearchMode = subsidizedStarts
              ? "subsidized-starts-all-start-estimate-then-realize"
              : "pay-to-win-all-start-estimate-then-realize";
            sequence.firstLeg.summary.payToWinStaging = {
              active: true,
              sourceStartCount: indexedActiveStarts.length,
              candidateCount: indexedActiveStarts.length,
              validatedStartCount: validatedCount,
              requiredStartCount: preferences.playerCount,
              method: "all-start-normal-foundation"
            };
          }
        } else if (sharedEstimateThenRealizeRouting) {
          // v36 shared-foundation invariant: Normal and Competitive never use a hidden
          // pre-analysis shortlist. Every structurally available start is sent through primary
          // full-course route discovery. Traffic and alternate-route discovery are
          // independent optional layers; disabling them must not reduce the start
          // field being evaluated.
          const selectedStarts = detailedStarts;
          const selectedIndices = selectedStarts
            .map((start, index) => Number.isInteger(start.analysisIndex) ? start.analysisIndex : index)
            .sort((left, right) => left - right);
          const preferredPoolSize = selectedStarts.length;
          // Checkpoint-stage calibration was already evaluated before any route
          // search for this checkpoint proposal. It may reject only a gross
          // target miss whose out-of-fold residual interval lies wholly outside
          // the requested band. Route-work prediction remains diagnostic/soft
          // here; it is never interpreted as reachability or impossibility.
          const calibratedCheckpointPrediction = checkpointsKnownGuidance;

          // v29: there is deliberately no coherent-capacity gate here. Primary
          // Normal routing resolves every structural start through the two explicit
          // estimate/realize milestones. The player-count floor is consulted only
          // after those milestones have finished for the whole start field.
          let coherentCapacityGate = null;

          await reportStage(
            calibratedCheckpointPrediction
              ? `${competitiveMode ? "Refining Competitive" : "Refining Normal"} — calibration predicts length ${calibratedCheckpointPrediction.length.raw}, difficulty ${calibratedCheckpointPrediction.difficulty.raw}, ~${calibratedCheckpointPrediction.routeCost.predictedExpansions} route expansions`
              : `${competitiveMode ? "Refining Competitive" : "Refining Normal"} — ${selectedStarts.length} opening candidates after cheap preflight`,
            evaluationsUsed
          );
          sequence = await analyzeFlagSequence(
            goalTileMap,
            selectedStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              // v33: all Normal starts receive primary full-course discovery.
              // After Flag 1, shared discovery is physical/facing/register-phase
              // only. Card and Energy forecasts guide witness ordering without
              // entering dominance; exact card/Energy replay remains per lineage.
              contextualSharedLaterLegCatalogue: true,
              // v29 Normal no longer uses the old exact/capacity primary solver.
              // Every structural start first receives an uncapped-on-miss physical
              // full-course estimate, one cached leg at a time. Exact rolling cards
              // are realized afterward; failure replans from the impossible register.
              contextualEstimatedPrimaryRouting: true,
              contextualPhysicalTemplateRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPrimaryWitnessRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPhysicalTemplateExpansions: 700,
              contextualPhysicalTemplateMaxActions: 36,
              contextualExactRepairExpansions: 380,
              // Preflight remains an audition/diagnostic only. Milestone 1 estimates
              // every opening independently and does not consume a preflight seed.
              contextualOpeningSeedAnalyses: null,
              contextualRequiredStarts: competitiveMode
                ? selectedStarts.length
                : preferences.playerCount
            }
          );

          if (sequence?.firstLeg?.summary) {
            const richRoutedStarts = sequence.firstLeg.starts.filter((entry) => (
              entry.reachable && entry.fullCourseRoute
            ));
            sequence.firstLeg.summary.contextualSearchMode = competitiveMode
              ? "competitive-normal-foundation-estimate-then-realize"
              : "normal-estimate-then-realize";
            sequence.firstLeg.summary.contextualStaging = {
              active: false,
              method: "all-start-physical-estimate+whole-route-card-realization+failure-point-replan",
              sourceStartCount: indexedActiveStarts.length,
              preliminaryRoutedCount: coursePreflight.openingRoutedCount,
              targetPoolSize: preferredPoolSize,
              selectedStartCount: richRoutedStarts.length,
              selectedIndices,
              unresolvedFillCount: Math.max(0, selectedStarts.length - richRoutedStarts.length),
              escalated: true,
              escalationReason: calibratedCheckpointPrediction
                ? "calibrated-checkpoint-guidance-passed-or-explored"
                : generationPreferences.length === "any" && generationPreferences.difficulty === "any"
                  ? "unconstrained-fit-no-route-semantic-bypass"
                  : "preflight-fit-passed",
              targetGateMethod: calibratedCheckpointPrediction
                ? "calibrated-checkpoints-known"
                : generationPreferences.length === "any" && generationPreferences.difficulty === "any"
                  ? "none-any-any"
                  : "preflight-only",
              targetGateDifficultyRaw: calibratedCheckpointPrediction?.difficulty?.raw ?? coursePreflight.metrics?.difficultyRaw ?? null,
              targetGateLengthRaw: calibratedCheckpointPrediction?.length?.raw ?? coursePreflight.metrics?.lengthRaw ?? null,
              targetGateLengthFitRaw: calibratedCheckpointPrediction?.length?.raw ?? coursePreflight.metrics?.lengthFitRaw ?? null,
              targetGateRmse: calibratedCheckpointPrediction?.length?.rmse ?? null,
              targetGateSafetyMargin: null,
              targetGateLengthInterval: calibratedCheckpointPrediction?.length?.interval ?? null,
              targetGateDifficultyInterval: calibratedCheckpointPrediction?.difficulty?.interval ?? null,
              targetGatePredictedRouteExpansions: calibratedCheckpointPrediction?.routeCost?.predictedExpansions ?? null,
              coherentCapacityGate: coherentCapacityGate
                ? {
                  active: !coherentCapacityGate.skipped,
                  survivingStarts: coherentCapacityGate.survivingStarts,
                  requiredStarts: coherentCapacityGate.requiredStarts,
                  maxExpansions: coherentCapacityGate.maxExpansions,
                  work: coherentCapacityGate.work ?? null
                }
                : null,
              preselectionSkipped: true
            };
          }
        } else {
          sequence = await analyzeFlagSequence(
            goalTileMap,
            analysisStarts,
            playableCheckpoints,
            preferences.playerCount,
            virtualBots
              ? productionAnalysisOptions
              : {
                ...productionAnalysisOptions,
                contextualOpeningSeedAnalyses: openingSeedAnalyses,
                contextualRequiredStarts: competitiveMode
                  ? analysisStarts.length
                  : preferences.playerCount
              }
          );
        }

        if (sequence?.firstLeg?.summary && coursePreflight) {
          if (preflightExcludedIndices.size) {
            const mergedFirstLeg = mergeLightweightPrunedStarts(
              sequence.firstLeg,
              {
                analyses: coursePreflight.opening?.starts ?? [],
                excludedIndices: preflightExcludedIndices,
                outliers: coursePreflight.intrinsicOutliers ?? [],
                minimumPool: Math.max(preferences.playerCount, preferences.playerCount + LIGHT_START_SURPLUS)
              },
              indexedActiveStarts.length
            );
            sequence.firstLeg = mergedFirstLeg;
            if (sequence.legs?.[0]) {
              sequence.legs[0] = { ...sequence.legs[0], analysis: mergedFirstLeg };
            }
          }
          sequence.firstLeg.summary.coursePreflight = {
            active: true,
            noTraffic: true,
            sourceStartCount: indexedActiveStarts.length,
            openingRoutedCount: coursePreflight.openingRoutedCount,
            requiredOpeningCount: coursePreflight.requiredOpeningCount,
            intrinsicPruned: (coursePreflight.intrinsicOutliers ?? []).map((entry) => entry.index),
            openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
            openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
            difficultyRaw: coursePreflight.metrics?.difficultyRaw ?? null,
            lengthRaw: coursePreflight.metrics?.lengthRaw ?? null,
            routeSearches: coursePreflight.work?.searches ?? 0,
            routeExpansions: coursePreflight.work?.expansions ?? 0,
            cappedRouteSearches: coursePreflight.work?.capped ?? 0,
            routeAwareBatteryScoring: {
              active: Boolean(productionAnalysisOptions.routeAwareBatteryScoring),
              method: "route-upgrade-economy-production-v18-flat-reserve-progress",
              horizonTurns: productionAnalysisOptions.routeEnergyHorizonTurns ?? null,
              registerScore: productionAnalysisOptions.routeEnergyRegisterScore ?? null,
              startingReserve: productionAnalysisOptions.startingEnergy ?? null,
              referenceReserve: productionAnalysisOptions.routeEnergyReferenceReserve ?? null,
              usefulUpgradeCardRate: productionAnalysisOptions.upgradeUsefulCardRate ?? null,
              drawEnergyCost: productionAnalysisOptions.upgradeDrawEnergyCost ?? null,
              usefulEnergyPerInstall: productionAnalysisOptions.upgradeUsefulEnergyPerInstall ?? null
            },
            routePool: null
          };
        }
      } catch (error) {
        if (error?.code === "CONTEXTUAL_START_CAPACITY_LOST") {
          const health = error.contextualSearchHealth ?? {};
          const rescueText = (health.capacityRescueSearches ?? 0) > 0
            ? `; capacity rescue ${health.capacityRescueSuccesses ?? 0}/${health.capacityRescueSearches ?? 0} (physical ${health.capacityPhysicalRescueSuccesses ?? 0}/${health.capacityPhysicalRescueSearches ?? 0}, horizon ${health.capacityHorizonRescueSuccesses ?? 0}/${health.capacityHorizonRescueSearches ?? 0}, expansion ${health.capacityExpansionRescueSuccesses ?? 0}/${health.capacityExpansionRescueSearches ?? 0})`
            : "";
          const sharedText = (health.catalogueLookups ?? 0) > 0
            ? `; catalogue ${health.catalogueEntries ?? 0} classes/${health.catalogueSearches ?? 0} searches, reuse ${health.catalogueCacheHits ?? 0}/${health.catalogueLookups ?? 0}, capped ${health.catalogueCappedSearches ?? 0} (+${health.catalogueSuppressedCappedLookups ?? 0} repeats suppressed), replay ${health.catalogueCompatibleLineages ?? 0}/${health.catalogueIncompatibleLineages ?? 0}`
            : "";
          const reason = `route capacity lost after leg ${health.legNumber ?? "?"}: ${health.survivingStarts ?? 0}/${health.requiredStarts ?? preferences.playerCount} required starts remain; ${health.cappedContextsThisLeg ?? 0} capped route contexts this leg (${health.zeroRouteCapFailures ?? 0} total across ${health.distinctStarts ?? 0} starts)${rescueText}${sharedText}`;
          console.debug(`Early course retry: ${reason}`);
          await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
          sequenceFailureCategory = "route-capacity";
          sequenceFailureReason = reason;
          sequenceFailureDiagnostics = {
            contextualFailure: cloneContextualSearchHealth(health)
          };
          sequence = null;
          break;
        }
        throw error;
      }

      // After the first genuine full-course analysis, abandon only candidates
      // that are wildly outside the requested difficulty/length target.
      // Competitive Mode also benefits from this gate: it skips the physical
      // pruning/reanalysis loop, but a grossly mismatched checkpoint layout
      // should not trigger additional expensive checkpoint retries on the same
      // board candidate. The provisional classification below intentionally
      // skips Competitive's block-impact simulation because this gate only
      // needs difficulty and length.
      if (pass === 0) {
        const provisionalMetrics = classifyCandidate(sequence, {
          ...generationPreferences,
          actFast,
          actFastMode,
          flagCount,
          classicSharedDeck,
          criticalSpam,
          criticalHaywire,
          permanentShutdown,
          cuttingFloor: effectiveVariantBundle.cuttingFloor,
          flamingOil: effectiveVariantBundle.flamingOil,
          factoryRejects,
          repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
          upgradeWorld: effectiveVariantBundle.upgradeWorld,
          hazardousFlags,
          movingTargets,
          payToWin: effectiveVariantBundle.payToWin,
          subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
          lighterGame,
          lessSpammyGame,
          lessForeshadowing
        }, {
          boardPlacements: scenarioBoardPlacements,
          pieceMap,
          checkpoints: playableCheckpoints,
          tileMap: scenarioTileMap,
          goalTileMap,
          skipCompetitiveBlockImpact: competitiveMode
        });
        const grossMismatch = getGrossCourseMismatch(provisionalMetrics, generationPreferences);

        if (grossMismatch.abort && !generationPreferences.calibrationObserveTargetMisses) {
          const mismatchText = formatGrossCourseMismatch(grossMismatch);
          console.debug(`Early course abort: ${mismatchText}`);
          await reportStage(`Rejecting gross mismatch — ${mismatchText}`, evaluationsUsed);
          sequenceFailureCategory = "gross-mismatch";
          sequenceFailureReason = mismatchText;
          sequence = null;
          break;
        }
      }

      // v36 Competitive now follows the ordinary physical cleanup loop too. Its
      // simulated strategic blocks are analysis-only, so removable docks/boards/
      // overlays are judged against the full validated physical start field, not
      // against the P starts used for Competitive fairness. If cleanup changes the
      // course, routing and the sequential block simulation are both rerun.
      await reportStage(`Checking route fairness and removable pieces — pass ${pass + 1} / 4`, evaluationsUsed);
      const usableStarts = competitiveMode
        ? computeCourseReachableStarts(sequence.firstLeg)
        : computeUsableStarts(sequence.firstLeg, {
          competitiveMode,
          virtualBots,
          payToWin: Boolean(effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts),
          subsidizedStarts: effectiveVariantBundle.subsidizedStarts
        });
      let pruningChanged = false;
      const prunedDocks = pruneUnusedDockPlacements(
        scenarioDockPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints
      );
      if (prunedDocks.pruned) {
        scenarioDockPlacements = prunedDocks.dockPlacements;
        pruningChanged = true;
      }

      const protectedSandwichBoards = sandwichedDock
        ? getProtectedSandwichBoardIndices(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        )
        : new Set();
      const prunedBoards = pruneUnusedBoardPlacements(
        scenarioBoardPlacements,
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        { protectedBoardIndices: protectedSandwichBoards }
      );
      if (prunedBoards.pruned) {
        scenarioBoardPlacements = prunedBoards.boardPlacements;
        scenarioOverlayPlacements = prunedBoards.overlayPlacements;
        pruningChanged = true;
      }

      const prunedOverlays = pruneIrrelevantOverlayPlacements(
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        { hazardousFlags }
      );
      if (prunedOverlays.pruned) {
        scenarioOverlayPlacements = prunedOverlays.overlayPlacements;
        pruningChanged = true;
      }

      if (pruningChanged) {
        continue;
      }

      if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount > 0) {
        const retainedBoardOverlayCount = scenarioOverlayPlacements.filter((placement) => (
          !isMiniOverlayPiece(pieceMap[placement.pieceId])
        )).length;
        if (retainedBoardOverlayCount < calibrationBoardOverlayCount) {
          sequenceFailureCategory = "overlay-placement";
          sequenceFailureReason = `Calibration requested ${calibrationBoardOverlayCount} structural board overlay(s), but only ${retainedBoardOverlayCount} remained relevant after route cleanup.`;
          sequence = null;
          break;
        }
      }

      break;
    }
    if (!sequence) {
      recordRejectionEvent(
        retryTelemetryBefore,
        sequenceFailureCategory,
        sequenceFailureReason,
        sequenceFailureDiagnostics
      );
      staleRetries += 1;
      continue;
    }
    if (
      sandwichedDock &&
      !hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      )
    ) {
      recordRejectionEvent(
        retryTelemetryBefore,
        "sandwiched-layout",
        "sandwiched dock structure was not preserved after pruning"
      );
      staleRetries += 1;
      continue;
    }
    if (effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts) {
      const pricedStartSummary = sequence.firstLeg.summary.payToWin ?? null;
      if (pricedStartSummary?.availabilityValid === false) {
        recordRejectionEvent(
          retryTelemetryBefore,
          effectiveVariantBundle.subsidizedStarts ? "subsidized-starts" : "pay-to-win",
          effectiveVariantBundle.subsidizedStarts
            ? "Subsidized Starts pricing left insufficient compensable starting-space availability"
            : "Pay to Win pricing left insufficient affordable starting-space availability"
        );
        staleRetries += 1;
        continue;
      }
      if (pricedStartSummary?.balanceValid === false) {
        const residual = pricedStartSummary.residualBalance ?? {};
        recordRejectionEvent(
          retryTelemetryBefore,
          effectiveVariantBundle.subsidizedStarts ? "subsidized-starts" : "pay-to-win",
          `${effectiveVariantBundle.subsidizedStarts ? "Subsidized Starts" : "Pay to Win"} residual balance remained too wide after pricing (stddev ${residual.worstStdDev ?? "n/a"}/${NORMAL_START_FAIRNESS_STDDEV_LIMIT}, outliers ${residual.worstOutlierCount ?? "n/a"})`
        );
        staleRetries += 1;
        continue;
      }
    }
    const effectiveStartZoneCount = effectiveNoDocks
      ? (noDockEdge ? 1 : 0)
      : scenarioDockPlacements.length;
    if (effectiveVariantBundle.extraDocks && effectiveStartZoneCount <= 1) {
      if (isVariantForced(preferences, "extraDocks")) {
        recordRejectionEvent(
          retryTelemetryBefore,
          "extra-docks",
          "Extra Docks was forced but fewer than two dock zones survived"
        );
        staleRetries += 1;
        continue;
      }
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: false
      };
    } else if (effectiveStartZoneCount > 1 && !effectiveVariantBundle.extraDocks) {
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: true
      };
    }
    // Route cleanup may have removed unused boards, docks, or overlays after the
    // pre-route checkpoint prediction. Refresh the retained stage diagnostics so
    // the accepted scenario reports guidance for the construction it actually uses.
    boardsKnownGuidance = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "boardsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: scenarioBoardPlacements.length,
        flagCount: playableCheckpoints.length,
        boardPlacements: scenarioBoardPlacements,
        dockPlacements: scenarioDockPlacements,
        overlayPlacements: scenarioOverlayPlacements
      }
    );
    checkpointsKnownGuidance = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "checkpointsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: scenarioBoardPlacements.length,
        flagCount: playableCheckpoints.length,
        boardPlacements: scenarioBoardPlacements,
        dockPlacements: scenarioDockPlacements,
        overlayPlacements: scenarioOverlayPlacements,
        checkpoints: playableCheckpoints,
        starts: activeStarts,
        tileMap: scenarioTileMap
      }
    );

    await reportStage("Checking difficulty, length, and final fit", evaluationsUsed);
    const metrics = classifyCandidate(sequence, {
      ...generationPreferences,
      ...effectiveVariantBundle,
      actFast,
      actFastMode,
      flagCount,
      classicSharedDeck,
      movingTargets
    }, {
      boardPlacements: scenarioBoardPlacements,
      pieceMap,
      checkpoints: playableCheckpoints,
      activeStarts,
      tileMap: scenarioTileMap,
      goalTileMap
    });
    const analyzedReachableIndices = new Set(
      computeCourseReachableStarts(sequence.firstLeg).map((entry) => entry.index)
    );
    const validatedStartIndices = [...analyzedReachableIndices];
    const validatedStartSet = new Set(validatedStartIndices);
    const usableStartSet = new Set((metrics.usableStarts ?? []).map((entry) => entry.index));
    const blockedStartIndices = virtualBots
      ? []
      : activeStarts
        .map((_, index) => index)
        .filter((index) => competitiveMode
          ? !validatedStartSet.has(index)
          : !usableStartSet.has(index)
        );
    const analysisStartIndices = competitiveMode
      ? [...validatedStartSet].sort((left, right) => left - right)
      : [...usableStartSet].sort((left, right) => left - right);
    const allPhysicalStartIndices = activeStarts.map((_, index) => index);
    const targetedStagingIndices = sequence.firstLeg?.summary?.contextualStaging?.selectedIndices;
    const routePoolCandidateIndices = new Set(
      Array.isArray(targetedStagingIndices) && targetedStagingIndices.length
        ? targetedStagingIndices
        : allPhysicalStartIndices
    );
    const outsidePoolIndices = virtualBots
      ? []
      : allPhysicalStartIndices.filter((index) => !routePoolCandidateIndices.has(index));
    const routeFailedIndices = virtualBots
      ? []
      : [...routePoolCandidateIndices].filter((index) => !validatedStartSet.has(index));
    const startEnergyPricingActive = Boolean(
      effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts
    );
    const payToWinPrunedIndices = startEnergyPricingActive
      ? (sequence.firstLeg.summary.payToWin?.pruned ?? []).map((entry) => entry.index)
      : [];
    const selectorUnavailableIndices = startEnergyPricingActive
      ? sequence.firstLeg.starts
        .filter((entry) => entry.payToWinUnavailable)
        .map((entry) => entry.index)
      : [];
    const normalPrunedIndices = (!competitiveMode && !startEnergyPricingActive && !virtualBots)
      ? [...validatedStartSet].filter((index) => !usableStartSet.has(index))
      : [];
    const classifiedBlockedIndices = new Set([
      ...outsidePoolIndices,
      ...routeFailedIndices,
      ...payToWinPrunedIndices,
      ...selectorUnavailableIndices,
      ...normalPrunedIndices
    ]);
    const otherBlockedIndices = blockedStartIndices.filter((index) => !classifiedBlockedIndices.has(index));
    const competitiveBalance = sequence.firstLeg?.summary?.competitiveStartBalance ?? null;
    const startDisposition = {
      physicalCount: activeStarts.length,
      validatedCount: validatedStartSet.size,
      blockedCount: blockedStartIndices.length,
      outsidePoolIndices: [...outsidePoolIndices].sort((left, right) => left - right),
      routeFailedIndices: [...routeFailedIndices].sort((left, right) => left - right),
      normalPrunedIndices: [...normalPrunedIndices].sort((left, right) => left - right),
      competitiveStrategicBlockIndices: competitiveMode
        ? [...(competitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
        : [],
      competitiveSelectedIndices: competitiveMode
        ? [...(competitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
        : [],
      pricePrunedIndices: [...payToWinPrunedIndices].sort((left, right) => left - right),
      selectorUnavailableIndices: [...selectorUnavailableIndices].sort((left, right) => left - right),
      otherBlockedIndices: [...otherBlockedIndices].sort((left, right) => left - right)
    };

    scenarioPlacements = [
      ...scenarioBoardPlacements,
      ...scenarioDockPlacements,
      ...scenarioOverlayPlacements
    ];
    const finalOverlayPlacements = scenarioPlacements.filter((placement) => placement.overlay);
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      scenarioBoardPlacements,
      scenarioDockPlacements,
      finalOverlayPlacements,
      checkpoints
    );
    const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
    const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(scenarioTileMap, playableCheckpoints, effectiveVariantBundle.movingTargets);
    const scenario = applyVariantScenarioState({
      pieceMap: assets.pieceMap,
      imageMap: assets.imageMap,
      placements: scenarioPlacements,
      overlayPlacements: finalOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      dockSummaries: buildDockSummaries(scenarioBoardPlacements, scenarioDockPlacements, pieceMap),
      checkpoints,
      virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
      rebootTokens,
      goalTileMap,
      activeStarts,
      blockedStartIndices,
      validatedStartIndices: [...validatedStartSet].sort((left, right) => left - right),
      analysisStartIndices,
      startDisposition,
      playerCount: preferences.playerCount,
      actFast,
      actFastMode,
      payToWin: effectiveVariantBundle.payToWin,
      subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
      noDocks: effectiveNoDocks,
      sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      ),
      noDockEdge: noDockEdge ? { boardIndex: noDockEdge.boardIndex, pieceId: noDockEdge.pieceId, side: noDockEdge.side, facing: noDockEdge.facing } : null,
      noDockEdges: noDockEdges.map((edge) => ({ boardIndex: edge.boardIndex, pieceId: edge.pieceId, side: edge.side, facing: edge.facing, edgeLength: edge.edgeLength })),
      noDockStarts,
      virtualBots,
      extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
      mainBoardIds: scenarioBoardPlacements.map((placement) => placement.pieceId),
      mainRotations: scenarioBoardPlacements.map((placement) => placement.rotation),
      boardCount: scenarioBoardPlacements.length,
      constructionFingerprint: currentConstructionFingerprint,
      boardRects: scenarioBoardRects,
      constructionGuidancePrior,
      constructionGuidanceStages: {
        boardsKnown: boardsKnownGuidance,
        checkpointsKnown: checkpointsKnownGuidance
      },
      guidanceLevel,
      sequence,
      metrics,
      movingTargetStats: metrics.movingTargetStats,
      movingTargetTimelines,
      movingTargetReentryMarkers,
      preferences: {
        ...generationPreferences,
        overlayMode: normalizeOverlayMode(generationPreferences.overlayMode),
        actFast,
        actFastMode,
        competitiveMode,
        payToWin: effectiveVariantBundle.payToWin,
        subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
        extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
        noDocks: effectiveNoDocks,
        sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        ),
        factoryRejects,
        flagCount,
        virtualBots,
        classicSharedDeck,
        criticalSpam,
        criticalHaywire,
        permanentShutdown,
        cuttingFloor: effectiveVariantBundle.cuttingFloor,
        flamingOil: effectiveVariantBundle.flamingOil,
        repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
        upgradeWorld: effectiveVariantBundle.upgradeWorld,
        hazardousFlags,
        repairStations: effectiveVariantBundle.repairStations,
        movingTargets,
        lighterGame,
        lessSpammyGame,
        lessForeshadowing,
        staggeredBoards
      }
    }, effectiveVariantBundle);

    const scenarioFallbackScore = getFallbackScenarioScore(scenario);
    const bestFallbackScore = getFallbackScenarioScore(bestScenario);
    if (Number.isFinite(scenarioFallbackScore) && scenarioFallbackScore < bestFallbackScore) {
      bestScenario = scenario;
      staleRetries = 0;
    } else {
      staleRetries += 1;
    }

    if (!scenario.metrics.acceptable) {
      const rejectionReason = describeGenerationRejection(
        scenario,
        "final classification"
      );
      recordRejectionEvent(
        retryTelemetryBefore,
        getGenerationRejectionCategory(scenario, rejectionReason),
        rejectionReason
      );
    }

    if (scenario.metrics.acceptable || (retry > 0 && staleRetries >= stallLimit)) {
      break;
    }
  }

  return {
    scenario: bestScenario,
    evaluationsUsed: Math.max(1, evaluationsUsed),
    rejectionEvents,
    calibrationConstructionSnapshot
  };
}

function serializeScenario(scenario) {
  return {
    preferences: scenario.preferences,
    effectiveTargetPreferences: scenario.effectiveTargetPreferences ?? null,
    actFast: scenario.actFast,
    actFastMode: scenario.actFastMode,
    competitiveMode: scenario.competitiveMode,
    payToWin: scenario.payToWin,
    subsidizedStarts: Boolean(scenario.subsidizedStarts),
    extraDocks: scenario.extraDocks,
    noDocks: scenario.noDocks,
    sandwichedDock: scenario.sandwichedDock,
    noDockEdge: scenario.noDockEdge,
    noDockEdges: scenario.noDockEdges ?? (scenario.noDockEdge ? [scenario.noDockEdge] : []),
    noDockStarts: scenario.noDockStarts,
    factoryRejects: scenario.factoryRejects,
    recoveryRule: scenario.recoveryRule,
    lessDeadlyGame: scenario.lessDeadlyGame,
    lessSpammyGame: scenario.lessSpammyGame,
    criticalSpam: scenario.criticalSpam,
    criticalHaywire: scenario.criticalHaywire,
    permanentShutdown: scenario.permanentShutdown,
    startupSpinUp: scenario.startupSpinUp,
    virtualBots: scenario.virtualBots,
    moreDeadlyGame: scenario.moreDeadlyGame,
    homeReboot: scenario.homeReboot,
    cuttingFloor: scenario.cuttingFloor,
    flamingOil: scenario.flamingOil,
    repulsorOverdrive: scenario.repulsorOverdrive,
    upgradeWorld: scenario.upgradeWorld,
    lighterGame: scenario.lighterGame,
    classicSharedDeck: scenario.classicSharedDeck,
    hazardousFlags: scenario.hazardousFlags,
    repairStations: scenario.repairStations,
    movingTargets: scenario.movingTargets,
    staggeredBoards: scenario.staggeredBoards,
    lessForeshadowing: scenario.lessForeshadowing,
    placements: scenario.placements,
    checkpoints: scenario.checkpoints,
    rebootTokens: scenario.rebootTokens,
    activeStarts: scenario.activeStarts ?? [],
    constructionFingerprint: scenario.constructionFingerprint ?? null,
    blockedStartIndices: scenario.blockedStartIndices ?? [],
    validatedStartIndices: scenario.validatedStartIndices ?? [],
    analysisStartIndices: scenario.analysisStartIndices ?? (scenario.metrics?.usableStarts ?? []).map((entry) => entry.index),
    startDisposition: scenario.startDisposition ?? null,
    startPricing: (scenario.payToWin || scenario.subsidizedStarts)
      ? (scenario.sequence?.firstLeg?.starts ?? []).map((entry) => ({
        index: entry.index,
        energyCost: entry.energyCost ?? null,
        earlyUnavailable: Boolean(entry.earlyUnavailable),
        lateEnergyCost: entry.lateEnergyCost ?? null,
        lateUnavailable: Boolean(entry.lateUnavailable),
        payToWinUnavailable: Boolean(entry.payToWinUnavailable),
        lateAdjustedScore: entry.lateAdjustedScore ?? null
      }))
      : null,
    payToWinPricing: (scenario.payToWin || scenario.subsidizedStarts) ? (scenario.sequence?.firstLeg?.summary?.payToWin ?? null) : null,
    attempts: scenario.attempts ?? 0
  };
}

function saveScenarioSnapshot(scenario) {
  try {
    localStorage.setItem(SAVED_SCENARIO_KEY, JSON.stringify(serializeScenario(scenario)));
  } catch {
    // ignore storage failures
  }
}

function loadScenarioSnapshot() {
  try {
    const raw = localStorage.getItem(SAVED_SCENARIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hydrateScenarioFromSnapshot(assets, snapshot) {
  if (!snapshot?.placements?.length || !snapshot?.checkpoints?.length || !snapshot?.preferences) {
    return null;
  }

  const effectiveTargetPreferences = {
    difficulty: snapshot.effectiveTargetPreferences?.difficulty ?? snapshot.preferences.difficulty,
    length: snapshot.effectiveTargetPreferences?.length ?? snapshot.preferences.length
  };
  const hydrationPreferences = {
    ...snapshot.preferences,
    ...effectiveTargetPreferences,
    targetGuidanceOnlyDifficulty: snapshot.preferences.difficulty === "any",
    targetGuidanceOnlyLength: snapshot.preferences.length === "any"
  };

  const { pieceMap, imageMap } = assets;
  const actFast = Boolean(snapshot.actFast);
  const actFastMode = snapshot.actFastMode ?? null;
  const recoveryRule = snapshot.recoveryRule ?? "reboot_tokens";
  const competitiveMode = Boolean(snapshot.competitiveMode);
  const payToWin = Boolean(snapshot.payToWin);
  const subsidizedStarts = Boolean(snapshot.subsidizedStarts);
  const startEnergyPricing = Boolean(payToWin || subsidizedStarts);
  const noDocks = Boolean(snapshot.noDocks);
  const sandwichedDock = Boolean(snapshot.sandwichedDock);
  const noDockStarts = snapshot.noDockStarts || [];
  const factoryRejects = Boolean(snapshot.factoryRejects);
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const lessSpammyGame = Boolean(snapshot.lessSpammyGame);
  const criticalSpam = Boolean(snapshot.criticalSpam);
  const criticalHaywire = Boolean(snapshot.criticalHaywire);
  const permanentShutdown = Boolean(snapshot.permanentShutdown);
  const homeReboot = Boolean(snapshot.homeReboot || recoveryRule === "home_reboot");
  const cuttingFloor = Boolean(snapshot.cuttingFloor);
  const startupSpinUp = Boolean(snapshot.startupSpinUp);
  const virtualBots = Boolean(snapshot.virtualBots);
  const upgradeWorld = Boolean(snapshot.upgradeWorld);
  const lighterGame = Boolean(snapshot.lighterGame);
  const classicSharedDeck = Boolean(snapshot.classicSharedDeck);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const movingTargets = Boolean(snapshot.movingTargets);
  const staggeredBoards = Boolean(snapshot.staggeredBoards);
  const lessForeshadowing = Boolean(snapshot.lessForeshadowing);
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const boardPlacements = placements.filter((placement) => {
    const kind = assets.pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, assets.pieceMap);
  const snapshotNoDockEdges = snapshot.noDockEdges ?? (snapshot.noDockEdge ? [snapshot.noDockEdge] : []);
  const extraDocks = noDocks ? snapshotNoDockEdges.length > 1 : dockPlacements.length > 1;
  const boardRects = buildBoardRects(boardPlacements, pieceMap);

  if ((!virtualBots && !noDocks && !dockPlacements.length) || !boardPlacements.length) {
    return null;
  }

  clearAnalysisCachesSafe();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const rebootTokens = recoveryRule === "home_reboot"
    ? placeHomeRebootTokens(dockPlacements, pieceMap, starts, tileMap, checkpoints, {
      lessDeadlyGame
    })
    : (snapshot.rebootTokens || []);
  const flagZero = virtualBots ? checkpoints[0] : null;
  const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
  let goalTileMap;
  if (virtualBots) {
    const withFlagZero = applyFlagOverrides(tileMap, [flagZero], { hazardousFlags, movingTargets: false });
    goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
    goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
  } else {
    goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags, movingTargets });
  }
  const resolvedActiveStarts = virtualBots
    ? buildVirtualRobotStarts(flagZero, snapshot.preferences.playerCount, startupSpinUp)
    : noDocks
      ? filterStartsForGoals(noDockStarts, checkpoints)
      : filterStartsForGoals(starts, checkpoints);
  const activeStarts = Array.isArray(snapshot.activeStarts) && snapshot.activeStarts.length
    ? snapshot.activeStarts
    : resolvedActiveStarts;
  const savedAnalysisIndices = new Set(
    Array.isArray(snapshot.analysisStartIndices) && snapshot.analysisStartIndices.length
      ? snapshot.analysisStartIndices
      : activeStarts.map((_, index) => index)
  );
  const analysisStarts = virtualBots
    ? activeStarts
    : activeStarts
      .map((start, index) => ({ ...start, analysisIndex: index }))
      // Current Competitive semantics always reconstruct the full physical field.
      // Older saves may have persisted only a legacy analyzed subset; do not let
      // that historical shortlist re-enter the new sequential-blocking model.
      .filter((start) => competitiveMode || savedAnalysisIndices.has(start.analysisIndex));
  const hydrationGenerationMode = getScenarioGenerationMode(snapshot);
  const hydrationGenerationProfile = getGenerationModeProfile({
    generationMode: hydrationGenerationMode
  });
  const hydrationTrafficEnabled = Boolean(hydrationGenerationProfile.trafficEnabled);
  const hydrationTrafficFeedbackEnabled = Boolean(
    hydrationTrafficEnabled && hydrationGenerationProfile.trafficEpochs > 0
  );

  // Reload is reconstruction of an already-accepted course, not a cheaper second
  // opinion. Use the same production routing envelope as generation so a bounded
  // generic reanalysis cannot turn accepted starts into false zero-route failures.
  // In particular, priced-start modes were generated through the shared physical
  // estimate -> exact-program realization foundation and must hydrate through it.
  const hydrationUsesSharedRouteFoundation = Boolean(
    !virtualBots && (
      startEnergyPricing ||
      (!noDocks && !sandwichedDock && dockPlacements.length === 1)
    )
  );
  const hydrationRouteFoundationOptions = hydrationUsesSharedRouteFoundation
    ? {
        contextualSharedLaterLegCatalogue: true,
        contextualEstimatedPrimaryRouting: true,
        contextualPhysicalTemplateRoutes: hydrationGenerationProfile.primaryWitnessRoutes,
        contextualPrimaryWitnessRoutes: hydrationGenerationProfile.primaryWitnessRoutes,
        contextualPhysicalTemplateExpansions: 700,
        contextualPhysicalTemplateMaxActions: 36,
        contextualExactRepairExpansions: 380,
        contextualOpeningSeedAnalyses: null,
        contextualSeedStartAnalyses: null,
        contextualSeedRouteStrategy: null,
        contextualRequiredStarts: competitiveMode && !startEnergyPricing
          ? analysisStarts.length
          : snapshot.preferences.playerCount
      }
    : {};
  const hydrationBaseVariantOptions = {
    ...hydrationPreferences,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    homeReboot,
    cuttingFloor,
    startupSpinUp,
    virtualBots,
    upgradeWorld,
    lighterGame,
    hazardousFlags,
    lessForeshadowing
  };
  const hydrationEnergyOptions = buildRouteAwareBatteryScoringOptions(
    null,
    hydrationBaseVariantOptions
  );
  const sequence = analyzeFlagSequence(goalTileMap, analysisStarts, playableCheckpoints, snapshot.preferences.playerCount, applyVariantAnalysisOptions({
    ...getRouteAnalysisVariantOptions(hydrationPreferences),
    ...hydrationEnergyOptions,
    rebootTokens,
    boardRects,
    difficulty: hydrationPreferences.difficulty,
    length: hydrationPreferences.length,
    // Preserve the search-effort meaning of the saved course. Pre-Mode saves
    // used the current Balanced budgets, so getScenarioGenerationMode() maps
    // those legacy snapshots to Balanced rather than silently using Standard.
    generationMode: hydrationGenerationMode,
    contextualFastCardState: true,
    contextualEstimatedEnergyGuidance: true,
    fastBaselineTrafficEnabled: hydrationTrafficEnabled,
    modeTrafficEnabled: hydrationTrafficEnabled,
    trafficEnabledOverride: hydrationTrafficEnabled,
    contextualTrafficFeedbackEnabled: hydrationTrafficFeedbackEnabled,
    contextualTrafficDrivenAlternates: hydrationTrafficFeedbackEnabled,
    contextualTrafficEpochs: hydrationTrafficFeedbackEnabled
      ? hydrationGenerationProfile.trafficEpochs
      : 0,
    contextualTrafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
    contextualTrafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
    contextualTrafficAlternateMaxNewSearchesPerEpoch:
      hydrationGenerationProfile.trafficAlternateMaxNewSearchesPerEpoch,
    contextualTrafficAlternateExpansions: hydrationGenerationProfile.trafficAlternateExpansions,
    contextualTrafficAlternateMaxActions: hydrationGenerationProfile.trafficAlternateMaxActions,
    contextualTrafficAlternateCachedProbeMargin:
      hydrationGenerationProfile.trafficAlternateCachedProbeMargin,
    contextualTrafficAlternateCachedProbeMaxSimilarity:
      hydrationGenerationProfile.trafficAlternateCachedProbeMaxSimilarity,
    contextualTrafficAlternateLegsPerStart: hydrationGenerationProfile.trafficAlternateLegsPerStart,
    contextualTrafficExplorationUncertaintyShare:
      hydrationGenerationProfile.trafficExplorationUncertaintyShare,
    contextualTrafficExplorationConfidenceFloor:
      hydrationGenerationProfile.trafficExplorationConfidenceFloor,
    contextualTrafficAlternateUncertaintyEffortFloor:
      hydrationGenerationProfile.trafficAlternateUncertaintyEffortFloor,
    contextualTrafficAlternateUncertaintyEffortExponent:
      hydrationGenerationProfile.trafficAlternateUncertaintyEffortExponent,
    skipTraffic: !hydrationTrafficEnabled,
    skipFullCourseTraffic: !hydrationTrafficEnabled,
    contextualTrafficAlternativeRetention: false,
    contextualOpeningExpansions: 650,
    contextualLaterExpansions: 550,
    contextualLegMaxActions: 30,
    contextualUncertaintyBreadth: true,
    contextualDetailedProfiling: false,
    contextualDominanceKeyProfiling: false,
    ...hydrationRouteFoundationOptions,
    // Pricing/pruning is part of the saved scenario. Re-running it during reload
    // could remove a second start from an already accepted economy setup; restore
    // the persisted pricing fields after route reconstruction instead.
    skipStartEnergyPricing: startEnergyPricing && Array.isArray(snapshot.startPricing),
    // A restored course must preserve the accepted start disposition instead
    // of running a fresh Normal fairness pass and changing which spaces are open.
    skipNormalStartBalancing: !competitiveMode && !startEnergyPricing && !virtualBots && Array.isArray(snapshot.analysisStartIndices)
  }, {
    competitiveMode,
    payToWin,
    subsidizedStarts,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    homeReboot,
    cuttingFloor,
    startupSpinUp,
    virtualBots,
    upgradeWorld,
    lighterGame,
    hazardousFlags,
    lessForeshadowing
  }));
  if (startEnergyPricing && Array.isArray(snapshot.startPricing)) {
    const savedPricingByIndex = new Map(snapshot.startPricing.map((entry) => [entry.index, entry]));
    sequence.firstLeg.starts = sequence.firstLeg.starts.map((entry) => {
      const saved = savedPricingByIndex.get(entry.index);
      return saved ? { ...entry, ...saved } : entry;
    });
    if (sequence.legs?.[0]) {
      sequence.legs[0] = { ...sequence.legs[0], analysis: sequence.firstLeg };
    }
    if (snapshot.payToWinPricing) {
      sequence.firstLeg.summary.payToWin = snapshot.payToWinPricing;
    }
  }
  const metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    actFast,
    actFastMode,
    recoveryRule,
    flagCount: playableCheckpoints.length,
    classicSharedDeck,
    cuttingFloor,
    factoryRejects,
    hazardousFlags,
    movingTargets,
    payToWin,
    subsidizedStarts,
    startupSpinUp,
    upgradeWorld,
    lighterGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    lessForeshadowing
  }, {
    boardPlacements,
    pieceMap,
    checkpoints: playableCheckpoints,
    tileMap,
    goalTileMap
  });
  const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
  const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(tileMap, playableCheckpoints, movingTargets);
  const hydratedCompetitiveBalance = sequence.firstLeg?.summary?.competitiveStartBalance ?? null;
  const hydratedAnalysisStartIndices = competitiveMode
    ? activeStarts.map((_, index) => index)
    : [...savedAnalysisIndices].sort((left, right) => left - right);

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    dockPlacements,
    dockSummaries: buildDockSummaries(boardPlacements, dockPlacements, pieceMap),
    checkpoints,
    virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
    rebootTokens,
    goalTileMap,
    activeStarts,
    blockedStartIndices: Array.isArray(snapshot.blockedStartIndices) ? snapshot.blockedStartIndices : [],
    validatedStartIndices: competitiveMode
      ? computeCourseReachableStarts(sequence.firstLeg).map((entry) => entry.index)
      : (Array.isArray(snapshot.validatedStartIndices) ? snapshot.validatedStartIndices : [...savedAnalysisIndices]),
    analysisStartIndices: hydratedAnalysisStartIndices,
    startDisposition: snapshot.startDisposition
      ? {
        ...snapshot.startDisposition,
        // v34/v35 snapshots called all P2W pruning "legacy" pruning. Accept
        // that field on hydration, but use the neutral name now that v36's
        // register-equivalent model owns the same endpoint-pruning mechanism.
        pricePrunedIndices: snapshot.startDisposition.pricePrunedIndices ??
          snapshot.startDisposition.legacyPricePrunedIndices ?? [],
        competitiveStrategicBlockIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
          : (snapshot.startDisposition.competitiveStrategicBlockIndices ?? []),
        competitiveSelectedIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
          : (snapshot.startDisposition.competitiveSelectedIndices ?? [])
      }
      : {
        physicalCount: activeStarts.length,
        validatedCount: competitiveMode
          ? computeCourseReachableStarts(sequence.firstLeg).length
          : (Array.isArray(snapshot.validatedStartIndices) ? snapshot.validatedStartIndices.length : savedAnalysisIndices.size),
        blockedCount: Array.isArray(snapshot.blockedStartIndices) ? snapshot.blockedStartIndices.length : 0,
        outsidePoolIndices: [],
        routeFailedIndices: [],
        normalPrunedIndices: [],
        competitiveStrategicBlockIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
          : [],
        competitiveSelectedIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
          : [],
        pricePrunedIndices: [],
        selectorUnavailableIndices: [],
        otherBlockedIndices: Array.isArray(snapshot.blockedStartIndices) ? [...snapshot.blockedStartIndices] : []
      },
    playerCount: snapshot.preferences.playerCount,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    noDocks,
    sandwichedDock,
    noDockEdge: snapshot.noDockEdge ?? snapshotNoDockEdges[0] ?? null,
    noDockEdges: snapshotNoDockEdges,
    noDockStarts,
    extraDocks,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    homeReboot,
    cuttingFloor,
    upgradeWorld,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing,
    variantComplexityBudget: 0,
    variantComplexityUsed: 0,
    mainBoardIds: boardPlacements.map((placement) => placement.pieceId),
    mainRotations: boardPlacements.map((placement) => placement.rotation),
    boardCount: boardPlacements.length,
    boardRects,
    guidanceLevel: 0,
    sequence,
    metrics,
    movingTargetStats: metrics.movingTargetStats,
    movingTargetTimelines,
    movingTargetReentryMarkers,
    effectiveTargetPreferences,
    preferences: {
      ...snapshot.preferences,
      overlayMode: normalizeOverlayMode(snapshot.preferences.overlayMode),
      actFast,
      actFastMode,
      competitiveMode,
      payToWin,
      subsidizedStarts,
      noDocks,
      sandwichedDock,
      extraDocks,
      factoryRejects,
      recoveryRule,
      flagCount: playableCheckpoints.length,
      classicSharedDeck,
      homeReboot,
      cuttingFloor,
          startupSpinUp,
      virtualBots,
      upgradeWorld,
      hazardousFlags,
        movingTargets,
      lessSpammyGame,
      criticalSpam,
      criticalHaywire,
      permanentShutdown,
      staggeredBoards
    },
    attempts: snapshot.attempts ?? 0
  };
}

async function generateScenarioForPreferences(assets, preferences, options = {}) {
  const generationMode = normalizeGenerationMode(preferences.generationMode);
  const generationProfile = getGenerationModeProfile({ generationMode });
  const maxAttempts = options.maxAttempts ?? generationProfile.maxAttempts;
  const emergencyAttemptReserve = Math.max(0, Math.floor(
    Number(options.emergencyAttemptReserve) || 0
  ));
  const effectiveMaxAttempts = maxAttempts + emergencyAttemptReserve;
  const softExpansionBudget = options.softExpansionBudget ?? generationProfile.softExpansionBudget;
  const softBudgetMinAttempts = options.softBudgetMinAttempts ?? generationProfile.softBudgetMinAttempts;
  const onProgress = options.onProgress ?? null;
  const shouldStopRequested = typeof options.shouldStopRequested === "function"
    ? options.shouldStopRequested
    : () => false;
  const generationStartedAt = generationNow();
  const generationDiagnostics = {
    startedAt: generationStartedAt,
    attempts: [],
    totalMs: 0,
    totalEvaluations: 0,
    routeSearches: 0,
    routeExpansions: 0,
    routeSearchMs: 0,
    cappedRouteSearches: 0,
    slowestRouteSearch: null,
    routeSearchTotalsByKind: null,
    physicalCacheTotals: null,
    contextualProfileTotals: null,
    terminationReason: null,
    rejectionEvents: [],
    rejectionSummary: null,
    generationMode,
    generationModeLabel: formatGenerationModeLabel(generationMode),
    maxAttempts,
    emergencyAttemptReserve,
    emergencyActivated: false,
    emergencyAttemptsUsed: 0,
    softExpansionBudget,
    softBudgetMinAttempts,
    searchProfile: {
      preflightOpeningExpansions: generationProfile.preflightOpeningExpansions,
      preflightLaterExpansions: generationProfile.preflightLaterExpansions,
      lightStartExpansions: generationProfile.lightStartExpansions,
      fullCourseExpansions: generationProfile.fullCourseExpansions,
      primaryWitnessRoutes: generationProfile.primaryWitnessRoutes,
      trafficEnabled: generationProfile.trafficEnabled,
      trafficEpochs: generationProfile.trafficEpochs,
      trafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      trafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      trafficAlternateMaxNewSearchesPerEpoch:
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      trafficAlternateExpansions: generationProfile.trafficAlternateExpansions,
      trafficAlternateMaxActions: generationProfile.trafficAlternateMaxActions,
      trafficAlternateCachedProbeMargin: generationProfile.trafficAlternateCachedProbeMargin,
      trafficAlternateCachedProbeMaxSimilarity: generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      trafficAlternateLegsPerStart: generationProfile.trafficAlternateLegsPerStart,
      trafficExplorationUncertaintyShare: generationProfile.trafficExplorationUncertaintyShare,
      trafficExplorationConfidenceFloor: generationProfile.trafficExplorationConfidenceFloor,
      trafficAlternateUncertaintyEffortFloor: generationProfile.trafficAlternateUncertaintyEffortFloor,
      trafficAlternateUncertaintyEffortExponent: generationProfile.trafficAlternateUncertaintyEffortExponent,
      normalPruneBatchSize: NORMAL_PRUNE_BATCH_SIZE,
      normalPruneBatchPolicy: "adaptive-2-above-2x-players-else-1",
      fullCourseTrafficPasses: NORMAL_FULL_COURSE_TRAFFIC_PASSES
    }
  };
  // v35a: diagnostics live in this owning scope. Dev View itself is observational;
  // only the explicit current-mode override changes route-model behavior. Snapshot
  // that override here so copied summaries describe the experiment actually run.
  const diagnosticsDevRouteModelOverrideActive = isDevRouteModelOverrideActive();
  const diagnosticsEffectiveTrafficEnabled = diagnosticsDevRouteModelOverrideActive
    ? isDevFastTrafficEnabled()
    : Boolean(generationProfile.trafficEnabled);
  const diagnosticsEffectiveTrafficFeedbackEnabled = Boolean(
    diagnosticsEffectiveTrafficEnabled && generationProfile.trafficEpochs > 0
  );
  const diagnosticsEffectiveTrafficDrivenAlternates = Boolean(
    diagnosticsEffectiveTrafficFeedbackEnabled && (
      diagnosticsDevRouteModelOverrideActive ? isDevFastAlternatesEnabled() : true
    )
  );
  generationDiagnostics.searchProfile.trafficEnabled = diagnosticsEffectiveTrafficEnabled;
  generationDiagnostics.searchProfile.trafficEpochs = diagnosticsEffectiveTrafficFeedbackEnabled
    ? generationProfile.trafficEpochs
    : 0;
  generationDiagnostics.searchProfile.trafficAlternatesEnabled =
    diagnosticsEffectiveTrafficDrivenAlternates;
  generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesPerEpoch =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficAlternateMaxNewSearchesPerEpoch
      : 0;
  generationDiagnostics.searchProfile.trafficAlternateExpansions =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateExpansions : 0;
  generationDiagnostics.searchProfile.trafficAlternateMaxActions =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateMaxActions : 0;
  generationDiagnostics.searchProfile.trafficAlternateCachedProbeMargin =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateCachedProbeMargin : 0;
  generationDiagnostics.searchProfile.trafficAlternateCachedProbeMaxSimilarity =
    generationProfile.trafficAlternateCachedProbeMaxSimilarity;
  generationDiagnostics.searchProfile.trafficExplorationUncertaintyShare =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficExplorationUncertaintyShare
      : 0;
  generationDiagnostics.searchProfile.trafficExplorationConfidenceFloor =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficExplorationConfidenceFloor
      : 1;
  generationDiagnostics.searchProfile.devRouteModelOverrideActive =
    diagnosticsDevRouteModelOverrideActive;
  let bestScenario = null;
  let crashedAttempts = 0;
  let lastAttemptError = null;
  let attempt = 0;
  let terminationReason = null;
  let emergencyActivated = false;

  const attachDiagnostics = (scenario) => {
    if (!scenario) return scenario;
    const telemetry = getAnalysisTelemetrySnapshotSafe();
    generationDiagnostics.totalMs = Number((generationNow() - generationStartedAt).toFixed(2));
    generationDiagnostics.totalEvaluations = attempt;
    generationDiagnostics.emergencyActivated = emergencyActivated;
    generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    generationDiagnostics.routeSearches = telemetry.routeSearchCount ?? 0;
    generationDiagnostics.routeExpansions = telemetry.totalExpansions ?? 0;
    generationDiagnostics.routeSearchMs = telemetry.totalDurationMs ?? 0;
    generationDiagnostics.cappedRouteSearches = telemetry.cappedSearches ?? 0;
    generationDiagnostics.slowestRouteSearch = telemetry.slowestSearch ?? null;
    generationDiagnostics.routeSearchTotalsByKind = telemetry.totalsByKind ?? null;
    generationDiagnostics.physicalCacheTotals = telemetry.physicalCacheTotals ?? null;
    generationDiagnostics.contextualProfileTotals = telemetry.contextualProfileTotals ?? null;
    generationDiagnostics.terminationReason = terminationReason;
    generationDiagnostics.rejectionSummary = summarizeGenerationRejectionEvents(
      generationDiagnostics.rejectionEvents
    );
    scenario.generationDiagnostics = {
      ...generationDiagnostics,
      attempts: generationDiagnostics.attempts.map((entry) => ({
        ...entry,
        stages: (entry.stages || []).map((stage) => ({ ...stage })),
        slowestRouteSearch: entry.slowestRouteSearch
          ? { ...entry.slowestRouteSearch }
          : null,
        routeSearchTotalsByKind: entry.routeSearchTotalsByKind
          ? Object.fromEntries(Object.entries(entry.routeSearchTotalsByKind).map(([kind, bucket]) => [kind, { ...bucket }]))
          : null,
        contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null
      })),
      rejectionEvents: generationDiagnostics.rejectionEvents.map((entry) => ({
        ...entry,
        contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null,
        routeSearchTotalsByKind: entry.routeSearchTotalsByKind
          ? Object.fromEntries(Object.entries(entry.routeSearchTotalsByKind).map(([kind, bucket]) => [kind, { ...bucket }]))
          : null
      })),
      rejectionSummary: generationDiagnostics.rejectionSummary
        ? {
          ...generationDiagnostics.rejectionSummary,
          categories: generationDiagnostics.rejectionSummary.categories.map((entry) => ({
            ...entry,
            contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null
          }))
        }
        : null
    };
    return scenario;
  };

  while (attempt < effectiveMaxAttempts) {
    if (shouldStopRequested()) {
      terminationReason = "user-best-so-far";
      break;
    }

    if (attempt >= maxAttempts) {
      if (bestScenario || emergencyAttemptReserve <= 0) {
        terminationReason = "attempt-limit";
        break;
      }
      emergencyActivated = true;
      generationDiagnostics.emergencyActivated = true;
      generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    }

    const progressMaxAttempts = emergencyActivated ? effectiveMaxAttempts : maxAttempts;
    const workSnapshot = getAnalysisTelemetrySnapshotSafe();
    const softBudgetReached = (
      attempt >= softBudgetMinAttempts &&
      bestScenario &&
      (workSnapshot.totalExpansions ?? 0) >= softExpansionBudget
    );
    if (softBudgetReached) {
      terminationReason = "soft-expansion-budget";
      break;
    }

    const remainingAttempts = progressMaxAttempts - attempt;
    const attemptLabel = attempt + 1;
    const candidateStartedAt = generationNow();
    const telemetryBefore = getAnalysisTelemetrySnapshotSafe();
    const stageTimings = [];
    let lastStage = emergencyActivated
      ? "Finding a fallback course — no playable candidate yet"
      : "Setting up a new candidate";
    let stageStartedAt = candidateStartedAt;

    const recordStageBoundary = (nextStage) => {
      const now = generationNow();
      if (lastStage) {
        stageTimings.push({
          stage: compactGenerationStage(lastStage),
          ms: Number((now - stageStartedAt).toFixed(2))
        });
      }
      lastStage = nextStage;
      stageStartedAt = now;
    };

    if (onProgress) {
      await onProgress(attemptLabel, progressMaxAttempts, lastStage);
    }

    let result;
    try {
      result = await createRandomCandidate(
        assets,
        preferences,
        attemptLabel,
        remainingAttempts,
        async (localEvaluations) => {
          if (!onProgress || localEvaluations <= 1) {
            return;
          }
          const visibleAttempt = Math.min(progressMaxAttempts, attempt + localEvaluations);
          await onProgress(
            visibleAttempt,
            progressMaxAttempts,
            emergencyActivated
              ? "Finding a fallback course — trying another checkpoint layout"
              : "Trying another checkpoint layout on this board"
          );
        },
        async (stage, localEvaluations = 1, stageContext = null) => {
          recordStageBoundary(stage);
          if (!onProgress) {
            return;
          }
          const visibleAttempt = Math.min(progressMaxAttempts, attempt + Math.max(1, localEvaluations));
          await onProgress(visibleAttempt, progressMaxAttempts, stage, stageContext);
        },
        ({ evaluationsUsed: localEvaluations, bestScenario: candidateBestScenario }) => {
          if (shouldStopRequested()) {
            return true;
          }
          const completedEvaluations = attempt + Math.max(0, localEvaluations);
          if (completedEvaluations < softBudgetMinAttempts) {
            return false;
          }
          if (!bestScenario && !isViableFallbackScenario(candidateBestScenario)) {
            return false;
          }
          const work = getAnalysisTelemetrySnapshotSafe();
          return (work.totalExpansions ?? 0) >= softExpansionBudget;
        },
        shouldStopRequested
      );
    } catch (error) {
      if (error?.code === "ANALYSIS_STOP_REQUESTED" && shouldStopRequested()) {
        recordStageBoundary("Stopped");
        terminationReason = "user-best-so-far";
        break;
      }
      recordStageBoundary("Crashed");
      crashedAttempts += 1;
      lastAttemptError = error;
      attempt += 1;
      if (emergencyActivated) {
        generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
      }
      const telemetryAfter = getAnalysisTelemetrySnapshotSafe();
      const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
      generationDiagnostics.attempts.push({
        startAttempt: attemptLabel,
        endAttempt: attemptLabel,
        evaluationsUsed: 1,
        elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
        outcome: "crashed",
        reason: error?.message ?? String(error),
        stages: stageTimings,
        routeSearches: routeDelta.searches,
        routeExpansions: routeDelta.expansions,
        routeSearchMs: routeDelta.durationMs,
        cappedRouteSearches: routeDelta.capped,
        slowestRouteSearch: routeDelta.slowest,
        routeSearchTotalsByKind: routeDelta.totalsByKind,
        contextualSearches: routeDelta.contextualSearches,
        contextualExpansions: routeDelta.contextualExpansions,
        contextualDurationMs: routeDelta.contextualDurationMs,
        contextualProfile: routeDelta.contextualProfile
      });
      generationDiagnostics.rejectionEvents.push({
        evaluation: attemptLabel,
        category: "crash",
        reason: error?.message ?? String(error),
        routeSearches: routeDelta.searches,
        routeExpansions: routeDelta.expansions,
        routeSearchMs: routeDelta.durationMs,
        cappedRouteSearches: routeDelta.capped,
        contextualSearches: routeDelta.contextualSearches,
        contextualExpansions: routeDelta.contextualExpansions,
        contextualDurationMs: routeDelta.contextualDurationMs,
        contextualProfile: routeDelta.contextualProfile
      });
      console.warn(`Attempt ${attemptLabel} failed during generation`, error);
      continue;
    }

    const evaluationsUsed = Math.max(1, result.evaluationsUsed ?? 1);
    attempt += evaluationsUsed;
    if (emergencyActivated) {
      generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    }
    if (Array.isArray(result.rejectionEvents) && result.rejectionEvents.length) {
      generationDiagnostics.rejectionEvents.push(...result.rejectionEvents.map((entry) => ({
        ...entry,
        evaluation: attemptLabel + Math.max(0, (entry.evaluation ?? 1) - 1)
      })));
    }
    const scenario = result.scenario;
    const lastMeaningfulStage = lastStage;
    recordStageBoundary(scenario ? "Candidate complete" : "Candidate rejected");

    const telemetryAfter = getAnalysisTelemetrySnapshotSafe();
    const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
    const attemptRecord = {
      startAttempt: attemptLabel,
      endAttempt: attemptLabel + evaluationsUsed - 1,
      evaluationsUsed,
      elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
      outcome: scenario?.metrics?.acceptable ? "accepted" : "rejected",
      reason: scenario?.metrics?.acceptable
        ? "accepted"
        : describeGenerationRejection(scenario, lastMeaningfulStage),
      stages: stageTimings,
      routeSearches: routeDelta.searches,
      routeExpansions: routeDelta.expansions,
      routeSearchMs: routeDelta.durationMs,
      cappedRouteSearches: routeDelta.capped,
      slowestRouteSearch: routeDelta.slowest,
      routeSearchTotalsByKind: routeDelta.totalsByKind,
      contextualSearches: routeDelta.contextualSearches,
      contextualExpansions: routeDelta.contextualExpansions,
      contextualDurationMs: routeDelta.contextualDurationMs,
      contextualProfile: routeDelta.contextualProfile
    };
    generationDiagnostics.attempts.push(attemptRecord);

    if (!scenario) {
      if (shouldStopRequested()) {
        terminationReason = "user-best-so-far";
        break;
      }
      continue;
    }

    scenario.attempts = attempt;

    const scenarioFallbackScore = getFallbackScenarioScore(scenario);
    const bestFallbackScore = getFallbackScenarioScore(bestScenario);
    if (Number.isFinite(scenarioFallbackScore) && scenarioFallbackScore < bestFallbackScore) {
      bestScenario = scenario;
    }

    if (shouldStopRequested()) {
      terminationReason = "user-best-so-far";
      break;
    }

    if (scenario.metrics.acceptable) {
      terminationReason = "accepted";
      scenario.generationBestMatch = false;
      scenario.generationTerminationReason = terminationReason;
      attachDiagnostics(scenario);
      return {
        scenario,
        attemptsUsed: attempt,
        crashedAttempts,
        lastAttemptError,
        accepted: true,
        terminationReason,
        generationDiagnostics: scenario.generationDiagnostics
      };
    }

    if (emergencyActivated && attempt > maxAttempts && bestScenario) {
      terminationReason = "emergency-fallback-found";
      break;
    }

    if (onProgress && attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      await onProgress(
        attempt,
        progressMaxAttempts,
        emergencyActivated
          ? "Finding a fallback course — continuing the search"
          : "No exact fit yet — continuing the search"
      );
    }
  }

  if (!terminationReason) {
    terminationReason = attempt >= effectiveMaxAttempts
      ? (emergencyActivated ? "emergency-attempt-limit" : "attempt-limit")
      : "search-ended";
  }

  if (bestScenario) {
    bestScenario.generationBestMatch = !Boolean(bestScenario.metrics?.acceptable);
    bestScenario.generationTerminationReason = terminationReason;
    bestScenario.attempts = attempt;
  }
  attachDiagnostics(bestScenario);

  return {
    scenario: bestScenario,
    attemptsUsed: attempt,
    crashedAttempts,
    lastAttemptError,
    accepted: Boolean(bestScenario?.metrics?.acceptable),
    terminationReason,
    generationDiagnostics:
      bestScenario?.generationDiagnostics ?? generationDiagnostics
  };
}

function detectScenarioExplanationIssues(scenario) {
  const issues = [];
  const explanationHtml = buildCourseNotesHtml(scenario, [], { includeDiagnostics: true });
  const checks = [
    {
      active: scenario.metrics.difficultyDirection === "high",
      tokens: ["softens the board pressure", "makes recovery cleaner"]
    },
    {
      active: scenario.metrics.difficultyDirection === "low",
      tokens: [
        "planning more demanding",
        "less forgiving",
        "harder to plan ahead",
        "reduces planning flexibility",
        "extra uncertainty"
      ]
    },
    {
      active: scenario.metrics.lengthDirection === "high",
      tokens: ["keeps turns moving", "trims some board friction"]
    },
    {
      active: scenario.metrics.lengthDirection === "low",
      tokens: ["add extra repositioning"]
    }
  ];

  checks.forEach((check) => {
    if (!check.active) {
      return;
    }
    check.tokens.forEach((token) => {
      if (explanationHtml.includes(token)) {
        issues.push(`note-contradiction:${token}`);
      }
    });
  });

  return issues;
}

function buildDiagnosticsCases(basePreferences) {
  const cases = [];

  for (const playerCount of DIAGNOSTIC_PLAYER_COUNTS) {
    for (const difficulty of DIAGNOSTIC_DIFFICULTIES) {
      for (const length of DIAGNOSTIC_LENGTHS) {
        cases.push({
          label: `${playerCount}p ${difficulty} ${length}`,
          preferences: {
            ...basePreferences,
            playerCount,
            difficulty,
            length
          }
        });
      }
    }
  }

  return cases;
}

async function runDiagnostics() {
  const button = document.getElementById("run-diagnostics");
  const assets = await loadAssets();
  const basePreferences = getPreferencesFromControls();
  const cases = buildDiagnosticsCases(basePreferences);
  const results = [];
  const previousScenario = currentScenario;

  button.disabled = true;
  document.getElementById("dev-view").checked = true;
  updateDevView();
  setCourseEvaluationReportText(`Running diagnostics across ${cases.length} cases...\n`);

  for (const [index, testCase] of cases.entries()) {
    setCourseEvaluationReportText(`Running diagnostics: case ${index + 1} of ${cases.length}\nCurrent: ${testCase.label}\n`);
    const inventoryError = validateSelectedInventory(assets, testCase.preferences);
    if (inventoryError) {
      results.push({
        label: testCase.label,
        issues: [`inventory:${inventoryError}`]
      });
      continue;
    }

    clearAnalysisCachesSafe();
    const generation = await generateScenarioForPreferences(assets, testCase.preferences, {
      maxAttempts: DIAGNOSTIC_ATTEMPTS
    });
    const issues = [];

    if (!generation.scenario) {
      issues.push(generation.lastAttemptError
        ? `generation-failed:${generation.lastAttemptError.message}`
        : "generation-failed");
      results.push({
        label: testCase.label,
        issues,
        attemptsUsed: generation.attemptsUsed
      });
      continue;
    }

    renderScenario(generation.scenario);

    if (lastRenderDiagnostics.blankFallbackTriggered) {
      issues.push("blank-render");
    }
    issues.push(...generation.scenario.metrics.hardFailures);
    issues.push(...detectScenarioExplanationIssues(generation.scenario));

    results.push({
      label: testCase.label,
      issues: [...new Set(issues)],
      attemptsUsed: generation.attemptsUsed,
      accepted: generation.accepted,
      fitScore: generation.scenario.metrics.fitScore
    });
  }

  currentScenario = previousScenario;
  if (currentScenario) {
    renderScenario(currentScenario);
  }

  const failures = results.filter((item) => item.issues.length);
  const summaryLines = [
    `Diagnostics complete: ${results.length} cases`,
    `Failures: ${failures.length}`,
    ""
  ];

  if (failures.length) {
    failures.forEach((failure) => {
      summaryLines.push(`${failure.label}: ${failure.issues.join(", ")}${failure.fitScore !== undefined ? ` | fit ${failure.fitScore}` : ""}${failure.attemptsUsed ? ` | attempts ${failure.attemptsUsed}` : ""}`);
    });
  } else {
    summaryLines.push("No diagnostic issues detected in the sampled matrix.");
  }

  setCourseEvaluationReportText(summaryLines.join("\n"));
  button.disabled = false;
}


// Calibration API -----------------------------------------------------------
//
// The calibration harness deliberately reuses production construction and route
// semantics, but it is not a second generator. Internal calibration preferences
// only broaden sampling, force requested counts, preserve target misses as data,
// and expose cheap construction evidence. Browser generation never emits them.
// Missing calibration output therefore cannot affect correctness.

function getCalibrationExpansionIds(pieceMap = {}) {
  return [...new Set(
    Object.values(pieceMap)
      .map((piece) => piece?.expansionId)
      .filter(Boolean)
  )].sort();
}

function normalizeCalibrationExpansionIds(pieceMap = {}, requestedIds = null) {
  const available = new Set(getCalibrationExpansionIds(pieceMap));
  const requested = Array.isArray(requestedIds) && requestedIds.length
    ? requestedIds.filter((id) => available.has(id))
    : [...available];
  return [...new Set(requested)].sort();
}

function buildCalibrationVariantStates(forcedVariantIds = []) {
  const states = Object.fromEntries(
    VARIANT_DEFINITIONS.map((variant) => [variant.id, "off"])
  );
  for (const variantId of forcedVariantIds) {
    if (Object.prototype.hasOwnProperty.call(states, variantId)) {
      states[variantId] = "forced";
    }
  }
  return states;
}

function getCalibrationStaticDistance(tileMap, from, to) {
  if (!from || !to) return null;
  if (from.x === to.x && from.y === to.y) return 0;
  const startKey = `${from.x},${from.y}`;
  const goalKey = `${to.x},${to.y}`;
  if (!tileMap.has(startKey) || !tileMap.has(goalKey)) return null;
  const directions = [
    { dir: "N", dx: 0, dy: -1 },
    { dir: "E", dx: 1, dy: 0 },
    { dir: "S", dx: 0, dy: 1 },
    { dir: "W", dx: -1, dy: 0 }
  ];
  const queue = [{ x: from.x, y: from.y, distance: 0 }];
  const visited = new Set([startKey]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of directions) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      const tile = tileMap.get(key);
      if (!tile || (tile.features || []).some((feature) => feature.type === "pit")) continue;
      if (isBlockedBetween(tileMap, current, next, direction.dir)) continue;
      const distance = current.distance + 1;
      if (key === goalKey) return distance;
      visited.add(key);
      queue.push({ ...next, distance });
    }
  }
  return null;
}

function summarizeCalibrationBoardProfiles(boardPlacements = [], pieceMap = {}) {
  const boards = boardPlacements.map((placement, index) => {
    const piece = pieceMap[placement.pieceId];
    const profile = piece?.boardProfile ?? null;
    const rect = piece ? getPlacedRect(piece, placement) : null;
    return {
      index,
      pieceId: placement.pieceId,
      physicalBoardId: piece ? getPhysicalBoardId(piece) : placement.pieceId,
      expansionId: piece?.expansionId ?? null,
      kind: piece?.kind ?? null,
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y,
      width: rect?.width ?? null,
      height: rect?.height ?? null,
      profile: profile ? {
        overall: Number(profile.overall ?? 0),
        hazard: Number(profile.bias?.hazard ?? 0),
        congestion: Number(profile.bias?.congestion ?? 0),
        complexity: Number(profile.bias?.complexity ?? 0),
        swinginess: Number(profile.swinginess ?? 0),
        density: Number(profile.density ?? 0)
      } : null
    };
  });
  const meanProfile = (key) => {
    const values = boards.map((board) => Number(board.profile?.[key])).filter(Number.isFinite);
    return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : null;
  };
  return {
    boards,
    means: {
      overall: meanProfile("overall"),
      hazard: meanProfile("hazard"),
      congestion: meanProfile("congestion"),
      complexity: meanProfile("complexity"),
      swinginess: meanProfile("swinginess"),
      density: meanProfile("density")
    }
  };
}

function summarizeCalibrationLayout(boardPlacements = [], pieceMap = {}) {
  const rects = buildBoardRects(boardPlacements, pieceMap);
  if (!rects.length) {
    return {
      bboxWidth: null,
      bboxHeight: null,
      bboxArea: null,
      boardArea: null,
      compactness: null,
      adjacencyCount: 0,
      sharedEdge: 0,
      graphDiameter: null
    };
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;
  const bboxArea = bboxWidth * bboxHeight;
  const boardArea = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const adjacency = new Map(rects.map((_, index) => [index, new Set()]));
  let adjacencyCount = 0;
  let sharedEdge = 0;
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      const a = rects[left];
      const b = rects[right];
      let edge = 0;
      if (a.x + a.width === b.x || b.x + b.width === a.x) {
        edge = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
      } else if (a.y + a.height === b.y || b.y + b.height === a.y) {
        edge = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
      }
      if (edge <= 0) continue;
      adjacency.get(left).add(right);
      adjacency.get(right).add(left);
      adjacencyCount += 1;
      sharedEdge += edge;
    }
  }
  let graphDiameter = 0;
  for (let source = 0; source < rects.length; source += 1) {
    const distances = new Map([[source, 0]]);
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const next of adjacency.get(current) ?? []) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(current) + 1);
        queue.push(next);
      }
    }
    for (const distance of distances.values()) graphDiameter = Math.max(graphDiameter, distance);
  }
  return {
    bboxWidth,
    bboxHeight,
    bboxArea,
    boardArea,
    compactness: bboxArea > 0 ? Number((boardArea / bboxArea).toFixed(4)) : null,
    adjacencyCount,
    sharedEdge,
    graphDiameter
  };
}

function buildCalibrationConstructionSnapshot({
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = [],
  starts = [],
  tileMap = new Map(),
  pieceMap = {},
  preferences = {}
} = {}) {
  const profileSummary = summarizeCalibrationBoardProfiles(boardPlacements, pieceMap);
  const layout = summarizeCalibrationLayout(boardPlacements, pieceMap);
  const checkpointRows = checkpoints.map((checkpoint, index) => {
    const boardUse = getCandidateBoardDepth(checkpoint, boardPlacements, pieceMap);
    const approach = getFlagCandidateApproachStats(tileMap, checkpoint);
    const previous = index > 0 ? checkpoints[index - 1] : null;
    return {
      index,
      x: checkpoint.x,
      y: checkpoint.y,
      boardIndex: boardUse.boardIndex,
      boardDepth: boardUse.depth,
      openApproaches: approach.openCount,
      blockedApproaches: approach.blockedCount,
      pitApproaches: approach.pitCount,
      voidApproaches: approach.voidCount,
      convergencePotential: approach.convergencePotential,
      featureTypes: [...new Set((tileMap.get(`${checkpoint.x},${checkpoint.y}`)?.features || []).map((feature) => feature.type).filter(Boolean))].sort(),
      manhattanFromPrevious: previous ? manhattanDistance(previous, checkpoint) : null,
      staticDistanceFromPrevious: previous ? getCalibrationStaticDistance(tileMap, previous, checkpoint) : null
    };
  });
  const first = checkpoints[0] ?? null;
  const firstManhattan = first
    ? starts.map((start) => manhattanDistance(start, first)).filter(Number.isFinite)
    : [];
  const firstStatic = first
    ? starts.map((start) => getCalibrationStaticDistance(tileMap, start, first)).filter(Number.isFinite)
    : [];
  const mean = (values) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : null;
  const finiteCheckpointValues = (key) => checkpointRows.map((row) => Number(row[key])).filter(Number.isFinite);
  const sequentialManhattan = finiteCheckpointValues("manhattanFromPrevious");
  const sequentialStatic = finiteCheckpointValues("staticDistanceFromPrevious");
  const depths = finiteCheckpointValues("boardDepth");
  const convergence = finiteCheckpointValues("convergencePotential");
  const representedBoards = new Set(checkpointRows.map((row) => row.boardIndex).filter((index) => index >= 0));
  const overlayBoardCount = overlayPlacements.filter((placement) => !isMiniOverlayPiece(pieceMap[placement.pieceId])).length;
  const overlayTileCount = overlayPlacements.length - overlayBoardCount;
  return {
    boardCount: boardPlacements.length,
    flagCount: checkpoints.length,
    startCount: starts.length,
    dockCount: dockPlacements.length,
    overlayCount: overlayPlacements.length,
    overlayBoardCount,
    overlayTileCount,
    boardProfiles: profileSummary,
    docks: dockPlacements.map((placement) => ({
      pieceId: placement.pieceId,
      expansionId: pieceMap[placement.pieceId]?.expansionId ?? null,
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y
    })),
    overlays: overlayPlacements.map((placement) => ({
      pieceId: placement.pieceId,
      expansionId: pieceMap[placement.pieceId]?.expansionId ?? null,
      kind: isMiniOverlayPiece(pieceMap[placement.pieceId]) ? "tile" : "board",
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y
    })),
    layout,
    checkpoints: checkpointRows,
    shape: {
      firstStartManhattanMean: mean(firstManhattan),
      firstStartManhattanMin: firstManhattan.length ? Math.min(...firstManhattan) : null,
      firstStartStaticMean: mean(firstStatic),
      firstStartStaticMin: firstStatic.length ? Math.min(...firstStatic) : null,
      sequentialManhattanSum: sequentialManhattan.length ? sequentialManhattan.reduce((sum, value) => sum + value, 0) : 0,
      sequentialManhattanMean: mean(sequentialManhattan),
      sequentialStaticSum: sequentialStatic.length ? sequentialStatic.reduce((sum, value) => sum + value, 0) : 0,
      sequentialStaticMean: mean(sequentialStatic),
      finalManhattan: sequentialManhattan.length ? sequentialManhattan.at(-1) : null,
      finalStaticDistance: sequentialStatic.length ? sequentialStatic.at(-1) : null,
      convergenceMean: mean(convergence),
      convergenceMax: convergence.length ? Math.max(...convergence) : null,
      boardDepthMean: mean(depths),
      boardDepthMin: depths.length ? Math.min(...depths) : null,
      boardDepthMax: depths.length ? Math.max(...depths) : null,
      representedBoardCount: representedBoards.size,
      shallowCheckpointCount: depths.filter((depth) => depth <= 1).length
    },
    requestContext: {
      difficulty: preferences.difficulty ?? null,
      length: preferences.length ?? null,
      recoveryRule: preferences.recoveryRule ?? null,
      generationMode: preferences.generationMode ?? null,
      guidanceStrength: getConstructionGuidanceStrength(preferences),
      calibrationBoardOverlayCount: preferences.calibrationBoardOverlayCount != null &&
        Number.isInteger(Number(preferences.calibrationBoardOverlayCount))
        ? Number(preferences.calibrationBoardOverlayCount)
        : null,
      checkpointSamplingRegime: getCalibrationCheckpointSamplingRegime(preferences)
    }
  };
}

function summarizeCalibrationTelemetry(telemetry = null) {
  if (!telemetry) return null;
  const byKind = Object.fromEntries(Object.entries(telemetry.totalsByKind ?? {}).map(([kind, value]) => [kind, {
    searches: Number(value?.searches ?? value?.count ?? 0),
    expansions: Number(value?.expansions ?? 0),
    capped: Number(value?.capped ?? 0),
    durationMs: Number(value?.durationMs ?? 0)
  }]));
  return {
    routeSearchCount: Number(telemetry.routeSearchCount ?? 0),
    totalExpansions: Number(telemetry.totalExpansions ?? 0),
    totalDurationMs: Number(Number(telemetry.totalDurationMs ?? 0).toFixed(3)),
    cappedSearches: Number(telemetry.cappedSearches ?? 0),
    totalsByKind: byKind
  };
}

function summarizeCalibrationScenario(assets, scenario) {
  if (!scenario) return null;
  const { pieceMap } = assets;
  const boardPlacements = scenario.placements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return !placement.overlay && piece?.kind !== "dock";
  });
  const dockPlacements = getDockPlacementsFromScenarioPlacements(scenario.placements, pieceMap);
  const overlayPlacements = scenario.placements.filter((placement) => placement.overlay);
  const tileMap = buildResolvedMap(scenario.placements, pieceMap).tileMap;
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints ?? [], scenario.virtualBots);
  const construction = buildCalibrationConstructionSnapshot({
    boardPlacements,
    dockPlacements,
    overlayPlacements,
    checkpoints: playableCheckpoints,
    starts: scenario.activeStarts ?? [],
    tileMap,
    pieceMap,
    preferences: scenario.preferences ?? {}
  });
  const metrics = scenario.metrics ?? {};
  const contextualCache = scenario.sequence?.firstLeg?.summary?.contextualLegCache ?? null;
  return {
    construction,
    outcome: {
      acceptable: Boolean(metrics.acceptable),
      hardFailures: [...(metrics.hardFailures ?? [])],
      difficultyRaw: Number.isFinite(Number(metrics.difficultyRaw)) ? Number(metrics.difficultyRaw) : null,
      lengthRaw: Number.isFinite(Number(metrics.lengthRaw)) ? Number(metrics.lengthRaw) : null,
      difficultyFit: Number.isFinite(Number(metrics.difficultyFit)) ? Number(metrics.difficultyFit) : null,
      lengthFit: Number.isFinite(Number(metrics.lengthFit)) ? Number(metrics.lengthFit) : null,
      fitScore: Number.isFinite(Number(metrics.fitScore)) ? Number(metrics.fitScore) : null,
      reachableStarts: Number(metrics.reachableStarts ?? scenario.validatedStartIndices?.length ?? 0),
      usableStarts: Array.isArray(metrics.usableStarts) ? metrics.usableStarts.length : Number(metrics.usableStarts ?? 0),
      openingFastestActions: metrics.openingLegAnticlimax?.fastestActions ?? null,
      openingPacingPenalty: metrics.openingLegAnticlimax?.penalty ?? 0,
      finalFastestActions: metrics.finalLegAnticlimax?.fastestActions ?? null,
      finalPacingPenalty: metrics.finalLegAnticlimax?.penalty ?? 0,
      meaningfulBoardUsePenalty: metrics.meaningfulBoardUse?.penalty ?? 0,
      routedBoardUse: (metrics.meaningfulBoardUse?.boards ?? []).map((board) => ({
        boardIndex: board.boardIndex,
        uniqueRouteTiles: board.uniqueRouteTiles,
        routeVisits: board.routeVisits
      })),
      trafficAveragePenalty: scenario.sequence?.firstLeg?.summary?.fullCourseTraffic?.averagePenalty ?? null,
      trafficAverageRawPenalty: scenario.sequence?.firstLeg?.summary?.fullCourseTraffic?.averageRawPenalty ?? null,
      estimatedPhysicalRoutes: contextualCache?.estimatedMilestoneRoutes ?? null,
      exactRealizedRoutes: contextualCache?.survivingStarts ?? null
    }
  };
}

export async function loadCalibrationAssets() {
  return loadAssets();
}

export function describeCalibrationInventory(assets, requestedExpansionIds = null) {
  const pieceMap = assets?.pieceMap ?? {};
  const expansionIds = normalizeCalibrationExpansionIds(pieceMap, requestedExpansionIds);
  const expansionSet = new Set(expansionIds);
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionSet);
  const dockIds = getAvailableDockIds(pieceMap, expansionSet);
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionSet);
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  return {
    expansionIds,
    baseExpansionId: pieceMap["docking-bay-a"]?.expansionId ?? "roborally",
    mainBoardIds,
    dockIds,
    overlayBoardIds: overlayIds.filter((id) => !isMiniOverlayPiece(pieceMap[id])),
    overlayTileIds: overlayIds.filter((id) => isMiniOverlayPiece(pieceMap[id])),
    physicalBoardCount: countPhysicalBoards(mainBoardIds, pieceMap),
    maxBoardCount: Math.min(hasLargeBoards ? 4 : 6, countPhysicalBoards(mainBoardIds, pieceMap)),
    maxSingleDockStartCount: dockIds.reduce((maximum, dockId) => (
      Math.max(maximum, pieceMap[dockId]?.starts?.length ?? 0)
    ), 0),
    hasLargeBoards,
    expansionSummary: expansionIds.map((expansionId) => {
      const pieces = Object.values(pieceMap).filter((piece) => piece.expansionId === expansionId);
      const boards = pieces.filter((piece) => piece.kind === "base" || piece.kind === "small");
      const overlays = pieces.filter((piece) => piece.overlayCapable);
      return {
        expansionId,
        boardFaces: boards.length,
        largeBoardFaces: boards.filter((piece) => piece.kind !== "small").length,
        smallBoardFaces: boards.filter((piece) => piece.kind === "small").length,
        docks: pieces.filter((piece) => piece.kind === "dock").length,
        overlayBoards: overlays.filter((piece) => !isMiniOverlayPiece(piece)).length,
        overlayTiles: overlays.filter((piece) => isMiniOverlayPiece(piece)).length
      };
    })
  };
}

export async function generateCalibrationObservation(assets, options = {}) {
  const inventory = describeCalibrationInventory(assets, options.expansionIds);
  if (!inventory.expansionIds.length) throw new Error("No supported expansion data selected for calibration.");
  const playerCount = Math.max(2, Math.floor(Number(options.playerCount) || 4));
  const boardCount = Math.max(1, Math.floor(Number(options.boardCount) || 1));
  const flagCount = Math.max(1, Math.floor(Number(options.flagCount) || 2));
  const difficulty = DIAGNOSTIC_DIFFICULTIES.includes(options.difficulty) ? options.difficulty : "moderate";
  const length = DIAGNOSTIC_LENGTHS.includes(options.length) ? options.length : "moderate";
  const generationMode = normalizeGenerationMode(options.generationMode ?? "balanced");
  const overlayMode = normalizeOverlayMode(options.overlayMode ?? OVERLAY_MODES.no);
  const forcedVariantIds = Array.isArray(options.forcedVariantIds) ? options.forcedVariantIds : [];
  const selectedExpansions = Object.fromEntries(inventory.expansionIds.map((id) => [id, true]));
  const preferences = {
    playerCount,
    difficulty,
    length,
    generationMode,
    overlayMode,
    selectedExpansions,
    allowedVariantRules: buildCalibrationVariantStates(forcedVariantIds),
    calibrationBoardCount: boardCount,
    calibrationFlagCount: flagCount,
    calibrationUnguidedBoardSelection: options.unguidedBoardSelection !== false,
    calibrationCheckpointSamplingRegime: CALIBRATION_CHECKPOINT_SAMPLING_REGIMES.includes(options.checkpointSamplingRegime)
      ? options.checkpointSamplingRegime
      : "ordinary",
    calibrationObserveTargetMisses: true,
    calibrationSingleCheckpointProposal: options.singleCheckpointProposal !== false,
    calibrationCaptureEvidence: true,
    calibrationBoardOverlayCount: options.boardOverlayCount != null &&
      Number.isInteger(Number(options.boardOverlayCount))
      ? Math.max(0, Math.floor(Number(options.boardOverlayCount)))
      : null,
    calibrationConstructionGuidanceStrength: Number.isFinite(Number(options.guidanceStrength))
      ? Number(options.guidanceStrength)
      : 1
  };

  resetAnalysisTelemetrySafe();
  clearAnalysisCachesSafe();
  const startedAt = generationNow();
  const seed = Number.isFinite(Number(options.seed)) ? (Math.floor(Number(options.seed)) >>> 0) : null;

  // Calibration deliberately samples broad setup/inventory combinations. A setup
  // which the ordinary UI would reject is not a generator exception and must not
  // pollute the harness error rate. Preserve it as an explicit skipped observation
  // so the runner can rebalance the sampling plan later if a stratum produces too
  // many impossible setup requests.
  const inventoryError = validateSelectedInventory(assets, preferences);
  if (inventoryError) {
    const telemetry = getAnalysisTelemetrySnapshotSafe();
    return {
      scenario: null,
      evaluationsUsed: 0,
      rejectionEvents: [{
        category: "setup-invalid",
        reason: inventoryError
      }],
      calibrationConstructionSnapshot: null,
      calibrationStatus: "setup-invalid",
      preferences,
      inventory,
      elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
      telemetrySummary: summarizeCalibrationTelemetry(telemetry),
      evidence: null
    };
  }

  let result;
  try {
    result = await withGenerationRandomSeed(seed, () => createRandomCandidate(
      assets,
      preferences,
      1,
      1,
      null,
      null,
      null
    ));
  } catch (error) {
    // createRandomCandidate historically throws when the sampled board faces and
    // dock cannot form a legal physical layout. Browser generation treats that as
    // an attempt failure and tries another construction. In calibration one attempt
    // is the observation, so this is evidence rather than a harness error.
    if (error?.message === "Unable to create a valid board layout") {
      const telemetry = getAnalysisTelemetrySnapshotSafe();
      return {
        scenario: null,
        evaluationsUsed: 1,
        rejectionEvents: [{
          category: "board-layout",
          reason: error.message
        }],
        calibrationConstructionSnapshot: null,
        calibrationStatus: "construction-rejection",
        preferences,
        inventory,
        elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
        telemetrySummary: summarizeCalibrationTelemetry(telemetry),
        evidence: null
      };
    }
    throw error;
  }

  const telemetry = getAnalysisTelemetrySnapshotSafe();
  return {
    ...result,
    calibrationStatus: result?.scenario
      ? "scenario"
      : (result?.calibrationConstructionSnapshot ? "analyzed-rejection" : "construction-rejection"),
    preferences,
    inventory,
    elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
    telemetrySummary: summarizeCalibrationTelemetry(telemetry),
    evidence: result?.scenario
      ? summarizeCalibrationScenario(assets, result.scenario)
      : (result?.calibrationConstructionSnapshot
        ? { construction: result.calibrationConstructionSnapshot, outcome: null }
        : null)
  };
}

function analyzeCalibrationPlacements(assets, sourceScenario, placements, options = {}) {
  if (!placements?.length || !sourceScenario?.checkpoints?.length) return null;
  const { pieceMap } = assets;
  const playerCount = Math.max(2, Math.floor(Number(options.playerCount ?? sourceScenario.playerCount) || 4));
  const generationMode = normalizeGenerationMode(options.generationMode ?? sourceScenario.preferences?.generationMode ?? "balanced");
  const difficulty = DIAGNOSTIC_DIFFICULTIES.includes(sourceScenario.preferences?.difficulty)
    ? sourceScenario.preferences.difficulty
    : "moderate";
  const length = DIAGNOSTIC_LENGTHS.includes(sourceScenario.preferences?.length)
    ? sourceScenario.preferences.length
    : "moderate";
  const forcedVariantIds = options.dynamicArchiving ? ["dynamicArchiving"] : [];
  const variantBundle = buildVariantBundle(
    Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, forcedVariantIds.includes(variant.id)])),
    { pieceMap }
  );
  const recoveryRule = variantBundle.recoveryRule ?? "reboot_tokens";
  const checkpoints = getPlayableCheckpoints(sourceScenario.checkpoints, sourceScenario.virtualBots);
  const boardPlacements = placements.filter((placement) => {
    const kind = pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, pieceMap);
  const boardRects = buildBoardRects(boardPlacements, pieceMap);
  const resolved = buildResolvedMap(placements, pieceMap);
  const tileMap = resolved.tileMap;
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags: false, movingTargets: false });
  const activeStarts = filterStartsForGoals(resolved.starts, checkpoints).map((start, index) => ({ ...start, analysisIndex: index }));
  const rebootTokens = recoveryRule === "reboot_tokens"
    ? placeRebootTokens(boardRects, tileMap, checkpoints, playerCount)
    : [];
  const baseOptions = applyVariantAnalysisOptions({
    ...getRouteAnalysisVariantOptions({
      ...(sourceScenario.preferences ?? {}),
      difficulty,
      length,
      generationMode
    }),
    rebootTokens,
    boardRects,
    difficulty,
    length,
    generationMode,
    contextualEarlyExit: true
  }, variantBundle);
  const routeAwareOptions = buildRouteAwareBatteryScoringOptions(null, { ...baseOptions, ...variantBundle });
  const profile = getGenerationModeProfile({ generationMode });
  const analysisOptions = {
    ...baseOptions,
    ...routeAwareOptions,
    contextualFastCardState: true,
    contextualEstimatedEnergyGuidance: true,
    fastBaselineTrafficEnabled: profile.trafficEnabled,
    modeTrafficEnabled: profile.trafficEnabled,
    trafficEnabledOverride: profile.trafficEnabled,
    contextualTrafficFeedbackEnabled: profile.trafficEnabled && profile.trafficEpochs > 0,
    contextualTrafficDrivenAlternates: profile.trafficEnabled && profile.trafficEpochs > 0,
    contextualTrafficEpochs: profile.trafficEpochs,
    contextualTrafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
    contextualTrafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
    contextualTrafficAlternateMaxNewSearchesPerEpoch: profile.trafficAlternateMaxNewSearchesPerEpoch,
    contextualTrafficAlternateExpansions: profile.trafficAlternateExpansions,
    contextualTrafficAlternateMaxActions: profile.trafficAlternateMaxActions,
    contextualTrafficAlternateCachedProbeMargin: profile.trafficAlternateCachedProbeMargin,
    contextualTrafficAlternateCachedProbeMaxSimilarity: profile.trafficAlternateCachedProbeMaxSimilarity,
    contextualTrafficAlternateLegsPerStart: profile.trafficAlternateLegsPerStart,
    contextualTrafficExplorationUncertaintyShare: profile.trafficExplorationUncertaintyShare,
    contextualTrafficExplorationConfidenceFloor: profile.trafficExplorationConfidenceFloor,
    contextualTrafficAlternateUncertaintyEffortFloor: profile.trafficAlternateUncertaintyEffortFloor,
    contextualTrafficAlternateUncertaintyEffortExponent: profile.trafficAlternateUncertaintyEffortExponent,
    contextualSharedLaterLegCatalogue: true,
    contextualEstimatedPrimaryRouting: true,
    contextualPhysicalTemplateRoutes: profile.primaryWitnessRoutes,
    contextualPrimaryWitnessRoutes: profile.primaryWitnessRoutes,
    contextualPhysicalTemplateExpansions: 700,
    contextualPhysicalTemplateMaxActions: 36,
    contextualExactRepairExpansions: 380,
    contextualRequiredStarts: playerCount
  };

  resetAnalysisTelemetrySafe();
  clearAnalysisCachesSafe();
  const startedAt = generationNow();
  const sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, playerCount, analysisOptions);
  const metrics = classifyCandidate(sequence, {
    ...(sourceScenario.preferences ?? {}),
    playerCount,
    difficulty,
    length,
    generationMode,
    flagCount: checkpoints.length,
    recoveryRule,
    ...variantBundle
  }, {
    boardPlacements,
    pieceMap,
    checkpoints,
    tileMap,
    goalTileMap
  });
  const telemetry = getAnalysisTelemetrySnapshotSafe();
  const syntheticScenario = {
    ...sourceScenario,
    placements,
    overlayPlacements: placements.filter((placement) => placement.overlay),
    dockPlacements,
    boardRects,
    checkpoints,
    rebootTokens,
    activeStarts,
    sequence,
    metrics,
    playerCount,
    recoveryRule,
    preferences: {
      ...(sourceScenario.preferences ?? {}),
      playerCount,
      difficulty,
      length,
      generationMode,
      recoveryRule
    }
  };
  return {
    elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
    telemetrySummary: summarizeCalibrationTelemetry(telemetry),
    evidence: summarizeCalibrationScenario(assets, syntheticScenario)
  };
}

export function reanalyzeCalibrationScenario(assets, sourceScenario, options = {}) {
  if (!sourceScenario?.placements?.length || !sourceScenario?.checkpoints?.length) return null;
  const placements = options.removeOverlays
    ? sourceScenario.placements.filter((placement) => !placement.overlay)
    : sourceScenario.placements;
  return analyzeCalibrationPlacements(assets, sourceScenario, placements, options);
}


async function start() {
  const preferences = getPreferencesFromControls();
  const generationProfile = getGenerationModeProfile(preferences);
  const maxAttempts = generationProfile.maxAttempts;
  generationStopRequested = false;
  setGenerationStopControlState(false);
  isGenerating = true;

  try {
    resetAnalysisTelemetrySafe();
    setGeneratingOverlay(
      true,
      "",
      {
        attempt: 1,
        maxAttempts,
        stage: "Loading course assets",
        preferences
      }
    );
    await nextFrame();
    const assets = await loadAssets();
    initializeBoardAudit(assets);
    const inventoryError = validateSelectedInventory(assets, preferences);
    if (inventoryError) {
      window.alert(inventoryError);
      return;
    }

    clearAnalysisCachesSafe();
    const frozenTestSeed = Number.isInteger(devFrozenGenerationSeed)
      ? devFrozenGenerationSeed
      : null;
    let lastGenerationUiYieldAt = 0;
    let effectivePreferences = preferences;
    let anyTargetResolution = null;
    const runGeneration = () => {
      const resolved = resolveAnyPreferencesForGeneration(preferences);
      effectivePreferences = resolved.effectivePreferences;
      anyTargetResolution = resolved.resolution;
      return generateScenarioForPreferences(assets, effectivePreferences, {
        maxAttempts,
        emergencyAttemptReserve: GENERATION_EMERGENCY_ATTEMPT_RESERVE,
        shouldStopRequested: () => generationStopRequested,
        onProgress: async (attempt, maxAttempts, stage = "", stageContext = null) => {
          setGeneratingOverlay(
            true,
            "",
            {
              attempt,
              maxAttempts,
              stage,
              preferences,
              stageContext
            }
          );
          // v12: stage messages can arrive much faster than the display can use
          // them. Keep the DOM text current, but only force a render/yield at a
          // bounded cadence instead of pausing the CPU search for every message.
          const now = generationNow();
          if (now - lastGenerationUiYieldAt >= 75) {
            lastGenerationUiYieldAt = now;
            await nextFrame();
          }
        }
      });
    };
    const generation = frozenTestSeed === null
      ? await runGeneration()
      : await withGenerationRandomSeed(frozenTestSeed, runGeneration);

    if (!generation.scenario) {
      if (generation.terminationReason === "user-best-so-far") {
        showToast("No course found yet.");
      } else {
        window.alert(
          generation.crashedAttempts > 0 && generation.lastAttemptError
            ? `No playable course was found after ${generation.attemptsUsed} attempts. Last error: ${generation.lastAttemptError.message}`
            : `No playable course was found after ${generation.attemptsUsed} attempts.`
        );
      }
      return;
    }

    generation.scenario.effectiveTargetPreferences = {
      difficulty: effectivePreferences.difficulty,
      length: effectivePreferences.length
    };
    generation.scenario.preferences = {
      ...(generation.scenario.preferences ?? {}),
      difficulty: preferences.difficulty,
      length: preferences.length
    };
    if (anyTargetResolution && generation.scenario.generationDiagnostics) {
      generation.scenario.generationDiagnostics.anyTargetResolution = { ...anyTargetResolution };
    }

    if (frozenTestSeed !== null) {
      generation.scenario.devTestSeed = frozenTestSeed;
    }
    currentScenario = generation.scenario;
    clearTraceStarts();
    clearRouteInspection();
    await ensureScenarioImages(assets, currentScenario);
    pruneImageCache(assets, [
      ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
      boardAuditState.pieceId
    ]);
    renderScenario(currentScenario);
    saveScenarioSnapshot(currentScenario);
    lastScenarioRenderTime = performance.now();
  } finally {
    isGenerating = false;
    setGeneratingOverlay(false);
    generationStopRequested = false;
    setGenerationStopControlState(false);
  }
}

if (typeof document !== "undefined") {
  document.getElementById("reroll").addEventListener("click", () => {
    start().catch(console.error);
  });

  document.getElementById("use-best-so-far")?.addEventListener("click", () => {
    requestGenerationStop();
  });

  document.getElementById("about-button").addEventListener("click", () => {
    openAboutDialog();
  });
  document.getElementById("canvas")?.addEventListener("click", (event) => {
    if (!currentScenario || !isDevViewEnabled()) return;
    const tile = getCanvasTileFromEvent(event);
    applyRouteInspection(getInspectableAtTile(currentScenario, tile));
    renderScenario(currentScenario);
  });

  document.getElementById("canvas")?.addEventListener("dblclick", (event) => {
    if (!currentScenario || !isDevViewEnabled()) return;
    event.preventDefault();
    const tile = getCanvasTileFromEvent(event);
    const legValue = document.getElementById("leg-select")?.value ?? "all";
    const legIndex = legValue === "all" ? null : Number(legValue);
    if (tileTouchesVisibleTrace(currentScenario, tile, legIndex)) {
      selectAllTraceStarts(currentScenario);
    } else {
      clearTraceStarts();
      clearRouteInspection();
    }
    renderScenario(currentScenario);
  });



  document.getElementById("run-diagnostics").addEventListener("click", () => {
    runDiagnostics().catch((error) => {
      setCourseEvaluationReportText(`Diagnostics failed: ${error.message}`);
      document.getElementById("run-diagnostics").disabled = false;
      console.error(error);
    });
  });

  async function copyTextToClipboard(text, button, idleLabel, errorContext = "text") {
    if (!text?.trim()) {
      return;
    }

    try {
      let copied = false;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          const plainText = new Blob([text], { type: "text/plain" });
          await navigator.clipboard.write([
            new ClipboardItem({ "text/plain": plainText })
          ]);
          copied = true;
        } catch (error) {
          console.debug("Explicit text/plain clipboard write unavailable; falling back", error);
        }
      }
      if (!copied && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) {
          throw new Error("Copy command was not available");
        }
      }

      if (button) {
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = idleLabel;
        }, 1400);
      }
    } catch (error) {
      console.warn(`Unable to copy ${errorContext}`, error);
      if (button) {
        button.textContent = "Copy failed";
        window.setTimeout(() => {
          button.textContent = idleLabel;
        }, 1800);
      }
    }
  }

  async function copyCourseEvaluationSummary() {
    if (!currentScenario) {
      return;
    }
    const button = document.getElementById("copy-course-evaluation-summary");
    const text = buildScenarioCopySummary(currentScenario);
    await copyTextToClipboard(text, button, "Copy summary", "Course Evaluation summary");
  }

  async function copyCourseEvaluationAll() {
    const button = document.getElementById("copy-course-evaluation-all");
    const text = getCourseEvaluationReportText();
    await copyTextToClipboard(text, button, "Copy all", "Course Evaluation");
  }

  document.getElementById("copy-course-evaluation-summary")?.addEventListener("click", () => {
    copyCourseEvaluationSummary();
  });

  document.getElementById("copy-course-evaluation-all")?.addEventListener("click", () => {
    copyCourseEvaluationAll();
  });

  document.getElementById("about-close-icon").addEventListener("click", () => {
    closeAboutDialog();
  });

  document.getElementById("about-close-button").addEventListener("click", () => {
    closeAboutDialog();
  });

  document.getElementById("about-dialog").addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog) {
      closeAboutDialog();
    }
  });

  document.getElementById("leg-select").addEventListener("change", () => {
    if (currentScenario) renderScenario(currentScenario);
  });

  document.getElementById("board-view-mode").addEventListener("change", () => {
    if (currentScenario) {
      renderScenario(currentScenario);
    }
  });

  document.getElementById("course-explanation-toggle").addEventListener("click", () => {
    if (!currentScenario) {
      return;
    }

    const requestedDifficulty = currentScenario.preferences.difficulty;
    const difficultyFit = currentScenario.metrics.difficultyFit ?? 0;
    const lengthFit = currentScenario.metrics.lengthFit ?? 0;
    const moderateDifficultyThreshold = requestedDifficulty === "easy" ? 20 : 14;
    const autoOpen = (
      currentScenario.generationBestMatch ||
      (currentScenario.preferences.difficulty !== "any" && difficultyFit >= moderateDifficultyThreshold) ||
      (currentScenario.preferences.length !== "any" && lengthFit >= 14)
    );
    const currentlyVisible = Boolean(
      courseExplanationState.userPinnedOpen ||
      (
        autoOpen &&
        courseExplanationState.manualClosedScenarioRef !== currentScenario
      )
    );
    if (currentlyVisible) {
      // Closing an explicitly pinned panel ends the cross-generation preference.
      // Closing an auto-opened panel only suppresses it for this scenario.
      courseExplanationState.userPinnedOpen = false;
      courseExplanationState.manualClosedScenarioRef = currentScenario;
    } else {
      // An explicit open is a session preference: keep Course Notes open for
      // subsequent generated courses until the user closes the panel.
      courseExplanationState.userPinnedOpen = true;
      courseExplanationState.manualClosedScenarioRef = null;
    }
    renderScenario(currentScenario);
  });

  document.getElementById("dev-view").addEventListener("change", () => {
    updateDevView();
    if (currentScenario) {
      renderScenario(currentScenario);
    }
  });

  document.getElementById("board-audit-toggle").addEventListener("change", () => {
    updateBoardAuditVisibility();
  });

  function handleOptionalRuleControlClick(event) {
    const button = event.target.closest(".variant-state");
    if (!button) {
      return;
    }

    if (button.dataset.unavailableReason) {
      showToast(button.dataset.unavailableReason);
      return;
    }

    if (button.dataset.overlayControl) {
      cycleOverlayModeControl();
      return;
    }

    if (button.dataset.variantAction === "toggle-category") {
      toggleVariantCategoryStates(button.dataset.variantCategory);
      return;
    }

    if (button.dataset.variantId === "actFast") {
      cycleActFastControlChoice();
      return;
    }

    cycleVariantControlState(button.dataset.variantId);
  }

  document.querySelectorAll("[data-variant-menu]").forEach((menuEl) => {
    menuEl.addEventListener("click", handleOptionalRuleControlClick);
  });

  document.getElementById("optional-rules-index-list")?.addEventListener("click", handleOptionalRuleControlClick);
  document.getElementById("optional-rules-title")?.addEventListener("click", openOptionalRulesDialog);
  document.getElementById("optional-rules-close-icon")?.addEventListener("click", closeOptionalRulesDialog);
  document.getElementById("optional-rules-close-button")?.addEventListener("click", closeOptionalRulesDialog);
  document.getElementById("optional-rules-search")?.addEventListener("input", (event) => {
    filterOptionalRulesIndex(event.target.value);
  });
  document.getElementById("optional-rules-dialog")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeOptionalRulesDialog();
    }
  });

  document.getElementById("player-count")?.addEventListener("change", () => {
    updateVariantAvailability();
  });

  document.getElementById("expansion-roborally").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-30th-anniversary").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-rr-dice").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-master-builder").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-thrills-and-spills").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-chaos-and-carnage").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-wet-and-wild").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".variant-picker").forEach((picker) => {
      if (!picker.contains(event.target)) {
        picker.removeAttribute("open");
      }
    });
  });

  document.addEventListener("focusin", (event) => {
    document.querySelectorAll(".variant-picker").forEach((picker) => {
      if (!picker.contains(event.target)) {
        picker.removeAttribute("open");
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAboutDialog();
      closeOptionalRulesDialog();
      closeVariantPicker();
    }
  });

  async function init() {
    const assets = await loadAssets();
    initializeBoardAudit(assets);
    ensureScenarioAnimationLoop();
    renderVariantControls();
    updateExpansionSummary();
    updateDevView();
    const snapshot = loadScenarioSnapshot();

    if (snapshot) {
      applyPreferencesToControls(snapshot.preferences);
      const restoredScenario = hydrateScenarioFromSnapshot(assets, snapshot);
      if (restoredScenario) {
        currentScenario = restoredScenario;
        await ensureScenarioImages(assets, currentScenario);
        pruneImageCache(assets, [
          ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
          boardAuditState.pieceId
        ]);
        renderScenario(currentScenario);
        setGeneratingOverlay(false);
        return;
      }
    }

    await start();
  }

  init().catch(console.error);

}
