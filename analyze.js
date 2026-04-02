const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { rotatedDimensions },
  {
    FLAG_APPROACH_WEIGHTS,
    getFlagAreaFeatureScore,
    getTilePenaltyForFeature
  }
] = await Promise.all([
  import(versionedPath("./board.js")),
  import(versionedPath("./feature-weights.js"))
]);

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
const REBOOT_TEMPO_PENALTY = 34;
const SCARCE_ACTIONS = new Map([
  ["WAIT", { shortWindow: 5, shortPenalty: 12, longWindow: 9, longPenalty: 4 }],
  ["FORWARD_3", { shortWindow: 5, shortPenalty: 10, longWindow: 9, longPenalty: 3.5 }],
  ["BACK", { shortWindow: 5, shortPenalty: 12, longWindow: 9, longPenalty: 4 }],
  ["UTURN", { shortWindow: 5, shortPenalty: 13, longWindow: 9, longPenalty: 4.5 }]
]);

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
    if (feature.type !== "wall") continue;
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

function getBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
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

function getRebootDamagePenalty(options = {}) {
  return options.moreDeadlyGame ? MORE_DEADLY_REBOOT_DAMAGE_PENALTY : REBOOT_DAMAGE_PENALTY;
}

function isBatteryActive(options = {}) {
  return !options.lighterGame;
}

function getTilePenalty(tile, options = {}) {
  let penalty = 0;

  for (const feature of tile?.features || []) {
    penalty += getTilePenaltyForFeature(feature, {
      batteryActive: isBatteryActive(options),
      rebootDamagePenalty: getRebootDamagePenalty(options)
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
  const fromWalls = getWalls(fromTile);
  const toWalls = getWalls(toTile);

  if (fromWalls.has(dir) || toWalls.has(OPPOSITE[dir])) {
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

  if (!fromTile) {
    return { ok: false, crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame, offBoard: true };
  }

  const fromWalls = getWalls(fromTile);
  if (fromWalls.has(dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  const toTile = tileMap.get(tileKey(to.x, to.y));

  if (!toTile) {
    return {
      ok: false,
      crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame,
      offBoard: true
    };
  }

  const toWalls = getWalls(toTile);
  const fromLedges = getLedgeSides(fromTile);
  const toLedges = getLedgeSides(toTile);

  if (fromWalls.has(dir) || toWalls.has(OPPOSITE[dir])) {
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

function quarterTurnBetween(fromDir, toDir) {
  const fromIndex = ROTATION_ORDER.indexOf(fromDir);
  const toIndex = ROTATION_ORDER.indexOf(toDir);

  if (fromIndex === -1 || toIndex === -1) {
    return null;
  }

  const diff = (toIndex - fromIndex + ROTATION_ORDER.length) % ROTATION_ORDER.length;
  if (diff === 1) return "cw";
  if (diff === 3) return "ccw";
  return null;
}

function isPerpendicular(a, b) {
  return quarterTurnBetween(a, b) !== null;
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
  const moveCheck = canMoveBetween(tileMap, state, next, dir, options);

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
        rebootPenalty: REBOOT_TEMPO_PENALTY,
        distance: 1,
        forcedDistance: mode === "belt" || mode === "push" ? 1 : 0,
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
      forcedDistance: (mode === "belt" || mode === "push") && moveCheck.crash ? 1 : 0,
      spentMove: true,
      rampAscent: false
    };
  }

  const currentTile = tileMap.get(tileKey(state.x, state.y));
  const nextTile = tileMap.get(tileKey(next.x, next.y));
  const belt = getBelt(nextTile);
  const currentBelt = mode === "belt" ? getBelt(currentTile) : null;
  const portalMap = options.portalMap ?? new Map();
  let nextFacing = state.facing;
  let turned = false;

  if (mode === "belt" && belt && belt.speed === currentBelt?.speed && isPerpendicular(dir, belt.dir)) {
    const quarterTurn = quarterTurnBetween(dir, belt.dir);
    nextFacing = quarterTurn ? rotateFacing(state.facing, quarterTurn) : state.facing;
    turned = Boolean(quarterTurn);
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
      speed: currentBelt?.speed ?? belt?.speed ?? 1,
      turned
    }] : [],
    hazard: getTilePenalty(nextTile, options) +
      getPitPressurePenalty(tileMap, resolvedState, options) +
      getLedgePressurePenalty(tileMap, resolvedState, options) +
      (moveCheck.ledgeDamage || 0),
    rebootPenalty: 0,
    distance: 1,
    forcedDistance: mode === "belt" || mode === "oil" || mode === "push" ? 1 : 0,
    spentMove: true,
    rampAscent: Boolean(moveCheck.rampAscent)
  };

  if (mode !== "oil" && isOil(tileMap.get(tileKey(resolvedState.x, resolvedState.y)))) {
    return mergeStepOutcome(outcome, slideOnOil(tileMap, resolvedState, dir, options));
  }

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
      traversed,
      conveyorSteps: [],
      hazard: getRebootDamagePenalty(options),
      rebootPenalty: REBOOT_TEMPO_PENALTY,
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

  while (stepsTaken < maxSteps) {
    const tile = tileMap.get(tileKey(workingState.x, workingState.y));
    const belt = getBelt(tile);

    if (!belt || belt.speed !== eligibleSpeed) {
      break;
    }

    const step = moveOneStep(tileMap, workingState, belt.dir, "belt", options);
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

  return {
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
}

function resolvePushPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const pushes = getPushes(tile);

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
    const step = moveOneStep(tileMap, workingState, push.dir, "push", options);
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

  if (!hasCrusher(tile)) {
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
      rebootPenalty: REBOOT_TEMPO_PENALTY,
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

function simulateAction(tileMap, startState, action, options = {}) {
  const state = cloneState(startState);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = getTilePenalty(tileMap.get(tileKey(state.x, state.y)), options);
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
      action.relative === "forward"
        ? (onOil ? 1 : 0) + (onWater ? 1 : 0)
        : 0
    ));

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
      remainingSteps -= 1 + (step.rampAscent ? 1 : 0);
    }
    }
  }

  const blue = resolveConveyorPhase(tileMap, state, 2, options);
  traversed.push(...blue.traversed);
  conveyorSteps.push(...blue.conveyorSteps);
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
    const rotated = applyEndOfStepRotation(tileMap, state);
    state.x = rotated.x;
    state.y = rotated.y;
    state.facing = rotated.facing;
  }

  return {
    action: action.id,
    from: cloneState(startState),
    to: state,
    rebootChoices,
    traversed,
    conveyorSteps,
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

function getActionPenalty(action) {
  if (action.id === "WAIT") return 8;
  if (action.id === "FORWARD") return 5;
  if (action.id === "FORWARD_2") return 7;
  if (action.id === "FORWARD_3") return 9;
  if (action.id === "LEFT" || action.id === "RIGHT") return 6.5;
  if (action.id === "BACK") return 9.5;
  if (action.id === "UTURN") return 12;
  return 5;
}

function getScarceActionReusePenalty(history, actionId, options = {}) {
  const scarcity = SCARCE_ACTIONS.get(actionId);
  if (!scarcity) {
    return 0;
  }

  const lessForeshadowingFactor = options.lessForeshadowing ? 0.72 : 1;

  const shortRecent = history.slice(-scarcity.shortWindow);
  if (shortRecent.includes(actionId)) {
    return scarcity.shortPenalty * lessForeshadowingFactor;
  }

  const longRecent = history.slice(-scarcity.longWindow);
  if (longRecent.includes(actionId)) {
    return scarcity.longPenalty * lessForeshadowingFactor;
  }

  return 0;
}

function weightedDistance(distance, forcedDistance) {
  const manualDistance = Math.max(0, distance - forcedDistance);
  return manualDistance * 2 + forcedDistance * 0.7;
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

function scoreConveyorComplexity(route, goal) {
  let score = 0;

  for (const transition of route.transitions) {
    for (const step of transition.conveyorSteps || []) {
      score += scoreConveyorStep(step, goal);
    }
  }

  return Number(Math.max(0, score).toFixed(2));
}

function routeTouchesPit(tileMap, route) {
  return route.path.some((point) => isPit(tileMap.get(tileKey(point.x, point.y))));
}

function scoreRoute(route, goal) {
  const goalReached = route.finalState.x === goal.x && route.finalState.y === goal.y;
  const conveyorComplexity = scoreConveyorComplexity(route, goal);
  const score = route.actions * 5 + weightedDistance(route.distance, route.forcedDistance) + route.hazard + route.rebootPenalty + conveyorComplexity;
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

function enumerateRoutes(tileMap, start, goal, options = {}) {
  const maxRoutes = options.maxRoutes ?? 2;
  const maxExpansions = options.maxExpansions ?? 30000;
  const startState = {
    x: start.x,
    y: start.y,
    facing: start.facing ?? "E"
  };
  const portalMap = buildPortalMap(tileMap);

  const queue = [
    createQueueEntry({
      finalState: startState,
      transitions: [],
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      actionHistory: [],
      visited: new Set([stateKey(startState)])
    }, goal)
  ];
  const bestCostByState = new Map([[stateKey(startState), 0]]);

  const completed = [];
  let expansions = 0;

  while (queue.length && completed.length < maxRoutes && expansions < maxExpansions) {
    queue.sort((a, b) => a.estimate - b.estimate);
    const current = queue.shift();
    const currentStateId = stateKey(current.finalState);
    const knownBest = bestCostByState.get(currentStateId);

    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      continue;
    }

    if (current.finalState.x === goal.x && current.finalState.y === goal.y) {
      const timeline = buildTimeline(current.transitions, startState);
      const routeScore = scoreRoute(current, goal);
      if (options.recoveryRule !== "reboot_tokens" && routeTouchesPit(tileMap, { path: timeline })) {
        continue;
      }
      completed.push({
        path: timeline,
        transitions: current.transitions,
        finalState: current.finalState,
        ...routeScore
      });
      continue;
    }

    expansions += 1;

    for (const action of ACTIONS) {
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...options,
        portalMap
      });
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const actionPenalty = getActionPenalty(action);
      const reversePenalty = action.id === "BACK" ? 2.5 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 1.5 : action.id === "FORWARD_3" ? 3 : 0;
      const scarceReusePenalty = getScarceActionReusePenalty(current.actionHistory, action.id, options);
      const conveyorComplexity = scoreConveyorComplexity({
        transitions: [transition]
      }, goal);
      const nextActionHistory = [...current.actionHistory, action.id].slice(-9);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextStateKey = stateKey(destination);
        if (current.visited.has(nextStateKey)) {
          continue;
        }

        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        const nextRoute = {
          finalState: destination,
          transitions: [...current.transitions, transitionForDestination],
          actions: current.actions + 1,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + (transition.rebootPenalty || 0),
          baseCost: current.baseCost + transition.hazard + (transition.rebootPenalty || 0) + weightedDistance(transition.distance, transition.forcedDistance) + actionPenalty + reversePenalty + heavyMovePenalty + scarceReusePenalty + conveyorComplexity,
          actionHistory: nextActionHistory,
          visited: new Set([...current.visited, nextStateKey])
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

function computeTrafficPairScale(playerCount, routeCapableStarts) {
  if (playerCount <= 1 || routeCapableStarts <= 1) {
    return 0;
  }

  return Number(clamp((playerCount - 1) / (routeCapableStarts - 1), 0, 1).toFixed(3));
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
  const set = new Set();

  route.path.forEach((point, index) => {
    const isGoal = point.x === goal.x && point.y === goal.y;
    if (index === route.path.length - 1 && isGoal) {
      return;
    }
    set.add(tileKey(point.x, point.y));
  });

  return set;
}

function buildEdgeSet(route) {
  const set = new Set();

  for (let index = 1; index < route.path.length; index += 1) {
    const from = route.path[index - 1];
    const to = route.path[index];
    if (to.jump) {
      continue;
    }
    set.add(`${tileKey(from.x, from.y)}>${tileKey(to.x, to.y)}`);
  }

  return set;
}

function hasLineOfSight(tileMap, from, to) {
  if (from.x !== to.x && from.y !== to.y) {
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
        return false;
      }

      if (crossesLedgeBoundary(fromTile, toTile, dir)) {
        elevation += getLedgeElevationDelta(fromTile, toTile, dir);
        maxElevation = Math.max(maxElevation, elevation);
      }
    }

    return elevation === 0 && maxElevation <= 0;
  }

  const dir = to.x > from.x ? "E" : "W";
  const step = to.x > from.x ? 1 : -1;

  for (let x = from.x; x !== to.x; x += step) {
    const fromTile = tileMap.get(tileKey(x, from.y));
    const toTile = tileMap.get(tileKey(x + step, from.y));
    if (!canMoveBetween(tileMap, { x, y: from.y }, { x: x + step, y: from.y }, dir).ok) {
      return false;
    }

    if (crossesLedgeBoundary(fromTile, toTile, dir)) {
      elevation += getLedgeElevationDelta(fromTile, toTile, dir);
      maxElevation = Math.max(maxElevation, elevation);
    }
  }

  return elevation === 0 && maxElevation <= 0;
}

function lateralThreatPenalty(tileMap, routeA, routeB) {
  if (!routeA || !routeB) {
    return 0;
  }

  let penalty = 0;

  for (let indexA = 0; indexA < routeA.path.length; indexA += 1) {
    const pointA = routeA.path[indexA];

    for (let indexB = Math.max(0, indexA - 1); indexB <= Math.min(routeB.path.length - 1, indexA + 1); indexB += 1) {
      const pointB = routeB.path[indexB];

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
      const distanceWeight = distance === 1 ? 1.35 : distance === 2 ? 1 : distance === 3 ? 0.7 : 0.45;
      const timeWeight = timeDelta === 0 ? 1 : 0.55;
      penalty += 4.5 * distanceWeight * timeWeight;
    }
  }

  return Number(penalty.toFixed(2));
}

function overlapPenalty(routeA, routeB, goal) {
  if (!routeA || !routeB) {
    return 0;
  }

  let penalty = 0;
  const tileSetB = buildTileSet(routeB, goal);
  const edgeSetB = buildEdgeSet(routeB);

  for (let index = 0; index < routeA.path.length; index += 1) {
    const point = routeA.path[index];
    const key = tileKey(point.x, point.y);
    const sameTick = routeB.path[index];
    const isGoal = point.x === goal.x && point.y === goal.y;

    const goalDistance = heuristic(point, goal);
    const goalWeight = goalDistance <= 1 ? 2.5 : goalDistance === 2 ? 1.75 : 1;

    if (!isGoal && sameTick && sameTick.x === point.x && sameTick.y === point.y) {
      penalty += 20 * goalWeight;
    } else if (!isGoal && tileSetB.has(key)) {
      penalty += 5 * goalWeight;
    }

    if (index > 0) {
      const prev = routeA.path[index - 1];
      const edge = `${tileKey(prev.x, prev.y)}>${key}`;
      if (edgeSetB.has(edge)) {
        penalty += 3 * goalWeight;
      }
    }
  }

  return Number(penalty.toFixed(2));
}

function routeSimilarity(routeA, routeB, goal) {
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

  return (tileScore * 0.65) + (edgeScore * 0.35);
}

function dedupeRoutes(routes) {
  const seen = new Set();
  const out = [];

  for (const route of routes) {
    const key = route.path.map((point) => `${point.x},${point.y}`).join("|");
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

function averagePairwiseThreat(tileMap, routes) {
  if (routes.length <= 1) {
    return 0;
  }

  const values = [];

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      values.push(lateralThreatPenalty(tileMap, routes[i], routes[j]));
    }
  }

  return average(values);
}

function averageCrossLegThreat(tileMap, routes, previousLegRoutes) {
  if (!routes.length || !previousLegRoutes.length) {
    return 0;
  }

  const values = [];
  for (const route of routes) {
    for (const previous of previousLegRoutes) {
      values.push(lateralThreatPenalty(tileMap, route, previous));
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
          batteryActive: isBatteryActive(options)
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

function assignRoutesWithOverlap(tileMap, startAnalyses, goal, trafficScale = 1) {
  const selections = startAnalyses.map(() => 0);

  for (let pass = 0; pass < 5; pass += 1) {
    for (let index = 0; index < startAnalyses.length; index += 1) {
      const analysis = startAnalyses[index];
      if (!analysis.routes.length) {
        continue;
      }

      let bestRouteIndex = selections[index];
      let bestAdjusted = Infinity;

      analysis.routes.forEach((route, routeIndex) => {
        let penalty = 0;

        for (let otherIndex = 0; otherIndex < startAnalyses.length; otherIndex += 1) {
          if (otherIndex === index) continue;
          const other = startAnalyses[otherIndex];
          const selected = other.routes[selections[otherIndex]];
          penalty += overlapPenalty(route, selected, goal) * trafficScale;
          penalty += lateralThreatPenalty(tileMap, route, selected) * 0.3 * trafficScale;
        }

        const adjusted = route.score + penalty;
        if (adjusted < bestAdjusted) {
          bestAdjusted = adjusted;
          bestRouteIndex = routeIndex;
        }
      });

      selections[index] = bestRouteIndex;
    }
  }

  return selections;
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
  const startAnalyses = starts.map((start, index) => {
    const routes = enumerateRoutes(tileMap, start, goal, {
      maxRoutes,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
    });

    return {
      index,
      start,
      reachable: routes.length > 0,
      routes
    };
  });

  const routeCapableStarts = startAnalyses.filter((analysis) => analysis.routes.length).length;
  const trafficScale = computeTrafficPairScale(playerCount, routeCapableStarts);

  const selectedRouteIndices = assignRoutesWithOverlap(tileMap, startAnalyses, goal, trafficScale);

  startAnalyses.forEach((analysis, index) => {
    const selectedIndex = selectedRouteIndices[index] ?? 0;
    const selectedRoute = analysis.routes[selectedIndex] ?? null;

    analysis.selectedRouteIndex = selectedIndex;
    analysis.selectedRoute = selectedRoute;
    analysis.bestScore = selectedRoute?.score ?? Infinity;
    analysis.bestDistance = selectedRoute?.distance ?? Infinity;
    analysis.bestActions = selectedRoute?.actions ?? Infinity;
    analysis.overlapPenalty = 0;

    if (selectedRoute) {
      for (let otherIndex = 0; otherIndex < startAnalyses.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        analysis.overlapPenalty += overlapPenalty(
          selectedRoute,
          startAnalyses[otherIndex].routes[startAnalyses[otherIndex].selectedRouteIndex],
          goal
        ) * trafficScale;
      }
      analysis.overlapPenalty = Number(analysis.overlapPenalty.toFixed(2));
      analysis.lateralThreat = Number((startAnalyses.reduce((sum, other, otherIndex) => {
        if (otherIndex === index) return sum;
        return sum + lateralThreatPenalty(tileMap, selectedRoute, other.routes[other.selectedRouteIndex]);
      }, 0) * trafficScale).toFixed(2));
      analysis.trafficPenalty = Number((Math.sqrt(analysis.overlapPenalty) + analysis.lateralThreat * 0.16).toFixed(2));
      analysis.adjustedScore = Number((analysis.bestScore + analysis.trafficPenalty).toFixed(2));
    } else {
      analysis.lateralThreat = Infinity;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
    }
  });

  const reachable = startAnalyses.filter((item) => item.reachable && item.selectedRoute);
  let activeIndices = new Set(reachable.map((item) => item.index));
  let outlierSet = new Set();
  const outlierDiagnostics = new Map();
  let activeReachable = reachable;
  let scoreMean = average(activeReachable.map((item) => item.adjustedScore));
  let scoreStdDev = stdDev(activeReachable.map((item) => item.adjustedScore));
  let actionMean = average(activeReachable.map((item) => item.bestActions));
  let actionStdDev = stdDev(activeReachable.map((item) => item.bestActions));

  for (let pass = 0; pass < 4; pass += 1) {
    startAnalyses.forEach((analysis) => {
      if (!analysis.selectedRoute) {
        analysis.overlapPenalty = Infinity;
        analysis.lateralThreat = Infinity;
        analysis.trafficPenalty = Infinity;
        analysis.adjustedScore = Infinity;
        return;
      }

      let overlap = 0;
      let threat = 0;

      for (const other of startAnalyses) {
        if (other.index === analysis.index || !other.selectedRoute || !activeIndices.has(other.index)) {
          continue;
        }

        overlap += overlapPenalty(analysis.selectedRoute, other.selectedRoute, goal) * trafficScale;
        threat += lateralThreatPenalty(tileMap, analysis.selectedRoute, other.selectedRoute) * trafficScale;
      }

      analysis.overlapPenalty = Number(overlap.toFixed(2));
      analysis.lateralThreat = Number(threat.toFixed(2));
      analysis.trafficPenalty = Number((Math.sqrt(analysis.overlapPenalty) + analysis.lateralThreat * 0.16).toFixed(2));
      analysis.adjustedScore = Number((analysis.bestScore + analysis.trafficPenalty).toFixed(2));
    });

    activeReachable = reachable.filter((item) => activeIndices.has(item.index));
    const adjustedScores = activeReachable.map((item) => item.adjustedScore);
    const actions = activeReachable.map((item) => item.bestActions);
    scoreMean = average(adjustedScores);
    scoreStdDev = stdDev(adjustedScores);
    actionMean = average(actions);
    actionStdDev = stdDev(actions);
    const minActions = actions.length ? Math.min(...actions) : 0;

    const passOutlierSet = new Set(activeReachable
      .filter((item) => {
        const scoreThreshold = Math.max(8, scoreStdDev * 1.6);
        const actionThreshold = Math.max(2, actionStdDev * 1.05);
        const scoreGap = Math.abs(item.adjustedScore - scoreMean);
        const actionGap = item.bestActions - actionMean;
        const minActionGap = item.bestActions - minActions;
        const scoreOutlier = scoreGap > scoreThreshold;
        const actionOutlier = actionGap > actionThreshold;
        const severeActionGap = minActionGap >= 4;
        const flagged = scoreOutlier || (actionOutlier && severeActionGap);

        if (flagged) {
          outlierDiagnostics.set(item.index, {
            scoreOutlier,
            actionOutlier,
            severeActionGap,
            scoreGap: Number(scoreGap.toFixed(2)),
            scoreThreshold: Number(scoreThreshold.toFixed(2)),
            actionGap: Number(actionGap.toFixed(2)),
            actionThreshold: Number(actionThreshold.toFixed(2)),
            minActionGap: Number(minActionGap.toFixed(2))
          });
        }

        return flagged;
      })
      .map((item) => item.index));
    const nextOutlierSet = new Set([...outlierSet, ...passOutlierSet]);

    if (sameSet(nextOutlierSet, outlierSet)) {
      outlierSet = nextOutlierSet;
      break;
    }

    outlierSet = nextOutlierSet;
    activeIndices = new Set(reachable
      .map((item) => item.index)
      .filter((index) => !outlierSet.has(index)));
  }

  activeReachable = reachable.filter((item) => activeIndices.has(item.index));
  const adjustedScores = activeReachable.map((item) => item.adjustedScore);
  const distances = activeReachable.map((item) => item.bestDistance);
  const actions = activeReachable.map((item) => item.bestActions);
  const overlapValues = activeReachable.map((item) => item.trafficPenalty);
  const threatValues = activeReachable.map((item) => item.lateralThreat);
  scoreMean = average(adjustedScores);
  scoreStdDev = stdDev(adjustedScores);
  const distanceMean = average(distances);
  actionMean = average(actions);
  const overlapMean = average(overlapValues);
  const threatMean = average(threatValues);
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
    goal,
    starts: startAnalyses,
    summary: {
      flagCount: flags.length,
      flagAreaScore,
      reachableStarts: reachable.length,
      totalStarts: starts.length,
      averageTrafficPenalty: Number(overlapMean.toFixed(2)),
      averageLateralThreat: Number(threatMean.toFixed(2)),
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

export function analyzeFlagLeg(tileMap, from, goal, options = {}) {
  const facings = options.facings ?? ROTATION_ORDER;
  const routesPerFacing = options.routesPerFacing ?? 3;
  const maxDistinctRoutes = options.maxDistinctRoutes ?? 4;
  const previousLegRoutes = options.previousLegRoutes ?? [];
  const trafficScale = computeLegTrafficScale(options.playerCount ?? 4);
  const allRoutes = [];

  facings.forEach((facing) => {
    const routes = enumerateRoutes(tileMap, {
      x: from.x,
      y: from.y,
      facing
    }, goal, {
      maxRoutes: routesPerFacing,
      maxExpansions: options.maxExpansions,
      recoveryRule: options.recoveryRule,
      lessDeadlyGame: options.lessDeadlyGame,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
    });

    routes.forEach((route) => {
      allRoutes.push({
        ...route,
        startFacing: facing
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
  const intraLegThreat = averagePairwiseThreat(tileMap, distinctRoutes);
  const crossLegThreat = averageCrossLegThreat(tileMap, distinctRoutes, previousLegRoutes);
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
