// Checks for the Transformers rules beyond movement (verify-movement.js covers
// movement): robot lasers and buildings, jump ramps and fire pits.
import {
  applyDamageEconomyPitStopPicks,
  createDamageEconomyState,
  getDamageEconomyCombinedClogSummary,
  getDamageEconomyRealizedDamageForTransition
} from "../src/analysis/damage-economy.js";
import { getEnergonContactSquares, getRouteEnergyShadowStep } from "../src/analysis/energy-economy.js";
import { getTransitionVariants, simulateAction } from "../src/analysis/movement.js";
import { getIncomingRobotLaserDirection, hasLineOfSight } from "../src/analysis/traffic.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

// A row of squares x = 0..length-1 at y = 0, with optional features per x.
function row(length, featuresByX = {}) {
  const map = new Map();
  for (let x = 0; x < length; x += 1) {
    map.set(tileKey(x, 0), { x, y: 0, features: featuresByX[x] ?? [] });
  }
  return map;
}

const building = (doorways) => [{ type: "building", sides: doorways }];
const ramp = (dir) => [{ type: "jumpRamp", dir }];
const firePit = [{ type: "firePit" }];

// Robot points as the traffic model passes them: positions after the register.
function point(x, facing) {
  return { after: { x, y: 0, facing }, facing };
}

// Damage for one register's transition along the row.
function damage(map, from, to, traversed, absoluteAction = 2) {
  return getDamageEconomyRealizedDamageForTransition(map, {
    from: { x: from, y: 0, facing: "E" },
    to: { x: to, y: 0, facing: "E" },
    traversed: traversed.map((x) => ({ x, y: 0 })),
    rebooted: false,
    crashed: false
  }, {}, absoluteAction);
}

const laser = { type: "laser", dir: "E", damage: 1 };
const FORWARD = { id: "FORWARD", type: "move", relative: "forward", steps: 1 };

// Energy step for a robot ending the register on square x of the row.
function energyStep(map, x, transition = {}) {
  const options = { routeAwareBatteryScoring: true, routeEnergyHorizonTurns: 6, routeEnergyRegisterScore: 6.4 };
  return getRouteEnergyShadowStep(map, { x, y: 0 }, "FORWARD", 3, 3, 0, options, transition);
}

const pitStop = [{ type: "pitStop" }];

// Plays Move 1 east for `count` registers from x = 0, register by register
// (register index runs 0-4 and wraps into the next turn); returns each x.
function playForward(map, count) {
  let state = { x: 0, y: 0, facing: "E" };
  const xs = [];
  const cancelled = [];
  for (let index = 0; index < count; index += 1) {
    const result = simulateAction(map, state, FORWARD, { registerIndex: index % 5 });
    state = result.to;
    xs.push(state.x);
    if (result.cancelledByFirePit) cancelled.push(index + 1);
  }
  return { xs: xs.join(","), cancelled: cancelled.join(",") };
}

const cases = [
  {
    name: "laser: open floor is visible",
    check: () => hasLineOfSight(row(4), { x: 0, y: 0 }, { x: 3, y: 0 }) === true
  },
  {
    name: "laser: can't shoot into a building, even through a doorway",
    check: () => hasLineOfSight(row(3, { 2: building(["W"]) }), { x: 0, y: 0 }, { x: 2, y: 0 }) === false
  },
  {
    name: "laser: robots in the same building shoot each other through the shared doorway",
    check: () => hasLineOfSight(row(2, { 0: building(["E"]), 1: building(["W"]) }), { x: 0, y: 0 }, { x: 1, y: 0 }) === true
  },
  {
    name: "laser: building squares without a shared doorway block",
    check: () => hasLineOfSight(row(2, { 0: building(["E"]), 1: building(["N"]) }), { x: 0, y: 0 }, { x: 1, y: 0 }) === false
  },
  {
    name: "laser: a robot on a doorway square shoots out through it",
    check: () => hasLineOfSight(row(3, { 0: building(["E"]) }), { x: 0, y: 0 }, { x: 2, y: 0 }) === true
  },
  {
    name: "laser: a robot in a building can't shoot out through a closed side",
    check: () => hasLineOfSight(row(3, { 0: building(["N"]) }), { x: 0, y: 0 }, { x: 2, y: 0 }) === false
  },
  {
    name: "laser: a jump ramp in between stops the shot",
    check: () => hasLineOfSight(row(3, { 1: ramp("E") }), { x: 0, y: 0 }, { x: 2, y: 0 }) === false
  },
  {
    name: "laser: a robot on a ramp is hit from any direction",
    check: () => hasLineOfSight(row(3, { 2: ramp("E") }), { x: 0, y: 0 }, { x: 2, y: 0 }) === true &&
      hasLineOfSight(row(3, { 0: ramp("E") }), { x: 2, y: 0 }, { x: 0, y: 0 }) === true
  },
  {
    name: "laser: a robot on a ramp shoots in any direction",
    check: () => hasLineOfSight(row(3, { 0: ramp("N") }), { x: 0, y: 0 }, { x: 2, y: 0 }) === true
  },
  {
    name: "laser: a robot in a fire pit is not hit",
    check: () => getIncomingRobotLaserDirection(row(3, { 2: firePit }), point(2, "N"), point(0, "E")) === null
  },
  {
    name: "laser: a robot in a fire pit does not fire",
    check: () => getIncomingRobotLaserDirection(row(3, { 0: firePit }), point(2, "N"), point(0, "E")) === null
  },
  {
    name: "laser: a fire pit in between does not block",
    check: () => getIncomingRobotLaserDirection(row(3, { 1: firePit }), point(2, "N"), point(0, "E")) === "E"
  },
  {
    name: "fire pit: entering and ending the register in it deals 1 + 1",
    check: () => damage(row(3, { 1: firePit }), 0, 1, [1]).firePitDamageUnits === 2
  },
  {
    name: "fire pit: staying in it for a register deals 1",
    check: () => damage(row(3, { 1: firePit }), 1, 1, []).firePitDamageUnits === 1
  },
  {
    name: "fire pit: carried through it deals 1 for the entry only",
    check: () => damage(row(3, { 1: firePit }), 0, 2, [1, 2]).firePitDamageUnits === 1
  },
  {
    name: "fire pit: a board laser does not hit a robot in it",
    check: () => {
      const result = damage(row(3, { 1: [...firePit, laser] }), 1, 1, []);
      return result.boardLaserDamageUnits === 0 && result.totalDamageUnits === 1;
    }
  },
  {
    name: "fire pit: the same laser hits outside a pit",
    check: () => damage(row(3, { 1: [laser] }), 1, 1, []).boardLaserDamageUnits === 1
  },
  {
    name: "fire pit: entered in register 2, the register-5 card is cancelled even after leaving",
    check: () => {
      const result = playForward(row(10, { 2: firePit }), 6);
      return result.xs === "1,2,3,4,4,5" && result.cancelled === "5";
    }
  },
  {
    name: "fire pit: entered in register 5, nothing is cancelled",
    check: () => {
      const result = playForward(row(10, { 5: firePit }), 6);
      return result.xs === "1,2,3,4,5,6" && result.cancelled === "";
    }
  },
  {
    name: "mine: every entry deals 1 damage",
    check: () => damage(row(3, { 1: [{ type: "mine" }] }), 0, 2, [1, 2]).mineDamageUnits === 1 &&
      damage(row(3, { 1: [{ type: "mine" }] }), 0, 1, [1]).totalDamageUnits === 1
  },
  {
    name: "mine: its clog adds one unit to the turn (1 RE on an otherwise clean turn)",
    check: () => {
      const clean = getDamageEconomyCombinedClogSummary([[1]], [1], 0).clogRegisterEquivalents;
      const mined = getDamageEconomyCombinedClogSummary([[1]], [1], 0, 2, 2, 1).clogRegisterEquivalents;
      return clean === 0 && Math.abs(mined - 1) < 1e-9;
    }
  },
  {
    name: "energon: passing through counts as contact",
    check: () => getEnergonContactSquares(row(3, { 1: [{ type: "energon" }] }), {
      traversed: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      to: { x: 2, y: 0 }
    }).length === 1
  },
  {
    name: "energon: the search credits 1 Energy per cube touched",
    check: () => energyStep(row(3, { 1: [{ type: "energon" }] }), 2, { traversed: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }).energonEnergyGain === 1
  },
  {
    name: "energon: a contested claim is worth its chance of arriving first",
    check: () => {
      const map = row(3, { 1: [{ type: "energon" }] });
      const full = energyStep(map, 1, { energonClaims: [1] }).rewardRegisterEquivalents;
      const half = energyStep(map, 1, { energonClaims: [0.5] }).rewardRegisterEquivalents;
      const taken = energyStep(map, 1, { energonClaims: [] }).rewardRegisterEquivalents;
      return full > 0 && Math.abs(half - full / 2) < 1e-6 && taken === 0;
    }
  },
  {
    name: "space bridge: a robot ending on one may hop to each other bridge of its colour",
    check: () => {
      const map = row(8, {
        1: [{ type: "spaceBridge", id: "red" }],
        4: [{ type: "spaceBridge", id: "red" }],
        6: [{ type: "spaceBridge", id: "blue" }]
      });
      const variants = getTransitionVariants(simulateAction(map, { x: 0, y: 0, facing: "E" }, FORWARD, { registerIndex: 0 }));
      return variants.length === 2 &&
        variants[0].to.x === 1 &&
        variants[1].to.x === 4 && variants[1].to.facing === "E" && variants[1].spaceBridgeHop?.x === 4;
    }
  },
  {
    name: "space bridge: board elements after pushers act at the far bridge",
    check: () => {
      const map = row(6, {
        1: [{ type: "spaceBridge", id: "red" }],
        4: [{ type: "spaceBridge", id: "red" }, { type: "gear", rotation: "cw" }]
      });
      const hop = getTransitionVariants(simulateAction(map, { x: 0, y: 0, facing: "E" }, FORWARD, { registerIndex: 0 }))[1];
      return hop?.to.x === 4 && hop.to.facing === "S";
    }
  },
  {
    name: "space bridge: no hop off a bridge",
    check: () => getTransitionVariants(simulateAction(row(6, {
      3: [{ type: "spaceBridge", id: "red" }],
      4: [{ type: "spaceBridge", id: "red" }]
    }), { x: 0, y: 0, facing: "E" }, FORWARD, { registerIndex: 0 })).length === 1
  },
  {
    name: "pit stop: without damage both picks become Energy",
    check: () => applyDamageEconomyPitStopPicks(createDamageEconomyState(), 2) === 2
  },
  {
    name: "pit stop: holding damage, the picks discard it",
    check: () => {
      const state = createDamageEconomyState();
      state.spamTotal = 1.2;
      state.spamHeld = 1.2;
      return applyDamageEconomyPitStopPicks(state, 2) === 0 && state.spamTotal < 0.1;
    }
  },
  {
    name: "pit stop: the search credits two Energy",
    check: () => energyStep(row(2, { 0: pitStop }), 0).pitStopEnergyGain === 2
  },
  {
    name: "pit stop: the course ledger credits only the Energy picks",
    check: () => energyStep(row(2, { 0: pitStop }), 0, { pitStopEnergyPicks: 1 }).pitStopEnergyGain === 1 &&
      energyStep(row(2, { 0: pitStop }), 1).pitStopEnergyGain === 0
  },
  {
    name: "fire pit: the lock ends with the turn",
    check: () => {
      const result = playForward(row(12, { 1: firePit }), 10);
      return result.xs === "1,2,3,4,4,5,6,7,8,9" && result.cancelled === "5";
    }
  }
];

let failures = 0;
for (const testCase of cases) {
  let pass = false;
  try {
    pass = testCase.check();
  } catch (error) {
    console.log(`ERROR ${testCase.name}: ${error.message}`);
  }
  console.log(`${pass ? "PASS" : "FAIL"} ${testCase.name}`);
  if (!pass) failures += 1;
}

console.log(failures
  ? `\n${failures} Transformers verification case(s) failed.`
  : `\nAll ${cases.length} Transformers verification cases passed.`);
process.exitCode = failures ? 1 : 0;
