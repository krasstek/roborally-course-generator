// Robo Rally Course Randomizer - energy and upgrade economy: starting resources, route energy value and the flattened energy shadow
import { tileKey } from "./board-geometry.js";
import { REGISTER_COUNT } from "./constants.js";
import { clamp } from "../shared/math.js";
import {
  ENERGY_GAIN_VALUE,
  ENERGY_VALUE_STARTING_POINTS,
  ENERGY_VALUE_TABLE_MAXIMA,
  ENERGY_VALUE_TABLE_MAX_ENERGY,
  ENERGY_VALUE_TABLE_MAX_TURNS,
  FREE_UPGRADE_INSTALL_VALUE,
  UPGRADE_CARD_GAIN_VALUE
} from "./energy-value-table.js";
import { isRouteAwareBatteryScoringActive } from "./rule-options.js";

// Pit stop (Transformers): the player picks twice (same allowed).
export const PIT_STOP_PICKS = 2;

// Energon squares a transition touches (Transformers: +1 Energy on contact,
// moving through counts), each square once. The square the robot starts the
// register on never counts: it took that cube when it arrived, and a robot can
// claim each cube only once (user 2026-11-03), so standing on it earns nothing.
// The course ledger also keeps a per-route set for cubes left and re-entered.
export function getEnergonContactSquares(tileMap, transition, destination = transition?.to) {
  const squares = [];
  const from = transition?.from;
  const seen = new Set(from && Number.isFinite(from.x) && Number.isFinite(from.y) ? [tileKey(from.x, from.y)] : []);
  for (const point of [...(transition?.traversed || []), destination]) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const key = tileKey(point.x, point.y);
    if (seen.has(key)) continue;
    seen.add(key);
    if ((tileMap.get(key)?.features || []).some((feature) => feature.type === "energon")) {
      squares.push(key);
    }
  }
  return squares;
}

// Course economy settings: starting resources, the Energy storage cap and the
// registers in a turn. What Energy and upgrade cards are worth comes from the
// simulated upgrade economy (energy-value-table.js), not from settings here.
export const ROUTE_ENERGY_ECONOMY_DEFAULTS = Object.freeze({
  startingEnergy: 3,
  maxEnergy: 10,
  startingUpgradeCards: 3,
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
    registersPerTurn: Math.max(1, getUpgradeEconomyRate(
      options,
      "routeRegistersPerTurn",
      ROUTE_ENERGY_ECONOMY_DEFAULTS.registersPerTurn
    ))
  };
}

export function getRouteEconomyNextBoundaryAction(absoluteActionCount, config) {
  const count = Math.max(0, Math.floor(Number(absoluteActionCount) || 0));
  const phase = count % config.registersPerTurn;
  return phase === 0 ? count : count + (config.registersPerTurn - phase);
}

// Route energy values come from the simulated upgrade economy in
// energy-value-table.js (built by scripts/build-energy-value-table.mjs): what one
// more Energy, one more blind upgrade card, or a free random install is worth,
// by the race turn whose Upgrade Phase can first use it, the race length, and the
// Energy the robot has received so far (starting Energy plus route gains, no
// storage cap: the table already accounts for spending it on upgrades); Energy
// values also by starting Energy. Deck averages in register-equivalents (RE);
// the app never sees a card.
function getEnergyValueTableRaceTurns(options) {
  const turns = Number(options?.routeEnergyHorizonTurns);
  if (!(turns > 0)) return 0;
  return clamp(Math.round(turns), 1, ENERGY_VALUE_TABLE_MAX_TURNS);
}

function getEnergyValueTableUpgradeTurn(absoluteActionCount, config) {
  return Math.floor(getRouteEconomyNextBoundaryAction(absoluteActionCount, config) / config.registersPerTurn) + 1;
}

function getEnergyValueTableEnergyIndex(energy) {
  return clamp(Math.floor(Number(energy) || 0), 0, ENERGY_VALUE_TABLE_MAX_ENERGY);
}

// Energy values were built at a few starting Energies; interpolate between them.
function getEnergyGainTableValue(raceTurns, startingEnergy, turn, received) {
  const points = ENERGY_VALUE_STARTING_POINTS;
  const rows = ENERGY_GAIN_VALUE[raceTurns];
  const index = getEnergyValueTableEnergyIndex(received);
  const start = clamp(Number(startingEnergy) || 0, points[0], points[points.length - 1]);
  let upper = 1;
  while (upper < points.length - 1 && start > points[upper]) upper += 1;
  const lower = upper - 1;
  const t = (start - points[lower]) / (points[upper] - points[lower]);
  return (1 - t) * rows[lower][turn][index] + t * rows[upper][turn][index];
}

export function getFlattenedRouteEnergyMarginalValueR(
  energy,
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const raceTurns = getEnergyValueTableRaceTurns(options);
  if (!raceTurns) return 0;
  const turn = getEnergyValueTableUpgradeTurn(absoluteActionCount, config);
  if (turn > raceTurns) return 0;
  return getEnergyGainTableValue(raceTurns, config.startingEnergy, turn, energy);
}

export function getFlattenedUnknownUpgradeCardValueR(
  energy,
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const raceTurns = getEnergyValueTableRaceTurns(options);
  if (!raceTurns) return 0;
  const turn = getEnergyValueTableUpgradeTurn(absoluteActionCount, config);
  if (turn > raceTurns) return 0;
  return UPGRADE_CARD_GAIN_VALUE[raceTurns][turn][getEnergyValueTableEnergyIndex(energy)];
}

export function getFlattenedFreeRandomUpgradeInstallValueR(
  absoluteActionCount,
  options = {}
) {
  const config = getRouteEnergyEconomyConfig(options);
  const raceTurns = getEnergyValueTableRaceTurns(options);
  if (!raceTurns) return 0;
  // Radioactive Waste installs at once, during the current turn.
  const turn = Math.floor(Math.max(0, Number(absoluteActionCount) || 0) / config.registersPerTurn) + 1;
  if (turn > raceTurns) return 0;
  return FREE_UPGRADE_INSTALL_VALUE[raceTurns][turn];
}

// The route's energy shadow counts Energy received so far, starting with the
// starting Energy; spending it on upgrades is part of the value table.
export function getFlattenedOpeningEconomyState(options = {}) {
  const config = getRouteEnergyEconomyConfig(options);
  return {
    energy: clamp(config.startingEnergy, 0, config.maxEnergy),
    usefulCardUnits: 0,
    normalDraws: 0,
    installs: 0,
    energySpent: 0
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
  // Energy received so far: no storage cap (the table spends it on upgrades).
  const reserveBefore = clamp(Math.floor(Number(energy) || 0), 0, ENERGY_VALUE_TABLE_MAX_ENERGY);
  const reserveAfter = clamp(
    reserveBefore + Math.max(0, Math.floor(Number(gain) || 0)),
    0,
    ENERGY_VALUE_TABLE_MAX_ENERGY
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
// Battery Overcharge (variant batch 2): a battery gives 2 Energy (and 1
// damage, damage-economy.js) whenever it gives Energy.
export function getBatteryEnergyGain(options = {}) {
  return options.batteryOvercharge ? 2 : 1;
}

export function getRouteEnergyDominanceBoundConfig(options = {}) {
  if (!isRouteAwareBatteryScoringActive(options)) {
    return { active: false, energyCubeScore: 0, unknownCardScore: 0, upgradeWorld: false };
  }
  const registerScore = Number(options.routeEnergyRegisterScore);
  if (!Number.isFinite(registerScore)) {
    return { active: true, unbounded: true, energyCubeScore: Infinity, unknownCardScore: Infinity, upgradeWorld: Boolean(options.upgradeWorld), batteryEnergy: getBatteryEnergyGain(options) };
  }
  const nonnegativeRegisterScore = Math.max(0, registerScore);
  // The largest values in the energy value table bound every single gain.
  const energyCubeScore = ENERGY_VALUE_TABLE_MAXIMA.energy * nonnegativeRegisterScore;
  const unknownCardScore = ENERGY_VALUE_TABLE_MAXIMA.card * nonnegativeRegisterScore;
  const freeInstallScore = ENERGY_VALUE_TABLE_MAXIMA.install * nonnegativeRegisterScore;
  return {
    active: true,
    unbounded: false,
    batteryEnergy: getBatteryEnergyGain(options),
    energyCubeScore,
    unknownCardScore,
    freeInstallScore,
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
  boundConfig,
  transition = null
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
    rewardUpperBound += cubeScore * (boundConfig.batteryEnergy ?? 1) + upgradeCardScore;
  }
  if (onChopShop) {
    const energyOption = cubeScore + upgradeCardScore;
    const cardOption = (1 + (boundConfig.upgradeWorld ? 1 : 0)) * cardScore;
    rewardUpperBound += Math.max(energyOption, cardOption);
  }
  if (onRadioactiveWaste) {
    // The real step chooses the better of +1 Energy and a free random install.
    rewardUpperBound += Math.max(cubeScore, boundConfig.freeInstallScore ?? cardScore);
  }
  if (features.some((feature) => feature.type === "pitStop")) {
    // At most two Energy (each pick may instead discard damage).
    rewardUpperBound += PIT_STOP_PICKS * cubeScore;
  }
  // Energon anywhere on the register's path, one cube per square.
  rewardUpperBound += getEnergonContactSquares(tileMap, transition, destination).length * cubeScore;

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
    ENERGY_VALUE_TABLE_MAX_ENERGY
  );
  // A register-5 card cancelled by a fire pit (Transformers) does nothing.
  const powerUp = actionId === "WAIT" && !transition?.cancelledByFirePit;

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
  const onPitStop = features.some((feature) => feature.type === "pitStop");
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
  let pitStopRewardR = 0;
  let pitStopEnergyGain = 0;
  let energonRewardR = 0;
  let energonEnergyGain = 0;
  let powerUpEnergyGain = 0;
  let extraCardDraws = 0;
  let chopShopChoice = null;

  if (onBattery) {
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      getBatteryEnergyGain(options),
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

  // Pit stop (Transformers), just after batteries: two picks, each a
  // discarded damage card or +1 Energy. The search has no damage state and
  // credits both as Energy; the course ledger passes how many went to Energy
  // after its damage replay (transition.pitStopEnergyPicks).
  if (onPitStop) {
    const energyPicks = Number.isInteger(transition?.pitStopEnergyPicks)
      ? Math.max(0, Math.min(PIT_STOP_PICKS, transition.pitStopEnergyPicks))
      : PIT_STOP_PICKS;
    if (energyPicks > 0) {
      const energyPackage = applyFlattenedRouteEnergyGain(
        energy,
        energyPicks,
        nextAbsoluteActionCount,
        options
      );
      pitStopRewardR += energyPackage.rewardR;
      pitStopEnergyGain += energyPackage.realizedEnergyGain;
      energy = energyPackage.energy;
    }
  }

  // Energon (Transformers): +1 Energy per cube touched. The search credits each
  // contact; the course ledger passes energonClaims, the chance of reaching
  // each not-yet-taken cube first (first come, first served).
  const energonClaims = Array.isArray(transition?.energonClaims)
    ? transition.energonClaims
    : getEnergonContactSquares(tileMap, transition, destination).map(() => 1);
  for (const claimProbability of energonClaims) {
    const probability = clamp(Number(claimProbability) || 0, 0, 1);
    if (probability <= 0) continue;
    const energyPackage = applyFlattenedRouteEnergyGain(
      energy,
      1,
      nextAbsoluteActionCount,
      options
    );
    energonRewardR += energyPackage.rewardR * probability;
    if (probability >= 0.5) {
      energonEnergyGain += energyPackage.realizedEnergyGain;
      energy = energyPackage.energy;
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
  const pitStopRewardScore = pitStopRewardR * registerScore;
  const energonRewardScore = energonRewardR * registerScore;
  const rewardScore = (
    energonRewardScore +
    pitStopRewardScore +
    batteryRewardScore +
    powerUpRewardScore +
    chopShopRewardScore +
    radioactiveWasteRewardScore
  );
  const rewardRegisterEquivalents = (
    energonRewardR +
    pitStopRewardR +
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
    pitStopEnergyGain,
    pitStop: onPitStop,
    energonEnergyGain,
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
