// Robo Rally Course Randomizer - priced starts: Pay to Win and Subsidized Starts energy pricing, selector splits, late pricing, economy rescue and final balance
import {
  analyzeFullCourse,
  buildStartOccupancyMap,
  evaluateFullCourseFocusPaymentCurveUnderOccupancy,
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getCourseStartingUpgradeCards,
  getRouteEnergyEconomyConfig,
  recomputeFirstLegPressure,
  rescoreFixedRouteUpgradeEconomy,
  summarizePowerUpOpportunityBenchmark
} from "../../analyze.js";
import {
  NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE,
  NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY
} from "./config.js";
import { getGenerationModeProfile } from "./generation-modes.js";
import { average, clamp } from "../shared/math.js";
import { getCombinationCount } from "./math.js";
import { sample } from "./random.js";
import {
  getEconomyEnergyActionableResidualBalanceSelectionPenalty,
  getNormalEffectiveRERangeTarget,
  getNormalStartBalanceDiagnostics,
  getStartBalanceProfile,
  mapMaybePromise,
  medianValue,
  normalizeStartBalance,
  rankNormalEffectiveREOutliers,
  runIterativeStartBalancing,
  runIterativeStartBalancingCooperative,
  summarizeNormalRetainedREBalance
} from "./start-balance.js";
import { getRouteAnalysisVariantOptions } from "./variant-availability.js";

export function isSubsidizedStartsPricing(options = {}) {
  return Boolean(options.subsidizedStarts);
}

export function getSubsidizedStartsMaximumEnergy(options = {}) {
  const startingEnergy = getCourseStartingEnergy(options);
  const storageCap = getCourseMaxEnergy(options);
  return Math.min(
    storageCap,
    startingEnergy + SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY
  );
}

export function getStartEnergyAdjustmentLimit(options = {}) {
  const startingEnergy = getCourseStartingEnergy(options);
  if (isSubsidizedStartsPricing(options)) {
    return Math.max(0, getSubsidizedStartsMaximumEnergy(options) - startingEnergy);
  }
  return startingEnergy;
}

export function getPayToWinDenialCost(options = {}) {
  // Kept under the mature P2W helper name because the pricing/pruning engine is
  // shared. Subsidized Starts intentionally has a modest setup correction cap:
  // at most +3E above the scenario's normal starting Energy, while still
  // respecting the game's storage cap.
  return getStartEnergyAdjustmentLimit(options) + 1;
}

export function chooseSubsidizedStartAdjustment(paymentScores, baselineFullScore, maxAdjustment, denialCost) {
  const epsilon = 1e-9;
  const candidates = [];
  let canReachBaseline = false;

  // Include +0E in the closest-match candidates. A weak start may remain
  // slightly below the baseline when its first subsidy point has no modeled
  // benefit; in that case compensation should stay at +0E rather than grant
  // Energy that does not improve the balance. +1..max still determine whether
  // the start can be compensated at all.
  for (let adjustment = 0; adjustment <= maxAdjustment; adjustment += 1) {
    const postAdjustmentScore = Number(paymentScores?.[adjustment]);
    if (!Number.isFinite(postAdjustmentScore)) continue;

    // Lower full-course score is better. Positive delta means this start is
    // still weaker than the 0E baseline; negative means the subsidy has made
    // it stronger. A start is only offerable when the available storage cap
    // can reach/cross the baseline at least once.
    const delta = postAdjustmentScore - baselineFullScore;
    if (adjustment > 0 && delta <= epsilon) canReachBaseline = true;
    candidates.push({
      adjustment,
      delta,
      absoluteGap: Math.abs(delta),
      nonOvercompensating: delta >= -epsilon
    });
  }

  if (!canReachBaseline || !candidates.length) {
    return denialCost;
  }

  candidates.sort((left, right) => {
    const gapDifference = left.absoluteGap - right.absoluteGap;
    if (Math.abs(gapDifference) > epsilon) return gapDifference;

    // If two integer subsidies are equally close, do not make the start
    // stronger than the baseline when an equally good under-compensation
    // exists. If the modeled result is otherwise identical, use the lower
    // subsidy: Subsidized Starts is compensation, not a reason to grant Energy
    // that the shared economy says adds no balancing value.
    if (left.nonOvercompensating !== right.nonOvercompensating) {
      return left.nonOvercompensating ? -1 : 1;
    }
    return left.adjustment - right.adjustment;
  });

  return candidates[0].adjustment;
}

export function choosePayToWinStartAdjustment(paymentScores, baselineFullScore, maxAdjustment, denialCost) {
  const epsilon = 1e-9;
  const candidates = [];
  let canReachBaseline = false;

  // Pay to Win is the mirror image of Subsidized Starts: payment makes a
  // stronger start worse. Choose the integer payment whose modeled result is
  // closest to the weakest-start baseline instead of always taking the first
  // point that crosses it.
  for (let adjustment = 0; adjustment <= maxAdjustment; adjustment += 1) {
    const postAdjustmentScore = Number(paymentScores?.[adjustment]);
    if (!Number.isFinite(postAdjustmentScore)) continue;

    // Lower score is stronger. Negative delta means the priced start is still
    // stronger than the baseline; positive means the payment has overcharged it.
    const delta = postAdjustmentScore - baselineFullScore;
    if (adjustment > 0 && delta >= -epsilon) canReachBaseline = true;
    candidates.push({
      adjustment,
      delta,
      absoluteGap: Math.abs(delta),
      nonOvercharging: delta <= epsilon
    });
  }

  if (!canReachBaseline || !candidates.length) {
    return denialCost;
  }

  candidates.sort((left, right) => {
    const gapDifference = left.absoluteGap - right.absoluteGap;
    if (Math.abs(gapDifference) > epsilon) return gapDifference;

    // If two integer payments are equally close, avoid making the paid start
    // worse than the baseline when an equally good undercharge exists. If the
    // modeled outcome is otherwise identical, prefer the smaller payment.
    if (left.nonOvercharging !== right.nonOvercharging) {
      return left.nonOvercharging ? -1 : 1;
    }
    return left.adjustment - right.adjustment;
  });

  return candidates[0].adjustment;
}

export function getPayToWinRemovalBias(options = {}) {
  let bias = 0;
  // Endpoint pruning is the priced-start setup's one deliberate freedom to
  // reshape the offered course. Length is the primary reason for choosing which
  // end to trim; difficulty is a weaker tiebreaker.
  if (options.length === "short") {
    bias += 2;
  } else if (options.length === "long" || options.length === "epic") {
    bias -= 2;
  }

  if (options.difficulty === "easy") {
    bias += 1;
  } else if (options.difficulty === "hard" || options.difficulty === "brutal") {
    bias -= 1;
  }

  return bias;
}

export function getPayToWinFullCourseScore(startAnalysis) {
  if (!startAnalysis?.fullCourseRoute) return null;
  const routeScore = Number(
    startAnalysis.courseEstimate?.totalScore ??
    startAnalysis.fullCourseRoute?.score
  );
  const trafficPenalty = Number(
    startAnalysis.courseEstimate?.fullCourseTrafficPenalty ??
    startAnalysis.fullCourseTrafficPenalty ??
    0
  );
  if (!Number.isFinite(routeScore) || !Number.isFinite(trafficPenalty)) {
    return null;
  }
  return routeScore + trafficPenalty;
}

export function getPayToWinPricingBenchmark(tileMap, firstLeg, activeStarts, options = {}) {
  const benchmark = typeof summarizePowerUpOpportunityBenchmark === "function"
    ? summarizePowerUpOpportunityBenchmark(
      tileMap,
      activeStarts,
      firstLeg.flags || [],
      {
        ...options,
        payToWin: true,
        // Iterative pricing can run several passes. We only need the robust
        // productive-register scale and horizon here; the much more expensive
        // Power Up counterfactual remains a once-per-course diagnostic.
        skipPowerUpStrategicSamples: true
      }
    )
    : null;
  const fallbackRegisterScores = activeStarts.map((item) => {
    const score = Number(item.fullCourseRoute?.score);
    const actions = Number(item.fullCourseRoute?.actions);
    return Number.isFinite(score) && Number.isFinite(actions) && actions > 0
      ? score / actions
      : null;
  }).filter(Number.isFinite);
  const measuredRegisterScore = Number(benchmark?.registerScoreMedian);
  const registerTempoCost = Number(benchmark?.registerTempoCost);
  const registerScore = measuredRegisterScore > 0
    ? measuredRegisterScore
    : (medianValue(fallbackRegisterScores) || (registerTempoCost > 0 ? registerTempoCost : 6.4));
  const measuredTurns = Number(benchmark?.medianFullCourseTurns);
  const fallbackTurns = medianValue(activeStarts.map((item) => {
    const actions = Number(item.fullCourseRoute?.actions);
    return Number.isFinite(actions) ? actions / 5 : null;
  }));

  return {
    benchmark,
    registerScore: Number(registerScore.toFixed(2)),
    horizonTurns: Number((measuredTurns > 0 ? measuredTurns : fallbackTurns).toFixed(2))
  };
}

export function getPayToWinRouteEconomyPricingOptions(firstLeg, options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  const production = firstLeg?.summary?.coursePreflight?.routeAwareBatteryScoring ?? null;
  const retainedRoutes = (firstLeg?.starts ?? [])
    .map((item) => item?.fullCourseRoute)
    .filter((route) => route && Number(route.actions) > 0 && Number.isFinite(Number(route.score)));
  const fallbackHorizonTurns = retainedRoutes.length
    ? medianValue(retainedRoutes.map((route) => Number(route.actions) / config.registersPerTurn))
    : 0;
  const fallbackRegisterScore = retainedRoutes.length
    ? medianValue(retainedRoutes.map((route) => Number(route.score) / Number(route.actions)))
    : 0;
  const horizonTurns = Number(production?.horizonTurns ?? options.routeEnergyHorizonTurns ?? fallbackHorizonTurns);
  const registerScore = Number(production?.registerScore ?? options.routeEnergyRegisterScore ?? fallbackRegisterScore);
  const routeAwareBatteryScoring = Boolean(
    !options.lighterGame && horizonTurns > 0 && registerScore > 0
  );
  return {
    ...options,
    payToWin: true,
    subsidizedStarts: Boolean(options.subsidizedStarts),
    routeAwareBatteryScoring,
    routeEnergyHorizonTurns: horizonTurns,
    routeEnergyRegisterScore: registerScore,
    routeEnergyReferenceReserve: config.startingEnergy,
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
    payToWinMaxPayment: config.startingEnergy,
    subsidizedStartsMaxSubsidy: Math.max(0, Math.min(config.maxEnergy, config.startingEnergy + SUBSIDIZED_STARTS_MAX_EXTRA_ENERGY) - config.startingEnergy)
  };
}

export function buildPayToWinQualityOccupancy(
  activeStarts,
  focusIndex,
  playerCount,
  qualityScoreByIndex = null,
  knownIndices = [],
  unresolvedIndices = null
) {
  // START_ENERGY_TRAFFIC: pricing changes attractiveness but does not make starts
  // literally identical. Use the same common-field allocator as Normal. The focus
  // robot and already-made selector choices are certain; unresolved player mass is
  // distributed by relative post-price quality across the still-available starts.
  const fallbackQuality = new Map(activeStarts.map((item) => {
    const effectiveRE = Number(item.normalFairnessEffectiveRE);
    return [
      item.index,
      Number.isFinite(effectiveRE)
        ? effectiveRE
        : getPayToWinFullCourseScore(item)
    ];
  }));
  const quality = qualityScoreByIndex ?? fallbackQuality;
  return buildStartOccupancyMap(
    activeStarts,
    playerCount,
    {
      occupancyFocusIndex: focusIndex,
      occupancyCertainIndices: knownIndices,
      occupancyUnresolvedIndices: unresolvedIndices,
      occupancyQualityScoreByIndex: quality
    },
    (analysis) => analysis.fullCourseRoute
  );
}

export function buildPayToWinPaymentCurveBundle(
  firstLeg,
  tileMap,
  activeStarts,
  options = {}
) {
  const pricingOptions = getPayToWinRouteEconomyPricingOptions(firstLeg, options);
  const playerCount = Math.max(1, options.playerCount ?? 4);
  const scoreCurves = new Map();
  const effectiveRECurves = new Map();

  // v49ck: seed selector-conditioned occupancy from the same completed
  // effective-RE quality language that owns start fairness. The economy model
  // must not make a start look unusually attractive merely because its legacy
  // pathfinder/search score is low. Selector conditioning still changes which
  // starts are certain/unresolved, and post-adjustment RE below can change the
  // late field after prices are known.
  const qualityScoreByIndex = new Map(activeStarts.map((item) => {
    const effectiveRE = Number(item.normalFairnessEffectiveRE);
    return [
      item.index,
      Number.isFinite(effectiveRE)
        ? effectiveRE
        : getPayToWinFullCourseScore(item)
    ];
  }));

  activeStarts.forEach((item) => {
    const occupancyByIndex = buildPayToWinQualityOccupancy(
      activeStarts,
      item.index,
      playerCount,
      qualityScoreByIndex
    );
    const evaluation = evaluateFullCourseFocusPaymentCurveUnderOccupancy(
      tileMap,
      firstLeg,
      firstLeg.flags || [],
      item.index,
      occupancyByIndex,
      pricingOptions
    );
    const ordered = (evaluation?.entries ?? [])
      .slice()
      .sort((left, right) => left.payment - right.payment);
    const scores = ordered.map((entry) => entry.fullTotal);
    const effectiveREs = ordered.map((entry) => entry.fullEffectiveRE);
    scoreCurves.set(
      item.index,
      scores.length ? scores : [getPayToWinFullCourseScore(item)]
    );
    effectiveRECurves.set(
      item.index,
      effectiveREs.length && effectiveREs.some(Number.isFinite)
        ? effectiveREs
        : [Number(item.normalFairnessEffectiveRE)]
    );
  });

  return { scoreCurves, effectiveRECurves };
}

export function buildPayToWinPaymentScoreCurves(
  firstLeg,
  tileMap,
  activeStarts,
  options = {}
) {
  return buildPayToWinPaymentCurveBundle(
    firstLeg,
    tileMap,
    activeStarts,
    options
  ).scoreCurves;
}

export function buildPayToWinRegisterPricingState(
  activeStarts,
  scoreByIndex,
  pricingBenchmark,
  options = {},
  paymentScoreByIndex = null
) {
  const startingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const subsidizedStarts = isSubsidizedStartsPricing(options);
  const maxAdjustment = getStartEnergyAdjustmentLimit(options);
  const denialCost = getPayToWinDenialCost(options);
  const scoredStarts = activeStarts.map((item) => {
    const rawCurve = paymentScoreByIndex?.get(item.index);
    const overrideScore = scoreByIndex?.get(item.index);
    const curveZero = Array.isArray(rawCurve) ? Number(rawCurve[0]) : null;
    const fullScore = Number.isFinite(overrideScore)
      ? overrideScore
      : Number.isFinite(curveZero)
        ? curveZero
        : getPayToWinFullCourseScore(item);
    const paymentScores = Array.from(
      { length: maxAdjustment + 1 },
      (_, adjustment) => {
        const value = Array.isArray(rawCurve) ? Number(rawCurve[adjustment]) : null;
        return Number.isFinite(value)
          ? value
          : (adjustment === 0 && Number.isFinite(fullScore) ? fullScore : null);
      }
    );
    if (Number.isFinite(fullScore)) paymentScores[0] = fullScore;
    return {
      startAnalysis: item,
      index: item.index,
      adjustedScore: item.adjustedScore,
      fullScore,
      paymentScores
    };
  }).filter((entry) => Number.isFinite(entry.fullScore));

  if (!scoredStarts.length) {
    return {
      entries: [],
      costUnit: pricingBenchmark?.registerScore ?? 1,
      minScore: 0,
      maxScore: 0,
      pricingModel: null
    };
  }

  // Lower full-course score is the stronger/easier start. Pay to Win anchors
  // on the weakest/highest-score start and charges stronger starts. Subsidized
  // Starts anchors on the strongest/lowest-score start and grants Energy to
  // weaker starts until they catch up.
  const baseline = [...scoredStarts].sort((left, right) => (
    subsidizedStarts
      ? left.fullScore - right.fullScore || left.index - right.index
      : right.fullScore - left.fullScore || left.index - right.index
  ))[0];
  const registerScore = Math.max(
    0.01,
    Number(pricingBenchmark?.registerScore) || 6.4
  );
  const entries = scoredStarts.map((entry) => {
    const advantage = subsidizedStarts
      ? Math.max(0, entry.fullScore - baseline.fullScore)
      : Math.max(0, baseline.fullScore - entry.fullScore);
    const registerEquivalent = advantage / registerScore;
    let energyCost = 0;

    if (advantage > 1e-9) {
      if (subsidizedStarts) {
        // Subsidies are discrete and the card-aware fixed-route economy is
        // intentionally nonlinear/plateaued. Choose the available integer subsidy whose
        // post-subsidy route value is closest to the 0E baseline, while still
        // requiring that the +max storage-cap subsidy can compensate the start
        // at all. This avoids systematically taking the first overshoot.
        energyCost = chooseSubsidizedStartAdjustment(
          entry.paymentScores,
          baseline.fullScore,
          maxAdjustment,
          denialCost
        );
      } else {
        energyCost = choosePayToWinStartAdjustment(
          entry.paymentScores,
          baseline.fullScore,
          maxAdjustment,
          denialCost
        );
      }
    }

    const payable = energyCost <= maxAdjustment;
    const evaluatedAdjustment = payable ? energyCost : maxAdjustment;
    const postPaymentFullScore = Number(entry.paymentScores[evaluatedAdjustment]);
    const paymentPenalty = Number.isFinite(postPaymentFullScore)
      ? subsidizedStarts
        ? Math.max(0, entry.fullScore - postPaymentFullScore)
        : Math.max(0, postPaymentFullScore - entry.fullScore)
      : null;
    const remainingAdvantage = Number.isFinite(postPaymentFullScore)
      ? subsidizedStarts
        ? Math.max(0, postPaymentFullScore - baseline.fullScore)
        : Math.max(0, baseline.fullScore - postPaymentFullScore)
      : advantage;

    return {
      ...entry,
      advantage: Number(advantage.toFixed(2)),
      registerEquivalent: Number(registerEquivalent.toFixed(2)),
      energyCost,
      postPaymentFullScore: Number.isFinite(postPaymentFullScore)
        ? Number(postPaymentFullScore.toFixed(2))
        : null,
      paymentPenalty: Number.isFinite(paymentPenalty)
        ? Number(paymentPenalty.toFixed(2))
        : null,
      remainingAdvantage: Number(remainingAdvantage.toFixed(2)),
      remainingRegisterEquivalent: Number((remainingAdvantage / registerScore).toFixed(2)),
      postAdjustmentDeltaScore: Number.isFinite(postPaymentFullScore)
        ? Number((postPaymentFullScore - baseline.fullScore).toFixed(2))
        : null,
      postAdjustmentDeltaRegisters: Number.isFinite(postPaymentFullScore)
        ? Number(((postPaymentFullScore - baseline.fullScore) / registerScore).toFixed(3))
        : null,
      paymentScores: entry.paymentScores.map((value) => (
        Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null
      ))
    };
  });

  const paymentPenalties = [];
  for (let adjustment = 1; adjustment <= maxAdjustment; adjustment += 1) {
    const impacts = scoredStarts.map((entry) => {
      const after = Number(entry.paymentScores[adjustment]);
      if (!Number.isFinite(after)) return null;
      return subsidizedStarts
        ? Math.max(0, entry.fullScore - after)
        : Math.max(0, after - entry.fullScore);
    }).filter(Number.isFinite);
    paymentPenalties.push({
      payment: adjustment,
      medianScore: impacts.length
        ? Number(medianValue(impacts).toFixed(2))
        : null,
      maxScore: impacts.length
        ? Number(Math.max(...impacts).toFixed(2))
        : null,
      medianRegisters: impacts.length
        ? Number((medianValue(impacts) / registerScore).toFixed(3))
        : null,
      maxRegisters: impacts.length
        ? Number((Math.max(...impacts) / registerScore).toFixed(3))
        : null
    });
  }

  const pricingModel = {
    method: subsidizedStarts
      ? "moving-baseline-card-aware-subsidy-v37"
      : "moving-baseline-card-aware-payment-v37",
    mode: subsidizedStarts ? "subsidy" : "payment",
    baselineIndex: baseline.index,
    baselineFullScore: Number(baseline.fullScore.toFixed(2)),
    registerScore,
    horizonTurns: pricingBenchmark?.horizonTurns ?? null,
    startingEnergy,
    maxEnergy,
    maxAdjustment,
    maxSubsidy: subsidizedStarts ? maxAdjustment : 0,
    denialCost,
    paymentPenalties,
    maxRegisterAdvantage: Number(Math.max(
      0,
      ...entries.map((entry) => entry.registerEquivalent)
    ).toFixed(2))
  };

  return {
    entries,
    costUnit: registerScore,
    minScore: Math.min(...scoredStarts.map((entry) => entry.fullScore)),
    maxScore: Math.max(...scoredStarts.map((entry) => entry.fullScore)),
    pricingModel
  };
}


export function buildEconomyCompensationBalanceEntries(entries = [], adjustmentByIndex = new Map()) {
  return entries.map((entry) => {
    const maxCurveIndex = Math.max(0, (entry.paymentScores?.length ?? 1) - 1);
    const requestedAdjustment = Number(adjustmentByIndex.get(entry.index) ?? 0);
    const adjustment = clamp(
      Number.isFinite(requestedAdjustment) ? Math.floor(requestedAdjustment) : 0,
      0,
      maxCurveIndex
    );
    const effectiveRE = Number(entry.paymentScores?.[adjustment]);
    return {
      ...entry.startAnalysis,
      index: entry.index,
      normalFairnessEffectiveRE: effectiveRE,
      normalFairnessRegisterCount: Number(
        entry.startAnalysis?.fullCourseRoute?.actions ??
        entry.startAnalysis?.bestActions
      ),
      bestActions: Number(
        entry.startAnalysis?.fullCourseRoute?.actions ??
        entry.startAnalysis?.bestActions
      ),
      economyAdjustment: adjustment
    };
  }).filter((entry) => Number.isFinite(entry.normalFairnessEffectiveRE));
}

export function summarizeEconomyCompensationObjective(entries = [], adjustmentByIndex = new Map()) {
  const balanceEntries = buildEconomyCompensationBalanceEntries(
    entries,
    adjustmentByIndex
  );
  const balance = summarizeNormalRetainedREBalance(balanceEntries);
  const penalty = getEconomyEnergyActionableResidualBalanceSelectionPenalty(balanceEntries);
  const outliers = rankNormalEffectiveREOutliers(
    balanceEntries,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  return {
    balanceEntries,
    balance,
    penalty,
    outliers,
    adjustmentTotal: [...adjustmentByIndex.values()].reduce(
      (sum, value) => sum + Math.max(0, Number(value) || 0),
      0
    )
  };
}

export function chooseEconomyStartAdjustmentClosestToTarget(entry, targetEffectiveRE, options = {}) {
  const subsidizedStarts = isSubsidizedStartsPricing(options);
  const epsilon = 1e-9;
  const rawRE = Number(entry?.fullScore);
  const maxAdjustment = Math.min(
    getStartEnergyAdjustmentLimit(options),
    Math.max(0, (entry?.paymentScores?.length ?? 1) - 1)
  );
  const rawDelta = rawRE - targetEffectiveRE;
  const compensable = Number.isFinite(rawRE) && Number.isFinite(targetEffectiveRE) && (
    subsidizedStarts
      ? rawDelta > epsilon
      : rawDelta < -epsilon
  );

  if (!compensable || maxAdjustment <= 0) {
    return {
      adjustment: 0,
      rawRE,
      postRE: rawRE,
      rawGap: Number.isFinite(rawDelta) ? Math.abs(rawDelta) : 0,
      residualGap: Number.isFinite(rawDelta) ? Math.abs(rawDelta) : 0,
      capLimited: false,
      compensable,
      crossedTarget: false
    };
  }

  const candidates = [];
  for (let adjustment = 0; adjustment <= maxAdjustment; adjustment += 1) {
    const postRE = Number(entry.paymentScores?.[adjustment]);
    if (!Number.isFinite(postRE)) continue;
    const delta = postRE - targetEffectiveRE;
    candidates.push({
      adjustment,
      postRE,
      delta,
      gap: Math.abs(delta),
      // In an exact tie, prefer the result that has not crossed past the
      // directional anchor. This keeps compensation from overcorrecting when
      // two integer Energy choices are equally close.
      nonOvercompensating: subsidizedStarts
        ? delta >= -epsilon
        : delta <= epsilon
    });
  }

  if (!candidates.length) {
    return {
      adjustment: 0,
      rawRE,
      postRE: rawRE,
      rawGap: Math.abs(rawDelta),
      residualGap: Math.abs(rawDelta),
      capLimited: false,
      compensable,
      crossedTarget: false
    };
  }

  candidates.sort((left, right) => (
    left.gap - right.gap ||
    Number(right.nonOvercompensating) - Number(left.nonOvercompensating) ||
    left.adjustment - right.adjustment
  ));
  const selected = candidates[0];
  const capLimited = Boolean(
    selected.adjustment === maxAdjustment &&
    (subsidizedStarts
      ? selected.postRE > targetEffectiveRE + epsilon
      : selected.postRE < targetEffectiveRE - epsilon)
  );

  return {
    adjustment: selected.adjustment,
    rawRE,
    postRE: selected.postRE,
    rawGap: Math.abs(rawDelta),
    residualGap: selected.gap,
    capLimited,
    compensable,
    crossedTarget: subsidizedStarts
      ? selected.postRE < targetEffectiveRE - epsilon
      : selected.postRE > targetEffectiveRE + epsilon
  };
}

export function optimizeEconomyStartingEnergyAdjustments(entries = [], options = {}) {
  const subsidizedStarts = isSubsidizedStartsPricing(options);
  const finiteRaw = entries
    .map((entry) => Number(entry.fullScore))
    .filter(Number.isFinite);
  const targetEffectiveRE = finiteRaw.length
    ? (subsidizedStarts ? Math.min(...finiteRaw) : Math.max(...finiteRaw))
    : 0;
  const fieldMedianEffectiveRE = finiteRaw.length ? medianValue(finiteRaw) : 0;
  const adjustmentByIndex = new Map();
  const choiceByIndex = new Map();

  for (const entry of entries) {
    const choice = chooseEconomyStartAdjustmentClosestToTarget(
      entry,
      targetEffectiveRE,
      options
    );
    adjustmentByIndex.set(entry.index, choice.adjustment);
    choiceByIndex.set(entry.index, choice);
  }

  const rawAdjustmentByIndex = new Map(entries.map((entry) => [entry.index, 0]));
  const raw = summarizeEconomyCompensationObjective(entries, rawAdjustmentByIndex);
  const final = summarizeEconomyCompensationObjective(entries, adjustmentByIndex);
  const choices = entries.map((entry) => ({
    index: entry.index,
    ...(choiceByIndex.get(entry.index) ?? {})
  }));
  const capLimitedIndices = choices
    .filter((choice) => choice.capLimited)
    .map((choice) => choice.index);
  const steps = choices
    .filter((choice) => choice.adjustment > 0)
    .map((choice) => ({
      index: choice.index,
      adjustment: choice.adjustment,
      addedSteps: choice.adjustment,
      improvement: Number(Math.max(0, choice.rawGap - choice.residualGap).toFixed(3)),
      rawGap: Number(choice.rawGap.toFixed(3)),
      residualGap: Number(choice.residualGap.toFixed(3)),
      capLimited: Boolean(choice.capLimited),
      crossedTarget: Boolean(choice.crossedTarget)
    }));

  return {
    adjustmentByIndex,
    choiceByIndex,
    raw,
    final,
    steps,
    maxAdjustment: getStartEnergyAdjustmentLimit(options),
    targetEffectiveRE,
    fieldMedianEffectiveRE,
    targetPolicy: subsidizedStarts
      ? "strongest-start-directional-anchor"
      : "weakest-start-directional-anchor",
    capLimitedIndices
  };
}

export function buildPayToWinEffectiveREPricingState(
  activeStarts,
  effectiveREByIndex,
  options = {},
  paymentEffectiveREByIndex = null
) {
  const subsidizedStarts = isSubsidizedStartsPricing(options);
  const maxAdjustment = getStartEnergyAdjustmentLimit(options);
  const rawEntries = activeStarts.map((item) => {
    const rawCurve = paymentEffectiveREByIndex?.get(item.index);
    const overrideRE = Number(effectiveREByIndex?.get(item.index));
    const curveZero = Array.isArray(rawCurve) ? Number(rawCurve[0]) : null;
    const fullRE = Number.isFinite(overrideRE)
      ? overrideRE
      : Number.isFinite(curveZero)
        ? curveZero
        : Number(item.normalFairnessEffectiveRE);
    const paymentScores = Array.from(
      { length: maxAdjustment + 1 },
      (_, adjustment) => {
        const value = Array.isArray(rawCurve) ? Number(rawCurve[adjustment]) : null;
        return Number.isFinite(value)
          ? value
          : (adjustment === 0 && Number.isFinite(fullRE) ? fullRE : null);
      }
    );
    if (Number.isFinite(fullRE)) paymentScores[0] = fullRE;
    return {
      startAnalysis: item,
      index: item.index,
      adjustedScore: item.adjustedScore,
      fullScore: fullRE,
      paymentScores
    };
  }).filter((entry) => Number.isFinite(entry.fullScore));

  if (!rawEntries.length) {
    return {
      entries: [],
      costUnit: 1,
      minScore: 0,
      maxScore: 0,
      pricingModel: null
    };
  }

  const optimized = optimizeEconomyStartingEnergyAdjustments(rawEntries, options);
  const targetRE = Number(optimized.targetEffectiveRE);
  const centerRE = Number(optimized.fieldMedianEffectiveRE);
  const targetEntry = [...rawEntries].sort((left, right) => (
    subsidizedStarts
      ? left.fullScore - right.fullScore || left.index - right.index
      : right.fullScore - left.fullScore || left.index - right.index
  ))[0] ?? null;
  const entries = rawEntries.map((entry) => {
    const energyCost = optimized.adjustmentByIndex.get(entry.index) ?? 0;
    const choice = optimized.choiceByIndex.get(entry.index) ?? null;
    const postRE = Number(entry.paymentScores?.[energyCost]);
    const directionalAdvantage = subsidizedStarts
      ? Math.max(0, entry.fullScore - targetRE)
      : Math.max(0, targetRE - entry.fullScore);
    const remainingDirectionalAdvantage = Number.isFinite(postRE)
      ? subsidizedStarts
        ? Math.max(0, postRE - targetRE)
        : Math.max(0, targetRE - postRE)
      : directionalAdvantage;
    return {
      ...entry,
      advantage: Number(directionalAdvantage.toFixed(3)),
      registerEquivalent: Number((entry.fullScore - targetRE).toFixed(3)),
      energyCost,
      postPaymentFullScore: Number.isFinite(postRE)
        ? Number(postRE.toFixed(3))
        : null,
      postAdjustmentEffectiveRE: Number.isFinite(postRE)
        ? Number(postRE.toFixed(3))
        : null,
      paymentPenalty: Number.isFinite(postRE)
        ? Number(Math.abs(postRE - entry.fullScore).toFixed(3))
        : null,
      remainingAdvantage: Number(remainingDirectionalAdvantage.toFixed(3)),
      remainingRegisterEquivalent: Number(remainingDirectionalAdvantage.toFixed(3)),
      postAdjustmentDeltaScore: Number.isFinite(postRE)
        ? Number((postRE - targetRE).toFixed(3))
        : null,
      postAdjustmentDeltaRegisters: Number.isFinite(postRE)
        ? Number((postRE - targetRE).toFixed(3))
        : null,
      targetEffectiveRE: Number.isFinite(targetRE) ? Number(targetRE.toFixed(3)) : null,
      rawTargetGap: Number.isFinite(choice?.rawGap) ? Number(choice.rawGap.toFixed(3)) : null,
      residualTargetGap: Number.isFinite(choice?.residualGap) ? Number(choice.residualGap.toFixed(3)) : null,
      capLimited: Boolean(choice?.capLimited),
      crossedTarget: Boolean(choice?.crossedTarget),
      paymentScores: entry.paymentScores.map((value) => (
        Number.isFinite(Number(value)) ? Number(Number(value).toFixed(6)) : null
      ))
    };
  });

  const nonzeroCount = entries.filter((entry) => entry.energyCost > 0).length;
  const maximumChosenAdjustment = entries.length
    ? Math.max(...entries.map((entry) => entry.energyCost))
    : 0;
  const pricingModel = {
    method: subsidizedStarts
      ? "selector-aware-start-specific-effective-re-balance-subsidy-v49dz"
      : "selector-aware-start-specific-effective-re-balance-payment-v49dz",
    mode: subsidizedStarts ? "subsidy" : "payment",
    ownership: "completed-effective-re",
    occupancyQualityOwner: "completed-effective-re",
    energyStepPolicy: "per-start-discrete-closest-to-directional-anchor-before-pruning-v49dz",
    compensationFirst: true,
    target: "minimize-each-start-effective-re-gap-before-range-first-pruning",
    baselineIndex: targetEntry?.index ?? null,
    baselineFullScore: Number.isFinite(targetRE) ? Number(targetRE.toFixed(3)) : null,
    targetEffectiveRE: Number.isFinite(targetRE) ? Number(targetRE.toFixed(3)) : null,
    targetPolicy: optimized.targetPolicy,
    centerEffectiveRE: Number(centerRE.toFixed(3)),
    registerScore: 1,
    horizonTurns: null,
    startingEnergy: getCourseStartingEnergy(options),
    maxEnergy: getCourseMaxEnergy(options),
    maxAdjustment,
    maxSubsidy: subsidizedStarts ? maxAdjustment : 0,
    subsidyStartingEnergyCeiling: subsidizedStarts
      ? getSubsidizedStartsMaximumEnergy(options)
      : null,
    denialCost: getPayToWinDenialCost(options),
    paymentPenalties: [],
    maxRegisterAdvantage: Number(Math.max(
      0,
      ...entries.map((entry) => Math.abs(entry.registerEquivalent))
    ).toFixed(3)),
    rawResidualPenalty: optimized.raw.penalty.total,
    residualPenalty: optimized.final.penalty.total,
    rawIgnoredDurationPenalty: optimized.raw.penalty.ignoredDuration ?? 0,
    residualIgnoredDurationPenalty: optimized.final.penalty.ignoredDuration ?? 0,
    rawNormalStylePenaltyIncludingDuration: optimized.raw.penalty.normalTotal ?? optimized.raw.penalty.total,
    residualNormalStylePenaltyIncludingDuration: optimized.final.penalty.normalTotal ?? optimized.final.penalty.total,
    rawStdDev: optimized.raw.balance.stdDev,
    residualStdDev: optimized.final.balance.stdDev,
    adjustmentSteps: optimized.steps,
    nonzeroAdjustmentCount: nonzeroCount,
    maximumChosenAdjustment,
    capLimitedAdjustmentCount: optimized.capLimitedIndices.length,
    capLimitedAdjustmentIndices: [...optimized.capLimitedIndices],
    comparatorOnly: false
  };

  return {
    entries,
    costUnit: 1,
    minScore: Math.min(...rawEntries.map((entry) => entry.fullScore)),
    maxScore: Math.max(...rawEntries.map((entry) => entry.fullScore)),
    pricingModel,
    compensationObjective: optimized.final,
    rawCompensationObjective: optimized.raw
  };
}


export function getPayToWinCostEntries(firstLeg, tileMap, excludedIndices = new Set(), options = {}) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    item.fullCourseRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));

  if (!activeStarts.length) {
    return { entries: [], costUnit: 1, minScore: 0, maxScore: 0, pricingModel: null };
  }

  const pricingBenchmark = getPayToWinPricingBenchmark(
    tileMap,
    firstLeg,
    activeStarts,
    options
  );
  const paymentCurves = buildPayToWinPaymentCurveBundle(
    firstLeg,
    tileMap,
    activeStarts,
    options
  );
  const legacyState = buildPayToWinRegisterPricingState(
    activeStarts,
    null,
    pricingBenchmark,
    options,
    paymentCurves.scoreCurves
  );
  const effectiveREByIndex = new Map(activeStarts.map((item) => [
    item.index,
    Number(paymentCurves.effectiveRECurves.get(item.index)?.[0])
  ]));
  const effectiveREPricingState = buildPayToWinEffectiveREPricingState(
    activeStarts,
    effectiveREByIndex,
    options,
    paymentCurves.effectiveRECurves
  );
  return {
    ...effectiveREPricingState,
    legacyPricingState: legacyState,
    legacyScoreCurves: paymentCurves.scoreCurves,
    effectiveRECurves: paymentCurves.effectiveRECurves,
    effectiveREPricingState
  };
}


// These are model-selection guards, not energy-price thresholds. They prevent a
// mathematically optimal but strategically trivial breakpoint from creating a
// second printed cost merely because of traffic noise near an integer boundary.
export const PAY_TO_WIN_SELECTOR_SPLIT_MIN_GAIN_R = 0.05;
export const PAY_TO_WIN_SELECTOR_SPLIT_MIN_RELATIVE_GAIN = 0.22;
export const PAY_TO_WIN_SELECTOR_SPLIT_MIN_SEPARATION_R = 0.16;

export function getPayToWinSelectorSurplusConfig(startCount, playerCount) {
  const safePlayerCount = Math.max(1, playerCount ?? 1);
  return {
    playerCount: safePlayerCount,
    surplusStarts: Math.max(0, startCount - safePlayerCount)
  };
}

export function getPayToWinProfileDistance(leftState, rightState) {
  const rightByIndex = new Map((rightState?.entries ?? []).map((entry) => [
    entry.index,
    entry.registerEquivalent
  ]));
  const deltas = (leftState?.entries ?? []).map((entry) => {
    const rightValue = rightByIndex.get(entry.index);
    return Number.isFinite(entry.registerEquivalent) && Number.isFinite(rightValue)
      ? Math.abs(entry.registerEquivalent - rightValue)
      : null;
  }).filter(Number.isFinite);

  if (!deltas.length) return 0;
  const sorted = deltas.slice().sort((left, right) => left - right);
  const median = medianValue(sorted);
  const p75Index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * 0.75)
  );
  const p75 = sorted[p75Index];

  // One unusual starting space should not decide where the player-tier boundary
  // falls. Median carries most of the weight, while p75 keeps the fit sensitive
  // to a change that affects a meaningful minority of the starting field.
  return Number((median * 0.65 + p75 * 0.35).toFixed(4));
}

export function averagePayToWinSelectorScores(
  selectorStates,
  selectors,
  activeStarts,
  field,
  fallbackByIndex
) {
  const scoreByIndex = new Map();

  for (const item of activeStarts) {
    const values = selectors.map((selector) => (
      selectorStates.get(selector)?.get(item.index)?.[field]
    )).filter(Number.isFinite);
    const fallback = fallbackByIndex.get(item.index);

    scoreByIndex.set(
      item.index,
      values.length ? average(values) : fallback
    );
  }

  return scoreByIndex;
}


export function averagePayToWinSelectorPaymentScores(
  selectorStates,
  selectors,
  activeStarts,
  fallbackByIndex
) {
  const result = new Map();
  for (const item of activeStarts) {
    const fallback = fallbackByIndex.get(item.index) ?? [];
    const paymentCount = Math.max(
      fallback.length,
      ...selectors.map((selector) => (
        selectorStates.get(selector)?.get(item.index)?.paymentScores?.length ?? 0
      ))
    );
    const averaged = Array.from({ length: paymentCount }, (_, payment) => {
      const values = selectors.map((selector) => (
        selectorStates.get(selector)?.get(item.index)?.paymentScores?.[payment]
      )).filter(Number.isFinite);
      const fallbackValue = Number(fallback[payment]);
      return values.length
        ? average(values)
        : (Number.isFinite(fallbackValue) ? fallbackValue : null);
    });
    result.set(item.index, averaged);
  }
  return result;
}

export function getPayToWinSelectorFitError(
  selectorPricingStates,
  selectors,
  representativeState
) {
  if (!selectors.length) return 0;
  const distances = selectors.map((selector) => (
    getPayToWinProfileDistance(
      selectorPricingStates.get(selector),
      representativeState
    )
  ));
  return Number(average(distances).toFixed(4));
}

export function getPayToWinAdaptiveSelectorSplit(
  activeStarts,
  selectorStates,
  selectorPricingStates,
  pricingBenchmark,
  playerCount,
  options = {}
) {
  const selectors = Array.from(
    { length: Math.max(1, playerCount) },
    (_, index) => index + 1
  );
  const baselineFullByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.full ?? getPayToWinFullCourseScore(item)
  ]));
  const baselineAdjustedByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.adjusted ?? item.adjustedScore
  ]));
  const baselinePaymentByIndex = new Map(activeStarts.map((item) => [
    item.index,
    selectorStates.get(1)?.get(item.index)?.paymentScores ?? [baselineFullByIndex.get(item.index)]
  ]));
  const buildRepresentative = (groupSelectors) => {
    const fullScoreByIndex = averagePayToWinSelectorScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      "full",
      baselineFullByIndex
    );
    const adjustedScoreByIndex = averagePayToWinSelectorScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      "adjusted",
      baselineAdjustedByIndex
    );
    const paymentScoreByIndex = averagePayToWinSelectorPaymentScores(
      selectorStates,
      groupSelectors,
      activeStarts,
      baselinePaymentByIndex
    );
    const pricingStateBuilder = typeof options.pricingStateBuilder === "function"
      ? options.pricingStateBuilder
      : (starts, scoreMap, benchmark, builderOptions, curveMap) => (
        buildPayToWinRegisterPricingState(
          starts,
          scoreMap,
          benchmark,
          builderOptions,
          curveMap
        )
      );
    return {
      selectors: groupSelectors,
      fullScoreByIndex,
      adjustedScoreByIndex,
      paymentScoreByIndex,
      pricingState: pricingStateBuilder(
        activeStarts,
        fullScoreByIndex,
        pricingBenchmark,
        options,
        paymentScoreByIndex
      )
    };
  };

  // With at most two displayed price columns, the design problem remains a
  // one-change-point approximation. The breakpoint is chosen from continuous
  // register-equivalent route profiles; each representative group then prices
  // starts with its own averaged post-payment v45 economy curves.
  const singleGroup = buildRepresentative(selectors);
  const noSplitError = getPayToWinSelectorFitError(
    selectorPricingStates,
    selectors,
    singleGroup.pricingState
  );
  const candidates = [];

  for (let cutoffAfter = 1; cutoffAfter < selectors.length; cutoffAfter += 1) {
    const earlySelectors = selectors.slice(0, cutoffAfter);
    const lateSelectors = selectors.slice(cutoffAfter);
    const early = buildRepresentative(earlySelectors);
    const late = buildRepresentative(lateSelectors);
    const earlyError = getPayToWinSelectorFitError(
      selectorPricingStates,
      earlySelectors,
      early.pricingState
    );
    const lateError = getPayToWinSelectorFitError(
      selectorPricingStates,
      lateSelectors,
      late.pricingState
    );
    const splitError = Number((
      (
        earlyError * earlySelectors.length +
        lateError * lateSelectors.length
      ) / selectors.length
    ).toFixed(4));
    const gain = Number(Math.max(0, noSplitError - splitError).toFixed(4));
    const relativeGain = noSplitError > 1e-9
      ? Number((gain / noSplitError).toFixed(4))
      : 0;
    const separation = getPayToWinProfileDistance(
      early.pricingState,
      late.pricingState
    );

    candidates.push({
      cutoffAfter,
      earlySelectors,
      lateSelectors,
      early,
      late,
      splitError,
      gain,
      relativeGain,
      separation
    });
  }

  const minGain = Number(
    options.payToWinSelectorSplitMinGainRegisters ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_GAIN_R
  );
  const minRelativeGain = Number(
    options.payToWinSelectorSplitMinRelativeGain ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_RELATIVE_GAIN
  );
  const minSeparation = Number(
    options.payToWinSelectorSplitMinSeparationRegisters ??
    PAY_TO_WIN_SELECTOR_SPLIT_MIN_SEPARATION_R
  );
  const eligible = candidates.filter((candidate) => (
    candidate.gain >= minGain &&
    candidate.relativeGain >= minRelativeGain &&
    candidate.separation >= minSeparation
  ));
  const selected = eligible.sort((left, right) => (
    left.splitError - right.splitError ||
    right.separation - left.separation ||
    left.cutoffAfter - right.cutoffAfter
  ))[0] ?? null;

  if (!selected) {
    return {
      active: false,
      early: singleGroup,
      late: null,
      selectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        cutoffAfter: null,
        noSplitErrorR: noSplitError,
        splitErrorR: noSplitError,
        gainR: 0,
        relativeGain: 0,
        separationR: 0,
        minGainR: minGain,
        minRelativeGain,
        minSeparationR: minSeparation,
        candidates: candidates.map((candidate) => ({
          cutoffAfter: candidate.cutoffAfter,
          splitErrorR: candidate.splitError,
          gainR: candidate.gain,
          relativeGain: candidate.relativeGain,
          separationR: candidate.separation
        }))
      }
    };
  }

  return {
    active: true,
    early: selected.early,
    late: selected.late,
    selectorSplit: {
      method: "robust-one-breakpoint-register-profile-v1",
      selected: true,
      cutoffAfter: selected.cutoffAfter,
      lateSelectorStart: selected.cutoffAfter + 1,
      lateSelectorEnd: selectors.length,
      noSplitErrorR: noSplitError,
      splitErrorR: selected.splitError,
      gainR: selected.gain,
      relativeGain: selected.relativeGain,
      separationR: selected.separation,
      minGainR: minGain,
      minRelativeGain,
      minSeparationR: minSeparation,
      candidates: candidates.map((candidate) => ({
        cutoffAfter: candidate.cutoffAfter,
        splitErrorR: candidate.splitError,
        gainR: candidate.gain,
        relativeGain: candidate.relativeGain,
        separationR: candidate.separation
      }))
    }
  };
}

export function unrankPayToWinCombination(items, chooseCount, rank) {
  if (chooseCount <= 0) {
    return [];
  }

  const result = [];
  let offset = 0;
  let remaining = chooseCount;
  let workingRank = Math.max(0, rank);

  while (remaining > 0 && offset < items.length) {
    for (
      let position = offset;
      position <= items.length - remaining;
      position += 1
    ) {
      const suffixCount = getCombinationCount(
        items.length - position - 1,
        remaining - 1,
        1000000000
      );

      if (workingRank < suffixCount) {
        result.push(items[position]);
        offset = position + 1;
        remaining -= 1;
        break;
      }

      workingRank -= suffixCount;
    }
  }

  return result;
}

export function samplePayToWinKnownSelections(
  otherIndices,
  knownCount,
  sampleLimit = 6
) {
  if (knownCount <= 0) {
    return [[]];
  }
  if (knownCount >= otherIndices.length) {
    return [[...otherIndices]];
  }

  const total = getCombinationCount(
    otherIndices.length,
    knownCount,
    1000000000
  );
  const sampleCount = Math.max(1, Math.min(sampleLimit, total));

  if (total <= sampleCount) {
    const combinations = [];
    const chosen = [];
    const visit = (offset) => {
      if (chosen.length === knownCount) {
        combinations.push([...chosen]);
        return;
      }
      const needed = knownCount - chosen.length;
      for (
        let position = offset;
        position <= otherIndices.length - needed;
        position += 1
      ) {
        chosen.push(otherIndices[position]);
        visit(position + 1);
        chosen.pop();
      }
    };
    visit(0);
    return combinations;
  }

  const sampled = [];
  const seen = new Set();
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rank = Math.min(
      total - 1,
      Math.floor(((sample + 0.5) * total) / sampleCount)
    );
    const combination = unrankPayToWinCombination(
      otherIndices,
      knownCount,
      rank
    );
    const key = combination.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      sampled.push(combination);
    }
  }

  return sampled;
}


export function getPayToWinLateCostEntries(
  firstLeg,
  tileMap,
  excludedIndices = new Set(),
  playerCount = 4,
  options = {},
  baseCostState = null
) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    item.fullCourseRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
  const config = getPayToWinSelectorSurplusConfig(
    activeStarts.length,
    playerCount
  );

  if (!activeStarts.length) {
    return {
      active: false,
      evaluated: false,
      entries: [],
      earlyEntries: [],
      costUnit: 1,
      earlyCostUnit: 1,
      minScore: 0,
      maxScore: 0,
      pricingModel: null,
      earlyPricingModel: null,
      scenarioSamples: 0,
      scenarioSamplesBySelector: {},
      lateSelectorStart: null,
      lateSelectorEnd: null,
      latePlayerCount: 0,
      selectorSplit: null,
      ...config
    };
  }

  const pricingBenchmark = baseCostState?.legacyPricingState?.pricingModel
    ? {
      registerScore: baseCostState.legacyPricingState.pricingModel.registerScore,
      horizonTurns: baseCostState.legacyPricingState.pricingModel.horizonTurns
    }
    : getPayToWinPricingBenchmark(
      tileMap,
      firstLeg,
      activeStarts,
      options
    );
  let fallbackPaymentCurves;
  let fallbackEffectiveRECurves;
  if (baseCostState) {
    fallbackPaymentCurves = baseCostState.legacyScoreCurves ?? new Map(
      (baseCostState.legacyPricingState?.entries ?? []).map((entry) => [entry.index, entry.paymentScores])
    );
    fallbackEffectiveRECurves = baseCostState.effectiveRECurves ?? new Map(
      activeStarts.map((item) => [
        item.index,
        [Number(item.normalFairnessEffectiveRE)]
      ])
    );
  } else {
    const fallbackBundle = buildPayToWinPaymentCurveBundle(
      firstLeg,
      tileMap,
      activeStarts,
      {
        ...options,
        playerCount: config.playerCount
      }
    );
    fallbackPaymentCurves = fallbackBundle.scoreCurves;
    fallbackEffectiveRECurves = fallbackBundle.effectiveRECurves;
  }
  const fallbackFullScores = new Map(activeStarts.map((item) => [
    item.index,
    Number(fallbackPaymentCurves.get(item.index)?.[0])
  ]));
  const baselinePricingState = baseCostState?.legacyPricingState ?? buildPayToWinRegisterPricingState(
    activeStarts,
    fallbackFullScores,
    pricingBenchmark,
    options,
    fallbackPaymentCurves
  );
  const baselineEffectiveREByIndex = new Map(activeStarts.map((item) => [
    item.index,
    Number(fallbackEffectiveRECurves.get(item.index)?.[0])
  ]));
  const baselineEffectiveREPricingState =
    baseCostState?.effectiveREPricingState ?? buildPayToWinEffectiveREPricingState(
      activeStarts,
      baselineEffectiveREByIndex,
      options,
      fallbackEffectiveRECurves
    );
  const baselineEntryByIndex = new Map(
    baselinePricingState.entries.map((entry) => [entry.index, entry])
  );
  const baselineFullByIndex = new Map(activeStarts.map((item) => [
    item.index,
    baselineEntryByIndex.get(item.index)?.fullScore ?? getPayToWinFullCourseScore(item)
  ]));
  const baselinePaymentByIndex = new Map(activeStarts.map((item) => [
    item.index,
    baselineEntryByIndex.get(item.index)?.paymentScores ?? [baselineFullByIndex.get(item.index)]
  ]));
  const baselineEffectiveEntryByIndex = new Map(
    baselineEffectiveREPricingState.entries.map((entry) => [entry.index, entry])
  );
  const baselinePostAdjustmentQualityByIndex = new Map(activeStarts.map((item) => [
    item.index,
    Number.isFinite(Number(baselineEffectiveEntryByIndex.get(item.index)?.postAdjustmentEffectiveRE))
      ? Number(baselineEffectiveEntryByIndex.get(item.index).postAdjustmentEffectiveRE)
      : baselineEffectiveREByIndex.get(item.index)
  ]));

  if (config.surplusStarts <= 0 || config.playerCount <= 1) {
    return {
      ...buildInactivePayToWinLateCostState(
        baselineEffectiveREPricingState,
        getPayToWinDenialCost(options)
      ),
      evaluated: false,
      earlyEntries: baselineEffectiveREPricingState.entries,
      earlyCostUnit: baselineEffectiveREPricingState.costUnit,
      earlyPricingModel: baselineEffectiveREPricingState.pricingModel,
      legacyPricingModel: baselinePricingState.pricingModel,
      effectiveRECurves: fallbackEffectiveRECurves,
      effectiveREPricingState: baselineEffectiveREPricingState,
      earlyEffectiveREPricingState: baselineEffectiveREPricingState,
      reSelectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        reason: "inactive-no-surplus"
      },
      legacySelectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        reason: "inactive-no-surplus"
      },
      scenarioSamplesBySelector: {},
      selectorSplit: {
        method: "robust-one-breakpoint-register-profile-v1",
        selected: false,
        reason: "inactive-no-surplus"
      },
      ...config
    };
  }

  let scenarioSamples = 0;
  const scenarioSamplesBySelector = {};
  const activeIndices = activeStarts.map((item) => item.index);
  const selectorStates = new Map();
  const selectorOne = new Map(activeStarts.map((item) => [
    item.index,
    {
      adjusted: item.adjustedScore,
      full: baselineFullByIndex.get(item.index),
      paymentScores: baselinePaymentByIndex.get(item.index),
      effectiveRE: baselineEffectiveREByIndex.get(item.index),
      paymentEffectiveREs: fallbackEffectiveRECurves.get(item.index)
    }
  ]));
  selectorStates.set(1, selectorOne);

  for (let selector = 2; selector <= config.playerCount; selector += 1) {
    selectorStates.set(selector, new Map());
    scenarioSamplesBySelector[selector] = 0;
  }

  const pricingOptions = getPayToWinRouteEconomyPricingOptions(firstLeg, {
    ...options,
    playerCount: config.playerCount,
    // Every start's routes are priced under many occupancy samples below; the
    // traffic-independent part of their damage economy is built once per route.
    damageEconomyStepRecordCache: new WeakMap()
  });

  for (const item of activeStarts) {
    const otherIndices = activeIndices.filter(
      (index) => index !== item.index
    );
    const baselineFirstTotal = (
      (item.bestScore ?? item.selectedRoute?.score ?? 0) +
      (item.trafficPenalty ?? 0)
    );
    const baselineFullTotal = baselineFullByIndex.get(item.index);
    const fallbackCurve = baselinePaymentByIndex.get(item.index) ?? [baselineFullTotal];

    for (let selector = 2; selector <= config.playerCount; selector += 1) {
      const scenarioScores = [];
      const scenarioPaymentCurves = [];
      const scenarioEffectiveRECurves = [];
      const knownCount = Math.min(
        otherIndices.length,
        selector - 1
      );
      const knownSamples = samplePayToWinKnownSelections(
        otherIndices,
        knownCount,
        options.payToWinLateScenarioSamples ?? 6
      );

      for (const knownIndices of knownSamples) {
        const knownSet = new Set(knownIndices);
        const unresolvedIndices = otherIndices.filter(
          (index) => !knownSet.has(index)
        );
        const occupancyByIndex = buildPayToWinQualityOccupancy(
          activeStarts,
          item.index,
          config.playerCount,
          baselinePostAdjustmentQualityByIndex,
          knownIndices,
          unresolvedIndices
        );

        const scenario = evaluateFullCourseFocusPaymentCurveUnderOccupancy(
          tileMap,
          firstLeg,
          firstLeg.flags,
          item.index,
          occupancyByIndex,
          {
            ...pricingOptions,
            playerCount: config.playerCount,
            fullCourseTrafficPasses: 1
          }
        );
        const paymentEntries = scenario?.entries ?? [];
        const zero = paymentEntries.find((entry) => entry.payment === 0);
        if (!zero) continue;

        const firstLegDelta = zero.firstLegTotal - baselineFirstTotal;
        const fullCourseDelta = zero.fullTotal - baselineFullTotal;
        const adjustedScore = (
          item.adjustedScore +
          firstLegDelta +
          clamp(fullCourseDelta * 0.32, -10, 10)
        );
        if (Number.isFinite(adjustedScore)) {
          scenarioScores.push(adjustedScore);
        }
        const orderedPaymentEntries = paymentEntries
          .slice()
          .sort((left, right) => left.payment - right.payment);
        const curve = orderedPaymentEntries.map((entry) => entry.fullTotal);
        const effectiveRECurve = orderedPaymentEntries.map(
          (entry) => entry.fullEffectiveRE
        );
        if (curve.length) scenarioPaymentCurves.push(curve);
        if (effectiveRECurve.some(Number.isFinite)) {
          scenarioEffectiveRECurves.push(effectiveRECurve);
        }
        scenarioSamples += 1;
        scenarioSamplesBySelector[selector] += 1;
      }

      const paymentCount = fallbackCurve.length;
      const averagedCurve = Array.from({ length: paymentCount }, (_, payment) => {
        const values = scenarioPaymentCurves
          .map((curve) => curve[payment])
          .filter(Number.isFinite);
        const fallback = Number(fallbackCurve[payment]);
        return values.length
          ? average(values)
          : (Number.isFinite(fallback) ? fallback : null);
      });
      const fallbackRECurve = fallbackEffectiveRECurves.get(item.index) ?? [];
      const averagedEffectiveRECurve = Array.from(
        { length: Math.max(paymentCount, fallbackRECurve.length) },
        (_, payment) => {
          const values = scenarioEffectiveRECurves
            .map((curve) => curve[payment])
            .filter(Number.isFinite);
          const fallback = Number(fallbackRECurve[payment]);
          return values.length
            ? average(values)
            : (Number.isFinite(fallback) ? fallback : null);
        }
      );
      selectorStates.get(selector).set(
        item.index,
        {
          adjusted: scenarioScores.length
            ? average(scenarioScores)
            : item.adjustedScore,
          full: Number.isFinite(averagedCurve[0])
            ? averagedCurve[0]
            : baselineFullTotal,
          paymentScores: averagedCurve,
          effectiveRE: Number.isFinite(averagedEffectiveRECurve[0])
            ? averagedEffectiveRECurve[0]
            : baselineEffectiveREByIndex.get(item.index),
          paymentEffectiveREs: averagedEffectiveRECurve
        }
      );
    }
  }

  const selectorPricingStates = new Map();
  selectorPricingStates.set(1, baselinePricingState);
  for (let selector = 2; selector <= config.playerCount; selector += 1) {
    const fullScoreByIndex = new Map(activeStarts.map((item) => [
      item.index,
      selectorStates.get(selector)?.get(item.index)?.full
    ]));
    const paymentScoreByIndex = new Map(activeStarts.map((item) => [
      item.index,
      selectorStates.get(selector)?.get(item.index)?.paymentScores ?? baselinePaymentByIndex.get(item.index)
    ]));
    selectorPricingStates.set(
      selector,
      buildPayToWinRegisterPricingState(
        activeStarts,
        fullScoreByIndex,
        pricingBenchmark,
        options,
        paymentScoreByIndex
      )
    );
  }

  const selectorREStates = new Map();
  const selectorREPricingStates = new Map();
  for (let selector = 1; selector <= config.playerCount; selector += 1) {
    const source = selectorStates.get(selector) ?? new Map();
    const reState = new Map(activeStarts.map((item) => {
      const itemState = source.get(item.index) ?? {};
      const effectiveRE = Number(itemState.effectiveRE);
      const paymentEffectiveREs = itemState.paymentEffectiveREs ??
        fallbackEffectiveRECurves.get(item.index) ??
        [baselineEffectiveREByIndex.get(item.index)];
      return [
        item.index,
        {
          adjusted: Number.isFinite(effectiveRE)
            ? effectiveRE
            : baselineEffectiveREByIndex.get(item.index),
          full: Number.isFinite(effectiveRE)
            ? effectiveRE
            : baselineEffectiveREByIndex.get(item.index),
          paymentScores: paymentEffectiveREs
        }
      ];
    }));
    selectorREStates.set(selector, reState);
    const fullREByIndex = new Map(activeStarts.map((item) => [
      item.index,
      reState.get(item.index)?.full
    ]));
    const paymentREByIndex = new Map(activeStarts.map((item) => [
      item.index,
      reState.get(item.index)?.paymentScores
    ]));
    selectorREPricingStates.set(
      selector,
      buildPayToWinEffectiveREPricingState(
        activeStarts,
        fullREByIndex,
        options,
        paymentREByIndex
      )
    );
  }

  const adaptive = getPayToWinAdaptiveSelectorSplit(
    activeStarts,
    selectorStates,
    selectorPricingStates,
    pricingBenchmark,
    config.playerCount,
    options
  );
  const adaptiveRE = getPayToWinAdaptiveSelectorSplit(
    activeStarts,
    selectorREStates,
    selectorREPricingStates,
    { registerScore: 1, horizonTurns: null },
    config.playerCount,
    {
      ...options,
      pricingStateBuilder: (starts, scoreMap, _benchmark, builderOptions, curveMap) => (
        buildPayToWinEffectiveREPricingState(
          starts,
          scoreMap,
          builderOptions,
          curveMap
        )
      )
    }
  );
  // v49ck: preserve the established one-breakpoint selector model, but let
  // completed effective RE own the production split and the displayed Energy
  // adjustments. The legacy score-space split remains diagnostic only.
  const earlyState = adaptiveRE.early.pricingState;
  const lateState = adaptiveRE.active
    ? adaptiveRE.late.pricingState
    : earlyState;
  const allSelectors = Array.from(
    { length: config.playerCount },
    (_, index) => index + 1
  );
  const productionEarlySelectors = adaptiveRE.active
    ? allSelectors.slice(0, adaptiveRE.selectorSplit.cutoffAfter)
    : allSelectors;
  const productionLateSelectors = adaptiveRE.active
    ? allSelectors.slice(adaptiveRE.selectorSplit.cutoffAfter)
    : productionEarlySelectors;
  const fallbackAdjustedByIndex = new Map(activeStarts.map((item) => [
    item.index,
    item.adjustedScore
  ]));
  const earlyAdjustedByIndex = averagePayToWinSelectorScores(
    selectorStates,
    productionEarlySelectors,
    activeStarts,
    "adjusted",
    fallbackAdjustedByIndex
  );
  const lateAdjustedByIndex = adaptiveRE.active
    ? averagePayToWinSelectorScores(
      selectorStates,
      productionLateSelectors,
      activeStarts,
      "adjusted",
      fallbackAdjustedByIndex
    )
    : earlyAdjustedByIndex;
  const denialCost = getPayToWinDenialCost(options);
  const lateEntries = lateState.entries.map((entry) => ({
    ...entry,
    lateAdjustedScore: lateAdjustedByIndex.get(entry.index) ?? entry.adjustedScore,
    lateFullScore: entry.fullScore,
    lateAdvantage: entry.advantage,
    lateRegisterEquivalent: entry.registerEquivalent,
    calculatedLateEnergyCost: entry.energyCost,
    lateEnergyCost: entry.energyCost,
    // Compensation-first pricing never makes a start unavailable merely because
    // the legal Energy range cannot hit an extreme baseline exactly.
    lateUnavailable: false
  }));
  const lateSelectorStart = adaptiveRE.active
    ? adaptiveRE.selectorSplit.lateSelectorStart
    : null;
  const lateSelectorEnd = adaptiveRE.active
    ? adaptiveRE.selectorSplit.lateSelectorEnd
    : null;

  return {
    active: adaptiveRE.active,
    evaluated: true,
    entries: lateEntries,
    earlyEntries: earlyState.entries,
    costUnit: lateState.costUnit,
    earlyCostUnit: earlyState.costUnit,
    minScore: lateState.minScore,
    maxScore: lateState.maxScore,
    pricingModel: lateState.pricingModel,
    earlyPricingModel: earlyState.pricingModel,
    legacyPricingModel: adaptive.active
      ? adaptive.late?.pricingState?.pricingModel ?? adaptive.early.pricingState.pricingModel
      : adaptive.early.pricingState.pricingModel,
    effectiveREPricingState: lateState,
    earlyEffectiveREPricingState: earlyState,
    reSelectorSplit: adaptiveRE.selectorSplit,
    legacySelectorSplit: adaptive.selectorSplit,
    effectiveRECurves: fallbackEffectiveRECurves,
    scenarioSamples,
    scenarioSamplesBySelector,
    lateSelectorStart,
    lateSelectorEnd,
    latePlayerCount: adaptiveRE.active
      ? config.playerCount - adaptiveRE.selectorSplit.cutoffAfter
      : 0,
    selectorSplit: adaptiveRE.selectorSplit,
    ...config
  };

}

export function formatPayToWinEnergyCost(startAnalysis, options = {}) {
  if (startAnalysis?.energyCost === null || startAnalysis?.energyCost === undefined) {
    return null;
  }

  const subsidizedStarts = Boolean(options.subsidizedStarts);
  const formatValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return subsidizedStarts ? `+${numeric}` : String(numeric);
  };
  const normalCost = Number(startAnalysis.energyCost);
  const lateCost = Number(startAnalysis.lateEnergyCost);
  const earlyUnavailable = Boolean(startAnalysis.earlyUnavailable);
  const lateUnavailable = Boolean(startAnalysis.lateUnavailable);
  const normalLabel = formatValue(normalCost);
  const lateLabel = formatValue(lateCost);

  if (earlyUnavailable && lateUnavailable) {
    return "—/—";
  }

  if (earlyUnavailable) {
    return lateLabel !== null ? `—/${lateLabel}` : "—";
  }

  if (lateUnavailable) {
    return `${normalLabel}/—`;
  }

  if (lateLabel !== null && lateCost !== normalCost) {
    return `${normalLabel}/${lateLabel}`;
  }

  return normalLabel;
}

export function choosePayToWinPruneEntry(entries, options = {}) {
  if (!entries.length) {
    return null;
  }

  // Pruning direction is intentionally tied to the requested course character.
  // Full-course score is used here (rather than opening adjustedScore) because
  // removing an endpoint is meant to reshape the race players actually play:
  // high score = weaker/longer/harder start, low score = stronger/shorter/easier.
  const bias = getPayToWinRemovalBias(options);
  if (bias > 0) {
    return [...entries].sort((left, right) =>
      right.fullScore - left.fullScore || left.index - right.index
    )[0];
  }
  if (bias < 0) {
    return [...entries].sort((left, right) =>
      left.fullScore - right.fullScore || left.index - right.index
    )[0];
  }

  const meanScore = average(entries.map((entry) => entry.fullScore));
  return [...entries].sort((left, right) => (
    Math.abs(right.fullScore - meanScore) - Math.abs(left.fullScore - meanScore) ||
    left.fullScore - right.fullScore ||
    left.index - right.index
  ))[0];
}

export function buildInactivePayToWinLateCostState(costState, denialCost) {
  return {
    active: false,
    evaluated: false,
    entries: (costState.entries ?? []).map((entry) => ({
      ...entry,
      lateAdjustedScore: entry.adjustedScore,
      lateFullScore: entry.fullScore ?? getPayToWinFullCourseScore(entry.startAnalysis),
      lateAdvantage: entry.advantage,
      lateRegisterEquivalent: entry.registerEquivalent,
      lateEnergyCost: entry.energyCost,
      lateUnavailable: entry.energyCost >= denialCost
    })),
    earlyEntries: costState.entries ?? [],
    costUnit: costState.costUnit,
    earlyCostUnit: costState.costUnit,
    minScore: costState.minScore,
    maxScore: costState.maxScore,
    pricingModel: costState.pricingModel ?? null,
    earlyPricingModel: costState.pricingModel ?? null,
    effectiveREPricingState: costState.effectiveREPricingState ?? null,
    earlyEffectiveREPricingState: costState.effectiveREPricingState ?? null,
    effectiveRECurves: costState.effectiveRECurves ?? null,
    reSelectorSplit: {
      method: "robust-one-breakpoint-register-profile-v1",
      selected: false,
      reason: "inactive-no-surplus"
    },
    scenarioSamples: 0,
    scenarioSamplesBySelector: {},
    lateSelectorStart: null,
    lateSelectorEnd: null,
    latePlayerCount: 0,
    surplusStarts: 0,
    selectorSplit: null
  };
}

export function buildEconomyPricedNormalREEntries(entries = [], costKey = "energyCost") {
  return (entries || []).map((entry) => {
    const adjustment = Math.max(0, Math.floor(Number(entry?.[costKey]) || 0));
    const effectiveRE = Number(entry?.paymentScores?.[adjustment]);
    return {
      ...entry.startAnalysis,
      index: entry.index,
      normalFairnessEffectiveRE: effectiveRE,
      normalFairnessRegisterCount: Number(
        entry.startAnalysis?.fullCourseRoute?.actions ??
        entry.startAnalysis?.bestActions
      ),
      bestActions: Number(
        entry.startAnalysis?.fullCourseRoute?.actions ??
        entry.startAnalysis?.bestActions
      ),
      economyAdjustment: adjustment
    };
  }).filter((entry) => Number.isFinite(entry.normalFairnessEffectiveRE));
}

export function summarizeEconomyPricedREPhase(entries = [], costKey = "energyCost") {
  const balanceEntries = buildEconomyPricedNormalREEntries(entries, costKey);
  const balance = summarizeNormalRetainedREBalance(balanceEntries);
  const penalty = getEconomyEnergyActionableResidualBalanceSelectionPenalty(balanceEntries);
  const outliers = rankNormalEffectiveREOutliers(
    balanceEntries,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  return {
    balanceEntries,
    offeredCount: balanceEntries.length,
    stddev: balance.stdDev,
    limit: NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
    minRE: balance.min,
    maxRE: balance.max,
    rangeRE: balance.range,
    outlierCount: outliers.length,
    outlierIndices: outliers.map((item) => item.entry.index),
    residualPenalty: penalty.total,
    residualPenaltyComponents: penalty,
    acceptable: penalty.total <= 1e-9
  };
}

export function chooseEconomyCompensatedStartRemoval(
  earlyEntries = [],
  lateEntries = [],
  playerCount = 1,
  latePricingActive = false
) {
  const minimumStarts = Math.max(1, playerCount || 1);
  if (earlyEntries.length <= minimumStarts) return null;

  const earlyCurrent = summarizeEconomyPricedREPhase(
    earlyEntries,
    "energyCost"
  );
  const lateCurrent = latePricingActive
    ? summarizeEconomyPricedREPhase(lateEntries, "lateEnergyCost")
    : earlyCurrent;
  const currentWorstPenalty = Math.max(
    earlyCurrent.residualPenalty,
    lateCurrent.residualPenalty
  );
  if (!(currentWorstPenalty > 1e-9)) return null;

  const lateByIndex = new Map((lateEntries || []).map((entry) => [entry.index, entry]));
  const candidates = earlyEntries.map((entry) => {
    const earlyRetained = earlyEntries.filter((item) => item.index !== entry.index);
    if (earlyRetained.length < minimumStarts) return null;
    const lateRetained = latePricingActive
      ? lateEntries.filter((item) => item.index !== entry.index)
      : earlyRetained;
    const earlyAfter = summarizeEconomyPricedREPhase(
      earlyRetained,
      "energyCost"
    );
    const lateAfter = latePricingActive
      ? summarizeEconomyPricedREPhase(lateRetained, "lateEnergyCost")
      : earlyAfter;
    const afterWorstPenalty = Math.max(
      earlyAfter.residualPenalty,
      lateAfter.residualPenalty
    );
    const improvement = currentWorstPenalty - afterWorstPenalty;
    const earlyEntry = earlyCurrent.balanceEntries.find((item) => item.index === entry.index);
    const lateEntry = lateCurrent.balanceEntries.find((item) => item.index === entry.index);
    const earlyDiagnostics = earlyEntry
      ? getNormalStartBalanceDiagnostics(
        earlyEntry,
        earlyCurrent.balanceEntries,
        "normalFairnessEffectiveRE"
      )
      : null;
    const lateDiagnostics = lateEntry
      ? getNormalStartBalanceDiagnostics(
        lateEntry,
        lateCurrent.balanceEntries,
        "normalFairnessEffectiveRE"
      )
      : null;
    const worstScoreDelta = Math.max(
      Math.abs(Number(earlyDiagnostics?.scoreDelta) || 0),
      Math.abs(Number(lateDiagnostics?.scoreDelta) || 0)
    );
    const isOutlier = (
      earlyCurrent.outlierIndices.includes(entry.index) ||
      lateCurrent.outlierIndices.includes(entry.index)
    );
    return {
      entry,
      lateEntry: lateByIndex.get(entry.index) ?? null,
      improvement,
      afterWorstPenalty,
      earlyAfter,
      lateAfter,
      isOutlier,
      worstScoreDelta
    };
  }).filter(Boolean);

  if (!candidates.length) return null;
  candidates.sort((left, right) => (
    Number(right.isOutlier) - Number(left.isOutlier) ||
    right.improvement - left.improvement ||
    left.afterWorstPenalty - right.afterWorstPenalty ||
    right.worstScoreDelta - left.worstScoreDelta ||
    left.entry.index - right.entry.index
  ));
  const selected = candidates[0];
  if (!(selected.improvement > 0.025)) return null;

  return {
    index: selected.entry.index,
    score: Number(selected.entry.postPaymentFullScore),
    fullScore: Number(selected.entry.fullScore),
    energyCost: selected.entry.energyCost,
    lateEnergyCost: selected.lateEntry?.lateEnergyCost ?? selected.entry.energyCost,
    registerEquivalent: selected.entry.registerEquivalent,
    lateRegisterEquivalent: selected.lateEntry?.lateRegisterEquivalent ?? selected.entry.registerEquivalent,
    effectiveREPruned: selected.isOutlier,
    balanceDispersionPruned: !selected.isOutlier,
    residualPenaltyBefore: Number(currentWorstPenalty.toFixed(3)),
    residualPenaltyAfterEstimate: Number(selected.afterWorstPenalty.toFixed(3)),
    removalImprovement: Number(selected.improvement.toFixed(3)),
    reason:
      `start-specific Energy balancing left residual range overflow; ` +
      `removal improves worst early/late residual penalty ` +
      `${Number(currentWorstPenalty.toFixed(3))}->${Number(selected.afterWorstPenalty.toFixed(3))}`
  };
}

export function evaluatePayToWinSelectorAwarePricingState(
  firstLeg,
  tileMap,
  excludedIndices,
  playerCount,
  pricingOptions,
  baseCostState = null
) {
  const costState = baseCostState ?? getPayToWinCostEntries(
    firstLeg,
    tileMap,
    excludedIndices,
    pricingOptions
  );
  const selectorPricingEligible = costState.entries.length > playerCount;
  const lateCostState = selectorPricingEligible
    ? getPayToWinLateCostEntries(
      firstLeg,
      tileMap,
      excludedIndices,
      playerCount,
      pricingOptions,
      costState
    )
    : buildInactivePayToWinLateCostState(
      costState,
      getPayToWinDenialCost(pricingOptions)
    );
  const earlyEntries = lateCostState.earlyEntries ?? costState.entries;
  const lateEntries = lateCostState.entries ?? [];
  const latePricingActive = Boolean(lateCostState.active);

  // v49dz: all physically/routably valid starts remain offerable while each
  // start receives its best legal discrete Energy adjustment toward the directional
  // field anchor. Only the later range-first residual prune step may remove a start,
  // after which traffic/economy are rebuilt and every remaining start is rebalanced.
  // Literal register-duration disparity remains diagnostic and cannot trigger Energy or pruning.
  const earlyResidual = summarizeEconomyPricedREPhase(
    earlyEntries,
    "energyCost"
  );
  const lateResidual = latePricingActive
    ? summarizeEconomyPricedREPhase(lateEntries, "lateEnergyCost")
    : earlyResidual;
  const residualBalance = {
    method: "selector-aware-start-specific-energy-balance-then-range-prune-v49dz",
    early: earlyResidual,
    late: lateResidual,
    worstStdDev: Math.max(earlyResidual.stddev, lateResidual.stddev),
    worstOutlierCount: Math.max(
      earlyResidual.outlierCount,
      lateResidual.outlierCount
    ),
    worstResidualPenalty: Math.max(
      earlyResidual.residualPenalty,
      lateResidual.residualPenalty
    ),
    worstRange: Math.max(
      earlyResidual.rangeRE ?? 0,
      lateResidual.rangeRE ?? 0
    ),
    worstRangeLimit: Math.max(
      earlyResidual.residualPenaltyComponents?.rangeLimit ?? 0,
      lateResidual.residualPenaltyComponents?.rangeLimit ?? 0
    ),
    worstRangeExcess: Math.max(
      earlyResidual.residualPenaltyComponents?.rangeExcess ?? 0,
      lateResidual.residualPenaltyComponents?.rangeExcess ?? 0
    ),
    worstSoftOverflowAllowance: Math.max(
      earlyResidual.residualPenaltyComponents?.softOverflowAllowance ?? 0,
      lateResidual.residualPenaltyComponents?.softOverflowAllowance ?? 0
    ),
    worstSoftOverflowOverage: Math.max(
      0,
      (earlyResidual.residualPenaltyComponents?.rangeExcess ?? 0) -
        (earlyResidual.residualPenaltyComponents?.softOverflowAllowance ?? 0),
      (lateResidual.residualPenaltyComponents?.rangeExcess ?? 0) -
        (lateResidual.residualPenaltyComponents?.softOverflowAllowance ?? 0)
    ),
    softOverflowAcceptable: Boolean(
      earlyResidual.residualPenaltyComponents?.overflowWithinSoftAllowance !== false &&
      lateResidual.residualPenaltyComponents?.overflowWithinSoftAllowance !== false
    ),
    worstIgnoredDurationPenalty: Math.max(
      earlyResidual.residualPenaltyComponents?.ignoredDuration ?? 0,
      lateResidual.residualPenaltyComponents?.ignoredDuration ?? 0
    ),
    durationActionableForEnergy: false,
    acceptable: earlyResidual.acceptable && lateResidual.acceptable
  };
  const recommendedRemoval = chooseEconomyCompensatedStartRemoval(
    earlyEntries,
    lateEntries,
    playerCount,
    latePricingActive
  );
  const pricedStartCount = earlyEntries.length;
  const availabilityValid = pricedStartCount >= Math.max(1, playerCount || 1);
  const balanceValid = recommendedRemoval === null;
  const rawEarlyStdDev = Number(
    costState?.effectiveREPricingState?.pricingModel?.rawStdDev ??
    costState?.pricingModel?.rawStdDev ??
    earlyResidual.stddev
  );
  const rawLateStdDev = Number(
    lateCostState?.pricingModel?.rawStdDev ?? rawEarlyStdDev
  );

  return {
    costState,
    lateCostState,
    selectorPricingEligible,
    latePricingActive,
    pricedStartCount,
    earlyOfferedCount: earlyEntries.length,
    lateOfferedCount: latePricingActive ? lateEntries.length : earlyEntries.length,
    earlyUnavailableCount: 0,
    lateUnavailableCount: 0,
    maxUnavailable: Math.max(0, earlyEntries.length - playerCount),
    availabilityValid,
    residualBalance,
    reOwnershipAudit: {
      model: "economy-start-re-ownership-v49dz",
      observationalOnly: false,
      behaviorChanged: true,
      ownership: "completed-effective-re",
      occupancyQualityOwner: "completed-effective-re",
      energyStepPolicy: "per-start-discrete-closest-to-directional-anchor-before-pruning-v49dz",
      compensationFirst: true,
      selectorAware: true,
      mode: isSubsidizedStartsPricing(pricingOptions) ? "subsidy" : "payment",
      early: {
        rawStdDev: Number.isFinite(rawEarlyStdDev)
          ? Number(rawEarlyStdDev.toFixed(3))
          : null,
        postStdDev: earlyResidual.stddev,
        residualPenalty: earlyResidual.residualPenalty,
        ignoredDurationPenalty: earlyResidual.residualPenaltyComponents?.ignoredDuration ?? 0,
        normalStylePenaltyIncludingDuration: earlyResidual.residualPenaltyComponents?.normalTotal ?? earlyResidual.residualPenalty,
        nonzeroAdjustments: earlyEntries.filter((entry) => entry.energyCost > 0).length,
        capLimitedAdjustments: earlyEntries.filter((entry) => entry.capLimited).length,
        targetEffectiveRE: costState?.effectiveREPricingState?.pricingModel?.targetEffectiveRE ?? null,
        targetPolicy: costState?.effectiveREPricingState?.pricingModel?.targetPolicy ?? null,
        maxAdjustment: earlyEntries.length
          ? Math.max(...earlyEntries.map((entry) => entry.energyCost))
          : 0
      },
      late: {
        rawStdDev: Number.isFinite(rawLateStdDev)
          ? Number(rawLateStdDev.toFixed(3))
          : null,
        postStdDev: lateResidual.stddev,
        residualPenalty: lateResidual.residualPenalty,
        ignoredDurationPenalty: lateResidual.residualPenaltyComponents?.ignoredDuration ?? 0,
        normalStylePenaltyIncludingDuration: lateResidual.residualPenaltyComponents?.normalTotal ?? lateResidual.residualPenalty,
        nonzeroAdjustments: latePricingActive
          ? lateEntries.filter((entry) => entry.lateEnergyCost > 0).length
          : earlyEntries.filter((entry) => entry.energyCost > 0).length,
        capLimitedAdjustments: latePricingActive
          ? lateEntries.filter((entry) => entry.capLimited).length
          : earlyEntries.filter((entry) => entry.capLimited).length,
        targetEffectiveRE: latePricingActive
          ? (lateCostState?.pricingModel?.targetEffectiveRE ?? null)
          : (costState?.effectiveREPricingState?.pricingModel?.targetEffectiveRE ?? null),
        targetPolicy: latePricingActive
          ? (lateCostState?.pricingModel?.targetPolicy ?? null)
          : (costState?.effectiveREPricingState?.pricingModel?.targetPolicy ?? null),
        maxAdjustment: latePricingActive && lateEntries.length
          ? Math.max(...lateEntries.map((entry) => entry.lateEnergyCost))
          : (earlyEntries.length
            ? Math.max(...earlyEntries.map((entry) => entry.energyCost))
            : 0)
      },
      selectorSplit: lateCostState.selectorSplit ?? null,
      legacySelectorSplit: lateCostState.legacySelectorSplit ?? null
    },
    balanceValid,
    acceptable: availabilityValid && balanceValid,
    penalty: Number(residualBalance.worstResidualPenalty.toFixed(4)),
    recommendedRemoval
  };
}


export function getEconomyTargetedRescueRouteSignature(route) {
  if (!route) return "missing";
  const path = (route.path || []).map((point) => `${point?.x ?? "?"},${point?.y ?? "?"}`).join(">");
  const actions = (route.transitions || []).map((transition) => (
    transition?.action?.id ??
    transition?.card?.id ??
    transition?.actionId ??
    transition?.id ??
    "?"
  )).join(",");
  return `${path}|${actions}`;
}

export function buildEconomyTargetedRescueSearchOptions(firstLeg, options, rescueStartingEnergy) {
  const generationProfile = getGenerationModeProfile(options);
  const flagCount = Array.isArray(firstLeg?.flags) ? firstLeg.flags.length : 0;
  return {
    ...options,
    ...getRouteAnalysisVariantOptions(options),
    startingEnergy: rescueStartingEnergy,
    startingEnergyDelta: 0,
    playerCount: 1,
    maxRoutes: 2,
    maxActions: Math.max(24, flagCount * 18 + 8),
    maxExpansions: generationProfile.fullCourseExpansions,
    fullCourseTrafficPasses: 0,
    dynamicGoals: options.movingTargetTimelines ?? options.dynamicGoals ?? [],
    contextualLegSearch: true,
    contextualSeedStartAnalyses: undefined,
    contextualOpeningRoutes: 2,
    contextualLaterRoutes: 2,
    contextualBeamWidth: 2,
    contextualCompletionPool: 2,
    contextualOptionalCompletionExpansions: 0,
    contextualFullForecastShare: NORMAL_CONTEXTUAL_FULL_FORECAST_SHARE,
    contextualTrafficFeedbackEnabled: false,
    contextualTrafficDrivenAlternates: false,
    contextualTrafficEpochs: 0,
    contextualRequiredStarts: 1,
    contextualPreferredStarts: 1,
    contextualStopWhenPreferredLost: false,
    contextualOpeningExpansions:
      options.contextualOpeningExpansions ?? generationProfile.preflightOpeningExpansions,
    contextualLaterExpansions:
      options.contextualLaterExpansions ?? generationProfile.preflightLaterExpansions,
    contextualPhysicalTemplateRoutes: options.contextualPhysicalTemplateRoutes ?? 3,
    contextualPrimaryWitnessRoutes: options.contextualPrimaryWitnessRoutes ?? 3,
    contextualPhysicalTemplateExpansions: options.contextualPhysicalTemplateExpansions ?? 700,
    contextualPhysicalTemplateMaxActions: options.contextualPhysicalTemplateMaxActions ?? 36,
    contextualExactRepairExpansions: options.contextualExactRepairExpansions ?? 550,
    skipTraffic: true,
    skipFullCourseTraffic: true,
    trafficEnabledOverride: false
  };
}

export function mergeEconomyTargetedRescueRoutesIntoField(
  field,
  targetIndex,
  rescueRoutes,
  tileMap,
  pricingOptions,
  rescueStartingEnergy
) {
  if (!field || !Array.isArray(field.starts) || !rescueRoutes?.length) {
    return { field, addedRoutes: 0 };
  }
  const baseStartingEnergy = getCourseStartingEnergy(pricingOptions);
  const routeEconomyOptions = getPayToWinRouteEconomyPricingOptions(field, pricingOptions);
  let addedRoutes = 0;
  const starts = field.starts.map((analysis) => {
    if (analysis.index !== targetIndex) return analysis;
    const existingRoutes = Array.isArray(analysis.fullCourseRoutes)
      ? analysis.fullCourseRoutes.filter(Boolean)
      : (analysis.fullCourseRoute ? [analysis.fullCourseRoute] : []);
    const signatures = new Set(existingRoutes.map(getEconomyTargetedRescueRouteSignature));
    const normalizedRescueRoutes = [];
    for (const route of rescueRoutes) {
      const signature = getEconomyTargetedRescueRouteSignature(route);
      if (signatures.has(signature)) continue;
      const normalized = rescoreFixedRouteUpgradeEconomy(
        tileMap,
        route,
        {
          ...routeEconomyOptions,
          startingEnergy: baseStartingEnergy,
          routeEconomyReferenceStartingEnergy: rescueStartingEnergy
        }
      );
      if (!Number.isFinite(Number(normalized?.score))) continue;
      signatures.add(signature);
      normalizedRescueRoutes.push({
        ...route,
        score: Number(normalized.score),
        economyTargetedRescue: {
          model: "prune-gated-direction-aware-extreme-energy-route-discovery-v49ct",
          discoveredStartingEnergy: rescueStartingEnergy,
          normalizedStartingEnergy: baseStartingEnergy
        }
      });
    }
    addedRoutes += normalizedRescueRoutes.length;
    if (!normalizedRescueRoutes.length) return analysis;
    return {
      ...analysis,
      fullCourseRoutes: [...existingRoutes, ...normalizedRescueRoutes]
        .sort((left, right) => Number(left?.score) - Number(right?.score))
    };
  });
  return {
    field: {
      ...field,
      starts
    },
    addedRoutes
  };
}

export function getEconomyTargetedRescueDirectionProfile(removal, pricingOptions = {}) {
  const subsidyMode = isSubsidizedStartsPricing(pricingOptions);
  const earlyDelta = Number(removal?.registerEquivalent);
  const lateDelta = Number(removal?.lateRegisterEquivalent);
  const directional = [earlyDelta, lateDelta].filter(Number.isFinite);
  const eligible = directional.some((delta) => (
    subsidyMode ? delta > 1e-6 : delta < -1e-6
  ));
  return {
    mode: subsidyMode ? "subsidy" : "payment",
    legalEnergyDirection: subsidyMode ? "add-energy-to-higher-RE-start" : "remove-energy-from-lower-RE-start",
    earlyDelta: Number.isFinite(earlyDelta) ? Number(earlyDelta.toFixed(3)) : null,
    lateDelta: Number.isFinite(lateDelta) ? Number(lateDelta.toFixed(3)) : null,
    eligible,
    reason: eligible
      ? "legal-energy-direction-can-compensate-target"
      : "target-is-not-on-compensable-side-of-selector-field"
  };
}


export function attemptEconomyTargetedEnergyRescue({
  baseFirstLeg,
  currentFirstLeg,
  tileMap,
  excludedIndices,
  playerCount,
  pricingOptions,
  analysisOptions,
  currentEconomy,
  removal
}) {
  const targetIndex = removal?.index;
  const targetAnalysis = currentFirstLeg?.starts?.find((analysis) => analysis.index === targetIndex);
  if (!targetAnalysis?.start || !Array.isArray(currentFirstLeg?.flags) || !currentFirstLeg.flags.length) {
    return { attempted: false, reason: "missing-target-route-context" };
  }
  const adjustmentLimit = getStartEnergyAdjustmentLimit(pricingOptions);
  if (!(adjustmentLimit > 0)) {
    return { attempted: false, reason: "no-legal-energy-adjustment" };
  }
  const directionProfile = getEconomyTargetedRescueDirectionProfile(
    removal,
    pricingOptions
  );
  if (!directionProfile.eligible) {
    return {
      attempted: false,
      directionEligible: false,
      targetIndex,
      directionProfile,
      reason: directionProfile.reason
    };
  }

  const baseStartingEnergy = getCourseStartingEnergy(pricingOptions);
  const maxEnergy = getCourseMaxEnergy(pricingOptions);
  const subsidyMode = isSubsidizedStartsPricing(pricingOptions);
  const rescueStartingEnergy = subsidyMode
    ? Math.min(maxEnergy, baseStartingEnergy + adjustmentLimit)
    : Math.max(0, baseStartingEnergy - adjustmentLimit);
  const rescueStart = {
    ...targetAnalysis.start,
    analysisIndex: targetIndex
  };
  let rescueAnalysis = null;
  try {
    rescueAnalysis = analyzeFullCourse(
      tileMap,
      [rescueStart],
      currentFirstLeg.flags,
      buildEconomyTargetedRescueSearchOptions(
        currentFirstLeg,
        pricingOptions,
        rescueStartingEnergy
      )
    );
  } catch (error) {
    return {
      attempted: true,
      accepted: false,
      savedPrune: false,
      targetIndex,
      rescueStartingEnergy,
      directionEligible: true,
      directionProfile,
      reason: `search-error:${error?.code ?? error?.message ?? "unknown"}`,
      routesDiscovered: 0,
      routesAdded: 0
    };
  }

  const rescueTarget = rescueAnalysis?.starts?.find((analysis) => analysis.index === targetIndex)
    ?? rescueAnalysis?.starts?.[0]
    ?? null;
  const rescueRoutes = rescueTarget?.fullCourseRoutes?.length
    ? rescueTarget.fullCourseRoutes.filter(Boolean)
    : (rescueTarget?.fullCourseRoute ? [rescueTarget.fullCourseRoute] : []);
  const currentMerge = mergeEconomyTargetedRescueRoutesIntoField(
    currentFirstLeg,
    targetIndex,
    rescueRoutes,
    tileMap,
    pricingOptions,
    rescueStartingEnergy
  );
  if (!(currentMerge.addedRoutes > 0)) {
    return {
      attempted: true,
      accepted: false,
      savedPrune: false,
      targetIndex,
      rescueStartingEnergy,
      directionEligible: true,
      directionProfile,
      reason: "no-new-route-candidate",
      routesDiscovered: rescueRoutes.length,
      routesAdded: 0
    };
  }

  const rescuedCurrent = recomputeFirstLegPressure(
    tileMap,
    currentMerge.field,
    {
      playerCount,
      ...analysisOptions,
      excludedIndices: [...excludedIndices]
    }
  );
  const rescuedCostState = getPayToWinCostEntries(
    rescuedCurrent,
    tileMap,
    excludedIndices,
    pricingOptions
  );
  const rescuedEconomy = evaluatePayToWinSelectorAwarePricingState(
    rescuedCurrent,
    tileMap,
    excludedIndices,
    playerCount,
    pricingOptions,
    rescuedCostState
  );
  const penaltyBefore = Number(currentEconomy?.penalty ?? Infinity);
  const penaltyAfter = Number(rescuedEconomy?.penalty ?? Infinity);
  const savedPrune = !rescuedEconomy?.recommendedRemoval;
  const changedRemoval = Boolean(
    rescuedEconomy?.recommendedRemoval &&
    rescuedEconomy.recommendedRemoval.index !== targetIndex
  );
  const materiallyImproved = Number.isFinite(penaltyBefore) && Number.isFinite(penaltyAfter)
    ? penaltyAfter < penaltyBefore - 0.005
    : savedPrune;
  const accepted = savedPrune || (changedRemoval && materiallyImproved);
  if (!accepted) {
    return {
      attempted: true,
      accepted: false,
      savedPrune: false,
      targetIndex,
      rescueStartingEnergy,
      directionEligible: true,
      directionProfile,
      reason: rescuedEconomy?.recommendedRemoval?.index === targetIndex
        ? "same-start-still-pruned"
        : "no-material-residual-improvement",
      routesDiscovered: rescueRoutes.length,
      routesAdded: currentMerge.addedRoutes,
      penaltyBefore,
      penaltyAfter
    };
  }

  const baseMerge = mergeEconomyTargetedRescueRoutesIntoField(
    baseFirstLeg,
    targetIndex,
    rescueRoutes,
    tileMap,
    pricingOptions,
    rescueStartingEnergy
  );
  baseFirstLeg.starts = baseMerge.field.starts;
  Object.assign(currentFirstLeg, rescuedCurrent);
  return {
    attempted: true,
    accepted: true,
    savedPrune,
    targetIndex,
    rescueStartingEnergy,
    directionEligible: true,
    directionProfile,
    reason: savedPrune ? "prune-avoided" : "different-residual-prune-after-rescue",
    routesDiscovered: rescueRoutes.length,
    routesAdded: currentMerge.addedRoutes,
    penaltyBefore,
    penaltyAfter,
    costState: rescuedCostState,
    economyState: rescuedEconomy
  };
}


// v49fn: Start Balance is deliberately downstream of the priced-start economy.
// The ordinary Pay to Win / Subsidized Starts model first completes its own
// selector-aware Energy pricing and pruning exactly as it did before Start Balance
// existed. Only the already-priced completed-RE field is inspected here.
export function summarizePricedFinalStartBalancePhase(
  entries = [],
  costKey = "energyCost",
  options = {}
) {
  const balanceEntries = buildEconomyPricedNormalREEntries(entries, costKey);
  const rangeTarget = getNormalEffectiveRERangeTarget(balanceEntries, options);
  const profile = getStartBalanceProfile(options);
  return {
    count: balanceEntries.length,
    range: Number(rangeTarget.range ?? 0),
    rangeLimit: Number(rangeTarget.rangeLimit ?? 0),
    observedRangeExcess: Number(rangeTarget.observedRangeExcess ?? 0),
    medianTurns: Number(rangeTarget.medianTurns ?? 0),
    withinTarget: !profile.enforced || Number(rangeTarget.observedRangeExcess ?? 0) <= 1e-9,
    balanceEntries
  };
}

export function summarizePricedFinalStartBalanceField(
  earlyEntries = [],
  lateEntries = [],
  latePricingActive = false,
  options = {}
) {
  const early = summarizePricedFinalStartBalancePhase(
    earlyEntries,
    "energyCost",
    options
  );
  const late = latePricingActive
    ? summarizePricedFinalStartBalancePhase(
      lateEntries,
      "lateEnergyCost",
      options
    )
    : early;
  const profile = getStartBalanceProfile(options);
  const worstObservedExcess = Math.max(
    early.observedRangeExcess,
    late.observedRangeExcess
  );
  const worstNormalizedExcess = Math.max(
    early.rangeLimit > 1e-9 ? early.observedRangeExcess / early.rangeLimit : early.observedRangeExcess,
    late.rangeLimit > 1e-9 ? late.observedRangeExcess / late.rangeLimit : late.observedRangeExcess
  );
  return {
    startBalance: normalizeStartBalance(options.startBalance),
    startBalanceLabel: profile.label,
    enforced: profile.enforced,
    early: {
      count: early.count,
      range: early.range,
      rangeLimit: early.rangeLimit,
      observedRangeExcess: early.observedRangeExcess,
      medianTurns: early.medianTurns,
      withinTarget: early.withinTarget
    },
    late: {
      count: late.count,
      range: late.range,
      rangeLimit: late.rangeLimit,
      observedRangeExcess: late.observedRangeExcess,
      medianTurns: late.medianTurns,
      withinTarget: late.withinTarget
    },
    latePricingActive: Boolean(latePricingActive),
    worstObservedExcess: Number(worstObservedExcess.toFixed(3)),
    worstNormalizedExcess: Number(worstNormalizedExcess.toFixed(6)),
    withinTarget: !profile.enforced || (
      early.observedRangeExcess <= 1e-9 &&
      late.observedRangeExcess <= 1e-9
    )
  };
}

// Pick every Start-Balance removal on one frozen priced field. This loop is only
// cheap arithmetic over <= a few dozen starts: it NEVER recomputes traffic,
// routes, or Energy prices between removals. The complete batch is committed once,
// followed by one traffic recomputation and one final pricing pass.
export function choosePricedFinalStartBalanceBatch(
  earlyEntries = [],
  lateEntries = [],
  playerCount = 1,
  latePricingActive = false,
  options = {}
) {
  const profile = getStartBalanceProfile(options);
  const floor = Math.max(1, Math.floor(Number(playerCount) || 1));
  const earlyByIndex = new Map((earlyEntries || []).map((entry) => [entry.index, entry]));
  const lateByIndex = new Map((lateEntries || []).map((entry) => [entry.index, entry]));
  let retainedIndices = [...earlyByIndex.keys()]
    .filter((index) => !latePricingActive || lateByIndex.has(index))
    .sort((left, right) => left - right);

  const summarizeIndices = (indices) => {
    const keep = new Set(indices);
    return summarizePricedFinalStartBalanceField(
      (earlyEntries || []).filter((entry) => keep.has(entry.index)),
      latePricingActive
        ? (lateEntries || []).filter((entry) => keep.has(entry.index))
        : [],
      latePricingActive,
      options
    );
  };

  const before = summarizeIndices(retainedIndices);
  if (!profile.enforced || before.withinTarget || retainedIndices.length <= floor) {
    return {
      ...before,
      before,
      expectedAfter: before,
      retainedIndices,
      prunedIndices: [],
      pruneCount: 0,
      floorReached: retainedIndices.length <= floor,
      expectedWithinTargetAfterBatch: before.withinTarget
    };
  }

  const prunedIndices = [];
  let current = before;
  while (retainedIndices.length > floor && !current.withinTarget) {
    const candidates = retainedIndices.map((index) => {
      const afterIndices = retainedIndices.filter((candidate) => candidate !== index);
      const after = summarizeIndices(afterIndices);
      const improvement = current.worstNormalizedExcess - after.worstNormalizedExcess;
      const rawImprovement = current.worstObservedExcess - after.worstObservedExcess;
      const earlyValue = Number(
        buildEconomyPricedNormalREEntries([earlyByIndex.get(index)], "energyCost")[0]
          ?.normalFairnessEffectiveRE
      );
      const lateValue = latePricingActive
        ? Number(
          buildEconomyPricedNormalREEntries([lateByIndex.get(index)], "lateEnergyCost")[0]
            ?.normalFairnessEffectiveRE
        )
        : earlyValue;
      const currentEarlyValues = buildEconomyPricedNormalREEntries(
        retainedIndices.map((candidate) => earlyByIndex.get(candidate)),
        "energyCost"
      ).map((entry) => entry.normalFairnessEffectiveRE).filter(Number.isFinite);
      const currentLateValues = latePricingActive
        ? buildEconomyPricedNormalREEntries(
          retainedIndices.map((candidate) => lateByIndex.get(candidate)),
          "lateEnergyCost"
        ).map((entry) => entry.normalFairnessEffectiveRE).filter(Number.isFinite)
        : currentEarlyValues;
      const earlyCenter = currentEarlyValues.length ? medianValue(currentEarlyValues) : 0;
      const lateCenter = currentLateValues.length ? medianValue(currentLateValues) : earlyCenter;
      const edgeDistance = Math.max(
        Number.isFinite(earlyValue) ? Math.abs(earlyValue - earlyCenter) : 0,
        Number.isFinite(lateValue) ? Math.abs(lateValue - lateCenter) : 0
      );
      return {
        index,
        afterIndices,
        after,
        improvement,
        rawImprovement,
        edgeDistance
      };
    });
    candidates.sort((left, right) => (
      right.improvement - left.improvement ||
      right.rawImprovement - left.rawImprovement ||
      left.after.worstNormalizedExcess - right.after.worstNormalizedExcess ||
      right.edgeDistance - left.edgeDistance ||
      left.index - right.index
    ));
    const selected = candidates[0];
    if (!selected) break;
    prunedIndices.push(selected.index);
    retainedIndices = selected.afterIndices;
    current = selected.after;
  }

  return {
    ...current,
    before,
    expectedAfter: current,
    retainedIndices,
    prunedIndices,
    pruneCount: prunedIndices.length,
    floorReached: retainedIndices.length <= floor,
    expectedWithinTargetAfterBatch: current.withinTarget
  };
}

export function applyPayToWinStartPricing(firstLeg, tileMap, playerCount, options = {}) {
  const analysisOptions = {
    ...options,
    ...getRouteAnalysisVariantOptions(options),
    payToWin: true
  };
  const pricingOptions = { ...options, playerCount };

  // v49cl runtime-only cache. The balancing chooser already computes the full
  // selector-aware economy state for the frozen field in order to decide whether
  // another removal is warranted. Historically the final-report path immediately
  // rebuilt the same base payment curves and every late-selector scenario after
  // the chooser returned "no removal". Keep the exact computed state and reuse it
  // only when both the first-leg object identity and excluded-start set still
  // match. Any prune/recompute changes one or both and therefore invalidates the
  // snapshot automatically. This is exact reuse, not reduced sampling.
  let lastPricingSnapshot = null;
  const getExcludedSignature = (indices) => [...indices]
    .sort((left, right) => left - right)
    .join(",");
  const rememberPricingSnapshot = (field, indices, costState, economyState) => {
    lastPricingSnapshot = {
      field,
      excludedSignature: getExcludedSignature(indices),
      costState,
      economyState
    };
  };
  const getMatchingPricingSnapshot = (field, indices) => {
    if (!lastPricingSnapshot || lastPricingSnapshot.field !== field) return null;
    return lastPricingSnapshot.excludedSignature === getExcludedSignature(indices)
      ? lastPricingSnapshot
      : null;
  };

  // v49ct: expensive fresh geometry is a last resort. Only a start that the
  // selector-aware compensated field is actually about to prune receives one
  // targeted search at the legal Energy extreme. The newly discovered geometry
  // is normalized back to baseline Energy, inserted as another coherent candidate,
  // and then repriced by the ordinary early/late economy curves.
  const targetedRescueAttemptKeys = new Set();
  const targetedRescueTelemetry = {
    model: "prune-gated-direction-aware-extreme-energy-route-discovery-v49ct",
    attempts: 0,
    directionEligibleAttempts: 0,
    skippedDirectionMismatch: 0,
    accepted: 0,
    savedPrunes: 0,
    routesDiscovered: 0,
    routesAdded: 0,
    details: []
  };

  // v49dz: balance every currently routed start toward the legal directional
  // anchor first. If the selector-aware RE field still exceeds the Normal range,
  // prune one residual outlier, rebuild occupancy/traffic, then recompute the
  // directional anchor and rebalance every remaining start. The Energy cap itself
  // never makes a start unavailable; cap-limited residuals are explicit telemetry.
  const choosePayToWinBalancingRemoval = ({ baseFirstLeg, currentFirstLeg, excludedIndices }) => {
    let costState = getPayToWinCostEntries(
      currentFirstLeg,
      tileMap,
      excludedIndices,
      pricingOptions
    );
    if (costState.entries.length <= playerCount) return null;

    let currentEconomy = evaluatePayToWinSelectorAwarePricingState(
      currentFirstLeg,
      tileMap,
      excludedIndices,
      playerCount,
      pricingOptions,
      costState
    );
    rememberPricingSnapshot(
      currentFirstLeg,
      excludedIndices,
      costState,
      currentEconomy
    );
    let removal = currentEconomy.recommendedRemoval;
    if (!removal) return null;

    const rescueKey = `${getExcludedSignature(excludedIndices)}|${removal.index}`;
    if (!targetedRescueAttemptKeys.has(rescueKey)) {
      targetedRescueAttemptKeys.add(rescueKey);
      const rescue = attemptEconomyTargetedEnergyRescue({
        baseFirstLeg,
        currentFirstLeg,
        tileMap,
        excludedIndices,
        playerCount,
        pricingOptions,
        analysisOptions,
        currentEconomy,
        removal
      });
      if (rescue.directionEligible === false) {
        targetedRescueTelemetry.skippedDirectionMismatch += 1;
        targetedRescueTelemetry.details.push({
          index: rescue.targetIndex ?? removal.index,
          startingEnergy: null,
          accepted: false,
          savedPrune: false,
          reason: rescue.reason ?? "target-is-not-on-compensable-side-of-selector-field",
          directionProfile: rescue.directionProfile ?? null,
          routesDiscovered: 0,
          routesAdded: 0,
          penaltyBefore: Number(currentEconomy?.penalty ?? NaN),
          penaltyAfter: null
        });
      }
      if (rescue.attempted) {
        targetedRescueTelemetry.attempts += 1;
        targetedRescueTelemetry.directionEligibleAttempts += 1;
        targetedRescueTelemetry.routesDiscovered += rescue.routesDiscovered ?? 0;
        targetedRescueTelemetry.routesAdded += rescue.routesAdded ?? 0;
        if (rescue.accepted) targetedRescueTelemetry.accepted += 1;
        if (rescue.savedPrune) targetedRescueTelemetry.savedPrunes += 1;
        targetedRescueTelemetry.details.push({
          index: rescue.targetIndex,
          startingEnergy: rescue.rescueStartingEnergy,
          accepted: Boolean(rescue.accepted),
          savedPrune: Boolean(rescue.savedPrune),
          reason: rescue.reason ?? null,
          directionProfile: rescue.directionProfile ?? null,
          routesDiscovered: rescue.routesDiscovered ?? 0,
          routesAdded: rescue.routesAdded ?? 0,
          penaltyBefore: Number.isFinite(rescue.penaltyBefore) ? rescue.penaltyBefore : null,
          penaltyAfter: Number.isFinite(rescue.penaltyAfter) ? rescue.penaltyAfter : null
        });
      }
      if (rescue.accepted) {
        costState = rescue.costState;
        currentEconomy = rescue.economyState;
        rememberPricingSnapshot(
          currentFirstLeg,
          excludedIndices,
          costState,
          currentEconomy
        );
        removal = currentEconomy.recommendedRemoval;
        if (!removal) return null;
      }
    }

    return {
      ...removal,
      pricingModel: costState.pricingModel,
      offerableBefore: currentEconomy.pricedStartCount,
      earlyOfferableBefore: currentEconomy.earlyOfferedCount,
      lateOfferableBefore: currentEconomy.lateOfferedCount,
      balancePenaltyBefore: currentEconomy.penalty,
      selectorAwarePreview: false,
      compensationFirst: true,
      targetedEnergyRescueAttempted: targetedRescueTelemetry.attempts > 0
    };
  };
  const balancingResult = options.cooperativeStartBalanceBoundary
    ? runIterativeStartBalancingCooperative(
      firstLeg,
      tileMap,
      playerCount,
      analysisOptions,
      choosePayToWinBalancingRemoval,
      { maxPasses: 12 },
      options.cooperativeStartBalanceBoundary
    )
    : runIterativeStartBalancing(
      firstLeg,
      tileMap,
      playerCount,
      analysisOptions,
      choosePayToWinBalancingRemoval,
      { maxPasses: 12 }
    );

  return mapMaybePromise(balancingResult, (result) => {
  let { currentFirstLeg, excludedIndices, removals: pruned } = result;
  const startingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const startingUpgradeCards = getCourseStartingUpgradeCards(options);
  const denialCost = getPayToWinDenialCost(options);
  let cachedFinalPricing = getMatchingPricingSnapshot(
    currentFirstLeg,
    excludedIndices
  );
  let finalPricingStateReused = Boolean(cachedFinalPricing);
  let finalCostState = cachedFinalPricing?.costState ?? getPayToWinCostEntries(
    currentFirstLeg,
    tileMap,
    excludedIndices,
    pricingOptions
  );
  let finalEconomyState = cachedFinalPricing?.economyState ?? evaluatePayToWinSelectorAwarePricingState(
    currentFirstLeg,
    tileMap,
    excludedIndices,
    playerCount,
    pricingOptions,
    finalCostState
  );
  let lateCostState = finalEconomyState.lateCostState;
  let earlyCostState = {
    entries: lateCostState.earlyEntries ?? finalCostState.entries,
    costUnit: lateCostState.earlyCostUnit ?? finalCostState.costUnit,
    minScore: finalCostState.minScore,
    maxScore: finalCostState.maxScore,
    pricingModel: lateCostState.earlyPricingModel ?? finalCostState.pricingModel
  };
  let latePricingActive = Boolean(lateCostState.active);

  // v49fn: the priced-start Energy economy above is the untouched pre-control
  // owner. Start Balance gets one terminal check only after that work is done.
  // All fairness removals are chosen on this one frozen priced field and committed
  // as a batch. Only when the batch is non-empty do we pay for one final traffic
  // recomputation and one final selector-aware repricing pass.
  const finalStartBalanceBatch = choosePricedFinalStartBalanceBatch(
    earlyCostState.entries,
    lateCostState.entries,
    playerCount,
    latePricingActive,
    pricingOptions
  );
  const finalStartBalancePrunedIndices = [...finalStartBalanceBatch.prunedIndices];
  let finalStartBalanceTrafficRecomputed = false;

  if (finalStartBalancePrunedIndices.length) {
    const preliminaryEarlyByIndex = new Map(
      earlyCostState.entries.map((entry) => [entry.index, entry])
    );
    const preliminaryLateByIndex = new Map(
      lateCostState.entries.map((entry) => [entry.index, entry])
    );
    for (const index of finalStartBalancePrunedIndices) {
      if (excludedIndices.has(index)) continue;
      excludedIndices.add(index);
      const entry = preliminaryEarlyByIndex.get(index);
      const lateEntry = preliminaryLateByIndex.get(index);
      pruned.push({
        index,
        score: Number(entry?.postPaymentFullScore ?? entry?.fullScore ?? 0),
        fullScore: Number(entry?.fullScore ?? entry?.postPaymentFullScore ?? 0),
        energyCost: entry?.energyCost ?? null,
        lateEnergyCost: lateEntry?.lateEnergyCost ?? entry?.energyCost ?? null,
        registerEquivalent: entry?.registerEquivalent ?? null,
        lateRegisterEquivalent:
          lateEntry?.lateRegisterEquivalent ?? entry?.registerEquivalent ?? null,
        effectiveREPruned: true,
        balanceDispersionPruned: false,
        finalStartBalancePruned: true,
        pass: "final",
        batchIndex: finalStartBalancePrunedIndices.indexOf(index),
        residualPenaltyBefore: 0,
        residualPenaltyAfterEstimate: 0,
        removalImprovement: 0,
        reason:
          `final Start Balance ${finalStartBalanceBatch.startBalanceLabel} adjusted-RE range batch prune`
      });
    }

    if (!analysisOptions.skipTraffic) {
      currentFirstLeg = recomputeFirstLegPressure(
        tileMap,
        analysisOptions.carryOccupancyScores ? currentFirstLeg : result.baseFirstLeg,
        {
          playerCount,
          ...analysisOptions,
          excludedIndices: [...excludedIndices]
        }
      );
      finalStartBalanceTrafficRecomputed = true;
    }

    // The one allowed post-fairness pricing pass is deliberately NOT fed back
    // into another fairness prune loop. If traffic/repricing leaves a small
    // residual miss, telemetry reports it and ordinary candidate acceptance can
    // reject the course; generation does not chase the target recursively.
    cachedFinalPricing = null;
    finalPricingStateReused = false;
    finalCostState = getPayToWinCostEntries(
      currentFirstLeg,
      tileMap,
      excludedIndices,
      pricingOptions
    );
    finalEconomyState = evaluatePayToWinSelectorAwarePricingState(
      currentFirstLeg,
      tileMap,
      excludedIndices,
      playerCount,
      pricingOptions,
      finalCostState
    );
    lateCostState = finalEconomyState.lateCostState;
    earlyCostState = {
      entries: lateCostState.earlyEntries ?? finalCostState.entries,
      costUnit: lateCostState.earlyCostUnit ?? finalCostState.costUnit,
      minScore: finalCostState.minScore,
      maxScore: finalCostState.maxScore,
      pricingModel: lateCostState.earlyPricingModel ?? finalCostState.pricingModel
    };
    latePricingActive = Boolean(lateCostState.active);
  }

  const finalStartBalanceAfter = summarizePricedFinalStartBalanceField(
    earlyCostState.entries,
    lateCostState.entries,
    latePricingActive,
    pricingOptions
  );
  const pricedStartBalanceFinalCheck = {
    model: "post-energy-one-shot-range-batch-v49fn",
    startBalance: finalStartBalanceBatch.startBalance,
    startBalanceLabel: finalStartBalanceBatch.startBalanceLabel,
    enforced: finalStartBalanceBatch.enforced,
    before: finalStartBalanceBatch.before,
    expectedAfterFrozenBatch: finalStartBalanceBatch.expectedAfter,
    afterReprice: finalStartBalanceAfter,
    prunedIndices: finalStartBalancePrunedIndices,
    pruneCount: finalStartBalancePrunedIndices.length,
    trafficRecomputed: finalStartBalanceTrafficRecomputed,
    repriced: finalStartBalancePrunedIndices.length > 0,
    expectedWithinTargetAfterBatch:
      finalStartBalanceBatch.expectedWithinTargetAfterBatch,
    withinTargetAfterReprice: finalStartBalanceAfter.withinTarget,
    floorReached: finalStartBalanceBatch.floorReached
  };

  const costByIndex = new Map(earlyCostState.entries.map((entry) => [entry.index, entry.energyCost]));
  const earlyUnavailableByIndex = new Map(earlyCostState.entries.map((entry) => [
    entry.index,
    false
  ]));
  const lateCostByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateEnergyCost]));
  const lateUnavailableByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, false]));
  const lateAdjustedScoreByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateAdjustedScore]));
  const earlyUnavailableCount = 0;
  const lateUnavailableCount = 0;
  const fullyUnavailableEntries = [];
  const fullyUnavailableIndices = new Set();
  const fullyUnavailableCount = 0;
  const maxUnavailable = Math.max(0, earlyCostState.entries.length - playerCount);
  const maxEarlyUnavailable = maxUnavailable;
  const maxLateUnavailable = maxUnavailable;
  const earlyAvailabilityValid = true;
  const lateAvailabilityValid = true;
  const pricedStartCount = earlyCostState.entries.length;
  const availabilityValid = pricedStartCount >= Math.max(1, playerCount || 1);

  const residualBalance = finalEconomyState.residualBalance;
  const energyEconomyBalanceValid = finalEconomyState.balanceValid;
  const startBalanceValid = finalStartBalanceAfter.withinTarget;
  const balanceValid = energyEconomyBalanceValid && startBalanceValid;
  const reOwnershipAudit = finalEconomyState.reOwnershipAudit;

  const hasLatePriceDifference = latePricingActive && lateCostState.entries.some((entry) => {
    if (!costByIndex.has(entry.index)) return false;
    const earlyUnavailable = earlyUnavailableByIndex.get(entry.index) ?? false;
    const lateUnavailable = Boolean(entry.lateUnavailable);
    if (earlyUnavailable !== lateUnavailable) return true;
    if (earlyUnavailable && lateUnavailable) return false;
    return entry.lateEnergyCost !== costByIndex.get(entry.index);
  });
  const latePriceHigherCount = latePricingActive ? lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost > costByIndex.get(entry.index)
  )).length : 0;
  const latePriceLowerCount = latePricingActive ? lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost < costByIndex.get(entry.index)
  )).length : 0;

  const activeScores = earlyCostState.entries.map((entry) => entry.postPaymentFullScore);
  const meanScore = activeScores.length ? average(activeScores) : 0;
  const prunedOutliers = pruned.map((item) => ({
    index: item.index,
    score: item.score,
    delta: Number((item.score - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinPruned: true,
      subsidizedStarts: isSubsidizedStartsPricing(options),
      energyCost: item.energyCost,
      outlierPass: item.pass,
      removalReason: item.reason,
      finalStartBalancePruned: Boolean(item.finalStartBalancePruned),
      costThreshold: denialCost
    }
  }));
  const unavailableOutliers = fullyUnavailableEntries.map((item) => ({
    index: item.index,
    score: item.adjustedScore,
    delta: Number((item.adjustedScore - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinUnavailable: true,
      subsidizedStarts: isSubsidizedStartsPricing(options),
      energyCost: item.energyCost,
      lateEnergyCost: lateCostByIndex.get(item.index),
      startingEnergy,
      costThreshold: denialCost
    }
  }));
  const outliers = [...prunedOutliers, ...unavailableOutliers];
  const lateEntryByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry]));
  const pricingEntries = earlyCostState.entries.map((entry) => {
    const lateEntry = lateEntryByIndex.get(entry.index);
    return {
      index: entry.index,
      fullScore: entry.fullScore,
      advantage: entry.advantage,
      registerEquivalent: entry.registerEquivalent,
      energyCost: entry.energyCost,
      unavailable: entry.energyCost >= denialCost,
      postPaymentFullScore: entry.postPaymentFullScore,
      postAdjustmentDeltaScore: entry.postAdjustmentDeltaScore,
      postAdjustmentDeltaRegisters: entry.postAdjustmentDeltaRegisters,
      paymentScores: entry.paymentScores,
      lateEnergyCost: lateEntry?.lateEnergyCost ?? null,
      lateUnavailable: Boolean(lateEntry?.lateUnavailable),
      lateFullScore: lateEntry?.fullScore ?? null,
      latePostPaymentFullScore: lateEntry?.postPaymentFullScore ?? null,
      latePostAdjustmentDeltaRegisters: lateEntry?.postAdjustmentDeltaRegisters ?? null,
      targetEffectiveRE: entry.targetEffectiveRE ?? null,
      rawTargetGap: entry.rawTargetGap ?? null,
      residualTargetGap: entry.residualTargetGap ?? null,
      capLimited: Boolean(entry.capLimited),
      lateCapLimited: Boolean(lateEntry?.capLimited)
    };
  });
  const meaningfulEnergyAdjustmentCount = pricingEntries.filter((entry) => (
    Math.max(
      Math.max(0, Number(entry.energyCost) || 0),
      Math.max(0, Number(entry.lateEnergyCost) || 0)
    ) > 0
  )).length;
  const capLimitedEnergyAdjustmentIndices = pricingEntries
    .filter((entry) => entry.capLimited || entry.lateCapLimited)
    .map((entry) => entry.index);
  const capLimitedEnergyAdjustmentCount = capLimitedEnergyAdjustmentIndices.length;

  return {
    ...currentFirstLeg,
    starts: currentFirstLeg.starts.map((startAnalysis) => ({
      ...startAnalysis,
      energyCost: costByIndex.has(startAnalysis.index) ? costByIndex.get(startAnalysis.index) : null,
      earlyUnavailable: earlyUnavailableByIndex.get(startAnalysis.index) ?? false,
      lateEnergyCost: lateCostByIndex.has(startAnalysis.index) ? lateCostByIndex.get(startAnalysis.index) : null,
      lateUnavailable: lateUnavailableByIndex.get(startAnalysis.index) ?? false,
      payToWinUnavailable: fullyUnavailableIndices.has(startAnalysis.index),
      lateAdjustedScore: lateAdjustedScoreByIndex.has(startAnalysis.index)
        ? lateAdjustedScoreByIndex.get(startAnalysis.index)
        : null
    })),
    summary: {
      ...currentFirstLeg.summary,
      // For priced starts, public fairness is the residual field after the
      // displayed Energy adjustment, not the raw pre-price route spread.
      scoreStdDev: Number(residualBalance.worstStdDev.toFixed(2)),
      fairnessScore: Number(Math.max(
        0,
        100 - (
          (residualBalance.worstRangeLimit ?? 0) > 1e-9
            ? ((residualBalance.worstRange ?? 0) / residualBalance.worstRangeLimit) * 35
            : 0
        )
      ).toFixed(2)),
      outliers,
      payToWin: {
        active: true,
        mode: isSubsidizedStartsPricing(options) ? "subsidy" : "payment",
        subsidizedStarts: isSubsidizedStartsPricing(options),
        pricingEconomyMethod: "card-aware-fixed-route-expected-economy-v37",
        pruningPolicy: "pre-control-energy-economy-v49dz + one-shot-final-start-balance-v49fn",
        compensationFirst: true,
        routeReselectionPolicy: "completed-effective-re-existing-candidates-then-prune-gated-direction-aware-energy-rescue-v49dw",
        freshEnergySpecificReroutes: targetedRescueTelemetry.attempts,
        targetedEnergyRescue: {
          ...targetedRescueTelemetry,
          behaviorChanged: targetedRescueTelemetry.accepted > 0
        },
        startingEnergy,
        maxEnergy,
        startingUpgradeCards,
        maxSubsidy: isSubsidizedStartsPricing(options) ? getStartEnergyAdjustmentLimit(options) : 0,
        subsidyStartingEnergyCeiling: isSubsidizedStartsPricing(options)
          ? getSubsidizedStartsMaximumEnergy(options)
          : null,
        denialCost,
        costUnit: earlyCostState.costUnit,
        lateCostUnit: lateCostState.costUnit,
        pricingModel: earlyCostState.pricingModel,
        latePricingModel: lateCostState.pricingModel ?? null,
        selectorSplit: lateCostState.selectorSplit ?? null,
        selectorPricingEvaluated: Boolean(lateCostState.evaluated),
        selectorScenarioSamplesByPosition: lateCostState.scenarioSamplesBySelector ?? {},
        selectorRuntimeOptimization: {
          model: "exact-final-frozen-field-reuse-v49cl",
          finalPricingStateReused,
          reusedBaseStartCurves: finalPricingStateReused
            ? finalCostState.entries.length
            : 0,
          reusedSelectorScenarioSamples: finalPricingStateReused
            ? Number(lateCostState.scenarioSamples ?? 0)
            : 0,
          reducedSelectorSampling: false,
          behaviorChanged: false
        },
        pruned,
        pricingEntries,
        pricedStartCount,
        meaningfulEnergyAdjustmentCount,
        hasMeaningfulEnergyAdjustment: meaningfulEnergyAdjustmentCount > 0,
        capLimitedEnergyAdjustmentCount,
        capLimitedEnergyAdjustmentIndices,
        lateSelectorStart: lateCostState.lateSelectorStart,
        lateSelectorEnd: lateCostState.lateSelectorEnd,
        surplusStarts: Math.max(0, pricedStartCount - playerCount),
        latePricingActive,
        lateTrafficModel: latePricingActive
          ? "adaptive-one-breakpoint"
          : (finalEconomyState.selectorPricingEligible ? "adaptive-no-meaningful-split" : "inactive-no-surplus"),
        lateScenarioSamples: lateCostState.scenarioSamples,
        earlyUnavailableCount,
        maxEarlyUnavailable,
        earlyAvailabilityValid,
        lateUnavailableCount,
        maxLateUnavailable,
        lateAvailabilityValid,
        fullyUnavailableCount,
        availabilityValid,
        residualBalance,
        reOwnershipAudit,
        startBalanceFinalCheck: pricedStartBalanceFinalCheck,
        energyEconomyBalanceValid,
        startBalanceValid,
        balanceValid,
        latePriceHigherCount,
        latePriceLowerCount,
        hasLatePriceDifference
      }
    }
  };
  });
}
