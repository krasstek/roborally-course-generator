#!/usr/bin/env node
// Builds src/analysis/energy-value-table.js: what Energy and upgrade cards are
// worth, in register-equivalents (RE), by Energy received so far, turn and race
// length.
//
// The values come from simulating a player's upgrade game with the real upgrade
// deck (the 40 cards of the 2023 rules), many times over. Rules of the simulated
// player (settled with the user 2026-11-16; study in
// calibration-output/studies/2026-11-16-energy-clog/):
// - acquisition as in the 2023 rules: a 3-card starting hand; each turn at most
//   one 1-Energy blind draw (only when nothing useful in hand is affordable and
//   Energy is left over) and at most one install; spend as you go;
// - a card is worth its cost at one fitted rate: a permanent returns
//   permanentREPerCostPerTurn per cost point every turn it is installed, a
//   temporary temporaryREPerCost per cost point once, times a best-moment factor
//   (temporaries are held for the right spot; less room near the end of the race);
//   both times the unseen-benefit factor (what the route model cannot see: other
//   robots, longer real games, hand quality under damage);
// - a card pays off on a given course with probability `payoff` (course-specific
//   cards: `payoffCourseSpecific`); Re-initialize is weak (x0.25);
// - 3 permanent and 3 temporary slots; an installed permanent is replaced only by
//   a clearly better card (replaceMargin); the main-laser group is swap-only (a
//   second one is worth only its improvement);
// - Energy-using cards (Deflector Shield, Mini Howitzer) are a small Energy sink;
//   Recharge gives 3 Energy;
// - disruption cards (push/pull/scramble) scale with the course weight; the table
//   uses the average course (weight 1);
// - at most 10 Energy held.
// Values are smoothed so the same gain is never worth more later in the race.
// The anchors (permanent rate, temporary rate) were measured with the app's own
// RE ledger on the golden courses; the factors are educated estimates to revisit
// at the calibration rerun.
//
// Run: node scripts/build-energy-value-table.mjs   (deterministic; a few minutes)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  startingHand: 3,
  drawCost: 1,
  maxEnergy: 10,
  games: 6000,
  seed: 20261116
};
const MAX_ENERGY_BUDGET = 12;
const MAX_TURNS = 14;

// tags: d = disruption (scales with the course weight), x = main-laser group
// (swap-only), c = course-specific payoff, sink = spends Energy for value,
// poor = weak card, energy = gives Energy when used.
const P = (name, cost, tags = "") => ({ name, cost, temporary: false, tags: tags.split(" ").filter(Boolean) });
const T = (name, cost, tags = "") => ({ name, cost, temporary: true, tags: tags.split(" ").filter(Boolean) });
const DECK = [
  P("Rear Laser", 2), P("Double Laser", 2, "x"), P("Modular Chassis", 1, "d"), P("Spam Filter", 3),
  P("Self Diagnostics", 2), P("Memory Cards", 3), P("Chaos Theory", 2), P("Ramming Gear", 2, "d"),
  P("Laser Kata", 1), P("Scrambler", 4, "d x"), P("Drifting", 4), P("Firewall", 1, "c"),
  P("Energy Conversion", 3), P("Crab Legs", 5), P("Rail Gun", 2, "x"), P("Deflector Shield", 2, "sink"),
  P("Mini Howitzer", 3, "d sink"), P("Brakes", 2), P("Power Slide", 4), P("Hover Unit", 1, "c"),
  P("Spiky", 2, "d"), P("Flash Drive", 4), P("Pressure Beam", 3, "d x"), P("Tractor Beam", 3, "d x"),
  T("Abort Switch", 1), T("Overclocked", 2), T("Rewire", 1), T("Magnetic", 1), T("Lucky Booster", 1),
  T("Piercing Drill", 1, "d"), T("Zoop", 1), T("Re-initialize", 1, "poor"), T("Recharge", 0, "energy"),
  T("Calibration Protocol", 2), T("Memory Swap", 2), T("Switch", 2, "d"), T("Boink", 1),
  T("All Aboard", 1), T("Displacing Blast", 2, "d c"), T("Pressure Release", 2)
];
if (DECK.length !== 40) throw new Error(`upgrade deck has ${DECK.length} cards, expected 40`);

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

// One game's random setup (which cards pay off, deck order), shared by every
// variant compared on it. Per-card values are fixed per game.
function dealGame(gameIndex) {
  const rng = mulberry32(SETTINGS.seed + gameIndex * 7919);
  const w = SETTINGS.disruptionWeight;
  const cards = DECK.map((card) => {
    const pays = rng() < (has(card, "c") ? SETTINGS.payoffCourseSpecific : SETTINGS.payoff);
    const weight = (has(card, "d") ? w : 1) * (has(card, "poor") ? SETTINGS.poorCardFactor : 1);
    const scale = pays ? SETTINGS.unseenBenefitFactor * weight : 0;
    return {
      ...card,
      pays,
      // Permanent: RE per installed turn.
      perTurn: card.temporary ? 0 : SETTINGS.permanentREPerCostPerTurn * card.cost * scale,
      // Temporary: RE once at an average moment (before the best-moment factor).
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

// Upgrade value (RE) of one game: starting Energy budget, race length, and an
// optional event at one turn ("energy": +1 Energy, "card": +1 blind card,
// "install": a free random card installed at once).
function playGame(cards, energyBudget, turns, event = null) {
  const deck = cards.slice();
  const hand = deck.splice(deck.length - SETTINGS.startingHand, SETTINGS.startingHand);
  let energy = Math.min(SETTINGS.maxEnergy, energyBudget);
  const installed = [];
  let temporaries = 0;
  let value = 0;
  const worstInstalled = () => installed.reduce((a, b) => (a.perTurn <= b.perTurn ? a : b));
  for (let turn = 1; turn <= turns; turn += 1) {
    const turnsLeft = turns - turn + 1;
    const moment = 1 + (SETTINGS.bestMomentFactor - 1) * Math.min(1, Math.max(0, turnsLeft - 1) / 3);
    // Gain from installing a card now; the card it replaces, if any.
    const gainOf = (card) => {
      if (card.temporary) {
        if (temporaries >= SETTINGS.temporarySlots) return 0;
        if (has(card, "energy")) return 0.01; // Recharge: its worth is the Energy it gives
        return card.once * moment;
      }
      if (card.perTurn <= 0) return 0;
      const rival = has(card, "x") ? installed.find((held) => has(held, "x")) : null;
      if (rival) return Math.max(0, card.perTurn - rival.perTurn) * turnsLeft;
      if (installed.length < SETTINGS.permanentSlots) return card.perTurn * turnsLeft;
      const worst = worstInstalled();
      return card.perTurn > SETTINGS.replaceMargin * worst.perTurn
        ? (card.perTurn - worst.perTurn) * turnsLeft
        : 0;
    };
    const install = (card, gain) => {
      value += gain;
      if (card.temporary) {
        temporaries += 1;
        if (has(card, "energy")) energy = Math.min(SETTINGS.maxEnergy, energy + SETTINGS.rechargeEnergy);
        return;
      }
      const rival = has(card, "x") ? installed.find((held) => has(held, "x")) : null;
      if (rival) installed.splice(installed.indexOf(rival), 1);
      else if (installed.length >= SETTINGS.permanentSlots) installed.splice(installed.indexOf(worstInstalled()), 1);
      installed.push(card);
    };
    if (event?.turn === turn) {
      if (event.kind === "energy") energy = Math.min(SETTINGS.maxEnergy, energy + 1);
      else if (event.kind === "card" && deck.length) hand.push(deck.pop());
      else if (event.kind === "install" && deck.length) {
        const card = deck.pop();
        const gain = gainOf(card);
        if (gain > 0) install(card, gain);
      }
    }
    let affordable = hand.filter((card) => card.cost <= energy && gainOf(card) > 0);
    if (!affordable.length && energy >= SETTINGS.drawCost + 1 && deck.length) {
      energy -= SETTINGS.drawCost;
      hand.push(deck.pop());
      affordable = hand.filter((card) => card.cost <= energy && gainOf(card) > 0);
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
      energy -= best.cost;
      hand.splice(hand.indexOf(best), 1);
      install(best, bestGain);
    } else {
      // Energy sinks only when nothing was bought this turn (spend as you go).
      for (const card of installed) {
        if (card.sinkRE > 0 && energy >= 1) {
          energy -= 1;
          value += card.sinkRE;
        }
      }
    }
  }
  return value;
}

const games = Array.from({ length: SETTINGS.games }, (_, index) => dealGame(index));
function expectedValue(energyBudget, turns, event = null) {
  let total = 0;
  for (const cards of games) total += playGame(cards, energyBudget, turns, event);
  return total / games.length;
}

const round = (value) => Number(Math.max(0, value).toFixed(4));
// baseValue[turns][energy]: upgrade value of a race with this starting Energy.
// energyValue / cardValue[turns][turn][energy]: value of +1 Energy / +1 blind card
// arriving before that turn's upgrade phase, given Energy received so far.
// installValue[turns][turn]: a free random install at that turn (3 starting Energy).
const baseValue = [];
const energyValue = [];
const cardValue = [];
const installValue = [];
for (let turns = 1; turns <= MAX_TURNS; turns += 1) {
  const base = [];
  for (let energy = 0; energy <= MAX_ENERGY_BUDGET; energy += 1) base.push(expectedValue(energy, turns));
  baseValue[turns] = base.map(round);
  energyValue[turns] = [];
  cardValue[turns] = [];
  installValue[turns] = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const energyRow = [];
    const cardRow = [];
    for (let energy = 0; energy <= MAX_ENERGY_BUDGET; energy += 1) {
      energyRow.push(expectedValue(energy, turns, { kind: "energy", turn }) - base[energy]);
      cardRow.push(expectedValue(energy, turns, { kind: "card", turn }) - base[energy]);
    }
    energyValue[turns][turn] = energyRow;
    cardValue[turns][turn] = cardRow;
    installValue[turns][turn] = expectedValue(3, turns, { kind: "install", turn }) - base[3];
  }
  // Smooth over turns only: the same gain is never worth more later in the race.
  for (const table of [energyValue[turns], cardValue[turns]]) {
    for (let turn = 2; turn <= turns; turn += 1) {
      for (let energy = 0; energy <= MAX_ENERGY_BUDGET; energy += 1) {
        table[turn][energy] = Math.min(table[turn][energy], table[turn - 1][energy]);
      }
    }
  }
  for (let turn = 2; turn <= turns; turn += 1) {
    installValue[turns][turn] = Math.min(installValue[turns][turn], installValue[turns][turn - 1]);
  }
  for (let turn = 1; turn <= turns; turn += 1) {
    energyValue[turns][turn] = energyValue[turns][turn].map(round);
    cardValue[turns][turn] = cardValue[turns][turn].map(round);
    installValue[turns][turn] = round(installValue[turns][turn]);
  }
  process.stderr.write(`race ${turns} done\n`);
}

const maxOf = (table) => Math.max(0, ...table.flat(2).filter(Number.isFinite));
const out = `// Robo Rally Course Randomizer - generated by scripts/build-energy-value-table.mjs; do not edit by hand.
// What Energy and upgrade cards are worth, in register-equivalents (RE). Indexes:
// [race turns 1..${MAX_TURNS}][turn 1..race turns][Energy received so far 0..${MAX_ENERGY_BUDGET}].
export const ENERGY_VALUE_TABLE_SETTINGS = Object.freeze(${JSON.stringify(SETTINGS)});
export const ENERGY_VALUE_TABLE_MAX_TURNS = ${MAX_TURNS};
export const ENERGY_VALUE_TABLE_MAX_ENERGY = ${MAX_ENERGY_BUDGET};
// Upgrade value of a race by starting Energy: [turns][energy].
export const UPGRADE_VALUE_BY_STARTING_ENERGY = ${JSON.stringify(baseValue)};
// Value of +1 Energy before a turn's upgrade phase: [turns][turn][energy].
export const ENERGY_GAIN_VALUE = ${JSON.stringify(energyValue)};
// Value of +1 blind upgrade card in hand before a turn's upgrade phase: [turns][turn][energy].
export const UPGRADE_CARD_GAIN_VALUE = ${JSON.stringify(cardValue)};
// Value of a free random upgrade installed at once at a turn: [turns][turn].
export const FREE_UPGRADE_INSTALL_VALUE = ${JSON.stringify(installValue)};
export const ENERGY_VALUE_TABLE_MAXIMA = Object.freeze({
  energy: ${maxOf(energyValue)},
  card: ${maxOf(cardValue)},
  install: ${maxOf(installValue)}
});
`;
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "analysis", "energy-value-table.js");
writeFileSync(target, out);
console.log(`wrote ${target}`);
