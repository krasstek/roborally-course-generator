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

const SCENARIO_RENDER_INTERVAL_MS = 125;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";

let scenarioAnimationFrameId = null;

let lastRenderDiagnostics = {
  blankFallbackTriggered: false
};

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
      setTraceSelectionState({ startIndices: next });
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
    setLastScenarioRenderTime(now);
    drawScenarioCanvas(currentScenario, { skipBlankCheck: true });
  };

  scenarioAnimationFrameId = requestAnimationFrame(tick);
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
