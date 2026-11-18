// Robo Rally Course Randomizer - fixed-route upgrade economy: upgrade value of an already-found route at a starting Energy (priced starts) and its upgrade-phase activity (wall-clock length)
import {
  getRouteEnergyEconomyConfig,
  getRouteEnergyShadowStep
} from "./energy-economy.js";
import {
  ENERGY_VALUE_TABLE_MAX_ENERGY,
  ENERGY_VALUE_TABLE_MAX_TURNS,
  UPGRADE_DRAW_EVENT_RATE,
  UPGRADE_INSTALL_EVENT_RATE,
  UPGRADE_VALUE_BY_STARTING_ENERGY
} from "./energy-value-table.js";
import { getRebootEndedAbsoluteActions, getTransitionAbsoluteAction } from "./reboot-recovery.js";
import { clamp } from "../shared/math.js";
import { summarizeRegisterEquivalentLedger } from "./route-evaluation.js";
import { isRouteAwareBatteryScoringActive } from "./rule-options.js";

// Fixed-route economy ----------------------------------------------------------
//
// Replays an already-found route through the Energy value table (deck averages
// by turn and Energy received; the app sees no card). Priced starts compare its
// upgrade value at two starting Energies; wall-clock length counts its expected
// upgrade draws and installs. Never changes route legality, balance or search.
// (The card-aware DP that used to do both was removed 2026-11-18.)
const ROUTE_UPGRADE_ACTIVITY_METHOD = "energy-value-table-activity-2026-11-18";
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

export function getFixedRoutePricingEconomySignature(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  return [
    config.startingEnergy,
    config.maxEnergy,
    config.startingUpgradeCards,
    config.registersPerTurn,
    Number(options.routeEnergyHorizonTurns) || 0,
    options.upgradeWorld ? 1 : 0,
    options.lighterGame ? 1 : 0
  ].join(":");
}

// The upgrade value a start's route is worth in register-equivalents, from the
// simulated upgrade economy (energy-value-table.js): the race's upgrade value
// with this starting Energy, plus the route's Energy and card gains valued with
// the same tables the route scorer uses, counting Energy received from the
// starting Energy on. Priced starts compare it at the reference and the priced
// starting Energy.
export function evaluateRouteStartingEconomyPotentialR(tileMap, route, options = {}) {
  if (!route || !Array.isArray(route.transitions) || !isRouteAwareBatteryScoringActive(options)) {
    return 0;
  }
  const signature = `potential:${getFixedRoutePricingEconomySignature(options)}`;
  let routeCache = FIXED_ROUTE_PRICING_ECONOMY_CACHE.get(route);
  if (!routeCache) {
    routeCache = new Map();
    FIXED_ROUTE_PRICING_ECONOMY_CACHE.set(route, routeCache);
  }
  if (routeCache.has(signature)) return routeCache.get(signature);

  const config = getRouteEnergyEconomyConfig(options);
  const raceTurns = clamp(
    Math.round(Number(options.routeEnergyHorizonTurns) || 0),
    0,
    ENERGY_VALUE_TABLE_MAX_TURNS
  );
  if (!raceTurns) {
    routeCache.set(signature, 0);
    return 0;
  }
  const startingEnergy = clamp(Math.floor(config.startingEnergy), 0, config.maxEnergy);
  let potential = UPGRADE_VALUE_BY_STARTING_ENERGY[raceTurns][
    Math.min(startingEnergy, ENERGY_VALUE_TABLE_MAX_ENERGY)
  ];
  let reserve = startingEnergy;
  let elapsed = Math.max(0, Number(route.absoluteStartAction) || 0);
  for (const transition of route.transitions) {
    const absoluteAction = getTransitionAbsoluteAction(transition, elapsed + 1);
    if (transition?.to && transition?.action) {
      const step = getRouteEnergyShadowStep(
        tileMap,
        transition.to,
        transition.action,
        absoluteAction,
        reserve,
        0,
        options,
        transition
      );
      potential += Math.max(0, Number(step.rewardRegisterEquivalents) || 0);
      reserve = step.reserveAfter;
    }
    elapsed = transition?.rebooted
      ? getRebootEndedAbsoluteActions(absoluteAction)
      : absoluteAction;
  }
  const result = Number(potential.toFixed(6));
  routeCache.set(signature, result);
  return result;
}

// Upgrade-phase activity of one route for wall-clock length (2026-11-18): the
// expected paid draws and installs per player from the Energy value table's
// simulation (deck averages by turn and Energy received; the app sees no
// card). One upgrade phase before the route's first register and one at each
// turn boundary while the route goes on, as before.
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
      method: ROUTE_UPGRADE_ACTIVITY_METHOD,
      drawEvents: 0,
      installEvents: 0,
      openingInstallEvents: 0,
      laterInstallEvents: 0,
      drawEnergySpent: 0,
      transactionEvents: 0,
      note: "Energy Crisis removes Energy/upgrades, so upgrade-economy wall-clock transactions are zero."
    };
  }
  if (!isRouteAwareBatteryScoringActive(options)) {
    return { active: false, reason: "route-economy-inactive" };
  }

  const signature = `activity:${getFixedRoutePricingEconomySignature(options)}`;
  let routeCache = FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.get(route);
  if (!routeCache) {
    routeCache = new Map();
    FIXED_ROUTE_PRICING_ECONOMY_ACTIVITY_CACHE.set(route, routeCache);
  }
  if (routeCache.has(signature)) return routeCache.get(signature);

  const config = getRouteEnergyEconomyConfig(options);
  const raceTurns = clamp(
    Math.round(Number(options.routeEnergyHorizonTurns) || 0),
    1,
    ENERGY_VALUE_TABLE_MAX_TURNS
  );
  const drawRows = UPGRADE_DRAW_EVENT_RATE[raceTurns];
  const installRows = UPGRADE_INSTALL_EVENT_RATE[raceTurns];
  const registersPerTurn = config.registersPerTurn;
  let received = clamp(Math.floor(config.startingEnergy), 0, config.maxEnergy);
  let drawEvents = 0;
  let installEvents = 0;
  let openingInstallEvents = 0;
  const phase = (turn) => {
    const row = Math.min(turn, raceTurns);
    const index = clamp(received, 0, ENERGY_VALUE_TABLE_MAX_ENERGY);
    drawEvents += drawRows[row][index];
    const installs = installRows[row][index];
    installEvents += installs;
    if (turn === 1) openingInstallEvents += installs;
  };

  phase(1);
  let elapsed = Math.max(0, Number(route.absoluteStartAction) || 0);
  for (let index = 0; index < route.transitions.length; index += 1) {
    const transition = route.transitions[index];
    const absoluteAction = getTransitionAbsoluteAction(transition, elapsed + 1);
    if (transition?.to && transition?.action) {
      const step = getRouteEnergyShadowStep(
        tileMap,
        transition.to,
        transition.action,
        absoluteAction,
        received,
        0,
        options,
        transition
      );
      received = step.reserveAfter;
    }
    elapsed = transition?.rebooted
      ? getRebootEndedAbsoluteActions(absoluteAction)
      : absoluteAction;
    const actionCount = index + 1;
    if (actionCount < route.transitions.length && actionCount % registersPerTurn === 0) {
      phase(actionCount / registersPerTurn + 1);
    }
  }

  const round3 = (value) => Number(value.toFixed(3));
  const result = {
    active: true,
    method: ROUTE_UPGRADE_ACTIVITY_METHOD,
    startingEnergy: config.startingEnergy,
    energyReceived: received,
    drawEvents: round3(drawEvents),
    installEvents: round3(installEvents),
    openingInstallEvents: round3(openingInstallEvents),
    laterInstallEvents: round3(installEvents - openingInstallEvents),
    drawEnergySpent: round3(drawEvents),
    transactionEvents: round3(drawEvents + installEvents),
    horizonTurns: raceTurns,
    note: "Expected paid draws and installs per player from the Energy value table's deck simulation, by turn and Energy received."
  };
  routeCache.set(signature, result);
  return result;
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
  let currentEconomyPotentialR = evaluateRouteStartingEconomyPotentialR(
    tileMap,
    route,
    options
  );
  const referenceOptions = referenceStartingEnergy === currentStartingEnergy
    ? options
    : { ...options, startingEnergy: referenceStartingEnergy };
  let referenceEconomyPotentialR = referenceStartingEnergy === currentStartingEnergy
    ? currentEconomyPotentialR
    : evaluateRouteStartingEconomyPotentialR(
      tileMap,
      route,
      referenceOptions
    );
  // Course weight for Energy's worth (energy-course-weight.js); 1 outside pricing.
  const energyCourseMultiplier = Number(options.energyCourseMultiplier) > 0
    ? Number(options.energyCourseMultiplier)
    : 1;
  currentEconomyPotentialR *= energyCourseMultiplier;
  referenceEconomyPotentialR *= energyCourseMultiplier;
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
    pricingEconomyMethod: "simulated-upgrade-economy-table-v50",
    pricingStartingUpgradeCards: config.startingUpgradeCards,
    pricingMaxEnergy: config.maxEnergy
  };
}
