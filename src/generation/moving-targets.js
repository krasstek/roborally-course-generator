// Robo Rally Course Randomizer - Moving Targets: checkpoint traces along conveyors, re-entry points and per-register timelines
import { getTilePenaltyForFeature } from "../../feature-weights.js";
import { CARDINAL_DIRS, OPPOSITE_DIRS } from "./config.js";

export function getTileBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

export function getTileWalls(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") {
      continue;
    }
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

export function isBlockedBetween(tileMap, from, to, dir) {
  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  const fromWalls = getTileWalls(fromTile);
  const toWalls = getTileWalls(toTile);
  return fromWalls.has(dir) || toWalls.has(OPPOSITE_DIRS[dir]);
}

export function getConveyorSuccessor(tileMap, point) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || !CARDINAL_DIRS[belt.dir]) {
    return null;
  }

  const vector = CARDINAL_DIRS[belt.dir];
  const next = {
    x: point.x + vector.dx,
    y: point.y + vector.dy
  };
  const nextTile = tileMap.get(`${next.x},${next.y}`);
  if (!nextTile || isBlockedBetween(tileMap, point, next, belt.dir) || !getTileBelt(nextTile)) {
    return null;
  }

  return next;
}

export function getConveyorPredecessors(tileMap, point) {
  if (!tileMap) {
    return [];
  }

  const predecessors = [];
  for (const vector of Object.values(CARDINAL_DIRS)) {
    const previous = {
      x: point.x - vector.dx,
      y: point.y - vector.dy
    };
    const successor = getConveyorSuccessor(tileMap, previous);
    if (successor && successor.x === point.x && successor.y === point.y) {
      predecessors.push(previous);
    }
  }

  return predecessors;
}

export function getMovingTraceStepLimit(tileMap, options = {}) {
  if (Number.isFinite(options.maxTraceSteps)) {
    return Math.max(1, options.maxTraceSteps);
  }

  return Math.min(180, Math.max(48, tileMap?.size ?? 48));
}

export function pointStartsClosedConveyorLoop(tileMap, point, options = {}) {
  if (!tileMap) {
    return false;
  }

  const startKey = `${point.x},${point.y}`;
  const startTile = tileMap.get(startKey);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    return false;
  }

  const visited = new Set();
  let current = { x: point.x, y: point.y };

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);

  for (let step = 0; step < maxTraceSteps; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      return key === startKey;
    }
    visited.add(key);

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      return false;
    }

    current = next;
  }

  return false;
}

export function getMovingCheckpointTrace(tileMap, point, cache = null, options = {}) {
  if (!tileMap) {
    return {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: []
    };
  }

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);
  const cacheKey = `${point.x},${point.y}:${maxTraceSteps}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const startTile = tileMap.get(`${point.x},${point.y}`);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    const result = {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: [{ x: point.x, y: point.y }]
    };
    cache?.set(cacheKey, result);
    return result;
  }

  const coverage = [];
  const visited = new Set();
  const directions = [];
  let current = { x: point.x, y: point.y };
  let wraps = false;
  let fastCount = 0;
  let hazardLoad = 0;

  for (let step = 0; step < maxTraceSteps; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      wraps = true;
      break;
    }

    visited.add(key);
    coverage.push({ x: current.x, y: current.y });
    const tile = tileMap.get(key);
    const belt = getTileBelt(tile);
    if (!belt || !CARDINAL_DIRS[belt.dir]) {
      break;
    }

    directions.push(belt.dir);
    if (belt.speed === 2) {
      fastCount += 1;
    }

    for (const feature of tile?.features || []) {
      if (feature.type === "checkpoint" || feature.type === "wall" || feature.type === "belt" || feature.type === "battery" || feature.type === "homingMissile") {
        continue;
      }
      hazardLoad += getTilePenaltyForFeature(feature, {
        batteryActive: true,
        lessSpammyGame: options.lessSpammyGame,
        criticalSpam: options.criticalSpam,
        criticalHaywire: options.criticalHaywire,
        permanentShutdown: options.permanentShutdown
      });
    }

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      break;
    }

    current = next;
  }

  let turnCount = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) {
      turnCount += 1;
    }
  }

  const result = {
    moving: coverage.length > 1,
    wraps,
    pathLength: coverage.length,
    turnCount,
    fastCount,
    hazardLoad: Number(hazardLoad.toFixed(2)),
    coverage
  };
  cache?.set(cacheKey, result);
  return result;
}

export function findMovingCheckpointReentryPoint(tileMap, point) {
  if (!tileMap) {
    return { x: point.x, y: point.y };
  }

  if (pointStartsClosedConveyorLoop(tileMap, point, { maxTraceSteps: getMovingTraceStepLimit(tileMap) })) {
    return { x: point.x, y: point.y };
  }

  const queue = [{ x: point.x, y: point.y, depth: 0 }];
  const visited = new Set([`${point.x},${point.y}`]);
  let best = { x: point.x, y: point.y, depth: 0 };

  while (queue.length) {
    const current = queue.shift();
    const predecessors = getConveyorPredecessors(tileMap, current);

    if (!predecessors.length) {
      if (
        current.depth > best.depth ||
        (current.depth === best.depth && `${current.x},${current.y}` < `${best.x},${best.y}`)
      ) {
        best = current;
      }
      continue;
    }

    for (const predecessor of predecessors) {
      const key = `${predecessor.x},${predecessor.y}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({
        x: predecessor.x,
        y: predecessor.y,
        depth: current.depth + 1
      });
    }
  }

  return { x: best.x, y: best.y };
}

export function summarizeMovingTargets(tileMap, checkpoints = [], options = {}) {
  const traceCache = new Map();
  const active = checkpoints
    .map((checkpoint) => ({
      checkpoint,
      trace: getMovingCheckpointTrace(tileMap, checkpoint, traceCache, options)
    }))
    .filter((entry) => entry.trace.moving);

  if (!active.length) {
    return {
      activeCount: 0,
      totalPathLength: 0,
      totalTurns: 0,
      totalHazardLoad: 0,
      fastSegments: 0,
      coverageTiles: 0,
      wrapCount: 0,
      difficultyBonus: 0,
      lengthBonus: 0
    };
  }

  const coverageTiles = new Set();
  let totalPathLength = 0;
  let totalTurns = 0;
  let totalHazardLoad = 0;
  let fastSegments = 0;
  let wrapCount = 0;

  for (const { trace } of active) {
    totalPathLength += trace.pathLength;
    totalTurns += trace.turnCount;
    totalHazardLoad += trace.hazardLoad;
    fastSegments += trace.fastCount;
    if (trace.wraps) {
      wrapCount += 1;
    }
    trace.coverage.forEach((tile) => coverageTiles.add(`${tile.x},${tile.y}`));
  }

  const difficultyBonus = Number((
    active.length * 1.6 +
    Math.max(0, totalPathLength - active.length) * 0.42 +
    totalTurns * 0.3 +
    fastSegments * 0.22 +
    totalHazardLoad * 0.08
  ).toFixed(2));
  const lengthBonus = Number((
    active.length * 0.75 +
    Math.max(0, totalPathLength - active.length) * 0.25 +
    totalTurns * 0.14 +
    wrapCount * 0.2
  ).toFixed(2));

  return {
    activeCount: active.length,
    totalPathLength,
    totalTurns,
    totalHazardLoad: Number(totalHazardLoad.toFixed(2)),
    fastSegments,
    coverageTiles: coverageTiles.size,
    wrapCount,
    difficultyBonus,
    lengthBonus
  };
}

export function moveCheckpointOneConveyorStep(tileMap, point, eligibleSpeed, reentry) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || belt.speed !== eligibleSpeed || !CARDINAL_DIRS[belt.dir]) {
    return { ...point };
  }

  const next = getConveyorSuccessor(tileMap, point);
  if (!next) {
    return { ...reentry };
  }

  return next;
}

export function advanceMovingCheckpointRegister(tileMap, point, reentry) {
  let current = { ...point };

  for (let step = 0; step < 2; step += 1) {
    const next = moveCheckpointOneConveyorStep(tileMap, current, 2, reentry);
    if (next.x === current.x && next.y === current.y) {
      break;
    }
    current = next;
  }

  current = moveCheckpointOneConveyorStep(tileMap, current, 1, reentry);
  return current;
}

export function buildMovingCheckpointTimeline(tileMap, checkpoint, id, options = {}) {
  const trace = getMovingCheckpointTrace(tileMap, checkpoint, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  if (!trace.moving) {
    return null;
  }

  const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
  const reentryTrace = getMovingCheckpointTrace(tileMap, reentry, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  const maxActions = options.maxActions ?? 16;
  const positions = [{ x: checkpoint.x, y: checkpoint.y }];
  const seen = new Map([[`${checkpoint.x},${checkpoint.y}`, 0]]);
  let current = { x: checkpoint.x, y: checkpoint.y };
  let periodStart = null;
  let periodLength = null;

  for (let action = 1; action <= maxActions; action += 1) {
    current = advanceMovingCheckpointRegister(tileMap, current, reentry);
    positions.push({ x: current.x, y: current.y });
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) {
      periodStart = seen.get(key);
      periodLength = action - periodStart;
      break;
    }
    seen.set(key, action);
  }

  return {
    id,
    reentry,
    positions,
    displayPositions: reentryTrace.coverage?.length ? reentryTrace.coverage : trace.coverage?.length ? trace.coverage : positions,
    periodStart: periodStart ?? Math.max(0, positions.length - 1),
    periodLength: periodLength ?? 0,
    maxActions,
    trace
  };
}

export function buildMovingTargetTimelines(tileMap, checkpoints = [], enabled = false, options = {}) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  return checkpoints.map((checkpoint, index) => (
    buildMovingCheckpointTimeline(tileMap, checkpoint, index + 1, options)
  ));
}

export function collectMovingTargetReentryMarkers(tileMap, checkpoints = [], enabled = false) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  const traceCache = new Map();
  const markers = checkpoints
    .map((checkpoint, index) => {
      const trace = getMovingCheckpointTrace(tileMap, checkpoint, traceCache);
      if (!trace.moving) {
        return null;
      }

      const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
      return {
        id: index + 1,
        label: `R${index + 1}`,
        x: reentry.x,
        y: reentry.y
      };
    })
    .filter(Boolean);

  const grouped = new Map();
  markers.forEach((marker) => {
    const key = `${marker.x},${marker.y}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(marker.id);
      existing.label = `R${existing.ids.join("/")}`;
      return;
    }

    grouped.set(key, {
      ...marker,
      ids: [marker.id]
    });
  });

  return [...grouped.values()];
}
