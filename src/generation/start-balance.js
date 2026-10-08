// Robo Rally Course Randomizer - Normal start balance: start-balance profiles, outliers, effective-RE range target, iterative pruning passes, usable starts
import { recomputeFirstLegPressure } from "../../analyze.js";
import {
  FULL_START_OUTLIER_Z,
  NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
  NORMAL_EFFECTIVE_RE_MINIMUM_DELTA,
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  NORMAL_EFFECTIVE_RE_RANGE_MIN,
  NORMAL_EFFECTIVE_RE_RANGE_PER_TURN,
  NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
  NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_FRACTION,
  NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_MIN,
  NORMAL_FINAL_TAIL_CLEANUP_Z,
  NORMAL_PRUNE_BATCH_SIZE,
  NORMAL_REGISTER_RANGE_GUARDRAIL_FRACTION,
  NORMAL_REGISTER_RANGE_GUARDRAIL_MIN,
  NORMAL_START_FAIRNESS_STDDEV_LIMIT
} from "./config.js";
import { averageValues } from "./math.js";
import { getRouteAnalysisVariantOptions } from "./variant-availability.js";

// v49fj user-facing Start Balance policy. This changes how tightly starting
// choices must cluster in completed effective RE; it never removes traffic,
// card-pressure, mental-pressure or any other RE owner from the estimator.
// Normal applies it to the range-first pruning/soft-overflow policy. Competitive
// applies it ONLY to the final best-P choice set after the ordinary P sequential
// optimal blocks; block choices themselves are unchanged. Priced-start variants
// keep their pre-control Energy economy completely unchanged; only after that
// economy has finished does Start Balance get one terminal adjusted-RE range
// check, one frozen-field batch prune if needed, and at most one final traffic +
// repricing pass.
export const START_BALANCE_PROFILES = Object.freeze({
  strict: Object.freeze({
    id: "strict",
    label: "Strict",
    rangeMultiplier: 0.75,
    softOverflowMultiplier: 0.75,
    enforced: true
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    rangeMultiplier: 1,
    softOverflowMultiplier: 1,
    enforced: true
  }),
  relaxed: Object.freeze({
    id: "relaxed",
    label: "Relaxed",
    rangeMultiplier: 1.5,
    softOverflowMultiplier: 1.5,
    enforced: true
  }),
  off: Object.freeze({
    id: "off",
    label: "Off",
    rangeMultiplier: 1,
    softOverflowMultiplier: 1,
    enforced: false
  })
});

export function normalizeStartBalance(value) {
  const key = String(value ?? "standard").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(START_BALANCE_PROFILES, key)
    ? key
    : "standard";
}

export function getStartBalanceProfile(options = {}) {
  const value = typeof options === "string"
    ? options
    : options?.startBalance;
  return START_BALANCE_PROFILES[normalizeStartBalance(value)];
}

export function formatStartBalanceLabel(value) {
  return getStartBalanceProfile(value).label;
}

export const NORMAL_START_FAIRNESS_STDDEV_FLOOR = 9;

export function getNormalStartFairnessStdDevLimit(startCount, playerCount) {
  // With surplus starts, Normal can ask for a somewhat tighter field without
  // changing legality or making player count the target. As surplus disappears,
  // relax smoothly back to the ordinary 14-point fairness limit.
  const players = Math.max(1, Math.floor(Number(playerCount) || 1));
  const starts = Math.max(players, Math.floor(Number(startCount) || players));
  const excessPerPlayer = Math.max(0, starts - players) / players;
  const tighteningShare = excessPerPlayer / (1 + excessPerPlayer);
  return NORMAL_START_FAIRNESS_STDDEV_LIMIT -
    (NORMAL_START_FAIRNESS_STDDEV_LIMIT - NORMAL_START_FAIRNESS_STDDEV_FLOOR) * tighteningShare;
}

export function getNormalStartPruneBatchSize(startCount, playerCount) {
  // Make coarse progress while the field has abundant surplus, then recompute
  // after each individual removal once we reach 2x the requested player count.
  // Example: 4 players with 12 starts prunes 12 -> 10 -> 8 in batches of two,
  // then uses single-start passes only if the recomputed field still needs work.
  const players = Math.max(1, Math.floor(Number(playerCount) || 1));
  const starts = Math.max(players, Math.floor(Number(startCount) || players));
  return starts > players * 2 ? 2 : 1;
}

export function getActivePruningStarts(firstLeg, excludedIndices = new Set()) {
  return (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    Number.isFinite(item.balanceScore ?? item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
}

export function* iterateStartBalancingPasses(firstLeg, tileMap, playerCount, analysisOptions = {}, chooser, options = {}) {
  const baseFirstLeg = {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      outliers: [...(firstLeg.summary.outliers || [])]
    }
  };
  const excludedIndices = new Set(options.initialExcludedIndices ?? []);
  const removals = [];
  // The incoming first-leg analysis already contains route-pressure scoring.
  // Recompute immediately only when an earlier lightweight stage has already
  // excluded starts; Pay to Win and untrimmed normal setups can reuse it.
  let currentFirstLeg = (
    excludedIndices.size &&
    !options.inputAlreadyReflectsExcluded &&
    !analysisOptions.skipTraffic
  )
    ? recomputeFirstLegPressure(tileMap, baseFirstLeg, {
      playerCount,
      ...analysisOptions,
      excludedIndices: [...excludedIndices]
    })
    : baseFirstLeg;

  const configuredPruneBatchSize = options.pruneBatchSize;
  for (let pass = 0; pass < (options.maxPasses ?? 12); pass += 1) {
    let batchActiveStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
    const requestedPruneBatchSize = typeof configuredPruneBatchSize === "function"
      ? configuredPruneBatchSize(batchActiveStarts.length, playerCount)
      : configuredPruneBatchSize;
    const pruneBatchSize = Math.max(1, Math.floor(Number(requestedPruneBatchSize) || 1));
    let removedThisPass = 0;

    while (removedThisPass < pruneBatchSize) {
      if (batchActiveStarts.length <= Math.max(1, playerCount || 1)) break;
      const removal = chooser({
        baseFirstLeg,
        currentFirstLeg,
        activeStarts: batchActiveStarts,
        excludedIndices,
        removals,
        pass: pass + 1,
        batchIndex: removedThisPass
      });

      if (!removal || excludedIndices.has(removal.index)) break;
      excludedIndices.add(removal.index);
      removals.push({
        ...removal,
        pass: pass + 1,
        batchIndex: removedThisPass
      });
      removedThisPass += 1;
      batchActiveStarts = batchActiveStarts.filter((entry) => entry.index !== removal.index);
    }

    if (!removedThisPass) break;

    // In the fast baseline, intrinsic full-course scores are already present and
    // traffic is intentionally disabled. Do not call the occupancy/pressure engine
    // merely to return zeros; continue pruning the frozen intrinsic field.
    if (!analysisOptions.skipTraffic) {
      // Traffic/occupancy is frozen within a batch, then recomputed exactly once.
      currentFirstLeg = recomputeFirstLegPressure(
        tileMap,
        analysisOptions.carryOccupancyScores ? currentFirstLeg : baseFirstLeg,
        {
          playerCount,
          ...analysisOptions,
          excludedIndices: [...excludedIndices]
        }
      );
    }

    // v49ao: the complete frozen-field batch has committed and its one traffic
    // recomputation (when enabled) is finished. This is therefore a safe yield
    // boundary that cannot change chooser order or the field used within the pass.
    yield {
      pass: pass + 1,
      removedThisPass,
      totalRemoved: removals.length,
      remainingStartCount: getActivePruningStarts(currentFirstLeg, excludedIndices).length
    };
  }

  return {
    baseFirstLeg,
    currentFirstLeg,
    excludedIndices,
    removals
  };
}

export function runIterativeStartBalancing(firstLeg, tileMap, playerCount, analysisOptions = {}, chooser, options = {}) {
  const iterator = iterateStartBalancingPasses(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    chooser,
    options
  );
  while (true) {
    const step = iterator.next();
    if (step.done) return step.value;
  }
}

export async function runIterativeStartBalancingCooperative(
  firstLeg,
  tileMap,
  playerCount,
  analysisOptions = {},
  chooser,
  options = {},
  onPassBoundary = null
) {
  const iterator = iterateStartBalancingPasses(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    chooser,
    options
  );
  while (true) {
    const step = iterator.next();
    if (step.done) return step.value;
    if (typeof onPassBoundary === "function") {
      await onPassBoundary(step.value);
    }
  }
}

export function mapMaybePromise(value, mapper) {
  return value && typeof value.then === "function"
    ? value.then(mapper)
    : mapper(value);
}

export function medianValue(values) {
  const finite = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!finite.length) {
    return 0;
  }
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

export function getRobustOutlierStats(entries, scoreKey = "adjustedScore") {
  const values = entries.map((entry) => entry[scoreKey]).filter(Number.isFinite);
  const center = medianValue(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = medianValue(deviations);
  const robustScale = Math.max(1.5, mad * 1.4826);

  return {
    center,
    mad,
    robustScale
  };
}

export function rankNormalStartOutliers(entries, scoreKey = "adjustedScore", zThreshold = FULL_START_OUTLIER_Z) {
  if (entries.length < 3) {
    return [];
  }

  const scoreStats = getRobustOutlierStats(entries, scoreKey);
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const minimumScoreDelta = Math.max(5, Math.abs(scoreStats.center) * 0.08);

  return entries
    .map((entry) => {
      const score = entry[scoreKey];
      const scoreDelta = score - scoreStats.center;
      const scoreZ = Math.abs(scoreDelta) / scoreStats.robustScale;
      const actionDelta = Number.isFinite(entry.bestActions)
        ? entry.bestActions - actionStats.center
        : 0;
      const actionZ = Number.isFinite(entry.bestActions)
        ? Math.abs(actionDelta) / actionStats.robustScale
        : 0;
      const qualifies = (
        scoreZ >= zThreshold && Math.abs(scoreDelta) >= minimumScoreDelta
      ) || (
        actionZ >= zThreshold + 0.35 && Math.abs(actionDelta) >= 2
      );

      return {
        entry,
        score,
        scoreDelta,
        scoreZ,
        actionDelta,
        actionZ,
        qualifies,
        strength: Math.max(scoreZ, actionZ * 0.9)
      };
    })
    .filter((item) => item.qualifies)
    .sort((left, right) => (
      right.strength - left.strength ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));
}

export function getNormalStartDispersion(entries, scoreKey = "adjustedScore") {
  const values = entries
    .map((entry) => entry[scoreKey])
    .filter(Number.isFinite);
  if (values.length < 2) {
    return 0;
  }

  const mean = averageValues(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  );
}

export function getNormalStartBalanceDiagnostics(entry, entries, scoreKey = "balanceScore") {
  const scoreStats = getRobustOutlierStats(entries, scoreKey);
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const scoreValue = Number(entry[scoreKey]);
  const scoreDelta = scoreValue - scoreStats.center;
  const actionDelta = Number.isFinite(entry.bestActions)
    ? entry.bestActions - actionStats.center
    : 0;

  return {
    scoreZ: Math.abs(scoreDelta) / scoreStats.robustScale,
    actionZ: Number.isFinite(entry.bestActions)
      ? Math.abs(actionDelta) / actionStats.robustScale
      : 0,
    scoreDelta,
    actionDelta
  };
}

export function summarizeNormalRetainedBalance(entries = []) {
  const active = entries.filter((entry) => Number.isFinite(entry.balanceScore));
  if (!active.length) {
    return {
      count: 0,
      stdDev: 0,
      min: null,
      max: null,
      range: 0,
      worstScoreZ: 0,
      worstScoreIndex: null,
      worstActionZ: 0,
      worstActionIndex: null
    };
  }

  const values = active.map((entry) => entry.balanceScore);
  let worstScore = { z: -Infinity, index: null };
  let worstAction = { z: -Infinity, index: null };
  active.forEach((entry) => {
    const diagnostics = getNormalStartBalanceDiagnostics(entry, active, "balanceScore");
    if (diagnostics.scoreZ > worstScore.z) {
      worstScore = { z: diagnostics.scoreZ, index: entry.index };
    }
    if (diagnostics.actionZ > worstAction.z) {
      worstAction = { z: diagnostics.actionZ, index: entry.index };
    }
  });

  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    count: active.length,
    stdDev: Number(getNormalStartDispersion(active, "balanceScore").toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    range: Number((max - min).toFixed(2)),
    worstScoreZ: Number(Math.max(0, worstScore.z).toFixed(2)),
    worstScoreIndex: worstScore.index,
    worstActionZ: Number(Math.max(0, worstAction.z).toFixed(2)),
    worstActionIndex: worstAction.index
  };
}

export function summarizePostBalanceStartResiduals(firstLeg, playerCount = 1) {
  const balance = firstLeg?.summary?.normalStartBalance ?? null;
  if (!balance?.active) {
    return null;
  }

  const excludedIndices = new Set([
    ...(balance.lightweightPruned ?? []),
    ...(balance.pressurePruned ?? []).map((entry) => entry.index),
    ...(balance.fullTrafficPruned ?? []).map((entry) => entry.index)
  ]);
  const active = getActivePruningStarts(firstLeg, excludedIndices)
    .filter((entry) => Number.isFinite(entry?.normalFairnessEffectiveRE));
  if (active.length < Math.max(2, playerCount || 1)) {
    return null;
  }

  const scoreCenter = averageValues(
    active.map((entry) => entry.normalFairnessEffectiveRE)
  );
  const scoreStdDev = getNormalStartDispersion(
    active,
    "normalFairnessEffectiveRE"
  );
  const actionValues = active.map((entry) => Number(entry.bestActions)).filter(Number.isFinite);
  const actionCenter = actionValues.length ? averageValues(actionValues) : 0;

  const componentSpecs = [
    {
      id: "traffic",
      label: "traffic pressure",
      value: (entry) => Number(entry.trafficPenalty ?? 0)
    },
    {
      id: "actions",
      label: "programmed route work",
      value: (entry) => Number(entry.selectedRoute?.actions ?? entry.bestActions)
    },
    {
      id: "hazard",
      label: "hazard exposure",
      value: (entry) => Number(entry.selectedRoute?.hazard ?? 0)
    },
    {
      id: "conveyor",
      label: "conveyor / forced-movement burden",
      value: (entry) => Number(entry.selectedRoute?.conveyorComplexity ?? 0)
    },
    {
      id: "forced",
      label: "forced movement",
      value: (entry) => Number(entry.selectedRoute?.forcedDistance ?? 0)
    },
    {
      id: "distance",
      label: "route distance",
      value: (entry) => Number(entry.selectedRoute?.distance ?? 0)
    }
  ];
  const componentStats = new Map(componentSpecs.map((spec) => {
    const values = active.map(spec.value).filter(Number.isFinite);
    const center = values.length ? averageValues(values) : 0;
    const stdDev = values.length >= 2
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length)
      : 0;
    return [spec.id, { center, stdDev }];
  }));

  const entries = active.map((entry) => {
    const scoreResidual =
      entry.normalFairnessEffectiveRE - scoreCenter;
    const actionResidual = Number.isFinite(entry.bestActions)
      ? entry.bestActions - actionCenter
      : 0;
    const scoreZ = scoreStdDev > 1e-9 ? scoreResidual / scoreStdDev : 0;
    const direction = scoreResidual < 0 ? -1 : 1;
    const reasonCandidates = componentSpecs.map((spec) => {
      const value = spec.value(entry);
      const stats = componentStats.get(spec.id);
      const delta = Number.isFinite(value) ? value - stats.center : 0;
      const z = stats.stdDev > 1e-9 ? delta / stats.stdDev : 0;
      return {
        id: spec.id,
        label: spec.label,
        value: Number.isFinite(value) ? Number(value.toFixed(2)) : null,
        delta: Number(delta.toFixed(2)),
        z: Number(z.toFixed(2)),
        alignedStrength: direction * z
      };
    });
    const alignedReasons = reasonCandidates
      .filter((reason) => reason.alignedStrength > 0.35)
      .sort((left, right) => (
        right.alignedStrength - left.alignedStrength ||
        Math.abs(right.delta) - Math.abs(left.delta) ||
        left.id.localeCompare(right.id)
      ));
    const dominantReason = alignedReasons[0] ?? null;

    return {
      index: entry.index,
      x: Number(entry.startAnalysis?.start?.x ?? entry.start?.x),
      y: Number(entry.startAnalysis?.start?.y ?? entry.start?.y),
      balanceScore: Number(entry.balanceScore.toFixed(2)),
      effectiveRE: Number(entry.normalFairnessEffectiveRE.toFixed(3)),
      scoreResidual: Number(scoreResidual.toFixed(2)),
      scoreZ: Number(scoreZ.toFixed(2)),
      actions: Number.isFinite(entry.bestActions) ? entry.bestActions : null,
      actionResidual: Number(actionResidual.toFixed(2)),
      reasonId: dominantReason?.id ?? "overall",
      reasonLabel: dominantReason?.label ?? "overall route burden",
      reasonDelta: dominantReason?.delta ?? null,
      reasonZ: dominantReason?.z ?? null,
      reasonCandidates
    };
  });

  const absoluteFloor = Math.max(
    1.5,
    scoreStdDev * 0.8,
    Math.abs(scoreCenter) * 0.03
  );
  const notable = entries
    .filter((entry) => (
      Math.abs(entry.scoreZ) >= 1.15 &&
      Math.abs(entry.scoreResidual) >= absoluteFloor
    ))
    .sort((left, right) => (
      Math.abs(right.scoreZ) - Math.abs(left.scoreZ) ||
      Math.abs(right.scoreResidual) - Math.abs(left.scoreResidual) ||
      left.index - right.index
    ));

  const easiest = [...entries].sort((left, right) => (
    left.scoreResidual - right.scoreResidual || left.index - right.index
  ))[0] ?? null;
  const toughest = [...entries].sort((left, right) => (
    right.scoreResidual - left.scoreResidual || left.index - right.index
  ))[0] ?? null;
  const strongest = notable[0] ?? null;
  const courseNoteFloor = Math.max(2, Math.abs(scoreCenter) * 0.04);

  const reasonWeights = new Map();
  notable.forEach((entry) => {
    if (!entry.reasonId || entry.reasonId === "overall") return;
    reasonWeights.set(
      entry.reasonId,
      (reasonWeights.get(entry.reasonId) ?? 0) + Math.max(0.25, Math.abs(entry.reasonZ ?? 0))
    );
  });
  const dominantReasonId = [...reasonWeights.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
    ?? strongest?.reasonId
    ?? "overall";
  const dominantReasonLabel = componentSpecs.find((spec) => spec.id === dominantReasonId)?.label
    ?? "overall route burden";

  const courseNoteCandidate = strongest && Math.abs(strongest.scoreResidual) >= courseNoteFloor
    ? {
      active: true,
      kind: strongest.scoreResidual < 0 ? "cleaner-start" : "tougher-start",
      strength: Number(Math.min(2.5, Math.max(0, Math.abs(strongest.scoreZ) - 1)).toFixed(2)),
      severity: Math.abs(strongest.scoreZ) >= 1.7 ? "minor" : "trivial",
      reasonId: dominantReasonId,
      reasonLabel: dominantReasonLabel,
      notableCount: notable.length
    }
    : { active: false };

  return {
    active: true,
    stage: "post-final-normal-balance",
    metric: "full-course-effective-RE",
    retainedCount: entries.length,
    scoreCenter: Number(scoreCenter.toFixed(2)),
    scoreStdDev: Number(scoreStdDev.toFixed(2)),
    actionCenter: Number(actionCenter.toFixed(2)),
    notableThresholdZ: 1.15,
    notableAbsoluteFloor: Number(absoluteFloor.toFixed(2)),
    courseNoteAbsoluteFloor: Number(courseNoteFloor.toFixed(2)),
    notableCount: notable.length,
    notableIndices: notable.map((entry) => entry.index),
    easiestIndex: easiest?.index ?? null,
    toughestIndex: toughest?.index ?? null,
    entries,
    courseNoteCandidate
  };
}


export function getNormalEffectiveREFairnessValue(entry) {
  const value = Number(entry?.normalFairnessEffectiveRE);
  return Number.isFinite(value) ? value : Infinity;
}

export function rankNormalEffectiveREOutliers(
  entries,
  zThreshold = NORMAL_EFFECTIVE_RE_OUTLIER_Z
) {
  const active = (entries || []).filter((entry) =>
    Number.isFinite(getNormalEffectiveREFairnessValue(entry))
  );
  if (active.length < 3) return [];

  const scoreStats = getRobustOutlierStats(
    active,
    "normalFairnessEffectiveRE"
  );
  const minimumDelta = Math.max(
    NORMAL_EFFECTIVE_RE_MINIMUM_DELTA,
    Math.abs(scoreStats.center) * 0.05
  );

  return active
    .map((entry) => {
      const score = getNormalEffectiveREFairnessValue(entry);
      const scoreDelta = score - scoreStats.center;
      const scoreZ = Math.abs(scoreDelta) / scoreStats.robustScale;
      const actionDiagnostics = getNormalStartBalanceDiagnostics(
        entry,
        active,
        "normalFairnessEffectiveRE"
      );
      return {
        entry,
        score,
        scoreDelta,
        scoreZ,
        actionDelta: actionDiagnostics.actionDelta,
        actionZ: actionDiagnostics.actionZ,
        qualifies:
          scoreZ >= zThreshold &&
          Math.abs(scoreDelta) >= minimumDelta,
        strength: scoreZ
      };
    })
    .filter((item) => item.qualifies)
    .sort((left, right) => (
      right.strength - left.strength ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));
}

export function getNormalEffectiveRERangeTarget(entries = [], options = {}) {
  const active = (entries || []).filter((entry) =>
    Number.isFinite(getNormalEffectiveREFairnessValue(entry))
  );
  const registerCounts = active
    .map((entry) => Number(
      entry?.normalFairnessRegisterCount ?? entry?.bestActions
    ))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const medianRegisters = registerCounts.length ? medianValue(registerCounts) : 0;
  const medianTurns = Math.max(1, medianRegisters / 5);
  const baseRangeLimit = Math.max(
    NORMAL_EFFECTIVE_RE_RANGE_MIN,
    medianTurns * NORMAL_EFFECTIVE_RE_RANGE_PER_TURN
  );
  const startBalance = getStartBalanceProfile(options);
  const rangeLimit = baseRangeLimit * startBalance.rangeMultiplier;
  const baseSoftOverflowAllowance = Math.max(
    NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_MIN,
    baseRangeLimit * NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_FRACTION
  );
  const softOverflowAllowance =
    baseSoftOverflowAllowance * startBalance.softOverflowMultiplier;
  const values = active.map(getNormalEffectiveREFairnessValue);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const range = Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
  const observedRangeExcess = Math.max(0, range - rangeLimit);
  return {
    medianRegisters: Number(medianRegisters.toFixed(2)),
    medianTurns: Number(medianTurns.toFixed(2)),
    baseRangeLimit: Number(baseRangeLimit.toFixed(3)),
    rangeLimit: Number(rangeLimit.toFixed(3)),
    range: Number(range.toFixed(3)),
    rangeExcess: Number((startBalance.enforced ? observedRangeExcess : 0).toFixed(3)),
    observedRangeExcess: Number(observedRangeExcess.toFixed(3)),
    softOverflowAllowance: Number(softOverflowAllowance.toFixed(3)),
    min: Number.isFinite(min) ? Number(min.toFixed(3)) : null,
    max: Number.isFinite(max) ? Number(max.toFixed(3)) : null,
    startBalance: startBalance.id,
    startBalanceLabel: startBalance.label,
    startBalanceRangeMultiplier: startBalance.rangeMultiplier,
    startBalanceSoftOverflowMultiplier: startBalance.softOverflowMultiplier,
    startBalanceEnforced: startBalance.enforced,
    policy: "best-worst-completed-re-range-start-balance-v49fj"
  };
}

export function getNormalFairnessSoftOverflowAllowance(rangeLimit, options = {}) {
  const startBalance = getStartBalanceProfile(options);
  const multiplier = Math.max(0.0001, Number(startBalance.rangeMultiplier) || 1);
  const baseRangeLimit = Math.max(0, Number(rangeLimit) || 0) / multiplier;
  const baseAllowance = Math.max(
    NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_MIN,
    baseRangeLimit * NORMAL_EFFECTIVE_RE_SOFT_OVERFLOW_FRACTION
  );
  return Number((baseAllowance * startBalance.softOverflowMultiplier).toFixed(3));
}

export function summarizeNormalRetainedREBalance(entries = [], options = {}) {
  const active = (entries || []).filter((entry) =>
    Number.isFinite(getNormalEffectiveREFairnessValue(entry))
  );
  if (!active.length) {
    return {
      count: 0,
      stdDev: 0,
      min: null,
      max: null,
      range: 0,
      worstScoreZ: 0,
      worstScoreIndex: null,
      worstActionZ: 0,
      worstActionIndex: null
    };
  }

  const values = active.map(getNormalEffectiveREFairnessValue);
  let worstScore = { z: -Infinity, index: null };
  let worstAction = { z: -Infinity, index: null };
  active.forEach((entry) => {
    const diagnostics = getNormalStartBalanceDiagnostics(
      entry,
      active,
      "normalFairnessEffectiveRE"
    );
    if (diagnostics.scoreZ > worstScore.z) {
      worstScore = { z: diagnostics.scoreZ, index: entry.index };
    }
    if (diagnostics.actionZ > worstAction.z) {
      worstAction = { z: diagnostics.actionZ, index: entry.index };
    }
  });

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangeTarget = getNormalEffectiveRERangeTarget(active, options);
  return {
    count: active.length,
    stdDev: Number(
      getNormalStartDispersion(
        active,
        "normalFairnessEffectiveRE"
      ).toFixed(3)
    ),
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    range: Number((max - min).toFixed(3)),
    rangeLimit: rangeTarget.rangeLimit,
    rangeExcess: rangeTarget.rangeExcess,
    observedRangeExcess: rangeTarget.observedRangeExcess,
    softOverflowAllowance: rangeTarget.softOverflowAllowance,
    startBalance: rangeTarget.startBalance,
    startBalanceLabel: rangeTarget.startBalanceLabel,
    startBalanceEnforced: rangeTarget.startBalanceEnforced,
    medianRegisters: rangeTarget.medianRegisters,
    medianTurns: rangeTarget.medianTurns,
    worstScoreZ: Number(Math.max(0, worstScore.z).toFixed(2)),
    worstScoreIndex: worstScore.index,
    // Literal register spread is diagnostic/guardrail only. Keep this so Dev
    // View can show it, but it is not an outlier-prune trigger in Normal v49bo.
    worstActionZ: Number(Math.max(0, worstAction.z).toFixed(2)),
    worstActionIndex: worstAction.index
  };
}

export function getNormalRegisterDurationGuardrail(entries = []) {
  const values = (entries || [])
    .map((entry) => Number(
      entry?.normalFairnessRegisterCount ?? entry?.bestActions
    ))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  if (values.length < 2) {
    return {
      active: true,
      violation: false,
      min: values[0] ?? null,
      max: values[0] ?? null,
      range: 0,
      median: values[0] ?? null,
      allowedRange: NORMAL_REGISTER_RANGE_GUARDRAIL_MIN
    };
  }

  const median = medianValue(values);
  const min = values[0];
  const max = values.at(-1);
  const range = max - min;
  const allowedRange = Math.max(
    NORMAL_REGISTER_RANGE_GUARDRAIL_MIN,
    median * NORMAL_REGISTER_RANGE_GUARDRAIL_FRACTION
  );

  return {
    active: true,
    violation: range > allowedRange + 1e-9,
    min,
    max,
    range: Number(range.toFixed(2)),
    median: Number(median.toFixed(2)),
    allowedRange: Number(allowedRange.toFixed(2)),
    policy:
      "course-level-duration-guardrail-only-not-independent-prune-zscore"
  };
}


export function getNormalResidualBalanceSelectionPenalty(entries = [], options = {}) {
  const active = (entries || []).filter((entry) =>
    Number.isFinite(getNormalEffectiveREFairnessValue(entry))
  );
  const rangeTarget = getNormalEffectiveRERangeTarget(active, options);
  if (!active.length) {
    return {
      total: 0,
      range: 0,
      rangeLimit: rangeTarget.rangeLimit,
      rangeExcess: 0,
      rangePenalty: 0,
      softOverflowAllowance: rangeTarget.softOverflowAllowance,
      overflowWithinSoftAllowance: true,
      reDispersion: 0,
      duration: 0,
      outlier: 0,
      reStdDev: 0,
      reStdDevLimit: NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
      medianTurns: rangeTarget.medianTurns,
      durationGuardrail: getNormalRegisterDurationGuardrail(active),
      worstScoreZ: 0
    };
  }

  const reStdDev = getNormalStartDispersion(
    active,
    "normalFairnessEffectiveRE"
  );
  const durationGuardrail = getNormalRegisterDurationGuardrail(active);
  const retained = summarizeNormalRetainedREBalance(active, options);
  const rangePenalty =
    rangeTarget.rangeExcess * NORMAL_EFFECTIVE_RE_SCORE_PER_RE;
  const durationExcess = Math.max(
    0,
    (durationGuardrail.range || 0) -
      (durationGuardrail.allowedRange || 0)
  );
  const duration = durationExcess * 0.75;

  return {
    // Range is the semantic fairness owner. Duration stays a separate
    // course-selection/readability guardrail; SD/z are diagnostics only.
    total: Number((rangePenalty + duration).toFixed(3)),
    range: rangeTarget.range,
    rangeLimit: rangeTarget.rangeLimit,
    rangeExcess: rangeTarget.rangeExcess,
    rangePenalty: Number(rangePenalty.toFixed(3)),
    softOverflowAllowance: rangeTarget.softOverflowAllowance,
    overflowWithinSoftAllowance:
      !rangeTarget.startBalanceEnforced ||
      rangeTarget.observedRangeExcess <= rangeTarget.softOverflowAllowance + 1e-9,
    reDispersion: 0,
    duration: Number(duration.toFixed(3)),
    outlier: 0,
    reStdDev: Number(reStdDev.toFixed(3)),
    reStdDevLimit: NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
    medianTurns: rangeTarget.medianTurns,
    medianRegisters: rangeTarget.medianRegisters,
    durationGuardrail,
    worstScoreZ: retained.worstScoreZ,
    remainingOutlierCount: rankNormalEffectiveREOutliers(
      active,
      NORMAL_EFFECTIVE_RE_OUTLIER_Z
    ).length,
    observedRangeExcess: rangeTarget.observedRangeExcess,
    startBalance: rangeTarget.startBalance,
    startBalanceLabel: rangeTarget.startBalanceLabel,
    startBalanceEnforced: rangeTarget.startBalanceEnforced,
    policy:
      "range-first-length-responsive-start-balance-v49fj; sd-z-diagnostic-only"
  };
}

export function getEconomyEnergyActionableResidualBalanceSelectionPenalty(entries = []) {
  const normalPenalty = getNormalResidualBalanceSelectionPenalty(entries);
  // Starting Energy compensates the same range-first RE imbalance that Normal
  // would otherwise prune. Literal-duration guardrails are not Energy-actionable.
  const actionableTotal = Math.max(
    0,
    Number(normalPenalty.rangePenalty) || 0
  );
  return {
    ...normalPenalty,
    total: Number(actionableTotal.toFixed(3)),
    normalTotal: Number((Number(normalPenalty.total) || 0).toFixed(3)),
    ignoredDuration: Number((Number(normalPenalty.duration) || 0).toFixed(3)),
    durationActionable: false,
    policy: "economy-energy-actionable-range-first-effective-re-v49dx"
  };
}


export function chooseNormalStartBalanceRemoval(entries, playerCount, options = {}) {
  const minimumStarts = Math.max(1, playerCount || 1);
  if (entries.length <= minimumStarts) return null;

  const active = entries.filter((entry) =>
    Number.isFinite(getNormalEffectiveREFairnessValue(entry))
  );
  if (active.length <= minimumStarts) return null;

  const currentRange = getNormalEffectiveRERangeTarget(active, options);
  if (!(currentRange.rangeExcess > 1e-9)) {
    return null;
  }
  const currentStdDev = getNormalStartDispersion(
    active,
    "normalFairnessEffectiveRE"
  );
  const currentOutlierIndices = new Set(
    rankNormalEffectiveREOutliers(
      active,
      NORMAL_EFFECTIVE_RE_OUTLIER_Z
    ).map((item) => item.entry.index)
  );

  const candidates = active.map((entry) => {
    const retained = active.filter((item) => item.index !== entry.index);
    if (retained.length < minimumStarts) return null;

    const afterRange = getNormalEffectiveRERangeTarget(retained, options);
    const afterStdDev = getNormalStartDispersion(
      retained,
      "normalFairnessEffectiveRE"
    );
    const diagnostics = getNormalStartBalanceDiagnostics(
      entry,
      active,
      "normalFairnessEffectiveRE"
    );
    const value = getNormalEffectiveREFairnessValue(entry);
    const atRangeEdge =
      Math.abs(value - currentRange.min) <= 1e-9 ||
      Math.abs(value - currentRange.max) <= 1e-9;
    return {
      entry,
      retained,
      afterRange,
      afterStdDev,
      diagnostics,
      isOutlier: currentOutlierIndices.has(entry.index),
      atRangeEdge,
      rangeExcessImprovement:
        currentRange.rangeExcess - afterRange.rangeExcess,
      rawRangeImprovement: currentRange.range - afterRange.range,
      stdDevImprovement: currentStdDev - afterStdDev
    };
  }).filter(Boolean);

  if (!candidates.length) return null;

  candidates.sort((left, right) => (
    // Range owns pruning. SD only chooses direction/ties among removals that
    // address the current best↔worst gap.
    right.rangeExcessImprovement - left.rangeExcessImprovement ||
    right.rawRangeImprovement - left.rawRangeImprovement ||
    Number(right.atRangeEdge) - Number(left.atRangeEdge) ||
    right.stdDevImprovement - left.stdDevImprovement ||
    Number(right.isOutlier) - Number(left.isOutlier) ||
    Math.abs(right.diagnostics.scoreDelta) -
      Math.abs(left.diagnostics.scoreDelta) ||
    left.entry.index - right.entry.index
  ));

  const selected = candidates[0];
  const materiallyImprovesRange =
    selected.rangeExcessImprovement > 0.025 ||
    selected.rawRangeImprovement > 0.025;
  const peelsDuplicateRangeEdge =
    selected.atRangeEdge &&
    selected.stdDevImprovement > 0.025 &&
    currentRange.rangeExcess > 0.025;
  if (!(materiallyImprovesRange || peelsDuplicateRangeEdge)) {
    return null;
  }

  return {
    index: selected.entry.index,
    score: getNormalEffectiveREFairnessValue(selected.entry),
    actions:
      selected.entry.normalFairnessRegisterCount ??
      selected.entry.bestActions,
    balanceDispersionPruned: false,
    effectiveREPruned: true,
    rangePruned: true,
    isRobustOutlier: selected.isOutlier,
    scoreZ: selected.diagnostics.scoreZ,
    actionZ: selected.diagnostics.actionZ,
    scoreDelta: selected.diagnostics.scoreDelta,
    actionDelta: selected.diagnostics.actionDelta,
    balanceStdDevBefore: currentStdDev,
    balanceStdDevAfterEstimate: selected.afterStdDev,
    balanceStdDevLimit: NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT,
    rangeBefore: currentRange.range,
    rangeAfterEstimate: selected.afterRange.range,
    rangeLimit: currentRange.rangeLimit,
    rangeExcessBefore: currentRange.rangeExcess,
    rangeExcessAfterEstimate: selected.afterRange.rangeExcess,
    medianTurns: currentRange.medianTurns,
    residualPenaltyBefore:
      currentRange.rangeExcess * NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
    residualPenaltyAfterEstimate:
      selected.afterRange.rangeExcess * NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
    removalImprovement: Number(
      Math.max(
        selected.rangeExcessImprovement,
        selected.rawRangeImprovement
      ).toFixed(3)
    ),
    removalPolicy: "range-first-effective-re-length-responsive-v49dx"
  };
}

export function chooseNormalStartFinalTailCleanup(entries, playerCount) {
  const minimumStarts = Math.max(1, playerCount || 1);
  if (entries.length <= minimumStarts || entries.length < 3) {
    return null;
  }

  const scoreValues = entries
    .map((entry) => Number(entry.balanceScore))
    .filter(Number.isFinite);
  if (scoreValues.length !== entries.length) return null;

  const center = averageValues(scoreValues);
  const currentStdDev = getNormalStartDispersion(entries, "balanceScore");
  if (!(currentStdDev > 1e-9)) return null;
  const minimumScoreDelta = Math.max(6, currentStdDev * 0.8, Math.abs(center) * 0.02);

  const candidates = entries
    .map((entry) => {
      const scoreDelta = Number(entry.balanceScore) - center;
      const ordinaryScoreZ = Math.abs(scoreDelta) / currentStdDev;
      const retained = entries.filter((item) => item.index !== entry.index);
      return {
        entry,
        scoreDelta,
        ordinaryScoreZ,
        afterStdDev: getNormalStartDispersion(retained, "balanceScore")
      };
    })
    .filter((candidate) => (
      candidate.ordinaryScoreZ >= NORMAL_FINAL_TAIL_CLEANUP_Z &&
      Math.abs(candidate.scoreDelta) >= minimumScoreDelta &&
      candidate.afterStdDev < currentStdDev - 0.01
    ))
    .sort((left, right) => (
      right.ordinaryScoreZ - left.ordinaryScoreZ ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));

  const selected = candidates[0];
  if (!selected) return null;
  const robustDiagnostics = getNormalStartBalanceDiagnostics(
    selected.entry,
    entries,
    "balanceScore"
  );
  return {
    index: selected.entry.index,
    score: selected.entry.balanceScore,
    actions: selected.entry.bestActions,
    balanceDispersionPruned: false,
    finalTailCleanupPruned: true,
    scoreZ: robustDiagnostics.scoreZ,
    actionZ: robustDiagnostics.actionZ,
    scoreDelta: selected.scoreDelta,
    actionDelta: robustDiagnostics.actionDelta,
    ordinaryScoreZ: selected.ordinaryScoreZ,
    balanceStdDevBefore: currentStdDev,
    balanceStdDevAfterEstimate: selected.afterStdDev,
    balanceStdDevLimit: getNormalStartFairnessStdDevLimit(entries.length, playerCount)
  };
}

export function adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, options = {}) {
  const analysisOptions = {
    ...getRouteAnalysisVariantOptions(options),
    openingTrafficOnly: options.balanceTrafficScope !== "full",
    balanceTrafficScope: options.balanceTrafficScope,
    skipTraffic: Boolean(options.skipTraffic)
  };
  const prePrunedOutliers = (firstLeg.summary.outliers || []).filter(
    (item) => item.reasons?.lightweightPruned
  );
  const initialExcludedIndices = new Set(
    prePrunedOutliers.map((item) => item.index)
  );
  const initialActive = getActivePruningStarts(
    firstLeg,
    initialExcludedIndices
  );
  const initialStdDev = getNormalStartDispersion(
    initialActive,
    "normalFairnessEffectiveRE"
  );
  const maximumNormalPasses = Math.max(
    0,
    initialActive.length - Math.max(1, playerCount || 1)
  );

  // Normal uses iterative full-course balancing, not player-count trimming. Traffic
  // is recomputed once per small batch; player count is a floor, never a target,
  // and surplus starts use the same static fairness target.
  const balancingResult = options.cooperativeStartBalanceBoundary
    ? runIterativeStartBalancingCooperative(
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
        maxPasses: maximumNormalPasses,
        pruneBatchSize: options.normalPruneBatchSize ?? getNormalStartPruneBatchSize
      },
      options.cooperativeStartBalanceBoundary
    )
    : runIterativeStartBalancing(
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
        maxPasses: maximumNormalPasses,
        pruneBatchSize: options.normalPruneBatchSize ?? getNormalStartPruneBatchSize
      }
    );

  return mapMaybePromise(balancingResult, (result) => {
  let currentFirstLeg = result.currentFirstLeg;
  let excludedIndices = result.excludedIndices;
  let removals = [...result.removals];
  const playerFloor = Math.max(1, playerCount || 1);
  const postBalanceActive = getActivePruningStarts(
    currentFirstLeg,
    excludedIndices
  );

  // v49bo: the old final score-tail cleanup is disabled for Normal. It could
  // remove a start solely because it sat at the literal-score tail even when its
  // completed-route RE was a legitimate tradeoff. True RE outliers are handled
  // in the main iterative pass; remaining dispersion becomes a reject signal,
  // not an excuse to keep shaving the field.
  const tailPassOffset = removals.reduce(
    (highest, removal) => Math.max(highest, Number(removal.pass) || 0),
    0
  );
  const tailResultOrPromise = null;

  return mapMaybePromise(tailResultOrPromise, (tailResult) => {
  if (tailResult?.removals.length) {
    currentFirstLeg = tailResult.currentFirstLeg;
    excludedIndices = tailResult.excludedIndices;
    removals = [
      ...removals,
      ...tailResult.removals.map((removal) => ({
        ...removal,
        pass: tailPassOffset + (Number(removal.pass) || 1)
      }))
    ];
  }

  const remainingActive = getActivePruningStarts(
    currentFirstLeg,
    excludedIndices
  );
  const remainingOutliers = rankNormalEffectiveREOutliers(
    remainingActive,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  const remainingStdDev = getNormalStartDispersion(
    remainingActive,
    "normalFairnessEffectiveRE"
  );
  const retainedBalance = summarizeNormalRetainedREBalance(remainingActive, options);
  const durationGuardrail = getNormalRegisterDurationGuardrail(remainingActive);
  const legacyAdjustedScoreStdDev = Number(currentFirstLeg.summary?.scoreStdDev);
  const badLimit = Math.ceil((playerCount || 1) * 0.25);

  const pressureRemovals = removals.map((removed, removalIndex) => {
    const actualStdDevAfter = removalIndex + 1 < removals.length
      ? removals[removalIndex + 1].balanceStdDevBefore
      : remainingStdDev;
    return {
      index: removed.index,
      score: removed.score,
      actions: removed.actions,
      pass: removed.pass,
      diagnostics: {
        normalBalancePruned: true,
        balanceDispersionPruned: Boolean(removed.balanceDispersionPruned),
        finalTailCleanupPruned: Boolean(removed.finalTailCleanupPruned),
        stage: "iterative-effective-re-range-first",
        scoreZ: Number((removed.scoreZ ?? 0).toFixed(2)),
        ordinaryScoreZ: Number.isFinite(Number(removed.ordinaryScoreZ))
          ? Number(Number(removed.ordinaryScoreZ).toFixed(2))
          : null,
        actionZ: Number((removed.actionZ ?? 0).toFixed(2)),
        scoreDelta: Number((removed.scoreDelta ?? 0).toFixed(2)),
        actionDelta: Number((removed.actionDelta ?? 0).toFixed(2)),
        balanceStdDevBefore: Number((removed.balanceStdDevBefore ?? 0).toFixed(2)),
        balanceStdDevAfter: Number((actualStdDevAfter ?? 0).toFixed(2)),
        balanceStdDevAfterEstimate: Number((removed.balanceStdDevAfterEstimate ?? 0).toFixed(2)),
        balanceStdDevLimit: Number((removed.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT).toFixed(2)),
        rangeBefore: Number((removed.rangeBefore ?? 0).toFixed(2)),
        rangeAfterEstimate: Number((removed.rangeAfterEstimate ?? 0).toFixed(2)),
        rangeLimit: Number((removed.rangeLimit ?? 0).toFixed(2)),
        rangeExcessBefore: Number((removed.rangeExcessBefore ?? 0).toFixed(2)),
        rangeExcessAfterEstimate: Number((removed.rangeExcessAfterEstimate ?? 0).toFixed(2)),
        medianTurns: Number((removed.medianTurns ?? 0).toFixed(2)),
        removalReason: "removed to reduce the length-responsive best-worst completed-RE range; SD/z only chose direction/ties; never prune below player count",
        totalCourseLength: Number((totalLength || 0).toFixed(2)),
        totalCourseActions: Number(
          (options.totalActions || 0).toFixed(2)
        )
      }
    };
  });

  // v49bp: player count is the minimum viable retained field, not a balance
  // target. Residual imbalance at or above that floor is a course-selection
  // penalty, never a Normal analyzer rejection.
  const finalBalanceStdDevLimit =
    NORMAL_EFFECTIVE_RE_FAIRNESS_STDDEV_LIMIT;
  const playerFloor = Math.max(1, playerCount || 1);
  const belowPlayerFloor = remainingActive.length < playerFloor;
  const residualBalancePenalty = getNormalResidualBalanceSelectionPenalty(
    remainingActive,
    options
  );
  const floorReached = remainingActive.length === playerFloor;
  const provisionalReject = belowPlayerFloor;
  const shouldReject = belowPlayerFloor;

  const activeScores = remainingActive
    .map((entry) => entry.normalFairnessEffectiveRE)
    .filter(Number.isFinite);
  const meanScore = activeScores.length
    ? averageValues(activeScores)
    : 0;

  const lateOutliers = pressureRemovals.map((removal) => ({
    index: removal.index,
    score: removal.score,
    delta: Number((removal.score - meanScore).toFixed(2)),
    actionDelta: Number((removal.actions ?? 0).toFixed(2)),
    reasons: removal.diagnostics
  }));
  const allOutliers = [
    ...prePrunedOutliers,
    ...lateOutliers
  ];

  return {
    ...currentFirstLeg,
    summary: {
      ...currentFirstLeg.summary,
      // v49bo: Normal fairness is completed-route effective RE. Keep the
      // legacy score-space spread separately for audit; do not mix its units
      // into the pruning decision.
      scoreStdDev: Number(remainingStdDev.toFixed(3)),
      fairnessScore: Number(Math.max(
        0,
        100 - (
          retainedBalance.rangeLimit > 1e-9
            ? (retainedBalance.range / retainedBalance.rangeLimit) * 35
            : 0
        )
      ).toFixed(2)),
      outliers: allOutliers,
      normalStartBalance: {
        active: true,
        staged: true,
        iterative: true,
        intrinsicPrePruning: Boolean(
          firstLeg.summary.lightweightStartPruning?.active
        ),
        contextualLegRoutes: Boolean(
          firstLeg.summary.contextualLegRoutes
        ),
        lightweightPruned: prePrunedOutliers.map(
          (item) => item.index
        ),
        pressurePruned: pressureRemovals,
        dispersionPruned: pressureRemovals
          .filter((item) => item.diagnostics?.balanceDispersionPruned)
          .map((item) => item.index),
        finalTailCleanupPruned: [],
        finalTailCleanupThresholdZ: null,
        trafficRecomputations: options.skipTraffic
          ? 0
          : new Set(pressureRemovals.map((item) => item.pass)).size + (initialExcludedIndices.size ? 1 : 0),
        pruneBatchSize: options.normalPruneBatchSize ?? NORMAL_PRUNE_BATCH_SIZE,
        pruneBatchPolicy: options.normalPruneBatchSize !== null &&
          options.normalPruneBatchSize !== undefined &&
          Number.isFinite(Number(options.normalPruneBatchSize))
          ? "fixed"
          : "adaptive-2-above-2x-players-else-1",
        balanceStdDevBefore: Number(initialStdDev.toFixed(2)),
        balanceStdDevAfter: Number(remainingStdDev.toFixed(2)),
        balanceStdDevLimit: finalBalanceStdDevLimit,
        retainedCount: retainedBalance.count,
        retainedScoreMin: retainedBalance.min,
        retainedScoreMax: retainedBalance.max,
        retainedScoreRange: retainedBalance.range,
        retainedEffectiveREMin: retainedBalance.min,
        retainedEffectiveREMax: retainedBalance.max,
        retainedEffectiveRERange: retainedBalance.range,
        retainedEffectiveRERangeLimit: retainedBalance.rangeLimit,
        retainedEffectiveRERangeExcess: retainedBalance.rangeExcess,
        fairnessMedianRegisters: retainedBalance.medianRegisters,
        fairnessMedianTurns: retainedBalance.medianTurns,
        worstRemainingScoreZ: retainedBalance.worstScoreZ,
        worstRemainingScoreIndex: retainedBalance.worstScoreIndex,
        worstRemainingActionZ: retainedBalance.worstActionZ,
        worstRemainingActionIndex: retainedBalance.worstActionIndex,
        legacyAdjustedScoreStdDev: Number.isFinite(legacyAdjustedScoreStdDev)
          ? Number(legacyAdjustedScoreStdDev.toFixed(2))
          : null,
        fairnessMetric: "full-course-effective-RE",
        fairnessModel: "range-first-length-responsive-start-balance-v49fj",
        startBalance: normalizeStartBalance(options.startBalance),
        startBalanceLabel: formatStartBalanceLabel(options.startBalance),
        startBalanceEnforced: getStartBalanceProfile(options).enforced,
        actionPruningActive: false,
        dispersionPruningActive: false,
        rangePruningActive: getStartBalanceProfile(options).enforced,
        durationGuardrail,
        playerFloor,
        floorReached,
        belowPlayerFloor,
        residualSelectionPenalty: residualBalancePenalty.total,
        residualSelectionPenaltyComponents: residualBalancePenalty,
        residualImbalanceFeedsCourseScorer: true,
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          score: item.score,
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        badLimit,
        provisionalReject,
        reject: shouldReject
      }
    }
  };
  });
  });
}

export function isCourseReachableStartAnalysis(startAnalysis) {
  if (!startAnalysis?.reachable) return false;
  // Once contextual full-course fields exist, an opening-only route is not
  // enough to call the start reachable or usable for the generated course.
  if (Object.prototype.hasOwnProperty.call(startAnalysis, "fullCourseRoute")) {
    return Boolean(startAnalysis.fullCourseRoute);
  }
  return true;
}

export function computeCourseReachableStarts(firstLeg) {
  return (firstLeg?.starts ?? []).filter(isCourseReachableStartAnalysis);
}

export function computeUsableStarts(firstLeg, preferences = {}) {
  const courseReachable = computeCourseReachableStarts(firstLeg);
  if (preferences.competitiveMode) {
    const selectedIndices = firstLeg?.summary?.competitiveStartBalance?.selectedIndices ?? [];
    if (selectedIndices.length) {
      const selectedSet = new Set(selectedIndices);
      return courseReachable.filter((startAnalysis) => selectedSet.has(startAnalysis.index));
    }
    return courseReachable;
  }
  if (preferences.virtualBots) {
    return courseReachable;
  }

  const outlierSet = new Set((firstLeg.summary.outliers ?? []).map((item) => item.index));
  return courseReachable.filter((startAnalysis) => !outlierSet.has(startAnalysis.index));
}
