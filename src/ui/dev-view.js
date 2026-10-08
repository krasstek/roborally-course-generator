// Robo Rally Course Randomizer - Dev View: route inspection, trace selection, generation seed controls, Course Evaluation report element
import {
  scoreFlagArea,
  summarizeCheapSearchRegisterEquivalentShadow,
  summarizeDamageEconomyFoundationForRoute,
  summarizeRegisterEquivalentLedger
} from "../../analyze.js";
import {
  addDevTiming,
  getCachedRouteReplay,
  getDamageFoundationScenarioOptions,
  getDamageFoundationTrafficContext,
  getScenarioDevReplayCache
} from "../generation/dev-replay.js";
import { isDevViewEnabled } from "../generation/environment.js";
import {
  formatGenerationModeLabel,
  getGenerationModeProfile,
  normalizeGenerationMode
} from "../generation/generation-modes.js";
import {
  createDevGenerationSeed,
  formatDevGenerationSeed,
  parseDevGenerationSeed
} from "../generation/random.js";
import { formatPayToWinEnergyCost } from "../generation/start-pricing.js";
import { getRouteAnalysisVariantOptions } from "../generation/variant-availability.js";
import { updateBoardAuditVisibility } from "./board-audit.js";
import { formatLegLabel } from "./setup-summary.js";
import { currentScenario } from "./state.js";

export let routeInspectionState = {
  kind: null,
  key: null
};
export let traceSelectionState = {
  startIndices: new Set()
};

// Other modules change the trace selection through this setter.
export function setTraceSelectionState(value) {
  traceSelectionState = value;
}

export let devFrozenGenerationSeed = null;

export function pageIsDevViewEnabled() {
  // Browser Dev View is presentation/diagnostic state, not generation semantics.
  // Calibration imports Main directly in Node, where no DOM exists; headless runs
  // must therefore behave exactly like ordinary generation with Dev View disabled.
  if (typeof document === "undefined") return false;
  return document.getElementById("dev-view")?.checked ?? true;
}

export function getRouteInspectionPrunedStatus(outlierInfo) {
  const reasons = outlierInfo?.reasons ?? {};
  if (!outlierInfo) return null;
  if (reasons.normalBalancePruned && !reasons.balanceDispersionPruned) return "outlier";
  if (reasons.normalBalancePruned) return "balance-pruned";
  if (reasons.subsidizedStarts) return "subsidy-pruned";
  if (reasons.payToWinPruned || reasons.payToWinUnavailable) return "price-pruned";
  return "pruned";
}

export function getRouteInspectionEntryForStart(scenario, selectedLegIndices, startIndex) {
  const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
  const fullRoute = startAnalysis?.fullCourseRoute;
  if (!fullRoute) return null;
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const singleLegIndex = normalizedLegs.length === 1 ? normalizedLegs[0] : null;
  // When more than one leg is selected, inspect one coherent route: the selected
  // full-course route. The map can still trace any subset of legs independently.
  const route = singleLegIndex === null ? fullRoute : fullRoute.legRoutes?.[singleLegIndex];
  if (!route) return null;
  const outlierInfo = (scenario.sequence.firstLeg.summary.outliers || []).find((item) => item.index === startIndex) ?? null;
  const competitive = scenario.metrics?.competitiveBlockImpact ?? scenario.sequence.firstLeg.summary.competitiveStartBalance ?? null;
  const competitiveBlock = (competitive?.blockSequence ?? []).find((entry) => entry.index === startIndex) ?? null;
  const competitiveSelected = (competitive?.selectedIndices ?? []).includes(startIndex);
  const prunedStatus = competitiveBlock
    ? `simulated block p${competitiveBlock.order}`
    : competitiveSelected
      ? "simulated selected start"
      : getRouteInspectionPrunedStatus(outlierInfo);
  const statusText = prunedStatus ? ` (${prunedStatus})` : "";
  return {
    id: `start:${startIndex}`,
    label: singleLegIndex === null
      ? `Start ${startIndex + 1}${statusText} — selected full-course route`
      : `Start ${startIndex + 1}${statusText} — ${formatLegLabel(scenario.sequence.legs[singleLegIndex])}`,
    route,
    startAnalysis,
    outlierInfo,
    prunedStatus,
    singleLegIndex,
    normalizedLegs
  };
}

export function formatTraceState(state) {
  if (!state) return "";
  return `(${state.x},${state.y})${state.facing ? ` ${state.facing}` : ""}`;
}

export function formatBoardTraceEvent(event) {
  if (!event) return null;
  if (event.type === "conveyor") {
    const facing = event.facingBefore && event.facingAfter && event.facingBefore !== event.facingAfter
      ? `; facing ${event.facingBefore}→${event.facingAfter}`
      : "";
    const phase = event.phase === "blue"
      ? `blue phase${Number.isFinite(Number(event.phaseStep)) ? ` ${event.phaseStep}` : ""}`
      : event.phase === "green"
        ? "green phase"
        : event.phase === "current"
          ? "current phase"
          : event.speed === 2
            ? "blue conveyor"
            : "conveyor";
    return `${phase}: ${event.dir} ${formatTraceState(event.from)}→${formatTraceState(event.to)}${facing}`;
  }
  if (event.type === "oil") return `oil slide ${event.dir} ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "pusher") return `pusher ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "gear") return `gear at (${event.at.x},${event.at.y}); facing ${event.facingBefore}→${event.facingAfter}`;
  return null;
}

export const ROUTE_TRACE_REGISTER_COUNT = 5;
export const ROUTE_TRACE_TIMED_FEATURE_TYPES = new Set(["push", "crusher", "trapdoor", "flamethrower"]);

export function getRouteTraceTimedFeatures(tile) {
  return (tile?.features || []).filter((feature) => (
    ROUTE_TRACE_TIMED_FEATURE_TYPES.has(feature.type) &&
    Array.isArray(feature.timing) &&
    feature.timing.length > 0
  ));
}

export function isRouteTraceTimedFeatureActive(feature, registerInTurn) {
  return Array.isArray(feature?.timing) && feature.timing.includes(registerInTurn);
}

export function formatRouteTraceTiming(feature) {
  const timing = [...new Set(feature?.timing || [])].sort((a, b) => a - b);
  return `[${timing.map((register) => `R${register}`).join(",")}]`;
}

export function formatRouteTraceTimedFeatureName(feature) {
  if (feature?.type === "push") return `pusher${feature.dir ? ` ${feature.dir}` : ""}`;
  if (feature?.type === "flamethrower") return "flamer";
  return feature?.type ?? "timed feature";
}

export function sameTracePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

export function getActualTimedTraversalPoints(transition) {
  const points = Array.isArray(transition?.traversed) ? transition.traversed : [];
  return points.filter((point, index) => {
    if (!point) return false;
    // A paired portal moves onto its portal square and then jumps. Elements on
    // that entry/transit square are skipped; the jump destination still counts.
    const nextPoint = points[index + 1];
    return !(!point.jump && nextPoint?.jump);
  });
}

export function getTimedFeatureTraceParts(tileMap, transition, registerInTurn) {
  if (!tileMap || !transition) return [];
  const parts = [];
  const pushEvents = (transition.boardEvents || []).filter((event) => event.type === "pusher");
  const actualTraversal = getActualTimedTraversalPoints(transition);
  const lastTraversal = actualTraversal.length ? actualTraversal[actualTraversal.length - 1] : null;
  const terminalFailure = Boolean(transition.rebooted || transition.crashed);

  // Trapdoors are open for the entire active register, so register-start
  // occupancy matters. Pushers and crushers are deliberately not reported
  // here: they only matter at their own later board-element phases. Flamers
  // likewise score on entry/pass-through and end-of-register occupancy.
  const startTile = tileMap.get(`${transition.from?.x},${transition.from?.y}`);
  for (const feature of getRouteTraceTimedFeatures(startTile)) {
    if (feature.type !== "trapdoor") continue;
    const name = formatRouteTraceTimedFeatureName(feature);
    const timing = formatRouteTraceTiming(feature);
    const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
    if (active && terminalFailure) {
      parts.push(`${name} ${timing}: ACTIVE → open at register start; ${transition.rebooted ? "dropped/rebooted" : "dropped"}`);
    } else {
      parts.push(`${name} ${timing}: ${active ? "ACTIVE" : "inactive"} at register start`);
    }
  }

  // Only trapdoors and flamers care about traversal itself. A robot may cross
  // a pusher or crusher tile earlier in the register without ever occupying it
  // when that feature's phase resolves, so such crossings are intentionally
  // silent here.
  actualTraversal.forEach((point) => {
    const tile = tileMap.get(`${point.x},${point.y}`);
    for (const feature of getRouteTraceTimedFeatures(tile)) {
      if (feature.type !== "flamethrower" && feature.type !== "trapdoor") continue;
      const name = formatRouteTraceTimedFeatureName(feature);
      const timing = formatRouteTraceTiming(feature);
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      const at = ` at (${point.x},${point.y})`;
      const isTerminalFailurePoint = sameTracePoint(point, lastTraversal) && terminalFailure;

      if (feature.type === "flamethrower") {
        parts.push(active
          ? `${name} ${timing}: ACTIVE → entry/pass-through +1 damage${at}`
          : `${name} ${timing}: inactive → crossed safely${at}`);
      } else if (!active) {
        parts.push(`${name} ${timing}: inactive → crossed safely${at}`);
      } else if (isTerminalFailurePoint && sameTracePoint(point, transition.from)) {
        // The register-start message already explains this drop.
        continue;
      } else if (isTerminalFailurePoint) {
        parts.push(`${name} ${timing}: ACTIVE → open; ${transition.rebooted ? "dropped/rebooted" : "dropped"}${at}`);
      } else {
        parts.push(`${name} ${timing}: ACTIVE → OPEN TILE CROSSED (unexpected)${at}`);
      }
    }
  });

  // Pusher diagnostics are phase-aware. If a timed pusher actually moves the
  // robot, the board event gives the exact pusher-phase position. If no push
  // occurs on a surviving transition, the final coordinates are also the
  // pusher-phase coordinates because gears only rotate and crushers do not
  // move a surviving robot.
  if (pushEvents.length) {
    for (const event of pushEvents) {
      const tile = tileMap.get(`${event.from?.x},${event.from?.y}`);
      const activeTimedPushes = getRouteTraceTimedFeatures(tile).filter((feature) => (
        feature.type === "push" && isRouteTraceTimedFeatureActive(feature, registerInTurn)
      ));
      for (const feature of activeTimedPushes) {
        parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ACTIVE → pushed ${formatTraceState(event.from)}→${formatTraceState(event.to)}`);
      }
    }
  } else if (!terminalFailure && transition.to) {
    const pusherTile = tileMap.get(`${transition.to.x},${transition.to.y}`);
    for (const feature of getRouteTraceTimedFeatures(pusherTile)) {
      if (feature.type !== "push") continue;
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ${active ? "ACTIVE → no displacement" : "inactive"} at pusher phase`);
    }
  }

  // Crushers resolve after gears. Report them only for the square occupied at
  // the crusher phase, never merely because that square was crossed earlier.
  // On a surviving transition that is transition.to. For a terminal crusher
  // result, resolveCrusherPhase records its square as the terminal traversal.
  let crusherPoint = null;
  if (!terminalFailure && transition.to) {
    crusherPoint = transition.to;
  } else if (lastTraversal) {
    const terminalTile = tileMap.get(`${lastTraversal.x},${lastTraversal.y}`);
    const hasActiveCrusher = getRouteTraceTimedFeatures(terminalTile).some((feature) => (
      feature.type === "crusher" && isRouteTraceTimedFeatureActive(feature, registerInTurn)
    ));
    if (hasActiveCrusher) crusherPoint = lastTraversal;
  }

  if (crusherPoint) {
    const crusherTile = tileMap.get(`${crusherPoint.x},${crusherPoint.y}`);
    for (const feature of getRouteTraceTimedFeatures(crusherTile)) {
      if (feature.type !== "crusher") continue;
      const name = formatRouteTraceTimedFeatureName(feature);
      const timing = formatRouteTraceTiming(feature);
      const active = isRouteTraceTimedFeatureActive(feature, registerInTurn);
      const at = ` at (${crusherPoint.x},${crusherPoint.y})`;
      if (!active) {
        parts.push(`${name} ${timing}: inactive at crusher phase${at}`);
      } else if (terminalFailure) {
        parts.push(`${name} ${timing}: ACTIVE → ${transition.rebooted ? "crushed/rebooted" : "crushed"}${at}`);
      } else {
        parts.push(`${name} ${timing}: ACTIVE → SURVIVED CRUSHER (unexpected)${at}`);
      }
    }
  }

  if (!terminalFailure && transition.to) {
    const endTile = tileMap.get(`${transition.to.x},${transition.to.y}`);
    for (const feature of getRouteTraceTimedFeatures(endTile)) {
      if (feature.type !== "flamethrower") continue;
      if (!isRouteTraceTimedFeatureActive(feature, registerInTurn)) continue;
      parts.push(`${formatRouteTraceTimedFeatureName(feature)} ${formatRouteTraceTiming(feature)}: ACTIVE → end-of-register +1 damage at (${transition.to.x},${transition.to.y})`);
    }
  }

  // Do not de-duplicate: repeated passes through an active flamer are separate
  // damage events and should remain visible in the trace.
  return parts;
}

export function formatChronologicalRouteTrace(route, tileMap = null) {
  if (!route?.transitions?.length) return ["Trace: none"];

  const startAction = route.absoluteStartAction ?? 0;
  const checkpointHits = Array.isArray(route.checkpointHits)
    ? route.checkpointHits
    : route.checkpointHit ? [route.checkpointHit] : [];
  const hitsByAction = new Map();
  checkpointHits.forEach((hit) => {
    const absoluteAction = hit.action ?? route.absoluteActions;
    if (!Number.isFinite(absoluteAction)) return;
    const items = hitsByAction.get(absoluteAction) ?? [];
    items.push(hit);
    hitsByAction.set(absoluteAction, items);
  });

  const lines = [];
  let previousAbsoluteRegister = startAction;
  route.transitions.forEach((transition, index) => {
    const fallbackAbsoluteRegister = startAction + index + 1;
    const absoluteRegister = Number.isFinite(Number(transition?.absoluteAction))
      ? Number(transition.absoluteAction)
      : fallbackAbsoluteRegister;
    const turnNumber = Math.floor((absoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
    const registerInTurn = ((absoluteRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;

    const expectedNextRegister = previousAbsoluteRegister + 1;
    if (absoluteRegister > expectedNextRegister) {
      const skipped = absoluteRegister - expectedNextRegister;
      const priorTurn = Math.floor((previousAbsoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
      const firstSkippedRegister = ((expectedNextRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;
      const lastSkippedRegister = ((absoluteRegister - 2) % ROUTE_TRACE_REGISTER_COUNT) + 1;
      const priorTransition = route.transitions[index - 1] ?? null;
      lines.push(
        priorTransition?.rebooted
          ? `──────── REBOOT ended turn ${priorTurn}; skipped ${skipped} register${skipped === 1 ? "" : "s"} (R${firstSkippedRegister}${lastSkippedRegister !== firstSkippedRegister ? `–R${lastSkippedRegister}` : ""}); start turn ${turnNumber} ────────`
          : `──────── elapsed-register gap ${previousAbsoluteRegister}→${absoluteRegister}; start turn ${turnNumber} ────────`
      );
    }
    const programmedActionLabel = transition?.programCard === "AGAIN"
      ? `${transition.action} (AGAIN)`
      : transition.action;
    const pieces = [
      `${absoluteRegister}. [T${turnNumber} R${registerInTurn}] ${programmedActionLabel}`,
      `${formatTraceState(transition.from)}→${formatTraceState(transition.to)}`
    ];
    const timedParts = getTimedFeatureTraceParts(tileMap, transition, registerInTurn);
    const hasTimedPusherMove = timedParts.some((part) => part.includes("pusher") && part.includes("ACTIVE → pushed"));
    const boardParts = (transition.boardEvents || [])
      .filter((event) => !(event.type === "pusher" && hasTimedPusherMove))
      .map(formatBoardTraceEvent)
      .filter(Boolean);
    if (boardParts.length) pieces.push(boardParts.join("; "));
    else if ((transition.conveyorSteps || []).length) {
      pieces.push(transition.conveyorSteps
        .map((step) => formatBoardTraceEvent({ type: "conveyor", ...step }))
        .join("; "));
    } else if (transition.gearTurned) {
      pieces.push("gear turn");
    }
    if (timedParts.length) pieces.push(timedParts.join("; "));

    const hits = hitsByAction.get(absoluteRegister) ?? [];
    if (hits.length) pieces.push(hits.map((hit) => `FLAG ${hit.checkpointId ?? hit.checkpointIndex + 1}`).join(", "));
    if (transition?.rebooted) pieces.push("REBOOT → turn ends");
    lines.push(pieces.join(" → "));

    if (registerInTurn === ROUTE_TRACE_REGISTER_COUNT && index < route.transitions.length - 1) {
      lines.push(`──────── end turn ${turnNumber} / start turn ${turnNumber + 1} ────────`);
    }
    previousAbsoluteRegister = absoluteRegister;
  });

  return lines;
}

export function formatRegisterEquivalentLedgerLines(scenario, route, startIndex = null, devOptions = {}) {
  if (!route) return [];
  const traceTileMap = scenario?.goalTileMap ?? null;
  if (!traceTileMap || typeof summarizeRegisterEquivalentLedger !== "function") return [];
  const replayCache = devOptions.replayCache ?? getScenarioDevReplayCache(scenario);
  const damageOptions = getDamageFoundationScenarioOptions(scenario);
  const trafficContext = getDamageFoundationTrafficContext(scenario, startIndex);
  const ledgerStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const reLedger = getCachedRouteReplay(
    replayCache?.ledgerByRoute,
    route,
    () => summarizeRegisterEquivalentLedger(
      traceTileMap,
      route,
      damageOptions,
      trafficContext
    )
  );
  addDevTiming(devOptions.timing, "ledgerMs", ledgerStartedAt);
  if (!reLedger) return [];

  const lines = [
    `RE ledger v3: registers ${reLedger.programmedRegisterRE} + lost-register tempo ${reLedger.lostRegisterTempoRE}; card ${reLedger.cleanCardPlausibilityRE} + damage-card supply ${reLedger.damageCardSupplyRE}; clog ${reLedger.clogRE}; Energy ${reLedger.energyRE}; mental ${reLedger.mentalRegisterEquivalents}; known subtotal ${reLedger.knownMechanismSubtotalRE} -> +mental ${reLedger.observationalSubtotalWithMentalRE} RE; Homing Missile activations ${reLedger.homingMissileActivationCount ?? 0}, neutral one-damage reference ${reLedger.homingMissileOneDamageReferenceRE ?? 0}RE, strategic credit ${reLedger.homingMissileStrategicCreditRE ?? 0}RE applied separately to route value (not intrinsic difficulty), cheap-search guidance ${reLedger.homingMissileCheapSearchGuidanceScore ?? 0} score only. Mental curve is PROVISIONAL; intrinsic factual planning-event RE is POST-BUILD ROUTE SCORING in v49ce (not pathfinder state) (rounded turn events: <=7 => 0 RE, 11 => 0.5, 15 => 2, 19 => 4.5). Traffic-awareness mental is downstream: robot-laser hit probability plus one collapsed fractional non-laser control-awareness event per turn plus simultaneous-reboot awareness; mechanical damage/control consequence is priced separately. Avoided static constraints remain uncaptured.`
  ].filter(Boolean);
  (reLedger.turns || []).forEach((turn) => {
    const eventTypes = (turn.planningEvents || []).map((event) => (
      Math.abs((Number(event.weight) || 0) - 1) > 0.0005
        ? `${event.type}×${Number(event.weight).toFixed(2)}`
        : event.type
    ));
    lines.push(
      `  RE T${turn.turn}: reg ${turn.programmedRegisterRE}${turn.lostRegisterTempoRE ? ` + lost ${turn.lostRegisterTempoRE}` : ""}; card ${turn.cleanCardPlausibilityRE} + damage-supply ${turn.damageCardSupplyRE}; clog ${turn.clogRE}; Energy ${turn.energyRE}; mental ${turn.mentalRegisterEquivalents}; known ${turn.knownMechanismSubtotalRE} -> obs ${turn.observationalSubtotalWithMentalRE}; planning events ${turn.planningEventRawCount} -> rounded ${turn.planningEventRoundedCount}${eventTypes.length ? ` [${eventTypes.join(", ")}]` : ""}`
    );
  });

  if (typeof summarizeCheapSearchRegisterEquivalentShadow === "function") {
    const cheapStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
    const cheapShadow = getCachedRouteReplay(
      replayCache?.cheapShadowByRoute,
      route,
      () => summarizeCheapSearchRegisterEquivalentShadow(
        traceTileMap,
        route,
        damageOptions,
        trafficContext,
        reLedger
      )
    );
    addDevTiming(devOptions.timing, "cheapShadowMs", cheapStartedAt);
    if (cheapShadow) {
      const signed = (value) => {
        const numeric = Number(value) || 0;
        return `${numeric >= 0 ? "+" : ""}${numeric}`;
      };
      lines.push(
        `  Routing-card comparison v49dc: routing-active union core ${cheapShadow.routedUnionCoreRE} RE vs exact-comparable ${cheapShadow.exactComparableCoreRE} (${signed(cheapShadow.comparableCoreDeltaRE)}); union card ${cheapShadow.unionFrontierCardRE} RE vs exact ${cheapShadow.exactCleanCardRE} RE (${signed(cheapShadow.unionFrontierCardDeltaRE)}); Energy ${cheapShadow.energyRE} routing-active; intrinsic mental ${cheapShadow.cheapIntrinsicMentalRE} completed-route, traffic-awareness mental +${cheapShadow.trafficMentalIncrementRE} downstream -> full ${cheapShadow.fullMentalRE}; damage-supply ${cheapShadow.deferredDamageSupplyRE} + clog ${cheapShadow.deferredClogRE} deferred to authoritative replay; full observational route ${cheapShadow.fullObservationalRE} RE.`,
        `    Routing-card union by turn: ${(cheapShadow.unionFrontierCardTurnComparison || []).map((turn) => `T${turn.turn} ${turn.unionFrontierCardRE}/${turn.exactCardRE} (${signed(turn.deltaRE)})`).join(", ") || "none"}; max |turn delta| ${cheapShadow.maxAbsUnionFrontierCardTurnDeltaRE ?? 0} RE; retained end states ${cheapShadow.unionFrontierCardRetainedStates ?? 0}${cheapShadow.unionFrontierCardFeasible === false ? "; infeasible" : ""}.`
      );
    }
  }
  if (Number.isFinite(Number(route.searchIntrinsicMentalRegisterEquivalents))) {
    lines.push(
      `  Completed-route intrinsic mental v49ce: ${Number(route.searchIntrinsicMentalRegisterEquivalents || 0).toFixed(4)} RE / ${Number(route.searchIntrinsicMentalScore || 0).toFixed(2)} score POST-BUILD RERANK ACTIVE; NOT pathfinder state; intrinsic event weight ${Number(route.searchIntrinsicMentalEventWeight || 0).toFixed(4)}, turn carry ${Number(route.searchIntrinsicMentalEventCountStart || 0).toFixed(4)} -> ${Number(route.searchIntrinsicMentalEventCountEnd || 0).toFixed(4)}. Energy remains routing-active through the existing flattened negative-RE economy.`
    );
  }
  return lines;
}

export function formatRouteDetail(scenario, entry) {
  const route = entry?.route;
  if (!route) {
    return [];
  }

  // Use the same effective tile map as route analysis. In particular, normal
  // flags remove underlying board features unless Hazardous Flags is active,
  // so diagnostics must not resurrect the raw printed feature under a flag.
  const traceTileMap = scenario?.goalTileMap ?? null;
  const lines = [
    `${entry.label}: ${route.actions} register${route.actions === 1 ? "" : "s"}, distance ${route.distance}, forced ${route.forcedDistance}, route score ${route.score}`,
    ...formatChronologicalRouteTrace(route, traceTileMap)
  ];

  // v49aq: one shared formatter owns observational RE diagnostics for both the
  // clicked route and Copy All, preventing the two Dev surfaces from drifting.
  lines.push(...formatRegisterEquivalentLedgerLines(
    scenario,
    route,
    entry?.startAnalysis?.index
  ));

  // v49ac-traffic-mixture: selected-route raw damage remains visible beside the
  // chronological trace, while raw damage-economy RE is the route-selection
  // input. The trace still does not pretend to know literal future hands/register cards.
  if (traceTileMap && typeof summarizeDamageEconomyFoundationForRoute === "function") {
    const replayCache = getScenarioDevReplayCache(scenario);
    const damageEconomy = getCachedRouteReplay(
      replayCache?.damageFoundationByRoute,
      route,
      () => summarizeDamageEconomyFoundationForRoute(
        traceTileMap,
        route,
        getDamageFoundationScenarioOptions(scenario),
        getDamageFoundationTrafficContext(scenario, entry?.startAnalysis?.index)
      )
    );
    if (damageEconomy) {
      lines.push(
        `Damage economy (${damageEconomy.method}, routing-active raw ledger): input ${damageEconomy.totalDamageUnits} = deterministic ${damageEconomy.deterministicDamageUnits} + robot-laser expected ${damageEconomy.robotLaserExpectedDamageUnits}; SPAM final total/held/circulating ${damageEconomy.finalSpamTotal}/${damageEconomy.finalSpamHeld}/${damageEconomy.finalSpamCirculating}; active/pending Haywire expected clog ${damageEconomy.finalActiveHaywireExpectedClogs}/${damageEconomy.finalPendingHaywireExpectedClogs}; AUTHORITATIVE raw damage-economy RE supply/clog/total ${damageEconomy.totalSpamSupplyRegisterEquivalents}/${damageEconomy.totalClogRegisterEquivalents}/${damageEconomy.totalDamageEconomyRegisterEquivalents} [supply base ${damageEconomy.totalRawSpamSupplyRegisterEquivalents ?? damageEconomy.totalSpamSupplyRegisterEquivalents}, Permanent-Shutdown +${damageEconomy.totalPermanentShutdownPressureRegisterEquivalents ?? 0}, max ×${damageEconomy.maxPermanentShutdownSupplyMultiplier ?? 1}]; max turn ${damageEconomy.maxTurnDamageEconomyRegisterEquivalents}; Shutdown tolerance diagnostic ${damageEconomy.shutdownEquivalentDamageScoreRegisterEquivalents} RE against ${damageEconomy.shutdownReferenceRegisterEquivalents} RE reference (NOT route cost)`
      );
      if (route.damageRoutingModel) {
        lines.push(
          `Damage routing: intrinsic raw damage economy ${route.intrinsicDamageEconomyRegisterEquivalents ?? 0} RE -> ${route.intrinsicDamageReplacementScore ?? 0} score; intrinsic adjustment ${route.intrinsicDamageRoutingAdjustmentScore ?? 0}. Shutdown reference ${route.intrinsicDamageShutdownReferenceRegisterEquivalents ?? damageEconomy.shutdownReferenceRegisterEquivalents ?? 5} RE is tolerance context only. Robot-laser damage is added through the later traffic comparison as marginal raw damage RE.`
        );
      }
      if (
        damageEconomy.shutdownThreatLevel === "high" ||
        damageEconomy.shutdownThreatLevel === "elevated"
      ) {
        const episodeText = damageEconomy.shutdownEquivalentEpisodeCount > 0
          ? `${damageEconomy.shutdownEquivalentEpisodeCount} counterfactual tolerance-threshold crossing(s) = ${damageEconomy.shutdownEquivalentRegisterEquivalents} RE${damageEconomy.shutdownEquivalentEpisodeTurns?.length ? ` after T${damageEconomy.shutdownEquivalentEpisodeTurns.join("/T")}` : ""}`
          : "no full Shutdown-tolerance threshold crossing";
        lines.push(
          `Shutdown tolerance: ${damageEconomy.shutdownThreatLevel.toUpperCase()} — ${episodeText}; residual ${damageEconomy.shutdownResidualRegisterEquivalents} RE; peak reference segment ${damageEconomy.shutdownThreatPeakSegmentRegisterEquivalents}/${damageEconomy.shutdownReferenceRegisterEquivalents} RE. Counterfactual benchmark only: no Shutdown is programmed, no 5-RE cap is applied, and actual damage/clog RE remains authoritative.`
        );
      }
      (damageEconomy.turns ?? [])
        .filter((turn) => (
          turn.spamTotalAtProgramming > 0 ||
          turn.expectedHaywireClogs > 0 ||
          turn.pendingSpamAddedThisTurn > 0 ||
          turn.reliefInitiations > 0
        ))
        .forEach((turn) => {
          lines.push(
            `  Damage T${turn.turn} programming: SPAM total/held/circ ${turn.spamTotalAtProgramming}/${turn.spamHeldAtProgramming}/${turn.spamCirculatingAtProgramming} -> effective held/circ ${turn.effectiveHeldSpam}/${turn.effectiveCirculatingSpam}; hand ${turn.baseHandSize}, fresh draw ${turn.expectedFreshDrawSlots}; expected SPAM drawn/in-hand ${turn.expectedSpamDrawn}/${turn.expectedSpamInHand}; program P clean/damaged ${turn.cleanProgramProbability}/${turn.damagedProgramProbability}; H clog ${turn.expectedHaywireClogs}; SPAM relief forced/elective ${turn.forcedSpamReliefInitiations}/${turn.electiveSpamReliefInitiations}, clog-bearing P0..P5 ${turn.spamPlayCountDistribution.join("/")} -> SPAM clog ${turn.spamPlayClogLoad}; Randomizer ${turn.randomizerStarts ?? 0} start(s) / +${turn.randomizerClogLoad ?? 0} clog / SPAM use forced/elective ${turn.randomizerForcedSpamOverlap ?? 0}/${turn.randomizerReliefInitiations ?? 0}; combined ${turn.expectedTotalControlClogLoad}; RE supply/clog/total ${turn.spamSupplyRegisterEquivalents}/${turn.clogRegisterEquivalents}/${turn.damageEconomyRegisterEquivalents} [supply base ${turn.rawSpamSupplyRegisterEquivalents ?? turn.spamSupplyRegisterEquivalents}, Permanent-Shutdown +${turn.permanentShutdownPressureRegisterEquivalents ?? 0} @burden${turn.permanentShutdownSpamBurden ?? 0} ×${turn.permanentShutdownSupplyMultiplier ?? 1}]; Shutdown-tolerance segment ${turn.shutdownThreatSegmentRegisterEquivalents}${turn.shutdownEquivalentEpisodeAfterTurn ? " -> threshold crossing" : ""}`
          );
          if (
            turn.reliefInitiations > 0 ||
            turn.pendingSpamAddedThisTurn > 0 ||
            turn.pendingHaywireExpectedForNextTurn > 0
          ) {
            lines.push(
              `    Relief/damage: tactical opportunity ${turn.reliefOpportunity}, SPAM initiation/removal ${turn.reliefInitiations}/${turn.spamRemoved}, Critical-SPAM ->pending ${turn.criticalSpamReturnedToPending ?? 0}; damage ${turn.totalDamageUnits} = deterministic ${turn.deterministicDamageUnits} + robot-laser expected ${turn.robotLaserExpectedDamageUnits}; reboot ${turn.rebootRegister ? `R${turn.rebootRegister}, SPAM dump ${turn.rebootSpamRemoved}/${turn.rebootSpamDisposalCapacity}, active-H clear ${turn.rebootHaywireCleared}` : "none"}; repair ${turn.repairStationReliefCount ? `${turn.repairStationReliefCount}x, SPAM -${turn.repairStationSpamRemoved}, H-exp -${turn.repairStationHaywireExpectedRemoved}` : "none"}; held end ${turn.spamHeldAtTurnEnd}; pending next SPAM/Haywire ${turn.pendingSpamAtTurnEnd}/${turn.pendingHaywireExpectedForNextTurn}; H register risks ${turn.pendingHaywireRegisterRisks.join("/")}`
            );
          }
        });
    }
  }
  const literalProgramCards = (route.transitions || [])
    .map((transition) => {
      const cardId = transition?.programCard;
      if (typeof cardId !== "string") return null;
      return cardId === "AGAIN"
        ? `${transition.action} (AGAIN)`
        : cardId;
    })
    .filter((cardId) => typeof cardId === "string");
  if (literalProgramCards.length === (route.transitions || []).length && literalProgramCards.length) {
    lines.push(`Program cards: ${literalProgramCards.join(" → ")}`);
  }

  const cardScarcityPenalty = Math.max(0, Number(route.cardAvailabilityPenalty) || 0);
  const programPlausibilityPenalty = Math.max(0, Number(route.programPlausibilityPenalty) || 0);
  if (cardScarcityPenalty > 0 || programPlausibilityPenalty > 0) {
    lines.push(
      `Program availability pressure: scarcity ${cardScarcityPenalty.toFixed(2)}, combination ${programPlausibilityPenalty.toFixed(2)}`
    );
  }

  if (
    Number.isFinite(Number(route.routeEnergyShadowReserveStart)) ||
    Number.isFinite(Number(route.routeEnergyShadowReserveEnd)) ||
    Math.abs(Number(route.routeEnergyEconomyRewardScore) || 0) > 0.005
  ) {
    const startReserve = Number.isFinite(Number(route.routeEnergyShadowReserveStart))
      ? Number(route.routeEnergyShadowReserveStart).toFixed(2)
      : "n/a";
    const endReserve = Number.isFinite(Number(route.routeEnergyShadowReserveEnd))
      ? Number(route.routeEnergyShadowReserveEnd).toFixed(2)
      : "n/a";
    lines.push(
      `Energy economy: reserve ${startReserve} → ${endReserve}; route utility ${Number(route.routeEnergyEconomyRewardScore || 0).toFixed(2)} score`
    );
  }

  if (route.hazard || route.rebootCount || route.conveyorComplexity) {
    lines.push(`Pressure: hazard ${route.hazard}, conveyor diagnostic ${route.conveyorComplexity}, reboots ${route.rebootCount}`);
  }

  if (route.movingTarget?.space && route.hitTarget) {
    lines.push(`Moving target: flag ${route.movingTarget.checkpointId} space ${route.movingTarget.space} at (${route.hitTarget.x}, ${route.hitTarget.y})`);
  }

  if (entry.startAnalysis) {
    const prunedStatus = entry.prunedStatus ?? getRouteInspectionPrunedStatus(entry.outlierInfo);
    const startStatus = entry.outlierInfo ? `${prunedStatus ?? "pruned"}; unusable` : "usable";
    const trafficPenalty = entry.startAnalysis.trafficPenalty ?? 0;
    const adjustedLabel = entry.outlierInfo
      ? (prunedStatus === "outlier" ? "Outlier pass estimate" : "Pruned-start adjusted score")
      : "Final adjusted score";
    lines.push(`${adjustedLabel}: ${entry.startAnalysis.adjustedScore} (${startStatus}; raw ${route.score} + traffic ${trafficPenalty})`);
    const startResidual = scenario.sequence.firstLeg.summary?.normalStartBalance?.startResiduals?.entries
      ?.find((item) => item.index === entry.startAnalysis.index) ?? null;
    if (startResidual && !entry.outlierInfo) {
      lines.push(
        `Post-balance residual: ${startResidual.scoreResidual >= 0 ? "+" : ""}${startResidual.scoreResidual} score (${startResidual.scoreZ >= 0 ? "+" : ""}${startResidual.scoreZ}σ), actions ${startResidual.actionResidual >= 0 ? "+" : ""}${startResidual.actionResidual} vs retained mean`
      );
    }
    if (entry.startAnalysis.energyCost !== null && entry.startAnalysis.energyCost !== undefined) {
      const subsidyMode = Boolean(scenario.subsidizedStarts);
      const pricingLabel = subsidyMode ? "Subsidized Starts" : "Pay to Win";
      const formattedCost = formatPayToWinEnergyCost(entry.startAnalysis, {
        subsidizedStarts: subsidyMode
      });
      const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
      const describeAdjustment = (value) => subsidyMode
        ? `grants +${value} starting Energy`
        : `costs ${value} starting Energy`;
      if (payToWinPricing?.hasLatePriceDifference && formattedCost?.includes("/")) {
        const firstLatePlayer = payToWinPricing.lateSelectorStart
          ?? scenario.playerCount;
        const lastLatePlayer = payToWinPricing.lateSelectorEnd ?? scenario.playerCount;
        const singleLatePlayer = firstLatePlayer === lastLatePlayer;
        const latePlayerText = singleLatePlayer
          ? `player ${firstLatePlayer}`
          : `players ${firstLatePlayer}–${lastLatePlayer}`;
        if (entry.startAnalysis.earlyUnavailable && entry.startAnalysis.lateUnavailable) {
          lines.push(`${pricingLabel}: unavailable to both earlier selectors and ${latePlayerText}`);
        } else if (entry.startAnalysis.earlyUnavailable) {
          lines.push(`${pricingLabel}: unavailable to earlier selectors; ${describeAdjustment(entry.startAnalysis.lateEnergyCost)} for ${latePlayerText}`);
        } else if (entry.startAnalysis.lateUnavailable) {
          lines.push(`${pricingLabel}: ${describeAdjustment(entry.startAnalysis.energyCost)} for earlier selectors; unavailable to ${latePlayerText}`);
        } else {
          lines.push(`${pricingLabel}: ${subsidyMode ? "grants" : "costs"} ${formattedCost} starting Energy; ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value`);
        }
      } else {
        lines.push(`${pricingLabel}: ${subsidyMode ? "grants" : "costs"} ${formattedCost} starting Energy`);
      }
    }
    if (entry.startAnalysis.courseEstimate) {
      lines.push(`Full-course estimate: ${entry.startAnalysis.courseEstimate.totalActions} registers, score ${entry.startAnalysis.courseEstimate.totalScore}, adjustment ${entry.startAnalysis.courseScoreAdjustment ?? 0}`);
      lines.push(`Full-course route pressure: candidate ${(entry.startAnalysis.courseEstimate.selectedRouteIndex ?? 0) + 1}/${entry.startAnalysis.courseEstimate.candidateCount ?? 1}, penalty ${entry.startAnalysis.courseEstimate.fullCourseTrafficPenalty ?? 0}`);
      lines.push("Map route: selected start's expected path through all checkpoints");
    }
    lines.push(`Traffic: ranged ${entry.startAnalysis.trafficRanged ?? entry.startAnalysis.rearThreat ?? 0}, nearby ${entry.startAnalysis.trafficNearby ?? entry.startAnalysis.lateralThreat ?? 0}, route competition ${entry.startAnalysis.trafficCompetition ?? entry.startAnalysis.overlapPenalty ?? 0}`);
    if (entry.outlierInfo) {
      lines.push(`Not comparable with final usable-start adjusted scores; this was measured in the pruning pass where it dropped.`);
      lines.push(`Outlier delta: score ${entry.outlierInfo.delta}, actions ${entry.outlierInfo.actionDelta}`);
    }
  }

  return lines;
}

export function getCheckpointInspectionLines(scenario, checkpointIndex) {
  const checkpoint = scenario.checkpoints[checkpointIndex];
  if (!checkpoint) {
    return [];
  }

  const incomingLeg = scenario.sequence.legs[checkpointIndex];
  const areaScore = scoreFlagArea(scenario.goalTileMap, checkpoint, {
    playerCount: scenario.playerCount,
    ...getRouteAnalysisVariantOptions(scenario.preferences)
  });
  const lines = [
    `Checkpoint ${checkpointIndex + 1}: (${checkpoint.x}, ${checkpoint.y})`,
    `Incoming leg: ${incomingLeg ? formatLegLabel(incomingLeg) : "n/a"}`,
    `Area risk: ${areaScore}`
  ];

  if (incomingLeg?.analysis?.summary) {
    const summary = incomingLeg.analysis.summary;
    if (summary.difficultyScore !== undefined) {
      lines.push(`Route profile: difficulty ${summary.difficultyScore}, length ${summary.lengthScore}, traffic ${summary.averageTrafficPenalty}`);
      const incomingStarts = scenario.sequence.firstLeg.starts
        .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.selectedRoute)
        .map((startAnalysis) => ({
          startIndex: startAnalysis.index,
          actions: startAnalysis.selectedRoute.actions,
          score: startAnalysis.selectedRoute.score
        }));
      if (incomingStarts.length) {
        const fastest = [...incomingStarts].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingStarts].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingStarts].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingStarts.length}, fastest Start ${fastest.startIndex + 1} (${fastest.actions} registers), slowest Start ${slowest.startIndex + 1} (${slowest.actions}), hardest Start ${hardest.startIndex + 1} (score ${hardest.score})`);
      }
    } else {
      lines.push(summary.expectedRobotPaths
        ? `Route profile: ${summary.expectedRouteCount} expected robot paths, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`
        : `Route profile: ${summary.distinctRouteCount} distinct routes, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`);
      const incomingRoutes = incomingLeg.analysis.distinctRoutes || [];
      if (summary.expectedRobotPaths && incomingRoutes.length) {
        const fastest = [...incomingRoutes].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingRoutes].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingRoutes].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingRoutes.length}, fastest Start ${(fastest.startIndex ?? 0) + 1} (${fastest.actions} registers), slowest Start ${(slowest.startIndex ?? 0) + 1} (${slowest.actions}), hardest Start ${(hardest.startIndex ?? 0) + 1} (score ${hardest.score})`);
      }
    }
  }

  const timeline = scenario.movingTargetTimelines?.[checkpointIndex];
  if (timeline?.positions?.length > 1) {
    lines.push(`Moving target: re-entry (${timeline.reentry.x}, ${timeline.reentry.y}), ${timeline.displayPositions?.length ?? timeline.positions.length} path spaces`);
  }

  return lines;
}


export function removeDevStartResidualTable() {
  document.getElementById("dev-start-residuals")?.remove();
}

export function updateDevStartResidualTable(scenario) {
  if (typeof document === "undefined") return;

  const residuals = scenario?.sequence?.firstLeg?.summary?.normalStartBalance?.startResiduals ?? null;
  const notableEntries = residuals?.active
    ? (residuals.entries ?? [])
      .filter((entry) => (residuals.notableIndices ?? []).includes(entry.index))
      .sort((left, right) => (
        Math.abs(right.scoreZ ?? 0) - Math.abs(left.scoreZ ?? 0) ||
        left.index - right.index
      ))
    : [];

  if (!isDevViewEnabled() || !notableEntries.length) {
    removeDevStartResidualTable();
    return;
  }

  let details = document.getElementById("dev-start-residuals");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    const anchor = document.getElementById("inspection-detail")
      ?? document.getElementById("report-panel")
      ?? document.getElementById("run-diagnostics");
    const parent = anchor?.parentElement;
    if (!parent) return;

    details = document.createElement("details");
    details.id = "dev-start-residuals";
    details.style.margin = "0.6rem 0";
    details.style.padding = "0.45rem 0";
    if (anchor) {
      parent.insertBefore(details, anchor.nextSibling);
    } else {
      parent.append(details);
    }
  }

  details.replaceChildren();
  details.open = wasOpen;

  const summary = document.createElement("summary");
  summary.textContent = `Retained starting-space residuals (${notableEntries.length} notable)`;
  details.append(summary);

  const note = document.createElement("div");
  note.style.fontSize = "0.9em";
  note.style.margin = "0.35rem 0";
  note.textContent = "Post-final-balance diagnostics only. These rows do not affect pruning or route choice.";
  details.append(note);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.9em";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Start", "Residual", "Actions", "Main visible difference"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.style.textAlign = "left";
    th.style.padding = "0.2rem 0.35rem";
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  notableEntries.forEach((entry) => {
    const row = document.createElement("tr");
    const direction = (entry.scoreResidual ?? 0) < 0 ? "cleaner" : "tougher";
    const cells = [
      `#${entry.index + 1} (${entry.x}, ${entry.y})`,
      `${direction}; ${entry.scoreResidual >= 0 ? "+" : ""}${entry.scoreResidual} (${entry.scoreZ >= 0 ? "+" : ""}${entry.scoreZ}σ)`,
      `${entry.actions ?? "n/a"} (${entry.actionResidual >= 0 ? "+" : ""}${entry.actionResidual})`,
      entry.reasonLabel ?? "overall route burden"
    ];
    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.style.padding = "0.2rem 0.35rem";
      td.style.verticalAlign = "top";
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(tbody);
  details.append(wrapTableForScroll(table));
}

// Dev View tables have many columns. On a phone they would be clipped, so each
// sits in a container that scrolls sideways when the table is wider than the
// screen; on wider screens nothing changes.
export function wrapTableForScroll(table) {
  const wrapper = document.createElement("div");
  wrapper.className = "dev-table-scroll";
  wrapper.append(table);
  return wrapper;
}

export function appendInspectionDetails(parent, title, { open = false } = {}) {
  const details = document.createElement("details");
  details.open = open;
  details.style.margin = "0.5rem 0";
  const summary = document.createElement("summary");
  summary.textContent = title;
  summary.style.cursor = "pointer";
  summary.style.fontWeight = "600";
  details.append(summary);
  parent.append(details);
  return details;
}

export function appendInspectionTable(parent, headers, rows, options = {}) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = options.fontSize ?? "0.9em";
  table.style.margin = "0.35rem 0";
  if (headers?.length) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      th.style.textAlign = "left";
      th.style.padding = "0.22rem 0.35rem";
      th.style.borderBottom = "1px solid currentColor";
      tr.append(th);
    });
    thead.append(tr);
    table.append(thead);
  }
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value ?? "";
      td.style.padding = "0.22rem 0.35rem";
      td.style.verticalAlign = "top";
      td.style.borderBottom = "1px solid rgba(127,127,127,0.25)";
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  parent.append(wrapTableForScroll(table));
  return table;
}

export function getInspectionRouteLedger(scenario, route, startIndex) {
  const traceTileMap = scenario?.goalTileMap ?? null;
  if (!traceTileMap || !route || typeof summarizeRegisterEquivalentLedger !== "function") return null;
  const replayCache = getScenarioDevReplayCache(scenario);
  return getCachedRouteReplay(
    replayCache?.ledgerByRoute,
    route,
    () => summarizeRegisterEquivalentLedger(
      traceTileMap,
      route,
      getDamageFoundationScenarioOptions(scenario),
      getDamageFoundationTrafficContext(scenario, startIndex)
    )
  );
}

export function buildInspectionTraceRows(route, tileMap) {
  if (!route?.transitions?.length) return [];
  const startAction = route.absoluteStartAction ?? 0;
  const checkpointHits = Array.isArray(route.checkpointHits)
    ? route.checkpointHits
    : route.checkpointHit ? [route.checkpointHit] : [];
  const hitsByAction = new Map();
  checkpointHits.forEach((hit) => {
    const absoluteAction = hit.action ?? route.absoluteActions;
    if (!Number.isFinite(absoluteAction)) return;
    const list = hitsByAction.get(absoluteAction) ?? [];
    list.push(hit);
    hitsByAction.set(absoluteAction, list);
  });

  const rows = [];
  route.transitions.forEach((transition, index) => {
    const absoluteRegister = Number.isFinite(Number(transition?.absoluteAction))
      ? Number(transition.absoluteAction)
      : startAction + index + 1;
    const turn = Math.floor((absoluteRegister - 1) / ROUTE_TRACE_REGISTER_COUNT) + 1;
    const register = ((absoluteRegister - 1) % ROUTE_TRACE_REGISTER_COUNT) + 1;
    const program = transition?.programCard === "AGAIN"
      ? `${transition.action} (AGAIN)`
      : transition?.action || transition?.programCard || "?";
    const move = `${formatTraceState(transition.from)} → ${formatTraceState(transition.to)}`;
    const timedParts = getTimedFeatureTraceParts(tileMap, transition, register);
    const hasTimedPusherMove = timedParts.some((part) => part.includes("pusher") && part.includes("ACTIVE → pushed"));
    const boardParts = (transition.boardEvents || [])
      .filter((event) => !(event.type === "pusher" && hasTimedPusherMove))
      .map(formatBoardTraceEvent)
      .filter(Boolean);
    if (!boardParts.length && (transition.conveyorSteps || []).length) {
      boardParts.push(...transition.conveyorSteps.map((step) => formatBoardTraceEvent({ type: "conveyor", ...step })).filter(Boolean));
    } else if (!boardParts.length && transition.gearTurned) {
      boardParts.push("gear turn");
    }
    const hits = hitsByAction.get(absoluteRegister) ?? [];
    const effects = [
      ...boardParts,
      ...timedParts,
      ...hits.map((hit) => `FLAG ${hit.checkpointId ?? hit.checkpointIndex + 1}`),
      ...(transition?.rebooted ? ["REBOOT → turn ends"] : [])
    ];
    rows.push({ absoluteRegister, turn, register, program, move, effects: effects.join("; ") || "—" });
  });
  return rows;
}

export function renderInspectionTraceTable(parent, rows) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.88em";
  table.style.margin = "0.35rem 0";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["#", "Reg", "Program", "Movement", "Board / result"].forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.padding = "0.22rem 0.35rem";
    th.style.borderBottom = "1px solid currentColor";
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  let currentTurn = null;
  let tbody = null;
  rows.forEach((row) => {
    if (row.turn !== currentTurn) {
      currentTurn = row.turn;
      tbody = document.createElement("tbody");
      const turnRow = document.createElement("tr");
      const turnCell = document.createElement("th");
      turnCell.colSpan = 5;
      turnCell.textContent = `Turn ${row.turn}`;
      turnCell.style.textAlign = "left";
      turnCell.style.padding = "0.35rem";
      turnCell.style.borderTop = "1px solid currentColor";
      turnCell.style.borderBottom = "1px solid rgba(127,127,127,0.35)";
      turnRow.append(turnCell);
      tbody.append(turnRow);
      table.append(tbody);
    }
    const tr = document.createElement("tr");
    [row.absoluteRegister, `R${row.register}`, row.program, row.move, row.effects].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value ?? "";
      td.style.padding = "0.22rem 0.35rem";
      td.style.verticalAlign = "top";
      td.style.borderBottom = "1px solid rgba(127,127,127,0.2)";
      tr.append(td);
    });
    tbody?.append(tr);
  });
  parent.append(wrapTableForScroll(table));
}

export function renderStructuredRouteInspection(detailEl, scenario, entry) {
  const route = entry?.route;
  if (!route) return;
  const startIndex = entry?.startAnalysis?.index;
  const ledger = getInspectionRouteLedger(scenario, route, startIndex);

  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = entry.label;
  title.append(strong);
  detailEl.append(title);

  const effectiveRE = Number(entry?.startAnalysis?.normalFairnessEffectiveRE);
  const traffic = Number(entry?.startAnalysis?.fullCourseTrafficPenalty ?? entry?.startAnalysis?.trafficPenalty ?? 0);
  const fullCourseDetail = route === entry?.startAnalysis?.fullCourseRoute;
  const overviewRows = [
    ["Registers", route.actions ?? "n/a", "Distance", route.distance ?? "n/a"],
    ["Forced movement", route.forcedDistance ?? 0, fullCourseDetail ? "Effective RE" : "Full-course effective RE", Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"],
    ["Card RE", ledger?.cleanCardPlausibilityRE ?? "n/a", "Mental RE", ledger?.mentalRegisterEquivalents ?? "n/a"],
    ["Damage supply RE", ledger?.damageCardSupplyRE ?? "n/a", "Clog RE", ledger?.clogRE ?? "n/a"],
    ["Energy RE", ledger?.energyRE ?? "n/a", "Detailed replay RE", ledger?.observationalSubtotalWithMentalRE ?? "n/a"]
  ];
  const summaryTable = document.createElement("table");
  summaryTable.style.width = "100%";
  summaryTable.style.borderCollapse = "collapse";
  summaryTable.style.fontSize = "0.92em";
  summaryTable.style.margin = "0.4rem 0";
  overviewRows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = document.createElement(index % 2 === 0 ? "th" : "td");
      cell.textContent = value;
      cell.style.textAlign = "left";
      cell.style.padding = "0.18rem 0.35rem";
      cell.style.verticalAlign = "top";
      if (index % 2 === 0) cell.style.whiteSpace = "nowrap";
      tr.append(cell);
    });
    summaryTable.append(tr);
  });
  detailEl.append(wrapTableForScroll(summaryTable));

  if (fullCourseDetail && entry?.startAnalysis?.normalFairnessComponents) {
    const components = entry.startAnalysis.normalFairnessComponents;
    const ownership = appendInspectionDetails(detailEl, "Effective RE ownership", { open: true });
    const ownershipNote = document.createElement("div");
    ownershipNote.style.fontSize = "0.88em";
    ownershipNote.style.margin = "0.3rem 0";
    ownershipNote.textContent = "This is the additive completed-route value used by Normal fairness and RE-native route-family occupancy. Detailed replay RE above is a chronological diagnostic replay and is not an independent score to add again.";
    ownership.append(ownershipNote);
    appendInspectionTable(ownership, ["Component", "RE"], [
      ["Intrinsic completed route", components.intrinsicRE ?? "n/a"],
      ["Robot-laser damage", components.robotLaserDamageRE ?? 0],
      ["Nearby control / displacement", components.nearbyControlRE ?? 0],
      ["Legacy ranged threat (production OFF)", components.residualRangedThreatRE ?? 0],
      ["Competition", components.competitionRE ?? 0],
      ["Traffic-awareness mental", components.trafficMentalRE ?? 0],
      ["Effective RE", Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"]
    ], { fontSize: "0.88em" });
  }

  const searchDiagnostics = appendInspectionDetails(detailEl, "Search / occupancy diagnostics", { open: false });
  const playerCount = Math.max(1, Number(scenario?.preferences?.playerCount ?? scenario?.playerCount ?? 1) || 1);
  const occupancyField = scenario?.sequence?.firstLeg?.summary?.fullCourseTraffic?.commonOccupancyField ?? null;
  appendInspectionTable(searchDiagnostics, ["Diagnostic", "Value"], [
    ["Search cost (this route)", Number.isFinite(Number(route.score)) ? Number(route.score).toFixed(2) : "n/a"],
    [fullCourseDetail ? "Traffic search pressure" : "Full-course traffic search pressure", Number.isFinite(traffic) ? traffic.toFixed(2) : "n/a"],
    ["Occupancy field total", Number.isFinite(Number(occupancyField?.totalWeight)) ? `${Number(occupancyField.totalWeight).toFixed(2)} expected robots` : `${playerCount.toFixed(2)} expected robots`],
    ["Other-player mass for this start", `${Math.max(0, playerCount - 1).toFixed(2)} expected robots`],
    ["Role", "Search/discovery diagnostics only; not an additional RE score"]
  ], { fontSize: "0.86em" });

  const traceDetails = appendInspectionDetails(detailEl, "Register trace", { open: true });
  const traceRows = buildInspectionTraceRows(route, scenario?.goalTileMap ?? null);
  renderInspectionTraceTable(traceDetails, traceRows);

  if (ledger) {
    const reDetails = appendInspectionDetails(detailEl, "Detailed RE replay by turn", { open: true });
    const reNote = document.createElement("div");
    reNote.style.fontSize = "0.88em";
    reNote.style.margin = "0.3rem 0";
    reNote.textContent = "Chronological route replay. Use Effective RE ownership above for the additive final route value; this table is the detailed turn-by-turn diagnostic.";
    reDetails.append(reNote);
    appendInspectionTable(
      reDetails,
      ["Turn", "Reg", "Card", "Damage supply", "Clog", "Energy", "Mental", "Observed RE", "Planning events"],
      (ledger.turns || []).map((turn) => [
        `T${turn.turn}`,
        turn.programmedRegisterRE,
        turn.cleanCardPlausibilityRE,
        turn.damageCardSupplyRE,
        turn.clogRE,
        turn.energyRE,
        turn.mentalRegisterEquivalents,
        turn.observationalSubtotalWithMentalRE,
        `${turn.planningEventRawCount} → ${turn.planningEventRoundedCount}`
      ]),
      { fontSize: "0.86em" }
    );
  }

  const secondary = appendInspectionDetails(detailEl, "Secondary / comparator diagnostics", { open: false });
  const secondaryBody = document.createElement("div");
  const secondaryHint = document.createElement("div");
  secondaryHint.style.margin = "0.3rem 0";
  secondaryHint.style.fontSize = "0.88em";
  secondaryHint.textContent = "Expand to compute cached comparator/shadow summaries. Full event-level text remains in Copy All.";
  secondaryBody.append(secondaryHint);
  secondary.append(secondaryBody);
  let secondaryLoaded = false;
  secondary.addEventListener("toggle", () => {
    if (!secondary.open || secondaryLoaded) return;
    secondaryLoaded = true;
    const secondaryLines = [];
    if (ledger && typeof summarizeCheapSearchRegisterEquivalentShadow === "function") {
      const replayCache = getScenarioDevReplayCache(scenario);
      const cheapShadow = getCachedRouteReplay(
        replayCache?.cheapShadowByRoute,
        route,
        () => summarizeCheapSearchRegisterEquivalentShadow(
          scenario.goalTileMap,
          route,
          getDamageFoundationScenarioOptions(scenario),
          getDamageFoundationTrafficContext(scenario, startIndex),
          ledger
        )
      );
      if (cheapShadow) {
        secondaryLines.push(
          `Routing-card comparator: routing-active union ${cheapShadow.unionFrontierCardRE} RE vs exact ${cheapShadow.exactCleanCardRE} RE.`,
          `Completed-route mental: intrinsic ${cheapShadow.cheapIntrinsicMentalRE} RE + traffic-awareness ${cheapShadow.trafficMentalIncrementRE} RE = ${cheapShadow.fullMentalRE} RE.`
        );
      }
    }
    if (typeof summarizeDamageEconomyFoundationForRoute === "function") {
      const replayCache = getScenarioDevReplayCache(scenario);
      const damage = getCachedRouteReplay(
        replayCache?.damageFoundationByRoute,
        route,
        () => summarizeDamageEconomyFoundationForRoute(
          scenario.goalTileMap,
          route,
          getDamageFoundationScenarioOptions(scenario),
          getDamageFoundationTrafficContext(scenario, startIndex)
        )
      );
      if (damage) {
        secondaryLines.push(
          `Damage economy: ${damage.totalDamageUnits} input units; supply/clog/total ${damage.totalSpamSupplyRegisterEquivalents}/${damage.totalClogRegisterEquivalents}/${damage.totalDamageEconomyRegisterEquivalents} RE.`,
          `Shutdown tolerance: ${damage.shutdownThreatLevel}; ${damage.shutdownEquivalentEpisodeCount ?? 0} threshold crossing(s). Counterfactual reference only.`
        );
      }
    }
    secondaryLines.push("Full event-level diagnostics remain available through Copy All.");
    secondaryBody.replaceChildren();
    secondaryLines.forEach((line) => {
      const row = document.createElement("div");
      row.style.margin = "0.25rem 0";
      row.textContent = line;
      secondaryBody.append(row);
    });
  });
}

export function getSelectedInspectionStartIndices(scenario) {
  const traceable = new Set(getTraceableStartIndices(scenario));
  return [...traceSelectionState.startIndices]
    .filter((index) => traceable.has(index))
    .sort((left, right) => left - right);
}

export function renderMultiStartInspectionSummary(detailEl, scenario, selectedLegIndices, startIndices) {
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const scopeLabel = normalizedLegs.length === 1
    ? formatLegLabel(scenario.sequence.legs[normalizedLegs[0]])
    : "Selected full-course routes";

  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${startIndices.length} visible starts — comparison summary`;
  title.append(strong);
  detailEl.append(title);

  const note = document.createElement("div");
  note.style.fontSize = "0.88em";
  note.style.margin = "0.3rem 0 0.5rem";
  note.textContent = `${scopeLabel}. Round-by-round detail is shown automatically when exactly one start is visible.`;
  detailEl.append(note);

  const rows = startIndices.map((startIndex) => {
    const entry = getRouteInspectionEntryForStart(scenario, selectedLegIndices, startIndex);
    if (!entry?.route) return null;
    const ledger = getInspectionRouteLedger(scenario, entry.route, startIndex);
    const effectiveRE = Number(entry.startAnalysis?.normalFairnessEffectiveRE);
    return [
      `#${startIndex + 1}`,
      entry.singleLegIndex === null ? "Full course" : formatLegLabel(scenario.sequence.legs[entry.singleLegIndex]),
      entry.route.actions ?? "n/a",
      entry.route.distance ?? "n/a",
      ledger?.cleanCardPlausibilityRE ?? "n/a",
      ledger?.mentalRegisterEquivalents ?? "n/a",
      ledger?.observationalSubtotalWithMentalRE ?? "n/a",
      Number.isFinite(effectiveRE) ? effectiveRE.toFixed(3) : "n/a"
    ];
  }).filter(Boolean);

  appendInspectionTable(
    detailEl,
    ["Start", "Scope", "Reg", "Dist", "Card RE", "Mental RE", "Detailed replay RE", "Full-course effective RE"],
    rows,
    { fontSize: "0.84em" }
  );
}

export function updateInspectionDetail(scenario, selectedLegIndices) {
  const detailEl = document.getElementById("inspection-detail");
  if (!detailEl) return;

  const selectedStartIndices = scenario ? getSelectedInspectionStartIndices(scenario) : [];
  const checkpointFocused = Boolean(routeInspectionState.kind === "checkpoint");
  const visible = Boolean(
    scenario &&
    isDevViewEnabled() &&
    (checkpointFocused || selectedStartIndices.length)
  );
  detailEl.classList.toggle("hidden", !visible);
  detailEl.replaceChildren();
  if (!visible) return;

  if (checkpointFocused) {
    const lines = getCheckpointInspectionLines(scenario, Number(routeInspectionState.key));
    lines.forEach((line, index) => {
      const row = document.createElement("div");
      if (index === 0) {
        const strong = document.createElement("strong");
        strong.textContent = line;
        row.append(strong);
      } else {
        row.textContent = line;
      }
      detailEl.append(row);
    });
    return;
  }

  if (selectedStartIndices.length === 1) {
    const focused = getRouteInspectionEntryForStart(
      scenario,
      selectedLegIndices,
      selectedStartIndices[0]
    );
    if (focused) renderStructuredRouteInspection(detailEl, scenario, focused);
    return;
  }

  if (selectedStartIndices.length > 1) {
    renderMultiStartInspectionSummary(detailEl, scenario, selectedLegIndices, selectedStartIndices);
  }
}

export function updateDevGenerationSeedControls(message = "") {
  const wrapper = document.getElementById("dev-generation-seed-controls");
  const toggle = document.getElementById("dev-generation-seed-toggle");
  const renew = document.getElementById("dev-generation-seed-renew");
  const input = document.getElementById("dev-generation-seed-input");
  const status = document.getElementById("dev-generation-seed-status");
  if (!wrapper || !toggle || !renew || !input || !status) {
    return;
  }

  const frozen = Number.isInteger(devFrozenGenerationSeed);
  toggle.textContent = frozen ? "Unfreeze" : "Freeze";
  renew.classList.toggle("hidden", !frozen);
  if (frozen && document.activeElement !== input) {
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
  }
  status.textContent = message;
  status.classList.toggle("hidden", !message);
}

export function ensureDevGenerationSeedControls() {
  if (document.getElementById("dev-generation-seed-controls")) {
    return;
  }

  const anchor = document.getElementById("run-diagnostics");
  const parent = anchor?.parentElement;
  if (!parent) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.id = "dev-generation-seed-controls";
  wrapper.className = "hidden";

  const toggle = document.createElement("button");
  toggle.id = "dev-generation-seed-toggle";
  toggle.type = "button";

  const input = document.createElement("input");
  input.id = "dev-generation-seed-input";
  input.type = "text";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 10;
  input.placeholder = "Test seed";
  input.value = "56BAC99D";
  input.setAttribute("aria-label", "Test seed");

  const apply = document.createElement("button");
  apply.id = "dev-generation-seed-apply";
  apply.type = "button";
  apply.textContent = "Use";

  const renew = document.createElement("button");
  renew.id = "dev-generation-seed-renew";
  renew.type = "button";
  renew.textContent = "New";

  const status = document.createElement("div");
  status.id = "dev-generation-seed-status";
  status.className = "hidden";

  const applyTypedSeed = () => {
    const parsed = parseDevGenerationSeed(input.value);
    if (!Number.isInteger(parsed)) {
      updateDevGenerationSeedControls("Use up to 8 hexadecimal digits.");
      return;
    }
    devFrozenGenerationSeed = parsed;
    input.value = formatDevGenerationSeed(parsed);
    updateDevGenerationSeedControls();
  };

  toggle.addEventListener("click", () => {
    if (Number.isInteger(devFrozenGenerationSeed)) {
      devFrozenGenerationSeed = null;
      updateDevGenerationSeedControls();
      return;
    }

    const typed = parseDevGenerationSeed(input.value);
    devFrozenGenerationSeed = Number.isInteger(typed)
      ? typed
      : createDevGenerationSeed();
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
    updateDevGenerationSeedControls();
  });

  apply.addEventListener("click", applyTypedSeed);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedSeed();
    }
  });

  renew.addEventListener("click", () => {
    devFrozenGenerationSeed = createDevGenerationSeed();
    input.value = formatDevGenerationSeed(devFrozenGenerationSeed);
    updateDevGenerationSeedControls();
  });

  wrapper.append(toggle, input, apply, renew, status);
  parent.insertBefore(wrapper, anchor);
  updateDevGenerationSeedControls();
}

export function pageIsDevRouteModelOverrideActive() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-route-model-override-toggle")?.checked);
}

export function pageIsDevFastTrafficEnabled() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-fast-traffic-toggle")?.checked);
}

export function pageIsDevFastAlternatesEnabled() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("dev-fast-alternates-toggle")?.checked);
}

export function ensureDevFastBaselineControls() {
  if (document.getElementById("dev-fast-baseline-controls")) return;

  const anchor = document.getElementById("dev-generation-seed-controls") ??
    document.getElementById("run-diagnostics");
  const parent = anchor?.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("div");
  wrapper.id = "dev-fast-baseline-controls";
  wrapper.className = "hidden";
  wrapper.style.margin = "0.5rem 0";
  wrapper.style.padding = "0.45rem 0";

  const title = document.createElement("strong");
  title.textContent = "Current-mode traffic override";

  const purpose = document.createElement("div");
  purpose.style.fontSize = "0.9em";
  purpose.style.margin = "0.2rem 0 0.35rem";
  purpose.textContent = "Diagnostic experiment controls. Leave override off to use the selected generation mode exactly as designed.";

  const overrideLabel = document.createElement("label");
  overrideLabel.style.display = "block";
  overrideLabel.style.marginBottom = "0.25rem";
  const overrideToggle = document.createElement("input");
  overrideToggle.id = "dev-route-model-override-toggle";
  overrideToggle.type = "checkbox";
  overrideToggle.checked = false;
  overrideLabel.append(overrideToggle, document.createTextNode(" Override selected mode's traffic behavior for next generation"));

  const forcedControls = document.createElement("div");
  forcedControls.style.marginLeft = "1.1rem";

  const trafficLabel = document.createElement("label");
  trafficLabel.style.marginRight = "0.8rem";
  const traffic = document.createElement("input");
  traffic.id = "dev-fast-traffic-toggle";
  traffic.type = "checkbox";
  trafficLabel.append(traffic, document.createTextNode(" Traffic scoring enabled"));

  const alternatesLabel = document.createElement("label");
  const alternates = document.createElement("input");
  alternates.id = "dev-fast-alternates-toggle";
  alternates.type = "checkbox";
  alternatesLabel.append(alternates, document.createTextNode(" Traffic-driven alternate discovery enabled"));
  forcedControls.append(trafficLabel, alternatesLabel);

  const note = document.createElement("div");
  note.id = "dev-fast-baseline-status";
  note.style.fontSize = "0.9em";
  note.style.marginTop = "0.25rem";

  const getSelectedModeState = () => {
    const mode = normalizeGenerationMode(document.getElementById("generation-mode")?.value);
    const profile = getGenerationModeProfile({ generationMode: mode });
    return {
      mode,
      label: formatGenerationModeLabel(mode),
      profile,
      trafficEnabled: Boolean(profile.trafficEnabled),
      alternatesEnabled: Boolean(profile.trafficEnabled && profile.trafficEpochs > 0)
    };
  };
  const syncForcedControlsToMode = () => {
    const state = getSelectedModeState();
    traffic.checked = state.trafficEnabled;
    alternates.checked = state.alternatesEnabled;
  };
  const updateNote = () => {
    const state = getSelectedModeState();
    const overrideActive = overrideToggle.checked;
    traffic.disabled = !overrideActive;
    alternates.disabled = !overrideActive;
    forcedControls.style.opacity = overrideActive ? "1" : "0.6";
    if (!overrideActive) {
      const newSearchText = state.alternatesEnabled
        ? `round ceiling ${state.profile.trafficAlternateMaxNewSearchesPerEpoch ?? 0}, ${state.profile.trafficAlternateMaxNewSearchesTotal ?? 0} total bounded new search(es)`
        : "no alternate discovery";
      note.textContent = `${state.label} controls generation: traffic ${state.trafficEnabled ? "on" : "off"}, traffic-driven alternatives ${state.alternatesEnabled ? "on" : "off"} (${newSearchText}). Dev View is observational.`;
      return;
    }
    const effectiveAlternates = traffic.checked && alternates.checked;
    note.textContent = `Override active for ${state.label}: force traffic ${traffic.checked ? "on" : "off"}, force traffic-driven alternates ${effectiveAlternates ? "on" : "off"}${alternates.checked && !traffic.checked ? " (alternate discovery requires traffic)" : ""}. Other ${state.label} budgets remain unchanged.`;
  };

  syncForcedControlsToMode();
  overrideToggle.addEventListener("change", () => {
    if (overrideToggle.checked) syncForcedControlsToMode();
    updateNote();
  });
  traffic.addEventListener("change", updateNote);
  alternates.addEventListener("change", updateNote);
  document.getElementById("generation-mode")?.addEventListener("change", () => {
    if (!overrideToggle.checked) syncForcedControlsToMode();
    updateNote();
  });

  wrapper.append(title, purpose, overrideLabel, forcedControls, note);
  parent.insertBefore(wrapper, anchor);
  updateNote();
}

// Dev View is offered only when the address contains ?dev (e.g. ?dev=1), to keep
// the ordinary interface uncluttered. It is presentation only: generation behaves
// the same either way, so the parameter unlocks nothing. Without it the checkbox
// is forced off, because browsers can restore a ticked checkbox on reload.
export function applyDevViewAvailability() {
  if (typeof document === "undefined") return;
  const available = new URLSearchParams(location.search).has("dev");
  document.getElementById("dev-view-toggle-label")?.classList.toggle("hidden", !available);
  const checkbox = document.getElementById("dev-view");
  if (!available && checkbox) checkbox.checked = false;
}

export function updateDevView() {
  ensureDevGenerationSeedControls();
  // Traffic/alternate-route experiment controls are intentionally no longer
  // surfaced in Dev View. The dormant override helpers remain below so this UI
  // cleanup does not alter the generation-mode mechanisms themselves.
  const enabled = isDevViewEnabled();
  if (enabled) {
    ensureCourseEvaluationReportElement();
  }
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
  document.getElementById("board-audit-toggle-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("dev-generation-seed-controls")?.classList.toggle("hidden", !enabled);
  document.getElementById("run-diagnostics")?.classList.add("hidden");
  updateBoardAuditVisibility();
  updateDevStartResidualTable(currentScenario);
}

export function getCanvasTileFromEvent(event) {
  const canvas = document.getElementById("canvas");
  const state = canvas?.__roborallyRenderState;
  if (!canvas || !state) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const tileX = Math.floor((canvasX - state.margin) / state.tileSize) + state.bounds.minX;
  const tileY = Math.floor((canvasY - state.margin) / state.tileSize) + state.bounds.minY;

  if (tileX < state.bounds.minX || tileX > state.bounds.maxX || tileY < state.bounds.minY || tileY > state.bounds.maxY) {
    return null;
  }

  return { x: tileX, y: tileY };
}

export function getInspectableAtTile(scenario, tile) {
  if (!scenario || !tile) {
    return null;
  }

  const startAnalysis = scenario.sequence.firstLeg.starts.find((analysis) => (
    analysis.start.x === tile.x && analysis.start.y === tile.y
  ));
  if (startAnalysis) {
    return {
      kind: "start",
      key: String(startAnalysis.index)
    };
  }

  const checkpointIndex = scenario.checkpoints.findIndex((checkpoint) => (
    checkpoint.x === tile.x && checkpoint.y === tile.y
  ));
  if (checkpointIndex >= 0) {
    return {
      kind: "checkpoint",
      key: String(checkpointIndex)
    };
  }

  return null;
}

export function sameInspection(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.key === right.key);
}

export function clearRouteInspection() {
  routeInspectionState = { kind: null, key: null };
}

export function getTraceableStartIndices(scenario) {
  return scenario.sequence.firstLeg.starts
    .filter((entry) => entry.reachable && entry.fullCourseRoute)
    .map((entry) => entry.index);
}

export function toggleTraceStart(startIndex) {
  const next = new Set(traceSelectionState.startIndices);
  if (next.has(startIndex)) next.delete(startIndex);
  else next.add(startIndex);
  traceSelectionState = { startIndices: next };
}

export function selectAllTraceStarts(scenario) {
  traceSelectionState = { startIndices: new Set(getTraceableStartIndices(scenario)) };
}

export function clearTraceStarts() {
  traceSelectionState = { startIndices: new Set() };
}

// A freshly generated or restored course starts by tracing every start that is
// in play (the retained, usable starts). Pruned outliers can still be added from
// the start picker, and a double-click on a trace selects every routable start.
export function selectDefaultTraceStarts(scenario) {
  if (!scenario?.sequence?.firstLeg?.starts) {
    clearTraceStarts();
    return;
  }
  const traceable = new Set(getTraceableStartIndices(scenario));
  const usable = (scenario?.metrics?.usableStarts ?? [])
    .map((entry) => entry.index)
    .filter((index) => traceable.has(index));
  traceSelectionState = { startIndices: new Set(usable.length ? usable : traceable) };
}

export function applyRouteInspection(inspection) {
  if (!inspection) {
    clearRouteInspection();
    return;
  }
  if (inspection.kind === "start") {
    const startIndex = Number(inspection.key);
    toggleTraceStart(startIndex);
    // Start-route evaluation is owned by the visible-start selection itself.
    // Do not retain a second "last clicked start" focus that can disagree with
    // the selected set. Checkpoint inspection remains explicit click state.
    clearRouteInspection();
    return;
  }
  routeInspectionState = sameInspection(routeInspectionState, inspection)
    ? { kind: null, key: null }
    : inspection;
}

export function normalizeSelectedLegIndices(scenario, selectedLegIndices = null) {
  const legCount = scenario?.sequence?.legs?.length ?? 0;
  const provided = Array.isArray(selectedLegIndices)
    ? selectedLegIndices
    : selectedLegIndices === null || selectedLegIndices === undefined
      ? []
      : [selectedLegIndices];
  const normalized = [...new Set(provided
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < legCount))]
    .sort((left, right) => left - right);
  return normalized.length ? normalized : Array.from({ length: legCount }, (_, index) => index);
}

export function getSelectedLegIndicesFromControl(scenario) {
  const legSelect = document.getElementById("leg-select");
  if (!legSelect || !isDevViewEnabled()) {
    return normalizeSelectedLegIndices(scenario, null);
  }
  const selected = [...legSelect.options]
    .filter((option) => option.selected)
    .map((option) => Number(option.value));
  return normalizeSelectedLegIndices(scenario, selected);
}

export function getSelectedTraceRoutes(scenario, selectedLegIndices) {
  const routes = [];
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const allLegsSelected = normalizedLegs.length === (scenario?.sequence?.legs?.length ?? 0);
  for (const startIndex of traceSelectionState.startIndices) {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const fullRoute = startAnalysis?.fullCourseRoute;
    if (!fullRoute) continue;
    if (allLegsSelected) {
      routes.push({ ...fullRoute, startIndex, traceIndex: startIndex });
      continue;
    }
    normalizedLegs.forEach((legIndex) => {
      const route = fullRoute.legRoutes?.[legIndex];
      if (!route) return;
      routes.push({ ...route, startIndex, traceIndex: startIndex, traceLegIndex: legIndex });
    });
  }
  return routes;
}

export function tileTouchesVisibleTrace(scenario, tile, selectedLegIndices) {
  if (!tile) return false;
  return getSelectedTraceRoutes(scenario, selectedLegIndices).some((route) =>
    (route.path || []).some((point) => point.x === tile.x && point.y === tile.y)
  );
}

export function ensureCourseEvaluationReportElement() {
  const panel = document.getElementById("report-panel");
  const exact = document.getElementById("report");
  if (exact && (!panel || panel.contains(exact))) return exact;
  if (!panel) return exact ?? null;

  // Host markup has changed over time. Reuse a plausible existing report surface
  // inside the Dev panel if one exists; otherwise create the Course Summary body
  // ourselves. Do not accidentally write into an unrelated legacy #report node.
  const existing = panel.querySelector(
    "[data-course-evaluation-report], #course-evaluation-report, #course-summary-report, .course-evaluation-report, .course-summary-report, textarea, pre"
  );
  if (existing) {
    if (!existing.id) {
      existing.id = exact ? "course-evaluation-report" : "report";
    }
    existing.dataset.courseEvaluationReport = "true";
    return existing;
  }

  const reportEl = document.createElement("pre");
  reportEl.id = exact ? "course-evaluation-report" : "report";
  reportEl.dataset.courseEvaluationReport = "true";
  reportEl.className = "course-evaluation-report";
  reportEl.style.whiteSpace = "pre-wrap";
  reportEl.style.overflowWrap = "anywhere";
  reportEl.style.maxHeight = "32rem";
  reportEl.style.overflow = "auto";
  reportEl.style.margin = "0.75rem 0";
  panel.appendChild(reportEl);
  return reportEl;
}

export function setCourseEvaluationReportText(text) {
  const reportEl = ensureCourseEvaluationReportElement();
  if (!reportEl) return;
  const value = String(text ?? "");
  // Some host versions render the report as a textarea/form control. Updating only
  // textContent changes the DOM child text but leaves the visible control value
  // blank. Keep both representations synchronized so the on-screen summary and
  // copy controls always see the same report.
  if ("value" in reportEl) {
    reportEl.value = value;
  }
  reportEl.textContent = value;
}

export function getCourseEvaluationReportText() {
  const reportEl = ensureCourseEvaluationReportElement();
  if (!reportEl) return "";
  if ("value" in reportEl && typeof reportEl.value === "string" && reportEl.value) {
    return reportEl.value;
  }
  return reportEl.textContent ?? "";
}
