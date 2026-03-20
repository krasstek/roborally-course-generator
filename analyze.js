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

function getGear(tile) {
  return (tile?.features || []).find((feature) => feature.type === "gear") ?? null;
}

function isPit(tile) {
  return (tile?.features || []).some((feature) => feature.type === "pit");
}

function getTilePenalty(tile) {
  let penalty = 0;

  for (const feature of tile?.features || []) {
    if (feature.type === "laser") {
      penalty += 3 + (feature.damage || 1);
    } else if (feature.type === "push") {
      penalty += 2;
    } else if (feature.type === "gear") {
      penalty += 1.5;
    } else if (feature.type === "belt") {
      penalty += feature.speed === 2 ? 0.75 : 0.5;
    } else if (feature.type === "battery") {
      penalty -= 2;
    }
  }

  return penalty;
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

function canMoveBetween(tileMap, from, to, dir) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const toTile = tileMap.get(tileKey(to.x, to.y));

  if (!fromTile) {
    return { ok: false, crash: EDGE_BEHAVIOR === "pit", offBoard: true };
  }

  if (!toTile) {
    return {
      ok: false,
      crash: EDGE_BEHAVIOR === "pit",
      offBoard: true
    };
  }

  const fromWalls = getWalls(fromTile);
  const toWalls = getWalls(toTile);

  if (fromWalls.has(dir) || toWalls.has(OPPOSITE[dir])) {
    return { ok: false, crash: false, offBoard: false };
  }

  if (isPit(toTile)) {
    return { ok: false, crash: true, offBoard: false };
  }

  return { ok: true, crash: false, offBoard: false };
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

function moveOneStep(tileMap, state, dir, mode) {
  const delta = DIRS[dir];
  const next = {
    x: state.x + delta.dx,
    y: state.y + delta.dy
  };
  const moveCheck = canMoveBetween(tileMap, state, next, dir);

  if (!moveCheck.ok) {
    return {
      state: cloneState(state),
      blocked: !moveCheck.crash,
      crashed: moveCheck.crash,
      traversed: moveCheck.crash ? [{ x: next.x, y: next.y }] : [],
      conveyorSteps: [],
      hazard: moveCheck.crash ? 25 : 0,
      distance: moveCheck.crash ? 1 : 0,
      forcedDistance: mode === "belt" && moveCheck.crash ? 1 : 0
    };
  }

  const currentTile = tileMap.get(tileKey(state.x, state.y));
  const nextTile = tileMap.get(tileKey(next.x, next.y));
  const belt = getBelt(nextTile);
  const currentBelt = mode === "belt" ? getBelt(currentTile) : null;
  let nextFacing = state.facing;
  let turned = false;

  if (mode === "belt" && belt && belt.speed === currentBelt?.speed && isPerpendicular(dir, belt.dir)) {
    const quarterTurn = quarterTurnBetween(dir, belt.dir);
    nextFacing = quarterTurn ? rotateFacing(state.facing, quarterTurn) : state.facing;
    turned = Boolean(quarterTurn);
  }

  return {
    state: {
      x: next.x,
      y: next.y,
      facing: nextFacing ?? state.facing
    },
    blocked: false,
    crashed: false,
    traversed: [{ x: next.x, y: next.y }],
    conveyorSteps: mode === "belt" ? [{
      from: { x: state.x, y: state.y },
      to: { x: next.x, y: next.y },
      dir,
      speed: currentBelt?.speed ?? belt?.speed ?? 1,
      turned
    }] : [],
    hazard: getTilePenalty(nextTile),
    distance: 1,
    forcedDistance: mode === "belt" ? 1 : 0
  };
}

function resolveConveyorPhase(tileMap, state, eligibleSpeed) {
  const workingState = cloneState(state);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = 0;
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

    const step = moveOneStep(tileMap, workingState, belt.dir, "belt");
    traversed.push(...step.traversed);
    conveyorSteps.push(...(step.conveyorSteps || []));
    hazard += step.hazard;
    distance += step.distance;
    forcedDistance += step.forcedDistance;
    stepsTaken += 1;

    if (step.crashed || step.blocked) {
      return {
        state: step.state,
        traversed,
        conveyorSteps,
        hazard,
        distance,
        forcedDistance,
        crashed: step.crashed
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
    distance,
    forcedDistance,
    crashed: false
  };
}

function simulateAction(tileMap, startState, action) {
  const state = cloneState(startState);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = getTilePenalty(tileMap.get(tileKey(state.x, state.y)));
  let distance = 0;
  let forcedDistance = 0;
  let crashed = false;
  let blocked = false;

  if (action.type === "turn") {
    state.facing = rotateFacing(state.facing, action.rotation);
  } else if (action.type === "move") {
    const steps = action.steps ?? 1;

    for (let index = 0; index < steps; index += 1) {
      const step = moveOneStep(tileMap, state, movementDir(state.facing, action.relative), "manual");
      traversed.push(...step.traversed);
      hazard += step.hazard;
      distance += step.distance;

      if (step.crashed || step.blocked) {
        return {
          action: action.id,
          from: cloneState(startState),
          to: step.state,
          traversed,
          conveyorSteps,
          hazard,
          distance,
          forcedDistance,
          crashed: step.crashed,
          blocked: step.blocked
        };
      }

      state.x = step.state.x;
      state.y = step.state.y;
      state.facing = step.state.facing;
    }
  }

  const blue = resolveConveyorPhase(tileMap, state, 2);
  traversed.push(...blue.traversed);
  conveyorSteps.push(...blue.conveyorSteps);
  hazard += blue.hazard;
  distance += blue.distance;
  forcedDistance += blue.forcedDistance;
  crashed = blue.crashed;
  state.x = blue.state.x;
  state.y = blue.state.y;
  state.facing = blue.state.facing;

  if (!crashed) {
    const green = resolveConveyorPhase(tileMap, state, 1);
    traversed.push(...green.traversed);
    conveyorSteps.push(...green.conveyorSteps);
    hazard += green.hazard;
    distance += green.distance;
    forcedDistance += green.forcedDistance;
    crashed = green.crashed;
    state.x = green.state.x;
    state.y = green.state.y;
    state.facing = green.state.facing;
  }

  if (!crashed) {
    const rotated = applyEndOfStepRotation(tileMap, state);
    state.x = rotated.x;
    state.y = rotated.y;
    state.facing = rotated.facing;
  }

  return {
    action: action.id,
    from: cloneState(startState),
    to: state,
    traversed,
    conveyorSteps,
    hazard,
    distance,
    forcedDistance,
    crashed,
    blocked
  };
}

function buildTimeline(transitions, start) {
  const timeline = [{ x: start.x, y: start.y }];

  for (const transition of transitions) {
    for (const point of transition.traversed) {
      timeline.push({ x: point.x, y: point.y });
    }

    if (transition.traversed.length === 0) {
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

function scoreConveyorStep(step, goal) {
  const before = heuristic(step.from, goal);
  const after = heuristic(step.to, goal);
  const progress = before - after;
  const base = step.speed === 2 ? 0.4 : 0.25;
  let penalty = base;

  if (progress > 0) {
    penalty -= step.speed === 2 ? 0.2 : 0.15;
  } else if (progress === 0) {
    penalty += step.speed === 2 ? 0.85 : 0.6;
  } else {
    penalty += step.speed === 2 ? 1.8 : 1.2;
  }

  if (step.turned) {
    penalty += step.speed === 2 ? 1.1 : 0.8;
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

function scoreRoute(route, goal) {
  const goalReached = route.finalState.x === goal.x && route.finalState.y === goal.y;
  const conveyorComplexity = scoreConveyorComplexity(route, goal);
  const score = route.actions * 5 + route.distance * 2 + route.hazard + conveyorComplexity;

  return {
    actions: route.actions,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    conveyorComplexity,
    hazard: Number(route.hazard.toFixed(2)),
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

  const queue = [
    createQueueEntry({
      finalState: startState,
      transitions: [],
      actions: 0,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      baseCost: 0,
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
      const transition = simulateAction(tileMap, current.finalState, action);
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const nextStateKey = stateKey(transition.to);
      if (current.visited.has(nextStateKey)) {
        continue;
      }

      const actionPenalty = getActionPenalty(action);
      const reversePenalty = action.id === "BACK" ? 2.5 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 1.5 : action.id === "FORWARD_3" ? 3 : 0;
      const conveyorComplexity = scoreConveyorComplexity({
        transitions: [transition]
      }, goal);
      const nextRoute = {
        finalState: transition.to,
        transitions: [...current.transitions, transition],
        actions: current.actions + 1,
        distance: current.distance + transition.distance,
        forcedDistance: current.forcedDistance + transition.forcedDistance,
        hazard: current.hazard + transition.hazard,
        baseCost: current.baseCost + transition.hazard + transition.distance * 2 + actionPenalty + reversePenalty + heavyMovePenalty + conveyorComplexity,
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

  return completed;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    set.add(`${tileKey(from.x, from.y)}>${tileKey(to.x, to.y)}`);
  }

  return set;
}

function hasLineOfSight(tileMap, from, to) {
  if (from.x !== to.x && from.y !== to.y) {
    return false;
  }

  if (from.x === to.x) {
    const dir = to.y > from.y ? "S" : "N";
    const step = to.y > from.y ? 1 : -1;

    for (let y = from.y; y !== to.y; y += step) {
      if (!canMoveBetween(tileMap, { x: from.x, y }, { x: from.x, y: y + step }, dir).ok) {
        return false;
      }
    }

    return true;
  }

  const dir = to.x > from.x ? "E" : "W";
  const step = to.x > from.x ? 1 : -1;

  for (let x = from.x; x !== to.x; x += step) {
    if (!canMoveBetween(tileMap, { x, y: from.y }, { x: x + step, y: from.y }, dir).ok) {
      return false;
    }
  }

  return true;
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

function scoreFlagArea(tileMap, goal) {
  let score = 0;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = goal.x + dx;
      const y = goal.y + dy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 2) continue;

      const tile = tileMap.get(tileKey(x, y));
      if (!tile) continue;

      const proximityWeight = dist === 0 ? 2.5 : dist === 1 ? 2 : 1;

      for (const feature of tile.features || []) {
        if (feature.type === "wall") {
          score += (dist <= 1 ? 5 : 2.5) * proximityWeight * Math.max(1, (feature.sides || []).length);
        } else if (feature.type === "pit") {
          score += 4 * proximityWeight;
        } else if (feature.type === "laser") {
          score += (2 + (feature.damage || 1)) * proximityWeight;
        } else if (feature.type === "push") {
          score += 2.5 * proximityWeight;
        } else if (feature.type === "belt") {
          score += (feature.speed === 2 ? 2 : 1.25) * proximityWeight;
        } else if (feature.type === "gear") {
          score += 1.5 * proximityWeight;
        } else if (feature.type === "battery") {
          score -= 2 * proximityWeight;
        }
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
  const trafficScale = Math.max(0.5, playerCount / 4);
  const startAnalyses = starts.map((start, index) => {
    const routes = enumerateRoutes(tileMap, start, goal, {
      maxRoutes,
      maxExpansions: options.maxExpansions
    });

    return {
      index,
      start,
      reachable: routes.length > 0,
      routes
    };
  });

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
      analysis.lateralThreat = Number(startAnalyses.reduce((sum, other, otherIndex) => {
        if (otherIndex === index) return sum;
        return sum + lateralThreatPenalty(tileMap, selectedRoute, other.routes[other.selectedRouteIndex]);
      }, 0).toFixed(2));
      analysis.trafficPenalty = Number((Math.sqrt(analysis.overlapPenalty) + analysis.lateralThreat * 0.16).toFixed(2));
      analysis.adjustedScore = Number((analysis.bestScore + analysis.trafficPenalty).toFixed(2));
    } else {
      analysis.lateralThreat = Infinity;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
    }
  });

  const reachable = startAnalyses.filter((item) => item.reachable && item.selectedRoute);
  const adjustedScores = reachable.map((item) => item.adjustedScore);
  const distances = reachable.map((item) => item.bestDistance);
  const actions = reachable.map((item) => item.bestActions);
  const overlapValues = reachable.map((item) => item.trafficPenalty);
  const threatValues = reachable.map((item) => item.lateralThreat);
  const scoreMean = average(adjustedScores);
  const scoreStdDev = stdDev(adjustedScores);
  const distanceMean = average(distances);
  const actionMean = average(actions);
  const overlapMean = average(overlapValues);
  const threatMean = average(threatValues);
  const flagAreaScore = scoreFlagArea(tileMap, goal);

  const outliers = reachable
    .filter((item) => Math.abs(item.adjustedScore - scoreMean) > Math.max(5, scoreStdDev * 1.25))
    .map((item) => ({
      index: item.index,
      score: item.adjustedScore,
      delta: Number((item.adjustedScore - scoreMean).toFixed(2))
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
  const allRoutes = [];

  facings.forEach((facing) => {
    const routes = enumerateRoutes(tileMap, {
      x: from.x,
      y: from.y,
      facing
    }, goal, {
      maxRoutes: routesPerFacing,
      maxExpansions: options.maxExpansions
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
    Math.max(0, distinctRoutes.length * 18 - intraLegOverlap * 35 - crossLegOverlap * 20 - intraLegThreat * 0.8 - crossLegThreat * 0.7).toFixed(2)
  );
  const congestionScore = Number(
    (intraLegOverlap * 40 + crossLegOverlap * 30 + intraLegThreat * 2.2 + crossLegThreat * 1.8 + Math.max(0, 3 - distinctRoutes.length) * 10).toFixed(2)
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
