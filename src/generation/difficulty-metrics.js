// Robo Rally Course Randomizer - difficulty metrics: RE turn difficulty, variant difficulty accounting, programming pressure, board harshness
import {
  buildStartOccupancyMap,
  scoreFlagArea,
  summarizeRENativeRouteUncertaintyEvidence,
  summarizeRegisterEquivalentLedger
} from "../../analyze.js";
import { PROGRAMMING_CONTROL_PRESSURE_WEIGHTS } from "../../feature-weights.js";
import { getAcceptableScenarioScore } from "./candidate-selection.js";
import {
  addDevTiming,
  getCachedRouteReplay,
  getDamageFoundationScenarioOptions,
  getDamageFoundationTrafficContext,
  getDevAcceptableCandidatePool
} from "./dev-replay.js";
import { isDevViewEnabled } from "./environment.js";
import { formatActualDifficultyLabel, formatLegacyDifficultyLabel } from "./labels.js";
import { buildBoardRects } from "./layout-geometry.js";
import { clamp } from "./math.js";
import { getActFastPressureWeight, getActFastREPressureMultiplier } from "./play-time.js";
import { computeUsableStarts } from "./start-balance.js";

export function computeLaterCheckpointPressure(tileMap, checkpoints = [], preferences = {}) {
  if (!tileMap || checkpoints.length <= 1) {
    return 0;
  }

  const laterScores = checkpoints
    .slice(1)
    .map((checkpoint) => scoreFlagArea(tileMap, checkpoint, {
      playerCount: preferences.playerCount,
      lessDeadlyGame: preferences.lessDeadlyGame,
      lighterGame: preferences.lighterGame,
      flamingOil: preferences.flamingOil
    }))
    .filter((score) => Number.isFinite(score));

  // Later-leg route score and congestion already measure sustained course
  // pressure as averages. This separate checkpoint-local term exists to retain
  // a dangerous arrival area, so use the worst later checkpoint rather than
  // allowing additional benign checkpoints to dilute it.
  return laterScores.length ? Number(Math.max(...laterScores).toFixed(2)) : 0;
}

export function computeDifficultyRaw(sequence, checkpointPressure = 0) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const avgLegScore = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.averageRouteScore, 0) / later.length : 0;
  const avgCongestion = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.congestionScore, 0) / later.length : 0;
  const avgDiversity = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.diversityScore, 0) / later.length : 0;
  const avgBacktrack = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.crossLegOverlap, 0) / later.length : 0;

  return Number((
    first.difficultyScore * 0.42 +
    first.averageTrafficPenalty * 0.9 +
    first.flagAreaScore * 1.15 +
    avgLegScore * 0.32 +
    avgCongestion * 0.65 +
    checkpointPressure * 0.42 +
    avgBacktrack * 20 -
    avgDiversity * 0.45
  ).toFixed(2));
}


// v49de production difficulty ownership -----------------------------------
// Completed effective RE owns the amount of non-tempo burden; the exact turn
// ledger contributes only within-route peak shape. Course aggregation remains
// route-mixture aware and occupancy weighted, with a deliberately small likely-
// start upper-tail term. v49de moves this already-calibrated scalar onto the
// production candidate-classification path. Construction guidance still uses
// the historical raw scalar until its later dedicated calibration pass.
export const RE_TURN_DIFFICULTY_ROUTE_PEAK_WEIGHT = 0.20;
export const RE_TURN_DIFFICULTY_COURSE_TAIL_WEIGHT = 0.15;
export const RE_TURN_DIFFICULTY_TAIL_QUANTILE = 0.75;
// Preserve the existing fit-score / gross-mismatch scale while changing the
// semantic unit. The old Intermediate->Advanced floor gap was 60 raw points;
// the accepted Any-difficulty calibration's median->q75 gap was ~1.0081 RE/turn.
// 60 fit points per RE/turn therefore provides a transparent migration bridge.
export const RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE = 60;

export function quantileFinite(values = [], quantile = 0.75) {
  const ordered = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!ordered.length) return 0;
  if (ordered.length === 1) return ordered[0];
  const q = clamp(Number(quantile) || 0, 0, 1);
  const position = (ordered.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return ordered[low];
  const mix = position - low;
  return ordered[low] * (1 - mix) + ordered[high] * mix;
}

export function weightedQuantileFinite(entries = [], quantile = 0.75) {
  const ordered = entries
    .map((entry) => ({
      value: Number(entry?.value),
      weight: Math.max(0, Number(entry?.weight) || 0)
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.weight > 0)
    .sort((left, right) => left.value - right.value);
  if (!ordered.length) return 0;
  const totalWeight = ordered.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(totalWeight > 0)) return 0;
  const target = clamp(Number(quantile) || 0, 0, 1) * totalWeight;
  let cumulative = 0;
  for (const entry of ordered) {
    cumulative += entry.weight;
    if (cumulative + 1e-9 >= target) return entry.value;
  }
  return ordered.at(-1).value;
}

export function createRETurnDifficultyReplayCache() {
  return { ledgerByRoute: new WeakMap() };
}

export function getREDifficultyRouteMixtureEntries(scenario, startAnalysis) {
  const audit = scenario?.sequence?.firstLeg?.summary?.fullCourseTraffic?.routeMixtureOwnershipAudit
    ?? scenario?.sequence?.firstLeg?.summary?.contextualLegCache?.trafficRouteMixtureOwnershipAudit
    ?? null;
  const startAudit = (audit?.perStart ?? []).find((entry) => entry.index === startAnalysis.index);
  const routes = Array.isArray(startAnalysis?.fullCourseRoutes)
    ? startAnalysis.fullCourseRoutes
    : [];
  const reEntries = (startAudit?.reNativeEntries ?? [])
    .map((entry) => {
      const routeIndex = Number(entry?.routeIndex);
      const route = Number.isInteger(routeIndex) ? routes[routeIndex] : null;
      const weight = Math.max(0, Number(entry?.weight) || 0);
      const effectiveRE = Number(entry?.effectiveRE);
      return route && weight > 0 && Number.isFinite(effectiveRE)
        ? { route, routeIndex, weight, effectiveRE }
        : null;
    })
    .filter(Boolean);
  if (reEntries.length) return reEntries;

  const route = startAnalysis?.fullCourseRoute ?? startAnalysis?.selectedRoute ?? null;
  const effectiveRE = Number(startAnalysis?.normalFairnessEffectiveRE);
  return route && Number.isFinite(effectiveRE)
    ? [{ route, routeIndex: null, weight: 1, effectiveRE }]
    : [];
}

export function summarizeRETurnDifficultyRouteCandidate(
  scenario,
  startAnalysis,
  routeEntry,
  replayCache,
  devTiming
) {
  const route = routeEntry?.route;
  const effectiveRE = Number(routeEntry?.effectiveRE);
  if (!route || !Number.isFinite(effectiveRE)) return null;

  const tileMap = scenario?.goalTileMap;
  const damageOptions = getDamageFoundationScenarioOptions(scenario);
  const trafficContext = getDamageFoundationTrafficContext(
    scenario,
    startAnalysis.index
  );
  const replayStartedAt = typeof performance !== "undefined"
    ? performance.now()
    : NaN;
  const ledger = tileMap && typeof summarizeRegisterEquivalentLedger === "function"
    ? getCachedRouteReplay(
      replayCache?.ledgerByRoute,
      route,
      () => summarizeRegisterEquivalentLedger(
        tileMap,
        route,
        damageOptions,
        trafficContext
      )
    )
    : null;
  addDevTiming(devTiming, "reDifficultyReplayMs", replayStartedAt);

  const reNativeUncertainty = tileMap && ledger &&
      typeof summarizeRENativeRouteUncertaintyEvidence === "function"
    ? summarizeRENativeRouteUncertaintyEvidence(
      tileMap,
      route,
      damageOptions,
      trafficContext,
      ledger
    )
    : null;

  const programmedRegisters = Math.max(
    0,
    Number(ledger?.programmedRegisterRE ?? route?.actions ?? route?.transitions?.length) || 0
  );
  if (!(programmedRegisters > 0)) return null;
  const lostRegisterTempoRE = Math.max(
    0,
    Number(ledger?.lostRegisterTempoRE) || 0
  );
  const burdenRE = Math.max(
    0,
    effectiveRE - programmedRegisters - lostRegisterTempoRE
  );

  const turnBurdenShape = (ledger?.turns ?? [])
    .map((turn) => {
      const turnRegisters = Math.max(0, Number(turn?.programmedRegisterRE) || 0);
      if (!(turnRegisters > 0)) return null;
      const observed = Number(turn?.observationalSubtotalWithMentalRE);
      const lostTempo = Math.max(0, Number(turn?.lostRegisterTempoRE) || 0);
      if (!Number.isFinite(observed)) return null;
      return Math.max(0, observed - turnRegisters - lostTempo);
    })
    .filter(Number.isFinite);
  const programmingTurns = Math.max(
    1,
    turnBurdenShape.length || Math.ceil(programmedRegisters / 5)
  );
  const meanTurnBurdenRE = burdenRE / programmingTurns;
  const ledgerMeanTurnBurdenRE = turnBurdenShape.length
    ? meanFinite(turnBurdenShape)
    : meanTurnBurdenRE;
  const ledgerTailTurnBurdenRE = turnBurdenShape.length
    ? quantileFinite(turnBurdenShape, RE_TURN_DIFFICULTY_TAIL_QUANTILE)
    : meanTurnBurdenRE;
  const peakRatio = ledgerMeanTurnBurdenRE > 1e-9
    ? Math.max(1, ledgerTailTurnBurdenRE / ledgerMeanTurnBurdenRE)
    : 1;
  // Completed effective RE owns the amount; the ledger owns only the shape.
  const authoritativeTailTurnBurdenRE = meanTurnBurdenRE * peakRatio;
  const routeTurnDifficultyRE = meanTurnBurdenRE +
    RE_TURN_DIFFICULTY_ROUTE_PEAK_WEIGHT * Math.max(
      0,
      authoritativeTailTurnBurdenRE - meanTurnBurdenRE
    );

  return {
    routeIndex: routeEntry?.routeIndex ?? null,
    weight: Math.max(0, Number(routeEntry?.weight) || 0),
    effectiveRE: Number(effectiveRE.toFixed(3)),
    programmedRegisters: Number(programmedRegisters.toFixed(3)),
    lostRegisterTempoRE: Number(lostRegisterTempoRE.toFixed(3)),
    // v49dk uncertainty ownership observation. Completed-route RE remains the
    // evidence source; no independent hazard/board-chaos/traffic proxy is added.
    cleanCardPlausibilityRE: Number((Number(ledger?.cleanCardPlausibilityRE) || 0).toFixed(4)),
    damageCardSupplyRE: Number((Number(ledger?.damageCardSupplyRE) || 0).toFixed(4)),
    clogRE: Number((Number(ledger?.clogRE) || 0).toFixed(4)),
    energyRE: Number((Number(ledger?.energyRE) || 0).toFixed(4)),
    mentalRE: Number((Number(ledger?.mentalRegisterEquivalents) || 0).toFixed(4)),
    reNativeChronologicalAdverseRE: Number((Number(reNativeUncertainty?.totalAdverseRE) || 0).toFixed(4)),
    reNativeChronologicalPlayTimeAdverseRE: Number((Number(reNativeUncertainty?.playTimeAdverseRE) || 0).toFixed(4)),
    reNativeDamagePressureRE: Number((Number(reNativeUncertainty?.totalDamagePressureRE) || 0).toFixed(4)),
    reNativeForecastAverageConfidence: Number((Number(reNativeUncertainty?.averageConfidence) || 1).toFixed(4)),
    reNativeForecastEndConfidence: Number((Number(reNativeUncertainty?.endConfidence) || 1).toFixed(4)),
    reNativeForecastEndEffectiveHorizonRE: Number((Number(reNativeUncertainty?.endEffectiveHorizonRE) || programmedRegisters).toFixed(4)),
    reNativeBaseEffortScale: Number((Number(reNativeUncertainty?.averageBaseEffortScale) || 1).toFixed(4)),
    reNativeDamageModeratedEffortScale: Number((Number(reNativeUncertainty?.averageDamageModeratedEffortScale) || 1).toFixed(4)),
    reNativeDamageEffortCeiling: Number((Number(reNativeUncertainty?.damagePressureSearchEffortCeiling) || 0.5).toFixed(4)),
    burdenRE: Number(burdenRE.toFixed(3)),
    programmingTurns,
    meanTurnBurdenRE: Number(meanTurnBurdenRE.toFixed(4)),
    turnTailBurdenRE: Number(authoritativeTailTurnBurdenRE.toFixed(4)),
    peakRatio: Number(peakRatio.toFixed(4)),
    routeTurnDifficultyRE: Number(routeTurnDifficultyRE.toFixed(4))
  };
}

export function computeRETurnDifficulty(scenario, options = {}) {
  if (!scenario?.sequence?.firstLeg) {
    return { active: false, reason: "missing-first-leg" };
  }

  const firstLeg = scenario.sequence.firstLeg;
  const playerCount = Math.max(
    1,
    Number(scenario.playerCount ?? scenario.preferences?.playerCount ?? 1)
  );
  const usableStarts = computeUsableStarts(firstLeg, {
    ...(scenario.preferences ?? {}),
    competitiveMode: Boolean(scenario.competitiveMode),
    virtualBots: Boolean(scenario.virtualBots),
    payToWin: Boolean(scenario.payToWin),
    subsidizedStarts: Boolean(scenario.subsidizedStarts)
  })
    .filter((entry) => (
      entry?.fullCourseRoute &&
      Number.isFinite(Number(entry.normalFairnessEffectiveRE))
    ));
  if (!usableStarts.length) {
    return { active: false, reason: "no-usable-completed-re-starts" };
  }

  const pricingEntries = firstLeg.summary?.payToWin?.pricingEntries ?? [];
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
  const occupancyByIndex = buildStartOccupancyMap(
    usableStarts,
    playerCount,
    {
      trafficOccupancyUseBalanceScore: true,
      occupancyQualityScoreByIndex
    },
    (analysis) => analysis.fullCourseRoute
  );

  const replayCache = options.replayCache ?? createRETurnDifficultyReplayCache();
  const devTiming = options.timing ?? null;
  const perStart = [];
  let routeMixtureEntryCount = 0;

  for (const startAnalysis of usableStarts) {
    const mixtureEntries = getREDifficultyRouteMixtureEntries(
      scenario,
      startAnalysis
    );
    const routeSummaries = mixtureEntries
      .map((routeEntry) => summarizeRETurnDifficultyRouteCandidate(
        scenario,
        startAnalysis,
        routeEntry,
        replayCache,
        devTiming
      ))
      .filter(Boolean);
    if (!routeSummaries.length) continue;

    const routeWeightTotal = routeSummaries.reduce(
      (sum, entry) => sum + Math.max(0, Number(entry.weight) || 0),
      0
    ) || routeSummaries.length;
    const weighted = (key) => routeSummaries.reduce((sum, entry) => (
      sum + Number(entry[key] || 0) * (
        routeWeightTotal > 0
          ? Math.max(0, Number(entry.weight) || 0) / routeWeightTotal
          : 1 / routeSummaries.length
      )
    ), 0);
    routeMixtureEntryCount += routeSummaries.length;

    perStart.push({
      index: startAnalysis.index,
      occupancy: Math.max(0, Number(occupancyByIndex.get(startAnalysis.index)) || 0),
      routeCount: routeSummaries.length,
      effectiveRE: weighted("effectiveRE"),
      programmedRegisters: weighted("programmedRegisters"),
      lostRegisterTempoRE: weighted("lostRegisterTempoRE"),
      cleanCardPlausibilityRE: weighted("cleanCardPlausibilityRE"),
      damageCardSupplyRE: weighted("damageCardSupplyRE"),
      clogRE: weighted("clogRE"),
      energyRE: weighted("energyRE"),
      mentalRE: weighted("mentalRE"),
      reNativeChronologicalAdverseRE: weighted("reNativeChronologicalAdverseRE"),
      reNativeChronologicalPlayTimeAdverseRE: weighted("reNativeChronologicalPlayTimeAdverseRE"),
      reNativeDamagePressureRE: weighted("reNativeDamagePressureRE"),
      reNativeForecastAverageConfidence: weighted("reNativeForecastAverageConfidence"),
      reNativeForecastEndConfidence: weighted("reNativeForecastEndConfidence"),
      reNativeForecastEndEffectiveHorizonRE: weighted("reNativeForecastEndEffectiveHorizonRE"),
      reNativeBaseEffortScale: weighted("reNativeBaseEffortScale"),
      reNativeDamageModeratedEffortScale: weighted("reNativeDamageModeratedEffortScale"),
      reNativePlayTimeAmplificationMultiplierIndex: weighted("reNativePlayTimeAmplificationMultiplierIndex"),
      burdenRE: weighted("burdenRE"),
      programmingTurns: weighted("programmingTurns"),
      meanTurnBurdenRE: weighted("meanTurnBurdenRE"),
      turnTailBurdenRE: weighted("turnTailBurdenRE"),
      routeTurnDifficultyRE: weighted("routeTurnDifficultyRE"),
      routes: routeSummaries
    });
  }

  if (!perStart.length) {
    return { active: false, reason: "no-re-turn-route-summaries" };
  }

  const occupancyMass = perStart.reduce((sum, entry) => sum + entry.occupancy, 0);
  const fallbackWeight = perStart.length ? 1 / perStart.length : 0;
  const normalizedWeight = (entry) => occupancyMass > 0
    ? entry.occupancy / occupancyMass
    : fallbackWeight;
  const expectedMeanTurnBurdenRE = perStart.reduce(
    (sum, entry) => sum + entry.meanTurnBurdenRE * normalizedWeight(entry),
    0
  );
  const expectedPeakAdjustedTurnBurdenRE = perStart.reduce(
    (sum, entry) => sum + entry.routeTurnDifficultyRE * normalizedWeight(entry),
    0
  );
  const likelyStartTailTurnBurdenRE = weightedQuantileFinite(
    perStart.map((entry) => ({
      value: entry.routeTurnDifficultyRE,
      weight: occupancyMass > 0 ? entry.occupancy : 1
    })),
    RE_TURN_DIFFICULTY_TAIL_QUANTILE
  );
  const courseTurnDifficultyRE = expectedPeakAdjustedTurnBurdenRE +
    RE_TURN_DIFFICULTY_COURSE_TAIL_WEIGHT * Math.max(
      0,
      likelyStartTailTurnBurdenRE - expectedPeakAdjustedTurnBurdenRE
    );

  return {
    active: true,
    method: "completed-re-nontempo-per-programming-turn-route-peak-start-tail-v49de",
    productionOwner: true,
    playerCount,
    startCount: perStart.length,
    occupancyMass: Number(occupancyMass.toFixed(3)),
    routeMixtureEntryCount,
    averageRouteFamiliesPerStart: Number((
      perStart.length ? routeMixtureEntryCount / perStart.length : 0
    ).toFixed(3)),
    routePeakWeight: RE_TURN_DIFFICULTY_ROUTE_PEAK_WEIGHT,
    courseTailWeight: RE_TURN_DIFFICULTY_COURSE_TAIL_WEIGHT,
    tailQuantile: RE_TURN_DIFFICULTY_TAIL_QUANTILE,
    expectedMeanTurnBurdenRE: Number(expectedMeanTurnBurdenRE.toFixed(4)),
    expectedPeakAdjustedTurnBurdenRE: Number(expectedPeakAdjustedTurnBurdenRE.toFixed(4)),
    likelyStartTailTurnBurdenRE: Number(likelyStartTailTurnBurdenRE.toFixed(4)),
    courseTurnDifficultyRE: Number(courseTurnDifficultyRE.toFixed(4)),
    currentForecastEquivalentActions: Number(
      scenario.metrics?.lengthMetrics?.contributions?.forecastEquivalentActions ?? 0
    ),
    perStart
  };
}

export const reTurnDifficultyBySequence = new WeakMap();

export function buildRETurnDifficultyScenario(sequence, preferences = {}, context = {}, lengthMetrics = null) {
  const boardRects = context.boardRects ?? (
    Array.isArray(context.boardPlacements) && context.pieceMap
      ? buildBoardRects(context.boardPlacements, context.pieceMap)
      : []
  );
  return {
    sequence,
    preferences,
    playerCount: preferences.playerCount,
    goalTileMap: context.goalTileMap ?? context.tileMap ?? null,
    recoveryRule: preferences.recoveryRule,
    boardRects,
    rebootTokens: context.rebootTokens ?? [],
    checkpoints: context.checkpoints ?? [],
    virtualBots: Boolean(preferences.virtualBots),
    competitiveMode: Boolean(preferences.competitiveMode),
    payToWin: Boolean(preferences.payToWin),
    subsidizedStarts: Boolean(preferences.subsidizedStarts),
    moreDeadlyGame: Boolean(preferences.moreDeadlyGame),
    lessSpammyGame: Boolean(preferences.lessSpammyGame),
    criticalSpam: Boolean(preferences.criticalSpam),
    criticalHaywire: Boolean(preferences.criticalHaywire),
    permanentShutdown: Boolean(preferences.permanentShutdown),
    factoryRejects: Boolean(preferences.factoryRejects),
    repairStations: Boolean(preferences.repairStations),
    cuttingFloor: Boolean(preferences.cuttingFloor),
    flamingOil: Boolean(preferences.flamingOil),
    repulsorOverdrive: Boolean(preferences.repulsorOverdrive),
    upgradeWorld: Boolean(preferences.upgradeWorld),
    lighterGame: Boolean(preferences.lighterGame),
    setToKill: Boolean(preferences.setToKill),
    setToStun: Boolean(preferences.setToStun),
    metrics: { lengthMetrics }
  };
}

export function getProductionRETurnDifficulty(sequence, preferences = {}, context = {}, lengthMetrics = null) {
  if (!sequence || (typeof sequence !== "object" && typeof sequence !== "function")) {
    return { active: false, reason: "missing-sequence" };
  }
  const cached = reTurnDifficultyBySequence.get(sequence);
  if (cached) return cached;
  const scenario = buildRETurnDifficultyScenario(sequence, preferences, context, lengthMetrics);
  const startedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const result = computeRETurnDifficulty(scenario, {
    replayCache: createRETurnDifficultyReplayCache()
  });
  if (Number.isFinite(startedAt) && result && typeof result === "object") {
    result.computeMs = Number(Math.max(0, performance.now() - startedAt).toFixed(2));
  }
  reTurnDifficultyBySequence.set(sequence, result);
  return result;
}

export function computeRETurnVariantDifficultyAccounting(rawTurnRE, preferences = {}, sequence = null) {
  const programmingPressure = computeProgrammingPressureProfile(sequence);
  let adjusted = Number(rawTurnRE) || 0;
  const contributions = [];
  const mechanicalRules = [];
  const deferredRules = [];
  const scale = (id, multiplier, kind = "residual", evidence = null) => {
    const before = adjusted;
    adjusted *= multiplier;
    contributions.push({
      id,
      kind,
      delta: Number((adjusted - before).toFixed(4)),
      multiplier: Number(multiplier.toFixed(4)),
      evidence
    });
  };
  const mechanical = (id, note) => mechanicalRules.push({ id, note });

  if (preferences.lessSpammyGame) mechanical("lessSpammyGame", "damage-economy SPAM filtering");
  if (preferences.criticalSpam) mechanical(
    "criticalSpam",
    "damage economy: played SPAM receives provisional 20% effective relief / 80% return-to-pending approximation; no mental event"
  );
  if (preferences.criticalHaywire) mechanical(
    "criticalHaywire",
    "damage-economy hand-size effect; no mental event"
  );
  if (preferences.permanentShutdown && preferences.criticalSpam) mechanical(
    "permanentShutdown",
    "damage economy: persistent SPAM progressively amplifies authoritative SPAM-supply RE; no mental event"
  );
  if (preferences.cuttingFloor) mechanical("cuttingFloor", "board-laser damage model + variant-memory event");
  if (preferences.flamingOil) mechanical(
    "flamingOil",
    "damage economy: +1 on first oil entry in a register +1 on end-on-oil; once-per-turn rule-memory event"
  );
  if (preferences.setToKill) mechanical(
    "setToKill",
    "robot-laser damage economy: two damage-card draws per successful main-laser hit"
  );
  if (preferences.setToStun) mechanical(
    "setToStun",
    "robot-laser damage economy: robot-laser SPAM suppressed; Haywire probability unchanged per damage card"
  );
  if (preferences.repairStations) mechanical(
    "repairStations",
    "damage economy: register-5 checkpoint removes one expected Damage-card split with no spill; once-per-turn rule-memory event"
  );

  // v49em: Energy Crisis is mechanically represented by removing the Energy /
  // upgrade economy and its upgrade-phase wall-clock transactions. Do not add a
  // second generic difficulty discount merely because the rule simplifies play.
  if (preferences.lighterGame) {
    mechanical(
      "lighterGame",
      "Energy/upgrade economy removed; upgrade-phase wall-clock transactions zero"
    );
  }

  if (preferences.lessForeshadowing) {
    mechanical(
      "lessForeshadowing",
      "card model: fresh full programming deck each turn; previous-turn depletion off; base scarcity alpha 1.0"
    );
  }
  if (preferences.classicSharedDeck) {
    mechanical(
      "classicSharedDeck",
      "card model: player-count scarcity-alpha uplift + immediate damage-to-hand approximation; no enlarged single-player deck"
    );
  }
  if (preferences.factoryRejects) {
    mechanical("factoryRejects", "card model: actual programming hand size 7");
  }
  if (preferences.actFastMode) {
    const timerWeight = getActFastPressureWeight(preferences.actFastMode);
    const pressureMultiplier = getActFastREPressureMultiplier(
      preferences.actFastMode
    );
    // v49dt: Act Fast is no longer a tiny legacy fit-point add-on in the
    // production RE/turn owner. Time pressure amplifies the non-tempo burden
    // itself, so card/control/damage/mental burden all become harder under the
    // timer while programmed-register tempo remains unchanged.
    scale(
      "actFast",
      pressureMultiplier,
      "timer-pressure",
      {
        mode: preferences.actFastMode,
        timerWeight,
        pressureMultiplier,
        timedPressureLegacyDiagnostic: programmingPressure.timedPressure
      }
    );
  }
  if (preferences.repulsorOverdrive) {
    mechanical(
      "repulsorOverdrive",
      "exact routing doubles repulsor bounce distance; once-per-relevant-turn rule-memory event"
    );
  }
  if (preferences.hazardousFlags) {
    mechanical(
      "hazardousFlags",
      "checkpoint-covered board elements remain physically active; once-per-relevant-turn rule-memory event"
    );
  }
  if (preferences.movingTargetStats?.activeCount) {
    mechanical(
      "movingTargets",
      "dynamic checkpoint routing + one tracking mental event per relevant register; generic tracking residual retired"
    );
  }
  if (preferences.lessDeadlyGame) {
    mechanical("lessDeadlyGame", "off-board movement becomes blocked; once-per-relevant-turn mental owner");
  }
  if (preferences.moreDeadlyGame) {
    mechanical("moreDeadlyGame", "reboot damage economy uses 3 damage; no mental event");
  }
  if (preferences.upgradeWorld) {
    mechanical("upgradeWorld", "Battery/Chop Shop upgrade draws use the ordinary Energy/upgrade economy; no mental event");
  }
  if (preferences.virtualBots) {
    mechanical("virtualBots", "strategic traffic intentionally proxies players branching from the shared virtual entry; no mental event");
  }
  if (preferences.startupSpinUp) {
    mechanical("startupSpinUp", "opening routing evaluates all legal starting facings; setup-only");
  }
  if (preferences.noDocks) {
    mechanical("noDocks", "full eligible exposed edge enters ordinary routing/pruning; setup geometry only");
  }
  if (preferences.extraDocks) {
    mechanical("extraDocks", "multiple physical docking bays; setup geometry only and forced mode is a hard gate");
  }
  if (preferences.sandwichedDock) {
    mechanical("sandwichedDock", "internal dock geometry/facing policy; setup-only");
  }
  if (preferences.staggeredBoards) {
    mechanical("staggeredBoards", "board offsets are permitted, not guaranteed; resulting geometry owns gameplay");
  }
  if (preferences.recoveryRule === "dynamic_archiving") {
    mechanical("dynamicArchiving", "chronological archive state owns later reboot destination");
  } else if (preferences.recoveryRule === "home_reboot") {
    mechanical("homeReboot", "ordinary reboot procedure uses the home-dock reboot destination");
  }
  if (preferences.competitiveMode) {
    mechanical(
      "competitiveMode",
      "sequential completed-RE blocking + post-block best-P range ownership; no generic per-turn setup residual"
    );
  }
  if (preferences.payToWin || preferences.subsidizedStarts) {
    mechanical(
      preferences.subsidizedStarts ? "subsidizedStarts" : "payToWin",
      "selector-aware starting-Energy balance/pricing; setup evaluation adds no generic RE-turn difficulty"
    );
  }

  return {
    base: Number((Number(rawTurnRE) || 0).toFixed(4)),
    final: Number(adjusted.toFixed(4)),
    delta: Number((adjusted - (Number(rawTurnRE) || 0)).toFixed(4)),
    contributions,
    mechanicalRules,
    deferredRules,
    programmingPressure,
    fitPointsPerRE: RE_TURN_DIFFICULTY_FIT_POINTS_PER_RE,
    method: "completed-re-turn-plus-mechanistic-variants-v49es"
  };
}

export function buildRETurnDifficultyShadow(scenario, options = {}) {
  if (!isDevViewEnabled()) {
    return { active: false, reason: "not-dev" };
  }
  const production = scenario?.metrics?.reTurnDifficulty ?? null;
  if (!production?.active) {
    return { active: false, reason: production?.reason ?? "production-metric-unavailable" };
  }
  return {
    ...production,
    productionFinalTurnRE: Number(scenario.metrics?.difficultyTurnRE),
    productionLabel: formatActualDifficultyLabel(scenario.metrics?.difficultyTurnRE),
    variantAccounting: scenario.metrics?.reTurnVariantDifficultyAccounting ?? null,
    legacyDifficultyRaw: Number(scenario.metrics?.difficultyRaw),
    legacyDifficultyLabel: formatLegacyDifficultyLabel(scenario.metrics?.difficultyRaw),
    currentForecastEquivalentActions: Number(
      scenario.metrics?.lengthMetrics?.contributions?.forecastEquivalentActions ?? 0
    )
  };
}

export function buildRETurnDifficultyCandidatePoolShadow(selectedScenario, options = {}) {
  const candidates = getDevAcceptableCandidatePool(selectedScenario);
  if (!isDevViewEnabled() || !candidates.length) {
    return { active: false, reason: candidates.length ? "not-dev" : "candidate-pool-not-retained" };
  }
  const entries = candidates.map((candidate, index) => {
    const production = candidate.metrics?.reTurnDifficulty;
    if (!production?.active) return null;
    return {
      candidate: index + 1,
      selected: candidate === selectedScenario,
      fitScore: Number(getAcceptableScenarioScore(candidate).toFixed(2)),
      legacyDifficultyRaw: Number(candidate.metrics?.difficultyRaw),
      legacyDifficultyLabel: formatLegacyDifficultyLabel(candidate.metrics?.difficultyRaw),
      difficultyTurnRE: Number(candidate.metrics?.difficultyTurnRE),
      difficultyLabel: formatActualDifficultyLabel(candidate.metrics?.difficultyTurnRE),
      lengthRaw: Number(candidate.metrics?.lengthRaw),
      usableStarts: Number(candidate.metrics?.usableStarts?.length ?? 0),
      currentForecastEquivalentActions: Number(
        candidate.metrics?.lengthMetrics?.contributions?.forecastEquivalentActions ?? 0
      ),
      shadow: production
    };
  }).filter(Boolean);
  if (!entries.length) return { active: false, reason: "candidate-production-metrics-unavailable" };
  const composites = entries.map((entry) => Number(entry.difficultyTurnRE));
  const selectedEntry = entries.find((entry) => entry.selected) ?? null;
  return {
    active: true,
    candidateCount: entries.length,
    minComposite: Number(Math.min(...composites).toFixed(4)),
    maxComposite: Number(Math.max(...composites).toFixed(4)),
    selectedComposite: selectedEntry
      ? Number(selectedEntry.difficultyTurnRE.toFixed(4))
      : null,
    entries
  };
}


export function computePlayerTimeLoad(playerCount = 4) {
  const safePlayerCount = Math.max(1, playerCount || 4);
  // Every additional robot slows register resolution even on an open board:
  // more cards must be resolved and more ordering state must be tracked.
  // Keep that 2 -> 3 -> 4 growth explicit, then add a steeper coordination
  // cost for larger tables where interactions become harder to follow.
  const baseResolutionLoad = safePlayerCount * 1.55;
  const orderingLoad = Math.max(0, safePlayerCount - 1) * 0.55;
  const largeTableLoad = Math.max(0, safePlayerCount - 4) ** 2 * 0.55;

  return Number((baseResolutionLoad + orderingLoad + largeTableLoad).toFixed(2));
}

export function computeBoardHarshness(boardPlacements = [], pieceMap = {}) {
  const profiles = boardPlacements
    .map((placement) => pieceMap?.[placement.pieceId]?.boardProfile)
    .filter(Boolean);

  if (!profiles.length) {
    return {
      overall: 1.7,
      swinginess: 1.6,
      hazard: 1.6,
      normalized: 0.4
    };
  }

  const totals = profiles.reduce((sum, profile) => ({
    overall: sum.overall + (profile.overall ?? 1.7),
    swinginess: sum.swinginess + (profile.swinginess ?? 1.6),
    hazard: sum.hazard + (profile.bias?.hazard ?? 1.6)
  }), {
    overall: 0,
    swinginess: 0,
    hazard: 0
  });
  const count = profiles.length;
  const overall = totals.overall / count;
  const swinginess = totals.swinginess / count;
  const hazard = totals.hazard / count;
  const normalized = clamp(
    ((overall - 1.35) / 1.55) * 0.5 +
    ((swinginess - 1.25) / 1.65) * 0.3 +
    ((hazard - 1.25) / 1.65) * 0.2,
    0,
    1
  );

  return {
    overall: Number(overall.toFixed(2)),
    swinginess: Number(swinginess.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    normalized: Number(normalized.toFixed(3))
  };
}


export function meanFinite(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

export function getProgrammingPressureRouteEntries(sequence) {
  const starts = sequence?.firstLeg?.starts ?? [];
  const entries = starts
    .filter((entry) => entry?.reachable !== false && entry?.fullCourseRoute)
    .map((entry) => ({
      route: entry.fullCourseRoute,
      traffic: Number(entry.fullCourseTrafficPenalty ?? entry.trafficPenalty ?? 0) || 0
    }));
  if (entries.length) return entries;

  // Virtual/shared-entry or compatibility fallback: retain route geometry even if
  // there is no ordinary per-start array in an older saved scenario.
  const routes = sequence?.legs
    ?.flatMap((leg) => leg?.analysis?.distinctRoutes ?? [])
    ?.filter(Boolean) ?? [];
  return routes.map((route) => ({ route, traffic: 0 }));
}

export function summarizeRouteControlPressure(route) {
  const weights = PROGRAMMING_CONTROL_PRESSURE_WEIGHTS ?? {};
  const transitions = route?.transitions ?? [];
  let gearTurns = 0;
  let conveyorTurns = 0;
  let conveyorForcedSpaces = 0;
  let otherForcedSpaces = 0;
  let pusherEvents = 0;
  let oilEvents = 0;
  let currentEvents = 0;
  let portalJumps = 0;
  let randomizerStarts = 0;

  for (const transition of transitions) {
    if (transition?.gearTurned) gearTurns += 1;
    const conveyorSteps = transition?.conveyorSteps ?? [];
    conveyorTurns += conveyorSteps.filter((step) => step?.turned).length;
    conveyorForcedSpaces += conveyorSteps.length;
    otherForcedSpaces += Math.max(0, (Number(transition?.forcedDistance) || 0) - conveyorSteps.length);
    for (const event of transition?.boardEvents ?? []) {
      if (event?.type === "pusher") pusherEvents += 1;
      else if (event?.type === "oil") oilEvents += 1;
      else if (event?.type === "current") currentEvents += 1;
    }
    portalJumps += (transition?.traversed ?? []).filter((point) => point?.jump).length;
    if (transition?.randomizerAtRegisterStart || transition?.randomizedAction) randomizerStarts += 1;
  }

  const controlUnits =
    gearTurns * (weights.gearTurn ?? 1) +
    conveyorTurns * (weights.conveyorTurn ?? 0.9) +
    conveyorForcedSpaces * (weights.conveyorForcedSpace ?? 0.16) +
    otherForcedSpaces * (weights.otherForcedSpace ?? 0.1) +
    pusherEvents * (weights.pusherEvent ?? 0.65) +
    oilEvents * (weights.oilEvent ?? 0.45) +
    currentEvents * (weights.currentEvent ?? 0.4) +
    portalJumps * (weights.portalJump ?? 0.55) +
    randomizerStarts * (weights.randomizerStart ?? 0.8);

  return {
    controlUnits,
    gearTurns,
    conveyorTurns,
    conveyorForcedSpaces,
    otherForcedSpaces,
    pusherEvents,
    oilEvents,
    currentEvents,
    portalJumps,
    randomizerStarts
  };
}

export function computeProgrammingPressureProfile(sequence) {
  const entries = getProgrammingPressureRouteEntries(sequence);
  if (!entries.length) {
    return {
      active: false,
      routeCount: 0,
      averageActions: 0,
      hazardPerRegister: 0,
      trafficPerRegister: 0,
      controlPerRegister: 0,
      cardPerRegister: 0,
      againRate: 0,
      hazardPressure: 0,
      trafficPressure: 0,
      controlPressure: 0,
      cardPressure: 0,
      planningPressure: 0,
      timedPressure: 0,
      method: "route-hazard-traffic-control-v38"
    };
  }

  const actionCounts = [];
  const hazardTotals = [];
  const trafficTotals = [];
  const controlTotals = [];
  const cardTotals = [];
  const againRates = [];
  const controlDetails = [];

  for (const entry of entries) {
    const route = entry.route;
    const actions = Math.max(1, Number(route?.actions ?? route?.transitions?.length) || 1);
    const control = summarizeRouteControlPressure(route);
    const cardPenalty = Math.max(
      0,
      (Number(route?.cardAvailabilityPenalty) || 0) +
      (Number(route?.programPlausibilityPenalty) || 0) +
      (Number(route?.approximateCardPlausibilityPenalty) || 0)
    );
    const againUses = (route?.transitions ?? []).filter((transition) => (
      transition?.programCard === "AGAIN" ||
      transition?.programCardId === "AGAIN" ||
      transition?.approximateProgramCard === "AGAIN"
    )).length;

    actionCounts.push(actions);
    hazardTotals.push(Math.max(0, Number(route?.hazard) || 0));
    trafficTotals.push(Math.max(0, Number(entry.traffic) || 0));
    controlTotals.push(control.controlUnits);
    cardTotals.push(cardPenalty);
    againRates.push(againUses / actions);
    controlDetails.push(control);
  }

  const averageActions = meanFinite(actionCounts);
  const hazardPerRegister = meanFinite(hazardTotals.map((value, index) => value / actionCounts[index]));
  let trafficPerRegister = meanFinite(trafficTotals.map((value, index) => value / actionCounts[index]));
  // Some route families store only the aggregate selection traffic value.
  if (!(trafficPerRegister > 0)) {
    const aggregateTraffic = Number(sequence?.firstLeg?.summary?.fullCourseTraffic?.averagePenalty);
    if (Number.isFinite(aggregateTraffic) && averageActions > 0) {
      trafficPerRegister = aggregateTraffic / averageActions;
    }
  }
  const controlPerRegister = meanFinite(controlTotals.map((value, index) => value / actionCounts[index]));
  const cardPerRegister = meanFinite(cardTotals.map((value, index) => value / actionCounts[index]));
  const againRate = meanFinite(againRates);

  // These normalizers only put unlike evidence on a common 0..~1 scale. They are
  // not difficulty calibration constants; the later calibration pass should fit
  // the variant response to this evidence rather than replacing the evidence.
  const hazardPressure = clamp(hazardPerRegister / 1.15, 0, 1.5);
  const trafficPressure = clamp(trafficPerRegister / 4.25, 0, 1.5);
  const controlPressure = clamp(controlPerRegister / 0.42, 0, 1.5);
  const cardPressure = clamp(cardPerRegister / 0.28 + againRate * 0.8, 0, 1.25);

  // Random/limited programming rules are most consequential where robot traffic,
  // hazards, and factory-controlled movement make an imperfect program costly.
  const planningPressure = clamp(
    hazardPressure * 0.32 +
    trafficPressure * 0.34 +
    controlPressure * 0.27 +
    cardPressure * 0.07,
    0,
    1.5
  );
  // Timers lean a little more heavily on immediate control/traffic reasoning.
  const timedPressure = clamp(
    hazardPressure * 0.24 +
    trafficPressure * 0.35 +
    controlPressure * 0.35 +
    cardPressure * 0.06,
    0,
    1.5
  );

  const detailTotals = {
    gearTurns: meanFinite(controlDetails.map((item) => item.gearTurns)),
    conveyorTurns: meanFinite(controlDetails.map((item) => item.conveyorTurns)),
    forcedSpaces: meanFinite(controlDetails.map((item) => item.conveyorForcedSpaces + item.otherForcedSpaces)),
    pusherEvents: meanFinite(controlDetails.map((item) => item.pusherEvents)),
    portalJumps: meanFinite(controlDetails.map((item) => item.portalJumps))
  };

  return {
    active: true,
    routeCount: entries.length,
    averageActions: Number(averageActions.toFixed(2)),
    hazardPerRegister: Number(hazardPerRegister.toFixed(3)),
    trafficPerRegister: Number(trafficPerRegister.toFixed(3)),
    controlPerRegister: Number(controlPerRegister.toFixed(3)),
    cardPerRegister: Number(cardPerRegister.toFixed(3)),
    againRate: Number(againRate.toFixed(3)),
    hazardPressure: Number(hazardPressure.toFixed(3)),
    trafficPressure: Number(trafficPressure.toFixed(3)),
    controlPressure: Number(controlPressure.toFixed(3)),
    cardPressure: Number(cardPressure.toFixed(3)),
    planningPressure: Number(planningPressure.toFixed(3)),
    timedPressure: Number(timedPressure.toFixed(3)),
    averageGearTurns: Number(detailTotals.gearTurns.toFixed(2)),
    averageConveyorTurns: Number(detailTotals.conveyorTurns.toFixed(2)),
    averageForcedSpaces: Number(detailTotals.forcedSpaces.toFixed(2)),
    averagePusherEvents: Number(detailTotals.pusherEvents.toFixed(2)),
    averagePortalJumps: Number(detailTotals.portalJumps.toFixed(2)),
    method: "route-hazard-traffic-control-v38"
  };
}

export function computeVariantDifficultyAccounting(raw, preferences = {}, sequence = null) {
  const programmingPressure = computeProgrammingPressureProfile(sequence);
  let adjusted = Number(raw) || 0;
  const contributions = [];
  const mechanicalRules = [];
  const add = (id, delta, kind = "residual", evidence = null) => {
    const value = Number(delta) || 0;
    if (Math.abs(value) > 0.0001) adjusted += value;
    contributions.push({
      id,
      kind,
      delta: Number(value.toFixed(2)),
      evidence
    });
  };
  const scale = (id, multiplier, kind = "residual", evidence = null) => {
    const before = adjusted;
    adjusted *= multiplier;
    contributions.push({
      id,
      kind,
      delta: Number((adjusted - before).toFixed(2)),
      multiplier: Number(multiplier.toFixed(4)),
      evidence
    });
  };
  const mechanical = (id, note) => mechanicalRules.push({ id, note });

  // These damage/recovery rules are already reflected in intrinsic hazards,
  // reboot costs, and/or robot traffic. v38 removes their old generic course-wide
  // multipliers so the same danger is not paid twice.
  if (preferences.lessSpammyGame) mechanical("lessSpammyGame", "hazard/traffic/reboot model");
  if (preferences.criticalSpam) mechanical(
    "criticalSpam",
    "damage-economy 20/80 played-SPAM persistence approximation"
  );
  if (preferences.criticalHaywire) mechanical(
    "criticalHaywire",
    "damage-economy hand-size effect"
  );
  if (preferences.permanentShutdown && preferences.criticalSpam) mechanical(
    "permanentShutdown",
    "damage economy: persistent-SPAM supply-RE pressure curve"
  );
  if (preferences.cuttingFloor) mechanical("cuttingFloor", "laser damage model");
  if (preferences.flamingOil) mechanical("flamingOil", "oil hazard model");
  if (preferences.setToKill) mechanical("setToKill", "robot-laser damage economy: double damage per hit");
  if (preferences.setToStun) mechanical("setToStun", "robot-laser damage economy: SPAM suppressed, Haywire unchanged");
  if (preferences.repairStations) mechanical("repairStations", "checkpoint repair route value");

  if (preferences.lighterGame) {
    mechanical("lighterGame", "Energy/upgrade economy removed; no legacy raw difficulty multiplier");
  }

  if (preferences.lessForeshadowing) {
    mechanical(
      "lessForeshadowing",
      "card model: fresh full programming deck each turn; previous-turn depletion off; base scarcity alpha 1.0"
    );
  }
  if (preferences.classicSharedDeck) {
    mechanical(
      "classicSharedDeck",
      "card model: normal single-player hypergeometry retained; player-count uncertainty increases scarcity alpha; damage SPAM enters hand at next programming boundary"
    );
  }
  if (preferences.factoryRejects) {
    mechanical("factoryRejects", "card model: actual programming hand size 7");
  }
  if (preferences.actFastMode) {
    const timerWeight = getActFastPressureWeight(preferences.actFastMode);
    add(
      "actFast",
      programmingPressure.timedPressure * 6.2 * timerWeight,
      "legacy-act-fast-programming-pressure",
      {
        mode: preferences.actFastMode,
        timerWeight,
        timedPressure: programmingPressure.timedPressure
      }
    );
  }
  if (preferences.repulsorOverdrive) {
    mechanical("repulsorOverdrive", "exact doubled-bounce routing + mental owner");
  }
  if (preferences.hazardousFlags) {
    mechanical("hazardousFlags", "checkpoint-covered feature mechanics + mental owner");
  }
  if (preferences.movingTargetStats?.activeCount) {
    mechanical(
      "movingTargets",
      "dynamic checkpoint routing + register-level mental owner; residual tracking premium retired"
    );
  }

  if (preferences.competitiveMode) {
    mechanical("competitiveMode", "setup strategy owned by Competitive completed-RE blocking/selection; no legacy raw difficulty residue");
  }
  if (preferences.payToWin || preferences.subsidizedStarts) {
    mechanical(
      preferences.subsidizedStarts ? "subsidizedStarts" : "payToWin",
      "starting-Energy selector/pricing ownership; no legacy raw difficulty residue"
    );
  }

  return {
    base: Number((Number(raw) || 0).toFixed(2)),
    final: Number(adjusted.toFixed(2)),
    delta: Number((adjusted - (Number(raw) || 0)).toFixed(2)),
    contributions,
    mechanicalRules,
    programmingPressure,
    method: "mechanical-variant-accounting-v49es"
  };
}

export function applyVariantDifficultyModifiers(raw, preferences = {}, sequence = null) {
  return computeVariantDifficultyAccounting(raw, preferences, sequence).final;
}
