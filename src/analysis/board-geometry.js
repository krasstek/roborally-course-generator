// Robo Rally Course Randomizer - board geometry: tiles, walls, board elements, register timing, portals and ledges
import { OPPOSITE, REGISTER_COUNT } from "./constants.js";

// v48zv: wall/red-wall/green-wall blocking across a directed adjacent boundary
// is pure board geometry. Pressure scoring and actual movement ask the same
// question repeatedly on physical-cache misses, so memoize that board-local
// boolean per tileMap without putting goal/recovery/register state into the key.
export const BOUNDARY_WALL_BLOCK_CACHE = new WeakMap();

export function tileKey(x, y) {
  return `${x},${y}`;
}

export function stateKey(state) {
  return `${state.x},${state.y},${state.facing ?? "E"}`;
}

export function cloneState(state) {
  return {
    x: state.x,
    y: state.y,
    facing: state.facing ?? "E"
  };
}

export function getWalls(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type === "wall") {
      for (const side of feature.sides || []) {
        walls.add(side);
      }
    }
  }

  return walls;
}

export function hasEdgeFeature(tile, type, side) {
  return (tile?.features || []).some((feature) => (
    feature.type === type &&
    (feature.sides || []).includes(side)
  ));
}

export function isBoundaryBlockedByWalls(tileMap, from, to, dir) {
  let cache = BOUNDARY_WALL_BLOCK_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    BOUNDARY_WALL_BLOCK_CACHE.set(tileMap, cache);
  }
  // All callers pass the adjacent square implied by dir, so from+dir uniquely
  // identifies this directed board boundary within a tileMap. Cache both true
  // and false results; undefined alone means the boundary has not been checked.
  const cacheKey = `${from.x},${from.y},${dir}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const toTile = tileMap.get(tileKey(to.x, to.y));
  const opposite = OPPOSITE[dir];

  // Ordinary walls remain fully bidirectional and independent of any
  // red/green overlay markers.
  const fromWalls = getWalls(fromTile);
  const toWalls = getWalls(toTile);
  let blocked = fromWalls.has(dir) || toWalls.has(opposite);

  if (!blocked) {
    const redFrom = hasEdgeFeature(fromTile, "redWall", dir);
    const redTo = hasEdgeFeature(toTile, "redWall", opposite);
    const greenFrom = hasEdgeFeature(fromTile, "greenWall", dir);

    // A red wall by itself is an ordinary wall. A matching green edge on the
    // opposite tile only opens travel from GREEN -> RED across that exact border.
    blocked = redFrom || (redTo && !greenFrom);
  }

  // Green alone contributes no blocking effect. greenTo only matters when
  // paired with redFrom, which is already blocked in this direction.
  cache.set(cacheKey, blocked);
  return blocked;
}

export function getBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

export function getRepulsor(tile, side) {
  return (tile?.features || []).find((feature) => (
    feature.type === "repulsor" &&
    (feature.sides || []).includes(side)
  )) ?? null;
}

export function getRamps(tile) {
  return (tile?.features || []).filter((feature) => feature.type === "ramp");
}

export function getGear(tile) {
  return (tile?.features || []).find((feature) => feature.type === "gear") ?? null;
}

export function getPushes(tile) {
  const pushes = [];
  const seen = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "push" || !feature.dir || seen.has(feature.dir)) {
      continue;
    }

    pushes.push(feature);
    seen.add(feature.dir);
  }

  return pushes;
}

export function hasExplicitTiming(feature) {
  return Array.isArray(feature?.timing) && feature.timing.length > 0;
}

export function getRegisterNumber(options = {}) {
  if (!Number.isInteger(options.registerIndex)) return null;
  const normalized = ((options.registerIndex % REGISTER_COUNT) + REGISTER_COUNT) % REGISTER_COUNT;
  return normalized + 1;
}

export function hasKnownRegisterTiming(options = {}) {
  return getRegisterNumber(options) !== null;
}

export function isFeatureActiveThisRegister(feature, options = {}) {
  if (!hasExplicitTiming(feature)) return true;
  const registerNumber = getRegisterNumber(options);
  return registerNumber !== null && feature.timing.includes(registerNumber);
}

export function hasActiveFeature(tile, type, options = {}) {
  return (tile?.features || []).some((feature) => (
    feature.type === type && isFeatureActiveThisRegister(feature, options)
  ));
}

// v49fo hot path: Trapdoor and Randomizer are the only features that need to be
// interpreted specifically at the start of a programmed register here. Scan the
// tile once for both instead of calling hasActiveFeature() separately for each.
export const REGISTER_START_FEATURE_TRAPDOOR = 1;
export const REGISTER_START_FEATURE_RANDOMIZER = 2;
export function getRegisterStartFeatureMask(tile, options = {}) {
  let mask = 0;
  for (const feature of tile?.features || []) {
    let bit = 0;
    if (feature.type === "trapdoor") bit = REGISTER_START_FEATURE_TRAPDOOR;
    else if (feature.type === "randomizer") bit = REGISTER_START_FEATURE_RANDOMIZER;
    else continue;
    if (isFeatureActiveThisRegister(feature, options)) {
      mask |= bit;
      if (mask === (REGISTER_START_FEATURE_TRAPDOOR | REGISTER_START_FEATURE_RANDOMIZER)) {
        break;
      }
    }
  }
  return mask;
}

export function getFeatureDutyCycle(feature, fallback = 1) {
  if (!hasExplicitTiming(feature)) return fallback;
  return Math.max(0, Math.min(1, new Set(feature.timing).size / REGISTER_COUNT));
}

export function hasHomingMissile(tile) {
  return (tile?.features || []).some((feature) => feature.type === "homingMissile");
}

export function getPortal(tile) {
  return (tile?.features || []).find((feature) => feature.type === "portal") ?? null;
}

export function getTeleporter(tile) {
  return (tile?.features || []).find((feature) => feature.type === "teleporter") ?? null;
}

export function isOil(tile) {
  return (tile?.features || []).some((feature) => feature.type === "oil");
}

export function isWater(tile) {
  return (tile?.features || []).some((feature) => feature.type === "water");
}

export function isCurrent(tile) {
  return (tile?.features || []).some((feature) => (
    feature.type === "water" || feature.type === "radioactiveWaste"
  ));
}

export function isPit(tile) {
  return (tile?.features || []).some((feature) => feature.type === "pit");
}

export function getLedgeSides(tile) {
  const sides = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "ledge") continue;
    for (const side of feature.sides || []) {
      sides.add(side);
    }
  }

  return sides;
}

export function hasRampForDir(tile, dir) {
  return getRamps(tile).some((feature) => feature.dir === dir);
}

export function crossesLedgeBoundary(fromTile, toTile, dir) {
  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);
  return fromLedges.has(dir) || toLedges.has(OPPOSITE[dir]);
}

export function getLedgeElevationDelta(fromTile, toTile, dir) {
  let delta = 0;

  if (getLedgeSides(fromTile).has(dir)) {
    delta += 1;
  }
  if (getLedgeSides(toTile).has(OPPOSITE[dir])) {
    delta -= 1;
  }

  return delta;
}

export function buildPortalMap(tileMap) {
  const portalMap = new Map();

  for (const tile of tileMap.values()) {
    const portal = getPortal(tile);
    if (!portal?.id) {
      continue;
    }

    if (!portalMap.has(portal.id)) {
      portalMap.set(portal.id, []);
    }

    portalMap.get(portal.id).push({ x: tile.x, y: tile.y });
  }

  return portalMap;
}
