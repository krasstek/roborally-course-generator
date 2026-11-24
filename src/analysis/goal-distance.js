// Robo Rally Course Randomizer - wall-aware distance to a leg's target, the
// leg search's aim (route-speed study 2026-11-20).
//
// A backward walk from the target over board squares that respects walls,
// buildings, pits and board edges (canMoveBetween). The leg search orders its
// queue by cost so far + this distance x 5 instead of the straight-line
// distance x 5: same greed, but it no longer heads into dead ends behind walls
// or pits. Facing, register phase and board movement (conveyors, portals) are
// not part of the map; a conveyor-aware map found better routes but searched
// long legs near belts more slowly (study, ROADMAP §0 Speed).
//
// One map per tile map, target square and edge rule; built on first use
// (well under a millisecond) and shared by every start and search pass.
import { canMoveBetween } from "./movement.js";
import { DIRS, ROTATION_ORDER } from "./constants.js";
import { tileKey } from "./board-geometry.js";

const GOAL_DISTANCE_MAPS = new WeakMap();

function buildWalkingDistanceMap(tileMap, target, options) {
  const distances = new Map([[tileKey(target.x, target.y), 0]]);
  let frontier = [{ x: target.x, y: target.y }];
  let distance = 0;
  while (frontier.length) {
    distance += 1;
    const next = [];
    for (const square of frontier) {
      for (const dir of ROTATION_ORDER) {
        const { dx, dy } = DIRS[dir];
        const from = { x: square.x - dx, y: square.y - dy };
        const key = tileKey(from.x, from.y);
        if (distances.has(key) || !tileMap.has(key)) continue;
        const move = canMoveBetween(tileMap, from, square, dir, options);
        if (!move?.ok || move.crash) continue;
        distances.set(key, distance);
        next.push(from);
      }
    }
    frontier = next;
  }
  return distances;
}

// Walking squares from point to target, or null when the target cannot be
// walked to from there (only a conveyor, portal or the like gets there).
export function getWalkingDistanceToTarget(tileMap, point, target, options = {}) {
  if (!tileMap || !point || !target) return null;
  let byTarget = GOAL_DISTANCE_MAPS.get(tileMap);
  if (!byTarget) {
    byTarget = new Map();
    GOAL_DISTANCE_MAPS.set(tileMap, byTarget);
  }
  const key = `${target.x},${target.y}|${options.lessDeadlyGame ? 1 : 0}`;
  let distances = byTarget.get(key);
  if (!distances) {
    distances = buildWalkingDistanceMap(tileMap, target, options);
    byTarget.set(key, distances);
  }
  return distances.get(tileKey(point.x, point.y)) ?? null;
}

// Registers to go from (square, facing) to a target square (board-aim study
// 2026-11-23): every card action of the active deck from every square and
// facing, simulated once per register timing with the real movement code
// (board elements included, timing taken as the most favourable), reboots
// dropped; then a backward breadth-first search from the target (any facing),
// one register per step. A lower bound on the registers a route needs. Built
// once per tile map (~0.4 s on the desktop for a large course), each target
// once. Used by scripts/build-card-table.mjs; planned for checkpoint building
// with routing (ROADMAP Route search 2, step 4).
import { simulateAction } from "./movement.js";
import { getProgramDeckActions } from "./program-availability.js";
const REGISTER_EDGES = new WeakMap();
const REGISTER_DISTANCE_MAPS = new WeakMap();
function buildRegisterEdges(tileMap, options) {
  const reverse = new Map();
  const actions = getProgramDeckActions(options);
  for (const tile of tileMap.values()) {
    for (const facing of ROTATION_ORDER) {
      const from = `${tile.x},${tile.y},${facing}`;
      const seen = new Set();
      for (let registerIndex = 0; registerIndex < 5; registerIndex += 1) {
        for (const action of actions) {
          let transition = null;
          try {
            transition = simulateAction(tileMap, { x: tile.x, y: tile.y, facing }, action, { ...options, registerIndex });
          } catch {
            continue;
          }
          if (!transition || transition.rebooted || !transition.to || !Number.isFinite(transition.to.x)) continue;
          const key = `${transition.to.x},${transition.to.y},${transition.to.facing}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!reverse.has(key)) reverse.set(key, []);
          reverse.get(key).push(from);
        }
      }
    }
  }
  return reverse;
}
export function getRegisterDistanceToTarget(tileMap, point, target, options = {}) {
  if (!tileMap || !point || !target) return null;
  let reverse = REGISTER_EDGES.get(tileMap);
  if (!reverse) { reverse = buildRegisterEdges(tileMap, options); REGISTER_EDGES.set(tileMap, reverse); }
  let byTarget = REGISTER_DISTANCE_MAPS.get(tileMap);
  if (!byTarget) { byTarget = new Map(); REGISTER_DISTANCE_MAPS.set(tileMap, byTarget); }
  const targetKey = `${target.x},${target.y}`;
  let dist = byTarget.get(targetKey);
  if (!dist) {
    dist = new Map();
    let frontier = ROTATION_ORDER.map((facing) => `${target.x},${target.y},${facing}`);
    for (const key of frontier) dist.set(key, 0);
    let level = 0;
    while (frontier.length) {
      level += 1;
      const next = [];
      for (const v of frontier) for (const u of reverse.get(v) ?? []) if (!dist.has(u)) { dist.set(u, level); next.push(u); }
      frontier = next;
    }
    byTarget.set(targetKey, dist);
  }
  return dist.get(`${point.x},${point.y},${point.facing}`) ?? null;
}
