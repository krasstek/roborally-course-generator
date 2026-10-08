// Robo Rally Course Randomizer - register-equivalent ledger building blocks: mental and planning events, Moving Targets / Hazardous Checkpoints events, search-intrinsic mental replay
import { getActiveVariantMentalEventRules } from "../../variants.js";
import { getPortal, getTeleporter, hasHomingMissile, isWater, tileKey } from "./board-geometry.js";
import { ACTIONS, REGISTER_COUNT, REGISTER_TEMPO_COST } from "./constants.js";
import {
  getDamageEconomyRealizedDamageForTransition,
  isDamageEconomyRepairStationTile
} from "./damage-economy.js";
import { clamp } from "../shared/math.js";
import {
  getRebootEndedAbsoluteActions,
  getRegisterPosition,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";
import {
  HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE,
  HOMING_MISSILE_STRATEGIC_CREDIT_RE,
  HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
  HOMING_MISSILE_TARGET_CHOICE_EVENT_WEIGHT
} from "./traffic.js";

// v49ap observational unified-RE ledger ------------------------------------
// This deliberately does NOT change route search, dominance, candidate order,
// traffic, pruning, fairness or production scoring. It exposes existing
// mechanisms in the common register-equivalent vocabulary so later calibration
// can compare the old scorer, exact mechanism replay and cheap-search shadows.
//
// The planning-event ledger follows the current design discussion:
// - each programmed card is one event;
// - each distinct card/conveyor rotation is another event;
// - an activated board phase is one event (gear is one event total, not gear +
//   rotation); linked portal relocation is represented as portal + reacquisition;
// - checkpoint / Battery / Chop Shop interactions are events even when useful;
// - factual damage can also be a planning event because accepting it is a
//   decision, while damage consequence itself remains owned by card/clog models;
// - expected robot-laser salience may contribute fractional events;
// - v49cc adds one collapsed fractional non-laser traffic-awareness event per
//   game turn, weighted by the already-modeled probability of at least one
//   meaningful nearby control episode. Mechanical severity remains owned by the
//   control/clog curve and does NOT multiply mental load a second time;
// - avoided static constraints are still not inferred from the final route.
export const RE_LEDGER_MODEL_ID = "re-ledger-v7-scenario-rule-tracking-v49es";

// v49as provisional mental-load curve. The rounded count is the authoritative
// input because fractional probabilistic events are intentionally accumulated
// first and only then collapsed at the five-register turn level. Anchors:
// <=7 events => 0 RE; 11 => 0.5 RE; 15 => 2 RE; 19 => 4.5 RE.
// v49ba/v49bb experimented with carrying intrinsic mental history inside the
// hot pathfinder. v49bc keeps the same curve/events but moves mental RE back
// to completed-route replay/reranking; partial-state dominance has no mental
// history dimension.
// Traffic-awareness mental remains downstream because it depends on occupancy.
export function getObservationalMentalRegisterEquivalents(eventCount) {
  const roundedEvents = Math.max(0, Math.round(Number(eventCount) || 0));
  const excess = Math.max(0, roundedEvents - 7);
  return Number(((excess * excess) / 32).toFixed(4));
}

// v49es variant/mechanic memory events. Complexity cost is NOT mental RE. Most
// variants use a once-per-game-turn remember-the-rule trigger: when relevant, one
// planning event is charged regardless of repeated matching features. Moving
// Targets is the deliberate exception: tracking the moving checkpoint position is
// register-relative, so an active moving checkpoint contributes one event per
// relevant programmed register. Critical SPAM/Haywire remain event-free because
// their changed card state is physically apparent.
//
// Current board-laser trigger evidence is conservative: selected-route replay can
// prove an accepted laser exposure. Counterfactual "I avoided this laser because
// Cutting Floor made it dangerous" evidence is not yet retained by route replay,
// so that avoidance side remains an explicit later mental-evidence refinement.
export const MOVING_TARGET_MENTAL_ACTIVE_CACHE = new WeakMap();

export function hasActiveMovingTargetCheckpoint(tileMap) {
  if (!tileMap || typeof tileMap.values !== "function") return false;
  if (MOVING_TARGET_MENTAL_ACTIVE_CACHE.has(tileMap)) {
    return MOVING_TARGET_MENTAL_ACTIVE_CACHE.get(tileMap);
  }
  let active = false;
  for (const tile of tileMap.values()) {
    const features = tile?.features || [];
    const hasCheckpoint = features.some((feature) => feature?.type === "checkpoint");
    const hasBelt = features.some((feature) => feature?.type === "belt");
    if (hasCheckpoint && hasBelt) {
      active = true;
      break;
    }
  }
  MOVING_TARGET_MENTAL_ACTIVE_CACHE.set(tileMap, active);
  return active;
}

export function isHazardousFlagAddedFeature(feature, options = {}) {
  const type = feature?.type;
  if (!type || type === "checkpoint" || type === "wall" || type === "laser") {
    return false;
  }
  if (options.movingTargets && type === "belt") return false;
  return true;
}

export function transitionTouchesHazardousFlagFeature(tileMap, transition, options = {}) {
  if (!tileMap || !transition) return false;
  const points = [
    transition.from,
    ...(Array.isArray(transition.traversed) ? transition.traversed : []),
    transition.to
  ];
  const seen = new Set();
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    const key = tileKey(point.x, point.y);
    if (seen.has(key)) continue;
    seen.add(key);
    const tile = tileMap.get(key);
    const features = tile?.features || [];
    if (!features.some((feature) => feature?.type === "checkpoint")) continue;
    if (features.some((feature) => isHazardousFlagAddedFeature(feature, options))) {
      return true;
    }
  }
  return false;
}

export function getVariantMentalPlanningEventsForTransition(
  options = {},
  damageEvent = null,
  mechanicContext = null
) {
  const seen = mechanicContext?.variantMentalEventIdsThisTurn instanceof Set
    ? mechanicContext.variantMentalEventIdsThisTurn
    : new Set();
  const sourceTypes = new Set(damageEvent?.sourceTypes || []);
  const events = [];
  for (const rule of getActiveVariantMentalEventRules(options)) {
    if (!rule?.variantId) continue;
    const cadence = rule.cadence || "once-per-game-turn";
    if (cadence === "once-per-game-turn" && seen.has(rule.variantId)) continue;

    let applicable = false;
    if (rule.trigger === "board-laser-relevant") {
      applicable = sourceTypes.has("board-laser-hit");
    } else if (rule.trigger === "flaming-oil-relevant") {
      applicable = sourceTypes.has("flaming-oil-hit");
    } else if (rule.trigger === "repair-station-relevant") {
      applicable = Boolean(mechanicContext?.repairStationRelevant);
    } else if (rule.trigger === "repulsor-overdrive-relevant") {
      applicable = Boolean(mechanicContext?.repulsorOverdriveRelevant);
    } else if (rule.trigger === "hazardous-flag-relevant") {
      applicable = Boolean(mechanicContext?.hazardousFlagRelevant);
    } else if (rule.trigger === "moving-target-tracking") {
      applicable = Boolean(mechanicContext?.movingTargetTrackingRelevant);
    } else if (rule.trigger === "walled-in-relevant") {
      applicable = Boolean(mechanicContext?.walledInRelevant);
    }
    if (!applicable) continue;

    if (cadence === "once-per-game-turn") {
      seen.add(rule.variantId);
    }
    events.push({
      type: rule.eventType || `variant-rule:${rule.variantId}`,
      weight: 1,
      detail: {
        variantId: rule.variantId,
        trigger: rule.trigger,
        cadence
      }
    });
  }
  return events;
}

// v49cc traffic-awareness mental ownership.
//
// Mental planning burden and mechanical consequence remain separate:
// - robot-laser damage stays in the damage economy;
// - nearby push/block/displacement consequence stays in turn-episode control RE;
// - traffic awareness contributes only fractional planning-event mass.
//
// Non-laser interactions are collapsed to AT MOST ONE awareness event per game
// turn, with weight equal to the already-computed probability of at least one
// meaningful nearby-control episode. This avoids charging repeatedly for several
// registers of the same congestion episode. Robot-laser awareness remains
// register-local because repeated firing opportunities are distinct things a
// player may need to account for.
//
// The existing mental curve still rounds only after all fractional event mass has
// accumulated within the game turn.
export function summarizeTrafficAwarenessMentalIncrement(
  intrinsicLedger,
  traffic = null
) {
  if (!intrinsicLedger?.turns?.length || !traffic) {
    return {
      incrementRE: 0,
      robotLaserEventMass: 0,
      nonLaserEventMass: 0,
      rebootPileupEventMass: 0,
      totalTrafficEventMass: 0,
      byTurn: []
    };
  }

  const robotLaserByTurn = new Map(
    (traffic.robotLaserAwarenessByTurn || []).map((entry) => [
      Math.max(1, Math.floor(Number(entry?.turn) || 1)),
      Math.max(0, Number(entry?.eventMass) || 0)
    ])
  );
  const nonLaserByTurn = new Map(
    (traffic.nearbyTurnEpisodeByTurn || []).map((entry) => [
      Math.max(1, Math.floor(Number(entry?.turn) || 1)),
      clamp(Number(entry?.eventProbability) || 0, 0, 1)
    ])
  );
  const rebootPileupByTurn = new Map(
    (traffic.simultaneousRebootPileupByTurn || []).map((entry) => [
      Math.max(1, Math.floor(Number(entry?.turn) || 1)),
      clamp(Number(entry?.eventProbability) || 0, 0, 1)
    ])
  );

  let incrementRE = 0;
  let robotLaserEventMass = 0;
  let nonLaserEventMass = 0;
  let rebootPileupEventMass = 0;
  const byTurn = [];

  for (const turn of intrinsicLedger.turns || []) {
    const turnNumber = Math.max(1, Math.floor(Number(turn?.turn) || 1));
    const intrinsicEventMass = (turn?.planningEvents || []).reduce(
      (sum, event) => (
        String(event?.type || "").startsWith("traffic-awareness:")
          ? sum
          : sum + Math.max(0, Number(event?.weight) || 0)
      ),
      0
    );
    const laserMass = Math.max(0, robotLaserByTurn.get(turnNumber) || 0);
    const nonLaserMass = clamp(nonLaserByTurn.get(turnNumber) || 0, 0, 1);
    const rebootPileupMass = clamp(
      rebootPileupByTurn.get(turnNumber) || 0,
      0,
      1
    );
    const trafficEventMass = laserMass + nonLaserMass + rebootPileupMass;

    const intrinsicMentalRE = getObservationalMentalRegisterEquivalents(
      intrinsicEventMass
    );
    const fullMentalRE = getObservationalMentalRegisterEquivalents(
      intrinsicEventMass + trafficEventMass
    );
    const turnIncrementRE = Math.max(0, fullMentalRE - intrinsicMentalRE);

    incrementRE += turnIncrementRE;
    robotLaserEventMass += laserMass;
    nonLaserEventMass += nonLaserMass;
    rebootPileupEventMass += rebootPileupMass;
    byTurn.push({
      turn: turnNumber,
      intrinsicEventMass: Number(intrinsicEventMass.toFixed(4)),
      robotLaserEventMass: Number(laserMass.toFixed(4)),
      nonLaserEventMass: Number(nonLaserMass.toFixed(4)),
      rebootPileupEventMass: Number(rebootPileupMass.toFixed(4)),
      trafficEventMass: Number(trafficEventMass.toFixed(4)),
      intrinsicMentalRE: Number(intrinsicMentalRE.toFixed(4)),
      fullMentalRE: Number(fullMentalRE.toFixed(4)),
      incrementRE: Number(turnIncrementRE.toFixed(4))
    });
  }

  return {
    incrementRE: Number(incrementRE.toFixed(4)),
    robotLaserEventMass: Number(robotLaserEventMass.toFixed(4)),
    nonLaserEventMass: Number(nonLaserEventMass.toFixed(4)),
    rebootPileupEventMass: Number(rebootPileupEventMass.toFixed(4)),
    totalTrafficEventMass: Number((
      robotLaserEventMass + nonLaserEventMass + rebootPileupEventMass
    ).toFixed(4)),
    byTurn
  };
}

export function getRegisterEquivalentLedgerAbsoluteAction(transition, fallback) {
  return getTransitionAbsoluteAction(transition, fallback);
}

export function getRegisterEquivalentLedgerTouchedFeatureEvents(tileMap, transition) {
  const events = [];
  const seen = new Set();
  const points = [
    ...(transition?.traversed || []),
    transition?.to
  ].filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  for (const point of points) {
    const tile = tileMap.get(tileKey(point.x, point.y));
    for (const feature of tile?.features || []) {
      if (feature.type !== "battery" && feature.type !== "chopShop") continue;
      const key = `${feature.type}:${point.x},${point.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        type: feature.type === "battery" ? "battery" : "chop-shop",
        weight: 1,
        at: { x: point.x, y: point.y }
      });
    }
  }
  return events;
}

export function getHomingMissileEntryActivationsForTransition(
  tileMap,
  transition,
  activatedSpacesThisTurn = null
) {
  if (!tileMap || !transition) return [];
  const activated = activatedSpacesThisTurn instanceof Set
    ? activatedSpacesThisTurn
    : new Set();
  const activations = [];
  let prior = transition?.from &&
    Number.isFinite(transition.from.x) && Number.isFinite(transition.from.y)
    ? { x: transition.from.x, y: transition.from.y }
    : null;
  const points = [
    ...(transition?.traversed || []),
    transition?.to
  ].filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));

  for (const point of points) {
    if (prior && prior.x === point.x && prior.y === point.y) {
      prior = { x: point.x, y: point.y };
      continue;
    }
    const tile = tileMap.get(tileKey(point.x, point.y));
    if (hasHomingMissile(tile)) {
      const spaceKey = tileKey(point.x, point.y);
      if (!activated.has(spaceKey)) {
        activated.add(spaceKey);
        activations.push({ x: point.x, y: point.y, spaceKey });
      }
    }
    prior = { x: point.x, y: point.y };
  }
  return activations;
}

export function getRegisterEquivalentLedgerPlanningEventsForTransition(
  tileMap,
  transition,
  damageEvent,
  checkpointHit = false,
  options = {},
  mechanicContext = null
) {
  const events = [];
  const add = (type, weight = 1, detail = null) => {
    const safeWeight = Math.max(0, Number(weight) || 0);
    if (safeWeight <= 0.000001) return;
    events.push({ type, weight: safeWeight, ...(detail ? { detail } : {}) });
  };
  const action = ACTIONS.find((candidate) => candidate.id === transition?.action) ?? null;

  // The card itself is always the baseline planning item.
  add("card");
  if (action?.type === "turn") add("card-rotation");

  const startTile = transition?.from
    ? tileMap.get(tileKey(transition.from.x, transition.from.y))
    : null;
  if (action?.type === "move" && isWater(startTile)) {
    add("water-movement-modifier");
  }

  const conveyorSteps = transition?.conveyorSteps || [];
  const conveyorPhases = new Set(
    conveyorSteps.map((step) => step?.phase || "conveyor").filter(Boolean)
  );
  for (const phase of conveyorPhases) {
    add(`board-phase:${phase}`);
  }
  for (const step of conveyorSteps) {
    if (step?.turned) add("conveyor-rotation");
  }

  // v49ar observational cleanup: merely crossing an inactive conveyor does NOT
  // prove that the conveyor was a salient planning event. The agreed mental model
  // counts such a crossing only when counterfactual/search evidence shows that the
  // conveyor materially constrained the programmed move (for example, Move 2/3 was
  // needed to clear it). A realized route alone cannot establish that, so do not
  // invent an event here. Search-side avoided-constraint evidence can add it later.

  for (const boardEvent of transition?.boardEvents || []) {
    if (boardEvent?.type === "conveyor") continue; // represented by phase above
    if (boardEvent?.type === "gear") {
      add("gear-rotation"); // gear is one thing, not gear + separate rotation
    } else if (boardEvent?.type === "pusher") {
      add("board-phase:pusher");
    } else if (boardEvent?.type === "oil") {
      add("board-phase:oil");
    }
  }

  const jumpPoints = (transition?.traversed || []).filter((point) => point?.jump);
  if (jumpPoints.length) {
    const startHasTeleporter = Boolean(getTeleporter(startTile));
    const destinationTile = transition?.to
      ? tileMap.get(tileKey(transition.to.x, transition.to.y))
      : null;
    const destinationHasPortal = Boolean(getPortal(destinationTile));
    if (startHasTeleporter) {
      add("teleporter");
    } else if (destinationHasPortal) {
      add("portal");
      add("portal-linked-reacquisition");
    } else {
      add("discontinuous-movement");
    }
  }

  // v49fh: Randomizer uncertainty is owned by the authoritative turn-level
  // control-clog economy (+2 clog at register start). Do not also add a generic
  // mental event here; that would double-price the same loss of control.

  for (const featureEvent of getRegisterEquivalentLedgerTouchedFeatureEvents(
    tileMap,
    transition
  )) {
    events.push(featureEvent);
  }

  // v49ei: entering a Homing Missile space creates one target-choice/planning
  // event per missile space per game turn. Re-entry into the same missile space
  // later in that turn cannot fire it again and therefore adds neither mental
  // burden nor strategic credit. The caller owns the per-turn activation set.
  const homingActivations = getHomingMissileEntryActivationsForTransition(
    tileMap,
    transition,
    mechanicContext?.homingMissileActivatedSpacesThisTurn
  );
  for (const activation of homingActivations) {
    add(
      "homing-missile-target-choice",
      HOMING_MISSILE_TARGET_CHOICE_EVENT_WEIGHT,
      { at: { x: activation.x, y: activation.y } }
    );
  }

  if (checkpointHit) add("checkpoint");

  const sourceTypes = new Set(damageEvent?.sourceTypes || []);
  if (sourceTypes.has("board-laser-hit")) add("accepted-hazard:board-laser");
  if (sourceTypes.has("radiation-hit")) add("accepted-hazard:radiation");
  if (sourceTypes.has("radioactive-waste-hit")) add("accepted-hazard:radioactive-waste");
  if (sourceTypes.has("ledge-damage")) add("accepted-hazard:ledge");

  // Flamethrower planning is a true/false remember-the-mechanic event at the
  // game-turn level. Entry and end-of-register damage remain mechanically
  // separate, but one or many relevant flamer contacts in the same turn add only
  // one mental event.
  const turnMentalEventIds = mechanicContext?.variantMentalEventIdsThisTurn instanceof Set
    ? mechanicContext.variantMentalEventIdsThisTurn
    : new Set();
  const flamethrowerMentalId = "__mechanic:flamethrower";
  if (sourceTypes.has("flamethrower-hit") && !turnMentalEventIds.has(flamethrowerMentalId)) {
    turnMentalEventIds.add(flamethrowerMentalId);
    add("mechanic:flamethrower", 1, { cadence: "once-per-game-turn" });
  }

  // Robot laser damage is already probabilistic. Its damage consequence is owned
  // by the damage model; here only the mental salience is represented, and only
  // fractionally. Independent cardinal-direction hit probabilities are combined
  // into the chance that at least one robot-laser hit matters this register.
  const robotProbabilities = Array.isArray(damageEvent?.robotLaserHitProbabilities)
    ? damageEvent.robotLaserHitProbabilities
    : [];
  if (robotProbabilities.length) {
    const noneProbability = robotProbabilities.reduce(
      (product, probability) => product * (1 - clamp(Number(probability) || 0, 0, 1)),
      1
    );
    const anyProbability = clamp(1 - noneProbability, 0, 1);
    if (anyProbability > 0.0005) {
      add("traffic-awareness:robot-laser", anyProbability);
    }
  }

  const registerPosition = Math.max(
    1,
    Math.min(REGISTER_COUNT, Math.floor(Number(mechanicContext?.registerPosition) || 1))
  );
  const finalTile = transition?.to
    ? tileMap.get(tileKey(transition.to.x, transition.to.y))
    : null;
  const repairStationRelevant = Boolean(
    options.repairStations &&
    registerPosition === REGISTER_COUNT &&
    !transition?.rebooted &&
    !transition?.crashed &&
    isDamageEconomyRepairStationTile(finalTile)
  );
  const repulsorOverdriveRelevant = Boolean(
    options.repulsorOverdrive && transition?.repulsed
  );
  const hazardousFlagRelevant = Boolean(
    options.hazardousFlags &&
    transitionTouchesHazardousFlagFeature(tileMap, transition, options)
  );
  const movingTargetTrackingRelevant = Boolean(
    options.movingTargets && hasActiveMovingTargetCheckpoint(tileMap)
  );
  const walledInRelevant = Boolean(
    options.lessDeadlyGame && transition?.walledInRelevant
  );
  events.push(...getVariantMentalPlanningEventsForTransition(
    options,
    damageEvent,
    {
      ...(mechanicContext || {}),
      repairStationRelevant,
      repulsorOverdriveRelevant,
      hazardousFlagRelevant,
      movingTargetTrackingRelevant,
      walledInRelevant
    }
  ));

  return events;
}

// v49bc completed-route intrinsic mental scoring --------------------------
// The five-register turn remains the cognitive accumulation unit, but mental
// event history is deliberately NOT part of partial pathfinder state. The
// cheap pathfinder finds plausible route candidates; each completed candidate
// is replayed once and receives intrinsic mental RE before candidate ranking.
// Traffic-awareness mental remains downstream because it depends on occupancy.
export function getSearchIntrinsicMentalTransitionStep(
  tileMap,
  transition,
  absoluteAction,
  currentEventCount,
  checkpointHit = false,
  options = {},
  mechanicContext = null
) {
  const safeAbsoluteAction = Math.max(1, Math.floor(Number(absoluteAction) || 1));
  const damageEvent = getDamageEconomyRealizedDamageForTransition(
    tileMap,
    transition,
    options,
    safeAbsoluteAction
  );
  const events = getRegisterEquivalentLedgerPlanningEventsForTransition(
    tileMap,
    transition,
    damageEvent,
    checkpointHit,
    options,
    {
      ...(mechanicContext || {}),
      registerPosition: getRegisterPosition(safeAbsoluteAction)
    }
  ).filter((event) => !String(event?.type || '').startsWith('traffic-awareness:'));
  const eventWeight = events.reduce(
    (sum, event) => sum + Math.max(0, Number(event?.weight) || 0),
    0
  );
  const beforeCount = Math.max(0, Number(currentEventCount) || 0);
  const afterCount = beforeCount + eventWeight;
  const beforeRE = getObservationalMentalRegisterEquivalents(beforeCount);
  const afterRE = getObservationalMentalRegisterEquivalents(afterCount);
  const deltaRE = Math.max(0, afterRE - beforeRE);
  const closesTurn = Boolean(transition?.rebooted) ||
    getRegisterPosition(safeAbsoluteAction) === REGISTER_COUNT;
  return {
    eventWeight: Number(eventWeight.toFixed(4)),
    beforeCount: Number(beforeCount.toFixed(4)),
    afterCount: Number(afterCount.toFixed(4)),
    deltaRE: Number(deltaRE.toFixed(4)),
    score: Number((deltaRE * REGISTER_TEMPO_COST).toFixed(4)),
    nextEventCount: closesTurn ? 0 : Number(afterCount.toFixed(4)),
    closesTurn,
    events
  };
}

export function replaySearchIntrinsicMentalForContext(
  tileMap,
  route,
  context = {},
  options = {},
  checkpointAtEnd = true
) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  let eventCount = Math.max(
    0,
    Number(context?.searchIntrinsicMentalEventCountCurrentTurn) || 0
  );
  const eventCountStart = eventCount;
  let elapsedAbsoluteActions = Math.max(
    0,
    Number(context?.absoluteActions ?? route?.absoluteStartAction) || 0
  );
  let totalRE = 0;
  let totalScore = 0;
  let totalEvents = 0;
  let homingMissileActivationCount = 0;
  const homingMissileActivatedSpacesThisTurn = new Set(
    Array.isArray(context?.searchHomingMissileActivatedSpacesCurrentTurn)
      ? context.searchHomingMissileActivatedSpacesCurrentTurn
      : []
  );
  const variantMentalEventIdsThisTurn = new Set(
    Array.isArray(context?.searchVariantMentalEventIdsCurrentTurn)
      ? context.searchVariantMentalEventIdsCurrentTurn
      : []
  );
  let activeTurnNumber = elapsedAbsoluteActions > 0
    ? Math.floor((elapsedAbsoluteActions - 1) / REGISTER_COUNT) + 1
    : 1;

  transitions.forEach((transition, index) => {
    const absoluteAction = getRegisterEquivalentLedgerAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    const turnNumber = Math.floor((Math.max(1, absoluteAction) - 1) / REGISTER_COUNT) + 1;
    if (turnNumber !== activeTurnNumber) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
      activeTurnNumber = turnNumber;
    }
    const step = getSearchIntrinsicMentalTransitionStep(
      tileMap,
      transition,
      absoluteAction,
      eventCount,
      checkpointAtEnd && index === transitions.length - 1,
      options,
      {
        homingMissileActivatedSpacesThisTurn,
        variantMentalEventIdsThisTurn
      }
    );
    eventCount = step.nextEventCount;
    totalRE += step.deltaRE;
    totalScore += step.score;
    totalEvents += step.eventWeight;
    homingMissileActivationCount += (step.events || []).filter(
      (event) => event?.type === "homing-missile-target-choice"
    ).length;
    if (step.closesTurn) {
      homingMissileActivatedSpacesThisTurn.clear();
    }
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(absoluteAction)
      : absoluteAction;
  });

  const homingMissileStrategicCreditRE =
    homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE;
  const homingMissileStrategicCreditScore =
    homingMissileStrategicCreditRE * REGISTER_TEMPO_COST;

  return {
    searchIntrinsicMentalRegisterEquivalents: Number(totalRE.toFixed(4)),
    searchIntrinsicMentalScore: Number(totalScore.toFixed(2)),
    searchIntrinsicMentalEventWeight: Number(totalEvents.toFixed(4)),
    searchIntrinsicMentalEventCountStart: Number(eventCountStart.toFixed(4)),
    searchIntrinsicMentalEventCountEnd: Number(eventCount.toFixed(4)),
    searchIntrinsicMentalEventCountCurrentTurn: Number(eventCount.toFixed(4)),
    searchHomingMissileActivatedSpacesCurrentTurn:
      [...homingMissileActivatedSpacesThisTurn],
    searchVariantMentalEventIdsCurrentTurn:
      [...variantMentalEventIdsThisTurn],
    homingMissileActivationCount,
    homingMissileStrategicCreditRE: Number(homingMissileStrategicCreditRE.toFixed(4)),
    homingMissileStrategicCreditScore: Number(homingMissileStrategicCreditScore.toFixed(2)),
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    searchIntrinsicMentalModel: 'rounded-turn-events-quadratic-after-7-v49bc-postbuild'
  };
}

export function getCompletedRoutePostbuildScoreAdjustment(routeLike = {}) {
  return (Number(routeLike.searchIntrinsicMentalScore) || 0) -
    (Number(routeLike.homingMissileStrategicCreditScore) || 0);
}
