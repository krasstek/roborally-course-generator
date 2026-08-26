// Robo Rally Course Randomizer - route analysis and scoring runtime
const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const {
  FLAG_APPROACH_WEIGHTS,
  getDamageDeckPressureMultipliers,
  getFlagAreaFeatureScore,
  getTilePenaltyForFeature
} = await import(versionedPath("./feature-weights.js"));

// This module is a route-evaluation model for board setup, not a full RoboRally
// simulator. It resolves movement-shaping effects that materially change route
// topology, while many late-phase hazards are intentionally represented as
// penalties instead of exact register-by-register gameplay.
//
// Current design invariants:
// - Every route exposed to Dev View must remain physically/register/facing exact
//   and reconstruct to a literally playable five-register program sequence.
// - Energy/upgrades remain part of route quality whenever they are in play;
//   Energy Crisis (lighterGame) is currently the only rule that removes them.
// - Programming-card legality uses only the consequential rolling window: the
//   previous five-register program plus the current one. Search carries literal
//   card-use counts for those two programs and the immediately previous executed
//   action solely so Again can repeat it; no older program history is search state.
// - Uncertainty may reduce route breadth, but it never coarsens card legality.
// - Hazards are intrinsic route costs. Traffic remains a later relational layer:
//   it never alters intrinsic legality, but confidence-weighted traffic may request
//   additional leg witnesses after the first exact route set is complete.
// - Normal primary routing is estimate-first, realize-second. Every structural
//   start receives a complete physical full-course estimate, one cached leg at a
//   time, before the player-count acceptance floor is consulted. Estimated card
//   demand is soft preference only and cannot make a physical route unreachable.
// - Each complete estimate is then realized against the exact rolling two-program
//   card model. The first impossible register triggers a physical suffix replan
//   from that exact board/register/history point; a bounded estimate miss widens
//   to physical-graph exhaustion instead of becoming a hidden capacity failure.
// - Traffic uses player-normalized occupancy, then attenuates future traffic
//   continuously as elapsed registers, hazards and prior predicted interactions
//   make distant multiplayer positions less credible. Alternatives are demand-led.
// - Energy is soft guidance during physical estimation and is replayed/repriced on
//   the exact realized route; it is never a physical dominance dimension.

const DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};

const OPPOSITE = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};

const ACTIONS = [
  { id: "WAIT", type: "wait" },
  { id: "FORWARD", type: "move", relative: "forward" },
  { id: "FORWARD_2", type: "move", relative: "forward", steps: 2 },
  { id: "FORWARD_3", type: "move", relative: "forward", steps: 3 },
  { id: "BACK", type: "move", relative: "back" },
  { id: "LEFT", type: "turn", rotation: "ccw" },
  { id: "RIGHT", type: "turn", rotation: "cw" },
  { id: "UTURN", type: "turn", rotation: "uturn" }
];

const ROTATION_ORDER = ["N", "E", "S", "W"];
const EDGE_BEHAVIOR = "pit";
const REBOOT_DAMAGE_PENALTY = 8;
const MORE_DEADLY_REBOOT_DAMAGE_PENALTY = 12;
const REGISTER_TEMPO_COST = 6.4;
const REBOOT_AVERAGE_LOST_REGISTERS = 2;
// Reboots also jump the route to an archive/reboot token. This small extra cost
// mirrors portal/teleporter readability friction without re-counting damage or tempo.
const REBOOT_DISCONTINUITY_PENALTY = 3;
const REGISTER_COUNT = 5;
const PROGRAM_CARD_COUNTS = new Map([
  ["FORWARD", 4],
  ["FORWARD_2", 3],
  ["FORWARD_3", 1],
  ["RIGHT", 4],
  ["LEFT", 4],
  ["UTURN", 1],
  ["BACK", 1],
  ["WAIT", 1]
]);
const PROGRAM_CARD_IDS = Object.freeze([...PROGRAM_CARD_COUNTS.keys()]);
const AGAIN_CARD_COUNT = 1;

// v13 card-model design invariant:
// The route analyzer is not a deck-order simulator. For planning credibility it
// uses a rolling two-turn abstraction: the previous five-register program is
// treated as known depletion from the 20-card deck, while the current program
// must fit what remains. Real reshuffle boundaries are deliberately ignored:
// they are too fragile to plan around, and modelling them would add false
// precision to a course randomizer. The four unplayed cards from a nine-card
// hand are likewise unknown rather than hard-depleted; their uncertainty is
// represented by generic rarity cost instead.
//
// Copy-count scarcity is intentionally data-driven so future card sets (for
// example Robo Rally Transformers) can add 2-copy or unique cards without new
// route-search rules. Four-or-more-copy cards have no scarcity overhead. The
// numeric weights below are centralized tuning values; the design invariant is
// their copy-count ordering, not these exact initial numbers.
const PROGRAM_CARD_SCARCITY_COST_BY_COPIES = Object.freeze({
  1: 4.0,
  2: 1.6,
  3: 0.4
});
const AGAIN_REPEAT_SCARCITY_FACTOR = 0.65;

// Route-level program plausibility:
// Exact rolling-card legality defines the candidate set. Scarcity and same-program
// combination pressure only rank legal routes; they may never remove the sole
// legal route. Unavoidable pressure is reported upward as course difficulty.
// Individual low-copy cards already carry linear scarcity cost. A program that
// concentrates several scarce resources into the same five-register turn is
// less likely to be practically available than the same rare demands spread
// across separate turns. This is preference only: it changes route ranking,
// never literal card legality. The scale is expressed through copy-count
// scarcity rather than named cards so future card sets inherit the behavior.
const PROGRAM_COMBINATION_PLAUSIBILITY = Object.freeze({
  freeScarcityLoad: 4.0,
  scarceUseThreshold: 1.6,
  excessLoadWeight: 0.25,
  extraScarceUseWeight: 1.15,
  extraScarceUseQuadraticWeight: 0.35
});

// Nine actions are retained only as a witness window: previous complete turn
// (5) + at most four already-programmed registers of the current turn. This is
// not intended to represent the nine cards physically drawn into a hand.
const PROGRAM_HISTORY_WINDOW_SIZE = REGISTER_COUNT * 2 - 1;
const PROGRAM_RESOURCE_SUMMARY_CACHE = new Map();
const ROLLING_PROGRAM_CONTEXT_CACHE = new Map();
const ROLLING_PROGRAM_CONTEXT_CACHE_LIMIT = 50000;
// Exact transition memo keyed by canonical two-program depletion state + register
// phase + immediately previous action + candidate action. Board position is absent
// because programming-card legality does not depend on it.
const PROGRAM_ACTION_TRANSITION_CACHE = new Map();
const PROGRAM_ACTION_TRANSITION_CACHE_LIMIT = 50000;
// v17 performance: contextual dominance keys ask for the same compact rolling
// program summary at many different physical squares. Cache that *summary/key*
// separately from the hard legality allocator so key construction does not keep
// slicing the nine-action witness and recounting the same low-copy cards.
// This cache is only a memoization layer; it does not change program legality.
const ROLLING_PROGRAM_SIGNATURE_IDS = new Map();
let nextRollingProgramSignatureId = 1;

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

function getUpgradeEconomyRate(options, key, fallback) {
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
const ROUTE_USEFUL_CARD_UNIT_DENOMINATOR = 3;

function getRouteUsefulCardUnitsPerDraw(config) {
  return Math.max(
    0,
    Math.round(config.usefulUpgradeCardRate * ROUTE_USEFUL_CARD_UNIT_DENOMINATOR)
  );
}

function getRouteUsefulCardUnitsPerInstall() {
  return ROUTE_USEFUL_CARD_UNIT_DENOMINATOR;
}

function getInitialRouteUsefulCardUnits(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  return Math.max(0, config.startingUpgradeCards * getRouteUsefulCardUnitsPerDraw(config));
}

function getRouteEconomyFullHorizonActions(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  const turns = Math.max(0, Number(options.routeEnergyHorizonTurns) || 0);
  return Math.max(0, Math.round(turns * config.registersPerTurn));
}

function getRouteEconomyInstallExposure(boundaryAction, fullHorizonActions) {
  if (!(fullHorizonActions > 0)) return 0;
  return clamp((fullHorizonActions - boundaryAction) / fullHorizonActions, 0, 1);
}

function getRouteEconomyInstallValueR(boundaryAction, fullHorizonActions, config) {
  return (
    config.usefulEnergyPerInstall *
    config.powerRegistersPerEnergy *
    getRouteEconomyInstallExposure(boundaryAction, fullHorizonActions)
  );
}

function getRouteEconomyRemainingPhaseCount(boundaryAction, fullHorizonActions, config) {
  if (!(fullHorizonActions > boundaryAction) || !(config.registersPerTurn > 0)) return 0;
  return Math.max(0, Math.ceil((fullHorizonActions - boundaryAction) / config.registersPerTurn));
}

function clampRouteEconomyCardUnits(cardUnits, boundaryAction, fullHorizonActions, config) {
  const remainingInstalls = getRouteEconomyRemainingPhaseCount(
    boundaryAction,
    fullHorizonActions,
    config
  );
  const usefulCap = remainingInstalls * getRouteUsefulCardUnitsPerInstall();
  return Math.max(0, Math.min(Math.round(Number(cardUnits) || 0), usefulCap));
}

function getRouteEconomyPhaseChoices(energy, cardUnits, boundaryAction, fullHorizonActions, config) {
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

function getRouteEconomyNextBoundaryAction(absoluteActionCount, config) {
  const count = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const phase = count % config.registersPerTurn;
  return phase === 0 ? count : count + (config.registersPerTurn - phase);
}

function buildRouteUpgradeOpportunities(
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
const ROUTE_PATH_KEY_CACHE = new WeakMap();
const ROUTE_TILE_SET_CACHE = new WeakMap();
const ROUTE_EDGE_SET_CACHE = new WeakMap();
const ROUTE_DIRECTIONS_CACHE = new WeakMap();
const TRAFFIC_TIMELINE_CACHE = new WeakMap();
const TRAFFIC_PAIR_PROFILE_CACHE = new WeakMap();
const TRAFFIC_DISPLACEMENT_CACHE = new WeakMap();

const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE = new WeakMap();
const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT = 50000;

function getContextualPhysicalOptionSignature(options = {}) {
  const rebootTokens = (options.rebootTokens || [])
    .map((token) => [
      token.x ?? "",
      token.y ?? "",
      token.facing ?? token.dir ?? "",
      token.boardId ?? token.board ?? ""
    ].join(","))
    .sort()
    .join(";");

  const boardRects = (options.boardRects || [])
    .map((rect) => [
      rect.id ?? rect.boardId ?? "",
      rect.x ?? "",
      rect.y ?? "",
      rect.width ?? rect.w ?? "",
      rect.height ?? rect.h ?? ""
    ].join(","))
    .sort()
    .join(";");

  return [
    options.recoveryRule ?? "",
    options.lessDeadlyGame ? 1 : 0,
    options.repulsorOverdrive ? 1 : 0,
    options.repairStations ? 1 : 0,
    options.lighterGame ? 1 : 0,
    options.routeAwareBatteryScoring ? 1 : 0,
    options.flamingOil ? 1 : 0,
    options.walledIn ? 1 : 0,
    options.hardReboot ? 1 : 0,
    options.playerCount ?? "",
    rebootTokens,
    boardRects
  ].join("|");
}

function getContextualPhysicalTransitionCache(tileMap) {
  let cache = CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.set(tileMap, cache);
  }
  return cache;
}

function cloneCachedTransition(transition) {
  if (!transition) return transition;
  return {
    ...transition,
    from: transition.from ? { ...transition.from } : transition.from,
    to: transition.to ? { ...transition.to } : transition.to,
    rebootChoices: transition.rebootChoices
      ? transition.rebootChoices.map((choice) => ({ ...choice }))
      : transition.rebootChoices,
    traversed: (transition.traversed || []).map((point) => ({ ...point })),
    conveyorSteps: (transition.conveyorSteps || []).map((step) => ({
      ...step,
      from: step.from ? { ...step.from } : step.from,
      to: step.to ? { ...step.to } : step.to
    })),
    boardEvents: (transition.boardEvents || []).map((event) => ({
      ...event,
      from: event.from ? { ...event.from } : event.from,
      to: event.to ? { ...event.to } : event.to,
      at: event.at ? { ...event.at } : event.at
    }))
  };
}

function getCachedContextualPhysicalTransition(
  tileMap,
  state,
  action,
  options,
  optionSignature
) {
  const goal = options.goal;
  const key = [
    state.x,
    state.y,
    state.facing,
    action.id,
    Number.isInteger(options.registerIndex)
      ? `r${((options.registerIndex % REGISTER_COUNT) + REGISTER_COUNT) % REGISTER_COUNT}`
      : "r?",
    goal?.x ?? "",
    goal?.y ?? "",
    optionSignature
  ].join("|");

  const cache = getContextualPhysicalTransitionCache(tileMap);
  const cached = cache.get(key);
  if (cached) {
    // Cached contextual transitions are treated as immutable by the route
    // search and downstream scoring. Keep the defensive clone on cache fill
    // so the stored value is isolated from the original simulation result,
    // but avoid deep-cloning that stored transition again on every cache hit.
    return {
      transition: cached,
      hit: true
    };
  }

  const transition = simulateAction(tileMap, state, action, options);
  cache.set(key, cloneCachedTransition(transition));

  if (cache.size > CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  return {
    transition,
    hit: false
  };
}
const LINE_OF_SIGHT_CACHE = new WeakMap();
const ROUTE_SIMILARITY_CACHE = new Map();
const OVERLAP_PENALTY_CACHE = new Map();
const LATERAL_THREAT_CACHE = new Map();
const REAR_THREAT_CACHE = new Map();
const ROUTE_PAIR_CACHE_LIMIT = 2500;

const ANALYSIS_TELEMETRY_MAX_SEARCHES = 5000;
const ANALYSIS_TELEMETRY = {
  routeSearches: []
};

function analysisTelemetryNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function resetAnalysisTelemetry() {
  ANALYSIS_TELEMETRY.routeSearches.length = 0;
}

export function getAnalysisTelemetrySnapshot() {
  const routeSearches = ANALYSIS_TELEMETRY.routeSearches.map((entry) => ({ ...entry }));
  const totalsByKind = {};
  let totalExpansions = 0;
  let totalDurationMs = 0;
  let cappedSearches = 0;
  let physicalCacheHits = 0;
  let physicalCacheMisses = 0;

  routeSearches.forEach((entry) => {
    // Physical-template searches report cache counts directly on the telemetry
    // entry; exact contextual searches historically report them inside their
    // profile. Use the larger representation rather than summing both so a
    // search that exposes the same counts in both places is not double-counted.
    physicalCacheHits += Math.max(
      entry.physicalCacheHits ?? 0,
      entry.contextualProfile?.physicalCacheHits ?? 0
    );
    physicalCacheMisses += Math.max(
      entry.physicalCacheMisses ?? 0,
      entry.contextualProfile?.physicalCacheMisses ?? 0
    );
    totalExpansions += entry.expansions ?? 0;
    totalDurationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) cappedSearches += 1;
    const kind = entry.kind ?? "unknown";
    const bucket = totalsByKind[kind] ?? {
      searches: 0,
      expansions: 0,
      durationMs: 0,
      capped: 0
    };
    bucket.searches += 1;
    bucket.expansions += entry.expansions ?? 0;
    bucket.durationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) bucket.capped += 1;
    totalsByKind[kind] = bucket;
  });

  Object.values(totalsByKind).forEach((bucket) => {
    bucket.durationMs = Number(bucket.durationMs.toFixed(2));
  });

  const slowestSearch = routeSearches.reduce(
    (slowest, entry) => !slowest || (entry.durationMs ?? 0) > (slowest.durationMs ?? 0) ? entry : slowest,
    null
  );

  const contextualProfileTotals = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    actionScoringMs: 0,
    historyBuildMs: 0,
    destinationBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    completedGoals: 0,
    searchesWithGoal: 0,
    cappedZeroGoalSearches: 0,
    cappedWithGoalSearches: 0,
    firstGoalExpansionTotal: 0,
    postFirstGoalExpansions: 0,
    optionalCompletionSearches: 0,
    optionalCompletionStops: 0,
    optionalCompletionShortReturns: 0,
    cappedZeroGoalExpansions: 0,
    cappedWithGoalExpansions: 0,
    exactContextualSearches: 0,
    exactContextualExpansions: 0,
    horizonSolidSearches: 0,
    horizonUncertainSearches: 0,
    horizonSpeculativeSearches: 0,
    horizonFirstGoalUncertain: 0,
    horizonFirstGoalSpeculative: 0,
    horizonOptionalSuppressed: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0,
    dominanceKeysFull: 0,
    dominanceKeysPhysical: 0,
    dominanceKeysPhysicalPhase: 0,
    dominanceKeysNoProgramDetail: 0,
    dominanceKeysNoPrevious: 0,
    dominanceKeysNoUsage: 0,
    dominanceKeysNoAgain: 0,
    dominanceKeysNoAbsolute: 0,
    dominanceKeysNoEnergy: 0,
    dominanceKeysNoCards: 0,
    dominanceKeysNoEconomyShadow: 0,
    dominanceKeysNoGoal: 0,
    dominanceUsageParetoStates: 0,
    dominanceUsageParetoDominated: 0,
    dominanceUsageParetoMultiStateGroups: 0
  };

  routeSearches.forEach((entry) => {
    const profile = entry.contextualProfile;
    if (!profile) return;
    Object.keys(contextualProfileTotals).forEach((key) => {
      contextualProfileTotals[key] += profile[key] ?? 0;
    });
  });

  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "actionScoringMs",
    "historyBuildMs",
    "destinationBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    contextualProfileTotals[key] = Number(contextualProfileTotals[key].toFixed(2));
  });

  return {
    routeSearches,
    routeSearchCount: routeSearches.length,
    totalExpansions,
    totalDurationMs: Number(totalDurationMs.toFixed(2)),
    cappedSearches,
    slowestSearch: slowestSearch ? { ...slowestSearch } : null,
    totalsByKind,
    contextualProfileTotals,
    physicalCacheTotals: {
      hits: physicalCacheHits,
      misses: physicalCacheMisses
    }
  };
}

function recordRouteSearchTelemetry(kind, startedAt, details = {}) {
  const entry = {
    kind,
    durationMs: Number((
      Number.isFinite(Number(details.durationMs))
        ? Number(details.durationMs)
        : analysisTelemetryNow() - startedAt
    ).toFixed(2)),
    expansions: details.expansions ?? 0,
    maxExpansions: details.maxExpansions ?? 0,
    completedRoutes: details.completedRoutes ?? 0,
    returnedRoutes: details.returnedRoutes ?? details.completedRoutes ?? 0,
    hitExpansionCap: details.hitExpansionCap !== undefined
      ? Boolean(details.hitExpansionCap)
      : Boolean(
        details.maxExpansions > 0 &&
        (details.expansions ?? 0) >= details.maxExpansions
      ),
    start: details.start ?? null,
    goal: details.goal ?? null,
    legIndex: details.legIndex ?? null,
    actionHorizonStops: details.actionHorizonStops ?? 0,
    maxLocalActionsSeen: details.maxLocalActionsSeen ?? 0,
    hitActionHorizon: Boolean(details.hitActionHorizon || (details.actionHorizonStops ?? 0) > 0),
    zeroRouteHorizonFailure: Boolean(details.zeroRouteHorizonFailure),
    physicalCacheHits: details.physicalCacheHits ?? 0,
    physicalCacheMisses: details.physicalCacheMisses ?? 0,
    physicalTimingTemplate: Boolean(details.physicalTimingTemplate),
    contextualProfile: details.contextualProfile
      ? { ...details.contextualProfile }
      : null
  };

  if (ANALYSIS_TELEMETRY.routeSearches.length >= ANALYSIS_TELEMETRY_MAX_SEARCHES) {
    ANALYSIS_TELEMETRY.routeSearches.shift();
  }
  ANALYSIS_TELEMETRY.routeSearches.push(entry);
}

class MinHeap {
  constructor(score) {
    this.items = [];
    this.score = score;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    let index = items.length;
    items.push(value);

    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentValue = items[parent];
      if (this.score(parentValue) <= this.score(value)) {
        break;
      }
      items[index] = parentValue;
      index = parent;
    }

    items[index] = value;
  }

  pop() {
    const items = this.items;
    if (!items.length) {
      return null;
    }

    const root = items[0];
    const last = items.pop();
    if (!items.length) {
      return root;
    }

    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) {
        break;
      }

      if (child + 1 < items.length && this.score(items[child + 1]) < this.score(items[child])) {
        child += 1;
      }

      if (this.score(last) <= this.score(items[child])) {
        break;
      }

      items[index] = items[child];
      index = child;
    }

    items[index] = last;
    return root;
  }
}

function setBoundedCacheValue(cache, key, value, limit = ROUTE_PAIR_CACHE_LIMIT) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= limit) {
    cache.delete(cache.keys().next().value);
  }

  cache.set(key, value);
}

export function clearAnalysisCaches() {
  ROUTE_SIMILARITY_CACHE.clear();
  OVERLAP_PENALTY_CACHE.clear();
  LATERAL_THREAT_CACHE.clear();
  REAR_THREAT_CACHE.clear();
  FIXED_ROUTE_PRICING_ECONOMY_CACHE = new WeakMap();
  PROGRAM_RESOURCE_SUMMARY_CACHE.clear();
  ROLLING_PROGRAM_CONTEXT_CACHE.clear();
  PROGRAM_ACTION_TRANSITION_CACHE.clear();
  ROLLING_PROGRAM_SIGNATURE_IDS.clear();
  nextRollingProgramSignatureId = 1;
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function stateKey(state) {
  return `${state.x},${state.y},${state.facing ?? "E"}`;
}

function cloneState(state) {
  return {
    x: state.x,
    y: state.y,
    facing: state.facing ?? "E"
  };
}

function getWalls(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type === "wall") {
      for (const side of feature.sides || []) {
        walls.add(side);
      }
    }
  }

  return walls;
}

function hasEdgeFeature(tile, type, side) {
  return (tile?.features || []).some((feature) => (
    feature.type === type &&
    (feature.sides || []).includes(side)
  ));
}

function isBoundaryBlockedByWalls(tileMap, from, to, dir) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const toTile = tileMap.get(tileKey(to.x, to.y));
  const opposite = OPPOSITE[dir];

  // Ordinary walls remain fully bidirectional and independent of any
  // red/green overlay markers.
  const fromWalls = getWalls(fromTile);
  const toWalls = getWalls(toTile);
  if (fromWalls.has(dir) || toWalls.has(opposite)) {
    return true;
  }

  const redFrom = hasEdgeFeature(fromTile, "redWall", dir);
  const redTo = hasEdgeFeature(toTile, "redWall", opposite);
  const greenFrom = hasEdgeFeature(fromTile, "greenWall", dir);

  // A red wall by itself is an ordinary wall. A matching green edge on the
  // opposite tile only opens travel from GREEN -> RED across that exact border.
  if (redFrom) {
    return true;
  }
  if (redTo && !greenFrom) {
    return true;
  }

  // Green alone contributes no blocking effect. greenTo only matters when
  // paired with redFrom, which is already blocked in this direction.
  return false;
}

function getBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

function getRepulsor(tile, side) {
  return (tile?.features || []).find((feature) => (
    feature.type === "repulsor" &&
    (feature.sides || []).includes(side)
  )) ?? null;
}

function getRamps(tile) {
  return (tile?.features || []).filter((feature) => feature.type === "ramp");
}

function getGear(tile) {
  return (tile?.features || []).find((feature) => feature.type === "gear") ?? null;
}

function getPushes(tile) {
  const pushes = [];
  const seen = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "push" || !feature.dir || seen.has(feature.dir)) {
      continue;
    }

    pushes.push(feature);
    seen.add(feature.dir);
  }

  return pushes;
}

function hasExplicitTiming(feature) {
  return Array.isArray(feature?.timing) && feature.timing.length > 0;
}

function getRegisterNumber(options = {}) {
  if (!Number.isInteger(options.registerIndex)) return null;
  const normalized = ((options.registerIndex % REGISTER_COUNT) + REGISTER_COUNT) % REGISTER_COUNT;
  return normalized + 1;
}

function hasKnownRegisterTiming(options = {}) {
  return getRegisterNumber(options) !== null;
}

function isFeatureActiveThisRegister(feature, options = {}) {
  if (!hasExplicitTiming(feature)) return true;
  const registerNumber = getRegisterNumber(options);
  return registerNumber !== null && feature.timing.includes(registerNumber);
}

function hasActiveFeature(tile, type, options = {}) {
  return (tile?.features || []).some((feature) => (
    feature.type === type && isFeatureActiveThisRegister(feature, options)
  ));
}

function getFeatureDutyCycle(feature, fallback = 1) {
  if (!hasExplicitTiming(feature)) return fallback;
  return Math.max(0, Math.min(1, new Set(feature.timing).size / REGISTER_COUNT));
}

function hasHomingMissile(tile) {
  return (tile?.features || []).some((feature) => feature.type === "homingMissile");
}

function getPortal(tile) {
  return (tile?.features || []).find((feature) => feature.type === "portal") ?? null;
}

function getTeleporter(tile) {
  return (tile?.features || []).find((feature) => feature.type === "teleporter") ?? null;
}

function isOil(tile) {
  return (tile?.features || []).some((feature) => feature.type === "oil");
}

function isWater(tile) {
  return (tile?.features || []).some((feature) => feature.type === "water");
}

function isCurrent(tile) {
  return (tile?.features || []).some((feature) => (
    feature.type === "water" || feature.type === "radioactiveWaste"
  ));
}

function isPit(tile) {
  return (tile?.features || []).some((feature) => feature.type === "pit");
}

function getLedgeSides(tile) {
  const sides = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "ledge") continue;
    for (const side of feature.sides || []) {
      sides.add(side);
    }
  }

  return sides;
}

function hasRampForDir(tile, dir) {
  return getRamps(tile).some((feature) => feature.dir === dir);
}

function crossesLedgeBoundary(fromTile, toTile, dir) {
  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);
  return fromLedges.has(dir) || toLedges.has(OPPOSITE[dir]);
}

function getLedgeElevationDelta(fromTile, toTile, dir) {
  let delta = 0;

  if (getLedgeSides(fromTile).has(dir)) {
    delta += 1;
  }
  if (getLedgeSides(toTile).has(OPPOSITE[dir])) {
    delta -= 1;
  }

  return delta;
}

function buildPortalMap(tileMap) {
  const portalMap = new Map();

  for (const tile of tileMap.values()) {
    const portal = getPortal(tile);
    if (!portal?.id) {
      continue;
    }

    if (!portalMap.has(portal.id)) {
      portalMap.set(portal.id, []);
    }

    portalMap.get(portal.id).push({ x: tile.x, y: tile.y });
  }

  return portalMap;
}

function getBoardRectForPoint(point, boardRects = []) {
  return boardRects.find((rect) => (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )) ?? null;
}

function getRebootTokenForPoint(point, boardRects = [], rebootTokens = []) {
  const boardRect = getBoardRectForPoint(point, boardRects);
  if (!boardRect) {
    return null;
  }

  return rebootTokens.find((token) => token.boardIndex === boardRect.index) ?? null;
}

function getHomeRebootChoices(rebootTokens = []) {
  return rebootTokens.flatMap((token) => (
    ROTATION_ORDER.map((facing) => ({
      x: token.x,
      y: token.y,
      facing
    }))
  ));
}

function getHomeRebootTokensForStart(start, rebootTokens = []) {
  const startKeyValue = tileKey(start.x, start.y);
  return rebootTokens.filter((token) => (token.startKeys || []).includes(startKeyValue));
}

function getRebootDamagePenalty(options = {}) {
  const basePenalty = options.moreDeadlyGame ? MORE_DEADLY_REBOOT_DAMAGE_PENALTY : REBOOT_DAMAGE_PENALTY;
  return Number((basePenalty * getDamageDeckPressureMultipliers(options).reboot).toFixed(2));
}

function getRegisterPosition(actionCount) {
  return ((Math.max(1, actionCount) - 1) % REGISTER_COUNT) + 1;
}

function getRebootRoutePenalty(actionCount = null) {
  const lostRegisters = Number.isFinite(actionCount)
    ? REGISTER_COUNT - getRegisterPosition(actionCount)
    : REBOOT_AVERAGE_LOST_REGISTERS;

  return Number((lostRegisters * REGISTER_TEMPO_COST + REBOOT_DISCONTINUITY_PENALTY).toFixed(2));
}

function isBatteryActive(options = {}) {
  return !options.lighterGame;
}

function isRouteAwareBatteryScoringActive(options = {}) {
  return Boolean(
    options.routeAwareBatteryScoring &&
    !options.lighterGame &&
    Number(options.routeEnergyHorizonTurns) > 0 &&
    Number(options.routeEnergyRegisterScore) > 0
  );
}

// v18 flattened production Energy economy -----------------------------------
//
// Design invariant: Energy remains strategically relevant whenever upgrades
// exist, but the course generator should not pretend to know a robot's exact
// future upgrade-card inventory several turns ahead.  The old v45 production
// shadow coupled Energy to fractional "useful card units" and solved a small
// future Upgrade-Phase allocation problem at every route step.  That was a
// reasonable theory of value, but it created state/key fragmentation from an
// inherently speculative resource.
//
// v18 keeps the theory and removes the false precision:
//   * actual Energy reserve remains a small, meaningful state (0..maxEnergy);
//   * +1E is worth the exposure of the next upgrade-investment slot, so value
//     naturally falls with race progress and with already-large reserves;
//   * unknown upgrade cards never become persistent route state.  Their 2/3
//     usefulness assumption is applied immediately when Battery/Chop Shop /
//     Upgrade World creates a card opportunity;
//   * the opening Upgrade Phase consumes one expected useful starting install
//     (default 2E from the normal 3E/3-card start).  Later Upgrade Phases are
//     deliberately *not* simulated turn-by-turn: reserve after that opening is
//     a scarcity/value index, not a prediction of a player's exact purchases.
//
// This preserves the decisions we care about -- an early Battery is worth more
// than a late one, 1E values Energy more than 9E, Power Up must repay its real
// WAIT tempo, and Chop Shop can prefer Energy or a card -- while removing the
// coupled card shadow from dominance/cache keys.  Energy Crisis / A Lighter
// Game still disables this economy entirely.

function getFlattenedRouteEnergyMarginalValueR(
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

function getFlattenedUnknownUpgradeCardValueR(
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

function getFlattenedOpeningEconomyState(options = {}) {
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

function getInitialRouteEconomyShadowState(options = {}) {
  return getFlattenedOpeningEconomyState(options);
}

function getInitialRouteEnergyShadowReserve(options = {}) {
  return getInitialRouteEconomyShadowState(options).energy;
}

// Compatibility API for existing summaries/route objects.  v18 deliberately
// has no persistent useful-card shadow; returning zero keeps older consumers
// harmless while ensuring this dimension cannot split search states.
function getInitialRouteUpgradeCardShadowUnits(_options = {}) {
  return 0;
}

function applyFlattenedRouteEnergyGain(
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

function getRouteEnergyShadowStep(
  tileMap,
  destination,
  actionId,
  nextAbsoluteActionCount,
  currentReserve,
  _currentUsefulCardUnits,
  options = {}
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
      batteryRewardScore: 0,
      powerUpRewardScore: 0,
      chopShopRewardScore: 0,
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
  const registerScore = Number(options.routeEnergyRegisterScore);

  let energy = reserveBefore;
  let batteryRewardR = 0;
  let powerUpRewardR = 0;
  let chopShopRewardR = 0;
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

  const batteryRewardScore = batteryRewardR * registerScore;
  const powerUpRewardScore = powerUpRewardR * registerScore;
  const chopShopRewardScore = chopShopRewardR * registerScore;
  const rewardScore = batteryRewardScore + powerUpRewardScore + chopShopRewardScore;

  return {
    rewardScore: Number(Math.max(0, rewardScore).toFixed(3)),
    batteryRewardScore: Number(Math.max(0, batteryRewardScore).toFixed(3)),
    powerUpRewardScore: Number(Math.max(0, powerUpRewardScore).toFixed(3)),
    chopShopRewardScore: Number(Math.max(0, chopShopRewardScore).toFixed(3)),
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


// v37 priced-start economy ---------------------------------------------------
//
// Route discovery keeps the deliberately flattened v18 Energy scorer. Starting
// prices need a different question: how much is a change in *starting* Energy
// actually worth when the player may or may not have enough useful upgrade cards
// and future draw/install throughput to spend it?  Price curves therefore replay
// the already-discovered route through this small card-aware expected-economy DP.
// It never changes route legality, Normal balance, Competitive balance, or search
// dominance; it is a downstream valuation layer used only by priced starts.
let FIXED_ROUTE_PRICING_ECONOMY_CACHE = new WeakMap();

function addFixedRoutePricingEconomyState(states, energy, cardUnits, utilityR, config) {
  const safeEnergy = clamp(Math.floor(Number(energy) || 0), 0, config.maxEnergy);
  const safeCards = Math.max(0, Math.round(Number(cardUnits) || 0));
  const key = `${safeEnergy}:${safeCards}`;
  const prior = states.get(key);
  if (!prior || utilityR > prior.utilityR + 1e-9) {
    states.set(key, { energy: safeEnergy, cardUnits: safeCards, utilityR });
  }
}

function applyFixedRoutePricingUpgradePhase(states, boundaryAction, fullHorizonActions, config) {
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
        config
      );
      continue;
    }
    for (const choice of choices) {
      addFixedRoutePricingEconomyState(
        next,
        choice.energyAfter,
        choice.cardUnitsAfter,
        state.utilityR + choice.immediateValueR,
        config
      );
    }
  }
  return next;
}

function applyFixedRoutePricingResourceGain(states, energyGain, cardGainUnits, config) {
  const next = new Map();
  for (const state of states.values()) {
    addFixedRoutePricingEconomyState(
      next,
      Math.min(config.maxEnergy, state.energy + Math.max(0, Math.floor(Number(energyGain) || 0))),
      state.cardUnits + Math.max(0, Math.round(Number(cardGainUnits) || 0)),
      state.utilityR,
      config
    );
  }
  return next;
}

function applyFixedRoutePricingTransitionEconomy(tileMap, states, transition, config, options = {}) {
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
      config
    );
    // Card option: one normal unknown card, plus Upgrade World's extra card.
    addFixedRoutePricingEconomyState(
      branched,
      state.energy,
      state.cardUnits + unknownCardUnits * (1 + (options.upgradeWorld ? 1 : 0)),
      state.utilityR,
      config
    );
  }
  return branched;
}

function getFixedRoutePricingEconomySignature(options = {}) {
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

function evaluateFixedRoutePricingEconomyUtilityR(tileMap, route, options = {}) {
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
    config
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

  const utilityR = Math.max(0, ...[...states.values()].map((state) => state.utilityR));
  const result = Number(utilityR.toFixed(6));
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

function getRouteAwareActionPenalty(action, options = {}) {
  const actionPenalty = getActionPenalty(action, options);
  if (action?.id !== "WAIT" || !isRouteAwareBatteryScoringActive(options)) {
    return actionPenalty;
  }

  // The old WAIT penalty was 0.25 score cheaper as a static Power Up proxy.
  // v45 keeps that proxy removed because Power Up is valued through the shared economy, while all physical
  // benefits of actually waiting (conveyors, gears, pushers, timing) remain in
  // the simulated transition itself.
  return actionPenalty + Math.max(0, REGISTER_TEMPO_COST - actionPenalty);
}

function getTilePenalty(tile, options = {}) {
  let penalty = 0;

  // Feature penalties are used to approximate local danger/value for route
  // scoring. This intentionally captures many board effects without turning the
  // analyzer into a full combat or timing simulator.
  for (const feature of tile?.features || []) {
    // v42 removes the old static Battery reward from per-tile movement scoring.
    // The route-aware reward is applied once, at the post-register landing
    // boundary, so traversing a Battery does not collect energy.
    if (
      (feature.type === "battery" || feature.type === "chopShop") &&
      isRouteAwareBatteryScoringActive(options)
    ) {
      continue;
    }
    // Randomizers affect the card played only when the robot STARTS a register
    // on the space. Traversing or merely ending the current movement on one
    // does not alter the current register.
    if (feature.type === "randomizer" && !options.randomizerAtRegisterStart) {
      continue;
    }
    if (
      feature.type === "radiation" ||
      feature.type === "radioactiveWaste" ||
      feature.type === "repairDock" ||
      (feature.type === "flamethrower" && hasKnownRegisterTiming(options)) ||
      (hasExplicitTiming(feature) && (
        feature.type === "push" ||
        feature.type === "crusher" ||
        feature.type === "trapdoor"
      ))
    ) {
      continue;
    }

    penalty += getTilePenaltyForFeature(feature, {
      batteryActive: isBatteryActive(options),
      rebootDamagePenalty: getRebootDamagePenalty(options),
      playerCount: options.playerCount,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown
    });
  }

  return penalty;
}

function isExposedToPitOrEdge(tileMap, point, dir, options = {}) {
  const next = {
    x: point.x + DIRS[dir].dx,
    y: point.y + DIRS[dir].dy
  };
  const toTile = tileMap.get(tileKey(next.x, next.y));
  if (isBoundaryBlockedByWalls(tileMap, point, next, dir)) {
    return false;
  }

  if (!toTile && options.lessDeadlyGame) {
    return false;
  }

  return !toTile || isPit(toTile);
}

function getPitPressurePenalty(tileMap, point, options = {}) {
  let penalty = 0;

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToPitOrEdge(tileMap, point, dir, options)) {
      continue;
    }

    penalty += 0.5;
  }

  return Number(penalty.toFixed(2));
}

function isExposedToLedge(tileMap, point, dir, options = {}) {
  const fromTile = tileMap.get(tileKey(point.x, point.y));
  const next = {
    x: point.x + DIRS[dir].dx,
    y: point.y + DIRS[dir].dy
  };
  const toTile = tileMap.get(tileKey(next.x, next.y));

  if (!fromTile || !toTile) {
    return false;
  }

  const move = canMoveBetween(tileMap, point, next, dir, options);
  return move.ok && (move.ledgeDamage || 0) > 0;
}

function getLedgePressurePenalty(tileMap, point, options = {}) {
  let penalty = 0;

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToLedge(tileMap, point, dir, options)) {
      continue;
    }

    penalty += 0.3;
  }

  return Number(penalty.toFixed(2));
}

function directionBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  for (const [dir, delta] of Object.entries(DIRS)) {
    if (delta.dx === dx && delta.dy === dy) {
      return dir;
    }
  }

  return null;
}

function canMoveBetween(tileMap, from, to, dir, options = {}) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const repulsorActive = options.repulsorActive ?? true;

  if (!fromTile) {
    return { ok: false, crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame, offBoard: true };
  }

  const toTile = tileMap.get(tileKey(to.x, to.y));
  const fromRepulsor = getRepulsor(fromTile, dir);
  const toRepulsor = getRepulsor(toTile, OPPOSITE[dir]);

  if (!toTile) {
    return {
      ok: false,
      crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame,
      offBoard: true
    };
  }

  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);

  if (repulsorActive && (fromRepulsor || toRepulsor)) {
    return {
      ok: false,
      crash: false,
      offBoard: false,
      repulsor: true
    };
  }

  if (isBoundaryBlockedByWalls(tileMap, from, to, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  if (fromLedges.has(dir) && !hasRampForDir(fromTile, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  // A paired portal is a discontinuous relocation. Once the robot can enter the
  // portal square, terrain/features on that square are skipped by the portal
  // transit; only the actual exit square is resolved afterward.
  const portalDestination = resolvePortalDestination(
    tileMap,
    to,
    options.portalMap ?? new Map()
  );
  if (!portalDestination && (isPit(toTile) || hasActiveFeature(toTile, "trapdoor", options))) {
    return { ok: false, crash: true, offBoard: false };
  }

  return {
    ok: true,
    crash: false,
    offBoard: false,
    ledgeDamage: toLedges.has(OPPOSITE[dir]) && !hasRampForDir(toTile, OPPOSITE[dir])
      ? (isWater(toTile) ? 1 : 2)
      : 0,
    rampAscent: fromLedges.has(dir) && hasRampForDir(fromTile, dir)
  };
}

function resolvePortalDestination(tileMap, point, portalMap) {
  const tile = tileMap.get(tileKey(point.x, point.y));
  const portal = getPortal(tile);
  if (!portal?.id) {
    return null;
  }

  const siblings = portalMap.get(portal.id) || [];
  const destination = siblings.find((candidate) => (
    candidate.x !== point.x || candidate.y !== point.y
  ));

  return destination ?? null;
}

function slideOnOil(tileMap, state, dir, options = {}) {
  const traversed = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  const workingState = cloneState(state);

  while (isOil(tileMap.get(tileKey(workingState.x, workingState.y)))) {
    const step = moveOneStep(tileMap, workingState, dir, "oil", options);
    traversed.push(...step.traversed);
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        blocked: step.blocked,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;

    if (!isOil(tileMap.get(tileKey(workingState.x, workingState.y)))) {
      break;
    }
  }

  return {
    state: workingState,
    traversed,
    conveyorSteps: [],
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    blocked: false,
    rebooted: false
  };
}

function mergeStepOutcome(base, extra) {
  return {
    state: extra.state,
    rebootChoices: extra.rebootChoices ?? base.rebootChoices,
    blocked: extra.blocked,
    crashed: extra.crashed,
    rebooted: extra.rebooted,
    traversed: [...base.traversed, ...extra.traversed],
    conveyorSteps: [...(base.conveyorSteps || []), ...(extra.conveyorSteps || [])],
    hazard: base.hazard + extra.hazard,
    rebootPenalty: (base.rebootPenalty || 0) + (extra.rebootPenalty || 0),
    distance: base.distance + extra.distance,
    forcedDistance: base.forcedDistance + extra.forcedDistance
  };
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function rotateFacing(facing, rotation) {
  const index = ROTATION_ORDER.indexOf(facing ?? "E");
  if (index === -1) return facing ?? "E";
  if (rotation === "cw") {
    return ROTATION_ORDER[(index + 1) % ROTATION_ORDER.length];
  }
  if (rotation === "ccw") {
    return ROTATION_ORDER[(index + ROTATION_ORDER.length - 1) % ROTATION_ORDER.length];
  }
  if (rotation === "uturn") {
    return ROTATION_ORDER[(index + 2) % ROTATION_ORDER.length];
  }
  return facing ?? "E";
}

function movementDir(facing, relative) {
  if (relative === "forward") {
    return facing ?? "E";
  }

  if (relative === "back") {
    return rotateFacing(facing ?? "E", "uturn");
  }

  return facing ?? "E";
}

function getBeltTurnRotation(belt, entrySide) {
  if (!belt?.dir || !entrySide) {
    return null;
  }

  const leftEntry = rotateFacing(belt.dir, "ccw");
  const rightEntry = rotateFacing(belt.dir, "cw");

  if ((belt.turn === "left" || belt.turn === "both") && entrySide === leftEntry) {
    return "ccw";
  }

  if ((belt.turn === "right" || belt.turn === "both") && entrySide === rightEntry) {
    return "cw";
  }

  return null;
}

function applyEndOfStepRotation(tileMap, state) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const gear = getGear(tile);

  if (!gear) {
    return cloneState(state);
  }

  return {
    ...cloneState(state),
    facing: rotateFacing(state.facing, gear.rotation)
  };
}

function moveOneStep(tileMap, state, dir, mode, options = {}, moveBudget = null, cardMoveDistance = null) {
  const delta = DIRS[dir];
  const next = {
    x: state.x + delta.dx,
    y: state.y + delta.dy
  };
  const moveCheck = canMoveBetween(tileMap, state, next, dir, {
    ...options,
    // 30th Anniversary rule: repulsors react to Move cards, not board-forced
    // movement such as pushers, conveyors, currents, oil slides, or collisions.
    repulsorActive: mode === "manual"
  });

  if (mode === "manual" && moveCheck.ok && moveCheck.rampAscent && moveBudget !== null && moveBudget < 2) {
    return {
      state: cloneState(state),
      blocked: false,
      crashed: false,
      rebooted: false,
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      spentMove: true,
      rampAscent: true
    };
  }

  if (!moveCheck.ok) {
    if (moveCheck.repulsor) {
      const reverseDir = OPPOSITE[dir];
      const workingState = cloneState(state);
      const traversed = [];
      let hazard = 0;
      let rebootPenalty = 0;
      let distance = 0;
      let forcedDistance = 0;
      // Repulsion uses the full printed/effective distance of the triggering
      // Move card, irrespective of how much of that card's movement was already
      // spent before the repulsor was hit. The repulsion then ends that card.
      const repulsorPushDistance = Math.max(1, Number(cardMoveDistance) || 1);
      const repulsorPushDistanceScaled = options.repulsorOverdrive
        ? repulsorPushDistance * 2
        : repulsorPushDistance;

      for (let index = 0; index < repulsorPushDistanceScaled; index += 1) {
        const bounce = moveOneStep(tileMap, workingState, reverseDir, "repulsor", options);
        traversed.push(...bounce.traversed);
        hazard += bounce.hazard;
        rebootPenalty += bounce.rebootPenalty || 0;
        distance += bounce.distance;
        forcedDistance += bounce.forcedDistance;

        if (bounce.crashed || bounce.blocked || bounce.rebooted) {
          return {
            state: bounce.state,
            rebootChoices: bounce.rebootChoices ?? null,
            blocked: bounce.blocked,
            crashed: bounce.crashed,
            rebooted: bounce.rebooted,
            traversed,
            conveyorSteps: [],
            hazard,
            rebootPenalty,
            distance,
            forcedDistance,
            spentMove: true,
            repulsed: true,
            rampAscent: false
          };
        }

        workingState.x = bounce.state.x;
        workingState.y = bounce.state.y;
        workingState.facing = bounce.state.facing;
      }

      const repulsorOutcome = {
        state: workingState,
        blocked: false,
        crashed: false,
        rebooted: false,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        spentMove: true,
        repulsed: true,
        rampAscent: false
      };
      return distance > 0 && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
        ? { ...mergeStepOutcome(repulsorOutcome, slideOnOil(tileMap, workingState, reverseDir, options)), repulsed: true }
        : repulsorOutcome;
    }

    const rebootToken = moveCheck.crash && options.recoveryRule === "reboot_tokens"
      ? getRebootTokenForPoint(
        moveCheck.offBoard ? { x: state.x, y: state.y } : { x: next.x, y: next.y },
        options.boardRects,
        options.rebootTokens
      )
      : null;

    if (rebootToken) {
      return {
        state: {
          x: rebootToken.x,
          y: rebootToken.y,
          facing: state.facing
        },
        rebootChoices: ROTATION_ORDER.map((facing) => ({
          x: rebootToken.x,
          y: rebootToken.y,
          facing
        })),
        blocked: false,
        crashed: false,
        rebooted: true,
        traversed: [{ x: next.x, y: next.y }],
        conveyorSteps: [],
        hazard: getRebootDamagePenalty(options),
        rebootPenalty: getRebootRoutePenalty(),
        distance: 1,
        forcedDistance: mode === "belt" || mode === "push" || mode === "repulsor" ? 1 : 0,
        spentMove: true,
        rampAscent: false
      };
    }

    return {
      state: cloneState(state),
      blocked: !moveCheck.crash,
      crashed: moveCheck.crash,
      rebooted: false,
      traversed: moveCheck.crash ? [{ x: next.x, y: next.y }] : [],
      conveyorSteps: [],
      hazard: moveCheck.crash ? 25 : 0,
      rebootPenalty: 0,
      distance: moveCheck.crash ? 1 : 0,
      forcedDistance: (mode === "belt" || mode === "push" || mode === "repulsor") && moveCheck.crash ? 1 : 0,
      spentMove: true,
      rampAscent: false
    };
  }

  const nextTile = tileMap.get(tileKey(next.x, next.y));
  const belt = getBelt(nextTile);
  const portalMap = options.portalMap ?? new Map();
  let nextFacing = state.facing;
  let turned = false;

  if (mode === "belt" && belt) {
    const entrySide = OPPOSITE[dir];
    const beltTurnRotation = getBeltTurnRotation(belt, entrySide);
    nextFacing = beltTurnRotation ? rotateFacing(state.facing, beltTurnRotation) : state.facing;
    turned = Boolean(beltTurnRotation);
  }

  const resolvedState = {
    x: next.x,
    y: next.y,
    facing: nextFacing ?? state.facing
  };
  const portalDestination = resolvePortalDestination(tileMap, resolvedState, portalMap);

  if (portalDestination) {
    resolvedState.x = portalDestination.x;
    resolvedState.y = portalDestination.y;
  }

  const traversed = [{ x: next.x, y: next.y }];
  if (portalDestination) {
    traversed.push({ x: portalDestination.x, y: portalDestination.y, jump: true });
    const portalDestinationTile = tileMap.get(tileKey(portalDestination.x, portalDestination.y));
    if (isPit(portalDestinationTile) || hasActiveFeature(portalDestinationTile, "trapdoor", options)) {
      return resolveCrashOrReboot(tileMap, state, resolvedState, traversed, options, 1, mode);
    }
  }

  const portalDestinationTile = portalDestination
    ? tileMap.get(tileKey(portalDestination.x, portalDestination.y))
    : null;
  const outcome = {
    state: resolvedState,
    blocked: false,
    crashed: false,
    rebooted: false,
    traversed,
    conveyorSteps: mode === "belt" ? [{
      from: { x: state.x, y: state.y },
      to: { x: next.x, y: next.y },
      dir,
      speed: belt?.speed ?? 1,
      turned,
      facingBefore: state.facing,
      facingAfter: resolvedState.facing
    }] : [],
    hazard: (portalDestination
      ? 0
      : getTilePenalty(nextTile, options) +
        getActiveFlamethrowerEntryPenalty(nextTile, options) +
        getTimedTraversalFragilityPenalty(nextTile, options)) +
      (portalDestinationTile
        ? getTilePenalty(portalDestinationTile, options) +
          getActiveFlamethrowerEntryPenalty(portalDestinationTile, options) +
          getTimedTraversalFragilityPenalty(portalDestinationTile, options)
        : 0) +
      (hasHomingMissile(nextTile)
        ? (tileMap.get(tileKey(state.x, state.y))?.x !== nextTile?.x || tileMap.get(tileKey(state.x, state.y))?.y !== nextTile?.y
          ? getTilePenaltyForFeature({ type: "homingMissile" }, { onEntrance: true, playerCount: options.playerCount })
          : 0)
        : 0) +
      getPitPressurePenalty(tileMap, resolvedState, options) +
      getLedgePressurePenalty(tileMap, resolvedState, options) +
      (moveCheck.ledgeDamage || 0),
    rebootPenalty: 0,
    distance: 1,
    forcedDistance: mode === "belt" || mode === "oil" || mode === "push" || mode === "repulsor" ? 1 : 0,
    spentMove: true,
    rampAscent: Boolean(moveCheck.rampAscent)
  };

  return outcome;
}

function getSignedMoveDistance(action) {
  if (action.type !== "move") {
    return 0;
  }

  const steps = Math.max(1, action.steps ?? 1);
  return action.relative === "back" ? -steps : steps;
}

function resolveCrashOrReboot(tileMap, state, destination, traversed, options = {}, distance = 0, mode = "manual") {
  const rebootToken = options.recoveryRule === "reboot_tokens"
    ? getRebootTokenForPoint(
      tileMap.get(tileKey(destination.x, destination.y))
        ? destination
        : { x: state.x, y: state.y },
      options.boardRects,
      options.rebootTokens
    )
    : null;
  const homeRebootChoices = options.recoveryRule === "home_reboot"
    ? getHomeRebootChoices(options.rebootTokens)
    : null;

  if (rebootToken || homeRebootChoices?.length) {
    const rebootDestination = rebootToken
      ? { x: rebootToken.x, y: rebootToken.y }
      : homeRebootChoices[0];
    return {
      state: {
        x: rebootDestination.x,
        y: rebootDestination.y,
        facing: state.facing
      },
      rebootChoices: rebootToken
        ? ROTATION_ORDER.map((facing) => ({
          x: rebootToken.x,
          y: rebootToken.y,
          facing
        }))
        : homeRebootChoices,
      blocked: false,
      crashed: false,
      rebooted: true,
      traversed,
      conveyorSteps: [],
      hazard: getRebootDamagePenalty(options),
      rebootPenalty: getRebootRoutePenalty(),
      distance,
      forcedDistance: mode === "belt" || mode === "push" ? distance : 0,
      spentMove: true,
      rampAscent: false
    };
  }

  return {
    state: cloneState(state),
    blocked: false,
    crashed: true,
    rebooted: false,
    traversed,
    conveyorSteps: [],
    hazard: 25,
    rebootPenalty: 0,
    distance,
    forcedDistance: (mode === "belt" || mode === "push") ? distance : 0,
    spentMove: true,
    rampAscent: false
  };
}

function resolveTeleporterMove(tileMap, state, action, options = {}) {
  const teleporter = getTeleporter(tileMap.get(tileKey(state.x, state.y)));
  if (!teleporter || action.type !== "move") {
    return null;
  }

  const signedDistance = getSignedMoveDistance(action) + (teleporter.power ?? 2);
  if (signedDistance === 0) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      blocked: false,
      rebooted: false
    };
  }

  const dir = signedDistance > 0
    ? movementDir(state.facing, "forward")
    : movementDir(state.facing, "back");
  const steps = Math.abs(signedDistance);
  // Teleporter movement is a jump: no walls, pits, trapdoors, flamers, or other
  // board elements on the skipped squares are traversed or resolved.
  const destination = {
    x: state.x + DIRS[dir].dx * steps,
    y: state.y + DIRS[dir].dy * steps
  };
  const traversed = [{ x: destination.x, y: destination.y, jump: true }];
  const destinationTile = tileMap.get(tileKey(destination.x, destination.y));

  if (!destinationTile || isPit(destinationTile) || hasActiveFeature(destinationTile, "trapdoor", options)) {
    return resolveCrashOrReboot(tileMap, state, destination, traversed, options, steps);
  }

  const resolvedState = {
    x: destination.x,
    y: destination.y,
    facing: state.facing
  };
  const outcome = {
    state: resolvedState,
    blocked: false,
    crashed: false,
    rebooted: false,
    traversed,
    conveyorSteps: [],
    hazard: getTilePenalty(destinationTile, options) +
      getActiveFlamethrowerEntryPenalty(destinationTile, options) +
      getTimedTraversalFragilityPenalty(destinationTile, options) +
      getPitPressurePenalty(tileMap, resolvedState, options) +
      getLedgePressurePenalty(tileMap, resolvedState, options),
    rebootPenalty: 0,
    distance: steps,
    forcedDistance: 0,
    spentMove: true,
    rampAscent: false
  };

  if (isOil(destinationTile)) {
    return mergeStepOutcome(outcome, slideOnOil(tileMap, resolvedState, dir, options));
  }

  return outcome;
}

function resolveConveyorPhase(tileMap, state, eligibleSpeed, options = {}) {
  const workingState = cloneState(state);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  const currentOnly = Boolean(options.currentOnly);
  const maxSteps = currentOnly ? 1 : eligibleSpeed === 2 ? 2 : 1;
  const conveyorPhase = options.conveyorPhase ?? (
    currentOnly ? "current" : eligibleSpeed === 2 ? "blue" : "green"
  );
  let stepsTaken = 0;
  let lastMoveDir = null;

  while (stepsTaken < maxSteps) {
    const tile = tileMap.get(tileKey(workingState.x, workingState.y));
    const belt = getBelt(tile);

    if (!belt) {
      break;
    }
    // Water and radioactive-waste conveyor spaces are currents. Currents do not
    // participate in either conveyor phase; they get exactly one later current move.
    if (currentOnly) {
      if (!isCurrent(tile)) break;
    } else {
      if (belt.speed !== eligibleSpeed || isCurrent(tile)) break;
    }

    const step = moveOneStep(tileMap, workingState, belt.dir, "belt", options);
    lastMoveDir = belt.dir;
    traversed.push(...step.traversed);
    conveyorSteps.push(...(step.conveyorSteps || []).map((entry) => ({
      ...entry,
      speed: belt.speed,
      phase: conveyorPhase,
      phaseStep: stepsTaken + 1
    })));
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;
    stepsTaken += 1;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps,
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;
  }

  const conveyorOutcome = {
    state: workingState,
    traversed,
    conveyorSteps,
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    rebooted: false
  };
  return stepsTaken > 0 && lastMoveDir && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
    ? mergeStepOutcome(conveyorOutcome, slideOnOil(tileMap, workingState, lastMoveDir, options))
    : conveyorOutcome;
}

function resolvePushPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const pushes = getPushes(tile).filter((push) => isFeatureActiveThisRegister(push, options));

  if (!pushes.length) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: false
    };
  }

  const workingState = cloneState(state);
  const traversed = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;

  for (const push of pushes) {
    let step = moveOneStep(tileMap, workingState, push.dir, "push", options);
    if (!step.crashed && !step.blocked && !step.rebooted && step.distance > 0 && !step.repulsed && isOil(tileMap.get(tileKey(step.state.x, step.state.y)))) {
      step = mergeStepOutcome(step, slideOnOil(tileMap, step.state, push.dir, options));
    }
    traversed.push(...step.traversed);
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;
  }

  return {
    state: workingState,
    traversed,
    conveyorSteps: [],
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    rebooted: false
  };
}

function resolveCrusherPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));

  if (!hasActiveFeature(tile, "crusher", options)) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: false
    };
  }

  const rebootToken = options.recoveryRule === "reboot_tokens"
    ? getRebootTokenForPoint(state, options.boardRects, options.rebootTokens)
    : null;

  if (rebootToken) {
    return {
      state: {
        x: rebootToken.x,
        y: rebootToken.y,
        facing: state.facing
      },
      rebootChoices: ROTATION_ORDER.map((facing) => ({
        x: rebootToken.x,
        y: rebootToken.y,
        facing
      })),
      traversed: [{ x: state.x, y: state.y }],
      conveyorSteps: [],
      hazard: getRebootDamagePenalty(options),
      rebootPenalty: getRebootRoutePenalty(),
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: true
    };
  }

  return {
    state: cloneState(state),
    traversed: [{ x: state.x, y: state.y }],
    conveyorSteps: [],
    hazard: 25,
    rebootPenalty: 0,
    distance: 0,
    forcedDistance: 0,
    crashed: true,
    rebooted: false
  };
}

function hasFeatureType(tile, type) {
  return (tile?.features || []).some((feature) => feature.type === type);
}

function getTimedHazardSeverity(feature) {
  if (!feature?.type) return 0;
  if (feature.type === "flamethrower") return 5.2;
  if (feature.type === "push") return 3.2;
  if (feature.type === "crusher") return 9.5;
  if (feature.type === "trapdoor") return 9.5;
  if (feature.type === "radiation") return 4.5;
  return 0;
}

function getFlamethrowerDamagePenalty(options = {}) {
  // A flamer hit is one damage, comparable to a one-damage board laser.
  // Flamers become more dangerous because the same register can inflict one
  // hit on entry/pass-through and another at the end of the register.
  const damagePressure = getDamageDeckPressureMultipliers(options);
  return Number((4 * damagePressure.hazard).toFixed(2));
}

function getActiveFlamethrowerEntryPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  const activeCount = (tile?.features || []).filter((feature) => (
    feature.type === "flamethrower" && isFeatureActiveThisRegister(feature, options)
  )).length;
  return Number((activeCount * getFlamethrowerDamagePenalty(options)).toFixed(2));
}

function getTimedFeatureFragilityPenalty(feature, scale = 0.16) {
  if (!hasExplicitTiming(feature)) return 0;
  const severity = getTimedHazardSeverity(feature);
  if (severity <= 0) return 0;
  return severity * getFeatureDutyCycle(feature) * scale;
}

function getTimedTraversalFragilityPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  let penalty = 0;
  for (const feature of tile?.features || []) {
    penalty += getTimedFeatureFragilityPenalty(feature, 0.12);
  }
  return Number(penalty.toFixed(2));
}

function getTimedOccupancyFragilityPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  let penalty = 0;
  for (const feature of tile?.features || []) {
    penalty += getTimedFeatureFragilityPenalty(feature, 0.18);
  }
  return Number(penalty.toFixed(2));
}

function getTimedHazardClusterPenalty(tileMap, state) {
  const entries = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      const tile = tileMap.get(tileKey(state.x + dx, state.y + dy));
      for (const feature of tile?.features || []) {
        if (!hasExplicitTiming(feature)) continue;
        const severity = getTimedHazardSeverity(feature);
        if (severity <= 0) continue;
        entries.push({
          feature,
          severity,
          proximity: dx === 0 && dy === 0 ? 1 : 0.55,
          registers: new Set(feature.timing)
        });
      }
    }
  }

  let penalty = 0;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const shared = [...entries[i].registers].filter((register) => entries[j].registers.has(register)).length;
      if (!shared) continue;
      const correlation = shared / REGISTER_COUNT;
      penalty += (
        Math.min(entries[i].severity, entries[j].severity) *
        correlation *
        entries[i].proximity *
        entries[j].proximity *
        0.32
      );
    }
  }
  return Number(penalty.toFixed(2));
}

function getExpectedTimedPushPenalty(tileMap, state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0 || !feature.dir) return 0;

  const hypothetical = moveOneStep(tileMap, state, feature.dir, "push", options);
  if (hypothetical.crashed || hypothetical.rebooted) {
    return Number((7.5 * duty).toFixed(2));
  }
  if (hypothetical.blocked || hypothetical.distance <= 0) {
    return Number((1.2 * duty).toFixed(2));
  }

  const goal = options.goal;
  if (!goal) return Number((1.6 * duty).toFixed(2));

  const before = heuristic(state, goal);
  const after = heuristic(hypothetical.state, goal);
  const delta = before - after;
  if (delta > 0) {
    // Deliberately exploiting a timed pusher is much less reliable than merely
    // being exposed to it, especially for 1/5 timing.
    const exploitReliability = 0.34 + duty * 0.28;
    return Number((-Math.min(3.4, delta * 1.15) * duty * exploitReliability).toFixed(2));
  }
  return Number((Math.min(3.6, Math.abs(delta) * 1.15 + 1.1) * duty).toFixed(2));
}

function getExpectedTimedCrusherPenalty(state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0) return 0;

  const harm = 9.5 * duty;
  const goal = options.goal;
  if (!goal || options.recoveryRule !== "reboot_tokens") {
    return Number(harm.toFixed(2));
  }

  const rebootToken = getRebootTokenForPoint(state, options.boardRects, options.rebootTokens);
  if (!rebootToken) return Number(harm.toFixed(2));

  const shortcut = heuristic(state, goal) - heuristic(rebootToken, goal);
  if (shortcut <= 0) return Number(harm.toFixed(2));

  const exploitReliability = 0.2 + duty * 0.25;
  const exploitCredit = Math.min(6.5, shortcut * 0.9) * duty * exploitReliability;
  return Number((harm - exploitCredit).toFixed(2));
}

function getExpectedTimedTrapdoorPenalty(state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0) return 0;

  const harm = 10.5 * duty;
  const goal = options.goal;
  if (!goal || options.recoveryRule !== "reboot_tokens") {
    return Number(harm.toFixed(2));
  }

  const rebootToken = getRebootTokenForPoint(state, options.boardRects, options.rebootTokens);
  if (!rebootToken) return Number(harm.toFixed(2));
  const shortcut = heuristic(state, goal) - heuristic(rebootToken, goal);
  if (shortcut <= 0) return Number(harm.toFixed(2));

  // A timed pit is even harder to exploit precisely than a timed pusher.
  const exploitReliability = 0.16 + duty * 0.22;
  const exploitCredit = Math.min(6, shortcut * 0.8) * duty * exploitReliability;
  return Number((harm - exploitCredit).toFixed(2));
}

function getEndOfRegisterFeaturePenalty(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  if (!tile) return 0;

  let penalty = 0;

  // Radioactive Waste is effectively 5/5: every register spent here hurts,
  // partly offset by the energy/free-upgrade choice.
  if (hasFeatureType(tile, "radioactiveWaste")) {
    penalty += 2.4;
  }

  // Radiation is an end-of-turn effect, but the nominal route register is
  // not trusted. Score its expected 1/5 exposure instead.
  if (hasFeatureType(tile, "radiation")) {
    penalty += 4.5 / REGISTER_COUNT;
  }

  // Repair Stations are an optional rule on ordinary checkpoints, not a
  // standalone board feature. Flag 0 is excluded from the playable checkpoint map.
  if (options.repairStations) {
    const checkpoint = (tile.features || []).find((feature) => feature.type === "checkpoint");
    if (checkpoint && Number(checkpoint.id ?? 1) !== 0) {
      penalty -= (3.4 / REGISTER_COUNT) * 0.82;
    }
  }

  if (hasKnownRegisterTiming(options)) {
    for (const feature of tile.features || []) {
      if (feature.type === "flamethrower" && isFeatureActiveThisRegister(feature, options)) {
        penalty += getFlamethrowerDamagePenalty(options);
      }
    }
    // Exact register physics does not remove real-play fragility: a route that
    // depends on threading timed machinery is still harder to execute with an
    // uncertain hand or after robot interference. Keep that as a smaller,
    // non-physical residual instead of the old expected activation effect.
    penalty += getTimedOccupancyFragilityPenalty(tile, options);
  } else {
    // Phase-less/static analysis keeps the old duty-cycle approximation.
    for (const feature of tile.features || []) {
      if (!hasExplicitTiming(feature)) continue;
      if (feature.type === "push") {
        penalty += getExpectedTimedPushPenalty(tileMap, state, feature, options);
      } else if (feature.type === "crusher") {
        penalty += getExpectedTimedCrusherPenalty(state, feature, options);
      } else if (feature.type === "trapdoor") {
        penalty += getExpectedTimedTrapdoorPenalty(state, feature, options);
      }
    }
  }

  penalty += getTimedHazardClusterPenalty(tileMap, state);
  return Number(penalty.toFixed(2));
}

export function simulateAction(tileMap, startState, action, options = {}) {
  const state = cloneState(startState);
  const traversed = [];
  const conveyorSteps = [];
  const boardEvents = [];

  // Trapdoors are open for the entire listed register. A robot beginning that
  // register on an open trapdoor drops before its programmed card can move it.
  if (hasActiveFeature(tileMap.get(tileKey(state.x, state.y)), "trapdoor", options)) {
    const dropped = resolveCrashOrReboot(
      tileMap,
      state,
      state,
      [{ x: state.x, y: state.y }],
      options,
      0,
      "trapdoor"
    );
    return {
      action: action.id,
      from: cloneState(startState),
      to: dropped.state,
      rebootChoices: dropped.rebootChoices ?? null,
      traversed: dropped.traversed,
      conveyorSteps: [],
      boardEvents: [{ type: "trapdoor", at: { x: state.x, y: state.y } }],
      gearTurned: false,
      hazard: dropped.hazard,
      rebootPenalty: dropped.rebootPenalty || 0,
      distance: 0,
      forcedDistance: 0,
      crashed: dropped.crashed,
      blocked: false,
      rebooted: dropped.rebooted
    };
  }

  let hazard = getTilePenalty(tileMap.get(tileKey(state.x, state.y)), {
    ...options,
    randomizerAtRegisterStart: true
  });
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  let crashed = false;
  let blocked = false;
  let rebooted = false;
  let rebootChoices = null;

  if (action.type === "turn") {
    state.facing = rotateFacing(state.facing, action.rotation);
  } else if (action.type === "move") {
    const teleported = resolveTeleporterMove(tileMap, state, action, options);
    if (teleported) {
      traversed.push(...teleported.traversed);
      hazard += teleported.hazard;
      rebootPenalty += teleported.rebootPenalty || 0;
      distance += teleported.distance;
      forcedDistance += teleported.forcedDistance || 0;

      if (teleported.crashed || teleported.blocked || teleported.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: teleported.state,
          rebootChoices: teleported.rebootChoices ?? null,
          traversed,
          conveyorSteps,
          hazard,
          rebootPenalty,
          distance,
          forcedDistance,
          crashed: teleported.crashed,
          blocked: teleported.blocked,
          rebooted: teleported.rebooted
        };
      }

      state.x = teleported.state.x;
      state.y = teleported.state.y;
      state.facing = teleported.state.facing;
    } else {
    const startTile = tileMap.get(tileKey(state.x, state.y));
    const onOil = isOil(startTile);
    const onWater = isWater(startTile);
    const cardMoveDistance = Math.max(1, action.steps ?? 1);
    let remainingSteps = Math.max(0, cardMoveDistance - (
      (onOil ? 1 : 0) +
      (action.relative === "forward" && onWater ? 1 : 0)
    ));
    const manualMoveDir = movementDir(state.facing, action.relative);
    const manualDistanceBefore = distance;

    while (remainingSteps > 0) {
      const step = moveOneStep(tileMap, state, movementDir(state.facing, action.relative), "manual", options, remainingSteps, cardMoveDistance);
      traversed.push(...step.traversed);
      hazard += step.hazard;
      rebootPenalty += step.rebootPenalty || 0;
      distance += step.distance;
      forcedDistance += step.forcedDistance || 0;

      if (step.crashed || step.blocked || step.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: step.state,
          rebootChoices: step.rebootChoices ?? null,
          traversed,
          conveyorSteps,
          hazard,
          rebootPenalty,
          distance,
          forcedDistance,
          crashed: step.crashed,
          blocked: step.blocked,
          rebooted: step.rebooted
        };
      }

      state.x = step.state.x;
      state.y = step.state.y;
      state.facing = step.state.facing;
      if (step.repulsed) {
        break;
      }
      remainingSteps -= 1 + (step.rampAscent ? 1 : 0);
    }

    if (distance > manualDistanceBefore && isOil(tileMap.get(tileKey(state.x, state.y)))) {
      const oilStart = cloneState(state);
      const oilSlide = slideOnOil(tileMap, state, manualMoveDir, options);
      traversed.push(...oilSlide.traversed);
      hazard += oilSlide.hazard;
      rebootPenalty += oilSlide.rebootPenalty || 0;
      distance += oilSlide.distance;
      forcedDistance += oilSlide.forcedDistance || 0;
      state.x = oilSlide.state.x;
      state.y = oilSlide.state.y;
      state.facing = oilSlide.state.facing;
      if (oilSlide.distance > 0) {
        boardEvents.push({
          type: "oil",
          from: oilStart,
          to: cloneState(oilSlide.state),
          dir: manualMoveDir,
          distance: oilSlide.distance
        });
      }
      if (oilSlide.crashed || oilSlide.blocked || oilSlide.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: oilSlide.state,
          rebootChoices: oilSlide.rebootChoices ?? null,
          traversed, conveyorSteps, hazard, rebootPenalty, distance, forcedDistance,
          crashed: oilSlide.crashed, blocked: oilSlide.blocked, rebooted: oilSlide.rebooted
        };
      }
    }
    }
  }

  const blue = resolveConveyorPhase(tileMap, state, 2, { ...options, conveyorPhase: "blue" });
  traversed.push(...blue.traversed);
  conveyorSteps.push(...blue.conveyorSteps);
  boardEvents.push(...(blue.conveyorSteps || []).map((step) => ({
    type: "conveyor",
    ...step
  })));
  hazard += blue.hazard;
  rebootPenalty += blue.rebootPenalty || 0;
  distance += blue.distance;
  forcedDistance += blue.forcedDistance;
  crashed = blue.crashed;
  rebooted = blue.rebooted;
  rebootChoices = blue.rebootChoices ?? rebootChoices;
  state.x = blue.state.x;
  state.y = blue.state.y;
  state.facing = blue.state.facing;

  if (!crashed && !rebooted) {
    const green = resolveConveyorPhase(tileMap, state, 1, { ...options, conveyorPhase: "green" });
    traversed.push(...green.traversed);
    conveyorSteps.push(...green.conveyorSteps);
    boardEvents.push(...(green.conveyorSteps || []).map((step) => ({
      type: "conveyor",
      ...step
    })));
    hazard += green.hazard;
    rebootPenalty += green.rebootPenalty || 0;
    distance += green.distance;
    forcedDistance += green.forcedDistance;
    crashed = green.crashed;
    rebooted = green.rebooted;
    rebootChoices = green.rebootChoices ?? rebootChoices;
    state.x = green.state.x;
    state.y = green.state.y;
    state.facing = green.state.facing;
  }

  if (!crashed && !rebooted) {
    const current = resolveConveyorPhase(tileMap, state, null, {
      ...options,
      currentOnly: true,
      conveyorPhase: "current"
    });
    traversed.push(...current.traversed);
    conveyorSteps.push(...current.conveyorSteps);
    boardEvents.push(...(current.conveyorSteps || []).map((step) => ({
      type: "conveyor",
      ...step
    })));
    hazard += current.hazard;
    rebootPenalty += current.rebootPenalty || 0;
    distance += current.distance;
    forcedDistance += current.forcedDistance;
    crashed = current.crashed;
    rebooted = current.rebooted;
    rebootChoices = current.rebootChoices ?? rebootChoices;
    state.x = current.state.x;
    state.y = current.state.y;
    state.facing = current.state.facing;
  }

  if (!crashed && !rebooted) {
    const pushStart = cloneState(state);
    const pushed = resolvePushPhase(tileMap, state, options);
    traversed.push(...pushed.traversed);
    hazard += pushed.hazard;
    rebootPenalty += pushed.rebootPenalty || 0;
    distance += pushed.distance;
    forcedDistance += pushed.forcedDistance;
    crashed = pushed.crashed;
    rebooted = pushed.rebooted;
    rebootChoices = pushed.rebootChoices ?? rebootChoices;
    state.x = pushed.state.x;
    state.y = pushed.state.y;
    state.facing = pushed.state.facing;
    if (pushed.distance > 0) {
      boardEvents.push({
        type: "pusher",
        from: pushStart,
        to: cloneState(pushed.state),
        distance: pushed.distance
      });
    }
  }

  let gearTurned = false;
  if (!crashed && !rebooted) {
    const facingBeforeGear = state.facing;
    const rotated = applyEndOfStepRotation(tileMap, state);
    gearTurned = rotated.facing !== facingBeforeGear;
    state.x = rotated.x;
    state.y = rotated.y;
    state.facing = rotated.facing;
    if (gearTurned) {
      boardEvents.push({
        type: "gear",
        at: { x: state.x, y: state.y },
        facingBefore: facingBeforeGear,
        facingAfter: state.facing
      });
    }
  }

  if (!crashed && !rebooted) {
    const crushed = resolveCrusherPhase(tileMap, state, options);
    traversed.push(...crushed.traversed);
    hazard += crushed.hazard;
    rebootPenalty += crushed.rebootPenalty || 0;
    distance += crushed.distance;
    forcedDistance += crushed.forcedDistance;
    crashed = crushed.crashed;
    rebooted = crushed.rebooted;
    rebootChoices = crushed.rebootChoices ?? rebootChoices;
    state.x = crushed.state.x;
    state.y = crushed.state.y;
    state.facing = crushed.state.facing;
  }

  if (!crashed && !rebooted) {
    hazard += getEndOfRegisterFeaturePenalty(tileMap, state, options);
  }

  return {
    action: action.id,
    from: cloneState(startState),
    to: state,
    rebootChoices,
    traversed,
    conveyorSteps,
    boardEvents,
    gearTurned,
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed,
    blocked,
    rebooted
  };
}

function buildTimeline(transitions, start) {
  const timeline = [{ x: start.x, y: start.y }];

  for (const transition of transitions) {
    for (const point of transition.traversed) {
      timeline.push({ x: point.x, y: point.y });
    }

    if (transition.rebooted) {
      timeline.push({ x: transition.to.x, y: transition.to.y, jump: true });
    } else if (transition.traversed.length === 0) {
      timeline.push({ x: transition.to.x, y: transition.to.y });
    }
  }

  return timeline;
}

function getActionPenalty(action, options = {}) {
  if (action.id === "WAIT") return options.lighterGame ? REGISTER_TEMPO_COST + 1.5 : REGISTER_TEMPO_COST - 0.25;
  if (action.id === "FORWARD") return REGISTER_TEMPO_COST;
  if (action.id === "FORWARD_2") return REGISTER_TEMPO_COST + 0.35;
  if (action.id === "FORWARD_3") return REGISTER_TEMPO_COST + 0.85;
  if (action.id === "LEFT" || action.id === "RIGHT") return REGISTER_TEMPO_COST + 0.45;
  if (action.id === "BACK") return REGISTER_TEMPO_COST + 1.15;
  if (action.id === "UTURN") return REGISTER_TEMPO_COST + 1.9;
  return REGISTER_TEMPO_COST;
}

function getProgramTurnActionsFromHistory(history, absoluteActionCount, turnOffset = 0) {
  const window = getProgramHistoryWindow(history);
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const targetTurn = Math.floor(absoluteActions / REGISTER_COUNT) - Math.max(0, turnOffset);
  const historyStartAction = absoluteActions - window.length;

  return window.filter((_, index) => (
    Math.floor((historyStartAction + index) / REGISTER_COUNT) === targetTurn
  ));
}

function getProgramCardScarcityUnitCost(cardCount) {
  const copies = Math.max(0, Math.floor(Number(cardCount) || 0));
  if (copies >= 4) return 0;
  if (copies <= 0) return Infinity;
  return PROGRAM_CARD_SCARCITY_COST_BY_COPIES[copies]
    ?? PROGRAM_CARD_SCARCITY_COST_BY_COPIES[1];
}

function getProgramCombinationPlausibilityPenaltyFromUses(getUses, options = {}) {
  let scarcityLoad = 0;
  let scarceUses = 0;

  for (const resourceId of COMPACT_PROGRAM_RESOURCE_IDS) {
    const uses = Math.max(0, Math.floor(Number(getUses(resourceId)) || 0));
    if (!uses) continue;
    const copies = resourceId === "AGAIN"
      ? AGAIN_CARD_COUNT
      : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
    const unit = getProgramCardScarcityUnitCost(copies);
    if (!Number.isFinite(unit) || unit <= 0) continue;
    scarcityLoad += uses * unit;
    if (unit >= PROGRAM_COMBINATION_PLAUSIBILITY.scarceUseThreshold) {
      scarceUses += uses;
    }
  }

  const excessLoad = Math.max(
    0,
    scarcityLoad - PROGRAM_COMBINATION_PLAUSIBILITY.freeScarcityLoad
  );
  const extraScarceUses = Math.max(0, scarceUses - 1);
  const raw =
    excessLoad * PROGRAM_COMBINATION_PLAUSIBILITY.excessLoadWeight +
    extraScarceUses * PROGRAM_COMBINATION_PLAUSIBILITY.extraScarceUseWeight +
    extraScarceUses * extraScarceUses *
      PROGRAM_COMBINATION_PLAUSIBILITY.extraScarceUseQuadraticWeight;
  const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;
  return Number((raw * lessForeshadowingFactor).toFixed(3));
}

function getCompactProgramCombinationPlausibilityPenalty(currentCode, options = {}) {
  return getProgramCombinationPlausibilityPenaltyFromUses(
    (resourceId) => getCompactProgramResourceCount(currentCode, resourceId),
    options
  );
}

function getCompactProgramCombinationPlausibilityDelta(
  currentCode,
  nextCurrentCode,
  options = {}
) {
  return Number(Math.max(
    0,
    getCompactProgramCombinationPlausibilityPenalty(nextCurrentCode, options) -
      getCompactProgramCombinationPlausibilityPenalty(currentCode, options)
  ).toFixed(3));
}

function getProgramResourceStateSignature(state) {
  const naturalSignature = PROGRAM_CARD_IDS
    .map((id) => state?.naturalUses?.get(id) || 0)
    .join("");
  return `${naturalSignature}a${state?.againActionId ?? "-"}`;
}

function getProgramResourceStateScarcityCost(state) {
  if (!state) return Infinity;
  let cost = 0;
  for (const actionId of PROGRAM_CARD_IDS) {
    const uses = state.naturalUses?.get(actionId) || 0;
    if (!uses) continue;
    cost += uses * getProgramCardScarcityUnitCost(PROGRAM_CARD_COUNTS.get(actionId));
  }

  if (state.againUsed) {
    const repeatedCopies = PROGRAM_CARD_COUNTS.get(state.againActionId) || 1;
    // Again is itself a unique card. Repeating a rare preceding card is more
    // fragile than repeating a common one, so add a fraction of that card's
    // own scarcity without pretending that a second natural copy was used.
    cost += getProgramCardScarcityUnitCost(AGAIN_CARD_COUNT);
    cost += (
      getProgramCardScarcityUnitCost(repeatedCopies) *
      AGAIN_REPEAT_SCARCITY_FACTOR
    );
  }

  return Number(cost.toFixed(3));
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
const COMPACT_PROGRAM_RESOURCE_IDS = Object.freeze([
  ...PROGRAM_CARD_IDS,
  "AGAIN"
]);
const COMPACT_PROGRAM_RESOURCE_LIMITS = Object.freeze(
  COMPACT_PROGRAM_RESOURCE_IDS.map((id) => (
    id === "AGAIN" ? AGAIN_CARD_COUNT : (PROGRAM_CARD_COUNTS.get(id) || 0)
  ))
);
const COMPACT_PROGRAM_RESOURCE_RADICES = Object.freeze(
  COMPACT_PROGRAM_RESOURCE_LIMITS.map((limit) => limit + 1)
);
const COMPACT_PROGRAM_RESOURCE_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (const radix of COMPACT_PROGRAM_RESOURCE_RADICES) {
    weights.push(weight);
    weight *= radix;
  }
  return weights;
})());
const COMPACT_PROGRAM_RESOURCE_SPACE = COMPACT_PROGRAM_RESOURCE_RADICES.reduce(
  (product, radix) => product * radix,
  1
);
const COMPACT_PROGRAM_ACTION_RADIX = PROGRAM_CARD_IDS.length + 1;
const COMPACT_PROGRAM_RESOURCE_INDEX = new Map(
  COMPACT_PROGRAM_RESOURCE_IDS.map((id, index) => [id, index])
);
const COMPACT_PROGRAM_ACTION_CODE = new Map(
  PROGRAM_CARD_IDS.map((id, index) => [id, index + 1])
);

function getCompactProgramResourceCount(code, resourceId) {
  const index = COMPACT_PROGRAM_RESOURCE_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return 0;
  const weight = COMPACT_PROGRAM_RESOURCE_WEIGHTS[index];
  const radix = COMPACT_PROGRAM_RESOURCE_RADICES[index];
  return Math.floor(Math.max(0, Number(code) || 0) / weight) % radix;
}

function addCompactProgramResourceUse(code, resourceId) {
  const index = COMPACT_PROGRAM_RESOURCE_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return null;
  const current = getCompactProgramResourceCount(code, resourceId);
  if (current >= COMPACT_PROGRAM_RESOURCE_LIMITS[index]) return null;
  return (Number(code) || 0) + COMPACT_PROGRAM_RESOURCE_WEIGHTS[index];
}

function encodeCompactProgramResourceState(resourceState) {
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

function getCompactProgramCardStateCode(cardState) {
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

function getCompactProgramCardStateKey(cardState) {
  return getCompactProgramCardStateCode(cardState);
}

function getCompactProgramCardStateFromHistory(history, absoluteActions) {
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const phase = absolute % REGISTER_COUNT;
  const window = getProgramHistoryWindow(history);
  const currentTurnActions = getProgramTurnActionsFromHistory(window, absolute, 0);
  const previousTurnActions = getProgramTurnActionsFromHistory(window, absolute, 1);
  const currentStates = getLiteralProgramResourceStates(currentTurnActions);
  const previousStates = previousTurnActions.length
    ? getLiteralProgramResourceStates(previousTurnActions)
    : [{ naturalUses: new Map(), againUsed: false, againActionId: null }];

  let best = null;
  let bestCost = Infinity;
  for (const previousState of previousStates) {
    for (const currentState of currentStates) {
      if (!areRollingProgramResourceStatesCompatible(previousState, currentState)) continue;
      const cost =
        getProgramResourceStateScarcityCost(previousState) +
        getProgramResourceStateScarcityCost(currentState);
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

function getCompactProgramCardOptions(
  cardState,
  absoluteActions,
  actionId,
  options = {}
) {
  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  const previousCode = Math.max(0, Math.floor(Number(cardState?.previousCode) || 0));
  const currentCode = Math.max(0, Math.floor(Number(cardState?.currentCode) || 0));
  const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;
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
        const scarcityPenalty = Number((
          getProgramCardScarcityUnitCost(naturalLimit) *
          lessForeshadowingFactor
        ).toFixed(3));
        const programPlausibilityPenalty =
          getCompactProgramCombinationPlausibilityDelta(
            currentCode,
            nextCurrent,
            options
          );
        optionsOut.push({
          programCardId: actionId,
          scarcityPenalty,
          programPlausibilityPenalty,
          penalty: Number((
            scarcityPenalty + programPlausibilityPenalty
          ).toFixed(3)),
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
      const repeatedCopies = PROGRAM_CARD_COUNTS.get(actionId) || 1;
      const scarcityPenalty = Number((
        (
          getProgramCardScarcityUnitCost(AGAIN_CARD_COUNT) +
          getProgramCardScarcityUnitCost(repeatedCopies) *
            AGAIN_REPEAT_SCARCITY_FACTOR
        ) *
        lessForeshadowingFactor
      ).toFixed(3));
      const programPlausibilityPenalty =
        getCompactProgramCombinationPlausibilityDelta(
          currentCode,
          nextCurrent,
          options
        );
      optionsOut.push({
        programCardId: "AGAIN",
        scarcityPenalty,
        programPlausibilityPenalty,
        penalty: Number((
          scarcityPenalty + programPlausibilityPenalty
        ).toFixed(3)),
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
          previousCode: option.currentCode,
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


const ESTIMATED_CARD_FORECAST_BREAK_PENALTY = 18;
const ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT = 3;

function cloneEstimatedCardForecastFrontier(frontier, fallbackState = null) {
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

function advanceEstimatedCardForecastFrontier(
  frontier,
  absoluteActions,
  actionId,
  options = {}
) {
  const current = cloneEstimatedCardForecastFrontier(frontier);
  if (!current.length) {
    return { feasible: false, frontier: [] };
  }

  const next = new Map();
  for (const entry of current) {
    const cardOptions = getCompactProgramCardOptions(
      entry.state,
      absoluteActions,
      actionId,
      options
    );
    for (const cardOption of cardOptions) {
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
  return {
    feasible: retained.length > 0,
    frontier: retained
  };
}

function walkEstimatedCardForecast(
  actionIds,
  absoluteActions,
  initialFrontier,
  options = {}
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
    workingAbsoluteActions += 1;
    if (!next.feasible) {
      feasible = false;
      frontier = [];
      failureIndex = index;
      break;
    }
    frontier = next.frontier;
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

function scoreCompactProgramCardSequenceUntilFailure(
  initialCardState,
  absoluteActions,
  actionIds,
  options = {}
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

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const actionId = actions[actionIndex];
    const next = new Map();
    for (const entry of frontier.values()) {
      const cardOptions = getCompactProgramCardOptions(
        entry.state,
        workingAbsoluteActions,
        actionId,
        options
      );
      for (const cardOption of cardOptions) {
        const penalty = entry.penalty + cardOption.penalty;
        const key = getCompactProgramCardStateKey(cardOption.state);
        const prior = next.get(key);
        if (!prior || penalty < prior.penalty - 0.001) {
          next.set(key, {
            state: cardOption.state,
            penalty,
            scarcityPenalty:
              (entry.scarcityPenalty || 0) +
              (Number(cardOption.scarcityPenalty) || 0),
            programPlausibilityPenalty:
              (entry.programPlausibilityPenalty || 0) +
              (Number(cardOption.programPlausibilityPenalty) || 0),
            programCardIds: [
              ...entry.programCardIds,
              cardOption.programCardId
            ],
            actionPenalties: [
              ...entry.actionPenalties,
              cardOption.penalty
            ],
            actionScarcityPenalties: [
              ...entry.actionScarcityPenalties,
              Number(cardOption.scarcityPenalty) || 0
            ],
            actionPlausibilityPenalties: [
              ...entry.actionPlausibilityPenalties,
              Number(cardOption.programPlausibilityPenalty) || 0
            ],
            cardStates: [
              ...entry.cardStates,
              { ...cardOption.state }
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
        programPlausibilityPenalty: Number((
          bestPrefix?.programPlausibilityPenalty ?? Infinity
        ).toFixed(3)),
        cardStates: bestPrefix?.cardStates ?? [],
        frontier: survivingPrefix
      };
    }
    frontier = next;
    workingAbsoluteActions += 1;
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
    programPlausibilityPenalty: Number((
      best?.programPlausibilityPenalty ?? Infinity
    ).toFixed(3)),
    cardStates: best?.cardStates ?? [],
    frontier: best ? [best] : []
  };
}

function scoreCompactProgramCardSequence(
  initialCardState,
  absoluteActions,
  actionIds,
  options = {}
) {
  const result = scoreCompactProgramCardSequenceUntilFailure(
    initialCardState,
    absoluteActions,
    actionIds,
    options
  );
  return {
    feasible: result.feasible,
    penalty: result.feasible ? result.penalty : Infinity,
    scarcityPenalty: result.feasible ? result.scarcityPenalty : Infinity,
    programPlausibilityPenalty: result.feasible
      ? result.programPlausibilityPenalty
      : Infinity,
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

function getLiteralProgramResourceStates(actionIds = []) {
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

function getLiteralProgramResourceSummary(actionIds = []) {
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

function areRollingProgramResourceStatesCompatible(previousState, currentState) {
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

function getRollingProgramSignatureId(canonicalSignature) {
  if (!ROLLING_PROGRAM_SIGNATURE_IDS.has(canonicalSignature)) {
    ROLLING_PROGRAM_SIGNATURE_IDS.set(
      canonicalSignature,
      nextRollingProgramSignatureId++
    );
  }
  return ROLLING_PROGRAM_SIGNATURE_IDS.get(canonicalSignature);
}

function getRollingProgramResourceContext(
  history,
  absoluteActionCount,
  candidateActionId = null
) {
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const window = getProgramHistoryWindow(history);
  const phase = absoluteActions % REGISTER_COUNT;
  const cacheKey = `r${phase}:${window.join(".") || "-"}>${candidateActionId ?? "-"}`;
  if (ROLLING_PROGRAM_CONTEXT_CACHE.has(cacheKey)) {
    return ROLLING_PROGRAM_CONTEXT_CACHE.get(cacheKey);
  }

  const currentTurnActions = getProgramTurnActionsFromHistory(
    window,
    absoluteActions,
    0
  );
  if (candidateActionId) currentTurnActions.push(candidateActionId);
  const previousTurnActions = getProgramTurnActionsFromHistory(
    window,
    absoluteActions,
    1
  );

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
      const currentScarcityCost = getProgramResourceStateScarcityCost(currentState);
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

function evaluateProgramActionFromContext(
  before,
  history,
  absoluteActionCount,
  actionId,
  options = {}
) {
  const resolvedBefore = before ?? getRollingProgramResourceContext(
    history,
    absoluteActionCount
  );
  const absoluteActions = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const phase = absoluteActions % REGISTER_COUNT;
  const previousActionId = phase > 0
    ? (getProgramHistoryWindow(history).at(-1) ?? "-")
    : "-";
  const transitionCacheKey = `${phase}|q${resolvedBefore.pairSignatureId}|p${previousActionId}>${actionId}`;
  const cachedTransition = PROGRAM_ACTION_TRANSITION_CACHE.get(transitionCacheKey);
  if (cachedTransition) {
    const beforeCost = Number.isFinite(resolvedBefore.minimumCurrentScarcityCost)
      ? resolvedBefore.minimumCurrentScarcityCost
      : 0;
    const afterCost = Number.isFinite(cachedTransition.minimumCurrentScarcityCost)
      ? cachedTransition.minimumCurrentScarcityCost
      : beforeCost;
    const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;
    return {
      feasible: cachedTransition.feasible,
      penalty: cachedTransition.feasible
        ? Number((Math.max(0, afterCost - beforeCost) * lessForeshadowingFactor).toFixed(2))
        : Infinity,
      before: resolvedBefore,
      after: cachedTransition
    };
  }

  const after = getRollingProgramResourceContext(
    history,
    absoluteActionCount,
    actionId
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
  const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;
  const penalty = Math.max(0, afterCost - beforeCost) * lessForeshadowingFactor;
  return {
    feasible: true,
    penalty: Number(penalty.toFixed(2)),
    before: resolvedBefore,
    after: cachedAfter
  };
}

function evaluateProgramAction(history, absoluteActionCount, actionId, options = {}) {
  return evaluateProgramActionFromContext(
    getRollingProgramResourceContext(history, absoluteActionCount),
    history,
    absoluteActionCount,
    actionId,
    options
  );
}

function getCardAvailabilityPressure(history, actionId, options = {}) {
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

// Power Up is WAIT in the route action vocabulary. Its card scarcity follows the
// same one-copy rule as every other unique program card; any strategic benefit
// from charging Energy belongs to the separate Energy-economy model.
export function summarizePowerUpProgramFeasibility(history, absoluteActions) {
  const base = getRollingProgramResourceContext(history, absoluteActions);
  const powerUp = evaluateProgramAction(history, absoluteActions, "WAIT");
  const phase = ((Number(absoluteActions) || 0) % REGISTER_COUNT + REGISTER_COUNT) % REGISTER_COUNT;
  const nextRegister = phase + 1;
  const againFitsSameProgram = nextRegister < REGISTER_COUNT;

  let powerUpAgain = { feasible: false, penalty: Infinity };
  if (powerUp.feasible && againFitsSameProgram) {
    const afterPowerUpHistory = getProgramHistoryWindow([
      ...(history || []),
      "WAIT"
    ]);
    const second = evaluateProgramAction(
      afterPowerUpHistory,
      Number(absoluteActions || 0) + 1,
      "WAIT"
    );
    powerUpAgain = {
      feasible: second.feasible,
      penalty: Number((powerUp.penalty + (second.feasible ? second.penalty : 0)).toFixed(2))
    };
  }

  return {
    registerPhase: phase,
    nextRegister,
    currentTurnActions: [...base.currentTurnActions],
    currentProgramFeasible: base.feasible,
    currentProgramRequiresAgain: base.currentRequiresAgain,
    powerUp: {
      feasible: powerUp.feasible,
      reason: powerUp.feasible
        ? null
        : "Power Up is unavailable under the rolling previous-turn card supply"
    },
    powerUpAgain: {
      feasible: powerUpAgain.feasible,
      reason: powerUpAgain.feasible
        ? null
        : !againFitsSameProgram
          ? "Again would be register 1 next turn"
          : "Power Up + Again exceeds rolling two-turn card supply"
    }
  };
}

function weightedDistance(distance, forcedDistance) {
  const manualDistance = Math.max(0, distance - forcedDistance);
  return Number((manualDistance * 0.75 + forcedDistance * 0.55).toFixed(2));
}

function scoreConveyorStep(step, goal) {
  const before = heuristic(step.from, goal);
  const after = heuristic(step.to, goal);
  const progress = before - after;
  let penalty = 0;

  if (progress === 0) {
    penalty += step.speed === 2 ? 0.5 : 0.35;
  } else if (progress < 0) {
    penalty += step.speed === 2 ? 1.3 : 0.9;
  }

  if (step.turned) {
    penalty += progress > 0
      ? (step.speed === 2 ? 0.35 : 0.25)
      : (step.speed === 2 ? 0.8 : 0.55);
  }

  return penalty;
}

function scoreTransitionConveyorComplexity(transition, goal) {
  let score = 0;
  for (const step of transition.conveyorSteps || []) {
    score += scoreConveyorStep(step, goal);
  }
  if (transition.gearTurned) {
    score += 0.55;
  }
  return Number(Math.max(0, score).toFixed(2));
}

function scoreConveyorComplexity(route, goal) {
  let score = 0;

  for (const transition of route.transitions) {
    score += scoreTransitionConveyorComplexity(transition, goal);
  }

  return Number(Math.max(0, score).toFixed(2));
}

function routeTouchesPit(tileMap, route) {
  return route.path.some((point) => isPit(tileMap.get(tileKey(point.x, point.y))));
}

const DYNAMIC_ARCHIVING_ROUTE_UTILITY = Object.freeze({
  progressWeight: 0.08,
  hazardWeight: 0.06,
  maxHazardRewardPerArchive: 1.5,
  maxRouteReward: 4.5
});

function isDynamicArchiveLanding(tileMap, point, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving" || !point) return false;
  const tile = tileMap?.get(tileKey(point.x, point.y));
  return (tile?.features || []).some((feature) => (
    feature.type === "checkpoint" || feature.type === "battery"
  ));
}

function scoreDynamicArchivingRouteUtility(tileMap, route, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving" || !route?.transitions?.length) {
    return 0;
  }

  let lastArchiveAction = 0;
  let hazardSinceArchive = 0;
  let reward = 0;

  route.transitions.forEach((transition, index) => {
    hazardSinceArchive += Math.max(0, Number(transition?.hazard) || 0);
    const actionNumber = index + 1;
    const isFinalRegister = actionNumber >= route.transitions.length;
    if (isFinalRegister || !isDynamicArchiveLanding(tileMap, transition?.to, options)) {
      return;
    }

    const progress = Math.max(0, actionNumber - lastArchiveAction);
    const progressReward = progress * DYNAMIC_ARCHIVING_ROUTE_UTILITY.progressWeight;
    const hazardReward = Math.min(
      DYNAMIC_ARCHIVING_ROUTE_UTILITY.maxHazardRewardPerArchive,
      hazardSinceArchive * DYNAMIC_ARCHIVING_ROUTE_UTILITY.hazardWeight
    );
    reward += progressReward + hazardReward;
    lastArchiveAction = actionNumber;
    hazardSinceArchive = 0;
  });

  return Number(Math.min(
    DYNAMIC_ARCHIVING_ROUTE_UTILITY.maxRouteReward,
    Math.max(0, reward)
  ).toFixed(2));
}

function scoreRoute(route, goal, tileMap = null, options = {}) {
  const scoringGoal = route.hitTarget ?? goal;
  const goalReached = route.finalState.x === scoringGoal.x && route.finalState.y === scoringGoal.y;
  const conveyorComplexity = scoreConveyorComplexity(route, scoringGoal);
  const baseScore = Number.isFinite(route.baseCost)
    ? route.baseCost
    : route.actions * 5 + weightedDistance(route.distance, route.forcedDistance) + route.hazard + route.rebootPenalty + conveyorComplexity;
  const dynamicArchivingRewardScore = scoreDynamicArchivingRouteUtility(tileMap, route, options);
  const score = baseScore - dynamicArchivingRewardScore;
  const rebootCount = route.transitions.filter((transition) => transition.rebooted).length;

  return {
    actions: route.actions,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    conveyorComplexity,
    hazard: Number(route.hazard.toFixed(2)),
    rebootCount,
    dynamicArchivingRewardScore,
    score: Number(score.toFixed(2)),
    goalReached
  };
}

function percentileNumber(values, fraction = 0.5) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function scoreImmediateTransitionContribution(transition, actionId, history, absoluteActionCount, goal, options = {}) {
  if (!transition || transition.crashed || transition.blocked) return null;
  const action = ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) return null;
  const nextActionCount = absoluteActionCount + 1;
  const transitionRebootPenalty = transition.rebooted
    ? getRebootRoutePenalty(nextActionCount)
    : (transition.rebootPenalty || 0);
  const reversePenalty = action.id === "BACK" ? 1.4 : 0;
  const heavyMovePenalty = action.id === "FORWARD_2"
    ? 0.25
    : action.id === "FORWARD_3"
      ? 0.75
      : 0;
  const neutralPowerUpBenchmark = Boolean(
    options.neutralPowerUpBenchmark && action.id === "WAIT"
  );
  const scarceReusePenalty = neutralPowerUpBenchmark
    ? 0
    : getCardAvailabilityPressure(history, action.id, {
      ...options,
      absoluteActionCount
    });
  const actionPenalty = neutralPowerUpBenchmark
    ? REGISTER_TEMPO_COST
    : getActionPenalty(action, options);
  return (
    (transition.hazard || 0) +
    transitionRebootPenalty +
    weightedDistance(transition.distance || 0, transition.forcedDistance || 0) +
    actionPenalty +
    reversePenalty +
    heavyMovePenalty +
    scarceReusePenalty +
    scoreTransitionConveyorComplexity(transition, goal)
  );
}

function measureInsertedNeutralPowerUpCost(tileMap, route, insertionIndex, flags = [], options = {}) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  const actionHistory = Array.isArray(route?.actionHistory)
    ? route.actionHistory
    : transitions.map((transition) => transition?.action).filter(Boolean);
  const from = transitions[insertionIndex]?.from;
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) return null;
  const checkpointHits = Array.isArray(route?.checkpointHits) ? route.checkpointHits : [];
  let checkpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= insertionIndex).length;
  let absoluteActions = insertionIndex;
  let state = cloneState(from);
  let history = actionHistory.slice(0, insertionIndex);
  let insertedSuffixCost = 0;
  let originalSuffixCost = 0;

  // Baseline: score the original suffix in the same immediate-cost currency.
  for (let index = insertionIndex; index < transitions.length; index += 1) {
    const actionId = transitions[index]?.action ?? actionHistory[index];
    if (!actionId) continue;
    const baselineCheckpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= index).length;
    const baselineGoal = flags[Math.min(baselineCheckpointIndex, Math.max(0, flags.length - 1))] ?? flags.at(-1) ?? null;
    const contribution = scoreImmediateTransitionContribution(
      transitions[index],
      actionId,
      actionHistory.slice(0, index),
      index,
      baselineGoal,
      options
    );
    if (!Number.isFinite(contribution)) return null;
    originalSuffixCost += contribution;
  }

  const waitAction = ACTIONS.find((action) => action.id === "WAIT");
  if (!waitAction) return null;
  let target = checkpointIndex < flags.length
    ? getFullCourseTarget(flags, checkpointIndex, absoluteActions, options)
    : flags.at(-1) ?? null;
  const waitTransition = simulateAction(tileMap, state, waitAction, {
    ...options,
    goal: target,
    registerIndex: absoluteActions % REGISTER_COUNT
  });
  // A Power Up that immediately crashes/reboots is not a representative way to
  // calibrate the value of energy; leave such tactical edge cases out of the
  // robust course benchmark.
  if (waitTransition.crashed || waitTransition.blocked || waitTransition.rebooted) return null;
  const waitContribution = scoreImmediateTransitionContribution(
    waitTransition,
    "WAIT",
    history,
    absoluteActions,
    target,
    { ...options, neutralPowerUpBenchmark: true }
  );
  if (!Number.isFinite(waitContribution)) return null;
  insertedSuffixCost += waitContribution;
  state = cloneState(waitTransition.to);
  history = getProgramHistoryWindow([...history, "WAIT"]);
  absoluteActions += 1;
  if (checkpointIndex < flags.length && fullCourseRouteReachesNextCheckpoint({
    finalState: state,
    checkpointIndex,
    actions: absoluteActions
  }, flags, options)) {
    checkpointIndex += 1;
  }

  // Replay the originally planned suffix from the new post-Power-Up state. This
  // captures conveyor/gear/timing benefits or penalties without launching any
  // additional route search. Stop naturally if the inserted register completes
  // the course earlier than the original plan.
  for (let index = insertionIndex; index < actionHistory.length && checkpointIndex < flags.length; index += 1) {
    const actionId = actionHistory[index];
    const action = ACTIONS.find((candidate) => candidate.id === actionId);
    if (!action) return null;
    target = getFullCourseTarget(flags, checkpointIndex, absoluteActions, options);
    const transition = simulateAction(tileMap, state, action, {
      ...options,
      goal: target,
      registerIndex: absoluteActions % REGISTER_COUNT
    });
    if (transition.crashed || transition.blocked || transition.rebooted) return null;
    const contribution = scoreImmediateTransitionContribution(
      transition,
      actionId,
      history,
      absoluteActions,
      target,
      options
    );
    if (!Number.isFinite(contribution)) return null;
    insertedSuffixCost += contribution;
    state = cloneState(transition.to);
    history = getProgramHistoryWindow([...history, actionId]);
    absoluteActions += 1;
    if (fullCourseRouteReachesNextCheckpoint({
      finalState: state,
      checkpointIndex,
      actions: absoluteActions
    }, flags, options)) {
      checkpointIndex += 1;
    }
  }

  if (checkpointIndex < flags.length) {
    const recoveryEstimate = estimateFullCourseRoute({
      checkpointIndex,
      finalState: state,
      actions: absoluteActions,
      baseCost: insertedSuffixCost
    }, flags, options) - insertedSuffixCost;
    insertedSuffixCost += Math.max(0, recoveryEstimate);
  }

  return insertedSuffixCost - originalSuffixCost;
}

export function summarizePowerUpOpportunityBenchmark(tileMap, startAnalyses = [], flags = [], options = {}) {
  const productiveRegisterScores = [];
  const powerUpOpportunityCosts = [];
  const fullCourseActions = [];
  const fullCourseScores = [];
  const waitAction = ACTIONS.find((action) => action.id === "WAIT");

  for (const analysis of startAnalyses || []) {
    const route = analysis?.fullCourseRoute;
    if (!route || !Array.isArray(route.transitions) || !route.transitions.length) continue;
    fullCourseActions.push(route.actions ?? route.transitions.length);
    if (Number.isFinite(route.score)) fullCourseScores.push(route.score);
    const actionHistory = Array.isArray(route.actionHistory)
      ? route.actionHistory
      : route.transitions.map((transition) => transition?.action).filter(Boolean);
    const checkpointHits = Array.isArray(route.checkpointHits) ? route.checkpointHits : [];
    const opportunitySampleLimit = Math.max(1, Math.floor(options.powerUpBenchmarkSamplesPerRoute ?? 5));
    const opportunitySampleIndices = new Set();
    const transitionCount = route.transitions.length;
    const sampleCount = Math.min(opportunitySampleLimit, transitionCount);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      opportunitySampleIndices.add(Math.min(
        transitionCount - 1,
        Math.floor(((sampleIndex + 0.5) * transitionCount) / sampleCount)
      ));
    }

    route.transitions.forEach((transition, index) => {
      const actionId = transition?.action ?? actionHistory[index];
      if (!actionId) return;
      const from = transition?.from;
      if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      const startTile = tileMap.get(tileKey(from.x, from.y));
      const onBattery = (startTile?.features || []).some((feature) => feature.type === "battery");
      const checkpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= index).length;
      const goal = flags[Math.min(checkpointIndex, Math.max(0, flags.length - 1))] ?? flags.at(-1) ?? null;
      const priorHistory = actionHistory.slice(0, index);
      const chosenContribution = scoreImmediateTransitionContribution(
        transition,
        actionId,
        priorHistory,
        index,
        goal,
        options
      );

      // The course register benchmark should describe useful tempo rather than
      // already taking the energy reward from a battery or Power Up action.
      if (!onBattery && actionId !== "WAIT" && Number.isFinite(chosenContribution)) {
        productiveRegisterScores.push(chosenContribution);
      }

      if (
        options.skipPowerUpStrategicSamples ||
        !waitAction ||
        !opportunitySampleIndices.has(index) ||
        onBattery ||
        actionId === "WAIT" ||
        !Number.isFinite(chosenContribution)
      ) return;
      const opportunityCost = measureInsertedNeutralPowerUpCost(
        tileMap,
        route,
        index,
        flags,
        options
      );
      if (Number.isFinite(opportunityCost)) {
        powerUpOpportunityCosts.push(opportunityCost);
      }
    });
  }

  const registerMedian = percentileNumber(productiveRegisterScores, 0.5);
  const opportunityMedian = percentileNumber(powerUpOpportunityCosts, 0.5);
  const waitActionPenalty = waitAction ? getActionPenalty(waitAction, options) : null;
  const powerUpBaseDiscount = Number.isFinite(waitActionPenalty)
    ? Number((REGISTER_TEMPO_COST - waitActionPenalty).toFixed(2))
    : null;
  let batteryFeatureScore = null;
  try {
    const value = getTilePenaltyForFeature({ type: "battery" }, {
      ...options,
      batteryActive: true
    });
    batteryFeatureScore = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  } catch {
    batteryFeatureScore = null;
  }

  const batteryEnergyRewardScore = Number.isFinite(batteryFeatureScore)
    ? Number((-batteryFeatureScore).toFixed(2))
    : null;

  // Keep these as diagnostics for v36 rather than silently replacing route
  // scoring with the new P2W scarcity curve. The route search does not yet
  // carry a robot's current energy reserve/cap, so applying the full marginal
  // energy value here would over-credit Power Ups or batteries even when the
  // robot could not actually benefit from another cube. A shared reward model
  // should land together with explicit energy-state tracking.
  return {
    method: "productive-register-and-power-up-strategic-delta-shadow",
    registerTempoCost: REGISTER_TEMPO_COST,
    powerUpWaitActionPenalty: Number.isFinite(waitActionPenalty) ? Number(waitActionPenalty.toFixed(2)) : null,
    powerUpBaseDiscount,
    registerScoreMedian: Number.isFinite(registerMedian) ? Number(registerMedian.toFixed(2)) : null,
    registerScoreP25: Number.isFinite(percentileNumber(productiveRegisterScores, 0.25))
      ? Number(percentileNumber(productiveRegisterScores, 0.25).toFixed(2))
      : null,
    registerScoreP75: Number.isFinite(percentileNumber(productiveRegisterScores, 0.75))
      ? Number(percentileNumber(productiveRegisterScores, 0.75).toFixed(2))
      : null,
    registerSamples: productiveRegisterScores.length,
    // Strategic delta is deliberately descriptive, not the energy exchange rate:
    // negative values mean that inserting a Power Up helped the route through
    // factory timing/positioning; positive values mean it cost useful tempo.
    powerUpStrategicDeltaMedian: Number.isFinite(opportunityMedian) ? Number(opportunityMedian.toFixed(2)) : null,
    powerUpStrategicDeltaP25: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.25))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.25).toFixed(2))
      : null,
    powerUpStrategicDeltaP75: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.75))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.75).toFixed(2))
      : null,
    powerUpStrategicDeltaSamples: powerUpOpportunityCosts.length,
    // Compatibility aliases for v34 snapshots/diagnostic consumers.
    powerUpOpportunityMedian: Number.isFinite(opportunityMedian) ? Number(opportunityMedian.toFixed(2)) : null,
    powerUpOpportunityP25: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.25))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.25).toFixed(2))
      : null,
    powerUpOpportunityP75: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.75))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.75).toFixed(2))
      : null,
    powerUpOpportunitySamples: powerUpOpportunityCosts.length,
    medianFullCourseActions: Number.isFinite(percentileNumber(fullCourseActions, 0.5))
      ? Number(percentileNumber(fullCourseActions, 0.5).toFixed(2))
      : null,
    medianFullCourseTurns: Number.isFinite(percentileNumber(fullCourseActions, 0.5))
      ? Number((percentileNumber(fullCourseActions, 0.5) / REGISTER_COUNT).toFixed(2))
      : null,
    medianFullCourseScore: Number.isFinite(percentileNumber(fullCourseScores, 0.5))
      ? Number(percentileNumber(fullCourseScores, 0.5).toFixed(2))
      : null,
    batteryFeatureScore,
    batteryEnergyRewardScore
  };
}

function createQueueEntry(route, goal) {
  return {
    ...route,
    estimate: route.baseCost + heuristic(route.finalState, goal) * 5
  };
}

function reconstructRouteTransitions(route) {
  const transitions = [];
  let current = route;

  while (current?.parent) {
    if (current.transition) {
      transitions.push(current.transition);
    }
    current = current.parent;
  }

  transitions.reverse();
  return transitions;
}

function getDynamicGoalPosition(dynamicGoal, actionCount) {
  const positions = dynamicGoal?.positions;
  if (!Array.isArray(positions) || !positions.length) {
    return null;
  }

  if (actionCount < positions.length) {
    return positions[actionCount];
  }

  if (dynamicGoal.periodStart !== undefined && dynamicGoal.periodLength > 0) {
    const periodStart = dynamicGoal.periodStart;
    const offset = (actionCount - periodStart) % dynamicGoal.periodLength;
    return positions[periodStart + offset] ?? positions.at(-1);
  }

  return positions.at(-1);
}

function getRouteTarget(goal, actionCount, options = {}) {
  return getDynamicGoalPosition(options.dynamicGoal, actionCount) ?? goal;
}

function getDynamicGoalSpace(dynamicGoal, point) {
  const displayPositions = dynamicGoal?.displayPositions ?? dynamicGoal?.positions ?? [];
  const index = displayPositions.findIndex((candidate) => (
    candidate.x === point?.x && candidate.y === point?.y
  ));

  return index >= 0 ? index + 1 : null;
}

function routeReachesGoal(route, goal, options = {}) {
  const target = getRouteTarget(goal, route.actions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

function getRouteEnergyShadowReserveKey(reserve, options = {}) {
  if (!isRouteAwareBatteryScoringActive(options)) return "";
  const config = getRouteEnergyEconomyConfig(options);
  const safeReserve = clamp(
    Math.floor(Number.isFinite(Number(reserve))
      ? Number(reserve)
      : getInitialRouteEnergyShadowReserve(options)),
    0,
    config.maxEnergy
  );
  return `@e${safeReserve}`;
}

function getSearchStateKey(state, actionCount, options = {}, energyReserve = null) {
  const economyActionKey = isRouteAwareBatteryScoringActive(options)
    ? `@a${actionCount}${getRouteEnergyShadowReserveKey(energyReserve, options)}`
    : "";
  if (!options.dynamicGoal) {
    return `${stateKey(state)}${economyActionKey}`;
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = options.dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@${phase}${economyActionKey}`;
}

function enumerateRoutes(tileMap, start, goal, options = {}) {
  const telemetryStartedAt = analysisTelemetryNow();
  const dynamicGoalActive = Boolean(options.dynamicGoal);
  const maxRoutes = options.maxRoutes ?? 2;
  const requestedMaxExpansions = options.maxExpansions ?? 30000;
  const maxExpansions = dynamicGoalActive
    ? Math.min(requestedMaxExpansions, options.dynamicGoal?.maxExpansions ?? 8000)
    : requestedMaxExpansions;
  const maxActions = options.dynamicGoal?.maxActions ?? options.maxActions ?? (dynamicGoalActive ? 16 : Infinity);
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap
  };
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostByState = new Map();

  // Startup Spin-Up is a free setup choice, not a programmed turn. Seed one
  // zero-cost root for every legal initial facing into the same search so all
  // facings share the route limit and expansion budget.
  for (const facing of initialFacings) {
    const initialState = {
      x: start.x,
      y: start.y,
      facing
    };
    const initialEconomyState = getInitialRouteEconomyShadowState(options);
    const initialEnergyReserve = initialEconomyState.energy;
    const initialUpgradeCardUnits = initialEconomyState.usefulCardUnits;
    const initialStateKey = getSearchStateKey(
      initialState,
      0,
      options,
      initialEnergyReserve
    );
    bestCostByState.set(initialStateKey, 0);
    queue.push(createQueueEntry({
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: initialEconomyState.normalDraws || 0,
      routeEconomyInstalls: initialEconomyState.installs || 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: initialEconomyState.energySpent || 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      baseCost: 0,
      actionHistory: []
    }, goal));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getSearchStateKey(
      current.finalState,
      current.actions,
      options,
      current.routeEnergyShadowReserve
    );
    const knownBest = bestCostByState.get(currentStateId);

    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      continue;
    }

    if (routeReachesGoal(current, goal, options)) {
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const hitTarget = getRouteTarget(goal, current.actions, options);
      const hitSpace = getDynamicGoalSpace(options.dynamicGoal, hitTarget);
      const completedRoute = {
        ...current,
        transitions,
        hitTarget
      };
      const routeScore = scoreRoute(completedRoute, goal, tileMap, options);
      if ((options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) && routeTouchesPit(tileMap, { path: timeline })) {
        continue;
      }
      completed.push({
        path: timeline,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: options.dynamicGoal
          ? {
            checkpointId: options.dynamicGoal.id ?? null,
            position: hitTarget,
            space: hitSpace,
            actions: current.actions,
            positions: options.dynamicGoal.positions ?? [],
            displayPositions: options.dynamicGoal.displayPositions ?? options.dynamicGoal.positions ?? []
          }
          : null,
        absoluteStartAction: 0,
        absoluteActions: current.actions,
        localActionIds: [...current.actionHistory],
        programHistoryEnd: getProgramHistoryWindow(current.actionHistory),
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? getInitialRouteEnergyShadowReserve(options),
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        goalReached: true,
        fullCourseLeg: true,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) {
      continue;
    }

    for (const action of ACTIONS) {
      const cardEvaluation = evaluateProgramAction(
        current.actionHistory,
        current.actions,
        action.id,
        options
      );
      if (!cardEvaluation.feasible) {
        continue;
      }
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal,
        registerIndex: current.actions % REGISTER_COUNT
      });
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 0.25 : action.id === "FORWARD_3" ? 0.75 : 0;
      const scarceReusePenalty = cardEvaluation.penalty;
      const conveyorComplexity = scoreTransitionConveyorComplexity(transition, goal);
      const nextActionHistory = getProgramHistoryWindow([...current.actionHistory, action.id]);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(nextActionCount)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        const energyStep = getRouteEnergyShadowStep(
          tileMap,
          destination,
          action.id,
          nextActionCount,
          current.routeEnergyShadowReserve,
          current.routeUpgradeCardShadowUnits,
          options
        );
        const energyEconomyRewardScore = energyStep.rewardScore;
        const batteryEconomyRewardScore = energyStep.batteryRewardScore;
        const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
        const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;
        const nextStateKey = getSearchStateKey(
          destination,
          nextActionCount,
          options,
          energyStep.reserveAfter
        );
        const nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          routeEnergyEconomyRewardScore: (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
          batteryEconomyRewardScore: (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
          powerUpEconomyRewardScore: (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
          chopShopEconomyRewardScore: (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
          routeEnergyShadowReserve: energyStep.reserveAfter,
          routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
          routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
          routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
          routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
          routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
          routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
          routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
          chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
          chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + weightedDistance(transition.distance, transition.forcedDistance) + actionPenalty + reversePenalty + heavyMovePenalty + scarceReusePenalty + conveyorComplexity - energyEconomyRewardScore,
          actionHistory: nextActionHistory
        };

        const priorBest = bestCostByState.get(nextStateKey);
        if (priorBest !== undefined && nextRoute.baseCost >= priorBest - 0.001) {
          continue;
        }

        bestCostByState.set(nextStateKey, nextRoute.baseCost);
        queue.push(createQueueEntry(nextRoute, goal));
      }
    }
  }

  const hitExpansionCap = expansions >= maxExpansions;
  completed.searchMeta = {
    expansions,
    maxExpansions,
    hitExpansionCap,
    zeroRouteCapFailure: completed.length === 0 && hitExpansionCap
  };
  recordRouteSearchTelemetry("single-leg", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    hitExpansionCap,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: { x: goal.x, y: goal.y }
  });
  return completed;
}

function getFullCourseDynamicGoal(options = {}, checkpointIndex) {
  return Array.isArray(options.dynamicGoals)
    ? options.dynamicGoals[checkpointIndex] ?? null
    : null;
}

function getFullCourseTarget(flags, checkpointIndex, actionCount, options = {}) {
  const goal = flags[checkpointIndex];
  return getDynamicGoalPosition(getFullCourseDynamicGoal(options, checkpointIndex), actionCount) ?? goal;
}

function fullCourseRouteReachesNextCheckpoint(route, flags, options = {}) {
  const target = getFullCourseTarget(flags, route.checkpointIndex, route.actions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

function getFullCourseSearchStateKey(
  state,
  actionCount,
  checkpointIndex,
  options = {},
  energyReserve = null
) {
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const registerPhase = actionCount % REGISTER_COUNT;
  const economyActionKey = isRouteAwareBatteryScoringActive(options)
    ? `@a${actionCount}${getRouteEnergyShadowReserveKey(energyReserve, options)}`
    : "";
  if (!dynamicGoal) {
    return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}${economyActionKey}`;
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}@${phase}${economyActionKey}`;
}

function estimateFullCourseRoute(route, flags, options = {}) {
  if (route.checkpointIndex >= flags.length) {
    return route.baseCost;
  }

  const target = getFullCourseTarget(flags, route.checkpointIndex, route.actions, options);
  let remainingDistance = heuristic(route.finalState, target);
  for (let index = route.checkpointIndex + 1; index < flags.length; index += 1) {
    remainingDistance += heuristic(flags[index - 1], flags[index]);
  }

  return route.baseCost + remainingDistance * 4.6;
}

function createFullCourseQueueEntry(route, flags, options = {}) {
  return {
    ...route,
    estimate: estimateFullCourseRoute(route, flags, options)
  };
}

function makeCheckpointHit(route, flags, options = {}) {
  const checkpointIndex = route.checkpointIndex;
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const hitTarget = getFullCourseTarget(flags, checkpointIndex, route.actions, options);
  return {
    checkpointIndex,
    checkpointId: flags[checkpointIndex]?.id ?? checkpointIndex + 1,
    action: route.actions,
    state: cloneState(route.finalState),
    position: hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? flags[checkpointIndex]?.id ?? checkpointIndex + 1,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: route.actions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    hazard: route.hazard,
    rebootPenalty: route.rebootPenalty,
    baseCost: route.baseCost,
    routeEnergyEconomyRewardScore: route.routeEnergyEconomyRewardScore ?? 0,
    batteryEconomyRewardScore: route.batteryEconomyRewardScore ?? 0,
    powerUpEconomyRewardScore: route.powerUpEconomyRewardScore ?? 0,
    chopShopEconomyRewardScore: route.chopShopEconomyRewardScore ?? 0,
    routeEnergyShadowReserve: route.routeEnergyShadowReserve ?? null,
    routeUpgradeCardShadowUnits: route.routeUpgradeCardShadowUnits ?? null
  };
}

function enumerateFullCourseRoutes(tileMap, start, flags, options = {}) {
  const telemetryStartedAt = analysisTelemetryNow();
  if (!Array.isArray(flags) || !flags.length) {
    recordRouteSearchTelemetry("full-course", telemetryStartedAt, {
      expansions: 0,
      maxExpansions: 0,
      completedRoutes: 0,
      returnedRoutes: 0,
      start: { x: start.x, y: start.y, facing: start.facing ?? null },
      goal: null
    });
    return [];
  }

  const maxRoutes = options.maxRoutes ?? 2;
  const maxActions = options.maxActions ?? Math.max(24, flags.length * 18 + 8);
  const maxExpansions = options.maxExpansions ?? 45000;
  const maxStateLabels = Math.max(1, Math.min(2, options.maxStateLabels ?? 1));
  const initialFacings = options.startupSpinUp ? ROTATION_ORDER : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = { ...options, portalMap };
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostsByState = new Map();

  const acceptStateLabel = (stateId, cost, labelLimit = maxStateLabels) => {
    const safeLimit = Math.max(1, Math.min(maxStateLabels, labelLimit));
    const costs = bestCostsByState.get(stateId) ?? [];
    if (costs.length < safeLimit) {
      bestCostsByState.set(stateId, [...costs, cost].sort((a, b) => a - b));
      return true;
    }
    const worst = costs[costs.length - 1];
    if (cost < worst - 0.001) {
      bestCostsByState.set(
        stateId,
        [...costs.slice(0, safeLimit - 1), cost].sort((a, b) => a - b)
      );
      return true;
    }
    return false;
  };

  const stateLabelStillActive = (stateId, cost) => {
    const costs = bestCostsByState.get(stateId);
    return Boolean(costs?.length) && cost <= costs[costs.length - 1] + 0.001;
  };

  for (const facing of initialFacings) {
    const initialState = { x: start.x, y: start.y, facing };
    const initialEconomyState = getInitialRouteEconomyShadowState(options);
    const initialEnergyReserve = initialEconomyState.energy;
    const initialUpgradeCardUnits = initialEconomyState.usefulCardUnits;
    const initialRoute = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: initialEconomyState.normalDraws || 0,
      routeEconomyInstalls: initialEconomyState.installs || 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: initialEconomyState.energySpent || 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      baseCost: 0,
      checkpointIndex: 0,
      checkpointHits: [],
      actionHistory: []
    };
    const initialStateKey = getFullCourseSearchStateKey(
      initialState,
      0,
      0,
      options,
      initialEnergyReserve
    );
    acceptStateLabel(initialStateKey, 0, 1);
    queue.push(createFullCourseQueueEntry(initialRoute, flags, options));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getFullCourseSearchStateKey(
      current.finalState,
      current.actions,
      current.checkpointIndex,
      options,
      current.routeEnergyShadowReserve
    );
    if (!stateLabelStillActive(currentStateId, current.baseCost)) continue;

    if (current.checkpointIndex >= flags.length) {
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const finalGoal = flags.at(-1);
      const completedRoute = {
        ...current,
        transitions,
        path: timeline,
        hitTarget: current.checkpointHits.at(-1)?.position ?? finalGoal
      };
      const routeScore = scoreRoute(completedRoute, finalGoal, tileMap, options);
      if ((options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) && routeTouchesPit(tileMap, { path: timeline })) {
        continue;
      }
      completed.push({
        path: timeline,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        checkpointHits: current.checkpointHits,
        actionHistory: current.actionHistory,
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? getInitialRouteEnergyShadowReserve(options),
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        fullCourse: true,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) continue;

    const currentTarget = getFullCourseTarget(flags, current.checkpointIndex, current.actions, options);
    for (const action of ACTIONS) {
      const cardEvaluation = evaluateProgramAction(
        current.actionHistory,
        current.actions,
        action.id,
        options
      );
      if (!cardEvaluation.feasible) {
        continue;
      }
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal: currentTarget,
        registerIndex: current.actions % REGISTER_COUNT
      });
      if (transition.crashed || transition.blocked) continue;

      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 0.25 : action.id === "FORWARD_3" ? 0.75 : 0;
      const scarceReusePenalty = cardEvaluation.penalty;
      const conveyorComplexity = scoreTransitionConveyorComplexity(transition, currentTarget);
      const nextActionHistory = getProgramHistoryWindow([...current.actionHistory, action.id]);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(nextActionCount)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        const energyStep = getRouteEnergyShadowStep(
          tileMap,
          destination,
          action.id,
          nextActionCount,
          current.routeEnergyShadowReserve,
          current.routeUpgradeCardShadowUnits,
          options
        );
        const energyEconomyRewardScore = energyStep.rewardScore;
        const batteryEconomyRewardScore = energyStep.batteryRewardScore;
        const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
        const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;
        let nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          routeEnergyEconomyRewardScore: (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
          batteryEconomyRewardScore: (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
          powerUpEconomyRewardScore: (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
          chopShopEconomyRewardScore: (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
          routeEnergyShadowReserve: energyStep.reserveAfter,
          routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
          routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
          routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
          routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
          routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
          routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
          routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
          chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
          chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + weightedDistance(transition.distance, transition.forcedDistance) + actionPenalty + reversePenalty + heavyMovePenalty + scarceReusePenalty + conveyorComplexity - energyEconomyRewardScore,
          checkpointIndex: current.checkpointIndex,
          checkpointHits: current.checkpointHits,
          actionHistory: nextActionHistory
        };

        if (fullCourseRouteReachesNextCheckpoint(nextRoute, flags, options)) {
          const hit = makeCheckpointHit(nextRoute, flags, options);
          nextRoute = {
            ...nextRoute,
            checkpointIndex: nextRoute.checkpointIndex + 1,
            checkpointHits: [...nextRoute.checkpointHits, hit]
          };
        }

        const nextStateKey = getFullCourseSearchStateKey(
          nextRoute.finalState,
          nextActionCount,
          nextRoute.checkpointIndex,
          options,
          nextRoute.routeEnergyShadowReserve
        );
        const stateLabelLimit = (
          options.diverseStateLabelsAfterFirstCheckpoint &&
          nextRoute.checkpointIndex >= 1
        )
          ? maxStateLabels
          : 1;
        if (!acceptStateLabel(nextStateKey, nextRoute.baseCost, stateLabelLimit)) continue;
        queue.push(createFullCourseQueueEntry(nextRoute, flags, options));
      }
    }
  }

  recordRouteSearchTelemetry("full-course", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: flags.length ? { x: flags.at(-1).x, y: flags.at(-1).y } : null
  });
  return completed;
}

function getMetricDelta(end, start, key) {
  return Number(((end?.[key] ?? 0) - (start?.[key] ?? 0)).toFixed(2));
}

function sliceFullCourseRoute(fullRoute, legIndex, flags) {
  const hit = fullRoute.checkpointHits?.[legIndex];
  if (!hit) {
    return null;
  }

  const previousHit = legIndex > 0 ? fullRoute.checkpointHits[legIndex - 1] : null;
  const startAction = previousHit?.action ?? 0;
  const endAction = hit.action;
  const startState = previousHit?.state ?? fullRoute.initialState ?? fullRoute.path?.[0] ?? fullRoute.finalState;
  const transitions = (fullRoute.transitions || []).slice(startAction, endAction);
  const path = buildTimeline(transitions, startState);
  const actionCount = Math.max(0, endAction - startAction);
  const metricStart = previousHit ?? {
    distance: 0,
    forcedDistance: 0,
    hazard: 0,
    rebootPenalty: 0,
    baseCost: 0,
    routeEnergyEconomyRewardScore: 0,
    batteryEconomyRewardScore: 0,
    powerUpEconomyRewardScore: 0,
    chopShopEconomyRewardScore: 0,
    routeEnergyShadowReserve: fullRoute.routeEnergyShadowReserveStart ?? null,
    routeUpgradeCardShadowUnits: fullRoute.routeUpgradeCardShadowUnitsStart ?? null
  };
  const distance = getMetricDelta(hit, metricStart, "distance");
  const forcedDistance = getMetricDelta(hit, metricStart, "forcedDistance");
  const hazard = getMetricDelta(hit, metricStart, "hazard");
  const rebootPenalty = getMetricDelta(hit, metricStart, "rebootPenalty");
  const baseCost = getMetricDelta(hit, metricStart, "baseCost");
  const routeEnergyEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "routeEnergyEconomyRewardScore"
  );
  const batteryEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "batteryEconomyRewardScore"
  );
  const powerUpEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "powerUpEconomyRewardScore"
  );
  const chopShopEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "chopShopEconomyRewardScore"
  );
  const goal = flags[legIndex];

  return {
    path,
    transitions,
    finalState: hit.state,
    initialState: startState,
    hitTarget: hit.position,
    movingTarget: hit.movingTarget,
    checkpointHit: hit,
    actions: actionCount,
    absoluteStartAction: startAction,
    absoluteActions: hit.action,
    distance,
    forcedDistance,
    hazard,
    rebootPenalty,
    rebootCount: transitions.filter((transition) => transition.rebooted).length,
    conveyorComplexity: scoreConveyorComplexity({ transitions }, hit.position ?? goal),
    score: baseCost,
    routeEnergyEconomyRewardScore,
    batteryEconomyRewardScore,
    powerUpEconomyRewardScore,
    chopShopEconomyRewardScore,
    routeEnergyShadowReserveStart: metricStart.routeEnergyShadowReserve ?? fullRoute.routeEnergyShadowReserveStart ?? null,
    routeEnergyShadowReserveEnd: hit.routeEnergyShadowReserve ?? fullRoute.routeEnergyShadowReserveEnd ?? null,
    routeUpgradeCardShadowUnitsStart: metricStart.routeUpgradeCardShadowUnits ?? fullRoute.routeUpgradeCardShadowUnitsStart ?? null,
    routeUpgradeCardShadowUnitsEnd: hit.routeUpgradeCardShadowUnits ?? fullRoute.routeUpgradeCardShadowUnitsEnd ?? null,
    goalReached: true,
    fullCourseLeg: true
  };
}


function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeLegTrafficScale(playerCount) {
  if (playerCount <= 1) {
    return 0;
  }

  return Number(clamp((playerCount - 1) / 7, 0, 1).toFixed(3));
}

function stdDev(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function buildTileSet(route, goal) {
  const goalKey = tileKey(goal.x, goal.y);
  const cachedByGoal = ROUTE_TILE_SET_CACHE.get(route);
  if (cachedByGoal?.has(goalKey)) {
    return cachedByGoal.get(goalKey);
  }

  const set = new Set();

  route.path.forEach((point, index) => {
    const isGoal = point.x === goal.x && point.y === goal.y;
    if (index === route.path.length - 1 && isGoal) {
      return;
    }
    set.add(tileKey(point.x, point.y));
  });

  if (cachedByGoal) {
    cachedByGoal.set(goalKey, set);
  } else {
    ROUTE_TILE_SET_CACHE.set(route, new Map([[goalKey, set]]));
  }

  return set;
}

function buildEdgeSet(route) {
  const cached = ROUTE_EDGE_SET_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const set = new Set();

  for (let index = 1; index < route.path.length; index += 1) {
    const from = route.path[index - 1];
    const to = route.path[index];
    if (to.jump) {
      continue;
    }
    set.add(`${tileKey(from.x, from.y)}>${tileKey(to.x, to.y)}`);
  }

  ROUTE_EDGE_SET_CACHE.set(route, set);
  return set;
}

function hasLineOfSight(tileMap, from, to) {
  const fromKey = tileKey(from.x, from.y);
  const toKey = tileKey(to.x, to.y);
  const pairKey = fromKey <= toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
  let cache = LINE_OF_SIGHT_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    LINE_OF_SIGHT_CACHE.set(tileMap, cache);
  } else if (cache.has(pairKey)) {
    return cache.get(pairKey);
  }

  if (from.x !== to.x && from.y !== to.y) {
    cache.set(pairKey, false);
    return false;
  }

  let elevation = 0;
  let maxElevation = 0;

  if (from.x === to.x) {
    const dir = to.y > from.y ? "S" : "N";
    const step = to.y > from.y ? 1 : -1;

    for (let y = from.y; y !== to.y; y += step) {
      const fromTile = tileMap.get(tileKey(from.x, y));
      const toTile = tileMap.get(tileKey(from.x, y + step));
      if (!canMoveBetween(tileMap, { x: from.x, y }, { x: from.x, y: y + step }, dir).ok) {
        cache.set(pairKey, false);
        return false;
      }

      if (crossesLedgeBoundary(fromTile, toTile, dir)) {
        elevation += getLedgeElevationDelta(fromTile, toTile, dir);
        maxElevation = Math.max(maxElevation, elevation);
      }
    }

    const visible = elevation === 0 && maxElevation <= 0;
    cache.set(pairKey, visible);
    return visible;
  }

  const dir = to.x > from.x ? "E" : "W";
  const step = to.x > from.x ? 1 : -1;

  for (let x = from.x; x !== to.x; x += step) {
    const fromTile = tileMap.get(tileKey(x, from.y));
    const toTile = tileMap.get(tileKey(x + step, from.y));
    if (!canMoveBetween(tileMap, { x, y: from.y }, { x: x + step, y: from.y }, dir).ok) {
      cache.set(pairKey, false);
      return false;
    }

    if (crossesLedgeBoundary(fromTile, toTile, dir)) {
      elevation += getLedgeElevationDelta(fromTile, toTile, dir);
      maxElevation = Math.max(maxElevation, elevation);
    }
  }

  const visible = elevation === 0 && maxElevation <= 0;
  cache.set(pairKey, visible);
  return visible;
}

function getRouteDirectionAt(path, index) {
  const cached = ROUTE_DIRECTIONS_CACHE.get(path);
  if (cached) {
    return cached[index] ?? null;
  }

  const directions = new Array(path.length).fill(null);
  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const current = path[pathIndex];
    const next = path[pathIndex + 1];
    if (next && !next.jump) {
      directions[pathIndex] = directionBetween(current, next);
      continue;
    }

    const previous = path[pathIndex - 1];
    if (previous && !current.jump) {
      directions[pathIndex] = directionBetween(previous, current);
    }
  }

  ROUTE_DIRECTIONS_CACHE.set(path, directions);
  return directions[index] ?? null;
}

function getRoutePathKey(route) {
  const cached = ROUTE_PATH_KEY_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const key = route.path.map((point) => `${point.x},${point.y}${point.jump ? "j" : ""}`).join("|");
  ROUTE_PATH_KEY_CACHE.set(route, key);
  return key;
}

function getThreatOptionKey(options = {}) {
  return [
    options.setToKill ? 1 : 0,
    options.setToStun ? 1 : 0,
    options.lessSpammyGame ? 1 : 0,
    options.criticalSpam ? 1 : 0,
    options.criticalHaywire ? 1 : 0,
    options.permanentShutdown ? 1 : 0
  ].join("");
}

function isBehindAlongDir(lead, trailing, dir) {
  if (dir === "N") return trailing.x === lead.x && trailing.y > lead.y;
  if (dir === "E") return trailing.y === lead.y && trailing.x < lead.x;
  if (dir === "S") return trailing.x === lead.x && trailing.y < lead.y;
  if (dir === "W") return trailing.y === lead.y && trailing.x > lead.x;
  return false;
}

function getRobotLaserThreatMultipliers(options = {}) {
  let lateral = 1;
  let rear = 1;
  let frontal = 1;
  const damagePressure = getDamageDeckPressureMultipliers(options);

  if (options.setToKill) {
    lateral *= 1.18;
    rear *= 1.35;
    frontal *= 1.25;
  }
  if (options.setToStun) {
    lateral *= 0.65;
    rear *= 0.45;
    frontal *= 0.55;
  }

  lateral *= damagePressure.robotTraffic;
  rear *= damagePressure.robotTraffic;
  frontal *= damagePressure.robotTraffic;

  return { lateral, rear, frontal };
}

function getTrafficPath(route) {
  return route?.trafficPath ?? route?.path ?? [];
}

function getTrafficRouteKey(route) {
  const path = getTrafficPath(route);
  return path.map((point) => `${point.x},${point.y}${point.jump ? "!" : ""}`).join("|");
}

function applyTrafficGraceToRoute(route, graceRegisters = 0) {
  if (!route || graceRegisters <= 0 || !Array.isArray(route.transitions)) {
    return route;
  }

  const absoluteStartAction = route.absoluteStartAction ?? 0;
  const skipCount = Math.max(0, Math.min(
    route.transitions.length,
    graceRegisters - absoluteStartAction
  ));

  if (skipCount <= 0) {
    route.trafficPath = route.path;
    return route;
  }

  if (skipCount >= route.transitions.length) {
    route.trafficPath = [];
    return route;
  }

  const startState = route.transitions[skipCount - 1]?.to ?? route.initialState;
  route.trafficPath = buildTimeline(route.transitions.slice(skipCount), startState);
  return route;
}

function lateralThreatPenalty(tileMap, routeA, routeB, options = {}) {
  if (!routeA || !routeB) {
    return 0;
  }

  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${getThreatOptionKey(options)}`;
  if (LATERAL_THREAT_CACHE.has(cacheKey)) {
    return LATERAL_THREAT_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const { lateral: multiplier } = getRobotLaserThreatMultipliers(options);

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];

    for (let indexB = Math.max(0, indexA - 1); indexB <= Math.min(pathB.length - 1, indexA + 1); indexB += 1) {
      const pointB = pathB[indexB];

      if (pointA.x === pointB.x && pointA.y === pointB.y) {
        continue;
      }

      if (pointA.x !== pointB.x && pointA.y !== pointB.y) {
        continue;
      }

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 4) {
        continue;
      }

      if (!hasLineOfSight(tileMap, pointA, pointB)) {
        continue;
      }

      const timeDelta = Math.abs(indexA - indexB);
      const distanceWeight = distance === 1 ? 1 : distance === 2 ? 0.72 : distance === 3 ? 0.48 : 0.28;
      const timeWeight = timeDelta === 0 ? 0.72 : 0.34;
      penalty += 2.2 * distanceWeight * timeWeight * multiplier;
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(LATERAL_THREAT_CACHE, cacheKey, rounded);
  return rounded;
}

function rearThreatPenalty(tileMap, routeA, routeB, options = {}) {
  if (!routeA || !routeB) {
    return 0;
  }

  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${getThreatOptionKey(options)}`;
  if (REAR_THREAT_CACHE.has(cacheKey)) {
    return REAR_THREAT_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const { rear: multiplier } = getRobotLaserThreatMultipliers(options);

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];
    const dirA = getRouteDirectionAt(pathA, indexA);
    if (!dirA || pointA.jump) {
      continue;
    }

    for (let indexB = Math.max(0, indexA - 2); indexB <= Math.min(pathB.length - 1, indexA + 2); indexB += 1) {
      const pointB = pathB[indexB];
      const dirB = getRouteDirectionAt(pathB, indexB);
      if (!dirB || pointB.jump || dirA !== dirB) {
        continue;
      }

      if (!isBehindAlongDir(pointA, pointB, dirA)) {
        continue;
      }

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 4) {
        continue;
      }

      if (!hasLineOfSight(tileMap, pointA, pointB)) {
        continue;
      }

      const timeDelta = Math.abs(indexA - indexB);
      const distanceWeight = distance === 1 ? 1.5 : distance === 2 ? 1.15 : distance === 3 ? 0.8 : 0.5;
      const timeWeight = timeDelta === 0 ? 1 : timeDelta === 1 ? 0.72 : 0.45;
      penalty += 4.2 * distanceWeight * timeWeight * multiplier;
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(REAR_THREAT_CACHE, cacheKey, rounded);
  return rounded;
}

function routeSimilarity(routeA, routeB, goal) {
  const goalKey = tileKey(goal.x, goal.y);
  const cacheKey = `${getRoutePathKey(routeA)}|${getRoutePathKey(routeB)}|${goalKey}`;
  const reverseKey = `${getRoutePathKey(routeB)}|${getRoutePathKey(routeA)}|${goalKey}`;
  if (ROUTE_SIMILARITY_CACHE.has(cacheKey)) {
    return ROUTE_SIMILARITY_CACHE.get(cacheKey);
  }
  if (ROUTE_SIMILARITY_CACHE.has(reverseKey)) {
    return ROUTE_SIMILARITY_CACHE.get(reverseKey);
  }

  const tilesA = buildTileSet(routeA, goal);
  const tilesB = buildTileSet(routeB, goal);

  if (!tilesA.size && !tilesB.size) {
    return 1;
  }

  let sharedTiles = 0;
  for (const tile of tilesA) {
    if (tilesB.has(tile)) {
      sharedTiles += 1;
    }
  }

  const tileUnion = new Set([...tilesA, ...tilesB]).size;
  const tileScore = tileUnion ? sharedTiles / tileUnion : 0;

  const edgesA = buildEdgeSet(routeA);
  const edgesB = buildEdgeSet(routeB);
  let sharedEdges = 0;
  for (const edge of edgesA) {
    if (edgesB.has(edge)) {
      sharedEdges += 1;
    }
  }
  const edgeUnion = new Set([...edgesA, ...edgesB]).size;
  const edgeScore = edgeUnion ? sharedEdges / edgeUnion : 0;

  const similarity = (tileScore * 0.65) + (edgeScore * 0.35);
  setBoundedCacheValue(ROUTE_SIMILARITY_CACHE, cacheKey, similarity);
  return similarity;
}

function dedupeRoutes(routes) {
  const seen = new Set();
  const out = [];

  for (const route of routes) {
    const key = getRoutePathKey(route);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }

  return out;
}

function selectDistinctRoutes(routes, goal, limit = 4) {
  const distinct = [];

  for (const route of routes) {
    const tooSimilar = distinct.some((candidate) => routeSimilarity(route, candidate, goal) >= 0.72);
    if (!tooSimilar) {
      distinct.push(route);
    }

    if (distinct.length >= limit) {
      break;
    }
  }

  return distinct;
}

// Cheap Any/Any traffic alternatives use the completion pool the search already
// found; they do not increase expansion caps. Keep the best route, then retain
// one meaningfully different route within the same score allowance used by the
// contextual stitched beam. The ordinary route selector remains stricter.
function selectContextualTrafficAlternativeRoutes(routes, goal, limit = 2) {
  const sorted = [...(routes || [])].filter(Boolean).sort(
    (left, right) => left.score - right.score
  );
  if (!sorted.length || limit <= 0) return [];
  const best = sorted[0];
  if (limit === 1 || sorted.length === 1) return [best];

  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.slice(1).filter(
    (candidate) => candidate.score <= best.score + scoreAllowance
  );
  let diverse = null;
  let diverseNovelty = -1;
  for (const candidate of eligible) {
    const novelty = 1 - routeSimilarity(best, candidate, goal);
    if (
      novelty > diverseNovelty + 0.001 ||
      (
        Math.abs(novelty - diverseNovelty) <= 0.001 &&
        candidate.score < (diverse?.score ?? Infinity)
      )
    ) {
      diverse = candidate;
      diverseNovelty = novelty;
    }
  }

  return diverse && diverseNovelty >= 0.1
    ? [best, diverse].sort((left, right) => left.score - right.score)
    : [best];
}

function averagePairwiseOverlap(routes, goal) {
  if (routes.length <= 1) {
    return 0;
  }

  const values = [];

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      values.push(routeSimilarity(routes[i], routes[j], goal));
    }
  }

  return average(values);
}

function averageCrossLegOverlap(routes, previousLegRoutes, goal) {
  if (!routes.length || !previousLegRoutes.length) {
    return 0;
  }

  const values = [];
  for (const route of routes) {
    for (const previous of previousLegRoutes) {
      values.push(routeSimilarity(route, previous, goal));
    }
  }

  return average(values);
}

function averagePairwiseThreat(tileMap, routes, options = {}) {
  if (routes.length <= 1) {
    return 0;
  }

  const values = [];

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      values.push(
        lateralThreatPenalty(tileMap, routes[i], routes[j], options) +
        rearThreatPenalty(tileMap, routes[i], routes[j], options) * 0.45 +
        rearThreatPenalty(tileMap, routes[j], routes[i], options) * 0.12
      );
    }
  }

  return average(values);
}

function averageCrossLegThreat(tileMap, routes, previousLegRoutes, options = {}) {
  if (!routes.length || !previousLegRoutes.length) {
    return 0;
  }

  const values = [];
  for (const route of routes) {
    for (const previous of previousLegRoutes) {
      values.push(
        lateralThreatPenalty(tileMap, route, previous, options) +
        rearThreatPenalty(tileMap, route, previous, options) * 0.45 +
        rearThreatPenalty(tileMap, previous, route, options) * 0.12
      );
    }
  }

  return average(values);
}

export function analyzeGoalApproaches(tileMap, goal, options = {}) {
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const approaches = [
    { side: "N", from: { x: goal.x, y: goal.y - 1 }, dir: "S" },
    { side: "E", from: { x: goal.x + 1, y: goal.y }, dir: "W" },
    { side: "S", from: { x: goal.x, y: goal.y + 1 }, dir: "N" },
    { side: "W", from: { x: goal.x - 1, y: goal.y }, dir: "E" }
  ].map((approach) => {
    const fromTile = tileMap.get(tileKey(approach.from.x, approach.from.y));
    const move = canMoveBetween(tileMap, approach.from, goal, approach.dir, options);

    return {
      ...approach,
      exists: Boolean(fromTile),
      pit: isPit(fromTile),
      open: move.ok
    };
  });

  const openSides = approaches.filter((approach) => approach.open).map((approach) => approach.side);
  const blockedSides = approaches.filter((approach) => !approach.open).map((approach) => approach.side);
  const adjacentPairs = [
    ["N", "E"],
    ["E", "S"],
    ["S", "W"],
    ["W", "N"]
  ];
  const blockedSet = new Set(blockedSides);
  const trappedCorners = adjacentPairs.filter(([left, right]) => blockedSet.has(left) && blockedSet.has(right)).length;

  return {
    openCount: openSides.length,
    blockedCount: blockedSides.length,
    trappedCorners,
    blockedByPit: approaches.filter((approach) => approach.pit).length,
    blockedByVoid: lessDeadlyGame ? 0 : approaches.filter((approach) => !approach.exists).length
  };
}

function beltLeadsToGoal(tileMap, start, goal, options = {}) {
  const visited = new Set();
  let current = { x: start.x, y: start.y };

  for (let step = 0; step < 12; step += 1) {
    const key = tileKey(current.x, current.y);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);

    const tile = tileMap.get(key);
    const belt = getBelt(tile);
    if (!belt?.dir || !DIRS[belt.dir]) {
      return false;
    }

    const next = {
      x: current.x + DIRS[belt.dir].dx,
      y: current.y + DIRS[belt.dir].dy
    };
    const move = canMoveBetween(tileMap, current, next, belt.dir, options);
    if (!move.ok) {
      return false;
    }
    if (next.x === goal.x && next.y === goal.y) {
      return true;
    }

    current = next;
  }

  return false;
}

export function scoreFlagArea(tileMap, goal, options = {}) {
  let score = 0;
  const playerCount = options.playerCount ?? 1;
  const trafficScale = playerCount <= 1 ? 0 : Math.min(1, (playerCount - 1) / 3);
  const approaches = analyzeGoalApproaches(tileMap, goal, options);
  const blockedApproachScore = approaches.blockedCount * (
    FLAG_APPROACH_WEIGHTS.blockedSideBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.blockedSideTraffic
  );
  const approachCompression = Math.max(0, 3 - approaches.openCount);

  if (approaches.openCount <= 1) {
    score += FLAG_APPROACH_WEIGHTS.singleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.singleOpenTraffic;
  } else if (approaches.openCount === 2) {
    score += FLAG_APPROACH_WEIGHTS.doubleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.doubleOpenTraffic;
  }

  score += blockedApproachScore;
  score += approachCompression * approachCompression * (
    FLAG_APPROACH_WEIGHTS.approachCompressionBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.approachCompressionTraffic
  );
  score += approaches.trappedCorners * (
    FLAG_APPROACH_WEIGHTS.trappedCornerBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.trappedCornerTraffic
  );
  score += approaches.blockedByPit * FLAG_APPROACH_WEIGHTS.blockedByPit;
  score += approaches.blockedByVoid * FLAG_APPROACH_WEIGHTS.blockedByVoid;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = goal.x + dx;
      const y = goal.y + dy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 2) continue;

      const tile = tileMap.get(tileKey(x, y));
      if (!tile) continue;

      for (const feature of tile.features || []) {
        const featureScore = getFlagAreaFeatureScore(feature, dist, {
          batteryActive: isBatteryActive(options),
          cuttingFloor: options.cuttingFloor,
          flamingOil: options.flamingOil,
          repulsorOverdrive: options.repulsorOverdrive,
          upgradeWorld: options.upgradeWorld,
          lessSpammyGame: options.lessSpammyGame,
          criticalSpam: options.criticalSpam,
          criticalHaywire: options.criticalHaywire,
          permanentShutdown: options.permanentShutdown
        });
        if (feature.type === "belt" && beltLeadsToGoal(tileMap, { x, y }, goal, options)) {
          score -= featureScore;
          continue;
        }

        score += featureScore;
      }
    }
  }

  return Number(Math.max(0, score).toFixed(2));
}

function assignRoutesWithOverlap(tileMap, startAnalyses, goal, activeIndices = null, options = {}) {
  const selections = startAnalyses.map(() => 0);
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const playerCount = Math.max(1, options.playerCount ?? activeAnalyses.length);

  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;

    for (let index = 0; index < startAnalyses.length; index += 1) {
      const analysis = startAnalyses[index];
      if (!analysis.routes.length || !activeSet.has(analysis.index)) {
        continue;
      }

      const occupancyByIndex = buildConditionalOccupancyMap(
        activeAnalyses,
        analysis.index,
        playerCount,
        options,
        (other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return other.routes[selections[otherIndex] ?? 0];
        }
      );

      const otherRouteEntries = activeAnalyses
        .filter((other) => other.index !== analysis.index)
        .map((other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return {
            route: other.routes[selections[otherIndex] ?? 0],
            occupancyWeight: occupancyByIndex.get(other.index) ?? 0
          };
        })
        .filter((entry) => entry.route && entry.occupancyWeight > 0);

      let bestRouteIndex = selections[index];
      let bestAdjusted = Infinity;

      analysis.routes.forEach((route, routeIndex) => {
        const traffic = getExpectedTrafficBreakdown(
          tileMap,
          route,
          otherRouteEntries,
          [goal],
          {
            ...options,
            singleLegTraffic: true
          }
        );

        const adjusted = route.score + traffic.total;
        if (adjusted < bestAdjusted) {
          bestAdjusted = adjusted;
          bestRouteIndex = routeIndex;
        }
      });

      if (bestRouteIndex !== selections[index]) {
        selections[index] = bestRouteIndex;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return selections;
}
function selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, activeIndices = null, options = {}) {
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const routeCapableStarts = activeAnalyses.length;
  const trafficScale = routeCapableStarts > 1
    ? Math.min(1, Math.max(0, (playerCount - 1) / (routeCapableStarts - 1)))
    : 0;

  if (options.skipTraffic) {
    startAnalyses.forEach((analysis) => {
      const selectedRoute = analysis.routes[0] ?? null;
      analysis.selectedRouteIndex = 0;
      analysis.selectedRoute = selectedRoute;
      analysis.bestScore = selectedRoute?.score ?? Infinity;
      analysis.bestDistance = selectedRoute?.distance ?? Infinity;
      analysis.bestActions = selectedRoute?.actions ?? Infinity;
      if (!selectedRoute) {
        analysis.overlapPenalty = Infinity;
        analysis.lateralThreat = Infinity;
        analysis.rearThreat = Infinity;
        analysis.routeThreat = Infinity;
        analysis.trafficRanged = Infinity;
        analysis.trafficNearby = Infinity;
        analysis.trafficCompetition = Infinity;
        analysis.trafficScale = 0;
        analysis.trafficPenalty = Infinity;
        analysis.adjustedScore = Infinity;
        return;
      }
      analysis.overlapPenalty = 0;
      analysis.lateralThreat = 0;
      analysis.rearThreat = 0;
      analysis.routeThreat = 0;
      analysis.trafficRanged = 0;
      analysis.trafficNearby = 0;
      analysis.trafficCompetition = 0;
      analysis.trafficScale = 0;
      analysis.trafficPenalty = 0;
      analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
      analysis.adjustedScore = Number((
        analysis.bestScore + analysis.courseScoreAdjustment
      ).toFixed(2));
    });
    return { activeSet, trafficScale: 0 };
  }

  const selectedRouteIndices = assignRoutesWithOverlap(
    tileMap,
    startAnalyses,
    goal,
    activeSet,
    {
      ...options,
      playerCount
    }
  );

  startAnalyses.forEach((analysis, index) => {
    const selectedIndex = selectedRouteIndices[index] ?? 0;
    const selectedRoute = analysis.routes[selectedIndex] ?? null;
    analysis.selectedRouteIndex = selectedIndex;
    analysis.selectedRoute = selectedRoute;
    analysis.bestScore = selectedRoute?.score ?? Infinity;
    analysis.bestDistance = selectedRoute?.distance ?? Infinity;
    analysis.bestActions = selectedRoute?.actions ?? Infinity;
  });

  startAnalyses.forEach((analysis) => {
    if (!analysis.selectedRoute) {
      analysis.overlapPenalty = Infinity;
      analysis.lateralThreat = Infinity;
      analysis.rearThreat = Infinity;
      analysis.routeThreat = Infinity;
      analysis.trafficRanged = Infinity;
      analysis.trafficNearby = Infinity;
      analysis.trafficCompetition = Infinity;
      analysis.trafficScale = trafficScale;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
      return;
    }

    const occupancyByIndex = buildConditionalOccupancyMap(
      activeAnalyses,
      analysis.index,
      playerCount,
      options,
      (other) => other.selectedRoute
    );
    const otherRouteEntries = activeAnalyses
      .filter((other) => other.index !== analysis.index && other.selectedRoute)
      .map((other) => ({
        route: other.selectedRoute,
        occupancyWeight: occupancyByIndex.get(other.index) ?? 0
      }))
      .filter((entry) => entry.occupancyWeight > 0);

    const traffic = getExpectedTrafficBreakdown(
      tileMap,
      analysis.selectedRoute,
      otherRouteEntries,
      [goal],
      {
        ...options,
        playerCount,
        singleLegTraffic: true
      }
    );

    analysis.trafficRanged = traffic.ranged;
    analysis.trafficNearby = traffic.nearby;
    analysis.trafficCompetition = traffic.competition;

    // Keep legacy fields populated for older report/diagnostic consumers.
    analysis.overlapPenalty = traffic.competition;
    analysis.lateralThreat = traffic.nearby;
    analysis.rearThreat = traffic.ranged;
    analysis.routeThreat = Number((traffic.ranged + traffic.nearby).toFixed(2));
    analysis.trafficScale = trafficScale;
    analysis.trafficPenalty = traffic.total;
    analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
    analysis.adjustedScore = Number((
      analysis.bestScore +
      analysis.trafficPenalty +
      analysis.courseScoreAdjustment
    ).toFixed(2));
  });

  return {
    activeSet,
    trafficScale
  };
}
function summarizeFirstLegAnalyses(tileMap, startAnalyses, goal, flags, playerCount, options = {}, outlierSet = new Set(), outlierDiagnostics = new Map()) {
  const reachable = startAnalyses.filter((item) => item.reachable && item.selectedRoute);
  const activeReachable = reachable.filter((item) => !outlierSet.has(item.index));
  const adjustedScores = activeReachable.map((item) => item.adjustedScore);
  const distances = activeReachable.map((item) => item.bestDistance);
  const actions = activeReachable.map((item) => item.bestActions);
  const trafficPenaltyValues = activeReachable.map((item) => item.trafficPenalty);
  const overlapValues = activeReachable.map((item) => item.overlapPenalty);
  const lateralThreatValues = activeReachable.map((item) => item.lateralThreat);
  const rearThreatValues = activeReachable.map((item) => item.rearThreat);
  const scoreMean = average(adjustedScores);
  const scoreStdDev = stdDev(adjustedScores);
  const distanceMean = average(distances);
  const actionMean = average(actions);
  const trafficPenaltyMean = average(trafficPenaltyValues);
  const overlapMean = average(overlapValues);
  const lateralThreatMean = average(lateralThreatValues);
  const rearThreatMean = average(rearThreatValues);
  const flagAreaScore = scoreFlagArea(tileMap, goal, {
    playerCount,
    lessDeadlyGame: options.lessDeadlyGame
  });
  const outliers = reachable
    .filter((item) => outlierSet.has(item.index))
    .map((item) => ({
      index: item.index,
      score: item.adjustedScore,
      delta: Number((item.adjustedScore - scoreMean).toFixed(2)),
      actionDelta: Number((item.bestActions - actionMean).toFixed(2)),
      reasons: outlierDiagnostics.get(item.index) ?? null
    }));
  const difficultyScore = Number(scoreMean.toFixed(2));
  const lengthScore = Number(distanceMean.toFixed(2));
  const actionScore = Number(actionMean.toFixed(2));
  const overlapScore = Number(Math.max(0, 100 - overlapMean * 9).toFixed(2));
  const fairnessScore = Number(Math.max(0, 100 - scoreStdDev * 4).toFixed(2));
  const overallScore = Number(
    Math.min(
      100,
      difficultyScore * 0.45 +
      lengthScore * 1 +
      actionScore * 1.2 +
      flagAreaScore * 0.9 +
      (100 - fairnessScore) * 0.12 +
      (100 - overlapScore) * 0.18
    ).toFixed(2)
  );

  return {
    reachable,
    activeReachable,
    scoreMean,
    scoreStdDev,
    actionMean,
    summary: {
      flagCount: flags.length,
      flagAreaScore,
      reachableStarts: reachable.length,
      totalStarts: startAnalyses.length,
      averageTrafficPenalty: Number(trafficPenaltyMean.toFixed(2)),
      averageOverlapPenalty: Number(overlapMean.toFixed(2)),
      averageLateralThreat: Number(lateralThreatMean.toFixed(2)),
      averageRearThreat: Number(rearThreatMean.toFixed(2)),
      difficultyScore,
      lengthScore,
      actionScore,
      overlapScore,
      fairnessScore,
      scoreStdDev: Number(scoreStdDev.toFixed(2)),
      outliers,
      overallScore
    }
  };
}

export function analyzeCourse(tileMap, starts, goal, options = {}) {
  const maxRoutes = options.maxRoutes ?? 4;
  const flags = options.flags ?? [goal];
  const playerCount = options.playerCount ?? starts.length;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const explicitRequiredReachable = Number(options.requiredReachableStarts);
  const requiredReachableStarts = Number.isFinite(explicitRequiredReachable)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredReachable)))
    : null;
  const explicitPreferredReachable = Number(options.preferredReachableStarts);
  const preferredReachableStarts = Number.isFinite(explicitPreferredReachable)
    ? Math.max(
      requiredReachableStarts ?? 1,
      Math.min(starts.length, Math.floor(explicitPreferredReachable))
    )
    : null;
  const stopWhenPreferredLost = Boolean(
    options.stopWhenPreferredReachableLost &&
    requiredReachableStarts &&
    preferredReachableStarts
  );
  const startAnalyses = [];
  let reachableSoFar = 0;
  let unresolvedSoFar = 0;
  let stoppedForPreferredCapacity = false;

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const sharedRouteOptions = {
      maxRoutes,
      maxActions: options.maxActions,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
      routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
      routeEnergyRegisterScore: options.routeEnergyRegisterScore,
      routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
      startingEnergy: options.startingEnergy,
      startingUpgradeCards: options.startingUpgradeCards,
      maxEnergy: options.maxEnergy,
      upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
      upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
      upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
      upgradeUsefulCardRate: options.upgradeUsefulCardRate,
      upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
      upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
      routeRegistersPerTurn: options.routeRegistersPerTurn,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations,
      playerCount,
      rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      portalMap
    };
    const rawRoutes = options.physicalTimingOnly
      ? enumeratePhysicalTimingLegTemplates(
        tileMap,
        {
          state: { x: start.x, y: start.y, facing: start.facing ?? "E" },
          absoluteActions: Number(options.absoluteActions) || 0,
          history: [],
          energyReserve: getInitialRouteEnergyShadowReserve(sharedRouteOptions),
          hazardExposure: 0
        },
        goal,
        {
          ...sharedRouteOptions,
          contextualTelemetryKind: options.physicalTelemetryKind ?? "physical-opening-sketch",
          optionalTemplateExpansions: options.optionalTemplateExpansions ?? 80
        }
      )
      : enumerateRoutes(tileMap, start, goal, sharedRouteOptions);
    const routeSearchMeta = rawRoutes.searchMeta ?? rawRoutes.contextualSearchMeta ?? null;
    const routes = dedupeRoutes(rawRoutes)
      .sort((left, right) => left.score - right.score)
      .slice(0, maxRoutes);

    const reachable = routes.length > 0;
    const routeSearchUnresolved = Boolean(
      !reachable && (
        routeSearchMeta?.zeroRouteCapFailure ||
        routeSearchMeta?.zeroRouteHorizonFailure
      )
    );
    if (reachable) reachableSoFar += 1;
    if (routeSearchUnresolved) unresolvedSoFar += 1;
    startAnalyses.push({
      index: sourceIndex,
      start,
      reachable,
      routes,
      routeSearchMeta,
      routeSearchUnresolved
    });

    const remaining = starts.length - index - 1;
    const maximumPossibleReachable = reachableSoFar + unresolvedSoFar + remaining;
    if (
      requiredReachableStarts &&
      maximumPossibleReachable < requiredReachableStarts
    ) {
      break;
    }
    if (
      stopWhenPreferredLost &&
      reachableSoFar >= requiredReachableStarts &&
      maximumPossibleReachable < preferredReachableStarts
    ) {
      stoppedForPreferredCapacity = true;
      break;
    }
  }

  // Preserve source indices for skipped starts without pretending they were
  // searched. This lets callers distinguish unresolved capacity from a proven
  // zero-route result while still short-circuiting doomed batches.
  if (startAnalyses.length < starts.length) {
    for (let index = startAnalyses.length; index < starts.length; index += 1) {
      const start = starts[index];
      startAnalyses.push({
        index: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index,
        start,
        reachable: false,
        routes: [],
        capacityUnresolved: true
      });
    }
  }

  if (options.skipTraffic) {
    startAnalyses.forEach((analysis) => {
      const selectedRoute = analysis.routes[0] ?? null;
      analysis.selectedRouteIndex = 0;
      analysis.selectedRoute = selectedRoute;
      analysis.bestScore = selectedRoute?.score ?? Infinity;
      analysis.bestDistance = selectedRoute?.distance ?? Infinity;
      analysis.bestActions = selectedRoute?.actions ?? Infinity;
      analysis.overlapPenalty = selectedRoute ? 0 : Infinity;
      analysis.lateralThreat = selectedRoute ? 0 : Infinity;
      analysis.rearThreat = selectedRoute ? 0 : Infinity;
      analysis.routeThreat = selectedRoute ? 0 : Infinity;
      analysis.trafficScale = 0;
      analysis.trafficPenalty = selectedRoute ? 0 : Infinity;
      analysis.courseScoreAdjustment = 0;
      analysis.adjustedScore = selectedRoute?.score ?? Infinity;
    });
  } else {
    selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, null, options);
  }

  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    goal,
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  finalSummary.summary.capacityShortCircuit = {
    active: Boolean(requiredReachableStarts),
    requiredReachableStarts,
    preferredReachableStarts,
    searchedStarts: startAnalyses.filter((entry) => !entry.capacityUnresolved).length,
    unresolvedStarts: startAnalyses.filter((entry) => (
      entry.capacityUnresolved || entry.routeSearchUnresolved
    )).length,
    cappedUnresolvedStarts: startAnalyses.filter((entry) => entry.routeSearchUnresolved).length,
    stoppedForPreferredCapacity
  };

  return {
    goal,
    starts: startAnalyses,
    summary: finalSummary.summary
  };
}

function summarizeExpectedFullCourseLegRoutes(routes, previousRoutes, goal, playerCount = 4) {
  const routeScores = routes.map((route) => route.score).filter(Number.isFinite);
  const routeDistances = routes.map((route) => route.distance).filter(Number.isFinite);
  const routeActions = routes.map((route) => route.actions).filter(Number.isFinite);
  const intraLegOverlap = averagePairwiseOverlap(routes, goal);
  const crossLegOverlap = averageCrossLegOverlap(routes, previousRoutes, goal);
  const trafficScale = routes.length > 1
    ? clamp((playerCount - 1) / Math.max(1, routes.length - 1), 0, 1)
    : 0;
  const missingRoutePenalty = Math.max(0, playerCount - routes.length) * 10;
  const diversityScore = Number(Math.max(
    0,
    routes.length * 12 - intraLegOverlap * (18 + 12 * trafficScale) - crossLegOverlap * (8 + 8 * trafficScale)
  ).toFixed(2));
  const congestionScore = Number((
    intraLegOverlap * (18 + 24 * trafficScale) +
    crossLegOverlap * (8 + 16 * trafficScale) +
    missingRoutePenalty
  ).toFixed(2));

  return {
    routeCount: routes.length,
    distinctRouteCount: routes.length,
    expectedRouteCount: routes.length,
    expectedRobotPaths: true,
    fullCourseSlices: true,
    bestRouteScore: routeScores.length ? Math.min(...routeScores) : Infinity,
    bestDistance: routeDistances.length ? Math.min(...routeDistances) : Infinity,
    averageRouteScore: Number(average(routeScores).toFixed(2)),
    averageRouteDistance: Number(average(routeDistances).toFixed(2)),
    averageRouteActions: Number(average(routeActions).toFixed(2)),
    routeSpread: routeScores.length > 1 ? Number((Math.max(...routeScores) - Math.min(...routeScores)).toFixed(2)) : 0,
    intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
    crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
    intraLegThreat: 0,
    crossLegThreat: 0,
    diversityScore,
    congestionScore
  };
}


function prepareFullCourseCandidate(route, flags) {
  if (!route) {
    return null;
  }

  const graceRegisters = 0;
  const legRoutes = flags.map((_, legIndex) => (
    applyTrafficGraceToRoute(sliceFullCourseRoute(route, legIndex, flags), graceRegisters)
  ));
  route.legRoutes = legRoutes;
  route.absoluteStartAction = 0;
  applyTrafficGraceToRoute(route, graceRegisters);
  return route;
}

function getFullCourseCorridorDiversity(routeA, routeB, flags) {
  const legsA = routeA?.legRoutes ?? [];
  const legsB = routeB?.legRoutes ?? [];
  const legCount = Math.min(flags.length, legsA.length, legsB.length);
  if (!legCount) {
    const finalGoal = flags.at(-1);
    return finalGoal ? 1 - routeSimilarity(routeA, routeB, finalGoal) : 0;
  }

  const firstComparedLeg = legCount > 1 ? 1 : 0;
  let weightedDifference = 0;
  let totalWeight = 0;
  for (let legIndex = firstComparedLeg; legIndex < legCount; legIndex += 1) {
    const legA = legsA[legIndex];
    const legB = legsB[legIndex];
    const goal = flags[legIndex];
    if (!legA || !legB || !goal) continue;
    const weight = 1 + legIndex * 0.15;
    weightedDifference += (1 - routeSimilarity(legA, legB, goal)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedDifference / totalWeight : 0;
}

function selectCorridorDiverseFullCourseRoutes(routes, flags, limit = 3) {
  if (!routes.length || limit <= 0) return [];
  const remaining = [...routes].sort((left, right) => left.score - right.score);
  const selected = [remaining.shift()];

  while (selected.length < limit && remaining.length) {
    let bestIndex = -1;
    let bestNovelty = -Infinity;
    let bestScore = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const novelty = Math.min(...selected.map((chosen) => getFullCourseCorridorDiversity(candidate, chosen, flags)));
      if (novelty > bestNovelty + 0.001 || (Math.abs(novelty - bestNovelty) <= 0.001 && candidate.score < bestScore)) {
        bestNovelty = novelty;
        bestScore = candidate.score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestNovelty < 0.12) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.sort((left, right) => left.score - right.score);
}


const FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT = 0.4;
const FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT = 1;

function getRegisterTimeline(route) {
  if (!route?.transitions?.length) {
    return [];
  }

  const cached = TRAFFIC_TIMELINE_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const startAction = route.absoluteStartAction ?? 0;
  const timeline = route.transitions.map((transition, index) => {
    const before = transition.from ?? route.initialState;
    const after = transition.to ?? transition.state ?? before;
    const boardComplexity =
      ((transition.conveyorSteps || []).length * 0.35) +
      ((transition.boardEvents || []).length * 0.18) +
      (transition.gearTurned ? 0.25 : 0) +
      ((transition.hazard || 0) > 0 ? 0.2 : 0);

    return {
      absoluteRegister: startAction + index + 1,
      legRegister: index + 1,
      before,
      after,
      facing: after?.facing ?? before?.facing,
      uncertainty: Math.min(2.8, 0.75 + index * 0.12 + boardComplexity)
    };
  });

  TRAFFIC_TIMELINE_CACHE.set(route, timeline);
  return timeline;
}

function getTemporalInteractionWeight(pointA, pointB) {
  const delta = Math.abs((pointA?.legRegister ?? 0) - (pointB?.legRegister ?? 0));
  const spread = Math.max(
    1,
    (pointA?.uncertainty ?? 1) + (pointB?.uncertainty ?? 1)
  );

  if (delta >= spread * 2.25) {
    return 0;
  }

  return Math.max(0, 1 - delta / (spread * 2.25));
}

function classifyTrafficOrientation(reference, other) {
  if (!reference?.after || !other?.after) {
    return "side";
  }

  const facing = reference.facing ?? reference.after.facing;
  const vector = DIRS[facing];
  if (!vector) {
    return "side";
  }

  const dx = other.after.x - reference.after.x;
  const dy = other.after.y - reference.after.y;
  const forward = dx * vector.dx + dy * vector.dy;
  const lateral = Math.abs(dx * vector.dy - dy * vector.dx);

  if (Math.abs(forward) >= lateral) {
    return forward < 0 ? "rear" : "front";
  }

  return "side";
}

function getStandardRobotLaserCost() {
  // A normal robot laser is anchored to the exact route-score cost of a normal
  // one-damage board laser. Cutting Floor applies to board lasers only, so the
  // reference deliberately uses neutral board-laser rules here.
  return getTilePenaltyForFeature(
    { type: "laser", damage: 1 },
    { cuttingFloor: false }
  );
}

function getNearbyInteractionProbability(orientation, distance) {
  if (distance <= 0) return 1;

  if (orientation === "rear") {
    if (distance === 1) return 0.9;
    if (distance === 2) return 0.55;
    if (distance === 3) return 0.24;
    return 0;
  }

  if (orientation === "front") {
    if (distance === 1) return 0.95;
    if (distance === 2) return 0.72;
    if (distance === 3) return 0.48;
    if (distance === 4) return 0.24;
    if (distance === 5) return 0.1;
    return 0;
  }

  if (distance === 1) return 0.95;
  if (distance === 2) return 0.48;
  if (distance === 3) return 0.12;
  return 0;
}

function getOrdinaryInterferenceCost() {
  // Blocking / replanning on otherwise harmless floor is real, but far cheaper
  // than taking a point of damage.
  return getStandardRobotLaserCost() * 0.2;
}

function getRouteDeviationScore(timeline, timelineIndex, destination) {
  if (!timeline?.length || !destination) {
    return { disruption: 0, benefitCredit: 0 };
  }

  const lookAhead = timeline.slice(timelineIndex + 1, timelineIndex + 6);
  if (!lookAhead.length) {
    return { disruption: 0, benefitCredit: 0 };
  }

  let bestDistance = Infinity;
  let bestOffset = 0;

  lookAhead.forEach((future, offset) => {
    const distance = heuristic(destination, future.after);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = offset + 1;
    }
  });

  if (!Number.isFinite(bestDistance)) {
    return { disruption: 0, benefitCredit: 0 };
  }

  const damageUnit = getStandardRobotLaserCost();

  if (bestDistance === 0 && bestOffset >= 2) {
    return {
      disruption: 0,
      // Being shoved onto a future part of the route can save registers, but
      // treat that as an unreliable benefit rather than a planned shortcut.
      benefitCredit: Math.min(damageUnit * 0.55, (bestOffset - 1) * 0.6)
    };
  }

  return {
    disruption: Math.min(damageUnit * 1.25, bestDistance * 1.15),
    benefitCredit: 0
  };
}

function getDisplacementConsequenceScore(
  tileMap,
  point,
  timeline,
  timelineIndex,
  options = {}
) {
  if (!point) {
    return 0;
  }

  const damageUnit = getStandardRobotLaserCost();
  let worst = 0;

  for (const [dir, delta] of Object.entries(DIRS)) {
    const destination = {
      x: point.x + delta.dx,
      y: point.y + delta.dy
    };
    const tile = tileMap.get(tileKey(destination.x, destination.y));
    const moveCheck = canMoveBetween(tileMap, point, destination, dir, {
      ...options,
      repulsorActive: false
    });

    if (!tile) {
      if (moveCheck.crash) {
        const pitEquivalent =
          damageUnit * 2 +
          getRebootRoutePenalty() * 0.45;
        worst = Math.max(worst, pitEquivalent);
      }
      continue;
    }

    if (!moveCheck.ok && !moveCheck.crash && !moveCheck.repulsor) {
      // A solid wall means this displacement cannot happen in that direction.
      continue;
    }

    let consequence = 0;
    const features = tile.features || [];

    if (moveCheck.crash || features.some((feature) => feature.type === "pit")) {
      // Normal pits deal two damage, plus a substantial but discounted reboot /
      // lost-program cost because an involuntary fall can occasionally help.
      consequence += damageUnit * 2 + getRebootRoutePenalty() * 0.45;
    } else {
      for (const feature of features) {
        if (
          feature.type === "laser" ||
          feature.type === "flamethrower" ||
          feature.type === "trapdoor" ||
          feature.type === "crusher" ||
          feature.type === "randomizer" ||
          feature.type === "oil"
        ) {
          consequence += Math.max(
            0,
            getTilePenaltyForFeature(feature, {
              ...options,
              onEntrance: true
            })
          );
        }
      }

      if (features.some((feature) => feature.type === "conveyor")) {
        consequence += damageUnit * 0.32;
      }
      if (features.some((feature) => feature.type === "water")) {
        consequence += damageUnit * 0.2;
      }
      if ((moveCheck.ledgeDamage || 0) > 0) {
        // Ledge damage is directly comparable to lasers: normally two damage.
        consequence += damageUnit * moveCheck.ledgeDamage;
      }

      const deviation = getRouteDeviationScore(timeline, timelineIndex, destination);
      consequence += deviation.disruption;
      consequence = Math.max(
        0,
        consequence - deviation.benefitCredit
      );
    }

    worst = Math.max(worst, consequence);
  }

  return Number(worst.toFixed(2));
}

function getIncomingRobotLaserDirection(tileMap, targetPoint, shooterPoint) {
  if (!targetPoint?.after || !shooterPoint?.after) return null;
  const target = targetPoint.after;
  const shooter = shooterPoint.after;
  const facing = shooter.facing ?? shooterPoint.facing;
  const vector = DIRS[facing];
  if (!vector) return null;
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const aligned = vector.dx !== 0
    ? dy === 0 && Math.sign(dx) === Math.sign(vector.dx)
    : dx === 0 && Math.sign(dy) === Math.sign(vector.dy);
  return aligned && hasLineOfSight(tileMap, shooter, target) ? facing : null;
}

function getRobotRangedPressure(tileMap, targetPoint, shooterPoint, options = {}) {
  if (!targetPoint?.after || !shooterPoint?.after) {
    return 0;
  }

  const facing = getIncomingRobotLaserDirection(
    tileMap,
    targetPoint,
    shooterPoint
  );
  if (!facing) return 0;

  const orientation = classifyTrafficOrientation(targetPoint, shooterPoint);
  const multipliers = getRobotLaserThreatMultipliers(options);
  const ruleMultiplier = orientation === "rear"
    ? multipliers.rear
    : orientation === "front"
      ? multipliers.frontal
      : multipliers.lateral;

  // Each credible shot starts at exactly one normal board-laser equivalent.
  // Rear corridors are modestly meaner because sustained pursuit tends to
  // preserve the firing opportunity; actual repeated registers still account
  // for most of the extra cost.
  const orientationPersistence = orientation === "rear"
    ? 1.15
    : orientation === "front"
      ? 1.0
      : 0.9;

  return getStandardRobotLaserCost() * ruleMultiplier * orientationPersistence;
}

function getRouteCompetitionPressure(tileMap, pointA, pointB) {
  if (!pointA?.after || !pointB?.after) {
    return 0;
  }

  const distance = heuristic(pointA.after, pointB.after);
  const damageUnit = getStandardRobotLaserCost();

  if (distance === 0) {
    return damageUnit * 0.28;
  }
  if (distance === 1) {
    return damageUnit * 0.16;
  }
  if (distance <= 3 && hasLineOfSight(tileMap, pointA.after, pointB.after)) {
    return damageUnit * 0.05;
  }

  return 0;
}

function getVirtualPhysicalInteractionScale() {
  // v38 Virtual Bots modeling is intentionally strategic rather than literal.
  // During the opening turn the robots do not physically collide in the game,
  // but every player sees the shared entry and programs around the other likely
  // routes. Suppressing traffic here prevents the demand-led alternate search
  // from ever discovering those choices. Therefore route-selection pressure is
  // full strength from register 1; only forecast *uncertainty* receives the
  // five-register grace period below.
  return 1;
}

function getVirtualCompetitionScale() {
  // Full strategic pressure is already represented through the normal ranged /
  // nearby traffic field above. Do not add a second synthetic competition layer.
  return 0;
}

function getTrafficRouteEntry(entry) {
  if (entry?.route) {
    return {
      route: entry.route,
      occupancyWeight: Number.isFinite(entry.occupancyWeight)
        ? entry.occupancyWeight
        : 1
    };
  }

  return {
    route: entry,
    occupancyWeight: Number.isFinite(entry?.occupancyWeight)
      ? entry.occupancyWeight
      : 1
  };
}

function getTrafficLegs(route) {
  return route?.legRoutes?.length
    ? route.legRoutes
    : route
      ? [route]
      : [];
}

function getTrafficDisplacementProfile(tileMap, route, timeline, options = {}) {
  const cached = TRAFFIC_DISPLACEMENT_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const profile = timeline.map((point, timelineIndex) => (
    getDisplacementConsequenceScore(
      tileMap,
      point.after,
      timeline,
      timelineIndex,
      options
    )
  ));

  TRAFFIC_DISPLACEMENT_CACHE.set(route, profile);
  return profile;
}

function getTrafficPairProfile(tileMap, route, otherRoute, options = {}) {
  let otherCache = TRAFFIC_PAIR_PROFILE_CACHE.get(route);
  if (!otherCache) {
    otherCache = new WeakMap();
    TRAFFIC_PAIR_PROFILE_CACHE.set(route, otherCache);
  }

  const cached = otherCache.get(otherRoute);
  if (cached) {
    return cached;
  }

  const timelineA = getRegisterTimeline(route);
  const timelineB = getRegisterTimeline(otherRoute);
  if (!timelineA.length || !timelineB.length) {
    const empty = {
      ranged: [],
      rangedByFacing: Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, []])),
      nearby: [],
      competition: []
    };
    otherCache.set(otherRoute, empty);
    return empty;
  }

  const displacementProfile = getTrafficDisplacementProfile(
    tileMap,
    route,
    timelineA,
    options
  );
  const ranged = new Array(timelineA.length).fill(0);
  const rangedByFacing = Object.fromEntries(
    ROTATION_ORDER.map((dir) => [dir, new Array(timelineA.length).fill(0)])
  );
  const nearby = new Array(timelineA.length).fill(0);
  const competition = new Array(timelineA.length).fill(0);

  timelineA.forEach((pointA, timelineIndex) => {
    let temporalMass = 0;
    let strongestTemporal = 0;
    let rangedWeighted = 0;
    const rangedWeightedByFacing = Object.fromEntries(
      ROTATION_ORDER.map((dir) => [dir, 0])
    );
    let nearbyWeighted = 0;
    let competitionWeighted = 0;

    const maximumOtherUncertainty = 2.8;
    const temporalRadius = Math.ceil(
      ((pointA.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
    );
    const centerIndex = Math.max(0, (pointA.legRegister ?? 1) - 1);
    const firstIndex = Math.max(0, centerIndex - temporalRadius);
    const lastIndex = Math.min(
      timelineB.length - 1,
      centerIndex + temporalRadius
    );

    for (let otherIndex = firstIndex; otherIndex <= lastIndex; otherIndex += 1) {
      const pointB = timelineB[otherIndex];
      const temporal = getTemporalInteractionWeight(pointA, pointB);
      if (temporal <= 0) {
        continue;
      }

      temporalMass += temporal;
      strongestTemporal = Math.max(strongestTemporal, temporal);

      const physicalScale = getVirtualPhysicalInteractionScale();
      const competitionScale = getVirtualCompetitionScale();

      if (physicalScale > 0) {
        const rangedPressure = getRobotRangedPressure(
          tileMap,
          pointA,
          pointB,
          options
        );
        rangedWeighted += rangedPressure * temporal * physicalScale;
        const incomingFacing = rangedPressure > 0
          ? getIncomingRobotLaserDirection(tileMap, pointA, pointB)
          : null;
        if (incomingFacing) {
          rangedWeightedByFacing[incomingFacing] += (
            rangedPressure * temporal * physicalScale
          );
        }

        const distance = heuristic(pointA.after, pointB.after);
        const orientation = classifyTrafficOrientation(pointA, pointB);
        const interactionProbability = getNearbyInteractionProbability(
          orientation,
          distance
        );
        const consequence = (
          getOrdinaryInterferenceCost() +
          (displacementProfile[timelineIndex] ?? 0)
        );

        nearbyWeighted += (
          interactionProbability *
          consequence *
          temporal *
          physicalScale
        );
      }

      if (competitionScale > 0) {
        competitionWeighted += (
          getRouteCompetitionPressure(tileMap, pointA, pointB) *
          temporal *
          competitionScale
        );
      }
    }

    if (temporalMass <= 0) {
      return;
    }

    // Fuzzy positions are alternative possibilities for the SAME robot.
    const credibility = Math.min(1, strongestTemporal);
    ranged[timelineIndex] = (
      rangedWeighted / temporalMass
    ) * credibility;
    for (const dir of ROTATION_ORDER) {
      rangedByFacing[dir][timelineIndex] = (
        rangedWeightedByFacing[dir] / temporalMass
      ) * credibility;
    }
    nearby[timelineIndex] = (
      nearbyWeighted / temporalMass
    ) * credibility;
    competition[timelineIndex] = (
      competitionWeighted / temporalMass
    ) * credibility;
  });

  const profile = { ranged, rangedByFacing, nearby, competition };
  otherCache.set(otherRoute, profile);
  return profile;
}

// Shared forecast-confidence model. Its primary purpose is to stop spending
// route-search effort on increasingly fictional multiplayer futures. Primary
// representative routes remain exact; only optional traffic-alternate demand and
// breadth are attenuated as elapsed play, hazards, interactions and forced
// movement make later robot positions less credible.
// Time alone stays highly credible through
// the first two five-register programs, then steepens progressively. Hazards and
// predicted interaction can still pull that horizon forward, but their uncertainty
// pressure is saturating: one very chaotic register should not make the entire
// remainder of the race effectively unknowable. These values affect predictive
// traffic/breadth only; intrinsic hazards and exact programming legality are never
// discounted.
const TRAFFIC_FORECAST_HAZARD_DECAY = 0.014;
const TRAFFIC_FORECAST_INTERACTION_DECAY = 0.016;
const TRAFFIC_FORECAST_BOARD_CHAOS_DECAY = 0.020;
const TRAFFIC_FORECAST_CONFIDENCE_FLOOR = 0.06;
const FORECAST_SOLID_CONFIDENCE = 0.84;
const FORECAST_SPECULATIVE_CONFIDENCE = 0.50;
const TRAFFIC_ALTERNATE_MIN_EXPANSIONS = 48;

function getForecastBoardChaosPressure(transition = {}) {
  // Forced movement and board machinery make later robot-position forecasts
  // diverge even when they are not intrinsically hazardous. Hazard itself is
  // handled separately below so this is a confidence term, never a difficulty
  // discount. The logarithm keeps repeated machinery from collapsing the entire
  // horizon after one busy register.
  const forcedDistance = Math.max(0, Number(transition?.forcedDistance) || 0);
  const conveyorSteps = Array.isArray(transition?.conveyorSteps)
    ? transition.conveyorSteps.length
    : 0;
  const nonConveyorEvents = Array.isArray(transition?.boardEvents)
    ? transition.boardEvents.filter((event) => event?.type !== "conveyor").length
    : 0;
  const gearTurn = transition?.gearTurned ? 1 : 0;
  const raw = (
    forcedDistance * 0.40 +
    conveyorSteps * 0.32 +
    nonConveyorEvents * 0.16 +
    gearTurn * 0.28
  );
  return Math.min(2.2, Math.log1p(raw));
}

function getTrafficAlternateEffortScale(confidence, options = {}) {
  const floor = clamp(
    Number.isFinite(Number(options.contextualTrafficAlternateUncertaintyEffortFloor))
      ? Number(options.contextualTrafficAlternateUncertaintyEffortFloor)
      : 0.18,
    0.05,
    1
  );
  const exponent = clamp(
    Number.isFinite(Number(options.contextualTrafficAlternateUncertaintyEffortExponent))
      ? Number(options.contextualTrafficAlternateUncertaintyEffortExponent)
      : 1.15,
    0.35,
    2.5
  );
  const normalized = clamp(
    (Math.max(TRAFFIC_FORECAST_CONFIDENCE_FLOOR, Number(confidence) || 0) -
      TRAFFIC_FORECAST_CONFIDENCE_FLOOR) /
      (1 - TRAFFIC_FORECAST_CONFIDENCE_FLOOR),
    0,
    1
  );
  return clamp(
    floor + (1 - floor) * Math.pow(normalized, exponent),
    floor,
    1
  );
}

function getForecastTimeExponent(absoluteRegisters = 0) {
  const registers = Math.max(0, Number(absoluteRegisters) || 0);
  if (registers <= REGISTER_COUNT) {
    // R1-R5: time by itself should barely weaken the forecast.
    return registers * 0.002;
  }
  if (registers <= REGISTER_COUNT * 2) {
    // R6-R10: still a credible second program, with only mild time decay.
    return 0.010 + (registers - REGISTER_COUNT) * 0.013;
  }

  // R11+: gradual at first, then increasingly steep. Time-only anchors are
  // approximately R5 .990, R10 .928, R15 .827, R20 .660, R25 .472.
  const later = registers - REGISTER_COUNT * 2;
  return 0.075 + later * 0.012 + later * later * 0.0022;
}

function getForecastTimeConfidence(absoluteRegisters = 0) {
  return clamp(
    Math.exp(-getForecastTimeExponent(absoluteRegisters)),
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

function getForecastHazardPressure(hazardExposure = 0) {
  const hazard = Math.max(0, Number(hazardExposure) || 0);
  // Hazard remains fully priced intrinsically. Here it only reduces confidence in
  // future multiplayer positions, with diminishing uncertainty from repeated hits.
  return Math.min(2.4, Math.log1p(hazard));
}

function getForecastInteractionPressure(rawInteraction = 0, damageUnit = 1) {
  const ratio = Math.max(0, Number(rawInteraction) || 0) /
    Math.max(1, Number(damageUnit) || 1);
  // Congestion is strong evidence that the next positions may diverge, but its
  // uncertainty effect saturates instead of compounding linearly without bound.
  return Math.min(1.8, Math.log1p(ratio));
}

function getTrafficForecastGraceRegisters(options = {}) {
  const explicit = Number(options.trafficGraceRegisters);
  return Number.isFinite(explicit) ? Math.max(0, Math.floor(explicit)) : 0;
}

function getTrafficForecastElapsedRegisters(absoluteActions = 0, options = {}) {
  const actions = Math.max(0, Number(absoluteActions) || 0);
  return Math.max(0, actions - getTrafficForecastGraceRegisters(options));
}

function getIntrinsicForecastConfidence(absoluteActions = 0, hazardExposure = 0, options = {}) {
  const elapsedForTime = getTrafficForecastElapsedRegisters(absoluteActions, options);
  const hazardPressure = getForecastHazardPressure(hazardExposure);
  return clamp(
    getForecastTimeConfidence(elapsedForTime) * Math.exp(-TRAFFIC_FORECAST_HAZARD_DECAY * hazardPressure),
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

function getTrafficInitialForecastConfidence(route, options = {}) {
  const explicitValue = options.trafficInitialForecastConfidence;
  const explicit = Number(explicitValue);
  if (explicitValue !== null && explicitValue !== undefined && Number.isFinite(explicit)) {
    return clamp(explicit, TRAFFIC_FORECAST_CONFIDENCE_FLOOR, 1);
  }
  const elapsedRegisters = Math.max(0, Number(route?.absoluteStartAction) || 0);
  const priorHazard = Math.max(0, Number(options.trafficPriorHazardExposure) || 0);
  return getIntrinsicForecastConfidence(elapsedRegisters, priorHazard, options);
}

function advanceTrafficForecastConfidence(
  confidence,
  transitionHazard,
  rawInteraction,
  damageUnit,
  transition = null,
  absoluteRegister = 0,
  options = {}
) {
  const hazardPressure = getForecastHazardPressure(transitionHazard);
  const boardChaosPressure = getForecastBoardChaosPressure(transition);
  const register = Math.max(0, Number(absoluteRegister) || 0);
  const graceRegisters = getTrafficForecastGraceRegisters(options);
  // Virtual Bots still exert traffic pressure from register 1. What is known
  // unusually well is the first-turn interaction field, so those interactions
  // do not themselves erode forecast confidence until register 6.
  const uncertaintyInteraction = register < graceRegisters ? 0 : rawInteraction;
  const interactionPressure = getForecastInteractionPressure(uncertaintyInteraction, damageUnit);
  const elapsedBefore = Math.max(0, register - graceRegisters);
  const elapsedAfter = Math.max(0, register + 1 - graceRegisters);
  const timeExponentDelta = Math.max(
    0,
    getForecastTimeExponent(elapsedAfter) - getForecastTimeExponent(elapsedBefore)
  );
  const decay = Math.exp(
    -timeExponentDelta -
    TRAFFIC_FORECAST_HAZARD_DECAY * hazardPressure -
    TRAFFIC_FORECAST_INTERACTION_DECAY * interactionPressure -
    TRAFFIC_FORECAST_BOARD_CHAOS_DECAY * boardChaosPressure
  );
  return clamp(
    confidence * decay,
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

export function summarizeIntrinsicRouteForecastConfidence(route, options = {}) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  if (!transitions.length) {
    return {
      registerCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      endConfidence: 1,
      confidenceByRegister: []
    };
  }

  const damageUnit = getStandardRobotLaserCost();
  const absoluteStartAction = Math.max(0, Number(route?.absoluteStartAction) || 0);
  let confidence = getTrafficInitialForecastConfidence(route, options);
  const confidenceByRegister = [];

  for (let index = 0; index < transitions.length; index += 1) {
    confidenceByRegister.push(confidence);
    const transition = transitions[index] ?? null;
    confidence = advanceTrafficForecastConfidence(
      confidence,
      transition?.hazard,
      0,
      damageUnit,
      transition,
      absoluteStartAction + index,
      options
    );
  }

  return {
    registerCount: confidenceByRegister.length,
    averageConfidence: Number(average(confidenceByRegister).toFixed(3)),
    minimumConfidence: Number(Math.min(...confidenceByRegister, confidence).toFixed(3)),
    endConfidence: Number(confidence.toFixed(3)),
    confidenceByRegister: confidenceByRegister.map((value) => Number(value.toFixed(4)))
  };
}

function getExpectedTrafficBreakdownForLeg(
  tileMap,
  route,
  selectedRouteEntries,
  options = {}
) {
  const timelineA = getRegisterTimeline(route);
  if (!timelineA.length || !selectedRouteEntries?.length) {
    const confidence = getTrafficInitialForecastConfidence(route, options);
    return {
      ranged: 0,
      nearby: 0,
      competition: 0,
      total: 0,
      rawRanged: 0,
      rawNearby: 0,
      rawCompetition: 0,
      rawTotal: 0,
      confidenceStart: Number(confidence.toFixed(3)),
      confidenceMean: Number(confidence.toFixed(3)),
      confidenceEnd: Number(confidence.toFixed(3))
    };
  }

  const preparedOthers = selectedRouteEntries
    .map(getTrafficRouteEntry)
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  if (!preparedOthers.length) {
    const confidence = getTrafficInitialForecastConfidence(route, options);
    return {
      ranged: 0,
      nearby: 0,
      competition: 0,
      total: 0,
      rawRanged: 0,
      rawNearby: 0,
      rawCompetition: 0,
      rawTotal: 0,
      confidenceStart: Number(confidence.toFixed(3)),
      confidenceMean: Number(confidence.toFixed(3)),
      confidenceEnd: Number(confidence.toFixed(3))
    };
  }

  const damageUnit = getStandardRobotLaserCost();
  const rangedByRegisterFacing = timelineA.map(() => (
    Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, 0]))
  ));
  const nearbyByRegister = new Array(timelineA.length).fill(0);
  const competitionByRegister = new Array(timelineA.length).fill(0);

  for (const other of preparedOthers) {
    const profile = getTrafficPairProfile(tileMap, route, other.route, options);
    const occupancy = other.occupancyWeight;

    for (let index = 0; index < timelineA.length; index += 1) {
      for (const dir of ROTATION_ORDER) {
        const directional = profile.rangedByFacing?.[dir]?.[index] ?? 0;
        rangedByRegisterFacing[index][dir] += directional * occupancy;
      }
      nearbyByRegister[index] += (profile.nearby[index] ?? 0) * occupancy;
      competitionByRegister[index] += (profile.competition[index] ?? 0) * occupancy;
    }
  }

  let ranged = 0;
  let nearby = 0;
  let competition = 0;
  let rawRanged = 0;
  let rawNearby = 0;
  let rawCompetition = 0;
  const confidenceStart = getTrafficInitialForecastConfidence(route, options);
  let confidence = confidenceStart;
  let confidenceSum = 0;

  for (let index = 0; index < timelineA.length; index += 1) {
    let registerRanged = 0;
    for (const dir of ROTATION_ORDER) {
      registerRanged += Math.min(rangedByRegisterFacing[index][dir], damageUnit);
    }
    const registerNearby = Math.min(nearbyByRegister[index], damageUnit * 3.25);
    const registerCompetition = Math.min(competitionByRegister[index], damageUnit);
    const registerRaw = registerRanged + registerNearby + registerCompetition;

    rawRanged += registerRanged;
    rawNearby += registerNearby;
    rawCompetition += registerCompetition;

    // v33 uncertainty curve: traffic at this register is trusted according to the
    // confidence on arrival. The interaction then reduces confidence only for
    // later registers, so congestion never discounts itself retroactively.
    ranged += registerRanged * confidence;
    nearby += registerNearby * confidence;
    competition += registerCompetition * confidence;
    confidenceSum += confidence;

    confidence = advanceTrafficForecastConfidence(
      confidence,
      route.transitions?.[index]?.hazard,
      registerRaw,
      damageUnit,
      route.transitions?.[index] ?? null,
      Math.max(0, Number(route?.absoluteStartAction) || 0) + index,
      options
    );
  }

  const rawTotal = rawRanged + rawNearby + rawCompetition;
  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2)),
    rawRanged: Number(rawRanged.toFixed(2)),
    rawNearby: Number(rawNearby.toFixed(2)),
    rawCompetition: Number(rawCompetition.toFixed(2)),
    rawTotal: Number(rawTotal.toFixed(2)),
    confidenceStart: Number(confidenceStart.toFixed(3)),
    confidenceMean: Number((confidenceSum / timelineA.length).toFixed(3)),
    confidenceEnd: Number(confidence.toFixed(3))
  };
}

function getExpectedTrafficBreakdownsByLeg(
  tileMap,
  route,
  selectedRouteEntries,
  options = {}
) {
  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length) return [];

  let priorHazardExposure = Math.max(0, Number(options.trafficPriorHazardExposure) || 0);
  const explicitInitialConfidence = options.trafficInitialForecastConfidence;
  let carriedConfidence = (
    explicitInitialConfidence !== null &&
    explicitInitialConfidence !== undefined &&
    Number.isFinite(Number(explicitInitialConfidence))
  )
    ? clamp(Number(explicitInitialConfidence), TRAFFIC_FORECAST_CONFIDENCE_FLOOR, 1)
    : null;
  return routeLegs.map((routeLeg, legIndex) => {
    const otherLegEntries = selectedRouteEntries
      .map(getTrafficRouteEntry)
      .map((entry) => {
        const legs = getTrafficLegs(entry.route);
        return {
          route: legs[legIndex] ?? null,
          occupancyWeight: entry.occupancyWeight
        };
      })
      .filter((entry) => entry.route);

    const breakdown = getExpectedTrafficBreakdownForLeg(
      tileMap,
      routeLeg,
      otherLegEntries,
      {
        ...options,
        trafficPriorHazardExposure: priorHazardExposure,
        trafficInitialForecastConfidence: carriedConfidence
      }
    );
    priorHazardExposure += Math.max(0, Number(routeLeg?.hazard) || 0);
    carriedConfidence = breakdown.confidenceEnd;
    return breakdown;
  });
}

function getExpectedTrafficBreakdown(
  tileMap,
  route,
  selectedRouteEntries,
  _flags,
  options = {}
) {
  if (!route || !selectedRouteEntries?.length) {
    return {
      ranged: 0, nearby: 0, competition: 0, total: 0, opening: 0, later: 0,
      rawRanged: 0, rawNearby: 0, rawCompetition: 0, rawTotal: 0,
      confidenceStart: 1, confidenceMean: 1, confidenceEnd: 1
    };
  }

  if (options.singleLegTraffic) {
    const single = getExpectedTrafficBreakdownForLeg(
      tileMap,
      route,
      selectedRouteEntries,
      options
    );
    return { ...single, opening: single.total, later: 0 };
  }

  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length) {
    return {
      ranged: 0, nearby: 0, competition: 0, total: 0, opening: 0, later: 0,
      rawRanged: 0, rawNearby: 0, rawCompetition: 0, rawTotal: 0,
      confidenceStart: 1, confidenceMean: 1, confidenceEnd: 1
    };
  }

  const legBreakdowns = getExpectedTrafficBreakdownsByLeg(
    tileMap,
    route,
    selectedRouteEntries,
    options
  );
  let ranged = 0;
  let nearby = 0;
  let competition = 0;
  let rawRanged = 0;
  let rawNearby = 0;
  let rawCompetition = 0;
  let opening = 0;
  let later = 0;
  let confidenceWeighted = 0;
  let confidenceRegisters = 0;

  legBreakdowns.forEach((legBreakdown, legIndex) => {
    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
    const weightedTotal = legBreakdown.total * legWeight;
    ranged += legBreakdown.ranged * legWeight;
    nearby += legBreakdown.nearby * legWeight;
    competition += legBreakdown.competition * legWeight;
    rawRanged += (legBreakdown.rawRanged || 0) * legWeight;
    rawNearby += (legBreakdown.rawNearby || 0) * legWeight;
    rawCompetition += (legBreakdown.rawCompetition || 0) * legWeight;
    if (legIndex === 0) opening += weightedTotal;
    else later += weightedTotal;
    const registers = Math.max(1, routeLegs[legIndex]?.transitions?.length || 0);
    confidenceWeighted += (legBreakdown.confidenceMean ?? 1) * registers;
    confidenceRegisters += registers;
  });

  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2)),
    rawRanged: Number(rawRanged.toFixed(2)),
    rawNearby: Number(rawNearby.toFixed(2)),
    rawCompetition: Number(rawCompetition.toFixed(2)),
    rawTotal: Number((rawRanged + rawNearby + rawCompetition).toFixed(2)),
    opening: Number(opening.toFixed(2)),
    later: Number(later.toFixed(2)),
    confidenceStart: legBreakdowns[0]?.confidenceStart ?? 1,
    confidenceMean: Number((
      confidenceRegisters > 0 ? confidenceWeighted / confidenceRegisters : 1
    ).toFixed(3)),
    confidenceEnd: legBreakdowns.at(-1)?.confidenceEnd ?? 1,
    byLeg: legBreakdowns.map((entry) => ({ ...entry }))
  };
}

function allocateCappedOccupancy(items, targetCount, weightForItem) {
  const result = new Map(items.map((item) => [item.index, 0]));
  let remainingItems = [...items];
  let remaining = Math.max(0, Math.min(targetCount, remainingItems.length));

  while (remainingItems.length && remaining > 0.0001) {
    const weights = remainingItems.map((item) => Math.max(0.0001, weightForItem(item)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const capped = [];

    remainingItems.forEach((item, index) => {
      const proposed = remaining * weights[index] / totalWeight;
      if (proposed >= 1) {
        result.set(item.index, 1);
        capped.push(item.index);
      }
    });

    if (!capped.length) {
      remainingItems.forEach((item, index) => {
        result.set(
          item.index,
          Math.min(1, remaining * weights[index] / totalWeight)
        );
      });
      remaining = 0;
      break;
    }

    remaining -= capped.length;
    remainingItems = remainingItems.filter((item) => !capped.includes(item.index));
  }

  return result;
}

function getExplicitOccupancyWeight(occupancyByIndex, index) {
  if (!occupancyByIndex) {
    return null;
  }
  const value = occupancyByIndex instanceof Map
    ? occupancyByIndex.get(index)
    : occupancyByIndex[index];
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

function buildConditionalOccupancyMap(
  analyses,
  focusIndex,
  playerCount,
  options,
  routeForAnalysis
) {
  const others = analyses.filter((analysis) => analysis.index !== focusIndex);
  const targetCount = Math.min(
    Math.max(0, (playerCount ?? 1) - 1),
    others.length
  );

  if (!others.length) {
    return new Map();
  }

  if (options.occupancyByIndex) {
    return new Map(others.map((analysis) => [
      analysis.index,
      getExplicitOccupancyWeight(options.occupancyByIndex, analysis.index)
    ]));
  }

  if (targetCount <= 0) {
    return new Map();
  }

  // Pay to Win pricing is intended to make all retained starts equally
  // attractive, so traffic occupancy is uniform by design.
  if (options.payToWin) {
    const uniform = targetCount / others.length;
    return new Map(others.map((analysis) => [analysis.index, uniform]));
  }

  const scored = others.map((analysis) => {
    const iterativeScore = Number(analysis.balanceScore);
    const routeScore = Number(routeForAnalysis(analysis)?.score);
    return {
      analysis,
      score: options.trafficOccupancyUseBalanceScore && Number.isFinite(iterativeScore)
        ? iterativeScore
        : (Number.isFinite(routeScore) ? routeScore : Infinity)
    };
  });
  const finiteScores = scored
    .map((item) => item.score)
    .filter(Number.isFinite);

  if (!finiteScores.length) {
    const uniform = targetCount / others.length;
    return new Map(others.map((analysis) => [analysis.index, uniform]));
  }

  const minScore = Math.min(...finiteScores);
  const maxScore = Math.max(...finiteScores);
  const temperature = Math.max(6, (maxScore - minScore) / 3);

  return allocateCappedOccupancy(
    others,
    targetCount,
    (analysis) => {
      const iterativeScore = Number(analysis.balanceScore);
      const routeScore = Number(routeForAnalysis(analysis)?.score);
      const score = options.trafficOccupancyUseBalanceScore && Number.isFinite(iterativeScore)
        ? iterativeScore
        : routeScore;
      return Number.isFinite(score)
        ? Math.exp(-(score - minScore) / temperature)
        : 0.0001;
    }
  );
}

function summarizeFullCourseCandidateDiversity(
  analysis,
  flags,
  selectedRoute = null,
  candidateEvaluations = []
) {
  const routes = Array.isArray(analysis?.fullCourseRoutes)
    ? analysis.fullCourseRoutes.filter(Boolean)
    : [];
  const baseline = routes[0] ?? null;
  const finalGoal = flags?.at?.(-1) ?? null;
  const wholeSimilarities = [];
  const laterSimilarities = [];

  if (baseline && finalGoal) {
    for (const candidate of routes.slice(1)) {
      wholeSimilarities.push(routeSimilarity(baseline, candidate, finalGoal));

      const baseLegs = getTrafficLegs(baseline);
      const candidateLegs = getTrafficLegs(candidate);
      const perLeg = [];
      const laterLegCount = Math.min(baseLegs.length, candidateLegs.length, flags.length);
      for (let legIndex = 1; legIndex < laterLegCount; legIndex += 1) {
        const legGoal = flags[legIndex];
        if (!legGoal) continue;
        perLeg.push(routeSimilarity(baseLegs[legIndex], candidateLegs[legIndex], legGoal));
      }
      if (perLeg.length) laterSimilarities.push(average(perLeg));
    }
  }

  const selectedIndex = selectedRoute ? routes.indexOf(selectedRoute) : -1;
  const normalizedEvaluations = (candidateEvaluations || []).map((entry, index) => ({
    routeIndex: Number.isInteger(entry?.routeIndex) ? entry.routeIndex : index,
    intrinsicScore: Number.isFinite(entry?.intrinsicScore)
      ? Number(entry.intrinsicScore.toFixed(2))
      : null,
    intrinsicDelta: Number.isFinite(entry?.intrinsicDelta)
      ? Number(entry.intrinsicDelta.toFixed(2))
      : null,
    trafficPenalty: Number.isFinite(entry?.trafficPenalty)
      ? Number(entry.trafficPenalty.toFixed(2))
      : null,
    combinedValue: Number.isFinite(entry?.combinedValue)
      ? Number(entry.combinedValue.toFixed(2))
      : null,
    strategicGain: Number.isFinite(entry?.strategicGain)
      ? Number(entry.strategicGain.toFixed(2))
      : null
  }));
  const baselineEvaluation = normalizedEvaluations.find((entry) => entry.routeIndex === 0) ?? null;
  const selectedEvaluation = selectedIndex >= 0
    ? normalizedEvaluations.find((entry) => entry.routeIndex === selectedIndex) ?? null
    : null;
  const intrinsicCostSelectedVsBest = selectedIndex > 0 && baseline && selectedRoute
    ? Number((selectedRoute.score - baseline.score).toFixed(2))
    : selectedIndex === 0
      ? 0
      : null;
  const trafficAdvantageSelectedVsBest = baselineEvaluation && selectedEvaluation
    ? Number((baselineEvaluation.trafficPenalty - selectedEvaluation.trafficPenalty).toFixed(2))
    : null;
  const strategicGainSelectedVsBest = selectedEvaluation && Number.isFinite(selectedEvaluation.strategicGain)
    ? Number(selectedEvaluation.strategicGain.toFixed(2))
    : null;

  return {
    startIndex: analysis?.index ?? null,
    candidateCount: routes.length,
    selectedRouteIndex: selectedIndex >= 0 ? selectedIndex : null,
    trafficSwitched: Boolean(selectedIndex > 0),
    wholeMostDifferentSimilarity: wholeSimilarities.length
      ? Number(Math.min(...wholeSimilarities).toFixed(3))
      : null,
    laterMostDifferentSimilarity: laterSimilarities.length
      ? Number(Math.min(...laterSimilarities).toFixed(3))
      : null,
    selectedWholeSimilarityToBest: selectedIndex > 0 && finalGoal
      ? Number(routeSimilarity(baseline, selectedRoute, finalGoal).toFixed(3))
      : selectedIndex === 0
        ? 1
        : null,
    scoreSpread: routes.length > 1
      ? Number((Math.max(...routes.map((route) => route.score)) - Math.min(...routes.map((route) => route.score))).toFixed(2))
      : 0,
    intrinsicCostSelectedVsBest,
    trafficAdvantageSelectedVsBest,
    strategicGainSelectedVsBest,
    baselineTrafficPenalty: baselineEvaluation?.trafficPenalty ?? null,
    selectedTrafficPenalty: selectedEvaluation?.trafficPenalty ?? null,
    candidateEvaluations: normalizedEvaluations
  };
}

function selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, options = {}) {
  const excludedIndices = new Set(options.excludedIndices ?? []);
  const reachable = startAnalyses.filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length &&
    !excludedIndices.has(analysis.index)
  ));
  if (reachable.length <= 1) {
    return {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      averageRawTrafficPenalty: 0,
      averageForecastConfidence: 1,
      minimumForecastConfidence: 1,
      averageTrafficByLeg: [],
      candidateDiagnostics: reachable.map((analysis) => (
        summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoutes?.[0] ?? analysis.fullCourseRoute ?? null
        )
      ))
    };
  }

  const playerCount = Math.max(1, options.playerCount ?? reachable.length);
  const minimumUsefulTrafficGain = Math.max(
    0,
    Number(options.contextualTrafficAlternateMinGain) || 0
  );
  const maxPasses = Math.max(1, Math.min(3, options.fullCourseTrafficPasses ?? 2));
  let routeSwitches = 0;
  let actualPasses = 0;
  let selectedByIndex = new Map(
    reachable.map((analysis) => [analysis.index, analysis.fullCourseRoutes[0]])
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    actualPasses = pass + 1;
    let changed = false;

    // v33 traffic epochs are synchronous. Every start evaluates its choices
    // against the same frozen route/occupancy snapshot for this pass; proposed
    // switches become visible only after all starts have been evaluated. This
    // prevents later starts in iteration order from reacting to half-updated
    // traffic while earlier starts saw the old field.
    const frozenSelectedByIndex = new Map(selectedByIndex);
    const proposedSelectedByIndex = new Map(selectedByIndex);

    for (const analysis of reachable) {
      const occupancyByIndex = buildConditionalOccupancyMap(
        reachable,
        analysis.index,
        playerCount,
        options,
        (other) => frozenSelectedByIndex.get(other.index)
      );
      const otherRouteEntries = reachable
        .filter((other) => other.index !== analysis.index)
        .map((other) => ({
          route: frozenSelectedByIndex.get(other.index),
          occupancyWeight: occupancyByIndex.get(other.index) ?? 0
        }))
        .filter((entry) => entry.route && entry.occupancyWeight > 0);

      const baselineRoute = analysis.fullCourseRoutes[0];
      const baselineTraffic = getExpectedTrafficBreakdown(
        tileMap,
        baselineRoute,
        otherRouteEntries,
        flags,
        {
          ...options,
          playerCount
        }
      );
      const baselineStrategicValue = baselineRoute.score + baselineTraffic.total;
      let bestRoute = baselineRoute;
      let bestValue = baselineStrategicValue;

      for (const candidate of analysis.fullCourseRoutes.slice(1)) {
        const traffic = getExpectedTrafficBreakdown(
          tileMap,
          candidate,
          otherRouteEntries,
          flags,
          {
            ...options,
            playerCount
          }
        );
        const rawGap = Math.max(0, candidate.score - baselineRoute.score);
        const strategicValue = candidate.score + traffic.total;
        const strategicGain = baselineStrategicValue - strategicValue;
        if (strategicGain < minimumUsefulTrafficGain) {
          continue;
        }
        // Keep the small baseline-stability surcharge as a tie/stability preference,
        // but never let it replace the shared strategic-gain eligibility rule.
        const value = strategicValue + rawGap * 0.04;

        if (value < bestValue - 0.001) {
          bestValue = value;
          bestRoute = candidate;
        }
      }

      if (bestRoute !== frozenSelectedByIndex.get(analysis.index)) {
        proposedSelectedByIndex.set(analysis.index, bestRoute);
        changed = true;
        routeSwitches += 1;
      }
    }

    selectedByIndex = proposedSelectedByIndex;
    if (!changed) {
      break;
    }
  }

  const trafficValues = [];
  const openingTrafficValues = [];
  const laterTrafficValues = [];
  const rawTrafficValues = [];
  const confidenceMeanValues = [];
  const confidenceEndValues = [];
  const trafficByLegAccumulator = [];
  const trafficBreakdowns = new Map();
  const candidateEvaluationsByIndex = new Map();

  for (const analysis of reachable) {
    const route = selectedByIndex.get(analysis.index);
    const occupancyByIndex = buildConditionalOccupancyMap(
      reachable,
      analysis.index,
      playerCount,
      options,
      (other) => selectedByIndex.get(other.index)
    );
    const otherRouteEntries = reachable
      .filter((other) => other.index !== analysis.index)
      .map((other) => ({
        route: selectedByIndex.get(other.index),
        occupancyWeight: occupancyByIndex.get(other.index) ?? 0
      }))
      .filter((entry) => entry.route && entry.occupancyWeight > 0);

    const baselineScore = analysis.fullCourseRoutes[0]?.score ?? 0;
    const candidateEvaluations = analysis.fullCourseRoutes.map((candidate, routeIndex) => {
      const traffic = getExpectedTrafficBreakdown(
        tileMap,
        candidate,
        otherRouteEntries,
        flags,
        {
          ...options,
          playerCount
        }
      );
      const rawGap = Math.max(0, candidate.score - baselineScore);
      const strategicValue = candidate.score + traffic.total;
      return {
        routeIndex,
        route: candidate,
        traffic,
        intrinsicScore: candidate.score,
        intrinsicDelta: candidate.score - baselineScore,
        trafficPenalty: traffic.total,
        strategicValue,
        strategicGain: null,
        combinedValue: strategicValue + rawGap * 0.04
      };
    });
    const baselineStrategicValue = candidateEvaluations[0]?.strategicValue ?? null;
    for (const evaluation of candidateEvaluations) {
      evaluation.strategicGain = Number.isFinite(baselineStrategicValue)
        ? baselineStrategicValue - evaluation.strategicValue
        : null;
    }
    candidateEvaluationsByIndex.set(analysis.index, candidateEvaluations);
    const selectedEvaluation = candidateEvaluations.find((entry) => entry.route === route)
      ?? candidateEvaluations[0]
      ?? null;
    const breakdown = selectedEvaluation?.traffic ?? {
      ranged: 0,
      nearby: 0,
      competition: 0,
      opening: 0,
      later: 0,
      total: 0
    };

    trafficBreakdowns.set(analysis.index, breakdown);
    trafficValues.push(breakdown.total);
    openingTrafficValues.push(breakdown.opening ?? 0);
    laterTrafficValues.push(breakdown.later ?? 0);
    rawTrafficValues.push(breakdown.rawTotal ?? breakdown.total ?? 0);
    confidenceMeanValues.push(breakdown.confidenceMean ?? 1);
    confidenceEndValues.push(breakdown.confidenceEnd ?? 1);
    (breakdown.byLeg || []).forEach((legBreakdown, legIndex) => {
      if (!trafficByLegAccumulator[legIndex]) {
        trafficByLegAccumulator[legIndex] = {
          count: 0, raw: 0, effective: 0, confidence: 0
        };
      }
      const legWeight = legIndex === 0
        ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
        : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
      const bucket = trafficByLegAccumulator[legIndex];
      bucket.count += 1;
      bucket.raw += (legBreakdown.rawTotal ?? legBreakdown.total ?? 0) * legWeight;
      bucket.effective += (legBreakdown.total ?? 0) * legWeight;
      bucket.confidence += legBreakdown.confidenceMean ?? 1;
    });
  }

  return {
    starts: startAnalyses.map((analysis) => {
      const selectedRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoute;
      if (!selectedRoute) {
        return analysis;
      }

      const breakdown = trafficBreakdowns.get(analysis.index) ?? {
        ranged: 0,
        nearby: 0,
        competition: 0,
        total: 0
      };

      return {
        ...analysis,
        fullCourseRoute: selectedRoute,
        fullCourseTrafficPenalty: breakdown.total,
        fullCourseTrafficRawPenalty: breakdown.rawTotal ?? breakdown.total,
        fullCourseTrafficRanged: breakdown.ranged,
        fullCourseTrafficNearby: breakdown.nearby,
        fullCourseTrafficCompetition: breakdown.competition,
        fullCourseTrafficForecastConfidence: breakdown.confidenceMean ?? 1,
        fullCourseTrafficForecastConfidenceEnd: breakdown.confidenceEnd ?? 1,
        fullCourseRouteIndex: analysis.fullCourseRoutes.indexOf(selectedRoute)
      };
    }),
    selectionPasses: actualPasses,
    routeSwitches,
    averageTrafficPenalty: Number(average(trafficValues).toFixed(2)),
    maxTrafficPenalty: trafficValues.length
      ? Number(Math.max(...trafficValues).toFixed(2))
      : 0,
    averageOpeningTrafficPenalty: Number(average(openingTrafficValues).toFixed(2)),
    averageLaterTrafficPenalty: Number(average(laterTrafficValues).toFixed(2)),
    averageRawTrafficPenalty: Number(average(rawTrafficValues).toFixed(2)),
    averageForecastConfidence: Number(average(confidenceMeanValues).toFixed(3)),
    minimumForecastConfidence: confidenceEndValues.length
      ? Number(Math.min(...confidenceEndValues).toFixed(3))
      : 1,
    averageTrafficByLeg: trafficByLegAccumulator.map((bucket, legIndex) => ({
      leg: legIndex + 1,
      raw: bucket?.count ? Number((bucket.raw / bucket.count).toFixed(2)) : 0,
      effective: bucket?.count ? Number((bucket.effective / bucket.count).toFixed(2)) : 0,
      confidence: bucket?.count ? Number((bucket.confidence / bucket.count).toFixed(3)) : 1
    })),
    candidateDiagnostics: reachable.map((analysis) => (
      summarizeFullCourseCandidateDiversity(
        analysis,
        flags,
        selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoutes?.[0] ?? null,
        candidateEvaluationsByIndex.get(analysis.index) ?? []
      )
    ))
  };
}
function buildStartAnalysisForSelectedFullRoute(analysis) {
  const fullRoute = analysis.fullCourseRoute;
  const legRoutes = fullRoute?.legRoutes ?? [];
  const firstLegRoute = legRoutes[0] ?? null;
  const continuationScore = fullRoute && firstLegRoute
    ? Number((fullRoute.score - firstLegRoute.score).toFixed(2))
    : 0;
  const continuationActions = fullRoute && firstLegRoute
    ? Math.max(0, fullRoute.actions - firstLegRoute.actions)
    : 0;
  const continuationDistance = fullRoute && firstLegRoute
    ? Number((fullRoute.distance - firstLegRoute.distance).toFixed(2))
    : 0;

  return {
    ...analysis,
    reachable: Boolean(firstLegRoute && fullRoute),
    routes: firstLegRoute ? [firstLegRoute] : [],
    selectedRouteIndex: 0,
    selectedRoute: firstLegRoute,
    bestScore: firstLegRoute?.score ?? Infinity,
    bestDistance: firstLegRoute?.distance ?? Infinity,
    bestActions: firstLegRoute?.actions ?? Infinity,
    courseEstimate: fullRoute
      ? {
        continuationScore,
        continuationActions,
        continuationDistance,
        totalScore: fullRoute.score,
        totalActions: fullRoute.actions,
        totalDistance: fullRoute.distance,
        fullCourseTrafficPenalty: analysis.fullCourseTrafficPenalty ?? 0,
        selectedRouteIndex: analysis.fullCourseRouteIndex ?? 0,
        candidateCount: analysis.fullCourseRoutes?.length ?? 0,
        legs: legRoutes.map((route, legIndex) => ({
          flag: legIndex + 1,
          score: route?.score ?? null,
          actions: route?.actions ?? null,
          absoluteActions: route?.absoluteActions ?? null,
          distance: route?.distance ?? null,
          movingTarget: route?.movingTarget ?? null,
          reachable: Boolean(route)
        }))
      }
      : null,
    courseScoreAdjustment: 0,
    balanceScore: fullRoute?.score ?? Infinity
  };
}

function applyIntrinsicFullCourseBalanceScores(startAnalyses, options = {}) {
  const useFullTraffic = options.balanceTrafficScope === "full";
  (startAnalyses || []).forEach((analysis) => {
    const intrinsic = Number(analysis?.fullCourseRoute?.score);
    const traffic = Number(
      useFullTraffic
        ? analysis?.fullCourseTrafficPenalty
        : analysis?.trafficPenalty
    );
    analysis.balanceScore = Number.isFinite(intrinsic)
      ? Number((intrinsic + (Number.isFinite(traffic) ? traffic : 0)).toFixed(2))
      : Infinity;
  });
  return startAnalyses;
}

function buildExpectedLegAnalysesFromFullRoutes(startAnalyses, flags, playerCount) {
  const perLegRoutes = Array.from({ length: flags.length }, () => []);

  for (const startAnalysis of startAnalyses) {
    const fullRoute = startAnalysis.fullCourseRoute;
    if (!fullRoute) {
      continue;
    }

    for (let legIndex = 0; legIndex < flags.length; legIndex += 1) {
      const legRoute = fullRoute.legRoutes?.[legIndex];
      if (legRoute) {
        perLegRoutes[legIndex].push({
          ...legRoute,
          startIndex: startAnalysis.index,
          label: `Start ${startAnalysis.index + 1} leg ${legIndex === 0 ? "dock" : legIndex} -> ${legIndex + 1}`
        });
      }
    }
  }

  let previousLegRoutes = [];
  return perLegRoutes.map((routes, index) => {
    const goal = flags[index];
    const summary = summarizeExpectedFullCourseLegRoutes(routes, previousLegRoutes, goal, playerCount);
    previousLegRoutes = routes;
    return {
      from: index === 0 ? "dock" : flags[index - 1],
      goal,
      routes,
      distinctRoutes: routes,
      summary
    };
  });
}


const CONTEXTUAL_OPENING_ROUTES = 2;
const CONTEXTUAL_LATER_ROUTES = 3;
const CONTEXTUAL_BEAM_WIDTH = 2;
const CONTEXTUAL_COMPLETION_POOL = 4;
const CONTEXTUAL_OPENING_EXPANSIONS = 7000;
const CONTEXTUAL_LATER_EXPANSIONS = 6000;
const CONTEXTUAL_LEG_MAX_ACTIONS = 24;
const CONTEXTUAL_TEMPLATE_POOL = 6;
const CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT = 14;
// Extra completion search is deliberately a confidence bonus, not a second
// viability requirement. Every mode uses the same adaptive uncertainty rule;
// alternative-retention callers merely move along it more slowly.
const CONTEXTUAL_OPTIONAL_COMPLETION_RATIO = 0.12;
const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START = 0.45;
const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP = 0.70;
const CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER = 1.75;
function getProgramHistoryWindow(history) {
  return (history || []).slice(-PROGRAM_HISTORY_WINDOW_SIZE);
}

// Search-state identity deliberately uses a coarser summary than the literal
// rolling card allocator. Hard legality is still checked on every concrete branch
// by getRollingProgramResourceContext(); this signature only decides when two
// already-legal speculative futures may share a dominance bucket.
//
// Why this is intentionally lossy:
// - Dev View must show a real five-register program, so concrete parent chains are
//   never synthesized from the summary.
// - The previous turn is itself an abstraction of a 20-card deck / 9-card hand,
//   and far-future exact allocation correlations are not useful predictions.
// - Low-copy cards are the ones whose depletion materially changes plausible next
//   programs. Four-copy cards retain hard legality checks but do not fragment the
//   dominance key merely because their speculative usage differed.
// - Again availability and the immediately previous action remain explicit because
//   they can change whether the very next register is playable.
function getProgramCacheSignature(history, absoluteActions) {
  // Exact rolling two-program identity, including depletion of the common four-copy
  // cards.  The allocator already interns this complete compatible-pair state, so
  // cache/dominance keys can use the numeric id without rebuilding a second
  // lower-fidelity signature.
  return `q${getRollingProgramResourceContext(history, absoluteActions).pairSignatureId}`;
}

function getDynamicGoalCachePhase(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) {
    return "-";
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  if (periodLength > 0 && absoluteActions >= periodStart) {
    return `${periodStart}+${(absoluteActions - periodStart) % periodLength}`;
  }

  return String(
    Math.min(absoluteActions, Math.max(0, positions.length - 1))
  );
}

const CONTEXTUAL_FACING_CODE = Object.freeze({ N: 0, E: 1, S: 2, W: 3 });
const CONTEXTUAL_COORD_OFFSET = 32768;
const CONTEXTUAL_COORD_RADIX = 65536;
const CONTEXTUAL_GOAL_PHASE_RADIX = 65536;
const APPROX_PROGRAM_DEMAND_RADIX = REGISTER_COUNT + 1;
const APPROX_PROGRAM_DEMAND_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (let index = 0; index < PROGRAM_CARD_IDS.length; index += 1) {
    weights.push(weight);
    weight *= APPROX_PROGRAM_DEMAND_RADIX;
  }
  return weights;
})());
const APPROX_PROGRAM_DEMAND_SPACE = Math.pow(
  APPROX_PROGRAM_DEMAND_RADIX,
  PROGRAM_CARD_IDS.length
);
const APPROX_PROGRAM_DEMAND_INDEX = new Map(
  PROGRAM_CARD_IDS.map((id, index) => [id, index])
);
const APPROX_ROLLING_HARD_IDS = Object.freeze([
  ...PROGRAM_CARD_IDS.filter((id) => (PROGRAM_CARD_COUNTS.get(id) || 0) <= 2),
  "AGAIN"
]);
const APPROX_ROLLING_HARD_LIMITS = Object.freeze(
  APPROX_ROLLING_HARD_IDS.map((id) => (
    id === "AGAIN" ? AGAIN_CARD_COUNT : (PROGRAM_CARD_COUNTS.get(id) || 0)
  ))
);
const APPROX_ROLLING_HARD_RADICES = Object.freeze(
  APPROX_ROLLING_HARD_LIMITS.map((limit) => limit + 1)
);
const APPROX_ROLLING_HARD_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (const radix of APPROX_ROLLING_HARD_RADICES) {
    weights.push(weight);
    weight *= radix;
  }
  return weights;
})());
const APPROX_ROLLING_HARD_SPACE = APPROX_ROLLING_HARD_RADICES.reduce(
  (product, radix) => product * radix,
  1
);
const APPROX_ROLLING_HARD_INDEX = new Map(
  APPROX_ROLLING_HARD_IDS.map((id, index) => [id, index])
);

function createContextualNumericFallbackInterner() {
  const root = new Map();
  let nextId = -1;
  return (...parts) => {
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = Number(parts[index]);
      let child = node.get(part);
      if (!(child instanceof Map)) {
        child = new Map();
        node.set(part, child);
      }
      node = child;
    }
    const last = Number(parts.at(-1));
    if (!node.has(last)) {
      node.set(last, nextId);
      nextId -= 1;
    }
    return node.get(last);
  };
}

const contextualNumericFallbackId = createContextualNumericFallbackInterner();

function getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) return 0;
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && absolute >= periodStart
    ? periodStart + ((absolute - periodStart) % periodLength)
    : Math.min(absolute, Math.max(0, positions.length - 1));
  return phase + 1;
}

function getContextualPhysicalRegisterCode(state, absoluteActions) {
  const x = Math.floor(Number(state?.x));
  const y = Math.floor(Number(state?.y));
  const facingCode = CONTEXTUAL_FACING_CODE[state?.facing ?? "E"];
  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  if (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= -CONTEXTUAL_COORD_OFFSET && x < CONTEXTUAL_COORD_OFFSET &&
    y >= -CONTEXTUAL_COORD_OFFSET && y < CONTEXTUAL_COORD_OFFSET &&
    Number.isInteger(facingCode)
  ) {
    return (
      (((x + CONTEXTUAL_COORD_OFFSET) * CONTEXTUAL_COORD_RADIX +
        (y + CONTEXTUAL_COORD_OFFSET)) * 4 + facingCode) *
        REGISTER_COUNT + phase
    );
  }
  return contextualNumericFallbackId(x, y, facingCode ?? -1, phase);
}

function getContextualPhysicalGoalCode(state, absoluteActions, dynamicGoal) {
  const physicalCode = getContextualPhysicalRegisterCode(state, absoluteActions);
  const goalPhaseCode = getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions);
  if (
    physicalCode >= 0 &&
    goalPhaseCode >= 0 && goalPhaseCode < CONTEXTUAL_GOAL_PHASE_RADIX
  ) {
    return physicalCode * CONTEXTUAL_GOAL_PHASE_RADIX + goalPhaseCode;
  }
  return contextualNumericFallbackId(physicalCode, goalPhaseCode);
}

function getContextualSearchNumericStateParts(
  state,
  absoluteActions,
  programCardState,
  dynamicGoal
) {
  return {
    physicalGoalCode: getContextualPhysicalGoalCode(
      state,
      absoluteActions,
      dynamicGoal
    ),
    cardStateCode: getCompactProgramCardStateCode(programCardState)
  };
}

function getContextualBestCost(bestCostByState, parts) {
  return bestCostByState
    .get(parts.physicalGoalCode)
    ?.get(parts.cardStateCode);
}

function setContextualBestCost(bestCostByState, parts, cost) {
  let cardCosts = bestCostByState.get(parts.physicalGoalCode);
  if (!cardCosts) {
    cardCosts = new Map();
    bestCostByState.set(parts.physicalGoalCode, cardCosts);
  }
  cardCosts.set(parts.cardStateCode, cost);
}

function getApproxProgramDemandCount(code, actionId) {
  const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
  if (!Number.isInteger(index)) return 0;
  return Math.floor(
    Math.max(0, Number(code) || 0) / APPROX_PROGRAM_DEMAND_WEIGHTS[index]
  ) % APPROX_PROGRAM_DEMAND_RADIX;
}

function addApproxProgramDemandUse(code, actionId) {
  const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
  if (!Number.isInteger(index)) return null;
  const current = getApproxProgramDemandCount(code, actionId);
  if (current >= REGISTER_COUNT) return null;
  return (Number(code) || 0) + APPROX_PROGRAM_DEMAND_WEIGHTS[index];
}

function getApproxRollingHardCount(code, resourceId) {
  const index = APPROX_ROLLING_HARD_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return 0;
  return Math.floor(
    Math.max(0, Number(code) || 0) / APPROX_ROLLING_HARD_WEIGHTS[index]
  ) % APPROX_ROLLING_HARD_RADICES[index];
}

function addApproxRollingHardUse(code, resourceId) {
  const index = APPROX_ROLLING_HARD_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return null;
  const current = getApproxRollingHardCount(code, resourceId);
  if (current >= APPROX_ROLLING_HARD_LIMITS[index]) return null;
  return (Number(code) || 0) + APPROX_ROLLING_HARD_WEIGHTS[index];
}

function getApproxProgramDemandPenalty(actionId, ordinalUse) {
  const copies = PROGRAM_CARD_COUNTS.get(actionId) || 0;
  const use = Math.max(1, Math.floor(Number(ordinalUse) || 1));
  if (copies >= 4) return [0, 0, 0.08, 0.35, 1.05, 2.8][use] ?? 4;
  if (copies === 3) return [0, 0.04, 0.28, 1.0, 2.6][use] ?? 4;
  if (copies === 2) return [0, 0.16, 0.9, 2.7][use] ?? 4;
  if (copies === 1) return [0, 0.65, 2.7][use] ?? 4;
  return 4;
}

function getApproxProgramCombinationPlausibilityPenalty(
  demandCode,
  currentAgainUsed = 0
) {
  return getProgramCombinationPlausibilityPenaltyFromUses((resourceId) => {
    if (resourceId === "AGAIN") {
      return Math.max(0, Math.floor(Number(currentAgainUsed) || 0));
    }
    return getApproxProgramDemandCount(demandCode, resourceId);
  });
}

function getEstimatedRollingDemandPenalty(actionId, rollingNaturalUses) {
  const copies = PROGRAM_CARD_COUNTS.get(actionId) || 0;
  const uses = Math.max(1, Math.floor(Number(rollingNaturalUses) || 1));
  const overflow = Math.max(0, uses - copies);
  const pressure = copies > 0 ? uses / copies : uses;

  // v30: this is preference only, never legality. The useful signal is that a
  // singleton or two-copy action already used in the previous program should be
  // expensive to demand again, while abundant cards can tolerate some overlap.
  // Overflow remains finite because exact realization, not estimation, owns the
  // hard rolling two-program rule.
  if (overflow > 0) {
    const base = copies <= 1 ? 4.5 : copies === 2 ? 3.2 : copies === 3 ? 2.0 : 1.35;
    return base + overflow * (copies <= 2 ? 2.2 : 1.1);
  }
  if (pressure >= 1) return copies <= 2 ? 1.65 : copies === 3 ? 0.85 : 0.45;
  if (pressure >= 0.75) return copies <= 2 ? 0.8 : 0.32;
  if (pressure >= 0.5) return copies <= 2 ? 0.35 : 0.12;
  return 0;
}

// v30 estimate guidance is still deliberately soft: it remembers the previous
// program's natural demand and a greedy estimate of Again use so the first
// physical route is more likely to admit a literal card assignment. None of
// these fields participates in dominance identity and no card pressure can make
// a physically reachable state unreachable. Exact realization remains the only
// hard rolling-card legality gate.
function getEstimatedProgramDemandStep(
  previousDemandCode,
  currentDemandCode,
  previousAgainUsed,
  currentAgainUsed,
  previousActionId,
  absoluteActions,
  actionId
) {
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const phase = absolute % REGISTER_COUNT;
  const previousNaturalUses = getApproxProgramDemandCount(previousDemandCode, actionId);
  const currentNaturalUses = getApproxProgramDemandCount(currentDemandCode, actionId);
  const nextCurrentDemandCode = addApproxProgramDemandUse(currentDemandCode, actionId);

  const naturalPenalty = nextCurrentDemandCode === null
    ? Infinity
    : getApproxProgramDemandPenalty(actionId, currentNaturalUses + 1) +
      getEstimatedRollingDemandPenalty(
        actionId,
        previousNaturalUses + currentNaturalUses + 1
      );

  const rollingAgainUsed = Math.max(0, Number(previousAgainUsed) || 0) +
    Math.max(0, Number(currentAgainUsed) || 0);
  const canApproximateAgain = (
    phase > 0 &&
    previousActionId === actionId &&
    rollingAgainUsed < AGAIN_CARD_COUNT
  );
  // Again is useful but not free: a small cost keeps the estimator from spending
  // its one rolling copy frivolously when a natural card is equally plausible.
  const againPenalty = canApproximateAgain ? 0.22 : Infinity;
  const currentCombinationPenalty = getApproxProgramCombinationPlausibilityPenalty(
    currentDemandCode,
    currentAgainUsed
  );
  const naturalCombinationPenalty = nextCurrentDemandCode === null
    ? Infinity
    : Math.max(
      0,
      getApproxProgramCombinationPlausibilityPenalty(
        nextCurrentDemandCode,
        currentAgainUsed
      ) - currentCombinationPenalty
    );
  const againCombinationPenalty = canApproximateAgain
    ? Math.max(
      0,
      getApproxProgramCombinationPlausibilityPenalty(
        currentDemandCode,
        1
      ) - currentCombinationPenalty
    )
    : Infinity;
  const naturalTotalPenalty = naturalPenalty + naturalCombinationPenalty;
  const againTotalPenalty = againPenalty + againCombinationPenalty;
  const useAgain = againTotalPenalty + 0.001 < naturalTotalPenalty;

  let nextPreviousDemandCode = Math.max(0, Number(previousDemandCode) || 0);
  let nextDemandCode = useAgain
    ? Math.max(0, Number(currentDemandCode) || 0)
    : (nextCurrentDemandCode ?? Math.max(0, Number(currentDemandCode) || 0));
  let nextPreviousAgainUsed = Math.max(0, Number(previousAgainUsed) || 0);
  let nextCurrentAgainUsed = useAgain ? 1 : Math.max(0, Number(currentAgainUsed) || 0);
  let nextPreviousActionId = actionId;
  const nextAbsoluteActions = absolute + 1;

  if (nextAbsoluteActions % REGISTER_COUNT === 0) {
    nextPreviousDemandCode = nextDemandCode;
    nextDemandCode = 0;
    nextPreviousAgainUsed = nextCurrentAgainUsed;
    nextCurrentAgainUsed = 0;
    nextPreviousActionId = null;
  }

  return {
    previousDemandCode: nextPreviousDemandCode,
    demandCode: nextDemandCode,
    previousAgainUsed: nextPreviousAgainUsed,
    currentAgainUsed: nextCurrentAgainUsed,
    previousActionId: nextPreviousActionId,
    previousScarceCode: 0,
    currentScarceCode: 0,
    penalty: Number((Math.min(naturalTotalPenalty, againTotalPenalty) || 0).toFixed(3)),
    approximateProgramCard: useAgain ? "AGAIN" : actionId
  };
}

function getApproxProgramDemandCodeFromCompactResourceCode(compactCode) {
  let demandCode = 0;
  for (const actionId of PROGRAM_CARD_IDS) {
    const uses = getCompactProgramResourceCount(compactCode, actionId);
    const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
    if (!Number.isInteger(index) || uses <= 0) continue;
    demandCode += uses * APPROX_PROGRAM_DEMAND_WEIGHTS[index];
  }
  return demandCode;
}

function getEstimatedDemandStateFromCompactCardState(cardState) {
  if (!cardState || cardState.feasible === false) {
    return {
      previousDemandCode: 0,
      demandCode: 0,
      previousAgainUsed: 0,
      currentAgainUsed: 0,
      previousActionId: null
    };
  }
  return {
    previousDemandCode: getApproxProgramDemandCodeFromCompactResourceCode(
      cardState.previousCode
    ),
    demandCode: getApproxProgramDemandCodeFromCompactResourceCode(
      cardState.currentCode
    ),
    previousAgainUsed: getCompactProgramResourceCount(
      cardState.previousCode,
      "AGAIN"
    ),
    currentAgainUsed: getCompactProgramResourceCount(
      cardState.currentCode,
      "AGAIN"
    ),
    previousActionId: cardState.previousActionId ?? null
  };
}

function walkEstimatedProgramDemand(
  actionIds,
  absoluteActions = 0,
  initialState = null
) {
  let previousDemandCode = Math.max(0, Number(initialState?.previousDemandCode) || 0);
  let demandCode = Math.max(0, Number(initialState?.demandCode) || 0);
  let previousAgainUsed = Math.max(0, Number(initialState?.previousAgainUsed) || 0);
  let currentAgainUsed = Math.max(0, Number(initialState?.currentAgainUsed) || 0);
  let previousActionId = initialState?.previousActionId ?? null;
  let workingAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  let penalty = 0;
  for (const actionId of actionIds || []) {
    const step = getEstimatedProgramDemandStep(
      previousDemandCode,
      demandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId,
      workingAbsoluteActions,
      actionId
    );
    if (!step) continue;
    penalty += step.penalty;
    previousDemandCode = step.previousDemandCode;
    demandCode = step.demandCode;
    previousAgainUsed = step.previousAgainUsed;
    currentAgainUsed = step.currentAgainUsed;
    previousActionId = step.previousActionId;
    workingAbsoluteActions += 1;
  }
  return {
    penalty: Number(penalty.toFixed(3)),
    state: {
      previousDemandCode,
      demandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId
    },
    absoluteActions: workingAbsoluteActions
  };
}

function scoreEstimatedProgramDemand(actionIds, absoluteActions = 0, initialState = null) {
  return walkEstimatedProgramDemand(
    actionIds,
    absoluteActions,
    initialState
  ).penalty;
}

function finalizeApproxProgramDemandOption(option, absoluteActions, actionId) {
  const nextAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0)) + 1;
  if (nextAbsoluteActions % REGISTER_COUNT !== 0) {
    return { ...option, previousActionId: actionId };
  }
  return {
    ...option,
    previousScarceCode: option.currentScarceCode,
    currentScarceCode: 0,
    demandCode: 0,
    previousActionId: null
  };
}

function getApproxProgramDemandOptions(
  demandCode,
  previousScarceCode,
  currentScarceCode,
  previousActionId,
  absoluteActions,
  actionId
) {
  const copies = PROGRAM_CARD_COUNTS.get(actionId) || 0;
  if (copies <= 0) return [];
  const currentUses = getApproxProgramDemandCount(demandCode, actionId);
  const nextDemandCode = addApproxProgramDemandUse(demandCode, actionId);
  if (nextDemandCode === null) return [];
  const ordinalPenalty = getApproxProgramDemandPenalty(actionId, currentUses + 1);
  const optionsOut = [];

  if (copies <= 2) {
    const previousUses = getApproxRollingHardCount(previousScarceCode, actionId);
    const currentNaturalUses = getApproxRollingHardCount(currentScarceCode, actionId);
    if (previousUses + currentNaturalUses < copies) {
      const nextCurrentScarceCode = addApproxRollingHardUse(currentScarceCode, actionId);
      if (nextCurrentScarceCode !== null) {
        optionsOut.push(finalizeApproxProgramDemandOption({
          demandCode: nextDemandCode,
          previousScarceCode,
          currentScarceCode: nextCurrentScarceCode,
          penalty: ordinalPenalty,
          approximateProgramCard: actionId
        }, absoluteActions, actionId));
      }
    }
  } else {
    // Three/four-copy cards are deliberately not hard-depleted across programs.
    // Within one program, their repeated use is bounded and progressively weighted.
    if (currentUses < copies) {
      optionsOut.push(finalizeApproxProgramDemandOption({
        demandCode: nextDemandCode,
        previousScarceCode,
        currentScarceCode,
        penalty: ordinalPenalty,
        approximateProgramCard: actionId
      }, absoluteActions, actionId));
    }
  }

  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  const previousAgain = getApproxRollingHardCount(previousScarceCode, "AGAIN");
  const currentAgain = getApproxRollingHardCount(currentScarceCode, "AGAIN");
  if (
    phase > 0 &&
    previousActionId === actionId &&
    previousAgain + currentAgain < AGAIN_CARD_COUNT
  ) {
    const nextCurrentScarceCode = addApproxRollingHardUse(currentScarceCode, "AGAIN");
    if (nextCurrentScarceCode !== null) {
      optionsOut.push(finalizeApproxProgramDemandOption({
        demandCode: nextDemandCode,
        previousScarceCode,
        currentScarceCode: nextCurrentScarceCode,
        penalty: ordinalPenalty +
          getProgramCardScarcityUnitCost(AGAIN_CARD_COUNT) * AGAIN_REPEAT_SCARCITY_FACTOR,
        approximateProgramCard: "AGAIN"
      }, absoluteActions, actionId));
    }
  }

  return optionsOut;
}

function getApproxProgramDemandStateCode(
  demandCode,
  previousScarceCode,
  currentScarceCode,
  previousActionId
) {
  const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(previousActionId) || 0;
  const combined = (
    (((Math.max(0, Math.floor(Number(previousScarceCode) || 0)) *
      APPROX_ROLLING_HARD_SPACE +
      Math.max(0, Math.floor(Number(currentScarceCode) || 0))) *
      APPROX_PROGRAM_DEMAND_SPACE +
      Math.max(0, Math.floor(Number(demandCode) || 0))) *
      COMPACT_PROGRAM_ACTION_RADIX +
      actionCode)
  );
  return Number.isSafeInteger(combined)
    ? combined
    : contextualNumericFallbackId(
      previousScarceCode,
      currentScarceCode,
      demandCode,
      actionCode
    );
}

function getNestedBestCost(bestCostByState, primaryCode, secondaryCode) {
  return bestCostByState.get(primaryCode)?.get(secondaryCode);
}

function setNestedBestCost(bestCostByState, primaryCode, secondaryCode, cost) {
  let secondary = bestCostByState.get(primaryCode);
  if (!secondary) {
    secondary = new Map();
    bestCostByState.set(primaryCode, secondary);
  }
  secondary.set(secondaryCode, cost);
}

function getContextualLegCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  const fastCardState = options.contextualFastCardState !== false;
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context.absoluteActions, context.hazardExposure, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    getContextualProgramCacheSignature(context),
    !fastCardState && isRouteAwareBatteryScoringActive(options)
      ? `a${context.absoluteActions}`
      : null,
    !fastCardState
      ? (getRouteEnergyShadowReserveKey(context.energyReserve, options) || null)
      : null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

function getContextualTemplateCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context.absoluteActions, context.hazardExposure, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    isRouteAwareBatteryScoringActive(options) ? `a${context.absoluteActions}` : null,
    getRouteEnergyShadowReserveKey(context.energyReserve, options) || null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

// Shared physical/timing identity for the v22 later-leg catalogue. Register phase
// is deliberately immutable: all robots share one five-register board clock, so a
// route beginning on register 2 is not a substitute for the same geometry beginning
// on register 4. Previous-program depletion, Energy reserve, accumulated hazard and
// original dock identity are baggage, not catalogue identity; they are replayed or
// repriced after a trace is discovered. Moving goals contribute their physical phase.
// Home Reboot keeps a start namespace because its legal reboot token set really is
// start-specific rather than historical bookkeeping.
function getContextualSharedLegCatalogueKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared"
) {
  return [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].join("|");
}

function getContextualProgramCacheSignature(context) {
  if (context?.programCardState) {
    // Leg-level cache lookup happens once per context, not once per expansion.
    // Keep an explicit prefix for collision safety/readability; the expanded-state
    // hot path is numeric.
    return `c${getCompactProgramCardStateCode(context.programCardState)}`;
  }
  return getProgramCacheSignature(context?.history, context?.absoluteActions);
}

function routeReachesContextualGoal(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return (
    route.finalState.x === target.x &&
    route.finalState.y === target.y
  );
}

function createContextualQueueEntry(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return {
    ...route,
    estimate: route.baseCost + heuristic(route.finalState, target) * 5
  };
}

function getContextualUsageParetoDescriptor(rawKey, rawCost = 0) {
  // v13 folds card-copy usage and Again allocation into one canonical rolling
  // resource signature. The old Dev-only tracked-card Pareto probe depended on
  // named per-card fields in the key, so it is intentionally disabled rather
  // than reporting a misleading dominance estimate for the new representation.
  return {
    key: String(rawKey),
    groupKey: String(rawKey),
    usage: [],
    cost: Number(rawCost) || 0
  };
}

function contextualUsageParetoDominates(left, right) {
  if (!left || !right || left.groupKey !== right.groupKey) return false;
  if (left.cost > right.cost + 0.001) return false;

  let strictlyBetter = left.cost < right.cost - 0.001;
  for (let index = 0; index < right.usage.length; index += 1) {
    if ((left.usage[index] ?? 0) > (right.usage[index] ?? 0)) return false;
    if ((left.usage[index] ?? 0) < (right.usage[index] ?? 0)) strictlyBetter = true;
  }
  return strictlyBetter;
}

function summarizeContextualUsageParetoOpportunity(bestCostByState) {
  const groups = new Map();

  for (const [rawKey, rawCost] of bestCostByState.entries()) {
    const descriptor = getContextualUsageParetoDescriptor(rawKey, rawCost);
    if (!groups.has(descriptor.groupKey)) groups.set(descriptor.groupKey, []);
    groups.get(descriptor.groupKey).push(descriptor);
  }

  let states = 0;
  let dominated = 0;
  let multiStateGroups = 0;

  for (const entries of groups.values()) {
    states += entries.length;
    if (entries.length < 2) continue;
    multiStateGroups += 1;

    for (let index = 0; index < entries.length; index += 1) {
      const candidate = entries[index];
      let isDominated = false;
      for (let otherIndex = 0; otherIndex < entries.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        const other = entries[otherIndex];
        if (contextualUsageParetoDominates(other, candidate)) {
          isDominated = true;
          break;
        }
      }
      if (isDominated) dominated += 1;
    }
  }

  return {
    dominanceUsageParetoStates: states,
    dominanceUsageParetoDominated: dominated,
    dominanceUsageParetoMultiStateGroups: multiStateGroups
  };
}

function summarizeContextualDominanceKeySpace(bestCostByState) {
  const unique = {
    physical: new Set(),
    physicalPhase: new Set(),
    noProgramDetail: new Set(),
    noPrevious: new Set(),
    noUsage: new Set(),
    noAgain: new Set(),
    noAbsolute: new Set(),
    noEnergy: new Set(),
    noCards: new Set(),
    noEconomyShadow: new Set(),
    noGoal: new Set()
  };

  const withoutRestPart = (parts, predicate) => parts.filter((part, index) => (
    index < 2 || !predicate(part)
  )).join("|");

  for (const rawKey of bestCostByState.keys()) {
    const parts = String(rawKey).split("|");
    const physical = parts[0] ?? "";
    const program = parts[1] ?? "";
    const programParts = program.split(":");
    const phase = programParts.find((part) => /^r\d+$/.test(part)) ?? "r?";
    const rest = parts.slice(2);

    unique.physical.add(physical);
    unique.physicalPhase.add(`${physical}|${phase}`);
    unique.noProgramDetail.add([physical, phase, ...rest].join("|"));
    unique.noPrevious.add([
      physical,
      programParts.filter((part) => (
        !part.startsWith("p") && !part.startsWith("v")
      )).join(":"),
      ...rest
    ].join("|"));
    unique.noUsage.add([
      physical,
      programParts.filter((part) => !/^[uv][0-9a-z-]+$/i.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAgain.add([
      physical,
      programParts.filter((part) => !/^[ag][01]$/.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAbsolute.add(withoutRestPart(parts, (part) => /^a\d+$/.test(part)));
    unique.noEnergy.add(withoutRestPart(parts, (part) => /^@e/.test(part)));
    unique.noCards.add(withoutRestPart(parts, (part) => /^@c/.test(part)));
    unique.noEconomyShadow.add(withoutRestPart(parts, (part) => /^@(e|c)/.test(part)));
    unique.noGoal.add(withoutRestPart(parts, (part) => /^g/.test(part)));
  }

  return {
    ...summarizeContextualUsageParetoOpportunity(bestCostByState),
    dominanceKeysFull: bestCostByState.size,
    dominanceKeysPhysical: unique.physical.size,
    dominanceKeysPhysicalPhase: unique.physicalPhase.size,
    dominanceKeysNoProgramDetail: unique.noProgramDetail.size,
    dominanceKeysNoPrevious: unique.noPrevious.size,
    dominanceKeysNoUsage: unique.noUsage.size,
    dominanceKeysNoAgain: unique.noAgain.size,
    dominanceKeysNoAbsolute: unique.noAbsolute.size,
    dominanceKeysNoEnergy: unique.noEnergy.size,
    dominanceKeysNoCards: unique.noCards.size,
    dominanceKeysNoEconomyShadow: unique.noEconomyShadow.size,
    dominanceKeysNoGoal: unique.noGoal.size
  };
}

function getContextualOptionalCompletionAllowance(
  context,
  maxExpansions,
  firstGoalExpansion,
  maxOutputRoutes,
  options = {}
) {
  if (!(maxExpansions > 0)) return 0;

  const configured = Number(options.optionalCompletionExpansions);
  const baseAllowance = Number.isFinite(configured)
    ? Math.max(0, Math.floor(configured))
    : Math.max(0, Math.floor(maxExpansions * CONTEXTUAL_OPTIONAL_COMPLETION_RATIO));
  if (baseAllowance <= 0) return 0;

  // If proving route #1 already consumed most of the leg budget, do not spend
  // more search effort on route diversity. Board/hazard complexity naturally
  // feeds this signal because difficult physical routes tend to reach the first
  // goal later in the search.
  const effortRatio = Math.max(0, firstGoalExpansion) / maxExpansions;
  if (effortRatio >= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP) return 0;
  const effortFactor = effortRatio <= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    ? 1
    : (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP - effortRatio
    ) / (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP -
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    );

  // Exact long-horizon hand/economy forecasting becomes less trustworthy as
  // the real game gets longer and intrinsically more hazardous. Player count is
  // deliberately absent here: multiplayer uncertainty comes later from actual
  // occupancy/interaction, not from counting robots twice.
  const elapsedPrograms = Math.max(0, Number(context.absoluteActions) || 0) / REGISTER_COUNT;
  const hazardExposure = Math.max(0, Number(context.hazardExposure) || 0);
  const uncertaintyPenalty = Math.min(
    0.60,
    elapsedPrograms * 0.04 + hazardExposure / 140
  );
  const forecastFactor = Math.max(0.40, 1 - uncertaintyPenalty);

  // When only one route will be returned, a second completion is merely a
  // chance to improve that one choice, so give it half the ordinary allowance.
  const outputFactor = maxOutputRoutes > 1 ? 1 : 0.5;
  const retentionFactor = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER
    : 1;
  return Math.max(
    0,
    Math.round(
      baseAllowance * effortFactor * forecastFactor * outputFactor * retentionFactor
    )
  );
}

// Compatibility-only hook for old diagnostic callers. Production v33 does not
// infer uncertainty from player count here; occupancy/interaction drives that later.
function getContextualTrafficUncertainty(options = {}) {
  const explicit = Number(options.contextualTrafficUncertainty);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1);
  return 0;
}

// v33 breadth labels are now derived from the same continuous confidence curve
// used by the traffic model. They are only an effort policy: exact card depletion,
// Energy replay and physical legality remain unchanged at every horizon. Before a
// traffic field exists, the breadth decision can use only elapsed registers and
// accumulated intrinsic hazard. The old "turn 2 uncertain / turn 3 speculative"
// rule and abstract player-count congestion proxy are retired from production.
const CONTEXTUAL_FORECAST_BANDS = Object.freeze({
  SOLID: "solid",
  UNCERTAIN: "uncertain",
  SPECULATIVE: "speculative"
});

function getContextualForecastBand(
  absoluteActions,
  hazardExposure = 0,
  options = {}
) {
  if (!(options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon)) {
    return CONTEXTUAL_FORECAST_BANDS.SOLID;
  }

  let confidence = getIntrinsicForecastConfidence(absoluteActions, hazardExposure, options);
  // Compatibility-only diagnostic override. Production v33 leaves this at zero;
  // real multiplayer uncertainty comes later from occupancy/interaction itself.
  const explicitLegacyUncertainty = getContextualTrafficUncertainty(options);
  if (explicitLegacyUncertainty > 0) {
    confidence *= Math.exp(-explicitLegacyUncertainty * 0.18);
  }

  if (confidence < FORECAST_SPECULATIVE_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.SPECULATIVE;
  }
  if (confidence < FORECAST_SOLID_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.UNCERTAIN;
  }
  return CONTEXTUAL_FORECAST_BANDS.SOLID;
}

function getContextualBreadthPolicy(
  context,
  requestedRoutes,
  requestedCompletionPool,
  requestedBeamWidth,
  requestedOptionalExpansions,
  options = {}
) {
  const routes = Math.max(1, Math.floor(Number(requestedRoutes) || 1));
  const completionPool = Math.max(routes, Math.floor(Number(requestedCompletionPool) || routes));
  const beamWidth = Math.max(1, Math.floor(Number(requestedBeamWidth) || 1));
  const optional = Math.max(0, Math.floor(Number(requestedOptionalExpansions) || 0));
  const band = getContextualForecastBand(
    context?.absoluteActions,
    context?.hazardExposure,
    options
  );

  if (band === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    return {
      band,
      maxRoutes: 1,
      completionPool: 1,
      beamWidth: 1,
      optionalCompletionExpansions: 0
    };
  }

  if (band === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    const fullShare = Number(options.contextualFullForecastShare);
    // Standard and faster modes collapse to one route as soon as the future is
    // uncertain. Balanced/Thorough may retain two, but never more than two.
    const uncertainRouteCap = Number.isFinite(fullShare) && fullShare >= 0.72 ? 2 : 1;
    const reducedRoutes = Math.min(routes, uncertainRouteCap);
    return {
      band,
      maxRoutes: reducedRoutes,
      completionPool: Math.max(reducedRoutes, Math.min(completionPool, uncertainRouteCap)),
      beamWidth: Math.max(1, Math.min(beamWidth, uncertainRouteCap)),
      optionalCompletionExpansions: reducedRoutes > 1
        ? Math.min(optional, Number.isFinite(fullShare) && fullShare >= 0.84 ? 80 : 45)
        : 0
    };
  }

  return {
    band,
    maxRoutes: routes,
    completionPool,
    beamWidth,
    optionalCompletionExpansions: optional
  };
}

function getPhysicalTimingTemplateStateKey(state, absoluteActions, dynamicGoal) {
  return getContextualPhysicalGoalCode(state, absoluteActions, dynamicGoal);
}

// v24 later-leg discovery deliberately ignores speculative card/Energy baggage.
// It searches only exact board physics + facing + the synchronized register clock.
// The returned action traces are *templates*, never player-visible routes: every
// concrete lineage must pass rebaseContextualCachedRoute(), which replays exact
// rolling two-program depletion and the Energy economy before the trace can be used.
function enumeratePhysicalTimingLegTemplates(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const dynamicGoal = options.dynamicGoal ?? null;
  const maxRoutes = Math.max(1, Math.floor(Number(options.maxRoutes) || 1));
  const maxExpansions = Math.max(1, Math.floor(Number(options.maxExpansions) || 700));
  const maxActions = Math.max(1, Math.floor(Number(options.maxActions) || CONTEXTUAL_LEG_MAX_ACTIONS));
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = { ...options, portalMap };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(simulationOptions);
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostByState = new Map();
  const forbiddenFirstActions = new Set(
    Array.isArray(options.contextualForbiddenFirstActions)
      ? options.contextualForbiddenFirstActions
      : []
  );
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];
  for (const facing of initialFacings) {
    const initialState = { x: context.state.x, y: context.state.y, facing };
    const root = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      localActions: 0,
      absoluteActions: context.absoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      approximateCardPlausibilityPenalty: 0,
      approximatePreviousProgramDemandCode:
        Math.max(0, Number(context.approximatePreviousProgramDemandCode) || 0),
      approximateProgramDemandCode:
        Math.max(0, Number(context.approximateProgramDemandCode) || 0),
      approximatePreviousAgainUsed:
        Math.max(0, Number(context.approximatePreviousAgainUsed) || 0),
      approximateCurrentAgainUsed:
        Math.max(0, Number(context.approximateCurrentAgainUsed) || 0),
      approximatePreviousScarceCode: 0,
      approximateCurrentScarceCode: 0,
      approximatePreviousActionId: context.approximatePreviousActionId ?? null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(
        context.estimatedCardFrontier,
        context.programCardState
      ),
      estimatedCardForecastFeasible:
        context.estimatedCardForecastFeasible !== false &&
        cloneEstimatedCardForecastFrontier(
          context.estimatedCardFrontier,
          context.programCardState
        ).length > 0,
      estimatedCardForecastPenalty: 0,
      // v33: Energy is advisory during physical discovery, just like the card
      // forecast. It may change route ordering but never physical dominance or
      // reachability. Exact/flattened economy is replayed again after realization.
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      routeEnergyShadowReserve: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0)
    };
    const physicalKey = getPhysicalTimingTemplateStateKey(
      initialState,
      root.absoluteActions,
      dynamicGoal
    );
    const demandKey = options.contextualEstimatedCardWeightsOnly
      ? 0
      : getApproxProgramDemandStateCode(0, 0, 0, null);
    setNestedBestCost(bestCostByState, physicalKey, demandKey, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal),
      searchPhysicalKey: physicalKey,
      searchDemandKey: demandKey
    });
  }

  const completed = [];
  const completedPathKeys = new Set();
  let expansions = 0;
  let firstGoalExpansion = null;
  let optionalTemplateStopExpansion = null;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let physicalCacheHits = 0;
  let physicalCacheMisses = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    if (
      optionalTemplateStopExpansion !== null &&
      expansions >= optionalTemplateStopExpansion
    ) {
      break;
    }
    const current = queue.pop();
    const currentPhysicalKey = current.searchPhysicalKey ?? getPhysicalTimingTemplateStateKey(
      current.finalState,
      current.absoluteActions,
      dynamicGoal
    );
    const currentDemandKey = current.searchDemandKey ?? (
      options.contextualEstimatedCardWeightsOnly
        ? 0
        : getApproxProgramDemandStateCode(
          current.approximateProgramDemandCode,
          current.approximatePreviousScarceCode,
          current.approximateCurrentScarceCode,
          current.approximatePreviousActionId
        )
    );
    const knownBest = getNestedBestCost(
      bestCostByState,
      currentPhysicalKey,
      currentDemandKey
    );
    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) continue;

    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);
    if (routeReachesContextualGoal(current, goal, dynamicGoal)) {
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
      const template = {
        path,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: dynamicGoal
          ? {
            checkpointId: dynamicGoal.id ?? null,
            position: hitTarget,
            space: getDynamicGoalSpace(dynamicGoal, hitTarget),
            actions: current.absoluteActions,
            positions: dynamicGoal.positions ?? [],
            displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity({ transitions }, hitTarget),
        rebootCount: transitions.filter((transition) => transition.rebooted).length,
        score: Number(current.baseCost.toFixed(2)),
        routeEnergyEconomyRewardScore: Number(
          (current.routeEnergyEconomyRewardScore || 0).toFixed(2)
        ),
        batteryEconomyRewardScore: Number(
          (current.batteryEconomyRewardScore || 0).toFixed(2)
        ),
        powerUpEconomyRewardScore: Number(
          (current.powerUpEconomyRewardScore || 0).toFixed(2)
        ),
        chopShopEconomyRewardScore: Number(
          (current.chopShopEconomyRewardScore || 0).toFixed(2)
        ),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve,
        routeUpgradeCardShadowUnitsStart: 0,
        routeUpgradeCardShadowUnitsEnd: 0,
        routeEconomyNormalDraws: 0,
        routeEconomyInstalls: 0,
        routeEconomyExtraCardDraws: 0,
        routeEconomyEnergySpent: 0,
        chopShopCardChoices: 0,
        chopShopEnergyChoices: 0,
        cardAvailabilityPenalty: 0,
        programPlausibilityPenalty: 0,
        approximateCardPlausibilityPenalty: Number(
          (current.approximateCardPlausibilityPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastPenalty: Number(
          (current.estimatedCardForecastPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastFeasible:
          current.estimatedCardForecastFeasible !== false,
        estimatedCardFrontierEnd: cloneEstimatedCardForecastFrontier(
          current.estimatedCardFrontier
        ),
        estimatedDemandStateEnd: {
          previousDemandCode: current.approximatePreviousProgramDemandCode || 0,
          demandCode: current.approximateProgramDemandCode || 0,
          previousAgainUsed: current.approximatePreviousAgainUsed || 0,
          currentAgainUsed: current.approximateCurrentAgainUsed || 0,
          previousActionId: current.approximatePreviousActionId ?? null
        },
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: [],
        goalReached: true,
        fullCourseLeg: true,
        physicalTimingTemplate: true
      };
      if (
        (options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) &&
        routeTouchesPit(tileMap, template)
      ) {
        continue;
      }
      const templatePathKey = options.contextualReturnAllEstimatedPaths
        ? getEstimatedRouteIdentity(template)
        : getRoutePathKey(template);
      if (completedPathKeys.has(templatePathKey)) {
        continue;
      }
      completedPathKeys.add(templatePathKey);
      completed.push(template);
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (maxRoutes > 1) {
          optionalTemplateStopExpansion = Math.min(
            maxExpansions,
            expansions + Math.max(
              0,
              Math.floor(Number(options.optionalTemplateExpansions) || 120)
            )
          );
        }
      }
      continue;
    }

    expansions += 1;
    if (current.localActions >= maxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
    for (const action of ACTIONS) {
      if (current.localActions === 0 && forbiddenFirstActions.has(action.id)) {
        continue;
      }
      const estimatedDemandStep = options.contextualEstimatedCardWeightsOnly
        ? getEstimatedProgramDemandStep(
          current.approximatePreviousProgramDemandCode,
          current.approximateProgramDemandCode,
          current.approximatePreviousAgainUsed,
          current.approximateCurrentAgainUsed,
          current.approximatePreviousActionId,
          current.absoluteActions,
          action.id
        )
        : null;
      const demandSteps = options.contextualEstimatedCardWeightsOnly
        ? (estimatedDemandStep ? [estimatedDemandStep] : [])
        : options.contextualApproximateCardWeights
          ? getApproxProgramDemandOptions(
            current.approximateProgramDemandCode,
            current.approximatePreviousScarceCode,
            current.approximateCurrentScarceCode,
            current.approximatePreviousActionId,
            current.absoluteActions,
            action.id
          )
          : [{
            demandCode: current.approximateProgramDemandCode || 0,
            previousScarceCode: current.approximatePreviousScarceCode || 0,
            currentScarceCode: current.approximateCurrentScarceCode || 0,
            previousActionId: action.id,
            penalty: 0,
            approximateProgramCard: action.id
          }];
      if (!demandSteps.length) continue;

      const forecastStep = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false
      )
        ? advanceEstimatedCardForecastFrontier(
          current.estimatedCardFrontier,
          current.absoluteActions,
          action.id,
          options
        )
        : {
          feasible: false,
          frontier: []
        };
      const forecastBreakPenalty = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false &&
        !forecastStep.feasible
      )
        ? ESTIMATED_CARD_FORECAST_BREAK_PENALTY
        : 0;

      // All approximate literal-card allocations produce the same executed board
      // action. Simulate the physical transition once, then branch only the tiny
      // projected card-demand state.
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT
        },
        physicalOptionSignature
      );
      if (physicalResult.hit) physicalCacheHits += 1;
      else physicalCacheMisses += 1;
      const transition = physicalResult.transition;
      if (transition.crashed || transition.blocked) continue;

      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2"
        ? 0.25
        : action.id === "FORWARD_3"
          ? 0.75
          : 0;
      const conveyorComplexity = scoreTransitionConveyorComplexity(transition, currentTarget);
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];

      for (const demandStep of demandSteps) {
        for (const destination of destinations) {
          const nextAbsoluteActions = current.absoluteActions + 1;
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(nextAbsoluteActions)
            : (transition.rebootPenalty || 0);
          const energyStep = options.contextualEstimatedEnergyGuidance === false
            ? {
              rewardScore: 0,
              batteryRewardScore: 0,
              powerUpRewardScore: 0,
              chopShopRewardScore: 0,
              reserveAfter: current.routeEnergyShadowReserve
            }
            : getRouteEnergyShadowStep(
              tileMap,
              destination,
              action.id,
              nextAbsoluteActions,
              current.routeEnergyShadowReserve,
              0,
              options
            );
          const energyEconomyRewardScore = Math.max(
            0,
            Number(energyStep.rewardScore) || 0
          );
          const nextBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            weightedDistance(transition.distance, transition.forcedDistance) +
            actionPenalty +
            reversePenalty +
            heavyMovePenalty +
            conveyorComplexity +
            demandStep.penalty +
            forecastBreakPenalty -
            energyEconomyRewardScore;
          const nextPhysicalKey = getPhysicalTimingTemplateStateKey(
            destination,
            nextAbsoluteActions,
            dynamicGoal
          );
          const nextDemandKey = options.contextualEstimatedCardWeightsOnly
            ? 0
            : getApproxProgramDemandStateCode(
              demandStep.demandCode,
              demandStep.previousScarceCode,
              demandStep.currentScarceCode,
              demandStep.previousActionId
            );
          const priorBest = getNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey
          );
          if (priorBest !== undefined && nextBaseCost >= priorBest - 0.001) continue;
          setNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey,
            nextBaseCost
          );

          const transitionForDestination = transition.rebootChoices?.length
            ? { ...transition, to: destination }
            : transition;
          const nextRoute = {
            finalState: destination,
            initialState: current.initialState,
            startFacing: current.startFacing,
            parent: current,
            transition: transitionForDestination,
            localActions: current.localActions + 1,
            absoluteActions: nextAbsoluteActions,
            distance: current.distance + transition.distance,
            forcedDistance: current.forcedDistance + transition.forcedDistance,
            hazard: current.hazard + transition.hazard,
            rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
            baseCost: nextBaseCost,
            approximateCardPlausibilityPenalty:
              (current.approximateCardPlausibilityPenalty || 0) + demandStep.penalty,
            approximatePreviousProgramDemandCode:
              demandStep.previousDemandCode ?? current.approximatePreviousProgramDemandCode ?? 0,
            approximateProgramDemandCode: demandStep.demandCode,
            approximatePreviousAgainUsed:
              demandStep.previousAgainUsed ?? current.approximatePreviousAgainUsed ?? 0,
            approximateCurrentAgainUsed:
              demandStep.currentAgainUsed ?? current.approximateCurrentAgainUsed ?? 0,
            approximatePreviousScarceCode: demandStep.previousScarceCode,
            approximateCurrentScarceCode: demandStep.currentScarceCode,
            approximatePreviousActionId: demandStep.previousActionId,
            estimatedCardFrontier: forecastStep.feasible
              ? forecastStep.frontier
              : [],
            estimatedCardForecastFeasible:
              current.estimatedCardForecastFeasible !== false &&
              forecastStep.feasible,
            estimatedCardForecastPenalty:
              (current.estimatedCardForecastPenalty || 0) +
              forecastBreakPenalty,
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) +
              (Number(energyStep.batteryRewardScore) || 0),
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) +
              (Number(energyStep.powerUpRewardScore) || 0),
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) +
              (Number(energyStep.chopShopRewardScore) || 0),
            routeEnergyShadowReserve:
              Number.isFinite(Number(energyStep.reserveAfter))
                ? Number(energyStep.reserveAfter)
                : current.routeEnergyShadowReserve,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
            hazardExposure:
              Math.max(0, Number(current.hazardExposure) || 0) +
              Math.max(0, Number(transition.hazard) || 0)
          };
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal),
            searchPhysicalKey: nextPhysicalKey,
            searchDemandKey: nextDemandKey
          });
        }
      }
    }
  }

  const sortedCompleted = (options.contextualReturnAllEstimatedPaths
    ? (() => {
      const seen = new Set();
      return completed.filter((route) => {
        const key = getEstimatedRouteIdentity(route);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })()
    : dedupeRoutes(completed)
  ).sort((left, right) => left.score - right.score);
  const selected = options.contextualReturnAllEstimatedPaths
    ? sortedCompleted.slice(0, maxRoutes)
    : selectDistinctRoutes(
      sortedCompleted,
      goal,
      maxRoutes
    );
  const hitExpansionCap = expansions >= maxExpansions;
  selected.contextualSearchMeta = {
    expansions,
    maxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    firstGoalExpansion,
    optionalTemplateStopExpansion,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteCapFailure: selected.length === 0 && hitExpansionCap,
    zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
    physicalTimingTemplate: true,
    approximateCardWeights: Boolean(options.contextualApproximateCardWeights),
    estimatedCardWeightsOnly: Boolean(options.contextualEstimatedCardWeightsOnly),
    unboundedPhysicalEstimate: !Number.isFinite(maxExpansions) && !Number.isFinite(maxActions)
  };
  recordRouteSearchTelemetry(
    options.contextualTelemetryKind ?? "contextual-physical-template",
    telemetryStartedAt,
    {
      expansions,
      maxExpansions,
      completedRoutes: completed.length,
      returnedRoutes: selected.length,
      hitExpansionCap,
      actionHorizonStops,
      maxLocalActionsSeen,
      hitActionHorizon: actionHorizonStops > 0,
      zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
      physicalTimingTemplate: true,
      physicalCacheHits,
      physicalCacheMisses,
      start: {
        x: context.state.x,
        y: context.state.y,
        facing: context.state.facing ?? null
      },
      goal: { x: goal.x, y: goal.y }
    }
  );
  return selected;
}

function enumerateContextualLegRoutes(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const profile = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    actionScoringMs: 0,
    historyBuildMs: 0,
    destinationBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    completedGoals: 0,
    searchesWithGoal: 0,
    cappedZeroGoalSearches: 0,
    cappedWithGoalSearches: 0,
    firstGoalExpansionTotal: 0,
    postFirstGoalExpansions: 0,
    optionalCompletionSearches: 0,
    optionalCompletionStops: 0,
    optionalCompletionShortReturns: 0,
    cappedZeroGoalExpansions: 0,
    cappedWithGoalExpansions: 0,
    exactContextualSearches: 0,
    exactContextualExpansions: 0,
    horizonSolidSearches: 0,
    horizonUncertainSearches: 0,
    horizonSpeculativeSearches: 0,
    horizonFirstGoalUncertain: 0,
    horizonFirstGoalSpeculative: 0,
    horizonOptionalSuppressed: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0,
    dominanceKeysFull: 0,
    dominanceKeysPhysical: 0,
    dominanceKeysPhysicalPhase: 0,
    dominanceKeysNoProgramDetail: 0,
    dominanceKeysNoPrevious: 0,
    dominanceKeysNoUsage: 0,
    dominanceKeysNoAgain: 0,
    dominanceKeysNoAbsolute: 0,
    dominanceKeysNoEnergy: 0,
    dominanceKeysNoCards: 0,
    dominanceKeysNoEconomyShadow: 0,
    dominanceKeysNoGoal: 0,
    dominanceUsageParetoStates: 0,
    dominanceUsageParetoDominated: 0,
    dominanceUsageParetoMultiStateGroups: 0
  };
  const detailedProfiling = Boolean(
    options.contextualDetailedProfiling || options.contextualDominanceKeyProfiling
  );
  // Dev profiling used to call performance.now() around nearly every hot-path
  // operation. On million-state diagnostics the profiler itself became material.
  // Sample one popped search node in 16 and scale the block timings back up; route
  // search wall time and all expansion/action/cache counters remain exact.
  const profileSampleInterval = detailedProfiling ? 16 : 1;
  let profileSampleActive = detailedProfiling;
  let profilePoppedNodes = 0;
  let profileTimedNodes = 0;
  const profileNow = () => (profileSampleActive ? analysisTelemetryNow() : 0);

  const dynamicGoal = options.dynamicGoal ?? null;
  const maxOutputRoutes = options.maxRoutes ?? CONTEXTUAL_LATER_ROUTES;
  const completionPool = Math.max(
    maxOutputRoutes,
    options.completionPool ?? CONTEXTUAL_COMPLETION_POOL
  );
  const maxExpansions = options.maxExpansions ?? CONTEXTUAL_LATER_EXPANSIONS;
  const forcedActionIds = Array.isArray(options.contextualForcedActionIds)
    ? options.contextualForcedActionIds.filter((actionId) => typeof actionId === "string")
    : null;
  const maxActions = forcedActionIds
    ? forcedActionIds.length
    : (options.maxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS);
  const incumbentRoutes = Array.isArray(options.contextualIncumbentRoutes)
    ? dedupeRoutes(options.contextualIncumbentRoutes.filter(Boolean)).sort((left, right) => left.score - right.score)
    : [];
  // v23: the dominance identity is exact at every horizon. Card depletion from
  // the previous and current five-register programs therefore cannot disappear
  // merely because a route is long. Uncertainty is handled only by route breadth.
  const forecastBandAtStart = getContextualForecastBand(
    context.absoluteActions,
    context.hazardExposure,
    options
  );
  if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    profile.horizonSpeculativeSearches = 1;
  } else if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    profile.horizonUncertainSearches = 1;
  } else {
    profile.horizonSolidSearches = 1;
  }
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = { ...options, portalMap };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(
    simulationOptions
  );
  let queue = new MinHeap((entry) => entry.estimate);
  let bestCostByState = new Map();
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];

  // Economy shadow state depends on the incoming route context, not the startup
  // facing. Keep it outside the facing loop so accepted queue entries can safely
  // use the same fallback after the initial roots have been enqueued.
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  const initialEnergyReserve = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  const initialUpgradeCardUnits = Number.isFinite(Number(context.upgradeCardUnits))
    ? Number(context.upgradeCardUnits)
    : fallbackEconomyState.usefulCardUnits;

  for (const facing of initialFacings) {
    const initialState = {
      x: context.state.x,
      y: context.state.y,
      facing
    };
    const initialHistory = getProgramHistoryWindow(context.history);
    const initialProgramCardState = context.programCardState
      ? { ...context.programCardState }
      : getCompactProgramCardStateFromHistory(
        initialHistory,
        context.absoluteActions
      );
    if (!initialProgramCardState?.feasible) {
      continue;
    }
    const root = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      localActions: 0,
      absoluteActions: context.absoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: 0,
      routeEconomyInstalls: 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      baseCost: 0,
      cardAvailabilityPenalty: 0,
      programPlausibilityPenalty: 0,
      programCardState: initialProgramCardState,
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
    };

    let blockStartedAt = profileNow();
    const keyParts = getContextualSearchNumericStateParts(
      initialState,
      context.absoluteActions,
      initialProgramCardState,
      dynamicGoal
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    setContextualBestCost(bestCostByState, keyParts, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal),
      searchPhysicalGoalCode: keyParts.physicalGoalCode,
      searchCardStateCode: keyParts.cardStateCode
    });
    profile.queueMs += profileNow() - blockStartedAt;
  }

  const completed = [...incumbentRoutes];
  let expansions = 0;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let firstGoalExpansion = completed.length ? 0 : null;
  let optionalCompletionAllowance = completed.length
    ? getContextualOptionalCompletionAllowance(
      context,
      maxExpansions,
      0,
      maxOutputRoutes,
      options
    )
    : 0;
  let optionalCompletionStopExpansion = completed.length
    ? Math.min(maxExpansions, optionalCompletionAllowance)
    : null;
  let stoppedForOptionalCompletionBudget = false;
  if (completed.length) {
    profile.completedGoals = completed.length;
  }

  while (
    queue.size &&
    completed.length < completionPool &&
    expansions < maxExpansions
  ) {
    profileSampleActive = detailedProfiling &&
      (profilePoppedNodes % profileSampleInterval === 0);
    if (profileSampleActive) profileTimedNodes += 1;
    profilePoppedNodes += 1;

    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;
    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);

    profile.exactContextualSearches = 1;
    profile.exactContextualExpansions += 1;

    blockStartedAt = profileNow();
    const currentParts = {
      physicalGoalCode: current.searchPhysicalGoalCode ?? getContextualPhysicalGoalCode(
        current.finalState,
        current.absoluteActions,
        dynamicGoal
      ),
      cardStateCode: current.searchCardStateCode ?? getCompactProgramCardStateCode(
        current.programCardState
      )
    };
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = getContextualBestCost(bestCostByState, currentParts);
    if (
      knownBest !== undefined &&
      current.baseCost > knownBest + 0.001
    ) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(
      current,
      goal,
      dynamicGoal
    );
    if (reachesGoal) {
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = (
        getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
        goal
      );
      const route = {
        path,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: dynamicGoal
          ? {
            checkpointId: dynamicGoal.id ?? null,
            position: hitTarget,
            space: getDynamicGoalSpace(dynamicGoal, hitTarget),
            actions: current.absoluteActions,
            positions: dynamicGoal.positions ?? [],
            displayPositions:
              dynamicGoal.displayPositions ??
              dynamicGoal.positions ??
              []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity(
          { transitions },
          hitTarget
        ),
        rebootCount: transitions.filter(
          (transition) => transition.rebooted
        ).length,
        score: Number(current.baseCost.toFixed(2)),
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? initialEnergyReserve,
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? initialUpgradeCardUnits,
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        cardAvailabilityPenalty: Number(
          (current.cardAvailabilityPenalty || 0).toFixed(2)
        ),
        programPlausibilityPenalty: Number(
          (current.programPlausibilityPenalty || 0).toFixed(2)
        ),
        goalReached: true,
        fullCourseLeg: true,
        contextualForecastBand: getContextualForecastBand(
          current.absoluteActions,
          current.hazardExposure,
          options
        ),
        contextualHazardExposure: current.hazardExposure,
        // v25: witness actions are reconstructed only for an accepted route.
        // Search nodes carry card counts, not a growing action-history array.
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: getProgramHistoryWindow([
          ...getProgramHistoryWindow(context.history),
          ...transitions.map((transition) => transition.action).filter(Boolean)
        ]),
        programCardStateEnd: current.programCardState
          ? { ...current.programCardState }
          : null
      };

      if (
        (
          options.recoveryRule === "dynamic_archiving" ||
          !options.recoveryRule
        ) &&
        routeTouchesPit(tileMap, route)
      ) {
        profile.goalCompletionMs += profileNow() - blockStartedAt;
        continue;
      }

      profile.completedGoals += 1;
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (completionPool > 1) {
          const endpointBand = getContextualForecastBand(
            current.absoluteActions,
            current.hazardExposure,
            options
          );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
            profile.horizonFirstGoalSpeculative = 1;
          } else if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            profile.horizonFirstGoalUncertain = 1;
          }
          optionalCompletionAllowance = endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE
            ? 0
            : getContextualOptionalCompletionAllowance(
              context,
              maxExpansions,
              firstGoalExpansion,
              maxOutputRoutes,
              options
            );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            optionalCompletionAllowance = Math.min(optionalCompletionAllowance, 45);
          }
          if (completionPool > 1 && optionalCompletionAllowance <= 0) {
            profile.horizonOptionalSuppressed = 1;
          }
          optionalCompletionStopExpansion = Math.min(
            maxExpansions,
            firstGoalExpansion + optionalCompletionAllowance
          );
        }
      }
      completed.push(route);
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.goalCompletionMs += profileNow() - blockStartedAt;

    if (
      firstGoalExpansion !== null &&
      completionPool > 1 &&
      optionalCompletionStopExpansion !== null &&
      expansions >= optionalCompletionStopExpansion
    ) {
      stoppedForOptionalCompletionBudget = true;
      break;
    }

    expansions += 1;
    if (current.localActions >= maxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = (
      getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
      goal
    );
    const candidateActions = forcedActionIds
      ? (() => {
        const forcedId = forcedActionIds[current.localActions];
        const forcedAction = ACTIONS.find((action) => action.id === forcedId) ?? null;
        return forcedAction ? [forcedAction] : [];
      })()
      : ACTIONS;

    for (const action of candidateActions) {
      profile.actionCandidates += 1;
      const cardOptions = getCompactProgramCardOptions(
        current.programCardState,
        current.absoluteActions,
        action.id,
        options
      );
      if (!cardOptions.length) {
        profile.programLegalityPrunes += 1;
        continue;
      }

      // Every literal card allocation that produces this executed action shares
      // the same board transition. Simulate it once, then branch only the tiny
      // card-count state.
      blockStartedAt = profileNow();
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT
        },
        physicalOptionSignature
      );
      const transition = physicalResult.transition;
      profile.simulationCalls += 1;
      if (physicalResult.hit) {
        profile.physicalCacheHits += 1;
      } else {
        profile.physicalCacheMisses += 1;
      }
      profile.simulationMs += profileNow() - blockStartedAt;

      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2"
        ? 0.25
        : action.id === "FORWARD_3"
          ? 0.75
          : 0;
      const conveyorComplexity = scoreTransitionConveyorComplexity(
        transition,
        currentTarget
      );
      const nextAbsoluteActions = current.absoluteActions + 1;
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];
      profile.actionScoringMs += profileNow() - blockStartedAt;

      for (const cardOption of cardOptions) {
        const scarceReusePenalty = cardOption.penalty;
        const scarcityPenalty = Number(cardOption.scarcityPenalty) || 0;
        const programPlausibilityPenalty =
          Number(cardOption.programPlausibilityPenalty) || 0;
        for (const destination of destinations) {
          profile.destinationCandidates += 1;

          blockStartedAt = profileNow();
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(nextAbsoluteActions)
            : (transition.rebootPenalty || 0);
          const energyStep = getRouteEnergyShadowStep(
            tileMap,
            destination,
            action.id,
            nextAbsoluteActions,
            current.routeEnergyShadowReserve,
            current.routeUpgradeCardShadowUnits,
            options
          );
          const energyEconomyRewardScore = energyStep.rewardScore;
          const batteryEconomyRewardScore = energyStep.batteryRewardScore;
          const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
          const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;
          const nextHazardExposure =
            Math.max(0, Number(current.hazardExposure) || 0) +
            Math.max(0, Number(transition.hazard) || 0);
          const nextBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            weightedDistance(
              transition.distance,
              transition.forcedDistance
            ) +
            actionPenalty +
            reversePenalty +
            heavyMovePenalty +
            scarceReusePenalty +
            conveyorComplexity -
            energyEconomyRewardScore;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextParts = getContextualSearchNumericStateParts(
            destination,
            nextAbsoluteActions,
            cardOption.state,
            dynamicGoal
          );
          profile.nextKeyMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const priorBest = getContextualBestCost(bestCostByState, nextParts);
          if (
            priorBest !== undefined &&
            nextBaseCost >= priorBest - 0.001
          ) {
            profile.dominatedStates += 1;
            profile.dominanceMs += profileNow() - blockStartedAt;
            continue;
          }

          setContextualBestCost(bestCostByState, nextParts, nextBaseCost);
          profile.acceptedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const transitionForDestination = {
            ...(transition.rebootChoices?.length
              ? { ...transition, to: destination }
              : transition),
            // Executed movement remains `action`; this records which literal card
            // supplied it. Again is therefore just another card in Dev diagnostics.
            programCard: cardOption.programCardId
          };
          const nextRoute = {
            finalState: destination,
            initialState: current.initialState,
            startFacing: current.startFacing,
            parent: current,
            transition: transitionForDestination,
            localActions: current.localActions + 1,
            absoluteActions: nextAbsoluteActions,
            distance: current.distance + transition.distance,
            forcedDistance:
              current.forcedDistance + transition.forcedDistance,
            hazard: current.hazard + transition.hazard,
            rebootPenalty:
              current.rebootPenalty + transitionRebootPenalty,
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
            routeEnergyShadowReserve: energyStep.reserveAfter,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
            routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
            routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
            routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
            routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
            routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
            routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
            chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
            chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
            baseCost: nextBaseCost,
            cardAvailabilityPenalty:
              (current.cardAvailabilityPenalty || 0) +
              scarcityPenalty,
            programPlausibilityPenalty:
              (current.programPlausibilityPenalty || 0) +
              programPlausibilityPenalty,
            programCardState: cardOption.state,
            hazardExposure: nextHazardExposure
          };
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal),
            searchPhysicalGoalCode: nextParts.physicalGoalCode,
            searchCardStateCode: nextParts.cardStateCode
          });
          profile.queueMs += profileNow() - blockStartedAt;
        }
      }
    }
  }

  const deduped = dedupeRoutes(completed).sort(
    (left, right) => left.score - right.score
  );
  const selectedRoutes = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? selectContextualTrafficAlternativeRoutes(
      deduped,
      goal,
      maxOutputRoutes
    )
    : selectDistinctRoutes(
      deduped,
      goal,
      maxOutputRoutes
    );

  const profileTimingScale = detailedProfiling && profileTimedNodes > 0
    ? profilePoppedNodes / profileTimedNodes
    : 1;
  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "actionScoringMs",
    "historyBuildMs",
    "destinationBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number((profile[key] * profileTimingScale).toFixed(2));
  });
  profile.timingSampleInterval = profileSampleInterval;
  profile.timingSampledNodes = profileTimedNodes;
  profile.timingPopulationNodes = profilePoppedNodes;

  const hitExpansionCap = expansions >= maxExpansions;
  if (completed.length > 0) {
    profile.searchesWithGoal = 1;
    profile.firstGoalExpansionTotal = firstGoalExpansion ?? 0;
    profile.postFirstGoalExpansions = Math.max(
      0,
      expansions - (firstGoalExpansion ?? expansions)
    );
    if (completionPool > 1) {
      profile.optionalCompletionSearches = 1;
      profile.optionalCompletionStops = stoppedForOptionalCompletionBudget ? 1 : 0;
    }
  }
  if (selectedRoutes.length > 0 && selectedRoutes.length < maxOutputRoutes) {
    profile.optionalCompletionShortReturns = 1;
  }

  if (hitExpansionCap) {
    if (completed.length > 0) {
      profile.cappedWithGoalSearches = 1;
      profile.cappedWithGoalExpansions = expansions;
    } else {
      profile.cappedZeroGoalSearches = 1;
      profile.cappedZeroGoalExpansions = expansions;
    }
  }

  selectedRoutes.contextualSearchMeta = {
    expansions,
    maxExpansions,
    optionalCompletionAllowance,
    optionalCompletionStopExpansion,
    hitExpansionCap,
    stoppedAfterUsefulRoute: stoppedForOptionalCompletionBudget,
    zeroRouteCapFailure: (
      selectedRoutes.length === 0 &&
      hitExpansionCap
    ),
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: (
      selectedRoutes.length === 0 &&
      actionHorizonStops > 0
    ),
    forecastFidelity: "exact",
    uncertaintyMechanism: "breadth-only",
    forecastBandAtStart,
    forecastBandAtFirstGoal: completed[0]?.contextualForecastBand ?? null,
    firstGoalExpansion,
    completedGoals: completed.length
  };

  // Capture normal search duration before the dev-only key-space profiler.
  // This keeps route telemetry comparable with the non-profiling baseline.
  const routeSearchFinishedAt = analysisTelemetryNow();
  if (options.contextualDominanceKeyProfiling && !options.contextualFastCardState) {
    Object.assign(
      profile,
      summarizeContextualDominanceKeySpace(bestCostByState)
    );
  }

  recordRouteSearchTelemetry(
    options.contextualTelemetryKind ?? "contextual-leg",
    telemetryStartedAt,
    {
    durationMs: routeSearchFinishedAt - telemetryStartedAt,
    expansions,
    maxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: selectedRoutes.length === 0 && actionHorizonStops > 0,
    completedRoutes: completed.length,
    returnedRoutes: selectedRoutes.length,
    start: {
      x: context.state.x,
      y: context.state.y,
      facing: context.state.facing ?? null
    },
    goal: { x: goal.x, y: goal.y },
      ...(options.contextualTelemetryProfile === false
        ? {}
        : { contextualProfile: profile })
    }
  );
  return selectedRoutes;
}

function scoreContextualCardSequence(
  history,
  absoluteActions,
  actionIds,
  options = {},
  initialProgramCardState = null
) {
  const workingHistory = getProgramHistoryWindow(history);
  const initialCardState = initialProgramCardState
    ? { ...initialProgramCardState }
    : getCompactProgramCardStateFromHistory(
      workingHistory,
      absoluteActions
    );
  const compact = scoreCompactProgramCardSequence(
    initialCardState,
    absoluteActions,
    actionIds,
    options
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


// Public diagnostic wrapper around the same programming model used by route
// search: current-turn play is literal, previous-turn natural/Again use is hard
// depletion, and unknown unplayed cards are represented only by copy-count rarity.
export function summarizeProgramSequencePressure(
  history,
  absoluteActions,
  actionIds,
  options = {}
) {
  const result = scoreContextualCardSequence(history, absoluteActions, actionIds, options);
  return {
    feasible: result.feasible,
    penalty: result.penalty,
    scarcityPenalty: result.scarcityPenalty,
    programPlausibilityPenalty: result.programPlausibilityPenalty,
    programCardIds: result.programCardIds,
    absoluteActions: result.absoluteActions,
    registerPhase: absoluteActions % REGISTER_COUNT,
    endingRegisterPhase: result.absoluteActions % REGISTER_COUNT
  };
}

function replayContextualRouteEnergyForContext(
  tileMap,
  route,
  context,
  options = {}
) {
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  let energy = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  let totalReward = 0;
  let batteryReward = 0;
  let powerUpReward = 0;
  let chopShopReward = 0;
  let normalDraws = 0;
  let installs = 0;
  let extraCardDraws = 0;
  let energySpent = 0;
  let chopShopCardChoices = 0;
  let chopShopEnergyChoices = 0;

  for (let index = 0; index < (route.transitions || []).length; index += 1) {
    const transition = route.transitions[index];
    if (!transition?.to || !transition?.action) continue;
    const nextAbsoluteAction = context.absoluteActions + index + 1;
    const step = getRouteEnergyShadowStep(
      tileMap,
      transition.to,
      transition.action,
      nextAbsoluteAction,
      energy,
      0,
      options
    );
    totalReward += step.rewardScore || 0;
    batteryReward += step.batteryRewardScore || 0;
    powerUpReward += step.powerUpRewardScore || 0;
    chopShopReward += step.chopShopRewardScore || 0;
    normalDraws += step.normalDraws || 0;
    installs += step.installs || 0;
    extraCardDraws += step.extraCardDraws || 0;
    energySpent += step.energySpent || 0;
    chopShopCardChoices += step.chopShopChoice === "card" ? 1 : 0;
    chopShopEnergyChoices += step.chopShopChoice === "energy" ? 1 : 0;
    energy = step.reserveAfter;
  }

  return {
    routeEnergyEconomyRewardScore: Number(totalReward.toFixed(2)),
    batteryEconomyRewardScore: Number(batteryReward.toFixed(2)),
    powerUpEconomyRewardScore: Number(powerUpReward.toFixed(2)),
    chopShopEconomyRewardScore: Number(chopShopReward.toFixed(2)),
    routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
      ? Number(context.energyReserve)
      : fallbackEconomyState.energy,
    routeEnergyShadowReserveEnd: energy,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: normalDraws,
    routeEconomyInstalls: installs,
    routeEconomyExtraCardDraws: extraCardDraws,
    routeEconomyEnergySpent: energySpent,
    chopShopCardChoices,
    chopShopEnergyChoices
  };
}

function rebaseContextualCachedRoute(
  tileMap,
  route,
  context,
  options = {}
) {
  const cardState = scoreContextualCardSequence(
    context.history,
    context.absoluteActions,
    route.localActionIds,
    options,
    context.programCardState
  );
  if (!cardState.feasible) return null;

  // A shared later-leg catalogue trace keeps exact geometry/physics but must not
  // keep another start's resource valuation. Card scarcity/rolling legality and
  // the flattened Energy economy are cheap to replay on the already-discovered
  // transition chain, so the caller gets a route valid for *this* history.
  const economy = replayContextualRouteEnergyForContext(
    tileMap,
    route,
    context,
    options
  );
  const oldCardPenalty = route.cardAvailabilityPenalty || 0;
  const oldProgramPlausibilityPenalty = route.programPlausibilityPenalty || 0;
  const oldApproximateCardPenalty = route.approximateCardPlausibilityPenalty || 0;
  const oldEconomyReward = route.routeEnergyEconomyRewardScore || 0;
  const score = Number((
    route.score -
    oldCardPenalty -
    oldProgramPlausibilityPenalty -
    oldApproximateCardPenalty +
    cardState.scarcityPenalty +
    cardState.programPlausibilityPenalty +
    oldEconomyReward -
    economy.routeEnergyEconomyRewardScore
  ).toFixed(2));
  const movingTarget = route.movingTarget
    ? {
      ...route.movingTarget,
      actions: cardState.absoluteActions
    }
    : null;
  const contextualHazardExposure = (
    Math.max(0, Number(context.hazardExposure) || 0) +
    Math.max(0, Number(route.hazard) || 0)
  );

  const transitions = (route.transitions || []).map((transition, index) => ({
    ...transition,
    programCard: cardState.programCardIds?.[index] ?? transition.programCard ?? transition.action
  }));

  return {
    ...route,
    ...economy,
    transitions,
    absoluteStartAction: context.absoluteActions,
    absoluteActions: cardState.absoluteActions,
    movingTarget,
    score,
    cardAvailabilityPenalty: cardState.scarcityPenalty,
    programPlausibilityPenalty: cardState.programPlausibilityPenalty,
    approximateCardPlausibilityPenalty: 0,
    programHistoryEnd: cardState.history,
    programCardStateEnd: cardState.programCardState
      ? { ...cardState.programCardState }
      : null,
    contextualHazardExposure
  };
}

// v29 estimate-first routing helpers ----------------------------------------
//
// Physical estimates are deliberately independent of exact rolling card state.
// They are cheap, shared geometry/timing suggestions. Exact card realization is
// performed on the complete by-start route afterward; if it fails, only the
// physical suffix beginning at the first impossible register is re-estimated.
function buildEstimatedPhysicalRouteFromTransitions(
  initialState,
  transitions,
  absoluteStartAction,
  goal,
  dynamicGoal,
  options = {}
) {
  const safeTransitions = (transitions || []).map((transition) => ({ ...transition }));
  const startAbsolute = Math.max(0, Math.floor(Number(absoluteStartAction) || 0));
  const localActionIds = safeTransitions
    .map((transition) => transition?.action)
    .filter(Boolean);
  let distance = 0;
  let forcedDistance = 0;
  let hazard = 0;
  let rebootPenalty = 0;
  let conveyorComplexity = 0;
  let physicalBaseCost = 0;

  safeTransitions.forEach((transition, index) => {
    const actionId = transition?.action;
    const action = ACTIONS.find((candidate) => candidate.id === actionId) ?? null;
    const absoluteActions = startAbsolute + index;
    const nextAbsoluteActions = absoluteActions + 1;
    const currentTarget = getDynamicGoalPosition(dynamicGoal, absoluteActions) ?? goal;
    const transitionRebootPenalty = transition?.rebooted
      ? getRebootRoutePenalty(nextAbsoluteActions)
      : (transition?.rebootPenalty || 0);
    const actionPenalty = action ? getRouteAwareActionPenalty(action, options) : 0;
    const reversePenalty = actionId === "BACK" ? 1.4 : 0;
    const heavyMovePenalty = actionId === "FORWARD_2"
      ? 0.25
      : actionId === "FORWARD_3"
        ? 0.75
        : 0;
    const transitionConveyorComplexity = scoreTransitionConveyorComplexity(
      transition,
      currentTarget
    );
    distance += Number(transition?.distance) || 0;
    forcedDistance += Number(transition?.forcedDistance) || 0;
    hazard += Number(transition?.hazard) || 0;
    rebootPenalty += transitionRebootPenalty;
    conveyorComplexity += transitionConveyorComplexity;
    physicalBaseCost +=
      (Number(transition?.hazard) || 0) +
      transitionRebootPenalty +
      weightedDistance(
        Number(transition?.distance) || 0,
        Number(transition?.forcedDistance) || 0
      ) +
      actionPenalty +
      reversePenalty +
      heavyMovePenalty +
      transitionConveyorComplexity;
  });

  const approximateCardPlausibilityPenalty = scoreEstimatedProgramDemand(
    localActionIds,
    startAbsolute
  );
  const absoluteActions = startAbsolute + localActionIds.length;
  const finalState = safeTransitions.length
    ? cloneState(safeTransitions.at(-1).to)
    : cloneState(initialState);
  const hitTarget = getDynamicGoalPosition(dynamicGoal, absoluteActions) ?? goal;
  const route = {
    path: buildTimeline(safeTransitions, initialState),
    transitions: safeTransitions,
    finalState,
    initialState: cloneState(initialState),
    startFacing: initialState?.facing ?? "E",
    hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? null,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: absoluteActions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    actions: localActionIds.length,
    absoluteStartAction: startAbsolute,
    absoluteActions,
    distance: Number(distance.toFixed(2)),
    forcedDistance: Number(forcedDistance.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    rebootPenalty: Number(rebootPenalty.toFixed(2)),
    conveyorComplexity: Number(conveyorComplexity.toFixed(2)),
    rebootCount: safeTransitions.filter((transition) => transition?.rebooted).length,
    score: Number((physicalBaseCost + approximateCardPlausibilityPenalty).toFixed(2)),
    routeEnergyEconomyRewardScore: 0,
    batteryEconomyRewardScore: 0,
    powerUpEconomyRewardScore: 0,
    chopShopEconomyRewardScore: 0,
    routeEnergyShadowReserveStart: null,
    routeEnergyShadowReserveEnd: null,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: 0,
    routeEconomyInstalls: 0,
    routeEconomyExtraCardDraws: 0,
    routeEconomyEnergySpent: 0,
    chopShopCardChoices: 0,
    chopShopEnergyChoices: 0,
    cardAvailabilityPenalty: 0,
    programPlausibilityPenalty: 0,
    approximateCardPlausibilityPenalty,
    localActionIds,
    programHistoryEnd: [],
    goalReached: (
      finalState.x === hitTarget.x &&
      finalState.y === hitTarget.y
    ),
    fullCourseLeg: true,
    physicalTimingTemplate: true,
    estimatedPrimaryTemplate: true
  };
  return route;
}

function combineEstimatedPhysicalRouteSuffix(
  route,
  prefixActionCount,
  suffix,
  goal,
  dynamicGoal,
  options = {}
) {
  const prefixCount = Math.max(
    0,
    Math.min(
      route?.transitions?.length ?? 0,
      Math.floor(Number(prefixActionCount) || 0)
    )
  );
  const transitions = [
    ...(route?.transitions || []).slice(0, prefixCount),
    ...(suffix?.transitions || [])
  ];
  return buildEstimatedPhysicalRouteFromTransitions(
    route?.initialState ?? suffix?.initialState,
    transitions,
    route?.absoluteStartAction ?? 0,
    goal,
    dynamicGoal,
    options
  );
}

function getEstimatedRouteIdentity(route) {
  if (!route) return "-";
  const actions = (route.localActionIds || []).join(".");
  const destinations = (route.transitions || []).map((transition) => (
    `${transition?.to?.x ?? "?"},${transition?.to?.y ?? "?"},${transition?.to?.facing ?? "?"}`
  )).join(";");
  return [
    `a${route.absoluteStartAction ?? 0}`,
    actions,
    destinations
  ].join("|");
}

function getEstimatedRouteFailureConstraintKey(
  state,
  absoluteActions,
  prefixActionIds
) {
  const history = getProgramHistoryWindow(prefixActionIds || []);
  return [
    stateKey(state),
    `r${Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT}`,
    `h${history.join(".") || "-"}`
  ].join("|");
}

function realizeEstimatedLegsWithCardSolution(
  tileMap,
  estimatedLegs,
  initialContext,
  cardSolution,
  options = {}
) {
  if (!cardSolution?.feasible) return null;
  const exactLegs = [];
  let context = {
    ...initialContext,
    state: cloneState(initialContext.state),
    history: getProgramHistoryWindow(initialContext.history),
    programCardState: initialContext.programCardState
      ? { ...initialContext.programCardState }
      : null
  };
  let actionOffset = 0;

  for (let legIndex = 0; legIndex < estimatedLegs.length; legIndex += 1) {
    const estimatedLeg = estimatedLegs[legIndex];
    const localActionIds = [...(estimatedLeg?.localActionIds || [])];
    const actionCount = localActionIds.length;
    const programCardIds = cardSolution.programCardIds.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionPenalties = cardSolution.actionPenalties.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionScarcityPenalties = (
      cardSolution.actionScarcityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    const actionPlausibilityPenalties = (
      cardSolution.actionPlausibilityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    if (programCardIds.length !== actionCount) return null;

    const transitions = (estimatedLeg?.transitions || []).map((transition, index) => ({
      ...transition,
      programCard: programCardIds[index] ?? transition?.action
    }));
    const cardAvailabilityPenalty = actionScarcityPenalties.length === actionCount
      ? actionScarcityPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      )
      : actionPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      );
    const programPlausibilityPenalty = actionPlausibilityPenalties.reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    const oldApproximateCardPenalty = Number(
      estimatedLeg?.approximateCardPlausibilityPenalty
    ) || 0;
    const oldCardPenalty = Number(estimatedLeg?.cardAvailabilityPenalty) || 0;
    const oldProgramPlausibilityPenalty = Number(
      estimatedLeg?.programPlausibilityPenalty
    ) || 0;
    const oldEconomyReward = Number(
      estimatedLeg?.routeEnergyEconomyRewardScore
    ) || 0;
    const physicalScore = (
      (Number(estimatedLeg?.score) || 0) -
      oldApproximateCardPenalty -
      oldCardPenalty -
      oldProgramPlausibilityPenalty +
      oldEconomyReward
    );
    const absoluteStartAction = context.absoluteActions;
    const absoluteActions = absoluteStartAction + actionCount;
    const endCardState = actionCount > 0
      ? cardSolution.cardStates[actionOffset + actionCount - 1]
      : context.programCardState;
    const programHistoryEnd = getProgramHistoryWindow([
      ...getProgramHistoryWindow(context.history),
      ...localActionIds
    ]);
    const movingTarget = estimatedLeg?.movingTarget
      ? {
        ...estimatedLeg.movingTarget,
        actions: absoluteActions
      }
      : null;
    const contextualHazardExposure = (
      Math.max(0, Number(context.hazardExposure) || 0) +
      Math.max(0, Number(estimatedLeg?.hazard) || 0)
    );
    const exactBase = {
      ...estimatedLeg,
      transitions,
      absoluteStartAction,
      absoluteActions,
      movingTarget,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty
      ).toFixed(2)),
      cardAvailabilityPenalty: Number(cardAvailabilityPenalty.toFixed(2)),
      programPlausibilityPenalty: Number(programPlausibilityPenalty.toFixed(2)),
      approximateCardPlausibilityPenalty: 0,
      programHistoryEnd,
      programCardStateEnd: endCardState ? { ...endCardState } : null,
      contextualHazardExposure,
      physicalTimingTemplate: false,
      estimatedPrimaryTemplate: false
    };
    const economy = replayContextualRouteEnergyForContext(
      tileMap,
      exactBase,
      context,
      options
    );
    const exactLeg = {
      ...exactBase,
      ...economy,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty -
        economy.routeEnergyEconomyRewardScore
      ).toFixed(2)),
      contextualForecastBand: getContextualForecastBand(
        absoluteActions,
        contextualHazardExposure,
        options
      )
    };
    exactLegs.push(exactLeg);
    context = getContextAfterLeg(exactLeg, context);
    actionOffset += actionCount;
  }

  return {
    legs: exactLegs,
    context,
    score: exactLegs.reduce((sum, leg) => sum + (Number(leg.score) || 0), 0)
  };
}

function getContextAfterLeg(route, priorContext = null) {
  const priorHazard = Math.max(0, Number(priorContext?.hazardExposure) || 0);
  const routeHazard = Math.max(0, Number(route?.hazard) || 0);
  return {
    state: cloneState(route.finalState),
    absoluteActions: route.absoluteActions,
    history: getProgramHistoryWindow(route.programHistoryEnd),
    programCardState: route.programCardStateEnd
      ? { ...route.programCardStateEnd }
      : (priorContext?.programCardState ? { ...priorContext.programCardState } : null),
    energyReserve: Number.isFinite(Number(route.routeEnergyShadowReserveEnd))
      ? Number(route.routeEnergyShadowReserveEnd)
      : null,
    upgradeCardUnits: null,
    hazardExposure: Number.isFinite(Number(route.contextualHazardExposure))
      ? Number(route.contextualHazardExposure)
      : priorHazard + routeHazard
  };
}

function getPartialBeamCurrentLeg(partial) {
  return partial.legs.at(-1) ?? null;
}

function getContextualBeamWidthForPartials(partials, requestedWidth, options = {}) {
  const width = Math.max(1, Math.floor(Number(requestedWidth) || 1));
  if (!options.contextualUncertaintyBreadth || !Array.isArray(partials) || !partials.length) {
    return width;
  }
  const best = [...partials].filter(Boolean).sort(
    (left, right) => (left.score ?? Infinity) - (right.score ?? Infinity)
  )[0];
  if (!best?.context) return width;
  return getContextualBreadthPolicy(
    best.context,
    width,
    width,
    width,
    0,
    options
  ).beamWidth;
}

function selectContextualPartialBeam(
  partials,
  goal,
  width = CONTEXTUAL_BEAM_WIDTH,
  diversityOptions = {}
) {
  // Exact register-aware factory physics can legitimately eliminate every
  // continuation for a start on a later leg. Whole-route diversity used to
  // fall through to sorted[0].score in that case, producing the intermittent
  // "best.score" generation crash instead of an ordinary zero-route result.
  if (!Array.isArray(partials) || !partials.length || width <= 0) {
    return [];
  }

  if (partials.length <= width && !diversityOptions.wholePartialDiversity) {
    return [...partials].sort(
      (left, right) => left.score - right.score
    );
  }

  const sorted = [...partials].sort(
    (left, right) => left.score - right.score
  );
  const best = sorted[0];
  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.filter(
    (partial) => partial.score <= best.score + scoreAllowance
  );

  if (width === 1 || eligible.length === 1) {
    return [best];
  }

  const wholePartialDiversity = Boolean(
    diversityOptions.wholePartialDiversity
  );
  const partialFlags = Array.isArray(diversityOptions.flags)
    ? diversityOptions.flags
    : [];
  const bestComparisonRoute = wholePartialDiversity
    ? stitchContextualLegs(best.legs, partialFlags)
    : getPartialBeamCurrentLeg(best);
  let diverse = null;
  let diverseNovelty = -1;

  for (const candidate of eligible.slice(1)) {
    const candidateComparisonRoute = wholePartialDiversity
      ? stitchContextualLegs(candidate.legs, partialFlags)
      : getPartialBeamCurrentLeg(candidate);
    if (!candidateComparisonRoute || !bestComparisonRoute) {
      continue;
    }

    const novelty = 1 - routeSimilarity(
      candidateComparisonRoute,
      bestComparisonRoute,
      goal
    );
    if (
      novelty > diverseNovelty + 0.001 ||
      (
        Math.abs(novelty - diverseNovelty) <= 0.001 &&
        candidate.score < (diverse?.score ?? Infinity)
      )
    ) {
      diverse = candidate;
      diverseNovelty = novelty;
    }
  }

  return diverse && diverseNovelty >= 0.1
    ? [best, diverse].sort(
      (left, right) => left.score - right.score
    )
    : [best];
}

function stitchContextualLegs(legs, flags) {
  if (!legs?.length) {
    return null;
  }

  const transitions = legs.flatMap(
    (leg) => leg.transitions || []
  );
  const initialState = legs[0].initialState;
  const finalState = legs.at(-1).finalState;
  const path = buildTimeline(transitions, initialState);
  let cumulativeActions = 0;
  let cumulativeDistance = 0;
  let cumulativeForcedDistance = 0;
  let cumulativeHazard = 0;
  let cumulativeRebootPenalty = 0;
  let cumulativeBaseCost = 0;
  let cumulativeCardAvailabilityPenalty = 0;
  let cumulativeProgramPlausibilityPenalty = 0;
  let cumulativeRouteEnergyEconomyRewardScore = 0;
  let cumulativeBatteryEconomyRewardScore = 0;
  let cumulativePowerUpEconomyRewardScore = 0;
  let cumulativeChopShopEconomyRewardScore = 0;
  const checkpointHits = [];

  legs.forEach((leg, legIndex) => {
    cumulativeActions += leg.actions ?? 0;
    cumulativeDistance += leg.distance ?? 0;
    cumulativeForcedDistance += leg.forcedDistance ?? 0;
    cumulativeHazard += leg.hazard ?? 0;
    cumulativeRebootPenalty += leg.rebootPenalty ?? 0;
    cumulativeBaseCost += leg.score ?? 0;
    cumulativeCardAvailabilityPenalty += leg.cardAvailabilityPenalty ?? 0;
    cumulativeProgramPlausibilityPenalty += leg.programPlausibilityPenalty ?? 0;
    cumulativeRouteEnergyEconomyRewardScore += leg.routeEnergyEconomyRewardScore ?? 0;
    cumulativeBatteryEconomyRewardScore += leg.batteryEconomyRewardScore ?? 0;
    cumulativePowerUpEconomyRewardScore += leg.powerUpEconomyRewardScore ?? 0;
    cumulativeChopShopEconomyRewardScore += leg.chopShopEconomyRewardScore ?? 0;
    const flag = flags[legIndex];

    checkpointHits.push({
      checkpointIndex: legIndex,
      checkpointId: flag?.id ?? legIndex + 1,
      action: cumulativeActions,
      state: cloneState(leg.finalState),
      position: leg.hitTarget ?? flag,
      movingTarget: leg.movingTarget ?? null,
      distance: cumulativeDistance,
      forcedDistance: cumulativeForcedDistance,
      hazard: cumulativeHazard,
      rebootPenalty: cumulativeRebootPenalty,
      baseCost: cumulativeBaseCost,
      routeEnergyEconomyRewardScore: cumulativeRouteEnergyEconomyRewardScore,
      batteryEconomyRewardScore: cumulativeBatteryEconomyRewardScore,
      powerUpEconomyRewardScore: cumulativePowerUpEconomyRewardScore,
      chopShopEconomyRewardScore: cumulativeChopShopEconomyRewardScore,
      routeEnergyShadowReserve: leg.routeEnergyShadowReserveEnd ?? null,
      routeUpgradeCardShadowUnits: leg.routeUpgradeCardShadowUnitsEnd ?? null
    });
  });

  return {
    path,
    transitions,
    finalState,
    initialState,
    startFacing: legs[0].startFacing,
    checkpointHits,
    actionHistory: legs.flatMap(
      (leg) => leg.localActionIds || []
    ),
    actions: cumulativeActions,
    distance: Number(cumulativeDistance.toFixed(2)),
    forcedDistance: Number(
      cumulativeForcedDistance.toFixed(2)
    ),
    hazard: Number(cumulativeHazard.toFixed(2)),
    rebootPenalty: Number(cumulativeRebootPenalty.toFixed(2)),
    conveyorComplexity: Number(
      legs.reduce(
        (sum, leg) => sum + (leg.conveyorComplexity || 0),
        0
      ).toFixed(2)
    ),
    rebootCount: legs.reduce(
      (sum, leg) => sum + (leg.rebootCount || 0),
      0
    ),
    score: Number(cumulativeBaseCost.toFixed(2)),
    cardAvailabilityPenalty: Number(cumulativeCardAvailabilityPenalty.toFixed(2)),
    programPlausibilityPenalty: Number(cumulativeProgramPlausibilityPenalty.toFixed(2)),
    routeEnergyEconomyRewardScore: Number(cumulativeRouteEnergyEconomyRewardScore.toFixed(2)),
    batteryEconomyRewardScore: Number(cumulativeBatteryEconomyRewardScore.toFixed(2)),
    powerUpEconomyRewardScore: Number(cumulativePowerUpEconomyRewardScore.toFixed(2)),
    chopShopEconomyRewardScore: Number(cumulativeChopShopEconomyRewardScore.toFixed(2)),
    routeEnergyShadowReserveStart: legs[0].routeEnergyShadowReserveStart ?? null,
    routeEnergyShadowReserveEnd: legs.at(-1)?.routeEnergyShadowReserveEnd ?? null,
    routeUpgradeCardShadowUnitsStart: legs[0].routeUpgradeCardShadowUnitsStart ?? null,
    routeUpgradeCardShadowUnitsEnd: legs.at(-1)?.routeUpgradeCardShadowUnitsEnd ?? null,
    goalReached: true,
    fullCourse: true,
    legRoutes: legs
  };
}

function summarizeRouteAgainUsage(route) {
  const actions = Array.isArray(route?.actionHistory)
    ? route.actionHistory
    : [];
  const transitions = Array.isArray(route?.transitions)
    ? route.transitions
    : [];
  const literalCards = transitions.length === actions.length &&
    transitions.every((transition) => typeof transition?.programCard === "string")
    ? transitions.map((transition) => transition.programCard)
    : null;
  const programs = [];
  const cardPrograms = [];
  const againTurns = [];
  let literalProgramViolations = 0;
  let rollingWindowViolations = 0;

  for (let offset = 0, turnIndex = 0; offset < actions.length; offset += REGISTER_COUNT, turnIndex += 1) {
    const program = actions.slice(offset, offset + REGISTER_COUNT);
    programs.push(program);

    if (literalCards) {
      const cards = literalCards.slice(offset, offset + REGISTER_COUNT);
      cardPrograms.push(cards);
      const counts = new Map();
      cards.forEach((cardId, registerIndex) => {
        counts.set(cardId, (counts.get(cardId) || 0) + 1);
        if (cardId === "AGAIN") {
          if (
            registerIndex === 0 ||
            program[registerIndex] !== program[registerIndex - 1]
          ) {
            literalProgramViolations += 1;
          }
        }
      });
      for (const resourceId of COMPACT_PROGRAM_RESOURCE_IDS) {
        const limit = resourceId === "AGAIN"
          ? AGAIN_CARD_COUNT
          : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
        if ((counts.get(resourceId) || 0) > limit) {
          literalProgramViolations += 1;
          break;
        }
      }
      if (cards.includes("AGAIN")) againTurns.push(turnIndex);
    } else {
      const summary = getLiteralProgramResourceSummary(program);
      if (!summary.feasible) literalProgramViolations += 1;
      if (summary.requiresAgain) againTurns.push(turnIndex);
    }
  }

  if (literalCards) {
    for (let turnIndex = 1; turnIndex < cardPrograms.length; turnIndex += 1) {
      const previous = cardPrograms[turnIndex - 1];
      const current = cardPrograms[turnIndex];
      const combined = new Map();
      [...previous, ...current].forEach((cardId) => {
        combined.set(cardId, (combined.get(cardId) || 0) + 1);
      });
      const violation = COMPACT_PROGRAM_RESOURCE_IDS.some((resourceId) => {
        const limit = resourceId === "AGAIN"
          ? AGAIN_CARD_COUNT
          : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
        return (combined.get(resourceId) || 0) > limit;
      });
      if (violation) rollingWindowViolations += 1;
    }
  } else {
    for (let turnIndex = 1; turnIndex < programs.length; turnIndex += 1) {
      const previousStates = getLiteralProgramResourceStates(programs[turnIndex - 1]);
      const currentStates = getLiteralProgramResourceStates(programs[turnIndex]);
      const compatible = previousStates.some((previousState) => (
        currentStates.some((currentState) => (
          areRollingProgramResourceStatesCompatible(previousState, currentState)
        ))
      ));
      if (!compatible) rollingWindowViolations += 1;
    }
  }

  let consecutiveTurnAgainReuse = 0;
  for (let index = 1; index < againTurns.length; index += 1) {
    if (againTurns[index] === againTurns[index - 1] + 1) {
      consecutiveTurnAgainReuse += 1;
    }
  }

  return {
    againTurns: againTurns.length,
    consecutiveTurnAgainReuse,
    literalProgramViolations,
    rollingWindowViolations,
    literalCardAssignments: Boolean(literalCards)
  };
}

function summarizeSelectedProgrammingScarcity(startAnalyses = []) {
  const routeSummaries = (startAnalyses || [])
    .map((analysis) => summarizeRouteAgainUsage(analysis?.fullCourseRoute))
    .filter(Boolean);
  const routesUsingAgain = routeSummaries.filter((entry) => entry.againTurns > 0).length;
  const routesWithConsecutiveAgain = routeSummaries.filter(
    (entry) => entry.consecutiveTurnAgainReuse > 0
  ).length;
  const selectedRoutePlausibilityPenalties = (startAnalyses || [])
    .map((analysis) => Number(analysis?.fullCourseRoute?.programPlausibilityPenalty))
    .filter(Number.isFinite);
  return {
    selectedRoutes: routeSummaries.length,
    routesUsingAgain,
    totalAgainTurns: routeSummaries.reduce((sum, entry) => sum + entry.againTurns, 0),
    consecutiveTurnAgainReuse: routeSummaries.reduce(
      (sum, entry) => sum + entry.consecutiveTurnAgainReuse,
      0
    ),
    routesWithConsecutiveAgain,
    meanProgramPlausibilityPenalty: selectedRoutePlausibilityPenalties.length
      ? Number((
        selectedRoutePlausibilityPenalties.reduce((sum, value) => sum + value, 0) /
        selectedRoutePlausibilityPenalties.length
      ).toFixed(2))
      : 0,
    maxProgramPlausibilityPenalty: selectedRoutePlausibilityPenalties.length
      ? Number(Math.max(...selectedRoutePlausibilityPenalties).toFixed(2))
      : 0,
    routesWithCombinationPressure: selectedRoutePlausibilityPenalties.filter(
      (value) => value > 0.01
    ).length,
    literalProgramViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.literalProgramViolations,
      0
    ),
    rollingWindowViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.rollingWindowViolations,
      0
    ),
    rollingPreviousTurnDepletion: true,
    scarcityCostByCopies: { ...PROGRAM_CARD_SCARCITY_COST_BY_COPIES, 4: 0 },
    againBaseScarcity: getProgramCardScarcityUnitCost(AGAIN_CARD_COUNT),
    againRepeatScarcityFactor: AGAIN_REPEAT_SCARCITY_FACTOR
  };
}

function cloneContextualFullRouteForReuse(route) {
  if (!route) return route;
  return {
    ...route,
    path: route.path ? [...route.path] : route.path,
    trafficPath: route.trafficPath ? [...route.trafficPath] : route.trafficPath,
    legRoutes: (route.legRoutes || []).map((leg) => leg
      ? {
        ...leg,
        path: leg.path ? [...leg.path] : leg.path,
        trafficPath: leg.trafficPath ? [...leg.trafficPath] : leg.trafficPath,
        programHistoryEnd: leg.programHistoryEnd ? [...leg.programHistoryEnd] : leg.programHistoryEnd
      }
      : leg)
  };
}

function analyzeSeededFullCourseContextual(tileMap, starts, flags, options = {}) {
  const playerCount = options.playerCount ?? starts.length;
  const seedAnalyses = Array.isArray(options.contextualSeedStartAnalyses)
    ? options.contextualSeedStartAnalyses
    : [];
  const seedByIndex = new Map(seedAnalyses.map((analysis, index) => [
    Number.isInteger(analysis?.index) ? analysis.index : index,
    analysis
  ]));

  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const seed = seedByIndex.get(sourceIndex) ?? null;
    const sourceRoutes = seed?.fullCourseRoutes?.length
      ? seed.fullCourseRoutes
      : (seed?.fullCourseRoute ? [seed.fullCourseRoute] : []);
    const fullCourseRoutes = sourceRoutes
      .map(cloneContextualFullRouteForReuse)
      .filter(Boolean)
      .sort((left, right) => left.score - right.score);
    const fullCourseRoute = fullCourseRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: sourceIndex,
      start,
      reachable: Boolean(fullCourseRoute),
      fullCourseRoutes,
      fullCourseRoute,
      fullCourseRouteIndex: fullCourseRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const explicitRequiredStarts = Number(options.contextualRequiredStarts);
  const requiredSurvivingStarts = Number.isFinite(explicitRequiredStarts)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredStarts)))
    : Math.max(1, playerCount);
  const explicitPreferredStarts = Number(options.contextualPreferredStarts);
  const preferredSurvivingStarts = Number.isFinite(explicitPreferredStarts)
    ? Math.max(
      requiredSurvivingStarts,
      Math.min(starts.length, Math.floor(explicitPreferredStarts))
    )
    : null;
  let preferredCapacityShortCircuits = 0;
  const survivingStarts = startAnalyses.filter((analysis) => analysis.fullCourseRoute).length;
  if (options.contextualEarlyExit && survivingStarts < requiredSurvivingStarts) {
    const error = new Error(
      `Seeded contextual start capacity lost: ${survivingStarts}/${requiredSurvivingStarts} required starts remain`
    );
    error.code = "CONTEXTUAL_START_CAPACITY_LOST";
    error.contextualSearchHealth = {
      zeroRouteCapFailures: 0,
      distinctStarts: 0,
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      survivingStarts,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - survivingStarts),
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      flagCount: flags.length,
      seededRoutes: true,
      survivorHistory: [{
        legIndex: Math.max(0, flags.length - 1),
        legNumber: Math.max(1, flags.length),
        survivingStarts,
        requiredStarts: requiredSurvivingStarts,
        sourceStarts: starts.length,
        lostStarts: Math.max(0, starts.length - survivingStarts),
        cappedContextsThisLeg: 0,
        cappedStartsThisLeg: 0,
        totalCappedContexts: 0,
        distinctCappedStarts: 0,
        seededRoutes: true
      }]
    };
    throw error;
  }

  const selection = options.skipFullCourseTraffic
    ? {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      averageRawTrafficPenalty: 0,
      averageForecastConfidence: 1,
      minimumForecastConfidence: 1,
      averageTrafficByLeg: [],
      candidateDiagnostics: startAnalyses
        .filter((analysis) => analysis.reachable && analysis.fullCourseRoutes?.length)
        .map((analysis) => summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0]
        ))
    }
    : selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, {
      ...options,
      playerCount
    });
  const selectedStartAnalyses = selection.starts.map((analysis) => (
    buildStartAnalysisForSelectedFullRoute(analysis)
  ));
  const fullScores = selectedStartAnalyses
    .filter((item) => item.reachable && item.fullCourseRoute)
    .map((item) => item.fullCourseRoute.score + (item.fullCourseTrafficPenalty ?? 0));
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map((analysis) => {
    if (!analysis.fullCourseRoute) return analysis;
    const fullScore = analysis.fullCourseRoute.score + (analysis.fullCourseTrafficPenalty ?? 0);
    const rawDelta = fullScore - meanFullScore;
    return {
      ...analysis,
      courseEstimate: {
        ...analysis.courseEstimate,
        meanFullScore: Number(meanFullScore.toFixed(2)),
        delta: Number(rawDelta.toFixed(2))
      },
      courseScoreAdjustment: Number(clamp(rawDelta * 0.32, -10, 10).toFixed(2))
    };
  });

  selectAndScoreStartAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    playerCount,
    null,
    options
  );
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
    adjustedStartAnalyses,
    flags,
    playerCount
  );
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  const programmingScarcity = summarizeSelectedProgrammingScarcity(
    adjustedStartAnalyses
  );

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(meanFullScore.toFixed(2)),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      programmingScarcity,
      contextualLegRoutes: true,
      contextualLegCache: {
        entries: 0,
        templateEntries: 0,
        hits: 0,
        exactHits: 0,
        templateHits: 0,
        misses: 0,
        templateFallbacks: 0,
        zeroRouteCapFailures: 0,
        zeroRouteFailureStarts: 0,
        seededRoutes: true,
        seededStartCount: survivingStarts,
        survivorHistory: [{
          legIndex: Math.max(0, flags.length - 1),
          legNumber: Math.max(1, flags.length),
          survivingStarts,
          requiredStarts: requiredSurvivingStarts,
          sourceStarts: starts.length,
          lostStarts: Math.max(0, starts.length - survivingStarts),
          cappedContextsThisLeg: 0,
          cappedStartsThisLeg: 0,
          totalCappedContexts: 0,
          distinctCappedStarts: 0,
          seededRoutes: true
        }],
        survivingStarts,
        requiredSurvivingStarts,
        preferredSurvivingStarts,
        preferredCapacityShortCircuits,
        fastCardState: options.contextualFastCardState !== false,
        numericHotStateKeys: options.contextualFastCardState !== false,
        arrivalClassRouting: false,
        capacityPolicy: Number.isFinite(Number(options.contextualRequiredStarts))
          ? "explicit-floor"
          : "player-count-floor",
        zeroRouteCapsByLeg: flags.map((_, legIndex) => ({
          leg: legIndex + 1,
          contexts: 0,
          starts: 0
        }))
      },
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        // Seeded special-setup routing currently performs route selection only;
        // Normal v35 traffic-demand exploration belongs to estimate→realize.
        trafficEpochsExecuted: 0,
        alternateDemandStarts: 0,
        alternateDemandLegs: 0,
        alternateCachedWitnessChecks: 0,
        alternateNewSearches: 0,
        alternateExactChecks: 0,
        alternateExactRejects: 0,
        alternateCandidatesAdded: 0,
        alternateBestGain: 0,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        legAwareOverlap: true,
        contextualLegRoutes: true,
        seededRoutes: true,
        openingRoutesPerStart:
          options.contextualSeedRouteStrategy?.openingRoutesPerStart ?? 1,
        laterRoutesPerContext:
          options.contextualSeedRouteStrategy?.laterRoutesPerContext ?? 1,
        stitchedBeamWidth:
          options.contextualSeedRouteStrategy?.stitchedBeamWidth ?? 1,
        completionPool:
          options.contextualSeedRouteStrategy?.completionPool ?? 1,
        wholePartialDiversity: Boolean(
          options.contextualSeedRouteStrategy?.wholePartialDiversity
        ),
        openingLegWeight: FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight: FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

function normalizeOpeningSeedRoute(route) {
  if (!route) return null;
  const localActionIds = Array.isArray(route.localActionIds)
    ? [...route.localActionIds]
    : Array.isArray(route.programHistoryEnd)
      ? [...route.programHistoryEnd]
      : Array.isArray(route.actionHistory)
        ? [...route.actionHistory]
        : [];
  const absoluteActions = Number.isFinite(route.absoluteActions)
    ? route.absoluteActions
    : (route.actions ?? localActionIds.length);
  return {
    ...route,
    path: route.path ? [...route.path] : route.path,
    transitions: route.transitions ? [...route.transitions] : route.transitions,
    absoluteStartAction: 0,
    absoluteActions,
    localActionIds,
    programHistoryEnd: getProgramHistoryWindow(
      route.programHistoryEnd ?? route.actionHistory ?? localActionIds
    ),
    goalReached: route.goalReached !== false,
    fullCourseLeg: true
  };
}

function getContextualOpeningSeedMap(options = {}) {
  const analyses = Array.isArray(options.contextualOpeningSeedAnalyses)
    ? options.contextualOpeningSeedAnalyses
    : [];
  return new Map(analyses.map((analysis, index) => [
    Number.isInteger(analysis?.index) ? analysis.index : index,
    analysis
  ]));
}

function* analyzeFullCourseContextualSteps(
  tileMap,
  starts,
  flags,
  options = {}
) {
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const legCache = new Map();
  const templateCache = new Map();
  // v22: one lazy, baggage-relaxed catalogue per exact later checkpoint arrival
  // class. A capped catalogue search is remembered as unresolved for this candidate
  // so another start history cannot spend the same 1000/1200-expansion failure tail.
  const sharedLegCatalogueCache = new Map();
  // v29 estimate-first primary routing keeps a separate physical-leg cache.
  // These entries know board/facing/register timing and soft card-demand weight,
  // but never exact rolling card depletion. They are therefore reusable across
  // concrete start lineages that share the same physical arrival class.
  const estimatedLegCache = new Map();
  let estimatedLegSearches = 0;
  let estimatedLegWidenedSearches = 0;
  let estimatedLegCacheHits = 0;
  let estimatedLegWitnessesGenerated = 0;
  let estimatedMilestoneRoutes = 0;
  let estimatedPhysicalFailures = 0;
  let estimatedPhysicalFailureStarts = 0;
  let estimatedForecastIntactRoutes = 0;
  let exactRealizationAttempts = 0;
  let exactRealizationDirectSuccesses = 0;
  let exactRealizationRepairedSuccesses = 0;
  let exactRealizationFailures = 0;
  let cardRepairReplans = 0;
  let cardRepairFailurePoints = 0;
  let cardRepairPrefixBacktracks = 0;
  let cardRepairNoSuffix = 0;
  let cardRepairDownstreamRebuildFailures = 0;
  let cardRepairRepeatedCandidates = 0;
  // v33 traffic feedback is demand-driven. Primary routing stays exact and cheap;
  // traffic may reuse cached witnesses or open a small number of new leg searches.
  let trafficEpochsExecuted = 0;
  let trafficAlternateDemandStarts = 0;
  let trafficAlternateDemandLegs = 0;
  let trafficAlternateCachedWitnessChecks = 0;
  let trafficAlternateNewSearches = 0;
  let trafficAlternateExactChecks = 0;
  let trafficAlternateExactRejects = 0;
  let trafficAlternateCandidatesAdded = 0;
  let trafficAlternateBeneficialCandidates = 0;
  let trafficAlternateBestGain = 0;
  let trafficAlternateCachedProbeStops = 0;
  let trafficAlternateEscalations = 0;
  let trafficAlternateSearchNoRoutes = 0;
  let trafficAlternateCardRejects = 0;
  let trafficAlternateValidationRejects = 0;
  let trafficAlternateDuplicateRejects = 0;
  let trafficAlternateLowGainRejects = 0;
  let trafficAlternateDownstreamRebuildFailures = 0;
  let trafficAlternateEffectiveDemandLegs = 0;
  let trafficAlternateExploratoryDemandLegs = 0;
  let trafficAlternateEffortScaleSum = 0;
  let trafficAlternateEffortScaleCount = 0;
  let trafficAlternateMinimumEffortScale = 1;
  let trafficExplorationUncertaintyShare = 0;
  let trafficExplorationConfidenceFloor = 1;
  const trafficAlternateDemandByLeg = flags.map(() => 0);
  const trafficAlternateCandidatesByLeg = flags.map(() => 0);
  let cacheHits = 0;
  let templateHits = 0;
  let cacheMisses = 0;
  let templateFallbacks = 0;
  let catalogueLookups = 0;
  let catalogueCacheHits = 0;
  let catalogueSearches = 0;
  let catalogueCappedSearches = 0;
  let catalogueExhaustedSearches = 0;
  let catalogueSuppressedCappedLookups = 0;
  let catalogueReplayRouteChecks = 0;
  let catalogueCompatibleLineages = 0;
  let catalogueCompatibleRoutes = 0;
  let catalogueIncompatibleLineages = 0;
  let catalogueRefinementSearches = 0;
  let catalogueEnrichmentSearches = 0;
  let catalogueEnrichmentSuccesses = 0;
  let catalogueEnrichmentSuppressed = 0;
  let catalogueWitnessesGenerated = 0;
  let catalogueWitnessResolvedLineages = 0;
  const catalogueWitnessRankSuccesses = [];
  let finalProgrammingValidationFailures = 0;
  const arrivalClassKeysByLeg = flags.map(() => new Set());
  const arrivalClassLineagesByLeg = flags.map(() => new Map());
  let zeroRouteCapFailures = 0;
  let zeroRouteHorizonFailures = 0;
  const zeroRouteFailureStarts = new Set();
  const zeroRouteHorizonFailureStarts = new Set();
  const zeroRouteCapsByLeg = flags.map(() => 0);
  const zeroRouteHorizonsByLeg = flags.map(() => 0);
  const zeroRouteFailureStartsByLeg = flags.map(() => new Set());
  const zeroRouteHorizonFailureStartsByLeg = flags.map(() => new Set());
  const survivorHistory = [];
  const earlyExitEnabled = Boolean(options.contextualEarlyExit);
  const openingSeedByIndex = getContextualOpeningSeedMap(options);
  let seededOpeningStarts = 0;
  const explicitRequiredStarts = Number(options.contextualRequiredStarts);
  const requiredSurvivingStarts = Number.isFinite(explicitRequiredStarts)
    ? Math.max(1, Math.min(starts.length, Math.floor(explicitRequiredStarts)))
    : Math.max(1, playerCount);
  const explicitPreferredStarts = Number(options.contextualPreferredStarts);
  const preferredSurvivingStarts = Number.isFinite(explicitPreferredStarts)
    ? Math.max(
      requiredSurvivingStarts,
      Math.min(starts.length, Math.floor(explicitPreferredStarts))
    )
    : null;
  const stopWhenPreferredLost = Boolean(
    options.contextualStopWhenPreferredLost && preferredSurvivingStarts
  );
  let preferredCapacityShortCircuits = 0;
  let capacityRescueSearches = 0;
  let capacityRescueSuccesses = 0;
  let capacityPhysicalRescueSearches = 0;
  let capacityPhysicalRescueSuccesses = 0;
  let capacityHorizonRescueSearches = 0;
  let capacityHorizonRescueSuccesses = 0;
  let capacityExpansionRescueSearches = 0;
  let capacityExpansionRescueSuccesses = 0;

  // v24 separates two different unknowns. If a bounded search reached the action
  // horizon, first widen *distance in time* with only a modest expansion increase.
  // Only a still-capped capacity-critical lineage gets the larger expansion rescue.
  // The old unconditional 6000-expansion retry made rejected candidates dominate
  // generation time.
  const getCapacityRescueBudgets = (legIndex) => {
    const nominalExpansions = Math.max(1, Math.floor(legIndex === 0
      ? (options.contextualOpeningExpansions ?? CONTEXTUAL_OPENING_EXPANSIONS)
      : (options.contextualLaterExpansions ?? CONTEXTUAL_LATER_EXPANSIONS)));
    const fullCourseBudget = Math.max(
      nominalExpansions,
      Math.floor(Number(options.maxExpansions) || nominalExpansions)
    );
    const fastCardState = options.contextualFastCardState !== false;
    return {
      nominalExpansions,
      horizonExpansions: Math.min(
        fullCourseBudget,
        Math.max(
          nominalExpansions,
          fastCardState
            ? (legIndex === 0 ? 1200 : 1100)
            : (legIndex === 0 ? 1600 : 1400)
        )
      ),
      expansionExpansions: Math.min(
        fullCourseBudget,
        Math.max(nominalExpansions, fastCardState ? 2200 : 3000)
      ),
      maxActions: Math.max(
        fastCardState ? 30 : 36,
        options.contextualLegMaxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS
      )
    };
  };

  const isUnresolvedCappedRouteSet = (routes) => Boolean(
    routes?.contextualUnresolvedCap ||
    routes?.contextualUnresolvedHorizon ||
    routes?.contextualSearchMeta?.zeroRouteCapFailure ||
    routes?.contextualSearchMeta?.zeroRouteHorizonFailure
  );

  const baseRouteOptions = {
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive,
    setToKill: Boolean(options.setToKill),
    setToStun: Boolean(options.setToStun),
    lessForeshadowing: options.lessForeshadowing,
    contextualTrafficAlternativeRetention: Boolean(
      options.contextualTrafficAlternativeRetention
    ),
    contextualFastCardState: options.contextualFastCardState !== false,
    // v25: uncertainty changes breadth only. Exact legality is now carried by
    // compact literal card-count state rather than allocation-history sets.
    contextualUncertaintyBreadth: Boolean(
      options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon
    ),
    // v33: player count already enters through occupancy mass. Do not encode it
    // a second time as an abstract uncertainty multiplier. The old breadth-only
    // mechanism may still receive an explicit diagnostic override, otherwise its
    // congestion term is neutral and the continuous traffic confidence curve uses
    // actual predicted interactions instead.
    contextualTrafficUncertainty: Number.isFinite(Number(options.contextualTrafficUncertainty))
      ? clamp(Number(options.contextualTrafficUncertainty), 0, 1)
      : 0,
    contextualDetailedProfiling: Boolean(
      options.contextualDetailedProfiling
    ),
    contextualDominanceKeyProfiling: Boolean(
      options.contextualDominanceKeyProfiling
    ),
    contextualFullForecastShare: options.contextualFullForecastShare,
    contextualBeamWidth: options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
    optionalCompletionExpansions: options.contextualOptionalCompletionExpansions,
    repairStations: Boolean(options.repairStations),
    playerCount,
    virtualBots: Boolean(options.virtualBots),
    trafficGraceRegisters: Math.max(0, Number(options.trafficGraceRegisters) || 0),
    boardRects: options.boardRects,
    portalMap
  };

  const getEstimatedLegCacheKey = (
    context,
    legIndex,
    dynamicGoal,
    namespace,
    startupSpinUp,
    forbiddenFirstActions = [],
    excludedPathKeys = []
  ) => [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${Math.max(0, Number(context.absoluteActions) || 0) % REGISTER_COUNT}`,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`,
    startupSpinUp ? "spin1" : "spin0",
    `ban${[...forbiddenFirstActions].sort().join(",") || "-"}`,
    `skip${[...excludedPathKeys].sort().join(",") || "-"}`
  ].join("|");

  const getEstimatedLegRoute = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    forbiddenFirstActions = [],
    excludedPathKeys = [],
    searchPurpose = "primary",
    searchEffortScale = 1
  ) => {
    const dynamicGoal = dynamicGoals[legIndex] ?? null;
    const namespace = options.recoveryRule === "home_reboot"
      ? `start${startIndex}`
      : "shared";
    const cacheKey = getEstimatedLegCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      startupSpinUp,
      forbiddenFirstActions,
      excludedPathKeys
    );
    const trafficEffortScale = searchPurpose === "traffic"
      ? clamp(Number(searchEffortScale) || 1, 0.05, 1)
      : 1;

    const excluded = new Set(excludedPathKeys);
    const chooseBestCachedEstimate = (routes) => (
      (Array.isArray(routes) ? routes : [routes])
        .filter(Boolean)
        .map((candidate) => rebaseEstimatedRouteSoftGuidance(candidate, context))
        .filter((candidate) => !excluded.has(getEstimatedRouteIdentity(candidate)))
        .sort((left, right) => left.score - right.score)[0] ?? null
    );

    if (estimatedLegCache.has(cacheKey)) {
      estimatedLegCacheHits += 1;
      return chooseBestCachedEstimate(estimatedLegCache.get(cacheKey));
    }

    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const searchContext = {
      state: cloneState(context.state),
      absoluteActions: Math.max(0, Number(context.absoluteActions) || 0),
      history: [],
      programCardState: context.programCardState?.feasible === false
        ? null
        : context.programCardState
          ? { ...context.programCardState }
          : null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(
        context.estimatedCardFrontier,
        context.programCardState
      ),
      estimatedCardForecastFeasible:
        context.estimatedCardForecastFeasible !== false,
      energyReserve: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(baseRouteOptions),
      upgradeCardUnits: null,
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      approximatePreviousProgramDemandCode:
        Math.max(0, Number(context.approximatePreviousProgramDemandCode) || 0),
      approximateProgramDemandCode:
        Math.max(0, Number(context.approximateProgramDemandCode) || 0),
      approximatePreviousAgainUsed:
        Math.max(0, Number(context.approximatePreviousAgainUsed) || 0),
      approximateCurrentAgainUsed:
        Math.max(0, Number(context.approximateCurrentAgainUsed) || 0),
      approximatePreviousActionId: context.approximatePreviousActionId ?? null
    };
    const primaryWitnessRoutes = (
      forbiddenFirstActions.length || excludedPathKeys.length
    )
      ? 1
      : Math.max(1, Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3));
    const requestedRoutes = Math.max(
      1,
      excludedPathKeys.length + 1,
      primaryWitnessRoutes
    );
    const runEstimate = (maxExpansions, maxActions, telemetryKind) => {
      estimatedLegSearches += 1;
      return enumeratePhysicalTimingLegTemplates(
        tileMap,
        searchContext,
        flags[legIndex],
        {
          ...baseRouteOptions,
          rebootTokens,
          dynamicGoal,
          startupSpinUp: Boolean(startupSpinUp),
          portalMap,
          maxRoutes: requestedRoutes,
          maxExpansions,
          maxActions,
          optionalTemplateExpansions: excludedPathKeys.length ? Infinity : 45,
          contextualEstimatedCardWeightsOnly: true,
          contextualReturnAllEstimatedPaths: true,
          contextualForbiddenFirstActions: [...forbiddenFirstActions],
          contextualTelemetryKind: telemetryKind
        }
      );
    };

    // Fast bounded estimate first. For primary routing/repair a cap or horizon is
    // never a failure verdict, so those searches widen to physical-graph exhaustion.
    // Traffic alternatives are optional breadth: a bounded miss simply means this
    // mode declines to spend more work on that alternate, never that the leg is
    // intrinsically unreachable.
    const nominalEstimateExpansions = searchPurpose === "traffic"
      ? Math.max(
        TRAFFIC_ALTERNATE_MIN_EXPANSIONS,
        Math.floor(
          (Number(options.contextualTrafficAlternateExpansions) || 320) *
          trafficEffortScale
        )
      )
      : Math.max(
        120,
        Math.floor(Number(options.contextualPhysicalTemplateExpansions) || 700)
      );
    const nominalEstimateActions = searchPurpose === "traffic"
      ? Math.max(
        20,
        Math.floor(Number(options.contextualTrafficAlternateMaxActions) || 30)
      )
      : Math.max(
        20,
        Math.floor(Number(options.contextualPhysicalTemplateMaxActions) || 36)
      );
    const boundedTelemetryKind = searchPurpose === "traffic"
      ? "estimated-traffic-alternate-leg"
      : forbiddenFirstActions.length
        ? "estimated-card-repair-leg"
        : "estimated-primary-leg";
    const exhaustiveTelemetryKind = forbiddenFirstActions.length
      ? "estimated-card-repair-leg-exhaustive"
      : "estimated-primary-leg-exhaustive";
    let routes = runEstimate(
      nominalEstimateExpansions,
      nominalEstimateActions,
      boundedTelemetryKind
    );
    let route = chooseBestCachedEstimate(routes);
    const searchMeta = routes.contextualSearchMeta ?? null;
    if (
      !route &&
      searchPurpose !== "traffic" &&
      (
        searchMeta?.zeroRouteCapFailure ||
        searchMeta?.zeroRouteHorizonFailure ||
        searchMeta?.hitExpansionCap ||
        searchMeta?.hitActionHorizon
      )
    ) {
      estimatedLegWidenedSearches += 1;
      routes = runEstimate(
        Infinity,
        Infinity,
        exhaustiveTelemetryKind
      );
      route = chooseBestCachedEstimate(routes);
    }

    const retainedRoutes = (Array.isArray(routes) ? routes : [])
      .filter(Boolean)
      .slice(0, requestedRoutes);
    estimatedLegWitnessesGenerated += retainedRoutes.length;
    // A low-confidence optional traffic miss is not evidence that a future
    // higher-confidence traffic probe should also decline this physical state.
    // Cache successful optional witnesses, but never let a deliberately shallow
    // traffic miss poison the shared estimate cache. Primary misses retain their
    // existing semantics.
    if (searchPurpose !== "traffic" || retainedRoutes.length) {
      estimatedLegCache.set(cacheKey, retainedRoutes);
    }
    return route;
  };

  const makeInitialStartContext = (start) => ({
    state: {
      x: start.x,
      y: start.y,
      facing: start.facing ?? "E"
    },
    absoluteActions: 0,
    history: [],
    programCardState: {
      feasible: true,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    },
    estimatedCardFrontier: [{
      state: {
        feasible: true,
        previousCode: 0,
        currentCode: 0,
        previousActionId: null
      },
      penalty: 0
    }],
    estimatedCardForecastFeasible: true,
    energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
    upgradeCardUnits: null,
    hazardExposure: 0,
    approximatePreviousProgramDemandCode: 0,
    approximateProgramDemandCode: 0,
    approximatePreviousAgainUsed: 0,
    approximateCurrentAgainUsed: 0,
    approximatePreviousActionId: null
  });

  const rebaseEstimatedRouteSoftGuidance = (route, priorContext) => {
    if (!route) return route;
    const initialGuidance = {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    const guidance = walkEstimatedProgramDemand(
      route.localActionIds || [],
      priorContext?.absoluteActions ?? route.absoluteStartAction ?? 0,
      initialGuidance
    );
    const initialForecastFrontier = priorContext?.estimatedCardForecastFeasible === false
      ? []
      : cloneEstimatedCardForecastFrontier(
        priorContext?.estimatedCardFrontier,
        priorContext?.programCardState
      );
    const forecast = walkEstimatedCardForecast(
      route.localActionIds || [],
      priorContext?.absoluteActions ?? route.absoluteStartAction ?? 0,
      initialForecastFrontier,
      baseRouteOptions
    );
    const priorPenalty = Math.max(0, Number(route.approximateCardPlausibilityPenalty) || 0);
    const priorForecastPenalty = Math.max(
      0,
      Number(route.estimatedCardForecastPenalty) || 0
    );
    const priorEnergyReward = Math.max(
      0,
      Number(route.routeEnergyEconomyRewardScore) || 0
    );
    const economy = replayContextualRouteEnergyForContext(
      tileMap,
      route,
      priorContext,
      baseRouteOptions
    );
    const score = Number(
      (
        (Number(route.score) || 0) -
        priorPenalty -
        priorForecastPenalty +
        priorEnergyReward +
        guidance.penalty +
        forecast.penalty -
        economy.routeEnergyEconomyRewardScore
      ).toFixed(2)
    );
    return {
      ...route,
      ...economy,
      score,
      approximateCardPlausibilityPenalty: guidance.penalty,
      estimatedCardForecastPenalty: forecast.penalty,
      estimatedCardForecastFeasible: forecast.feasible,
      estimatedCardFrontierEnd: cloneEstimatedCardForecastFrontier(
        forecast.frontier
      ),
      estimatedDemandStateEnd: { ...guidance.state }
    };
  };

  const getPhysicalContextAfterEstimatedLeg = (route, priorContext) => {
    const guidedRoute = (
      route?.estimatedDemandStateEnd &&
      Array.isArray(route?.estimatedCardFrontierEnd)
    )
      ? route
      : rebaseEstimatedRouteSoftGuidance(route, priorContext);
    const endGuidance = guidedRoute?.estimatedDemandStateEnd ?? {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    return {
      ...priorContext,
      state: cloneState(guidedRoute.finalState),
      absoluteActions: guidedRoute.absoluteActions,
      hazardExposure: (
        Math.max(0, Number(priorContext?.hazardExposure) || 0) +
        Math.max(0, Number(guidedRoute?.hazard) || 0)
      ),
      approximatePreviousProgramDemandCode: endGuidance.previousDemandCode || 0,
      approximateProgramDemandCode: endGuidance.demandCode || 0,
      approximatePreviousAgainUsed: endGuidance.previousAgainUsed || 0,
      approximateCurrentAgainUsed: endGuidance.currentAgainUsed || 0,
      approximatePreviousActionId: endGuidance.previousActionId ?? null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(
        guidedRoute?.estimatedCardFrontierEnd
      ),
      estimatedCardForecastFeasible:
        priorContext?.estimatedCardForecastFeasible !== false &&
        guidedRoute?.estimatedCardForecastFeasible !== false,
      energyReserve: Number.isFinite(Number(guidedRoute?.routeEnergyShadowReserveEnd))
        ? Number(guidedRoute.routeEnergyShadowReserveEnd)
        : priorContext?.energyReserve ?? null
    };
  };


  const getEstimatedContextAfterActionPrefix = (
    priorContext,
    actionIds
  ) => {
    const actions = Array.isArray(actionIds) ? actionIds : [];
    const initialGuidance = {
      previousDemandCode:
        Math.max(0, Number(priorContext?.approximatePreviousProgramDemandCode) || 0),
      demandCode: Math.max(0, Number(priorContext?.approximateProgramDemandCode) || 0),
      previousAgainUsed:
        Math.max(0, Number(priorContext?.approximatePreviousAgainUsed) || 0),
      currentAgainUsed:
        Math.max(0, Number(priorContext?.approximateCurrentAgainUsed) || 0),
      previousActionId: priorContext?.approximatePreviousActionId ?? null
    };
    const guidance = walkEstimatedProgramDemand(
      actions,
      priorContext?.absoluteActions ?? 0,
      initialGuidance
    );
    const initialForecast = priorContext?.estimatedCardForecastFeasible === false
      ? []
      : cloneEstimatedCardForecastFrontier(
        priorContext?.estimatedCardFrontier,
        priorContext?.programCardState
      );
    const forecast = walkEstimatedCardForecast(
      actions,
      priorContext?.absoluteActions ?? 0,
      initialForecast,
      baseRouteOptions
    );
    return {
      ...priorContext,
      absoluteActions:
        Math.max(0, Number(priorContext?.absoluteActions) || 0) + actions.length,
      approximatePreviousProgramDemandCode: guidance.state.previousDemandCode || 0,
      approximateProgramDemandCode: guidance.state.demandCode || 0,
      approximatePreviousAgainUsed: guidance.state.previousAgainUsed || 0,
      approximateCurrentAgainUsed: guidance.state.currentAgainUsed || 0,
      approximatePreviousActionId: guidance.state.previousActionId ?? null,
      estimatedCardFrontier: cloneEstimatedCardForecastFrontier(forecast.frontier),
      estimatedCardForecastFeasible:
        priorContext?.estimatedCardForecastFeasible !== false && forecast.feasible
    };
  };

  const buildEstimatedCourseFrom = (
    existingLegs,
    startLegIndex,
    physicalContext,
    start,
    startIndex
  ) => {
    const legs = [...existingLegs];
    let context = { ...physicalContext, state: cloneState(physicalContext.state) };
    for (let legIndex = startLegIndex; legIndex < flags.length; legIndex += 1) {
      const route = getEstimatedLegRoute(
        context,
        legIndex,
        start,
        startIndex,
        legIndex === 0 && Boolean(options.startupSpinUp),
        []
      );
      if (!route) {
        return {
          complete: false,
          failedLegIndex: legIndex,
          legs,
          context
        };
      }
      legs.push(route);
      context = getPhysicalContextAfterEstimatedLeg(route, context);
    }
    return { complete: true, legs, context };
  };

  const getLegRoutes = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    searchControl = {}
  ) => {
    const dynamicGoal = dynamicGoals[legIndex] ?? null;
    const namespace = options.recoveryRule === "home_reboot"
      ? `start${startIndex}`
      : "shared";
    const cacheKey = getContextualLegCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      baseRouteOptions
    );
    const templateKey = getContextualTemplateCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace,
      baseRouteOptions
    );

    // Count every concrete later-leg lineage in its physical arrival class even
    // when an identical exact context can return immediately from legCache. This
    // is telemetry-only; exact-cache hits remain cheaper than catalogue lookups.
    if (
      !searchControl.forceDirectSearch &&
      legIndex > 0 &&
      options.contextualSharedLaterLegCatalogue
    ) {
      const arrivalClassKey = getContextualSharedLegCatalogueKey(
        context,
        legIndex,
        dynamicGoal,
        namespace
      );
      arrivalClassKeysByLeg[legIndex].add(arrivalClassKey);
      let classLineages = arrivalClassLineagesByLeg[legIndex].get(arrivalClassKey);
      if (!classLineages) {
        classLineages = new Set();
        arrivalClassLineagesByLeg[legIndex].set(arrivalClassKey, classLineages);
      }
      classLineages.add(startIndex);
    }

    if (!searchControl.bypassCache && legCache.has(cacheKey)) {
      cacheHits += 1;
      return legCache.get(cacheKey)
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        ))
        .filter(Boolean);
    }

    const opening = legIndex === 0;
    const requestedRouteCount = Number.isFinite(Number(searchControl.maxRoutes))
      ? Math.max(1, Math.floor(Number(searchControl.maxRoutes)))
      : opening
        ? (options.contextualOpeningRoutes ?? CONTEXTUAL_OPENING_ROUTES)
        : (options.contextualLaterRoutes ?? CONTEXTUAL_LATER_ROUTES);
    const requestedCompletionPool = Number.isFinite(Number(searchControl.completionPool))
      ? Math.max(1, Math.floor(Number(searchControl.completionPool)))
      : options.contextualCompletionPool ?? (opening ? 4 : CONTEXTUAL_COMPLETION_POOL);
    const requestedBeamWidth = options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH;
    const requestedOptionalExpansions = Number.isFinite(Number(searchControl.optionalCompletionExpansions))
      ? Math.max(0, Math.floor(Number(searchControl.optionalCompletionExpansions)))
      : (options.contextualOptionalCompletionExpansions ?? 0);
    const breadthPolicy = searchControl.ignoreUncertaintyBreadth
      ? {
        band: CONTEXTUAL_FORECAST_BANDS.SOLID,
        maxRoutes: requestedRouteCount,
        completionPool: requestedCompletionPool,
        beamWidth: requestedBeamWidth,
        optionalCompletionExpansions: requestedOptionalExpansions
      }
      : getContextualBreadthPolicy(
        context,
        requestedRouteCount,
        requestedCompletionPool,
        requestedBeamWidth,
        requestedOptionalExpansions,
        baseRouteOptions
      );
    const targetRouteCount = breadthPolicy.maxRoutes;
    const nominalExpansions = opening
      ? (
        options.contextualOpeningExpansions ??
        CONTEXTUAL_OPENING_EXPANSIONS
      )
      : (
        options.contextualLaterExpansions ??
        CONTEXTUAL_LATER_EXPANSIONS
      );
    const effectiveExpansions = Number.isFinite(Number(searchControl.maxExpansions))
      ? Math.max(1, Math.floor(Number(searchControl.maxExpansions)))
      : nominalExpansions;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const commonSearchOptions = {
      ...baseRouteOptions,
      rebootTokens,
      dynamicGoal,
      startupSpinUp: opening && startupSpinUp,
      maxRoutes: targetRouteCount,
      completionPool: breadthPolicy.completionPool,
      maxActions: Number.isFinite(Number(searchControl.maxActions))
        ? Math.max(1, Math.floor(Number(searchControl.maxActions)))
        : (options.contextualLegMaxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS),
      optionalCompletionExpansions: breadthPolicy.optionalCompletionExpansions,
      contextualForecastBand: breadthPolicy.band
    };

    const runSearch = (
      searchContext,
      telemetryKind,
      incumbentRoutes = [],
      extraOptions = {}
    ) => {
      const searchExpansionBudget = Number.isFinite(Number(extraOptions.maxExpansions))
        ? Math.max(1, Math.floor(Number(extraOptions.maxExpansions)))
        : effectiveExpansions;
      const routes = enumerateContextualLegRoutes(
        tileMap,
        searchContext,
        flags[legIndex],
        {
          ...commonSearchOptions,
          ...extraOptions,
          maxExpansions: searchExpansionBudget,
          contextualIncumbentRoutes: incumbentRoutes,
          contextualTelemetryKind: telemetryKind
        }
      );
      return routes;
    };

    const recordZeroRouteCap = (searchMeta) => {
      const capped = Boolean(searchMeta?.zeroRouteCapFailure);
      const horizon = Boolean(searchMeta?.zeroRouteHorizonFailure);
      if (!capped && !horizon) return false;
      zeroRouteFailureStarts.add(startIndex);
      zeroRouteFailureStartsByLeg[legIndex].add(startIndex);
      if (capped) {
        zeroRouteCapFailures += 1;
        zeroRouteCapsByLeg[legIndex] += 1;
      }
      if (horizon) {
        zeroRouteHorizonFailures += 1;
        zeroRouteHorizonFailureStarts.add(startIndex);
        zeroRouteHorizonsByLeg[legIndex] += 1;
        zeroRouteHorizonFailureStartsByLeg[legIndex].add(startIndex);
      }
      return true;
    };

    // v28 arrival-class routing: Start→Flag1 remains exact per lineage. Later
    // legs are discovered once per distinct physical arrival class (position/facing/
    // register phase/dynamic-goal phase/reboot namespace), then exact-replayed against
    // each lineage's rolling card state. The internal witness pool is reachability
    // machinery, not gameplay alternate-route retention.
    const forceDirectSearch = Boolean(searchControl.forceDirectSearch);
    const catalogueEnabled = Boolean(
      !forceDirectSearch &&
      !opening &&
      options.contextualSharedLaterLegCatalogue
    );
    let catalogueEntry = null;
    let catalogueKey = null;
    let catalogueNeedsEnrichment = false;
    if (catalogueEnabled) {
      catalogueLookups += 1;
      catalogueKey = getContextualSharedLegCatalogueKey(
        context,
        legIndex,
        dynamicGoal,
        namespace
      );
      arrivalClassKeysByLeg[legIndex].add(catalogueKey);
      let classLineages = arrivalClassLineagesByLeg[legIndex].get(catalogueKey);
      if (!classLineages) {
        classLineages = new Set();
        arrivalClassLineagesByLeg[legIndex].set(catalogueKey, classLineages);
      }
      classLineages.add(startIndex);
      catalogueEntry = sharedLegCatalogueCache.get(catalogueKey) ?? null;
      const catalogueWasCached = Boolean(catalogueEntry);

      if (!catalogueEntry) {
        catalogueSearches += 1;
        const catalogueContext = {
          state: cloneState(context.state),
          // Register phase is synchronized board state and remains exact.
          absoluteActions: context.absoluteActions,
          history: [],
          programCardState: getCompactProgramCardStateFromHistory(
            [],
            context.absoluteActions
          ),
          energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
          upgradeCardUnits: null,
          hazardExposure: 0
        };
        const requestedPhysicalTemplateRoutes = Math.max(
          1,
          Math.floor(Number(options.contextualPhysicalTemplateRoutes) || 1)
        );
        const primaryWitnessRoutes = Math.max(
          1,
          Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
        );
        // Even when gameplay alternatives are disabled, retain a few cheap internal
        // physical witnesses so different exact card histories can share discovery.
        // Only targetRouteCount routes can escape this function.
        const physicalTemplateRoutes = Math.min(
          CONTEXTUAL_TEMPLATE_POOL,
          Math.max(
            targetRouteCount,
            requestedPhysicalTemplateRoutes,
            primaryWitnessRoutes
          )
        );
        const physicalTemplateBudget = Math.max(
          240,
          Math.floor(Number(options.contextualPhysicalTemplateExpansions) || 700)
        );
        const physicalTemplateMaxActions = Math.max(
          commonSearchOptions.maxActions,
          Math.floor(Number(options.contextualPhysicalTemplateMaxActions) || 36)
        );
        let catalogueRoutes = enumeratePhysicalTimingLegTemplates(
          tileMap,
          catalogueContext,
          flags[legIndex],
          {
            ...commonSearchOptions,
            startupSpinUp: false,
            maxRoutes: physicalTemplateRoutes,
            maxExpansions: physicalTemplateBudget,
            maxActions: physicalTemplateMaxActions,
            contextualApproximateCardWeights: true,
            contextualTelemetryKind: "contextual-physical-template"
          }
        );
        let searchMeta = catalogueRoutes.contextualSearchMeta ?? null;

        // A capped physical search is cheap enough to widen once because its state
        // space is only board/facing/register timing. Do this before asking any
        // concrete robot history to pay for an exact combinatorial rescue.
        if (!catalogueRoutes.length && searchMeta?.zeroRouteCapFailure) {
          const physicalRescueBudget = Math.max(
            physicalTemplateBudget,
            Math.min(
              Math.max(physicalTemplateBudget, 2400),
              Math.max(physicalTemplateBudget, Number(options.maxExpansions) || 2400)
            )
          );
          if (physicalRescueBudget > physicalTemplateBudget) {
            const rescuedTemplates = enumeratePhysicalTimingLegTemplates(
              tileMap,
              catalogueContext,
              flags[legIndex],
              {
                ...commonSearchOptions,
                startupSpinUp: false,
                maxRoutes: physicalTemplateRoutes,
                maxExpansions: physicalRescueBudget,
                maxActions: physicalTemplateMaxActions,
                contextualApproximateCardWeights: true,
                contextualTelemetryKind: "contextual-physical-template-rescue"
              }
            );
            if (rescuedTemplates.length) catalogueRoutes = rescuedTemplates;
            searchMeta = rescuedTemplates.contextualSearchMeta ?? searchMeta;
          }
        }

        const storedRoutes = dedupeRoutes(catalogueRoutes)
          .sort((left, right) => left.score - right.score)
          .slice(0, CONTEXTUAL_TEMPLATE_POOL);
        catalogueWitnessesGenerated += storedRoutes.length;
        const unresolvedPhysical = !storedRoutes.length && Boolean(
          searchMeta?.zeroRouteCapFailure || searchMeta?.zeroRouteHorizonFailure
        );
        catalogueEntry = {
          status: storedRoutes.length
            ? "ready"
            : unresolvedPhysical
              ? "unresolved"
              : "exhausted",
          routes: storedRoutes,
          canonicalContext: catalogueContext,
          searchMeta,
          enrichments: 0
        };
        sharedLegCatalogueCache.set(catalogueKey, catalogueEntry);
        if (searchMeta?.zeroRouteCapFailure) catalogueCappedSearches += 1;
        else if (!storedRoutes.length && !unresolvedPhysical) catalogueExhaustedSearches += 1;
      } else {
        catalogueCacheHits += 1;
      }

      if (catalogueEntry.status === "unresolved") {
        if (catalogueWasCached) catalogueSuppressedCappedLookups += 1;
        const unresolved = [];
        unresolved.contextualUnresolvedCap = Boolean(
          catalogueEntry.searchMeta?.zeroRouteCapFailure
        );
        unresolved.contextualUnresolvedHorizon = Boolean(
          catalogueEntry.searchMeta?.zeroRouteHorizonFailure
        );
        unresolved.contextualSearchMeta = catalogueEntry.searchMeta ?? {
          hitExpansionCap: false,
          hitActionHorizon: true,
          zeroRouteHorizonFailure: true
        };
        return unresolved;
      }
      if (catalogueEntry.status === "exhausted") {
        if (!searchControl.bypassCache) legCache.set(cacheKey, []);
        return [];
      }

      const compatibleRoutes = [];
      for (let witnessIndex = 0; witnessIndex < catalogueEntry.routes.length; witnessIndex += 1) {
        const route = catalogueEntry.routes[witnessIndex];
        catalogueReplayRouteChecks += 1;
        const rebased = rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        );
        if (!rebased) continue;
        compatibleRoutes.push(rebased);
        catalogueWitnessRankSuccesses[witnessIndex] =
          (catalogueWitnessRankSuccesses[witnessIndex] || 0) + 1;
        if (
          !baseRouteOptions.contextualTrafficAlternativeRetention &&
          compatibleRoutes.length >= targetRouteCount
        ) {
          break;
        }
      }
      compatibleRoutes.sort((left, right) => left.score - right.score);
      const distinctCompatible = baseRouteOptions.contextualTrafficAlternativeRetention && targetRouteCount > 1
        ? selectContextualTrafficAlternativeRoutes(
          compatibleRoutes,
          flags[legIndex],
          targetRouteCount
        )
        : selectDistinctRoutes(
          compatibleRoutes,
          flags[legIndex],
          targetRouteCount
        );

      if (distinctCompatible.length) {
        catalogueCompatibleLineages += 1;
        catalogueWitnessResolvedLineages += 1;
        catalogueCompatibleRoutes += distinctCompatible.length;
        let resultRoutes = distinctCompatible;

        // Only pay for an exact refinement if the mode still wants another route
        // and the physical templates could not supply it. This is bounded repair,
        // not the primary discovery mechanism.
        if (targetRouteCount > distinctCompatible.length) {
          catalogueRefinementSearches += 1;
          const repairBudget = Math.min(
            effectiveExpansions,
            Math.max(180, Math.floor(Number(options.contextualExactRepairExpansions) || 450))
          );
          const refinedRoutes = runSearch(
            context,
            "contextual-catalogue-refine",
            distinctCompatible,
            { maxExpansions: repairBudget }
          );
          resultRoutes = refinedRoutes.length
            ? refinedRoutes
            : distinctCompatible;
        }
        if (!searchControl.bypassCache) legCache.set(cacheKey, resultRoutes);
        return resultRoutes;
      }

      catalogueIncompatibleLineages += 1;
      // None of the shared physical templates fit this exact two-program card
      // state. Allow a small concrete repair; if it caps, capacity logic may later
      // escalate only this lineage. Never make every lineage pay the old 1000/6000
      // exact failure tail merely because one template was incompatible.
      catalogueEntry.enrichments += 1;
      catalogueEnrichmentSearches += 1;
      catalogueNeedsEnrichment = true;
    }

    const cachedTemplates = forceDirectSearch
      ? []
      : (templateCache.get(templateKey) ?? []);

    if (cachedTemplates.length) {
      const rebasedTemplates = cachedTemplates
        .map((route) => {
          const rebased = rebaseContextualCachedRoute(
            tileMap,
            route,
            context,
            baseRouteOptions
          );
          if (!rebased) return null;
          return {
            route: rebased,
            cardDelta: Math.abs(
              (
                (rebased.cardAvailabilityPenalty || 0) +
                (rebased.programPlausibilityPenalty || 0)
              ) -
              (
                (route.cardAvailabilityPenalty || 0) +
                (route.programPlausibilityPenalty || 0)
              )
            )
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.route.score - right.route.score);
      const acceptable = rebasedTemplates
        .filter((entry) => (
          entry.cardDelta <= CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT
        ))
        .map((entry) => entry.route);
      const distinct = baseRouteOptions.contextualTrafficAlternativeRetention && targetRouteCount > 1
        ? selectContextualTrafficAlternativeRoutes(
          acceptable,
          flags[legIndex],
          targetRouteCount
        )
        : selectDistinctRoutes(
          acceptable,
          flags[legIndex],
          targetRouteCount
        );

      if (distinct.length >= Math.min(2, targetRouteCount)) {
        templateHits += 1;
        if (!searchControl.bypassCache) legCache.set(cacheKey, distinct);
        if (catalogueNeedsEnrichment && catalogueEntry) {
          catalogueEnrichmentSuccesses += 1;
          const canonicalTemplates = distinct
            .map((route) => rebaseContextualCachedRoute(
              tileMap,
              route,
              catalogueEntry.canonicalContext,
              baseRouteOptions
            ))
            .filter(Boolean);
          catalogueEntry.routes = dedupeRoutes([
            ...catalogueEntry.routes,
            ...canonicalTemplates
          ])
            .sort((left, right) => left.score - right.score)
            .slice(0, CONTEXTUAL_TEMPLATE_POOL);
        }
        return distinct;
      }

      templateFallbacks += 1;
    }

    cacheMisses += 1;
    const exactRepairBudget = catalogueNeedsEnrichment
      ? Math.min(
        effectiveExpansions,
        Math.max(220, Math.floor(Number(options.contextualExactRepairExpansions) || 550))
      )
      : effectiveExpansions;
    const routes = runSearch(
      context,
      searchControl.telemetryKind ?? (
        catalogueNeedsEnrichment
          ? "contextual-catalogue-enrich"
          : "contextual-leg"
      ),
      [],
      { maxExpansions: exactRepairBudget }
    );
    const searchMeta = routes.contextualSearchMeta ?? null;
    const unresolved = recordZeroRouteCap(searchMeta);

    // Do not memoize an unresolved cap/horizon miss as if it proved no route.
    if (!searchControl.bypassCache && !unresolved) {
      legCache.set(cacheKey, routes);
    }
    if (!routes.length && unresolved) {
      routes.contextualUnresolvedCap = Boolean(searchMeta?.zeroRouteCapFailure);
      routes.contextualUnresolvedHorizon = Boolean(searchMeta?.zeroRouteHorizonFailure);
    }

    if (!forceDirectSearch) {
      const mergedTemplates = dedupeRoutes([
        ...cachedTemplates,
        ...routes.filter(Boolean)
      ])
        .sort((left, right) => left.score - right.score)
        .slice(0, CONTEXTUAL_TEMPLATE_POOL);
      templateCache.set(templateKey, mergedTemplates);
    }

    if (catalogueNeedsEnrichment && catalogueEntry && routes.length) {
      catalogueEnrichmentSuccesses += 1;
      const canonicalEnrichment = routes
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          catalogueEntry.canonicalContext,
          baseRouteOptions
        ))
        .filter(Boolean);
      catalogueEntry.routes = dedupeRoutes([
        ...catalogueEntry.routes,
        ...canonicalEnrichment
      ])
        .sort((left, right) => left.score - right.score)
        .slice(0, CONTEXTUAL_TEMPLATE_POOL);
    }

    return routes;
  };

  const runCapacityRescue = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false,
    unresolvedMeta = null
  ) => {
    const budgets = getCapacityRescueBudgets(legIndex);
    let lastMeta = unresolvedMeta ?? {};

    // If the unresolved result came from the physical catalogue, widening exact
    // card-state search cannot discover geometry that the smaller physical search
    // did not see. Widen the cheap physical state space first, then exact-replay
    // any witnesses it finds.
    if (lastMeta?.physicalTimingTemplate) {
      capacityRescueSearches += 1;
      capacityPhysicalRescueSearches += 1;
      const rebootTokens = options.recoveryRule === "home_reboot"
        ? getHomeRebootTokensForStart(start, options.rebootTokens)
        : options.rebootTokens;
      const physicalRoutes = enumeratePhysicalTimingLegTemplates(
        tileMap,
        context,
        flags[legIndex],
        {
          ...baseRouteOptions,
          rebootTokens,
          dynamicGoal: dynamicGoals[legIndex] ?? null,
          startupSpinUp: legIndex === 0 && startupSpinUp,
          portalMap,
          maxRoutes: Math.max(
            1,
            Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
          ),
          contextualApproximateCardWeights: true,
          maxExpansions: Math.min(
            4000,
            Math.max(3000, Number(options.maxExpansions) || 4000)
          ),
          maxActions: Math.max(48, budgets.maxActions),
          contextualTelemetryKind: "contextual-capacity-physical-rescue"
        }
      );
      const exactReplay = physicalRoutes
        .map((route) => rebaseContextualCachedRoute(
          tileMap,
          route,
          context,
          baseRouteOptions
        ))
        .filter(Boolean)
        .sort((left, right) => left.score - right.score);
      if (exactReplay.length) {
        capacityRescueSuccesses += 1;
        capacityPhysicalRescueSuccesses += 1;
        return exactReplay.slice(0, 1);
      }
      lastMeta = physicalRoutes.contextualSearchMeta ?? lastMeta;
      if (!physicalRoutes.length && !lastMeta?.zeroRouteCapFailure && !lastMeta?.zeroRouteHorizonFailure) {
        return [];
      }
      // Geometry exists but the retained physical traces did not fit this card
      // history: fall through to the bounded exact repair below.
      if (physicalRoutes.length) {
        lastMeta = {
          ...lastMeta,
          physicalTimingTemplate: false,
          zeroRouteCapFailure: true
        };
      } else {
        const unresolved = [];
        unresolved.contextualUnresolvedCap = Boolean(lastMeta?.zeroRouteCapFailure);
        unresolved.contextualUnresolvedHorizon = Boolean(lastMeta?.zeroRouteHorizonFailure);
        unresolved.contextualSearchMeta = lastMeta;
        return unresolved;
      }
    }

    const runOne = (kind, maxExpansions, countHorizon = false) => {
      capacityRescueSearches += 1;
      if (countHorizon) capacityHorizonRescueSearches += 1;
      else capacityExpansionRescueSearches += 1;
      const routes = getLegRoutes(
        context,
        legIndex,
        start,
        startIndex,
        startupSpinUp,
        {
          bypassCache: true,
          forceDirectSearch: true,
          maxRoutes: 1,
          completionPool: 1,
          maxExpansions,
          maxActions: budgets.maxActions,
          ignoreUncertaintyBreadth: true,
          optionalCompletionExpansions: 0,
          telemetryKind: kind
        }
      );
      if (routes.length) {
        capacityRescueSuccesses += 1;
        if (countHorizon) capacityHorizonRescueSuccesses += 1;
        else capacityExpansionRescueSuccesses += 1;
      }
      return routes;
    };

    // Horizon first: more registers, almost the same search width. This identifies
    // long-but-simple routes without immediately paying the old 6000-state tail.
    if (lastMeta?.zeroRouteHorizonFailure) {
      const horizonRoutes = runOne(
        "contextual-capacity-horizon-rescue",
        budgets.horizonExpansions,
        true
      );
      if (horizonRoutes.length) return horizonRoutes;
      lastMeta = horizonRoutes.contextualSearchMeta ?? lastMeta;
    }

    // Expansion rescue is the final exact fallback and is only reached if capacity
    // still depends on this lineage. Cap it at 3000 in Standard rather than 6000.
    if (lastMeta?.zeroRouteCapFailure || !lastMeta?.zeroRouteHorizonFailure) {
      const expansionRoutes = runOne(
        "contextual-capacity-expansion-rescue",
        budgets.expansionExpansions,
        false
      );
      if (expansionRoutes.length) return expansionRoutes;
      lastMeta = expansionRoutes.contextualSearchMeta ?? lastMeta;
    }

    const unresolved = [];
    unresolved.contextualUnresolvedCap = Boolean(lastMeta?.zeroRouteCapFailure);
    unresolved.contextualUnresolvedHorizon = Boolean(lastMeta?.zeroRouteHorizonFailure);
    unresolved.contextualSearchMeta = lastMeta;
    return unresolved;
  };

  const makeSurvivorSnapshot = (legIndex, extra = {}) => {
    const survivingStarts = Number.isFinite(extra.survivingStarts)
      ? extra.survivingStarts
      : startPartials.filter((entry) => entry.partials.length).length;
    const cappedContextsThisLeg = zeroRouteCapsByLeg[legIndex] ?? 0;
    const cappedStartsThisLeg = zeroRouteFailureStartsByLeg[legIndex]?.size ?? 0;
    return {
      legIndex,
      legNumber: legIndex + 1,
      survivingStarts,
      requiredStarts: requiredSurvivingStarts,
      preferredStarts: preferredSurvivingStarts,
      maximumPossibleStarts: Number.isFinite(extra.maximumPossibleStarts)
        ? extra.maximumPossibleStarts
        : survivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - survivingStarts),
      cappedContextsThisLeg,
      cappedStartsThisLeg,
      totalCappedContexts: zeroRouteCapFailures,
      distinctCappedStarts: zeroRouteFailureStarts.size,
      horizonContextsThisLeg: zeroRouteHorizonsByLeg[legIndex] ?? 0,
      horizonStartsThisLeg: zeroRouteHorizonFailureStartsByLeg[legIndex]?.size ?? 0,
      totalHorizonContexts: zeroRouteHorizonFailures,
      distinctHorizonStarts: zeroRouteHorizonFailureStarts.size,
      seededOpeningStarts,
      processedStartsThisLeg: extra.processedStartsThisLeg ?? null,
      preferredCapacityShortCircuit: Boolean(extra.preferredCapacityShortCircuit)
    };
  };

  const throwCapacityLost = (legIndex, snapshot) => {
    survivorHistory.push(snapshot);
    const maximumText = Number.isFinite(snapshot.maximumPossibleStarts)
      ? `; at most ${snapshot.maximumPossibleStarts} can survive`
      : "";
    const error = new Error(
      `Contextual start capacity lost after leg ${legIndex + 1}: ${snapshot.survivingStarts}/${requiredSurvivingStarts} routed starts so far${maximumText}; ${snapshot.cappedContextsThisLeg} capped route contexts this leg`
    );
    error.code = "CONTEXTUAL_START_CAPACITY_LOST";
    error.contextualSearchHealth = {
      zeroRouteCapFailures,
      zeroRouteHorizonFailures,
      distinctStarts: zeroRouteFailureStarts.size,
      distinctHorizonStarts: zeroRouteHorizonFailureStarts.size,
      cappedContextsThisLeg: snapshot.cappedContextsThisLeg,
      horizonContextsThisLeg: snapshot.horizonContextsThisLeg ?? 0,
      cappedStartsThisLeg: snapshot.cappedStartsThisLeg,
      survivingStarts: snapshot.survivingStarts,
      maximumPossibleStarts: snapshot.maximumPossibleStarts,
      requiredStarts: requiredSurvivingStarts,
      preferredStarts: preferredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: snapshot.lostStarts,
      legIndex,
      legNumber: legIndex + 1,
      flagCount: flags.length,
      seededOpeningStarts,
      processedStartsThisLeg: snapshot.processedStartsThisLeg,
      capacityRescueSearches,
      capacityRescueSuccesses,
      capacityPhysicalRescueSearches,
      capacityPhysicalRescueSuccesses,
      capacityHorizonRescueSearches,
      capacityHorizonRescueSuccesses,
      capacityExpansionRescueSearches,
      capacityExpansionRescueSuccesses,
      catalogueEntries: sharedLegCatalogueCache.size,
      catalogueLookups,
      catalogueCacheHits,
      catalogueSearches,
      catalogueCappedSearches,
      catalogueExhaustedSearches,
      catalogueSuppressedCappedLookups,
      catalogueReplayRouteChecks,
      catalogueCompatibleLineages,
      catalogueCompatibleRoutes,
      catalogueIncompatibleLineages,
      catalogueRefinementSearches,
      catalogueEnrichmentSearches,
      catalogueEnrichmentSuccesses,
      catalogueEnrichmentSuppressed,
      survivorHistory: survivorHistory.map((entry) => ({ ...entry }))
    };
    throw error;
  };

  const startPartials = [];
  if (options.contextualEstimatedPrimaryRouting) {
    // v29 Normal primary-routing invariant:
    //   Milestone 1: every structural start receives a complete physical estimate.
    //   Milestone 2: every estimate receives a hard rolling-card realization.
    // A player-count floor is an acceptance rule only; it never stops either
    // milestone early and it never decides whether another start deserves routing.
    const estimatedEntries = [];
    const excludedLegPathsByConstraint = new Map();
    const forbiddenRepairActionsByConstraint = new Map();

    const getLegStartPhysicalContext = (legs, legIndex, initialContext) => {
      let context = {
        ...initialContext,
        state: cloneState(initialContext.state)
      };
      for (let index = 0; index < legIndex; index += 1) {
        const route = legs[index];
        if (!route) break;
        context = getPhysicalContextAfterEstimatedLeg(route, context);
      }
      return context;
    };

    const getPrefixActionsBeforeLeg = (legs, legIndex) => (
      legs.slice(0, legIndex).flatMap((leg) => leg?.localActionIds || [])
    );

    const findAlternativeEstimatedCourse = (
      currentLegs,
      startAtLeg,
      start,
      startIndex,
      initialContext
    ) => {
      const highestLeg = Math.min(
        Math.max(0, Math.floor(Number(startAtLeg) || 0)),
        Math.max(0, currentLegs.length - 1)
      );
      for (let legIndex = highestLeg; legIndex >= 0; legIndex -= 1) {
        const prefixLegs = currentLegs.slice(0, legIndex);
        const legStartContext = getLegStartPhysicalContext(
          currentLegs,
          legIndex,
          initialContext
        );
        const prefixActions = getPrefixActionsBeforeLeg(currentLegs, legIndex);
        const constraintKey = [
          `leg${legIndex}`,
          getEstimatedRouteFailureConstraintKey(
            legStartContext.state,
            legStartContext.absoluteActions,
            prefixActions
          )
        ].join("|");
        let excludedPaths = excludedLegPathsByConstraint.get(constraintKey);
        if (!excludedPaths) {
          excludedPaths = new Set();
          excludedLegPathsByConstraint.set(constraintKey, excludedPaths);
        }
        const currentRoute = currentLegs[legIndex] ?? null;
        if (currentRoute) excludedPaths.add(getEstimatedRouteIdentity(currentRoute));

        while (true) {
          const alternate = getEstimatedLegRoute(
            legStartContext,
            legIndex,
            start,
            startIndex,
            legIndex === 0 && Boolean(options.startupSpinUp),
            [],
            [...excludedPaths]
          );
          if (!alternate) break;
          const alternatePathKey = getEstimatedRouteIdentity(alternate);
          if (excludedPaths.has(alternatePathKey)) {
            break;
          }

          const afterAlternate = getPhysicalContextAfterEstimatedLeg(
            alternate,
            legStartContext
          );
          const rebuilt = buildEstimatedCourseFrom(
            [...prefixLegs, alternate],
            legIndex + 1,
            afterAlternate,
            start,
            startIndex
          );
          if (rebuilt.complete) {
            return rebuilt;
          }

          // This exact physical leg produced an arrival from which the remaining
          // course could not be estimated. Exclude only this whole leg path for
          // this exact prefix; do not forbid its first action globally.
          excludedPaths.add(alternatePathKey);
          const deeper = rebuilt.legs.length
            ? findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              startIndex,
              initialContext
            )
            : null;
          if (deeper?.complete) return deeper;
        }
      }
      return null;
    };

    // If an exact card failure cannot be repaired from the impossible register
    // itself, move the decision point backward through the existing estimated
    // prefix. At each earlier register, forbid only the action already proven to
    // lead into the dead card prefix, then let the uncapped-on-miss physical
    // estimator rebuild the rest of that leg and all downstream legs. This is
    // card-constraint backtracking, not a capacity rescue.
    const backtrackEstimatedCourseFromPrefix = (
      currentLegs,
      failureLegIndex,
      localFailureIndex,
      start,
      startIndex,
      initialContext
    ) => {
      for (let legIndex = failureLegIndex; legIndex >= 0; legIndex -= 1) {
        const leg = currentLegs[legIndex];
        const actions = leg?.localActionIds || [];
        if (!actions.length) continue;
        const firstPivot = legIndex === failureLegIndex
          ? Math.min(actions.length - 1, localFailureIndex - 1)
          : actions.length - 1;
        if (firstPivot < 0) continue;

        const legStartContext = getLegStartPhysicalContext(
          currentLegs,
          legIndex,
          initialContext
        );
        const actionsBeforeLeg = getPrefixActionsBeforeLeg(currentLegs, legIndex);

        for (let pivot = firstPivot; pivot >= 0; pivot -= 1) {
          const pivotState = pivot > 0
            ? cloneState(leg.transitions[pivot - 1].to)
            : cloneState(leg.initialState);
          const pivotAbsoluteActions = (leg.absoluteStartAction ?? legStartContext.absoluteActions) + pivot;
          const prefixActionIds = [
            ...actionsBeforeLeg,
            ...actions.slice(0, pivot)
          ];
          const constraintKey = getEstimatedRouteFailureConstraintKey(
            pivotState,
            pivotAbsoluteActions,
            prefixActionIds
          );
          let forbiddenActions = forbiddenRepairActionsByConstraint.get(constraintKey);
          if (!forbiddenActions) {
            forbiddenActions = new Set();
            forbiddenRepairActionsByConstraint.set(constraintKey, forbiddenActions);
          }
          const actionToReplace = actions[pivot];
          if (!actionToReplace) continue;
          forbiddenActions.add(actionToReplace);

          const pivotGuidanceContext = getEstimatedContextAfterActionPrefix(
            legStartContext,
            actions.slice(0, pivot)
          );
          const pivotContext = {
            ...pivotGuidanceContext,
            state: pivotState,
            absoluteActions: pivotAbsoluteActions
          };
          const suffix = getEstimatedLegRoute(
            pivotContext,
            legIndex,
            start,
            startIndex,
            Boolean(legIndex === 0 && pivot === 0 && options.startupSpinUp),
            [...forbiddenActions],
            []
          );
          if (!suffix) continue;

          const repairedLeg = pivot === 0 && legIndex === 0 && options.startupSpinUp
            ? suffix
            : combineEstimatedPhysicalRouteSuffix(
              leg,
              pivot,
              suffix,
              flags[legIndex],
              dynamicGoals[legIndex] ?? null,
              baseRouteOptions
            );
          const prefixLegs = currentLegs.slice(0, legIndex);
          const afterRepairedLeg = getPhysicalContextAfterEstimatedLeg(
            repairedLeg,
            legStartContext
          );
          let rebuilt = buildEstimatedCourseFrom(
            [...prefixLegs, repairedLeg],
            legIndex + 1,
            afterRepairedLeg,
            start,
            startIndex
          );
          if (!rebuilt.complete && rebuilt.legs.length) {
            const alternative = findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              startIndex,
              initialContext
            );
            if (alternative?.complete) rebuilt = alternative;
          }
          if (rebuilt.complete) {
            cardRepairPrefixBacktracks += 1;
            return rebuilt;
          }
        }
      }
      return null;
    };

    // Milestone 1: finish physical estimates for every start before any start is
    // judged by card supply. Later legs automatically share the estimate cache by
    // physical arrival class.
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const sourceIndex = Number.isInteger(start.analysisIndex)
        ? start.analysisIndex
        : index;
      const initialContext = makeInitialStartContext(start);
      let estimated = buildEstimatedCourseFrom(
        [],
        0,
        initialContext,
        start,
        sourceIndex
      );
      if (!estimated.complete && estimated.legs.length) {
        const alternative = findAlternativeEstimatedCourse(
          estimated.legs,
          estimated.failedLegIndex - 1,
          start,
          sourceIndex,
          initialContext
        );
        if (alternative?.complete) estimated = alternative;
      }
      if (estimated.complete) {
        estimatedMilestoneRoutes += 1;
        // Record only the selected Milestone-1 estimate for class-collapse
        // telemetry. Repair searches may visit many additional classes later and
        // must not make the initial lineage count look larger than the start field.
        let arrivalContext = initialContext;
        for (let legIndex = 0; legIndex < estimated.legs.length; legIndex += 1) {
          if (legIndex > 0) {
            const dynamicGoal = dynamicGoals[legIndex] ?? null;
            const namespace = options.recoveryRule === "home_reboot"
              ? `start${sourceIndex}`
              : "shared";
            const arrivalClassKey = getContextualSharedLegCatalogueKey(
              arrivalContext,
              legIndex,
              dynamicGoal,
              namespace
            );
            arrivalClassKeysByLeg[legIndex].add(arrivalClassKey);
            let classLineages = arrivalClassLineagesByLeg[legIndex].get(arrivalClassKey);
            if (!classLineages) {
              classLineages = new Set();
              arrivalClassLineagesByLeg[legIndex].set(arrivalClassKey, classLineages);
            }
            classLineages.add(sourceIndex);
          }
          arrivalContext = getPhysicalContextAfterEstimatedLeg(
            estimated.legs[legIndex],
            arrivalContext
          );
        }
        if (arrivalContext.estimatedCardForecastFeasible !== false) {
          estimatedForecastIntactRoutes += 1;
        }
      } else {
        estimatedPhysicalFailures += 1;
        estimatedPhysicalFailureStarts += 1;
      }
      estimatedEntries.push({
        index: sourceIndex,
        start,
        initialContext,
        estimated
      });
      // Cooperative boundary: one start's complete physical estimate is stable.
      // The async driver may yield to the browser here; the synchronous driver
      // simply advances immediately, preserving existing analysis semantics.
      yield { phase: "estimated-start", startIndex: sourceIndex };
    }

    survivorHistory.push({
      stage: "estimated",
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      survivingStarts: estimatedMilestoneRoutes,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - estimatedMilestoneRoutes),
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      totalCappedContexts: 0,
      distinctCappedStarts: 0,
      estimatedPrimaryRouting: true
    });

    // Milestone 2: realize each complete estimate against the exact rolling card
    // model. On the first impossible register, keep the physical prefix, prohibit
    // only that impossible next action for that exact prefix history, and estimate
    // a new suffix to the current flag. Any changed arrival causes later legs to
    // be re-estimated from that point forward.
    for (const estimatedEntry of estimatedEntries) {
      const {
        index: sourceIndex,
        start,
        initialContext
      } = estimatedEntry;
      if (!estimatedEntry.estimated.complete) {
        startPartials.push({ index: sourceIndex, start, partials: [] });
        yield { phase: "realized-start", startIndex: sourceIndex };
        continue;
      }

      let estimatedLegs = [...estimatedEntry.estimated.legs];
      let usedRepair = false;
      const seenCandidates = new Set();
      let realizedPartial = null;

      while (estimatedLegs.length === flags.length) {
        const fullActionIds = estimatedLegs.flatMap(
          (leg) => leg?.localActionIds || []
        );
        const candidateKey = estimatedLegs
          .map((leg) => getEstimatedRouteIdentity(leg))
          .join("||");
        if (seenCandidates.has(candidateKey)) {
          cardRepairRepeatedCandidates += 1;
          const lastLegIndex = estimatedLegs.length - 1;
          const lastLocalIndex = Math.max(
            0,
            (estimatedLegs[lastLegIndex]?.localActionIds?.length ?? 1) - 1
          );
          const alternative = backtrackEstimatedCourseFromPrefix(
            estimatedLegs,
            lastLegIndex,
            lastLocalIndex + 1,
            start,
            sourceIndex,
            initialContext
          ) ?? findAlternativeEstimatedCourse(
            estimatedLegs,
            lastLegIndex,
            start,
            sourceIndex,
            initialContext
          );
          if (!alternative?.complete) break;
          estimatedLegs = alternative.legs;
          usedRepair = true;
          continue;
        }
        seenCandidates.add(candidateKey);

        exactRealizationAttempts += 1;
        const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
          initialContext.programCardState,
          initialContext.absoluteActions,
          fullActionIds,
          baseRouteOptions
        );
        if (cardSolution.feasible) {
          const realized = realizeEstimatedLegsWithCardSolution(
            tileMap,
            estimatedLegs,
            initialContext,
            cardSolution,
            baseRouteOptions
          );
          const fullRoute = realized?.legs?.length === flags.length
            ? stitchContextualLegs(realized.legs, flags)
            : null;
          const validation = fullRoute ? summarizeRouteAgainUsage(fullRoute) : null;
          if (
            fullRoute &&
            validation?.literalProgramViolations === 0 &&
            validation?.rollingWindowViolations === 0
          ) {
            realizedPartial = {
              legs: realized.legs,
              context: realized.context,
              score: realized.score
            };
            if (usedRepair) exactRealizationRepairedSuccesses += 1;
            else exactRealizationDirectSuccesses += 1;
            break;
          }
          finalProgrammingValidationFailures += 1;
          break;
        }

        cardRepairFailurePoints += 1;
        const failureIndex = Math.max(
          0,
          Math.floor(Number(cardSolution.failureIndex) || 0)
        );
        let actionCursor = 0;
        let failureLegIndex = -1;
        let localFailureIndex = -1;
        for (let legIndex = 0; legIndex < estimatedLegs.length; legIndex += 1) {
          const actionCount = estimatedLegs[legIndex]?.localActionIds?.length ?? 0;
          if (failureIndex < actionCursor + actionCount) {
            failureLegIndex = legIndex;
            localFailureIndex = failureIndex - actionCursor;
            break;
          }
          actionCursor += actionCount;
        }
        if (failureLegIndex < 0 || localFailureIndex < 0) break;

        const failedLeg = estimatedLegs[failureLegIndex];
        const failedActionId = failedLeg.localActionIds?.[localFailureIndex] ?? null;
        if (!failedActionId) break;
        const legStartContext = getLegStartPhysicalContext(
          estimatedLegs,
          failureLegIndex,
          initialContext
        );
        const failureState = localFailureIndex > 0
          ? cloneState(failedLeg.transitions[localFailureIndex - 1].to)
          : cloneState(failedLeg.initialState);
        const failureAbsoluteActions = (
          failedLeg.absoluteStartAction + localFailureIndex
        );
        const prefixActionIds = fullActionIds.slice(0, failureIndex);
        const failureConstraintKey = getEstimatedRouteFailureConstraintKey(
          failureState,
          failureAbsoluteActions,
          prefixActionIds
        );
        let forbiddenActions = forbiddenRepairActionsByConstraint.get(
          failureConstraintKey
        );
        if (!forbiddenActions) {
          forbiddenActions = new Set();
          forbiddenRepairActionsByConstraint.set(
            failureConstraintKey,
            forbiddenActions
          );
        }
        forbiddenActions.add(failedActionId);

        const exactFailureGuidance = getEstimatedDemandStateFromCompactCardState(
          cardSolution.cardState
        );
        const failureContext = {
          ...legStartContext,
          state: failureState,
          absoluteActions: failureAbsoluteActions,
          programCardState: cardSolution.cardState
            ? { ...cardSolution.cardState }
            : null,
          estimatedCardFrontier: cardSolution.cardState
            ? [{ state: { ...cardSolution.cardState }, penalty: 0 }]
            : [],
          estimatedCardForecastFeasible: Boolean(cardSolution.cardState),
          approximatePreviousProgramDemandCode: exactFailureGuidance.previousDemandCode,
          approximateProgramDemandCode: exactFailureGuidance.demandCode,
          approximatePreviousAgainUsed: exactFailureGuidance.previousAgainUsed,
          approximateCurrentAgainUsed: exactFailureGuidance.currentAgainUsed,
          approximatePreviousActionId: exactFailureGuidance.previousActionId
        };
        const suffix = getEstimatedLegRoute(
          failureContext,
          failureLegIndex,
          start,
          sourceIndex,
          false,
          [...forbiddenActions],
          []
        );

        let repairedCourse = null;
        if (suffix) {
          const repairedLeg = combineEstimatedPhysicalRouteSuffix(
            failedLeg,
            localFailureIndex,
            suffix,
            flags[failureLegIndex],
            dynamicGoals[failureLegIndex] ?? null,
            baseRouteOptions
          );
          const prefixLegs = estimatedLegs.slice(0, failureLegIndex);
          const afterRepairedLeg = getPhysicalContextAfterEstimatedLeg(
            repairedLeg,
            legStartContext
          );
          const rebuilt = buildEstimatedCourseFrom(
            [...prefixLegs, repairedLeg],
            failureLegIndex + 1,
            afterRepairedLeg,
            start,
            sourceIndex
          );
          if (rebuilt.complete) {
            repairedCourse = rebuilt;
          } else {
            cardRepairDownstreamRebuildFailures += 1;
            repairedCourse = findAlternativeEstimatedCourse(
              rebuilt.legs,
              rebuilt.failedLegIndex - 1,
              start,
              sourceIndex,
              initialContext
            );
          }
        } else {
          cardRepairNoSuffix += 1;
          repairedCourse = backtrackEstimatedCourseFromPrefix(
            estimatedLegs,
            failureLegIndex,
            localFailureIndex,
            start,
            sourceIndex,
            initialContext
          ) ?? findAlternativeEstimatedCourse(
            estimatedLegs,
            failureLegIndex,
            start,
            sourceIndex,
            initialContext
          );
        }

        if (!repairedCourse?.complete) break;
        cardRepairReplans += 1;
        usedRepair = true;
        estimatedLegs = repairedCourse.legs;
      }

      if (realizedPartial) {
        startPartials.push({
          index: sourceIndex,
          start,
          partials: [realizedPartial]
        });
      } else {
        exactRealizationFailures += 1;
        startPartials.push({ index: sourceIndex, start, partials: [] });
      }
      // Cooperative boundary after this start's exact realization/repair work.
      yield { phase: "realized-start", startIndex: sourceIndex };
    }

    const realizedStarts = startPartials.filter(
      (entry) => entry.partials.length
    ).length;
    survivorHistory.push({
      stage: "realized",
      legIndex: Math.max(0, flags.length - 1),
      legNumber: Math.max(1, flags.length),
      survivingStarts: realizedStarts,
      requiredStarts: requiredSurvivingStarts,
      sourceStarts: starts.length,
      lostStarts: Math.max(0, starts.length - realizedStarts),
      cappedContextsThisLeg: 0,
      cappedStartsThisLeg: 0,
      totalCappedContexts: 0,
      distinctCappedStarts: 0,
      estimatedPrimaryRouting: true
    });

    // v35 traffic feedback -----------------------------------------------------
    // The intrinsic route is always completed and exactly realized first. Traffic
    // then operates in frozen exploration epochs. All modes use the same final
    // confidence-weighted traffic value and the same minimum useful gain. Slower
    // modes may spend effort on high raw congestion somewhat beyond Standard's
    // confidence horizon, but that relaxed value is search-demand only and can
    // never make a candidate look better in final route selection.
    if (
      options.contextualTrafficFeedbackEnabled &&
      !options.skipTraffic &&
      realizedStarts > 1
    ) {
      const trafficAlternatesEnabled =
        options.contextualTrafficDrivenAlternates !== false;
      const trafficEpochLimit = Math.max(
        0,
        Math.floor(Number(options.contextualTrafficEpochs) || 0)
      );
      const trafficDemandThreshold = Math.max(
        0,
        Number(options.contextualTrafficAlternateDemandThreshold) || 0
      );
      const trafficMinimumGain = Math.max(
        0,
        Number(options.contextualTrafficAlternateMinGain) || 0
      );
      const trafficLegsPerStart = Math.max(
        1,
        Math.floor(Number(options.contextualTrafficAlternateLegsPerStart) || 1)
      );
      const trafficMaxNewSearchesPerEpoch = Math.max(
        0,
        Math.floor(Number(options.contextualTrafficAlternateMaxNewSearchesPerEpoch) || 0)
      );
      const trafficCachedProbeMargin = Math.max(
        0,
        Number(options.contextualTrafficAlternateCachedProbeMargin) || 0
      );
      const trafficCachedProbeMaxSimilarity = clamp(
        Number(options.contextualTrafficAlternateCachedProbeMaxSimilarity) || 0.84,
        0,
        1
      );
      trafficExplorationUncertaintyShare = clamp(
        Number(options.contextualTrafficExplorationUncertaintyShare) || 0,
        0,
        1
      );
      trafficExplorationConfidenceFloor = clamp(
        Number.isFinite(Number(options.contextualTrafficExplorationConfidenceFloor))
          ? Number(options.contextualTrafficExplorationConfidenceFloor)
          : 1,
        TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
        1
      );

      const makeTrafficTemporaryAnalyses = () => startPartials.map((entry) => {
        const fullCourseRoutes = entry.partials
          .map((partial) => stitchContextualLegs(partial.legs, flags))
          .filter(Boolean)
          .sort((left, right) => left.score - right.score);
        const fullCourseRoute = fullCourseRoutes[0] ?? null;
        return buildStartAnalysisForSelectedFullRoute({
          index: entry.index,
          start: entry.start,
          reachable: Boolean(fullCourseRoute),
          fullCourseRoutes,
          fullCourseRoute,
          fullCourseRouteIndex: fullCourseRoute ? 0 : null,
          fullCourseTrafficPenalty: 0
        });
      });

      const getExactContextBeforeTrafficLeg = (
        exactLegs,
        legIndex,
        initialContext
      ) => {
        let context = {
          ...initialContext,
          state: cloneState(initialContext.state),
          history: getProgramHistoryWindow(initialContext.history),
          programCardState: initialContext.programCardState
            ? { ...initialContext.programCardState }
            : null
        };
        for (let index = 0; index < legIndex; index += 1) {
          context = getContextAfterLeg(exactLegs[index], context);
        }
        return context;
      };

      const makeEstimatedReplayLeg = (exactLeg, context) => {
        if (!exactLeg) return null;
        const oldCardPenalty = Math.max(
          0,
          Number(exactLeg.cardAvailabilityPenalty) || 0
        );
        const oldProgramPlausibilityPenalty = Math.max(
          0,
          Number(exactLeg.programPlausibilityPenalty) || 0
        );
        return rebaseEstimatedRouteSoftGuidance(
          {
            ...exactLeg,
            score: Number((
              (Number(exactLeg.score) || 0) -
              oldCardPenalty -
              oldProgramPlausibilityPenalty
            ).toFixed(2)),
            cardAvailabilityPenalty: 0,
            programPlausibilityPenalty: 0,
            approximateCardPlausibilityPenalty: 0,
            estimatedCardForecastPenalty: 0
          },
          context
        );
      };

      const realizeTrafficEstimatedCourse = (
        estimatedLegs,
        initialContext
      ) => {
        if (estimatedLegs.length !== flags.length) return null;
        trafficAlternateExactChecks += 1;
        const fullActionIds = estimatedLegs.flatMap(
          (leg) => leg?.localActionIds || []
        );
        const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
          initialContext.programCardState,
          initialContext.absoluteActions,
          fullActionIds,
          baseRouteOptions
        );
        if (!cardSolution.feasible) {
          trafficAlternateExactRejects += 1;
          trafficAlternateCardRejects += 1;
          return null;
        }
        const realized = realizeEstimatedLegsWithCardSolution(
          tileMap,
          estimatedLegs,
          initialContext,
          cardSolution,
          baseRouteOptions
        );
        const fullRoute = realized?.legs?.length === flags.length
          ? stitchContextualLegs(realized.legs, flags)
          : null;
        const validation = fullRoute ? summarizeRouteAgainUsage(fullRoute) : null;
        if (
          !fullRoute ||
          validation?.literalProgramViolations !== 0 ||
          validation?.rollingWindowViolations !== 0
        ) {
          trafficAlternateExactRejects += 1;
          trafficAlternateValidationRejects += 1;
          return null;
        }
        return {
          partial: {
            legs: realized.legs,
            context: realized.context,
            score: realized.score
          },
          route: fullRoute
        };
      };

      const getTrafficFullRouteIdentity = (route) => (
        (route?.legRoutes || [])
          .map((leg) => getEstimatedRouteIdentity(leg))
          .join("||")
      );

      for (let epoch = 0; epoch < trafficEpochLimit; epoch += 1) {
        const temporaryAnalyses = makeTrafficTemporaryAnalyses();
        const frozenSelection = selectFullCourseRoutesForStarts(
          tileMap,
          temporaryAnalyses,
          flags,
          {
            ...options,
            playerCount,
            fullCourseTrafficPasses: 1
          }
        );
        const frozenStarts = frozenSelection.starts.filter(
          (analysis) => analysis.reachable && analysis.fullCourseRoute
        );
        if (frozenStarts.length <= 1) break;

        trafficEpochsExecuted += 1;
        let epochNewSearches = 0;
        let epochCandidatesAdded = 0;
        const selectedRouteByIndex = new Map(
          frozenStarts.map((analysis) => [analysis.index, analysis.fullCourseRoute])
        );

        // Traffic-only Dev experiments still run the same confidence-weighted
        // occupancy epoch, but stop before cached-witness or new-geometry work.
        // Final full-course selection below reuses the same traffic model for the
        // balance score, so this cleanly isolates traffic scoring from rerouting.
        if (!trafficAlternatesEnabled) break;

        const fetchTrafficEstimatedLeg = (
          context,
          legIndex,
          start,
          startIndex,
          startupSpinUp = false,
          excludedPathKeys = [],
          effortScale = 1
        ) => {
          const dynamicGoal = dynamicGoals[legIndex] ?? null;
          const namespace = options.recoveryRule === "home_reboot"
            ? `start${startIndex}`
            : "shared";
          const cacheKey = getEstimatedLegCacheKey(
            context,
            legIndex,
            dynamicGoal,
            namespace,
            startupSpinUp,
            [],
            excludedPathKeys
          );
          const cached = estimatedLegCache.has(cacheKey);
          if (
            !cached &&
            epochNewSearches >= trafficMaxNewSearchesPerEpoch
          ) {
            return null;
          }
          const searchesBefore = estimatedLegSearches;
          const route = getEstimatedLegRoute(
            context,
            legIndex,
            start,
            startIndex,
            startupSpinUp,
            [],
            excludedPathKeys,
            "traffic",
            effortScale
          );
          const spent = Math.max(0, estimatedLegSearches - searchesBefore);
          epochNewSearches += spent;
          trafficAlternateNewSearches += spent;
          if (spent > 0 && !route) trafficAlternateSearchNoRoutes += 1;
          return route;
        };

        const buildTrafficCourseWithReplacement = (
          baselineRoute,
          replacementLeg,
          replacementLegIndex,
          start,
          startIndex,
          parentEffortScale = 1
        ) => {
          const baselineLegs = baselineRoute?.legRoutes || [];
          if (baselineLegs.length !== flags.length) return null;
          const initialContext = makeInitialStartContext(start);
          const legStartContext = getExactContextBeforeTrafficLeg(
            baselineLegs,
            replacementLegIndex,
            initialContext
          );
          const estimatedLegs = baselineLegs.slice(0, replacementLegIndex);
          estimatedLegs.push(replacementLeg);
          let context = getPhysicalContextAfterEstimatedLeg(
            replacementLeg,
            legStartContext
          );

          for (
            let legIndex = replacementLegIndex + 1;
            legIndex < flags.length;
            legIndex += 1
          ) {
            const oldLeg = baselineLegs[legIndex] ?? null;
            const canReplayOldLeg = Boolean(
              oldLeg &&
              stateKey(oldLeg.initialState) === stateKey(context.state) &&
              Number(oldLeg.absoluteStartAction) === Number(context.absoluteActions)
            );
            let nextLeg = canReplayOldLeg
              ? makeEstimatedReplayLeg(oldLeg, context)
              : null;
            if (!nextLeg) {
              const downstreamConfidence = getIntrinsicForecastConfidence(
                context.absoluteActions,
                context.hazardExposure,
                options
              );
              const downstreamEffortScale = Math.min(
                parentEffortScale,
                getTrafficAlternateEffortScale(downstreamConfidence, options)
              );
              nextLeg = fetchTrafficEstimatedLeg(
                context,
                legIndex,
                start,
                startIndex,
                false,
                [],
                downstreamEffortScale
              );
            }
            if (!nextLeg) {
              trafficAlternateDownstreamRebuildFailures += 1;
              return null;
            }
            estimatedLegs.push(nextLeg);
            context = getPhysicalContextAfterEstimatedLeg(nextLeg, context);
          }

          return realizeTrafficEstimatedCourse(estimatedLegs, initialContext);
        };

        for (const analysis of frozenStarts) {
          const baselineRoute = selectedRouteByIndex.get(analysis.index);
          if (!baselineRoute?.legRoutes?.length) continue;
          const occupancyByIndex = buildConditionalOccupancyMap(
            frozenStarts,
            analysis.index,
            playerCount,
            options,
            (other) => selectedRouteByIndex.get(other.index)
          );
          const otherRouteEntries = frozenStarts
            .filter((other) => other.index !== analysis.index)
            .map((other) => ({
              route: selectedRouteByIndex.get(other.index),
              occupancyWeight: occupancyByIndex.get(other.index) ?? 0
            }))
            .filter((entry) => entry.route && entry.occupancyWeight > 0);
          const baselineBreakdown = getExpectedTrafficBreakdown(
            tileMap,
            baselineRoute,
            otherRouteEntries,
            flags,
            options
          );
          const legBreakdowns = baselineBreakdown.byLeg || [];
          const demandedLegs = legBreakdowns
            .map((breakdown, legIndex) => {
              const legWeight = legIndex === 0
                ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
                : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
              const weightedTraffic = breakdown.total * legWeight;
              const weightedRawTraffic = (breakdown.rawTotal ?? breakdown.total) * legWeight;
              const confidence = Number(breakdown.confidenceMean) || 0;
              // Balanced/Thorough may use some of the uncertainty-discounted gap
              // solely to decide whether a leg deserves investigation. This does
              // not flow into candidate gain or final route selection.
              const explorationEligible = Boolean(
                trafficExplorationUncertaintyShare > 0 &&
                confidence >= trafficExplorationConfidenceFloor &&
                weightedRawTraffic > weightedTraffic
              );
              const explorationTraffic = explorationEligible
                ? weightedTraffic +
                  (weightedRawTraffic - weightedTraffic) * trafficExplorationUncertaintyShare
                : weightedTraffic;
              const demandKind = weightedTraffic >= trafficDemandThreshold
                ? "effective"
                : explorationTraffic >= trafficDemandThreshold
                  ? "exploratory"
                  : null;
              const effortScale = getTrafficAlternateEffortScale(confidence, options);
              return {
                legIndex,
                breakdown,
                weightedTraffic,
                weightedRawTraffic,
                explorationTraffic,
                demandKind,
                effortScale,
                effortPriority: explorationTraffic * effortScale
              };
            })
            .filter((entry) => entry.demandKind)
            .sort((left, right) => (
              right.effortPriority - left.effortPriority ||
              right.explorationTraffic - left.explorationTraffic ||
              right.weightedTraffic - left.weightedTraffic
            ))
            .slice(0, trafficLegsPerStart);
          if (!demandedLegs.length) continue;
          trafficAlternateDemandStarts += 1;
          trafficAlternateDemandLegs += demandedLegs.length;
          demandedLegs.forEach((entry) => {
            trafficAlternateDemandByLeg[entry.legIndex] += 1;
            trafficAlternateEffortScaleSum += entry.effortScale;
            trafficAlternateEffortScaleCount += 1;
            trafficAlternateMinimumEffortScale = Math.min(
              trafficAlternateMinimumEffortScale,
              entry.effortScale
            );
            if (entry.demandKind === "exploratory") {
              trafficAlternateExploratoryDemandLegs += 1;
            } else {
              trafficAlternateEffectiveDemandLegs += 1;
            }
          });

          const startEntry = startPartials.find(
            (entry) => entry.index === analysis.index
          );
          if (!startEntry) continue;
          const existingFullRouteIds = new Set(
            startEntry.partials
              .map((partial) => stitchContextualLegs(partial.legs, flags))
              .filter(Boolean)
              .map(getTrafficFullRouteIdentity)
          );
          let bestCandidate = null;
          let bestCandidateLegIndex = -1;
          let bestGain = -Infinity;

          for (const demanded of demandedLegs) {
            const legIndex = demanded.legIndex;
            const baselineLeg = baselineRoute.legRoutes[legIndex];
            if (!baselineLeg) continue;
            const initialContext = makeInitialStartContext(startEntry.start);
            const legStartContext = getExactContextBeforeTrafficLeg(
              baselineRoute.legRoutes,
              legIndex,
              initialContext
            );
            const dynamicGoal = dynamicGoals[legIndex] ?? null;
            const namespace = options.recoveryRule === "home_reboot"
              ? `start${analysis.index}`
              : "shared";
            const baseCacheKey = getEstimatedLegCacheKey(
              legStartContext,
              legIndex,
              dynamicGoal,
              namespace,
              Boolean(legIndex === 0 && options.startupSpinUp),
              [],
              []
            );
            const baselineLegId = getEstimatedRouteIdentity(baselineLeg);
            const cachedWitnesses = (estimatedLegCache.get(baseCacheKey) || [])
              .map((route) => rebaseEstimatedRouteSoftGuidance(route, legStartContext))
              .filter(Boolean)
              .filter((route) => getEstimatedRouteIdentity(route) !== baselineLegId)
              .sort((left, right) => left.score - right.score);
            // v35: the already-paid arrival-class witnesses are the cheap divergence
            // probe. A meaningfully different cached route that is clearly poor under
            // the frozen traffic field is evidence against spending another full leg
            // search in Standard. This is only an optional-breadth decision; it never
            // changes intrinsic reachability or exact card legality.
            const divergentCachedWitnesses = cachedWitnesses.filter((route) => (
              routeSimilarity(baselineLeg, route, flags[legIndex]) <=
              trafficCachedProbeMaxSimilarity
            ));
            const attemptedLegIds = new Set([baselineLegId]);

            const evaluateReplacement = (replacementLeg) => {
              if (!replacementLeg) return null;
              const replacementId = getEstimatedRouteIdentity(replacementLeg);
              if (attemptedLegIds.has(replacementId)) return null;
              attemptedLegIds.add(replacementId);
              const realized = buildTrafficCourseWithReplacement(
                baselineRoute,
                replacementLeg,
                legIndex,
                startEntry.start,
                analysis.index,
                demanded.effortScale
              );
              if (!realized?.route) return null;
              const fullIdentity = getTrafficFullRouteIdentity(realized.route);
              if (!fullIdentity || existingFullRouteIds.has(fullIdentity)) {
                trafficAlternateDuplicateRejects += 1;
                return null;
              }
              const candidateTraffic = getExpectedTrafficBreakdown(
                tileMap,
                realized.route,
                otherRouteEntries,
                flags,
                options
              );
              const gain = (
                baselineRoute.score + baselineBreakdown.total
              ) - (
                realized.route.score + candidateTraffic.total
              );
              if (gain < trafficMinimumGain) trafficAlternateLowGainRejects += 1;
              if (gain > bestGain) {
                bestGain = gain;
                bestCandidate = realized;
                bestCandidateLegIndex = legIndex;
              }
              return gain;
            };

            let cachedProbeBestGain = -Infinity;
            for (const cachedWitness of divergentCachedWitnesses) {
              trafficAlternateCachedWitnessChecks += 1;
              const gain = evaluateReplacement(cachedWitness);
              if (Number.isFinite(gain)) cachedProbeBestGain = Math.max(cachedProbeBestGain, gain);
            }

            const cachedProbeClearlyPoor = Boolean(
              divergentCachedWitnesses.length > 0 &&
              Number.isFinite(cachedProbeBestGain) &&
              cachedProbeBestGain < trafficMinimumGain - trafficCachedProbeMargin
            );
            if (cachedProbeClearlyPoor) {
              trafficAlternateCachedProbeStops += 1;
            } else if (
              bestGain < trafficMinimumGain &&
              epochNewSearches < trafficMaxNewSearchesPerEpoch
            ) {
              trafficAlternateEscalations += 1;
              const alternate = fetchTrafficEstimatedLeg(
                legStartContext,
                legIndex,
                startEntry.start,
                analysis.index,
                Boolean(legIndex === 0 && options.startupSpinUp),
                [...attemptedLegIds],
                demanded.effortScale
              );
              evaluateReplacement(alternate);
            }
          }

          if (bestCandidate && bestGain >= trafficMinimumGain) {
            startEntry.partials.push(bestCandidate.partial);
            trafficAlternateCandidatesAdded += 1;
            trafficAlternateBeneficialCandidates += 1;
            if (bestCandidateLegIndex >= 0) {
              trafficAlternateCandidatesByLeg[bestCandidateLegIndex] += 1;
            }
            trafficAlternateBestGain = Math.max(
              trafficAlternateBestGain,
              bestGain
            );
            epochCandidatesAdded += 1;
          }
          yield { phase: "traffic-start", startIndex: analysis.index, epoch };
        }

        if (!epochCandidatesAdded) break;
      }
    }

    // Only after every start has completed both milestones may the ordinary
    // player-count acceptance floor reject the course.
    if (earlyExitEnabled && realizedStarts < requiredSurvivingStarts) {
      throwCapacityLost(
        Math.max(0, flags.length - 1),
        makeSurvivorSnapshot(Math.max(0, flags.length - 1), {
          survivingStarts: realizedStarts,
          maximumPossibleStarts: realizedStarts,
          processedStartsThisLeg: starts.length
        })
      );
    }
  } else {
  const openingUnresolvedCaps = [];
  let openingSurvivors = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const sourceIndex = Number.isInteger(start.analysisIndex)
      ? start.analysisIndex
      : index;
    const context = {
      state: {
        x: start.x,
        y: start.y,
        facing: start.facing ?? "E"
      },
      absoluteActions: 0,
      history: [],
      programCardState: {
        feasible: true,
        previousCode: 0,
        currentCode: 0,
        previousActionId: null
      },
      energyReserve: getInitialRouteEnergyShadowReserve(baseRouteOptions),
      upgradeCardUnits: null,
      hazardExposure: 0
    };
    const openingSeed = openingSeedByIndex.get(sourceIndex) ?? null;
    const normalizedSeedRoute = normalizeOpeningSeedRoute(
      openingSeed?.selectedRoute ?? openingSeed?.routes?.[0] ?? null
    );
    const seededRoute = normalizedSeedRoute
      ? rebaseContextualCachedRoute(
        tileMap,
        normalizedSeedRoute,
        context,
        baseRouteOptions
      )
      : null;
    let openingRoutes = null;
    if (seededRoute) {
      seededOpeningStarts += 1;
      openingRoutes = [seededRoute];
    } else {
      openingRoutes = getLegRoutes(
        context,
        0,
        start,
        sourceIndex,
        Boolean(options.startupSpinUp)
      );
    }
    const partials = openingRoutes.map((route) => ({
      legs: [route],
      context: getContextAfterLeg(route, context),
      score: route.score
    }));
    let selectedPartials = selectContextualPartialBeam(
      partials,
      flags[0],
      getContextualBeamWidthForPartials(
        partials,
        options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
        baseRouteOptions
      ),
      {
        wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
        flags: flags.slice(0, 1)
      }
    );
    if (selectedPartials.length) openingSurvivors += 1;
    const startEntry = {
      index: sourceIndex,
      start,
      partials: selectedPartials
    };
    startPartials.push(startEntry);
    if (!selectedPartials.length && isUnresolvedCappedRouteSet(openingRoutes)) {
      openingUnresolvedCaps.push({
        entry: startEntry,
        context,
        start,
        startIndex: sourceIndex,
        startupSpinUp: Boolean(options.startupSpinUp),
        searchMeta: openingRoutes.contextualSearchMeta ?? null,
        attempted: false
      });
    }

    const remainingStarts = starts.length - index - 1;
    let maximumPossibleStarts = openingSurvivors + remainingStarts;

    // A capped zero-route search is unresolved. Only when treating those capped
    // starts as losses would make the player-count floor impossible do we spend
    // the larger rescue budget, stopping as soon as capacity is restored.
    if (
      earlyExitEnabled &&
      maximumPossibleStarts < requiredSurvivingStarts
    ) {
      for (const unresolved of openingUnresolvedCaps) {
        if (unresolved.attempted || unresolved.entry.partials.length) continue;
        unresolved.attempted = true;
        const rescuedRoutes = runCapacityRescue(
          unresolved.context,
          0,
          unresolved.start,
          unresolved.startIndex,
          unresolved.startupSpinUp,
          unresolved.searchMeta
        );
        if (rescuedRoutes.length) {
          const rescuedPartials = rescuedRoutes.map((route) => ({
            legs: [route],
            context: getContextAfterLeg(route, unresolved.context),
            score: route.score
          }));
          unresolved.entry.partials = selectContextualPartialBeam(
            rescuedPartials,
            flags[0],
            getContextualBeamWidthForPartials(
              rescuedPartials,
              options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
              baseRouteOptions
            ),
            {
              wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
              flags: flags.slice(0, 1)
            }
          );
        }
        openingSurvivors = startPartials.filter((candidate) => candidate.partials.length).length;
        maximumPossibleStarts = openingSurvivors + remainingStarts;
        if (maximumPossibleStarts >= requiredSurvivingStarts) break;
      }
    }

    // v17 safe capacity short-circuit remains exact after all currently relevant
    // unresolved capped starts have had their one rescue attempt.
    if (
      earlyExitEnabled &&
      maximumPossibleStarts < requiredSurvivingStarts
    ) {
      throwCapacityLost(
        0,
        makeSurvivorSnapshot(0, {
          survivingStarts: openingSurvivors,
          maximumPossibleStarts,
          processedStartsThisLeg: index + 1
        })
      );
    }

    if (
      stopWhenPreferredLost &&
      remainingStarts > 0 &&
      openingSurvivors >= requiredSurvivingStarts &&
      maximumPossibleStarts < preferredSurvivingStarts
    ) {
      preferredCapacityShortCircuits += 1;
      break;
    }
    yield { phase: "opening-start", startIndex: sourceIndex };
  }

  if (startPartials.length < starts.length) {
    for (let index = startPartials.length; index < starts.length; index += 1) {
      const start = starts[index];
      startPartials.push({
        index: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index,
        start,
        partials: []
      });
    }
  }

  const recordSurvivorHealthAndAbortIfLost = (legIndex, extra = {}) => {
    const snapshot = makeSurvivorSnapshot(legIndex, extra);
    if (!earlyExitEnabled || snapshot.survivingStarts >= requiredSurvivingStarts) {
      survivorHistory.push(snapshot);
      return;
    }
    throwCapacityLost(legIndex, snapshot);
  };

  // A capped branch is only telemetry. Abort after the whole opening leg has
  // been evaluated, and only if too few starts retain any viable continuation.
  recordSurvivorHealthAndAbortIfLost(0);

  for (let legIndex = 1; legIndex < flags.length; legIndex += 1) {
    let preferredStopped = false;
    const unresolvedCapsThisLeg = [];
    for (let entryIndex = 0; entryIndex < startPartials.length; entryIndex += 1) {
      const entry = startPartials[entryIndex];
      if (!entry.partials.length) {
        continue;
      }

      const sourcePartials = entry.partials;
      const extensions = [];
      const cappedSourcePartials = [];
      for (const partial of sourcePartials) {
        const legRoutes = getLegRoutes(
          partial.context,
          legIndex,
          entry.start,
          entry.index,
          false
        );
        if (!legRoutes.length && isUnresolvedCappedRouteSet(legRoutes)) {
          cappedSourcePartials.push({
            partial,
            searchMeta: legRoutes.contextualSearchMeta ?? null
          });
        }
        for (const route of legRoutes) {
          extensions.push({
            legs: [...partial.legs, route],
            context: getContextAfterLeg(route, partial.context),
            score: partial.score + route.score
          });
        }
      }

      entry.partials = selectContextualPartialBeam(
        extensions,
        flags[legIndex],
        getContextualBeamWidthForPartials(
          extensions,
          options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
          baseRouteOptions
        ),
        {
          wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
          flags: flags.slice(0, legIndex + 1)
        }
      );
      if (!entry.partials.length && cappedSourcePartials.length) {
        unresolvedCapsThisLeg.push({
          entry,
          sourcePartials: cappedSourcePartials,
          attempted: false
        });
      }

      let processedSurvivors = startPartials
        .slice(0, entryIndex + 1)
        .filter((candidate) => candidate.partials.length).length;
      const unprocessedPotential = startPartials
        .slice(entryIndex + 1)
        .filter((candidate) => candidate.partials.length).length;
      let maximumPossibleStarts = processedSurvivors + unprocessedPotential;

      if (
        earlyExitEnabled &&
        maximumPossibleStarts < requiredSurvivingStarts
      ) {
        for (const unresolved of unresolvedCapsThisLeg) {
          if (unresolved.attempted || unresolved.entry.partials.length) continue;
          unresolved.attempted = true;
          const rescueExtensions = [];
          for (const unresolvedSource of unresolved.sourcePartials) {
            const partial = unresolvedSource.partial;
            const rescuedRoutes = runCapacityRescue(
              partial.context,
              legIndex,
              unresolved.entry.start,
              unresolved.entry.index,
              false,
              unresolvedSource.searchMeta
            );
            for (const route of rescuedRoutes) {
              rescueExtensions.push({
                legs: [...partial.legs, route],
                context: getContextAfterLeg(route, partial.context),
                score: partial.score + route.score
              });
            }
            if (rescueExtensions.length) break;
          }
          if (rescueExtensions.length) {
            unresolved.entry.partials = selectContextualPartialBeam(
              rescueExtensions,
              flags[legIndex],
              getContextualBeamWidthForPartials(
                rescueExtensions,
                options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
                baseRouteOptions
              ),
              {
                wholePartialDiversity: Boolean(options.contextualWholePartialDiversity),
                flags: flags.slice(0, legIndex + 1)
              }
            );
          }
          processedSurvivors = startPartials
            .slice(0, entryIndex + 1)
            .filter((candidate) => candidate.partials.length).length;
          maximumPossibleStarts = processedSurvivors + unprocessedPotential;
          if (maximumPossibleStarts >= requiredSurvivingStarts) break;
        }
      }

      // Same exact short-circuit for later legs, but only after unresolved capped
      // searches that matter to capacity have had their one larger-budget retry.
      if (
        earlyExitEnabled &&
        maximumPossibleStarts < requiredSurvivingStarts
      ) {
        throwCapacityLost(
          legIndex,
          makeSurvivorSnapshot(legIndex, {
            survivingStarts: processedSurvivors,
            maximumPossibleStarts,
            processedStartsThisLeg: entryIndex + 1
          })
        );
      }

      if (
        stopWhenPreferredLost &&
        unprocessedPotential > 0 &&
        processedSurvivors >= requiredSurvivingStarts &&
        maximumPossibleStarts < preferredSurvivingStarts
      ) {
        for (let restIndex = entryIndex + 1; restIndex < startPartials.length; restIndex += 1) {
          startPartials[restIndex].partials = [];
        }
        preferredCapacityShortCircuits += 1;
        preferredStopped = true;
        break;
      }
      yield { phase: "later-leg-start", startIndex: entry.index, legIndex };
    }

    const legSurvivors = startPartials.filter((candidate) => candidate.partials.length).length;
    recordSurvivorHealthAndAbortIfLost(legIndex, {
      survivingStarts: legSurvivors,
      preferredCapacityShortCircuit: preferredStopped
    });
  }

  }

  const startAnalyses = startPartials.map((entry) => {
    const fullCourseRoutes = entry.partials
      .map((partial) => (
        stitchContextualLegs(partial.legs, flags)
      ))
      .filter((route) => {
        if (!route) return false;
        // v28 final safety gate: every accepted whole-course route must still
        // satisfy the literal-card assignments and rolling two-program supply
        // after all exact leg stitches are concatenated. This should normally be
        // redundant; a failure indicates a stitching/cache bug, so never expose it
        // as a reachable route.
        const validation = summarizeRouteAgainUsage(route);
        const legal = (
          validation.literalProgramViolations === 0 &&
          validation.rollingWindowViolations === 0
        );
        if (!legal) finalProgrammingValidationFailures += 1;
        return legal;
      })
      .sort((left, right) => left.score - right.score);
    const fullCourseRoute = fullCourseRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: entry.index,
      start: entry.start,
      reachable: Boolean(fullCourseRoute),
      fullCourseRoutes,
      fullCourseRoute,
      fullCourseRouteIndex: fullCourseRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const selection = options.skipFullCourseTraffic
    ? {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0,
      maxTrafficPenalty: 0,
      averageOpeningTrafficPenalty: 0,
      averageLaterTrafficPenalty: 0,
      candidateDiagnostics: startAnalyses
        .filter((analysis) => analysis.reachable && analysis.fullCourseRoutes?.length)
        .map((analysis) => summarizeFullCourseCandidateDiversity(
          analysis,
          flags,
          analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0]
        ))
    }
    : selectFullCourseRoutesForStarts(
      tileMap,
      startAnalyses,
      flags,
      {
        ...options,
        playerCount
      }
    );
  const selectedStartAnalyses = selection.starts.map(
    (analysis) => (
      buildStartAnalysisForSelectedFullRoute(analysis)
    )
  );
  const fullScores = selectedStartAnalyses
    .filter(
      (item) => item.reachable && item.fullCourseRoute
    )
    .map(
      (item) => (
        item.fullCourseRoute.score +
        (item.fullCourseTrafficPenalty ?? 0)
      )
    );
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map(
    (analysis) => {
      if (!analysis.fullCourseRoute) {
        return analysis;
      }

      const fullScore = (
        analysis.fullCourseRoute.score +
        (analysis.fullCourseTrafficPenalty ?? 0)
      );
      const rawDelta = fullScore - meanFullScore;
      return {
        ...analysis,
        courseEstimate: {
          ...analysis.courseEstimate,
          meanFullScore: Number(meanFullScore.toFixed(2)),
          delta: Number(rawDelta.toFixed(2))
        },
        courseScoreAdjustment: Number(
          clamp(rawDelta * 0.32, -10, 10).toFixed(2)
        )
      };
    }
  );

  selectAndScoreStartAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    playerCount,
    null,
    options
  );
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
    adjustedStartAnalyses,
    flags,
    playerCount
  );
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );
  const programmingScarcity = summarizeSelectedProgrammingScarcity(
    adjustedStartAnalyses
  );

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(
        meanFullScore.toFixed(2)
      ),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      programmingScarcity,
      contextualLegRoutes: true,
      contextualLegCache: {
        entries: legCache.size,
        templateEntries: templateCache.size,
        catalogueEntries: sharedLegCatalogueCache.size,
        hits: cacheHits + templateHits + catalogueCacheHits,
        exactHits: cacheHits,
        templateHits,
        catalogueLookups,
        catalogueCacheHits,
        catalogueSearches,
        catalogueCappedSearches,
        catalogueExhaustedSearches,
        catalogueSuppressedCappedLookups,
        catalogueReplayRouteChecks,
        catalogueCompatibleLineages,
        catalogueCompatibleRoutes,
        catalogueIncompatibleLineages,
        catalogueRefinementSearches,
        catalogueEnrichmentSearches,
        catalogueEnrichmentSuccesses,
        catalogueEnrichmentSuppressed,
        misses: cacheMisses,
        templateFallbacks,
        zeroRouteCapFailures,
        zeroRouteHorizonFailures,
        zeroRouteFailureStarts: zeroRouteFailureStarts.size,
        zeroRouteHorizonFailureStarts: zeroRouteHorizonFailureStarts.size,
        zeroRouteFailureStartIndices: [...zeroRouteFailureStarts].sort((a, b) => a - b),
        zeroRouteHorizonFailureStartIndices: [...zeroRouteHorizonFailureStarts].sort((a, b) => a - b),
        seededOpeningRoutes: seededOpeningStarts > 0,
        seededOpeningStarts,
        survivorHistory: survivorHistory.map((entry) => ({ ...entry })),
        survivingStarts: startPartials.filter((entry) => entry.partials.length).length,
        requiredSurvivingStarts,
        preferredSurvivingStarts,
        preferredCapacityShortCircuits,
        capacityRescueSearches,
        capacityRescueSuccesses,
        capacityPhysicalRescueSearches,
        capacityPhysicalRescueSuccesses,
        capacityHorizonRescueSearches,
        capacityHorizonRescueSuccesses,
        capacityExpansionRescueSearches,
        capacityExpansionRescueSuccesses,
        fastCardState: options.contextualFastCardState !== false,
        numericHotStateKeys: options.contextualFastCardState !== false,
        estimatedPrimaryRouting: Boolean(options.contextualEstimatedPrimaryRouting),
        estimatedLegCacheEntries: estimatedLegCache.size,
        estimatedLegSearches,
        estimatedLegWidenedSearches,
        estimatedLegCacheHits,
        estimatedLegWitnessesGenerated,
        estimatedMilestoneRoutes,
        estimatedPhysicalFailures,
        estimatedPhysicalFailureStarts,
        estimatedForecastIntactRoutes,
        exactRealizationAttempts,
        exactRealizationDirectSuccesses,
        exactRealizationRepairedSuccesses,
        exactRealizationFailures,
        cardRepairReplans,
        cardRepairFailurePoints,
        cardRepairPrefixBacktracks,
        cardRepairNoSuffix,
        cardRepairDownstreamRebuildFailures,
        cardRepairRepeatedCandidates,
        estimatedEnergyGuidance: options.contextualEstimatedEnergyGuidance !== false,
        trafficEpochsExecuted,
        trafficAlternateDemandStarts,
        trafficAlternateDemandLegs,
        trafficAlternateCachedWitnessChecks,
        trafficAlternateNewSearches,
        trafficAlternateExactChecks,
        trafficAlternateExactRejects,
        trafficAlternateCandidatesAdded,
        trafficAlternateBeneficialCandidates,
        trafficAlternateBestGain: Number(trafficAlternateBestGain.toFixed(2)),
        trafficAlternateCachedProbeStops,
        trafficAlternateEscalations,
        trafficAlternateSearchNoRoutes,
        trafficAlternateCardRejects,
        trafficAlternateValidationRejects,
        trafficAlternateDuplicateRejects,
        trafficAlternateLowGainRejects,
        trafficAlternateDownstreamRebuildFailures,
        trafficAlternateEffectiveDemandLegs,
        trafficAlternateExploratoryDemandLegs,
        trafficAlternateAverageEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        trafficAlternateMinimumEffortScale: trafficAlternateEffortScaleCount
          ? Number(trafficAlternateMinimumEffortScale.toFixed(3))
          : 1,
        trafficExplorationUncertaintyShare,
        trafficExplorationConfidenceFloor,
        trafficAlternateDemandByLeg: trafficAlternateDemandByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          count
        })),
        trafficAlternateCandidatesByLeg: trafficAlternateCandidatesByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          count
        })),
        arrivalClassRouting: Boolean(
          options.contextualEstimatedPrimaryRouting ||
          options.contextualSharedLaterLegCatalogue
        ),
        primaryWitnessRoutes: Math.max(
          1,
          Math.floor(Number(options.contextualPrimaryWitnessRoutes) || 3)
        ),
        catalogueWitnessesGenerated,
        catalogueWitnessResolvedLineages,
        finalProgrammingValidationFailures,
        catalogueWitnessRankSuccesses: catalogueWitnessRankSuccesses.map((count, index) => ({
          witness: index + 1,
          successes: count || 0
        })),
        arrivalClassesByLeg: arrivalClassKeysByLeg.map((keys, legIndex) => ({
          leg: legIndex + 1,
          lineages: [...arrivalClassLineagesByLeg[legIndex].values()]
            .reduce((sum, set) => sum + set.size, 0),
          classes: keys.size
        })),
        capacityPolicy: options.contextualEstimatedPrimaryRouting
          ? "all-starts-primary+acceptance-floor-only"
          : Number.isFinite(Number(options.contextualRequiredStarts))
            ? "explicit-floor"
            : "player-count-floor",
        zeroRouteCapsByLeg: zeroRouteCapsByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          contexts: count,
          starts: zeroRouteFailureStartsByLeg[legIndex].size
        })),
        zeroRouteHorizonsByLeg: zeroRouteHorizonsByLeg.map((count, legIndex) => ({
          leg: legIndex + 1,
          contexts: count,
          starts: zeroRouteHorizonFailureStartsByLeg[legIndex].size
        }))
      },
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        trafficEpochsExecuted,
        alternateDemandStarts: trafficAlternateDemandStarts,
        alternateDemandLegs: trafficAlternateDemandLegs,
        alternateCachedWitnessChecks: trafficAlternateCachedWitnessChecks,
        alternateNewSearches: trafficAlternateNewSearches,
        alternateExactChecks: trafficAlternateExactChecks,
        alternateExactRejects: trafficAlternateExactRejects,
        alternateCandidatesAdded: trafficAlternateCandidatesAdded,
        alternateBestGain: Number(trafficAlternateBestGain.toFixed(2)),
        alternateEffectiveDemandLegs: trafficAlternateEffectiveDemandLegs,
        alternateExploratoryDemandLegs: trafficAlternateExploratoryDemandLegs,
        alternateAverageEffortScale: trafficAlternateEffortScaleCount
          ? Number((trafficAlternateEffortScaleSum / trafficAlternateEffortScaleCount).toFixed(3))
          : 1,
        alternateMinimumEffortScale: trafficAlternateEffortScaleCount
          ? Number(trafficAlternateMinimumEffortScale.toFixed(3))
          : 1,
        explorationUncertaintyShare: trafficExplorationUncertaintyShare,
        explorationConfidenceFloor: trafficExplorationConfidenceFloor,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        legAwareOverlap: true,
        contextualLegRoutes: true,
        openingRoutesPerStart: options.contextualOpeningRoutes ?? CONTEXTUAL_OPENING_ROUTES,
        laterRoutesPerContext: options.contextualLaterRoutes ?? CONTEXTUAL_LATER_ROUTES,
        stitchedBeamWidth: options.contextualBeamWidth ?? CONTEXTUAL_BEAM_WIDTH,
        completionPool: options.contextualCompletionPool ?? CONTEXTUAL_COMPLETION_POOL,
        optionalCompletionExpansions: options.contextualOptionalCompletionExpansions ?? null,
        openingLegWeight:
          FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight:
          FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

function analyzeFullCourseContextual(tileMap, starts, flags, options = {}) {
  const iterator = analyzeFullCourseContextualSteps(tileMap, starts, flags, options);
  let step = iterator.next();
  while (!step.done) {
    step = iterator.next();
  }
  return step.value;
}

export async function analyzeFullCourseCooperative(tileMap, starts, flags, options = {}) {
  // Only the contextual path needs cooperative browser deferral in production.
  // Seeded/simpler paths retain their existing synchronous implementation.
  if (!options.contextualLegSearch || Array.isArray(options.contextualSeedStartAnalyses)) {
    return analyzeFullCourse(tileMap, starts, flags, options);
  }

  const iterator = analyzeFullCourseContextualSteps(tileMap, starts, flags, options);
  const cooperativeYield = typeof options.cooperativeYield === "function"
    ? options.cooperativeYield
    : null;
  const shouldStopRequested = typeof options.shouldStopRequested === "function"
    ? options.shouldStopRequested
    : () => false;
  const requestedYieldIntervalMs = Number(options.cooperativeYieldIntervalMs);
  const yieldIntervalMs = Number.isFinite(requestedYieldIntervalMs)
    ? Math.max(0, requestedYieldIntervalMs)
    : 250;
  let lastBrowserYieldAt = analysisTelemetryNow();

  if (shouldStopRequested()) {
    const error = new Error("Analysis stopped at a cooperative boundary.");
    error.code = "ANALYSIS_STOP_REQUESTED";
    throw error;
  }

  let step = iterator.next();
  while (!step.done) {
    const now = analysisTelemetryNow();
    if (cooperativeYield && now - lastBrowserYieldAt >= yieldIntervalMs) {
      await cooperativeYield(step.value);
      lastBrowserYieldAt = analysisTelemetryNow();
    }
    if (shouldStopRequested()) {
      if (typeof iterator.return === "function") iterator.return();
      const error = new Error("Analysis stopped at a cooperative boundary.");
      error.code = "ANALYSIS_STOP_REQUESTED";
      throw error;
    }
    step = iterator.next();
  }
  return step.value;
}

export function analyzeFullCourse(tileMap, starts, flags, options = {}) {
  if (options.contextualLegSearch && Array.isArray(options.contextualSeedStartAnalyses)) {
    return analyzeSeededFullCourseContextual(
      tileMap,
      starts,
      flags,
      options
    );
  }
  if (options.contextualLegSearch) {
    return analyzeFullCourseContextual(
      tileMap,
      starts,
      flags,
      options
    );
  }
  const maxRoutes = options.maxRoutes ?? 2;
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const routeOptions = {
    maxRoutes,
    maxActions: options.maxActions,
    maxExpansions: options.maxExpansions,
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring),
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive,
    setToKill: Boolean(options.setToKill),
    setToStun: Boolean(options.setToStun),
    lessForeshadowing: options.lessForeshadowing,
    contextualTrafficAlternativeRetention: Boolean(
      options.contextualTrafficAlternativeRetention
    ),
    repairStations: Boolean(options.repairStations),
    playerCount,
    virtualBots: Boolean(options.virtualBots),
    trafficGraceRegisters: Math.max(0, Number(options.trafficGraceRegisters) || 0),
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoals,
    portalMap
  };

  const enumeratePreparedRoutesForStart = (start) => {
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const diverseSearch = Boolean(options.diverseFullCourseSearch);
    const completionPool = diverseSearch
      ? Math.min(5, maxRoutes + 2)
      : maxRoutes;
    const rawRoutes = dedupeRoutes(enumerateFullCourseRoutes(tileMap, start, flags, {
      ...routeOptions,
      rebootTokens,
      maxRoutes: completionPool,
      maxStateLabels: diverseSearch ? 2 : 1,
      diverseStateLabelsAfterFirstCheckpoint: diverseSearch,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations
    })).sort((left, right) => left.score - right.score);
    const preparedRoutes = rawRoutes
      .map((route) => prepareFullCourseCandidate(route, flags))
      .filter(Boolean);
    return diverseSearch
      ? selectCorridorDiverseFullCourseRoutes(preparedRoutes, flags, maxRoutes)
      : selectDistinctRoutes(preparedRoutes, flags.at(-1), maxRoutes);
  };

  // All Virtual Bots share Flag 0, so avoid repeating the same expensive
  // continuous route search once per player. Clone the candidate objects per
  // robot so multiplayer route selection still treats them independently.
  const sharedVirtualRoutes = options.virtualBots && starts.length
    ? enumeratePreparedRoutesForStart(starts[0])
    : null;

  const clonePreparedRoute = (route) => route
    ? {
      ...route,
      path: route.path ? [...route.path] : route.path,
      trafficPath: route.trafficPath ? [...route.trafficPath] : route.trafficPath,
      legRoutes: (route.legRoutes || []).map((leg) => leg
        ? {
          ...leg,
          path: leg.path ? [...leg.path] : leg.path,
          trafficPath: leg.trafficPath ? [...leg.trafficPath] : leg.trafficPath
        }
        : leg)
    }
    : route;

  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const distinctFullRoutes = sharedVirtualRoutes
      ? sharedVirtualRoutes.map(clonePreparedRoute)
      : enumeratePreparedRoutesForStart(start);
    const fullRoute = distinctFullRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: sourceIndex,
      start,
      reachable: Boolean(fullRoute),
      fullCourseRoutes: distinctFullRoutes,
      fullCourseRoute: fullRoute,
      fullCourseRouteIndex: fullRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    });
  });

  const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, {
    ...options,
    playerCount
  });
  const selectedStartAnalyses = selection.starts.map((analysis) => buildStartAnalysisForSelectedFullRoute(analysis));
  const fullScores = selectedStartAnalyses
    .filter((item) => item.reachable && item.fullCourseRoute)
    .map((item) => item.fullCourseRoute.score + (item.fullCourseTrafficPenalty ?? 0));
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map((analysis) => {
    if (!analysis.fullCourseRoute) {
      return analysis;
    }

    const fullScore = analysis.fullCourseRoute.score + (analysis.fullCourseTrafficPenalty ?? 0);
    const rawDelta = fullScore - meanFullScore;
    return {
      ...analysis,
      courseEstimate: {
        ...analysis.courseEstimate,
        meanFullScore: Number(meanFullScore.toFixed(2)),
        delta: Number(rawDelta.toFixed(2))
      },
      courseScoreAdjustment: Number(clamp(rawDelta * 0.32, -10, 10).toFixed(2))
    };
  });

  selectAndScoreStartAnalyses(tileMap, adjustedStartAnalyses, flags[0], playerCount, null, options);
  applyIntrinsicFullCourseBalanceScores(adjustedStartAnalyses, options);
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(adjustedStartAnalyses, flags, playerCount);
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(meanFullScore.toFixed(2)),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        maxPenalty: selection.maxTrafficPenalty ?? 0,
        averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
        averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
        averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
        averageForecastConfidence: selection.averageForecastConfidence ?? 1,
        minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
        averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
        confidenceWeighted: true,
        candidateDiagnostics: selection.candidateDiagnostics ?? [],
        legAwareOverlap: true,
        perRobotOverlapDamping: true,
        oncomingTraffic: true,
        oncomingTrafficWeight: 0.06,
        openingLegWeight: FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight: FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

// Start-Energy-sensitive full-course evaluation. Traffic is computed once per
// already-discovered route candidate because changing starting Energy does not
// alter board geometry. The v45 economy is replayed for each Pay to Win payment
// or Subsidized Starts grant, and the focus robot may choose a different
// existing coherent candidate at that Energy level. This gives adaptive route
// choice without multiplying the expensive route-search budget.
export function evaluateFullCourseFocusPaymentCurveUnderOccupancy(
  tileMap,
  firstLeg,
  flags,
  focusIndex,
  occupancyByIndex,
  options = {}
) {
  const analyses = (firstLeg?.starts || []).filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length
  ));
  const focus = analyses.find((analysis) => analysis.index === focusIndex);
  if (!focus) return null;

  const baseStartingEnergy = getCourseStartingEnergy(options);
  const maxEnergy = getCourseMaxEnergy(options);
  const subsidizedStarts = Boolean(options.subsidizedStarts);
  const defaultMaxAdjustment = subsidizedStarts
    ? Math.max(0, maxEnergy - baseStartingEnergy)
    : baseStartingEnergy;
  const requestedMaxAdjustment = subsidizedStarts
    ? Number(options.subsidizedStartsMaxSubsidy)
    : Number(options.payToWinMaxPayment);
  const maxPayment = Math.max(
    0,
    Math.min(
      defaultMaxAdjustment,
      Number.isFinite(requestedMaxAdjustment)
        ? Math.floor(requestedMaxAdjustment)
        : defaultMaxAdjustment
    )
  );
  const payments = Array.from({ length: maxPayment + 1 }, (_, payment) => payment);
  const selectedOtherRoutes = analyses
    .filter((analysis) => analysis.index !== focusIndex)
    .map((analysis) => ({
      route: analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0],
      occupancyWeight: getExplicitOccupancyWeight(
        occupancyByIndex,
        analysis.index
      )
    }))
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  const otherFirstLegRoutes = analyses
    .filter((analysis) => analysis.index !== focusIndex)
    .map((analysis) => ({
      route: (
        analysis.fullCourseRoute ??
        analysis.fullCourseRoutes[0]
      )?.legRoutes?.[0],
      occupancyWeight: getExplicitOccupancyWeight(
        occupancyByIndex,
        analysis.index
      )
    }))
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  const candidates = focus.fullCourseRoutes.map((candidate, routeIndex) => {
    const traffic = getExpectedTrafficBreakdown(
      tileMap,
      candidate,
      selectedOtherRoutes,
      flags,
      {
        ...options,
        occupancyByIndex
      }
    );
    const firstLegRoute = candidate?.legRoutes?.[0] ?? null;
    const firstTraffic = firstLegRoute
      ? getExpectedTrafficBreakdown(
        tileMap,
        firstLegRoute,
        otherFirstLegRoutes,
        [flags[0]],
        {
          ...options,
          occupancyByIndex,
          singleLegTraffic: true
        }
      )
      : { ranged: 0, nearby: 0, competition: 0, total: 0 };
    const scores = payments.map((payment) => {
      const adjustedStartingEnergy = subsidizedStarts
        ? Math.min(maxEnergy, baseStartingEnergy + payment)
        : Math.max(0, baseStartingEnergy - payment);
      const rescored = rescoreFixedRouteUpgradeEconomy(
        tileMap,
        candidate,
        {
          ...options,
          startingEnergy: adjustedStartingEnergy,
          routeEconomyReferenceStartingEnergy: baseStartingEnergy
        }
      );
      return Number.isFinite(rescored?.score)
        ? rescored.score
        : Number(candidate?.score);
    });
    return {
      routeIndex,
      route: candidate,
      traffic,
      firstLegRoute,
      firstTraffic,
      scores
    };
  });

  if (!candidates.length) return null;

  const entries = payments.map((payment, paymentIndex) => {
    const baselineIntrinsic = Number(candidates[0]?.scores?.[paymentIndex]);
    let best = null;
    candidates.forEach((candidate) => {
      const intrinsic = Number(candidate.scores[paymentIndex]);
      if (!Number.isFinite(intrinsic)) return;
      const rawGap = Number.isFinite(baselineIntrinsic)
        ? Math.max(0, intrinsic - baselineIntrinsic)
        : 0;
      const selectionValue = intrinsic + candidate.traffic.total + rawGap * 0.04;
      if (
        !best ||
        selectionValue < best.selectionValue - 0.001 ||
        (
          Math.abs(selectionValue - best.selectionValue) <= 0.001 &&
          candidate.routeIndex < best.routeIndex
        )
      ) {
        best = {
          ...candidate,
          intrinsic,
          selectionValue
        };
      }
    });
    if (!best) return null;
    const adjustedStartingEnergy = subsidizedStarts
      ? Math.min(maxEnergy, baseStartingEnergy + payment)
      : Math.max(0, baseStartingEnergy - payment);
    return {
      payment,
      energyAdjustment: payment,
      subsidy: subsidizedStarts ? payment : 0,
      startingEnergyAfterPayment: adjustedStartingEnergy,
      startingEnergyAfterAdjustment: adjustedStartingEnergy,
      fullCourseRouteIndex: best.routeIndex,
      fullCourseIntrinsic: Number(best.intrinsic.toFixed(2)),
      fullCourseTraffic: Number(best.traffic.total.toFixed(2)),
      fullTotal: Number((best.intrinsic + best.traffic.total).toFixed(2)),
      firstLegIntrinsic: Number(best.firstLegRoute?.score ?? Infinity),
      firstLegTraffic: Number(best.firstTraffic.total.toFixed(2)),
      firstLegTotal: Number.isFinite(Number(best.firstLegRoute?.score))
        ? Number((Number(best.firstLegRoute.score) + best.firstTraffic.total).toFixed(2))
        : Infinity
    };
  }).filter(Boolean);

  return {
    index: focusIndex,
    baseStartingEnergy,
    maxEnergy,
    maxPayment,
    subsidizedStarts,
    entries
  };
}


export function recomputeFirstLegPressure(tileMap, firstLeg, options = {}) {
  const playerCount = options.playerCount ?? firstLeg.starts.length;
  const excludedIndices = new Set(options.excludedIndices ?? []);
  let startAnalyses = firstLeg.starts.map((analysis) => ({ ...analysis }));
  let fullCourseTraffic = firstLeg.summary.fullCourseTraffic ?? null;
  let expectedLegAnalyses = firstLeg.expectedLegAnalyses;

  if (
    !options.openingTrafficOnly &&
    firstLeg.summary.fullCourseRoutes &&
    Array.isArray(firstLeg.flags) &&
    firstLeg.flags.length
  ) {
    const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, firstLeg.flags, {
      ...options,
      playerCount,
      excludedIndices
    });
    startAnalyses = selection.starts.map((analysis) => (
      analysis.prePruned
        ? analysis
        : buildStartAnalysisForSelectedFullRoute(analysis)
    ));
    fullCourseTraffic = {
      ...(firstLeg.summary.fullCourseTraffic ?? {}),
      passes: selection.selectionPasses,
      routeSwitches: selection.routeSwitches,
      averagePenalty: selection.averageTrafficPenalty,
      maxPenalty: selection.maxTrafficPenalty ?? 0,
      averageOpeningPenalty: selection.averageOpeningTrafficPenalty ?? 0,
      averageLaterPenalty: selection.averageLaterTrafficPenalty ?? 0,
      averageRawPenalty: selection.averageRawTrafficPenalty ?? 0,
      averageForecastConfidence: selection.averageForecastConfidence ?? 1,
      minimumForecastConfidence: selection.minimumForecastConfidence ?? 1,
      averageTrafficByLeg: selection.averageTrafficByLeg ?? [],
      confidenceWeighted: true,
      candidateDiagnostics: selection.candidateDiagnostics ?? []
    };
    expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
      startAnalyses.filter((analysis) => !excludedIndices.has(analysis.index)),
      firstLeg.flags,
      playerCount
    ).slice(1);
  }

  const activeIndices = new Set(
    startAnalyses
      .filter((analysis) => analysis.reachable && analysis.routes?.length && !excludedIndices.has(analysis.index))
      .map((analysis) => analysis.index)
  );

  selectAndScoreStartAnalyses(tileMap, startAnalyses, firstLeg.goal, playerCount, activeIndices, options);
  applyIntrinsicFullCourseBalanceScores(startAnalyses, options);
  const recomputed = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    firstLeg.goal,
    firstLeg.flags ?? new Array(firstLeg.summary.flagCount).fill(null),
    playerCount,
    options,
    excludedIndices
  );

  return {
    ...firstLeg,
    starts: startAnalyses,
    expectedLegAnalyses,
    summary: {
      ...firstLeg.summary,
      ...recomputed.summary,
      fullCourseTraffic,
      outliers: firstLeg.summary.outliers
    }
  };
}

export function analyzeFlagLeg(tileMap, from, goal, options = {}) {
  const facings = options.facings ?? ROTATION_ORDER;
  const routesPerFacing = options.routesPerFacing ?? 3;
  const maxDistinctRoutes = options.maxDistinctRoutes ?? 4;
  const previousLegRoutes = options.previousLegRoutes ?? [];
  const trafficScale = computeLegTrafficScale(options.playerCount ?? 4);
  const allRoutes = [];
  let cappedZeroRouteStarts = 0;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);

  const routeStarts = Array.isArray(options.startStates) && options.startStates.length
    ? options.startStates.map((state) => ({
      x: state.x,
      y: state.y,
      facing: state.facing ?? "E"
    }))
    : facings.map((facing) => ({
      x: from.x,
      y: from.y,
      facing
    }));

  routeStarts.forEach((routeStart) => {
    const sharedOptions = {
      maxRoutes: routesPerFacing,
      maxActions: options.maxActions,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      playerCount: options.playerCount,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      portalMap
    };
    const routes = options.physicalTimingOnly
      ? enumeratePhysicalTimingLegTemplates(
        tileMap,
        {
          state: routeStart,
          absoluteActions: Number(options.absoluteActions) || 0,
          history: [],
          energyReserve: getInitialRouteEnergyShadowReserve(sharedOptions),
          hazardExposure: 0
        },
        goal,
        {
          ...sharedOptions,
          contextualTelemetryKind: options.physicalTelemetryKind ?? "physical-preflight-leg",
          optionalTemplateExpansions: options.optionalTemplateExpansions ?? 80
        }
      )
      : enumerateRoutes(tileMap, routeStart, goal, sharedOptions);

    const searchMeta = routes.searchMeta ?? routes.contextualSearchMeta ?? null;
    if (searchMeta?.zeroRouteCapFailure) {
      cappedZeroRouteStarts += 1;
    }

    routes.forEach((route) => {
      allRoutes.push({
        ...route,
        startFacing: routeStart.facing,
        routeStart
      });
    });
  });

  const uniqueRoutes = dedupeRoutes(allRoutes).sort((a, b) => a.score - b.score);
  const distinctRoutes = selectDistinctRoutes(uniqueRoutes, goal, maxDistinctRoutes);
  const bestRoute = distinctRoutes[0] ?? null;
  const routeScores = distinctRoutes.map((route) => route.score);
  const routeDistances = distinctRoutes.map((route) => route.distance);
  const routeActions = distinctRoutes.map((route) => route.actions);
  const intraLegOverlap = averagePairwiseOverlap(distinctRoutes, goal);
  const crossLegOverlap = averageCrossLegOverlap(distinctRoutes, previousLegRoutes, goal);
  const intraLegThreat = averagePairwiseThreat(tileMap, distinctRoutes, options);
  const crossLegThreat = averageCrossLegThreat(tileMap, distinctRoutes, previousLegRoutes, options);
  const routeSpread = routeScores.length > 1 ? Math.max(...routeScores) - Math.min(...routeScores) : 0;
  const diversityScore = Number(
    Math.max(
      0,
      distinctRoutes.length * 18 -
      intraLegOverlap * (18 + 17 * trafficScale) -
      crossLegOverlap * (10 + 10 * trafficScale) -
      intraLegThreat * (0.35 + 0.45 * trafficScale) -
      crossLegThreat * (0.3 + 0.4 * trafficScale)
    ).toFixed(2)
  );
  const congestionScore = Number(
    (
      intraLegOverlap * (14 + 26 * trafficScale) +
      crossLegOverlap * (10 + 20 * trafficScale) +
      intraLegThreat * (0.8 + 1.4 * trafficScale) +
      crossLegThreat * (0.6 + 1.2 * trafficScale) +
      Math.max(0, 3 - distinctRoutes.length) * 10
    ).toFixed(2)
  );

  return {
    from,
    goal,
    routes: uniqueRoutes,
    distinctRoutes,
    summary: {
      routeCount: uniqueRoutes.length,
      distinctRouteCount: distinctRoutes.length,
      bestRouteScore: bestRoute?.score ?? Infinity,
      bestDistance: bestRoute?.distance ?? Infinity,
      averageRouteScore: Number(average(routeScores).toFixed(2)),
      averageRouteDistance: Number(average(routeDistances).toFixed(2)),
      averageRouteActions: Number(average(routeActions).toFixed(2)),
      routeSpread: Number(routeSpread.toFixed(2)),
      intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
      crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
      intraLegThreat: Number(intraLegThreat.toFixed(2)),
      crossLegThreat: Number(crossLegThreat.toFixed(2)),
      diversityScore,
      congestionScore,
      routeSearchHealth: {
        searchedStarts: routeStarts.length,
        cappedZeroRouteStarts
      }
    }
  };
}
