import { simulateAction } from "../analyze.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

function buildTileMap(tiles) {
  const map = new Map();

  for (const tile of tiles) {
    map.set(tileKey(tile.x, tile.y), {
      x: tile.x,
      y: tile.y,
      features: tile.features ?? []
    });
  }

  return map;
}

function belt(x, y, dir, speed = 1, turn) {
  return {
    x,
    y,
    features: [{
      type: "belt",
      dir,
      speed,
      ...(turn ? { turn } : {})
    }]
  };
}

function wall(x, y, sides) {
  return {
    x,
    y,
    features: [{ type: "wall", sides }]
  };
}

function tile(x, y, features = []) {
  return { x, y, features };
}

function portal(x, y, id) {
  return {
    x,
    y,
    features: [{ type: "portal", id }]
  };
}

function teleporter(x, y, power = 2) {
  return {
    x,
    y,
    features: [{ type: "teleporter", power }]
  };
}

function gear(x, y, rotation) {
  return {
    x,
    y,
    features: [{ type: "gear", rotation }]
  };
}

function crusher(x, y) {
  return {
    x,
    y,
    features: [{ type: "crusher", timing: [1] }]
  };
}

function runCase(testCase) {
  const tileMap = buildTileMap(testCase.tiles);
  const portalMap = new Map();

  for (const tile of tileMap.values()) {
    for (const feature of tile.features || []) {
      if (feature.type !== "portal" || !feature.id) {
        continue;
      }
      if (!portalMap.has(feature.id)) {
        portalMap.set(feature.id, []);
      }
      portalMap.get(feature.id).push({ x: tile.x, y: tile.y });
    }
  }

  const result = simulateAction(
    tileMap,
    testCase.start,
    testCase.action,
    {
      ...(testCase.options ?? {}),
      portalMap
    }
  );

  const actual = {
    x: result.to.x,
    y: result.to.y,
    facing: result.to.facing,
    turnedSteps: (result.conveyorSteps || []).filter((step) => step.turned).length,
    rebooted: Boolean(result.rebooted)
  };

  const expected = testCase.expected;
  const pass = actual.x === expected.x &&
    actual.y === expected.y &&
    actual.facing === expected.facing &&
    actual.turnedSteps === expected.turnedSteps &&
    actual.rebooted === (expected.rebooted ?? false);

  return { pass, actual, expected, result };
}

function runSequenceCase(testCase) {
  const tileMap = buildTileMap(testCase.tiles);
  const portalMap = new Map();
  let state = testCase.start;
  const transitions = [];

  for (const action of testCase.actions) {
    const result = simulateAction(tileMap, state, action, {
      ...(testCase.options ?? {}),
      portalMap
    });
    transitions.push(result);
    state = result.to;
  }

  const actual = {
    x: state.x,
    y: state.y,
    facing: state.facing,
    path: transitions.flatMap((transition) => transition.traversed.map((point) => `${point.x},${point.y}`))
  };

  const expected = testCase.expected;
  const pass = actual.x === expected.x &&
    actual.y === expected.y &&
    actual.facing === expected.facing &&
    JSON.stringify(actual.path) === JSON.stringify(expected.path);

  return { pass, actual, expected, transitions };
}

const WAIT = { id: "WAIT", type: "wait" };
const FORWARD = { id: "FORWARD", type: "move", relative: "forward", steps: 1 };
const BACK = { id: "BACK", type: "move", relative: "back", steps: 1 };
const FORWARD_3 = { id: "FORWARD_3", type: "move", relative: "forward", steps: 3 };

const cases = [
  {
    name: "left turn rotates ccw when entering from belt-relative left side",
    tiles: [
      belt(0, 0, "E"),
      belt(1, 0, "N", 1, "left")
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "W", turnedSteps: 1 }
  },
  {
    name: "left bend does not rotate when carried off the bend",
    tiles: [
      belt(0, 0, "N", 1, "left"),
      tile(0, -1)
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 0, y: -1, facing: "N", turnedSteps: 0 }
  },
  {
    name: "left turn does not rotate when entering from belt-relative right side",
    tiles: [
      belt(2, 0, "W"),
      belt(1, 0, "N", 1, "left")
    ],
    start: { x: 2, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "N", turnedSteps: 0 }
  },
  {
    name: "fast conveyor through a right bend rotates on bend entry",
    tiles: [
      belt(0, 0, "W", 2),
      belt(-1, 0, "N", 2, "right"),
      tile(-1, -1)
    ],
    start: { x: 0, y: 0, facing: "W" },
    action: WAIT,
    expected: { x: -1, y: -1, facing: "N", turnedSteps: 1 }
  },
  {
    name: "both turn rotates clockwise from belt-relative right side",
    tiles: [
      belt(2, 0, "W"),
      belt(1, 0, "N", 1, "both")
    ],
    start: { x: 2, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "E", turnedSteps: 1 }
  },
  {
    name: "manual movement onto a turn belt does not rotate on entry",
    tiles: [
      tile(0, 0),
      belt(1, 0, "N", 1, "left"),
      wall(1, 0, ["N"])
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD,
    expected: { x: 1, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "manual movement resolves before conveyor phases",
    tiles: [
      tile(-1, 0),
      belt(0, 0, "E"),
      tile(1, 0)
    ],
    start: { x: -1, y: 0, facing: "E" },
    action: FORWARD,
    expected: { x: 1, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "fast conveyor resolves before regular conveyor",
    tiles: [
      belt(0, 0, "E", 2),
      belt(1, 0, "E"),
      tile(2, 0)
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 2, y: 0, facing: "N", turnedSteps: 0 }
  },
  {
    name: "water conveyor resolves after regular non-water conveyor phase",
    tiles: [
      tile(0, 0, [
        { type: "belt", dir: "E", speed: 1 },
        { type: "water" }
      ]),
      belt(1, 0, "E"),
      tile(2, 0)
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "N", turnedSteps: 0 }
  },
  {
    name: "backup onto right bend exits along bend direction without exit rotation",
    tiles: [
      tile(0, 0),
      belt(-1, 0, "W"),
      belt(-2, 0, "N", 1, "right"),
      tile(-2, 1, [
        { type: "belt", dir: "E", speed: 1, turn: "right" }
      ]),
      tile(-1, 1)
    ],
    start: { x: -2, y: 0, facing: "N" },
    action: BACK,
    expected: { x: -1, y: 1, facing: "N", turnedSteps: 0 }
  },
  {
    name: "belt without turn does not rotate on corner entry",
    tiles: [
      belt(0, 0, "E"),
      belt(1, 0, "N")
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "N", turnedSteps: 0 }
  },
  {
    name: "portal redirects conveyor arrival to matching portal tile",
    tiles: [
      belt(0, 0, "E"),
      {
        x: 1,
        y: 0,
        features: [
          { type: "belt", dir: "N", speed: 1 },
          { type: "portal", id: "A" }
        ]
      },
      portal(3, 2, "A")
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: 3, y: 2, facing: "N", turnedSteps: 0 }
  },
  {
    name: "teleporter applies its extra jump from the start tile on manual move",
    tiles: [
      teleporter(0, 0, 2),
      tile(3, 0)
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD,
    expected: { x: 3, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "conveyors do not trigger repulsors",
    tiles: [
      belt(0, 0, "E"),
      {
        x: 1,
        y: 0,
        features: [{ type: "repulsor", sides: ["W"] }]
      }
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: WAIT,
    expected: { x: 1, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "repulsor blocks entry and bounces a one-step move backward",
    tiles: [
      tile(-1, 0),
      tile(0, 0),
      {
        x: 1,
        y: 0,
        features: [{ type: "repulsor", sides: ["W"] }]
      }
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD,
    expected: { x: -1, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "repulsor consumes remaining multi-step movement after bounce",
    tiles: [
      tile(-3, 0),
      tile(-2, 0),
      tile(-1, 0),
      tile(0, 0),
      {
        x: 1,
        y: 0,
        features: [{ type: "repulsor", sides: ["W"] }]
      }
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD_3,
    expected: { x: -3, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "pushes still trigger repulsors",
    tiles: [
      tile(-1, 0),
      {
        x: 0,
        y: 0,
        features: [{ type: "push", dir: "E", timing: [1] }]
      },
      {
        x: 1,
        y: 0,
        features: [{ type: "repulsor", sides: ["W"] }]
      }
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    expected: { x: -1, y: 0, facing: "N", turnedSteps: 0 }
  },
  {
    name: "repulsor on the source edge also bounces backward",
    tiles: [
      tile(-1, 0),
      {
        x: 0,
        y: 0,
        features: [{ type: "repulsor", sides: ["E"] }]
      },
      tile(1, 0)
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD,
    expected: { x: -1, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "repulsor overdrive doubles backward bounce distance",
    tiles: [
      tile(-2, 0),
      tile(-1, 0),
      tile(0, 0),
      {
        x: 1,
        y: 0,
        features: [{ type: "repulsor", sides: ["W"] }]
      }
    ],
    start: { x: 0, y: 0, facing: "E" },
    action: FORWARD,
    options: {
      repulsorOverdrive: true
    },
    expected: { x: -2, y: 0, facing: "E", turnedSteps: 0 }
  },
  {
    name: "gear resolves before crusher on the same tile",
    tiles: [
      {
        x: 0,
        y: 0,
        features: [
          { type: "gear", rotation: "cw" },
          { type: "crusher", timing: [1] }
        ]
      },
      tile(5, 5)
    ],
    start: { x: 0, y: 0, facing: "N" },
    action: WAIT,
    options: {
      recoveryRule: "reboot_tokens",
      boardRects: [{ index: 0, x: 0, y: 0, width: 1, height: 1 }],
      rebootTokens: [{ boardIndex: 0, x: 5, y: 5 }]
    },
    expected: { x: 5, y: 5, facing: "E", turnedSteps: 0, rebooted: true }
  }
];

const sequenceCases = [
  {
    name: "west conveyor turn then backup onto east-exiting bend does not continue south",
    tiles: [
      tile(2, 1),
      belt(1, 1, "W"),
      belt(0, 1, "N", 1, "right"),
      belt(0, 2, "E", 1, "right"),
      belt(1, 2, "N")
    ],
    start: { x: 2, y: 1, facing: "W" },
    actions: [FORWARD, BACK],
    expected: {
      x: 1,
      y: 2,
      facing: "N",
      path: ["1,1", "0,1", "0,2", "1,2"]
    }
  }
];

let failures = 0;

for (const testCase of cases) {
  const outcome = runCase(testCase);

  if (outcome.pass) {
    console.log(`PASS ${testCase.name}`);
    continue;
  }

  failures += 1;
  console.error(`FAIL ${testCase.name}`);
  console.error(`  expected: ${JSON.stringify(outcome.expected)}`);
  console.error(`  actual:   ${JSON.stringify(outcome.actual)}`);
}

for (const testCase of sequenceCases) {
  const outcome = runSequenceCase(testCase);

  if (outcome.pass) {
    console.log(`PASS ${testCase.name}`);
    continue;
  }

  failures += 1;
  console.error(`FAIL ${testCase.name}`);
  console.error(`  expected: ${JSON.stringify(outcome.expected)}`);
  console.error(`  actual:   ${JSON.stringify(outcome.actual)}`);
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`\n${failures} movement verification case(s) failed.`);
} else {
  console.log(`\nAll ${cases.length + sequenceCases.length} movement verification cases passed.`);
}
