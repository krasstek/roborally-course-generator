#!/usr/bin/env node
// Builds src/analysis/energy-value-table.js: what Energy and upgrade cards are
// worth, in Energy units, by Energy received so far, turn and race length.
//
// The values come from simulating a player's upgrade game with the real upgrade
// deck (40 cards, costs 0-5), many times over, with a simple greedy policy:
// every turn the player may pay 1 Energy to draw a blind card (when the hand holds
// nothing useful it can afford), then buys the most valuable useful card it can
// afford; unspent Energy is saved. A card's value is roughly its cost: a
// permanent card is worth its cost scaled by the share of the race left, a
// temporary card its cost once. Only some cards are useful on a given course,
// and a robot holds at most 3 permanent and 3 temporary upgrades.
//
// Units: a card worth its cost means the table is in Energy, not registers. The
// analysis multiplies every value by the registers-per-Energy rate, the price of
// making one Energy with Power Up (a register plus the scarcity of holding the
// card), which the card model derives from the programming deck
// (program-availability.js, ~1.39 today). The simulated player only compares
// values, so its choices and the table do not depend on that rate. Because
// Power Up can make an Energy at that price, no single Energy is valued above
// one Energy unit (the ceiling below; it binds only at turn 1 with 1 Energy).
// Values are smoothed so the same gain is never worth more later in the race.
//
// Run: node scripts/build-energy-value-table.mjs   (deterministic; about a minute)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Upgrade economy settings (change here, then rerun) ---------------------
const SETTINGS = {
  // Upgrade deck: number of cards by Energy cost.
  cardCountsByCost: { 0: 1, 1: 13, 2: 15, 3: 6, 4: 4, 5: 1 },
  // Share of cards that are temporary (used once, then gone).
  temporaryShare: 0.45,
  // Share of cards that are useful on a given course.
  usefulShare: 2 / 3,
  // Installed upgrade limits per robot.
  permanentSlots: 3,
  temporarySlots: 3,
  // Upgrade cards in hand at the start.
  startingHand: 3,
  // Energy cost of drawing one blind card (once per turn).
  drawCost: 1,
  // Ceiling for one Energy, in Energy units (Power Up makes one at the rate).
  energyValueCeiling: 1,
  // Simulation size and seed.
  games: 6000,
  seed: 20261012
};
const MAX_ENERGY_BUDGET = 12;
const MAX_TURNS = 14;

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

const DECK = Object.entries(SETTINGS.cardCountsByCost)
  .flatMap(([cost, count]) => Array.from({ length: count }, () => Number(cost)));

// One game's random setup, shared by every variant compared on it.
function dealGame(gameIndex) {
  const rng = mulberry32(SETTINGS.seed + gameIndex * 7919);
  const cards = DECK.map((cost) => ({
    cost,
    temporary: rng() < SETTINGS.temporaryShare,
    useful: rng() < SETTINGS.usefulShare
  }));
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

// Upgrade value of one game: starting Energy budget, race length, and an optional
// event at one turn ("energy": +1 Energy, "card": +1 blind card, "install": a
// free random card installed at once).
function playGame(cards, energyBudget, turns, event = null) {
  const deck = cards.slice();
  const hand = deck.splice(deck.length - SETTINGS.startingHand, SETTINGS.startingHand);
  let energy = energyBudget;
  let permanent = 0;
  let temporary = 0;
  let value = 0;
  for (let turn = 1; turn <= turns; turn += 1) {
    const remaining = (turns - turn + 1) / turns;
    const cardValue = (card) => {
      if (!card.useful) return 0;
      if (card.temporary) return temporary < SETTINGS.temporarySlots ? card.cost : 0;
      return permanent < SETTINGS.permanentSlots ? card.cost * remaining : 0;
    };
    const install = (card) => {
      value += cardValue(card);
      if (card.temporary) temporary += 1;
      else permanent += 1;
    };
    if (event?.turn === turn) {
      if (event.kind === "energy") energy += 1;
      else if (event.kind === "card" && deck.length) hand.push(deck.pop());
      else if (event.kind === "install" && deck.length) {
        const card = deck.pop();
        if (cardValue(card) > 0) install(card);
      }
    }
    let affordable = hand.filter((card) => card.cost <= energy && cardValue(card) > 0);
    if (!affordable.length && energy >= SETTINGS.drawCost + 1 && deck.length) {
      energy -= SETTINGS.drawCost;
      hand.push(deck.pop());
      affordable = hand.filter((card) => card.cost <= energy && cardValue(card) > 0);
    }
    if (affordable.length) {
      const best = affordable.reduce((left, right) => (
        cardValue(right) > cardValue(left) ||
        (cardValue(right) === cardValue(left) && right.cost < left.cost)
          ? right
          : left
      ));
      energy -= best.cost;
      hand.splice(hand.indexOf(best), 1);
      install(best);
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
// installValue[turns][turn]: a free random install at that turn.
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
  // Over Energy the true curve rises before it falls (2-cost cards are the most
  // common, so the second Energy is the most valuable), so it is left as simulated.
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
    energyValue[turns][turn] = energyValue[turns][turn].map(
      (value) => round(Math.min(SETTINGS.energyValueCeiling, value))
    );
    cardValue[turns][turn] = cardValue[turns][turn].map(round);
    installValue[turns][turn] = round(installValue[turns][turn]);
  }
}

const maxOf = (table) => Math.max(0, ...table.flat(2).filter(Number.isFinite));
const out = `// Robo Rally Course Randomizer - generated by scripts/build-energy-value-table.mjs; do not edit by hand.
// What Energy and upgrade cards are worth, in Energy units: multiply by the
// registers-per-Energy rate (program-availability.js) for register-equivalents. Indexes:
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
