// Robo Rally Course Randomizer - estimated programming-card demand of routes and numeric state codes for contextual search
import {
  AGAIN_CARD_COUNT,
  PROGRAM_CARD_COUNTS,
  PROGRAM_CARD_IDS,
  REGISTER_COUNT
} from "./constants.js";
import {
  COMPACT_PROGRAM_ACTION_CODE,
  COMPACT_PROGRAM_ACTION_RADIX,
  ESTIMATED_CARD_FORECAST_BREAK_PENALTY,
  PROGRAM_CHEAP_RESOURCE_IDS,
  getCheapProgramLiteralAvailabilityDelta,
  getCompactProgramResourceCount,
  getProgramCardEffectivePreviousCounts,
  getProgramCardModelProfile
} from "./program-availability.js";
import { getRebootEndedAbsoluteActions } from "./reboot-recovery.js";

export const APPROX_PROGRAM_DEMAND_RADIX = REGISTER_COUNT + 1;
export const APPROX_PROGRAM_DEMAND_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (let index = 0; index < PROGRAM_CARD_IDS.length; index += 1) {
    weights.push(weight);
    weight *= APPROX_PROGRAM_DEMAND_RADIX;
  }
  return weights;
})());
export const APPROX_PROGRAM_DEMAND_SPACE = Math.pow(
  APPROX_PROGRAM_DEMAND_RADIX,
  PROGRAM_CARD_IDS.length
);
export const APPROX_PROGRAM_DEMAND_INDEX = new Map(
  PROGRAM_CARD_IDS.map((id, index) => [id, index])
);
export const APPROX_ROLLING_HARD_IDS = Object.freeze([
  ...PROGRAM_CARD_IDS.filter((id) => (PROGRAM_CARD_COUNTS.get(id) || 0) <= 2),
  "AGAIN"
]);
export const APPROX_ROLLING_HARD_LIMITS = Object.freeze(
  APPROX_ROLLING_HARD_IDS.map((id) => (
    id === "AGAIN" ? AGAIN_CARD_COUNT : (PROGRAM_CARD_COUNTS.get(id) || 0)
  ))
);
export const APPROX_ROLLING_HARD_RADICES = Object.freeze(
  APPROX_ROLLING_HARD_LIMITS.map((limit) => limit + 1)
);
export const APPROX_ROLLING_HARD_WEIGHTS = Object.freeze((() => {
  const weights = [];
  let weight = 1;
  for (const radix of APPROX_ROLLING_HARD_RADICES) {
    weights.push(weight);
    weight *= radix;
  }
  return weights;
})());
export const APPROX_ROLLING_HARD_SPACE = APPROX_ROLLING_HARD_RADICES.reduce(
  (product, radix) => product * radix,
  1
);
export const APPROX_ROLLING_HARD_INDEX = new Map(
  APPROX_ROLLING_HARD_IDS.map((id, index) => [id, index])
);

export function createContextualNumericFallbackInterner() {
  const root = new Map();
  let nextId = -1;
  return (...parts) => {
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = Number(parts[index]);
      let child = node.get(part);
      if (!(child instanceof Map)) {
        child = new Map();
        node.set(part, child);
      }
      node = child;
    }
    const last = Number(parts.at(-1));
    if (!node.has(last)) {
      node.set(last, nextId);
      nextId -= 1;
    }
    return node.get(last);
  };
}

export const contextualNumericFallbackId = createContextualNumericFallbackInterner();

export function getApproxProgramDemandCount(code, actionId) {
  const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
  if (!Number.isInteger(index)) return 0;
  return Math.floor(
    Math.max(0, Number(code) || 0) / APPROX_PROGRAM_DEMAND_WEIGHTS[index]
  ) % APPROX_PROGRAM_DEMAND_RADIX;
}

export function addApproxProgramDemandUse(code, actionId) {
  const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
  if (!Number.isInteger(index)) return null;
  const current = getApproxProgramDemandCount(code, actionId);
  if (current >= REGISTER_COUNT) return null;
  return (Number(code) || 0) + APPROX_PROGRAM_DEMAND_WEIGHTS[index];
}

export function getApproxRollingHardCount(code, resourceId) {
  const index = APPROX_ROLLING_HARD_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return 0;
  return Math.floor(
    Math.max(0, Number(code) || 0) / APPROX_ROLLING_HARD_WEIGHTS[index]
  ) % APPROX_ROLLING_HARD_RADICES[index];
}

export function addApproxRollingHardUse(code, resourceId) {
  const index = APPROX_ROLLING_HARD_INDEX.get(resourceId);
  if (!Number.isInteger(index)) return null;
  const current = getApproxRollingHardCount(code, resourceId);
  if (current >= APPROX_ROLLING_HARD_LIMITS[index]) return null;
  return (Number(code) || 0) + APPROX_ROLLING_HARD_WEIGHTS[index];
}

export function getApproxProgramDemandCounts(demandCode, againUsed = 0) {
  return PROGRAM_CHEAP_RESOURCE_IDS.map((resourceId) => (
    resourceId === "AGAIN"
      ? Math.max(0, Math.floor(Number(againUsed) || 0))
      : getApproxProgramDemandCount(demandCode, resourceId)
  ));
}

export function getApproxProgramScarceCounts(scarceCode) {
  return PROGRAM_CHEAP_RESOURCE_IDS.map((resourceId) => (
    APPROX_ROLLING_HARD_INDEX.has(resourceId)
      ? getApproxRollingHardCount(scarceCode, resourceId)
      : 0
  ));
}

// v30 estimate guidance is still deliberately soft: it remembers the previous
// program's natural demand and a greedy estimate of Again use so the first
// physical route is more likely to admit a literal card assignment. None of
// these fields participates in dominance identity and no card pressure can make
// a physically reachable state unreachable. Exact realization remains the only
// hard rolling-card legality gate.
export function getEstimatedProgramDemandStep(
  previousDemandCode,
  currentDemandCode,
  previousAgainUsed,
  currentAgainUsed,
  previousActionId,
  absoluteActions,
  actionId,
  options = {}
) {
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const phase = absolute % REGISTER_COUNT;
  const nextCurrentDemandCode = addApproxProgramDemandUse(currentDemandCode, actionId);
  const previousCounts = getProgramCardEffectivePreviousCounts(
    getApproxProgramDemandCounts(previousDemandCode, previousAgainUsed),
    options
  );
  const currentCounts = getApproxProgramDemandCounts(
    currentDemandCode,
    currentAgainUsed
  );

  const naturalPenalty = nextCurrentDemandCode === null
    ? Infinity
    : getCheapProgramLiteralAvailabilityDelta(
      previousCounts,
      currentCounts,
      getApproxProgramDemandCounts(nextCurrentDemandCode, currentAgainUsed),
      options
    );

  const rollingAgainUsed = (getProgramCardModelProfile(options).previousTurnDepletionActive
    ? Math.max(0, Number(previousAgainUsed) || 0)
    : 0) + Math.max(0, Number(currentAgainUsed) || 0);
  const canApproximateAgain = (
    phase > 0 &&
    previousActionId === actionId &&
    rollingAgainUsed < AGAIN_CARD_COUNT
  );
  const againPenalty = canApproximateAgain
    ? getCheapProgramLiteralAvailabilityDelta(
      previousCounts,
      currentCounts,
      getApproxProgramDemandCounts(currentDemandCode, 1),
      options
    )
    : Infinity;

  // Card demand is guidance only. If this greedy literal proxy reaches an
  // impossible allocation, keep the branch alive and let the separate bounded
  // card-forecast/exact realization machinery diagnose or repair it.
  const finiteNaturalPenalty = Number.isFinite(naturalPenalty)
    ? naturalPenalty
    : ESTIMATED_CARD_FORECAST_BREAK_PENALTY;
  const finiteAgainPenalty = Number.isFinite(againPenalty)
    ? againPenalty
    : ESTIMATED_CARD_FORECAST_BREAK_PENALTY;
  const useAgain = canApproximateAgain &&
    finiteAgainPenalty + 0.001 < finiteNaturalPenalty;

  let nextPreviousDemandCode = Math.max(0, Number(previousDemandCode) || 0);
  let nextDemandCode = useAgain
    ? Math.max(0, Number(currentDemandCode) || 0)
    : (nextCurrentDemandCode ?? Math.max(0, Number(currentDemandCode) || 0));
  let nextPreviousAgainUsed = Math.max(0, Number(previousAgainUsed) || 0);
  let nextCurrentAgainUsed = useAgain ? 1 : Math.max(0, Number(currentAgainUsed) || 0);
  let nextPreviousActionId = actionId;
  const nextAbsoluteActions = absolute + 1;

  if (nextAbsoluteActions % REGISTER_COUNT === 0) {
    const keepPreviousDepletion = getProgramCardModelProfile(options).previousTurnDepletionActive;
    nextPreviousDemandCode = keepPreviousDepletion ? nextDemandCode : 0;
    nextDemandCode = 0;
    nextPreviousAgainUsed = keepPreviousDepletion ? nextCurrentAgainUsed : 0;
    nextCurrentAgainUsed = 0;
    nextPreviousActionId = null;
  }

  return {
    previousDemandCode: nextPreviousDemandCode,
    demandCode: nextDemandCode,
    previousAgainUsed: nextPreviousAgainUsed,
    currentAgainUsed: nextCurrentAgainUsed,
    previousActionId: nextPreviousActionId,
    previousScarceCode: 0,
    currentScarceCode: 0,
    penalty: Number((useAgain ? finiteAgainPenalty : finiteNaturalPenalty).toFixed(3)),
    approximateProgramCard: useAgain ? "AGAIN" : actionId
  };
}


export function closeEstimatedProgramDemandForEndedTurn(step = {}, options = {}) {
  const currentDemandCode = Math.max(0, Number(step.demandCode) || 0);
  const currentAgainUsed = Math.max(0, Number(step.currentAgainUsed) || 0);
  const currentScarceCode = Math.max(0, Number(step.currentScarceCode) || 0);
  const keepPreviousDepletion = getProgramCardModelProfile(options).previousTurnDepletionActive;
  return {
    ...step,
    previousDemandCode: keepPreviousDepletion ? currentDemandCode : 0,
    demandCode: 0,
    previousAgainUsed: keepPreviousDepletion ? currentAgainUsed : 0,
    currentAgainUsed: 0,
    previousScarceCode: keepPreviousDepletion ? currentScarceCode : 0,
    currentScarceCode: 0,
    previousActionId: null
  };
}


export function getApproxProgramDemandCodeFromCompactResourceCode(compactCode) {
  let demandCode = 0;
  for (const actionId of PROGRAM_CARD_IDS) {
    const uses = getCompactProgramResourceCount(compactCode, actionId);
    const index = APPROX_PROGRAM_DEMAND_INDEX.get(actionId);
    if (!Number.isInteger(index) || uses <= 0) continue;
    demandCode += uses * APPROX_PROGRAM_DEMAND_WEIGHTS[index];
  }
  return demandCode;
}

export function getEstimatedDemandStateFromCompactCardState(cardState) {
  if (!cardState || cardState.feasible === false) {
    return {
      previousDemandCode: 0,
      demandCode: 0,
      previousAgainUsed: 0,
      currentAgainUsed: 0,
      previousActionId: null
    };
  }
  return {
    previousDemandCode: getApproxProgramDemandCodeFromCompactResourceCode(
      cardState.previousCode
    ),
    demandCode: getApproxProgramDemandCodeFromCompactResourceCode(
      cardState.currentCode
    ),
    previousAgainUsed: getCompactProgramResourceCount(
      cardState.previousCode,
      "AGAIN"
    ),
    currentAgainUsed: getCompactProgramResourceCount(
      cardState.currentCode,
      "AGAIN"
    ),
    previousActionId: cardState.previousActionId ?? null
  };
}

export function walkEstimatedProgramDemand(
  actionIds,
  absoluteActions = 0,
  initialState = null,
  options = {},
  transitions = []
) {
  let previousDemandCode = Math.max(0, Number(initialState?.previousDemandCode) || 0);
  let demandCode = Math.max(0, Number(initialState?.demandCode) || 0);
  let previousAgainUsed = Math.max(0, Number(initialState?.previousAgainUsed) || 0);
  let currentAgainUsed = Math.max(0, Number(initialState?.currentAgainUsed) || 0);
  let previousActionId = initialState?.previousActionId ?? null;
  let workingAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  let penalty = 0;
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
    penalty += step.penalty;
    const executedAbsoluteAction = workingAbsoluteActions + 1;
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
    penalty: Number(penalty.toFixed(3)),
    state: {
      previousDemandCode,
      demandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId
    },
    absoluteActions: workingAbsoluteActions
  };
}

export function scoreEstimatedProgramDemand(
  actionIds,
  absoluteActions = 0,
  initialState = null,
  options = {},
  transitions = []
) {
  return walkEstimatedProgramDemand(
    actionIds,
    absoluteActions,
    initialState,
    options,
    transitions
  ).penalty;
}

export function finalizeApproxProgramDemandOption(option, absoluteActions, actionId, options = {}) {
  const nextAbsoluteActions = Math.max(0, Math.floor(Number(absoluteActions) || 0)) + 1;
  if (nextAbsoluteActions % REGISTER_COUNT !== 0) {
    return { ...option, previousActionId: actionId };
  }
  return {
    ...option,
    previousScarceCode: getProgramCardModelProfile(options).previousTurnDepletionActive
      ? option.currentScarceCode
      : 0,
    currentScarceCode: 0,
    demandCode: 0,
    previousActionId: null
  };
}

export function getApproxProgramDemandOptions(
  demandCode,
  previousScarceCode,
  currentScarceCode,
  previousActionId,
  absoluteActions,
  actionId,
  options = {}
) {
  const copies = PROGRAM_CARD_COUNTS.get(actionId) || 0;
  if (copies <= 0) return [];
  const currentUses = getApproxProgramDemandCount(demandCode, actionId);
  const nextDemandCode = addApproxProgramDemandUse(demandCode, actionId);
  if (nextDemandCode === null) return [];

  const previousCounts = getApproxProgramScarceCounts(previousScarceCode);
  const currentAgain = getApproxRollingHardCount(currentScarceCode, "AGAIN");
  const currentCounts = getApproxProgramDemandCounts(demandCode, currentAgain);
  const optionsOut = [];

  if (copies <= 2) {
    const previousUses = getProgramCardModelProfile(options).previousTurnDepletionActive
      ? getApproxRollingHardCount(previousScarceCode, actionId)
      : 0;
    const currentNaturalUses = getApproxRollingHardCount(currentScarceCode, actionId);
    if (previousUses + currentNaturalUses < copies) {
      const nextCurrentScarceCode = addApproxRollingHardUse(currentScarceCode, actionId);
      if (nextCurrentScarceCode !== null) {
        const penalty = getCheapProgramLiteralAvailabilityDelta(
          previousCounts,
          currentCounts,
          getApproxProgramDemandCounts(nextDemandCode, currentAgain),
          options
        );
        optionsOut.push(finalizeApproxProgramDemandOption({
          demandCode: nextDemandCode,
          previousScarceCode,
          currentScarceCode: nextCurrentScarceCode,
          penalty,
          approximateProgramCard: actionId
        }, absoluteActions, actionId, options));
      }
    }
  } else {
    // Three/four-copy cards remain soft across programs in this shared physical
    // catalogue. Their current-program literal allocation is nevertheless priced
    // by the same cached hand-availability proxy as the primary estimate search.
    if (currentUses < copies) {
      const penalty = getCheapProgramLiteralAvailabilityDelta(
        previousCounts,
        currentCounts,
        getApproxProgramDemandCounts(nextDemandCode, currentAgain),
        options
      );
      optionsOut.push(finalizeApproxProgramDemandOption({
        demandCode: nextDemandCode,
        previousScarceCode,
        currentScarceCode,
        penalty,
        approximateProgramCard: actionId
      }, absoluteActions, actionId, options));
    }
  }

  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  const previousAgain = getProgramCardModelProfile(options).previousTurnDepletionActive
    ? getApproxRollingHardCount(previousScarceCode, "AGAIN")
    : 0;
  if (
    phase > 0 &&
    previousActionId === actionId &&
    previousAgain + currentAgain < AGAIN_CARD_COUNT
  ) {
    const nextCurrentScarceCode = addApproxRollingHardUse(currentScarceCode, "AGAIN");
    if (nextCurrentScarceCode !== null) {
      const penalty = getCheapProgramLiteralAvailabilityDelta(
        previousCounts,
        currentCounts,
        getApproxProgramDemandCounts(demandCode, 1),
        options
      );
      optionsOut.push(finalizeApproxProgramDemandOption({
        // Again is the physical card supplying this register. Do not also count
        // another natural copy in the cheap literal-allocation proxy.
        demandCode,
        previousScarceCode,
        currentScarceCode: nextCurrentScarceCode,
        penalty,
        approximateProgramCard: "AGAIN"
      }, absoluteActions, actionId, options));
    }
  }

  return optionsOut;
}


export function getApproxProgramDemandStateCode(
  demandCode,
  previousScarceCode,
  currentScarceCode,
  previousActionId
) {
  const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(previousActionId) || 0;
  const combined = (
    (((Math.max(0, Math.floor(Number(previousScarceCode) || 0)) *
      APPROX_ROLLING_HARD_SPACE +
      Math.max(0, Math.floor(Number(currentScarceCode) || 0))) *
      APPROX_PROGRAM_DEMAND_SPACE +
      Math.max(0, Math.floor(Number(demandCode) || 0))) *
      COMPACT_PROGRAM_ACTION_RADIX +
      actionCode)
  );
  return Number.isSafeInteger(combined)
    ? combined
    : contextualNumericFallbackId(
      previousScarceCode,
      currentScarceCode,
      demandCode,
      actionCode
    );
}
