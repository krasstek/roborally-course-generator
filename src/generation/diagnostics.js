// Robo Rally Course Randomizer - generation diagnostics: route-search profiles, rejection summaries and diagnostic text
import { SOFT_CANDIDATE_RETENTION_LIMIT } from "./config.js";
import { formatGenerationDuration } from "./scheduling.js";

export const CONTEXTUAL_PROFILE_TIME_KEYS = [
  "queueMs",
  "currentKeyMs",
  "goalCompletionMs",
  "simulationMs",
  "simulationHitMs",
  "simulationMissMs",
  "cardOptionsMs",
  "actionScoringMs",
  "energyMs",
  "archiveContextMs",
  "destinationBuildMs",
  "routeNodeBuildMs",
  "historyBuildMs",
  "nextKeyMs",
  "dominanceMs"
];
export const CONTEXTUAL_PROFILE_COUNT_KEYS = [
  "actionCandidates",
  "cardOptionCalls",
  "estimatedDemandMemoHits",
  "estimatedDemandMemoMisses",
  "estimatedForecastMemoHits",
  "estimatedForecastMemoMisses",
  "estimatedCompactCardMemoHits",
  "estimatedCompactCardMemoMisses",
  "simulationCalls",
  "blockedTransitions",
  "programLegalityPrunes",
  "destinationCandidates",
  "acceptedStates",
  "dominatedStates",
  "earlyDominanceEnergyBoundPrunes",
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
  "retainedDominanceStates",
  "timingSampledNodes",
  "timingPopulationNodes",
  "dominanceUsageParetoStates",
  "dominanceUsageParetoDominated",
  "dominanceUsageParetoMultiStateGroups",
];

export function createEmptyContextualProfile() {
  return Object.fromEntries([
    ...CONTEXTUAL_PROFILE_TIME_KEYS,
    ...CONTEXTUAL_PROFILE_COUNT_KEYS
  ].map((key) => [key, 0]));
}

export function addContextualProfile(target, source) {
  if (!source) return target;
  for (const key of CONTEXTUAL_PROFILE_TIME_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  }
  for (const key of CONTEXTUAL_PROFILE_COUNT_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  }
  return target;
}

export function finalizeContextualProfile(profile) {
  const finalized = { ...profile };
  for (const key of CONTEXTUAL_PROFILE_TIME_KEYS) {
    finalized[key] = Number((finalized[key] ?? 0).toFixed(2));
  }
  return finalized;
}

export function summarizeRouteSearchDelta(before, after) {
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

export function cloneContextualSearchHealth(health = null) {
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

export function compactRouteWork(work = null) {
  if (!work) return null;
  return {
    searches: work.searches ?? 0,
    expansions: work.expansions ?? 0,
    durationMs: work.durationMs ?? 0,
    capped: work.capped ?? 0
  };
}

export function getGenerationRejectionCategory(scenario, fallbackReason = "") {
  const failures = scenario?.metrics?.hardFailures ?? [];
  const softFailures = scenario?.metrics?.softFailures ?? [];
  if (failures.includes("normal-start-balance") || softFailures.includes("normal-start-balance")) return "balance";
  if (
    failures.includes("competitive-start-balance") ||
    failures.includes("competitive-start-balance-hard") ||
    softFailures.includes("competitive-start-balance")
  ) return "competitive-balance";
  if (failures.includes("competitive-start-availability") || softFailures.includes("competitive-start-availability")) return "competitive-start-capacity";
  if (failures.includes("usable-starts") || failures.includes("reachable-starts")) return "start-capacity";
  if (failures.includes("unused-board") || softFailures.includes("unused-board")) return "unused-board";
  if (failures.includes("too-short") || softFailures.includes("too-short")) return "too-short";
  if (failures.includes("extra-docks")) return "extra-docks";
  if (softFailures.includes("sandwiched-side-use")) return "sandwiched-layout";
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

export function addRouteSearchKindTotals(target = {}, source = null) {
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

export function finalizeRouteSearchKindTotals(totals = null) {
  if (!totals || typeof totals !== "object") return null;
  return Object.fromEntries(Object.entries(totals).map(([kind, bucket]) => [kind, {
    searches: bucket.searches ?? 0,
    expansions: bucket.expansions ?? 0,
    durationMs: Number((bucket.durationMs ?? 0).toFixed(2)),
    capped: bucket.capped ?? 0
  }]));
}

export function formatRouteSearchKindBreakdown(totals = null) {
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

export function summarizeGenerationRejectionEvents(events = []) {
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

export function formatContextualProfile(profile) {
  if (!profile) return "n/a";
  const hasPhysicalSplit =
    (profile.simulationHitMs ?? 0) > 0 || (profile.simulationMissMs ?? 0) > 0;
  const timed = [
    ...(hasPhysicalSplit
      ? [
        ["physicalHit", profile.simulationHitMs ?? 0],
        ["physicalMiss", profile.simulationMissMs ?? 0]
      ]
      : [["simulate", profile.simulationMs ?? 0]]),
    ["cards", profile.cardOptionsMs ?? 0],
    ["energy", profile.energyMs ?? 0],
    ["archive/context", profile.archiveContextMs ?? 0],
    ["actionScore", profile.actionScoringMs ?? 0],
    ["keys", (profile.currentKeyMs ?? 0) + (profile.nextKeyMs ?? 0)],
    ["dominance", profile.dominanceMs ?? 0],
    ["heap", profile.queueMs ?? 0],
    ["routeBuild", profile.routeNodeBuildMs ?? 0],
    ["build", profile.destinationBuildMs ?? 0],
    ["history", profile.historyBuildMs ?? 0],
    ["goal", profile.goalCompletionMs ?? 0]
  ].sort((left, right) => right[1] - left[1]);
  return timed
    .map(([label, ms]) => `${label} ${formatGenerationDuration(ms)}`)
    .join(", ");
}

export function hasContextualTimingProfile(profile) {
  if (!profile) return false;
  return [
    profile.simulationMs,
    profile.simulationHitMs,
    profile.simulationMissMs,
    profile.cardOptionsMs,
    profile.energyMs,
    profile.archiveContextMs,
    profile.actionScoringMs,
    profile.currentKeyMs,
    profile.nextKeyMs,
    profile.dominanceMs,
    profile.queueMs,
    profile.routeNodeBuildMs,
    profile.destinationBuildMs,
    profile.historyBuildMs,
    profile.goalCompletionMs
  ].some((value) => (Number(value) || 0) > 0);
}

export function formatContextualProfileShare(profile, contextualDurationMs) {
  if (!profile || !Number.isFinite(contextualDurationMs) || contextualDurationMs <= 0) {
    return "n/a";
  }
  const hasPhysicalSplit =
    (profile.simulationHitMs ?? 0) > 0 || (profile.simulationMissMs ?? 0) > 0;
  const timed = [
    ...(hasPhysicalSplit
      ? [
        ["physicalHit", profile.simulationHitMs ?? 0],
        ["physicalMiss", profile.simulationMissMs ?? 0]
      ]
      : [["simulate", profile.simulationMs ?? 0]]),
    ["cards", profile.cardOptionsMs ?? 0],
    ["energy", profile.energyMs ?? 0],
    ["archive/context", profile.archiveContextMs ?? 0],
    ["actionScore", profile.actionScoringMs ?? 0],
    ["keys", (profile.currentKeyMs ?? 0) + (profile.nextKeyMs ?? 0)],
    ["dominance", profile.dominanceMs ?? 0],
    ["heap", profile.queueMs ?? 0],
    ["routeBuild", profile.routeNodeBuildMs ?? 0],
    ["build", profile.destinationBuildMs ?? 0],
    ["history", profile.historyBuildMs ?? 0],
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

export function formatMajorContextualProfileShare(profile, contextualDurationMs) {
  if (!profile || !Number.isFinite(contextualDurationMs) || contextualDurationMs <= 0) {
    return "n/a";
  }
  const timed = [
    ["cards", profile.cardOptionsMs ?? 0],
    ["physicalMiss", profile.simulationMissMs ?? 0],
    ["physicalHit", profile.simulationHitMs ?? 0],
    ["energy", profile.energyMs ?? 0],
  ];
  const accountedMs = timed.reduce((sum, entry) => sum + entry[1], 0);
  timed.push(["other", Math.max(0, contextualDurationMs - accountedMs)]);
  return timed
    .filter(([, ms]) => ms >= 0.5)
    .map(([label, ms]) => {
      const share = Math.round((ms / contextualDurationMs) * 100);
      return `${label} ${share}%/${formatGenerationDuration(ms)}`;
    })
    .join(", ");
}


export function formatPhysicalMissProfileShare(profile) {
  if (!profile || (profile.physicalMissSampledCalls ?? 0) <= 0) return "n/a";
  const totalMs = Math.max(0, Number(profile.simulationMissMs) || 0);
  if (totalMs <= 0) return "n/a";
  const timed = [
    ["programmed", profile.physicalMissProgrammedMs ?? 0],
    ["blueConv", profile.physicalMissBlueConveyorMs ?? 0],
    ["greenConv", profile.physicalMissGreenConveyorMs ?? 0],
    ["current", profile.physicalMissCurrentMs ?? 0],
    ["pusher", profile.physicalMissPusherMs ?? 0],
    ["gear", profile.physicalMissGearMs ?? 0],
    ["crusher", profile.physicalMissCrusherMs ?? 0],
    ["endReg", profile.physicalMissEndRegisterMs ?? 0],
    ["lookup", profile.physicalMissLookupMs ?? 0],
    ["clone", profile.physicalMissCloneMs ?? 0],
    ["recoveryPressure", profile.physicalMissRecoveryPressureMs ?? 0],
    ["cacheStore", profile.physicalMissCacheStoreMs ?? 0],
    ["finalize", profile.physicalMissFinalizeMs ?? 0]
  ];
  const accountedMs = timed.reduce((sum, [, ms]) => sum + Math.max(0, Number(ms) || 0), 0);
  timed.push(["other", Math.max(0, totalMs - accountedMs)]);
  return timed
    .filter(([, ms]) => ms >= 0.5)
    .sort((left, right) => right[1] - left[1])
    .map(([label, ms]) => {
      const share = Math.round((ms / totalMs) * 100);
      return `${label} ${share}%/${formatGenerationDuration(ms)}`;
    })
    .join(", ");
}

export function formatProgrammedPhysicalMissProfileShare(profile) {
  if (!profile) return "n/a";
  const totalMs = Math.max(0, Number(profile.physicalMissProgrammedMs) || 0);
  if (totalMs <= 0) return "n/a";
  const timed = [
    ["moveCheck", profile.physicalMissProgramMoveCheckMs ?? 0],
    ["blocked", profile.physicalMissProgramBlockedMs ?? 0],
    ["landing", profile.physicalMissProgramLandingMs ?? 0],
    ["hazard", profile.physicalMissProgramHazardMs ?? 0],
    ["pressure", profile.physicalMissProgramPressureMs ?? 0],
    ["teleporter", profile.physicalMissProgramTeleporterMs ?? 0],
    ["oil", profile.physicalMissProgramOilMs ?? 0],
    ["bookkeeping", profile.physicalMissProgramBookkeepingMs ?? 0],
    ["start", profile.physicalMissProgramStartMs ?? 0]
  ];
  const accountedMs = timed.reduce((sum, [, ms]) => sum + Math.max(0, Number(ms) || 0), 0);
  timed.push(["other", Math.max(0, totalMs - accountedMs)]);
  return timed
    .filter(([, ms]) => ms >= 0.5)
    .sort((left, right) => right[1] - left[1])
    .map(([label, ms]) => {
      const share = Math.round((ms / totalMs) * 100);
      return `${label} ${share}%/${formatGenerationDuration(ms)}`;
    })
    .join(", ");
}

export function formatContextualEfficiency(profile, contextualExpansions = 0) {
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
    `early-energy ${profile.earlyDominanceEnergyBoundPrunes ?? 0}`,
    `accepted ${profile.acceptedStates ?? 0}`,
    `retained-state sum ${profile.retainedDominanceStates ?? 0}`,
    `card-option calls ${profile.cardOptionCalls ?? 0}`,
    `goals ${profile.completedGoals ?? 0}`
  ].join(", ");
}

export function formatContextualGoalSearchHealth(profile, contextualSearches = 0) {
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

export function formatContextualFidelityHealth(profile) {
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
export function formatContextualDominanceKeyDiagnostics(profile) {
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

export function formatContextualUsageParetoDiagnostics(profile) {
  const states = profile?.dominanceUsageParetoStates ?? 0;
  const dominated = profile?.dominanceUsageParetoDominated ?? 0;
  if (!(states > 0)) return null;
  const rate = `${Math.round((dominated / states) * 100)}%`;
  return `tracked-card Pareto ${dominated}/${states} (${rate}) potentially dominated across ${profile?.dominanceUsageParetoMultiStateGroups ?? 0} multi-state groups`;
}

export function roundCourseEvaluationNumbers(text) {
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

export function formatContextualCounts(profile) {
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

export function describeGenerationRejection(scenario, fallbackStage = "") {
  if (!scenario) {
    return fallbackStage
      ? `no scenario after ${fallbackStage}`
      : "candidate rejected before final classification";
  }
  const reasons = [...(scenario.metrics?.hardFailures ?? [])];
  if (!scenario.metrics?.hardFailures?.length && !scenario.metrics?.acceptable) {
    const targetAcceptance = scenario.metrics?.targetAcceptance ?? null;
    if (targetAcceptance?.grossDifficultyMismatch || targetAcceptance?.grossLengthMismatch) {
      const axes = [
        targetAcceptance.grossDifficultyMismatch ? "difficulty" : null,
        targetAcceptance.grossLengthMismatch ? "length" : null
      ].filter(Boolean).join("+");
      reasons.push(`strong target-axis mismatch ${axes}`);
    } else if (scenario.metrics?.fairnessAcceptance?.ordinaryAcceptable === false) {
      reasons.push(
        `fairness overflow ${scenario.metrics.fairnessAcceptance.overflowRE ?? "n/a"}RE/` +
        `${scenario.metrics.fairnessAcceptance.softOverflowAllowance ?? "n/a"}RE soft allowance`
      );
    } else {
      reasons.push(`soft fit ${scenario.metrics?.fitScore ?? "n/a"}/${scenario.metrics?.softFitLimit ?? SOFT_CANDIDATE_RETENTION_LIMIT}`);
    }
  }
  if (!scenario.preferences?.targetGuidanceOnlyDifficulty && (scenario.metrics?.difficultyFit ?? 0) > 0) {
    reasons.push(`difficulty ${scenario.metrics.difficultyDirection ?? "mismatch"}`);
  }
  if (!scenario.preferences?.targetGuidanceOnlyLength && (scenario.metrics?.lengthFit ?? 0) > 0) {
    reasons.push(`length ${scenario.metrics.lengthDirection ?? "mismatch"}`);
  }
  return reasons.length ? reasons.join(", ") : "better fit still required";
}

export function compactGenerationStage(stage = "") {
  return String(stage)
    .replace(/^Evaluating starting spaces — /, "Routing starts — ")
    .replace(/^Checking route fairness and removable pieces — /, "Checking fairness — ")
    .replace(/^Rejecting gross mismatch — /, "Rejected: ")
    .trim();
}
