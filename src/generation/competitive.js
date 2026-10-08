// Robo Rally Course Randomizer - Competitive mode: difficulty calibration, effective-RE range target and strategic blocking
import { recomputeFirstLegPressure } from "../../analyze.js";
import {
  COMPETITIVE_EFFECTIVE_RE_HARD_RANGE_MULTIPLIER,
  COMPETITIVE_EFFECTIVE_RE_RANGE_MIN,
  COMPETITIVE_EFFECTIVE_RE_RANGE_PER_TURN,
  FULL_START_OUTLIER_Z,
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  NORMAL_EFFECTIVE_RE_SCORE_PER_RE,
  NORMAL_FULL_COURSE_TRAFFIC_PASSES,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
} from "./config.js";
import {
  computeCourseReachableStarts,
  getActivePruningStarts,
  getRobustOutlierStats,
  getStartBalanceProfile,
  medianValue,
  rankNormalEffectiveREOutliers,
  summarizeNormalRetainedREBalance
} from "./start-balance.js";
import { getRouteAnalysisVariantOptions } from "./variant-availability.js";

// v49ec: Competitive difficulty calibration stays mode-specific, but all
// evidence is RE-native. Easy asks for a tighter post-block range and more
// legible completed-RE block decisions. Higher difficulties tolerate more
// strategic ambiguity. `any` keeps the baseline range and no legibility penalty.
export function getCompetitiveDifficultyCalibration(preferences = {}) {
  const requested = String(preferences.difficulty ?? "any");
  const byDifficulty = {
    easy: {
      softRangeMultiplier: 0.85,
      hardRangeMultiplier: 0.90,
      meanBlockChallengeTarget: 0.42,
      maxBlockChallengeTarget: 0.72,
      meanChallengePenaltyWeight: 18,
      maxChallengePenaltyWeight: 7
    },
    moderate: {
      softRangeMultiplier: 1,
      hardRangeMultiplier: 1,
      meanBlockChallengeTarget: 0.58,
      maxBlockChallengeTarget: 0.82,
      meanChallengePenaltyWeight: 12,
      maxChallengePenaltyWeight: 4
    },
    hard: {
      softRangeMultiplier: 1,
      hardRangeMultiplier: 1,
      meanBlockChallengeTarget: 0.72,
      maxBlockChallengeTarget: 0.92,
      meanChallengePenaltyWeight: 7,
      maxChallengePenaltyWeight: 2
    },
    brutal: {
      softRangeMultiplier: 1,
      hardRangeMultiplier: 1,
      meanBlockChallengeTarget: 0.82,
      maxBlockChallengeTarget: 1,
      meanChallengePenaltyWeight: 3,
      maxChallengePenaltyWeight: 0
    },
    any: {
      softRangeMultiplier: 1,
      hardRangeMultiplier: 1,
      meanBlockChallengeTarget: 1,
      maxBlockChallengeTarget: 1,
      meanChallengePenaltyWeight: 0,
      maxChallengePenaltyWeight: 0
    }
  };
  const profile = byDifficulty[requested] ?? byDifficulty.moderate;
  return {
    requestedDifficulty: requested,
    ...profile
  };
}

export function summarizeCompetitiveBlockReadability(
  blockSequence = [],
  calibration = getCompetitiveDifficultyCalibration()
) {
  const challenges = (blockSequence || [])
    .map((entry) => Number(entry?.strategicChallenge))
    .filter(Number.isFinite);
  const meanBlockChallenge = challenges.length
    ? challenges.reduce((sum, value) => sum + value, 0) / challenges.length
    : 0;
  const maxBlockChallenge = challenges.length ? Math.max(...challenges) : 0;
  const meanExcess = Math.max(
    0,
    meanBlockChallenge - Number(calibration.meanBlockChallengeTarget || 0)
  );
  const maxExcess = Math.max(
    0,
    maxBlockChallenge - Number(calibration.maxBlockChallengeTarget || 0)
  );
  const penalty =
    meanExcess * Number(calibration.meanChallengePenaltyWeight || 0) +
    maxExcess * Number(calibration.maxChallengePenaltyWeight || 0);
  return {
    meanBlockChallenge: Number(meanBlockChallenge.toFixed(3)),
    maxBlockChallenge: Number(maxBlockChallenge.toFixed(3)),
    meanBlockChallengeTarget: calibration.meanBlockChallengeTarget,
    maxBlockChallengeTarget: calibration.maxBlockChallengeTarget,
    fitPenalty: Number(penalty.toFixed(3)),
    requestedDifficulty: calibration.requestedDifficulty,
    evidenceOwner: "completed-effective-re-decision-margin-and-advantage",
    legacyShadowUsed: false,
    model: "competitive-re-native-legibility-v49ec"
  };
}

export function getCompetitiveEffectiveRERangeTarget(
  entries = [],
  calibration = getCompetitiveDifficultyCalibration(),
  options = {}
) {
  const active = (entries || []).filter((entry) => (
    Number.isFinite(entry?.normalFairnessEffectiveRE)
  ));
  const registerCounts = active
    .map((entry) => Number(
      entry?.normalFairnessRegisterCount ?? entry?.bestActions
    ))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const medianRegisters = registerCounts.length ? medianValue(registerCounts) : 0;
  const medianTurns = Math.max(1, medianRegisters / 5);
  const baseRangeLimit = Math.max(
    COMPETITIVE_EFFECTIVE_RE_RANGE_MIN,
    medianTurns * COMPETITIVE_EFFECTIVE_RE_RANGE_PER_TURN
  );
  const startBalance = getStartBalanceProfile(options);
  const difficultySoftRangeLimit =
    baseRangeLimit * Number(calibration.softRangeMultiplier ?? 1);
  const difficultyHardRangeLimit =
    baseRangeLimit * COMPETITIVE_EFFECTIVE_RE_HARD_RANGE_MULTIPLIER *
    Number(calibration.hardRangeMultiplier ?? 1);
  const softRangeLimit = difficultySoftRangeLimit * startBalance.rangeMultiplier;
  const hardRangeLimit = difficultyHardRangeLimit * startBalance.rangeMultiplier;
  const values = active.map((entry) => Number(entry.normalFairnessEffectiveRE));
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const range = Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
  const observedSoftExcess = Math.max(0, range - softRangeLimit);
  const observedHardExcess = Math.max(0, range - hardRangeLimit);
  return {
    medianRegisters: Number(medianRegisters.toFixed(2)),
    medianTurns: Number(medianTurns.toFixed(2)),
    baseRangeLimit: Number(baseRangeLimit.toFixed(3)),
    difficultySoftRangeLimit: Number(difficultySoftRangeLimit.toFixed(3)),
    difficultyHardRangeLimit: Number(difficultyHardRangeLimit.toFixed(3)),
    softRangeLimit: Number(softRangeLimit.toFixed(3)),
    hardRangeLimit: Number(hardRangeLimit.toFixed(3)),
    range: Number(range.toFixed(3)),
    rangeExcess: Number((startBalance.enforced ? observedSoftExcess : 0).toFixed(3)),
    hardRangeExcess: Number((startBalance.enforced ? observedHardExcess : 0).toFixed(3)),
    observedRangeExcess: Number(observedSoftExcess.toFixed(3)),
    observedHardRangeExcess: Number(observedHardExcess.toFixed(3)),
    minRE: Number.isFinite(min) ? Number(min.toFixed(3)) : null,
    maxRE: Number.isFinite(max) ? Number(max.toFixed(3)) : null,
    requestedDifficulty: calibration.requestedDifficulty,
    startBalance: startBalance.id,
    startBalanceLabel: startBalance.label,
    startBalanceRangeMultiplier: startBalance.rangeMultiplier,
    startBalanceEnforced: startBalance.enforced,
    policy: "competitive-post-block-best-p-start-balance-v49fj"
  };
}

export function getCompetitiveBalanceProfile(
  entries = [],
  calibration = getCompetitiveDifficultyCalibration(),
  options = {}
) {
  const active = (entries || []).filter((entry) => (
    Number.isFinite(entry?.normalFairnessEffectiveRE)
  ));
  const retained = summarizeNormalRetainedREBalance(active);
  const softOutliers = rankNormalEffectiveREOutliers(
    active,
    FULL_START_OUTLIER_Z
  );
  const rangePolicy = getCompetitiveEffectiveRERangeTarget(active, calibration, options);
  return {
    outliers: softOutliers,
    softOutliers,
    stdDev: retained.stdDev,
    scoreRange: retained.range,
    selectedRangeRE: rangePolicy.range,
    softRangeLimit: rangePolicy.softRangeLimit,
    hardRangeLimit: rangePolicy.hardRangeLimit,
    rangeExcess: rangePolicy.rangeExcess,
    hardRangeExcess: rangePolicy.hardRangeExcess,
    medianRegisters: rangePolicy.medianRegisters,
    medianTurns: rangePolicy.medianTurns,
    minRE: rangePolicy.minRE,
    maxRE: rangePolicy.maxRE,
    worstScoreZ: retained.worstScoreZ,
    worstScoreIndex: retained.worstScoreIndex,
    // SD/z/register spread remain diagnostic only. Competitive production
    // acceptance is the best↔worst completed-RE range of the post-block best-P set.
    worstActionZ: retained.worstActionZ,
    worstActionIndex: retained.worstActionIndex,
    metric: "full-course-effective-RE-range",
    rangePolicy
  };
}

export function getCompetitiveStrategicDifficulty(
  blockSequence = [],
  selectedRangeRE = 0,
  balanceRangeLimit = COMPETITIVE_EFFECTIVE_RE_RANGE_MIN
) {
  const challenges = (blockSequence || [])
    .map((entry) => Number(entry?.strategicChallenge))
    .filter(Number.isFinite);
  const meanBlockChallenge = challenges.length
    ? challenges.reduce((sum, value) => sum + value, 0) / challenges.length
    : 0.5;
  const selectionAmbiguity = Math.max(
    0,
    Math.min(
      1,
      1 - (Number(selectedRangeRE) || 0) /
        Math.max(0.001, Number(balanceRangeLimit) || COMPETITIVE_EFFECTIVE_RE_RANGE_MIN)
    )
  );

  // Keep the existing bounded Competitive strategic/setup burden, but derive it
  // entirely from completed-RE block ambiguity and the closeness of the final
  // best-P field. Legacy score-space readability is no longer consulted.
  const difficulty = Math.max(
    1.2,
    Math.min(
      2.4,
      1.8 + (meanBlockChallenge - 0.5) * 0.9 + (selectionAmbiguity - 0.5) * 0.3
    )
  );
  return {
    difficulty: Number(difficulty.toFixed(2)),
    meanBlockChallenge: Number(meanBlockChallenge.toFixed(3)),
    selectionAmbiguity: Number(selectionAmbiguity.toFixed(3)),
    calibrationCenter: 1.8,
    calibrationRange: [1.2, 2.4],
    evidenceOwner: "completed-effective-re-only",
    provisional: true
  };
}


export function getCompetitiveIntendedChoiceSetCount(playerCount = 4) {
  // v49cp corrected observational ownership target: after n_players strategic
  // blocks, Competitive judges the next-best n_players remaining starts. This
  // matches production set cardinality; the ownership audit compares only the
  // ranking/score owner and traffic scope, not a different choice-set size.
  return Math.max(1, Math.floor(Number(playerCount) || 1));
}

export function chooseCompetitiveCompletedREBlock(entries = []) {
  const active = (entries || []).filter((entry) => (
    Number.isFinite(entry?.normalFairnessEffectiveRE)
  ));
  if (!active.length) return null;

  const ordered = [...active].sort((left, right) => (
    left.normalFairnessEffectiveRE - right.normalFairnessEffectiveRE ||
    (left.normalFairnessRegisterCount ?? left.bestActions ?? Infinity) -
      (right.normalFairnessRegisterCount ?? right.bestActions ?? Infinity) ||
    left.index - right.index
  ));
  const chosen = ordered[0];
  const runnerUp = ordered[1] ?? null;
  const stats = getRobustOutlierStats(active, "normalFairnessEffectiveRE");
  const robustScale = Math.max(0.01, Number(stats.robustScale) || 0.01);
  const advantageVsMedian = Math.max(
    0,
    Number(stats.center) - Number(chosen.normalFairnessEffectiveRE)
  );
  const decisionMargin = runnerUp
    ? Math.max(
      0,
      Number(runnerUp.normalFairnessEffectiveRE) -
        Number(chosen.normalFairnessEffectiveRE)
    )
    : 0;
  const advantageZ = advantageVsMedian / robustScale;
  const decisionMarginZ = decisionMargin / robustScale;
  const ambiguity = 1 - Math.min(1, decisionMarginZ / 1.25);
  const consequence = Math.min(1, advantageZ / 1.5);
  const strategicChallenge = ambiguity * (0.55 + 0.45 * consequence);
  const effectiveRE = Number(chosen.normalFairnessEffectiveRE);

  return {
    index: chosen.index,
    // Keep `score` as an alias for generic downstream/debug formatting, but the
    // production Competitive score owner is now explicitly RE.
    score: Number(effectiveRE.toFixed(3)),
    scoreUnit: "RE",
    effectiveRE: Number(effectiveRE.toFixed(3)),
    actions: chosen.normalFairnessRegisterCount ?? chosen.bestActions,
    intrinsic: Number(chosen.fullCourseRoute?.score),
    traffic: Number(chosen.fullCourseTrafficPenalty ?? 0),
    runnerUpIndex: runnerUp?.index ?? null,
    runnerUpScore: Number.isFinite(runnerUp?.normalFairnessEffectiveRE)
      ? Number(runnerUp.normalFairnessEffectiveRE.toFixed(3))
      : null,
    runnerUpEffectiveRE: Number.isFinite(runnerUp?.normalFairnessEffectiveRE)
      ? Number(runnerUp.normalFairnessEffectiveRE.toFixed(3))
      : null,
    advantageVsMedian: Number(advantageVsMedian.toFixed(3)),
    advantageVsMedianRE: Number(advantageVsMedian.toFixed(3)),
    advantageZ: Number(advantageZ.toFixed(3)),
    decisionMargin: Number(decisionMargin.toFixed(3)),
    decisionMarginRE: Number(decisionMargin.toFixed(3)),
    decisionMarginZ: Number(decisionMarginZ.toFixed(3)),
    ambiguity: Number(ambiguity.toFixed(3)),
    consequence: Number(consequence.toFixed(3)),
    strategicChallenge: Number(strategicChallenge.toFixed(3))
  };
}

export function buildCompetitiveEffectiveREOccupancyQualityMap(
  firstLeg,
  excludedIndices = []
) {
  const excluded = new Set(excludedIndices || []);
  return new Map((firstLeg?.starts || [])
    .filter((entry) => (
      entry?.reachable &&
      entry?.fullCourseRoute &&
      !excluded.has(entry.index)
    ))
    .map((entry) => {
      const effectiveRE = Number(entry.normalFairnessEffectiveRE);
      if (Number.isFinite(effectiveRE)) {
        // Occupancy's common-field temperature is historically calibrated in
        // score units (minimum 6). Convert completed RE back through the stable
        // 6.4 bridge so ownership changes without silently flattening demand.
        return [entry.index, effectiveRE * NORMAL_EFFECTIVE_RE_SCORE_PER_RE];
      }
      const fallback = Number(entry.balanceScore);
      return [entry.index, Number.isFinite(fallback) ? fallback : Infinity];
    }));
}

export function selectCompetitiveBestStartsByEffectiveRE(entries = [], count = 4) {
  const target = Math.max(1, Math.floor(Number(count) || 1));
  return [...(entries || [])]
    .filter((entry) => Number.isFinite(entry?.normalFairnessEffectiveRE))
    .sort((left, right) => (
      left.normalFairnessEffectiveRE - right.normalFairnessEffectiveRE ||
      (left.normalFairnessRegisterCount ?? left.bestActions ?? Infinity) -
        (right.normalFairnessRegisterCount ?? right.bestActions ?? Infinity) ||
      left.index - right.index
    ))
    .slice(0, target);
}

export function summarizeCompetitiveCompletedREChoiceSet(entries = []) {
  const balance = summarizeNormalRetainedREBalance(entries);
  const outliers = rankNormalEffectiveREOutliers(
    entries,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  return {
    count: entries.length,
    stdDev: Number(balance.stdDev.toFixed(3)),
    minRE: Number.isFinite(balance.min) ? Number(balance.min.toFixed(3)) : null,
    maxRE: Number.isFinite(balance.max) ? Number(balance.max.toFixed(3)) : null,
    rangeRE: Number.isFinite(balance.range) ? Number(balance.range.toFixed(3)) : null,
    outlierCount: outliers.length,
    outlierIndices: outliers.map((item) => item.entry.index)
  };
}

export function applyCompetitiveStrategicBlocking(
  firstLeg,
  tileMap,
  playerCount = 4,
  options = {}
) {
  const count = Math.max(1, Math.floor(Number(playerCount) || 1));
  const competitiveCalibration = getCompetitiveDifficultyCalibration(options);
  const requiredOfferedStarts = count * 2;
  const sourceStartCount = firstLeg?.starts?.length ?? 0;
  const routedStarts = computeCourseReachableStarts(firstLeg);
  const routedIndexSet = new Set(routedStarts.map((entry) => entry.index));
  const unavailableIndices = (firstLeg?.starts || [])
    .map((entry) => entry.index)
    .filter((index) => !routedIndexSet.has(index))
    .sort((left, right) => left - right);

  let currentFirstLeg = {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      // Simulated player blocks are never rendered as generator-pruned starts.
      outliers: []
    }
  };
  const excludedIndices = new Set();
  const blockSequence = [];
  const desiredBlockCount = Math.min(
    count,
    Math.max(0, routedStarts.length - count)
  );
  const recomputeTraffic = !options.skipTraffic;
  const blockTrafficScope = "full";
  const sharedPressureOptions = {
    ...getRouteAnalysisVariantOptions(options),
    playerCount: count,
    trafficOccupancyUseBalanceScore: false,
    carryOccupancyScores: true,
    fullCourseTrafficPasses:
      options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
    contextualTrafficAlternateMinGain:
      options.contextualTrafficAlternateMinGain ?? NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
  };
  const blockPressureOptions = {
    ...sharedPressureOptions,
    openingTrafficOnly: false,
    balanceTrafficScope: "full"
  };
  const getBlockPressureOptions = (field, excluded = []) => ({
    ...blockPressureOptions,
    excludedIndices: excluded,
    occupancyQualityScoreByIndex:
      buildCompetitiveEffectiveREOccupancyQualityMap(field, excluded)
  });

  let trafficRecomputations = 0;
  if (recomputeTraffic) {
    // Establish the full traffic-aware field before the first player block.
    currentFirstLeg = recomputeFirstLegPressure(
      tileMap,
      currentFirstLeg,
      getBlockPressureOptions(currentFirstLeg, [])
    );
    trafficRecomputations += 1;
  }

  // Authoritative Competitive simulation: players block the currently best
  // completed-RE start ONE AT A TIME. After each block, traffic/occupancy is
  // recomputed before the next player decides which start is now best.
  for (let blockIndex = 0; blockIndex < desiredBlockCount; blockIndex += 1) {
    const activeStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
    if (activeStarts.length <= count) break;
    const block = chooseCompetitiveCompletedREBlock(activeStarts);
    if (!block || excludedIndices.has(block.index)) break;

    excludedIndices.add(block.index);
    blockSequence.push({
      ...block,
      order: blockIndex + 1,
      fieldSizeBefore: activeStarts.length
    });

    if (recomputeTraffic) {
      currentFirstLeg = recomputeFirstLegPressure(
        tileMap,
        currentFirstLeg,
        getBlockPressureOptions(currentFirstLeg, [...excludedIndices])
      );
      trafficRecomputations += 1;
    }
  }

  // After all P sequential blocks, judge the best P choices left under the
  // final recomputed traffic field. If more than P starts remain physically
  // available, this is the next-best P set; there is no simultaneous pre-block
  // best-P shortcut anywhere in the blocking sequence.
  const remainingStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
  const selectedAfterRemainingTraffic = selectCompetitiveBestStartsByEffectiveRE(
    remainingStarts,
    count
  );
  const selectedIndices = selectedAfterRemainingTraffic
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  const selectedIndexSet = new Set(selectedIndices);
  const unselectedRemainingIndices = remainingStarts
    .filter((entry) => !selectedIndexSet.has(entry.index))
    .map((entry) => entry.index)
    .sort((left, right) => left - right);

  const selectedEntries = (currentFirstLeg.starts || []).filter((entry) => (
    selectedIndexSet.has(entry.index) &&
    entry.reachable &&
    entry.fullCourseRoute &&
    Number.isFinite(entry.normalFairnessEffectiveRE)
  ));
  const intendedChoiceSetCount = getCompetitiveIntendedChoiceSetCount(count);
  const completedREChoiceSetEntries = selectedAfterRemainingTraffic.slice(
    0,
    intendedChoiceSetCount
  );
  const completedREChoiceProfile = summarizeCompetitiveCompletedREChoiceSet(
    completedREChoiceSetEntries
  );
  const completedREChoiceSetIndices = completedREChoiceSetEntries.map((entry) => entry.index);
  const profile = getCompetitiveBalanceProfile(
    selectedEntries,
    competitiveCalibration,
    options
  );
  const selectedStdDev = profile.stdDev;
  const selectedRangeRE = Number(profile.selectedRangeRE) || 0;
  const competitiveSoftRangeLimit = Number(profile.softRangeLimit) || 0;
  const competitiveHardRangeLimit = Number(profile.hardRangeLimit) || 0;
  const competitiveStartBalanceProfile = getStartBalanceProfile(options);
  // Start Balance changes only final-subset acceptance. Competitive strategic
  // difficulty keeps its existing difficulty-calibrated reference so choosing
  // Strict/Relaxed/Off cannot itself make the same course easier or harder.
  const competitiveDifficultyReferenceRangeLimit =
    Number(profile.rangePolicy?.difficultySoftRangeLimit) ||
    competitiveSoftRangeLimit;
  const strategicDifficulty = getCompetitiveStrategicDifficulty(
    blockSequence,
    selectedRangeRE,
    competitiveDifficultyReferenceRangeLimit
  );
  const sufficientPhysicalField = (
    sourceStartCount >= requiredOfferedStarts &&
    routedStarts.length >= requiredOfferedStarts &&
    unavailableIndices.length === 0
  );
  const competitiveSubsetComplete = (
    sufficientPhysicalField &&
    blockSequence.length === count &&
    selectedEntries.length === count
  );
  const softBalanced = (
    competitiveSubsetComplete &&
    (
      !competitiveStartBalanceProfile.enforced ||
      selectedRangeRE <= competitiveSoftRangeLimit + 1e-9
    )
  );
  const hardAcceptable = (
    competitiveSubsetComplete &&
    (
      !competitiveStartBalanceProfile.enforced ||
      selectedRangeRE <= competitiveHardRangeLimit + 1e-9
    )
  );
  const blockReadability = summarizeCompetitiveBlockReadability(
    blockSequence,
    competitiveCalibration
  );
  const remainingIndices = remainingStarts
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  const competitiveStartBalance = {
    active: true,
    sequential: true,
    pruneBatchSize: 1,
    sourceStartCount,
    routedStartCount: routedStarts.length,
    requiredOfferedStarts,
    unavailableIndices,
    blockedStartCount: blockSequence.length,
    blockedIndices: blockSequence.map((entry) => entry.index),
    blockSequence,
    remainingStartCount: remainingStarts.length,
    remainingIndices,
    selectedStartCount: selectedEntries.length,
    selectedIndices,
    unselectedRemainingIndices,
    selectedRangeRE: Number(selectedRangeRE.toFixed(3)),
    balanceRangeLimit: Number(competitiveSoftRangeLimit.toFixed(3)),
    hardBalanceRangeLimit: Number(competitiveHardRangeLimit.toFixed(3)),
    balanceRangeExcess: Number((competitiveStartBalanceProfile.enforced
      ? Math.max(0, selectedRangeRE - competitiveSoftRangeLimit)
      : 0).toFixed(3)),
    hardBalanceRangeExcess: Number((competitiveStartBalanceProfile.enforced
      ? Math.max(0, selectedRangeRE - competitiveHardRangeLimit)
      : 0).toFixed(3)),
    observedBalanceRangeExcess: Number(Math.max(0, selectedRangeRE - competitiveSoftRangeLimit).toFixed(3)),
    observedHardBalanceRangeExcess: Number(Math.max(0, selectedRangeRE - competitiveHardRangeLimit).toFixed(3)),
    startBalance: competitiveStartBalanceProfile.id,
    startBalanceLabel: competitiveStartBalanceProfile.label,
    startBalanceEnforced: competitiveStartBalanceProfile.enforced,
    startBalanceRangeMultiplier: competitiveStartBalanceProfile.rangeMultiplier,
    selectedMinRE: profile.minRE,
    selectedMaxRE: profile.maxRE,
    selectedMedianTurns: profile.medianTurns,
    // Kept for Dev diagnostics only; neither SD nor outlier z participates in
    // Competitive acceptance or final candidate fit in v49ec.
    selectedStdDev: Number(selectedStdDev.toFixed(3)),
    difficultyCalibration: {
      requestedDifficulty: competitiveCalibration.requestedDifficulty,
      baseRangePolicy: `max(${COMPETITIVE_EFFECTIVE_RE_RANGE_MIN}RE, ${COMPETITIVE_EFFECTIVE_RE_RANGE_PER_TURN}RE × median programming turns)`,
      hardRangeMultiplier: COMPETITIVE_EFFECTIVE_RE_HARD_RANGE_MULTIPLIER,
      softRangeMultiplier: competitiveCalibration.softRangeMultiplier,
      difficultyHardRangeMultiplier: competitiveCalibration.hardRangeMultiplier,
      startBalance: competitiveStartBalanceProfile.id,
      startBalanceRangeMultiplier: competitiveStartBalanceProfile.rangeMultiplier,
      startBalanceEnforced: competitiveStartBalanceProfile.enforced
    },
    blockReadability,
    selectedOutlierCount: profile.softOutliers.length,
    selectedHardOutlierCount: 0,
    remainingOutlierCount: profile.softOutliers.length,
    scoreRange: profile.scoreRange,
    worstScoreZ: profile.worstScoreZ,
    worstScoreIndex: profile.worstScoreIndex,
    worstActionZ: profile.worstActionZ,
    worstActionIndex: profile.worstActionIndex,
    blockTrafficScope,
    trafficRecomputations,
    trafficFieldMethod: "completed-re-quality-weighted-remaining-field",
    strategicDifficulty: strategicDifficulty.difficulty,
    strategicDifficultyEvidence: strategicDifficulty,
    completedREOwnershipAudit: {
      model: "competitive-sequential-re-range-production-v49ec",
      observationalOnly: false,
      productionRankingOwner: "completed-effective-re",
      intendedRankingOwner: "completed-effective-re",
      productionChoiceSetCount: count,
      intendedChoiceSetCount,
      productionTrafficScope: "full",
      intendedTrafficScope: "full",
      trafficScopeMatchesIntent: true,
      blockSequence: blockSequence.map((entry) => ({
        order: entry.order,
        fieldSizeBefore: entry.fieldSizeBefore,
        index: entry.index,
        effectiveRE: entry.effectiveRE,
        runnerUpIndex: entry.runnerUpIndex,
        runnerUpEffectiveRE: entry.runnerUpEffectiveRE,
        decisionMarginRE: entry.decisionMarginRE,
        advantageVsMedianRE: entry.advantageVsMedianRE
      })),
      legacyShadowOwner: null,
      legacyComparatorRemoved: true,
      occupancyOwner: "completed-effective-re",
      occupancyQualityScale: "effective-RE×6.4-score-temperature-bridge",
      completedREChoiceSetIndices,
      completedREChoiceProfile,
      finalFairnessOwner: "best-worst-completed-effective-re-range",
      finalRangePolicy: profile.rangePolicy,
      difficultyCalibration: {
        blockReadabilityAffectsFit: true,
        blockReadabilityOwner: "completed-effective-re-only",
        legacyShadowReadabilityRemoved: true,
        requestedDifficulty: competitiveCalibration.requestedDifficulty,
        softRangeLimit: Number(competitiveSoftRangeLimit.toFixed(3)),
        hardRangeLimit: Number(competitiveHardRangeLimit.toFixed(3)),
        blockReadability
      },
      startBalanceControl: {
        appliesToCompetitive: true,
        scope: "post-block-best-p-subset-only",
        preset: competitiveStartBalanceProfile.id,
        multiplier: competitiveStartBalanceProfile.rangeMultiplier,
        enforced: competitiveStartBalanceProfile.enforced,
        implemented: true
      }
    },
    softBalanced,
    softMismatch: hardAcceptable && !softBalanced,
    hardAcceptable,
    acceptable: hardAcceptable,
    method: "full-course-re-native+P-sequential-best-blocks+recompute-each-block+post-block-best-P-range-v49ec",
    ownershipAuditModel: "competitive-sequential-re-range-production-v49ec",
    calibrationModel: "competitive-re-native-legibility+range-v49ec"
  };

  return {
    ...currentFirstLeg,
    summary: {
      ...currentFirstLeg.summary,
      scoreStdDev: Number(selectedStdDev.toFixed(3)),
      fairnessScore: Number(Math.max(
        0,
        100 - Math.max(
          0,
          selectedRangeRE - (competitiveStartBalanceProfile.enforced
            ? competitiveSoftRangeLimit
            : competitiveDifficultyReferenceRangeLimit)
        ) * NORMAL_EFFECTIVE_RE_SCORE_PER_RE * 4
      ).toFixed(2)),
      outliers: [],
      competitiveStartBalance,
      competitiveStaging: {
        active: true,
        sourceStartCount,
        routedStartCount: routedStarts.length,
        offeredStartCount: sourceStartCount,
        requiredOfferedStarts,
        unavailableIndices,
        remainingAfterBlocks: remainingStarts.length,
        remainingIndices,
        selectedStartCount: selectedEntries.length,
        selectedIndices,
        preliminaryScoreStdDev: Number(firstLeg.summary?.scoreStdDev ?? 0),
        trafficFieldMethod: "completed-re-quality-weighted-remaining-field",
        method: "normal-route-foundation+full-traffic-before-blocking+P-sequential-completed-re-blocks"
      }
    }
  };
}
