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
