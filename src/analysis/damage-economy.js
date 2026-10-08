// Robo Rally Course Randomizer - damage economy mechanics: SPAM/haywire state, clog curves, relief opportunities, realized damage per transition
import { getEffectiveLaserDamage } from "../../feature-weights.js";
import {
  getLedgeSides,
  hasActiveFeature,
  hasRampForDir,
  isBoundaryBlockedByWalls,
  isFeatureActiveThisRegister,
  isOil,
  isWater,
  tileKey
} from "./board-geometry.js";
import {
  DIRS,
  OPPOSITE,
  PROGRAM_CARD_COUNTS,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST
} from "./constants.js";
import { clamp } from "../shared/math.js";
import {
  canMoveBetween,
  getFlamethrowerDamagePenalty,
  getLedgePressurePenalty,
  getPitPressurePenalty,
  getTilePenalty,
  hasFeatureType
} from "./movement.js";
import {
  PROGRAM_EXACT_HAND_SIZE,
  chooseSmall,
  encodeCompactProgramResourceState,
  getExactProgramDeckCounts,
  getExactProgramRequirementVectors,
  getProgramAvailabilityPenaltyFromProbability,
  getProgramCardEffectivePreviousCode,
  getProgramCardModelProfile
} from "./program-availability.js";
import {
  getRebootEndedAbsoluteActions,
  getRegisterPosition,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";

// DAMAGE_CONTROL_RE_OWNER_BEGIN
// v49ab-damage9-pressure-reroute production-economy foundation. This remains a route
// difficulty/fairness estimator, not a literal deck/hand/register simulator.
// The state deliberately separates three consequences that were incorrectly
// collapsed in the withdrawn v49t prototype:
//   * persistent SPAM total burden;
//   * the expected subset of SPAM retained in hand;
//   * transient next-turn Haywire clog pressure.
//
// Fractions remain authoritative for accumulation and relief. Expensive card
// calculations use rounded effective SPAM counts so 0.68/0.99/1.47 do not create
// separate cache universes unnecessarily. Haywire is different: damage received
// in one register has an exact probability of producing at least one Haywire,
// capped at one meaningful Haywire for that damage register. Those five capped
// probabilities form a turn-level clog-count distribution for the NEXT game turn.
// Haywire then expires after that programming turn; it is not persistent damage.
//
// The raw chronology still keeps the five routed movement cards as the route
// approximation even when damage would physically occupy
// registers. Passive SPAM affects deck/hand supply, while SPAM contributes
// control-clog only when the model actually spends it through forced or elective
// relief. Haywire and SPAM-play clog then share one nonlinear control-loss curve.
// Permanent Shutdown, when paired with Critical SPAM, does not synthesize literal
// elimination probability. Instead it scales ONLY SPAM supply RE upward with
// persistent SPAM burden; the provisional curve is intentionally calibration debt.
// The 5-RE Shutdown value is now a scoring abstraction, not a forecasted literal
// Shutdown decision. A separate auxiliary replay accumulates damage-economy RE in
// segments; whenever a segment reaches the five-register Shutdown region and more
// programming remains, it records one 5-RE shutdown-equivalent episode, clears only
// that scoring replay's damage state, and continues. The raw chronology remains
// untouched; only the compressed shutdown-equivalent result is used for routing.
export const DAMAGE_ECONOMY_MODEL_ID = "damage-economy-v10-randomizer-shared-clog";
export const DAMAGE_ECONOMY_SPAM_SHARE = 23 / 40;
export const DAMAGE_ECONOMY_HAYWIRE_SHARE = 17 / 40;
export const DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE = REGISTER_COUNT;
// Permanent Shutdown makes persistent SPAM strategically worse because a heavily
// polluted hand can become game-ending. v49ep deliberately starts with a simple
// calibration curve rather than pretending to model literal elimination odds:
//
//   multiplier = 1 + c * S * (S + 1), c = 0.025
//
// where S is the fractional persistent SPAM burden at the programming boundary.
// Anchors: S=1 -> 1.05x, 3 -> 1.30x, 5 -> 1.75x, 8 -> 2.80x.
// This multiplier applies ONLY to SPAM supply/card-scarcity RE. It does not
// multiply Haywire or SPAM-play clog/control RE, and it creates no mental event.
// There is intentionally no hard cap; exact calibration is explicitly deferred.
export const PERMANENT_SHUTDOWN_SPAM_BURDEN_COEFFICIENT = 0.025;
// Critical SPAM physically keeps played SPAM in the player's damage-bearing card
// cycle. The estimator does not simulate literal Shutdown declarations/recovery,
// so v49eq gives each modeled SPAM-play removal a small provisional escape hatch:
// 20% is treated as effectively relieved and 80% returns to pending SPAM for the
// next programming boundary. This is NOT literal rule text; it is explicit
// calibration debt that prevents permanent one-way SPAM accumulation in a model
// that omits some real recovery opportunities.
export const CRITICAL_SPAM_PLAY_RELIEF_FRACTION = 0.20;
export const CRITICAL_SPAM_PLAY_RETURN_TO_PENDING_FRACTION =
  1 - CRITICAL_SPAM_PLAY_RELIEF_FRACTION;
export const DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE = new Map();
export const DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE_LIMIT = 512;
export const DAMAGE_ECONOMY_PROGRAM_CACHE = new Map();
export const DAMAGE_ECONOMY_PROGRAM_CACHE_LIMIT = 16000;
export const DAMAGE_ECONOMY_SPAM_DRAW_CACHE = new Map();
export const DAMAGE_ECONOMY_SPAM_DRAW_CACHE_LIMIT = 8000;
export let DAMAGE_ECONOMY_ROUTE_SUMMARY_CACHE = new WeakMap();
export let DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE = new WeakMap();
// Reset by clearAnalysisCaches. A module-level binding can only be reassigned
// by its own module, so each reassigned cache has a reset function beside it.
export function resetDamageEconomyRouteSummaryCaches() {
  DAMAGE_ECONOMY_ROUTE_SUMMARY_CACHE = new WeakMap();
  DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE = new WeakMap();
}
export const DAMAGE_ECONOMY_TELEMETRY = {
  effectiveStateLookups: 0,
  effectiveStateCacheHits: 0,
  effectiveStateCacheMisses: 0,
  programLookups: 0,
  programCacheHits: 0,
  programCacheMisses: 0,
  spamDrawLookups: 0,
  spamDrawCacheHits: 0,
  spamDrawCacheMisses: 0,
  routeSummaryLookups: 0,
  routeSummaryCacheHits: 0,
  routeSummaryCacheMisses: 0,
  shutdownScoringReplayCount: 0,
  shutdownScoringReplayTurns: 0
};

export function roundDamageEconomyPressure(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function getPermanentShutdownSpamSupplyMultiplier(spamBurden, options = {}) {
  if (!(options.permanentShutdown && options.criticalSpam)) return 1;
  const burden = Math.max(0, Number(spamBurden) || 0);
  return 1 + (
    PERMANENT_SHUTDOWN_SPAM_BURDEN_COEFFICIENT *
    burden *
    (burden + 1)
  );
}

export function getDamageEconomyVariantProfile(options = {}) {
  // Centralized variant seam. Hooks marked implemented below are implemented only
  // inside this observational damage ledger unless they were already authoritative
  // physical mechanics elsewhere. Deferred hooks stay visible so promotion cannot
  // silently bypass them later.
  const activeHooks = [
    options.moreDeadlyGame ? "moreDeadlyGame" : null,
    options.lessSpammyGame ? "lessSpammyGame" : null,
    options.criticalSpam ? "criticalSpam" : null,
    options.criticalHaywire ? "criticalHaywire" : null,
    options.permanentShutdown ? "permanentShutdown" : null,
    options.factoryRejects ? "factoryRejects" : null,
    options.lessForeshadowing ? "lessForeshadowing" : null,
    options.classicSharedDeck ? "classicSharedDeck" : null,
    options.repairStations ? "repairStations" : null,
    options.cuttingFloor ? "cuttingFloor" : null,
    options.flamingOil ? "flamingOil" : null,
    options.setToKill ? "setToKill" : null,
    options.setToStun ? "setToStun" : null
  ].filter(Boolean);
  const implementedHooks = [
    options.moreDeadlyGame ? "moreDeadlyGame" : null,
    options.cuttingFloor ? "cuttingFloor" : null,
    options.flamingOil ? "flamingOil" : null,
    options.repairStations ? "repairStations" : null,
    options.factoryRejects ? "factoryRejects" : null,
    options.lessForeshadowing ? "lessForeshadowing" : null,
    options.classicSharedDeck ? "classicSharedDeck" : null,
    options.criticalHaywire ? "criticalHaywire" : null,
    options.lessSpammyGame ? "lessSpammyGame" : null,
    options.criticalSpam ? "criticalSpam" : null,
    (options.permanentShutdown && options.criticalSpam) ? "permanentShutdown" : null,
    options.setToKill ? "setToKill" : null,
    options.setToStun ? "setToStun" : null
  ].filter(Boolean);
  const deferredHooks = activeHooks.filter((id) => !implementedHooks.includes(id));
  return {
    activeHooks,
    implementedHooks,
    deferredHooks,
    spamShare: DAMAGE_ECONOMY_SPAM_SHARE,
    haywireShare: DAMAGE_ECONOMY_HAYWIRE_SHARE,
    handSize: getProgramCardModelProfile(options).handSize,
    cardScarcityAdaptabilityFactor: getProgramCardModelProfile(options).adaptabilityFactor,
    resetProgrammingDeckEachTurn: Boolean(options.lessForeshadowing),
    sharedDeckDamageToHand: Boolean(options.classicSharedDeck),
    criticalHaywireCountsAgainstHand: Boolean(options.criticalHaywire),
    spamFilter: Boolean(options.lessSpammyGame),
    criticalSpam: Boolean(options.criticalSpam),
    criticalSpamPlayReliefFraction: CRITICAL_SPAM_PLAY_RELIEF_FRACTION,
    criticalSpamPlayReturnToPendingFraction:
      CRITICAL_SPAM_PLAY_RETURN_TO_PENDING_FRACTION,
    permanentShutdownPressureActive: Boolean(
      options.permanentShutdown && options.criticalSpam
    ),
    permanentShutdownSpamBurdenCoefficient:
      PERMANENT_SHUTDOWN_SPAM_BURDEN_COEFFICIENT,
    // Robot-laser optional rules change damage consequences, never LOS / occupancy.
    // Set to Kill means two damage-card draws per successful robot-laser hit.
    // Set to Stun still resolves those damage cards normally for Haywire, but SPAM
    // drawn from robot-laser damage goes to the damage discard pile. In this
    // expected-state model that means it never enters persistent SPAM state.
    robotLaserDamagePerHit: options.setToKill ? 2 : 1,
    robotLaserSpamSuppressed: Boolean(options.setToStun)
  };
}

export function getDamageEconomyHaywireEventProbability(damageUnits) {
  const units = Math.max(0, Number(damageUnits) || 0);
  if (units <= 0) return 0;
  // n certain damage draws in one register can create at most one meaningful
  // Haywire clog for the next game turn. Probabilistic robot-laser hits are
  // composed separately as Bernoulli opportunities rather than exponentiating a
  // fractional expected-damage total.
  return clamp(1 - ((1 - DAMAGE_ECONOMY_HAYWIRE_SHARE) ** units), 0, 1);
}

export function combineDamageEconomyProbability(existing, added) {
  const a = clamp(Number(existing) || 0, 0, 1);
  const b = clamp(Number(added) || 0, 0, 1);
  return clamp(1 - (1 - a) * (1 - b), 0, 1);
}

export function getDamageEconomyExpectedCount(distribution = []) {
  return distribution.reduce((sum, probability, count) => (
    sum + (Number(probability) || 0) * count
  ), 0);
}

export function createDamageEconomyState() {
  return {
    activeTurn: 1,
    spamTotal: 0,
    spamHeld: 0,
    pendingSpam: 0,
    activeHaywireDistribution: [1, 0, 0, 0, 0, 0],
    pendingHaywireRegisterRisks: Array(REGISTER_COUNT).fill(0)
  };
}

export function advanceDamageEconomyToTurn(state, turn, options = {}) {
  const targetTurn = Math.max(1, Math.floor(Number(turn) || 1));
  while (state.activeTurn < targetTurn) {
    // Damage received in Turn N cannot affect its already-chosen program. At the
    // next programming boundary SPAM joins the persistent circulating burden and
    // Haywire becomes the one-turn clog distribution derived from the capped
    // damage-register risks. A further empty boundary expires Haywire naturally.
    const pendingSpam = Math.max(0, Number(state.pendingSpam) || 0);
    state.spamTotal += pendingSpam;
    if (options.classicSharedDeck && pendingSpam > 0) {
      // Shared Deck: damage SPAM enters the affected player's hand directly at
      // the next programming boundary instead of first becoming anonymous
      // circulating/discard-pile burden. This is the deliberate single-player
      // approximation; cross-robot hands/deck order remain unmodeled.
      state.spamHeld = Math.min(state.spamTotal, state.spamHeld + pendingSpam);
    }
    state.pendingSpam = 0;
    state.activeHaywireDistribution = getDamageEconomyPoissonBinomialDistribution(
      state.pendingHaywireRegisterRisks
    );
    state.pendingHaywireRegisterRisks = Array(REGISTER_COUNT).fill(0);
    state.activeTurn += 1;
  }
  state.spamHeld = Math.min(state.spamTotal, Math.max(0, state.spamHeld));
  return state;
}

export function applyDamageEconomySpamPlayOutcome(
  state,
  nominalPlayedSpam,
  profile = {}
) {
  const available = Math.max(0, Number(state?.spamTotal) || 0);
  const movedOutOfCurrentBurden = Math.min(
    available,
    Math.max(0, Number(nominalPlayedSpam) || 0)
  );
  if (movedOutOfCurrentBurden <= 0) {
    return {
      movedOutOfCurrentBurden: 0,
      relieved: 0,
      returnedToPending: 0
    };
  }

  state.spamTotal = Math.max(0, available - movedOutOfCurrentBurden);
  if (!profile.criticalSpam) {
    return {
      movedOutOfCurrentBurden,
      relieved: movedOutOfCurrentBurden,
      returnedToPending: 0
    };
  }

  const relieved =
    movedOutOfCurrentBurden * CRITICAL_SPAM_PLAY_RELIEF_FRACTION;
  const returnedToPending = Math.max(
    0,
    movedOutOfCurrentBurden - relieved
  );
  state.pendingSpam = Math.max(
    0,
    (Number(state.pendingSpam) || 0) + returnedToPending
  );
  return {
    movedOutOfCurrentBurden,
    relieved,
    returnedToPending
  };
}

export function applyExpectedDamageToEconomyState(
  state,
  damageUnits,
  register,
  haywireEventProbabilityOverride = null,
  spamDamageUnitsOverride = null
) {
  const units = Math.max(0, Number(damageUnits) || 0);
  if (units <= 0) {
    return { spamAdded: 0, haywireRegisterRiskAdded: 0, haywireRegisterRiskAfter: 0 };
  }
  const safeRegister = Math.max(1, Math.min(
    REGISTER_COUNT,
    Math.floor(Number(register) || 1)
  ));
  const spamDamageUnits = (
    spamDamageUnitsOverride !== null &&
    spamDamageUnitsOverride !== undefined &&
    Number.isFinite(Number(spamDamageUnitsOverride))
  )
    ? Math.max(0, Number(spamDamageUnitsOverride))
    : units;
  const spamAdded = spamDamageUnits * DAMAGE_ECONOMY_SPAM_SHARE;
  const hasHaywireOverride =
    haywireEventProbabilityOverride !== null &&
    haywireEventProbabilityOverride !== undefined &&
    Number.isFinite(Number(haywireEventProbabilityOverride));
  const eventHaywireRisk = hasHaywireOverride
    ? clamp(Number(haywireEventProbabilityOverride), 0, 1)
    : getDamageEconomyHaywireEventProbability(units);
  const index = safeRegister - 1;
  const before = state.pendingHaywireRegisterRisks[index] || 0;
  const after = combineDamageEconomyProbability(before, eventHaywireRisk);
  state.pendingSpam += spamAdded;
  state.pendingHaywireRegisterRisks[index] = after;
  return {
    spamAdded,
    haywireRegisterRiskAdded: Math.max(0, after - before),
    haywireRegisterRiskAfter: after
  };
}

export function getDamageEconomyRegisterHaywireEventProbability(
  deterministicDamageUnits,
  robotLaserHitProbabilities = [],
  robotLaserDamagePerHit = 1
) {
  const deterministicRisk = getDamageEconomyHaywireEventProbability(
    Math.max(0, Number(deterministicDamageUnits) || 0)
  );
  const damageCardsPerHit = Math.max(1, Math.round(Number(robotLaserDamagePerHit) || 1));
  const haywireGivenHit = clamp(
    1 - ((1 - DAMAGE_ECONOMY_HAYWIRE_SHARE) ** damageCardsPerHit),
    0,
    1
  );
  let noRobotHaywireProbability = 1;
  for (const hitProbabilityRaw of robotLaserHitProbabilities || []) {
    const hitProbability = clamp(Number(hitProbabilityRaw) || 0, 0, 1);
    noRobotHaywireProbability *= 1 - haywireGivenHit * hitProbability;
  }
  const robotLaserRisk = clamp(1 - noRobotHaywireProbability, 0, 1);
  return combineDamageEconomyProbability(deterministicRisk, robotLaserRisk);
}

export function getDamageEconomyEffectiveSpamState(state, options = {}) {
  const profile = getDamageEconomyVariantProfile(options);
  const held = Math.min(profile.handSize, roundDamageEconomyPressure(state?.spamHeld));
  const circulatingFraction = Math.max(
    0,
    (Number(state?.spamTotal) || 0) - (Number(state?.spamHeld) || 0)
  );
  const circulating = roundDamageEconomyPressure(circulatingFraction);
  const key = `${held}|${circulating}|h${profile.handSize}`;
  DAMAGE_ECONOMY_TELEMETRY.effectiveStateLookups += 1;
  if (DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.has(key)) {
    DAMAGE_ECONOMY_TELEMETRY.effectiveStateCacheHits += 1;
    return DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.get(key);
  }
  DAMAGE_ECONOMY_TELEMETRY.effectiveStateCacheMisses += 1;
  const value = Object.freeze({
    heldSpam: held,
    circulatingSpam: circulating,
    effectiveTotalSpam: held + circulating,
    baseHandSize: profile.handSize
  });
  if (DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.size >= DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE_LIMIT) {
    const oldest = DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.keys().next().value;
    if (oldest !== undefined) DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.delete(oldest);
  }
  DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.set(key, value);
  return value;
}

export function getDamageEconomySpamDrawDistributionInteger(baseDeckSize, spamCount, drawSlots) {
  const safeBaseDeckSize = Math.max(0, Math.floor(Number(baseDeckSize) || 0));
  const safeSpamCount = Math.max(0, Math.floor(Number(spamCount) || 0));
  const deckSize = safeBaseDeckSize + safeSpamCount;
  const safeDrawSlots = Math.max(0, Math.min(
    Math.floor(Number(drawSlots) || 0),
    deckSize
  ));
  const key = `${safeBaseDeckSize}|${safeSpamCount}|d${safeDrawSlots}`;
  DAMAGE_ECONOMY_TELEMETRY.spamDrawLookups += 1;
  if (DAMAGE_ECONOMY_SPAM_DRAW_CACHE.has(key)) {
    DAMAGE_ECONOMY_TELEMETRY.spamDrawCacheHits += 1;
    return DAMAGE_ECONOMY_SPAM_DRAW_CACHE.get(key);
  }
  DAMAGE_ECONOMY_TELEMETRY.spamDrawCacheMisses += 1;
  const totalWays = chooseSmall(deckSize, safeDrawSlots);
  const distribution = Array(safeDrawSlots + 1).fill(0);
  for (let spamDrawn = 0; spamDrawn <= safeDrawSlots; spamDrawn += 1) {
    const normalDrawn = safeDrawSlots - spamDrawn;
    if (spamDrawn > safeSpamCount || normalDrawn > safeBaseDeckSize) continue;
    distribution[spamDrawn] = totalWays > 0
      ? chooseSmall(safeSpamCount, spamDrawn) *
        chooseSmall(safeBaseDeckSize, normalDrawn) / totalWays
      : (safeDrawSlots === 0 ? 1 : 0);
  }
  if (safeDrawSlots === 0) distribution[0] = 1;
  const value = Object.freeze({
    drawSlots: safeDrawSlots,
    deckSize,
    distribution: Object.freeze(distribution)
  });
  if (DAMAGE_ECONOMY_SPAM_DRAW_CACHE.size >= DAMAGE_ECONOMY_SPAM_DRAW_CACHE_LIMIT) {
    const oldest = DAMAGE_ECONOMY_SPAM_DRAW_CACHE.keys().next().value;
    if (oldest !== undefined) DAMAGE_ECONOMY_SPAM_DRAW_CACHE.delete(oldest);
  }
  DAMAGE_ECONOMY_SPAM_DRAW_CACHE.set(key, value);
  return value;
}

export function getDamageEconomyProgramAvailabilityProbabilityInteger(
  previousCode,
  actionIds = [],
  circulatingSpam = 0,
  heldSpam = 0,
  targetHandSize = PROGRAM_EXACT_HAND_SIZE
) {
  const safePreviousCode = Math.max(0, Math.floor(Number(previousCode) || 0));
  const safeCirculatingSpam = Math.max(0, Math.floor(Number(circulatingSpam) || 0));
  const safeHeldSpam = Math.max(0, Math.floor(Number(heldSpam) || 0));
  const safeTargetHandSize = Math.max(0, Math.floor(Number(targetHandSize) || 0));
  const actions = Array.isArray(actionIds) ? actionIds : [];
  if (!actions.length) return 1;
  const key = `${safePreviousCode}|${actions.join(".")}|c${safeCirculatingSpam}|held${safeHeldSpam}|h${safeTargetHandSize}|floor5`;
  DAMAGE_ECONOMY_TELEMETRY.programLookups += 1;
  if (DAMAGE_ECONOMY_PROGRAM_CACHE.has(key)) {
    DAMAGE_ECONOMY_TELEMETRY.programCacheHits += 1;
    return DAMAGE_ECONOMY_PROGRAM_CACHE.get(key);
  }
  DAMAGE_ECONOMY_TELEMETRY.programCacheMisses += 1;

  const baseDeckSize = getExactProgramDeckCounts(safePreviousCode)
    .reduce((sum, count) => sum + count, 0);
  const deckSize = baseDeckSize + safeCirculatingSpam;
  const drawSlots = Math.max(0, Math.min(
    safeTargetHandSize - safeHeldSpam,
    deckSize
  ));
  const spamDraw = getDamageEconomySpamDrawDistributionInteger(
    baseDeckSize,
    safeCirculatingSpam,
    drawSlots
  );
  let probability = 0;
  spamDraw.distribution.forEach((spamProbability, spamDrawn) => {
    if (spamProbability <= 0) return;
    const actualNormalCards = Math.max(0, drawSlots - spamDrawn);
    // The route abstraction always retains five intended movement cards. When
    // damage would leave fewer than five normal cards, the deficit is represented
    // separately as forced SPAM relief/clog rather than making the routed program
    // itself disappear. Therefore card-supply probability never samples fewer
    // than five normal cards from the base deck.
    const modeledNormalCards = Math.min(
      baseDeckSize,
      Math.max(REGISTER_COUNT, actualNormalCards)
    );
    const totalBaseWays = chooseSmall(baseDeckSize, modeledNormalCards);
    const successfulBaseWays = getDamageEconomyBaseProgramSuccessfulWays(
      safePreviousCode,
      actions,
      modeledNormalCards
    );
    const conditionalProbability = totalBaseWays > 0
      ? clamp(successfulBaseWays / totalBaseWays, 0, 1)
      : 0;
    probability += spamProbability * conditionalProbability;
  });
  probability = clamp(probability, 0, 1);
  if (DAMAGE_ECONOMY_PROGRAM_CACHE.size >= DAMAGE_ECONOMY_PROGRAM_CACHE_LIMIT) {
    const oldest = DAMAGE_ECONOMY_PROGRAM_CACHE.keys().next().value;
    if (oldest !== undefined) DAMAGE_ECONOMY_PROGRAM_CACHE.delete(oldest);
  }
  DAMAGE_ECONOMY_PROGRAM_CACHE.set(key, probability);
  return probability;
}

export function getDamageEconomyProgrammingSummary(
  previousCode,
  actionIds,
  state,
  options = {}
) {
  const profile = getDamageEconomyVariantProfile(options);
  const effectiveSpam = getDamageEconomyEffectiveSpamState(state, options);
  const actions = Array.isArray(actionIds) ? actionIds : [];
  const programRegisters = Math.max(0, Math.min(REGISTER_COUNT, actions.length));
  const haywireDistribution = Array.isArray(state?.activeHaywireDistribution)
    ? state.activeHaywireDistribution
    : [1, 0, 0, 0, 0, 0];
  const expectedHaywireClogs = getDamageEconomyExpectedCount(haywireDistribution);
  const effectivePreviousCode = getProgramCardEffectivePreviousCode(previousCode, options);
  const baseDeckSize = getExactProgramDeckCounts(effectivePreviousCode)
    .reduce((sum, count) => sum + count, 0);

  const cleanProgramProbability = getDamageEconomyProgramAvailabilityProbabilityInteger(
    effectivePreviousCode,
    actions,
    0,
    0,
    profile.handSize
  );
  let damagedProgramProbability = 0;
  let expectedSpamDrawn = 0;
  let expectedFreshDrawSlots = 0;
  let expectedForcedSpamReliefInitiations = 0;
  const forcedSpamHaywireJointDistribution = Array.from(
    { length: REGISTER_COUNT + 1 },
    () => Array(REGISTER_COUNT + 1).fill(0)
  );

  haywireDistribution.forEach((haywireProbability, haywireCountRaw) => {
    if (haywireProbability <= 0) return;
    const haywireCount = Math.min(REGISTER_COUNT, haywireCountRaw);
    const targetHandSize = Math.max(
      0,
      profile.handSize - (profile.criticalHaywireCountsAgainstHand ? haywireCount : 0)
    );
    const drawSlots = Math.max(0, Math.min(
      targetHandSize - effectiveSpam.heldSpam,
      baseDeckSize + effectiveSpam.circulatingSpam
    ));
    expectedFreshDrawSlots += haywireProbability * drawSlots;
    damagedProgramProbability += haywireProbability *
      getDamageEconomyProgramAvailabilityProbabilityInteger(
        effectivePreviousCode,
        actions,
        effectiveSpam.circulatingSpam,
        effectiveSpam.heldSpam,
        targetHandSize
      );

    const spamDraw = getDamageEconomySpamDrawDistributionInteger(
      baseDeckSize,
      effectiveSpam.circulatingSpam,
      drawSlots
    );
    spamDraw.distribution.forEach((spamProbability, spamDrawn) => {
      if (spamProbability <= 0) return;
      const joint = haywireProbability * spamProbability;
      expectedSpamDrawn += joint * spamDrawn;
      const normalCardsInHand = Math.max(0, drawSlots - spamDrawn);
      // Always keep five intended routed cards. If SPAM pressure would leave fewer
      // than five normal cards, the shortfall is not a missing route card: it is an
      // automatic SPAM play/relief expectation for this turn, which is charged as
      // SPAM clog later together with any elective relief and Haywire.
      const forcedSpamRelief = Math.min(
        REGISTER_COUNT,
        effectiveSpam.heldSpam + spamDrawn,
        Math.max(0, REGISTER_COUNT - normalCardsInHand)
      );
      expectedForcedSpamReliefInitiations += joint * forcedSpamRelief;
      forcedSpamHaywireJointDistribution[haywireCount][forcedSpamRelief] += joint;
    });
  });

  const cleanPenaltyScore = getDamageEconomyAvailabilityPenaltyFromProbability(
    cleanProgramProbability,
    options
  );
  const damagedPenaltyScore = getDamageEconomyAvailabilityPenaltyFromProbability(
    damagedProgramProbability,
    options
  );
  const spamSupplyScore = (
    Number.isFinite(cleanPenaltyScore) && Number.isFinite(damagedPenaltyScore)
  )
    ? Math.max(0, damagedPenaltyScore - cleanPenaltyScore)
    : 0;
  const rawSpamSupplyRegisterEquivalents = spamSupplyScore / REGISTER_TEMPO_COST;
  const permanentShutdownSpamBurden = Math.max(
    0,
    Number(state?.spamTotal) || 0
  );
  const permanentShutdownSupplyMultiplier =
    getPermanentShutdownSpamSupplyMultiplier(
      permanentShutdownSpamBurden,
      options
    );
  const spamSupplyRegisterEquivalents =
    rawSpamSupplyRegisterEquivalents * permanentShutdownSupplyMultiplier;
  const permanentShutdownPressureRegisterEquivalents = Math.max(
    0,
    spamSupplyRegisterEquivalents - rawSpamSupplyRegisterEquivalents
  );

  return {
    baseHandSize: profile.handSize,
    baseDeckSize,
    cardScarcityAdaptabilityFactor: profile.cardScarcityAdaptabilityFactor,
    resetProgrammingDeckEachTurn: profile.resetProgrammingDeckEachTurn,
    sharedDeckDamageToHand: profile.sharedDeckDamageToHand,
    effectiveHeldSpam: effectiveSpam.heldSpam,
    effectiveCirculatingSpam: effectiveSpam.circulatingSpam,
    effectiveTotalSpam: effectiveSpam.effectiveTotalSpam,
    expectedFreshDrawSlots,
    expectedSpamDrawn,
    expectedSpamInHand: Math.max(0, (Number(state?.spamHeld) || 0) + expectedSpamDrawn),
    expectedHaywireClogs,
    haywireDistribution: [...haywireDistribution],
    expectedForcedSpamReliefInitiations,
    forcedSpamHaywireJointDistribution: forcedSpamHaywireJointDistribution.map(
      (row) => [...row]
    ),
    cleanProgramProbability,
    damagedProgramProbability,
    rawSpamSupplyRegisterEquivalents,
    permanentShutdownSpamBurden,
    permanentShutdownSupplyMultiplier,
    permanentShutdownPressureRegisterEquivalents,
    spamSupplyRegisterEquivalents
  };
}

export function getDamageEconomyTelemetrySnapshot() {
  return {
    ...DAMAGE_ECONOMY_TELEMETRY,
    effectiveStateCacheSize: DAMAGE_ECONOMY_EFFECTIVE_STATE_CACHE.size,
    programCacheSize: DAMAGE_ECONOMY_PROGRAM_CACHE.size,
    spamDrawCacheSize: DAMAGE_ECONOMY_SPAM_DRAW_CACHE.size
  };
}


// v49dd owner extraction: the helpers below are live damage/control/RE machinery.
// They were historically nested under a diagnostic shadow banner even after the damage
// economy became production-active. Keep these constants/mechanics behavior-identical;
// the retired full shadow replay and its suppression-only branches are removed.
export const DAMAGE_ECONOMY_RELIEF_TIMING_ALLOWANCE = Object.freeze([
  0.08, 0.30, 0.65, 0.95, 1.00
]);
export const DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT = 2;
// v49fh: beginning a register on a Randomizer surrenders the same amount of
// control as one SPAM play. It enters the SAME turn-level nonlinear clog curve;
// it is not a standalone feature-score difficulty bonus.
export const DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT = DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT;
export const DAMAGE_ECONOMY_RELIEF_FORCED_ROTATION_PENALTY = 0.15;
export const DAMAGE_ECONOMY_RELIEF_FORCED_MOVEMENT_PENALTY = 0.12;
export const DAMAGE_ECONOMY_RELIEF_CONVEYOR_STEP_BONUS = 0.06;
export const DAMAGE_ECONOMY_RELIEF_CONVEYOR_BONUS_MAX = 0.18;
export const DAMAGE_ECONOMY_RELIEF_FORWARD_DISTANCE_WEIGHTS = Object.freeze([1, 0.60, 0.35]);
export const DAMAGE_ECONOMY_RELIEF_WALL_BONUS_BY_DISTANCE = Object.freeze([0.32, 0.18, 0.08]);
export const DAMAGE_ECONOMY_RELIEF_FORWARD_HAZARD_PENALTY_MAX = 0.55;
export const DAMAGE_ECONOMY_RELIEF_CONTINUITY_BONUS_MAX = 0.15;
export const DAMAGE_ECONOMY_CLOG_RE_BY_COUNT = Object.freeze([0, 1, 2.2, 3.6, 5.4, 7.5]);
export const DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE = new Map();
export const DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE_LIMIT = 12000;

export function interpolateDamageEconomyCurve(value, points) {
  const x = Math.max(0, Number(value) || 0);
  if (!points.length) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    if (x <= x2) {
      const span = Math.max(0.000001, x2 - x1);
      const t = clamp((x - x1) / span, 0, 1);
      return y1 + (y2 - y1) * t;
    }
  }
  return points[points.length - 1][1];
}

export function getDamageEconomyClogCurveRegisterEquivalents(clogCount) {
  return interpolateDamageEconomyCurve(clogCount, DAMAGE_ECONOMY_CLOG_RE_BY_COUNT.map(
    (value, count) => [count, value]
  ));
}

export function getDamageEconomyClogRegisterEquivalents(clogLoad) {
  const load = Math.max(0, Number(clogLoad) || 0);
  if (load <= REGISTER_COUNT) {
    return getDamageEconomyClogCurveRegisterEquivalents(load);
  }
  // The old 0..5 anchors describe one turn of increasingly uncontrolled
  // registers. SPAM relief can deliberately surrender more than one register-
  // equivalent of control per played SPAM, so the active economy must not flatten
  // at five. Continue from the last observed slope (5.4 -> 7.5 = +2.1 RE) rather
  // than inventing a second nonlinear family beyond the established anchors.
  return DAMAGE_ECONOMY_CLOG_RE_BY_COUNT[REGISTER_COUNT] +
    (load - REGISTER_COUNT) *
    (DAMAGE_ECONOMY_CLOG_RE_BY_COUNT[REGISTER_COUNT] -
      DAMAGE_ECONOMY_CLOG_RE_BY_COUNT[REGISTER_COUNT - 1]);
}

export function getDamageEconomyAdjustedForcedSpamHaywireJointDistribution(
  jointDistribution = [],
  targetExpectedForcedSpamPlays = 0
) {
  const baseExpected = (jointDistribution || []).reduce(
    (sum, row) => sum + (row || []).reduce(
      (rowSum, probability, forcedSpamPlays) => (
        rowSum + (Number(probability) || 0) * forcedSpamPlays
      ),
      0
    ),
    0
  );
  const target = Math.max(0, Number(targetExpectedForcedSpamPlays) || 0);
  if (!(baseExpected > 0) || target >= baseExpected - 1e-9) {
    return (jointDistribution || []).map((row) => [...(row || [])]);
  }
  const keepProbability = clamp(target / baseExpected, 0, 1);
  const adjusted = Array.from(
    { length: REGISTER_COUNT + 1 },
    () => Array(REGISTER_COUNT + 1).fill(0)
  );
  (jointDistribution || []).forEach((row, haywireCount) => {
    (row || []).forEach((probabilityRaw, forcedSpamPlays) => {
      const probability = Math.max(0, Number(probabilityRaw) || 0);
      if (probability <= 0) return;
      for (let kept = 0; kept <= forcedSpamPlays; kept += 1) {
        const conditional = chooseSmall(forcedSpamPlays, kept) *
          (keepProbability ** kept) *
          ((1 - keepProbability) ** (forcedSpamPlays - kept));
        adjusted[haywireCount][kept] += probability * conditional;
      }
    });
  });
  return adjusted;
}

export function getDamageEconomyCombinedClogSummary(
  forcedSpamHaywireJointDistribution = [],
  electiveSpamPlayDistribution = [1],
  randomizerStartCount = 0
) {
  const joint = Array.isArray(forcedSpamHaywireJointDistribution) &&
    forcedSpamHaywireJointDistribution.length
    ? forcedSpamHaywireJointDistribution
    : [[1]];
  const elective = Array.isArray(electiveSpamPlayDistribution) &&
    electiveSpamPlayDistribution.length
    ? electiveSpamPlayDistribution
    : [1];
  const safeRandomizerStartCount = Math.max(
    0,
    Math.floor(Number(randomizerStartCount) || 0)
  );
  const safeRandomizerClogLoad =
    safeRandomizerStartCount * DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT;
  const spamPlayCountDistribution = Array(REGISTER_COUNT + 1).fill(0);
  const controlClogLoadProbability = new Map();
  let expectedSpamPlayInitiations = 0;
  let expectedForcedSpamRandomizerOverlap = 0;
  let expectedControlClogLoad = 0;
  let clogRegisterEquivalents = 0;
  let probabilityFourPlusClogs = 0;
  let probabilityFivePlusClogs = 0;

  joint.forEach((forcedRow, haywireCount) => {
    (forcedRow || []).forEach((jointProbabilityRaw, forcedSpamPlays) => {
      const jointProbability = Math.max(0, Number(jointProbabilityRaw) || 0);
      if (jointProbability <= 0) return;
      elective.forEach((electiveProbabilityRaw, electiveSpamPlays) => {
        const electiveProbability = Math.max(0, Number(electiveProbabilityRaw) || 0);
        if (electiveProbability <= 0) return;
        const probability = jointProbability * electiveProbability;
        const forcedSpamRandomizerOverlap = Math.min(
          forcedSpamPlays,
          safeRandomizerStartCount
        );
        const clogBearingForcedSpamPlays = Math.max(
          0,
          forcedSpamPlays - forcedSpamRandomizerOverlap
        );
        const spamPlayCount = Math.min(
          REGISTER_COUNT,
          clogBearingForcedSpamPlays + electiveSpamPlays
        );
        const spamClogLoad = spamPlayCount * DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT;
        const controlClogLoad = haywireCount + spamClogLoad + safeRandomizerClogLoad;
        spamPlayCountDistribution[spamPlayCount] += probability;
        const loadKey = Number(controlClogLoad.toFixed(6));
        controlClogLoadProbability.set(
          loadKey,
          (controlClogLoadProbability.get(loadKey) || 0) + probability
        );
        expectedSpamPlayInitiations += probability * spamPlayCount;
        expectedForcedSpamRandomizerOverlap +=
          probability * forcedSpamRandomizerOverlap;
        expectedControlClogLoad += probability * controlClogLoad;
        clogRegisterEquivalents += probability *
          getDamageEconomyClogRegisterEquivalents(controlClogLoad);
        if (controlClogLoad >= 4) probabilityFourPlusClogs += probability;
        if (controlClogLoad >= 5) probabilityFivePlusClogs += probability;
      });
    });
  });

  const probabilityMass = spamPlayCountDistribution.reduce(
    (sum, probability) => sum + probability,
    0
  );
  if (probabilityMass > 0 && Math.abs(probabilityMass - 1) > 1e-9) {
    spamPlayCountDistribution.forEach((probability, index) => {
      spamPlayCountDistribution[index] = probability / probabilityMass;
    });
    expectedSpamPlayInitiations /= probabilityMass;
    expectedForcedSpamRandomizerOverlap /= probabilityMass;
    expectedControlClogLoad /= probabilityMass;
    clogRegisterEquivalents /= probabilityMass;
    probabilityFourPlusClogs /= probabilityMass;
    probabilityFivePlusClogs /= probabilityMass;
    for (const [load, probability] of controlClogLoadProbability) {
      controlClogLoadProbability.set(load, probability / probabilityMass);
    }
  }

  const controlClogLoadDistribution = [...controlClogLoadProbability.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([load, probability]) => ({
      load: Number(load),
      probability: Number(probability)
    }));

  return {
    spamClogLoad: expectedSpamPlayInitiations * DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT,
    randomizerStartCount: safeRandomizerStartCount,
    randomizerClogLoad: safeRandomizerClogLoad,
    expectedForcedSpamRandomizerOverlap,
    expectedSpamPlayInitiations,
    spamPlayCountDistribution,
    controlClogLoadDistribution,
    expectedControlClogLoad,
    clogRegisterEquivalents,
    probabilityFourPlusClogs: clamp(probabilityFourPlusClogs, 0, 1),
    probabilityFivePlusClogs: clamp(probabilityFivePlusClogs, 0, 1)
  };
}

export function getDamageEconomyPoissonBinomialDistribution(probabilities = []) {
  const safe = (probabilities || []).map((value) => clamp(Number(value) || 0, 0, 1));
  let distribution = Array(safe.length + 1).fill(0);
  distribution[0] = 1;
  safe.forEach((probability) => {
    const next = Array(safe.length + 1).fill(0);
    for (let count = 0; count < distribution.length; count += 1) {
      const base = distribution[count] || 0;
      if (base <= 0) continue;
      next[count] += base * (1 - probability);
      if (count + 1 < next.length) next[count + 1] += base * probability;
    }
    distribution = next;
  });
  return distribution;
}

export function getDamageEconomySelectedProgramTurns(legs = []) {
  const byTurn = new Map();
  for (const leg of legs || []) {
    const transitions = Array.isArray(leg?.transitions) ? leg.transitions : [];
    let elapsedAbsoluteActions = Math.max(0, Number(leg?.absoluteStartAction) || 0);
    transitions.forEach((transition) => {
      const absoluteAction = getTransitionAbsoluteAction(
        transition,
        elapsedAbsoluteActions + 1
      );
      const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
      if (!byTurn.has(turn)) byTurn.set(turn, []);
      byTurn.get(turn).push({
        absoluteAction,
        actionId: transition?.action ?? null,
        programCardId: transition?.programCard ?? transition?.action ?? null
      });
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(absoluteAction)
        : absoluteAction;
    });
  }
  const out = new Map();
  for (const [turn, records] of byTurn.entries()) {
    records.sort((a, b) => a.absoluteAction - b.absoluteAction);
    out.set(turn, {
      turn,
      actionIds: records.map((record) => record.actionId).filter(Boolean),
      programCardIds: records.map((record) => record.programCardId).filter(Boolean),
      absoluteActions: records.map((record) => record.absoluteAction)
    });
  }
  return out;
}

export function getDamageEconomyProgramCodeFromLiteralCards(programCardIds = []) {
  const state = {
    naturalUses: new Map(),
    againUsed: false,
    againActionId: null
  };
  for (const cardId of programCardIds || []) {
    if (cardId === "AGAIN") {
      state.againUsed = true;
      continue;
    }
    if (!PROGRAM_CARD_COUNTS.has(cardId)) continue;
    state.naturalUses.set(cardId, (state.naturalUses.get(cardId) || 0) + 1);
  }
  return encodeCompactProgramResourceState(state);
}

export function getDamageEconomyBaseProgramSuccessfulWays(previousCode, actionIds, handSize) {
  const safePreviousCode = Math.max(0, Math.floor(Number(previousCode) || 0));
  const safeHandSize = Math.max(0, Math.floor(Number(handSize) || 0));
  const actions = Array.isArray(actionIds) ? actionIds : [];
  const cacheKey = `${safePreviousCode}|${actions.join(".")}|h${safeHandSize}`;
  if (DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.has(cacheKey)) {
    return DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.get(cacheKey);
  }

  const deckCounts = getExactProgramDeckCounts(safePreviousCode);
  const deckSize = deckCounts.reduce((sum, count) => sum + count, 0);
  if (safeHandSize > deckSize) return 0;
  const requirements = getExactProgramRequirementVectors(actions).filter((vector) => (
    vector.every((count, index) => count <= deckCounts[index])
  ));
  if (!requirements.length) return 0;

  const hand = Array(deckCounts.length).fill(0);
  let successfulWays = 0;
  const satisfiesAny = () => requirements.some((requirement) => (
    requirement.every((count, index) => hand[index] >= count)
  ));
  const enumerate = (index, remaining, ways) => {
    if (index === deckCounts.length) {
      if (remaining === 0 && satisfiesAny()) successfulWays += ways;
      return;
    }
    const maxTake = Math.min(deckCounts[index], remaining);
    for (let take = 0; take <= maxTake; take += 1) {
      hand[index] = take;
      enumerate(index + 1, remaining - take, ways * chooseSmall(deckCounts[index], take));
    }
    hand[index] = 0;
  };
  enumerate(0, safeHandSize, 1);

  if (DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.size >= DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE_LIMIT) {
    const oldest = DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.keys().next().value;
    if (oldest !== undefined) DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.delete(oldest);
  }
  DAMAGE_ECONOMY_BASE_PROGRAM_WAYS_CACHE.set(cacheKey, successfulWays);
  return successfulWays;
}

export function getDamageEconomyAvailabilityPenaltyFromProbability(probability, options = {}) {
  return getProgramAvailabilityPenaltyFromProbability(
    probability,
    getProgramCardModelProfile(options).adaptabilityFactor
  );
}

export function getDamageEconomyExpectedSpamChainYieldInteger(baseDeckSize, spamCount) {
  const safeBaseDeckSize = Math.max(0, Math.floor(Number(baseDeckSize) || 0));
  const safeSpamCount = Math.max(0, Math.floor(Number(spamCount) || 0));
  if (safeSpamCount <= 0) return 0;
  // Condition on one SPAM already being programmed. The replacement chain then
  // samples without replacement from the remaining effective deck until the
  // first ordinary card. This deliberately ignores real draw/discard position.
  let yieldCount = 1;
  let prefixProbability = 1;
  let remainingSpam = safeSpamCount - 1;
  let remainingTotal = safeBaseDeckSize + remainingSpam;
  while (remainingSpam > 0 && remainingTotal > 0) {
    prefixProbability *= remainingSpam / remainingTotal;
    yieldCount += prefixProbability;
    remainingSpam -= 1;
    remainingTotal -= 1;
  }
  return yieldCount;
}

export function getDamageEconomyExpectedSpamChainYield(baseDeckSize, spamBurden) {
  const burden = Math.max(0, Number(spamBurden) || 0);
  if (burden <= 0) return 0;
  const low = Math.floor(burden);
  const high = Math.ceil(burden);
  const lowYield = getDamageEconomyExpectedSpamChainYieldInteger(baseDeckSize, low);
  if (low === high) return lowYield;
  const highYield = getDamageEconomyExpectedSpamChainYieldInteger(baseDeckSize, high);
  return lowYield + (highYield - lowYield) * (burden - low);
}

export function getDamageEconomyTravelDirection(transition) {
  const from = transition?.from;
  const to = transition?.to;
  if (!from || !to || transition?.rebooted || transition?.crashed) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0 && dy === 0) return "E";
  if (dx < 0 && dy === 0) return "W";
  if (dy > 0 && dx === 0) return "S";
  if (dy < 0 && dx === 0) return "N";
  return null;
}

export function getDamageEconomyForwardReliefContext(
  tileMap,
  transition,
  options = {},
  absoluteAction = 1
) {
  const start = transition?.from;
  const dir = start?.facing;
  if (!tileMap || !start || !DIRS[dir]) {
    return {
      wallBonus: 0,
      wallDistance: null,
      forwardHazardPenalty: 0,
      forwardHazardScore: 0
    };
  }
  const registerOptions = {
    ...options,
    registerIndex: (Math.max(1, absoluteAction) - 1) % REGISTER_COUNT,
    contextualSkipRecoveryAwarePressure: true
  };
  let wallBonus = 0;
  let wallDistance = null;
  let forwardHazardPenalty = 0;
  let forwardHazardScore = 0;
  let from = { x: start.x, y: start.y };

  for (let index = 0; index < DAMAGE_ECONOMY_RELIEF_FORWARD_DISTANCE_WEIGHTS.length; index += 1) {
    const distance = index + 1;
    const weight = DAMAGE_ECONOMY_RELIEF_FORWARD_DISTANCE_WEIGHTS[index];
    const to = {
      x: from.x + DIRS[dir].dx,
      y: from.y + DIRS[dir].dy
    };
    if (isBoundaryBlockedByWalls(tileMap, from, to, dir)) {
      wallDistance = distance;
      wallBonus = DAMAGE_ECONOMY_RELIEF_WALL_BONUS_BY_DISTANCE[index] ?? 0;
      break;
    }

    const moveCheck = canMoveBetween(tileMap, from, to, dir, registerOptions);
    if (!moveCheck.ok) {
      if (moveCheck.crash) {
        forwardHazardScore += REGISTER_TEMPO_COST * 2 * weight;
        forwardHazardPenalty += DAMAGE_ECONOMY_RELIEF_FORWARD_HAZARD_PENALTY_MAX * weight;
      }
      break;
    }
    const tile = tileMap.get(tileKey(to.x, to.y));
    if (!tile) break;

    let landingHazardScore = Math.max(0, getTilePenalty(tile, registerOptions));
    landingHazardScore += Math.max(0, Number(moveCheck.ledgeDamage) || 0);
    landingHazardScore += getPitPressurePenalty(tileMap, to, registerOptions, true);
    landingHazardScore += getLedgePressurePenalty(tileMap, to, registerOptions);
    landingHazardScore += getDamageEconomyActiveFlamethrowerCount(tile, registerOptions) *
      Math.max(0, getFlamethrowerDamagePenalty(registerOptions));
    if (hasActiveFeature(tile, "crusher", registerOptions)) {
      landingHazardScore = Math.max(landingHazardScore, REGISTER_TEMPO_COST * 2);
    }
    forwardHazardScore += landingHazardScore * weight;
    forwardHazardPenalty += Math.min(
      DAMAGE_ECONOMY_RELIEF_FORWARD_HAZARD_PENALTY_MAX * weight,
      landingHazardScore / (REGISTER_TEMPO_COST * 4) * weight
    );
    from = to;
  }

  return {
    wallBonus: Number(Math.min(0.5, wallBonus).toFixed(4)),
    wallDistance,
    forwardHazardPenalty: Number(Math.min(
      DAMAGE_ECONOMY_RELIEF_FORWARD_HAZARD_PENALTY_MAX,
      forwardHazardPenalty
    ).toFixed(4)),
    forwardHazardScore: Number(forwardHazardScore.toFixed(3))
  };
}

export function getDamageEconomyRegisterReliefProfile(
  tileMap,
  transition,
  plannedReplay,
  options,
  absoluteAction
) {
  const register = getRegisterPosition(absoluteAction);
  const timingAllowance = DAMAGE_ECONOMY_RELIEF_TIMING_ALLOWANCE[register - 1] ?? 0;
  const randomizerAtRegisterStart = Boolean(
    transition?.randomizerAtRegisterStart || transition?.randomizedAction
  );
  if (randomizerAtRegisterStart) {
    return {
      timingAllowance,
      boardOpportunity: 1,
      conveyorMovementBonus: 0,
      forcedRotationPenalty: 0,
      forcedMovementPenalty: 0,
      wallBonus: 0,
      wallDistance: null,
      forwardHazardPenalty: 0,
      forwardHazardScore: 0,
      conveyorTurns: 0,
      currentSteps: 0,
      pusherEvents: 0,
      travelDirection: getDamageEconomyTravelDirection(plannedReplay),
      randomizerAtRegisterStart: true,
      method: "randomizer-full-spam-relief-v49fh"
    };
  }
  if (!transition?.from || !plannedReplay?.to || plannedReplay?.rebooted || plannedReplay?.crashed) {
    return {
      timingAllowance,
      boardOpportunity: 0,
      conveyorMovementBonus: 0,
      forcedRotationPenalty: 0,
      forcedMovementPenalty: 0,
      wallBonus: 0,
      wallDistance: null,
      forwardHazardPenalty: 0,
      forwardHazardScore: 0,
      conveyorTurns: 0,
      travelDirection: null,
      method: "selected-route-register-opportunity-v2"
    };
  }

  const conveyorSteps = (plannedReplay?.conveyorSteps || []).filter(
    (step) => step?.phase !== "current"
  );
  const currentSteps = (plannedReplay?.conveyorSteps || []).filter(
    (step) => step?.phase === "current"
  );
  const conveyorTurns = conveyorSteps.filter((step) => Boolean(step?.turned)).length;
  const gearTurns = plannedReplay?.gearTurned ? 1 : 0;
  const pusherEvents = (plannedReplay?.boardEvents || []).filter(
    (event) => event?.type === "pusher"
  ).length;
  const conveyorMovementBonus = Math.min(
    DAMAGE_ECONOMY_RELIEF_CONVEYOR_BONUS_MAX,
    conveyorSteps.length * DAMAGE_ECONOMY_RELIEF_CONVEYOR_STEP_BONUS
  );
  const forcedRotationPenalty = Math.min(
    0.45,
    (conveyorTurns + gearTurns) * DAMAGE_ECONOMY_RELIEF_FORCED_ROTATION_PENALTY
  );
  const forcedMovementPenalty = Math.min(
    0.36,
    (currentSteps.length + pusherEvents) * DAMAGE_ECONOMY_RELIEF_FORCED_MOVEMENT_PENALTY
  );
  const forwardContext = getDamageEconomyForwardReliefContext(
    tileMap,
    transition,
    options,
    absoluteAction
  );

  const boardOpportunity = clamp(
    timingAllowance +
      conveyorMovementBonus +
      forwardContext.wallBonus -
      forcedRotationPenalty -
      forcedMovementPenalty -
      forwardContext.forwardHazardPenalty,
    0,
    1
  );

  return {
    timingAllowance,
    boardOpportunity: Number(boardOpportunity.toFixed(4)),
    conveyorMovementBonus: Number(conveyorMovementBonus.toFixed(4)),
    forcedRotationPenalty: Number(forcedRotationPenalty.toFixed(4)),
    forcedMovementPenalty: Number(forcedMovementPenalty.toFixed(4)),
    wallBonus: forwardContext.wallBonus,
    wallDistance: forwardContext.wallDistance,
    forwardHazardPenalty: forwardContext.forwardHazardPenalty,
    forwardHazardScore: forwardContext.forwardHazardScore,
    conveyorTurns,
    currentSteps: currentSteps.length,
    pusherEvents,
    travelDirection: getDamageEconomyTravelDirection(plannedReplay),
    method: "selected-route-register-opportunity-v2"
  };
}

export function getDamageEconomyActiveFlamethrowerCount(tile, registerOptions = {}) {
  return (tile?.features || []).filter((feature) => (
    feature.type === "flamethrower" &&
    isFeatureActiveThisRegister(feature, registerOptions)
  )).length;
}

export function isDamageEconomyRandomizerAtRegisterStart(
  tileMap,
  transition,
  options = {},
  absoluteAction = 1
) {
  if (transition?.randomizedAction) return true;
  // v49fo: v49fh+ transitions always carry an explicit boolean marker. `false`
  // is authoritative too. Only legacy/foreign transitions that genuinely lack
  // the property need the compatibility board lookup and register-options clone.
  if (transition && Object.prototype.hasOwnProperty.call(transition, "randomizerAtRegisterStart")) {
    return Boolean(transition.randomizerAtRegisterStart);
  }
  const start = transition?.from;
  if (!tileMap || !start || !Number.isFinite(start.x) || !Number.isFinite(start.y)) {
    return false;
  }
  const registerOptions = {
    ...options,
    registerIndex: (Math.max(1, absoluteAction) - 1) % REGISTER_COUNT
  };
  return hasActiveFeature(
    tileMap.get(tileKey(start.x, start.y)),
    "randomizer",
    registerOptions
  );
}

export function isDamageEconomyRepairStationTile(tile) {
  const checkpoint = (tile?.features || []).find((feature) => feature.type === "checkpoint");
  return Boolean(checkpoint && Number(checkpoint.id ?? 1) !== 0);
}

export function applyDamageEconomyRepairStationRelief(state) {
  const spamReliefTarget = DAMAGE_ECONOMY_SPAM_SHARE;
  const haywireReliefTarget = DAMAGE_ECONOMY_HAYWIRE_SHARE;

  // Repair Stations remove one expected Damage-card equivalent, split using the
  // existing damage-deck mix. The two shares deliberately do NOT spill into one
  // another: if the modeled state has less of one type, unused relief is lost.
  // Prefer same-turn pending SPAM first because register-5 repair happens after
  // that damage but before the next programming boundary; then reduce older
  // persistent SPAM burden if capacity remains.
  const pendingSpamRemoved = Math.min(
    Math.max(0, Number(state?.pendingSpam) || 0),
    spamReliefTarget
  );
  state.pendingSpam = Math.max(0, (Number(state?.pendingSpam) || 0) - pendingSpamRemoved);
  const remainingSpamRelief = Math.max(0, spamReliefTarget - pendingSpamRemoved);
  const persistentSpamRemoved = Math.min(
    Math.max(0, Number(state?.spamTotal) || 0),
    remainingSpamRelief
  );
  state.spamTotal = Math.max(0, (Number(state?.spamTotal) || 0) - persistentSpamRemoved);
  state.spamHeld = Math.min(
    Math.max(0, Number(state?.spamHeld) || 0),
    Math.max(0, Number(state?.spamTotal) || 0)
  );

  // Pending Haywire is represented as per-register probability mass for the next
  // programming turn. Remove up to the Haywire share by proportionally scaling
  // that mass; this preserves which registers created the risk while keeping the
  // expected relief exactly bounded by 17/40 of one Damage card.
  const risks = Array.isArray(state?.pendingHaywireRegisterRisks)
    ? state.pendingHaywireRegisterRisks.map((value) => clamp(Number(value) || 0, 0, 1))
    : Array(REGISTER_COUNT).fill(0);
  const haywireRiskBefore = risks.reduce((sum, value) => sum + value, 0);
  const haywireRiskRemoved = Math.min(haywireRiskBefore, haywireReliefTarget);
  const targetRiskAfter = Math.max(0, haywireRiskBefore - haywireRiskRemoved);
  const scale = haywireRiskBefore > 0.000001
    ? targetRiskAfter / haywireRiskBefore
    : 0;
  state.pendingHaywireRegisterRisks = risks.map((value) => clamp(value * scale, 0, 1));

  return {
    spamRemoved: pendingSpamRemoved + persistentSpamRemoved,
    pendingSpamRemoved,
    persistentSpamRemoved,
    haywireExpectedRemoved: haywireRiskRemoved,
    spamReliefTarget,
    haywireReliefTarget
  };
}

export function getDamageEconomyRealizedDamageForTransition(
  tileMap,
  transition,
  options = {},
  absoluteAction = 1
) {
  const registerOptions = {
    ...options,
    registerIndex: (Math.max(1, absoluteAction) - 1) % REGISTER_COUNT
  };
  let boardLaserDamageUnits = 0;
  let flamethrowerDamageUnits = 0;
  let flamingOilDamageUnits = 0;
  let radiationDamageUnits = 0;
  let radioactiveWasteDamageUnits = 0;
  let ledgeDamageUnits = 0;
  const rebootDamageUnits = transition?.rebooted
    ? (options.moreDeadlyGame ? 3 : 2)
    : 0;

  // Flamethrowers deal 1 damage on every active entry/pass-through and a
  // separate +1 if the robot ends the register on the flamethrower space. The
  // final landing square is intentionally present in `traversed`, so an entry
  // that also ends there can correctly become 1 + 1 damage below.
  for (const point of transition?.traversed || []) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const tile = tileMap.get(tileKey(point.x, point.y));
    flamethrowerDamageUnits += getDamageEconomyActiveFlamethrowerCount(
      tile,
      registerOptions
    );
  }

  // Flaming Oil is never register-specific. It mirrors the flamer's entry/end
  // structure but collapses ALL oil traversed within the register to one entry
  // hit: entering one or many oil spaces costs 1 total, plus another 1 if the
  // robot survives and ends the register on oil.
  if (options.flamingOil) {
    const enteredAnyOil = (transition?.traversed || []).some((point) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      return isOil(tileMap.get(tileKey(point.x, point.y)));
    });
    if (enteredAnyOil) flamingOilDamageUnits += 1;
  }

  // Ledge damage belongs to the crossed boundary, not to a tile feature. Ignore
  // portal/jump discontinuities and inspect only cardinally-adjacent movement.
  const movementPoints = [transition?.from, ...(transition?.traversed || [])]
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  for (let index = 1; index < movementPoints.length; index += 1) {
    const from = movementPoints[index - 1];
    const to = movementPoints[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dir = dx === 1 && dy === 0
      ? "E"
      : dx === -1 && dy === 0
        ? "W"
        : dx === 0 && dy === 1
          ? "S"
          : dx === 0 && dy === -1
            ? "N"
            : null;
    if (!dir) continue;
    const toTile = tileMap.get(tileKey(to.x, to.y));
    if (
      toTile &&
      getLedgeSides(toTile).has(OPPOSITE[dir]) &&
      !hasRampForDir(toTile, OPPOSITE[dir])
    ) {
      ledgeDamageUnits += isWater(toTile) ? 1 : 2;
    }
  }

  // A pit/edge/trapdoor/crusher reboot removes the robot immediately. Board
  // lasers therefore never get a later hit on that transition. If the robot
  // survives, inspect only the final post-conveyor/pusher/gear/machinery square.
  if (!transition?.rebooted && !transition?.crashed && transition?.to) {
    const finalTile = tileMap.get(tileKey(transition.to.x, transition.to.y));
    for (const feature of finalTile?.features || []) {
      if (feature.type === "laser") {
        boardLaserDamageUnits += getEffectiveLaserDamage(feature, options);
      }
    }
    flamethrowerDamageUnits += getDamageEconomyActiveFlamethrowerCount(
      finalTile,
      registerOptions
    );
    if (options.flamingOil && isOil(finalTile)) {
      flamingOilDamageUnits += 1;
    }

    // Radiation is a once-per-round board hazard: it fires at the end of
    // register 5, after board movement/effects, and deals one damage if the
    // robot is still on the Radiation space.
    if (
      registerOptions.registerIndex === REGISTER_COUNT - 1 &&
      hasFeatureType(finalTile, "radiation")
    ) {
      radiationDamageUnits += 1;
    }

    // Radioactive Waste is end-of-EVERY-register: after current/board effects,
    // a robot that remains on the space takes one damage. The paired positive
    // economy choice is modeled separately by getRouteEnergyShadowStep().
    if (hasFeatureType(finalTile, "radioactiveWaste")) {
      radioactiveWasteDamageUnits += 1;
    }
  }

  const totalDamageUnits = (
    boardLaserDamageUnits +
    flamethrowerDamageUnits +
    flamingOilDamageUnits +
    radiationDamageUnits +
    radioactiveWasteDamageUnits +
    ledgeDamageUnits +
    rebootDamageUnits
  );
  const sourceTypes = [];
  if (boardLaserDamageUnits > 0) sourceTypes.push("board-laser-hit");
  if (flamethrowerDamageUnits > 0) sourceTypes.push("flamethrower-hit");
  if (flamingOilDamageUnits > 0) sourceTypes.push("flaming-oil-hit");
  if (radiationDamageUnits > 0) sourceTypes.push("radiation-hit");
  if (radioactiveWasteDamageUnits > 0) sourceTypes.push("radioactive-waste-hit");
  if (ledgeDamageUnits > 0) sourceTypes.push("ledge-damage");
  if (rebootDamageUnits > 0) sourceTypes.push("reboot-damage");

  return {
    boardLaserDamageUnits,
    flamethrowerDamageUnits,
    flamingOilDamageUnits,
    radiationDamageUnits,
    radioactiveWasteDamageUnits,
    ledgeDamageUnits,
    rebootDamageUnits,
    totalDamageUnits,
    sourceTypes
  };
}



export function cloneDamageEconomyState(state) {
  return {
    activeTurn: Math.max(1, Math.floor(Number(state?.activeTurn) || 1)),
    spamTotal: Math.max(0, Number(state?.spamTotal) || 0),
    spamHeld: Math.max(0, Number(state?.spamHeld) || 0),
    pendingSpam: Math.max(0, Number(state?.pendingSpam) || 0),
    activeHaywireDistribution: Array.isArray(state?.activeHaywireDistribution)
      ? [...state.activeHaywireDistribution]
      : [1, 0, 0, 0, 0, 0],
    pendingHaywireRegisterRisks: Array.isArray(state?.pendingHaywireRegisterRisks)
      ? [...state.pendingHaywireRegisterRisks]
      : Array(REGISTER_COUNT).fill(0)
  };
}

export function clearDamageEconomyStateAtProgrammingBoundary(state) {
  const cleared = cloneDamageEconomyState(state);
  cleared.spamTotal = 0;
  cleared.spamHeld = 0;
  cleared.pendingSpam = 0;
  cleared.activeHaywireDistribution = [1, 0, 0, 0, 0, 0];
  cleared.pendingHaywireRegisterRisks = Array(REGISTER_COUNT).fill(0);
  return cleared;
}

export function getDamageEconomyReliefOpportunityByAbsoluteAction(transitionRecords = []) {
  const opportunities = new Map();
  let previousTravelDirection = null;
  let previousTravelAbsoluteAction = null;
  let directionRunLength = 0;
  for (const record of transitionRecords) {
    const travelDirection = record?.reliefProfile?.travelDirection ?? null;
    const absoluteAction = Number(record?.absoluteAction) || 0;
    if (
      travelDirection &&
      travelDirection === previousTravelDirection &&
      previousTravelAbsoluteAction !== null &&
      absoluteAction === previousTravelAbsoluteAction + 1
    ) {
      directionRunLength += 1;
    } else {
      directionRunLength = travelDirection ? 1 : 0;
    }
    previousTravelDirection = travelDirection;
    previousTravelAbsoluteAction = absoluteAction;
    const continuityBonus = record?.reliefProfile?.boardOpportunity > 0 && directionRunLength > 1
      ? Math.min(
        DAMAGE_ECONOMY_RELIEF_CONTINUITY_BONUS_MAX,
        (directionRunLength - 1) * 0.05
      )
      : 0;
    opportunities.set(absoluteAction, record?.randomizerAtRegisterStart
      ? 1
      : Math.min(
        1,
        Math.max(0, Number(record?.reliefProfile?.boardOpportunity) || 0) + continuityBonus
      ));
  }
  return opportunities;
}

export function replayDamageEconomyShutdownEquivalentScore({
  maxRouteTurn,
  selectedProgramTurns,
  recordsByTurn,
  robotLaserDamageByAbsoluteAction,
  robotLaserHitProbabilitiesByAbsoluteAction,
  reliefOpportunityByAbsoluteAction,
  options = {}
}) {
  const profile = getDamageEconomyVariantProfile(options);
  let state = createDamageEconomyState();
  DAMAGE_ECONOMY_TELEMETRY.shutdownScoringReplayCount += 1;

  const programmedTurns = [...selectedProgramTurns.entries()]
    .filter(([, program]) => (program?.actionIds || []).length > 0)
    .map(([turn]) => Number(turn))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const lastProgramTurn = programmedTurns.length ? programmedTurns.at(-1) : 0;

  let shutdownEquivalentEpisodeCount = 0;
  let shutdownEquivalentRegisterEquivalents = 0;
  let segmentRawRegisterEquivalents = 0;
  let shutdownThreatPeakSegmentRegisterEquivalents = 0;
  const shutdownEquivalentEpisodeTurns = [];
  const turnScoring = [];

  for (let turn = 1; turn <= maxRouteTurn; turn += 1) {
    advanceDamageEconomyToTurn(state, turn, options);
    const programTurn = selectedProgramTurns.get(turn) ?? {
      actionIds: [],
      programCardIds: [],
      absoluteActions: []
    };
    const actionIds = programTurn.actionIds || [];
    if (!actionIds.length) continue;
    DAMAGE_ECONOMY_TELEMETRY.shutdownScoringReplayTurns += 1;

    const previousProgram = selectedProgramTurns.get(turn - 1) ?? null;
    const previousProgramCode = getProgramCardEffectivePreviousCode(
      previousProgram
        ? getDamageEconomyProgramCodeFromLiteralCards(previousProgram.programCardIds)
        : 0,
      options
    );
    const programming = getDamageEconomyProgrammingSummary(
      previousProgramCode,
      actionIds,
      state,
      options
    );
    const spamHandAtProgramming = Math.min(
      profile.handSize,
      Math.max(0, state.spamHeld + programming.expectedSpamDrawn)
    );
    let spamInHandRemaining = spamHandAtProgramming;
    const turnRecords = recordsByTurn.get(turn) || [];
    const turnRandomizerStarts = turnRecords.filter(
      (record) => Boolean(record?.randomizerAtRegisterStart)
    ).length;
    const forcedSpamReliefInitiations = Math.min(
      state.spamTotal,
      spamInHandRemaining,
      Math.max(0, Number(programming.expectedForcedSpamReliefInitiations) || 0)
    );
    let remainingRandomizerElectiveReliefCapacity = Math.max(
      0,
      turnRandomizerStarts - forcedSpamReliefInitiations
    );
    if (forcedSpamReliefInitiations > 0.0005) {
      const forcedCirculatingSpam = Math.max(0, state.spamTotal - spamInHandRemaining);
      const forcedSpamChainYield = Math.max(
        1,
        getDamageEconomyExpectedSpamChainYield(
          programming.baseDeckSize,
          forcedCirculatingSpam
        )
      );
      spamInHandRemaining = Math.max(0, spamInHandRemaining - forcedSpamReliefInitiations);
      applyDamageEconomySpamPlayOutcome(
        state,
        forcedSpamReliefInitiations * forcedSpamChainYield,
        profile
      );
    }

    const electiveClogInitiationProbabilities = [];
    for (const record of turnRecords) {
      const {
        transition,
        realized,
        absoluteAction,
        register,
        randomizerAtRegisterStart,
        repairStationEligible
      } = record;
      const reliefOpportunity = Math.max(
        0,
        Number(reliefOpportunityByAbsoluteAction.get(absoluteAction)) || 0
      );
      let reliefInitiation = 0;
      if (spamInHandRemaining > 0.0005 && reliefOpportunity > 0.0005) {
        reliefInitiation = Math.min(
          1,
          reliefOpportunity,
          spamInHandRemaining,
          randomizerAtRegisterStart
            ? remainingRandomizerElectiveReliefCapacity
            : 1
        );
        const currentCirculatingSpam = Math.max(0, state.spamTotal - spamInHandRemaining);
        const chainYield = Math.max(
          1,
          getDamageEconomyExpectedSpamChainYield(
            programming.baseDeckSize,
            currentCirculatingSpam
          )
        );
        spamInHandRemaining = Math.max(0, spamInHandRemaining - reliefInitiation);
        applyDamageEconomySpamPlayOutcome(
          state,
          reliefInitiation * chainYield,
          profile
        );
      }
      // A SPAM deliberately consumed in the Randomizer register is relief, but it
      // does not surrender another register of control: Randomizer already paid
      // the +2 clog for that register. Forced SPAM uses Randomizer slots first;
      // only the remaining slot capacity can support additional elective relief.
      electiveClogInitiationProbabilities.push(
        randomizerAtRegisterStart ? 0 : reliefInitiation
      );
      if (randomizerAtRegisterStart) {
        remainingRandomizerElectiveReliefCapacity = Math.max(
          0,
          remainingRandomizerElectiveReliefCapacity - reliefInitiation
        );
      }

      if (transition?.rebooted) {
        const rebootSpamDisposalCapacity = Math.max(0, REGISTER_COUNT - register);
        const rebootSpamRemoved = Math.min(
          state.spamTotal,
          spamInHandRemaining,
          rebootSpamDisposalCapacity
        );
        if (rebootSpamRemoved > 0) {
          spamInHandRemaining = Math.max(0, spamInHandRemaining - rebootSpamRemoved);
          state.spamTotal = Math.max(0, state.spamTotal - rebootSpamRemoved);
        }
        state.activeHaywireDistribution = [1, 0, 0, 0, 0, 0];
      }

      const robotLaserExpectedDamage = (!transition?.rebooted && !transition?.crashed)
        ? Math.max(0, Number(robotLaserDamageByAbsoluteAction.get(absoluteAction)) || 0)
        : 0;
      const robotLaserHitProbabilities =
        robotLaserHitProbabilitiesByAbsoluteAction.get(absoluteAction) || [];
      const haywireEventProbability = getDamageEconomyRegisterHaywireEventProbability(
        realized.totalDamageUnits,
        robotLaserHitProbabilities,
        profile.robotLaserDamagePerHit
      );
      const spamDamageUnits = realized.totalDamageUnits +
        (profile.robotLaserSpamSuppressed ? 0 : robotLaserExpectedDamage);
      applyExpectedDamageToEconomyState(
        state,
        realized.totalDamageUnits + robotLaserExpectedDamage,
        register,
        haywireEventProbability,
        spamDamageUnits
      );
      if (repairStationEligible) {
        applyDamageEconomyRepairStationRelief(state);
        spamInHandRemaining = Math.min(spamInHandRemaining, state.spamTotal);
      }
    }

    const spamHeldBeforeFilter = Math.min(state.spamTotal, spamInHandRemaining);
    state.spamHeld = profile.spamFilter ? 0 : spamHeldBeforeFilter;
    const electiveSpamPlayDistribution = getDamageEconomyPoissonBinomialDistribution(
      electiveClogInitiationProbabilities
    );
    const forcedSpamHaywireJointDistribution =
      getDamageEconomyAdjustedForcedSpamHaywireJointDistribution(
        programming.forcedSpamHaywireJointDistribution,
        forcedSpamReliefInitiations
      );
    const combinedClog = getDamageEconomyCombinedClogSummary(
      forcedSpamHaywireJointDistribution,
      electiveSpamPlayDistribution,
      turnRandomizerStarts
    );
    const turnDamageEconomyRegisterEquivalents =
      programming.spamSupplyRegisterEquivalents + combinedClog.clogRegisterEquivalents;

    segmentRawRegisterEquivalents += turnDamageEconomyRegisterEquivalents;
    shutdownThreatPeakSegmentRegisterEquivalents = Math.max(
      shutdownThreatPeakSegmentRegisterEquivalents,
      segmentRawRegisterEquivalents
    );

    const hasFutureProgramming = turn < lastProgramTurn;
    const episodeTriggered = (
      hasFutureProgramming &&
      segmentRawRegisterEquivalents >= DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE
    );
    turnScoring.push({
      turn,
      segmentRawRegisterEquivalents: Number(segmentRawRegisterEquivalents.toFixed(3)),
      episodeTriggered
    });

    if (episodeTriggered) {
      shutdownEquivalentEpisodeCount += 1;
      shutdownEquivalentRegisterEquivalents += DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE;
      shutdownEquivalentEpisodeTurns.push(turn);
      state = clearDamageEconomyStateAtProgrammingBoundary(state);
      segmentRawRegisterEquivalents = 0;
    }
  }

  const shutdownResidualRegisterEquivalents = segmentRawRegisterEquivalents;
  const shutdownEquivalentDamageScoreRegisterEquivalents =
    shutdownEquivalentRegisterEquivalents + shutdownResidualRegisterEquivalents;
  const shutdownThreatLevel = shutdownEquivalentEpisodeCount > 0
    ? "high"
    : shutdownThreatPeakSegmentRegisterEquivalents >=
        DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE * 0.8
      ? "elevated"
      : "low";

  return {
    shutdownEquivalentEpisodeCount,
    shutdownEquivalentEpisodeTurns,
    shutdownEquivalentRegisterEquivalents: Number(
      shutdownEquivalentRegisterEquivalents.toFixed(3)
    ),
    shutdownResidualRegisterEquivalents: Number(
      shutdownResidualRegisterEquivalents.toFixed(3)
    ),
    shutdownEquivalentDamageScoreRegisterEquivalents: Number(
      shutdownEquivalentDamageScoreRegisterEquivalents.toFixed(3)
    ),
    shutdownThreatPeakSegmentRegisterEquivalents: Number(
      shutdownThreatPeakSegmentRegisterEquivalents.toFixed(3)
    ),
    shutdownThreatLevel,
    turnScoring
  };
}
