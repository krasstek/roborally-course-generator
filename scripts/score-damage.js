import { analyzeCourse, scoreFlagArea } from "../analyze.js";
import {
  getDamageDeckPressureMultipliers,
  getTilePenaltyForFeature
} from "../feature-weights.js";

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

function summarizePressure(id, options) {
  const multipliers = getDamageDeckPressureMultipliers(options);
  return `${id.padEnd(18)} | hazard ${multipliers.hazard.toFixed(3)} | robot ${multipliers.robotTraffic.toFixed(3)} | reboot ${multipliers.reboot.toFixed(3)}`;
}

function summarizeFeature(id, feature, options) {
  const penalty = getTilePenaltyForFeature(feature, {
    batteryActive: true,
    cuttingFloor: options.cuttingFloor,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown
  });
  return `${id.padEnd(18)} | ${feature.type.padEnd(12)} | tilePenalty ${penalty}`;
}

function summarizeRoute(id, options) {
  const tileMap = buildRectTileMap(5, 8, [
    { x: 2, y: 6, features: [{ type: "laser", dir: "N", damage: 2 }] },
    { x: 2, y: 4, features: [{ type: "flamethrower", dir: "N", timing: [2, 4] }] },
    { x: 2, y: 2, features: [{ type: "crusher", timing: [3] }] }
  ]);
  const starts = [start(1, 7), start(2, 7), start(3, 7), start(2, 6)];
  const goal = { x: 2, y: 0 };
  const analysis = analyzeCourse(tileMap, starts, goal, {
    playerCount: 4,
    maxRoutes: 4,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown
  });

  return `${id.padEnd(18)} | avgTraffic ${analysis.summary.averageTrafficPenalty} | avgLateral ${analysis.summary.averageLateralThreat ?? 0} | avgRear ${analysis.summary.averageRearThreat ?? 0} | openingDiff ${analysis.summary.difficultyScore}`;
}

function summarizeFlagArea(id, options) {
  const tileMap = buildRectTileMap(5, 5, [
    { x: 2, y: 2, features: [{ type: "checkpoint", id: 1 }] },
    { x: 2, y: 1, features: [{ type: "laser", dir: "S", damage: 2 }] },
    { x: 1, y: 2, features: [{ type: "flamethrower", dir: "E", timing: [2, 4] }] },
    { x: 3, y: 2, features: [{ type: "crusher", timing: [3] }] }
  ]);
  const value = scoreFlagArea(tileMap, { x: 2, y: 2 }, {
    playerCount: 4,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown
  });

  return `${id.padEnd(18)} | flagArea ${value}`;
}

const variants = [
  { id: "baseline", options: {} },
  { id: "lessSpammy", options: { lessSpammyGame: true } },
  { id: "criticalSpam", options: { criticalSpam: true } },
  { id: "criticalHaywire", options: { criticalHaywire: true } },
  { id: "permOnly", options: { permanentShutdown: true } },
  { id: "spam+perm", options: { criticalSpam: true, permanentShutdown: true } },
  { id: "haywire+spam", options: { criticalSpam: true, criticalHaywire: true } }
];

console.log("PRESSURE");
variants.forEach(({ id, options }) => console.log(summarizePressure(id, options)));
console.log("");

console.log("FEATURES");
for (const { id, options } of variants) {
  console.log(summarizeFeature(id, { type: "laser", dir: "N", damage: 2 }, options));
  console.log(summarizeFeature(`${id}: flame`, { type: "flamethrower", dir: "N", timing: [2, 4] }, options));
}
console.log("");

console.log("FLAG AREA");
variants.forEach(({ id, options }) => console.log(summarizeFlagArea(id, options)));
console.log("");

console.log("ROUTE");
variants.forEach(({ id, options }) => console.log(summarizeRoute(id, options)));
