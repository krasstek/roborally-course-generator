// VERSION START: v49fp-safari-dev-panel-tightening
// Robo Rally Course Randomizer - production runtime
import { render } from "./render.js";
import { ANALYZE_BUILD_ID, analyzeCourse, analyzeFullCourse, analyzeFullCourseCooperative, analyzeFlagLeg, buildStartOccupancyMap, clearAnalysisCaches, evaluateFullCourseFocusPaymentCurveUnderOccupancy, evaluateRouteUpgradePotential, estimateInitialUpgradeOpportunitiesRemaining, getAnalysisTelemetrySnapshot, getDamageEconomyTelemetrySnapshot, getCourseMaxEnergy, getCourseStartingEnergy, getCourseStartingUpgradeCards, getRouteEnergyEconomyConfig, getRouteEnergyGainUtility, getRouteMarginalEnergyUtility, getRouteUpgradePotential, recomputeFirstLegPressure, rescoreFixedRouteUpgradeEconomy, getCompletedRouteExpansions, resetAnalysisTelemetry, ROUTE_ENERGY_ECONOMY_DEFAULTS, scoreFlagArea, simulateAction, summarizeDamageEconomyFoundationForRoute, summarizeFixedRouteUpgradeEconomyActivity, summarizeRegisterEquivalentLedger, summarizeRENativeRouteUncertaintyEvidence, summarizeCheapSearchRegisterEquivalentShadow, summarizeIntrinsicRouteForecastConfidence, summarizePowerUpOpportunityBenchmark, summarizeProgramSequencePressure, summarizePowerUpProgramFeasibility, summarizePathfinderObjectiveAudit, summarizeTrafficOwnershipAudit, summarizeFixedRouteBoardAblation } from "./analyze.js";
import {
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
} from "./board.js";
import {
  BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS,
  BOARD_PROFILE_DENSITY_WEIGHT,
  PROGRAMMING_CONTROL_PRESSURE_WEIGHTS,
  getBoardProfileDelta,
  getEffectiveLaserDamage,
  getTilePenaltyForFeature
} from "./feature-weights.js";
import { formatFeatureLabel } from "./feature-meta.js";
import {
  getVariantAvailabilityRule,
  getVariantConstructionRequirement,
  getVariantDefinition as getRegisteredVariantDefinition,
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
} from "./variants.js";
import { buildCourseNoteFacts, buildCourseNotesHtml, clearCourseNotesCache, getCheckpointPlacementAdvisory } from "./course-notes.js";
import {
  analyzeBuildIdSafe,
  analyzeFullCourseCooperativeSafe,
  clearAnalysisCachesSafe,
  getAnalysisTelemetrySnapshotSafe,
  resetAnalysisTelemetrySafe,
  summarizePathfinderObjectiveAuditSafe,
  summarizeTrafficOwnershipAuditSafe
} from "./src/generation/analysis-api.js";
import {
  CARDINAL_DIRS,
  COMPETITIVE_EFFECTIVE_RE_HARD_RANGE_MULTIPLIER,
  COMPETITIVE_EFFECTIVE_RE_RANGE_MIN,
  COMPETITIVE_EFFECTIVE_RE_RANGE_PER_TURN,
  COURSE_PREFLIGHT_DIFFICULTY_MARGIN,
  COURSE_PREFLIGHT_LATER_MAX_ACTIONS,
  COURSE_PREFLIGHT_LENGTH_MARGIN,
  COURSE_PREFLIGHT_OPENING_MAX_ACTIONS,
  DEFAULT_GENERATION_MODE,
  DEFAULT_STARTING_ENERGY,
  DEFAULT_STARTING_UPGRADE_CARDS,
  DIAGNOSTIC_ATTEMPTS,
  DIAGNOSTIC_DIFFICULTIES,
  DIAGNOSTIC_LENGTHS,
  DIAGNOSTIC_PLAYER_COUNTS,
  DOCK_BRIDGE_GAP,
  DOCK_SIDES,
  FACINGS,
  FALLBACK_SOFT_FAILURE_PENALTIES,
  FORCED_ECONOMY_NO_EFFECT_FIT_PENALTY,
  FULL_START_OUTLIER_Z,
  GENERATION_EMERGENCY_ATTEMPT_RESERVE,
  GENERATION_MODE_LABELS,
  GENERATION_MODE_PROFILES,
  LASER_BUNDLE_DEFINITIONS,
  LIGHT_START_MAX_ACTIONS,
  LIGHT_START_MAX_EXPANSIONS,
  LIGHT_START_SURPLUS,
  MAX_DOCK_COUNT,
  MIN_LENGTH_RAW,
  MIN_SHARED_EDGE,
  NEAR_BEST_MIN_BIN_WIDTH,
  NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE,
  NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
  NORMAL_EFFECTIVE_RE_MINIMUM_DELTA,
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  NORMAL_EFFECTIVE_RE_RANGE_MIN,
  NORMAL_EFFECTIVE_RE_RANGE_PER_TURN,
  NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
  NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_FRACTION,
  NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_MIN,
  NORMAL_FINAL_TAIL_CLEANUP_Z,
  NORMAL_FULL_COURSE_TRAFFIC_PASSES,
  NORMAL_PRUNE_BATCH_SIZE,
  NORMAL_REGISTER_RANGE_GUARDRAIL_FRACTION,
  NORMAL_REGISTER_RANGE_GUARDRAIL_MIN,
  NORMAL_START_FAIRNESS_STDDEV_LIMIT,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
  NO_DOCK_START_EDGE_FEATURE_TYPES,
  OPPOSITE_DIRS,
  OVERLAY_UPDATE_INTERVAL,
  ROTATIONS,
  SOFT_CANDIDATE_RETENTION_LIMIT,
  SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY,
  TARGET_STRONG_DIFFICULTY_FIT,
  TARGET_STRONG_EASY_DIFFICULTY_FIT,
  TARGET_STRONG_LENGTH_FIT,
  VIRTUAL_BOT_AUTOKILL_FEATURE_TYPES,
  VIRTUAL_BOT_EDGE_PROXIMITY_PENALTY,
  VIRTUAL_BOT_FACING_LOOKAHEAD,
  VIRTUAL_BOT_FORWARD_DANGER_PENALTY
} from "./src/generation/config.js";
import {
  getAvailableConcretePreferenceValues,
  isDevFastAlternatesEnabled,
  isDevFastTrafficEnabled,
  isDevRouteModelOverrideActive,
  isDevViewEnabled,
  registerGenerationEnvironment
} from "./src/generation/environment.js";
import {
  createDevGenerationSeed,
  formatDevGenerationSeed,
  generationRandom,
  parseDevGenerationSeed,
  sample,
  sampleManyWeighted,
  shuffle,
  withGenerationRandomSeed
} from "./src/generation/random.js";
import {
  formatGenerationDuration,
  generationNow,
  nextEventLoopTurn,
  nextFrame
} from "./src/generation/scheduling.js";
import {
  cloneContextualSearchHealth,
  compactGenerationStage,
  compactRouteWork,
  describeGenerationRejection,
  formatContextualCounts,
  formatContextualDominanceKeyDiagnostics,
  formatContextualEfficiency,
  formatContextualFidelityHealth,
  formatContextualGoalSearchHealth,
  formatContextualProfile,
  formatContextualProfileShare,
  formatContextualUsageParetoDiagnostics,
  formatMajorContextualProfileShare,
  formatPhysicalMissProfileShare,
  formatProgrammedPhysicalMissProfileShare,
  formatRouteSearchKindBreakdown,
  getGenerationRejectionCategory,
  hasContextualTimingProfile,
  roundCourseEvaluationNumbers,
  summarizeGenerationRejectionEvents,
  summarizeRouteSearchDelta
} from "./src/generation/diagnostics.js";
import {
  GROSS_DIFFICULTY_ABORT_BANDS,
  GROSS_LENGTH_ABORT_BANDS,
  MIN_WALL_CLOCK_TURN_INDEX,
  WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN,
  formatGrossCourseMismatch,
  getDifficultyThresholds,
  getGrossCourseMismatch,
  getLegacyDifficultyThresholds,
  getLengthThresholds,
  getProductionLengthThresholds
} from "./src/generation/targets.js";
import {
  formatActualDifficultyLabel,
  formatDifficultyLabel,
  formatLegacyDifficultyLabel,
  formatLengthLabel,
  formatPresentedDifficultyLabel,
  formatPresentedLengthLabel,
  getEstimatedGameTurnsLabel,
  getProductionLengthTurnIndex,
  getScenarioPresentationMetrics,
  presentationNumber,
  titleCaseWords
} from "./src/generation/labels.js";
import {
  ACT_FAST_CONTROL_CHOICES,
  ACT_FAST_MODE_IDS,
  BOARD_SPREAD_MODES,
  OVERLAY_MODES,
  OVERLAY_MODE_CYCLE,
  formatActFastMode,
  formatExpansionName,
  formatOverlayMode,
  getSelectedExpansionIds,
  getTuningDifficulty,
  isHardestDifficulty,
  normalizeBoardSpread,
  normalizeOverlayMode,
  shouldUseBoardOverlays,
  shouldUseMiniOverlays
} from "./src/generation/preferences.js";
import { clamp, normalizeBias } from "./src/generation/math.js";
import { deriveBoardProfile } from "./src/generation/board-profile.js";
import { normalizeConstructionGuidanceCalibration } from "./src/generation/guidance-calibration.js";
import {
  CONSTRUCTION_GUIDANCE_STAGE_POLICIES,
  formatGenerationModeLabel,
  getConstructionGuidanceModePolicy,
  getConstructionGuidanceStrength,
  getGenerationModeProfile,
  getScenarioGenerationMaxAttempts,
  getScenarioGenerationMode,
  isCalibrationHarnessGeneration,
  normalizeGenerationMode
} from "./src/generation/generation-modes.js";
import {
  cachedAssets,
  ensureScenarioImages,
  getPlacementImagePieceIds,
  loadAssets,
  loadPieceImage,
  pruneImageCache
} from "./src/generation/assets.js";
import {
  buildMovingTargetTimelines,
  collectMovingTargetReentryMarkers,
  getMovingCheckpointTrace,
  isBlockedBetween,
  summarizeMovingTargets
} from "./src/generation/moving-targets.js";
import { countFeatureTypeInTileMap } from "./src/generation/board-profile.js";
import {
  applyCourseVariantAvailability,
  boardPieceSatisfiesConstructionRequirement,
  canSupportRequiredDockStarts,
  chooseActFastMode,
  chooseVariantBundle,
  getActiveVariantConstructionRequirements,
  getAvailableDockIds,
  getAvailableMainBoardIds,
  getConflictingVariantIds,
  getCourseConflictingVariantIds,
  getDockConfigurations,
  getDockSelectionWeight,
  getEligibleDockIds,
  getExtraDockModeState,
  getMaximumAvailableDockStartCapacity,
  getMinimumSmallOnlyBoardCount,
  getRequiredDockStartCount,
  getVariantDefinition,
  getVariantDefinitionLabel,
  getVariantPreferenceState,
  getVariantStateCopy,
  getVariantUnavailabilityReason,
  isCheckpointActiveFeature,
  isHazardousFlagEligibleUnderlyingFeature,
  isVariantExplicitlyForced,
  isVariantForced,
  neutralBoardCount,
  neutralFlagCount,
  normalizeForcedVariantPreferenceConflicts,
  normalizeVariantState,
  variantIsAvailable,
  weightedOrder
} from "./src/generation/variant-availability.js";
import { makeGenerationStopRequestedError } from "./src/generation/scheduling.js";
import {
  buildBoardRects,
  cloneTileMap,
  countConnectedComponents,
  countPhysicalBoards,
  getCombinedPlacedTileFeatureMap,
  getDirectionDelta,
  getDockTileKeySet,
  getFullRectOffsets,
  getOppositeSide,
  getPhysicalBoardId,
  getPlacedTileFeatureMap,
  getPlacementOccupiedOffsets,
  getPlacementOccupiedTiles,
  getReverseSideName,
  getWallsAtTile,
  isBlankCustomBoardPiece,
  isMiniOverlayPiece,
  isSmallBoardLayoutAcceptable,
  manhattanDistance,
  pointOnPlacement,
  pointOnRect,
  sameTile,
  tileHasLaserInDirection,
  tileHasLaserSupportBlock
} from "./src/generation/layout-geometry.js";
import {
  chooseOverlayPlacements,
  getAlignedEdgeOffsets,
  getAvailableOverlayIds
} from "./src/generation/overlays.js";
import {
  getMinimumBoardCountForConstructionRequirements,
  selectBoardIdsForCourse
} from "./src/generation/board-selection.js";
import { placeHomeRebootTokens, placeRebootTokens } from "./src/generation/reboot-tokens.js";
import { chooseNoDockStartingZones, isNoDockStartTileClear } from "./src/generation/no-docks.js";
import {
  CALIBRATION_CHECKPOINT_SAMPLING_REGIMES,
  buildCalibrationConstructionSnapshot,
  getCalibrationCheckpointSamplingRegime,
  getCalibrationExpansionIds,
  getCandidateBoardDepth,
  getFlagCandidateApproachStats,
  summarizeCalibrationBoardProfiles,
  summarizeCalibrationLayout
} from "./src/generation/calibration-features.js";
import { bandDistance, computeActFastLengthLoad } from "./src/generation/targets.js";
import { isDynamicArchivingActive } from "./src/generation/variant-availability.js";
import {
  applyConstructionGuidanceRanking,
  getCalibratedConstructionPlan,
  getConstructionGuidanceGrossMismatch,
  predictConstructionGuidanceStage,
  sampleConstructionGuidanceRankedCandidate
} from "./src/generation/construction-guidance.js";
import {
  applyFlagOverrides,
  filterStartsForGoals,
  getCheckpointSpacingExpectationProfile,
  getFlagCandidateAreaPenalty,
  getFlagCandidates,
  getPlayableCheckpoints,
  pickFlags,
  pickFlagsCooperative,
  sampleCheckpointProposalWithExpectations
} from "./src/generation/checkpoints.js";
import {
  buildVirtualRobotStarts,
  hideVirtualFlagZeroFeature,
  pickVirtualBotEntry,
  pickVirtualBotEntryFacing
} from "./src/generation/virtual-bots.js";
import {
  buildDockSummaries,
  createBoardPlacements,
  createDockPlacement,
  findBridgeDockPlacement,
  getBoardPlacementPlanningContext,
  getDockPlacementsFromScenarioPlacements,
  getProtectedSandwichBoardIndices,
  getSandwichedDockFacingTowardCheckpoint,
  getSandwichedDockUseProfile,
  hasAlignedDockFrontage,
  hasPhysicalSandwichedDock,
  orientSandwichedDockStartsTowardCheckpoint
} from "./src/generation/board-layout.js";
import { averageValues, getCombinationCount } from "./src/generation/math.js";
import { getRouteAnalysisVariantOptions } from "./src/generation/variant-availability.js";
import {
  adjustStartOutliersForCourseLength,
  chooseNormalStartBalanceRemoval,
  computeCourseReachableStarts,
  computeUsableStarts,
  formatStartBalanceLabel,
  getActivePruningStarts,
  getEconomyEnergyActionableResidualBalanceSelectionPenalty,
  getNormalEffectiveRERangeTarget,
  getNormalFairnessSoftOverflowAllowance,
  getNormalRegisterDurationGuardrail,
  getNormalResidualBalanceSelectionPenalty,
  getNormalStartBalanceDiagnostics,
  getNormalStartDispersion,
  getNormalStartPruneBatchSize,
  getRobustOutlierStats,
  getStartBalanceProfile,
  mapMaybePromise,
  medianValue,
  normalizeStartBalance,
  rankNormalEffectiveREOutliers,
  runIterativeStartBalancing,
  runIterativeStartBalancingCooperative,
  summarizeNormalRetainedREBalance,
  summarizePostBalanceStartResiduals
} from "./src/generation/start-balance.js";
import {
  applyPayToWinStartPricing,
  formatPayToWinEnergyCost,
  getPayToWinDenialCost
} from "./src/generation/start-pricing.js";
import {
  chooseNearBestCandidate,
  getAcceptableScenarioScore,
  getFallbackScenarioScore,
  getNearBestCandidateBin,
  isViableFallbackScenario
} from "./src/generation/candidate-selection.js";
import {
  collectTrackedRouteTileKeys,
  collectUsedBoardIndices,
  getSelectedFullCourseRoutes,
  overlayFitsWithinBoards,
  overlayTouchesTrackedPlay,
  pruneIrrelevantOverlayPlacements,
  pruneUnusedBoardPlacements,
  pruneUnusedDockPlacements
} from "./src/generation/construction-cleanup.js";
import { applyCompetitiveStrategicBlocking } from "./src/generation/competitive.js";
import {
  addDevTiming,
  formatDevMilliseconds,
  getCachedRouteReplay,
  getDamageFoundationScenarioOptions,
  getDamageFoundationTrafficContext,
  getDevAcceptableCandidatePool,
  getScenarioDevReplayCache,
  rememberDevAcceptableCandidatePool
} from "./src/generation/dev-replay.js";
import {
  ENERGY_ECONOMY_DRAW_EVENT_WALL_CLOCK_REGISTERS,
  ENERGY_ECONOMY_INSTALL_EVENT_WALL_CLOCK_REGISTERS,
  LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER,
  PLAY_TIME_HORIZON_MIDPOINT_TURNS,
  PLAY_TIME_HORIZON_SLOPE_TURNS,
  PLAY_TIME_RESPONSE_MAX_UPLIFT,
  classifyReferencePlayTimeTurns,
  getActFastDirectTimerReduction,
  getActFastDirectTimingMultiplier,
  getActFastPressureWeight,
  getActFastREPressureMultiplier,
  getPlayTimeHorizonActivation,
  getPlayerWallClockMultiplier
} from "./src/generation/play-time.js";
import {
  RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE,
  applyVariantDifficultyModifiers,
  buildRETurnDifficultyCandidatePoolShadow,
  buildRETurnDifficultyShadow,
  computeBoardHarshness,
  computeDifficultyRaw,
  computeLaterCheckpointPressure,
  computePlayerTimeLoad,
  computeProgrammingPressureProfile,
  computeRETurnVariantDifficultyAccounting,
  computeVariantDifficultyAccounting,
  getProductionRETurnDifficulty,
  getREDifficultyRouteMixtureEntries,
  meanFinite
} from "./src/generation/difficulty-metrics.js";
import {
  applyRENativeExpectedPlayExtentToLengthMetrics,
  buildLengthOwnerCandidatePoolShadow,
  computeLengthMetrics,
  computeLengthOwnerObservation
} from "./src/generation/length-metrics.js";
import {
  getBoardFootprintUseProfile,
  getBoardGameplayRelevanceProfile,
  getFinalLegAnticlimax,
  getIntermediateCheckpointPacing,
  getMovingTargetVolatilityPenalty,
  getOpeningLegAnticlimax,
  getRouteDramaProfile,
  getRoutedCheckpointPacingExpectation,
  getTargetAxisAcceptanceGate,
  nonOverlappingDifficultyBandDistance,
  shouldUseCompactLengthFit
} from "./src/generation/course-quality.js";
import { classifyCandidate } from "./src/generation/classification.js";
import {
  compareWholeCourseBoardAblationStates,
  getCourseConstructionFingerprint,
  getScenarioSelectedRouteFingerprint,
  summarizeWholeCourseBoardAblationState
} from "./src/generation/fingerprints.js";
import {
  analyzeFlagSequence,
  buildCoursePreflightSequence,
  buildRouteAwareBatteryScoringOptions,
  classifyCoursePreflight,
  getPreflightGrossCourseMismatch,
  mergeLightweightPrunedStarts,
  screenSandwichedExtraDockOpening
} from "./src/generation/analysis-orchestration.js";
import {
  GENERATION_COOPERATIVE_SEARCH_CHECK_POPS,
  GENERATION_COOPERATIVE_SEARCH_SLICE_MS,
  GENERATION_COOPERATIVE_YIELD_INTERVAL_MS,
  GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS,
  formatCooperativeRouteProgressStage
} from "./src/generation/scheduling.js";
import { guidanceLevelForAttempt } from "./src/generation/construction-guidance.js";
import { resolveAnyPreferencesForGeneration } from "./src/generation/preferences.js";
import {
  createRandomCandidate,
  validateSelectedInventory
} from "./src/generation/candidate-builder.js";
import {
  SAVED_SCENARIO_APP_ID,
  SAVED_SCENARIO_SCHEMA_VERSION,
  buildSavedScenarioPresentationShell,
  evaluateCourseCanonically,
  getReloadRequestedTargetLabel,
  hydrateScenarioFromSnapshot,
  serializeScenario
} from "./src/generation/persistence.js";
import {
  buildDiagnosticsCases,
  detectScenarioExplanationIssues,
  generateScenarioForPreferences,
  runProductionGeneration
} from "./src/generation/generation-loop.js";
export {
  describeCalibrationInventory,
  generateCalibrationObservation,
  generateScenarioForTesting,
  hydrateScenarioForTesting,
  loadCalibrationAssets,
  reanalyzeCalibrationScenario,
  serializeScenarioForTesting
} from "./src/generation/calibration-hooks.js";

// The page answers generation's few questions about its controls (Dev View
// switches, offered difficulty/length options); headless runs keep the defaults.
if (typeof document !== "undefined") {
  registerGenerationEnvironment({
    isDevViewEnabled: pageIsDevViewEnabled,
    isDevRouteModelOverrideActive: pageIsDevRouteModelOverrideActive,
    isDevFastTrafficEnabled: pageIsDevFastTrafficEnabled,
    isDevFastAlternatesEnabled: pageIsDevFastAlternatesEnabled,
    getAvailableConcretePreferenceValues: pageGetAvailableConcretePreferenceValues
  });
}
const MAIN_BUILD_ID = "v49fp-safari-dev-panel-tightening";
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

const SCENARIO_RENDER_INTERVAL_MS = 125;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
// Frozen observational fallback from the accepted v49cy 9-candidate Any-difficulty
// Short/Medium/Long calibration batch. These are normalization anchors for the
// Dev uncertainty shadow only; they are NOT production difficulty thresholds.
// v49db observational uncertainty coupling. Existing forecast confidence/exposure
// remains the baseline owner. RE-turn difficulty may only add uncertainty above
// the empirical median; it never discounts existing forecast uncertainty.
// Provisional Dev curve: q75 receives +20%; quadratic growth caps at +60%.
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

let currentScenario = null;
let scenarioAnimationFrameId = null;
let lastScenarioRenderTime = 0;
let isGenerating = false;
let generationStopRequested = false;
let generationHasRetainableCandidate = false;
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
let mapFeatureHighlightEnabled = false;
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

function getBoardSpreadControlButtons() {
  return Array.from(document.querySelectorAll("[data-board-spread-control]"));
}

function formatBoardSpreadMode(mode) {
  return normalizeBoardSpread(mode) === BOARD_SPREAD_MODES.tight ? "Tight" : "Random";
}

function setBoardSpreadControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getBoardSpreadControlButtons();
  if (!targets.length) {
    return;
  }

  const normalized = normalizeBoardSpread(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.boardSpread = normalized;
    button.dataset.state = normalized === BOARD_SPREAD_MODES.tight ? "allowed" : "off";
    button.textContent = formatBoardSpreadMode(normalized);
    button.title = `Board Spread: ${formatBoardSpreadMode(normalized)}. Click to cycle Random and Tight.`;
    button.setAttribute("aria-label", button.title);
  });
}

function cycleBoardSpreadControl() {
  const buttonEl = document.getElementById("board-spread");
  if (!buttonEl) {
    return;
  }
  const current = normalizeBoardSpread(buttonEl.value);
  const next = current === BOARD_SPREAD_MODES.tight
    ? BOARD_SPREAD_MODES.random
    : BOARD_SPREAD_MODES.tight;
  setBoardSpreadControl(next);
  updateVariantSummary();
}

function createBoardSpreadRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Tight prefers more compact board arrangements without excluding large boards. With only a few boards, it usually makes little difference.";
  rowEl.dataset.ruleSearch = "board spread random tight compact layout setup layout board arrangement";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Board Spread";
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
    descriptionEl.textContent = "Random keeps the ordinary layout mix. Tight prefers more compact arrangements without excluding large boards. With only a few boards, it usually makes little difference.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "board-spread";
  }
  buttonEl.className = "variant-state board-spread-state";
  buttonEl.type = "button";
  buttonEl.dataset.boardSpreadControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("board-spread");
  setBoardSpreadControl(primary?.value ?? BOARD_SPREAD_MODES.random, buttonEl);
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
  if (normalizedState === "forced") return "forced_random";
  return normalizedState === "allowed" ? "allowed" : "off";
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
    { type: "board-spread", label: "Board Spread" },
    { type: "overlay", label: "Overlays" },
    ...VARIANT_DEFINITIONS.map((variant) => ({ type: "variant", label: variant.label, variant }))
  ].sort((left, right) => left.label.localeCompare(right.label));

  entries.forEach((entry) => {
    if (entry.type === "board-spread") {
      listEl.appendChild(createBoardSpreadRow({ mirror: true, showCategory: true, showDescription: true }));
      return;
    }
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
      menuEl.appendChild(createBoardSpreadRow());
      menuEl.appendChild(createOverlayModeRow());
    }

    variants.forEach((variant) => {
      menuEl.appendChild(createVariantRuleRow(variant));
    });
  });

  renderOptionalRulesIndex();
  updateVariantSummary();
}

let devFrozenGenerationSeed = null;

function getGenerationConstraintHint(preferences = {}) {
  const mode = normalizeGenerationMode(preferences.generationMode);
  const length = preferences.length ?? "any";
  const playerCount = Number(preferences.playerCount) || 4;

  if (length === "epic") {
    return "Epic courses can take substantially longer to check.";
  }
  if (mode === "fastest" || mode === "fast") {
    return "This mode is usually quicker.";
  }
  if (mode === "balanced" || mode === "thorough") {
    return "This mode usually takes a little longer.";
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

function updateCourseNotesTogglePresentation(toggleEl, visible) {
  if (!toggleEl) return;
  const expanded = Boolean(visible);
  toggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleEl.textContent = expanded ? "Hide notes" : "Show notes";
  toggleEl.title = expanded ? "Hide Course Notes" : "Show Course Notes";
  toggleEl.setAttribute("aria-label", expanded ? "Hide Course Notes" : "Show Course Notes");
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
  const difficultyEl = document.getElementById("setup-difficulty");
  const lengthEl = document.getElementById("setup-length");
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
    !difficultyEl ||
    !lengthEl ||
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
    difficultyEl.textContent = "";
    lengthEl.textContent = "";
    boardsEl.textContent = "";
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
    flagsEl.textContent = "";
    explanationCopyEl.innerHTML = "";
    explanationPanelEl.classList.add("hidden");
    updateCourseNotesTogglePresentation(explanationToggleEl, false);
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

  const presentationMetrics = getScenarioPresentationMetrics(scenario);
  const presentationScenario = presentationMetrics === scenario.metrics
    ? scenario
    : { ...scenario, metrics: presentationMetrics };
  const presentationUnavailable = Boolean(scenario.hydrationPresentationUnavailable);
  const hydrationPending = Boolean(scenario.hydrationReanalysisPending);
  const hydrationStopped = Boolean(scenario.hydrationReanalysisStopped);
  const hydrationFailed = Boolean(scenario.hydrationReanalysisFailed);
  const actualDifficultyLabel = presentationUnavailable
    ? "Analysis unavailable"
    : formatPresentedDifficultyLabel(presentationMetrics);
  const actualLengthLabel = presentationUnavailable
    ? "Analysis unavailable"
    : formatPresentedLengthLabel(presentationMetrics);
  const estimatedTurnsLabel = presentationUnavailable
    ? null
    : getEstimatedGameTurnsLabel(presentationScenario);
  difficultyEl.textContent = actualDifficultyLabel;
  lengthEl.textContent = estimatedTurnsLabel
    ? `${actualLengthLabel} (${estimatedTurnsLabel})`
    : actualLengthLabel;

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
  flagsEl.textContent = String(visibleCheckpointCount);
  if (presentationUnavailable) {
    fitNoteEl.textContent = hydrationPending
      ? "Reanalyzing this saved course. Its layout is available now; difficulty, length, and Course Notes will appear if the analysis completes."
      : hydrationStopped
        ? "Saved-course reanalysis was stopped. This older save has no stored difficulty, length, or Course Notes to show. Generating again creates a new course; it does not refresh this layout."
        : "This saved course could not be fully reanalyzed after reload, and this older save has no stored difficulty, length, or Course Notes. Generating again creates a new course; it does not refresh this layout.";
    fitNoteEl.classList.remove("hidden");
    const unavailableExplanation = hydrationPending
      ? "<div><strong>Course analysis:</strong> Reanalysis is in progress. The saved layout is shown immediately while the current routing model checks it.</div>"
      : hydrationStopped
        ? "<div><strong>Course analysis:</strong> Reanalysis was stopped. The saved layout is unchanged, but this older save has no stored analysis presentation.</div>"
        : "<div><strong>Course analysis:</strong> The saved layout is unchanged, but its analysis could not be rebuilt and this older save has no stored presentation fallback.</div>";
    const explanationVisible = Boolean(
      courseExplanationState.userPinnedOpen ||
      courseExplanationState.manualClosedScenarioRef !== scenario
    );
    explanationCopyEl.innerHTML = explanationVisible ? unavailableExplanation : "";
    explanationPanelEl.classList.toggle("hidden", !explanationVisible);
    updateCourseNotesTogglePresentation(explanationToggleEl, explanationVisible);
    summary.classList.remove("hidden");
    return;
  }
  const noteParts = [];
  if (scenario.hydrationPresentationFallback) {
    fitNoteEl.textContent = hydrationPending
      ? "Showing the saved course and its last-saved difficulty, length, and Course Notes while current analysis is rebuilt."
      : hydrationStopped
        ? "Saved-course reanalysis was stopped. The course shown is unchanged; difficulty, length, and Course Notes are the last-saved values."
        : hydrationFailed
          ? "The saved course is shown with its last-saved difficulty, length, and Course Notes because current analysis could not be rebuilt."
          : "The saved course is shown with its last-saved difficulty, length, and Course Notes because current analysis was incomplete after reload.";
    fitNoteEl.classList.remove("hidden");
  }
  const courseNoteFacts = buildCourseNoteFacts(presentationScenario);
  const difficultyMismatch = courseNoteFacts.targetMismatch.difficulty;
  const lengthMismatch = courseNoteFacts.targetMismatch.length;
  const difficultyFit = presentationMetrics.difficultyFit ?? 0;
  const lengthFit = presentationMetrics.lengthFit ?? 0;
  const requestedDifficulty = scenario.preferences.difficulty;
  const strongDifficultyThreshold = requestedDifficulty === "easy" ? 48 : 42;
  const difficultyStrength = difficultyMismatch.strength;
  const lengthStrength = lengthMismatch.strength;
  const epicUpperLength = getProductionLengthThresholds().epic[1];
  const presentedWallClockTurnIndex = getProductionLengthTurnIndex(presentationMetrics);
  const epicVeryLong = (
    scenario.preferences.length === "epic" &&
    presentationMetrics.lengthDirection === "high" &&
    Number.isFinite(presentedWallClockTurnIndex) &&
    presentedWallClockTurnIndex > epicUpperLength
  );

  const fairnessAcceptance = presentationMetrics?.fairnessAcceptance ?? null;
  const fairnessOverflowRE = Math.max(
    0,
    Number(fairnessAcceptance?.overflowRE) || 0
  );
  const fairnessOverflowWarning = Boolean(
    fairnessAcceptance?.active && fairnessOverflowRE > 1e-9
  );
  const fairnessOverflowSentence = fairnessOverflowWarning
    ? ` Starting positions are ${fairnessAcceptance?.ordinaryAcceptable ? "slightly" : "more"} uneven than the usual balance range for a course this length.`
    : "";
  const forcedEconomyEffect = presentationMetrics?.forcedEconomyEffect ?? null;
  const forcedEconomyNoEffect = Boolean(
    forcedEconomyEffect?.noMeaningfulEnergyAdjustment
  );
  const forcedEconomyNoEffectSentence = forcedEconomyNoEffect
    ? ` ${forcedEconomyEffect?.variantId === "subsidizedStarts" ? "Subsidized Starts" : "Pay to Win"} was required, but this course produced no starting-Energy changes, so that variant has little practical setup effect here.`
    : "";
  // Energy-adjustment cap saturation is generator telemetry, not player-facing
  // course advice. Players only need the actual displayed Energy adjustments and
  // the surviving/pruned starting-space set.
  const selectionWarningSentence =
    `${fairnessOverflowSentence}${forcedEconomyNoEffectSentence}`;
  const hasSelectionWarning = Boolean(selectionWarningSentence);

  if (difficultyMismatch.active && difficultyStrength) {
    noteParts.push(difficultyMismatch.direction === "low"
      ? `${difficultyStrength} easier`
      : `${difficultyStrength} harder`);
  }

  if (lengthMismatch.active && lengthStrength && !epicVeryLong) {
    noteParts.push(lengthMismatch.direction === "low"
      ? `${lengthStrength} shorter`
      : `${lengthStrength} longer`);
  }

  const shouldSuggestReroll = (
    difficultyFit >= strongDifficultyThreshold ||
    lengthFit >= 24 ||
    hasSelectionWarning ||
    (noteParts.length > 0 && (Number(presentationMetrics?.fitScore) || 0) >= 30)
  );
  const checkpointPlacementAdvisory = courseNoteFacts.checkpointPlacement;
  const epicLengthSentence = epicVeryLong
    ? " This course is very long, even for an Epic game."
    : "";
  const checkpointPlacementSentence = checkpointPlacementAdvisory?.active
    ? ` ${checkpointPlacementAdvisory.bannerText}`
    : "";
  const sandwichedMissingSideCount = courseNoteFacts.boardUse.sandwichedMissingSideCount;
  const limitedFootprintBoardCount = Number(
    courseNoteFacts.boardUse.limitedFootprintCount ??
    (
      (courseNoteFacts.boardUse.zeroRouteInfluenceCount ?? 0) +
      (courseNoteFacts.boardUse.weakTraversedCount ?? 0)
    )
  ) || 0;
  const weakBoardCount = limitedFootprintBoardCount + sandwichedMissingSideCount;
  const sandwichedUseSentence = sandwichedMissingSideCount > 0
    ? ` ${sandwichedMissingSideCount === 1
      ? "One side of the Sandwiched Dock uses only a small part of its board area. It is kept to preserve the intended sandwich."
      : "The Sandwiched Dock sides use only a small part of their board area. They are kept to preserve the intended sandwich."}`
    : "";
  const limitedFootprintSentence = limitedFootprintBoardCount > 0
    ? ` ${limitedFootprintBoardCount === 1
      ? "One board sees only a small part of its area used by the race."
      : "Some boards see only a small part of their area used by the race."}`
    : "";
  const boardUseSentence = `${sandwichedUseSentence}${limitedFootprintSentence}`;
  const extraDocksRequestMismatch = courseNoteFacts.extraDocksRequestMismatch;
  const competitiveSoftMismatch = courseNoteFacts.competitiveSoftMismatch;
  const competitiveMismatchSentence = competitiveSoftMismatch
    ? " Competitive starting positions are somewhat uneven."
    : "";

  const reloadRequestedTargetLabel = getReloadRequestedTargetLabel(scenario.preferences);
  // A saved closest-match flag is historical once current reanalysis accepts the
  // unchanged course. Do not let that old flag fall through into today's ordinary
  // "Closest match found" banner, especially for unconstrained Any / Any saves.
  const presentationGenerationBestMatch = Boolean(
    scenario.generationBestMatch && !scenario.hydrationAcceptanceImproved
  );

  if (scenario.hydrationPresentationFallback) {
    // Keep the explicit last-saved-analysis notice above. A new generation would
    // create a different course, so do not replace it with ordinary reroll advice.
  } else if (scenario.hydrationAcceptanceDrift) {
    fitNoteEl.textContent = reloadRequestedTargetLabel
      ? `This saved course was accepted when generated, but current reanalysis no longer accepts it for the requested ${reloadRequestedTargetLabel} settings. The course itself is unchanged. Generating again creates a new course.`
      : `This saved course was accepted when generated, but current reanalysis now finds an issue that would make it a closest-match result under the current analysis model. The course itself is unchanged. Generating again creates a new course.`;
    fitNoteEl.classList.remove("hidden");
  } else if (scenario.hydrationAcceptanceImproved && reloadRequestedTargetLabel) {
    fitNoteEl.textContent =
      `This course was originally saved as a closest-match fallback. Current reanalysis now accepts it for the requested ${reloadRequestedTargetLabel} settings. The course itself is unchanged.`;
    fitNoteEl.classList.remove("hidden");
  } else if (presentationGenerationBestMatch && (extraDocksRequestMismatch || noteParts.length || epicVeryLong || competitiveSoftMismatch || hasSelectionWarning)) {
    const extraDocksMismatchText = extraDocksRequestMismatch
      ? " Extra Docks was required, but this course uses one docking bay."
      : "";
    const mismatchText = noteParts.length
      ? ` It is ${noteParts.join(" and ")} than requested.`
      : "";
    const regenerateText = extraDocksRequestMismatch && !noteParts.length && !hasSelectionWarning
      ? " Regenerating may find a course with multiple docking bays."
      : (noteParts.length || hasSelectionWarning)
        ? " Regenerating may find a closer match."
        : "";
    fitNoteEl.textContent =
      `Closest match found.${extraDocksMismatchText}${mismatchText}${competitiveMismatchSentence}${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (presentationGenerationBestMatch && (checkpointPlacementAdvisory?.active || weakBoardCount > 0)) {
    const regenerateText = checkpointPlacementAdvisory?.active
      ? " Regenerating may find a closer match."
      : "";
    fitNoteEl.textContent = `Closest match found.${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (noteParts.length) {
    const rerollText = shouldSuggestReroll || checkpointPlacementAdvisory?.active
      ? " Regenerating may give a better match."
      : "";
    fitNoteEl.textContent = `Closest fit: this course is ${noteParts.join(" and ")} than requested.${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${rerollText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (epicVeryLong || checkpointPlacementAdvisory?.active || weakBoardCount > 0 || hasSelectionWarning) {
    const regenerateText = checkpointPlacementAdvisory?.active
      ? " Regenerate if you prefer a more conventional layout."
      : "";
    fitNoteEl.textContent = `Course generated.${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
  }

  const autoOpenExplanation = courseNoteFacts.autoOpenExplanation;
  const explanationVisible = Boolean(
    courseExplanationState.userPinnedOpen ||
    (
      autoOpenExplanation &&
      courseExplanationState.manualClosedScenarioRef !== scenario
    )
  );
  if (explanationVisible) {
    explanationCopyEl.innerHTML = scenario.hydrationPresentationFallback && scenario.savedCourseNotesHtml
      ? scenario.savedCourseNotesHtml
      : buildCourseNotesHtml(presentationScenario, noteParts, {
        includeDiagnostics: Boolean(document.getElementById("dev-view")?.checked)
      });
  } else {
    // Course Notes are deliberately lazy: do not synthesize or retain prose
    // for a scenario the user has not opened.
    explanationCopyEl.innerHTML = "";
  }
  explanationPanelEl.classList.toggle("hidden", !explanationVisible);
  updateCourseNotesTogglePresentation(explanationToggleEl, explanationVisible);
  summary.classList.remove("hidden");
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
  const boardSpreadTight = normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight;
  if (!isOverlayModeAvailable(preferences)) {
    return variantsAllowed && boardSpreadTight;
  }
  return variantsAllowed && boardSpreadTight && normalizeOverlayMode(document.getElementById("overlay-mode")?.value) === OVERLAY_MODES.yes;
}

function countSelectedOptionalRules() {
  const variantCount = VARIANT_DEFINITIONS.filter((variant) => getVariantControlState(variant.id) !== "off").length;
  const preferences = getPreferencesFromControls();
  const overlayCount = isOverlayModeAvailable(preferences) && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no ? 1 : 0;
  const boardSpreadCount = normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight ? 1 : 0;
  return variantCount + overlayCount + boardSpreadCount;
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
      if (normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight) {
        selectedCount += 1;
      }
      if (overlayAvailable && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no) {
        selectedCount += 1;
      }
      summaryEl.title = [
        ...states.map((entry) => `${entry.label}: ${getVariantStateCopy(entry.id, entry.state).label}`),
        `Board Spread: ${formatBoardSpreadMode(preferences.boardSpread)}`,
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
    setBoardSpreadControl(allAllowed ? BOARD_SPREAD_MODES.random : BOARD_SPREAD_MODES.tight);
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
  if (document.getElementById("expansion-contamination").checked) {
    enabled.push(formatExpansionName("contamination"));
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
    addImpact(
      "lighterGame",
      upgradeSpaceCount > 0
        ? `${upgradeSpaceCount} upgrade space${upgradeSpaceCount === 1 ? "" : "s"} with Energy/upgrade effects disabled; upgrade phase removed`
        : "upgrade phase removed"
    );
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
  if (!scenario) return { suggestions: [], warnings: [] };
  const suggestionTargetsBySource = new Map();
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
        const target = targetId ? getRegisteredVariantDefinition(targetId) : null;
        if (!target?.label) continue;
        if (!suggestionTargetsBySource.has(source.id)) {
          suggestionTargetsBySource.set(source.id, {
            sourceLabel: source.label,
            targetLabels: []
          });
        }
        suggestionTargetsBySource.get(source.id).targetLabels.push(target.label);
        continue;
      }

      if (rule.kind === "warning") {
        if (targetId && !targetActive) continue;
        if (rule.text) warnings.push(rule.text);
      }
    }
  }

  return {
    suggestions: [...suggestionTargetsBySource.values()],
    warnings
  };
}

function capitalizeRuleNoteBody(text) {
  return String(text ?? "").replace(/[A-Za-z]/, (letter) => letter.toUpperCase());
}

function splitRuleNoteEntry(text) {
  const trimmed = String(text ?? "").trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) {
    return { label: "", body: capitalizeRuleNoteBody(trimmed) };
  }
  return {
    label: trimmed.slice(0, colonIndex).trim(),
    body: capitalizeRuleNoteBody(trimmed.slice(colonIndex + 1).trim())
  };
}

function appendRuleNoteHeading(noteEl, text) {
  const headingEl = document.createElement("strong");
  headingEl.className = "rules-note-heading";
  headingEl.textContent = text;
  noteEl.appendChild(headingEl);
}

function appendRuleNoteEntry(noteEl, text) {
  const { label, body } = splitRuleNoteEntry(text);
  const entryEl = document.createElement("span");
  entryEl.className = "rules-note-entry";
  if (label) {
    const labelEl = document.createElement("strong");
    labelEl.className = "rules-note-rule-name";
    labelEl.textContent = `${label}:`;
    entryEl.appendChild(labelEl);
    if (body) entryEl.appendChild(document.createTextNode(` ${body}`));
  } else {
    entryEl.textContent = body;
  }
  noteEl.appendChild(entryEl);
}

function appendNamedList(parentEl, labels) {
  labels.forEach((label, index) => {
    if (index > 0) {
      parentEl.appendChild(document.createTextNode(
        index === labels.length - 1 ? " and " : ", "
      ));
    }
    const labelEl = document.createElement("strong");
    labelEl.className = "rules-note-rule-name";
    labelEl.textContent = label;
    parentEl.appendChild(labelEl);
  });
}

function renderVariantRuleGuidanceNote(noteEl, guidance) {
  noteEl.replaceChildren();
  appendRuleNoteHeading(noteEl, "RULES NOTES:");

  if (guidance.suggestions.length) {
    noteEl.appendChild(document.createTextNode(" "));
    const entryEl = document.createElement("span");
    entryEl.className = "rules-note-entry";
    entryEl.appendChild(document.createTextNode("Suggestion: "));
    guidance.suggestions.forEach((suggestion, index) => {
      if (index > 0) entryEl.appendChild(document.createTextNode(" "));
      const sourceEl = document.createElement("strong");
      sourceEl.className = "rules-note-rule-name";
      sourceEl.textContent = suggestion.sourceLabel;
      entryEl.appendChild(sourceEl);
      entryEl.appendChild(document.createTextNode(" pairs well with "));
      appendNamedList(entryEl, suggestion.targetLabels);
      entryEl.appendChild(document.createTextNode("."));
    });
    noteEl.appendChild(entryEl);
  }

  for (const warning of guidance.warnings) {
    noteEl.appendChild(document.createTextNode(" "));
    appendRuleNoteEntry(noteEl, `Note: ${warning}`);
  }
}

function renderSpecialRulesNote(noteEl, notes) {
  noteEl.replaceChildren();
  appendRuleNoteHeading(noteEl, "SPECIAL RULES:");
  notes.forEach((note) => {
    noteEl.appendChild(document.createTextNode(" "));
    appendRuleNoteEntry(noteEl, note);
  });
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
    noteEl.replaceChildren();
    noteEl.classList.add("hidden");
    if (adviceNoteEl) {
      adviceNoteEl.replaceChildren();
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
      "Hazardous Checkpoints: board elements under checkpoints remain active, but do not affect the checkpoints.",
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
    let noDockText;
    if (scenario.subsidizedStarts) {
      noDockText = "No Docks: do not use a docking bay. The subsidized starting spaces along the indicated outer board edge replace docking-bay starting spaces.";
    } else if (scenario.payToWin) {
      noDockText = "No Docks: do not use a docking bay. The priced starting spaces along the indicated outer board edge replace docking-bay starting spaces.";
    } else {
      noDockText = "No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces.";
    }
    if (!scenario.startupSpinUp) {
      const noDockFacing = scenario.noDockEdge?.facing ?? scenario.noDockEdges?.[0]?.facing ?? null;
      if (noDockFacing) {
        noDockText += ` Robots start facing ${noDockFacing} on the displayed map.`;
      }
    }
    notes.push(noDockText);
    if (scenario.startupSpinUp) {
      notes.push(appendRuleReference(
        "Startup Spin-Up with No Docks: players may choose their robots' initial facing freely.",
        { source: "previous-editions", relation: "patterned" }
      ));
    }
  }

  if (scenario.sandwichedDock) {
    if (scenario.startupSpinUp) {
      notes.push("Sandwiched Dock: robots start on the docking bay.");
    } else if (scenario.sandwichedDockFacing) {
      notes.push(`Sandwiched Dock: robots start on the docking bay, facing ${scenario.sandwichedDockFacing} toward checkpoint 1 on the displayed map.`);
    } else {
      notes.push("Sandwiched Dock: robots start on the docking bay, facing toward checkpoint 1.");
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

    {
      const competitiveFailures = new Set([
        ...(scenario.metrics?.hardFailures ?? []),
        ...(scenario.metrics?.softFailures ?? [])
      ]);
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
    }
  }

  if (scenario.subsidizedStarts) {
    const subsidyPricing = scenario.sequence.firstLeg.summary.payToWin;
    const baseStartingEnergy = subsidyPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY;
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
        `Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first subsidy.${dashText} Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`
      );
    } else {
      notes.push(`Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy. Prohibited starting spaces are not available for selection. Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`);
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
    notes.push("Flaming Oil: when a robot enters any oil slick during a register, it takes 1 damage. If it ends that register on oil, it takes 1 additional damage. Multiple oil spaces entered during the same register still deal only 1 entry damage.");
  }

  if (scenario.repulsorOverdrive) {
    notes.push("Repulsor Overdrive: repulsors push robots twice the full distance of the triggering Move card.");
  }

  if (scenario.setToKill) {
    notes.push(appendRuleReference(
      "Set to Kill: robots' main lasers deal double damage.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.setToStun) {
    notes.push("Set to Stun: put SPAM drawn from damage caused by robots' main lasers in the damage discard pile.");
  }

  if (scenario.virtualBots) {
    const entryName = "shared starting space";

    if (scenario.startupSpinUp) {
      notes.push(
        appendRuleReference(
          `Virtual Bots: No docking bay is used. The ${entryName} is marked with a white circle. Place every player's Archive Token there. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
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
      const entryFacing = scenario.virtualBotEntry?.dir;
      notes.push(
        appendRuleReference(
          `Virtual Bots: No docking bay is used. The ${entryName} is marked with a white circle. Place every player's Archive Token there${entryFacing ? ` facing ${entryFacing}` : ""}. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
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
      "Shared Deck: use one shared programming deck. Damage SPAM goes directly into the affected player's hand.",
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
      "Less Foreshadowing: at the end of each round, shuffle your programming deck, discard pile, and non-damage cards in hand together to form a new programming deck.",
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
    if (guidanceNotes.suggestions.length || guidanceNotes.warnings.length) {
      renderVariantRuleGuidanceNote(adviceNoteEl, guidanceNotes);
      adviceNoteEl.classList.remove("hidden");
    } else {
      adviceNoteEl.replaceChildren();
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
    renderSpecialRulesNote(noteEl, notes);
    noteEl.classList.remove("hidden");
  } else {
    noteEl.replaceChildren();
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
    } else if (id === "actFast" && normalized === "forced") {
      variants.push(`${label} (Must; random timer mode)`);
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
    rebootTokenEl.textContent = "Green marker: reboot token";
  }
  rebootTokenEl?.classList.toggle("hidden", !["reboot_tokens", "home_reboot"].includes(scenario?.recoveryRule));
  if (payToWinStartEl) {
    payToWinStartEl.textContent = scenario?.subsidizedStarts
      ? "Light-blue square: extra starting Energy subsidy"
      : "Green square: Pay to Win starting Energy cost";
  }
  payToWinStartEl?.classList.toggle("hidden", !(scenario?.payToWin || scenario?.subsidizedStarts));
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
    setActFastControlChoice(ACT_FAST_MODE_IDS.has(currentChoice) ? currentChoice : "forced_random", buttonEl);
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
  const next = variantId === "staggeredBoards"
    ? (current === "off" ? "allowed" : "off")
    : current === "off"
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

function pageGetAvailableConcretePreferenceValues(selectId) {
  if (typeof document === "undefined") {
    // Headless runs (comparison harness) have no controls; use the full option
    // set a fresh page offers, so "Any" resolves exactly as it would there.
    if (selectId === "difficulty") return [...DIAGNOSTIC_DIFFICULTIES];
    if (selectId === "length") return [...DIAGNOSTIC_LENGTHS];
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

function getPreferencesFromControls() {
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    startBalance: normalizeStartBalance(document.getElementById("start-balance")?.value),
    generationMode: normalizeGenerationMode(document.getElementById("generation-mode")?.value),
    boardSpread: normalizeBoardSpread(document.getElementById("board-spread")?.value),
    overlayMode: normalizeOverlayMode(document.getElementById("overlay-mode")?.value),
    actFastMode: getActFastModeFromControls(),
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "rr-dice": document.getElementById("expansion-rr-dice").checked,
      "30th-anniversary": document.getElementById("expansion-30th-anniversary").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "chaos-and-carnage": document.getElementById("expansion-chaos-and-carnage").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked,
      "contamination": document.getElementById("expansion-contamination").checked
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
  const startBalanceEl = document.getElementById("start-balance");
  if (startBalanceEl) {
    startBalanceEl.value = normalizeStartBalance(normalizedPreferences.startBalance);
  }
  const generationModeEl = document.getElementById("generation-mode");
  if (generationModeEl) {
    // Missing means a pre-Mode saved scenario, whose search behavior was the
    // current Balanced profile. Fresh pages still default to Standard in HTML.
    generationModeEl.value = normalizedPreferences.generationMode
      ? normalizeGenerationMode(normalizedPreferences.generationMode)
      : "balanced";
  }
  setBoardSpreadControl(normalizedPreferences.boardSpread);
  setOverlayModeControl(normalizedPreferences.overlayMode);
  document.getElementById("expansion-roborally").checked = normalizedPreferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-rr-dice").checked = normalizedPreferences.selectedExpansions?.["rr-dice"] ?? false;
  document.getElementById("expansion-30th-anniversary").checked = normalizedPreferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = normalizedPreferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = normalizedPreferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = normalizedPreferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = normalizedPreferences.selectedExpansions?.["wet-and-wild"] ?? false;
  document.getElementById("expansion-contamination").checked = normalizedPreferences.selectedExpansions?.["contamination"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    if (variant.id === "actFast") {
      return;
    }
    setVariantControlState(variant.id, getVariantPreferenceState(normalizedPreferences, variant.id));
  });
  const actFastState = getVariantPreferenceState(normalizedPreferences, "actFast");
  const actFastChoice = actFastState === "forced"
    ? (ACT_FAST_MODE_IDS.has(normalizedPreferences.actFastMode) ? normalizedPreferences.actFastMode : "forced_random")
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
    `Result: ${resultLabel}`,
    `Soft fit: ${scenario.metrics?.fitScore ?? "n/a"}/${scenario.metrics?.softFitLimit ?? SOFT_CANDIDATE_RETENTION_LIMIT}; axis gate D/L ${scenario.metrics?.targetAcceptance?.grossDifficultyMismatch ? "gross" : "ok"}/${scenario.metrics?.targetAcceptance?.grossLengthMismatch ? "gross" : "ok"}; fairness gate ${scenario.metrics?.fairnessAcceptance?.ordinaryAcceptable === false ? "gross" : "ok"} (overflow ${scenario.metrics?.fairnessAcceptance?.overflowRE ?? 0}RE/soft ${scenario.metrics?.fairnessAcceptance?.softOverflowAllowance ?? 0}RE); zero-penalty plateaus D/L/F ${scenario.metrics?.selectionPlateaus?.difficultyInRequestedBand ? "yes" : "no"}/${scenario.metrics?.selectionPlateaus?.lengthInRequestedBand ? "yes" : "no"}/${scenario.metrics?.selectionPlateaus?.fairnessWithinExpectedRange ? "yes" : "no"}; exact D/L ${scenario.metrics?.exactTargetMatch ? "yes" : "no"}; components ${Object.entries(scenario.metrics?.fitComponents ?? {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key} ${value}`).join(", ") || "none"}; near-best ${(diagnostics?.nearBestCandidateScores ?? []).join(", ") || "none"}; selected ${diagnostics?.selectedCandidateScore ?? scenario.metrics?.fitScore ?? "n/a"}`
  ];

  if (scenario.hydrationAcceptanceDrift) {
    lines.push("Reload classification: originally accepted; current reanalysis is not ordinarily acceptable under the current analysis model.");
  } else if (scenario.hydrationAcceptanceImproved) {
    lines.push("Reload classification: originally closest-match fallback; current reanalysis is ordinarily acceptable under the current analysis model.");
  }

  if (scenario.hydrationPresentationFallback) {
    lines.push(`Reload presentation: saved difficulty/length and Course Notes are shown because current reanalysis did not rebuild the full production presentation (${scenario.hydrationPresentationStatusReason ?? "unspecified"}).`);
  } else if (scenario.hydrationPresentationUnavailable) {
    lines.push(`Reload presentation: current reanalysis did not rebuild the full production presentation (${scenario.hydrationPresentationStatusReason ?? "unspecified"}) and this older snapshot has no saved presentation fallback.`);
  }

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
  } else {
    lines.push("Dev test seed: none (construction RNG random)");
  }

  if (diagnostics) {
    lines.push(
      `Generation: ${formatGenerationDuration(diagnostics.totalMs)} total, ${formatGenerationDuration(diagnostics.routeSearchMs)} route search, ${diagnostics.routeSearches ?? 0} searches, ${diagnostics.routeExpansions ?? 0} expansions, ${diagnostics.cappedRouteSearches ?? 0} capped`
    );
    if (diagnostics.routeSearchTotalsByKind) {
      lines.push(`Route kinds: ${formatRouteSearchKindBreakdown(diagnostics.routeSearchTotalsByKind)}`);
    }
    const analyzerBuild = diagnostics.analyzeBuildId ?? analyzeBuildIdSafe;
    lines.push(`Analyzer build: ${analyzerBuild}`);
    if (diagnostics.cooperativeIteratorTotals) {
      const cooperative = diagnostics.cooperativeIteratorTotals;
      const searchSlices = diagnostics.cooperativeSearchTotals ?? {};
      lines.push(
        `Cooperative yielding v49o: max uninterrupted ${formatGenerationDuration(cooperative.maxSliceMs ?? 0)} (${cooperative.maxSlicePhase ?? "unknown"}${cooperative.maxSliceSearchKind ? `/${cooperative.maxSliceSearchKind}` : ""}), ${cooperative.browserYields ?? 0} browser yield(s) / ${formatGenerationDuration(cooperative.browserPausedMs ?? 0)} paused, ${cooperative.slices ?? 0} iterator slice(s); resumable physical search ${searchSlices.searches ?? 0} search(es)/${searchSlices.slices ?? 0} useful boundary(ies), ${cooperative.routeSearchBrowserYields ?? 0} route-slice handoff(s), ${formatGenerationDuration(searchSlices.pausedMs ?? 0)} suspended, max search work slice ${formatGenerationDuration(searchSlices.maxSliceWorkMs ?? 0)}.`
      );
    } else {
      lines.push(
        `Cooperative yielding v49o: telemetry unavailable from analyzer build ${analyzerBuild}.`
      );
    }
    if ((diagnostics.resumeTotals?.searches ?? 0) > 0) {
      const resume = diagnostics.resumeTotals;
      lines.push(
        `Resumable widening v49k: ${resume.searches ?? 0} exhaustive continuation(s), saved-root ~${resume.savedRootExpansions ?? 0}exp, horizon replay ${resume.replayExpansions ?? 0}exp; generation-wide telemetry.`
      );
    }
    if (diagnostics.searchProfile) {
      const search = diagnostics.searchProfile;
      lines.push(
        currentNormalEstimateModel
          ? `Search profile: ${diagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}; attempts ${diagnostics.maxAttempts ?? scenarioMaxAttempts}${diagnostics.emergencyAttemptReserve ? ` +${diagnostics.emergencyAttemptReserve} emergency only if no fallback` : ""}, preflight audition ${Math.min(Number(search.preflightOpeningExpansions) || 700, 700)}/${Math.min(Number(search.preflightLaterExpansions) || 600, 600)}exp, primary witnesses ${search.primaryWitnessRoutes ?? "?"}, primary ${search.physicalTemplateExpansions ?? 700}exp/${search.physicalTemplateMaxActions ?? 36}a + resumable exhaustive-on-miss, traffic ${search.trafficEnabled ? `${search.trafficEpochs ?? 0} feedback-round ceiling, convergence stop on, alternates ${search.trafficAlternatesEnabled ? "on" : "off"}, common judgement demand≥${search.trafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD}/gain≥${search.trafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN}, bounded new-search round ceiling ${search.trafficAlternateMaxNewSearchesPerEpoch ?? 0}, ${search.trafficAlternateMaxNewSearchesTotal ?? 0} safety-cap @${search.trafficAlternateExpansions ?? 0}exp/${search.trafficAlternateMaxActions ?? 0}a, uncertainty effort floor ${search.trafficAlternateUncertaintyEffortFloor ?? 1}/curve ${search.trafficAlternateUncertaintyEffortExponent ?? 1}, explore-gap ${Math.round((search.trafficExplorationUncertaintyShare ?? 0) * 100)}% above conf ${search.trafficExplorationConfidenceFloor ?? 1}${search.devRouteModelOverrideActive ? ", Dev override" : ""}` : `off${search.devRouteModelOverrideActive ? " (Dev override)" : ""}`}`
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
      const dynamicArchiveCache = diagnostics.dynamicArchivePhysicalCacheTotals ?? null;
      if ((dynamicArchiveCache?.requests ?? 0) > 0) {
        const archiveHitRate = dynamicArchiveCache.requests
          ? Math.round((dynamicArchiveCache.hits / dynamicArchiveCache.requests) * 100)
          : 0;
        lines.push(
          `Dynamic Archive cache v49k: ${dynamicArchiveCache.hits}/${dynamicArchiveCache.requests} physical-template hits (${archiveHitRate}%), ${dynamicArchiveCache.misses} misses; cheap recovery/pressure proxy ${dynamicArchiveCache.cheapProxyRequests ?? 0} request(s), ${dynamicArchiveCache.cheapProxyOrigins ?? 0} leg origin(s), ${dynamicArchiveCache.cheapProxyPoints ?? 0} recovery point(s); selected exact replay ${dynamicArchiveCache.exactReplayChecks ?? 0} leg(s)/${dynamicArchiveCache.exactReplayActions ?? 0} action(s), ${dynamicArchiveCache.exactReplayMismatches ?? 0} mismatch(es), ${formatGenerationDuration(dynamicArchiveCache.exactReplayMs ?? 0)}; exact-keyed archive markers ${dynamicArchiveCache.archivePoints ?? 0}; archive utility ${dynamicArchiveCache.utilityCalls ?? 0} route-score eval(s), ${dynamicArchiveCache.utilityArchiveLandings ?? 0} landing(s) [improved ${dynamicArchiveCache.utilityImprovedLandings ?? 0}, same suppressed ${dynamicArchiveCache.utilitySameArchiveSuppressed ?? 0}, non-improving ${dynamicArchiveCache.utilityNonImprovingLandings ?? 0}], rewarded routes ${dynamicArchiveCache.utilityRoutesWithReward ?? 0}, reward total/max ${Number(dynamicArchiveCache.utilityRewardTotal ?? 0).toFixed(2)}/${Number(dynamicArchiveCache.utilityMaxRouteReward ?? 0).toFixed(2)}. Cached templates contain board mechanics only; recovery and recovery-aware pit/edge pressure are applied afterward, and exact realization keeps true archive chronology.`
        );
      }
      const cheapProgramCache = diagnostics.cheapProgramAvailabilityTotals ?? null;
      if ((cheapProgramCache?.requests ?? 0) > 0) {
        const cheapProgramHitRate = cheapProgramCache.requests
          ? Math.round((cheapProgramCache.hits / cheapProgramCache.requests) * 100)
          : 0;
        lines.push(
          `Cheap program hypergeometry cache: ${cheapProgramCache.hits}/${cheapProgramCache.requests} hits (${cheapProgramHitRate}%), ${cheapProgramCache.misses} misses, ${formatGenerationDuration(cheapProgramCache.missComputeMs ?? 0)} miss-compute, ${cheapProgramCache.cacheEntries ?? 0} cached state(s).`
        );
      }
      const unionProgramCache = diagnostics.cheapProgramUnionAvailabilityTotals ?? null;
      if (unionProgramCache) {
        const unionHitRate = unionProgramCache.requests
          ? Math.round((unionProgramCache.hits / unionProgramCache.requests) * 100)
          : 0;
        lines.push(
          `Search card union cache v49ay: ${unionProgramCache.hits}/${unionProgramCache.requests} hits (${unionHitRate}%), ${unionProgramCache.misses} misses, ${unionProgramCache.subsetTerms ?? 0} inclusion-exclusion term(s), ${formatGenerationDuration(unionProgramCache.missComputeMs ?? 0)} miss-compute, ${unionProgramCache.cacheEntries ?? 0} cached union state(s).`
        );
      }
      const frontierUnionProgramCache =
        diagnostics.cheapProgramFrontierUnionPenaltyTotals ?? null;
      if (frontierUnionProgramCache) {
        const frontierUnionHitRate = frontierUnionProgramCache.requests
          ? Math.round(
            (frontierUnionProgramCache.hits /
              frontierUnionProgramCache.requests) * 100
          )
          : 0;
        lines.push(
          `Search frontier union memo v49ay: ${frontierUnionProgramCache.hits}/${frontierUnionProgramCache.requests} hits (${frontierUnionHitRate}%), ${frontierUnionProgramCache.misses} misses, ${frontierUnionProgramCache.cacheEntries ?? 0} cached frontier state-set(s).`
        );
      }
      const demandMemoRequests =
        (profile.estimatedDemandMemoHits ?? 0) + (profile.estimatedDemandMemoMisses ?? 0);
      const forecastMemoRequests =
        (profile.estimatedForecastMemoHits ?? 0) + (profile.estimatedForecastMemoMisses ?? 0);
      const compactCardMemoRequests =
        (profile.estimatedCompactCardMemoHits ?? 0) + (profile.estimatedCompactCardMemoMisses ?? 0);
      if (demandMemoRequests > 0 || forecastMemoRequests > 0 || compactCardMemoRequests > 0) {
        const demandMemoHitRate = demandMemoRequests
          ? Math.round(((profile.estimatedDemandMemoHits ?? 0) / demandMemoRequests) * 100)
          : 0;
        const forecastMemoHitRate = forecastMemoRequests
          ? Math.round(((profile.estimatedForecastMemoHits ?? 0) / forecastMemoRequests) * 100)
          : 0;
        const compactCardMemoHitRate = compactCardMemoRequests
          ? Math.round(((profile.estimatedCompactCardMemoHits ?? 0) / compactCardMemoRequests) * 100)
          : 0;
        lines.push(
          `Cheap card transition memo v49k: demand ${(profile.estimatedDemandMemoHits ?? 0)}/${demandMemoRequests} hits (${demandMemoHitRate}%); frontier ${(profile.estimatedForecastMemoHits ?? 0)}/${forecastMemoRequests} hits (${forecastMemoHitRate}%); literal-state ${(profile.estimatedCompactCardMemoHits ?? 0)}/${compactCardMemoRequests} hits (${compactCardMemoHitRate}%). Generation-scoped caches partitioned by card-rule signature; card probabilities/variant semantics unchanged.`
        );
      }
      const profiledContextualWallMs = diagnostics.contextualProfileDurationMs ?? 0;
      if (
        profile &&
        profiledContextualWallMs > 0 &&
        (profile.timingSampledNodes ?? 0) > 0
      ) {
        const sampledNodes = profile.timingSampledNodes ?? 0;
        const populationNodes = profile.timingPopulationNodes ?? 0;
        lines.push(
          `Cheap search hot-path v49k: ${formatGenerationDuration(profiledContextualWallMs)} profiled route-search wall across ${profile.exactContextualSearches ?? 0} search(es)/${profile.exactContextualExpansions ?? 0} popped node(s); sampled ${sampledNodes}/${populationNodes} popped node(s); ${formatMajorContextualProfileShare(profile, profiledContextualWallMs)}; ${formatContextualEfficiency(profile, profile.exactContextualExpansions ?? 0)}.`
        );
        const exhaustiveProfile = diagnostics.exhaustiveContextualProfileTotals ?? null;
        const exhaustiveKindMs = Object.entries(diagnostics.routeSearchTotalsByKind ?? {})
          .filter(([kind]) => kind.includes("exhaustive"))
          .reduce((sum, [, bucket]) => sum + (bucket?.durationMs ?? 0), 0);
        if (exhaustiveProfile && exhaustiveKindMs > 0) {
          lines.push(
            `Exhaustive hot-path v49k: ${formatGenerationDuration(exhaustiveKindMs)} exhaustive wall; ${formatMajorContextualProfileShare(exhaustiveProfile, exhaustiveKindMs)}; ${formatContextualEfficiency(exhaustiveProfile, exhaustiveProfile.exactContextualExpansions ?? 0)}.`
          );
        }
        if ((profile.physicalMissSampledCalls ?? 0) > 0) {
          lines.push(
            `Physical miss profile v49k: ${profile.physicalMissSampledCalls ?? 0} sampled miss(es), ${formatGenerationDuration(profile.simulationMissMs ?? 0)} estimated miss time; ${formatPhysicalMissProfileShare(profile)}.`
          );
          if ((profile.physicalMissProgrammedMs ?? 0) > 0) {
            lines.push(
              `Programmed miss profile v49k: ${formatGenerationDuration(profile.physicalMissProgrammedMs ?? 0)} estimated programmed time; ${formatProgrammedPhysicalMissProfileShare(profile)}.`
            );
          }
        }
      }
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
    if (
      diagnostics.slowestRouteSearch?.contextualProfile &&
      hasContextualTimingProfile(diagnostics.slowestRouteSearch.contextualProfile)
    ) {
      const slowest = diagnostics.slowestRouteSearch;
      lines.push(
        `Slowest contextual profile: ${formatMajorContextualProfileShare(slowest.contextualProfile, slowest.durationMs)}; ${formatContextualEfficiency(slowest.contextualProfile, slowest.expansions)}`
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
        if (
          !(entry.contextualSearches > 0) ||
          !(entry.contextualDurationMs > 0) ||
          !hasContextualTimingProfile(entry.contextualProfile)
        ) continue;
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
        const kind = diagnostics.finalTailCleanupPruned
          ? "tail"
          : diagnostics.balanceDispersionPruned
            ? "balance"
            : "outlier";
        const zBits = [];
        if (Number.isFinite(diagnostics.ordinaryScoreZ)) zBits.push(`ordinaryZ ${diagnostics.ordinaryScoreZ}`);
        if (Number.isFinite(diagnostics.scoreZ)) zBits.push(`scoreZ ${diagnostics.scoreZ}`);
        if (Number.isFinite(diagnostics.actionZ)) zBits.push(`actionZ ${diagnostics.actionZ}`);
        return `#${item.index + 1} ${kind} p${item.pass ?? "?"}${zBits.length ? ` (${zBits.join(", ")})` : ""}`;
      }).join(", ")
      : "none";
    lines.push(
      `Normal balance: ${balance.iterative ? "iterative" : (balance.staged ? "staged" : "legacy")}, pruned ${prunedText}`,
      `Balance stddev: ${balance.balanceStdDevBefore ?? "n/a"} -> ${balance.balanceStdDevAfter ?? scenario.metrics?.fairnessStdDev ?? "n/a"} / ${balance.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, traffic recomputations ${balance.trafficRecomputations ?? 0}, fullTraffic iterations ${balance.fullTrafficIterations ?? 0}, fullTraffic pruned ${(balance.fullTrafficPruned ?? []).length}, remainingBad ${(balance.remainingBadStarts ?? []).length}, reject ${balance.reject ? "yes" : "no"}`,
      `Normal retained field: ${balance.retainedCount ?? scenario.metrics?.usableStarts?.length ?? "n/a"} start(s), effectiveRE ${balance.retainedEffectiveREMin ?? balance.retainedScoreMin ?? "n/a"}..${balance.retainedEffectiveREMax ?? balance.retainedScoreMax ?? "n/a"} (range ${balance.retainedEffectiveRERange ?? balance.retainedScoreRange ?? "n/a"}), worst remaining RE z ${balance.worstRemainingScoreZ ?? "n/a"}${Number.isInteger(balance.worstRemainingScoreIndex) ? ` (#${balance.worstRemainingScoreIndex + 1})` : ""}; register actionZ ${balance.worstRemainingActionZ ?? "n/a"} diagnostic only; metric ${balance.fairnessMetric ?? "full-course-effective-RE"}`
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
      `Competitive balance v49fj: Start Balance ${formatStartBalanceLabel(scenario.preferences?.startBalance)} applies to post-block best-P only; sequential best-one completed-RE blocks ${competitive.blockedStartCount ?? 0}/${scenario.playerCount ?? scenario.preferences?.playerCount ?? "?"} [${(competitive.blockedIndices ?? []).map((index) => `#${index + 1}`).join(", ") || "none"}], traffic recomputed after every block (${competitive.trafficRecomputations ?? 0} total); remaining choices ${competitive.remainingStartCount ?? 0}, post-block best-${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} [${(competitive.selectedIndices ?? []).map((index) => `#${index + 1}`).join(", ") || "none"}], RE range ${competitive.selectedRangeRE ?? competitive.scoreRange ?? "n/a"}/${competitive.balanceRangeLimit ?? "n/a"} soft/${competitive.hardBalanceRangeLimit ?? "n/a"} hard (excess ${competitive.balanceRangeExcess ?? "n/a"}; observed ${competitive.observedBalanceRangeExcess ?? competitive.balanceRangeExcess ?? "n/a"}; median ${competitive.selectedMedianTurns ?? "n/a"} turns), SD ${competitive.selectedStdDev ?? "n/a"} diagnostic-only, strategic difficulty +${competitive.strategicDifficulty ?? "n/a"} (block challenge ${competitive.strategicDifficultyEvidence?.meanBlockChallenge ?? "n/a"}, selection ambiguity ${competitive.strategicDifficultyEvidence?.selectionAmbiguity ?? "n/a"}), RE-native legibility fit +${competitive.blockReadability?.fitPenalty ?? 0} (${competitive.blockReadability?.requestedDifficulty ?? "any"}; legacy shadow OFF), block traffic ${competitive.blockTrafficScope ?? "n/a"}, softBalanced ${competitive.softBalanced ? "yes" : "no"}, hardAcceptable ${competitive.hardAcceptable ? "yes" : "no"}, method ${competitive.method ?? "n/a"}`
    );
  } else if ((scenario.payToWin || scenario.subsidizedStarts) && payToWin?.active) {
    const subsidyMode = Boolean(scenario.subsidizedStarts);
    const pricingLabel = subsidyMode ? "Subsidized Starts" : "Pay to Win";
    const pricingShortLabel = subsidyMode ? "Subsidy" : "P2W";
    const pricingModel = payToWin.pricingModel ?? {};
    const selectorSplit = payToWin.selectorSplit ?? null;
    const finalStartBalance = payToWin.startBalanceFinalCheck ?? null;
    lines.push(
      `${pricingLabel}: model ${pricingModel.method ?? "n/a"}, economy ${payToWin.pricingEconomyMethod ?? "n/a"}, pruning ${payToWin.pruningPolicy ?? "legacy"}, target ${pricingModel.target ?? "n/a"}, ${subsidyMode ? `startingEnergy ${payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}E / subsidy-total ceiling ${payToWin.subsidyStartingEnergyCeiling ?? pricingModel.subsidyStartingEnergyCeiling ?? "n/a"}E / storage ${payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}E` : `startingEnergy ${payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}E / storage ${payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}E`}, startingUpgradeCards ${payToWin.startingUpgradeCards ?? DEFAULT_STARTING_UPGRADE_CARDS} (unknown at start choice), offered ${payToWin.pricedStartCount ?? "n/a"}, pruned ${(payToWin.pruned ?? []).length}, selector-unavailable ${payToWin.fullyUnavailableCount ?? 0}, residualRange ${payToWin.residualBalance?.worstRange ?? "n/a"}/${payToWin.residualBalance?.worstRangeLimit ?? "n/a"}RE (overflow ${payToWin.residualBalance?.worstRangeExcess ?? 0}; soft +${payToWin.residualBalance?.worstSoftOverflowAllowance ?? "n/a"}), residualPenalty ${payToWin.residualBalance?.worstResidualPenalty ?? 0}, meaningfulEnergy ${payToWin.meaningfulEnergyAdjustmentCount ?? 0}, Start Balance ${finalStartBalance?.startBalanceLabel ?? formatStartBalanceLabel(scenario.preferences?.startBalance)} final-pruned ${finalStartBalance?.pruneCount ?? 0}, SD ${payToWin.residualBalance?.worstStdDev ?? "n/a"} diagnostic-only, balance ${payToWin.balanceValid === false ? "residual" : "pass"}, surplusStarts ${payToWin.surplusStarts ?? 0}, latePricing ${payToWin.latePricingActive ? "active" : "inactive"}, slashPrices ${payToWin.hasLatePriceDifference ? "yes" : "no"}`
    );
    if (finalStartBalance) {
      lines.push(
        `${pricingShortLabel} final Start Balance v49fn: ${finalStartBalance.startBalanceLabel} ${finalStartBalance.enforced ? "ON" : "off"}; before early ${finalStartBalance.before?.early?.range ?? "n/a"}/${finalStartBalance.before?.early?.rangeLimit ?? "n/a"}RE${finalStartBalance.before?.latePricingActive ? `, late ${finalStartBalance.before?.late?.range ?? "n/a"}/${finalStartBalance.before?.late?.rangeLimit ?? "n/a"}RE` : ""}; batch pruned [${(finalStartBalance.prunedIndices ?? []).map((index) => `#${index + 1}`).join(", ") || "none"}]; traffic recompute ${finalStartBalance.trafficRecomputed ? "yes" : "no"}, repriced ${finalStartBalance.repriced ? "yes" : "no"}; final early ${finalStartBalance.afterReprice?.early?.range ?? "n/a"}/${finalStartBalance.afterReprice?.early?.rangeLimit ?? "n/a"}RE${finalStartBalance.afterReprice?.latePricingActive ? `, late ${finalStartBalance.afterReprice?.late?.range ?? "n/a"}/${finalStartBalance.afterReprice?.late?.rangeLimit ?? "n/a"}RE` : ""}; pass ${finalStartBalance.withinTargetAfterReprice ? "yes" : "NO"}`
      );
    }
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
    const reOwnershipAudit = payToWin.reOwnershipAudit ?? null;
    if (reOwnershipAudit?.early) {
      const formatPhase = (label, phase) => (
        `${label}: raw→post RE sd ${phase.rawStdDev ?? "n/a"}→${phase.postStdDev ?? "n/a"}, ` +
        `actionable penalty ${phase.residualPenalty ?? 0}, ignored duration ${phase.ignoredDurationPenalty ?? 0}, nonzero adjustments ` +
        `${phase.nonzeroAdjustments ?? 0}, max ${subsidyMode ? "+" : ""}${phase.maxAdjustment ?? 0}E`
      );
      lines.push(
        `Economy start RE ownership v49ct LIVE: ${reOwnershipAudit.mode}; ` +
        `RE-native occupancy, incremental 1E until Energy-actionable RE prune is avoided; literal duration is diagnostic-only; ${formatPhase("early", reOwnershipAudit.early)}` +
        `${payToWin.latePricingActive ? `; ${formatPhase("late", reOwnershipAudit.late)}` : ""}; ` +
        `extreme-baseline availability/pruning retired`
      );
    }
    const selectorRuntime = payToWin.selectorRuntimeOptimization ?? null;
    if (selectorRuntime) {
      lines.push(
        `Economy selector runtime v49cl: exact frozen-field reuse ` +
        `${selectorRuntime.finalPricingStateReused ? "HIT" : "MISS"}; ` +
        `reused ${selectorRuntime.reusedBaseStartCurves ?? 0} base start curve(s) + ` +
        `${selectorRuntime.reusedSelectorScenarioSamples ?? 0} selector scenario(s); ` +
        `selector sampling unchanged`
      );
    }
    const targetedRescue = payToWin.targetedEnergyRescue ?? null;
    if (targetedRescue) {
      lines.push(
        `Economy targeted Energy rescue v49ct: attempts ${targetedRescue.attempts ?? 0}, ` +
        `direction-skips ${targetedRescue.skippedDirectionMismatch ?? 0}, accepted ${targetedRescue.accepted ?? 0}, saved prunes ${targetedRescue.savedPrunes ?? 0}, ` +
        `routes discovered/added ${targetedRescue.routesDiscovered ?? 0}/${targetedRescue.routesAdded ?? 0}` +
        ((targetedRescue.details ?? []).length
          ? `; ${targetedRescue.details.map((entry) => `#${entry.index + 1}${Number.isFinite(entry.startingEnergy) ? `@${entry.startingEnergy}E` : ""} ${entry.directionProfile?.mode ?? ""} ${entry.reason}${Number.isFinite(entry.penaltyBefore) && Number.isFinite(entry.penaltyAfter) ? ` ${entry.penaltyBefore}->${entry.penaltyAfter}` : ""}`.replace(/\s+/g, " ").trim()).join(" | ")}`
          : "")
      );
    }
    if (pricingModel.paymentPenalties?.length) {
      const impactText = pricingModel.paymentPenalties.map((entry) => (
        subsidyMode
          ? `+${entry.payment}E benefit median/max ${entry.medianScore ?? "n/a"}/${entry.maxScore ?? "n/a"} score (${entry.medianRegisters ?? "n/a"}/${entry.maxRegisters ?? "n/a"}R)`
          : `${entry.payment}E median/max +${entry.medianScore ?? "n/a"}/+${entry.maxScore ?? "n/a"} score (${entry.medianRegisters ?? "n/a"}/${entry.maxRegisters ?? "n/a"}R)`
      )).join(", ");
      const denialText = subsidyMode
        ? `+${payToWin.maxSubsidy ?? pricingModel.maxSubsidy ?? SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY}E max subsidy; ${pricingModel.denialCost ?? getPayToWinDenialCost({ startingEnergy: payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY, maxEnergy: payToWin.maxEnergy ?? 10, subsidizedStarts: true })}E = uncompensated/prune signal`
        : `${pricingModel.denialCost ?? getPayToWinDenialCost({ startingEnergy: payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY })}E = deny/prune`;
      lines.push(
        `${pricingShortLabel} final-field ${subsidyMode ? "subsidy benefit" : "payment impact"}: register ${pricingModel.registerScore ?? "n/a"} score, horizon ${pricingModel.horizonTurns ?? "n/a"} turns; ${impactText}; ${denialText}`
      );
    }
    if ((payToWin.pruned ?? []).length) {
      const economyPruned = (payToWin.pruned ?? []).filter((item) => !item.finalStartBalancePruned);
      const fairnessPruned = (payToWin.pruned ?? []).filter((item) => item.finalStartBalancePruned);
      if (economyPruned.length) {
        lines.push(
          `${pricingShortLabel} ordinary Energy-economy pruning: ${economyPruned.map((item) => `p${item.pass} -> #${item.index + 1} (${item.reason})`).join("; ")}`
        );
      }
      if (fairnessPruned.length) {
        lines.push(
          `${pricingShortLabel} final Start Balance batch: ${fairnessPruned.map((item) => `#${item.index + 1}`).join(", ")}`
        );
      }
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

  lines.push(
    balance?.active
      ? `Fairness (retained full-course balance): stddev ${scenario.metrics?.fairnessStdDev ?? balance.balanceStdDevAfter ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`
      : scenario.competitiveMode
        ? `Fairness (Competitive simulated selected field): stddev ${scenario.metrics?.fairnessStdDev ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`
        : `Fairness: stddev ${scenario.metrics?.fairnessStdDev ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`,
    `Difficulty: ${scenario.metrics?.difficultyTurnRE ?? "n/a"} RE/turn (${formatPresentedDifficultyLabel(scenario.metrics)}); legacy construction/raw diagnostic ${scenario.metrics?.difficultyRaw ?? "n/a"}`,
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
        `Estimate→realize: milestone-1 ${contextualCache.estimatedMilestoneRoutes ?? 0}/${estimatedSourceStarts} complete physical routes, forecast-card-intact ${contextualCache.estimatedForecastIntactRoutes ?? 0}/${contextualCache.estimatedMilestoneRoutes ?? 0}, physical failures ${contextualCache.estimatedPhysicalFailures ?? 0}; estimate cache ${contextualCache.estimatedLegCacheHits ?? 0} hits/${contextualCache.estimatedLegSearches ?? 0} searches/${contextualCache.estimatedLegWitnessesGenerated ?? 0} witnesses (${contextualCache.estimatedLegWidenedSearches ?? 0} exhaustive widenings; resumed ${contextualCache.estimatedLegResumedWidenings ?? 0}, saved-root ~${contextualCache.estimatedLegResumeSavedRootExpansions ?? 0}exp, horizon replay ${contextualCache.estimatedLegResumeReplayExpansions ?? 0}exp, fresh fallback ${contextualCache.estimatedLegFreshExhaustiveFallbacks ?? 0}), Energy guidance ${contextualCache.estimatedEnergyGuidance ? "on" : "off"}; exact realization direct/repaired/failed ${contextualCache.exactRealizationDirectSuccesses ?? 0}/${contextualCache.exactRealizationRepairedSuccesses ?? 0}/${contextualCache.exactRealizationFailures ?? 0} across ${contextualCache.exactRealizationAttempts ?? 0} checks; failure-point replans ${contextualCache.cardRepairReplans ?? 0}/${contextualCache.cardRepairFailurePoints ?? 0}, prefix backtracks ${contextualCache.cardRepairPrefixBacktracks ?? 0}, no-suffix ${contextualCache.cardRepairNoSuffix ?? 0}, downstream rebuild failures ${contextualCache.cardRepairDownstreamRebuildFailures ?? 0}, repeated candidates ${contextualCache.cardRepairRepeatedCandidates ?? 0}`
      );
      if ((contextualProfile?.trafficFeedbackLoopEnabled || contextualCache.trafficEpochsExecuted > 0) && routeStrategy) {
        lines.push(
          `Traffic feedback v49aj: rounds ${contextualCache.trafficEpochsExecuted ?? 0}/${contextualProfile?.trafficEpochs ?? 0} ceiling, stop ${contextualCache.trafficFeedbackStopReason ?? "?"}, convergence checks/hits ${contextualCache.trafficFeedbackConvergenceChecks ?? 0}/${contextualCache.trafficFeedbackConvergedRounds ?? 0}, demand ${contextualCache.trafficAlternateDemandStarts ?? 0} start-visits/${contextualCache.trafficAlternateDemandLegs ?? 0} legs (${contextualCache.trafficAlternateEffectiveDemandLegs ?? 0} effective/${contextualCache.trafficAlternateExploratoryDemandLegs ?? 0} exploratory/${contextualCache.trafficAlternatePressureDemandLegs ?? 0} pressure), pressure-restored ${contextualCache.trafficAlternatePressureRestoredLegs ?? 0} leg(s), pressure RE avg/max ${contextualCache.trafficAlternateAveragePressureRegisterEquivalents ?? 0}/${contextualCache.trafficAlternateMaximumPressureRegisterEquivalents ?? 0}, effort base→used avg ${contextualCache.trafficAlternateAverageBaseEffortScale ?? 1}→${contextualCache.trafficAlternateAverageEffortScale ?? 1}, hotspot-local ${contextualCache.trafficAlternateHotspotLocalSearches ?? 0} search(es), prefix kept avg/max ${contextualCache.trafficAlternateHotspotAveragePrefixActions ?? 0}/${contextualCache.trafficAlternateHotspotMaximumPrefixActions ?? 0}, leg-start fallback ${contextualCache.trafficAlternateHotspotFallbackLegStarts ?? 0}, 2-reg lookback ${contextualCache.trafficAlternateHotspotTwoRegisterLookbacks ?? 0}, cached divergence checks ${contextualCache.trafficAlternateCachedWitnessChecks ?? 0}, probe-stops ${contextualCache.trafficAlternateCachedProbeStops ?? 0}, cache-useful ${contextualCache.trafficAlternateCachedUsefulStops ?? 0}, local-cache ${contextualCache.trafficAlternateLocalCacheHits ?? 0}, repeat-miss checks/stops ${contextualCache.trafficAlternateRepeatedMissEvidenceChecks ?? 0}/${contextualCache.trafficAlternateRepeatedMissEvidenceStops ?? 0}, deeper-retries ${contextualCache.trafficAlternateRepeatedMissEvidenceDeeperRetries ?? 0}, miss-evidence ${contextualCache.trafficAlternateRepeatedMissEvidenceEntries ?? 0}, exact-evidence checks/stored/entries/promoted/stops ${contextualCache.trafficAlternateEvidenceCandidateChecks ?? 0}/${contextualCache.trafficAlternateEvidenceCandidatesStored ?? 0}/${contextualCache.trafficAlternateEvidenceCandidateEntries ?? 0}/${contextualCache.trafficAlternateEvidenceCandidatesPromoted ?? 0}/${contextualCache.trafficAlternateEvidenceSaturationStops ?? 0}, escalations ${contextualCache.trafficAlternateEscalations ?? 0}, new bounded searches ${contextualCache.trafficAlternateNewSearches ?? 0}/${contextualCache.trafficAlternateMaxNewSearchesTotal ?? contextualProfile?.trafficAlternateMaxNewSearchesTotal ?? 0} safety-cap (${contextualCache.trafficAlternateSearchNoRoutes ?? 0} no-route), exact alt checks/rejects ${contextualCache.trafficAlternateExactChecks ?? 0}/${contextualCache.trafficAlternateExactRejects ?? 0} [card ${contextualCache.trafficAlternateCardRejects ?? 0}, validation ${contextualCache.trafficAlternateValidationRejects ?? 0}], duplicates ${contextualCache.trafficAlternateDuplicateRejects ?? 0}, low-gain ${contextualCache.trafficAlternateLowGainRejects ?? 0}, downstream-miss ${contextualCache.trafficAlternateDownstreamRebuildFailures ?? 0}, candidates added ${contextualCache.trafficAlternateCandidatesAdded ?? 0}, best combined gain ${contextualCache.trafficAlternateBestGain ?? 0}; round trace ${(contextualCache.trafficFeedbackRoundSummaries ?? []).map((entry) => `R${entry.round} s${entry.newSearches}/c${entry.candidatesAdded}/g${entry.bestGain}${entry.adaptiveEvidence ? `/e${entry.evidenceChecks ?? 0}-${entry.evidenceStops ?? 0}` : ""}${entry.fieldChanged ? `/Δr${entry.selectedRouteChanges}/m${entry.mixtureWeightDelta}/o${entry.occupancyWeightDelta}` : ""}${entry.stopReason ? `/${entry.stopReason}` : ""}`).join(", ") || "none"}; exploration gap ${(contextualCache.trafficExplorationUncertaintyShare ?? 0) * 100}% above conf ${contextualCache.trafficExplorationConfidenceFloor ?? 1}; traffic raw/effective avg ${routeStrategy.averageRawPenalty ?? 0}/${routeStrategy.averagePenalty ?? 0}, forecast confidence mean/min ${routeStrategy.averageForecastConfidence ?? 1}/${routeStrategy.minimumForecastConfidence ?? 1}`
        );
        const commonOccupancy = routeStrategy.commonOccupancyField ?? null;
        if (commonOccupancy?.weights?.length) {
          lines.push(
            `Traffic start occupancy: ${commonOccupancy.method ?? "common-field"}, players ${commonOccupancy.playerCount ?? scenario.playerCount ?? "?"}, available starts ${commonOccupancy.startCount ?? commonOccupancy.weights.length}, total weight ${commonOccupancy.totalWeight ?? "?"}; ${commonOccupancy.weights.map((entry) => `#${entry.index + 1} ${entry.weight} @q${entry.qualityScore}`).join(", ")}`
          );
        }
        const routeMixture = routeStrategy.routeMixtureField
          ?? contextualCache.trafficRouteMixtureField
          ?? null;
        const routeFamilyDivergence =
          routeStrategy.routeFamilyDivergenceField
          ?? contextualCache.trafficRouteFamilyDivergenceField
          ?? null;
        if (routeMixture?.startCount) {
          lines.push(
            `Traffic route mixture v49ac: ${routeMixture.model ?? "quality-weighted-route-families"}, starts ${routeMixture.startCount}, candidates/families/retained ${routeMixture.candidateCount ?? 0}/${routeMixture.familyCount ?? 0}/${routeMixture.retainedFamilyCount ?? 0}, families avg ${routeMixture.averageFamiliesPerStart ?? 0}, effective routes avg ${routeMixture.averageEffectiveRouteCount ?? 0}, alternate occupancy share avg/max ${routeMixture.averageAlternateShare ?? 0}/${routeMixture.maximumAlternateShare ?? 0}; same-traffic-trajectory witnesses are one family and each start keeps its fixed total occupancy`
          );
        }
        if (routeMixture?.startCount) {
          lines.push(
            `Traffic route-mixture ownership v49dc LIVE: completed effective RE (including traffic-awareness mental) owns route-family attractiveness; starts ${routeMixture.startCount}, alternate share avg/max ${routeMixture.averageAlternateShare ?? 0}/${routeMixture.maximumAlternateShare ?? 0}, effective-route count avg ${routeMixture.averageEffectiveRouteCount ?? 0}; fixed start occupancy preserved`
          );
        }
        lines.push(
          "Traffic route-switch objective: intentional legacy pathfinder route.score + traffic.total (+4% raw-gap stability) for switching among already-discovered candidates; route-family occupancy attractiveness remains completed effective RE."
        );
        if (routeFamilyDivergence) {
          const legSummary = (routeFamilyDivergence.perLeg ?? [])
            .map((entry) => (
              `L${entry.leg}:geoStarts${entry.startsWithGeometricAlternate ?? 0},` +
              `w${entry.geometricAlternateWeight ?? 0},` +
              `div${entry.averageCorridorDiversity ?? 0}/${entry.maximumCorridorDiversity ?? 0},` +
              `regs${entry.averageGeometricDistinctRegisters ?? 0},` +
              `runMax${entry.maximumGeometricDistinctRun ?? 0},` +
              `first${entry.earliestGeometricDivergenceRegister ?? "-"},` +
              `last${entry.latestGeometricDistinctRegister ?? "-"}`
            ))
            .join(" | ");
          lines.push(
            `Traffic route-family divergence v49ce OBSERVATIONAL: starts retained/geometric/trajectory-only ${routeFamilyDivergence.startsWithRetainedAlternates ?? 0}/${routeFamilyDivergence.startsWithGeometricAlternates ?? 0}/${routeFamilyDivergence.startsWithTrajectoryOnlyAlternates ?? 0} of ${routeFamilyDivergence.startCount ?? 0}; alternate families geometric/trajectory-only ${routeFamilyDivergence.retainedGeometricAlternateFamilies ?? 0}/${routeFamilyDivergence.retainedTrajectoryOnlyAlternateFamilies ?? 0}; ${legSummary || "no leg data"}`
          );
          const startSummaries = (routeFamilyDivergence.starts ?? [])
            .filter((entry) => (
              (entry.geometricAlternateFamilyCount ?? 0) > 0 ||
              (entry.trajectoryOnlyAlternateFamilyCount ?? 0) > 0
            ))
            .map((entry) => {
              const legs = (entry.perLeg ?? [])
                .filter((leg) => (
                  (leg.geometricAlternateCount ?? 0) > 0 ||
                  (leg.trajectoryOnlyAlternateCount ?? 0) > 0
                ))
                .map((leg) => (
                  `L${leg.leg}[g${leg.geometricAlternateCount ?? 0}` +
                  `/t${leg.trajectoryOnlyAlternateCount ?? 0}` +
                  `/w${leg.geometricAlternateWeight ?? 0}` +
                  `/d${leg.maximumCorridorDiversity ?? 0}` +
                  `/run${leg.maximumGeometricDistinctRun ?? 0}` +
                  `/first${leg.earliestGeometricDivergenceRegister ?? "-"}` +
                  `/last${leg.latestGeometricDistinctRegister ?? "-"}` +
                  `/rejoin${leg.earliestGeometricRejoinRegister ?? "-"}]`
                ))
                .join(",");
              return (
                `s${entry.startIndex + 1}:alt${entry.alternateShare ?? 0}` +
                `/geo${entry.geometricAlternateShare ?? 0}` +
                `/traj${entry.trajectoryOnlyAlternateShare ?? 0}` +
                (legs ? ` ${legs}` : "")
              );
            })
            .join(" | ");
          if (startSummaries) {
            lines.push(`Traffic route-family starts: ${startSummaries}`);
          }
        }
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
        `Programming supply: selected ${scarcity.selectedRoutes ?? 0} routes, Again used on ${scarcity.routesUsingAgain ?? 0} route(s)/${scarcity.totalAgainTurns ?? 0} turn(s), consecutive required-Again turns ${scarcity.consecutiveTurnAgainReuse ?? 0}, literal program violations ${scarcity.literalProgramViolations ?? 0}, rolling two-turn violations ${scarcity.rollingWindowViolations ?? 0}; exact ${scarcity.handSize ?? 9}-card hypergeometric availability penalty mean/max ${scarcity.meanCardAvailabilityPenalty ?? 0}/${scarcity.maxCardAvailabilityPenalty ?? 0}; card-scarcity scaling α=${scarcity.cardScarcityAdaptabilityFactor ?? 1}: mean/max ${scarcity.meanCardAvailabilityPenaltyRE ?? 0}/${scarcity.maxCardAvailabilityPenaltyRE ?? 0}RE vs raw-unscaled ${scarcity.meanCardAvailabilityPenaltyUncompressedRE ?? 0}/${scarcity.maxCardAvailabilityPenaltyUncompressedRE ?? 0}RE; normal 9-card fresh-deck reference P(1 of 4-copy) ${scarcity.baselineFourCopyProbability ?? "?"}, active P(singleton) ${scarcity.singleCopyProbability ?? "?"}, P(3 distinct singletons) ${scarcity.threeDistinctSingleCopyProbability ?? "?"}, P(repeated 4-copy action incl Again) ${scarcity.repeatedFourCopyWithAgainProbability ?? "?"}`
      );
      if (scarcity.discoveredCandidateCardPressure) {
        const audit = scarcity.discoveredCandidateCardPressure;
        lines.push(
          `Card-pressure candidate audit v49ce OBSERVATIONAL (DISCOVERED CANDIDATES ONLY): starts ${audit.auditedStarts ?? 0}, same-register alternatives ${audit.startsWithSameRegisterAlternative ?? 0}, lower-card same-register ${audit.startsWithLowerCardSameRegisterCandidate ?? 0}, lower-card same-or-fewer ${audit.startsWithLowerCardSameOrFewerCandidate ?? 0}, mean selected ${audit.meanSelectedCardRE ?? 0}RE, mean reducible same-register ${audit.meanSameRegisterReducibleRE ?? 0}RE, max reducible same-register ${audit.maximumSameRegisterReducibleRE ?? 0}RE`
        );
      }
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
        Number.isFinite(Number(entry.effectiveREGainSelectedVsBest))
      ));
      const switchedIntrinsicCosts = switchedDiagnostics
        .map((entry) => Number(entry.intrinsicCostSelectedVsBest))
        .filter(Number.isFinite);
      const switchedTrafficAdvantages = switchedDiagnostics
        .map((entry) => Number(entry.trafficAdvantageSelectedVsBest))
        .filter(Number.isFinite);
      const switchedEffectiveREGains = switchedDiagnostics
        .map((entry) => Number(entry.effectiveREGainSelectedVsBest))
        .filter(Number.isFinite);
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
          `Traffic search-choice deltas: ${switchedDiagnostics.length} switched start(s), completed-effective-RE gain median/max ${medianOrZero(switchedEffectiveREGains)}/${maxOrZero(switchedEffectiveREGains)}RE (production switch owner; minimum useful gain ${(NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN / 6.4).toFixed(4)}RE); legacy comparator search-cost increase median/max ${medianOrZero(switchedIntrinsicCosts)}/${maxOrZero(switchedIntrinsicCosts)}, traffic-pressure reduction median/max ${medianOrZero(switchedTrafficAdvantages)}/${maxOrZero(switchedTrafficAdvantages)}`
        );
      }
      if (candidateDiagnostics.length) {
        lines.push(
          `Traffic diversity by start: ${candidateDiagnostics.map((entry) => (
            `#${entry.startIndex + 1} ${entry.candidateCount ?? 0}c whole ${entry.wholeMostDifferentSimilarity ?? "n/a"} later ${entry.laterMostDifferentSimilarity ?? "n/a"} selected ${Number.isInteger(entry.selectedRouteIndex) ? entry.selectedRouteIndex + 1 : "?"}${entry.trafficSwitched ? "*" : ""} spread ${entry.scoreSpread ?? 0}${Number.isFinite(Number(entry.effectiveREGainSelectedVsBest)) ? ` ΔRE ${entry.effectiveREGainSelectedVsBest}` : ""}${Number.isFinite(Number(entry.intrinsicCostSelectedVsBest)) && Number.isFinite(Number(entry.trafficAdvantageSelectedVsBest)) ? ` [legacy Δsearch ${entry.intrinsicCostSelectedVsBest} Δpressure ${entry.trafficAdvantageSelectedVsBest}]` : ""}`
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
  if (scenario.metrics?.softFailures?.length) {
    lines.push(`Soft mismatches: ${scenario.metrics.softFailures.join(", ")}; fit ${scenario.metrics.fitScore ?? "n/a"}/${scenario.metrics.softFitLimit ?? SOFT_CANDIDATE_RETENTION_LIMIT}`);
  }

  // v49ce Dev performance cleanup: Copy Summary is a true lightweight benchmark
  // payload. Fresh route replays belong only to explicit deep Copy All / route
  // inspection, never to routine rendering or compact copying.
  return roundCourseEvaluationNumbers(lines.join("\n"));
}

function buildScenarioBenchmarkSummary(scenario) {
  // v49j Dev workflow: Copy Summary is the compact benchmark/checkpoint payload.
  // Copy All remains the full diagnostic report, so no diagnostic evidence is
  // removed; this only avoids pushing dozens of low-signal lines through the
  // clipboard/chat path during routine frozen-seed iteration.
  const fullSummary = buildScenarioCopySummary(scenario);
  const prefixes = [
    "Requested:",
    "Mode:",
    "Sets:",
    "Variants:",
    "Result:",
    "Dev test seed:",
    "Construction fingerprint:",
    "Selected-route fingerprint:",
    "Rejected construction fingerprints:",
    "Generation:",
    "Route kinds:",
    "Analyzer build:",
    "Cooperative yielding ",
    "Resumable widening ",
    "Search profile:",
    "Slowest:",
    "Physical cache:",
    "Dynamic Archive cache ",
    "Cheap program hypergeometry cache:",
    "Search card union cache v49ay:",
    "Search frontier union memo v49ay:",
    "Cheap card transition memo ",
    "Qualifying candidate pool:",
    "Soft fit:",
    "Rejected evaluations:",
    "Rejected route work:",
    "Preflight:",
    "Course:",
    "Construction calibration:",
    "Boards:",
    "Starts:",
    "Calibration stages:",
    "Start disposition:",
    "Normal balance:",
    "Balance stddev:",
    "Fairness ",
    "Difficulty:",
    "Legacy difficulty raw:",
    "RE-turn difficulty v49de",
    "RE-turn tier ownership v49de",
    "RE-turn difficulty candidate pool v49de",
    "RE-turn difficulty starts v49de",
    "Length raw:",
    "Course scores:",
    "Estimate→realize:",
    "Traffic feedback ",
    "Traffic route mixture ",
    "Traffic route-mixture ownership ",
    "Traffic route-switch objective:",
    "Traffic route-family divergence ",
    "Traffic route-family starts:",
    "Programming supply:",
    "Card-pressure candidate audit ",
    "Damage economy v10:",
    "Damage foundation ",
    "Exact reboot chronology "
  ];
  return fullSummary
    .split("\n")
    .filter((line) => prefixes.some((prefix) => line.startsWith(prefix)))
    .join("\n");
}


function buildDamageFoundationReportLines(scenario, options = {}) {
  if (!isDevViewEnabled() || typeof summarizeDamageEconomyFoundationForRoute !== "function") {
    return [];
  }
  const componentStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const includePerStart = options.includePerStart !== false;
  const includeEventStream = options.includeEventStream !== false;
  const replayCache = options.replayCache ?? getScenarioDevReplayCache(scenario);
  const tileMap = scenario?.goalTileMap;
  const starts = (scenario?.sequence?.firstLeg?.starts ?? [])
    .filter((entry) => entry?.reachable && entry?.fullCourseRoute);
  if (!tileMap || !starts.length) {
    return ["Damage economy v10: unavailable (no selected full-course routes)"];
  }

  const damageOptions = getDamageFoundationScenarioOptions(scenario);
  const entries = starts.map((startAnalysis) => ({
    startIndex: startAnalysis.index,
    foundation: getCachedRouteReplay(
      replayCache?.damageFoundationByRoute,
      startAnalysis.fullCourseRoute,
      () => summarizeDamageEconomyFoundationForRoute(
        tileMap,
        startAnalysis.fullCourseRoute,
        damageOptions,
        getDamageFoundationTrafficContext(scenario, startAnalysis.index)
      )
    )
  })).filter((entry) => entry.foundation);
  if (!entries.length) return ["Damage economy v10: unavailable (replay failed)"];

  const sum = (key) => Number(entries.reduce(
    (total, entry) => total + (Number(entry.foundation?.[key]) || 0),
    0
  ).toFixed(3));
  const mean = (key) => Number((sum(key) / Math.max(1, entries.length)).toFixed(3));
  const max = (key) => Math.max(...entries.map(
    (entry) => Number(entry.foundation?.[key]) || 0
  ));
  const deferredHooks = [...new Set(entries.flatMap(
    (entry) => entry.foundation?.deferredVariantHooks ?? []
  ))];
  const implementedHooks = [...new Set(entries.flatMap(
    (entry) => entry.foundation?.implementedVariantHooks ?? []
  ))];
  const telemetry = typeof getDamageEconomyTelemetrySnapshot === "function"
    ? getDamageEconomyTelemetrySnapshot()
    : entries.at(-1)?.foundation ?? {};
  const selectedRouteMean = (key) => Number((starts.reduce(
    (total, entry) => total + (Number(entry?.fullCourseRoute?.[key]) || 0),
    0
  ) / Math.max(1, starts.length)).toFixed(3));
  const selectedTrafficMean = (key) => Number((starts.reduce(
    (total, entry) => total + (Number(entry?.[key]) || 0),
    0
  ) / Math.max(1, starts.length)).toFixed(3));
  const lines = [
    `Damage economy v10: ROUTING ACTIVE; damage input avg ${mean("totalDamageUnits")} = deterministic ${mean("deterministicDamageUnits")} + robot-laser expected ${mean("robotLaserExpectedDamageUnits")}; persistent SPAM total/held final avg ${mean("finalSpamTotal")}/${mean("finalSpamHeld")}; transient Haywire max expected clog avg ${mean("maxExpectedHaywireClogs")}; AUTHORITATIVE raw economy RE avg total ${mean("totalDamageEconomyRegisterEquivalents")} [supply ${mean("totalSpamSupplyRegisterEquivalents")} = base ${mean("totalRawSpamSupplyRegisterEquivalents")} + Permanent-Shutdown pressure ${mean("totalPermanentShutdownPressureRegisterEquivalents")}, control-clog ${mean("totalClogRegisterEquivalents")}], max-turn ${Number((entries.reduce((t,e)=>t+(Number(e.foundation?.maxTurnDamageEconomyRegisterEquivalents)||0),0)/Math.max(1,entries.length)).toFixed(3))}; SPAM relief avg forced/elective ${mean("totalForcedSpamReliefInitiations")}/${mean("totalElectiveSpamReliefInitiations")}, removed avg ${mean("totalSpamRemoved")} (Critical-SPAM returned-to-pending ${mean("totalCriticalSpamReturnedToPending")}, reboot ${mean("totalRebootSpamRemoved")}, capacity ${mean("totalRebootSpamDisposalCapacity")}, repair ${mean("totalRepairStationSpamRemoved")}); Randomizer starts avg ${mean("totalRandomizerStarts")} -> base control-clog ${mean("totalRandomizerClogLoad")} (2/start), SPAM use there forced/elective ${mean("totalRandomizerForcedSpamOverlap")}/${mean("totalRandomizerReliefInitiations")}; repair-station uses ${sum("repairStationReliefCount")} / Haywire expected removed ${mean("totalRepairStationHaywireExpectedRemoved")} avg; radiation deterministic damage avg ${mean("radiationDamageUnits")}; radioactive-waste deterministic damage avg ${mean("radioactiveWasteDamageUnits")}; flaming-oil deterministic damage avg ${mean("flamingOilDamageUnits")}; Permanent Shutdown pressure ${entries[0]?.foundation?.permanentShutdownPressureActive ? `LIVE, max supply multiplier avg ${mean("maxPermanentShutdownSupplyMultiplier")}x, provisional curve calibration queued` : "OFF"}; Shutdown tolerance reference ${entries[0]?.foundation?.shutdownReferenceRegisterEquivalents ?? 5} RE is COUNTERFACTUAL ONLY, not programmed, not a cap; diagnostic threshold replay avg ${mean("shutdownEquivalentDamageScoreRegisterEquivalents")} RE = ${mean("shutdownEquivalentRegisterEquivalents")} threshold-chunk RE + ${mean("shutdownResidualRegisterEquivalents")} residual, ${sum("shutdownEquivalentEpisodeCount")} threshold crossing(s), high/elevated tolerance pressure ${entries.filter((entry)=>entry.foundation?.shutdownThreatLevel === "high").length}/${entries.filter((entry)=>entry.foundation?.shutdownThreatLevel === "elevated").length}; selected-route intrinsic damage adjustment avg ${selectedRouteMean("intrinsicDamageRoutingAdjustmentScore")} score from ${selectedRouteMean("intrinsicDamageEconomyRegisterEquivalents")} raw damage-economy RE; traffic robot-laser marginal raw-damage increment avg ${selectedTrafficMean("fullCourseTrafficDamageEconomyRobotLaserIncrementRegisterEquivalents")} RE; legacy residual ranged-threat score ${selectedTrafficMean("fullCourseTrafficLegacyResidualRangedThreatScoreDiagnostic")} is diagnostic-only and contributes 0 RE; exact candidate re-ranking active; Shutdown reference is search-worthiness context only; cheap primary search graph/budgets unchanged; tolerance replay ${telemetry.shutdownScoringReplayCount ?? 0} route(s)/${telemetry.shutdownScoringReplayTurns ?? 0} turn(s); relief coefficients unchanged from v49x; state cache ${telemetry.effectiveStateCacheHits ?? 0}/${telemetry.effectiveStateLookups ?? 0}, program cache ${telemetry.programCacheHits ?? 0}/${telemetry.programLookups ?? 0}, draw cache ${telemetry.spamDrawCacheHits ?? 0}/${telemetry.spamDrawLookups ?? 0}, route replay cache ${telemetry.routeSummaryCacheHits ?? 0}/${telemetry.routeSummaryLookups ?? 0}; implemented hooks ${implementedHooks.length ? implementedHooks.join(",") : "none"}, deferred ${deferredHooks.length ? deferredHooks.join(",") : "none"}`
  ];

  if (includePerStart) {
    entries.forEach((entry) => {
      const d = entry.foundation;
      lines.push(
        `Damage economy start #${entry.startIndex + 1}: input ${d.totalDamageUnits} = deterministic ${d.deterministicDamageUnits} [board laser ${d.boardLaserDamageUnits}, radiation ${d.radiationDamageUnits ?? 0}, radioactive waste ${d.radioactiveWasteDamageUnits ?? 0}, flamer ${d.flamethrowerDamageUnits}, flaming oil ${d.flamingOilDamageUnits ?? 0}, ledge ${d.ledgeDamageUnits}, reboot ${d.rebootDamageUnits}] + robot laser expected ${d.robotLaserExpectedDamageUnits}; SPAM added/removed ${d.totalSpamAdded}/${d.totalSpamRemoved} [reboot ${d.totalRebootSpamRemoved}, reboot capacity ${d.totalRebootSpamDisposalCapacity}, repair ${d.totalRepairStationSpamRemoved ?? 0}], repair stations ${d.repairStationReliefCount ?? 0} use(s) / Haywire expected removed ${d.totalRepairStationHaywireExpectedRemoved ?? 0}; final total/held/circulating ${d.finalSpamTotal}/${d.finalSpamHeld}/${d.finalSpamCirculating}; AUTHORITATIVE raw RE supply/clog/total ${d.totalSpamSupplyRegisterEquivalents}/${d.totalClogRegisterEquivalents}/${d.totalDamageEconomyRegisterEquivalents} [supply base ${d.totalRawSpamSupplyRegisterEquivalents ?? d.totalSpamSupplyRegisterEquivalents}, Permanent-Shutdown +${d.totalPermanentShutdownPressureRegisterEquivalents ?? 0}, max ×${d.maxPermanentShutdownSupplyMultiplier ?? 1}]; Randomizer starts/clog/forced-overlap/elective-relief ${d.totalRandomizerStarts ?? 0}/${d.totalRandomizerClogLoad ?? 0}/${d.totalRandomizerForcedSpamOverlap ?? 0}/${d.totalRandomizerReliefInitiations ?? 0}; Shutdown tolerance ${d.shutdownThreatLevel}, reference ${d.shutdownReferenceRegisterEquivalents} RE, diagnostic threshold replay ${d.shutdownEquivalentDamageScoreRegisterEquivalents} RE (${d.shutdownEquivalentEpisodeCount} crossing(s) + residual ${d.shutdownResidualRegisterEquivalents}); selected route intrinsic adjustment ${starts.find((start)=>start.index===entry.startIndex)?.fullCourseRoute?.intrinsicDamageRoutingAdjustmentScore ?? 0} score from raw damage, robot-laser marginal traffic increment ${starts.find((start)=>start.index===entry.startIndex)?.fullCourseTrafficDamageEconomyRobotLaserIncrementRegisterEquivalents ?? 0} RE; variants implemented ${d.implementedVariantHooks?.join(",") || "none"}, deferred ${d.deferredVariantHooks?.join(",") || "none"}`
      );
    });
  }

  if (includeEventStream) {
    entries.forEach((entry) => {
      (entry.foundation?.turns ?? [])
        .filter((turn) => (
          turn.spamTotalAtProgramming > 0 ||
          turn.expectedHaywireClogs > 0 ||
          turn.pendingSpamAddedThisTurn > 0 ||
          turn.reliefInitiations > 0 ||
          turn.randomizerStarts > 0 ||
          turn.rebootRegister ||
          turn.repairStationReliefCount > 0
        ))
        .forEach((turn) => {
          lines.push(
            `Damage economy turn start #${entry.startIndex + 1} T${turn.turn}: SPAM total ${turn.spamTotalAtProgramming}, held ${turn.spamHeldAtProgramming}, circulating ${turn.spamCirculatingAtProgramming} -> effective held/circ ${turn.effectiveHeldSpam}/${turn.effectiveCirculatingSpam}; hand ${turn.baseHandSize}, fresh draw ${turn.expectedFreshDrawSlots}, expected newly drawn/in-hand SPAM ${turn.expectedSpamDrawn}/${turn.expectedSpamInHand}; program P clean/damaged ${turn.cleanProgramProbability}/${turn.damagedProgramProbability}; Haywire clog ${turn.expectedHaywireClogs}; SPAM relief forced/elective ${turn.forcedSpamReliefInitiations}/${turn.electiveSpamReliefInitiations}; clog-bearing SPAM play-count P0..P5 ${turn.spamPlayCountDistribution.join("/")} -> SPAM clog ${turn.spamPlayClogLoad}; Randomizer ${turn.randomizerStarts ?? 0} start(s) -> +${turn.randomizerClogLoad ?? 0} clog, SPAM use forced/elective ${turn.randomizerForcedSpamOverlap ?? 0}/${turn.randomizerReliefInitiations ?? 0}; combined control-clog ${turn.expectedTotalControlClogLoad} -> clog RE ${turn.clogRegisterEquivalents}; supply RE ${turn.spamSupplyRegisterEquivalents} [base ${turn.rawSpamSupplyRegisterEquivalents ?? turn.spamSupplyRegisterEquivalents}, Permanent-Shutdown +${turn.permanentShutdownPressureRegisterEquivalents ?? 0} @burden${turn.permanentShutdownSpamBurden ?? 0} ×${turn.permanentShutdownSupplyMultiplier ?? 1}]; total RE ${turn.damageEconomyRegisterEquivalents}; Shutdown-tolerance segment ${turn.shutdownThreatSegmentRegisterEquivalents} RE${turn.shutdownEquivalentEpisodeAfterTurn ? " -> threshold crossing" : ""}; damage this turn ${turn.totalDamageUnits} = deterministic ${turn.deterministicDamageUnits} + robot-laser expected ${turn.robotLaserExpectedDamageUnits}; relief opportunity/initiation/removal ${turn.reliefOpportunity}/${turn.reliefInitiations}/${turn.spamRemoved} [forced removed ${turn.forcedSpamRemoved}; Critical-SPAM ->pending ${turn.criticalSpamReturnedToPending ?? 0}]; reboot ${turn.rebootRegister ? `R${turn.rebootRegister}, SPAM dump ${turn.rebootSpamRemoved}/${turn.rebootSpamDisposalCapacity}, active-H clear ${turn.rebootHaywireCleared}` : "none"}; repair ${turn.repairStationReliefCount ? `${turn.repairStationReliefCount}x, SPAM -${turn.repairStationSpamRemoved}, H-exp -${turn.repairStationHaywireExpectedRemoved}` : "none"}; held end ${turn.spamHeldAtTurnEnd}; pending next S/H ${turn.pendingSpamAtTurnEnd}/${turn.pendingHaywireExpectedForNextTurn} [register H risks ${turn.pendingHaywireRegisterRisks.join("/")}]`
          );
        });
      (entry.foundation?.events ?? [])
        .filter((event) => (
          event.damageUnits > 0 || event.reliefInitiation > 0 || event.randomizerAtRegisterStart || event.rebooted || event.repairStationEligible
        ))
        .forEach((event) => {
          lines.push(
            `Damage economy event start #${entry.startIndex + 1} T${event.turn}R${event.register} a${event.absoluteAction}:${event.randomizerAtRegisterStart ? ` RANDOMIZER +${event.randomizerClogLoad ?? 2} clog;` : ""} tactical relief ${event.reliefInitiation} (opp ${event.reliefOpportunity}, chain ${event.spamChainYield}x, removed ${event.spamRemoved}, Critical-SPAM ->pending ${event.criticalSpamReturnedToPending ?? 0}; wall +${event.reliefWallBonus}${event.reliefWallDistance ? `@${event.reliefWallDistance}` : ""}, forward hazard -${event.reliefForwardHazardPenalty}, conveyor +${event.reliefConveyorMovementBonus}, rotation -${event.reliefForcedRotationPenalty}, forced move -${event.reliefForcedMovementPenalty});${event.rebooted ? ` REBOOT clears active-H ${event.rebootHaywireCleared}, SPAM dump ${event.rebootSpamRemoved}/${event.rebootSpamDisposalCapacity};` : ""} damage ${event.damageUnits} = deterministic ${event.deterministicDamageUnits} + robot-laser expected ${event.robotLaserExpectedDamageUnits} [${event.sourceTypes?.join("+") || "none"}], robot-hit p by N/E/S/W ${event.robotLaserHitProbabilities?.join("/") || "0/0/0/0"}, H-event p ${event.haywireEventProbability} -> +SPAM ${event.spamAdded}, pending H-register risk +${event.haywireRegisterRiskAdded} -> ${event.pendingHaywireRegisterRiskAfter}${event.repairStationEligible ? `; REPAIR SPAM -${event.repairStationSpamRemoved}, H-exp -${event.repairStationHaywireExpectedRemoved}` : ""}`
          );
        });
    });
  }

  addDevTiming(options.timing, "damageFoundationMs", componentStartedAt);
  return lines;
}

// DAMAGE_ECONOMY_FOUNDATION_END



function buildScenarioReport(scenario, selectedLegIndices = null) {
  const reportStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const devTiming = { ledgerMs: 0, cheapShadowMs: 0, damageFoundationMs: 0, reDifficultyMs: 0, reDifficultyReplayMs: 0, reDifficultyPoolMs: 0 };
  const replayCache = getScenarioDevReplayCache(scenario);
  const summary = scenario.sequence.firstLeg.summary;
  const checkpointPlacementAdvisory = getCheckpointPlacementAdvisory(scenario);
  const legOptions = scenario.sequence.legs.map((leg, index) => (
    index === 0 ? (scenario.virtualBots ? "Entry -> 1" : "Dock -> 1") : `${leg.from} -> ${leg.to}`
  ));
  const normalizedSelectedLegIndices = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const lastSelectedLegIndex = normalizedSelectedLegIndices.length
    ? Math.max(...normalizedSelectedLegIndices)
    : Math.max(0, playableCheckpoints.length - 1);
  const goal = playableCheckpoints[lastSelectedLegIndex] ?? playableCheckpoints.at(-1) ?? playableCheckpoints[0];
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
  let reDifficultyShadow = null;
  if (isDevViewEnabled()) {
    const reDifficultyStartedAt = typeof performance !== "undefined"
      ? performance.now()
      : NaN;
    if (replayCache && replayCache.reDifficultyShadow !== undefined) {
      reDifficultyShadow = replayCache.reDifficultyShadow;
    } else {
      reDifficultyShadow = buildRETurnDifficultyShadow(scenario, {
        replayCache,
        timing: devTiming
      });
      if (replayCache) replayCache.reDifficultyShadow = reDifficultyShadow;
    }
    addDevTiming(devTiming, "reDifficultyMs", reDifficultyStartedAt);
  }

  let reDifficultyCandidatePoolShadow = null;
  if (isDevViewEnabled()) {
    const poolStartedAt = typeof performance !== "undefined"
      ? performance.now()
      : NaN;
    if (replayCache && replayCache.reDifficultyCandidatePoolShadow !== undefined) {
      reDifficultyCandidatePoolShadow = replayCache.reDifficultyCandidatePoolShadow;
    } else {
      reDifficultyCandidatePoolShadow = buildRETurnDifficultyCandidatePoolShadow(scenario, {
        timing: devTiming
      });
      if (replayCache) {
        replayCache.reDifficultyCandidatePoolShadow = reDifficultyCandidatePoolShadow;
      }
    }
    addDevTiming(devTiming, "reDifficultyPoolMs", poolStartedAt);
  }

  let lengthOwnerCandidatePoolShadow = null;
  if (isDevViewEnabled()) {
    if (replayCache && replayCache.lengthOwnerCandidatePoolShadow !== undefined) {
      lengthOwnerCandidatePoolShadow =
        replayCache.lengthOwnerCandidatePoolShadow;
    } else {
      lengthOwnerCandidatePoolShadow =
        buildLengthOwnerCandidatePoolShadow(scenario);
      if (replayCache) {
        replayCache.lengthOwnerCandidatePoolShadow =
          lengthOwnerCandidatePoolShadow;
      }
    }
  }

  function formatOutlierReasons(reasons) {
    if (!reasons) {
      return "reason unavailable";
    }

    const parts = [];
    if (reasons.payToWinPruned) {
      parts.push(reasons.subsidizedStarts
        ? "Subsidized Starts compensation-first residual pruning"
        : "Pay to Win compensation-first residual pruning");
    }
    if (reasons.payToWinUnavailable) {
      parts.push("legacy selector-unavailable state (should not occur under v49ct compensation-first pricing)");
    }
    if (reasons.normalBalancePruned) {
      const zText = Number.isFinite(reasons.scoreZ)
        ? ` (score z ${Number(reasons.scoreZ).toFixed(2)})`
        : "";
      if (reasons.balanceDispersionPruned) {
        const spreadText = Number.isFinite(reasons.balanceStdDevBefore) && Number.isFinite(reasons.balanceStdDevAfter)
          ? ` (stddev ${reasons.balanceStdDevBefore} -> ${reasons.balanceStdDevAfter})`
          : "";
        parts.push(`removed as a full-course effective-RE outlier${spreadText}`);
      } else {
        parts.push(`removed full-course effective-RE outlier${zText}`);
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
    `Board spread: ${normalizeBoardSpread(scenario.preferences.boardSpread)}`,
    `Sets: ${[...getSelectedExpansionIds(scenario.preferences)].map((id) => formatExpansionName(id)).join(", ") || "none"}`,
    `Allowed variants: ${describeAllowedVariants(scenario.preferences)}`,
    `Optional variant complexity: ${scenario.variantComplexityUsed ?? 0}/${scenario.variantComplexityBudget ?? 0} (forced/must-like selections excluded)`,
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
    `Hazardous Checkpoints used: ${scenario.hazardousFlags ? "yes" : "no"}`,
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
    Number.isInteger(scenario.devTestSeed)
      ? `Dev test seed: ${formatDevGenerationSeed(scenario.devTestSeed)} (construction RNG frozen)`
      : "Dev test seed: none (construction RNG random)",
    Number.isInteger(scenario.devTestSeed)
      ? `Construction fingerprint: ${scenario.constructionFingerprint ?? "n/a"}`
      : null,
    Number.isInteger(scenario.devTestSeed)
      ? `Selected-route fingerprint: ${getScenarioSelectedRouteFingerprint(scenario) ?? "n/a"}`
      : null,
    scenario.generationDiagnostics
      ? `Generation timing: total ${formatGenerationDuration(scenario.generationDiagnostics.totalMs)}, routeSearch ${formatGenerationDuration(scenario.generationDiagnostics.routeSearchMs)}, searches ${scenario.generationDiagnostics.routeSearches}, expansions ${scenario.generationDiagnostics.routeExpansions}, capped ${scenario.generationDiagnostics.cappedRouteSearches}, mode ${scenario.generationDiagnostics.generationModeLabel ?? formatGenerationModeLabel(getScenarioGenerationMode(scenario))}, softBudget ${scenario.generationDiagnostics.softExpansionBudget ?? getGenerationModeProfile({ generationMode: getScenarioGenerationMode(scenario) }).softExpansionBudget}`
      : "Generation timing: n/a",
    `Analyzer build: ${scenario.generationDiagnostics?.analyzeBuildId ?? analyzeBuildIdSafe}`,
    `UI build: ${MAIN_BUILD_ID}`,
    `Start balance: ${formatStartBalanceLabel(scenario.preferences?.startBalance)} (${normalizeStartBalance(scenario.preferences?.startBalance)})`,
    Number.isFinite(Number(scenario?.devPerformance?.generateClickToRenderMs))
      ? `Dev render timing: Generate click -> first rendered course ${formatDevMilliseconds(Number(scenario.devPerformance.generateClickToRenderMs))}; last Dev render ${formatDevMilliseconds(Number(scenario.devPerformance.lastRenderMs) || 0)}`
      : "Dev render timing: first-render measurement unavailable",
    (() => {
      const audit = summarizePathfinderObjectiveAuditSafe();
      return audit
        ? `Pathfinder objective v49bf (unchanged through v49ch): programmed action tempo ${audit.registerTempoScore} score = 1 register for every card; action-type/reverse/heavy premiums OFF; conveyor/gear complexity premiums OFF; raw travelled-space premiums OFF (distance telemetry retained; Manhattan queue heuristic active); reboot skipped-register tempo ON, fixed discontinuity premium OFF; card plausibility, Energy and hazard guidance remain active.`
        : "Pathfinder objective v49bf (unchanged through v49ch): audit metadata unavailable.";
    })(),
    "Contextual breadth v49dw SEARCH GUIDANCE: elapsed register horizon + cumulative completed intrinsic adverse RE from prior legs; raw hazard/board-chaos/interaction confidence decay OFF; physical first-goal search effort remains a computational budget signal only.",
    scenario.generationDiagnostics?.cooperativeIteratorTotals
      ? (() => {
        const cooperative = scenario.generationDiagnostics.cooperativeIteratorTotals;
        const searchSlices = scenario.generationDiagnostics.cooperativeSearchTotals ?? {};
        return `Cooperative yielding v49o: max uninterrupted ${formatGenerationDuration(cooperative.maxSliceMs ?? 0)} (${cooperative.maxSlicePhase ?? "unknown"}${cooperative.maxSliceSearchKind ? `/${cooperative.maxSliceSearchKind}` : ""}), ${cooperative.browserYields ?? 0} browser yield(s) / ${formatGenerationDuration(cooperative.browserPausedMs ?? 0)} paused, ${cooperative.slices ?? 0} iterator slice(s); resumable physical search ${searchSlices.searches ?? 0} search(es)/${searchSlices.slices ?? 0} useful boundary(ies), ${cooperative.routeSearchBrowserYields ?? 0} route-slice handoff(s), ${formatGenerationDuration(searchSlices.pausedMs ?? 0)} suspended, max search work slice ${formatGenerationDuration(searchSlices.maxSliceWorkMs ?? 0)}.`;
      })()
      : `Cooperative yielding v49o: telemetry unavailable from analyzer build ${scenario.generationDiagnostics?.analyzeBuildId ?? analyzeBuildIdSafe}.`,
    scenario.generationDiagnostics
      ? `Qualifying candidate pool: ${scenario.generationDiagnostics.acceptableCandidatesFound ?? 0}/${scenario.generationDiagnostics.acceptableCandidateTarget ?? 1}; scores ${(scenario.generationDiagnostics.acceptableCandidateScores ?? []).join(", ") || "none"}; near-best ${(scenario.generationDiagnostics.nearBestCandidateScores ?? []).join(", ") || "none"}; selected ${scenario.generationDiagnostics.selectedCandidateScore ?? "n/a"}; soft-fit limit ${scenario.generationDiagnostics.softCandidateRetentionLimit ?? SOFT_CANDIDATE_RETENTION_LIMIT}`
      : "Qualifying candidate pool: n/a",
    scenario.generationDiagnostics?.searchProfile
      ? `Generation search profile: attempts ${scenario.generationDiagnostics.maxAttempts ?? getScenarioGenerationMaxAttempts(scenario)}, preflight ${scenario.generationDiagnostics.searchProfile.preflightOpeningExpansions}/${scenario.generationDiagnostics.searchProfile.preflightLaterExpansions}, witnesses ${scenario.generationDiagnostics.searchProfile.primaryWitnessRoutes ?? "?"}, traffic ${scenario.generationDiagnostics.searchProfile.trafficEnabled ? `${scenario.generationDiagnostics.searchProfile.trafficEpochs ?? 0} feedback round(s), new-search round ceiling ${scenario.generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesPerEpoch ?? 0}, ${scenario.generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesTotal ?? 0} total, uncertainty effort floor ${scenario.generationDiagnostics.searchProfile.trafficAlternateUncertaintyEffortFloor ?? 1}/curve ${scenario.generationDiagnostics.searchProfile.trafficAlternateUncertaintyEffortExponent ?? 1}, uncertainty exploration ${Math.round((scenario.generationDiagnostics.searchProfile.trafficExplorationUncertaintyShare ?? 0) * 100)}% above confidence ${scenario.generationDiagnostics.searchProfile.trafficExplorationConfidenceFloor ?? 1}` : "off"}`
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
    `Showing legs: ${normalizedSelectedLegIndices.length === legOptions.length ? "all" : normalizedSelectedLegIndices.map((index) => legOptions[index]).join(", ") || "all"}`,
    `Trace goal: ${goal ? `(${goal.x}, ${goal.y})` : "n/a"}`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.activeStarts?.length ?? scenario.sequence.firstLeg?.summary?.contextualStaging?.sourceStartCount ?? scenario.sequence.starts.length}`,
    scenario.virtualBots
      ? "Start disposition: virtual entry"
      : contextualCache?.estimatedPrimaryRouting
        ? `Start disposition: structural ${scenario.activeStarts?.length ?? 0}, estimated ${contextualCache.estimatedMilestoneRoutes ?? 0}, realized ${contextualCache.survivingStarts ?? (scenario.validatedStartIndices ?? []).length}, physical-impossible ${contextualCache.estimatedPhysicalFailureStarts ?? 0}, routing-unresolved ${Math.max(0, (contextualCache.estimatedMilestoneRoutes ?? 0) - (contextualCache.survivingStarts ?? (scenario.validatedStartIndices ?? []).length))}${scenario.startDisposition ? `; normal-pruned [${(scenario.startDisposition.normalPrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], price-pruned [${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], selector-unavailable [${(scenario.startDisposition.selectorUnavailableIndices ?? []).map((index) => index + 1).join(", ") || "none"}], other [${(scenario.startDisposition.otherBlockedIndices ?? []).map((index) => index + 1).join(", ") || "none"}]` : ""}`
        : `Start disposition: physical ${scenario.activeStarts?.length ?? 0}, validated ${(scenario.validatedStartIndices ?? []).length}, blocked ${(scenario.blockedStartIndices ?? []).length} [${(scenario.blockedStartIndices ?? []).map((index) => index + 1).join(", ") || "none"}]${scenario.startDisposition ? `; outside-pool [${(scenario.startDisposition.outsidePoolIndices ?? []).map((index) => index + 1).join(", ") || "none"}], route-failed [${(scenario.startDisposition.routeFailedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], normal-pruned [${(scenario.startDisposition.normalPrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], price-pruned [${(scenario.startDisposition.pricePrunedIndices ?? scenario.startDisposition.legacyPricePrunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}], selector-unavailable [${(scenario.startDisposition.selectorUnavailableIndices ?? []).map((index) => index + 1).join(", ") || "none"}], other [${(scenario.startDisposition.otherBlockedIndices ?? []).map((index) => index + 1).join(", ") || "none"}]` : ""}`,
    `Difficulty: ${scenario.metrics.difficultyTurnRE ?? "n/a"} RE/turn = ${formatPresentedDifficultyLabel(scenario.metrics)} (PRODUCTION owner)`,
    `Legacy difficulty raw: ${scenario.metrics.difficultyRaw ?? "n/a"} = ${formatLegacyDifficultyLabel(scenario.metrics.difficultyRaw)}; retained only for construction/preflight calibration diagnostics`,
    scenario.metrics.reTurnVariantDifficultyAccounting
      ? `RE-turn variant accounting v49es: base ${scenario.metrics.reTurnVariantDifficultyAccounting.base} -> final ${scenario.metrics.reTurnVariantDifficultyAccounting.final} RE/turn (delta ${scenario.metrics.reTurnVariantDifficultyAccounting.delta}); direct modifiers ${(scenario.metrics.reTurnVariantDifficultyAccounting.contributions ?? []).map((entry) => `${entry.id} ${entry.delta >= 0 ? "+" : ""}${entry.delta}RE/t [${entry.kind}]${Number.isFinite(entry.legacyFitPoints) ? ` from ${entry.legacyFitPoints} legacy fit pt` : ""}`).join(", ") || "none"}; mechanically represented ${(scenario.metrics.reTurnVariantDifficultyAccounting.mechanicalRules ?? []).map((entry) => `${entry.id} (${entry.note})`).join(", ") || "none"}; deferred/incomplete ${(scenario.metrics.reTurnVariantDifficultyAccounting.deferredRules ?? []).map((entry) => `${entry.id} (${entry.note})`).join(", ") || "none"}; bridge ${scenario.metrics.reTurnVariantDifficultyAccounting.fitPointsPerRE ?? RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE} fit pt/RE-turn`
      : "RE-turn variant accounting v49es: n/a",
    reDifficultyShadow?.active
      ? `RE-turn difficulty v49de PRODUCTION: completed effective RE minus programmed-register tempo minus lost-register tempo, normalized by programming turns; occupancy-weighted mean ${reDifficultyShadow.expectedMeanTurnBurdenRE}RE/turn, +turn-p${Math.round((reDifficultyShadow.tailQuantile ?? 0.75) * 100)} peak(${reDifficultyShadow.routePeakWeight}) -> ${reDifficultyShadow.expectedPeakAdjustedTurnBurdenRE}, +likely-start p${Math.round((reDifficultyShadow.tailQuantile ?? 0.75) * 100)} tail ${reDifficultyShadow.likelyStartTailTurnBurdenRE}(${reDifficultyShadow.courseTailWeight}) -> base ${reDifficultyShadow.courseTurnDifficultyRE}, variant-final ${reDifficultyShadow.productionFinalTurnRE}; occupancy ${reDifficultyShadow.occupancyMass}/${reDifficultyShadow.playerCount} across ${reDifficultyShadow.startCount} start(s), route-mixture entries ${reDifficultyShadow.routeMixtureEntryCount} (${reDifficultyShadow.averageRouteFamiliesPerStart}/start); production replay ${Number.isFinite(reDifficultyShadow.computeMs) ? `${reDifficultyShadow.computeMs}ms` : "n/a"}; current forecast uncertainty remains separate at ${reDifficultyShadow.currentForecastEquivalentActions} equivalent register(s)`
      : `RE-turn difficulty v49de PRODUCTION: ${reDifficultyShadow?.reason ?? "n/a"}`,
    `RE-turn tier ownership v49dp: Beginner [0,4.0), Intermediate [4.0,4.8), Advanced [4.8,5.8), Robots. Must. Die. [5.8,+inf) RE/turn; Beginner ceiling tightened from 4.3 after browser/visual calibration; non-overlapping, Advanced bounded, R.M.D. exclusive top; fit bridge ${RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE} points per RE/turn; legacy requested-tier labels were not calibration truth`,
    reDifficultyCandidatePoolShadow?.active
      ? `RE-turn difficulty candidate pool v49de PRODUCTION: ${reDifficultyCandidatePoolShadow.candidateCount} acceptable candidate(s), final range ${reDifficultyCandidatePoolShadow.minComposite}..${reDifficultyCandidatePoolShadow.maxComposite}, selected ${reDifficultyCandidatePoolShadow.selectedComposite ?? "n/a"}; ${(reDifficultyCandidatePoolShadow.entries ?? []).map((entry) => `c${entry.candidate}${entry.selected ? "*" : ""} fit${entry.fitScore} turn${entry.difficultyTurnRE}/${entry.difficultyLabel} base${entry.shadow.courseTurnDifficultyRE} legacy${entry.legacyDifficultyRaw}/${entry.legacyDifficultyLabel} len${entry.lengthRaw} unc${entry.currentForecastEquivalentActions} starts${entry.usableStarts}`).join(" | ")}; metrics reused from production classification, no fresh route replay`
      : `RE-turn difficulty candidate pool v49de PRODUCTION: ${reDifficultyCandidatePoolShadow?.reason ?? "n/a"}`,
    scenario.metrics.programmingPressure
      ? `Programming pressure v38: combined ${scenario.metrics.programmingPressure.planningPressure}, timed ${scenario.metrics.programmingPressure.timedPressure}; hazard ${scenario.metrics.programmingPressure.hazardPressure} (${scenario.metrics.programmingPressure.hazardPerRegister}/reg), traffic ${scenario.metrics.programmingPressure.trafficPressure} (${scenario.metrics.programmingPressure.trafficPerRegister}/reg), control ${scenario.metrics.programmingPressure.controlPressure} (${scenario.metrics.programmingPressure.controlPerRegister}/reg), cards ${scenario.metrics.programmingPressure.cardPressure}; avg gears ${scenario.metrics.programmingPressure.averageGearTurns ?? 0}, conveyor turns ${scenario.metrics.programmingPressure.averageConveyorTurns ?? 0}, forced spaces ${scenario.metrics.programmingPressure.averageForcedSpaces ?? 0}`
      : "Programming pressure v38: n/a",
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Length inputs: flags ${scenario.metrics.lengthMetrics.inputs.flagCount}, players ${scenario.metrics.lengthMetrics.inputs.playerCount}, actionScore ${scenario.metrics.lengthMetrics.inputs.totalActionLoad}, distanceScore ${scenario.metrics.lengthMetrics.inputs.totalRouteDistance}, congestion ${scenario.metrics.lengthMetrics.inputs.totalCongestion}, flagArea ${scenario.metrics.lengthMetrics.inputs.flagAreaScore}, totalDifficulty ${scenario.metrics.lengthMetrics.inputs.totalDifficulty}`,
    `Length contributions: flags ${scenario.metrics.lengthMetrics.contributions.checkpointLoad}, players ${scenario.metrics.lengthMetrics.contributions.playerLoad} [legacy additive ${scenario.metrics.lengthMetrics.contributions.legacyPlayerLoad ?? 0}], expected-play nominal ${scenario.metrics.lengthMetrics.contributions.actionLoad}, recovery ${scenario.metrics.lengthMetrics.contributions.forecastUncertaintyLoad ?? 0}, wall-clock extent ${scenario.metrics.lengthMetrics.contributions.productionWallClockExtentLoad ?? "n/a"}, distance ${scenario.metrics.lengthMetrics.contributions.distanceLoad} [legacy ${scenario.metrics.lengthMetrics.contributions.legacyDistanceLoad ?? 0}], congestion ${scenario.metrics.lengthMetrics.contributions.congestionLoad} [legacy ${scenario.metrics.lengthMetrics.contributions.legacyCongestionLoad ?? 0}; old weight ${scenario.metrics.lengthMetrics.contributions.congestionWeight}; harshness ${scenario.metrics.lengthMetrics.contributions.boardHarshness}], flagArea ${scenario.metrics.lengthMetrics.contributions.flagAreaLoad}, difficulty ${scenario.metrics.lengthMetrics.contributions.difficultyLoad}, moving-target standalone ${scenario.metrics.lengthMetrics.contributions.movingTargetLoad} (legacy estimate ${scenario.metrics.lengthMetrics.contributions.movingTargetLegacyEstimate ?? 0} diagnostic-only), act-fast direct raw ${scenario.metrics.lengthMetrics.contributions.actFastLoad} [legacy ${scenario.metrics.lengthMetrics.contributions.legacyActFastLoad ?? 0}], deck-variant standalone length LF ${scenario.metrics.lengthMetrics.contributions.lessForeshadowingLoad ?? 0}, Shared ${scenario.metrics.lengthMetrics.contributions.sharedDeckLoad ?? 0} (both mechanically represented in card RE)`,
    `Length extent v49ds PRODUCTION COMPONENT: nominal ${scenario.metrics.lengthMetrics.inputs.totalActionLoad} reg + RE-native recovery ${scenario.metrics.lengthMetrics.contributions.forecastEquivalentActions ?? 0} = ${scenario.metrics.lengthMetrics.contributions.productionExpectedPlayRegisters ?? "n/a"} expected-play reg / ${scenario.metrics.lengthMetrics.contributions.productionExpectedPlayProgrammingTurns ?? "n/a"} turns; route distance and standalone congestion have NO independent production vote; legacy distance/congestion ${scenario.metrics.lengthMetrics.contributions.legacyDistanceLoad ?? 0}/${scenario.metrics.lengthMetrics.contributions.legacyCongestionLoad ?? 0} diagnostic only; legacy confidence forecast +${scenario.metrics.lengthMetrics.contributions.legacyForecastEquivalentActions ?? scenario.metrics.lengthMetrics.forecastLengthProfile?.uncertaintyEquivalentActions ?? 0} reg diagnostic only`,
    `Wall-clock length v49dv PRODUCTION: programming ${scenario.metrics.lengthMetrics.contributions.productionProgrammingWallClockRegisterIndex ?? "n/a"} wall-reg + upgrade-economy ${scenario.metrics.lengthMetrics.contributions.productionEconomyWallClockRegisterIndex ?? 0} wall-reg = ${scenario.metrics.lengthMetrics.contributions.productionWallClockRegisterIndex ?? "n/a"} total (${Number.isFinite(Number(scenario.metrics.lengthMetrics.contributions.productionWallClockRegisterIndex)) ? Number((Number(scenario.metrics.lengthMetrics.contributions.productionWallClockRegisterIndex) / 5).toFixed(2)) : "n/a"} turn-index); expected-play ${scenario.metrics.lengthMetrics.contributions.productionExpectedPlayRegisters ?? "n/a"} reg × player ${scenario.metrics.lengthMetrics.contributions.productionPlayerWallClockMultiplier ?? 1} × Act Fast direct-programming ${scenario.metrics.lengthMetrics.contributions.productionActFastDirectTimingMultiplier ?? 1}; economy activity ${scenario.metrics.lengthMetrics.productionWallClockOwner?.economyActivity?.drawEventsPerPlayer ?? 0} paid draw(s) + ${scenario.metrics.lengthMetrics.productionWallClockOwner?.economyActivity?.installEventsPerPlayer ?? 0} install/play event(s) per player, ${scenario.metrics.lengthMetrics.contributions.productionEconomyExpectedActivityRegisterEquivalents ?? 0} pre-player wall-reg; Act Fast RE pressure ×${scenario.metrics.lengthMetrics.contributions.productionActFastREPressureMultiplier ?? 1} feeds recovery upstream; Energy Crisis economy phase removed mechanically; transitional scale ${scenario.metrics.lengthMetrics.contributions.productionExpectedPlayRawPointsPerRegister ?? LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER} raw/index; other variant phase time pending`,
    `Length bands v49dv PRODUCTION: wall-clock turn-index ${scenario.metrics.lengthWallClockTurnIndex ?? "n/a"}; Short [${MIN_WALL_CLOCK_TURN_INDEX},6.25), Medium [6.25,9.5), Long [9.5,13), Epic [13,20] with >20 still Epic but above target ceiling; requested-length fit ${scenario.metrics.lengthFit ?? "n/a"} uses ${WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN} fit pt/turn; transitional raw ${scenario.metrics.lengthRaw ?? "n/a"} is compatibility/construction diagnostic, not semantic owner`,
    scenario.metrics.lengthMetrics.ownerObservationV49dl?.active
      ? `Length owner v49dl ROUTING OBSERVATION: nominal ${scenario.metrics.lengthMetrics.ownerObservationV49dl.nominalRegisters} register(s); legacy confidence forecast +${scenario.metrics.lengthMetrics.ownerObservationV49dl.intrinsicForecastExtraRegisters} => ${scenario.metrics.lengthMetrics.ownerObservationV49dl.baselineExpectedProgrammingTurns} turn(s) diagnostic comparison; RE-native routing confidence mean/end ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.averageConfidence}/${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.endConfidence}, end effective horizon ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.endEffectiveHorizonRE} register-equivalent unit(s), chronological adverse ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.chronologicalAdverseRE}RE, damage pressure ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.chronologicalDamagePressureRE}RE; optional reroute effort ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.baseEffortScale} -> ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.damageModeratedEffortScale}, low-confidence restore ceiling ${scenario.metrics.lengthMetrics.ownerObservationV49dl.reNativeRoutingUncertainty.damageEffortCeiling}; NO independent hazard/board-chaos/interaction decay in candidate`
      : `Length owner v49dl ROUTING OBSERVATION: ${scenario.metrics.lengthMetrics.ownerObservationV49dl?.reason ?? "n/a"}`,
    scenario.metrics.lengthMetrics.ownerObservationV49dl?.active
      ? `Play-time calibration v49dl / extent owner v49dv PRODUCTION: base adverse RE ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.baseAdverseREBeforeActFastPressure ?? scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.totalAdverseRE} [intrinsic+lost ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.chronologicalPlayTimeAdverseRE}, downstream-control ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.downstreamTrafficControlAdverseRE}] × Act Fast RE pressure ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.actFastREPressureMultiplier ?? 1} = ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.totalAdverseRE} adverse RE; ratio ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.adverseRatio}, response ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.responseShape}, horizon gate ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.horizonActivation}, multiplier ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.multiplier} => ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.expectedPlayRegisters} expected reg / ${scenario.metrics.lengthMetrics.ownerObservationV49dl.playTimeAmplification.expectedPlayProgrammingTurns} turn(s); expected-play registers own route/play extent; player/timer wall-clock factors are downstream; planningPressure NOT an owner`
      : `Play-time calibration v49dl OBSERVATIONAL: n/a`,
    lengthOwnerCandidatePoolShadow?.active
      ? `Length owner candidate pool v49dv: ${lengthOwnerCandidatePoolShadow.candidateCount} acceptable candidate(s); ${(lengthOwnerCandidatePoolShadow.entries ?? []).map((entry) => `c${entry.candidate}${entry.selected ? "*" : ""} req${entry.requestedLength} raw${entry.currentLengthRaw}/wall${Number.isFinite(Number(entry.currentWallClockTurnIndex)) ? Number(Number(entry.currentWallClockTurnIndex).toFixed(2)) : "n/a"}t/${entry.currentLengthLabel} nom${entry.nominalRegisters} REconf${entry.reNativeForecastConfidenceMean}/${entry.reNativeForecastConfidenceEnd} adverse${entry.playTimeAdverseRE}RE ratio${entry.playTimeAdverseRatio} resp${entry.playTimeResponseShape} gate${entry.playTimeHorizonActivation} ×play${entry.playTimeMultiplier} => ${entry.expectedPlayProgrammingTurns}t/${entry.referenceFourPlayerLengthBand} ×player${entry.playerWallClockMultiplierIndex} ×timer${entry.actFastDirectTimingMultiplierIndex} +econ(${entry.economyDrawEventsPerPlayer}d/${entry.economyInstallEventsPerPlayer}i=${entry.economyWallClockRegisterIndex}wall) = ${entry.effectiveWallClockRegisterIndex} wall-reg-index`).join(" | ")}; no new pathfinding; expected-play extent plus player/Act Fast programming timing and card-aware economy transaction time own production length; other variant phase time pending`
      : `Length owner candidate pool v49dv: ${lengthOwnerCandidatePoolShadow?.reason ?? "n/a"}`,
    `Variant length accounting v38: ${(scenario.metrics.lengthMetrics.variantLengthContributions ?? []).map((entry) => `${entry.id} ${entry.delta >= 0 ? "+" : ""}${entry.delta} [${entry.kind}]`).join(", ") || "none"}; method ${scenario.metrics.lengthMetrics.method ?? "n/a"}`,
    `Moving target profile: active ${scenario.movingTargetStats?.activeCount ?? 0}, pathTiles ${scenario.movingTargetStats?.totalPathLength ?? 0}, uniqueCoverage ${scenario.movingTargetStats?.coverageTiles ?? 0}, turns ${scenario.movingTargetStats?.totalTurns ?? 0}, fastSegments ${scenario.movingTargetStats?.fastSegments ?? 0}, difficultyBonus ${scenario.movingTargetStats?.difficultyBonus ?? 0}, lengthBonus ${scenario.movingTargetStats?.lengthBonus ?? 0}`,
    `Moving target volatility penalty: ${scenario.metrics.movingTargetVolatilityPenalty ?? 0} (production OFF; legacy estimate ${scenario.metrics.movingTargetVolatilityLegacyEstimate ?? 0} diagnostic-only)`,
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
    (scenario.metrics.boardFootprintUse ?? scenario.metrics.meaningfulBoardUse)
      ? (() => {
        const footprint = scenario.metrics.boardFootprintUse
          ?? scenario.metrics.meaningfulBoardUse;
        return `Board footprint v49eg: penalty ${footprint.penalty}, limited ${footprint.weakBoardCount ?? 0}; ${footprint.boards.map((board) => `#${board.boardIndex + 1} regs ${board.representativeRegisters}, tiles ${board.uniqueRouteTiles ?? 0}, depth ${board.maxDepth}/${board.targetDepth}, transit ${board.hasEfficientTransit ? "yes" : "no"}, checkpoint ${board.finalCheckpointOnBoard ? "final" : "no-final"}, footprintScore ${board.contributionScore}, penalty ${board.penalty}`).join("; ")}`;
      })()
      : "Board footprint v49eg: n/a",
    scenario.metrics.boardGameplayRelevance
      ? `Board gameplay relevance v49eg: demonstrated ${scenario.metrics.boardGameplayRelevance.demonstratedCount ?? 0}, indirect-effect ${scenario.metrics.boardGameplayRelevance.indirectEffectCount ?? 0}, ablation-clear ${scenario.metrics.boardGameplayRelevance.ablationClearCount ?? 0}, pending-ablation ${scenario.metrics.boardGameplayRelevance.pendingAblationCount ?? 0}, removal-candidate ${scenario.metrics.boardGameplayRelevance.removalCandidateCount ?? 0}; ${scenario.metrics.boardGameplayRelevance.boards.map((board) => {
        const ab = board.ablation;
        const ablationText = ab
          ? `, ablation effect ${ab.modeledEffectDetected ? "yes" : "no"} [routes ${ab.routeCount}, removedTiles ${ab.removedTileCount}, routeMissing ${ab.routePositionMissingCount}, displacementChanged ${ab.displacementChangedRegisterCount}, maxControlΔ ${ab.maxDisplacementControlSeverityAbsDelta}, nearbyΔ ${ab.weightedNearbyControlAbsDelta}, robotLaserΔ ${ab.weightedRobotLaserAbsDelta}]`
          : "";
        return `#${board.boardIndex + 1} ${board.relevanceStatus}/${board.cleanupRecommendation}; direct ${board.directRouteUse ? "yes" : "no"}, checkpoints ${board.checkpointIndices?.length ? board.checkpointIndices.join(",") : "none"}, structural ${board.structuralProtected ? "yes" : "no"}, minRouteDist ${board.minimumTrackedRouteDistance ?? "-"}, legacyBasis ${board.currentLegacyRetentionReasons?.join("+") || "none"}, demonstratedBy ${board.demonstratedReasons?.join("+") || "none"}${ablationText}`;
      }).join("; ")}`
      : "Board gameplay relevance v49eg: n/a",
    scenario.metrics.boardCleanupAuditTrail?.length
      ? `Board cleanup v49eg (orphan fixed-route gate + whole-course A/B): ${scenario.metrics.boardCleanupAuditTrail.map((entry) => (
        `pass ${entry.pass}: ` +
        entry.decisions.map((decision) => {
          const ab = decision.ablation;
          const comparison = decision.comparison;
          const comparisonText = comparison
            ? ` [wholeCourse ${comparison.materialDifference ? "MATERIAL" : "clear"}; reasons ${comparison.reasons?.join("+") || "none"}; Δdifficulty ${comparison.deltas?.difficultyTurnRE ?? "n/a"}, Δlength ${comparison.deltas?.lengthWallClockTurnIndex ?? "n/a"}, Δfairness ${comparison.deltas?.fairnessRangeRE ?? "n/a"}, Δtraffic ${comparison.deltas?.trafficAveragePenalty ?? "n/a"}]`
            : "";
          return `#${Number.isInteger(decision.boardIndex) ? decision.boardIndex + 1 : "?"}/${decision.pieceId ?? "?"} ${decision.action}/${decision.reason}` +
            (ab
              ? ` [routes ${ab.routeCount}, removedTiles ${ab.removedTileCount}, routeMissing ${ab.routePositionMissingCount}, displacementChanged ${ab.displacementChangedRegisterCount}, nearbyΔ ${ab.weightedNearbyControlAbsDelta}, robotLaserΔ ${ab.weightedRobotLaserAbsDelta}]`
              : "") +
            comparisonText;
        }).join(", ")
      )).join(" | ")}`
      : "Board cleanup v49eg: no orphan-board ablation test recorded",
    scenario.metrics.routeDrama
      ? `Route drama: ${scenario.metrics.routeDrama.level}, score ${scenario.metrics.routeDrama.score}, penalty ${scenario.metrics.routeDrama.penalty}, sharedTiles ${scenario.metrics.routeDrama.sharedTiles}, crossings ${scenario.metrics.routeDrama.crossings}, reverseEdges ${scenario.metrics.routeDrama.reverseEdges}`
      : "Route drama: n/a",    scenario.metrics.competitiveBlockImpact
      ? `Competitive balance simulation v49ec: sequential best-one completed-RE blocks ${(scenario.metrics.competitiveBlockImpact.blockSequence ?? []).map((entry) => `p${entry.order}:#${entry.index + 1}@${entry.effectiveRE ?? entry.score}RE${Number.isFinite(entry.advantageVsMedianRE ?? entry.advantageVsMedian) ? ` (adv ${entry.advantageVsMedianRE ?? entry.advantageVsMedian}RE` : ""}${Number.isFinite(entry.decisionMarginRE ?? entry.decisionMargin) ? `, gap ${entry.decisionMarginRE ?? entry.decisionMargin}RE` : ""}${Number.isFinite(entry.strategicChallenge) ? `, challenge ${entry.strategicChallenge}` : ""}${Number.isFinite(entry.advantageVsMedianRE ?? entry.advantageVsMedian) ? ")" : ""}`).join(" -> ") || "none"}; traffic recomputations ${scenario.metrics.competitiveBlockImpact.trafficRecomputations ?? 0}; remaining ${scenario.metrics.competitiveBlockImpact.remainingStartCount}, post-block best-${scenario.playerCount ?? scenario.preferences?.playerCount ?? "P"} ${scenario.metrics.competitiveBlockImpact.selectedStartCount ?? "n/a"} [${(scenario.metrics.competitiveBlockImpact.selectedIndices ?? []).map((index) => index + 1).join(", ")}], RE range ${scenario.metrics.competitiveBlockImpact.selectedRangeRE ?? scenario.metrics.competitiveBlockImpact.scoreRange ?? "n/a"}/${scenario.metrics.competitiveBlockImpact.balanceRangeLimit ?? "n/a"} soft/${scenario.metrics.competitiveBlockImpact.hardBalanceRangeLimit ?? "n/a"} hard (excess ${scenario.metrics.competitiveBlockImpact.balanceRangeExcess ?? "n/a"}; median ${scenario.metrics.competitiveBlockImpact.selectedMedianTurns ?? "n/a"} programming turns), SD ${scenario.metrics.competitiveBlockImpact.selectedStdDev ?? "n/a"} diagnostic-only, strategicDifficulty +${scenario.metrics.competitiveBlockImpact.strategicDifficulty ?? "n/a"} (center ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.calibrationCenter ?? 1.8}, blockChallenge ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.meanBlockChallenge ?? "n/a"}, selectionAmbiguity ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.selectionAmbiguity ?? "n/a"}, provisional ${scenario.metrics.competitiveBlockImpact.strategicDifficultyEvidence?.provisional ? "yes" : "no"}), RE-native legibility ${scenario.metrics.competitiveBlockImpact.blockReadability?.meanBlockChallenge ?? "n/a"}/${scenario.metrics.competitiveBlockImpact.blockReadability?.meanBlockChallengeTarget ?? "n/a"} mean, max ${scenario.metrics.competitiveBlockImpact.blockReadability?.maxBlockChallenge ?? "n/a"}/${scenario.metrics.competitiveBlockImpact.blockReadability?.maxBlockChallengeTarget ?? "n/a"}, fitPenalty ${scenario.metrics.competitiveBlockImpact.blockReadability?.fitPenalty ?? 0}, legacy-shadow OFF, worstREz ${scenario.metrics.competitiveBlockImpact.worstScoreZ ?? "n/a"} diagnostic, registerZ ${scenario.metrics.competitiveBlockImpact.worstActionZ ?? "n/a"} diagnostic, blockTraffic ${scenario.metrics.competitiveBlockImpact.blockTrafficScope ?? "n/a"}, softBalanced ${scenario.metrics.competitiveBlockImpact.softBalanced ? "yes" : "no"}, hardAcceptable ${scenario.metrics.competitiveBlockImpact.hardAcceptable ? "yes" : "no"}, method ${scenario.metrics.competitiveBlockImpact.method}`
      : "Competitive balance simulation: n/a",
    scenario.metrics.competitiveBlockImpact?.completedREOwnershipAudit
      ? (() => {
        const audit = scenario.metrics.competitiveBlockImpact.completedREOwnershipAudit;
        const choice = audit.completedREChoiceProfile ?? {};
        const trace = (audit.blockSequence ?? []).map((entry) => (
          `p${entry.order}:#${Number.isInteger(entry.index) ? entry.index + 1 : "?"}` +
          `${Number.isFinite(entry.effectiveRE) ? `@${entry.effectiveRE}RE` : ""}` +
          `${Number.isFinite(entry.decisionMarginRE) ? `(gap ${entry.decisionMarginRE}RE)` : ""}`
        )).join(" -> ") || "none";
        return `Competitive completed-RE ownership v49ec LIVE: production block/choice owner ${audit.productionRankingOwner ?? "completed-effective-re"}; P sequential best-one blocks [${trace}] with traffic recomputed between decisions; post-block choice set best-${audit.intendedChoiceSetCount ?? audit.productionChoiceSetCount ?? "P"} [${(audit.completedREChoiceSetIndices ?? []).map((index) => index + 1).join(", ") || "none"}], RE sd/range ${choice.stdDev ?? "n/a"}/${choice.rangeRE ?? "n/a"}RE; final fairness owner ${audit.finalFairnessOwner ?? "best-worst-completed-effective-re-range"}, soft/hard ${audit.finalRangePolicy?.softRangeLimit ?? "n/a"}/${audit.finalRangePolicy?.hardRangeLimit ?? "n/a"}RE; legacy ranking/readability comparator OFF; occupancy ${audit.occupancyOwner ?? "completed-effective-re"} (${audit.occupancyQualityScale ?? "RE-native"}); traffic ${audit.productionTrafficScope ?? "full"}; RE-native difficulty legibility LIVE; Start Balance ${audit.startBalanceControl?.preset ?? "standard"} applies only to the post-block best-P range; Dev ★ = expected selected start`;
      })()
      : "Competitive completed-RE ownership v49ec: n/a",
    summary.payToWin?.active
      ? `${summary.payToWin.subsidizedStarts ? "Subsidized Starts" : "Pay to Win"}: model ${summary.payToWin.pricingModel?.method ?? "n/a"}, economy ${summary.payToWin.pricingEconomyMethod ?? "n/a"}, target ${summary.payToWin.pricingModel?.target ?? "n/a"}, ${summary.payToWin.subsidizedStarts ? `start ${summary.payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}E / subsidy-total ceiling ${summary.payToWin.subsidyStartingEnergyCeiling ?? summary.payToWin.pricingModel?.subsidyStartingEnergyCeiling ?? "n/a"}E / storage ${summary.payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}E` : `start ${summary.payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}E / storage ${summary.payToWin.maxEnergy ?? ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy}E`}, startingCards ${summary.payToWin.startingUpgradeCards ?? DEFAULT_STARTING_UPGRADE_CARDS}, offered ${summary.payToWin.pricedStartCount ?? "n/a"}, pruned ${(summary.payToWin.pruned ?? []).length}, residualRange ${summary.payToWin.residualBalance?.worstRange ?? "n/a"}/${summary.payToWin.residualBalance?.worstRangeLimit ?? "n/a"}RE (overflow ${summary.payToWin.residualBalance?.worstRangeExcess ?? 0}; soft +${summary.payToWin.residualBalance?.worstSoftOverflowAllowance ?? "n/a"}), residualPenalty ${summary.payToWin.residualBalance?.worstResidualPenalty ?? 0}, meaningfulEnergy ${summary.payToWin.meaningfulEnergyAdjustmentCount ?? 0}, capLimited ${summary.payToWin.capLimitedEnergyAdjustmentCount ?? 0}, SD ${summary.payToWin.residualBalance?.worstStdDev ?? "n/a"} diagnostic-only, availability ${summary.payToWin.availabilityValid === false ? "FAIL" : "pass"}, balance ${summary.payToWin.balanceValid === false ? "residual" : "pass"}, latePricing ${summary.payToWin.latePricingActive ? "active" : "inactive"}, selectorSplit ${summary.payToWin.selectorSplit?.selected ? `after-p${summary.payToWin.selectorSplit.cutoffAfter}` : "none"}`
      : "Priced starts: n/a",
    summary.payToWin?.startBalanceFinalCheck
      ? (() => {
        const finalBalance = summary.payToWin.startBalanceFinalCheck;
        const before = finalBalance.before ?? {};
        const after = finalBalance.afterReprice ?? {};
        return `Priced Start Balance v49fn: ${finalBalance.startBalanceLabel ?? "Standard"} ${finalBalance.enforced ? "ON" : "off"}; ordinary Energy economy completed first; before early ${before.early?.range ?? "n/a"}/${before.early?.rangeLimit ?? "n/a"}RE${before.latePricingActive ? `, late ${before.late?.range ?? "n/a"}/${before.late?.rangeLimit ?? "n/a"}RE` : ""}; one frozen-field batch pruned [${(finalBalance.prunedIndices ?? []).map((index) => index + 1).join(", ") || "none"}]; traffic recompute ${finalBalance.trafficRecomputed ? "yes" : "no"}; one final repricing ${finalBalance.repriced ? "yes" : "no"}; after early ${after.early?.range ?? "n/a"}/${after.early?.rangeLimit ?? "n/a"}RE${after.latePricingActive ? `, late ${after.late?.range ?? "n/a"}/${after.late?.rangeLimit ?? "n/a"}RE` : ""}; target ${finalBalance.withinTargetAfterReprice ? "pass" : "MISS"}`;
      })()
      : "Priced Start Balance v49fn: n/a",
    summary.payToWin?.reOwnershipAudit?.early
      ? (() => {
        const audit = summary.payToWin.reOwnershipAudit;
        const early = audit.early;
        const late = audit.late;
        return `Economy start RE ownership v49ea PRE-CONTROL CORE: ${audit.mode}; original start-specific completed-RE Energy balancing toward the directional field anchor, including its ordinary residual prune/rebalance loop, is unchanged by Start Balance; ${summary.payToWin.subsidizedStarts ? "Subsidized Starts cap total starting Energy at min(base+3, storage max); " : ""}literal duration diagnostic-only; early range ${summary.payToWin.residualBalance?.early?.rangeRE ?? "n/a"}/${summary.payToWin.residualBalance?.early?.residualPenaltyComponents?.rangeLimit ?? "n/a"}RE, penalty ${early.residualPenalty ?? 0}, nonzero ${early.nonzeroAdjustments ?? 0}, max ${summary.payToWin.subsidizedStarts ? "+" : ""}${early.maxAdjustment ?? 0}E${summary.payToWin.latePricingActive ? `; late range ${summary.payToWin.residualBalance?.late?.rangeRE ?? "n/a"}/${summary.payToWin.residualBalance?.late?.residualPenaltyComponents?.rangeLimit ?? "n/a"}RE, penalty ${late.residualPenalty ?? 0}, nonzero ${late.nonzeroAdjustments ?? 0}, max ${summary.payToWin.subsidizedStarts ? "+" : ""}${late.maxAdjustment ?? 0}E` : ""}; target ${early.targetPolicy ?? "n/a"}@${early.targetEffectiveRE ?? "n/a"}RE${summary.payToWin.latePricingActive ? ` / late ${late.targetPolicy ?? "n/a"}@${late.targetEffectiveRE ?? "n/a"}RE` : ""}; cap-limited ${early.capLimitedAdjustments ?? 0}${summary.payToWin.latePricingActive ? `/${late.capLimitedAdjustments ?? 0}` : ""}; Start Balance is downstream in the separate v49fn one-shot final check`;
      })()
      : "Economy start RE ownership v49ea: n/a",
    summary.payToWin?.selectorRuntimeOptimization
      ? (() => {
        const runtime = summary.payToWin.selectorRuntimeOptimization;
        return `Economy selector runtime v49cl: exact frozen-field reuse ${runtime.finalPricingStateReused ? "HIT" : "MISS"}; reused ${runtime.reusedBaseStartCurves ?? 0} base start curve(s) + ${runtime.reusedSelectorScenarioSamples ?? 0} selector scenario(s); selector sampling unchanged`;
      })()
      : "Economy selector runtime v49cl: n/a",
    summary.payToWin?.active
      ? "Economy route-choice v49dw LIVE: completed effective RE + card-aware starting-Energy delta selects among already-discovered full-course candidates at each payment/subsidy; legacy intrinsic + traffic + 4% raw-gap is comparator/pricing-space telemetry only."
      : "Economy route-choice v49dw: n/a",
    summary.payToWin?.targetedEnergyRescue
      ? (() => {
        const rescue = summary.payToWin.targetedEnergyRescue;
        const details = (rescue.details ?? []).map((entry) => (
          `#${entry.index + 1}${Number.isFinite(entry.startingEnergy) ? `@${entry.startingEnergy}E` : ""} ` +
          `${entry.directionProfile?.mode ?? ""} ${entry.reason}` +
          `${Number.isFinite(entry.penaltyBefore) && Number.isFinite(entry.penaltyAfter) ? ` ${entry.penaltyBefore}->${entry.penaltyAfter}` : ""}`
        ).replace(/\s+/g, " ").trim()).join(" | ");
        return `Economy targeted Energy rescue v49ct: attempts ${rescue.attempts ?? 0}, direction-skips ${rescue.skippedDirectionMismatch ?? 0}, accepted ${rescue.accepted ?? 0}, saved prunes ${rescue.savedPrunes ?? 0}, routes discovered/added ${rescue.routesDiscovered ?? 0}/${rescue.routesAdded ?? 0}${details ? `; ${details}` : ""}`;
      })()
      : "Economy targeted Energy rescue v49ct: n/a",
    summary.payToWin?.pricingEntries?.length
      ? `Priced start residuals: ${summary.payToWin.pricingEntries.map((entry) => {
        const prefix = summary.payToWin.subsidizedStarts ? "+" : "";
        const early = entry.unavailable
          ? "unavailable"
          : `${prefix}${entry.energyCost}E -> ${entry.postPaymentFullScore ?? "n/a"}RE (Δ${entry.postAdjustmentDeltaRegisters ?? "n/a"}RE vs median)`;
        const late = summary.payToWin.latePricingActive
          ? ` / late ${entry.lateUnavailable ? "unavailable" : `${prefix}${entry.lateEnergyCost}E -> ${entry.latePostPaymentFullScore ?? "n/a"}RE (Δ${entry.latePostAdjustmentDeltaRegisters ?? "n/a"}RE vs median)`}`
          : "";
        return `#${entry.index + 1} raw ${entry.fullScore ?? "n/a"}RE: ${early}${late}`;
      }).join(" | ")}`
      : "Priced start residuals: n/a",
    summary.normalStartBalance?.active
      ? `Normal start balance v49fj: ${formatStartBalanceLabel(scenario.preferences?.startBalance)} RANGE-FIRST completed-RE, pruned ${(summary.normalStartBalance.pressurePruned ?? []).length ? (summary.normalStartBalance.pressurePruned ?? []).map((item) => `#${item.index + 1}(ΔRE ${item.diagnostics?.scoreDelta ?? "n/a"}; range ${item.diagnostics?.rangeBefore ?? "n/a"}->${item.diagnostics?.rangeAfterEstimate ?? "n/a"}/${item.diagnostics?.rangeLimit ?? "n/a"}; SD ${item.diagnostics?.balanceStdDevBefore ?? "n/a"}->${item.diagnostics?.balanceStdDevAfter ?? item.diagnostics?.balanceStdDevAfterEstimate ?? "n/a"}; pass ${item.pass ?? "n/a"})`).join(", ") : "none"}, retained ${summary.normalStartBalance.retainedCount ?? scenario.metrics?.usableStarts?.length ?? "n/a"}, effectiveRE ${summary.normalStartBalance.retainedEffectiveREMin ?? summary.normalStartBalance.retainedScoreMin ?? "n/a"}..${summary.normalStartBalance.retainedEffectiveREMax ?? summary.normalStartBalance.retainedScoreMax ?? "n/a"}, range ${summary.normalStartBalance.retainedEffectiveRERange ?? "n/a"}/${summary.normalStartBalance.retainedEffectiveRERangeLimit ?? "n/a"} (excess ${summary.normalStartBalance.retainedEffectiveRERangeExcess ?? "n/a"}; observed ${summary.normalStartBalance.residualSelectionPenaltyComponents?.observedRangeExcess ?? summary.normalStartBalance.retainedEffectiveRERangeExcess ?? "n/a"}; soft +${summary.normalStartBalance.residualSelectionPenaltyComponents?.softOverflowAllowance ?? "n/a"}; median ${summary.normalStartBalance.fairnessMedianTurns ?? "n/a"} turns), SD ${summary.normalStartBalance.balanceStdDevBefore ?? "n/a"}->${summary.normalStartBalance.balanceStdDevAfter ?? "n/a"} diagnostic/tiebreak only, action pruning OFF, duration guardrail ${(summary.normalStartBalance.durationGuardrail?.min ?? "n/a")}..${(summary.normalStartBalance.durationGuardrail?.max ?? "n/a")} regs (range ${summary.normalStartBalance.durationGuardrail?.range ?? "n/a"}/${summary.normalStartBalance.durationGuardrail?.allowedRange ?? "n/a"}; ${summary.normalStartBalance.durationGuardrail?.violation ? "VIOLATION" : "pass"}), traffic recomputations ${summary.normalStartBalance.trafficRecomputations ?? 0}, floor ${summary.normalStartBalance.retainedCount ?? "n/a"}/${summary.normalStartBalance.playerFloor ?? scenario.playerCount ?? "?"}${summary.normalStartBalance.floorReached ? " reached" : ""}, residual scorer penalty ${summary.normalStartBalance.residualSelectionPenalty ?? 0}, hard-fail ${summary.normalStartBalance.belowPlayerFloor ? "yes" : "no"}`
      : "Normal start balance: n/a",
    reDifficultyShadow?.active
      ? `RE-turn difficulty starts v49de: ${(reDifficultyShadow.perStart ?? []).map((entry) => `#${entry.index + 1} occ${Number(entry.occupancy).toFixed(3)} mix${entry.routeCount} eff${Number(entry.effectiveRE).toFixed(2)}RE regs${Number(entry.programmedRegisters).toFixed(2)} turns${Number(entry.programmingTurns).toFixed(2)} lost${Number(entry.lostRegisterTempoRE).toFixed(2)} burden${Number(entry.burdenRE).toFixed(2)} meanTurn${Number(entry.meanTurnBurdenRE).toFixed(3)} peakTurn${Number(entry.turnTailBurdenRE).toFixed(3)} composite${Number(entry.routeTurnDifficultyRE).toFixed(3)}`).join(" | ")}`
      : `RE-turn difficulty starts v49de: ${reDifficultyShadow?.reason ?? "n/a"}`,
    scenario.movingTargetReentryMarkers?.length
      ? `Moving target re-entry: ${scenario.movingTargetReentryMarkers.map((marker) => `${marker.label}(${marker.x},${marker.y})`).join(", ")}`
      : "Moving target re-entry: none",
    movingTargetHitLines.length
      ? `Moving target hits: ${movingTargetHitLines.join("; ")}`
      : "Moving target hits: none",
    scenario.competitiveMode
      ? `Fairness stddev (Competitive selected full-course effective RE): ${scenario.metrics.fairnessStdDev}`
      : `Fairness stddev (retained full-course effective RE when Normal): ${scenario.metrics.fairnessStdDev}`,
    `Course difficulty score: ${summary.difficultyScore}`,
    `Course length score: ${summary.lengthScore}`,
    `Course action score: ${summary.actionScore}`,
    `Flag area score: ${summary.flagAreaScore}`,
    currentNormalRouteModel
      ? "Traffic scoring: RE-native confidence-weighted full-course occupancy/laser/proximity model"
      : `Average traffic penalty: ${summary.averageTrafficPenalty}`,
    currentNormalRouteModel
      ? "Traffic forecast confidence v49dm LIVE: elapsed register horizon + intrinsic adverse RE chronology (card plausibility, damage-card supply, clog/control, intrinsic mental); same-epoch traffic RE excluded to prevent circularity; raw hazard/interaction/board-chaos confidence decay OFF; damage pressure can restore low-confidence optional reroute effort only toward 0.50, never confidence itself."
      : "Traffic forecast confidence v49dm LIVE: n/a",
    currentNormalRouteModel
      ? (() => {
        const audit = summarizeTrafficOwnershipAuditSafe();
        const own = summary.fullCourseTraffic?.ownershipAuditV49bk ?? null;
        return audit && own
          ? `Traffic ownership v49ce: avg effective ${summary.fullCourseTraffic?.averagePenalty ?? 0} score (mechanical traffic only); robot-laser damage ${own.averageRobotLaserDamageScore ?? 0} score = ${own.averageRobotLaserDamageRE ?? 0} RE via damage economy; legacy residual ranged threat ${own.averageLegacyResidualRangedThreatDiagnosticPenalty ?? 0} diagnostic-only / production 0; nearby turn-episode control AUTHORITATIVE ${own.averageNearbyPenalty ?? 0} score = ${own.averageAuthoritativeNearbyControlRE ?? 0} RE; simultaneous-reboot pile-up ${own.averageSimultaneousRebootPileupEventMass ?? 0} event mass / ${own.averageSimultaneousRebootPileupMaximumTurnProbability ?? 0} max-turn probability -> +${own.averageSimultaneousRebootPileupClogRE ?? 0}RE actual-clog consequence; traffic-awareness mental AUTHORITATIVE downstream ${own.averageTrafficAwarenessMentalRE ?? 0} RE from event mass ${own.averageTrafficAwarenessEventMass ?? 0} (laser ${own.averageTrafficAwarenessRobotLaserEventMass ?? 0} + non-laser ${own.averageTrafficAwarenessNonLaserEventMass ?? 0} + reboot-pileup ${own.averageTrafficAwarenessRebootPileupEventMass ?? 0}); non-laser episode probability mass ${own.averageNearbyTurnEpisodeEventMassCandidate ?? 0}, episode control load ${own.averageNearbyTurnEpisodeControlLoadCandidate ?? 0}; competition ${own.averageCompetitionPenalty ?? 0} (active ${audit.competitionActive ? "yes" : "no"}).`
          : "Traffic ownership v49ce: audit metadata unavailable.";
      })()
      : "Traffic ownership v49ce: n/a",
    currentNormalRouteModel
      ? "Board mechanics v49fe LIVE: Radiation is authoritative +1 damage at end of register 5; Radioactive Waste uses ordinary Water-current movement plus authoritative +1 end-of-every-register damage and the better of +1 Energy vs free random-upgrade-install value from the existing upgrade economy; red/green walls use one directional boundary rule for movement and robot-laser LOS with directional LOS caching, both remain active under checkpoints, and either wall color can anchor laser overlay tiles. Homing Missile, robot-laser traffic and reboot-pileup ownership remain as in v49ej."
      : "Board mechanics v49fe: n/a",
    currentNormalRouteModel
      ? "Randomizer ownership v49fh LIVE: an active Randomizer at register start contributes deterministic +2 control-clog to that game turn through the shared nonlinear SPAM/Haywire clog curve; that register is a full SPAM-relief opportunity, and forced or elective SPAM assigned to that Randomizer register adds no second +2 clog. Randomizer has no separate production mental-event charge; cheap pathfinder guidance is a provisional isolated 2-clog bridge pending corpus calibration."
      : "Randomizer ownership v49fh: n/a",
    `Robot-laser variants v49eo LIVE: Set to Kill ${scenario.setToKill ? "ON (2 damage cards per main-laser hit)" : "off"}; Set to Stun ${scenario.setToStun ? "ON (robot-laser SPAM goes to the damage discard pile / does not enter persistent SPAM state; Haywire unchanged per damage card)" : "off"}; LOS/hit probability and robot-laser awareness mental are unchanged; neither rule adds a variant-memory event.`,
    `Floor damage/repair v49eo LIVE: flamethrowers deal 1 on each active entry/pass-through +1 on end-of-register; Flaming Oil ${scenario.flamingOil ? "ON (+1 on entering any oil in a register +1 on ending that register on oil; no per-oil-tile stacking)" : "off"}; Repair Stations ${scenario.repairStations ? "ON (register-5 ordinary checkpoint removes 23/40 expected SPAM +17/40 expected Haywire, no spill)" : "off"}; flamethrower / Flaming Oil / Repair Station planning each collapse to at most one mental event per game turn when relevant.`,
    `Variant ownership v49es LIVE: Moving Targets ${scenario.movingTargets ? "ON (dynamic checkpoint routing + one tracking mental event per relevant register; old tracking/volatility production penalties OFF)" : "off"}; Repulsor Overdrive ${scenario.repulsorOverdrive ? "ON (exact doubled bounce + at most one relevant memory event per turn)" : "off"}; Hazardous Flags ${scenario.hazardousFlags ? "ON (covered board elements stay mechanically active + at most one relevant memory event per turn)" : "off"}; Critical Haywire ${scenario.criticalHaywire ? "ON (hand-size effect; no mental event)" : "off"}; Critical SPAM ${scenario.criticalSpam ? "ON (played-SPAM model: provisional 20% effective relief / 80% returned to pending; no mental event)" : "off"}.`,
    `Scenario/config ownership v49es: No Docks ${scenario.noDocks ? "full eligible exposed edge before normal pruning" : "off"}; Extra Docks ${scenario.extraDocks ? "multiple physical docks (forced mode hard-gated)" : "off"}; Sandwiched Dock ${scenario.sandwichedDock ? "intentional checkpoint-facing / both-sides construction policy" : "off"}; board offsets ${scenario.staggeredBoards ? "allowed, not guaranteed" : "disallowed/aligned required"}; Virtual Bots ${scenario.virtualBots ? "strategic player-route branching proxy, no mental event" : "off"}; overlays use a human-facing pre-game complexity envelope, while placed overlay mechanics use ordinary board ownership.`,
    `Virtual Bots model v49fc: ${scenario.virtualBots ? "normal cooperative estimate→realize routing over n_players logical starts at one shared square; traffic remains active; turn-1 robot-laser damage/awareness suppressed" : "off"}.`,
    `Early-stop fallback v49fc: completed fallback candidates survive user Stop before an acceptable candidate exists; acceptable-candidate labeling remains unchanged.`,
    scenario.hydrationStartDispositionRestored
      ? `Saved-course start disposition v49ff: restored the accepted Normal prune set before recomputing traffic/RE; refresh cannot intersect a stale saved blocked set with a newly chosen prune set.`
      : `Saved-course start disposition v49ff: generation/live analysis; no hydration restore needed.`,
    `Variant construction v49eu: v49et requirement-aware main-board selection preserved; filler-board completion is now bounded with deterministic dock-span fallback so failed requirement/dock combinations cannot recurse through filler permutations; Moving Targets / Hazardous Flags still constrain checkpoint sampling.`,
    `Variant applicability v49es SAFETY NET: Must rules must be realizable on the finished course; sampled Allowed rules with positive complexity cost obey the same realized-applicability gate, so optional complexity is never spent on a physically inert special rule.`,
    currentNormalRouteModel
      ? ""
      : (summary.courseContinuationWeighted
        ? `Start full-course continuation: mean ${summary.courseContinuationMean}, weighted into start scores`
        : "Start full-course continuation: n/a"),
    currentNormalRouteModel
      ? `Traffic feedback: epochs ${contextualCache?.trafficEpochsExecuted ?? 0}, demand ${contextualCache?.trafficAlternateDemandStarts ?? 0} starts/${contextualCache?.trafficAlternateDemandLegs ?? 0} legs (${contextualCache?.trafficAlternateEffectiveDemandLegs ?? 0} effective/${contextualCache?.trafficAlternateExploratoryDemandLegs ?? 0} exploratory/${contextualCache?.trafficAlternatePressureDemandLegs ?? 0} damage-pressure), probe-stops ${contextualCache?.trafficAlternateCachedProbeStops ?? 0}, escalations ${contextualCache?.trafficAlternateEscalations ?? 0}, bounded searches ${contextualCache?.trafficAlternateNewSearches ?? 0}, hotspot searches ${contextualCache?.trafficAlternateHotspotLocalSearches ?? 0}, exact checks ${contextualCache?.trafficAlternateExactChecks ?? 0}, low-gain rejects ${contextualCache?.trafficAlternateLowGainRejects ?? 0}, duplicate rejects ${contextualCache?.trafficAlternateDuplicateRejects ?? 0}, alternate effort mean/min ${contextualCache?.trafficAlternateAverageEffortScale ?? 1}/${contextualCache?.trafficAlternateMinimumEffortScale ?? 1}, candidates ${contextualCache?.trafficAlternateCandidatesAdded ?? 0}, final-selection switches ${summary.fullCourseTraffic?.routeSwitches ?? 0}, effective/raw avg ${summary.fullCourseTraffic?.averagePenalty ?? 0}/${summary.fullCourseTraffic?.averageRawPenalty ?? 0}, confidence mean/min ${summary.fullCourseTraffic?.averageForecastConfidence ?? 1}/${summary.fullCourseTraffic?.minimumForecastConfidence ?? 1}; search priority ${((contextualCache?.trafficAlternateSearchTrace ?? []).map((entry) => `s${entry.startIndex}:L${(entry.legIndex ?? 0) + 1}@p${entry.pivotIndex}/${entry.hotspotOwner ?? "?"}/T${entry.hotspotTurn ?? "?"}/${entry.hotspotPressureRE ?? 0}RE`).join(", ")) || "none"}; exact gains ${((contextualCache?.trafficAlternateGainTrace ?? []).map((entry) => `s${entry.startIndex}:L${(entry.legIndex ?? 0) + 1} ${entry.gain >= 0 ? "+" : ""}${entry.gain} vs ${entry.minimumUsefulGain}`).join(", ")) || "none"}`
      : (summary.fullCourseTraffic
        ? `Full-course route pressure: passes ${summary.fullCourseTraffic.passes}, switches ${summary.fullCourseTraffic.routeSwitches}, avgPenalty ${summary.fullCourseTraffic.averagePenalty}`
        : "Full-course route pressure: n/a"),
    currentNormalRouteModel
      ? `Traffic round trace: ${(contextualCache?.trafficFeedbackRoundSummaries ?? []).map((entry) => `R${entry.round} s${entry.newSearches}/c${entry.candidatesAdded}/g${entry.bestGain}${entry.adaptiveEvidence ? `/e${entry.evidenceChecks ?? 0}-${entry.evidenceStops ?? 0}` : ""}${entry.fieldChanged ? `/Δr${entry.selectedRouteChanges}/m${entry.mixtureWeightDelta}/o${entry.occupancyWeightDelta}` : ""}${entry.stopReason ? `/${entry.stopReason}` : ""}`).join(", ") || "none"}`
      : "Traffic round trace: n/a",
    currentNormalRouteModel
      ? (() => {
        const field = summary.fullCourseTraffic?.routeMixtureField
          ?? contextualCache?.trafficRouteMixtureField
          ?? null;
        if (!field?.startCount) {
          return "Traffic route-mixture ownership v49dc LIVE: unavailable";
        }
        return (
          `Traffic route-mixture ownership v49dc LIVE: completed effective RE (including traffic-awareness mental) owns route-family attractiveness; ` +
          `starts ${field.startCount}, alternate share avg/max ${field.averageAlternateShare ?? 0}/${field.maximumAlternateShare ?? 0}, ` +
          `effective-route count avg ${field.averageEffectiveRouteCount ?? 0}; fixed start occupancy preserved`
        );
      })()
      : "Traffic route-mixture ownership v49dc LIVE: n/a",
    currentNormalRouteModel
      ? `Traffic route-switch objective v49dn LIVE: completed effective RE for switching among already-discovered candidates; minimum useful gain ${(NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN / 6.4).toFixed(4)}RE (converted from the historical score threshold); legacy route.score + traffic.total and +4% raw-gap stability are comparator-only, not selection owners; route-family occupancy attractiveness remains completed effective RE.`
      : "Traffic route-switch objective: n/a",
    currentNormalRouteModel
      ? (() => {
        const field = summary.fullCourseTraffic?.routeFamilyDivergenceField
          ?? contextualCache?.trafficRouteFamilyDivergenceField
          ?? null;
        if (!field) {
          return "Traffic route-family divergence v49ce OBSERVATIONAL: unavailable";
        }
        const legs = (field.perLeg ?? [])
          .map((entry) => (
            `L${entry.leg}:geoStarts${entry.startsWithGeometricAlternate ?? 0}` +
            `/w${entry.geometricAlternateWeight ?? 0}` +
            `/div${entry.averageCorridorDiversity ?? 0}-${entry.maximumCorridorDiversity ?? 0}` +
            `/regs${entry.averageGeometricDistinctRegisters ?? 0}` +
            `/runMax${entry.maximumGeometricDistinctRun ?? 0}` +
            `/first${entry.earliestGeometricDivergenceRegister ?? "-"}` +
            `/last${entry.latestGeometricDistinctRegister ?? "-"}`
          ))
          .join(" | ");
        return (
          `Traffic route-family divergence v49ce OBSERVATIONAL: starts retained/geometric/trajectory-only ` +
          `${field.startsWithRetainedAlternates ?? 0}/${field.startsWithGeometricAlternates ?? 0}/` +
          `${field.startsWithTrajectoryOnlyAlternates ?? 0} of ${field.startCount ?? 0}; ` +
          `alternate families geometric/trajectory-only ${field.retainedGeometricAlternateFamilies ?? 0}/` +
          `${field.retainedTrajectoryOnlyAlternateFamilies ?? 0}; ${legs || "no leg data"}`
        );
      })()
      : "Traffic route-family divergence v49ce OBSERVATIONAL: n/a",
    currentNormalRouteModel
      ? (() => {
        const field = summary.fullCourseTraffic?.routeFamilyDivergenceField
          ?? contextualCache?.trafficRouteFamilyDivergenceField
          ?? null;
        if (!field) return "Traffic route-family starts: unavailable";
        const starts = (field.starts ?? [])
          .filter((entry) => (
            (entry.geometricAlternateFamilyCount ?? 0) > 0 ||
            (entry.trajectoryOnlyAlternateFamilyCount ?? 0) > 0
          ))
          .map((entry) => {
            const legs = (entry.perLeg ?? [])
              .filter((leg) => (
                (leg.geometricAlternateCount ?? 0) > 0 ||
                (leg.trajectoryOnlyAlternateCount ?? 0) > 0
              ))
              .map((leg) => (
                `L${leg.leg}[g${leg.geometricAlternateCount ?? 0}` +
                `/t${leg.trajectoryOnlyAlternateCount ?? 0}` +
                `/w${leg.geometricAlternateWeight ?? 0}` +
                `/d${leg.maximumCorridorDiversity ?? 0}` +
                `/run${leg.maximumGeometricDistinctRun ?? 0}` +
                `/first${leg.earliestGeometricDivergenceRegister ?? "-"}` +
                `/last${leg.latestGeometricDistinctRegister ?? "-"}` +
                `/rejoin${leg.earliestGeometricRejoinRegister ?? "-"}]`
              ))
              .join(",");
            return (
              `s${entry.startIndex + 1}:alt${entry.alternateShare ?? 0}` +
              `/geo${entry.geometricAlternateShare ?? 0}` +
              `/traj${entry.trajectoryOnlyAlternateShare ?? 0}` +
              (legs ? ` ${legs}` : "")
            );
          })
          .join(" | ");
        return `Traffic route-family starts: ${starts || "none"}`;
      })()
      : "Traffic route-family starts: n/a",
    currentNormalRouteModel
      ? `Estimate route cache: ${contextualCache?.estimatedLegCacheHits ?? 0} hits/${contextualCache?.estimatedLegSearches ?? 0} searches/${contextualCache?.estimatedLegWitnessesGenerated ?? 0} witnesses, exhaustive primary widenings ${contextualCache?.estimatedLegWidenedSearches ?? 0} [resumed ${contextualCache?.estimatedLegResumedWidenings ?? 0}, saved-root ~${contextualCache?.estimatedLegResumeSavedRootExpansions ?? 0}exp, replay ${contextualCache?.estimatedLegResumeReplayExpansions ?? 0}exp, fresh fallback ${contextualCache?.estimatedLegFreshExhaustiveFallbacks ?? 0}], exact realization direct/repaired/failed ${contextualCache?.exactRealizationDirectSuccesses ?? 0}/${contextualCache?.exactRealizationRepairedSuccesses ?? 0}/${contextualCache?.exactRealizationFailures ?? 0}`
      : (summary.contextualLegCache
        ? `Contextual leg cache: exactEntries ${summary.contextualLegCache.entries ?? 0}, templateEntries ${summary.contextualLegCache.templateEntries ?? 0}, exactHits ${summary.contextualLegCache.exactHits ?? 0}, templateHits ${summary.contextualLegCache.templateHits ?? 0}, misses ${summary.contextualLegCache.misses ?? 0}, templateFallbacks ${summary.contextualLegCache.templateFallbacks ?? 0}, cappedContexts ${summary.contextualLegCache.zeroRouteCapFailures ?? 0} across ${summary.contextualLegCache.zeroRouteFailureStarts ?? 0} starts, survivors ${summary.contextualLegCache.survivingStarts ?? "n/a"}/${summary.contextualLegCache.requiredSurvivingStarts ?? "n/a"}`
        : "Contextual leg cache: n/a"),
    summary.programmingScarcity
      ? `Programming supply: selected ${summary.programmingScarcity.selectedRoutes ?? 0} routes, Again used on ${summary.programmingScarcity.routesUsingAgain ?? 0} route(s)/${summary.programmingScarcity.totalAgainTurns ?? 0} turn(s), consecutive required-Again turns ${summary.programmingScarcity.consecutiveTurnAgainReuse ?? 0}, literal program violations ${summary.programmingScarcity.literalProgramViolations ?? 0}, rolling two-turn violations ${summary.programmingScarcity.rollingWindowViolations ?? 0}; exact ${summary.programmingScarcity.handSize ?? 9}-card hypergeometric availability penalty mean/max ${summary.programmingScarcity.meanCardAvailabilityPenalty ?? 0}/${summary.programmingScarcity.maxCardAvailabilityPenalty ?? 0}; card-scarcity scaling α=${summary.programmingScarcity.cardScarcityAdaptabilityFactor ?? 1}: mean/max ${summary.programmingScarcity.meanCardAvailabilityPenaltyRE ?? 0}/${summary.programmingScarcity.maxCardAvailabilityPenaltyRE ?? 0}RE vs raw-unscaled ${summary.programmingScarcity.meanCardAvailabilityPenaltyUncompressedRE ?? 0}/${summary.programmingScarcity.maxCardAvailabilityPenaltyUncompressedRE ?? 0}RE; normal 9-card fresh-deck reference P(1 of 4-copy) ${summary.programmingScarcity.baselineFourCopyProbability ?? "?"}, active P(singleton) ${summary.programmingScarcity.singleCopyProbability ?? "?"}, P(3 distinct singletons) ${summary.programmingScarcity.threeDistinctSingleCopyProbability ?? "?"}, P(repeated 4-copy action incl Again) ${summary.programmingScarcity.repeatedFourCopyWithAgainProbability ?? "?"}`
      : "Programming supply: n/a",
    summary.programmingScarcity
      ? `Card scarcity ownership v49ek LIVE/PROVISIONAL: hand ${summary.programmingScarcity.handSize ?? 9}; previous-turn depletion ${summary.programmingScarcity.rollingPreviousTurnDepletion ? "ON" : "OFF"}; reset-each-turn ${summary.programmingScarcity.resetProgrammingDeckEachTurn ? "ON" : "OFF"}; α base ${summary.programmingScarcity.cardScarcityBaseAdaptabilityFactor ?? "?"} + Shared Deck player-count increment ${summary.programmingScarcity.sharedDeckAdaptabilityIncrement ?? 0} = ${summary.programmingScarcity.cardScarcityAdaptabilityFactor ?? 1}; enlarged shared deck OFF; cross-robot hand state OFF; exact single-player hypergeometry retained; normal 9-card P4/P-1 normalization retained; half-baseline raw +1RE -> scaled +${summary.programmingScarcity.halfBaselineScaledScarcityRE ?? "?"}RE`
      : "Card scarcity ownership v49ek LIVE/PROVISIONAL: n/a",
    summary.programmingScarcity?.discoveredCandidateCardPressure
      ? (() => {
        const audit = summary.programmingScarcity.discoveredCandidateCardPressure;
        const starts = (audit.starts ?? [])
          .map((entry) => (
            `s${entry.startIndex + 1}:sel ${entry.selectedRegisters}r/${entry.selectedCardRE}RE` +
            ` same ${entry.sameRegisterCandidateCount}cand best${entry.bestSameRegisterCardRE ?? "-"}RE` +
            ` Δ${entry.sameRegisterReducibleRE ?? 0}` +
            ` <=r best${entry.bestSameOrFewerCardRE ?? "-"}RE@${entry.bestSameOrFewerRegisters ?? "-"}r` +
            ` Δ${entry.sameOrFewerReducibleRE ?? 0}`
          ))
          .join(" | ");
        return (
          `Card-pressure candidate audit v49ce OBSERVATIONAL (DISCOVERED CANDIDATES ONLY): ` +
          `${audit.auditedStarts ?? 0} starts; same-register alternatives on ` +
          `${audit.startsWithSameRegisterAlternative ?? 0}, lower-card same-register candidate on ` +
          `${audit.startsWithLowerCardSameRegisterCandidate ?? 0}, lower-card same-or-fewer candidate on ` +
          `${audit.startsWithLowerCardSameOrFewerCandidate ?? 0}; mean selected card ${audit.meanSelectedCardRE ?? 0}RE, ` +
          `mean reducible same-register ${audit.meanSameRegisterReducibleRE ?? 0}RE, max ` +
          `${audit.maximumSameRegisterReducibleRE ?? 0}RE` +
          `${Number.isInteger(audit.maximumSameRegisterReducibleStartIndex) ? ` at s${audit.maximumSameRegisterReducibleStartIndex + 1}` : ""}; ` +
          `${starts || "no audited starts"}`
        );
      })()
      : "Card-pressure candidate audit v49ce OBSERVATIONAL: unavailable",
    scenario.generationDiagnostics?.cheapProgramUnionAvailabilityTotals
      ? (() => {
        const unionCache = scenario.generationDiagnostics.cheapProgramUnionAvailabilityTotals;
        const hitRate = unionCache.requests
          ? Math.round((unionCache.hits / unionCache.requests) * 100)
          : 0;
        return `Search card union cache v49ay: ${unionCache.hits}/${unionCache.requests} hits (${hitRate}%), ${unionCache.misses} misses, ${unionCache.subsetTerms ?? 0} inclusion-exclusion term(s), ${formatGenerationDuration(unionCache.missComputeMs ?? 0)} miss-compute, ${unionCache.cacheEntries ?? 0} cached union state(s); ROUTING ACTIVE for programming-card pressure.`;
      })()
      : "Search card union cache v49ay: telemetry unavailable.",
    scenario.generationDiagnostics?.cheapProgramFrontierUnionPenaltyTotals
      ? (() => {
        const memo =
          scenario.generationDiagnostics.cheapProgramFrontierUnionPenaltyTotals;
        const hitRate = memo.requests
          ? Math.round((memo.hits / memo.requests) * 100)
          : 0;
        return `Search frontier union memo v49ay: ${memo.hits}/${memo.requests} hits (${hitRate}%), ${memo.misses} misses, ${memo.cacheEntries ?? 0} cached frontier state-set(s); behavior-equivalent memo above the union cache.`;
      })()
      : "Search frontier union memo v49ay: telemetry unavailable.",
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
        ? `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) fullCourse intrinsic ${startAnalysis.fullCourseRoute?.score ?? selected.score}, traffic ${startAnalysis.fullCourseTrafficPenalty ?? 0}, legacyBalance ${startAnalysis.balanceScore ?? "n/a"}, effectiveRE ${Number.isFinite(startAnalysis.normalFairnessEffectiveRE) ? Number(startAnalysis.normalFairnessEffectiveRE).toFixed(3) : "n/a"}${energyCost}${courseEstimate}, distance ${startAnalysis.fullCourseRoute?.distance ?? selected.distance}, actions ${startAnalysis.fullCourseRoute?.actions ?? selected.actions}, hazard ${startAnalysis.fullCourseRoute?.hazard ?? selected.hazard}${outlierReason}`
        : `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) route ${startAnalysis.selectedRouteIndex + 1}/${startAnalysis.routes.length} ${adjustedLabel} ${startAnalysis.adjustedScore}${energyCost}${courseEstimate} raw ${selected.score} traffic ${startAnalysis.trafficPenalty} ranged ${startAnalysis.trafficRanged ?? startAnalysis.rearThreat ?? 0} nearby ${startAnalysis.trafficNearby ?? startAnalysis.lateralThreat ?? 0} competition ${startAnalysis.trafficCompetition ?? startAnalysis.overlapPenalty ?? 0} occupancy-scale ${startAnalysis.trafficScale ?? 0} distance ${selected.distance} actions ${selected.actions} forced ${selected.forcedDistance} hazard ${selected.hazard}${selected.movingTarget ? ` hit flag ${selected.movingTarget.checkpointId} space ${selected.movingTarget.space ?? "?"}` : ""}${outlierReason}`
    );
  }

  // v49aq: Copy All now includes the same observational unified-RE ledger that
  // clicked route detail already showed in v49ap. Keep this to retained usable
  // starts so the diagnostic export remains bounded while still exposing the
  // routes that actually define fairness/course play. Diagnostics only.
  const usableStartIndices = new Set(
    (scenario.metrics?.usableStarts ?? [])
      .map((item) => Number(item?.index))
      .filter(Number.isInteger)
  );
  const retainedReLedgers = (scenario.sequence?.firstLeg?.starts ?? [])
    .filter((startAnalysis) => usableStartIndices.has(startAnalysis.index))
    .map((startAnalysis) => ({
      startAnalysis,
      route: startAnalysis.fullCourseRoute ?? startAnalysis.selectedRoute ?? null
    }))
    .filter((entry) => entry.route);
  if (retainedReLedgers.length) {
    lines.push("", "Observational RE ledgers (retained usable starts):");
    for (const { startAnalysis, route } of retainedReLedgers) {
      lines.push(`RE start #${startAnalysis.index + 1}:`);
      lines.push(...formatRegisterEquivalentLedgerLines(
        scenario,
        route,
        startAnalysis.index,
        { timing: devTiming, replayCache }
      ));
    }
  }

  lines.push(...buildDamageFoundationReportLines(scenario, {
    replayCache,
    timing: devTiming
  }));
  const reportTotalMs = Number.isFinite(reportStartedAt) ? performance.now() - reportStartedAt : 0;
  scenario.devPerformance = {
    ...(scenario.devPerformance ?? {}),
    lastDeepReportMs: reportTotalMs,
    lastLedgerReplayMs: devTiming.ledgerMs,
    lastCheapShadowMs: devTiming.cheapShadowMs,
    lastDamageFoundationMs: devTiming.damageFoundationMs
  };
  lines.push(
    "",
    `Dev diagnostics timing v49de: deep report ${formatDevMilliseconds(reportTotalMs)}; RE-turn production metric reuse ${formatDevMilliseconds(devTiming.reDifficultyMs)}; candidate-pool metric reuse ${formatDevMilliseconds(devTiming.reDifficultyPoolMs)}; Dev-added RE-turn route replay ${formatDevMilliseconds(devTiming.reDifficultyReplayMs)}; authoritative RE ledgers ${formatDevMilliseconds(devTiming.ledgerMs)}; cheap-card comparison ${formatDevMilliseconds(devTiming.cheapShadowMs)}; damage foundation ${formatDevMilliseconds(devTiming.damageFoundationMs)}.`
  );

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
  generationStartedAt: 0,
  acceptableCandidateTarget: 1,
  acceptableCandidatesFound: 0,
  slowTimerId: null
};

const GENERATION_SLOW_STAGE_MS = Object.freeze({
  rehydrate: 2800,
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

// Coarse player-facing route-work wording from the closed v47 calibration.
// The checkpoint-known route-work diagnostics observed about 9.5k expansions at
// the median and 34.9k at p90. These bands are presentation only: they never
// change search budgets, proposal ranking, legality, acceptance, or timing.
const V47_ROUTE_WORK_DISPLAY_BANDS = Object.freeze({
  medianExpansions: 9502,
  p90Expansions: 34912
});

function getCalibratedRouteWorkOverlayHint(stage = "") {
  const match = String(stage || "").match(/~([0-9][0-9,]*)\s+route expansions/i);
  if (!match) return "";
  const predictedExpansions = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(predictedExpansions)) return "";

  if (predictedExpansions < V47_ROUTE_WORK_DISPLAY_BANDS.medianExpansions) {
    return "This layout looks fairly straightforward to check.";
  }
  if (predictedExpansions <= V47_ROUTE_WORK_DISPLAY_BANDS.p90Expansions) {
    return "";
  }
  return "This layout may take longer than usual to check.";
}

function classifyGenerationStage(stage = "", stageContext = null) {
  const raw = String(stage || "").toLowerCase();
  if (raw.includes("reanalyzing saved course") || raw.includes("saved course reanalysis")) return "rehydrate";
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
  if (
    raw.includes("difficulty") || raw.includes("length") || raw.includes("final fit") ||
    raw.includes("final classification") || raw.includes("finalizing") ||
    raw.includes("guidance") || raw.includes("finishing") || raw.includes("candidate complete")
  ) return "finishing";
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
  if (key === "rehydrate") return "The saved layout is being checked with the current routing model. You can stop and keep its last-saved presentation.";
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
  if (key === "rehydrate") {
    heading = "Reanalyzing saved course";
    activity = "Rebuilding route, traffic, and balance analysis for the saved layout.";
  } else if (key === "retry") {
    heading = "Trying another layout";
    activity = "The previous layout did not work out, so another one is being tried.";
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

  const rawStage = String(stage || "").toLowerCase();
  const checkpointProposalMatch = String(stage || "").match(/proposal\s+(\d+)\s*\/\s*(\d+)/i);
  const checkedStartsMatch = String(stage || "").match(/(\d+) starting spaces? checked/i);
  const checkedStarts = checkedStartsMatch ? Number(checkedStartsMatch[1]) : null;
  const cleanupPassMatch = String(stage || "").match(/pass\s+(\d+)/i);
  const cleanupPass = cleanupPassMatch ? Number(cleanupPassMatch[1]) : null;
  if (key === "rehydrate") {
    const detail = String(stage || "").split("—").slice(1).join("—").trim();
    activity = detail || "Rebuilding route, traffic, and balance analysis for the saved layout.";
  } else if (rawStage.includes("choosing checkpoints") && checkpointProposalMatch) {
    heading = "Placing checkpoints";
    activity = `Checking checkpoint option ${Number(checkpointProposalMatch[1])} of ${Number(checkpointProposalMatch[2])} for this layout.`;
  } else if (rawStage.includes("checking route possibilities") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Checking the routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for possible routes.`;
  } else if (rawStage.includes("verifying playable routes") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Verifying the routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for playable routes.`;
  } else if (rawStage.includes("comparing route options") && checkedStarts) {
    heading = "Comparing route options";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for useful alternatives.`;
  } else if (rawStage.includes("checking opening routes") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Checking opening routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked.`;
  } else if (rawStage.includes("checking later routes") && checkedStarts) {
    const legMatch = String(stage || "").match(/leg\s+(\d+)/i);
    const legNumber = legMatch ? Number(legMatch[1]) : null;
    heading = slow ? "Checking some tricky routes" : "Checking later routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked${legNumber ? ` on route leg ${legNumber}` : ""}.`;
  } else if (
    rawStage.startsWith("checking routes —") ||
    rawStage.startsWith("comparing route options —")
  ) {
    // Cooperative route-search slices are genuine liveness evidence, but they do
    // not represent a percentage or completed-start count. Surface their restrained
    // ticker text instead of collapsing back to the generic route-stage sentence.
    const detail = String(stage || "").split("—").slice(1).join("—").trim();
    if (detail) {
      activity = `${detail.charAt(0).toUpperCase()}${detail.slice(1)}${/[.!?]$/.test(detail) ? "" : "."}`;
    }
  } else if (rawStage.includes("balancing routed starting choices")) {
    heading = "Balancing the starts";
    const balancePassMatch = String(stage || "").match(/pass\s+(\d+)\s+complete/i);
    const balanceCountMatch = String(stage || "").match(/(\d+)\s+starts?\s+remain/i);
    const balancePass = balancePassMatch ? Number(balancePassMatch[1]) : null;
    const balanceCount = balanceCountMatch ? Number(balanceCountMatch[1]) : null;
    activity = Number.isFinite(balanceCount)
      ? `${balanceCount} routed starting choice${balanceCount === 1 ? "" : "s"} remain${balancePass ? ` after balance pass ${balancePass}` : ""}.`
      : "Balancing the routed starting choices.";
  } else if (rawStage.includes("route fairness and removable pieces")) {
    heading = "Cleaning up the course";
    activity = cleanupPass
      ? `Starting cleanup pass ${cleanupPass}.`
      : "Starting a cleanup pass.";
  } else if (rawStage.includes("removable docks")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking docking areas.`;
  } else if (rawStage.includes("removable boards")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking boards.`;
  } else if (rawStage.includes("removable overlays")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking overlays.`;
  } else if (rawStage.includes("cleanup pass")) {
    heading = "Cleaning up the course";
    activity = cleanupPass
      ? `Cleanup pass ${cleanupPass} complete.`
      : "Cleanup pass complete.";
  } else if (rawStage.includes("recomputing retained course guidance")) {
    heading = "Rechecking the course";
    activity = "Updating the retained layout guidance after cleanup.";
  } else if (rawStage.includes("recomputing retained checkpoint guidance")) {
    heading = "Rechecking the course";
    activity = "Updating checkpoint guidance for the retained layout.";
  } else if (rawStage.includes("final classification complete")) {
    heading = "Finishing the course";
    activity = "The final fit check is complete; preparing the course result.";
  } else if (rawStage.includes("finalizing course details")) {
    heading = "Finishing the course";
    activity = "Assembling the final course details.";
  }

  return {
    key,
    heading,
    activity,
    slow,
    calibratedWorkHint: getCalibratedRouteWorkOverlayHint(stage),
    slowHint: slow ? getGenerationSlowHint(key, stageContext) : ""
  };
}

function setGenerationStopControlState(requested = false, hasRetainableCandidate = generationHasRetainableCandidate) {
  const button = document.getElementById("use-best-so-far");
  if (!button) return;
  button.disabled = Boolean(requested);
  button.textContent = requested
    ? "Stopping…"
    : hasRetainableCandidate
      ? "Use Best So Far"
      : "Stop";
  button.setAttribute("aria-disabled", requested ? "true" : "false");
}

function setGenerationRetainedCandidateProgress(found, target) {
  generationOverlayState.acceptableCandidatesFound = Math.max(0, Math.floor(Number(found) || 0));
  generationOverlayState.acceptableCandidateTarget = Math.max(1, Math.floor(Number(target) || 1));
  generationHasRetainableCandidate = generationOverlayState.acceptableCandidatesFound > 0;
  setGenerationStopControlState(generationStopRequested);
  renderGeneratingOverlayState();
}

function requestGenerationStop() {
  if (!isGenerating || generationStopRequested) return;
  generationStopRequested = true;
  setGenerationStopControlState(true);
}

function updateGeneratingOverlayText(element, text) {
  if (!element || element.textContent === text) return;
  element.textContent = text;
  element.classList.remove("overlay-copy-refresh");
  void element.offsetWidth;
  element.classList.add("overlay-copy-refresh");
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

  updateGeneratingOverlayText(headingEl, userState.heading);
  if (attemptEl) {
    attemptEl.textContent = generationOverlayState.semanticKey === "rehydrate"
      ? "Saved course"
      : `Course attempt ${Math.max(1, generationOverlayState.attempt)} / ${generationOverlayState.maxAttempts}`;
  }
  updateGeneratingOverlayText(activityEl, userState.activity);
  if (hintEl) {
    const hint = userState.calibratedWorkHint || userState.slowHint || getGenerationConstraintHint(generationOverlayState.preferences ?? {});
    updateGeneratingOverlayText(hintEl, hint);
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
    generationStartedAt: details.generationStartedAt ?? generationOverlayState.generationStartedAt ?? now,
    acceptableCandidateTarget: details.acceptableCandidateTarget ?? generationOverlayState.acceptableCandidateTarget ?? 1,
    acceptableCandidatesFound: details.acceptableCandidatesFound ?? generationOverlayState.acceptableCandidatesFound ?? 0,
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

function pageIsDevViewEnabled() {
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

function getRouteInspectionEntryForStart(scenario, selectedLegIndices, startIndex) {
  const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
  const fullRoute = startAnalysis?.fullCourseRoute;
  if (!fullRoute) return null;
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const singleLegIndex = normalizedLegs.length === 1 ? normalizedLegs[0] : null;
  // When more than one leg is selected, inspect one coherent route: the selected
  // full-course route. The map can still trace any subset of legs independently.
  const route = singleLegIndex === null ? fullRoute : fullRoute.legRoutes?.[singleLegIndex];
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
    label: singleLegIndex === null
      ? `Start ${startIndex + 1}${statusText} — selected full-course route`
      : `Start ${startIndex + 1}${statusText} — ${formatLegLabel(scenario.sequence.legs[singleLegIndex])}`,
    route,
    startAnalysis,
    outlierInfo,
    prunedStatus,
    singleLegIndex,
    normalizedLegs
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
  let previousAbsoluteRegister = startAction;
  route.transitions.forEach((transition, index) => {
    const fallbackAbsoluteRegister = startAction + index + 1;
    const absoluteRegister = Number.isFinite(Number(transition?.absoluteAction))
      ? Number(transition.absoluteAction)
      : fallbackAbsoluteRegister;
    const turnNumber = Math.floor((absoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
    const registerInTurn = ((absoluteRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;

    const expectedNextRegister = previousAbsoluteRegister + 1;
    if (absoluteRegister > expectedNextRegister) {
      const skipped = absoluteRegister - expectedNextRegister;
      const priorTurn = Math.floor((previousAbsoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
      const firstSkippedRegister = ((expectedNextRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;
      const lastSkippedRegister = ((absoluteRegister - 2) % ROUTE_TRACE_REGISTER_COUNT) + 1;
      const priorTransition = route.transitions[index - 1] ?? null;
      lines.push(
        priorTransition?.rebooted
          ? `──────── REBOOT ended turn ${priorTurn}; skipped ${skipped} register${skipped === 1 ? "" : "s"} (R${firstSkippedRegister}${lastSkippedRegister !== firstSkippedRegister ? `–R${lastSkippedRegister}` : ""}); start turn ${turnNumber} ────────`
          : `──────── elapsed-register gap ${previousAbsoluteRegister}→${absoluteRegister}; start turn ${turnNumber} ────────`
      );
    }
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
    if (transition?.rebooted) pieces.push("REBOOT → turn ends");
    lines.push(pieces.join(" → "));

    if (registerInTurn === ROUTE_TRACE_REGISTER_COUNT && index < route.transitions.length - 1) {
      lines.push(`──────── end turn ${turnNumber} / start turn ${turnNumber + 1} ────────`);
    }
    previousAbsoluteRegister = absoluteRegister;
  });

  return lines;
}

function formatRegisterEquivalentLedgerLines(scenario, route, startIndex = null, devOptions = {}) {
  if (!route) return [];
  const traceTileMap = scenario?.goalTileMap ?? null;
  if (!traceTileMap || typeof summarizeRegisterEquivalentLedger !== "function") return [];
  const replayCache = devOptions.replayCache ?? getScenarioDevReplayCache(scenario);
  const damageOptions = getDamageFoundationScenarioOptions(scenario);
  const trafficContext = getDamageFoundationTrafficContext(scenario, startIndex);
  const ledgerStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const reLedger = getCachedRouteReplay(
    replayCache?.ledgerByRoute,
    route,
    () => summarizeRegisterEquivalentLedger(
      traceTileMap,
      route,
      damageOptions,
      trafficContext
    )
  );
  addDevTiming(devOptions.timing, "ledgerMs", ledgerStartedAt);
  if (!reLedger) return [];

  const lines = [
    `RE ledger v3: registers ${reLedger.programmedRegisterRE} + lost-register tempo ${reLedger.lostRegisterTempoRE}; card ${reLedger.cleanCardPlausibilityRE} + damage-card supply ${reLedger.damageCardSupplyRE}; clog ${reLedger.clogRE}; Energy ${reLedger.energyRE}; mental ${reLedger.mentalRegisterEquivalents}; known subtotal ${reLedger.knownMechanismSubtotalRE} -> +mental ${reLedger.observationalSubtotalWithMentalRE} RE; Homing Missile activations ${reLedger.homingMissileActivationCount ?? 0}, neutral one-damage reference ${reLedger.homingMissileOneDamageReferenceRE ?? 0}RE, strategic credit ${reLedger.homingMissileStrategicCreditRE ?? 0}RE applied separately to route value (not intrinsic difficulty), cheap-search guidance ${reLedger.homingMissileCheapSearchGuidanceScore ?? 0} score only. Mental curve is PROVISIONAL; intrinsic factual planning-event RE is POST-BUILD ROUTE SCORING in v49ce (not pathfinder state) (rounded turn events: <=7 => 0 RE, 11 => 0.5, 15 => 2, 19 => 4.5). Traffic-awareness mental is downstream: robot-laser hit probability plus one collapsed fractional non-laser control-awareness event per turn plus simultaneous-reboot awareness; mechanical damage/control consequence is priced separately. Avoided static constraints remain uncaptured.`
  ].filter(Boolean);
  (reLedger.turns || []).forEach((turn) => {
    const eventTypes = (turn.planningEvents || []).map((event) => (
      Math.abs((Number(event.weight) || 0) - 1) > 0.0005
        ? `${event.type}×${Number(event.weight).toFixed(2)}`
        : event.type
    ));
    lines.push(
      `  RE T${turn.turn}: reg ${turn.programmedRegisterRE}${turn.lostRegisterTempoRE ? ` + lost ${turn.lostRegisterTempoRE}` : ""}; card ${turn.cleanCardPlausibilityRE} + damage-supply ${turn.damageCardSupplyRE}; clog ${turn.clogRE}; Energy ${turn.energyRE}; mental ${turn.mentalRegisterEquivalents}; known ${turn.knownMechanismSubtotalRE} -> obs ${turn.observationalSubtotalWithMentalRE}; planning events ${turn.planningEventRawCount} -> rounded ${turn.planningEventRoundedCount}${eventTypes.length ? ` [${eventTypes.join(", ")}]` : ""}`
    );
  });

  if (typeof summarizeCheapSearchRegisterEquivalentShadow === "function") {
    const cheapStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
    const cheapShadow = getCachedRouteReplay(
      replayCache?.cheapShadowByRoute,
      route,
      () => summarizeCheapSearchRegisterEquivalentShadow(
        traceTileMap,
        route,
        damageOptions,
        trafficContext,
        reLedger
      )
    );
    addDevTiming(devOptions.timing, "cheapShadowMs", cheapStartedAt);
    if (cheapShadow) {
      const signed = (value) => {
        const numeric = Number(value) || 0;
        return `${numeric >= 0 ? "+" : ""}${numeric}`;
      };
      lines.push(
        `  Routing-card comparison v49dc: routing-active union core ${cheapShadow.routedUnionCoreRE} RE vs exact-comparable ${cheapShadow.exactComparableCoreRE} (${signed(cheapShadow.comparableCoreDeltaRE)}); union card ${cheapShadow.unionFrontierCardRE} RE vs exact ${cheapShadow.exactCleanCardRE} RE (${signed(cheapShadow.unionFrontierCardDeltaRE)}); Energy ${cheapShadow.energyRE} routing-active; intrinsic mental ${cheapShadow.cheapIntrinsicMentalRE} completed-route, traffic-awareness mental +${cheapShadow.trafficMentalIncrementRE} downstream -> full ${cheapShadow.fullMentalRE}; damage-supply ${cheapShadow.deferredDamageSupplyRE} + clog ${cheapShadow.deferredClogRE} deferred to authoritative replay; full observational route ${cheapShadow.fullObservationalRE} RE.`,
        `    Routing-card union by turn: ${(cheapShadow.unionFrontierCardTurnComparison || []).map((turn) => `T${turn.turn} ${turn.unionFrontierCardRE}/${turn.exactCardRE} (${signed(turn.deltaRE)})`).join(", ") || "none"}; max |turn delta| ${cheapShadow.maxAbsUnionFrontierCardTurnDeltaRE ?? 0} RE; retained end states ${cheapShadow.unionFrontierCardRetainedStates ?? 0}${cheapShadow.unionFrontierCardFeasible === false ? "; infeasible" : ""}.`
      );
    }
  }
  if (Number.isFinite(Number(route.searchIntrinsicMentalRegisterEquivalents))) {
    lines.push(
      `  Completed-route intrinsic mental v49ce: ${Number(route.searchIntrinsicMentalRegisterEquivalents || 0).toFixed(4)} RE / ${Number(route.searchIntrinsicMentalScore || 0).toFixed(2)} score POST-BUILD RERANK ACTIVE; NOT pathfinder state; intrinsic event weight ${Number(route.searchIntrinsicMentalEventWeight || 0).toFixed(4)}, turn carry ${Number(route.searchIntrinsicMentalEventCountStart || 0).toFixed(4)} -> ${Number(route.searchIntrinsicMentalEventCountEnd || 0).toFixed(4)}. Energy remains routing-active through the existing flattened negative-RE economy.`
    );
  }
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
    `${entry.label}: ${route.actions} register${route.actions === 1 ? "" : "s"}, distance ${route.distance}, forced ${route.forcedDistance}, route score ${route.score}`,
    ...formatChronologicalRouteTrace(route, traceTileMap)
  ];

  // v49aq: one shared formatter owns observational RE diagnostics for both the
  // clicked route and Copy All, preventing the two Dev surfaces from drifting.
  lines.push(...formatRegisterEquivalentLedgerLines(
    scenario,
    route,
    entry?.startAnalysis?.index
  ));

  // v49ac-traffic-mixture: selected-route raw damage remains visible beside the
  // chronological trace, while raw damage-economy RE is the route-selection
  // input. The trace still does not pretend to know literal future hands/register cards.
  if (traceTileMap && typeof summarizeDamageEconomyFoundationForRoute === "function") {
    const replayCache = getScenarioDevReplayCache(scenario);
    const damageEconomy = getCachedRouteReplay(
      replayCache?.damageFoundationByRoute,
      route,
      () => summarizeDamageEconomyFoundationForRoute(
        traceTileMap,
        route,
        getDamageFoundationScenarioOptions(scenario),
        getDamageFoundationTrafficContext(scenario, entry?.startAnalysis?.index)
      )
    );
    if (damageEconomy) {
      lines.push(
        `Damage economy (${damageEconomy.method}, routing-active raw ledger): input ${damageEconomy.totalDamageUnits} = deterministic ${damageEconomy.deterministicDamageUnits} + robot-laser expected ${damageEconomy.robotLaserExpectedDamageUnits}; SPAM final total/held/circulating ${damageEconomy.finalSpamTotal}/${damageEconomy.finalSpamHeld}/${damageEconomy.finalSpamCirculating}; active/pending Haywire expected clog ${damageEconomy.finalActiveHaywireExpectedClogs}/${damageEconomy.finalPendingHaywireExpectedClogs}; AUTHORITATIVE raw damage-economy RE supply/clog/total ${damageEconomy.totalSpamSupplyRegisterEquivalents}/${damageEconomy.totalClogRegisterEquivalents}/${damageEconomy.totalDamageEconomyRegisterEquivalents} [supply base ${damageEconomy.totalRawSpamSupplyRegisterEquivalents ?? damageEconomy.totalSpamSupplyRegisterEquivalents}, Permanent-Shutdown +${damageEconomy.totalPermanentShutdownPressureRegisterEquivalents ?? 0}, max ×${damageEconomy.maxPermanentShutdownSupplyMultiplier ?? 1}]; max turn ${damageEconomy.maxTurnDamageEconomyRegisterEquivalents}; Shutdown tolerance diagnostic ${damageEconomy.shutdownEquivalentDamageScoreRegisterEquivalents} RE against ${damageEconomy.shutdownReferenceRegisterEquivalents} RE reference (NOT route cost)`
      );
      if (route.damageRoutingModel) {
        lines.push(
          `Damage routing: intrinsic raw damage economy ${route.intrinsicDamageEconomyRegisterEquivalents ?? 0} RE -> ${route.intrinsicDamageReplacementScore ?? 0} score; intrinsic adjustment ${route.intrinsicDamageRoutingAdjustmentScore ?? 0}. Shutdown reference ${route.intrinsicDamageShutdownReferenceRegisterEquivalents ?? damageEconomy.shutdownReferenceRegisterEquivalents ?? 5} RE is tolerance context only. Robot-laser damage is added through the later traffic comparison as marginal raw damage RE.`
        );
      }
      if (
        damageEconomy.shutdownThreatLevel === "high" ||
        damageEconomy.shutdownThreatLevel === "elevated"
      ) {
        const episodeText = damageEconomy.shutdownEquivalentEpisodeCount > 0
          ? `${damageEconomy.shutdownEquivalentEpisodeCount} counterfactual tolerance-threshold crossing(s) = ${damageEconomy.shutdownEquivalentRegisterEquivalents} RE${damageEconomy.shutdownEquivalentEpisodeTurns?.length ? ` after T${damageEconomy.shutdownEquivalentEpisodeTurns.join("/T")}` : ""}`
          : "no full Shutdown-tolerance threshold crossing";
        lines.push(
          `Shutdown tolerance: ${damageEconomy.shutdownThreatLevel.toUpperCase()} — ${episodeText}; residual ${damageEconomy.shutdownResidualRegisterEquivalents} RE; peak reference segment ${damageEconomy.shutdownThreatPeakSegmentRegisterEquivalents}/${damageEconomy.shutdownReferenceRegisterEquivalents} RE. Counterfactual benchmark only: no Shutdown is programmed, no 5-RE cap is applied, and actual damage/clog RE remains authoritative.`
        );
      }
      (damageEconomy.turns ?? [])
        .filter((turn) => (
          turn.spamTotalAtProgramming > 0 ||
          turn.expectedHaywireClogs > 0 ||
          turn.pendingSpamAddedThisTurn > 0 ||
          turn.reliefInitiations > 0
        ))
        .forEach((turn) => {
          lines.push(
            `  Damage T${turn.turn} programming: SPAM total/held/circ ${turn.spamTotalAtProgramming}/${turn.spamHeldAtProgramming}/${turn.spamCirculatingAtProgramming} -> effective held/circ ${turn.effectiveHeldSpam}/${turn.effectiveCirculatingSpam}; hand ${turn.baseHandSize}, fresh draw ${turn.expectedFreshDrawSlots}; expected SPAM drawn/in-hand ${turn.expectedSpamDrawn}/${turn.expectedSpamInHand}; program P clean/damaged ${turn.cleanProgramProbability}/${turn.damagedProgramProbability}; H clog ${turn.expectedHaywireClogs}; SPAM relief forced/elective ${turn.forcedSpamReliefInitiations}/${turn.electiveSpamReliefInitiations}, clog-bearing P0..P5 ${turn.spamPlayCountDistribution.join("/")} -> SPAM clog ${turn.spamPlayClogLoad}; Randomizer ${turn.randomizerStarts ?? 0} start(s) / +${turn.randomizerClogLoad ?? 0} clog / SPAM use forced/elective ${turn.randomizerForcedSpamOverlap ?? 0}/${turn.randomizerReliefInitiations ?? 0}; combined ${turn.expectedTotalControlClogLoad}; RE supply/clog/total ${turn.spamSupplyRegisterEquivalents}/${turn.clogRegisterEquivalents}/${turn.damageEconomyRegisterEquivalents} [supply base ${turn.rawSpamSupplyRegisterEquivalents ?? turn.spamSupplyRegisterEquivalents}, Permanent-Shutdown +${turn.permanentShutdownPressureRegisterEquivalents ?? 0} @burden${turn.permanentShutdownSpamBurden ?? 0} ×${turn.permanentShutdownSupplyMultiplier ?? 1}]; Shutdown-tolerance segment ${turn.shutdownThreatSegmentRegisterEquivalents}${turn.shutdownEquivalentEpisodeAfterTurn ? " -> threshold crossing" : ""}`
          );
          if (
            turn.reliefInitiations > 0 ||
            turn.pendingSpamAddedThisTurn > 0 ||
            turn.pendingHaywireExpectedForNextTurn > 0
          ) {
            lines.push(
              `    Relief/damage: tactical opportunity ${turn.reliefOpportunity}, SPAM initiation/removal ${turn.reliefInitiations}/${turn.spamRemoved}, Critical-SPAM ->pending ${turn.criticalSpamReturnedToPending ?? 0}; damage ${turn.totalDamageUnits} = deterministic ${turn.deterministicDamageUnits} + robot-laser expected ${turn.robotLaserExpectedDamageUnits}; reboot ${turn.rebootRegister ? `R${turn.rebootRegister}, SPAM dump ${turn.rebootSpamRemoved}/${turn.rebootSpamDisposalCapacity}, active-H clear ${turn.rebootHaywireCleared}` : "none"}; repair ${turn.repairStationReliefCount ? `${turn.repairStationReliefCount}x, SPAM -${turn.repairStationSpamRemoved}, H-exp -${turn.repairStationHaywireExpectedRemoved}` : "none"}; held end ${turn.spamHeldAtTurnEnd}; pending next SPAM/Haywire ${turn.pendingSpamAtTurnEnd}/${turn.pendingHaywireExpectedForNextTurn}; H register risks ${turn.pendingHaywireRegisterRisks.join("/")}`
            );
          }
        });
    }
  }
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

  if (
    Number.isFinite(Number(route.routeEnergyShadowReserveStart)) ||
    Number.isFinite(Number(route.routeEnergyShadowReserveEnd)) ||
    Math.abs(Number(route.routeEnergyEconomyRewardScore) || 0) > 0.005
  ) {
    const startReserve = Number.isFinite(Number(route.routeEnergyShadowReserveStart))
      ? Number(route.routeEnergyShadowReserveStart).toFixed(2)
      : "n/a";
    const endReserve = Number.isFinite(Number(route.routeEnergyShadowReserveEnd))
      ? Number(route.routeEnergyShadowReserveEnd).toFixed(2)
      : "n/a";
    lines.push(
      `Energy economy: reserve ${startReserve} → ${endReserve}; route utility ${Number(route.routeEnergyEconomyRewardScore || 0).toFixed(2)} score`
    );
  }

  if (route.hazard || route.rebootCount || route.conveyorComplexity) {
    lines.push(`Pressure: hazard ${route.hazard}, conveyor diagnostic ${route.conveyorComplexity}, reboots ${route.rebootCount}`);
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
  details.append(wrapTableForScroll(table));
}

// Dev View tables have many columns. On a phone they would be clipped, so each
// sits in a container that scrolls sideways when the table is wider than the
// screen; on wider screens nothing changes.
function wrapTableForScroll(table) {
  const wrapper = document.createElement("div");
  wrapper.className = "dev-table-scroll";
  wrapper.append(table);
  return wrapper;
}

function appendInspectionDetails(parent, title, { open = false } = {}) {
  const details = document.createElement("details");
  details.open = open;
  details.style.margin = "0.5rem 0";
  const summary = document.createElement("summary");
  summary.textContent = title;
  summary.style.cursor = "pointer";
  summary.style.fontWeight = "600";
  details.append(summary);
  parent.append(details);
  return details;
}

function appendInspectionTable(parent, headers, rows, options = {}) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = options.fontSize ?? "0.9em";
  table.style.margin = "0.35rem 0";
  if (headers?.length) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      th.style.textAlign = "left";
      th.style.padding = "0.22rem 0.35rem";
      th.style.borderBottom = "1px solid currentColor";
      tr.append(th);
    });
    thead.append(tr);
    table.append(thead);
  }
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value ?? "";
      td.style.padding = "0.22rem 0.35rem";
      td.style.verticalAlign = "top";
      td.style.borderBottom = "1px solid rgba(127,127,127,0.25)";
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  parent.append(wrapTableForScroll(table));
  return table;
}

function getInspectionRouteLedger(scenario, route, startIndex) {
  const traceTileMap = scenario?.goalTileMap ?? null;
  if (!traceTileMap || !route || typeof summarizeRegisterEquivalentLedger !== "function") return null;
  const replayCache = getScenarioDevReplayCache(scenario);
  return getCachedRouteReplay(
    replayCache?.ledgerByRoute,
    route,
    () => summarizeRegisterEquivalentLedger(
      traceTileMap,
      route,
      getDamageFoundationScenarioOptions(scenario),
      getDamageFoundationTrafficContext(scenario, startIndex)
    )
  );
}

function buildInspectionTraceRows(route, tileMap) {
  if (!route?.transitions?.length) return [];
  const startAction = route.absoluteStartAction ?? 0;
  const checkpointHits = Array.isArray(route.checkpointHits)
    ? route.checkpointHits
    : route.checkpointHit ? [route.checkpointHit] : [];
  const hitsByAction = new Map();
  checkpointHits.forEach((hit) => {
    const absoluteAction = hit.action ?? route.absoluteActions;
    if (!Number.isFinite(absoluteAction)) return;
    const list = hitsByAction.get(absoluteAction) ?? [];
    list.push(hit);
    hitsByAction.set(absoluteAction, list);
  });

  const rows = [];
  route.transitions.forEach((transition, index) => {
    const absoluteRegister = Number.isFinite(Number(transition?.absoluteAction))
      ? Number(transition.absoluteAction)
      : startAction + index + 1;
    const turn = Math.floor((absoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
    const register = ((absoluteRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;
    const program = transition?.programCard === "AGAIN"
      ? `${transition.action} (AGAIN)`
      : transition?.action || transition?.programCard || "?";
    const move = `${formatTraceState(transition.from)} → ${formatTraceState(transition.to)}`;
    const timedParts = getTimedFeatureTraceParts(tileMap, transition, register);
    const hasTimedPusherMove = timedParts.some((part) => part.includes("pusher") && part.includes("ACTIVE → pushed"));
    const boardParts = (transition.boardEvents || [])
      .filter((event) => !(event.type === "pusher" && hasTimedPusherMove))
      .map(formatBoardTraceEvent)
      .filter(Boolean);
    if (!boardParts.length && (transition.conveyorSteps || []).length) {
      boardParts.push(...transition.conveyorSteps.map((step) => formatBoardTraceEvent({ type: "conveyor", ...step })).filter(Boolean));
    } else if (!boardParts.length && transition.gearTurned) {
      boardParts.push("gear turn");
    }
    const hits = hitsByAction.get(absoluteRegister) ?? [];
    const effects = [
      ...boardParts,
      ...timedParts,
      ...hits.map((hit) => `FLAG ${hit.checkpointId ?? hit.checkpointIndex + 1}`),
      ...(transition?.rebooted ? ["REBOOT → turn ends"] : [])
    ];
    rows.push({ absoluteRegister, turn, register, program, move, effects: effects.join("; ") || "—" });
  });
  return rows;
}

function renderInspectionTraceTable(parent, rows) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.88em";
  table.style.margin = "0.35rem 0";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["#", "Reg", "Program", "Movement", "Board / result"].forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.padding = "0.22rem 0.35rem";
    th.style.borderBottom = "1px solid currentColor";
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  let currentTurn = null;
  let tbody = null;
  rows.forEach((row) => {
    if (row.turn !== currentTurn) {
      currentTurn = row.turn;
      tbody = document.createElement("tbody");
      const turnRow = document.createElement("tr");
      const turnCell = document.createElement("th");
      turnCell.colSpan = 5;
      turnCell.textContent = `Turn ${row.turn}`;
      turnCell.style.textAlign = "left";
      turnCell.style.padding = "0.35rem";
      turnCell.style.borderTop = "1px solid currentColor";
      turnCell.style.borderBottom = "1px solid rgba(127,127,127,0.35)";
      turnRow.append(turnCell);
      tbody.append(turnRow);
      table.append(tbody);
    }
    const tr = document.createElement("tr");
    [row.absoluteRegister, `R${row.register}`, row.program, row.move, row.effects].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value ?? "";
      td.style.padding = "0.22rem 0.35rem";
      td.style.verticalAlign = "top";
      td.style.borderBottom = "1px solid rgba(127,127,127,0.2)";
      tr.append(td);
    });
    tbody?.append(tr);
  });
  parent.append(wrapTableForScroll(table));
}

function renderStructuredRouteInspection(detailEl, scenario, entry) {
  const route = entry?.route;
  if (!route) return;
  const startIndex = entry?.startAnalysis?.index;
  const ledger = getInspectionRouteLedger(scenario, route, startIndex);

  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = entry.label;
  title.append(strong);
  detailEl.append(title);

  const effectiveRE = Number(entry?.startAnalysis?.normalFairnessEffectiveRE);
  const traffic = Number(entry?.startAnalysis?.fullCourseTrafficPenalty ?? entry?.startAnalysis?.trafficPenalty ?? 0);
  const fullCourseDetail = route === entry?.startAnalysis?.fullCourseRoute;
  const overviewRows = [
    ["Registers", route.actions ?? "n/a", "Distance", route.distance ?? "n/a"],
    ["Forced movement", route.forcedDistance ?? 0, fullCourseDetail ? "Effective RE" : "Full-course effective RE", Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"],
    ["Card RE", ledger?.cleanCardPlausibilityRE ?? "n/a", "Mental RE", ledger?.mentalRegisterEquivalents ?? "n/a"],
    ["Damage supply RE", ledger?.damageCardSupplyRE ?? "n/a", "Clog RE", ledger?.clogRE ?? "n/a"],
    ["Energy RE", ledger?.energyRE ?? "n/a", "Detailed replay RE", ledger?.observationalSubtotalWithMentalRE ?? "n/a"]
  ];
  const summaryTable = document.createElement("table");
  summaryTable.style.width = "100%";
  summaryTable.style.borderCollapse = "collapse";
  summaryTable.style.fontSize = "0.92em";
  summaryTable.style.margin = "0.4rem 0";
  overviewRows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = document.createElement(index % 2 === 0 ? "th" : "td");
      cell.textContent = value;
      cell.style.textAlign = "left";
      cell.style.padding = "0.18rem 0.35rem";
      cell.style.verticalAlign = "top";
      if (index % 2 === 0) cell.style.whiteSpace = "nowrap";
      tr.append(cell);
    });
    summaryTable.append(tr);
  });
  detailEl.append(wrapTableForScroll(summaryTable));

  if (fullCourseDetail && entry?.startAnalysis?.normalFairnessComponents) {
    const components = entry.startAnalysis.normalFairnessComponents;
    const ownership = appendInspectionDetails(detailEl, "Effective RE ownership", { open: true });
    const ownershipNote = document.createElement("div");
    ownershipNote.style.fontSize = "0.88em";
    ownershipNote.style.margin = "0.3rem 0";
    ownershipNote.textContent = "This is the additive completed-route value used by Normal fairness and RE-native route-family occupancy. Detailed replay RE above is a chronological diagnostic replay and is not an independent score to add again.";
    ownership.append(ownershipNote);
    appendInspectionTable(ownership, ["Component", "RE"], [
      ["Intrinsic completed route", components.intrinsicRE ?? "n/a"],
      ["Robot-laser damage", components.robotLaserDamageRE ?? 0],
      ["Nearby control / displacement", components.nearbyControlRE ?? 0],
      ["Legacy ranged threat (production OFF)", components.residualRangedThreatRE ?? 0],
      ["Competition", components.competitionRE ?? 0],
      ["Traffic-awareness mental", components.trafficMentalRE ?? 0],
      ["Effective RE", Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"]
    ], { fontSize: "0.88em" });
  }

  const searchDiagnostics = appendInspectionDetails(detailEl, "Search / occupancy diagnostics", { open: false });
  const playerCount = Math.max(1, Number(scenario?.preferences?.playerCount ?? scenario?.playerCount ?? 1) || 1);
  const occupancyField = scenario?.sequence?.firstLeg?.summary?.fullCourseTraffic?.commonOccupancyField ?? null;
  appendInspectionTable(searchDiagnostics, ["Diagnostic", "Value"], [
    ["Search cost (this route)", Number.isFinite(Number(route.score)) ? Number(route.score).toFixed(2) : "n/a"],
    [fullCourseDetail ? "Traffic search pressure" : "Full-course traffic search pressure", Number.isFinite(traffic) ? traffic.toFixed(2) : "n/a"],
    ["Occupancy field total", Number.isFinite(Number(occupancyField?.totalWeight)) ? `${Number(occupancyField.totalWeight).toFixed(2)} expected robots` : `${playerCount.toFixed(2)} expected robots`],
    ["Other-player mass for this start", `${Math.max(0, playerCount - 1).toFixed(2)} expected robots`],
    ["Role", "Search/discovery diagnostics only; not an additional RE score"]
  ], { fontSize: "0.86em" });

  const traceDetails = appendInspectionDetails(detailEl, "Register trace", { open: true });
  const traceRows = buildInspectionTraceRows(route, scenario?.goalTileMap ?? null);
  renderInspectionTraceTable(traceDetails, traceRows);

  if (ledger) {
    const reDetails = appendInspectionDetails(detailEl, "Detailed RE replay by turn", { open: true });
    const reNote = document.createElement("div");
    reNote.style.fontSize = "0.88em";
    reNote.style.margin = "0.3rem 0";
    reNote.textContent = "Chronological route replay. Use Effective RE ownership above for the additive final route value; this table is the detailed turn-by-turn diagnostic.";
    reDetails.append(reNote);
    appendInspectionTable(
      reDetails,
      ["Turn", "Reg", "Card", "Damage supply", "Clog", "Energy", "Mental", "Observed RE", "Planning events"],
      (ledger.turns || []).map((turn) => [
        `T${turn.turn}`,
        turn.programmedRegisterRE,
        turn.cleanCardPlausibilityRE,
        turn.damageCardSupplyRE,
        turn.clogRE,
        turn.energyRE,
        turn.mentalRegisterEquivalents,
        turn.observationalSubtotalWithMentalRE,
        `${turn.planningEventRawCount} → ${turn.planningEventRoundedCount}`
      ]),
      { fontSize: "0.86em" }
    );
  }

  const secondary = appendInspectionDetails(detailEl, "Secondary / comparator diagnostics", { open: false });
  const secondaryBody = document.createElement("div");
  const secondaryHint = document.createElement("div");
  secondaryHint.style.margin = "0.3rem 0";
  secondaryHint.style.fontSize = "0.88em";
  secondaryHint.textContent = "Expand to compute cached comparator/shadow summaries. Full event-level text remains in Copy All.";
  secondaryBody.append(secondaryHint);
  secondary.append(secondaryBody);
  let secondaryLoaded = false;
  secondary.addEventListener("toggle", () => {
    if (!secondary.open || secondaryLoaded) return;
    secondaryLoaded = true;
    const secondaryLines = [];
    if (ledger && typeof summarizeCheapSearchRegisterEquivalentShadow === "function") {
      const replayCache = getScenarioDevReplayCache(scenario);
      const cheapShadow = getCachedRouteReplay(
        replayCache?.cheapShadowByRoute,
        route,
        () => summarizeCheapSearchRegisterEquivalentShadow(
          scenario.goalTileMap,
          route,
          getDamageFoundationScenarioOptions(scenario),
          getDamageFoundationTrafficContext(scenario, startIndex),
          ledger
        )
      );
      if (cheapShadow) {
        secondaryLines.push(
          `Routing-card comparator: routing-active union ${cheapShadow.unionFrontierCardRE} RE vs exact ${cheapShadow.exactCleanCardRE} RE.`,
          `Completed-route mental: intrinsic ${cheapShadow.cheapIntrinsicMentalRE} RE + traffic-awareness ${cheapShadow.trafficMentalIncrementRE} RE = ${cheapShadow.fullMentalRE} RE.`
        );
      }
    }
    if (typeof summarizeDamageEconomyFoundationForRoute === "function") {
      const replayCache = getScenarioDevReplayCache(scenario);
      const damage = getCachedRouteReplay(
        replayCache?.damageFoundationByRoute,
        route,
        () => summarizeDamageEconomyFoundationForRoute(
          scenario.goalTileMap,
          route,
          getDamageFoundationScenarioOptions(scenario),
          getDamageFoundationTrafficContext(scenario, startIndex)
        )
      );
      if (damage) {
        secondaryLines.push(
          `Damage economy: ${damage.totalDamageUnits} input units; supply/clog/total ${damage.totalSpamSupplyRegisterEquivalents}/${damage.totalClogRegisterEquivalents}/${damage.totalDamageEconomyRegisterEquivalents} RE.`,
          `Shutdown tolerance: ${damage.shutdownThreatLevel}; ${damage.shutdownEquivalentEpisodeCount ?? 0} threshold crossing(s). Counterfactual reference only.`
        );
      }
    }
    secondaryLines.push("Full event-level diagnostics remain available through Copy All.");
    secondaryBody.replaceChildren();
    secondaryLines.forEach((line) => {
      const row = document.createElement("div");
      row.style.margin = "0.25rem 0";
      row.textContent = line;
      secondaryBody.append(row);
    });
  });
}

function getSelectedInspectionStartIndices(scenario) {
  const traceable = new Set(getTraceableStartIndices(scenario));
  return [...traceSelectionState.startIndices]
    .filter((index) => traceable.has(index))
    .sort((left, right) => left - right);
}

function renderMultiStartInspectionSummary(detailEl, scenario, selectedLegIndices, startIndices) {
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const scopeLabel = normalizedLegs.length === 1
    ? formatLegLabel(scenario.sequence.legs[normalizedLegs[0]])
    : "Selected full-course routes";

  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${startIndices.length} visible starts — comparison summary`;
  title.append(strong);
  detailEl.append(title);

  const note = document.createElement("div");
  note.style.fontSize = "0.88em";
  note.style.margin = "0.3rem 0 0.5rem";
  note.textContent = `${scopeLabel}. Round-by-round detail is shown automatically when exactly one start is visible.`;
  detailEl.append(note);

  const rows = startIndices.map((startIndex) => {
    const entry = getRouteInspectionEntryForStart(scenario, selectedLegIndices, startIndex);
    if (!entry?.route) return null;
    const ledger = getInspectionRouteLedger(scenario, entry.route, startIndex);
    const effectiveRE = Number(entry.startAnalysis?.normalFairnessEffectiveRE);
    return [
      `#${startIndex + 1}`,
      entry.singleLegIndex === null ? "Full course" : formatLegLabel(scenario.sequence.legs[entry.singleLegIndex]),
      entry.route.actions ?? "n/a",
      entry.route.distance ?? "n/a",
      ledger?.cleanCardPlausibilityRE ?? "n/a",
      ledger?.mentalRegisterEquivalents ?? "n/a",
      ledger?.observationalSubtotalWithMentalRE ?? "n/a",
      Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"
    ];
  }).filter(Boolean);

  appendInspectionTable(
    detailEl,
    ["Start", "Scope", "Reg", "Dist", "Card RE", "Mental RE", "Detailed replay RE", "Full-course effective RE"],
    rows,
    { fontSize: "0.84em" }
  );
}

function updateInspectionDetail(scenario, selectedLegIndices) {
  const detailEl = document.getElementById("inspection-detail");
  if (!detailEl) return;

  const selectedStartIndices = scenario ? getSelectedInspectionStartIndices(scenario) : [];
  const checkpointFocused = Boolean(routeInspectionState.kind === "checkpoint");
  const visible = Boolean(
    scenario &&
    isDevViewEnabled() &&
    (checkpointFocused || selectedStartIndices.length)
  );
  detailEl.classList.toggle("hidden", !visible);
  detailEl.replaceChildren();
  if (!visible) return;

  if (checkpointFocused) {
    const lines = getCheckpointInspectionLines(scenario, Number(routeInspectionState.key));
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
    return;
  }

  if (selectedStartIndices.length === 1) {
    const focused = getRouteInspectionEntryForStart(
      scenario,
      selectedLegIndices,
      selectedStartIndices[0]
    );
    if (focused) renderStructuredRouteInspection(detailEl, scenario, focused);
    return;
  }

  if (selectedStartIndices.length > 1) {
    renderMultiStartInspectionSummary(detailEl, scenario, selectedLegIndices, selectedStartIndices);
  }
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
  toggle.textContent = frozen ? "Unfreeze" : "Freeze";
  renew.classList.toggle("hidden", !frozen);
  if (frozen && document.activeElement !== input) {
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
  }
  status.textContent = message;
  status.classList.toggle("hidden", !message);
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
  input.placeholder = "Test seed";
  input.value = "56BAC99D";
  input.setAttribute("aria-label", "Test seed");

  const apply = document.createElement("button");
  apply.id = "dev-generation-seed-apply";
  apply.type = "button";
  apply.textContent = "Use";

  const renew = document.createElement("button");
  renew.id = "dev-generation-seed-renew";
  renew.type = "button";
  renew.textContent = "New";

  const status = document.createElement("div");
  status.id = "dev-generation-seed-status";
  status.className = "hidden";

  const applyTypedSeed = () => {
    const parsed = parseDevGenerationSeed(input.value);
    if (!Number.isInteger(parsed)) {
      updateDevGenerationSeedControls("Use up to 8 hexadecimal digits.");
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

function pageIsDevRouteModelOverrideActive() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-route-model-override-toggle")?.checked);
}

function pageIsDevFastTrafficEnabled() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-fast-traffic-toggle")?.checked);
}

function pageIsDevFastAlternatesEnabled() {
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
        ? `round ceiling ${state.profile.trafficAlternateMaxNewSearchesPerEpoch ?? 0}, ${state.profile.trafficAlternateMaxNewSearchesTotal ?? 0} total bounded new search(es)`
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

// Dev View is offered only when the address contains ?dev (e.g. ?dev=1), to keep
// the ordinary interface uncluttered. It is presentation only: generation behaves
// the same either way, so the parameter unlocks nothing. Without it the checkbox
// is forced off, because browsers can restore a ticked checkbox on reload.
function applyDevViewAvailability() {
  if (typeof document === "undefined") return;
  const available = new URLSearchParams(location.search).has("dev");
  document.getElementById("dev-view-toggle-label")?.classList.toggle("hidden", !available);
  const checkbox = document.getElementById("dev-view");
  if (!available && checkbox) checkbox.checked = false;
}

function updateDevView() {
  ensureDevGenerationSeedControls();
  // Traffic/alternate-route experiment controls are intentionally no longer
  // surfaced in Dev View. The dormant override helpers remain below so this UI
  // cleanup does not alter the generation-mode mechanisms themselves.
  const enabled = isDevViewEnabled();
  if (enabled) {
    ensureCourseEvaluationReportElement();
  }
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
  document.getElementById("board-audit-toggle-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("dev-generation-seed-controls")?.classList.toggle("hidden", !enabled);
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

// A freshly generated or restored course starts by tracing every start that is
// in play (the retained, usable starts). Pruned outliers can still be added from
// the start picker, and a double-click on a trace selects every routable start.
function selectDefaultTraceStarts(scenario) {
  if (!scenario?.sequence?.firstLeg?.starts) {
    clearTraceStarts();
    return;
  }
  const traceable = new Set(getTraceableStartIndices(scenario));
  const usable = (scenario?.metrics?.usableStarts ?? [])
    .map((entry) => entry.index)
    .filter((index) => traceable.has(index));
  traceSelectionState = { startIndices: new Set(usable.length ? usable : traceable) };
}

function applyRouteInspection(inspection) {
  if (!inspection) {
    clearRouteInspection();
    return;
  }
  if (inspection.kind === "start") {
    const startIndex = Number(inspection.key);
    toggleTraceStart(startIndex);
    // Start-route evaluation is owned by the visible-start selection itself.
    // Do not retain a second "last clicked start" focus that can disagree with
    // the selected set. Checkpoint inspection remains explicit click state.
    clearRouteInspection();
    return;
  }
  routeInspectionState = sameInspection(routeInspectionState, inspection)
    ? { kind: null, key: null }
    : inspection;
}

function normalizeSelectedLegIndices(scenario, selectedLegIndices = null) {
  const legCount = scenario?.sequence?.legs?.length ?? 0;
  const provided = Array.isArray(selectedLegIndices)
    ? selectedLegIndices
    : selectedLegIndices === null || selectedLegIndices === undefined
      ? []
      : [selectedLegIndices];
  const normalized = [...new Set(provided
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < legCount))]
    .sort((left, right) => left - right);
  return normalized.length ? normalized : Array.from({ length: legCount }, (_, index) => index);
}

function getSelectedLegIndicesFromControl(scenario) {
  const legSelect = document.getElementById("leg-select");
  if (!legSelect || !isDevViewEnabled()) {
    return normalizeSelectedLegIndices(scenario, null);
  }
  const selected = [...legSelect.options]
    .filter((option) => option.selected)
    .map((option) => Number(option.value));
  return normalizeSelectedLegIndices(scenario, selected);
}

function getTracePickerSummary(prefix, selectedLabels, totalCount) {
  const lead = prefix ? `${prefix}: ` : "";
  if (!totalCount) return `${lead}None`;
  if (selectedLabels.length === totalCount) return `${lead}All (${totalCount})`;
  if (!selectedLabels.length) return `${lead}None`;
  if (selectedLabels.length <= 3) return `${lead}${selectedLabels.join(", ")}`;
  return `${lead}${selectedLabels.length}/${totalCount}`;
}

function styleDevPicker(details) {
  // Reuse the app's existing Sets / Optional Rules picker visual language.
  // The Dev pickers intentionally do not maintain a separate inline-styled UI.
  details.removeAttribute("style");
  details.className = "variant-picker dev-trace-picker";
}

function createDevPickerPanel() {
  const panel = document.createElement("div");
  panel.className = "variant-menu dev-trace-menu";
  return panel;
}

function ensureTraceLegPicker(scenario, legOptions) {
  const select = document.getElementById("leg-select");
  const parent = select?.parentElement;
  if (!select || !parent || !isDevViewEnabled()) {
    document.getElementById("trace-leg-picker")?.remove();
    return;
  }

  let details = document.getElementById("trace-leg-picker");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    details = document.createElement("details");
    details.id = "trace-leg-picker";
    parent.insertBefore(details, select);
  }
  details.replaceChildren();
  details.open = wasOpen;
  styleDevPicker(details);

  const selectedValues = new Set([...select.options].filter((option) => option.selected).map((option) => option.value));
  const selectedLabels = legOptions.filter((option) => selectedValues.has(option.value)).map((option) => option.label);
  const summary = document.createElement("summary");
  summary.textContent = getTracePickerSummary("", selectedLabels, legOptions.length);
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  details.append(summary);

  const panel = createDevPickerPanel();

  legOptions.forEach((option) => {
    const label = document.createElement("label");
    label.className = "variant-option dev-trace-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedValues.has(option.value);
    checkbox.addEventListener("change", () => {
      const target = [...select.options].find((item) => item.value === option.value);
      if (target) target.selected = checkbox.checked;
      // Preserve the established invariant that Trace Leg never has an accidental
      // empty state: if the last box is cleared, restore it immediately.
      if (![...select.options].some((item) => item.selected)) {
        if (target) target.selected = true;
      }
      if (currentScenario) renderScenarioKeepingMapInPlace(currentScenario);
    });
    label.append(checkbox, document.createTextNode(option.label));
    panel.append(label);
  });
  details.append(panel);
}

function ensureTraceStartPicker(scenario) {
  const legSelect = document.getElementById("leg-select");
  const parent = document.getElementById("trace-start-picker-host") ?? legSelect?.parentElement;
  if (!legSelect || !parent || !isDevViewEnabled()) {
    document.getElementById("trace-start-picker")?.remove();
    return;
  }

  const traceableIndices = getTraceableStartIndices(scenario);
  if (!traceableIndices.length) {
    document.getElementById("trace-start-picker")?.remove();
    return;
  }

  let details = document.getElementById("trace-start-picker");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    details = document.createElement("details");
    details.id = "trace-start-picker";
    if (parent === legSelect.parentElement) {
      parent.insertBefore(details, legSelect);
    } else {
      parent.append(details);
    }
  }
  details.replaceChildren();
  details.open = wasOpen;
  styleDevPicker(details);

  const selected = traceableIndices.filter((index) => traceSelectionState.startIndices.has(index));
  const selectedLabels = selected.map((index) => `#${index + 1}`);
  const summary = document.createElement("summary");
  summary.textContent = getTracePickerSummary("", selectedLabels, traceableIndices.length);
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  details.append(summary);

  const panel = createDevPickerPanel();

  traceableIndices.forEach((startIndex) => {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const start = startAnalysis?.start;
    const label = document.createElement("label");
    label.className = "variant-option dev-trace-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = traceSelectionState.startIndices.has(startIndex);
    checkbox.addEventListener("change", () => {
      const next = new Set(traceSelectionState.startIndices);
      if (checkbox.checked) next.add(startIndex);
      else next.delete(startIndex);
      traceSelectionState = { startIndices: next };
      // Changing the visible-start set returns Course Evaluation to its
      // selection-owned route detail/summary instead of leaving a checkpoint
      // inspection pinned beside a new route selection.
      clearRouteInspection();
      if (currentScenario) renderScenarioKeepingMapInPlace(currentScenario);
    });
    const status = startAnalysis?.reachable && startAnalysis?.fullCourseRoute ? "" : " (unavailable)";
    const coords = start ? ` (${start.x},${start.y})` : "";
    label.append(checkbox, document.createTextNode(`Start ${startIndex + 1}${coords}${status}`));
    panel.append(label);
  });
  details.append(panel);
}

function getSelectedTraceRoutes(scenario, selectedLegIndices) {
  const routes = [];
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const allLegsSelected = normalizedLegs.length === (scenario?.sequence?.legs?.length ?? 0);
  for (const startIndex of traceSelectionState.startIndices) {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const fullRoute = startAnalysis?.fullCourseRoute;
    if (!fullRoute) continue;
    if (allLegsSelected) {
      routes.push({ ...fullRoute, startIndex, traceIndex: startIndex });
      continue;
    }
    normalizedLegs.forEach((legIndex) => {
      const route = fullRoute.legRoutes?.[legIndex];
      if (!route) return;
      routes.push({ ...route, startIndex, traceIndex: startIndex, traceLegIndex: legIndex });
    });
  }
  return routes;
}

function tileTouchesVisibleTrace(scenario, tile, selectedLegIndices) {
  if (!tile) return false;
  return getSelectedTraceRoutes(scenario, selectedLegIndices).some((route) =>
    (route.path || []).some((point) => point.x === tile.x && point.y === tile.y)
  );
}


function getMapFeatureHighlightTargets(scenario) {
  const checkpointCount = getPlayableCheckpoints(
    scenario?.checkpoints ?? [],
    Boolean(scenario?.virtualBots)
  ).length;
  const overlayTileCount = (scenario?.placements ?? []).filter((placement) => (
    placement?.overlay && isMiniOverlayPiece(scenario?.pieceMap?.[placement.pieceId])
  )).length;
  const rebootTokenCount = (scenario?.rebootTokens ?? []).length;
  // No Docks and Virtual Bots replace the docks with fixed starting spaces.
  const fixedStartCount = scenario?.virtualBots
    ? (scenario.virtualBotEntry ? 1 : 0)
    : scenario?.noDocks
      ? (scenario.activeStarts ?? []).length
      : 0;

  return {
    checkpointCount,
    overlayTileCount,
    rebootTokenCount,
    fixedStartCount,
    hasTargets: checkpointCount > 0 || overlayTileCount > 0 || rebootTokenCount > 0 || fixedStartCount > 0
  };
}

function updateMapFeatureHighlightControl(scenario) {
  const controls = document.getElementById("map-highlight-controls");
  const button = document.getElementById("map-feature-highlight");
  if (!controls || !button) return;

  const targets = getMapFeatureHighlightTargets(scenario);
  controls.classList.toggle("hidden", !targets.hasTargets);
  if (!targets.hasTargets) {
    button.setAttribute("aria-pressed", "false");
    return;
  }

  const active = Boolean(mapFeatureHighlightEnabled);
  button.setAttribute("aria-pressed", active ? "true" : "false");

  if (active) {
    button.textContent = "Show full board";
    button.title = "Restore the board to normal brightness.";
    button.setAttribute("aria-label", "Show full board");
    return;
  }

  const targetNames = [
    targets.checkpointCount > 0 ? "checkpoints" : null,
    targets.rebootTokenCount > 0 ? "reboot tokens" : null,
    targets.fixedStartCount > 0 ? "starting spaces" : null,
    targets.overlayTileCount > 0 ? "overlay tiles" : null
  ].filter(Boolean);
  // A short label keeps the button narrow on phones; the tooltip lists everything.
  const label = targetNames.length === 1 ? `Highlight ${targetNames[0]}` : "Highlight key spaces";
  const targetDescription = targetNames.length > 1
    ? `${targetNames.slice(0, -1).join(", ")} and ${targetNames.at(-1)}`
    : targetNames[0];

  button.textContent = label;
  button.title = `Dim the rest of the course so ${targetDescription} are easier to spot.`;
  button.setAttribute("aria-label", label);
}

function getScenarioRenderState(scenario) {
  const devViewEnabled = isDevViewEnabled();
  const selectedLegIndices = devViewEnabled
    ? getSelectedLegIndicesFromControl(scenario)
    : normalizeSelectedLegIndices(scenario, null);
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const lastSelectedLegIndex = selectedLegIndices.length
    ? Math.max(...selectedLegIndices)
    : Math.max(0, playableCheckpoints.length - 1);
  const goal = playableCheckpoints[lastSelectedLegIndex] ?? playableCheckpoints.at(-1) ?? playableCheckpoints[0];
  const renderAnalysis = devViewEnabled ? { routes: getSelectedTraceRoutes(scenario, selectedLegIndices) } : null;
  const boardViewMode = getBoardViewMode();
  const iconBoardView = boardViewMode === BOARD_VIEW_MODES.icons;
  // v49am reload fidelity: an incomplete/stopped/failed saved-course reanalysis is
  // not authoritative evidence that previously accepted starting spaces disappeared.
  // The snapshot already preserves the accepted active field + blocked disposition, so
  // keep rendering that saved disposition until hydration is structurally complete.
  const preserveSavedStartDisposition = Boolean(
    scenario.hydrationPresentationFallback ||
    scenario.hydrationPresentationUnavailable ||
    scenario.hydrationReanalysisPending ||
    scenario.hydrationReanalysisStopped ||
    scenario.hydrationReanalysisFailed
  );
  const metricUnusableStartIndices = (
    scenario.competitiveMode ||
    preserveSavedStartDisposition ||
    scenario.hydrationStartDispositionRestored
  )
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
  const competitiveExpectedSelectedIndices = new Set(
    devViewEnabled && scenario.competitiveMode
      ? (scenario.startDisposition?.competitiveSelectedIndices ??
        scenario.sequence.firstLeg?.summary?.competitiveStartBalance?.selectedIndices ?? [])
      : []
  );
  const startLabels = devViewEnabled
    ? scenario.activeStarts.map((start, index) => {
      const number = startNumberByKey.get(`${start.x},${start.y}`) ?? "";
      return competitiveExpectedSelectedIndices.has(index) ? `${number}★` : number;
    })
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

  const highlightTargets = getMapFeatureHighlightTargets(scenario);

  return {
    devViewEnabled, goal, iconBoardView, renderAnalysis, selectedLegIndices,
    startLabels, selectedStartIndices, startEnergyCosts, startLateEnergyCosts,
    startEarlyUnavailable, startLateUnavailable,
    startEnergyIsSubsidy: Boolean(scenario.subsidizedStarts), unusableStartIndices,
    highlightMapFeatures: Boolean(mapFeatureHighlightEnabled && highlightTargets.hasTargets)
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
    selectedLegIndices,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    startEnergyIsSubsidy,
    unusableStartIndices,
    highlightMapFeatures
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
    // No-Docks normal view shows only playable starting spaces. Pricing labels belong
    // on the retained choices; prohibited/pruned physical edge spaces remain Dev-only.
    hideUnusableStarts: Boolean(scenario.noDocks && !devViewEnabled),
    showWalls: iconBoardView || devViewEnabled,
    showPieceImages: !iconBoardView,
    showFootprints: true,
    showFeatureIcons: iconBoardView,
    highlightMapFeatures
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

  return { devViewEnabled, selectedLegIndices };
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

function buildScenarioDevOverview(scenario, selectedLegIndices) {
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const legLabels = normalizedLegs.map((index) => formatLegLabel(scenario.sequence.legs[index]));
  const deepMs = Number(scenario?.devPerformance?.lastDeepReportMs);
  const renderMs = Number(scenario?.devPerformance?.lastRenderMs);
  const ledgerMs = Number(scenario?.devPerformance?.lastLedgerReplayMs);
  const cheapShadowMs = Number(scenario?.devPerformance?.lastCheapShadowMs);
  const damageFoundationMs = Number(scenario?.devPerformance?.lastDamageFoundationMs);
  const clickToRenderMs = Number(scenario?.devPerformance?.generateClickToRenderMs);
  const lines = [
    "Course Evaluation — quick Dev overview",
    `UI build: ${MAIN_BUILD_ID}`,
    `Start balance: ${formatStartBalanceLabel(scenario.preferences?.startBalance)} (${normalizeStartBalance(scenario.preferences?.startBalance)})`,
    `Trace legs: ${legLabels.length === scenario.sequence.legs.length ? "all real legs" : legLabels.join(", ") || "all real legs"}`,
    "Deep per-route/register replay is lazy. Click a start for structured route detail; use Copy All for the full event-level diagnostic ledger.",
    `Automatic v49cd targeted card-pressure search: disabled (the capped experiment is closed as inconclusive).`,
    Number.isFinite(clickToRenderMs) ? `Generate click → first rendered course: ${formatDevMilliseconds(clickToRenderMs)}` : null,
    Number.isFinite(renderMs) ? `Last Dev render: ${formatDevMilliseconds(renderMs)}` : null,
    Number.isFinite(deepMs)
      ? `Last deep Copy All build: ${formatDevMilliseconds(deepMs)} (RE ledgers ${formatDevMilliseconds(ledgerMs)}, cheap-card shadows ${formatDevMilliseconds(cheapShadowMs)}, damage foundation ${formatDevMilliseconds(damageFoundationMs)})`
      : null,
    "",
    buildScenarioBenchmarkSummary(scenario)
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// Dev View taps re-render the whole scenario, which rebuilds the pickers above
// the map and the panels around it. On phones a change in their height shifted
// the map under the user's finger; this keeps the map where it was on screen.
function renderScenarioKeepingMapInPlace(scenario) {
  const canvas = document.getElementById("canvas");
  const topBefore = canvas?.getBoundingClientRect().top;
  renderScenario(scenario);
  const topAfter = canvas?.getBoundingClientRect().top;
  if (Number.isFinite(topBefore) && Number.isFinite(topAfter) && Math.abs(topAfter - topBefore) > 1) {
    window.scrollBy(0, topAfter - topBefore);
  }
}

function renderScenario(scenario) {
  const renderStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  updateDevView();
  updateSetupSummary(scenario);
  updateRulesNote(scenario);
  updateLegend(scenario);
  updateMapFeatureHighlightControl(scenario);
  const legSelect = document.getElementById("leg-select");
  const legOptions = scenario.sequence.legs.map((leg, index) => ({
    value: String(index),
    label: index === 0 ? (scenario.virtualBots ? "Entry → 1" : "Start → 1") : `${leg.from} → ${leg.to}`
  }));
  const previousSelectedValues = legSelect
    ? [...legSelect.options].filter((option) => option.selected).map((option) => option.value)
    : [];
  if (legSelect) {
    // v49cg keeps the native multi-select as an internal state carrier, while a
    // compact checkbox dropdown provides the visible interaction. This avoids
    // platform-specific Command/Ctrl multi-select behavior without changing the
    // existing selection semantics.
    legSelect.multiple = true;
    legSelect.size = Math.max(2, Math.min(6, legOptions.length));
    legSelect.setAttribute("aria-label", "Trace legs (internal state)");
    legSelect.style.display = "none";
    legSelect.innerHTML = "";
    const retainedSelection = new Set(previousSelectedValues.filter((value) =>
      legOptions.some((option) => option.value === value)
    ));
    legOptions.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      el.selected = retainedSelection.size ? retainedSelection.has(option.value) : true;
      legSelect.appendChild(el);
    });
  }
  ensureTraceLegPicker(scenario, legOptions);
  ensureTraceStartPicker(scenario);
  const canvasStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const renderState = drawScenarioCanvas(scenario);
  const canvasMs = Number.isFinite(canvasStartedAt) ? performance.now() - canvasStartedAt : 0;
  updateInspectionDetail(scenario, renderState.selectedLegIndices);
  updateDevStartResidualTable(scenario);
  const overviewStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  setCourseEvaluationReportText(
    buildScenarioDevOverview(scenario, renderState.selectedLegIndices)
  );
  const overviewMs = Number.isFinite(overviewStartedAt) ? performance.now() - overviewStartedAt : 0;
  const renderMs = Number.isFinite(renderStartedAt) ? performance.now() - renderStartedAt : 0;
  scenario.devPerformance = {
    ...(scenario.devPerformance ?? {}),
    lastRenderMs: renderMs,
    lastCanvasMs: canvasMs,
    lastOverviewMs: overviewMs
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
    if (!raw) {
      return null;
    }

    const snapshot = JSON.parse(raw);
    const compatible = (
      snapshot?.savedScenarioApp === SAVED_SCENARIO_APP_ID &&
      snapshot?.savedScenarioSchema === SAVED_SCENARIO_SCHEMA_VERSION
    );
    if (!compatible) {
      localStorage.removeItem(SAVED_SCENARIO_KEY);
      showToast("Saved course was from an incompatible version and was removed.");
      return null;
    }

    return snapshot;
  } catch {
    try {
      localStorage.removeItem(SAVED_SCENARIO_KEY);
    } catch {
      // ignore storage failures
    }
    showToast("Saved course data was invalid and was removed.");
    return null;
  }
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

async function start() {
  const preferences = getPreferencesFromControls();
  const generationProfile = getGenerationModeProfile(preferences);
  const maxAttempts = generationProfile.maxAttempts;
  const generationUiStartedAt = generationNow();
  generationStopRequested = false;
  generationHasRetainableCandidate = false;
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
        preferences,
        generationStartedAt: generationUiStartedAt,
        acceptableCandidateTarget: generationProfile.acceptableCandidateTarget,
        acceptableCandidatesFound: 0
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

    const frozenTestSeed = Number.isInteger(devFrozenGenerationSeed)
      ? devFrozenGenerationSeed
      : null;
    let lastGenerationUiYieldAt = 0;
    const generation = await runProductionGeneration(assets, preferences, {
      seed: frozenTestSeed,
      maxAttempts,
      generationOptions: {
        shouldStopRequested: () => generationStopRequested,
        onRetainableCandidate: async ({ found, target }) => {
          setGenerationRetainedCandidateProgress(found, target);
          await nextFrame();
          lastGenerationUiYieldAt = generationNow();
        },
        onCooperativeProgress: (attempt, maxAttempts, stage = "", stageContext = null) => {
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
        },
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
          if (now - lastGenerationUiYieldAt >= 300) {
            lastGenerationUiYieldAt = now;
            await nextFrame();
          }
        }
      }
    });

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

    currentScenario = generation.scenario;
    selectDefaultTraceStarts(currentScenario);
    clearRouteInspection();
    await ensureScenarioImages(assets, currentScenario);
    pruneImageCache(assets, [
      ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
      boardAuditState.pieceId
    ]);
    renderScenario(currentScenario);
    currentScenario.devPerformance = {
      ...(currentScenario.devPerformance ?? {}),
      generateClickToRenderMs: Math.max(0, generationNow() - generationUiStartedAt)
    };
    setCourseEvaluationReportText(
      buildScenarioDevOverview(currentScenario, getSelectedLegIndicesFromControl(currentScenario))
    );
    saveScenarioSnapshot(currentScenario);
    lastScenarioRenderTime = performance.now();
  } finally {
    isGenerating = false;
    setGeneratingOverlay(false);
    generationStopRequested = false;
    generationHasRetainableCandidate = false;
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
    renderScenarioKeepingMapInPlace(currentScenario);
  });

  document.getElementById("canvas")?.addEventListener("dblclick", (event) => {
    if (!currentScenario || !isDevViewEnabled()) return;
    event.preventDefault();
    const tile = getCanvasTileFromEvent(event);
    const selectedLegIndices = getSelectedLegIndicesFromControl(currentScenario);
    if (tileTouchesVisibleTrace(currentScenario, tile, selectedLegIndices)) {
      selectAllTraceStarts(currentScenario);
    } else {
      clearTraceStarts();
      clearRouteInspection();
    }
    renderScenarioKeepingMapInPlace(currentScenario);
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
    const text = buildScenarioBenchmarkSummary(currentScenario);
    await copyTextToClipboard(text, button, "Copy summary", "Course Evaluation summary");
  }

  async function copyCourseEvaluationAll() {
    if (!currentScenario) return;
    const button = document.getElementById("copy-course-evaluation-all");
    if (button) button.textContent = "Building…";
    await nextFrame();
    const selectedLegIndices = getSelectedLegIndicesFromControl(currentScenario);
    const text = buildScenarioReport(currentScenario, selectedLegIndices);
    await copyTextToClipboard(text, button, "Copy all", "Course Evaluation");
    // Refresh only the cheap overview so the newly measured deep-report timing is
    // visible without leaving the expensive report resident in the DOM.
    setCourseEvaluationReportText(buildScenarioDevOverview(currentScenario, selectedLegIndices));
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

  document.getElementById("leg-select").addEventListener("change", (event) => {
    const select = event.currentTarget;
    if (select && ![...select.options].some((option) => option.selected)) {
      [...select.options].forEach((option) => { option.selected = true; });
    }
    if (currentScenario) renderScenario(currentScenario);
  });

  document.getElementById("board-view-mode").addEventListener("change", () => {
    if (currentScenario) {
      renderScenario(currentScenario);
    }
  });

  document.getElementById("map-feature-highlight")?.addEventListener("click", () => {
    if (!currentScenario) return;
    mapFeatureHighlightEnabled = !mapFeatureHighlightEnabled;
    renderScenario(currentScenario);
  });

  document.getElementById("course-explanation-toggle").addEventListener("click", () => {
    if (!currentScenario) {
      return;
    }

    const presentationMetrics = getScenarioPresentationMetrics(currentScenario);
    const presentationScenario = presentationMetrics === currentScenario.metrics
      ? currentScenario
      : { ...currentScenario, metrics: presentationMetrics };
    const autoOpen = buildCourseNoteFacts(presentationScenario).autoOpenExplanation;
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

    if (button.dataset.boardSpreadControl) {
      cycleBoardSpreadControl();
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

  document.getElementById("expansion-contamination").addEventListener("change", () => {
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
    applyDevViewAvailability();
    updateDevView();
    const snapshot = loadScenarioSnapshot();

    if (snapshot) {
      applyPreferencesToControls(snapshot.preferences);
      generationStopRequested = false;
      generationHasRetainableCandidate = false;
      setGenerationStopControlState(false);
      isGenerating = true;
      setGeneratingOverlay(true, "", {
        attempt: 1,
        maxAttempts: 1,
        stage: "Reanalyzing saved course",
        preferences: snapshot.preferences,
        generationStartedAt: generationNow(),
        acceptableCandidateTarget: 1,
        acceptableCandidatesFound: 0
      });
      await nextFrame();

      const savedShell = buildSavedScenarioPresentationShell(assets, snapshot, "pending");
      if (savedShell) {
        currentScenario = savedShell;
        await ensureScenarioImages(assets, currentScenario);
        pruneImageCache(assets, [
          ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
          boardAuditState.pieceId
        ]);
        try {
          renderScenario(currentScenario);
        } catch (error) {
          console.warn("Saved-course presentation shell could not be rendered before reanalysis", error);
        }
      }

      let restoredScenario = null;
      let hydrationStopped = false;
      let hydrationFailed = false;
      try {
        restoredScenario = await hydrateScenarioFromSnapshot(assets, snapshot, {
          shouldStopRequested: () => generationStopRequested,
          onStage: async (stage) => {
            setGeneratingOverlay(true, "", {
              attempt: 1,
              maxAttempts: 1,
              stage: `Reanalyzing saved course — ${stage}`,
              preferences: snapshot.preferences
            });
            await nextEventLoopTurn();
          },
          onCooperativeProgress: async (progress) => {
            setGeneratingOverlay(true, "", {
              attempt: 1,
              maxAttempts: 1,
              stage: `Reanalyzing saved course — ${formatCooperativeRouteProgressStage(progress)}`,
              preferences: snapshot.preferences
            });
            await nextEventLoopTurn();
          }
        });
      } catch (error) {
        if (error?.code === "ANALYSIS_STOP_REQUESTED") {
          hydrationStopped = true;
        } else {
          hydrationFailed = true;
          console.error("Saved-course reanalysis failed", error);
        }
      } finally {
        isGenerating = false;
        setGeneratingOverlay(false);
        generationStopRequested = false;
        generationHasRetainableCandidate = false;
        setGenerationStopControlState(false);
      }

      if (!restoredScenario && savedShell) {
        restoredScenario = {
          ...savedShell,
          hydrationPresentationStatusReason: hydrationStopped ? "reanalysis-stopped" : "reanalysis-failed",
          hydrationReanalysisPending: false,
          hydrationReanalysisStopped: hydrationStopped,
          hydrationReanalysisFailed: hydrationFailed || !hydrationStopped
        };
      }
      if (restoredScenario) {
        currentScenario = restoredScenario;
        selectDefaultTraceStarts(currentScenario);
        await ensureScenarioImages(assets, currentScenario);
        pruneImageCache(assets, [
          ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
          boardAuditState.pieceId
        ]);
        renderScenario(currentScenario);
        return;
      }
    }

    await start();
  }

  init().catch(console.error);

}
// VERSION END: v49fp-safari-dev-panel-tightening
