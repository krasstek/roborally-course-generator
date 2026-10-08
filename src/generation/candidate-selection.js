// Robo Rally Course Randomizer - candidate selection: fallback scoring and near-best candidate choice
import { FALLBACK_SOFT_FAILURE_PENALTIES, NEAR_BEST_MIN_BIN_WIDTH } from "./config.js";
import { generationRandom } from "./random.js";

export function getFallbackHardFailurePenalty(scenario) {
  if (!scenario?.metrics) return Infinity;

  let penalty = 0;
  for (const failure of scenario.metrics.hardFailures || []) {
    const failureId = String(failure || "");
    const specialFallbackPenalty = FALLBACK_SOFT_FAILURE_PENALTIES.get(failureId);
    if (Number.isFinite(specialFallbackPenalty)) {
      penalty += specialFallbackPenalty;
      continue;
    }
    return Infinity;
  }
  return penalty;
}

export function isViableFallbackScenario(scenario) {
  return Number.isFinite(getFallbackHardFailurePenalty(scenario));
}

export function getFallbackScenarioScore(scenario) {
  if (!isViableFallbackScenario(scenario)) return Infinity;
  const fitScore = Number(scenario?.metrics?.fitScore);
  if (!Number.isFinite(fitScore)) return Infinity;
  return fitScore + getFallbackHardFailurePenalty(scenario);
}

export function getAcceptableScenarioScore(scenario) {
  if (!scenario?.metrics?.acceptable) return Infinity;
  const fitScore = Number(scenario.metrics.fitScore);
  return Number.isFinite(fitScore) ? fitScore : Infinity;
}

export function getNearBestCandidateBin(candidates = []) {
  const ranked = candidates
    .map((scenario) => ({
      scenario,
      score: getAcceptableScenarioScore(scenario)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score);

  if (ranked.length <= 1) {
    return {
      ranked,
      pool: ranked,
      cutoff: ranked[0]?.score ?? Infinity,
      width: 0,
      binCount: ranked.length
    };
  }

  const best = ranked[0].score;
  const worst = ranked.at(-1).score;
  const range = Math.max(0, worst - best);
  if (range <= 1e-9) {
    return { ranked, pool: ranked, cutoff: best, width: 0, binCount: 1 };
  }

  // First empirical near-best rule: equal-width statistical bins, with a tiny
  // absolute floor so genuinely close scores can share the best bin even in a
  // two-candidate Fast run. Dev telemetry exposes the resulting pool.
  const binCount = Math.max(2, Math.ceil(Math.sqrt(ranked.length)));
  const width = Math.max(NEAR_BEST_MIN_BIN_WIDTH, range / binCount);
  const cutoff = best + width + 1e-9;
  const pool = ranked.filter((entry) => entry.score <= cutoff);
  return { ranked, pool, cutoff, width, binCount };
}

export function chooseNearBestCandidate(candidates = []) {
  const bin = getNearBestCandidateBin(candidates);
  if (!bin.pool.length) {
    return { scenario: null, ...bin };
  }
  const selectedIndex = bin.pool.length === 1
    ? 0
    : Math.floor(generationRandom() * bin.pool.length);
  return {
    scenario: bin.pool[selectedIndex].scenario,
    selectedScore: bin.pool[selectedIndex].score,
    ...bin
  };
}
