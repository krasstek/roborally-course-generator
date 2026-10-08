// Robo Rally Course Randomizer - text reports: copy summary, benchmark summary, Course Evaluation report
import {
  ANALYZE_BUILD_ID,
  getDamageEconomyTelemetrySnapshot,
  ROUTE_ENERGY_ECONOMY_DEFAULTS,
  summarizeDamageEconomyFoundationForRoute,
  summarizePathfinderObjectiveAudit,
  summarizeTrafficOwnershipAudit
} from "../../analyze.js";
import { getCheckpointPlacementAdvisory } from "../../course-notes.js";
import { getPlayableCheckpoints } from "../generation/checkpoints.js";
import {
  DEFAULT_STARTING_ENERGY,
  DEFAULT_STARTING_UPGRADE_CARDS,
  NORMAL_START_FAIRNESS_STDDEV_LIMIT,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
  SOFT_CANDIDATE_RETENTION_LIMIT,
  SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY
} from "../generation/config.js";
import {
  addDevTiming,
  formatDevMilliseconds,
  getCachedRouteReplay,
  getDamageFoundationScenarioOptions,
  getDamageFoundationTrafficContext,
  getScenarioDevReplayCache
} from "../generation/dev-replay.js";
import {
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
  hasContextualTimingProfile,
  roundCourseEvaluationNumbers,
  summarizeGenerationRejectionEvents
} from "../generation/diagnostics.js";
import {
  RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE,
  buildRETurnDifficultyCandidatePoolShadow,
  buildRETurnDifficultyShadow
} from "../generation/difficulty-metrics.js";
import { isDevViewEnabled } from "../generation/environment.js";
import { getScenarioSelectedRouteFingerprint } from "../generation/fingerprints.js";
import {
  formatGenerationModeLabel,
  getGenerationModeProfile,
  getScenarioGenerationMaxAttempts,
  getScenarioGenerationMode
} from "../generation/generation-modes.js";
import {
  formatDifficultyLabel,
  formatLegacyDifficultyLabel,
  formatLengthLabel,
  formatPresentedDifficultyLabel
} from "../generation/labels.js";
import { buildLengthOwnerCandidatePoolShadow } from "../generation/length-metrics.js";
import { LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER } from "../generation/play-time.js";
import {
  formatExpansionName,
  formatOverlayMode,
  getSelectedExpansionIds,
  normalizeBoardSpread
} from "../generation/preferences.js";
import { formatDevGenerationSeed } from "../generation/random.js";
import { formatGenerationDuration } from "../generation/scheduling.js";
import {
  formatStartBalanceLabel,
  medianValue,
  normalizeStartBalance
} from "../generation/start-balance.js";
import { formatPayToWinEnergyCost, getPayToWinDenialCost } from "../generation/start-pricing.js";
import {
  MIN_WALL_CLOCK_TURN_INDEX,
  WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN
} from "../generation/targets.js";
import { MAIN_BUILD_ID } from "./build-info.js";
import { formatRegisterEquivalentLedgerLines, normalizeSelectedLegIndices } from "./dev-view.js";
import { describeAllowedVariants, getVariantImpactSummary } from "./rules-notes.js";

export function buildScenarioCopySummary(scenario) {
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
    const analyzerBuild = diagnostics.analyzeBuildId ?? ANALYZE_BUILD_ID;
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

export function buildScenarioBenchmarkSummary(scenario) {
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


export function buildDamageFoundationReportLines(scenario, options = {}) {
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



export function buildScenarioReport(scenario, selectedLegIndices = null) {
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
    `Analyzer build: ${scenario.generationDiagnostics?.analyzeBuildId ?? ANALYZE_BUILD_ID}`,
    `UI build: ${MAIN_BUILD_ID}`,
    `Start balance: ${formatStartBalanceLabel(scenario.preferences?.startBalance)} (${normalizeStartBalance(scenario.preferences?.startBalance)})`,
    Number.isFinite(Number(scenario?.devPerformance?.generateClickToRenderMs))
      ? `Dev render timing: Generate click -> first rendered course ${formatDevMilliseconds(Number(scenario.devPerformance.generateClickToRenderMs))}; last Dev render ${formatDevMilliseconds(Number(scenario.devPerformance.lastRenderMs) || 0)}`
      : "Dev render timing: first-render measurement unavailable",
    (() => {
      const audit = summarizePathfinderObjectiveAudit();
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
      : `Cooperative yielding v49o: telemetry unavailable from analyzer build ${scenario.generationDiagnostics?.analyzeBuildId ?? ANALYZE_BUILD_ID}.`,
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
        const audit = summarizeTrafficOwnershipAudit();
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
