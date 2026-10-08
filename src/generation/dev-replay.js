// Robo Rally Course Randomizer - Dev View route replay: damage-foundation replay options, replay caches, remembered candidate pools and dev timings
import { getPlayableCheckpoints } from "./checkpoints.js";

// DAMAGE_ECONOMY_FOUNDATION_BEGIN
// v49ac-traffic-mixture Dev presentation for the routing-active damage economy.
// Raw damage chronology remains visible for plausibility inspection, while the
// raw damage-economy RE participates in exact candidate comparison; Shutdown is a tolerance reference only.
// Route-local realized damage replaces its legacy direct proxy; robot-laser damage
// replaces the legacy ranged traffic proxy in the later traffic comparison.
export function getDamageFoundationScenarioOptions(scenario) {
  const productionEnergy =
    scenario?.sequence?.firstLeg?.summary?.coursePreflight?.routeAwareBatteryScoring ?? null;
  return {
    ...(scenario?.preferences ?? {}),
    routeAwareBatteryScoring: Boolean(productionEnergy?.active),
    routeEnergyHorizonTurns: productionEnergy?.horizonTurns ?? null,
    routeEnergyRegisterScore: productionEnergy?.registerScore ?? null,
    recoveryRule: scenario?.recoveryRule,
    moreDeadlyGame: Boolean(scenario?.moreDeadlyGame),
    lessSpammyGame: Boolean(scenario?.lessSpammyGame),
    criticalSpam: Boolean(scenario?.criticalSpam),
    criticalHaywire: Boolean(scenario?.criticalHaywire),
    permanentShutdown: Boolean(scenario?.permanentShutdown),
    factoryRejects: Boolean(scenario?.factoryRejects),
    repairStations: Boolean(scenario?.repairStations),
    cuttingFloor: Boolean(scenario?.cuttingFloor),
    flamingOil: Boolean(scenario?.flamingOil),
    repulsorOverdrive: Boolean(scenario?.repulsorOverdrive),
    movingTargets: Boolean(scenario?.movingTargets),
    movingTargetsActive: Boolean(scenario?.movingTargetStats?.activeCount),
    hazardousFlags: Boolean(scenario?.hazardousFlags),
    upgradeWorld: Boolean(scenario?.upgradeWorld),
    lighterGame: Boolean(scenario?.lighterGame),
    setToKill: Boolean(scenario?.setToKill),
    setToStun: Boolean(scenario?.setToStun),
    trafficGraceRegisters: scenario?.virtualBots ? 5 : 0,
    boardRects: scenario?.boardRects ?? [],
    rebootTokens: scenario?.rebootTokens ?? [],
    playerCount: scenario?.preferences?.playerCount ?? scenario?.playerCount ?? 4
  };
}


export const DAMAGE_FOUNDATION_TRAFFIC_CONTEXT_CACHE = new WeakMap();

export function getDamageFoundationTrafficContext(scenario, startIndex) {
  if (!scenario || !Number.isInteger(startIndex)) return null;
  let byStart = DAMAGE_FOUNDATION_TRAFFIC_CONTEXT_CACHE.get(scenario);
  if (!byStart) {
    byStart = new Map();
    DAMAGE_FOUNDATION_TRAFFIC_CONTEXT_CACHE.set(scenario, byStart);
  }
  if (byStart.has(startIndex)) return byStart.get(startIndex);

  // Match the production routing-active full-course traffic field: every currently
  // reachable exact start participates in the common player-count occupancy model.
  // v49ab uses the same field for robot-laser damage in route comparison and Dev replay.
  const analyses = (scenario?.sequence?.firstLeg?.starts ?? [])
    .filter((entry) => entry?.reachable && entry?.fullCourseRoute);
  if (!analyses.some((entry) => entry.index === startIndex)) {
    byStart.set(startIndex, null);
    return null;
  }

  const pricingEntries =
    scenario?.sequence?.firstLeg?.summary?.payToWin?.pricingEntries ?? [];
  const occupancyQualityScoreByIndex =
    (scenario.payToWin || scenario.subsidizedStarts) && pricingEntries.length
      ? new Map(pricingEntries.map((entry) => {
        const early = Number(entry.postPaymentFullScore);
        const late = Number(entry.latePostPaymentFullScore);
        const score = Number.isFinite(early) && Number.isFinite(late)
          ? (early + late) / 2
          : Number.isFinite(early)
            ? early
            : Number.isFinite(late)
              ? late
              : Number(entry.fullScore);
        return [entry.index, score];
      }))
      : null;

  const focusAnalysis = analyses.find(
    (entry) => entry.index === startIndex
  ) ?? null;

  const context = {
    analyses,
    focusIndex: startIndex,
    nearbyTurnEpisodeByTurn:
      focusAnalysis?.fullCourseTrafficNearbyTurnEpisodeByTurn ?? [],
    flags: getPlayableCheckpoints(
      scenario.checkpoints,
      scenario.virtualBots
    ),
    storedRangedScore: Number(
      analyses.find((entry) => entry.index === startIndex)?.fullCourseTrafficRanged
    ) || 0,
    occupancyQualityScoreByIndex,
    occupancyModel: (scenario.payToWin || scenario.subsidizedStarts)
      ? "start-energy-post-adjustment-common-field"
      : "common-quality-weighted-field"
  };
  byStart.set(startIndex, context);
  return context;
}

export const devAcceptableCandidatePoolBySelectedScenario = new WeakMap();

export function rememberDevAcceptableCandidatePool(selectedScenario, candidates = []) {
  if (!selectedScenario || !Array.isArray(candidates) || !candidates.length) return;
  devAcceptableCandidatePoolBySelectedScenario.set(selectedScenario, candidates.slice());
}

export function getDevAcceptableCandidatePool(selectedScenario) {
  return devAcceptableCandidatePoolBySelectedScenario.get(selectedScenario) ?? [];
}

export const devReplayCacheByScenario = new WeakMap();

export function getScenarioDevReplayCache(scenario) {
  if (!scenario || (typeof scenario !== "object" && typeof scenario !== "function")) {
    return null;
  }
  let cache = devReplayCacheByScenario.get(scenario);
  if (!cache) {
    cache = {
      ledgerByRoute: new WeakMap(),
      cheapShadowByRoute: new WeakMap(),
      damageFoundationByRoute: new WeakMap(),
      reDifficultyShadow: undefined,
      reDifficultyCandidatePoolShadow: undefined,
      lengthOwnerCandidatePoolShadow: undefined
    };
    devReplayCacheByScenario.set(scenario, cache);
  }
  return cache;
}

export function getCachedRouteReplay(cacheMap, route, compute) {
  if (!route || !cacheMap) return compute();
  if (cacheMap.has(route)) return cacheMap.get(route);
  const value = compute();
  cacheMap.set(route, value);
  return value;
}

export function addDevTiming(timing, key, startedAt) {
  if (!timing || !Number.isFinite(startedAt)) return;
  timing[key] = (Number(timing[key]) || 0) + Math.max(0, performance.now() - startedAt);
}

export function formatDevMilliseconds(value) {
  const numeric = Math.max(0, Number(value) || 0);
  if (numeric < 10) return `${numeric.toFixed(1)}ms`;
  if (numeric < 1000) return `${Math.round(numeric)}ms`;
  return `${(numeric / 1000).toFixed(2)}s`;
}
