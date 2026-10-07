// Robo Rally Course Randomizer - route scoring and basic route search: per-leg and full-course enumeration, dynamic goals, power-up benchmarks
import {
  getHomingMissileSearchGuidanceScore,
  getTilePenaltyForFeature
} from "../../feature-weights.js";
import {
  buildPortalMap,
  cloneState,
  hasHomingMissile,
  isPit,
  stateKey,
  tileKey
} from "./board-geometry.js";
import { MinHeap } from "./collections.js";
import { ACTIONS, REGISTER_COUNT, REGISTER_TEMPO_COST, ROTATION_ORDER } from "./constants.js";
import {
  getInitialRouteEconomyShadowState,
  getInitialRouteEnergyShadowReserve,
  getInitialRouteUpgradeCardShadowUnits,
  getRouteEnergyEconomyConfig,
  getRouteEnergyShadowStep
} from "./energy-economy.js";
import { clamp, percentileNumber } from "./math.js";
import {
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY,
  getAutoKillRecoveryProgressFromPoint,
  getRouteAwareActionPenalty,
  heuristic,
  simulateAction
} from "./movement.js";
import {
  PROGRAM_HISTORY_WINDOW_SIZE,
  evaluateProgramAction,
  getCardAvailabilityPressure,
  getProgramHistoryWindow,
  getRollingProgramResourceContext
} from "./program-availability.js";
import {
  getElapsedAbsoluteActionsAfterTransitions,
  getRebootEndedAbsoluteActions,
  getRebootRoutePenalty,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";
import { getActionPenalty, isRouteAwareBatteryScoringActive } from "./rule-options.js";
import { analysisTelemetryNow, recordRouteSearchTelemetry } from "./telemetry.js";

export function buildTimeline(transitions, start) {
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

// Legacy travelled-space score retained only as telemetry for later calibration.
// v49bf does not add this value to pathfinder or completed-route base cost.
// Directional queue ordering still uses Manhattan distance as a cheap heuristic.
export function weightedDistance(distance, forcedDistance) {
  const manualDistance = Math.max(0, distance - forcedDistance);
  return Number((manualDistance * 0.75 + forcedDistance * 0.55).toFixed(2));
}

export function scoreConveyorStep(step, goal) {
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

export function scoreTransitionConveyorComplexity(transition, goal) {
  let score = 0;
  for (const step of transition.conveyorSteps || []) {
    score += scoreConveyorStep(step, goal);
  }
  if (transition.gearTurned) {
    score += 0.55;
  }
  return Number(Math.max(0, score).toFixed(2));
}

export function scoreConveyorComplexity(route, goal) {
  let score = 0;

  for (const transition of route.transitions) {
    score += scoreTransitionConveyorComplexity(transition, goal);
  }

  return Number(Math.max(0, score).toFixed(2));
}

export function routeTouchesPit(tileMap, route) {
  return route.path.some((point) => isPit(tileMap.get(tileKey(point.x, point.y))));
}

export const DYNAMIC_ARCHIVING_ROUTE_UTILITY = Object.freeze({
  // v48zz: keep the established small DA attraction scale, but make eligibility
  // state-relative. A landing earns credit only for recovery setback that the new
  // archive actually removes versus the robot's currently archived point.
  setbackImprovementWeight: 0.08,
  maxRouteReward: 4.5
});

export function isDynamicArchiveLanding(tileMap, point, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving" || !point) return false;
  const tile = tileMap?.get(tileKey(point.x, point.y));
  return (tile?.features || []).some((feature) => (
    feature.type === "checkpoint" || feature.type === "battery"
  ));
}

export function scoreDynamicArchivingRouteUtility(tileMap, route, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving" || !route?.transitions?.length) {
    return 0;
  }

  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityCalls += 1;
  let utilityArchiveLandings = 0;
  let utilitySameArchiveSuppressed = 0;
  let utilityImprovedLandings = 0;
  let utilityNonImprovingLandings = 0;

  const goal = route.hitTarget ?? options.goal ?? route.finalState ?? null;
  let currentArchivePoint = route.dynamicArchivePointStart
    ? { ...route.dynamicArchivePointStart }
    : options.dynamicArchivePointStart
      ? { ...options.dynamicArchivePointStart }
      : route.initialState
        ? { x: route.initialState.x, y: route.initialState.y }
        : null;
  let reward = 0;

  route.transitions.forEach((transition, index) => {
    const actionNumber = index + 1;
    const isFinalRegister = actionNumber >= route.transitions.length;
    const landing = transition?.to;
    if (isFinalRegister || !isDynamicArchiveLanding(tileMap, landing, options)) {
      return;
    }
    utilityArchiveLandings += 1;

    // Dynamic Archiving always updates to the landing according to the game rule,
    // even when doing so is strategically neutral or worse. Routing attraction is
    // narrower: revisiting the current archive, or moving the archive without
    // reducing future reboot setback, earns no reward.
    const sameArchive = Boolean(
      currentArchivePoint &&
      landing?.x === currentArchivePoint.x &&
      landing?.y === currentArchivePoint.y
    );
    if (sameArchive) {
      utilitySameArchiveSuppressed += 1;
    } else if (currentArchivePoint && goal) {
      const { setback } = getAutoKillRecoveryProgressFromPoint(
        landing,
        goal,
        currentArchivePoint
      );
      if (setback > 0) {
        utilityImprovedLandings += 1;
        reward += setback * DYNAMIC_ARCHIVING_ROUTE_UTILITY.setbackImprovementWeight;
      } else {
        utilityNonImprovingLandings += 1;
      }
    } else {
      utilityNonImprovingLandings += 1;
    }

    currentArchivePoint = landing
      ? { x: landing.x, y: landing.y }
      : currentArchivePoint;
  });

  const finalReward = Number(Math.min(
    DYNAMIC_ARCHIVING_ROUTE_UTILITY.maxRouteReward,
    Math.max(0, reward)
  ).toFixed(2));
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityArchiveLandings += utilityArchiveLandings;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilitySameArchiveSuppressed += utilitySameArchiveSuppressed;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityImprovedLandings += utilityImprovedLandings;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityNonImprovingLandings += utilityNonImprovingLandings;
  if (finalReward > 0) {
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRoutesWithReward += 1;
  }
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityRewardTotal += finalReward;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityMaxRouteReward = Math.max(
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.utilityMaxRouteReward,
    finalReward
  );
  return finalReward;
}

export function scoreRoute(route, goal, tileMap = null, options = {}) {
  const scoringGoal = route.hitTarget ?? goal;
  const goalReached = route.finalState.x === scoringGoal.x && route.finalState.y === scoringGoal.y;
  const conveyorComplexity = scoreConveyorComplexity(route, scoringGoal);
  const baseScore = Number.isFinite(route.baseCost)
    ? route.baseCost
    : route.actions * REGISTER_TEMPO_COST + route.hazard + route.rebootPenalty;
  const dynamicArchivingRewardScore = scoreDynamicArchivingRouteUtility(tileMap, route, options);
  const score = baseScore - dynamicArchivingRewardScore;
  const rebootCount = route.transitions.filter((transition) => transition.rebooted).length;

  return {
    actions: route.actions,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    legacyWeightedMovementDiagnostic: weightedDistance(route.distance, route.forcedDistance),
    conveyorComplexity,
    hazard: Number(route.hazard.toFixed(2)),
    rebootCount,
    dynamicArchivingRewardScore,
    score: Number(score.toFixed(2)),
    goalReached
  };
}

export function scoreImmediateTransitionContribution(transition, actionId, history, absoluteActionCount, goal, options = {}) {
  if (!transition || transition.crashed || transition.blocked) return null;
  const action = ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) return null;
  const executedAbsoluteAction = getTransitionAbsoluteAction(
    transition,
    Math.max(0, Number(absoluteActionCount) || 0) + 1
  );
  const transitionRebootPenalty = transition.rebooted
    ? getRebootRoutePenalty(executedAbsoluteAction)
    : (transition.rebootPenalty || 0);
  const neutralPowerUpBenchmark = Boolean(
    options.neutralPowerUpBenchmark && action.id === "WAIT"
  );
  const scarceReusePenalty = neutralPowerUpBenchmark
    ? 0
    : getCardAvailabilityPressure(history, action.id, {
      ...options,
      absoluteActionCount
    });
  const actionPenalty = neutralPowerUpBenchmark
    ? REGISTER_TEMPO_COST
    : getActionPenalty(action, options);
  return (
    (transition.hazard || 0) +
    transitionRebootPenalty +
    actionPenalty +
    scarceReusePenalty
  );
}

export function measureInsertedNeutralPowerUpCost(tileMap, route, insertionIndex, flags = [], options = {}) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  const actionHistory = Array.isArray(route?.actionHistory)
    ? route.actionHistory
    : transitions.map((transition) => transition?.action).filter(Boolean);
  const from = transitions[insertionIndex]?.from;
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) return null;
  const checkpointHits = Array.isArray(route?.checkpointHits) ? route.checkpointHits : [];
  const routeAbsoluteStartAction = Math.max(0, Number(route?.absoluteStartAction) || 0);
  const actionAbsoluteActions = [];
  let routeElapsedAbsoluteActions = routeAbsoluteStartAction;
  transitions.forEach((transition) => {
    const executedAbsoluteAction = getTransitionAbsoluteAction(
      transition,
      routeElapsedAbsoluteActions + 1
    );
    actionAbsoluteActions.push(executedAbsoluteAction);
    routeElapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  });
  let checkpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= insertionIndex).length;
  let absoluteActions = getElapsedAbsoluteActionsAfterTransitions(
    transitions,
    routeAbsoluteStartAction,
    insertionIndex
  );
  let state = cloneState(from);
  let history = actionHistory.slice(0, insertionIndex);
  let historyAbsoluteActions = actionAbsoluteActions.slice(0, insertionIndex);
  let insertedSuffixCost = 0;
  let originalSuffixCost = 0;

  // Baseline: score the original suffix in the same immediate-cost currency.
  for (let index = insertionIndex; index < transitions.length; index += 1) {
    const actionId = transitions[index]?.action ?? actionHistory[index];
    if (!actionId) continue;
    const baselineCheckpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= index).length;
    const baselineGoal = flags[Math.min(baselineCheckpointIndex, Math.max(0, flags.length - 1))] ?? flags.at(-1) ?? null;
    const executedAbsoluteAction = actionAbsoluteActions[index] ?? (index + 1);
    const contribution = scoreImmediateTransitionContribution(
      transitions[index],
      actionId,
      actionHistory.slice(0, index),
      executedAbsoluteAction - 1,
      baselineGoal,
      {
        ...options,
        programHistoryAbsoluteActions: actionAbsoluteActions.slice(0, index)
      }
    );
    if (!Number.isFinite(contribution)) return null;
    originalSuffixCost += contribution;
  }

  const waitAction = ACTIONS.find((action) => action.id === "WAIT");
  if (!waitAction) return null;
  let target = checkpointIndex < flags.length
    ? getFullCourseTarget(flags, checkpointIndex, absoluteActions, options)
    : flags.at(-1) ?? null;
  const waitTransition = simulateAction(tileMap, state, waitAction, {
    ...options,
    goal: target,
    registerIndex: absoluteActions % REGISTER_COUNT
  });
  // A Power Up that immediately crashes/reboots is not a representative way to
  // calibrate the value of energy; leave such tactical edge cases out of the
  // robust course benchmark.
  if (waitTransition.crashed || waitTransition.blocked || waitTransition.rebooted) return null;
  const waitContribution = scoreImmediateTransitionContribution(
    waitTransition,
    "WAIT",
    history,
    absoluteActions,
    target,
    {
      ...options,
      neutralPowerUpBenchmark: true,
      programHistoryAbsoluteActions: historyAbsoluteActions
    }
  );
  if (!Number.isFinite(waitContribution)) return null;
  insertedSuffixCost += waitContribution;
  state = cloneState(waitTransition.to);
  const waitAbsoluteAction = absoluteActions + 1;
  history = getProgramHistoryWindow([...history, "WAIT"]);
  historyAbsoluteActions = [...historyAbsoluteActions, waitAbsoluteAction]
    .slice(-PROGRAM_HISTORY_WINDOW_SIZE);
  absoluteActions = waitAbsoluteAction;
  if (checkpointIndex < flags.length && fullCourseRouteReachesNextCheckpoint({
    finalState: state,
    checkpointIndex,
    actions: insertionIndex + 1,
    absoluteActions
  }, flags, options)) {
    checkpointIndex += 1;
  }

  // Replay the originally planned suffix from the new post-Power-Up state. This
  // captures conveyor/gear/timing benefits or penalties without launching any
  // additional route search. Stop naturally if the inserted register completes
  // the course earlier than the original plan.
  for (let index = insertionIndex; index < actionHistory.length && checkpointIndex < flags.length; index += 1) {
    const actionId = actionHistory[index];
    const action = ACTIONS.find((candidate) => candidate.id === actionId);
    if (!action) return null;
    target = getFullCourseTarget(flags, checkpointIndex, absoluteActions, options);
    const transition = simulateAction(tileMap, state, action, {
      ...options,
      goal: target,
      registerIndex: absoluteActions % REGISTER_COUNT
    });
    if (transition.crashed || transition.blocked || transition.rebooted) return null;
    const contribution = scoreImmediateTransitionContribution(
      transition,
      actionId,
      history,
      absoluteActions,
      target,
      {
        ...options,
        programHistoryAbsoluteActions: historyAbsoluteActions
      }
    );
    if (!Number.isFinite(contribution)) return null;
    insertedSuffixCost += contribution;
    state = cloneState(transition.to);
    const executedAbsoluteAction = absoluteActions + 1;
    history = getProgramHistoryWindow([...history, actionId]);
    historyAbsoluteActions = [...historyAbsoluteActions, executedAbsoluteAction]
      .slice(-PROGRAM_HISTORY_WINDOW_SIZE);
    absoluteActions = executedAbsoluteAction;
    if (fullCourseRouteReachesNextCheckpoint({
      finalState: state,
      checkpointIndex,
      actions: index + 2,
      absoluteActions
    }, flags, options)) {
      checkpointIndex += 1;
    }
  }

  if (checkpointIndex < flags.length) {
    const recoveryEstimate = estimateFullCourseRoute({
      checkpointIndex,
      finalState: state,
      actions: actionHistory.length + 1,
      absoluteActions,
      baseCost: insertedSuffixCost
    }, flags, options) - insertedSuffixCost;
    insertedSuffixCost += Math.max(0, recoveryEstimate);
  }

  return insertedSuffixCost - originalSuffixCost;
}

export function summarizePowerUpOpportunityBenchmark(tileMap, startAnalyses = [], flags = [], options = {}) {
  const productiveRegisterScores = [];
  const powerUpOpportunityCosts = [];
  const fullCourseActions = [];
  const fullCourseScores = [];
  const waitAction = ACTIONS.find((action) => action.id === "WAIT");

  for (const analysis of startAnalyses || []) {
    const route = analysis?.fullCourseRoute;
    if (!route || !Array.isArray(route.transitions) || !route.transitions.length) continue;
    fullCourseActions.push(route.actions ?? route.transitions.length);
    if (Number.isFinite(route.score)) fullCourseScores.push(route.score);
    const actionHistory = Array.isArray(route.actionHistory)
      ? route.actionHistory
      : route.transitions.map((transition) => transition?.action).filter(Boolean);
    const checkpointHits = Array.isArray(route.checkpointHits) ? route.checkpointHits : [];
    const routeAbsoluteStartAction = Math.max(0, Number(route?.absoluteStartAction) || 0);
    const actionAbsoluteActions = [];
    let routeElapsedAbsoluteActions = routeAbsoluteStartAction;
    route.transitions.forEach((transition) => {
      const executedAbsoluteAction = getTransitionAbsoluteAction(
        transition,
        routeElapsedAbsoluteActions + 1
      );
      actionAbsoluteActions.push(executedAbsoluteAction);
      routeElapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
    });
    const opportunitySampleLimit = Math.max(1, Math.floor(options.powerUpBenchmarkSamplesPerRoute ?? 5));
    const opportunitySampleIndices = new Set();
    const transitionCount = route.transitions.length;
    const sampleCount = Math.min(opportunitySampleLimit, transitionCount);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      opportunitySampleIndices.add(Math.min(
        transitionCount - 1,
        Math.floor(((sampleIndex + 0.5) * transitionCount) / sampleCount)
      ));
    }

    route.transitions.forEach((transition, index) => {
      const actionId = transition?.action ?? actionHistory[index];
      if (!actionId) return;
      const from = transition?.from;
      if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      const startTile = tileMap.get(tileKey(from.x, from.y));
      const onBattery = (startTile?.features || []).some((feature) => feature.type === "battery");
      const checkpointIndex = checkpointHits.filter((hit) => Number(hit?.action) <= index).length;
      const executedAbsoluteAction = actionAbsoluteActions[index] ?? (routeAbsoluteStartAction + index + 1);
      const goal = checkpointIndex < flags.length
        ? getFullCourseTarget(flags, checkpointIndex, executedAbsoluteAction - 1, options)
        : flags.at(-1) ?? null;
      const priorHistory = actionHistory.slice(0, index);
      const chosenContribution = scoreImmediateTransitionContribution(
        transition,
        actionId,
        priorHistory,
        executedAbsoluteAction - 1,
        goal,
        {
          ...options,
          programHistoryAbsoluteActions: actionAbsoluteActions.slice(0, index)
        }
      );

      // The course register benchmark should describe useful tempo rather than
      // already taking the energy reward from a battery or Power Up action.
      if (!onBattery && actionId !== "WAIT" && Number.isFinite(chosenContribution)) {
        productiveRegisterScores.push(chosenContribution);
      }

      if (
        options.skipPowerUpStrategicSamples ||
        !waitAction ||
        !opportunitySampleIndices.has(index) ||
        onBattery ||
        actionId === "WAIT" ||
        !Number.isFinite(chosenContribution)
      ) return;
      const opportunityCost = measureInsertedNeutralPowerUpCost(
        tileMap,
        route,
        index,
        flags,
        options
      );
      if (Number.isFinite(opportunityCost)) {
        powerUpOpportunityCosts.push(opportunityCost);
      }
    });
  }

  const registerMedian = percentileNumber(productiveRegisterScores, 0.5);
  const opportunityMedian = percentileNumber(powerUpOpportunityCosts, 0.5);
  const waitActionPenalty = waitAction ? getActionPenalty(waitAction, options) : null;
  const powerUpBaseDiscount = Number.isFinite(waitActionPenalty)
    ? Number((REGISTER_TEMPO_COST - waitActionPenalty).toFixed(2))
    : null;
  let batteryFeatureScore = null;
  try {
    const value = getTilePenaltyForFeature({ type: "battery" }, {
      ...options,
      batteryActive: true
    });
    batteryFeatureScore = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  } catch {
    batteryFeatureScore = null;
  }

  const batteryEnergyRewardScore = Number.isFinite(batteryFeatureScore)
    ? Number((-batteryFeatureScore).toFixed(2))
    : null;

  // Keep these as diagnostics for v36 rather than silently replacing route
  // scoring with the new P2W scarcity curve. The route search does not yet
  // carry a robot's current energy reserve/cap, so applying the full marginal
  // energy value here would over-credit Power Ups or batteries even when the
  // robot could not actually benefit from another cube. A shared reward model
  // should land together with explicit energy-state tracking.
  return {
    method: "productive-register-and-power-up-strategic-delta-shadow",
    registerTempoCost: REGISTER_TEMPO_COST,
    powerUpWaitActionPenalty: Number.isFinite(waitActionPenalty) ? Number(waitActionPenalty.toFixed(2)) : null,
    powerUpBaseDiscount,
    registerScoreMedian: Number.isFinite(registerMedian) ? Number(registerMedian.toFixed(2)) : null,
    registerScoreP25: Number.isFinite(percentileNumber(productiveRegisterScores, 0.25))
      ? Number(percentileNumber(productiveRegisterScores, 0.25).toFixed(2))
      : null,
    registerScoreP75: Number.isFinite(percentileNumber(productiveRegisterScores, 0.75))
      ? Number(percentileNumber(productiveRegisterScores, 0.75).toFixed(2))
      : null,
    registerSamples: productiveRegisterScores.length,
    // Strategic delta is deliberately descriptive, not the energy exchange rate:
    // negative values mean that inserting a Power Up helped the route through
    // factory timing/positioning; positive values mean it cost useful tempo.
    powerUpStrategicDeltaMedian: Number.isFinite(opportunityMedian) ? Number(opportunityMedian.toFixed(2)) : null,
    powerUpStrategicDeltaP25: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.25))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.25).toFixed(2))
      : null,
    powerUpStrategicDeltaP75: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.75))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.75).toFixed(2))
      : null,
    powerUpStrategicDeltaSamples: powerUpOpportunityCosts.length,
    // Compatibility aliases for v34 snapshots/diagnostic consumers.
    powerUpOpportunityMedian: Number.isFinite(opportunityMedian) ? Number(opportunityMedian.toFixed(2)) : null,
    powerUpOpportunityP25: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.25))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.25).toFixed(2))
      : null,
    powerUpOpportunityP75: Number.isFinite(percentileNumber(powerUpOpportunityCosts, 0.75))
      ? Number(percentileNumber(powerUpOpportunityCosts, 0.75).toFixed(2))
      : null,
    powerUpOpportunitySamples: powerUpOpportunityCosts.length,
    medianFullCourseActions: Number.isFinite(percentileNumber(fullCourseActions, 0.5))
      ? Number(percentileNumber(fullCourseActions, 0.5).toFixed(2))
      : null,
    medianFullCourseTurns: Number.isFinite(percentileNumber(fullCourseActions, 0.5))
      ? Number((percentileNumber(fullCourseActions, 0.5) / REGISTER_COUNT).toFixed(2))
      : null,
    medianFullCourseScore: Number.isFinite(percentileNumber(fullCourseScores, 0.5))
      ? Number(percentileNumber(fullCourseScores, 0.5).toFixed(2))
      : null,
    batteryFeatureScore,
    batteryEnergyRewardScore
  };
}

export const HOMING_MISSILE_SEARCH_POSITIONS_CACHE = new WeakMap();

export function getHomingMissileSearchPositions(tileMap) {
  if (!tileMap || typeof tileMap !== "object") return [];
  const cached = HOMING_MISSILE_SEARCH_POSITIONS_CACHE.get(tileMap);
  if (cached) return cached;
  const positions = [];
  for (const [key, tile] of tileMap.entries?.() || []) {
    if (!hasHomingMissile(tile)) continue;
    const [rawX, rawY] = String(key).split(",");
    const x = Number(tile?.x ?? rawX);
    const y = Number(tile?.y ?? rawY);
    if (Number.isFinite(x) && Number.isFinite(y)) positions.push({ x, y });
  }
  HOMING_MISSILE_SEARCH_POSITIONS_CACHE.set(tileMap, positions);
  return positions;
}

export function getHomingMissileCheapSearchGuidanceBonus(
  tileMap,
  state,
  goal,
  options = {}
) {
  if (!state || !goal) return 0;
  const missiles = getHomingMissileSearchPositions(tileMap);
  if (!missiles.length) return 0;
  const guidanceScore = Math.max(
    0,
    Number(getHomingMissileSearchGuidanceScore(options)) || 0
  );
  if (guidanceScore <= 0) return 0;

  const directDistance = heuristic(state, goal);
  let bestBonus = 0;
  for (const missile of missiles) {
    // If the search state is already on this missile, its opportunity has just
    // been discovered; do not keep pulling the heap back toward the same tile.
    if (state.x === missile.x && state.y === missile.y) continue;
    const detourDistance = Math.max(
      0,
      heuristic(state, missile) + heuristic(missile, goal) - directDistance
    );
    // This is search-order guidance only, not route score. Half the ordinary
    // Manhattan estimate slope keeps near-corridor missile opportunities visible
    // without making remote missile tourism dominate the cheap search.
    const detourGuidanceCost = detourDistance * 2.3;
    bestBonus = Math.max(
      bestBonus,
      Math.max(0, guidanceScore - detourGuidanceCost)
    );
  }
  return bestBonus;
}

export function createQueueEntry(route, goal, tileMap = null, options = {}) {
  const missileGuidanceBonus = getHomingMissileCheapSearchGuidanceBonus(
    tileMap,
    route.finalState,
    goal,
    options
  );
  return {
    ...route,
    homingMissileSearchGuidanceBonus: Number(missileGuidanceBonus.toFixed(3)),
    estimate: route.baseCost + heuristic(route.finalState, goal) * 5 - missileGuidanceBonus
  };
}

export function reconstructRouteTransitions(route) {
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

export function getDynamicGoalPosition(dynamicGoal, actionCount) {
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

export function getRouteTarget(goal, actionCount, options = {}) {
  return getDynamicGoalPosition(options.dynamicGoal, actionCount) ?? goal;
}

export function getDynamicGoalSpace(dynamicGoal, point) {
  const displayPositions = dynamicGoal?.displayPositions ?? dynamicGoal?.positions ?? [];
  const index = displayPositions.findIndex((candidate) => (
    candidate.x === point?.x && candidate.y === point?.y
  ));

  return index >= 0 ? index + 1 : null;
}

export function routeReachesGoal(route, goal, options = {}) {
  const elapsedActions = Number.isFinite(Number(route?.absoluteActions))
    ? Number(route.absoluteActions)
    : route.actions;
  const target = getRouteTarget(goal, elapsedActions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

export function getRouteEnergyShadowReserveKey(reserve, options = {}) {
  if (!isRouteAwareBatteryScoringActive(options)) return "";
  const config = getRouteEnergyEconomyConfig(options);
  const safeReserve = clamp(
    Math.floor(Number.isFinite(Number(reserve))
      ? Number(reserve)
      : getInitialRouteEnergyShadowReserve(options)),
    0,
    config.maxEnergy
  );
  return `@e${safeReserve}`;
}

export function getDynamicArchiveStateKey(dynamicArchivePoint, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving" || !dynamicArchivePoint) {
    return "";
  }
  return `@archive${dynamicArchivePoint.x},${dynamicArchivePoint.y}`;
}

export function getNextDynamicArchivePoint(tileMap, destination, currentArchivePoint, options = {}) {
  if (options.recoveryRule !== "dynamic_archiving") {
    return currentArchivePoint ?? null;
  }
  if (isDynamicArchiveLanding(tileMap, destination, options)) {
    return { x: destination.x, y: destination.y };
  }
  return currentArchivePoint ?? null;
}

export function getSearchStateKey(
  state,
  actionCount,
  options = {},
  energyReserve = null,
  dynamicArchivePoint = null
) {
  const economyActionKey = isRouteAwareBatteryScoringActive(options)
    ? `@a${actionCount}${getRouteEnergyShadowReserveKey(energyReserve, options)}`
    : "";
  const archiveKey = getDynamicArchiveStateKey(dynamicArchivePoint, options);
  if (!options.dynamicGoal) {
    return `${stateKey(state)}${economyActionKey}${archiveKey}`;
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = options.dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@${phase}${economyActionKey}${archiveKey}`;
}

export function enumerateRoutes(tileMap, start, goal, options = {}) {
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
    portalMap,
    rebootStart: options.rebootStart ?? { x: start.x, y: start.y }
  };
  const initialAbsoluteActions = Math.max(0, Math.floor(Number(options.absoluteActions) || 0));
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
    const initialEconomyState = getInitialRouteEconomyShadowState(options);
    const initialEnergyReserve = initialEconomyState.energy;
    const initialUpgradeCardUnits = initialEconomyState.usefulCardUnits;
    const initialDynamicArchivePoint = options.recoveryRule === "dynamic_archiving"
      ? { x: initialState.x, y: initialState.y }
      : null;
    const initialStateKey = getSearchStateKey(
      initialState,
      initialAbsoluteActions,
      options,
      initialEnergyReserve,
      initialDynamicArchivePoint
    );
    bestCostByState.set(initialStateKey, 0);
    queue.push(createQueueEntry({
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      absoluteActions: initialAbsoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: initialEconomyState.normalDraws || 0,
      routeEconomyInstalls: initialEconomyState.installs || 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: initialEconomyState.energySpent || 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      dynamicArchivePoint: initialDynamicArchivePoint,
      baseCost: 0,
      actionHistory: [],
      actionAbsoluteHistory: []
    }, goal, tileMap, options));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getSearchStateKey(
      current.finalState,
      current.absoluteActions,
      options,
      current.routeEnergyShadowReserve,
      current.dynamicArchivePoint
    );
    const knownBest = bestCostByState.get(currentStateId);

    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      continue;
    }

    if (routeReachesGoal(current, goal, options)) {
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const hitTarget = getRouteTarget(goal, current.absoluteActions, options);
      const hitSpace = getDynamicGoalSpace(options.dynamicGoal, hitTarget);
      const completedRoute = {
        ...current,
        transitions,
        hitTarget
      };
      const routeScore = scoreRoute(completedRoute, goal, tileMap, options);
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
            actions: current.absoluteActions,
            positions: options.dynamicGoal.positions ?? [],
            displayPositions: options.dynamicGoal.displayPositions ?? options.dynamicGoal.positions ?? []
          }
          : null,
        absoluteStartAction: initialAbsoluteActions,
        absoluteActions: current.absoluteActions,
        localActionIds: [...current.actionHistory],
        programHistoryEnd: getProgramHistoryWindow(current.actionHistory),
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? getInitialRouteEnergyShadowReserve(options),
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        goalReached: true,
        fullCourseLeg: true,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) {
      continue;
    }

    for (const action of ACTIONS) {
      const cardEvaluation = evaluateProgramAction(
        current.actionHistory,
        current.absoluteActions,
        action.id,
        {
          ...options,
          programHistoryAbsoluteActions: current.actionAbsoluteHistory
        }
      );
      if (!cardEvaluation.feasible) {
        continue;
      }
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal,
        registerIndex: current.absoluteActions % REGISTER_COUNT,
        dynamicArchivePoint: current.dynamicArchivePoint
      });
      if (transition.crashed || transition.blocked) {
        continue;
      }

      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const scarceReusePenalty = cardEvaluation.penalty;
      const executedAbsoluteAction = current.absoluteActions + 1;
      const nextAbsoluteActions = transition.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      const nextActionHistory = getProgramHistoryWindow([...current.actionHistory, action.id]);
      const nextActionAbsoluteHistory = [
        ...(current.actionAbsoluteHistory || []),
        executedAbsoluteAction
      ].slice(-PROGRAM_HISTORY_WINDOW_SIZE);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const nextDynamicArchivePoint = getNextDynamicArchivePoint(
          tileMap,
          destination,
          current.dynamicArchivePoint,
          options
        );
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(executedAbsoluteAction)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = {
          ...(transition.rebootChoices?.length
            ? { ...transition, to: destination }
            : transition),
          absoluteAction: executedAbsoluteAction
        };
        const energyStep = getRouteEnergyShadowStep(
          tileMap,
          destination,
          action.id,
          executedAbsoluteAction,
          current.routeEnergyShadowReserve,
          current.routeUpgradeCardShadowUnits,
          options,
          transitionForDestination
        );
        const energyEconomyRewardScore = energyStep.rewardScore;
        const batteryEconomyRewardScore = energyStep.batteryRewardScore;
        const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
        const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;
        const nextStateKey = getSearchStateKey(
          destination,
          nextAbsoluteActions,
          options,
          energyStep.reserveAfter,
          nextDynamicArchivePoint
        );
        const nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          absoluteActions: nextAbsoluteActions,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          routeEnergyEconomyRewardScore: (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
          batteryEconomyRewardScore: (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
          powerUpEconomyRewardScore: (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
          chopShopEconomyRewardScore: (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
          routeEnergyShadowReserve: energyStep.reserveAfter,
          routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
          routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
          routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
          routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
          routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
          routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
          routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
          chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
          chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
          dynamicArchivePoint: nextDynamicArchivePoint,
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + actionPenalty + scarceReusePenalty - energyEconomyRewardScore,
          actionHistory: nextActionHistory,
          actionAbsoluteHistory: nextActionAbsoluteHistory
        };

        const priorBest = bestCostByState.get(nextStateKey);
        if (priorBest !== undefined && nextRoute.baseCost >= priorBest - 0.001) {
          continue;
        }

        bestCostByState.set(nextStateKey, nextRoute.baseCost);
        queue.push(createQueueEntry(nextRoute, goal, tileMap, options));
      }
    }
  }

  const hitExpansionCap = expansions >= maxExpansions;
  completed.searchMeta = {
    expansions,
    maxExpansions,
    hitExpansionCap,
    zeroRouteCapFailure: completed.length === 0 && hitExpansionCap
  };
  recordRouteSearchTelemetry("single-leg", telemetryStartedAt, {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    hitExpansionCap,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: { x: goal.x, y: goal.y }
  });
  return completed;
}

export function getFullCourseDynamicGoal(options = {}, checkpointIndex) {
  return Array.isArray(options.dynamicGoals)
    ? options.dynamicGoals[checkpointIndex] ?? null
    : null;
}

export function getFullCourseTarget(flags, checkpointIndex, actionCount, options = {}) {
  const goal = flags[checkpointIndex];
  return getDynamicGoalPosition(getFullCourseDynamicGoal(options, checkpointIndex), actionCount) ?? goal;
}

export function fullCourseRouteReachesNextCheckpoint(route, flags, options = {}) {
  const elapsedActions = Number.isFinite(Number(route?.absoluteActions))
    ? Number(route.absoluteActions)
    : route.actions;
  const target = getFullCourseTarget(flags, route.checkpointIndex, elapsedActions, options);
  return route.finalState.x === target.x && route.finalState.y === target.y;
}

export function getFullCourseSearchStateKey(
  state,
  actionCount,
  checkpointIndex,
  options = {},
  energyReserve = null,
  dynamicArchivePoint = null,
  programHistory = null,
  programHistoryAbsoluteActions = null,
  localActionCount = null
) {
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const registerPhase = actionCount % REGISTER_COUNT;
  const economyActionKey = isRouteAwareBatteryScoringActive(options)
    ? `@a${actionCount}${getRouteEnergyShadowReserveKey(energyReserve, options)}`
    : "";
  const archiveKey = getDynamicArchiveStateKey(dynamicArchivePoint, options);
  // v49cd diagnostic-only state refinement. The ordinary full-course search
  // intentionally keeps its historical cheap physical dominance. A targeted
  // same-register/card-pressure search instead needs to distinguish both exact
  // local register count and the rolling two-program card state, otherwise a
  // cheap route at the same board/register phase can erase the very alternative
  // the diagnostic is trying to look for.
  const diagnosticActionKey = options.cardPressureDiagnosticSearch
    ? `@da${Math.max(0, Number(localActionCount ?? actionCount) || 0)}`
    : "";
  let diagnosticCardKey = "";
  if (options.cardPressureDiagnosticSearch) {
    const cardContext = getRollingProgramResourceContext(
      Array.isArray(programHistory) ? programHistory : [],
      actionCount,
      null,
      Array.isArray(programHistoryAbsoluteActions)
        ? programHistoryAbsoluteActions
        : null,
      options
    );
    const previousActionId = cardContext?.currentTurnActions?.at(-1) ?? "-";
    diagnosticCardKey = `@dc${cardContext?.pairSignatureId ?? 0}@p${previousActionId}`;
  }
  if (!dynamicGoal) {
    return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}${economyActionKey}${archiveKey}${diagnosticActionKey}${diagnosticCardKey}`;
  }

  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && actionCount >= periodStart
    ? `${periodStart}+${(actionCount - periodStart) % periodLength}`
    : String(Math.min(actionCount, Math.max(0, positions.length - 1)));

  return `${stateKey(state)}@cp${checkpointIndex}@r${registerPhase}@${phase}${economyActionKey}${archiveKey}${diagnosticActionKey}${diagnosticCardKey}`;
}

export function estimateFullCourseRoute(route, flags, options = {}) {
  if (route.checkpointIndex >= flags.length) {
    return route.baseCost;
  }

  const elapsedActions = Number.isFinite(Number(route?.absoluteActions))
    ? Number(route.absoluteActions)
    : route.actions;
  const target = getFullCourseTarget(flags, route.checkpointIndex, elapsedActions, options);
  let remainingDistance = heuristic(route.finalState, target);
  for (let index = route.checkpointIndex + 1; index < flags.length; index += 1) {
    remainingDistance += heuristic(flags[index - 1], flags[index]);
  }

  return route.baseCost + remainingDistance * 4.6;
}

export function createFullCourseQueueEntry(route, flags, options = {}, tileMap = null) {
  const elapsedActions = Number.isFinite(Number(route?.absoluteActions))
    ? Number(route.absoluteActions)
    : route.actions;
  const target = route.checkpointIndex < flags.length
    ? getFullCourseTarget(flags, route.checkpointIndex, elapsedActions, options)
    : null;
  const missileGuidanceBonus = target
    ? getHomingMissileCheapSearchGuidanceBonus(
      tileMap,
      route.finalState,
      target,
      options
    )
    : 0;
  return {
    ...route,
    homingMissileSearchGuidanceBonus: Number(missileGuidanceBonus.toFixed(3)),
    estimate: estimateFullCourseRoute(route, flags, options) - missileGuidanceBonus
  };
}

export function makeCheckpointHit(route, flags, options = {}) {
  const checkpointIndex = route.checkpointIndex;
  const dynamicGoal = getFullCourseDynamicGoal(options, checkpointIndex);
  const elapsedActions = Number.isFinite(Number(route?.absoluteActions))
    ? Number(route.absoluteActions)
    : route.actions;
  const hitTarget = getFullCourseTarget(flags, checkpointIndex, elapsedActions, options);
  return {
    checkpointIndex,
    checkpointId: flags[checkpointIndex]?.id ?? checkpointIndex + 1,
    action: route.actions,
    absoluteAction: elapsedActions,
    state: cloneState(route.finalState),
    position: hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? flags[checkpointIndex]?.id ?? checkpointIndex + 1,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: elapsedActions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    distance: route.distance,
    forcedDistance: route.forcedDistance,
    hazard: route.hazard,
    rebootPenalty: route.rebootPenalty,
    baseCost: route.baseCost,
    routeEnergyEconomyRewardScore: route.routeEnergyEconomyRewardScore ?? 0,
    batteryEconomyRewardScore: route.batteryEconomyRewardScore ?? 0,
    powerUpEconomyRewardScore: route.powerUpEconomyRewardScore ?? 0,
    chopShopEconomyRewardScore: route.chopShopEconomyRewardScore ?? 0,
    routeEnergyShadowReserve: route.routeEnergyShadowReserve ?? null,
    routeUpgradeCardShadowUnits: route.routeUpgradeCardShadowUnits ?? null
  };
}

export function enumerateFullCourseRoutes(tileMap, start, flags, options = {}) {
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
  const diagnosticExactActions = Number.isFinite(Number(options.cardPressureDiagnosticExactActions))
    ? Math.max(1, Math.floor(Number(options.cardPressureDiagnosticExactActions)))
    : null;
  const maxActions = diagnosticExactActions ??
    (options.maxActions ?? Math.max(24, flags.length * 18 + 8));
  const maxExpansions = options.maxExpansions ?? 45000;
  const maxStateLabels = Math.max(1, Math.min(2, options.maxStateLabels ?? 1));
  const diagnosticCardPressureWeight = options.cardPressureDiagnosticSearch
    ? Math.max(1, Number(options.cardPressureDiagnosticWeight) || 1)
    : 1;
  const initialFacings = options.startupSpinUp ? ROTATION_ORDER : [start.facing ?? "E"];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap,
    rebootStart: options.rebootStart ?? { x: start.x, y: start.y }
  };
  const initialAbsoluteActions = Math.max(0, Math.floor(Number(options.absoluteActions) || 0));
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
    const initialEconomyState = getInitialRouteEconomyShadowState(options);
    const initialEnergyReserve = initialEconomyState.energy;
    const initialUpgradeCardUnits = initialEconomyState.usefulCardUnits;
    const initialDynamicArchivePoint = options.recoveryRule === "dynamic_archiving"
      ? { x: initialState.x, y: initialState.y }
      : null;
    const initialRoute = {
      finalState: initialState,
      initialState,
      startFacing: facing,
      parent: null,
      transition: null,
      actions: 0,
      absoluteActions: initialAbsoluteActions,
      distance: 0,
      forcedDistance: 0,
      hazard: 0,
      rebootPenalty: 0,
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: initialEconomyState.normalDraws || 0,
      routeEconomyInstalls: initialEconomyState.installs || 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: initialEconomyState.energySpent || 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      dynamicArchivePoint: initialDynamicArchivePoint,
      baseCost: 0,
      checkpointIndex: 0,
      checkpointHits: [],
      actionHistory: [],
      actionAbsoluteHistory: []
    };
    const initialStateKey = getFullCourseSearchStateKey(
      initialState,
      initialAbsoluteActions,
      0,
      options,
      initialEnergyReserve,
      initialDynamicArchivePoint,
      initialRoute.actionHistory,
      initialRoute.actionAbsoluteHistory,
      initialRoute.actions
    );
    acceptStateLabel(initialStateKey, 0, 1);
    queue.push(createFullCourseQueueEntry(initialRoute, flags, options, tileMap));
  }

  const completed = [];
  let expansions = 0;

  while (queue.size && completed.length < maxRoutes && expansions < maxExpansions) {
    const current = queue.pop();
    const currentStateId = getFullCourseSearchStateKey(
      current.finalState,
      current.absoluteActions,
      current.checkpointIndex,
      options,
      current.routeEnergyShadowReserve,
      current.dynamicArchivePoint,
      current.actionHistory,
      current.actionAbsoluteHistory,
      current.actions
    );
    if (!stateLabelStillActive(currentStateId, current.baseCost)) continue;

    if (current.checkpointIndex >= flags.length) {
      // v49cd targeted card-pressure audit asks a narrower question than normal
      // routing: can another route finish in exactly the selected number of
      // programmed registers with lower exact card burden? Earlier finishes are
      // not same-register alternatives and are discarded rather than extended
      // beyond a course that has already ended.
      if (diagnosticExactActions !== null && current.actions !== diagnosticExactActions) {
        continue;
      }
      const transitions = reconstructRouteTransitions(current);
      const timeline = buildTimeline(transitions, current.initialState);
      const finalGoal = flags.at(-1);
      const completedRoute = {
        ...current,
        transitions,
        path: timeline,
        hitTarget: current.checkpointHits.at(-1)?.position ?? finalGoal
      };
      const routeScore = scoreRoute(completedRoute, finalGoal, tileMap, options);
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
        absoluteStartAction: initialAbsoluteActions,
        absoluteActions: current.absoluteActions,
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? getInitialRouteEnergyShadowReserve(options),
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? getInitialRouteUpgradeCardShadowUnits(options),
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        fullCourse: true,
        ...routeScore
      });
      continue;
    }

    expansions += 1;
    if (current.actions >= maxActions) continue;

    const currentTarget = getFullCourseTarget(
      flags,
      current.checkpointIndex,
      current.absoluteActions,
      options
    );
    for (const action of ACTIONS) {
      const cardEvaluation = evaluateProgramAction(
        current.actionHistory,
        current.absoluteActions,
        action.id,
        {
          ...options,
          programHistoryAbsoluteActions: current.actionAbsoluteHistory
        }
      );
      if (!cardEvaluation.feasible) {
        continue;
      }
      const transition = simulateAction(tileMap, current.finalState, action, {
        ...simulationOptions,
        goal: currentTarget,
        registerIndex: current.absoluteActions % REGISTER_COUNT,
        dynamicArchivePoint: current.dynamicArchivePoint
      });
      if (transition.crashed || transition.blocked) continue;

      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const scarceReusePenalty = cardEvaluation.penalty;
      const executedAbsoluteAction = current.absoluteActions + 1;
      const nextAbsoluteActions = transition.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      const nextActionHistory = getProgramHistoryWindow([...current.actionHistory, action.id]);
      const nextActionAbsoluteHistory = [
        ...(current.actionAbsoluteHistory || []),
        executedAbsoluteAction
      ].slice(-PROGRAM_HISTORY_WINDOW_SIZE);
      const destinations = transition.rebootChoices?.length ? transition.rebootChoices : [transition.to];

      for (const destination of destinations) {
        const nextActionCount = current.actions + 1;
        const nextDynamicArchivePoint = getNextDynamicArchivePoint(
          tileMap,
          destination,
          current.dynamicArchivePoint,
          options
        );
        const transitionRebootPenalty = transition.rebooted
          ? getRebootRoutePenalty(executedAbsoluteAction)
          : (transition.rebootPenalty || 0);
        const transitionForDestination = {
          ...(transition.rebootChoices?.length
            ? { ...transition, to: destination }
            : transition),
          absoluteAction: executedAbsoluteAction
        };
        const energyStep = getRouteEnergyShadowStep(
          tileMap,
          destination,
          action.id,
          executedAbsoluteAction,
          current.routeEnergyShadowReserve,
          current.routeUpgradeCardShadowUnits,
          options,
          transitionForDestination
        );
        const energyEconomyRewardScore = energyStep.rewardScore;
        const batteryEconomyRewardScore = energyStep.batteryRewardScore;
        const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
        const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;
        let nextRoute = {
          finalState: destination,
          initialState: current.initialState,
          startFacing: current.startFacing,
          parent: current,
          transition: transitionForDestination,
          actions: nextActionCount,
          absoluteActions: nextAbsoluteActions,
          distance: current.distance + transition.distance,
          forcedDistance: current.forcedDistance + transition.forcedDistance,
          hazard: current.hazard + transition.hazard,
          rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
          routeEnergyEconomyRewardScore: (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
          batteryEconomyRewardScore: (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
          powerUpEconomyRewardScore: (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
          chopShopEconomyRewardScore: (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
          routeEnergyShadowReserve: energyStep.reserveAfter,
          routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? getInitialRouteEnergyShadowReserve(options),
          routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
          routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? getInitialRouteUpgradeCardShadowUnits(options),
          routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
          routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
          routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
          routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
          chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
          chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
          dynamicArchivePoint: nextDynamicArchivePoint,
          baseCost: current.baseCost + transition.hazard + transitionRebootPenalty + actionPenalty +
            scarceReusePenalty * diagnosticCardPressureWeight - energyEconomyRewardScore,
          checkpointIndex: current.checkpointIndex,
          checkpointHits: current.checkpointHits,
          actionHistory: nextActionHistory,
          actionAbsoluteHistory: nextActionAbsoluteHistory
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
          nextAbsoluteActions,
          nextRoute.checkpointIndex,
          options,
          nextRoute.routeEnergyShadowReserve,
          nextRoute.dynamicArchivePoint,
          nextRoute.actionHistory,
          nextRoute.actionAbsoluteHistory,
          nextRoute.actions
        );
        const stateLabelLimit = (
          options.diverseStateLabelsAfterFirstCheckpoint &&
          nextRoute.checkpointIndex >= 1
        )
          ? maxStateLabels
          : 1;
        if (!acceptStateLabel(nextStateKey, nextRoute.baseCost, stateLabelLimit)) continue;
        queue.push(createFullCourseQueueEntry(nextRoute, flags, options, tileMap));
      }
    }
  }

  const fullCourseSearchMeta = {
    expansions,
    maxExpansions,
    completedRoutes: completed.length,
    returnedRoutes: completed.length,
    hitExpansionCap: expansions >= maxExpansions && queue.size > 0,
    hitRouteLimit: completed.length >= maxRoutes,
    exactActionTarget: diagnosticExactActions,
    diagnosticCardPressureSearch: Boolean(options.cardPressureDiagnosticSearch)
  };
  completed.fullCourseSearchMeta = fullCourseSearchMeta;
  recordRouteSearchTelemetry("full-course", telemetryStartedAt, {
    ...fullCourseSearchMeta,
    start: { x: start.x, y: start.y, facing: start.facing ?? null },
    goal: flags.length ? { x: flags.at(-1).x, y: flags.at(-1).y } : null
  });
  return completed;
}

export function getMetricDelta(end, start, key) {
  return Number(((end?.[key] ?? 0) - (start?.[key] ?? 0)).toFixed(2));
}

export function sliceFullCourseRoute(fullRoute, legIndex, flags) {
  const hit = fullRoute.checkpointHits?.[legIndex];
  if (!hit) {
    return null;
  }

  const previousHit = legIndex > 0 ? fullRoute.checkpointHits[legIndex - 1] : null;
  const startAction = previousHit?.action ?? 0;
  const endAction = hit.action;
  const absoluteStartAction = Number.isFinite(Number(previousHit?.absoluteAction))
    ? Number(previousHit.absoluteAction)
    : getElapsedAbsoluteActionsAfterTransitions(
      (fullRoute.transitions || []).slice(0, startAction),
      fullRoute.absoluteStartAction ?? 0
    );
  const absoluteEndAction = Number.isFinite(Number(hit?.absoluteAction))
    ? Number(hit.absoluteAction)
    : getElapsedAbsoluteActionsAfterTransitions(
      (fullRoute.transitions || []).slice(startAction, endAction),
      absoluteStartAction
    );
  const startState = previousHit?.state ?? fullRoute.initialState ?? fullRoute.path?.[0] ?? fullRoute.finalState;
  const transitions = (fullRoute.transitions || []).slice(startAction, endAction);
  const path = buildTimeline(transitions, startState);
  const actionCount = Math.max(0, endAction - startAction);
  const metricStart = previousHit ?? {
    distance: 0,
    forcedDistance: 0,
    hazard: 0,
    rebootPenalty: 0,
    baseCost: 0,
    routeEnergyEconomyRewardScore: 0,
    batteryEconomyRewardScore: 0,
    powerUpEconomyRewardScore: 0,
    chopShopEconomyRewardScore: 0,
    routeEnergyShadowReserve: fullRoute.routeEnergyShadowReserveStart ?? null,
    routeUpgradeCardShadowUnits: fullRoute.routeUpgradeCardShadowUnitsStart ?? null
  };
  const distance = getMetricDelta(hit, metricStart, "distance");
  const forcedDistance = getMetricDelta(hit, metricStart, "forcedDistance");
  const hazard = getMetricDelta(hit, metricStart, "hazard");
  const rebootPenalty = getMetricDelta(hit, metricStart, "rebootPenalty");
  const baseCost = getMetricDelta(hit, metricStart, "baseCost");
  const routeEnergyEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "routeEnergyEconomyRewardScore"
  );
  const batteryEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "batteryEconomyRewardScore"
  );
  const powerUpEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "powerUpEconomyRewardScore"
  );
  const chopShopEconomyRewardScore = getMetricDelta(
    hit,
    metricStart,
    "chopShopEconomyRewardScore"
  );
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
    absoluteStartAction,
    absoluteActions: absoluteEndAction,
    distance,
    forcedDistance,
    hazard,
    rebootPenalty,
    rebootCount: transitions.filter((transition) => transition.rebooted).length,
    conveyorComplexity: scoreConveyorComplexity({ transitions }, hit.position ?? goal),
    score: baseCost,
    routeEnergyEconomyRewardScore,
    batteryEconomyRewardScore,
    powerUpEconomyRewardScore,
    chopShopEconomyRewardScore,
    routeEnergyShadowReserveStart: metricStart.routeEnergyShadowReserve ?? fullRoute.routeEnergyShadowReserveStart ?? null,
    routeEnergyShadowReserveEnd: hit.routeEnergyShadowReserve ?? fullRoute.routeEnergyShadowReserveEnd ?? null,
    routeUpgradeCardShadowUnitsStart: metricStart.routeUpgradeCardShadowUnits ?? fullRoute.routeUpgradeCardShadowUnitsStart ?? null,
    routeUpgradeCardShadowUnitsEnd: hit.routeUpgradeCardShadowUnits ?? fullRoute.routeUpgradeCardShadowUnitsEnd ?? null,
    goalReached: true,
    fullCourseLeg: true
  };
}
