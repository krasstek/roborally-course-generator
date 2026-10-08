// Robo Rally Course Randomizer - RE evaluation of a completed route: register-equivalent ledger, damage foundation, expected traffic and RE-native confidence (mutually recursive by design)
import { getHomingMissileSearchGuidanceScore } from "../../feature-weights.js";
import { tileKey } from "./board-geometry.js";
import { REGISTER_COUNT, REGISTER_TEMPO_COST, ROTATION_ORDER } from "./constants.js";
import {
  DAMAGE_ECONOMY_MODEL_ID,
  DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT,
  DAMAGE_ECONOMY_ROUTE_SUMMARY_CACHE,
  DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
  DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT,
  DAMAGE_ECONOMY_TELEMETRY,
  DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE,
  advanceDamageEconomyToTurn,
  applyDamageEconomyRepairStationRelief,
  applyDamageEconomySpamPlayOutcome,
  applyExpectedDamageToEconomyState,
  createDamageEconomyState,
  getDamageEconomyAdjustedForcedSpamHaywireJointDistribution,
  getDamageEconomyClogRegisterEquivalents,
  getDamageEconomyCombinedClogSummary,
  getDamageEconomyExpectedCount,
  getDamageEconomyExpectedSpamChainYield,
  getDamageEconomyPoissonBinomialDistribution,
  getDamageEconomyProgramCodeFromLiteralCards,
  getDamageEconomyProgrammingSummary,
  getDamageEconomyRealizedDamageForTransition,
  getDamageEconomyRegisterHaywireEventProbability,
  getDamageEconomyRegisterReliefProfile,
  getDamageEconomyReliefOpportunityByAbsoluteAction,
  getDamageEconomySelectedProgramTurns,
  getDamageEconomyTelemetrySnapshot,
  getDamageEconomyVariantProfile,
  isDamageEconomyRandomizerAtRegisterStart,
  isDamageEconomyRepairStationTile,
  replayDamageEconomyShutdownEquivalentScore
} from "./damage-economy.js";
import { getInitialRouteEnergyShadowReserve, getRouteEnergyShadowStep } from "./energy-economy.js";
import { average, clamp } from "../shared/math.js";
import {
  getProgramCardEffectivePreviousCode,
  scoreContextualCardSequence
} from "./program-availability.js";
import {
  RE_LEDGER_MODEL_ID,
  getObservationalMentalRegisterEquivalents,
  getRegisterEquivalentLedgerAbsoluteAction,
  getRegisterEquivalentLedgerPlanningEventsForTransition
} from "./re-ledger.js";
import {
  getRebootEndedAbsoluteActions,
  getRegisterPosition,
  getTransitionAbsoluteAction
} from "./reboot-recovery.js";
import {
  FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT,
  FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT,
  HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE,
  HOMING_MISSILE_STRATEGIC_CREDIT_RE,
  HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
  RE_NATIVE_DAMAGE_EFFORT_CEILING,
  TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
  buildConditionalOccupancyMap,
  buildTrafficRouteMixtureEntries,
  getClosestTimelineIndexByAbsoluteRegister,
  getForecastTimeConfidence,
  getIncomingRobotLaserDirection,
  getRENativeTrafficConfidenceForAbsoluteAction,
  getRegisterTimeline,
  getStandardRobotLaserCost,
  getTemporalInteractionWeight,
  getTrafficAlternateEffortScale,
  getTrafficAlternateHardPressureStrength,
  getTrafficForecastElapsedRegisters,
  getTrafficForecastGraceRegisters,
  getTrafficLegs,
  getTrafficPairProfile,
  getTrafficRouteEntry,
  getVirtualPhysicalInteractionScale,
  restoreRENativeTrafficAlternateEffortForDamagePressure,
  summarizeNearbyTrafficTurnEpisodes,
  summarizeSimultaneousRebootPileupForecast
} from "./traffic.js";

export let TRAFFIC_INTRINSIC_RE_LEDGER_CACHE = new WeakMap();
// v49dm production traffic confidence caches only its own intrinsic completed-route
// RE ledger so economy-pricing replays cannot contaminate traffic semantics (or
// vice versa) when callers carry different option overlays.
export let RE_NATIVE_TRAFFIC_CONFIDENCE_PROFILE_CACHE = new WeakMap();

export function resetTrafficIntrinsicRELedgerCache() {
  TRAFFIC_INTRINSIC_RE_LEDGER_CACHE = new WeakMap();
}

export function resetRENativeTrafficConfidenceProfileCache() {
  RE_NATIVE_TRAFFIC_CONFIDENCE_PROFILE_CACHE = new WeakMap();
}

export function getTrafficIntrinsicRELedger(tileMap, route, options = {}) {
  if (!route) return null;
  const cached = TRAFFIC_INTRINSIC_RE_LEDGER_CACHE.get(route);
  if (cached) return cached;
  // Intrinsic means no multiplayer trafficContext. This makes the ledger safe
  // to use as an input to production traffic confidence without a same-epoch
  // traffic -> confidence -> traffic feedback loop.
  const ledger = summarizeRegisterEquivalentLedger(
    tileMap,
    route,
    options,
    null
  );
  if (ledger) TRAFFIC_INTRINSIC_RE_LEDGER_CACHE.set(route, ledger);
  return ledger;
}

// v49ab-damage9-pressure-reroute shared exact damage-economy replay. The same chronology is
// still exposed in Dev View, but its shutdown-equivalent RE now also participates
// in exact full-course route comparison. Route-local realized damage is translated
// before traffic; confidence-weighted robot-laser damage is translated only in the
// later common-traffic comparison. Search legality, cheap physical discovery, card
// legality and search budgets remain unchanged.
export function summarizeDamageEconomyFoundationForRoute(
  tileMap,
  route,
  options = {},
  trafficContext = null
) {
  if (!tileMap || !route) return null;

  const profile = getDamageEconomyVariantProfile(options);
  const cacheSignature = [
    profile.handSize,
    profile.criticalHaywireCountsAgainstHand ? 1 : 0,
    profile.spamFilter ? 1 : 0,
    profile.criticalSpam ? 1 : 0,
    options.permanentShutdown ? 1 : 0,
    options.setToKill ? 1 : 0,
    options.setToStun ? 1 : 0,
    options.moreDeadlyGame ? 1 : 0,
    options.cuttingFloor ? 1 : 0,
    options.flamingOil ? 1 : 0,
    options.repairStations ? 1 : 0,
    options.recoveryRule ?? "normal"
  ].join("|");
  DAMAGE_ECONOMY_TELEMETRY.routeSummaryLookups += 1;
  let activeRouteSummaryCache = DAMAGE_ECONOMY_ROUTE_SUMMARY_CACHE;
  if (trafficContext && typeof trafficContext === "object") {
    activeRouteSummaryCache = DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE.get(trafficContext);
    if (!activeRouteSummaryCache) {
      activeRouteSummaryCache = new WeakMap();
      DAMAGE_ECONOMY_TRAFFIC_ROUTE_SUMMARY_CACHE.set(trafficContext, activeRouteSummaryCache);
    }
  }
  const cached = activeRouteSummaryCache.get(route);
  if (cached?.signature === cacheSignature) {
    DAMAGE_ECONOMY_TELEMETRY.routeSummaryCacheHits += 1;
    return cached.summary;
  }
  DAMAGE_ECONOMY_TELEMETRY.routeSummaryCacheMisses += 1;

  const trafficRanged = getDamageEconomyTrafficRangedRegisterInputs(
    tileMap,
    route,
    trafficContext,
    options
  );
  const robotLaserDamageByAbsoluteAction = new Map(
    (trafficRanged?.records || []).map((record) => [
      record.absoluteAction,
      Math.max(0, Number(record.expectedDamageUnits) || 0)
    ])
  );
  const robotLaserHitProbabilitiesByAbsoluteAction = new Map(
    (trafficRanged?.records || []).map((record) => [
      record.absoluteAction,
      ROTATION_ORDER.map((dir) => clamp(
        Number(record?.expectedHitProbabilityByDirection?.[dir]) || 0,
        0,
        1
      ))
    ])
  );

  const legs = Array.isArray(route.legRoutes) && route.legRoutes.length
    ? route.legRoutes
    : [route];
  const selectedProgramTurns = getDamageEconomySelectedProgramTurns(legs);
  const transitionRecords = [];
  let previousAbsoluteAction = 0;
  for (const [legIndex, leg] of legs.entries()) {
    const transitions = Array.isArray(leg?.transitions) ? leg.transitions : [];
    let elapsedAbsoluteActions = Math.max(
      0,
      Number(leg?.absoluteStartAction) || previousAbsoluteAction
    );
    for (const [legActionIndex, transition] of transitions.entries()) {
      const absoluteAction = getTransitionAbsoluteAction(
        transition,
        elapsedAbsoluteActions + 1
      );
      const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
      const register = getRegisterPosition(absoluteAction);
      const realized = getDamageEconomyRealizedDamageForTransition(
        tileMap,
        transition,
        options,
        absoluteAction
      );
      const randomizerAtRegisterStart = isDamageEconomyRandomizerAtRegisterStart(
        tileMap,
        transition,
        options,
        absoluteAction
      );
      const reliefProfile = getDamageEconomyRegisterReliefProfile(
        tileMap,
        randomizerAtRegisterStart && !transition?.randomizerAtRegisterStart
          ? { ...transition, randomizerAtRegisterStart: true }
          : transition,
        transition,
        options,
        absoluteAction
      );
      const finalTile = transition?.to
        ? tileMap.get(tileKey(transition.to.x, transition.to.y))
        : null;
      const repairStationEligible = Boolean(
        options.repairStations &&
        register === REGISTER_COUNT &&
        !transition?.rebooted &&
        !transition?.crashed &&
        isDamageEconomyRepairStationTile(finalTile)
      );
      transitionRecords.push({
        legIndex,
        legAction: legActionIndex + 1,
        absoluteAction,
        turn,
        register,
        transition,
        realized,
        reliefProfile,
        randomizerAtRegisterStart,
        repairStationEligible
      });
      elapsedAbsoluteActions = transition?.rebooted
        ? getRebootEndedAbsoluteActions(absoluteAction)
        : absoluteAction;
      previousAbsoluteAction = Math.max(previousAbsoluteAction, elapsedAbsoluteActions);
    }
  }

  const recordsByTurn = new Map();
  transitionRecords.forEach((record) => {
    if (!recordsByTurn.has(record.turn)) recordsByTurn.set(record.turn, []);
    recordsByTurn.get(record.turn).push(record);
  });
  for (const records of recordsByTurn.values()) {
    records.sort((a, b) => a.absoluteAction - b.absoluteAction);
  }

  const maxRouteTurn = Math.max(
    1,
    ...transitionRecords.map((record) => record.turn),
    ...selectedProgramTurns.keys()
  );
  const reliefOpportunityByAbsoluteAction =
    getDamageEconomyReliefOpportunityByAbsoluteAction(transitionRecords);
  const state = createDamageEconomyState();
  const turns = [];
  const events = [];
  let totalDamageUnits = 0;
  let deterministicDamageUnits = 0;
  let robotLaserExpectedDamageUnits = 0;
  let boardLaserDamageUnits = 0;
  let flamethrowerDamageUnits = 0;
  let flamingOilDamageUnits = 0;
  let radiationDamageUnits = 0;
  let radioactiveWasteDamageUnits = 0;
  let ledgeDamageUnits = 0;
  let rebootDamageUnits = 0;
  let totalSpamAdded = 0;
  let totalSpamRemoved = 0;
  let totalCriticalSpamReturnedToPending = 0;
  let totalSpamReliefInitiations = 0;
  let totalForcedSpamReliefInitiations = 0;
  let totalElectiveSpamReliefInitiations = 0;
  let totalRandomizerStarts = 0;
  let totalRandomizerReliefInitiations = 0;
  let totalRandomizerForcedSpamOverlap = 0;
  let totalRandomizerClogLoad = 0;
  let totalSpamChainExtraRemoved = 0;
  let totalRebootSpamRemoved = 0;
  let totalRebootSpamDisposalCapacity = 0;
  let totalRebootHaywireCleared = 0;
  let rebootReliefCount = 0;
  let repairStationReliefCount = 0;
  let totalRepairStationSpamRemoved = 0;
  let totalRepairStationHaywireExpectedRemoved = 0;
  let totalRawSpamSupplyRegisterEquivalents = 0;
  let totalPermanentShutdownPressureRegisterEquivalents = 0;
  let maxPermanentShutdownSupplyMultiplier = 1;
  let totalSpamSupplyRegisterEquivalents = 0;
  let totalClogRegisterEquivalents = 0;
  let totalDamageEconomyRegisterEquivalents = 0;
  let maxTurnDamageEconomyRegisterEquivalents = 0;
  let maxSpamTotal = 0;
  let maxSpamHeld = 0;
  let maxExpectedHaywireClogs = 0;
  let maxExpectedTotalClogs = 0;

  for (let turn = 1; turn <= maxRouteTurn; turn += 1) {
    advanceDamageEconomyToTurn(state, turn, options);
    const programTurn = selectedProgramTurns.get(turn) ?? {
      actionIds: [],
      programCardIds: [],
      absoluteActions: []
    };
    const actionIds = programTurn.actionIds || [];
    const programRegisters = actionIds.length;
    if (!programRegisters) continue;
    const previousProgram = selectedProgramTurns.get(turn - 1) ?? null;
    const previousProgramCode = getProgramCardEffectivePreviousCode(
      previousProgram
        ? getDamageEconomyProgramCodeFromLiteralCards(previousProgram.programCardIds)
        : 0,
      options
    );
    const programming = getDamageEconomyProgrammingSummary(
      previousProgramCode,
      actionIds,
      state,
      options
    );
    const spamTotalAtProgramming = state.spamTotal;
    const spamHeldCarry = state.spamHeld;
    const spamCirculatingAtProgramming = Math.max(0, spamTotalAtProgramming - spamHeldCarry);
    const haywireExpectedAtProgramming = programming.expectedHaywireClogs;
    const spamHandAtProgramming = Math.min(
      profile.handSize,
      Math.max(0, spamHeldCarry + programming.expectedSpamDrawn)
    );
    let spamInHandRemaining = spamHandAtProgramming;
    const turnRecords = recordsByTurn.get(turn) || [];
    const turnRandomizerStarts = turnRecords.filter(
      (record) => Boolean(record?.randomizerAtRegisterStart)
    ).length;
    const forcedSpamReliefInitiations = Math.min(
      state.spamTotal,
      spamInHandRemaining,
      Math.max(0, Number(programming.expectedForcedSpamReliefInitiations) || 0)
    );
    let remainingRandomizerElectiveReliefCapacity = Math.max(
      0,
      turnRandomizerStarts - forcedSpamReliefInitiations
    );
    let forcedSpamChainYield = 0;
    let forcedSpamRemoved = 0;
    let forcedCriticalSpamReturnedToPending = 0;
    if (forcedSpamReliefInitiations > 0.0005) {
      const forcedCirculatingSpam = Math.max(0, state.spamTotal - spamInHandRemaining);
      forcedSpamChainYield = Math.max(
        1,
        getDamageEconomyExpectedSpamChainYield(
          programming.baseDeckSize,
          forcedCirculatingSpam
        )
      );
      spamInHandRemaining = Math.max(0, spamInHandRemaining - forcedSpamReliefInitiations);
      const forcedSpamOutcome = applyDamageEconomySpamPlayOutcome(
        state,
        forcedSpamReliefInitiations * forcedSpamChainYield,
        profile
      );
      forcedSpamRemoved = forcedSpamOutcome.relieved;
      forcedCriticalSpamReturnedToPending =
        forcedSpamOutcome.returnedToPending;
    }
    let turnElectiveReliefInitiations = 0;
    let turnSpamRemoved = forcedSpamRemoved;
    let turnCriticalSpamReturnedToPending =
      forcedCriticalSpamReturnedToPending;
    let turnSpamChainExtraRemoved = Math.max(
      0,
      forcedSpamRemoved - forcedSpamReliefInitiations
    );
    let turnRebootSpamRemoved = 0;
    let turnRebootSpamDisposalCapacity = 0;
    let turnRebootHaywireCleared = 0;
    let turnRebootRegister = 0;
    let turnRepairStationSpamRemoved = 0;
    let turnRepairStationHaywireExpectedRemoved = 0;
    let turnRepairStationReliefCount = 0;
    let turnReliefOpportunity = 0;
    let turnBoardDamageUnits = 0;
    let turnRobotLaserExpectedDamageUnits = 0;
    let pendingSpamAddedThisTurn = 0;
    let pendingHaywireRiskAddedThisTurn = 0;
    const registerEvents = [];
    const electiveClogInitiationProbabilities = [];
    let turnRandomizerReliefInitiations = 0;

    for (const record of turnRecords) {
      const {
        transition,
        realized,
        reliefProfile,
        absoluteAction,
        register,
        randomizerAtRegisterStart,
        repairStationEligible
      } = record;
      const reliefOpportunity = Math.max(
        0,
        Number(reliefOpportunityByAbsoluteAction.get(absoluteAction)) || 0
      );
      // Haywire no longer suppresses the probability of choosing a SPAM relief
      // opportunity. Its interaction with SPAM is more faithfully represented by
      // the shared nonlinear control-clog cost after SPAM plays are known.
      turnReliefOpportunity += reliefOpportunity;

      let reliefInitiation = 0;
      let chainYield = 0;
      let totalRemovedThisRegister = 0;
      let criticalSpamReturnedToPendingThisRegister = 0;
      if (spamInHandRemaining > 0.0005 && reliefOpportunity > 0.0005) {
        reliefInitiation = Math.min(
          1,
          reliefOpportunity,
          spamInHandRemaining,
          randomizerAtRegisterStart
            ? remainingRandomizerElectiveReliefCapacity
            : 1
        );
        const currentCirculatingSpam = Math.max(0, state.spamTotal - spamInHandRemaining);
        chainYield = Math.max(
          1,
          getDamageEconomyExpectedSpamChainYield(
            programming.baseDeckSize,
            currentCirculatingSpam
          )
        );
        spamInHandRemaining = Math.max(0, spamInHandRemaining - reliefInitiation);
        const spamPlayOutcome = applyDamageEconomySpamPlayOutcome(
          state,
          reliefInitiation * chainYield,
          profile
        );
        totalRemovedThisRegister = spamPlayOutcome.relieved;
        criticalSpamReturnedToPendingThisRegister =
          spamPlayOutcome.returnedToPending;
        turnCriticalSpamReturnedToPending +=
          criticalSpamReturnedToPendingThisRegister;
        turnElectiveReliefInitiations += reliefInitiation;
        turnSpamRemoved += totalRemovedThisRegister;
        turnSpamChainExtraRemoved += Math.max(
          0,
          totalRemovedThisRegister - reliefInitiation
        );
      }
      electiveClogInitiationProbabilities.push(
        randomizerAtRegisterStart ? 0 : reliefInitiation
      );
      if (randomizerAtRegisterStart) {
        turnRandomizerReliefInitiations += reliefInitiation;
        remainingRandomizerElectiveReliefCapacity = Math.max(
          0,
          remainingRandomizerElectiveReliefCapacity - reliefInitiation
        );
      }

      let rebootSpamRemoved = 0;
      let rebootSpamDisposalCapacity = 0;
      let rebootHaywireCleared = 0;
      if (transition?.rebooted) {
        // The selected exact route knows this reboot will happen. We still do not
        // simulate literal SPAM cards in registers; instead, the skipped trailing
        // registers are abstract disposal capacity for SPAM plausibly already in
        // hand. This removes only pre-existing SPAM from the persistent burden.
        // It does NOT clear circulating/deck SPAM wholesale.
        rebootSpamDisposalCapacity = Math.max(0, REGISTER_COUNT - register);
        rebootSpamRemoved = Math.min(
          state.spamTotal,
          spamInHandRemaining,
          rebootSpamDisposalCapacity
        );
        if (rebootSpamRemoved > 0) {
          spamInHandRemaining = Math.max(0, spamInHandRemaining - rebootSpamRemoved);
          state.spamTotal = Math.max(0, state.spamTotal - rebootSpamRemoved);
        }

        // Reboot clears damage already occupying registers. In the estimator that
        // is the active Haywire clog for this programmed turn. It has already paid
        // its programming/control cost, so this is diagnostic cleanup rather than
        // a retroactive refund. Same-turn pending damage remains in deck/discard
        // abstraction and is NOT cleared. Reboot's own fresh damage is added below.
        rebootHaywireCleared = haywireExpectedAtProgramming;
        state.activeHaywireDistribution = [1, 0, 0, 0, 0, 0];
        turnRebootRegister = register;
        turnRebootSpamRemoved += rebootSpamRemoved;
        turnRebootSpamDisposalCapacity += rebootSpamDisposalCapacity;
        turnRebootHaywireCleared = Math.max(
          turnRebootHaywireCleared,
          rebootHaywireCleared
        );
        totalRebootSpamRemoved += rebootSpamRemoved;
        totalRebootSpamDisposalCapacity += rebootSpamDisposalCapacity;
        totalRebootHaywireCleared += rebootHaywireCleared;
        rebootReliefCount += 1;
      }

      // Robot lasers occur in the same late register phase as board lasers. A pit,
      // active trapdoor or crusher has already removed/rebooted the robot before
      // that phase, so no robot-laser exposure stacks onto a terminal transition.
      const robotLaserExpectedDamage = (!transition?.rebooted && !transition?.crashed)
        ? Math.max(0, Number(robotLaserDamageByAbsoluteAction.get(absoluteAction)) || 0)
        : 0;
      const combinedDamageUnits = realized.totalDamageUnits + robotLaserExpectedDamage;
      const pendingSpamBefore = state.pendingSpam;
      const pendingHaywireBefore = state.pendingHaywireRegisterRisks[register - 1] || 0;
      const robotLaserHitProbabilities =
        robotLaserHitProbabilitiesByAbsoluteAction.get(absoluteAction) || [];
      const haywireEventProbability = getDamageEconomyRegisterHaywireEventProbability(
        realized.totalDamageUnits,
        robotLaserHitProbabilities,
        profile.robotLaserDamagePerHit
      );
      const spamDamageUnits = realized.totalDamageUnits +
        (profile.robotLaserSpamSuppressed ? 0 : robotLaserExpectedDamage);
      const added = applyExpectedDamageToEconomyState(
        state,
        combinedDamageUnits,
        register,
        haywireEventProbability,
        spamDamageUnits
      );
      pendingSpamAddedThisTurn += added.spamAdded;
      pendingHaywireRiskAddedThisTurn += added.haywireRegisterRiskAdded;
      totalDamageUnits += combinedDamageUnits;
      deterministicDamageUnits += realized.totalDamageUnits;
      robotLaserExpectedDamageUnits += robotLaserExpectedDamage;
      turnRobotLaserExpectedDamageUnits += robotLaserExpectedDamage;
      boardLaserDamageUnits += realized.boardLaserDamageUnits;
      flamethrowerDamageUnits += realized.flamethrowerDamageUnits;
      flamingOilDamageUnits += realized.flamingOilDamageUnits;
      radiationDamageUnits += realized.radiationDamageUnits;
      radioactiveWasteDamageUnits += realized.radioactiveWasteDamageUnits;
      ledgeDamageUnits += realized.ledgeDamageUnits;
      rebootDamageUnits += realized.rebootDamageUnits;
      totalSpamAdded += added.spamAdded;

      let repairStationRelief = null;
      if (repairStationEligible) {
        repairStationRelief = applyDamageEconomyRepairStationRelief(state);
        spamInHandRemaining = Math.min(spamInHandRemaining, state.spamTotal);
        turnRepairStationSpamRemoved += repairStationRelief.spamRemoved;
        turnRepairStationHaywireExpectedRemoved += repairStationRelief.haywireExpectedRemoved;
        turnRepairStationReliefCount += 1;
        totalRepairStationSpamRemoved += repairStationRelief.spamRemoved;
        totalRepairStationHaywireExpectedRemoved += repairStationRelief.haywireExpectedRemoved;
        repairStationReliefCount += 1;
      }

      const eventSourceTypes = [...(realized.sourceTypes || [])];
      if (robotLaserExpectedDamage > 0.0005) eventSourceTypes.push("robot-laser-expected");
      const event = {
        absoluteAction,
        turn,
        register,
        action: transition?.action ?? null,
        rebooted: Boolean(transition?.rebooted),
        sourceTypes: eventSourceTypes,
        deterministicDamageUnits: Number(realized.totalDamageUnits.toFixed(4)),
        flamethrowerDamageUnits: Number(realized.flamethrowerDamageUnits.toFixed(4)),
        flamingOilDamageUnits: Number(realized.flamingOilDamageUnits.toFixed(4)),
        radiationDamageUnits: Number(realized.radiationDamageUnits.toFixed(4)),
        radioactiveWasteDamageUnits: Number(
          realized.radioactiveWasteDamageUnits.toFixed(4)
        ),
        robotLaserExpectedDamageUnits: Number(robotLaserExpectedDamage.toFixed(4)),
        robotLaserDamagePerHit: profile.robotLaserDamagePerHit,
        robotLaserSpamSuppressed: profile.robotLaserSpamSuppressed,
        robotLaserSpamDamageUnits: Number((
          profile.robotLaserSpamSuppressed ? 0 : robotLaserExpectedDamage
        ).toFixed(4)),
        robotLaserHitProbabilities: robotLaserHitProbabilities.map(
          (value) => Number(value.toFixed(4))
        ),
        haywireEventProbability: Number(haywireEventProbability.toFixed(4)),
        damageUnits: Number(combinedDamageUnits.toFixed(4)),
        randomizerAtRegisterStart: Boolean(randomizerAtRegisterStart),
        randomizerClogLoad: randomizerAtRegisterStart
          ? DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT
          : 0,
        reliefOpportunity: Number(reliefOpportunity.toFixed(4)),
        reliefInitiation: Number(reliefInitiation.toFixed(4)),
        spamChainYield: Number(chainYield.toFixed(4)),
        reliefWallBonus: Number(reliefProfile?.wallBonus || 0),
        reliefWallDistance: reliefProfile?.wallDistance ?? null,
        reliefForwardHazardPenalty: Number(reliefProfile?.forwardHazardPenalty || 0),
        reliefForwardHazardScore: Number(reliefProfile?.forwardHazardScore || 0),
        reliefConveyorMovementBonus: Number(reliefProfile?.conveyorMovementBonus || 0),
        reliefForcedRotationPenalty: Number(reliefProfile?.forcedRotationPenalty || 0),
        reliefForcedMovementPenalty: Number(reliefProfile?.forcedMovementPenalty || 0),
        spamRemoved: Number(totalRemovedThisRegister.toFixed(4)),
        criticalSpamReturnedToPending: Number(
          criticalSpamReturnedToPendingThisRegister.toFixed(4)
        ),
        rebootSpamDisposalCapacity: Number(rebootSpamDisposalCapacity.toFixed(4)),
        rebootSpamRemoved: Number(rebootSpamRemoved.toFixed(4)),
        rebootHaywireCleared: Number(rebootHaywireCleared.toFixed(4)),
        pendingSpamBefore: Number(pendingSpamBefore.toFixed(4)),
        spamAdded: Number(added.spamAdded.toFixed(4)),
        pendingSpamAfter: Number(state.pendingSpam.toFixed(4)),
        pendingHaywireRegisterRiskBefore: Number(pendingHaywireBefore.toFixed(4)),
        haywireRegisterRiskAdded: Number(added.haywireRegisterRiskAdded.toFixed(4)),
        pendingHaywireRegisterRiskAfter: Number(added.haywireRegisterRiskAfter.toFixed(4)),
        repairStationEligible: Boolean(repairStationEligible),
        repairStationSpamRemoved: Number((repairStationRelief?.spamRemoved || 0).toFixed(4)),
        repairStationHaywireExpectedRemoved: Number((repairStationRelief?.haywireExpectedRemoved || 0).toFixed(4))
      };
      events.push(event);
      registerEvents.push(event);
    }

    const turnSpamReliefInitiations =
      forcedSpamReliefInitiations + turnElectiveReliefInitiations;
    totalSpamReliefInitiations += turnSpamReliefInitiations;
    totalForcedSpamReliefInitiations += forcedSpamReliefInitiations;
    totalElectiveSpamReliefInitiations += turnElectiveReliefInitiations;
    totalRandomizerStarts += turnRandomizerStarts;
    totalRandomizerReliefInitiations += turnRandomizerReliefInitiations;
    totalSpamRemoved += turnSpamRemoved + turnRebootSpamRemoved + turnRepairStationSpamRemoved;
    totalCriticalSpamReturnedToPending += turnCriticalSpamReturnedToPending;
    totalSpamChainExtraRemoved += turnSpamChainExtraRemoved;

    // SPAM that was plausibly in hand and neither tactically played nor assigned
    // to skipped post-reboot registers remains held. SPAM Filter is different: it
    // moves all unprogrammed SPAM back to discard at
    // the end of programming, so held burden becomes zero while total burden is
    // unchanged. Critical SPAM likewise moves a played SPAM out of hand; v49eq
    // treats 20% of that played burden as effective relief and returns 80% to
    // pending SPAM for the next programming boundary. Normal SPAM play removes
    // the modeled played burden outright.
    const spamHeldBeforeFilter = Math.min(state.spamTotal, spamInHandRemaining);
    state.spamHeld = profile.spamFilter ? 0 : spamHeldBeforeFilter;

    const pendingHaywireDistribution = getDamageEconomyPoissonBinomialDistribution(
      state.pendingHaywireRegisterRisks
    );
    const pendingHaywireExpected = getDamageEconomyExpectedCount(
      pendingHaywireDistribution
    );
    const electiveSpamPlayDistribution = getDamageEconomyPoissonBinomialDistribution(
      electiveClogInitiationProbabilities
    );
    const forcedSpamHaywireJointDistribution =
      getDamageEconomyAdjustedForcedSpamHaywireJointDistribution(
        programming.forcedSpamHaywireJointDistribution,
        forcedSpamReliefInitiations
      );
    const combinedClog = getDamageEconomyCombinedClogSummary(
      forcedSpamHaywireJointDistribution,
      electiveSpamPlayDistribution,
      turnRandomizerStarts
    );
    const randomizerClogLoad = combinedClog.randomizerClogLoad;
    const randomizerForcedSpamOverlap =
      combinedClog.expectedForcedSpamRandomizerOverlap;
    totalRandomizerClogLoad += randomizerClogLoad;
    totalRandomizerForcedSpamOverlap += randomizerForcedSpamOverlap;
    const turnDamageEconomyRE =
      programming.spamSupplyRegisterEquivalents +
      combinedClog.clogRegisterEquivalents;
    totalRawSpamSupplyRegisterEquivalents +=
      programming.rawSpamSupplyRegisterEquivalents;
    totalPermanentShutdownPressureRegisterEquivalents +=
      programming.permanentShutdownPressureRegisterEquivalents;
    maxPermanentShutdownSupplyMultiplier = Math.max(
      maxPermanentShutdownSupplyMultiplier,
      programming.permanentShutdownSupplyMultiplier
    );
    totalSpamSupplyRegisterEquivalents += programming.spamSupplyRegisterEquivalents;
    totalClogRegisterEquivalents += combinedClog.clogRegisterEquivalents;
    totalDamageEconomyRegisterEquivalents += turnDamageEconomyRE;
    maxTurnDamageEconomyRegisterEquivalents = Math.max(
      maxTurnDamageEconomyRegisterEquivalents,
      turnDamageEconomyRE
    );
    maxSpamTotal = Math.max(maxSpamTotal, state.spamTotal + state.pendingSpam);
    maxSpamHeld = Math.max(maxSpamHeld, state.spamHeld);
    maxExpectedHaywireClogs = Math.max(
      maxExpectedHaywireClogs,
      programming.expectedHaywireClogs,
      pendingHaywireExpected
    );
    maxExpectedTotalClogs = Math.max(
      maxExpectedTotalClogs,
      combinedClog.expectedControlClogLoad
    );

    turns.push({
      turn,
      programRegisters,
      previousProgramCode,
      baseDeckSize: programming.baseDeckSize,
      baseHandSize: programming.baseHandSize,
      spamTotalAtProgramming: Number(spamTotalAtProgramming.toFixed(4)),
      spamHeldAtProgramming: Number(spamHeldCarry.toFixed(4)),
      spamCirculatingAtProgramming: Number(spamCirculatingAtProgramming.toFixed(4)),
      effectiveHeldSpam: programming.effectiveHeldSpam,
      effectiveCirculatingSpam: programming.effectiveCirculatingSpam,
      expectedFreshDrawSlots: Number(programming.expectedFreshDrawSlots.toFixed(3)),
      expectedSpamDrawn: Number(programming.expectedSpamDrawn.toFixed(3)),
      expectedSpamInHand: Number(programming.expectedSpamInHand.toFixed(3)),
      cleanProgramProbability: Number(programming.cleanProgramProbability.toFixed(5)),
      damagedProgramProbability: Number(programming.damagedProgramProbability.toFixed(5)),
      rawSpamSupplyRegisterEquivalents: Number(
        programming.rawSpamSupplyRegisterEquivalents.toFixed(3)
      ),
      permanentShutdownSpamBurden: Number(
        programming.permanentShutdownSpamBurden.toFixed(3)
      ),
      permanentShutdownSupplyMultiplier: Number(
        programming.permanentShutdownSupplyMultiplier.toFixed(4)
      ),
      permanentShutdownPressureRegisterEquivalents: Number(
        programming.permanentShutdownPressureRegisterEquivalents.toFixed(3)
      ),
      spamSupplyRegisterEquivalents: Number(
        programming.spamSupplyRegisterEquivalents.toFixed(3)
      ),
      expectedHaywireClogs: Number(programming.expectedHaywireClogs.toFixed(3)),
      forcedSpamReliefInitiations: Number(forcedSpamReliefInitiations.toFixed(3)),
      electiveSpamReliefInitiations: Number(turnElectiveReliefInitiations.toFixed(3)),
      spamPlayInitiations: Number(turnSpamReliefInitiations.toFixed(3)),
      spamPlayClogWeight: DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT,
      randomizerStarts: turnRandomizerStarts,
      randomizerClogWeight: DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT,
      randomizerClogLoad: Number(randomizerClogLoad.toFixed(3)),
      randomizerForcedSpamOverlap: Number(randomizerForcedSpamOverlap.toFixed(3)),
      randomizerReliefInitiations: Number(turnRandomizerReliefInitiations.toFixed(3)),
      spamPlayClogLoad: Number(combinedClog.spamClogLoad.toFixed(3)),
      spamPlayCountDistribution: combinedClog.spamPlayCountDistribution.map(
        (value) => Number(value.toFixed(4))
      ),
      expectedTotalControlClogLoad: Number(combinedClog.expectedControlClogLoad.toFixed(3)),
      controlClogLoadDistribution: (combinedClog.controlClogLoadDistribution || []).map(
        (entry) => ({
          load: Number((Number(entry.load) || 0).toFixed(4)),
          probability: Number((Number(entry.probability) || 0).toFixed(6))
        })
      ),
      clogRegisterEquivalents: Number(combinedClog.clogRegisterEquivalents.toFixed(3)),
      damageEconomyRegisterEquivalents: Number(turnDamageEconomyRE.toFixed(3)),
      probabilityFourPlusClogs: Number(combinedClog.probabilityFourPlusClogs.toFixed(4)),
      probabilityFivePlusClogs: Number(combinedClog.probabilityFivePlusClogs.toFixed(4)),
      reliefOpportunity: Number(turnReliefOpportunity.toFixed(3)),
      reliefInitiations: Number(turnSpamReliefInitiations.toFixed(3)),
      forcedSpamRemoved: Number(forcedSpamRemoved.toFixed(3)),
      forcedCriticalSpamReturnedToPending: Number(
        forcedCriticalSpamReturnedToPending.toFixed(3)
      ),
      forcedSpamChainYield: Number(forcedSpamChainYield.toFixed(4)),
      spamRemoved: Number(turnSpamRemoved.toFixed(3)),
      criticalSpamReturnedToPending: Number(
        turnCriticalSpamReturnedToPending.toFixed(3)
      ),
      spamChainExtraRemoved: Number(turnSpamChainExtraRemoved.toFixed(3)),
      rebootRegister: turnRebootRegister || null,
      rebootSpamDisposalCapacity: Number(turnRebootSpamDisposalCapacity.toFixed(3)),
      rebootSpamRemoved: Number(turnRebootSpamRemoved.toFixed(3)),
      rebootHaywireCleared: Number(turnRebootHaywireCleared.toFixed(3)),
      repairStationReliefCount: turnRepairStationReliefCount,
      repairStationSpamRemoved: Number(turnRepairStationSpamRemoved.toFixed(3)),
      repairStationHaywireExpectedRemoved: Number(turnRepairStationHaywireExpectedRemoved.toFixed(3)),
      spamHeldBeforeFilter: Number(spamHeldBeforeFilter.toFixed(3)),
      spamHeldAtTurnEnd: Number(state.spamHeld.toFixed(3)),
      spamTotalBeforeNewDamage: Number(state.spamTotal.toFixed(3)),
      deterministicDamageUnits: Number(
        registerEvents.reduce((sum, event) => sum + (Number(event.deterministicDamageUnits) || 0), 0).toFixed(3)
      ),
      robotLaserExpectedDamageUnits: Number(turnRobotLaserExpectedDamageUnits.toFixed(3)),
      totalDamageUnits: Number(
        registerEvents.reduce((sum, event) => sum + (Number(event.damageUnits) || 0), 0).toFixed(3)
      ),
      pendingSpamAddedThisTurn: Number(pendingSpamAddedThisTurn.toFixed(3)),
      pendingSpamAtTurnEnd: Number(state.pendingSpam.toFixed(3)),
      pendingHaywireRegisterRisks: state.pendingHaywireRegisterRisks.map(
        (value) => Number(value.toFixed(4))
      ),
      pendingHaywireExpectedForNextTurn: Number(pendingHaywireExpected.toFixed(3)),
      pendingHaywireRiskAddedThisTurn: Number(pendingHaywireRiskAddedThisTurn.toFixed(3)),
      criticalHaywireHandRule: profile.criticalHaywireCountsAgainstHand,
      spamFilterApplied: profile.spamFilter,
      criticalSpamApplied: profile.criticalSpam,
      registerEvents
    });
  }

  const shutdownScoring = replayDamageEconomyShutdownEquivalentScore({
    maxRouteTurn,
    selectedProgramTurns,
    recordsByTurn,
    robotLaserDamageByAbsoluteAction,
    robotLaserHitProbabilitiesByAbsoluteAction,
    reliefOpportunityByAbsoluteAction,
    options
  });
  const shutdownTurnScoringByTurn = new Map(
    (shutdownScoring.turnScoring || []).map((entry) => [entry.turn, entry])
  );
  turns.forEach((turnSummary) => {
    const scoring = shutdownTurnScoringByTurn.get(turnSummary.turn);
    turnSummary.shutdownThreatSegmentRegisterEquivalents =
      scoring?.segmentRawRegisterEquivalents ?? 0;
    turnSummary.shutdownEquivalentEpisodeAfterTurn =
      Boolean(scoring?.episodeTriggered);
  });

  const activeHaywireExpected = getDamageEconomyExpectedCount(
    state.activeHaywireDistribution
  );
  const terminalPendingHaywireDistribution = getDamageEconomyPoissonBinomialDistribution(
    state.pendingHaywireRegisterRisks
  );
  const terminalPendingHaywireExpected = getDamageEconomyExpectedCount(
    terminalPendingHaywireDistribution
  );
  const telemetry = getDamageEconomyTelemetrySnapshot();
  const summary = {
    method: DAMAGE_ECONOMY_MODEL_ID,
    observationalOnly: false,
    scoringActive: true,
    routingActive: true,
    spamShare: Number(profile.spamShare.toFixed(4)),
    haywireShare: Number(profile.haywireShare.toFixed(4)),
    shutdownReferenceRegisterEquivalents: DAMAGE_ECONOMY_SHUTDOWN_REFERENCE_RE,
    shutdownContextualRiskModeled: false,
    shutdownEquivalentScoringModeled: false,
    shutdownToleranceReferenceModeled: true,
    shutdownReferenceRole:
      "counterfactual-damage-tolerance-benchmark-not-programmed-event-or-cap",
    activeVariantHooks: profile.activeHooks,
    implementedVariantHooks: profile.implementedHooks,
    deferredVariantHooks: profile.deferredHooks,
    baseHandSize: profile.handSize,
    totalDamageUnits: Number(totalDamageUnits.toFixed(3)),
    deterministicDamageUnits: Number(deterministicDamageUnits.toFixed(3)),
    robotLaserExpectedDamageUnits: Number(robotLaserExpectedDamageUnits.toFixed(3)),
    robotLaserTrafficAvailable: Boolean(trafficRanged),
    robotLaserTrafficOccupancyModel: trafficRanged?.occupancyModel ?? null,
    robotLaserTrafficConfidenceMean: trafficRanged?.confidenceMean ?? null,
    boardLaserDamageUnits: Number(boardLaserDamageUnits.toFixed(3)),
    flamethrowerDamageUnits: Number(flamethrowerDamageUnits.toFixed(3)),
    flamingOilDamageUnits: Number(flamingOilDamageUnits.toFixed(3)),
    radiationDamageUnits: Number(radiationDamageUnits.toFixed(3)),
    radioactiveWasteDamageUnits: Number(radioactiveWasteDamageUnits.toFixed(3)),
    ledgeDamageUnits: Number(ledgeDamageUnits.toFixed(3)),
    rebootDamageUnits: Number(rebootDamageUnits.toFixed(3)),
    totalSpamAdded: Number(totalSpamAdded.toFixed(3)),
    totalSpamRemoved: Number(totalSpamRemoved.toFixed(3)),
    totalCriticalSpamReturnedToPending: Number(
      totalCriticalSpamReturnedToPending.toFixed(3)
    ),
    totalSpamReliefInitiations: Number(totalSpamReliefInitiations.toFixed(3)),
    totalForcedSpamReliefInitiations: Number(totalForcedSpamReliefInitiations.toFixed(3)),
    totalElectiveSpamReliefInitiations: Number(totalElectiveSpamReliefInitiations.toFixed(3)),
    totalRandomizerStarts,
    totalRandomizerReliefInitiations: Number(totalRandomizerReliefInitiations.toFixed(3)),
    totalRandomizerForcedSpamOverlap: Number(totalRandomizerForcedSpamOverlap.toFixed(3)),
    randomizerClogWeight: DAMAGE_ECONOMY_RANDOMIZER_CLOG_WEIGHT,
    totalRandomizerClogLoad: Number(totalRandomizerClogLoad.toFixed(3)),
    spamPlayClogWeight: DAMAGE_ECONOMY_SPAM_PLAY_CLOG_WEIGHT,
    totalSpamChainExtraRemoved: Number(totalSpamChainExtraRemoved.toFixed(3)),
    totalRebootSpamRemoved: Number(totalRebootSpamRemoved.toFixed(3)),
    totalRebootSpamDisposalCapacity: Number(totalRebootSpamDisposalCapacity.toFixed(3)),
    totalRebootHaywireCleared: Number(totalRebootHaywireCleared.toFixed(3)),
    rebootReliefCount,
    repairStationReliefCount,
    totalRepairStationSpamRemoved: Number(totalRepairStationSpamRemoved.toFixed(3)),
    totalRepairStationHaywireExpectedRemoved: Number(totalRepairStationHaywireExpectedRemoved.toFixed(3)),
    repairStationReliefMethod: "register5-checkpoint-one-damage-card-expected-split-no-spill-v49eo",
    spamReliefMethod: "five-card-floor-plus-randomizer-full-relief-shared-clog-v49fh",
    criticalSpamPlayReliefFraction: profile.criticalSpamPlayReliefFraction,
    criticalSpamPlayReturnToPendingFraction:
      profile.criticalSpamPlayReturnToPendingFraction,
    criticalSpamApproximationMethod:
      "played-spam-20pct-effective-relief-80pct-return-to-pending-v49eq-provisional",
    spamClogMethod: "distributed-spam-play-count-weight2-plus-haywire-joint-nonlinear",
    rebootReliefMethod: "selected-route-skipped-register-capacity-active-haywire-clear",
    permanentShutdownPressureActive: profile.permanentShutdownPressureActive,
    permanentShutdownPressureMethod:
      "provisional-persistent-spam-triangular-multiplier-v49ep",
    permanentShutdownSpamBurdenCoefficient:
      profile.permanentShutdownSpamBurdenCoefficient,
    totalRawSpamSupplyRegisterEquivalents: Number(
      totalRawSpamSupplyRegisterEquivalents.toFixed(3)
    ),
    totalPermanentShutdownPressureRegisterEquivalents: Number(
      totalPermanentShutdownPressureRegisterEquivalents.toFixed(3)
    ),
    maxPermanentShutdownSupplyMultiplier: Number(
      maxPermanentShutdownSupplyMultiplier.toFixed(4)
    ),
    totalSpamSupplyRegisterEquivalents: Number(
      totalSpamSupplyRegisterEquivalents.toFixed(3)
    ),
    totalClogRegisterEquivalents: Number(totalClogRegisterEquivalents.toFixed(3)),
    totalDamageEconomyRegisterEquivalents: Number(
      totalDamageEconomyRegisterEquivalents.toFixed(3)
    ),
    maxTurnDamageEconomyRegisterEquivalents: Number(
      maxTurnDamageEconomyRegisterEquivalents.toFixed(3)
    ),
    shutdownEquivalentEpisodeCount: shutdownScoring.shutdownEquivalentEpisodeCount,
    shutdownEquivalentEpisodeTurns: shutdownScoring.shutdownEquivalentEpisodeTurns,
    shutdownEquivalentRegisterEquivalents:
      shutdownScoring.shutdownEquivalentRegisterEquivalents,
    shutdownResidualRegisterEquivalents:
      shutdownScoring.shutdownResidualRegisterEquivalents,
    shutdownEquivalentDamageScoreRegisterEquivalents:
      shutdownScoring.shutdownEquivalentDamageScoreRegisterEquivalents,
    shutdownThreatPeakSegmentRegisterEquivalents:
      shutdownScoring.shutdownThreatPeakSegmentRegisterEquivalents,
    shutdownThreatLevel: shutdownScoring.shutdownThreatLevel,
    damageAvoidanceSignal: shutdownScoring.shutdownEquivalentEpisodeCount > 0
      ? "above-shutdown-tolerance-reference"
      : shutdownScoring.shutdownThreatLevel === "elevated"
        ? "approaching-shutdown-tolerance-reference"
        : "below-shutdown-tolerance-reference",
    maxSpamTotal: Number(maxSpamTotal.toFixed(3)),
    maxSpamHeld: Number(maxSpamHeld.toFixed(3)),
    maxExpectedHaywireClogs: Number(maxExpectedHaywireClogs.toFixed(3)),
    maxExpectedTotalClogs: Number(maxExpectedTotalClogs.toFixed(3)),
    finalSpamTotal: Number(state.spamTotal.toFixed(4)),
    finalSpamHeld: Number(state.spamHeld.toFixed(4)),
    finalSpamCirculating: Number(Math.max(0, state.spamTotal - state.spamHeld).toFixed(4)),
    finalActiveHaywireExpectedClogs: Number(activeHaywireExpected.toFixed(4)),
    finalPendingSpam: Number(state.pendingSpam.toFixed(4)),
    finalPendingHaywireExpectedClogs: Number(terminalPendingHaywireExpected.toFixed(4)),
    finalPendingHaywireRegisterRisks: state.pendingHaywireRegisterRisks.map(
      (value) => Number(value.toFixed(4))
    ),
    turns,
    events,
    ...telemetry
  };
  activeRouteSummaryCache.set(route, {
    signature: cacheSignature,
    summary
  });
  return summary;
}

export function summarizeRegisterEquivalentLedger(
  tileMap,
  route,
  options = {},
  trafficContext = null
) {
  if (!tileMap || !route) return null;

  const transitions = Array.isArray(route.transitions) ? route.transitions : [];
  if (!transitions.length) return null;

  const damage = summarizeDamageEconomyFoundationForRoute(
    tileMap,
    route,
    options,
    trafficContext
  );
  const damageTurnByTurn = new Map(
    (damage?.turns || []).map((turn) => [turn.turn, turn])
  );
  const damageEventByAbsoluteAction = new Map(
    (damage?.events || []).map((event) => [event.absoluteAction, event])
  );

  // Full-course routes are expected to begin at the course start. If a caller
  // supplies an isolated later leg, its missing prior program history makes an
  // exact per-turn clean-card split unknowable; in that case fall back to the
  // route-level card field below rather than inventing history.
  const initialAbsoluteAction = Math.max(
    0,
    Number(route.absoluteStartAction) || 0
  );
  const actionIds = transitions.map((transition) => transition?.action).filter(Boolean);
  const cardReplay = initialAbsoluteAction === 0
    ? scoreContextualCardSequence(
      [],
      0,
      actionIds,
      options,
      null,
      transitions
    )
    : null;
  const perActionCardScores = cardReplay?.feasible &&
      cardReplay.actionScarcityPenalties?.length === transitions.length
    ? cardReplay.actionScarcityPenalties
    : null;

  // Checkpoint hits are leg endings. Preserve actual absolute register chronology
  // so a checkpoint inside a five-register turn does not reset the turn ledger.
  const checkpointActions = new Set();
  if (Array.isArray(route.legRoutes) && route.legRoutes.length) {
    let previousAbsolute = initialAbsoluteAction;
    for (const leg of route.legRoutes) {
      let elapsed = Math.max(0, Number(leg?.absoluteStartAction) || previousAbsolute);
      const legTransitions = Array.isArray(leg?.transitions) ? leg.transitions : [];
      for (const transition of legTransitions) {
        const absoluteAction = getRegisterEquivalentLedgerAbsoluteAction(
          transition,
          elapsed + 1
        );
        elapsed = transition?.rebooted
          ? getRebootEndedAbsoluteActions(absoluteAction)
          : absoluteAction;
      }
      const last = legTransitions.at(-1);
      if (last) {
        checkpointActions.add(getRegisterEquivalentLedgerAbsoluteAction(
          last,
          Math.max(1, elapsed)
        ));
      }
      previousAbsolute = elapsed;
    }
  } else if (transitions.length) {
    let elapsed = initialAbsoluteAction;
    let lastAbsolute = null;
    for (const transition of transitions) {
      lastAbsolute = getRegisterEquivalentLedgerAbsoluteAction(transition, elapsed + 1);
      elapsed = transition?.rebooted
        ? getRebootEndedAbsoluteActions(lastAbsolute)
        : lastAbsolute;
    }
    if (lastAbsolute !== null) checkpointActions.add(lastAbsolute);
  }

  const turns = new Map();
  const ensureTurn = (turnNumber) => {
    if (!turns.has(turnNumber)) {
      turns.set(turnNumber, {
        turn: turnNumber,
        programmedRegisterRE: 0,
        lostRegisterTempoRE: 0,
        cleanCardPlausibilityRE: 0,
        damageCardSupplyRE: 0,
        clogRE: 0,
        energyRE: 0,
        planningEvents: []
      });
    }
    return turns.get(turnNumber);
  };

  let elapsedAbsolute = initialAbsoluteAction;
  let energyReserve = Number.isFinite(Number(route.routeEnergyShadowReserveStart))
    ? Number(route.routeEnergyShadowReserveStart)
    : getInitialRouteEnergyShadowReserve(options);
  const homingMissileActivatedSpacesThisTurn = new Set();
  const variantMentalEventIdsThisTurn = new Set();
  let activeHomingMissileTurn = initialAbsoluteAction > 0
    ? Math.floor((initialAbsoluteAction - 1) / REGISTER_COUNT) + 1
    : 1;

  transitions.forEach((transition, index) => {
    const absoluteAction = getRegisterEquivalentLedgerAbsoluteAction(
      transition,
      elapsedAbsolute + 1
    );
    const turnNumber = Math.floor((Math.max(1, absoluteAction) - 1) / REGISTER_COUNT) + 1;
    const register = getRegisterPosition(absoluteAction);
    if (turnNumber !== activeHomingMissileTurn) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
      activeHomingMissileTurn = turnNumber;
    }
    const turn = ensureTurn(turnNumber);
    turn.programmedRegisterRE += 1;

    if (perActionCardScores) {
      turn.cleanCardPlausibilityRE += Math.max(
        0,
        Number(perActionCardScores[index]) || 0
      ) / REGISTER_TEMPO_COST;
    }

    if (transition?.to && transition?.action) {
      const energyStep = getRouteEnergyShadowStep(
        tileMap,
        transition.to,
        transition.action,
        absoluteAction,
        energyReserve,
        0,
        options,
        transition
      );
      turn.energyRE -= Math.max(
        0,
        Number(energyStep.rewardRegisterEquivalents) || 0
      );
      energyReserve = energyStep.reserveAfter;
    }

    const damageEvent = damageEventByAbsoluteAction.get(absoluteAction) ?? null;
    const planningEvents = getRegisterEquivalentLedgerPlanningEventsForTransition(
      tileMap,
      transition,
      damageEvent,
      checkpointActions.has(absoluteAction),
      options,
      {
        homingMissileActivatedSpacesThisTurn,
        variantMentalEventIdsThisTurn,
        registerPosition: register
      }
    );
    planningEvents.forEach((event) => turn.planningEvents.push({
      ...event,
      absoluteAction,
      register
    }));

    if (transition?.rebooted) {
      turn.lostRegisterTempoRE += Math.max(0, REGISTER_COUNT - register);
    }
    if (transition?.rebooted || register === REGISTER_COUNT) {
      homingMissileActivatedSpacesThisTurn.clear();
      variantMentalEventIdsThisTurn.clear();
    }

    elapsedAbsolute = transition?.rebooted
      ? getRebootEndedAbsoluteActions(absoluteAction)
      : absoluteAction;
  });

  // v49cc: when an authoritative traffic context supplies collapsed nearby
  // turn episodes, add exactly one fractional non-laser awareness event per turn.
  // This is presentation/full-ledger replay only; intrinsic post-build search
  // mental still filters all traffic-awareness events.
  for (const episode of trafficContext?.nearbyTurnEpisodeByTurn || []) {
    const turnNumber = Math.max(1, Math.floor(Number(episode?.turn) || 1));
    const eventProbability = clamp(
      Number(episode?.eventProbability) || 0,
      0,
      1
    );
    if (eventProbability <= 0.0005) continue;
    const turn = ensureTurn(turnNumber);
    turn.planningEvents.push({
      type: "traffic-awareness:non-laser-control",
      weight: eventProbability,
      turnLevel: true,
      detail: {
        episodeControlLoad: Math.max(
          0,
          Number(episode?.episodeControlLoad) || 0
        ),
        episodeControlRE: Math.max(
          0,
          Number(episode?.episodeControlRE) || 0
        )
      }
    });
  }

  // Damage is already cached/rounded by the production model. Reuse its turn
  // decomposition directly: SPAM supply affects card plausibility; Haywire/SPAM
  // play affect the separate clog curve. No extra generic damage RE is invented.
  for (const [turnNumber, turn] of turns) {
    const damageTurn = damageTurnByTurn.get(turnNumber);
    turn.damageCardSupplyRE = Math.max(
      0,
      Number(damageTurn?.spamSupplyRegisterEquivalents) || 0
    );
    turn.clogRE = Math.max(
      0,
      Number(damageTurn?.clogRegisterEquivalents) || 0
    );
    const rawEventCount = turn.planningEvents.reduce(
      (sum, event) => sum + (Number(event.weight) || 0),
      0
    );
    turn.planningEventRawCount = Number(rawEventCount.toFixed(4));
    turn.planningEventRoundedCount = Math.max(0, Math.round(rawEventCount));
    turn.mentalRegisterEquivalents = getObservationalMentalRegisterEquivalents(
      turn.planningEventRoundedCount
    );
    turn.knownMechanismSubtotalRE = Number((
      turn.programmedRegisterRE +
      turn.lostRegisterTempoRE +
      turn.cleanCardPlausibilityRE +
      turn.damageCardSupplyRE +
      turn.clogRE +
      turn.energyRE
    ).toFixed(4));
    turn.observationalSubtotalWithMentalRE = Number((
      turn.knownMechanismSubtotalRE +
      turn.mentalRegisterEquivalents
    ).toFixed(4));
    turn.programmedRegisterRE = Number(turn.programmedRegisterRE.toFixed(4));
    turn.lostRegisterTempoRE = Number(turn.lostRegisterTempoRE.toFixed(4));
    turn.cleanCardPlausibilityRE = Number(turn.cleanCardPlausibilityRE.toFixed(4));
    turn.damageCardSupplyRE = Number(turn.damageCardSupplyRE.toFixed(4));
    turn.clogRE = Number(turn.clogRE.toFixed(4));
    turn.energyRE = Number(turn.energyRE.toFixed(4));
  }

  const orderedTurns = [...turns.values()].sort((a, b) => a.turn - b.turn);
  const sum = (key) => Number(orderedTurns.reduce(
    (total, turn) => total + (Number(turn[key]) || 0),
    0
  ).toFixed(4));
  const routeCardFallbackRE = Math.max(
    0,
    (Number(route.cardAvailabilityPenalty) || 0) +
      (Number(route.programPlausibilityPenalty) || 0)
  ) / REGISTER_TEMPO_COST;
  const cleanCardPlausibilityRE = perActionCardScores
    ? sum("cleanCardPlausibilityRE")
    : Number(routeCardFallbackRE.toFixed(4));
  const programmedRegisterRE = sum("programmedRegisterRE");
  const lostRegisterTempoRE = sum("lostRegisterTempoRE");
  const damageCardSupplyRE = sum("damageCardSupplyRE");
  const clogRE = sum("clogRE");
  const energyRE = sum("energyRE");
  const mentalRegisterEquivalents = sum("mentalRegisterEquivalents");
  const homingMissileActivationCount = orderedTurns.reduce(
    (total, turn) => total + (turn.planningEvents || []).filter(
      (event) => event?.type === "homing-missile-target-choice"
    ).length,
    0
  );
  const homingMissileStrategicCreditRE = Number((
    homingMissileActivationCount * HOMING_MISSILE_STRATEGIC_CREDIT_RE
  ).toFixed(4));
  const knownMechanismSubtotalRE = Number((
    programmedRegisterRE +
    lostRegisterTempoRE +
    cleanCardPlausibilityRE +
    damageCardSupplyRE +
    clogRE +
    energyRE
  ).toFixed(4));
  const observationalSubtotalWithMentalRE = Number((
    knownMechanismSubtotalRE + mentalRegisterEquivalents
  ).toFixed(4));

  return {
    method: RE_LEDGER_MODEL_ID,
    observationalOnly: true,
    affectsRouting: false,
    programmedRegisterRE,
    lostRegisterTempoRE,
    cleanCardPlausibilityRE,
    cleanCardSplitExact: Boolean(perActionCardScores),
    damageCardSupplyRE,
    clogRE,
    energyRE,
    mentalRegisterEquivalents,
    homingMissileActivationCount,
    homingMissileStrategicCreditRE,
    homingMissileStrategicCreditModel:
      "2x-neutral-damage-economy-one-damage-reference-per-turn-per-space-activation-v49ej",
    homingMissileOneDamageReferenceRE: Number(
      HOMING_MISSILE_ONE_DAMAGE_REFERENCE_RE.toFixed(4)
    ),
    homingMissileStrategicDamageEquivalents:
      HOMING_MISSILE_STRATEGIC_DAMAGE_EQUIVALENTS,
    homingMissileCheapSearchGuidanceScore: Number(
      getHomingMissileSearchGuidanceScore(options).toFixed(2)
    ),
    knownMechanismSubtotalRE,
    observationalSubtotalWithMentalRE,
    mentalCurveApplied: true,
    mentalCurveObservationalOnly: true,
    mentalCurve: {
      method: "rounded-turn-events-quadratic-after-7",
      zeroThroughEvents: 7,
      divisor: 32,
      anchors: { 7: 0, 11: 0.5, 15: 2, 19: 4.5 }
    },
    trafficControlEventsModeled: false,
    avoidedConstraintEventsModeled: false,
    shutdownEquivalentProductionDamageRE: null,
    rawProductionDamageEconomyRE:
      damage?.totalDamageEconomyRegisterEquivalents ?? null,
    shutdownToleranceReferenceRE:
      damage?.shutdownReferenceRegisterEquivalents ?? null,
    rawDamageEconomyRE: damage?.totalDamageEconomyRegisterEquivalents ?? null,
    damageModel: damage?.method ?? null,
    turns: orderedTurns
  };
}

// Physical robot-laser exposure uses the same occupancy/temporal uncertainty
// geometry as traffic, but deliberately strips route-score consequence weights.
// A predicted shooter either has line of sight from a cardinal direction or it
// does not. Temporal fuzz turns that into a probability-like exposure for that
// one robot; later aggregation applies occupancy and the existing one-hit-per-
// cardinal-direction cap. This keeps optional damage-score multipliers and rear/
// side persistence heuristics out of the physical damage-card input.
export function getDamageEconomyRobotShotProfile(tileMap, route, otherRoute) {
  const timelineA = getRegisterTimeline(route);
  const timelineB = getRegisterTimeline(otherRoute);
  const byFacing = Object.fromEntries(
    ROTATION_ORDER.map((dir) => [dir, new Array(timelineA.length).fill(0)])
  );
  if (!timelineA.length || !timelineB.length) return byFacing;

  timelineA.forEach((pointA, timelineIndex) => {
    let temporalMass = 0;
    let strongestTemporal = 0;
    const weightedByFacing = Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, 0]));
    const maximumOtherUncertainty = 2.8;
    const temporalRadius = Math.ceil(
      ((pointA.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
    );
    const centerIndex = getClosestTimelineIndexByAbsoluteRegister(
      timelineB,
      Number(pointA.absoluteRegister) || (pointA.legRegister ?? 1)
    );
    const firstIndex = Math.max(0, centerIndex - temporalRadius);
    const lastIndex = Math.min(timelineB.length - 1, centerIndex + temporalRadius);

    for (let otherIndex = firstIndex; otherIndex <= lastIndex; otherIndex += 1) {
      const pointB = timelineB[otherIndex];
      const temporal = getTemporalInteractionWeight(pointA, pointB);
      if (temporal <= 0) continue;
      temporalMass += temporal;
      strongestTemporal = Math.max(strongestTemporal, temporal);
      const incomingFacing = getIncomingRobotLaserDirection(
        tileMap,
        pointA,
        pointB
      );
      if (incomingFacing) {
        weightedByFacing[incomingFacing] += temporal * getVirtualPhysicalInteractionScale();
      }
    }

    if (temporalMass <= 0) return;
    const credibility = Math.min(1, strongestTemporal);
    for (const dir of ROTATION_ORDER) {
      byFacing[dir][timelineIndex] = (
        weightedByFacing[dir] / temporalMass
      ) * credibility;
    }
  });

  return byFacing;
}

// Reconstruct the existing production robot-laser traffic field register by
// register so it can be fed into the same chronological damage-state shadow.
// Occupancy allocation, temporal fuzz, cardinal blocking cap, opening/later
// weighting, and forecast-confidence attenuation are intentionally the existing
// traffic model. Nearby/displacement and competition are still calculated to
// advance confidence exactly as production does, but they are NOT converted to
// damage here. This preserves congestion/interference as their own consequences.
export function getDamageEconomyTrafficRangedRegisterInputs(
  tileMap,
  route,
  trafficContext = null,
  options = {}
) {
  const analyses = Array.isArray(trafficContext?.analyses)
    ? trafficContext.analyses.filter((analysis) => analysis?.fullCourseRoute)
    : [];
  const focusIndex = trafficContext?.focusIndex;
  if (!route || !analyses.length || !Number.isInteger(focusIndex)) {
    return null;
  }
  const focus = analyses.find((analysis) => analysis.index === focusIndex);
  if (!focus) return null;
  const playerCount = Math.max(1, Number(options.playerCount) || analyses.length);
  const occupancyOptions = {
    ...options,
    // Reconstruct the same common traffic field as production. Normal and
    // Competitive use the retained traffic-aware balance score; start-Energy
    // pricing may provide post-adjustment quality explicitly because pricing can
    // change relative start attractiveness without changing route geometry.
    trafficOccupancyUseBalanceScore: true,
    occupancyQualityScoreByIndex:
      trafficContext?.occupancyQualityScoreByIndex ?? options.occupancyQualityScoreByIndex
  };
  const occupancyByIndex = buildConditionalOccupancyMap(
    analyses,
    focusIndex,
    playerCount,
    occupancyOptions,
    (analysis) => analysis.fullCourseRoute
  );
  const fullOtherEntries = buildTrafficRouteMixtureEntries(
    analyses,
    focusIndex,
    occupancyByIndex,
    trafficContext?.routeMixtureByIndex ?? null
  );

  const productionReplay = getExpectedTrafficBreakdown(
    tileMap,
    route,
    fullOtherEntries,
    trafficContext?.flags ?? [],
    {
      ...options,
      playerCount
    }
  );
  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length || !fullOtherEntries.length) {
    return {
      records: [],
      rawRangedScore: 0,
      effectiveRangedScore: 0,
      productionReplayRangedScore: productionReplay?.ranged ?? 0,
      expectedDamageUnits: 0,
      confidenceMean: 1,
      confidenceEnd: 1,
      occupancyTotal: Number([...occupancyByIndex.values()].reduce((a, b) => a + b, 0).toFixed(3)),
      occupancyModel: trafficContext?.occupancyModel ?? "common-quality-weighted-route-mixture-field"
    };
  }

  const damageUnit = getStandardRobotLaserCost();
  const damageProfile = getDamageEconomyVariantProfile(options);
  const robotLaserDamagePerHit = damageProfile.robotLaserDamagePerHit;
  const confidenceMaps = getRENativeProductionTrafficConfidenceMaps(
    tileMap,
    route,
    options
  );
  let carriedConfidence = confidenceMaps.profile?.averageConfidence ?? 1;
  let rawRangedScore = 0;
  let effectiveRangedScore = 0;
  let expectedDamageUnits = 0;
  let confidenceSum = 0;
  let confidenceRegisters = 0;
  const records = [];

  routeLegs.forEach((routeLeg, legIndex) => {
    const timelineA = getRegisterTimeline(routeLeg);
    if (!timelineA.length) return;
    const otherLegEntries = fullOtherEntries
      .map((entry) => ({
        route: getTrafficLegs(entry.route)[legIndex] ?? null,
        occupancyWeight: entry.occupancyWeight
      }))
      .filter((entry) => entry.route && entry.occupancyWeight > 0);
    const preparedOthers = otherLegEntries
      .map(getTrafficRouteEntry)
      .filter((entry) => entry.route && entry.occupancyWeight > 0);
    const rangedByRegisterFacing = timelineA.map(() => (
      Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, 0]))
    ));
    const shotByRegisterFacing = timelineA.map(() => (
      Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, 0]))
    ));
    const nearbyByRegister = new Array(timelineA.length).fill(0);
    const competitionByRegister = new Array(timelineA.length).fill(0);

    for (const other of preparedOthers) {
      const profile = getTrafficPairProfile(tileMap, routeLeg, other.route, options);
      const shotProfile = getDamageEconomyRobotShotProfile(
        tileMap,
        routeLeg,
        other.route
      );
      for (let index = 0; index < timelineA.length; index += 1) {
        for (const dir of ROTATION_ORDER) {
          rangedByRegisterFacing[index][dir] += (
            (profile.rangedByFacing?.[dir]?.[index] ?? 0) * other.occupancyWeight
          );
          shotByRegisterFacing[index][dir] += (
            (shotProfile?.[dir]?.[index] ?? 0) * other.occupancyWeight
          );
        }
        nearbyByRegister[index] += (profile.nearby[index] ?? 0) * other.occupancyWeight;
        competitionByRegister[index] += (profile.competition[index] ?? 0) * other.occupancyWeight;
      }
    }

    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;

    for (let index = 0; index < timelineA.length; index += 1) {
      let registerRanged = 0;
      for (const dir of ROTATION_ORDER) {
        registerRanged += Math.min(rangedByRegisterFacing[index][dir], damageUnit);
      }
      const registerNearby = Math.min(nearbyByRegister[index], damageUnit * 3.25);
      const registerCompetition = Math.min(competitionByRegister[index], damageUnit);
      const registerRawInteraction = registerRanged + registerNearby + registerCompetition;
      const absoluteAction = timelineA[index]?.absoluteRegister ??
        getTransitionAbsoluteAction(
          routeLeg.transitions?.[index],
          Math.max(0, Number(routeLeg.absoluteStartAction) || 0) + index + 1
        );
      const confidence = getRENativeTrafficConfidenceForAbsoluteAction(
        confidenceMaps.confidenceByAbsoluteAction,
        absoluteAction,
        carriedConfidence
      );
      let registerExpectedHits = 0;
      const registerExpectedHitProbabilityByDirection = Object.fromEntries(
        ROTATION_ORDER.map((dir) => [dir, 0])
      );
      const focusTransition = routeLeg.transitions?.[index] ?? null;
      // v49fc Virtual Bots: during the first five registers the robots are still
      // virtual for modeling purposes, so robot weapons cannot affect them. Keep
      // all ordinary traffic/competition and factory-floor consequences active;
      // suppress only robot-laser damage and its corresponding shot-awareness.
      const virtualBotRobotWeaponsSuppressed = Boolean(
        options.virtualBots && absoluteAction <= REGISTER_COUNT
      );
      if (
        !virtualBotRobotWeaponsSuppressed &&
        !focusTransition?.rebooted &&
        !focusTransition?.crashed
      ) {
        for (const dir of ROTATION_ORDER) {
          const cappedExpectedHit = Math.min(shotByRegisterFacing[index][dir], 1);
          registerExpectedHits += cappedExpectedHit;
          registerExpectedHitProbabilityByDirection[dir] = clamp(
            cappedExpectedHit * confidence * legWeight,
            0,
            1
          );
        }
      }
      const weightedRawRanged = registerRanged * legWeight;
      const weightedEffectiveRanged = registerRanged * confidence * legWeight;
      const weightedEffectiveNearby = registerNearby * confidence * legWeight;
      const weightedEffectiveCompetition = registerCompetition * confidence * legWeight;
      const weightedEffectiveInteraction = registerRawInteraction * confidence * legWeight;
      const registerExpectedDamageUnits =
        registerExpectedHits * confidence * legWeight * robotLaserDamagePerHit;

      rawRangedScore += weightedRawRanged;
      effectiveRangedScore += weightedEffectiveRanged;
      expectedDamageUnits += registerExpectedDamageUnits;
      confidenceSum += confidence;
      confidenceRegisters += 1;
      records.push({
        absoluteAction,
        turn: Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1,
        register: getRegisterPosition(absoluteAction),
        legIndex,
        legRegister: index + 1,
        rawRangedScore: Number(weightedRawRanged.toFixed(4)),
        effectiveRangedScore: Number(weightedEffectiveRanged.toFixed(4)),
        effectiveNearbyScore: Number(weightedEffectiveNearby.toFixed(4)),
        effectiveCompetitionScore: Number(weightedEffectiveCompetition.toFixed(4)),
        effectiveInteractionScore: Number(weightedEffectiveInteraction.toFixed(4)),
        expectedDamageUnits: Number(registerExpectedDamageUnits.toFixed(4)),
        expectedHitProbabilityByDirection: Object.fromEntries(
          ROTATION_ORDER.map((dir) => [
            dir,
            Number(registerExpectedHitProbabilityByDirection[dir].toFixed(4))
          ])
        ),
        confidence: Number(confidence.toFixed(4)),
        legWeight,
        virtualBotRobotWeaponsSuppressed
      });

      carriedConfidence = getRENativeTrafficConfidenceForAbsoluteAction(
        confidenceMaps.confidenceAfterAbsoluteAction,
        absoluteAction,
        confidence
      );
    }
  });

  return {
    records,
    rawRangedScore: Number(rawRangedScore.toFixed(3)),
    effectiveRangedScore: Number(effectiveRangedScore.toFixed(3)),
    productionReplayRangedScore: Number((productionReplay?.ranged ?? 0).toFixed(3)),
    expectedDamageUnits: Number(expectedDamageUnits.toFixed(3)),
    confidenceMean: Number((confidenceRegisters ? confidenceSum / confidenceRegisters : 1).toFixed(4)),
    confidenceEnd: Number((carriedConfidence ?? 1).toFixed(4)),
    occupancyTotal: Number([...occupancyByIndex.values()].reduce((a, b) => a + b, 0).toFixed(3)),
    occupancyModel: trafficContext?.occupancyModel ?? "common-quality-weighted-route-mixture-field",
    virtualBotsFirstTurnRobotWeaponsSuppressed: Boolean(options.virtualBots)
  };
}

// DAMAGE_CONTROL_RE_OWNER_END

// v49dk observational RE-native routing-horizon candidate.
//
// Ownership rule: forecast uncertainty depends only on elapsed register horizon and
// adverse Register-Equivalent burden. It must not invent separate hazard,
// interaction or board-chaos prices when those mechanisms are already representable
// in the RE ledger. Damage pressure does not make speculative future positions more
// credible; it may restore only a capped amount of optional reroute-search effort
// when the robot is under enough adverse pressure to justify looking.
//
// This helper is OBSERVATIONAL in v49dk. Production traffic confidence still uses
// the legacy shared forecast curve until browser calibration validates the RE-native
// replacement. A precomputed ledger can be supplied so RE-turn replay pays no extra
// route-replay cost.
export function summarizeRENativeRouteUncertaintyEvidence(
  tileMap,
  route,
  options = {},
  trafficContext = null,
  precomputedLedger = null
) {
  const transitions = Array.isArray(route?.transitions) ? route.transitions : [];
  if (!tileMap || !route || !transitions.length) {
    return {
      active: false,
      reason: 'missing-route',
      confidenceByRegister: []
    };
  }

  const ledger = precomputedLedger ?? summarizeRegisterEquivalentLedger(
    tileMap,
    route,
    options,
    trafficContext
  );
  if (!ledger) {
    return {
      active: false,
      reason: 'missing-re-ledger',
      confidenceByRegister: []
    };
  }

  const turnEvidence = new Map();
  for (const turn of ledger.turns || []) {
    const turnNumber = Math.max(1, Math.floor(Number(turn?.turn) || 1));
    const cleanCardRE = Math.max(0, Number(turn?.cleanCardPlausibilityRE) || 0);
    const damageCardSupplyRE = Math.max(0, Number(turn?.damageCardSupplyRE) || 0);
    const clogRE = Math.max(0, Number(turn?.clogRE) || 0);
    const mentalRE = Math.max(0, Number(turn?.mentalRegisterEquivalents) || 0);
    const lostRegisterTempoRE = Math.max(0, Number(turn?.lostRegisterTempoRE) || 0);
    // Energy is intentionally not allowed to cancel adverse burden here. Energy
    // benefit remains an RE owner in route value, but positive resilience should
    // only improve uncertainty once a specific reliability mechanism is modeled.
    const adverseRE = cleanCardRE + damageCardSupplyRE + clogRE + mentalRE;
    const damagePressureRE = damageCardSupplyRE + clogRE;
    turnEvidence.set(turnNumber, {
      turn: turnNumber,
      programmedRegisterRE: Math.max(0, Number(turn?.programmedRegisterRE) || 0),
      lostRegisterTempoRE,
      cleanCardRE,
      damageCardSupplyRE,
      clogRE,
      mentalRE,
      adverseRE,
      damagePressureRE
    });
  }

  const absoluteStartAction = Math.max(0, Number(route?.absoluteStartAction) || 0);
  let elapsedAbsoluteActions = absoluteStartAction;
  let cumulativeAdverseRE = 0;
  let cumulativeDamagePressureRE = 0;
  const confidenceByRegister = [];
  const confidenceAfterRegisterByRegister = [];
  const absoluteActionByRegister = [];
  const effectiveHorizonByRegister = [];
  const baseEffortByRegister = [];
  const damageModeratedEffortByRegister = [];
  const appliedTurns = new Set();

  const applyTurnEvidence = (turnNumber) => {
    if (appliedTurns.has(turnNumber)) return;
    const evidence = turnEvidence.get(turnNumber);
    if (!evidence) return;
    cumulativeAdverseRE += evidence.adverseRE;
    cumulativeDamagePressureRE += evidence.damagePressureRE;
    appliedTurns.add(turnNumber);
  };

  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index] ?? null;
    const elapsedRegisters = getTrafficForecastElapsedRegisters(
      elapsedAbsoluteActions,
      options
    );
    const effectiveHorizonRE = elapsedRegisters + cumulativeAdverseRE;
    const confidence = getForecastTimeConfidence(effectiveHorizonRE);
    const baseEffortScale = getTrafficAlternateEffortScale(confidence, options);
    const damageModeratedEffortScale =
      restoreRENativeTrafficAlternateEffortForDamagePressure(
        baseEffortScale,
        cumulativeDamagePressureRE
      );

    const executedAbsoluteAction = getRegisterEquivalentLedgerAbsoluteAction(
      transition,
      elapsedAbsoluteActions + 1
    );
    absoluteActionByRegister.push(executedAbsoluteAction);
    confidenceByRegister.push(confidence);
    effectiveHorizonByRegister.push(effectiveHorizonRE);
    baseEffortByRegister.push(baseEffortScale);
    damageModeratedEffortByRegister.push(damageModeratedEffortScale);

    const turnNumber = Math.floor(
      (Math.max(1, executedAbsoluteAction) - 1) / REGISTER_COUNT
    ) + 1;
    const closesTurn = Boolean(transition?.rebooted) ||
      getRegisterPosition(executedAbsoluteAction) === REGISTER_COUNT;
    const isLast = index === transitions.length - 1;
    if (closesTurn || isLast) applyTurnEvidence(turnNumber);

    elapsedAbsoluteActions = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executedAbsoluteAction)
      : executedAbsoluteAction;
    const afterElapsedRegisters = getTrafficForecastElapsedRegisters(
      elapsedAbsoluteActions,
      options
    );
    confidenceAfterRegisterByRegister.push(
      getForecastTimeConfidence(afterElapsedRegisters + cumulativeAdverseRE)
    );
  }

  const endElapsedRegisters = getTrafficForecastElapsedRegisters(
    elapsedAbsoluteActions,
    options
  );
  const endEffectiveHorizonRE = endElapsedRegisters + cumulativeAdverseRE;
  const endConfidence = getForecastTimeConfidence(endEffectiveHorizonRE);
  const totalLostRegisterTempoRE = [...turnEvidence.values()].reduce(
    (sum, entry) => sum + entry.lostRegisterTempoRE,
    0
  );
  const totalAdverseRE = [...turnEvidence.values()].reduce(
    (sum, entry) => sum + entry.adverseRE,
    0
  );
  const totalDamagePressureRE = [...turnEvidence.values()].reduce(
    (sum, entry) => sum + entry.damagePressureRE,
    0
  );
  const programmedRegisters = Math.max(
    0,
    Number(ledger.programmedRegisterRE) || transitions.length
  );
  // v49dk separates evidence from elapsed-time calibration. Adverse RE remains
  // the exclusive burden input, but one RE is NOT assumed to equal one extra
  // register of actual play. Main combines downstream control RE once, computes
  // adverseRE / nominalRegisters, and exposes a coefficient-free saturating
  // response shape r/(1+r). The eventual elapsed-time multiplier is 1+k*response,
  // with k intentionally uncalibrated here.
  const playTimeAdverseRE = totalAdverseRE + totalLostRegisterTempoRE;

  return {
    active: true,
    observationalOnly: true,
    model: 'register-horizon-plus-adverse-re-v49dk',
    programmedRegisters: Number(programmedRegisters.toFixed(4)),
    totalAdverseRE: Number(totalAdverseRE.toFixed(4)),
    totalLostRegisterTempoRE: Number(totalLostRegisterTempoRE.toFixed(4)),
    playTimeAdverseRE: Number(playTimeAdverseRE.toFixed(4)),
    totalDamagePressureRE: Number(totalDamagePressureRE.toFixed(4)),
    damagePressureSearchRestorationStrength: Number(
      getTrafficAlternateHardPressureStrength(totalDamagePressureRE).toFixed(4)
    ),
    damagePressureSearchEffortCeiling: RE_NATIVE_DAMAGE_EFFORT_CEILING,
    averageConfidence: Number(average(confidenceByRegister).toFixed(4)),
    minimumConfidence: Number(
      Math.min(...confidenceByRegister, endConfidence).toFixed(4)
    ),
    endConfidence: Number(endConfidence.toFixed(4)),
    endElapsedRegisters: Number(endElapsedRegisters.toFixed(4)),
    endEffectiveHorizonRE: Number(endEffectiveHorizonRE.toFixed(4)),
    averageBaseEffortScale: Number(average(baseEffortByRegister).toFixed(4)),
    averageDamageModeratedEffortScale: Number(
      average(damageModeratedEffortByRegister).toFixed(4)
    ),
    minimumDamageModeratedEffortScale: Number(
      Math.min(...damageModeratedEffortByRegister).toFixed(4)
    ),
    confidenceByRegister: confidenceByRegister.map((value) => Number(value.toFixed(4))),
    confidenceAfterRegisterByRegister: confidenceAfterRegisterByRegister.map(
      (value) => Number(value.toFixed(4))
    ),
    absoluteActionByRegister: absoluteActionByRegister.map(
      (value) => Math.max(1, Math.floor(Number(value) || 1))
    ),
    effectiveHorizonByRegister: effectiveHorizonByRegister.map(
      (value) => Number(value.toFixed(4))
    ),
    turnEvidence: [...turnEvidence.values()].map((entry) => ({
      ...entry,
      programmedRegisterRE: Number(entry.programmedRegisterRE.toFixed(4)),
      lostRegisterTempoRE: Number(entry.lostRegisterTempoRE.toFixed(4)),
      cleanCardRE: Number(entry.cleanCardRE.toFixed(4)),
      damageCardSupplyRE: Number(entry.damageCardSupplyRE.toFixed(4)),
      clogRE: Number(entry.clogRE.toFixed(4)),
      mentalRE: Number(entry.mentalRE.toFixed(4)),
      adverseRE: Number(entry.adverseRE.toFixed(4)),
      damagePressureRE: Number(entry.damagePressureRE.toFixed(4))
    }))
  };
}


// v49dm production traffic-confidence owner.
//
// Same-epoch multiplayer traffic is deliberately NOT part of this input. The
// profile is built from the route's intrinsic completed RE chronology only:
// clean-card burden, damage-card supply, clog/control and intrinsic mental RE,
// plus elapsed register horizon. Traffic then consumes this confidence; it cannot
// feed back into the confidence that priced the same traffic field.
export function getRENativeProductionTrafficForecastProfile(
  tileMap,
  route,
  options = {}
) {
  if (!tileMap || !route) return null;
  const graceRegisters = getTrafficForecastGraceRegisters(options);
  const cached = RE_NATIVE_TRAFFIC_CONFIDENCE_PROFILE_CACHE.get(route);
  if (cached && cached.graceRegisters === graceRegisters) {
    return cached.profile;
  }

  const intrinsicLedger = getTrafficIntrinsicRELedger(tileMap, route, options);
  if (!intrinsicLedger) return null;
  const profile = summarizeRENativeRouteUncertaintyEvidence(
    tileMap,
    route,
    options,
    null,
    intrinsicLedger
  );
  if (!profile?.active) return null;

  const productionProfile = {
    ...profile,
    productionTrafficOwner: true,
    trafficEvidenceMode: "intrinsic-re-only-no-same-epoch-traffic",
    model: "register-horizon-plus-intrinsic-adverse-re-v49dm"
  };
  RE_NATIVE_TRAFFIC_CONFIDENCE_PROFILE_CACHE.set(route, {
    graceRegisters,
    profile: productionProfile
  });
  return productionProfile;
}

export function getRENativeProductionTrafficConfidenceMaps(
  tileMap,
  route,
  options = {}
) {
  const profile = getRENativeProductionTrafficForecastProfile(
    tileMap,
    route,
    options
  );
  if (!profile) {
    return {
      profile: null,
      confidenceByAbsoluteAction: new Map(),
      confidenceAfterAbsoluteAction: new Map()
    };
  }
  const confidenceByAbsoluteAction = new Map();
  const confidenceAfterAbsoluteAction = new Map();
  const actions = profile.absoluteActionByRegister || [];
  const before = profile.confidenceByRegister || [];
  const after = profile.confidenceAfterRegisterByRegister || [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = Math.max(1, Math.floor(Number(actions[index]) || 1));
    confidenceByAbsoluteAction.set(
      action,
      clamp(Number(before[index]) || 0, TRAFFIC_FORECAST_CONFIDENCE_FLOOR, 1)
    );
    confidenceAfterAbsoluteAction.set(
      action,
      clamp(
        Number(after[index]) || Number(before[index]) || 0,
        TRAFFIC_FORECAST_CONFIDENCE_FLOOR,
        1
      )
    );
  }
  return {
    profile,
    confidenceByAbsoluteAction,
    confidenceAfterAbsoluteAction
  };
}

export function getExpectedTrafficBreakdownForLeg(
  tileMap,
  route,
  selectedRouteEntries,
  options = {}
) {
  const timelineA = getRegisterTimeline(route);
  const suppliedConfidenceMap =
    options.trafficRENativeConfidenceByAbsoluteAction instanceof Map
      ? options.trafficRENativeConfidenceByAbsoluteAction
      : null;
  const suppliedAfterConfidenceMap =
    options.trafficRENativeConfidenceAfterAbsoluteAction instanceof Map
      ? options.trafficRENativeConfidenceAfterAbsoluteAction
      : null;
  const ownConfidenceMaps = suppliedConfidenceMap
    ? null
    : getRENativeProductionTrafficConfidenceMaps(tileMap, route, options);
  const confidenceByAbsoluteAction =
    suppliedConfidenceMap ?? ownConfidenceMaps?.confidenceByAbsoluteAction ?? new Map();
  const confidenceAfterAbsoluteAction =
    suppliedAfterConfidenceMap ??
    ownConfidenceMaps?.confidenceAfterAbsoluteAction ??
    new Map();
  const confidenceProfile =
    options.trafficRENativeConfidenceProfile ??
    ownConfidenceMaps?.profile ??
    null;

  const firstAbsoluteAction = timelineA.length
    ? (
      timelineA[0]?.absoluteRegister ??
      getTransitionAbsoluteAction(
        route?.transitions?.[0],
        Math.max(0, Number(route?.absoluteStartAction) || 0) + 1
      )
    )
    : Math.max(1, Number(route?.absoluteStartAction) || 1);
  const profileStartConfidence = getRENativeTrafficConfidenceForAbsoluteAction(
    confidenceByAbsoluteAction,
    firstAbsoluteAction,
    confidenceProfile?.averageConfidence ?? 1
  );

  if (!timelineA.length || !selectedRouteEntries?.length) {
    return {
      ranged: 0,
      nearby: 0,
      competition: 0,
      total: 0,
      rawRanged: 0,
      rawNearby: 0,
      rawCompetition: 0,
      rawTotal: 0,
      nearbyEventMass: 0,
      nearbyControlLoad: 0,
      nearbyControlRegisterEquivalentsCandidate: 0,
      nearbyControlScoreCandidate: 0,
      nearbyTurnEpisodeEventMassCandidate: 0,
      nearbyTurnEpisodeControlLoadCandidate: 0,
      nearbyTurnEpisodeControlRegisterEquivalentsCandidate: 0,
      nearbyTurnEpisodeControlScoreCandidate: 0,
      nearbyTurnEpisodeByTurn: [],
      confidenceStart: Number(profileStartConfidence.toFixed(3)),
      confidenceMean: Number(profileStartConfidence.toFixed(3)),
      confidenceEnd: Number(
        (confidenceProfile?.endConfidence ?? profileStartConfidence).toFixed(3)
      ),
      byRegister: []
    };
  }

  const preparedOthers = selectedRouteEntries
    .map(getTrafficRouteEntry)
    .filter((entry) => entry.route && entry.occupancyWeight > 0);

  if (!preparedOthers.length) {
    return {
      ranged: 0,
      nearby: 0,
      competition: 0,
      total: 0,
      rawRanged: 0,
      rawNearby: 0,
      rawCompetition: 0,
      rawTotal: 0,
      nearbyEventMass: 0,
      nearbyControlLoad: 0,
      nearbyControlRegisterEquivalentsCandidate: 0,
      nearbyControlScoreCandidate: 0,
      nearbyTurnEpisodeEventMassCandidate: 0,
      nearbyTurnEpisodeControlLoadCandidate: 0,
      nearbyTurnEpisodeControlRegisterEquivalentsCandidate: 0,
      nearbyTurnEpisodeControlScoreCandidate: 0,
      nearbyTurnEpisodeByTurn: [],
      confidenceStart: Number(profileStartConfidence.toFixed(3)),
      confidenceMean: Number(profileStartConfidence.toFixed(3)),
      confidenceEnd: Number(
        (confidenceProfile?.endConfidence ?? profileStartConfidence).toFixed(3)
      ),
      byRegister: []
    };
  }

  const damageUnit = getStandardRobotLaserCost();
  const rangedByRegisterFacing = timelineA.map(() => (
    Object.fromEntries(ROTATION_ORDER.map((dir) => [dir, 0]))
  ));
  const nearbyByRegister = new Array(timelineA.length).fill(0);
  const nearbyEventMassByRegister = new Array(timelineA.length).fill(0);
  const nearbyControlLoadByRegister = new Array(timelineA.length).fill(0);
  const competitionByRegister = new Array(timelineA.length).fill(0);

  for (const other of preparedOthers) {
    const profile = getTrafficPairProfile(tileMap, route, other.route, options);
    const occupancy = other.occupancyWeight;

    for (let index = 0; index < timelineA.length; index += 1) {
      for (const dir of ROTATION_ORDER) {
        const directional = profile.rangedByFacing?.[dir]?.[index] ?? 0;
        rangedByRegisterFacing[index][dir] += directional * occupancy;
      }
      nearbyByRegister[index] += (profile.nearby[index] ?? 0) * occupancy;
      nearbyEventMassByRegister[index] += (
        (profile.nearbyEventMass?.[index] ?? 0) * occupancy
      );
      nearbyControlLoadByRegister[index] += (
        (profile.nearbyControlLoad?.[index] ?? 0) * occupancy
      );
      competitionByRegister[index] += (profile.competition[index] ?? 0) * occupancy;
    }
  }

  let ranged = 0;
  let nearby = 0;
  let competition = 0;
  let rawRanged = 0;
  let rawNearby = 0;
  let rawCompetition = 0;
  let nearbyEventMass = 0;
  let nearbyControlLoad = 0;
  const nearbyControlLoadByTurn = new Map();
  let confidenceSum = 0;
  let lastConfidence = profileStartConfidence;
  let lastAbsoluteAction = firstAbsoluteAction;
  const byRegister = [];

  for (let index = 0; index < timelineA.length; index += 1) {
    const executedAbsoluteAction = timelineA[index]?.absoluteRegister ??
      getTransitionAbsoluteAction(
        route.transitions?.[index],
        Math.max(0, Number(route?.absoluteStartAction) || 0) + index + 1
      );
    const confidence = getRENativeTrafficConfidenceForAbsoluteAction(
      confidenceByAbsoluteAction,
      executedAbsoluteAction,
      lastConfidence
    );
    lastConfidence = confidence;
    lastAbsoluteAction = executedAbsoluteAction;

    let registerRanged = 0;
    // Robot lasers do not shoot through other robots. Traffic intentionally does
    // not carry literal per-square robot occupancy/occlusion into route search,
    // so aggregate predicted fire is capped at one normal laser equivalent per
    // incoming cardinal direction in each register.
    for (const dir of ROTATION_ORDER) {
      registerRanged += Math.min(rangedByRegisterFacing[index][dir], damageUnit);
    }
    const registerNearby = Math.min(nearbyByRegister[index], damageUnit * 3.25);
    const registerCompetition = Math.min(competitionByRegister[index], damageUnit);
    const registerRaw = registerRanged + registerNearby + registerCompetition;
    const registerEffectiveRanged = registerRanged * confidence;
    const registerEffectiveNearby = registerNearby * confidence;
    const registerEffectiveCompetition = registerCompetition * confidence;

    const registerNearbyEventMass = Math.min(
      2,
      Math.max(0, nearbyEventMassByRegister[index] || 0)
    ) * confidence;
    const registerNearbyControlLoad = Math.min(
      3,
      Math.max(0, nearbyControlLoadByRegister[index] || 0)
    ) * confidence;

    const registerEffectiveTotal =
      registerEffectiveRanged + registerEffectiveNearby + registerEffectiveCompetition;

    rawRanged += registerRanged;
    rawNearby += registerNearby;
    rawCompetition += registerCompetition;
    ranged += registerEffectiveRanged;
    nearby += registerEffectiveNearby;
    competition += registerEffectiveCompetition;
    confidenceSum += confidence;

    nearbyEventMass += registerNearbyEventMass;
    nearbyControlLoad += registerNearbyControlLoad;
    const controlTurn =
      Math.floor(Math.max(0, executedAbsoluteAction - 1) / REGISTER_COUNT) + 1;
    nearbyControlLoadByTurn.set(
      controlTurn,
      (nearbyControlLoadByTurn.get(controlTurn) || 0) + registerNearbyControlLoad
    );

    byRegister.push({
      index,
      absoluteAction: executedAbsoluteAction,
      confidence: Number(confidence.toFixed(4)),
      ranged: Number(registerEffectiveRanged.toFixed(4)),
      nearby: Number(registerEffectiveNearby.toFixed(4)),
      nearbyEventMass: Number(registerNearbyEventMass.toFixed(4)),
      nearbyControlLoad: Number(registerNearbyControlLoad.toFixed(4)),
      competition: Number(registerEffectiveCompetition.toFixed(4)),
      total: Number(registerEffectiveTotal.toFixed(4)),
      rawTotal: Number(registerRaw.toFixed(4))
    });
  }

  const confidenceEnd = getRENativeTrafficConfidenceForAbsoluteAction(
    confidenceAfterAbsoluteAction,
    lastAbsoluteAction,
    confidenceProfile?.endConfidence ?? lastConfidence
  );
  const rawTotal = rawRanged + rawNearby + rawCompetition;
  const nearbyControlRegisterEquivalentsCandidate = [...nearbyControlLoadByTurn.values()]
    .reduce(
      (sum, turnLoad) => sum + getDamageEconomyClogRegisterEquivalents(turnLoad),
      0
    );
  const nearbyTurnEpisodeCandidate = summarizeNearbyTrafficTurnEpisodes(byRegister);

  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2)),
    rawRanged: Number(rawRanged.toFixed(2)),
    rawNearby: Number(rawNearby.toFixed(2)),
    rawCompetition: Number(rawCompetition.toFixed(2)),
    rawTotal: Number(rawTotal.toFixed(2)),
    nearbyEventMass: Number(nearbyEventMass.toFixed(3)),
    nearbyControlLoad: Number(nearbyControlLoad.toFixed(3)),
    nearbyControlRegisterEquivalentsCandidate: Number(
      nearbyControlRegisterEquivalentsCandidate.toFixed(3)
    ),
    nearbyControlScoreCandidate: Number(
      (nearbyControlRegisterEquivalentsCandidate * REGISTER_TEMPO_COST).toFixed(2)
    ),
    nearbyTurnEpisodeEventMassCandidate:
      nearbyTurnEpisodeCandidate.episodeEventMass,
    nearbyTurnEpisodeControlLoadCandidate:
      nearbyTurnEpisodeCandidate.episodeControlLoad,
    nearbyTurnEpisodeControlRegisterEquivalentsCandidate:
      nearbyTurnEpisodeCandidate.episodeControlRE,
    nearbyTurnEpisodeControlScoreCandidate:
      nearbyTurnEpisodeCandidate.episodeControlScore,
    nearbyTurnEpisodeByTurn: nearbyTurnEpisodeCandidate.byTurn,
    confidenceStart: Number(profileStartConfidence.toFixed(3)),
    confidenceMean: Number((confidenceSum / timelineA.length).toFixed(3)),
    confidenceEnd: Number(confidenceEnd.toFixed(3)),
    byRegister
  };
}

export function getExpectedTrafficBreakdownsByLeg(
  tileMap,
  route,
  selectedRouteEntries,
  options = {}
) {
  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length) return [];

  const confidenceMaps = getRENativeProductionTrafficConfidenceMaps(
    tileMap,
    route,
    options
  );
  return routeLegs.map((routeLeg, legIndex) => {
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

    return getExpectedTrafficBreakdownForLeg(
      tileMap,
      routeLeg,
      otherLegEntries,
      {
        ...options,
        trafficRENativeConfidenceByAbsoluteAction:
          confidenceMaps.confidenceByAbsoluteAction,
        trafficRENativeConfidenceAfterAbsoluteAction:
          confidenceMaps.confidenceAfterAbsoluteAction,
        trafficRENativeConfidenceProfile: confidenceMaps.profile
      }
    );
  });
}

export function getExpectedTrafficBreakdown(
  tileMap,
  route,
  selectedRouteEntries,
  _flags,
  options = {}
) {
  if (!route || !selectedRouteEntries?.length) {
    return {
      ranged: 0, nearby: 0, competition: 0, total: 0, opening: 0, later: 0,
      rawRanged: 0, rawNearby: 0, rawCompetition: 0, rawTotal: 0,
      nearbyEventMass: 0, nearbyControlLoad: 0,
      nearbyControlRegisterEquivalentsCandidate: 0,
      nearbyControlScoreCandidate: 0,
      nearbyTurnEpisodeEventMassCandidate: 0,
      nearbyTurnEpisodeControlLoadCandidate: 0,
      nearbyTurnEpisodeControlRegisterEquivalentsCandidate: 0,
      nearbyTurnEpisodeControlScoreCandidate: 0,
      nearbyTurnEpisodeByTurn: [],
      simultaneousRebootPileupEventMass: 0,
      simultaneousRebootPileupMaximumTurnProbability: 0,
      simultaneousRebootPileupByTurn: [],
      confidenceStart: 1, confidenceMean: 1, confidenceEnd: 1
    };
  }

  if (options.singleLegTraffic) {
    const single = getExpectedTrafficBreakdownForLeg(
      tileMap,
      route,
      selectedRouteEntries,
      options
    );
    const confidenceMaps = getRENativeProductionTrafficConfidenceMaps(
      tileMap,
      route,
      options
    );
    const rebootPileup = summarizeSimultaneousRebootPileupForecast(
      route,
      selectedRouteEntries,
      confidenceMaps.confidenceByAbsoluteAction
    );
    return {
      ...single,
      simultaneousRebootPileupEventMass: rebootPileup.eventMass,
      simultaneousRebootPileupMaximumTurnProbability:
        rebootPileup.maximumTurnProbability,
      simultaneousRebootPileupByTurn: rebootPileup.byTurn,
      opening: single.total,
      later: 0
    };
  }

  const routeLegs = getTrafficLegs(route);
  if (!routeLegs.length) {
    return {
      ranged: 0, nearby: 0, competition: 0, total: 0, opening: 0, later: 0,
      rawRanged: 0, rawNearby: 0, rawCompetition: 0, rawTotal: 0,
      nearbyEventMass: 0, nearbyControlLoad: 0,
      nearbyControlRegisterEquivalentsCandidate: 0,
      nearbyControlScoreCandidate: 0,
      nearbyTurnEpisodeEventMassCandidate: 0,
      nearbyTurnEpisodeControlLoadCandidate: 0,
      nearbyTurnEpisodeControlRegisterEquivalentsCandidate: 0,
      nearbyTurnEpisodeControlScoreCandidate: 0,
      nearbyTurnEpisodeByTurn: [],
      simultaneousRebootPileupEventMass: 0,
      simultaneousRebootPileupMaximumTurnProbability: 0,
      simultaneousRebootPileupByTurn: [],
      confidenceStart: 1, confidenceMean: 1, confidenceEnd: 1
    };
  }

  const legBreakdowns = getExpectedTrafficBreakdownsByLeg(
    tileMap,
    route,
    selectedRouteEntries,
    options
  );
  let ranged = 0;
  let nearby = 0;
  let competition = 0;
  let rawRanged = 0;
  let rawNearby = 0;
  let rawCompetition = 0;
  let opening = 0;
  let later = 0;
  let confidenceWeighted = 0;
  let confidenceRegisters = 0;
  let nearbyEventMass = 0;
  let nearbyControlLoad = 0;
  const nearbyControlLoadByTurn = new Map();
  const nearbyTurnEpisodeRegisters = [];

  legBreakdowns.forEach((legBreakdown, legIndex) => {
    const legWeight = legIndex === 0
      ? FULL_COURSE_OPENING_LEG_TRAFFIC_WEIGHT
      : FULL_COURSE_LATER_LEG_TRAFFIC_WEIGHT;
    const weightedTotal = legBreakdown.total * legWeight;
    ranged += legBreakdown.ranged * legWeight;
    nearby += legBreakdown.nearby * legWeight;
    competition += legBreakdown.competition * legWeight;
    rawRanged += (legBreakdown.rawRanged || 0) * legWeight;
    rawNearby += (legBreakdown.rawNearby || 0) * legWeight;
    rawCompetition += (legBreakdown.rawCompetition || 0) * legWeight;
    nearbyEventMass += (legBreakdown.nearbyEventMass || 0) * legWeight;
    nearbyControlLoad += (legBreakdown.nearbyControlLoad || 0) * legWeight;
    for (const record of legBreakdown.byRegister || []) {
      const absoluteAction = Math.max(1, Number(record.absoluteAction) || 1);
      const turn = Math.floor((absoluteAction - 1) / REGISTER_COUNT) + 1;
      const weightedEventMass =
        Math.max(0, Number(record.nearbyEventMass) || 0) * legWeight;
      const weightedControlLoad =
        Math.max(0, Number(record.nearbyControlLoad) || 0) * legWeight;

      nearbyControlLoadByTurn.set(
        turn,
        (nearbyControlLoadByTurn.get(turn) || 0) + weightedControlLoad
      );
      nearbyTurnEpisodeRegisters.push({
        absoluteAction,
        nearbyEventMass: weightedEventMass,
        nearbyControlLoad: weightedControlLoad
      });
    }
    if (legIndex === 0) opening += weightedTotal;
    else later += weightedTotal;
    const registers = Math.max(1, routeLegs[legIndex]?.transitions?.length || 0);
    confidenceWeighted += (legBreakdown.confidenceMean ?? 1) * registers;
    confidenceRegisters += registers;
  });

  const nearbyControlRegisterEquivalentsCandidate = [...nearbyControlLoadByTurn.values()]
    .reduce(
      (sum, turnLoad) => sum + getDamageEconomyClogRegisterEquivalents(turnLoad),
      0
    );
  const nearbyTurnEpisodeCandidate = summarizeNearbyTrafficTurnEpisodes(
    nearbyTurnEpisodeRegisters
  );
  const confidenceMaps = getRENativeProductionTrafficConfidenceMaps(
    tileMap,
    route,
    options
  );
  const rebootPileup = summarizeSimultaneousRebootPileupForecast(
    route,
    selectedRouteEntries,
    confidenceMaps.confidenceByAbsoluteAction
  );

  return {
    ranged: Number(ranged.toFixed(2)),
    nearby: Number(nearby.toFixed(2)),
    competition: Number(competition.toFixed(2)),
    total: Number((ranged + nearby + competition).toFixed(2)),
    rawRanged: Number(rawRanged.toFixed(2)),
    rawNearby: Number(rawNearby.toFixed(2)),
    rawCompetition: Number(rawCompetition.toFixed(2)),
    rawTotal: Number((rawRanged + rawNearby + rawCompetition).toFixed(2)),
    nearbyEventMass: Number(nearbyEventMass.toFixed(3)),
    nearbyControlLoad: Number(nearbyControlLoad.toFixed(3)),
    nearbyControlRegisterEquivalentsCandidate: Number(
      nearbyControlRegisterEquivalentsCandidate.toFixed(3)
    ),
    nearbyControlScoreCandidate: Number(
      (nearbyControlRegisterEquivalentsCandidate * REGISTER_TEMPO_COST).toFixed(2)
    ),
    nearbyTurnEpisodeEventMassCandidate:
      nearbyTurnEpisodeCandidate.episodeEventMass,
    nearbyTurnEpisodeControlLoadCandidate:
      nearbyTurnEpisodeCandidate.episodeControlLoad,
    nearbyTurnEpisodeControlRegisterEquivalentsCandidate:
      nearbyTurnEpisodeCandidate.episodeControlRE,
    nearbyTurnEpisodeControlScoreCandidate:
      nearbyTurnEpisodeCandidate.episodeControlScore,
    nearbyTurnEpisodeByTurn: nearbyTurnEpisodeCandidate.byTurn,
    simultaneousRebootPileupEventMass: rebootPileup.eventMass,
    simultaneousRebootPileupMaximumTurnProbability:
      rebootPileup.maximumTurnProbability,
    simultaneousRebootPileupByTurn: rebootPileup.byTurn,
    opening: Number(opening.toFixed(2)),
    later: Number(later.toFixed(2)),
    confidenceStart: legBreakdowns[0]?.confidenceStart ?? 1,
    confidenceMean: Number((
      confidenceRegisters > 0 ? confidenceWeighted / confidenceRegisters : 1
    ).toFixed(3)),
    confidenceEnd: legBreakdowns.at(-1)?.confidenceEnd ?? 1,
    byLeg: legBreakdowns.map((entry) => ({ ...entry }))
  };
}
