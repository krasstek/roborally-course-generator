const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { rotatedDimensions },
  {
    FLAG_APPROACH_WEIGHTS,
    getDamageDeckPressureMultipliers,
    getFlagAreaFeatureScore,
    getTilePenaltyForFeature
  }
] = await Promise.all([
  import(versionedPath("./board.js")),
  import(versionedPath("./feature-weights.js"))
]);

// This module is a route-evaluation model for board setup, not a full RoboRally
// simulator. It resolves movement-shaping effects that materially change route
// topology, while many late-phase hazards are intentionally represented as
// penalties instead of exact register-by-register gameplay.

const DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};

const OPPOSITE = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};

const ACTIONS = [
  { id: "WAIT", type: "wait" },
  { id: "FORWARD", type: "move", relative: "forward" },
  { id: "FORWARD_2", type: "move", relative: "forward", steps: 2 },
  { id: "FORWARD_3", type: "move", relative: "forward", steps: 3 },
  { id: "BACK", type: "move", relative: "back" },
  { id: "LEFT", type: "turn", rotation: "ccw" },
  { id: "RIGHT", type: "turn", rotation: "cw" },
  { id: "UTURN", type: "turn", rotation: "uturn" }
];

const ROTATION_ORDER = ["N", "E", "S", "W"];
const EDGE_BEHAVIOR = "pit";
const REBOOT_DAMAGE_PENALTY = 8;
const MORE_DEADLY_REBOOT_DAMAGE_PENALTY = 12;
const REGISTER_TEMPO_COST = 6.4;
const REBOOT_AVERAGE_LOST_REGISTERS = 2;
// Reboots also jump the route to an archive/reboot token. This small extra cost
// mirrors portal/teleporter readability friction without re-counting damage or tempo.
const REBOOT_DISCONTINUITY_PENALTY = 3;
const HAND_DRAW_SIZE = 9;
const REGISTER_COUNT = 5;
const PROGRAM_CARD_COUNTS = new Map([
  ["FORWARD", 4],
  ["FORWARD_2", 3],
  ["FORWARD_3", 1],
  ["RIGHT", 4],
  ["LEFT", 4],
  ["UTURN", 1],
  ["BACK", 1],
  ["WAIT", 1]
]);
const AGAIN_CARD_COUNT = 1;
const AGAIN_USE_PENALTY = 11;
const ROUTE_PATH_KEY_CACHE = new WeakMap();
const ROUTE_TILE_SET_CACHE = new WeakMap();
const ROUTE_EDGE_SET_CACHE = new WeakMap();
const ROUTE_DIRECTIONS_CACHE = new WeakMap();
const LINE_OF_SIGHT_CACHE = new WeakMap();
const ROUTE_SIMILARITY_CACHE = new Map();
const OVERLAP_PENALTY_CACHE = new Map();
const LATERAL_THREAT_CACHE = new Map();
const REAR_THREAT_CACHE = new Map();
const ONCOMING_TRAFFIC_CACHE = new Map();
const ROUTE_PAIR_CACHE_LIMIT = 2500;

class MinHeap {
  constructor(score) {
    this.items = [];
    this.score = score;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    let index = items.length;
    items.push(value);

    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentValue = items[parent];
      if (this.score(parentValue) <= this.score(value)) {
        break;
      }
      items[index] = parentValue;
      index = parent;
    }

    items[index] = value;
  }

  pop() {
    const items = this.items;
    if (!items.length) {
      return null;
    }

    const root = items[0];
    const last = items.pop();
    if (!items.length) {
      return root;
    }

    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) {
        break;
      }

      if (child + 1 < items.length && this.score(items[child + 1]) < this.score(items[child])) {
        child += 1;
      }

      if (this.score(last) <= this.score(items[child])) {
        break;
      }

      items[index] = items[child];
      index = child;
    }

    items[index] = last;
    return root;
  }
}

function setBoundedCacheValue(cache, key, value, limit = ROUTE_PAIR_CACHE_LIMIT) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= limit) {
    cache.delete(cache.keys().next().value);
  }

  cache.set(key, value);
}

export function clearAnalysisCaches() {
  ROUTE_SIMILARITY_CACHE.clear();
  OVERLAP_PENALTY_CACHE.clear();
  LATERAL_THREAT_CACHE.clear();
  REAR_THREAT_CACHE.clear();
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function stateKey(state) {
  return `${state.x},${state.y},${state.facing ?? "E"}`;
}

function cloneState(state) {
  return {
    x: state.x,
    y: state.y,
    facing: state.facing ?? "E"
  };
}

function getWalls(tile) {
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

function hasEdgeFeature(tile, type, side) {
  return (tile?.features || []).some((feature) => (
    feature.type === type &&
    (feature.sides || []).includes(side)
  ));
}

function isBoundaryBlockedByWalls(tileMap, from, to, dir) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const toTile = tileMap.get(tileKey(to.x, to.y));
  const opposite = OPPOSITE[dir];

  // Ordinary walls remain fully bidirectional and independent of any
  // red/green overlay markers.
  const fromWalls = getWalls(fromTile);
  const toWalls = getWalls(toTile);
  if (fromWalls.has(dir) || toWalls.has(opposite)) {
    return true;
  }

  const redFrom = hasEdgeFeature(fromTile, "redWall", dir);
  const redTo = hasEdgeFeature(toTile, "redWall", opposite);
  const greenFrom = hasEdgeFeature(fromTile, "greenWall", dir);
  const greenTo = hasEdgeFeature(toTile, "greenWall", opposite);

  // A red wall by itself is an ordinary wall. A matching green edge on the
  // opposite tile only opens travel from GREEN -> RED across that exact border.
  if (redFrom) {
    return true;
  }
  if (redTo && !greenFrom) {
    return true;
  }

  // Green alone contributes no blocking effect. greenTo only matters when
  // paired with redFrom, which is already blocked in this direction.
  return false;
}

function getBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

function getRepulsor(tile, side) {
  return (tile?.features || []).find((feature) => (
    feature.type === "repulsor" &&
    (feature.sides || []).includes(side)
  )) ?? null;
}

function getRamps(tile) {
  return (tile?.features || []).filter((feature) => feature.type === "ramp");
}

function getGear(tile) {
  return (tile?.features || []).find((feature) => feature.type === "gear") ?? null;
}

function getPushes(tile) {
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

function hasCrusher(tile) {
  return (tile?.features || []).some((feature) => feature.type === "crusher");
}

function hasTrapdoor(tile) {
  return (tile?.features || []).some((feature) => feature.type === "trapdoor");
}

function hasExplicitTiming(feature) {
  return Array.isArray(feature?.timing) && feature.timing.length > 0;
}

function getFeatureDutyCycle(feature, fallback = 1) {
  if (!hasExplicitTiming(feature)) return fallback;
  return Math.max(0, Math.min(1, new Set(feature.timing).size / REGISTER_COUNT));
}

function hasUntimedFeature(tile, type) {
  return (tile?.features || []).some((feature) => (
    feature.type === type && !hasExplicitTiming(feature)
  ));
}

function hasHomingMissile(tile) {
  return (tile?.features || []).some((feature) => feature.type === "homingMissile");
}

function getPortal(tile) {
  return (tile?.features || []).find((feature) => feature.type === "portal") ?? null;
}

function getTeleporter(tile) {
  return (tile?.features || []).find((feature) => feature.type === "teleporter") ?? null;
}

function isOil(tile) {
  return (tile?.features || []).some((feature) => feature.type === "oil");
}

function isWater(tile) {
  return (tile?.features || []).some((feature) => feature.type === "water");
}

function isPit(tile) {
  return (tile?.features || []).some((feature) => feature.type === "pit");
}

function getLedgeSides(tile) {
  const sides = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "ledge") continue;
    for (const side of feature.sides || []) {
      sides.add(side);
    }
  }

  return sides;
}

function hasRampForDir(tile, dir) {
  return getRamps(tile).some((feature) => feature.dir === dir);
}

function crossesLedgeBoundary(fromTile, toTile, dir) {
  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);
  return fromLedges.has(dir) || toLedges.has(OPPOSITE[dir]);
}

function getLedgeElevationDelta(fromTile, toTile, dir) {
  let delta = 0;

  if (getLedgeSides(fromTile).has(dir)) {
    delta += 1;
  }
  if (getLedgeSides(toTile).has(OPPOSITE[dir])) {
    delta -= 1;
  }

  return delta;
}

function buildPortalMap(tileMap) {
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

function getBoardRectForPoint(point, boardRects = []) {
  return boardRects.find((rect) => (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )) ?? null;
}

function getRebootTokenForPoint(point, boardRects = [], rebootTokens = []) {
  const boardRect = getBoardRectForPoint(point, boardRects);
  if (!boardRect) {
    return null;
  }

  return rebootTokens.find((token) => token.boardIndex === boardRect.index) ?? null;
}

function getHomeRebootChoices(rebootTokens = []) {
  return rebootTokens.flatMap((token) => (
    ROTATION_ORDER.map((facing) => ({
      x: token.x,
      y: token.y,
      facing
    }))
  ));
}

function getHomeRebootTokensForStart(start, rebootTokens = []) {
  const startKeyValue = tileKey(start.x, start.y);
  return rebootTokens.filter((token) => (token.startKeys || []).includes(startKeyValue));
}

function getRebootDamagePenalty(options = {}) {
  const basePenalty = options.moreDeadlyGame ? MORE_DEADLY_REBOOT_DAMAGE_PENALTY : REBOOT_DAMAGE_PENALTY;
  return Number((basePenalty * getDamageDeckPressureMultipliers(options).reboot).toFixed(2));
}

function getRegisterPosition(actionCount) {
  return ((Math.max(1, actionCount) - 1) % REGISTER_COUNT) + 1;
}

function getRebootRoutePenalty(actionCount = null) {
  const lostRegisters = Number.isFinite(actionCount)
    ? REGISTER_COUNT - getRegisterPosition(actionCount)
    : REBOOT_AVERAGE_LOST_REGISTERS;

  return Number((lostRegisters * REGISTER_TEMPO_COST + REBOOT_DISCONTINUITY_PENALTY).toFixed(2));
}

function isBatteryActive(options = {}) {
  return !options.lighterGame;
}

function getTilePenalty(tile, options = {}) {
  let penalty = 0;

  // Feature penalties are used to approximate local danger/value for route
  // scoring. This intentionally captures many board effects without turning the
  // analyzer into a full combat or timing simulator.
  for (const feature of tile?.features || []) {
    // Randomizers affect the card played only when the robot STARTS a register
    // on the space. Traversing or merely ending the current movement on one
    // does not alter the current register.
    if (feature.type === "randomizer" && !options.randomizerAtRegisterStart) {
      continue;
    }
    if (
      feature.type === "radiation" ||
      feature.type === "radioactiveWaste" ||
      feature.type === "repairDock" ||
      (hasExplicitTiming(feature) && (
        feature.type === "push" ||
        feature.type === "crusher" ||
        feature.type === "trapdoor"
      ))
    ) {
      continue;
    }

    penalty += getTilePenaltyForFeature(feature, {
      batteryActive: isBatteryActive(options),
      rebootDamagePenalty: getRebootDamagePenalty(options),
      playerCount: options.playerCount,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown
    });
  }

  return penalty;
}

function isExposedToPitOrEdge(tileMap, point, dir, options = {}) {
  const fromTile = tileMap.get(tileKey(point.x, point.y));
  const next = {
    x: point.x + DIRS[dir].dx,
    y: point.y + DIRS[dir].dy
  };
  const toTile = tileMap.get(tileKey(next.x, next.y));
  if (isBoundaryBlockedByWalls(tileMap, point, next, dir)) {
    return false;
  }

  if (!toTile && options.lessDeadlyGame) {
    return false;
  }

  return !toTile || isPit(toTile);
}

function getPitPressurePenalty(tileMap, point, options = {}) {
  let penalty = 0;

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToPitOrEdge(tileMap, point, dir, options)) {
      continue;
    }

    penalty += 0.5;
  }

  return Number(penalty.toFixed(2));
}

function isExposedToLedge(tileMap, point, dir, options = {}) {
  const fromTile = tileMap.get(tileKey(point.x, point.y));
  const next = {
    x: point.x + DIRS[dir].dx,
    y: point.y + DIRS[dir].dy
  };
  const toTile = tileMap.get(tileKey(next.x, next.y));

  if (!fromTile || !toTile) {
    return false;
  }

  const move = canMoveBetween(tileMap, point, next, dir, options);
  return move.ok && (move.ledgeDamage || 0) > 0;
}

function getLedgePressurePenalty(tileMap, point, options = {}) {
  let penalty = 0;

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToLedge(tileMap, point, dir, options)) {
      continue;
    }

    penalty += 0.3;
  }

  return Number(penalty.toFixed(2));
}

function directionBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  for (const [dir, delta] of Object.entries(DIRS)) {
    if (delta.dx === dx && delta.dy === dy) {
      return dir;
    }
  }

  return null;
}

function canMoveBetween(tileMap, from, to, dir, options = {}) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const repulsorActive = options.repulsorActive ?? true;

  if (!fromTile) {
    return { ok: false, crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame, offBoard: true };
  }

  const toTile = tileMap.get(tileKey(to.x, to.y));
  const fromRepulsor = getRepulsor(fromTile, dir);
  const toRepulsor = getRepulsor(toTile, OPPOSITE[dir]);

  if (!toTile) {
    return {
      ok: false,
      crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame,
      offBoard: true
    };
  }

  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);

  if (repulsorActive && (fromRepulsor || toRepulsor)) {
    return {
      ok: false,
      crash: false,
      offBoard: false,
      repulsor: true
    };
  }

  if (isBoundaryBlockedByWalls(tileMap, from, to, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  if (fromLedges.has(dir) && !hasRampForDir(fromTile, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  if (isPit(toTile)) {
    return { ok: false, crash: true, offBoard: false };
  }

  return {
    ok: true,
    crash: false,
    offBoard: false,
    ledgeDamage: toLedges.has(OPPOSITE[dir]) && !hasRampForDir(toTile, OPPOSITE[dir])
      ? (isWater(toTile) ? 1 : 2)
      : 0,
    rampAscent: fromLedges.has(dir) && hasRampForDir(fromTile, dir)
  };
}

function resolvePortalDestination(tileMap, point, portalMap) {
  const tile = tileMap.get(tileKey(point.x, point.y));
  const portal = getPortal(tile);
  if (!portal?.id) {
    return null;
  }

  const siblings = portalMap.get(portal.id) || [];
  const destination = siblings.find((candidate) => (
    candidate.x !== point.x || candidate.y !== point.y
  ));

  return destination ?? null;
}

function slideOnOil(tileMap, state, dir, options = {}) {
  const traversed = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  const workingState = cloneState(state);

  while (isOil(tileMap.get(tileKey(workingState.x, workingState.y)))) {
    const step = moveOneStep(tileMap, workingState, dir, "oil", options);
    traversed.push(...step.traversed);
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        blocked: step.blocked,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;

    if (!isOil(tileMap.get(tileKey(workingState.x, workingState.y)))) {
      break;
    }
  }

  return {
    state: workingState,
    traversed,
    conveyorSteps: [],
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    blocked: false,
    rebooted: false
  };
}

function mergeStepOutcome(base, extra) {
  return {
    state: extra.state,
    rebootChoices: extra.rebootChoices ?? base.rebootChoices,
    blocked: extra.blocked,
    crashed: extra.crashed,
    rebooted: extra.rebooted,
    traversed: [...base.traversed, ...extra.traversed],
    conveyorSteps: [...(base.conveyorSteps || []), ...(extra.conveyorSteps || [])],
    hazard: base.hazard + extra.hazard,
    rebootPenalty: (base.rebootPenalty || 0) + (extra.rebootPenalty || 0),
    distance: base.distance + extra.distance,
    forcedDistance: base.forcedDistance + extra.forcedDistance
  };
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function rotateFacing(facing, rotation) {
  const index = ROTATION_ORDER.indexOf(facing ?? "E");
  if (index === -1) return facing ?? "E";
  if (rotation === "cw") {
    return ROTATION_ORDER[(index + 1) % ROTATION_ORDER.length];
  }
  if (rotation === "ccw") {
    return ROTATION_ORDER[(index + ROTATION_ORDER.length - 1) % ROTATION_ORDER.length];
  }
  if (rotation === "uturn") {
    return ROTATION_ORDER[(index + 2) % ROTATION_ORDER.length];
  }
  return facing ?? "E";
}

function movementDir(facing, relative) {
  if (relative === "forward") {
    return facing ?? "E";
  }

  if (relative === "back") {
    return rotateFacing(facing ?? "E", "uturn");
  }

  return facing ?? "E";
}

function getBeltTurnRotation(belt, entrySide) {
  if (!belt?.dir || !entrySide) {
    return null;
  }

  const leftEntry = rotateFacing(belt.dir, "ccw");
  const rightEntry = rotateFacing(belt.dir, "cw");

  if ((belt.turn === "left" || belt.turn === "both") && entrySide === leftEntry) {
    return "ccw";
  }

  if ((belt.turn === "right" || belt.turn === "both") && entrySide === rightEntry) {
    return "cw";
  }

  return null;
}

function applyEndOfStepRotation(tileMap, state) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const gear = getGear(tile);

  if (!gear) {
    return cloneState(state);
  }

  return {
    ...cloneState(state),
    facing: rotateFacing(state.facing, gear.rotation)
  };
}

function moveOneStep(tileMap, state, dir, mode, options = {}, moveBudget = null) {
  const delta = DIRS[dir];
  const next = {
    x: state.x + delta.dx,
    y: state.y + delta.dy
  };
  const moveCheck = canMoveBetween(tileMap, state, next, dir, {
    ...options,
    repulsorActive: mode === "manual" || mode === "push"
  });

  if (mode === "manual" && moveCheck.ok && moveCheck.rampAscent && moveBudget !== null && moveBudget < 2) {
    return {
      state: cloneState(state),
      blocked: false,
      crashed: false,
      rebooted: false,
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      spentMove: true,
      rampAscent: true
    };
  }

  if (!moveCheck.ok) {
    if (moveCheck.repulsor) {
      const reverseDir = OPPOSITE[dir];
      const workingState = cloneState(state);
      const traversed = [];
      let hazard = 0;
      let rebootPenalty = 0;
      let distance = 0;
      let forcedDistance = 0;
      const repulsorPushDistance = mode === "manual"
        ? Math.max(1, moveBudget ?? 1)
        : 1;
      const repulsorPushDistanceScaled = options.repulsorOverdrive
        ? repulsorPushDistance * 2
        : repulsorPushDistance;

      for (let index = 0; index < repulsorPushDistanceScaled; index += 1) {
        const bounce = moveOneStep(tileMap, workingState, reverseDir, "repulsor", options);
        traversed.push(...bounce.traversed);
        hazard += bounce.hazard;
        rebootPenalty += bounce.rebootPenalty || 0;
        distance += bounce.distance;
        forcedDistance += bounce.forcedDistance;

        if (bounce.crashed || bounce.blocked || bounce.rebooted) {
          return {
            state: bounce.state,
            rebootChoices: bounce.rebootChoices ?? null,
            blocked: bounce.blocked,
            crashed: bounce.crashed,
            rebooted: bounce.rebooted,
            traversed,
            conveyorSteps: [],
            hazard,
            rebootPenalty,
            distance,
            forcedDistance,
            spentMove: true,
            repulsed: true,
            rampAscent: false
          };
        }

        workingState.x = bounce.state.x;
        workingState.y = bounce.state.y;
        workingState.facing = bounce.state.facing;
      }

      const repulsorOutcome = {
        state: workingState,
        blocked: false,
        crashed: false,
        rebooted: false,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        spentMove: true,
        repulsed: true,
        rampAscent: false
      };
      return distance > 0 && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
        ? { ...mergeStepOutcome(repulsorOutcome, slideOnOil(tileMap, workingState, reverseDir, options)), repulsed: true }
        : repulsorOutcome;
    }

    const rebootToken = moveCheck.crash && options.recoveryRule === "reboot_tokens"
      ? getRebootTokenForPoint(
        moveCheck.offBoard ? { x: state.x, y: state.y } : { x: next.x, y: next.y },
        options.boardRects,
        options.rebootTokens
      )
      : null;

    if (rebootToken) {
      return {
        state: {
          x: rebootToken.x,
          y: rebootToken.y,
          facing: state.facing
        },
        rebootChoices: ROTATION_ORDER.map((facing) => ({
          x: rebootToken.x,
          y: rebootToken.y,
          facing
        })),
        blocked: false,
        crashed: false,
        rebooted: true,
        traversed: [{ x: next.x, y: next.y }],
        conveyorSteps: [],
        hazard: getRebootDamagePenalty(options),
        rebootPenalty: getRebootRoutePenalty(),
        distance: 1,
        forcedDistance: mode === "belt" || mode === "push" || mode === "repulsor" ? 1 : 0,
        spentMove: true,
        rampAscent: false
      };
    }

    return {
      state: cloneState(state),
      blocked: !moveCheck.crash,
      crashed: moveCheck.crash,
      rebooted: false,
      traversed: moveCheck.crash ? [{ x: next.x, y: next.y }] : [],
      conveyorSteps: [],
      hazard: moveCheck.crash ? 25 : 0,
      rebootPenalty: 0,
      distance: moveCheck.crash ? 1 : 0,
      forcedDistance: (mode === "belt" || mode === "push" || mode === "repulsor") && moveCheck.crash ? 1 : 0,
      spentMove: true,
      rampAscent: false
    };
  }

  const currentTile = tileMap.get(tileKey(state.x, state.y));
  const nextTile = tileMap.get(tileKey(next.x, next.y));
  const belt = getBelt(nextTile);
  const portalMap = options.portalMap ?? new Map();
  let nextFacing = state.facing;
  let turned = false;

  if (mode === "belt" && belt) {
    const entrySide = OPPOSITE[dir];
    const beltTurnRotation = getBeltTurnRotation(belt, entrySide);
    nextFacing = beltTurnRotation ? rotateFacing(state.facing, beltTurnRotation) : state.facing;
    turned = Boolean(beltTurnRotation);
  }

  const resolvedState = {
    x: next.x,
    y: next.y,
    facing: nextFacing ?? state.facing
  };
  const portalDestination = resolvePortalDestination(tileMap, resolvedState, portalMap);

  if (portalDestination) {
    resolvedState.x = portalDestination.x;
    resolvedState.y = portalDestination.y;
  }

  const traversed = [{ x: next.x, y: next.y }];
  if (portalDestination) {
    traversed.push({ x: portalDestination.x, y: portalDestination.y, jump: true });
  }

  const outcome = {
    state: resolvedState,
    blocked: false,
    crashed: false,
    rebooted: false,
    traversed,
    conveyorSteps: mode === "belt" ? [{
      from: { x: state.x, y: state.y },
      to: { x: next.x, y: next.y },
      dir,
      speed: belt?.speed ?? 1,
      turned,
      facingBefore: state.facing,
      facingAfter: resolvedState.facing
    }] : [],
    hazard: getTilePenalty(nextTile, options) +
      (hasHomingMissile(nextTile)
        ? (tileMap.get(tileKey(state.x, state.y))?.x !== nextTile?.x || tileMap.get(tileKey(state.x, state.y))?.y !== nextTile?.y
          ? getTilePenaltyForFeature({ type: "homingMissile" }, { onEntrance: true, playerCount: options.playerCount })
          : 0)
        : 0) +
      getPitPressurePenalty(tileMap, resolvedState, options) +
      getLedgePressurePenalty(tileMap, resolvedState, options) +
      (moveCheck.ledgeDamage || 0),
    rebootPenalty: 0,
    distance: 1,
    forcedDistance: mode === "belt" || mode === "oil" || mode === "push" || mode === "repulsor" ? 1 : 0,
    spentMove: true,
    rampAscent: Boolean(moveCheck.rampAscent)
  };

  return outcome;
}

function getSignedMoveDistance(action) {
  if (action.type !== "move") {
    return 0;
  }

  const steps = Math.max(1, action.steps ?? 1);
  return action.relative === "back" ? -steps : steps;
}

function resolveCrashOrReboot(tileMap, state, destination, traversed, options = {}, distance = 0, mode = "manual") {
  const rebootToken = options.recoveryRule === "reboot_tokens"
    ? getRebootTokenForPoint(
      tileMap.get(tileKey(destination.x, destination.y))
        ? destination
        : { x: state.x, y: state.y },
      options.boardRects,
      options.rebootTokens
    )
    : null;
  const homeRebootChoices = options.recoveryRule === "home_reboot"
    ? getHomeRebootChoices(options.rebootTokens)
    : null;

  if (rebootToken || homeRebootChoices?.length) {
    const rebootDestination = rebootToken
      ? { x: rebootToken.x, y: rebootToken.y }
      : homeRebootChoices[0];
    return {
      state: {
        x: rebootDestination.x,
        y: rebootDestination.y,
        facing: state.facing
      },
      rebootChoices: rebootToken
        ? ROTATION_ORDER.map((facing) => ({
          x: rebootToken.x,
          y: rebootToken.y,
          facing
        }))
        : homeRebootChoices,
      blocked: false,
      crashed: false,
      rebooted: true,
      traversed,
      conveyorSteps: [],
      hazard: getRebootDamagePenalty(options),
      rebootPenalty: getRebootRoutePenalty(),
      distance,
      forcedDistance: mode === "belt" || mode === "push" ? distance : 0,
      spentMove: true,
      rampAscent: false
    };
  }

  return {
    state: cloneState(state),
    blocked: false,
    crashed: true,
    rebooted: false,
    traversed,
    conveyorSteps: [],
    hazard: 25,
    rebootPenalty: 0,
    distance,
    forcedDistance: (mode === "belt" || mode === "push") ? distance : 0,
    spentMove: true,
    rampAscent: false
  };
}

function resolveTeleporterMove(tileMap, state, action, options = {}) {
  const teleporter = getTeleporter(tileMap.get(tileKey(state.x, state.y)));
  if (!teleporter || action.type !== "move") {
    return null;
  }

  const signedDistance = getSignedMoveDistance(action) + (teleporter.power ?? 2);
  if (signedDistance === 0) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      blocked: false,
      rebooted: false
    };
  }

  const dir = signedDistance > 0
    ? movementDir(state.facing, "forward")
    : movementDir(state.facing, "back");
  const steps = Math.abs(signedDistance);
  const destination = {
    x: state.x + DIRS[dir].dx * steps,
    y: state.y + DIRS[dir].dy * steps
  };
  const traversed = [{ x: destination.x, y: destination.y, jump: true }];
  const destinationTile = tileMap.get(tileKey(destination.x, destination.y));

  if (!destinationTile || isPit(destinationTile)) {
    return resolveCrashOrReboot(tileMap, state, destination, traversed, options, steps);
  }

  const resolvedState = {
    x: destination.x,
    y: destination.y,
    facing: state.facing
  };
  const outcome = {
    state: resolvedState,
    blocked: false,
    crashed: false,
    rebooted: false,
    traversed,
    conveyorSteps: [],
    hazard: getTilePenalty(destinationTile, options) +
      getPitPressurePenalty(tileMap, resolvedState, options) +
      getLedgePressurePenalty(tileMap, resolvedState, options),
    rebootPenalty: 0,
    distance: steps,
    forcedDistance: 0,
    spentMove: true,
    rampAscent: false
  };

  if (isOil(destinationTile)) {
    return mergeStepOutcome(outcome, slideOnOil(tileMap, resolvedState, dir, options));
  }

  return outcome;
}

function resolveConveyorPhase(tileMap, state, eligibleSpeed, options = {}) {
  const workingState = cloneState(state);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  const maxSteps = eligibleSpeed === 2 ? 2 : 1;
  let stepsTaken = 0;
  let lastMoveDir = null;

  while (stepsTaken < maxSteps) {
    const tile = tileMap.get(tileKey(workingState.x, workingState.y));
    const belt = getBelt(tile);
    const waterOnly = Boolean(options.waterOnly);

    if (!belt || belt.speed !== eligibleSpeed) {
      break;
    }
    if (waterOnly && !isWater(tile)) {
      break;
    }
    if (!waterOnly && eligibleSpeed === 1 && isWater(tile)) {
      break;
    }

    const step = moveOneStep(tileMap, workingState, belt.dir, "belt", options);
    lastMoveDir = belt.dir;
    traversed.push(...step.traversed);
    conveyorSteps.push(...(step.conveyorSteps || []));
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;
    stepsTaken += 1;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps,
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;
  }

  const conveyorOutcome = {
    state: workingState,
    traversed,
    conveyorSteps,
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    rebooted: false
  };
  return stepsTaken > 0 && lastMoveDir && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
    ? mergeStepOutcome(conveyorOutcome, slideOnOil(tileMap, workingState, lastMoveDir, options))
    : conveyorOutcome;
}

function resolvePushPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const pushes = getPushes(tile).filter((push) => !hasExplicitTiming(push));

  if (!pushes.length) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: false
    };
  }

  const workingState = cloneState(state);
  const traversed = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;

  for (const push of pushes) {
    let step = moveOneStep(tileMap, workingState, push.dir, "push", options);
    if (!step.crashed && !step.blocked && !step.rebooted && step.distance > 0 && !step.repulsed && isOil(tileMap.get(tileKey(step.state.x, step.state.y)))) {
      step = mergeStepOutcome(step, slideOnOil(tileMap, step.state, push.dir, options));
    }
    traversed.push(...step.traversed);
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted
      };
    }

    workingState.x = step.state.x;
    workingState.y = step.state.y;
    workingState.facing = step.state.facing;
  }

  return {
    state: workingState,
    traversed,
    conveyorSteps: [],
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed: false,
    rebooted: false
  };
}

function resolveCrusherPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));

  if (!hasUntimedFeature(tile, "crusher") && !hasUntimedFeature(tile, "trapdoor")) {
    return {
      state: cloneState(state),
      traversed: [],
      conveyorSteps: [],
      hazard: 0,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: false
    };
  }

  if (hasUntimedFeature(tile, "trapdoor")) {
    return {
      state: cloneState(state),
      traversed: [{ x: state.x, y: state.y }],
      conveyorSteps: [],
      hazard: 30,
      rebootPenalty: 0,
      distance: 0,
      forcedDistance: 0,
      crashed: true,
      rebooted: false
    };
  }

  const rebootToken = options.recoveryRule === "reboot_tokens"
    ? getRebootTokenForPoint(state, options.boardRects, options.rebootTokens)
    : null;

  if (rebootToken) {
    return {
      state: {
        x: rebootToken.x,
        y: rebootToken.y,
        facing: state.facing
      },
      rebootChoices: ROTATION_ORDER.map((facing) => ({
        x: rebootToken.x,
        y: rebootToken.y,
        facing
      })),
      traversed: [{ x: state.x, y: state.y }],
      conveyorSteps: [],
      hazard: getRebootDamagePenalty(options),
      rebootPenalty: getRebootRoutePenalty(),
      distance: 0,
      forcedDistance: 0,
      crashed: false,
      rebooted: true
    };
  }

  return {
    state: cloneState(state),
    traversed: [{ x: state.x, y: state.y }],
    conveyorSteps: [],
    hazard: 25,
    rebootPenalty: 0,
    distance: 0,
    forcedDistance: 0,
    crashed: true,
    rebooted: false
  };
}

function hasFeatureType(tile, type) {
  return (tile?.features || []).some((feature) => feature.type === type);
}

function getTimedHazardSeverity(feature, options = {}) {
  if (!feature?.type) return 0;
  if (feature.type === "flamethrower") return 5.2;
  if (feature.type === "push") return 3.2;
  if (feature.type === "crusher") return 8.5;
  if (feature.type === "trapdoor") return 9.5;
  if (feature.type === "radiation") return 4.5;
  return 0;
}

function getTimedHazardClusterPenalty(tileMap, state, options = {}) {
  const entries = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      const tile = tileMap.get(tileKey(state.x + dx, state.y + dy));
      for (const feature of tile?.features || []) {
        if (!hasExplicitTiming(feature)) continue;
        const severity = getTimedHazardSeverity(feature, options);
        if (severity <= 0) continue;
        entries.push({
          feature,
          severity,
          proximity: dx === 0 && dy === 0 ? 1 : 0.55,
          registers: new Set(feature.timing)
        });
      }
    }
  }

  let penalty = 0;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const shared = [...entries[i].registers].filter((register) => entries[j].registers.has(register)).length;
      if (!shared) continue;
      const correlation = shared / REGISTER_COUNT;
      penalty += (
        Math.min(entries[i].severity, entries[j].severity) *
        correlation *
        entries[i].proximity *
        entries[j].proximity *
        0.32
      );
    }
  }
  return Number(penalty.toFixed(2));
}

function getExpectedTimedPushPenalty(tileMap, state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0 || !feature.dir) return 0;

  const hypothetical = moveOneStep(tileMap, state, feature.dir, "push", options);
  if (hypothetical.crashed || hypothetical.rebooted) {
    return Number((7.5 * duty).toFixed(2));
  }
  if (hypothetical.blocked || hypothetical.distance <= 0) {
    return Number((1.2 * duty).toFixed(2));
  }

  const goal = options.goal;
  if (!goal) return Number((1.6 * duty).toFixed(2));

  const before = heuristic(state, goal);
  const after = heuristic(hypothetical.state, goal);
  const delta = before - after;
  if (delta > 0) {
    // Deliberately exploiting a timed pusher is much less reliable than merely
    // being exposed to it, especially for 1/5 timing.
    const exploitReliability = 0.34 + duty * 0.28;
    return Number((-Math.min(3.4, delta * 1.15) * duty * exploitReliability).toFixed(2));
  }
  return Number((Math.min(3.6, Math.abs(delta) * 1.15 + 1.1) * duty).toFixed(2));
}

function getExpectedTimedCrusherPenalty(tileMap, state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0) return 0;

  const harm = 9.5 * duty;
  const goal = options.goal;
  if (!goal || options.recoveryRule !== "reboot_tokens") {
    return Number(harm.toFixed(2));
  }

  const rebootToken = getRebootTokenForPoint(state, options.boardRects, options.rebootTokens);
  if (!rebootToken) return Number(harm.toFixed(2));

  const shortcut = heuristic(state, goal) - heuristic(rebootToken, goal);
  if (shortcut <= 0) return Number(harm.toFixed(2));

  const exploitReliability = 0.2 + duty * 0.25;
  const exploitCredit = Math.min(6.5, shortcut * 0.9) * duty * exploitReliability;
  return Number((harm - exploitCredit).toFixed(2));
}

function getExpectedTimedTrapdoorPenalty(tileMap, state, feature, options = {}) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0) return 0;

  const harm = 10.5 * duty;
  const goal = options.goal;
  if (!goal || options.recoveryRule !== "reboot_tokens") {
    return Number(harm.toFixed(2));
  }

  const rebootToken = getRebootTokenForPoint(state, options.boardRects, options.rebootTokens);
  if (!rebootToken) return Number(harm.toFixed(2));
  const shortcut = heuristic(state, goal) - heuristic(rebootToken, goal);
  if (shortcut <= 0) return Number(harm.toFixed(2));

  // A timed pit is even harder to exploit precisely than a timed pusher.
  const exploitReliability = 0.16 + duty * 0.22;
  const exploitCredit = Math.min(6, shortcut * 0.8) * duty * exploitReliability;
  return Number((harm - exploitCredit).toFixed(2));
}

function getEndOfRegisterFeaturePenalty(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  if (!tile) return 0;

  let penalty = 0;

  // Radioactive Waste is effectively 5/5: every register spent here hurts,
  // partly offset by the energy/free-upgrade choice.
  if (hasFeatureType(tile, "radioactiveWaste")) {
    penalty += 2.4;
  }

  // Radiation is an end-of-turn effect, but the nominal route register is
  // not trusted. Score its expected 1/5 exposure instead.
  if (hasFeatureType(tile, "radiation")) {
    penalty += 4.5 / REGISTER_COUNT;
  }

  // Repair Stations are an optional rule on ordinary checkpoints, not a
  // standalone board feature. Flag 0 is excluded from the playable checkpoint map.
  if (options.repairStations) {
    const checkpoint = (tile.features || []).find((feature) => feature.type === "checkpoint");
    if (checkpoint && Number(checkpoint.id ?? 1) !== 0) {
      penalty -= (3.4 / REGISTER_COUNT) * 0.82;
    }
  }

  for (const feature of tile.features || []) {
    if (!hasExplicitTiming(feature)) continue;
    if (feature.type === "push") {
      penalty += getExpectedTimedPushPenalty(tileMap, state, feature, options);
    } else if (feature.type === "crusher") {
      penalty += getExpectedTimedCrusherPenalty(tileMap, state, feature, options);
    } else if (feature.type === "trapdoor") {
      penalty += getExpectedTimedTrapdoorPenalty(tileMap, state, feature, options);
    }
  }

  penalty += getTimedHazardClusterPenalty(tileMap, state, options);
  return Number(penalty.toFixed(2));
}

export function simulateAction(tileMap, startState, action, options = {}) {
  const state = cloneState(startState);
  const traversed = [];
  const conveyorSteps = [];
  const boardEvents = [];
  let hazard = getTilePenalty(tileMap.get(tileKey(state.x, state.y)), {
    ...options,
    randomizerAtRegisterStart: true
  });
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  let crashed = false;
  let blocked = false;
  let rebooted = false;
  let rebootChoices = null;

  if (action.type === "turn") {
    state.facing = rotateFacing(state.facing, action.rotation);
  } else if (action.type === "move") {
    const teleported = resolveTeleporterMove(tileMap, state, action, options);
    if (teleported) {
      traversed.push(...teleported.traversed);
      hazard += teleported.hazard;
      rebootPenalty += teleported.rebootPenalty || 0;
      distance += teleported.distance;
      forcedDistance += teleported.forcedDistance || 0;

      if (teleported.crashed || teleported.blocked || teleported.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: teleported.state,
          rebootChoices: teleported.rebootChoices ?? null,
          traversed,
          conveyorSteps,
          hazard,
          rebootPenalty,
          distance,
          forcedDistance,
          crashed: teleported.crashed,
          blocked: teleported.blocked,
          rebooted: teleported.rebooted
        };
      }

      state.x = teleported.state.x;
      state.y = teleported.state.y;
      state.facing = teleported.state.facing;
    } else {
    const startTile = tileMap.get(tileKey(state.x, state.y));
    const onOil = isOil(startTile);
    const onWater = isWater(startTile);
    let remainingSteps = Math.max(0, (action.steps ?? 1) - (
      (onOil ? 1 : 0) +
      (action.relative === "forward" && onWater ? 1 : 0)
    ));
    const manualMoveDir = movementDir(state.facing, action.relative);
    const manualDistanceBefore = distance;

    while (remainingSteps > 0) {
      const step = moveOneStep(tileMap, state, movementDir(state.facing, action.relative), "manual", options, remainingSteps);
      traversed.push(...step.traversed);
      hazard += step.hazard;
      rebootPenalty += step.rebootPenalty || 0;
      distance += step.distance;
      forcedDistance += step.forcedDistance || 0;

      if (step.crashed || step.blocked || step.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: step.state,
          rebootChoices: step.rebootChoices ?? null,
          traversed,
          conveyorSteps,
          hazard,
          rebootPenalty,
          distance,
          forcedDistance,
          crashed: step.crashed,
          blocked: step.blocked,
          rebooted: step.rebooted
        };
      }

      state.x = step.state.x;
      state.y = step.state.y;
      state.facing = step.state.facing;
      if (step.repulsed) {
        break;
      }
      remainingSteps -= 1 + (step.rampAscent ? 1 : 0);
    }

    if (distance > manualDistanceBefore && isOil(tileMap.get(tileKey(state.x, state.y)))) {
      const oilStart = cloneState(state);
      const oilSlide = slideOnOil(tileMap, state, manualMoveDir, options);
      traversed.push(...oilSlide.traversed);
      hazard += oilSlide.hazard;
      rebootPenalty += oilSlide.rebootPenalty || 0;
      distance += oilSlide.distance;
      forcedDistance += oilSlide.forcedDistance || 0;
      state.x = oilSlide.state.x;
      state.y = oilSlide.state.y;
      state.facing = oilSlide.state.facing;
      if (oilSlide.distance > 0) {
        boardEvents.push({
          type: "oil",
          from: oilStart,
          to: cloneState(oilSlide.state),
          dir: manualMoveDir,
          distance: oilSlide.distance
        });
      }
      if (oilSlide.crashed || oilSlide.blocked || oilSlide.rebooted) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: oilSlide.state,
          rebootChoices: oilSlide.rebootChoices ?? null,
          traversed, conveyorSteps, hazard, rebootPenalty, distance, forcedDistance,
          crashed: oilSlide.crashed, blocked: oilSlide.blocked, rebooted: oilSlide.rebooted
        };
      }
    }
    }
  }

  const blue = resolveConveyorPhase(tileMap, state, 2, options);
  traversed.push(...blue.traversed);
  conveyorSteps.push(...blue.conveyorSteps);
  boardEvents.push(...(blue.conveyorSteps || []).map((step) => ({
    type: "conveyor",
    ...step
  })));
  hazard += blue.hazard;
  rebootPenalty += blue.rebootPenalty || 0;
  distance += blue.distance;
  forcedDistance += blue.forcedDistance;
  crashed = blue.crashed;
  rebooted = blue.rebooted;
  rebootChoices = blue.rebootChoices ?? rebootChoices;
  state.x = blue.state.x;
  state.y = blue.state.y;
  state.facing = blue.state.facing;

  if (!crashed && !rebooted) {
    const green = resolveConveyorPhase(tileMap, state, 1, options);
    traversed.push(...green.traversed);
    conveyorSteps.push(...green.conveyorSteps);
    boardEvents.push(...(green.conveyorSteps || []).map((step) => ({
      type: "conveyor",
      ...step
    })));
    hazard += green.hazard;
    rebootPenalty += green.rebootPenalty || 0;
    distance += green.distance;
    forcedDistance += green.forcedDistance;
    crashed = green.crashed;
    rebooted = green.rebooted;
    rebootChoices = green.rebootChoices ?? rebootChoices;
    state.x = green.state.x;
    state.y = green.state.y;
    state.facing = green.state.facing;
  }

  if (!crashed && !rebooted) {
    const waterGreen = resolveConveyorPhase(tileMap, state, 1, { ...options, waterOnly: true });
    traversed.push(...waterGreen.traversed);
    conveyorSteps.push(...waterGreen.conveyorSteps);
    boardEvents.push(...(waterGreen.conveyorSteps || []).map((step) => ({
      type: "conveyor",
      ...step
    })));
    hazard += waterGreen.hazard;
    rebootPenalty += waterGreen.rebootPenalty || 0;
    distance += waterGreen.distance;
    forcedDistance += waterGreen.forcedDistance;
    crashed = waterGreen.crashed;
    rebooted = waterGreen.rebooted;
    rebootChoices = waterGreen.rebootChoices ?? rebootChoices;
    state.x = waterGreen.state.x;
    state.y = waterGreen.state.y;
    state.facing = waterGreen.state.facing;
  }

  if (!crashed && !rebooted) {
    const pushStart = cloneState(state);
    const pushed = resolvePushPhase(tileMap, state, options);
    traversed.push(...pushed.traversed);
    hazard += pushed.hazard;
    rebootPenalty += pushed.rebootPenalty || 0;
    distance += pushed.distance;
    forcedDistance += pushed.forcedDistance;
    crashed = pushed.crashed;
    rebooted = pushed.rebooted;
    rebootChoices = pushed.rebootChoices ?? rebootChoices;
    state.x = pushed.state.x;
    state.y = pushed.state.y;
    state.facing = pushed.state.facing;
    if (pushed.distance > 0) {
      boardEvents.push({
        type: "pusher",
        from: pushStart,
        to: cloneState(pushed.state),
        distance: pushed.distance
      });
    }
  }

  let gearTurned = false;
  if (!crashed && !rebooted) {
    const facingBeforeGear = state.facing;
    const rotated = applyEndOfStepRotation(tileMap, state);
    gearTurned = rotated.facing !== facingBeforeGear;
    state.x = rotated.x;
    state.y = rotated.y;
    state.facing = rotated.facing;
    if (gearTurned) {
      boardEvents.push({
        type: "gear",
        at: { x: state.x, y: state.y },
        facingBefore: facingBeforeGear,
        facingAfter: state.facing
      });
    }
  }

  if (!crashed && !rebooted) {
    const crushed = resolveCrusherPhase(tileMap, state, options);
    traversed.push(...crushed.traversed);
    hazard += crushed.hazard;
    rebootPenalty += crushed.rebootPenalty || 0;
    distance += crushed.distance;
    forcedDistance += crushed.forcedDistance;
    crashed = crushed.crashed;
    rebooted = crushed.rebooted;
    rebootChoices = crushed.rebootChoices ?? rebootChoices;
    state.x = crushed.state.x;
    state.y = crushed.state.y;
    state.facing = crushed.state.facing;
  }

  if (!crashed && !rebooted) {
    hazard += getEndOfRegisterFeaturePenalty(tileMap, state, options);
  }

  return {
    action: action.id,
    from: cloneState(startState),
    to: state,
    rebootChoices,
    traversed,
    conveyorSteps,
    boardEvents,
    gearTurned,
    hazard,
    rebootPenalty,
    distance,
    forcedDistance,
    crashed,
    blocked,
    rebooted
  };
}

function buildTimeline(transitions, start) {
  const timeline = [{ x: start.x, y: start.y }];

  for (const transition of transitions) {
    for (const point of transition.traversed) {
      timeline.push({ x: point.x, y: point.y });
    }

    if (transition.rebooted) {
      timeline.push({ x: transition.to.x, y: transition.to.y, jump: true });
    } else if (transition.traversed.length === 0) {
      timeline.push({ x: transition.to.x, y: transition.to.y });
    }
  }

  return timeline;
}

function getActionPenalty(action, options = {}) {
  if (action.id === "WAIT") return options.lighterGame ? REGISTER_TEMPO_COST + 1.5 : REGISTER_TEMPO_COST - 0.25;
  if (action.id === "FORWARD") return REGISTER_TEMPO_COST;
  if (action.id === "FORWARD_2") return REGISTER_TEMPO_COST + 0.35;
  if (action.id === "FORWARD_3") return REGISTER_TEMPO_COST + 0.85;
  if (action.id === "LEFT" || action.id === "RIGHT") return REGISTER_TEMPO_COST + 0.45;
  if (action.id === "BACK") return REGISTER_TEMPO_COST + 1.15;
  if (action.id === "UTURN") return REGISTER_TEMPO_COST + 1.9;
  return REGISTER_TEMPO_COST;
}

function countAction(actions, actionId) {
  return actions.filter((id) => id === actionId).length;
}

function countImmediateRepeats(actions) {
  let count = 0;

  for (let index = 1; index < actions.length; index += 1) {
    if (actions[index] === actions[index - 1]) {
      count += 1;
    }
  }

  return count;
}

function getCardAvailabilityPressure(history, actionId, options = {}) {
  const cardCount = PROGRAM_CARD_COUNTS.get(actionId);
  if (!cardCount) {
    return 0;
  }

  const registerIndex = history.length % REGISTER_COUNT;
  const currentTurnHistory = history.slice(history.length - registerIndex);
  const currentTurnWindow = [...currentTurnHistory, actionId];
  const handWindow = [...history.slice(-(HAND_DRAW_SIZE - 1)), actionId];
  const previousActionId = history.at(-1);
  const immediateRepeatInTurn = registerIndex > 0 && previousActionId === actionId;
  const turnCopies = countAction(currentTurnWindow, actionId);
  const handCopies = countAction(handWindow, actionId);
  const turnNaturalOveruse = Math.max(0, turnCopies - cardCount);
  const usesAgain = immediateRepeatInTurn && turnNaturalOveruse > 0;
  const turnOveruse = Math.max(0, turnCopies - cardCount - (usesAgain ? AGAIN_CARD_COUNT : 0));
  const handOveruse = Math.max(0, handCopies - cardCount - AGAIN_CARD_COUNT);
  const repeatCopies = Math.max(0, handCopies - 1);
  const priorTurnEnd = history.length - registerIndex;
  const priorTurnHistory = registerIndex === 0
    ? history.slice(Math.max(0, priorTurnEnd - REGISTER_COUNT), priorTurnEnd)
    : [];
  const priorTurnCopies = countAction(priorTurnHistory, actionId);
  const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;
  let penalty = 0;

  // Again is a single card. It can copy the previous register inside the same
  // five-register program, but it cannot make register 1 copy register 5 from
  // the previous turn. Multi-copy cards do not need Again just because they are
  // played consecutively.
  if (usesAgain) {
    penalty += AGAIN_USE_PENALTY;
  }

  if (turnOveruse > 0) {
    penalty += turnOveruse * (cardCount === 1 ? 22 : 15);
  }

  if (cardCount === 1 && repeatCopies > 0 && !usesAgain) {
    penalty += 8;
  } else if (cardCount === 3 && repeatCopies > 1) {
    penalty += (repeatCopies - 1) * 1.2;
  }

  if (registerIndex === 0 && priorTurnCopies > 0 && !options.lessForeshadowing) {
    penalty += cardCount === 1
      ? 10
      : Math.max(0, priorTurnCopies - Math.max(1, cardCount - 2)) * 2.5;
  }

  penalty += handOveruse * 7;

  if (actionId === "WAIT" && !options.lighterGame && previousActionId !== actionId) {
    penalty = Math.max(0, penalty - 1.5);
  }

  return Number((penalty * lessForeshadowingFactor).toFixed(2));
}

function weightedDistance(distance, forcedDistance) {
  const manualDistance = Math.max(0, distance - forcedDistance);
  return Number((manualDistance * 0.75 + forcedDistance * 0.55).toFixed(2));
}

function scoreConveyorStep(step, goal) {
  const before = heuristic(step.from, goal);
  const after = heuristic(step.to, goal);
  const progress = before - after;
  let penalty = 0;

  if (progress === 0) {
    penalty += step.speed === 2 ? 0.5 : 0.35;
  } else if (progress < 0) {
    penalty += step.speed === 2 ? 1.3 : 0.9;
  }

  if (step.turned) {
    penalty += progress > 0
      ? (step.speed === 2 ? 0.35 : 0.25)
      : (step.speed === 2 ? 0.8 : 0.55);
  }

  return penalty;
}

function scoreTransitionConveyorComplexity(transition, goal) {
  let score = 0;
  for (const step of transition.conveyorSteps || []) {
    score += scoreConveyorStep(step, goal);
  }
  if (transition.gearTurned) {
    score += 0.55;
  }
  return Number(Math.max(0, score).toFixed(2));
}

function scoreConveyorComplexity(route, goal) {
  let score = 0;

  for (const transition of route.transitions) {
    score += scoreTransitionConveyorComplexity(transition, goal);
  }

  return Number(Math.max(0, score).toFixed(2));
}

function routeTouchesPit(tileMap, route) {
  return route.path.some((point) => isPit(tileMap.get(tileKey(point.x, point.y))));
}

function scoreRoute(route, goal) {
  const scoringGoal = route.hitTarget ?? goal;
  const goalReached = route.finalState.x === scoringGoal.x && route.finalState.y === scoringGoal.y;
  const conveyorComplexity = scoreConveyorComplexity(route, scoringGoal);
  const score = Number.isFinite(route.baseCost)
    ? route.baseCost
    : route.actions * 5 + weightedDistance(route.distance, route.forcedDistance) + route.hazard + route.rebootPenalty + conveyorComplexity;
  const rebootCount = route.transitions.filter((transition) => transition.rebooted).length;

  return {
    actions: route.actions,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    conveyorComplexity,
    hazard: Number(route.hazard.toFixed(2)),
    rebootCount,
    score: Number(score.toFixed(2)),
    goalReached
  };
}

function createQueueEntry(route, goal) {
  return {
    ...route,
    estimate: route.baseCost + heuristic(route.finalState, goal) * 5
  };
}

function reconstructRouteTransitions(route) {
  const transitions = [];
  let current = route;

  while (current?.parent) {
    if (current.transition) {
      transitions.push(current.transition);
    }
    current = current.parent;
  }

  transitions.reverse();
  return transitions;
}

function getDynamicGoalPosition(dynamicGoal, actionCount) {
  const positions = dynamicGoal?.positions;
  if (!Array.isArray(positions) || !positions.length) {
    return null;
  }

  if (actionCount < positions.length) {
    return positions[actionCount];
  }

  if (dynamicGoal.periodStart !== undefined && dynamicGoal.periodLength > 0) {
    const periodStart = dynamicGoal.periodStart;
    const offset = (actionCount - periodStart) % dynamicGoal.periodLength;
    return positions[periodStart + offset] ?? positions.at(-1);
  }

  return positions.at(-1);
}

function getRouteTarget(goal, actionCount, options = {}) {
  return getDynamicGoalPosition(options.dynamicGoal, actionCount) ?? goal;
}

function getDynamicGoalSpace(dynamicGoal, point) {
  const displayPositions = dynamicGoal?.displayPositions ?? dynamicGoal?.positions ?? [];
  const index = displayPositions.findIndex((candidate) => (
    candidate.x === point?.x && candidate.y === point?.y
  ));

  return index >= 0 ? index + 1 : null;
}

function routeReachesGoal(route, goal, options = {}) {
  const target = getRouteTarget(goal, route.actions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

function getSearchStateKey(state, actionCount, options = {}) {
  if (!options.dynamicGoal) {
    return stateKey(state);
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = options.dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@${phase}`;
}

function enumerateRoutes(tileMap, start, goal, options = {}) {
  const dynamicGoalActive = Boolean(options.dynamicGoal);
  const maxRoutes = options.maxRoutes ?? 2;
  const requestedMaxExpansions = options.maxExpansions ?? 30000;
  const maxExpansions = dynamicGoalActive
    ? Math.min(requestedMaxExpansions, options.dynamicGoal?.maxExpansions ?? 8000)
    : requestedMaxExpansions;
  const maxActions = options.dynamicGoal?.maxActions ?? options.maxActions ?? (dynamicGoalActive ? 16 : Infinity);
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap
  };
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostByState = new Map();

  // Startup Spin-Up is a free setup choice, not a programmed turn. Seed one
  // zero-cost root for every legal initial facing into the same search so all
  // facings share the route limit and expansion budget.
  for (const facing of initialFacings) {
    const initialState = {
      x: start.x,
      y: start.y,
      facing
    };
    const initialStateKey = getSearchStateKey(initialState, 0, options);
    bestCostByState.set(initialStateKey, 0);
    queue.push(createQueueEntry({
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      actionHistory: []
    }, goal));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getSearchStateKey(current.finalState, current.actions, options);
    const knownBest = bestCostByState.get(currentStateId);

    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      continue;
    }

    if (routeReachesGoal(current, goal, options)) {
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const hitTarget = getRouteTarget(goal, current.actions, options);
      const hitSpace = getDynamicGoalSpace(options.dynamicGoal, hitTarget);
      const completedRoute = {
        ...current,
        transitions,
        hitTarget
      };
      const routeScore = scoreRoute(completedRoute, goal);
      if ((options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) && routeTouchesPit(tileMap, { path: timeline })) {
        continue;
      }
      completed.push({
        path: timeline,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: options.dynamicGoal
          ? {
            checkpointId: options.dynamicGoal.id ?? null,
            position: hitTarget,
            space: hitSpace,
            actions: current.actions,
            positions: options.dynamicGoal.positions ?? [],
            displayPositions: options.dynamicGoal.displayPositions ?? options.dynamicGoal.positions ?? []
          }
          : null,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) {
      continue;
    }

    for (const action of ACTIONS) {
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal,
        registerIndex: current.actions % REGISTER_COUNT
      });
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const actionPenalty = getActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 0.25 : action.id === "FORWARD_3" ? 0.75 : 0;
      const scarceReusePenalty = getCardAvailabilityPressure(current.actionHistory, action.id, options);
      const conveyorComplexity = scoreTransitionConveyorComplexity(transition, goal);
      const nextActionHistory = [...current.actionHistory, action.id].slice(-9);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(nextActionCount)
          : (transition.rebootPenalty || 0);
        const nextStateKey = getSearchStateKey(destination, nextActionCount, options);
        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        const nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + weightedDistance(transition.distance, transition.forcedDistance) + actionPenalty + reversePenalty + heavyMovePenalty + scarceReusePenalty + conveyorComplexity,
          actionHistory: nextActionHistory
        };

        const priorBest = bestCostByState.get(nextStateKey);
        if (priorBest !== undefined && nextRoute.baseCost >= priorBest - 0.001) {
          continue;
        }

        bestCostByState.set(nextStateKey, nextRoute.baseCost);
        queue.push(createQueueEntry(nextRoute, goal));
      }
    }
  }

  return completed;
}

function getFullCourseDynamicGoal(options = {}, checkpointIndex) {
  return Array.isArray(options.dynamicGoals)
    ? options.dynamicGoals[checkpointIndex] ?? null
    : null;
}

function getFullCourseTarget(flags, checkpointIndex, actionCount, options = {}) {
  const goal = flags[checkpointIndex];
  return getDynamicGoalPosition(getFullCourseDynamicGoal(options, checkpointIndex), actionCount) ?? goal;
}

function fullCourseRouteReachesNextCheckpoint(route, flags, options = {}) {
  const target = getFullCourseTarget(flags, route.checkpointIndex, route.actions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

function getFullCourseSearchStateKey(state, actionCount, checkpointIndex, options = {}) {
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const registerPhase = actionCount % REGISTER_COUNT;
  if (!dynamicGoal) {
    return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}`;
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}@${phase}`;
}

function estimateFullCourseRoute(route, flags, options = {}) {
  if (route.checkpointIndex >= flags.length) {
    return route.baseCost;
  }

  const target = getFullCourseTarget(flags, route.checkpointIndex, route.actions, options);
  let remainingDistance = heuristic(route.finalState, target);
  for (let index = route.checkpointIndex + 1; index < flags.length; index += 1) {
    remainingDistance += heuristic(flags[index - 1], flags[index]);
  }

  return route.baseCost + remainingDistance * 4.6;
}

function createFullCourseQueueEntry(route, flags, options = {}) {
  return {
    ...route,
    estimate: estimateFullCourseRoute(route, flags, options)
  };
}

function makeCheckpointHit(route, flags, options = {}) {
  const checkpointIndex = route.checkpointIndex;
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const hitTarget = getFullCourseTarget(flags, checkpointIndex, route.actions, options);
  return {
    checkpointIndex,
    checkpointId: flags[checkpointIndex]?.id ?? checkpointIndex + 1,
    action: route.actions,
    state: cloneState(route.finalState),
    position: hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? flags[checkpointIndex]?.id ?? checkpointIndex + 1,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: route.actions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    hazard: route.hazard,
    rebootPenalty: route.rebootPenalty,
    baseCost: route.baseCost
  };
}

function enumerateFullCourseRoutes(tileMap, start, flags, options = {}) {
  if (!Array.isArray(flags) || !flags.length) {
    return [];
  }

  const maxRoutes = options.maxRoutes ?? 2;
  const maxActions = options.maxActions ?? Math.max(24, flags.length * 18 + 8);
  const maxExpansions = options.maxExpansions ?? 45000;
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap
  };
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostByState = new Map();

  // As above, Startup Spin-Up is represented by multiple zero-cost roots in
  // one full-course search rather than four separate searches.
  for (const facing of initialFacings) {
    const initialState = {
      x: start.x,
      y: start.y,
      facing
    };
    const initialRoute = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      checkpointIndex: 0,
      checkpointHits: [],
      actionHistory: []
    };
    const initialStateKey = getFullCourseSearchStateKey(initialState, 0, 0, options);
    bestCostByState.set(initialStateKey, 0);
    queue.push(createFullCourseQueueEntry(initialRoute, flags, options));
  }
  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getFullCourseSearchStateKey(current.finalState, current.actions, current.checkpointIndex, options);
    const knownBest = bestCostByState.get(currentStateId);

    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      continue;
    }

    if (current.checkpointIndex >= flags.length) {
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const finalGoal = flags.at(-1);
      const completedRoute = {
        ...current,
        transitions,
        path: timeline,
        hitTarget: current.checkpointHits.at(-1)?.position ?? finalGoal
      };
      const routeScore = scoreRoute(completedRoute, finalGoal);
      if ((options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) && routeTouchesPit(tileMap, { path: timeline })) {
        continue;
      }
      completed.push({
        path: timeline,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        checkpointHits: current.checkpointHits,
        actionHistory: current.actionHistory,
        fullCourse: true,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) {
      continue;
    }

    const currentTarget = getFullCourseTarget(flags, current.checkpointIndex, current.actions, options);

    for (const action of ACTIONS) {
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal: currentTarget,
        registerIndex: current.actions % REGISTER_COUNT
      });
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const actionPenalty = getActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 0.25 : action.id === "FORWARD_3" ? 0.75 : 0;
      const scarceReusePenalty = getCardAvailabilityPressure(current.actionHistory, action.id, options);
      const conveyorComplexity = scoreTransitionConveyorComplexity(transition, currentTarget);
      const nextActionHistory = [...current.actionHistory, action.id].slice(-9);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(nextActionCount)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        let nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + weightedDistance(transition.distance, transition.forcedDistance) + actionPenalty + reversePenalty + heavyMovePenalty + scarceReusePenalty + conveyorComplexity,
          checkpointIndex: current.checkpointIndex,
          checkpointHits: current.checkpointHits,
          actionHistory: nextActionHistory
        };

        if (fullCourseRouteReachesNextCheckpoint(nextRoute, flags, options)) {
          const hit = makeCheckpointHit(nextRoute, flags, options);
          nextRoute = {
            ...nextRoute,
            checkpointIndex: nextRoute.checkpointIndex + 1,
            checkpointHits: [...nextRoute.checkpointHits, hit]
          };
        }

        const nextStateKey = getFullCourseSearchStateKey(nextRoute.finalState, nextActionCount, nextRoute.checkpointIndex, options);
        const priorBest = bestCostByState.get(nextStateKey);
        if (priorBest !== undefined && nextRoute.baseCost >= priorBest - 0.001) {
          continue;
        }

        bestCostByState.set(nextStateKey, nextRoute.baseCost);
        queue.push(createFullCourseQueueEntry(nextRoute, flags, options));
      }
    }
  }

  return completed;
}

function getMetricDelta(end, start, key) {
  return Number(((end?.[key] ?? 0) - (start?.[key] ?? 0)).toFixed(2));
}

function sliceFullCourseRoute(fullRoute, legIndex, flags) {
  const hit = fullRoute.checkpointHits?.[legIndex];
  if (!hit) {
    return null;
  }

  const previousHit = legIndex > 0 ? fullRoute.checkpointHits[legIndex - 1] : null;
  const startAction = previousHit?.action ?? 0;
  const endAction = hit.action;
  const startState = previousHit?.state ?? fullRoute.initialState ?? fullRoute.path?.[0] ?? fullRoute.finalState;
  const transitions = (fullRoute.transitions || []).slice(startAction, endAction);
  const path = buildTimeline(transitions, startState);
  const actionCount = Math.max(0, endAction - startAction);
  const metricStart = previousHit ?? { distance: 0, forcedDistance: 0, hazard: 0, rebootPenalty: 0, baseCost: 0 };
  const distance = getMetricDelta(hit, metricStart, "distance");
  const forcedDistance = getMetricDelta(hit, metricStart, "forcedDistance");
  const hazard = getMetricDelta(hit, metricStart, "hazard");
  const rebootPenalty = getMetricDelta(hit, metricStart, "rebootPenalty");
  const baseCost = getMetricDelta(hit, metricStart, "baseCost");
  const goal = flags[legIndex];

  return {
    path,
    transitions,
    finalState: hit.state,
    initialState: startState,
    hitTarget: hit.position,
    movingTarget: hit.movingTarget,
    checkpointHit: hit,
    actions: actionCount,
    absoluteStartAction: startAction,
    absoluteActions: hit.action,
    distance,
    forcedDistance,
    hazard,
    rebootPenalty,
    rebootCount: transitions.filter((transition) => transition.rebooted).length,
    conveyorComplexity: scoreConveyorComplexity({ transitions }, hit.position ?? goal),
    score: baseCost,
    goalReached: true,
    fullCourseLeg: true
  };
}


function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sameSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeTrafficPairScale(playerCount, routeCapableStarts, options = {}) {
  if (playerCount <= 1 || routeCapableStarts <= 1) {
    return 0;
  }

  const multiplier = Number.isFinite(options.trafficScaleMultiplier)
    ? options.trafficScaleMultiplier
    : 1;
  return Number((clamp((playerCount - 1) / (routeCapableStarts - 1), 0, 1) * multiplier).toFixed(3));
}

function computeLegTrafficScale(playerCount) {
  if (playerCount <= 1) {
    return 0;
  }

  return Number(clamp((playerCount - 1) / 7, 0, 1).toFixed(3));
}

function stdDev(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function buildTileSet(route, goal) {
  const goalKey = tileKey(goal.x, goal.y);
  const cachedByGoal = ROUTE_TILE_SET_CACHE.get(route);
  if (cachedByGoal?.has(goalKey)) {
    return cachedByGoal.get(goalKey);
  }

  const set = new Set();

  route.path.forEach((point, index) => {
    const isGoal = point.x === goal.x && point.y === goal.y;
    if (index === route.path.length - 1 && isGoal) {
      return;
    }
    set.add(tileKey(point.x, point.y));
  });

  if (cachedByGoal) {
    cachedByGoal.set(goalKey, set);
  } else {
    ROUTE_TILE_SET_CACHE.set(route, new Map([[goalKey, set]]));
  }

  return set;
}

function buildEdgeSet(route) {
  const cached = ROUTE_EDGE_SET_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const set = new Set();

  for (let index = 1; index < route.path.length; index += 1) {
    const from = route.path[index - 1];
    const to = route.path[index];
    if (to.jump) {
      continue;
    }
    set.add(`${tileKey(from.x, from.y)}>${tileKey(to.x, to.y)}`);
  }

  ROUTE_EDGE_SET_CACHE.set(route, set);
  return set;
}

function hasLineOfSight(tileMap, from, to) {
  const fromKey = tileKey(from.x, from.y);
  const toKey = tileKey(to.x, to.y);
  const pairKey = fromKey <= toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
  let cache = LINE_OF_SIGHT_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    LINE_OF_SIGHT_CACHE.set(tileMap, cache);
  } else if (cache.has(pairKey)) {
    return cache.get(pairKey);
  }

  if (from.x !== to.x && from.y !== to.y) {
    cache.set(pairKey, false);
    return false;
  }

  let elevation = 0;
  let maxElevation = 0;

  if (from.x === to.x) {
    const dir = to.y > from.y ? "S" : "N";
    const step = to.y > from.y ? 1 : -1;

    for (let y = from.y; y !== to.y; y += step) {
      const fromTile = tileMap.get(tileKey(from.x, y));
      const toTile = tileMap.get(tileKey(from.x, y + step));
      if (!canMoveBetween(tileMap, { x: from.x, y }, { x: from.x, y: y + step }, dir).ok) {
        cache.set(pairKey, false);
        return false;
      }

      if (crossesLedgeBoundary(fromTile, toTile, dir)) {
        elevation += getLedgeElevationDelta(fromTile, toTile, dir);
        maxElevation = Math.max(maxElevation, elevation);
      }
    }

    const visible = elevation === 0 && maxElevation <= 0;
    cache.set(pairKey, visible);
    return visible;
  }

  const dir = to.x > from.x ? "E" : "W";
  const step = to.x > from.x ? 1 : -1;

  for (let x = from.x; x !== to.x; x += step) {
    const fromTile = tileMap.get(tileKey(x, from.y));
    const toTile = tileMap.get(tileKey(x + step, from.y));
    if (!canMoveBetween(tileMap, { x, y: from.y }, { x: x + step, y: from.y }, dir).ok) {
      cache.set(pairKey, false);
      return false;
    }

    if (crossesLedgeBoundary(fromTile, toTile, dir)) {
      elevation += getLedgeElevationDelta(fromTile, toTile, dir);
      maxElevation = Math.max(maxElevation, elevation);
    }
  }

  const visible = elevation === 0 && maxElevation <= 0;
  cache.set(pairKey, visible);
  return visible;
}

function getRouteDirectionAt(path, index) {
  const cached = ROUTE_DIRECTIONS_CACHE.get(path);
  if (cached) {
    return cached[index] ?? null;
  }

  const directions = new Array(path.length).fill(null);
  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const current = path[pathIndex];
    const next = path[pathIndex + 1];
    if (next && !next.jump) {
      directions[pathIndex] = directionBetween(current, next);
      continue;
    }

    const previous = path[pathIndex - 1];
    if (previous && !current.jump) {
      directions[pathIndex] = directionBetween(previous, current);
    }
  }

  ROUTE_DIRECTIONS_CACHE.set(path, directions);
  return directions[index] ?? null;
}

function getRoutePathKey(route) {
  const cached = ROUTE_PATH_KEY_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const key = route.path.map((point) => `${point.x},${point.y}${point.jump ? "j" : ""}`).join("|");
  ROUTE_PATH_KEY_CACHE.set(route, key);
  return key;
}

function getThreatOptionKey(options = {}) {
  return [
    options.setToKill ? 1 : 0,
    options.setToStun ? 1 : 0,
    options.lessSpammyGame ? 1 : 0,
    options.criticalSpam ? 1 : 0,
    options.criticalHaywire ? 1 : 0,
    options.permanentShutdown ? 1 : 0
  ].join("");
}

function isBehindAlongDir(lead, trailing, dir) {
  if (dir === "N") return trailing.x === lead.x && trailing.y > lead.y;
  if (dir === "E") return trailing.y === lead.y && trailing.x < lead.x;
  if (dir === "S") return trailing.x === lead.x && trailing.y < lead.y;
  if (dir === "W") return trailing.y === lead.y && trailing.x > lead.x;
  return false;
}

function getRobotLaserThreatMultipliers(options = {}) {
  let lateral = 1;
  let rear = 1;
  const damagePressure = getDamageDeckPressureMultipliers(options);

  if (options.setToKill) {
    lateral *= 1.18;
    rear *= 1.35;
  }
  if (options.setToStun) {
    lateral *= 0.65;
    rear *= 0.45;
  }

  lateral *= damagePressure.robotTraffic;
  rear *= damagePressure.robotTraffic;

  return { lateral, rear };
}

function getTrafficPath(route) {
  return route?.trafficPath ?? route?.path ?? [];
}

function getTrafficRouteKey(route) {
  const path = getTrafficPath(route);
  return path.map((point) => `${point.x},${point.y}${point.jump ? "!" : ""}`).join("|");
}

function applyTrafficGraceToRoute(route, graceRegisters = 0) {
  if (!route || graceRegisters <= 0 || !Array.isArray(route.transitions)) {
    return route;
  }

  const absoluteStartAction = route.absoluteStartAction ?? 0;
  const skipCount = Math.max(0, Math.min(
    route.transitions.length,
    graceRegisters - absoluteStartAction
  ));

  if (skipCount <= 0) {
    route.trafficPath = route.path;
    return route;
  }

  if (skipCount >= route.transitions.length) {
    route.trafficPath = [];
    return route;
  }

  const startState = route.transitions[skipCount - 1]?.to ?? route.initialState;
  route.trafficPath = buildTimeline(route.transitions.slice(skipCount), startState);
  return route;
}

function lateralThreatPenalty(tileMap, routeA, routeB, options = {}) {
  if (!routeA || !routeB) {
    return 0;
  }

  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${getThreatOptionKey(options)}`;
  if (LATERAL_THREAT_CACHE.has(cacheKey)) {
    return LATERAL_THREAT_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const { lateral: multiplier } = getRobotLaserThreatMultipliers(options);

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];

    for (let indexB = Math.max(0, indexA - 1); indexB <= Math.min(pathB.length - 1, indexA + 1); indexB += 1) {
      const pointB = pathB[indexB];

      if (pointA.x === pointB.x && pointA.y === pointB.y) {
        continue;
      }

      if (pointA.x !== pointB.x && pointA.y !== pointB.y) {
        continue;
      }

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 4) {
        continue;
      }

      if (!hasLineOfSight(tileMap, pointA, pointB)) {
        continue;
      }

      const timeDelta = Math.abs(indexA - indexB);
      const distanceWeight = distance === 1 ? 1 : distance === 2 ? 0.72 : distance === 3 ? 0.48 : 0.28;
      const timeWeight = timeDelta === 0 ? 0.72 : 0.34;
      penalty += 2.2 * distanceWeight * timeWeight * multiplier;
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(LATERAL_THREAT_CACHE, cacheKey, rounded);
  return rounded;
}

function rearThreatPenalty(tileMap, routeA, routeB, options = {}) {
  if (!routeA || !routeB) {
    return 0;
  }

  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${getThreatOptionKey(options)}`;
  if (REAR_THREAT_CACHE.has(cacheKey)) {
    return REAR_THREAT_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const { rear: multiplier } = getRobotLaserThreatMultipliers(options);

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];
    const dirA = getRouteDirectionAt(pathA, indexA);
    if (!dirA || pointA.jump) {
      continue;
    }

    for (let indexB = Math.max(0, indexA - 2); indexB <= Math.min(pathB.length - 1, indexA + 2); indexB += 1) {
      const pointB = pathB[indexB];
      const dirB = getRouteDirectionAt(pathB, indexB);
      if (!dirB || pointB.jump || dirA !== dirB) {
        continue;
      }

      if (!isBehindAlongDir(pointA, pointB, dirA)) {
        continue;
      }

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 4) {
        continue;
      }

      if (!hasLineOfSight(tileMap, pointA, pointB)) {
        continue;
      }

      const timeDelta = Math.abs(indexA - indexB);
      const distanceWeight = distance === 1 ? 1.5 : distance === 2 ? 1.15 : distance === 3 ? 0.8 : 0.5;
      const timeWeight = timeDelta === 0 ? 1 : timeDelta === 1 ? 0.72 : 0.45;
      penalty += 4.2 * distanceWeight * timeWeight * multiplier;
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(REAR_THREAT_CACHE, cacheKey, rounded);
  return rounded;
}

function sustainedConvoyFrontPenalty(tileMap, leadRoute, trailingRoute, options = {}) {
  if (!leadRoute || !trailingRoute) {
    return 0;
  }

  const leadPath = getTrafficPath(leadRoute);
  const trailingPath = getTrafficPath(trailingRoute);
  if (!leadPath.length || !trailingPath.length) {
    return 0;
  }

  const { rear: multiplier } = getRobotLaserThreatMultipliers(options);
  const exposed = [];

  for (let leadIndex = 0; leadIndex < leadPath.length; leadIndex += 1) {
    const lead = leadPath[leadIndex];
    const leadDir = getRouteDirectionAt(leadPath, leadIndex);
    if (!leadDir || lead.jump) {
      exposed.push(false);
      continue;
    }

    let threatened = false;
    for (
      let trailingIndex = Math.max(0, leadIndex - 1);
      trailingIndex <= Math.min(trailingPath.length - 1, leadIndex + 1);
      trailingIndex += 1
    ) {
      const trailing = trailingPath[trailingIndex];
      const trailingDir = getRouteDirectionAt(trailingPath, trailingIndex);
      if (!trailingDir || trailing.jump || trailingDir !== leadDir) {
        continue;
      }
      if (!isBehindAlongDir(lead, trailing, leadDir)) {
        continue;
      }

      const distance = heuristic(lead, trailing);
      if (distance < 1 || distance > 4) {
        continue;
      }
      if (!hasLineOfSight(tileMap, lead, trailing)) {
        continue;
      }

      threatened = true;
      break;
    }

    exposed.push(threatened);
  }

  let penalty = 0;
  let runLength = 0;

  const scoreRun = (length) => {
    if (length <= 0) return 0;
    if (length === 1) return 1.2;
    if (length === 2) return 4;
    return Math.min(12, 7 + (length - 3) * 2.2);
  };

  for (let index = 0; index <= exposed.length; index += 1) {
    if (exposed[index]) {
      runLength += 1;
      continue;
    }
    penalty += scoreRun(runLength);
    runLength = 0;
  }

  return Number((penalty * multiplier).toFixed(2));
}

function areOppositeDirections(dirA, dirB) {
  return (
    (dirA === "N" && dirB === "S") ||
    (dirA === "S" && dirB === "N") ||
    (dirA === "E" && dirB === "W") ||
    (dirA === "W" && dirB === "E")
  );
}

function oncomingTrafficPenalty(tileMap, routeA, routeB, options = {}) {
  if (!routeA || !routeB) {
    return 0;
  }

  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${getThreatOptionKey(options)}`;
  if (ONCOMING_TRAFFIC_CACHE.has(cacheKey)) {
    return ONCOMING_TRAFFIC_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const { lateral: laserMultiplier } = getRobotLaserThreatMultipliers(options);

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];
    const dirA = getRouteDirectionAt(pathA, indexA);
    if (!dirA || pointA.jump) {
      continue;
    }

    for (let indexB = Math.max(0, indexA - 2); indexB <= Math.min(pathB.length - 1, indexA + 2); indexB += 1) {
      const pointB = pathB[indexB];
      const dirB = getRouteDirectionAt(pathB, indexB);
      if (!dirB || pointB.jump || !areOppositeDirections(dirA, dirB)) {
        continue;
      }

      const timeDelta = Math.abs(indexA - indexB);
      const timeWeight = timeDelta === 0 ? 1 : timeDelta === 1 ? 0.62 : 0.3;

      // Independent route projections occupying the same tile at nearly the
      // same time while travelling in opposite directions represent severe
      // blocking/pushing pressure even before laser risk is considered.
      if (pointA.x === pointB.x && pointA.y === pointB.y) {
        penalty += 7.5 * timeWeight;
        continue;
      }

      // Oncoming robots must be in the same corridor and travelling toward
      // one another rather than merely moving in opposite directions nearby.
      if (pointA.x !== pointB.x && pointA.y !== pointB.y) {
        continue;
      }
      if (!isBehindAlongDir(pointB, pointA, dirA)) {
        continue;
      }

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 4) {
        continue;
      }
      if (!hasLineOfSight(tileMap, pointA, pointB)) {
        continue;
      }

      const distanceWeight = distance === 1 ? 1.55 : distance === 2 ? 1.05 : distance === 3 ? 0.62 : 0.34;

      // Physical pressure exists regardless of damage-deck variants: committed
      // programs can meet nose-to-nose, block movement, or create pushes.
      const physicalPressure = 4.8 * distanceWeight * timeWeight;

      // Head-on line of sight also means both robots are exposed to incoming
      // fire. This smaller component follows the existing robot-laser tuning.
      const directedLaserPressure = 1.6 * distanceWeight * timeWeight * laserMultiplier;

      // Adjacent robots on the same register are the clearest practical
      // blocking/pushing case, so give that situation a modest extra premium.
      const adjacentConflict = distance === 1 && timeDelta === 0 ? 3.2 : 0;

      penalty += physicalPressure + directedLaserPressure + adjacentConflict;
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(ONCOMING_TRAFFIC_CACHE, cacheKey, rounded);
  return rounded;
}

function oilPushRiskPenalty(tileMap, routeA, routeB) {
  if (!routeA || !routeB) return 0;
  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  let penalty = 0;
  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];
    const dirA = getRouteDirectionAt(pathA, indexA);
    if (!dirA || pointA.jump) continue;
    for (let indexB = Math.max(0, indexA - 1); indexB <= Math.min(pathB.length - 1, indexA + 1); indexB += 1) {
      const pointB = pathB[indexB];
      if (pointB.jump || heuristic(pointA, pointB) !== 1) continue;
      const ahead = { x: pointB.x + DIRS[dirA].dx, y: pointB.y + DIRS[dirA].dy };
      if (ahead.x !== pointA.x || ahead.y !== pointA.y) continue;
      const beyond = { x: pointA.x + DIRS[dirA].dx, y: pointA.y + DIRS[dirA].dy };
      const beyondTile = tileMap.get(tileKey(beyond.x, beyond.y));
      if (!beyondTile || !isOil(beyondTile)) continue;
      const moveCheck = canMoveBetween(tileMap, pointA, beyond, dirA, {});
      if (!moveCheck.ok) continue;
      penalty += indexA === indexB ? 3.2 : 1.4;
    }
  }
  return Number(penalty.toFixed(2));
}

function isRandomizerTile(tile) {
  return (tile?.features || []).some((feature) => feature.type === "randomizer");
}

function getAdjacentRandomizerCount(tileMap, point) {
  let count = 0;
  for (const dir of Object.keys(DIRS)) {
    const adjacent = {
      x: point.x + DIRS[dir].dx,
      y: point.y + DIRS[dir].dy
    };
    if (isRandomizerTile(tileMap.get(tileKey(adjacent.x, adjacent.y)))) {
      count += 1;
    }
  }
  return count;
}

function randomizerTrafficRiskPenalty(tileMap, routeA, routeB) {
  if (!routeA || !routeB) return 0;

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  let penalty = 0;

  for (let indexA = 0; indexA < pathA.length; indexA += 1) {
    const pointA = pathA[indexA];
    if (pointA.jump) continue;

    const adjacentRandomizers = getAdjacentRandomizerCount(tileMap, pointA);
    if (!adjacentRandomizers) continue;

    for (
      let indexB = Math.max(0, indexA - 1);
      indexB <= Math.min(pathB.length - 1, indexA + 1);
      indexB += 1
    ) {
      const pointB = pathB[indexB];
      if (pointB.jump) continue;

      const distance = heuristic(pointA, pointB);
      if (distance < 1 || distance > 2) continue;

      const timeDelta = Math.abs(indexA - indexB);
      const proximityWeight = distance === 1 ? 1 : 0.42;
      const timingWeight = timeDelta === 0 ? 1 : 0.48;

      // This is intentionally only a pressure heuristic: independent route
      // projections cannot prove a push will occur, but nearby traffic makes
      // being displaced onto a randomizer materially more dangerous.
      penalty += adjacentRandomizers * 2.6 * proximityWeight * timingWeight;
    }
  }

  return Number(penalty.toFixed(2));
}

function routeThreatPenalty(tileMap, routeA, routeB, options = {}) {
  return Number((
    lateralThreatPenalty(tileMap, routeA, routeB, options) +
    rearThreatPenalty(tileMap, routeA, routeB, options) * 0.45 +
    rearThreatPenalty(tileMap, routeB, routeA, options) * 0.12 +
    oilPushRiskPenalty(tileMap, routeA, routeB) * 0.08 +
    randomizerTrafficRiskPenalty(tileMap, routeA, routeB) * 0.12
  ).toFixed(2));
}

function overlapPenalty(routeA, routeB, goal) {
  if (!routeA || !routeB) {
    return 0;
  }

  const pathA = getTrafficPath(routeA);
  const pathB = getTrafficPath(routeB);
  if (!pathA.length || !pathB.length) {
    return 0;
  }
  const cacheKey = `${getTrafficRouteKey(routeA)}>${getTrafficRouteKey(routeB)}|${tileKey(goal.x, goal.y)}`;
  if (OVERLAP_PENALTY_CACHE.has(cacheKey)) {
    return OVERLAP_PENALTY_CACHE.get(cacheKey);
  }

  let penalty = 0;
  const tileSetB = buildTileSet({ ...routeB, path: pathB }, goal);
  const edgeSetB = buildEdgeSet({ ...routeB, path: pathB });

  for (let index = 0; index < pathA.length; index += 1) {
    const point = pathA[index];
    const key = tileKey(point.x, point.y);
    const sameTick = pathB[index];
    const isGoal = point.x === goal.x && point.y === goal.y;

    const goalDistance = heuristic(point, goal);
    const goalWeight = goalDistance <= 1 ? 2.5 : goalDistance === 2 ? 1.75 : 1;

    if (!isGoal && sameTick && sameTick.x === point.x && sameTick.y === point.y) {
      penalty += 20 * goalWeight;
    } else if (!isGoal && tileSetB.has(key)) {
      penalty += 5 * goalWeight;
    }

    if (index > 0) {
      const prev = pathA[index - 1];
      const edge = `${tileKey(prev.x, prev.y)}>${key}`;
      if (edgeSetB.has(edge)) {
        penalty += 3 * goalWeight;
      }
    }
  }

  const rounded = Number(penalty.toFixed(2));
  setBoundedCacheValue(OVERLAP_PENALTY_CACHE, cacheKey, rounded);
  return rounded;
}

function routeSimilarity(routeA, routeB, goal) {
  const goalKey = tileKey(goal.x, goal.y);
  const cacheKey = `${getRoutePathKey(routeA)}|${getRoutePathKey(routeB)}|${goalKey}`;
  const reverseKey = `${getRoutePathKey(routeB)}|${getRoutePathKey(routeA)}|${goalKey}`;
  if (ROUTE_SIMILARITY_CACHE.has(cacheKey)) {
    return ROUTE_SIMILARITY_CACHE.get(cacheKey);
  }
  if (ROUTE_SIMILARITY_CACHE.has(reverseKey)) {
    return ROUTE_SIMILARITY_CACHE.get(reverseKey);
  }

  const tilesA = buildTileSet(routeA, goal);
  const tilesB = buildTileSet(routeB, goal);

  if (!tilesA.size && !tilesB.size) {
    return 1;
  }

  let sharedTiles = 0;
  for (const tile of tilesA) {
    if (tilesB.has(tile)) {
      sharedTiles += 1;
    }
  }

  const tileUnion = new Set([...tilesA, ...tilesB]).size;
  const tileScore = tileUnion ? sharedTiles / tileUnion : 0;

  const edgesA = buildEdgeSet(routeA);
  const edgesB = buildEdgeSet(routeB);
  let sharedEdges = 0;
  for (const edge of edgesA) {
    if (edgesB.has(edge)) {
      sharedEdges += 1;
    }
  }
  const edgeUnion = new Set([...edgesA, ...edgesB]).size;
  const edgeScore = edgeUnion ? sharedEdges / edgeUnion : 0;

  const similarity = (tileScore * 0.65) + (edgeScore * 0.35);
  setBoundedCacheValue(ROUTE_SIMILARITY_CACHE, cacheKey, similarity);
  return similarity;
}

function dedupeRoutes(routes) {
  const seen = new Set();
  const out = [];

  for (const route of routes) {
    const key = getRoutePathKey(route);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }

  return out;
}

function selectDistinctRoutes(routes, goal, limit = 4) {
  const distinct = [];

  for (const route of routes) {
    const tooSimilar = distinct.some((candidate) => routeSimilarity(route, candidate, goal) >= 0.72);
    if (!tooSimilar) {
      distinct.push(route);
    }

    if (distinct.length >= limit) {
      break;
    }
  }

  return distinct;
}

function averagePairwiseOverlap(routes, goal) {
  if (routes.length <= 1) {
    return 0;
  }

  const values = [];

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      values.push(routeSimilarity(routes[i], routes[j], goal));
    }
  }

  return average(values);
}

function averageCrossLegOverlap(routes, previousLegRoutes, goal) {
  if (!routes.length || !previousLegRoutes.length) {
    return 0;
  }

  const values = [];
  for (const route of routes) {
    for (const previous of previousLegRoutes) {
      values.push(routeSimilarity(route, previous, goal));
    }
  }

  return average(values);
}

function averagePairwiseThreat(tileMap, routes, options = {}) {
  if (routes.length <= 1) {
    return 0;
  }

  const values = [];

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      values.push(
        lateralThreatPenalty(tileMap, routes[i], routes[j], options) +
        rearThreatPenalty(tileMap, routes[i], routes[j], options) * 0.45 +
        rearThreatPenalty(tileMap, routes[j], routes[i], options) * 0.12
      );
    }
  }

  return average(values);
}

function averageCrossLegThreat(tileMap, routes, previousLegRoutes, options = {}) {
  if (!routes.length || !previousLegRoutes.length) {
    return 0;
  }

  const values = [];
  for (const route of routes) {
    for (const previous of previousLegRoutes) {
      values.push(
        lateralThreatPenalty(tileMap, route, previous, options) +
        rearThreatPenalty(tileMap, route, previous, options) * 0.45 +
        rearThreatPenalty(tileMap, previous, route, options) * 0.12
      );
    }
  }

  return average(values);
}

export function analyzeGoalApproaches(tileMap, goal, options = {}) {
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const approaches = [
    { side: "N", from: { x: goal.x, y: goal.y - 1 }, dir: "S" },
    { side: "E", from: { x: goal.x + 1, y: goal.y }, dir: "W" },
    { side: "S", from: { x: goal.x, y: goal.y + 1 }, dir: "N" },
    { side: "W", from: { x: goal.x - 1, y: goal.y }, dir: "E" }
  ].map((approach) => {
    const fromTile = tileMap.get(tileKey(approach.from.x, approach.from.y));
    const move = canMoveBetween(tileMap, approach.from, goal, approach.dir, options);

    return {
      ...approach,
      exists: Boolean(fromTile),
      pit: isPit(fromTile),
      open: move.ok
    };
  });

  const openSides = approaches.filter((approach) => approach.open).map((approach) => approach.side);
  const blockedSides = approaches.filter((approach) => !approach.open).map((approach) => approach.side);
  const adjacentPairs = [
    ["N", "E"],
    ["E", "S"],
    ["S", "W"],
    ["W", "N"]
  ];
  const blockedSet = new Set(blockedSides);
  const trappedCorners = adjacentPairs.filter(([left, right]) => blockedSet.has(left) && blockedSet.has(right)).length;

  return {
    openCount: openSides.length,
    blockedCount: blockedSides.length,
    trappedCorners,
    blockedByPit: approaches.filter((approach) => approach.pit).length,
    blockedByVoid: lessDeadlyGame ? 0 : approaches.filter((approach) => !approach.exists).length
  };
}

function beltLeadsToGoal(tileMap, start, goal, options = {}) {
  const visited = new Set();
  let current = { x: start.x, y: start.y };

  for (let step = 0; step < 12; step += 1) {
    const key = tileKey(current.x, current.y);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);

    const tile = tileMap.get(key);
    const belt = getBelt(tile);
    if (!belt?.dir || !DIRS[belt.dir]) {
      return false;
    }

    const next = {
      x: current.x + DIRS[belt.dir].dx,
      y: current.y + DIRS[belt.dir].dy
    };
    const move = canMoveBetween(tileMap, current, next, belt.dir, options);
    if (!move.ok) {
      return false;
    }
    if (next.x === goal.x && next.y === goal.y) {
      return true;
    }

    current = next;
  }

  return false;
}

export function scoreFlagArea(tileMap, goal, options = {}) {
  let score = 0;
  const playerCount = options.playerCount ?? 1;
  const trafficScale = playerCount <= 1 ? 0 : Math.min(1, (playerCount - 1) / 3);
  const approaches = analyzeGoalApproaches(tileMap, goal, options);
  const blockedApproachScore = approaches.blockedCount * (
    FLAG_APPROACH_WEIGHTS.blockedSideBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.blockedSideTraffic
  );
  const approachCompression = Math.max(0, 3 - approaches.openCount);

  if (approaches.openCount <= 1) {
    score += FLAG_APPROACH_WEIGHTS.singleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.singleOpenTraffic;
  } else if (approaches.openCount === 2) {
    score += FLAG_APPROACH_WEIGHTS.doubleOpenBase + trafficScale * FLAG_APPROACH_WEIGHTS.doubleOpenTraffic;
  }

  score += blockedApproachScore;
  score += approachCompression * approachCompression * (
    FLAG_APPROACH_WEIGHTS.approachCompressionBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.approachCompressionTraffic
  );
  score += approaches.trappedCorners * (
    FLAG_APPROACH_WEIGHTS.trappedCornerBase +
    trafficScale * FLAG_APPROACH_WEIGHTS.trappedCornerTraffic
  );
  score += approaches.blockedByPit * FLAG_APPROACH_WEIGHTS.blockedByPit;
  score += approaches.blockedByVoid * FLAG_APPROACH_WEIGHTS.blockedByVoid;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = goal.x + dx;
      const y = goal.y + dy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 2) continue;

      const tile = tileMap.get(tileKey(x, y));
      if (!tile) continue;

      for (const feature of tile.features || []) {
        const featureScore = getFlagAreaFeatureScore(feature, dist, {
          batteryActive: isBatteryActive(options),
          cuttingFloor: options.cuttingFloor,
          flamingOil: options.flamingOil,
          repulsorOverdrive: options.repulsorOverdrive,
          upgradeWorld: options.upgradeWorld,
          lessSpammyGame: options.lessSpammyGame,
          criticalSpam: options.criticalSpam,
          criticalHaywire: options.criticalHaywire,
          permanentShutdown: options.permanentShutdown
        });
        if (feature.type === "belt" && beltLeadsToGoal(tileMap, { x, y }, goal, options)) {
          score -= featureScore;
          continue;
        }

        score += featureScore;
      }
    }
  }

  return Number(Math.max(0, score).toFixed(2));
}

function assignRoutesWithOverlap(tileMap, startAnalyses, goal, trafficScale = 1, activeIndices = null, options = {}) {
  const selections = startAnalyses.map(() => 0);
  const activeSet = activeIndices ?? new Set(startAnalyses.filter((analysis) => analysis.routes.length).map((analysis) => analysis.index));

  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (let index = 0; index < startAnalyses.length; index += 1) {
      const analysis = startAnalyses[index];
      if (!analysis.routes.length || !activeSet.has(analysis.index)) {
        continue;
      }

      let bestRouteIndex = selections[index];
      let bestAdjusted = Infinity;

      analysis.routes.forEach((route, routeIndex) => {
        let penalty = 0;

        for (let otherIndex = 0; otherIndex < startAnalyses.length; otherIndex += 1) {
          if (otherIndex === index) continue;
          const other = startAnalyses[otherIndex];
          if (!activeSet.has(other.index)) continue;
          const selected = other.routes[selections[otherIndex]];
          penalty += overlapPenalty(route, selected, goal) * trafficScale;
          penalty += routeThreatPenalty(tileMap, route, selected, options) * 0.3 * trafficScale;
        }

        const adjusted = route.score + penalty;
        if (adjusted < bestAdjusted) {
          bestAdjusted = adjusted;
          bestRouteIndex = routeIndex;
        }
      });

      if (bestRouteIndex !== selections[index]) {
        selections[index] = bestRouteIndex;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return selections;
}

function selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, activeIndices = null, options = {}) {
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const routeCapableStarts = startAnalyses.filter((analysis) => analysis.routes.length && activeSet.has(analysis.index)).length;
  const trafficScale = computeTrafficPairScale(playerCount, routeCapableStarts, options);
  const selectedRouteIndices = assignRoutesWithOverlap(tileMap, startAnalyses, goal, trafficScale, activeSet, options);

  startAnalyses.forEach((analysis, index) => {
    const selectedIndex = selectedRouteIndices[index] ?? 0;
    const selectedRoute = analysis.routes[selectedIndex] ?? null;
    analysis.selectedRouteIndex = selectedIndex;
    analysis.selectedRoute = selectedRoute;
    analysis.bestScore = selectedRoute?.score ?? Infinity;
    analysis.bestDistance = selectedRoute?.distance ?? Infinity;
    analysis.bestActions = selectedRoute?.actions ?? Infinity;
  });

  startAnalyses.forEach((analysis) => {
    if (!analysis.selectedRoute) {
      analysis.overlapPenalty = Infinity;
      analysis.lateralThreat = Infinity;
      analysis.rearThreat = Infinity;
      analysis.routeThreat = Infinity;
      analysis.trafficScale = trafficScale;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
      return;
    }

    let overlap = 0;
    let lateralThreat = 0;
    let rearThreat = 0;

    for (const other of startAnalyses) {
      if (other.index === analysis.index || !other.selectedRoute || !activeSet.has(other.index)) {
        continue;
      }

      overlap += overlapPenalty(analysis.selectedRoute, other.selectedRoute, goal) * trafficScale;
      lateralThreat += lateralThreatPenalty(tileMap, analysis.selectedRoute, other.selectedRoute, options) * trafficScale;
      rearThreat += (
        rearThreatPenalty(tileMap, analysis.selectedRoute, other.selectedRoute, options) * 0.45 +
        rearThreatPenalty(tileMap, other.selectedRoute, analysis.selectedRoute, options) * 0.12
      ) * trafficScale;
    }

    analysis.overlapPenalty = Number(overlap.toFixed(2));
    analysis.lateralThreat = Number(lateralThreat.toFixed(2));
    analysis.rearThreat = Number(rearThreat.toFixed(2));
    analysis.routeThreat = Number((analysis.lateralThreat + analysis.rearThreat).toFixed(2));
    analysis.trafficScale = trafficScale;
    analysis.trafficPenalty = Number((Math.sqrt(analysis.overlapPenalty) + analysis.routeThreat * 0.16).toFixed(2));
    analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
    analysis.adjustedScore = Number((analysis.bestScore + analysis.trafficPenalty + analysis.courseScoreAdjustment).toFixed(2));
  });

  return {
    activeSet,
    trafficScale
  };
}

function summarizeFirstLegAnalyses(tileMap, startAnalyses, goal, flags, playerCount, options = {}, outlierSet = new Set(), outlierDiagnostics = new Map()) {
  const reachable = startAnalyses.filter((item) => item.reachable && item.selectedRoute);
  const activeReachable = reachable.filter((item) => !outlierSet.has(item.index));
  const adjustedScores = activeReachable.map((item) => item.adjustedScore);
  const distances = activeReachable.map((item) => item.bestDistance);
  const actions = activeReachable.map((item) => item.bestActions);
  const trafficPenaltyValues = activeReachable.map((item) => item.trafficPenalty);
  const overlapValues = activeReachable.map((item) => item.overlapPenalty);
  const lateralThreatValues = activeReachable.map((item) => item.lateralThreat);
  const rearThreatValues = activeReachable.map((item) => item.rearThreat);
  const scoreMean = average(adjustedScores);
  const scoreStdDev = stdDev(adjustedScores);
  const distanceMean = average(distances);
  const actionMean = average(actions);
  const trafficPenaltyMean = average(trafficPenaltyValues);
  const overlapMean = average(overlapValues);
  const lateralThreatMean = average(lateralThreatValues);
  const rearThreatMean = average(rearThreatValues);
  const flagAreaScore = scoreFlagArea(tileMap, goal, {
    playerCount,
    lessDeadlyGame: options.lessDeadlyGame
  });
  const outliers = reachable
    .filter((item) => outlierSet.has(item.index))
    .map((item) => ({
      index: item.index,
      score: item.adjustedScore,
      delta: Number((item.adjustedScore - scoreMean).toFixed(2)),
      actionDelta: Number((item.bestActions - actionMean).toFixed(2)),
      reasons: outlierDiagnostics.get(item.index) ?? null
    }));
  const difficultyScore = Number(scoreMean.toFixed(2));
  const lengthScore = Number(distanceMean.toFixed(2));
  const actionScore = Number(actionMean.toFixed(2));
  const overlapScore = Number(Math.max(0, 100 - overlapMean * 9).toFixed(2));
  const fairnessScore = Number(Math.max(0, 100 - scoreStdDev * 4).toFixed(2));
  const overallScore = Number(
    Math.min(
      100,
      difficultyScore * 0.45 +
      lengthScore * 1 +
      actionScore * 1.2 +
      flagAreaScore * 0.9 +
      (100 - fairnessScore) * 0.12 +
      (100 - overlapScore) * 0.18
    ).toFixed(2)
  );

  return {
    reachable,
    activeReachable,
    scoreMean,
    scoreStdDev,
    actionMean,
    summary: {
      flagCount: flags.length,
      flagAreaScore,
      reachableStarts: reachable.length,
      totalStarts: startAnalyses.length,
      averageTrafficPenalty: Number(trafficPenaltyMean.toFixed(2)),
      averageOverlapPenalty: Number(overlapMean.toFixed(2)),
      averageLateralThreat: Number(lateralThreatMean.toFixed(2)),
      averageRearThreat: Number(rearThreatMean.toFixed(2)),
      difficultyScore,
      lengthScore,
      actionScore,
      overlapScore,
      fairnessScore,
      scoreStdDev: Number(scoreStdDev.toFixed(2)),
      outliers,
      overallScore
    }
  };
}

export function collectCheckpoints(tileMap) {
  const checkpoints = [];

  for (const tile of tileMap.values()) {
    for (const feature of tile.features || []) {
      if (feature.type === "checkpoint") {
        checkpoints.push({
          id: feature.id ?? checkpoints.length + 1,
          x: tile.x,
          y: tile.y
        });
      }
    }
  }

  return checkpoints.sort((a, b) => a.id - b.id);
}

export function analyzeCourse(tileMap, starts, goal, options = {}) {
  const maxRoutes = options.maxRoutes ?? 4;
  const flags = options.flags ?? [goal];
  const playerCount = options.playerCount ?? starts.length;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const routes = dedupeRoutes(enumerateRoutes(tileMap, start, goal, {
      maxRoutes,
      maxActions: options.maxActions,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations,
      playerCount,
      rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      portalMap
    })).sort((left, right) => left.score - right.score).slice(0, maxRoutes);

    return {
      index: sourceIndex,
      start,
      reachable: routes.length > 0,
      routes
    };
  });

  if (options.skipTraffic) {
    startAnalyses.forEach((analysis) => {
      const selectedRoute = analysis.routes[0] ?? null;
      analysis.selectedRouteIndex = 0;
      analysis.selectedRoute = selectedRoute;
      analysis.bestScore = selectedRoute?.score ?? Infinity;
      analysis.bestDistance = selectedRoute?.distance ?? Infinity;
      analysis.bestActions = selectedRoute?.actions ?? Infinity;
      analysis.overlapPenalty = selectedRoute ? 0 : Infinity;
      analysis.lateralThreat = selectedRoute ? 0 : Infinity;
      analysis.rearThreat = selectedRoute ? 0 : Infinity;
      analysis.routeThreat = selectedRoute ? 0 : Infinity;
      analysis.trafficScale = 0;
      analysis.trafficPenalty = selectedRoute ? 0 : Infinity;
      analysis.courseScoreAdjustment = 0;
      analysis.adjustedScore = selectedRoute?.score ?? Infinity;
    });
  } else {
    selectAndScoreStartAnalyses(tileMap, startAnalyses, goal, playerCount, null, options);
  }

  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    goal,
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );

  return {
    goal,
    starts: startAnalyses,
    summary: finalSummary.summary
  };
}

export function analyzeStartsLightweight(tileMap, starts, goal, options = {}) {
  return analyzeCourse(tileMap, starts, goal, {
    ...options,
    flags: [goal],
    maxRoutes: 1,
    maxActions: options.maxActions ?? 18,
    maxExpansions: options.maxExpansions ?? 7000,
    skipTraffic: true
  });
}


function summarizeExpectedFullCourseLegRoutes(routes, previousRoutes, goal, playerCount = 4) {
  const routeScores = routes.map((route) => route.score).filter(Number.isFinite);
  const routeDistances = routes.map((route) => route.distance).filter(Number.isFinite);
  const routeActions = routes.map((route) => route.actions).filter(Number.isFinite);
  const intraLegOverlap = averagePairwiseOverlap(routes, goal);
  const crossLegOverlap = averageCrossLegOverlap(routes, previousRoutes, goal);
  const trafficScale = routes.length > 1
    ? clamp((playerCount - 1) / Math.max(1, routes.length - 1), 0, 1)
    : 0;
  const missingRoutePenalty = Math.max(0, playerCount - routes.length) * 10;
  const diversityScore = Number(Math.max(
    0,
    routes.length * 12 - intraLegOverlap * (18 + 12 * trafficScale) - crossLegOverlap * (8 + 8 * trafficScale)
  ).toFixed(2));
  const congestionScore = Number((
    intraLegOverlap * (18 + 24 * trafficScale) +
    crossLegOverlap * (8 + 16 * trafficScale) +
    missingRoutePenalty
  ).toFixed(2));

  return {
    routeCount: routes.length,
    distinctRouteCount: routes.length,
    expectedRouteCount: routes.length,
    expectedRobotPaths: true,
    fullCourseSlices: true,
    bestRouteScore: routeScores.length ? Math.min(...routeScores) : Infinity,
    bestDistance: routeDistances.length ? Math.min(...routeDistances) : Infinity,
    averageRouteScore: Number(average(routeScores).toFixed(2)),
    averageRouteDistance: Number(average(routeDistances).toFixed(2)),
    averageRouteActions: Number(average(routeActions).toFixed(2)),
    routeSpread: routeScores.length > 1 ? Number((Math.max(...routeScores) - Math.min(...routeScores)).toFixed(2)) : 0,
    intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
    crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
    intraLegThreat: 0,
    crossLegThreat: 0,
    diversityScore,
    congestionScore
  };
}


function prepareFullCourseCandidate(route, flags, options = {}) {
  if (!route) {
    return null;
  }

  const graceRegisters = options.trafficGraceRegisters ?? 0;
  const legRoutes = flags.map((_, legIndex) => (
    applyTrafficGraceToRoute(sliceFullCourseRoute(route, legIndex, flags), graceRegisters)
  ));
  route.legRoutes = legRoutes;
  route.absoluteStartAction = 0;
  applyTrafficGraceToRoute(route, graceRegisters);
  return route;
}

const FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT = 0.4;
const FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT = 1;

function getLegAwareFullRouteOverlap(route, other, flags) {
  const routeLegs = route?.legRoutes ?? [];
  const otherLegs = other?.legRoutes ?? [];
  const legCount = Math.min(flags.length, routeLegs.length, otherLegs.length);

  if (!legCount) {
    const finalGoal = flags.at(-1);
    return finalGoal ? overlapPenalty(route, other, finalGoal) : 0;
  }

  let overlap = 0;
  for (let legIndex = 0; legIndex < legCount; legIndex += 1) {
    const routeLeg = routeLegs[legIndex];
    const otherLeg = otherLegs[legIndex];
    const goal = flags[legIndex];

    if (!routeLeg || !otherLeg || !goal) {
      continue;
    }

    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
    overlap += overlapPenalty(routeLeg, otherLeg, goal) * legWeight;
  }

  return overlap;
}

function getLegAwareConvoyFrontPenalty(tileMap, route, other, flags, options = {}) {
  const routeLegs = route?.legRoutes ?? [];
  const otherLegs = other?.legRoutes ?? [];
  const legCount = Math.min(flags.length, routeLegs.length, otherLegs.length);

  if (!legCount) {
    return sustainedConvoyFrontPenalty(tileMap, route, other, options);
  }

  let pressure = 0;
  for (let legIndex = 0; legIndex < legCount; legIndex += 1) {
    const routeLeg = routeLegs[legIndex];
    const otherLeg = otherLegs[legIndex];
    if (!routeLeg || !otherLeg) continue;

    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;

    pressure += sustainedConvoyFrontPenalty(
      tileMap,
      routeLeg,
      otherLeg,
      options
    ) * legWeight;
  }

  return Number(pressure.toFixed(2));
}

function getFullRouteTrafficPenalty(tileMap, route, selectedRoutes, flags, options = {}) {
  if (!route || !selectedRoutes.length) {
    return 0;
  }

  const playerCount = options.playerCount ?? selectedRoutes.length + 1;
  const trafficScale = computeTrafficPairScale(playerCount, selectedRoutes.length + 1, options);
  let overlapPressure = 0;
  let lateralThreat = 0;
  let rearThreat = 0;
  let oncomingTraffic = 0;
  let oilPushRisk = 0;
  let randomizerTrafficRisk = 0;
  let convoyFrontPressure = 0;
  let convoyFollowers = 0;

  for (const other of selectedRoutes) {
    if (!other || other === route) {
      continue;
    }

    // Preserve the V5.3 experiment: damp each robot-pair overlap separately
    // rather than compressing the entire crowd into one square root. This lets
    // 6-8 player traffic keep useful discriminatory power.
    const pairOverlap = getLegAwareFullRouteOverlap(route, other, flags);
    overlapPressure += Math.sqrt(Math.max(0, pairOverlap)) * trafficScale;

    // Keep laser/rear-threat timing on the continuous whole-course paths.
    lateralThreat += lateralThreatPenalty(tileMap, route, other, options) * trafficScale;
    rearThreat += (
      rearThreatPenalty(tileMap, route, other, options) * 0.45 +
      rearThreatPenalty(tileMap, other, route, options) * 0.12
    ) * trafficScale;

    // Dedicated head-on interaction pressure: incoming fire plus the physical
    // cost of likely blocking/pushing conflicts in opposing traffic.
    oncomingTraffic += oncomingTrafficPenalty(tileMap, route, other, options) * trafficScale;
    oilPushRisk += oilPushRiskPenalty(tileMap, route, other) * trafficScale;
    randomizerTrafficRisk += randomizerTrafficRiskPenalty(tileMap, route, other) * trafficScale;

    const pairConvoyFrontPressure = getLegAwareConvoyFrontPenalty(
      tileMap,
      route,
      other,
      flags,
      options
    ) * trafficScale;
    if (pairConvoyFrontPressure > 0) {
      convoyFollowers += 1;
      convoyFrontPressure += pairConvoyFrontPressure;
    }
  }

  // Several robots following the same leader make the lane progressively less
  // attractive, but cap the crowd multiplier so large-player games do not
  // explode numerically.
  const convoyCrowdMultiplier = convoyFollowers <= 1
    ? 1
    : Math.min(1.9, 1 + (convoyFollowers - 1) * 0.45);

  return Number((
    overlapPressure * 0.22 +
    lateralThreat * 0.035 +
    rearThreat * 0.03 +
    oncomingTraffic * 0.06 +
    oilPushRisk * 0.08 +
    randomizerTrafficRisk * 0.12 +
    convoyFrontPressure * convoyCrowdMultiplier * 0.65
  ).toFixed(2));
}

function selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, options = {}) {
  const excludedIndices = new Set(options.excludedIndices ?? []);
  const reachable = startAnalyses.filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length &&
    !excludedIndices.has(analysis.index)
  ));
  if (reachable.length <= 1) {
    return {
      starts: startAnalyses,
      selectionPasses: 0,
      routeSwitches: 0,
      averageTrafficPenalty: 0
    };
  }

  const maxPasses = Math.max(1, Math.min(3, options.fullCourseTrafficPasses ?? 2));
  let routeSwitches = 0;
  let actualPasses = 0;
  let selectedByIndex = new Map(reachable.map((analysis) => [analysis.index, analysis.fullCourseRoutes[0]]));

  for (let pass = 0; pass < maxPasses; pass += 1) {
    actualPasses = pass + 1;
    let changed = false;
    for (const analysis of reachable) {
      const otherRoutes = reachable
        .filter((other) => other.index !== analysis.index)
        .map((other) => selectedByIndex.get(other.index))
        .filter(Boolean);
      let bestRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoutes[0];
      let bestValue = Infinity;

      for (const candidate of analysis.fullCourseRoutes) {
        const trafficPenalty = getFullRouteTrafficPenalty(tileMap, candidate, otherRoutes, flags, options);
        const rawGap = Math.max(0, candidate.score - analysis.fullCourseRoutes[0].score);
        // candidate.score already contains the geometric cost of taking a
        // detour. Keep only a tiny tie-breaking surcharge here so traffic can
        // make a slightly longer but safer later-leg route genuinely win.
        const value = candidate.score + trafficPenalty + rawGap * 0.04;
        if (value < bestValue - 0.001) {
          bestValue = value;
          bestRoute = candidate;
        }
      }

      if (bestRoute !== selectedByIndex.get(analysis.index)) {
        selectedByIndex.set(analysis.index, bestRoute);
        changed = true;
        routeSwitches += 1;
      }
    }

    if (!changed) {
      break;
    }
  }

  const selectedRoutes = reachable
    .map((analysis) => selectedByIndex.get(analysis.index))
    .filter(Boolean);
  const trafficValues = reachable.map((analysis) => {
    const route = selectedByIndex.get(analysis.index);
    const otherRoutes = selectedRoutes.filter((other) => other !== route);
    return getFullRouteTrafficPenalty(tileMap, route, otherRoutes, flags, options);
  });
  const trafficByIndex = new Map(reachable.map((analysis, index) => [analysis.index, trafficValues[index] ?? 0]));

  return {
    starts: startAnalyses.map((analysis) => {
      const selectedRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoute;
      if (!selectedRoute) {
        return analysis;
      }

      return {
        ...analysis,
        fullCourseRoute: selectedRoute,
        fullCourseTrafficPenalty: trafficByIndex.get(analysis.index) ?? 0,
        fullCourseRouteIndex: analysis.fullCourseRoutes.indexOf(selectedRoute)
      };
    }),
    selectionPasses: actualPasses,
    routeSwitches,
    averageTrafficPenalty: Number(average(trafficValues).toFixed(2))
  };
}

function buildStartAnalysisForSelectedFullRoute(analysis, flags) {
  const fullRoute = analysis.fullCourseRoute;
  const legRoutes = fullRoute?.legRoutes ?? [];
  const firstLegRoute = legRoutes[0] ?? null;
  const continuationScore = fullRoute && firstLegRoute
    ? Number((fullRoute.score - firstLegRoute.score).toFixed(2))
    : 0;
  const continuationActions = fullRoute && firstLegRoute
    ? Math.max(0, fullRoute.actions - firstLegRoute.actions)
    : 0;
  const continuationDistance = fullRoute && firstLegRoute
    ? Number((fullRoute.distance - firstLegRoute.distance).toFixed(2))
    : 0;

  return {
    ...analysis,
    reachable: Boolean(firstLegRoute && fullRoute),
    routes: firstLegRoute ? [firstLegRoute] : [],
    selectedRouteIndex: 0,
    selectedRoute: firstLegRoute,
    bestScore: firstLegRoute?.score ?? Infinity,
    bestDistance: firstLegRoute?.distance ?? Infinity,
    bestActions: firstLegRoute?.actions ?? Infinity,
    courseEstimate: fullRoute
      ? {
        continuationScore,
        continuationActions,
        continuationDistance,
        totalScore: fullRoute.score,
        totalActions: fullRoute.actions,
        totalDistance: fullRoute.distance,
        fullCourseTrafficPenalty: analysis.fullCourseTrafficPenalty ?? 0,
        selectedRouteIndex: analysis.fullCourseRouteIndex ?? 0,
        candidateCount: analysis.fullCourseRoutes?.length ?? 0,
        legs: legRoutes.map((route, legIndex) => ({
          flag: legIndex + 1,
          score: route?.score ?? null,
          actions: route?.actions ?? null,
          absoluteActions: route?.absoluteActions ?? null,
          distance: route?.distance ?? null,
          movingTarget: route?.movingTarget ?? null,
          reachable: Boolean(route)
        }))
      }
      : null,
    courseScoreAdjustment: 0
  };
}

function buildExpectedLegAnalysesFromFullRoutes(startAnalyses, flags, playerCount) {
  const perLegRoutes = Array.from({ length: flags.length }, () => []);

  for (const startAnalysis of startAnalyses) {
    const fullRoute = startAnalysis.fullCourseRoute;
    if (!fullRoute) {
      continue;
    }

    for (let legIndex = 0; legIndex < flags.length; legIndex += 1) {
      const legRoute = fullRoute.legRoutes?.[legIndex];
      if (legRoute) {
        perLegRoutes[legIndex].push({
          ...legRoute,
          startIndex: startAnalysis.index,
          label: `Start ${startAnalysis.index + 1} leg ${legIndex === 0 ? "dock" : legIndex} -> ${legIndex + 1}`
        });
      }
    }
  }

  let previousLegRoutes = [];
  return perLegRoutes.map((routes, index) => {
    const goal = flags[index];
    const summary = summarizeExpectedFullCourseLegRoutes(routes, previousLegRoutes, goal, playerCount);
    previousLegRoutes = routes;
    return {
      from: index === 0 ? "dock" : flags[index - 1],
      goal,
      routes,
      distinctRoutes: routes,
      summary
    };
  });
}

export function analyzeFullCourse(tileMap, starts, flags, options = {}) {
  const maxRoutes = options.maxRoutes ?? 2;
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const routeOptions = {
    maxRoutes,
    maxActions: options.maxActions,
    maxExpansions: options.maxExpansions,
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive,
    lessForeshadowing: options.lessForeshadowing,
    repairStations: Boolean(options.repairStations),
    playerCount,
    virtualBots: Boolean(options.virtualBots),
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoals,
    portalMap
  };

  const enumeratePreparedRoutesForStart = (start) => {
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const fullRoutes = dedupeRoutes(enumerateFullCourseRoutes(tileMap, start, flags, {
      ...routeOptions,
      rebootTokens,
      maxRoutes,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations
    })).sort((left, right) => left.score - right.score);
    return selectDistinctRoutes(fullRoutes, flags.at(-1), maxRoutes)
      .map((route) => prepareFullCourseCandidate(route, flags, options))
      .filter(Boolean);
  };

  // All Virtual Bots share Flag 0, so avoid repeating the same expensive
  // continuous route search once per player. Clone the candidate objects per
  // robot so multiplayer route selection still treats them independently.
  const sharedVirtualRoutes = options.virtualBots && starts.length
    ? enumeratePreparedRoutesForStart(starts[0])
    : null;

  const clonePreparedRoute = (route) => route
    ? {
      ...route,
      path: route.path ? [...route.path] : route.path,
      trafficPath: route.trafficPath ? [...route.trafficPath] : route.trafficPath,
      legRoutes: (route.legRoutes || []).map((leg) => leg
        ? {
          ...leg,
          path: leg.path ? [...leg.path] : leg.path,
          trafficPath: leg.trafficPath ? [...leg.trafficPath] : leg.trafficPath
        }
        : leg)
    }
    : route;

  const startAnalyses = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex) ? start.analysisIndex : index;
    const distinctFullRoutes = sharedVirtualRoutes
      ? sharedVirtualRoutes.map(clonePreparedRoute)
      : enumeratePreparedRoutesForStart(start);
    const fullRoute = distinctFullRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: sourceIndex,
      start,
      reachable: Boolean(fullRoute),
      fullCourseRoutes: distinctFullRoutes,
      fullCourseRoute: fullRoute,
      fullCourseRouteIndex: fullRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    }, flags);
  });

  const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, flags, {
    ...options,
    playerCount
  });
  const selectedStartAnalyses = selection.starts.map((analysis) => buildStartAnalysisForSelectedFullRoute(analysis, flags));
  const fullScores = selectedStartAnalyses
    .filter((item) => item.reachable && item.fullCourseRoute)
    .map((item) => item.fullCourseRoute.score + (item.fullCourseTrafficPenalty ?? 0));
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map((analysis) => {
    if (!analysis.fullCourseRoute) {
      return analysis;
    }

    const fullScore = analysis.fullCourseRoute.score + (analysis.fullCourseTrafficPenalty ?? 0);
    const rawDelta = fullScore - meanFullScore;
    return {
      ...analysis,
      courseEstimate: {
        ...analysis.courseEstimate,
        meanFullScore: Number(meanFullScore.toFixed(2)),
        delta: Number(rawDelta.toFixed(2))
      },
      courseScoreAdjustment: Number(clamp(rawDelta * 0.32, -10, 10).toFixed(2))
    };
  });

  selectAndScoreStartAnalyses(tileMap, adjustedStartAnalyses, flags[0], playerCount, null, options);
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(adjustedStartAnalyses, flags, playerCount);
  const finalSummary = summarizeFirstLegAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    flags,
    playerCount,
    options,
    new Set(),
    new Map()
  );

  return {
    goal: flags[0],
    flags,
    starts: adjustedStartAnalyses,
    expectedLegAnalyses: expectedLegAnalyses.slice(1),
    summary: {
      ...finalSummary.summary,
      courseContinuationMean: Number(meanFullScore.toFixed(2)),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        legAwareOverlap: true,
        perRobotOverlapDamping: true,
        oncomingTraffic: true,
        oncomingTrafficWeight: 0.06,
        openingLegWeight: FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight: FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

export function recomputeFirstLegPressure(tileMap, firstLeg, options = {}) {
  const playerCount = options.playerCount ?? firstLeg.starts.length;
  const excludedIndices = new Set(options.excludedIndices ?? []);
  let startAnalyses = firstLeg.starts.map((analysis) => ({ ...analysis }));
  let fullCourseTraffic = firstLeg.summary.fullCourseTraffic ?? null;
  let expectedLegAnalyses = firstLeg.expectedLegAnalyses;

  if (firstLeg.summary.fullCourseRoutes && Array.isArray(firstLeg.flags) && firstLeg.flags.length) {
    const selection = selectFullCourseRoutesForStarts(tileMap, startAnalyses, firstLeg.flags, {
      ...options,
      playerCount,
      excludedIndices
    });
    startAnalyses = selection.starts.map((analysis) => (
      analysis.prePruned
        ? analysis
        : buildStartAnalysisForSelectedFullRoute(analysis, firstLeg.flags)
    ));
    fullCourseTraffic = {
      passes: selection.selectionPasses,
      routeSwitches: selection.routeSwitches,
      averagePenalty: selection.averageTrafficPenalty
    };
    expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
      startAnalyses.filter((analysis) => !excludedIndices.has(analysis.index)),
      firstLeg.flags,
      playerCount
    ).slice(1);
  }

  const activeIndices = new Set(
    startAnalyses
      .filter((analysis) => analysis.reachable && analysis.routes?.length && !excludedIndices.has(analysis.index))
      .map((analysis) => analysis.index)
  );

  selectAndScoreStartAnalyses(tileMap, startAnalyses, firstLeg.goal, playerCount, activeIndices, options);
  const recomputed = summarizeFirstLegAnalyses(
    tileMap,
    startAnalyses,
    firstLeg.goal,
    firstLeg.flags ?? new Array(firstLeg.summary.flagCount).fill(null),
    playerCount,
    options,
    excludedIndices
  );

  return {
    ...firstLeg,
    starts: startAnalyses,
    expectedLegAnalyses,
    summary: {
      ...firstLeg.summary,
      ...recomputed.summary,
      fullCourseTraffic,
      outliers: firstLeg.summary.outliers
    }
  };
}

export function analyzeFlagLeg(tileMap, from, goal, options = {}) {
  const facings = options.facings ?? ROTATION_ORDER;
  const routesPerFacing = options.routesPerFacing ?? 3;
  const maxDistinctRoutes = options.maxDistinctRoutes ?? 4;
  const previousLegRoutes = options.previousLegRoutes ?? [];
  const trafficScale = computeLegTrafficScale(options.playerCount ?? 4);
  const allRoutes = [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);

  const routeStarts = Array.isArray(options.startStates) && options.startStates.length
    ? options.startStates.map((state) => ({
      x: state.x,
      y: state.y,
      facing: state.facing ?? "E"
    }))
    : facings.map((facing) => ({
      x: from.x,
      y: from.y,
      facing
    }));

  routeStarts.forEach((routeStart) => {
    const routes = enumerateRoutes(tileMap, routeStart, goal, {
      maxRoutes: routesPerFacing,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
      lighterGame: options.lighterGame,
      upgradeWorld: options.upgradeWorld,
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown,
      cuttingFloor: options.cuttingFloor,
      flamingOil: options.flamingOil,
      repulsorOverdrive: options.repulsorOverdrive,
      playerCount: options.playerCount,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoal: options.dynamicGoal,
      portalMap
    });

    routes.forEach((route) => {
      allRoutes.push({
        ...route,
        startFacing: routeStart.facing,
        routeStart
      });
    });
  });

  const uniqueRoutes = dedupeRoutes(allRoutes).sort((a, b) => a.score - b.score);
  const distinctRoutes = selectDistinctRoutes(uniqueRoutes, goal, maxDistinctRoutes);
  const bestRoute = distinctRoutes[0] ?? null;
  const routeScores = distinctRoutes.map((route) => route.score);
  const routeDistances = distinctRoutes.map((route) => route.distance);
  const routeActions = distinctRoutes.map((route) => route.actions);
  const intraLegOverlap = averagePairwiseOverlap(distinctRoutes, goal);
  const crossLegOverlap = averageCrossLegOverlap(distinctRoutes, previousLegRoutes, goal);
  const intraLegThreat = averagePairwiseThreat(tileMap, distinctRoutes, options);
  const crossLegThreat = averageCrossLegThreat(tileMap, distinctRoutes, previousLegRoutes, options);
  const routeSpread = routeScores.length > 1 ? Math.max(...routeScores) - Math.min(...routeScores) : 0;
  const diversityScore = Number(
    Math.max(
      0,
      distinctRoutes.length * 18 -
      intraLegOverlap * (18 + 17 * trafficScale) -
      crossLegOverlap * (10 + 10 * trafficScale) -
      intraLegThreat * (0.35 + 0.45 * trafficScale) -
      crossLegThreat * (0.3 + 0.4 * trafficScale)
    ).toFixed(2)
  );
  const congestionScore = Number(
    (
      intraLegOverlap * (14 + 26 * trafficScale) +
      crossLegOverlap * (10 + 20 * trafficScale) +
      intraLegThreat * (0.8 + 1.4 * trafficScale) +
      crossLegThreat * (0.6 + 1.2 * trafficScale) +
      Math.max(0, 3 - distinctRoutes.length) * 10
    ).toFixed(2)
  );

  return {
    from,
    goal,
    routes: uniqueRoutes,
    distinctRoutes,
    summary: {
      routeCount: uniqueRoutes.length,
      distinctRouteCount: distinctRoutes.length,
      bestRouteScore: bestRoute?.score ?? Infinity,
      bestDistance: bestRoute?.distance ?? Infinity,
      averageRouteScore: Number(average(routeScores).toFixed(2)),
      averageRouteDistance: Number(average(routeDistances).toFixed(2)),
      averageRouteActions: Number(average(routeActions).toFixed(2)),
      routeSpread: Number(routeSpread.toFixed(2)),
      intraLegOverlap: Number(intraLegOverlap.toFixed(2)),
      crossLegOverlap: Number(crossLegOverlap.toFixed(2)),
      intraLegThreat: Number(intraLegThreat.toFixed(2)),
      crossLegThreat: Number(crossLegThreat.toFixed(2)),
      diversityScore,
      congestionScore
    }
  };
}
