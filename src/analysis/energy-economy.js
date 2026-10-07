// Robo Rally Course Randomizer - energy and upgrade economy: starting resources, route energy value and the flattened energy shadow
import { tileKey } from "./board-geometry.js";
import { REGISTER_COUNT } from "./constants.js";
import { clamp } from "./math.js";
import { isRouteAwareBatteryScoringActive } from "./rule-options.js";

// Shared upgrade-economy defaults.  The legacy DP diagnostics and the v18
// flattened production scorer intentionally share these assumptions, while
// production no longer carries fractional upgrade-card state through routes.
export const ROUTE_ENERGY_ECONOMY_DEFAULTS = Object.freeze({
  startingEnergy: 3,
  maxEnergy: 10,
  startingUpgradeCards: 3,
  drawsPerTurn: 1,
  installsPerTurn: 1,
  drawEnergyCost: 1,
  // Unknown-card usefulness remains an expectation (default 2/3). v18 applies
  // it immediately to feature-card opportunities instead of storing card units
  // in every route-search state.
  usefulUpgradeCardRate: 2 / 3,
  // This is useful investment throughput per install opportunity, not a claim
  // that real upgrade cards cost 2E or have identical effects.
  usefulEnergyPerInstall: 2,
  powerRegistersPerEnergy: 1,
  registersPerTurn: REGISTER_COUNT
});

export function getCourseStartingEnergy(options = {}) {
  const explicitStartingEnergy = Number(options.startingEnergy);
  if (Number.isFinite(explicitStartingEnergy)) {
    return Math.max(0, Math.floor(explicitStartingEnergy));
  }
  const startingEnergyDelta = Number(options.startingEnergyDelta);
  return Math.max(
    0,
    ROUTE_ENERGY_ECONOMY_DEFAULTS.startingEnergy +
      (Number.isFinite(startingEnergyDelta) ? Math.trunc(startingEnergyDelta) : 0)
  );
}

export function getCourseStartingUpgradeCards(options = {}) {
  const explicitStartingCards = Number(options.startingUpgradeCards);
  if (Number.isFinite(explicitStartingCards)) {
    return Math.max(0, Math.floor(explicitStartingCards));
  }
  const startingCardDelta = Number(options.startingUpgradeCardDelta);
  return Math.max(
    0,
    ROUTE_ENERGY_ECONOMY_DEFAULTS.startingUpgradeCards +
      (Number.isFinite(startingCardDelta) ? Math.trunc(startingCardDelta) : 0)
  );
}

export function getCourseMaxEnergy(options = {}) {
  const explicitMaxEnergy = Number(options.maxEnergy);
  return Number.isFinite(explicitMaxEnergy)
    ? Math.max(0, Math.floor(explicitMaxEnergy))
    : ROUTE_ENERGY_ECONOMY_DEFAULTS.maxEnergy;
}

export function getUpgradeEconomyRate(options, key, fallback) {
  const value = Number(options?.[key]);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function getRouteEnergyEconomyConfig(options = {}) {
  return {
    startingEnergy: getCourseStartingEnergy(options),
    maxEnergy: getCourseMaxEnergy(options),
    startingUpgradeCards: getCourseStartingUpgradeCards(options),
    drawsPerTurn: getUpgradeEconomyRate(
      options,
      "upgradeDrawsPerTurn",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.drawsPerTurn
    ),
    installsPerTurn: getUpgradeEconomyRate(
      options,
      "upgradeInstallsPerTurn",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.installsPerTurn
    ),
    drawEnergyCost: getUpgradeEconomyRate(
      options,
      "upgradeDrawEnergyCost",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.drawEnergyCost
    ),
    usefulUpgradeCardRate: clamp(
      getUpgradeEconomyRate(
        options,
        "upgradeUsefulCardRate",
        ROUTE_ENERGY_ECONOMY_DEFAULTS.usefulUpgradeCardRate
      ),
      0,
      1
    ),
    usefulEnergyPerInstall: Math.max(1, Math.floor(getUpgradeEconomyRate(
      options,
      "upgradeUsefulEnergyPerInstall",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.usefulEnergyPerInstall
    ))),
    powerRegistersPerEnergy: getUpgradeEconomyRate(
      options,
      "upgradePowerRegistersPerEnergy",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.powerRegistersPerEnergy
    ),
    registersPerTurn: Math.max(1, getUpgradeEconomyRate(
      options,
      "routeRegistersPerTurn",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.registersPerTurn
    ))
  };
}

// v45 production economy ----------------------------------------------------
//
// Energy and upgrade cards are tracked as separate, coupled resources. The
// route state stores useful-card units in thirds: one useful install needs 3
// units, while one unknown card contributes 2 units under the default 2/3
// usefulness assumption. This makes the coarse recurring tranche explicit:
// three normal 1E draws create about two useful cards, and two useful installs
// consume about 4E of spending capacity. The 10E cap remains only an
// instantaneous storage limit because the shadow spends Energy during future
// Upgrade Phases.
export const ROUTE_USEFUL_CARD_UNIT_DENOMINATOR = 3;

export function getRouteUsefulCardUnitsPerDraw(config) {
  return Math.max(
    0,
    Math.round(config.usefulUpgradeCardRate * ROUTE_USEFUL_CARD_UNIT_DENOMINATOR)
  );
}

export function getRouteUsefulCardUnitsPerInstall() {
  return ROUTE_USEFUL_CARD_UNIT_DENOMINATOR;
}

export function getInitialRouteUsefulCardUnits(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  return Math.max(0, config.startingUpgradeCards * getRouteUsefulCardUnitsPerDraw(config));
}

export function getRouteEconomyFullHorizonActions(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  const turns = Math.max(0, Number(options.routeEnergyHorizonTurns) || 0);
  return Math.max(0, Math.round(turns * config.registersPerTurn));
}

export function getRouteEconomyInstallExposure(boundaryAction, fullHorizonActions) {
  if (!(fullHorizonActions > 0)) return 0;
  return clamp((fullHorizonActions - boundaryAction) / fullHorizonActions, 0, 1);
}

export function getRouteEconomyInstallValueR(boundaryAction, fullHorizonActions, config) {
  return (
    config.usefulEnergyPerInstall *
    config.powerRegistersPerEnergy *
    getRouteEconomyInstallExposure(boundaryAction, fullHorizonActions)
  );
}

export function getRouteEconomyRemainingPhaseCount(boundaryAction, fullHorizonActions, config) {
  if (!(fullHorizonActions > boundaryAction) || !(config.registersPerTurn > 0)) return 0;
  return Math.max(0, Math.ceil((fullHorizonActions - boundaryAction) / config.registersPerTurn));
}

export function clampRouteEconomyCardUnits(cardUnits, boundaryAction, fullHorizonActions, config) {
  const remainingInstalls = getRouteEconomyRemainingPhaseCount(
    boundaryAction,
    fullHorizonActions,
    config
  );
  const usefulCap = remainingInstalls * getRouteUsefulCardUnitsPerInstall();
  return Math.max(0, Math.min(Math.round(Number(cardUnits) || 0), usefulCap));
}

export function getRouteEconomyPhaseChoices(energy, cardUnits, boundaryAction, fullHorizonActions, config) {
  const choices = [];
  const maxDraws = config.drawsPerTurn >= 1 ? 1 : 0;
  const maxInstalls = config.installsPerTurn >= 1 ? 1 : 0;
  const drawCardUnits = getRouteUsefulCardUnitsPerDraw(config);
  const installCardUnits = getRouteUsefulCardUnitsPerInstall();
  const maxInstallInvestment = config.usefulEnergyPerInstall;
  const installValueR = getRouteEconomyInstallValueR(
    boundaryAction,
    fullHorizonActions,
    config
  );

  for (let draw = 0; draw <= maxDraws; draw += 1) {
    const drawCost = draw * config.drawEnergyCost;
    if (drawCost > energy + 1e-9) continue;
    const energyAfterDraw = energy - drawCost;
    const cardsAfterDraw = cardUnits + draw * drawCardUnits;

    // v47.9 smooths the shared Energy shadow without changing real upgrade
    // throughput. usefulEnergyPerInstall is a coarse value/deployment budget,
    // not a literal 2E card price: a single install opportunity may therefore
    // absorb 1..N Energy of useful investment and receive the corresponding
    // fraction of its modeled value. Any positive investment still consumes
    // one useful-card opportunity and the one-install-per-turn slot.
    for (let install = 0; install <= maxInstalls; install += 1) {
      const minInvestment = install ? 1 : 0;
      const maxInvestment = install
        ? Math.min(maxInstallInvestment, Math.floor(energyAfterDraw + 1e-9))
        : 0;
      for (let investment = minInvestment; investment <= maxInvestment; investment += 1) {
        if (install && installValueR <= 1e-9) continue;
        const installCards = install * installCardUnits;
        if (installCards > cardsAfterDraw) continue;
        const valueFraction = install && maxInstallInvestment > 0
          ? investment / maxInstallInvestment
          : 0;
        choices.push({
          draw,
          install,
          installInvestment: investment,
          energyAfter: Math.max(0, energyAfterDraw - investment),
          cardUnitsAfter: Math.max(0, cardsAfterDraw - installCards),
          immediateValueR: installValueR * valueFraction,
          energySpent: drawCost + investment
        });
      }
    }
  }

  return choices;
}

export function getRouteEconomyNextBoundaryAction(absoluteActionCount, config) {
  const count = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const phase = count % config.registersPerTurn;
  return phase === 0 ? count : count + (config.registersPerTurn - phase);
}

export function buildRouteUpgradeOpportunities(
  turnsRemaining,
  initialUpgradeOpportunities,
  options = {},
  fullRouteHorizonTurns = turnsRemaining
) {
  const config = getRouteEnergyEconomyConfig(options);
  const horizon = Math.max(0, Number(turnsRemaining) || 0);
  const fullHorizon = Math.max(horizon, Number(fullRouteHorizonTurns) || 0);
  if (!(horizon > 0) || !(fullHorizon > 0) || !(config.installsPerTurn > 0)) return [];
  const initialCount = Math.max(0, Math.floor(Number(initialUpgradeOpportunities) || 0));
  const slotCount = Math.min(40, Math.ceil(horizon * config.installsPerTurn));
  const result = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const installTime = slot / config.installsPerTurn;
    if (installTime >= horizon - 1e-9) break;
    const initial = slot < initialCount;
    let readyTime = installTime;
    if (!initial) {
      if (!(config.drawsPerTurn > 0)) continue;
      readyTime = Math.max(installTime, (slot - initialCount) / config.drawsPerTurn);
      if (readyTime >= horizon - 1e-9) continue;
    }
    result.push({
      initial,
      // Exposure is measured against the whole estimated race horizon so a
      // late install is worth less even if it is the first remaining slot.
      exposure: clamp((horizon - readyTime) / fullHorizon, 0, 1),
      acquisitionCost: initial ? 0 : config.drawEnergyCost
    });
  }
  return result;
}

export function evaluateRouteUpgradePotential(
  energy,
  turnsRemaining,
  initialUpgradeOpportunities,
  options = {},
  fullRouteHorizonTurns = turnsRemaining
) {
  const config = getRouteEnergyEconomyConfig(options);
  const reserve = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const opportunities = buildRouteUpgradeOpportunities(
    turnsRemaining,
    initialUpgradeOpportunities,
    options,
    fullRouteHorizonTurns
  );
  let dp = Array(reserve + 1).fill(-Infinity);
  dp[0] = 0;
  opportunities.forEach((opportunity) => {
    const next = [...dp];
    for (let spent = 0; spent <= reserve; spent += 1) {
      if (!Number.isFinite(dp[spent])) continue;
      for (let investment = 1; investment <= config.usefulEnergyPerInstall; investment += 1) {
        const cost = opportunity.acquisitionCost + investment;
        if (spent + cost > reserve) break;
        const value = investment * opportunity.exposure * config.powerRegistersPerEnergy;
        next[spent + cost] = Math.max(next[spent + cost], dp[spent] + value);
      }
    }
    dp = next;
  });
  return {
    potential: Math.max(0, ...dp.filter(Number.isFinite)),
    installCapacity: opportunities.length,
    initialInstallCapacity: opportunities.filter((item) => item.initial).length,
    futureInstallCapacity: opportunities.filter((item) => !item.initial).length
  };
}

export function getRouteUpgradePotential(
  energy,
  turnsRemaining,
  initialUpgradeOpportunities,
  options = {},
  fullRouteHorizonTurns = turnsRemaining
) {
  return evaluateRouteUpgradePotential(
    energy,
    turnsRemaining,
    initialUpgradeOpportunities,
    options,
    fullRouteHorizonTurns
  ).potential;
}

export function getRouteMarginalEnergyUtility(
  energy,
  turnsRemaining,
  initialUpgradeOpportunities,
  options = {},
  fullRouteHorizonTurns = turnsRemaining
) {
  const config = getRouteEnergyEconomyConfig(options);
  const reserve = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const current = getRouteUpgradePotential(
    reserve,
    turnsRemaining,
    initialUpgradeOpportunities,
    options,
    fullRouteHorizonTurns
  );
  return {
    plus: reserve < config.maxEnergy
      ? Math.max(0, getRouteUpgradePotential(
        reserve + 1,
        turnsRemaining,
        initialUpgradeOpportunities,
        options,
        fullRouteHorizonTurns
      ) - current)
      : 0,
    minus: reserve > 0
      ? Math.max(0, current - getRouteUpgradePotential(
        reserve - 1,
        turnsRemaining,
        initialUpgradeOpportunities,
        options,
        fullRouteHorizonTurns
      ))
      : 0
  };
}

export function getRouteEnergyGainUtility(
  energy,
  gain,
  turnsRemaining,
  initialUpgradeOpportunities,
  options = {},
  fullRouteHorizonTurns = turnsRemaining
) {
  const config = getRouteEnergyEconomyConfig(options);
  const reserve = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const target = clamp(
    reserve + Math.max(0, Math.floor(Number(gain) || 0)),
    0,
    config.maxEnergy
  );
  if (target <= reserve) return 0;
  return Math.max(0,
    getRouteUpgradePotential(
      target,
      turnsRemaining,
      initialUpgradeOpportunities,
      options,
      fullRouteHorizonTurns
    ) -
    getRouteUpgradePotential(
      reserve,
      turnsRemaining,
      initialUpgradeOpportunities,
      options,
      fullRouteHorizonTurns
    )
  );
}

export function estimateInitialUpgradeOpportunitiesRemaining(
  elapsedTurns,
  horizonTurns,
  config
) {
  if (!(horizonTurns > 0) || !(config.startingUpgradeCards > 0)) return 0;
  const remainingTurns = Math.max(0, horizonTurns - elapsedTurns);
  const exposureFraction = clamp(remainingTurns / horizonTurns, 0, 1);
  const routeScaledHand = Math.round(config.startingUpgradeCards * exposureFraction);
  const remainingInstallCapacity = Math.max(
    0,
    Math.ceil(remainingTurns * config.installsPerTurn)
  );
  // This is deliberately a neutral opportunity proxy, not a claim about which
  // unknown starting cards the player actually installed or saved.
  return Math.min(
    config.startingUpgradeCards,
    routeScaledHand,
    remainingInstallCapacity
  );
}

export function getFlattenedRouteEnergyMarginalValueR(
  energy,
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const fullHorizonActions = getRouteEconomyFullHorizonActions(options);
  const reserve = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  if (!(fullHorizonActions > 0) || reserve >= config.maxEnergy) return 0;

  const nextBoundary = getRouteEconomyNextBoundaryAction(
    absoluteActionCount,
    config
  );
  if (nextBoundary >= fullHorizonActions) return 0;

  // usefulEnergyPerInstall is already the existing model's coarse amount of
  // Energy one useful upgrade opportunity can absorb (default 2E).  Every full
  // tranche already held in reserve pushes the marginal cube to the next
  // install slot.  With one install per turn this produces the smooth surface
  // discussed in the design notes: roughly 1.00R, .86R, .71R... through a
  // seven-turn race, with higher reserves shifted one or more slots later.
  const tranche = Math.max(1, config.usefulEnergyPerInstall);
  const occupiedSlots = Math.floor(reserve / tranche);
  const installStride = config.installsPerTurn > 0
    ? config.registersPerTurn / config.installsPerTurn
    : fullHorizonActions;
  const effectiveBoundary = nextBoundary + occupiedSlots * installStride;
  return Number((
    config.powerRegistersPerEnergy *
    getRouteEconomyInstallExposure(effectiveBoundary, fullHorizonActions)
  ).toFixed(6));
}

export function getFlattenedUnknownUpgradeCardValueR(
  energy,
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const fullHorizonActions = getRouteEconomyFullHorizonActions(options);
  if (!(fullHorizonActions > 0) || !(config.usefulUpgradeCardRate > 0)) return 0;

  const nextBoundary = getRouteEconomyNextBoundaryAction(
    absoluteActionCount,
    config
  );
  const exposure = getRouteEconomyInstallExposure(
    nextBoundary,
    fullHorizonActions
  );
  // An unknown card is not carried through the search.  Give it its expected
  // usefulness now, limited by how much Energy the current reserve could
  // productively invest in one upgrade opportunity.  This is intentionally a
  // smooth expectation rather than a simulated future hand.
  const reserve = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const usefulInvestment = Math.min(
    reserve,
    Math.max(1, config.usefulEnergyPerInstall)
  );
  return Number((
    config.usefulUpgradeCardRate *
    usefulInvestment *
    config.powerRegistersPerEnergy *
    exposure
  ).toFixed(6));
}

export function getFlattenedFreeRandomUpgradeInstallValueR(
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const fullHorizonActions = getRouteEconomyFullHorizonActions(options);
  if (
    !(fullHorizonActions > 0) ||
    !(config.usefulUpgradeCardRate > 0)
  ) {
    return 0;
  }

  // The Waste benefit installs immediately at this register boundary rather
  // than waiting for the next normal Upgrade Phase, so its useful lifetime
  // starts after the current register.
  const exposure = getRouteEconomyInstallExposure(
    Math.max(0, Number(absoluteActionCount) || 0),
    fullHorizonActions
  );

  // Radioactive Waste installs a random upgrade for free. Reverse-engineer
  // its expected value from the existing upgrade-economy assumptions:
  // expected useful-card rate × one full useful-install investment × remaining
  // exposure. Unlike a normal unknown card, this branch does not require the
  // player to hold/spend Energy before the upgrade becomes useful.
  return Number((
    config.usefulUpgradeCardRate *
    Math.max(1, config.usefulEnergyPerInstall) *
    config.powerRegistersPerEnergy *
    exposure
  ).toFixed(6));
}

export function getFlattenedOpeningEconomyState(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  const startingEnergy = clamp(config.startingEnergy, 0, config.maxEnergy);
  if (!isRouteAwareBatteryScoringActive(options)) {
    return {
      energy: startingEnergy,
      usefulCardUnits: 0,
      normalDraws: 0,
      installs: 0,
      energySpent: 0
    };
  }

  const expectedUsefulStartingCards = (
    config.startingUpgradeCards * config.usefulUpgradeCardRate
  );
  const canInstall = (
    config.installsPerTurn > 0 &&
    expectedUsefulStartingCards >= 1 - 1e-9 &&
    startingEnergy > 0
  );
  const openingInvestment = canInstall
    ? Math.min(startingEnergy, Math.max(1, config.usefulEnergyPerInstall))
    : 0;

  return {
    energy: startingEnergy - openingInvestment,
    usefulCardUnits: 0,
    normalDraws: 0,
    installs: openingInvestment > 0 ? 1 : 0,
    energySpent: openingInvestment
  };
}

export function getInitialRouteEconomyShadowState(options = {}) {
  return getFlattenedOpeningEconomyState(options);
}

export function getInitialRouteEnergyShadowReserve(options = {}) {
  return getInitialRouteEconomyShadowState(options).energy;
}

// Compatibility API for existing summaries/route objects.  v18 deliberately
// has no persistent useful-card shadow; returning zero keeps older consumers
// harmless while ensuring this dimension cannot split search states.
export function getInitialRouteUpgradeCardShadowUnits(_options = {}) {
  return 0;
}

export function applyFlattenedRouteEnergyGain(
  energy,
  gain,
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const reserveBefore = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const reserveAfter = clamp(
    reserveBefore + Math.max(0, Math.floor(Number(gain) || 0)),
    0,
    config.maxEnergy
  );
  let rewardR = 0;
  for (let level = reserveBefore; level < reserveAfter; level += 1) {
    rewardR += getFlattenedRouteEnergyMarginalValueR(
      level,
      absoluteActionCount,
      options
    );
  }
  return {
    energy: reserveAfter,
    rewardR: Number(rewardR.toFixed(6)),
    realizedEnergyGain: Math.max(0, reserveAfter - reserveBefore)
  };
}

// v49c dominance fast path: the Energy shadow is advisory and is not part of
// dominance identity.  Before paying the exact flattened-economy step, estimate-first
// search may use this deliberately conservative one-step reward ceiling.  Exposure,
// reserve caps and late-race timing can only reduce the realized reward, so subtracting
// this ceiling gives a safe lower bound on successor cost.
export function getRouteEnergyDominanceBoundConfig(options = {}) {
  if (!isRouteAwareBatteryScoringActive(options)) {
    return { active: false, energyCubeScore: 0, unknownCardScore: 0, upgradeWorld: false };
  }
  const registerScore = Number(options.routeEnergyRegisterScore);
  if (!Number.isFinite(registerScore)) {
    return { active: true, unbounded: true, energyCubeScore: Infinity, unknownCardScore: Infinity, upgradeWorld: Boolean(options.upgradeWorld) };
  }
  const config = getRouteEnergyEconomyConfig(options);
  const nonnegativeRegisterScore = Math.max(0, registerScore);
  const energyCubeScore = (
    config.powerRegistersPerEnergy *
    nonnegativeRegisterScore
  );
  const maxUsefulInvestment = Math.min(
    config.maxEnergy,
    Math.max(1, config.usefulEnergyPerInstall)
  );
  const unknownCardScore = (
    config.usefulUpgradeCardRate *
    maxUsefulInvestment *
    config.powerRegistersPerEnergy *
    nonnegativeRegisterScore
  );
  return {
    active: true,
    unbounded: false,
    energyCubeScore,
    unknownCardScore,
    // Each flattened marginal/card value is rounded to 1e-6 before the final
    // register-score conversion. A single action can accumulate at most six
    // such rounded terms (Battery + card, WAIT, Chop Shop's two-card option, Waste).
    roundingSlackScore: nonnegativeRegisterScore * 0.000006 + 0.001,
    upgradeWorld: Boolean(options.upgradeWorld)
  };
}

export function getRouteEnergyDominanceRewardUpperBound(
  tileMap,
  destination,
  actionId,
  boundConfig
) {
  if (!boundConfig?.active) return 0;
  if (boundConfig.unbounded) return Infinity;

  const tile = tileMap.get(tileKey(destination.x, destination.y));
  const features = tile?.features || [];
  const onBattery = features.some((feature) => feature.type === "battery");
  const onChopShop = features.some((feature) => feature.type === "chopShop");
  const onRadioactiveWaste = features.some(
    (feature) => feature.type === "radioactiveWaste"
  );
  const powerUp = actionId === "WAIT";
  const cardScore = boundConfig.unknownCardScore;
  const cubeScore = boundConfig.energyCubeScore;
  const upgradeCardScore = boundConfig.upgradeWorld ? cardScore : 0;

  let rewardUpperBound = powerUp ? cubeScore : 0;
  if (onBattery) {
    rewardUpperBound += cubeScore + upgradeCardScore;
  }
  if (onChopShop) {
    const energyOption = cubeScore + upgradeCardScore;
    const cardOption = (1 + (boundConfig.upgradeWorld ? 1 : 0)) * cardScore;
    rewardUpperBound += Math.max(energyOption, cardOption);
  }
  if (onRadioactiveWaste) {
    // The real step chooses the better of +1 Energy and a free random upgrade.
    // cardScore is already the conservative full-investment random-upgrade
    // ceiling, so max(cube, card) remains a valid one-step bound.
    rewardUpperBound += Math.max(cubeScore, cardScore);
  }

  // Include both the intermediate 1e-6 rounding ceiling and the final 0.001
  // score rounding so this stays an upper bound even with custom score scales.
  return rewardUpperBound > 0
    ? rewardUpperBound + (boundConfig.roundingSlackScore || 0.001)
    : 0;
}

export function getRouteEnergyShadowStep(
  tileMap,
  destination,
  actionId,
  nextAbsoluteActionCount,
  currentReserve,
  _currentUsefulCardUnits,
  options = {},
  transition = null
) {
  const config = getRouteEnergyEconomyConfig(options);
  const initialState = getInitialRouteEconomyShadowState(options);
  const reserveBefore = clamp(
    Math.floor(Number.isFinite(Number(currentReserve))
      ? Number(currentReserve)
      : initialState.energy),
    0,
    config.maxEnergy
  );
  const powerUp = actionId === "WAIT";

  if (!isRouteAwareBatteryScoringActive(options)) {
    return {
      rewardScore: 0,
      rewardRegisterEquivalents: 0,
      batteryRewardScore: 0,
      powerUpRewardScore: 0,
      chopShopRewardScore: 0,
      radioactiveWasteRewardScore: 0,
      radioactiveWasteRewardRegisterEquivalents: 0,
      radioactiveWasteChoice: null,
      radioactiveWasteEnergyGain: 0,
      radioactiveWasteFreeUpgradeValueR: 0,
      reserveBefore,
      reserveAfter: reserveBefore,
      usefulCardUnitsBefore: 0,
      usefulCardUnitsAfter: 0,
      energyGain: 0,
      batteryEnergyGain: 0,
      powerUpEnergyGain: 0,
      extraCardDraws: 0,
      battery: false,
      powerUp,
      chopShop: false,
      chopShopChoice: null,
      normalDraws: 0,
      installs: 0,
      energySpent: 0
    };
  }

  const tile = tileMap.get(tileKey(destination.x, destination.y));
  const features = tile?.features || [];
  const onBattery = features.some((feature) => feature.type === "battery");
  const onChopShop = features.some((feature) => feature.type === "chopShop");
  const onRadioactiveWaste = features.some(
    (feature) => feature.type === "radioactiveWaste"
  );
  const registerScore = Number(options.routeEnergyRegisterScore);

  let energy = reserveBefore;
  let batteryRewardR = 0;
  let powerUpRewardR = 0;
  let chopShopRewardR = 0;
  let radioactiveWasteRewardR = 0;
  let radioactiveWasteEnergyGain = 0;
  let radioactiveWasteFreeUpgradeValueR = 0;
  let radioactiveWasteChoice = null;
  let batteryEnergyGain = 0;
  let powerUpEnergyGain = 0;
  let extraCardDraws = 0;
  let chopShopChoice = null;

  if (onBattery) {
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      1,
      nextAbsoluteActionCount,
      options
    );
    batteryRewardR += energyPackage.rewardR;
    batteryEnergyGain += energyPackage.realizedEnergyGain;
    energy = energyPackage.energy;

    // Upgrade World adds an unknown card to a Battery activation.  Value the
    // expectation immediately; do not turn it into persistent search state.
    if (options.upgradeWorld) {
      batteryRewardR += getFlattenedUnknownUpgradeCardValueR(
        energy,
        nextAbsoluteActionCount,
        options
      );
      extraCardDraws += 1;
    }
  }

  // Power Up remains a real WAIT action.  Its physical/tempo consequences are
  // already scored by the route transition, so the economy adds only the
  // marginal value of the +1E cube.
  if (powerUp) {
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      1,
      nextAbsoluteActionCount,
      options
    );
    powerUpRewardR += energyPackage.rewardR;
    powerUpEnergyGain += energyPackage.realizedEnergyGain;
    energy = energyPackage.energy;
  }

  if (onChopShop) {
    const upgradeWorldCards = options.upgradeWorld ? 1 : 0;
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      1,
      nextAbsoluteActionCount,
      options
    );
    const energyOptionCardValue = upgradeWorldCards
      ? getFlattenedUnknownUpgradeCardValueR(
        energyPackage.energy,
        nextAbsoluteActionCount,
        options
      )
      : 0;
    const energyOptionRewardR = energyPackage.rewardR + energyOptionCardValue;

    const cardCount = 1 + upgradeWorldCards;
    const cardOptionRewardR = cardCount * getFlattenedUnknownUpgradeCardValueR(
      energy,
      nextAbsoluteActionCount,
      options
    );
    const chooseCard = cardOptionRewardR > energyOptionRewardR + 1e-9;
    chopShopChoice = chooseCard ? "card" : "energy";
    if (chooseCard) {
      chopShopRewardR += cardOptionRewardR;
      extraCardDraws += cardCount;
    } else {
      chopShopRewardR += energyOptionRewardR;
      extraCardDraws += upgradeWorldCards;
      energy = energyPackage.energy;
    }
  }

  // Radioactive Waste resolves at the end of every surviving register. Its
  // current movement is already handled by the ordinary current machinery.
  // The positive branch is a real player choice: +1 Energy OR install one
  // random upgrade for free. Value both with the same flattened economy used
  // elsewhere and take the better branch. A reboot/crash has already removed
  // the robot before this end-of-register benefit can happen.
  if (
    onRadioactiveWaste &&
    !transition?.rebooted &&
    !transition?.crashed
  ) {
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      1,
      nextAbsoluteActionCount,
      options
    );
    const energyOptionRewardR = energyPackage.rewardR;
    radioactiveWasteFreeUpgradeValueR =
      getFlattenedFreeRandomUpgradeInstallValueR(
        nextAbsoluteActionCount,
        options
      );
    const chooseUpgrade =
      radioactiveWasteFreeUpgradeValueR > energyOptionRewardR + 1e-9;
    radioactiveWasteChoice = chooseUpgrade ? "free-upgrade" : "energy";
    if (chooseUpgrade) {
      radioactiveWasteRewardR += radioactiveWasteFreeUpgradeValueR;
    } else {
      radioactiveWasteRewardR += energyOptionRewardR;
      radioactiveWasteEnergyGain += energyPackage.realizedEnergyGain;
      energy = energyPackage.energy;
    }
  }

  const batteryRewardScore = batteryRewardR * registerScore;
  const powerUpRewardScore = powerUpRewardR * registerScore;
  const chopShopRewardScore = chopShopRewardR * registerScore;
  const radioactiveWasteRewardScore = radioactiveWasteRewardR * registerScore;
  const rewardScore = (
    batteryRewardScore +
    powerUpRewardScore +
    chopShopRewardScore +
    radioactiveWasteRewardScore
  );
  const rewardRegisterEquivalents = (
    batteryRewardR +
    powerUpRewardR +
    chopShopRewardR +
    radioactiveWasteRewardR
  );

  return {
    rewardScore: Number(Math.max(0, rewardScore).toFixed(3)),
    rewardRegisterEquivalents: Number(Math.max(0, rewardRegisterEquivalents).toFixed(6)),
    batteryRewardScore: Number(Math.max(0, batteryRewardScore).toFixed(3)),
    powerUpRewardScore: Number(Math.max(0, powerUpRewardScore).toFixed(3)),
    chopShopRewardScore: Number(Math.max(0, chopShopRewardScore).toFixed(3)),
    radioactiveWasteRewardScore: Number(
      Math.max(0, radioactiveWasteRewardScore).toFixed(3)
    ),
    radioactiveWasteRewardRegisterEquivalents: Number(
      Math.max(0, radioactiveWasteRewardR).toFixed(6)
    ),
    radioactiveWasteChoice,
    radioactiveWasteEnergyGain,
    radioactiveWasteFreeUpgradeValueR: Number(
      Math.max(0, radioactiveWasteFreeUpgradeValueR).toFixed(6)
    ),
    reserveBefore,
    reserveAfter: energy,
    usefulCardUnitsBefore: 0,
    usefulCardUnitsAfter: 0,
    energyGain: Math.max(0, energy - reserveBefore),
    batteryEnergyGain,
    powerUpEnergyGain,
    extraCardDraws,
    battery: onBattery,
    powerUp,
    chopShop: onChopShop,
    chopShopChoice,
    normalDraws: 0,
    installs: 0,
    energySpent: 0
  };
}
