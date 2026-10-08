// Robo Rally Course Randomizer - RE diagnostics: card-demand summaries by turn and the cheap-search RE shadow comparison
import { REGISTER_COUNT, REGISTER_TEMPO_COST } from "./constants.js";
import {
  ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT,
  advanceEstimatedCardForecastFrontier,
  closeCompactProgramCardStateForEndedTurn,
  closeEstimatedCardForecastFrontierForEndedTurn,
  getCompactProgramCardOptions,
  getCompactProgramCardStateCode,
  getExactProgramAvailabilityPenalty
} from "./program-availability.js";
import {
  closeEstimatedProgramDemandForEndedTurn,
  getEstimatedProgramDemandStep
} from "./program-demand.js";
import { getObservationalMentalRegisterEquivalents } from "./re-ledger.js";
import { getRebootEndedAbsoluteActions } from "./reboot-recovery.js";
import { summarizeRegisterEquivalentLedger } from "./route-evaluation.js";
import {
  evaluateProgramAction,
  getProgramHistoryWindow,
  getRollingProgramResourceContext
} from "./program-availability.js";

export function summarizeEstimatedProgramDemandByTurn(
  actionIds,
  absoluteActions = 0,
  options = {},
  transitions = []
) {
  let previousDemandCode = 0;
  let demandCode = 0;
  let previousAgainUsed = 0;
  let currentAgainUsed = 0;
  let previousActionId = null;
  let workingAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const turnScores = new Map();
  let totalPenalty = 0;

  for (let index = 0; index < (actionIds || []).length; index += 1) {
    const actionId = actionIds[index];
    let step = getEstimatedProgramDemandStep(
      previousDemandCode,
      demandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId,
      workingAbsoluteActions,
      actionId,
      options
    );
    if (!step) continue;

    totalPenalty += Number(step.penalty) || 0;
    const executedAbsoluteAction = workingAbsoluteActions + 1;
    const turnNumber = Math.floor((Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT) + 1;
    turnScores.set(
      turnNumber,
      (turnScores.get(turnNumber) || 0) + (Number(step.penalty) || 0)
    );

    const rebooted = Boolean(transitions?.[index]?.rebooted);
    if (rebooted) step = closeEstimatedProgramDemandForEndedTurn(step, options);
    previousDemandCode = step.previousDemandCode;
    demandCode = step.demandCode;
    previousAgainUsed = step.previousAgainUsed;
    currentAgainUsed = step.currentAgainUsed;
    previousActionId = step.previousActionId;
    workingAbsoluteActions = rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  return {
    totalRE: Number((Math.max(0, totalPenalty) / REGISTER_TEMPO_COST).toFixed(4)),
    turns: [...turnScores.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([turn, score]) => ({
        turn,
        cheapCardRE: Number((Math.max(0, Number(score) || 0) / REGISTER_TEMPO_COST).toFixed(4))
      }))
  };
}


export function summarizeEstimatedProgramFrontierByTurn(
  actionIds,
  absoluteActions = 0,
  options = {},
  transitions = []
) {
  let frontier = [{
    state: {
      feasible: true,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    },
    penalty: 0
  }];
  let workingAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const cumulativePenaltyByTurn = new Map();
  let feasible = true;

  for (let index = 0; index < (actionIds || []).length; index += 1) {
    const actionId = actionIds[index];
    const next = advanceEstimatedCardForecastFrontier(
      frontier,
      workingAbsoluteActions,
      actionId,
      options
    );
    if (!next.feasible) {
      feasible = false;
      break;
    }

    const executedAbsoluteAction = workingAbsoluteActions + 1;
    const turnNumber = Math.floor(
      (Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT
    ) + 1;
    const rebooted = Boolean(transitions?.[index]?.rebooted);
    frontier = rebooted
      ? closeEstimatedCardForecastFrontierForEndedTurn(next.frontier, options)
      : next.frontier;
    workingAbsoluteActions = rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;

    const closesTurn = rebooted || workingAbsoluteActions % REGISTER_COUNT === 0;
    const isLastAction = index === (actionIds || []).length - 1;
    if (closesTurn || isLastAction) {
      const bestPenalty = frontier.reduce(
        (best, entry) => Math.min(best, Math.max(0, Number(entry?.penalty) || 0)),
        Infinity
      );
      if (Number.isFinite(bestPenalty)) {
        cumulativePenaltyByTurn.set(turnNumber, bestPenalty);
      }
    }
  }

  const turns = [];
  let priorCumulativePenalty = 0;
  for (const [turn, cumulativePenalty] of [...cumulativePenaltyByTurn.entries()]
    .sort((left, right) => left[0] - right[0])) {
    const turnPenalty = Math.max(0, cumulativePenalty - priorCumulativePenalty);
    turns.push({
      turn,
      frontierCardRE: Number((turnPenalty / REGISTER_TEMPO_COST).toFixed(4))
    });
    priorCumulativePenalty = cumulativePenalty;
  }

  const finalPenalty = [...cumulativePenaltyByTurn.values()].at(-1) ?? 0;
  return {
    feasible,
    totalRE: Number((Math.max(0, Number(finalPenalty) || 0) / REGISTER_TEMPO_COST).toFixed(4)),
    turns,
    retainedStates: frontier.length
  };
}


export function summarizeEstimatedProgramUnionFrontierByTurn(
  actionIds,
  absoluteActions = 0,
  options = {},
  transitions = []
) {
  let frontier = [{
    state: {
      feasible: true,
      previousCode: 0,
      currentCode: 0,
      previousActionId: null
    },
    penalty: 0
  }];
  let workingAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  let currentTurnActions = [];
  const cumulativePenaltyByTurn = new Map();
  let feasible = true;

  for (let index = 0; index < (actionIds || []).length; index += 1) {
    const actionId = actionIds[index];
    const nextTurnActions = [...currentTurnActions, actionId];
    const rebooted = Boolean(transitions?.[index]?.rebooted);
    const nextByState = new Map();

    for (const entry of frontier) {
      const previousCode = Math.max(
        0,
        Math.floor(Number(entry?.state?.previousCode) || 0)
      );
      const beforePenalty = getExactProgramAvailabilityPenalty(
        previousCode,
        currentTurnActions,
        options
      );
      const afterPenalty = getExactProgramAvailabilityPenalty(
        previousCode,
        nextTurnActions,
        options
      );
      if (!Number.isFinite(afterPenalty) || !Number.isFinite(beforePenalty)) continue;
      const unionDelta = Math.max(0, afterPenalty - beforePenalty);
      const cardOptions = getCompactProgramCardOptions(
        entry.state,
        workingAbsoluteActions,
        actionId,
        options
      );

      for (const cardOption of cardOptions) {
        const nextState = rebooted
          ? closeCompactProgramCardStateForEndedTurn(cardOption.state, options)
          : cardOption.state;
        if (!nextState || nextState.feasible === false) continue;
        const penalty = Math.max(0, Number(entry.penalty) || 0) + unionDelta;
        const key = getCompactProgramCardStateCode(nextState);
        const prior = nextByState.get(key);
        if (!prior || penalty + 0.001 < prior.penalty) {
          nextByState.set(key, { state: nextState, penalty });
        }
      }
    }

    frontier = [...nextByState.values()]
      .sort((left, right) => left.penalty - right.penalty)
      .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
    if (!frontier.length) {
      feasible = false;
      break;
    }

    const executedAbsoluteAction = workingAbsoluteActions + 1;
    const turnNumber = Math.floor(
      (Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT
    ) + 1;
    workingAbsoluteActions = rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    const closesTurn = rebooted || workingAbsoluteActions % REGISTER_COUNT === 0;
    const isLastAction = index === (actionIds || []).length - 1;
    currentTurnActions = closesTurn ? [] : nextTurnActions;

    if (closesTurn || isLastAction) {
      const bestPenalty = frontier.reduce(
        (best, entry) => Math.min(best, Math.max(0, Number(entry?.penalty) || 0)),
        Infinity
      );
      if (Number.isFinite(bestPenalty)) {
        cumulativePenaltyByTurn.set(turnNumber, bestPenalty);
      }
    }
  }

  const turns = [];
  let priorCumulativePenalty = 0;
  for (const [turn, cumulativePenalty] of [...cumulativePenaltyByTurn.entries()]
    .sort((left, right) => left[0] - right[0])) {
    const turnPenalty = Math.max(0, cumulativePenalty - priorCumulativePenalty);
    turns.push({
      turn,
      unionFrontierCardRE: Number((turnPenalty / REGISTER_TEMPO_COST).toFixed(4))
    });
    priorCumulativePenalty = cumulativePenalty;
  }

  const finalPenalty = [...cumulativePenaltyByTurn.values()].at(-1) ?? 0;
  return {
    feasible,
    totalRE: Number((
      Math.max(0, Number(finalPenalty) || 0) / REGISTER_TEMPO_COST
    ).toFixed(4)),
    turns,
    retainedStates: frontier.length
  };
}

// v49aw: observational cheap-search RE shadow with greedy, literal-frontier,
// and bounded exact-within-turn-union frontier comparators. This deliberately replays only
// mechanisms the hot search already has (or could carry with negligible state):
// literal-hypergeometric card demand, flattened Energy, programmed/lost registers,
// and intrinsic planning events. Production damage/clog remains authoritative and
// is reported as a deferred layer rather than approximated a second time here.
export function summarizeCheapSearchRegisterEquivalentShadow(
  tileMap,
  route,
  options = {},
  trafficContext = null,
  precomputedLedger = null
) {
  if (!tileMap || !route) return null;
  // v49ce Dev performance cleanup: deep diagnostics already build the
  // authoritative ledger before asking for this shadow. Reuse that result
  // instead of replaying the whole route a second time merely for logging.
  const ledger = precomputedLedger ?? summarizeRegisterEquivalentLedger(
    tileMap,
    route,
    options,
    trafficContext
  );
  if (!ledger) return null;

  const actions = Array.isArray(route.actionHistory)
    ? route.actionHistory
    : Array.isArray(route.localActionIds)
      ? route.localActionIds
      : (route.transitions || []).map((transition) => transition?.action).filter(Boolean);
  const cheapCardByTurn = actions.length
    ? summarizeEstimatedProgramDemandByTurn(
      actions,
      Math.max(0, Number(route.absoluteStartAction) || 0),
      options,
      route.transitions || []
    )
    : { totalRE: 0, turns: [] };
  const cheapCardFrontierByTurn = actions.length
    ? summarizeEstimatedProgramFrontierByTurn(
      actions,
      Math.max(0, Number(route.absoluteStartAction) || 0),
      options,
      route.transitions || []
    )
    : { feasible: true, totalRE: 0, turns: [], retainedStates: 0 };
  const cheapCardUnionFrontierByTurn = actions.length
    ? summarizeEstimatedProgramUnionFrontierByTurn(
      actions,
      Math.max(0, Number(route.absoluteStartAction) || 0),
      options,
      route.transitions || []
    )
    : { feasible: true, totalRE: 0, turns: [], retainedStates: 0 };
  const cheapCardRE = Math.max(0, Number(cheapCardByTurn.totalRE) || 0);
  const frontierCardRE = Math.max(
    0,
    Number(cheapCardFrontierByTurn.totalRE) || 0
  );
  const unionFrontierCardRE = Math.max(
    0,
    Number(cheapCardUnionFrontierByTurn.totalRE) || 0
  );

  let cheapIntrinsicMentalRE = 0;
  let fullMentalRE = 0;
  for (const turn of ledger.turns || []) {
    const intrinsicRawCount = (turn.planningEvents || []).reduce((sum, event) => {
      if (String(event?.type || '').startsWith('traffic-awareness:')) return sum;
      return sum + Math.max(0, Number(event?.weight) || 0);
    }, 0);
    const intrinsicRoundedCount = Math.max(0, Math.round(intrinsicRawCount));
    cheapIntrinsicMentalRE += getObservationalMentalRegisterEquivalents(
      intrinsicRoundedCount
    );
    fullMentalRE += Math.max(0, Number(turn.mentalRegisterEquivalents) || 0);
  }
  cheapIntrinsicMentalRE = Number(cheapIntrinsicMentalRE.toFixed(4));
  fullMentalRE = Number(fullMentalRE.toFixed(4));

  const registerRE = Math.max(0, Number(ledger.programmedRegisterRE) || 0);
  const lostRegisterTempoRE = Math.max(0, Number(ledger.lostRegisterTempoRE) || 0);
  const energyRE = Number(ledger.energyRE) || 0;
  const exactCleanCardRE = Math.max(0, Number(ledger.cleanCardPlausibilityRE) || 0);
  const deferredDamageSupplyRE = Math.max(0, Number(ledger.damageCardSupplyRE) || 0);
  const deferredClogRE = Math.max(0, Number(ledger.clogRE) || 0);
  const trafficMentalIncrementRE = Number(Math.max(
    0,
    fullMentalRE - cheapIntrinsicMentalRE
  ).toFixed(4));
  const legacyGreedyCoreRE = Number((
    registerRE +
    lostRegisterTempoRE +
    cheapCardRE +
    energyRE +
    cheapIntrinsicMentalRE
  ).toFixed(4));
  const routedUnionCoreRE = Number((
    registerRE +
    lostRegisterTempoRE +
    unionFrontierCardRE +
    energyRE +
    cheapIntrinsicMentalRE
  ).toFixed(4));
  const exactComparableCoreRE = Number((
    registerRE +
    lostRegisterTempoRE +
    exactCleanCardRE +
    energyRE +
    cheapIntrinsicMentalRE
  ).toFixed(4));

  const exactCardByTurn = new Map(
    (ledger.turns || []).map((turn) => [
      Number(turn.turn),
      Math.max(0, Number(turn.cleanCardPlausibilityRE) || 0)
    ])
  );
  const cheapCardTurnComparison = (cheapCardByTurn.turns || []).map((turn) => {
    const exactTurnRE = exactCardByTurn.get(Number(turn.turn)) || 0;
    return {
      turn: Number(turn.turn),
      cheapCardRE: Number((Number(turn.cheapCardRE) || 0).toFixed(4)),
      exactCardRE: Number(exactTurnRE.toFixed(4)),
      deltaRE: Number(((Number(turn.cheapCardRE) || 0) - exactTurnRE).toFixed(4))
    };
  });
  const maxAbsCardTurnDeltaRE = cheapCardTurnComparison.reduce(
    (maxDelta, turn) => Math.max(maxDelta, Math.abs(Number(turn.deltaRE) || 0)),
    0
  );
  const frontierCardTurnComparison = (cheapCardFrontierByTurn.turns || []).map((turn) => {
    const exactTurnRE = exactCardByTurn.get(Number(turn.turn)) || 0;
    return {
      turn: Number(turn.turn),
      frontierCardRE: Number((Number(turn.frontierCardRE) || 0).toFixed(4)),
      exactCardRE: Number(exactTurnRE.toFixed(4)),
      deltaRE: Number(((Number(turn.frontierCardRE) || 0) - exactTurnRE).toFixed(4))
    };
  });
  const maxAbsFrontierCardTurnDeltaRE = frontierCardTurnComparison.reduce(
    (maxDelta, turn) => Math.max(maxDelta, Math.abs(Number(turn.deltaRE) || 0)),
    0
  );
  const unionFrontierCardTurnComparison = (cheapCardUnionFrontierByTurn.turns || []).map((turn) => {
    const exactTurnRE = exactCardByTurn.get(Number(turn.turn)) || 0;
    return {
      turn: Number(turn.turn),
      unionFrontierCardRE: Number((Number(turn.unionFrontierCardRE) || 0).toFixed(4)),
      exactCardRE: Number(exactTurnRE.toFixed(4)),
      deltaRE: Number(((Number(turn.unionFrontierCardRE) || 0) - exactTurnRE).toFixed(4))
    };
  });
  const maxAbsUnionFrontierCardTurnDeltaRE = unionFrontierCardTurnComparison.reduce(
    (maxDelta, turn) => Math.max(maxDelta, Math.abs(Number(turn.deltaRE) || 0)),
    0
  );

  return {
    method: 'cheap-re-shadow-v1-card-routing-active',
    observationalOnly: false,
    affectsRouting: true,
    routingActiveComponents: ['card'],
    registerRE,
    lostRegisterTempoRE,
    cheapCardRE: Number(cheapCardRE.toFixed(4)),
    frontierCardRE: Number(frontierCardRE.toFixed(4)),
    unionFrontierCardRE: Number(unionFrontierCardRE.toFixed(4)),
    exactCleanCardRE: Number(exactCleanCardRE.toFixed(4)),
    cardDeltaRE: Number((cheapCardRE - exactCleanCardRE).toFixed(4)),
    frontierCardDeltaRE: Number((frontierCardRE - exactCleanCardRE).toFixed(4)),
    unionFrontierCardDeltaRE: Number((unionFrontierCardRE - exactCleanCardRE).toFixed(4)),
    cheapCardTurnComparison,
    maxAbsCardTurnDeltaRE: Number(maxAbsCardTurnDeltaRE.toFixed(4)),
    frontierCardTurnComparison,
    maxAbsFrontierCardTurnDeltaRE: Number(maxAbsFrontierCardTurnDeltaRE.toFixed(4)),
    unionFrontierCardTurnComparison,
    maxAbsUnionFrontierCardTurnDeltaRE: Number(maxAbsUnionFrontierCardTurnDeltaRE.toFixed(4)),
    frontierCardFeasible: cheapCardFrontierByTurn.feasible !== false,
    frontierCardRetainedStates: Math.max(
      0,
      Number(cheapCardFrontierByTurn.retainedStates) || 0
    ),
    unionFrontierCardFeasible: cheapCardUnionFrontierByTurn.feasible !== false,
    unionFrontierCardRetainedStates: Math.max(
      0,
      Number(cheapCardUnionFrontierByTurn.retainedStates) || 0
    ),
    energyRE: Number(energyRE.toFixed(4)),
    cheapIntrinsicMentalRE,
    fullMentalRE,
    trafficMentalIncrementRE,
    deferredDamageSupplyRE: Number(deferredDamageSupplyRE.toFixed(4)),
    deferredClogRE: Number(deferredClogRE.toFixed(4)),
    cheapCoreRE: legacyGreedyCoreRE,
    legacyGreedyCoreRE,
    routedUnionCoreRE,
    exactComparableCoreRE,
    comparableCoreDeltaRE: Number(
      (routedUnionCoreRE - exactComparableCoreRE).toFixed(4)
    ),
    fullObservationalRE: Number(
      (Number(ledger.observationalSubtotalWithMentalRE) || 0).toFixed(4)
    )
  };
}

export const PATHFINDER_OBJECTIVE_AUDIT_ID =
  "pathfinder-objective-v49bf-movement-reboot-ownership";

export function summarizePathfinderObjectiveAudit() {
  return {
    id: PATHFINDER_OBJECTIVE_AUDIT_ID,
    registerTempoScore: REGISTER_TEMPO_COST,
    programmedActionTypePremiumsActive: false,
    reverseSurchargeActive: false,
    heavyMoveSurchargeActive: false,
    cardPlausibilityActive: true,
    energyGuidanceActive: true,
    hazardGuidanceActive: true,
    rebootGuidanceActive: true,
    rebootLostRegisterTempoActive: true,
    rebootDiscontinuityPremiumActive: false,
    conveyorComplexityGuidanceActive: false,
    genericGearHazardPremiumActive: false,
    weightedMovementGuidanceActive: false,
    directionalDistanceQueueHeuristicActive: true,
    movementTelemetryRetained: true,
    note: "One programmed card = one register. Raw travelled-space premiums are off; distance remains telemetry and Manhattan distance remains queue-order guidance only. Reboots retain factual skipped-register tempo and hazard/damage guidance, but the legacy fixed discontinuity surcharge is off."
  };
}

// Power Up is WAIT in the route action vocabulary. Its card scarcity follows the
// same one-copy rule as every other unique program card; any strategic benefit
// from charging Energy belongs to the separate Energy-economy model.
export function summarizePowerUpProgramFeasibility(history, absoluteActions) {
  const base = getRollingProgramResourceContext(history, absoluteActions);
  const powerUp = evaluateProgramAction(history, absoluteActions, "WAIT");
  const phase = ((Number(absoluteActions) || 0) % REGISTER_COUNT + REGISTER_COUNT) % REGISTER_COUNT;
  const nextRegister = phase + 1;
  const againFitsSameProgram = nextRegister < REGISTER_COUNT;

  let powerUpAgain = { feasible: false, penalty: Infinity };
  if (powerUp.feasible && againFitsSameProgram) {
    const afterPowerUpHistory = getProgramHistoryWindow([
      ...(history || []),
      "WAIT"
    ]);
    const second = evaluateProgramAction(
      afterPowerUpHistory,
      Number(absoluteActions || 0) + 1,
      "WAIT"
    );
    powerUpAgain = {
      feasible: second.feasible,
      penalty: Number((powerUp.penalty + (second.feasible ? second.penalty : 0)).toFixed(2))
    };
  }

  return {
    registerPhase: phase,
    nextRegister,
    currentTurnActions: [...base.currentTurnActions],
    currentProgramFeasible: base.feasible,
    currentProgramRequiresAgain: base.currentRequiresAgain,
    powerUp: {
      feasible: powerUp.feasible,
      reason: powerUp.feasible
        ? null
        : "Power Up is unavailable under the rolling previous-turn card supply"
    },
    powerUpAgain: {
      feasible: powerUpAgain.feasible,
      reason: powerUpAgain.feasible
        ? null
        : !againFitsSameProgram
          ? "Again would be register 1 next turn"
          : "Power Up + Again exceeds rolling two-turn card supply"
    }
  };
}
