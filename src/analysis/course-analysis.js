// Robo Rally Course Randomizer - start and first-leg course analysis (analyzeCourse)
import { buildPortalMap } from "./board-geometry.js";
import { enumeratePhysicalTimingLegTemplates } from "./contextual-search.js";
import { getInitialRouteEnergyShadowReserve } from "./energy-economy.js";
import { scoreFlagArea } from "./flag-area.js";
import { average, stdDev } from "./math.js";
import { getHomeRebootTokensForStart } from "./reboot-recovery.js";
import { getExpectedTrafficBreakdown } from "./route-evaluation.js";
import { enumerateRoutes } from "./route-search.js";
import { buildConditionalOccupancyMap, compareScoredRouteLike, dedupeRoutes } from "./traffic.js";

// v49dw ownership audit: this first-leg selector is retained only for legacy
// first-leg summary/construction/readability fields after full-course candidate
// selection. It does NOT own the production full-course route. The remaining
// route.score + traffic.total expression here is therefore descriptive debt for
// the later Course Notes/legacy-summary cleanup, not a route-ownership exception.
export function assignRoutesWithOverlap(tileMap, startAnalyses, goal, activeIndices = null, options = {}) {
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
export function selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, activeIndices = null, options = {}) {
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
export function summarizeFirstLegAnalyses(tileMap, startAnalyses, goal, flags, playerCount, options = {}, outlierSet = new Set(), outlierDiagnostics = new Map()) {
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
