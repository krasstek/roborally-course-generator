// Robo Rally Course Randomizer - full-course route selection: corridor diversity, effective-RE route mixtures, fairness scores and expected leg analyses
import { REGISTER_TEMPO_COST } from "./constants.js";
import { DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE } from "./damage-economy.js";
import { getDamageEconomyTrafficRoutingBreakdown } from "./damage-routing.js";
import { average, clamp } from "../shared/math.js";
import { summarizeTrafficAwarenessMentalIncrement } from "./re-ledger.js";
import {
  getExpectedTrafficBreakdown,
  summarizeRegisterEquivalentLedger
} from "./route-evaluation.js";
import { sliceFullCourseRoute } from "./route-search.js";
import {
  FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT,
  FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
  applyTrafficGraceToRoute,
  averageCrossLegOverlap,
  averagePairwiseOverlap,
  buildConditionalOccupancyMap,
  buildStartOccupancyMap,
  buildTrafficRouteMixture,
  buildTrafficRouteMixtureEntries,
  compareScoredRouteLike,
  getOccupancyQualityScore,
  routeSimilarity,
  summarizeFullCourseCandidateDiversity,
  summarizeTrafficCompletedRouteOwnershipAudit,
  summarizeTrafficRouteFamilyDivergence,
  summarizeTrafficRouteMixtureOwnershipAudit,
  summarizeTrafficRouteMixtures,
  trafficRouteMixturesDiffer
} from "./traffic.js";

export function summarizeExpectedFullCourseLegRoutes(routes, previousRoutes, goal, playerCount = 4) {
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


export function prepareFullCourseCandidate(route, flags) {
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

export function getFullCourseCorridorDiversity(routeA, routeB, flags) {
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

export function selectCorridorDiverseFullCourseRoutes(routes, flags, limit = 3) {
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


export function getTrafficRouteMixtureEffectiveREQuality(
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

export function buildEffectiveRERouteMixture(
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

export function selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, options = {}) {
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
export function buildStartAnalysisForSelectedFullRoute(analysis) {
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

export function applyIntrinsicFullCourseBalanceScores(startAnalyses, options = {}) {
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
export function applyNormalFullCourseEffectiveREFairnessScores(
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

export function buildExpectedLegAnalysesFromFullRoutes(startAnalyses, flags, playerCount) {
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
