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
