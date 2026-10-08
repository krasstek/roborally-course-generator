// Robo Rally Course Randomizer - traffic mechanics: route geometry, threats and overlap, robot interaction, reboot pile-ups, forecast confidence, occupancy and route mixtures
import {
  getDamageDeckPressureMultipliers,
  getTilePenaltyForFeature
} from "../../feature-weights.js";
import { crossesLedgeBoundary, getLedgeElevationDelta, tileKey } from "./board-geometry.js";
import {
  DIRS,
  PROGRAM_CARD_COUNTS,
  PROGRAM_CARD_IDS,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST,
  ROTATION_ORDER
} from "./constants.js";
import {
  DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
  advanceDamageEconomyToTurn,
  applyExpectedDamageToEconomyState,
  createDamageEconomyState,
  getDamageEconomyClogRegisterEquivalents,
  getDamageEconomyHaywireEventProbability,
  getDamageEconomyProgrammingSummary
} from "./damage-economy.js";
import { average, clamp } from "../shared/math.js";
import { canMoveBetween, directionBetween, heuristic } from "./movement.js";
import {
  getRebootEndedAbsoluteActions,
  getRebootRoutePenalty,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";
import { buildTimeline } from "./route-search.js";

export const ROUTE_PATH_KEY_CACHE = new WeakMap();
export const ROUTE_TILE_SET_CACHE = new WeakMap();
export const ROUTE_EDGE_SET_CACHE = new WeakMap();
export const ROUTE_DIRECTIONS_CACHE = new WeakMap();
export const TRAFFIC_TIMELINE_CACHE = new WeakMap();
export const TRAFFIC_PAIR_PROFILE_CACHE = new WeakMap();
export const TRAFFIC_DISPLACEMENT_CACHE = new WeakMap();
export const TRAFFIC_CONTROL_SEVERITY_CACHE = new WeakMap();

export const LINE_OF_SIGHT_CACHE = new WeakMap();
export const ROUTE_SIMILARITY_CACHE = new Map();
export const OVERLAP_PENALTY_CACHE = new Map();
export const LATERAL_THREAT_CACHE = new Map();
export const REAR_THREAT_CACHE = new Map();
export const ROUTE_PAIR_CACHE_LIMIT = 2500;

export function setBoundedCacheValue(cache, key, value, limit = ROUTE_PAIR_CACHE_LIMIT) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= limit) {
    cache.delete(cache.keys().next().value);
  }

  cache.set(key, value);
}

export function getRouteLegIndexForAbsoluteAction(route, absoluteAction) {
  const target = Math.max(1, Math.floor(Number(absoluteAction) || 1));
  const legs = getTrafficLegs(route);
  let nearestIndex = 0;
  for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
    const leg = legs[legIndex];
    const transitions = Array.isArray(leg?.transitions) ? leg.transitions : [];
    let elapsed = Math.max(0, Number(leg?.absoluteStartAction) || 0);
    for (const transition of transitions) {
      const executed = getTransitionAbsoluteAction(transition, elapsed + 1);
      if (executed === target) return legIndex;
      if (executed <= target) nearestIndex = legIndex;
      elapsed = transition?.rebooted
        ? getRebootEndedAbsoluteActions(executed)
        : executed;
    }
  }
  return Math.min(Math.max(0, nearestIndex), Math.max(0, legs.length - 1));
}

export function computeLegTrafficScale(playerCount) {
  if (playerCount <= 1) {
    return 0;
  }

  return Number(clamp((playerCount - 1) / 7, 0, 1).toFixed(3));
}

export function buildTileSet(route, goal) {
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

export function buildEdgeSet(route) {
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

export function hasLineOfSight(tileMap, from, to) {
  const fromKey = tileKey(from.x, from.y);
  const toKey = tileKey(to.x, to.y);
  // Red/green walls make LOS directional: GREEN -> RED can pass while the
  // reverse RED -> GREEN ray is blocked. Never merge opposite ray directions
  // into one cache entry.
  const pairKey = `${fromKey}>${toKey}`;
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

export function getRouteDirectionAt(path, index) {
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

export function getRoutePathKey(route) {
  const cached = ROUTE_PATH_KEY_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const key = route.path.map((point) => `${point.x},${point.y}${point.jump ? "j" : ""}`).join("|");
  ROUTE_PATH_KEY_CACHE.set(route, key);
  return key;
}

export function getThreatOptionKey(options = {}) {
  return [
    options.lessSpammyGame ? 1 : 0,
    options.criticalSpam ? 1 : 0,
    options.criticalHaywire ? 1 : 0,
    options.permanentShutdown ? 1 : 0
  ].join("");
}

export function isBehindAlongDir(lead, trailing, dir) {
  if (dir === "N") return trailing.x === lead.x && trailing.y > lead.y;
  if (dir === "E") return trailing.y === lead.y && trailing.x < lead.x;
  if (dir === "S") return trailing.x === lead.x && trailing.y < lead.y;
  if (dir === "W") return trailing.y === lead.y && trailing.x > lead.x;
  return false;
}

export function getRobotLaserThreatMultipliers(options = {}) {
  let lateral = 1;
  let rear = 1;
  let frontal = 1;
  const damagePressure = getDamageDeckPressureMultipliers(options);

  // Set to Kill / Set to Stun do not change whether a shot exists. Their
  // consequences are owned by the chronological damage economy downstream.

  lateral *= damagePressure.robotTraffic;
  rear *= damagePressure.robotTraffic;
  frontal *= damagePressure.robotTraffic;

  return { lateral, rear, frontal };
}

export function getTrafficPath(route) {
  return route?.trafficPath ?? route?.path ?? [];
}

export function getTrafficRouteKey(route) {
  const path = getTrafficPath(route);
  return path.map((point) => `${point.x},${point.y}${point.jump ? "!" : ""}`).join("|");
}

export function applyTrafficGraceToRoute(route, graceRegisters = 0) {
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

export function lateralThreatPenalty(tileMap, routeA, routeB, options = {}) {
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

export function rearThreatPenalty(tileMap, routeA, routeB, options = {}) {
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

export function routeSimilarity(routeA, routeB, goal) {
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

export function compareScoredRouteLike(left, right) {
  const leftScore = Number(left?.score);
  const rightScore = Number(right?.score);
  const leftFinite = Number.isFinite(leftScore);
  const rightFinite = Number.isFinite(rightScore);
  if (leftFinite && rightFinite) return leftScore - rightScore;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

export function dedupeRoutes(routes) {
  const seen = new Set();
  const out = [];

  for (const route of routes || []) {
    // Null/undefined entries are never meaningful route candidates.  Treating
    // them as data allowed sparse search/cache results to survive until a later
    // Array.sort comparator dereferenced left.score/right.score in Safari.
    if (!route) continue;
    const key = getRoutePathKey(route);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }

  return out;
}

export function selectDistinctRoutes(routes, goal, limit = 4) {
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

// Cheap Any/Any traffic alternatives use the completion pool the search already
// found; they do not increase expansion caps. Keep the best route, then retain
// one meaningfully different route within the same score allowance used by the
// contextual stitched beam. The ordinary route selector remains stricter.
export function selectContextualTrafficAlternativeRoutes(routes, goal, limit = 2) {
  const sorted = [...(routes || [])].filter(Boolean).sort(
    compareScoredRouteLike
  );
  if (!sorted.length || limit <= 0) return [];
  const best = sorted[0];
  if (limit === 1 || sorted.length === 1) return [best];

  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.slice(1).filter(
    (candidate) => candidate.score <= best.score + scoreAllowance
  );
  let diverse = null;
  let diverseNovelty = -1;
  for (const candidate of eligible) {
    const novelty = 1 - routeSimilarity(best, candidate, goal);
    if (
      novelty > diverseNovelty + 0.001 ||
      (
        Math.abs(novelty - diverseNovelty) <= 0.001 &&
        candidate.score < (diverse?.score ?? Infinity)
      )
    ) {
      diverse = candidate;
      diverseNovelty = novelty;
    }
  }

  return diverse && diverseNovelty >= 0.1
    ? [best, diverse].sort(compareScoredRouteLike)
    : [best];
}

export function averagePairwiseOverlap(routes, goal) {
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

export function averageCrossLegOverlap(routes, previousLegRoutes, goal) {
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

export function averagePairwiseThreat(tileMap, routes, options = {}) {
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

export function averageCrossLegThreat(tileMap, routes, previousLegRoutes, options = {}) {
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

export const FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT = 0.4;
export const FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT = 1;
// v49ej board-mechanic ownership.
// Homing Missile final value is RE-native. A neutral one-damage reference is
// derived from the damage-economy model itself: inject one standard damage draw
// into a clean state, advance to the next programming turn, then value (a) the
// resulting SPAM supply pressure against ordinary common-card availability and
// (b) the Haywire/control-clog distribution through the production clog curve.
// This is deliberately a neutral reference because the future target is chosen
// strategically but its exact deck/route state is unknown. The missile still
// deals only 1 damage; target choice makes the opportunity worth ~2 damage-
// equivalents. Target-choice mental burden remains a separate positive cost.
export const HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS = 2;

export function getNeutralOneDamageEconomyReferenceRE() {
  const state = createDamageEconomyState();
  applyExpectedDamageToEconomyState(
    state,
    1,
    REGISTER_COUNT,
    getDamageEconomyHaywireEventProbability(1)
  );
  advanceDamageEconomyToTurn(state, 2);

  const commonActionIds = PROGRAM_CARD_IDS.filter(
    (actionId) => (PROGRAM_CARD_COUNTS.get(actionId) || 0) >= 3
  );
  const supplySamples = commonActionIds.map((actionId) => (
    getDamageEconomyProgrammingSummary(0, [actionId], state, {})
      .spamSupplyRegisterEquivalents
  ));
  const spamSupplyRE = supplySamples.length ? average(supplySamples) : 0;

  const haywireDistribution = Array.isArray(state.activeHaywireDistribution)
    ? state.activeHaywireDistribution
    : [1, 0, 0, 0, 0, 0];
  const haywireClogRE = haywireDistribution.reduce(
    (sum, probability, clogCount) => sum +
      (Number(probability) || 0) *
      getDamageEconomyClogRegisterEquivalents(clogCount),
    0
  );

  return Math.max(0, spamSupplyRE + haywireClogRE);
}

export const HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE =
  getNeutralOneDamageEconomyReferenceRE();
export const HOMING_MISSILE_STRATEGIC_CREDIT_RE =
  HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS *
  HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE;
export const HOMING_MISSILE_TARGET_CHOICE_EVENT_WEIGHT = 1;


export function getRegisterTimeline(route) {
  if (!route?.transitions?.length) {
    return [];
  }

  const cached = TRAFFIC_TIMELINE_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const startAction = Math.max(0, Number(route.absoluteStartAction) || 0);
  let elapsedAbsoluteActions = startAction;
  const timeline = route.transitions.map((transition, index) => {
    const before = transition.from ?? route.initialState;
    const after = transition.to ?? transition.state ?? before;
    const boardComplexity =
      ((transition.conveyorSteps || []).length * 0.35) +
      ((transition.boardEvents || []).length * 0.18) +
      (transition.gearTurned ? 0.25 : 0) +
      ((transition.hazard || 0) > 0 ? 0.2 : 0);
    const absoluteRegister = getTransitionAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(absoluteRegister)
      : absoluteRegister;

    return {
      absoluteRegister,
      legRegister: index + 1,
      before,
      after,
      facing: after?.facing ?? before?.facing,
      rebooted: Boolean(transition?.rebooted),
      rebootRecoverySource: transition?.rebootRecoverySource ?? null,
      uncertainty: Math.min(2.8, 0.75 + index * 0.12 + boardComplexity)
    };
  });

  TRAFFIC_TIMELINE_CACHE.set(route, timeline);
  return timeline;
}


export function isSameTurnSameSpaceRebootPair(pointA, pointB) {
  if (!pointA?.rebooted || !pointB?.rebooted || !pointA?.after || !pointB?.after) {
    return false;
  }
  const actionA = Math.max(1, Math.floor(Number(pointA.absoluteRegister) || 1));
  const actionB = Math.max(1, Math.floor(Number(pointB.absoluteRegister) || 1));
  const turnA = Math.floor((actionA - 1) / REGISTER_COUNT) + 1;
  const turnB = Math.floor((actionB - 1) / REGISTER_COUNT) + 1;
  return turnA === turnB &&
    pointA.after.x === pointB.after.x &&
    pointA.after.y === pointB.after.y;
}

export function getRouteRebootPileupEvents(route) {
  return getRegisterTimeline(route)
    .filter((entry) => entry?.rebooted && entry?.after)
    .map((entry) => {
      const absoluteAction = Math.max(
        1,
        Math.floor(Number(entry.absoluteRegister) || 1)
      );
      return {
        absoluteAction,
        turn: Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1,
        x: entry.after.x,
        y: entry.after.y,
        spaceKey: tileKey(entry.after.x, entry.after.y),
        legIndex: getRouteLegIndexForAbsoluteAction(route, absoluteAction)
      };
    });
}

export function summarizeSimultaneousRebootPileupForecast(
  route,
  selectedRouteEntries = [],
  confidenceByAbsoluteAction = null
) {
  const ownEvents = getRouteRebootPileupEvents(route);
  if (!ownEvents.length || !selectedRouteEntries?.length) {
    return {
      eventMass: 0,
      maximumTurnProbability: 0,
      byTurn: []
    };
  }

  const preparedOthers = selectedRouteEntries
    .map((entry) => ({
      route: entry?.route ?? entry,
      occupancyWeight: Number.isFinite(Number(entry?.occupancyWeight))
        ? Math.max(0, Number(entry.occupancyWeight))
        : 1,
      groupKey: Number.isInteger(entry?.startIndex)
        ? `start:${entry.startIndex}`
        : (entry?.route ?? entry)
    }))
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  const byTurnMap = new Map();
  for (const own of ownEvents) {
    const matchProbabilityByGroup = new Map();
    for (const other of preparedOthers) {
      const matches = getRouteRebootPileupEvents(other.route).some((event) => (
        event.turn === own.turn &&
        event.spaceKey === own.spaceKey
      ));
      if (!matches) continue;
      const existing = Math.max(
        0,
        Number(matchProbabilityByGroup.get(other.groupKey)) || 0
      );
      matchProbabilityByGroup.set(
        other.groupKey,
        Math.min(1, existing + other.occupancyWeight)
      );
    }

    let noneProbability = 1;
    for (const probability of matchProbabilityByGroup.values()) {
      noneProbability *= 1 - clamp(Number(probability) || 0, 0, 1);
    }
    const participantProbability = clamp(1 - noneProbability, 0, 1);
    if (participantProbability <= 0.000001) continue;
    const confidence = getRENativeTrafficConfidenceForAbsoluteAction(
      confidenceByAbsoluteAction,
      own.absoluteAction,
      1
    );
    const legWeight = own.legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
    const eventProbability = clamp(
      participantProbability * confidence * legWeight,
      0,
      1
    );
    if (eventProbability <= 0.000001) continue;

    const existing = byTurnMap.get(own.turn);
    if (!existing) {
      byTurnMap.set(own.turn, {
        turn: own.turn,
        absoluteAction: own.absoluteAction,
        x: own.x,
        y: own.y,
        legIndex: own.legIndex,
        participantProbability,
        confidence,
        legWeight,
        eventProbability
      });
    } else {
      // A reboot normally ends the turn, so multiple own reboot events in one
      // turn should not occur. Combine defensively if an unusual trace has them.
      existing.eventProbability = clamp(
        1 - (1 - existing.eventProbability) * (1 - eventProbability),
        0,
        1
      );
      existing.participantProbability = Math.max(
        existing.participantProbability,
        participantProbability
      );
    }
  }

  const byTurn = [...byTurnMap.values()]
    .sort((left, right) => left.turn - right.turn)
    .map((entry) => ({
      ...entry,
      participantProbability: Number(entry.participantProbability.toFixed(4)),
      confidence: Number(entry.confidence.toFixed(4)),
      legWeight: Number(entry.legWeight.toFixed(4)),
      eventProbability: Number(entry.eventProbability.toFixed(4))
    }));
  return {
    eventMass: Number(byTurn.reduce(
      (sum, entry) => sum + (Number(entry.eventProbability) || 0),
      0
    ).toFixed(4)),
    maximumTurnProbability: byTurn.length
      ? Number(Math.max(...byTurn.map((entry) => entry.eventProbability)).toFixed(4))
      : 0,
    byTurn
  };
}

export function getSimultaneousRebootClogIncrementREForTurn(
  damageTurn,
  eventProbability
) {
  const probability = clamp(Number(eventProbability) || 0, 0, 1);
  if (probability <= 0) return 0;
  const states = Array.isArray(damageTurn?.controlClogLoadDistribution)
    ? damageTurn.controlClogLoadDistribution
    : [];
  if (states.length) {
    const delta = states.reduce((sum, state) => {
      const stateProbability = Math.max(0, Number(state?.probability) || 0);
      const load = Math.max(0, Number(state?.load) || 0);
      return sum + stateProbability * (
        getDamageEconomyClogRegisterEquivalents(load + 1) -
        getDamageEconomyClogRegisterEquivalents(load)
      );
    }, 0);
    return Math.max(0, probability * delta);
  }
  const fallbackLoad = Math.max(
    0,
    Number(damageTurn?.expectedTotalControlClogLoad) || 0
  );
  return Math.max(0, probability * (
    getDamageEconomyClogRegisterEquivalents(fallbackLoad + 1) -
    getDamageEconomyClogRegisterEquivalents(fallbackLoad)
  ));
}

export function summarizeSimultaneousRebootPileupClogIncrement(
  damageSummary,
  pileupByTurn = []
) {
  const damageTurnByTurn = new Map(
    (damageSummary?.turns || []).map((turn) => [
      Math.max(1, Math.floor(Number(turn?.turn) || 1)),
      turn
    ])
  );
  const byTurn = (pileupByTurn || []).map((entry) => {
    const turn = Math.max(1, Math.floor(Number(entry?.turn) || 1));
    const incrementRE = getSimultaneousRebootClogIncrementREForTurn(
      damageTurnByTurn.get(turn),
      entry?.eventProbability
    );
    return {
      ...entry,
      turn,
      clogIncrementRE: Number(incrementRE.toFixed(4)),
      clogIncrementScore: Number((incrementRE * REGISTER_TEMPO_COST).toFixed(3))
    };
  });
  const totalRE = byTurn.reduce(
    (sum, entry) => sum + (Number(entry.clogIncrementRE) || 0),
    0
  );
  return {
    registerEquivalents: Number(totalRE.toFixed(4)),
    score: Number((totalRE * REGISTER_TEMPO_COST).toFixed(3)),
    byTurn
  };
}

export function getTemporalInteractionWeight(pointA, pointB) {
  const timeA = Number.isFinite(Number(pointA?.absoluteRegister))
    ? Number(pointA.absoluteRegister)
    : (pointA?.legRegister ?? 0);
  const timeB = Number.isFinite(Number(pointB?.absoluteRegister))
    ? Number(pointB.absoluteRegister)
    : (pointB?.legRegister ?? 0);
  const delta = Math.abs(timeA - timeB);
  const spread = Math.max(
    1,
    (pointA?.uncertainty ?? 1) + (pointB?.uncertainty ?? 1)
  );

  if (delta >= spread * 2.25) {
    return 0;
  }

  return Math.max(0, 1 - delta / (spread * 2.25));
}

export function classifyTrafficOrientation(reference, other) {
  if (!reference?.after || !other?.after) {
    return "side";
  }

  const facing = reference.facing ?? reference.after.facing;
  const vector = DIRS[facing];
  if (!vector) {
    return "side";
  }

  const dx = other.after.x - reference.after.x;
  const dy = other.after.y - reference.after.y;
  const forward = dx * vector.dx + dy * vector.dy;
  const lateral = Math.abs(dx * vector.dy - dy * vector.dx);

  if (Math.abs(forward) >= lateral) {
    return forward < 0 ? "rear" : "front";
  }

  return "side";
}

export function getStandardRobotLaserCost() {
  // A normal robot laser is anchored to the exact route-score cost of a normal
  // one-damage board laser. Cutting Floor applies to board lasers only, so the
  // reference deliberately uses neutral board-laser rules here.
  return getTilePenaltyForFeature(
    { type: "laser", damage: 1 },
    { cuttingFloor: false }
  );
}

export function getNearbyInteractionProbability(orientation, distance) {
  if (distance <= 0) return 1;

  if (orientation === "rear") {
    if (distance === 1) return 0.9;
    if (distance === 2) return 0.55;
    if (distance === 3) return 0.24;
    return 0;
  }

  if (orientation === "front") {
    if (distance === 1) return 0.95;
    if (distance === 2) return 0.72;
    if (distance === 3) return 0.48;
    if (distance === 4) return 0.24;
    if (distance === 5) return 0.1;
    return 0;
  }

  if (distance === 1) return 0.95;
  if (distance === 2) return 0.48;
  if (distance === 3) return 0.12;
  return 0;
}

export function getOrdinaryInterferenceCost() {
  // Blocking / replanning on otherwise harmless floor is real, but far cheaper
  // than taking a point of damage.
  return getStandardRobotLaserCost() * 0.2;
}

export function getRouteDeviationScore(timeline, timelineIndex, destination) {
  if (!timeline?.length || !destination) {
    return { disruption: 0, benefitCredit: 0 };
  }

  const lookAhead = timeline.slice(timelineIndex + 1, timelineIndex + 6);
  if (!lookAhead.length) {
    return { disruption: 0, benefitCredit: 0 };
  }

  let bestDistance = Infinity;
  let bestOffset = 0;

  lookAhead.forEach((future, offset) => {
    const distance = heuristic(destination, future.after);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = offset + 1;
    }
  });

  if (!Number.isFinite(bestDistance)) {
    return { disruption: 0, benefitCredit: 0 };
  }

  const damageUnit = getStandardRobotLaserCost();

  if (bestDistance === 0 && bestOffset >= 2) {
    return {
      disruption: 0,
      // Being shoved onto a future part of the route can save registers, but
      // treat that as an unreliable benefit rather than a planned shortcut.
      benefitCredit: Math.min(damageUnit * 0.55, (bestOffset - 1) * 0.6)
    };
  }

  return {
    disruption: Math.min(damageUnit * 1.25, bestDistance * 1.15),
    benefitCredit: 0
  };
}

export function getDisplacementConsequenceScore(
  tileMap,
  point,
  timeline,
  timelineIndex,
  options = {}
) {
  if (!point) {
    return 0;
  }

  const damageUnit = getStandardRobotLaserCost();
  let worst = 0;

  for (const [dir, delta] of Object.entries(DIRS)) {
    const destination = {
      x: point.x + delta.dx,
      y: point.y + delta.dy
    };
    const tile = tileMap.get(tileKey(destination.x, destination.y));
    const moveCheck = canMoveBetween(tileMap, point, destination, dir, {
      ...options,
      repulsorActive: false
    });

    if (!tile) {
      if (moveCheck.crash) {
        const pitEquivalent =
          damageUnit * 2 +
          getRebootRoutePenalty() * 0.45;
        worst = Math.max(worst, pitEquivalent);
      }
      continue;
    }

    if (!moveCheck.ok && !moveCheck.crash && !moveCheck.repulsor) {
      // A solid wall means this displacement cannot happen in that direction.
      continue;
    }

    let consequence = 0;
    const features = tile.features || [];

    if (moveCheck.crash || features.some((feature) => feature.type === "pit")) {
      // Normal pits deal two damage, plus a substantial but discounted reboot /
      // lost-program cost because an involuntary fall can occasionally help.
      consequence += damageUnit * 2 + getRebootRoutePenalty() * 0.45;
    } else {
      for (const feature of features) {
        if (
          feature.type === "laser" ||
          feature.type === "flamethrower" ||
          feature.type === "trapdoor" ||
          feature.type === "crusher" ||
          feature.type === "randomizer" ||
          feature.type === "oil"
        ) {
          consequence += Math.max(
            0,
            getTilePenaltyForFeature(feature, {
              ...options,
              onEntrance: true
            })
          );
        }
      }

      if (features.some((feature) => feature.type === "conveyor")) {
        consequence += damageUnit * 0.32;
      }
      if (features.some((feature) => feature.type === "water")) {
        consequence += damageUnit * 0.2;
      }
      if ((moveCheck.ledgeDamage || 0) > 0) {
        // Ledge damage is directly comparable to lasers: normally two damage.
        consequence += damageUnit * moveCheck.ledgeDamage;
      }

      const deviation = getRouteDeviationScore(timeline, timelineIndex, destination);
      consequence += deviation.disruption;
      consequence = Math.max(
        0,
        consequence - deviation.benefitCredit
      );
    }

    worst = Math.max(worst, consequence);
  }

  return Number(worst.toFixed(2));
}


// v49bi observational candidate for RE-native nearby traffic ownership.
// This deliberately does NOT use legacy route-score prices. It asks only:
// "if another robot meaningfully interferes here, how much control consequence
// could a one-square displacement create?"  1.0 means ordinary floor/control
// disruption; values above 1 amplify exposure near mechanically dangerous
// outcomes. These provisional multipliers are diagnostics, not production prices.
export function getRouteDeviationControlSeverity(timeline, timelineIndex, destination) {
  if (!timeline?.length || !destination) return 1;

  const lookAhead = timeline.slice(timelineIndex + 1, timelineIndex + 6);
  if (!lookAhead.length) return 1;

  let bestDistance = Infinity;
  let bestOffset = 0;
  lookAhead.forEach((future, offset) => {
    const distance = heuristic(destination, future.after);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = offset + 1;
    }
  });

  // A push directly onto a later route point can occasionally help; keep some
  // control burden because the player did not choose the displacement.
  if (bestDistance === 0 && bestOffset >= 2) return 0.75;
  if (bestDistance <= 0) return 1;
  if (bestDistance === 1) return 1.15;
  if (bestDistance === 2) return 1.35;
  return 1.6;
}

export function getDisplacementControlSeverity(
  tileMap,
  point,
  timeline,
  timelineIndex,
  options = {}
) {
  if (!point) return 1;

  let worst = 1;

  for (const [dir, delta] of Object.entries(DIRS)) {
    const destination = {
      x: point.x + delta.dx,
      y: point.y + delta.dy
    };
    const tile = tileMap.get(tileKey(destination.x, destination.y));
    const moveCheck = canMoveBetween(tileMap, point, destination, dir, {
      ...options,
      repulsorActive: false
    });

    if (!tile) {
      if (moveCheck.crash) {
        worst = Math.max(worst, 2.5);
      }
      continue;
    }

    if (!moveCheck.ok && !moveCheck.crash && !moveCheck.repulsor) {
      continue;
    }

    let severity = 1;
    const features = tile.features || [];

    if (moveCheck.crash || features.some((feature) => feature.type === "pit")) {
      severity = Math.max(severity, 2.5);
    } else {
      if (features.some((feature) => (
        feature.type === "trapdoor" ||
        feature.type === "crusher"
      ))) {
        severity = Math.max(severity, 2.1);
      }
      if (features.some((feature) => (
        feature.type === "laser" ||
        feature.type === "flamethrower"
      ))) {
        severity = Math.max(severity, 1.6);
      }
      if (features.some((feature) => (
        feature.type === "randomizer" ||
        feature.type === "oil"
      ))) {
        severity = Math.max(severity, 1.35);
      }
      if (features.some((feature) => (
        feature.type === "conveyor" ||
        feature.type === "water"
      ))) {
        severity = Math.max(severity, 1.15);
      }
      if ((moveCheck.ledgeDamage || 0) > 0) {
        severity = Math.max(
          severity,
          1.8 + Math.min(0.4, 0.2 * (moveCheck.ledgeDamage || 0))
        );
      }

      severity = Math.max(
        severity,
        getRouteDeviationControlSeverity(timeline, timelineIndex, destination)
      );
    }

    worst = Math.max(worst, severity);
  }

  return Number(worst.toFixed(3));
}

export function getTrafficControlSeverityProfile(tileMap, route, timeline, options = {}) {
  const cached = TRAFFIC_CONTROL_SEVERITY_CACHE.get(route);
  if (cached) return cached;

  const profile = timeline.map((point, timelineIndex) => (
    getDisplacementControlSeverity(
      tileMap,
      point.after,
      timeline,
      timelineIndex,
      options
    )
  ));

  TRAFFIC_CONTROL_SEVERITY_CACHE.set(route, profile);
  return profile;
}

export function getIncomingRobotLaserDirection(tileMap, targetPoint, shooterPoint) {
  if (!targetPoint?.after || !shooterPoint?.after) return null;
  const target = targetPoint.after;
  const shooter = shooterPoint.after;
  const facing = shooter.facing ?? shooterPoint.facing;
  const vector = DIRS[facing];
  if (!vector) return null;
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const aligned = vector.dx !== 0
    ? dy === 0 && Math.sign(dx) === Math.sign(vector.dx)
    : dx === 0 && Math.sign(dy) === Math.sign(vector.dy);
  return aligned && hasLineOfSight(tileMap, shooter, target) ? facing : null;
}

export function getRobotRangedPressure(tileMap, targetPoint, shooterPoint, options = {}) {
  if (!targetPoint?.after || !shooterPoint?.after) {
    return 0;
  }

  const facing = getIncomingRobotLaserDirection(
    tileMap,
    targetPoint,
    shooterPoint
  );
  if (!facing) return 0;

  const orientation = classifyTrafficOrientation(targetPoint, shooterPoint);
  const multipliers = getRobotLaserThreatMultipliers(options);
  const ruleMultiplier = orientation === "rear"
    ? multipliers.rear
    : orientation === "front"
      ? multipliers.frontal
      : multipliers.lateral;

  // Each credible shot starts at exactly one normal board-laser equivalent.
  // Rear corridors are modestly meaner because sustained pursuit tends to
  // preserve the firing opportunity; actual repeated registers still account
  // for most of the extra cost.
  const orientationPersistence = orientation === "rear"
    ? 1.15
    : orientation === "front"
      ? 1.0
      : 0.9;

  return getStandardRobotLaserCost() * ruleMultiplier * orientationPersistence;
}

export function getRouteCompetitionPressure(tileMap, pointA, pointB) {
  if (!pointA?.after || !pointB?.after) {
    return 0;
  }

  const distance = heuristic(pointA.after, pointB.after);
  const damageUnit = getStandardRobotLaserCost();

  if (distance === 0) {
    return damageUnit * 0.28;
  }
  if (distance === 1) {
    return damageUnit * 0.16;
  }
  if (distance <= 3 && hasLineOfSight(tileMap, pointA.after, pointB.after)) {
    return damageUnit * 0.05;
  }

  return 0;
}

export function getVirtualPhysicalInteractionScale() {
  // v38 Virtual Bots modeling is intentionally strategic rather than literal.
  // During the opening turn the robots do not physically collide in the game,
  // but every player sees the shared entry and programs around the other likely
  // routes. Suppressing traffic here prevents the demand-led alternate search
  // from ever discovering those choices. Therefore route-selection pressure is
  // full strength from register 1; only forecast *uncertainty* receives the
  // five-register grace period below.
  return 1;
}

export function getVirtualCompetitionScale() {
  // Full strategic pressure is already represented through the normal ranged /
  // nearby traffic field above. Do not add a second synthetic competition layer.
  return 0;
}

export const TRAFFIC_OWNERSHIP_AUDIT_ID = "traffic-ownership-v49bn-raw-damage-plus-turn-control";

export function summarizeTrafficOwnershipAudit() {
  return {
    id: TRAFFIC_OWNERSHIP_AUDIT_ID,
    behaviorChanged: true,
    occupancyAndTemporalForecastActive: true,
    robotLaserPhysicalExposureActive: true,
    robotLaserPhysicalDamageOwner: "marginal-raw-damage-economy-re",
    residualRangedThreatActive: false,
    residualRangedThreatOwner: "diagnostic-only-v49ej-physical-damage-plus-awareness-mental-own-production",
    nearbyInteractionActive: true,
    nearbyInteractionOwner: "turn-episode-control-loss-re",
    competitionScale: getVirtualCompetitionScale(),
    competitionActive: getVirtualCompetitionScale() > 0,
    trafficMentalRobotLaserAwarenessActive: true,
    trafficMentalNonLaserControlEventsActive: true,
    nearbyControlGeometryAuditActive: true,
    nearbyControlUsesLegacyPrices: false,
    nearbyControlUsesExistingClogCurve: true,
    nearbyTurnEpisodeCollapseActive: true,
    nearbyTurnEpisodeControlAuthoritative: true,
    legacyNearbyProxyAuthoritative: false,
    legacyNearbyProxyRetainedForComparison: true,
    rawLoadComparatorRetained: true,
    candidateNonLaserPlanningEventMassActive: true,
    nonLaserTrafficMentalAuthoritative: false,
    reroutingUsesStrategicIntrinsicPlusTrafficValue: true,
    rerouteGlobalPriorityUsesAuthoritativeTraffic: true,
    rerouteHotspotUsesTurnEpisodeControlOwnership: true,
    rerouteDamageHotspotUsesMarginalRobotLaserOnly: true,
    rerouteDeterministicDamageCanCreateTrafficHotspot: false,
    rerouteSearchBudgetUnchanged: true,
    note: "v49bn keeps v49bk turn-episode nearby control and v49bm marginal traffic-damage ownership, but robot-laser consequence is now the marginal RAW damage-economy RE rather than a marginal Shutdown-equivalent score. Shutdown remains counterfactual tolerance context only."
  };
}

export function getTrafficRouteEntry(entry) {
  if (entry?.route) {
    return {
      route: entry.route,
      occupancyWeight: Number.isFinite(entry.occupancyWeight)
        ? entry.occupancyWeight
        : 1
    };
  }

  return {
    route: entry,
    occupancyWeight: Number.isFinite(entry?.occupancyWeight)
      ? entry.occupancyWeight
      : 1
  };
}

export function getTrafficLegs(route) {
  return route?.legRoutes?.length
    ? route.legRoutes
    : route
      ? [route]
      : [];
}

export function getTrafficDisplacementProfile(tileMap, route, timeline, options = {}) {
  const cached = TRAFFIC_DISPLACEMENT_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const profile = timeline.map((point, timelineIndex) => (
    getDisplacementConsequenceScore(
      tileMap,
      point.after,
      timeline,
      timelineIndex,
      options
    )
  ));

  TRAFFIC_DISPLACEMENT_CACHE.set(route, profile);
  return profile;
}

export function getClosestTimelineIndexByAbsoluteRegister(timeline = [], absoluteRegister = 0) {
  if (!timeline.length) return 0;
  let low = 0;
  let high = timeline.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value = Number(timeline[mid]?.absoluteRegister) || 0;
    if (value < absoluteRegister) low = mid + 1;
    else high = mid;
  }
  if (low <= 0) return 0;
  const prior = low - 1;
  return Math.abs((Number(timeline[prior]?.absoluteRegister) || 0) - absoluteRegister) <=
    Math.abs((Number(timeline[low]?.absoluteRegister) || 0) - absoluteRegister)
    ? prior
    : low;
}

export function getTrafficPairProfile(tileMap, route, otherRoute, options = {}) {
  let otherCache = TRAFFIC_PAIR_PROFILE_CACHE.get(route);
  if (!otherCache) {
    otherCache = new WeakMap();
    TRAFFIC_PAIR_PROFILE_CACHE.set(route, otherCache);
  }

  const cached = otherCache.get(otherRoute);
  if (cached) {
    return cached;
  }

  const timelineA = getRegisterTimeline(route);
  const timelineB = getRegisterTimeline(otherRoute);
  if (!timelineA.length || !timelineB.length) {
    const empty = {
      ranged: [],
      rangedByFacing: Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, []])),
      nearby: [],
      nearbyEventMass: [],
      nearbyControlLoad: [],
      competition: []
    };
    otherCache.set(otherRoute, empty);
    return empty;
  }

  const displacementProfile = getTrafficDisplacementProfile(
    tileMap,
    route,
    timelineA,
    options
  );
  const controlSeverityProfile = getTrafficControlSeverityProfile(
    tileMap,
    route,
    timelineA,
    options
  );
  const ranged = new Array(timelineA.length).fill(0);
  const rangedByFacing = Object.fromEntries(
    ROTATION_ORDER.map((dir) => [dir, new Array(timelineA.length).fill(0)])
  );
  const nearby = new Array(timelineA.length).fill(0);
  const nearbyEventMass = new Array(timelineA.length).fill(0);
  const nearbyControlLoad = new Array(timelineA.length).fill(0);
  const competition = new Array(timelineA.length).fill(0);

  timelineA.forEach((pointA, timelineIndex) => {
    let temporalMass = 0;
    let strongestTemporal = 0;
    let rangedWeighted = 0;
    const rangedWeightedByFacing = Object.fromEntries(
      ROTATION_ORDER.map((dir) => [dir, 0])
    );
    let nearbyWeighted = 0;
    let nearbyEventMassWeighted = 0;
    let nearbyControlLoadWeighted = 0;
    let competitionWeighted = 0;

    const maximumOtherUncertainty = 2.8;
    const temporalRadius = Math.ceil(
      ((pointA.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
    );
    const centerIndex = getClosestTimelineIndexByAbsoluteRegister(
      timelineB,
      Number(pointA.absoluteRegister) || (pointA.legRegister ?? 1)
    );
    const firstIndex = Math.max(0, centerIndex - temporalRadius);
    const lastIndex = Math.min(
      timelineB.length - 1,
      centerIndex + temporalRadius
    );

    for (let otherIndex = firstIndex; otherIndex <= lastIndex; otherIndex += 1) {
      const pointB = timelineB[otherIndex];
      const temporal = getTemporalInteractionWeight(pointA, pointB);
      if (temporal <= 0) {
        continue;
      }

      temporalMass += temporal;
      strongestTemporal = Math.max(strongestTemporal, temporal);

      const physicalScale = getVirtualPhysicalInteractionScale();
      const competitionScale = getVirtualCompetitionScale();

      if (physicalScale > 0) {
        const rangedPressure = getRobotRangedPressure(
          tileMap,
          pointA,
          pointB,
          options
        );
        rangedWeighted += rangedPressure * temporal * physicalScale;
        const incomingFacing = rangedPressure > 0
          ? getIncomingRobotLaserDirection(tileMap, pointA, pointB)
          : null;
        if (incomingFacing) {
          rangedWeightedByFacing[incomingFacing] += (
            rangedPressure * temporal * physicalScale
          );
        }

        const simultaneousRebootPileupPair =
          isSameTurnSameSpaceRebootPair(pointA, pointB);
        if (!simultaneousRebootPileupPair) {
          const distance = heuristic(pointA.after, pointB.after);
          const orientation = classifyTrafficOrientation(pointA, pointB);
          const interactionProbability = getNearbyInteractionProbability(
            orientation,
            distance
          );
          const consequence = (
            getOrdinaryInterferenceCost() +
            (displacementProfile[timelineIndex] ?? 0)
          );

          nearbyWeighted += (
            interactionProbability *
            consequence *
            temporal *
            physicalScale
          );

          // v49bi parallel ownership candidate. Geometry/probability is retained,
          // but legacy route-score consequence prices are deliberately excluded.
          // v49ei: an exact same-turn/same-space reboot pair is NOT an ordinary
          // displacement episode; its +1-clog consequence is owned downstream by
          // the simultaneous-reboot model instead.
          nearbyEventMassWeighted += (
            interactionProbability *
            temporal *
            physicalScale
          );
          nearbyControlLoadWeighted += (
            interactionProbability *
            (controlSeverityProfile[timelineIndex] ?? 1) *
            temporal *
            physicalScale
          );
        }
      }

      if (competitionScale > 0) {
        competitionWeighted += (
          getRouteCompetitionPressure(tileMap, pointA, pointB) *
          temporal *
          competitionScale
        );
      }
    }

    if (temporalMass <= 0) {
      return;
    }

    // Fuzzy positions are alternative possibilities for the SAME robot.
    const credibility = Math.min(1, strongestTemporal);
    ranged[timelineIndex] = (
      rangedWeighted / temporalMass
    ) * credibility;
    for (const dir of ROTATION_ORDER) {
      rangedByFacing[dir][timelineIndex] = (
        rangedWeightedByFacing[dir] / temporalMass
      ) * credibility;
    }
    nearby[timelineIndex] = (
      nearbyWeighted / temporalMass
    ) * credibility;
    nearbyEventMass[timelineIndex] = (
      nearbyEventMassWeighted / temporalMass
    ) * credibility;
    nearbyControlLoad[timelineIndex] = (
      nearbyControlLoadWeighted / temporalMass
    ) * credibility;
    competition[timelineIndex] = (
      competitionWeighted / temporalMass
    ) * credibility;
  });

  const profile = {
    ranged,
    rangedByFacing,
    nearby,
    nearbyEventMass,
    nearbyControlLoad,
    competition
  };
  otherCache.set(otherRoute, profile);
  return profile;
}

// Legacy pre-v49dm forecast-confidence primitives. Production multiplayer
// traffic no longer consumes hazard/interaction/board-chaos decay; it uses the
// intrinsic RE-native profile below. These helpers remain temporarily for legacy
// production length uncertainty and contextual breadth until those owners migrate.
// Time alone stays highly credible through
// the first two five-register programs, then steepens progressively. Hazards and
// predicted interaction can still pull that horizon forward, but their uncertainty
// pressure is saturating: one very chaotic register should not make the entire
// remainder of the race effectively unknowable. These values affect predictive
// traffic/breadth only; intrinsic hazards and exact programming legality are never
// discounted.
export const TRAFFIC_FORECAST_HAZARD_DECAY = 0.014;
export const TRAFFIC_FORECAST_INTERACTION_DECAY = 0.016;
export const TRAFFIC_FORECAST_BOARD_CHAOS_DECAY = 0.020;
export const TRAFFIC_FORECAST_CONFIDENCE_FLOOR = 0.06;
export const FORECAST_SOLID_CONFIDENCE = 0.84;
export const FORECAST_SPECULATIVE_CONFIDENCE = 0.50;
export const TRAFFIC_ALTERNATE_MIN_EXPANSIONS = 48;

export function getForecastBoardChaosPressure(transition = {}) {
  // Forced movement and board machinery make later robot-position forecasts
  // diverge even when they are not intrinsically hazardous. Hazard itself is
  // handled separately below so this is a confidence term, never a difficulty
  // discount. The logarithm keeps repeated machinery from collapsing the entire
  // horizon after one busy register.
  const forcedDistance = Math.max(0, Number(transition?.forcedDistance) || 0);
  const conveyorSteps = Array.isArray(transition?.conveyorSteps)
    ? transition.conveyorSteps.length
    : 0;
  const nonConveyorEvents = Array.isArray(transition?.boardEvents)
    ? transition.boardEvents.filter((event) => event?.type !== "conveyor").length
    : 0;
  const gearTurn = transition?.gearTurned ? 1 : 0;
  const raw = (
    forcedDistance * 0.40 +
    conveyorSteps * 0.32 +
    nonConveyorEvents * 0.16 +
    gearTurn * 0.28
  );
  return Math.min(2.2, Math.log1p(raw));
}

export function getTrafficAlternateHardPressureStrength(pressureRegisterEquivalents = 0) {
  // Search-demand only. A full Shutdown-sized damage state is enough to restore
  // optional reroute effort even when the traffic forecast itself is far down the
  // uncertainty curve. This does NOT increase final traffic confidence or alter
  // candidate gain: hard pressure changes whether/how hard we look, not how much
  // we trust a speculative future once found.
  return clamp(
    Math.max(0, Number(pressureRegisterEquivalents) || 0) /
      DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
    0,
    1
  );
}

// v49dm production RE-native routing-horizon moderation. Severe damage may
// justify spending some optional reroute-search effort even when the positional
// forecast is speculative, but it must not erase the horizon decay. A fully
// saturated damage-pressure state can restore at most a half-budget optional
// search envelope when the confidence-derived base effort is below that level.
export const RE_NATIVE_DAMAGE_EFFORT_CEILING = 0.50;

export function restoreRENativeTrafficAlternateEffortForDamagePressure(
  baseEffortScale,
  pressureRegisterEquivalents
) {
  const base = clamp(Number(baseEffortScale) || 0, 0, 1);
  if (base >= RE_NATIVE_DAMAGE_EFFORT_CEILING) return base;
  const pressure = getTrafficAlternateHardPressureStrength(
    pressureRegisterEquivalents
  );
  return clamp(
    base + (RE_NATIVE_DAMAGE_EFFORT_CEILING - base) * pressure,
    base,
    RE_NATIVE_DAMAGE_EFFORT_CEILING
  );
}

export function getTrafficAlternateSearchEnvelope(effortScale = 1, options = {}) {
  const scale = clamp(Number(effortScale) || 1, 0.05, 1);
  return {
    maxExpansions: Math.max(
      TRAFFIC_ALTERNATE_MIN_EXPANSIONS,
      Math.floor((Number(options.contextualTrafficAlternateExpansions) || 320) * scale)
    ),
    maxActions: Math.max(
      20,
      Math.floor(Number(options.contextualTrafficAlternateMaxActions) || 30)
    )
  };
}

export function getTrafficAlternateEffortScale(confidence, options = {}) {
  const floor = clamp(
    Number.isFinite(Number(options.contextualTrafficAlternateUncertaintyEffortFloor))
      ? Number(options.contextualTrafficAlternateUncertaintyEffortFloor)
      : 0.18,
    0.05,
    1
  );
  const exponent = clamp(
    Number.isFinite(Number(options.contextualTrafficAlternateUncertaintyEffortExponent))
      ? Number(options.contextualTrafficAlternateUncertaintyEffortExponent)
      : 1.15,
    0.35,
    2.5
  );
  const normalized = clamp(
    (Math.max(TRAFFIC_FORECAST_CONFIDENCE_FLOOR, Number(confidence) || 0) -
      TRAFFIC_FORECAST_CONFIDENCE_FLOOR) /
      (1 - TRAFFIC_FORECAST_CONFIDENCE_FLOOR),
    0,
    1
  );
  return clamp(
    floor + (1 - floor) * Math.pow(normalized, exponent),
    floor,
    1
  );
}

export function getForecastTimeExponent(absoluteRegisters = 0) {
  const registers = Math.max(0, Number(absoluteRegisters) || 0);
  if (registers <= REGISTER_COUNT) {
    // R1-R5: time by itself should barely weaken the forecast.
    return registers * 0.002;
  }
  if (registers <= REGISTER_COUNT * 2) {
    // R6-R10: still a credible second program, with only mild time decay.
    return 0.010 + (registers - REGISTER_COUNT) * 0.013;
  }

  // R11+: gradual at first, then increasingly steep. Time-only anchors are
  // approximately R5 .990, R10 .928, R15 .827, R20 .660, R25 .472.
  const later = registers - REGISTER_COUNT * 2;
  return 0.075 + later * 0.012 + later * later * 0.0022;
}

export function getForecastTimeConfidence(absoluteRegisters = 0) {
  return clamp(
    Math.exp(-getForecastTimeExponent(absoluteRegisters)),
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

export function getForecastHazardPressure(hazardExposure = 0) {
  const hazard = Math.max(0, Number(hazardExposure) || 0);
  // Hazard remains fully priced intrinsically. Here it only reduces confidence in
  // future multiplayer positions, with diminishing uncertainty from repeated hits.
  return Math.min(2.4, Math.log1p(hazard));
}

export function getForecastInteractionPressure(rawInteraction = 0, damageUnit = 1) {
  const ratio = Math.max(0, Number(rawInteraction) || 0) /
    Math.max(1, Number(damageUnit) || 1);
  // Congestion is strong evidence that the next positions may diverge, but its
  // uncertainty effect saturates instead of compounding linearly without bound.
  return Math.min(1.8, Math.log1p(ratio));
}

export function getTrafficForecastGraceRegisters(options = {}) {
  const explicit = Number(options.trafficGraceRegisters);
  return Number.isFinite(explicit) ? Math.max(0, Math.floor(explicit)) : 0;
}

export function getTrafficForecastElapsedRegisters(absoluteActions = 0, options = {}) {
  const actions = Math.max(0, Number(absoluteActions) || 0);
  return Math.max(0, actions - getTrafficForecastGraceRegisters(options));
}

export function getIntrinsicForecastConfidence(absoluteActions = 0, hazardExposure = 0, options = {}) {
  const elapsedForTime = getTrafficForecastElapsedRegisters(absoluteActions, options);
  const hazardPressure = getForecastHazardPressure(hazardExposure);
  return clamp(
    getForecastTimeConfidence(elapsedForTime) * Math.exp(-TRAFFIC_FORECAST_HAZARD_DECAY * hazardPressure),
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

export function getTrafficInitialForecastConfidence(route, options = {}) {
  const explicitValue = options.trafficInitialForecastConfidence;
  const explicit = Number(explicitValue);
  if (explicitValue !== null && explicitValue !== undefined && Number.isFinite(explicit)) {
    return clamp(explicit, TRAFFIC_FORECAST_CONFIDENCE_FLOOR, 1);
  }
  const elapsedRegisters = Math.max(0, Number(route?.absoluteStartAction) || 0);
  const priorHazard = Math.max(0, Number(options.trafficPriorHazardExposure) || 0);
  return getIntrinsicForecastConfidence(elapsedRegisters, priorHazard, options);
}

export function advanceTrafficForecastConfidence(
  confidence,
  transitionHazard,
  rawInteraction,
  damageUnit,
  transition = null,
  absoluteRegister = 0,
  options = {}
) {
  const hazardPressure = getForecastHazardPressure(transitionHazard);
  const boardChaosPressure = getForecastBoardChaosPressure(transition);
  const register = Math.max(0, Number(absoluteRegister) || 0);
  const graceRegisters = getTrafficForecastGraceRegisters(options);
  // Virtual Bots still exert traffic pressure from register 1. What is known
  // unusually well is the first-turn interaction field, so those interactions
  // do not themselves erode forecast confidence until register 6.
  const uncertaintyInteraction = register < graceRegisters ? 0 : rawInteraction;
  const interactionPressure = getForecastInteractionPressure(uncertaintyInteraction, damageUnit);
  const elapsedBefore = Math.max(0, register - graceRegisters);
  const elapsedAfter = Math.max(0, register + 1 - graceRegisters);
  const timeExponentDelta = Math.max(
    0,
    getForecastTimeExponent(elapsedAfter) - getForecastTimeExponent(elapsedBefore)
  );
  const decay = Math.exp(
    -timeExponentDelta -
    TRAFFIC_FORECAST_HAZARD_DECAY * hazardPressure -
    TRAFFIC_FORECAST_INTERACTION_DECAY * interactionPressure -
    TRAFFIC_FORECAST_BOARD_CHAOS_DECAY * boardChaosPressure
  );
  return clamp(
    confidence * decay,
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}

export function advanceTrafficForecastConfidenceForTransition(
  confidence,
  transitionHazard,
  rawInteraction,
  damageUnit,
  transition,
  executedAbsoluteAction,
  options = {}
) {
  const executed = Math.max(1, Math.floor(Number(executedAbsoluteAction) || 1));
  let next = advanceTrafficForecastConfidence(
    confidence,
    transitionHazard,
    rawInteraction,
    damageUnit,
    transition,
    executed - 1,
    options
  );
  if (!transition?.rebooted) return next;

  // The reboot register itself was already advanced above. The remaining
  // registers of that program contain no further route actions/interactions, but
  // they are still elapsed forecast time before next-turn R1. Apply only that
  // time decay here; do not invent hazard, board-chaos or traffic events.
  const elapsedAfterReboot = getRebootEndedAbsoluteActions(executed);
  const beforeGap = getTrafficForecastElapsedRegisters(executed, options);
  const afterGap = getTrafficForecastElapsedRegisters(elapsedAfterReboot, options);
  const gapExponent = Math.max(
    0,
    getForecastTimeExponent(afterGap) - getForecastTimeExponent(beforeGap)
  );
  if (gapExponent > 0) {
    next = clamp(
      next * Math.exp(-gapExponent),
      TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
      1
    );
  }
  return next;
}

export function summarizeIntrinsicRouteForecastConfidence(route, options = {}) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  if (!transitions.length) {
    return {
      registerCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      endConfidence: 1,
      confidenceByRegister: []
    };
  }

  const damageUnit = getStandardRobotLaserCost();
  const absoluteStartAction = Math.max(0, Number(route?.absoluteStartAction) || 0);
  let elapsedAbsoluteActions = absoluteStartAction;
  let confidence = getTrafficInitialForecastConfidence(route, options);
  const confidenceByRegister = [];

  for (let index = 0; index < transitions.length; index += 1) {
    confidenceByRegister.push(confidence);
    const transition = transitions[index] ?? null;
    const executedAbsoluteAction = getTransitionAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    confidence = advanceTrafficForecastConfidenceForTransition(
      confidence,
      transition?.hazard,
      0,
      damageUnit,
      transition,
      executedAbsoluteAction,
      options
    );
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  return {
    registerCount: confidenceByRegister.length,
    averageConfidence: Number(average(confidenceByRegister).toFixed(3)),
    minimumConfidence: Number(Math.min(...confidenceByRegister, confidence).toFixed(3)),
    endConfidence: Number(confidence.toFixed(3)),
    confidenceByRegister: confidenceByRegister.map((value) => Number(value.toFixed(4)))
  };
}

export function getRENativeTrafficConfidenceForAbsoluteAction(
  confidenceMap,
  absoluteAction,
  fallback = 1
) {
  const value = confidenceMap?.get?.(
    Math.max(1, Math.floor(Number(absoluteAction) || 1))
  );
  return clamp(
    Number.isFinite(Number(value)) ? Number(value) : Number(fallback) || 1,
    TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
    1
  );
}


// v49bj observational candidate: collapse repeated nearby opportunities within
// a natural five-register turn into the probability of at least one meaningful
// non-laser control episode. Register event mass is expected-count-like rather
// than a literal probability, so 1-exp(-lambda) gives a bounded at-least-one
// approximation. This is diagnostic only in v49bj.
export function summarizeNearbyTrafficTurnEpisodes(byRegister = []) {
  const turns = new Map();

  for (const record of byRegister || []) {
    const absoluteAction = Math.max(1, Number(record.absoluteAction) || 1);
    const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
    const eventMass = Math.max(0, Number(record.nearbyEventMass) || 0);
    const controlLoad = Math.max(0, Number(record.nearbyControlLoad) || 0);

    if (!turns.has(turn)) {
      turns.set(turn, { eventMass: 0, controlLoad: 0 });
    }
    const bucket = turns.get(turn);
    bucket.eventMass += eventMass;
    bucket.controlLoad += controlLoad;
  }

  let episodeEventMass = 0;
  let episodeControlLoad = 0;
  let episodeControlRE = 0;
  const byTurn = [];

  for (const [turn, bucket] of [...turns.entries()].sort((a, b) => a[0] - b[0])) {
    const lambda = Math.max(0, bucket.eventMass);
    const eventProbability = 1 - Math.exp(-lambda);
    const conditionalSeverity = lambda > 1e-9
      ? clamp(bucket.controlLoad / lambda, 0.75, 2.5)
      : 0;
    const turnEpisodeControlLoad = eventProbability * conditionalSeverity;
    const turnEpisodeControlRE = getDamageEconomyClogRegisterEquivalents(
      turnEpisodeControlLoad
    );

    episodeEventMass += eventProbability;
    episodeControlLoad += turnEpisodeControlLoad;
    episodeControlRE += turnEpisodeControlRE;

    byTurn.push({
      turn,
      rawEventMass: Number(lambda.toFixed(4)),
      eventProbability: Number(eventProbability.toFixed(4)),
      conditionalSeverity: Number(conditionalSeverity.toFixed(4)),
      episodeControlLoad: Number(turnEpisodeControlLoad.toFixed(4)),
      episodeControlRE: Number(turnEpisodeControlRE.toFixed(4))
    });
  }

  return {
    episodeEventMass: Number(episodeEventMass.toFixed(4)),
    episodeControlLoad: Number(episodeControlLoad.toFixed(4)),
    episodeControlRE: Number(episodeControlRE.toFixed(4)),
    episodeControlScore: Number((episodeControlRE * REGISTER_TEMPO_COST).toFixed(2)),
    byTurn
  };
}

export function allocateCappedOccupancy(items, targetCount, weightForItem) {
  const result = new Map(items.map((item) => [item.index, 0]));
  let remainingItems = [...items];
  let remaining = Math.max(0, Math.min(targetCount, remainingItems.length));

  while (remainingItems.length && remaining > 0.0001) {
    const weights = remainingItems.map((item) => Math.max(0.0001, weightForItem(item)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const capped = [];

    remainingItems.forEach((item, index) => {
      const proposed = remaining * weights[index] / totalWeight;
      if (proposed >= 1) {
        result.set(item.index, 1);
        capped.push(item.index);
      }
    });

    if (!capped.length) {
      remainingItems.forEach((item, index) => {
        result.set(
          item.index,
          Math.min(1, remaining * weights[index] / totalWeight)
        );
      });
      remaining = 0;
      break;
    }

    remaining -= capped.length;
    remainingItems = remainingItems.filter((item) => !capped.includes(item.index));
  }

  return result;
}


export const TRAFFIC_ROUTE_MIXTURE_TEMPERATURE_RE = 1;
export const TRAFFIC_ROUTE_MIXTURE_MIN_RELATIVE_WEIGHT = 0.03;

export function getTrafficRouteMixtureQuality(route, qualityByRoute = null) {
  if (qualityByRoute instanceof Map && qualityByRoute.has(route)) {
    const explicit = Number(qualityByRoute.get(route));
    if (Number.isFinite(explicit)) return explicit;
  }
  const fallback = Number(route?.score);
  return Number.isFinite(fallback) ? fallback : Infinity;
}

export function getTrafficRouteFamilyKey(route) {
  const timeline = getRegisterTimeline(route);
  if (!timeline.length) return getRoutePathKey(route);
  return timeline.map((point) => (
    `${point.absoluteRegister}:${point.after?.x ?? "?"},${point.after?.y ?? "?"},${point.facing ?? "?"}`
  )).join("|");
}

export function buildTrafficRouteMixture(
  analysis,
  _flags,
  qualityByRoute = null,
  mixtureOptions = {}
) {
  const originalRoutes = Array.isArray(analysis?.fullCourseRoutes)
    ? analysis.fullCourseRoutes.filter(Boolean)
    : [];
  if (!originalRoutes.length) {
    return {
      model: mixtureOptions.model ?? "quality-weighted-route-families",
      qualityUnit: mixtureOptions.qualityUnit ?? "pathfinder-score",
      qualityScorePerRE: Number.isFinite(Number(mixtureOptions.qualityScorePerRE))
        ? Math.max(0.000001, Number(mixtureOptions.qualityScorePerRE))
        : REGISTER_TEMPO_COST,
      candidateCount: 0,
      familyCount: 0,
      effectiveRouteCount: 0,
      alternateShare: 0,
      entries: []
    };
  }

  // A route family is one exact traffic trajectory: same register chronology,
  // position and facing. Card/program witnesses that produce that same traffic
  // trajectory do not gain extra occupancy merely because search rediscovered
  // them. A local geometric OR timing divergence remains a separate family,
  // because either can materially change multiplayer interaction.
  const familyByPath = new Map();
  originalRoutes.forEach((route, routeIndex) => {
    const routeKey = getTrafficRouteFamilyKey(route);
    const qualityScore = getTrafficRouteMixtureQuality(route, qualityByRoute);
    const existing = familyByPath.get(routeKey);
    if (!existing) {
      familyByPath.set(routeKey, {
        route,
        routeIndex,
        routeKey,
        qualityScore,
        memberCount: 1
      });
      return;
    }
    existing.memberCount += 1;
    if (qualityScore < existing.qualityScore) {
      existing.route = route;
      existing.routeIndex = routeIndex;
      existing.qualityScore = qualityScore;
    }
  });
  const families = [...familyByPath.values()].sort((left, right) => (
    left.qualityScore - right.qualityScore ||
    left.routeKey.localeCompare(right.routeKey)
  ));

  const bestQuality = families[0]?.qualityScore ?? Infinity;
  const qualityScorePerRE = Number.isFinite(Number(mixtureOptions.qualityScorePerRE))
    ? Math.max(0.000001, Number(mixtureOptions.qualityScorePerRE))
    : REGISTER_TEMPO_COST;
  const temperatureScore = Math.max(
    0.001,
    TRAFFIC_ROUTE_MIXTURE_TEMPERATURE_RE * qualityScorePerRE
  );
  const weighted = families.map((family, index) => {
    const relativeWeight = index === 0
      ? 1
      : Math.exp(-Math.max(0, family.qualityScore - bestQuality) / temperatureScore);
    return {
      ...family,
      relativeWeight
    };
  });
  const retained = weighted.filter((entry, index) => (
    index === 0 || entry.relativeWeight >= TRAFFIC_ROUTE_MIXTURE_MIN_RELATIVE_WEIGHT
  ));
  const totalWeight = retained.reduce(
    (sum, entry) => sum + entry.relativeWeight,
    0
  ) || 1;
  const entries = retained.map((entry) => ({
    routeIndex: entry.routeIndex,
    routeKey: entry.routeKey,
    weight: entry.relativeWeight / totalWeight,
    qualityScore: entry.qualityScore,
    familySize: entry.memberCount
  }));
  const primaryWeight = entries.length
    ? Math.max(...entries.map((entry) => entry.weight))
    : 1;
  const inverseConcentration = entries.reduce(
    (sum, entry) => sum + entry.weight * entry.weight,
    0
  );

  return {
    model: mixtureOptions.model ?? "quality-weighted-route-families",
    qualityUnit: mixtureOptions.qualityUnit ?? "pathfinder-score",
    qualityScorePerRE,
    temperatureRE: TRAFFIC_ROUTE_MIXTURE_TEMPERATURE_RE,
    candidateCount: originalRoutes.length,
    familyCount: families.length,
    retainedFamilyCount: entries.length,
    effectiveRouteCount: inverseConcentration > 0 ? 1 / inverseConcentration : 0,
    alternateShare: Math.max(0, 1 - primaryWeight),
    entries
  };
}

export function trafficRouteMixturesDiffer(left, right) {
  const toMap = (mixture) => new Map(
    (mixture?.entries || []).map((entry) => [
      entry.routeKey ?? String(entry.routeIndex ?? ""),
      Number(entry.weight) || 0
    ])
  );
  const leftMap = toMap(left);
  const rightMap = toMap(right);
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  let delta = 0;
  for (const key of keys) {
    delta += Math.abs((leftMap.get(key) ?? 0) - (rightMap.get(key) ?? 0));
  }
  return delta > 0.01;
}

export function getTrafficRouteMixtureForAnalysis(
  analysis,
  routeMixtureByIndex = null
) {
  const explicit = routeMixtureByIndex instanceof Map
    ? routeMixtureByIndex.get(analysis.index)
    : null;
  if (explicit?.entries?.length) return explicit;
  if (analysis?.trafficRouteMixture?.entries?.length) {
    return analysis.trafficRouteMixture;
  }
  const route = analysis?.fullCourseRoute ?? analysis?.fullCourseRoutes?.[0] ?? null;
  return route
    ? {
      model: "single-representative-route",
      candidateCount: 1,
      familyCount: 1,
      retainedFamilyCount: 1,
      effectiveRouteCount: 1,
      alternateShare: 0,
      entries: [{
        routeIndex: Array.isArray(analysis?.fullCourseRoutes)
          ? analysis.fullCourseRoutes.indexOf(route)
          : 0,
        routeKey: getRoutePathKey(route),
        weight: 1,
        qualityScore: Number(route.score) || 0,
        familySize: 1
      }]
    }
    : {
      model: "single-representative-route",
      candidateCount: 0,
      familyCount: 0,
      retainedFamilyCount: 0,
      effectiveRouteCount: 0,
      alternateShare: 0,
      entries: []
    };
}

export function buildTrafficRouteMixtureEntries(
  analyses,
  focusIndex,
  occupancyByIndex,
  routeMixtureByIndex = null
) {
  const entries = [];
  for (const analysis of analyses || []) {
    if (!analysis || analysis.index === focusIndex) continue;
    const startOccupancy = Math.max(
      0,
      Number(occupancyByIndex?.get?.(analysis.index)) || 0
    );
    if (startOccupancy <= 0) continue;
    const mixture = getTrafficRouteMixtureForAnalysis(
      analysis,
      routeMixtureByIndex
    );
    for (const routeEntry of mixture.entries || []) {
      const routeWeight = Math.max(0, Number(routeEntry.weight) || 0);
      const route = Number.isInteger(routeEntry.routeIndex)
        ? analysis?.fullCourseRoutes?.[routeEntry.routeIndex] ?? null
        : null;
      if (!route || routeWeight <= 0) continue;
      entries.push({
        route,
        occupancyWeight: startOccupancy * routeWeight,
        startIndex: analysis.index,
        routeMixtureWeight: routeWeight
      });
    }
  }
  return entries;
}

export function summarizeTrafficRouteMixtureOwnershipAudit(
  analyses,
  currentRouteMixtureByIndex,
  reNativeRouteMixtureByIndex
) {
  const perStart = [];
  const mixtureFor = (map, index) => (
    map instanceof Map ? map.get(index) : null
  );
  const primaryKey = (mixture) => {
    const entries = [...(mixture?.entries || [])];
    if (!entries.length) return null;
    entries.sort((a, b) => (
      (Number(b.weight) || 0) - (Number(a.weight) || 0) ||
      String(a.routeKey || "").localeCompare(String(b.routeKey || ""))
    ));
    return entries[0]?.routeKey ?? null;
  };
  const totalVariation = (left, right) => {
    const leftMap = new Map(
      (left?.entries || []).map((entry) => [
        entry.routeKey ?? String(entry.routeIndex ?? ""),
        Number(entry.weight) || 0
      ])
    );
    const rightMap = new Map(
      (right?.entries || []).map((entry) => [
        entry.routeKey ?? String(entry.routeIndex ?? ""),
        Number(entry.weight) || 0
      ])
    );
    const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
    let l1 = 0;
    for (const key of keys) {
      l1 += Math.abs((leftMap.get(key) ?? 0) - (rightMap.get(key) ?? 0));
    }
    return 0.5 * l1;
  };

  for (const analysis of analyses || []) {
    const current = mixtureFor(currentRouteMixtureByIndex, analysis.index);
    const reNative = mixtureFor(reNativeRouteMixtureByIndex, analysis.index);
    if (!current?.entries?.length || !reNative?.entries?.length) continue;
    const variation = totalVariation(current, reNative);
    const currentPrimary = primaryKey(current);
    const rePrimary = primaryKey(reNative);
    perStart.push({
      index: analysis.index,
      candidateCount: current.candidateCount ?? 0,
      familyCount: current.familyCount ?? 0,
      currentPrimaryRouteKey: currentPrimary,
      reNativePrimaryRouteKey: rePrimary,
      primaryFamilyChanged: Boolean(
        currentPrimary && rePrimary && currentPrimary !== rePrimary
      ),
      totalVariation: Number(variation.toFixed(4)),
      currentAlternateShare: Number(
        (Number(current.alternateShare) || 0).toFixed(4)
      ),
      reNativeAlternateShare: Number(
        (Number(reNative.alternateShare) || 0).toFixed(4)
      ),
      currentEffectiveRouteCount: Number(
        (Number(current.effectiveRouteCount) || 0).toFixed(4)
      ),
      reNativeEffectiveRouteCount: Number(
        (Number(reNative.effectiveRouteCount) || 0).toFixed(4)
      ),
      currentEntries: (current.entries || []).map((entry) => ({
        routeIndex: entry.routeIndex,
        weight: Number((Number(entry.weight) || 0).toFixed(4)),
        qualityScore: Number.isFinite(Number(entry.qualityScore))
          ? Number(Number(entry.qualityScore).toFixed(4))
          : null
      })),
      reNativeEntries: (reNative.entries || []).map((entry) => ({
        routeIndex: entry.routeIndex,
        weight: Number((Number(entry.weight) || 0).toFixed(4)),
        effectiveRE: Number.isFinite(Number(entry.qualityScore))
          ? Number(Number(entry.qualityScore).toFixed(4))
          : null
      }))
    });
  }

  const averageOf = (field) => perStart.length
    ? perStart.reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0) /
      perStart.length
    : 0;

  return {
    model: "traffic-route-mixture-ownership-audit-v49bz",
    observationalOnly: false,
    behaviorChanged: true,
    currentOwnership:
      "legacy pathfinder+traffic comparator (first argument)",
    comparatorOwnership:
      "live completed effective-RE mixture (second argument)",
    temperatureRE: TRAFFIC_ROUTE_MIXTURE_TEMPERATURE_RE,
    startCount: perStart.length,
    startsWithPrimaryFamilyChange: perStart.filter(
      (entry) => entry.primaryFamilyChanged
    ).length,
    averageTotalVariation: Number(averageOf("totalVariation").toFixed(4)),
    maximumTotalVariation: perStart.length
      ? Number(Math.max(...perStart.map((entry) => entry.totalVariation)).toFixed(4))
      : 0,
    currentAverageAlternateShare: Number(
      averageOf("currentAlternateShare").toFixed(4)
    ),
    reNativeAverageAlternateShare: Number(
      averageOf("reNativeAlternateShare").toFixed(4)
    ),
    currentAverageEffectiveRouteCount: Number(
      averageOf("currentEffectiveRouteCount").toFixed(4)
    ),
    reNativeAverageEffectiveRouteCount: Number(
      averageOf("reNativeEffectiveRouteCount").toFixed(4)
    ),
    perStart
  };
}

export function summarizeTrafficRouteMixtures(analyses, routeMixtureByIndex = null) {
  const mixtures = (analyses || [])
    .map((analysis) => getTrafficRouteMixtureForAnalysis(
      analysis,
      routeMixtureByIndex
    ))
    .filter((mixture) => mixture.entries?.length);
  if (!mixtures.length) {
    return {
      model: "quality-weighted-route-families",
      startCount: 0,
      candidateCount: 0,
      familyCount: 0,
      retainedFamilyCount: 0,
      averageFamiliesPerStart: 0,
      averageRetainedFamiliesPerStart: 0,
      averageEffectiveRouteCount: 0,
      averageAlternateShare: 0,
      maximumAlternateShare: 0
    };
  }
  const sum = (field) => mixtures.reduce(
    (total, mixture) => total + (Number(mixture[field]) || 0),
    0
  );
  return {
    model: "quality-weighted-route-families",
    startCount: mixtures.length,
    candidateCount: sum("candidateCount"),
    familyCount: sum("familyCount"),
    retainedFamilyCount: sum("retainedFamilyCount"),
    averageFamiliesPerStart: Number(
      (sum("familyCount") / mixtures.length).toFixed(3)
    ),
    averageRetainedFamiliesPerStart: Number(
      (sum("retainedFamilyCount") / mixtures.length).toFixed(3)
    ),
    averageEffectiveRouteCount: Number(
      (sum("effectiveRouteCount") / mixtures.length).toFixed(3)
    ),
    averageAlternateShare: Number(
      (sum("alternateShare") / mixtures.length).toFixed(3)
    ),
    maximumAlternateShare: Number(
      Math.max(...mixtures.map((mixture) => Number(mixture.alternateShare) || 0)).toFixed(3)
    )
  };
}


export function compareTrafficRouteLegDivergence(primaryLeg, alternateLeg, goal) {
  if (!primaryLeg || !alternateLeg) {
    return {
      comparable: false,
      corridorDiversity: null,
      trajectoryDistinctRegisters: 0,
      geometricDistinctRegisters: 0,
      facingOnlyDistinctRegisters: 0,
      firstGeometricDivergenceRegister: null,
      lastGeometricDivergenceRegister: null,
      longestGeometricDistinctRun: 0,
      firstGeometricRejoinRegister: null
    };
  }

  const primaryTimeline = getRegisterTimeline(primaryLeg);
  const alternateTimeline = getRegisterTimeline(alternateLeg);
  const count = Math.max(primaryTimeline.length, alternateTimeline.length);
  let trajectoryDistinctRegisters = 0;
  let geometricDistinctRegisters = 0;
  let facingOnlyDistinctRegisters = 0;
  let firstGeometricDivergenceRegister = null;
  let lastGeometricDivergenceRegister = null;
  let longestGeometricDistinctRun = 0;
  let currentGeometricDistinctRun = 0;
  let firstGeometricRejoinRegister = null;
  let sawGeometricDivergence = false;

  for (let index = 0; index < count; index += 1) {
    const primary = primaryTimeline[index] ?? null;
    const alternate = alternateTimeline[index] ?? null;
    const primaryAfter = primary?.after ?? null;
    const alternateAfter = alternate?.after ?? null;
    const missing = !primaryAfter || !alternateAfter;

    const geometricDistinct = Boolean(
      missing ||
      primaryAfter.x !== alternateAfter.x ||
      primaryAfter.y !== alternateAfter.y
    );
    const facingDistinct = Boolean(
      !missing &&
      !geometricDistinct &&
      (primary?.facing ?? primaryAfter?.facing ?? null) !==
        (alternate?.facing ?? alternateAfter?.facing ?? null)
    );

    if (geometricDistinct || facingDistinct) trajectoryDistinctRegisters += 1;
    if (facingDistinct) facingOnlyDistinctRegisters += 1;

    if (geometricDistinct) {
      geometricDistinctRegisters += 1;
      currentGeometricDistinctRun += 1;
      longestGeometricDistinctRun = Math.max(
        longestGeometricDistinctRun,
        currentGeometricDistinctRun
      );
      if (firstGeometricDivergenceRegister == null) {
        firstGeometricDivergenceRegister = index + 1;
      }
      lastGeometricDivergenceRegister = index + 1;
      sawGeometricDivergence = true;
    } else {
      currentGeometricDistinctRun = 0;
      if (
        sawGeometricDivergence &&
        firstGeometricRejoinRegister == null &&
        primaryAfter &&
        alternateAfter
      ) {
        firstGeometricRejoinRegister = index + 1;
      }
    }
  }

  const corridorDiversity = goal
    ? 1 - routeSimilarity(primaryLeg, alternateLeg, goal)
    : null;

  return {
    comparable: true,
    corridorDiversity: Number.isFinite(corridorDiversity)
      ? Number(corridorDiversity.toFixed(4))
      : null,
    trajectoryDistinctRegisters,
    geometricDistinctRegisters,
    facingOnlyDistinctRegisters,
    firstGeometricDivergenceRegister,
    lastGeometricDivergenceRegister,
    longestGeometricDistinctRun,
    firstGeometricRejoinRegister
  };
}

export function summarizeTrafficRouteFamilyDivergence(
  analyses,
  flags,
  routeMixtureByIndex = null,
  selectedByIndex = null
) {
  const perLeg = (flags || []).map((_, legIndex) => ({
    leg: legIndex + 1,
    startsWithGeometricAlternate: 0,
    geometricAlternateWeight: 0,
    comparisonCount: 0,
    corridorDiversitySum: 0,
    maximumCorridorDiversity: 0,
    geometricDistinctRegistersSum: 0,
    maximumGeometricDistinctRun: 0,
    earliestGeometricDivergenceRegister: null,
    latestGeometricDistinctRegister: null,
    rejoinedAlternateCount: 0
  }));

  const starts = [];
  let startsWithRetainedAlternates = 0;
  let startsWithGeometricAlternates = 0;
  let startsWithTrajectoryOnlyAlternates = 0;
  let retainedGeometricAlternateFamilies = 0;
  let retainedTrajectoryOnlyAlternateFamilies = 0;

  for (const analysis of analyses || []) {
    const routes = Array.isArray(analysis?.fullCourseRoutes)
      ? analysis.fullCourseRoutes
      : [];
    const selectedRoute =
      (selectedByIndex instanceof Map
        ? selectedByIndex.get(analysis.index)
        : null) ??
      analysis?.fullCourseRoute ??
      routes[0] ??
      null;
    if (!selectedRoute) continue;

    const mixture = getTrafficRouteMixtureForAnalysis(
      analysis,
      routeMixtureByIndex
    );
    const selectedFamilyKey = getTrafficRouteFamilyKey(selectedRoute);
    const startSummary = {
      startIndex: analysis.index,
      retainedFamilyCount:
        mixture?.retainedFamilyCount ?? mixture?.entries?.length ?? 0,
      alternateShare: Number((Number(mixture?.alternateShare) || 0).toFixed(4)),
      geometricAlternateShare: 0,
      trajectoryOnlyAlternateShare: 0,
      geometricAlternateFamilyCount: 0,
      trajectoryOnlyAlternateFamilyCount: 0,
      perLeg: (flags || []).map((_, legIndex) => ({
        leg: legIndex + 1,
        geometricAlternateCount: 0,
        geometricAlternateWeight: 0,
        trajectoryOnlyAlternateCount: 0,
        maximumCorridorDiversity: 0,
        maximumGeometricDistinctRegisters: 0,
        maximumGeometricDistinctRun: 0,
        earliestGeometricDivergenceRegister: null,
        latestGeometricDistinctRegister: null,
        earliestGeometricRejoinRegister: null
      }))
    };

    for (const entry of mixture?.entries || []) {
      const route = Number.isInteger(entry.routeIndex)
        ? routes[entry.routeIndex] ?? null
        : null;
      if (!route) continue;

      const familyKey = entry.routeKey ?? getTrafficRouteFamilyKey(route);
      if (familyKey === selectedFamilyKey) continue;

      const weight = Math.max(0, Number(entry.weight) || 0);
      let anyGeometric = false;
      let anyTrajectory = false;

      for (let legIndex = 0; legIndex < (flags || []).length; legIndex += 1) {
        const comparison = compareTrafficRouteLegDivergence(
          selectedRoute?.legRoutes?.[legIndex] ?? null,
          route?.legRoutes?.[legIndex] ?? null,
          flags[legIndex] ?? null
        );
        if (!comparison.comparable) continue;

        const hasGeometric = comparison.geometricDistinctRegisters > 0;
        const hasTrajectory = comparison.trajectoryDistinctRegisters > 0;
        if (hasTrajectory) anyTrajectory = true;

        if (!hasGeometric) {
          if (hasTrajectory) {
            startSummary.perLeg[legIndex].trajectoryOnlyAlternateCount += 1;
          }
          continue;
        }

        anyGeometric = true;
        const startLeg = startSummary.perLeg[legIndex];
        startLeg.geometricAlternateCount += 1;
        startLeg.geometricAlternateWeight += weight;
        startLeg.maximumCorridorDiversity = Math.max(
          startLeg.maximumCorridorDiversity,
          Number(comparison.corridorDiversity) || 0
        );
        startLeg.maximumGeometricDistinctRegisters = Math.max(
          startLeg.maximumGeometricDistinctRegisters,
          comparison.geometricDistinctRegisters
        );
        startLeg.maximumGeometricDistinctRun = Math.max(
          startLeg.maximumGeometricDistinctRun,
          comparison.longestGeometricDistinctRun
        );
        if (comparison.firstGeometricDivergenceRegister != null) {
          startLeg.earliestGeometricDivergenceRegister =
            startLeg.earliestGeometricDivergenceRegister == null
              ? comparison.firstGeometricDivergenceRegister
              : Math.min(
                startLeg.earliestGeometricDivergenceRegister,
                comparison.firstGeometricDivergenceRegister
              );
        }
        if (comparison.lastGeometricDivergenceRegister != null) {
          startLeg.latestGeometricDistinctRegister = Math.max(
            startLeg.latestGeometricDistinctRegister ?? 0,
            comparison.lastGeometricDivergenceRegister
          );
        }
        if (comparison.firstGeometricRejoinRegister != null) {
          startLeg.earliestGeometricRejoinRegister =
            startLeg.earliestGeometricRejoinRegister == null
              ? comparison.firstGeometricRejoinRegister
              : Math.min(
                startLeg.earliestGeometricRejoinRegister,
                comparison.firstGeometricRejoinRegister
              );
        }

        const aggregate = perLeg[legIndex];
        aggregate.geometricAlternateWeight += weight;
        aggregate.comparisonCount += 1;
        aggregate.corridorDiversitySum +=
          Number(comparison.corridorDiversity) || 0;
        aggregate.maximumCorridorDiversity = Math.max(
          aggregate.maximumCorridorDiversity,
          Number(comparison.corridorDiversity) || 0
        );
        aggregate.geometricDistinctRegistersSum +=
          comparison.geometricDistinctRegisters;
        aggregate.maximumGeometricDistinctRun = Math.max(
          aggregate.maximumGeometricDistinctRun,
          comparison.longestGeometricDistinctRun
        );
        if (comparison.firstGeometricDivergenceRegister != null) {
          aggregate.earliestGeometricDivergenceRegister =
            aggregate.earliestGeometricDivergenceRegister == null
              ? comparison.firstGeometricDivergenceRegister
              : Math.min(
                aggregate.earliestGeometricDivergenceRegister,
                comparison.firstGeometricDivergenceRegister
              );
        }
        if (comparison.lastGeometricDivergenceRegister != null) {
          aggregate.latestGeometricDistinctRegister = Math.max(
            aggregate.latestGeometricDistinctRegister ?? 0,
            comparison.lastGeometricDivergenceRegister
          );
        }
        if (comparison.firstGeometricRejoinRegister != null) {
          aggregate.rejoinedAlternateCount += 1;
        }
      }

      if (anyGeometric) {
        retainedGeometricAlternateFamilies += 1;
        startSummary.geometricAlternateFamilyCount += 1;
        startSummary.geometricAlternateShare += weight;
      } else if (anyTrajectory) {
        retainedTrajectoryOnlyAlternateFamilies += 1;
        startSummary.trajectoryOnlyAlternateFamilyCount += 1;
        startSummary.trajectoryOnlyAlternateShare += weight;
      }
    }

    if (
      startSummary.geometricAlternateFamilyCount > 0 ||
      startSummary.trajectoryOnlyAlternateFamilyCount > 0
    ) {
      startsWithRetainedAlternates += 1;
    }
    if (startSummary.geometricAlternateFamilyCount > 0) {
      startsWithGeometricAlternates += 1;
    } else if (startSummary.trajectoryOnlyAlternateFamilyCount > 0) {
      startsWithTrajectoryOnlyAlternates += 1;
    }

    startSummary.perLeg.forEach((leg, legIndex) => {
      if (leg.geometricAlternateCount > 0) {
        perLeg[legIndex].startsWithGeometricAlternate += 1;
      }
      leg.geometricAlternateWeight = Number(
        leg.geometricAlternateWeight.toFixed(4)
      );
      leg.maximumCorridorDiversity = Number(
        leg.maximumCorridorDiversity.toFixed(4)
      );
    });
    startSummary.geometricAlternateShare = Number(
      startSummary.geometricAlternateShare.toFixed(4)
    );
    startSummary.trajectoryOnlyAlternateShare = Number(
      startSummary.trajectoryOnlyAlternateShare.toFixed(4)
    );
    starts.push(startSummary);
  }

  return {
    model: "route-family-divergence-audit-v49br",
    behaviorChanged: false,
    startCount: starts.length,
    startsWithRetainedAlternates,
    startsWithGeometricAlternates,
    startsWithTrajectoryOnlyAlternates,
    retainedGeometricAlternateFamilies,
    retainedTrajectoryOnlyAlternateFamilies,
    perLeg: perLeg.map((entry) => ({
      leg: entry.leg,
      startsWithGeometricAlternate: entry.startsWithGeometricAlternate,
      geometricAlternateWeight: Number(
        entry.geometricAlternateWeight.toFixed(4)
      ),
      comparisonCount: entry.comparisonCount,
      averageCorridorDiversity: entry.comparisonCount
        ? Number(
          (entry.corridorDiversitySum / entry.comparisonCount).toFixed(4)
        )
        : 0,
      maximumCorridorDiversity: Number(
        entry.maximumCorridorDiversity.toFixed(4)
      ),
      averageGeometricDistinctRegisters: entry.comparisonCount
        ? Number(
          (
            entry.geometricDistinctRegistersSum / entry.comparisonCount
          ).toFixed(2)
        )
        : 0,
      maximumGeometricDistinctRun: entry.maximumGeometricDistinctRun,
      earliestGeometricDivergenceRegister:
        entry.earliestGeometricDivergenceRegister,
      latestGeometricDistinctRegister:
        entry.latestGeometricDistinctRegister,
      rejoinedAlternateCount: entry.rejoinedAlternateCount
    })),
    starts
  };
}

export function getExplicitOccupancyWeight(occupancyByIndex, index) {
  if (!occupancyByIndex) {
    return null;
  }
  const value = occupancyByIndex instanceof Map
    ? occupancyByIndex.get(index)
    : occupancyByIndex[index];
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

export function getOccupancyQualityOverride(options, index) {
  const source = options?.occupancyQualityScoreByIndex;
  if (!source) return null;
  const value = source instanceof Map ? source.get(index) : source[index];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function getOccupancyQualityScore(analysis, options, routeForAnalysis) {
  const override = getOccupancyQualityOverride(options, analysis.index);
  if (Number.isFinite(override)) return override;

  const iterativeScore = Number(analysis.balanceScore);
  if (
    options?.trafficOccupancyUseBalanceScore &&
    Number.isFinite(iterativeScore)
  ) {
    return iterativeScore;
  }

  const routeScore = Number(routeForAnalysis?.(analysis)?.score);
  return Number.isFinite(routeScore) ? routeScore : Infinity;
}

export function getCommonOccupancyAttractiveness(
  analyses,
  options = {},
  routeForAnalysis = (analysis) => analysis.fullCourseRoute
) {
  const scored = (analyses || []).map((analysis) => ({
    analysis,
    score: getOccupancyQualityScore(analysis, options, routeForAnalysis)
  }));
  const finiteScores = scored
    .map((entry) => entry.score)
    .filter(Number.isFinite);

  if (!finiteScores.length) {
    return {
      minScore: null,
      maxScore: null,
      temperature: null,
      weightByIndex: new Map(scored.map((entry) => [entry.analysis.index, 1]))
    };
  }

  // TRAFFIC_COMMON_FIELD: quality strength belongs to the available start field,
  // not to whichever route happens to be the focus robot. Conditioning a focus
  // start changes only normalization/certain occupancy below. Keeping this one
  // shared temperature prevents an extreme focus start from changing the relative
  // attractiveness of every other pair of starts.
  const minScore = Math.min(...finiteScores);
  const maxScore = Math.max(...finiteScores);
  const temperature = Math.max(6, (maxScore - minScore) / 3);
  const weightByIndex = new Map(scored.map((entry) => [
    entry.analysis.index,
    Number.isFinite(entry.score)
      ? Math.exp(-(entry.score - minScore) / temperature)
      : 0.0001
  ]));

  return {
    minScore,
    maxScore,
    temperature,
    weightByIndex
  };
}

// TRAFFIC_COMMON_FIELD: build one player-normalized occupancy field from a common
// start-quality scale. Certain starts (the focus robot or already-made selector
// choices) consume one whole robot each; only the unresolved robot mass is
// quality-weighted over the still-eligible starts. Individual starts cap at 1.
// With P starts for P players this resolves to 1 each; surplus starts dilute below
// 1, and later route convergence naturally recombines their fractional mass.
export function buildStartOccupancyMap(
  analyses,
  playerCount,
  options = {},
  routeForAnalysis = (analysis) => analysis.fullCourseRoute
) {
  const indexed = [];
  const seen = new Set();
  for (const analysis of analyses || []) {
    if (!analysis || !Number.isInteger(analysis.index) || seen.has(analysis.index)) continue;
    seen.add(analysis.index);
    indexed.push(analysis);
  }

  const result = new Map(indexed.map((analysis) => [analysis.index, 0]));
  if (!indexed.length) return result;

  const eligibleSet = Array.isArray(options.occupancyEligibleIndices)
    ? new Set(options.occupancyEligibleIndices)
    : null;
  const eligible = eligibleSet
    ? indexed.filter((analysis) => eligibleSet.has(analysis.index))
    : indexed;
  if (!eligible.length) return result;

  const requestedPlayers = Math.max(0, Number(playerCount) || 0);
  const targetTotal = Math.min(requestedPlayers, eligible.length);
  if (targetTotal <= 0) return result;

  const certainSet = new Set(
    Array.isArray(options.occupancyCertainIndices)
      ? options.occupancyCertainIndices
      : []
  );
  if (Number.isInteger(options.occupancyFocusIndex)) {
    certainSet.add(options.occupancyFocusIndex);
  }
  const certain = eligible.filter((analysis) => certainSet.has(analysis.index));
  certain.slice(0, targetTotal).forEach((analysis) => result.set(analysis.index, 1));

  const certainCount = Math.min(targetTotal, certain.length);
  const unresolvedTarget = Math.max(0, targetTotal - certainCount);
  if (unresolvedTarget <= 0) return result;

  const unresolvedSet = Array.isArray(options.occupancyUnresolvedIndices)
    ? new Set(options.occupancyUnresolvedIndices)
    : null;
  const unresolved = eligible.filter((analysis) => (
    !certainSet.has(analysis.index) &&
    (!unresolvedSet || unresolvedSet.has(analysis.index))
  ));
  if (!unresolved.length) return result;

  const profile = getCommonOccupancyAttractiveness(
    eligible,
    options,
    routeForAnalysis
  );
  const allocated = allocateCappedOccupancy(
    unresolved,
    Math.min(unresolvedTarget, unresolved.length),
    (analysis) => profile.weightByIndex.get(analysis.index) ?? 0.0001
  );
  for (const [index, value] of allocated.entries()) {
    result.set(index, value);
  }

  return result;
}

export function buildConditionalOccupancyMap(
  analyses,
  focusIndex,
  playerCount,
  options,
  routeForAnalysis
) {
  const others = analyses.filter((analysis) => analysis.index !== focusIndex);
  if (!others.length) {
    return new Map();
  }

  if (options.occupancyByIndex) {
    return new Map(others.map((analysis) => [
      analysis.index,
      getExplicitOccupancyWeight(options.occupancyByIndex, analysis.index)
    ]));
  }

  const fullField = buildStartOccupancyMap(
    analyses,
    playerCount,
    {
      ...options,
      occupancyFocusIndex: focusIndex
    },
    routeForAnalysis
  );
  return new Map(others.map((analysis) => [
    analysis.index,
    fullField.get(analysis.index) ?? 0
  ]));
}


export function summarizeFullCourseCandidateDiversity(
  analysis,
  flags,
  selectedRoute = null,
  candidateEvaluations = []
) {
  const routes = Array.isArray(analysis?.fullCourseRoutes)
    ? analysis.fullCourseRoutes.filter(Boolean)
    : [];
  const baseline = routes[0] ?? null;
  const finalGoal = flags?.at?.(-1) ?? null;
  const wholeSimilarities = [];
  const laterSimilarities = [];

  if (baseline && finalGoal) {
    for (const candidate of routes.slice(1)) {
      wholeSimilarities.push(routeSimilarity(baseline, candidate, finalGoal));

      const baseLegs = getTrafficLegs(baseline);
      const candidateLegs = getTrafficLegs(candidate);
      const perLeg = [];
      const laterLegCount = Math.min(baseLegs.length, candidateLegs.length, flags.length);
      for (let legIndex = 1; legIndex < laterLegCount; legIndex += 1) {
        const legGoal = flags[legIndex];
        if (!legGoal) continue;
        perLeg.push(routeSimilarity(baseLegs[legIndex], candidateLegs[legIndex], legGoal));
      }
      if (perLeg.length) laterSimilarities.push(average(perLeg));
    }
  }

  const selectedIndex = selectedRoute ? routes.indexOf(selectedRoute) : -1;
  const normalizedEvaluations = (candidateEvaluations || []).map((entry, index) => ({
    routeIndex: Number.isInteger(entry?.routeIndex) ? entry.routeIndex : index,
    intrinsicScore: Number.isFinite(entry?.intrinsicScore)
      ? Number(entry.intrinsicScore.toFixed(2))
      : null,
    intrinsicDelta: Number.isFinite(entry?.intrinsicDelta)
      ? Number(entry.intrinsicDelta.toFixed(2))
      : null,
    trafficPenalty: Number.isFinite(entry?.trafficPenalty)
      ? Number(entry.trafficPenalty.toFixed(2))
      : null,
    combinedValue: Number.isFinite(entry?.combinedValue)
      ? Number(entry.combinedValue.toFixed(2))
      : null,
    strategicGain: Number.isFinite(entry?.strategicGain)
      ? Number(entry.strategicGain.toFixed(2))
      : null,
    intrinsicRE: Number.isFinite(entry?.intrinsicRE)
      ? Number(entry.intrinsicRE.toFixed(4))
      : null,
    robotLaserDamageRE: Number.isFinite(entry?.robotLaserDamageRE)
      ? Number(entry.robotLaserDamageRE.toFixed(4))
      : null,
    nearbyControlRE: Number.isFinite(entry?.nearbyControlRE)
      ? Number(entry.nearbyControlRE.toFixed(4))
      : null,
    residualRangedThreatRE: Number.isFinite(entry?.residualRangedThreatRE)
      ? Number(entry.residualRangedThreatRE.toFixed(4))
      : null,
    competitionRE: Number.isFinite(entry?.competitionRE)
      ? Number(entry.competitionRE.toFixed(4))
      : null,
    trafficMentalRE: Number.isFinite(entry?.trafficMentalRE)
      ? Number(entry.trafficMentalRE.toFixed(4))
      : null,
    effectiveRE: Number.isFinite(entry?.effectiveRE)
      ? Number(entry.effectiveRE.toFixed(4))
      : null,
    effectiveREGain: Number.isFinite(entry?.effectiveREGain)
      ? Number(entry.effectiveREGain.toFixed(4))
      : null
  }));
  const baselineEvaluation = normalizedEvaluations.find((entry) => entry.routeIndex === 0) ?? null;
  const selectedEvaluation = selectedIndex >= 0
    ? normalizedEvaluations.find((entry) => entry.routeIndex === selectedIndex) ?? null
    : null;
  const intrinsicCostSelectedVsBest = selectedIndex > 0 && baseline && selectedRoute
    ? Number((selectedRoute.score - baseline.score).toFixed(2))
    : selectedIndex === 0
      ? 0
      : null;
  const trafficAdvantageSelectedVsBest = baselineEvaluation && selectedEvaluation
    ? Number((baselineEvaluation.trafficPenalty - selectedEvaluation.trafficPenalty).toFixed(2))
    : null;
  const strategicGainSelectedVsBest = selectedEvaluation && Number.isFinite(selectedEvaluation.strategicGain)
    ? Number(selectedEvaluation.strategicGain.toFixed(2))
    : null;
  const effectiveREGainSelectedVsBest = selectedEvaluation &&
    Number.isFinite(selectedEvaluation.effectiveREGain)
    ? Number(selectedEvaluation.effectiveREGain.toFixed(4))
    : null;

  return {
    startIndex: analysis?.index ?? null,
    candidateCount: routes.length,
    selectedRouteIndex: selectedIndex >= 0 ? selectedIndex : null,
    trafficSwitched: Boolean(selectedIndex > 0),
    wholeMostDifferentSimilarity: wholeSimilarities.length
      ? Number(Math.min(...wholeSimilarities).toFixed(3))
      : null,
    laterMostDifferentSimilarity: laterSimilarities.length
      ? Number(Math.min(...laterSimilarities).toFixed(3))
      : null,
    selectedWholeSimilarityToBest: selectedIndex > 0 && finalGoal
      ? Number(routeSimilarity(baseline, selectedRoute, finalGoal).toFixed(3))
      : selectedIndex === 0
        ? 1
        : null,
    scoreSpread: routes.length > 1
      ? Number((Math.max(...routes.map((route) => route.score)) - Math.min(...routes.map((route) => route.score))).toFixed(2))
      : 0,
    intrinsicCostSelectedVsBest,
    trafficAdvantageSelectedVsBest,
    strategicGainSelectedVsBest,
    effectiveREGainSelectedVsBest,
    baselineTrafficPenalty: baselineEvaluation?.trafficPenalty ?? null,
    selectedTrafficPenalty: selectedEvaluation?.trafficPenalty ?? null,
    candidateEvaluations: normalizedEvaluations
  };
}

export function summarizeTrafficCompletedRouteOwnershipAudit(
  analyses,
  candidateEvaluationsByIndex,
  selectedByIndex,
  minimumUsefulTrafficGainScore = 0
) {
  const thresholdScore = Math.max(0, Number(minimumUsefulTrafficGainScore) || 0);
  const thresholdRE = thresholdScore / REGISTER_TEMPO_COST;
  const perStart = [];

  for (const analysis of analyses || []) {
    const evaluations = (candidateEvaluationsByIndex?.get?.(analysis.index) || [])
      .filter((entry) => entry?.route && Number.isInteger(entry.routeIndex));
    if (!evaluations.length) continue;

    const baseline = evaluations.find((entry) => entry.routeIndex === 0) ?? evaluations[0];
    const actualRoute = selectedByIndex?.get?.(analysis.index) ?? analysis.fullCourseRoute ?? null;
    const actualRouteIndex = actualRoute
      ? analysis.fullCourseRoutes?.indexOf(actualRoute) ?? -1
      : -1;

    let currentPreferred = baseline;
    let currentBestValue = Number(baseline?.strategicValue);
    for (const candidate of evaluations) {
      if (candidate === baseline || candidate.routeIndex === baseline.routeIndex) continue;
      const gain = Number(baseline?.strategicValue) - Number(candidate?.strategicValue);
      if (!Number.isFinite(gain) || gain < thresholdScore) continue;
      const value = Number(candidate?.combinedValue);
      if (!Number.isFinite(value)) continue;
      if (
        !Number.isFinite(currentBestValue) ||
        value < currentBestValue - 0.001 ||
        (
          Math.abs(value - currentBestValue) <= 0.001 &&
          candidate.routeIndex < currentPreferred.routeIndex
        )
      ) {
        currentPreferred = candidate;
        currentBestValue = value;
      }
    }

    const finiteRE = evaluations.filter((entry) => Number.isFinite(Number(entry.effectiveRE)));
    const baselineEffectiveRE = Number(baseline?.effectiveRE);
    let rePreferred = baseline;
    if (Number.isFinite(baselineEffectiveRE)) {
      for (const candidate of finiteRE) {
        if (candidate === baseline || candidate.routeIndex === baseline.routeIndex) continue;
        const gainRE = baselineEffectiveRE - Number(candidate.effectiveRE);
        if (!Number.isFinite(gainRE) || gainRE < thresholdRE) continue;
        if (
          !Number.isFinite(Number(rePreferred?.effectiveRE)) ||
          Number(candidate.effectiveRE) < Number(rePreferred.effectiveRE) - 0.0001 ||
          (
            Math.abs(Number(candidate.effectiveRE) - Number(rePreferred.effectiveRE)) <= 0.0001 &&
            candidate.routeIndex < rePreferred.routeIndex
          )
        ) {
          rePreferred = candidate;
        }
      }
    }

    const rawREBest = finiteRE.length
      ? [...finiteRE].sort((left, right) => (
        Number(left.effectiveRE) - Number(right.effectiveRE) ||
        left.routeIndex - right.routeIndex
      ))[0]
      : null;

    const currentEffectiveRE = Number(currentPreferred?.effectiveRE);
    const rePreferredEffectiveRE = Number(rePreferred?.effectiveRE);
    const foregoneEffectiveRE = (
      Number.isFinite(currentEffectiveRE) && Number.isFinite(rePreferredEffectiveRE)
    )
      ? Math.max(0, currentEffectiveRE - rePreferredEffectiveRE)
      : 0;

    perStart.push({
      startIndex: analysis.index,
      candidateCount: evaluations.length,
      actualSelectedRouteIndex: actualRouteIndex >= 0 ? actualRouteIndex : null,
      currentPreferredRouteIndex: currentPreferred?.routeIndex ?? null,
      rePreferredRouteIndex: rePreferred?.routeIndex ?? null,
      rawREBestRouteIndex: rawREBest?.routeIndex ?? null,
      currentVsREPreferredDisagree:
        currentPreferred?.routeIndex !== rePreferred?.routeIndex,
      actualVsCurrentPreferredDisagree:
        actualRouteIndex >= 0 && actualRouteIndex !== currentPreferred?.routeIndex,
      actualVsREPreferredDisagree:
        actualRouteIndex >= 0 && actualRouteIndex !== rePreferred?.routeIndex,
      baselineStrategicValue: Number.isFinite(Number(baseline?.strategicValue))
        ? Number(Number(baseline.strategicValue).toFixed(3))
        : null,
      currentPreferredStrategicValue: Number.isFinite(Number(currentPreferred?.strategicValue))
        ? Number(Number(currentPreferred.strategicValue).toFixed(3))
        : null,
      baselineEffectiveRE: Number.isFinite(baselineEffectiveRE)
        ? Number(baselineEffectiveRE.toFixed(4))
        : null,
      currentPreferredEffectiveRE: Number.isFinite(currentEffectiveRE)
        ? Number(currentEffectiveRE.toFixed(4))
        : null,
      rePreferredEffectiveRE: Number.isFinite(rePreferredEffectiveRE)
        ? Number(rePreferredEffectiveRE.toFixed(4))
        : null,
      rawREBestEffectiveRE: Number.isFinite(Number(rawREBest?.effectiveRE))
        ? Number(Number(rawREBest.effectiveRE).toFixed(4))
        : null,
      currentGainScore: currentPreferred === baseline
        ? 0
        : Number((Number(baseline?.strategicValue) - Number(currentPreferred?.strategicValue)).toFixed(3)),
      reGainRE: rePreferred === baseline
        ? 0
        : Number((baselineEffectiveRE - rePreferredEffectiveRE).toFixed(4)),
      rawBestGainRE: rawREBest && Number.isFinite(baselineEffectiveRE)
        ? Number(Math.max(0, baselineEffectiveRE - Number(rawREBest.effectiveRE)).toFixed(4))
        : 0,
      foregoneEffectiveRE: Number(foregoneEffectiveRE.toFixed(4))
    });
  }

  const disagreementStarts = perStart.filter((entry) => entry.currentVsREPreferredDisagree);
  const foregone = disagreementStarts
    .map((entry) => Number(entry.foregoneEffectiveRE) || 0)
    .filter((value) => value > 0);
  const rawOnlyImprovements = perStart.filter((entry) => (
    entry.rawREBestRouteIndex !== entry.rePreferredRouteIndex &&
    Number(entry.rawBestGainRE) > 0
  ));

  return {
    model: "completed-route-ownership-audit-v49dn",
    observationalOnly: true,
    behaviorChanged: true,
    comparisonSnapshot: "final frozen occupancy/route-mixture field",
    productionObjective: "completed effective RE",
    legacyComparatorObjective: "pathfinder search cost + traffic search pressure (+4% raw-gap stability after gain gate)",
    minimumUsefulGainScore: Number(thresholdScore.toFixed(3)),
    minimumUsefulGainRE: Number(thresholdRE.toFixed(4)),
    startCount: perStart.length,
    startsWithAlternates: perStart.filter((entry) => entry.candidateCount > 1).length,
    currentVsREPreferredDisagreements: disagreementStarts.length,
    actualVsCurrentSnapshotDisagreements: perStart.filter(
      (entry) => entry.actualVsCurrentPreferredDisagree
    ).length,
    actualVsREPreferredDisagreements: perStart.filter(
      (entry) => entry.actualVsREPreferredDisagree
    ).length,
    rawREBestBelowThresholdStarts: rawOnlyImprovements.length,
    meanForegoneEffectiveRE: foregone.length
      ? Number((foregone.reduce((sum, value) => sum + value, 0) / foregone.length).toFixed(4))
      : 0,
    maximumForegoneEffectiveRE: foregone.length
      ? Number(Math.max(...foregone).toFixed(4))
      : 0,
    perStart
  };
}
