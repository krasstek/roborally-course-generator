// Robo Rally Course Randomizer - full-course analysis: seeded and contextual full-course routing across all legs, cooperative driver, focus payment curves, first-leg pressure, single-leg analysis
import { buildPortalMap, cloneState, stateKey } from "./board-geometry.js";
import { REGISTER_COUNT, REGISTER_TEMPO_COST, ROTATION_ORDER } from "./constants.js";
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
} from "./contextual-search.js";
import { selectAndScoreStartAnalyses, summarizeFirstLegAnalyses } from "./course-analysis.js";
import { DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE } from "./damage-economy.js";
import {
  applyIntrinsicDamageEconomyRoutingScore,
  getDamageEconomyTrafficRoutingBreakdown
} from "./damage-routing.js";
import {
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getInitialRouteEnergyShadowReserve
} from "./energy-economy.js";
import { average, clamp } from "./math.js";
import {
  cloneEstimatedCardForecastFrontier,
  getCompactProgramCardStateFromHistory,
  getProgramHistoryWindow,
  scoreCompactProgramCardSequenceUntilFailure,
  walkEstimatedCardForecast
} from "./program-availability.js";
import {
  getEstimatedDemandStateFromCompactCardState,
  walkEstimatedProgramDemand
} from "./program-demand.js";
import {
  getCompletedRoutePostbuildScoreAdjustment,
  replaySearchIntrinsicMentalForContext,
  summarizeTrafficAwarenessMentalIncrement
} from "./re-ledger.js";
import {
  getElapsedAbsoluteActionsAfterTransitions,
  getHomeRebootTokensForStart,
  getRebootEndedAbsoluteActions,
  getTransitionAbsoluteAction,
  getTurnEndAfterActionIndexes
} from "./reboot-recovery.js";
import { getExpectedTrafficBreakdown } from "./route-evaluation.js";
import {
  getFixedRoutePricingBaseRELedger,
  rescoreFixedRouteUpgradeEconomy
} from "./route-pricing-economy.js";
import {
  enumerateFullCourseRoutes,
  enumerateRoutes,
  getDynamicArchiveStateKey,
  getNextDynamicArchivePoint
} from "./route-search.js";
import {
  applyIntrinsicFullCourseBalanceScores,
  applyNormalFullCourseEffectiveREFairnessScores,
  buildExpectedLegAnalysesFromFullRoutes,
  buildStartAnalysisForSelectedFullRoute,
  prepareFullCourseCandidate,
  selectCorridorDiverseFullCourseRoutes,
  selectFullCourseRoutesForStarts
} from "./route-selection.js";
import { ANALYSIS_TELEMETRY, analysisTelemetryNow } from "./telemetry.js";
import {
  FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT,
  FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
  TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
  averageCrossLegOverlap,
  averageCrossLegThreat,
  averagePairwiseOverlap,
  averagePairwiseThreat,
  buildConditionalOccupancyMap,
  buildTrafficRouteMixture,
  buildTrafficRouteMixtureEntries,
  compareScoredRouteLike,
  computeLegTrafficScale,
  dedupeRoutes,
  getExplicitOccupancyWeight,
  getForecastTimeConfidence,
  getTrafficAlternateEffortScale,
  getTrafficAlternateHardPressureStrength,
  getTrafficAlternateSearchEnvelope,
  getTrafficForecastElapsedRegisters,
  getTrafficRouteMixtureForAnalysis,
  restoreRENativeTrafficAlternateEffortForDamagePressure,
  routeSimilarity,
  selectContextualTrafficAlternativeRoutes,
  selectDistinctRoutes,
  summarizeFullCourseCandidateDiversity
} from "./traffic.js";

export const CONTEXTUAL_OPENING_ROUTES = 2;
export const CONTEXTUAL_OPENING_EXPANSIONS = 7000;
export const CONTEXTUAL_TEMPLATE_POOL = 6;
export const CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT = 14;

export function cloneContextualFullRouteForReuse(route) {
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

export function analyzeSeededFullCourseContextual(tileMap, starts, flags, options = {}) {
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

export function normalizeOpeningSeedRoute(route) {
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

export function getContextualOpeningSeedMap(options = {}) {
  const analyses = Array.isArray(options.contextualOpeningSeedAnalyses)
    ? options.contextualOpeningSeedAnalyses
    : [];
  return new Map(analyses.map((analysis, index) => [
    Number.isInteger(analysis?.index) ? analysis.index : index,
    analysis
  ]));
}

export function* analyzeFullCourseContextualSteps(
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

export function analyzeFullCourseContextual(tileMap, starts, flags, options = {}) {
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
