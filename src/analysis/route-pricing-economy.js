// Robo Rally Course Randomizer - fixed-route pricing economy: card-aware expected energy/upgrade value of an already-found route (priced starts)
import { tileKey } from "./board-geometry.js";
import {
  clampRouteEconomyCardUnits,
  getInitialRouteUsefulCardUnits,
  getRouteEconomyFullHorizonActions,
  getRouteEconomyPhaseChoices,
  getRouteEnergyEconomyConfig,
  getRouteUsefulCardUnitsPerDraw
} from "./energy-economy.js";
import { clamp } from "../shared/math.js";
import { summarizeRegisterEquivalentLedger } from "./route-evaluation.js";
import { isRouteAwareBatteryScoringActive } from "./rule-options.js";

// v37 priced-start economy ---------------------------------------------------
//
// Route discovery keeps the deliberately flattened v18 Energy scorer. Starting
// prices need a different question: how much is a change in *starting* Energy
// actually worth when the player may or may not have enough useful upgrade cards
// and future draw/install throughput to spend it?  Price curves therefore replay
// the already-discovered route through this small card-aware expected-economy DP.
// It never changes route legality, Normal balance, Competitive balance, or search
// dominance; it is a downstream valuation layer used only by priced starts.
export let FIXED_ROUTE_PRICING_ECONOMY_CACHE = new WeakMap();
export let FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE = new WeakMap();
export let FIXED_ROUTE_PRICING_RE_LEDGER_CACHE = new WeakMap();

// Reset by clearAnalysisCaches. A module-level binding can only be reassigned
// by its own module, so each reassigned cache has a reset function beside it.
export function resetFixedRoutePricingEconomyCache() {
  FIXED_ROUTE_PRICING_ECONOMY_CACHE = new WeakMap();
}

export function resetFixedRoutePricingEconomyActivityCache() {
  FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE = new WeakMap();
}

export function resetFixedRoutePricingRELedgerCache() {
  FIXED_ROUTE_PRICING_RE_LEDGER_CACHE = new WeakMap();
}

export function getFixedRoutePricingBaseRELedger(tileMap, route, options = {}) {
  if (!route) return null;
  const cached = FIXED_ROUTE_PRICING_RE_LEDGER_CACHE.get(route);
  if (cached) return cached;
  const ledger = summarizeRegisterEquivalentLedger(
    tileMap,
    route,
    options,
    null
  );
  if (ledger) FIXED_ROUTE_PRICING_RE_LEDGER_CACHE.set(route, ledger);
  return ledger;
}

export function getFixedRouteEconomyActivity(state = {}) {
  return {
    drawEvents: Math.max(0, Number(state.drawEvents) || 0),
    installEvents: Math.max(0, Number(state.installEvents) || 0),
    openingInstallEvents: Math.max(0, Number(state.openingInstallEvents) || 0),
    laterInstallEvents: Math.max(0, Number(state.laterInstallEvents) || 0),
    drawEnergySpent: Math.max(0, Number(state.drawEnergySpent) || 0),
    abstractInstallInvestment: Math.max(0, Number(state.abstractInstallInvestment) || 0)
  };
}

export function isPreferredFixedRouteEconomyState(candidate, prior) {
  if (!prior) return true;
  if (candidate.utilityR > prior.utilityR + 1e-9) return true;
  if (candidate.utilityR < prior.utilityR - 1e-9) return false;

  // v49du wall-clock observability: when two routes through the abstract
  // economy reach the exact same Energy/card state with the same strategic
  // utility, keep the one that requires fewer player-facing transactions.
  // This avoids inventing wall-clock work from strategically pointless draws.
  const candidateEvents = candidate.drawEvents + candidate.installEvents;
  const priorEvents = prior.drawEvents + prior.installEvents;
  if (candidateEvents !== priorEvents) return candidateEvents < priorEvents;
  if (candidate.drawEvents !== prior.drawEvents) {
    return candidate.drawEvents < prior.drawEvents;
  }
  if (candidate.drawEnergySpent !== prior.drawEnergySpent) {
    return candidate.drawEnergySpent < prior.drawEnergySpent;
  }
  return candidate.abstractInstallInvestment < prior.abstractInstallInvestment;
}

export function addFixedRoutePricingEconomyState(
  states,
  energy,
  cardUnits,
  utilityR,
  config,
  activity = {}
) {
  const safeEnergy = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const safeCards = Math.max(0, Math.round(Number(cardUnits) || 0));
  const key = `${safeEnergy}:${safeCards}`;
  const candidate = {
    energy: safeEnergy,
    cardUnits: safeCards,
    utilityR,
    ...getFixedRouteEconomyActivity(activity)
  };
  const prior = states.get(key);
  if (isPreferredFixedRouteEconomyState(candidate, prior)) {
    states.set(key, candidate);
  }
}

export function applyFixedRoutePricingUpgradePhase(states, boundaryAction, fullHorizonActions, config) {
  const next = new Map();
  for (const state of states.values()) {
    const cappedCards = clampRouteEconomyCardUnits(
      state.cardUnits,
      boundaryAction,
      fullHorizonActions,
      config
    );
    const choices = getRouteEconomyPhaseChoices(
      state.energy,
      cappedCards,
      boundaryAction,
      fullHorizonActions,
      config
    );
    if (!choices.length) {
      addFixedRoutePricingEconomyState(
        next,
        state.energy,
        cappedCards,
        state.utilityR,
        config,
        state
      );
      continue;
    }
    for (const choice of choices) {
      addFixedRoutePricingEconomyState(
        next,
        choice.energyAfter,
        choice.cardUnitsAfter,
        state.utilityR + choice.immediateValueR,
        config,
        {
          ...state,
          drawEvents: state.drawEvents + choice.draw,
          installEvents: state.installEvents + choice.install,
          openingInstallEvents: state.openingInstallEvents + (
            boundaryAction === 0 ? choice.install : 0
          ),
          laterInstallEvents: state.laterInstallEvents + (
            boundaryAction === 0 ? 0 : choice.install
          ),
          drawEnergySpent: state.drawEnergySpent + choice.draw * config.drawEnergyCost,
          // This remains a strategic-value budget, NOT a claim about literal
          // upgrade-card price. It is exposed only as an audit diagnostic.
          abstractInstallInvestment:
            state.abstractInstallInvestment + choice.installInvestment
        }
      );
    }
  }
  return next;
}

export function applyFixedRoutePricingResourceGain(states, energyGain, cardGainUnits, config) {
  const next = new Map();
  for (const state of states.values()) {
    addFixedRoutePricingEconomyState(
      next,
      Math.min(config.maxEnergy, state.energy + Math.max(0, Math.floor(Number(energyGain) || 0))),
      state.cardUnits + Math.max(0, Math.round(Number(cardGainUnits) || 0)),
      state.utilityR,
      config,
      state
    );
  }
  return next;
}

export function applyFixedRoutePricingTransitionEconomy(tileMap, states, transition, config, options = {}) {
  const destination = transition?.to;
  const actionId = transition?.action;
  if (!destination || !actionId) return states;

  const features = tileMap?.get?.(tileKey(destination.x, destination.y))?.features || [];
  const onBattery = features.some((feature) => feature.type === "battery");
  const onChopShop = features.some((feature) => feature.type === "chopShop");
  const unknownCardUnits = getRouteUsefulCardUnitsPerDraw(config);

  let next = states;
  if (onBattery) {
    next = applyFixedRoutePricingResourceGain(
      next,
      1,
      options.upgradeWorld ? unknownCardUnits : 0,
      config
    );
  }
  if (actionId === "WAIT") {
    next = applyFixedRoutePricingResourceGain(next, 1, 0, config);
  }
  if (!onChopShop) return next;

  const branched = new Map();
  for (const state of next.values()) {
    // Energy option: +1E, and Upgrade World adds its extra unknown card.
    addFixedRoutePricingEconomyState(
      branched,
      Math.min(config.maxEnergy, state.energy + 1),
      state.cardUnits + (options.upgradeWorld ? unknownCardUnits : 0),
      state.utilityR,
      config,
      state
    );
    // Card option: one normal unknown card, plus Upgrade World's extra card.
    addFixedRoutePricingEconomyState(
      branched,
      state.energy,
      state.cardUnits + unknownCardUnits * (1 + (options.upgradeWorld ? 1 : 0)),
      state.utilityR,
      config,
      state
    );
  }
  return branched;
}

export function getFixedRoutePricingEconomySignature(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  return [
    config.startingEnergy,
    config.maxEnergy,
    config.startingUpgradeCards,
    config.drawsPerTurn,
    config.installsPerTurn,
    config.drawEnergyCost,
    config.usefulUpgradeCardRate,
    config.usefulEnergyPerInstall,
    config.powerRegistersPerEnergy,
    config.registersPerTurn,
    Number(options.routeEnergyHorizonTurns) || 0,
    options.upgradeWorld ? 1 : 0,
    options.lighterGame ? 1 : 0
  ].join(":");
}

export function evaluateFixedRoutePricingEconomyUtilityR(tileMap, route, options = {}) {
  if (!route || !Array.isArray(route.transitions) || !isRouteAwareBatteryScoringActive(options)) {
    return 0;
  }

  const signature = getFixedRoutePricingEconomySignature(options);
  let routeCache = FIXED_ROUTE_PRICING_ECONOMY_CACHE.get(route);
  if (!routeCache) {
    routeCache = new Map();
    FIXED_ROUTE_PRICING_ECONOMY_CACHE.set(route, routeCache);
  }
  if (routeCache.has(signature)) return routeCache.get(signature);

  const config = getRouteEnergyEconomyConfig(options);
  const fullHorizonActions = getRouteEconomyFullHorizonActions(options);
  if (!(fullHorizonActions > 0)) {
    routeCache.set(signature, 0);
    return 0;
  }

  let states = new Map();
  addFixedRoutePricingEconomyState(
    states,
    config.startingEnergy,
    getInitialRouteUsefulCardUnits(options),
    0,
    config,
    {
      drawEvents: 0,
      installEvents: 0,
      openingInstallEvents: 0,
      laterInstallEvents: 0,
      drawEnergySpent: 0,
      abstractInstallInvestment: 0
    }
  );

  // Starting cards and starting Energy are available before the opening Upgrade
  // Phase. This is also why pricing is resolved before starting cards are dealt:
  // the model values the unknown hand statistically, never a revealed card draw.
  states = applyFixedRoutePricingUpgradePhase(states, 0, fullHorizonActions, config);

  for (let index = 0; index < route.transitions.length; index += 1) {
    states = applyFixedRoutePricingTransitionEconomy(
      tileMap,
      states,
      route.transitions[index],
      config,
      options
    );
    const actionCount = index + 1;
    const hasRaceRemaining = actionCount < route.transitions.length;
    if (
      hasRaceRemaining &&
      actionCount % config.registersPerTurn === 0 &&
      actionCount < fullHorizonActions
    ) {
      states = applyFixedRoutePricingUpgradePhase(
        states,
        actionCount,
        fullHorizonActions,
        config
      );
    }
  }

  const finalStates = [...states.values()];
  const bestState = finalStates.reduce((best, state) => {
    if (!best) return state;
    if (state.utilityR > best.utilityR + 1e-9) return state;
    if (state.utilityR < best.utilityR - 1e-9) return best;
    return isPreferredFixedRouteEconomyState(state, best) ? state : best;
  }, null);
  const utilityR = Math.max(0, Number(bestState?.utilityR) || 0);
  const result = Number(utilityR.toFixed(6));
  routeCache.set(signature, result);

  let activityRouteCache = FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.get(route);
  if (!activityRouteCache) {
    activityRouteCache = new Map();
    FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.set(route, activityRouteCache);
  }
  activityRouteCache.set(signature, {
    active: true,
    method: "card-aware-fixed-route-upgrade-activity-v49du",
    utilityR: result,
    startingEnergy: config.startingEnergy,
    startingUpgradeCards: config.startingUpgradeCards,
    endingEnergy: Math.max(0, Number(bestState?.energy) || 0),
    endingUsefulCardUnits: Math.max(0, Number(bestState?.cardUnits) || 0),
    drawEvents: Math.max(0, Number(bestState?.drawEvents) || 0),
    installEvents: Math.max(0, Number(bestState?.installEvents) || 0),
    openingInstallEvents: Math.max(0, Number(bestState?.openingInstallEvents) || 0),
    laterInstallEvents: Math.max(0, Number(bestState?.laterInstallEvents) || 0),
    drawEnergySpent: Math.max(0, Number(bestState?.drawEnergySpent) || 0),
    abstractInstallInvestment: Math.max(
      0,
      Number(bestState?.abstractInstallInvestment) || 0
    ),
    transactionEvents: Math.max(
      0,
      (Number(bestState?.drawEvents) || 0) + (Number(bestState?.installEvents) || 0)
    ),
    horizonActions: fullHorizonActions,
    horizonTurns: Number((fullHorizonActions / config.registersPerTurn).toFixed(3)),
    note: "Draw/install counts are player-facing economy transactions from the existing card-aware fixed-route DP. abstractInstallInvestment remains strategic-value bookkeeping, not a literal Energy/card price."
  });
  return result;
}

export function summarizeFixedRouteUpgradeEconomyActivity(
  tileMap,
  route,
  options = {}
) {
  if (!route || !Array.isArray(route.transitions)) {
    return { active: false, reason: "missing-route" };
  }
  if (options.lighterGame) {
    return {
      active: true,
      removedByEnergyCrisis: true,
      method: "card-aware-fixed-route-upgrade-activity-v49du",
      utilityR: 0,
      drawEvents: 0,
      installEvents: 0,
      openingInstallEvents: 0,
      laterInstallEvents: 0,
      drawEnergySpent: 0,
      abstractInstallInvestment: 0,
      transactionEvents: 0,
      note: "Energy Crisis removes Energy/upgrades, so upgrade-economy wall-clock transactions are zero."
    };
  }
  if (!isRouteAwareBatteryScoringActive(options)) {
    return { active: false, reason: "route-economy-inactive" };
  }

  const signature = getFixedRoutePricingEconomySignature(options);
  let activityRouteCache = FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.get(route);
  if (activityRouteCache?.has(signature)) {
    return activityRouteCache.get(signature);
  }

  // The ordinary pricing evaluator and wall-clock activity observer share the
  // same DP. Calling it here populates both caches without changing route value.
  evaluateFixedRoutePricingEconomyUtilityR(tileMap, route, options);
  activityRouteCache = FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.get(route);
  return activityRouteCache?.get(signature) ?? {
    active: false,
    reason: "activity-summary-unavailable"
  };
}

// Reprice an already discovered physical/programming route without re-searching
// geometry. The baseline route score remains unchanged at the reference Energy.
// Only the *difference* in card-aware productive economy value is applied. This
// prevents large reserves from being valued when there are too few useful cards,
// draws, install slots, or remaining turns to spend them productively.
export function rescoreFixedRouteUpgradeEconomy(tileMap, route, options = {}) {
  if (!route || !Array.isArray(route.transitions)) return null;
  const originalScore = Number(route.score);
  if (!Number.isFinite(originalScore)) return null;

  const config = getRouteEnergyEconomyConfig(options);
  const currentStartingEnergy = config.startingEnergy;
  const referenceStartingEnergy = Number.isFinite(Number(options.routeEconomyReferenceStartingEnergy))
    ? clamp(Math.floor(Number(options.routeEconomyReferenceStartingEnergy)), 0, config.maxEnergy)
    : currentStartingEnergy;
  const registerScore = Math.max(0, Number(options.routeEnergyRegisterScore) || 0);
  const currentEconomyPotentialR = evaluateFixedRoutePricingEconomyUtilityR(
    tileMap,
    route,
    options
  );
  const referenceOptions = referenceStartingEnergy === currentStartingEnergy
    ? options
    : { ...options, startingEnergy: referenceStartingEnergy };
  const referenceEconomyPotentialR = referenceStartingEnergy === currentStartingEnergy
    ? currentEconomyPotentialR
    : evaluateFixedRoutePricingEconomyUtilityR(
      tileMap,
      route,
      referenceOptions
    );
  const startingEconomyAdjustmentScore = (
    referenceEconomyPotentialR - currentEconomyPotentialR
  ) * registerScore;
  const rescored = originalScore + startingEconomyAdjustmentScore;

  return {
    score: Number(rescored.toFixed(2)),
    originalScore: Number(originalScore.toFixed(2)),
    startingEconomyAdjustmentScore: Number(startingEconomyAdjustmentScore.toFixed(2)),
    startingEconomyPenaltyScore: Number(Math.max(0, startingEconomyAdjustmentScore).toFixed(2)),
    startingEconomyBenefitScore: Number(Math.max(0, -startingEconomyAdjustmentScore).toFixed(2)),
    startingEconomyPotentialR: Number(currentEconomyPotentialR.toFixed(3)),
    referenceStartingEconomyPotentialR: Number(referenceEconomyPotentialR.toFixed(3)),
    pricingEconomyMethod: "card-aware-fixed-route-expected-economy-v37",
    pricingStartingUpgradeCards: config.startingUpgradeCards,
    pricingUsefulUpgradeCardRate: config.usefulUpgradeCardRate,
    pricingDrawsPerTurn: config.drawsPerTurn,
    pricingInstallsPerTurn: config.installsPerTurn,
    pricingDrawEnergyCost: config.drawEnergyCost,
    pricingMaxEnergy: config.maxEnergy
  };
}
