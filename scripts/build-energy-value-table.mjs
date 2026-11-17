#!/usr/bin/env node
// Builds src/analysis/energy-value-table.js: what Energy and upgrade cards are
// worth, in register-equivalents (RE), by race length, turn and Energy received
// so far (starting Energy plus everything collected on the route).
//
// The app never sees a card: it only counts Energy received along a route and
// looks values up here. The values are deck averages, made by simulating a
// player's upgrade game with the real upgrade deck (the 40 cards of the 2023
// rules) many times over, with Energy arriving during the race as on real routes
// (Power Ups and battery stops of the golden-course routes,
// scripts/data/route-energy-income.json). At every turn each game is forked: the
// rest of the game is played unchanged, with +1 Energy, with +1 blind card and
// with a free random install, on the same deck order. The differences, averaged
// over all games that had received the same Energy by that turn, are the table.
// (Card value study 2026-11-17: calibration-output/studies/2026-11-17-card-values/.)
//
// Rules of the simulated player (settled with the user 2026-11-16/17):
// - acquisition as in the 2023 rules: a 3-card starting hand; each turn at most
//   one 1-Energy blind draw (only when nothing useful in hand is affordable and
//   Energy is left over) and at most one install; spend as you go;
// - a card is worth its cost at one fitted rate: a permanent returns
//   permanentREPerCostPerTurn per cost point every turn it is installed, a
//   temporary temporaryREPerCost per cost point once, times a best-moment factor;
//   both times the unseen-benefit factor (what the route model cannot see);
// - a card pays off on a given course with probability `payoff` (course-specific
//   cards: `payoffCourseSpecific`); Re-initialize is weak (x0.25);
// - movement cards (tag m) open moves the route model cannot make without them:
//   x movementOptionFactor (MANUAL CALIBRATION VALUE, user 2026-11-17);
// - 3 permanent and 3 temporary slots; a used temporary is discarded and frees
//   its slot after temporaryHoldTurns; an installed permanent is replaced only by
//   a clearly better card (replaceMargin); the main-laser group is swap-only;
// - Energy-using cards (Deflector Shield, Mini Howitzer) are a small Energy sink;
//   Recharge gives 3 Energy;
// - disruption cards (push/pull/scramble) scale with the course weight; the table
//   uses the average course (weight 1);
// - at most 10 Energy held (Energy received has no cap).
// Values are smoothed so the same gain is never worth more later in the race.
//
// Run: node scripts/build-energy-value-table.mjs          (deterministic)
//      node scripts/build-energy-value-table.mjs --check  (also: table vs direct play on every golden route)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- Upgrade economy settings (change here, then rerun) ---------------------
const SETTINGS = {
  // RE per turn per cost point of an installed permanent (measured anchors).
  permanentREPerCostPerTurn: 0.12,
  // RE per cost point of a temporary used at an average moment.
  temporaryREPerCost: 0.75,
  // Temporaries are kept for the right moment (educated estimate).
  bestMomentFactor: 2,
  // Benefits the route model cannot see (judgment; revisit at calibration).
  unseenBenefitFactor: 1.5,
  // Chance a card pays off on the course (course-specific cards lower).
  payoff: 0.85,
  payoffCourseSpecific: 0.5,
  // Weak cards (Re-initialize).
  poorCardFactor: 0.25,
  // MANUAL CALIBRATION VALUE (user 2026-11-17, a starting guess): movement cards.
  movementOptionFactor: 1.5,
  // A full permanent slot is replaced only by a card this much better.
  replaceMargin: 1.5,
  // RE of one Energy spent through an Energy-using card.
  energySinkRE: 0.4,
  // Energy from Recharge.
  rechargeEnergy: 3,
  // Course disruption weight (1 = average course).
  disruptionWeight: 1,
  permanentSlots: 3,
  temporarySlots: 3,
  // Turns a used temporary holds its slot (bought, then kept for the moment).
  temporaryHoldTurns: 2,
  startingHand: 3,
  drawCost: 1,
  maxEnergy: 10,
  // Starting Energy of simulated games: the usual 3 half the time, otherwise
  // 0..7 (priced starts), so cells see robots that started richer or poorer.
  usualStartingEnergy: 3,
  usualStartingShare: 0.5,
  maxSimulatedStartingEnergy: 7,
  gamesPerRaceLength: 12000,
  minCellGames: 150,
  seed: 20261117
};
const MAX_RECEIVED = 24;
const MAX_TURNS = 14;

// tags: d = disruption (scales with the course weight), x = main-laser group
// (swap-only), c = course-specific payoff, m = movement (opens moves),
// sink = spends Energy for value, poor = weak card, energy = gives Energy.
const P = (name, cost, tags = "") => ({ name, cost, temporary: false, tags: tags.split(" ").filter(Boolean) });
const T = (name, cost, tags = "") => ({ name, cost, temporary: true, tags: tags.split(" ").filter(Boolean) });
const DECK = [
  P("Rear Laser", 2), P("Double Laser", 2, "x"), P("Modular Chassis", 1, "d"), P("Spam Filter", 3),
  P("Self Diagnostics", 2), P("Memory Cards", 3), P("Chaos Theory", 2), P("Ramming Gear", 2, "d"),
  P("Laser Kata", 1), P("Scrambler", 4, "d x"), P("Drifting", 4, "m"), P("Firewall", 1, "c"),
  P("Energy Conversion", 3), P("Crab Legs", 5, "m"), P("Rail Gun", 2, "x"), P("Deflector Shield", 2, "sink"),
  P("Mini Howitzer", 3, "d sink"), P("Brakes", 2, "m"), P("Power Slide", 4, "m"), P("Hover Unit", 1, "c m"),
  P("Spiky", 2, "d"), P("Flash Drive", 4), P("Pressure Beam", 3, "d x"), P("Tractor Beam", 3, "d x"),
  T("Abort Switch", 1), T("Overclocked", 2, "m"), T("Rewire", 1), T("Magnetic", 1, "m"), T("Lucky Booster", 1),
  T("Piercing Drill", 1, "d"), T("Zoop", 1, "m"), T("Re-initialize", 1, "poor"), T("Recharge", 0, "energy"),
  T("Calibration Protocol", 2), T("Memory Swap", 2), T("Switch", 2, "d"), T("Boink", 1, "m"),
  T("All Aboard", 1, "m"), T("Displacing Blast", 2, "d c"), T("Pressure Release", 2)
];
if (DECK.length !== 40) throw new Error(`upgrade deck has ${DECK.length} cards, expected 40`);

const INCOME_ROUTES = JSON.parse(readFileSync(join(HERE, "data", "route-energy-income.json"), "utf8")).routes;

// ---- Deterministic random numbers ------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const has = (card, tag) => card.tags.includes(tag);

// One game's random setup (which cards pay off, deck order).
function dealCards(rng, w = SETTINGS.disruptionWeight) {
  const cards = DECK.map((card) => {
    const pays = rng() < (has(card, "c") ? SETTINGS.payoffCourseSpecific : SETTINGS.payoff);
    const weight = (has(card, "d") ? w : 1) *
      (has(card, "m") ? SETTINGS.movementOptionFactor : 1) *
      (has(card, "poor") ? SETTINGS.poorCardFactor : 1);
    const scale = pays ? SETTINGS.unseenBenefitFactor * weight : 0;
    return {
      ...card,
      perTurn: card.temporary ? 0 : SETTINGS.permanentREPerCostPerTurn * card.cost * scale,
      once: card.temporary && !has(card, "energy") ? SETTINGS.temporaryREPerCost * card.cost * scale : 0,
      sinkRE: has(card, "sink") && pays ? SETTINGS.energySinkRE * scale : 0
    };
  });
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

// Energy collected on the route: income[t] arrives before turn t's upgrade
// phase (a gain during turn g is first usable at turn g + 1).
// Routes of the same race length are used as they are where there are enough of
// them (gains that come together stay together); other lengths are stretched.
const INCOME_ROUTES_BY_TURNS = new Map();
for (const route of INCOME_ROUTES) {
  if (!INCOME_ROUTES_BY_TURNS.has(route[0])) INCOME_ROUTES_BY_TURNS.set(route[0], []);
  INCOME_ROUTES_BY_TURNS.get(route[0]).push(route);
}
const MIN_SAME_LENGTH_ROUTES = 15;
function stretchedIncome(rng, turns) {
  const sameLength = INCOME_ROUTES_BY_TURNS.get(turns) ?? [];
  if (sameLength.length >= MIN_SAME_LENGTH_ROUTES) {
    return exactIncome(sameLength[Math.floor(rng() * sameLength.length)][1], turns);
  }
  const [routeTurns, gainTurns] = INCOME_ROUTES[Math.floor(rng() * INCOME_ROUTES.length)];
  const income = new Array(turns + 2).fill(0);
  for (const gainTurn of gainTurns) {
    const position = (gainTurn - 1 + rng()) / routeTurns;
    const turn = Math.floor(position * turns) + 2;
    if (turn <= turns) income[turn] += 1;
  }
  return income;
}
function exactIncome(gainTurns, turns) {
  const income = new Array(turns + 2).fill(0);
  for (const gainTurn of gainTurns) if (gainTurn + 1 <= turns) income[gainTurn + 1] += 1;
  return income;
}

function sampleStartingEnergy(rng, bucket = null) {
  if (bucket) {
    const [low, high] = bucket;
    if (low <= SETTINGS.usualStartingEnergy && SETTINGS.usualStartingEnergy <= high && rng() < SETTINGS.usualStartingShare) {
      return SETTINGS.usualStartingEnergy;
    }
    return low + Math.floor(rng() * (high - low + 1));
  }
  if (rng() < SETTINGS.usualStartingShare) return SETTINGS.usualStartingEnergy;
  return Math.floor(rng() * (SETTINGS.maxSimulatedStartingEnergy + 1));
}
// Energy values depend a little on the path: at the same Energy received, a robot
// that started poor got it later and still holds more of it. The Energy table is
// therefore built at these starting Energies and interpolated linearly between
// them (the app knows each route's starting Energy).
const STARTING_ENERGY_POINTS = [0, 1, 2, 3, 4, 6];
function startingEnergyWeights(energy) {
  const points = STARTING_ENERGY_POINTS;
  const e = Math.max(points[0], Math.min(points[points.length - 1], energy));
  for (let index = 0; index < points.length - 1; index += 1) {
    if (e <= points[index + 1]) {
      const t = (e - points[index]) / (points[index + 1] - points[index]);
      return [[index, 1 - t], [index + 1, t]];
    }
  }
  return [[points.length - 1, 1]];
}

// ---- One player's upgrade game ----------------------------------------------
function newState(cards, startingEnergy) {
  const deck = cards.slice();
  return {
    deck,
    hand: deck.splice(deck.length - SETTINGS.startingHand, SETTINGS.startingHand),
    installed: [],
    temporaryFreeAt: [],
    energy: Math.min(SETTINGS.maxEnergy, startingEnergy),
    value: 0
  };
}
function cloneState(state) {
  return {
    deck: state.deck.slice(),
    hand: state.hand.slice(),
    installed: state.installed.slice(),
    temporaryFreeAt: state.temporaryFreeAt.slice(),
    energy: state.energy,
    value: state.value
  };
}

function turnContext(state, turn, turns) {
  const turnsLeft = turns - turn + 1;
  const moment = 1 + (SETTINGS.bestMomentFactor - 1) * Math.min(1, Math.max(0, turnsLeft - 1) / 3);
  const worstInstalled = () => state.installed.reduce((a, b) => (a.perTurn <= b.perTurn ? a : b));
  const gainOf = (card) => {
    if (card.temporary) {
      if (state.temporaryFreeAt.length >= SETTINGS.temporarySlots) return 0;
      if (has(card, "energy")) return 0.01; // Recharge: its worth is the Energy it gives
      return card.once * moment;
    }
    if (card.perTurn <= 0) return 0;
    const rival = has(card, "x") ? state.installed.find((held) => has(held, "x")) : null;
    if (rival) return Math.max(0, card.perTurn - rival.perTurn) * turnsLeft;
    if (state.installed.length < SETTINGS.permanentSlots) return card.perTurn * turnsLeft;
    const worst = worstInstalled();
    return card.perTurn > SETTINGS.replaceMargin * worst.perTurn
      ? (card.perTurn - worst.perTurn) * turnsLeft
      : 0;
  };
  const install = (card, gain) => {
    state.value += gain;
    if (card.temporary) {
      state.temporaryFreeAt.push(turn + SETTINGS.temporaryHoldTurns);
      if (has(card, "energy")) state.energy = Math.min(SETTINGS.maxEnergy, state.energy + SETTINGS.rechargeEnergy);
      return;
    }
    const rival = has(card, "x") ? state.installed.find((held) => has(held, "x")) : null;
    if (rival) state.installed.splice(state.installed.indexOf(rival), 1);
    else if (state.installed.length >= SETTINGS.permanentSlots) state.installed.splice(state.installed.indexOf(worstInstalled()), 1);
    state.installed.push(card);
  };
  return { gainOf, install };
}

function freeInstall(state, turn, turns) {
  if (!state.deck.length) return;
  const { gainOf, install } = turnContext(state, turn, turns);
  const card = state.deck.pop();
  const gain = gainOf(card);
  if (gain > 0) install(card, gain);
}

// One turn's upgrade phase (2023 acquisition: at most one blind draw, at most one install).
function playTurn(state, turn, turns) {
  state.temporaryFreeAt = state.temporaryFreeAt.filter((freeAt) => freeAt > turn);
  const { gainOf, install } = turnContext(state, turn, turns);
  let affordable = state.hand.filter((card) => card.cost <= state.energy && gainOf(card) > 0);
  if (!affordable.length && state.energy >= SETTINGS.drawCost + 1 && state.deck.length) {
    state.energy -= SETTINGS.drawCost;
    state.hand.push(state.deck.pop());
    affordable = state.hand.filter((card) => card.cost <= state.energy && gainOf(card) > 0);
  }
  if (affordable.length) {
    let best = affordable[0];
    let bestGain = gainOf(best);
    for (const card of affordable.slice(1)) {
      const gain = gainOf(card);
      if (gain > bestGain || (gain === bestGain && card.cost < best.cost)) {
        best = card;
        bestGain = gain;
      }
    }
    state.energy -= best.cost;
    state.hand.splice(state.hand.indexOf(best), 1);
    install(best, bestGain);
  } else {
    // Energy sinks only when nothing was bought this turn (spend as you go).
    for (const card of state.installed) {
      if (card.sinkRE > 0 && state.energy >= 1) {
        state.energy -= 1;
        state.value += card.sinkRE;
      }
    }
  }
}

// Play from `fromTurn` (its income already arrived) to the end of the race.
function playRest(state, fromTurn, turns, income) {
  for (let turn = fromTurn; turn <= turns; turn += 1) {
    if (turn > fromTurn) state.energy = Math.min(SETTINGS.maxEnergy, state.energy + income[turn]);
    playTurn(state, turn, turns);
  }
  return state.value;
}

// ---- Forked simulation: marginal values by [turn][Energy received] ------------
function simulateRace(turns, games, rng, w = SETTINGS.disruptionWeight, bucket = null) {
  const size = (turns + 1) * (MAX_RECEIVED + 1);
  const cells = {
    n: new Float64Array(size),
    forkEnergy: new Float64Array(size),
    card: new Float64Array(size),
    energyN: new Float64Array(size),
    energy: new Float64Array(size)
  };
  const install = { n: new Float64Array(turns + 1), value: new Float64Array(turns + 1) };
  for (let game = 0; game < games; game += 1) {
    const cards = dealCards(rng, w);
    const income = stretchedIncome(rng, turns);
    const startingEnergy = sampleStartingEnergy(rng, bucket);
    // Energy value along the real path: the route's Energy arriving at turn t,
    // given everything received before it (and nothing after), so that a route's
    // gains add up to its whole upgrade value. Two Energy that only together buy
    // a card are counted as such; a lone extra Energy (the fork) would miss it.
    let previous = playRest(newState(cards, startingEnergy), 1, turns, new Array(turns + 2).fill(0));
    let receivedBefore = Math.min(SETTINGS.maxEnergy, startingEnergy);
    for (let turn = 2; turn <= turns; turn += 1) {
      if (!income[turn]) continue;
      const truncated = income.map((gain, index) => (index <= turn ? gain : 0));
      const value = playRest(newState(cards, startingEnergy), 1, turns, truncated);
      const perUnit = (value - previous) / income[turn];
      for (let unit = 0; unit < income[turn]; unit += 1) {
        const cell = turn * (MAX_RECEIVED + 1) + Math.min(receivedBefore + unit, MAX_RECEIVED);
        cells.energyN[cell] += 1;
        cells.energy[cell] += perUnit;
      }
      receivedBefore += income[turn];
      previous = value;
    }
    const state = newState(cards, startingEnergy);
    let received = state.energy;
    for (let turn = 1; turn <= turns; turn += 1) {
      if (turn > 1) {
        state.energy = Math.min(SETTINGS.maxEnergy, state.energy + income[turn]);
        received += income[turn];
      }
      const cell = turn * (MAX_RECEIVED + 1) + Math.min(received, MAX_RECEIVED);
      const before = state.value;
      const base = playRest(cloneState(state), turn, turns, income) - before;
      const plusEnergy = cloneState(state);
      plusEnergy.energy = Math.min(SETTINGS.maxEnergy, plusEnergy.energy + 1);
      const withEnergy = playRest(plusEnergy, turn, turns, income) - before;
      let withCard = base;
      let withInstall = base;
      if (state.deck.length) {
        const plusCard = cloneState(state);
        plusCard.hand.push(plusCard.deck.pop());
        withCard = playRest(plusCard, turn, turns, income) - before;
        const installed = cloneState(state);
        freeInstall(installed, turn, turns);
        withInstall = playRest(installed, turn, turns, income) - before;
      }
      cells.n[cell] += 1;
      cells.forkEnergy[cell] += withEnergy - base;
      cells.card[cell] += withCard - base;
      install.n[turn] += 1;
      install.value[turn] += withInstall - base;
      playTurn(state, turn, turns);
    }
  }
  return { cells, install };
}

// Cell means; thin cells take the nearest received count with enough games.
function cellTable(cells, field, turns, countField = "n", fallbackField = null) {
  const table = [null];
  for (let turn = 1; turn <= turns; turn += 1) {
    const row = [];
    let rowGames = 0;
    for (let received = 0; received <= MAX_RECEIVED; received += 1) rowGames += cells[countField][turn * (MAX_RECEIVED + 1) + received];
    if (fallbackField && rowGames < SETTINGS.minCellGames) {
      // No route Energy arrives before this turn's upgrade phase (turn 1): the lone-unit value.
      table.push(cellTable(cells, fallbackField, turns)[turn]);
      continue;
    }
    for (let received = 0; received <= MAX_RECEIVED; received += 1) {
      let value = null;
      for (let distance = 0; distance <= MAX_RECEIVED && value === null; distance += 1) {
        for (const candidate of [received - distance, received + distance]) {
          if (candidate < 0 || candidate > MAX_RECEIVED) continue;
          const cell = turn * (MAX_RECEIVED + 1) + candidate;
          if (cells[countField][cell] >= SETTINGS.minCellGames) {
            value = cells[field][cell] / cells[countField][cell];
            break;
          }
        }
      }
      row.push(value ?? 0);
    }
    table.push(row);
  }
  // Smooth over turns only: the same gain is never worth more later in the race.
  // Not for path values (Energy as it arrives): for a poor robot a lone Energy can
  // be worth more later, once earlier Energy has made a purchase possible.
  if (countField === "energyN") return table;
  for (let turn = 2; turn <= turns; turn += 1) {
    for (let received = 0; received <= MAX_RECEIVED; received += 1) {
      table[turn][received] = Math.min(table[turn][received], table[turn - 1][received]);
    }
  }
  return table;
}

// Upgrade value of a race with this starting Energy and no route income.
function startingValues(turns, games, rng) {
  const totals = new Array(MAX_RECEIVED + 1).fill(0);
  const noIncome = new Array(turns + 2).fill(0);
  for (let game = 0; game < games; game += 1) {
    const cards = dealCards(rng);
    for (let energy = 0; energy <= MAX_RECEIVED; energy += 1) {
      totals[energy] += playRest(newState(cards, energy), 1, turns, noIncome);
    }
  }
  return totals.map((total) => total / games);
}

const round = (value) => Number(Math.max(0, value).toFixed(3));

// ---- Build ------------------------------------------------------------------
const rng = mulberry32(SETTINGS.seed);
const baseValue = [null];
const energyValue = [null];
const cardValue = [null];
const installValue = [null];
for (let turns = 1; turns <= MAX_TURNS; turns += 1) {
  const { cells, install } = simulateRace(turns, SETTINGS.gamesPerRaceLength, rng);
  energyValue.push(STARTING_ENERGY_POINTS.map((start) => {
    const bucketCells = simulateRace(turns, SETTINGS.gamesPerRaceLength, rng, SETTINGS.disruptionWeight, [start, start]).cells;
    return cellTable(bucketCells, "energy", turns, "energyN", "forkEnergy").map((row) => row && row.map(round));
  }));
  cardValue.push(cellTable(cells, "card", turns).map((row) => row && row.map(round)));
  const installRow = [null];
  for (let turn = 1; turn <= turns; turn += 1) {
    const value = install.n[turn] ? install.value[turn] / install.n[turn] : 0;
    installRow.push(round(turn > 1 ? Math.min(value, installRow[turn - 1]) : value));
  }
  installValue.push(installRow);
  baseValue.push(startingValues(turns, 4000, rng).map(round));
  process.stderr.write(`race ${turns} done\n`);
}

// Course disruption: Energy's worth on a course whose disruption cards are worth
// w times the average (w = 0, 1, 2), relative to the average course: total worth
// of +1 Energy over races of 6-12 turns.
function totalEnergyWorth(w) {
  const worthRng = mulberry32(SETTINGS.seed + 1);
  let total = 0;
  for (let turns = 6; turns <= 12; turns += 2) {
    const { cells } = simulateRace(turns, 3000, worthRng, w);
    total += cells.energy.reduce((sum, value) => sum + value, 0);
  }
  return total;
}
const averageWorth = totalEnergyWorth(1);
const disruptionMultipliers = [0, 1, 2].map((w) => Number((totalEnergyWorth(w) / averageWorth).toFixed(3)));
process.stderr.write(`disruption multipliers ${disruptionMultipliers.join(" ")}\n`);

const maxOf = (table) => Math.max(0, ...table.flat(Infinity).filter(Number.isFinite));
const out = `// Robo Rally Course Randomizer - generated by scripts/build-energy-value-table.mjs; do not edit by hand.
// What Energy and upgrade cards are worth, in register-equivalents (RE), as deck
// averages. Indexes: [race turns 1..${MAX_TURNS}][turn 1..race turns][Energy received so
// far 0..${MAX_RECEIVED}] (starting Energy plus route gains; no storage cap on received).
export const ENERGY_VALUE_TABLE_SETTINGS = Object.freeze(${JSON.stringify(SETTINGS)});
export const ENERGY_VALUE_TABLE_MAX_TURNS = ${MAX_TURNS};
export const ENERGY_VALUE_TABLE_MAX_ENERGY = ${MAX_RECEIVED};
// Upgrade value of a race by starting Energy, without route income: [turns][energy].
export const UPGRADE_VALUE_BY_STARTING_ENERGY = ${JSON.stringify(baseValue)};
// Starting Energies of ENERGY_GAIN_VALUE (interpolate linearly between them).
export const ENERGY_VALUE_STARTING_POINTS = ${JSON.stringify(STARTING_ENERGY_POINTS)};
// Value of +1 Energy before a turn's upgrade phase: [turns][starting point][turn][received].
export const ENERGY_GAIN_VALUE = ${JSON.stringify(energyValue)};
// Value of +1 blind upgrade card in hand before a turn's upgrade phase: [turns][turn][received].
export const UPGRADE_CARD_GAIN_VALUE = ${JSON.stringify(cardValue)};
// Value of a free random upgrade installed at once at a turn: [turns][turn].
export const FREE_UPGRADE_INSTALL_VALUE = ${JSON.stringify(installValue)};
// Energy's worth on a course with disruption weight 0 / 1 / 2 (1 = average course).
export const ENERGY_VALUE_DISRUPTION_MULTIPLIERS = Object.freeze(${JSON.stringify(disruptionMultipliers)});
export const ENERGY_VALUE_TABLE_MAXIMA = Object.freeze({
  energy: ${maxOf(energyValue)},
  card: ${maxOf(cardValue)},
  install: ${maxOf(installValue)}
});
`;
const target = join(HERE, "..", "src", "analysis", "energy-value-table.js");
writeFileSync(target, out);
console.log(`wrote ${target}`);

// ---- Check: table vs direct play on every golden route's own income -----------
if (process.argv.includes("--check")) {
  const checkRng = mulberry32(SETTINGS.seed + 2);
  const deals = Array.from({ length: 600 }, () => dealCards(checkRng));
  const starts = [0, 1, 2, 3, 4, 5, 6];
  const errors = Object.fromEntries(starts.map((s) => [s, []]));
  const priceErrors = Object.fromEntries(starts.filter((s) => s !== 3).map((s) => [s, []]));
  const totals = Object.fromEntries(starts.map((s) => [s, { direct: 0, table: 0 }]));
  for (const [routeTurns, gainTurns] of INCOME_ROUTES) {
    const turns = Math.min(MAX_TURNS, routeTurns);
    const income = exactIncome(gainTurns, turns);
    const byStart = {};
    for (const start of starts) {
      let direct = 0;
      for (const cards of deals) direct += playRest(newState(cards, start), 1, turns, income);
      direct /= deals.length;
      let estimate = baseValue[turns][start];
      let received = start;
      for (let turn = 2; turn <= turns; turn += 1) {
        for (let gain = 0; gain < income[turn]; gain += 1) {
          for (const [point, weight] of startingEnergyWeights(start)) {
            estimate += weight * energyValue[turns][point][turn][Math.min(received, MAX_RECEIVED)];
          }
          received += 1;
        }
      }
      byStart[start] = { direct, estimate };
      errors[start].push(estimate - direct);
      totals[start].direct += direct;
      totals[start].table += estimate;
    }
    for (const start of Object.keys(priceErrors).map(Number)) {
      priceErrors[start].push(
        (byStart[start].estimate - byStart[3].estimate) - (byStart[start].direct - byStart[3].direct)
      );
    }
  }
  const stats = (list) => {
    const sorted = list.map(Math.abs).sort((a, b) => a - b);
    const bias = list.reduce((a, b) => a + b, 0) / list.length;
    return `bias ${bias.toFixed(3)}, mean abs ${(sorted.reduce((a, b) => a + b, 0) / list.length).toFixed(3)}, p90 abs ${sorted[Math.floor(0.9 * (sorted.length - 1))].toFixed(3)}`;
  };
  console.log(`check on ${INCOME_ROUTES.length} golden routes (600 deals each), RE:`);
  for (const start of starts) {
    console.log(`  start ${start}: direct mean ${(totals[start].direct / INCOME_ROUTES.length).toFixed(2)}, table mean ${(totals[start].table / INCOME_ROUTES.length).toFixed(2)}; error ${stats(errors[start])}`);
  }
  for (const start of Object.keys(priceErrors).map(Number)) console.log(`  price ${start} vs 3: error ${stats(priceErrors[start])}`);
  const steps = starts.map((start) => (totals[start].table / INCOME_ROUTES.length).toFixed(2));
  const directSteps = starts.map((start) => (totals[start].direct / INCOME_ROUTES.length).toFixed(2));
  console.log(`  mean value by starting Energy 0..6: table ${steps.join(" ")} | direct ${directSteps.join(" ")}`);
}
