// Robo Rally Course Randomizer - analysis-wide state: resets every module's telemetry and caches, and gathers the telemetry snapshot
import {
  DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE,
  DAMAGE_ECONOMY_PROGRAM_CACHE,
  DAMAGE_ECONOMY_SPAM_DRAW_CACHE,
  DAMAGE_ECONOMY_TELEMETRY,
  resetDamageEconomyRouteSummaryCaches
} from "./damage-economy.js";
import { DYNAMIC_ARCHIVE_CACHE_TELEMETRY } from "./movement.js";
import {
  PROGRAM_ACTION_TRANSITION_CACHE,
  PROGRAM_CHEAP_AVAILABILITY_CACHE,
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY,
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE,
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY,
  PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE,
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY,
  PROGRAM_EXACT_AVAILABILITY_CACHE,
  PROGRAM_RESOURCE_SUMMARY_CACHE,
  ROLLING_PROGRAM_CONTEXT_CACHE,
  resetRollingProgramSignatureIds
} from "./program-availability.js";
import {
  resetRENativeTrafficConfidenceProfileCache,
  resetTrafficIntrinsicRELedgerCache
} from "./route-evaluation.js";
import {
  resetFixedRoutePricingEconomyActivityCache,
  resetFixedRoutePricingEconomyCache,
  resetFixedRoutePricingRELedgerCache
} from "./route-pricing-economy.js";
import { ANALYSIS_TELEMETRY } from "./telemetry.js";
import {
  LATERAL_THREAT_CACHE,
  OVERLAP_PENALTY_CACHE,
  REAR_THREAT_CACHE,
  ROUTE_SIMILARITY_CACHE
} from "./traffic.js";

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
