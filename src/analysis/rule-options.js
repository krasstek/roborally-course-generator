// Robo Rally Course Randomizer - small rule and option queries shared across the analysis
import { REGISTER_TEMPO_COST } from "./constants.js";

export function isBatteryActive(options = {}) {
  return !options.lighterGame;
}

export function isRouteAwareBatteryScoringActive(options = {}) {
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

// v49bf pathfinder ownership: every programmed action spends exactly one
// register. Raw travelled-space distance is not accumulated route difficulty;
// Manhattan distance remains only a queue-order heuristic. Reboots retain factual
// skipped-register tempo, while their legacy fixed discontinuity surcharge is off.
export function getActionPenalty(action, options = {}) {
  return REGISTER_TEMPO_COST;
}

// The rule and economy options every route
// search receives. Route searches used to copy these keys by hand in several
// places (full-course.js x3, course-analysis.js, movement.js), and new rules
// were silently dropped from some copies (Drift Deck, 2026-10-22). Keep the
// keys here; `npm run verify:rule-options` checks that every variant option
// is either listed here or explicitly marked as not route-relevant.

// Rule switches, passed as given.
export const ROUTE_RULE_RAW_KEYS = Object.freeze([
  "recoveryRule",
  "lessDeadlyGame",
  "moreDeadlyGame",
  "lighterGame",
  "upgradeWorld",
  "lessSpammyGame",
  "criticalSpam",
  "criticalHaywire",
  "permanentShutdown",
  "cuttingFloor",
  "flamingOil",
  "repulsorOverdrive"
]);

// Rule switches normalised to booleans.
export const ROUTE_RULE_BOOLEAN_KEYS = Object.freeze([
  "factoryRejects",
  "classicSharedDeck",
  "driftDeck",
  "lessForeshadowing",
  "setToKill",
  "setToStun",
  "repairStations"
]);

// Energy and upgrade economy settings, passed as given.
export const ROUTE_ECONOMY_RAW_KEYS = Object.freeze([
  "routeEnergyHorizonTurns",
  "routeEnergyRegisterScore",
  "routeEnergyReferenceReserve",
  "startingEnergy",
  "startingEnergyDelta",
  "startingUpgradeCards",
  "startingUpgradeCardDelta",
  "maxEnergy",
  "upgradeDrawsPerTurn",
  "upgradeInstallsPerTurn",
  "upgradeDrawEnergyCost",
  "upgradeUsefulCardRate",
  "upgradeUsefulEnergyPerInstall",
  "upgradePowerRegistersPerEnergy",
  "routeRegistersPerTurn"
]);

// Variant options that route searches deliberately do not take from this
// helper: handled per leg or per start by the caller (Startup Spin-Up only on
// the opening leg; Virtual Bots and its grace registers per call site), set
// up the layout or the map before routing (docks, boards, checkpoints), reach
// routing through another key (Dynamic Archiving and Home Reboot through
// recoveryRule), or are not used by route search at all (pricing, timing,
// variant bookkeeping).
export const ROUTE_RULE_EXCLUDED_KEYS = Object.freeze([
  "startupSpinUp",
  "virtualBots",
  "trafficGraceRegisters",
  "actFast",
  "competitiveMode",
  "payToWin",
  "subsidizedStarts",
  "hazardousFlags",
  "movingTargets",
  "dynamicArchiving",
  "homeReboot",
  "noDocks",
  "extraDocks",
  "sandwichedDock",
  "staggeredBoards",
  "alignedLayout",
  "variantComplexityBudget",
  "variantComplexityUsed"
]);

export function pickRouteRuleOptions(options = {}) {
  const picked = {};
  for (const key of ROUTE_RULE_RAW_KEYS) picked[key] = options[key];
  for (const key of ROUTE_RULE_BOOLEAN_KEYS) picked[key] = Boolean(options[key]);
  return picked;
}

export function pickRouteEconomyOptions(options = {}) {
  const picked = { routeAwareBatteryScoring: Boolean(options.routeAwareBatteryScoring) };
  for (const key of ROUTE_ECONOMY_RAW_KEYS) picked[key] = options[key];
  return picked;
}
