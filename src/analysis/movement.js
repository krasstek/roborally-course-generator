// Robo Rally Course Randomizer - movement simulation: tile penalties, programmed moves, conveyors, pushers, crushers, recovery pressure and simulateAction
import {
  getDamageDeckPressureMultipliers,
  getTilePenaltyForFeature
} from "../../feature-weights.js";
import {
  REGISTER_START_FEATURE_RANDOMIZER,
  REGISTER_START_FEATURE_TRAPDOOR,
  cloneState,
  getBelt,
  getFeatureDutyCycle,
  getGear,
  getLedgeSides,
  getPortal,
  getPushes,
  getRegisterStartFeatureMask,
  getRepulsor,
  getTeleporter,
  hasActiveFeature,
  hasExplicitTiming,
  hasKnownRegisterTiming,
  hasRampForDir,
  isBoundaryBlockedByWalls,
  isCurrent,
  isFeatureActiveThisRegister,
  isOil,
  isPit,
  isWater,
  tileKey
} from "./board-geometry.js";
import {
  AUTO_KILL_PRESSURE_SETBACK_WEIGHT,
  AUTO_KILL_SETBACK_TEMPO_PER_STEP,
  DIRS,
  EDGE_BEHAVIOR,
  OPPOSITE,
  REGISTER_COUNT,
  ROTATION_ORDER
} from "./constants.js";
import {
  getRebootDamagePenalty,
  getRebootRoutePenalty,
  getRebootTransitionCore,
  resolveRebootRecovery,
  resolveRebootRecoveryPoint
} from "./reboot-recovery.js";
import {
  getActionPenalty,
  isBatteryActive,
  isRouteAwareBatteryScoringActive
} from "./rule-options.js";
import { analysisTelemetryNow } from "./telemetry.js";

// v48zb cheap Dynamic-Archiving surrogate. Exact realization still carries the
// true per-route archive marker. Physical estimate search instead anchors each
// leg at its guaranteed archive (dock / previous checkpoint) and may treat an
// archive landing that lies on a near-direct geometric path as the latest
// plausible recovery point. This keeps cheap hazard ordering recovery-aware
// without making every archive coordinate a separate hot-path search identity.
export const DYNAMIC_ARCHIVE_CHEAP_PROXY_POINT_CACHE = new WeakMap();
export const DYNAMIC_ARCHIVE_CHEAP_PROXY_RESULT_CACHE = new WeakMap();
export const DYNAMIC_ARCHIVE_CHEAP_PROXY_CACHE_LIMIT = 50000;

// Recovery-aware pit/edge exposure is derived once when a physical template is
// cached. Ordinary cache hits can then bypass all recovery/proxy work entirely.
export const CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE = new WeakMap();

export const DYNAMIC_ARCHIVE_CACHE_TELEMETRY = {
  requests: 0,
  hits: 0,
  misses: 0,
  archivePoints: new Set(),
  cheapProxyRequests: 0,
  cheapProxyOrigins: new Set(),
  cheapProxyPoints: new Set(),
  exactReplayChecks: 0,
  exactReplayActions: 0,
  exactReplayMismatches: 0,
  exactReplayMs: 0,
  // v48zz diagnostic: count how the existing state-relative DA route utility is
  // actually used before changing its weight or policy. These are route-score
  // evaluations, not unique physical routes.
  utilityCalls: 0,
  utilityArchiveLandings: 0,
  utilitySameArchiveSuppressed: 0,
  utilityImprovedLandings: 0,
  utilityNonImprovingLandings: 0,
  utilityRoutesWithReward: 0,
  utilityRewardTotal: 0,
  utilityMaxRouteReward: 0
};

export function getRouteAwareActionPenalty(action, options = {}) {
  const actionPenalty = getActionPenalty(action, options);
  if (action?.id !== "WAIT" || !isRouteAwareBatteryScoringActive(options)) {
    return actionPenalty;
  }

  // v49bd: WAIT, like every other programmed card, owns exactly one register.
  // Energy value remains a separate route-economy term; physical timing benefits
  // of waiting remain in the simulated transition itself.
  return actionPenalty;
}

export function getTilePenalty(
  tile,
  options = {},
  randomizerAtRegisterStart = options.randomizerAtRegisterStart
) {
  let penalty = 0;

  // Feature penalties are used to approximate local danger/value for route
  // scoring. This intentionally captures many board effects without turning the
  // analyzer into a full combat or timing simulator.
  for (const feature of tile?.features || []) {
    // v42 removes the old static Battery reward from per-tile movement scoring.
    // The route-aware reward is applied once, at the post-register landing
    // boundary, so traversing a Battery does not collect energy.
    if (
      (feature.type === "battery" || feature.type === "chopShop") &&
      isRouteAwareBatteryScoringActive(options)
    ) {
      continue;
    }
    // v49be ownership cleanup: gears are exact physical state transitions.
    // Their facing change is simulated by the board phase, and the planning
    // burden is counted by post-build mental RE. Do not also price the gear as
    // a generic tile hazard merely for existing.
    if (feature.type === "gear") {
      continue;
    }
    // v49ei: Homing Missile is an offensive opportunity for the entering robot.
    // Its own-player cost is planning/target-choice burden, modeled in completed
    // route mental RE below; do not also price the tile as a self-hazard.
    if (feature.type === "homingMissile") {
      continue;
    }

    // Randomizers affect the card played only when the robot STARTS a register
    // on the space. Traversing or merely ending the current movement on one
    // does not alter the current register.
    if (feature.type === "randomizer" && !randomizerAtRegisterStart) {
      continue;
    }
    if (
      feature.type === "radiation" ||
      feature.type === "radioactiveWaste" ||
      feature.type === "repairDock" ||
      (feature.type === "flamethrower" && hasKnownRegisterTiming(options)) ||
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
      factoryRejects: Boolean(options.factoryRejects),
      classicSharedDeck: Boolean(options.classicSharedDeck),
      lessForeshadowing: Boolean(options.lessForeshadowing),
      lessSpammyGame: options.lessSpammyGame,
      criticalSpam: options.criticalSpam,
      criticalHaywire: options.criticalHaywire,
      permanentShutdown: options.permanentShutdown
    });
  }

  return penalty;
}

export function isExposedToPitOrEdge(tileMap, point, dir, options = {}) {
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

export function getCheapDynamicArchiveLandingPoints(tileMap) {
  let points = DYNAMIC_ARCHIVE_CHEAP_PROXY_POINT_CACHE.get(tileMap);
  if (points) return points;
  points = [];
  for (const tile of tileMap?.values?.() || []) {
    if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) continue;
    if ((tile.features || []).some((feature) => (
      feature?.type === "checkpoint" || feature?.type === "battery"
    ))) {
      points.push({ x: Number(tile.x), y: Number(tile.y) });
    }
  }
  DYNAMIC_ARCHIVE_CHEAP_PROXY_POINT_CACHE.set(tileMap, points);
  return points;
}

export function getCheapDynamicArchiveProxyPoint(
  tileMap,
  legOrigin,
  state,
  goal,
  options = {}
) {
  if (options.recoveryRule !== "dynamic_archiving" || !state) {
    return options.dynamicArchivePoint ?? null;
  }
  const origin = legOrigin ?? state;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyRequests += 1;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyOrigins.add(
    `${origin?.x ?? "?"},${origin?.y ?? "?"}`
  );
  let cache = DYNAMIC_ARCHIVE_CHEAP_PROXY_RESULT_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    DYNAMIC_ARCHIVE_CHEAP_PROXY_RESULT_CACHE.set(tileMap, cache);
  }
  const key = [
    origin.x, origin.y, state.x, state.y, goal?.x ?? "", goal?.y ?? ""
  ].join("|");
  const cached = cache.get(key);
  if (cached) {
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyPoints.add(
      `${cached.x ?? "?"},${cached.y ?? "?"}`
    );
    return cached;
  }

  const direct = heuristic(origin, state);
  // Allow a small detour so a Battery/checkpoint that is plausibly on the cheap
  // route can stand in as the latest archive. This is intentionally geometric,
  // history-free guidance; exact replay reconstructs the true marker.
  const tolerance = Math.min(6, 2 + Math.ceil(direct * 0.25));
  let best = { x: origin.x, y: origin.y };
  let bestDistanceToState = heuristic(best, state);
  let bestVia = direct;

  for (const candidate of getCheapDynamicArchiveLandingPoints(tileMap)) {
    if (goal && candidate.x === goal.x && candidate.y === goal.y &&
        (state.x !== goal.x || state.y !== goal.y)) {
      continue;
    }
    const via = heuristic(origin, candidate) + heuristic(candidate, state);
    if (via > direct + tolerance) continue;
    const distanceToState = heuristic(candidate, state);
    if (
      distanceToState < bestDistanceToState ||
      (distanceToState === bestDistanceToState && via < bestVia)
    ) {
      best = { x: candidate.x, y: candidate.y };
      bestDistanceToState = distanceToState;
      bestVia = via;
    }
  }

  if (cache.size >= DYNAMIC_ARCHIVE_CHEAP_PROXY_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, best);
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.cheapProxyPoints.add(
    `${best.x ?? "?"},${best.y ?? "?"}`
  );
  return best;
}

export function getContextualRecoveryOptionsForPoint(tileMap, state, options = {}) {
  if (
    options.recoveryRule !== "dynamic_archiving" ||
    !options.contextualCheapDynamicArchiveApproximation ||
    !state
  ) {
    return options;
  }

  const proxyPoint = getCheapDynamicArchiveProxyPoint(
    tileMap,
    options.contextualCheapDynamicArchiveOrigin ?? state,
    state,
    options.goal ?? null,
    options
  );
  return {
    ...options,
    dynamicArchivePoint: proxyPoint
  };
}

export function collectContextualRecoveryPressurePoints(tileMap, transition, options = {}) {
  const traversed = transition?.traversed || [];
  if (!traversed.length) return [];

  const points = [];
  for (let index = 0; index < traversed.length; index += 1) {
    const point = traversed[index];
    if (!point || !tileMap.get(tileKey(point.x, point.y))) continue;
    if (
      transition.pendingReboot?.crashPoint &&
      point.x === transition.pendingReboot.crashPoint.x &&
      point.y === transition.pendingReboot.crashPoint.y
    ) {
      continue;
    }
    // Portal entry terrain is skipped; the following jump point is the actual
    // landed state whose local pit/edge pressure was scored by moveOneStep().
    if (traversed[index + 1]?.jump) continue;

    // v49a last safe hotspot pass: the physical template wants the same board
    // pressure with only recovery-aware scaling disabled. Pass that one override
    // explicitly instead of cloning the large contextual options object per point.
    const basePressure = getPitPressurePenalty(
      tileMap,
      point,
      options,
      true
    );
    if (!(basePressure > 0)) continue;
    // The physical template has already established exactly how many adjacent
    // pit/edge exposures this point has. Cache that board-local fact so recovery
    // context never has to re-run the same four directional movement checks.
    points.push({
      x: point.x,
      y: point.y,
      basePressure,
      exposureCount: Math.max(1, Math.round(basePressure / 0.5))
    });
  }
  return points;
}

export function getAutoKillRecoveryProgressFromPoint(state, goal, recoveryPoint) {
  if (!goal || !recoveryPoint) {
    return {
      recoveryPoint,
      progress: 0,
      setback: 0
    };
  }

  const progress = heuristic(state, goal) - heuristic(recoveryPoint, goal);
  return {
    recoveryPoint,
    progress,
    setback: Math.max(0, -progress)
  };
}

export function getContextualPitPressureAdjustment(tileMap, transition, options = {}) {
  let pressurePoints = CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE.get(transition);
  if (!pressurePoints) {
    pressurePoints = collectContextualRecoveryPressurePoints(tileMap, transition, options);
    CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE.set(transition, pressurePoints);
  }
  if (!pressurePoints.length) return 0;

  // v48zo: the cached template already owns the physical exposure count. The
  // contextual pass now computes only the recovery-dependent scalar. Dynamic
  // Archiving still chooses one leg-local proxy from the pre-action state, exactly
  // as v48zc/v48zd did; Normal reboot tokens remain point/board-specific.
  let sharedRecoveryPoint = null;
  if (options.recoveryRule === "dynamic_archiving") {
    sharedRecoveryPoint = options.contextualCheapDynamicArchiveApproximation
      ? getCheapDynamicArchiveProxyPoint(
        tileMap,
        options.contextualCheapDynamicArchiveOrigin ?? transition.from ?? pressurePoints[0],
        transition.from ?? pressurePoints[0],
        options.goal ?? null,
        options
      )
      : (options.dynamicArchivePoint ?? null);
  } else if (options.recoveryRule === "home_reboot") {
    sharedRecoveryPoint = getAutoKillRecoveryPoint(
      transition.from ?? pressurePoints[0],
      options
    );
  }

  let adjustment = 0;
  for (const point of pressurePoints) {
    const recoveryPoint = options.recoveryRule === "reboot_tokens"
      ? getAutoKillRecoveryPoint(point, options)
      : sharedRecoveryPoint;
    const { setback } = getAutoKillRecoveryProgressFromPoint(
      point,
      options.goal,
      recoveryPoint
    );
    const setbackCost = setback * AUTO_KILL_SETBACK_TEMPO_PER_STEP;
    const recoveryAwareExtra = Math.min(
      2.5,
      setbackCost * AUTO_KILL_PRESSURE_SETBACK_WEIGHT
    );
    const exposureCount = Math.max(
      0,
      Math.floor(Number(point.exposureCount) || 0)
    );
    // Match getPitPressurePenalty's two-decimal rounding before subtracting the
    // cached local term; this keeps route scores/fingerprints bit-for-bit stable.
    const contextualPressure = Number((
      exposureCount * (0.5 + recoveryAwareExtra)
    ).toFixed(2));
    adjustment += contextualPressure - point.basePressure;
  }

  return adjustment;
}

// v48zd physical transition templates stop at the factual autokill event.
// Recovery destination and recovery-aware hazard pressure are contextual and are
// restored only after the cached board movement has been found. This keeps
// ordinary movement reusable across goals, starts, reboot-token layouts and
// Dynamic Archive histories while preserving the same location-sensitive pit /
// edge pressure on states where that pressure is actually relevant.
export function finalizeContextualPhysicalTransition(tileMap, transition, options = {}) {
  if (!transition) return transition;

  const pressureAdjustment = getContextualPitPressureAdjustment(
    tileMap,
    transition,
    options
  );
  const pending = transition.pendingReboot;
  if (!pending) {
    if (!pressureAdjustment) return transition;
    return {
      ...transition,
      hazard: Number(((transition.hazard || 0) + pressureAdjustment).toFixed(2))
    };
  }

  const recoveryOptions = getContextualRecoveryOptionsForPoint(
    tileMap,
    transition.from ?? pending.state,
    options
  );
  const recovery = resolveRebootRecovery(
    pending.state,
    pending.crashPoint,
    recoveryOptions,
    { offBoard: Boolean(pending.offBoard) }
  );

  if (!recovery) {
    return {
      ...transition,
      to: cloneState(pending.state),
      rebootChoices: null,
      rebootRecoverySource: null,
      pendingReboot: null,
      hazard: Number(((transition.hazard || 0) + pressureAdjustment + 25).toFixed(2)),
      crashed: true,
      rebooted: false
    };
  }

  return {
    ...transition,
    to: {
      x: recovery.point.x,
      y: recovery.point.y,
      facing: pending.state.facing
    },
    rebootChoices: recovery.choices,
    rebootRecoverySource: recovery.source,
    pendingReboot: null,
    hazard: Number((
      (transition.hazard || 0) +
      pressureAdjustment +
      getRebootDamagePenalty(options)
    ).toFixed(2)),
    rebootPenalty: Number((
      (transition.rebootPenalty || 0) +
      getRebootRoutePenalty()
    ).toFixed(2)),
    crashed: false,
    rebooted: true
  };
}

export function getAutoKillRecoveryPoint(state, options = {}) {
  if (!state) return null;

  // Home Reboot pressure cares only about the best home coordinate for this
  // goal. Facing choices are factual reboot output, not pressure input, so do
  // not allocate four copies per token here.
  if (options.recoveryRule === "home_reboot" && options.goal) {
    let bestToken = null;
    let bestDistance = Infinity;
    for (const token of options.rebootTokens || []) {
      const distance = heuristic(token, options.goal);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestToken = token;
      }
    }
    return bestToken ? { x: bestToken.x, y: bestToken.y } : null;
  }

  // Passing offBoard=true is safe here: the point resolver still checks whether
  // the state actually lies outside every board before choosing the dock start.
  // This saves a duplicate board-rectangle lookup in the common Normal path.
  const recovery = resolveRebootRecoveryPoint(
    state,
    state,
    options,
    { offBoard: true }
  );
  return recovery?.point ?? null;
}

export function getAutoKillRecoveryProgress(state, options = {}) {
  return getAutoKillRecoveryProgressFromPoint(
    state,
    options.goal,
    getAutoKillRecoveryPoint(state, options)
  );
}

export function getPitPressurePenalty(
  tileMap,
  point,
  options = {},
  skipRecoveryAwarePressureOverride = undefined
) {
  let penalty = 0;
  let recoveryAwareExtra = 0;
  const skipRecoveryAwarePressure = skipRecoveryAwarePressureOverride ??
    Boolean(options.contextualSkipRecoveryAwarePressure);
  if (!skipRecoveryAwarePressure) {
    const { setback } = getAutoKillRecoveryProgress(point, options);
    const setbackCost = setback * AUTO_KILL_SETBACK_TEMPO_PER_STEP;
    recoveryAwareExtra = Math.min(
      2.5,
      setbackCost * AUTO_KILL_PRESSURE_SETBACK_WEIGHT
    );
  }

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToPitOrEdge(tileMap, point, dir, options)) {
      continue;
    }

    // This is accidental-death pressure, not deliberate reboot mobility.
    // A recovery point that is behind the current leg makes nearby pits/edges
    // more consequential; a forward recovery point gets no extra credit here
    // because intentional entry is already represented by exact route physics.
    // v48zd physical templates keep only the 0.5 local exposure term; the
    // recovery-aware addition is restored after the cached movement is known.
    penalty += 0.5 + recoveryAwareExtra;
  }

  return Number(penalty.toFixed(2));
}

export function isExposedToLedge(tileMap, point, dir, options = {}) {
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

export function getLedgePressurePenalty(tileMap, point, options = {}) {
  let penalty = 0;

  for (const dir of ROTATION_ORDER) {
    if (!isExposedToLedge(tileMap, point, dir, options)) {
      continue;
    }

    penalty += 0.3;
  }

  return Number(penalty.toFixed(2));
}

export function directionBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  for (const [dir, delta] of Object.entries(DIRS)) {
    if (delta.dx === dx && delta.dy === dy) {
      return dir;
    }
  }

  return null;
}

export function canMoveBetween(
  tileMap,
  from,
  to,
  dir,
  options = {},
  repulsorActiveOverride = undefined
) {
  const fromTile = tileMap.get(tileKey(from.x, from.y));
  const lessDeadlyGame = options.lessDeadlyGame ?? false;
  const repulsorActive = repulsorActiveOverride ?? options.repulsorActive ?? true;

  if (!fromTile) {
    return { ok: false, crash: EDGE_BEHAVIOR === "pit" && !lessDeadlyGame, offBoard: true };
  }

  const toTile = tileMap.get(tileKey(to.x, to.y));
  const fromRepulsor = getRepulsor(fromTile, dir);
  const toRepulsor = getRepulsor(toTile, OPPOSITE[dir]);

  // v48zx correctness: an outward board edge is still a directed boundary.
  // Check walls before treating a missing destination tile as an off-board crash;
  // otherwise a robot can illegally cross a wall on the perimeter to reboot.
  // This matches isExposedToPitOrEdge(), which already uses wall-before-edge order.
  if (isBoundaryBlockedByWalls(tileMap, from, to, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

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

  if (fromLedges.has(dir) && !hasRampForDir(fromTile, dir)) {
    return { ok: false, crash: false, offBoard: false };
  }

  // A paired portal is a discontinuous relocation. Once the robot can enter the
  // portal square, terrain/features on that square are skipped by the portal
  // transit; only the actual exit square is resolved afterward.
  const portalDestination = resolvePortalDestination(
    tileMap,
    to,
    options.portalMap ?? new Map()
  );
  if (!portalDestination && (isPit(toTile) || hasActiveFeature(toTile, "trapdoor", options))) {
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

export function resolvePortalDestination(tileMap, point, portalMap) {
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

export function slideOnOil(tileMap, state, dir, options = {}) {
  const traversed = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  let walledInRelevant = false;
  const workingState = cloneState(state);

  while (isOil(tileMap.get(tileKey(workingState.x, workingState.y)))) {
    const step = moveOneStep(tileMap, workingState, dir, "oil", options);
    traversed.push(...step.traversed);
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;
    walledInRelevant = walledInRelevant || Boolean(step.walledInRelevant);

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        rebootRecoverySource: step.rebootRecoverySource ?? null,
        pendingReboot: step.pendingReboot ?? undefined,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        blocked: step.blocked,
        rebooted: step.rebooted,
        walledInRelevant
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
    rebooted: false,
    walledInRelevant
  };
}

export function mergeStepOutcome(base, extra) {
  return {
    state: extra.state,
    rebootChoices: extra.rebootChoices ?? base.rebootChoices,
    rebootRecoverySource: extra.rebootRecoverySource ?? base.rebootRecoverySource ?? null,
    pendingReboot: extra.pendingReboot ?? base.pendingReboot ?? null,
    blocked: extra.blocked,
    crashed: extra.crashed,
    rebooted: extra.rebooted,
    traversed: [...base.traversed, ...extra.traversed],
    conveyorSteps: [...(base.conveyorSteps || []), ...(extra.conveyorSteps || [])],
    hazard: base.hazard + extra.hazard,
    rebootPenalty: (base.rebootPenalty || 0) + (extra.rebootPenalty || 0),
    distance: base.distance + extra.distance,
    forcedDistance: base.forcedDistance + extra.forcedDistance,
    walledInRelevant: Boolean(base.walledInRelevant || extra.walledInRelevant)
  };
}

export function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function rotateFacing(facing, rotation) {
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

export function movementDir(facing, relative) {
  if (relative === "forward") {
    return facing ?? "E";
  }

  if (relative === "back") {
    return rotateFacing(facing ?? "E", "uturn");
  }

  return facing ?? "E";
}

export function getBeltTurnRotation(belt, entrySide) {
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

export function applyEndOfStepRotation(tileMap, state) {
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

export function moveOneStep(
  tileMap,
  state,
  dir,
  mode,
  options = {},
  moveBudget = null,
  cardMoveDistance = null,
  profileProgrammedStep = false
) {
  const programmedStepProfile =
    profileProgrammedStep &&
    options.contextualPhysicalMissProfile &&
    typeof options.contextualPhysicalMissProfile === "object"
      ? options.contextualPhysicalMissProfile
      : null;
  const delta = DIRS[dir];
  const next = {
    x: state.x + delta.dx,
    y: state.y + delta.dy
  };
  const moveCheckStartedAt = programmedStepProfile ? analysisTelemetryNow() : 0;
  // v48zw hot-path allocation cleanup: repulsor activation is the only
  // canMoveBetween input that differs for programmed/manual movement here.
  // Pass that one boolean explicitly instead of cloning the full contextual
  // options object on every movement step. The 30th Anniversary rule remains
  // unchanged: repulsors react to Move cards, not board-forced movement.
  const moveCheck = canMoveBetween(
    tileMap,
    state,
    next,
    dir,
    options,
    mode === "manual"
  );
  if (programmedStepProfile) {
    programmedStepProfile.physicalMissProgramMoveCheckMs +=
      analysisTelemetryNow() - moveCheckStartedAt;
  }
  let programmedStepPhaseStartedAt = programmedStepProfile ? analysisTelemetryNow() : 0;
  const finishProgrammedStepPhase = programmedStepProfile
    ? (field) => {
      const now = analysisTelemetryNow();
      programmedStepProfile[field] += now - programmedStepPhaseStartedAt;
      programmedStepPhaseStartedAt = now;
    }
    : null;

  if (mode === "manual" && moveCheck.ok && moveCheck.rampAscent && moveBudget !== null && moveBudget < 2) {
    if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBlockedMs");
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
      // Repulsion uses the full printed/effective distance of the triggering
      // Move card, irrespective of how much of that card's movement was already
      // spent before the repulsor was hit. The repulsion then ends that card.
      const repulsorPushDistance = Math.max(1, Number(cardMoveDistance) || 1);
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
          if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBlockedMs");
          return {
            state: bounce.state,
            rebootChoices: bounce.rebootChoices ?? null,
            rebootRecoverySource: bounce.rebootRecoverySource ?? null,
            pendingReboot: bounce.pendingReboot ?? undefined,
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
      const repulsorFinalOutcome = distance > 0 && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
        ? { ...mergeStepOutcome(repulsorOutcome, slideOnOil(tileMap, workingState, reverseDir, options)), repulsed: true }
        : repulsorOutcome;
      if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBlockedMs");
      return repulsorFinalOutcome;
    }

    const reboot = moveCheck.crash
      ? getRebootTransitionCore(
        state,
        { x: next.x, y: next.y },
        options,
        { offBoard: Boolean(moveCheck.offBoard) }
      )
      : null;

    if (reboot) {
      if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBlockedMs");
      return {
        ...reboot,
        blocked: false,
        traversed: [{ x: next.x, y: next.y }],
        conveyorSteps: [],
        distance: 1,
        forcedDistance: mode === "belt" || mode === "push" || mode === "repulsor" ? 1 : 0,
        spentMove: true,
        rampAscent: false
      };
    }

    if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBlockedMs");
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
      rampAscent: false,
      walledInRelevant: Boolean(options.lessDeadlyGame && moveCheck.offBoard && !moveCheck.crash)
    };
  }

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
    const portalDestinationTile = tileMap.get(tileKey(portalDestination.x, portalDestination.y));
    if (isPit(portalDestinationTile) || hasActiveFeature(portalDestinationTile, "trapdoor", options)) {
      const portalCrashOutcome = resolveCrashOrReboot(
        tileMap,
        state,
        resolvedState,
        traversed,
        options,
        1,
        mode
      );
      if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramLandingMs");
      return portalCrashOutcome;
    }
  }

  const portalDestinationTile = portalDestination
    ? tileMap.get(tileKey(portalDestination.x, portalDestination.y))
    : null;
  if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramLandingMs");

  const localHazard = (portalDestination
    ? 0
    : getTilePenalty(nextTile, options) +
      getActiveFlamethrowerEntryPenalty(nextTile, options) +
      getTimedTraversalFragilityPenalty(nextTile, options)) +
    (portalDestinationTile
      ? getTilePenalty(portalDestinationTile, options) +
        getActiveFlamethrowerEntryPenalty(portalDestinationTile, options) +
        getTimedTraversalFragilityPenalty(portalDestinationTile, options)
      : 0);
  if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramHazardMs");

  const pitPressurePenalty = getPitPressurePenalty(tileMap, resolvedState, options);
  const ledgePressurePenalty = getLedgePressurePenalty(tileMap, resolvedState, options);
  if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramPressureMs");
  const directLedgeDamagePenalty = moveCheck.ledgeDamage || 0;

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
    hazard: localHazard +
      pitPressurePenalty +
      ledgePressurePenalty +
      directLedgeDamagePenalty,
    rebootPenalty: 0,
    distance: 1,
    forcedDistance: mode === "belt" || mode === "oil" || mode === "push" || mode === "repulsor" ? 1 : 0,
    spentMove: true,
    rampAscent: Boolean(moveCheck.rampAscent)
  };
  if (finishProgrammedStepPhase) finishProgrammedStepPhase("physicalMissProgramBookkeepingMs");

  return outcome;
}

export function getSignedMoveDistance(action) {
  if (action.type !== "move") {
    return 0;
  }

  const steps = Math.max(1, action.steps ?? 1);
  return action.relative === "back" ? -steps : steps;
}

export function resolveCrashOrReboot(tileMap, state, destination, traversed, options = {}, distance = 0, mode = "manual") {
  const offBoard = !tileMap.get(tileKey(destination.x, destination.y));
  const reboot = getRebootTransitionCore(
    state,
    destination,
    options,
    { offBoard }
  );

  if (reboot) {
    return {
      ...reboot,
      blocked: false,
      traversed,
      conveyorSteps: [],
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

export function resolveTeleporterMove(tileMap, state, action, options = {}) {
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
  // Teleporter movement is a jump: no walls, pits, trapdoors, flamers, or other
  // board elements on the skipped squares are traversed or resolved.
  const destination = {
    x: state.x + DIRS[dir].dx * steps,
    y: state.y + DIRS[dir].dy * steps
  };
  const traversed = [{ x: destination.x, y: destination.y, jump: true }];
  const destinationTile = tileMap.get(tileKey(destination.x, destination.y));

  if (!destinationTile || isPit(destinationTile) || hasActiveFeature(destinationTile, "trapdoor", options)) {
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
      getActiveFlamethrowerEntryPenalty(destinationTile, options) +
      getTimedTraversalFragilityPenalty(destinationTile, options) +
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

export function resolveConveyorPhase(
  tileMap,
  state,
  eligibleSpeed,
  options = {},
  conveyorPhaseOverride = undefined,
  currentOnlyOverride = undefined
) {
  const workingState = cloneState(state);
  const traversed = [];
  const conveyorSteps = [];
  let hazard = 0;
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  let walledInRelevant = false;
  const currentOnly = currentOnlyOverride ?? Boolean(options.currentOnly);
  const maxSteps = currentOnly ? 1 : eligibleSpeed === 2 ? 2 : 1;
  const conveyorPhase = conveyorPhaseOverride ?? options.conveyorPhase ?? (
    currentOnly ? "current" : eligibleSpeed === 2 ? "blue" : "green"
  );
  let stepsTaken = 0;
  let lastMoveDir = null;

  while (stepsTaken < maxSteps) {
    const tile = tileMap.get(tileKey(workingState.x, workingState.y));
    const belt = getBelt(tile);

    if (!belt) {
      break;
    }
    // Water and radioactive-waste conveyor spaces are currents. Currents do not
    // participate in either conveyor phase; they get exactly one later current move.
    if (currentOnly) {
      if (!isCurrent(tile)) break;
    } else {
      if (belt.speed !== eligibleSpeed || isCurrent(tile)) break;
    }

    const step = moveOneStep(tileMap, workingState, belt.dir, "belt", options);
    lastMoveDir = belt.dir;
    traversed.push(...step.traversed);
    conveyorSteps.push(...(step.conveyorSteps || []).map((entry) => ({
      ...entry,
      speed: belt.speed,
      phase: conveyorPhase,
      phaseStep: stepsTaken + 1
    })));
    hazard += step.hazard;
    rebootPenalty += step.rebootPenalty || 0;
    distance += step.distance;
    forcedDistance += step.forcedDistance;
    walledInRelevant = walledInRelevant || Boolean(step.walledInRelevant);
    stepsTaken += 1;

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        rebootRecoverySource: step.rebootRecoverySource ?? null,
        pendingReboot: step.pendingReboot ?? undefined,
        traversed,
        conveyorSteps,
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted,
        walledInRelevant
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
    rebooted: false,
    walledInRelevant
  };
  return stepsTaken > 0 && lastMoveDir && isOil(tileMap.get(tileKey(workingState.x, workingState.y)))
    ? mergeStepOutcome(conveyorOutcome, slideOnOil(tileMap, workingState, lastMoveDir, options))
    : conveyorOutcome;
}

export function resolvePushPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  const pushes = getPushes(tile).filter((push) => isFeatureActiveThisRegister(push, options));

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
  let walledInRelevant = false;

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
    walledInRelevant = walledInRelevant || Boolean(step.walledInRelevant);

    if (step.crashed || step.blocked || step.rebooted) {
      return {
        state: step.state,
        rebootChoices: step.rebootChoices,
        rebootRecoverySource: step.rebootRecoverySource ?? null,
        pendingReboot: step.pendingReboot ?? undefined,
        traversed,
        conveyorSteps: [],
        hazard,
        rebootPenalty,
        distance,
        forcedDistance,
        crashed: step.crashed,
        rebooted: step.rebooted,
        walledInRelevant
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
    rebooted: false,
    walledInRelevant
  };
}

export function resolveCrusherPhase(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));

  if (!hasActiveFeature(tile, "crusher", options)) {
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

  const reboot = getRebootTransitionCore(state, state, options);

  if (reboot) {
    return {
      ...reboot,
      traversed: [{ x: state.x, y: state.y }],
      conveyorSteps: [],
      distance: 0,
      forcedDistance: 0
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

export function hasFeatureType(tile, type) {
  return (tile?.features || []).some((feature) => feature.type === type);
}

export function getTimedHazardSeverity(feature) {
  if (!feature?.type) return 0;
  if (feature.type === "flamethrower") return 5.2;
  if (feature.type === "push") return 3.2;
  if (feature.type === "crusher") return 9.5;
  if (feature.type === "trapdoor") return 9.5;
  if (feature.type === "radiation") return 4.5;
  return 0;
}

export function getFlamethrowerDamagePenalty(options = {}) {
  // A flamer hit is one damage, comparable to a one-damage board laser.
  // Flamers become more dangerous because the same register can inflict one
  // hit on entry/pass-through and another at the end of the register.
  const damagePressure = getDamageDeckPressureMultipliers(options);
  return Number((4 * damagePressure.hazard).toFixed(2));
}

export function getActiveFlamethrowerEntryPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  const activeCount = (tile?.features || []).filter((feature) => (
    feature.type === "flamethrower" && isFeatureActiveThisRegister(feature, options)
  )).length;
  return Number((activeCount * getFlamethrowerDamagePenalty(options)).toFixed(2));
}

export function getTimedFeatureFragilityPenalty(feature, scale = 0.16) {
  if (!hasExplicitTiming(feature)) return 0;
  const severity = getTimedHazardSeverity(feature);
  if (severity <= 0) return 0;
  return severity * getFeatureDutyCycle(feature) * scale;
}

export function getTimedTraversalFragilityPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  let penalty = 0;
  for (const feature of tile?.features || []) {
    penalty += getTimedFeatureFragilityPenalty(feature, 0.12);
  }
  return Number(penalty.toFixed(2));
}

export function getTimedOccupancyFragilityPenalty(tile, options = {}) {
  if (!hasKnownRegisterTiming(options)) return 0;
  let penalty = 0;
  for (const feature of tile?.features || []) {
    penalty += getTimedFeatureFragilityPenalty(feature, 0.18);
  }
  return Number(penalty.toFixed(2));
}

export function getTimedHazardClusterPenalty(tileMap, state) {
  const entries = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      const tile = tileMap.get(tileKey(state.x + dx, state.y + dy));
      for (const feature of tile?.features || []) {
        if (!hasExplicitTiming(feature)) continue;
        const severity = getTimedHazardSeverity(feature);
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

export function getExpectedTimedPushPenalty(tileMap, state, feature, options = {}) {
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

export function getExpectedTimedAutoKillPenalty(
  state,
  feature,
  options = {},
  {
    exploitReliabilityBase = 0,
    exploitReliabilityDuty = 0,
    exploitScale = 0,
    maxExploitCredit = 0
  } = {}
) {
  const duty = getFeatureDutyCycle(feature);
  if (duty <= 0) return 0;

  // All auto-kills destroy the robot. The feature determines exposure timing;
  // the lethal consequence itself is the same damage + lost-register reboot
  // cost used by exact route realization.
  const rebootConsequence = (
    getRebootDamagePenalty(options) +
    getRebootRoutePenalty()
  );
  let penalty = rebootConsequence * duty;

  const { recoveryPoint, progress, setback } = getAutoKillRecoveryProgress(state, options);
  if (!recoveryPoint || !options.goal) {
    return Number(penalty.toFixed(2));
  }

  const tokenMobility = (
    options.recoveryRule === "reboot_tokens" ||
    options.recoveryRule === "home_reboot"
  );
  if (tokenMobility && progress > 0) {
    // Exact active-register physics remains authoritative for deliberate reboot
    // mobility. Static timing uncertainty only grants a small reliability-
    // discounted credit when recovery itself advances the current leg.
    const exploitReliability = exploitReliabilityBase + duty * exploitReliabilityDuty;
    const exploitCredit = (
      Math.min(maxExploitCredit, progress * exploitScale) *
      duty *
      exploitReliability
    );
    penalty -= exploitCredit;
  } else if (setback > 0) {
    // Non-progressing recovery is a hazard, not mobility. Dynamic Archiving
    // reaches this branch with the most recent archive already established by
    // the route prefix; physical/Home reboot tokens use their actual recovery
    // point. The average remaining-register reboot cost is already included
    // above, so this term represents only lost course progress.
    penalty += (
      setback *
      AUTO_KILL_SETBACK_TEMPO_PER_STEP *
      duty
    );
  }

  return Number(Math.max(0, penalty).toFixed(2));
}

export function getExpectedTimedCrusherPenalty(state, feature, options = {}) {
  return getExpectedTimedAutoKillPenalty(state, feature, options, {
    exploitReliabilityBase: 0.2,
    exploitReliabilityDuty: 0.25,
    exploitScale: 0.9,
    maxExploitCredit: 6.5
  });
}

export function getExpectedTimedTrapdoorPenalty(state, feature, options = {}) {
  // A timed pit is even harder to exploit precisely than a timed crusher.
  return getExpectedTimedAutoKillPenalty(state, feature, options, {
    exploitReliabilityBase: 0.16,
    exploitReliabilityDuty: 0.22,
    exploitScale: 0.8,
    maxExploitCredit: 6
  });
}

export function getEndOfRegisterFeaturePenalty(tileMap, state, options = {}) {
  const tile = tileMap.get(tileKey(state.x, state.y));
  if (!tile) return 0;

  let penalty = 0;

  // SEARCH GUIDANCE ONLY. Authoritative completed-route replay owns the real
  // Radioactive Waste damage (+1 every surviving register) and its paired
  // Energy/free-random-upgrade benefit. Keep a modest net hazard hint here so
  // cheap discovery does not treat prolonged waste occupancy as neutral.
  if (hasFeatureType(tile, "radioactiveWaste")) {
    penalty += 2.4;
  }

  // SEARCH GUIDANCE ONLY. Authoritative replay applies Radiation exactly at the
  // end of register 5. The cheap pathfinder keeps the old expected 1/5 hint so
  // it can prefer safer witnesses before exact chronological realization.
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

  if (hasKnownRegisterTiming(options)) {
    for (const feature of tile.features || []) {
      if (feature.type === "flamethrower" && isFeatureActiveThisRegister(feature, options)) {
        penalty += getFlamethrowerDamagePenalty(options);
      }
    }
    // Exact register physics does not remove real-play fragility: a route that
    // depends on threading timed machinery is still harder to execute with an
    // uncertain hand or after robot interference. Keep that as a smaller,
    // non-physical residual instead of the old expected activation effect.
    penalty += getTimedOccupancyFragilityPenalty(tile, options);
  } else {
    // Phase-less/static analysis keeps the old duty-cycle approximation.
    for (const feature of tile.features || []) {
      if (!hasExplicitTiming(feature)) continue;
      if (feature.type === "push") {
        penalty += getExpectedTimedPushPenalty(tileMap, state, feature, options);
      } else if (feature.type === "crusher") {
        penalty += getExpectedTimedCrusherPenalty(state, feature, options);
      } else if (feature.type === "trapdoor") {
        penalty += getExpectedTimedTrapdoorPenalty(state, feature, options);
      }
    }
  }

  penalty += getTimedHazardClusterPenalty(tileMap, state);
  return Number(penalty.toFixed(2));
}

export function simulateAction(tileMap, startState, action, options = {}) {
  const physicalMissProfile =
    options.contextualPhysicalMissProfile &&
    typeof options.contextualPhysicalMissProfile === "object"
      ? options.contextualPhysicalMissProfile
      : null;
  let physicalMissPhaseStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
  const finishPhysicalMissPhase = physicalMissProfile
    ? (field) => {
      const now = analysisTelemetryNow();
      physicalMissProfile[field] += now - physicalMissPhaseStartedAt;
      physicalMissPhaseStartedAt = now;
    }
    : null;
  const programmedStartStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;

  const state = cloneState(startState);
  const traversed = [];
  const conveyorSteps = [];
  const boardEvents = [];
  const startTile = tileMap.get(tileKey(state.x, state.y));

  const registerStartFeatureMask = getRegisterStartFeatureMask(startTile, options);

  // Trapdoors are open for the entire listed register. A robot beginning that
  // register on an open trapdoor drops before its programmed card can move it.
  if (registerStartFeatureMask & REGISTER_START_FEATURE_TRAPDOOR) {
    const dropped = resolveCrashOrReboot(
      tileMap,
      state,
      state,
      [{ x: state.x, y: state.y }],
      options,
      0,
      "trapdoor"
    );
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissProgramStartMs +=
        analysisTelemetryNow() - programmedStartStartedAt;
    }
    if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissProgrammedMs");
    return {
      action: action.id,
      from: cloneState(startState),
      to: dropped.state,
      rebootChoices: dropped.rebootChoices ?? null,
      rebootRecoverySource: dropped.rebootRecoverySource ?? null,
      pendingReboot: dropped.pendingReboot ?? undefined,
      traversed: dropped.traversed,
      conveyorSteps: [],
      boardEvents: [{ type: "trapdoor", at: { x: state.x, y: state.y } }],
      gearTurned: false,
      hazard: dropped.hazard,
      rebootPenalty: dropped.rebootPenalty || 0,
      distance: 0,
      forcedDistance: 0,
      crashed: dropped.crashed,
      blocked: false,
      rebooted: dropped.rebooted
    };
  }

  // v49fh ownership: Randomizer is not simulated as a random card outcome.
  // Preserve only the factual register-start event so completed-route RE can
  // price its +2 control clog and full SPAM-relief opportunity chronologically.
  // Trapdoor's pre-programmed-card drop returned above, so it deliberately never
  // receives this marker. v49fo reuses the combined start-feature scan above.
  const randomizerAtRegisterStart = Boolean(
    registerStartFeatureMask & REGISTER_START_FEATURE_RANDOMIZER
  );

  // v48zv hot-path allocation cleanup: only Randomizer needs the
  // register-start interpretation here. Pass that one override explicitly
  // instead of cloning the large contextual options object on every physical
  // cache miss. All other tile-penalty inputs remain the original options.
  let hazard = getTilePenalty(startTile, options, randomizerAtRegisterStart);
  let rebootPenalty = 0;
  let distance = 0;
  let forcedDistance = 0;
  let crashed = false;
  let blocked = false;
  let rebooted = false;
  let repulsed = false;
  let walledInRelevant = false;
  let rebootChoices = null;
  let rebootRecoverySource = null;
  let pendingReboot = null;

  if (physicalMissProfile) {
    physicalMissProfile.physicalMissProgramStartMs +=
      analysisTelemetryNow() - programmedStartStartedAt;
  }

  if (action.type === "turn") {
    const turnStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
    state.facing = rotateFacing(state.facing, action.rotation);
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissProgramBookkeepingMs +=
        analysisTelemetryNow() - turnStartedAt;
    }
  } else if (action.type === "move") {
    const teleporterStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
    const teleported = resolveTeleporterMove(tileMap, state, action, options);
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissProgramTeleporterMs +=
        analysisTelemetryNow() - teleporterStartedAt;
    }
    if (teleported) {
      const teleporterBookkeepingStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
      traversed.push(...teleported.traversed);
      hazard += teleported.hazard;
      rebootPenalty += teleported.rebootPenalty || 0;
      distance += teleported.distance;
      forcedDistance += teleported.forcedDistance || 0;

      if (teleported.crashed || teleported.blocked || teleported.rebooted) {
        if (physicalMissProfile) {
          physicalMissProfile.physicalMissProgramBookkeepingMs +=
            analysisTelemetryNow() - teleporterBookkeepingStartedAt;
        }
        if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissProgrammedMs");
        return {
          action: action.id,
          randomizerAtRegisterStart,
          from: cloneState(startState),
          to: teleported.state,
          rebootChoices: teleported.rebootChoices ?? null,
          rebootRecoverySource: teleported.rebootRecoverySource ?? null,
          pendingReboot: teleported.pendingReboot ?? undefined,
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
      if (physicalMissProfile) {
        physicalMissProfile.physicalMissProgramBookkeepingMs +=
          analysisTelemetryNow() - teleporterBookkeepingStartedAt;
      }
    } else {
    const manualSetupStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
    const startTile = tileMap.get(tileKey(state.x, state.y));
    const onOil = isOil(startTile);
    const onWater = isWater(startTile);
    const cardMoveDistance = Math.max(1, action.steps ?? 1);
    let remainingSteps = Math.max(0, cardMoveDistance - (
      (onOil ? 1 : 0) +
      (onWater ? 1 : 0)
    ));
    const manualMoveDir = movementDir(state.facing, action.relative);
    const manualDistanceBefore = distance;
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissProgramBookkeepingMs +=
        analysisTelemetryNow() - manualSetupStartedAt;
    }

    while (remainingSteps > 0) {
      const step = moveOneStep(
        tileMap,
        state,
        movementDir(state.facing, action.relative),
        "manual",
        options,
        remainingSteps,
        cardMoveDistance,
        true
      );
      const manualBookkeepingStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
      traversed.push(...step.traversed);
      hazard += step.hazard;
      rebootPenalty += step.rebootPenalty || 0;
      distance += step.distance;
      forcedDistance += step.forcedDistance || 0;
      walledInRelevant = walledInRelevant || Boolean(step.walledInRelevant);

      if (step.crashed || step.blocked || step.rebooted) {
        if (physicalMissProfile) {
          physicalMissProfile.physicalMissProgramBookkeepingMs +=
            analysisTelemetryNow() - manualBookkeepingStartedAt;
        }
        if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissProgrammedMs");
        return {
          action: action.id,
          randomizerAtRegisterStart,
          from: cloneState(startState),
          to: step.state,
          rebootChoices: step.rebootChoices ?? null,
          rebootRecoverySource: step.rebootRecoverySource ?? null,
          pendingReboot: step.pendingReboot ?? undefined,
          traversed,
          conveyorSteps,
          hazard,
          rebootPenalty,
          distance,
          forcedDistance,
          crashed: step.crashed,
          blocked: step.blocked,
          rebooted: step.rebooted,
          repulsed: Boolean(step.repulsed),
          walledInRelevant
        };
      }

      state.x = step.state.x;
      state.y = step.state.y;
      state.facing = step.state.facing;
      if (step.repulsed) {
        repulsed = true;
        if (physicalMissProfile) {
          physicalMissProfile.physicalMissProgramBookkeepingMs +=
            analysisTelemetryNow() - manualBookkeepingStartedAt;
        }
        break;
      }
      remainingSteps -= 1 + (step.rampAscent ? 1 : 0);
      if (physicalMissProfile) {
        physicalMissProfile.physicalMissProgramBookkeepingMs +=
          analysisTelemetryNow() - manualBookkeepingStartedAt;
      }
    }

    const oilStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
    if (distance > manualDistanceBefore && isOil(tileMap.get(tileKey(state.x, state.y)))) {
      const oilStart = cloneState(state);
      const oilSlide = slideOnOil(tileMap, state, manualMoveDir, options);
      traversed.push(...oilSlide.traversed);
      hazard += oilSlide.hazard;
      rebootPenalty += oilSlide.rebootPenalty || 0;
      distance += oilSlide.distance;
      forcedDistance += oilSlide.forcedDistance || 0;
      walledInRelevant = walledInRelevant || Boolean(oilSlide.walledInRelevant);
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
        if (physicalMissProfile) {
          physicalMissProfile.physicalMissProgramOilMs +=
            analysisTelemetryNow() - oilStartedAt;
        }
        if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissProgrammedMs");
        return {
          action: action.id,
          randomizerAtRegisterStart,
          from: cloneState(startState),
          to: oilSlide.state,
          rebootChoices: oilSlide.rebootChoices ?? null,
          rebootRecoverySource: oilSlide.rebootRecoverySource ?? null,
          pendingReboot: oilSlide.pendingReboot ?? undefined,
          traversed, conveyorSteps, hazard, rebootPenalty, distance, forcedDistance,
          crashed: oilSlide.crashed, blocked: oilSlide.blocked, rebooted: oilSlide.rebooted,
          repulsed,
          walledInRelevant
        };
      }
    }
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissProgramOilMs +=
        analysisTelemetryNow() - oilStartedAt;
    }
    }
  }

  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissProgrammedMs");

  // v49a last safe hotspot pass: conveyorPhase/currentOnly are the only values
  // changed for these board phases. Pass them explicitly instead of cloning the
  // full contextual options object three times per physical cache miss.
  const blue = resolveConveyorPhase(tileMap, state, 2, options, "blue");
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
  walledInRelevant = walledInRelevant || Boolean(blue.walledInRelevant);
  crashed = blue.crashed;
  rebooted = blue.rebooted;
  rebootChoices = blue.rebootChoices ?? rebootChoices;
  rebootRecoverySource = blue.rebootRecoverySource ?? rebootRecoverySource;
  pendingReboot = blue.pendingReboot ?? pendingReboot;
  state.x = blue.state.x;
  state.y = blue.state.y;
  state.facing = blue.state.facing;
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissBlueConveyorMs");

  if (!crashed && !rebooted) {
    const green = resolveConveyorPhase(tileMap, state, 1, options, "green");
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
  walledInRelevant = walledInRelevant || Boolean(green.walledInRelevant);
    crashed = green.crashed;
    rebooted = green.rebooted;
    rebootChoices = green.rebootChoices ?? rebootChoices;
    rebootRecoverySource = green.rebootRecoverySource ?? rebootRecoverySource;
    pendingReboot = green.pendingReboot ?? pendingReboot;
    state.x = green.state.x;
    state.y = green.state.y;
    state.facing = green.state.facing;
  }
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissGreenConveyorMs");

  if (!crashed && !rebooted) {
    const current = resolveConveyorPhase(
      tileMap,
      state,
      null,
      options,
      "current",
      true
    );
    traversed.push(...current.traversed);
    conveyorSteps.push(...current.conveyorSteps);
    boardEvents.push(...(current.conveyorSteps || []).map((step) => ({
      type: "conveyor",
      ...step
    })));
    hazard += current.hazard;
    rebootPenalty += current.rebootPenalty || 0;
    distance += current.distance;
    forcedDistance += current.forcedDistance;
  walledInRelevant = walledInRelevant || Boolean(current.walledInRelevant);
    crashed = current.crashed;
    rebooted = current.rebooted;
    rebootChoices = current.rebootChoices ?? rebootChoices;
    rebootRecoverySource = current.rebootRecoverySource ?? rebootRecoverySource;
    pendingReboot = current.pendingReboot ?? pendingReboot;
    state.x = current.state.x;
    state.y = current.state.y;
    state.facing = current.state.facing;
  }
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissCurrentMs");

  if (!crashed && !rebooted) {
    const pushStart = cloneState(state);
    const pushed = resolvePushPhase(tileMap, state, options);
    traversed.push(...pushed.traversed);
    hazard += pushed.hazard;
    rebootPenalty += pushed.rebootPenalty || 0;
    distance += pushed.distance;
    forcedDistance += pushed.forcedDistance;
  walledInRelevant = walledInRelevant || Boolean(pushed.walledInRelevant);
    crashed = pushed.crashed;
    rebooted = pushed.rebooted;
    rebootChoices = pushed.rebootChoices ?? rebootChoices;
    rebootRecoverySource = pushed.rebootRecoverySource ?? rebootRecoverySource;
    pendingReboot = pushed.pendingReboot ?? pendingReboot;
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
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissPusherMs");

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
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissGearMs");

  if (!crashed && !rebooted) {
    const crushed = resolveCrusherPhase(tileMap, state, options);
    traversed.push(...crushed.traversed);
    hazard += crushed.hazard;
    rebootPenalty += crushed.rebootPenalty || 0;
    distance += crushed.distance;
    forcedDistance += crushed.forcedDistance;
  walledInRelevant = walledInRelevant || Boolean(crushed.walledInRelevant);
    crashed = crushed.crashed;
    rebooted = crushed.rebooted;
    rebootChoices = crushed.rebootChoices ?? rebootChoices;
    rebootRecoverySource = crushed.rebootRecoverySource ?? rebootRecoverySource;
    pendingReboot = crushed.pendingReboot ?? pendingReboot;
    state.x = crushed.state.x;
    state.y = crushed.state.y;
    state.facing = crushed.state.facing;
  }
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissCrusherMs");

  if (!crashed && !rebooted) {
    hazard += getEndOfRegisterFeaturePenalty(tileMap, state, options);
  }
  if (finishPhysicalMissPhase) finishPhysicalMissPhase("physicalMissEndRegisterMs");

  return {
    action: action.id,
    randomizerAtRegisterStart,
    from: cloneState(startState),
    to: state,
    rebootChoices,
    rebootRecoverySource,
    pendingReboot: pendingReboot ?? undefined,
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
    rebooted,
    repulsed,
    walledInRelevant
  };
}
