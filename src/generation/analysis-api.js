// Robo Rally Course Randomizer - analysis functions as used by generation (compatibility wrappers from the dynamic-import era; to be removed in the split's tidy-up)
import {
  ANALYZE_BUILD_ID,
  analyzeFullCourse,
  analyzeFullCourseCooperative,
  clearAnalysisCaches,
  getAnalysisTelemetrySnapshot,
  resetAnalysisTelemetry,
  summarizePathfinderObjectiveAudit,
  summarizeTrafficOwnershipAudit
} from "../../analyze.js";

export const analyzeBuildIdSafe = typeof ANALYZE_BUILD_ID === "string" && ANALYZE_BUILD_ID
  ? ANALYZE_BUILD_ID
  : "pre-v49m/unknown";

// Cache clearing is a performance optimization, not a correctness requirement.
// Keep startup/generation working if the browser temporarily resolves an older
// analyze.js module that does not expose this helper.
export const clearAnalysisCachesSafe = typeof clearAnalysisCaches === "function"
  ? clearAnalysisCaches
  : () => {};

export const resetAnalysisTelemetrySafe = typeof resetAnalysisTelemetry === "function"
  ? resetAnalysisTelemetry
  : () => {};
export const analyzeFullCourseCooperativeSafe = typeof analyzeFullCourseCooperative === "function"
  ? analyzeFullCourseCooperative
  : async (...args) => analyzeFullCourse(...args);
export const summarizePathfinderObjectiveAuditSafe =
  typeof summarizePathfinderObjectiveAudit === "function"
    ? summarizePathfinderObjectiveAudit
    : () => null;

export const summarizeTrafficOwnershipAuditSafe =
  typeof summarizeTrafficOwnershipAudit === "function"
    ? summarizeTrafficOwnershipAudit
    : () => null;

export const getAnalysisTelemetrySnapshotSafe = typeof getAnalysisTelemetrySnapshot === "function"
  ? getAnalysisTelemetrySnapshot
  : () => ({
    routeSearches: [],
    routeSearchCount: 0,
    totalExpansions: 0,
    totalDurationMs: 0,
    contextualProfileDurationMs: 0,
    cappedSearches: 0,
    slowestSearch: null,
    totalsByKind: {},
    cooperativeSearchTotals: { searches: 0, slices: 0, pausedMs: 0, maxSliceWorkMs: 0 },
    cooperativeIteratorTotals: { slices: 0, workMs: 0, browserYields: 0, browserPausedMs: 0, maxSliceMs: 0 },
    physicalCacheTotals: { hits: 0, misses: 0 },
    dynamicArchivePhysicalCacheTotals: null,
    cheapProgramAvailabilityTotals: null,
    cheapProgramUnionAvailabilityTotals: null,
    contextualProfileTotals: {
      queueMs: 0,
      currentKeyMs: 0,
      goalCompletionMs: 0,
      simulationMs: 0,
      simulationHitMs: 0,
      simulationMissMs: 0,
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
      retainedDominanceStates: 0,
      timingSampledNodes: 0,
      timingPopulationNodes: 0,
      dominanceUsageParetoStates: 0,
      dominanceUsageParetoDominated: 0,
      dominanceUsageParetoMultiStateGroups: 0,
    }
  });
