// Robo Rally Course Randomizer - candidate classification (classifyCandidate): difficulty, length, fit and acceptance of a routed course
import { getSandwichedDockUseProfile } from "./board-layout.js";
import { getCheckpointSpacingExpectationProfile } from "./checkpoints.js";
import {
  FORCED_ECONOMY_NO_EFFECT_FIT_PENALTY,
  MIN_LENGTH_RAW,
  NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
  SOFT_CANDIDATE_RETENTION_LIMIT
} from "./config.js";
import { collectUsedBoardIndices } from "./construction-cleanup.js";
import {
  getBoardFootprintUseProfile,
  getBoardGameplayRelevanceProfile,
  getFinalLegAnticlimax,
  getIntermediateCheckpointPacing,
  getMovingTargetVolatilityPenalty,
  getOpeningLegAnticlimax,
  getRouteDramaProfile,
  getRoutedCheckpointPacingExpectation,
  getTargetAxisAcceptanceGate,
  nonOverlappingDifficultyBandDistance,
  shouldUseCompactLengthFit
} from "./course-quality.js";
import {
  RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE,
  computeBoardHarshness,
  computeDifficultyRaw,
  computeLaterCheckpointPressure,
  computeRETurnVariantDifficultyAccounting,
  computeVariantDifficultyAccounting,
  getProductionRETurnDifficulty
} from "./difficulty-metrics.js";
import {
  applyRENativeExpectedPlayExtentToLengthMetrics,
  computeLengthMetrics,
  computeLengthOwnerObservation
} from "./length-metrics.js";
import { summarizeMovingTargets } from "./moving-targets.js";
import {
  computeCourseReachableStarts,
  computeUsableStarts,
  getNormalFairnessSoftOverflowAllowance,
  getStartBalanceProfile
} from "./start-balance.js";
import {
  MIN_WALL_CLOCK_TURN_INDEX,
  WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN,
  bandDistance,
  getDifficultyThresholds,
  getLengthThresholds,
  getProductionLengthThresholds
} from "./targets.js";
import { isVariantForced } from "./variant-availability.js";

export function classifyCandidate(sequence, preferences, context = {}) {
  const reachableStarts = computeCourseReachableStarts(sequence.firstLeg);
  const usableStarts = computeUsableStarts(sequence.firstLeg, preferences);
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const pricedStartBalance = sequence.firstLeg.summary.payToWin?.residualBalance ?? null;
  const fairnessStdDev = (preferences.payToWin || preferences.subsidizedStarts)
    ? (pricedStartBalance?.worstStdDev ?? sequence.firstLeg.summary.scoreStdDev)
    : sequence.firstLeg.summary.scoreStdDev;
  const skipCompetitiveBlockImpact = Boolean(context.skipCompetitiveBlockImpact);
  const competitiveBlockImpact = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? (sequence.firstLeg.summary.competitiveStartBalance ?? null)
    : null;
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints, preferences)
    : summarizeMovingTargets(null, [], preferences);
  // Keep the historical raw scalar only as construction/preflight calibration
  // evidence during the migration. It no longer owns player-facing difficulty
  // acceptance after v49de.
  const variantDifficultyAccounting = computeVariantDifficultyAccounting(
    computeDifficultyRaw(sequence, checkpointPressure),
    {
      ...preferences,
      competitiveStrategicDifficulty: competitiveBlockImpact?.strategicDifficulty ?? null,
      movingTargetStats,
      goalTileMap: context.goalTileMap ?? context.tileMap
    },
    sequence
  );
  const difficultyRaw = variantDifficultyAccounting.final;
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );
  const reTurnDifficulty = context.skipProductionDifficulty
    ? { active: false, reason: "guidance-only-classification" }
    : getProductionRETurnDifficulty(
      sequence,
      {
        ...preferences,
        movingTargetStats,
        competitiveStrategicDifficulty: competitiveBlockImpact?.strategicDifficulty ?? null
      },
      context,
      lengthMetrics
    );
  const reTurnVariantDifficultyAccounting = reTurnDifficulty?.active
    ? computeRETurnVariantDifficultyAccounting(
      reTurnDifficulty.courseTurnDifficultyRE,
      {
        ...preferences,
        competitiveStrategicDifficulty: competitiveBlockImpact?.strategicDifficulty ?? null,
        movingTargetStats
      },
      sequence
    )
    : null;
  const difficultyTurnRE = Number(reTurnVariantDifficultyAccounting?.final);

  // v49du keeps RE-native expected-play registers as route/play extent, then
  // applies player-count + Act Fast programming-time scaling and explicit
  // card-aware upgrade draw/install transaction time. Energy Crisis removes
  // that economy component instead of blanket-scaling total length.
  lengthMetrics.ownerObservationV49dl = computeLengthOwnerObservation(
    sequence,
    preferences,
    lengthMetrics,
    reTurnDifficulty,
    context
  );
  if (!context.skipProductionDifficulty) {
    applyRENativeExpectedPlayExtentToLengthMetrics(
      lengthMetrics,
      lengthMetrics.ownerObservationV49dl,
      preferences
    );
  }
  const lengthRaw = lengthMetrics.raw;
  const lengthFitRaw = shouldUseCompactLengthFit(preferences)
    ? lengthMetrics.compactnessRaw
    : lengthRaw;
  const lengthWallClockTurnIndex = Number(
    lengthMetrics?.productionWallClockOwner?.effectiveWallClockTurnIndex
  );
  const productionLengthOwnerActive = Boolean(
    !context.skipProductionDifficulty && Number.isFinite(lengthWallClockTurnIndex)
  );
  const lengthSemanticValue = productionLengthOwnerActive
    ? lengthWallClockTurnIndex
    : lengthFitRaw;

  const difficultyThresholds = getDifficultyThresholds();
  const lengthThresholds = productionLengthOwnerActive
    ? getProductionLengthThresholds()
    : getLengthThresholds();
  const lengthFitPointScale = productionLengthOwnerActive
    ? WALL_CLOCK_LENGTH_FIT_POINTS_PER_TURN
    : 1;
  const minimumLengthValue = productionLengthOwnerActive
    ? MIN_WALL_CLOCK_TURN_INDEX
    : MIN_LENGTH_RAW;

  const hardFailures = [];
  const softFailures = [];
  if (lengthSemanticValue < minimumLengthValue) {
    softFailures.push("too-short");
  }
  if (usableStarts.length < preferences.playerCount) {
    hardFailures.push("usable-starts");
  }

  if (reachableStarts.length < preferences.playerCount) {
    hardFailures.push("reachable-starts");
  }

  if (
    (sequence.firstLeg.summary.normalStartBalance?.residualSelectionPenalty ?? 0) > 0
  ) {
    softFailures.push("normal-start-balance-residual");
  }
  if (
    (preferences.payToWin || preferences.subsidizedStarts) &&
    sequence.firstLeg.summary.payToWin?.balanceValid === false
  ) {
    softFailures.push("priced-start-balance");
  }

  if (!preferences.competitiveMode) {
    const normalOverflow = Math.max(
      0,
      Number(sequence.firstLeg.summary.normalStartBalance?.retainedEffectiveRERangeExcess) || 0
    );
    const pricedFinalBalance = sequence.firstLeg.summary.payToWin?.startBalanceFinalCheck ?? null;
    const pricedOverflow = pricedFinalBalance?.enforced
      ? Math.max(
        0,
        Number(pricedFinalBalance?.afterReprice?.worstObservedExcess) || 0
      )
      : 0;
    if (Math.max(normalOverflow, pricedOverflow) > 1e-9) {
      softFailures.push("fairness-range-overflow");
    }
  }

  if (
    (
      preferences.subsidizedStarts && isVariantForced(preferences, "subsidizedStarts") ||
      preferences.payToWin && isVariantForced(preferences, "payToWin")
    ) &&
    sequence.firstLeg.summary.payToWin?.active &&
    !(Number(sequence.firstLeg.summary.payToWin?.meaningfulEnergyAdjustmentCount) > 0)
  ) {
    softFailures.push("forced-economy-no-effect");
  }

  if (preferences.competitiveMode) {
    const staging = sequence.firstLeg.summary.competitiveStaging;
    const unavailableStartCount = staging?.unavailableIndices?.length
      ?? Math.max(0, (staging?.sourceStartCount ?? reachableStarts.length) - (staging?.routedStartCount ?? reachableStarts.length));
    const requiredCompetitiveStarts = Math.max(1, preferences.playerCount * 2);
    const competitiveCapacityShortfall = (
      (staging?.sourceStartCount ?? reachableStarts.length) < requiredCompetitiveStarts ||
      (staging?.routedStartCount ?? reachableStarts.length) < requiredCompetitiveStarts
    );
    if (unavailableStartCount > 0 || competitiveCapacityShortfall) {
      softFailures.push("competitive-start-availability");
    }
    if (!skipCompetitiveBlockImpact) {
      if (!competitiveBlockImpact?.hardAcceptable) {
        hardFailures.push("competitive-start-balance-hard");
      } else if (!competitiveBlockImpact?.softBalanced) {
        softFailures.push("competitive-start-balance");
      }
    }
  }

  if (context.boardPlacements?.length > 1 && context.pieceMap && context.checkpoints) {
    const physicalUsageStarts = preferences.competitiveMode
      ? reachableStarts
      : usableStarts;
    const usedBoards = collectUsedBoardIndices(
      sequence,
      context.boardPlacements,
      context.pieceMap,
      physicalUsageStarts,
      context.checkpoints
    );

    if (usedBoards.size < context.boardPlacements.length) {
      softFailures.push("unused-board");
    }
  }

  for (const leg of sequence.legs.slice(1)) {
    if (leg.analysis.summary.distinctRouteCount === 0) {
      hardFailures.push(`leg-${leg.from}-${leg.to}`);
    }
  }

  if (!context.skipProductionDifficulty && !Number.isFinite(difficultyTurnRE)) {
    hardFailures.push("re-turn-difficulty-unavailable");
  }
  const difficultyDistanceRE = context.skipProductionDifficulty
    ? 0
    : Number.isFinite(difficultyTurnRE)
      ? nonOverlappingDifficultyBandDistance(difficultyTurnRE, preferences.difficulty, difficultyThresholds)
      : Infinity;
  const difficultyGuidanceFit = Number.isFinite(difficultyDistanceRE)
    ? difficultyDistanceRE * RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE
    : Infinity;
  const lengthGuidanceFit =
    bandDistance(lengthSemanticValue, preferences.length, lengthThresholds) *
    lengthFitPointScale;
  const difficultyFit = preferences.targetGuidanceOnlyDifficulty ? 0 : difficultyGuidanceFit;
  const lengthFit = preferences.targetGuidanceOnlyLength ? 0 : lengthGuidanceFit;
  if (difficultyFit > 0 && Number.isFinite(difficultyFit)) {
    softFailures.push("difficulty-mismatch");
  }
  if (lengthFit > 0) {
    softFailures.push("length-mismatch");
  }
  const difficultyDirection = (context.skipProductionDifficulty || preferences.difficulty === "any" || preferences.targetGuidanceOnlyDifficulty)
    ? "matched"
    : !Number.isFinite(difficultyTurnRE)
      ? "unavailable"
      : difficultyTurnRE < difficultyThresholds[preferences.difficulty][0]
        ? "low"
        : difficultyTurnRE >= difficultyThresholds[preferences.difficulty][1]
          ? "high"
          : "matched";
  const lengthDirection = (preferences.length === "any" || preferences.targetGuidanceOnlyLength)
    ? "matched"
    : lengthSemanticValue < lengthThresholds[preferences.length][0]
      ? "low"
      : lengthSemanticValue >= lengthThresholds[preferences.length][1]
        ? "high"
        : "matched";
  const difficultyTargetBand = preferences.difficulty === "any"
    ? null
    : {
      min: difficultyThresholds[preferences.difficulty][0],
      maxExclusive: Number.isFinite(difficultyThresholds[preferences.difficulty][1])
        ? difficultyThresholds[preferences.difficulty][1]
        : null
    };
  const lengthTargetBand = preferences.length === "any"
    ? null
    : {
      min: lengthThresholds[preferences.length][0],
      maxExclusive: Number.isFinite(lengthThresholds[preferences.length][1])
        ? lengthThresholds[preferences.length][1]
        : null,
      unit: productionLengthOwnerActive ? "wall-clock-turn-index" : "legacy-raw"
    };
  const normalFairnessIsRE =
    sequence.firstLeg.summary.normalStartBalance?.fairnessMetric ===
      "full-course-effective-RE";
  const fairnessPenalty = preferences.competitiveMode
    ? 0
    : normalFairnessIsRE
      ? 0
      : fairnessStdDev >= 14
        ? fairnessStdDev - 14
        : 0;
  // Competitive candidate-fit is also a plateau: once the post-block best-P
  // completed-RE range is inside its Competitive range, more equality is not
  // preferable. Only missing choices or range overflow add fit pressure.
  const competitiveBlockPenalty = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? (
      Math.max(0, preferences.playerCount - (competitiveBlockImpact?.selectedStartCount ?? 0)) * 18 +
      Math.max(0, Number(competitiveBlockImpact?.balanceRangeExcess) || 0) *
        NORMAL_EFFECTIVE_RE_SCORE_PER_RE * 2
    )
    : 0;
  // Moving-target volatility has not yet been adapted to RE-native Competitive
  // fairness. Preserve its historical score-unit input until the systematic
  // variant pass rather than silently weakening that variant interaction here.
  const movingTargetFairnessInput = preferences.competitiveMode
    ? fairnessStdDev * NORMAL_EFFECTIVE_RE_SCORE_PER_RE
    : fairnessStdDev;
  const movingTargetVolatilityLegacyEstimate = getMovingTargetVolatilityPenalty(
    movingTargetStats,
    movingTargetFairnessInput,
    preferences
  );
  // v49eq: dynamic target routing plus register-level mental RE now own the real
  // consequence. The old volatility scalar remains telemetry only and no longer
  // votes in course selection.
  const movingTargetVolatilityPenalty = 0;
  const checkpointOpeningStarts = preferences.competitiveMode ? reachableStarts : usableStarts;
  const openingLegAnticlimax = getOpeningLegAnticlimax(sequence, preferences, checkpointOpeningStarts);
  const intermediateCheckpointPacing = getIntermediateCheckpointPacing(sequence);
  const finalLegAnticlimax = getFinalLegAnticlimax(sequence, preferences);
  const routedCheckpointPacingExpectation = getRoutedCheckpointPacingExpectation(
    openingLegAnticlimax,
    intermediateCheckpointPacing,
    finalLegAnticlimax
  );
  const boardFootprintUse = getBoardFootprintUseProfile(
    sequence,
    context.boardPlacements ?? [],
    context.pieceMap ?? {},
    preferences.competitiveMode ? reachableStarts : usableStarts,
    context.checkpoints ?? []
  );
  const boardGameplayRelevance = getBoardGameplayRelevanceProfile(
    sequence,
    context.boardPlacements ?? [],
    context.overlayPlacements ?? [],
    context.dockPlacements ?? [],
    context.pieceMap ?? {},
    preferences.competitiveMode ? reachableStarts : usableStarts,
    context.checkpoints ?? [],
    context.tileMap ?? null,
    boardFootprintUse,
    {
      ...preferences,
      sandwichedDock: Boolean(preferences.sandwichedDock),
      boardCleanupAuditTrail: context.boardCleanupAuditTrail ?? []
    }
  );
  // Compatibility alias: older presentation/calibration consumers still read
  // meaningfulBoardUse. v49bv makes its actual semantic ownership explicit.
  const meaningfulBoardUse = boardFootprintUse;
  const sandwichedDockUse = preferences.sandwichedDock
    ? getSandwichedDockUseProfile(
      context.boardPlacements ?? [],
      context.dockPlacements ?? [],
      context.pieceMap ?? {},
      context.checkpoints ?? []
    )
    : { active: false, missingSideCount: 0, missingSideBoardIndices: [], penalty: 0 };
  if ((sandwichedDockUse.missingSideCount ?? 0) > 0) {
    softFailures.push("sandwiched-side-use");
  }
  const routeDrama = getRouteDramaProfile(sequence, preferences);
  const spacingStarts = Array.isArray(context.activeStarts) && context.activeStarts.length
    ? context.activeStarts
    : (sequence?.firstLeg?.starts ?? []).map((entry) => entry.start).filter(Boolean);
  const checkpointSpacingExpectation = getCheckpointSpacingExpectationProfile(
    context.checkpoints ?? [],
    spacingStarts,
    preferences
  );
  const normalBalance = sequence.firstLeg.summary.normalStartBalance ?? null;
  const normalBalancePenalty = preferences.competitiveMode
    ? 0
    : Math.max(
      0,
      Number(normalBalance?.residualSelectionPenalty) || 0
    );
  const pricedSummary = sequence.firstLeg.summary.payToWin ?? null;
  const pricedResidual = pricedSummary?.residualBalance ?? null;
  const pricedFinalBalance = pricedSummary?.startBalanceFinalCheck ?? null;
  const pricedEnergyEconomyPenalty = (preferences.payToWin || preferences.subsidizedStarts) &&
    pricedSummary?.energyEconomyBalanceValid === false
    ? Math.max(0, Number(pricedResidual?.worstResidualPenalty) || 0)
    : 0;
  const pricedFinalStartBalancePenalty = pricedFinalBalance?.enforced &&
    pricedFinalBalance?.withinTargetAfterReprice === false
    ? Math.max(0, Number(pricedFinalBalance?.afterReprice?.worstObservedExcess) || 0) *
      NORMAL_EFFECTIVE_RE_SCORE_PER_RE
    : 0;
  const pricedStartBalancePenalty =
    pricedEnergyEconomyPenalty + pricedFinalStartBalancePenalty;

  const startBalanceProfile = getStartBalanceProfile(preferences);
  const normalFairnessRangeLimit = Math.max(
    0,
    Number(normalBalance?.retainedEffectiveRERangeLimit) || 0
  );
  const normalFairnessOverflow = Math.max(
    0,
    Number(normalBalance?.retainedEffectiveRERangeExcess) || 0
  );
  const pricedFairnessRangeLimit = pricedFinalBalance?.enforced
    ? Math.max(
      Number(pricedFinalBalance?.afterReprice?.early?.rangeLimit) || 0,
      Number(pricedFinalBalance?.afterReprice?.late?.rangeLimit) || 0
    )
    : 0;
  const pricedFairnessOverflow = pricedFinalBalance?.enforced
    ? Math.max(
      0,
      Number(pricedFinalBalance?.afterReprice?.worstObservedExcess) || 0
    )
    : 0;
  const normalAcceptanceRangeLimit = startBalanceProfile.enforced
    ? normalFairnessRangeLimit
    : 0;
  const normalAcceptanceOverflow = startBalanceProfile.enforced
    ? normalFairnessOverflow
    : 0;
  const fairnessRangeLimit = preferences.competitiveMode
    ? 0
    : Math.max(normalAcceptanceRangeLimit, pricedFairnessRangeLimit);
  const fairnessOverflowRE = preferences.competitiveMode
    ? 0
    : Math.max(normalAcceptanceOverflow, pricedFairnessOverflow);
  const normalFairnessSoftOverflowAllowance =
    getNormalFairnessSoftOverflowAllowance(normalFairnessRangeLimit, preferences);
  // Priced starts use the selected RE-range target directly. Their own Energy
  // economy has already completed before this terminal Start Balance check, so
  // there is no second priced soft-overflow concept to feed back into pricing.
  const pricedFairnessSoftOverflowAllowance = 0;
  const fairnessSoftOverflowAllowance = preferences.competitiveMode
    ? 0
    : Math.max(
      normalBalance?.active && startBalanceProfile.enforced
        ? normalFairnessSoftOverflowAllowance
        : 0,
      pricedSummary?.active && pricedFinalBalance?.enforced
        ? pricedFairnessSoftOverflowAllowance
        : 0
    );
  const fairnessOverflowFitPenalty = preferences.competitiveMode
    ? 0
    : fairnessOverflowRE * NORMAL_EFFECTIVE_RE_SCORE_PER_RE;
  const fairnessAcceptance = {
    active: !preferences.competitiveMode &&
      fairnessRangeLimit > 0 &&
      (
        (normalBalance?.active && startBalanceProfile.enforced) ||
        (pricedSummary?.active && pricedFinalBalance?.enforced)
      ),
    rangeLimit: Number(fairnessRangeLimit.toFixed(3)),
    overflowRE: Number(fairnessOverflowRE.toFixed(3)),
    softOverflowAllowance: Number(fairnessSoftOverflowAllowance.toFixed(3)),
    fitPenalty: Number(fairnessOverflowFitPenalty.toFixed(3)),
    ordinaryAcceptable:
      preferences.competitiveMode ||
      (
        (!normalBalance?.active ||
          !startBalanceProfile.enforced ||
          normalFairnessOverflow <= normalFairnessSoftOverflowAllowance + 1e-9) &&
        (!pricedSummary?.active ||
          !pricedFinalBalance?.enforced ||
          pricedFinalBalance?.withinTargetAfterReprice !== false)
      ),
    policy:
      "start-balance-normal-plus-post-energy-one-shot-priced-v49fn"
  };

  const forcedEconomyVariantId = preferences.subsidizedStarts &&
    isVariantForced(preferences, "subsidizedStarts")
      ? "subsidizedStarts"
      : preferences.payToWin && isVariantForced(preferences, "payToWin")
        ? "payToWin"
        : null;
  const forcedEconomyNoEffect = Boolean(
    forcedEconomyVariantId &&
    pricedSummary?.active &&
    !(Number(pricedSummary.meaningfulEnergyAdjustmentCount) > 0)
  );
  const forcedEconomyEffectFitPenalty = forcedEconomyNoEffect
    ? FORCED_ECONOMY_NO_EFFECT_FIT_PENALTY
    : 0;
  const forcedEconomyEffect = {
    active: Boolean(forcedEconomyVariantId),
    variantId: forcedEconomyVariantId,
    meaningfulEnergyAdjustmentCount:
      Number(pricedSummary?.meaningfulEnergyAdjustmentCount) || 0,
    noMeaningfulEnergyAdjustment: forcedEconomyNoEffect,
    fitPenalty: forcedEconomyEffectFitPenalty,
    policy:
      "forced-energy-economy-with-no-visible-energy-change-is-a-soft-fit-penalty-v49dy"
  };
  const competitiveStaging = sequence.firstLeg.summary.competitiveStaging ?? null;
  const requiredCompetitiveStarts = Math.max(1, preferences.playerCount * 2);
  const competitiveRoutedStarts = competitiveStaging?.routedStartCount ?? reachableStarts.length;
  const competitiveStartAvailabilityPenalty = preferences.competitiveMode
    ? Math.max(0, requiredCompetitiveStarts - competitiveRoutedStarts) * 8
    : 0;
  const tooShortShortfall = Math.max(0, minimumLengthValue - lengthSemanticValue);
  const tooShortShortfallFitPoints = tooShortShortfall * lengthFitPointScale;
  const tooShortPenalty = tooShortShortfallFitPoints * tooShortShortfallFitPoints * 0.5;
  // Preserve the primary user target as a two-dimensional region: one modest
  // miss can trade against other soft qualities, while missing both requested
  // dimensions compounds. The cross-term is zero as soon as either dimension
  // is in-band, so there is no reward for hitting a band center.
  const targetInteractionPenalty = difficultyFit > 0 && lengthFit > 0
    ? (difficultyFit * 1.2 * lengthFit) / 100
    : 0;
  // Selection plateaus: difficulty/length contribute exactly zero anywhere
  // inside their requested semantic bands, and fairness contributes zero inside
  // its length-responsive expected range. There is no center-of-band reward.
  const fitComponents = {
    difficulty: difficultyFit * 1.2,
    length: lengthFit,
    targetInteraction: targetInteractionPenalty,
    tooShort: tooShortPenalty,
    fairness: fairnessPenalty * 0.5,
    normalBalance: normalBalancePenalty,
    pricedStartBalance: pricedStartBalancePenalty,
    forcedEconomyEffect: forcedEconomyEffectFitPenalty,
    competitiveStartAvailability: competitiveStartAvailabilityPenalty,
    competitiveBalance: competitiveBlockPenalty,
    competitiveReadability: preferences.competitiveMode && !skipCompetitiveBlockImpact
      ? Math.max(0, Number(competitiveBlockImpact?.blockReadability?.fitPenalty) || 0)
      : 0,
    movingTargetVolatility: movingTargetVolatilityPenalty,
    openingPacing: openingLegAnticlimax.penalty,
    middlePacing: intermediateCheckpointPacing.penalty,
    finalPacing: finalLegAnticlimax.penalty,
    boardUse: boardFootprintUse.penalty,
    sandwichedUse: sandwichedDockUse.penalty,
    routeDrama: routeDrama.penalty,
    startCapacity: Math.max(0, preferences.playerCount - usableStarts.length) * 20
  };
  const fitScore = Object.values(fitComponents).reduce((sum, value) => (
    sum + (Number(value) || 0)
  ), 0);
  const exactTargetMatch = difficultyFit === 0 && lengthFit === 0;
  const targetAcceptance = getTargetAxisAcceptanceGate({
    difficultyValue: difficultyTurnRE,
    difficultyFit,
    difficultyDirection,
    lengthFit,
    lengthDirection,
    preferences,
    difficultyThresholds
  });
  const acceptable = Boolean(
    hardFailures.length === 0 &&
    targetAcceptance.ordinaryAcceptable &&
    fairnessAcceptance.ordinaryAcceptable &&
    fitScore <= SOFT_CANDIDATE_RETENTION_LIMIT
  );

  return {
    reachableStarts: reachableStarts.length,
    usableStarts,
    difficultyRaw,
    difficultyTurnRE: Number.isFinite(difficultyTurnRE) ? Number(difficultyTurnRE.toFixed(4)) : null,
    difficultyTurnBaseRE: reTurnDifficulty?.active
      ? Number(reTurnDifficulty.courseTurnDifficultyRE.toFixed(4))
      : null,
    reTurnDifficulty,
    reTurnVariantDifficultyAccounting,
    lengthRaw,
    lengthFitRaw,
    lengthWallClockTurnIndex: Number.isFinite(lengthWallClockTurnIndex)
      ? Number(lengthWallClockTurnIndex.toFixed(4))
      : null,
    lengthSemanticValue: Number.isFinite(lengthSemanticValue)
      ? Number(lengthSemanticValue.toFixed(4))
      : null,
    lengthSemanticUnit: productionLengthOwnerActive
      ? "wall-clock-turn-index"
      : "legacy-raw",
    difficultyFit,
    difficultyDirection,
    difficultyTargetBand,
    lengthMetrics,
    lengthFit,
    lengthDirection,
    lengthTargetBand,
    fairnessStdDev,
    competitiveBlockImpact,
    checkpointPressure,
    variantDifficultyAccounting,
    programmingPressure: reTurnVariantDifficultyAccounting?.programmingPressure
      ?? variantDifficultyAccounting.programmingPressure,
    movingTargetStats,
    movingTargetVolatilityPenalty,
    movingTargetVolatilityLegacyEstimate,
    openingLegAnticlimax,
    intermediateCheckpointPacing,
    finalLegAnticlimax,
    routedCheckpointPacingExpectation,
    boardFootprintUse,
    boardGameplayRelevance,
    boardCleanupAuditTrail: Array.isArray(context.boardCleanupAuditTrail)
      ? context.boardCleanupAuditTrail
      : [],
    meaningfulBoardUse,
    sandwichedDockUse,
    routeDrama,
    checkpointSpacingExpectation,
    targetAcceptance,
    fairnessAcceptance,
    forcedEconomyEffect,
    selectionPlateaus: {
      difficultyInRequestedBand: difficultyFit === 0,
      lengthInRequestedBand: lengthFit === 0,
      fairnessWithinExpectedRange: fairnessOverflowRE <= 1e-9,
      policy:
        "zero-penalty-plateaus-for-requested-difficulty-length-and-expected-fairness-v49dy"
    },
    acceptable,
    exactTargetMatch,
    hardFailures,
    softFailures: [...new Set(softFailures)],
    softFitLimit: SOFT_CANDIDATE_RETENTION_LIMIT,
    fitComponents: Object.fromEntries(
      Object.entries(fitComponents).map(([key, value]) => [key, Number((Number(value) || 0).toFixed(2))])
    ),
    fitScore: Number(fitScore.toFixed(2))
  };
}
