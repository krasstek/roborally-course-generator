// Robo Rally Course Randomizer - analysis orchestration: course preflight, route-aware battery scoring options, start screening, analyzeFlagSequence
import {
  analyzeCourse,
  analyzeFlagLeg,
  analyzeFullCourse,
  getRouteEnergyEconomyConfig,
  recomputeFirstLegPressure
} from "../../analyze.js";
import { applyCompetitiveStrategicBlocking } from "./competitive.js";
import {
  COURSE_PREFLIGHT_DIFFICULTY_MARGIN,
  COURSE_PREFLIGHT_LATER_MAX_ACTIONS,
  COURSE_PREFLIGHT_LENGTH_MARGIN,
  COURSE_PREFLIGHT_OPENING_MAX_ACTIONS,
  LIGHT_START_MAX_ACTIONS,
  LIGHT_START_MAX_EXPANSIONS,
  NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE,
  NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  NORMAL_FULL_COURSE_TRAFFIC_PASSES,
  NORMAL_PRUNE_BATCH_SIZE,
  NORMAL_START_FAIRNESS_STDDEV_LIMIT,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
} from "./config.js";
import { shouldUseCompactLengthFit } from "./course-quality.js";
import {
  applyVariantDifficultyModifiers,
  computeBoardHarshness,
  computeDifficultyRaw,
  computeLaterCheckpointPressure
} from "./difficulty-metrics.js";
import {
  formatGenerationModeLabel,
  getGenerationModeProfile,
  normalizeGenerationMode
} from "./generation-modes.js";
import { pointOnPlacement } from "./layout-geometry.js";
import { computeLengthMetrics } from "./length-metrics.js";
import { buildMovingTargetTimelines, summarizeMovingTargets } from "./moving-targets.js";
import { nextEventLoopTurn } from "./scheduling.js";
import {
  adjustStartOutliersForCourseLength,
  chooseNormalStartBalanceRemoval,
  formatStartBalanceLabel,
  getActivePruningStarts,
  getNormalRegisterDurationGuardrail,
  getNormalResidualBalanceSelectionPenalty,
  getNormalStartDispersion,
  getNormalStartPruneBatchSize,
  getStartBalanceProfile,
  mapMaybePromise,
  medianValue,
  normalizeStartBalance,
  rankNormalEffectiveREOutliers,
  runIterativeStartBalancing,
  summarizePostBalanceStartResiduals
} from "./start-balance.js";
import { normalizeRoutedFirstLeg, replayStartEnergyRescues } from "./route-field.js";
import { applyPayToWinStartPricing } from "./start-pricing.js";
import { GROSS_DIFFICULTY_ABORT_BANDS, GROSS_LENGTH_ABORT_BANDS } from "./targets.js";
import { getRouteAnalysisVariantOptions } from "./variant-availability.js";

export function getCoursePreflightOpeningMinimum(startCount, playerCount, preferences = {}) {
  if (preferences.virtualBots) {
    return Math.min(startCount, 1);
  }
  if (preferences.payToWin) {
    return Math.min(startCount, Math.max(1, playerCount));
  }

  // Normal's hard preflight floor is only the number of robots that must be able
  // to start. Fairness surplus is decided later from full-course intrinsic quality
  // plus opening traffic; the cheap Flag-1 sketch must not pre-prune that choice.
  return Math.min(startCount, Math.max(1, playerCount));
}

export function uniquePreflightStates(routes = []) {
  const seen = new Set();
  const states = [];
  for (const route of routes) {
    const state = route?.finalState;
    if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) continue;
    const key = `${state.x},${state.y},${state.facing ?? "E"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    states.push({ x: state.x, y: state.y, facing: state.facing ?? "E" });
  }
  return states;
}

export function buildCoursePreflightSequence(tileMap, starts, flags, playerCount, options = {}) {
  const generationProfile = getGenerationModeProfile(options);
  if (!flags.length || !starts.length) {
    return {
      valid: false,
      reason: "no starts or checkpoints available for preflight",
      opening: null,
      sequence: null,
      openingRoutedCount: 0,
      requiredOpeningCount: 0,
      intrinsicOutliers: [],
      excludedIndices: new Set(),
      laterLegs: []
    };
  }

  const movingTargetTimelines = options.movingTargetTimelines ?? buildMovingTargetTimelines(
    tileMap,
    flags,
    options.movingTargets,
    { maxActions: 16 }
  );
  const firstGoal = flags[0];
  const requiredOpeningCount = getCoursePreflightOpeningMinimum(
    starts.length,
    playerCount,
    options
  );
  const opening = analyzeCourse(tileMap, starts, firstGoal, {
    flags: [firstGoal],
    maxRoutes: 1,
    skipTraffic: true,
    playerCount,
    maxActions: COURSE_PREFLIGHT_OPENING_MAX_ACTIONS,
    maxExpansions: Math.min(generationProfile.preflightOpeningExpansions, 700),
    physicalTimingOnly: true,
    physicalTelemetryKind: "physical-preflight-opening",
    optionalTemplateExpansions: 60,
    requiredReachableStarts: requiredOpeningCount,
    preferredReachableStarts: null,
    stopWhenPreferredReachableLost: false,
    recoveryRule: options.recoveryRule,
    ...getRouteAnalysisVariantOptions(options),
    startupSpinUp: options.startupSpinUp,
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoal: movingTargetTimelines?.[0] ?? null
  });
  const routedOpening = opening.starts.filter((analysis) => (
    analysis.reachable && analysis.selectedRoute
  ));

  // v23: preflight is an audition, never a Normal start-quality prune. The first
  // real prune happens only after every detailed candidate has a full-course
  // intrinsic route and Flag-1 traffic score.
  const normalOpeningPruning = {
    outliers: [],
    excludedIndices: new Set(),
    minimumPool: starts.length
  };

  const unresolvedOpeningCount = opening.summary?.capacityShortCircuit?.unresolvedStarts ?? 0;
  const incompleteOpeningSketch = routedOpening.length < requiredOpeningCount
    ? {
      routedStarts: routedOpening.length,
      requiredStarts: requiredOpeningCount,
      cappedOrUnresolvedStarts: unresolvedOpeningCount
    }
    : null;

  // The rest of preflight is deliberately representative, not a coherent
  // proof for every start. Its only job is to estimate the course profile and
  // detect a continuation that is obviously hostile to cheap routing.
  let routeStates = uniquePreflightStates(
    routedOpening.map((analysis) => analysis.selectedRoute)
  );
  const laterLegs = [];
  let incompleteLaterSketch = null;

  for (let legIndex = 1; legIndex < flags.length; legIndex += 1) {
    const leg = analyzeFlagLeg(tileMap, flags[legIndex - 1], flags[legIndex], {
      routesPerFacing: 1,
      maxDistinctRoutes: 4,
      maxActions: COURSE_PREFLIGHT_LATER_MAX_ACTIONS,
      maxExpansions: Math.min(generationProfile.preflightLaterExpansions, 600),
      physicalTimingOnly: true,
      physicalTelemetryKind: "physical-preflight-leg",
      optionalTemplateExpansions: 60,
      startStates: routeStates,
      playerCount,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: movingTargetTimelines?.[legIndex] ?? null
    });

    if (!leg.distinctRoutes?.length) {
      const cappedZeroRouteStarts = leg.summary?.routeSearchHealth?.cappedZeroRouteStarts ?? 0;
      incompleteLaterSketch = {
        leg: legIndex + 1,
        reason: cappedZeroRouteStarts > 0 ? "expansion-cap" : "cheap-horizon-exhausted",
        cappedZeroRouteStarts
      };
      break;
    }

    const intrinsicLeg = {
      ...leg,
      summary: {
        ...leg.summary,
        congestionScore: 0,
        diversityScore: 0,
        intraLegOverlap: 0,
        crossLegOverlap: 0,
        intraLegThreat: 0,
        crossLegThreat: 0
      }
    };
    laterLegs.push(intrinsicLeg);
    routeStates = uniquePreflightStates(leg.distinctRoutes);
  }

  const firstLeg = {
    ...opening,
    flags,
    summary: {
      ...opening.summary,
      averageTrafficPenalty: 0,
      averageOverlapPenalty: 0,
      averageLateralThreat: 0,
      averageRearThreat: 0
    }
  };
  const legs = [
    { from: "dock", to: 1, analysis: firstLeg },
    ...laterLegs.map((leg, index) => ({
      from: index + 1,
      to: index + 2,
      analysis: leg
    }))
  ];
  const totalDifficulty = Number((
    (firstLeg.summary.difficultyScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteScore ?? 0), 0)
  ).toFixed(2));
  const totalLength = Number((
    (firstLeg.summary.lengthScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteDistance ?? 0), 0)
  ).toFixed(2));
  const totalActions = Number((
    (firstLeg.summary.actionScore ?? 0) +
    laterLegs.reduce((sum, leg) => sum + (leg.summary.averageRouteActions ?? 0), 0)
  ).toFixed(2));

  return {
    valid: true,
    reason: null,
    opening,
    openingRoutedCount: routedOpening.length,
    requiredOpeningCount,
    intrinsicOutliers: normalOpeningPruning.outliers,
    excludedIndices: normalOpeningPruning.excludedIndices,
    laterLegs,
    incompleteOpeningSketch,
    incompleteLaterSketch,
    sequence: {
      starts,
      firstLeg,
      legs,
      movingTargetTimelines,
      summary: {
        totalDifficulty,
        totalLength,
        totalActions
      }
    }
  };
}

export function buildRouteAwareBatteryScoringOptions(coursePreflight, options = {}) {
  // Design invariant: Energy Crisis / A Lighter Game is currently the only rule
  // that removes Energy and upgrades from route quality. Missing calibration
  // evidence may force a conservative fallback estimate, but must not silently
  // turn the economy off on an otherwise normal course.
  if (options.lighterGame) {
    return { routeAwareBatteryScoring: false };
  }

  const config = getRouteEnergyEconomyConfig(options);
  const horizonActions = Number(coursePreflight?.sequence?.summary?.totalActions);
  const measuredHorizonTurns = Number.isFinite(horizonActions) && horizonActions > 0
    ? horizonActions / config.registersPerTurn
    : 0;
  const registerSamples = [];
  const addRoute = (route) => {
    const actions = Number(route?.actions);
    const score = Number(route?.score);
    if (Number.isFinite(actions) && actions > 0 && Number.isFinite(score) && score > 0) {
      registerSamples.push(score / actions);
    }
  };

  (coursePreflight?.opening?.starts || []).forEach((analysis) => {
    if (analysis?.reachable) addRoute(analysis.selectedRoute);
  });
  (coursePreflight?.laterLegs || []).forEach((leg) => {
    (leg?.distinctRoutes || []).forEach(addRoute);
  });

  const measuredRegisterScore = medianValue(registerSamples);
  const fallbackHorizonTurns = Number(options.routeEnergyHorizonTurns) > 0
    ? Number(options.routeEnergyHorizonTurns)
    : 4;
  const fallbackRegisterScore = Number(options.routeEnergyRegisterScore) > 0
    ? Number(options.routeEnergyRegisterScore)
    : 6.4;
  const horizonTurns = measuredHorizonTurns > 0
    ? measuredHorizonTurns
    : fallbackHorizonTurns;
  const registerScore = measuredRegisterScore > 0
    ? measuredRegisterScore
    : fallbackRegisterScore;

  return {
    routeAwareBatteryScoring: true,
    routeEnergyHorizonTurns: Number(horizonTurns.toFixed(3)),
    routeEnergyRegisterScore: Number(registerScore.toFixed(3)),
    // Carry resolved economy parameters with the production scorer so later
    // setup variants can change them without hidden 3E/3-card assumptions.
    startingEnergy: config.startingEnergy,
    startingUpgradeCards: config.startingUpgradeCards,
    maxEnergy: config.maxEnergy,
    upgradeDrawsPerTurn: config.drawsPerTurn,
    upgradeInstallsPerTurn: config.installsPerTurn,
    upgradeDrawEnergyCost: config.drawEnergyCost,
    upgradeUsefulCardRate: config.usefulUpgradeCardRate,
    upgradeUsefulEnergyPerInstall: config.usefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: config.powerRegistersPerEnergy,
    routeRegistersPerTurn: config.registersPerTurn,
    // v18 keeps only reserve + race progress in production search. Unknown
    // upgrade cards are valued immediately as expectations; no persistent card
    // shadow survives into route dominance/cache state. The reference reserve
    // remains useful for Pay to Win / Subsidized Starts fixed-route repricing.
    routeEnergyReferenceReserve: config.startingEnergy
  };
}

export function getPreflightGrossCourseMismatch(metrics, preferences = {}) {
  const difficultyBand = GROSS_DIFFICULTY_ABORT_BANDS[preferences.difficulty];
  const lengthBand = GROSS_LENGTH_ABORT_BANDS[preferences.length];

  if (difficultyBand && Number.isFinite(metrics?.difficultyRaw)) {
    if (
      Number.isFinite(difficultyBand.min) &&
      metrics.difficultyRaw + COURSE_PREFLIGHT_DIFFICULTY_MARGIN < difficultyBand.min
    ) {
      return {
        abort: true,
        reason: "difficulty-too-low",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.min,
        requested: preferences.difficulty
      };
    }
    if (
      Number.isFinite(difficultyBand.max) &&
      metrics.difficultyRaw - COURSE_PREFLIGHT_DIFFICULTY_MARGIN > difficultyBand.max
    ) {
      return {
        abort: true,
        reason: "difficulty-too-high",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.max,
        requested: preferences.difficulty
      };
    }
  }

  if (lengthBand && Number.isFinite(metrics?.lengthRaw)) {
    if (
      Number.isFinite(lengthBand.min) &&
      metrics.lengthRaw + COURSE_PREFLIGHT_LENGTH_MARGIN < lengthBand.min
    ) {
      return {
        abort: true,
        reason: "length-too-low",
        metric: "length",
        value: metrics.lengthRaw,
        limit: lengthBand.min,
        requested: preferences.length
      };
    }
    if (
      Number.isFinite(lengthBand.max) &&
      metrics.lengthRaw - COURSE_PREFLIGHT_LENGTH_MARGIN > lengthBand.max
    ) {
      return {
        abort: true,
        reason: "length-too-high",
        metric: "length",
        value: metrics.lengthRaw,
        limit: lengthBand.max,
        requested: preferences.length
      };
    }
  }

  return { abort: false };
}

export function classifyCoursePreflight(preflight, preferences, context = {}) {
  if (!preflight?.sequence) return null;
  if (preflight.incompleteOpeningSketch || preflight.incompleteLaterSketch) {
    return {
      difficultyRaw: null,
      lengthRaw: null,
      lengthFitRaw: null,
      lengthMetrics: null,
      incompleteOpeningSketch: preflight.incompleteOpeningSketch ?? null,
      incompleteLaterSketch: preflight.incompleteLaterSketch ?? null
    };
  }
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints, preferences)
    : summarizeMovingTargets(null, [], preferences);
  const difficultyRaw = applyVariantDifficultyModifiers(
    computeDifficultyRaw(preflight.sequence, checkpointPressure),
    {
      ...preferences,
      movingTargetStats,
      goalTileMap: context.goalTileMap ?? context.tileMap
    },
    preflight.sequence
  );
  const lengthMetrics = computeLengthMetrics(
    preflight.sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );

  return {
    difficultyRaw,
    lengthRaw: lengthMetrics.raw,
    lengthFitRaw: shouldUseCompactLengthFit(preferences)
      ? lengthMetrics.compactnessRaw
      : lengthMetrics.raw,
    lengthMetrics
  };
}

// Legacy diagnostic helper. v33 production Normal no longer calls this as a
// pruning/eligibility stage; all structural starts go to full-course routing first.
export function mergeLightweightPrunedStarts(firstLeg, prePruning, originalStartCount) {
  if (!prePruning.excludedIndices.size) {
    return firstLeg;
  }

  const fullByIndex = new Map(firstLeg.starts.map((analysis) => [analysis.index, analysis]));
  const lightweightByIndex = new Map(prePruning.analyses.map((analysis) => [analysis.index, analysis]));
  const mergedStarts = [];

  for (let index = 0; index < originalStartCount; index += 1) {
    if (fullByIndex.has(index)) {
      mergedStarts.push(fullByIndex.get(index));
      continue;
    }

    const lightweight = lightweightByIndex.get(index);
    if (!lightweight) {
      continue;
    }

    mergedStarts.push({
      ...lightweight,
      prePruned: true,
      fullCourseRoutes: [],
      fullCourseRoute: null,
      fullCourseRouteIndex: null,
      fullCourseTrafficPenalty: 0,
      courseEstimate: null,
      courseScoreAdjustment: 0
    });
  }

  return {
    ...firstLeg,
    starts: mergedStarts,
    summary: {
      ...firstLeg.summary,
      totalStarts: originalStartCount,
      // Pre-pruned starts only had the cheap first-leg check, so do not count
      // them as full-course reachable without running the expensive search.
      reachableStarts: firstLeg.summary.reachableStarts,
      outliers: [
        ...prePruning.outliers,
        ...(firstLeg.summary.outliers || []).filter((outlier) => !prePruning.excludedIndices.has(outlier.index))
      ],
      lightweightStartPruning: {
        active: true,
        minimumPool: prePruning.minimumPool,
        pruned: prePruning.outliers.map((outlier) => outlier.index),
        maxExpansions: LIGHT_START_MAX_EXPANSIONS
      }
    }
  };
}

export function interleaveStartsByDock(starts = [], dockPlacements = [], pieceMap = {}) {
  const queues = dockPlacements.map((dockPlacement, dockIndex) => ({
    dockIndex,
    starts: starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap))
  }));
  const unassigned = starts.filter((start) => !dockPlacements.some((dockPlacement) => (
    pointOnPlacement(start, dockPlacement, pieceMap)
  )));
  const ordered = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const queue of queues) {
      if (!queue.starts.length) continue;
      ordered.push({ start: queue.starts.shift(), dockIndex: queue.dockIndex });
      progressed = true;
    }
  }

  unassigned.forEach((start) => ordered.push({ start, dockIndex: null }));
  return ordered;
}

export function screenSandwichedExtraDockOpening(
  tileMap,
  starts,
  goal,
  dockPlacements,
  pieceMap,
  playerCount,
  options = {}
) {
  const generationProfile = getGenerationModeProfile(options);
  if (!goal || (dockPlacements?.length ?? 0) < 2 || options.movingTargets) {
    return { valid: true, tested: 0, reachable: 0, dockCoverage: 0, skipped: true };
  }

  const requiredReachable = Math.max(1, Number(playerCount ?? 1));
  const ordered = interleaveStartsByDock(starts, dockPlacements, pieceMap);
  const reachableDockIndices = new Set();
  let reachable = 0;
  let tested = 0;

  for (let offset = 0; offset < ordered.length; offset += 1) {
    const { start, dockIndex } = ordered[offset];
    tested += 1;
    const lightweight = analyzeCourse(tileMap, [start], goal, {
      flags: [goal],
      maxRoutes: 1,
      skipTraffic: true,
      playerCount: Math.max(1, Number(playerCount ?? 1)),
      maxActions: Math.max(24, LIGHT_START_MAX_ACTIONS),
      maxExpansions: generationProfile.lightStartExpansions,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
    });
    const analysis = lightweight.starts?.[0];
    if (analysis?.reachable && analysis.selectedRoute) {
      reachable += 1;
      if (dockIndex !== null) reachableDockIndices.add(dockIndex);
    }

    const everyDockRepresented = dockPlacements.every((_, index) => reachableDockIndices.has(index));
    if (reachable >= requiredReachable && everyDockRepresented) {
      return {
        valid: true,
        tested,
        reachable,
        dockCoverage: reachableDockIndices.size,
        skipped: false
      };
    }

    const remaining = ordered.length - offset - 1;
    if (reachable + remaining < requiredReachable) break;

    const uncoveredDockWithoutRemainingStart = dockPlacements.some((_, dockIndexCandidate) => (
      !reachableDockIndices.has(dockIndexCandidate) &&
      !ordered.slice(offset + 1).some((item) => item.dockIndex === dockIndexCandidate)
    ));
    if (uncoveredDockWithoutRemainingStart) break;
  }

  return {
    valid: false,
    tested,
    reachable,
    dockCoverage: reachableDockIndices.size,
    skipped: false
  };
}

export function adjustNormalStartsAfterFullTraffic(
  firstLeg,
  totalLength,
  tileMap,
  playerCount,
  options = {}
) {
  const previousBalance = firstLeg.summary?.normalStartBalance ?? {};
  const initialExcludedIndices = new Set([
    ...(previousBalance.lightweightPruned ?? []),
    ...(previousBalance.pressurePruned ?? []).map((entry) => entry.index)
  ]);
  const analysisOptions = {
    ...getRouteAnalysisVariantOptions(options),
    playerCount,
    openingTrafficOnly: false,
    balanceTrafficScope: "full",
    trafficOccupancyUseBalanceScore: true,
    carryOccupancyScores: true,
    fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? 1
  };
  const initialActive = getActivePruningStarts(firstLeg, initialExcludedIndices);
  const initialStdDev = getNormalStartDispersion(
    initialActive,
    "normalFairnessEffectiveRE"
  );
  const initialBalanceStdDevLimit =
    NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT;
  const maxIterations = Math.max(
    0,
    Math.min(
      Number(options.normalFullTrafficPrunePasses) || 0,
      initialActive.length - Math.max(1, playerCount || 1)
    )
  );

  if (!(maxIterations > 0)) {
    const remainingOutliers = rankNormalEffectiveREOutliers(
      initialActive,
      NORMAL_EFFECTIVE_RE_OUTLIER_Z
    );
    const durationGuardrail = getNormalRegisterDurationGuardrail(initialActive);
    const playerFloor = Math.max(1, playerCount || 1);
    const belowPlayerFloor = initialActive.length < playerFloor;
    const floorReached = initialActive.length === playerFloor;
    const residualBalancePenalty = getNormalResidualBalanceSelectionPenalty(
      initialActive,
      options
    );
    const reject = belowPlayerFloor;
    return {
      ...firstLeg,
      summary: {
        ...firstLeg.summary,
        normalStartBalance: {
          ...previousBalance,
          fullTrafficFeedback: true,
          fullTrafficIterations: 0,
          fullTrafficPruned: [],
          balanceStdDevAfterFullTraffic: Number(initialStdDev.toFixed(2)),
          balanceStdDevAfter: Number(initialStdDev.toFixed(2)),
          balanceStdDevLimit: initialBalanceStdDevLimit,
          durationGuardrail,
          playerFloor,
          floorReached,
          belowPlayerFloor,
          residualSelectionPenalty: residualBalancePenalty.total,
          residualSelectionPenaltyComponents: residualBalancePenalty,
          residualImbalanceFeedsCourseScorer: true,
          fairnessMetric: "full-course-effective-RE",
          fairnessModel: "range-first-length-responsive-start-balance-v49fj",
          startBalance: normalizeStartBalance(options.startBalance),
          startBalanceLabel: formatStartBalanceLabel(options.startBalance),
          startBalanceEnforced: getStartBalanceProfile(options).enforced,
          retainedEffectiveRERange: residualBalancePenalty.range,
          retainedEffectiveRERangeLimit: residualBalancePenalty.rangeLimit,
          retainedEffectiveRERangeExcess: residualBalancePenalty.rangeExcess,
          fairnessMedianTurns: residualBalancePenalty.medianTurns,
          actionPruningActive: false,
          dispersionPruningActive: false,
          rangePruningActive: getStartBalanceProfile(options).enforced,
          dispersionPruningPolicy:
            "SD/z diagnostic only; best-worst completed-RE range owns pruning",
          remainingBadStarts: remainingOutliers.map((item) => ({
            index: item.entry.index,
            score: item.score,
            scoreZ: Number(item.scoreZ.toFixed(2)),
            actionZ: Number(item.actionZ.toFixed(2))
          })),
          reject
        }
      }
    };
  }

  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ activeStarts }) => chooseNormalStartBalanceRemoval(
      activeStarts,
      playerCount,
      options
    ),
    {
      initialExcludedIndices: [...initialExcludedIndices],
      inputAlreadyReflectsExcluded: true,
      pruneBatchSize: options.normalPruneBatchSize ?? getNormalStartPruneBatchSize,
      maxPasses: maxIterations
    }
  );

  const remainingActive = getActivePruningStarts(
    result.currentFirstLeg,
    result.excludedIndices
  );
  const remainingOutliers = rankNormalEffectiveREOutliers(
    remainingActive,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  const remainingStdDev = getNormalStartDispersion(
    remainingActive,
    "normalFairnessEffectiveRE"
  );
  const finalBalanceStdDevLimit =
    NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT;
  const durationGuardrail = getNormalRegisterDurationGuardrail(remainingActive);
  const newRemovals = result.removals.filter((removed) => (
    !initialExcludedIndices.has(removed.index)
  )).map((removed, removalIndex) => ({
    index: removed.index,
    score: removed.score,
    actions: removed.actions,
    pass: removed.pass,
    diagnostics: {
      normalBalancePruned: true,
      balanceDispersionPruned: Boolean(removed.balanceDispersionPruned),
      stage: "iterative-full-traffic-range-first",
      scoreZ: Number((removed.scoreZ ?? 0).toFixed(2)),
      actionZ: Number((removed.actionZ ?? 0).toFixed(2)),
      scoreDelta: Number((removed.scoreDelta ?? 0).toFixed(2)),
      actionDelta: Number((removed.actionDelta ?? 0).toFixed(2)),
      balanceStdDevBefore: Number((removed.balanceStdDevBefore ?? 0).toFixed(2)),
      balanceStdDevAfterEstimate: Number((removed.balanceStdDevAfterEstimate ?? 0).toFixed(2)),
      balanceStdDevLimit: Number((removed.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT).toFixed(2)),
      rangeBefore: Number((removed.rangeBefore ?? 0).toFixed(2)),
      rangeAfterEstimate: Number((removed.rangeAfterEstimate ?? 0).toFixed(2)),
      rangeLimit: Number((removed.rangeLimit ?? 0).toFixed(2)),
      rangeExcessBefore: Number((removed.rangeExcessBefore ?? 0).toFixed(2)),
      rangeExcessAfterEstimate: Number((removed.rangeExcessAfterEstimate ?? 0).toFixed(2)),
      removalReason: "removed to reduce the length-responsive best-worst completed-RE range, then recomputed traffic occupancy",
      totalCourseLength: Number((totalLength || 0).toFixed(2)),
      fullTrafficRemovalIndex: removalIndex
    }
  }));
  const combinedPressurePruned = [
    ...(previousBalance.pressurePruned ?? []),
    ...newRemovals
  ];
  const playerFloor = Math.max(1, playerCount || 1);
  const belowPlayerFloor = remainingActive.length < playerFloor;
  const floorReached = remainingActive.length === playerFloor;
  const residualBalancePenalty = getNormalResidualBalanceSelectionPenalty(
    remainingActive,
    options
  );
  const reject = belowPlayerFloor;

  return {
    ...result.currentFirstLeg,
    summary: {
      ...result.currentFirstLeg.summary,
      outliers: [
        ...(firstLeg.summary?.outliers ?? []),
        ...newRemovals.map((removal) => ({
          index: removal.index,
          score: removal.score,
          delta: 0,
          actionDelta: Number(removal.actions ?? 0),
          reasons: removal.diagnostics
        }))
      ],
      normalStartBalance: {
        ...previousBalance,
        pressurePruned: combinedPressurePruned,
        dispersionPruned: combinedPressurePruned
          .filter((item) => item.diagnostics?.balanceDispersionPruned)
          .map((item) => item.index),
        fullTrafficFeedback: true,
        fullTrafficIterations: new Set(newRemovals.map((item) => item.pass)).size,
        fullTrafficPruned: newRemovals,
        trafficRecomputations: (previousBalance.trafficRecomputations ?? 0) +
          new Set(newRemovals.map((item) => item.pass)).size,
        balanceStdDevBeforeFullTraffic: Number(initialStdDev.toFixed(2)),
        balanceStdDevAfterFullTraffic: Number(remainingStdDev.toFixed(2)),
        balanceStdDevAfter: Number(remainingStdDev.toFixed(2)),
        balanceStdDevLimit: finalBalanceStdDevLimit,
        durationGuardrail,
        playerFloor,
        floorReached,
        belowPlayerFloor,
        residualSelectionPenalty: residualBalancePenalty.total,
        residualSelectionPenaltyComponents: residualBalancePenalty,
        residualImbalanceFeedsCourseScorer: true,
        fairnessMetric: "full-course-effective-RE",
        fairnessModel: "range-first-length-responsive-start-balance-v49fj",
        startBalance: normalizeStartBalance(options.startBalance),
        startBalanceLabel: formatStartBalanceLabel(options.startBalance),
        startBalanceEnforced: getStartBalanceProfile(options).enforced,
        retainedEffectiveRERange: residualBalancePenalty.range,
        retainedEffectiveRERangeLimit: residualBalancePenalty.rangeLimit,
        retainedEffectiveRERangeExcess: residualBalancePenalty.rangeExcess,
        fairnessMedianTurns: residualBalancePenalty.medianTurns,
        actionPruningActive: false,
        dispersionPruningActive: false,
        rangePruningActive: getStartBalanceProfile(options).enforced,
        dispersionPruningPolicy:
          "SD/z diagnostic only; best-worst completed-RE range owns pruning",
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          effectiveRE: Number(item.score.toFixed(3)),
          score: Number(item.score.toFixed(3)),
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        reject
      }
    }
  };
}

export function analyzeFlagSequence(tileMap, starts, flags, playerCount, options = {}) {
  const generationProfile = getGenerationModeProfile(options);
  // v35: generation modes are effort envelopes around one Normal model. They do
  // not select different route/fairness objectives. Dev View may still explicitly
  // disable traffic or traffic exploration for controlled comparisons.
  const trafficEnabled = typeof options.trafficEnabledOverride === "boolean"
    ? options.trafficEnabledOverride
    : Boolean(
      options.fastBaselineTrafficEnabled === true ||
      options.modeTrafficEnabled === true ||
      generationProfile.trafficEnabled === true
    );
  const trafficFeedbackLoopEnabled = Boolean(
    trafficEnabled &&
    options.contextualEstimatedPrimaryRouting &&
    (options.contextualTrafficFeedbackEnabled !== false) &&
    (Number(options.contextualTrafficEpochs ?? generationProfile.trafficEpochs) || 0) > 0
  );
  const trafficDrivenAlternatesEnabled = Boolean(
    trafficFeedbackLoopEnabled &&
    (options.contextualTrafficDrivenAlternates !== false)
  );
  const contextualOpeningRoutes = 1;
  const contextualLaterRoutes = 1;
  const contextualBeamWidth = 1;
  const contextualCompletionPool = 1;
  const contextualOptionalCompletionExpansions = 0;
  const contextualFullForecastShare = NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE;
  const contextualOpeningExpansions = options.contextualOpeningExpansions ?? generationProfile.preflightOpeningExpansions;
  const contextualLaterExpansions = options.contextualLaterExpansions ?? generationProfile.preflightLaterExpansions;
  const fullCourseTrafficScoringEnabled = Boolean(
    trafficEnabled &&
    options.contextualEstimatedPrimaryRouting
  );
  const normalOpeningTrafficFirst = Boolean(
    trafficEnabled &&
    !fullCourseTrafficScoringEnabled &&
    !options.virtualBots &&
    !options.payToWin &&
    !options.subsidizedStarts &&
    !options.skipNormalStartBalancing &&
    !options.skipFullCourseTraffic
  );
  const movingTargetTimelines = options.movingTargetTimelines ?? buildMovingTargetTimelines(
    tileMap,
    flags,
    options.movingTargets,
    { maxActions: options.movingTargetMaxActions ?? 16 }
  );
  // v49fc invariant: Virtual Bots are ordinary logical starts that happen to
  // occupy the same physical square. They use the same cooperative contextual
  // routing pipeline as Normal; physical estimate caches may share work, while
  // analysisIndex keeps each player lineage distinct for traffic/selection.
  const contextualLegSearch = true;
  const prePruning = {
    starts: starts.map((start, index) => ({
      ...start,
      analysisIndex: Number.isInteger(start.analysisIndex)
        ? start.analysisIndex
        : index
    })),
    analyses: [],
    excludedIndices: new Set(),
    outliers: [],
    minimumPool: starts.length,
    active: false
  };
  const lateRouteCount = contextualLaterRoutes;
  const fullCourseAnalyzer = typeof options.fullCourseAnalyzer === "function"
    ? options.fullCourseAnalyzer
    : analyzeFullCourse;
  // A finished course's final evaluation passes the start field generation has
  // already routed instead of searching again (see src/generation/route-field.js).
  const analyzedFirstLeg = options.routedFirstLeg ?? fullCourseAnalyzer(
    tileMap,
    prePruning.starts,
    flags,
    {
      maxRoutes: lateRouteCount,
      maxActions: Math.max(24, flags.length * 18 + 8),
      maxExpansions: generationProfile.fullCourseExpansions,
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
      flags,
      playerCount,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoals: movingTargetTimelines,
      payToWin: options.payToWin,
      competitiveMode: options.competitiveMode,
      virtualBots: options.virtualBots,
      contextualLegSearch,
      contextualEarlyExit: Boolean(options.contextualEarlyExit),
      contextualOpeningRoutes,
      contextualLaterRoutes,
      contextualBeamWidth,
      contextualCompletionPool,
      contextualOptionalCompletionExpansions,
      contextualFullForecastShare,
      contextualUncertaintyBreadth: Boolean(
        options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
      ),
      contextualSharedLaterLegCatalogue: Boolean(options.contextualSharedLaterLegCatalogue),
      contextualEstimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
      contextualEstimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
      contextualTrafficFeedbackEnabled: trafficFeedbackLoopEnabled,
      contextualTrafficDrivenAlternates: trafficDrivenAlternatesEnabled,
      contextualTrafficEpochs: options.contextualTrafficEpochs ?? generationProfile.trafficEpochs,
      contextualTrafficAlternateDemandThreshold:
        options.contextualTrafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      contextualTrafficAlternateMinGain:
        options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      contextualTrafficAlternateMaxNewSearchesPerEpoch:
        options.contextualTrafficAlternateMaxNewSearchesPerEpoch ??
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      contextualTrafficAlternateMaxNewSearchesTotal:
        options.contextualTrafficAlternateMaxNewSearchesTotal ??
        generationProfile.trafficAlternateMaxNewSearchesTotal,
      contextualTrafficAlternateExpansions:
        options.contextualTrafficAlternateExpansions ?? generationProfile.trafficAlternateExpansions,
      contextualTrafficAlternateMaxActions:
        options.contextualTrafficAlternateMaxActions ?? generationProfile.trafficAlternateMaxActions,
      contextualTrafficAlternateCachedProbeMargin:
        options.contextualTrafficAlternateCachedProbeMargin ?? generationProfile.trafficAlternateCachedProbeMargin,
      contextualTrafficAlternateCachedProbeMaxSimilarity:
        options.contextualTrafficAlternateCachedProbeMaxSimilarity ?? generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      contextualTrafficAlternateLegsPerStart:
        options.contextualTrafficAlternateLegsPerStart ?? generationProfile.trafficAlternateLegsPerStart,
      contextualTrafficExplorationUncertaintyShare:
        options.contextualTrafficExplorationUncertaintyShare ?? generationProfile.trafficExplorationUncertaintyShare,
      contextualTrafficExplorationConfidenceFloor:
        options.contextualTrafficExplorationConfidenceFloor ?? generationProfile.trafficExplorationConfidenceFloor,
      contextualTrafficAlternateUncertaintyEffortFloor:
        options.contextualTrafficAlternateUncertaintyEffortFloor ?? generationProfile.trafficAlternateUncertaintyEffortFloor,
      contextualTrafficAlternateUncertaintyEffortExponent:
        options.contextualTrafficAlternateUncertaintyEffortExponent ?? generationProfile.trafficAlternateUncertaintyEffortExponent,
      contextualTrafficUncertainty: options.contextualTrafficUncertainty,
      contextualSeedStartAnalyses: options.contextualSeedStartAnalyses,
      contextualSeedRouteStrategy: options.contextualSeedRouteStrategy,
      contextualOpeningSeedAnalyses: options.contextualOpeningSeedAnalyses,
      contextualRequiredStarts: options.contextualRequiredStarts,
      contextualPreferredStarts: options.contextualPreferredStarts,
      contextualStopWhenPreferredLost: options.contextualStopWhenPreferredLost,
      contextualOpeningExpansions,
      contextualLaterExpansions,
      contextualLegMaxActions: options.contextualLegMaxActions,
      contextualPhysicalTemplateRoutes: options.contextualPhysicalTemplateRoutes,
      contextualPrimaryWitnessRoutes: options.contextualPrimaryWitnessRoutes,
      contextualPhysicalTemplateExpansions: options.contextualPhysicalTemplateExpansions,
      contextualPhysicalTemplateMaxActions: options.contextualPhysicalTemplateMaxActions,
      contextualExactRepairExpansions: options.contextualExactRepairExpansions,
      contextualDetailedProfiling: Boolean(options.contextualDetailedProfiling),
      contextualDominanceKeyProfiling: Boolean(options.contextualDominanceKeyProfiling),
      cooperativeYield: options.cooperativeYield,
      cooperativeYieldIntervalMs: options.cooperativeYieldIntervalMs,
      contextualCooperativeSearchSlices: Boolean(options.contextualCooperativeSearchSlices),
      contextualCooperativeSearchSliceMs:
        options.contextualCooperativeSearchSliceMs,
      contextualCooperativeSearchCheckPops:
        options.contextualCooperativeSearchCheckPops,
      contextualWorkGuard: options.contextualWorkGuard,
      shouldStopRequested: options.shouldStopRequested,
      contextualFastCardState: options.contextualFastCardState !== false,
      skipTraffic: Boolean(options.skipTraffic || !trafficEnabled),
      // The new loop evaluates full-course traffic before the stable pruning
      // checkpoint. Legacy opening-first traffic remains available outside the
      // estimate→realize path.
      trafficOccupancyUseBalanceScore: normalOpeningTrafficFirst,
      balanceTrafficScope: fullCourseTrafficScoringEnabled ? "full" : options.balanceTrafficScope,
      skipFullCourseTraffic: Boolean(
        options.skipFullCourseTraffic || !trafficEnabled || normalOpeningTrafficFirst
      ),
      diverseFullCourseSearch: false
    }
  );
  const finishSequence = (firstLeg) => {

  if (firstLeg?.summary) {
    // Keep the effective contextual contract beside the route diagnostics so a
    // future propagation regression is visible immediately in Dev View.
    firstLeg.summary.contextualSearchProfile = {
      generationMode: normalizeGenerationMode(options.generationMode),
      generationModeLabel: formatGenerationModeLabel(options.generationMode),
      primaryRoutePolicy: "single-estimate+internal-witnesses",
      uncertaintyBreadth: Boolean(
        options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
      ),
      uncertaintyMechanism: options.contextualEstimatedPrimaryRouting
        ? "soft-estimate+exact-whole-route-realization"
        : "exact-card-count-state",
      fastCardState: options.contextualFastCardState !== false,
      trafficEnabled,
      trafficFeedbackLoopEnabled,
      trafficAlternatesEnabled: trafficDrivenAlternatesEnabled,
      trafficEpochs: trafficFeedbackLoopEnabled
        ? (options.contextualTrafficEpochs ?? generationProfile.trafficEpochs)
        : 0,
      trafficAlternateDemandThreshold:
        options.contextualTrafficAlternateDemandThreshold ?? NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      trafficAlternateMinGain:
        options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      trafficAlternateMaxNewSearchesPerEpoch:
        options.contextualTrafficAlternateMaxNewSearchesPerEpoch ??
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      trafficAlternateMaxNewSearchesTotal:
        options.contextualTrafficAlternateMaxNewSearchesTotal ??
        generationProfile.trafficAlternateMaxNewSearchesTotal,
      trafficAlternateExpansions:
        options.contextualTrafficAlternateExpansions ?? generationProfile.trafficAlternateExpansions,
      trafficAlternateMaxActions:
        options.contextualTrafficAlternateMaxActions ?? generationProfile.trafficAlternateMaxActions,
      trafficAlternateCachedProbeMargin:
        options.contextualTrafficAlternateCachedProbeMargin ?? generationProfile.trafficAlternateCachedProbeMargin,
      trafficAlternateCachedProbeMaxSimilarity:
        options.contextualTrafficAlternateCachedProbeMaxSimilarity ?? generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      trafficExplorationUncertaintyShare:
        options.contextualTrafficExplorationUncertaintyShare ?? generationProfile.trafficExplorationUncertaintyShare,
      trafficExplorationConfidenceFloor:
        options.contextualTrafficExplorationConfidenceFloor ?? generationProfile.trafficExplorationConfidenceFloor,
      trafficAlternateUncertaintyEffortFloor:
        options.contextualTrafficAlternateUncertaintyEffortFloor ?? generationProfile.trafficAlternateUncertaintyEffortFloor,
      trafficAlternateUncertaintyEffortExponent:
        options.contextualTrafficAlternateUncertaintyEffortExponent ?? generationProfile.trafficAlternateUncertaintyEffortExponent,
      estimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
      normalPruneBatchSize: options.normalPruneBatchSize ?? NORMAL_PRUNE_BATCH_SIZE,
      normalPruneBatchPolicy: options.normalPruneBatchSize !== null &&
        options.normalPruneBatchSize !== undefined &&
        Number.isFinite(Number(options.normalPruneBatchSize))
        ? "fixed"
        : "adaptive-2-above-2x-players-else-1",
      sharedLaterLegCatalogue: Boolean(options.contextualSharedLaterLegCatalogue),
      estimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
      openingExpansions: contextualOpeningExpansions,
      laterExpansions: contextualLaterExpansions,
      physicalTemplateRoutes: options.contextualPhysicalTemplateRoutes ?? 3,
      primaryWitnessRoutes: options.contextualPrimaryWitnessRoutes ?? 3,
      arrivalClassRouting: Boolean(options.contextualSharedLaterLegCatalogue),
      physicalTemplateExpansions: options.contextualPhysicalTemplateExpansions ?? 700,
      physicalTemplateMaxActions: options.contextualPhysicalTemplateMaxActions ?? 36,
      exactRepairExpansions: options.contextualExactRepairExpansions ?? 550
    };
  }

  const legs = [
    {
      from: "dock",
      to: 1,
      analysis: firstLeg
    }
  ];

  (firstLeg.expectedLegAnalyses || []).forEach((analysis, index) => {
    legs.push({
      from: index + 1,
      to: index + 2,
      analysis
    });
  });

  const totalLength = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.lengthScore !== undefined) {
      return sum + leg.analysis.summary.lengthScore;
    }

    return sum + leg.analysis.summary.averageRouteDistance;
  }, 0);
  const totalActions = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.actionScore !== undefined) {
      return sum + leg.analysis.summary.actionScore;
    }

    return sum + (leg.analysis.summary.averageRouteActions || 0);
  }, 0);
  // A saved course's evaluation depends on its routed field only: replay the
  // energy rescues recorded with it, then rebuild every start from its route pool.
  if (options.replayStartEnergyRescues?.length && !options.routedFirstLeg) {
    firstLeg = replayStartEnergyRescues(tileMap, firstLeg, options.replayStartEnergyRescues, {
      ...options,
      movingTargetTimelines,
      totalActions,
      totalLength,
      playerCount
    });
  }
  if (options.normalizeRoutedField) {
    firstLeg = normalizeRoutedFirstLeg(tileMap, firstLeg, playerCount, options);
  }

  // Competitive uses the same route construction, programming realization,
  // Energy valuation and common-field traffic model as Normal. v49cq makes
  // completed effective RE authoritative for sequential strategic blocks and the
  // best-P remaining choice set. Full-course traffic is recomputed after each block,
  // with occupancy attractiveness seeded from completed RE; unselected-but-still-
  // available starts remain in the field rather than being zeroed for fairness.
  const cooperativeStartBalanceBoundary = typeof options.cooperativeStage === "function"
    ? async ({ pass, remainingStartCount }) => {
      const count = Math.max(0, Number(remainingStartCount) || 0);
      await options.cooperativeStage(
        `Balancing routed starting choices — pass ${pass} complete; ${count} start${count === 1 ? "" : "s"} remain`
      );
      // Guarantee one event-loop turn even if the outer progress throttle did not
      // yield for this message, then re-check Stop after the browser can process it.
      await nextEventLoopTurn();
      if (typeof options.shouldStopRequested === "function" && options.shouldStopRequested()) {
        const error = new Error("Generation stop requested after a start-balance pass.");
        error.code = "ANALYSIS_STOP_REQUESTED";
        throw error;
      }
    }
    : null;

  const courseAdjustedFirstLegOrPromise = options.competitiveMode
    ? applyCompetitiveStrategicBlocking(firstLeg, tileMap, playerCount, {
      ...options,
      // Competitive semantics require full-course traffic regardless of the
      // generation profile. Only an explicit Dev skipTraffic override suppresses it.
      skipTraffic: Boolean(options.skipTraffic),
      competitiveBlockTrafficScope: "full",
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES
    })
    : (options.virtualBots || options.skipNormalStartBalancing)
      ? {
        ...firstLeg,
        summary: {
          ...firstLeg.summary,
          outliers: []
        }
      }
      : (options.payToWin || options.subsidizedStarts)
        ? options.skipStartEnergyPricing
          ? {
            ...firstLeg,
            summary: {
              ...firstLeg.summary,
              outliers: []
            }
          }
          : applyPayToWinStartPricing(firstLeg, tileMap, playerCount, {
            ...options,
            movingTargetTimelines,
            totalActions,
            totalLength,
            cooperativeStartBalanceBoundary
          })
        : adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, {
          ...getRouteAnalysisVariantOptions(options),
          startBalance: normalizeStartBalance(options.startBalance),
          totalActions,
          trafficOccupancyUseBalanceScore: true,
          carryOccupancyScores: true,
          balanceTrafficScope: trafficFeedbackLoopEnabled ? "full" : "opening",
          skipTraffic: Boolean(options.skipTraffic || !trafficEnabled),
          deferReject: normalOpeningTrafficFirst,
          normalPruneBatchSize: options.normalPruneBatchSize,
          cooperativeStartBalanceBoundary
        });

  return mapMaybePromise(courseAdjustedFirstLegOrPromise, (courseAdjustedFirstLeg) => {
  let finalFirstLeg = courseAdjustedFirstLeg;
  if (normalOpeningTrafficFirst && !options.competitiveMode) {
    const balance = courseAdjustedFirstLeg.summary?.normalStartBalance ?? null;
    const excludedIndices = new Set([
      ...(balance?.lightweightPruned ?? []),
      ...(balance?.pressurePruned ?? []).map((entry) => entry.index)
    ]);
    finalFirstLeg = recomputeFirstLegPressure(tileMap, courseAdjustedFirstLeg, {
      ...getRouteAnalysisVariantOptions(options),
      playerCount,
      excludedIndices: [...excludedIndices],
      fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
      trafficOccupancyUseBalanceScore: true,
      balanceTrafficScope: "full",
      openingTrafficOnly: false
    });
    finalFirstLeg.summary.normalStartBalance = courseAdjustedFirstLeg.summary.normalStartBalance;
    finalFirstLeg.summary.outliers = courseAdjustedFirstLeg.summary.outliers;
    finalFirstLeg = adjustNormalStartsAfterFullTraffic(
      finalFirstLeg,
      totalLength,
      tileMap,
      playerCount,
      {
        ...options,
        fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
        normalPruneBatchSize: options.normalPruneBatchSize,
        normalFullTrafficPrunePasses: 0
      }
    );
  }

  if (finalFirstLeg?.summary?.normalStartBalance?.active) {
    finalFirstLeg.summary.normalStartBalance.startResiduals =
      summarizePostBalanceStartResiduals(finalFirstLeg, playerCount);
  }

  const adjustedLegs = [
    {
      ...legs[0],
      analysis: finalFirstLeg
    },
    ...(finalFirstLeg.expectedLegAnalyses || []).map((analysis, index) => ({
      from: index + 1,
      to: index + 2,
      analysis
    }))
  ];

  return {
    starts,
    firstLeg: finalFirstLeg,
    legs: adjustedLegs,
    movingTargetTimelines,
    summary: {
      totalDifficulty: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.difficultyScore !== undefined) {
            return sum + leg.analysis.summary.difficultyScore;
          }

          return sum + leg.analysis.summary.averageRouteScore + leg.analysis.summary.congestionScore - leg.analysis.summary.diversityScore * 0.2;
        }, 0)
      ).toFixed(2)),
      totalLength: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.lengthScore !== undefined) {
            return sum + leg.analysis.summary.lengthScore;
          }

          return sum + leg.analysis.summary.averageRouteDistance;
        }, 0)
      ).toFixed(2))
    }
  };
  });
  };

  if (analyzedFirstLeg && typeof analyzedFirstLeg.then === "function") {
    if (typeof options.cooperativeStage === "function") {
      return analyzedFirstLeg.then(async (firstLeg) => {
        await options.cooperativeStage("Balancing routed starting choices");
        const finished = await finishSequence(firstLeg);
        await options.cooperativeStage("Route analysis and start balancing complete");
        return finished;
      });
    }
    return analyzedFirstLeg.then(finishSequence);
  }
  return finishSequence(analyzedFirstLeg);
}
