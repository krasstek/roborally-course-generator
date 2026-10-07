// Robo Rally Course Randomizer - analysis telemetry
export function analysisTelemetryNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export const ANALYSIS_TELEMETRY_MAX_SEARCHES = 5000;
export const ANALYSIS_TELEMETRY = {
  routeSearches: [],
  // Running total of expansions over every completed route search. Unlike the
  // routeSearches log it is never capped, and reading it is cheap.
  completedRouteExpansions: 0,
  cooperativeIteratorSlices: 0,
  cooperativeIteratorWorkMs: 0,
  cooperativeBrowserYields: 0,
  cooperativeBrowserPausedMs: 0,
  cooperativeRouteSearchBrowserYields: 0,
  cooperativeMaxIteratorSliceMs: 0,
  cooperativeMaxIteratorSlicePhase: "none",
  cooperativeMaxIteratorSliceSearchKind: null
};

export function getCompletedRouteExpansions() {
  return ANALYSIS_TELEMETRY.completedRouteExpansions;
}

export function recordRouteSearchTelemetry(kind, startedAt, details = {}) {
  ANALYSIS_TELEMETRY.completedRouteExpansions += Number(details.expansions) || 0;
  const entry = {
    kind,
    durationMs: Number((
      Number.isFinite(Number(details.durationMs))
        ? Number(details.durationMs)
        : analysisTelemetryNow() - startedAt
    ).toFixed(2)),
    expansions: details.expansions ?? 0,
    maxExpansions: details.maxExpansions ?? 0,
    completedRoutes: details.completedRoutes ?? 0,
    returnedRoutes: details.returnedRoutes ?? details.completedRoutes ?? 0,
    hitExpansionCap: details.hitExpansionCap !== undefined
      ? Boolean(details.hitExpansionCap)
      : Boolean(
        details.maxExpansions > 0 &&
        (details.expansions ?? 0) >= details.maxExpansions
      ),
    start: details.start ?? null,
    goal: details.goal ?? null,
    legIndex: details.legIndex ?? null,
    actionHorizonStops: details.actionHorizonStops ?? 0,
    maxLocalActionsSeen: details.maxLocalActionsSeen ?? 0,
    hitActionHorizon: Boolean(details.hitActionHorizon || (details.actionHorizonStops ?? 0) > 0),
    zeroRouteHorizonFailure: Boolean(details.zeroRouteHorizonFailure),
    physicalCacheHits: details.physicalCacheHits ?? 0,
    physicalCacheMisses: details.physicalCacheMisses ?? 0,
    physicalTimingTemplate: Boolean(details.physicalTimingTemplate),
    resumedExhaustive: Boolean(details.resumedExhaustive),
    resumeCheckpointExpansions: details.resumeCheckpointExpansions ?? 0,
    resumeBoundedEndExpansions: details.resumeBoundedEndExpansions ?? 0,
    resumeReplayExpansions: details.resumeReplayExpansions ?? 0,
    resumeSavedRootExpansions: details.resumeSavedRootExpansions ?? 0,
    cooperativeSlices: details.cooperativeSlices ?? 0,
    cooperativePausedMs: details.cooperativePausedMs ?? 0,
    cooperativeMaxSliceWorkMs: details.cooperativeMaxSliceWorkMs ?? 0,
    contextualProfile: details.contextualProfile
      ? { ...details.contextualProfile }
      : null
  };

  if (ANALYSIS_TELEMETRY.routeSearches.length >= ANALYSIS_TELEMETRY_MAX_SEARCHES) {
    ANALYSIS_TELEMETRY.routeSearches.shift();
  }
  ANALYSIS_TELEMETRY.routeSearches.push(entry);
}
