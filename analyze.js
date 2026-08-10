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
const TRAFFIC_TIMELINE_CACHE = new WeakMap();
const TRAFFIC_PAIR_PROFILE_CACHE = new WeakMap();
const TRAFFIC_DISPLACEMENT_CACHE = new WeakMap();

const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE = new WeakMap();
const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT = 50000;

function getContextualPhysicalOptionSignature(options = {}) {
  const rebootTokens = (options.rebootTokens || [])
    .map((token) => [
      token.x ?? "",
      token.y ?? "",
      token.facing ?? token.dir ?? "",
      token.boardId ?? token.board ?? ""
    ].join(","))
    .sort()
    .join(";");

  const boardRects = (options.boardRects || [])
    .map((rect) => [
      rect.id ?? rect.boardId ?? "",
      rect.x ?? "",
      rect.y ?? "",
      rect.width ?? rect.w ?? "",
      rect.height ?? rect.h ?? ""
    ].join(","))
    .sort()
    .join(";");

  return [
    options.recoveryRule ?? "",
    options.lessDeadlyGame ? 1 : 0,
    options.repulsorOverdrive ? 1 : 0,
    options.repairStations ? 1 : 0,
    options.lighterGame ? 1 : 0,
    options.flamingOil ? 1 : 0,
    options.walledIn ? 1 : 0,
    options.hardReboot ? 1 : 0,
    options.playerCount ?? "",
    rebootTokens,
    boardRects
  ].join("|");
}

function getContextualPhysicalTransitionCache(tileMap) {
  let cache = CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.set(tileMap, cache);
  }
  return cache;
}

function cloneCachedTransition(transition) {
  if (!transition) return transition;
  return {
    ...transition,
    from: transition.from ? { ...transition.from } : transition.from,
    to: transition.to ? { ...transition.to } : transition.to,
    rebootChoices: transition.rebootChoices
      ? transition.rebootChoices.map((choice) => ({ ...choice }))
      : transition.rebootChoices,
    traversed: (transition.traversed || []).map((point) => ({ ...point })),
    conveyorSteps: (transition.conveyorSteps || []).map((step) => ({
      ...step,
      from: step.from ? { ...step.from } : step.from,
      to: step.to ? { ...step.to } : step.to
    })),
    boardEvents: (transition.boardEvents || []).map((event) => ({
      ...event,
      from: event.from ? { ...event.from } : event.from,
      to: event.to ? { ...event.to } : event.to,
      at: event.at ? { ...event.at } : event.at
    }))
  };
}

function getCachedContextualPhysicalTransition(
  tileMap,
  state,
  action,
  options,
  optionSignature
) {
  const goal = options.goal;
  const key = [
    state.x,
    state.y,
    state.facing,
    action.id,
    goal?.x ?? "",
    goal?.y ?? "",
    optionSignature
  ].join("|");

  const cache = getContextualPhysicalTransitionCache(tileMap);
  const cached = cache.get(key);
  if (cached) {
    return {
      transition: cloneCachedTransition(cached),
      hit: true
    };
  }

  const transition = simulateAction(tileMap, state, action, options);
  cache.set(key, cloneCachedTransition(transition));

  if (cache.size > CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  return {
    transition,
    hit: false
  };
}
const LINE_OF_SIGHT_CACHE = new WeakMap();
const ROUTE_SIMILARITY_CACHE = new Map();
const OVERLAP_PENALTY_CACHE = new Map();
const LATERAL_THREAT_CACHE = new Map();
const REAR_THREAT_CACHE = new Map();
const ONCOMING_TRAFFIC_CACHE = new Map();
const ROUTE_PAIR_CACHE_LIMIT = 2500;

const ANALYSIS_TELEMETRY_MAX_SEARCHES = 5000;
const ANALYSIS_TELEMETRY = {
  routeSearches: []
};

function analysisTelemetryNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function resetAnalysisTelemetry() {
  ANALYSIS_TELEMETRY.routeSearches.length = 0;
}

export function getAnalysisTelemetrySnapshot() {
  const routeSearches = ANALYSIS_TELEMETRY.routeSearches.map((entry) => ({ ...entry }));
  const totalsByKind = {};
  let totalExpansions = 0;
  let totalDurationMs = 0;
  let cappedSearches = 0;

  routeSearches.forEach((entry) => {
    totalExpansions += entry.expansions ?? 0;
    totalDurationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) cappedSearches += 1;
    const kind = entry.kind ?? "unknown";
    const bucket = totalsByKind[kind] ?? {
      searches: 0,
      expansions: 0,
      durationMs: 0,
      capped: 0
    };
    bucket.searches += 1;
    bucket.expansions += entry.expansions ?? 0;
    bucket.durationMs += entry.durationMs ?? 0;
    if (entry.hitExpansionCap) bucket.capped += 1;
    totalsByKind[kind] = bucket;
  });

  Object.values(totalsByKind).forEach((bucket) => {
    bucket.durationMs = Number(bucket.durationMs.toFixed(2));
  });

  const slowestSearch = routeSearches.reduce(
    (slowest, entry) => !slowest || (entry.durationMs ?? 0) > (slowest.durationMs ?? 0) ? entry : slowest,
    null
  );

  const contextualProfileTotals = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    actionScoringMs: 0,
    historyBuildMs: 0,
    destinationBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    completedGoals: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0
  };

  routeSearches.forEach((entry) => {
    const profile = entry.contextualProfile;
    if (!profile) return;
    Object.keys(contextualProfileTotals).forEach((key) => {
      contextualProfileTotals[key] += profile[key] ?? 0;
    });
  });

  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "actionScoringMs",
    "historyBuildMs",
    "destinationBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    contextualProfileTotals[key] = Number(contextualProfileTotals[key].toFixed(2));
  });

  return {
    routeSearches,
    routeSearchCount: routeSearches.length,
    totalExpansions,
    totalDurationMs: Number(totalDurationMs.toFixed(2)),
    cappedSearches,
    slowestSearch: slowestSearch ? { ...slowestSearch } : null,
    totalsByKind,
    contextualProfileTotals
  };
}

function recordRouteSearchTelemetry(kind, startedAt, details = {}) {
  const entry = {
    kind,
    durationMs: Number((analysisTelemetryNow() - startedAt).toFixed(2)),
    expansions: details.expansions ?? 0,
    maxExpansions: details.maxExpansions ?? 0,
    completedRoutes: details.completedRoutes ?? 0,
    returnedRoutes: details.returnedRoutes ?? details.completedRoutes ?? 0,
    hitExpansionCap: Boolean(
      details.maxExpansions > 0 &&
      (details.expansions ?? 0) >= details.maxExpansions
    ),
    start: details.start ?? null,
    goal: details.goal ?? null,
    legIndex: details.legIndex ?? null,
    contextualProfile: details.contextualProfile
      ? { ...details.contextualProfile }
      : null
  };

  if (ANALYSIS_TELEMETRY.routeSearches.length >= ANALYSIS_TELEMETRY_MAX_SEARCHES) {
    ANALYSIS_TELEMETRY.routeSearches.shift();
  }
  ANALYSIS_TELEMETRY.routeSearches.push(entry);
}

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

  const registerIndex = Number.isInteger(options.absoluteActionCount)
    ? options.absoluteActionCount % REGISTER_COUNT
    : history.length % REGISTER_COUNT;
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
  const telemetryStartedAt = analysisTelemetryNow();
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
      const scarceReusePenalty = getCardAvailabilityPressure(
        current.actionHistory,
        action.id,
        {
          ...options,
          absoluteActionCount: current.actions
        }
      );
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

  recordRouteSearchTelemetry("single-leg", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: { x: goal.x, y: goal.y }
  });
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
  const telemetryStartedAt = analysisTelemetryNow();
  if (!Array.isArray(flags) || !flags.length) {
    recordRouteSearchTelemetry("full-course", telemetryStartedAt, {
      expansions: 0,
      maxExpansions: 0,
      completedRoutes: 0,
      returnedRoutes: 0,
      start: { x: start.x, y: start.y, facing: start.facing ?? null },
      goal: null
    });
    return [];
  }

  const maxRoutes = options.maxRoutes ?? 2;
  const maxActions = options.maxActions ?? Math.max(24, flags.length * 18 + 8);
  const maxExpansions = options.maxExpansions ?? 45000;
  const maxStateLabels = Math.max(1, Math.min(2, options.maxStateLabels ?? 1));
  const initialFacings = options.startupSpinUp ? ROTATION_ORDER : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = { ...options, portalMap };
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostsByState = new Map();

  const acceptStateLabel = (stateId, cost, labelLimit = maxStateLabels) => {
    const safeLimit = Math.max(1, Math.min(maxStateLabels, labelLimit));
    const costs = bestCostsByState.get(stateId) ?? [];
    if (costs.length < safeLimit) {
      bestCostsByState.set(stateId, [...costs, cost].sort((a, b) => a - b));
      return true;
    }
    const worst = costs[costs.length - 1];
    if (cost < worst - 0.001) {
      bestCostsByState.set(
        stateId,
        [...costs.slice(0, safeLimit - 1), cost].sort((a, b) => a - b)
      );
      return true;
    }
    return false;
  };

  const stateLabelStillActive = (stateId, cost) => {
    const costs = bestCostsByState.get(stateId);
    return Boolean(costs?.length) && cost <= costs[costs.length - 1] + 0.001;
  };

  for (const facing of initialFacings) {
    const initialState = { x: start.x, y: start.y, facing };
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
    acceptStateLabel(initialStateKey, 0, 1);
    queue.push(createFullCourseQueueEntry(initialRoute, flags, options));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getFullCourseSearchStateKey(
      current.finalState,
      current.actions,
      current.checkpointIndex,
      options
    );
    if (!stateLabelStillActive(currentStateId, current.baseCost)) continue;

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
    if (current.actions >= maxActions) continue;

    const currentTarget = getFullCourseTarget(flags, current.checkpointIndex, current.actions, options);
    for (const action of ACTIONS) {
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal: currentTarget,
        registerIndex: current.actions % REGISTER_COUNT
      });
      if (transition.crashed || transition.blocked) continue;

      const actionPenalty = getActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2" ? 0.25 : action.id === "FORWARD_3" ? 0.75 : 0;
      const scarceReusePenalty = getCardAvailabilityPressure(
        current.actionHistory,
        action.id,
        {
          ...options,
          absoluteActionCount: current.actions
        }
      );
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

        const nextStateKey = getFullCourseSearchStateKey(
          nextRoute.finalState,
          nextActionCount,
          nextRoute.checkpointIndex,
          options
        );
        const stateLabelLimit = (
          options.diverseStateLabelsAfterFirstCheckpoint &&
          nextRoute.checkpointIndex >= 1
        )
          ? maxStateLabels
          : 1;
        if (!acceptStateLabel(nextStateKey, nextRoute.baseCost, stateLabelLimit)) continue;
        queue.push(createFullCourseQueueEntry(nextRoute, flags, options));
      }
    }
  }

  recordRouteSearchTelemetry("full-course", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: flags.length ? { x: flags.at(-1).x, y: flags.at(-1).y } : null
  });
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
  let frontal = 1;
  const damagePressure = getDamageDeckPressureMultipliers(options);

  if (options.setToKill) {
    lateral *= 1.18;
    rear *= 1.35;
    frontal *= 1.25;
  }
  if (options.setToStun) {
    lateral *= 0.65;
    rear *= 0.45;
    frontal *= 0.55;
  }

  lateral *= damagePressure.robotTraffic;
  rear *= damagePressure.robotTraffic;
  frontal *= damagePressure.robotTraffic;

  return { lateral, rear, frontal };
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
  const activeSet = activeIndices ?? new Set(
    startAnalyses
      .filter((analysis) => analysis.routes.length)
      .map((analysis) => analysis.index)
  );
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const playerCount = Math.max(1, options.playerCount ?? activeAnalyses.length);

  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;

    for (let index = 0; index < startAnalyses.length; index += 1) {
      const analysis = startAnalyses[index];
      if (!analysis.routes.length || !activeSet.has(analysis.index)) {
        continue;
      }

      const occupancyByIndex = buildConditionalOccupancyMap(
        activeAnalyses,
        analysis.index,
        playerCount,
        options,
        (other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return other.routes[selections[otherIndex] ?? 0];
        }
      );

      const otherRouteEntries = activeAnalyses
        .filter((other) => other.index !== analysis.index)
        .map((other) => {
          const otherIndex = startAnalyses.indexOf(other);
          return {
            route: other.routes[selections[otherIndex] ?? 0],
            occupancyWeight: occupancyByIndex.get(other.index) ?? 0
          };
        })
        .filter((entry) => entry.route && entry.occupancyWeight > 0);

      let bestRouteIndex = selections[index];
      let bestAdjusted = Infinity;

      analysis.routes.forEach((route, routeIndex) => {
        const traffic = getExpectedTrafficBreakdown(
          tileMap,
          route,
          otherRouteEntries,
          [goal],
          {
            ...options,
            singleLegTraffic: true
          }
        );

        const adjusted = route.score + traffic.total;
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
  const activeAnalyses = startAnalyses.filter((analysis) => (
    analysis.routes.length &&
    activeSet.has(analysis.index)
  ));
  const routeCapableStarts = activeAnalyses.length;
  const trafficScale = routeCapableStarts > 1
    ? Math.min(1, Math.max(0, (playerCount - 1) / (routeCapableStarts - 1)))
    : 0;

  const selectedRouteIndices = assignRoutesWithOverlap(
    tileMap,
    startAnalyses,
    goal,
    trafficScale,
    activeSet,
    {
      ...options,
      playerCount
    }
  );

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
      analysis.trafficRanged = Infinity;
      analysis.trafficNearby = Infinity;
      analysis.trafficCompetition = Infinity;
      analysis.trafficScale = trafficScale;
      analysis.trafficPenalty = Infinity;
      analysis.adjustedScore = Infinity;
      return;
    }

    const occupancyByIndex = buildConditionalOccupancyMap(
      activeAnalyses,
      analysis.index,
      playerCount,
      options,
      (other) => other.selectedRoute
    );
    const otherRouteEntries = activeAnalyses
      .filter((other) => other.index !== analysis.index && other.selectedRoute)
      .map((other) => ({
        route: other.selectedRoute,
        occupancyWeight: occupancyByIndex.get(other.index) ?? 0
      }))
      .filter((entry) => entry.occupancyWeight > 0);

    const traffic = getExpectedTrafficBreakdown(
      tileMap,
      analysis.selectedRoute,
      otherRouteEntries,
      [goal],
      {
        ...options,
        playerCount,
        singleLegTraffic: true
      }
    );

    analysis.trafficRanged = traffic.ranged;
    analysis.trafficNearby = traffic.nearby;
    analysis.trafficCompetition = traffic.competition;

    // Keep legacy fields populated for older report/diagnostic consumers.
    analysis.overlapPenalty = traffic.competition;
    analysis.lateralThreat = traffic.nearby;
    analysis.rearThreat = traffic.ranged;
    analysis.routeThreat = Number((traffic.ranged + traffic.nearby).toFixed(2));
    analysis.trafficScale = trafficScale;
    analysis.trafficPenalty = traffic.total;
    analysis.courseScoreAdjustment = Number(analysis.courseScoreAdjustment ?? 0);
    analysis.adjustedScore = Number((
      analysis.bestScore +
      analysis.trafficPenalty +
      analysis.courseScoreAdjustment
    ).toFixed(2));
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

  const graceRegisters = 0;
  const legRoutes = flags.map((_, legIndex) => (
    applyTrafficGraceToRoute(sliceFullCourseRoute(route, legIndex, flags), graceRegisters)
  ));
  route.legRoutes = legRoutes;
  route.absoluteStartAction = 0;
  applyTrafficGraceToRoute(route, graceRegisters);
  return route;
}

function getFullCourseCorridorDiversity(routeA, routeB, flags) {
  const legsA = routeA?.legRoutes ?? [];
  const legsB = routeB?.legRoutes ?? [];
  const legCount = Math.min(flags.length, legsA.length, legsB.length);
  if (!legCount) {
    const finalGoal = flags.at(-1);
    return finalGoal ? 1 - routeSimilarity(routeA, routeB, finalGoal) : 0;
  }

  const firstComparedLeg = legCount > 1 ? 1 : 0;
  let weightedDifference = 0;
  let totalWeight = 0;
  for (let legIndex = firstComparedLeg; legIndex < legCount; legIndex += 1) {
    const legA = legsA[legIndex];
    const legB = legsB[legIndex];
    const goal = flags[legIndex];
    if (!legA || !legB || !goal) continue;
    const weight = 1 + legIndex * 0.15;
    weightedDifference += (1 - routeSimilarity(legA, legB, goal)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedDifference / totalWeight : 0;
}

function selectCorridorDiverseFullCourseRoutes(routes, flags, limit = 3) {
  if (!routes.length || limit <= 0) return [];
  const remaining = [...routes].sort((left, right) => left.score - right.score);
  const selected = [remaining.shift()];

  while (selected.length < limit && remaining.length) {
    let bestIndex = -1;
    let bestNovelty = -Infinity;
    let bestScore = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const novelty = Math.min(...selected.map((chosen) => getFullCourseCorridorDiversity(candidate, chosen, flags)));
      if (novelty > bestNovelty + 0.001 || (Math.abs(novelty - bestNovelty) <= 0.001 && candidate.score < bestScore)) {
        bestNovelty = novelty;
        bestScore = candidate.score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestNovelty < 0.12) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.sort((left, right) => left.score - right.score);
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

function getRegisterTimeline(route) {
  if (!route?.transitions?.length) {
    return [];
  }

  const cached = TRAFFIC_TIMELINE_CACHE.get(route);
  if (cached) {
    return cached;
  }

  const startAction = route.absoluteStartAction ?? 0;
  const timeline = route.transitions.map((transition, index) => {
    const before = transition.from ?? route.initialState;
    const after = transition.to ?? transition.state ?? before;
    const boardComplexity =
      ((transition.conveyorSteps || []).length * 0.35) +
      ((transition.boardEvents || []).length * 0.18) +
      (transition.gearTurned ? 0.25 : 0) +
      ((transition.hazard || 0) > 0 ? 0.2 : 0);

    return {
      absoluteRegister: startAction + index + 1,
      legRegister: index + 1,
      before,
      after,
      facing: after?.facing ?? before?.facing,
      uncertainty: Math.min(2.8, 0.75 + index * 0.12 + boardComplexity)
    };
  });

  TRAFFIC_TIMELINE_CACHE.set(route, timeline);
  return timeline;
}

function getTemporalInteractionWeight(pointA, pointB) {
  const delta = Math.abs((pointA?.legRegister ?? 0) - (pointB?.legRegister ?? 0));
  const spread = Math.max(
    1,
    (pointA?.uncertainty ?? 1) + (pointB?.uncertainty ?? 1)
  );

  if (delta >= spread * 2.25) {
    return 0;
  }

  return Math.max(0, 1 - delta / (spread * 2.25));
}

function classifyTrafficOrientation(reference, other) {
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

function getStandardRobotLaserCost() {
  // A normal robot laser is anchored to the exact route-score cost of a normal
  // one-damage board laser. Cutting Floor applies to board lasers only, so the
  // reference deliberately uses neutral board-laser rules here.
  return getTilePenaltyForFeature(
    { type: "laser", damage: 1 },
    { cuttingFloor: false }
  );
}

function getNearbyInteractionProbability(orientation, distance) {
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

function getOrdinaryInterferenceCost() {
  // Blocking / replanning on otherwise harmless floor is real, but far cheaper
  // than taking a point of damage.
  return getStandardRobotLaserCost() * 0.2;
}

function getRouteDeviationScore(timeline, timelineIndex, destination) {
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

function getDisplacementConsequenceScore(
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
      repulsorActive: true
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
      if (moveCheck.repulsor || features.some((feature) => feature.type === "repulsor")) {
        consequence += Math.max(
          damageUnit * 0.35,
          getTilePenaltyForFeature(
            { type: "repulsor" },
            options
          ) * 0.7
        );
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

function getDisplacementConsequenceMultiplier(
  tileMap,
  point,
  timeline,
  timelineIndex,
  options = {}
) {
  const consequence = getDisplacementConsequenceScore(
    tileMap,
    point,
    timeline,
    timelineIndex,
    options
  );
  const damageUnit = getStandardRobotLaserCost();

  // Nearby robot pressure exists even on empty floor. Consequential squares
  // amplify it in damage-equivalent terms, capped to keep pushes from dwarfing
  // the entire route score.
  return 1 + Math.min(2.6, consequence / (damageUnit * 1.5));
}

function getRobotRangedPressure(tileMap, targetPoint, shooterPoint, options = {}) {
  if (!targetPoint?.after || !shooterPoint?.after) {
    return 0;
  }

  const target = targetPoint.after;
  const shooter = shooterPoint.after;
  const facing = shooter.facing ?? shooterPoint.facing;
  const vector = DIRS[facing];
  if (!vector) {
    return 0;
  }

  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const aligned = vector.dx !== 0
    ? dy === 0 && Math.sign(dx) === Math.sign(vector.dx)
    : dx === 0 && Math.sign(dy) === Math.sign(vector.dy);

  if (!aligned || !hasLineOfSight(tileMap, shooter, target)) {
    return 0;
  }

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

function getRouteCompetitionPressure(tileMap, pointA, pointB) {
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

function getVirtualPhysicalInteractionScale(pointA, pointB, options = {}) {
  if (!options.virtualBots) {
    return 1;
  }

  const register = Math.max(
    1,
    Math.min(
      pointA?.absoluteRegister ?? 1,
      pointB?.absoluteRegister ?? 1
    )
  );

  // Virtual Bots can cease being virtual as early as the first register once
  // separated. We cannot predict that exact moment, so ramp the probability of
  // ordinary physical interaction quickly instead of deleting an entire round.
  if (register <= 1) return 0;
  if (register === 2) return 0.4;
  if (register === 3) return 0.72;
  if (register === 4) return 0.9;
  return 1;
}

function getVirtualCompetitionScale(physicalScale, options = {}) {
  return options.virtualBots
    ? Math.max(0, 1 - physicalScale)
    : 0;
}

function getTrafficRouteEntry(entry) {
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

function getTrafficLegs(route) {
  return route?.legRoutes?.length
    ? route.legRoutes
    : route
      ? [route]
      : [];
}

function getTrafficDisplacementProfile(tileMap, route, timeline, options = {}) {
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

function getTrafficPairProfile(tileMap, route, otherRoute, options = {}) {
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
    const empty = { ranged: [], nearby: [], competition: [] };
    otherCache.set(otherRoute, empty);
    return empty;
  }

  const displacementProfile = getTrafficDisplacementProfile(
    tileMap,
    route,
    timelineA,
    options
  );
  const ranged = new Array(timelineA.length).fill(0);
  const nearby = new Array(timelineA.length).fill(0);
  const competition = new Array(timelineA.length).fill(0);

  timelineA.forEach((pointA, timelineIndex) => {
    let temporalMass = 0;
    let strongestTemporal = 0;
    let rangedWeighted = 0;
    let nearbyWeighted = 0;
    let competitionWeighted = 0;

    const maximumOtherUncertainty = 2.8;
    const temporalRadius = Math.ceil(
      ((pointA.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
    );
    const centerIndex = Math.max(0, (pointA.legRegister ?? 1) - 1);
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

      const physicalScale = getVirtualPhysicalInteractionScale(
        pointA,
        pointB,
        options
      );
      const competitionScale = getVirtualCompetitionScale(
        physicalScale,
        options
      );

      if (physicalScale > 0) {
        rangedWeighted += (
          getRobotRangedPressure(tileMap, pointA, pointB, options) *
          temporal *
          physicalScale
        );

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
    nearby[timelineIndex] = (
      nearbyWeighted / temporalMass
    ) * credibility;
    competition[timelineIndex] = (
      competitionWeighted / temporalMass
    ) * credibility;
  });

  const profile = { ranged, nearby, competition };
  otherCache.set(otherRoute, profile);
  return profile;
}

function getExpectedTrafficBreakdownForLeg(
  tileMap,
  route,
  selectedRouteEntries,
  options = {}
) {
  const timelineA = getRegisterTimeline(route);
  if (!timelineA.length || !selectedRouteEntries?.length) {
    return { ranged: 0, nearby: 0, competition: 0, total: 0 };
  }

  const preparedOthers = selectedRouteEntries
    .map(getTrafficRouteEntry)
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  if (!preparedOthers.length) {
    return { ranged: 0, nearby: 0, competition: 0, total: 0 };
  }

  const damageUnit = getStandardRobotLaserCost();
  const rangedByRegister = new Array(timelineA.length).fill(0);
  const nearbyByRegister = new Array(timelineA.length).fill(0);
  const competitionByRegister = new Array(timelineA.length).fill(0);

  for (const other of preparedOthers) {
    const profile = getTrafficPairProfile(tileMap, route, other.route, options);
    const occupancy = other.occupancyWeight;

    for (let index = 0; index < timelineA.length; index += 1) {
      rangedByRegister[index] = Math.max(
        rangedByRegister[index],
        (profile.ranged[index] ?? 0) * occupancy
      );
      nearbyByRegister[index] += (profile.nearby[index] ?? 0) * occupancy;
      competitionByRegister[index] += (profile.competition[index] ?? 0) * occupancy;
    }
  }

  let ranged = 0;
  let nearby = 0;
  let competition = 0;

  for (let index = 0; index < timelineA.length; index += 1) {
    ranged += rangedByRegister[index];
    nearby += Math.min(nearbyByRegister[index], damageUnit * 3.25);
    competition += Math.min(competitionByRegister[index], damageUnit);
  }

  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2))
  };
}

function getExpectedTrafficBreakdown(
  tileMap,
  route,
  selectedRouteEntries,
  flags,
  options = {}
) {
  if (!route || !selectedRouteEntries?.length) {
    return { ranged: 0, nearby: 0, competition: 0, total: 0 };
  }

  if (options.singleLegTraffic) {
    return getExpectedTrafficBreakdownForLeg(
      tileMap,
      route,
      selectedRouteEntries,
      options
    );
  }

  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length) {
    return { ranged: 0, nearby: 0, competition: 0, total: 0 };
  }

  let ranged = 0;
  let nearby = 0;
  let competition = 0;

  routeLegs.forEach((routeLeg, legIndex) => {
    const otherLegEntries = selectedRouteEntries
      .map(getTrafficRouteEntry)
      .map((entry) => {
        const legs = getTrafficLegs(entry.route);
        return {
          route: legs[legIndex] ?? null,
          occupancyWeight: entry.occupancyWeight
        };
      })
      .filter((entry) => entry.route);

    const legBreakdown = getExpectedTrafficBreakdownForLeg(
      tileMap,
      routeLeg,
      otherLegEntries,
      options
    );

    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;

    ranged += legBreakdown.ranged * legWeight;
    nearby += legBreakdown.nearby * legWeight;
    competition += legBreakdown.competition * legWeight;
  });

  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2))
  };
}

function getFullRouteTrafficPenalty(tileMap, route, selectedRoutes, flags, options = {}) {
  return getExpectedTrafficBreakdown(
    tileMap,
    route,
    selectedRoutes,
    flags,
    options
  ).total;
}

function allocateCappedOccupancy(items, targetCount, weightForItem) {
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

function getExplicitOccupancyWeight(occupancyByIndex, index) {
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

function buildConditionalOccupancyMap(
  analyses,
  focusIndex,
  playerCount,
  options,
  routeForAnalysis
) {
  const others = analyses.filter((analysis) => analysis.index !== focusIndex);
  const targetCount = Math.min(
    Math.max(0, (playerCount ?? 1) - 1),
    others.length
  );

  if (!others.length) {
    return new Map();
  }

  if (options.occupancyByIndex) {
    return new Map(others.map((analysis) => [
      analysis.index,
      getExplicitOccupancyWeight(options.occupancyByIndex, analysis.index)
    ]));
  }

  if (targetCount <= 0) {
    return new Map();
  }

  // Pay to Win pricing is intended to make all retained starts equally
  // attractive, so traffic occupancy is uniform by design.
  if (options.payToWin) {
    const uniform = targetCount / others.length;
    return new Map(others.map((analysis) => [analysis.index, uniform]));
  }

  const scored = others.map((analysis) => ({
    analysis,
    score: routeForAnalysis(analysis)?.score ?? Infinity
  }));
  const finiteScores = scored
    .map((item) => item.score)
    .filter(Number.isFinite);

  if (!finiteScores.length) {
    const uniform = targetCount / others.length;
    return new Map(others.map((analysis) => [analysis.index, uniform]));
  }

  const minScore = Math.min(...finiteScores);
  const maxScore = Math.max(...finiteScores);
  const temperature = Math.max(6, (maxScore - minScore) / 3);

  return allocateCappedOccupancy(
    others,
    targetCount,
    (analysis) => {
      const score = routeForAnalysis(analysis)?.score;
      return Number.isFinite(score)
        ? Math.exp(-(score - minScore) / temperature)
        : 0.0001;
    }
  );
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

  const playerCount = Math.max(1, options.playerCount ?? reachable.length);
  const maxPasses = Math.max(1, Math.min(3, options.fullCourseTrafficPasses ?? 2));
  let routeSwitches = 0;
  let actualPasses = 0;
  let selectedByIndex = new Map(
    reachable.map((analysis) => [analysis.index, analysis.fullCourseRoutes[0]])
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    actualPasses = pass + 1;
    let changed = false;

    for (const analysis of reachable) {
      const occupancyByIndex = buildConditionalOccupancyMap(
        reachable,
        analysis.index,
        playerCount,
        options,
        (other) => selectedByIndex.get(other.index)
      );
      const otherRouteEntries = reachable
        .filter((other) => other.index !== analysis.index)
        .map((other) => ({
          route: selectedByIndex.get(other.index),
          occupancyWeight: occupancyByIndex.get(other.index) ?? 0
        }))
        .filter((entry) => entry.route && entry.occupancyWeight > 0);

      let bestRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoutes[0];
      let bestValue = Infinity;

      for (const candidate of analysis.fullCourseRoutes) {
        const traffic = getExpectedTrafficBreakdown(
          tileMap,
          candidate,
          otherRouteEntries,
          flags,
          {
            ...options,
            playerCount
          }
        );
        const rawGap = Math.max(
          0,
          candidate.score - analysis.fullCourseRoutes[0].score
        );
        const value = candidate.score + traffic.total + rawGap * 0.04;

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

  const trafficValues = [];
  const trafficBreakdowns = new Map();

  for (const analysis of reachable) {
    const route = selectedByIndex.get(analysis.index);
    const occupancyByIndex = buildConditionalOccupancyMap(
      reachable,
      analysis.index,
      playerCount,
      options,
      (other) => selectedByIndex.get(other.index)
    );
    const otherRouteEntries = reachable
      .filter((other) => other.index !== analysis.index)
      .map((other) => ({
        route: selectedByIndex.get(other.index),
        occupancyWeight: occupancyByIndex.get(other.index) ?? 0
      }))
      .filter((entry) => entry.route && entry.occupancyWeight > 0);

    const breakdown = getExpectedTrafficBreakdown(
      tileMap,
      route,
      otherRouteEntries,
      flags,
      {
        ...options,
        playerCount
      }
    );

    trafficBreakdowns.set(analysis.index, breakdown);
    trafficValues.push(breakdown.total);
  }

  return {
    starts: startAnalyses.map((analysis) => {
      const selectedRoute = selectedByIndex.get(analysis.index) ?? analysis.fullCourseRoute;
      if (!selectedRoute) {
        return analysis;
      }

      const breakdown = trafficBreakdowns.get(analysis.index) ?? {
        ranged: 0,
        nearby: 0,
        competition: 0,
        total: 0
      };

      return {
        ...analysis,
        fullCourseRoute: selectedRoute,
        fullCourseTrafficPenalty: breakdown.total,
        fullCourseTrafficRanged: breakdown.ranged,
        fullCourseTrafficNearby: breakdown.nearby,
        fullCourseTrafficCompetition: breakdown.competition,
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


const CONTEXTUAL_OPENING_ROUTES = 2;
const CONTEXTUAL_LATER_ROUTES = 3;
const CONTEXTUAL_BEAM_WIDTH = 2;
const CONTEXTUAL_COMPLETION_POOL = 4;
const CONTEXTUAL_OPENING_EXPANSIONS = 7000;
const CONTEXTUAL_LATER_EXPANSIONS = 6000;
const CONTEXTUAL_LEG_MAX_ACTIONS = 24;
const CONTEXTUAL_TEMPLATE_POOL = 6;
const CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT = 14;
const CONTEXTUAL_OPTIONAL_ROUTE_BUDGET_RATIO = 0.75;
const CONTEXTUAL_ZERO_ROUTE_STALL_MIN = 5;
const CONTEXTUAL_ZERO_ROUTE_STALL_STARTS_MIN = 3;

function getProgramHistoryWindow(history) {
  return (history || []).slice(-9);
}

function getProgramCacheSignature(history, absoluteActions) {
  const phase = absoluteActions % REGISTER_COUNT;
  const window = getProgramHistoryWindow(history);
  return `r${phase}:${window.join(".") || "-"}`;
}

function getCompactProgramSearchSignature(history, absoluteActions) {
  const phase = absoluteActions % REGISTER_COUNT;
  const window = getProgramHistoryWindow(history);
  const currentTurn = phase > 0 ? window.slice(-phase) : [];
  const count = (id) => currentTurn.filter((value) => value === id).length;
  const previous = window.at(-1) ?? "-";

  return [
    `r${phase}`,
    `p${previous}`,
    `f3${count("FORWARD_3")}`,
    `b${count("BACK")}`,
    `u${count("UTURN")}`,
    `w${count("WAIT")}`,
    `f2${Math.min(3, count("FORWARD_2"))}`
  ].join(":");
}

function getDynamicGoalCachePhase(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) {
    return "-";
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  if (periodLength > 0 && absoluteActions >= periodStart) {
    return `${periodStart}+${(absoluteActions - periodStart) % periodLength}`;
  }

  return String(
    Math.min(absoluteActions, Math.max(0, positions.length - 1))
  );
}

function getContextualLegCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared"
) {
  return [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    getProgramCacheSignature(context.history, context.absoluteActions),
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].join("|");
}

function getContextualTemplateCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared"
) {
  return [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].join("|");
}

function getContextualSearchStateKey(
  state,
  absoluteActions,
  history,
  dynamicGoal
) {
  return [
    stateKey(state),
    getCompactProgramSearchSignature(history, absoluteActions),
    `g${getDynamicGoalCachePhase(dynamicGoal, absoluteActions)}`
  ].join("|");
}

function routeReachesContextualGoal(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return (
    route.finalState.x === target.x &&
    route.finalState.y === target.y
  );
}

function createContextualQueueEntry(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return {
    ...route,
    estimate: route.baseCost + heuristic(route.finalState, target) * 5
  };
}

function enumerateContextualLegRoutes(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const profile = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    actionScoringMs: 0,
    historyBuildMs: 0,
    destinationBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    completedGoals: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0
  };
  const profileNow = analysisTelemetryNow;

  const dynamicGoal = options.dynamicGoal ?? null;
  const maxOutputRoutes = options.maxRoutes ?? CONTEXTUAL_LATER_ROUTES;
  const completionPool = Math.max(
    maxOutputRoutes,
    options.completionPool ?? CONTEXTUAL_COMPLETION_POOL
  );
  const maxExpansions = options.maxExpansions ?? CONTEXTUAL_LATER_EXPANSIONS;
  const optionalRouteExpansionLimit = Math.max(
    1,
    Math.floor(
      maxExpansions *
      (options.optionalRouteBudgetRatio ?? CONTEXTUAL_OPTIONAL_ROUTE_BUDGET_RATIO)
    )
  );
  const maxActions = options.maxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = { ...options, portalMap };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(
    simulationOptions
  );
  const queue = new MinHeap((entry) => entry.estimate);
  const bestCostByState = new Map();
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];

  for (const facing of initialFacings) {
    const initialState = {
      x: context.state.x,
      y: context.state.y,
      facing
    };
    const initialHistory = getProgramHistoryWindow(context.history);
    const root = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      localActions: 0,
      absoluteActions: context.absoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      baseCost: 0,
      cardAvailabilityPenalty: 0,
      actionHistory: initialHistory,
      localActionIds: []
    };

    let blockStartedAt = profileNow();
    const key = getContextualSearchStateKey(
      initialState,
      context.absoluteActions,
      initialHistory,
      dynamicGoal
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    bestCostByState.set(key, 0);
    queue.push(createContextualQueueEntry(root, goal, dynamicGoal));
    profile.queueMs += profileNow() - blockStartedAt;
  }

  const completed = [];
  let expansions = 0;

  while (
    queue.size &&
    completed.length < completionPool &&
    expansions < maxExpansions
  ) {
    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const currentKey = getContextualSearchStateKey(
      current.finalState,
      current.absoluteActions,
      current.actionHistory,
      dynamicGoal
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = bestCostByState.get(currentKey);
    if (
      knownBest !== undefined &&
      current.baseCost > knownBest + 0.001
    ) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    if (
      completed.length >= 1 &&
      maxOutputRoutes > 1 &&
      expansions >= optionalRouteExpansionLimit
    ) {
      break;
    }

    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(
      current,
      goal,
      dynamicGoal
    );
    if (reachesGoal) {
      profile.completedGoals += 1;
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = (
        getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
        goal
      );
      const route = {
        path,
        transitions,
        finalState: current.finalState,
        initialState: current.initialState,
        startFacing: current.startFacing,
        hitTarget,
        movingTarget: dynamicGoal
          ? {
            checkpointId: dynamicGoal.id ?? null,
            position: hitTarget,
            space: getDynamicGoalSpace(dynamicGoal, hitTarget),
            actions: current.absoluteActions,
            positions: dynamicGoal.positions ?? [],
            displayPositions:
              dynamicGoal.displayPositions ??
              dynamicGoal.positions ??
              []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity(
          { transitions },
          hitTarget
        ),
        rebootCount: transitions.filter(
          (transition) => transition.rebooted
        ).length,
        score: Number(current.baseCost.toFixed(2)),
        cardAvailabilityPenalty: Number(
          (current.cardAvailabilityPenalty || 0).toFixed(2)
        ),
        goalReached: true,
        fullCourseLeg: true,
        localActionIds: current.localActionIds,
        programHistoryEnd: getProgramHistoryWindow(
          current.actionHistory
        )
      };

      if (
        (
          options.recoveryRule === "dynamic_archiving" ||
          !options.recoveryRule
        ) &&
        routeTouchesPit(tileMap, route)
      ) {
        profile.goalCompletionMs += profileNow() - blockStartedAt;
        continue;
      }

      completed.push(route);
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.goalCompletionMs += profileNow() - blockStartedAt;

    expansions += 1;
    if (current.localActions >= maxActions) {
      continue;
    }

    const currentTarget = (
      getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
      goal
    );

    for (const action of ACTIONS) {
      profile.actionCandidates += 1;

      blockStartedAt = profileNow();
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT
        },
        physicalOptionSignature
      );
      const transition = physicalResult.transition;
      profile.simulationCalls += 1;
      if (physicalResult.hit) {
        profile.physicalCacheHits += 1;
      } else {
        profile.physicalCacheMisses += 1;
      }
      profile.simulationMs += profileNow() - blockStartedAt;

      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getActionPenalty(action, options);
      const reversePenalty = action.id === "BACK" ? 1.4 : 0;
      const heavyMovePenalty = action.id === "FORWARD_2"
        ? 0.25
        : action.id === "FORWARD_3"
          ? 0.75
          : 0;
      const scarceReusePenalty = getCardAvailabilityPressure(
        current.actionHistory,
        action.id,
        {
          ...options,
          absoluteActionCount: current.absoluteActions
        }
      );
      const conveyorComplexity = scoreTransitionConveyorComplexity(
        transition,
        currentTarget
      );
      profile.actionScoringMs += profileNow() - blockStartedAt;

      blockStartedAt = profileNow();
      const nextHistory = getProgramHistoryWindow([
        ...current.actionHistory,
        action.id
      ]);
      const nextLocalActionIds = [
        ...current.localActionIds,
        action.id
      ];
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];
      profile.historyBuildMs += profileNow() - blockStartedAt;

      for (const destination of destinations) {
        profile.destinationCandidates += 1;

        blockStartedAt = profileNow();
        const nextAbsoluteActions = current.absoluteActions + 1;
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(nextAbsoluteActions)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = transition.rebootChoices?.length
          ? { ...transition, to: destination }
          : transition;
        const nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          localActions: current.localActions + 1,
          absoluteActions: nextAbsoluteActions,
          distance: current.distance + transition.distance,
          forcedDistance:
            current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty:
            current.rebootPenalty + transitionRebootPenalty,
          baseCost:
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            weightedDistance(
              transition.distance,
              transition.forcedDistance
            ) +
            actionPenalty +
            reversePenalty +
            heavyMovePenalty +
            scarceReusePenalty +
            conveyorComplexity,
          cardAvailabilityPenalty:
            (current.cardAvailabilityPenalty || 0) +
            scarceReusePenalty,
          actionHistory: nextHistory,
          localActionIds: nextLocalActionIds
        };
        profile.destinationBuildMs += profileNow() - blockStartedAt;

        blockStartedAt = profileNow();
        const nextKey = getContextualSearchStateKey(
          destination,
          nextAbsoluteActions,
          nextHistory,
          dynamicGoal
        );
        profile.nextKeyMs += profileNow() - blockStartedAt;

        blockStartedAt = profileNow();
        const priorBest = bestCostByState.get(nextKey);
        if (
          priorBest !== undefined &&
          nextRoute.baseCost >= priorBest - 0.001
        ) {
          profile.dominatedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;
          continue;
        }

        bestCostByState.set(nextKey, nextRoute.baseCost);
        profile.acceptedStates += 1;
        profile.dominanceMs += profileNow() - blockStartedAt;

        blockStartedAt = profileNow();
        queue.push(
          createContextualQueueEntry(nextRoute, goal, dynamicGoal)
        );
        profile.queueMs += profileNow() - blockStartedAt;
      }
    }
  }

  const deduped = dedupeRoutes(completed).sort(
    (left, right) => left.score - right.score
  );
  const selectedRoutes = selectDistinctRoutes(
    deduped,
    goal,
    maxOutputRoutes
  );

  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "actionScoringMs",
    "historyBuildMs",
    "destinationBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number(profile[key].toFixed(2));
  });

  selectedRoutes.contextualSearchMeta = {
    expansions,
    maxExpansions,
    optionalRouteExpansionLimit,
    hitExpansionCap: expansions >= maxExpansions,
    stoppedAfterUsefulRoute: (
      selectedRoutes.length >= 1 &&
      expansions >= optionalRouteExpansionLimit &&
      expansions < maxExpansions
    ),
    zeroRouteCapFailure: (
      selectedRoutes.length === 0 &&
      expansions >= maxExpansions
    )
  };

  recordRouteSearchTelemetry("contextual-leg", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: selectedRoutes.length,
    start: {
      x: context.state.x,
      y: context.state.y,
      facing: context.state.facing ?? null
    },
    goal: { x: goal.x, y: goal.y },
    contextualProfile: profile
  });
  return selectedRoutes;
}

function scoreContextualCardSequence(
  history,
  absoluteActions,
  actionIds,
  options = {}
) {
  let workingHistory = getProgramHistoryWindow(history);
  let workingAbsoluteActions = absoluteActions;
  let penalty = 0;

  for (const actionId of actionIds || []) {
    penalty += getCardAvailabilityPressure(
      workingHistory,
      actionId,
      {
        ...options,
        absoluteActionCount: workingAbsoluteActions
      }
    );
    workingHistory = getProgramHistoryWindow([
      ...workingHistory,
      actionId
    ]);
    workingAbsoluteActions += 1;
  }

  return {
    penalty: Number(penalty.toFixed(2)),
    history: workingHistory,
    absoluteActions: workingAbsoluteActions
  };
}

function rebaseContextualCachedRoute(
  route,
  context,
  options = {}
) {
  const cardState = scoreContextualCardSequence(
    context.history,
    context.absoluteActions,
    route.localActionIds,
    options
  );
  const oldCardPenalty = route.cardAvailabilityPenalty || 0;
  const score = Number((
    route.score -
    oldCardPenalty +
    cardState.penalty
  ).toFixed(2));
  const movingTarget = route.movingTarget
    ? {
      ...route.movingTarget,
      actions: cardState.absoluteActions
    }
    : null;

  return {
    ...route,
    absoluteStartAction: context.absoluteActions,
    absoluteActions: cardState.absoluteActions,
    movingTarget,
    score,
    cardAvailabilityPenalty: cardState.penalty,
    programHistoryEnd: cardState.history
  };
}

function getContextAfterLeg(route) {
  return {
    state: cloneState(route.finalState),
    absoluteActions: route.absoluteActions,
    history: getProgramHistoryWindow(route.programHistoryEnd)
  };
}

function getPartialBeamCurrentLeg(partial) {
  return partial.legs.at(-1) ?? null;
}

function selectContextualPartialBeam(
  partials,
  goal,
  width = CONTEXTUAL_BEAM_WIDTH
) {
  if (partials.length <= width) {
    return [...partials].sort(
      (left, right) => left.score - right.score
    );
  }

  const sorted = [...partials].sort(
    (left, right) => left.score - right.score
  );
  const best = sorted[0];
  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.filter(
    (partial) => partial.score <= best.score + scoreAllowance
  );

  if (width === 1 || eligible.length === 1) {
    return [best];
  }

  let diverse = null;
  let diverseNovelty = -1;

  for (const candidate of eligible.slice(1)) {
    const candidateLeg = getPartialBeamCurrentLeg(candidate);
    const bestLeg = getPartialBeamCurrentLeg(best);
    if (!candidateLeg || !bestLeg) {
      continue;
    }

    const novelty = 1 - routeSimilarity(
      candidateLeg,
      bestLeg,
      goal
    );
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
    ? [best, diverse].sort(
      (left, right) => left.score - right.score
    )
    : [best];
}

function stitchContextualLegs(legs, flags) {
  if (!legs?.length) {
    return null;
  }

  const transitions = legs.flatMap(
    (leg) => leg.transitions || []
  );
  const initialState = legs[0].initialState;
  const finalState = legs.at(-1).finalState;
  const path = buildTimeline(transitions, initialState);
  let cumulativeActions = 0;
  let cumulativeDistance = 0;
  let cumulativeForcedDistance = 0;
  let cumulativeHazard = 0;
  let cumulativeRebootPenalty = 0;
  let cumulativeBaseCost = 0;
  const checkpointHits = [];

  legs.forEach((leg, legIndex) => {
    cumulativeActions += leg.actions ?? 0;
    cumulativeDistance += leg.distance ?? 0;
    cumulativeForcedDistance += leg.forcedDistance ?? 0;
    cumulativeHazard += leg.hazard ?? 0;
    cumulativeRebootPenalty += leg.rebootPenalty ?? 0;
    cumulativeBaseCost += leg.score ?? 0;
    const flag = flags[legIndex];

    checkpointHits.push({
      checkpointIndex: legIndex,
      checkpointId: flag?.id ?? legIndex + 1,
      action: cumulativeActions,
      state: cloneState(leg.finalState),
      position: leg.hitTarget ?? flag,
      movingTarget: leg.movingTarget ?? null,
      distance: cumulativeDistance,
      forcedDistance: cumulativeForcedDistance,
      hazard: cumulativeHazard,
      rebootPenalty: cumulativeRebootPenalty,
      baseCost: cumulativeBaseCost
    });
  });

  return {
    path,
    transitions,
    finalState,
    initialState,
    startFacing: legs[0].startFacing,
    checkpointHits,
    actionHistory: legs.flatMap(
      (leg) => leg.localActionIds || []
    ),
    actions: cumulativeActions,
    distance: Number(cumulativeDistance.toFixed(2)),
    forcedDistance: Number(
      cumulativeForcedDistance.toFixed(2)
    ),
    hazard: Number(cumulativeHazard.toFixed(2)),
    rebootPenalty: Number(cumulativeRebootPenalty.toFixed(2)),
    conveyorComplexity: Number(
      legs.reduce(
        (sum, leg) => sum + (leg.conveyorComplexity || 0),
        0
      ).toFixed(2)
    ),
    rebootCount: legs.reduce(
      (sum, leg) => sum + (leg.rebootCount || 0),
      0
    ),
    score: Number(cumulativeBaseCost.toFixed(2)),
    goalReached: true,
    fullCourse: true,
    legRoutes: legs
  };
}

function analyzeFullCourseContextual(
  tileMap,
  starts,
  flags,
  options = {}
) {
  const playerCount = options.playerCount ?? starts.length;
  const dynamicGoals = options.dynamicGoals ?? [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const legCache = new Map();
  const templateCache = new Map();
  let cacheHits = 0;
  let templateHits = 0;
  let cacheMisses = 0;
  let templateFallbacks = 0;
  let zeroRouteCapFailures = 0;
  const zeroRouteFailureStarts = new Set();
  const earlyExitEnabled = Boolean(options.contextualEarlyExit);
  const requestConstrained = (
    (options.difficulty && options.difficulty !== "any") ||
    (options.length && options.length !== "any")
  );
  const priorRoutingStalls = Math.max(
    0,
    Number(options.contextualPriorRoutingStalls ?? 0)
  );
  const stallEscalation = Math.min(2, Math.floor(priorRoutingStalls));
  const zeroRouteFailureLimit = Math.max(
    CONTEXTUAL_ZERO_ROUTE_STALL_STARTS_MIN,
    CONTEXTUAL_ZERO_ROUTE_STALL_MIN +
      Math.max(0, flags.length - 3) +
      (requestConstrained ? 2 : 0) -
      stallEscalation
  );

  const baseRouteOptions = {
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
    boardRects: options.boardRects,
    portalMap
  };

  const getLegRoutes = (
    context,
    legIndex,
    start,
    startIndex,
    startupSpinUp = false
  ) => {
    const dynamicGoal = dynamicGoals[legIndex] ?? null;
    const namespace = options.recoveryRule === "home_reboot"
      ? `start${startIndex}`
      : "shared";
    const cacheKey = getContextualLegCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace
    );
    const templateKey = getContextualTemplateCacheKey(
      context,
      legIndex,
      dynamicGoal,
      namespace
    );

    if (legCache.has(cacheKey)) {
      cacheHits += 1;
      return legCache.get(cacheKey).map((route) => (
        rebaseContextualCachedRoute(
          route,
          context,
          baseRouteOptions
        )
      ));
    }

    const opening = legIndex === 0;
    const targetRouteCount = opening
      ? CONTEXTUAL_OPENING_ROUTES
      : CONTEXTUAL_LATER_ROUTES;
    const cachedTemplates = templateCache.get(templateKey) ?? [];

    if (cachedTemplates.length) {
      const rebasedTemplates = cachedTemplates
        .map((route) => {
          const rebased = rebaseContextualCachedRoute(
            route,
            context,
            baseRouteOptions
          );
          return {
            route: rebased,
            cardDelta: Math.abs(
              (rebased.cardAvailabilityPenalty || 0) -
              (route.cardAvailabilityPenalty || 0)
            )
          };
        })
        .sort((left, right) => left.route.score - right.route.score);
      const acceptable = rebasedTemplates
        .filter((entry) => (
          entry.cardDelta <= CONTEXTUAL_TEMPLATE_CARD_DELTA_LIMIT
        ))
        .map((entry) => entry.route);
      const distinct = selectDistinctRoutes(
        acceptable,
        flags[legIndex],
        targetRouteCount
      );

      if (distinct.length >= Math.min(2, targetRouteCount)) {
        templateHits += 1;
        legCache.set(cacheKey, distinct);
        return distinct;
      }

      templateFallbacks += 1;
    }

    cacheMisses += 1;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(start, options.rebootTokens)
      : options.rebootTokens;
    const routes = enumerateContextualLegRoutes(
      tileMap,
      context,
      flags[legIndex],
      {
        ...baseRouteOptions,
        rebootTokens,
        dynamicGoal,
        startupSpinUp: opening && startupSpinUp,
        maxRoutes: targetRouteCount,
        completionPool: opening
          ? 4
          : CONTEXTUAL_COMPLETION_POOL,
        maxExpansions: opening
          ? (
            options.contextualOpeningExpansions ??
            CONTEXTUAL_OPENING_EXPANSIONS
          )
          : (
            options.contextualLaterExpansions ??
            CONTEXTUAL_LATER_EXPANSIONS
          ),
        maxActions:
          options.contextualLegMaxActions ??
          CONTEXTUAL_LEG_MAX_ACTIONS
      }
    );

    const searchMeta = routes.contextualSearchMeta ?? null;
    if (searchMeta?.zeroRouteCapFailure) {
      zeroRouteCapFailures += 1;
      zeroRouteFailureStarts.add(startIndex);

      if (
        earlyExitEnabled &&
        zeroRouteCapFailures >= zeroRouteFailureLimit &&
        zeroRouteFailureStarts.size >= CONTEXTUAL_ZERO_ROUTE_STALL_STARTS_MIN
      ) {
        const error = new Error(
          `Contextual routing stalled after ${zeroRouteCapFailures} cap-exhausted zero-route contexts across ${zeroRouteFailureStarts.size} starts`
        );
        error.code = "CONTEXTUAL_SEARCH_STALLED";
        error.contextualSearchHealth = {
          zeroRouteCapFailures,
          distinctStarts: zeroRouteFailureStarts.size,
          failureLimit: zeroRouteFailureLimit,
          flagCount: flags.length,
          constrained: requestConstrained,
          priorRoutingStalls,
          stallEscalation
        };
        throw error;
      }
    }

    legCache.set(cacheKey, routes);

    const mergedTemplates = dedupeRoutes([
      ...cachedTemplates,
      ...routes
    ])
      .sort((left, right) => left.score - right.score)
      .slice(0, CONTEXTUAL_TEMPLATE_POOL);
    templateCache.set(templateKey, mergedTemplates);

    return routes;
  };

  const startPartials = starts.map((start, index) => {
    const sourceIndex = Number.isInteger(start.analysisIndex)
      ? start.analysisIndex
      : index;
    const context = {
      state: {
        x: start.x,
        y: start.y,
        facing: start.facing ?? "E"
      },
      absoluteActions: 0,
      history: []
    };
    const openingRoutes = getLegRoutes(
      context,
      0,
      start,
      sourceIndex,
      Boolean(options.startupSpinUp)
    );
    const partials = openingRoutes.map((route) => ({
      legs: [route],
      context: getContextAfterLeg(route),
      score: route.score
    }));

    return {
      index: sourceIndex,
      start,
      partials: selectContextualPartialBeam(
        partials,
        flags[0],
        CONTEXTUAL_BEAM_WIDTH
      )
    };
  });

  for (let legIndex = 1; legIndex < flags.length; legIndex += 1) {
    for (const entry of startPartials) {
      if (!entry.partials.length) {
        continue;
      }

      const extensions = [];
      for (const partial of entry.partials) {
        const legRoutes = getLegRoutes(
          partial.context,
          legIndex,
          entry.start,
          entry.index,
          false
        );

        for (const route of legRoutes) {
          extensions.push({
            legs: [...partial.legs, route],
            context: getContextAfterLeg(route),
            score: partial.score + route.score
          });
        }
      }

      entry.partials = selectContextualPartialBeam(
        extensions,
        flags[legIndex],
        CONTEXTUAL_BEAM_WIDTH
      );
    }
  }

  const startAnalyses = startPartials.map((entry) => {
    const fullCourseRoutes = entry.partials
      .map((partial) => (
        stitchContextualLegs(partial.legs, flags)
      ))
      .filter(Boolean)
      .sort((left, right) => left.score - right.score);
    const fullCourseRoute = fullCourseRoutes[0] ?? null;

    return buildStartAnalysisForSelectedFullRoute({
      index: entry.index,
      start: entry.start,
      reachable: Boolean(fullCourseRoute),
      fullCourseRoutes,
      fullCourseRoute,
      fullCourseRouteIndex: fullCourseRoute ? 0 : null,
      fullCourseTrafficPenalty: 0
    }, flags);
  });

  const selection = selectFullCourseRoutesForStarts(
    tileMap,
    startAnalyses,
    flags,
    {
      ...options,
      playerCount
    }
  );
  const selectedStartAnalyses = selection.starts.map(
    (analysis) => (
      buildStartAnalysisForSelectedFullRoute(
        analysis,
        flags
      )
    )
  );
  const fullScores = selectedStartAnalyses
    .filter(
      (item) => item.reachable && item.fullCourseRoute
    )
    .map(
      (item) => (
        item.fullCourseRoute.score +
        (item.fullCourseTrafficPenalty ?? 0)
      )
    );
  const meanFullScore = average(fullScores);
  const adjustedStartAnalyses = selectedStartAnalyses.map(
    (analysis) => {
      if (!analysis.fullCourseRoute) {
        return analysis;
      }

      const fullScore = (
        analysis.fullCourseRoute.score +
        (analysis.fullCourseTrafficPenalty ?? 0)
      );
      const rawDelta = fullScore - meanFullScore;
      return {
        ...analysis,
        courseEstimate: {
          ...analysis.courseEstimate,
          meanFullScore: Number(meanFullScore.toFixed(2)),
          delta: Number(rawDelta.toFixed(2))
        },
        courseScoreAdjustment: Number(
          clamp(rawDelta * 0.32, -10, 10).toFixed(2)
        )
      };
    }
  );

  selectAndScoreStartAnalyses(
    tileMap,
    adjustedStartAnalyses,
    flags[0],
    playerCount,
    null,
    options
  );
  const expectedLegAnalyses = buildExpectedLegAnalysesFromFullRoutes(
    adjustedStartAnalyses,
    flags,
    playerCount
  );
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
      courseContinuationMean: Number(
        meanFullScore.toFixed(2)
      ),
      courseContinuationWeighted: true,
      fullCourseRoutes: true,
      contextualLegRoutes: true,
      contextualLegCache: {
        entries: legCache.size,
        templateEntries: templateCache.size,
        hits: cacheHits + templateHits,
        exactHits: cacheHits,
        templateHits,
        misses: cacheMisses,
        templateFallbacks,
        zeroRouteCapFailures,
        zeroRouteFailureStarts: zeroRouteFailureStarts.size,
        zeroRouteFailureLimit,
        priorRoutingStalls,
        stallEscalation
      },
      fullCourseTraffic: {
        passes: selection.selectionPasses,
        routeSwitches: selection.routeSwitches,
        averagePenalty: selection.averageTrafficPenalty,
        legAwareOverlap: true,
        contextualLegRoutes: true,
        openingRoutesPerStart: CONTEXTUAL_OPENING_ROUTES,
        laterRoutesPerContext: CONTEXTUAL_LATER_ROUTES,
        stitchedBeamWidth: CONTEXTUAL_BEAM_WIDTH,
        openingLegWeight:
          FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
        laterLegWeight:
          FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT
      }
    }
  };
}

export function analyzeFullCourse(tileMap, starts, flags, options = {}) {
  if (options.contextualLegSearch) {
    return analyzeFullCourseContextual(
      tileMap,
      starts,
      flags,
      options
    );
  }
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
    const diverseSearch = Boolean(options.diverseFullCourseSearch);
    const completionPool = diverseSearch
      ? Math.min(5, maxRoutes + 2)
      : maxRoutes;
    const rawRoutes = dedupeRoutes(enumerateFullCourseRoutes(tileMap, start, flags, {
      ...routeOptions,
      rebootTokens,
      maxRoutes: completionPool,
      maxStateLabels: diverseSearch ? 2 : 1,
      diverseStateLabelsAfterFirstCheckpoint: diverseSearch,
      startupSpinUp: options.startupSpinUp,
      repairStations: options.repairStations
    })).sort((left, right) => left.score - right.score);
    const preparedRoutes = rawRoutes
      .map((route) => prepareFullCourseCandidate(route, flags, options))
      .filter(Boolean);
    return diverseSearch
      ? selectCorridorDiverseFullCourseRoutes(preparedRoutes, flags, maxRoutes)
      : selectDistinctRoutes(preparedRoutes, flags.at(-1), maxRoutes);
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

export function evaluateFullCourseFocusUnderOccupancy(
  tileMap,
  firstLeg,
  flags,
  focusIndex,
  occupancyByIndex,
  options = {}
) {
  const analyses = (firstLeg?.starts || []).filter((analysis) => (
    analysis.reachable &&
    analysis.fullCourseRoutes?.length
  ));
  const focus = analyses.find((analysis) => analysis.index === focusIndex);
  if (!focus) {
    return null;
  }

  const selectedOtherRoutes = analyses
    .filter((analysis) => analysis.index !== focusIndex)
    .map((analysis) => ({
      route: analysis.fullCourseRoute ?? analysis.fullCourseRoutes[0],
      occupancyWeight: getExplicitOccupancyWeight(
        occupancyByIndex,
        analysis.index
      )
    }))
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  let bestRoute = focus.fullCourseRoute ?? focus.fullCourseRoutes[0];
  let bestTraffic = null;
  let bestValue = Infinity;

  for (const candidate of focus.fullCourseRoutes) {
    const traffic = getExpectedTrafficBreakdown(
      tileMap,
      candidate,
      selectedOtherRoutes,
      flags,
      {
        ...options,
        occupancyByIndex
      }
    );
    const rawGap = Math.max(
      0,
      candidate.score - focus.fullCourseRoutes[0].score
    );
    const value = candidate.score + traffic.total + rawGap * 0.04;
    if (value < bestValue - 0.001) {
      bestValue = value;
      bestRoute = candidate;
      bestTraffic = traffic;
    }
  }

  if (!bestTraffic) {
    bestTraffic = {
      ranged: 0,
      nearby: 0,
      competition: 0,
      total: 0
    };
  }

  const firstLegRoute = bestRoute?.legRoutes?.[0] ?? null;
  const otherFirstLegRoutes = analyses
    .filter((analysis) => analysis.index !== focusIndex)
    .map((analysis) => {
      const route = (
        analysis.fullCourseRoute ??
        analysis.fullCourseRoutes[0]
      )?.legRoutes?.[0];
      return {
        route,
        occupancyWeight: getExplicitOccupancyWeight(
          occupancyByIndex,
          analysis.index
        )
      };
    })
    .filter((entry) => entry.route && entry.occupancyWeight > 0);
  const firstTraffic = firstLegRoute
    ? getExpectedTrafficBreakdown(
      tileMap,
      firstLegRoute,
      otherFirstLegRoutes,
      [flags[0]],
      {
        ...options,
        occupancyByIndex,
        singleLegTraffic: true
      }
    )
    : { ranged: 0, nearby: 0, competition: 0, total: 0 };

  return {
    index: focusIndex,
    fullCourseRouteIndex: focus.fullCourseRoutes.indexOf(bestRoute),
    fullCourseRoute: bestRoute,
    fullCourseIntrinsic: bestRoute?.score ?? Infinity,
    fullCourseTraffic: bestTraffic.total,
    fullCourseTrafficBreakdown: bestTraffic,
    fullTotal: (bestRoute?.score ?? Infinity) + bestTraffic.total,
    firstLegIntrinsic: firstLegRoute?.score ?? Infinity,
    firstLegTraffic: firstTraffic.total,
    firstLegTrafficBreakdown: firstTraffic,
    firstLegTotal: (firstLegRoute?.score ?? Infinity) + firstTraffic.total
  };
}

const OCCUPANCY_SCENARIO_CACHE = new WeakMap();

export function evaluateFullCourseSubsetTraffic(
  tileMap,
  firstLeg,
  flags,
  includedIndices,
  options = {}
) {
  if (!firstLeg || !Array.isArray(flags) || !flags.length) {
    return { entries: [], routeSwitches: 0, averageTrafficPenalty: 0 };
  }

  const included = [...new Set(includedIndices || [])].sort((a, b) => a - b);
  const playerCount = Math.max(1, options.playerCount ?? included.length);
  let firstLegCache = OCCUPANCY_SCENARIO_CACHE.get(firstLeg);
  if (!firstLegCache) {
    firstLegCache = new Map();
    OCCUPANCY_SCENARIO_CACHE.set(firstLeg, firstLegCache);
  }
  const cacheKey = `${playerCount}|${included.join(",")}`;
  if (firstLegCache.has(cacheKey)) {
    return firstLegCache.get(cacheKey);
  }

  const includedSet = new Set(included);
  const subset = (firstLeg.starts || [])
    .filter((analysis) => (
      includedSet.has(analysis.index) &&
      analysis.reachable &&
      analysis.fullCourseRoutes?.length
    ))
    .map((analysis) => ({ ...analysis }));

  if (!subset.length) {
    const empty = { entries: [], routeSwitches: 0, averageTrafficPenalty: 0 };
    firstLegCache.set(cacheKey, empty);
    return empty;
  }

  const selection = selectFullCourseRoutesForStarts(
    tileMap,
    subset,
    flags,
    {
      ...options,
      playerCount,
      payToWin: false,
      fullCourseTrafficPasses:
        options.fullCourseTrafficPasses ?? 2
    }
  );
  let selected = selection.starts.map((analysis) => (
    buildStartAnalysisForSelectedFullRoute(analysis, flags)
  ));

  const fullTotals = selected
    .filter((analysis) => analysis.fullCourseRoute)
    .map((analysis) => (
      analysis.fullCourseRoute.score +
      (analysis.fullCourseTrafficPenalty ?? 0)
    ));
  const meanFull = average(fullTotals);

  selected = selected.map((analysis) => {
    if (!analysis.fullCourseRoute) {
      return analysis;
    }
    const fullTotal = (
      analysis.fullCourseRoute.score +
      (analysis.fullCourseTrafficPenalty ?? 0)
    );
    return {
      ...analysis,
      courseScoreAdjustment: Number(
        clamp((fullTotal - meanFull) * 0.32, -10, 10).toFixed(2)
      )
    };
  });

  const activeIndices = new Set(selected.map((analysis) => analysis.index));
  selectAndScoreStartAnalyses(
    tileMap,
    selected,
    flags[0],
    playerCount,
    activeIndices,
    {
      ...options,
      playerCount,
      payToWin: false
    }
  );

  const result = {
    entries: selected.map((analysis) => ({
      index: analysis.index,
      adjustedScore: analysis.adjustedScore,
      bestActions: analysis.bestActions,
      bestScore: analysis.bestScore,
      trafficPenalty: analysis.trafficPenalty,
      fullCourseTrafficPenalty: analysis.fullCourseTrafficPenalty ?? 0,
      fullCourseRouteIndex: analysis.fullCourseRouteIndex ?? 0
    })),
    routeSwitches: selection.routeSwitches,
    averageTrafficPenalty: selection.averageTrafficPenalty
  };
  firstLegCache.set(cacheKey, result);
  return result;
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
