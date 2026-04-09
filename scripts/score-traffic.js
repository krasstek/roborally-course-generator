import { analyzeCourse } from "../analyze.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

function buildRectTileMap(width, height, extraTiles = []) {
  const map = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      map.set(tileKey(x, y), { x, y, features: [] });
    }
  }

  for (const tile of extraTiles) {
    map.set(tileKey(tile.x, tile.y), {
      x: tile.x,
      y: tile.y,
      features: tile.features ?? []
    });
  }

  return map;
}

function start(x, y, facing = "N") {
  return { x, y, facing };
}

function summarizeStart(analysis) {
  if (!analysis.reachable || !analysis.selectedRoute) {
    return `start #${analysis.index + 1} unreachable`;
  }

  return [
    `start #${analysis.index + 1}`,
    `score ${analysis.adjustedScore}`,
    `raw ${analysis.bestScore}`,
    `traffic ${analysis.trafficPenalty}`,
    `overlap ${analysis.overlapPenalty}`,
    `lateral ${analysis.lateralThreat}`,
    `rear ${analysis.rearThreat ?? 0}`,
    `scale ${analysis.trafficScale ?? 0}`,
    `actions ${analysis.bestActions}`,
    `distance ${analysis.bestDistance}`
  ].join(" | ");
}

const cases = [
  {
    id: "open-3-of-8",
    description: "Three players across eight open dock starts.",
    playerCount: 3,
    starts: Array.from({ length: 8 }, (_, index) => start(index, 7, "N")),
    goal: { x: 3, y: 0 },
    tileMap: buildRectTileMap(8, 8)
  },
  {
    id: "open-7-of-8",
    description: "Seven players across the same eight open dock starts.",
    playerCount: 7,
    starts: Array.from({ length: 8 }, (_, index) => start(index, 7, "N")),
    goal: { x: 3, y: 0 },
    tileMap: buildRectTileMap(8, 8)
  },
  {
    id: "lateral-corridor",
    description: "Four players forced through a narrow middle corridor.",
    playerCount: 4,
    starts: [start(1, 7), start(2, 7), start(4, 7), start(5, 7)],
    goal: { x: 3, y: 0 },
    tileMap: buildRectTileMap(7, 8, [
      { x: 0, y: 3, features: [{ type: "wall", sides: ["E"] }] },
      { x: 1, y: 3, features: [{ type: "wall", sides: ["W"] }] },
      { x: 5, y: 3, features: [{ type: "wall", sides: ["E"] }] },
      { x: 6, y: 3, features: [{ type: "wall", sides: ["W"] }] }
    ])
  },
  {
    id: "rear-lane",
    description: "Four players in a shared vertical lane toward the same goal.",
    playerCount: 4,
    starts: [start(1, 7), start(1, 6), start(1, 5), start(1, 4)],
    goal: { x: 1, y: 0 },
    tileMap: buildRectTileMap(3, 8)
  }
];

for (const testCase of cases) {
  const analysis = analyzeCourse(testCase.tileMap, testCase.starts, testCase.goal, {
    playerCount: testCase.playerCount,
    maxRoutes: 4
  });

  console.log(`CASE ${testCase.id}`);
  console.log(testCase.description);
  console.log(
    `summary | reachable ${analysis.summary.reachableStarts}/${analysis.summary.totalStarts}` +
    ` | avgTraffic ${analysis.summary.averageTrafficPenalty}` +
    ` | avgOverlap ${analysis.summary.averageOverlapPenalty ?? 0}` +
    ` | avgLateral ${analysis.summary.averageLateralThreat ?? 0}` +
    ` | avgRear ${analysis.summary.averageRearThreat ?? 0}` +
    ` | fairness ${analysis.summary.fairnessScore}`
  );

  for (const startAnalysis of analysis.starts) {
    console.log(`  ${summarizeStart(startAnalysis)}`);
  }

  console.log("");
}
