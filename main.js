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
import {
  currentScenario,
  generationHasRetainableCandidate,
  generationStopRequested,
  isGenerating,
  lastScenarioRenderTime,
  mapFeatureHighlightEnabled,
  setCurrentScenario,
  setGenerationHasRetainableCandidate,
  setGenerationStopRequested,
  setIsGenerating,
  setLastScenarioRenderTime,
  setMapFeatureHighlightEnabled
} from "./src/ui/state.js";
import { showToast } from "./src/ui/toast.js";
import { MAIN_BUILD_ID } from "./src/ui/build-info.js";
import {
  BOARD_VIEW_MODES,
  boardAuditState,
  countBoardLasers,
  formatBoardLabel,
  getBoardViewMode,
  initializeBoardAudit,
  updateBoardAuditVisibility
} from "./src/ui/board-audit.js";
import {
  applyPreferencesToControls,
  closeOptionalRulesDialog,
  closeVariantPicker,
  cycleActFastControlChoice,
  cycleBoardSpreadControl,
  cycleOverlayModeControl,
  cycleVariantControlState,
  filterOptionalRulesIndex,
  getPreferencesFromControls,
  openOptionalRulesDialog,
  pageGetAvailableConcretePreferenceValues,
  renderVariantControls,
  toggleVariantCategoryStates,
  updateExpansionSummary,
  updateVariantAvailability
} from "./src/ui/controls.js";
import { closeAboutDialog, openAboutDialog } from "./src/ui/dialogs.js";
import {
  describeAllowedVariants,
  getVariantImpactSummary,
  hasMovingTargetsEffect,
  updateLegend,
  updateRulesNote
} from "./src/ui/rules-notes.js";
import {
  courseExplanationState,
  formatLegLabel,
  getGenerationConstraintHint,
  updateSetupSummary
} from "./src/ui/setup-summary.js";
import {
  requestGenerationStop,
  setGeneratingOverlay,
  setGenerationRetainedCandidateProgress,
  setGenerationStopControlState
} from "./src/ui/generation-overlay.js";
import {
  applyDevViewAvailability,
  applyRouteInspection,
  clearRouteInspection,
  clearTraceStarts,
  devFrozenGenerationSeed,
  formatRegisterEquivalentLedgerLines,
  getCanvasTileFromEvent,
  getInspectableAtTile,
  getSelectedLegIndicesFromControl,
  getSelectedTraceRoutes,
  getTraceableStartIndices,
  normalizeSelectedLegIndices,
  pageIsDevFastAlternatesEnabled,
  pageIsDevFastTrafficEnabled,
  pageIsDevRouteModelOverrideActive,
  pageIsDevViewEnabled,
  selectAllTraceStarts,
  selectDefaultTraceStarts,
  setCourseEvaluationReportText,
  setTraceSelectionState,
  tileTouchesVisibleTrace,
  traceSelectionState,
  updateDevStartResidualTable,
  updateDevView,
  updateInspectionDetail
} from "./src/ui/dev-view.js";
import { buildScenarioBenchmarkSummary, buildScenarioReport } from "./src/ui/reports.js";
import {
  buildScenarioDevOverview,
  ensureScenarioAnimationLoop,
  lastRenderDiagnostics,
  renderScenario,
  renderScenarioKeepingMapInPlace
} from "./src/ui/map-view.js";

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

const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";

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

  setCurrentScenario(previousScenario);
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
  setGenerationStopRequested(false);
  setGenerationHasRetainableCandidate(false);
  setGenerationStopControlState(false);
  setIsGenerating(true);

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

    setCurrentScenario(generation.scenario);
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
    setLastScenarioRenderTime(performance.now());
  } finally {
    setIsGenerating(false);
    setGeneratingOverlay(false);
    setGenerationStopRequested(false);
    setGenerationHasRetainableCandidate(false);
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
    setMapFeatureHighlightEnabled(!mapFeatureHighlightEnabled);
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
      setGenerationStopRequested(false);
      setGenerationHasRetainableCandidate(false);
      setGenerationStopControlState(false);
      setIsGenerating(true);
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
        setCurrentScenario(savedShell);
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
        setIsGenerating(false);
        setGeneratingOverlay(false);
        setGenerationStopRequested(false);
        setGenerationHasRetainableCandidate(false);
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
        setCurrentScenario(restoredScenario);
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
