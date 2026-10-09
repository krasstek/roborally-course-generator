// Robo Rally Course Randomizer - programming cards: card model, rolling two-program resource state, card availability probabilities and their caches
import {
  AGAIN_CARD_COUNT,
  PROGRAM_CARD_COUNTS,
  PROGRAM_CARD_IDS,
  PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST,
  SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER
} from "./constants.js";
import { getRebootEndedAbsoluteActions } from "./reboot-recovery.js";
import { analysisTelemetryNow } from "./telemetry.js";
import { getTurnEndAfterActionIndexes } from "./reboot-recovery.js";

// The card model depends on four values only and is asked for on every search
// step, so each combination is built once. The cached profiles are frozen: they
// are shared by every caller.
const PROGRAM_CARD_MODEL_PROFILE_CACHE = new Map();
const PROGRAM_CARD_MODEL_SIGNATURE_CACHE = new Map();

function getProgramCardModelKey(options) {
  const playerCount = Math.max(1, Math.floor(Number(options.playerCount) || 4));
  return `${playerCount}|${options.lessForeshadowing ? 1 : 0}|${options.classicSharedDeck ? 1 : 0}|${options.factoryRejects ? 1 : 0}`;
}

export function getProgramCardModelProfile(options = {}) {
  const key = getProgramCardModelKey(options);
  let profile = PROGRAM_CARD_MODEL_PROFILE_CACHE.get(key);
  if (!profile) {
    profile = Object.freeze(buildProgramCardModelProfile(options));
    PROGRAM_CARD_MODEL_PROFILE_CACHE.set(key, profile);
  }
  return profile;
}

function buildProgramCardModelProfile(options) {
  const playerCount = Math.max(1, Math.floor(Number(options.playerCount) || 4));
  const resetEachTurn = Boolean(options.lessForeshadowing);
  const sharedDeck = Boolean(options.classicSharedDeck);
  const sharedDeckAlphaIncrement = sharedDeck
    ? Math.max(0, playerCount - 1) * SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER
    : 0;
  const baseAlpha = resetEachTurn ? 1 : PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR;
  return {
    handSize: options.factoryRejects ? 7 : PROGRAM_EXACT_HAND_SIZE,
    resetEachTurn,
    previousTurnDepletionActive: !resetEachTurn,
    sharedDeck,
    playerCount,
    baseAlpha,
    sharedDeckAlphaIncrement: Number(sharedDeckAlphaIncrement.toFixed(4)),
    adaptabilityFactor: Number((baseAlpha + sharedDeckAlphaIncrement).toFixed(4)),
    sharedDeckEnlargedDeckModeled: false,
    sharedDeckCrossRobotHandsModeled: false
  };
}

export function getProgramCardModelSignature(options = {}) {
  const key = getProgramCardModelKey(options);
  let signature = PROGRAM_CARD_MODEL_SIGNATURE_CACHE.get(key);
  if (signature === undefined) {
    signature = buildProgramCardModelSignature(options);
    PROGRAM_CARD_MODEL_SIGNATURE_CACHE.set(key, signature);
  }
  return signature;
}

function buildProgramCardModelSignature(options) {
  const profile = getProgramCardModelProfile(options);
  return [
    `h${profile.handSize}`,
    `reset${profile.resetEachTurn ? 1 : 0}`,
    `shared${profile.sharedDeck ? 1 : 0}`,
    `p${profile.playerCount}`,
    `a${profile.adaptabilityFactor.toFixed(4)}`
  ].join(":");
}

export function getProgramCardVariantModelSummary(options = {}) {
  const profile = getProgramCardModelProfile(options);
  return {
    model: "program-card-variant-ownership-v49ek",
    normalAdaptabilityFactor: PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR,
    sharedDeckAlphaIncrementPerAdditionalPlayer:
      SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER,
    handSize: profile.handSize,
    resetEachTurn: profile.resetEachTurn,
    previousTurnDepletionActive: profile.previousTurnDepletionActive,
    sharedDeck: profile.sharedDeck,
    playerCount: profile.playerCount,
    baseAlpha: profile.baseAlpha,
    sharedDeckAlphaIncrement: profile.sharedDeckAlphaIncrement,
    adaptabilityFactor: profile.adaptabilityFactor,
    sharedDeckEnlargedDeckModeled: false,
    sharedDeckCrossRobotHandsModeled: false,
    factoryRejects: Boolean(options.factoryRejects),
    lessForeshadowing: Boolean(options.lessForeshadowing),
    classicSharedDeck: Boolean(options.classicSharedDeck)
  };
}

export function getProgramCardEffectivePreviousCounts(previousCounts = [], options = {}) {
  if (!getProgramCardModelProfile(options).previousTurnDepletionActive) {
    return Array(PROGRAM_CHEAP_RESOURCE_IDS.length).fill(0);
  }
  return previousCounts;
}

export function getProgramCardEffectivePreviousCode(previousCode = 0, options = {}) {
  return getProgramCardModelProfile(options).previousTurnDepletionActive
    ? Math.max(0, Math.floor(Number(previousCode) || 0))
    : 0;
}

// v13/v48w card-model design invariant:
// The route analyzer is not a deck-order simulator. For planning credibility it
// uses a rolling two-turn abstraction: the previous five-register program is
// treated as known depletion from the 20-card deck, while the current program
// must fit what remains. Real reshuffle boundaries are deliberately ignored:
// they are too fragile to plan around, and modelling them would add false
// precision to a course randomizer. The four unplayed cards from the previous
// nine-card hand are not hard-depleted individually. In the exact realization
// pass their uncertainty is integrated mathematically: after the five known
// programmed cards are removed, the next nine-card hand is the marginal 9-card
// sample from the remaining 15-card population.
//
// v48x cheap programming availability alignment. Cheap search now prices the
// literal card allocation it is already carrying with a cached collapsed
// hypergeometric calculation instead of hand-tuned copy-count/combination
// surcharges. Only the card types actually required by the current program are
// enumerated; every irrelevant remaining card is collapsed into one "other"
// bucket. This keeps the hot path small while giving singleton combinations the
// same probability-shaped ordering as exact realization. The cheap proxy still
// never owns route/card legality: exact realization below unions every legal
// natural-vs-Again assignment and remains authoritative.
export const PROGRAM_CHEAP_RESOURCE_IDS = Object.freeze([...PROGRAM_CARD_IDS, "AGAIN"]);
export const PROGRAM_CHEAP_AVAILABILITY_CACHE = new Map();
export const PROGRAM_CHEAP_AVAILABILITY_CACHE_LIMIT = 50000;
export const PROGRAM_CHEAP_AVAILABILITY_TELEMETRY = {
  requests: 0,
  hits: 0,
  misses: 0,
  missComputeMs: 0
};

// v49ax: exact-within-turn union probability built from the cheap literal
// hypergeometric primitive. Natural/Again alternatives are a small union of
// monotone card-requirement events. Inclusion-exclusion is exact because the
// intersection of two such events is simply the componentwise maximum of their
// requirement vectors. This keeps the hot search on the collapsed HG cache
// rather than invoking the full hand enumerator.
export const PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE = new Map();
export const PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE_LIMIT = 50000;
export const PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY = {
  requests: 0,
  hits: 0,
  misses: 0,
  subsetTerms: 0,
  missComputeMs: 0
};

// v49ay higher-level memo for frontier union penalties. The routing-active
// union scorer repeatedly revisits the same compact frontier state sets; cache
// that pure frontier->penalty mapping before rebuilding resource arrays and
// inclusion-exclusion cache keys. This is behavior-equivalent to v49ax.
export const PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE = new Map();
export const PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE_LIMIT = 50000;
export const PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY = {
  requests: 0,
  hits: 0,
  misses: 0
};

// v48w exact programming availability. The exact realization pass evaluates
// the probability that a 9-card hand can supply the requested register actions
// under the rolling previous-program depletion model. The availability penalty
// is expressed in ordinary register-tempo score units. Normalizing by the chance
// of drawing at least one specified four-copy card makes that common use the
// zero-cost baseline; rarer joint requirements rise according to their actual
// inverse availability rather than a hand-tuned scarcity table.
export const PROGRAM_EXACT_HAND_SIZE = 9;
export const PROGRAM_EXACT_AVAILABILITY_CACHE = new Map();
export const PROGRAM_EXACT_AVAILABILITY_CACHE_LIMIT = 50000;

// Nine actions are retained only as a witness window: previous complete turn
// (5) + at most four already-programmed registers of the current turn. This is
// not intended to represent the nine cards physically drawn into a hand.
export const PROGRAM_HISTORY_WINDOW_SIZE = REGISTER_COUNT * 2 - 1;
export const PROGRAM_RESOURCE_SUMMARY_CACHE = new Map();
export const ROLLING_PROGRAM_CONTEXT_CACHE = new Map();
export const ROLLING_PROGRAM_CONTEXT_CACHE_LIMIT = 50000;
// Exact transition memo keyed by canonical two-program depletion state + register
// phase + immediately previous action + candidate action. Board position is absent
// because programming-card legality does not depend on it.
export const PROGRAM_ACTION_TRANSITION_CACHE = new Map();
export const PROGRAM_ACTION_TRANSITION_CACHE_LIMIT = 50000;
// v17 performance: contextual dominance keys ask for the same compact rolling
// program summary at many different physical squares. Cache that *summary/key*
// separately from the hard legality allocator so key construction does not keep
// slicing the nine-action witness and recounting the same low-copy cards.
// This cache is only a memoization layer; it does not change program legality.
export const ROLLING_PROGRAM_SIGNATURE_IDS = new Map();
export let nextRollingProgramSignatureId = 1;

// Reset by clearAnalysisCaches. A module-level binding can only be reassigned
// by its own module, so each reassigned cache has a reset function beside it.
export function resetRollingProgramSignatureIds() {
  ROLLING_PROGRAM_SIGNATURE_IDS.clear();
  nextRollingProgramSignatureId = 1;
}

export function getProgramTurnActionsFromHistory(
  history,
  absoluteActionCount,
  turnOffset = 0,
  actionAbsoluteActions = null
) {
  const fullHistory = Array.isArray(history) ? history : [];
  const window = getProgramHistoryWindow(fullHistory);
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const targetTurn = Math.floor(absoluteActions / REGISTER_COUNT) - Math.max(0, turnOffset);
  const timedWindow = Array.isArray(actionAbsoluteActions)
    ? actionAbsoluteActions.slice(-window.length)
    : null;

  // v48z: reboot can leave gaps in elapsed register time without adding executed
  // cards. Explicit action registers preserve real turn membership for the older
  // synchronous search paths without inventing cards for skipped registers.
  if (timedWindow && timedWindow.length === window.length) {
    return window.filter((_, index) => {
      const executedAbsoluteAction = Math.max(1, Math.floor(Number(timedWindow[index]) || 1));
      return Math.floor((executedAbsoluteAction - 1) / REGISTER_COUNT) === targetTurn;
    });
  }

  const historyStartAction = absoluteActions - window.length;
  return window.filter((_, index) => (
    Math.floor((historyStartAction + index) / REGISTER_COUNT) === targetTurn
  ));
}

export function getProgramResourceFullCount(resourceId) {
  return resourceId === "AGAIN"
    ? AGAIN_CARD_COUNT
    : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
}

export function getProgramResourceStateCounts(state) {
  return PROGRAM_CHEAP_RESOURCE_IDS.map((resourceId) => (
    resourceId === "AGAIN"
      ? Number(Boolean(state?.againUsed))
      : Math.max(0, Math.floor(Number(state?.naturalUses?.get(resourceId)) || 0))
  ));
}

export function getCheapProgramLiteralAvailabilityProbability(
  previousCounts = [],
  currentCounts = [],
  options = {}
) {
  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.requests += 1;
  const profile = getProgramCardModelProfile(options);
  const effectivePreviousCounts = getProgramCardEffectivePreviousCounts(
    previousCounts,
    options
  );
  const safePrevious = PROGRAM_CHEAP_RESOURCE_IDS.map((resourceId, index) => (
    Math.max(0, Math.min(
      getProgramResourceFullCount(resourceId),
      Math.floor(Number(effectivePreviousCounts[index]) || 0)
    ))
  ));
  const safeCurrent = PROGRAM_CHEAP_RESOURCE_IDS.map((_, index) => (
    Math.max(0, Math.floor(Number(currentCounts[index]) || 0))
  ));
  const cacheKey = `${getProgramCardModelSignature(options)}|${safePrevious.join("")}|${safeCurrent.join("")}`;
  if (PROGRAM_CHEAP_AVAILABILITY_CACHE.has(cacheKey)) {
    PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.hits += 1;
    return PROGRAM_CHEAP_AVAILABILITY_CACHE.get(cacheKey);
  }

  PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.misses += 1;
  const cheapAvailabilityStartedAt = analysisTelemetryNow();
  const storeCheapAvailability = (probability) => {
    PROGRAM_CHEAP_AVAILABILITY_TELEMETRY.missComputeMs +=
      analysisTelemetryNow() - cheapAvailabilityStartedAt;
    if (PROGRAM_CHEAP_AVAILABILITY_CACHE.size >= PROGRAM_CHEAP_AVAILABILITY_CACHE_LIMIT) {
      const oldest = PROGRAM_CHEAP_AVAILABILITY_CACHE.keys().next().value;
      if (oldest !== undefined) PROGRAM_CHEAP_AVAILABILITY_CACHE.delete(oldest);
    }
    PROGRAM_CHEAP_AVAILABILITY_CACHE.set(cacheKey, probability);
    return probability;
  };

  let deckSize = 0;
  let requiredDeckSize = 0;
  let requiredCards = 0;
  const requiredCategories = [];
  for (let index = 0; index < PROGRAM_CHEAP_RESOURCE_IDS.length; index += 1) {
    const resourceId = PROGRAM_CHEAP_RESOURCE_IDS[index];
    const available = Math.max(
      0,
      getProgramResourceFullCount(resourceId) - safePrevious[index]
    );
    const required = safeCurrent[index];
    deckSize += available;
    if (!required) continue;
    if (required > available) {
      return storeCheapAvailability(0);
    }
    requiredDeckSize += available;
    requiredCards += required;
    requiredCategories.push([available, required]);
  }

  const handSize = Math.min(profile.handSize, deckSize);
  if (requiredCards > handSize || handSize <= 0) {
    return storeCheapAvailability(0);
  }
  if (!requiredCategories.length) {
    return storeCheapAvailability(1);
  }

  // Convolve only the required card categories. Every other remaining card is
  // exchangeable for this literal allocation, so collapse them into one bucket.
  let waysByRequiredTake = Array(handSize + 1).fill(0);
  waysByRequiredTake[0] = 1;
  for (const [available, required] of requiredCategories) {
    const nextWays = Array(handSize + 1).fill(0);
    for (let already = 0; already <= handSize; already += 1) {
      const priorWays = waysByRequiredTake[already];
      if (!priorWays) continue;
      const maxTake = Math.min(available, handSize - already);
      for (let take = required; take <= maxTake; take += 1) {
        nextWays[already + take] += priorWays * chooseSmall(available, take);
      }
    }
    waysByRequiredTake = nextWays;
  }

  const otherCards = Math.max(0, deckSize - requiredDeckSize);
  let successfulWays = 0;
  for (let requiredTake = 0; requiredTake <= handSize; requiredTake += 1) {
    const requiredWays = waysByRequiredTake[requiredTake];
    if (!requiredWays) continue;
    const otherTake = handSize - requiredTake;
    if (otherTake > otherCards) continue;
    successfulWays += requiredWays * chooseSmall(otherCards, otherTake);
  }

  const totalWays = chooseSmall(deckSize, handSize);
  const probability = totalWays > 0
    ? Math.max(0, Math.min(1, successfulWays / totalWays))
    : 0;
  return storeCheapAvailability(probability);
}

export function getCheapProgramLiteralAvailabilityPenalty(
  previousCounts = [],
  currentCounts = [],
  options = {}
) {
  const probability = getCheapProgramLiteralAvailabilityProbability(
    previousCounts,
    currentCounts,
    options
  );
  if (probability <= 0) return Infinity;
  return Number(
    getProgramAvailabilityPenaltyFromProbability(
      probability,
      getProgramCardModelProfile(options).adaptabilityFactor
    ).toFixed(3)
  );
}

export function getCheapProgramRequirementUnionAvailabilityProbability(
  previousCounts = [],
  requirementVectors = [],
  options = {}
) {
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.requests += 1;
  const effectivePreviousCounts = getProgramCardEffectivePreviousCounts(
    previousCounts,
    options
  );
  const safePrevious = PROGRAM_CHEAP_RESOURCE_IDS.map((resourceId, index) => (
    Math.max(0, Math.min(
      getProgramResourceFullCount(resourceId),
      Math.floor(Number(effectivePreviousCounts[index]) || 0)
    ))
  ));
  const uniqueRequirements = [...new Map(
    (requirementVectors || []).map((vector) => {
      const safeVector = PROGRAM_CHEAP_RESOURCE_IDS.map((_, index) => (
        Math.max(0, Math.floor(Number(vector?.[index]) || 0))
      ));
      return [safeVector.join(","), safeVector];
    })
  ).values()];
  if (!uniqueRequirements.length) return 0;

  // Superset requirements add no new coverage when a subset requirement is
  // already legal, so prune them before inclusion-exclusion.
  const minimalRequirements = uniqueRequirements.filter(
    (candidate, candidateIndex) => !uniqueRequirements.some(
      (other, otherIndex) => (
        otherIndex !== candidateIndex &&
        other.every((count, index) => count <= candidate[index]) &&
        other.some((count, index) => count < candidate[index])
      )
    )
  );
  const requirementKey = minimalRequirements
    .map((vector) => vector.join(","))
    .sort()
    .join(";");
  const cacheKey = `${getProgramCardModelSignature(options)}|${safePrevious.join(",")}|${requirementKey}`;
  if (PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.has(cacheKey)) {
    PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.hits += 1;
    return PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.get(cacheKey);
  }

  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.misses += 1;
  const startedAt = analysisTelemetryNow();
  const subsetCount = 1 << minimalRequirements.length;
  let probability = 0;
  const intersectionProbabilityCache = new Map();

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const intersection = Array(PROGRAM_CHEAP_RESOURCE_IDS.length).fill(0);
    let bits = 0;
    for (let requirementIndex = 0;
      requirementIndex < minimalRequirements.length;
      requirementIndex += 1) {
      if (!(mask & (1 << requirementIndex))) continue;
      bits += 1;
      const vector = minimalRequirements[requirementIndex];
      for (let resourceIndex = 0;
        resourceIndex < intersection.length;
        resourceIndex += 1) {
        intersection[resourceIndex] = Math.max(
          intersection[resourceIndex],
          vector[resourceIndex]
        );
      }
    }
    const intersectionKey = intersection.join(",");
    let intersectionProbability = intersectionProbabilityCache.get(intersectionKey);
    if (intersectionProbability === undefined) {
      intersectionProbability = getCheapProgramLiteralAvailabilityProbability(
        safePrevious,
        intersection,
        options
      );
      intersectionProbabilityCache.set(intersectionKey, intersectionProbability);
    }
    PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.subsetTerms += 1;
    probability += bits % 2 === 1
      ? intersectionProbability
      : -intersectionProbability;
  }

  probability = Math.max(0, Math.min(1, probability));
  PROGRAM_CHEAP_UNION_AVAILABILITY_TELEMETRY.missComputeMs +=
    analysisTelemetryNow() - startedAt;
  if (PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.size >=
      PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE_LIMIT) {
    const oldest = PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.keys().next().value;
    if (oldest !== undefined) PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.delete(oldest);
  }
  PROGRAM_CHEAP_UNION_AVAILABILITY_CACHE.set(cacheKey, probability);
  return probability;
}

export function getCheapProgramRequirementUnionAvailabilityPenalty(
  previousCounts = [],
  requirementVectors = [],
  options = {}
) {
  const probability = getCheapProgramRequirementUnionAvailabilityProbability(
    previousCounts,
    requirementVectors,
    options
  );
  if (probability <= 0) return Infinity;
  return Number(
    getProgramAvailabilityPenaltyFromProbability(
      probability,
      getProgramCardModelProfile(options).adaptabilityFactor
    ).toFixed(3)
  );
}

export function getCheapProgramActionUnionAvailabilityPenalty(
  previousCounts = [],
  actionIds = [],
  options = {}
) {
  const requirements = getExactProgramRequirementVectors(actionIds);
  return getCheapProgramRequirementUnionAvailabilityPenalty(
    previousCounts,
    requirements,
    options
  );
}

export function getEstimatedCardFrontierUnionAvailabilityPenalty(frontier = [], options = {}) {
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.requests += 1;
  const source = (frontier || []).filter(
    (entry) => entry?.state?.feasible !== false
  );
  if (!source.length) return Infinity;

  // The union penalty depends only on previous/current compact resource codes,
  // never on path penalty or previousActionId. Build a compact canonical key
  // before expanding those codes back to resource-count arrays.
  const currentCodesByPrevious = new Map();
  for (const entry of source) {
    const previousCode = Math.max(
      0,
      Math.floor(Number(entry?.state?.previousCode) || 0)
    );
    const currentCode = Math.max(
      0,
      Math.floor(Number(entry?.state?.currentCode) || 0)
    );
    if (!currentCodesByPrevious.has(previousCode)) {
      currentCodesByPrevious.set(previousCode, new Set());
    }
    currentCodesByPrevious.get(previousCode).add(currentCode);
  }
  const groupEntries = [...currentCodesByPrevious.entries()]
    .sort((left, right) => left[0] - right[0]);
  const cacheKey = `${getProgramCardModelSignature(options)}|` + groupEntries.map(([previousCode, currentCodes]) => (
    `${getProgramCardEffectivePreviousCode(previousCode, options)}:${[...currentCodes].sort((left, right) => left - right).join(",")}`
  )).join("|");
  if (PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.has(cacheKey)) {
    PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.hits += 1;
    return PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.get(cacheKey);
  }

  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_TELEMETRY.misses += 1;
  let bestPenalty = Infinity;
  for (const [previousCode, currentCodes] of groupEntries) {
    const previousCounts = getCompactProgramResourceCounts(
      getProgramCardEffectivePreviousCode(previousCode, options)
    );
    const requirements = [...currentCodes].map(
      (currentCode) => getCompactProgramResourceCounts(currentCode)
    );
    const penalty = getCheapProgramRequirementUnionAvailabilityPenalty(
      previousCounts,
      requirements,
      options
    );
    bestPenalty = Math.min(bestPenalty, penalty);
  }

  if (PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.size >=
      PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE_LIMIT) {
    const oldest =
      PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.keys().next().value;
    if (oldest !== undefined) {
      PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.delete(oldest);
    }
  }
  PROGRAM_CHEAP_FRONTIER_UNION_PENALTY_CACHE.set(cacheKey, bestPenalty);
  return bestPenalty;
}

export function getEstimatedCardFrontierUnionAvailabilityDelta(
  beforeFrontier = [],
  afterFrontier = [],
  options = {}
) {
  const before = getEstimatedCardFrontierUnionAvailabilityPenalty(beforeFrontier, options);
  const after = getEstimatedCardFrontierUnionAvailabilityPenalty(afterFrontier, options);
  if (!Number.isFinite(after)) return Infinity;
  const baseline = Number.isFinite(before) ? before : 0;
  return Number(Math.max(0, after - baseline).toFixed(3));
}

export function getCheapProgramLiteralAvailabilityDelta(
  previousCounts,
  beforeCurrentCounts,
  afterCurrentCounts,
  options = {}
) {
  const before = getCheapProgramLiteralAvailabilityPenalty(
    previousCounts,
    beforeCurrentCounts,
    options
  );
  const after = getCheapProgramLiteralAvailabilityPenalty(
    previousCounts,
    afterCurrentCounts,
    options
  );
  if (!Number.isFinite(after)) return Infinity;
  const baseline = Number.isFinite(before) ? before : 0;
  return Number(Math.max(0, after - baseline).toFixed(3));
}

export function getProgramResourceStateSignature(state) {
  const naturalSignature = PROGRAM_CARD_IDS
    .map((id) => state?.naturalUses?.get(id) || 0)
    .join("");
  return `${naturalSignature}a${state?.againActionId ?? "-"}`;
}

export function getProgramResourceStateScarcityCost(state) {
  if (!state) return Infinity;
  return getCheapProgramLiteralAvailabilityPenalty(
    Array(PROGRAM_CHEAP_RESOURCE_IDS.length).fill(0),
    getProgramResourceStateCounts(state)
  );
}

// v25 fast contextual programming state -------------------------------------
//
// The route search no longer carries a set of every possible natural-vs-Again
// allocation for an action history. It chooses the literal card that supplies
// each register as it searches and carries only the two consequential programs'
// depletion counts. This is exact under the existing rolling-two-program model:
// previous-program uses + current-program uses may never exceed the physical
// copy count of any card. Again is just another one-copy card in that vector.
//
// The immediately previous *executed action* is stored separately because it is
// execution context, not a resource: it determines what an Again card would do.
// Register phase remains exact. At a five-register boundary the completed current
// program becomes the previous program, the new current program is empty, and
// Again cannot reach back into the preceding program.
export const COMPACT_PROGRAM_RESOURCE_IDS = PROGRAM_CHEAP_RESOURCE_IDS;
export const COMPACT_PROGRAM_RESOURCE_LIMITS = Object.freeze(
  COMPACT_PROGRAM_RESOURCE_IDS.map((id) => (
    id === "AGAIN" ? AGAIN_CARD_COUNT : (PROGRAM_CARD_COUNTS.get(id) || 0)
  ))
);
export const COMPACT_PROGRAM_RESOURCE_RADICES = Object.freeze(
  COMPACT_PROGRAM_RESOURCE_LIMITS.map((limit) => limit + 1)
);
export const COMPACT_PROGRAM_RESOURCE_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (const radix of COMPACT_PROGRAM_RESOURCE_RADICES) {
    weights.push(weight);
    weight *= radix;
  }
  return weights;
})());
export const COMPACT_PROGRAM_RESOURCE_SPACE = COMPACT_PROGRAM_RESOURCE_RADICES.reduce(
  (product, radix) => product * radix,
  1
);
export const COMPACT_PROGRAM_ACTION_RADIX = PROGRAM_CARD_IDS.length + 1;
export const COMPACT_PROGRAM_RESOURCE_INDEX = new Map(
  COMPACT_PROGRAM_RESOURCE_IDS.map((id, index) => [id, index])
);
export const COMPACT_PROGRAM_ACTION_CODE = new Map(
  PROGRAM_CARD_IDS.map((id, index) => [id, index + 1])
);

export function getCompactProgramResourceCount(code, resourceId) {
  const index = COMPACT_PROGRAM_RESOURCE_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return 0;
  const weight = COMPACT_PROGRAM_RESOURCE_WEIGHTS[index];
  const radix = COMPACT_PROGRAM_RESOURCE_RADICES[index];
  return Math.floor(Math.max(0, Number(code) || 0) / weight) % radix;
}

export function getCompactProgramResourceCounts(code) {
  return COMPACT_PROGRAM_RESOURCE_IDS.map((resourceId) => (
    getCompactProgramResourceCount(code, resourceId)
  ));
}

export function addCompactProgramResourceUse(code, resourceId) {
  const index = COMPACT_PROGRAM_RESOURCE_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return null;
  const current = getCompactProgramResourceCount(code, resourceId);
  if (current >= COMPACT_PROGRAM_RESOURCE_LIMITS[index]) return null;
  return (Number(code) || 0) + COMPACT_PROGRAM_RESOURCE_WEIGHTS[index];
}

export function encodeCompactProgramResourceState(resourceState) {
  let code = 0;
  for (const actionId of PROGRAM_CARD_IDS) {
    const count = resourceState?.naturalUses?.get(actionId) || 0;
    const index = COMPACT_PROGRAM_RESOURCE_INDEX.get(actionId);
    code += Math.max(0, Math.min(
      COMPACT_PROGRAM_RESOURCE_LIMITS[index],
      Math.floor(Number(count) || 0)
    )) * COMPACT_PROGRAM_RESOURCE_WEIGHTS[index];
  }
  if (resourceState?.againUsed) {
    code += COMPACT_PROGRAM_RESOURCE_WEIGHTS[
      COMPACT_PROGRAM_RESOURCE_INDEX.get("AGAIN")
    ];
  }
  return code;
}

export function getCompactProgramCardStateCode(cardState) {
  const previousCode = Math.max(0, Math.floor(Number(cardState?.previousCode) || 0));
  const currentCode = Math.max(0, Math.floor(Number(cardState?.currentCode) || 0));
  const previousActionCode = COMPACT_PROGRAM_ACTION_CODE.get(
    cardState?.previousActionId
  ) || 0;
  return (
    (previousCode * COMPACT_PROGRAM_RESOURCE_SPACE + currentCode) *
      COMPACT_PROGRAM_ACTION_RADIX +
    previousActionCode
  );
}

export function getCompactProgramCardStateKey(cardState) {
  return getCompactProgramCardStateCode(cardState);
}

export function getCompactProgramCardStateFromHistory(history, absoluteActions, options = {}) {
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const phase = absolute % REGISTER_COUNT;
  const window = getProgramHistoryWindow(history);
  const currentTurnActions = getProgramTurnActionsFromHistory(window, absolute, 0);
  const previousTurnActions = getProgramCardModelProfile(options).previousTurnDepletionActive
    ? getProgramTurnActionsFromHistory(window, absolute, 1)
    : [];
  const currentStates = getLiteralProgramResourceStates(currentTurnActions);
  const previousStates = previousTurnActions.length
    ? getLiteralProgramResourceStates(previousTurnActions)
    : [{ naturalUses: new Map(), againUsed: false, againActionId: null }];

  let best = null;
  let bestCost = Infinity;
  for (const previousState of previousStates) {
    for (const currentState of currentStates) {
      if (!areRollingProgramResourceStatesCompatible(previousState, currentState)) continue;
      const cost = getCheapProgramLiteralAvailabilityPenalty(
        getProgramResourceStateCounts(previousState),
        getProgramResourceStateCounts(currentState),
        options
      );
      if (cost < bestCost) {
        bestCost = cost;
        best = { previousState, currentState };
      }
    }
  }

  if (!best) {
    return {
      feasible: false,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    };
  }

  return {
    feasible: true,
    previousCode: encodeCompactProgramResourceState(best.previousState),
    currentCode: encodeCompactProgramResourceState(best.currentState),
    previousActionId: phase > 0 ? (currentTurnActions.at(-1) ?? null) : null
  };
}

export function getCompactProgramCardOptions(
  cardState,
  absoluteActions,
  actionId,
  options = {}
) {
  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  const previousCode = getProgramCardEffectivePreviousCode(
    cardState?.previousCode,
    options
  );
  const currentCode = Math.max(0, Math.floor(Number(cardState?.currentCode) || 0));
  const previousCounts = getCompactProgramResourceCounts(previousCode);
  const currentCounts = getCompactProgramResourceCounts(currentCode);
  const optionsOut = [];

  const naturalLimit = PROGRAM_CARD_COUNTS.get(actionId) || 0;
  if (naturalLimit > 0) {
    const used = (
      getCompactProgramResourceCount(previousCode, actionId) +
      getCompactProgramResourceCount(currentCode, actionId)
    );
    if (used < naturalLimit) {
      const nextCurrent = addCompactProgramResourceUse(currentCode, actionId);
      if (nextCurrent !== null) {
        const scarcityPenalty = getCheapProgramLiteralAvailabilityDelta(
          previousCounts,
          currentCounts,
          getCompactProgramResourceCounts(nextCurrent),
          options
        );
        optionsOut.push({
          programCardId: actionId,
          scarcityPenalty,
          programPlausibilityPenalty: 0,
          penalty: scarcityPenalty,
          currentCode: nextCurrent
        });
      }
    }
  }

  const againUsed = (
    getCompactProgramResourceCount(previousCode, "AGAIN") +
    getCompactProgramResourceCount(currentCode, "AGAIN")
  );
  if (
    phase > 0 &&
    cardState?.previousActionId === actionId &&
    againUsed < AGAIN_CARD_COUNT
  ) {
    const nextCurrent = addCompactProgramResourceUse(currentCode, "AGAIN");
    if (nextCurrent !== null) {
      const scarcityPenalty = getCheapProgramLiteralAvailabilityDelta(
        previousCounts,
        currentCounts,
        getCompactProgramResourceCounts(nextCurrent),
        options
      );
      optionsOut.push({
        programCardId: "AGAIN",
        scarcityPenalty,
        programPlausibilityPenalty: 0,
        penalty: scarcityPenalty,
        currentCode: nextCurrent
      });
    }
  }

  return optionsOut.map((option) => {
    const nextAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0)) + 1;
    if (nextAbsoluteActions % REGISTER_COUNT === 0) {
      return {
        ...option,
        state: {
          feasible: true,
          previousCode: getProgramCardModelProfile(options).previousTurnDepletionActive
            ? option.currentCode
            : 0,
          currentCode: 0,
          previousActionId: null
        }
      };
    }
    return {
      ...option,
      state: {
        feasible: true,
        previousCode,
        currentCode: option.currentCode,
        previousActionId: actionId
      }
    };
  });
}



export function closeCompactProgramCardStateForEndedTurn(cardState, options = {}) {
  if (!cardState || cardState.feasible === false) return cardState;
  const currentCode = Math.max(0, Math.floor(Number(cardState.currentCode) || 0));
  // R5 already closes the turn inside getCompactProgramCardOptions(). Mid-turn
  // reboot still has the executed program in currentCode and must roll it into
  // previousCode before the next routed action begins at next-turn R1. Unknown
  // unexecuted register cards are deliberately not invented: the analyzer keeps
  // its existing known-depletion abstraction rather than simulating a full hand.
  const keepPreviousDepletion = getProgramCardModelProfile(options).previousTurnDepletionActive;
  if (currentCode <= 0) {
    return {
      feasible: true,
      previousCode: keepPreviousDepletion
        ? Math.max(0, Math.floor(Number(cardState.previousCode) || 0))
        : 0,
      currentCode: 0,
      previousActionId: null
    };
  }
  return {
    feasible: true,
    previousCode: keepPreviousDepletion ? currentCode : 0,
    currentCode: 0,
    previousActionId: null
  };
}

export function closeEstimatedCardForecastFrontierForEndedTurn(frontier = [], options = {}) {
  const bestByState = new Map();
  for (const entry of frontier || []) {
    const state = closeCompactProgramCardStateForEndedTurn(entry?.state, options);
    if (!state || state.feasible === false) continue;
    const penalty = Math.max(0, Number(entry?.penalty) || 0);
    const key = getCompactProgramCardStateCode(state);
    const prior = bestByState.get(key);
    if (!prior || penalty < prior.penalty - 0.001) {
      bestByState.set(key, { state, penalty });
    }
  }
  return [...bestByState.values()]
    .sort((left, right) => left.penalty - right.penalty)
    .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
}


export const ESTIMATED_CARD_FORECAST_BREAK_PENALTY = 18;
export const ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT = 3;

export function cloneEstimatedCardForecastFrontier(frontier, fallbackState = null) {
  const source = Array.isArray(frontier) && frontier.length
    ? frontier
    : fallbackState?.feasible === false
      ? []
      : fallbackState
        ? [{ state: fallbackState, penalty: 0 }]
        : [];
  return source
    .filter((entry) => entry?.state?.feasible !== false)
    .map((entry) => ({
      state: {
        feasible: true,
        previousCode: Math.max(0, Math.floor(Number(entry.state?.previousCode) || 0)),
        currentCode: Math.max(0, Math.floor(Number(entry.state?.currentCode) || 0)),
        previousActionId: entry.state?.previousActionId ?? null
      },
      penalty: Math.max(0, Number(entry.penalty) || 0)
    }))
    .sort((left, right) => left.penalty - right.penalty)
    .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
}

export function advanceEstimatedCardForecastFrontier(
  frontier,
  absoluteActions,
  actionId,
  options = {}
) {
  const current = cloneEstimatedCardForecastFrontier(frontier);
  if (!current.length) {
    return { feasible: false, frontier: [], unionPenaltyDelta: Infinity };
  }

  const beforeUnionPenalty =
    getEstimatedCardFrontierUnionAvailabilityPenalty(current, options);
  const rawUnionFrontier = [];
  const next = new Map();
  for (const entry of current) {
    const cardOptions = getCompactProgramCardOptions(
      entry.state,
      absoluteActions,
      actionId,
      options
    );
    for (const cardOption of cardOptions) {
      rawUnionFrontier.push({
        state: {
          feasible: true,
          previousCode: Math.max(
            0,
            Math.floor(Number(entry.state?.previousCode) || 0)
          ),
          currentCode: Math.max(
            0,
            Math.floor(Number(cardOption.currentCode) || 0)
          ),
          previousActionId: actionId
        },
        penalty: 0
      });
      const penalty = entry.penalty + Math.max(0, Number(cardOption.penalty) || 0);
      const key = getCompactProgramCardStateCode(cardOption.state);
      const previous = next.get(key);
      if (!previous || penalty + 0.001 < previous.penalty) {
        next.set(key, {
          state: cardOption.state,
          penalty
        });
      }
    }
  }

  const retained = [...next.values()]
    .sort((left, right) => left.penalty - right.penalty)
    .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
  const afterUnionPenalty =
    getEstimatedCardFrontierUnionAvailabilityPenalty(rawUnionFrontier, options);
  const unionPenaltyDelta = Number.isFinite(afterUnionPenalty)
    ? Number(Math.max(
      0,
      afterUnionPenalty -
        (Number.isFinite(beforeUnionPenalty) ? beforeUnionPenalty : 0)
    ).toFixed(3))
    : Infinity;
  return {
    feasible: retained.length > 0,
    frontier: retained,
    unionPenaltyDelta
  };
}

export function walkEstimatedCardForecast(
  actionIds,
  absoluteActions,
  initialFrontier,
  options = {},
  transitions = []
) {
  let frontier = cloneEstimatedCardForecastFrontier(initialFrontier);
  const beganFeasible = frontier.length > 0;
  let feasible = beganFeasible;
  let workingAbsoluteActions = Math.max(
    0,
    Math.floor(Number(absoluteActions) || 0)
  );
  let failureIndex = null;

  for (let index = 0; index < (actionIds || []).length; index += 1) {
    if (!feasible) break;
    const next = advanceEstimatedCardForecastFrontier(
      frontier,
      workingAbsoluteActions,
      actionIds[index],
      options
    );
    const executedAbsoluteAction = workingAbsoluteActions + 1;
    const rebooted = Boolean(transitions?.[index]?.rebooted);
    workingAbsoluteActions = rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    if (!next.feasible) {
      feasible = false;
      frontier = [];
      failureIndex = index;
      break;
    }
    frontier = rebooted
      ? closeEstimatedCardForecastFrontierForEndedTurn(next.frontier, options)
      : next.frontier;
  }

  return {
    feasible,
    frontier,
    failureIndex,
    penalty: beganFeasible && !feasible
      ? ESTIMATED_CARD_FORECAST_BREAK_PENALTY
      : 0
  };
}

export function scoreCompactProgramCardSequenceUntilFailure(
  initialCardState,
  absoluteActions,
  actionIds,
  options = {},
  history = [],
  turnEndAfterActionIndexes = null
) {
  const initial = initialCardState?.feasible === false
    ? null
    : (initialCardState || {
      feasible: true,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    });
  const startingAbsoluteActions = Math.max(
    0,
    Math.floor(Number(absoluteActions) || 0)
  );
  if (!initial) {
    return {
      feasible: false,
      failureIndex: 0,
      prefixActionCount: 0,
      penalty: Infinity,
      absoluteActions: startingAbsoluteActions,
      cardState: null,
      programCardIds: [],
      actionPenalties: [],
      actionScarcityPenalties: [],
      actionPlausibilityPenalties: [],
      scarcityPenalty: Infinity,
      programPlausibilityPenalty: Infinity,
      cardStates: [],
      frontier: []
    };
  }

  let frontier = new Map([[
    getCompactProgramCardStateKey(initial),
    {
      state: initial,
      penalty: 0,
      scarcityPenalty: 0,
      programPlausibilityPenalty: 0,
      programCardIds: [],
      actionPenalties: [],
      actionScarcityPenalties: [],
      actionPlausibilityPenalties: [],
      cardStates: []
    }
  ]]);
  let workingAbsoluteActions = startingAbsoluteActions;
  const actions = Array.isArray(actionIds) ? actionIds : [];
  let currentTurnActions = getProgramTurnActionsFromHistory(
    getProgramHistoryWindow(history),
    startingAbsoluteActions,
    0
  );
  const forcedTurnEnds = turnEndAfterActionIndexes instanceof Set
    ? turnEndAfterActionIndexes
    : new Set(Array.isArray(turnEndAfterActionIndexes) ? turnEndAfterActionIndexes : []);

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const actionId = actions[actionIndex];
    const nextTurnActions = [...currentTurnActions, actionId];
    const next = new Map();
    for (const entry of frontier.values()) {
      const previousCode = Math.max(
        0,
        Math.floor(Number(entry.state?.previousCode) || 0)
      );
      const beforeAvailabilityPenalty = getExactProgramAvailabilityPenalty(
        previousCode,
        currentTurnActions,
        options
      );
      const afterAvailabilityPenalty = getExactProgramAvailabilityPenalty(
        previousCode,
        nextTurnActions,
        options
      );
      const availabilityPenaltyDelta = (
        Number.isFinite(afterAvailabilityPenalty) &&
        Number.isFinite(beforeAvailabilityPenalty)
      )
        ? Number(Math.max(
          0,
          afterAvailabilityPenalty - beforeAvailabilityPenalty
        ).toFixed(3))
        : Infinity;
      const cardOptions = getCompactProgramCardOptions(
        entry.state,
        workingAbsoluteActions,
        actionId,
        options
      );
      for (const cardOption of cardOptions) {
        if (!Number.isFinite(availabilityPenaltyDelta)) continue;
        const penalty = entry.penalty + availabilityPenaltyDelta;
        const forceTurnEnd = forcedTurnEnds.has(actionIndex);
        const nextCardState = forceTurnEnd
          ? closeCompactProgramCardStateForEndedTurn(cardOption.state, options)
          : cardOption.state;
        const key = getCompactProgramCardStateKey(nextCardState);
        const prior = next.get(key);
        if (!prior || penalty < prior.penalty - 0.001) {
          next.set(key, {
            state: nextCardState,
            penalty,
            // Historical field name retained for compatibility. In the exact
            // realization pass this is now the hypergeometric hand-availability
            // penalty, not the old per-card rarity sum.
            scarcityPenalty:
              (entry.scarcityPenalty || 0) + availabilityPenaltyDelta,
            programPlausibilityPenalty: 0,
            programCardIds: [
              ...entry.programCardIds,
              cardOption.programCardId
            ],
            actionPenalties: [
              ...entry.actionPenalties,
              availabilityPenaltyDelta
            ],
            actionScarcityPenalties: [
              ...entry.actionScarcityPenalties,
              availabilityPenaltyDelta
            ],
            actionPlausibilityPenalties: [
              ...entry.actionPlausibilityPenalties,
              0
            ],
            cardStates: [
              ...entry.cardStates,
              { ...nextCardState }
            ]
          });
        }
      }
    }
    if (!next.size) {
      const survivingPrefix = [...frontier.values()].sort(
        (left, right) => left.penalty - right.penalty
      );
      const bestPrefix = survivingPrefix[0] ?? null;
      return {
        feasible: false,
        failureIndex: actionIndex,
        prefixActionCount: actionIndex,
        penalty: Number((bestPrefix?.penalty ?? Infinity).toFixed(2)),
        absoluteActions: workingAbsoluteActions,
        cardState: bestPrefix?.state ? { ...bestPrefix.state } : null,
        programCardIds: bestPrefix?.programCardIds ?? [],
        actionPenalties: bestPrefix?.actionPenalties ?? [],
        actionScarcityPenalties: bestPrefix?.actionScarcityPenalties ?? [],
        actionPlausibilityPenalties: bestPrefix?.actionPlausibilityPenalties ?? [],
        scarcityPenalty: Number((bestPrefix?.scarcityPenalty ?? Infinity).toFixed(3)),
        programPlausibilityPenalty: 0,
        cardStates: bestPrefix?.cardStates ?? [],
        frontier: survivingPrefix
      };
    }
    frontier = next;
    const executedAbsoluteAction = workingAbsoluteActions + 1;
    const forceTurnEnd = forcedTurnEnds.has(actionIndex);
    workingAbsoluteActions = forceTurnEnd
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    currentTurnActions = (forceTurnEnd || workingAbsoluteActions % REGISTER_COUNT === 0)
      ? []
      : nextTurnActions;
  }

  const best = [...frontier.values()].sort(
    (left, right) => left.penalty - right.penalty
  )[0];
  return {
    feasible: Boolean(best),
    failureIndex: null,
    prefixActionCount: actions.length,
    penalty: Number((best?.penalty ?? Infinity).toFixed(2)),
    absoluteActions: workingAbsoluteActions,
    cardState: best?.state ? { ...best.state } : null,
    programCardIds: best?.programCardIds ?? [],
    actionPenalties: best?.actionPenalties ?? [],
    actionScarcityPenalties: best?.actionScarcityPenalties ?? [],
    actionPlausibilityPenalties: best?.actionPlausibilityPenalties ?? [],
    scarcityPenalty: Number((best?.scarcityPenalty ?? Infinity).toFixed(3)),
    programPlausibilityPenalty: 0,
    cardStates: best?.cardStates ?? [],
    frontier: best ? [best] : []
  };
}

export function scoreCompactProgramCardSequence(
  initialCardState,
  absoluteActions,
  actionIds,
  options = {},
  history = [],
  turnEndAfterActionIndexes = null
) {
  const result = scoreCompactProgramCardSequenceUntilFailure(
    initialCardState,
    absoluteActions,
    actionIds,
    options,
    history,
    turnEndAfterActionIndexes
  );
  return {
    feasible: result.feasible,
    penalty: result.feasible ? result.penalty : Infinity,
    scarcityPenalty: result.feasible ? result.scarcityPenalty : Infinity,
    programPlausibilityPenalty: 0,
    absoluteActions: result.absoluteActions,
    cardState: result.feasible ? result.cardState : null,
    programCardIds: result.feasible ? result.programCardIds : [],
    actionScarcityPenalties: result.feasible
      ? result.actionScarcityPenalties
      : [],
    actionPlausibilityPenalties: result.feasible
      ? result.actionPlausibilityPenalties
      : []
  };
}

export function getLiteralProgramResourceStates(actionIds = []) {
  const actions = Array.isArray(actionIds) ? actionIds : [];
  if (actions.length > REGISTER_COUNT) return [];

  const cacheKey = actions.join(".");
  const cached = PROGRAM_RESOURCE_SUMMARY_CACHE.get(`states:${cacheKey}`);
  if (cached) return cached;

  let states = [{
    naturalUses: new Map(),
    againUsed: false,
    againActionId: null
  }];

  actions.forEach((actionId, index) => {
    const cardCount = PROGRAM_CARD_COUNTS.get(actionId);
    if (!cardCount) {
      states = [];
      return;
    }

    const previousActionId = index > 0 ? actions[index - 1] : null;
    const nextStates = [];

    states.forEach((state) => {
      const naturalUses = state.naturalUses.get(actionId) || 0;
      if (naturalUses < cardCount) {
        const nextNaturalUses = new Map(state.naturalUses);
        nextNaturalUses.set(actionId, naturalUses + 1);
        nextStates.push({
          naturalUses: nextNaturalUses,
          againUsed: state.againUsed,
          againActionId: state.againActionId
        });
      }

      if (
        index > 0 &&
        previousActionId === actionId &&
        !state.againUsed
      ) {
        nextStates.push({
          naturalUses: new Map(state.naturalUses),
          againUsed: true,
          againActionId: actionId
        });
      }
    });

    const deduped = new Map();
    nextStates.forEach((state) => {
      const signature = getProgramResourceStateSignature(state);
      if (!deduped.has(signature)) deduped.set(signature, state);
    });
    states = [...deduped.values()];
  });

  PROGRAM_RESOURCE_SUMMARY_CACHE.set(`states:${cacheKey}`, states);
  return states;
}

export function getLiteralProgramResourceSummary(actionIds = []) {
  const actions = Array.isArray(actionIds) ? actionIds : [];
  const key = `summary:${actions.join(".")}`;
  if (PROGRAM_RESOURCE_SUMMARY_CACHE.has(key)) {
    return PROGRAM_RESOURCE_SUMMARY_CACHE.get(key);
  }

  const states = getLiteralProgramResourceStates(actions);
  const summary = {
    feasible: states.length > 0,
    requiresAgain: states.length > 0 && !states.some((state) => !state.againUsed),
    canAvoidAgain: states.some((state) => !state.againUsed),
    minimumScarcityCost: states.length
      ? Math.min(...states.map(getProgramResourceStateScarcityCost))
      : Infinity
  };
  PROGRAM_RESOURCE_SUMMARY_CACHE.set(key, summary);
  return summary;
}

export function areRollingProgramResourceStatesCompatible(previousState, currentState) {
  if (
    Number(Boolean(previousState?.againUsed)) +
      Number(Boolean(currentState?.againUsed)) > AGAIN_CARD_COUNT
  ) {
    return false;
  }

  for (const actionId of PROGRAM_CARD_IDS) {
    const totalUses = (
      (previousState?.naturalUses?.get(actionId) || 0) +
      (currentState?.naturalUses?.get(actionId) || 0)
    );
    if (totalUses > (PROGRAM_CARD_COUNTS.get(actionId) || 0)) {
      return false;
    }
  }
  return true;
}

export function chooseSmall(n, k) {
  const nn = Math.max(0, Math.floor(Number(n) || 0));
  const kk = Math.max(0, Math.floor(Number(k) || 0));
  if (kk > nn) return 0;
  const r = Math.min(kk, nn - kk);
  let value = 1;
  for (let index = 1; index <= r; index += 1) {
    value = value * (nn - r + index) / index;
  }
  return value;
}

export const PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY = Number((
  1 -
  chooseSmall(20 - 4, PROGRAM_EXACT_HAND_SIZE) /
    chooseSmall(20, PROGRAM_EXACT_HAND_SIZE)
).toFixed(12));

export function getProgramAvailabilityPenaltyFromProbability(
  probability,
  adaptabilityFactor = PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR
) {
  const p = Math.max(0, Number(probability) || 0);
  if (p <= 0) return Infinity;
  const availabilityRatio =
    PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY / p;

  // Baseline invariant:
  // P(program) == P(one ordinary four-copy card) -> exactly 0 extra card RE.
  // The factor compresses only scarcity ABOVE that baseline to represent player
  // adaptation / richer real deck-state information omitted by this abstraction.
  const rawScarcityRE = Math.max(0, availabilityRatio - 1);
  const factor = Math.max(0, Number(adaptabilityFactor) || 0);
  return REGISTER_TEMPO_COST * rawScarcityRE * factor;
}

export function getExactProgramDeckCounts(previousCode = 0) {
  return COMPACT_PROGRAM_RESOURCE_IDS.map((resourceId, index) => {
    const fullCount = COMPACT_PROGRAM_RESOURCE_LIMITS[index];
    const used = getCompactProgramResourceCount(previousCode, resourceId);
    return Math.max(0, fullCount - used);
  });
}

export function getExactProgramRequirementVectors(actionIds = []) {
  const states = getLiteralProgramResourceStates(actionIds);
  const vectors = states.map((state) => COMPACT_PROGRAM_RESOURCE_IDS.map((resourceId) => (
    resourceId === "AGAIN"
      ? Number(Boolean(state.againUsed))
      : (state.naturalUses?.get(resourceId) || 0)
  )));

  // If one legal assignment requires a subset of the cards required by another,
  // the larger requirement adds no hand-availability coverage and can be dropped.
  return vectors.filter((candidate, candidateIndex) => !vectors.some((other, otherIndex) => (
    otherIndex !== candidateIndex &&
    other.every((count, index) => count <= candidate[index]) &&
    other.some((count, index) => count < candidate[index])
  )));
}

export function getExactProgramHandAvailabilityProbability(
  previousCode,
  actionIds = [],
  options = {}
) {
  const actions = Array.isArray(actionIds) ? actionIds : [];
  if (!actions.length) return 1;
  const profile = getProgramCardModelProfile(options);
  const safePreviousCode = getProgramCardEffectivePreviousCode(previousCode, options);
  const cacheKey = `${getProgramCardModelSignature(options)}|${safePreviousCode}|${actions.join(".")}`;
  if (PROGRAM_EXACT_AVAILABILITY_CACHE.has(cacheKey)) {
    return PROGRAM_EXACT_AVAILABILITY_CACHE.get(cacheKey);
  }

  const deckCounts = getExactProgramDeckCounts(safePreviousCode);
  const deckSize = deckCounts.reduce((sum, count) => sum + count, 0);
  const handSize = Math.min(profile.handSize, deckSize);
  const requirements = getExactProgramRequirementVectors(actions).filter((vector) => (
    vector.every((count, index) => count <= deckCounts[index])
  ));
  if (!requirements.length || handSize <= 0) {
    PROGRAM_EXACT_AVAILABILITY_CACHE.set(cacheKey, 0);
    return 0;
  }

  const totalWays = chooseSmall(deckSize, handSize);
  let successfulWays = 0;
  const hand = Array(deckCounts.length).fill(0);

  const handSatisfiesAnyRequirement = () => requirements.some((requirement) => (
    requirement.every((count, index) => hand[index] >= count)
  ));

  const enumerateHands = (index, remaining, ways) => {
    if (index === deckCounts.length) {
      if (remaining === 0 && handSatisfiesAnyRequirement()) {
        successfulWays += ways;
      }
      return;
    }
    const maxTake = Math.min(deckCounts[index], remaining);
    for (let take = 0; take <= maxTake; take += 1) {
      hand[index] = take;
      enumerateHands(
        index + 1,
        remaining - take,
        ways * chooseSmall(deckCounts[index], take)
      );
    }
    hand[index] = 0;
  };

  enumerateHands(0, handSize, 1);
  const probability = totalWays > 0
    ? Math.max(0, Math.min(1, successfulWays / totalWays))
    : 0;
  if (PROGRAM_EXACT_AVAILABILITY_CACHE.size >= PROGRAM_EXACT_AVAILABILITY_CACHE_LIMIT) {
    const oldest = PROGRAM_EXACT_AVAILABILITY_CACHE.keys().next().value;
    if (oldest !== undefined) PROGRAM_EXACT_AVAILABILITY_CACHE.delete(oldest);
  }
  PROGRAM_EXACT_AVAILABILITY_CACHE.set(cacheKey, probability);
  return probability;
}

export function getExactProgramAvailabilityPenalty(previousCode, actionIds = [], options = {}) {
  const probability = getExactProgramHandAvailabilityProbability(
    previousCode,
    actionIds,
    options
  );
  if (probability <= 0) return Infinity;
  return Number(
    getProgramAvailabilityPenaltyFromProbability(
      probability,
      getProgramCardModelProfile(options).adaptabilityFactor
    ).toFixed(3)
  );
}

export function getRollingProgramSignatureId(canonicalSignature) {
  if (!ROLLING_PROGRAM_SIGNATURE_IDS.has(canonicalSignature)) {
    ROLLING_PROGRAM_SIGNATURE_IDS.set(
      canonicalSignature,
      nextRollingProgramSignatureId++
    );
  }
  return ROLLING_PROGRAM_SIGNATURE_IDS.get(canonicalSignature);
}

export function getRollingProgramResourceContext(
  history,
  absoluteActionCount,
  candidateActionId = null,
  actionAbsoluteActions = null,
  options = {}
) {
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const window = getProgramHistoryWindow(history);
  const timedWindow = Array.isArray(actionAbsoluteActions)
    ? actionAbsoluteActions.slice(-window.length)
    : null;
  const phase = absoluteActions % REGISTER_COUNT;
  const currentTurn = Math.floor(absoluteActions / REGISTER_COUNT);
  const timingSignature = timedWindow && timedWindow.length === window.length
    ? timedWindow.map((value) => (
      Math.floor((Math.max(1, Number(value) || 1) - 1) / REGISTER_COUNT) - currentTurn
    )).join(",")
    : "-";
  const cacheKey = `${getProgramCardModelSignature(options)}|r${phase}:t${timingSignature}:${window.join(".") || "-"}>${candidateActionId ?? "-"}`;
  if (ROLLING_PROGRAM_CONTEXT_CACHE.has(cacheKey)) {
    return ROLLING_PROGRAM_CONTEXT_CACHE.get(cacheKey);
  }

  const currentTurnActions = getProgramTurnActionsFromHistory(
    window,
    absoluteActions,
    0,
    timedWindow
  );
  if (candidateActionId) currentTurnActions.push(candidateActionId);
  const previousTurnActions = getProgramCardModelProfile(options).previousTurnDepletionActive
    ? getProgramTurnActionsFromHistory(
      window,
      absoluteActions,
      1,
      timedWindow
    )
    : [];

  const currentStates = getLiteralProgramResourceStates(currentTurnActions);
  const previousStates = previousTurnActions.length
    ? getLiteralProgramResourceStates(previousTurnActions)
    : [{ naturalUses: new Map(), againUsed: false, againActionId: null }];

  const compatiblePairs = [];
  let minimumCurrentScarcityCost = Infinity;
  for (const previousState of previousStates) {
    for (const currentState of currentStates) {
      if (!areRollingProgramResourceStatesCompatible(previousState, currentState)) {
        continue;
      }
      const currentScarcityCost = getCheapProgramLiteralAvailabilityPenalty(
        getProgramResourceStateCounts(previousState),
        getProgramResourceStateCounts(currentState),
        options
      );
      minimumCurrentScarcityCost = Math.min(
        minimumCurrentScarcityCost,
        currentScarcityCost
      );
      compatiblePairs.push({ previousState, currentState });
    }
  }

  const pairSignatures = [...new Set(compatiblePairs.map(({ previousState, currentState }) => (
    `${getProgramResourceStateSignature(previousState)}>${getProgramResourceStateSignature(currentState)}`
  )))].sort();
  const currentStateSignatures = [...new Set(compatiblePairs.map(({ currentState }) => (
    getProgramResourceStateSignature(currentState)
  )))].sort();
  const previousStateSignatures = [...new Set(compatiblePairs.map(({ previousState }) => (
    getProgramResourceStateSignature(previousState)
  )))].sort();
  const canonicalSignature = pairSignatures.join(";") || "invalid";
  const result = {
    feasible: compatiblePairs.length > 0,
    phase,
    currentTurnActions,
    previousTurnActions,
    compatiblePairs,
    currentRequiresAgain: compatiblePairs.length > 0 && compatiblePairs.every(
      ({ currentState }) => currentState.againUsed
    ),
    currentCanAvoidAgain: compatiblePairs.some(({ currentState }) => !currentState.againUsed),
    previousRequiresAgain: compatiblePairs.length > 0 && compatiblePairs.every(
      ({ previousState }) => previousState.againUsed
    ),
    minimumCurrentScarcityCost,
    pairSignatureId: getRollingProgramSignatureId(canonicalSignature),
    currentStateSignatureId: getRollingProgramSignatureId(
      currentStateSignatures.join(";") || "current-invalid"
    ),
    previousStateSignatureId: getRollingProgramSignatureId(
      previousStateSignatures.join(";") || "previous-invalid"
    )
  };

  if (ROLLING_PROGRAM_CONTEXT_CACHE.size >= ROLLING_PROGRAM_CONTEXT_CACHE_LIMIT) {
    const oldest = ROLLING_PROGRAM_CONTEXT_CACHE.keys().next().value;
    if (oldest !== undefined) ROLLING_PROGRAM_CONTEXT_CACHE.delete(oldest);
  }
  ROLLING_PROGRAM_CONTEXT_CACHE.set(cacheKey, result);
  return result;
}

export function evaluateProgramActionFromContext(
  before,
  history,
  absoluteActionCount,
  actionId,
  options = {}
) {
  const resolvedBefore = before ?? getRollingProgramResourceContext(
    history,
    absoluteActionCount,
    null,
    options.programHistoryAbsoluteActions,
    options
  );
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const phase = absoluteActions % REGISTER_COUNT;
  const previousActionId = phase > 0
    ? (resolvedBefore.currentTurnActions?.at(-1) ?? "-")
    : "-";
  const transitionCacheKey = `${getProgramCardModelSignature(options)}|${phase}|q${resolvedBefore.pairSignatureId}|p${previousActionId}>${actionId}`;
  const cachedTransition = PROGRAM_ACTION_TRANSITION_CACHE.get(transitionCacheKey);
  if (cachedTransition) {
    const beforeCost = Number.isFinite(resolvedBefore.minimumCurrentScarcityCost)
      ? resolvedBefore.minimumCurrentScarcityCost
      : 0;
    const afterCost = Number.isFinite(cachedTransition.minimumCurrentScarcityCost)
      ? cachedTransition.minimumCurrentScarcityCost
      : beforeCost;
    return {
      feasible: cachedTransition.feasible,
      penalty: cachedTransition.feasible
        ? Number(Math.max(0, afterCost - beforeCost).toFixed(2))
        : Infinity,
      before: resolvedBefore,
      after: cachedTransition
    };
  }

  const after = getRollingProgramResourceContext(
    history,
    absoluteActionCount,
    actionId,
    options.programHistoryAbsoluteActions,
    options
  );
  const cachedAfter = {
    feasible: after.feasible,
    phase: after.phase,
    pairSignatureId: after.pairSignatureId,
    currentStateSignatureId: after.currentStateSignatureId,
    previousStateSignatureId: after.previousStateSignatureId,
    minimumCurrentScarcityCost: after.minimumCurrentScarcityCost,
    currentRequiresAgain: after.currentRequiresAgain,
    currentCanAvoidAgain: after.currentCanAvoidAgain,
    previousRequiresAgain: after.previousRequiresAgain
  };
  if (PROGRAM_ACTION_TRANSITION_CACHE.size >= PROGRAM_ACTION_TRANSITION_CACHE_LIMIT) {
    const oldest = PROGRAM_ACTION_TRANSITION_CACHE.keys().next().value;
    if (oldest !== undefined) PROGRAM_ACTION_TRANSITION_CACHE.delete(oldest);
  }
  PROGRAM_ACTION_TRANSITION_CACHE.set(transitionCacheKey, cachedAfter);

  if (!after.feasible) {
    return { feasible: false, penalty: Infinity, before: resolvedBefore, after: cachedAfter };
  }

  const beforeCost = Number.isFinite(resolvedBefore.minimumCurrentScarcityCost)
    ? resolvedBefore.minimumCurrentScarcityCost
    : 0;
  const afterCost = Number.isFinite(after.minimumCurrentScarcityCost)
    ? after.minimumCurrentScarcityCost
    : beforeCost;
  const penalty = Math.max(0, afterCost - beforeCost);
  return {
    feasible: true,
    penalty: Number(penalty.toFixed(2)),
    before: resolvedBefore,
    after: cachedAfter
  };
}

export function evaluateProgramAction(history, absoluteActionCount, actionId, options = {}) {
  return evaluateProgramActionFromContext(
    getRollingProgramResourceContext(
      history,
      absoluteActionCount,
      null,
      options.programHistoryAbsoluteActions,
      options
    ),
    history,
    absoluteActionCount,
    actionId,
    options
  );
}

export function getCardAvailabilityPressure(history, actionId, options = {}) {
  const absoluteActionCount = Number.isInteger(options.absoluteActionCount)
    ? options.absoluteActionCount
    : history.length;
  return evaluateProgramAction(
    history,
    absoluteActionCount,
    actionId,
    options
  ).penalty;
}

export function getProgramHistoryWindow(history) {
  return (history || []).slice(-PROGRAM_HISTORY_WINDOW_SIZE);
}

export function scoreContextualCardSequence(
  history,
  absoluteActions,
  actionIds,
  options = {},
  initialProgramCardState = null,
  transitions = []
) {
  const workingHistory = getProgramHistoryWindow(history);
  const initialCardState = initialProgramCardState
    ? { ...initialProgramCardState }
    : getCompactProgramCardStateFromHistory(
      workingHistory,
      absoluteActions,
      options
    );
  const compact = scoreCompactProgramCardSequence(
    initialCardState,
    absoluteActions,
    actionIds,
    options,
    workingHistory,
    getTurnEndAfterActionIndexes(transitions)
  );
  return {
    feasible: compact.feasible,
    penalty: compact.penalty,
    scarcityPenalty: compact.scarcityPenalty,
    programPlausibilityPenalty: compact.programPlausibilityPenalty,
    actionScarcityPenalties: compact.actionScarcityPenalties,
    actionPlausibilityPenalties: compact.actionPlausibilityPenalties,
    history: compact.feasible
      ? getProgramHistoryWindow([
        ...workingHistory,
        ...(actionIds || [])
      ])
      : workingHistory,
    absoluteActions: compact.absoluteActions,
    programCardState: compact.cardState,
    programCardIds: compact.programCardIds
  };
}
