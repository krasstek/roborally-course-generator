// Robo Rally Course Randomizer - saved courses: serialisation, presentation snapshot and shell, reload (hydrateScenarioFromSnapshot) and canonical evaluation
import { recomputeFirstLegPressure } from "../../analyze.js";
import { buildResolvedMap } from "../../board.js";
import { buildCourseNotesHtml } from "../../course-notes.js";
import { VARIANT_DEFINITIONS, applyVariantAnalysisOptions } from "../../variants.js";
import { analyzeFullCourseCooperativeSafe, clearAnalysisCachesSafe } from "./analysis-api.js";
import {
  analyzeFlagSequence,
  buildRouteAwareBatteryScoringOptions
} from "./analysis-orchestration.js";
import {
  buildDockSummaries,
  getDockPlacementsFromScenarioPlacements,
  orientSandwichedDockStartsTowardCheckpoint
} from "./board-layout.js";
import { applyFlagOverrides, filterStartsForGoals, getPlayableCheckpoints } from "./checkpoints.js";
import { classifyCandidate } from "./classification.js";
import {
  NORMAL_EFFECTIVE_RE_OUTLIER_Z,
  NORMAL_FULL_COURSE_TRAFFIC_PASSES,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
} from "./config.js";
import { getGenerationModeProfile, getScenarioGenerationMode } from "./generation-modes.js";
import {
  formatDifficultyLabel,
  formatLengthLabel,
  getProductionLengthTurnIndex,
  presentationNumber
} from "./labels.js";
import { buildBoardRects } from "./layout-geometry.js";
import { collectMovingTargetReentryMarkers } from "./moving-targets.js";
import { normalizeOverlayMode } from "./preferences.js";
import { placeHomeRebootTokens } from "./reboot-tokens.js";
import {
  GENERATION_COOPERATIVE_SEARCH_CHECK_POPS,
  GENERATION_COOPERATIVE_SEARCH_SLICE_MS,
  GENERATION_COOPERATIVE_YIELD_INTERVAL_MS,
  makeGenerationStopRequestedError,
  nextEventLoopTurn
} from "./scheduling.js";
import {
  computeCourseReachableStarts,
  formatStartBalanceLabel,
  getActivePruningStarts,
  getNormalRegisterDurationGuardrail,
  getNormalResidualBalanceSelectionPenalty,
  getStartBalanceProfile,
  normalizeStartBalance,
  rankNormalEffectiveREOutliers,
  summarizeNormalRetainedREBalance,
  summarizePostBalanceStartResiduals
} from "./start-balance.js";
import { getRouteAnalysisVariantOptions, isVariantForced } from "./variant-availability.js";
import { buildVirtualRobotStarts, hideVirtualFlagZeroFeature } from "./virtual-bots.js";

export const SAVED_SCENARIO_APP_ID = "roborally-course-generator";
export const SAVED_SCENARIO_SCHEMA_VERSION = 1;

export function buildScenarioPresentationSnapshot(scenario) {
  const metrics = scenario?.metrics;
  if (!metrics) return null;
  const lengthMetrics = metrics.lengthMetrics ?? {};
  return {
    difficultyTurnRE: metrics.difficultyTurnRE ?? null,
    difficultyTurnBaseRE: metrics.difficultyTurnBaseRE ?? null,
    difficultyRaw: metrics.difficultyRaw ?? null,
    lengthRaw: metrics.lengthRaw ?? null,
    lengthFitRaw: metrics.lengthFitRaw ?? null,
    lengthWallClockTurnIndex: metrics.lengthWallClockTurnIndex ?? null,
    lengthSemanticUnit: metrics.lengthSemanticUnit ?? null,
    difficultyFit: metrics.difficultyFit ?? 0,
    difficultyDirection: metrics.difficultyDirection ?? "matched",
    difficultyTargetBand: metrics.difficultyTargetBand ?? null,
    lengthFit: metrics.lengthFit ?? 0,
    lengthDirection: metrics.lengthDirection ?? "matched",
    lengthTargetBand: metrics.lengthTargetBand ?? null,
    fitScore: metrics.fitScore ?? null,
    softFitLimit: metrics.softFitLimit ?? null,
    acceptable: Boolean(metrics.acceptable),
    targetAcceptance: metrics.targetAcceptance ? { ...metrics.targetAcceptance } : null,
    exactTargetMatch: metrics.exactTargetMatch ?? null,
    hardFailures: Array.isArray(metrics.hardFailures) ? [...metrics.hardFailures] : [],
    softFailures: Array.isArray(metrics.softFailures) ? [...metrics.softFailures] : [],
    lengthMetrics: {
      inputs: {
        totalActionLoad: lengthMetrics.inputs?.totalActionLoad ?? null
      },
      contributions: {
        forecastEquivalentActions: lengthMetrics.contributions?.forecastEquivalentActions ?? null
      },
      productionExtentOwner: lengthMetrics.productionExtentOwner
        ? {
          expectedPlayProgrammingTurns:
            lengthMetrics.productionExtentOwner.expectedPlayProgrammingTurns ?? null
        }
        : null,
      productionWallClockOwner: lengthMetrics.productionWallClockOwner
        ? {
          effectiveWallClockTurnIndex:
            lengthMetrics.productionWallClockOwner.effectiveWallClockTurnIndex ?? null
        }
        : null
    },
    openingLegAnticlimax: metrics.openingLegAnticlimax ?? null,
    intermediateCheckpointPacing: metrics.intermediateCheckpointPacing ?? null,
    finalLegAnticlimax: metrics.finalLegAnticlimax ?? null,
    routedCheckpointPacingExpectation: metrics.routedCheckpointPacingExpectation ?? null,
    meaningfulBoardUse: metrics.meaningfulBoardUse ?? null,
    sandwichedDockUse: metrics.sandwichedDockUse ?? null
  };
}

export function getHydratedPresentationAnalysisStatus(sequence, metrics, checkpointCount) {
  // Reload presentation completeness is about whether the current analysis ran
  // far enough to rebuild the player-facing difficulty/length presentation. It
  // is NOT an acceptance test. A completed reanalysis may legitimately find a
  // route/start/fairness problem; treating those findings as "analysis
  // incomplete" made saved-course alerts conflate a result with a failed run.
  if (!sequence?.firstLeg) return { complete: false, reason: "missing-first-leg-analysis" };
  if (!metrics) return { complete: false, reason: "missing-classification" };

  const legs = Array.isArray(sequence.legs) ? sequence.legs : [];
  const expectedLegs = Math.max(1, Number(checkpointCount) || 1);
  if (legs.length < expectedLegs) {
    return { complete: false, reason: `missing-leg-analysis-${legs.length}-of-${expectedLegs}` };
  }
  if (!Array.isArray(metrics.usableStarts)) {
    return { complete: false, reason: "missing-usable-start-summary" };
  }
  if (!Number.isFinite(presentationNumber(metrics.difficultyTurnRE))) {
    return { complete: false, reason: "missing-production-difficulty" };
  }
  if (!Number.isFinite(getProductionLengthTurnIndex(metrics))) {
    return { complete: false, reason: "missing-production-length" };
  }

  return { complete: true, reason: "complete" };
}

export function getReloadRequestedTargetLabel(preferences = {}) {
  const difficultyRequested = preferences.difficulty && preferences.difficulty !== "any";
  const lengthRequested = preferences.length && preferences.length !== "any";
  if (difficultyRequested && lengthRequested) {
    return `${formatDifficultyLabel(preferences.difficulty)} / ${formatLengthLabel(preferences.length)}`;
  }
  if (difficultyRequested) return `${formatDifficultyLabel(preferences.difficulty)} difficulty`;
  if (lengthRequested) return `${formatLengthLabel(preferences.length)} length`;
  return null;
}

export function getSavedGenerationDisposition(snapshot = {}) {
  const savedMetrics = snapshot.presentationMetrics ?? null;
  const explicitBestMatch = typeof snapshot.generationBestMatch === "boolean"
    ? snapshot.generationBestMatch
    : null;
  const terminationReason = snapshot.generationTerminationReason
    ?? snapshot.generationDiagnostics?.terminationReason
    ?? null;
  const fitScore = Number(savedMetrics?.fitScore);
  const softFitLimit = Number(savedMetrics?.softFitLimit);
  const inferredAcceptableFromFit = Number.isFinite(fitScore) && Number.isFinite(softFitLimit)
    ? fitScore <= softFitLimit
    : null;
  const savedAcceptable = typeof snapshot.generationAcceptedAtSave === "boolean"
    ? snapshot.generationAcceptedAtSave
    : typeof savedMetrics?.acceptable === "boolean"
      ? savedMetrics.acceptable
      : terminationReason === "extra-docks-fallback"
        ? false
        : terminationReason === "accepted"
          ? true
          : inferredAcceptableFromFit !== null
            ? inferredAcceptableFromFit
            : explicitBestMatch === true
              ? false
              : null;
  const bestMatch = explicitBestMatch !== null
    ? explicitBestMatch
    : savedAcceptable !== null
      ? !savedAcceptable
      : Boolean(terminationReason && terminationReason !== "accepted");

  return {
    bestMatch: Boolean(bestMatch),
    acceptedAtSave: savedAcceptable === null ? null : Boolean(savedAcceptable),
    terminationReason
  };
}

export function serializeScenario(scenario) {
  return {
    savedScenarioApp: SAVED_SCENARIO_APP_ID,
    savedScenarioSchema: SAVED_SCENARIO_SCHEMA_VERSION,
    preferences: scenario.preferences,
    effectiveTargetPreferences: scenario.effectiveTargetPreferences ?? null,
    // Every registry rule the course was generated with. The explicit fields
    // below predate this and still take precedence for older readers.
    ...Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, Boolean(scenario[variant.id])])),
    actFast: scenario.actFast,
    actFastMode: scenario.actFastMode,
    competitiveMode: scenario.competitiveMode,
    payToWin: scenario.payToWin,
    subsidizedStarts: Boolean(scenario.subsidizedStarts),
    extraDocks: scenario.extraDocks,
    noDocks: scenario.noDocks,
    sandwichedDock: scenario.sandwichedDock,
    noDockEdge: scenario.noDockEdge,
    noDockEdges: scenario.noDockEdges ?? (scenario.noDockEdge ? [scenario.noDockEdge] : []),
    noDockStarts: scenario.noDockStarts,
    factoryRejects: scenario.factoryRejects,
    recoveryRule: scenario.recoveryRule,
    lessDeadlyGame: scenario.lessDeadlyGame,
    lessSpammyGame: scenario.lessSpammyGame,
    criticalSpam: scenario.criticalSpam,
    criticalHaywire: scenario.criticalHaywire,
    permanentShutdown: scenario.permanentShutdown,
    startupSpinUp: scenario.startupSpinUp,
    virtualBots: scenario.virtualBots,
    moreDeadlyGame: scenario.moreDeadlyGame,
    homeReboot: scenario.homeReboot,
    cuttingFloor: scenario.cuttingFloor,
    flamingOil: scenario.flamingOil,
    repulsorOverdrive: scenario.repulsorOverdrive,
    upgradeWorld: scenario.upgradeWorld,
    lighterGame: scenario.lighterGame,
    classicSharedDeck: scenario.classicSharedDeck,
    hazardousFlags: scenario.hazardousFlags,
    repairStations: scenario.repairStations,
    movingTargets: scenario.movingTargets,
    staggeredBoards: scenario.staggeredBoards,
    lessForeshadowing: scenario.lessForeshadowing,
    placements: scenario.placements,
    checkpoints: scenario.checkpoints,
    rebootTokens: scenario.rebootTokens,
    activeStarts: scenario.activeStarts ?? [],
    constructionFingerprint: scenario.constructionFingerprint ?? null,
    // Preserve the original generation disposition separately from whatever a
    // future evaluator concludes when this exact saved layout is reanalyzed.
    generationBestMatch: Boolean(scenario.generationBestMatch),
    generationAcceptedAtSave: Boolean(scenario.metrics?.acceptable),
    generationTerminationReason: scenario.generationTerminationReason ??
      scenario.generationDiagnostics?.terminationReason ?? null,
    // Preserve accepted-course diagnostics across refresh. These values describe
    // how this already-generated course was found/evaluated; hydration should not
    // erase that history merely because it reconstructs route objects in memory.
    generationDiagnostics: scenario.generationDiagnostics ?? null,
    constructionGuidancePrior: scenario.constructionGuidancePrior ?? null,
    constructionGuidanceStages: scenario.constructionGuidanceStages ?? null,
    guidanceLevel: scenario.guidanceLevel ?? null,
    variantComplexityBudget: scenario.variantComplexityBudget ?? null,
    variantComplexityUsed: scenario.variantComplexityUsed ?? null,
    blockedStartIndices: scenario.blockedStartIndices ?? [],
    validatedStartIndices: scenario.validatedStartIndices ?? [],
    analysisStartIndices: scenario.analysisStartIndices ?? (scenario.metrics?.usableStarts ?? []).map((entry) => entry.index),
    startDisposition: scenario.startDisposition ?? null,
    startPricing: (scenario.payToWin || scenario.subsidizedStarts)
      ? (scenario.sequence?.firstLeg?.starts ?? []).map((entry) => ({
        index: entry.index,
        energyCost: entry.energyCost ?? null,
        earlyUnavailable: Boolean(entry.earlyUnavailable),
        lateEnergyCost: entry.lateEnergyCost ?? null,
        lateUnavailable: Boolean(entry.lateUnavailable),
        payToWinUnavailable: Boolean(entry.payToWinUnavailable),
        lateAdjustedScore: entry.lateAdjustedScore ?? null
      }))
      : null,
    payToWinPricing: (scenario.payToWin || scenario.subsidizedStarts) ? (scenario.sequence?.firstLeg?.summary?.payToWin ?? null) : null,
    // v49ff reload fidelity: Normal start availability is part of the accepted
    // saved course, not a fresh choice to make on every page load. Persist the
    // accepted balance summary when available so future reloads can reproduce
    // both the retained set and its diagnostics exactly. Older saves can still
    // reconstruct the retained set from startDisposition.normalPrunedIndices.
    normalStartBalance: scenario.sequence?.firstLeg?.summary?.normalStartBalance ?? null,
    // Preflight itself is not rerun during hydration, but its resolved production
    // context is part of the accepted analysis. Persist it so route-aware Energy
    // scoring and Dev diagnostics do not fall back to legacy tile rewards after a
    // refresh. This is metadata only; route reconstruction still reruns normally.
    coursePreflight: scenario.sequence?.firstLeg?.summary?.coursePreflight ?? null,
    // Reporting fidelity: this label describes the route foundation that produced
    // the accepted course. Hydration may infer a generic generation-mode label,
    // but Copy Summary should reproduce the original accepted analysis verbatim.
    contextualSearchMode: scenario.sequence?.firstLeg?.summary?.contextualSearchMode ?? null,
    // Reload safety: retain a compact accepted presentation projection and the
    // player-facing Course Notes. Reconstruction still reruns normally; these are
    // used only if authoritative routing cannot be rebuilt completely after refresh.
    presentationMetrics: buildScenarioPresentationSnapshot(scenario),
    courseNotesHtml: buildCourseNotesHtml(scenario, [], { limit: 3 }),
    attempts: scenario.attempts ?? 0
  };
}

export function buildSavedScenarioPresentationShell(assets, snapshot, status = "pending") {
  if (!snapshot?.placements?.length || !snapshot?.checkpoints?.length || !snapshot?.preferences) {
    return null;
  }
  const { pieceMap, imageMap } = assets;
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const boardPlacements = placements.filter((placement) => {
    const kind = pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  if (!boardPlacements.length) return null;
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, pieceMap);
  const boardRects = buildBoardRects(boardPlacements, pieceMap);
  const recoveryRule = snapshot.recoveryRule ?? "reboot_tokens";
  const virtualBots = Boolean(snapshot.virtualBots);
  const noDocks = Boolean(snapshot.noDocks);
  const sandwichedDock = Boolean(snapshot.sandwichedDock);
  const startupSpinUp = Boolean(snapshot.startupSpinUp);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const movingTargets = Boolean(snapshot.movingTargets);
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const flagZero = virtualBots ? checkpoints[0] : null;
  const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
  let goalTileMap;
  if (virtualBots) {
    const withFlagZero = applyFlagOverrides(tileMap, [flagZero], { hazardousFlags, movingTargets: false });
    goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
    goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
  } else {
    goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags, movingTargets });
  }
  const noDockStarts = snapshot.noDockStarts || [];
  const rawResolvedActiveStarts = virtualBots
    ? buildVirtualRobotStarts(flagZero, snapshot.preferences.playerCount, startupSpinUp)
    : noDocks
      ? filterStartsForGoals(noDockStarts, checkpoints)
      : filterStartsForGoals(starts, checkpoints);
  const resolvedActiveStarts = (!virtualBots && sandwichedDock && !startupSpinUp)
    ? orientSandwichedDockStartsTowardCheckpoint(
      rawResolvedActiveStarts,
      dockPlacements,
      pieceMap,
      playableCheckpoints[0]
    )
    : rawResolvedActiveStarts;
  const activeStarts = Array.isArray(snapshot.activeStarts) && snapshot.activeStarts.length
    ? snapshot.activeStarts
    : resolvedActiveStarts;
  const preferredUsableIndices = Array.isArray(snapshot.validatedStartIndices) && snapshot.validatedStartIndices.length
    ? snapshot.validatedStartIndices
    : Array.isArray(snapshot.analysisStartIndices) && snapshot.analysisStartIndices.length
      ? snapshot.analysisStartIndices
      : activeStarts.map((_, index) => index);
  const usableIndexSet = new Set(preferredUsableIndices.filter((index) => Number.isInteger(index)));
  // v49an reload presentation: priced-start saves already persist the accepted Energy
  // labels/unavailability fields. Put those fields onto the provisional shell too, so
  // stopping or failing reanalysis does not erase Pay to Win/Subsidized Starts costs.
  const savedPricingByIndex = new Map(
    Array.isArray(snapshot.startPricing)
      ? snapshot.startPricing.map((entry) => [entry.index, entry])
      : []
  );
  const placeholderStarts = activeStarts.map((start, index) => ({
    index,
    start,
    reachable: usableIndexSet.has(index),
    routes: [],
    selectedRouteIndex: null,
    selectedRoute: null,
    fullCourseRoutes: [],
    fullCourseRoute: null,
    fullCourseRouteIndex: null,
    fullCourseTrafficPenalty: 0,
    ...(savedPricingByIndex.get(index) ?? {})
  }));
  const placeholderSummary = {
    outliers: [],
    contextualSearchMode: snapshot.contextualSearchMode ?? null,
    ...(snapshot.payToWinPricing ? { payToWin: snapshot.payToWinPricing } : {})
  };
  const firstLeg = {
    starts: placeholderStarts,
    summary: placeholderSummary,
    expectedLegAnalyses: []
  };
  const legs = playableCheckpoints.map((_, index) => ({
    from: index === 0 ? "dock" : index,
    to: index + 1,
    analysis: index === 0 ? firstLeg : { starts: placeholderStarts, summary: {} }
  }));
  const sequence = {
    starts: activeStarts,
    firstLeg,
    legs,
    movingTargetTimelines: [],
    summary: {}
  };
  const savedPresentationMetrics = snapshot.presentationMetrics ?? null;
  const metrics = {
    ...(savedPresentationMetrics ?? {}),
    reachableStarts: activeStarts.length,
    usableStarts: [...usableIndexSet].sort((a, b) => a - b).map((index) => ({ index })),
    hardFailures: []
  };
  const snapshotNoDockEdges = snapshot.noDockEdges ?? (snapshot.noDockEdge ? [snapshot.noDockEdge] : []);
  const rebootTokens = snapshot.rebootTokens || (recoveryRule === "home_reboot"
    ? placeHomeRebootTokens(dockPlacements, pieceMap, activeStarts, tileMap, checkpoints, { lessDeadlyGame })
    : []);
  const movingTargetTimelines = [];
  const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(tileMap, playableCheckpoints, movingTargets);
  const hydrationPresentationFallback = Boolean(savedPresentationMetrics);
  const hydrationPresentationUnavailable = !savedPresentationMetrics;
  const savedGenerationDisposition = getSavedGenerationDisposition(snapshot);

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    dockPlacements,
    dockSummaries: buildDockSummaries(boardPlacements, dockPlacements, pieceMap),
    checkpoints,
    virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
    rebootTokens,
    goalTileMap,
    activeStarts,
    blockedStartIndices: Array.isArray(snapshot.blockedStartIndices) ? snapshot.blockedStartIndices : [],
    validatedStartIndices: [...usableIndexSet].sort((a, b) => a - b),
    analysisStartIndices: Array.isArray(snapshot.analysisStartIndices) ? snapshot.analysisStartIndices : activeStarts.map((_, index) => index),
    startDisposition: snapshot.startDisposition ?? null,
    playerCount: snapshot.preferences.playerCount,
    actFast: Boolean(snapshot.actFast),
    actFastMode: snapshot.actFastMode ?? null,
    competitiveMode: Boolean(snapshot.competitiveMode),
    payToWin: Boolean(snapshot.payToWin),
    subsidizedStarts: Boolean(snapshot.subsidizedStarts),
    noDocks,
    sandwichedDock,
    noDockEdge: snapshot.noDockEdge ?? snapshotNoDockEdges[0] ?? null,
    noDockEdges: snapshotNoDockEdges,
    noDockStarts,
    extraDocks: Boolean(snapshot.extraDocks),
    factoryRejects: Boolean(snapshot.factoryRejects),
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame: Boolean(snapshot.lessSpammyGame),
    criticalSpam: Boolean(snapshot.criticalSpam),
    criticalHaywire: Boolean(snapshot.criticalHaywire),
    permanentShutdown: Boolean(snapshot.permanentShutdown),
    startupSpinUp,
    virtualBots,
    homeReboot: Boolean(snapshot.homeReboot || recoveryRule === "home_reboot"),
    cuttingFloor: Boolean(snapshot.cuttingFloor),
    moreDeadlyGame: Boolean(snapshot.moreDeadlyGame),
    flamingOil: Boolean(snapshot.flamingOil),
    repulsorOverdrive: Boolean(snapshot.repulsorOverdrive),
    repairStations: Boolean(snapshot.repairStations),
    upgradeWorld: Boolean(snapshot.upgradeWorld),
    lighterGame: Boolean(snapshot.lighterGame),
    classicSharedDeck: Boolean(snapshot.classicSharedDeck),
    hazardousFlags,
    movingTargets,
    staggeredBoards: Boolean(snapshot.staggeredBoards),
    lessForeshadowing: Boolean(snapshot.lessForeshadowing),
    mainBoardIds: boardPlacements.map((placement) => placement.pieceId),
    mainRotations: boardPlacements.map((placement) => placement.rotation),
    boardCount: boardPlacements.length,
    boardRects,
    generationDiagnostics: snapshot.generationDiagnostics ?? null,
    generationBestMatch: savedGenerationDisposition.bestMatch,
    generationAcceptedAtSave: savedGenerationDisposition.acceptedAtSave,
    generationTerminationReason: savedGenerationDisposition.terminationReason,
    constructionFingerprint: snapshot.constructionFingerprint ?? null,
    constructionGuidancePrior: snapshot.constructionGuidancePrior ?? null,
    constructionGuidanceStages: snapshot.constructionGuidanceStages ?? null,
    guidanceLevel: snapshot.guidanceLevel ?? 0,
    variantComplexityBudget: snapshot.variantComplexityBudget ?? 0,
    variantComplexityUsed: snapshot.variantComplexityUsed ?? 0,
    sequence,
    metrics,
    savedPresentationMetrics,
    savedCourseNotesHtml: snapshot.courseNotesHtml ?? null,
    hydrationPresentationFallback,
    hydrationPresentationUnavailable,
    hydrationPresentationStatusReason: status === "pending" ? "reanalysis-pending" : "saved-presentation-shell",
    hydrationReanalysisPending: status === "pending",
    hydrationReanalysisStopped: status === "stopped",
    hydrationReanalysisFailed: status === "failed",
    movingTargetStats: metrics.movingTargetStats ?? null,
    movingTargetTimelines,
    movingTargetReentryMarkers,
    effectiveTargetPreferences: snapshot.effectiveTargetPreferences ?? null,
    preferences: {
      ...snapshot.preferences,
      overlayMode: normalizeOverlayMode(snapshot.preferences.overlayMode),
      actFast: Boolean(snapshot.actFast),
      actFastMode: snapshot.actFastMode ?? null,
      competitiveMode: Boolean(snapshot.competitiveMode),
      payToWin: Boolean(snapshot.payToWin),
      subsidizedStarts: Boolean(snapshot.subsidizedStarts),
      noDocks,
      sandwichedDock,
      extraDocks: Boolean(snapshot.extraDocks),
      factoryRejects: Boolean(snapshot.factoryRejects),
      recoveryRule,
      flagCount: playableCheckpoints.length,
      classicSharedDeck: Boolean(snapshot.classicSharedDeck),
      homeReboot: Boolean(snapshot.homeReboot || recoveryRule === "home_reboot"),
      cuttingFloor: Boolean(snapshot.cuttingFloor),
      startupSpinUp,
      virtualBots,
      upgradeWorld: Boolean(snapshot.upgradeWorld),
      hazardousFlags,
      movingTargets,
      lessSpammyGame: Boolean(snapshot.lessSpammyGame),
      criticalSpam: Boolean(snapshot.criticalSpam),
      criticalHaywire: Boolean(snapshot.criticalHaywire),
      permanentShutdown: Boolean(snapshot.permanentShutdown),
      staggeredBoards: Boolean(snapshot.staggeredBoards)
    },
    attempts: snapshot.attempts ?? 0
  };
}

export function getSavedNormalHydrationPrunedIndices(snapshot, activeStartCount, playerCount) {
  if (
    snapshot?.competitiveMode ||
    snapshot?.payToWin ||
    snapshot?.subsidizedStarts ||
    snapshot?.virtualBots
  ) {
    return null;
  }

  const source = snapshot?.startDisposition?.normalPrunedIndices;
  if (!Array.isArray(source)) return null;

  const pruned = [...new Set(source
    .filter((index) => Number.isInteger(index) && index >= 0 && index < activeStartCount)
  )].sort((left, right) => left - right);
  const retainedCount = Math.max(0, activeStartCount - pruned.length);
  if (retainedCount < Math.max(1, Number(playerCount) || 1)) return null;
  return pruned;
}

export function restoreSavedNormalStartDispositionForHydration(
  sequence,
  tileMap,
  playerCount,
  savedPrunedIndices,
  options = {},
  savedBalance = null
) {
  if (!sequence?.firstLeg || !Array.isArray(savedPrunedIndices)) return sequence;

  const excludedIndices = new Set(savedPrunedIndices);
  const savedRemovalByIndex = new Map(
    (savedBalance?.pressurePruned ?? []).map((entry) => [entry.index, entry])
  );
  const pressurePruned = savedPrunedIndices.map((index) => {
    const saved = savedRemovalByIndex.get(index);
    if (saved) return saved;
    const entry = sequence.firstLeg.starts?.find((item) => item.index === index);
    return {
      index,
      score: Number(entry?.normalFairnessEffectiveRE ?? entry?.balanceScore ?? 0),
      actions: Number(entry?.normalFairnessRegisterCount ?? entry?.bestActions ?? 0),
      pass: null,
      diagnostics: {
        normalBalancePruned: true,
        hydrationSavedDisposition: true,
        stage: "saved-course-reconstruction",
        removalReason: "persisted accepted Normal starting-space disposition"
      }
    };
  });
  const outliers = pressurePruned.map((removal) => ({
    index: removal.index,
    score: removal.score,
    delta: 0,
    actionDelta: Number(removal.actions ?? 0),
    reasons: {
      ...(removal.diagnostics ?? {}),
      normalBalancePruned: true,
      hydrationSavedDisposition: true
    }
  }));

  let restoredFirstLeg = {
    ...sequence.firstLeg,
    summary: {
      ...sequence.firstLeg.summary,
      outliers,
      normalStartBalance: {
        ...(savedBalance ?? sequence.firstLeg.summary?.normalStartBalance ?? {}),
        active: true,
        pressurePruned,
        lightweightPruned: savedBalance?.lightweightPruned ?? [],
        fullTrafficPruned: savedBalance?.fullTrafficPruned ?? [],
        hydrationSavedDisposition: true
      }
    }
  };

  restoredFirstLeg = recomputeFirstLegPressure(tileMap, restoredFirstLeg, {
    ...getRouteAnalysisVariantOptions(options),
    playerCount,
    excludedIndices: [...excludedIndices],
    openingTrafficOnly: false,
    balanceTrafficScope: "full",
    trafficOccupancyUseBalanceScore: true,
    carryOccupancyScores: true,
    fullCourseTrafficPasses:
      options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
    skipTraffic: Boolean(options.skipTraffic)
  });

  const retainedEntries = getActivePruningStarts(restoredFirstLeg, excludedIndices);
  const retainedBalance = summarizeNormalRetainedREBalance(retainedEntries, options);
  const residualBalancePenalty = getNormalResidualBalanceSelectionPenalty(retainedEntries, options);
  const durationGuardrail = getNormalRegisterDurationGuardrail(retainedEntries);
  const remainingOutliers = rankNormalEffectiveREOutliers(
    retainedEntries,
    NORMAL_EFFECTIVE_RE_OUTLIER_Z
  );
  const playerFloor = Math.max(1, Number(playerCount) || 1);
  const belowPlayerFloor = retainedEntries.length < playerFloor;
  const floorReached = retainedEntries.length === playerFloor;
  const priorBalance = restoredFirstLeg.summary?.normalStartBalance ?? {};

  restoredFirstLeg = {
    ...restoredFirstLeg,
    summary: {
      ...restoredFirstLeg.summary,
      scoreStdDev: retainedBalance.stdDev,
      fairnessScore: Number(Math.max(
        0,
        100 - (
          retainedBalance.rangeLimit > 1e-9
            ? (retainedBalance.range / retainedBalance.rangeLimit) * 35
            : 0
        )
      ).toFixed(2)),
      outliers,
      normalStartBalance: {
        ...priorBalance,
        active: true,
        staged: true,
        iterative: true,
        pressurePruned,
        lightweightPruned: savedBalance?.lightweightPruned ?? [],
        fullTrafficPruned: savedBalance?.fullTrafficPruned ?? [],
        hydrationSavedDisposition: true,
        retainedCount: retainedBalance.count,
        retainedScoreMin: retainedBalance.min,
        retainedScoreMax: retainedBalance.max,
        retainedScoreRange: retainedBalance.range,
        retainedEffectiveREMin: retainedBalance.min,
        retainedEffectiveREMax: retainedBalance.max,
        retainedEffectiveRERange: retainedBalance.range,
        retainedEffectiveRERangeLimit: retainedBalance.rangeLimit,
        retainedEffectiveRERangeExcess: retainedBalance.rangeExcess,
        fairnessMedianRegisters: retainedBalance.medianRegisters,
        fairnessMedianTurns: retainedBalance.medianTurns,
        worstRemainingScoreZ: retainedBalance.worstScoreZ,
        worstRemainingScoreIndex: retainedBalance.worstScoreIndex,
        worstRemainingActionZ: retainedBalance.worstActionZ,
        worstRemainingActionIndex: retainedBalance.worstActionIndex,
        durationGuardrail,
        playerFloor,
        floorReached,
        belowPlayerFloor,
        residualSelectionPenalty: residualBalancePenalty.total,
        residualSelectionPenaltyComponents: residualBalancePenalty,
        residualImbalanceFeedsCourseScorer: true,
        fairnessMetric: "full-course-effective-RE",
        fairnessModel: "range-first-length-responsive-start-balance-v49fj",
        startBalance: normalizeStartBalance(options.startBalance),
        startBalanceLabel: formatStartBalanceLabel(options.startBalance),
        startBalanceEnforced: getStartBalanceProfile(options).enforced,
        actionPruningActive: false,
        dispersionPruningActive: false,
        rangePruningActive: getStartBalanceProfile(options).enforced,
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          score: item.score,
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        provisionalReject: belowPlayerFloor,
        reject: belowPlayerFloor
      }
    }
  };
  restoredFirstLeg.summary.normalStartBalance.startResiduals =
    summarizePostBalanceStartResiduals(restoredFirstLeg, playerCount);

  const legs = [
    {
      ...(sequence.legs?.[0] ?? { from: "dock", to: 1 }),
      analysis: restoredFirstLeg
    },
    ...(restoredFirstLeg.expectedLegAnalyses || []).map((analysis, index) => ({
      from: index + 1,
      to: index + 2,
      analysis
    }))
  ];
  const totalDifficulty = Number((legs.reduce((sum, leg) => {
    if (leg.analysis.summary.difficultyScore !== undefined) {
      return sum + leg.analysis.summary.difficultyScore;
    }
    return sum + leg.analysis.summary.averageRouteScore +
      leg.analysis.summary.congestionScore - leg.analysis.summary.diversityScore * 0.2;
  }, 0)).toFixed(2));
  const totalLength = Number((legs.reduce((sum, leg) => {
    if (leg.analysis.summary.lengthScore !== undefined) {
      return sum + leg.analysis.summary.lengthScore;
    }
    return sum + leg.analysis.summary.averageRouteDistance;
  }, 0)).toFixed(2));

  return {
    ...sequence,
    firstLeg: restoredFirstLeg,
    legs,
    summary: {
      ...sequence.summary,
      totalDifficulty,
      totalLength
    }
  };
}

export async function hydrateScenarioFromSnapshot(assets, snapshot, control = {}) {
  if (!snapshot?.placements?.length || !snapshot?.checkpoints?.length || !snapshot?.preferences) {
    return null;
  }

  const shouldStopRequested = typeof control.shouldStopRequested === "function"
    ? control.shouldStopRequested
    : () => false;
  const onStage = typeof control.onStage === "function" ? control.onStage : null;
  const onCooperativeProgress = typeof control.onCooperativeProgress === "function"
    ? control.onCooperativeProgress
    : null;
  if (shouldStopRequested()) throw makeGenerationStopRequestedError("Saved-course reanalysis stopped.");

  const effectiveTargetPreferences = {
    difficulty: snapshot.effectiveTargetPreferences?.difficulty ?? snapshot.preferences.difficulty,
    length: snapshot.effectiveTargetPreferences?.length ?? snapshot.preferences.length
  };
  const hydrationPreferences = {
    ...snapshot.preferences,
    ...effectiveTargetPreferences,
    targetGuidanceOnlyDifficulty: snapshot.preferences.difficulty === "any",
    targetGuidanceOnlyLength: snapshot.preferences.length === "any"
  };

  const { pieceMap, imageMap } = assets;
  const actFast = Boolean(snapshot.actFast);
  const actFastMode = snapshot.actFastMode ?? null;
  const recoveryRule = snapshot.recoveryRule ?? "reboot_tokens";
  const competitiveMode = Boolean(snapshot.competitiveMode);
  const payToWin = Boolean(snapshot.payToWin);
  const subsidizedStarts = Boolean(snapshot.subsidizedStarts);
  const startEnergyPricing = Boolean(payToWin || subsidizedStarts);
  const noDocks = Boolean(snapshot.noDocks);
  const sandwichedDock = Boolean(snapshot.sandwichedDock);
  const noDockStarts = snapshot.noDockStarts || [];
  const factoryRejects = Boolean(snapshot.factoryRejects);
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const lessSpammyGame = Boolean(snapshot.lessSpammyGame);
  const criticalSpam = Boolean(snapshot.criticalSpam);
  const criticalHaywire = Boolean(snapshot.criticalHaywire);
  const permanentShutdown = Boolean(snapshot.permanentShutdown);
  const homeReboot = Boolean(snapshot.homeReboot || recoveryRule === "home_reboot");
  const cuttingFloor = Boolean(snapshot.cuttingFloor);
  const startupSpinUp = Boolean(snapshot.startupSpinUp);
  const virtualBots = Boolean(snapshot.virtualBots);
  const upgradeWorld = Boolean(snapshot.upgradeWorld);
  const lighterGame = Boolean(snapshot.lighterGame);
  const classicSharedDeck = Boolean(snapshot.classicSharedDeck);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const movingTargets = Boolean(snapshot.movingTargets);
  const staggeredBoards = Boolean(snapshot.staggeredBoards);
  const lessForeshadowing = Boolean(snapshot.lessForeshadowing);
  // Rebuild the course's rules from the variant registry, exactly as generation's
  // applyVariantScenarioState recorded them. A hand-kept list here used to drop
  // route-relevant rules (Moving Targets, More Deadly Game, Repair Stations, ...),
  // so a reload analysed a different course from the one that was accepted.
  const hydrationVariantBundle = {
    ...Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, Boolean(snapshot[variant.id])])),
    // Saves made before every registry id was persisted still carry Dynamic
    // Archiving through the recovery rule.
    dynamicArchiving: Boolean(snapshot.dynamicArchiving ?? recoveryRule === "dynamic_archiving"),
    actFastMode,
    recoveryRule,
    homeReboot
  };
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const boardPlacements = placements.filter((placement) => {
    const kind = assets.pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, assets.pieceMap);
  const snapshotNoDockEdges = snapshot.noDockEdges ?? (snapshot.noDockEdge ? [snapshot.noDockEdge] : []);
  const extraDocks = noDocks ? snapshotNoDockEdges.length > 1 : dockPlacements.length > 1;
  const boardRects = buildBoardRects(boardPlacements, pieceMap);

  if ((!virtualBots && !noDocks && !dockPlacements.length) || !boardPlacements.length) {
    return null;
  }

  // Canonical evaluation during generation keeps the warm caches: they are pure
  // memos, and the comparison harness (leak + restore checks) verifies that the
  // result matches a cold page reload exactly.
  if (!control.keepAnalysisCaches) clearAnalysisCachesSafe();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const rebootTokens = recoveryRule === "home_reboot"
    ? placeHomeRebootTokens(dockPlacements, pieceMap, starts, tileMap, checkpoints, {
      lessDeadlyGame
    })
    : (snapshot.rebootTokens || []);
  const flagZero = virtualBots ? checkpoints[0] : null;
  const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
  let goalTileMap;
  if (virtualBots) {
    const withFlagZero = applyFlagOverrides(tileMap, [flagZero], { hazardousFlags, movingTargets: false });
    goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
    goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
  } else {
    goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags, movingTargets });
  }
  const rawResolvedActiveStarts = virtualBots
    ? buildVirtualRobotStarts(flagZero, snapshot.preferences.playerCount, startupSpinUp)
    : noDocks
      ? filterStartsForGoals(noDockStarts, checkpoints)
      : filterStartsForGoals(starts, checkpoints);
  const resolvedActiveStarts = (!virtualBots && sandwichedDock && !startupSpinUp)
    ? orientSandwichedDockStartsTowardCheckpoint(
      rawResolvedActiveStarts,
      dockPlacements,
      pieceMap,
      playableCheckpoints[0]
    )
    : rawResolvedActiveStarts;
  const activeStarts = Array.isArray(snapshot.activeStarts) && snapshot.activeStarts.length
    ? snapshot.activeStarts
    : resolvedActiveStarts;
  const savedNormalPrunedIndices = getSavedNormalHydrationPrunedIndices(
    snapshot,
    activeStarts.length,
    snapshot.preferences.playerCount
  );
  const restoreSavedNormalDisposition = Array.isArray(savedNormalPrunedIndices);
  const savedAnalysisIndices = new Set(
    Array.isArray(snapshot.analysisStartIndices) && snapshot.analysisStartIndices.length
      ? snapshot.analysisStartIndices
      : activeStarts.map((_, index) => index)
  );
  // Reload is reconstruction, so authoritative routing always receives the same
  // full active start field as production generation. Older snapshots persisted
  // only the post-balance usable subset in analysisStartIndices; deliberately do
  // not use that legacy shortlist as a route-input filter. The saved disposition
  // still identifies which starts were ultimately retained/pruned.
  const analysisStarts = virtualBots
    ? activeStarts
    : activeStarts.map((start, index) => ({ ...start, analysisIndex: index }));
  const hydrationGenerationMode = getScenarioGenerationMode(snapshot);
  const hydrationGenerationProfile = getGenerationModeProfile({
    generationMode: hydrationGenerationMode
  });
  const hydrationTrafficEnabled = Boolean(hydrationGenerationProfile.trafficEnabled);
  const hydrationTrafficFeedbackEnabled = Boolean(
    hydrationTrafficEnabled && hydrationGenerationProfile.trafficEpochs > 0
  );

  // Reload is reconstruction of an already-accepted course, not a cheaper second
  // opinion. Use the same production routing envelope as generation so a bounded
  // generic reanalysis cannot turn accepted starts into false zero-route failures.
  // In particular, priced-start modes were generated through the shared physical
  // estimate -> exact-program realization foundation and must hydrate through it.
  // Same predicate generation uses: priced starts route every start through the
  // shared foundation (except Virtual Bots, which skip pricing); otherwise Virtual
  // Bots and single-dock layouts do.
  const hydrationUsesSharedRouteFoundation = startEnergyPricing
    ? !virtualBots
    : Boolean(virtualBots || (!noDocks && dockPlacements.length === 1));
  const hydrationRouteFoundationOptions = hydrationUsesSharedRouteFoundation
    ? {
        contextualSharedLaterLegCatalogue: true,
        contextualEstimatedPrimaryRouting: true,
        contextualPhysicalTemplateRoutes: hydrationGenerationProfile.primaryWitnessRoutes,
        contextualPrimaryWitnessRoutes: hydrationGenerationProfile.primaryWitnessRoutes,
        contextualPhysicalTemplateExpansions: 700,
        contextualPhysicalTemplateMaxActions: 36,
        contextualExactRepairExpansions: 380,
        contextualOpeningSeedAnalyses: null,
        contextualSeedStartAnalyses: null,
        contextualSeedRouteStrategy: null,
        contextualRequiredStarts: competitiveMode && !startEnergyPricing
          ? analysisStarts.length
          : snapshot.preferences.playerCount
      }
    : {};
  const hydrationBaseVariantOptions = {
    ...hydrationPreferences,
    ...hydrationVariantBundle
  };
  const savedRouteAwareEnergy = snapshot.coursePreflight?.routeAwareBatteryScoring ?? null;
  const hydrationEnergyOptions = {
    ...buildRouteAwareBatteryScoringOptions(
      null,
      hydrationBaseVariantOptions
    ),
    // New snapshots persist the exact production Energy horizon/register value
    // that participated in route choice. Apply it before reconstruction so a
    // refresh cannot choose a different route merely because hydration fell back
    // to the generic 4-turn / 6.4-register estimate. Older snapshots never saved
    // these resolved values, so they necessarily retain the conservative fallback.
    ...(savedRouteAwareEnergy
      ? {
        routeAwareBatteryScoring: Boolean(savedRouteAwareEnergy.active),
        routeEnergyHorizonTurns: savedRouteAwareEnergy.horizonTurns ?? null,
        routeEnergyRegisterScore: savedRouteAwareEnergy.registerScore ?? null,
        routeEnergyReferenceReserve: savedRouteAwareEnergy.referenceReserve ??
          savedRouteAwareEnergy.startingReserve ?? null,
        startingEnergy: savedRouteAwareEnergy.startingReserve ?? null,
        upgradeUsefulCardRate: savedRouteAwareEnergy.usefulUpgradeCardRate ?? null,
        upgradeDrawEnergyCost: savedRouteAwareEnergy.drawEnergyCost ?? null,
        upgradeUsefulEnergyPerInstall: savedRouteAwareEnergy.usefulEnergyPerInstall ?? null
      }
      : {})
  };
  if (onStage) await onStage("Preparing saved-course route analysis");
  let sequence = await analyzeFlagSequence(goalTileMap, analysisStarts, playableCheckpoints, snapshot.preferences.playerCount, applyVariantAnalysisOptions({
    ...getRouteAnalysisVariantOptions(hydrationPreferences),
    ...hydrationEnergyOptions,
    rebootTokens,
    boardRects,
    difficulty: hydrationPreferences.difficulty,
    length: hydrationPreferences.length,
    // Preserve the search-effort meaning of the saved course. Pre-Mode saves
    // used the current Balanced budgets, so getScenarioGenerationMode() maps
    // those legacy snapshots to Balanced rather than silently using Standard.
    generationMode: hydrationGenerationMode,
    fullCourseAnalyzer: analyzeFullCourseCooperativeSafe,
    cooperativeYield: async (progress) => {
      if (onCooperativeProgress) {
        await onCooperativeProgress(progress);
      } else {
        await nextEventLoopTurn();
      }
    },
    cooperativeYieldIntervalMs: GENERATION_COOPERATIVE_YIELD_INTERVAL_MS,
    contextualCooperativeSearchSlices: true,
    contextualCooperativeSearchSliceMs: GENERATION_COOPERATIVE_SEARCH_SLICE_MS,
    contextualCooperativeSearchCheckPops: GENERATION_COOPERATIVE_SEARCH_CHECK_POPS,
    cooperativeStage: async (stage) => {
      if (onStage) await onStage(stage);
      else await nextEventLoopTurn();
      if (shouldStopRequested()) throw makeGenerationStopRequestedError("Saved-course reanalysis stopped.");
    },
    shouldStopRequested,
    contextualFastCardState: true,
    contextualEstimatedEnergyGuidance: true,
    fastBaselineTrafficEnabled: hydrationTrafficEnabled,
    modeTrafficEnabled: hydrationTrafficEnabled,
    trafficEnabledOverride: hydrationTrafficEnabled,
    contextualTrafficFeedbackEnabled: hydrationTrafficFeedbackEnabled,
    contextualTrafficDrivenAlternates: hydrationTrafficFeedbackEnabled,
    contextualTrafficEpochs: hydrationTrafficFeedbackEnabled
      ? hydrationGenerationProfile.trafficEpochs
      : 0,
    contextualTrafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
    contextualTrafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
    contextualTrafficAlternateMaxNewSearchesPerEpoch:
      hydrationGenerationProfile.trafficAlternateMaxNewSearchesPerEpoch,
    contextualTrafficAlternateMaxNewSearchesTotal:
      hydrationGenerationProfile.trafficAlternateMaxNewSearchesTotal,
    contextualTrafficAlternateExpansions: hydrationGenerationProfile.trafficAlternateExpansions,
    contextualTrafficAlternateMaxActions: hydrationGenerationProfile.trafficAlternateMaxActions,
    contextualTrafficAlternateCachedProbeMargin:
      hydrationGenerationProfile.trafficAlternateCachedProbeMargin,
    contextualTrafficAlternateCachedProbeMaxSimilarity:
      hydrationGenerationProfile.trafficAlternateCachedProbeMaxSimilarity,
    contextualTrafficAlternateLegsPerStart: hydrationGenerationProfile.trafficAlternateLegsPerStart,
    contextualTrafficExplorationUncertaintyShare:
      hydrationGenerationProfile.trafficExplorationUncertaintyShare,
    contextualTrafficExplorationConfidenceFloor:
      hydrationGenerationProfile.trafficExplorationConfidenceFloor,
    contextualTrafficAlternateUncertaintyEffortFloor:
      hydrationGenerationProfile.trafficAlternateUncertaintyEffortFloor,
    contextualTrafficAlternateUncertaintyEffortExponent:
      hydrationGenerationProfile.trafficAlternateUncertaintyEffortExponent,
    skipTraffic: !hydrationTrafficEnabled,
    skipFullCourseTraffic: !hydrationTrafficEnabled,
    contextualTrafficAlternativeRetention: false,
    contextualOpeningExpansions: 650,
    contextualLaterExpansions: 550,
    contextualLegMaxActions: 30,
    contextualUncertaintyBreadth: true,
    contextualDetailedProfiling: false,
    contextualDominanceKeyProfiling: false,
    ...hydrationRouteFoundationOptions,
    // Pricing/pruning is part of the saved scenario. Re-running it during reload
    // could remove a second start from an already accepted economy setup; restore
    // the persisted pricing fields after route reconstruction instead.
    skipStartEnergyPricing: startEnergyPricing && Array.isArray(snapshot.startPricing),
    // v49ff: the accepted Normal starting-space disposition is part of the saved
    // course. Route every physical start, but do not choose a new Normal prune set
    // on reload when the snapshot already records the accepted one. After routing,
    // restore that saved set and recompute traffic/RE over exactly those starts.
    // Legacy saves without a recorded Normal disposition retain the old replay.
    skipNormalStartBalancing: restoreSavedNormalDisposition,
    // Generation analyses every candidate with early exit enabled.
    contextualEarlyExit: true
  }, hydrationVariantBundle));
  if (restoreSavedNormalDisposition) {
    sequence = restoreSavedNormalStartDispositionForHydration(
      sequence,
      goalTileMap,
      snapshot.preferences.playerCount,
      savedNormalPrunedIndices,
      {
        ...hydrationBaseVariantOptions,
        skipTraffic: !hydrationTrafficEnabled,
        fullCourseTrafficPasses: NORMAL_FULL_COURSE_TRAFFIC_PASSES
      },
      snapshot.normalStartBalance ?? null
    );
  }

  // Hydration does not rerun the cheap course preflight, but route-aware Energy
  // is production route context, not a generation-only diagnostic. Restore the
  // saved metadata when available. For older snapshots, reconstruct only that
  // resolved Energy metadata from the same hydration options; keep preflight
  // inactive so we do not fabricate historical preflight counts.
  if (sequence?.firstLeg?.summary) {
    const savedCoursePreflight = snapshot.coursePreflight ?? null;
    const restoredEnergyMetadata = savedCoursePreflight?.routeAwareBatteryScoring ?? {
      active: Boolean(hydrationEnergyOptions.routeAwareBatteryScoring),
      method: "route-upgrade-economy-production-v18-flat-reserve-progress",
      horizonTurns: hydrationEnergyOptions.routeEnergyHorizonTurns ?? null,
      registerScore: hydrationEnergyOptions.routeEnergyRegisterScore ?? null,
      startingReserve: hydrationEnergyOptions.startingEnergy ?? null,
      referenceReserve: hydrationEnergyOptions.routeEnergyReferenceReserve ?? null,
      usefulUpgradeCardRate: hydrationEnergyOptions.upgradeUsefulCardRate ?? null,
      drawEnergyCost: hydrationEnergyOptions.upgradeDrawEnergyCost ?? null,
      usefulEnergyPerInstall: hydrationEnergyOptions.upgradeUsefulEnergyPerInstall ?? null
    };
    sequence.firstLeg.summary.coursePreflight = savedCoursePreflight
      ? { ...savedCoursePreflight, routeAwareBatteryScoring: restoredEnergyMetadata }
      : { active: false, routeAwareBatteryScoring: restoredEnergyMetadata };
    if (snapshot.contextualSearchMode) {
      sequence.firstLeg.summary.contextualSearchMode = snapshot.contextualSearchMode;
    }
    if (sequence.legs?.[0]) {
      sequence.legs[0] = { ...sequence.legs[0], analysis: sequence.firstLeg };
    }
  }

  if (startEnergyPricing && Array.isArray(snapshot.startPricing)) {
    const savedPricingByIndex = new Map(snapshot.startPricing.map((entry) => [entry.index, entry]));
    sequence.firstLeg.starts = sequence.firstLeg.starts.map((entry) => {
      const saved = savedPricingByIndex.get(entry.index);
      return saved ? { ...entry, ...saved } : entry;
    });
    if (sequence.legs?.[0]) {
      sequence.legs[0] = { ...sequence.legs[0], analysis: sequence.firstLeg };
    }
    if (snapshot.payToWinPricing) {
      sequence.firstLeg.summary.payToWin = snapshot.payToWinPricing;
    }
  }
  let metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    actFast,
    actFastMode,
    recoveryRule,
    flagCount: playableCheckpoints.length,
    classicSharedDeck,
    cuttingFloor,
    factoryRejects,
    hazardousFlags,
    movingTargets,
    payToWin,
    subsidizedStarts,
    startupSpinUp,
    upgradeWorld,
    lighterGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    lessForeshadowing,
    sandwichedDock
  }, {
    boardPlacements,
    dockPlacements,
    pieceMap,
    checkpoints: playableCheckpoints,
    tileMap,
    goalTileMap,
    rebootTokens
  });
  // Generation applies forced Extra Docks as a final course-level requirement
  // after generic classification. Reapply that same requirement on reload so an
  // unchanged one-dock fallback cannot silently become "accepted" merely because
  // classifyCandidate() does not itself own the setup-rule request.
  const hydrationStartZoneCount = noDocks
    ? snapshotNoDockEdges.length
    : dockPlacements.length;
  const hydrationExtraDocksRequestMismatch = Boolean(
    isVariantForced(snapshot.preferences, "extraDocks") &&
    hydrationStartZoneCount <= 1
  );
  if (hydrationExtraDocksRequestMismatch) {
    metrics = {
      ...metrics,
      acceptable: false,
      hardFailures: [...new Set([...(metrics.hardFailures ?? []), "extra-docks"])]
    };
  }

  const hydrationPresentationStatus = getHydratedPresentationAnalysisStatus(
    sequence,
    metrics,
    playableCheckpoints.length
  );
  const hydrationPresentationComplete = hydrationPresentationStatus.complete;
  const savedPresentationMetrics = snapshot.presentationMetrics ?? null;
  const hydrationPresentationFallback = Boolean(
    !hydrationPresentationComplete && savedPresentationMetrics
  );
  const hydrationPresentationUnavailable = Boolean(
    !hydrationPresentationComplete && !savedPresentationMetrics
  );
  const savedGenerationDisposition = getSavedGenerationDisposition(snapshot);
  const hydrationAcceptanceDrift = Boolean(
    hydrationPresentationComplete &&
    savedGenerationDisposition.acceptedAtSave === true &&
    metrics.acceptable === false
  );
  const hydrationAcceptanceImproved = Boolean(
    hydrationPresentationComplete &&
    savedGenerationDisposition.acceptedAtSave === false &&
    metrics.acceptable === true
  );
  const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
  const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(tileMap, playableCheckpoints, movingTargets);
  const hydratedCompetitiveBalance = sequence.firstLeg?.summary?.competitiveStartBalance ?? null;
  // Keep the reconstructed scenario's analysis field semantically identical to
  // production generation: every active start entered authoritative analysis.
  // savedAnalysisIndices remains above only for legacy snapshot bookkeeping.
  const hydratedAnalysisStartIndices = activeStarts.map((_, index) => index);

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    dockPlacements,
    dockSummaries: buildDockSummaries(boardPlacements, dockPlacements, pieceMap),
    checkpoints,
    virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
    rebootTokens,
    goalTileMap,
    activeStarts,
    blockedStartIndices: Array.isArray(snapshot.blockedStartIndices) ? snapshot.blockedStartIndices : [],
    validatedStartIndices: competitiveMode
      ? computeCourseReachableStarts(sequence.firstLeg).map((entry) => entry.index)
      : (Array.isArray(snapshot.validatedStartIndices) ? snapshot.validatedStartIndices : [...savedAnalysisIndices]),
    analysisStartIndices: hydratedAnalysisStartIndices,
    startDisposition: snapshot.startDisposition
      ? {
        ...snapshot.startDisposition,
        // v34/v35 snapshots called all P2W pruning "legacy" pruning. Accept
        // that field on hydration, but use the neutral name now that v36's
        // register-equivalent model owns the same endpoint-pruning mechanism.
        pricePrunedIndices: snapshot.startDisposition.pricePrunedIndices ??
          snapshot.startDisposition.legacyPricePrunedIndices ?? [],
        competitiveStrategicBlockIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
          : (snapshot.startDisposition.competitiveStrategicBlockIndices ?? []),
        competitiveSelectedIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
          : (snapshot.startDisposition.competitiveSelectedIndices ?? [])
      }
      : {
        physicalCount: activeStarts.length,
        validatedCount: competitiveMode
          ? computeCourseReachableStarts(sequence.firstLeg).length
          : (Array.isArray(snapshot.validatedStartIndices) ? snapshot.validatedStartIndices.length : savedAnalysisIndices.size),
        blockedCount: Array.isArray(snapshot.blockedStartIndices) ? snapshot.blockedStartIndices.length : 0,
        outsidePoolIndices: [],
        routeFailedIndices: [],
        normalPrunedIndices: [],
        competitiveStrategicBlockIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
          : [],
        competitiveSelectedIndices: competitiveMode
          ? [...(hydratedCompetitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
          : [],
        pricePrunedIndices: [],
        selectorUnavailableIndices: [],
        otherBlockedIndices: Array.isArray(snapshot.blockedStartIndices) ? [...snapshot.blockedStartIndices] : []
      },
    ...hydrationVariantBundle,
    playerCount: snapshot.preferences.playerCount,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    noDocks,
    sandwichedDock,
    noDockEdge: snapshot.noDockEdge ?? snapshotNoDockEdges[0] ?? null,
    noDockEdges: snapshotNoDockEdges,
    noDockStarts,
    extraDocks,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    homeReboot,
    cuttingFloor,
    upgradeWorld,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing,
    mainBoardIds: boardPlacements.map((placement) => placement.pieceId),
    mainRotations: boardPlacements.map((placement) => placement.rotation),
    boardCount: boardPlacements.length,
    boardRects,
    generationDiagnostics: snapshot.generationDiagnostics ?? null,
    generationBestMatch: savedGenerationDisposition.bestMatch,
    generationAcceptedAtSave: savedGenerationDisposition.acceptedAtSave,
    generationTerminationReason: savedGenerationDisposition.terminationReason,
    hydrationAcceptanceDrift,
    hydrationAcceptanceImproved,
    constructionGuidancePrior: snapshot.constructionGuidancePrior ?? null,
    constructionGuidanceStages: snapshot.constructionGuidanceStages ?? null,
    guidanceLevel: snapshot.guidanceLevel ?? 0,
    variantComplexityBudget: snapshot.variantComplexityBudget ?? 0,
    variantComplexityUsed: snapshot.variantComplexityUsed ?? 0,
    sequence,
    metrics,
    savedPresentationMetrics,
    savedCourseNotesHtml: snapshot.courseNotesHtml ?? null,
    hydrationPresentationFallback,
    hydrationPresentationUnavailable,
    hydrationPresentationStatusReason: hydrationPresentationStatus.reason,
    hydrationReanalysisPending: false,
    hydrationReanalysisStopped: false,
    hydrationReanalysisFailed: false,
    hydrationStartDispositionRestored: restoreSavedNormalDisposition,
    movingTargetStats: metrics.movingTargetStats,
    movingTargetTimelines,
    movingTargetReentryMarkers,
    effectiveTargetPreferences,
    preferences: {
      ...snapshot.preferences,
      overlayMode: normalizeOverlayMode(snapshot.preferences.overlayMode),
      actFast,
      actFastMode,
      competitiveMode,
      payToWin,
      subsidizedStarts,
      noDocks,
      sandwichedDock,
      extraDocks,
      factoryRejects,
      recoveryRule,
      flagCount: playableCheckpoints.length,
      classicSharedDeck,
      homeReboot,
      cuttingFloor,
          startupSpinUp,
      virtualBots,
      upgradeWorld,
      hazardousFlags,
        movingTargets,
      lessSpammyGame,
      criticalSpam,
      criticalHaywire,
      permanentShutdown,
      staggeredBoards
    },
    attempts: snapshot.attempts ?? 0
  };
}

// Reload-only presentation bookkeeping that must not leak into a freshly
// generated course.
export const HYDRATION_ONLY_SCENARIO_FIELDS = [
  "generationAcceptedAtSave",
  "hydrationAcceptanceDrift",
  "hydrationAcceptanceImproved",
  "savedPresentationMetrics",
  "savedCourseNotesHtml",
  "hydrationPresentationFallback",
  "hydrationPresentationUnavailable",
  "hydrationPresentationStatusReason",
  "hydrationReanalysisPending",
  "hydrationReanalysisStopped",
  "hydrationReanalysisFailed",
  "hydrationStartDispositionRestored"
];

// Canonical evaluation of a finished course: save it exactly as the app would,
// then reanalyse it through the reload path. Generation adopts this result as
// the course's authoritative numbers, so a later reload (or the course editor)
// reproduces them exactly instead of landing on history-dependent values from
// the incremental generation passes. Returns null when the reanalysis cannot
// rebuild a complete presentation; a reload of that course would fail too.
export async function evaluateCourseCanonically(assets, candidate, preferences, control = {}) {
  const snapshot = JSON.parse(JSON.stringify(serializeScenario(candidate)));
  // Mirror what the final save records for "Any" targets (see
  // runProductionGeneration): the concrete target stays in
  // effectiveTargetPreferences, the saved preference remains "any".
  const concreteTarget = {
    difficulty: preferences.difficulty,
    length: preferences.length
  };
  snapshot.effectiveTargetPreferences = concreteTarget;
  snapshot.preferences = {
    ...snapshot.preferences,
    difficulty: preferences.targetGuidanceOnlyDifficulty ? "any" : concreteTarget.difficulty,
    length: preferences.targetGuidanceOnlyLength ? "any" : concreteTarget.length
  };
  const canonical = await hydrateScenarioFromSnapshot(assets, snapshot, { ...control, keepAnalysisCaches: true });
  if (!canonical || canonical.hydrationPresentationFallback || canonical.hydrationPresentationUnavailable) {
    return null;
  }
  for (const field of HYDRATION_ONLY_SCENARIO_FIELDS) delete canonical[field];
  // The final save overwrites these again once the run ends.
  canonical.preferences = { ...candidate.preferences, ...canonical.preferences, ...concreteTarget };
  delete canonical.effectiveTargetPreferences;
  canonical.attempts = candidate.attempts;
  canonical.canonicallyEvaluated = true;
  return canonical;
}
