// VERSION START: v49fo-randomizer-hotpath-fix
// Robo Rally Course Randomizer - route analysis and scoring runtime
import {
  FLAG_APPROACH_WEIGHTS,
  getDamageDeckPressureMultipliers,
  getEffectiveLaserDamage,
  getFlagAreaFeatureScore,
  getHomingMissileSearchGuidanceScore,
  getTilePenaltyForFeature
} from "./feature-weights.js";
import { getActiveVariantMentalEventRules } from "./variants.js";
import {
  ACTIONS,
  AGAIN_CARD_COUNT,
  AUTO_KILL_PRESSURE_SETBACK_WEIGHT,
  AUTO_KILL_SETBACK_TEMPO_PER_STEP,
  DIRS,
  EDGE_BEHAVIOR,
  MORE_DEADLY_REBOOT_DAMAGE_PENALTY,
  OPPOSITE,
  PROGRAM_CARD_COUNTS,
  PROGRAM_CARD_IDS,
  PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR,
  REBOOT_AVERAGE_LOST_REGISTERS,
  REBOOT_DAMAGE_PENALTY,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST,
  ROTATION_ORDER,
  SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER
} from "./src/analysis/constants.js";
import {
  REGISTER_START_FEATURE_RANDOMIZER,
  REGISTER_START_FEATURE_TRAPDOOR,
  buildPortalMap,
  cloneState,
  crossesLedgeBoundary,
  getBelt,
  getFeatureDutyCycle,
  getGear,
  getLedgeElevationDelta,
  getLedgeSides,
  getPortal,
  getPushes,
  getRegisterStartFeatureMask,
  getRepulsor,
  getTeleporter,
  hasActiveFeature,
  hasExplicitTiming,
  hasHomingMissile,
  hasKnownRegisterTiming,
  hasRampForDir,
  isBoundaryBlockedByWalls,
  isCurrent,
  isFeatureActiveThisRegister,
  isOil,
  isPit,
  isWater,
  stateKey,
  tileKey
} from "./src/analysis/board-geometry.js";
import {
  getBoardRectForPoint,
  getElapsedAbsoluteActionsAfterTransitions,
  getHomeRebootTokensForStart,
  getRebootDamagePenalty,
  getRebootEndedAbsoluteActions,
  getRebootRoutePenalty,
  getRebootTransitionCore,
  getRegisterPosition,
  getTransitionAbsoluteAction,
  getTurnEndAfterActionIndexes,
  resolveRebootRecovery,
  resolveRebootRecoveryPoint
} from "./src/analysis/reboot-recovery.js";
import { analysisTelemetryNow } from "./src/analysis/telemetry.js";
import {
  getActionPenalty,
  isBatteryActive,
  isRouteAwareBatteryScoringActive
} from "./src/analysis/rule-options.js";
import {
  CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE,
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY,
  canMoveBetween,
  collectContextualRecoveryPressurePoints,
  directionBetween,
  finalizeContextualPhysicalTransition,
  getAutoKillRecoveryProgressFromPoint,
  getFlamethrowerDamagePenalty,
  getLedgePressurePenalty,
  getPitPressurePenalty,
  getRouteAwareActionPenalty,
  getTilePenalty,
  hasFeatureType,
  heuristic,
  simulateAction
} from "./src/analysis/movement.js";
export { simulateAction } from "./src/analysis/movement.js";
import { average, clamp, percentileNumber, stdDev } from "./src/analysis/math.js";
import {
  clampRouteEconomyCardUnits,
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getInitialRouteEconomyShadowState,
  getInitialRouteEnergyShadowReserve,
  getInitialRouteUpgradeCardShadowUnits,
  getInitialRouteUsefulCardUnits,
  getRouteEconomyFullHorizonActions,
  getRouteEconomyPhaseChoices,
  getRouteEnergyDominanceBoundConfig,
  getRouteEnergyDominanceRewardUpperBound,
  getRouteEnergyEconomyConfig,
  getRouteEnergyShadowStep,
  getRouteUsefulCardUnitsPerDraw
} from "./src/analysis/energy-economy.js";
export {
  ROUTE_ENERGY_ECONOMY_DEFAULTS,
  estimateInitialUpgradeOpportunitiesRemaining,
  evaluateRouteUpgradePotential,
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getCourseStartingUpgradeCards,
  getRouteEnergyEconomyConfig,
  getRouteEnergyGainUtility,
  getRouteMarginalEnergyUtility,
  getRouteUpgradePotential
} from "./src/analysis/energy-economy.js";
import {
  COMPACT_PROGRAM_ACTION_CODE,
  COMPACT_PROGRAM_ACTION_RADIX,
  COMPACT_PROGRAM_RESOURCE_IDS,
  ESTIMATED_CARD_FORECAST_BREAK_PENALTY,
  ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT,
  PROGRAM_ACTION_TRANSITION_CACHE,
  PROGRAM_CHEAP_AVAILABILITY_CACHE,
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY,
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE,
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY,
  PROGRAM_CHEAP_RESOURCE_IDS,
  PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE,
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY,
  PROGRAM_EXACT_AVAILABILITY_CACHE,
  PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY,
  PROGRAM_EXACT_HAND_SIZE,
  PROGRAM_HISTORY_WINDOW_SIZE,
  PROGRAM_RESOURCE_SUMMARY_CACHE,
  ROLLING_PROGRAM_CONTEXT_CACHE,
  advanceEstimatedCardForecastFrontier,
  areRollingProgramResourceStatesCompatible,
  chooseSmall,
  cloneEstimatedCardForecastFrontier,
  closeCompactProgramCardStateForEndedTurn,
  closeEstimatedCardForecastFrontierForEndedTurn,
  encodeCompactProgramResourceState,
  evaluateProgramAction,
  getCardAvailabilityPressure,
  getCheapProgramLiteralAvailabilityDelta,
  getCheapProgramLiteralAvailabilityProbability,
  getCompactProgramCardOptions,
  getCompactProgramCardStateCode,
  getCompactProgramCardStateFromHistory,
  getCompactProgramResourceCount,
  getEstimatedCardFrontierUnionAvailabilityPenalty,
  getExactProgramAvailabilityPenalty,
  getExactProgramDeckCounts,
  getExactProgramHandAvailabilityProbability,
  getExactProgramRequirementVectors,
  getLiteralProgramResourceStates,
  getLiteralProgramResourceSummary,
  getProgramAvailabilityPenaltyFromProbability,
  getProgramCardEffectivePreviousCode,
  getProgramCardEffectivePreviousCounts,
  getProgramCardModelProfile,
  getProgramCardModelSignature,
  getProgramHistoryWindow,
  getProgramResourceStateCounts,
  getRollingProgramResourceContext,
  resetRollingProgramSignatureIds,
  scoreCompactProgramCardSequence,
  scoreCompactProgramCardSequenceUntilFailure,
  walkEstimatedCardForecast
} from "./src/analysis/program-availability.js";
export { getProgramCardVariantModelSummary } from "./src/analysis/program-availability.js";
import {
  DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE,
  DAMAGE_ECONOMY_MODEL_ID,
  DAMAGE_ECONOMY_PROGRAM_CACHE,
  DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT,
  DAMAGE_ECONOMY_ROUTE_SUMMARY_CACHE,
  DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
  DAMAGE_ECONOMY_SPAM_DRAW_CACHE,
  DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT,
  DAMAGE_ECONOMY_TELEMETRY,
  DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE,
  advanceDamageEconomyToTurn,
  applyDamageEconomyRepairStationRelief,
  applyDamageEconomySpamPlayOutcome,
  applyExpectedDamageToEconomyState,
  createDamageEconomyState,
  getDamageEconomyActiveFlamethrowerCount,
  getDamageEconomyAdjustedForcedSpamHaywireJointDistribution,
  getDamageEconomyClogRegisterEquivalents,
  getDamageEconomyCombinedClogSummary,
  getDamageEconomyExpectedCount,
  getDamageEconomyExpectedSpamChainYield,
  getDamageEconomyHaywireEventProbability,
  getDamageEconomyPoissonBinomialDistribution,
  getDamageEconomyProgramCodeFromLiteralCards,
  getDamageEconomyProgrammingSummary,
  getDamageEconomyRealizedDamageForTransition,
  getDamageEconomyRegisterHaywireEventProbability,
  getDamageEconomyRegisterReliefProfile,
  getDamageEconomyReliefOpportunityByAbsoluteAction,
  getDamageEconomySelectedProgramTurns,
  getDamageEconomyTelemetrySnapshot,
  getDamageEconomyVariantProfile,
  isDamageEconomyRandomizerAtRegisterStart,
  isDamageEconomyRepairStationTile,
  replayDamageEconomyShutdownEquivalentScore,
  resetDamageEconomyRouteSummaryCaches
} from "./src/analysis/damage-economy.js";
export {
  DAMAGE_ECONOMY_MODEL_ID,
  getDamageEconomyTelemetrySnapshot
} from "./src/analysis/damage-economy.js";
import { ANALYSIS_TELEMETRY, recordRouteSearchTelemetry } from "./src/analysis/telemetry.js";
export { getCompletedRouteExpansions } from "./src/analysis/telemetry.js";
import { MinHeap } from "./src/analysis/collections.js";
import {
  buildTimeline,
  enumerateFullCourseRoutes,
  enumerateRoutes,
  getDynamicArchiveStateKey,
  getDynamicGoalPosition,
  getDynamicGoalSpace,
  getHomingMissileCheapSearchGuidanceBonus,
  getNextDynamicArchivePoint,
  getRouteEnergyShadowReserveKey,
  reconstructRouteTransitions,
  routeTouchesPit,
  scoreConveyorComplexity,
  scoreDynamicArchivingRouteUtility,
  scoreTransitionConveyorComplexity,
  sliceFullCourseRoute
} from "./src/analysis/route-search.js";
export { summarizePowerUpOpportunityBenchmark } from "./src/analysis/route-search.js";
import {
  FORECAST_SOLID_CONFIDENCE,
  FORECAST_SPECULATIVE_CONFIDENCE,
  FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT,
  FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
  HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE,
  HOMING_MISSILE_STRATEGIC_CREDIT_RE,
  HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
  HOMING_MISSILE_TARGET_CHOICE_EVENT_WEIGHT,
  LATERAL_THREAT_CACHE,
  OVERLAP_PENALTY_CACHE,
  REAR_THREAT_CACHE,
  RE_NATIVE_DAMAGE_EFFORT_CEILING,
  ROUTE_SIMILARITY_CACHE,
  TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
  applyTrafficGraceToRoute,
  averageCrossLegOverlap,
  averageCrossLegThreat,
  averagePairwiseOverlap,
  averagePairwiseThreat,
  buildConditionalOccupancyMap,
  buildStartOccupancyMap,
  buildTrafficRouteMixture,
  buildTrafficRouteMixtureEntries,
  classifyTrafficOrientation,
  compareScoredRouteLike,
  computeLegTrafficScale,
  dedupeRoutes,
  getClosestTimelineIndexByAbsoluteRegister,
  getDisplacementControlSeverity,
  getExplicitOccupancyWeight,
  getForecastTimeConfidence,
  getIncomingRobotLaserDirection,
  getNearbyInteractionProbability,
  getOccupancyQualityScore,
  getRENativeTrafficConfidenceForAbsoluteAction,
  getRegisterTimeline,
  getRobotRangedPressure,
  getRouteLegIndexForAbsoluteAction,
  getRoutePathKey,
  getStandardRobotLaserCost,
  getTemporalInteractionWeight,
  getTrafficAlternateEffortScale,
  getTrafficAlternateHardPressureStrength,
  getTrafficAlternateSearchEnvelope,
  getTrafficForecastElapsedRegisters,
  getTrafficForecastGraceRegisters,
  getTrafficLegs,
  getTrafficPairProfile,
  getTrafficRouteEntry,
  getTrafficRouteMixtureForAnalysis,
  getVirtualPhysicalInteractionScale,
  restoreRENativeTrafficAlternateEffortForDamagePressure,
  routeSimilarity,
  selectContextualTrafficAlternativeRoutes,
  selectDistinctRoutes,
  summarizeFullCourseCandidateDiversity,
  summarizeNearbyTrafficTurnEpisodes,
  summarizeSimultaneousRebootPileupClogIncrement,
  summarizeSimultaneousRebootPileupForecast,
  summarizeTrafficCompletedRouteOwnershipAudit,
  summarizeTrafficRouteFamilyDivergence,
  summarizeTrafficRouteMixtureOwnershipAudit,
  summarizeTrafficRouteMixtures,
  trafficRouteMixturesDiffer
} from "./src/analysis/traffic.js";
export {
  TRAFFIC_OWNERSHIP_AUDIT_ID,
  buildStartOccupancyMap,
  summarizeIntrinsicRouteForecastConfidence,
  summarizeTrafficOwnershipAudit
} from "./src/analysis/traffic.js";
import {
  RE_LEDGER_MODEL_ID,
  getCompletedRoutePostbuildScoreAdjustment,
  getObservationalMentalRegisterEquivalents,
  getRegisterEquivalentLedgerAbsoluteAction,
  getRegisterEquivalentLedgerPlanningEventsForTransition,
  getSearchIntrinsicMentalTransitionStep,
  replaySearchIntrinsicMentalForContext,
  summarizeTrafficAwarenessMentalIncrement
} from "./src/analysis/re-ledger.js";
export {
  RE_LEDGER_MODEL_ID,
  getObservationalMentalRegisterEquivalents
} from "./src/analysis/re-ledger.js";
import { scoreContextualCardSequence } from "./src/analysis/program-availability.js";
import {
  getExpectedTrafficBreakdown,
  getRENativeProductionTrafficForecastProfile,
  resetRENativeTrafficConfidenceProfileCache,
  resetTrafficIntrinsicRELedgerCache,
  summarizeDamageEconomyFoundationForRoute,
  summarizeRegisterEquivalentLedger
} from "./src/analysis/route-evaluation.js";
export {
  summarizeDamageEconomyFoundationForRoute,
  summarizeRENativeRouteUncertaintyEvidence,
  summarizeRegisterEquivalentLedger
} from "./src/analysis/route-evaluation.js";
import {
  getCachedContextualPhysicalTransition,
  getContextualPhysicalOptionSignature
} from "./src/analysis/physical-cache.js";
import {
  APPROX_PROGRAM_DEMAND_SPACE,
  closeEstimatedProgramDemandForEndedTurn,
  contextualNumericFallbackId,
  getApproxProgramDemandOptions,
  getApproxProgramDemandStateCode,
  getEstimatedDemandStateFromCompactCardState,
  getEstimatedProgramDemandStep,
  scoreEstimatedProgramDemand,
  walkEstimatedProgramDemand
} from "./src/analysis/program-demand.js";
export { summarizeCheapSearchRegisterEquivalentShadow } from "./src/analysis/re-diagnostics.js";
import {
  getFixedRoutePricingBaseRELedger,
  rescoreFixedRouteUpgradeEconomy,
  resetFixedRoutePricingEconomyActivityCache,
  resetFixedRoutePricingEconomyCache,
  resetFixedRoutePricingRELedgerCache
} from "./src/analysis/route-pricing-economy.js";
export {
  rescoreFixedRouteUpgradeEconomy,
  summarizeFixedRouteUpgradeEconomyActivity
} from "./src/analysis/route-pricing-economy.js";
import {
  applyIntrinsicDamageEconomyRoutingScore,
  getDamageEconomyTrafficRoutingBreakdown
} from "./src/analysis/damage-routing.js";
import { scoreFlagArea } from "./src/analysis/flag-area.js";
export { analyzeGoalApproaches, scoreFlagArea } from "./src/analysis/flag-area.js";
export { summarizeFixedRouteBoardAblation } from "./src/analysis/board-ablation.js";
import {
  applyIntrinsicFullCourseBalanceScores,
  applyNormalFullCourseEffectiveREFairnessScores,
  buildExpectedLegAnalysesFromFullRoutes,
  buildStartAnalysisForSelectedFullRoute,
  prepareFullCourseCandidate,
  selectCorridorDiverseFullCourseRoutes,
  selectFullCourseRoutesForStarts
} from "./src/analysis/route-selection.js";
export { NORMAL_FAIRNESS_RE_MODEL_ID } from "./src/analysis/route-selection.js";
import {
  CONTEXTUAL_BEAM_WIDTH,
  CONTEXTUAL_COMPLETION_POOL,
  CONTEXTUAL_FORECAST_BANDS,
  CONTEXTUAL_LATER_EXPANSIONS,
  CONTEXTUAL_LATER_ROUTES,
  CONTEXTUAL_LEG_MAX_ACTIONS,
  buildEstimatedPhysicalRouteFromTransitions,
  combineEstimatedPhysicalRouteSuffix,
  enumerateContextualLegRoutes,
  enumeratePhysicalTimingLegTemplates,
  enumeratePhysicalTimingLegTemplatesSteps,
  getContextAfterLeg,
  getContextualBeamWidthForPartials,
  getContextualBreadthPolicy,
  getContextualLegCacheKey,
  getContextualSharedLegCatalogueKey,
  getContextualTemplateCacheKey,
  getDynamicGoalCachePhase,
  getEstimatedRouteFailureConstraintKey,
  getEstimatedRouteIdentity,
  isRouteCompatibleWithRebootStart,
  realizeEstimatedLegsWithCardSolution,
  rebaseContextualCachedRoute,
  replayContextualRouteEnergyForContext,
  selectContextualPartialBeam,
  stitchContextualLegs,
  summarizeRouteAgainUsage,
  summarizeSelectedProgrammingScarcity
} from "./src/analysis/contextual-search.js";
export {
  summarizeProgramSequencePressure,
  summarizeTargetedSameRegisterCardPressureSearch
} from "./src/analysis/contextual-search.js";
import {
  selectAndScoreStartAnalyses,
  summarizeFirstLegAnalyses
} from "./src/analysis/course-analysis.js";
export { analyzeCourse } from "./src/analysis/course-analysis.js";
export {
  analyzeFlagLeg,
  analyzeFullCourse,
  analyzeFullCourseCooperative,
  evaluateFullCourseFocusPaymentCurveUnderOccupancy,
  recomputeFirstLegPressure
} from "./src/analysis/full-course.js";
export const ANALYZE_BUILD_ID = "v49fo-randomizer-hotpath-fix";


// This module is a route-evaluation model for board setup, not a full RoboRally
// simulator. It resolves movement-shaping effects that materially change route
// topology and replays the board hazards that feed authoritative RE/damage
// ownership on their actual register chronology; cheap search may still use
// bounded guidance penalties for discovery.
//
// Current design invariants:
// - Every route exposed to Dev View must remain physically/register/facing exact
//   and reconstruct to a literally playable five-register program sequence.
// - Energy/upgrades remain part of route quality whenever they are in play;
//   Energy Crisis (lighterGame) is currently the only rule that removes them.
// - Programming-card legality uses only the consequential rolling window: the
//   previous five-register program plus the current one. Search carries literal
//   card-use counts for those two programs and the immediately previous executed
//   action solely so Again can repeat it; no older program history is search state.
// - Uncertainty may reduce route breadth, but it never coarsens card legality.
// - Hazards are intrinsic route costs. Traffic remains a later relational layer:
//   it never alters intrinsic legality, but confidence-weighted traffic may request
//   additional leg witnesses after the first exact route set is complete.
// - v49ej ownership invariant: completed evaluation should use RE/mechanistic
//   owners wherever a credible estimate exists. Legacy score-space/feature weights
//   may guide cheap discovery, construction, compatibility or diagnostics, but
//   should be pruned from authoritative evaluation as matching RE owners land.
// - Dynamic Archiving carries the current archive marker as per-robot exact route
//   state. It affects pit/edge/autokill consequence, exact dominance, repairs and
//   leg handoff; cheap physical discovery deliberately uses a leg-local recovery
//   proxy so archive history does not explode the estimate state/cache space.
// - Normal primary routing is estimate-first, realize-second. Every structural
//   start receives a complete physical full-course estimate, one cached leg at a
//   time, before the player-count acceptance floor is consulted. Estimated card
//   demand is soft preference only and cannot make a physical route unreachable.
// - Each complete estimate is then realized against the exact rolling two-program
//   card model. The first impossible register triggers a physical suffix replan
//   from that exact board/register/history point; a bounded estimate miss widens
//   to physical-graph exhaustion instead of becoming a hidden capacity failure.
// - Traffic uses one common start-quality scale for the whole currently
//   available field. Player-count occupancy mass is diluted across surplus starts
//   by those fixed relative qualities, then focus/known selections condition that
//   common field without recomputing the quality temperature. Route convergence
//   naturally recombines fractional occupancy later. Future traffic is then
//   attenuated continuously as elapsed registers, hazards and prior predicted
//   interactions make distant multiplayer positions less credible. Alternatives
//   are demand-led.
// - Energy is soft guidance during physical estimation and is replayed/repriced on
//   the exact realized route; it is never a physical dominance dimension.

export function resetAnalysisTelemetry() {
  ANALYSIS_TELEMETRY.routeSearches.length = 0;
  ANALYSIS_TELEMETRY.completedRouteExpansions = 0;
  ANALYSIS_TELEMETRY.cooperativeIteratorSlices = 0;
  ANALYSIS_TELEMETRY.cooperativeIteratorWorkMs = 0;
  ANALYSIS_TELEMETRY.cooperativeBrowserYields = 0;
  ANALYSIS_TELEMETRY.cooperativeBrowserPausedMs = 0;
  ANALYSIS_TELEMETRY.cooperativeRouteSearchBrowserYields = 0;
  ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceMs = 0;
  ANALYSIS_TELEMETRY.cooperativeMaxIteratorSlicePhase = "none";
  ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceSearchKind = null;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.requests = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.hits = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.misses = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.archivePoints.clear();
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyRequests = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyOrigins.clear();
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyPoints.clear();
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayChecks = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayActions = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMismatches = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityCalls = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityArchiveLandings = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilitySameArchiveSuppressed = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityImprovedLandings = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityNonImprovingLandings = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRoutesWithReward = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRewardTotal = 0;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityMaxRouteReward = 0;
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.requests = 0;
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.hits = 0;
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.misses = 0;
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.missComputeMs = 0;
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.requests = 0;
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.hits = 0;
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.misses = 0;
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.subsetTerms = 0;
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.missComputeMs = 0;
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.requests = 0;
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.hits = 0;
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.misses = 0;
}

export function getAnalysisTelemetrySnapshot() {
  const routeSearches = ANALYSIS_TELEMETRY.routeSearches.map((entry) => ({ ...entry }));
  const totalsByKind = {};
  let totalExpansions = 0;
  let totalDurationMs = 0;
  let contextualProfileDurationMs = 0;
  let cappedSearches = 0;
  let physicalCacheHits = 0;
  let physicalCacheMisses = 0;

  routeSearches.forEach((entry) => {
    // Physical-template searches report cache counts directly on the telemetry
    // entry; exact contextual searches historically report them inside their
    // profile. Use the larger representation rather than summing both so a
    // search that exposes the same counts in both places is not double-counted.
    physicalCacheHits += Math.max(
      entry.physicalCacheHits ?? 0,
      entry.contextualProfile?.physicalCacheHits ?? 0
    );
    physicalCacheMisses += Math.max(
      entry.physicalCacheMisses ?? 0,
      entry.contextualProfile?.physicalCacheMisses ?? 0
    );
    totalExpansions += entry.expansions ?? 0;
    totalDurationMs += entry.durationMs ?? 0;
    if (entry.contextualProfile) contextualProfileDurationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) cappedSearches += 1;
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
  });

  Object.values(totalsByKind).forEach((bucket) => {
    bucket.durationMs = Number(bucket.durationMs.toFixed(2));
  });

  const slowestSearch = routeSearches.reduce(
    (slowest, entry) => !slowest || (entry.durationMs ?? 0) > (slowest.durationMs ?? 0) ? entry : slowest,
    null
  );

  const contextualProfileTotals = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    simulationHitMs: 0,
    simulationMissMs: 0,
    physicalMissLookupMs: 0,
    physicalMissProgrammedMs: 0,
    physicalMissProgramStartMs: 0,
    physicalMissProgramTeleporterMs: 0,
    physicalMissProgramMoveCheckMs: 0,
    physicalMissProgramBlockedMs: 0,
    physicalMissProgramLandingMs: 0,
    physicalMissProgramHazardMs: 0,
    physicalMissProgramPressureMs: 0,
    physicalMissProgramBookkeepingMs: 0,
    physicalMissProgramOilMs: 0,
    physicalMissBlueConveyorMs: 0,
    physicalMissGreenConveyorMs: 0,
    physicalMissCurrentMs: 0,
    physicalMissPusherMs: 0,
    physicalMissGearMs: 0,
    physicalMissCrusherMs: 0,
    physicalMissEndRegisterMs: 0,
    physicalMissCloneMs: 0,
    physicalMissRecoveryPressureMs: 0,
    physicalMissCacheStoreMs: 0,
    physicalMissFinalizeMs: 0,
    physicalMissSampledCalls: 0,
    cardOptionsMs: 0,
    actionScoringMs: 0,
    energyMs: 0,
    mentalMs: 0,
    archiveContextMs: 0,
    destinationBuildMs: 0,
    routeNodeBuildMs: 0,
    historyBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    cardOptionCalls: 0,
    estimatedDemandMemoHits: 0,
    estimatedDemandMemoMisses: 0,
    estimatedForecastMemoHits: 0,
    estimatedForecastMemoMisses: 0,
    estimatedCompactCardMemoHits: 0,
    estimatedCompactCardMemoMisses: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    earlyDominanceEnergyBoundPrunes: 0,
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
    retainedDominanceStates: 0,
    timingSampledNodes: 0,
    timingPopulationNodes: 0
  };
  const exhaustiveContextualProfileTotals = { ...contextualProfileTotals };
  const resumeTotals = {
    searches: 0,
    checkpointExpansions: 0,
    boundedEndExpansions: 0,
    replayExpansions: 0,
    savedRootExpansions: 0
  };
  const cooperativeSearchTotals = {
    searches: 0,
    slices: 0,
    pausedMs: 0,
    maxSliceWorkMs: 0
  };

  routeSearches.forEach((entry) => {
    if ((entry.cooperativeSlices ?? 0) > 0) {
      cooperativeSearchTotals.searches += 1;
      cooperativeSearchTotals.slices += entry.cooperativeSlices ?? 0;
      cooperativeSearchTotals.pausedMs += entry.cooperativePausedMs ?? 0;
      cooperativeSearchTotals.maxSliceWorkMs = Math.max(
        cooperativeSearchTotals.maxSliceWorkMs,
        entry.cooperativeMaxSliceWorkMs ?? 0
      );
    }
    if (entry.resumedExhaustive) {
      resumeTotals.searches += 1;
      resumeTotals.checkpointExpansions += entry.resumeCheckpointExpansions ?? 0;
      resumeTotals.boundedEndExpansions += entry.resumeBoundedEndExpansions ?? 0;
      resumeTotals.replayExpansions += entry.resumeReplayExpansions ?? 0;
      resumeTotals.savedRootExpansions += entry.resumeSavedRootExpansions ?? 0;
    }
    const profile = entry.contextualProfile;
    if (!profile) return;
    Object.keys(contextualProfileTotals).forEach((key) => {
      contextualProfileTotals[key] += profile[key] ?? 0;
      if (String(entry.kind ?? "").includes("exhaustive")) {
        exhaustiveContextualProfileTotals[key] += profile[key] ?? 0;
      }
    });
  });

  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "simulationHitMs",
    "simulationMissMs",
    "physicalMissLookupMs",
    "physicalMissProgrammedMs",
    "physicalMissProgramStartMs",
    "physicalMissProgramTeleporterMs",
    "physicalMissProgramMoveCheckMs",
    "physicalMissProgramBlockedMs",
    "physicalMissProgramLandingMs",
    "physicalMissProgramHazardMs",
    "physicalMissProgramPressureMs",
    "physicalMissProgramBookkeepingMs",
    "physicalMissProgramOilMs",
    "physicalMissBlueConveyorMs",
    "physicalMissGreenConveyorMs",
    "physicalMissCurrentMs",
    "physicalMissPusherMs",
    "physicalMissGearMs",
    "physicalMissCrusherMs",
    "physicalMissEndRegisterMs",
    "physicalMissCloneMs",
    "physicalMissRecoveryPressureMs",
    "physicalMissCacheStoreMs",
    "physicalMissFinalizeMs",
    "cardOptionsMs",
    "actionScoringMs",
    "energyMs",
    "mentalMs",
    "archiveContextMs",
    "destinationBuildMs",
    "routeNodeBuildMs",
    "historyBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    contextualProfileTotals[key] = Number(contextualProfileTotals[key].toFixed(2));
    exhaustiveContextualProfileTotals[key] = Number(
      exhaustiveContextualProfileTotals[key].toFixed(2)
    );
  });

  cooperativeSearchTotals.pausedMs = Number(cooperativeSearchTotals.pausedMs.toFixed(2));
  cooperativeSearchTotals.maxSliceWorkMs = Number(cooperativeSearchTotals.maxSliceWorkMs.toFixed(2));

  return {
    routeSearches,
    routeSearchCount: routeSearches.length,
    totalExpansions,
    totalDurationMs: Number(totalDurationMs.toFixed(2)),
    contextualProfileDurationMs: Number(contextualProfileDurationMs.toFixed(2)),
    cappedSearches,
    slowestSearch: slowestSearch ? { ...slowestSearch } : null,
    totalsByKind,
    contextualProfileTotals,
    exhaustiveContextualProfileTotals,
    resumeTotals,
    cooperativeSearchTotals,
    cooperativeIteratorTotals: {
      slices: ANALYSIS_TELEMETRY.cooperativeIteratorSlices,
      workMs: Number(ANALYSIS_TELEMETRY.cooperativeIteratorWorkMs.toFixed(2)),
      browserYields: ANALYSIS_TELEMETRY.cooperativeBrowserYields,
      browserPausedMs: Number(ANALYSIS_TELEMETRY.cooperativeBrowserPausedMs.toFixed(2)),
      routeSearchBrowserYields: ANALYSIS_TELEMETRY.cooperativeRouteSearchBrowserYields,
      maxSliceMs: Number(ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceMs.toFixed(2)),
      maxSlicePhase: ANALYSIS_TELEMETRY.cooperativeMaxIteratorSlicePhase,
      maxSliceSearchKind: ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceSearchKind
    },
    physicalCacheTotals: {
      hits: physicalCacheHits,
      misses: physicalCacheMisses
    },
    dynamicArchivePhysicalCacheTotals: {
      requests: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.requests,
      hits: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.hits,
      misses: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.misses,
      archivePoints: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.archivePoints.size,
      cheapProxyRequests: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyRequests,
      cheapProxyOrigins: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyOrigins.size,
      cheapProxyPoints: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyPoints.size,
      exactReplayChecks: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayChecks,
      exactReplayActions: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayActions,
      exactReplayMismatches: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMismatches,
      exactReplayMs: Number(DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs.toFixed(2)),
      utilityCalls: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityCalls,
      utilityArchiveLandings: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityArchiveLandings,
      utilitySameArchiveSuppressed: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilitySameArchiveSuppressed,
      utilityImprovedLandings: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityImprovedLandings,
      utilityNonImprovingLandings: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityNonImprovingLandings,
      utilityRoutesWithReward: DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRoutesWithReward,
      utilityRewardTotal: Number(DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRewardTotal.toFixed(2)),
      utilityMaxRouteReward: Number(DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityMaxRouteReward.toFixed(2))
    },
    cheapProgramAvailabilityTotals: {
      requests: PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.requests,
      hits: PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.hits,
      misses: PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.misses,
      missComputeMs: Number(PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.missComputeMs.toFixed(2)),
      cacheEntries: PROGRAM_CHEAP_AVAILABILITY_CACHE.size
    },
    cheapProgramUnionAvailabilityTotals: {
      requests: PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.requests,
      hits: PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.hits,
      misses: PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.misses,
      subsetTerms: PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.subsetTerms,
      missComputeMs: Number(
        PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.missComputeMs.toFixed(2)
      ),
      cacheEntries: PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.size
    },
    cheapProgramFrontierUnionPenaltyTotals: {
      requests: PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.requests,
      hits: PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.hits,
      misses: PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.misses,
      cacheEntries: PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.size
    }
  };
}

export function clearAnalysisCaches() {
  ROUTE_SIMILARITY_CACHE.clear();
  OVERLAP_PENALTY_CACHE.clear();
  LATERAL_THREAT_CACHE.clear();
  REAR_THREAT_CACHE.clear();
  resetFixedRoutePricingEconomyCache();
  resetFixedRoutePricingEconomyActivityCache();
  resetFixedRoutePricingRELedgerCache();
  resetTrafficIntrinsicRELedgerCache();
  resetRENativeTrafficConfidenceProfileCache();
  PROGRAM_RESOURCE_SUMMARY_CACHE.clear();
  ROLLING_PROGRAM_CONTEXT_CACHE.clear();
  PROGRAM_ACTION_TRANSITION_CACHE.clear();
  PROGRAM_EXACT_AVAILABILITY_CACHE.clear();
  resetRollingProgramSignatureIds();
  DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.clear();
  DAMAGE_ECONOMY_PROGRAM_CACHE.clear();
  DAMAGE_ECONOMY_SPAM_DRAW_CACHE.clear();
  resetDamageEconomyRouteSummaryCaches();
  DAMAGE_ECONOMY_TELEMETRY.effectiveStateLookups = 0;
  DAMAGE_ECONOMY_TELEMETRY.effectiveStateCacheHits = 0;
  DAMAGE_ECONOMY_TELEMETRY.effectiveStateCacheMisses = 0;
  DAMAGE_ECONOMY_TELEMETRY.programLookups = 0;
  DAMAGE_ECONOMY_TELEMETRY.programCacheHits = 0;
  DAMAGE_ECONOMY_TELEMETRY.programCacheMisses = 0;
  DAMAGE_ECONOMY_TELEMETRY.spamDrawLookups = 0;
  DAMAGE_ECONOMY_TELEMETRY.spamDrawCacheHits = 0;
  DAMAGE_ECONOMY_TELEMETRY.spamDrawCacheMisses = 0;
  DAMAGE_ECONOMY_TELEMETRY.routeSummaryLookups = 0;
  DAMAGE_ECONOMY_TELEMETRY.routeSummaryCacheHits = 0;
  DAMAGE_ECONOMY_TELEMETRY.routeSummaryCacheMisses = 0;
  DAMAGE_ECONOMY_TELEMETRY.shutdownScoringReplayCount = 0;
  DAMAGE_ECONOMY_TELEMETRY.shutdownScoringReplayTurns = 0;
}

export const PATHFINDER_OBJECTIVE_AUDIT_ID =
  "pathfinder-objective-v49bf-movement-reboot-ownership";

export function summarizePathfinderObjectiveAudit() {
  return {
    id: PATHFINDER_OBJECTIVE_AUDIT_ID,
    registerTempoScore: REGISTER_TEMPO_COST,
    programmedActionTypePremiumsActive: false,
    reverseSurchargeActive: false,
    heavyMoveSurchargeActive: false,
    cardPlausibilityActive: true,
    energyGuidanceActive: true,
    hazardGuidanceActive: true,
    rebootGuidanceActive: true,
    rebootLostRegisterTempoActive: true,
    rebootDiscontinuityPremiumActive: false,
    conveyorComplexityGuidanceActive: false,
    genericGearHazardPremiumActive: false,
    weightedMovementGuidanceActive: false,
    directionalDistanceQueueHeuristicActive: true,
    movementTelemetryRetained: true,
    note: "One programmed card = one register. Raw travelled-space premiums are off; distance remains telemetry and Manhattan distance remains queue-order guidance only. Reboots retain factual skipped-register tempo and hazard/damage guidance, but the legacy fixed discontinuity surcharge is off."
  };
}

// Power Up is WAIT in the route action vocabulary. Its card scarcity follows the
// same one-copy rule as every other unique program card; any strategic benefit
// from charging Energy belongs to the separate Energy-economy model.
export function summarizePowerUpProgramFeasibility(history, absoluteActions) {
  const base = getRollingProgramResourceContext(history, absoluteActions);
  const powerUp = evaluateProgramAction(history, absoluteActions, "WAIT");
  const phase = ((Number(absoluteActions) || 0) % REGISTER_COUNT + REGISTER_COUNT) % REGISTER_COUNT;
  const nextRegister = phase + 1;
  const againFitsSameProgram = nextRegister < REGISTER_COUNT;

  let powerUpAgain = { feasible: false, penalty: Infinity };
  if (powerUp.feasible && againFitsSameProgram) {
    const afterPowerUpHistory = getProgramHistoryWindow([
      ...(history || []),
      "WAIT"
    ]);
    const second = evaluateProgramAction(
      afterPowerUpHistory,
      Number(absoluteActions || 0) + 1,
      "WAIT"
    );
    powerUpAgain = {
      feasible: second.feasible,
      penalty: Number((powerUp.penalty + (second.feasible ? second.penalty : 0)).toFixed(2))
    };
  }

  return {
    registerPhase: phase,
    nextRegister,
    currentTurnActions: [...base.currentTurnActions],
    currentProgramFeasible: base.feasible,
    currentProgramRequiresAgain: base.currentRequiresAgain,
    powerUp: {
      feasible: powerUp.feasible,
      reason: powerUp.feasible
        ? null
        : "Power Up is unavailable under the rolling previous-turn card supply"
    },
    powerUpAgain: {
      feasible: powerUpAgain.feasible,
      reason: powerUpAgain.feasible
        ? null
        : !againFitsSameProgram
          ? "Again would be register 1 next turn"
          : "Power Up + Again exceeds rolling two-turn card supply"
    }
  };
}
