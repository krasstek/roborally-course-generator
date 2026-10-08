// Robo Rally Course Randomizer - damage pressure in routing: intrinsic damage scores, alternate-route pressure and traffic routing breakdowns
import { getTilePenaltyForFeature } from "../../feature-weights.js";
import { getLedgeSides, hasRampForDir, isWater, tileKey } from "./board-geometry.js";
import { OPPOSITE, REGISTER_COUNT, REGISTER_TEMPO_COST } from "./constants.js";
import {
  DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
  getDamageEconomyActiveFlamethrowerCount
} from "./damage-economy.js";
import { clamp } from "../shared/math.js";
import { getFlamethrowerDamagePenalty } from "./movement.js";
import {
  getRebootDamagePenalty,
  getRebootEndedAbsoluteActions,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";
import { summarizeDamageEconomyFoundationForRoute } from "./route-evaluation.js";
import { isBatteryActive } from "./rule-options.js";
import {
  FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT,
  FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
  getRouteLegIndexForAbsoluteAction,
  getStandardRobotLaserCost,
  getTrafficLegs,
  summarizeSimultaneousRebootPileupClogIncrement
} from "./traffic.js";

// v49ab: exact-route damage scoring replaces only the legacy score attached to
// damage that actually occurred. Counterfactual hazard pressure remains in the
// intrinsic route score: a laser square passed safely, a nearby pit, timed machinery
// fragility, etc. are still useful route-risk signals even when no damage card is
// added. Reboot lost-register/discontinuity costs likewise remain separate.
export function getLegacyRealizedDirectDamageScoreForRoute(tileMap, route, options = {}) {
  if (!tileMap || !route) return 0;
  const legs = Array.isArray(route.legRoutes) && route.legRoutes.length
    ? route.legRoutes
    : [route];
  let score = 0;
  let previousAbsoluteAction = Math.max(0, Number(route?.absoluteStartAction) || 0);

  for (const leg of legs) {
    let elapsedAbsoluteActions = Math.max(
      0,
      Number(leg?.absoluteStartAction) || previousAbsoluteAction
    );
    for (const transition of leg?.transitions || []) {
      const absoluteAction = getTransitionAbsoluteAction(
        transition,
        elapsedAbsoluteActions + 1
      );
      const registerOptions = {
        ...options,
        registerIndex: (Math.max(1, absoluteAction) - 1) % REGISTER_COUNT
      };

      // Active flamethrowers deal one damage on each actual entry/pass-through.
      for (const point of transition?.traversed || []) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const tile = tileMap.get(tileKey(point.x, point.y));
        score += getDamageEconomyActiveFlamethrowerCount(tile, registerOptions) *
          getFlamethrowerDamagePenalty(registerOptions);
      }

      // Ledge direct damage historically entered route.hazard in raw damage units.
      const movementPoints = [transition?.from, ...(transition?.traversed || [])]
        .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
      for (let index = 1; index < movementPoints.length; index += 1) {
        const from = movementPoints[index - 1];
        const to = movementPoints[index];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dir = dx === 1 && dy === 0
          ? "E"
          : dx === -1 && dy === 0
            ? "W"
            : dx === 0 && dy === 1
              ? "S"
              : dx === 0 && dy === -1
                ? "N"
                : null;
        if (!dir) continue;
        const toTile = tileMap.get(tileKey(to.x, to.y));
        if (
          toTile &&
          getLedgeSides(toTile).has(OPPOSITE[dir]) &&
          !hasRampForDir(toTile, OPPOSITE[dir])
        ) {
          score += isWater(toTile) ? 1 : 2;
        }
      }

      if (transition?.rebooted) {
        score += getRebootDamagePenalty(options);
      } else if (!transition?.crashed && transition?.to) {
        const finalTile = tileMap.get(tileKey(transition.to.x, transition.to.y));
        for (const feature of finalTile?.features || []) {
          if (feature.type === "laser") {
            score += Math.max(0, getTilePenaltyForFeature(feature, {
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
            }));
          }
        }
        score += getDamageEconomyActiveFlamethrowerCount(finalTile, registerOptions) *
          getFlamethrowerDamagePenalty(registerOptions);
      }

      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(absoluteAction)
        : absoluteAction;
      previousAbsoluteAction = Math.max(previousAbsoluteAction, elapsedAbsoluteActions);
    }
  }

  return Number(Math.max(0, score).toFixed(3));
}

export function applyIntrinsicDamageEconomyRoutingScore(tileMap, route, options = {}) {
  if (!route || !tileMap) return route;
  if (route.damageRoutingModel === "v49bn-raw-damage-economy-re") return route;

  const legacyScore = Number.isFinite(Number(route.legacyScoreBeforeDamageRouting))
    ? Number(route.legacyScoreBeforeDamageRouting)
    : Number(route.score);
  if (!Number.isFinite(legacyScore)) return route;

  const summary = summarizeDamageEconomyFoundationForRoute(tileMap, route, options, null);

  // v49bn ownership correction:
  // Production route comparison pays the actual expected damage-economy burden
  // (SPAM supply + nonlinear control/clog RE). The 5-RE Shutdown reference is
  // retained only as a counterfactual tolerance/search-worthiness benchmark.
  // No Shutdown is inserted, programmed, or used as a cap/replacement event.
  const rawDamageEconomyRE = Math.max(
    0,
    Number(summary?.totalDamageEconomyRegisterEquivalents) || 0
  );
  const shutdownReferenceRE = Math.max(
    0,
    Number(summary?.shutdownReferenceRegisterEquivalents) ||
      DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE
  );
  const shutdownEquivalentDiagnosticRE = Math.max(
    0,
    Number(summary?.shutdownEquivalentDamageScoreRegisterEquivalents) || 0
  );

  const replacementDamageScore = rawDamageEconomyRE * REGISTER_TEMPO_COST;
  const legacyRealizedDirectDamageScore = getLegacyRealizedDirectDamageScoreForRoute(
    tileMap,
    route,
    options
  );
  const adjustmentScore = replacementDamageScore - legacyRealizedDirectDamageScore;
  const adjustedScore = legacyScore + adjustmentScore;

  route.legacyScoreBeforeDamageRouting = Number(legacyScore.toFixed(2));
  route.intrinsicDamageLegacyRealizedDirectScore = Number(
    legacyRealizedDirectDamageScore.toFixed(3)
  );
  route.intrinsicDamageEconomyRegisterEquivalents = Number(
    rawDamageEconomyRE.toFixed(3)
  );
  route.intrinsicDamageShutdownReferenceRegisterEquivalents = Number(
    shutdownReferenceRE.toFixed(3)
  );
  // Compatibility / diagnostic only. This field no longer owns route cost.
  route.intrinsicDamageShutdownEquivalentRegisterEquivalents = Number(
    shutdownEquivalentDiagnosticRE.toFixed(3)
  );
  route.intrinsicDamageReplacementScore = Number(replacementDamageScore.toFixed(3));
  route.intrinsicDamageRoutingAdjustmentScore = Number(adjustmentScore.toFixed(3));
  route.damageRoutingModel = "v49bn-raw-damage-economy-re";
  route.score = Number(adjustedScore.toFixed(2));
  return route;
}

export function getDamageEconomyAlternatePressureByLeg(
  route,
  summary,
  intrinsicDamageEconomyRE,
  robotLaserIncrementRE
) {
  const legs = getTrafficLegs(route);
  const pressure = legs.map((_, legIndex) => ({
    legIndex,
    deterministicDamageUnits: 0,
    robotLaserExpectedDamageUnits: 0,
    allocatedIntrinsicRegisterEquivalents: 0,
    allocatedRobotLaserRegisterEquivalents: 0,
    shutdownThreatPeakSegmentRegisterEquivalents: 0,
    shutdownEquivalentEpisodeCount: 0,
    pressureRegisterEquivalents: 0
  }));
  if (!pressure.length || !summary) return pressure;

  // v49bn: traffic-alternate pressure must be MARGINAL traffic pressure.
  // Deterministic board damage is still exposed in diagnostics, but it is already
  // owned by intrinsic route scoring and cannot create traffic search demand.
  for (const event of summary.events || []) {
    const legIndex = getRouteLegIndexForAbsoluteAction(
      route,
      event?.absoluteAction
    );
    const entry = pressure[legIndex];
    if (!entry) continue;
    entry.deterministicDamageUnits += Math.max(
      0,
      Number(event?.deterministicDamageUnits) || 0
    );
    entry.robotLaserExpectedDamageUnits += Math.max(
      0,
      Number(event?.robotLaserExpectedDamageUnits) || 0
    );
  }

  const totalRobotLaser = pressure.reduce(
    (sum, entry) => sum + entry.robotLaserExpectedDamageUnits,
    0
  );

  pressure.forEach((entry) => {
    if (totalRobotLaser > 0) {
      entry.allocatedRobotLaserRegisterEquivalents =
        Math.max(0, Number(robotLaserIncrementRE) || 0) *
        entry.robotLaserExpectedDamageUnits / totalRobotLaser;
    }
  });

  return pressure.map((entry) => ({
    ...entry,
    deterministicDamageUnits: Number(entry.deterministicDamageUnits.toFixed(3)),
    robotLaserExpectedDamageUnits: Number(
      entry.robotLaserExpectedDamageUnits.toFixed(3)
    ),
    allocatedIntrinsicRegisterEquivalents: 0,
    allocatedRobotLaserRegisterEquivalents: Number(
      entry.allocatedRobotLaserRegisterEquivalents.toFixed(3)
    ),
    // Intrinsic shutdown-state pressure is deliberately NOT a traffic-demand
    // owner. Keep legacy-shaped fields zero so diagnostics make the separation
    // explicit and downstream code needs no compatibility branch.
    shutdownThreatPeakSegmentRegisterEquivalents: 0,
    shutdownEquivalentEpisodeCount: 0,
    pressureRegisterEquivalents: Number(
      entry.allocatedRobotLaserRegisterEquivalents.toFixed(3)
    )
  }));
}

export function getDamageEconomyAlternateHotspotsByLeg(
  route,
  summary,
  intrinsicDamageEconomyRE,
  robotLaserIncrementRE
) {
  const legs = getTrafficLegs(route);
  const hotspots = legs.map((_, legIndex) => ({ legIndex, registers: [] }));
  if (!hotspots.length || !summary) return hotspots;

  const events = Array.isArray(summary.events) ? summary.events : [];
  const totalRobotLaser = events.reduce(
    (sum, event) => sum +
      Math.max(0, Number(event?.robotLaserExpectedDamageUnits) || 0),
    0
  );
  if (totalRobotLaser <= 0 || robotLaserIncrementRE <= 0) {
    return hotspots;
  }

  const byAbsoluteAction = new Map();
  for (const event of events) {
    const robotLaser = Math.max(
      0,
      Number(event?.robotLaserExpectedDamageUnits) || 0
    );
    if (robotLaser <= 0) continue;

    const absoluteAction = Math.max(
      0,
      Math.floor(Number(event?.absoluteAction) || 0)
    );
    if (!absoluteAction) continue;

    let entry = byAbsoluteAction.get(absoluteAction);
    if (!entry) {
      entry = {
        absoluteAction,
        robotLaserExpectedDamageUnits: 0,
        allocatedRobotLaserRegisterEquivalents: 0
      };
      byAbsoluteAction.set(absoluteAction, entry);
    }
    entry.robotLaserExpectedDamageUnits += robotLaser;
  }

  for (const entry of byAbsoluteAction.values()) {
    entry.allocatedRobotLaserRegisterEquivalents =
      Math.max(0, Number(robotLaserIncrementRE) || 0) *
      entry.robotLaserExpectedDamageUnits / totalRobotLaser;

    const legIndex = getRouteLegIndexForAbsoluteAction(
      route,
      entry.absoluteAction
    );
    const legEntry = hotspots[legIndex];
    if (!legEntry) continue;

    legEntry.registers.push({
      absoluteAction: entry.absoluteAction,
      robotLaserExpectedDamageUnits: Number(
        entry.robotLaserExpectedDamageUnits.toFixed(4)
      ),
      allocatedDamageRegisterEquivalents: Number(
        entry.allocatedRobotLaserRegisterEquivalents.toFixed(4)
      ),
      shutdownStateRegisterEquivalents: 0,
      pressureRegisterEquivalents: Number(
        entry.allocatedRobotLaserRegisterEquivalents.toFixed(4)
      ),
      pressureOwner: "marginal-robot-laser"
    });
  }

  hotspots.forEach((entry) => entry.registers.sort(
    (left, right) => left.absoluteAction - right.absoluteAction
  ));
  return hotspots;
}

export function getDamageEconomyTrafficRoutingBreakdown(
  tileMap,
  route,
  traffic,
  analyses,
  focusIndex,
  flags,
  options = {}
) {
  const legacyTraffic = traffic || { ranged: 0, nearby: 0, competition: 0, total: 0 };
  const intrinsicDamageEconomyRE = Math.max(
    0,
    Number(route?.intrinsicDamageEconomyRegisterEquivalents) || 0
  );
  const intrinsicShutdownReferenceDiagnosticRE = Math.max(
    0,
    Number(route?.intrinsicDamageShutdownEquivalentRegisterEquivalents) || 0
  );
  const trafficContext = {
    analyses: (analyses || []).filter((analysis) => analysis?.fullCourseRoute),
    focusIndex,
    flags: flags || [],
    routeMixtureByIndex: options.trafficRouteMixtureByIndex ?? null,
    occupancyModel: options.trafficRouteMixtureByIndex
      ? "common-quality-weighted-route-mixture-field"
      : "common-quality-weighted-field"
  };
  const summary = summarizeDamageEconomyFoundationForRoute(
    tileMap,
    route,
    options,
    trafficContext
  );
  const fullDamageEconomyRE = Math.max(
    intrinsicDamageEconomyRE,
    Number(summary?.totalDamageEconomyRegisterEquivalents) || 0
  );
  const fullShutdownReferenceDiagnosticRE = Math.max(
    intrinsicShutdownReferenceDiagnosticRE,
    Number(summary?.shutdownEquivalentDamageScoreRegisterEquivalents) || 0
  );
  // Additional robot-laser exposure can never become a routing benefit merely
  // because relief timing makes the nonlinear expected burden numerically dip.
  // v49bn measures marginal RAW damage-economy RE, not hypothetical Shutdown
  // replacement cost.
  const robotLaserIncrementRE = Math.max(
    0,
    fullDamageEconomyRE - intrinsicDamageEconomyRE
  );
  const robotLaserDamageScore = robotLaserIncrementRE * REGISTER_TEMPO_COST;
  const legacyRangedScore = Math.max(0, Number(legacyTraffic.ranged) || 0);
  const legacyNearbyScore = Math.max(0, Number(legacyTraffic.nearby) || 0);
  const legacyTotal = Math.max(0, Number(legacyTraffic.total) || 0);
  const nearbyTurnEpisodeControlRE = Math.max(
    0,
    Number(legacyTraffic.nearbyTurnEpisodeControlRegisterEquivalentsCandidate) || 0
  );
  const nearbyTurnEpisodeControlScore =
    nearbyTurnEpisodeControlRE * REGISTER_TEMPO_COST;
  const simultaneousRebootPileupClog =
    summarizeSimultaneousRebootPileupClogIncrement(
      summary,
      legacyTraffic.simultaneousRebootPileupByTurn || []
    );
  const simultaneousRebootPileupClogRE = Math.max(
    0,
    Number(simultaneousRebootPileupClog.registerEquivalents) || 0
  );
  const simultaneousRebootPileupClogScore =
    simultaneousRebootPileupClogRE * REGISTER_TEMPO_COST;
  const robotLaserExpectedDamageUnits = Math.max(
    0,
    Number(summary?.robotLaserExpectedDamageUnits) || 0
  );

  // v49cc: reuse the same per-register robot-laser hit probabilities already
  // produced by the damage economy as planning-awareness event mass. Consequence
  // remains owned by damage; this is only the probability-weighted need to account
  // for a shot in that register.
  const robotLaserAwarenessByTurnMap = new Map();
  for (const event of summary?.events || []) {
    const probabilities = Array.isArray(event?.robotLaserHitProbabilities)
      ? event.robotLaserHitProbabilities
      : [];
    if (!probabilities.length) continue;
    const noneProbability = probabilities.reduce(
      (product, probability) => (
        product * (1 - clamp(Number(probability) || 0, 0, 1))
      ),
      1
    );
    const anyProbability = clamp(1 - noneProbability, 0, 1);
    if (anyProbability <= 0.0005) continue;
    const absoluteAction = Math.max(
      1,
      Math.floor(Number(event?.absoluteAction) || 1)
    );
    const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
    robotLaserAwarenessByTurnMap.set(
      turn,
      (robotLaserAwarenessByTurnMap.get(turn) || 0) + anyProbability
    );
  }
  const robotLaserAwarenessByTurn = [...robotLaserAwarenessByTurnMap.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([turn, eventMass]) => ({
      turn,
      eventMass: Number(eventMass.toFixed(4))
    }));
  const robotLaserAwarenessEventMass = robotLaserAwarenessByTurn.reduce(
    (sum, entry) => sum + (Number(entry.eventMass) || 0),
    0
  );
  // v49ej: legacy ranged pressure mixed a physical laser proxy with heuristic
  // orientation/persistence threat. Physical consequence is now fully owned by
  // marginal damage-economy RE, while the need to notice/plan around a credible
  // shot is already owned by robot-laser traffic-awareness mental RE. Therefore
  // the residual legacy score gets NO authoritative RE vote. Keep it diagnostic
  // only until later cleanup confirms nothing unique remains.
  const legacyRobotLaserDamageProxyScore = Math.min(
    legacyRangedScore,
    robotLaserExpectedDamageUnits * getStandardRobotLaserCost()
  );
  const legacyResidualRangedThreatScoreDiagnostic = Math.max(
    0,
    legacyRangedScore - legacyRobotLaserDamageProxyScore
  );
  const residualRangedThreatScore = 0;
  const adjustedRangedScore = robotLaserDamageScore;
  const adjustedNearbyScore =
    nearbyTurnEpisodeControlScore + simultaneousRebootPileupClogScore;
  const adjustedTotal = Math.max(
    0,
    legacyTotal
      - legacyRangedScore
      + robotLaserDamageScore
      - legacyNearbyScore
      + adjustedNearbyScore
  );

  // Keep per-leg traffic demand aligned with the authoritative nearby owner.
  // Robot-laser physical damage is nonlinear over the full route and is handled
  // separately by damage-economy pressure/hotspots, so only nearby is replaced
  // here at leg granularity. Simultaneous reboot pile-up is already confidence-
  // and opening-leg-weighted in its event probability; convert back to the
  // unweighted per-leg score here so the common leg weighting is applied once.
  const simultaneousRebootPileupScoreByLeg = new Map();
  for (const entry of simultaneousRebootPileupClog.byTurn || []) {
    const legIndex = Math.max(0, Math.floor(Number(entry?.legIndex) || 0));
    const legWeight = Math.max(0.0001, Number(entry?.legWeight) || 1);
    const unweightedScore = Math.max(0, Number(entry?.clogIncrementScore) || 0) /
      legWeight;
    simultaneousRebootPileupScoreByLeg.set(
      legIndex,
      (simultaneousRebootPileupScoreByLeg.get(legIndex) || 0) + unweightedScore
    );
  }
  const adjustedByLeg = Array.isArray(legacyTraffic.byLeg)
    ? legacyTraffic.byLeg.map((leg, legIndex) => {
        const legacyLegRanged = Math.max(0, Number(leg?.ranged) || 0);
        const legacyLegNearby = Math.max(0, Number(leg?.nearby) || 0);
        const authoritativeLegNearby = Math.max(
          0,
          Number(leg?.nearbyTurnEpisodeControlScoreCandidate) || 0
        ) + Math.max(
          0,
          Number(simultaneousRebootPileupScoreByLeg.get(legIndex)) || 0
        );
        const legacyLegTotal = Math.max(0, Number(leg?.total) || 0);
        return {
          ...leg,
          legacyRanged: Number(legacyLegRanged.toFixed(3)),
          ranged: 0,
          legacyNearby: Number(legacyLegNearby.toFixed(3)),
          nearby: Number(authoritativeLegNearby.toFixed(3)),
          total: Number(
            Math.max(
              0,
              legacyLegTotal - legacyLegRanged - legacyLegNearby + authoritativeLegNearby
            ).toFixed(3)
          ),
          nearbyTurnEpisodeControlAuthoritative: true
        };
      })
    : [];

  let adjustedOpening = 0;
  let adjustedLater = 0;
  adjustedByLeg.forEach((leg, legIndex) => {
    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
    const weighted = (Number(leg?.total) || 0) * legWeight;
    if (legIndex === 0) adjustedOpening += weighted;
    else adjustedLater += weighted;
  });
  const damageEconomyAlternatePressureByLeg =
    getDamageEconomyAlternatePressureByLeg(
      route,
      summary,
      intrinsicDamageEconomyRE,
      robotLaserIncrementRE
    );
  const damageEconomyAlternateHotspotsByLeg = options.includeTrafficAlternateHotspots
    ? getDamageEconomyAlternateHotspotsByLeg(
      route,
      summary,
      intrinsicDamageEconomyRE,
      robotLaserIncrementRE
    )
    : [];

  return {
    ...legacyTraffic,
    legacyRanged: Number(legacyRangedScore.toFixed(3)),
    legacyTotal: Number(legacyTotal.toFixed(3)),
    legacyRobotLaserDamageProxyScore: Number(
      legacyRobotLaserDamageProxyScore.toFixed(3)
    ),
    residualRangedThreatScore: 0,
    legacyResidualRangedThreatScoreDiagnostic: Number(
      legacyResidualRangedThreatScoreDiagnostic.toFixed(3)
    ),
    legacyNearby: Number(legacyNearbyScore.toFixed(3)),
    nearby: Number(adjustedNearbyScore.toFixed(3)),
    nearbyTurnEpisodeControlRegisterEquivalentsAuthoritative: Number(
      nearbyTurnEpisodeControlRE.toFixed(3)
    ),
    nearbyTurnEpisodeControlScoreAuthoritative: Number(
      adjustedNearbyScore.toFixed(3)
    ),
    nearbyTurnEpisodeControlAuthoritative: true,
    simultaneousRebootPileupEventMass: Math.max(
      0,
      Number(legacyTraffic.simultaneousRebootPileupEventMass) || 0
    ),
    simultaneousRebootPileupMaximumTurnProbability: Math.max(
      0,
      Number(legacyTraffic.simultaneousRebootPileupMaximumTurnProbability) || 0
    ),
    simultaneousRebootPileupClogRegisterEquivalents: Number(
      simultaneousRebootPileupClogRE.toFixed(4)
    ),
    simultaneousRebootPileupClogScore: Number(
      simultaneousRebootPileupClogScore.toFixed(3)
    ),
    simultaneousRebootPileupByTurn: simultaneousRebootPileupClog.byTurn || [],
    simultaneousRebootPileupModel:
      "same-turn-same-space-plus1-actual-clog-stacked-v49ei",
    robotLaserAwarenessEventMass: Number(
      robotLaserAwarenessEventMass.toFixed(4)
    ),
    robotLaserAwarenessByTurn,
    ranged: Number(adjustedRangedScore.toFixed(3)),
    total: Number(adjustedTotal.toFixed(3)),
    opening: adjustedByLeg.length
      ? Number(adjustedOpening.toFixed(3))
      : legacyTraffic.opening,
    later: adjustedByLeg.length
      ? Number(adjustedLater.toFixed(3))
      : legacyTraffic.later,
    byLeg: adjustedByLeg.length ? adjustedByLeg : legacyTraffic.byLeg,
    damageEconomyRobotLaserIncrementRegisterEquivalents: Number(
      robotLaserIncrementRE.toFixed(3)
    ),
    damageEconomyRobotLaserIncrementScore: Number(
      robotLaserDamageScore.toFixed(3)
    ),
    damageEconomyIntrinsicRegisterEquivalents: Number(
      intrinsicDamageEconomyRE.toFixed(3)
    ),
    damageEconomyFullRegisterEquivalents: Number(
      fullDamageEconomyRE.toFixed(3)
    ),
    damageEconomyShutdownReferenceRegisterEquivalents: Number(
      DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE.toFixed(3)
    ),
    // Compatibility diagnostic only: no longer route cost.
    damageEconomyFullShutdownEquivalentRegisterEquivalents: Number(
      fullShutdownReferenceDiagnosticRE.toFixed(3)
    ),
    damageEconomyAlternatePressureByLeg,
    damageEconomyAlternateHotspotsByLeg,
    damageEconomyTrafficRoutingActive: true
  };
}
