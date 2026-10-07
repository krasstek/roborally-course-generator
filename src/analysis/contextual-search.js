// Robo Rally Course Randomizer - contextual leg search: physical timing templates, card-aware leg routes, estimate-then-realize stitching and card-pressure summaries
import { buildPortalMap, cloneState, stateKey } from "./board-geometry.js";
import { MinHeap } from "./collections.js";
import {
  ACTIONS,
  AGAIN_CARD_COUNT,
  PROGRAM_CARD_COUNTS,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST,
  ROTATION_ORDER,
  SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER
} from "./constants.js";
import {
  getInitialRouteEconomyShadowState,
  getInitialRouteEnergyShadowReserve,
  getRouteEnergyDominanceBoundConfig,
  getRouteEnergyDominanceRewardUpperBound,
  getRouteEnergyShadowStep
} from "./energy-economy.js";
import { clamp } from "./math.js";
import {
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY,
  getRouteAwareActionPenalty,
  heuristic,
  simulateAction
} from "./movement.js";
import {
  getCachedContextualPhysicalTransition,
  getContextualPhysicalOptionSignature
} from "./physical-cache.js";
import {
  COMPACT_PROGRAM_ACTION_CODE,
  COMPACT_PROGRAM_ACTION_RADIX,
  COMPACT_PROGRAM_RESOURCE_IDS,
  ESTIMATED_CARD_FORECAST_BREAK_PENALTY,
  ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT,
  PROGRAM_CHEAP_RESOURCE_IDS,
  PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY,
  areRollingProgramResourceStatesCompatible,
  cloneEstimatedCardForecastFrontier,
  closeCompactProgramCardStateForEndedTurn,
  closeEstimatedCardForecastFrontierForEndedTurn,
  getCheapProgramLiteralAvailabilityProbability,
  getCompactProgramCardOptions,
  getCompactProgramCardStateCode,
  getCompactProgramCardStateFromHistory,
  getEstimatedCardFrontierUnionAvailabilityPenalty,
  getExactProgramHandAvailabilityProbability,
  getLiteralProgramResourceStates,
  getLiteralProgramResourceSummary,
  getProgramCardModelProfile,
  getProgramCardModelSignature,
  getProgramHistoryWindow,
  getProgramResourceStateCounts,
  getRollingProgramResourceContext,
  scoreCompactProgramCardSequenceUntilFailure,
  scoreContextualCardSequence
} from "./program-availability.js";
import {
  APPROX_PROGRAM_DEMAND_SPACE,
  closeEstimatedProgramDemandForEndedTurn,
  contextualNumericFallbackId,
  getApproxProgramDemandOptions,
  getApproxProgramDemandStateCode,
  getEstimatedProgramDemandStep,
  scoreEstimatedProgramDemand
} from "./program-demand.js";
import {
  getCompletedRoutePostbuildScoreAdjustment,
  getSearchIntrinsicMentalTransitionStep,
  replaySearchIntrinsicMentalForContext
} from "./re-ledger.js";
import {
  getHomeRebootTokensForStart,
  getRebootEndedAbsoluteActions,
  getRebootRoutePenalty,
  getTransitionAbsoluteAction,
  getTurnEndAfterActionIndexes
} from "./reboot-recovery.js";
import { getRENativeProductionTrafficForecastProfile } from "./route-evaluation.js";
import {
  buildTimeline,
  enumerateFullCourseRoutes,
  getDynamicArchiveStateKey,
  getDynamicGoalPosition,
  getDynamicGoalSpace,
  getHomingMissileCheapSearchGuidanceBonus,
  getNextDynamicArchivePoint,
  getRouteEnergyShadowReserveKey,
  reconstructRouteTransitions,
  routeTouchesPit,
  scoreConveyorComplexity,
  scoreDynamicArchivingRouteUtility,
  scoreTransitionConveyorComplexity
} from "./route-search.js";
import { isRouteAwareBatteryScoringActive } from "./rule-options.js";
import { analysisTelemetryNow, recordRouteSearchTelemetry } from "./telemetry.js";
import {
  FORECAST_SOLID_CONFIDENCE,
  FORECAST_SPECULATIVE_CONFIDENCE,
  HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE,
  HOMING_MISSILE_STRATEGIC_CREDIT_RE,
  HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
  compareScoredRouteLike,
  dedupeRoutes,
  getForecastTimeConfidence,
  getRoutePathKey,
  getTrafficForecastElapsedRegisters,
  routeSimilarity,
  selectContextualTrafficAlternativeRoutes,
  selectDistinctRoutes
} from "./traffic.js";

export const CONTEXTUAL_LATER_ROUTES = 3;
export const CONTEXTUAL_BEAM_WIDTH = 2;
export const CONTEXTUAL_COMPLETION_POOL = 4;

export const CONTEXTUAL_LATER_EXPANSIONS = 6000;
export const CONTEXTUAL_LEG_MAX_ACTIONS = 24;

// Extra completion search is deliberately a confidence bonus, not a second
// viability requirement. Every mode uses the same adaptive uncertainty rule;
// alternative-retention callers merely move along it more slowly.
export const CONTEXTUAL_OPTIONAL_COMPLETION_RATIO = 0.12;
export const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START = 0.45;
export const CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP = 0.70;
export const CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER = 1.75;

// Search-state identity deliberately uses a coarser summary than the literal
// rolling card allocator. Hard legality is still checked on every concrete branch
// by getRollingProgramResourceContext(); this signature only decides when two
// already-legal speculative futures may share a dominance bucket.
//
// Why this is intentionally lossy:
// - Dev View must show a real five-register program, so concrete parent chains are
//   never synthesized from the summary.
// - The previous turn is itself an abstraction of a 20-card deck / 9-card hand,
//   and far-future exact allocation correlations are not useful predictions.
// - Low-copy cards are the ones whose depletion materially changes plausible next
//   programs. Four-copy cards retain hard legality checks but do not fragment the
//   dominance key merely because their speculative usage differed.
// - Again availability and the immediately previous action remain explicit because
//   they can change whether the very next register is playable.
export function getProgramCacheSignature(history, absoluteActions, options = {}) {
  // Exact rolling two-program identity, including depletion of the common four-copy
  // cards. The active programming-variant model is part of the key because Less
  // Foreshadowing changes carried depletion and Factory Rejects/Shared Deck change
  // scarcity evaluation even when the physical history is identical.
  return `${getProgramCardModelSignature(options)}|q${getRollingProgramResourceContext(
    history,
    absoluteActions,
    null,
    options.programHistoryAbsoluteActions,
    options
  ).pairSignatureId}`;
}

export function getDynamicGoalCachePhase(dynamicGoal, absoluteActions) {
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

export const CONTEXTUAL_FACING_CODE = Object.freeze({ N: 0, E: 1, S: 2, W: 3 });
export const CONTEXTUAL_COORD_OFFSET = 32768;
export const CONTEXTUAL_COORD_RADIX = 65536;
export const CONTEXTUAL_GOAL_PHASE_RADIX = 65536;

export function getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions) {
  if (!dynamicGoal) return 0;
  const absolute = Math.max(0, Math.floor(Number(absoluteActions) || 0));
  const { periodStart = 0, periodLength = 0, positions = [] } = dynamicGoal;
  const phase = periodLength > 0 && absolute >= periodStart
    ? periodStart + ((absolute - periodStart) % periodLength)
    : Math.min(absolute, Math.max(0, positions.length - 1));
  return phase + 1;
}

export function getContextualPhysicalRegisterCode(state, absoluteActions) {
  const x = Math.floor(Number(state?.x));
  const y = Math.floor(Number(state?.y));
  const facingCode = CONTEXTUAL_FACING_CODE[state?.facing ?? "E"];
  const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
  if (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= -CONTEXTUAL_COORD_OFFSET && x < CONTEXTUAL_COORD_OFFSET &&
    y >= -CONTEXTUAL_COORD_OFFSET && y < CONTEXTUAL_COORD_OFFSET &&
    Number.isInteger(facingCode)
  ) {
    return (
      (((x + CONTEXTUAL_COORD_OFFSET) * CONTEXTUAL_COORD_RADIX +
        (y + CONTEXTUAL_COORD_OFFSET)) * 4 + facingCode) *
        REGISTER_COUNT + phase
    );
  }
  return contextualNumericFallbackId(x, y, facingCode ?? -1, phase);
}

export function getContextualPhysicalGoalCode(state, absoluteActions, dynamicGoal) {
  const physicalCode = getContextualPhysicalRegisterCode(state, absoluteActions);
  const goalPhaseCode = getDynamicGoalCachePhaseCode(dynamicGoal, absoluteActions);
  if (
    physicalCode >= 0 &&
    goalPhaseCode >= 0 && goalPhaseCode < CONTEXTUAL_GOAL_PHASE_RADIX
  ) {
    return physicalCode * CONTEXTUAL_GOAL_PHASE_RADIX + goalPhaseCode;
  }
  return contextualNumericFallbackId(physicalCode, goalPhaseCode);
}

export function getContextualArchiveAwarePhysicalGoalCode(
  state,
  absoluteActions,
  dynamicGoal,
  dynamicArchivePoint,
  options = {}
) {
  const physicalGoalCode = getContextualPhysicalGoalCode(
    state,
    absoluteActions,
    dynamicGoal
  );
  if (options.recoveryRule !== "dynamic_archiving") {
    return physicalGoalCode;
  }

  // Archive position is true route state. Two otherwise-identical search nodes
  // can have different lethal-terrain consequences if they would reboot to
  // different prior checkpoints/Batteries. Intern only this Dynamic-Archiving
  // extension so the ordinary hot key remains unchanged.
  return contextualNumericFallbackId(
    physicalGoalCode,
    dynamicArchivePoint?.x ?? CONTEXTUAL_COORD_RADIX,
    dynamicArchivePoint?.y ?? CONTEXTUAL_COORD_RADIX
  );
}


export function getContextualSearchNumericStateParts(
  state,
  absoluteActions,
  programCardState,
  dynamicGoal,
  dynamicArchivePoint = null,
  options = {}
) {
  return {
    physicalGoalCode: getContextualArchiveAwarePhysicalGoalCode(
      state,
      absoluteActions,
      dynamicGoal,
      dynamicArchivePoint,
      options
    ),
    cardStateCode: getCompactProgramCardStateCode(programCardState)
  };
}

export function getContextualBestCost(bestCostByState, parts) {
  return bestCostByState
    .get(parts.physicalGoalCode)
    ?.get(parts.cardStateCode);
}

export function setContextualBestCost(bestCostByState, parts, cost) {
  let cardCosts = bestCostByState.get(parts.physicalGoalCode);
  if (!cardCosts) {
    cardCosts = new Map();
    bestCostByState.set(parts.physicalGoalCode, cardCosts);
  }
  cardCosts.set(parts.cardStateCode, cost);
}

export function getNestedBestCost(bestCostByState, primaryCode, secondaryCode) {
  return bestCostByState.get(primaryCode)?.get(secondaryCode);
}

export function setNestedBestCost(bestCostByState, primaryCode, secondaryCode, cost) {
  let secondary = bestCostByState.get(primaryCode);
  if (!secondary) {
    secondary = new Map();
    bestCostByState.set(primaryCode, secondary);
  }
  secondary.set(secondaryCode, cost);
}


export function getContextualLegCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  const fastCardState = options.contextualFastCardState !== false;
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    getContextualProgramCacheSignature(context, options),
    !fastCardState && isRouteAwareBatteryScoringActive(options)
      ? `a${context.absoluteActions}`
      : null,
    !fastCardState
      ? (getRouteEnergyShadowReserveKey(context.energyReserve, options) || null)
      : null,
    getDynamicArchiveStateKey(context.dynamicArchivePoint, options) || null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

export function getContextualTemplateCacheKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  return [
    namespace,
    `leg${legIndex}`,
    `fexact`,
    `u${getContextualForecastBand(context, options)}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    isRouteAwareBatteryScoringActive(options) ? `a${context.absoluteActions}` : null,
    getRouteEnergyShadowReserveKey(context.energyReserve, options) || null,
    getDynamicArchiveStateKey(context.dynamicArchivePoint, options) || null,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].filter(Boolean).join("|");
}

// Shared physical/timing identity for the v22 later-leg catalogue. Register phase
// is deliberately immutable: all robots share one five-register board clock, so a
// route beginning on register 2 is not a substitute for the same geometry beginning
// on register 4. Previous-program depletion, Energy reserve, accumulated hazard and
// original dock identity are baggage, not catalogue identity; they are replayed or
// repriced after a trace is discovered. v48zb also treats exact Dynamic Archive
// position as replay baggage here: cheap templates use a leg-local recovery proxy,
// while exact replay reconstructs the actual checkpoint/Battery marker. Moving goals
// contribute their physical phase. Home Reboot keeps a start namespace because its
// legal reboot token set really is start-specific rather than historical bookkeeping.
export function getContextualSharedLegCatalogueKey(
  context,
  legIndex,
  dynamicGoal,
  namespace = "shared",
  options = {}
) {
  return [
    namespace,
    `leg${legIndex}`,
    stateKey(context.state),
    `r${context.absoluteActions % REGISTER_COUNT}`,
    `g${getDynamicGoalCachePhase(dynamicGoal, context.absoluteActions)}`
  ].join("|");
}

export function getContextualProgramCacheSignature(context, options = {}) {
  if (context?.programCardState) {
    // Leg-level cache lookup happens once per context, not once per expansion.
    // Keep an explicit prefix for collision safety/readability; the expanded-state
    // hot path is numeric.
    return `${getProgramCardModelSignature(options)}|c${getCompactProgramCardStateCode(context.programCardState)}`;
  }
  return getProgramCacheSignature(context?.history, context?.absoluteActions, options);
}

export function routeReachesContextualGoal(route, goal, dynamicGoal) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  return (
    route.finalState.x === target.x &&
    route.finalState.y === target.y
  );
}

export function createContextualQueueEntry(
  route,
  goal,
  dynamicGoal,
  tileMap = null,
  options = {}
) {
  const target = (
    getDynamicGoalPosition(dynamicGoal, route.absoluteActions) ??
    goal
  );
  const missileGuidanceBonus = getHomingMissileCheapSearchGuidanceBonus(
    tileMap,
    route.finalState,
    target,
    options
  );
  return {
    ...route,
    homingMissileSearchGuidanceBonus: Number(missileGuidanceBonus.toFixed(3)),
    estimate: route.baseCost + heuristic(route.finalState, target) * 5 - missileGuidanceBonus
  };
}

export function getContextualUsageParetoDescriptor(rawKey, rawCost = 0) {
  // v13 folds card-copy usage and Again allocation into one canonical rolling
  // resource signature. The old Dev-only tracked-card Pareto probe depended on
  // named per-card fields in the key, so it is intentionally disabled rather
  // than reporting a misleading dominance estimate for the new representation.
  return {
    key: String(rawKey),
    groupKey: String(rawKey),
    usage: [],
    cost: Number(rawCost) || 0
  };
}

export function contextualUsageParetoDominates(left, right) {
  if (!left || !right || left.groupKey !== right.groupKey) return false;
  if (left.cost > right.cost + 0.001) return false;

  let strictlyBetter = left.cost < right.cost - 0.001;
  for (let index = 0; index < right.usage.length; index += 1) {
    if ((left.usage[index] ?? 0) > (right.usage[index] ?? 0)) return false;
    if ((left.usage[index] ?? 0) < (right.usage[index] ?? 0)) strictlyBetter = true;
  }
  return strictlyBetter;
}

export function summarizeContextualUsageParetoOpportunity(bestCostByState) {
  const groups = new Map();

  for (const [rawKey, rawCost] of bestCostByState.entries()) {
    const descriptor = getContextualUsageParetoDescriptor(rawKey, rawCost);
    if (!groups.has(descriptor.groupKey)) groups.set(descriptor.groupKey, []);
    groups.get(descriptor.groupKey).push(descriptor);
  }

  let states = 0;
  let dominated = 0;
  let multiStateGroups = 0;

  for (const entries of groups.values()) {
    states += entries.length;
    if (entries.length < 2) continue;
    multiStateGroups += 1;

    for (let index = 0; index < entries.length; index += 1) {
      const candidate = entries[index];
      let isDominated = false;
      for (let otherIndex = 0; otherIndex < entries.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        const other = entries[otherIndex];
        if (contextualUsageParetoDominates(other, candidate)) {
          isDominated = true;
          break;
        }
      }
      if (isDominated) dominated += 1;
    }
  }

  return {
    dominanceUsageParetoStates: states,
    dominanceUsageParetoDominated: dominated,
    dominanceUsageParetoMultiStateGroups: multiStateGroups
  };
}

export function summarizeContextualDominanceKeySpace(bestCostByState) {
  const unique = {
    physical: new Set(),
    physicalPhase: new Set(),
    noProgramDetail: new Set(),
    noPrevious: new Set(),
    noUsage: new Set(),
    noAgain: new Set(),
    noAbsolute: new Set(),
    noEnergy: new Set(),
    noCards: new Set(),
    noEconomyShadow: new Set(),
    noGoal: new Set()
  };

  const withoutRestPart = (parts, predicate) => parts.filter((part, index) => (
    index < 2 || !predicate(part)
  )).join("|");

  for (const rawKey of bestCostByState.keys()) {
    const parts = String(rawKey).split("|");
    const physical = parts[0] ?? "";
    const program = parts[1] ?? "";
    const programParts = program.split(":");
    const phase = programParts.find((part) => /^r\d+$/.test(part)) ?? "r?";
    const rest = parts.slice(2);

    unique.physical.add(physical);
    unique.physicalPhase.add(`${physical}|${phase}`);
    unique.noProgramDetail.add([physical, phase, ...rest].join("|"));
    unique.noPrevious.add([
      physical,
      programParts.filter((part) => (
        !part.startsWith("p") && !part.startsWith("v")
      )).join(":"),
      ...rest
    ].join("|"));
    unique.noUsage.add([
      physical,
      programParts.filter((part) => !/^[uv][0-9a-z-]+$/i.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAgain.add([
      physical,
      programParts.filter((part) => !/^[ag][01]$/.test(part)).join(":"),
      ...rest
    ].join("|"));
    unique.noAbsolute.add(withoutRestPart(parts, (part) => /^a\d+$/.test(part)));
    unique.noEnergy.add(withoutRestPart(parts, (part) => /^@e/.test(part)));
    unique.noCards.add(withoutRestPart(parts, (part) => /^@c/.test(part)));
    unique.noEconomyShadow.add(withoutRestPart(parts, (part) => /^@(e|c)/.test(part)));
    unique.noGoal.add(withoutRestPart(parts, (part) => /^g/.test(part)));
  }

  return {
    ...summarizeContextualUsageParetoOpportunity(bestCostByState),
    dominanceKeysFull: bestCostByState.size,
    dominanceKeysPhysical: unique.physical.size,
    dominanceKeysPhysicalPhase: unique.physicalPhase.size,
    dominanceKeysNoProgramDetail: unique.noProgramDetail.size,
    dominanceKeysNoPrevious: unique.noPrevious.size,
    dominanceKeysNoUsage: unique.noUsage.size,
    dominanceKeysNoAgain: unique.noAgain.size,
    dominanceKeysNoAbsolute: unique.noAbsolute.size,
    dominanceKeysNoEnergy: unique.noEnergy.size,
    dominanceKeysNoCards: unique.noCards.size,
    dominanceKeysNoEconomyShadow: unique.noEconomyShadow.size,
    dominanceKeysNoGoal: unique.noGoal.size
  };
}

export function getContextualOptionalCompletionAllowance(
  context,
  maxExpansions,
  firstGoalExpansion,
  maxOutputRoutes,
  options = {}
) {
  if (!(maxExpansions > 0)) return 0;

  const configured = Number(options.optionalCompletionExpansions);
  const baseAllowance = Number.isFinite(configured)
    ? Math.max(0, Math.floor(configured))
    : Math.max(0, Math.floor(maxExpansions * CONTEXTUAL_OPTIONAL_COMPLETION_RATIO));
  if (baseAllowance <= 0) return 0;

  // If proving route #1 already consumed most of the leg budget, do not spend
  // more search effort on route diversity. Board/hazard complexity naturally
  // feeds this signal because difficult physical routes tend to reach the first
  // goal later in the search.
  const effortRatio = Math.max(0, firstGoalExpansion) / maxExpansions;
  if (effortRatio >= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP) return 0;
  const effortFactor = effortRatio <= CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    ? 1
    : (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP - effortRatio
    ) / (
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_STOP -
      CONTEXTUAL_OPTIONAL_COMPLETION_EFFORT_FADE_START
    );

  // v49dw: optional completion breadth now uses the same RE-native horizon
  // language as production traffic confidence: elapsed registers plus completed
  // intrinsic adverse RE from prior legs. Raw hazard exposure no longer gets an
  // independent semantic vote. The first-goal effort ratio above still provides
  // a purely computational signal when the current physical leg itself is hard.
  const forecastFactor = Math.max(
    0.40,
    getContextualRENativeForecastConfidence(context, options)
  );

  // When only one route will be returned, a second completion is merely a
  // chance to improve that one choice, so give it half the ordinary allowance.
  const outputFactor = maxOutputRoutes > 1 ? 1 : 0.5;
  const retentionFactor = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? CONTEXTUAL_ALTERNATIVE_RETENTION_MULTIPLIER
    : 1;
  return Math.max(
    0,
    Math.round(
      baseAllowance * effortFactor * forecastFactor * outputFactor * retentionFactor
    )
  );
}

// Compatibility-only hook for old diagnostic callers. Production v33 does not
// infer uncertainty from player count here; occupancy/interaction drives that later.
export function getContextualTrafficUncertainty(options = {}) {
  const explicit = Number(options.contextualTrafficUncertainty);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1);
  return 0;
}

// v49dw contextual breadth ownership. This is search-effort policy only: exact
// card depletion, Energy replay and physical legality remain unchanged at every
// horizon. Breadth now consumes elapsed register horizon + cumulative completed
// intrinsic adverse RE. Raw hazard/board-chaos/interaction confidence decay has
// no independent production vote.
export const CONTEXTUAL_FORECAST_BANDS = Object.freeze({
  SOLID: "solid",
  UNCERTAIN: "uncertain",
  SPECULATIVE: "speculative"
});

export function getContextualRENativeForecastConfidence(context = {}, options = {}) {
  const elapsedRegisters = getTrafficForecastElapsedRegisters(
    context?.absoluteActions,
    options
  );
  const adverseRE = Math.max(0, Number(context?.reNativeAdverseRE) || 0);
  return getForecastTimeConfidence(elapsedRegisters + adverseRE);
}

export function getContextualForecastBand(
  context = {},
  options = {}
) {
  if (!(options.contextualUncertaintyBreadth || options.contextualAdaptiveUncertaintyHorizon)) {
    return CONTEXTUAL_FORECAST_BANDS.SOLID;
  }

  let confidence = getContextualRENativeForecastConfidence(context, options);
  // Compatibility-only diagnostic override. Production leaves this at zero;
  // real multiplayer uncertainty comes later from occupancy/interaction itself.
  const explicitLegacyUncertainty = getContextualTrafficUncertainty(options);
  if (explicitLegacyUncertainty > 0) {
    confidence *= Math.exp(-explicitLegacyUncertainty * 0.18);
  }

  if (confidence < FORECAST_SPECULATIVE_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.SPECULATIVE;
  }
  if (confidence < FORECAST_SOLID_CONFIDENCE) {
    return CONTEXTUAL_FORECAST_BANDS.UNCERTAIN;
  }
  return CONTEXTUAL_FORECAST_BANDS.SOLID;
}

export function getContextualBreadthPolicy(
  context,
  requestedRoutes,
  requestedCompletionPool,
  requestedBeamWidth,
  requestedOptionalExpansions,
  options = {}
) {
  const routes = Math.max(1, Math.floor(Number(requestedRoutes) || 1));
  const completionPool = Math.max(routes, Math.floor(Number(requestedCompletionPool) || routes));
  const beamWidth = Math.max(1, Math.floor(Number(requestedBeamWidth) || 1));
  const optional = Math.max(0, Math.floor(Number(requestedOptionalExpansions) || 0));
  const band = getContextualForecastBand(
    context,
    options
  );

  if (band === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    return {
      band,
      maxRoutes: 1,
      completionPool: 1,
      beamWidth: 1,
      optionalCompletionExpansions: 0
    };
  }

  if (band === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    const fullShare = Number(options.contextualFullForecastShare);
    // Standard and faster modes collapse to one route as soon as the future is
    // uncertain. Balanced/Thorough may retain two, but never more than two.
    const uncertainRouteCap = Number.isFinite(fullShare) && fullShare >= 0.72 ? 2 : 1;
    const reducedRoutes = Math.min(routes, uncertainRouteCap);
    return {
      band,
      maxRoutes: reducedRoutes,
      completionPool: Math.max(reducedRoutes, Math.min(completionPool, uncertainRouteCap)),
      beamWidth: Math.max(1, Math.min(beamWidth, uncertainRouteCap)),
      optionalCompletionExpansions: reducedRoutes > 1
        ? Math.min(optional, Number.isFinite(fullShare) && fullShare >= 0.84 ? 80 : 45)
        : 0
    };
  }

  return {
    band,
    maxRoutes: routes,
    completionPool,
    beamWidth,
    optionalCompletionExpansions: optional
  };
}

export function getPhysicalTimingTemplateStateKey(
  state,
  absoluteActions,
  dynamicGoal,
  dynamicArchivePoint = null,
  options = {}
) {
  // Physical timing templates are cheap discovery, not authoritative Dynamic
  // Archive chronology. Position/facing/register/goal phase define dominance;
  // exact archive history is reconstructed when the selected witness is replayed.
  return getContextualPhysicalGoalCode(
    state,
    absoluteActions,
    dynamicGoal
  );
}

// v24 later-leg discovery keeps physical discovery cheap. v49bc makes the
// mental boundary explicit too: partial-state dominance does not carry cognitive
// history. Completed traces are replayed/rebased for resource and mental scoring
// before they are trusted as player-visible candidates.
export function runGeneratorSynchronously(iterator) {
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

export function* enumeratePhysicalTimingLegTemplatesSteps(
  tileMap,
  context,
  goal,
  options = {}
) {
  const telemetryStartedAt = analysisTelemetryNow();
  const cooperativeSearchSlices = Boolean(options.contextualCooperativeSearchSlices);
  const requestedCooperativeCheckPops = Number(
    options.contextualCooperativeSearchCheckPops ??
    options.contextualCooperativeSearchSlicePops
  );
  const cooperativeCheckPops = Number.isFinite(requestedCooperativeCheckPops)
    ? Math.max(1, Math.floor(requestedCooperativeCheckPops))
    : 16;
  const requestedCooperativeSliceMs = Number(
    options.contextualCooperativeSearchSliceMs
  );
  const cooperativeSliceMs = Number.isFinite(requestedCooperativeSliceMs)
    ? Math.max(1, requestedCooperativeSliceMs)
    : 75;
  let nextCooperativeTimeCheckPop = cooperativeCheckPops;
  let cooperativeSliceCount = 0;
  let cooperativePausedMs = 0;
  let cooperativeMaxSliceWorkMs = 0;
  let cooperativeSliceWorkStartedAt = telemetryStartedAt;
  // v48zo keeps the v48zn targeted profiler available for explicit diagnostics,
  // but ordinary generation leaves contextualDetailedProfiling off so these
  // performance.now() calls do not tax the speed benchmark.
  const profile = {
    queueMs: 0,
    currentKeyMs: 0,
    goalCompletionMs: 0,
    simulationMs: 0,
    simulationHitMs: 0,
    simulationMissMs: 0,
    physicalMissLookupMs: 0,
    physicalMissProgrammedMs: 0,
    physicalMissProgramStartMs: 0,
    physicalMissProgramTeleporterMs: 0,
    physicalMissProgramMoveCheckMs: 0,
    physicalMissProgramBlockedMs: 0,
    physicalMissProgramLandingMs: 0,
    physicalMissProgramHazardMs: 0,
    physicalMissProgramPressureMs: 0,
    physicalMissProgramBookkeepingMs: 0,
    physicalMissProgramOilMs: 0,
    physicalMissBlueConveyorMs: 0,
    physicalMissGreenConveyorMs: 0,
    physicalMissCurrentMs: 0,
    physicalMissPusherMs: 0,
    physicalMissGearMs: 0,
    physicalMissCrusherMs: 0,
    physicalMissEndRegisterMs: 0,
    physicalMissCloneMs: 0,
    physicalMissRecoveryPressureMs: 0,
    physicalMissCacheStoreMs: 0,
    physicalMissFinalizeMs: 0,
    physicalMissSampledCalls: 0,
    cardOptionsMs: 0,
    actionScoringMs: 0,
    energyMs: 0,
    archiveContextMs: 0,
    destinationBuildMs: 0,
    routeNodeBuildMs: 0,
    historyBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    cardOptionCalls: 0,
    estimatedDemandMemoHits: 0,
    estimatedDemandMemoMisses: 0,
    estimatedForecastMemoHits: 0,
    estimatedForecastMemoMisses: 0,
    estimatedCompactCardMemoHits: 0,
    estimatedCompactCardMemoMisses: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    earlyDominanceEnergyBoundPrunes: 0,
    completedGoals: 0,
    searchesWithGoal: 0,
    cappedZeroGoalSearches: 0,
    cappedWithGoalSearches: 0,
    firstGoalExpansionTotal: 0,
    postFirstGoalExpansions: 0,
    optionalCompletionSearches: 0,
    optionalCompletionStops: 0,
    optionalCompletionShortReturns: 0,
    cappedZeroGoalExpansions: 0,
    cappedWithGoalExpansions: 0,
    exactContextualSearches: 1,
    exactContextualExpansions: 0,
    horizonSolidSearches: 0,
    horizonUncertainSearches: 0,
    horizonSpeculativeSearches: 0,
    horizonFirstGoalUncertain: 0,
    horizonFirstGoalSpeculative: 0,
    horizonOptionalSuppressed: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0,
    dominanceKeysFull: 0,
    dominanceKeysPhysical: 0,
    dominanceKeysPhysicalPhase: 0,
    dominanceKeysNoProgramDetail: 0,
    dominanceKeysNoPrevious: 0,
    dominanceKeysNoUsage: 0,
    dominanceKeysNoAgain: 0,
    dominanceKeysNoAbsolute: 0,
    dominanceKeysNoEnergy: 0,
    dominanceKeysNoCards: 0,
    dominanceKeysNoEconomyShadow: 0,
    dominanceKeysNoGoal: 0,
    dominanceUsageParetoStates: 0,
    dominanceUsageParetoDominated: 0,
    dominanceUsageParetoMultiStateGroups: 0,
    retainedDominanceStates: 0,
    timingSampledNodes: 0,
    timingPopulationNodes: 0
  };
  const detailedProfiling = Boolean(options.contextualDetailedProfiling);
  const profileSampleInterval = detailedProfiling ? 64 : 1;
  let profileSampleActive = false;
  let profilePoppedNodes = 0;
  let profileTimedNodes = 0;
  const profileNow = () => (profileSampleActive ? analysisTelemetryNow() : 0);
  const dynamicGoal = options.dynamicGoal ?? null;
  const maxRoutes = Math.max(1, Math.floor(Number(options.maxRoutes) || 1));
  const initialMaxExpansions = Math.max(1, Math.floor(Number(options.maxExpansions) || 700));
  const initialMaxActions = Math.max(1, Math.floor(Number(options.maxActions) || CONTEXTUAL_LEG_MAX_ACTIONS));
  const resumeExhaustiveOnMiss = Boolean(
    options.contextualResumeExhaustiveOnMiss &&
    Number.isFinite(initialMaxExpansions) &&
    Number.isFinite(initialMaxActions)
  );
  let activeMaxExpansions = initialMaxExpansions;
  let activeMaxActions = initialMaxActions;
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const cheapDynamicArchiveApproximation = options.recoveryRule === "dynamic_archiving";
  const cheapDynamicArchiveOrigin = cheapDynamicArchiveApproximation
    ? { x: context.state.x, y: context.state.y }
    : null;
  const simulationOptions = {
    ...options,
    portalMap,
    rebootStart: options.rebootStart ?? context.rebootStart ?? null,
    contextualCheapDynamicArchiveApproximation: cheapDynamicArchiveApproximation,
    contextualCheapDynamicArchiveOrigin: cheapDynamicArchiveOrigin,
    contextualPhysicalTemplateOnly: true
  };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(simulationOptions);
  const energyDominanceBoundConfig = getRouteEnergyDominanceBoundConfig(options);
  const queue = new MinHeap((entry) => entry.estimate);
  let bestCostByState = new Map();
  const cloneNestedBestCostMap = (source) => new Map(
    [...source.entries()].map(([primaryCode, secondary]) => [
      primaryCode,
      new Map(secondary)
    ])
  );

  // v48zj cheap-card hot-path memoization. Browser generation passes one explicit
  // memo context through all preflight/primary/repair/traffic searches. Partition
  // it by a card-rule signature so transitions can be reused across route searches
  // without ever crossing incompatible variant semantics. Older/direct callers that
  // do not provide a generation context retain v48zh's search-local behavior.
  const cardMemoRuleSignature = String(
    options.contextualEstimatedCardTransitionMemoRuleSignature ??
    `literal-hg-v49ek|${getProgramCardModelSignature(options)}`
  );
  const generationCardMemoContext =
    options.contextualEstimatedCardTransitionMemoContext &&
    typeof options.contextualEstimatedCardTransitionMemoContext === "object"
      ? options.contextualEstimatedCardTransitionMemoContext
      : null;
  if (generationCardMemoContext && !(generationCardMemoContext.byRuleSignature instanceof Map)) {
    generationCardMemoContext.byRuleSignature = new Map();
  }
  let estimatedCardMemoStore = generationCardMemoContext
    ? generationCardMemoContext.byRuleSignature.get(cardMemoRuleSignature)
    : null;
  if (!estimatedCardMemoStore) {
    estimatedCardMemoStore = {
      estimatedDemandStepCache: new Map(),
      estimatedForecastStepCache: new Map(),
      estimatedCompactCardOptionsCache: new Map(),
      estimatedForecastCloseCache: new Map(),
      estimatedForecastFrontierIds: new WeakMap(),
      estimatedForecastCanonicalByKey: new Map(),
      nextEstimatedForecastFrontierId: 1
    };
    if (generationCardMemoContext) {
      generationCardMemoContext.byRuleSignature.set(
        cardMemoRuleSignature,
        estimatedCardMemoStore
      );
    }
  }
  const {
    estimatedDemandStepCache,
    estimatedForecastStepCache,
    estimatedCompactCardOptionsCache,
    estimatedForecastCloseCache,
    estimatedForecastFrontierIds,
    estimatedForecastCanonicalByKey
  } = estimatedCardMemoStore;
  const estimatedDemandContextSpace =
    4 * COMPACT_PROGRAM_ACTION_RADIX * REGISTER_COUNT * COMPACT_PROGRAM_ACTION_RADIX;

  const canonicalizeEstimatedForecastFrontier = (frontier) => {
    if (!Array.isArray(frontier) || !frontier.length) return [];
    const knownId = estimatedForecastFrontierIds.get(frontier);
    if (knownId) return frontier;
    const key = frontier.map((entry) => (
      `${getCompactProgramCardStateCode(entry.state)}:${Number(entry.penalty) || 0}`
    )).join("|");
    const existing = estimatedForecastCanonicalByKey.get(key);
    if (existing) {
      estimatedForecastFrontierIds.set(frontier, existing.id);
      return existing.frontier;
    }
    const id = estimatedCardMemoStore.nextEstimatedForecastFrontierId++;
    estimatedForecastFrontierIds.set(frontier, id);
    estimatedForecastCanonicalByKey.set(key, { id, frontier });
    return frontier;
  };

  const getEstimatedForecastFrontierId = (frontier) => {
    const canonical = canonicalizeEstimatedForecastFrontier(frontier);
    if (!canonical.length) return 0;
    return estimatedForecastFrontierIds.get(canonical) || 0;
  };

  const getMemoizedEstimatedDemandStep = (
    previousDemandCode,
    currentDemandCode,
    previousAgainUsed,
    currentAgainUsed,
    previousActionId,
    absoluteActions,
    actionId
  ) => {
    const previousDemand = Math.max(0, Math.floor(Number(previousDemandCode) || 0));
    const currentDemand = Math.max(0, Math.floor(Number(currentDemandCode) || 0));
    const previousAgain = Math.max(0, Math.min(1, Math.floor(Number(previousAgainUsed) || 0)));
    const currentAgain = Math.max(0, Math.min(1, Math.floor(Number(currentAgainUsed) || 0)));
    const previousActionCode = COMPACT_PROGRAM_ACTION_CODE.get(previousActionId) || 0;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const contextCode = (
      ((((previousAgain * 2 + currentAgain) * COMPACT_PROGRAM_ACTION_RADIX +
        previousActionCode) * REGISTER_COUNT + phase) *
        COMPACT_PROGRAM_ACTION_RADIX) + actionCode
    );
    const pairCode = previousDemand * APPROX_PROGRAM_DEMAND_SPACE + currentDemand;
    const numericKey = pairCode * estimatedDemandContextSpace + contextCode;
    const key = Number.isSafeInteger(numericKey)
      ? numericKey
      : `${previousDemand}|${currentDemand}|${previousAgain}|${currentAgain}|${previousActionCode}|${phase}|${actionCode}`;
    const cached = estimatedDemandStepCache.get(key);
    if (cached) {
      profile.estimatedDemandMemoHits += 1;
      return cached;
    }
    profile.estimatedDemandMemoMisses += 1;
    const step = getEstimatedProgramDemandStep(
      previousDemandCode,
      currentDemandCode,
      previousAgainUsed,
      currentAgainUsed,
      previousActionId,
      absoluteActions,
      actionId,
      options
    );
    estimatedDemandStepCache.set(key, step);
    return step;
  };

  const getMemoizedCompactProgramCardOptions = (
    cardState,
    absoluteActions,
    actionId
  ) => {
    const stateCode = getCompactProgramCardStateCode(cardState);
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const key = (
      (stateCode * REGISTER_COUNT + phase) * COMPACT_PROGRAM_ACTION_RADIX +
      actionCode
    );
    const cached = estimatedCompactCardOptionsCache.get(key);
    if (cached) {
      profile.estimatedCompactCardMemoHits += 1;
      return cached;
    }
    profile.estimatedCompactCardMemoMisses += 1;
    const cardOptions = getCompactProgramCardOptions(
      cardState,
      absoluteActions,
      actionId,
      options
    );
    estimatedCompactCardOptionsCache.set(key, cardOptions);
    return cardOptions;
  };

  const getMemoizedEstimatedForecastStep = (frontier, absoluteActions, actionId) => {
    const canonicalFrontier = canonicalizeEstimatedForecastFrontier(frontier);
    const frontierId = getEstimatedForecastFrontierId(canonicalFrontier);
    const phase = Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT;
    const actionCode = COMPACT_PROGRAM_ACTION_CODE.get(actionId) || 0;
    const key = (
      (frontierId * REGISTER_COUNT + phase) * COMPACT_PROGRAM_ACTION_RADIX +
      actionCode
    );
    const cached = estimatedForecastStepCache.get(key);
    if (cached) {
      profile.estimatedForecastMemoHits += 1;
      return cached;
    }
    profile.estimatedForecastMemoMisses += 1;
    const beforeUnionPenalty =
      getEstimatedCardFrontierUnionAvailabilityPenalty(canonicalFrontier, options);
    const rawUnionFrontier = [];
    const next = new Map();
    for (const entry of canonicalFrontier) {
      const cardOptions = getMemoizedCompactProgramCardOptions(
        entry.state,
        absoluteActions,
        actionId
      );
      for (const cardOption of cardOptions) {
        rawUnionFrontier.push({
          state: {
            feasible: true,
            previousCode: Math.max(
              0,
              Math.floor(Number(entry.state?.previousCode) || 0)
            ),
            currentCode: Math.max(
              0,
              Math.floor(Number(cardOption.currentCode) || 0)
            ),
            previousActionId: actionId
          },
          penalty: 0
        });
        const penalty = entry.penalty + Math.max(0, Number(cardOption.penalty) || 0);
        const stateKey = getCompactProgramCardStateCode(cardOption.state);
        const previous = next.get(stateKey);
        if (!previous || penalty + 0.001 < previous.penalty) {
          next.set(stateKey, {
            state: cardOption.state,
            penalty
          });
        }
      }
    }
    const retained = [...next.values()]
      .sort((left, right) => left.penalty - right.penalty)
      .slice(0, ESTIMATED_CARD_FORECAST_FRONTIER_LIMIT);
    const afterUnionPenalty =
      getEstimatedCardFrontierUnionAvailabilityPenalty(rawUnionFrontier, options);
    const unionPenaltyDelta = Number.isFinite(afterUnionPenalty)
      ? Number(Math.max(
        0,
        afterUnionPenalty -
          (Number.isFinite(beforeUnionPenalty) ? beforeUnionPenalty : 0)
      ).toFixed(3))
      : Infinity;
    const result = {
      feasible: retained.length > 0,
      frontier: retained.length
        ? canonicalizeEstimatedForecastFrontier(retained)
        : [],
      unionPenaltyDelta
    };
    estimatedForecastStepCache.set(key, result);
    return result;
  };

  const getMemoizedClosedEstimatedForecastFrontier = (frontier) => {
    const canonicalFrontier = canonicalizeEstimatedForecastFrontier(frontier);
    const frontierId = getEstimatedForecastFrontierId(canonicalFrontier);
    const cached = estimatedForecastCloseCache.get(frontierId);
    if (cached) return cached;
    const closed = canonicalizeEstimatedForecastFrontier(
      closeEstimatedCardForecastFrontierForEndedTurn(canonicalFrontier, options)
    );
    estimatedForecastCloseCache.set(frontierId, closed);
    return closed;
  };

  const rootEstimatedCardFrontier = canonicalizeEstimatedForecastFrontier(
    cloneEstimatedCardForecastFrontier(
      context.estimatedCardFrontier,
      context.programCardState
    )
  );
  const rootEstimatedCardForecastFeasible =
    context.estimatedCardForecastFeasible !== false &&
    rootEstimatedCardFrontier.length > 0;

  const forbiddenFirstActions = new Set(
    Array.isArray(options.contextualForbiddenFirstActions)
      ? options.contextualForbiddenFirstActions
      : []
  );
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];
  for (const facing of initialFacings) {
    const initialState = { x: context.state.x, y: context.state.y, facing };
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
      approximateCardPlausibilityPenalty: 0,
      approximatePreviousProgramDemandCode:
        Math.max(0, Number(context.approximatePreviousProgramDemandCode) || 0),
      approximateProgramDemandCode:
        Math.max(0, Number(context.approximateProgramDemandCode) || 0),
      approximatePreviousAgainUsed:
        Math.max(0, Number(context.approximatePreviousAgainUsed) || 0),
      approximateCurrentAgainUsed:
        Math.max(0, Number(context.approximateCurrentAgainUsed) || 0),
      approximatePreviousScarceCode: 0,
      approximateCurrentScarceCode: 0,
      approximatePreviousActionId: context.approximatePreviousActionId ?? null,
      estimatedCardFrontier: rootEstimatedCardFrontier,
      estimatedCardForecastFeasible: rootEstimatedCardForecastFeasible,
      estimatedCardForecastPenalty: 0,
      // v33: Energy is advisory during physical discovery, just like the card
      // forecast. It may change route ordering but never physical dominance or
      // reachability. Exact/flattened economy is replayed again after realization.
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      routeEnergyShadowReserve: Number.isFinite(Number(context.energyReserve))
        ? Number(context.energyReserve)
        : getInitialRouteEnergyShadowReserve(options),
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      // At course start the archive marker is this robot's dock/start square;
      // later legs inherit the checkpoint/Battery most recently archived by the
      // route instead of resetting recovery state at every leg boundary.
      dynamicArchivePoint: options.recoveryRule === "dynamic_archiving"
        ? (context.dynamicArchivePoint
          ? { ...context.dynamicArchivePoint }
          : { x: initialState.x, y: initialState.y })
        : null
    };
    const physicalKey = getPhysicalTimingTemplateStateKey(
      initialState,
      root.absoluteActions,
      dynamicGoal,
      root.dynamicArchivePoint,
      options
    );
    const demandKey = options.contextualEstimatedCardWeightsOnly
      ? 0
      : getApproxProgramDemandStateCode(0, 0, 0, null);
    setNestedBestCost(bestCostByState, physicalKey, demandKey, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal, tileMap, options),
      searchPhysicalKey: physicalKey,
      searchDemandKey: demandKey
    });
  }

  const completed = [];
  const completedPathKeys = new Set();
  let expansions = 0;
  let workExpansions = 0;
  let firstGoalExpansion = null;
  let optionalTemplateStopExpansion = null;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let physicalCacheHits = 0;
  let physicalCacheMisses = 0;
  let resumeCheckpoint = null;
  let resumedExhaustive = false;
  let resumeCheckpointExpansions = 0;
  let resumeBoundedEndExpansions = 0;
  let resumeReplayExpansions = 0;

  while (true) {
    while (
      queue.size &&
      completed.length < maxRoutes &&
      expansions < activeMaxExpansions
    ) {
      if (
        optionalTemplateStopExpansion !== null &&
        expansions >= optionalTemplateStopExpansion
      ) {
        break;
      }
      // v48zs resumable widening: bounded and unlimited search are identical
      // until the 36-action horizon first blocks the heap head. Snapshot that
      // exact pre-pop state once. If bounded search later returns no route, the
      // exhaustive phase restores this checkpoint instead of restarting at the
      // leg root. If the expansion cap arrives first, the live queue/map can be
      // continued directly with no replay at all.
      if (
        resumeExhaustiveOnMiss &&
        !resumedExhaustive &&
        !resumeCheckpoint &&
        activeMaxActions < Infinity &&
        queue.items[0]?.localActions >= activeMaxActions
      ) {
        resumeCheckpoint = {
          queueItems: queue.items.slice(),
          bestCostByState: cloneNestedBestCostMap(bestCostByState),
          expansions,
          maxLocalActionsSeen
        };
      }
    profileSampleActive = detailedProfiling &&
      (profilePoppedNodes % profileSampleInterval === 0);
    if (profileSampleActive) profileTimedNodes += 1;
    profilePoppedNodes += 1;
    if (
      cooperativeSearchSlices &&
      profilePoppedNodes >= nextCooperativeTimeCheckPop
    ) {
      nextCooperativeTimeCheckPop = profilePoppedNodes + cooperativeCheckPops;
      // Optional work guard (generation's route-work budget). It runs at this
      // step-count boundary, not on the clock, so a candidate is always stopped
      // at the same point and generation stays deterministic. It may throw.
      if (typeof options.contextualWorkGuard === "function") {
        options.contextualWorkGuard(workExpansions);
      }
      const checkedAt = analysisTelemetryNow();
      if (checkedAt - cooperativeSliceWorkStartedAt >= cooperativeSliceMs) {
        cooperativeMaxSliceWorkMs = Math.max(
          cooperativeMaxSliceWorkMs,
          checkedAt - cooperativeSliceWorkStartedAt
        );
        cooperativeSliceCount += 1;
        yield {
          phase: "route-search-slice",
          searchKind: resumedExhaustive
            ? (options.contextualResumeTelemetryKind ?? options.contextualTelemetryKind ?? "estimated-physical-leg-exhaustive")
            : (options.contextualTelemetryKind ?? "contextual-physical-template"),
          expansions: workExpansions,
          poppedNodes: profilePoppedNodes,
          targetSliceMs: cooperativeSliceMs
        };
        const resumedAt = analysisTelemetryNow();
        cooperativePausedMs += Math.max(0, resumedAt - checkedAt);
        cooperativeSliceWorkStartedAt = resumedAt;
        nextCooperativeTimeCheckPop = profilePoppedNodes + cooperativeCheckPops;
      }
    }

    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;
    profile.exactContextualExpansions += 1;

    blockStartedAt = profileNow();
    const currentPhysicalKey = current.searchPhysicalKey ?? getPhysicalTimingTemplateStateKey(
      current.finalState,
      current.absoluteActions,
      dynamicGoal,
      current.dynamicArchivePoint,
      options
    );
    const currentDemandKey = current.searchDemandKey ?? (
      options.contextualEstimatedCardWeightsOnly
        ? 0
        : getApproxProgramDemandStateCode(
          current.approximateProgramDemandCode,
          current.approximatePreviousScarceCode,
          current.approximateCurrentScarceCode,
          current.approximatePreviousActionId
        )
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = getNestedBestCost(
      bestCostByState,
      currentPhysicalKey,
      currentDemandKey
    );
    if (knownBest !== undefined && current.baseCost > knownBest + 0.001) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);
    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(current, goal, dynamicGoal);
    profile.goalCompletionMs += profileNow() - blockStartedAt;
    if (reachesGoal) {
      blockStartedAt = profileNow();
      const transitions = reconstructRouteTransitions(current);
      const path = buildTimeline(transitions, current.initialState);
      const hitTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
      const template = {
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
            displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
          }
          : null,
        actions: current.localActions,
        absoluteStartAction: context.absoluteActions,
        absoluteActions: current.absoluteActions,
        distance: current.distance,
        forcedDistance: current.forcedDistance,
        hazard: Number(current.hazard.toFixed(2)),
        rebootPenalty: current.rebootPenalty,
        conveyorComplexity: scoreConveyorComplexity({ transitions }, hitTarget),
        rebootCount: transitions.filter((transition) => transition.rebooted).length,
        score: Number(current.baseCost.toFixed(2)),
        routeEnergyEconomyRewardScore: Number(
          (current.routeEnergyEconomyRewardScore || 0).toFixed(2)
        ),
        batteryEconomyRewardScore: Number(
          (current.batteryEconomyRewardScore || 0).toFixed(2)
        ),
        powerUpEconomyRewardScore: Number(
          (current.powerUpEconomyRewardScore || 0).toFixed(2)
        ),
        chopShopEconomyRewardScore: Number(
          (current.chopShopEconomyRewardScore || 0).toFixed(2)
        ),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve,
        dynamicArchivePointStart: options.recoveryRule === "dynamic_archiving"
          ? (context.dynamicArchivePoint
            ? { ...context.dynamicArchivePoint }
            : { x: current.initialState.x, y: current.initialState.y })
          : null,
        dynamicArchivePointEnd: current.dynamicArchivePoint
          ? { ...current.dynamicArchivePoint }
          : null,
        routeUpgradeCardShadowUnitsStart: 0,
        routeUpgradeCardShadowUnitsEnd: 0,
        routeEconomyNormalDraws: 0,
        routeEconomyInstalls: 0,
        routeEconomyExtraCardDraws: 0,
        routeEconomyEnergySpent: 0,
        chopShopCardChoices: 0,
        chopShopEnergyChoices: 0,
        cardAvailabilityPenalty: 0,
        programPlausibilityPenalty: 0,
        approximateCardPlausibilityPenalty: Number(
          (current.approximateCardPlausibilityPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastPenalty: Number(
          (current.estimatedCardForecastPenalty || 0).toFixed(2)
        ),
        estimatedCardForecastFeasible:
          current.estimatedCardForecastFeasible !== false,
        estimatedCardFrontierEnd: cloneEstimatedCardForecastFrontier(
          current.estimatedCardFrontier
        ),
        estimatedDemandStateEnd: {
          previousDemandCode: current.approximatePreviousProgramDemandCode || 0,
          demandCode: current.approximateProgramDemandCode || 0,
          previousAgainUsed: current.approximatePreviousAgainUsed || 0,
          currentAgainUsed: current.approximateCurrentAgainUsed || 0,
          previousActionId: current.approximatePreviousActionId ?? null
        },
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: [],
        goalReached: true,
        fullCourseLeg: true,
        physicalTimingTemplate: true
      };
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      profile.completedGoals += 1;
      if (
        (options.recoveryRule === "dynamic_archiving" || !options.recoveryRule) &&
        routeTouchesPit(tileMap, template)
      ) {
        continue;
      }
      if (options.recoveryRule === "dynamic_archiving") {
        const archiveReward = scoreDynamicArchivingRouteUtility(tileMap, template, options);
        template.dynamicArchivingRewardScore = archiveReward;
        template.score = Number((template.score - archiveReward).toFixed(2));
      }
      // v49bc: mental RE is authoritative completed-route scoring, not hot
      // pathfinder state. Replay the finished candidate once, then use that
      // score only when ranking the small completed-candidate set.
      const mental = replaySearchIntrinsicMentalForContext(
        tileMap,
        template,
        context,
        options,
        true
      );
      Object.assign(template, mental);
      template.score = Number((
        template.score + getCompletedRoutePostbuildScoreAdjustment(mental)
      ).toFixed(2));
      const templatePathKey = options.contextualReturnAllEstimatedPaths
        ? getEstimatedRouteIdentity(template)
        : getRoutePathKey(template);
      if (completedPathKeys.has(templatePathKey)) {
        continue;
      }
      completedPathKeys.add(templatePathKey);
      completed.push(template);
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (maxRoutes > 1) {
          optionalTemplateStopExpansion = Math.min(
            activeMaxExpansions,
            expansions + Math.max(
              0,
              Math.floor(Number(options.optionalTemplateExpansions) || 120)
            )
          );
        }
      }
      continue;
    }

    expansions += 1;
    workExpansions += 1;
    if (current.localActions >= activeMaxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ?? goal;
    for (const action of ACTIONS) {
      profile.actionCandidates += 1;
      if (current.localActions === 0 && forbiddenFirstActions.has(action.id)) {
        continue;
      }
      blockStartedAt = profileNow();
      profile.cardOptionCalls += 1;
      const estimatedDemandStep = options.contextualEstimatedCardWeightsOnly
        ? getMemoizedEstimatedDemandStep(
          current.approximatePreviousProgramDemandCode,
          current.approximateProgramDemandCode,
          current.approximatePreviousAgainUsed,
          current.approximateCurrentAgainUsed,
          current.approximatePreviousActionId,
          current.absoluteActions,
          action.id
        )
        : null;
      const demandSteps = options.contextualEstimatedCardWeightsOnly
        ? (estimatedDemandStep ? [estimatedDemandStep] : [])
        : options.contextualApproximateCardWeights
          ? getApproxProgramDemandOptions(
            current.approximateProgramDemandCode,
            current.approximatePreviousScarceCode,
            current.approximateCurrentScarceCode,
            current.approximatePreviousActionId,
            current.absoluteActions,
            action.id,
            options
          )
          : [{
            demandCode: current.approximateProgramDemandCode || 0,
            previousScarceCode: current.approximatePreviousScarceCode || 0,
            currentScarceCode: current.approximateCurrentScarceCode || 0,
            previousActionId: action.id,
            penalty: 0,
            approximateProgramCard: action.id
          }];
      if (!demandSteps.length) continue;

      const forecastStep = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false
      )
        ? getMemoizedEstimatedForecastStep(
          current.estimatedCardFrontier,
          current.absoluteActions,
          action.id
        )
        : {
          feasible: false,
          frontier: []
        };
      const forecastBreakPenalty = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false &&
        !forecastStep.feasible
      )
        ? ESTIMATED_CARD_FORECAST_BREAK_PENALTY
        : 0;
      const unionFrontierCardPenalty = (
        options.contextualEstimatedCardWeightsOnly &&
        current.estimatedCardForecastFeasible !== false &&
        forecastStep.feasible &&
        Number.isFinite(forecastStep.unionPenaltyDelta)
      )
        ? forecastStep.unionPenaltyDelta
        : null;
      profile.cardOptionsMs += profileNow() - blockStartedAt;

      // All approximate literal-card allocations produce the same executed board
      // action. v48zd caches only the board mechanics here. Recovery destination
      // and recovery-aware pit/edge pressure are restored after the template is
      // known, so Dynamic Archiving no longer resolves an archive proxy before
      // every ordinary candidate action.
      blockStartedAt = profileNow();
      profile.simulationCalls += 1;
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT,
          dynamicArchivePoint: current.dynamicArchivePoint,
          contextualPhysicalMissProfile: profileSampleActive ? profile : null
        },
        physicalOptionSignature
      );
      const simulationElapsed = profileNow() - blockStartedAt;
      profile.simulationMs += simulationElapsed;
      if (physicalResult.hit) {
        physicalCacheHits += 1;
        profile.physicalCacheHits += 1;
        profile.simulationHitMs += simulationElapsed;
      } else {
        physicalCacheMisses += 1;
        profile.physicalCacheMisses += 1;
        profile.simulationMissMs += simulationElapsed;
      }
      const transition = physicalResult.transition;
      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getRouteAwareActionPenalty(action, options);
      profile.actionScoringMs += profileNow() - blockStartedAt;
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];

      for (const demandStep of demandSteps) {
        for (const destination of destinations) {
          profile.destinationCandidates += 1;
          blockStartedAt = profileNow();
          const executedAbsoluteAction = current.absoluteActions + 1;
          const nextAbsoluteActions = transition.rebooted
            ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
            : executedAbsoluteAction;
          const finalizedDemandStep = transition.rebooted
            ? closeEstimatedProgramDemandForEndedTurn(demandStep, options)
            : demandStep;
          const finalizedForecastFrontier = transition.rebooted && forecastStep.feasible
            ? getMemoizedClosedEstimatedForecastFrontier(forecastStep.frontier)
            : forecastStep.frontier;
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(executedAbsoluteAction)
            : (transition.rebootPenalty || 0);
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextDynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            destination,
            current.dynamicArchivePoint,
            options
          );
          profile.archiveContextMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const preEnergyBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            actionPenalty +
            (
              Number.isFinite(unionFrontierCardPenalty)
                ? unionFrontierCardPenalty
                : finalizedDemandStep.penalty
            ) +
            forecastBreakPenalty;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextPhysicalKey = getPhysicalTimingTemplateStateKey(
            destination,
            nextAbsoluteActions,
            dynamicGoal,
            nextDynamicArchivePoint,
            options
          );
          const nextDemandKey = options.contextualEstimatedCardWeightsOnly
            ? 0
            : getApproxProgramDemandStateCode(
              finalizedDemandStep.demandCode,
              finalizedDemandStep.previousScarceCode,
              finalizedDemandStep.currentScarceCode,
              finalizedDemandStep.previousActionId
            );
          profile.nextKeyMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const priorBest = getNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey
          );
          if (priorBest !== undefined) {
            const energyRewardUpperBound = options.contextualEstimatedEnergyGuidance === false
              ? 0
              : getRouteEnergyDominanceRewardUpperBound(
                tileMap,
                destination,
                action.id,
                energyDominanceBoundConfig
              );
            if (preEnergyBaseCost - energyRewardUpperBound >= priorBest - 0.001) {
              profile.dominatedStates += 1;
              profile.earlyDominanceEnergyBoundPrunes += 1;
              profile.dominanceMs += profileNow() - blockStartedAt;
              continue;
            }
          }
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const energyStep = options.contextualEstimatedEnergyGuidance === false
            ? {
              rewardScore: 0,
              batteryRewardScore: 0,
              powerUpRewardScore: 0,
              chopShopRewardScore: 0,
              reserveAfter: current.routeEnergyShadowReserve
            }
            : getRouteEnergyShadowStep(
              tileMap,
              destination,
              action.id,
              executedAbsoluteAction,
              current.routeEnergyShadowReserve,
              0,
              options,
              transition
            );
          profile.energyMs += profileNow() - blockStartedAt;
          const energyEconomyRewardScore = Math.max(
            0,
            Number(energyStep.rewardScore) || 0
          );
          const nextBaseCost = preEnergyBaseCost - energyEconomyRewardScore;

          blockStartedAt = profileNow();
          if (priorBest !== undefined && nextBaseCost >= priorBest - 0.001) {
            profile.dominatedStates += 1;
            profile.dominanceMs += profileNow() - blockStartedAt;
            continue;
          }
          setNestedBestCost(
            bestCostByState,
            nextPhysicalKey,
            nextDemandKey,
            nextBaseCost
          );
          profile.acceptedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const transitionForDestination = {
            ...(transition.rebootChoices?.length
              ? { ...transition, to: destination }
              : transition),
            absoluteAction: executedAbsoluteAction
          };
          const nextRoute = {
            finalState: destination,
            initialState: current.initialState,
            startFacing: current.startFacing,
            parent: current,
            transition: transitionForDestination,
            localActions: current.localActions + 1,
            absoluteActions: nextAbsoluteActions,
            distance: current.distance + transition.distance,
            forcedDistance: current.forcedDistance + transition.forcedDistance,
            hazard: current.hazard + transition.hazard,
            rebootPenalty: current.rebootPenalty + transitionRebootPenalty,
            baseCost: nextBaseCost,
            approximateCardPlausibilityPenalty:
              (current.approximateCardPlausibilityPenalty || 0) +
              (
                Number.isFinite(unionFrontierCardPenalty)
                  ? unionFrontierCardPenalty
                  : finalizedDemandStep.penalty
              ),
            approximatePreviousProgramDemandCode:
              finalizedDemandStep.previousDemandCode ?? current.approximatePreviousProgramDemandCode ?? 0,
            approximateProgramDemandCode: finalizedDemandStep.demandCode,
            approximatePreviousAgainUsed:
              finalizedDemandStep.previousAgainUsed ?? current.approximatePreviousAgainUsed ?? 0,
            approximateCurrentAgainUsed:
              finalizedDemandStep.currentAgainUsed ?? current.approximateCurrentAgainUsed ?? 0,
            approximatePreviousScarceCode: finalizedDemandStep.previousScarceCode,
            approximateCurrentScarceCode: finalizedDemandStep.currentScarceCode,
            approximatePreviousActionId: finalizedDemandStep.previousActionId,
            estimatedCardFrontier: forecastStep.feasible
              ? finalizedForecastFrontier
              : [],
            estimatedCardForecastFeasible:
              current.estimatedCardForecastFeasible !== false &&
              forecastStep.feasible,
            estimatedCardForecastPenalty:
              (current.estimatedCardForecastPenalty || 0) +
              forecastBreakPenalty,
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) +
              (Number(energyStep.batteryRewardScore) || 0),
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) +
              (Number(energyStep.powerUpRewardScore) || 0),
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) +
              (Number(energyStep.chopShopRewardScore) || 0),
            routeEnergyShadowReserve:
              Number.isFinite(Number(energyStep.reserveAfter))
                ? Number(energyStep.reserveAfter)
                : current.routeEnergyShadowReserve,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart,
            dynamicArchivePoint: nextDynamicArchivePoint,
            hazardExposure:
              Math.max(0, Number(current.hazardExposure) || 0) +
              Math.max(0, Number(transition.hazard) || 0)
          };
          profile.routeNodeBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal, tileMap, options),
            searchPhysicalKey: nextPhysicalKey,
            searchDemandKey: nextDemandKey
          });
          profile.queueMs += profileNow() - blockStartedAt;
        }
      }
    }
    }

    if (
      resumeExhaustiveOnMiss &&
      !resumedExhaustive &&
      completed.length === 0 &&
      (
        expansions >= activeMaxExpansions ||
        actionHorizonStops > 0
      )
    ) {
      resumedExhaustive = true;
      resumeBoundedEndExpansions = expansions;
      if (resumeCheckpoint) {
        resumeCheckpointExpansions = resumeCheckpoint.expansions;
        resumeReplayExpansions = Math.max(
          0,
          resumeBoundedEndExpansions - resumeCheckpointExpansions
        );
        queue.items = resumeCheckpoint.queueItems.slice();
        bestCostByState = cloneNestedBestCostMap(
          resumeCheckpoint.bestCostByState
        );
        expansions = resumeCheckpoint.expansions;
        maxLocalActionsSeen = resumeCheckpoint.maxLocalActionsSeen;
      } else {
        resumeCheckpointExpansions = expansions;
      }
      activeMaxExpansions = Infinity;
      activeMaxActions = Infinity;
      optionalTemplateStopExpansion = null;
      actionHorizonStops = 0;
      continue;
    }
    break;
  }

  const sortedCompleted = (options.contextualReturnAllEstimatedPaths
    ? (() => {
      const seen = new Set();
      return completed.filter((route) => {
        const key = getEstimatedRouteIdentity(route);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })()
    : dedupeRoutes(completed)
  ).sort(compareScoredRouteLike);
  const selected = options.contextualReturnAllEstimatedPaths
    ? sortedCompleted.slice(0, maxRoutes)
    : selectDistinctRoutes(
      sortedCompleted,
      goal,
      maxRoutes
    );
  profile.retainedDominanceStates = bestCostByState.size;
  const profileTimingScale = detailedProfiling && profileTimedNodes > 0
    ? profilePoppedNodes / profileTimedNodes
    : 1;
  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "simulationHitMs",
    "simulationMissMs",
    // v48zn: physical-miss phase timers are collected only on sampled popped
    // nodes, exactly like simulationMissMs. Scale them with the same per-search
    // factor before aggregation so the phase shares use one consistent basis.
    "physicalMissLookupMs",
    "physicalMissProgrammedMs",
    "physicalMissProgramStartMs",
    "physicalMissProgramTeleporterMs",
    "physicalMissProgramMoveCheckMs",
    "physicalMissProgramBlockedMs",
    "physicalMissProgramLandingMs",
    "physicalMissProgramHazardMs",
    "physicalMissProgramPressureMs",
    "physicalMissProgramBookkeepingMs",
    "physicalMissProgramOilMs",
    "physicalMissBlueConveyorMs",
    "physicalMissGreenConveyorMs",
    "physicalMissCurrentMs",
    "physicalMissPusherMs",
    "physicalMissGearMs",
    "physicalMissCrusherMs",
    "physicalMissEndRegisterMs",
    "physicalMissCloneMs",
    "physicalMissRecoveryPressureMs",
    "physicalMissCacheStoreMs",
    "physicalMissFinalizeMs",
    "cardOptionsMs",
    "actionScoringMs",
    "energyMs",
    "archiveContextMs",
    "destinationBuildMs",
    "routeNodeBuildMs",
    "historyBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number((profile[key] * profileTimingScale).toFixed(2));
  });
  profile.timingSampledNodes = profileTimedNodes;
  profile.timingPopulationNodes = profilePoppedNodes;
  profile.physicalCacheHits = physicalCacheHits;
  profile.physicalCacheMisses = physicalCacheMisses;
  profile.completedGoals = completed.length;
  if (completed.length > 0) {
    profile.searchesWithGoal = 1;
    profile.firstGoalExpansionTotal = firstGoalExpansion ?? 0;
    profile.postFirstGoalExpansions = Math.max(0, expansions - (firstGoalExpansion ?? expansions));
  }

  const hitExpansionCap = expansions >= activeMaxExpansions;
  const reportedExpansions = resumeExhaustiveOnMiss
    ? workExpansions
    : expansions;
  if (hitExpansionCap) {
    if (completed.length > 0) {
      profile.cappedWithGoalSearches = 1;
      profile.cappedWithGoalExpansions = expansions;
    } else {
      profile.cappedZeroGoalSearches = 1;
      profile.cappedZeroGoalExpansions = expansions;
    }
  }
  selected.contextualSearchMeta = {
    expansions: reportedExpansions,
    searchStateExpansions: expansions,
    maxExpansions: activeMaxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    firstGoalExpansion,
    optionalTemplateStopExpansion,
    resumedExhaustive,
    resumeCheckpointExpansions,
    resumeBoundedEndExpansions,
    resumeReplayExpansions,
    resumeSavedRootExpansions: resumedExhaustive
      ? resumeCheckpointExpansions
      : 0,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteCapFailure: selected.length === 0 && hitExpansionCap,
    zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
    physicalTimingTemplate: true,
    approximateCardWeights: Boolean(options.contextualApproximateCardWeights),
    estimatedCardWeightsOnly: Boolean(options.contextualEstimatedCardWeightsOnly),
    unboundedPhysicalEstimate:
      !Number.isFinite(activeMaxExpansions) &&
      !Number.isFinite(activeMaxActions)
  };
  const routeSearchFinishedAt = analysisTelemetryNow();
  cooperativeMaxSliceWorkMs = Math.max(
    cooperativeMaxSliceWorkMs,
    routeSearchFinishedAt - cooperativeSliceWorkStartedAt
  );
  recordRouteSearchTelemetry(
    resumedExhaustive
      ? (options.contextualResumeTelemetryKind ?? options.contextualTelemetryKind ?? "estimated-physical-leg-exhaustive")
      : (options.contextualTelemetryKind ?? "contextual-physical-template"),
    telemetryStartedAt,
    {
      durationMs: Math.max(0, routeSearchFinishedAt - telemetryStartedAt - cooperativePausedMs),
      expansions: reportedExpansions,
      maxExpansions: activeMaxExpansions,
      completedRoutes: completed.length,
      returnedRoutes: selected.length,
      hitExpansionCap,
      actionHorizonStops,
      maxLocalActionsSeen,
      hitActionHorizon: actionHorizonStops > 0,
      zeroRouteHorizonFailure: selected.length === 0 && actionHorizonStops > 0,
      physicalTimingTemplate: true,
      physicalCacheHits,
      physicalCacheMisses,
      resumedExhaustive,
      resumeCheckpointExpansions,
      resumeBoundedEndExpansions,
      resumeReplayExpansions,
      resumeSavedRootExpansions: resumedExhaustive
        ? resumeCheckpointExpansions
        : 0,
      cooperativeSlices: cooperativeSliceCount,
      cooperativePausedMs: Number(cooperativePausedMs.toFixed(2)),
      cooperativeMaxSliceWorkMs: Number(cooperativeMaxSliceWorkMs.toFixed(2)),
      contextualProfile: profile,
      start: {
        x: context.state.x,
        y: context.state.y,
        facing: context.state.facing ?? null
      },
      goal: { x: goal.x, y: goal.y }
    }
  );
  return selected;
}

export function enumeratePhysicalTimingLegTemplates(
  tileMap,
  context,
  goal,
  options = {}
) {
  return runGeneratorSynchronously(
    enumeratePhysicalTimingLegTemplatesSteps(tileMap, context, goal, options)
  );
}

export function enumerateContextualLegRoutes(
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
    simulationHitMs: 0,
    simulationMissMs: 0,
    physicalMissLookupMs: 0,
    physicalMissProgrammedMs: 0,
    physicalMissProgramStartMs: 0,
    physicalMissProgramTeleporterMs: 0,
    physicalMissProgramMoveCheckMs: 0,
    physicalMissProgramBlockedMs: 0,
    physicalMissProgramLandingMs: 0,
    physicalMissProgramHazardMs: 0,
    physicalMissProgramPressureMs: 0,
    physicalMissProgramBookkeepingMs: 0,
    physicalMissProgramOilMs: 0,
    physicalMissBlueConveyorMs: 0,
    physicalMissGreenConveyorMs: 0,
    physicalMissCurrentMs: 0,
    physicalMissPusherMs: 0,
    physicalMissGearMs: 0,
    physicalMissCrusherMs: 0,
    physicalMissEndRegisterMs: 0,
    physicalMissCloneMs: 0,
    physicalMissRecoveryPressureMs: 0,
    physicalMissCacheStoreMs: 0,
    physicalMissFinalizeMs: 0,
    physicalMissSampledCalls: 0,
    cardOptionsMs: 0,
    actionScoringMs: 0,
    energyMs: 0,
    archiveContextMs: 0,
    destinationBuildMs: 0,
    routeNodeBuildMs: 0,
    historyBuildMs: 0,
    nextKeyMs: 0,
    dominanceMs: 0,
    actionCandidates: 0,
    cardOptionCalls: 0,
    simulationCalls: 0,
    blockedTransitions: 0,
    programLegalityPrunes: 0,
    destinationCandidates: 0,
    acceptedStates: 0,
    dominatedStates: 0,
    completedGoals: 0,
    searchesWithGoal: 0,
    cappedZeroGoalSearches: 0,
    cappedWithGoalSearches: 0,
    firstGoalExpansionTotal: 0,
    postFirstGoalExpansions: 0,
    optionalCompletionSearches: 0,
    optionalCompletionStops: 0,
    optionalCompletionShortReturns: 0,
    cappedZeroGoalExpansions: 0,
    cappedWithGoalExpansions: 0,
    exactContextualSearches: 0,
    exactContextualExpansions: 0,
    horizonSolidSearches: 0,
    horizonUncertainSearches: 0,
    horizonSpeculativeSearches: 0,
    horizonFirstGoalUncertain: 0,
    horizonFirstGoalSpeculative: 0,
    horizonOptionalSuppressed: 0,
    physicalCacheHits: 0,
    physicalCacheMisses: 0,
    dominanceKeysFull: 0,
    dominanceKeysPhysical: 0,
    dominanceKeysPhysicalPhase: 0,
    dominanceKeysNoProgramDetail: 0,
    dominanceKeysNoPrevious: 0,
    dominanceKeysNoUsage: 0,
    dominanceKeysNoAgain: 0,
    dominanceKeysNoAbsolute: 0,
    dominanceKeysNoEnergy: 0,
    dominanceKeysNoCards: 0,
    dominanceKeysNoEconomyShadow: 0,
    dominanceKeysNoGoal: 0,
    dominanceUsageParetoStates: 0,
    dominanceUsageParetoDominated: 0,
    dominanceUsageParetoMultiStateGroups: 0,
    retainedDominanceStates: 0,
    timingSampledNodes: 0,
    timingPopulationNodes: 0
  };
  const detailedProfiling = Boolean(
    options.contextualDetailedProfiling || options.contextualDominanceKeyProfiling
  );
  // v48zn diagnostic fallback: use the same light 1-in-64 timing sample as the
  // estimate-first profiler. Route-search wall time and all counters remain exact.
  const profileSampleInterval = detailedProfiling ? 64 : 1;
  let profileSampleActive = detailedProfiling;
  let profilePoppedNodes = 0;
  let profileTimedNodes = 0;
  const profileNow = () => (profileSampleActive ? analysisTelemetryNow() : 0);

  const dynamicGoal = options.dynamicGoal ?? null;
  const maxOutputRoutes = options.maxRoutes ?? CONTEXTUAL_LATER_ROUTES;
  const completionPool = Math.max(
    maxOutputRoutes,
    options.completionPool ?? CONTEXTUAL_COMPLETION_POOL
  );
  const maxExpansions = options.maxExpansions ?? CONTEXTUAL_LATER_EXPANSIONS;
  const forcedActionIds = Array.isArray(options.contextualForcedActionIds)
    ? options.contextualForcedActionIds.filter((actionId) => typeof actionId === "string")
    : null;
  const maxActions = forcedActionIds
    ? forcedActionIds.length
    : (options.maxActions ?? CONTEXTUAL_LEG_MAX_ACTIONS);
  const incumbentRoutes = Array.isArray(options.contextualIncumbentRoutes)
    ? dedupeRoutes(options.contextualIncumbentRoutes.filter(Boolean)).sort(compareScoredRouteLike)
    : [];
  // v23: the dominance identity is exact at every horizon. Card depletion from
  // the previous and current five-register programs therefore cannot disappear
  // merely because a route is long. Uncertainty is handled only by route breadth.
  const forecastBandAtStart = getContextualForecastBand(
    context,
    options
  );
  if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
    profile.horizonSpeculativeSearches = 1;
  } else if (forecastBandAtStart === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
    profile.horizonUncertainSearches = 1;
  } else {
    profile.horizonSolidSearches = 1;
  }
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const simulationOptions = {
    ...options,
    portalMap,
    rebootStart: options.rebootStart ?? context.rebootStart ?? null,
    contextualPhysicalTemplateOnly: true
  };
  const physicalOptionSignature = getContextualPhysicalOptionSignature(
    simulationOptions
  );
  let queue = new MinHeap((entry) => entry.estimate);
  let bestCostByState = new Map();
  const initialFacings = options.startupSpinUp
    ? ROTATION_ORDER
    : [context.state.facing ?? "E"];

  // Economy shadow state depends on the incoming route context, not the startup
  // facing. Keep it outside the facing loop so accepted queue entries can safely
  // use the same fallback after the initial roots have been enqueued.
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  const initialEnergyReserve = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  const initialUpgradeCardUnits = Number.isFinite(Number(context.upgradeCardUnits))
    ? Number(context.upgradeCardUnits)
    : fallbackEconomyState.usefulCardUnits;

  for (const facing of initialFacings) {
    const initialState = {
      x: context.state.x,
      y: context.state.y,
      facing
    };
    const initialHistory = getProgramHistoryWindow(context.history);
    const initialProgramCardState = context.programCardState
      ? { ...context.programCardState }
      : getCompactProgramCardStateFromHistory(
        initialHistory,
        context.absoluteActions,
        options
      );
    if (!initialProgramCardState?.feasible) {
      continue;
    }
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
      routeEnergyEconomyRewardScore: 0,
      batteryEconomyRewardScore: 0,
      powerUpEconomyRewardScore: 0,
      chopShopEconomyRewardScore: 0,
      routeEnergyShadowReserve: initialEnergyReserve,
      routeEnergyShadowReserveStart: initialEnergyReserve,
      routeUpgradeCardShadowUnits: initialUpgradeCardUnits,
      routeUpgradeCardShadowUnitsStart: initialUpgradeCardUnits,
      routeEconomyNormalDraws: 0,
      routeEconomyInstalls: 0,
      routeEconomyExtraCardDraws: 0,
      routeEconomyEnergySpent: 0,
      chopShopCardChoices: 0,
      chopShopEnergyChoices: 0,
      baseCost: 0,
      cardAvailabilityPenalty: 0,
      programPlausibilityPenalty: 0,
      programCardState: initialProgramCardState,
      hazardExposure: Math.max(0, Number(context.hazardExposure) || 0),
      dynamicArchivePoint: options.recoveryRule === "dynamic_archiving"
        ? (context.dynamicArchivePoint
          ? { ...context.dynamicArchivePoint }
          : { x: initialState.x, y: initialState.y })
        : null
    };

    let blockStartedAt = profileNow();
    const keyParts = getContextualSearchNumericStateParts(
      initialState,
      context.absoluteActions,
      initialProgramCardState,
      dynamicGoal,
      root.dynamicArchivePoint,
      options
    );
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    setContextualBestCost(bestCostByState, keyParts, 0);
    queue.push({
      ...createContextualQueueEntry(root, goal, dynamicGoal, tileMap, options),
      searchPhysicalGoalCode: keyParts.physicalGoalCode,
      searchCardStateCode: keyParts.cardStateCode
    });
    profile.queueMs += profileNow() - blockStartedAt;
  }

  const completed = [...incumbentRoutes];
  let expansions = 0;
  let actionHorizonStops = 0;
  let maxLocalActionsSeen = 0;
  let firstGoalExpansion = completed.length ? 0 : null;
  let optionalCompletionAllowance = completed.length
    ? getContextualOptionalCompletionAllowance(
      context,
      maxExpansions,
      0,
      maxOutputRoutes,
      options
    )
    : 0;
  let optionalCompletionStopExpansion = completed.length
    ? Math.min(maxExpansions, optionalCompletionAllowance)
    : null;
  let stoppedForOptionalCompletionBudget = false;
  if (completed.length) {
    profile.completedGoals = completed.length;
  }

  while (
    queue.size &&
    completed.length < completionPool &&
    expansions < maxExpansions
  ) {
    profileSampleActive = detailedProfiling &&
      (profilePoppedNodes % profileSampleInterval === 0);
    if (profileSampleActive) profileTimedNodes += 1;
    profilePoppedNodes += 1;

    let blockStartedAt = profileNow();
    const current = queue.pop();
    profile.queueMs += profileNow() - blockStartedAt;
    maxLocalActionsSeen = Math.max(maxLocalActionsSeen, current.localActions);

    profile.exactContextualSearches = 1;
    profile.exactContextualExpansions += 1;

    blockStartedAt = profileNow();
    const currentParts = {
      physicalGoalCode: current.searchPhysicalGoalCode ?? getContextualArchiveAwarePhysicalGoalCode(
        current.finalState,
        current.absoluteActions,
        dynamicGoal,
        current.dynamicArchivePoint,
        options
      ),
      cardStateCode: current.searchCardStateCode ?? getCompactProgramCardStateCode(
        current.programCardState
      )
    };
    profile.currentKeyMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const knownBest = getContextualBestCost(bestCostByState, currentParts);
    if (
      knownBest !== undefined &&
      current.baseCost > knownBest + 0.001
    ) {
      profile.dominatedStates += 1;
      profile.dominanceMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.dominanceMs += profileNow() - blockStartedAt;

    blockStartedAt = profileNow();
    const reachesGoal = routeReachesContextualGoal(
      current,
      goal,
      dynamicGoal
    );
    if (reachesGoal) {
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
        routeEnergyEconomyRewardScore: Number((current.routeEnergyEconomyRewardScore || 0).toFixed(2)),
        batteryEconomyRewardScore: Number((current.batteryEconomyRewardScore || 0).toFixed(2)),
        powerUpEconomyRewardScore: Number((current.powerUpEconomyRewardScore || 0).toFixed(2)),
        chopShopEconomyRewardScore: Number((current.chopShopEconomyRewardScore || 0).toFixed(2)),
        routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
        routeEnergyShadowReserveEnd: current.routeEnergyShadowReserve ?? initialEnergyReserve,
        dynamicArchivePointStart: options.recoveryRule === "dynamic_archiving"
          ? (context.dynamicArchivePoint
            ? { ...context.dynamicArchivePoint }
            : { x: current.initialState.x, y: current.initialState.y })
          : null,
        dynamicArchivePointEnd: current.dynamicArchivePoint
          ? { ...current.dynamicArchivePoint }
          : null,
        routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
        routeUpgradeCardShadowUnitsEnd: current.routeUpgradeCardShadowUnits ?? initialUpgradeCardUnits,
        routeEconomyNormalDraws: current.routeEconomyNormalDraws || 0,
        routeEconomyInstalls: current.routeEconomyInstalls || 0,
        routeEconomyExtraCardDraws: current.routeEconomyExtraCardDraws || 0,
        routeEconomyEnergySpent: current.routeEconomyEnergySpent || 0,
        chopShopCardChoices: current.chopShopCardChoices || 0,
        chopShopEnergyChoices: current.chopShopEnergyChoices || 0,
        cardAvailabilityPenalty: Number(
          (current.cardAvailabilityPenalty || 0).toFixed(2)
        ),
        programPlausibilityPenalty: Number(
          (current.programPlausibilityPenalty || 0).toFixed(2)
        ),
        goalReached: true,
        fullCourseLeg: true,
        contextualForecastBand: getContextualForecastBand(
          { ...context, absoluteActions: current.absoluteActions },
          options
        ),
        contextualHazardExposure: current.hazardExposure,
        // v25: witness actions are reconstructed only for an accepted route.
        // Search nodes carry card counts, not a growing action-history array.
        localActionIds: transitions.map((transition) => transition.action).filter(Boolean),
        programHistoryEnd: getProgramHistoryWindow([
          ...getProgramHistoryWindow(context.history),
          ...transitions.map((transition) => transition.action).filter(Boolean)
        ]),
        programCardStateEnd: current.programCardState
          ? { ...current.programCardState }
          : null
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

      // v49bc: score mental load only after a complete route candidate exists.
      // Partial-state dominance remains the cheap pathfinder's state space.
      const mental = replaySearchIntrinsicMentalForContext(
        tileMap,
        route,
        context,
        options,
        true
      );
      Object.assign(route, mental);
      route.score = Number((
        route.score + getCompletedRoutePostbuildScoreAdjustment(mental)
      ).toFixed(2));

      profile.completedGoals += 1;
      if (firstGoalExpansion === null) {
        firstGoalExpansion = expansions;
        if (completionPool > 1) {
          const endpointBand = getContextualForecastBand(
            { ...context, absoluteActions: current.absoluteActions },
            options
          );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE) {
            profile.horizonFirstGoalSpeculative = 1;
          } else if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            profile.horizonFirstGoalUncertain = 1;
          }
          optionalCompletionAllowance = endpointBand === CONTEXTUAL_FORECAST_BANDS.SPECULATIVE
            ? 0
            : getContextualOptionalCompletionAllowance(
              context,
              maxExpansions,
              firstGoalExpansion,
              maxOutputRoutes,
              options
            );
          if (endpointBand === CONTEXTUAL_FORECAST_BANDS.UNCERTAIN) {
            optionalCompletionAllowance = Math.min(optionalCompletionAllowance, 45);
          }
          if (completionPool > 1 && optionalCompletionAllowance <= 0) {
            profile.horizonOptionalSuppressed = 1;
          }
          optionalCompletionStopExpansion = Math.min(
            maxExpansions,
            firstGoalExpansion + optionalCompletionAllowance
          );
        }
      }
      completed.push(route);
      profile.goalCompletionMs += profileNow() - blockStartedAt;
      continue;
    }
    profile.goalCompletionMs += profileNow() - blockStartedAt;

    if (
      firstGoalExpansion !== null &&
      completionPool > 1 &&
      optionalCompletionStopExpansion !== null &&
      expansions >= optionalCompletionStopExpansion
    ) {
      stoppedForOptionalCompletionBudget = true;
      break;
    }

    expansions += 1;
    if (current.localActions >= maxActions) {
      actionHorizonStops += 1;
      continue;
    }

    const currentTarget = (
      getDynamicGoalPosition(dynamicGoal, current.absoluteActions) ??
      goal
    );
    const candidateActions = forcedActionIds
      ? (() => {
        const forcedId = forcedActionIds[current.localActions];
        const forcedAction = ACTIONS.find((action) => action.id === forcedId) ?? null;
        return forcedAction ? [forcedAction] : [];
      })()
      : ACTIONS;

    for (const action of candidateActions) {
      profile.actionCandidates += 1;
      blockStartedAt = profileNow();
      const cardOptions = getCompactProgramCardOptions(
        current.programCardState,
        current.absoluteActions,
        action.id,
        options
      );
      profile.cardOptionsMs += profileNow() - blockStartedAt;
      profile.cardOptionCalls += 1;
      if (!cardOptions.length) {
        profile.programLegalityPrunes += 1;
        continue;
      }

      // Every literal card allocation that produces this executed action shares
      // the same board transition. Simulate it once, then branch only the tiny
      // card-count state.
      blockStartedAt = profileNow();
      const physicalResult = getCachedContextualPhysicalTransition(
        tileMap,
        current.finalState,
        action,
        {
          ...simulationOptions,
          goal: currentTarget,
          registerIndex: current.absoluteActions % REGISTER_COUNT,
          dynamicArchivePoint: current.dynamicArchivePoint,
          contextualPhysicalMissProfile: profileSampleActive ? profile : null
        },
        physicalOptionSignature
      );
      const transition = physicalResult.transition;
      profile.simulationCalls += 1;
      const simulationElapsedMs = profileNow() - blockStartedAt;
      if (physicalResult.hit) {
        profile.physicalCacheHits += 1;
        profile.simulationHitMs += simulationElapsedMs;
      } else {
        profile.physicalCacheMisses += 1;
        profile.simulationMissMs += simulationElapsedMs;
      }
      profile.simulationMs += simulationElapsedMs;

      if (transition.crashed || transition.blocked) {
        profile.blockedTransitions += 1;
        continue;
      }

      blockStartedAt = profileNow();
      const actionPenalty = getRouteAwareActionPenalty(action, options);
      const executedAbsoluteAction = current.absoluteActions + 1;
      const nextAbsoluteActions = transition.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      const destinations = transition.rebootChoices?.length
        ? transition.rebootChoices
        : [transition.to];
      profile.actionScoringMs += profileNow() - blockStartedAt;

      for (const cardOption of cardOptions) {
        const scarceReusePenalty = cardOption.penalty;
        const scarcityPenalty = Number(cardOption.scarcityPenalty) || 0;
        const programPlausibilityPenalty =
          Number(cardOption.programPlausibilityPenalty) || 0;
        for (const destination of destinations) {
          profile.destinationCandidates += 1;

          blockStartedAt = profileNow();
          const transitionRebootPenalty = transition.rebooted
            ? getRebootRoutePenalty(executedAbsoluteAction)
            : (transition.rebootPenalty || 0);
          const nextProgramCardState = transition.rebooted
            ? closeCompactProgramCardStateForEndedTurn(cardOption.state, options)
            : cardOption.state;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const energyStep = getRouteEnergyShadowStep(
            tileMap,
            destination,
            action.id,
            executedAbsoluteAction,
            current.routeEnergyShadowReserve,
            current.routeUpgradeCardShadowUnits,
            options,
            transition
          );
          profile.energyMs += profileNow() - blockStartedAt;
          const energyEconomyRewardScore = energyStep.rewardScore;
          const batteryEconomyRewardScore = energyStep.batteryRewardScore;
          const powerUpEconomyRewardScore = energyStep.powerUpRewardScore;
          const chopShopEconomyRewardScore = energyStep.chopShopRewardScore;

          blockStartedAt = profileNow();
          const nextHazardExposure =
            Math.max(0, Number(current.hazardExposure) || 0) +
            Math.max(0, Number(transition.hazard) || 0);
          const nextDynamicArchivePoint = getNextDynamicArchivePoint(
            tileMap,
            destination,
            current.dynamicArchivePoint,
            options
          );
          profile.archiveContextMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextBaseCost =
            current.baseCost +
            transition.hazard +
            transitionRebootPenalty +
            actionPenalty +
            scarceReusePenalty -
            energyEconomyRewardScore;
          profile.destinationBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const nextParts = getContextualSearchNumericStateParts(
            destination,
            nextAbsoluteActions,
            nextProgramCardState,
            dynamicGoal,
            nextDynamicArchivePoint,
            options
          );
          profile.nextKeyMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const priorBest = getContextualBestCost(bestCostByState, nextParts);
          if (
            priorBest !== undefined &&
            nextBaseCost >= priorBest - 0.001
          ) {
            profile.dominatedStates += 1;
            profile.dominanceMs += profileNow() - blockStartedAt;
            continue;
          }

          setContextualBestCost(bestCostByState, nextParts, nextBaseCost);
          profile.acceptedStates += 1;
          profile.dominanceMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          const transitionForDestination = {
            ...(transition.rebootChoices?.length
              ? { ...transition, to: destination }
              : transition),
            // Executed movement remains `action`; this records which literal card
            // supplied it. Again is therefore just another card in Dev diagnostics.
            programCard: cardOption.programCardId,
            absoluteAction: executedAbsoluteAction
          };
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
            routeEnergyEconomyRewardScore:
              (current.routeEnergyEconomyRewardScore || 0) + energyEconomyRewardScore,
            batteryEconomyRewardScore:
              (current.batteryEconomyRewardScore || 0) + batteryEconomyRewardScore,
            powerUpEconomyRewardScore:
              (current.powerUpEconomyRewardScore || 0) + powerUpEconomyRewardScore,
            chopShopEconomyRewardScore:
              (current.chopShopEconomyRewardScore || 0) + chopShopEconomyRewardScore,
            routeEnergyShadowReserve: energyStep.reserveAfter,
            routeEnergyShadowReserveStart: current.routeEnergyShadowReserveStart ?? initialEnergyReserve,
            routeUpgradeCardShadowUnits: energyStep.usefulCardUnitsAfter,
            routeUpgradeCardShadowUnitsStart: current.routeUpgradeCardShadowUnitsStart ?? initialUpgradeCardUnits,
            routeEconomyNormalDraws: (current.routeEconomyNormalDraws || 0) + (energyStep.normalDraws || 0),
            routeEconomyInstalls: (current.routeEconomyInstalls || 0) + (energyStep.installs || 0),
            routeEconomyExtraCardDraws: (current.routeEconomyExtraCardDraws || 0) + (energyStep.extraCardDraws || 0),
            routeEconomyEnergySpent: (current.routeEconomyEnergySpent || 0) + (energyStep.energySpent || 0),
            chopShopCardChoices: (current.chopShopCardChoices || 0) + (energyStep.chopShopChoice === "card" ? 1 : 0),
            chopShopEnergyChoices: (current.chopShopEnergyChoices || 0) + (energyStep.chopShopChoice === "energy" ? 1 : 0),
            baseCost: nextBaseCost,
            cardAvailabilityPenalty:
              (current.cardAvailabilityPenalty || 0) +
              scarcityPenalty,
            programPlausibilityPenalty:
              (current.programPlausibilityPenalty || 0) +
              programPlausibilityPenalty,
            programCardState: nextProgramCardState,
            hazardExposure: nextHazardExposure,
            dynamicArchivePoint: nextDynamicArchivePoint
          };
          profile.routeNodeBuildMs += profileNow() - blockStartedAt;

          blockStartedAt = profileNow();
          queue.push({
            ...createContextualQueueEntry(nextRoute, goal, dynamicGoal, tileMap, options),
            searchPhysicalGoalCode: nextParts.physicalGoalCode,
            searchCardStateCode: nextParts.cardStateCode
          });
          profile.queueMs += profileNow() - blockStartedAt;
        }
      }
    }
  }

  const deduped = dedupeRoutes(completed).sort(
    compareScoredRouteLike
  );
  const selectedRoutes = options.contextualTrafficAlternativeRetention && maxOutputRoutes > 1
    ? selectContextualTrafficAlternativeRoutes(
      deduped,
      goal,
      maxOutputRoutes
    )
    : selectDistinctRoutes(
      deduped,
      goal,
      maxOutputRoutes
    );

  profile.retainedDominanceStates = bestCostByState.size;

  const profileTimingScale = detailedProfiling && profileTimedNodes > 0
    ? profilePoppedNodes / profileTimedNodes
    : 1;
  [
    "queueMs",
    "currentKeyMs",
    "goalCompletionMs",
    "simulationMs",
    "simulationHitMs",
    "simulationMissMs",
    // v48zn: physical-miss phase timers are collected only on sampled popped
    // nodes, exactly like simulationMissMs. Scale them with the same per-search
    // factor before aggregation so the phase shares use one consistent basis.
    "physicalMissLookupMs",
    "physicalMissProgrammedMs",
    "physicalMissProgramStartMs",
    "physicalMissProgramTeleporterMs",
    "physicalMissProgramMoveCheckMs",
    "physicalMissProgramBlockedMs",
    "physicalMissProgramLandingMs",
    "physicalMissProgramHazardMs",
    "physicalMissProgramPressureMs",
    "physicalMissProgramBookkeepingMs",
    "physicalMissProgramOilMs",
    "physicalMissBlueConveyorMs",
    "physicalMissGreenConveyorMs",
    "physicalMissCurrentMs",
    "physicalMissPusherMs",
    "physicalMissGearMs",
    "physicalMissCrusherMs",
    "physicalMissEndRegisterMs",
    "physicalMissCloneMs",
    "physicalMissRecoveryPressureMs",
    "physicalMissCacheStoreMs",
    "physicalMissFinalizeMs",
    "cardOptionsMs",
    "actionScoringMs",
    "energyMs",
    "archiveContextMs",
    "destinationBuildMs",
    "routeNodeBuildMs",
    "historyBuildMs",
    "nextKeyMs",
    "dominanceMs"
  ].forEach((key) => {
    profile[key] = Number((profile[key] * profileTimingScale).toFixed(2));
  });
  profile.timingSampleInterval = profileSampleInterval;
  profile.timingSampledNodes = profileTimedNodes;
  profile.timingPopulationNodes = profilePoppedNodes;

  const hitExpansionCap = expansions >= maxExpansions;
  if (completed.length > 0) {
    profile.searchesWithGoal = 1;
    profile.firstGoalExpansionTotal = firstGoalExpansion ?? 0;
    profile.postFirstGoalExpansions = Math.max(
      0,
      expansions - (firstGoalExpansion ?? expansions)
    );
    if (completionPool > 1) {
      profile.optionalCompletionSearches = 1;
      profile.optionalCompletionStops = stoppedForOptionalCompletionBudget ? 1 : 0;
    }
  }
  if (selectedRoutes.length > 0 && selectedRoutes.length < maxOutputRoutes) {
    profile.optionalCompletionShortReturns = 1;
  }

  if (hitExpansionCap) {
    if (completed.length > 0) {
      profile.cappedWithGoalSearches = 1;
      profile.cappedWithGoalExpansions = expansions;
    } else {
      profile.cappedZeroGoalSearches = 1;
      profile.cappedZeroGoalExpansions = expansions;
    }
  }

  selectedRoutes.contextualSearchMeta = {
    expansions,
    maxExpansions,
    optionalCompletionAllowance,
    optionalCompletionStopExpansion,
    hitExpansionCap,
    stoppedAfterUsefulRoute: stoppedForOptionalCompletionBudget,
    zeroRouteCapFailure: (
      selectedRoutes.length === 0 &&
      hitExpansionCap
    ),
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: (
      selectedRoutes.length === 0 &&
      actionHorizonStops > 0
    ),
    forecastFidelity: "exact",
    uncertaintyMechanism: "breadth-only",
    forecastBandAtStart,
    forecastBandAtFirstGoal: completed[0]?.contextualForecastBand ?? null,
    firstGoalExpansion,
    completedGoals: completed.length
  };

  // Capture normal search duration before the dev-only key-space profiler.
  // This keeps route telemetry comparable with the non-profiling baseline.
  const routeSearchFinishedAt = analysisTelemetryNow();
  if (options.contextualDominanceKeyProfiling && !options.contextualFastCardState) {
    Object.assign(
      profile,
      summarizeContextualDominanceKeySpace(bestCostByState)
    );
  }

  recordRouteSearchTelemetry(
    options.contextualTelemetryKind ?? "contextual-leg",
    telemetryStartedAt,
    {
    durationMs: routeSearchFinishedAt - telemetryStartedAt,
    expansions,
    maxExpansions,
    hitExpansionCap,
    actionHorizonStops,
    maxLocalActionsSeen,
    hitActionHorizon: actionHorizonStops > 0,
    zeroRouteHorizonFailure: selectedRoutes.length === 0 && actionHorizonStops > 0,
    completedRoutes: completed.length,
    returnedRoutes: selectedRoutes.length,
    start: {
      x: context.state.x,
      y: context.state.y,
      facing: context.state.facing ?? null
    },
    goal: { x: goal.x, y: goal.y },
      ...(options.contextualTelemetryProfile === false
        ? {}
        : { contextualProfile: profile })
    }
  );
  return selectedRoutes;
}

// Public diagnostic wrapper around the exact realization programming model:
// current-turn play is literal, previous-turn natural/Again use is hard depletion,
// and unknown unplayed cards are integrated by the exact 9-card hand probability.
export function summarizeProgramSequencePressure(
  history,
  absoluteActions,
  actionIds,
  options = {}
) {
  const result = scoreContextualCardSequence(history, absoluteActions, actionIds, options);
  return {
    feasible: result.feasible,
    penalty: result.penalty,
    scarcityPenalty: result.scarcityPenalty,
    programPlausibilityPenalty: result.programPlausibilityPenalty,
    programCardIds: result.programCardIds,
    absoluteActions: result.absoluteActions,
    registerPhase: absoluteActions % REGISTER_COUNT,
    endingRegisterPhase: result.absoluteActions % REGISTER_COUNT
  };
}

export function replayContextualRouteEnergyForContext(
  tileMap,
  route,
  context,
  options = {}
) {
  const fallbackEconomyState = getInitialRouteEconomyShadowState(options);
  let energy = Number.isFinite(Number(context.energyReserve))
    ? Number(context.energyReserve)
    : fallbackEconomyState.energy;
  let totalReward = 0;
  let totalRewardRegisterEquivalents = 0;
  let batteryReward = 0;
  let powerUpReward = 0;
  let chopShopReward = 0;
  let normalDraws = 0;
  let installs = 0;
  let extraCardDraws = 0;
  let energySpent = 0;
  let chopShopCardChoices = 0;
  let chopShopEnergyChoices = 0;

  let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  for (let index = 0; index < (route.transitions || []).length; index += 1) {
    const transition = route.transitions[index];
    if (!transition?.to || !transition?.action) continue;
    const executedAbsoluteAction = getTransitionAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    const step = getRouteEnergyShadowStep(
      tileMap,
      transition.to,
      transition.action,
      executedAbsoluteAction,
      energy,
      0,
      options,
      transition
    );
    totalReward += step.rewardScore || 0;
    totalRewardRegisterEquivalents += step.rewardRegisterEquivalents || 0;
    batteryReward += step.batteryRewardScore || 0;
    powerUpReward += step.powerUpRewardScore || 0;
    chopShopReward += step.chopShopRewardScore || 0;
    normalDraws += step.normalDraws || 0;
    installs += step.installs || 0;
    extraCardDraws += step.extraCardDraws || 0;
    energySpent += step.energySpent || 0;
    chopShopCardChoices += step.chopShopChoice === "card" ? 1 : 0;
    chopShopEnergyChoices += step.chopShopChoice === "energy" ? 1 : 0;
    energy = step.reserveAfter;
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  return {
    routeEnergyEconomyRewardScore: Number(totalReward.toFixed(2)),
    routeEnergyEconomyRewardRegisterEquivalents: Number(
      totalRewardRegisterEquivalents.toFixed(6)
    ),
    batteryEconomyRewardScore: Number(batteryReward.toFixed(2)),
    powerUpEconomyRewardScore: Number(powerUpReward.toFixed(2)),
    chopShopEconomyRewardScore: Number(chopShopReward.toFixed(2)),
    routeEnergyShadowReserveStart: Number.isFinite(Number(context.energyReserve))
      ? Number(context.energyReserve)
      : fallbackEconomyState.energy,
    routeEnergyShadowReserveEnd: energy,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: normalDraws,
    routeEconomyInstalls: installs,
    routeEconomyExtraCardDraws: extraCardDraws,
    routeEconomyEnergySpent: energySpent,
    chopShopCardChoices,
    chopShopEnergyChoices
  };
}

export function isRouteCompatibleWithRebootStart(route, context, options = {}) {
  if (options.recoveryRule !== "reboot_tokens") return true;
  const rebootStart = context?.rebootStart;
  if (!rebootStart) return true;
  return !(route?.transitions || []).some((transition) => (
    transition?.rebootRecoverySource === "dock_start" &&
    (transition?.to?.x !== rebootStart.x || transition?.to?.y !== rebootStart.y)
  ));
}

export function rebaseContextualCachedRoute(
  tileMap,
  route,
  context,
  options = {}
) {
  if (!isRouteCompatibleWithRebootStart(route, context, options)) return null;
  const cardState = scoreContextualCardSequence(
    context.history,
    context.absoluteActions,
    route.localActionIds,
    options,
    context.programCardState,
    route.transitions || []
  );
  if (!cardState.feasible) return null;

  // A shared later-leg catalogue trace keeps exact geometry/physics but must not
  // keep another start's resource valuation. Card scarcity/rolling legality and
  // the flattened Energy economy are cheap to replay on the already-discovered
  // transition chain, so the caller gets a route valid for *this* history.
  const oldCardPenalty = route.cardAvailabilityPenalty || 0;
  const oldProgramPlausibilityPenalty = route.programPlausibilityPenalty || 0;
  const oldApproximateCardPenalty = route.approximateCardPlausibilityPenalty || 0;
  const oldEconomyReward = route.routeEnergyEconomyRewardScore || 0;
  const oldMentalScore = getCompletedRoutePostbuildScoreAdjustment(route);
  const movingTarget = route.movingTarget
    ? {
      ...route.movingTarget,
      actions: cardState.absoluteActions
    }
    : null;
  const contextualHazardExposure = (
    Math.max(0, Number(context.hazardExposure) || 0) +
    Math.max(0, Number(route.hazard) || 0)
  );

  let rebasedElapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  const transitions = (route.transitions || []).map((transition, index) => {
    const executedAbsoluteAction = rebasedElapsedAbsoluteActions + 1;
    const rebased = {
      ...transition,
      programCard: cardState.programCardIds?.[index] ?? transition.programCard ?? transition.action,
      absoluteAction: executedAbsoluteAction
    };
    rebasedElapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    return rebased;
  });
  const rebasedRoute = { ...route, transitions };
  const economy = replayContextualRouteEnergyForContext(
    tileMap,
    rebasedRoute,
    context,
    options
  );
  const mental = replaySearchIntrinsicMentalForContext(
    tileMap,
    rebasedRoute,
    context,
    options,
    true
  );
  const score = Number((
    route.score -
    oldCardPenalty -
    oldProgramPlausibilityPenalty -
    oldApproximateCardPenalty +
    cardState.scarcityPenalty +
    cardState.programPlausibilityPenalty +
    oldEconomyReward -
    oldMentalScore +
    getCompletedRoutePostbuildScoreAdjustment(mental) -
    economy.routeEnergyEconomyRewardScore
  ).toFixed(2));

  return {
    ...route,
    ...economy,
    ...mental,
    transitions,
    absoluteStartAction: context.absoluteActions,
    absoluteActions: cardState.absoluteActions,
    movingTarget,
    score,
    cardAvailabilityPenalty: cardState.scarcityPenalty,
    programPlausibilityPenalty: cardState.programPlausibilityPenalty,
    approximateCardPlausibilityPenalty: 0,
    programHistoryEnd: cardState.history,
    programCardStateEnd: cardState.programCardState
      ? { ...cardState.programCardState }
      : null,
    contextualHazardExposure
  };
}

// v29 estimate-first routing helpers ----------------------------------------
//
// Physical estimates are deliberately independent of exact rolling card state.
// They are cheap, shared geometry/timing suggestions. Exact card realization is
// performed on the complete by-start route afterward; if it fails, only the
// physical suffix beginning at the first impossible register is re-estimated.
export function buildEstimatedPhysicalRouteFromTransitions(
  tileMap,
  initialState,
  transitions,
  absoluteStartAction,
  goal,
  dynamicGoal,
  options = {}
) {
  const safeTransitions = (transitions || []).map((transition) => ({ ...transition }));
  const startAbsolute = Math.max(0, Math.floor(Number(absoluteStartAction) || 0));
  const localActionIds = safeTransitions
    .map((transition) => transition?.action)
    .filter(Boolean);
  let distance = 0;
  let forcedDistance = 0;
  let hazard = 0;
  let rebootPenalty = 0;
  let conveyorComplexity = 0;
  let physicalBaseCost = 0;
  let mentalEventCount = Math.max(
    0, Number(options.searchIntrinsicMentalEventCountStart) || 0
  );
  const mentalEventCountStart = mentalEventCount;
  let searchIntrinsicMentalRE = 0;
  let searchIntrinsicMentalScore = 0;
  let searchIntrinsicMentalEventWeight = 0;
  let homingMissileActivationCount = 0;
  const homingMissileActivatedSpacesThisTurn = new Set(
    Array.isArray(options.searchHomingMissileActivatedSpacesCurrentTurn)
      ? options.searchHomingMissileActivatedSpacesCurrentTurn
      : []
  );
  const variantMentalEventIdsThisTurn = new Set(
    Array.isArray(options.searchVariantMentalEventIdsCurrentTurn)
      ? options.searchVariantMentalEventIdsCurrentTurn
      : []
  );
  let activeTurnNumber = startAbsolute > 0
    ? Math.floor((startAbsolute - 1) / REGISTER_COUNT) + 1
    : 1;

  let elapsedAbsoluteActions = startAbsolute;
  safeTransitions.forEach((transition, transitionIndex) => {
    const actionId = transition?.action;
    const action = ACTIONS.find((candidate) => candidate.id === actionId) ?? null;
    const absoluteActionsBefore = elapsedAbsoluteActions;
    const executedAbsoluteAction = absoluteActionsBefore + 1;
    transition.absoluteAction = executedAbsoluteAction;
    const currentTarget = getDynamicGoalPosition(dynamicGoal, absoluteActionsBefore) ?? goal;
    const transitionRebootPenalty = transition?.rebooted
      ? getRebootRoutePenalty(executedAbsoluteAction)
      : (transition?.rebootPenalty || 0);
    const actionPenalty = action ? getRouteAwareActionPenalty(action, options) : 0;
    const transitionConveyorComplexity = scoreTransitionConveyorComplexity(
      transition,
      currentTarget
    );
    const checkpointHit = options.searchMentalCheckpointAtEnd !== false &&
      transitionIndex === safeTransitions.length - 1;
    const turnNumber = Math.floor(
      (Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT
    ) + 1;
    if (turnNumber !== activeTurnNumber) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
      activeTurnNumber = turnNumber;
    }
    const mentalStep = getSearchIntrinsicMentalTransitionStep(
      tileMap,
      transition,
      executedAbsoluteAction,
      mentalEventCount,
      checkpointHit,
      options,
      {
        homingMissileActivatedSpacesThisTurn,
        variantMentalEventIdsThisTurn
      }
    );
    const stepHomingActivations = (mentalStep.events || []).filter(
      (event) => event?.type === "homing-missile-target-choice"
    ).length;
    homingMissileActivationCount += stepHomingActivations;
    mentalEventCount = mentalStep.nextEventCount;
    searchIntrinsicMentalRE += mentalStep.deltaRE;
    searchIntrinsicMentalScore += mentalStep.score;
    searchIntrinsicMentalEventWeight += mentalStep.eventWeight;
    distance += Number(transition?.distance) || 0;
    forcedDistance += Number(transition?.forcedDistance) || 0;
    hazard += Number(transition?.hazard) || 0;
    rebootPenalty += transitionRebootPenalty;
    conveyorComplexity += transitionConveyorComplexity;
    physicalBaseCost +=
      (Number(transition?.hazard) || 0) +
      transitionRebootPenalty +
      actionPenalty +
      mentalStep.score -
      stepHomingActivations * HOMING_MISSILE_STRATEGIC_CREDIT_RE * REGISTER_TEMPO_COST;
    if (mentalStep.closesTurn) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
    }
    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  });

  const approximateCardPlausibilityPenalty = scoreEstimatedProgramDemand(
    localActionIds,
    startAbsolute,
    null,
    options,
    safeTransitions
  );
  const absoluteActions = elapsedAbsoluteActions;
  const finalState = safeTransitions.length
    ? cloneState(safeTransitions.at(-1).to)
    : cloneState(initialState);
  const hitTarget = getDynamicGoalPosition(dynamicGoal, absoluteActions) ?? goal;
  const route = {
    path: buildTimeline(safeTransitions, initialState),
    transitions: safeTransitions,
    finalState,
    initialState: cloneState(initialState),
    startFacing: initialState?.facing ?? "E",
    hitTarget,
    movingTarget: dynamicGoal
      ? {
        checkpointId: dynamicGoal.id ?? null,
        position: hitTarget,
        space: getDynamicGoalSpace(dynamicGoal, hitTarget),
        actions: absoluteActions,
        positions: dynamicGoal.positions ?? [],
        displayPositions: dynamicGoal.displayPositions ?? dynamicGoal.positions ?? []
      }
      : null,
    actions: localActionIds.length,
    absoluteStartAction: startAbsolute,
    absoluteActions,
    distance: Number(distance.toFixed(2)),
    forcedDistance: Number(forcedDistance.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    rebootPenalty: Number(rebootPenalty.toFixed(2)),
    conveyorComplexity: Number(conveyorComplexity.toFixed(2)),
    rebootCount: safeTransitions.filter((transition) => transition?.rebooted).length,
    score: Number((physicalBaseCost + approximateCardPlausibilityPenalty).toFixed(2)),
    routeEnergyEconomyRewardScore: 0,
    batteryEconomyRewardScore: 0,
    powerUpEconomyRewardScore: 0,
    chopShopEconomyRewardScore: 0,
    routeEnergyShadowReserveStart: null,
    routeEnergyShadowReserveEnd: null,
    searchIntrinsicMentalRegisterEquivalents: Number(
      searchIntrinsicMentalRE.toFixed(4)
    ),
    searchIntrinsicMentalScore: Number(searchIntrinsicMentalScore.toFixed(2)),
    searchIntrinsicMentalEventWeight: Number(
      searchIntrinsicMentalEventWeight.toFixed(4)
    ),
    searchIntrinsicMentalEventCountStart: Number(mentalEventCountStart.toFixed(4)),
    searchIntrinsicMentalEventCountEnd: Number(mentalEventCount.toFixed(4)),
    searchHomingMissileActivatedSpacesCurrentTurn:
      [...homingMissileActivatedSpacesThisTurn],
    homingMissileActivationCount,
    homingMissileStrategicCreditRE: Number(
      (homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE).toFixed(4)
    ),
    homingMissileStrategicCreditScore: Number(
      (homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE *
        REGISTER_TEMPO_COST).toFixed(2)
    ),
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    searchIntrinsicMentalModel: 'rounded-turn-events-quadratic-after-7-v49bc-postbuild',
    dynamicArchivePointStart: options.dynamicArchivePointStart
      ? { ...options.dynamicArchivePointStart }
      : null,
    dynamicArchivePointEnd: options.dynamicArchivePointEnd
      ? { ...options.dynamicArchivePointEnd }
      : options.dynamicArchivePointStart
        ? { ...options.dynamicArchivePointStart }
        : null,
    routeUpgradeCardShadowUnitsStart: 0,
    routeUpgradeCardShadowUnitsEnd: 0,
    routeEconomyNormalDraws: 0,
    routeEconomyInstalls: 0,
    routeEconomyExtraCardDraws: 0,
    routeEconomyEnergySpent: 0,
    chopShopCardChoices: 0,
    chopShopEnergyChoices: 0,
    cardAvailabilityPenalty: 0,
    programPlausibilityPenalty: 0,
    approximateCardPlausibilityPenalty,
    localActionIds,
    programHistoryEnd: [],
    goalReached: (
      finalState.x === hitTarget.x &&
      finalState.y === hitTarget.y
    ),
    fullCourseLeg: true,
    physicalTimingTemplate: true,
    estimatedPrimaryTemplate: true
  };
  return route;
}

export function combineEstimatedPhysicalRouteSuffix(
  tileMap,
  route,
  prefixActionCount,
  suffix,
  goal,
  dynamicGoal,
  options = {}
) {
  const prefixCount = Math.max(
    0,
    Math.min(
      route?.transitions?.length ?? 0,
      Math.floor(Number(prefixActionCount) || 0)
    )
  );
  const transitions = [
    ...(route?.transitions || []).slice(0, prefixCount),
    ...(suffix?.transitions || [])
  ];
  return buildEstimatedPhysicalRouteFromTransitions(
    tileMap,
    route?.initialState ?? suffix?.initialState,
    transitions,
    route?.absoluteStartAction ?? 0,
    goal,
    dynamicGoal,
    {
      ...options,
      dynamicArchivePointStart:
        route?.dynamicArchivePointStart ?? options.dynamicArchivePointStart,
      dynamicArchivePointEnd:
        suffix?.dynamicArchivePointEnd ?? route?.dynamicArchivePointEnd ?? options.dynamicArchivePointEnd,
      searchIntrinsicMentalEventCountStart:
        route?.searchIntrinsicMentalEventCountStart ??
        options.searchIntrinsicMentalEventCountStart ?? 0
    }
  );
}

export function getEstimatedRouteIdentity(route) {
  if (!route) return "-";
  const actions = (route.localActionIds || []).join(".");
  const destinations = (route.transitions || []).map((transition) => (
    `${transition?.to?.x ?? "?"},${transition?.to?.y ?? "?"},${transition?.to?.facing ?? "?"}`
  )).join(";");
  return [
    `a${route.absoluteStartAction ?? 0}`,
    actions,
    destinations
  ].join("|");
}

export function getEstimatedRouteFailureConstraintKey(
  state,
  absoluteActions,
  prefixActionIds
) {
  const history = getProgramHistoryWindow(prefixActionIds || []);
  return [
    stateKey(state),
    `r${Math.max(0, Math.floor(Number(absoluteActions) || 0)) % REGISTER_COUNT}`,
    `h${history.join(".") || "-"}`
  ].join("|");
}

export function replayDynamicArchivingEstimatedLegPhysics(
  tileMap,
  estimatedLeg,
  context,
  options = {}
) {
  if (options.recoveryRule !== "dynamic_archiving") return null;
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayChecks += 1;
  const exactReplayStartedAt = analysisTelemetryNow();
  const failReplay = () => {
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMismatches += 1;
    DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs +=
      analysisTelemetryNow() - exactReplayStartedAt;
    return null;
  };
  const actionIds = [...(estimatedLeg?.localActionIds || [])];
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayActions += actionIds.length;
  const expectedTransitions = estimatedLeg?.transitions || [];
  const portalMap = options.portalMap ?? buildPortalMap(tileMap);
  const goal = estimatedLeg?.hitTarget ?? estimatedLeg?.finalState ?? null;
  let state = cloneState(context.state);
  let dynamicArchivePoint = context?.dynamicArchivePoint
    ? { ...context.dynamicArchivePoint }
    : { x: state.x, y: state.y };
  const dynamicArchivePointStart = { ...dynamicArchivePoint };
  let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
  const transitions = [];

  for (let index = 0; index < actionIds.length; index += 1) {
    const action = ACTIONS.find((candidate) => candidate.id === actionIds[index]);
    if (!action) return failReplay();
    const executedAbsoluteAction = elapsedAbsoluteActions + 1;
    const transition = simulateAction(
      tileMap,
      state,
      action,
      {
        ...options,
        portalMap,
        goal,
        rebootStart: options.rebootStart ?? context.rebootStart ?? null,
        registerIndex: elapsedAbsoluteActions % REGISTER_COUNT,
        dynamicArchivePoint
      }
    );
    if (!transition || transition.crashed || transition.blocked) return failReplay();

    const expectedTo = expectedTransitions[index]?.to;
    if (
      expectedTo &&
      (transition.to?.x !== expectedTo.x ||
        transition.to?.y !== expectedTo.y ||
        transition.to?.facing !== expectedTo.facing)
    ) {
      return failReplay();
    }

    const realizedTransition = {
      ...transition,
      absoluteAction: executedAbsoluteAction
    };
    transitions.push(realizedTransition);
    state = cloneState(transition.to);
    dynamicArchivePoint = getNextDynamicArchivePoint(
      tileMap,
      transition.to,
      dynamicArchivePoint,
      options
    );
    elapsedAbsoluteActions = transition.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
  }

  const rebuilt = buildEstimatedPhysicalRouteFromTransitions(
    tileMap,
    context.state,
    transitions,
    context.absoluteActions,
    goal,
    null,
    {
      ...options,
      dynamicArchivePointStart,
      dynamicArchivePointEnd: dynamicArchivePoint,
      searchIntrinsicMentalEventCountStart:
        context.searchIntrinsicMentalEventCountCurrentTurn ?? 0,
      searchHomingMissileActivatedSpacesCurrentTurn:
        context.searchHomingMissileActivatedSpacesCurrentTurn ?? []
    }
  );
  const approximateCardPenalty = Math.max(
    0,
    Number(rebuilt?.approximateCardPlausibilityPenalty) || 0
  );
  const archiveReward = scoreDynamicArchivingRouteUtility(
    tileMap,
    rebuilt,
    options
  );
  DYNAMIC_ARCHIVE_CACHE_TELEMETRY.exactReplayMs +=
    analysisTelemetryNow() - exactReplayStartedAt;
  return {
    transitions,
    absoluteActions: elapsedAbsoluteActions,
    dynamicArchivePointStart,
    dynamicArchivePointEnd: dynamicArchivePoint ? { ...dynamicArchivePoint } : null,
    physicalScore: Number((
      (Number(rebuilt?.score) || 0) -
      approximateCardPenalty -
      (Number(rebuilt?.searchIntrinsicMentalScore) || 0) -
      archiveReward
    ).toFixed(2)),
    hazard: Number(rebuilt?.hazard) || 0,
    distance: Number(rebuilt?.distance) || 0,
    forcedDistance: Number(rebuilt?.forcedDistance) || 0,
    rebootPenalty: Number(rebuilt?.rebootPenalty) || 0,
    conveyorComplexity: Number(rebuilt?.conveyorComplexity) || 0,
    dynamicArchivingRewardScore: archiveReward
  };
}

export function realizeEstimatedLegsWithCardSolution(
  tileMap,
  estimatedLegs,
  initialContext,
  cardSolution,
  options = {}
) {
  if (!cardSolution?.feasible) return null;
  const exactLegs = [];
  let context = {
    ...initialContext,
    state: cloneState(initialContext.state),
    history: getProgramHistoryWindow(initialContext.history),
    programCardState: initialContext.programCardState
      ? { ...initialContext.programCardState }
      : null
  };
  let actionOffset = 0;

  for (let legIndex = 0; legIndex < estimatedLegs.length; legIndex += 1) {
    const estimatedLeg = estimatedLegs[legIndex];
    const localActionIds = [...(estimatedLeg?.localActionIds || [])];
    const actionCount = localActionIds.length;
    const programCardIds = cardSolution.programCardIds.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionPenalties = cardSolution.actionPenalties.slice(
      actionOffset,
      actionOffset + actionCount
    );
    const actionScarcityPenalties = (
      cardSolution.actionScarcityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    const actionPlausibilityPenalties = (
      cardSolution.actionPlausibilityPenalties || []
    ).slice(actionOffset, actionOffset + actionCount);
    if (programCardIds.length !== actionCount) return null;

    const dynamicPhysicalReplay = options.recoveryRule === "dynamic_archiving"
      ? replayDynamicArchivingEstimatedLegPhysics(
        tileMap,
        estimatedLeg,
        context,
        options
      )
      : null;
    if (options.recoveryRule === "dynamic_archiving" && !dynamicPhysicalReplay) {
      return null;
    }
    let elapsedAbsoluteActions = Math.max(0, Number(context.absoluteActions) || 0);
    const physicalTransitions = dynamicPhysicalReplay?.transitions ??
      (estimatedLeg?.transitions || []);
    const transitions = physicalTransitions.map((transition, index) => {
      const executedAbsoluteAction = elapsedAbsoluteActions + 1;
      const realizedTransition = {
        ...transition,
        programCard: programCardIds[index] ?? transition?.action,
        absoluteAction: executedAbsoluteAction
      };
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
        : executedAbsoluteAction;
      return realizedTransition;
    });
    const cardAvailabilityPenalty = actionScarcityPenalties.length === actionCount
      ? actionScarcityPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      )
      : actionPenalties.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      );
    const programPlausibilityPenalty = actionPlausibilityPenalties.reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    const oldApproximateCardPenalty = Number(
      estimatedLeg?.approximateCardPlausibilityPenalty
    ) || 0;
    const oldCardPenalty = Number(estimatedLeg?.cardAvailabilityPenalty) || 0;
    const oldProgramPlausibilityPenalty = Number(
      estimatedLeg?.programPlausibilityPenalty
    ) || 0;
    const oldEconomyReward = Number(
      estimatedLeg?.routeEnergyEconomyRewardScore
    ) || 0;
    const oldMentalScore = getCompletedRoutePostbuildScoreAdjustment(
      estimatedLeg
    );
    const physicalScore = dynamicPhysicalReplay
      ? dynamicPhysicalReplay.physicalScore
      : (
        (Number(estimatedLeg?.score) || 0) -
        oldApproximateCardPenalty -
        oldCardPenalty -
        oldProgramPlausibilityPenalty -
        oldMentalScore +
        oldEconomyReward
      );
    const absoluteStartAction = context.absoluteActions;
    const absoluteActions = elapsedAbsoluteActions;
    const endCardState = actionCount > 0
      ? cardSolution.cardStates[actionOffset + actionCount - 1]
      : context.programCardState;
    const programHistoryEnd = getProgramHistoryWindow([
      ...getProgramHistoryWindow(context.history),
      ...localActionIds
    ]);
    const movingTarget = estimatedLeg?.movingTarget
      ? {
        ...estimatedLeg.movingTarget,
        actions: absoluteActions
      }
      : null;
    const contextualHazardExposure = (
      Math.max(0, Number(context.hazardExposure) || 0) +
      Math.max(0, Number(
        dynamicPhysicalReplay?.hazard ?? estimatedLeg?.hazard
      ) || 0)
    );
    const exactBase = {
      ...estimatedLeg,
      ...(dynamicPhysicalReplay ? {
        hazard: dynamicPhysicalReplay.hazard,
        distance: dynamicPhysicalReplay.distance,
        forcedDistance: dynamicPhysicalReplay.forcedDistance,
        rebootPenalty: dynamicPhysicalReplay.rebootPenalty,
        conveyorComplexity: dynamicPhysicalReplay.conveyorComplexity,
        dynamicArchivingRewardScore: dynamicPhysicalReplay.dynamicArchivingRewardScore,
        dynamicArchivePointStart: dynamicPhysicalReplay.dynamicArchivePointStart,
        dynamicArchivePointEnd: dynamicPhysicalReplay.dynamicArchivePointEnd
      } : {}),
      transitions,
      absoluteStartAction,
      absoluteActions,
      movingTarget,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty
      ).toFixed(2)),
      cardAvailabilityPenalty: Number(cardAvailabilityPenalty.toFixed(2)),
      programPlausibilityPenalty: Number(programPlausibilityPenalty.toFixed(2)),
      approximateCardPlausibilityPenalty: 0,
      programHistoryEnd,
      programCardStateEnd: endCardState ? { ...endCardState } : null,
      contextualHazardExposure,
      physicalTimingTemplate: false,
      estimatedPrimaryTemplate: false
    };
    const economy = replayContextualRouteEnergyForContext(
      tileMap,
      exactBase,
      context,
      options
    );
    const mental = replaySearchIntrinsicMentalForContext(
      tileMap,
      exactBase,
      context,
      options,
      true
    );
    const exactLeg = {
      ...exactBase,
      ...economy,
      ...mental,
      score: Number((
        physicalScore +
        cardAvailabilityPenalty +
        programPlausibilityPenalty +
        getCompletedRoutePostbuildScoreAdjustment(mental) -
        economy.routeEnergyEconomyRewardScore
      ).toFixed(2))
    };
    const nextContext = getContextAfterLeg(
      exactLeg,
      context,
      tileMap,
      options
    );
    exactLeg.contextualForecastBand = getContextualForecastBand(
      nextContext,
      options
    );
    exactLegs.push(exactLeg);
    context = nextContext;
    actionOffset += actionCount;
  }

  return {
    legs: exactLegs,
    context,
    score: exactLegs.reduce((sum, leg) => sum + (Number(leg.score) || 0), 0)
  };
}

export function getContextAfterLeg(
  route,
  priorContext = null,
  tileMap = null,
  options = {}
) {
  const priorHazard = Math.max(0, Number(priorContext?.hazardExposure) || 0);
  const routeHazard = Math.max(0, Number(route?.hazard) || 0);
  const priorAdverseRE = Math.max(0, Number(priorContext?.reNativeAdverseRE) || 0);
  const routeUncertaintyProfile = tileMap && route
    ? getRENativeProductionTrafficForecastProfile(tileMap, route, options)
    : null;
  const routeAdverseRE = Math.max(
    0,
    Number(routeUncertaintyProfile?.totalAdverseRE) || 0
  );
  return {
    state: cloneState(route.finalState),
    rebootStart: priorContext?.rebootStart
      ? { ...priorContext.rebootStart }
      : route?.initialState
        ? { x: route.initialState.x, y: route.initialState.y }
        : null,
    absoluteActions: route.absoluteActions,
    history: getProgramHistoryWindow(route.programHistoryEnd),
    programCardState: route.programCardStateEnd
      ? { ...route.programCardStateEnd }
      : (priorContext?.programCardState ? { ...priorContext.programCardState } : null),
    energyReserve: Number.isFinite(Number(route.routeEnergyShadowReserveEnd))
      ? Number(route.routeEnergyShadowReserveEnd)
      : null,
    searchIntrinsicMentalEventCountCurrentTurn: Math.max(
      0, Number(route.searchIntrinsicMentalEventCountEnd) || 0
    ),
    searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
      route.searchHomingMissileActivatedSpacesCurrentTurn
    )
      ? [...route.searchHomingMissileActivatedSpacesCurrentTurn]
      : [],
    upgradeCardUnits: null,
    hazardExposure: Number.isFinite(Number(route.contextualHazardExposure))
      ? Number(route.contextualHazardExposure)
      : priorHazard + routeHazard,
    reNativeAdverseRE: Number((priorAdverseRE + routeAdverseRE).toFixed(6)),
    dynamicArchivePoint: route?.dynamicArchivePointEnd
      ? { ...route.dynamicArchivePointEnd }
      : priorContext?.dynamicArchivePoint
        ? { ...priorContext.dynamicArchivePoint }
        : null
  };
}

export function getPartialBeamCurrentLeg(partial) {
  return partial.legs.at(-1) ?? null;
}

export function getContextualBeamWidthForPartials(partials, requestedWidth, options = {}) {
  const width = Math.max(1, Math.floor(Number(requestedWidth) || 1));
  if (!options.contextualUncertaintyBreadth || !Array.isArray(partials) || !partials.length) {
    return width;
  }
  const best = [...partials].filter(Boolean).sort(
    compareScoredRouteLike
  )[0];
  if (!best?.context) return width;
  return getContextualBreadthPolicy(
    best.context,
    width,
    width,
    width,
    0,
    options
  ).beamWidth;
}

export function selectContextualPartialBeam(
  partials,
  goal,
  width = CONTEXTUAL_BEAM_WIDTH,
  diversityOptions = {}
) {
  // Exact register-aware factory physics can legitimately eliminate every
  // continuation for a start on a later leg. Whole-route diversity used to
  // fall through to sorted[0].score in that case, producing the intermittent
  // "best.score" generation crash instead of an ordinary zero-route result.
  // A later stress run also proved that a sparse/null partial can reach this
  // boundary: the width helper already ignored it, while this selector sorted
  // it and Safari crashed on left.score. Null partials are non-routes, so drop
  // them here before any score comparison.
  if (!Array.isArray(partials) || width <= 0) {
    return [];
  }
  const validPartials = partials.filter(Boolean);
  if (!validPartials.length) {
    return [];
  }

  if (validPartials.length <= width && !diversityOptions.wholePartialDiversity) {
    return [...validPartials].sort(
      compareScoredRouteLike
    );
  }

  const sorted = [...validPartials].sort(
    compareScoredRouteLike
  );
  const best = sorted[0];
  const scoreAllowance = Math.max(18, best.score * 0.1);
  const eligible = sorted.filter(
    (partial) => partial.score <= best.score + scoreAllowance
  );

  if (width === 1 || eligible.length === 1) {
    return [best];
  }

  const wholePartialDiversity = Boolean(
    diversityOptions.wholePartialDiversity
  );
  const partialFlags = Array.isArray(diversityOptions.flags)
    ? diversityOptions.flags
    : [];
  const bestComparisonRoute = wholePartialDiversity
    ? stitchContextualLegs(best.legs, partialFlags)
    : getPartialBeamCurrentLeg(best);
  let diverse = null;
  let diverseNovelty = -1;

  for (const candidate of eligible.slice(1)) {
    const candidateComparisonRoute = wholePartialDiversity
      ? stitchContextualLegs(candidate.legs, partialFlags)
      : getPartialBeamCurrentLeg(candidate);
    if (!candidateComparisonRoute || !bestComparisonRoute) {
      continue;
    }

    const novelty = 1 - routeSimilarity(
      candidateComparisonRoute,
      bestComparisonRoute,
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
      compareScoredRouteLike
    )
    : [best];
}

export function stitchContextualLegs(legs, flags) {
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
  let cumulativeCardAvailabilityPenalty = 0;
  let cumulativeProgramPlausibilityPenalty = 0;
  let cumulativeRouteEnergyEconomyRewardScore = 0;
  let cumulativeBatteryEconomyRewardScore = 0;
  let cumulativePowerUpEconomyRewardScore = 0;
  let cumulativeChopShopEconomyRewardScore = 0;
  let cumulativeSearchIntrinsicMentalRE = 0;
  let cumulativeSearchIntrinsicMentalScore = 0;
  let cumulativeSearchIntrinsicMentalEventWeight = 0;
  let cumulativeHomingMissileActivationCount = 0;
  let cumulativeHomingMissileStrategicCreditRE = 0;
  let cumulativeHomingMissileStrategicCreditScore = 0;
  const checkpointHits = [];

  legs.forEach((leg, legIndex) => {
    cumulativeActions += leg.actions ?? 0;
    cumulativeDistance += leg.distance ?? 0;
    cumulativeForcedDistance += leg.forcedDistance ?? 0;
    cumulativeHazard += leg.hazard ?? 0;
    cumulativeRebootPenalty += leg.rebootPenalty ?? 0;
    cumulativeBaseCost += leg.score ?? 0;
    cumulativeCardAvailabilityPenalty += leg.cardAvailabilityPenalty ?? 0;
    cumulativeProgramPlausibilityPenalty += leg.programPlausibilityPenalty ?? 0;
    cumulativeRouteEnergyEconomyRewardScore += leg.routeEnergyEconomyRewardScore ?? 0;
    cumulativeBatteryEconomyRewardScore += leg.batteryEconomyRewardScore ?? 0;
    cumulativePowerUpEconomyRewardScore += leg.powerUpEconomyRewardScore ?? 0;
    cumulativeChopShopEconomyRewardScore += leg.chopShopEconomyRewardScore ?? 0;
    cumulativeSearchIntrinsicMentalRE +=
      leg.searchIntrinsicMentalRegisterEquivalents ?? 0;
    cumulativeSearchIntrinsicMentalScore += leg.searchIntrinsicMentalScore ?? 0;
    cumulativeSearchIntrinsicMentalEventWeight +=
      leg.searchIntrinsicMentalEventWeight ?? 0;
    cumulativeHomingMissileActivationCount +=
      Math.max(0, Number(leg.homingMissileActivationCount) || 0);
    cumulativeHomingMissileStrategicCreditRE +=
      Math.max(0, Number(leg.homingMissileStrategicCreditRE) || 0);
    cumulativeHomingMissileStrategicCreditScore +=
      Math.max(0, Number(leg.homingMissileStrategicCreditScore) || 0);
    const flag = flags[legIndex];

    checkpointHits.push({
      checkpointIndex: legIndex,
      checkpointId: flag?.id ?? legIndex + 1,
      action: cumulativeActions,
      absoluteAction: Number.isFinite(Number(leg?.absoluteActions))
        ? Number(leg.absoluteActions)
        : cumulativeActions,
      state: cloneState(leg.finalState),
      position: leg.hitTarget ?? flag,
      movingTarget: leg.movingTarget ?? null,
      distance: cumulativeDistance,
      forcedDistance: cumulativeForcedDistance,
      hazard: cumulativeHazard,
      rebootPenalty: cumulativeRebootPenalty,
      baseCost: cumulativeBaseCost,
      routeEnergyEconomyRewardScore: cumulativeRouteEnergyEconomyRewardScore,
      batteryEconomyRewardScore: cumulativeBatteryEconomyRewardScore,
      powerUpEconomyRewardScore: cumulativePowerUpEconomyRewardScore,
      chopShopEconomyRewardScore: cumulativeChopShopEconomyRewardScore,
      routeEnergyShadowReserve: leg.routeEnergyShadowReserveEnd ?? null,
      routeUpgradeCardShadowUnits: leg.routeUpgradeCardShadowUnitsEnd ?? null
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
    absoluteStartAction: Math.max(0, Number(legs[0]?.absoluteStartAction) || 0),
    absoluteActions: Math.max(
      Math.max(0, Number(legs[0]?.absoluteStartAction) || 0),
      Number(legs.at(-1)?.absoluteActions) || 0
    ),
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
    cardAvailabilityPenalty: Number(cumulativeCardAvailabilityPenalty.toFixed(2)),
    programPlausibilityPenalty: Number(cumulativeProgramPlausibilityPenalty.toFixed(2)),
    routeEnergyEconomyRewardScore: Number(cumulativeRouteEnergyEconomyRewardScore.toFixed(2)),
    batteryEconomyRewardScore: Number(cumulativeBatteryEconomyRewardScore.toFixed(2)),
    powerUpEconomyRewardScore: Number(cumulativePowerUpEconomyRewardScore.toFixed(2)),
    chopShopEconomyRewardScore: Number(cumulativeChopShopEconomyRewardScore.toFixed(2)),
    searchIntrinsicMentalRegisterEquivalents: Number(
      cumulativeSearchIntrinsicMentalRE.toFixed(4)
    ),
    searchIntrinsicMentalScore: Number(cumulativeSearchIntrinsicMentalScore.toFixed(2)),
    searchIntrinsicMentalEventWeight: Number(
      cumulativeSearchIntrinsicMentalEventWeight.toFixed(4)
    ),
    searchIntrinsicMentalEventCountStart:
      legs[0].searchIntrinsicMentalEventCountStart ?? 0,
    searchIntrinsicMentalEventCountEnd:
      legs.at(-1)?.searchIntrinsicMentalEventCountEnd ?? 0,
    searchHomingMissileActivatedSpacesCurrentTurn: Array.isArray(
      legs.at(-1)?.searchHomingMissileActivatedSpacesCurrentTurn
    )
      ? [...legs.at(-1).searchHomingMissileActivatedSpacesCurrentTurn]
      : [],
    homingMissileActivationCount: cumulativeHomingMissileActivationCount,
    homingMissileStrategicCreditRE: Number(
      cumulativeHomingMissileStrategicCreditRE.toFixed(4)
    ),
    homingMissileStrategicCreditScore: Number(
      cumulativeHomingMissileStrategicCreditScore.toFixed(2)
    ),
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    searchIntrinsicMentalModel: 'rounded-turn-events-quadratic-after-7-v49bc-postbuild',
    routeEnergyShadowReserveStart: legs[0].routeEnergyShadowReserveStart ?? null,
    routeEnergyShadowReserveEnd: legs.at(-1)?.routeEnergyShadowReserveEnd ?? null,
    routeUpgradeCardShadowUnitsStart: legs[0].routeUpgradeCardShadowUnitsStart ?? null,
    routeUpgradeCardShadowUnitsEnd: legs.at(-1)?.routeUpgradeCardShadowUnitsEnd ?? null,
    goalReached: true,
    fullCourse: true,
    legRoutes: legs
  };
}

export function summarizeRouteAgainUsage(route, options = {}) {
  const actions = Array.isArray(route?.actionHistory)
    ? route.actionHistory
    : [];
  const transitions = Array.isArray(route?.transitions)
    ? route.transitions
    : [];
  const literalCards = transitions.length === actions.length &&
    transitions.every((transition) => typeof transition?.programCard === "string")
    ? transitions.map((transition) => transition.programCard)
    : null;
  const programs = [];
  const cardPrograms = [];
  const programTurnIds = [];
  const againTurns = [];
  let literalProgramViolations = 0;
  let rollingWindowViolations = 0;

  if (transitions.length === actions.length && transitions.length) {
    const byTurn = new Map();
    let elapsedAbsoluteActions = Math.max(0, Number(route?.absoluteStartAction) || 0);
    transitions.forEach((transition, index) => {
      const absoluteAction = getTransitionAbsoluteAction(
        transition,
        elapsedAbsoluteActions + 1
      );
      const turnId = Math.floor((absoluteAction - 1) / REGISTER_COUNT);
      if (!byTurn.has(turnId)) byTurn.set(turnId, []);
      byTurn.get(turnId).push({
        actionId: actions[index],
        programCardId: literalCards?.[index] ?? null
      });
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(absoluteAction)
        : absoluteAction;
    });
    [...byTurn.entries()]
      .sort((left, right) => left[0] - right[0])
      .forEach(([turnId, entries]) => {
        programTurnIds.push(turnId);
        programs.push(entries.map((entry) => entry.actionId));
        if (literalCards) {
          cardPrograms.push(entries.map((entry) => entry.programCardId));
        }
      });
  } else {
    for (let offset = 0, turnIndex = 0; offset < actions.length; offset += REGISTER_COUNT, turnIndex += 1) {
      programTurnIds.push(turnIndex);
      programs.push(actions.slice(offset, offset + REGISTER_COUNT));
      if (literalCards) {
        cardPrograms.push(literalCards.slice(offset, offset + REGISTER_COUNT));
      }
    }
  }

  programs.forEach((program, turnIndex) => {
    if (literalCards) {
      const cards = cardPrograms[turnIndex] || [];
      const counts = new Map();
      cards.forEach((cardId, registerIndex) => {
        counts.set(cardId, (counts.get(cardId) || 0) + 1);
        if (
          cardId === "AGAIN" &&
          (
            registerIndex === 0 ||
            program[registerIndex] !== program[registerIndex - 1]
          )
        ) {
          literalProgramViolations += 1;
        }
      });
      for (const resourceId of COMPACT_PROGRAM_RESOURCE_IDS) {
        const limit = resourceId === "AGAIN"
          ? AGAIN_CARD_COUNT
          : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
        if ((counts.get(resourceId) || 0) > limit) {
          literalProgramViolations += 1;
          break;
        }
      }
      if (cards.includes("AGAIN")) againTurns.push(programTurnIds[turnIndex]);
    } else {
      const summary = getLiteralProgramResourceSummary(program);
      if (!summary.feasible) literalProgramViolations += 1;
      if (summary.requiresAgain) againTurns.push(programTurnIds[turnIndex]);
    }
  });

  if (getProgramCardModelProfile(options).previousTurnDepletionActive) {
    if (literalCards) {
      for (let turnIndex = 1; turnIndex < cardPrograms.length; turnIndex += 1) {
        if (programTurnIds[turnIndex] !== programTurnIds[turnIndex - 1] + 1) continue;
        const previous = cardPrograms[turnIndex - 1];
        const current = cardPrograms[turnIndex];
        const combined = new Map();
        [...previous, ...current].forEach((cardId) => {
          combined.set(cardId, (combined.get(cardId) || 0) + 1);
        });
        const violation = COMPACT_PROGRAM_RESOURCE_IDS.some((resourceId) => {
          const limit = resourceId === "AGAIN"
            ? AGAIN_CARD_COUNT
            : (PROGRAM_CARD_COUNTS.get(resourceId) || 0);
          return (combined.get(resourceId) || 0) > limit;
        });
        if (violation) rollingWindowViolations += 1;
      }
    } else {
      for (let turnIndex = 1; turnIndex < programs.length; turnIndex += 1) {
        if (programTurnIds[turnIndex] !== programTurnIds[turnIndex - 1] + 1) continue;
        const previousStates = getLiteralProgramResourceStates(programs[turnIndex - 1]);
        const currentStates = getLiteralProgramResourceStates(programs[turnIndex]);
        const compatible = previousStates.some((previousState) => (
          currentStates.some((currentState) => (
            areRollingProgramResourceStatesCompatible(previousState, currentState)
          ))
        ));
        if (!compatible) rollingWindowViolations += 1;
      }
    }
  }

  let consecutiveTurnAgainReuse = 0;
  for (let index = 1; index < againTurns.length; index += 1) {
    if (againTurns[index] === againTurns[index - 1] + 1) {
      consecutiveTurnAgainReuse += 1;
    }
  }

  return {
    againTurns: againTurns.length,
    consecutiveTurnAgainReuse,
    literalProgramViolations,
    rollingWindowViolations,
    literalCardAssignments: Boolean(literalCards)
  };
}

export function getCheapBestLiteralProgramAvailabilityProbability(actionIds = [], options = {}) {
  const zero = Array(PROGRAM_CHEAP_RESOURCE_IDS.length).fill(0);
  const states = getLiteralProgramResourceStates(actionIds);
  if (!states.length) return 0;
  return Math.max(...states.map((state) => (
    getCheapProgramLiteralAvailabilityProbability(
      zero,
      getProgramResourceStateCounts(state),
      options
    )
  )));
}


export function summarizeDiscoveredCandidateCardPressure(startAnalyses = []) {
  const perStart = [];

  const getRegisterCount = (route) => {
    const actions = Array.isArray(route?.actionHistory)
      ? route.actionHistory
      : null;
    if (actions) return actions.length;
    const transitions = Array.isArray(route?.transitions)
      ? route.transitions
      : [];
    return transitions.length;
  };

  const getExactCardRE = (route) => {
    const score = Number(route?.cardAvailabilityPenalty);
    return Number.isFinite(score)
      ? Math.max(0, score) / REGISTER_TEMPO_COST
      : null;
  };

  for (const analysis of startAnalyses || []) {
    const selected = analysis?.fullCourseRoute ?? null;
    if (!selected) continue;
    const selectedRegisters = getRegisterCount(selected);
    const selectedCardRE = getExactCardRE(selected);
    if (!Number.isFinite(selectedCardRE)) continue;

    const routes = Array.isArray(analysis?.fullCourseRoutes)
      ? analysis.fullCourseRoutes
      : [];
    const candidates = routes
      .map((route, routeIndex) => ({
        routeIndex,
        registers: getRegisterCount(route),
        cardRE: getExactCardRE(route),
        intrinsicScore: Number(route?.score)
      }))
      .filter((entry) => (
        Number.isFinite(entry.cardRE) &&
        Number.isFinite(entry.registers)
      ));

    const selectedIndex = Number.isInteger(analysis?.fullCourseRouteIndex)
      ? analysis.fullCourseRouteIndex
      : routes.indexOf(selected);

    const sameRegisterCandidates = candidates.filter(
      (entry) => entry.registers === selectedRegisters
    );
    const sameRegisterAlternatives = sameRegisterCandidates.filter(
      (entry) => entry.routeIndex !== selectedIndex
    );
    const sameOrFewerCandidates = candidates.filter(
      (entry) => entry.registers <= selectedRegisters
    );

    const bestSame = sameRegisterCandidates
      .slice()
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        left.routeIndex - right.routeIndex
      ))[0] ?? null;
    const bestSameOrFewer = sameOrFewerCandidates
      .slice()
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        left.registers - right.registers ||
        left.routeIndex - right.routeIndex
      ))[0] ?? null;

    const sameRegisterReducibleRE = bestSame
      ? Math.max(0, selectedCardRE - bestSame.cardRE)
      : 0;
    const sameOrFewerReducibleRE = bestSameOrFewer
      ? Math.max(0, selectedCardRE - bestSameOrFewer.cardRE)
      : 0;

    perStart.push({
      startIndex: analysis.index,
      selectedRouteIndex: selectedIndex,
      candidateCount: candidates.length,
      selectedRegisters,
      selectedCardRE: Number(selectedCardRE.toFixed(3)),
      sameRegisterCandidateCount: sameRegisterCandidates.length,
      sameRegisterAlternativeCount: sameRegisterAlternatives.length,
      bestSameRegisterCardRE: bestSame
        ? Number(bestSame.cardRE.toFixed(3))
        : null,
      bestSameRegisterRouteIndex: bestSame?.routeIndex ?? null,
      sameRegisterReducibleRE: Number(sameRegisterReducibleRE.toFixed(3)),
      sameOrFewerCandidateCount: sameOrFewerCandidates.length,
      bestSameOrFewerRegisters: bestSameOrFewer?.registers ?? null,
      bestSameOrFewerCardRE: bestSameOrFewer
        ? Number(bestSameOrFewer.cardRE.toFixed(3))
        : null,
      bestSameOrFewerRouteIndex: bestSameOrFewer?.routeIndex ?? null,
      sameOrFewerReducibleRE: Number(sameOrFewerReducibleRE.toFixed(3))
    });
  }

  const mean = (key) => perStart.length
    ? perStart.reduce((sum, entry) => sum + (Number(entry[key]) || 0), 0) /
        perStart.length
    : 0;
  const sameRegisterAlternativeStarts = perStart.filter(
    (entry) => entry.sameRegisterAlternativeCount > 0
  );
  const sameRegisterImprovementStarts = perStart.filter(
    (entry) => entry.sameRegisterReducibleRE > 0.001
  );
  const sameOrFewerImprovementStarts = perStart.filter(
    (entry) => entry.sameOrFewerReducibleRE > 0.001
  );
  const worstSame = sameRegisterImprovementStarts
    .slice()
    .sort((left, right) => right.sameRegisterReducibleRE - left.sameRegisterReducibleRE)[0]
    ?? null;
  const worstSameOrFewer = sameOrFewerImprovementStarts
    .slice()
    .sort((left, right) => right.sameOrFewerReducibleRE - left.sameOrFewerReducibleRE)[0]
    ?? null;

  return {
    model: "discovered-candidate-card-pressure-audit-v49bt",
    observationalOnly: true,
    searchCoverageLimited: true,
    auditedStarts: perStart.length,
    startsWithSameRegisterAlternative: sameRegisterAlternativeStarts.length,
    startsWithLowerCardSameRegisterCandidate: sameRegisterImprovementStarts.length,
    startsWithLowerCardSameOrFewerCandidate: sameOrFewerImprovementStarts.length,
    meanSelectedCardRE: Number(mean("selectedCardRE").toFixed(3)),
    meanSameRegisterReducibleRE: Number(mean("sameRegisterReducibleRE").toFixed(3)),
    meanSameOrFewerReducibleRE: Number(mean("sameOrFewerReducibleRE").toFixed(3)),
    maximumSameRegisterReducibleRE:
      worstSame?.sameRegisterReducibleRE ?? 0,
    maximumSameRegisterReducibleStartIndex:
      worstSame?.startIndex ?? null,
    maximumSameOrFewerReducibleRE:
      worstSameOrFewer?.sameOrFewerReducibleRE ?? 0,
    maximumSameOrFewerReducibleStartIndex:
      worstSameOrFewer?.startIndex ?? null,
    starts: perStart
  };
}


export function summarizeTargetedSameRegisterCardPressureSearch(
  tileMap,
  startAnalyses = [],
  flags = [],
  options = {}
) {
  const requestedStarts = Math.max(
    1,
    Math.floor(Number(options.targetedCardPressureDiagnosticStarts) || 4)
  );
  const maxRoutes = Math.max(
    2,
    Math.floor(Number(options.targetedCardPressureDiagnosticRoutes) || 6)
  );
  const maxExpansions = Math.max(
    500,
    Math.floor(Number(options.targetedCardPressureDiagnosticExpansions) || 7000)
  );
  const cardWeight = Math.max(
    1,
    Number(options.targetedCardPressureDiagnosticWeight) || 8
  );

  if (!tileMap || !Array.isArray(flags) || !flags.length) {
    return {
      model: "targeted-same-register-card-pressure-search-v49cd",
      observationalOnly: true,
      enabled: false,
      unavailableReason: "missing-map-or-flags",
      auditedStarts: 0,
      starts: []
    };
  }

  const ranked = (startAnalyses || [])
    .map((analysis) => {
      const route = analysis?.fullCourseRoute ?? null;
      const score = Number(route?.cardAvailabilityPenalty);
      const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
      const registers = transitions.length || (
        Array.isArray(route?.actionHistory) ? route.actionHistory.length : 0
      );
      if (!route || !Number.isFinite(score) || registers <= 0 || !analysis?.start) {
        return null;
      }
      return {
        analysis,
        selectedRoute: route,
        selectedRegisters: registers,
        selectedCardRE: Math.max(0, score) / REGISTER_TEMPO_COST
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.selectedCardRE - left.selectedCardRE ||
      (left.analysis.index ?? 0) - (right.analysis.index ?? 0)
    ))
    .slice(0, requestedStarts);

  const perStart = [];
  for (const entry of ranked) {
    const { analysis, selectedRoute, selectedRegisters, selectedCardRE } = entry;
    const rebootTokens = options.recoveryRule === "home_reboot"
      ? getHomeRebootTokensForStart(analysis.start, options.rebootTokens)
      : options.rebootTokens;
    const routes = enumerateFullCourseRoutes(
      tileMap,
      analysis.start,
      flags,
      {
        ...options,
        rebootTokens,
        maxRoutes,
        maxExpansions,
        maxStateLabels: 2,
        diverseStateLabelsAfterFirstCheckpoint: true,
        cardPressureDiagnosticSearch: true,
        cardPressureDiagnosticExactActions: selectedRegisters,
        cardPressureDiagnosticWeight: cardWeight
      }
    );
    const searchMeta = routes.fullCourseSearchMeta ?? {};
    const selectedActions = (selectedRoute.transitions || [])
      .map((transition) => transition?.action)
      .filter(Boolean);
    const selectedActionKey = selectedActions.join(".");
    const exactCandidates = [];

    for (const route of routes) {
      const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
      const actionIds = transitions
        .map((transition) => transition?.action)
        .filter(Boolean);
      if (actionIds.length !== selectedRegisters) continue;
      const cardSolution = scoreCompactProgramCardSequenceUntilFailure(
        null,
        0,
        actionIds,
        options,
        [],
        getTurnEndAfterActionIndexes(transitions)
      );
      if (!cardSolution.feasible || !Number.isFinite(cardSolution.scarcityPenalty)) {
        continue;
      }
      exactCandidates.push({
        cardRE: Math.max(0, cardSolution.scarcityPenalty) / REGISTER_TEMPO_COST,
        actionKey: actionIds.join("."),
        route
      });
    }

    const alternatives = exactCandidates
      .filter((candidate) => candidate.actionKey !== selectedActionKey)
      .sort((left, right) => (
        left.cardRE - right.cardRE ||
        (Number(left.route?.score) || Infinity) - (Number(right.route?.score) || Infinity)
      ));
    const bestAlternative = alternatives[0] ?? null;
    const improvementRE = bestAlternative
      ? Math.max(0, selectedCardRE - bestAlternative.cardRE)
      : 0;

    perStart.push({
      startIndex: analysis.index,
      selectedRegisters,
      selectedCardRE: Number(selectedCardRE.toFixed(3)),
      searchedRouteCount: routes.length,
      exactCandidateCount: exactCandidates.length,
      sameRegisterAlternativeCount: alternatives.length,
      bestAlternativeCardRE: bestAlternative
        ? Number(bestAlternative.cardRE.toFixed(3))
        : null,
      improvementRE: Number(improvementRE.toFixed(3)),
      lowerCardAlternativeFound: improvementRE > 0.001,
      hitExpansionCap: Boolean(searchMeta.hitExpansionCap),
      hitRouteLimit: Boolean(searchMeta.hitRouteLimit),
      expansions: Number(searchMeta.expansions) || 0,
      maxExpansions: Number(searchMeta.maxExpansions) || maxExpansions
    });
  }

  const improved = perStart.filter((entry) => entry.lowerCardAlternativeFound);
  const withAlternatives = perStart.filter(
    (entry) => entry.sameRegisterAlternativeCount > 0
  );
  const meanImprovement = perStart.length
    ? perStart.reduce((sum, entry) => sum + entry.improvementRE, 0) / perStart.length
    : 0;
  const bestImprovement = improved
    .slice()
    .sort((left, right) => right.improvementRE - left.improvementRE)[0] ?? null;

  return {
    model: "targeted-same-register-card-pressure-search-v49cd",
    observationalOnly: true,
    enabled: true,
    highCardStartsOnly: true,
    requestedStarts,
    auditedStarts: perStart.length,
    searchRoutesPerStart: maxRoutes,
    searchExpansionCapPerStart: maxExpansions,
    diagnosticCardWeight: cardWeight,
    startsWithSameRegisterAlternative: withAlternatives.length,
    startsWithLowerCardSameRegisterAlternative: improved.length,
    cappedSearches: perStart.filter((entry) => entry.hitExpansionCap).length,
    routeLimitSearches: perStart.filter((entry) => entry.hitRouteLimit).length,
    totalExpansions: perStart.reduce((sum, entry) => sum + entry.expansions, 0),
    meanImprovementRE: Number(meanImprovement.toFixed(3)),
    maximumImprovementRE: bestImprovement?.improvementRE ?? 0,
    maximumImprovementStartIndex: bestImprovement?.startIndex ?? null,
    starts: perStart
  };
}

export function summarizeSelectedProgrammingScarcity(startAnalyses = [], options = {}) {
  const cardModelProfile = getProgramCardModelProfile(options);
  const discoveredCandidateCardPressure =
    summarizeDiscoveredCandidateCardPressure(startAnalyses);
  const routeSummaries = (startAnalyses || [])
    .map((analysis) => summarizeRouteAgainUsage(analysis?.fullCourseRoute, options))
    .filter(Boolean);
  const routesUsingAgain = routeSummaries.filter((entry) => entry.againTurns > 0).length;
  const routesWithConsecutiveAgain = routeSummaries.filter(
    (entry) => entry.consecutiveTurnAgainReuse > 0
  ).length;
  const selectedRouteAvailabilityPenalties = (startAnalyses || [])
    .map((analysis) => Number(analysis?.fullCourseRoute?.cardAvailabilityPenalty))
    .filter(Number.isFinite);
  const selectedRouteCheapAvailabilityPenalties = (startAnalyses || [])
    .map((analysis) => {
      const actions = analysis?.fullCourseRoute?.actionHistory;
      const transitions = analysis?.fullCourseRoute?.transitions;
      return Array.isArray(actions)
        ? scoreEstimatedProgramDemand(actions, 0, null, options, transitions || [])
        : NaN;
    })
    .filter(Number.isFinite);
  const uncompressedSelectedRouteAvailabilityPenalties =
    selectedRouteAvailabilityPenalties
      .map((value) => (
        cardModelProfile.adaptabilityFactor > 0
          ? value / cardModelProfile.adaptabilityFactor
          : value
      ))
      .filter(Number.isFinite);
  const selectedRouteAvailabilityPenaltyRE =
    selectedRouteAvailabilityPenalties.map(
      (value) => value / REGISTER_TEMPO_COST
    );
  const uncompressedSelectedRouteAvailabilityPenaltyRE =
    uncompressedSelectedRouteAvailabilityPenalties.map(
      (value) => value / REGISTER_TEMPO_COST
    );

  const pairedAvailabilityPenaltyDeltas = (startAnalyses || [])
    .map((analysis) => {
      const exact = Number(analysis?.fullCourseRoute?.cardAvailabilityPenalty);
      const actions = analysis?.fullCourseRoute?.actionHistory;
      const transitions = analysis?.fullCourseRoute?.transitions;
      const cheap = Array.isArray(actions)
        ? scoreEstimatedProgramDemand(actions, 0, null, options, transitions || [])
        : NaN;
      return Number.isFinite(exact) && Number.isFinite(cheap)
        ? cheap - exact
        : NaN;
    })
    .filter(Number.isFinite);
  return {
    selectedRoutes: routeSummaries.length,
    discoveredCandidateCardPressure,
    routesUsingAgain,
    totalAgainTurns: routeSummaries.reduce((sum, entry) => sum + entry.againTurns, 0),
    consecutiveTurnAgainReuse: routeSummaries.reduce(
      (sum, entry) => sum + entry.consecutiveTurnAgainReuse,
      0
    ),
    routesWithConsecutiveAgain,
    exactHypergeometricAvailability: true,
    handSize: cardModelProfile.handSize,
    cardScarcityAdaptabilityScalingActive: true,
    // Compatibility alias retained for Dev/report consumers written before alpha
    // was allowed to exceed 1.0 under Shared Deck. This is scaling, not always compression.
    cardScarcityAdaptabilityCompressionActive: cardModelProfile.adaptabilityFactor < 1,
    cardScarcityAdaptabilityFactor: cardModelProfile.adaptabilityFactor,
    cardScarcityBaseAdaptabilityFactor: cardModelProfile.baseAlpha,
    sharedDeckAdaptabilityIncrement: cardModelProfile.sharedDeckAlphaIncrement,
    sharedDeckAlphaIncrementPerAdditionalPlayer: SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER,
    sharedDeckEnlargedDeckModeled: cardModelProfile.sharedDeckEnlargedDeckModeled,
    sharedDeckCrossRobotHandsModeled: cardModelProfile.sharedDeckCrossRobotHandsModeled,
    rollingPreviousTurnDepletion: cardModelProfile.previousTurnDepletionActive,
    resetProgrammingDeckEachTurn: cardModelProfile.resetEachTurn,
    cardScarcityScalingRationale:
      cardModelProfile.sharedDeck
        ? "exact single-player hypergeometry retained; Shared Deck omitted-state uncertainty is represented by an uncapped player-count alpha uplift"
        : cardModelProfile.resetEachTurn
          ? "fresh full programming deck each turn removes the normal omitted-deck-state adaptability discount; alpha base is 1.0"
          : "normal alpha discounts extra scarcity for omitted player hand adaptation / richer real deck-state information; exact hypergeometry unchanged",
    cardScarcityCompressionRationale:
      "legacy field name only; see cardScarcityScalingRationale",
    meanCardAvailabilityPenaltyRE: selectedRouteAvailabilityPenaltyRE.length
      ? Number((
        selectedRouteAvailabilityPenaltyRE.reduce((sum, value) => sum + value, 0) /
        selectedRouteAvailabilityPenaltyRE.length
      ).toFixed(3))
      : 0,
    maxCardAvailabilityPenaltyRE: selectedRouteAvailabilityPenaltyRE.length
      ? Number(Math.max(...selectedRouteAvailabilityPenaltyRE).toFixed(3))
      : 0,
    meanCardAvailabilityPenaltyUncompressedRE:
      uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ? Number((
          uncompressedSelectedRouteAvailabilityPenaltyRE.reduce(
            (sum, value) => sum + value,
            0
          ) / uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ).toFixed(3))
        : 0,
    maxCardAvailabilityPenaltyUncompressedRE:
      uncompressedSelectedRouteAvailabilityPenaltyRE.length
        ? Number(
          Math.max(...uncompressedSelectedRouteAvailabilityPenaltyRE).toFixed(3)
        )
        : 0,
    meanCardAvailabilityPenalty: selectedRouteAvailabilityPenalties.length
      ? Number((
        selectedRouteAvailabilityPenalties.reduce((sum, value) => sum + value, 0) /
        selectedRouteAvailabilityPenalties.length
      ).toFixed(2))
      : 0,
    maxCardAvailabilityPenalty: selectedRouteAvailabilityPenalties.length
      ? Number(Math.max(...selectedRouteAvailabilityPenalties).toFixed(2))
      : 0,
    cheapSearchAvailabilityProxy: "cached-collapsed-literal-hypergeometric",
    meanCheapSearchAvailabilityPenalty: selectedRouteCheapAvailabilityPenalties.length
      ? Number((
        selectedRouteCheapAvailabilityPenalties.reduce((sum, value) => sum + value, 0) /
        selectedRouteCheapAvailabilityPenalties.length
      ).toFixed(2))
      : 0,
    maxCheapSearchAvailabilityPenalty: selectedRouteCheapAvailabilityPenalties.length
      ? Number(Math.max(...selectedRouteCheapAvailabilityPenalties).toFixed(2))
      : 0,
    meanCheapMinusExactAvailabilityPenalty: pairedAvailabilityPenaltyDeltas.length
      ? Number((
        pairedAvailabilityPenaltyDeltas.reduce((sum, value) => sum + value, 0) /
        pairedAvailabilityPenaltyDeltas.length
      ).toFixed(2))
      : 0,
    baselineFourCopyProbability: Number(
      PROGRAM_EXACT_FOUR_COPY_BASELINE_PROBABILITY.toFixed(4)
    ),
    singleCopyProbability: Number(
      getExactProgramHandAvailabilityProbability(0, ["FORWARD_3"], options).toFixed(4)
    ),
    threeDistinctSingleCopyProbability: Number(
      getExactProgramHandAvailabilityProbability(
        0,
        ["FORWARD_3", "UTURN", "BACK"],
        options
      ).toFixed(4)
    ),
    repeatedFourCopyWithAgainProbability: Number(
      getExactProgramHandAvailabilityProbability(0, ["FORWARD", "FORWARD"], options).toFixed(4)
    ),
    cheapSingleCopyProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(["FORWARD_3"], options).toFixed(4)
    ),
    cheapThreeDistinctSingleCopyProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(
        ["FORWARD_3", "UTURN", "BACK"],
        options
      ).toFixed(4)
    ),
    cheapRepeatedFourCopyBestLiteralProbability: Number(
      getCheapBestLiteralProgramAvailabilityProbability(
        ["FORWARD", "FORWARD"],
        options
      ).toFixed(4)
    ),
    literalProgramViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.literalProgramViolations,
      0
    ),
    rollingWindowViolations: routeSummaries.reduce(
      (sum, entry) => sum + entry.rollingWindowViolations,
      0
    ),
    approximateSearchLiteralHypergeometric: true,
    approximateSearchAgainSpecialDiscount: false,
    normalizationInvariant:
      "P(program)=normal 9-card fresh-deck four-copy baseline => +0 extra card RE before alpha scaling; Factory Rejects therefore raises scarcity naturally by reducing the actual draw to 7",
    halfBaselineRawScarcityRE: 1,
    halfBaselineScaledScarcityRE: Number(
      cardModelProfile.adaptabilityFactor.toFixed(3)
    )
  };
}
