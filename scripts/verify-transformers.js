// Checks for the Transformers rules beyond movement (verify-movement.js covers
// movement): robot lasers and buildings, jump ramps and fire pits.
import { getDamageEconomyRealizedDamageForTransition } from "../src/analysis/damage-economy.js";
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
