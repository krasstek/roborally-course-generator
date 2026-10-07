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

export function analyzeGoalApproaches(tileMap, goal, options = {}) {
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const approaches = [
    { side: "N", from: { x: goal.x, y: goal.y - 1 }, dir: "S" },
    { side: "E", from: { x: goal.x + 1, y: goal.y }, dir: "W" },
    { side: "S", from: { x: goal.x, y: goal.y + 1 }, dir: "N" },
    { side: "W", from: { x: goal.x - 1, y: goal.y }, dir: "E" }
  ].map((approach) => {
    const fromTile = tileMap.get(tileKey(approach.from.x, approach.from.y));
    const move = canMoveBetween(tileMap, approach.from, goal, approach.dir, options);

    return {
      ...approach,
      exists: Boolean(fromTile),
      pit: isPit(fromTile),
      open: move.ok
    };
  });

  const openSides = approaches.filter((approach) => approach.open).map((approach) => approach.side);
  const blockedSides = approaches.filter((approach) => !approach.open).map((approach) => approach.side);
  const adjacentPairs = [
    ["N", "E"],
    ["E", "S"],
    ["S", "W"],
    ["W", "N"]
  ];
  const blockedSet = new Set(blockedSides);
  const trappedCorners = adjacentPairs.filter(([left, right]) => blockedSet.has(left) && blockedSet.has(right)).length;

  return {
    openCount: openSides.length,
    blockedCount: blockedSides.length,
    trappedCorners,
    blockedByPit: approaches.filter((approach) => approach.pit).length,
    blockedByVoid: lessDeadlyGame ? 0 : approaches.filter((approach) => !approach.exists).length
  };
}

function beltLeadsToGoal(tileMap, start, goal, options = {}) {
  const visited = new Set();
  let current = { x: start.x, y: start.y };

  for (let step = 0; step < 12; step += 1) {
    const key = tileKey(current.x, current.y);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);

    const tile = tileMap.get(key);
    const belt = getBelt(tile);
    if (!belt?.dir || !DIRS[belt.dir]) {
      return false;
    }

    const next = {
      x: current.x + DIRS[belt.dir].dx,
      y: current.y + DIRS[belt.dir].dy
    };
    const move = canMoveBetween(tileMap, current, next, belt.dir, options);
    if (!move.ok) {
      return false;
    }
    if (next.x === goal.x && next.y === goal.y) {
      return true;
    }

    current = next;
  }

  return false;
}

export function scoreFlagArea(tileMap, goal, options = {}) {
  let score = 0;
  const playerCount = options.playerCount ?? 1;
  const trafficScale = playerCount <= 1 ? 0 : Math.min(1, (playerCount - 1) / 3);
  const approaches = analyzeGoalApproaches(tileMap, goal, options);
  const blockedApproachScore = approaches.blockedCount * (
    FLAG_APPROACH_WEIGHTS.blockedSideBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.blockedSideTraffic
  );
  const approachCompression = Math.max(0, 3 - approaches.openCount);

  if (approaches.openCount <= 1) {
    score += FLAG_APPROACH_WEIGHTS.singleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.singleOpenTraffic;
  } else if (approaches.openCount === 2) {
    score += FLAG_APPROACH_WEIGHTS.doubleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.doubleOpenTraffic;
  }

  score += blockedApproachScore;
  score += approachCompression * approachCompression * (
    FLAG_APPROACH_WEIGHTS.approachCompressionBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.approachCompressionTraffic
  );
  score += approaches.trappedCorners * (
    FLAG_APPROACH_WEIGHTS.trappedCornerBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.trappedCornerTraffic
  );
  score += approaches.blockedByPit * FLAG_APPROACH_WEIGHTS.blockedByPit;
  score += approaches.blockedByVoid * FLAG_APPROACH_WEIGHTS.blockedByVoid;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = goal.x + dx;
      const y = goal.y + dy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 2) continue;

      const tile = tileMap.get(tileKey(x, y));
      if (!tile) continue;

      for (const feature of tile.features || []) {
        // v49ei: a Homing Missile near a checkpoint is not board danger to the
        // robot that can activate it. Strategic value is route-owned instead.
        if (feature.type === "homingMissile") continue;
        const featureScore = getFlagAreaFeatureScore(feature, dist, {
          batteryActive: isBatteryActive(options),
          cuttingFloor: options.cuttingFloor,
          flamingOil: options.flamingOil,
          repulsorOverdrive: options.repulsorOverdrive,
          upgradeWorld: options.upgradeWorld,
          lessSpammyGame: options.lessSpammyGame,
          criticalSpam: options.criticalSpam,
          criticalHaywire: options.criticalHaywire,
          permanentShutdown: options.permanentShutdown
        });
        if (feature.type === "belt" && beltLeadsToGoal(tileMap, { x, y }, goal, options)) {
          score -= featureScore;
          continue;
        }

        score += featureScore;
      }
    }
  }

  return Number(Math.max(0, score).toFixed(2));
}

// v49dw ownership audit: this first-leg selector is retained only for legacy
// first-leg summary/construction/readability fields after full-course candidate
// selection. It does NOT own the production full-course route. The remaining
// route.score + traffic.total expression here is therefore descriptive debt for
// the later Course Notes/legacy-summary cleanup, not a route-ownership exception.
function assignRoutesWithOverlap(tileMap, startAnalyses, goal, activeIndices = null, options = {}) {
  const selections = startAnalyses.map(() => 0);
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const playerCount = Math.max(1, options.playerCount ?? activeAnalyses.length);

  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;

    for (let index = 0; index < startAnalyses.length; index += 1) {
      const analysis = startAnalyses[index];
      if (!analysis.routes.length || !activeSet.has(analysis.index)) {
        continue;
      }

      const occupancyByIndex = buildConditionalOccupancyMap(
        activeAnalyses,
        analysis.index,
        playerCount,
        options,
        (other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return other.routes[selections[otherIndex] ?? 0];
        }
      );

      const otherRouteEntries = activeAnalyses
        .filter((other) => other.index !== analysis.index)
        .map((other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return {
            route: other.routes[selections[otherIndex] ?? 0],
            occupancyWeight: occupancyByIndex.get(other.index) ?? 0
          };
        })
        .filter((entry) => entry.route && entry.occupancyWeight > 0);

      let bestRouteIndex = selections[index];
      let bestAdjusted = Infinity;

      analysis.routes.forEach((route, routeIndex) => {
        const traffic = getExpectedTrafficBreakdown(
          tileMap,
          route,
          otherRouteEntries,
          [goal],
          {
            ...options,
            singleLegTraffic: true
          }
        );

        const adjusted = route.score + traffic.total;
        if (adjusted < bestAdjusted) {
          bestAdjusted = adjusted;
          bestRouteIndex = routeIndex;
        }
      });

      if (bestRouteIndex !== selections[index]) {
        selections[index] = bestRouteIndex;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return selections;
}
function selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, activeIndices = null, options = {}) {
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const routeCapableStarts = activeAnalyses.length;
  const trafficScale = routeCapableStarts > 1
    ? Math.min(1, Math.max(0, (playerCount - 1) / (routeCapableStarts - 1)))
    : 0;

  if (options.skipTraffic) {
    startAnalyses.forEach((analysis) => {
      const selectedRoute = analysis.routes[0] ?? null;
      analysis.selectedRouteIndex = 0;
      analysis.selectedRoute = selectedRoute;
      analysis.bestScore = selectedRoute?.score ?? Infinity;
      analysis.bestDistance = selectedRoute?.distance ?? Infinity;
      analysis.bestActions = selectedRoute?.actions ?? Infinity;
      if (!selectedRoute) {
        analysis.overlapPenalty = Infinity;
        analysis.lateralThreat = Infinity;
        analysis.rearThreat = Infinity;
        analysis.routeThreat = Infinity;
        analysis.trafficRanged = Infinity;
        analysis.trafficNearby = Infinity;
        analysis.trafficCompetition = Infinity;
        analysis.trafficScale = 0;
        analysis.trafficPenalty = Infinity;
        analysis.adjustedScore = Infinity;
        return;
      }
      analysis.overlapPenalty = 0;
      analysis.lateralThreat = 0;
      analysis.rearThreat = 0;
      analysis.routeThreat = 0;
      analysis.trafficRanged = 0;
      analysis.trafficNearby = 0;
      analysis.trafficCompetition = 0;
      analysis.trafficScale = 0;
      analysis.trafficPenalty = 0;
      analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
      analysis.adjustedScore = Number((
        analysis.bestScore + analysis.courseScoreAdjustment
      ).toFixed(2));
    });
    return { activeSet, trafficScale: 0 };
  }

  const selectedRouteIndices = assignRoutesWithOverlap(
    tileMap,
    startAnalyses,
    goal,
    activeSet,
    {
      ...options,
      playerCount
    }
  );

  startAnalyses.forEach((analysis, index) => {
    const selectedIndex = selectedRouteIndices[index] ?? 0;
    const selectedRoute = analysis.routes[selectedIndex] ?? null;
    analysis.selectedRouteIndex = selectedIndex;
    analysis.selectedRoute = selectedRoute;
    analysis.bestScore = selectedRoute?.score ?? Infinity;
    analysis.bestDistance = selectedRoute?.distance ?? Infinity;
    analysis.bestActions = selectedRoute?.actions ?? Infinity;
  });

  startAnalyses.forEach((analysis) => {
    if (!analysis.selectedRoute) {
      analysis.overlapPenalty = Infinity;
      analysis.lateralThreat = Infinity;
      analysis.rearThreat = Infinity;
      analysis.routeThreat = Infinity;
      analysis.trafficRanged = Infinity;
      analysis.trafficNearby = Infinity;
      analysis.trafficCompetition = Infinity;
      analysis.trafficScale = trafficScale;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
      return;
    }

    const occupancyByIndex = buildConditionalOccupancyMap(
      activeAnalyses,
      analysis.index,
      playerCount,
      options,
      (other) => other.selectedRoute
    );
    const otherRouteEntries = activeAnalyses
      .filter((other) => other.index !== analysis.index && other.selectedRoute)
      .map((other) => ({
        route: other.selectedRoute,
        occupancyWeight: occupancyByIndex.get(other.index) ?? 0
      }))
      .filter((entry) => entry.occupancyWeight > 0);

    const traffic = getExpectedTrafficBreakdown(
      tileMap,
      analysis.selectedRoute,
      otherRouteEntries,
      [goal],
      {
        ...options,
        playerCount,
        singleLegTraffic: true
      }
    );

    analysis.trafficRanged = traffic.ranged;
    analysis.trafficNearby = traffic.nearby;
    analysis.trafficCompetition = traffic.competition;

    // Keep legacy fields populated for older report/diagnostic consumers.
    analysis.overlapPenalty = traffic.competition;
    analysis.lateralThreat = traffic.nearby;
    analysis.rearThreat = traffic.ranged;
    analysis.routeThreat = Number((traffic.ranged + traffic.nearby).toFixed(2));
    analysis.trafficScale = trafficScale;
    analysis.trafficPenalty = traffic.total;
    analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
    analysis.adjustedScore = Number((
      analysis.bestScore +
      analysis.trafficPenalty +
      analysis.courseScoreAdjustment
    ).toFixed(2));
  });

  return {
    activeSet,
    trafficScale
  };
}
function summarizeFirstLegAnalyses(tileMap, startAnalyses, goal, flags, playerCount, options = {}, outlierSet = new Set(), outlierDiagnostics = new Map()) {
  const reachable = startAnalyses.filter((item) => item.reachable && item.selectedRoute);
  const activeReachable = reachable.filter((item) => !outlierSet.has(item.index));
  const adjustedScores = activeReachable.map((item) => item.adjustedScore);
  const distances = activeReachable.map((item) => item.bestDistance);
  const actions = activeReachable.map((item) => item.bestActions);
  const trafficPenaltyValues = activeReachable.map((item) => item.trafficPenalty);
  const overlapValues = activeReachable.map((item) => item.overlapPenalty);
  const lateralThreatValues = activeReachable.map((item) => item.lateralThreat);
  const rearThreatValues = activeReachable.map((item) => item.rearThreat);
  const scoreMean = average(adjustedScores);
  const scoreStdDev = stdDev(adjustedScores);
  const distanceMean = average(distances);
  const actionMean = average(actions);
  const trafficPenaltyMean = average(trafficPenaltyValues);
  const overlapMean = average(overlapValues);
  const lateralThreatMean = average(lateralThreatValues);
  const rearThreatMean = average(rearThreatValues);
  const flagAreaScore = scoreFlagArea(tileMap, goal, {
    playerCount,
    lessDeadlyGame: options.lessDeadlyGame
  });
  const outliers = reachable
    .filter((item) => outlierSet.has(item.index))
    .map((item) => ({
      index: item.index,
      score: item.adjustedScore,
      delta: Number((item.adjustedScore - scoreMean).toFixed(2)),
      actionDelta: Number((item.bestActions - actionMean).toFixed(2)),
      reasons: outlierDiagnostics.get(item.index) ?? null
    }));
  const difficultyScore = Number(scoreMean.toFixed(2));
  const lengthScore = Number(distanceMean.toFixed(2));
  const actionScore = Number(actionMean.toFixed(2));
  const overlapScore = Number(Math.max(0, 100 - overlapMean * 9).toFixed(2));
  const fairnessScore = Number(Math.max(0, 100 - scoreStdDev * 4).toFixed(2));
  const overallScore = Number(
    Math.min(
      100,
      difficultyScore * 0.45 +
      lengthScore * 1 +
      actionScore * 1.2 +
      flagAreaScore * 0.9 +
      (100 - fairnessScore) * 0.12 +
      (100 - overlapScore) * 0.18
    ).toFixed(2)
  );

  return {
    reachable,
    activeReachable,
    scoreMean,
    scoreStdDev,
    actionMean,
    summary: {
      flagCount: flags.length,
      flagAreaScore,
      reachableStarts: reachable.length,
      totalStarts: startAnalyses.length,
      averageTrafficPenalty: Number(trafficPenaltyMean.toFixed(2)),
      averageOverlapPenalty: Number(overlapMean.toFixed(2)),
      averageLateralThreat: Number(lateralThreatMean.toFixed(2)),
      averageRearThreat: Number(rearThreatMean.toFixed(2)),
      difficultyScore,
      lengthScore,
      actionScore,
      overlapScore,
      fairnessScore,
      scoreStdDev: Number(scoreStdDev.toFixed(2)),
      outliers,
      overallScore
    }
  };
}

export function analyzeCourse(tileMap, starts, goal, options = {}) {
  const maxRoutes = options.maxRoutes ?? 4;
  const flags = options.flags ?? [goal];
  const playerCount = options.playerCount ?? starts.length;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const explicitRequiredReachable = Number(options.requiredReachableStarts);
  const requiredReachableStarts = Number.isFinite(explicitRequiredReachable)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredReachable)))
    : null;
  const explicitPreferredReachable = Number(options.preferredReachableStarts);
  const preferredReachableStarts = Number.isFinite(explicitPreferredReachable)
    ? Math.max(
      requiredReachableStarts ?? 1,
      Math.min(starts.length, Math.floor(explicitPreferredReachable))
    )
    : null;
  const stopWhenPreferredLost = Boolean(
    options.stopWhenPreferredReachableLost &&
    requiredReachableStarts &&
    preferredReachableStarts
  );
  const startAnalyses = [];
  let reachableSoFar = 0;
  let unresolvedSoFar = 0;
  let stoppedForPreferredCapacity = false;

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const sharedRouteOptions = {
      maxRoutes,
      maxActions: options.maxActions,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      factoryRejects: Boolean(options.factoryRejects),
      classicSharedDeck: Boolean(options.classicSharedDeck),
      lessForeshadowing: Boolean(options.lessForeshadowing),
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
      routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
      routeEnergyRegisterScore: options.routeEnergyRegisterScore,
      routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
      startingEnergy: options.startingEnergy,
      startingUpgradeCards: options.startingUpgradeCards,
      maxEnergy: options.maxEnergy,
      upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
      upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
      upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
      upgradeUsefulCardRate: options.upgradeUsefulCardRate,
      upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
      upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
      routeRegistersPerTurn: options.routeRegistersPerTurn,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations,
      playerCount,
      rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      contextualEstimatedCardTransitionMemoContext:
        options.contextualEstimatedCardTransitionMemoContext ?? null,
      contextualEstimatedCardTransitionMemoRuleSignature:
        options.contextualEstimatedCardTransitionMemoRuleSignature ?? null,
      portalMap
    };
    const rawRoutes = options.physicalTimingOnly
      ? enumeratePhysicalTimingLegTemplates(
        tileMap,
        {
          state: { x: start.x, y: start.y, facing: start.facing ?? "E" },
          absoluteActions: Number(options.absoluteActions) || 0,
          history: [],
          energyReserve: getInitialRouteEnergyShadowReserve(sharedRouteOptions),
          hazardExposure: 0
        },
        goal,
        {
          ...sharedRouteOptions,
          contextualTelemetryKind: options.physicalTelemetryKind ?? "physical-opening-sketch",
          optionalTemplateExpansions: options.optionalTemplateExpansions ?? 80
        }
      )
      : enumerateRoutes(tileMap, start, goal, sharedRouteOptions);
    const routeSearchMeta = rawRoutes.searchMeta ?? rawRoutes.contextualSearchMeta ?? null;
    const routes = dedupeRoutes(rawRoutes)
      .sort(compareScoredRouteLike)
      .slice(0, maxRoutes);

    const reachable = routes.length > 0;
    const routeSearchUnresolved = Boolean(
      !reachable && (
        routeSearchMeta?.zeroRouteCapFailure ||
        routeSearchMeta?.zeroRouteHorizonFailure
      )
    );
    if (reachable) reachableSoFar += 1;
    if (routeSearchUnresolved) unresolvedSoFar += 1;
    startAnalyses.push({
      index: sourceIndex,
      start,
      reachable,
      routes,
      routeSearchMeta,
      routeSearchUnresolved
    });

    const remaining = starts.length - index - 1;
    const maximumPossibleReachable = reachableSoFar + unresolvedSoFar + remaining;
    if (
      requiredReachableStarts &&
      maximumPossibleReachable < requiredReachableStarts
    ) {
      break;
    }
    if (
      stopWhenPreferredLost &&
      reachableSoFar >= requiredReachableStarts &&
      maximumPossibleReachable < preferredReachableStarts
    ) {
      stoppedForPreferredCapacity = true;
      break;
    }
  }

  // Preserve source indices for skipped starts without pretending they were
  // searched. This lets callers distinguish unresolved capacity from a proven
  // zero-route result while still short-circuiting doomed batches.
  if (startAnalyses.length < starts.length) {
    for (let index = startAnalyses.length; index < starts.length; index += 1) {
      const start = starts[index];
      startAnalyses.push({
        index: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index,
        start,
        reachable: false,
        routes: [],
        capacityUnresolved: true
      });
    }
  }

  if (options.skipTraffic) {
    startAnalyses.forEach((analysis) => {
      const selectedRoute = analysis.routes[0] ?? null;
      analysis.selectedRouteIndex = 0;
      analysis.selectedRoute = selectedRoute;
      analysis.bestScore = selectedRoute?.score ?? Infinity;
      analysis.bestDistance = selectedRoute?.distance ?? Infinity;
      analysis.bestActions = selectedRoute?.actions ?? Infinity;
      analysis.overlapPenalty = selectedRoute ? 0 : Infinity;
      analysis.lateralThreat = selectedRoute ? 0 : Infinity;
      analysis.rearThreat = selectedRoute ? 0 : Infinity;
      analysis.routeThreat = selectedRoute ? 0 : Infinity;
      analysis.trafficScale = 0;
      analysis.trafficPenalty = selectedRoute ? 0 : Infinity;
      analysis.courseScoreAdjustment = 0;
      analysis.adjustedScore = selectedRoute?.score ?? Infinity;
    });
  } else {
    selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, null, options);
  }

  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    goal,
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  finalSummary.summary.capacityShortCircuit = {
    active: Boolean(requiredReachableStarts),
    requiredReachableStarts,
    preferredReachableStarts,
    searchedStarts: startAnalyses.filter((entry) => !entry.capacityUnresolved).length,
    unresolvedStarts: startAnalyses.filter((entry) => (
      entry.capacityUnresolved || entry.routeSearchUnresolved
    )).length,
    cappedUnresolvedStarts: startAnalyses.filter((entry) => entry.routeSearchUnresolved).length,
    stoppedForPreferredCapacity
  };

  return {
    goal,
    starts: startAnalyses,
    summary: finalSummary.summary
  };
}

function summarizeExpectedFullCourseLegRoutes(routes, previousRoutes, goal, playerCount = 4) {
  const routeScores = routes.map((route) => route.score).filter(Number.isFinite);
  const routeDistances = routes.map((route) => route.distance).filter(Number.isFinite);
  const routeActions = routes.map((route) => route.actions).filter(Number.isFinite);
  const intraLegOverlap = averagePairwiseOverlap(routes, goal);
  const crossLegOverlap = averageCrossLegOverlap(routes, previousRoutes, goal);
  const trafficScale = routes.length > 1
    ? clamp((playerCount - 1) / Math.max(1, routes.length - 1), 0, 1)
    : 0;
  const missingRoutePenalty = Math.max(0, playerCount - routes.length) * 10;
  const diversityScore = Number(Math.max(
    0,
    routes.length * 12 - intraLegOverlap * (18 + 12 * trafficScale) - crossLegOverlap * (8 + 8 * trafficScale)
  ).toFixed(2));
  const congestionScore = Number((
    intraLegOverlap * (18 + 24 * trafficScale) +
    crossLegOverlap * (8 + 16 * trafficScale) +
    missingRoutePenalty
  ).toFixed(2));

  return {
    routeCount: routes.length,
    distinctRouteCount: routes.length,
    expectedRouteCount: routes.length,
    expectedRobotPaths: true,
    fullCourseSlices: true,
    bestRouteScore: routeScores.length ? Math.min(...routeScores) : Infinity,
    bestDistance: routeDistances.length ? Math.min(...routeDistances) : Infinity,
    averageRouteScore: Number(average(routeScores).toFixed(2)),
    averageRouteDistance: Number(average(routeDistances).toFixed(2)),
    averageRouteActions: Number(average(routeActions).toFixed(2)),
    routeSpread: routeScores.length > 1 ? Number((Math.max(...routeScores) - Math.min(...routeScores)).toFixed(2)) : 0,
    intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
    crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
    intraLegThreat: 0,
    crossLegThreat: 0,
    diversityScore,
    congestionScore
  };
}


function prepareFullCourseCandidate(route, flags) {
  if (!route) {
    return null;
  }

  const graceRegisters = 0;
  const legRoutes = flags.map((_, legIndex) => (
    applyTrafficGraceToRoute(sliceFullCourseRoute(route, legIndex, flags), graceRegisters)
  ));
  route.legRoutes = legRoutes;
  route.absoluteStartAction = 0;
  applyTrafficGraceToRoute(route, graceRegisters);
  return route;
}

function getFullCourseCorridorDiversity(routeA, routeB, flags) {
  const legsA = routeA?.legRoutes ?? [];
  const legsB = routeB?.legRoutes ?? [];
  const legCount = Math.min(flags.length, legsA.length, legsB.length);
  if (!legCount) {
    const finalGoal = flags.at(-1);
    return finalGoal ? 1 - routeSimilarity(routeA, routeB, finalGoal) : 0;
  }

  const firstComparedLeg = legCount > 1 ? 1 : 0;
  let weightedDifference = 0;
  let totalWeight = 0;
  for (let legIndex = firstComparedLeg; legIndex < legCount; legIndex += 1) {
    const legA = legsA[legIndex];
    const legB = legsB[legIndex];
    const goal = flags[legIndex];
    if (!legA || !legB || !goal) continue;
    const weight = 1 + legIndex * 0.15;
    weightedDifference += (1 - routeSimilarity(legA, legB, goal)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedDifference / totalWeight : 0;
}

function selectCorridorDiverseFullCourseRoutes(routes, flags, limit = 3) {
  if (!routes.length || limit <= 0) return [];
  const remaining = [...routes].sort(compareScoredRouteLike);
  const selected = [remaining.shift()];

  while (selected.length < limit && remaining.length) {
    let bestIndex = -1;
    let bestNovelty = -Infinity;
    let bestScore = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const novelty = Math.min(...selected.map((chosen) => getFullCourseCorridorDiversity(candidate, chosen, flags)));
      if (novelty > bestNovelty + 0.001 || (Math.abs(novelty - bestNovelty) <= 0.001 && candidate.score < bestScore)) {
        bestNovelty = novelty;
        bestScore = candidate.score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestNovelty < 0.12) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.sort(compareScoredRouteLike);
}


function getUniqueFixedRouteAblationRoutes(routes = []) {
  const seen = new Set();
  return (routes || []).filter((route) => {
    if (!route?.transitions?.length || seen.has(route)) return false;
    seen.add(route);
    return true;
  });
}

export function summarizeFixedRouteBoardAblation(
  originalTileMap,
  ablatedTileMap,
  routes = [],
  options = {}
) {
  const routeList = getUniqueFixedRouteAblationRoutes(routes);
  if (
    !(originalTileMap instanceof Map) ||
    !(ablatedTileMap instanceof Map) ||
    !routeList.length
  ) {
    return {
      model: "fixed-route-board-ablation-v49bz",
      observationalOnly: true,
      routeCount: routeList.length,
      originalTileCount: originalTileMap instanceof Map ? originalTileMap.size : 0,
      ablatedTileCount: ablatedTileMap instanceof Map ? ablatedTileMap.size : 0,
      removedTileCount: 0,
      routePositionMissingCount: 0,
      displacementChangedRegisterCount: 0,
      maxDisplacementControlSeverityAbsDelta: 0,
      weightedNearbyControlOriginal: 0,
      weightedNearbyControlAblated: 0,
      weightedNearbyControlAbsDelta: 0,
      weightedRobotLaserOriginal: 0,
      weightedRobotLaserAblated: 0,
      weightedRobotLaserAbsDelta: 0,
      modeledEffectDetected: false,
      coverage:
        "fixed-route displacement/control + robot-laser LOS; no rerouting"
    };
  }

  const removedTileCount = [...originalTileMap.keys()].filter(
    (key) => !ablatedTileMap.has(key)
  ).length;
  const timelines = routeList.map((route) => getRegisterTimeline(route));
  const originalControlProfiles = [];
  const ablatedControlProfiles = [];

  let routePositionMissingCount = 0;
  let displacementChangedRegisterCount = 0;
  let maxDisplacementControlSeverityAbsDelta = 0;

  timelines.forEach((timeline) => {
    const originalProfile = [];
    const ablatedProfile = [];
    timeline.forEach((point, timelineIndex) => {
      if (
        point?.after &&
        !ablatedTileMap.has(tileKey(point.after.x, point.after.y))
      ) {
        routePositionMissingCount += 1;
      }
      const originalSeverity = getDisplacementControlSeverity(
        originalTileMap,
        point?.after,
        timeline,
        timelineIndex,
        options
      );
      const ablatedSeverity = getDisplacementControlSeverity(
        ablatedTileMap,
        point?.after,
        timeline,
        timelineIndex,
        options
      );
      originalProfile.push(originalSeverity);
      ablatedProfile.push(ablatedSeverity);
      const delta = Math.abs(ablatedSeverity - originalSeverity);
      if (delta > 0.0005) {
        displacementChangedRegisterCount += 1;
        maxDisplacementControlSeverityAbsDelta = Math.max(
          maxDisplacementControlSeverityAbsDelta,
          delta
        );
      }
    });
    originalControlProfiles.push(originalProfile);
    ablatedControlProfiles.push(ablatedProfile);
  });

  let weightedNearbyControlOriginal = 0;
  let weightedNearbyControlAblated = 0;
  let weightedRobotLaserOriginal = 0;
  let weightedRobotLaserAblated = 0;
  let interactionPairCount = 0;

  for (let targetIndex = 0; targetIndex < routeList.length; targetIndex += 1) {
    const timelineA = timelines[targetIndex];
    if (!timelineA.length) continue;

    for (let otherIndex = 0; otherIndex < routeList.length; otherIndex += 1) {
      if (targetIndex === otherIndex) continue;
      const timelineB = timelines[otherIndex];
      if (!timelineB.length) continue;

      timelineA.forEach((pointA, timelineIndex) => {
        let temporalMass = 0;
        let strongestTemporal = 0;
        let nearbyOriginalWeighted = 0;
        let nearbyAblatedWeighted = 0;
        let laserOriginalWeighted = 0;
        let laserAblatedWeighted = 0;

        const maximumOtherUncertainty = 2.8;
        const temporalRadius = Math.ceil(
          ((pointA?.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
        );
        const centerIndex = getClosestTimelineIndexByAbsoluteRegister(
          timelineB,
          Number(pointA?.absoluteRegister) || (pointA?.legRegister ?? 1)
        );
        const firstIndex = Math.max(0, centerIndex - temporalRadius);
        const lastIndex = Math.min(
          timelineB.length - 1,
          centerIndex + temporalRadius
        );

        for (
          let pointBIndex = firstIndex;
          pointBIndex <= lastIndex;
          pointBIndex += 1
        ) {
          const pointB = timelineB[pointBIndex];
          const temporal = getTemporalInteractionWeight(pointA, pointB);
          if (temporal <= 0) continue;

          temporalMass += temporal;
          strongestTemporal = Math.max(strongestTemporal, temporal);

          const distance = heuristic(pointA.after, pointB.after);
          const orientation = classifyTrafficOrientation(pointA, pointB);
          const interactionProbability = getNearbyInteractionProbability(
            orientation,
            distance
          );
          nearbyOriginalWeighted += (
            interactionProbability *
            (originalControlProfiles[targetIndex][timelineIndex] ?? 1) *
            temporal
          );
          nearbyAblatedWeighted += (
            interactionProbability *
            (ablatedControlProfiles[targetIndex][timelineIndex] ?? 1) *
            temporal
          );

          laserOriginalWeighted += (
            getRobotRangedPressure(
              originalTileMap,
              pointA,
              pointB,
              options
            ) * temporal
          );
          laserAblatedWeighted += (
            getRobotRangedPressure(
              ablatedTileMap,
              pointA,
              pointB,
              options
            ) * temporal
          );
        }

        if (temporalMass <= 0) return;
        interactionPairCount += 1;
        const credibility = Math.min(1, strongestTemporal);
        weightedNearbyControlOriginal += (
          nearbyOriginalWeighted / temporalMass
        ) * credibility;
        weightedNearbyControlAblated += (
          nearbyAblatedWeighted / temporalMass
        ) * credibility;
        weightedRobotLaserOriginal += (
          laserOriginalWeighted / temporalMass
        ) * credibility;
        weightedRobotLaserAblated += (
          laserAblatedWeighted / temporalMass
        ) * credibility;
      });
    }
  }

  const nearbyAbsDelta = Math.abs(
    weightedNearbyControlAblated - weightedNearbyControlOriginal
  );
  const laserAbsDelta = Math.abs(
    weightedRobotLaserAblated - weightedRobotLaserOriginal
  );
  const modeledEffectDetected = (
    routePositionMissingCount > 0 ||
    displacementChangedRegisterCount > 0 ||
    nearbyAbsDelta > 0.0005 ||
    laserAbsDelta > 0.0005
  );

  return {
    model: "fixed-route-board-ablation-v49bz",
    observationalOnly: true,
    routeCount: routeList.length,
    originalTileCount: originalTileMap.size,
    ablatedTileCount: ablatedTileMap.size,
    removedTileCount,
    routePositionMissingCount,
    displacementChangedRegisterCount,
    maxDisplacementControlSeverityAbsDelta: Number(
      maxDisplacementControlSeverityAbsDelta.toFixed(4)
    ),
    interactionPairCount,
    weightedNearbyControlOriginal: Number(
      weightedNearbyControlOriginal.toFixed(4)
    ),
    weightedNearbyControlAblated: Number(
      weightedNearbyControlAblated.toFixed(4)
    ),
    weightedNearbyControlAbsDelta: Number(nearbyAbsDelta.toFixed(4)),
    weightedRobotLaserOriginal: Number(
      weightedRobotLaserOriginal.toFixed(4)
    ),
    weightedRobotLaserAblated: Number(
      weightedRobotLaserAblated.toFixed(4)
    ),
    weightedRobotLaserAbsDelta: Number(laserAbsDelta.toFixed(4)),
    modeledEffectDetected,
    coverage:
      "fixed-route one-square displacement/control (including destination conveyor/water/hazard/edge consequences) + robot-laser LOS; no rerouting; no generic proximity credit"
  };
}

function getTrafficRouteMixtureEffectiveREQuality(
  tileMap,
  route,
  traffic,
  options = {}
) {
  if (!tileMap || !route) return Infinity;
  const ledger = summarizeRegisterEquivalentLedger(
    tileMap,
    route,
    options,
    null
  );
  const intrinsicRE = Number(
    route.normalFairnessIntrinsicRE ??
    ledger?.observationalSubtotalWithMentalRE
  );
  if (!Number.isFinite(intrinsicRE)) return Infinity;
  const homingMissileStrategicCreditRE = Math.max(
    0,
    Number(ledger?.homingMissileStrategicCreditRE) || 0
  );

  const robotLaserDamageRE = Math.max(
    0,
    Number(traffic?.damageEconomyRobotLaserIncrementRegisterEquivalents) || 0
  );
  const nearbyControlRE = Math.max(
    0,
    Number(traffic?.nearby) || 0
  ) / REGISTER_TEMPO_COST;
  const residualRangedThreatRE = 0; // v49ej: legacy ranged score diagnostic-only
  const competitionRE = Math.max(
    0,
    Number(traffic?.competition) || 0
  ) / REGISTER_TEMPO_COST;
  const trafficMental = summarizeTrafficAwarenessMentalIncrement(
    ledger,
    traffic
  );
  if (traffic && typeof traffic === "object") {
    traffic.trafficAwarenessMentalRegisterEquivalents =
      trafficMental.incrementRE;
    traffic.trafficAwarenessRobotLaserEventMass =
      trafficMental.robotLaserEventMass;
    traffic.trafficAwarenessNonLaserEventMass =
      trafficMental.nonLaserEventMass;
    traffic.trafficAwarenessRebootPileupEventMass =
      trafficMental.rebootPileupEventMass;
    traffic.trafficAwarenessEventMass =
      trafficMental.totalTrafficEventMass;
    traffic.trafficAwarenessMentalByTurn = trafficMental.byTurn;
  }

  return Number((
    intrinsicRE -
    homingMissileStrategicCreditRE +
    robotLaserDamageRE +
    nearbyControlRE +
    residualRangedThreatRE +
    competitionRE +
    trafficMental.incrementRE
  ).toFixed(6));
}

function buildEffectiveRERouteMixture(
  tileMap,
  analysis,
  flags,
  trafficByRoute = null,
  options = {},
  precomputedQualityByRoute = null
) {
  const qualityByRoute = new Map();
  for (const route of analysis?.fullCourseRoutes || []) {
    if (!route) continue;
    const traffic = trafficByRoute instanceof Map
      ? trafficByRoute.get(route) ?? null
      : null;
    const precomputed = precomputedQualityByRoute instanceof Map
      ? Number(precomputedQualityByRoute.get(route))
      : NaN;
    const qualityRE = Number.isFinite(precomputed)
      ? precomputed
      : getTrafficRouteMixtureEffectiveREQuality(
        tileMap,
        route,
        traffic,
        options
      );
    if (Number.isFinite(qualityRE)) {
      qualityByRoute.set(route, qualityRE);
    }
  }
  return buildTrafficRouteMixture(
    analysis,
    flags,
    qualityByRoute,
    {
      model: "effective-re-route-families-v49cb",
      qualityUnit: "register-equivalents",
      qualityScorePerRE: 1
    }
  );
}

function selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, options = {}) {
  const excludedIndices = new Set(options.excludedIndices ?? []);
  const reachable = startAnalyses.filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length &&
    !excludedIndices.has(analysis.index)
  ));
  if (reachable.length <= 1) {
    return {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      averageRawTrafficPenalty: 0,
      averageLegacyRangedTrafficPenalty: 0,
      averageRobotLaserDamageTrafficScore: 0,
      averageRobotLaserDamageTrafficRegisterEquivalents: 0,
      averageResidualRangedThreatTrafficPenalty: 0,
      averageNearbyTrafficPenalty: 0,
      averageCompetitionTrafficPenalty: 0,
      averageForecastConfidence: 1,
      minimumForecastConfidence: 1,
      averageTrafficByLeg: [],
      commonOccupancyField: {
        method: "common-quality-weighted-field",
        playerCount: Math.max(1, options.playerCount ?? reachable.length),
        startCount: reachable.length,
        totalWeight: reachable.length ? 1 : 0,
        weights: reachable.map((analysis) => ({
          index: analysis.index,
          weight: 1,
          qualityScore: Number(analysis.fullCourseRoutes?.[0]?.score ?? analysis.fullCourseRoute?.score ?? 0)
        }))
      },
      routeMixtureByIndex: new Map(
        reachable.map((analysis) => [
          analysis.index,
          buildEffectiveRERouteMixture(
            tileMap,
            analysis,
            flags,
            null,
            options
          )
        ])
      ),
      routeMixtureField: summarizeTrafficRouteMixtures(
        reachable,
        new Map(
          reachable.map((analysis) => [
            analysis.index,
            buildEffectiveRERouteMixture(
              tileMap,
              analysis,
              flags,
              null,
              options
            )
          ])
        )
      ),
      routeFamilyDivergenceField: summarizeTrafficRouteFamilyDivergence(
        reachable,
        flags,
        null,
        null
      ),
      completedRouteOwnershipAudit: {
        model: "completed-route-ownership-audit-v49dn",
        observationalOnly: true,
        behaviorChanged: true,
        comparisonSnapshot: "final frozen occupancy/route-mixture field",
        productionObjective: "completed effective RE",
        legacyComparatorObjective: "pathfinder search cost + traffic search pressure (+4% raw-gap stability after gain gate)",
        minimumUsefulGainScore: 0,
        minimumUsefulGainRE: 0,
        startCount: reachable.length,
        startsWithAlternates: 0,
        currentVsREPreferredDisagreements: 0,
        actualVsCurrentSnapshotDisagreements: 0,
        actualVsREPreferredDisagreements: 0,
        rawREBestBelowThresholdStarts: 0,
        meanForegoneEffectiveRE: 0,
        maximumForegoneEffectiveRE: 0,
        perStart: []
      },
      candidateDiagnostics: reachable.map((analysis) => (
        summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoutes?.[0] ?? analysis.fullCourseRoute ?? null
        )
      ))
    };
  }

  const playerCount = Math.max(1, options.playerCount ?? reachable.length);
  const minimumUsefulTrafficGain = Math.max(
    0,
    Number(options.contextualTrafficAlternateMinGain) || 0
  );
  // v49dn route switching uses the same minimum-useful-gain idea in the
  // authoritative unit. The existing score threshold was historically expressed
  // at REGISTER_TEMPO_COST score per register-equivalent, so preserve its scale
  // by converting it once rather than keeping a parallel score-space owner.
  const minimumUsefulTrafficGainRE =
    minimumUsefulTrafficGain / REGISTER_TEMPO_COST;
  const maxPasses = Math.max(1, Math.min(3, options.fullCourseTrafficPasses ?? 2));
  let routeSwitches = 0;
  let actualPasses = 0;
  let selectedByIndex = new Map(
    reachable.map((analysis) => [analysis.index, analysis.fullCourseRoutes[0]])
  );
  // v49cb: traffic occupancy attractiveness is now RE-native.
  // The first traffic pass has no traffic field yet, so initialize each route
  // family from completed-route intrinsic RE only. Later synchronous passes add
  // traffic RE evaluated against the previous frozen mixture.
  let routeMixtureByIndex = new Map(
    reachable.map((analysis) => [
      analysis.index,
      buildEffectiveRERouteMixture(
        tileMap,
        analysis,
        flags,
        null,
        options
      )
    ])
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    actualPasses = pass + 1;
    let changed = false;

    // v33 traffic epochs are synchronous. Every start evaluates its choices
    // against the same frozen route/occupancy snapshot for this pass; proposed
    // switches become visible only after all starts have been evaluated. This
    // prevents later starts in iteration order from reacting to half-updated
    // traffic while earlier starts saw the old field.
    const frozenSelectedByIndex = new Map(selectedByIndex);
    const proposedSelectedByIndex = new Map(selectedByIndex);
    const frozenRouteMixtureByIndex = new Map(routeMixtureByIndex);
    const proposedRouteMixtureByIndex = new Map(routeMixtureByIndex);

    for (const analysis of reachable) {
      const occupancyByIndex = buildConditionalOccupancyMap(
        reachable,
        analysis.index,
        playerCount,
        options,
        (other) => frozenSelectedByIndex.get(other.index)
      );
      const otherRouteEntries = buildTrafficRouteMixtureEntries(
        reachable,
        analysis.index,
        occupancyByIndex,
        frozenRouteMixtureByIndex
      );

      const baselineRoute = analysis.fullCourseRoutes[0];
      const baselineTrafficLegacy = getExpectedTrafficBreakdown(
        tileMap,
        baselineRoute,
        otherRouteEntries,
        flags,
        {
          ...options,
          playerCount
        }
      );
      const frozenTrafficAnalyses = reachable.map((entry) => ({
        ...entry,
        fullCourseRoute: frozenSelectedByIndex.get(entry.index) ?? entry.fullCourseRoute,
        trafficRouteMixture:
          frozenRouteMixtureByIndex.get(entry.index) ?? entry.trafficRouteMixture ?? null
      }));
      const baselineTraffic = getDamageEconomyTrafficRoutingBreakdown(
        tileMap,
        baselineRoute,
        baselineTrafficLegacy,
        frozenTrafficAnalyses,
        analysis.index,
        flags,
        {
          ...options,
          playerCount,
          trafficRouteMixtureByIndex: frozenRouteMixtureByIndex
        }
      );
      // v49dn production ownership: once physical candidates exist, traffic route
      // switching is judged in completed effective RE, the same semantic owner as
      // route-family attractiveness and Normal fairness. Physical search cost is
      // still allowed to discover candidates, but route.score no longer gets an
      // independent vote after a completed route can be measured in RE.
      const mixtureTrafficByRoute = new Map([
        [baselineRoute, baselineTraffic]
      ]);
      const effectiveREByRoute = new Map();
      const baselineEffectiveRE = getTrafficRouteMixtureEffectiveREQuality(
        tileMap,
        baselineRoute,
        baselineTraffic,
        options
      );
      if (Number.isFinite(baselineEffectiveRE)) {
        effectiveREByRoute.set(baselineRoute, baselineEffectiveRE);
      }
      let bestRoute = baselineRoute;
      let bestEffectiveRE = baselineEffectiveRE;

      for (const candidate of analysis.fullCourseRoutes.slice(1)) {
        const trafficLegacy = getExpectedTrafficBreakdown(
          tileMap,
          candidate,
          otherRouteEntries,
          flags,
          {
            ...options,
            playerCount
          }
        );
        const traffic = getDamageEconomyTrafficRoutingBreakdown(
          tileMap,
          candidate,
          trafficLegacy,
          frozenTrafficAnalyses,
          analysis.index,
          flags,
          {
            ...options,
            playerCount,
            trafficRouteMixtureByIndex: frozenRouteMixtureByIndex
          }
        );
        mixtureTrafficByRoute.set(candidate, traffic);

        const candidateEffectiveRE = getTrafficRouteMixtureEffectiveREQuality(
          tileMap,
          candidate,
          traffic,
          options
        );
        if (!Number.isFinite(candidateEffectiveRE)) continue;
        effectiveREByRoute.set(candidate, candidateEffectiveRE);

        if (Number.isFinite(baselineEffectiveRE)) {
          const gainRE = baselineEffectiveRE - candidateEffectiveRE;
          if (gainRE < minimumUsefulTrafficGainRE) continue;
        }

        if (
          !Number.isFinite(bestEffectiveRE) ||
          candidateEffectiveRE < bestEffectiveRE - 0.0001 ||
          (
            Math.abs(candidateEffectiveRE - bestEffectiveRE) <= 0.0001 &&
            analysis.fullCourseRoutes.indexOf(candidate) <
              analysis.fullCourseRoutes.indexOf(bestRoute)
          )
        ) {
          bestEffectiveRE = candidateEffectiveRE;
          bestRoute = candidate;
        }
      }

      if (bestRoute !== frozenSelectedByIndex.get(analysis.index)) {
        proposedSelectedByIndex.set(analysis.index, bestRoute);
        changed = true;
        routeSwitches += 1;
      }

      const proposedMixture = buildEffectiveRERouteMixture(
        tileMap,
        analysis,
        flags,
        mixtureTrafficByRoute,
        options,
        effectiveREByRoute
      );
      proposedRouteMixtureByIndex.set(analysis.index, proposedMixture);
      if (trafficRouteMixturesDiffer(
        frozenRouteMixtureByIndex.get(analysis.index),
        proposedMixture
      )) {
        changed = true;
      }
    }

    selectedByIndex = proposedSelectedByIndex;
    routeMixtureByIndex = proposedRouteMixtureByIndex;
    if (!changed) {
      break;
    }
  }

  const trafficValues = [];
  const openingTrafficValues = [];
  const laterTrafficValues = [];
  const rawTrafficValues = [];
  // v49bh observational ownership audit. These channels already exist in the
  // production traffic model; this only surfaces their average contribution.
  const legacyRangedTrafficValues = [];
  const robotLaserDamageTrafficScoreValues = [];
  const robotLaserDamageTrafficREValues = [];
  const residualRangedThreatTrafficValues = [];
  const legacyResidualRangedThreatDiagnosticValues = [];
  const nearbyTrafficValues = [];
  const legacyNearbyTrafficValues = [];
  const authoritativeNearbyControlREValues = [];
  const competitionTrafficValues = [];
  const nearbyEventMassValues = [];
  const nearbyControlLoadValues = [];
  const nearbyControlCandidateREValues = [];
  const nearbyControlCandidateScoreValues = [];
  const nearbyTurnEpisodeEventMassValues = [];
  const nearbyTurnEpisodeControlLoadValues = [];
  const nearbyTurnEpisodeControlREValues = [];
  const nearbyTurnEpisodeControlScoreValues = [];
  const trafficAwarenessMentalREValues = [];
  const trafficAwarenessEventMassValues = [];
  const trafficAwarenessRobotLaserEventMassValues = [];
  const trafficAwarenessNonLaserEventMassValues = [];
  const trafficAwarenessRebootPileupEventMassValues = [];
  const simultaneousRebootPileupEventMassValues = [];
  const simultaneousRebootPileupMaxProbabilityValues = [];
  const simultaneousRebootPileupClogREValues = [];
  const confidenceMeanValues = [];
  const confidenceEndValues = [];
  const trafficByLegAccumulator = [];
  const trafficBreakdowns = new Map();
  const candidateEvaluationsByIndex = new Map();

  for (const analysis of reachable) {
    const route = selectedByIndex.get(analysis.index);
    const occupancyByIndex = buildConditionalOccupancyMap(
      reachable,
      analysis.index,
      playerCount,
      options,
      (other) => selectedByIndex.get(other.index)
    );
    const otherRouteEntries = buildTrafficRouteMixtureEntries(
      reachable,
      analysis.index,
      occupancyByIndex,
      routeMixtureByIndex
    );

    const baselineScore = analysis.fullCourseRoutes[0]?.score ?? 0;
    const finalTrafficAnalyses = reachable.map((entry) => ({
      ...entry,
      fullCourseRoute: selectedByIndex.get(entry.index) ?? entry.fullCourseRoute,
      trafficRouteMixture:
        routeMixtureByIndex.get(entry.index) ?? entry.trafficRouteMixture ?? null
    }));
    const candidateEvaluations = analysis.fullCourseRoutes.map((candidate, routeIndex) => {
      const trafficLegacy = getExpectedTrafficBreakdown(
        tileMap,
        candidate,
        otherRouteEntries,
        flags,
        {
          ...options,
          playerCount
        }
      );
      const traffic = getDamageEconomyTrafficRoutingBreakdown(
        tileMap,
        candidate,
        trafficLegacy,
        finalTrafficAnalyses,
        analysis.index,
        flags,
        {
          ...options,
          playerCount,
          trafficRouteMixtureByIndex: routeMixtureByIndex
        }
      );
      const candidateLedger = summarizeRegisterEquivalentLedger(
        tileMap,
        candidate,
        options,
        null
      );
      const trafficMental = summarizeTrafficAwarenessMentalIncrement(
        candidateLedger,
        traffic
      );
      traffic.trafficAwarenessMentalRegisterEquivalents =
        trafficMental.incrementRE;
      traffic.trafficAwarenessRobotLaserEventMass =
        trafficMental.robotLaserEventMass;
      traffic.trafficAwarenessNonLaserEventMass =
        trafficMental.nonLaserEventMass;
      traffic.trafficAwarenessRebootPileupEventMass =
        trafficMental.rebootPileupEventMass;
      traffic.trafficAwarenessEventMass =
        trafficMental.totalTrafficEventMass;
      traffic.trafficAwarenessMentalByTurn = trafficMental.byTurn;

      const rawGap = Math.max(0, candidate.score - baselineScore);
      const strategicValue = candidate.score + traffic.total;

      // v49ch observational ownership audit: candidateLedger is already built here
      // for traffic-awareness mental. Reuse that exact completed-route replay to
      // compare the legacy final traffic-switch objective against the authoritative
      // completed effective-RE language without adding another replay pass.
      const intrinsicRE = Number(candidateLedger?.observationalSubtotalWithMentalRE);
      const homingMissileStrategicCreditRE = Math.max(
        0,
        Number(candidateLedger?.homingMissileStrategicCreditRE) || 0
      );
      const robotLaserDamageRE = Math.max(
        0,
        Number(traffic?.damageEconomyRobotLaserIncrementRegisterEquivalents) || 0
      );
      const nearbyControlRE = Math.max(0, Number(traffic?.nearby) || 0) / REGISTER_TEMPO_COST;
      const residualRangedThreatRE = 0; // v49ej diagnostic-only legacy ranged score
      const competitionRE = Math.max(
        0,
        Number(traffic?.competition) || 0
      ) / REGISTER_TEMPO_COST;
      const trafficMentalRE = Math.max(0, Number(trafficMental.incrementRE) || 0);
      const effectiveRE = Number.isFinite(intrinsicRE)
        ? Number((
          intrinsicRE -
          homingMissileStrategicCreditRE +
          robotLaserDamageRE +
          nearbyControlRE +
          residualRangedThreatRE +
          competitionRE +
          trafficMentalRE
        ).toFixed(6))
        : Infinity;

      return {
        routeIndex,
        route: candidate,
        traffic,
        intrinsicScore: candidate.score,
        intrinsicDelta: candidate.score - baselineScore,
        trafficPenalty: traffic.total,
        strategicValue,
        strategicGain: null,
        combinedValue: strategicValue + rawGap * 0.04,
        intrinsicRE: Number.isFinite(intrinsicRE) ? Number(intrinsicRE.toFixed(6)) : Infinity,
        homingMissileStrategicCreditRE: Number(
          homingMissileStrategicCreditRE.toFixed(6)
        ),
        robotLaserDamageRE: Number(robotLaserDamageRE.toFixed(6)),
        nearbyControlRE: Number(nearbyControlRE.toFixed(6)),
        residualRangedThreatRE: Number(residualRangedThreatRE.toFixed(6)),
        competitionRE: Number(competitionRE.toFixed(6)),
        trafficMentalRE: Number(trafficMentalRE.toFixed(6)),
        effectiveRE
      };
    });
    const baselineStrategicValue = candidateEvaluations[0]?.strategicValue ?? null;
    const baselineEffectiveRE = Number(candidateEvaluations[0]?.effectiveRE);
    for (const evaluation of candidateEvaluations) {
      evaluation.strategicGain = Number.isFinite(baselineStrategicValue)
        ? baselineStrategicValue - evaluation.strategicValue
        : null;
      evaluation.effectiveREGain = Number.isFinite(baselineEffectiveRE) &&
        Number.isFinite(Number(evaluation.effectiveRE))
        ? baselineEffectiveRE - Number(evaluation.effectiveRE)
        : null;
    }
    candidateEvaluationsByIndex.set(analysis.index, candidateEvaluations);
    const selectedEvaluation = candidateEvaluations.find((entry) => entry.route === route)
      ?? candidateEvaluations[0]
      ?? null;
    const breakdown = selectedEvaluation?.traffic ?? {
      ranged: 0,
      nearby: 0,
      competition: 0,
      opening: 0,
      later: 0,
      total: 0
    };

    trafficBreakdowns.set(analysis.index, breakdown);
    trafficValues.push(breakdown.total);
    openingTrafficValues.push(breakdown.opening ?? 0);
    laterTrafficValues.push(breakdown.later ?? 0);
    rawTrafficValues.push(breakdown.rawTotal ?? breakdown.total ?? 0);
    legacyRangedTrafficValues.push(breakdown.legacyRanged ?? breakdown.ranged ?? 0);
    robotLaserDamageTrafficScoreValues.push(
      breakdown.damageEconomyRobotLaserIncrementScore ??
      ((breakdown.damageEconomyRobotLaserIncrementRegisterEquivalents ?? 0) * REGISTER_TEMPO_COST)
    );
    robotLaserDamageTrafficREValues.push(
      breakdown.damageEconomyRobotLaserIncrementRegisterEquivalents ?? 0
    );
    residualRangedThreatTrafficValues.push(breakdown.residualRangedThreatScore ?? 0);
    legacyResidualRangedThreatDiagnosticValues.push(
      breakdown.legacyResidualRangedThreatScoreDiagnostic ?? 0
    );
    nearbyTrafficValues.push(breakdown.nearby ?? 0);
    legacyNearbyTrafficValues.push(
      breakdown.legacyNearby ?? breakdown.nearby ?? 0
    );
    authoritativeNearbyControlREValues.push(
      breakdown.nearbyTurnEpisodeControlRegisterEquivalentsAuthoritative ??
      breakdown.nearbyTurnEpisodeControlRegisterEquivalentsCandidate ??
      0
    );
    competitionTrafficValues.push(breakdown.competition ?? 0);
    nearbyEventMassValues.push(breakdown.nearbyEventMass ?? 0);
    nearbyControlLoadValues.push(breakdown.nearbyControlLoad ?? 0);
    nearbyControlCandidateREValues.push(
      breakdown.nearbyControlRegisterEquivalentsCandidate ?? 0
    );
    nearbyControlCandidateScoreValues.push(
      breakdown.nearbyControlScoreCandidate ?? 0
    );
    nearbyTurnEpisodeEventMassValues.push(
      breakdown.nearbyTurnEpisodeEventMassCandidate ?? 0
    );
    nearbyTurnEpisodeControlLoadValues.push(
      breakdown.nearbyTurnEpisodeControlLoadCandidate ?? 0
    );
    nearbyTurnEpisodeControlREValues.push(
      breakdown.nearbyTurnEpisodeControlRegisterEquivalentsCandidate ?? 0
    );
    nearbyTurnEpisodeControlScoreValues.push(
      breakdown.nearbyTurnEpisodeControlScoreCandidate ?? 0
    );
    trafficAwarenessMentalREValues.push(
      breakdown.trafficAwarenessMentalRegisterEquivalents ?? 0
    );
    trafficAwarenessEventMassValues.push(
      breakdown.trafficAwarenessEventMass ?? 0
    );
    trafficAwarenessRobotLaserEventMassValues.push(
      breakdown.trafficAwarenessRobotLaserEventMass ?? 0
    );
    trafficAwarenessNonLaserEventMassValues.push(
      breakdown.trafficAwarenessNonLaserEventMass ?? 0
    );
    trafficAwarenessRebootPileupEventMassValues.push(
      breakdown.trafficAwarenessRebootPileupEventMass ?? 0
    );
    simultaneousRebootPileupEventMassValues.push(
      breakdown.simultaneousRebootPileupEventMass ?? 0
    );
    simultaneousRebootPileupMaxProbabilityValues.push(
      breakdown.simultaneousRebootPileupMaximumTurnProbability ?? 0
    );
    simultaneousRebootPileupClogREValues.push(
      breakdown.simultaneousRebootPileupClogRegisterEquivalents ?? 0
    );
    confidenceMeanValues.push(breakdown.confidenceMean ?? 1);
    confidenceEndValues.push(breakdown.confidenceEnd ?? 1);
    (breakdown.byLeg || []).forEach((legBreakdown, legIndex) => {
      if (!trafficByLegAccumulator[legIndex]) {
        trafficByLegAccumulator[legIndex] = {
          count: 0, raw: 0, effective: 0, confidence: 0
        };
      }
      const legWeight = legIndex === 0
        ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
        : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
      const bucket = trafficByLegAccumulator[legIndex];
      bucket.count += 1;
      bucket.raw += (legBreakdown.rawTotal ?? legBreakdown.total ?? 0) * legWeight;
      bucket.effective += (legBreakdown.total ?? 0) * legWeight;
      bucket.confidence += legBreakdown.confidenceMean ?? 1;
    });
  }

  const completedRouteOwnershipAudit = summarizeTrafficCompletedRouteOwnershipAudit(
    reachable,
    candidateEvaluationsByIndex,
    selectedByIndex,
    minimumUsefulTrafficGain
  );

  // v49cb: preserve the old pathfinder+traffic mixture as an observational
  // comparator so the behavior change remains measurable in Copy All.
  const legacyRouteMixtureByIndex = new Map();
  for (const analysis of reachable) {
    const evaluations = candidateEvaluationsByIndex.get(analysis.index) || [];
    const legacyQualityByRoute = new Map();
    const baselineScore = analysis.fullCourseRoutes?.[0]?.score ?? 0;
    for (const evaluation of evaluations) {
      const rawGap = Math.max(
        0,
        (Number(evaluation.route?.score) || 0) - baselineScore
      );
      const legacyQuality =
        (Number(evaluation.route?.score) || 0) +
        (Number(evaluation.traffic?.total) || 0) +
        rawGap * 0.04;
      legacyQualityByRoute.set(evaluation.route, legacyQuality);
    }
    legacyRouteMixtureByIndex.set(
      analysis.index,
      buildTrafficRouteMixture(
        analysis,
        flags,
        legacyQualityByRoute,
        {
          model: "legacy-pathfinder-plus-traffic-route-families-observational",
          qualityUnit: "pathfinder-score",
          qualityScorePerRE: REGISTER_TEMPO_COST
        }
      )
    );
  }
  const routeMixtureOwnershipAudit = summarizeTrafficRouteMixtureOwnershipAudit(
    reachable,
    legacyRouteMixtureByIndex,
    routeMixtureByIndex
  );
  routeMixtureOwnershipAudit.behaviorChanged = true;
  routeMixtureOwnershipAudit.currentOwnership =
    "LIVE completed-route effective RE mixture";
  routeMixtureOwnershipAudit.comparatorOwnership =
    "OBSERVATIONAL legacy pathfinder route.score + traffic (+4% raw-gap stability)";

  const commonOccupancyByIndex = buildStartOccupancyMap(
    reachable,
    playerCount,
    options,
    (analysis) => selectedByIndex.get(analysis.index)
  );
  const commonOccupancyField = {
    method: "common-quality-weighted-field",
    playerCount,
    startCount: reachable.length,
    totalWeight: Number([...commonOccupancyByIndex.values()].reduce(
      (sum, value) => sum + value,
      0
    ).toFixed(3)),
    weights: reachable
      .map((analysis) => ({
        index: analysis.index,
        weight: Number((commonOccupancyByIndex.get(analysis.index) ?? 0).toFixed(4)),
        qualityScore: Number(getOccupancyQualityScore(
          analysis,
          options,
          (entry) => selectedByIndex.get(entry.index)
        ).toFixed(2))
      }))
      .sort((left, right) => left.index - right.index)
  };
  const routeMixtureField = summarizeTrafficRouteMixtures(
    reachable,
    routeMixtureByIndex
  );
  const routeFamilyDivergenceField = summarizeTrafficRouteFamilyDivergence(
    reachable,
    flags,
    routeMixtureByIndex,
    selectedByIndex
  );

  return {
    starts: startAnalyses.map((analysis) => {
      const selectedRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoute;
      if (!selectedRoute) {
        return analysis;
      }

      const breakdown = trafficBreakdowns.get(analysis.index) ?? {
        ranged: 0,
        nearby: 0,
        competition: 0,
        total: 0
      };

      return {
        ...analysis,
        fullCourseRoute: selectedRoute,
        fullCourseTrafficPenalty: breakdown.total,
        fullCourseTrafficRawPenalty: breakdown.rawTotal ?? breakdown.total,
        fullCourseTrafficRanged: breakdown.ranged,
        fullCourseTrafficLegacyRanged: breakdown.legacyRanged ?? breakdown.ranged,
        fullCourseTrafficLegacyPenalty: breakdown.legacyTotal ?? breakdown.total,
        fullCourseTrafficLegacyRobotLaserDamageProxyScore:
          breakdown.legacyRobotLaserDamageProxyScore ?? 0,
        fullCourseTrafficResidualRangedThreatScore: 0,
        fullCourseTrafficLegacyResidualRangedThreatScoreDiagnostic:
          breakdown.legacyResidualRangedThreatScoreDiagnostic ?? 0,
        fullCourseTrafficDamageEconomyRobotLaserIncrementRegisterEquivalents:
          breakdown.damageEconomyRobotLaserIncrementRegisterEquivalents ?? 0,
        fullCourseTrafficDamageEconomyRobotLaserIncrementScore:
          breakdown.damageEconomyRobotLaserIncrementScore ?? 0,
        fullCourseTrafficDamageEconomyIntrinsicRegisterEquivalents:
          breakdown.damageEconomyIntrinsicRegisterEquivalents ??
          selectedRoute.intrinsicDamageEconomyRegisterEquivalents ?? 0,
        fullCourseTrafficDamageEconomyFullRegisterEquivalents:
          breakdown.damageEconomyFullRegisterEquivalents ??
          selectedRoute.intrinsicDamageEconomyRegisterEquivalents ?? 0,
        fullCourseTrafficDamageEconomyShutdownReferenceRegisterEquivalents:
          breakdown.damageEconomyShutdownReferenceRegisterEquivalents ??
          DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
        fullCourseTrafficDamageEconomyFullShutdownEquivalentRegisterEquivalents:
          breakdown.damageEconomyFullShutdownEquivalentRegisterEquivalents ??
          selectedRoute.intrinsicDamageShutdownEquivalentRegisterEquivalents ?? 0,
        fullCourseTrafficNearby: breakdown.nearby,
        fullCourseTrafficNearbyTurnEpisodeByTurn:
          breakdown.nearbyTurnEpisodeByTurn ?? [],
        fullCourseTrafficSimultaneousRebootPileupEventMass:
          breakdown.simultaneousRebootPileupEventMass ?? 0,
        fullCourseTrafficSimultaneousRebootPileupMaximumTurnProbability:
          breakdown.simultaneousRebootPileupMaximumTurnProbability ?? 0,
        fullCourseTrafficSimultaneousRebootPileupClogRegisterEquivalents:
          breakdown.simultaneousRebootPileupClogRegisterEquivalents ?? 0,
        fullCourseTrafficSimultaneousRebootPileupByTurn:
          breakdown.simultaneousRebootPileupByTurn ?? [],
        fullCourseTrafficAwarenessMentalRegisterEquivalents:
          breakdown.trafficAwarenessMentalRegisterEquivalents ?? 0,
        fullCourseTrafficAwarenessEventMass:
          breakdown.trafficAwarenessEventMass ?? 0,
        fullCourseTrafficAwarenessRobotLaserEventMass:
          breakdown.trafficAwarenessRobotLaserEventMass ?? 0,
        fullCourseTrafficAwarenessNonLaserEventMass:
          breakdown.trafficAwarenessNonLaserEventMass ?? 0,
        fullCourseTrafficAwarenessRebootPileupEventMass:
          breakdown.trafficAwarenessRebootPileupEventMass ?? 0,
        fullCourseTrafficAwarenessMentalByTurn:
          breakdown.trafficAwarenessMentalByTurn ?? [],
        fullCourseTrafficCompetition: breakdown.competition,
        fullCourseTrafficForecastConfidence: breakdown.confidenceMean ?? 1,
        fullCourseTrafficForecastConfidenceEnd: breakdown.confidenceEnd ?? 1,
        fullCourseRouteIndex: analysis.fullCourseRoutes.indexOf(selectedRoute),
        trafficRouteMixture:
          routeMixtureByIndex.get(analysis.index) ?? analysis.trafficRouteMixture ?? null
      };
    }),
    selectionPasses: actualPasses,
    routeSwitches,
    commonOccupancyField,
    routeMixtureByIndex,
    routeMixtureField,
    routeMixtureOwnershipAudit,
    completedRouteOwnershipAudit,
    legacyRouteMixtureByIndex,
    routeFamilyDivergenceField,
    averageTrafficPenalty: Number(average(trafficValues).toFixed(2)),
    maxTrafficPenalty: trafficValues.length
      ? Number(Math.max(...trafficValues).toFixed(2))
      : 0,
    averageOpeningTrafficPenalty: Number(average(openingTrafficValues).toFixed(2)),
    averageLaterTrafficPenalty: Number(average(laterTrafficValues).toFixed(2)),
    averageRawTrafficPenalty: Number(average(rawTrafficValues).toFixed(2)),
    averageLegacyRangedTrafficPenalty: Number(average(legacyRangedTrafficValues).toFixed(2)),
    averageRobotLaserDamageTrafficScore: Number(average(robotLaserDamageTrafficScoreValues).toFixed(2)),
    averageRobotLaserDamageTrafficRegisterEquivalents: Number(average(robotLaserDamageTrafficREValues).toFixed(3)),
    averageResidualRangedThreatTrafficPenalty: Number(average(residualRangedThreatTrafficValues).toFixed(2)),
    averageLegacyResidualRangedThreatDiagnosticPenalty: Number(
      average(legacyResidualRangedThreatDiagnosticValues).toFixed(2)
    ),
    averageNearbyTrafficPenalty: Number(average(nearbyTrafficValues).toFixed(2)),
    averageLegacyNearbyTrafficPenalty: Number(
      average(legacyNearbyTrafficValues).toFixed(2)
    ),
    averageAuthoritativeNearbyControlRegisterEquivalents: Number(
      average(authoritativeNearbyControlREValues).toFixed(3)
    ),
    averageCompetitionTrafficPenalty: Number(average(competitionTrafficValues).toFixed(2)),
    averageNearbyInteractionEventMassCandidate: Number(average(nearbyEventMassValues).toFixed(3)),
    averageNearbyControlLoadCandidate: Number(average(nearbyControlLoadValues).toFixed(3)),
    averageNearbyControlRegisterEquivalentsCandidate: Number(
      average(nearbyControlCandidateREValues).toFixed(3)
    ),
    averageNearbyControlScoreCandidate: Number(
      average(nearbyControlCandidateScoreValues).toFixed(2)
    ),
    averageNearbyTurnEpisodeEventMassCandidate: Number(
      average(nearbyTurnEpisodeEventMassValues).toFixed(3)
    ),
    averageNearbyTurnEpisodeControlLoadCandidate: Number(
      average(nearbyTurnEpisodeControlLoadValues).toFixed(3)
    ),
    averageNearbyTurnEpisodeControlRegisterEquivalentsCandidate: Number(
      average(nearbyTurnEpisodeControlREValues).toFixed(3)
    ),
    averageNearbyTurnEpisodeControlScoreCandidate: Number(
      average(nearbyTurnEpisodeControlScoreValues).toFixed(2)
    ),
    averageTrafficAwarenessMentalRegisterEquivalents: Number(
      average(trafficAwarenessMentalREValues).toFixed(4)
    ),
    averageTrafficAwarenessEventMass: Number(
      average(trafficAwarenessEventMassValues).toFixed(4)
    ),
    averageTrafficAwarenessRobotLaserEventMass: Number(
      average(trafficAwarenessRobotLaserEventMassValues).toFixed(4)
    ),
    averageTrafficAwarenessNonLaserEventMass: Number(
      average(trafficAwarenessNonLaserEventMassValues).toFixed(4)
    ),
    averageTrafficAwarenessRebootPileupEventMass: Number(
      average(trafficAwarenessRebootPileupEventMassValues).toFixed(4)
    ),
    averageSimultaneousRebootPileupEventMass: Number(
      average(simultaneousRebootPileupEventMassValues).toFixed(4)
    ),
    averageSimultaneousRebootPileupMaximumTurnProbability: Number(
      average(simultaneousRebootPileupMaxProbabilityValues).toFixed(4)
    ),
    averageSimultaneousRebootPileupClogRegisterEquivalents: Number(
      average(simultaneousRebootPileupClogREValues).toFixed(4)
    ),
    averageForecastConfidence: Number(average(confidenceMeanValues).toFixed(3)),
    minimumForecastConfidence: confidenceEndValues.length
      ? Number(Math.min(...confidenceEndValues).toFixed(3))
      : 1,
    averageTrafficByLeg: trafficByLegAccumulator.map((bucket, legIndex) => ({
      leg: legIndex + 1,
      raw: bucket?.count ? Number((bucket.raw / bucket.count).toFixed(2)) : 0,
      effective: bucket?.count ? Number((bucket.effective / bucket.count).toFixed(2)) : 0,
      confidence: bucket?.count ? Number((bucket.confidence / bucket.count).toFixed(3)) : 1
    })),
    candidateDiagnostics: reachable.map((analysis) => (
      summarizeFullCourseCandidateDiversity(
        analysis,
        flags,
        selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoutes?.[0] ?? null,
        candidateEvaluationsByIndex.get(analysis.index) ?? []
      )
    ))
  };
}
function buildStartAnalysisForSelectedFullRoute(analysis) {
  const fullRoute = analysis.fullCourseRoute;
  const legRoutes = fullRoute?.legRoutes ?? [];
  const firstLegRoute = legRoutes[0] ?? null;
  const continuationScore = fullRoute && firstLegRoute
    ? Number((fullRoute.score - firstLegRoute.score).toFixed(2))
    : 0;
  const continuationActions = fullRoute && firstLegRoute
    ? Math.max(0, fullRoute.actions - firstLegRoute.actions)
    : 0;
  const continuationDistance = fullRoute && firstLegRoute
    ? Number((fullRoute.distance - firstLegRoute.distance).toFixed(2))
    : 0;

  return {
    ...analysis,
    reachable: Boolean(firstLegRoute && fullRoute),
    routes: firstLegRoute ? [firstLegRoute] : [],
    selectedRouteIndex: 0,
    selectedRoute: firstLegRoute,
    bestScore: firstLegRoute?.score ?? Infinity,
    bestDistance: firstLegRoute?.distance ?? Infinity,
    bestActions: firstLegRoute?.actions ?? Infinity,
    courseEstimate: fullRoute
      ? {
        continuationScore,
        continuationActions,
        continuationDistance,
        totalScore: fullRoute.score,
        totalActions: fullRoute.actions,
        totalDistance: fullRoute.distance,
        fullCourseTrafficPenalty: analysis.fullCourseTrafficPenalty ?? 0,
        selectedRouteIndex: analysis.fullCourseRouteIndex ?? 0,
        candidateCount: analysis.fullCourseRoutes?.length ?? 0,
        legs: legRoutes.map((route, legIndex) => ({
          flag: legIndex + 1,
          score: route?.score ?? null,
          actions: route?.actions ?? null,
          absoluteActions: route?.absoluteActions ?? null,
          distance: route?.distance ?? null,
          movingTarget: route?.movingTarget ?? null,
          reachable: Boolean(route)
        }))
      }
      : null,
    courseScoreAdjustment: 0,
    balanceScore: fullRoute?.score ?? Infinity
  };
}

function applyIntrinsicFullCourseBalanceScores(startAnalyses, options = {}) {
  const useFullTraffic = options.balanceTrafficScope === "full";
  (startAnalyses || []).forEach((analysis) => {
    const intrinsic = Number(analysis?.fullCourseRoute?.score);
    const traffic = Number(
      useFullTraffic
        ? analysis?.fullCourseTrafficPenalty
        : analysis?.trafficPenalty
    );
    analysis.balanceScore = Number.isFinite(intrinsic)
      ? Number((intrinsic + (Number.isFinite(traffic) ? traffic : 0)).toFixed(2))
      : Infinity;
  });
  return startAnalyses;
}


export const NORMAL_FAIRNESS_RE_MODEL_ID =
  "normal-full-course-effective-re-v49bp-player-floor";

// Normal fairness is expressed directly in Register Equivalents; v49bp treats player count as the pruning floor. This is a
// completed-route fairness ledger, not a hot-path search objective.
//
// Intrinsic side:
//   programmed registers + lost-register tempo + exact clean-card plausibility +
//   production damage economy + Energy economy + completed-route intrinsic mental.
//
// Traffic side:
//   marginal robot-laser damage RE + authoritative nearby turn-episode control RE
//   + the currently retained residual ranged-threat score converted to RE
//   + v49cc traffic-awareness mental RE.
// Competition is structurally available but currently scales to zero.
//
// Traffic-awareness mental is downstream only: it affects completed effective RE,
// route-family occupancy attractiveness and fairness, but it is NOT hot pathfinder
// state. Robot-laser and non-laser planning mass share the same turn mental curve;
// mechanical damage/control consequence remains separately owned.
function applyNormalFullCourseEffectiveREFairnessScores(
  tileMap,
  startAnalyses,
  options = {}
) {
  for (const analysis of startAnalyses || []) {
    const route = analysis?.fullCourseRoute ?? null;
    if (!route || !tileMap) {
      analysis.normalFairnessEffectiveRE = Infinity;
      analysis.normalFairnessRegisterCount = Number.isFinite(route?.actions)
        ? route.actions
        : Infinity;
      continue;
    }

    let intrinsicRE = Number(route.normalFairnessIntrinsicRE);
    let intrinsicLedger = null;
    if (!Number.isFinite(intrinsicRE)) {
      intrinsicLedger = summarizeRegisterEquivalentLedger(
        tileMap,
        route,
        options,
        null
      );
      intrinsicRE = Number(
        intrinsicLedger?.observationalSubtotalWithMentalRE
      );
      if (Number.isFinite(intrinsicRE)) {
        route.normalFairnessIntrinsicRE = Number(intrinsicRE.toFixed(4));
        route.normalFairnessIntrinsicREModel = NORMAL_FAIRNESS_RE_MODEL_ID;
        route.normalFairnessIntrinsicREComponents = {
          programmedRegisterRE:
            intrinsicLedger?.programmedRegisterRE ?? null,
          lostRegisterTempoRE:
            intrinsicLedger?.lostRegisterTempoRE ?? null,
          cleanCardPlausibilityRE:
            intrinsicLedger?.cleanCardPlausibilityRE ?? null,
          damageCardSupplyRE:
            intrinsicLedger?.damageCardSupplyRE ?? null,
          clogRE:
            intrinsicLedger?.clogRE ?? null,
          energyRE:
            intrinsicLedger?.energyRE ?? null,
          mentalRE:
            intrinsicLedger?.mentalRegisterEquivalents ?? null
        };
      }
    }

    if (!intrinsicLedger) {
      intrinsicLedger = summarizeRegisterEquivalentLedger(
        tileMap,
        route,
        options,
        null
      );
    }

    const homingMissileStrategicCreditRE = Math.max(
      0,
      Number(intrinsicLedger?.homingMissileStrategicCreditRE) || 0
    );
    const robotLaserDamageRE = Math.max(
      0,
      Number(
        analysis.fullCourseTrafficDamageEconomyRobotLaserIncrementRegisterEquivalents
      ) || 0
    );
    const nearbyControlRE = Math.max(
      0,
      Number(analysis.fullCourseTrafficNearby) || 0
    ) / REGISTER_TEMPO_COST;
    const residualRangedThreatRE = 0; // v49ej diagnostic-only legacy ranged score
    const competitionRE = Math.max(
      0,
      Number(analysis.fullCourseTrafficCompetition) || 0
    ) / REGISTER_TEMPO_COST;
    const trafficMentalRE = Math.max(
      0,
      Number(
        analysis.fullCourseTrafficAwarenessMentalRegisterEquivalents
      ) || 0
    );

    const effectiveRE = Number.isFinite(intrinsicRE)
      ? (
        intrinsicRE -
        homingMissileStrategicCreditRE +
        robotLaserDamageRE +
        nearbyControlRE +
        residualRangedThreatRE +
        competitionRE +
        trafficMentalRE
      )
      : Infinity;

    analysis.normalFairnessEffectiveRE = Number.isFinite(effectiveRE)
      ? Number(effectiveRE.toFixed(4))
      : Infinity;
    analysis.normalFairnessIntrinsicRE = Number.isFinite(intrinsicRE)
      ? Number(intrinsicRE.toFixed(4))
      : Infinity;
    analysis.normalFairnessRegisterCount = Math.max(
      0,
      Number(route.actions) || 0
    );
    analysis.normalFairnessModel = NORMAL_FAIRNESS_RE_MODEL_ID;
    analysis.normalFairnessComponents = {
      intrinsicRE: Number.isFinite(intrinsicRE)
        ? Number(intrinsicRE.toFixed(4))
        : null,
      homingMissileStrategicCreditRE: Number(
        homingMissileStrategicCreditRE.toFixed(4)
      ),
      robotLaserDamageRE: Number(robotLaserDamageRE.toFixed(4)),
      nearbyControlRE: Number(nearbyControlRE.toFixed(4)),
      residualRangedThreatRE: Number(residualRangedThreatRE.toFixed(4)),
      competitionRE: Number(competitionRE.toFixed(4)),
      trafficMentalRE: Number(trafficMentalRE.toFixed(4)),
      trafficMentalIncluded: true,
      robotLaserTrafficMentalIncluded: true,
      nonLaserTrafficMentalIncluded: true
    };
  }
  return startAnalyses;
}

function buildExpectedLegAnalysesFromFullRoutes(startAnalyses, flags, playerCount) {
  const perLegRoutes = Array.from({ length: flags.length }, () => []);

  for (const startAnalysis of startAnalyses) {
    const fullRoute = startAnalysis.fullCourseRoute;
    if (!fullRoute) {
      continue;
    }

    for (let legIndex = 0; legIndex < flags.length; legIndex += 1) {
      const legRoute = fullRoute.legRoutes?.[legIndex];
      if (legRoute) {
        perLegRoutes[legIndex].push({
          ...legRoute,
          startIndex: startAnalysis.index,
          label: `Start ${startAnalysis.index + 1} leg ${legIndex === 0 ? "dock" : legIndex} -> ${legIndex + 1}`
        });
      }
    }
  }

  let previousLegRoutes = [];
  return perLegRoutes.map((routes, index) => {
    const goal = flags[index];
    const summary = summarizeExpectedFullCourseLegRoutes(routes, previousLegRoutes, goal, playerCount);
    previousLegRoutes = routes;
    return {
      from: index === 0 ? "dock" : flags[index - 1],
      goal,
      routes,
      distinctRoutes: routes,
      summary
    };
  });
}


const CONTEXTUAL_OPENING_ROUTES = 2;
const CONTEXTUAL_LATER_ROUTES = 3;
const CONTEXTUAL_BEAM_WIDTH = 2;
const CONTEXTUAL_COMPLETION_POOL = 4;
const CONTEXTUAL_OPENING_EXPANSIONS = 7000;
const CONTEXTUAL_LATER_EXPANSIONS = 6000;
const CONTEXTUAL_LEG_MAX_ACTIONS = 24;
const CONTEXTUAL_TEMPLATE_POOL = 6;
const CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT = 14;
// Extra completion search is deliberately a confidence bonus, not a second
// viability requirement. Every mode uses the same adaptive uncertainty rule;
// alternative-retention callers merely move along it more slowly.
const CONTEXTUAL_OPTIONAL_COMPLETION_RATIO = 0.12;
const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START = 0.45;
const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP = 0.70;
const CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER = 1.75;

// Search-state identity deliberately uses a coarser summary than the literal
// rolling card allocator. Hard legality is still checked on every concrete branch
// by getRollingProgramResourceContext(); this signature only decides when two
// already-legal speculative futures may share a dominance bucket.
//
// Why this is intentionally lossy:
// - Dev View must show a real five-register program, so concrete parent chains are
//   never synthesized from the summary.
// - The previous turn is itself an abstraction of a 20-card deck / 9-card hand,
//   and far-future exact allocation correlations are not useful predictions.
// - Low-copy cards are the ones whose depletion materially changes plausible next
//   programs. Four-copy cards retain hard legality checks but do not fragment the
//   dominance key merely because their speculative usage differed.
// - Again availability and the immediately previous action remain explicit because
//   they can change whether the very next register is playable.
function getProgramCacheSignature(history, absoluteActions, options = {}) {
  // Exact rolling two-program identity, including depletion of the common four-copy
  // cards. The active programming-variant model is part of the key because Less
  // Foreshadowing changes carried depletion and Factory Rejects/Shared Deck change
  // scarcity evaluation even when the physical history is identical.
  return `${getProgramCardModelSignature(options)}|q${getRollingProgramResourceContext(
    history,
    absoluteActions,
    null,
    options.programHistoryAbsoluteActions,
    options
  ).pairSignatureId}`;
}

function getDynamicGoalCachePhase(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) {
    return "-";
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  if (periodLength > 0 && absoluteActions >= periodStart) {
    return `${periodStart}+${(absoluteActions - periodStart) % periodLength}`;
  }

  return String(
    Math.min(absoluteActions, Math.max(0, positions.length - 1))
  );
}

const CONTEXTUAL_FACING_CODE = Object.freeze({ N: 0, E: 1, S: 2, W: 3 });
const CONTEXTUAL_COORD_OFFSET = 32768;
const CONTEXTUAL_COORD_RADIX = 65536;
const CONTEXTUAL_GOAL_PHASE_RADIX = 65536;

function getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) return 0;
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && absolute >= periodStart
    ? periodStart + ((absolute - periodStart) % periodLength)
    : Math.min(absolute, Math.max(0, positions.length - 1));
  return phase + 1;
}

function getContextualPhysicalRegisterCode(state, absoluteActions) {
  const x = Math.floor(Number(state?.x));
  const y = Math.floor(Number(state?.y));
  const facingCode = CONTEXTUAL_FACING_CODE[state?.facing ?? "E"];
  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  if (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= -CONTEXTUAL_COORD_OFFSET && x < CONTEXTUAL_COORD_OFFSET &&
    y >= -CONTEXTUAL_COORD_OFFSET && y < CONTEXTUAL_COORD_OFFSET &&
    Number.isInteger(facingCode)
  ) {
    return (
      (((x + CONTEXTUAL_COORD_OFFSET) * CONTEXTUAL_COORD_RADIX +
        (y + CONTEXTUAL_COORD_OFFSET)) * 4 + facingCode) *
        REGISTER_COUNT + phase
    );
  }
  return contextualNumericFallbackId(x, y, facingCode ?? -1, phase);
}

function getContextualPhysicalGoalCode(state, absoluteActions, dynamicGoal) {
  const physicalCode = getContextualPhysicalRegisterCode(state, absoluteActions);
  const goalPhaseCode = getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions);
  if (
    physicalCode >= 0 &&
    goalPhaseCode >= 0 && goalPhaseCode < CONTEXTUAL_GOAL_PHASE_RADIX
  ) {
    return physicalCode * CONTEXTUAL_GOAL_PHASE_RADIX + goalPhaseCode;
  }
  return contextualNumericFallbackId(physicalCode, goalPhaseCode);
}

function getContextualArchiveAwarePhysicalGoalCode(
  state,
  absoluteActions,
  dynamicGoal,
  dynamicArchivePoint,
  options = {}
) {
  const physicalGoalCode = getContextualPhysicalGoalCode(
    state,
    absoluteActions,
    dynamicGoal
  );
  if (options.recoveryRule !== "dynamic_archiving") {
    return physicalGoalCode;
  }

  // Archive position is true route state. Two otherwise-identical search nodes
  // can have different lethal-terrain consequences if they would reboot to
  // different prior checkpoints/Batteries. Intern only this Dynamic-Archiving
  // extension so the ordinary hot key remains unchanged.
  return contextualNumericFallbackId(
    physicalGoalCode,
    dynamicArchivePoint?.x ?? CONTEXTUAL_COORD_RADIX,
    dynamicArchivePoint?.y ?? CONTEXTUAL_COORD_RADIX
  );
}


function getContextualSearchNumericStateParts(
  state,
  absoluteActions,
  programCardState,
  dynamicGoal,
  dynamicArchivePoint = null,
  options = {}
) {
  return {
    physicalGoalCode: getContextualArchiveAwarePhysicalGoalCode(
      state,
      absoluteActions,
      dynamicGoal,
      dynamicArchivePoint,
      options
    ),
    cardStateCode: getCompactProgramCardStateCode(programCardState)
  };
}

function getContextualBestCost(bestCostByState, parts) {
  return bestCostByState
    .get(parts.physicalGoalCode)
    ?.get(parts.cardStateCode);
}

function setContextualBestCost(bestCostByState, parts, cost) {
  let cardCosts = bestCostByState.get(parts.physicalGoalCode);
  if (!cardCosts) {
    cardCosts = new Map();
    bestCostByState.set(parts.physicalGoalCode, cardCosts);
  }
  cardCosts.set(parts.cardStateCode, cost);
}

function getNestedBestCost(bestCostByState, primaryCode, secondaryCode) {
  return bestCostByState.get(primaryCode)?.get(secondaryCode);
}

function setNestedBestCost(bestCostByState, primaryCode, secondaryCode, cost) {
  let secondary = bestCostByState.get(primaryCode);
  if (!secondary) {
    secondary = new Map();
    bestCostByState.set(primaryCode, secondary);
  }
  secondary.set(secondaryCode, cost);
}


function getContextualLegCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  const fastCardState = options.contextualFastCardState !== false;
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    getContextualProgramCacheSignature(context, options),
    !fastCardState && isRouteAwareBatteryScoringActive(options)
      ? `a${context.absoluteActions}`
      : null,
    !fastCardState
      ? (getRouteEnergyShadowReserveKey(context.energyReserve, options) || null)
      : null,
    getDynamicArchiveStateKey(context.dynamicArchivePoint, options) || null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

function getContextualTemplateCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    isRouteAwareBatteryScoringActive(options) ? `a${context.absoluteActions}` : null,
    getRouteEnergyShadowReserveKey(context.energyReserve, options) || null,
    getDynamicArchiveStateKey(context.dynamicArchivePoint, options) || null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

// Shared physical/timing identity for the v22 later-leg catalogue. Register phase
// is deliberately immutable: all robots share one five-register board clock, so a
// route beginning on register 2 is not a substitute for the same geometry beginning
// on register 4. Previous-program depletion, Energy reserve, accumulated hazard and
// original dock identity are baggage, not catalogue identity; they are replayed or
// repriced after a trace is discovered. v48zb also treats exact Dynamic Archive
// position as replay baggage here: cheap templates use a leg-local recovery proxy,
// while exact replay reconstructs the actual checkpoint/Battery marker. Moving goals
// contribute their physical phase. Home Reboot keeps a start namespace because its
// legal reboot token set really is start-specific rather than historical bookkeeping.
function getContextualSharedLegCatalogueKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  return [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].join("|");
}

function getContextualProgramCacheSignature(context, options = {}) {
  if (context?.programCardState) {
    // Leg-level cache lookup happens once per context, not once per expansion.
    // Keep an explicit prefix for collision safety/readability; the expanded-state
    // hot path is numeric.
    return `${getProgramCardModelSignature(options)}|c${getCompactProgramCardStateCode(context.programCardState)}`;
  }
  return getProgramCacheSignature(context?.history, context?.absoluteActions, options);
}

function routeReachesContextualGoal(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return (
    route.finalState.x === target.x &&
    route.finalState.y === target.y
  );
}

function createContextualQueueEntry(
  route,
  goal,
  dynamicGoal,
  tileMap = null,
  options = {}
) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  const missileGuidanceBonus = getHomingMissileCheapSearchGuidanceBonus(
    tileMap,
    route.finalState,
    target,
    options
  );
  return {
    ...route,
    homingMissileSearchGuidanceBonus: Number(missileGuidanceBonus.toFixed(3)),
    estimate: route.baseCost + heuristic(route.finalState, target) * 5 - missileGuidanceBonus
  };
}

function getContextualUsageParetoDescriptor(rawKey, rawCost = 0) {
  // v13 folds card-copy usage and Again allocation into one canonical rolling
  // resource signature. The old Dev-only tracked-card Pareto probe depended on
  // named per-card fields in the key, so it is intentionally disabled rather
  // than reporting a misleading dominance estimate for the new representation.
  return {
    key: String(rawKey),
    groupKey: String(rawKey),
    usage: [],
    cost: Number(rawCost) || 0
  };
}

function contextualUsageParetoDominates(left, right) {
  if (!left || !right || left.groupKey !== right.groupKey) return false;
  if (left.cost > right.cost + 0.001) return false;

  let strictlyBetter = left.cost < right.cost - 0.001;
  for (let index = 0; index < right.usage.length; index += 1) {
    if ((left.usage[index] ?? 0) > (right.usage[index] ?? 0)) return false;
    if ((left.usage[index] ?? 0) < (right.usage[index] ?? 0)) strictlyBetter = true;
  }
  return strictlyBetter;
}

function summarizeContextualUsageParetoOpportunity(bestCostByState) {
  const groups = new Map();

  for (const [rawKey, rawCost] of bestCostByState.entries()) {
    const descriptor = getContextualUsageParetoDescriptor(rawKey, rawCost);
    if (!groups.has(descriptor.groupKey)) groups.set(descriptor.groupKey, []);
    groups.get(descriptor.groupKey).push(descriptor);
  }

  let states = 0;
  let dominated = 0;
  let multiStateGroups = 0;

  for (const entries of groups.values()) {
    states += entries.length;
    if (entries.length < 2) continue;
    multiStateGroups += 1;

    for (let index = 0; index < entries.length; index += 1) {
      const candidate = entries[index];
      let isDominated = false;
      for (let otherIndex = 0; otherIndex < entries.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        const other = entries[otherIndex];
        if (contextualUsageParetoDominates(other, candidate)) {
          isDominated = true;
          break;
        }
      }
      if (isDominated) dominated += 1;
    }
  }

  return {
    dominanceUsageParetoStates: states,
    dominanceUsageParetoDominated: dominated,
    dominanceUsageParetoMultiStateGroups: multiStateGroups
  };
}

function summarizeContextualDominanceKeySpace(bestCostByState) {
  const unique = {
    physical: new Set(),
    physicalPhase: new Set(),
    noProgramDetail: new Set(),
    noPrevious: new Set(),
    noUsage: new Set(),
    noAgain: new Set(),
    noAbsolute: new Set(),
    noEnergy: new Set(),
    noCards: new Set(),
    noEconomyShadow: new Set(),
    noGoal: new Set()
  };

  const withoutRestPart = (parts, predicate) => parts.filter((part, index) => (
    index < 2 || !predicate(part)
  )).join("|");

  for (const rawKey of bestCostByState.keys()) {
    const parts = String(rawKey).split("|");
    const physical = parts[0] ?? "";
    const program = parts[1] ?? "";
    const programParts = program.split(":");
    const phase = programParts.find((part) => /^r\d+$/.test(part)) ?? "r?";
    const rest = parts.slice(2);

    unique.physical.add(physical);
    unique.physicalPhase.add(`${physical}|${phase}`);
    unique.noProgramDetail.add([physical, phase, ...rest].join("|"));
    unique.noPrevious.add([
      physical,
      programParts.filter((part) => (
        !part.startsWith("p") && !part.startsWith("v")
      )).join(":"),
      ...rest
    ].join("|"));
    unique.noUsage.add([
      physical,
      programParts.filter((part) => !/^[uv][0-9a-z-]+$/i.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAgain.add([
      physical,
      programParts.filter((part) => !/^[ag][01]$/.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAbsolute.add(withoutRestPart(parts, (part) => /^a\d+$/.test(part)));
    unique.noEnergy.add(withoutRestPart(parts, (part) => /^@e/.test(part)));
    unique.noCards.add(withoutRestPart(parts, (part) => /^@c/.test(part)));
    unique.noEconomyShadow.add(withoutRestPart(parts, (part) => /^@(e|c)/.test(part)));
    unique.noGoal.add(withoutRestPart(parts, (part) => /^g/.test(part)));
  }

  return {
    ...summarizeContextualUsageParetoOpportunity(bestCostByState),
    dominanceKeysFull: bestCostByState.size,
    dominanceKeysPhysical: unique.physical.size,
    dominanceKeysPhysicalPhase: unique.physicalPhase.size,
    dominanceKeysNoProgramDetail: unique.noProgramDetail.size,
    dominanceKeysNoPrevious: unique.noPrevious.size,
    dominanceKeysNoUsage: unique.noUsage.size,
    dominanceKeysNoAgain: unique.noAgain.size,
    dominanceKeysNoAbsolute: unique.noAbsolute.size,
    dominanceKeysNoEnergy: unique.noEnergy.size,
    dominanceKeysNoCards: unique.noCards.size,
    dominanceKeysNoEconomyShadow: unique.noEconomyShadow.size,
    dominanceKeysNoGoal: unique.noGoal.size
  };
}

function getContextualOptionalCompletionAllowance(
  context,
  maxExpansions,
  firstGoalExpansion,
  maxOutputRoutes,
  options = {}
) {
  if (!(maxExpansions > 0)) return 0;

  const configured = Number(options.optionalCompletionExpansions);
  const baseAllowance = Number.isFinite(configured)
    ? Math.max(0, Math.floor(configured))
    : Math.max(0, Math.floor(maxExpansions * CONTEXTUAL_OPTIONAL_COMPLETION_RATIO));
  if (baseAllowance <= 0) return 0;

  // If proving route #1 already consumed most of the leg budget, do not spend
  // more search effort on route diversity. Board/hazard complexity naturally
  // feeds this signal because difficult physical routes tend to reach the first
  // goal later in the search.
  const effortRatio = Math.max(0, firstGoalExpansion) / maxExpansions;
  if (effortRatio >= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP) return 0;
  const effortFactor = effortRatio <= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    ? 1
    : (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP - effortRatio
    ) / (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP -
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    );

  // v49dw: optional completion breadth now uses the same RE-native horizon
  // language as production traffic confidence: elapsed registers plus completed
  // intrinsic adverse RE from prior legs. Raw hazard exposure no longer gets an
  // independent semantic vote. The first-goal effort ratio above still provides
  // a purely computational signal when the current physical leg itself is hard.
  const forecastFactor = Math.max(
    0.40,
    getContextualRENativeForecastConfidence(context, options)
  );

  // When only one route will be returned, a second completion is merely a
  // chance to improve that one choice, so give it half the ordinary allowance.
  const outputFactor = maxOutputRoutes > 1 ? 1 : 0.5;
  const retentionFactor = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER
    : 1;
  return Math.max(
    0,
    Math.round(
      baseAllowance * effortFactor * forecastFactor * outputFactor * retentionFactor
    )
  );
}

// Compatibility-only hook for old diagnostic callers. Production v33 does not
// infer uncertainty from player count here; occupancy/interaction drives that later.
function getContextualTrafficUncertainty(options = {}) {
  const explicit = Number(options.contextualTrafficUncertainty);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1);
  return 0;
}

// v49dw contextual breadth ownership. This is search-effort policy only: exact
// card depletion, Energy replay and physical legality remain unchanged at every
// horizon. Breadth now consumes elapsed register horizon + cumulative completed
// intrinsic adverse RE. Raw hazard/board-chaos/interaction confidence decay has
// no independent production vote.
const CONTEXTUAL_FORECAST_BANDS = Object.freeze({
  SOLID: "solid",
  UNCERTAIN: "uncertain",
  SPECULATIVE: "speculative"
});

function getContextualRENativeForecastConfidence(context = {}, options = {}) {
  const elapsedRegisters = getTrafficForecastElapsedRegisters(
    context?.absoluteActions,
    options
  );
  const adverseRE = Math.max(0, Number(context?.reNativeAdverseRE) || 0);
  return getForecastTimeConfidence(elapsedRegisters + adverseRE);
}

function getContextualForecastBand(
  context = {},
  options = {}
) {
  if (!(options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon)) {
    return CONTEXTUAL_FORECAST_BANDS.SOLID;
  }

  let confidence = getContextualRENativeForecastConfidence(context, options);
  // Compatibility-only diagnostic override. Production leaves this at zero;
  // real multiplayer uncertainty comes later from occupancy/interaction itself.
  const explicitLegacyUncertainty = getContextualTrafficUncertainty(options);
  if (explicitLegacyUncertainty > 0) {
    confidence *= Math.exp(-explicitLegacyUncertainty * 0.18);
  }

  if (confidence < FORECAST_SPECULATIVE_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.SPECULATIVE;
  }
  if (confidence < FORECAST_SOLID_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.UNCERTAIN;
  }
  return CONTEXTUAL_FORECAST_BANDS.SOLID;
}

function getContextualBreadthPolicy(
  context,
  requestedRoutes,
  requestedCompletionPool,
  requestedBeamWidth,
  requestedOptionalExpansions,
  options = {}
) {
  const routes = Math.max(1, Math.floor(Number(requestedRoutes) || 1));
  const completionPool = Math.max(routes, Math.floor(Number(requestedCompletionPool) || routes));
  const beamWidth = Math.max(1, Math.floor(Number(requestedBeamWidth) || 1));
  const optional = Math.max(0, Math.floor(Number(requestedOptionalExpansions) || 0));
  const band = getContextualForecastBand(
    context,
    options
  );

  if (band === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    return {
      band,
      maxRoutes: 1,
      completionPool: 1,
      beamWidth: 1,
      optionalCompletionExpansions: 0
    };
  }

  if (band === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    const fullShare = Number(options.contextualFullForecastShare);
    // Standard and faster modes collapse to one route as soon as the future is
    // uncertain. Balanced/Thorough may retain two, but never more than two.
    const uncertainRouteCap = Number.isFinite(fullShare) && fullShare >= 0.72 ? 2 : 1;
    const reducedRoutes = Math.min(routes, uncertainRouteCap);
    return {
      band,
      maxRoutes: reducedRoutes,
      completionPool: Math.max(reducedRoutes, Math.min(completionPool, uncertainRouteCap)),
      beamWidth: Math.max(1, Math.min(beamWidth, uncertainRouteCap)),
      optionalCompletionExpansions: reducedRoutes > 1
        ? Math.min(optional, Number.isFinite(fullShare) && fullShare >= 0.84 ? 80 : 45)
        : 0
    };
  }

  return {
    band,
    maxRoutes: routes,
    completionPool,
    beamWidth,
    optionalCompletionExpansions: optional
  };
}

function getPhysicalTimingTemplateStateKey(
  state,
  absoluteActions,
  dynamicGoal,
  dynamicArchivePoint = null,
  options = {}
) {
  // Physical timing templates are cheap discovery, not authoritative Dynamic
  // Archive chronology. Position/facing/register/goal phase define dominance;
  // exact archive history is reconstructed when the selected witness is replayed.
  return getContextualPhysicalGoalCode(
    state,
    absoluteActions,
    dynamicGoal
  );
}

// v24 later-leg discovery keeps physical discovery cheap. v49bc makes the
// mental boundary explicit too: partial-state dominance does not carry cognitive
// history. Completed traces are replayed/rebased for resource and mental scoring
// before they are trusted as player-visible candidates.
function runGeneratorSynchronously(iterator) {
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

function* enumeratePhysicalTimingLegTemplatesSteps(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const cooperativeSearchSlices = Boolean(options.contextualCooperativeSearchSlices);
  const requestedCooperativeCheckPops = Number(
    options.contextualCooperativeSearchCheckPops ??
    options.contextualCooperativeSearchSlicePops
  );
  const cooperativeCheckPops = Number.isFinite(requestedCooperativeCheckPops)
    ? Math.max(1, Math.floor(requestedCooperativeCheckPops))
    : 16;
  const requestedCooperativeSliceMs = Number(
    options.contextualCooperativeSearchSliceMs
  );
  const cooperativeSliceMs = Number.isFinite(requestedCooperativeSliceMs)
    ? Math.max(1, requestedCooperativeSliceMs)
    : 75;
  let nextCooperativeTimeCheckPop = cooperativeCheckPops;
  let cooperativeSliceCount = 0;
  let cooperativePausedMs = 0;
  let cooperativeMaxSliceWorkMs = 0;
  let cooperativeSliceWorkStartedAt = telemetryStartedAt;
  // v48zo keeps the v48zn targeted profiler available for explicit diagnostics,
  // but ordinary generation leaves contextualDetailedProfiling off so these
  // performance.now() calls do not tax the speed benchmark.
  const profile = {
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
    exactContextualSearches: 1,
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
  const detailedProfiling = Boolean(options.contextualDetailedProfiling);
  const profileSampleInterval = detailedProfiling ? 64 : 1;
  let profileSampleActive = false;
  let profilePoppedNodes = 0;
  let profileTimedNodes = 0;
  const profileNow = () => (profileSampleActive ? analysisTelemetryNow() : 0);
  const dynamicGoal = options.dynamicGoal ?? null;
  const maxRoutes = Math.max(1, Math.floor(Number(options.maxRoutes) || 1));
  const initialMaxExpansions = Math.max(1, Math.floor(Number(options.maxExpansions) || 700));
  const initialMaxActions = Math.max(1, Math.floor(Number(options.maxActions) || CONTEXTUAL_LEG_MAX_ACTIONS));
  const resumeExhaustiveOnMiss = Boolean(
    options.contextualResumeExhaustiveOnMiss &&
    Number.isFinite(initialMaxExpansions) &&
    Number.isFinite(initialMaxActions)
  );
  let activeMaxExpansions = initialMaxExpansions;
  let activeMaxActions = initialMaxActions;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const cheapDynamicArchiveApproximation = options.recoveryRule === "dynamic_archiving";
  const cheapDynamicArchiveOrigin = cheapDynamicArchiveApproximation
    ? { x: context.state.x, y: context.state.y }
    : null;
  const simulationOptions = {
    ...options,
    portalMap,
    rebootStart: options.rebootStart ?? context.rebootStart ?? null,
    contextualCheapDynamicArchiveApproximation: cheapDynamicArchiveApproximation,
    contextualCheapDynamicArchiveOrigin: cheapDynamicArchiveOrigin,
    contextualPhysicalTemplateOnly: true
  };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(simulationOptions);
  const energyDominanceBoundConfig = getRouteEnergyDominanceBoundConfig(options);
  const queue = new MinHeap((entry) => entry.estimate);
  let bestCostByState = new Map();
  const cloneNestedBestCostMap = (source) => new Map(
    [...source.entries()].map(([primaryCode, secondary]) => [
      primaryCode,
      new Map(secondary)
    ])
  );

  // v48zj cheap-card hot-path memoization. Browser generation passes one explicit
  // memo context through all preflight/primary/repair/traffic searches. Partition
  // it by a card-rule signature so transitions can be reused across route searches
  // without ever crossing incompatible variant semantics. Older/direct callers that
  // do not provide a generation context retain v48zh's search-local behavior.
  const cardMemoRuleSignature = String(
    options.contextualEstimatedCardTransitionMemoRuleSignature ??
    `literal-hg-v49ek|${getProgramCardModelSignature(options)}`
  );
  const generationCardMemoContext =
    options.contextualEstimatedCardTransitionMemoContext &&
    typeof options.contextualEstimatedCardTransitionMemoContext === "object"
      ? options.contextualEstimatedCardTransitionMemoContext
      : null;
  if (generationCardMemoContext && !(generationCardMemoContext.byRuleSignature instanceof Map)) {
    generationCardMemoContext.byRuleSignature = new Map();
  }
  let estimatedCardMemoStore = generationCardMemoContext
    ? generationCardMemoContext.byRuleSignature.get(cardMemoRuleSignature)
    : null;
  if (!estimatedCardMemoStore) {
    estimatedCardMemoStore = {
      estimatedDemandStepCache: new Map(),
      estimatedForecastStepCache: new Map(),
      estimatedCompactCardOptionsCache: new Map(),
      estimatedForecastCloseCache: new Map(),
      estimatedForecastFrontierIds: new WeakMap(),
      estimatedForecastCanonicalByKey: new Map(),
      nextEstimatedForecastFrontierId: 1
    };
    if (generationCardMemoContext) {
      generationCardMemoContext.byRuleSignature.set(
        cardMemoRuleSignature,
        estimatedCardMemoStore
      );
    }
  }
  const {
    estimatedDemandStepCache,
    estimatedForecastStepCache,
    estimatedCompactCardOptionsCache,
    estimatedForecastCloseCache,
    estimatedForecastFrontierIds,
    estimatedForecastCanonicalByKey
  } = estimatedCardMemoStore;
  const estimatedDemandContextSpace =
    4 * COMPACT_PROGRAM_ACTION_RADIX * REGISTER_COUNT * COMPACT_PROGRAM_ACTION_RADIX;

  const canonicalizeEstimatedForecastFrontier = (frontier) => {
    if (!Array.isArray(frontier) || !frontier.length) return [];
    const knownId = estimatedForecastFrontierIds.get(frontier);
    if (knownId) return frontier;
    const key = frontier.map((entry) => (
      `${getCompactProgramCardStateCode(entry.state)}:${Number(entry.penalty) || 0}`
    )).join("|");
    const existing = estimatedForecastCanonicalByKey.get(key);
    if (existing) {
      estimatedForecastFrontierIds.set(frontier, existing.id);
      return existing.frontier;
    }
    const id = estimatedCardMemoStore.nextEstimatedForecastFrontierId++;
    estimatedForecastFrontierIds.set(frontier, id);
    estimatedForecastCanonicalByKey.set(key, { id, frontier });
    return frontier;
  };

  const getEstimatedForecastFrontierId = (frontier) => {
    const canonical = canonicalizeEstimatedForecastFrontier(frontier);
    if (!canonical.length) return 0;
    return estimatedForecastFrontierIds.get(canonical) || 0;
  };

  const getMemoizedEstimatedDemandStep = (
    previousDemandCode,
    currentDemandCode,
    previousAgainUsed,
    currentAgainUsed,
    previousActionId,
    absoluteActions,
    actionId
  ) => {
    const previousDemand = Math.max(0, Math.floor(Number(previousDemandCode) || 0));
    const currentDemand = Math.max(0, Math.floor(Number(currentDemandCode) || 0));
    const previousAgain = Math.max(0, Math.min(1, Math.floor(Number(previousAgainUsed) || 0)));
    const currentAgain = Math.max(0, Math.min(1, Math.floor(Number(currentAgainUsed) || 0)));
    const previousActionCode = COMPACT_PROGRAM_ACTION_CODE.get(previousActionId) || 0;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const contextCode = (
      ((((previousAgain * 2 + currentAgain) * COMPACT_PROGRAM_ACTION_RADIX +
        previousActionCode) * REGISTER_COUNT + phase) *
        COMPACT_PROGRAM_ACTION_RADIX) + actionCode
    );
    const pairCode = previousDemand * APPROX_PROGRAM_DEMAND_SPACE + currentDemand;
    const numericKey = pairCode * estimatedDemandContextSpace + contextCode;
    const key = Number.isSafeInteger(numericKey)
      ? numericKey
      : `${previousDemand}|${currentDemand}|${previousAgain}|${currentAgain}|${previousActionCode}|${phase}|${actionCode}`;
    const cached = estimatedDemandStepCache.get(key);
    if (cached) {
      profile.estimatedDemandMemoHits += 1;
      return cached;
    }
    profile.estimatedDemandMemoMisses += 1;
    const step = getEstimatedProgramDemandStep(
      previousDemandCode,
      currentDemandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId,
      absoluteActions,
      actionId,
      options
    );
    estimatedDemandStepCache.set(key, step);
    return step;
  };

  const getMemoizedCompactProgramCardOptions = (
    cardState,
    absoluteActions,
    actionId
  ) => {
    const stateCode = getCompactProgramCardStateCode(cardState);
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const key = (
      (stateCode * REGISTER_COUNT + phase) * COMPACT_PROGRAM_ACTION_RADIX +
      actionCode
    );
    const cached = estimatedCompactCardOptionsCache.get(key);
    if (cached) {
      profile.estimatedCompactCardMemoHits += 1;
      return cached;
    }
    profile.estimatedCompactCardMemoMisses += 1;
    const cardOptions = getCompactProgramCardOptions(
      cardState,
      absoluteActions,
      actionId,
      options
    );
    estimatedCompactCardOptionsCache.set(key, cardOptions);
    return cardOptions;
  };

  const getMemoizedEstimatedForecastStep = (frontier, absoluteActions, actionId) => {
    const canonicalFrontier = canonicalizeEstimatedForecastFrontier(frontier);
    const frontierId = getEstimatedForecastFrontierId(canonicalFrontier);
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const key = (
      (frontierId * REGISTER_COUNT + phase) * COMPACT_PROGRAM_ACTION_RADIX +
      actionCode
    );
    const cached = estimatedForecastStepCache.get(key);
    if (cached) {
      profile.estimatedForecastMemoHits += 1;
      return cached;
    }
    profile.estimatedForecastMemoMisses += 1;
    const beforeUnionPenalty =
      getEstimatedCardFrontierUnionAvailabilityPenalty(canonicalFrontier, options);
    const rawUnionFrontier = [];
    const next = new Map();
    for (const entry of canonicalFrontier) {
      const cardOptions = getMemoizedCompactProgramCardOptions(
        entry.state,
        absoluteActions,
        actionId
      );
      for (const cardOption of cardOptions) {
        rawUnionFrontier.push({
          state: {
            feasible: true,
            previousCode: Math.max(
              0,
              Math.floor(Number(entry.state?.previousCode) || 0)
            ),
            currentCode: Math.max(
              0,
              Math.floor(Number(cardOption.currentCode) || 0)
            ),
            previousActionId: actionId
          },
          penalty: 0
        });
        const penalty = entry.penalty + Math.max(0, Number(cardOption.penalty) || 0);
        const stateKey = getCompactProgramCardStateCode(cardOption.state);
        const previous = next.get(stateKey);
        if (!previous || penalty + 0.001 < previous.penalty) {
          next.set(stateKey, {
            state: cardOption.state,
            penalty
          });
        }
      }
    }
    const retained = [...next.values()]
      .sort((left, right) => left.penalty - right.penalty)
      .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
    const afterUnionPenalty =
      getEstimatedCardFrontierUnionAvailabilityPenalty(rawUnionFrontier, options);
    const unionPenaltyDelta = Number.isFinite(afterUnionPenalty)
      ? Number(Math.max(
        0,
        afterUnionPenalty -
          (Number.isFinite(beforeUnionPenalty) ? beforeUnionPenalty : 0)
      ).toFixed(3))
      : Infinity;
    const result = {
      feasible: retained.length > 0,
      frontier: retained.length
        ? canonicalizeEstimatedForecastFrontier(retained)
        : [],
      unionPenaltyDelta
    };
    estimatedForecastStepCache.set(key, result);
    return result;
  };

  const getMemoizedClosedEstimatedForecastFrontier = (frontier) => {
    const canonicalFrontier = canonicalizeEstimatedForecastFrontier(frontier);
    const frontierId = getEstimatedForecastFrontierId(canonicalFrontier);
    const cached = estimatedForecastCloseCache.get(frontierId);
    if (cached) return cached;
    const closed = canonicalizeEstimatedForecastFrontier(
      closeEstimatedCardForecastFrontierForEndedTurn(canonicalFrontier, options)
    );
    estimatedForecastCloseCache.set(frontierId, closed);
    return closed;
  };

  const rootEstimatedCardFrontier = canonicalizeEstimatedForecastFrontier(
    cloneEstimatedCardForecastFrontier(
      context.estimatedCardFrontier,
      context.programCardState
    )
  );
  const rootEstimatedCardForecastFeasible =
    context.estimatedCardForecastFeasible !== false &&
    rootEstimatedCardFrontier.length > 0;

  const forbiddenFirstActions = new Set(
    Array.isArray(options.contextualForbiddenFirstActions)
      ? options.contextualForbiddenFirstActions
      : []
  );
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];
  for (const facing of initialFacings) {
    const initialState = { x: context.state.x, y: context.state.y, facing };
    const root = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      localActions: 0,
      absoluteActions: context.absoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      approximateCardPlausibilityPenalty: 0,
      approximatePreviousProgramDemandCode:
        Math.max(0, Number(context.approximatePreviousProgramDemandCode) || 0),
      approximateProgramDemandCode:
        Math.max(0, Number(context.approximateProgramDemandCode) || 0),
      approximatePreviousAgainUsed:
        Math.max(0, Number(context.approximatePreviousAgainUsed) || 0),
      approximateCurrentAgainUsed:
        Math.max(0, Number(context.approximateCurrentAgainUsed) || 0),
      approximatePreviousScarceCode: 0,
      approximateCurrentScarceCode: 0,
      approximatePreviousActionId: context.approximatePreviousActionId ?? null,
      estimatedCardFrontier: rootEstimatedCardFrontier,
      estimatedCardForecastFeasible: rootEstimatedCardForecastFeasible,
      estimatedCardForecastPenalty: 0,
      // v33: Energy is advisory during physical discovery, just like the card
      // forecast. It may change route ordering but never physical dominance or
      // reachability. Exact/flattened economy is replayed again after realization.
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      routeEnergyShadowReserve: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      // At course start the archive marker is this robot's dock/start square;
      // later legs inherit the checkpoint/Battery most recently archived by the
      // route instead of resetting recovery state at every leg boundary.
      dynamicArchivePoint: options.recoveryRule === "dynamic_archiving"
        ? (context.dynamicArchivePoint
          ? { ...context.dynamicArchivePoint }
          : { x: initialState.x, y: initialState.y })
        : null
    };
    const physicalKey = getPhysicalTimingTemplateStateKey(
      initialState,
      root.absoluteActions,
      dynamicGoal,
      root.dynamicArchivePoint,
      options
    );
    const demandKey = options.contextualEstimatedCardWeightsOnly
      ? 0
      : getApproxProgramDemandStateCode(0, 0, 0, null);
    setNestedBestCost(bestCostByState, physicalKey, demandKey, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal, tileMap, options),
      searchPhysicalKey: physicalKey,
      searchDemandKey: demandKey
    });
  }

  const completed = [];
  const completedPathKeys = new Set();
  let expansions = 0;
  let workExpansions = 0;
  let firstGoalExpansion = null;
  let optionalTemplateStopExpansion = null;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let physicalCacheHits = 0;
  let physicalCacheMisses = 0;
  let resumeCheckpoint = null;
  let resumedExhaustive = false;
  let resumeCheckpointExpansions = 0;
  let resumeBoundedEndExpansions = 0;
  let resumeReplayExpansions = 0;

  while (true) {
    while (
      queue.size &&
      completed.length < maxRoutes &&
      expansions < activeMaxExpansions
    ) {
      if (
        optionalTemplateStopExpansion !== null &&
        expansions >= optionalTemplateStopExpansion
      ) {
        break;
      }
      // v48zs resumable widening: bounded and unlimited search are identical
      // until the 36-action horizon first blocks the heap head. Snapshot that
      // exact pre-pop state once. If bounded search later returns no route, the
      // exhaustive phase restores this checkpoint instead of restarting at the
      // leg root. If the expansion cap arrives first, the live queue/map can be
      // continued directly with no replay at all.
      if (
        resumeExhaustiveOnMiss &&
        !resumedExhaustive &&
        !resumeCheckpoint &&
        activeMaxActions < Infinity &&
        queue.items[0]?.localActions >= activeMaxActions
      ) {
        resumeCheckpoint = {
          queueItems: queue.items.slice(),
          bestCostByState: cloneNestedBestCostMap(bestCostByState),
          expansions,
          maxLocalActionsSeen
        };
      }
    profileSampleActive = detailedProfiling &&
      (profilePoppedNodes % profileSampleInterval === 0);
    if (profileSampleActive) profileTimedNodes += 1;
    profilePoppedNodes += 1;
    if (
      cooperativeSearchSlices &&
      profilePoppedNodes >= nextCooperativeTimeCheckPop
    ) {
      nextCooperativeTimeCheckPop = profilePoppedNodes + cooperativeCheckPops;
      // Optional work guard (generation's route-work budget). It runs at this
      // step-count boundary, not on the clock, so a candidate is always stopped
      // at the same point and generation stays deterministic. It may throw.
      if (typeof options.contextualWorkGuard === "function") {
        options.contextualWorkGuard(workExpansions);
      }
      const checkedAt = analysisTelemetryNow();
      if (checkedAt - cooperativeSliceWorkStartedAt >= cooperativeSliceMs) {
        cooperativeMaxSliceWorkMs = Math.max(
          cooperativeMaxSliceWorkMs,
          checkedAt - cooperativeSliceWorkStartedAt
        );
        cooperativeSliceCount += 1;
        yield {
          phase: "route-search-slice",
          searchKind: resumedExhaustive
            ? (options.contextualResumeTelemetryKind ?? options.contextualTelemetryKind ?? "estimated-physical-leg-exhaustive")
            : (options.contextualTelemetryKind ?? "contextual-physical-template"),
          expansions: workExpansions,
          poppedNodes: profilePoppedNodes,
          targetSliceMs: cooperativeSliceMs
        };
        const resumedAt = analysisTelemetryNow();
        cooperativePausedMs += Math.max(0, resumedAt - checkedAt);
        cooperativeSliceWorkStartedAt = resumedAt;
        nextCooperativeTimeCheckPop = profilePoppedNodes + cooperativeCheckPops;
      }
    }

    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;
    profile.exactContextualExpansions += 1;

    blockStartedAt = profileNow();
    const currentPhysicalKey = current.searchPhysicalKey ?? getPhysicalTimingTemplateStateKey(
      current.finalState,
      current.absoluteActions,
      dynamicGoal,
      current.dynamicArchivePoint,
      options
    );
    const currentDemandKey = current.searchDemandKey ?? (
      options.contextualEstimatedCardWeightsOnly
        ? 0
        : getApproxProgramDemandStateCode(
          current.approximateProgramDemandCode,
          current.approximatePreviousScarceCode,
          current.approximateCurrentScarceCode,
          current.approximatePreviousActionId
        )
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = getNestedBestCost(
      bestCostByState,
      currentPhysicalKey,
      currentDemandKey
    );
    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);
    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(current, goal, dynamicGoal);
    profile.goalCompletionMs += profileNow() - blockStartedAt;
    if (reachesGoal) {
      blockStartedAt = profileNow();
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
      const template = {
        path,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: dynamicGoal
          ? {
            checkpointId: dynamicGoal.id ?? null,
            position: hitTarget,
            space: getDynamicGoalSpace(dynamicGoal, hitTarget),
            actions: current.absoluteActions,
            positions: dynamicGoal.positions ?? [],
            displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity({ transitions }, hitTarget),
        rebootCount: transitions.filter((transition) => transition.rebooted).length,
        score: Number(current.baseCost.toFixed(2)),
        routeEnergyEconomyRewardScore: Number(
          (current.routeEnergyEconomyRewardScore || 0).toFixed(2)
        ),
        batteryEconomyRewardScore: Number(
          (current.batteryEconomyRewardScore || 0).toFixed(2)
        ),
        powerUpEconomyRewardScore: Number(
          (current.powerUpEconomyRewardScore || 0).toFixed(2)
        ),
        chopShopEconomyRewardScore: Number(
          (current.chopShopEconomyRewardScore || 0).toFixed(2)
        ),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve,
        dynamicArchivePointStart: options.recoveryRule === "dynamic_archiving"
          ? (context.dynamicArchivePoint
            ? { ...context.dynamicArchivePoint }
            : { x: current.initialState.x, y: current.initialState.y })
          : null,
        dynamicArchivePointEnd: current.dynamicArchivePoint
          ? { ...current.dynamicArchivePoint }
          : null,
        routeUpgradeCardShadowUnitsStart: 0,
        routeUpgradeCardShadowUnitsEnd: 0,
        routeEconomyNormalDraws: 0,
        routeEconomyInstalls: 0,
        routeEconomyExtraCardDraws: 0,
        routeEconomyEnergySpent: 0,
        chopShopCardChoices: 0,
        chopShopEnergyChoices: 0,
        cardAvailabilityPenalty: 0,
        programPlausibilityPenalty: 0,
        approximateCardPlausibilityPenalty: Number(
          (current.approximateCardPlausibilityPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastPenalty: Number(
          (current.estimatedCardForecastPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastFeasible:
          current.estimatedCardForecastFeasible !== false,
        estimatedCardFrontierEnd: cloneEstimatedCardForecastFrontier(
          current.estimatedCardFrontier
        ),
        estimatedDemandStateEnd: {
          previousDemandCode: current.approximatePreviousProgramDemandCode || 0,
          demandCode: current.approximateProgramDemandCode || 0,
          previousAgainUsed: current.approximatePreviousAgainUsed || 0,
          currentAgainUsed: current.approximateCurrentAgainUsed || 0,
          previousActionId: current.approximatePreviousActionId ?? null
        },
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: [],
        goalReached: true,
        fullCourseLeg: true,
        physicalTimingTemplate: true
      };
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      profile.completedGoals += 1;
      if (
        (options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) &&
        routeTouchesPit(tileMap, template)
      ) {
        continue;
      }
      if (options.recoveryRule === "dynamic_archiving") {
        const archiveReward = scoreDynamicArchivingRouteUtility(tileMap, template, options);
        template.dynamicArchivingRewardScore = archiveReward;
        template.score = Number((template.score - archiveReward).toFixed(2));
      }
      // v49bc: mental RE is authoritative completed-route scoring, not hot
      // pathfinder state. Replay the finished candidate once, then use that
      // score only when ranking the small completed-candidate set.
      const mental = replaySearchIntrinsicMentalForContext(
        tileMap,
        template,
        context,
        options,
        true
      );
      Object.assign(template, mental);
      template.score = Number((
        template.score + getCompletedRoutePostbuildScoreAdjustment(mental)
      ).toFixed(2));
      const templatePathKey = options.contextualReturnAllEstimatedPaths
        ? getEstimatedRouteIdentity(template)
        : getRoutePathKey(template);
      if (completedPathKeys.has(templatePathKey)) {
        continue;
      }
      completedPathKeys.add(templatePathKey);
      completed.push(template);
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (maxRoutes > 1) {
          optionalTemplateStopExpansion = Math.min(
            activeMaxExpansions,
            expansions + Math.max(
              0,
              Math.floor(Number(options.optionalTemplateExpansions) || 120)
            )
          );
        }
      }
      continue;
    }

    expansions += 1;
    workExpansions += 1;
    if (current.localActions >= activeMaxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
    for (const action of ACTIONS) {
      profile.actionCandidates += 1;
      if (current.localActions === 0 && forbiddenFirstActions.has(action.id)) {
        continue;
      }
      blockStartedAt = profileNow();
      profile.cardOptionCalls += 1;
      const estimatedDemandStep = options.contextualEstimatedCardWeightsOnly
        ? getMemoizedEstimatedDemandStep(
          current.approximatePreviousProgramDemandCode,
          current.approximateProgramDemandCode,
          current.approximatePreviousAgainUsed,
          current.approximateCurrentAgainUsed,
          current.approximatePreviousActionId,
          current.absoluteActions,
          action.id
        )
        : null;
      const demandSteps = options.contextualEstimatedCardWeightsOnly
        ? (estimatedDemandStep ? [estimatedDemandStep] : [])
        : options.contextualApproximateCardWeights
          ? getApproxProgramDemandOptions(
            current.approximateProgramDemandCode,
            current.approximatePreviousScarceCode,
            current.approximateCurrentScarceCode,
            current.approximatePreviousActionId,
            current.absoluteActions,
            action.id,
            options
          )
          : [{
            demandCode: current.approximateProgramDemandCode || 0,
            previousScarceCode: current.approximatePreviousScarceCode || 0,
            currentScarceCode: current.approximateCurrentScarceCode || 0,
            previousActionId: action.id,
            penalty: 0,
            approximateProgramCard: action.id
          }];
      if (!demandSteps.length) continue;

      const forecastStep = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false
      )
        ? getMemoizedEstimatedForecastStep(
          current.estimatedCardFrontier,
          current.absoluteActions,
          action.id
        )
        : {
          feasible: false,
          frontier: []
        };
      const forecastBreakPenalty = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false &&
        !forecastStep.feasible
      )
        ? ESTIMATED_CARD_FORECAST_BREAK_PENALTY
        : 0;
      const unionFrontierCardPenalty = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false &&
        forecastStep.feasible &&
        Number.isFinite(forecastStep.unionPenaltyDelta)
      )
        ? forecastStep.unionPenaltyDelta
        : null;
      profile.cardOptionsMs += profileNow() - blockStartedAt;

      // All approximate literal-card allocations produce the same executed board
      // action. v48zd caches only the board mechanics here. Recovery destination
      // and recovery-aware pit/edge pressure are restored after the template is
      // known, so Dynamic Archiving no longer resolves an archive proxy before
      // every ordinary candidate action.
      blockStartedAt = profileNow();
      profile.simulationCalls += 1;
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT,
          dynamicArchivePoint: current.dynamicArchivePoint,
          contextualPhysicalMissProfile: profileSampleActive ? profile : null
        },
        physicalOptionSignature
      );
      const simulationElapsed = profileNow() - blockStartedAt;
      profile.simulationMs += simulationElapsed;
      if (physicalResult.hit) {
        physicalCacheHits += 1;
        profile.physicalCacheHits += 1;
        profile.simulationHitMs += simulationElapsed;
      } else {
        physicalCacheMisses += 1;
        profile.physicalCacheMisses += 1;
        profile.simulationMissMs += simulationElapsed;
      }
      const transition = physicalResult.transition;
      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getRouteAwareActionPenalty(action, options);
      profile.actionScoringMs += profileNow() - blockStartedAt;
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];

      for (const demandStep of demandSteps) {
        for (const destination of destinations) {
          profile.destinationCandidates += 1;
          blockStartedAt = profileNow();
          const executedAbsoluteAction = current.absoluteActions + 1;
          const nextAbsoluteActions = transition.rebooted
            ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
            : executedAbsoluteAction;
          const finalizedDemandStep = transition.rebooted
            ? closeEstimatedProgramDemandForEndedTurn(demandStep, options)
            : demandStep;
          const finalizedForecastFrontier = transition.rebooted && forecastStep.feasible
            ? getMemoizedClosedEstimatedForecastFrontier(forecastStep.frontier)
            : forecastStep.frontier;
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(executedAbsoluteAction)
            : (transition.rebootPenalty || 0);
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextDynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            destination,
            current.dynamicArchivePoint,
            options
          );
          profile.archiveContextMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const preEnergyBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            actionPenalty +
            (
              Number.isFinite(unionFrontierCardPenalty)
                ? unionFrontierCardPenalty
                : finalizedDemandStep.penalty
            ) +
            forecastBreakPenalty;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextPhysicalKey = getPhysicalTimingTemplateStateKey(
            destination,
            nextAbsoluteActions,
            dynamicGoal,
            nextDynamicArchivePoint,
            options
          );
          const nextDemandKey = options.contextualEstimatedCardWeightsOnly
            ? 0
            : getApproxProgramDemandStateCode(
              finalizedDemandStep.demandCode,
              finalizedDemandStep.previousScarceCode,
              finalizedDemandStep.currentScarceCode,
              finalizedDemandStep.previousActionId
            );
          profile.nextKeyMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const priorBest = getNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey
          );
          if (priorBest !== undefined) {
            const energyRewardUpperBound = options.contextualEstimatedEnergyGuidance === false
              ? 0
              : getRouteEnergyDominanceRewardUpperBound(
                tileMap,
                destination,
                action.id,
                energyDominanceBoundConfig
              );
            if (preEnergyBaseCost - energyRewardUpperBound >= priorBest - 0.001) {
              profile.dominatedStates += 1;
              profile.earlyDominanceEnergyBoundPrunes += 1;
              profile.dominanceMs += profileNow() - blockStartedAt;
              continue;
            }
          }
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const energyStep = options.contextualEstimatedEnergyGuidance === false
            ? {
              rewardScore: 0,
              batteryRewardScore: 0,
              powerUpRewardScore: 0,
              chopShopRewardScore: 0,
              reserveAfter: current.routeEnergyShadowReserve
            }
            : getRouteEnergyShadowStep(
              tileMap,
              destination,
              action.id,
              executedAbsoluteAction,
              current.routeEnergyShadowReserve,
              0,
              options,
              transition
            );
          profile.energyMs += profileNow() - blockStartedAt;
          const energyEconomyRewardScore = Math.max(
            0,
            Number(energyStep.rewardScore) || 0
          );
          const nextBaseCost = preEnergyBaseCost - energyEconomyRewardScore;

          blockStartedAt = profileNow();
          if (priorBest !== undefined && nextBaseCost >= priorBest - 0.001) {
            profile.dominatedStates += 1;
            profile.dominanceMs += profileNow() - blockStartedAt;
            continue;
          }
          setNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey,
            nextBaseCost
          );
          profile.acceptedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const transitionForDestination = {
            ...(transition.rebootChoices?.length
              ? { ...transition, to: destination }
              : transition),
            absoluteAction: executedAbsoluteAction
          };
          const nextRoute = {
            finalState: destination,
            initialState: current.initialState,
            startFacing: current.startFacing,
            parent: current,
            transition: transitionForDestination,
            localActions: current.localActions + 1,
            absoluteActions: nextAbsoluteActions,
            distance: current.distance + transition.distance,
            forcedDistance: current.forcedDistance + transition.forcedDistance,
            hazard: current.hazard + transition.hazard,
            rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
            baseCost: nextBaseCost,
            approximateCardPlausibilityPenalty:
              (current.approximateCardPlausibilityPenalty || 0) +
              (
                Number.isFinite(unionFrontierCardPenalty)
                  ? unionFrontierCardPenalty
                  : finalizedDemandStep.penalty
              ),
            approximatePreviousProgramDemandCode:
              finalizedDemandStep.previousDemandCode ?? current.approximatePreviousProgramDemandCode ?? 0,
            approximateProgramDemandCode: finalizedDemandStep.demandCode,
            approximatePreviousAgainUsed:
              finalizedDemandStep.previousAgainUsed ?? current.approximatePreviousAgainUsed ?? 0,
            approximateCurrentAgainUsed:
              finalizedDemandStep.currentAgainUsed ?? current.approximateCurrentAgainUsed ?? 0,
            approximatePreviousScarceCode: finalizedDemandStep.previousScarceCode,
            approximateCurrentScarceCode: finalizedDemandStep.currentScarceCode,
            approximatePreviousActionId: finalizedDemandStep.previousActionId,
            estimatedCardFrontier: forecastStep.feasible
              ? finalizedForecastFrontier
              : [],
            estimatedCardForecastFeasible:
              current.estimatedCardForecastFeasible !== false &&
              forecastStep.feasible,
            estimatedCardForecastPenalty:
              (current.estimatedCardForecastPenalty || 0) +
              forecastBreakPenalty,
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) +
              (Number(energyStep.batteryRewardScore) || 0),
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) +
              (Number(energyStep.powerUpRewardScore) || 0),
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) +
              (Number(energyStep.chopShopRewardScore) || 0),
            routeEnergyShadowReserve:
              Number.isFinite(Number(energyStep.reserveAfter))
                ? Number(energyStep.reserveAfter)
                : current.routeEnergyShadowReserve,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
            dynamicArchivePoint: nextDynamicArchivePoint,
            hazardExposure:
              Math.max(0, Number(current.hazardExposure) || 0) +
              Math.max(0, Number(transition.hazard) || 0)
          };
          profile.routeNodeBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal, tileMap, options),
            searchPhysicalKey: nextPhysicalKey,
            searchDemandKey: nextDemandKey
          });
          profile.queueMs += profileNow() - blockStartedAt;
        }
      }
    }
    }

    if (
      resumeExhaustiveOnMiss &&
      !resumedExhaustive &&
      completed.length === 0 &&
      (
        expansions >= activeMaxExpansions ||
        actionHorizonStops > 0
      )
    ) {
      resumedExhaustive = true;
      resumeBoundedEndExpansions = expansions;
      if (resumeCheckpoint) {
        resumeCheckpointExpansions = resumeCheckpoint.expansions;
        resumeReplayExpansions = Math.max(
          0,
          resumeBoundedEndExpansions - resumeCheckpointExpansions
        );
        queue.items = resumeCheckpoint.queueItems.slice();
        bestCostByState = cloneNestedBestCostMap(
          resumeCheckpoint.bestCostByState
        );
        expansions = resumeCheckpoint.expansions;
        maxLocalActionsSeen = resumeCheckpoint.maxLocalActionsSeen;
      } else {
        resumeCheckpointExpansions = expansions;
      }
      activeMaxExpansions = Infinity;
      activeMaxActions = Infinity;
      optionalTemplateStopExpansion = null;
      actionHorizonStops = 0;
      continue;
    }
    break;
  }

  const sortedCompleted = (options.contextualReturnAllEstimatedPaths
    ? (() => {
      const seen = new Set();
      return completed.filter((route) => {
        const key = getEstimatedRouteIdentity(route);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })()
    : dedupeRoutes(completed)
  ).sort(compareScoredRouteLike);
  const selected = options.contextualReturnAllEstimatedPaths
    ? sortedCompleted.slice(0, maxRoutes)
    : selectDistinctRoutes(
      sortedCompleted,
      goal,
      maxRoutes
    );
  profile.retainedDominanceStates = bestCostByState.size;
  const profileTimingScale = detailedProfiling && profileTimedNodes > 0
    ? profilePoppedNodes / profileTimedNodes
    : 1;
  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "simulationHitMs",
    "simulationMissMs",
    // v48zn: physical-miss phase timers are collected only on sampled popped
    // nodes, exactly like simulationMissMs. Scale them with the same per-search
    // factor before aggregation so the phase shares use one consistent basis.
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
    "archiveContextMs",
    "destinationBuildMs",
    "routeNodeBuildMs",
    "historyBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number((profile[key] * profileTimingScale).toFixed(2));
  });
  profile.timingSampledNodes = profileTimedNodes;
  profile.timingPopulationNodes = profilePoppedNodes;
  profile.physicalCacheHits = physicalCacheHits;
  profile.physicalCacheMisses = physicalCacheMisses;
  profile.completedGoals = completed.length;
  if (completed.length > 0) {
    profile.searchesWithGoal = 1;
    profile.firstGoalExpansionTotal = firstGoalExpansion ?? 0;
    profile.postFirstGoalExpansions = Math.max(0, expansions - (firstGoalExpansion ?? expansions));
  }

  const hitExpansionCap = expansions >= activeMaxExpansions;
  const reportedExpansions = resumeExhaustiveOnMiss
    ? workExpansions
    : expansions;
  if (hitExpansionCap) {
    if (completed.length > 0) {
      profile.cappedWithGoalSearches = 1;
      profile.cappedWithGoalExpansions = expansions;
    } else {
      profile.cappedZeroGoalSearches = 1;
      profile.cappedZeroGoalExpansions = expansions;
    }
  }
  selected.contextualSearchMeta = {
    expansions: reportedExpansions,
    searchStateExpansions: expansions,
    maxExpansions: activeMaxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    firstGoalExpansion,
    optionalTemplateStopExpansion,
    resumedExhaustive,
    resumeCheckpointExpansions,
    resumeBoundedEndExpansions,
    resumeReplayExpansions,
    resumeSavedRootExpansions: resumedExhaustive
      ? resumeCheckpointExpansions
      : 0,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteCapFailure: selected.length === 0 && hitExpansionCap,
    zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
    physicalTimingTemplate: true,
    approximateCardWeights: Boolean(options.contextualApproximateCardWeights),
    estimatedCardWeightsOnly: Boolean(options.contextualEstimatedCardWeightsOnly),
    unboundedPhysicalEstimate:
      !Number.isFinite(activeMaxExpansions) &&
      !Number.isFinite(activeMaxActions)
  };
  const routeSearchFinishedAt = analysisTelemetryNow();
  cooperativeMaxSliceWorkMs = Math.max(
    cooperativeMaxSliceWorkMs,
    routeSearchFinishedAt - cooperativeSliceWorkStartedAt
  );
  recordRouteSearchTelemetry(
    resumedExhaustive
      ? (options.contextualResumeTelemetryKind ?? options.contextualTelemetryKind ?? "estimated-physical-leg-exhaustive")
      : (options.contextualTelemetryKind ?? "contextual-physical-template"),
    telemetryStartedAt,
    {
      durationMs: Math.max(0, routeSearchFinishedAt - telemetryStartedAt - cooperativePausedMs),
      expansions: reportedExpansions,
      maxExpansions: activeMaxExpansions,
      completedRoutes: completed.length,
      returnedRoutes: selected.length,
      hitExpansionCap,
      actionHorizonStops,
      maxLocalActionsSeen,
      hitActionHorizon: actionHorizonStops > 0,
      zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
      physicalTimingTemplate: true,
      physicalCacheHits,
      physicalCacheMisses,
      resumedExhaustive,
      resumeCheckpointExpansions,
      resumeBoundedEndExpansions,
      resumeReplayExpansions,
      resumeSavedRootExpansions: resumedExhaustive
        ? resumeCheckpointExpansions
        : 0,
      cooperativeSlices: cooperativeSliceCount,
      cooperativePausedMs: Number(cooperativePausedMs.toFixed(2)),
      cooperativeMaxSliceWorkMs: Number(cooperativeMaxSliceWorkMs.toFixed(2)),
      contextualProfile: profile,
      start: {
        x: context.state.x,
        y: context.state.y,
        facing: context.state.facing ?? null
      },
      goal: { x: goal.x, y: goal.y }
    }
  );
  return selected;
}

function enumeratePhysicalTimingLegTemplates(
  tileMap,
  context,
  goal,
  options = {}
) {
  return runGeneratorSynchronously(
    enumeratePhysicalTimingLegTemplatesSteps(tileMap, context, goal, options)
  );
}

function enumerateContextualLegRoutes(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const profile = {
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
    archiveContextMs: 0,
    destinationBuildMs: 0,
    routeNodeBuildMs: 0,
    historyBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    cardOptionCalls: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
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
    retainedDominanceStates: 0,
    timingSampledNodes: 0,
    timingPopulationNodes: 0
  };
  const detailedProfiling = Boolean(
    options.contextualDetailedProfiling || options.contextualDominanceKeyProfiling
  );
  // v48zn diagnostic fallback: use the same light 1-in-64 timing sample as the
  // estimate-first profiler. Route-search wall time and all counters remain exact.
  const profileSampleInterval = detailedProfiling ? 64 : 1;
  let profileSampleActive = detailedProfiling;
  let profilePoppedNodes = 0;
  let profileTimedNodes = 0;
  const profileNow = () => (profileSampleActive ? analysisTelemetryNow() : 0);

  const dynamicGoal = options.dynamicGoal ?? null;
  const maxOutputRoutes = options.maxRoutes ?? CONTEXTUAL_LATER_ROUTES;
  const completionPool = Math.max(
    maxOutputRoutes,
    options.completionPool ?? CONTEXTUAL_COMPLETION_POOL
  );
  const maxExpansions = options.maxExpansions ?? CONTEXTUAL_LATER_EXPANSIONS;
  const forcedActionIds = Array.isArray(options.contextualForcedActionIds)
    ? options.contextualForcedActionIds.filter((actionId) => typeof actionId === "string")
    : null;
  const maxActions = forcedActionIds
    ? forcedActionIds.length
    : (options.maxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS);
  const incumbentRoutes = Array.isArray(options.contextualIncumbentRoutes)
    ? dedupeRoutes(options.contextualIncumbentRoutes.filter(Boolean)).sort(compareScoredRouteLike)
    : [];
  // v23: the dominance identity is exact at every horizon. Card depletion from
  // the previous and current five-register programs therefore cannot disappear
  // merely because a route is long. Uncertainty is handled only by route breadth.
  const forecastBandAtStart = getContextualForecastBand(
    context,
    options
  );
  if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    profile.horizonSpeculativeSearches = 1;
  } else if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    profile.horizonUncertainSearches = 1;
  } else {
    profile.horizonSolidSearches = 1;
  }
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap,
    rebootStart: options.rebootStart ?? context.rebootStart ?? null,
    contextualPhysicalTemplateOnly: true
  };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(
    simulationOptions
  );
  let queue = new MinHeap((entry) => entry.estimate);
  let bestCostByState = new Map();
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];

  // Economy shadow state depends on the incoming route context, not the startup
  // facing. Keep it outside the facing loop so accepted queue entries can safely
  // use the same fallback after the initial roots have been enqueued.
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  const initialEnergyReserve = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  const initialUpgradeCardUnits = Number.isFinite(Number(context.upgradeCardUnits))
    ? Number(context.upgradeCardUnits)
    : fallbackEconomyState.usefulCardUnits;

  for (const facing of initialFacings) {
    const initialState = {
      x: context.state.x,
      y: context.state.y,
      facing
    };
    const initialHistory = getProgramHistoryWindow(context.history);
    const initialProgramCardState = context.programCardState
      ? { ...context.programCardState }
      : getCompactProgramCardStateFromHistory(
        initialHistory,
        context.absoluteActions,
        options
      );
    if (!initialProgramCardState?.feasible) {
      continue;
    }
    const root = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      localActions: 0,
      absoluteActions: context.absoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: 0,
      routeEconomyInstalls: 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      baseCost: 0,
      cardAvailabilityPenalty: 0,
      programPlausibilityPenalty: 0,
      programCardState: initialProgramCardState,
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      dynamicArchivePoint: options.recoveryRule === "dynamic_archiving"
        ? (context.dynamicArchivePoint
          ? { ...context.dynamicArchivePoint }
          : { x: initialState.x, y: initialState.y })
        : null
    };

    let blockStartedAt = profileNow();
    const keyParts = getContextualSearchNumericStateParts(
      initialState,
      context.absoluteActions,
      initialProgramCardState,
      dynamicGoal,
      root.dynamicArchivePoint,
      options
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    setContextualBestCost(bestCostByState, keyParts, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal, tileMap, options),
      searchPhysicalGoalCode: keyParts.physicalGoalCode,
      searchCardStateCode: keyParts.cardStateCode
    });
    profile.queueMs += profileNow() - blockStartedAt;
  }

  const completed = [...incumbentRoutes];
  let expansions = 0;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let firstGoalExpansion = completed.length ? 0 : null;
  let optionalCompletionAllowance = completed.length
    ? getContextualOptionalCompletionAllowance(
      context,
      maxExpansions,
      0,
      maxOutputRoutes,
      options
    )
    : 0;
  let optionalCompletionStopExpansion = completed.length
    ? Math.min(maxExpansions, optionalCompletionAllowance)
    : null;
  let stoppedForOptionalCompletionBudget = false;
  if (completed.length) {
    profile.completedGoals = completed.length;
  }

  while (
    queue.size &&
    completed.length < completionPool &&
    expansions < maxExpansions
  ) {
    profileSampleActive = detailedProfiling &&
      (profilePoppedNodes % profileSampleInterval === 0);
    if (profileSampleActive) profileTimedNodes += 1;
    profilePoppedNodes += 1;

    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;
    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);

    profile.exactContextualSearches = 1;
    profile.exactContextualExpansions += 1;

    blockStartedAt = profileNow();
    const currentParts = {
      physicalGoalCode: current.searchPhysicalGoalCode ?? getContextualArchiveAwarePhysicalGoalCode(
        current.finalState,
        current.absoluteActions,
        dynamicGoal,
        current.dynamicArchivePoint,
        options
      ),
      cardStateCode: current.searchCardStateCode ?? getCompactProgramCardStateCode(
        current.programCardState
      )
    };
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = getContextualBestCost(bestCostByState, currentParts);
    if (
      knownBest !== undefined &&
      current.baseCost > knownBest + 0.001
    ) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(
      current,
      goal,
      dynamicGoal
    );
    if (reachesGoal) {
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = (
        getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
        goal
      );
      const route = {
        path,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: dynamicGoal
          ? {
            checkpointId: dynamicGoal.id ?? null,
            position: hitTarget,
            space: getDynamicGoalSpace(dynamicGoal, hitTarget),
            actions: current.absoluteActions,
            positions: dynamicGoal.positions ?? [],
            displayPositions:
              dynamicGoal.displayPositions ??
              dynamicGoal.positions ??
              []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity(
          { transitions },
          hitTarget
        ),
        rebootCount: transitions.filter(
          (transition) => transition.rebooted
        ).length,
        score: Number(current.baseCost.toFixed(2)),
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? initialEnergyReserve,
        dynamicArchivePointStart: options.recoveryRule === "dynamic_archiving"
          ? (context.dynamicArchivePoint
            ? { ...context.dynamicArchivePoint }
            : { x: current.initialState.x, y: current.initialState.y })
          : null,
        dynamicArchivePointEnd: current.dynamicArchivePoint
          ? { ...current.dynamicArchivePoint }
          : null,
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? initialUpgradeCardUnits,
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        cardAvailabilityPenalty: Number(
          (current.cardAvailabilityPenalty || 0).toFixed(2)
        ),
        programPlausibilityPenalty: Number(
          (current.programPlausibilityPenalty || 0).toFixed(2)
        ),
        goalReached: true,
        fullCourseLeg: true,
        contextualForecastBand: getContextualForecastBand(
          { ...context, absoluteActions: current.absoluteActions },
          options
        ),
        contextualHazardExposure: current.hazardExposure,
        // v25: witness actions are reconstructed only for an accepted route.
        // Search nodes carry card counts, not a growing action-history array.
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: getProgramHistoryWindow([
          ...getProgramHistoryWindow(context.history),
          ...transitions.map((transition) => transition.action).filter(Boolean)
        ]),
        programCardStateEnd: current.programCardState
          ? { ...current.programCardState }
          : null
      };

      if (
        (
          options.recoveryRule === "dynamic_archiving" ||
          !options.recoveryRule
        ) &&
        routeTouchesPit(tileMap, route)
      ) {
        profile.goalCompletionMs += profileNow() - blockStartedAt;
        continue;
      }

      // v49bc: score mental load only after a complete route candidate exists.
      // Partial-state dominance remains the cheap pathfinder's state space.
      const mental = replaySearchIntrinsicMentalForContext(
        tileMap,
        route,
        context,
        options,
        true
      );
      Object.assign(route, mental);
      route.score = Number((
        route.score + getCompletedRoutePostbuildScoreAdjustment(mental)
      ).toFixed(2));

      profile.completedGoals += 1;
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (completionPool > 1) {
          const endpointBand = getContextualForecastBand(
            { ...context, absoluteActions: current.absoluteActions },
            options
          );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
            profile.horizonFirstGoalSpeculative = 1;
          } else if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            profile.horizonFirstGoalUncertain = 1;
          }
          optionalCompletionAllowance = endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE
            ? 0
            : getContextualOptionalCompletionAllowance(
              context,
              maxExpansions,
              firstGoalExpansion,
              maxOutputRoutes,
              options
            );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            optionalCompletionAllowance = Math.min(optionalCompletionAllowance, 45);
          }
          if (completionPool > 1 && optionalCompletionAllowance <= 0) {
            profile.horizonOptionalSuppressed = 1;
          }
          optionalCompletionStopExpansion = Math.min(
            maxExpansions,
            firstGoalExpansion + optionalCompletionAllowance
          );
        }
      }
      completed.push(route);
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.goalCompletionMs += profileNow() - blockStartedAt;

    if (
      firstGoalExpansion !== null &&
      completionPool > 1 &&
      optionalCompletionStopExpansion !== null &&
      expansions >= optionalCompletionStopExpansion
    ) {
      stoppedForOptionalCompletionBudget = true;
      break;
    }

    expansions += 1;
    if (current.localActions >= maxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = (
      getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
      goal
    );
    const candidateActions = forcedActionIds
      ? (() => {
        const forcedId = forcedActionIds[current.localActions];
        const forcedAction = ACTIONS.find((action) => action.id === forcedId) ?? null;
        return forcedAction ? [forcedAction] : [];
      })()
      : ACTIONS;

    for (const action of candidateActions) {
      profile.actionCandidates += 1;
      blockStartedAt = profileNow();
      const cardOptions = getCompactProgramCardOptions(
        current.programCardState,
        current.absoluteActions,
        action.id,
        options
      );
      profile.cardOptionsMs += profileNow() - blockStartedAt;
      profile.cardOptionCalls += 1;
      if (!cardOptions.length) {
        profile.programLegalityPrunes += 1;
        continue;
      }

      // Every literal card allocation that produces this executed action shares
      // the same board transition. Simulate it once, then branch only the tiny
      // card-count state.
      blockStartedAt = profileNow();
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT,
          dynamicArchivePoint: current.dynamicArchivePoint,
          contextualPhysicalMissProfile: profileSampleActive ? profile : null
        },
        physicalOptionSignature
      );
      const transition = physicalResult.transition;
      profile.simulationCalls += 1;
      const simulationElapsedMs = profileNow() - blockStartedAt;
      if (physicalResult.hit) {
        profile.physicalCacheHits += 1;
        profile.simulationHitMs += simulationElapsedMs;
      } else {
        profile.physicalCacheMisses += 1;
        profile.simulationMissMs += simulationElapsedMs;
      }
      profile.simulationMs += simulationElapsedMs;

      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const executedAbsoluteAction = current.absoluteActions + 1;
      const nextAbsoluteActions = transition.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];
      profile.actionScoringMs += profileNow() - blockStartedAt;

      for (const cardOption of cardOptions) {
        const scarceReusePenalty = cardOption.penalty;
        const scarcityPenalty = Number(cardOption.scarcityPenalty) || 0;
        const programPlausibilityPenalty =
          Number(cardOption.programPlausibilityPenalty) || 0;
        for (const destination of destinations) {
          profile.destinationCandidates += 1;

          blockStartedAt = profileNow();
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(executedAbsoluteAction)
            : (transition.rebootPenalty || 0);
          const nextProgramCardState = transition.rebooted
            ? closeCompactProgramCardStateForEndedTurn(cardOption.state, options)
            : cardOption.state;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const energyStep = getRouteEnergyShadowStep(
            tileMap,
            destination,
            action.id,
            executedAbsoluteAction,
            current.routeEnergyShadowReserve,
            current.routeUpgradeCardShadowUnits,
            options,
            transition
          );
          profile.energyMs += profileNow() - blockStartedAt;
          const energyEconomyRewardScore = energyStep.rewardScore;
          const batteryEconomyRewardScore = energyStep.batteryRewardScore;
          const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
          const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;

          blockStartedAt = profileNow();
          const nextHazardExposure =
            Math.max(0, Number(current.hazardExposure) || 0) +
            Math.max(0, Number(transition.hazard) || 0);
          const nextDynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            destination,
            current.dynamicArchivePoint,
            options
          );
          profile.archiveContextMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            actionPenalty +
            scarceReusePenalty -
            energyEconomyRewardScore;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextParts = getContextualSearchNumericStateParts(
            destination,
            nextAbsoluteActions,
            nextProgramCardState,
            dynamicGoal,
            nextDynamicArchivePoint,
            options
          );
          profile.nextKeyMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const priorBest = getContextualBestCost(bestCostByState, nextParts);
          if (
            priorBest !== undefined &&
            nextBaseCost >= priorBest - 0.001
          ) {
            profile.dominatedStates += 1;
            profile.dominanceMs += profileNow() - blockStartedAt;
            continue;
          }

          setContextualBestCost(bestCostByState, nextParts, nextBaseCost);
          profile.acceptedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const transitionForDestination = {
            ...(transition.rebootChoices?.length
              ? { ...transition, to: destination }
              : transition),
            // Executed movement remains `action`; this records which literal card
            // supplied it. Again is therefore just another card in Dev diagnostics.
            programCard: cardOption.programCardId,
            absoluteAction: executedAbsoluteAction
          };
          const nextRoute = {
            finalState: destination,
            initialState: current.initialState,
            startFacing: current.startFacing,
            parent: current,
            transition: transitionForDestination,
            localActions: current.localActions + 1,
            absoluteActions: nextAbsoluteActions,
            distance: current.distance + transition.distance,
            forcedDistance:
              current.forcedDistance + transition.forcedDistance,
            hazard: current.hazard + transition.hazard,
            rebootPenalty:
              current.rebootPenalty + transitionRebootPenalty,
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
            routeEnergyShadowReserve: energyStep.reserveAfter,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
            routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
            routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
            routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
            routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
            routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
            routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
            chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
            chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
            baseCost: nextBaseCost,
            cardAvailabilityPenalty:
              (current.cardAvailabilityPenalty || 0) +
              scarcityPenalty,
            programPlausibilityPenalty:
              (current.programPlausibilityPenalty || 0) +
              programPlausibilityPenalty,
            programCardState: nextProgramCardState,
            hazardExposure: nextHazardExposure,
            dynamicArchivePoint: nextDynamicArchivePoint
          };
          profile.routeNodeBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal, tileMap, options),
            searchPhysicalGoalCode: nextParts.physicalGoalCode,
            searchCardStateCode: nextParts.cardStateCode
          });
          profile.queueMs += profileNow() - blockStartedAt;
        }
      }
    }
  }

  const deduped = dedupeRoutes(completed).sort(
    compareScoredRouteLike
  );
  const selectedRoutes = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? selectContextualTrafficAlternativeRoutes(
      deduped,
      goal,
      maxOutputRoutes
    )
    : selectDistinctRoutes(
      deduped,
      goal,
      maxOutputRoutes
    );

  profile.retainedDominanceStates = bestCostByState.size;

  const profileTimingScale = detailedProfiling && profileTimedNodes > 0
    ? profilePoppedNodes / profileTimedNodes
    : 1;
  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "simulationHitMs",
    "simulationMissMs",
    // v48zn: physical-miss phase timers are collected only on sampled popped
    // nodes, exactly like simulationMissMs. Scale them with the same per-search
    // factor before aggregation so the phase shares use one consistent basis.
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
    "archiveContextMs",
    "destinationBuildMs",
    "routeNodeBuildMs",
    "historyBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number((profile[key] * profileTimingScale).toFixed(2));
  });
  profile.timingSampleInterval = profileSampleInterval;
  profile.timingSampledNodes = profileTimedNodes;
  profile.timingPopulationNodes = profilePoppedNodes;

  const hitExpansionCap = expansions >= maxExpansions;
  if (completed.length > 0) {
    profile.searchesWithGoal = 1;
    profile.firstGoalExpansionTotal = firstGoalExpansion ?? 0;
    profile.postFirstGoalExpansions = Math.max(
      0,
      expansions - (firstGoalExpansion ?? expansions)
    );
    if (completionPool > 1) {
      profile.optionalCompletionSearches = 1;
      profile.optionalCompletionStops = stoppedForOptionalCompletionBudget ? 1 : 0;
    }
  }
  if (selectedRoutes.length > 0 && selectedRoutes.length < maxOutputRoutes) {
    profile.optionalCompletionShortReturns = 1;
  }

  if (hitExpansionCap) {
    if (completed.length > 0) {
      profile.cappedWithGoalSearches = 1;
      profile.cappedWithGoalExpansions = expansions;
    } else {
      profile.cappedZeroGoalSearches = 1;
      profile.cappedZeroGoalExpansions = expansions;
    }
  }

  selectedRoutes.contextualSearchMeta = {
    expansions,
    maxExpansions,
    optionalCompletionAllowance,
    optionalCompletionStopExpansion,
    hitExpansionCap,
    stoppedAfterUsefulRoute: stoppedForOptionalCompletionBudget,
    zeroRouteCapFailure: (
      selectedRoutes.length === 0 &&
      hitExpansionCap
    ),
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: (
      selectedRoutes.length === 0 &&
      actionHorizonStops > 0
    ),
    forecastFidelity: "exact",
    uncertaintyMechanism: "breadth-only",
    forecastBandAtStart,
    forecastBandAtFirstGoal: completed[0]?.contextualForecastBand ?? null,
    firstGoalExpansion,
    completedGoals: completed.length
  };

  // Capture normal search duration before the dev-only key-space profiler.
  // This keeps route telemetry comparable with the non-profiling baseline.
  const routeSearchFinishedAt = analysisTelemetryNow();
  if (options.contextualDominanceKeyProfiling && !options.contextualFastCardState) {
    Object.assign(
      profile,
      summarizeContextualDominanceKeySpace(bestCostByState)
    );
  }

  recordRouteSearchTelemetry(
    options.contextualTelemetryKind ?? "contextual-leg",
    telemetryStartedAt,
    {
    durationMs: routeSearchFinishedAt - telemetryStartedAt,
    expansions,
    maxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: selectedRoutes.length === 0 && actionHorizonStops > 0,
    completedRoutes: completed.length,
    returnedRoutes: selectedRoutes.length,
    start: {
      x: context.state.x,
      y: context.state.y,
      facing: context.state.facing ?? null
    },
    goal: { x: goal.x, y: goal.y },
      ...(options.contextualTelemetryProfile === false
        ? {}
        : { contextualProfile: profile })
    }
  );
  return selectedRoutes;
}

// Public diagnostic wrapper around the exact realization programming model:
// current-turn play is literal, previous-turn natural/Again use is hard depletion,
// and unknown unplayed cards are integrated by the exact 9-card hand probability.
export function summarizeProgramSequencePressure(
  history,
  absoluteActions,
  actionIds,
  options = {}
) {
  const result = scoreContextualCardSequence(history, absoluteActions, actionIds, options);
  return {
    feasible: result.feasible,
    penalty: result.penalty,
    scarcityPenalty: result.scarcityPenalty,
    programPlausibilityPenalty: result.programPlausibilityPenalty,
    programCardIds: result.programCardIds,
    absoluteActions: result.absoluteActions,
    registerPhase: absoluteActions % REGISTER_COUNT,
    endingRegisterPhase: result.absoluteActions % REGISTER_COUNT
  };
}

function replayContextualRouteEnergyForContext(
  tileMap,
  route,
  context,
  options = {}
) {
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  let energy = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  let totalReward = 0;
  let totalRewardRegisterEquivalents = 0;
  let batteryReward = 0;
  let powerUpReward = 0;
  let chopShopReward = 0;
  let normalDraws = 0;
  let installs = 0;
  let extraCardDraws = 0;
  let energySpent = 0;
  let chopShopCardChoices = 0;
  let chopShopEnergyChoices = 0;

  let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  for (let index = 0; index < (route.transitions || []).length; index += 1) {
    const transition = route.transitions[index];
    if (!transition?.to || !transition?.action) continue;
    const executedAbsoluteAction = getTransitionAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    const step = getRouteEnergyShadowStep(
      tileMap,
      transition.to,
      transition.action,
      executedAbsoluteAction,
      energy,
      0,
      options,
      transition
    );
    totalReward += step.rewardScore || 0;
    totalRewardRegisterEquivalents += step.rewardRegisterEquivalents || 0;
    batteryReward += step.batteryRewardScore || 0;
    powerUpReward += step.powerUpRewardScore || 0;
    chopShopReward += step.chopShopRewardScore || 0;
    normalDraws += step.normalDraws || 0;
    installs += step.installs || 0;
    extraCardDraws += step.extraCardDraws || 0;
    energySpent += step.energySpent || 0;
    chopShopCardChoices += step.chopShopChoice === "card" ? 1 : 0;
    chopShopEnergyChoices += step.chopShopChoice === "energy" ? 1 : 0;
    energy = step.reserveAfter;
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  return {
    routeEnergyEconomyRewardScore: Number(totalReward.toFixed(2)),
    routeEnergyEconomyRewardRegisterEquivalents: Number(
      totalRewardRegisterEquivalents.toFixed(6)
    ),
    batteryEconomyRewardScore: Number(batteryReward.toFixed(2)),
    powerUpEconomyRewardScore: Number(powerUpReward.toFixed(2)),
    chopShopEconomyRewardScore: Number(chopShopReward.toFixed(2)),
    routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
      ? Number(context.energyReserve)
      : fallbackEconomyState.energy,
    routeEnergyShadowReserveEnd: energy,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: normalDraws,
    routeEconomyInstalls: installs,
    routeEconomyExtraCardDraws: extraCardDraws,
    routeEconomyEnergySpent: energySpent,
    chopShopCardChoices,
    chopShopEnergyChoices
  };
}

function isRouteCompatibleWithRebootStart(route, context, options = {}) {
  if (options.recoveryRule !== "reboot_tokens") return true;
  const rebootStart = context?.rebootStart;
  if (!rebootStart) return true;
  return !(route?.transitions || []).some((transition) => (
    transition?.rebootRecoverySource === "dock_start" &&
    (transition?.to?.x !== rebootStart.x || transition?.to?.y !== rebootStart.y)
  ));
}

function rebaseContextualCachedRoute(
  tileMap,
  route,
  context,
  options = {}
) {
  if (!isRouteCompatibleWithRebootStart(route, context, options)) return null;
  const cardState = scoreContextualCardSequence(
    context.history,
    context.absoluteActions,
    route.localActionIds,
    options,
    context.programCardState,
    route.transitions || []
  );
  if (!cardState.feasible) return null;

  // A shared later-leg catalogue trace keeps exact geometry/physics but must not
  // keep another start's resource valuation. Card scarcity/rolling legality and
  // the flattened Energy economy are cheap to replay on the already-discovered
  // transition chain, so the caller gets a route valid for *this* history.
  const oldCardPenalty = route.cardAvailabilityPenalty || 0;
  const oldProgramPlausibilityPenalty = route.programPlausibilityPenalty || 0;
  const oldApproximateCardPenalty = route.approximateCardPlausibilityPenalty || 0;
  const oldEconomyReward = route.routeEnergyEconomyRewardScore || 0;
  const oldMentalScore = getCompletedRoutePostbuildScoreAdjustment(route);
  const movingTarget = route.movingTarget
    ? {
      ...route.movingTarget,
      actions: cardState.absoluteActions
    }
    : null;
  const contextualHazardExposure = (
    Math.max(0, Number(context.hazardExposure) || 0) +
    Math.max(0, Number(route.hazard) || 0)
  );

  let rebasedElapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  const transitions = (route.transitions || []).map((transition, index) => {
    const executedAbsoluteAction = rebasedElapsedAbsoluteActions + 1;
    const rebased = {
      ...transition,
      programCard: cardState.programCardIds?.[index] ?? transition.programCard ?? transition.action,
      absoluteAction: executedAbsoluteAction
    };
    rebasedElapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    return rebased;
  });
  const rebasedRoute = { ...route, transitions };
  const economy = replayContextualRouteEnergyForContext(
    tileMap,
    rebasedRoute,
    context,
    options
  );
  const mental = replaySearchIntrinsicMentalForContext(
    tileMap,
    rebasedRoute,
    context,
    options,
    true
  );
  const score = Number((
    route.score -
    oldCardPenalty -
    oldProgramPlausibilityPenalty -
    oldApproximateCardPenalty +
    cardState.scarcityPenalty +
    cardState.programPlausibilityPenalty +
    oldEconomyReward -
    oldMentalScore +
    getCompletedRoutePostbuildScoreAdjustment(mental) -
    economy.routeEnergyEconomyRewardScore
  ).toFixed(2));

  return {
    ...route,
    ...economy,
    ...mental,
    transitions,
    absoluteStartAction: context.absoluteActions,
    absoluteActions: cardState.absoluteActions,
    movingTarget,
    score,
    cardAvailabilityPenalty: cardState.scarcityPenalty,
    programPlausibilityPenalty: cardState.programPlausibilityPenalty,
    approximateCardPlausibilityPenalty: 0,
    programHistoryEnd: cardState.history,
    programCardStateEnd: cardState.programCardState
      ? { ...cardState.programCardState }
      : null,
    contextualHazardExposure
  };
}

// v29 estimate-first routing helpers ----------------------------------------
//
// Physical estimates are deliberately independent of exact rolling card state.
// They are cheap, shared geometry/timing suggestions. Exact card realization is
// performed on the complete by-start route afterward; if it fails, only the
// physical suffix beginning at the first impossible register is re-estimated.
function buildEstimatedPhysicalRouteFromTransitions(
  tileMap,
  initialState,
  transitions,
  absoluteStartAction,
  goal,
  dynamicGoal,
  options = {}
) {
  const safeTransitions = (transitions || []).map((transition) => ({ ...transition }));
  const startAbsolute = Math.max(0, Math.floor(Number(absoluteStartAction) || 0));
  const localActionIds = safeTransitions
    .map((transition) => transition?.action)
    .filter(Boolean);
  let distance = 0;
  let forcedDistance = 0;
  let hazard = 0;
  let rebootPenalty = 0;
  let conveyorComplexity = 0;
  let physicalBaseCost = 0;
  let mentalEventCount = Math.max(
    0, Number(options.searchIntrinsicMentalEventCountStart) || 0
  );
  const mentalEventCountStart = mentalEventCount;
  let searchIntrinsicMentalRE = 0;
  let searchIntrinsicMentalScore = 0;
  let searchIntrinsicMentalEventWeight = 0;
  let homingMissileActivationCount = 0;
  const homingMissileActivatedSpacesThisTurn = new Set(
    Array.isArray(options.searchHomingMissileActivatedSpacesCurrentTurn)
      ? options.searchHomingMissileActivatedSpacesCurrentTurn
      : []
  );
  const variantMentalEventIdsThisTurn = new Set(
    Array.isArray(options.searchVariantMentalEventIdsCurrentTurn)
      ? options.searchVariantMentalEventIdsCurrentTurn
      : []
  );
  let activeTurnNumber = startAbsolute > 0
    ? Math.floor((startAbsolute - 1) / REGISTER_COUNT) + 1
    : 1;

  let elapsedAbsoluteActions = startAbsolute;
  safeTransitions.forEach((transition, transitionIndex) => {
    const actionId = transition?.action;
    const action = ACTIONS.find((candidate) => candidate.id === actionId) ?? null;
    const absoluteActionsBefore = elapsedAbsoluteActions;
    const executedAbsoluteAction = absoluteActionsBefore + 1;
    transition.absoluteAction = executedAbsoluteAction;
    const currentTarget = getDynamicGoalPosition(dynamicGoal, absoluteActionsBefore) ?? goal;
    const transitionRebootPenalty = transition?.rebooted
      ? getRebootRoutePenalty(executedAbsoluteAction)
      : (transition?.rebootPenalty || 0);
    const actionPenalty = action ? getRouteAwareActionPenalty(action, options) : 0;
    const transitionConveyorComplexity = scoreTransitionConveyorComplexity(
      transition,
      currentTarget
    );
    const checkpointHit = options.searchMentalCheckpointAtEnd !== false &&
      transitionIndex === safeTransitions.length - 1;
    const turnNumber = Math.floor(
      (Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT
    ) + 1;
    if (turnNumber !== activeTurnNumber) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
      activeTurnNumber = turnNumber;
    }
    const mentalStep = getSearchIntrinsicMentalTransitionStep(
      tileMap,
      transition,
      executedAbsoluteAction,
      mentalEventCount,
      checkpointHit,
      options,
      {
        homingMissileActivatedSpacesThisTurn,
        variantMentalEventIdsThisTurn
      }
    );
    const stepHomingActivations = (mentalStep.events || []).filter(
      (event) => event?.type === "homing-missile-target-choice"
    ).length;
    homingMissileActivationCount += stepHomingActivations;
    mentalEventCount = mentalStep.nextEventCount;
    searchIntrinsicMentalRE += mentalStep.deltaRE;
    searchIntrinsicMentalScore += mentalStep.score;
    searchIntrinsicMentalEventWeight += mentalStep.eventWeight;
    distance += Number(transition?.distance) || 0;
    forcedDistance += Number(transition?.forcedDistance) || 0;
    hazard += Number(transition?.hazard) || 0;
    rebootPenalty += transitionRebootPenalty;
    conveyorComplexity += transitionConveyorComplexity;
    physicalBaseCost +=
      (Number(transition?.hazard) || 0) +
      transitionRebootPenalty +
      actionPenalty +
      mentalStep.score -
      stepHomingActivations * HOMING_MISSILE_STRATEGIC_CREDIT_RE * REGISTER_TEMPO_COST;
    if (mentalStep.closesTurn) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
    }
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  });

  const approximateCardPlausibilityPenalty = scoreEstimatedProgramDemand(
    localActionIds,
    startAbsolute,
    null,
    options,
    safeTransitions
  );
  const absoluteActions = elapsedAbsoluteActions;
  const finalState = safeTransitions.length
    ? cloneState(safeTransitions.at(-1).to)
    : cloneState(initialState);
  const hitTarget = getDynamicGoalPosition(dynamicGoal, absoluteActions) ?? goal;
  const route = {
    path: buildTimeline(safeTransitions, initialState),
    transitions: safeTransitions,
    finalState,
    initialState: cloneState(initialState),
    startFacing: initialState?.facing ?? "E",
    hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? null,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: absoluteActions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    actions: localActionIds.length,
    absoluteStartAction: startAbsolute,
    absoluteActions,
    distance: Number(distance.toFixed(2)),
    forcedDistance: Number(forcedDistance.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    rebootPenalty: Number(rebootPenalty.toFixed(2)),
    conveyorComplexity: Number(conveyorComplexity.toFixed(2)),
    rebootCount: safeTransitions.filter((transition) => transition?.rebooted).length,
    score: Number((physicalBaseCost + approximateCardPlausibilityPenalty).toFixed(2)),
    routeEnergyEconomyRewardScore: 0,
    batteryEconomyRewardScore: 0,
    powerUpEconomyRewardScore: 0,
    chopShopEconomyRewardScore: 0,
    routeEnergyShadowReserveStart: null,
    routeEnergyShadowReserveEnd: null,
    searchIntrinsicMentalRegisterEquivalents: Number(
      searchIntrinsicMentalRE.toFixed(4)
    ),
    searchIntrinsicMentalScore: Number(searchIntrinsicMentalScore.toFixed(2)),
    searchIntrinsicMentalEventWeight: Number(
      searchIntrinsicMentalEventWeight.toFixed(4)
    ),
    searchIntrinsicMentalEventCountStart: Number(mentalEventCountStart.toFixed(4)),
    searchIntrinsicMentalEventCountEnd: Number(mentalEventCount.toFixed(4)),
    searchHomingMissileActivatedSpacesCurrentTurn:
      [...homingMissileActivatedSpacesThisTurn],
    homingMissileActivationCount,
    homingMissileStrategicCreditRE: Number(
      (homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE).toFixed(4)
    ),
    homingMissileStrategicCreditScore: Number(
      (homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE *
        REGISTER_TEMPO_COST).toFixed(2)
    ),
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    searchIntrinsicMentalModel: 'rounded-turn-events-quadratic-after-7-v49bc-postbuild',
    dynamicArchivePointStart: options.dynamicArchivePointStart
      ? { ...options.dynamicArchivePointStart }
      : null,
    dynamicArchivePointEnd: options.dynamicArchivePointEnd
      ? { ...options.dynamicArchivePointEnd }
      : options.dynamicArchivePointStart
        ? { ...options.dynamicArchivePointStart }
        : null,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: 0,
    routeEconomyInstalls: 0,
    routeEconomyExtraCardDraws: 0,
    routeEconomyEnergySpent: 0,
    chopShopCardChoices: 0,
    chopShopEnergyChoices: 0,
    cardAvailabilityPenalty: 0,
    programPlausibilityPenalty: 0,
    approximateCardPlausibilityPenalty,
    localActionIds,
    programHistoryEnd: [],
    goalReached: (
      finalState.x === hitTarget.x &&
      finalState.y === hitTarget.y
    ),
    fullCourseLeg: true,
    physicalTimingTemplate: true,
    estimatedPrimaryTemplate: true
  };
  return route;
}

function combineEstimatedPhysicalRouteSuffix(
  tileMap,
  route,
  prefixActionCount,
  suffix,
  goal,
  dynamicGoal,
  options = {}
) {
  const prefixCount = Math.max(
    0,
    Math.min(
      route?.transitions?.length ?? 0,
      Math.floor(Number(prefixActionCount) || 0)
    )
  );
  const transitions = [
    ...(route?.transitions || []).slice(0, prefixCount),
    ...(suffix?.transitions || [])
  ];
  return buildEstimatedPhysicalRouteFromTransitions(
    tileMap,
    route?.initialState ?? suffix?.initialState,
    transitions,
    route?.absoluteStartAction ?? 0,
    goal,
    dynamicGoal,
    {
      ...options,
      dynamicArchivePointStart:
        route?.dynamicArchivePointStart ?? options.dynamicArchivePointStart,
      dynamicArchivePointEnd:
        suffix?.dynamicArchivePointEnd ?? route?.dynamicArchivePointEnd ?? options.dynamicArchivePointEnd,
      searchIntrinsicMentalEventCountStart:
        route?.searchIntrinsicMentalEventCountStart ??
        options.searchIntrinsicMentalEventCountStart ?? 0
    }
  );
}

function getEstimatedRouteIdentity(route) {
  if (!route) return "-";
  const actions = (route.localActionIds || []).join(".");
  const destinations = (route.transitions || []).map((transition) => (
    `${transition?.to?.x ?? "?"},${transition?.to?.y ?? "?"},${transition?.to?.facing ?? "?"}`
  )).join(";");
  return [
    `a${route.absoluteStartAction ?? 0}`,
    actions,
    destinations
  ].join("|");
}

function getEstimatedRouteFailureConstraintKey(
  state,
  absoluteActions,
  prefixActionIds
) {
  const history = getProgramHistoryWindow(prefixActionIds || []);
  return [
    stateKey(state),
    `r${Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT}`,
    `h${history.join(".") || "-"}`
  ].join("|");
}

function replayDynamicArchivingEstimatedLegPhysics(
  tileMap,
  estimatedLeg,
  context,
  options = {}
) {
  if (options.recoveryRule !== "dynamic_archiving") return null;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayChecks += 1;
  const exactReplayStartedAt = analysisTelemetryNow();
  const failReplay = () => {
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMismatches += 1;
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs +=
      analysisTelemetryNow() - exactReplayStartedAt;
    return null;
  };
  const actionIds = [...(estimatedLeg?.localActionIds || [])];
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayActions += actionIds.length;
  const expectedTransitions = estimatedLeg?.transitions || [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const goal = estimatedLeg?.hitTarget ?? estimatedLeg?.finalState ?? null;
  let state = cloneState(context.state);
  let dynamicArchivePoint = context?.dynamicArchivePoint
    ? { ...context.dynamicArchivePoint }
    : { x: state.x, y: state.y };
  const dynamicArchivePointStart = { ...dynamicArchivePoint };
  let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  const transitions = [];

  for (let index = 0; index < actionIds.length; index += 1) {
    const action = ACTIONS.find((candidate) => candidate.id === actionIds[index]);
    if (!action) return failReplay();
    const executedAbsoluteAction = elapsedAbsoluteActions + 1;
    const transition = simulateAction(
      tileMap,
      state,
      action,
      {
        ...options,
        portalMap,
        goal,
        rebootStart: options.rebootStart ?? context.rebootStart ?? null,
        registerIndex: elapsedAbsoluteActions % REGISTER_COUNT,
        dynamicArchivePoint
      }
    );
    if (!transition || transition.crashed || transition.blocked) return failReplay();

    const expectedTo = expectedTransitions[index]?.to;
    if (
      expectedTo &&
      (transition.to?.x !== expectedTo.x ||
        transition.to?.y !== expectedTo.y ||
        transition.to?.facing !== expectedTo.facing)
    ) {
      return failReplay();
    }

    const realizedTransition = {
      ...transition,
      absoluteAction: executedAbsoluteAction
    };
    transitions.push(realizedTransition);
    state = cloneState(transition.to);
    dynamicArchivePoint = getNextDynamicArchivePoint(
      tileMap,
      transition.to,
      dynamicArchivePoint,
      options
    );
    elapsedAbsoluteActions = transition.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  const rebuilt = buildEstimatedPhysicalRouteFromTransitions(
    tileMap,
    context.state,
    transitions,
    context.absoluteActions,
    goal,
    null,
    {
      ...options,
      dynamicArchivePointStart,
      dynamicArchivePointEnd: dynamicArchivePoint,
      searchIntrinsicMentalEventCountStart:
        context.searchIntrinsicMentalEventCountCurrentTurn ?? 0,
      searchHomingMissileActivatedSpacesCurrentTurn:
        context.searchHomingMissileActivatedSpacesCurrentTurn ?? []
    }
  );
  const approximateCardPenalty = Math.max(
    0,
    Number(rebuilt?.approximateCardPlausibilityPenalty) || 0
  );
  const archiveReward = scoreDynamicArchivingRouteUtility(
    tileMap,
    rebuilt,
    options
  );
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs +=
    analysisTelemetryNow() - exactReplayStartedAt;
  return {
    transitions,
    absoluteActions: elapsedAbsoluteActions,
    dynamicArchivePointStart,
    dynamicArchivePointEnd: dynamicArchivePoint ? { ...dynamicArchivePoint } : null,
    physicalScore: Number((
      (Number(rebuilt?.score) || 0) -
      approximateCardPenalty -
      (Number(rebuilt?.searchIntrinsicMentalScore) || 0) -
      archiveReward
    ).toFixed(2)),
    hazard: Number(rebuilt?.hazard) || 0,
    distance: Number(rebuilt?.distance) || 0,
    forcedDistance: Number(rebuilt?.forcedDistance) || 0,
    rebootPenalty: Number(rebuilt?.rebootPenalty) || 0,
    conveyorComplexity: Number(rebuilt?.conveyorComplexity) || 0,
    dynamicArchivingRewardScore: archiveReward
  };
}

function realizeEstimatedLegsWithCardSolution(
  tileMap,
  estimatedLegs,
  initialContext,
  cardSolution,
  options = {}
) {
  if (!cardSolution?.feasible) return null;
  const exactLegs = [];
  let context = {
    ...initialContext,
    state: cloneState(initialContext.state),
    history: getProgramHistoryWindow(initialContext.history),
    programCardState: initialContext.programCardState
      ? { ...initialContext.programCardState }
      : null
  };
  let actionOffset = 0;

  for (let legIndex = 0; legIndex < estimatedLegs.length; legIndex += 1) {
    const estimatedLeg = estimatedLegs[legIndex];
    const localActionIds = [...(estimatedLeg?.localActionIds || [])];
    const actionCount = localActionIds.length;
    const programCardIds = cardSolution.programCardIds.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionPenalties = cardSolution.actionPenalties.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionScarcityPenalties = (
      cardSolution.actionScarcityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    const actionPlausibilityPenalties = (
      cardSolution.actionPlausibilityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    if (programCardIds.length !== actionCount) return null;

    const dynamicPhysicalReplay = options.recoveryRule === "dynamic_archiving"
      ? replayDynamicArchivingEstimatedLegPhysics(
        tileMap,
        estimatedLeg,
        context,
        options
      )
      : null;
    if (options.recoveryRule === "dynamic_archiving" && !dynamicPhysicalReplay) {
      return null;
    }
    let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
    const physicalTransitions = dynamicPhysicalReplay?.transitions ??
      (estimatedLeg?.transitions || []);
    const transitions = physicalTransitions.map((transition, index) => {
      const executedAbsoluteAction = elapsedAbsoluteActions + 1;
      const realizedTransition = {
        ...transition,
        programCard: programCardIds[index] ?? transition?.action,
        absoluteAction: executedAbsoluteAction
      };
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      return realizedTransition;
    });
    const cardAvailabilityPenalty = actionScarcityPenalties.length === actionCount
      ? actionScarcityPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      )
      : actionPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      );
    const programPlausibilityPenalty = actionPlausibilityPenalties.reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    const oldApproximateCardPenalty = Number(
      estimatedLeg?.approximateCardPlausibilityPenalty
    ) || 0;
    const oldCardPenalty = Number(estimatedLeg?.cardAvailabilityPenalty) || 0;
    const oldProgramPlausibilityPenalty = Number(
      estimatedLeg?.programPlausibilityPenalty
    ) || 0;
    const oldEconomyReward = Number(
      estimatedLeg?.routeEnergyEconomyRewardScore
    ) || 0;
    const oldMentalScore = getCompletedRoutePostbuildScoreAdjustment(
      estimatedLeg
    );
    const physicalScore = dynamicPhysicalReplay
      ? dynamicPhysicalReplay.physicalScore
      : (
        (Number(estimatedLeg?.score) || 0) -
        oldApproximateCardPenalty -
        oldCardPenalty -
        oldProgramPlausibilityPenalty -
        oldMentalScore +
        oldEconomyReward
      );
    const absoluteStartAction = context.absoluteActions;
    const absoluteActions = elapsedAbsoluteActions;
    const endCardState = actionCount > 0
      ? cardSolution.cardStates[actionOffset + actionCount - 1]
      : context.programCardState;
    const programHistoryEnd = getProgramHistoryWindow([
      ...getProgramHistoryWindow(context.history),
      ...localActionIds
    ]);
    const movingTarget = estimatedLeg?.movingTarget
      ? {
        ...estimatedLeg.movingTarget,
        actions: absoluteActions
      }
      : null;
    const contextualHazardExposure = (
      Math.max(0, Number(context.hazardExposure) || 0) +
      Math.max(0, Number(
        dynamicPhysicalReplay?.hazard ?? estimatedLeg?.hazard
      ) || 0)
    );
    const exactBase = {
      ...estimatedLeg,
      ...(dynamicPhysicalReplay ? {
        hazard: dynamicPhysicalReplay.hazard,
        distance: dynamicPhysicalReplay.distance,
        forcedDistance: dynamicPhysicalReplay.forcedDistance,
        rebootPenalty: dynamicPhysicalReplay.rebootPenalty,
        conveyorComplexity: dynamicPhysicalReplay.conveyorComplexity,
        dynamicArchivingRewardScore: dynamicPhysicalReplay.dynamicArchivingRewardScore,
        dynamicArchivePointStart: dynamicPhysicalReplay.dynamicArchivePointStart,
        dynamicArchivePointEnd: dynamicPhysicalReplay.dynamicArchivePointEnd
      } : {}),
      transitions,
      absoluteStartAction,
      absoluteActions,
      movingTarget,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty
      ).toFixed(2)),
      cardAvailabilityPenalty: Number(cardAvailabilityPenalty.toFixed(2)),
      programPlausibilityPenalty: Number(programPlausibilityPenalty.toFixed(2)),
      approximateCardPlausibilityPenalty: 0,
      programHistoryEnd,
      programCardStateEnd: endCardState ? { ...endCardState } : null,
      contextualHazardExposure,
      physicalTimingTemplate: false,
      estimatedPrimaryTemplate: false
    };
    const economy = replayContextualRouteEnergyForContext(
      tileMap,
      exactBase,
      context,
      options
    );
    const mental = replaySearchIntrinsicMentalForContext(
      tileMap,
      exactBase,
      context,
      options,
      true
    );
    const exactLeg = {
      ...exactBase,
      ...economy,
      ...mental,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty +
        getCompletedRoutePostbuildScoreAdjustment(mental) -
        economy.routeEnergyEconomyRewardScore
      ).toFixed(2))
    };
    const nextContext = getContextAfterLeg(
      exactLeg,
      context,
      tileMap,
      options
    );
    exactLeg.contextualForecastBand = getContextualForecastBand(
      nextContext,
      options
    );
    exactLegs.push(exactLeg);
    context = nextContext;
    actionOffset += actionCount;
  }

  return {
    legs: exactLegs,
    context,
    score: exactLegs.reduce((sum, leg) => sum + (Number(leg.score) || 0), 0)
  };
}

function getContextAfterLeg(
  route,
  priorContext = null,
  tileMap = null,
  options = {}
) {
  const priorHazard = Math.max(0, Number(priorContext?.hazardExposure) || 0);
  const routeHazard = Math.max(0, Number(route?.hazard) || 0);
  const priorAdverseRE = Math.max(0, Number(priorContext?.reNativeAdverseRE) || 0);
  const routeUncertaintyProfile = tileMap && route
    ? getRENativeProductionTrafficForecastProfile(tileMap, route, options)
    : null;
  const routeAdverseRE = Math.max(
    0,
    Number(routeUncertaintyProfile?.totalAdverseRE) || 0
  );
  return {
    state: cloneState(route.finalState),
    rebootStart: priorContext?.rebootStart
      ? { ...priorContext.rebootStart }
      : route?.initialState
        ? { x: route.initialState.x, y: route.initialState.y }
        : null,
    absoluteActions: route.absoluteActions,
    history: getProgramHistoryWindow(route.programHistoryEnd),
    programCardState: route.programCardStateEnd
      ? { ...route.programCardStateEnd }
      : (priorContext?.programCardState ? { ...priorContext.programCardState } : null),
    energyReserve: Number.isFinite(Number(route.routeEnergyShadowReserveEnd))
      ? Number(route.routeEnergyShadowReserveEnd)
      : null,
    searchIntrinsicMentalEventCountCurrentTurn: Math.max(
      0, Number(route.searchIntrinsicMentalEventCountEnd) || 0
    ),
    searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
      route.searchHomingMissileActivatedSpacesCurrentTurn
    )
      ? [...route.searchHomingMissileActivatedSpacesCurrentTurn]
      : [],
    upgradeCardUnits: null,
    hazardExposure: Number.isFinite(Number(route.contextualHazardExposure))
      ? Number(route.contextualHazardExposure)
      : priorHazard + routeHazard,
    reNativeAdverseRE: Number((priorAdverseRE + routeAdverseRE).toFixed(6)),
    dynamicArchivePoint: route?.dynamicArchivePointEnd
      ? { ...route.dynamicArchivePointEnd }
      : priorContext?.dynamicArchivePoint
        ? { ...priorContext.dynamicArchivePoint }
        : null
  };
}

function getPartialBeamCurrentLeg(partial) {
  return partial.legs.at(-1) ?? null;
}

function getContextualBeamWidthForPartials(partials, requestedWidth, options = {}) {
  const width = Math.max(1, Math.floor(Number(requestedWidth) || 1));
  if (!options.contextualUncertaintyBreadth || !Array.isArray(partials) || !partials.length) {
    return width;
  }
  const best = [...partials].filter(Boolean).sort(
    compareScoredRouteLike
  )[0];
  if (!best?.context) return width;
  return getContextualBreadthPolicy(
    best.context,
    width,
    width,
    width,
    0,
    options
  ).beamWidth;
}

function selectContextualPartialBeam(
  partials,
  goal,
  width = CONTEXTUAL_BEAM_WIDTH,
  diversityOptions = {}
) {
  // Exact register-aware factory physics can legitimately eliminate every
  // continuation for a start on a later leg. Whole-route diversity used to
  // fall through to sorted[0].score in that case, producing the intermittent
  // "best.score" generation crash instead of an ordinary zero-route result.
  // A later stress run also proved that a sparse/null partial can reach this
  // boundary: the width helper already ignored it, while this selector sorted
  // it and Safari crashed on left.score. Null partials are non-routes, so drop
  // them here before any score comparison.
  if (!Array.isArray(partials) || width <= 0) {
    return [];
  }
  const validPartials = partials.filter(Boolean);
  if (!validPartials.length) {
    return [];
  }

  if (validPartials.length <= width && !diversityOptions.wholePartialDiversity) {
    return [...validPartials].sort(
      compareScoredRouteLike
    );
  }

  const sorted = [...validPartials].sort(
    compareScoredRouteLike
  );
  const best = sorted[0];
  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.filter(
    (partial) => partial.score <= best.score + scoreAllowance
  );

  if (width === 1 || eligible.length === 1) {
    return [best];
  }

  const wholePartialDiversity = Boolean(
    diversityOptions.wholePartialDiversity
  );
  const partialFlags = Array.isArray(diversityOptions.flags)
    ? diversityOptions.flags
    : [];
  const bestComparisonRoute = wholePartialDiversity
    ? stitchContextualLegs(best.legs, partialFlags)
    : getPartialBeamCurrentLeg(best);
  let diverse = null;
  let diverseNovelty = -1;

  for (const candidate of eligible.slice(1)) {
    const candidateComparisonRoute = wholePartialDiversity
      ? stitchContextualLegs(candidate.legs, partialFlags)
      : getPartialBeamCurrentLeg(candidate);
    if (!candidateComparisonRoute || !bestComparisonRoute) {
      continue;
    }

    const novelty = 1 - routeSimilarity(
      candidateComparisonRoute,
      bestComparisonRoute,
      goal
    );
    if (
      novelty > diverseNovelty + 0.001 ||
      (
        Math.abs(novelty - diverseNovelty) <= 0.001 &&
        candidate.score < (diverse?.score ?? Infinity)
      )
    ) {
      diverse = candidate;
      diverseNovelty = novelty;
    }
  }

  return diverse && diverseNovelty >= 0.1
    ? [best, diverse].sort(
      compareScoredRouteLike
    )
    : [best];
}

function stitchContextualLegs(legs, flags) {
  if (!legs?.length) {
    return null;
  }

  const transitions = legs.flatMap(
    (leg) => leg.transitions || []
  );
  const initialState = legs[0].initialState;
  const finalState = legs.at(-1).finalState;
  const path = buildTimeline(transitions, initialState);
  let cumulativeActions = 0;
  let cumulativeDistance = 0;
  let cumulativeForcedDistance = 0;
  let cumulativeHazard = 0;
  let cumulativeRebootPenalty = 0;
  let cumulativeBaseCost = 0;
  let cumulativeCardAvailabilityPenalty = 0;
  let cumulativeProgramPlausibilityPenalty = 0;
  let cumulativeRouteEnergyEconomyRewardScore = 0;
  let cumulativeBatteryEconomyRewardScore = 0;
  let cumulativePowerUpEconomyRewardScore = 0;
  let cumulativeChopShopEconomyRewardScore = 0;
  let cumulativeSearchIntrinsicMentalRE = 0;
  let cumulativeSearchIntrinsicMentalScore = 0;
  let cumulativeSearchIntrinsicMentalEventWeight = 0;
  let cumulativeHomingMissileActivationCount = 0;
  let cumulativeHomingMissileStrategicCreditRE = 0;
  let cumulativeHomingMissileStrategicCreditScore = 0;
  const checkpointHits = [];

  legs.forEach((leg, legIndex) => {
    cumulativeActions += leg.actions ?? 0;
    cumulativeDistance += leg.distance ?? 0;
    cumulativeForcedDistance += leg.forcedDistance ?? 0;
    cumulativeHazard += leg.hazard ?? 0;
    cumulativeRebootPenalty += leg.rebootPenalty ?? 0;
    cumulativeBaseCost += leg.score ?? 0;
    cumulativeCardAvailabilityPenalty += leg.cardAvailabilityPenalty ?? 0;
    cumulativeProgramPlausibilityPenalty += leg.programPlausibilityPenalty ?? 0;
    cumulativeRouteEnergyEconomyRewardScore += leg.routeEnergyEconomyRewardScore ?? 0;
    cumulativeBatteryEconomyRewardScore += leg.batteryEconomyRewardScore ?? 0;
    cumulativePowerUpEconomyRewardScore += leg.powerUpEconomyRewardScore ?? 0;
    cumulativeChopShopEconomyRewardScore += leg.chopShopEconomyRewardScore ?? 0;
    cumulativeSearchIntrinsicMentalRE +=
      leg.searchIntrinsicMentalRegisterEquivalents ?? 0;
    cumulativeSearchIntrinsicMentalScore += leg.searchIntrinsicMentalScore ?? 0;
    cumulativeSearchIntrinsicMentalEventWeight +=
      leg.searchIntrinsicMentalEventWeight ?? 0;
    cumulativeHomingMissileActivationCount +=
      Math.max(0, Number(leg.homingMissileActivationCount) || 0);
    cumulativeHomingMissileStrategicCreditRE +=
      Math.max(0, Number(leg.homingMissileStrategicCreditRE) || 0);
    cumulativeHomingMissileStrategicCreditScore +=
      Math.max(0, Number(leg.homingMissileStrategicCreditScore) || 0);
    const flag = flags[legIndex];

    checkpointHits.push({
      checkpointIndex: legIndex,
      checkpointId: flag?.id ?? legIndex + 1,
      action: cumulativeActions,
      absoluteAction: Number.isFinite(Number(leg?.absoluteActions))
        ? Number(leg.absoluteActions)
        : cumulativeActions,
      state: cloneState(leg.finalState),
      position: leg.hitTarget ?? flag,
      movingTarget: leg.movingTarget ?? null,
      distance: cumulativeDistance,
      forcedDistance: cumulativeForcedDistance,
      hazard: cumulativeHazard,
      rebootPenalty: cumulativeRebootPenalty,
      baseCost: cumulativeBaseCost,
      routeEnergyEconomyRewardScore: cumulativeRouteEnergyEconomyRewardScore,
      batteryEconomyRewardScore: cumulativeBatteryEconomyRewardScore,
      powerUpEconomyRewardScore: cumulativePowerUpEconomyRewardScore,
      chopShopEconomyRewardScore: cumulativeChopShopEconomyRewardScore,
      routeEnergyShadowReserve: leg.routeEnergyShadowReserveEnd ?? null,
      routeUpgradeCardShadowUnits: leg.routeUpgradeCardShadowUnitsEnd ?? null
    });
  });

  return {
    path,
    transitions,
    finalState,
    initialState,
    startFacing: legs[0].startFacing,
    checkpointHits,
    actionHistory: legs.flatMap(
      (leg) => leg.localActionIds || []
    ),
    actions: cumulativeActions,
    absoluteStartAction: Math.max(0, Number(legs[0]?.absoluteStartAction) || 0),
    absoluteActions: Math.max(
      Math.max(0, Number(legs[0]?.absoluteStartAction) || 0),
      Number(legs.at(-1)?.absoluteActions) || 0
    ),
    distance: Number(cumulativeDistance.toFixed(2)),
    forcedDistance: Number(
      cumulativeForcedDistance.toFixed(2)
    ),
    hazard: Number(cumulativeHazard.toFixed(2)),
    rebootPenalty: Number(cumulativeRebootPenalty.toFixed(2)),
    conveyorComplexity: Number(
      legs.reduce(
        (sum, leg) => sum + (leg.conveyorComplexity || 0),
        0
      ).toFixed(2)
    ),
    rebootCount: legs.reduce(
      (sum, leg) => sum + (leg.rebootCount || 0),
      0
    ),
    score: Number(cumulativeBaseCost.toFixed(2)),
    cardAvailabilityPenalty: Number(cumulativeCardAvailabilityPenalty.toFixed(2)),
    programPlausibilityPenalty: Number(cumulativeProgramPlausibilityPenalty.toFixed(2)),
    routeEnergyEconomyRewardScore: Number(cumulativeRouteEnergyEconomyRewardScore.toFixed(2)),
    batteryEconomyRewardScore: Number(cumulativeBatteryEconomyRewardScore.toFixed(2)),
    powerUpEconomyRewardScore: Number(cumulativePowerUpEconomyRewardScore.toFixed(2)),
    chopShopEconomyRewardScore: Number(cumulativeChopShopEconomyRewardScore.toFixed(2)),
    searchIntrinsicMentalRegisterEquivalents: Number(
      cumulativeSearchIntrinsicMentalRE.toFixed(4)
    ),
    searchIntrinsicMentalScore: Number(cumulativeSearchIntrinsicMentalScore.toFixed(2)),
    searchIntrinsicMentalEventWeight: Number(
      cumulativeSearchIntrinsicMentalEventWeight.toFixed(4)
    ),
    searchIntrinsicMentalEventCountStart:
      legs[0].searchIntrinsicMentalEventCountStart ?? 0,
    searchIntrinsicMentalEventCountEnd:
      legs.at(-1)?.searchIntrinsicMentalEventCountEnd ?? 0,
    searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
      legs.at(-1)?.searchHomingMissileActivatedSpacesCurrentTurn
    )
      ? [...legs.at(-1).searchHomingMissileActivatedSpacesCurrentTurn]
      : [],
    homingMissileActivationCount: cumulativeHomingMissileActivationCount,
    homingMissileStrategicCreditRE: Number(
      cumulativeHomingMissileStrategicCreditRE.toFixed(4)
    ),
    homingMissileStrategicCreditScore: Number(
      cumulativeHomingMissileStrategicCreditScore.toFixed(2)
    ),
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    searchIntrinsicMentalModel: 'rounded-turn-events-quadratic-after-7-v49bc-postbuild',
    routeEnergyShadowReserveStart: legs[0].routeEnergyShadowReserveStart ?? null,
    routeEnergyShadowReserveEnd: legs.at(-1)?.routeEnergyShadowReserveEnd ?? null,
    routeUpgradeCardShadowUnitsStart: legs[0].routeUpgradeCardShadowUnitsStart ?? null,
    routeUpgradeCardShadowUnitsEnd: legs.at(-1)?.routeUpgradeCardShadowUnitsEnd ?? null,
    goalReached: true,
    fullCourse: true,
    legRoutes: legs
  };
}

function summarizeRouteAgainUsage(route, options = {}) {
  const actions = Array.isArray(route?.actionHistory)
    ? route.actionHistory
    : [];
  const transitions = Array.isArray(route?.transitions)
    ? route.transitions
    : [];
  const literalCards = transitions.length === actions.length &&
    transitions.every((transition) => typeof transition?.programCard === "string")
    ? transitions.map((transition) => transition.programCard)
    : null;
  const programs = [];
  const cardPrograms = [];
  const programTurnIds = [];
  const againTurns = [];
  let literalProgramViolations = 0;
  let rollingWindowViolations = 0;

  if (transitions.length === actions.length && transitions.length) {
    const byTurn = new Map();
    let elapsedAbsoluteActions = Math.max(0, Number(route?.absoluteStartAction) || 0);
    transitions.forEach((transition, index) => {
      const absoluteAction = getTransitionAbsoluteAction(
        transition,
        elapsedAbsoluteActions + 1
      );
      const turnId = Math.floor((absoluteAction - 1) / REGISTER_COUNT);
      if (!byTurn.has(turnId)) byTurn.set(turnId, []);
      byTurn.get(turnId).push({
        actionId: actions[index],
        programCardId: literalCards?.[index] ?? null
      });
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(absoluteAction)
        : absoluteAction;
    });
    [...byTurn.entries()]
      .sort((left, right) => left[0] - right[0])
      .forEach(([turnId, entries]) => {
        programTurnIds.push(turnId);
        programs.push(entries.map((entry) => entry.actionId));
        if (literalCards) {
          cardPrograms.push(entries.map((entry) => entry.programCardId));
        }
      });
  } else {
    for (let offset = 0, turnIndex = 0; offset < actions.length; offset += REGISTER_COUNT, turnIndex += 1) {
      programTurnIds.push(turnIndex);
      programs.push(actions.slice(offset, offset + REGISTER_COUNT));
      if (literalCards) {
        cardPrograms.push(literalCards.slice(offset, offset + REGISTER_COUNT));
      }
    }
  }

  programs.forEach((program, turnIndex) => {
    if (literalCards) {
      const cards = cardPrograms[turnIndex] || [];
      const counts = new Map();
      cards.forEach((cardId, registerIndex) => {
        counts.set(cardId, (counts.get(cardId) || 0) + 1);
        if (
          cardId === "AGAIN" &&
          (
            registerIndex === 0 ||
            program[registerIndex] !== program[registerIndex - 1]
          )
        ) {
          literalProgramViolations += 1;
        }
      });
      for (const resourceId of COMPACT_PROGRAM_RESOURCE_IDS) {
        const limit = resourceId === "AGAIN"
          ? AGAIN_CARD_COUNT
          : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
        if ((counts.get(resourceId) || 0) > limit) {
          literalProgramViolations += 1;
          break;
        }
      }
      if (cards.includes("AGAIN")) againTurns.push(programTurnIds[turnIndex]);
    } else {
      const summary = getLiteralProgramResourceSummary(program);
      if (!summary.feasible) literalProgramViolations += 1;
      if (summary.requiresAgain) againTurns.push(programTurnIds[turnIndex]);
    }
  });

  if (getProgramCardModelProfile(options).previousTurnDepletionActive) {
    if (literalCards) {
      for (let turnIndex = 1; turnIndex < cardPrograms.length; turnIndex += 1) {
        if (programTurnIds[turnIndex] !== programTurnIds[turnIndex - 1] + 1) continue;
        const previous = cardPrograms[turnIndex - 1];
        const current = cardPrograms[turnIndex];
        const combined = new Map();
        [...previous, ...current].forEach((cardId) => {
          combined.set(cardId, (combined.get(cardId) || 0) + 1);
        });
        const violation = COMPACT_PROGRAM_RESOURCE_IDS.some((resourceId) => {
          const limit = resourceId === "AGAIN"
            ? AGAIN_CARD_COUNT
            : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
          return (combined.get(resourceId) || 0) > limit;
        });
        if (violation) rollingWindowViolations += 1;
      }
    } else {
      for (let turnIndex = 1; turnIndex < programs.length; turnIndex += 1) {
        if (programTurnIds[turnIndex] !== programTurnIds[turnIndex - 1] + 1) continue;
        const previousStates = getLiteralProgramResourceStates(programs[turnIndex - 1]);
        const currentStates = getLiteralProgramResourceStates(programs[turnIndex]);
        const compatible = previousStates.some((previousState) => (
          currentStates.some((currentState) => (
            areRollingProgramResourceStatesCompatible(previousState, currentState)
          ))
        ));
        if (!compatible) rollingWindowViolations += 1;
      }
    }
  }

  let consecutiveTurnAgainReuse = 0;
  for (let index = 1; index < againTurns.length; index += 1) {
    if (againTurns[index] === againTurns[index - 1] + 1) {
      consecutiveTurnAgainReuse += 1;
    }
  }

  return {
    againTurns: againTurns.length,
    consecutiveTurnAgainReuse,
    literalProgramViolations,
    rollingWindowViolations,
    literalCardAssignments: Boolean(literalCards)
  };
}

function getCheapBestLiteralProgramAvailabilityProbability(actionIds = [], options = {}) {
  const zero = Array(PROGRAM_CHEAP_RESOURCE_IDS.length).fill(0);
  const states = getLiteralProgramResourceStates(actionIds);
  if (!states.length) return 0;
  return Math.max(...states.map((state) => (
    getCheapProgramLiteralAvailabilityProbability(
      zero,
      getProgramResourceStateCounts(state),
      options
    )
  )));
}


function summarizeDiscoveredCandidateCardPressure(startAnalyses = []) {
  const perStart = [];

  const getRegisterCount = (route) => {
    const actions = Array.isArray(route?.actionHistory)
      ? route.actionHistory
      : null;
    if (actions) return actions.length;
    const transitions = Array.isArray(route?.transitions)
      ? route.transitions
      : [];
    return transitions.length;
  };

  const getExactCardRE = (route) => {
    const score = Number(route?.cardAvailabilityPenalty);
    return Number.isFinite(score)
      ? Math.max(0, score) / REGISTER_TEMPO_COST
      : null;
  };

  for (const analysis of startAnalyses || []) {
    const selected = analysis?.fullCourseRoute ?? null;
    if (!selected) continue;
    const selectedRegisters = getRegisterCount(selected);
    const selectedCardRE = getExactCardRE(selected);
    if (!Number.isFinite(selectedCardRE)) continue;

    const routes = Array.isArray(analysis?.fullCourseRoutes)
      ? analysis.fullCourseRoutes
      : [];
    const candidates = routes
      .map((route, routeIndex) => ({
        routeIndex,
        registers: getRegisterCount(route),
        cardRE: getExactCardRE(route),
        intrinsicScore: Number(route?.score)
      }))
      .filter((entry) => (
        Number.isFinite(entry.cardRE) &&
        Number.isFinite(entry.registers)
      ));

    const selectedIndex = Number.isInteger(analysis?.fullCourseRouteIndex)
      ? analysis.fullCourseRouteIndex
      : routes.indexOf(selected);

    const sameRegisterCandidates = candidates.filter(
      (entry) => entry.registers === selectedRegisters
    );
    const sameRegisterAlternatives = sameRegisterCandidates.filter(
      (entry) => entry.routeIndex !== selectedIndex
    );
    const sameOrFewerCandidates = candidates.filter(
      (entry) => entry.registers <= selectedRegisters
    );

    const bestSame = sameRegisterCandidates
      .slice()
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        left.routeIndex - right.routeIndex
      ))[0] ?? null;
    const bestSameOrFewer = sameOrFewerCandidates
      .slice()
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        left.registers - right.registers ||
        left.routeIndex - right.routeIndex
      ))[0] ?? null;

    const sameRegisterReducibleRE = bestSame
      ? Math.max(0, selectedCardRE - bestSame.cardRE)
      : 0;
    const sameOrFewerReducibleRE = bestSameOrFewer
      ? Math.max(0, selectedCardRE - bestSameOrFewer.cardRE)
      : 0;

    perStart.push({
      startIndex: analysis.index,
      selectedRouteIndex: selectedIndex,
      candidateCount: candidates.length,
      selectedRegisters,
      selectedCardRE: Number(selectedCardRE.toFixed(3)),
      sameRegisterCandidateCount: sameRegisterCandidates.length,
      sameRegisterAlternativeCount: sameRegisterAlternatives.length,
      bestSameRegisterCardRE: bestSame
        ? Number(bestSame.cardRE.toFixed(3))
        : null,
      bestSameRegisterRouteIndex: bestSame?.routeIndex ?? null,
      sameRegisterReducibleRE: Number(sameRegisterReducibleRE.toFixed(3)),
      sameOrFewerCandidateCount: sameOrFewerCandidates.length,
      bestSameOrFewerRegisters: bestSameOrFewer?.registers ?? null,
      bestSameOrFewerCardRE: bestSameOrFewer
        ? Number(bestSameOrFewer.cardRE.toFixed(3))
        : null,
      bestSameOrFewerRouteIndex: bestSameOrFewer?.routeIndex ?? null,
      sameOrFewerReducibleRE: Number(sameOrFewerReducibleRE.toFixed(3))
    });
  }

  const mean = (key) => perStart.length
    ? perStart.reduce((sum, entry) => sum + (Number(entry[key]) || 0), 0) /
        perStart.length
    : 0;
  const sameRegisterAlternativeStarts = perStart.filter(
    (entry) => entry.sameRegisterAlternativeCount > 0
  );
  const sameRegisterImprovementStarts = perStart.filter(
    (entry) => entry.sameRegisterReducibleRE > 0.001
  );
  const sameOrFewerImprovementStarts = perStart.filter(
    (entry) => entry.sameOrFewerReducibleRE > 0.001
  );
  const worstSame = sameRegisterImprovementStarts
    .slice()
    .sort((left, right) => right.sameRegisterReducibleRE - left.sameRegisterReducibleRE)[0]
    ?? null;
  const worstSameOrFewer = sameOrFewerImprovementStarts
    .slice()
    .sort((left, right) => right.sameOrFewerReducibleRE - left.sameOrFewerReducibleRE)[0]
    ?? null;

  return {
    model: "discovered-candidate-card-pressure-audit-v49bt",
    observationalOnly: true,
    searchCoverageLimited: true,
    auditedStarts: perStart.length,
    startsWithSameRegisterAlternative: sameRegisterAlternativeStarts.length,
    startsWithLowerCardSameRegisterCandidate: sameRegisterImprovementStarts.length,
    startsWithLowerCardSameOrFewerCandidate: sameOrFewerImprovementStarts.length,
    meanSelectedCardRE: Number(mean("selectedCardRE").toFixed(3)),
    meanSameRegisterReducibleRE: Number(mean("sameRegisterReducibleRE").toFixed(3)),
    meanSameOrFewerReducibleRE: Number(mean("sameOrFewerReducibleRE").toFixed(3)),
    maximumSameRegisterReducibleRE:
      worstSame?.sameRegisterReducibleRE ?? 0,
    maximumSameRegisterReducibleStartIndex:
      worstSame?.startIndex ?? null,
    maximumSameOrFewerReducibleRE:
      worstSameOrFewer?.sameOrFewerReducibleRE ?? 0,
    maximumSameOrFewerReducibleStartIndex:
      worstSameOrFewer?.startIndex ?? null,
    starts: perStart
  };
}


export function summarizeTargetedSameRegisterCardPressureSearch(
  tileMap,
  startAnalyses = [],
  flags = [],
  options = {}
) {
  const requestedStarts = Math.max(
    1,
    Math.floor(Number(options.targetedCardPressureDiagnosticStarts) || 4)
  );
  const maxRoutes = Math.max(
    2,
    Math.floor(Number(options.targetedCardPressureDiagnosticRoutes) || 6)
  );
  const maxExpansions = Math.max(
    500,
    Math.floor(Number(options.targetedCardPressureDiagnosticExpansions) || 7000)
  );
  const cardWeight = Math.max(
    1,
    Number(options.targetedCardPressureDiagnosticWeight) || 8
  );

  if (!tileMap || !Array.isArray(flags) || !flags.length) {
    return {
      model: "targeted-same-register-card-pressure-search-v49cd",
      observationalOnly: true,
      enabled: false,
      unavailableReason: "missing-map-or-flags",
      auditedStarts: 0,
      starts: []
    };
  }

  const ranked = (startAnalyses || [])
    .map((analysis) => {
      const route = analysis?.fullCourseRoute ?? null;
      const score = Number(route?.cardAvailabilityPenalty);
      const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
      const registers = transitions.length || (
        Array.isArray(route?.actionHistory) ? route.actionHistory.length : 0
      );
      if (!route || !Number.isFinite(score) || registers <= 0 || !analysis?.start) {
        return null;
      }
      return {
        analysis,
        selectedRoute: route,
        selectedRegisters: registers,
        selectedCardRE: Math.max(0, score) / REGISTER_TEMPO_COST
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.selectedCardRE - left.selectedCardRE ||
      (left.analysis.index ?? 0) - (right.analysis.index ?? 0)
    ))
    .slice(0, requestedStarts);

  const perStart = [];
  for (const entry of ranked) {
    const { analysis, selectedRoute, selectedRegisters, selectedCardRE } = entry;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(analysis.start, options.rebootTokens)
      : options.rebootTokens;
    const routes = enumerateFullCourseRoutes(
      tileMap,
      analysis.start,
      flags,
      {
        ...options,
        rebootTokens,
        maxRoutes,
        maxExpansions,
        maxStateLabels: 2,
        diverseStateLabelsAfterFirstCheckpoint: true,
        cardPressureDiagnosticSearch: true,
        cardPressureDiagnosticExactActions: selectedRegisters,
        cardPressureDiagnosticWeight: cardWeight
      }
    );
    const searchMeta = routes.fullCourseSearchMeta ?? {};
    const selectedActions = (selectedRoute.transitions || [])
      .map((transition) => transition?.action)
      .filter(Boolean);
    const selectedActionKey = selectedActions.join(".");
    const exactCandidates = [];

    for (const route of routes) {
      const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
      const actionIds = transitions
        .map((transition) => transition?.action)
        .filter(Boolean);
      if (actionIds.length !== selectedRegisters) continue;
      const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
        null,
        0,
        actionIds,
        options,
        [],
        getTurnEndAfterActionIndexes(transitions)
      );
      if (!cardSolution.feasible || !Number.isFinite(cardSolution.scarcityPenalty)) {
        continue;
      }
      exactCandidates.push({
        cardRE: Math.max(0, cardSolution.scarcityPenalty) / REGISTER_TEMPO_COST,
        actionKey: actionIds.join("."),
        route
      });
    }

    const alternatives = exactCandidates
      .filter((candidate) => candidate.actionKey !== selectedActionKey)
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        (Number(left.route?.score) || Infinity) - (Number(right.route?.score) || Infinity)
      ));
    const bestAlternative = alternatives[0] ?? null;
    const improvementRE = bestAlternative
      ? Math.max(0, selectedCardRE - bestAlternative.cardRE)
      : 0;

    perStart.push({
      startIndex: analysis.index,
      selectedRegisters,
      selectedCardRE: Number(selectedCardRE.toFixed(3)),
      searchedRouteCount: routes.length,
      exactCandidateCount: exactCandidates.length,
      sameRegisterAlternativeCount: alternatives.length,
      bestAlternativeCardRE: bestAlternative
        ? Number(bestAlternative.cardRE.toFixed(3))
        : null,
      improvementRE: Number(improvementRE.toFixed(3)),
      lowerCardAlternativeFound: improvementRE > 0.001,
      hitExpansionCap: Boolean(searchMeta.hitExpansionCap),
      hitRouteLimit: Boolean(searchMeta.hitRouteLimit),
      expansions: Number(searchMeta.expansions) || 0,
      maxExpansions: Number(searchMeta.maxExpansions) || maxExpansions
    });
  }

  const improved = perStart.filter((entry) => entry.lowerCardAlternativeFound);
  const withAlternatives = perStart.filter(
    (entry) => entry.sameRegisterAlternativeCount > 0
  );
  const meanImprovement = perStart.length
    ? perStart.reduce((sum, entry) => sum + entry.improvementRE, 0) / perStart.length
    : 0;
  const bestImprovement = improved
    .slice()
    .sort((left, right) => right.improvementRE - left.improvementRE)[0] ?? null;

  return {
    model: "targeted-same-register-card-pressure-search-v49cd",
    observationalOnly: true,
    enabled: true,
    highCardStartsOnly: true,
    requestedStarts,
    auditedStarts: perStart.length,
    searchRoutesPerStart: maxRoutes,
    searchExpansionCapPerStart: maxExpansions,
    diagnosticCardWeight: cardWeight,
    startsWithSameRegisterAlternative: withAlternatives.length,
    startsWithLowerCardSameRegisterAlternative: improved.length,
    cappedSearches: perStart.filter((entry) => entry.hitExpansionCap).length,
    routeLimitSearches: perStart.filter((entry) => entry.hitRouteLimit).length,
    totalExpansions: perStart.reduce((sum, entry) => sum + entry.expansions, 0),
    meanImprovementRE: Number(meanImprovement.toFixed(3)),
    maximumImprovementRE: bestImprovement?.improvementRE ?? 0,
    maximumImprovementStartIndex: bestImprovement?.startIndex ?? null,
    starts: perStart
  };
}

function summarizeSelectedProgrammingScarcity(startAnalyses = [], options = {}) {
  const cardModelProfile = getProgramCardModelProfile(options);
  const discoveredCandidateCardPressure =
    summarizeDiscoveredCandidateCardPressure(startAnalyses);
  const routeSummaries = (startAnalyses || [])
    .map((analysis) => summarizeRouteAgainUsage(analysis?.fullCourseRoute, options))
    .filter(Boolean);
  const routesUsingAgain = routeSummaries.filter((entry) => entry.againTurns > 0).length;
  const routesWithConsecutiveAgain = routeSummaries.filter(
    (entry) => entry.consecutiveTurnAgainReuse > 0
  ).length;
  const selectedRouteAvailabilityPenalties = (startAnalyses || [])
    .map((analysis) => Number(analysis?.fullCourseRoute?.cardAvailabilityPenalty))
    .filter(Number.isFinite);
  const selectedRouteCheapAvailabilityPenalties = (startAnalyses || [])
    .map((analysis) => {
      const actions = analysis?.fullCourseRoute?.actionHistory;
      const transitions = analysis?.fullCourseRoute?.transitions;
      return Array.isArray(actions)
        ? scoreEstimatedProgramDemand(actions, 0, null, options, transitions || [])
        : NaN;
    })
    .filter(Number.isFinite);
  const uncompressedSelectedRouteAvailabilityPenalties =
    selectedRouteAvailabilityPenalties
      .map((value) => (
        cardModelProfile.adaptabilityFactor > 0
          ? value / cardModelProfile.adaptabilityFactor
          : value
      ))
      .filter(Number.isFinite);
  const selectedRouteAvailabilityPenaltyRE =
    selectedRouteAvailabilityPenalties.map(
      (value) => value / REGISTER_TEMPO_COST
    );
  const uncompressedSelectedRouteAvailabilityPenaltyRE =
    uncompressedSelectedRouteAvailabilityPenalties.map(
      (value) => value / REGISTER_TEMPO_COST
    );

  const pairedAvailabilityPenaltyDeltas = (startAnalyses || [])
    .map((analysis) => {
      const exact = Number(analysis?.fullCourseRoute?.cardAvailabilityPenalty);
      const actions = analysis?.fullCourseRoute?.actionHistory;
      const transitions = analysis?.fullCourseRoute?.transitions;
      const cheap = Array.isArray(actions)
        ? scoreEstimatedProgramDemand(actions, 0, null, options, transitions || [])
        : NaN;
      return Number.isFinite(exact) && Number.isFinite(cheap)
        ? cheap - exact
        : NaN;
    })
    .filter(Number.isFinite);
  return {
    selectedRoutes: routeSummaries.length,
    discoveredCandidateCardPressure,
    routesUsingAgain,
    totalAgainTurns: routeSummaries.reduce((sum, entry) => sum + entry.againTurns, 0),
    consecutiveTurnAgainReuse: routeSummaries.reduce(
      (sum, entry) => sum + entry.consecutiveTurnAgainReuse,
      0
    ),
    routesWithConsecutiveAgain,
    exactHypergeometricAvailability: true,
    handSize: cardModelProfile.handSize,
    cardScarcityAdaptabilityScalingActive: true,
    // Compatibility alias retained for Dev/report consumers written before alpha
    // was allowed to exceed 1.0 under Shared Deck. This is scaling, not always compression.
    cardScarcityAdaptabilityCompressionActive: cardModelProfile.adaptabilityFactor < 1,
    cardScarcityAdaptabilityFactor: cardModelProfile.adaptabilityFactor,
    cardScarcityBaseAdaptabilityFactor: cardModelProfile.baseAlpha,
    sharedDeckAdaptabilityIncrement: cardModelProfile.sharedDeckAlphaIncrement,
    sharedDeckAlphaIncrementPerAdditionalPlayer: SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER,
    sharedDeckEnlargedDeckModeled: cardModelProfile.sharedDeckEnlargedDeckModeled,
    sharedDeckCrossRobotHandsModeled: cardModelProfile.sharedDeckCrossRobotHandsModeled,
    rollingPreviousTurnDepletion: cardModelProfile.previousTurnDepletionActive,
    resetProgrammingDeckEachTurn: cardModelProfile.resetEachTurn,
    cardScarcityScalingRationale:
      cardModelProfile.sharedDeck
        ? "exact single-player hypergeometry retained; Shared Deck omitted-state uncertainty is represented by an uncapped player-count alpha uplift"
        : cardModelProfile.resetEachTurn
          ? "fresh full programming deck each turn removes the normal omitted-deck-state adaptability discount; alpha base is 1.0"
          : "normal alpha discounts extra scarcity for omitted player hand adaptation / richer real deck-state information; exact hypergeometry unchanged",
    cardScarcityCompressionRationale:
      "legacy field name only; see cardScarcityScalingRationale",
    meanCardAvailabilityPenaltyRE: selectedRouteAvailabilityPenaltyRE.length
      ? Number((
        selectedRouteAvailabilityPenaltyRE.reduce((sum, value) => sum + value, 0) /
        selectedRouteAvailabilityPenaltyRE.length
      ).toFixed(3))
      : 0,
    maxCardAvailabilityPenaltyRE: selectedRouteAvailabilityPenaltyRE.length
      ? Number(Math.max(...selectedRouteAvailabilityPenaltyRE).toFixed(3))
      : 0,
    meanCardAvailabilityPenaltyUncompressedRE:
      uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ? Number((
          uncompressedSelectedRouteAvailabilityPenaltyRE.reduce(
            (sum, value) => sum + value,
            0
          ) / uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ).toFixed(3))
        : 0,
    maxCardAvailabilityPenaltyUncompressedRE:
      uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ? Number(
          Math.max(...uncompressedSelectedRouteAvailabilityPenaltyRE).toFixed(3)
        )
        : 0,
    meanCardAvailabilityPenalty: selectedRouteAvailabilityPenalties.length
      ? Number((
        selectedRouteAvailabilityPenalties.reduce((sum, value) => sum + value, 0) /
        selectedRouteAvailabilityPenalties.length
      ).toFixed(2))
      : 0,
    maxCardAvailabilityPenalty: selectedRouteAvailabilityPenalties.length
      ? Number(Math.max(...selectedRouteAvailabilityPenalties).toFixed(2))
      : 0,
    cheapSearchAvailabilityProxy: "cached-collapsed-literal-hypergeometric",
    meanCheapSearchAvailabilityPenalty: selectedRouteCheapAvailabilityPenalties.length
      ? Number((
        selectedRouteCheapAvailabilityPenalties.reduce((sum, value) => sum + value, 0) /
        selectedRouteCheapAvailabilityPenalties.length
      ).toFixed(2))
      : 0,
    maxCheapSearchAvailabilityPenalty: selectedRouteCheapAvailabilityPenalties.length
      ? Number(Math.max(...selectedRouteCheapAvailabilityPenalties).toFixed(2))
      : 0,
    meanCheapMinusExactAvailabilityPenalty: pairedAvailabilityPenaltyDeltas.length
      ? Number((
        pairedAvailabilityPenaltyDeltas.reduce((sum, value) => sum + value, 0) /
        pairedAvailabilityPenaltyDeltas.length
      ).toFixed(2))
      : 0,
    baselineFourCopyProbability: Number(
      PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY.toFixed(4)
    ),
    singleCopyProbability: Number(
      getExactProgramHandAvailabilityProbability(0, ["FORWARD_3"], options).toFixed(4)
    ),
    threeDistinctSingleCopyProbability: Number(
      getExactProgramHandAvailabilityProbability(
        0,
        ["FORWARD_3", "UTURN", "BACK"],
        options
      ).toFixed(4)
    ),
    repeatedFourCopyWithAgainProbability: Number(
      getExactProgramHandAvailabilityProbability(0, ["FORWARD", "FORWARD"], options).toFixed(4)
    ),
    cheapSingleCopyProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(["FORWARD_3"], options).toFixed(4)
    ),
    cheapThreeDistinctSingleCopyProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(
        ["FORWARD_3", "UTURN", "BACK"],
        options
      ).toFixed(4)
    ),
    cheapRepeatedFourCopyBestLiteralProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(
        ["FORWARD", "FORWARD"],
        options
      ).toFixed(4)
    ),
    literalProgramViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.literalProgramViolations,
      0
    ),
    rollingWindowViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.rollingWindowViolations,
      0
    ),
    approximateSearchLiteralHypergeometric: true,
    approximateSearchAgainSpecialDiscount: false,
    normalizationInvariant:
      "P(program)=normal 9-card fresh-deck four-copy baseline => +0 extra card RE before alpha scaling; Factory Rejects therefore raises scarcity naturally by reducing the actual draw to 7",
    halfBaselineRawScarcityRE: 1,
    halfBaselineScaledScarcityRE: Number(
      cardModelProfile.adaptabilityFactor.toFixed(3)
    )
  };
}

function cloneContextualFullRouteForReuse(route) {
  if (!route) return route;
  return {
    ...route,
    path: route.path ? [...route.path] : route.path,
    trafficPath: route.trafficPath ? [...route.trafficPath] : route.trafficPath,
    legRoutes: (route.legRoutes || []).map((leg) => leg
      ? {
        ...leg,
        path: leg.path ? [...leg.path] : leg.path,
        trafficPath: leg.trafficPath ? [...leg.trafficPath] : leg.trafficPath,
        programHistoryEnd: leg.programHistoryEnd ? [...leg.programHistoryEnd] : leg.programHistoryEnd
      }
      : leg)
  };
}

function analyzeSeededFullCourseContextual(tileMap, starts, flags, options = {}) {
  const playerCount = options.playerCount ?? starts.length;
  const seedAnalyses = Array.isArray(options.contextualSeedStartAnalyses)
    ? options.contextualSeedStartAnalyses
    : [];
  const seedByIndex = new Map(seedAnalyses.map((analysis, index) => [
    Number.isInteger(analysis?.index) ? analysis.index : index,
    analysis
  ]));

  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const seed = seedByIndex.get(sourceIndex) ?? null;
    const sourceRoutes = seed?.fullCourseRoutes?.length
      ? seed.fullCourseRoutes
      : (seed?.fullCourseRoute ? [seed.fullCourseRoute] : []);
    const fullCourseRoutes = sourceRoutes
      .map(cloneContextualFullRouteForReuse)
      .filter(Boolean)
      .map((route) => applyIntrinsicDamageEconomyRoutingScore(tileMap, route, options))
      .sort(compareScoredRouteLike);
    const fullCourseRoute = fullCourseRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: sourceIndex,
      start,
      reachable: Boolean(fullCourseRoute),
      fullCourseRoutes,
      fullCourseRoute,
      fullCourseRouteIndex: fullCourseRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const explicitRequiredStarts = Number(options.contextualRequiredStarts);
  const requiredSurvivingStarts = Number.isFinite(explicitRequiredStarts)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredStarts)))
    : Math.max(1, playerCount);
  const explicitPreferredStarts = Number(options.contextualPreferredStarts);
  const preferredSurvivingStarts = Number.isFinite(explicitPreferredStarts)
    ? Math.max(
      requiredSurvivingStarts,
      Math.min(starts.length, Math.floor(explicitPreferredStarts))
    )
    : null;
  let preferredCapacityShortCircuits = 0;
  const survivingStarts = startAnalyses.filter((analysis) => analysis.fullCourseRoute).length;
  if (options.contextualEarlyExit && survivingStarts < requiredSurvivingStarts) {
    const error = new Error(
      `Seeded contextual start capacity lost: ${survivingStarts}/${requiredSurvivingStarts} required starts remain`
    );
    error.code = "CONTEXTUAL_START_CAPACITY_LOST";
    error.contextualSearchHealth = {
      zeroRouteCapFailures: 0,
      distinctStarts: 0,
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      survivingStarts,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - survivingStarts),
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      flagCount: flags.length,
      seededRoutes: true,
      survivorHistory: [{
        legIndex: Math.max(0, flags.length - 1),
        legNumber: Math.max(1, flags.length),
        survivingStarts,
        requiredStarts: requiredSurvivingStarts,
        sourceStarts: starts.length,
        lostStarts: Math.max(0, starts.length - survivingStarts),
        cappedContextsThisLeg: 0,
        cappedStartsThisLeg: 0,
        totalCappedContexts: 0,
        distinctCappedStarts: 0,
        seededRoutes: true
      }]
    };
    throw error;
  }

  const selection = options.skipFullCourseTraffic
    ? {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      averageRawTrafficPenalty: 0,
      averageForecastConfidence: 1,
      minimumForecastConfidence: 1,
      averageTrafficByLeg: [],
      candidateDiagnostics: startAnalyses
        .filter((analysis) => analysis.reachable && analysis.fullCourseRoutes?.length)
        .map((analysis) => summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0]
        ))
    }
    : selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, {
      ...options,
      playerCount
    });
  const selectedStartAnalyses = selection.starts.map((analysis) => (
    buildStartAnalysisForSelectedFullRoute(analysis)
  ));
  const fullScores = selectedStartAnalyses
    .filter((item) => item.reachable && item.fullCourseRoute)
    .map((item) => item.fullCourseRoute.score + (item.fullCourseTrafficPenalty ?? 0));
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map((analysis) => {
    if (!analysis.fullCourseRoute) return analysis;
    const fullScore = analysis.fullCourseRoute.score + (analysis.fullCourseTrafficPenalty ?? 0);
    const rawDelta = fullScore - meanFullScore;
    return {
      ...analysis,
      courseEstimate: {
        ...analysis.courseEstimate,
        meanFullScore: Number(meanFullScore.toFixed(2)),
        delta: Number(rawDelta.toFixed(2))
      },
      courseScoreAdjustment: Number(clamp(rawDelta * 0.32, -10, 10).toFixed(2))
    };
  });

  selectAndScoreStartAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    playerCount,
    null,
    options
  );
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  applyNormalFullCourseEffectiveREFairnessScores(tileMap, adjustedStartAnalyses, options);
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
    adjustedStartAnalyses,
    flags,
    playerCount
  );
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  const programmingScarcity = {
    ...summarizeSelectedProgrammingScarcity(
      adjustedStartAnalyses,
      options
    ),
    ...(options.targetedSameRegisterCardPressureAudit
      ? { targetedSameRegisterCardPressure: options.targetedSameRegisterCardPressureAudit }
      : {})
  };

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(meanFullScore.toFixed(2)),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      programmingScarcity,
      contextualLegRoutes: true,
      contextualLegCache: {
        entries: 0,
        templateEntries: 0,
        hits: 0,
        exactHits: 0,
        templateHits: 0,
        misses: 0,
        templateFallbacks: 0,
        zeroRouteCapFailures: 0,
        zeroRouteFailureStarts: 0,
        seededRoutes: true,
        seededStartCount: survivingStarts,
        survivorHistory: [{
          legIndex: Math.max(0, flags.length - 1),
          legNumber: Math.max(1, flags.length),
          survivingStarts,
          requiredStarts: requiredSurvivingStarts,
          sourceStarts: starts.length,
          lostStarts: Math.max(0, starts.length - survivingStarts),
          cappedContextsThisLeg: 0,
          cappedStartsThisLeg: 0,
          totalCappedContexts: 0,
          distinctCappedStarts: 0,
          seededRoutes: true
        }],
        survivingStarts,
        requiredSurvivingStarts,
        preferredSurvivingStarts,
        preferredCapacityShortCircuits,
        fastCardState: options.contextualFastCardState !== false,
        numericHotStateKeys: options.contextualFastCardState !== false,
        arrivalClassRouting: false,
        capacityPolicy: Number.isFinite(Number(options.contextualRequiredStarts))
          ? "explicit-floor"
          : "player-count-floor",
        zeroRouteCapsByLeg: flags.map((_, legIndex) => ({
          leg: legIndex + 1,
          contexts: 0,
          starts: 0
        }))
      },
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        ownershipAuditV49bk: {
          behaviorChanged: true,
          robotLaserPhysicalDamageOwner: "damage-economy",
          residualRangedThreatOwner: "diagnostic-only-v49ej-physical-damage-plus-awareness-mental-own-production",
          nearbyOwner: "turn-episode-control-loss-re",
          competitionActive: false,
          trafficMentalRobotLaserAwarenessActive: true,
          trafficMentalNonLaserControlEventsActive: true,
          candidateNearbyControlOwner: "existing-control-loss-curve-from-old-price-free-interaction-geometry",
          candidateNearbyControlBehaviorActive: true,
          candidateNonLaserMentalBehaviorActive: true,
          averageLegacyRangedPenalty: selection.averageLegacyRangedTrafficPenalty ?? 0,
          averageRobotLaserDamageScore: selection.averageRobotLaserDamageTrafficScore ?? 0,
          averageRobotLaserDamageRE: selection.averageRobotLaserDamageTrafficRegisterEquivalents ?? 0,
          averageResidualRangedThreatPenalty: selection.averageResidualRangedThreatTrafficPenalty ?? 0,
          averageLegacyResidualRangedThreatDiagnosticPenalty:
            selection.averageLegacyResidualRangedThreatDiagnosticPenalty ?? 0,
          averageNearbyPenalty: selection.averageNearbyTrafficPenalty ?? 0,
          averageLegacyNearbyPenalty:
            selection.averageLegacyNearbyTrafficPenalty ?? 0,
          averageAuthoritativeNearbyControlRE:
            selection.averageAuthoritativeNearbyControlRegisterEquivalents ?? 0,
          averageCompetitionPenalty: selection.averageCompetitionTrafficPenalty ?? 0,
          averageNearbyInteractionEventMassCandidate:
            selection.averageNearbyInteractionEventMassCandidate ?? 0,
          averageNearbyControlLoadCandidate:
            selection.averageNearbyControlLoadCandidate ?? 0,
          averageNearbyControlRECandidate:
            selection.averageNearbyControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyControlScoreCandidate:
            selection.averageNearbyControlScoreCandidate ?? 0,
          averageNearbyTurnEpisodeEventMassCandidate:
            selection.averageNearbyTurnEpisodeEventMassCandidate ?? 0,
          averageNearbyTurnEpisodeControlLoadCandidate:
            selection.averageNearbyTurnEpisodeControlLoadCandidate ?? 0,
          averageNearbyTurnEpisodeControlRECandidate:
            selection.averageNearbyTurnEpisodeControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyTurnEpisodeControlScoreCandidate:
            selection.averageNearbyTurnEpisodeControlScoreCandidate ?? 0,
          averageTrafficAwarenessMentalRE:
            selection.averageTrafficAwarenessMentalRegisterEquivalents ?? 0,
          averageTrafficAwarenessEventMass:
            selection.averageTrafficAwarenessEventMass ?? 0,
          averageTrafficAwarenessRobotLaserEventMass:
            selection.averageTrafficAwarenessRobotLaserEventMass ?? 0,
          averageTrafficAwarenessNonLaserEventMass:
            selection.averageTrafficAwarenessNonLaserEventMass ?? 0,
          averageTrafficAwarenessRebootPileupEventMass:
            selection.averageTrafficAwarenessRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupEventMass:
            selection.averageSimultaneousRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupMaximumTurnProbability:
            selection.averageSimultaneousRebootPileupMaximumTurnProbability ?? 0,
          averageSimultaneousRebootPileupClogRE:
            selection.averageSimultaneousRebootPileupClogRegisterEquivalents ?? 0,
          simultaneousRebootPileupOwner:
            "same-turn-same-reboot-space -> +1 actual clog stacked in damage-economy curve; no fabricated displacement; v49ei",
          homingMissileOwner:
            "strategic credit = 2x standard one-damage reference per once-per-turn/per-missile-space activation + target-choice planning event; self-hazard OFF; v49ei"
        },
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        // Seeded special-setup routing currently performs route selection only;
        // Normal v35 traffic-demand exploration belongs to estimate→realize.
        trafficEpochsExecuted: 0,
        alternateDemandStarts: 0,
        alternateDemandLegs: 0,
        alternateCachedWitnessChecks: 0,
        alternateNewSearches: 0,
        alternateExactChecks: 0,
        alternateExactRejects: 0,
        alternateCandidatesAdded: 0,
        alternateBestGain: 0,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        commonOccupancyField: selection.commonOccupancyField ?? null,
        routeMixtureField: selection.routeMixtureField ?? null,
      routeMixtureOwnershipAudit:
        selection.routeMixtureOwnershipAudit ?? null,
      completedRouteOwnershipAudit:
        selection.completedRouteOwnershipAudit ?? null,
        routeFamilyDivergenceField:
          selection.routeFamilyDivergenceField ?? null,
        routeMixtureModel: selection.routeMixtureField?.model ??
          "quality-weighted-route-families",
        legAwareOverlap: true,
        contextualLegRoutes: true,
        seededRoutes: true,
        openingRoutesPerStart:
          options.contextualSeedRouteStrategy?.openingRoutesPerStart ?? 1,
        laterRoutesPerContext:
          options.contextualSeedRouteStrategy?.laterRoutesPerContext ?? 1,
        stitchedBeamWidth:
          options.contextualSeedRouteStrategy?.stitchedBeamWidth ?? 1,
        completionPool:
          options.contextualSeedRouteStrategy?.completionPool ?? 1,
        wholePartialDiversity: Boolean(
          options.contextualSeedRouteStrategy?.wholePartialDiversity
        ),
        openingLegWeight: FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight: FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

function normalizeOpeningSeedRoute(route) {
  if (!route) return null;
  const localActionIds = Array.isArray(route.localActionIds)
    ? [...route.localActionIds]
    : Array.isArray(route.programHistoryEnd)
      ? [...route.programHistoryEnd]
      : Array.isArray(route.actionHistory)
        ? [...route.actionHistory]
        : [];
  const absoluteActions = Number.isFinite(route.absoluteActions)
    ? route.absoluteActions
    : (route.actions ?? localActionIds.length);
  return {
    ...route,
    path: route.path ? [...route.path] : route.path,
    transitions: route.transitions ? [...route.transitions] : route.transitions,
    absoluteStartAction: 0,
    absoluteActions,
    localActionIds,
    programHistoryEnd: getProgramHistoryWindow(
      route.programHistoryEnd ?? route.actionHistory ?? localActionIds
    ),
    goalReached: route.goalReached !== false,
    fullCourseLeg: true
  };
}

function getContextualOpeningSeedMap(options = {}) {
  const analyses = Array.isArray(options.contextualOpeningSeedAnalyses)
    ? options.contextualOpeningSeedAnalyses
    : [];
  return new Map(analyses.map((analysis, index) => [
    Number.isInteger(analysis?.index) ? analysis.index : index,
    analysis
  ]));
}

function* analyzeFullCourseContextualSteps(
  tileMap,
  starts,
  flags,
  options = {}
) {
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const legCache = new Map();
  const templateCache = new Map();
  // v22: one lazy, baggage-relaxed catalogue per exact later checkpoint arrival
  // class. A capped catalogue search is remembered as unresolved for this candidate
  // so another start history cannot spend the same 1000/1200-expansion failure tail.
  const sharedLegCatalogueCache = new Map();
  // v29 estimate-first primary routing keeps a separate physical-leg cache.
  // These entries know board/facing/register timing and soft card-demand weight,
  // but never exact rolling card depletion. They are therefore reusable across
  // concrete start lineages that share the same physical arrival class.
  const estimatedLegCache = new Map();
  let estimatedLegSearches = 0;
  let estimatedLegWidenedSearches = 0;
  let estimatedLegResumedWidenings = 0;
  let estimatedLegFreshExhaustiveFallbacks = 0;
  let estimatedLegResumeSavedRootExpansions = 0;
  let estimatedLegResumeReplayExpansions = 0;
  let estimatedLegCacheHits = 0;
  let estimatedLegWitnessesGenerated = 0;
  let estimatedMilestoneRoutes = 0;
  let estimatedPhysicalFailures = 0;
  let estimatedPhysicalFailureStarts = 0;
  let estimatedForecastIntactRoutes = 0;
  let exactRealizationAttempts = 0;
  let exactRealizationDirectSuccesses = 0;
  let exactRealizationRepairedSuccesses = 0;
  let exactRealizationFailures = 0;
  let cardRepairReplans = 0;
  let cardRepairFailurePoints = 0;
  let cardRepairPrefixBacktracks = 0;
  let cardRepairNoSuffix = 0;
  let cardRepairDownstreamRebuildFailures = 0;
  let cardRepairRepeatedCandidates = 0;
  // v33 traffic feedback is demand-driven. Primary routing stays exact and cheap;
  // traffic may reuse cached witnesses or open a small number of new leg searches.
  let trafficEpochsExecuted = 0;
  let trafficAlternateDemandStarts = 0;
  let trafficAlternateDemandLegs = 0;
  let trafficAlternateCachedWitnessChecks = 0;
  let trafficAlternateNewSearches = 0;
  let trafficAlternateExactChecks = 0;
  let trafficAlternateExactRejects = 0;
  let trafficAlternateCandidatesAdded = 0;
  let trafficAlternateBeneficialCandidates = 0;
  let trafficAlternateBestGain = 0;
  let trafficAlternateCachedProbeStops = 0;
  let trafficAlternateCachedUsefulStops = 0;
  let trafficAlternateLocalCacheHits = 0;
  let trafficAlternateRepeatedMissEvidenceChecks = 0;
  let trafficAlternateRepeatedMissEvidenceStops = 0;
  let trafficAlternateRepeatedMissEvidenceDeeperRetries = 0;
  const trafficAlternateNegativeSearchEvidence = new Map();
  // v49aj evidence-only exact alternate reservoir. Valid alternates that miss the
  // current traffic gain threshold are still useful information: keep them out of
  // the selectable route pool, but retain them inside this one feedback run so a
  // later mixture-only field update can re-price them without buying geometry again.
  // This never changes physical legality or exact card validation.
  const trafficAlternateEvidenceCandidatesByStart = new Map();
  let trafficAlternateEvidenceCandidateChecks = 0;
  let trafficAlternateEvidenceCandidatesStored = 0;
  let trafficAlternateEvidenceCandidatesPromoted = 0;
  let trafficAlternateEvidenceSaturationStops = 0;
  let trafficAlternateEscalations = 0;
  let trafficAlternateSearchNoRoutes = 0;
  let trafficAlternateCardRejects = 0;
  let trafficAlternateValidationRejects = 0;
  let trafficAlternateDuplicateRejects = 0;
  let trafficAlternateLowGainRejects = 0;
  let trafficAlternateDownstreamRebuildFailures = 0;
  let trafficAlternateEffectiveDemandLegs = 0;
  let trafficAlternateExploratoryDemandLegs = 0;
  let trafficAlternatePressureDemandLegs = 0;
  let trafficAlternatePressureRestoredLegs = 0;
  let trafficAlternatePressureRegisterEquivalentsSum = 0;
  let trafficAlternatePressureRegisterEquivalentsCount = 0;
  let trafficAlternateMaximumPressureRegisterEquivalents = 0;
  let trafficAlternateBaseEffortScaleSum = 0;
  let trafficAlternateEffortRestorationSum = 0;
  let trafficAlternateEffortScaleSum = 0;
  let trafficAlternateEffortScaleCount = 0;
  let trafficAlternateMinimumEffortScale = 1;
  let trafficAlternateHotspotLocalSearches = 0;
  let trafficAlternateHotspotFallbackLegStarts = 0;
  let trafficAlternateHotspotPrefixActionsSum = 0;
  let trafficAlternateHotspotPrefixActionsCount = 0;
  let trafficAlternateHotspotMaximumPrefixActions = 0;
  let trafficAlternateHotspotTwoRegisterLookbacks = 0;
  const trafficAlternateSearchTrace = [];
  const trafficAlternateGainTrace = [];
  // v49ae feedback convergence telemetry. Mode-specific round/search budgets remain
  // hard safety ceilings only; the common loop can stop earlier when newly added
  // route evidence does not materially change the rebuilt traffic field.
  let trafficFeedbackStopReason = "not-run";
  let trafficFeedbackConvergenceChecks = 0;
  let trafficFeedbackConvergedRounds = 0;
  const trafficFeedbackRoundSummaries = [];
  let trafficMaxNewSearchesTotal = 0;
  let trafficExplorationUncertaintyShare = 0;
  let trafficExplorationConfidenceFloor = 1;
  const trafficAlternateDemandByLeg = flags.map(() => 0);
  const trafficAlternateCandidatesByLeg = flags.map(() => 0);
  let cacheHits = 0;
  let templateHits = 0;
  let cacheMisses = 0;
  let templateFallbacks = 0;
  let catalogueLookups = 0;
  let catalogueCacheHits = 0;
  let catalogueSearches = 0;
  let catalogueCappedSearches = 0;
  let catalogueExhaustedSearches = 0;
  let catalogueSuppressedCappedLookups = 0;
  let catalogueReplayRouteChecks = 0;
  let catalogueCompatibleLineages = 0;
  let catalogueCompatibleRoutes = 0;
  let catalogueIncompatibleLineages = 0;
  let catalogueRefinementSearches = 0;
  let catalogueEnrichmentSearches = 0;
  let catalogueEnrichmentSuccesses = 0;
  let catalogueEnrichmentSuppressed = 0;
  let catalogueWitnessesGenerated = 0;
  let catalogueWitnessResolvedLineages = 0;
  const catalogueWitnessRankSuccesses = [];
  let finalProgrammingValidationFailures = 0;
  const arrivalClassKeysByLeg = flags.map(() => new Set());
  const arrivalClassLineagesByLeg = flags.map(() => new Map());
  let zeroRouteCapFailures = 0;
  let zeroRouteHorizonFailures = 0;
  const zeroRouteFailureStarts = new Set();
  const zeroRouteHorizonFailureStarts = new Set();
  const zeroRouteCapsByLeg = flags.map(() => 0);
  const zeroRouteHorizonsByLeg = flags.map(() => 0);
  const zeroRouteFailureStartsByLeg = flags.map(() => new Set());
  const zeroRouteHorizonFailureStartsByLeg = flags.map(() => new Set());
  const survivorHistory = [];
  const earlyExitEnabled = Boolean(options.contextualEarlyExit);
  const openingSeedByIndex = getContextualOpeningSeedMap(options);
  let seededOpeningStarts = 0;
  const explicitRequiredStarts = Number(options.contextualRequiredStarts);
  const requiredSurvivingStarts = Number.isFinite(explicitRequiredStarts)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredStarts)))
    : Math.max(1, playerCount);
  const explicitPreferredStarts = Number(options.contextualPreferredStarts);
  const preferredSurvivingStarts = Number.isFinite(explicitPreferredStarts)
    ? Math.max(
      requiredSurvivingStarts,
      Math.min(starts.length, Math.floor(explicitPreferredStarts))
    )
    : null;
  const stopWhenPreferredLost = Boolean(
    options.contextualStopWhenPreferredLost && preferredSurvivingStarts
  );
  let preferredCapacityShortCircuits = 0;
  let capacityRescueSearches = 0;
  let capacityRescueSuccesses = 0;
  let capacityPhysicalRescueSearches = 0;
  let capacityPhysicalRescueSuccesses = 0;
  let capacityHorizonRescueSearches = 0;
  let capacityHorizonRescueSuccesses = 0;
  let capacityExpansionRescueSearches = 0;
  let capacityExpansionRescueSuccesses = 0;

  // v24 separates two different unknowns. If a bounded search reached the action
  // horizon, first widen *distance in time* with only a modest expansion increase.
  // Only a still-capped capacity-critical lineage gets the larger expansion rescue.
  // The old unconditional 6000-expansion retry made rejected candidates dominate
  // generation time.
  const getCapacityRescueBudgets = (legIndex) => {
    const nominalExpansions = Math.max(1, Math.floor(legIndex === 0
      ? (options.contextualOpeningExpansions ?? CONTEXTUAL_OPENING_EXPANSIONS)
      : (options.contextualLaterExpansions ?? CONTEXTUAL_LATER_EXPANSIONS)));
    const fullCourseBudget = Math.max(
      nominalExpansions,
      Math.floor(Number(options.maxExpansions) || nominalExpansions)
    );
    const fastCardState = options.contextualFastCardState !== false;
    return {
      nominalExpansions,
      horizonExpansions: Math.min(
        fullCourseBudget,
        Math.max(
          nominalExpansions,
          fastCardState
            ? (legIndex === 0 ? 1200 : 1100)
            : (legIndex === 0 ? 1600 : 1400)
        )
      ),
      expansionExpansions: Math.min(
        fullCourseBudget,
        Math.max(nominalExpansions, fastCardState ? 2200 : 3000)
      ),
      maxActions: Math.max(
        fastCardState ? 30 : 36,
        options.contextualLegMaxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS
      )
    };
  };

  const isUnresolvedCappedRouteSet = (routes) => Boolean(
    routes?.contextualUnresolvedCap ||
    routes?.contextualUnresolvedHorizon ||
    routes?.contextualSearchMeta?.zeroRouteCapFailure ||
    routes?.contextualSearchMeta?.zeroRouteHorizonFailure
  );

  const baseRouteOptions = {
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    factoryRejects: Boolean(options.factoryRejects),
    classicSharedDeck: Boolean(options.classicSharedDeck),
    lessForeshadowing: Boolean(options.lessForeshadowing),
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive,
    setToKill: Boolean(options.setToKill),
    setToStun: Boolean(options.setToStun),
    lessForeshadowing: options.lessForeshadowing,
    contextualEstimatedCardTransitionMemoContext:
      options.contextualEstimatedCardTransitionMemoContext ?? null,
    contextualEstimatedCardTransitionMemoRuleSignature:
      options.contextualEstimatedCardTransitionMemoRuleSignature ?? null,
    contextualTrafficAlternativeRetention: Boolean(
      options.contextualTrafficAlternativeRetention
    ),
    contextualFastCardState: options.contextualFastCardState !== false,
    // v25: uncertainty changes breadth only. Exact legality is now carried by
    // compact literal card-count state rather than allocation-history sets.
    contextualUncertaintyBreadth: Boolean(
      options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
    ),
    // v33: player count already enters through occupancy mass. Do not encode it
    // a second time as an abstract uncertainty multiplier. The old breadth-only
    // mechanism may still receive an explicit diagnostic override, otherwise its
    // congestion term is neutral and the continuous traffic confidence curve uses
    // actual predicted interactions instead.
    contextualTrafficUncertainty: Number.isFinite(Number(options.contextualTrafficUncertainty))
      ? clamp(Number(options.contextualTrafficUncertainty), 0, 1)
      : 0,
    contextualDetailedProfiling: Boolean(
      options.contextualDetailedProfiling
    ),
    contextualDominanceKeyProfiling: Boolean(
      options.contextualDominanceKeyProfiling
    ),
    contextualFullForecastShare: options.contextualFullForecastShare,
    contextualBeamWidth: options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
    optionalCompletionExpansions: options.contextualOptionalCompletionExpansions,
    repairStations: Boolean(options.repairStations),
    playerCount,
    virtualBots: Boolean(options.virtualBots),
    trafficGraceRegisters: Math.max(0, Number(options.trafficGraceRegisters) || 0),
    boardRects: options.boardRects,
    portalMap
  };

  const getEstimatedLegCacheKey = (
    context,
    legIndex,
    dynamicGoal,
    namespace,
    startupSpinUp,
    forbiddenFirstActions = [],
    excludedPathKeys = []
  ) => [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${Math.max(0, Number(context.absoluteActions) || 0) % REGISTER_COUNT}`,
    options.recoveryRule === "dynamic_archiving"
      ? "archive-cheap-proxy"
      : (getDynamicArchiveStateKey(context.dynamicArchivePoint, baseRouteOptions) || "archive-"),
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`,
    startupSpinUp ? "spin1" : "spin0",
    `ban${[...forbiddenFirstActions].sort().join(",") || "-"}`,
    `skip${[...excludedPathKeys].sort().join(",") || "-"}`
  ].join("|");

  function* getEstimatedLegRoute(
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    forbiddenFirstActions = [],
    excludedPathKeys = [],
    searchPurpose = "primary",
    searchEffortScale = 1
  ) {
    const dynamicGoal = dynamicGoals[legIndex] ?? null;
    const namespace = options.recoveryRule === "home_reboot"
      ? `start${startIndex}`
      : "shared";
    const cacheKey = getEstimatedLegCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      startupSpinUp,
      forbiddenFirstActions,
      excludedPathKeys
    );
    const trafficEffortScale = searchPurpose === "traffic"
      ? clamp(Number(searchEffortScale) || 1, 0.05, 1)
      : 1;

    const excluded = new Set(excludedPathKeys);
    const chooseBestCachedEstimate = (routes) => (
      (Array.isArray(routes) ? routes : [routes])
        .filter(Boolean)
        .map((candidate) => rebaseEstimatedRouteSoftGuidance(candidate, context))
        .filter((candidate) => !excluded.has(getEstimatedRouteIdentity(candidate)))
        .sort(compareScoredRouteLike)[0] ?? null
    );

    if (estimatedLegCache.has(cacheKey)) {
      const cachedEstimate = chooseBestCachedEstimate(estimatedLegCache.get(cacheKey));
      if (cachedEstimate) {
        estimatedLegCacheHits += 1;
        return cachedEstimate;
      }
      // A shared cache entry can contain a rare dock-edge reboot tied to another
      // robot's start. Keep the shared cache, but search this lineage rather than
      // treating that incompatible witness as a no-route result.
    }

    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const searchContext = {
      state: cloneState(context.state),
      rebootStart: context.rebootStart ? { ...context.rebootStart } : { x: start.x, y: start.y },
      absoluteActions: Math.max(0, Number(context.absoluteActions) || 0),
      history: [],
      programCardState: context.programCardState?.feasible === false
        ? null
        : context.programCardState
          ? { ...context.programCardState }
          : null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(
        context.estimatedCardFrontier,
        context.programCardState
      ),
      estimatedCardForecastFeasible:
        context.estimatedCardForecastFeasible !== false,
      energyReserve: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(baseRouteOptions),
      searchIntrinsicMentalEventCountCurrentTurn: Math.max(
        0, Number(context.searchIntrinsicMentalEventCountCurrentTurn) || 0
      ),
      searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
        context.searchHomingMissileActivatedSpacesCurrentTurn
      )
        ? [...context.searchHomingMissileActivatedSpacesCurrentTurn]
        : [],
      upgradeCardUnits: null,
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      dynamicArchivePoint: context.dynamicArchivePoint
        ? { ...context.dynamicArchivePoint }
        : null,
      approximatePreviousProgramDemandCode:
        Math.max(0, Number(context.approximatePreviousProgramDemandCode) || 0),
      approximateProgramDemandCode:
        Math.max(0, Number(context.approximateProgramDemandCode) || 0),
      approximatePreviousAgainUsed:
        Math.max(0, Number(context.approximatePreviousAgainUsed) || 0),
      approximateCurrentAgainUsed:
        Math.max(0, Number(context.approximateCurrentAgainUsed) || 0),
      approximatePreviousActionId: context.approximatePreviousActionId ?? null
    };
    const primaryWitnessRoutes = (
      forbiddenFirstActions.length || excludedPathKeys.length
    )
      ? 1
      : Math.max(1, Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3));
    const requestedRoutes = Math.max(
      1,
      excludedPathKeys.length + 1,
      primaryWitnessRoutes
    );
    function* runEstimate(
      maxExpansions,
      maxActions,
      telemetryKind,
      resumeTelemetryKind = null,
      resumeExhaustiveOnMiss = false
    ) {
      estimatedLegSearches += 1;
      return yield* enumeratePhysicalTimingLegTemplatesSteps(
        tileMap,
        searchContext,
        flags[legIndex],
        {
          ...baseRouteOptions,
          rebootTokens,
          dynamicGoal,
          startupSpinUp: Boolean(startupSpinUp),
          portalMap,
          maxRoutes: requestedRoutes,
          maxExpansions,
          maxActions,
          optionalTemplateExpansions: excludedPathKeys.length ? Infinity : 45,
          contextualEstimatedCardWeightsOnly: true,
          contextualReturnAllEstimatedPaths: true,
          contextualForbiddenFirstActions: [...forbiddenFirstActions],
          contextualTelemetryKind: telemetryKind,
          contextualResumeTelemetryKind: resumeTelemetryKind,
          contextualResumeExhaustiveOnMiss: Boolean(resumeExhaustiveOnMiss),
          contextualCooperativeSearchSlices: Boolean(options.contextualCooperativeSearchSlices),
          contextualCooperativeSearchSliceMs:
            options.contextualCooperativeSearchSliceMs,
          contextualCooperativeSearchCheckPops:
            options.contextualCooperativeSearchCheckPops,
          contextualWorkGuard: options.contextualWorkGuard
        }
      );
    }

    // Fast bounded estimate first. For primary routing/repair a cap or horizon is
    // never a failure verdict, so those searches widen to physical-graph exhaustion.
    // Traffic alternatives are optional breadth: a bounded miss simply means this
    // mode declines to spend more work on that alternate, never that the leg is
    // intrinsically unreachable.
    const trafficSearchEnvelope = searchPurpose === "traffic"
      ? getTrafficAlternateSearchEnvelope(trafficEffortScale, options)
      : null;
    const nominalEstimateExpansions = trafficSearchEnvelope
      ? trafficSearchEnvelope.maxExpansions
      : Math.max(
        120,
        Math.floor(Number(options.contextualPhysicalTemplateExpansions) || 700)
      );
    const nominalEstimateActions = trafficSearchEnvelope
      ? trafficSearchEnvelope.maxActions
      : Math.max(
        20,
        Math.floor(Number(options.contextualPhysicalTemplateMaxActions) || 36)
      );
    const boundedTelemetryKind = searchPurpose === "traffic"
      ? "estimated-traffic-alternate-leg"
      : forbiddenFirstActions.length
        ? "estimated-card-repair-leg"
        : "estimated-primary-leg";
    const exhaustiveTelemetryKind = forbiddenFirstActions.length
      ? "estimated-card-repair-leg-exhaustive"
      : "estimated-primary-leg-exhaustive";
    let routes = yield* runEstimate(
      nominalEstimateExpansions,
      nominalEstimateActions,
      boundedTelemetryKind,
      exhaustiveTelemetryKind,
      searchPurpose !== "traffic"
    );
    let route = chooseBestCachedEstimate(routes);
    let searchMeta = routes.contextualSearchMeta ?? null;
    if (searchMeta?.resumedExhaustive) {
      estimatedLegWidenedSearches += 1;
      estimatedLegResumedWidenings += 1;
      estimatedLegResumeSavedRootExpansions += Math.max(
        0,
        Number(searchMeta.resumeSavedRootExpansions) || 0
      );
      estimatedLegResumeReplayExpansions += Math.max(
        0,
        Number(searchMeta.resumeReplayExpansions) || 0
      );
    }
    // Safety fallback: if resumable widening was not activated for an eligible
    // bounded miss, retain the established fresh exhaustive call. This should be
    // zero in normal v48zv generation, but preserves reachability for any older or
    // unusual caller whose search metadata cannot support continuation.
    if (
      !route &&
      searchPurpose !== "traffic" &&
      (
        searchMeta?.resumedExhaustive ||
        searchMeta?.zeroRouteCapFailure ||
        searchMeta?.zeroRouteHorizonFailure ||
        searchMeta?.hitExpansionCap ||
        searchMeta?.hitActionHorizon
      )
    ) {
      const resumedBeforeFallback = Boolean(searchMeta?.resumedExhaustive);
      if (!resumedBeforeFallback) {
        estimatedLegWidenedSearches += 1;
      }
      estimatedLegFreshExhaustiveFallbacks += 1;
      routes = yield* runEstimate(
        Infinity,
        Infinity,
        exhaustiveTelemetryKind
      );
      route = chooseBestCachedEstimate(routes);
      searchMeta = routes.contextualSearchMeta ?? searchMeta;
    }

    const retainedRoutes = (Array.isArray(routes) ? routes : [])
      .filter(Boolean)
      .slice(0, requestedRoutes);
    estimatedLegWitnessesGenerated += retainedRoutes.length;
    // A low-confidence optional traffic miss is not evidence that a future
    // higher-confidence traffic probe should also decline this physical state.
    // Cache successful optional witnesses, but never let a deliberately shallow
    // traffic miss poison the shared estimate cache. Primary misses retain their
    // existing semantics.
    if (searchPurpose !== "traffic" || retainedRoutes.length) {
      estimatedLegCache.set(cacheKey, retainedRoutes);
    }
    return route;
  }

  const makeInitialStartContext = (start) => ({
    state: {
      x: start.x,
      y: start.y,
      facing: start.facing ?? "E"
    },
    rebootStart: { x: start.x, y: start.y },
    absoluteActions: 0,
    history: [],
    programCardState: {
      feasible: true,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    },
    estimatedCardFrontier: [{
      state: {
        feasible: true,
        previousCode: 0,
        currentCode: 0,
        previousActionId: null
      },
      penalty: 0
    }],
    estimatedCardForecastFeasible: true,
    energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
    searchIntrinsicMentalEventCountCurrentTurn: 0,
    searchHomingMissileActivatedSpacesCurrentTurn: [],
    upgradeCardUnits: null,
    hazardExposure: 0,
    reNativeAdverseRE: 0,
    // Archive state is per robot. At the dock it differs by start; once robots
    // have touched the same checkpoint/Battery their contexts naturally converge.
    dynamicArchivePoint: options.recoveryRule === "dynamic_archiving"
      ? { x: start.x, y: start.y }
      : null,
    approximatePreviousProgramDemandCode: 0,
    approximateProgramDemandCode: 0,
    approximatePreviousAgainUsed: 0,
    approximateCurrentAgainUsed: 0,
    approximatePreviousActionId: null
  });

  const rebaseEstimatedRouteSoftGuidance = (route, priorContext) => {
    if (!route) return route;
    if (!isRouteCompatibleWithRebootStart(route, priorContext, baseRouteOptions)) {
      return null;
    }
    const initialGuidance = {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    const guidance = walkEstimatedProgramDemand(
      route.localActionIds || [],
      priorContext?.absoluteActions ?? route.absoluteStartAction ?? 0,
      initialGuidance,
      baseRouteOptions,
      route.transitions || []
    );
    const initialForecastFrontier = priorContext?.estimatedCardForecastFeasible === false
      ? []
      : cloneEstimatedCardForecastFrontier(
        priorContext?.estimatedCardFrontier,
        priorContext?.programCardState
      );
    const forecast = walkEstimatedCardForecast(
      route.localActionIds || [],
      priorContext?.absoluteActions ?? route.absoluteStartAction ?? 0,
      initialForecastFrontier,
      baseRouteOptions,
      route.transitions || []
    );
    const priorPenalty = Math.max(0, Number(route.approximateCardPlausibilityPenalty) || 0);
    const priorForecastPenalty = Math.max(
      0,
      Number(route.estimatedCardForecastPenalty) || 0
    );
    const priorEnergyReward = Math.max(
      0,
      Number(route.routeEnergyEconomyRewardScore) || 0
    );
    const priorMentalScore = getCompletedRoutePostbuildScoreAdjustment(route);
    const economy = replayContextualRouteEnergyForContext(
      tileMap,
      route,
      priorContext,
      baseRouteOptions
    );
    const mental = replaySearchIntrinsicMentalForContext(
      tileMap,
      route,
      priorContext,
      baseRouteOptions,
      true
    );
    let rebasedDynamicArchivePoint = options.recoveryRule === "dynamic_archiving"
      ? (priorContext?.dynamicArchivePoint
        ? { ...priorContext.dynamicArchivePoint }
        : route?.initialState
          ? { x: route.initialState.x, y: route.initialState.y }
          : null)
      : null;
    const rebasedDynamicArchivePointStart = rebasedDynamicArchivePoint
      ? { ...rebasedDynamicArchivePoint }
      : null;
    if (options.recoveryRule === "dynamic_archiving") {
      (route.transitions || []).forEach((transition) => {
        if (transition?.to) {
          rebasedDynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            transition.to,
            rebasedDynamicArchivePoint,
            baseRouteOptions
          );
        }
      });
    }
    const score = Number(
      (
        (Number(route.score) || 0) -
        priorPenalty -
        priorForecastPenalty -
        priorMentalScore +
        priorEnergyReward +
        guidance.penalty +
        forecast.penalty +
        getCompletedRoutePostbuildScoreAdjustment(mental) -
        economy.routeEnergyEconomyRewardScore
      ).toFixed(2)
    );
    return {
      ...route,
      ...economy,
      ...mental,
      score,
      approximateCardPlausibilityPenalty: guidance.penalty,
      estimatedCardForecastPenalty: forecast.penalty,
      estimatedCardForecastFeasible: forecast.feasible,
      estimatedCardFrontierEnd: cloneEstimatedCardForecastFrontier(
        forecast.frontier
      ),
      estimatedDemandStateEnd: { ...guidance.state },
      dynamicArchivePointStart: options.recoveryRule === "dynamic_archiving"
        ? rebasedDynamicArchivePointStart
        : route.dynamicArchivePointStart ?? null,
      dynamicArchivePointEnd: options.recoveryRule === "dynamic_archiving"
        ? (rebasedDynamicArchivePoint ? { ...rebasedDynamicArchivePoint } : null)
        : route.dynamicArchivePointEnd ?? null
    };
  };

  const getPhysicalContextAfterEstimatedLeg = (route, priorContext) => {
    const guidedRoute = (
      route?.estimatedDemandStateEnd &&
      Array.isArray(route?.estimatedCardFrontierEnd)
    )
      ? route
      : rebaseEstimatedRouteSoftGuidance(route, priorContext);
    const endGuidance = guidedRoute?.estimatedDemandStateEnd ?? {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    return {
      ...priorContext,
      state: cloneState(guidedRoute.finalState),
      absoluteActions: guidedRoute.absoluteActions,
      hazardExposure: (
        Math.max(0, Number(priorContext?.hazardExposure) || 0) +
        Math.max(0, Number(guidedRoute?.hazard) || 0)
      ),
      approximatePreviousProgramDemandCode: endGuidance.previousDemandCode || 0,
      approximateProgramDemandCode: endGuidance.demandCode || 0,
      approximatePreviousAgainUsed: endGuidance.previousAgainUsed || 0,
      approximateCurrentAgainUsed: endGuidance.currentAgainUsed || 0,
      approximatePreviousActionId: endGuidance.previousActionId ?? null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(
        guidedRoute?.estimatedCardFrontierEnd
      ),
      estimatedCardForecastFeasible:
        priorContext?.estimatedCardForecastFeasible !== false &&
        guidedRoute?.estimatedCardForecastFeasible !== false,
      energyReserve: Number.isFinite(Number(guidedRoute?.routeEnergyShadowReserveEnd))
        ? Number(guidedRoute.routeEnergyShadowReserveEnd)
        : priorContext?.energyReserve ?? null,
      searchIntrinsicMentalEventCountCurrentTurn: Math.max(
        0, Number(guidedRoute?.searchIntrinsicMentalEventCountEnd) || 0
      ),
      searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
        guidedRoute?.searchHomingMissileActivatedSpacesCurrentTurn
      )
        ? [...guidedRoute.searchHomingMissileActivatedSpacesCurrentTurn]
        : [],
      dynamicArchivePoint: guidedRoute?.dynamicArchivePointEnd
        ? { ...guidedRoute.dynamicArchivePointEnd }
        : priorContext?.dynamicArchivePoint
          ? { ...priorContext.dynamicArchivePoint }
          : null
    };
  };


  const getEstimatedContextAfterActionPrefix = (
    priorContext,
    actionIds,
    transitions = []
  ) => {
    const actions = Array.isArray(actionIds) ? actionIds : [];
    let dynamicArchivePoint = priorContext?.dynamicArchivePoint
      ? { ...priorContext.dynamicArchivePoint }
      : null;
    if (options.recoveryRule === "dynamic_archiving") {
      (Array.isArray(transitions) ? transitions : []).forEach((transition) => {
        if (transition?.to) {
          dynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            transition.to,
            dynamicArchivePoint,
            baseRouteOptions
          );
        }
      });
    }
    const initialGuidance = {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    const guidance = walkEstimatedProgramDemand(
      actions,
      priorContext?.absoluteActions ?? 0,
      initialGuidance,
      baseRouteOptions,
      transitions
    );
    const initialForecast = priorContext?.estimatedCardForecastFeasible === false
      ? []
      : cloneEstimatedCardForecastFrontier(
        priorContext?.estimatedCardFrontier,
        priorContext?.programCardState
      );
    const forecast = walkEstimatedCardForecast(
      actions,
      priorContext?.absoluteActions ?? 0,
      initialForecast,
      baseRouteOptions,
      transitions
    );
    const mental = replaySearchIntrinsicMentalForContext(
      tileMap,
      {
        transitions,
        absoluteStartAction: priorContext?.absoluteActions ?? 0
      },
      priorContext,
      baseRouteOptions,
      false
    );
    return {
      ...priorContext,
      absoluteActions: guidance.absoluteActions,
      approximatePreviousProgramDemandCode: guidance.state.previousDemandCode || 0,
      approximateProgramDemandCode: guidance.state.demandCode || 0,
      approximatePreviousAgainUsed: guidance.state.previousAgainUsed || 0,
      approximateCurrentAgainUsed: guidance.state.currentAgainUsed || 0,
      approximatePreviousActionId: guidance.state.previousActionId ?? null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(forecast.frontier),
      estimatedCardForecastFeasible:
        priorContext?.estimatedCardForecastFeasible !== false && forecast.feasible,
      searchIntrinsicMentalEventCountCurrentTurn:
        mental.searchIntrinsicMentalEventCountEnd,
      searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
        mental.searchHomingMissileActivatedSpacesCurrentTurn
      )
        ? [...mental.searchHomingMissileActivatedSpacesCurrentTurn]
        : [],
      dynamicArchivePoint
    };
  };

  function* buildEstimatedCourseFrom(
    existingLegs,
    startLegIndex,
    physicalContext,
    start,
    startIndex
  ) {
    const legs = [...existingLegs];
    let context = { ...physicalContext, state: cloneState(physicalContext.state) };
    for (let legIndex = startLegIndex; legIndex < flags.length; legIndex += 1) {
      const route = yield* getEstimatedLegRoute(
        context,
        legIndex,
        start,
        startIndex,
        legIndex === 0 && Boolean(options.startupSpinUp),
        []
      );
      if (!route) {
        return {
          complete: false,
          failedLegIndex: legIndex,
          legs,
          context
        };
      }
      legs.push(route);
      context = getPhysicalContextAfterEstimatedLeg(route, context);
    }
    return { complete: true, legs, context };
  }

  const getLegRoutes = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    searchControl = {}
  ) => {
    const dynamicGoal = dynamicGoals[legIndex] ?? null;
    const namespace = options.recoveryRule === "home_reboot"
      ? `start${startIndex}`
      : "shared";
    const cacheKey = getContextualLegCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      baseRouteOptions
    );
    const templateKey = getContextualTemplateCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      baseRouteOptions
    );

    // Count every concrete later-leg lineage in its physical arrival class even
    // when an identical exact context can return immediately from legCache. This
    // is telemetry-only; exact-cache hits remain cheaper than catalogue lookups.
    if (
      !searchControl.forceDirectSearch &&
      legIndex > 0 &&
      options.contextualSharedLaterLegCatalogue
    ) {
      const arrivalClassKey = getContextualSharedLegCatalogueKey(
        context,
        legIndex,
        dynamicGoal,
        namespace,
        baseRouteOptions
      );
      arrivalClassKeysByLeg[legIndex].add(arrivalClassKey);
      let classLineages = arrivalClassLineagesByLeg[legIndex].get(arrivalClassKey);
      if (!classLineages) {
        classLineages = new Set();
        arrivalClassLineagesByLeg[legIndex].set(arrivalClassKey, classLineages);
      }
      classLineages.add(startIndex);
    }

    if (!searchControl.bypassCache && legCache.has(cacheKey)) {
      const cachedRoutes = legCache.get(cacheKey)
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        ))
        .filter(Boolean);
      if (cachedRoutes.length) {
        cacheHits += 1;
        return cachedRoutes;
      }
      // As above, an otherwise-shareable leg may contain a dock-start recovery
      // belonging to another robot. Fall through to real search for this start.
    }

    const opening = legIndex === 0;
    const requestedRouteCount = Number.isFinite(Number(searchControl.maxRoutes))
      ? Math.max(1, Math.floor(Number(searchControl.maxRoutes)))
      : opening
        ? (options.contextualOpeningRoutes ?? CONTEXTUAL_OPENING_ROUTES)
        : (options.contextualLaterRoutes ?? CONTEXTUAL_LATER_ROUTES);
    const requestedCompletionPool = Number.isFinite(Number(searchControl.completionPool))
      ? Math.max(1, Math.floor(Number(searchControl.completionPool)))
      : options.contextualCompletionPool ?? (opening ? 4 : CONTEXTUAL_COMPLETION_POOL);
    const requestedBeamWidth = options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH;
    const requestedOptionalExpansions = Number.isFinite(Number(searchControl.optionalCompletionExpansions))
      ? Math.max(0, Math.floor(Number(searchControl.optionalCompletionExpansions)))
      : (options.contextualOptionalCompletionExpansions ?? 0);
    const breadthPolicy = searchControl.ignoreUncertaintyBreadth
      ? {
        band: CONTEXTUAL_FORECAST_BANDS.SOLID,
        maxRoutes: requestedRouteCount,
        completionPool: requestedCompletionPool,
        beamWidth: requestedBeamWidth,
        optionalCompletionExpansions: requestedOptionalExpansions
      }
      : getContextualBreadthPolicy(
        context,
        requestedRouteCount,
        requestedCompletionPool,
        requestedBeamWidth,
        requestedOptionalExpansions,
        baseRouteOptions
      );
    const targetRouteCount = breadthPolicy.maxRoutes;
    const nominalExpansions = opening
      ? (
        options.contextualOpeningExpansions ??
        CONTEXTUAL_OPENING_EXPANSIONS
      )
      : (
        options.contextualLaterExpansions ??
        CONTEXTUAL_LATER_EXPANSIONS
      );
    const effectiveExpansions = Number.isFinite(Number(searchControl.maxExpansions))
      ? Math.max(1, Math.floor(Number(searchControl.maxExpansions)))
      : nominalExpansions;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const commonSearchOptions = {
      ...baseRouteOptions,
      rebootTokens,
      dynamicGoal,
      startupSpinUp: opening && startupSpinUp,
      maxRoutes: targetRouteCount,
      completionPool: breadthPolicy.completionPool,
      maxActions: Number.isFinite(Number(searchControl.maxActions))
        ? Math.max(1, Math.floor(Number(searchControl.maxActions)))
        : (options.contextualLegMaxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS),
      optionalCompletionExpansions: breadthPolicy.optionalCompletionExpansions,
      contextualForecastBand: breadthPolicy.band
    };

    const runSearch = (
      searchContext,
      telemetryKind,
      incumbentRoutes = [],
      extraOptions = {}
    ) => {
      const searchExpansionBudget = Number.isFinite(Number(extraOptions.maxExpansions))
        ? Math.max(1, Math.floor(Number(extraOptions.maxExpansions)))
        : effectiveExpansions;
      const routes = enumerateContextualLegRoutes(
        tileMap,
        searchContext,
        flags[legIndex],
        {
          ...commonSearchOptions,
          ...extraOptions,
          maxExpansions: searchExpansionBudget,
          contextualIncumbentRoutes: incumbentRoutes,
          contextualTelemetryKind: telemetryKind
        }
      );
      return routes;
    };

    const recordZeroRouteCap = (searchMeta) => {
      const capped = Boolean(searchMeta?.zeroRouteCapFailure);
      const horizon = Boolean(searchMeta?.zeroRouteHorizonFailure);
      if (!capped && !horizon) return false;
      zeroRouteFailureStarts.add(startIndex);
      zeroRouteFailureStartsByLeg[legIndex].add(startIndex);
      if (capped) {
        zeroRouteCapFailures += 1;
        zeroRouteCapsByLeg[legIndex] += 1;
      }
      if (horizon) {
        zeroRouteHorizonFailures += 1;
        zeroRouteHorizonFailureStarts.add(startIndex);
        zeroRouteHorizonsByLeg[legIndex] += 1;
        zeroRouteHorizonFailureStartsByLeg[legIndex].add(startIndex);
      }
      return true;
    };

    // v28 arrival-class routing: Start→Flag1 remains exact per lineage. Later
    // legs are discovered once per distinct physical arrival class (position/facing/
    // register phase/dynamic-goal phase/reboot namespace), then exact-replayed against
    // each lineage's rolling card state. The internal witness pool is reachability
    // machinery, not gameplay alternate-route retention.
    const forceDirectSearch = Boolean(searchControl.forceDirectSearch);
    const catalogueEnabled = Boolean(
      !forceDirectSearch &&
      !opening &&
      options.contextualSharedLaterLegCatalogue
    );
    let catalogueEntry = null;
    let catalogueKey = null;
    let catalogueNeedsEnrichment = false;
    if (catalogueEnabled) {
      catalogueLookups += 1;
      catalogueKey = getContextualSharedLegCatalogueKey(
        context,
        legIndex,
        dynamicGoal,
        namespace,
        baseRouteOptions
      );
      arrivalClassKeysByLeg[legIndex].add(catalogueKey);
      let classLineages = arrivalClassLineagesByLeg[legIndex].get(catalogueKey);
      if (!classLineages) {
        classLineages = new Set();
        arrivalClassLineagesByLeg[legIndex].set(catalogueKey, classLineages);
      }
      classLineages.add(startIndex);
      catalogueEntry = sharedLegCatalogueCache.get(catalogueKey) ?? null;
      const catalogueWasCached = Boolean(catalogueEntry);

      if (!catalogueEntry) {
        catalogueSearches += 1;
        const catalogueContext = {
          state: cloneState(context.state),
          // Register phase is synchronized board state and remains exact.
          absoluteActions: context.absoluteActions,
          history: [],
          programCardState: getCompactProgramCardStateFromHistory(
            [],
            context.absoluteActions,
            baseRouteOptions
          ),
          energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
          upgradeCardUnits: null,
          hazardExposure: 0
        };
        const requestedPhysicalTemplateRoutes = Math.max(
          1,
          Math.floor(Number(options.contextualPhysicalTemplateRoutes) || 1)
        );
        const primaryWitnessRoutes = Math.max(
          1,
          Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
        );
        // Even when gameplay alternatives are disabled, retain a few cheap internal
        // physical witnesses so different exact card histories can share discovery.
        // Only targetRouteCount routes can escape this function.
        const physicalTemplateRoutes = Math.min(
          CONTEXTUAL_TEMPLATE_POOL,
          Math.max(
            targetRouteCount,
            requestedPhysicalTemplateRoutes,
            primaryWitnessRoutes
          )
        );
        const physicalTemplateBudget = Math.max(
          240,
          Math.floor(Number(options.contextualPhysicalTemplateExpansions) || 700)
        );
        const physicalTemplateMaxActions = Math.max(
          commonSearchOptions.maxActions,
          Math.floor(Number(options.contextualPhysicalTemplateMaxActions) || 36)
        );
        let catalogueRoutes = enumeratePhysicalTimingLegTemplates(
          tileMap,
          catalogueContext,
          flags[legIndex],
          {
            ...commonSearchOptions,
            startupSpinUp: false,
            maxRoutes: physicalTemplateRoutes,
            maxExpansions: physicalTemplateBudget,
            maxActions: physicalTemplateMaxActions,
            contextualApproximateCardWeights: true,
            contextualTelemetryKind: "contextual-physical-template"
          }
        );
        let searchMeta = catalogueRoutes.contextualSearchMeta ?? null;

        // A capped physical search is cheap enough to widen once because its state
        // space is only board/facing/register timing. Do this before asking any
        // concrete robot history to pay for an exact combinatorial rescue.
        if (!catalogueRoutes.length && searchMeta?.zeroRouteCapFailure) {
          const physicalRescueBudget = Math.max(
            physicalTemplateBudget,
            Math.min(
              Math.max(physicalTemplateBudget, 2400),
              Math.max(physicalTemplateBudget, Number(options.maxExpansions) || 2400)
            )
          );
          if (physicalRescueBudget > physicalTemplateBudget) {
            const rescuedTemplates = enumeratePhysicalTimingLegTemplates(
              tileMap,
              catalogueContext,
              flags[legIndex],
              {
                ...commonSearchOptions,
                startupSpinUp: false,
                maxRoutes: physicalTemplateRoutes,
                maxExpansions: physicalRescueBudget,
                maxActions: physicalTemplateMaxActions,
                contextualApproximateCardWeights: true,
                contextualTelemetryKind: "contextual-physical-template-rescue"
              }
            );
            if (rescuedTemplates.length) catalogueRoutes = rescuedTemplates;
            searchMeta = rescuedTemplates.contextualSearchMeta ?? searchMeta;
          }
        }

        const storedRoutes = dedupeRoutes(catalogueRoutes)
          .sort(compareScoredRouteLike)
          .slice(0, CONTEXTUAL_TEMPLATE_POOL);
        catalogueWitnessesGenerated += storedRoutes.length;
        const unresolvedPhysical = !storedRoutes.length && Boolean(
          searchMeta?.zeroRouteCapFailure || searchMeta?.zeroRouteHorizonFailure
        );
        catalogueEntry = {
          status: storedRoutes.length
            ? "ready"
            : unresolvedPhysical
              ? "unresolved"
              : "exhausted",
          routes: storedRoutes,
          canonicalContext: catalogueContext,
          searchMeta,
          enrichments: 0
        };
        sharedLegCatalogueCache.set(catalogueKey, catalogueEntry);
        if (searchMeta?.zeroRouteCapFailure) catalogueCappedSearches += 1;
        else if (!storedRoutes.length && !unresolvedPhysical) catalogueExhaustedSearches += 1;
      } else {
        catalogueCacheHits += 1;
      }

      if (catalogueEntry.status === "unresolved") {
        if (catalogueWasCached) catalogueSuppressedCappedLookups += 1;
        const unresolved = [];
        unresolved.contextualUnresolvedCap = Boolean(
          catalogueEntry.searchMeta?.zeroRouteCapFailure
        );
        unresolved.contextualUnresolvedHorizon = Boolean(
          catalogueEntry.searchMeta?.zeroRouteHorizonFailure
        );
        unresolved.contextualSearchMeta = catalogueEntry.searchMeta ?? {
          hitExpansionCap: false,
          hitActionHorizon: true,
          zeroRouteHorizonFailure: true
        };
        return unresolved;
      }
      if (catalogueEntry.status === "exhausted") {
        if (!searchControl.bypassCache) legCache.set(cacheKey, []);
        return [];
      }

      const compatibleRoutes = [];
      for (let witnessIndex = 0; witnessIndex < catalogueEntry.routes.length; witnessIndex += 1) {
        const route = catalogueEntry.routes[witnessIndex];
        catalogueReplayRouteChecks += 1;
        const rebased = rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        );
        if (!rebased) continue;
        compatibleRoutes.push(rebased);
        catalogueWitnessRankSuccesses[witnessIndex] =
          (catalogueWitnessRankSuccesses[witnessIndex] || 0) + 1;
        if (
          !baseRouteOptions.contextualTrafficAlternativeRetention &&
          compatibleRoutes.length >= targetRouteCount
        ) {
          break;
        }
      }
      compatibleRoutes.sort(compareScoredRouteLike);
      const distinctCompatible = baseRouteOptions.contextualTrafficAlternativeRetention && targetRouteCount > 1
        ? selectContextualTrafficAlternativeRoutes(
          compatibleRoutes,
          flags[legIndex],
          targetRouteCount
        )
        : selectDistinctRoutes(
          compatibleRoutes,
          flags[legIndex],
          targetRouteCount
        );

      if (distinctCompatible.length) {
        catalogueCompatibleLineages += 1;
        catalogueWitnessResolvedLineages += 1;
        catalogueCompatibleRoutes += distinctCompatible.length;
        let resultRoutes = distinctCompatible;

        // Only pay for an exact refinement if the mode still wants another route
        // and the physical templates could not supply it. This is bounded repair,
        // not the primary discovery mechanism.
        if (targetRouteCount > distinctCompatible.length) {
          catalogueRefinementSearches += 1;
          const repairBudget = Math.min(
            effectiveExpansions,
            Math.max(180, Math.floor(Number(options.contextualExactRepairExpansions) || 450))
          );
          const refinedRoutes = runSearch(
            context,
            "contextual-catalogue-refine",
            distinctCompatible,
            { maxExpansions: repairBudget }
          );
          resultRoutes = refinedRoutes.length
            ? refinedRoutes
            : distinctCompatible;
        }
        if (!searchControl.bypassCache) legCache.set(cacheKey, resultRoutes);
        return resultRoutes;
      }

      catalogueIncompatibleLineages += 1;
      // None of the shared physical templates fit this exact two-program card
      // state. Allow a small concrete repair; if it caps, capacity logic may later
      // escalate only this lineage. Never make every lineage pay the old 1000/6000
      // exact failure tail merely because one template was incompatible.
      catalogueEntry.enrichments += 1;
      catalogueEnrichmentSearches += 1;
      catalogueNeedsEnrichment = true;
    }

    const cachedTemplates = forceDirectSearch
      ? []
      : (templateCache.get(templateKey) ?? []);

    if (cachedTemplates.length) {
      const rebasedTemplates = cachedTemplates
        .map((route) => {
          const rebased = rebaseContextualCachedRoute(
            tileMap,
            route,
            context,
            baseRouteOptions
          );
          if (!rebased) return null;
          return {
            route: rebased,
            cardDelta: Math.abs(
              (
                (rebased.cardAvailabilityPenalty || 0) +
                (rebased.programPlausibilityPenalty || 0)
              ) -
              (
                (route.cardAvailabilityPenalty || 0) +
                (route.programPlausibilityPenalty || 0)
              )
            )
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.route.score - right.route.score);
      const acceptable = rebasedTemplates
        .filter((entry) => (
          entry.cardDelta <= CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT
        ))
        .map((entry) => entry.route);
      const distinct = baseRouteOptions.contextualTrafficAlternativeRetention && targetRouteCount > 1
        ? selectContextualTrafficAlternativeRoutes(
          acceptable,
          flags[legIndex],
          targetRouteCount
        )
        : selectDistinctRoutes(
          acceptable,
          flags[legIndex],
          targetRouteCount
        );

      if (distinct.length >= Math.min(2, targetRouteCount)) {
        templateHits += 1;
        if (!searchControl.bypassCache) legCache.set(cacheKey, distinct);
        if (catalogueNeedsEnrichment && catalogueEntry) {
          catalogueEnrichmentSuccesses += 1;
          const canonicalTemplates = distinct
            .map((route) => rebaseContextualCachedRoute(
              tileMap,
              route,
              catalogueEntry.canonicalContext,
              baseRouteOptions
            ))
            .filter(Boolean);
          catalogueEntry.routes = dedupeRoutes([
            ...catalogueEntry.routes,
            ...canonicalTemplates
          ])
            .sort(compareScoredRouteLike)
            .slice(0, CONTEXTUAL_TEMPLATE_POOL);
        }
        return distinct;
      }

      templateFallbacks += 1;
    }

    cacheMisses += 1;
    const exactRepairBudget = catalogueNeedsEnrichment
      ? Math.min(
        effectiveExpansions,
        Math.max(220, Math.floor(Number(options.contextualExactRepairExpansions) || 550))
      )
      : effectiveExpansions;
    const routes = runSearch(
      context,
      searchControl.telemetryKind ?? (
        catalogueNeedsEnrichment
          ? "contextual-catalogue-enrich"
          : "contextual-leg"
      ),
      [],
      { maxExpansions: exactRepairBudget }
    );
    const searchMeta = routes.contextualSearchMeta ?? null;
    const unresolved = recordZeroRouteCap(searchMeta);

    // Do not memoize an unresolved cap/horizon miss as if it proved no route.
    if (!searchControl.bypassCache && !unresolved) {
      legCache.set(cacheKey, routes);
    }
    if (!routes.length && unresolved) {
      routes.contextualUnresolvedCap = Boolean(searchMeta?.zeroRouteCapFailure);
      routes.contextualUnresolvedHorizon = Boolean(searchMeta?.zeroRouteHorizonFailure);
    }

    if (!forceDirectSearch) {
      const mergedTemplates = dedupeRoutes([
        ...cachedTemplates,
        ...routes.filter(Boolean)
      ])
        .sort(compareScoredRouteLike)
        .slice(0, CONTEXTUAL_TEMPLATE_POOL);
      templateCache.set(templateKey, mergedTemplates);
    }

    if (catalogueNeedsEnrichment && catalogueEntry && routes.length) {
      catalogueEnrichmentSuccesses += 1;
      const canonicalEnrichment = routes
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          catalogueEntry.canonicalContext,
          baseRouteOptions
        ))
        .filter(Boolean);
      catalogueEntry.routes = dedupeRoutes([
        ...catalogueEntry.routes,
        ...canonicalEnrichment
      ])
        .sort(compareScoredRouteLike)
        .slice(0, CONTEXTUAL_TEMPLATE_POOL);
    }

    return routes;
  };

  const runCapacityRescue = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    unresolvedMeta = null
  ) => {
    const budgets = getCapacityRescueBudgets(legIndex);
    let lastMeta = unresolvedMeta ?? {};

    // If the unresolved result came from the physical catalogue, widening exact
    // card-state search cannot discover geometry that the smaller physical search
    // did not see. Widen the cheap physical state space first, then exact-replay
    // any witnesses it finds.
    if (lastMeta?.physicalTimingTemplate) {
      capacityRescueSearches += 1;
      capacityPhysicalRescueSearches += 1;
      const rebootTokens = options.recoveryRule === "home_reboot"
        ? getHomeRebootTokensForStart(start, options.rebootTokens)
        : options.rebootTokens;
      const physicalRoutes = enumeratePhysicalTimingLegTemplates(
        tileMap,
        context,
        flags[legIndex],
        {
          ...baseRouteOptions,
          rebootTokens,
          dynamicGoal: dynamicGoals[legIndex] ?? null,
          startupSpinUp: legIndex === 0 && startupSpinUp,
          portalMap,
          maxRoutes: Math.max(
            1,
            Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
          ),
          contextualApproximateCardWeights: true,
          maxExpansions: Math.min(
            4000,
            Math.max(3000, Number(options.maxExpansions) || 4000)
          ),
          maxActions: Math.max(48, budgets.maxActions),
          contextualTelemetryKind: "contextual-capacity-physical-rescue"
        }
      );
      const exactReplay = physicalRoutes
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        ))
        .filter(Boolean)
        .sort(compareScoredRouteLike);
      if (exactReplay.length) {
        capacityRescueSuccesses += 1;
        capacityPhysicalRescueSuccesses += 1;
        return exactReplay.slice(0, 1);
      }
      lastMeta = physicalRoutes.contextualSearchMeta ?? lastMeta;
      if (!physicalRoutes.length && !lastMeta?.zeroRouteCapFailure && !lastMeta?.zeroRouteHorizonFailure) {
        return [];
      }
      // Geometry exists but the retained physical traces did not fit this card
      // history: fall through to the bounded exact repair below.
      if (physicalRoutes.length) {
        lastMeta = {
          ...lastMeta,
          physicalTimingTemplate: false,
          zeroRouteCapFailure: true
        };
      } else {
        const unresolved = [];
        unresolved.contextualUnresolvedCap = Boolean(lastMeta?.zeroRouteCapFailure);
        unresolved.contextualUnresolvedHorizon = Boolean(lastMeta?.zeroRouteHorizonFailure);
        unresolved.contextualSearchMeta = lastMeta;
        return unresolved;
      }
    }

    const runOne = (kind, maxExpansions, countHorizon = false) => {
      capacityRescueSearches += 1;
      if (countHorizon) capacityHorizonRescueSearches += 1;
      else capacityExpansionRescueSearches += 1;
      const routes = getLegRoutes(
        context,
        legIndex,
        start,
        startIndex,
        startupSpinUp,
        {
          bypassCache: true,
          forceDirectSearch: true,
          maxRoutes: 1,
          completionPool: 1,
          maxExpansions,
          maxActions: budgets.maxActions,
          ignoreUncertaintyBreadth: true,
          optionalCompletionExpansions: 0,
          telemetryKind: kind
        }
      );
      if (routes.length) {
        capacityRescueSuccesses += 1;
        if (countHorizon) capacityHorizonRescueSuccesses += 1;
        else capacityExpansionRescueSuccesses += 1;
      }
      return routes;
    };

    // Horizon first: more registers, almost the same search width. This identifies
    // long-but-simple routes without immediately paying the old 6000-state tail.
    if (lastMeta?.zeroRouteHorizonFailure) {
      const horizonRoutes = runOne(
        "contextual-capacity-horizon-rescue",
        budgets.horizonExpansions,
        true
      );
      if (horizonRoutes.length) return horizonRoutes;
      lastMeta = horizonRoutes.contextualSearchMeta ?? lastMeta;
    }

    // Expansion rescue is the final exact fallback and is only reached if capacity
    // still depends on this lineage. Cap it at 3000 in Standard rather than 6000.
    if (lastMeta?.zeroRouteCapFailure || !lastMeta?.zeroRouteHorizonFailure) {
      const expansionRoutes = runOne(
        "contextual-capacity-expansion-rescue",
        budgets.expansionExpansions,
        false
      );
      if (expansionRoutes.length) return expansionRoutes;
      lastMeta = expansionRoutes.contextualSearchMeta ?? lastMeta;
    }

    const unresolved = [];
    unresolved.contextualUnresolvedCap = Boolean(lastMeta?.zeroRouteCapFailure);
    unresolved.contextualUnresolvedHorizon = Boolean(lastMeta?.zeroRouteHorizonFailure);
    unresolved.contextualSearchMeta = lastMeta;
    return unresolved;
  };

  const makeSurvivorSnapshot = (legIndex, extra = {}) => {
    const survivingStarts = Number.isFinite(extra.survivingStarts)
      ? extra.survivingStarts
      : startPartials.filter((entry) => entry.partials.length).length;
    const cappedContextsThisLeg = zeroRouteCapsByLeg[legIndex] ?? 0;
    const cappedStartsThisLeg = zeroRouteFailureStartsByLeg[legIndex]?.size ?? 0;
    return {
      legIndex,
      legNumber: legIndex + 1,
      survivingStarts,
      requiredStarts: requiredSurvivingStarts,
      preferredStarts: preferredSurvivingStarts,
      maximumPossibleStarts: Number.isFinite(extra.maximumPossibleStarts)
        ? extra.maximumPossibleStarts
        : survivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - survivingStarts),
      cappedContextsThisLeg,
      cappedStartsThisLeg,
      totalCappedContexts: zeroRouteCapFailures,
      distinctCappedStarts: zeroRouteFailureStarts.size,
      horizonContextsThisLeg: zeroRouteHorizonsByLeg[legIndex] ?? 0,
      horizonStartsThisLeg: zeroRouteHorizonFailureStartsByLeg[legIndex]?.size ?? 0,
      totalHorizonContexts: zeroRouteHorizonFailures,
      distinctHorizonStarts: zeroRouteHorizonFailureStarts.size,
      seededOpeningStarts,
      processedStartsThisLeg: extra.processedStartsThisLeg ?? null,
      preferredCapacityShortCircuit: Boolean(extra.preferredCapacityShortCircuit)
    };
  };

  const throwCapacityLost = (legIndex, snapshot) => {
    survivorHistory.push(snapshot);
    const maximumText = Number.isFinite(snapshot.maximumPossibleStarts)
      ? `; at most ${snapshot.maximumPossibleStarts} can survive`
      : "";
    const error = new Error(
      `Contextual start capacity lost after leg ${legIndex + 1}: ${snapshot.survivingStarts}/${requiredSurvivingStarts} routed starts so far${maximumText}; ${snapshot.cappedContextsThisLeg} capped route contexts this leg`
    );
    error.code = "CONTEXTUAL_START_CAPACITY_LOST";
    error.contextualSearchHealth = {
      zeroRouteCapFailures,
      zeroRouteHorizonFailures,
      distinctStarts: zeroRouteFailureStarts.size,
      distinctHorizonStarts: zeroRouteHorizonFailureStarts.size,
      cappedContextsThisLeg: snapshot.cappedContextsThisLeg,
      horizonContextsThisLeg: snapshot.horizonContextsThisLeg ?? 0,
      cappedStartsThisLeg: snapshot.cappedStartsThisLeg,
      survivingStarts: snapshot.survivingStarts,
      maximumPossibleStarts: snapshot.maximumPossibleStarts,
      requiredStarts: requiredSurvivingStarts,
      preferredStarts: preferredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: snapshot.lostStarts,
      legIndex,
      legNumber: legIndex + 1,
      flagCount: flags.length,
      seededOpeningStarts,
      processedStartsThisLeg: snapshot.processedStartsThisLeg,
      capacityRescueSearches,
      capacityRescueSuccesses,
      capacityPhysicalRescueSearches,
      capacityPhysicalRescueSuccesses,
      capacityHorizonRescueSearches,
      capacityHorizonRescueSuccesses,
      capacityExpansionRescueSearches,
      capacityExpansionRescueSuccesses,
      catalogueEntries: sharedLegCatalogueCache.size,
      catalogueLookups,
      catalogueCacheHits,
      catalogueSearches,
      catalogueCappedSearches,
      catalogueExhaustedSearches,
      catalogueSuppressedCappedLookups,
      catalogueReplayRouteChecks,
      catalogueCompatibleLineages,
      catalogueCompatibleRoutes,
      catalogueIncompatibleLineages,
      catalogueRefinementSearches,
      catalogueEnrichmentSearches,
      catalogueEnrichmentSuccesses,
      catalogueEnrichmentSuppressed,
      survivorHistory: survivorHistory.map((entry) => ({ ...entry }))
    };
    throw error;
  };

  const startPartials = [];
  if (options.contextualEstimatedPrimaryRouting) {
    // v29 Normal primary-routing invariant:
    //   Milestone 1: every structural start receives a complete physical estimate.
    //   Milestone 2: every estimate receives a hard rolling-card realization.
    // A player-count floor is an acceptance rule only; it never stops either
    // milestone early and it never decides whether another start deserves routing.
    const estimatedEntries = [];
    const excludedLegPathsByConstraint = new Map();
    const forbiddenRepairActionsByConstraint = new Map();

    const getLegStartPhysicalContext = (legs, legIndex, initialContext) => {
      let context = {
        ...initialContext,
        state: cloneState(initialContext.state)
      };
      for (let index = 0; index < legIndex; index += 1) {
        const route = legs[index];
        if (!route) break;
        context = getPhysicalContextAfterEstimatedLeg(route, context);
      }
      return context;
    };

    const getPrefixActionsBeforeLeg = (legs, legIndex) => (
      legs.slice(0, legIndex).flatMap((leg) => leg?.localActionIds || [])
    );

    function* findAlternativeEstimatedCourse(
      currentLegs,
      startAtLeg,
      start,
      startIndex,
      initialContext
    ) {
      const highestLeg = Math.min(
        Math.max(0, Math.floor(Number(startAtLeg) || 0)),
        Math.max(0, currentLegs.length - 1)
      );
      for (let legIndex = highestLeg; legIndex >= 0; legIndex -= 1) {
        const prefixLegs = currentLegs.slice(0, legIndex);
        const legStartContext = getLegStartPhysicalContext(
          currentLegs,
          legIndex,
          initialContext
        );
        const prefixActions = getPrefixActionsBeforeLeg(currentLegs, legIndex);
        const constraintKey = [
          `leg${legIndex}`,
          getEstimatedRouteFailureConstraintKey(
            legStartContext.state,
            legStartContext.absoluteActions,
            prefixActions
          )
        ].join("|");
        let excludedPaths = excludedLegPathsByConstraint.get(constraintKey);
        if (!excludedPaths) {
          excludedPaths = new Set();
          excludedLegPathsByConstraint.set(constraintKey, excludedPaths);
        }
        const currentRoute = currentLegs[legIndex] ?? null;
        if (currentRoute) excludedPaths.add(getEstimatedRouteIdentity(currentRoute));

        while (true) {
          const alternate = yield* getEstimatedLegRoute(
            legStartContext,
            legIndex,
            start,
            startIndex,
            legIndex === 0 && Boolean(options.startupSpinUp),
            [],
            [...excludedPaths]
          );
          if (!alternate) break;
          const alternatePathKey = getEstimatedRouteIdentity(alternate);
          if (excludedPaths.has(alternatePathKey)) {
            break;
          }

          const afterAlternate = getPhysicalContextAfterEstimatedLeg(
            alternate,
            legStartContext
          );
          const rebuilt = yield* buildEstimatedCourseFrom(
            [...prefixLegs, alternate],
            legIndex + 1,
            afterAlternate,
            start,
            startIndex
          );
          if (rebuilt.complete) {
            return rebuilt;
          }

          // This exact physical leg produced an arrival from which the remaining
          // course could not be estimated. Exclude only this whole leg path for
          // this exact prefix; do not forbid its first action globally.
          excludedPaths.add(alternatePathKey);
          let deeper = null;
          if (rebuilt.legs.length) {
            deeper = yield* findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              startIndex,
              initialContext
            );
          }
          if (deeper?.complete) return deeper;
        }
      }
      return null;
    }

    // If an exact card failure cannot be repaired from the impossible register
    // itself, move the decision point backward through the existing estimated
    // prefix. At each earlier register, forbid only the action already proven to
    // lead into the dead card prefix, then let the uncapped-on-miss physical
    // estimator rebuild the rest of that leg and all downstream legs. This is
    // card-constraint backtracking, not a capacity rescue.
    function* backtrackEstimatedCourseFromPrefix(
      currentLegs,
      failureLegIndex,
      localFailureIndex,
      start,
      startIndex,
      initialContext
    ) {
      for (let legIndex = failureLegIndex; legIndex >= 0; legIndex -= 1) {
        const leg = currentLegs[legIndex];
        const actions = leg?.localActionIds || [];
        if (!actions.length) continue;
        const firstPivot = legIndex === failureLegIndex
          ? Math.min(actions.length - 1, localFailureIndex - 1)
          : actions.length - 1;
        if (firstPivot < 0) continue;

        const legStartContext = getLegStartPhysicalContext(
          currentLegs,
          legIndex,
          initialContext
        );
        const actionsBeforeLeg = getPrefixActionsBeforeLeg(currentLegs, legIndex);

        for (let pivot = firstPivot; pivot >= 0; pivot -= 1) {
          const pivotState = pivot > 0
            ? cloneState(leg.transitions[pivot - 1].to)
            : cloneState(leg.initialState);
          const pivotAbsoluteActions = getElapsedAbsoluteActionsAfterTransitions(
            leg.transitions || [],
            leg.absoluteStartAction ?? legStartContext.absoluteActions,
            pivot
          );
          const prefixActionIds = [
            ...actionsBeforeLeg,
            ...actions.slice(0, pivot)
          ];
          const constraintKey = getEstimatedRouteFailureConstraintKey(
            pivotState,
            pivotAbsoluteActions,
            prefixActionIds
          );
          let forbiddenActions = forbiddenRepairActionsByConstraint.get(constraintKey);
          if (!forbiddenActions) {
            forbiddenActions = new Set();
            forbiddenRepairActionsByConstraint.set(constraintKey, forbiddenActions);
          }
          const actionToReplace = actions[pivot];
          if (!actionToReplace) continue;
          forbiddenActions.add(actionToReplace);

          const pivotGuidanceContext = getEstimatedContextAfterActionPrefix(
            legStartContext,
            actions.slice(0, pivot),
            (leg.transitions || []).slice(0, pivot)
          );
          const pivotContext = {
            ...pivotGuidanceContext,
            state: pivotState,
            absoluteActions: pivotAbsoluteActions
          };
          const suffix = yield* getEstimatedLegRoute(
            pivotContext,
            legIndex,
            start,
            startIndex,
            Boolean(legIndex === 0 && pivot === 0 && options.startupSpinUp),
            [...forbiddenActions],
            []
          );
          if (!suffix) continue;

          const repairedLeg = pivot === 0 && legIndex === 0 && options.startupSpinUp
            ? suffix
            : combineEstimatedPhysicalRouteSuffix(
              tileMap,
              leg,
              pivot,
              suffix,
              flags[legIndex],
              dynamicGoals[legIndex] ?? null,
              baseRouteOptions
            );
          const prefixLegs = currentLegs.slice(0, legIndex);
          const afterRepairedLeg = getPhysicalContextAfterEstimatedLeg(
            repairedLeg,
            legStartContext
          );
          let rebuilt = yield* buildEstimatedCourseFrom(
            [...prefixLegs, repairedLeg],
            legIndex + 1,
            afterRepairedLeg,
            start,
            startIndex
          );
          if (!rebuilt.complete && rebuilt.legs.length) {
            const alternative = yield* findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              startIndex,
              initialContext
            );
            if (alternative?.complete) rebuilt = alternative;
          }
          if (rebuilt.complete) {
            cardRepairPrefixBacktracks += 1;
            return rebuilt;
          }
        }
      }
      return null;
    }

    // Milestone 1: finish physical estimates for every start before any start is
    // judged by card supply. Later legs automatically share the estimate cache by
    // physical arrival class.
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const sourceIndex = Number.isInteger(start.analysisIndex)
        ? start.analysisIndex
        : index;
      const initialContext = makeInitialStartContext(start);
      let estimated = yield* buildEstimatedCourseFrom(
        [],
        0,
        initialContext,
        start,
        sourceIndex
      );
      if (!estimated.complete && estimated.legs.length) {
        const alternative = yield* findAlternativeEstimatedCourse(
          estimated.legs,
          estimated.failedLegIndex - 1,
          start,
          sourceIndex,
          initialContext
        );
        if (alternative?.complete) estimated = alternative;
      }
      if (estimated.complete) {
        estimatedMilestoneRoutes += 1;
        // Record only the selected Milestone-1 estimate for class-collapse
        // telemetry. Repair searches may visit many additional classes later and
        // must not make the initial lineage count look larger than the start field.
        let arrivalContext = initialContext;
        for (let legIndex = 0; legIndex < estimated.legs.length; legIndex += 1) {
          if (legIndex > 0) {
            const dynamicGoal = dynamicGoals[legIndex] ?? null;
            const namespace = options.recoveryRule === "home_reboot"
              ? `start${sourceIndex}`
              : "shared";
            const arrivalClassKey = getContextualSharedLegCatalogueKey(
              arrivalContext,
              legIndex,
              dynamicGoal,
              namespace,
              baseRouteOptions
            );
            arrivalClassKeysByLeg[legIndex].add(arrivalClassKey);
            let classLineages = arrivalClassLineagesByLeg[legIndex].get(arrivalClassKey);
            if (!classLineages) {
              classLineages = new Set();
              arrivalClassLineagesByLeg[legIndex].set(arrivalClassKey, classLineages);
            }
            classLineages.add(sourceIndex);
          }
          arrivalContext = getPhysicalContextAfterEstimatedLeg(
            estimated.legs[legIndex],
            arrivalContext
          );
        }
        if (arrivalContext.estimatedCardForecastFeasible !== false) {
          estimatedForecastIntactRoutes += 1;
        }
      } else {
        estimatedPhysicalFailures += 1;
        estimatedPhysicalFailureStarts += 1;
      }
      estimatedEntries.push({
        index: sourceIndex,
        start,
        initialContext,
        estimated
      });
      // Cooperative boundary: one start's complete physical estimate is stable.
      // The async driver may yield to the browser here; the synchronous driver
      // simply advances immediately, preserving existing analysis semantics.
      yield { phase: "estimated-start", startIndex: sourceIndex };
    }

    survivorHistory.push({
      stage: "estimated",
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      survivingStarts: estimatedMilestoneRoutes,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - estimatedMilestoneRoutes),
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      totalCappedContexts: 0,
      distinctCappedStarts: 0,
      estimatedPrimaryRouting: true
    });

    // Milestone 2: realize each complete estimate against the exact rolling card
    // model. On the first impossible register, keep the physical prefix, prohibit
    // only that impossible next action for that exact prefix history, and estimate
    // a new suffix to the current flag. Any changed arrival causes later legs to
    // be re-estimated from that point forward.
    for (const estimatedEntry of estimatedEntries) {
      const {
        index: sourceIndex,
        start,
        initialContext
      } = estimatedEntry;
      if (!estimatedEntry.estimated.complete) {
        startPartials.push({ index: sourceIndex, start, partials: [] });
        yield { phase: "realized-start", startIndex: sourceIndex };
        continue;
      }

      let estimatedLegs = [...estimatedEntry.estimated.legs];
      let usedRepair = false;
      const seenCandidates = new Set();
      let realizedPartial = null;

      while (estimatedLegs.length === flags.length) {
        const fullTransitions = estimatedLegs.flatMap(
          (leg) => leg?.transitions || []
        );
        const fullActionIds = fullTransitions
          .map((transition) => transition?.action)
          .filter(Boolean);
        const candidateKey = estimatedLegs
          .map((leg) => getEstimatedRouteIdentity(leg))
          .join("||");
        if (seenCandidates.has(candidateKey)) {
          cardRepairRepeatedCandidates += 1;
          const lastLegIndex = estimatedLegs.length - 1;
          const lastLocalIndex = Math.max(
            0,
            (estimatedLegs[lastLegIndex]?.localActionIds?.length ?? 1) - 1
          );
          let alternative = yield* backtrackEstimatedCourseFromPrefix(
            estimatedLegs,
            lastLegIndex,
            lastLocalIndex + 1,
            start,
            sourceIndex,
            initialContext
          );
          if (alternative == null) {
            alternative = yield* findAlternativeEstimatedCourse(
              estimatedLegs,
              lastLegIndex,
              start,
              sourceIndex,
              initialContext
            );
          }
          if (!alternative?.complete) break;
          estimatedLegs = alternative.legs;
          usedRepair = true;
          continue;
        }
        seenCandidates.add(candidateKey);

        exactRealizationAttempts += 1;
        const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
          initialContext.programCardState,
          initialContext.absoluteActions,
          fullActionIds,
          baseRouteOptions,
          initialContext.history,
          getTurnEndAfterActionIndexes(fullTransitions)
        );
        if (cardSolution.feasible) {
          const realized = realizeEstimatedLegsWithCardSolution(
            tileMap,
            estimatedLegs,
            initialContext,
            cardSolution,
            baseRouteOptions
          );
          const fullRoute = realized?.legs?.length === flags.length
            ? stitchContextualLegs(realized.legs, flags)
            : null;
          const validation = fullRoute ? summarizeRouteAgainUsage(fullRoute) : null;
          if (
            fullRoute &&
            validation?.literalProgramViolations === 0 &&
            validation?.rollingWindowViolations === 0
          ) {
            realizedPartial = {
              legs: realized.legs,
              context: realized.context,
              score: realized.score
            };
            if (usedRepair) exactRealizationRepairedSuccesses += 1;
            else exactRealizationDirectSuccesses += 1;
            break;
          }
          finalProgrammingValidationFailures += 1;
          break;
        }

        cardRepairFailurePoints += 1;
        const failureIndex = Math.max(
          0,
          Math.floor(Number(cardSolution.failureIndex) || 0)
        );
        let actionCursor = 0;
        let failureLegIndex = -1;
        let localFailureIndex = -1;
        for (let legIndex = 0; legIndex < estimatedLegs.length; legIndex += 1) {
          const actionCount = estimatedLegs[legIndex]?.localActionIds?.length ?? 0;
          if (failureIndex < actionCursor + actionCount) {
            failureLegIndex = legIndex;
            localFailureIndex = failureIndex - actionCursor;
            break;
          }
          actionCursor += actionCount;
        }
        if (failureLegIndex < 0 || localFailureIndex < 0) break;

        const failedLeg = estimatedLegs[failureLegIndex];
        const failedActionId = failedLeg.localActionIds?.[localFailureIndex] ?? null;
        if (!failedActionId) break;
        const legStartContext = getLegStartPhysicalContext(
          estimatedLegs,
          failureLegIndex,
          initialContext
        );
        const failureState = localFailureIndex > 0
          ? cloneState(failedLeg.transitions[localFailureIndex - 1].to)
          : cloneState(failedLeg.initialState);
        const failureAbsoluteActions = getElapsedAbsoluteActionsAfterTransitions(
          failedLeg.transitions || [],
          failedLeg.absoluteStartAction,
          localFailureIndex
        );
        const prefixActionIds = fullActionIds.slice(0, failureIndex);
        const failureConstraintKey = getEstimatedRouteFailureConstraintKey(
          failureState,
          failureAbsoluteActions,
          prefixActionIds
        );
        let forbiddenActions = forbiddenRepairActionsByConstraint.get(
          failureConstraintKey
        );
        if (!forbiddenActions) {
          forbiddenActions = new Set();
          forbiddenRepairActionsByConstraint.set(
            failureConstraintKey,
            forbiddenActions
          );
        }
        forbiddenActions.add(failedActionId);

        const exactFailureGuidance = getEstimatedDemandStateFromCompactCardState(
          cardSolution.cardState
        );
        const failureContext = {
          ...legStartContext,
          state: failureState,
          absoluteActions: failureAbsoluteActions,
          programCardState: cardSolution.cardState
            ? { ...cardSolution.cardState }
            : null,
          estimatedCardFrontier: cardSolution.cardState
            ? [{ state: { ...cardSolution.cardState }, penalty: 0 }]
            : [],
          estimatedCardForecastFeasible: Boolean(cardSolution.cardState),
          approximatePreviousProgramDemandCode: exactFailureGuidance.previousDemandCode,
          approximateProgramDemandCode: exactFailureGuidance.demandCode,
          approximatePreviousAgainUsed: exactFailureGuidance.previousAgainUsed,
          approximateCurrentAgainUsed: exactFailureGuidance.currentAgainUsed,
          approximatePreviousActionId: exactFailureGuidance.previousActionId
        };
        const suffix = yield* getEstimatedLegRoute(
          failureContext,
          failureLegIndex,
          start,
          sourceIndex,
          false,
          [...forbiddenActions],
          []
        );

        let repairedCourse = null;
        if (suffix) {
          const repairedLeg = combineEstimatedPhysicalRouteSuffix(
            tileMap,
            failedLeg,
            localFailureIndex,
            suffix,
            flags[failureLegIndex],
            dynamicGoals[failureLegIndex] ?? null,
            baseRouteOptions
          );
          const prefixLegs = estimatedLegs.slice(0, failureLegIndex);
          const afterRepairedLeg = getPhysicalContextAfterEstimatedLeg(
            repairedLeg,
            legStartContext
          );
          const rebuilt = yield* buildEstimatedCourseFrom(
            [...prefixLegs, repairedLeg],
            failureLegIndex + 1,
            afterRepairedLeg,
            start,
            sourceIndex
          );
          if (rebuilt.complete) {
            repairedCourse = rebuilt;
          } else {
            cardRepairDownstreamRebuildFailures += 1;
            repairedCourse = yield* findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              sourceIndex,
              initialContext
            );
          }
        } else {
          cardRepairNoSuffix += 1;
          repairedCourse = yield* backtrackEstimatedCourseFromPrefix(
            estimatedLegs,
            failureLegIndex,
            localFailureIndex,
            start,
            sourceIndex,
            initialContext
          );
          if (repairedCourse == null) {
            repairedCourse = yield* findAlternativeEstimatedCourse(
              estimatedLegs,
              failureLegIndex,
              start,
              sourceIndex,
              initialContext
            );
          }
        }

        if (!repairedCourse?.complete) break;
        cardRepairReplans += 1;
        usedRepair = true;
        estimatedLegs = repairedCourse.legs;
      }

      if (realizedPartial) {
        startPartials.push({
          index: sourceIndex,
          start,
          partials: [realizedPartial]
        });
      } else {
        exactRealizationFailures += 1;
        startPartials.push({ index: sourceIndex, start, partials: [] });
      }
      // Cooperative boundary after this start's exact realization/repair work.
      yield { phase: "realized-start", startIndex: sourceIndex };
    }

    const realizedStarts = startPartials.filter(
      (entry) => entry.partials.length
    ).length;
    survivorHistory.push({
      stage: "realized",
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      survivingStarts: realizedStarts,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - realizedStarts),
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      totalCappedContexts: 0,
      distinctCappedStarts: 0,
      estimatedPrimaryRouting: true
    });

    // v49ab pressure-restored iterative traffic feedback -------------------------
    // The intrinsic route is always completed and exactly realized first. Traffic
    // then operates in frozen feedback rounds. All modes use the same final
    // confidence-weighted traffic value and the same minimum useful gain. Slower
    // modes may spend effort on high raw congestion somewhat beyond Standard's
    // confidence horizon, but that relaxed value is search-demand only and can
    // never make a candidate look better in final route selection.
    if (
      options.contextualTrafficFeedbackEnabled &&
      !options.skipTraffic &&
      realizedStarts > 1
    ) {
      const trafficAlternatesEnabled =
        options.contextualTrafficDrivenAlternates !== false;
      const trafficEpochLimit = Math.max(
        0,
        Math.floor(Number(options.contextualTrafficEpochs) || 0)
      );
      const trafficDemandThreshold = Math.max(
        0,
        Number(options.contextualTrafficAlternateDemandThreshold) || 0
      );
      const trafficMinimumGain = Math.max(
        0,
        Number(options.contextualTrafficAlternateMinGain) || 0
      );
      const trafficLegsPerStart = Math.max(
        1,
        Math.floor(Number(options.contextualTrafficAlternateLegsPerStart) || 1)
      );
      const trafficMaxNewSearchesPerEpoch = Math.max(
        0,
        Math.floor(Number(options.contextualTrafficAlternateMaxNewSearchesPerEpoch) || 0)
      );
      const explicitTrafficMaxNewSearchesTotal = Number(
        options.contextualTrafficAlternateMaxNewSearchesTotal
      );
      trafficMaxNewSearchesTotal = Math.max(
        0,
        Math.floor(
          Number.isFinite(explicitTrafficMaxNewSearchesTotal)
            ? explicitTrafficMaxNewSearchesTotal
            : trafficMaxNewSearchesPerEpoch * Math.max(1, trafficEpochLimit)
        )
      );
      let trafficNewSearchesTotal = 0;
      const trafficCachedProbeMargin = Math.max(
        0,
        Number(options.contextualTrafficAlternateCachedProbeMargin) || 0
      );
      const trafficCachedProbeMaxSimilarity = clamp(
        Number(options.contextualTrafficAlternateCachedProbeMaxSimilarity) || 0.84,
        0,
        1
      );
      trafficExplorationUncertaintyShare = clamp(
        Number(options.contextualTrafficExplorationUncertaintyShare) || 0,
        0,
        1
      );
      trafficExplorationConfidenceFloor = clamp(
        Number.isFinite(Number(options.contextualTrafficExplorationConfidenceFloor))
          ? Number(options.contextualTrafficExplorationConfidenceFloor)
          : 1,
        TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
        1
      );

      const makeTrafficTemporaryAnalyses = () => startPartials.map((entry) => {
        const fullCourseRoutes = entry.partials
          .map((partial) => stitchContextualLegs(partial.legs, flags))
          .filter(Boolean)
          .map((route) => applyIntrinsicDamageEconomyRoutingScore(tileMap, route, baseRouteOptions))
          .sort(compareScoredRouteLike);
        const fullCourseRoute = fullCourseRoutes[0] ?? null;
        return buildStartAnalysisForSelectedFullRoute({
          index: entry.index,
          start: entry.start,
          reachable: Boolean(fullCourseRoute),
          fullCourseRoutes,
          fullCourseRoute,
          fullCourseRouteIndex: fullCourseRoute ? 0 : null,
          fullCourseTrafficPenalty: 0
        });
      });

      const getExactContextBeforeTrafficLeg = (
        exactLegs,
        legIndex,
        initialContext
      ) => {
        let context = {
          ...initialContext,
          state: cloneState(initialContext.state),
          history: getProgramHistoryWindow(initialContext.history),
          programCardState: initialContext.programCardState
            ? { ...initialContext.programCardState }
            : null
        };
        for (let index = 0; index < legIndex; index += 1) {
          context = getContextAfterLeg(exactLegs[index], context, tileMap, baseRouteOptions);
        }
        return context;
      };

      const makeEstimatedReplayLeg = (exactLeg, context) => {
        if (!exactLeg) return null;
        const oldCardPenalty = Math.max(
          0,
          Number(exactLeg.cardAvailabilityPenalty) || 0
        );
        const oldProgramPlausibilityPenalty = Math.max(
          0,
          Number(exactLeg.programPlausibilityPenalty) || 0
        );
        return rebaseEstimatedRouteSoftGuidance(
          {
            ...exactLeg,
            score: Number((
              (Number(exactLeg.score) || 0) -
              oldCardPenalty -
              oldProgramPlausibilityPenalty
            ).toFixed(2)),
            cardAvailabilityPenalty: 0,
            programPlausibilityPenalty: 0,
            approximateCardPlausibilityPenalty: 0,
            estimatedCardForecastPenalty: 0
          },
          context
        );
      };

      const realizeTrafficEstimatedCourse = (
        estimatedLegs,
        initialContext
      ) => {
        if (estimatedLegs.length !== flags.length) return null;
        trafficAlternateExactChecks += 1;
        const fullTransitions = estimatedLegs.flatMap(
          (leg) => leg?.transitions || []
        );
        const fullActionIds = fullTransitions
          .map((transition) => transition?.action)
          .filter(Boolean);
        const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
          initialContext.programCardState,
          initialContext.absoluteActions,
          fullActionIds,
          baseRouteOptions,
          initialContext.history,
          getTurnEndAfterActionIndexes(fullTransitions)
        );
        if (!cardSolution.feasible) {
          trafficAlternateExactRejects += 1;
          trafficAlternateCardRejects += 1;
          return null;
        }
        const realized = realizeEstimatedLegsWithCardSolution(
          tileMap,
          estimatedLegs,
          initialContext,
          cardSolution,
          baseRouteOptions
        );
        const stitchedFullRoute = realized?.legs?.length === flags.length
          ? stitchContextualLegs(realized.legs, flags)
          : null;
        const fullRoute = stitchedFullRoute
          ? applyIntrinsicDamageEconomyRoutingScore(tileMap, stitchedFullRoute, baseRouteOptions)
          : null;
        const validation = fullRoute ? summarizeRouteAgainUsage(fullRoute) : null;
        if (
          !fullRoute ||
          validation?.literalProgramViolations !== 0 ||
          validation?.rollingWindowViolations !== 0
        ) {
          trafficAlternateExactRejects += 1;
          trafficAlternateValidationRejects += 1;
          return null;
        }
        return {
          partial: {
            legs: realized.legs,
            context: realized.context,
            score: realized.score
          },
          route: fullRoute
        };
      };

      const getTrafficFullRouteIdentity = (route) => (
        (route?.legRoutes || [])
          .map((leg) => getEstimatedRouteIdentity(leg))
          .join("||")
      );

      const getTrafficFeedbackFieldDelta = (beforeSelection, afterSelection) => {
        const beforeStarts = new Map(
          (beforeSelection?.starts || [])
            .filter((analysis) => analysis?.reachable && analysis?.fullCourseRoute)
            .map((analysis) => [analysis.index, analysis])
        );
        const afterStarts = new Map(
          (afterSelection?.starts || [])
            .filter((analysis) => analysis?.reachable && analysis?.fullCourseRoute)
            .map((analysis) => [analysis.index, analysis])
        );
        const startIndices = new Set([...beforeStarts.keys(), ...afterStarts.keys()]);
        let selectedRouteChanges = 0;
        let mixtureWeightDelta = 0;
        let maximumMixtureWeightDelta = 0;

        const mixtureToMap = (mixture) => new Map(
          (mixture?.entries || []).map((entry) => [
            entry.routeKey ?? String(entry.routeIndex ?? ""),
            Number(entry.weight) || 0
          ])
        );

        for (const index of startIndices) {
          const beforeRoute = beforeStarts.get(index)?.fullCourseRoute ?? null;
          const afterRoute = afterStarts.get(index)?.fullCourseRoute ?? null;
          if (getTrafficFullRouteIdentity(beforeRoute) !== getTrafficFullRouteIdentity(afterRoute)) {
            selectedRouteChanges += 1;
          }
          const beforeMixture = mixtureToMap(
            beforeSelection?.routeMixtureByIndex instanceof Map
              ? beforeSelection.routeMixtureByIndex.get(index)
              : null
          );
          const afterMixture = mixtureToMap(
            afterSelection?.routeMixtureByIndex instanceof Map
              ? afterSelection.routeMixtureByIndex.get(index)
              : null
          );
          const mixtureKeys = new Set([...beforeMixture.keys(), ...afterMixture.keys()]);
          let startDelta = 0;
          for (const key of mixtureKeys) {
            startDelta += Math.abs((beforeMixture.get(key) ?? 0) - (afterMixture.get(key) ?? 0));
          }
          mixtureWeightDelta += startDelta;
          maximumMixtureWeightDelta = Math.max(maximumMixtureWeightDelta, startDelta);
        }

        const occupancyToMap = (selection) => new Map(
          (selection?.commonOccupancyField?.weights || []).map((entry) => [
            entry.index,
            Number(entry.weight) || 0
          ])
        );
        const beforeOccupancy = occupancyToMap(beforeSelection);
        const afterOccupancy = occupancyToMap(afterSelection);
        const occupancyKeys = new Set([...beforeOccupancy.keys(), ...afterOccupancy.keys()]);
        let occupancyWeightDelta = 0;
        for (const key of occupancyKeys) {
          occupancyWeightDelta += Math.abs(
            (beforeOccupancy.get(key) ?? 0) - (afterOccupancy.get(key) ?? 0)
          );
        }

        const materialChange = Boolean(
          selectedRouteChanges > 0 ||
          maximumMixtureWeightDelta > 0.01 ||
          occupancyWeightDelta > 0.01
        );
        return {
          materialChange,
          selectedRouteChanges,
          mixtureWeightDelta: Number(mixtureWeightDelta.toFixed(4)),
          maximumMixtureWeightDelta: Number(maximumMixtureWeightDelta.toFixed(4)),
          occupancyWeightDelta: Number(occupancyWeightDelta.toFixed(4))
        };
      };

      // v49ae reuses the convergence preview as the next round's frozen field.
      // This makes the common evidence-based stop check effectively free of a
      // duplicate select/traffic rebuild. Mode limits below remain ceilings only.
      let preparedTrafficFeedbackRound = null;
      trafficFeedbackStopReason = trafficEpochLimit > 0 ? "round-ceiling" : "no-rounds";

      for (let epoch = 0; epoch < trafficEpochLimit; epoch += 1) {
        const preparedRound = preparedTrafficFeedbackRound;
        preparedTrafficFeedbackRound = null;
        const priorFieldDelta = preparedRound?.fieldDelta ?? null;
        // v49aj worthiness is intentionally conservative. If the prior round changed
        // any selected route identity, fresh geometry stays fully eligible next round
        // because the routing question itself changed. Evidence saturation is only
        // allowed after a mixture/occupancy-only material update.
        const adaptiveEvidenceRound = Boolean(
          epoch > 0 &&
          priorFieldDelta?.materialChange &&
          Number(priorFieldDelta.selectedRouteChanges) === 0
        );
        const roundEvidenceChecksAtStart = trafficAlternateEvidenceCandidateChecks;
        const roundEvidenceStopsAtStart = trafficAlternateEvidenceSaturationStops;
        const temporaryAnalyses = preparedRound?.analyses ?? makeTrafficTemporaryAnalyses();
        const frozenSelection = preparedRound?.selection ?? selectFullCourseRoutesForStarts(
          tileMap,
          temporaryAnalyses,
          flags,
          {
            ...options,
            playerCount,
            fullCourseTrafficPasses: 1
          }
        );
        const frozenStarts = frozenSelection.starts.filter(
          (analysis) => analysis.reachable && analysis.fullCourseRoute
        );
        if (frozenStarts.length <= 1) break;

        trafficEpochsExecuted += 1;
        let epochNewSearches = 0;
        let epochCandidatesAdded = 0;
        let epochBestGain = 0;
        const epochSearchesAtStart = trafficAlternateNewSearches;
        const remainingFeedbackRounds = Math.max(1, trafficEpochLimit - epoch);
        const remainingNewSearchBudget = Math.max(
          0,
          trafficMaxNewSearchesTotal - trafficNewSearchesTotal
        );
        const epochNewSearchLimit = Math.min(
          trafficMaxNewSearchesPerEpoch,
          Math.ceil(remainingNewSearchBudget / remainingFeedbackRounds)
        );
        const selectedRouteByIndex = new Map(
          frozenStarts.map((analysis) => [analysis.index, analysis.fullCourseRoute])
        );
        const frozenRouteMixtureByIndex =
          frozenSelection.routeMixtureByIndex instanceof Map
            ? frozenSelection.routeMixtureByIndex
            : new Map(
              frozenStarts.map((analysis) => [
                analysis.index,
                buildTrafficRouteMixture(analysis, flags)
              ])
            );

        // Traffic-only Dev experiments still run the same confidence-weighted
        // occupancy epoch, but stop before cached-witness or new-geometry work.
        // Final full-course selection below reuses the same traffic model for the
        // balance score, so this cleanly isolates traffic scoring from rerouting.
        if (!trafficAlternatesEnabled) break;

        function* fetchTrafficEstimatedLeg(
          context,
          legIndex,
          start,
          startIndex,
          startupSpinUp = false,
          excludedPathKeys = [],
          effortScale = 1,
          forbiddenFirstActions = []
        ) {
          const dynamicGoal = dynamicGoals[legIndex] ?? null;
          const namespace = options.recoveryRule === "home_reboot"
            ? `start${startIndex}`
            : "shared";
          const cacheKey = getEstimatedLegCacheKey(
            context,
            legIndex,
            dynamicGoal,
            namespace,
            startupSpinUp,
            forbiddenFirstActions,
            excludedPathKeys
          );
          const cached = estimatedLegCache.has(cacheKey);
          if (
            !cached &&
            epochNewSearches >= epochNewSearchLimit
          ) {
            return null;
          }
          const searchesBefore = estimatedLegSearches;
          const route = yield* getEstimatedLegRoute(
            context,
            legIndex,
            start,
            startIndex,
            startupSpinUp,
            forbiddenFirstActions,
            excludedPathKeys,
            "traffic",
            effortScale
          );
          const spent = Math.max(0, estimatedLegSearches - searchesBefore);
          epochNewSearches += spent;
          trafficNewSearchesTotal += spent;
          trafficAlternateNewSearches += spent;
          if (cached && route && spent === 0) trafficAlternateLocalCacheHits += 1;
          if (spent > 0 && !route) trafficAlternateSearchNoRoutes += 1;
          return route;
        }

        function* buildTrafficCourseWithReplacement(
          baselineRoute,
          replacementLeg,
          replacementLegIndex,
          start,
          startIndex,
          parentEffortScale = 1
        ) {
          const baselineLegs = baselineRoute?.legRoutes || [];
          if (baselineLegs.length !== flags.length) return null;
          const initialContext = makeInitialStartContext(start);
          const legStartContext = getExactContextBeforeTrafficLeg(
            baselineLegs,
            replacementLegIndex,
            initialContext
          );
          const estimatedLegs = baselineLegs.slice(0, replacementLegIndex);
          estimatedLegs.push(replacementLeg);
          let context = getPhysicalContextAfterEstimatedLeg(
            replacementLeg,
            legStartContext
          );

          for (
            let legIndex = replacementLegIndex + 1;
            legIndex < flags.length;
            legIndex += 1
          ) {
            const oldLeg = baselineLegs[legIndex] ?? null;
            const canReplayOldLeg = Boolean(
              oldLeg &&
              stateKey(oldLeg.initialState) === stateKey(context.state) &&
              Number(oldLeg.absoluteStartAction) === Number(context.absoluteActions) &&
              (
                options.recoveryRule !== "dynamic_archiving" ||
                getDynamicArchiveStateKey(oldLeg.dynamicArchivePointStart, baseRouteOptions) ===
                  getDynamicArchiveStateKey(context.dynamicArchivePoint, baseRouteOptions)
              )
            );
            let nextLeg = canReplayOldLeg
              ? makeEstimatedReplayLeg(oldLeg, context)
              : null;
            if (!nextLeg) {
              // v49dm: never reintroduce raw hazard exposure while rebuilding
              // a traffic alternate. Carry the already RE-native parent effort
              // envelope and allow only elapsed register horizon to tighten it
              // until the rebuilt alternate has a completed RE ledger of its own.
              const downstreamTimeConfidence = getForecastTimeConfidence(
                getTrafficForecastElapsedRegisters(
                  context.absoluteActions,
                  options
                )
              );
              const downstreamEffortScale = Math.min(
                parentEffortScale,
                getTrafficAlternateEffortScale(
                  downstreamTimeConfidence,
                  options
                )
              );
              nextLeg = yield* fetchTrafficEstimatedLeg(
                context,
                legIndex,
                start,
                startIndex,
                false,
                [],
                downstreamEffortScale
              );
            }
            if (!nextLeg) {
              trafficAlternateDownstreamRebuildFailures += 1;
              return null;
            }
            estimatedLegs.push(nextLeg);
            context = getPhysicalContextAfterEstimatedLeg(nextLeg, context);
          }

          return realizeTrafficEstimatedCourse(estimatedLegs, initialContext);
        }

        const getTrafficHotspotPivot = (
          baselineLeg,
          trafficBreakdown,
          damageHotspotEntry
        ) => {
          const transitions = Array.isArray(baselineLeg?.transitions)
            ? baselineLeg.transitions
            : [];
          if (!transitions.length) {
            return {
              hotspotIndex: 0,
              pivotIndex: 0,
              hotspotPressureRegisterEquivalents: 0,
              hotspotOwner: "none",
              hotspotTurn: null,
              fallbackLegStart: true,
              lookbackRegisters: 0
            };
          }

          const trafficByRegister = Array.isArray(trafficBreakdown?.byRegister)
            ? trafficBreakdown.byRegister
            : [];
          const nearbyTurnEpisodes = Array.isArray(
            trafficBreakdown?.nearbyTurnEpisodeByTurn
          )
            ? trafficBreakdown.nearbyTurnEpisodeByTurn
            : [];

          const nearbyEpisodeByTurn = new Map(
            nearbyTurnEpisodes.map((entry) => [
              Math.max(1, Math.floor(Number(entry?.turn) || 1)),
              Math.max(0, Number(entry?.episodeControlRE) || 0)
            ])
          );

          // Register-local raw control load is used only to locate the causal
          // register *within* an authoritative turn episode. It is not priced
          // directly. Sum it by game turn so the episode RE can be distributed
          // solely for hotspot localization.
          const rawControlLoadByTurn = new Map();
          for (const entry of trafficByRegister) {
            const absoluteAction = Math.max(
              1,
              Math.floor(Number(entry?.absoluteAction) || 1)
            );
            const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
            rawControlLoadByTurn.set(
              turn,
              (rawControlLoadByTurn.get(turn) || 0) +
                Math.max(0, Number(entry?.nearbyControlLoad) || 0)
            );
          }

          const damageByAbsoluteAction = new Map(
            (damageHotspotEntry?.registers || []).map((entry) => [
              Math.max(0, Math.floor(Number(entry?.absoluteAction) || 0)),
              Math.max(0, Number(entry?.pressureRegisterEquivalents) || 0)
            ])
          );

          let elapsed = Math.max(0, Number(baselineLeg.absoluteStartAction) || 0);
          const points = transitions.map((transition, index) => {
            const absoluteAction = getTransitionAbsoluteAction(
              transition,
              elapsed + 1
            );
            elapsed = transition?.rebooted
              ? getRebootEndedAbsoluteActions(absoluteAction)
              : absoluteAction;

            const turn = Math.floor(
              (Math.max(1, absoluteAction) - 1) / REGISTER_COUNT
            ) + 1;
            const trafficRegister = trafficByRegister[index] ?? null;
            const rawControlLoad = Math.max(
              0,
              Number(trafficRegister?.nearbyControlLoad) || 0
            );
            const turnRawControlLoad = Math.max(
              0,
              rawControlLoadByTurn.get(turn) || 0
            );
            const turnEpisodeRE = Math.max(
              0,
              nearbyEpisodeByTurn.get(turn) || 0
            );

            // Distribute the authoritative turn-episode RE only to identify the
            // most causal register within that turn. The summed price remains the
            // turn-level episode value; this share is never used as route cost.
            const nearbyEpisodeShareRE = turnRawControlLoad > 1e-9
              ? turnEpisodeRE * (rawControlLoad / turnRawControlLoad)
              : 0;
            const damageRegisterEquivalents =
              damageByAbsoluteAction.get(absoluteAction) ?? 0;

            const nearbyWins = nearbyEpisodeShareRE >= damageRegisterEquivalents;
            return {
              index,
              absoluteAction,
              turn,
              nearbyEpisodeShareRE,
              turnEpisodeRE,
              damageRegisterEquivalents,
              pressureRegisterEquivalents: Math.max(
                nearbyEpisodeShareRE,
                damageRegisterEquivalents
              ),
              pressureOwner: nearbyWins ? "nearby-control" : "damage"
            };
          });

          const maximumPressure = Math.max(
            0,
            ...points.map((entry) => entry.pressureRegisterEquivalents)
          );
          if (maximumPressure <= 0) {
            return {
              hotspotIndex: 0,
              pivotIndex: 0,
              hotspotPressureRegisterEquivalents: 0,
              hotspotOwner: "none",
              hotspotTurn: null,
              fallbackLegStart: true,
              lookbackRegisters: 0
            };
          }

          // Prefer the earliest register in the hottest 10% band. For nearby
          // turn-episode traffic, additionally give the branch one register of
          // lead time before the first materially exposed register in that turn.
          const hotspot = points.find(
            (entry) => entry.pressureRegisterEquivalents >= maximumPressure * 0.9
          ) ?? points[0];

          let lookbackRegisters = 1;
          if (
            hotspot.pressureOwner === "damage" &&
            hotspot.damageRegisterEquivalents >=
              DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE - 0.0005
          ) {
            lookbackRegisters = 2;
          }

          let causalIndex = hotspot.index;
          if (hotspot.pressureOwner === "nearby-control") {
            const sameTurnPoints = points.filter(
              (entry) => entry.turn === hotspot.turn &&
                entry.nearbyEpisodeShareRE > 0
            );
            if (sameTurnPoints.length) {
              causalIndex = sameTurnPoints[0].index;
            }
          }

          const pivotIndex = Math.max(0, causalIndex - lookbackRegisters);
          return {
            hotspotIndex: hotspot.index,
            pivotIndex,
            hotspotPressureRegisterEquivalents:
              hotspot.pressureRegisterEquivalents,
            hotspotOwner: hotspot.pressureOwner,
            hotspotTurn: hotspot.turn,
            fallbackLegStart: false,
            lookbackRegisters
          };
        };

        const getTrafficPivotEstimatedContext = (
          baselineLeg,
          legStartContext,
          pivotIndex
        ) => {
          const transitions = Array.isArray(baselineLeg?.transitions)
            ? baselineLeg.transitions
            : [];
          const actions = Array.isArray(baselineLeg?.localActionIds)
            ? baselineLeg.localActionIds
            : transitions.map((transition) => transition?.action).filter(Boolean);
          const pivot = Math.max(0, Math.min(
            transitions.length,
            Math.floor(Number(pivotIndex) || 0)
          ));
          if (pivot === 0) {
            return {
              ...legStartContext,
              state: cloneState(legStartContext.state),
              dynamicArchivePoint: legStartContext.dynamicArchivePoint
                ? { ...legStartContext.dynamicArchivePoint }
                : null
            };
          }
          const prefixTransitions = transitions.slice(0, pivot);
          const prefixActions = actions.slice(0, pivot);
          const guidanceContext = getEstimatedContextAfterActionPrefix(
            legStartContext,
            prefixActions,
            prefixTransitions
          );
          const pivotState = cloneState(prefixTransitions.at(-1)?.to ?? baselineLeg.initialState);
          const pivotAbsoluteActions = getElapsedAbsoluteActionsAfterTransitions(
            transitions,
            baselineLeg.absoluteStartAction ?? legStartContext.absoluteActions,
            pivot
          );
          const prefixRoute = buildEstimatedPhysicalRouteFromTransitions(
            tileMap,
            baselineLeg.initialState,
            prefixTransitions,
            baselineLeg.absoluteStartAction ?? legStartContext.absoluteActions,
            pivotState,
            null,
            {
              ...baseRouteOptions,
              dynamicArchivePointStart: legStartContext.dynamicArchivePoint ?? null,
              dynamicArchivePointEnd: guidanceContext.dynamicArchivePoint ?? null,
              searchIntrinsicMentalEventCountStart:
                legStartContext.searchIntrinsicMentalEventCountCurrentTurn ?? 0,
              searchHomingMissileActivatedSpacesCurrentTurn:
                legStartContext.searchHomingMissileActivatedSpacesCurrentTurn ?? [],
              searchMentalCheckpointAtEnd: false
            }
          );
          const prefixEconomy = replayContextualRouteEnergyForContext(
            tileMap,
            prefixRoute,
            legStartContext,
            baseRouteOptions
          );
          const prefixHazard = prefixTransitions.reduce(
            (sum, transition) => sum + Math.max(0, Number(transition?.hazard) || 0),
            0
          );
          return {
            ...guidanceContext,
            state: pivotState,
            absoluteActions: pivotAbsoluteActions,
            hazardExposure:
              Math.max(0, Number(legStartContext?.hazardExposure) || 0) + prefixHazard,
            energyReserve: Number.isFinite(Number(prefixEconomy?.routeEnergyShadowReserveEnd))
              ? Number(prefixEconomy.routeEnergyShadowReserveEnd)
              : legStartContext?.energyReserve ?? null
          };
        };

        const trafficSearchPriorityStarts = [...frozenStarts].sort((left, right) => (
          (Number(right?.fullCourseTrafficPenalty) || 0) -
            (Number(left?.fullCourseTrafficPenalty) || 0) ||
          (Number(left?.index) || 0) - (Number(right?.index) || 0)
        ));

        for (const analysis of trafficSearchPriorityStarts) {
          const baselineRoute = selectedRouteByIndex.get(analysis.index);
          if (!baselineRoute?.legRoutes?.length) continue;
          const occupancyByIndex = buildConditionalOccupancyMap(
            frozenStarts,
            analysis.index,
            playerCount,
            options,
            (other) => selectedRouteByIndex.get(other.index)
          );
          const otherRouteEntries = buildTrafficRouteMixtureEntries(
            frozenStarts,
            analysis.index,
            occupancyByIndex,
            frozenRouteMixtureByIndex
          );
          const baselineBreakdown = getExpectedTrafficBreakdown(
            tileMap,
            baselineRoute,
            otherRouteEntries,
            flags,
            options
          );
          const frozenTrafficAnalyses = frozenStarts.map((entry) => ({
            ...entry,
            fullCourseRoute: selectedRouteByIndex.get(entry.index) ?? entry.fullCourseRoute,
            trafficRouteMixture:
              frozenRouteMixtureByIndex.get(entry.index) ?? entry.trafficRouteMixture ?? null
          }));
          const baselineRoutingTraffic = getDamageEconomyTrafficRoutingBreakdown(
            tileMap,
            baselineRoute,
            baselineBreakdown,
            frozenTrafficAnalyses,
            analysis.index,
            flags,
            {
              ...options,
              playerCount,
              trafficRouteMixtureByIndex: frozenRouteMixtureByIndex,
              includeTrafficAlternateHotspots: true
            }
          );
          const legBreakdowns =
            baselineRoutingTraffic.byLeg ||
            baselineBreakdown.byLeg ||
            [];
          const demandedLegs = legBreakdowns
            .map((breakdown, legIndex) => {
              const legWeight = legIndex === 0
                ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
                : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
              const weightedTraffic = breakdown.total * legWeight;
              const weightedRawTraffic = (breakdown.rawTotal ?? breakdown.total) * legWeight;
              const confidence = Number(breakdown.confidenceMean) || 0;
              // Balanced/Thorough may use some of the uncertainty-discounted gap
              // solely to decide whether a leg deserves investigation. This does
              // not flow into candidate gain or final route selection.
              const explorationEligible = Boolean(
                trafficExplorationUncertaintyShare > 0 &&
                confidence >= trafficExplorationConfidenceFloor &&
                weightedRawTraffic > weightedTraffic
              );
              const explorationTraffic = explorationEligible
                ? weightedTraffic +
                  (weightedRawTraffic - weightedTraffic) * trafficExplorationUncertaintyShare
                : weightedTraffic;
              const pressureEntry =
                baselineRoutingTraffic.damageEconomyAlternatePressureByLeg?.[legIndex] ?? null;
              const pressureRegisterEquivalents = Math.max(
                0,
                Number(pressureEntry?.pressureRegisterEquivalents) || 0
              );
              const pressureStrength = getTrafficAlternateHardPressureStrength(
                pressureRegisterEquivalents
              );
              // A full 5-RE shutdown-sized state can restore enough demand to
              // investigate a late leg even when ordinary confidence-weighted
              // traffic has decayed below the threshold. This is demand-only: the
              // candidate's gain below still uses the unchanged confidence-weighted
              // traffic and full exact damage replay.
              const pressureDemandScore = pressureStrength * trafficDemandThreshold;
              const dynamicDemandTraffic = explorationTraffic + pressureDemandScore;
              const demandKind = weightedTraffic >= trafficDemandThreshold
                ? "effective"
                : explorationTraffic >= trafficDemandThreshold
                  ? "exploratory"
                  : dynamicDemandTraffic >= trafficDemandThreshold
                    ? "pressure"
                    : null;
              const baseEffortScale = getTrafficAlternateEffortScale(confidence, options);
              const effortScale =
                restoreRENativeTrafficAlternateEffortForDamagePressure(
                  baseEffortScale,
                  pressureRegisterEquivalents
                );
              const hotspot = getTrafficHotspotPivot(
                baselineRoute.legRoutes?.[legIndex] ?? null,
                breakdown,
                baselineRoutingTraffic.damageEconomyAlternateHotspotsByLeg?.[legIndex] ?? null
              );
              return {
                legIndex,
                breakdown,
                weightedTraffic,
                weightedRawTraffic,
                explorationTraffic,
                dynamicDemandTraffic,
                pressureDemandScore,
                pressureRegisterEquivalents,
                pressureStrength,
                hotspot,
                demandKind,
                baseEffortScale,
                effortScale,
                effortPriority: dynamicDemandTraffic * effortScale
              };
            })
            .filter((entry) => entry.demandKind)
            .sort((left, right) => (
              right.effortPriority - left.effortPriority ||
              right.dynamicDemandTraffic - left.dynamicDemandTraffic ||
              right.explorationTraffic - left.explorationTraffic ||
              right.weightedTraffic - left.weightedTraffic
            ))
            .slice(0, trafficLegsPerStart);
          if (!demandedLegs.length) continue;
          trafficAlternateDemandStarts += 1;
          trafficAlternateDemandLegs += demandedLegs.length;
          demandedLegs.forEach((entry) => {
            trafficAlternateDemandByLeg[entry.legIndex] += 1;
            trafficAlternateBaseEffortScaleSum += entry.baseEffortScale;
            trafficAlternateEffortRestorationSum += Math.max(
              0,
              entry.effortScale - entry.baseEffortScale
            );
            trafficAlternateEffortScaleSum += entry.effortScale;
            trafficAlternateEffortScaleCount += 1;
            trafficAlternatePressureRegisterEquivalentsSum +=
              entry.pressureRegisterEquivalents;
            trafficAlternatePressureRegisterEquivalentsCount += 1;
            trafficAlternateMaximumPressureRegisterEquivalents = Math.max(
              trafficAlternateMaximumPressureRegisterEquivalents,
              entry.pressureRegisterEquivalents
            );
            if (entry.effortScale > entry.baseEffortScale + 0.0005) {
              trafficAlternatePressureRestoredLegs += 1;
            }
            trafficAlternateMinimumEffortScale = Math.min(
              trafficAlternateMinimumEffortScale,
              entry.effortScale
            );
            if (entry.demandKind === "exploratory") {
              trafficAlternateExploratoryDemandLegs += 1;
            } else if (entry.demandKind === "pressure") {
              trafficAlternatePressureDemandLegs += 1;
            } else {
              trafficAlternateEffectiveDemandLegs += 1;
            }
          });

          const startEntry = startPartials.find(
            (entry) => entry.index === analysis.index
          );
          if (!startEntry) continue;
          const existingFullRouteIds = new Set(
            startEntry.partials
              .map((partial) => stitchContextualLegs(partial.legs, flags))
              .filter(Boolean)
              .map(getTrafficFullRouteIdentity)
          );
          let bestCandidate = null;
          let bestCandidateLegIndex = -1;
          let bestCandidateFromEvidence = false;
          let bestGain = -Infinity;
          const evidenceGainByLeg = new Map();
          const evidenceReplacementIdsByLeg = new Map();

          const scoreRealizedTrafficCandidate = (realized) => {
            if (!realized?.route) return null;
            const candidateTrafficLegacy = getExpectedTrafficBreakdown(
              tileMap,
              realized.route,
              otherRouteEntries,
              flags,
              options
            );
            const candidateTraffic = getDamageEconomyTrafficRoutingBreakdown(
              tileMap,
              realized.route,
              candidateTrafficLegacy,
              frozenTrafficAnalyses,
              analysis.index,
              flags,
              {
                ...options,
                playerCount,
                trafficRouteMixtureByIndex: frozenRouteMixtureByIndex
              }
            );
            return (
              baselineRoute.score + baselineRoutingTraffic.total
            ) - (
              realized.route.score + candidateTraffic.total
            );
          };

          const rememberEvidenceCandidate = (realized, legIndex, replacementId) => {
            if (!realized?.route) return;
            const fullIdentity = getTrafficFullRouteIdentity(realized.route);
            if (!fullIdentity || existingFullRouteIds.has(fullIdentity)) return;
            let pool = trafficAlternateEvidenceCandidatesByStart.get(analysis.index);
            if (!pool) {
              pool = new Map();
              trafficAlternateEvidenceCandidatesByStart.set(analysis.index, pool);
            }
            if (pool.has(fullIdentity)) return;
            pool.set(fullIdentity, {
              realized,
              legIndex,
              replacementId,
              fullIdentity
            });
            trafficAlternateEvidenceCandidatesStored += 1;
          };

          // Only after a mixture/occupancy-only material update do we treat prior
          // exact low-gain alternates as search-worthiness evidence. Re-price them
          // under the current frozen field; if one has become useful it can be
          // promoted without any new physical search. Accepted/selectable routes are
          // filtered above, so this pool cannot silently dilute route mixtures.
          if (adaptiveEvidenceRound) {
            const evidencePool = trafficAlternateEvidenceCandidatesByStart.get(analysis.index);
            for (const evidence of evidencePool?.values() || []) {
              if (!evidence?.realized?.route || existingFullRouteIds.has(evidence.fullIdentity)) continue;
              trafficAlternateEvidenceCandidateChecks += 1;
              const gain = scoreRealizedTrafficCandidate(evidence.realized);
              if (!Number.isFinite(gain)) continue;
              let gains = evidenceGainByLeg.get(evidence.legIndex);
              if (!gains) {
                gains = [];
                evidenceGainByLeg.set(evidence.legIndex, gains);
              }
              gains.push(gain);
              let replacementIds = evidenceReplacementIdsByLeg.get(evidence.legIndex);
              if (!replacementIds) {
                replacementIds = new Set();
                evidenceReplacementIdsByLeg.set(evidence.legIndex, replacementIds);
              }
              if (evidence.replacementId) replacementIds.add(evidence.replacementId);
              if (gain > bestGain) {
                bestGain = gain;
                bestCandidate = evidence.realized;
                bestCandidateLegIndex = evidence.legIndex;
                bestCandidateFromEvidence = true;
              }
            }
          }

          for (const demanded of demandedLegs) {
            const legIndex = demanded.legIndex;
            const baselineLeg = baselineRoute.legRoutes[legIndex];
            if (!baselineLeg) continue;
            const initialContext = makeInitialStartContext(startEntry.start);
            const legStartContext = getExactContextBeforeTrafficLeg(
              baselineRoute.legRoutes,
              legIndex,
              initialContext
            );
            const dynamicGoal = dynamicGoals[legIndex] ?? null;
            const namespace = options.recoveryRule === "home_reboot"
              ? `start${analysis.index}`
              : "shared";
            const baseCacheKey = getEstimatedLegCacheKey(
              legStartContext,
              legIndex,
              dynamicGoal,
              namespace,
              Boolean(legIndex === 0 && options.startupSpinUp),
              [],
              []
            );
            const baselineLegId = getEstimatedRouteIdentity(baselineLeg);
            const cachedWitnesses = (estimatedLegCache.get(baseCacheKey) || [])
              .map((route) => rebaseEstimatedRouteSoftGuidance(route, legStartContext))
              .filter(Boolean)
              .filter((route) => getEstimatedRouteIdentity(route) !== baselineLegId)
              .sort(compareScoredRouteLike);
            // Reuse already-paid whole-leg witnesses as cheap evidence. In v49ad a
            // poor whole-leg witness may suppress another leg-start search, but it may
            // NOT veto a true mid-leg hotspot suffix: that is a different geometry
            // question. This remains optional breadth only and never changes physical
            // reachability or exact card legality.
            const divergentCachedWitnesses = cachedWitnesses.filter((route) => (
              routeSimilarity(baselineLeg, route, flags[legIndex]) <=
              trafficCachedProbeMaxSimilarity
            ));
            const attemptedLegIds = new Set([
              baselineLegId,
              ...(evidenceReplacementIdsByLeg.get(legIndex) || [])
            ]);

            function* evaluateReplacement(replacementLeg) {
              if (!replacementLeg) return null;
              const replacementId = getEstimatedRouteIdentity(replacementLeg);
              if (attemptedLegIds.has(replacementId)) return null;
              attemptedLegIds.add(replacementId);
              const realized = yield* buildTrafficCourseWithReplacement(
                baselineRoute,
                replacementLeg,
                legIndex,
                startEntry.start,
                analysis.index,
                demanded.effortScale
              );
              if (!realized?.route) return null;
              const fullIdentity = getTrafficFullRouteIdentity(realized.route);
              if (!fullIdentity || existingFullRouteIds.has(fullIdentity)) {
                trafficAlternateDuplicateRejects += 1;
                return null;
              }
              rememberEvidenceCandidate(realized, legIndex, replacementId);
              const gain = scoreRealizedTrafficCandidate(realized);
              if (!Number.isFinite(gain)) return null;
              if (trafficAlternateGainTrace.length < 24) {
                trafficAlternateGainTrace.push({
                  epoch: epoch + 1,
                  startIndex: analysis.index,
                  legIndex,
                  gain: Number(gain.toFixed(3)),
                  minimumUsefulGain: Number(trafficMinimumGain.toFixed(3)),
                  acceptedByGain: gain >= trafficMinimumGain
                });
              }
              if (gain < trafficMinimumGain) trafficAlternateLowGainRejects += 1;
              if (gain > bestGain) {
                bestGain = gain;
                bestCandidate = realized;
                bestCandidateLegIndex = legIndex;
                bestCandidateFromEvidence = false;
              }
              return gain;
            }

            let cachedProbeBestGain = -Infinity;
            for (const cachedWitness of divergentCachedWitnesses) {
              trafficAlternateCachedWitnessChecks += 1;
              const gain = yield* evaluateReplacement(cachedWitness);
              if (Number.isFinite(gain)) cachedProbeBestGain = Math.max(cachedProbeBestGain, gain);
            }

            const pressureAdjustedProbeMargin =
              trafficCachedProbeMargin +
              demanded.pressureStrength * trafficMinimumGain;
            const cachedProbeClearlyPoor = Boolean(
              (demanded.hotspot?.pivotIndex ?? 0) === 0 &&
              divergentCachedWitnesses.length > 0 &&
              Number.isFinite(cachedProbeBestGain) &&
              cachedProbeBestGain < trafficMinimumGain - pressureAdjustedProbeMargin
            );
            const exactEvidenceGains = evidenceGainByLeg.get(legIndex) || [];
            const exactEvidenceBestGain = exactEvidenceGains.length
              ? Math.max(...exactEvidenceGains)
              : -Infinity;
            // Two distinct exact alternates for this leg, re-priced under the current
            // field and still clearly below the existing gain threshold, are enough
            // to call the local evidence saturated for this mixture-only update. A
            // shutdown-sized pressure state automatically makes the "clearly poor"
            // bar much harder to satisfy via the same pressure-adjusted margin used
            // by the established cached-probe rule.
            const exactEvidenceClearlyPoor = Boolean(
              adaptiveEvidenceRound &&
              exactEvidenceGains.length >= 2 &&
              Number.isFinite(exactEvidenceBestGain) &&
              exactEvidenceBestGain < trafficMinimumGain - pressureAdjustedProbeMargin
            );
            if (cachedProbeClearlyPoor) {
              trafficAlternateCachedProbeStops += 1;
            } else if (bestGain >= trafficMinimumGain) {
              // Existing paid geometry already supplies a useful alternate under the
              // current frozen field. Do not spend a fresh hotspot search merely to
              // rediscover that the start has viable route choice.
              trafficAlternateCachedUsefulStops += 1;
            } else if (exactEvidenceClearlyPoor) {
              trafficAlternateEvidenceSaturationStops += 1;
            } else if (epochNewSearches < epochNewSearchLimit) {
              const hotspot = demanded.hotspot ?? {
                hotspotIndex: 0,
                pivotIndex: 0,
                fallbackLegStart: true,
                lookbackRegisters: 0
              };
              const pivotIndex = Math.max(
                0,
                Math.min(
                  baselineLeg.transitions?.length ?? 0,
                  Math.floor(Number(hotspot.pivotIndex) || 0)
                )
              );
              const pivotContext = getTrafficPivotEstimatedContext(
                baselineLeg,
                legStartContext,
                pivotIndex
              );
              const baselineActions = Array.isArray(baselineLeg.localActionIds)
                ? baselineLeg.localActionIds
                : (baselineLeg.transitions || []).map((transition) => transition?.action).filter(Boolean);
              const baselinePivotAction = baselineActions[pivotIndex] ?? null;
              const forbiddenFirstActions = baselinePivotAction
                ? [baselinePivotAction]
                : [];
              const searchEnvelope = getTrafficAlternateSearchEnvelope(
                demanded.effortScale,
                options
              );
              // v49ai traffic-only negative evidence reservoir. A bounded optional
              // miss is not a physical-unreachability verdict and never enters the
              // shared route cache. It only records that this exact deterministic
              // hotspot query has already been tried to at least this search depth.
              // If a later round asks for more effort, the query is allowed to run
              // again at the deeper envelope.
              const negativeEvidenceKey = [
                `start${analysis.index}`,
                `leg${legIndex}`,
                getTrafficFullRouteIdentity(baselineRoute),
                baselineLegId,
                `pivot${pivotIndex}`,
                `ban${[...forbiddenFirstActions].sort().join(",") || "-"}`,
                `a${searchEnvelope.maxActions}`
              ].join("|");
              const priorNegativeEvidence =
                trafficAlternateNegativeSearchEvidence.get(negativeEvidenceKey) ?? null;
              if (priorNegativeEvidence) {
                trafficAlternateRepeatedMissEvidenceChecks += 1;
              }
              const repeatedMissCovered = Boolean(
                priorNegativeEvidence &&
                priorNegativeEvidence.maxExpansions >= searchEnvelope.maxExpansions &&
                priorNegativeEvidence.maxActions >= searchEnvelope.maxActions
              );
              if (repeatedMissCovered) {
                trafficAlternateRepeatedMissEvidenceStops += 1;
              } else {
                if (priorNegativeEvidence) {
                  trafficAlternateRepeatedMissEvidenceDeeperRetries += 1;
                }
                trafficAlternateEscalations += 1;
                trafficAlternateHotspotLocalSearches += 1;
                if (trafficAlternateSearchTrace.length < 16) {
                  trafficAlternateSearchTrace.push({
                    epoch: epoch + 1,
                    startIndex: analysis.index,
                    legIndex,
                    priorityTraffic: Number(
                      (Number(analysis.fullCourseTrafficPenalty) || 0).toFixed(2)
                    ),
                    pivotIndex,
                    hotspotIndex: hotspot.hotspotIndex ?? null,
                    hotspotTurn: hotspot.hotspotTurn ?? null,
                    hotspotOwner: hotspot.hotspotOwner ?? "unknown",
                    hotspotPressureRE: Number(
                      (Number(hotspot.hotspotPressureRegisterEquivalents) || 0).toFixed(3)
                    ),
                    effortScale: Number(demanded.effortScale.toFixed(3))
                  });
                }
                trafficAlternateHotspotPrefixActionsSum += pivotIndex;
                trafficAlternateHotspotPrefixActionsCount += 1;
                trafficAlternateHotspotMaximumPrefixActions = Math.max(
                  trafficAlternateHotspotMaximumPrefixActions,
                  pivotIndex
                );
                if (hotspot.fallbackLegStart) {
                  trafficAlternateHotspotFallbackLegStarts += 1;
                }
                if (hotspot.lookbackRegisters >= 2) {
                  trafficAlternateHotspotTwoRegisterLookbacks += 1;
                }
                const searchesBeforeHotspot = trafficAlternateNewSearches;
                const suffix = yield* fetchTrafficEstimatedLeg(
                  pivotContext,
                  legIndex,
                  startEntry.start,
                  analysis.index,
                  Boolean(legIndex === 0 && pivotIndex === 0 && options.startupSpinUp),
                  [],
                  demanded.effortScale,
                  forbiddenFirstActions
                );
                const hotspotSearchesSpent = Math.max(
                  0,
                  trafficAlternateNewSearches - searchesBeforeHotspot
                );
                if (!suffix && hotspotSearchesSpent > 0) {
                  const existingEvidence =
                    trafficAlternateNegativeSearchEvidence.get(negativeEvidenceKey) ?? null;
                  trafficAlternateNegativeSearchEvidence.set(negativeEvidenceKey, {
                    maxExpansions: Math.max(
                      Number(existingEvidence?.maxExpansions) || 0,
                      searchEnvelope.maxExpansions
                    ),
                    maxActions: Math.max(
                      Number(existingEvidence?.maxActions) || 0,
                      searchEnvelope.maxActions
                    )
                  });
                }
                const alternate = suffix
                  ? combineEstimatedPhysicalRouteSuffix(
                    tileMap,
                    baselineLeg,
                    pivotIndex,
                    suffix,
                    flags[legIndex],
                    dynamicGoals[legIndex] ?? null,
                    baseRouteOptions
                  )
                  : null;
                yield* evaluateReplacement(alternate);
              }
            }
          }

          if (bestCandidate && bestGain >= trafficMinimumGain) {
            if (bestCandidateFromEvidence) {
              trafficAlternateEvidenceCandidatesPromoted += 1;
            }
            startEntry.partials.push(bestCandidate.partial);
            trafficAlternateCandidatesAdded += 1;
            trafficAlternateBeneficialCandidates += 1;
            if (bestCandidateLegIndex >= 0) {
              trafficAlternateCandidatesByLeg[bestCandidateLegIndex] += 1;
            }
            trafficAlternateBestGain = Math.max(
              trafficAlternateBestGain,
              bestGain
            );
            epochBestGain = Math.max(epochBestGain, bestGain);
            epochCandidatesAdded += 1;
          }
          yield { phase: "traffic-start", startIndex: analysis.index, epoch };
        }

        const roundSummary = {
          round: epoch + 1,
          newSearches: trafficAlternateNewSearches - epochSearchesAtStart,
          candidatesAdded: epochCandidatesAdded,
          bestGain: Number(epochBestGain.toFixed(2)),
          adaptiveEvidence: adaptiveEvidenceRound,
          evidenceChecks: trafficAlternateEvidenceCandidateChecks - roundEvidenceChecksAtStart,
          evidenceStops: trafficAlternateEvidenceSaturationStops - roundEvidenceStopsAtStart,
          selectedRouteChanges: 0,
          mixtureWeightDelta: 0,
          occupancyWeightDelta: 0,
          fieldChanged: false,
          stopReason: null
        };

        if (!epochCandidatesAdded) {
          const evidenceSaturatedWithoutSearch = Boolean(
            roundSummary.adaptiveEvidence &&
            roundSummary.evidenceStops > 0 &&
            roundSummary.newSearches === 0
          );
          trafficFeedbackStopReason = evidenceSaturatedWithoutSearch
            ? "evidence-saturated"
            : "no-new-candidate";
          roundSummary.stopReason = trafficFeedbackStopReason;
          trafficFeedbackRoundSummaries.push(roundSummary);
          break;
        }

        if (epoch + 1 >= trafficEpochLimit) {
          trafficFeedbackStopReason = "round-ceiling";
          roundSummary.stopReason = trafficFeedbackStopReason;
          trafficFeedbackRoundSummaries.push(roundSummary);
          break;
        }

        const previewAnalyses = makeTrafficTemporaryAnalyses();
        const previewSelection = selectFullCourseRoutesForStarts(
          tileMap,
          previewAnalyses,
          flags,
          {
            ...options,
            playerCount,
            fullCourseTrafficPasses: 1
          }
        );
        const fieldDelta = getTrafficFeedbackFieldDelta(
          frozenSelection,
          previewSelection
        );
        trafficFeedbackConvergenceChecks += 1;
        roundSummary.selectedRouteChanges = fieldDelta.selectedRouteChanges;
        roundSummary.mixtureWeightDelta = fieldDelta.mixtureWeightDelta;
        roundSummary.occupancyWeightDelta = fieldDelta.occupancyWeightDelta;
        roundSummary.fieldChanged = fieldDelta.materialChange;

        if (!fieldDelta.materialChange) {
          trafficFeedbackConvergedRounds += 1;
          trafficFeedbackStopReason = "field-converged";
          roundSummary.stopReason = trafficFeedbackStopReason;
          trafficFeedbackRoundSummaries.push(roundSummary);
          break;
        }

        trafficFeedbackRoundSummaries.push(roundSummary);
        preparedTrafficFeedbackRound = {
          analyses: previewAnalyses,
          selection: previewSelection,
          fieldDelta
        };
      }
    }

    // Only after every start has completed both milestones may the ordinary
    // player-count acceptance floor reject the course.
    if (earlyExitEnabled && realizedStarts < requiredSurvivingStarts) {
      throwCapacityLost(
        Math.max(0, flags.length - 1),
        makeSurvivorSnapshot(Math.max(0, flags.length - 1), {
          survivingStarts: realizedStarts,
          maximumPossibleStarts: realizedStarts,
          processedStartsThisLeg: starts.length
        })
      );
    }
  } else {
  const openingUnresolvedCaps = [];
  let openingSurvivors = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const sourceIndex = Number.isInteger(start.analysisIndex)
      ? start.analysisIndex
      : index;
    const context = {
      state: {
        x: start.x,
        y: start.y,
        facing: start.facing ?? "E"
      },
      absoluteActions: 0,
      history: [],
      programCardState: {
        feasible: true,
        previousCode: 0,
        currentCode: 0,
        previousActionId: null
      },
      energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
      upgradeCardUnits: null,
      hazardExposure: 0,
      reNativeAdverseRE: 0
    };
    const openingSeed = openingSeedByIndex.get(sourceIndex) ?? null;
    const normalizedSeedRoute = normalizeOpeningSeedRoute(
      openingSeed?.selectedRoute ?? openingSeed?.routes?.[0] ?? null
    );
    const seededRoute = normalizedSeedRoute
      ? rebaseContextualCachedRoute(
        tileMap,
        normalizedSeedRoute,
        context,
        baseRouteOptions
      )
      : null;
    let openingRoutes = null;
    if (seededRoute) {
      seededOpeningStarts += 1;
      openingRoutes = [seededRoute];
    } else {
      openingRoutes = getLegRoutes(
        context,
        0,
        start,
        sourceIndex,
        Boolean(options.startupSpinUp)
      );
    }
    const partials = openingRoutes.map((route) => ({
      legs: [route],
      context: getContextAfterLeg(route, context, tileMap, baseRouteOptions),
      score: route.score
    }));
    let selectedPartials = selectContextualPartialBeam(
      partials,
      flags[0],
      getContextualBeamWidthForPartials(
        partials,
        options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
        baseRouteOptions
      ),
      {
        wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
        flags: flags.slice(0, 1)
      }
    );
    if (selectedPartials.length) openingSurvivors += 1;
    const startEntry = {
      index: sourceIndex,
      start,
      partials: selectedPartials
    };
    startPartials.push(startEntry);
    if (!selectedPartials.length && isUnresolvedCappedRouteSet(openingRoutes)) {
      openingUnresolvedCaps.push({
        entry: startEntry,
        context,
        start,
        startIndex: sourceIndex,
        startupSpinUp: Boolean(options.startupSpinUp),
        searchMeta: openingRoutes.contextualSearchMeta ?? null,
        attempted: false
      });
    }

    const remainingStarts = starts.length - index - 1;
    let maximumPossibleStarts = openingSurvivors + remainingStarts;

    // A capped zero-route search is unresolved. Only when treating those capped
    // starts as losses would make the player-count floor impossible do we spend
    // the larger rescue budget, stopping as soon as capacity is restored.
    if (
      earlyExitEnabled &&
      maximumPossibleStarts < requiredSurvivingStarts
    ) {
      for (const unresolved of openingUnresolvedCaps) {
        if (unresolved.attempted || unresolved.entry.partials.length) continue;
        unresolved.attempted = true;
        const rescuedRoutes = runCapacityRescue(
          unresolved.context,
          0,
          unresolved.start,
          unresolved.startIndex,
          unresolved.startupSpinUp,
          unresolved.searchMeta
        );
        if (rescuedRoutes.length) {
          const rescuedPartials = rescuedRoutes.map((route) => ({
            legs: [route],
            context: getContextAfterLeg(route, unresolved.context, tileMap, baseRouteOptions),
            score: route.score
          }));
          unresolved.entry.partials = selectContextualPartialBeam(
            rescuedPartials,
            flags[0],
            getContextualBeamWidthForPartials(
              rescuedPartials,
              options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
              baseRouteOptions
            ),
            {
              wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
              flags: flags.slice(0, 1)
            }
          );
        }
        openingSurvivors = startPartials.filter((candidate) => candidate.partials.length).length;
        maximumPossibleStarts = openingSurvivors + remainingStarts;
        if (maximumPossibleStarts >= requiredSurvivingStarts) break;
      }
    }

    // v17 safe capacity short-circuit remains exact after all currently relevant
    // unresolved capped starts have had their one rescue attempt.
    if (
      earlyExitEnabled &&
      maximumPossibleStarts < requiredSurvivingStarts
    ) {
      throwCapacityLost(
        0,
        makeSurvivorSnapshot(0, {
          survivingStarts: openingSurvivors,
          maximumPossibleStarts,
          processedStartsThisLeg: index + 1
        })
      );
    }

    if (
      stopWhenPreferredLost &&
      remainingStarts > 0 &&
      openingSurvivors >= requiredSurvivingStarts &&
      maximumPossibleStarts < preferredSurvivingStarts
    ) {
      preferredCapacityShortCircuits += 1;
      break;
    }
    yield { phase: "opening-start", startIndex: sourceIndex };
  }

  if (startPartials.length < starts.length) {
    for (let index = startPartials.length; index < starts.length; index += 1) {
      const start = starts[index];
      startPartials.push({
        index: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index,
        start,
        partials: []
      });
    }
  }

  const recordSurvivorHealthAndAbortIfLost = (legIndex, extra = {}) => {
    const snapshot = makeSurvivorSnapshot(legIndex, extra);
    if (!earlyExitEnabled || snapshot.survivingStarts >= requiredSurvivingStarts) {
      survivorHistory.push(snapshot);
      return;
    }
    throwCapacityLost(legIndex, snapshot);
  };

  // A capped branch is only telemetry. Abort after the whole opening leg has
  // been evaluated, and only if too few starts retain any viable continuation.
  recordSurvivorHealthAndAbortIfLost(0);

  for (let legIndex = 1; legIndex < flags.length; legIndex += 1) {
    let preferredStopped = false;
    const unresolvedCapsThisLeg = [];
    for (let entryIndex = 0; entryIndex < startPartials.length; entryIndex += 1) {
      const entry = startPartials[entryIndex];
      if (!entry.partials.length) {
        continue;
      }

      const sourcePartials = entry.partials;
      const extensions = [];
      const cappedSourcePartials = [];
      for (const partial of sourcePartials) {
        const legRoutes = getLegRoutes(
          partial.context,
          legIndex,
          entry.start,
          entry.index,
          false
        );
        if (!legRoutes.length && isUnresolvedCappedRouteSet(legRoutes)) {
          cappedSourcePartials.push({
            partial,
            searchMeta: legRoutes.contextualSearchMeta ?? null
          });
        }
        for (const route of legRoutes) {
          extensions.push({
            legs: [...partial.legs, route],
            context: getContextAfterLeg(route, partial.context, tileMap, baseRouteOptions),
            score: partial.score + route.score
          });
        }
      }

      entry.partials = selectContextualPartialBeam(
        extensions,
        flags[legIndex],
        getContextualBeamWidthForPartials(
          extensions,
          options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
          baseRouteOptions
        ),
        {
          wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
          flags: flags.slice(0, legIndex + 1)
        }
      );
      if (!entry.partials.length && cappedSourcePartials.length) {
        unresolvedCapsThisLeg.push({
          entry,
          sourcePartials: cappedSourcePartials,
          attempted: false
        });
      }

      let processedSurvivors = startPartials
        .slice(0, entryIndex + 1)
        .filter((candidate) => candidate.partials.length).length;
      const unprocessedPotential = startPartials
        .slice(entryIndex + 1)
        .filter((candidate) => candidate.partials.length).length;
      let maximumPossibleStarts = processedSurvivors + unprocessedPotential;

      if (
        earlyExitEnabled &&
        maximumPossibleStarts < requiredSurvivingStarts
      ) {
        for (const unresolved of unresolvedCapsThisLeg) {
          if (unresolved.attempted || unresolved.entry.partials.length) continue;
          unresolved.attempted = true;
          const rescueExtensions = [];
          for (const unresolvedSource of unresolved.sourcePartials) {
            const partial = unresolvedSource.partial;
            const rescuedRoutes = runCapacityRescue(
              partial.context,
              legIndex,
              unresolved.entry.start,
              unresolved.entry.index,
              false,
              unresolvedSource.searchMeta
            );
            for (const route of rescuedRoutes) {
              rescueExtensions.push({
                legs: [...partial.legs, route],
                context: getContextAfterLeg(route, partial.context, tileMap, baseRouteOptions),
                score: partial.score + route.score
              });
            }
            if (rescueExtensions.length) break;
          }
          if (rescueExtensions.length) {
            unresolved.entry.partials = selectContextualPartialBeam(
              rescueExtensions,
              flags[legIndex],
              getContextualBeamWidthForPartials(
                rescueExtensions,
                options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
                baseRouteOptions
              ),
              {
                wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
                flags: flags.slice(0, legIndex + 1)
              }
            );
          }
          processedSurvivors = startPartials
            .slice(0, entryIndex + 1)
            .filter((candidate) => candidate.partials.length).length;
          maximumPossibleStarts = processedSurvivors + unprocessedPotential;
          if (maximumPossibleStarts >= requiredSurvivingStarts) break;
        }
      }

      // Same exact short-circuit for later legs, but only after unresolved capped
      // searches that matter to capacity have had their one larger-budget retry.
      if (
        earlyExitEnabled &&
        maximumPossibleStarts < requiredSurvivingStarts
      ) {
        throwCapacityLost(
          legIndex,
          makeSurvivorSnapshot(legIndex, {
            survivingStarts: processedSurvivors,
            maximumPossibleStarts,
            processedStartsThisLeg: entryIndex + 1
          })
        );
      }

      if (
        stopWhenPreferredLost &&
        unprocessedPotential > 0 &&
        processedSurvivors >= requiredSurvivingStarts &&
        maximumPossibleStarts < preferredSurvivingStarts
      ) {
        for (let restIndex = entryIndex + 1; restIndex < startPartials.length; restIndex += 1) {
          startPartials[restIndex].partials = [];
        }
        preferredCapacityShortCircuits += 1;
        preferredStopped = true;
        break;
      }
      yield { phase: "later-leg-start", startIndex: entry.index, legIndex };
    }

    const legSurvivors = startPartials.filter((candidate) => candidate.partials.length).length;
    recordSurvivorHealthAndAbortIfLost(legIndex, {
      survivingStarts: legSurvivors,
      preferredCapacityShortCircuit: preferredStopped
    });
  }

  }

  const startAnalyses = startPartials.map((entry) => {
    const fullCourseRoutes = entry.partials
      .map((partial) => (
        stitchContextualLegs(partial.legs, flags)
      ))
      .filter((route) => {
        if (!route) return false;
        // v28 final safety gate: every accepted whole-course route must still
        // satisfy the literal-card assignments and rolling two-program supply
        // after all exact leg stitches are concatenated. This should normally be
        // redundant; a failure indicates a stitching/cache bug, so never expose it
        // as a reachable route.
        const validation = summarizeRouteAgainUsage(route);
        const legal = (
          validation.literalProgramViolations === 0 &&
          validation.rollingWindowViolations === 0
        );
        if (!legal) finalProgrammingValidationFailures += 1;
        return legal;
      })
      .map((route) => applyIntrinsicDamageEconomyRoutingScore(tileMap, route, baseRouteOptions))
      .sort(compareScoredRouteLike);
    const fullCourseRoute = fullCourseRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: entry.index,
      start: entry.start,
      reachable: Boolean(fullCourseRoute),
      fullCourseRoutes,
      fullCourseRoute,
      fullCourseRouteIndex: fullCourseRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const selection = options.skipFullCourseTraffic
    ? {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      candidateDiagnostics: startAnalyses
        .filter((analysis) => analysis.reachable && analysis.fullCourseRoutes?.length)
        .map((analysis) => summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0]
        ))
    }
    : selectFullCourseRoutesForStarts(
      tileMap,
      startAnalyses,
      flags,
      {
        ...options,
        playerCount
      }
    );
  const selectedStartAnalyses = selection.starts.map(
    (analysis) => (
      buildStartAnalysisForSelectedFullRoute(analysis)
    )
  );
  const fullScores = selectedStartAnalyses
    .filter(
      (item) => item.reachable && item.fullCourseRoute
    )
    .map(
      (item) => (
        item.fullCourseRoute.score +
        (item.fullCourseTrafficPenalty ?? 0)
      )
    );
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map(
    (analysis) => {
      if (!analysis.fullCourseRoute) {
        return analysis;
      }

      const fullScore = (
        analysis.fullCourseRoute.score +
        (analysis.fullCourseTrafficPenalty ?? 0)
      );
      const rawDelta = fullScore - meanFullScore;
      return {
        ...analysis,
        courseEstimate: {
          ...analysis.courseEstimate,
          meanFullScore: Number(meanFullScore.toFixed(2)),
          delta: Number(rawDelta.toFixed(2))
        },
        courseScoreAdjustment: Number(
          clamp(rawDelta * 0.32, -10, 10).toFixed(2)
        )
      };
    }
  );

  selectAndScoreStartAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    playerCount,
    null,
    options
  );
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
    adjustedStartAnalyses,
    flags,
    playerCount
  );
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  applyNormalFullCourseEffectiveREFairnessScores(tileMap, adjustedStartAnalyses, options);
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  const programmingScarcity = {
    ...summarizeSelectedProgrammingScarcity(
      adjustedStartAnalyses,
      options
    ),
    ...(options.targetedSameRegisterCardPressureAudit
      ? { targetedSameRegisterCardPressure: options.targetedSameRegisterCardPressureAudit }
      : {})
  };

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(
        meanFullScore.toFixed(2)
      ),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      programmingScarcity,
      contextualLegRoutes: true,
      contextualLegCache: {
        entries: legCache.size,
        templateEntries: templateCache.size,
        catalogueEntries: sharedLegCatalogueCache.size,
        hits: cacheHits + templateHits + catalogueCacheHits,
        exactHits: cacheHits,
        templateHits,
        catalogueLookups,
        catalogueCacheHits,
        catalogueSearches,
        catalogueCappedSearches,
        catalogueExhaustedSearches,
        catalogueSuppressedCappedLookups,
        catalogueReplayRouteChecks,
        catalogueCompatibleLineages,
        catalogueCompatibleRoutes,
        catalogueIncompatibleLineages,
        catalogueRefinementSearches,
        catalogueEnrichmentSearches,
        catalogueEnrichmentSuccesses,
        catalogueEnrichmentSuppressed,
        misses: cacheMisses,
        templateFallbacks,
        zeroRouteCapFailures,
        zeroRouteHorizonFailures,
        zeroRouteFailureStarts: zeroRouteFailureStarts.size,
        zeroRouteHorizonFailureStarts: zeroRouteHorizonFailureStarts.size,
        zeroRouteFailureStartIndices: [...zeroRouteFailureStarts].sort((a, b) => a - b),
        zeroRouteHorizonFailureStartIndices: [...zeroRouteHorizonFailureStarts].sort((a, b) => a - b),
        seededOpeningRoutes: seededOpeningStarts > 0,
        seededOpeningStarts,
        survivorHistory: survivorHistory.map((entry) => ({ ...entry })),
        survivingStarts: startPartials.filter((entry) => entry.partials.length).length,
        requiredSurvivingStarts,
        preferredSurvivingStarts,
        preferredCapacityShortCircuits,
        capacityRescueSearches,
        capacityRescueSuccesses,
        capacityPhysicalRescueSearches,
        capacityPhysicalRescueSuccesses,
        capacityHorizonRescueSearches,
        capacityHorizonRescueSuccesses,
        capacityExpansionRescueSearches,
        capacityExpansionRescueSuccesses,
        fastCardState: options.contextualFastCardState !== false,
        numericHotStateKeys: options.contextualFastCardState !== false,
        estimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
        estimatedLegCacheEntries: estimatedLegCache.size,
        estimatedLegSearches,
        estimatedLegWidenedSearches,
        estimatedLegResumedWidenings,
        estimatedLegFreshExhaustiveFallbacks,
        estimatedLegResumeSavedRootExpansions,
        estimatedLegResumeReplayExpansions,
        estimatedLegCacheHits,
        estimatedLegWitnessesGenerated,
        estimatedMilestoneRoutes,
        estimatedPhysicalFailures,
        estimatedPhysicalFailureStarts,
        estimatedForecastIntactRoutes,
        exactRealizationAttempts,
        exactRealizationDirectSuccesses,
        exactRealizationRepairedSuccesses,
        exactRealizationFailures,
        cardRepairReplans,
        cardRepairFailurePoints,
        cardRepairPrefixBacktracks,
        cardRepairNoSuffix,
        cardRepairDownstreamRebuildFailures,
        cardRepairRepeatedCandidates,
        estimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
        trafficEpochsExecuted,
        trafficFeedbackStopReason,
        trafficFeedbackConvergenceChecks,
        trafficFeedbackConvergedRounds,
        trafficFeedbackRoundSummaries: trafficFeedbackRoundSummaries.map((entry) => ({ ...entry })),
        trafficAlternateDemandStarts,
        trafficAlternateDemandLegs,
        trafficAlternateCachedWitnessChecks,
        trafficAlternateNewSearches,
        trafficAlternateExactChecks,
        trafficAlternateExactRejects,
        trafficAlternateCandidatesAdded,
        trafficAlternateBeneficialCandidates,
        trafficAlternateBestGain: Number(trafficAlternateBestGain.toFixed(2)),
        trafficAlternateCachedProbeStops,
        trafficAlternateCachedUsefulStops,
        trafficAlternateLocalCacheHits,
        trafficAlternateRepeatedMissEvidenceChecks,
        trafficAlternateRepeatedMissEvidenceStops,
        trafficAlternateRepeatedMissEvidenceDeeperRetries,
        trafficAlternateRepeatedMissEvidenceEntries:
          trafficAlternateNegativeSearchEvidence.size,
        trafficAlternateEvidenceCandidateChecks,
        trafficAlternateEvidenceCandidatesStored,
        trafficAlternateEvidenceCandidatesPromoted,
        trafficAlternateEvidenceSaturationStops,
        trafficAlternateEvidenceCandidateEntries: [...trafficAlternateEvidenceCandidatesByStart.values()]
          .reduce((sum, pool) => sum + pool.size, 0),
        trafficAlternateEscalations,
        trafficAlternateSearchNoRoutes,
        trafficAlternateCardRejects,
        trafficAlternateValidationRejects,
        trafficAlternateDuplicateRejects,
        trafficAlternateLowGainRejects,
        trafficAlternateDownstreamRebuildFailures,
        trafficAlternateEffectiveDemandLegs,
        trafficAlternateExploratoryDemandLegs,
        trafficAlternatePressureDemandLegs,
        trafficAlternatePressureRestoredLegs,
        trafficAlternateAveragePressureRegisterEquivalents:
          trafficAlternatePressureRegisterEquivalentsCount
            ? Number((trafficAlternatePressureRegisterEquivalentsSum /
              trafficAlternatePressureRegisterEquivalentsCount).toFixed(3))
            : 0,
        trafficAlternateMaximumPressureRegisterEquivalents: Number(
          trafficAlternateMaximumPressureRegisterEquivalents.toFixed(3)
        ),
        trafficAlternateAverageBaseEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateBaseEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        trafficAlternateAverageEffortRestoration: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortRestorationSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 0,
        trafficAlternateMaxNewSearchesTotal: trafficMaxNewSearchesTotal,
        trafficAlternateAverageEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        trafficAlternateMinimumEffortScale: trafficAlternateEffortScaleCount
          ? Number(trafficAlternateMinimumEffortScale.toFixed(3))
          : 1,
        trafficAlternateHotspotLocalSearches,
        trafficAlternateSearchTrace: trafficAlternateSearchTrace.map((entry) => ({ ...entry })),
        trafficAlternateGainTrace: trafficAlternateGainTrace.map((entry) => ({ ...entry })),
        trafficAlternateHotspotFallbackLegStarts,
        trafficAlternateHotspotAveragePrefixActions: trafficAlternateHotspotPrefixActionsCount
          ? Number((trafficAlternateHotspotPrefixActionsSum /
            trafficAlternateHotspotPrefixActionsCount).toFixed(2))
          : 0,
        trafficAlternateHotspotMaximumPrefixActions,
        trafficAlternateHotspotTwoRegisterLookbacks,
        // Telemetry-only duplicate of the lightweight scalar route-mixture summary.
        // The authoritative traffic field remains selection.routeMixtureField; this copy
        // lets Dev/Copy Summary survive scenario-summary reshaping without carrying routes.
        trafficRouteMixtureField: selection.routeMixtureField ?? null,
        trafficRouteFamilyDivergenceField:
          selection.routeFamilyDivergenceField ?? null,
        trafficExplorationUncertaintyShare,
        trafficExplorationConfidenceFloor,
        trafficAlternateDemandByLeg: trafficAlternateDemandByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          count
        })),
        trafficAlternateCandidatesByLeg: trafficAlternateCandidatesByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          count
        })),
        arrivalClassRouting: Boolean(
          options.contextualEstimatedPrimaryRouting ||
          options.contextualSharedLaterLegCatalogue
        ),
        primaryWitnessRoutes: Math.max(
          1,
          Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
        ),
        catalogueWitnessesGenerated,
        catalogueWitnessResolvedLineages,
        finalProgrammingValidationFailures,
        catalogueWitnessRankSuccesses: catalogueWitnessRankSuccesses.map((count, index) => ({
          witness: index + 1,
          successes: count || 0
        })),
        arrivalClassesByLeg: arrivalClassKeysByLeg.map((keys, legIndex) => ({
          leg: legIndex + 1,
          lineages: [...arrivalClassLineagesByLeg[legIndex].values()]
            .reduce((sum, set) => sum + set.size, 0),
          classes: keys.size
        })),
        capacityPolicy: options.contextualEstimatedPrimaryRouting
          ? "all-starts-primary+acceptance-floor-only"
          : Number.isFinite(Number(options.contextualRequiredStarts))
            ? "explicit-floor"
            : "player-count-floor",
        zeroRouteCapsByLeg: zeroRouteCapsByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          contexts: count,
          starts: zeroRouteFailureStartsByLeg[legIndex].size
        })),
        zeroRouteHorizonsByLeg: zeroRouteHorizonsByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          contexts: count,
          starts: zeroRouteHorizonFailureStartsByLeg[legIndex].size
        }))
      },
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        ownershipAuditV49bk: {
          behaviorChanged: true,
          robotLaserPhysicalDamageOwner: "damage-economy",
          residualRangedThreatOwner: "diagnostic-only-v49ej-physical-damage-plus-awareness-mental-own-production",
          nearbyOwner: "turn-episode-control-loss-re",
          competitionActive: false,
          trafficMentalRobotLaserAwarenessActive: true,
          trafficMentalNonLaserControlEventsActive: true,
          candidateNearbyControlOwner: "existing-control-loss-curve-from-old-price-free-interaction-geometry",
          candidateNearbyControlBehaviorActive: true,
          candidateNonLaserMentalBehaviorActive: true,
          averageLegacyRangedPenalty: selection.averageLegacyRangedTrafficPenalty ?? 0,
          averageRobotLaserDamageScore: selection.averageRobotLaserDamageTrafficScore ?? 0,
          averageRobotLaserDamageRE: selection.averageRobotLaserDamageTrafficRegisterEquivalents ?? 0,
          averageResidualRangedThreatPenalty: selection.averageResidualRangedThreatTrafficPenalty ?? 0,
          averageLegacyResidualRangedThreatDiagnosticPenalty:
            selection.averageLegacyResidualRangedThreatDiagnosticPenalty ?? 0,
          averageNearbyPenalty: selection.averageNearbyTrafficPenalty ?? 0,
          averageLegacyNearbyPenalty:
            selection.averageLegacyNearbyTrafficPenalty ?? 0,
          averageAuthoritativeNearbyControlRE:
            selection.averageAuthoritativeNearbyControlRegisterEquivalents ?? 0,
          averageCompetitionPenalty: selection.averageCompetitionTrafficPenalty ?? 0,
          averageNearbyInteractionEventMassCandidate:
            selection.averageNearbyInteractionEventMassCandidate ?? 0,
          averageNearbyControlLoadCandidate:
            selection.averageNearbyControlLoadCandidate ?? 0,
          averageNearbyControlRECandidate:
            selection.averageNearbyControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyControlScoreCandidate:
            selection.averageNearbyControlScoreCandidate ?? 0,
          averageNearbyTurnEpisodeEventMassCandidate:
            selection.averageNearbyTurnEpisodeEventMassCandidate ?? 0,
          averageNearbyTurnEpisodeControlLoadCandidate:
            selection.averageNearbyTurnEpisodeControlLoadCandidate ?? 0,
          averageNearbyTurnEpisodeControlRECandidate:
            selection.averageNearbyTurnEpisodeControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyTurnEpisodeControlScoreCandidate:
            selection.averageNearbyTurnEpisodeControlScoreCandidate ?? 0,
          averageTrafficAwarenessMentalRE:
            selection.averageTrafficAwarenessMentalRegisterEquivalents ?? 0,
          averageTrafficAwarenessEventMass:
            selection.averageTrafficAwarenessEventMass ?? 0,
          averageTrafficAwarenessRobotLaserEventMass:
            selection.averageTrafficAwarenessRobotLaserEventMass ?? 0,
          averageTrafficAwarenessNonLaserEventMass:
            selection.averageTrafficAwarenessNonLaserEventMass ?? 0,
          averageTrafficAwarenessRebootPileupEventMass:
            selection.averageTrafficAwarenessRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupEventMass:
            selection.averageSimultaneousRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupMaximumTurnProbability:
            selection.averageSimultaneousRebootPileupMaximumTurnProbability ?? 0,
          averageSimultaneousRebootPileupClogRE:
            selection.averageSimultaneousRebootPileupClogRegisterEquivalents ?? 0,
          simultaneousRebootPileupOwner:
            "same-turn-same-reboot-space -> +1 actual clog stacked in damage-economy curve; no fabricated displacement; v49ei",
          homingMissileOwner:
            "strategic credit = 2x standard one-damage reference per once-per-turn/per-missile-space activation + target-choice planning event; self-hazard OFF; v49ei"
        },
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        trafficEpochsExecuted,
        feedbackStopReason: trafficFeedbackStopReason,
        feedbackConvergenceChecks: trafficFeedbackConvergenceChecks,
        feedbackConvergedRounds: trafficFeedbackConvergedRounds,
        feedbackRoundSummaries: trafficFeedbackRoundSummaries.map((entry) => ({ ...entry })),
        alternateDemandStarts: trafficAlternateDemandStarts,
        alternateDemandLegs: trafficAlternateDemandLegs,
        alternateCachedWitnessChecks: trafficAlternateCachedWitnessChecks,
        alternateNewSearches: trafficAlternateNewSearches,
        alternateExactChecks: trafficAlternateExactChecks,
        alternateExactRejects: trafficAlternateExactRejects,
        alternateCandidatesAdded: trafficAlternateCandidatesAdded,
        alternateBestGain: Number(trafficAlternateBestGain.toFixed(2)),
        alternateCachedProbeStops: trafficAlternateCachedProbeStops,
        alternateCachedUsefulStops: trafficAlternateCachedUsefulStops,
        alternateLocalCacheHits: trafficAlternateLocalCacheHits,
        alternateRepeatedMissEvidenceChecks: trafficAlternateRepeatedMissEvidenceChecks,
        alternateRepeatedMissEvidenceStops: trafficAlternateRepeatedMissEvidenceStops,
        alternateRepeatedMissEvidenceDeeperRetries:
          trafficAlternateRepeatedMissEvidenceDeeperRetries,
        alternateRepeatedMissEvidenceEntries: trafficAlternateNegativeSearchEvidence.size,
        alternateEvidenceCandidateChecks: trafficAlternateEvidenceCandidateChecks,
        alternateEvidenceCandidatesStored: trafficAlternateEvidenceCandidatesStored,
        alternateEvidenceCandidatesPromoted: trafficAlternateEvidenceCandidatesPromoted,
        alternateEvidenceSaturationStops: trafficAlternateEvidenceSaturationStops,
        alternateEvidenceCandidateEntries: [...trafficAlternateEvidenceCandidatesByStart.values()]
          .reduce((sum, pool) => sum + pool.size, 0),
        alternateEffectiveDemandLegs: trafficAlternateEffectiveDemandLegs,
        alternateExploratoryDemandLegs: trafficAlternateExploratoryDemandLegs,
        alternatePressureDemandLegs: trafficAlternatePressureDemandLegs,
        alternatePressureRestoredLegs: trafficAlternatePressureRestoredLegs,
        alternateAveragePressureRegisterEquivalents:
          trafficAlternatePressureRegisterEquivalentsCount
            ? Number((trafficAlternatePressureRegisterEquivalentsSum /
              trafficAlternatePressureRegisterEquivalentsCount).toFixed(3))
            : 0,
        alternateMaximumPressureRegisterEquivalents: Number(
          trafficAlternateMaximumPressureRegisterEquivalents.toFixed(3)
        ),
        alternateAverageBaseEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateBaseEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        alternateAverageEffortRestoration: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortRestorationSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 0,
        alternateMaxNewSearchesTotal: trafficMaxNewSearchesTotal,
        alternateAverageEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        alternateMinimumEffortScale: trafficAlternateEffortScaleCount
          ? Number(trafficAlternateMinimumEffortScale.toFixed(3))
          : 1,
        alternateHotspotLocalSearches: trafficAlternateHotspotLocalSearches,
        alternateSearchTrace: trafficAlternateSearchTrace.map((entry) => ({ ...entry })),
        alternateGainTrace: trafficAlternateGainTrace.map((entry) => ({ ...entry })),
        alternateHotspotFallbackLegStarts: trafficAlternateHotspotFallbackLegStarts,
        alternateHotspotAveragePrefixActions: trafficAlternateHotspotPrefixActionsCount
          ? Number((trafficAlternateHotspotPrefixActionsSum /
            trafficAlternateHotspotPrefixActionsCount).toFixed(2))
          : 0,
        alternateHotspotMaximumPrefixActions: trafficAlternateHotspotMaximumPrefixActions,
        alternateHotspotTwoRegisterLookbacks: trafficAlternateHotspotTwoRegisterLookbacks,
        explorationUncertaintyShare: trafficExplorationUncertaintyShare,
        explorationConfidenceFloor: trafficExplorationConfidenceFloor,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        commonOccupancyField: selection.commonOccupancyField ?? null,
        routeMixtureField: selection.routeMixtureField ?? null,
      routeMixtureOwnershipAudit:
        selection.routeMixtureOwnershipAudit ?? null,
      completedRouteOwnershipAudit:
        selection.completedRouteOwnershipAudit ?? null,
        routeFamilyDivergenceField:
          selection.routeFamilyDivergenceField ?? null,
        legAwareOverlap: true,
        contextualLegRoutes: true,
        openingRoutesPerStart: options.contextualOpeningRoutes ?? CONTEXTUAL_OPENING_ROUTES,
        laterRoutesPerContext: options.contextualLaterRoutes ?? CONTEXTUAL_LATER_ROUTES,
        stitchedBeamWidth: options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
        completionPool: options.contextualCompletionPool ?? CONTEXTUAL_COMPLETION_POOL,
        optionalCompletionExpansions: options.contextualOptionalCompletionExpansions ?? null,
        openingLegWeight:
          FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight:
          FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

function analyzeFullCourseContextual(tileMap, starts, flags, options = {}) {
  const iterator = analyzeFullCourseContextualSteps(tileMap, starts, flags, options);
  let step = iterator.next();
  while (!step.done) {
    step = iterator.next();
  }
  return step.value;
}

export async function analyzeFullCourseCooperative(tileMap, starts, flags, options = {}) {
  // Only the contextual path needs cooperative browser deferral in production.
  // Seeded/simpler paths retain their existing synchronous implementation.
  if (!options.contextualLegSearch || Array.isArray(options.contextualSeedStartAnalyses)) {
    return analyzeFullCourse(tileMap, starts, flags, options);
  }

  const iterator = analyzeFullCourseContextualSteps(tileMap, starts, flags, options);
  const cooperativeYield = typeof options.cooperativeYield === "function"
    ? options.cooperativeYield
    : null;
  const shouldStopRequested = typeof options.shouldStopRequested === "function"
    ? options.shouldStopRequested
    : () => false;
  const requestedYieldIntervalMs = Number(options.cooperativeYieldIntervalMs);
  const yieldIntervalMs = Number.isFinite(requestedYieldIntervalMs)
    ? Math.max(0, requestedYieldIntervalMs)
    : 250;
  let lastBrowserYieldAt = analysisTelemetryNow();

  if (shouldStopRequested()) {
    const error = new Error("Analysis stopped at a cooperative boundary.");
    error.code = "ANALYSIS_STOP_REQUESTED";
    throw error;
  }

  const completedProgressCounts = new Map();
  const advanceIterator = () => {
    const sliceStartedAt = analysisTelemetryNow();
    const nextStep = iterator.next();
    const sliceMs = Math.max(0, analysisTelemetryNow() - sliceStartedAt);
    ANALYSIS_TELEMETRY.cooperativeIteratorSlices += 1;
    ANALYSIS_TELEMETRY.cooperativeIteratorWorkMs += sliceMs;
    if (sliceMs > ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceMs) {
      ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceMs = sliceMs;
      ANALYSIS_TELEMETRY.cooperativeMaxIteratorSlicePhase = nextStep.done
        ? "complete"
        : String(nextStep.value?.phase ?? "boundary");
      ANALYSIS_TELEMETRY.cooperativeMaxIteratorSliceSearchKind = nextStep.done
        ? null
        : (nextStep.value?.searchKind ?? null);
    }
    return nextStep;
  };
  let step = advanceIterator();
  while (!step.done) {
    const progress = step.value ?? {};
    const progressKey = progress.phase === "later-leg-start"
      ? `${progress.phase}:${progress.legIndex ?? "?"}`
      : progress.phase === "traffic-start"
        ? `${progress.phase}:${progress.epoch ?? "?"}`
        : String(progress.phase ?? "boundary");
    const completedCount = (completedProgressCounts.get(progressKey) ?? 0) + 1;
    completedProgressCounts.set(progressKey, completedCount);

    const now = analysisTelemetryNow();
    const routeSearchSlice = progress.phase === "route-search-slice";
    if (
      cooperativeYield &&
      (routeSearchSlice || now - lastBrowserYieldAt >= yieldIntervalMs)
    ) {
      ANALYSIS_TELEMETRY.cooperativeBrowserYields += 1;
      if (routeSearchSlice) {
        ANALYSIS_TELEMETRY.cooperativeRouteSearchBrowserYields += 1;
      }
      const browserYieldStartedAt = analysisTelemetryNow();
      await cooperativeYield({ ...progress, completedCount });
      ANALYSIS_TELEMETRY.cooperativeBrowserPausedMs += Math.max(
        0,
        analysisTelemetryNow() - browserYieldStartedAt
      );
      lastBrowserYieldAt = analysisTelemetryNow();
    }
    if (shouldStopRequested()) {
      if (typeof iterator.return === "function") iterator.return();
      const error = new Error("Analysis stopped at a cooperative boundary.");
      error.code = "ANALYSIS_STOP_REQUESTED";
      throw error;
    }
    step = advanceIterator();
  }
  return step.value;
}

export function analyzeFullCourse(tileMap, starts, flags, options = {}) {
  if (options.contextualLegSearch && Array.isArray(options.contextualSeedStartAnalyses)) {
    return analyzeSeededFullCourseContextual(
      tileMap,
      starts,
      flags,
      options
    );
  }
  if (options.contextualLegSearch) {
    return analyzeFullCourseContextual(
      tileMap,
      starts,
      flags,
      options
    );
  }
  const maxRoutes = options.maxRoutes ?? 2;
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const routeOptions = {
    maxRoutes,
    maxActions: options.maxActions,
    maxExpansions: options.maxExpansions,
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    factoryRejects: Boolean(options.factoryRejects),
    classicSharedDeck: Boolean(options.classicSharedDeck),
    lessForeshadowing: Boolean(options.lessForeshadowing),
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive,
    setToKill: Boolean(options.setToKill),
    setToStun: Boolean(options.setToStun),
    contextualTrafficAlternativeRetention: Boolean(
      options.contextualTrafficAlternativeRetention
    ),
    repairStations: Boolean(options.repairStations),
    playerCount,
    virtualBots: Boolean(options.virtualBots),
    trafficGraceRegisters: Math.max(0, Number(options.trafficGraceRegisters) || 0),
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoals,
    portalMap
  };

  const enumeratePreparedRoutesForStart = (start) => {
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const diverseSearch = Boolean(options.diverseFullCourseSearch);
    const completionPool = diverseSearch
      ? Math.min(5, maxRoutes + 2)
      : maxRoutes;
    const rawRoutes = dedupeRoutes(enumerateFullCourseRoutes(tileMap, start, flags, {
      ...routeOptions,
      rebootTokens,
      maxRoutes: completionPool,
      maxStateLabels: diverseSearch ? 2 : 1,
      diverseStateLabelsAfterFirstCheckpoint: diverseSearch,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations
    })).sort(compareScoredRouteLike);
    const preparedRoutes = rawRoutes
      .map((route) => prepareFullCourseCandidate(route, flags))
      .filter(Boolean)
      .map((route) => applyIntrinsicDamageEconomyRoutingScore(tileMap, route, routeOptions))
      .sort(compareScoredRouteLike);
    return diverseSearch
      ? selectCorridorDiverseFullCourseRoutes(preparedRoutes, flags, maxRoutes)
      : selectDistinctRoutes(preparedRoutes, flags.at(-1), maxRoutes);
  };

  // v49fc: no Virtual-Bots-specific route builder. Even synchronous/diagnostic
  // callers analyze each logical start through the ordinary route machinery.
  // Production Virtual Bots use the cooperative contextual estimate→realize path
  // in main; this branch is retained only as the generic synchronous fallback.
  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const distinctFullRoutes = enumeratePreparedRoutesForStart(start);
    const fullRoute = distinctFullRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: sourceIndex,
      start,
      reachable: Boolean(fullRoute),
      fullCourseRoutes: distinctFullRoutes,
      fullCourseRoute: fullRoute,
      fullCourseRouteIndex: fullRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, {
    ...options,
    playerCount
  });
  const selectedStartAnalyses = selection.starts.map((analysis) => buildStartAnalysisForSelectedFullRoute(analysis));
  const fullScores = selectedStartAnalyses
    .filter((item) => item.reachable && item.fullCourseRoute)
    .map((item) => item.fullCourseRoute.score + (item.fullCourseTrafficPenalty ?? 0));
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map((analysis) => {
    if (!analysis.fullCourseRoute) {
      return analysis;
    }

    const fullScore = analysis.fullCourseRoute.score + (analysis.fullCourseTrafficPenalty ?? 0);
    const rawDelta = fullScore - meanFullScore;
    return {
      ...analysis,
      courseEstimate: {
        ...analysis.courseEstimate,
        meanFullScore: Number(meanFullScore.toFixed(2)),
        delta: Number(rawDelta.toFixed(2))
      },
      courseScoreAdjustment: Number(clamp(rawDelta * 0.32, -10, 10).toFixed(2))
    };
  });

  selectAndScoreStartAnalyses(tileMap, adjustedStartAnalyses, flags[0], playerCount, null, options);
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  applyNormalFullCourseEffectiveREFairnessScores(tileMap, adjustedStartAnalyses, options);
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(adjustedStartAnalyses, flags, playerCount);
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(meanFullScore.toFixed(2)),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        ownershipAuditV49bk: {
          behaviorChanged: true,
          robotLaserPhysicalDamageOwner: "damage-economy",
          residualRangedThreatOwner: "diagnostic-only-v49ej-physical-damage-plus-awareness-mental-own-production",
          nearbyOwner: "turn-episode-control-loss-re",
          competitionActive: false,
          trafficMentalRobotLaserAwarenessActive: true,
          trafficMentalNonLaserControlEventsActive: true,
          candidateNearbyControlOwner: "existing-control-loss-curve-from-old-price-free-interaction-geometry",
          candidateNearbyControlBehaviorActive: true,
          candidateNonLaserMentalBehaviorActive: true,
          averageLegacyRangedPenalty: selection.averageLegacyRangedTrafficPenalty ?? 0,
          averageRobotLaserDamageScore: selection.averageRobotLaserDamageTrafficScore ?? 0,
          averageRobotLaserDamageRE: selection.averageRobotLaserDamageTrafficRegisterEquivalents ?? 0,
          averageResidualRangedThreatPenalty: selection.averageResidualRangedThreatTrafficPenalty ?? 0,
          averageLegacyResidualRangedThreatDiagnosticPenalty:
            selection.averageLegacyResidualRangedThreatDiagnosticPenalty ?? 0,
          averageNearbyPenalty: selection.averageNearbyTrafficPenalty ?? 0,
          averageLegacyNearbyPenalty:
            selection.averageLegacyNearbyTrafficPenalty ?? 0,
          averageAuthoritativeNearbyControlRE:
            selection.averageAuthoritativeNearbyControlRegisterEquivalents ?? 0,
          averageCompetitionPenalty: selection.averageCompetitionTrafficPenalty ?? 0,
          averageNearbyInteractionEventMassCandidate:
            selection.averageNearbyInteractionEventMassCandidate ?? 0,
          averageNearbyControlLoadCandidate:
            selection.averageNearbyControlLoadCandidate ?? 0,
          averageNearbyControlRECandidate:
            selection.averageNearbyControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyControlScoreCandidate:
            selection.averageNearbyControlScoreCandidate ?? 0,
          averageNearbyTurnEpisodeEventMassCandidate:
            selection.averageNearbyTurnEpisodeEventMassCandidate ?? 0,
          averageNearbyTurnEpisodeControlLoadCandidate:
            selection.averageNearbyTurnEpisodeControlLoadCandidate ?? 0,
          averageNearbyTurnEpisodeControlRECandidate:
            selection.averageNearbyTurnEpisodeControlRegisterEquivalentsCandidate ?? 0,
          averageNearbyTurnEpisodeControlScoreCandidate:
            selection.averageNearbyTurnEpisodeControlScoreCandidate ?? 0,
          averageTrafficAwarenessMentalRE:
            selection.averageTrafficAwarenessMentalRegisterEquivalents ?? 0,
          averageTrafficAwarenessEventMass:
            selection.averageTrafficAwarenessEventMass ?? 0,
          averageTrafficAwarenessRobotLaserEventMass:
            selection.averageTrafficAwarenessRobotLaserEventMass ?? 0,
          averageTrafficAwarenessNonLaserEventMass:
            selection.averageTrafficAwarenessNonLaserEventMass ?? 0,
          averageTrafficAwarenessRebootPileupEventMass:
            selection.averageTrafficAwarenessRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupEventMass:
            selection.averageSimultaneousRebootPileupEventMass ?? 0,
          averageSimultaneousRebootPileupMaximumTurnProbability:
            selection.averageSimultaneousRebootPileupMaximumTurnProbability ?? 0,
          averageSimultaneousRebootPileupClogRE:
            selection.averageSimultaneousRebootPileupClogRegisterEquivalents ?? 0,
          simultaneousRebootPileupOwner:
            "same-turn-same-reboot-space -> +1 actual clog stacked in damage-economy curve; no fabricated displacement; v49ei",
          homingMissileOwner:
            "strategic credit = 2x standard one-damage reference per once-per-turn/per-missile-space activation + target-choice planning event; self-hazard OFF; v49ei"
        },
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        commonOccupancyField: selection.commonOccupancyField ?? null,
        routeMixtureField: selection.routeMixtureField ?? null,
      routeMixtureOwnershipAudit:
        selection.routeMixtureOwnershipAudit ?? null,
      completedRouteOwnershipAudit:
        selection.completedRouteOwnershipAudit ?? null,
        routeFamilyDivergenceField:
          selection.routeFamilyDivergenceField ?? null,
        legAwareOverlap: true,
        perRobotOverlapDamping: true,
        oncomingTraffic: true,
        oncomingTrafficWeight: 0.06,
        openingLegWeight: FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight: FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

// Start-Energy-sensitive full-course evaluation. Traffic is computed once per
// already-discovered route candidate because changing starting Energy does not
// alter board geometry. The v45 economy is replayed for each Pay to Win payment
// or Subsidized Starts grant, and the focus robot may choose a different
// existing coherent candidate at that Energy level. This gives adaptive route
// choice without multiplying the expensive route-search budget.
export function evaluateFullCourseFocusPaymentCurveUnderOccupancy(
  tileMap,
  firstLeg,
  flags,
  focusIndex,
  occupancyByIndex,
  options = {}
) {
  const analyses = (firstLeg?.starts || []).filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length
  ));
  const focus = analyses.find((analysis) => analysis.index === focusIndex);
  if (!focus) return null;

  const baseStartingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const subsidizedStarts = Boolean(options.subsidizedStarts);
  const defaultMaxAdjustment = subsidizedStarts
    ? Math.max(0, maxEnergy - baseStartingEnergy)
    : baseStartingEnergy;
  const requestedMaxAdjustment = subsidizedStarts
    ? Number(options.subsidizedStartsMaxSubsidy)
    : Number(options.payToWinMaxPayment);
  const maxPayment = Math.max(
    0,
    Math.min(
      defaultMaxAdjustment,
      Number.isFinite(requestedMaxAdjustment)
        ? Math.floor(requestedMaxAdjustment)
        : defaultMaxAdjustment
    )
  );
  const payments = Array.from({ length: maxPayment + 1 }, (_, payment) => payment);
  const pricingRouteMixtureByIndex = new Map(
    analyses.map((analysis) => [
      analysis.index,
      getTrafficRouteMixtureForAnalysis(analysis)
    ])
  );
  const selectedOtherRoutes = buildTrafficRouteMixtureEntries(
    analyses,
    focusIndex,
    new Map(
      analyses.map((analysis) => [
        analysis.index,
        getExplicitOccupancyWeight(occupancyByIndex, analysis.index)
      ])
    ),
    pricingRouteMixtureByIndex
  );

  const otherFirstLegRoutes = selectedOtherRoutes
    .map((entry) => ({
      route: entry.route?.legRoutes?.[0] ?? null,
      occupancyWeight: entry.occupancyWeight
    }))
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  const pricingTrafficAnalyses = analyses.map((analysis) => ({
    ...analysis,
    fullCourseRoute: analysis.fullCourseRoute ?? analysis.fullCourseRoutes?.[0] ?? null,
    trafficRouteMixture:
      pricingRouteMixtureByIndex.get(analysis.index) ?? analysis.trafficRouteMixture ?? null
  }));
  const candidates = focus.fullCourseRoutes.map((candidate, routeIndex) => {
    const trafficLegacy = getExpectedTrafficBreakdown(
      tileMap,
      candidate,
      selectedOtherRoutes,
      flags,
      {
        ...options,
        occupancyByIndex
      }
    );
    const traffic = getDamageEconomyTrafficRoutingBreakdown(
      tileMap,
      candidate,
      trafficLegacy,
      pricingTrafficAnalyses,
      focusIndex,
      flags,
      {
        ...options,
        occupancyByIndex,
        trafficRouteMixtureByIndex: pricingRouteMixtureByIndex
      }
    );
    const firstLegRoute = candidate?.legRoutes?.[0] ?? null;
    const firstTraffic = firstLegRoute
      ? getExpectedTrafficBreakdown(
        tileMap,
        firstLegRoute,
        otherFirstLegRoutes,
        [flags[0]],
        {
          ...options,
          occupancyByIndex,
          singleLegTraffic: true
        }
      )
      : { ranged: 0, nearby: 0, competition: 0, total: 0 };

    // v49dw production economy route-choice ownership. The pricing mode's mature
    // fixed-route Energy DP remains authoritative for the VALUE of changing
    // starting Energy. Completed effective RE plus that exact economy delta now
    // selects among already-discovered coherent full-course candidates. Legacy
    // pathfinder+traffic score remains only a comparator/pricing-space metric.
    const candidateLedger = getFixedRoutePricingBaseRELedger(
      tileMap,
      candidate,
      options
    );
    const trafficMental = summarizeTrafficAwarenessMentalIncrement(
      candidateLedger,
      traffic
    );
    const intrinsicRE = Number(candidateLedger?.observationalSubtotalWithMentalRE);
    const homingMissileStrategicCreditRE = Math.max(
      0,
      Number(candidateLedger?.homingMissileStrategicCreditRE) || 0
    );
    const robotLaserDamageRE = Math.max(
      0,
      Number(traffic?.damageEconomyRobotLaserIncrementRegisterEquivalents) || 0
    );
    const nearbyControlRE = Math.max(0, Number(traffic?.nearby) || 0) / REGISTER_TEMPO_COST;
    const residualRangedThreatRE = 0; // v49ej diagnostic-only legacy ranged score
    const competitionRE = Math.max(
      0,
      Number(traffic?.competition) || 0
    ) / REGISTER_TEMPO_COST;
    const trafficMentalRE = Math.max(0, Number(trafficMental?.incrementRE) || 0);
    const baseEffectiveRE = Number.isFinite(intrinsicRE)
      ? (
        intrinsicRE -
        homingMissileStrategicCreditRE +
        robotLaserDamageRE +
        nearbyControlRE +
        residualRangedThreatRE +
        competitionRE +
        trafficMentalRE
      )
      : Infinity;

    const scores = [];
    const effectiveREs = [];
    const economyAdjustmentREs = [];
    const zeroAdjustmentSelectorShadow = Boolean(
      options.selectorShadowZeroEnergyOnly &&
      payments.length === 1 &&
      payments[0] === 0
    );
    for (const payment of payments) {
      // v49cs Dev-only Normal calibration can ask for the selector-conditioned
      // 0E field without replaying the starting-Energy economy. At payment 0
      // the economy delta is definitionally zero, so this preserves completed
      // effective RE while avoiding hundreds of unnecessary fixed-route DP
      // replays in Copy All. Production pricing never sets this flag.
      if (zeroAdjustmentSelectorShadow && payment === 0) {
        const score = Number(candidate?.score);
        scores.push(score);
        economyAdjustmentREs.push(0);
        effectiveREs.push(Number.isFinite(baseEffectiveRE)
          ? Number(baseEffectiveRE.toFixed(6))
          : Infinity);
        continue;
      }

      const adjustedStartingEnergy = subsidizedStarts
        ? Math.min(maxEnergy, baseStartingEnergy + payment)
        : Math.max(0, baseStartingEnergy - payment);
      const rescored = rescoreFixedRouteUpgradeEconomy(
        tileMap,
        candidate,
        {
          ...options,
          startingEnergy: adjustedStartingEnergy,
          routeEconomyReferenceStartingEnergy: baseStartingEnergy
        }
      );
      const score = Number.isFinite(rescored?.score)
        ? rescored.score
        : Number(candidate?.score);
      scores.push(score);

      const currentPotentialR = Number(rescored?.startingEconomyPotentialR);
      const referencePotentialR = Number(rescored?.referenceStartingEconomyPotentialR);
      const economyAdjustmentRE = (
        Number.isFinite(currentPotentialR) && Number.isFinite(referencePotentialR)
      )
        ? referencePotentialR - currentPotentialR
        : 0;
      economyAdjustmentREs.push(Number(economyAdjustmentRE.toFixed(6)));
      effectiveREs.push(Number.isFinite(baseEffectiveRE)
        ? Number((baseEffectiveRE + economyAdjustmentRE).toFixed(6))
        : Infinity);
    }

    return {
      routeIndex,
      route: candidate,
      traffic,
      firstLegRoute,
      firstTraffic,
      scores,
      effectiveREs,
      economyAdjustmentREs,
      baseEffectiveRE: Number.isFinite(baseEffectiveRE)
        ? Number(baseEffectiveRE.toFixed(6))
        : Infinity
    };
  });

  if (!candidates.length) return null;

  const entries = payments.map((payment, paymentIndex) => {
    const baselineIntrinsic = Number(candidates[0]?.scores?.[paymentIndex]);
    let best = null;
    let reBest = null;
    candidates.forEach((candidate) => {
      const intrinsic = Number(candidate.scores[paymentIndex]);
      if (Number.isFinite(intrinsic)) {
        const rawGap = Number.isFinite(baselineIntrinsic)
          ? Math.max(0, intrinsic - baselineIntrinsic)
          : 0;
        const selectionValue = intrinsic + candidate.traffic.total + rawGap * 0.04;
        if (
          !best ||
          selectionValue < best.selectionValue - 0.001 ||
          (
            Math.abs(selectionValue - best.selectionValue) <= 0.001 &&
            candidate.routeIndex < best.routeIndex
          )
        ) {
          best = {
            ...candidate,
            intrinsic,
            selectionValue
          };
        }
      }

      const candidateEffectiveRE = Number(candidate.effectiveREs?.[paymentIndex]);
      if (
        Number.isFinite(candidateEffectiveRE) &&
        (
          !reBest ||
          candidateEffectiveRE < reBest.effectiveRE - 0.0001 ||
          (
            Math.abs(candidateEffectiveRE - reBest.effectiveRE) <= 0.0001 &&
            candidate.routeIndex < reBest.routeIndex
          )
        )
      ) {
        reBest = {
          ...candidate,
          effectiveRE: candidateEffectiveRE
        };
      }
    });
    if (!best) return null;
    const selected = reBest ?? best;
    const selectedIntrinsic = Number(selected.scores?.[paymentIndex]);
    const selectedEffectiveRE = Number(selected.effectiveREs?.[paymentIndex]);
    const adjustedStartingEnergy = subsidizedStarts
      ? Math.min(maxEnergy, baseStartingEnergy + payment)
      : Math.max(0, baseStartingEnergy - payment);
    const legacySelectedEffectiveRE = Number(best.effectiveREs?.[paymentIndex]);
    return {
      payment,
      energyAdjustment: payment,
      subsidy: subsidizedStarts ? payment : 0,
      startingEnergyAfterPayment: adjustedStartingEnergy,
      startingEnergyAfterAdjustment: adjustedStartingEnergy,
      fullCourseRouteIndex: selected.routeIndex,
      fullCourseIntrinsic: Number(selectedIntrinsic.toFixed(2)),
      fullCourseTraffic: Number(selected.traffic.total.toFixed(2)),
      fullTotal: Number((selectedIntrinsic + selected.traffic.total).toFixed(2)),
      firstLegIntrinsic: Number(selected.firstLegRoute?.score ?? Infinity),
      firstLegTraffic: Number(selected.firstTraffic.total.toFixed(2)),
      firstLegTotal: Number.isFinite(Number(selected.firstLegRoute?.score))
        ? Number((Number(selected.firstLegRoute.score) + selected.firstTraffic.total).toFixed(2))
        : Infinity,
      fullEffectiveRE: Number.isFinite(selectedEffectiveRE)
        ? Number(selectedEffectiveRE.toFixed(6))
        : (Number.isFinite(Number(reBest?.effectiveRE))
          ? Number(reBest.effectiveRE.toFixed(6))
          : null),
      fullEffectiveRERouteIndex: Number.isInteger(selected?.routeIndex)
        ? selected.routeIndex
        : null,
      legacyFullCourseRouteIndex: best.routeIndex,
      legacyFullCourseIntrinsic: Number(best.intrinsic.toFixed(2)),
      legacyFullCourseTraffic: Number(best.traffic.total.toFixed(2)),
      legacyFullTotal: Number((best.intrinsic + best.traffic.total).toFixed(2)),
      legacySelectedEffectiveRE: Number.isFinite(legacySelectedEffectiveRE)
        ? Number(legacySelectedEffectiveRE.toFixed(6))
        : null,
      legacySelectedEffectiveRERouteIndex: best.routeIndex,
      completedRERouteSelectionOwner:
        "completed-effective-re-plus-card-aware-starting-energy-delta-v49dw",
      legacyRouteSelectionComparator:
        "intrinsic-score-plus-traffic-plus-4pct-raw-gap"
    };
  }).filter(Boolean);

  return {
    index: focusIndex,
    baseStartingEnergy,
    maxEnergy,
    maxPayment,
    subsidizedStarts,
    entries
  };
}

export function recomputeFirstLegPressure(tileMap, firstLeg, options = {}) {
  const playerCount = options.playerCount ?? firstLeg.starts.length;
  const excludedIndices = new Set(options.excludedIndices ?? []);
  let startAnalyses = firstLeg.starts.map((analysis) => ({ ...analysis }));
  let fullCourseTraffic = firstLeg.summary.fullCourseTraffic ?? null;
  let expectedLegAnalyses = firstLeg.expectedLegAnalyses;

  if (
    !options.openingTrafficOnly &&
    firstLeg.summary.fullCourseRoutes &&
    Array.isArray(firstLeg.flags) &&
    firstLeg.flags.length
  ) {
    const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, firstLeg.flags, {
      ...options,
      playerCount,
      excludedIndices
    });
    startAnalyses = selection.starts.map((analysis) => (
      analysis.prePruned
        ? analysis
        : buildStartAnalysisForSelectedFullRoute(analysis)
    ));
    fullCourseTraffic = {
      ...(firstLeg.summary.fullCourseTraffic ?? {}),
      passes: selection.selectionPasses,
      routeSwitches: selection.routeSwitches,
      averagePenalty: selection.averageTrafficPenalty,
      maxPenalty: selection.maxTrafficPenalty ?? 0,
      averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
      averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
      averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
      averageForecastConfidence: selection.averageForecastConfidence ?? 1,
      minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
      averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
      confidenceWeighted: true,
      candidateDiagnostics: selection.candidateDiagnostics ?? [],
      commonOccupancyField: selection.commonOccupancyField ?? null,
      routeMixtureField: selection.routeMixtureField ?? null,
      routeMixtureOwnershipAudit:
        selection.routeMixtureOwnershipAudit ?? null,
      completedRouteOwnershipAudit:
        selection.completedRouteOwnershipAudit ?? null,
      routeFamilyDivergenceField:
        selection.routeFamilyDivergenceField ?? null
    };
    expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
      startAnalyses.filter((analysis) => !excludedIndices.has(analysis.index)),
      firstLeg.flags,
      playerCount
    ).slice(1);
  }

  const activeIndices = new Set(
    startAnalyses
      .filter((analysis) => analysis.reachable && analysis.routes?.length && !excludedIndices.has(analysis.index))
      .map((analysis) => analysis.index)
  );

  selectAndScoreStartAnalyses(tileMap, startAnalyses, firstLeg.goal, playerCount, activeIndices, options);
  applyIntrinsicFullCourseBalanceScores(startAnalyses, options);
  applyNormalFullCourseEffectiveREFairnessScores(tileMap, startAnalyses, options);
  const recomputed = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    firstLeg.goal,
    firstLeg.flags ?? new Array(firstLeg.summary.flagCount).fill(null),
    playerCount,
    options,
    excludedIndices
  );

  return {
    ...firstLeg,
    starts: startAnalyses,
    expectedLegAnalyses,
    summary: {
      ...firstLeg.summary,
      ...recomputed.summary,
      fullCourseTraffic,
      outliers: firstLeg.summary.outliers
    }
  };
}

export function analyzeFlagLeg(tileMap, from, goal, options = {}) {
  const facings = options.facings ?? ROTATION_ORDER;
  const routesPerFacing = options.routesPerFacing ?? 3;
  const maxDistinctRoutes = options.maxDistinctRoutes ?? 4;
  const previousLegRoutes = options.previousLegRoutes ?? [];
  const trafficScale = computeLegTrafficScale(options.playerCount ?? 4);
  const allRoutes = [];
  let cappedZeroRouteStarts = 0;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);

  const routeStarts = Array.isArray(options.startStates) && options.startStates.length
    ? options.startStates.map((state) => ({
      x: state.x,
      y: state.y,
      facing: state.facing ?? "E"
    }))
    : facings.map((facing) => ({
      x: from.x,
      y: from.y,
      facing
    }));

  routeStarts.forEach((routeStart) => {
    const sharedOptions = {
      maxRoutes: routesPerFacing,
      maxActions: options.maxActions,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      factoryRejects: Boolean(options.factoryRejects),
      classicSharedDeck: Boolean(options.classicSharedDeck),
      lessForeshadowing: Boolean(options.lessForeshadowing),
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      playerCount: options.playerCount,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      contextualEstimatedCardTransitionMemoContext:
        options.contextualEstimatedCardTransitionMemoContext ?? null,
      contextualEstimatedCardTransitionMemoRuleSignature:
        options.contextualEstimatedCardTransitionMemoRuleSignature ?? null,
      portalMap
    };
    const routes = options.physicalTimingOnly
      ? enumeratePhysicalTimingLegTemplates(
        tileMap,
        {
          state: routeStart,
          absoluteActions: Number(options.absoluteActions) || 0,
          history: [],
          energyReserve: getInitialRouteEnergyShadowReserve(sharedOptions),
          hazardExposure: 0
        },
        goal,
        {
          ...sharedOptions,
          contextualTelemetryKind: options.physicalTelemetryKind ?? "physical-preflight-leg",
          optionalTemplateExpansions: options.optionalTemplateExpansions ?? 80
        }
      )
      : enumerateRoutes(tileMap, routeStart, goal, sharedOptions);

    const searchMeta = routes.searchMeta ?? routes.contextualSearchMeta ?? null;
    if (searchMeta?.zeroRouteCapFailure) {
      cappedZeroRouteStarts += 1;
    }

    routes.forEach((route) => {
      allRoutes.push({
        ...route,
        startFacing: routeStart.facing,
        routeStart
      });
    });
  });

  const uniqueRoutes = dedupeRoutes(allRoutes).sort(compareScoredRouteLike);
  const distinctRoutes = selectDistinctRoutes(uniqueRoutes, goal, maxDistinctRoutes);
  const bestRoute = distinctRoutes[0] ?? null;
  const routeScores = distinctRoutes.map((route) => route.score);
  const routeDistances = distinctRoutes.map((route) => route.distance);
  const routeActions = distinctRoutes.map((route) => route.actions);
  const intraLegOverlap = averagePairwiseOverlap(distinctRoutes, goal);
  const crossLegOverlap = averageCrossLegOverlap(distinctRoutes, previousLegRoutes, goal);
  const intraLegThreat = averagePairwiseThreat(tileMap, distinctRoutes, options);
  const crossLegThreat = averageCrossLegThreat(tileMap, distinctRoutes, previousLegRoutes, options);
  const routeSpread = routeScores.length > 1 ? Math.max(...routeScores) - Math.min(...routeScores) : 0;
  const diversityScore = Number(
    Math.max(
      0,
      distinctRoutes.length * 18 -
      intraLegOverlap * (18 + 17 * trafficScale) -
      crossLegOverlap * (10 + 10 * trafficScale) -
      intraLegThreat * (0.35 + 0.45 * trafficScale) -
      crossLegThreat * (0.3 + 0.4 * trafficScale)
    ).toFixed(2)
  );
  const congestionScore = Number(
    (
      intraLegOverlap * (14 + 26 * trafficScale) +
      crossLegOverlap * (10 + 20 * trafficScale) +
      intraLegThreat * (0.8 + 1.4 * trafficScale) +
      crossLegThreat * (0.6 + 1.2 * trafficScale) +
      Math.max(0, 3 - distinctRoutes.length) * 10
    ).toFixed(2)
  );

  return {
    from,
    goal,
    routes: uniqueRoutes,
    distinctRoutes,
    summary: {
      routeCount: uniqueRoutes.length,
      distinctRouteCount: distinctRoutes.length,
      bestRouteScore: bestRoute?.score ?? Infinity,
      bestDistance: bestRoute?.distance ?? Infinity,
      averageRouteScore: Number(average(routeScores).toFixed(2)),
      averageRouteDistance: Number(average(routeDistances).toFixed(2)),
      averageRouteActions: Number(average(routeActions).toFixed(2)),
      routeSpread: Number(routeSpread.toFixed(2)),
      intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
      crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
      intraLegThreat: Number(intraLegThreat.toFixed(2)),
      crossLegThreat: Number(crossLegThreat.toFixed(2)),
      diversityScore,
      congestionScore,
      routeSearchHealth: {
        searchedStarts: routeStarts.length,
        cappedZeroRouteStarts
      }
    }
  };
}
// VERSION END: v49fo-randomizer-hotpath-fix
