// Robo Rally Course Randomizer - cache of physical transitions (board-only movement results) shared by route searches
import { REGISTER_COUNT } from "./constants.js";
import {
  CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE,
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY,
  collectContextualRecoveryPressurePoints,
  finalizeContextualPhysicalTransition,
  simulateAction
} from "./movement.js";
import { getBoardRectForPoint } from "./reboot-recovery.js";
import { analysisTelemetryNow } from "./telemetry.js";

export const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE = new WeakMap();
export const CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT = 50000;

export function getContextualPhysicalOptionSignature(options = {}) {
  const physicalTemplateOnly = Boolean(options.contextualPhysicalTemplateOnly);
  const rebootTokens = physicalTemplateOnly
    ? ""
    : (options.rebootTokens || [])
      .map((token) => [
        token.x ?? "",
        token.y ?? "",
        token.facing ?? token.dir ?? "",
        token.boardId ?? token.board ?? ""
      ].join(","))
      .sort()
      .join(";");

  const boardRects = physicalTemplateOnly
    ? ""
    : (options.boardRects || [])
      .map((rect) => [
        rect.id ?? rect.boardId ?? "",
        rect.x ?? "",
        rect.y ?? "",
        rect.width ?? rect.w ?? "",
        rect.height ?? rect.h ?? ""
      ].join(","))
      .sort()
      .join(";");

  const cheapArchiveOrigin = options.contextualCheapDynamicArchiveOrigin;

  return [
    physicalTemplateOnly ? "physical-template" : (options.recoveryRule ?? ""),
    !physicalTemplateOnly && options.contextualCheapDynamicArchiveApproximation
      ? `cheapArchiveOrigin=${cheapArchiveOrigin?.x ?? "?"},${cheapArchiveOrigin?.y ?? "?"}`
      : "",
    options.lessDeadlyGame ? 1 : 0,
    options.repulsorOverdrive ? 1 : 0,
    options.repairStations ? 1 : 0,
    options.lighterGame ? 1 : 0,
    options.routeAwareBatteryScoring ? 1 : 0,
    options.flamingOil ? 1 : 0,
    options.playerCount ?? "",
    rebootTokens,
    boardRects
  ].join("|");
}

export function getContextualPhysicalTransitionCache(tileMap) {
  let cache = CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.get(tileMap);
  if (!cache) {
    cache = new Map();
    CONTEXTUAL_PHYSICAL_TRANSITION_CACHE.set(tileMap, cache);
  }
  return cache;
}

export function cloneCachedTransition(transition) {
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
    })),
    pendingReboot: transition.pendingReboot
      ? {
        ...transition.pendingReboot,
        state: transition.pendingReboot.state ? { ...transition.pendingReboot.state } : null,
        crashPoint: transition.pendingReboot.crashPoint ? { ...transition.pendingReboot.crashPoint } : null
      }
      : null
  };
}

export function getCachedContextualPhysicalTransition(
  tileMap,
  state,
  action,
  options,
  optionSignature
) {
  const physicalTemplateOnly = Boolean(options.contextualPhysicalTemplateOnly);
  const goal = options.goal;
  const physicalMissProfile =
    options.contextualPhysicalMissProfile &&
    typeof options.contextualPhysicalMissProfile === "object"
      ? options.contextualPhysicalMissProfile
      : null;
  const lookupStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
  const key = [
    state.x,
    state.y,
    state.facing,
    action.id,
    Number.isInteger(options.registerIndex)
      ? `r${((options.registerIndex % REGISTER_COUNT) + REGISTER_COUNT) % REGISTER_COUNT}`
      : "r?",
    // v48zd: cheap/exact contextual route searches share a pure movement
    // template. Goal and recovery context are applied after the cached board
    // mechanics are known, so they must not fragment the physical cache.
    physicalTemplateOnly ? "goal-" : (goal?.x ?? ""),
    physicalTemplateOnly ? "goal-" : (goal?.y ?? ""),
    physicalTemplateOnly
      ? "archive-"
      : options.recoveryRule === "dynamic_archiving" &&
        !options.contextualCheapDynamicArchiveApproximation
        ? `archive${options.dynamicArchivePoint?.x ?? "?"},${options.dynamicArchivePoint?.y ?? "?"}`
        : "archive-",
    physicalTemplateOnly
      ? "dockStart-"
      : options.recoveryRule === "reboot_tokens" &&
        !getBoardRectForPoint(state, options.boardRects)
        ? `dockStart${options.rebootStart?.x ?? "?"},${options.rebootStart?.y ?? "?"}`
        : "dockStart-",
    optionSignature
  ].join("|");

  const cache = getContextualPhysicalTransitionCache(tileMap);
  const dynamicArchiveTelemetry = options.recoveryRule === "dynamic_archiving";
  if (dynamicArchiveTelemetry) {
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.requests += 1;
    if (!physicalTemplateOnly && !options.contextualCheapDynamicArchiveApproximation) {
      DYNAMIC_ARCHIVE_CACHE_TELEMETRY.archivePoints.add(
        `${options.dynamicArchivePoint?.x ?? "?"},${options.dynamicArchivePoint?.y ?? "?"}`
      );
    }
  }
  const cached = cache.get(key);
  if (cached) {
    if (dynamicArchiveTelemetry) DYNAMIC_ARCHIVE_CACHE_TELEMETRY.hits += 1;
    return {
      transition: physicalTemplateOnly
        ? finalizeContextualPhysicalTransition(tileMap, cached, options)
        : cached,
      hit: true
    };
  }

  if (physicalMissProfile) {
    physicalMissProfile.physicalMissSampledCalls += 1;
    physicalMissProfile.physicalMissLookupMs += analysisTelemetryNow() - lookupStartedAt;
  }
  if (dynamicArchiveTelemetry) DYNAMIC_ARCHIVE_CACHE_TELEMETRY.misses += 1;
  const simulationOptions = physicalTemplateOnly
    ? {
      ...options,
      goal: null,
      dynamicArchivePoint: null,
      contextualDeferRebootRecovery: true,
      contextualSkipRecoveryAwarePressure: true
    }
    : options;

  const transition = simulateAction(tileMap, state, action, simulationOptions);

  let phaseStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
  const cachedTransition = cloneCachedTransition(transition);
  if (physicalMissProfile) {
    physicalMissProfile.physicalMissCloneMs += analysisTelemetryNow() - phaseStartedAt;
  }

  if (physicalTemplateOnly) {
    phaseStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
    CONTEXTUAL_RECOVERY_PRESSURE_POINT_CACHE.set(
      cachedTransition,
      collectContextualRecoveryPressurePoints(tileMap, cachedTransition, options)
    );
    if (physicalMissProfile) {
      physicalMissProfile.physicalMissRecoveryPressureMs +=
        analysisTelemetryNow() - phaseStartedAt;
    }
  }

  phaseStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
  cache.set(key, cachedTransition);
  if (cache.size > CONTEXTUAL_PHYSICAL_TRANSITION_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  if (physicalMissProfile) {
    physicalMissProfile.physicalMissCacheStoreMs += analysisTelemetryNow() - phaseStartedAt;
  }

  phaseStartedAt = physicalMissProfile ? analysisTelemetryNow() : 0;
  const finalizedTransition = physicalTemplateOnly
    ? finalizeContextualPhysicalTransition(tileMap, cachedTransition, options)
    : transition;
  if (physicalMissProfile) {
    physicalMissProfile.physicalMissFinalizeMs += analysisTelemetryNow() - phaseStartedAt;
  }

  return {
    transition: finalizedTransition,
    hit: false
  };
}
