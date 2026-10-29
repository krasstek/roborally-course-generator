// Robo Rally Course Randomizer - calibration and test entry points used by the calibration runner and the comparison harness
//
// The calibration harness deliberately reuses production construction and route
// semantics, but it is not a second generator. Internal calibration preferences
// only broaden sampling, force requested counts, preserve target misses as data,
// and expose cheap construction evidence. Browser generation never emits them.
// Missing calibration output therefore cannot affect correctness.
import {
  clearAnalysisCaches,
  getAnalysisTelemetrySnapshot,
  resetAnalysisTelemetry,
  summarizeRegisterEquivalentLedger
} from "../../analyze.js";
import { setCalibrationLegCandidateSink } from "../analysis/full-course.js";
import { buildResolvedMap } from "../../board.js";
import { tileKey } from "../analysis/board-geometry.js";
import {
  VARIANT_DEFINITIONS,
  applyVariantAnalysisOptions,
  buildVariantBundle
} from "../../variants.js";
import {
  analyzeFlagSequence,
  buildRouteAwareBatteryScoringOptions
} from "./analysis-orchestration.js";
import { loadAssets } from "./assets.js";
import { getDockPlacementsFromScenarioPlacements } from "./board-layout.js";
import {
  CALIBRATION_CHECKPOINT_SAMPLING_REGIMES,
  buildCalibrationConstructionSnapshot,
  getCalibrationExpansionIds
} from "./calibration-features.js";
import { createRandomCandidate, validateSelectedInventory } from "./candidate-builder.js";
import { applyFlagOverrides, filterStartsForGoals, getPlayableCheckpoints } from "./checkpoints.js";
import { classifyCandidate } from "./classification.js";
import {
  DIAGNOSTIC_DIFFICULTIES,
  DIAGNOSTIC_LENGTHS,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
} from "./config.js";
import { runProductionGeneration } from "./generation-loop.js";
import { getGenerationModeProfile, normalizeGenerationMode } from "./generation-modes.js";
import { buildBoardRects, countPhysicalBoards, isMiniOverlayPiece } from "./layout-geometry.js";
import { getAvailableOverlayIds } from "./overlays.js";
import { hydrateScenarioFromSnapshot, serializeScenario } from "./persistence.js";
import {
  OVERLAY_MODES,
  OVERLAY_REBOOT_MODES,
  normalizeBoardSpread,
  normalizeOverlayMode,
  normalizeOverlayReboot
} from "./preferences.js";
import { withGenerationRandomSeed } from "./random.js";
import { placeRebootTokens } from "./reboot-tokens.js";
import { generationNow } from "./scheduling.js";
import {
  chooseActFastMode,
  getCourseConflictingVariantIds,
  getMissingRequiredVariantIds,
  getVariantCourseUnavailabilityReason,
  getAvailableDockIds,
  getAvailableMainBoardIds,
  getRouteAnalysisVariantOptions
} from "./variant-availability.js";

export function normalizeCalibrationExpansionIds(pieceMap = {}, requestedIds = null) {
  const available = new Set(getCalibrationExpansionIds(pieceMap));
  const requested = Array.isArray(requestedIds) && requestedIds.length
    ? requestedIds.filter((id) => available.has(id))
    : [...available];
  return [...new Set(requested)].sort();
}

export function buildCalibrationVariantStates(forcedVariantIds = []) {
  const states = Object.fromEntries(
    VARIANT_DEFINITIONS.map((variant) => [variant.id, "off"])
  );
  for (const variantId of forcedVariantIds) {
    if (Object.prototype.hasOwnProperty.call(states, variantId)) {
      states[variantId] = "forced";
    }
  }
  return states;
}

export function summarizeCalibrationTelemetry(telemetry = null) {
  if (!telemetry) return null;
  const byKind = Object.fromEntries(Object.entries(telemetry.totalsByKind ?? {}).map(([kind, value]) => [kind, {
    searches: Number(value?.searches ?? value?.count ?? 0),
    expansions: Number(value?.expansions ?? 0),
    capped: Number(value?.capped ?? 0),
    durationMs: Number(value?.durationMs ?? 0)
  }]));
  return {
    routeSearchCount: Number(telemetry.routeSearchCount ?? 0),
    totalExpansions: Number(telemetry.totalExpansions ?? 0),
    totalDurationMs: Number(Number(telemetry.totalDurationMs ?? 0).toFixed(3)),
    cappedSearches: Number(telemetry.cappedSearches ?? 0),
    totalsByKind: byKind
  };
}

const roundedOrNull = (value, digits = 4) => (
  Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null
);

function countInto(counts, key, amount = 1) {
  counts[key] = (counts[key] || 0) + amount;
}

// One record per analysed start: what the cheap search charged for its full-course
// route (score units) beside what the RE model says the same route costs, plus the
// feature encounters along it. Calibration fits the search weights from these pairs.
function summarizeCalibrationRoutes(tileMap, scenario) {
  const starts = scenario.sequence?.firstLeg?.starts ?? [];
  return starts.map((start) => {
    const route = start?.fullCourseRoute;
    if (!route) return { index: start?.index ?? null, reachable: Boolean(start?.reachable), route: null };
    const cards = {};
    const endFeatures = {};
    const boardEvents = {};
    let rebooted = 0;
    let crashed = 0;
    for (const transition of route.transitions ?? []) {
      countInto(cards, transition.programCard ?? transition.action ?? "unknown");
      if (transition.rebooted) rebooted += 1;
      if (transition.crashed) crashed += 1;
      for (const event of transition.boardEvents ?? []) countInto(boardEvents, event?.type ?? "unknown");
      const to = transition.to;
      const tile = to ? tileMap.get(tileKey(to.x, to.y)) : null;
      for (const feature of tile?.features ?? []) {
        const key = feature.type === "laser" ? `laser${Math.max(1, Number(feature.damage) || 1)}` : feature.type;
        countInto(endFeatures, key);
      }
    }
    return {
      index: start.index,
      reachable: Boolean(start.reachable),
      search: {
        score: roundedOrNull(route.score, 2),
        actions: route.actions ?? null,
        distance: route.distance ?? null,
        forcedDistance: route.forcedDistance ?? null,
        hazard: roundedOrNull(route.hazard, 2),
        rebootPenalty: roundedOrNull(route.rebootPenalty, 2),
        cardAvailabilityPenalty: roundedOrNull(route.cardAvailabilityPenalty, 2),
        programPlausibilityPenalty: roundedOrNull(route.programPlausibilityPenalty, 2),
        rebootCount: route.rebootCount ?? rebooted,
        crashed,
        courseEstimateScore: roundedOrNull(start.courseEstimate?.totalScore, 2),
        trafficPenalty: roundedOrNull(start.trafficPenalty, 2)
      },
      re: {
        effective: roundedOrNull(start.normalFairnessEffectiveRE),
        intrinsic: roundedOrNull(route.normalFairnessIntrinsicRE ?? start.normalFairnessIntrinsicRE),
        registers: start.normalFairnessRegisterCount ?? null,
        intrinsicComponents: route.normalFairnessIntrinsicREComponents
          ? Object.fromEntries(Object.entries(route.normalFairnessIntrinsicREComponents)
            .map(([key, value]) => [key, roundedOrNull(value)]))
          : null,
        components: start.normalFairnessComponents
          ? Object.fromEntries(Object.entries(start.normalFairnessComponents)
            .map(([key, value]) => [key, typeof value === "number" ? roundedOrNull(value) : value]))
          : null
      },
      encounters: { cards, endFeatures, boardEvents }
    };
  });
}

// The variant rules active on a generated (or reanalysed) course.
export function getCalibrationActiveVariantIds(scenario) {
  if (!scenario) return [];
  return VARIANT_DEFINITIONS.map((variant) => variant.id).filter((id) => scenario[id] === true);
}

export function summarizeCalibrationScenario(assets, scenario) {
  if (!scenario) return null;
  const { pieceMap } = assets;
  const boardPlacements = scenario.placements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return !placement.overlay && piece?.kind !== "dock";
  });
  const dockPlacements = getDockPlacementsFromScenarioPlacements(scenario.placements, pieceMap);
  const overlayPlacements = scenario.placements.filter((placement) => placement.overlay);
  const tileMap = buildResolvedMap(scenario.placements, pieceMap).tileMap;
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints ?? [], scenario.virtualBots);
  const construction = buildCalibrationConstructionSnapshot({
    boardPlacements,
    dockPlacements,
    overlayPlacements,
    checkpoints: playableCheckpoints,
    starts: scenario.activeStarts ?? [],
    tileMap,
    pieceMap,
    preferences: scenario.preferences ?? {}
  });
  const metrics = scenario.metrics ?? {};
  const contextualCache = scenario.sequence?.firstLeg?.summary?.contextualLegCache ?? null;
  return {
    construction,
    variants: getCalibrationActiveVariantIds(scenario),
    routes: summarizeCalibrationRoutes(tileMap, scenario),
    outcome: {
      acceptable: Boolean(metrics.acceptable),
      exactTargetMatch: Boolean(metrics.exactTargetMatch),
      hardFailures: [...(metrics.hardFailures ?? [])],
      softFailures: [...(metrics.softFailures ?? [])],
      softFitLimit: Number.isFinite(Number(metrics.softFitLimit)) ? Number(metrics.softFitLimit) : null,
      fitComponents: metrics.fitComponents ? { ...metrics.fitComponents } : null,
      // Construction calibration still records the historical raw scalar until
      // the later guidance-model retraining pass. Record the new semantic owner
      // beside it so future calibration can transition without losing evidence.
      difficultyRaw: Number.isFinite(Number(metrics.difficultyRaw)) ? Number(metrics.difficultyRaw) : null,
      difficultyTurnRE: Number.isFinite(Number(metrics.difficultyTurnRE)) ? Number(metrics.difficultyTurnRE) : null,
      lengthRaw: Number.isFinite(Number(metrics.lengthRaw)) ? Number(metrics.lengthRaw) : null,
      lengthWallClockTurnIndex: Number.isFinite(Number(metrics.lengthWallClockTurnIndex))
        ? Number(metrics.lengthWallClockTurnIndex)
        : null,
      lengthSemanticUnit: metrics.lengthSemanticUnit ?? null,
      difficultyFit: Number.isFinite(Number(metrics.difficultyFit)) ? Number(metrics.difficultyFit) : null,
      lengthFit: Number.isFinite(Number(metrics.lengthFit)) ? Number(metrics.lengthFit) : null,
      fitScore: Number.isFinite(Number(metrics.fitScore)) ? Number(metrics.fitScore) : null,
      reachableStarts: Number(metrics.reachableStarts ?? scenario.validatedStartIndices?.length ?? 0),
      usableStarts: Array.isArray(metrics.usableStarts) ? metrics.usableStarts.length : Number(metrics.usableStarts ?? 0),
      openingFastestActions: metrics.openingLegAnticlimax?.fastestActions ?? null,
      openingPacingPenalty: metrics.openingLegAnticlimax?.penalty ?? 0,
      finalFastestActions: metrics.finalLegAnticlimax?.fastestActions ?? null,
      finalPacingPenalty: metrics.finalLegAnticlimax?.penalty ?? 0,
      meaningfulBoardUsePenalty:
        (metrics.boardFootprintUse ?? metrics.meaningfulBoardUse)?.penalty ?? 0,
      boardFootprintUsePenalty:
        (metrics.boardFootprintUse ?? metrics.meaningfulBoardUse)?.penalty ?? 0,
      boardCleanupAuditTrail:
        (metrics.boardCleanupAuditTrail ?? []).map((entry) => ({
          pass: entry.pass,
          decisions: (entry.decisions ?? []).map((decision) => ({
            boardIndex: decision.boardIndex,
            pieceId: decision.pieceId,
            action: decision.action,
            reason: decision.reason,
            ablation: decision.ablation ? { ...decision.ablation } : null,
            comparison: decision.comparison ? {
              ...decision.comparison,
              reasons: [...(decision.comparison.reasons ?? [])],
              deltas: decision.comparison.deltas ? { ...decision.comparison.deltas } : null
            } : null
          }))
        })),
      boardGameplayRelevance:
        metrics.boardGameplayRelevance?.boards?.map((board) => ({
          boardIndex: board.boardIndex,
          relevanceStatus: board.relevanceStatus,
          cleanupRecommendation: board.cleanupRecommendation,
          directRouteUse: board.directRouteUse,
          checkpointIndices: [...(board.checkpointIndices ?? [])],
          minimumTrackedRouteDistance: board.minimumTrackedRouteDistance,
          currentLegacyRetentionReasons: [...(board.currentLegacyRetentionReasons ?? [])],
          demonstratedReasons: [...(board.demonstratedReasons ?? [])],
          ablation: board.ablation ? { ...board.ablation } : null
        })) ?? [],
      routedBoardUse: ((metrics.boardFootprintUse ?? metrics.meaningfulBoardUse)?.boards ?? []).map((board) => ({
        boardIndex: board.boardIndex,
        uniqueRouteTiles: board.uniqueRouteTiles,
        routeVisits: board.routeVisits,
        representativeRegisters: board.representativeRegisters,
        maxDepth: board.maxDepth,
        targetDepth: board.targetDepth,
        bestTransitRegisters: board.bestTransitRegisters,
        bestTransitDepth: board.bestTransitDepth,
        hasEfficientTransit: board.hasEfficientTransit,
        finalCheckpointOnBoard: board.finalCheckpointOnBoard,
        contributionScore: board.contributionScore,
        weakUse: board.weakUse,
        penalty: board.penalty
      })),
      trafficAveragePenalty: scenario.sequence?.firstLeg?.summary?.fullCourseTraffic?.averagePenalty ?? null,
      trafficAverageRawPenalty: scenario.sequence?.firstLeg?.summary?.fullCourseTraffic?.averageRawPenalty ?? null,
      estimatedPhysicalRoutes: contextualCache?.estimatedMilestoneRoutes ?? null,
      exactRealizedRoutes: contextualCache?.survivingStarts ?? null
    }
  };
}

export async function loadCalibrationAssets() {
  return loadAssets();
}

// Headless entry points for scripts/golden.js. They wrap the exact production
// generate / save / reload paths without any DOM or storage access.
export async function generateScenarioForTesting(assets, preferences, options = {}) {
  resetAnalysisTelemetry();
  return runProductionGeneration(assets, preferences, {
    seed: options.seed,
    // Optional Stop / progress hooks, as the Generate button passes them.
    generationOptions: options.generationOptions
  });
}

export function serializeScenarioForTesting(scenario) {
  return serializeScenario(scenario);
}

export async function hydrateScenarioForTesting(assets, snapshot) {
  return hydrateScenarioFromSnapshot(assets, snapshot);
}

export function describeCalibrationInventory(assets, requestedExpansionIds = null) {
  const pieceMap = assets?.pieceMap ?? {};
  const expansionIds = normalizeCalibrationExpansionIds(pieceMap, requestedExpansionIds);
  const expansionSet = new Set(expansionIds);
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionSet);
  const dockIds = getAvailableDockIds(pieceMap, expansionSet);
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionSet);
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  return {
    expansionIds,
    baseExpansionId: pieceMap["docking-bay-a"]?.expansionId ?? "roborally",
    mainBoardIds,
    dockIds,
    overlayBoardIds: overlayIds.filter((id) => !isMiniOverlayPiece(pieceMap[id])),
    overlayTileIds: overlayIds.filter((id) => isMiniOverlayPiece(pieceMap[id])),
    physicalBoardCount: countPhysicalBoards(mainBoardIds, pieceMap),
    // Calibration inventory reports physical sampling capacity, not production
    // eligibility for every requested length. The runner restricts fifth and sixth
    // large boards to explicit Epic observations.
    maxBoardCount: Math.min(6, countPhysicalBoards(mainBoardIds, pieceMap)),
    maxSingleDockStartCount: dockIds.reduce((maximum, dockId) => (
      Math.max(maximum, pieceMap[dockId]?.starts?.length ?? 0)
    ), 0),
    hasLargeBoards,
    expansionSummary: expansionIds.map((expansionId) => {
      const pieces = Object.values(pieceMap).filter((piece) => piece.expansionId === expansionId);
      const boards = pieces.filter((piece) => piece.kind === "base" || piece.kind === "small");
      const overlays = pieces.filter((piece) => piece.overlayCapable);
      return {
        expansionId,
        boardFaces: boards.length,
        largeBoardFaces: boards.filter((piece) => piece.kind !== "small").length,
        smallBoardFaces: boards.filter((piece) => piece.kind === "small").length,
        docks: pieces.filter((piece) => piece.kind === "dock").length,
        overlayBoards: overlays.filter((piece) => !isMiniOverlayPiece(piece)).length,
        overlayTiles: overlays.filter((piece) => isMiniOverlayPiece(piece)).length
      };
    })
  };
}

const LEG_CHOICE_LIMIT = 150;

// Collects the estimated leg searches' candidate lists (ranked as the search ranks
// them, chosen first) and prices each candidate with the RE ledger, using the
// tile map and options that search ran with.
function createLegChoiceCollector() {
  const choices = [];
  const seen = new Set();
  const sink = ({ legIndex, searchPurpose, ranked, tileMap, options }) => {
    if (!Array.isArray(ranked) || ranked.length < 2 || choices.length >= LEG_CHOICE_LIMIT) return;
    const key = `${legIndex}|${ranked.map((route) => `${route.absoluteStartAction}:${route.score}`).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    choices.push({
      legIndex,
      purpose: searchPurpose,
      candidates: ranked.map((route) => {
        const ledger = summarizeRegisterEquivalentLedger(tileMap, route, options, null);
        return {
          score: roundedOrNull(route.score, 2),
          actions: route.actions ?? null,
          hazard: roundedOrNull(route.hazard, 2),
          re: roundedOrNull(ledger?.observationalSubtotalWithMentalRE),
          cardRE: roundedOrNull(ledger?.cleanCardPlausibilityRE),
          damageRE: roundedOrNull((Number(ledger?.damageCardSupplyRE) || 0) + (Number(ledger?.clogRE) || 0)),
          energyRE: roundedOrNull(ledger?.energyRE),
          mentalRE: roundedOrNull(ledger?.mentalRegisterEquivalents)
        };
      })
    });
  };
  return { sink, choices };
}

export async function generateCalibrationObservation(assets, options = {}) {
  const inventory = describeCalibrationInventory(assets, options.expansionIds);
  if (!inventory.expansionIds.length) throw new Error("No supported expansion data selected for calibration.");
  const playerCount = Math.max(2, Math.floor(Number(options.playerCount) || 4));
  const boardCount = Math.max(1, Math.floor(Number(options.boardCount) || 1));
  const flagCount = Math.max(1, Math.floor(Number(options.flagCount) || 2));
  const difficulty = DIAGNOSTIC_DIFFICULTIES.includes(options.difficulty) ? options.difficulty : "moderate";
  const length = DIAGNOSTIC_LENGTHS.includes(options.length) ? options.length : "moderate";
  const generationMode = normalizeGenerationMode(options.generationMode ?? "balanced");
  const boardSpread = normalizeBoardSpread(options.boardSpread);
  const overlayMode = normalizeOverlayMode(options.overlayMode ?? OVERLAY_MODES.no);
  const forcedVariantIds = Array.isArray(options.forcedVariantIds) ? options.forcedVariantIds : [];
  const selectedExpansions = Object.fromEntries(inventory.expansionIds.map((id) => [id, true]));
  const preferences = {
    playerCount,
    difficulty,
    length,
    generationMode,
    boardSpread,
    overlayMode,
    selectedExpansions,
    allowedVariantRules: buildCalibrationVariantStates(forcedVariantIds),
    calibrationBoardCount: boardCount,
    calibrationFlagCount: flagCount,
    calibrationUnguidedBoardSelection: options.unguidedBoardSelection !== false,
    calibrationCheckpointSamplingRegime: CALIBRATION_CHECKPOINT_SAMPLING_REGIMES.includes(options.checkpointSamplingRegime)
      ? options.checkpointSamplingRegime
      : "ordinary",
    calibrationObserveTargetMisses: true,
    calibrationSingleCheckpointProposal: options.singleCheckpointProposal !== false,
    calibrationCaptureEvidence: true,
    calibrationBoardOverlayCount: options.boardOverlayCount != null &&
      Number.isInteger(Number(options.boardOverlayCount))
      ? Math.max(0, Math.floor(Number(options.boardOverlayCount)))
      : null,
    calibrationConstructionGuidanceStrength: Number.isFinite(Number(options.guidanceStrength))
      ? Number(options.guidanceStrength)
      : 1
  };

  resetAnalysisTelemetry();
  clearAnalysisCaches();
  const startedAt = generationNow();
  const seed = Number.isFinite(Number(options.seed)) ? (Math.floor(Number(options.seed)) >>> 0) : null;

  // Calibration deliberately samples broad setup/inventory combinations. A setup
  // which the ordinary UI would reject is not a generator exception and must not
  // pollute the harness error rate. Preserve it as an explicit skipped observation
  // so the runner can rebalance the sampling plan later if a stratum produces too
  // many impossible setup requests.
  const inventoryError = validateSelectedInventory(assets, preferences);
  if (inventoryError) {
    const telemetry = getAnalysisTelemetrySnapshot();
    return {
      scenario: null,
      evaluationsUsed: 0,
      rejectionEvents: [{
        category: "setup-invalid",
        reason: inventoryError
      }],
      calibrationConstructionSnapshot: null,
      calibrationStatus: "setup-invalid",
      preferences,
      inventory,
      elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
      telemetrySummary: summarizeCalibrationTelemetry(telemetry),
      evidence: null
    };
  }

  let result;
  const legChoices = createLegChoiceCollector();
  setCalibrationLegCandidateSink(legChoices.sink);
  try {
    result = await withGenerationRandomSeed(seed, () => createRandomCandidate(
      assets,
      preferences,
      1,
      1,
      null,
      null,
      null
    ));
  } catch (error) {
    setCalibrationLegCandidateSink(null);
    // createRandomCandidate historically throws when the sampled board faces and
    // dock cannot form a legal physical layout. Browser generation treats that as
    // an attempt failure and tries another construction. In calibration one attempt
    // is the observation, so this is evidence rather than a harness error.
    if (error?.message === "Unable to create a valid board layout") {
      const telemetry = getAnalysisTelemetrySnapshot();
      return {
        scenario: null,
        evaluationsUsed: 1,
        rejectionEvents: [{
          category: "board-layout",
          reason: error.message
        }],
        calibrationConstructionSnapshot: null,
        calibrationStatus: "construction-rejection",
        preferences,
        inventory,
        elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
        telemetrySummary: summarizeCalibrationTelemetry(telemetry),
        evidence: null
      };
    }
    throw error;
  }
  setCalibrationLegCandidateSink(null);

  const telemetry = getAnalysisTelemetrySnapshot();
  const evidence = result?.scenario
    ? summarizeCalibrationScenario(assets, result.scenario)
    : (result?.calibrationConstructionSnapshot
      ? { construction: result.calibrationConstructionSnapshot, outcome: null }
      : null);
  if (evidence) evidence.legChoices = legChoices.choices;
  return {
    ...result,
    calibrationStatus: result?.scenario
      ? "scenario"
      : (result?.calibrationConstructionSnapshot ? "analyzed-rejection" : "construction-rejection"),
    preferences,
    inventory,
    elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
    telemetrySummary: summarizeCalibrationTelemetry(telemetry),
    evidence
  };
}

export function analyzeCalibrationPlacements(assets, sourceScenario, placements, options = {}) {
  if (!placements?.length || !sourceScenario?.checkpoints?.length) return null;
  const { pieceMap } = assets;
  const playerCount = Math.max(2, Math.floor(Number(options.playerCount ?? sourceScenario.playerCount) || 4));
  const generationMode = normalizeGenerationMode(options.generationMode ?? sourceScenario.preferences?.generationMode ?? "balanced");
  const difficulty = DIAGNOSTIC_DIFFICULTIES.includes(sourceScenario.preferences?.difficulty)
    ? sourceScenario.preferences.difficulty
    : "moderate";
  const length = DIAGNOSTIC_LENGTHS.includes(sourceScenario.preferences?.length)
    ? sourceScenario.preferences.length
    : "moderate";
  const forcedVariantIds = Array.isArray(options.variantIds)
    ? options.variantIds
    : (options.dynamicArchiving ? ["dynamicArchiving"] : []);
  const variantBundle = buildVariantBundle(
    Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, forcedVariantIds.includes(variant.id)])),
    { pieceMap }
  );
  const recoveryRule = variantBundle.recoveryRule ?? "reboot_tokens";
  const checkpoints = getPlayableCheckpoints(sourceScenario.checkpoints, sourceScenario.virtualBots);
  const boardPlacements = placements.filter((placement) => {
    const kind = pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, pieceMap);
  const boardRects = buildBoardRects(boardPlacements, pieceMap);
  const resolved = buildResolvedMap(placements, pieceMap);
  const tileMap = resolved.tileMap;
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags: false, movingTargets: false });
  const activeStarts = filterStartsForGoals(resolved.starts, checkpoints).map((start, index) => ({ ...start, analysisIndex: index }));
  const overlayRebootRects = normalizeOverlayReboot(sourceScenario.preferences?.overlayReboot) === OVERLAY_REBOOT_MODES.own
    ? buildBoardRects(
      placements.filter((placement) => placement.overlay && !isMiniOverlayPiece(pieceMap[placement.pieceId])),
      pieceMap
    )
    : [];
  const boardRebootPlacement = recoveryRule === "reboot_tokens"
    ? placeRebootTokens(boardRects, tileMap, checkpoints, playerCount, overlayRebootRects, {
      lessDeadlyGame: Boolean(variantBundle.lessDeadlyGame)
    })
    : null;
  const rebootTokens = boardRebootPlacement?.tokens ?? [];
  if (boardRebootPlacement?.missingCount > 0) {
    return null;
  }
  const baseOptions = applyVariantAnalysisOptions({
    ...getRouteAnalysisVariantOptions({
      ...(sourceScenario.preferences ?? {}),
      difficulty,
      length,
      generationMode
    }),
    rebootTokens,
    boardRects,
    difficulty,
    length,
    generationMode,
    contextualEarlyExit: true
  }, variantBundle);
  const routeAwareOptions = buildRouteAwareBatteryScoringOptions(null, { ...baseOptions, ...variantBundle });
  const profile = getGenerationModeProfile({ generationMode });
  const analysisOptions = {
    ...baseOptions,
    ...routeAwareOptions,
    contextualFastCardState: true,
    contextualEstimatedEnergyGuidance: true,
    fastBaselineTrafficEnabled: profile.trafficEnabled,
    modeTrafficEnabled: profile.trafficEnabled,
    trafficEnabledOverride: profile.trafficEnabled,
    contextualTrafficFeedbackEnabled: profile.trafficEnabled && profile.trafficEpochs > 0,
    contextualTrafficDrivenAlternates: profile.trafficEnabled && profile.trafficEpochs > 0,
    contextualTrafficEpochs: profile.trafficEpochs,
    contextualTrafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
    contextualTrafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
    contextualTrafficAlternateMaxNewSearchesPerEpoch: profile.trafficAlternateMaxNewSearchesPerEpoch,
    contextualTrafficAlternateMaxNewSearchesTotal: profile.trafficAlternateMaxNewSearchesTotal,
    contextualTrafficAlternateExpansions: profile.trafficAlternateExpansions,
    contextualTrafficAlternateMaxActions: profile.trafficAlternateMaxActions,
    contextualTrafficAlternateCachedProbeMargin: profile.trafficAlternateCachedProbeMargin,
    contextualTrafficAlternateCachedProbeMaxSimilarity: profile.trafficAlternateCachedProbeMaxSimilarity,
    contextualTrafficAlternateLegsPerStart: profile.trafficAlternateLegsPerStart,
    contextualTrafficExplorationUncertaintyShare: profile.trafficExplorationUncertaintyShare,
    contextualTrafficExplorationConfidenceFloor: profile.trafficExplorationConfidenceFloor,
    contextualTrafficAlternateUncertaintyEffortFloor: profile.trafficAlternateUncertaintyEffortFloor,
    contextualTrafficAlternateUncertaintyEffortExponent: profile.trafficAlternateUncertaintyEffortExponent,
    contextualSharedLaterLegCatalogue: true,
    contextualEstimatedPrimaryRouting: true,
    contextualPhysicalTemplateRoutes: profile.primaryWitnessRoutes,
    contextualPrimaryWitnessRoutes: profile.primaryWitnessRoutes,
    contextualPhysicalTemplateExpansions: 700,
    contextualPhysicalTemplateMaxActions: 36,
    contextualExactRepairExpansions: 380,
    contextualRequiredStarts: playerCount
  };

  resetAnalysisTelemetry();
  clearAnalysisCaches();
  const startedAt = generationNow();
  const sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, playerCount, analysisOptions);
  const metrics = classifyCandidate(sequence, {
    ...(sourceScenario.preferences ?? {}),
    playerCount,
    difficulty,
    length,
    generationMode,
    flagCount: checkpoints.length,
    recoveryRule,
    ...variantBundle
  }, {
    boardPlacements,
    dockPlacements,
    pieceMap,
    checkpoints,
    tileMap,
    goalTileMap,
    rebootTokens
  });
  const telemetry = getAnalysisTelemetrySnapshot();
  const syntheticScenario = {
    ...sourceScenario,
    ...variantBundle,
    placements,
    overlayPlacements: placements.filter((placement) => placement.overlay),
    dockPlacements,
    boardRects,
    checkpoints,
    rebootTokens,
    activeStarts,
    sequence,
    metrics,
    playerCount,
    recoveryRule,
    preferences: {
      ...(sourceScenario.preferences ?? {}),
      playerCount,
      difficulty,
      length,
      generationMode,
      recoveryRule
    }
  };
  return {
    elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
    telemetrySummary: summarizeCalibrationTelemetry(telemetry),
    evidence: summarizeCalibrationScenario(assets, syntheticScenario)
  };
}

export function reanalyzeCalibrationScenario(assets, sourceScenario, options = {}) {
  if (!sourceScenario?.placements?.length || !sourceScenario?.checkpoints?.length) return null;
  const placements = options.removeOverlays
    ? sourceScenario.placements.filter((placement) => !placement.overlay)
    : sourceScenario.placements;
  return analyzeCalibrationPlacements(assets, sourceScenario, placements, options);
}


// Variants that change rules on an unchanged layout, so one built course can be
// reloaded with and without them. Layout variants (docks, staggering, Virtual
// Bots, Moving Targets) are compared between courses instead, and so is
// Competitive: it needs a course built with enough starts for n blocks plus n
// picks, and switched on elsewhere it falls back to judging every start.
export const CALIBRATION_TOGGLE_VARIANT_IDS = Object.freeze([
  "actFast", "lighterGame", "upgradeWorld", "lessSpammyGame", "criticalSpam",
  "criticalHaywire", "permanentShutdown", "lessDeadlyGame", "moreDeadlyGame",
  "cuttingFloor", "flamingOil", "repulsorOverdrive", "setToKill", "setToStun",
  "dynamicArchiving", "homeReboot", "hazardousFlags", "repairStations",
  "factoryRejects", "startupSpinUp", "lessForeshadowing", "classicSharedDeck",
  "payToWin", "subsidizedStarts"
]);
const RECOVERY_RULE_BY_VARIANT = { dynamicArchiving: "dynamic_archiving", homeReboot: "home_reboot" };

// The first variant of `order` that can be switched on this course: switching off
// an active one is always possible; switching one on must not conflict with the
// active set, lack a variant it requires, or be inert on this course, and a
// recovery rule is only switched on from reboot tokens (the snapshot has no
// tokens to fall back to otherwise).
export function chooseCalibrationVariantToggle(scenario, order = CALIBRATION_TOGGLE_VARIANT_IDS) {
  const active = new Set(getCalibrationActiveVariantIds(scenario));
  let courseContext = null;
  const canMatter = (variantId) => {
    courseContext ??= {
      rawTileMap: buildResolvedMap(scenario.placements, scenario.pieceMap).tileMap,
      checkpoints: getPlayableCheckpoints(scenario.checkpoints ?? [], scenario.virtualBots),
      movingTargets: Boolean(scenario.movingTargets)
    };
    return !getVariantCourseUnavailabilityReason(variantId, scenario.goalTileMap, courseContext);
  };
  for (const variantId of order) {
    if (!CALIBRATION_TOGGLE_VARIANT_IDS.includes(variantId)) continue;
    if (active.has(variantId)) {
      if (RECOVERY_RULE_BY_VARIANT[variantId]) continue;
      return { variantId, on: false };
    }
    if (getCourseConflictingVariantIds(variantId).some((id) => active.has(id))) continue;
    const activeMap = Object.fromEntries([...active].map((id) => [id, true]));
    if (getMissingRequiredVariantIds(variantId, {}, activeMap, { selfState: "allowed" }).length) continue;
    if (RECOVERY_RULE_BY_VARIANT[variantId] && (scenario.recoveryRule ?? "reboot_tokens") !== "reboot_tokens") continue;
    if (!canMatter(variantId)) continue;
    return { variantId, on: true };
  }
  return null;
}

function summarizeCalibrationReload(assets, scenario) {
  if (!scenario || scenario.hydrationPresentationFallback || scenario.hydrationPresentationUnavailable) return null;
  const summary = summarizeCalibrationScenario(assets, scenario);
  return { variants: summary.variants, outcome: summary.outcome };
}

// Reloads a built course twice through the production reload path: as built, and
// with one variant switched. Both sides take the same path, so their difference
// is the variant's effect on this course.
export async function evaluateCalibrationVariantToggle(assets, scenario, toggle) {
  if (!scenario || !toggle?.variantId) return null;
  const snapshot = JSON.parse(JSON.stringify(serializeScenario(scenario)));
  const toggled = JSON.parse(JSON.stringify(snapshot));
  toggled[toggle.variantId] = Boolean(toggle.on);
  if (toggle.variantId === "actFast") {
    toggled.actFastMode = toggle.on ? chooseActFastMode(scenario.preferences ?? {}) : null;
  }
  const recoveryRule = RECOVERY_RULE_BY_VARIANT[toggle.variantId];
  if (recoveryRule) {
    for (const id of Object.keys(RECOVERY_RULE_BY_VARIANT)) toggled[id] = id === toggle.variantId && toggle.on;
    toggled.recoveryRule = toggle.on ? recoveryRule : "reboot_tokens";
  }
  const startedAt = generationNow();
  const baseline = await hydrateScenarioFromSnapshot(assets, snapshot);
  const baselineMs = generationNow() - startedAt;
  let treated = null;
  let treatedFailure = null;
  try {
    treated = await hydrateScenarioFromSnapshot(assets, toggled);
  } catch (error) {
    // The switched rule can leave the course without enough routable starts;
    // that is an outcome, not a harness error.
    treatedFailure = error?.message ?? String(error);
  }
  return {
    variantId: toggle.variantId,
    on: Boolean(toggle.on),
    baselineMs: Number(baselineMs.toFixed(2)),
    treatedMs: Number((generationNow() - startedAt - baselineMs).toFixed(2)),
    baseline: summarizeCalibrationReload(assets, baseline),
    treated: summarizeCalibrationReload(assets, treated),
    treatedFailure
  };
}

// v49ce: automatic v49cd targeted card-pressure diagnostic retired.
// The analyzer implementation remains dormant for explicit future experiments.
