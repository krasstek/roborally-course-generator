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
  resetAnalysisTelemetry
} from "../../analyze.js";
import { buildResolvedMap } from "../../board.js";
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
import { OVERLAY_MODES, normalizeBoardSpread, normalizeOverlayMode } from "./preferences.js";
import { withGenerationRandomSeed } from "./random.js";
import { placeRebootTokens } from "./reboot-tokens.js";
import { generationNow } from "./scheduling.js";
import {
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

  const telemetry = getAnalysisTelemetrySnapshot();
  return {
    ...result,
    calibrationStatus: result?.scenario
      ? "scenario"
      : (result?.calibrationConstructionSnapshot ? "analyzed-rejection" : "construction-rejection"),
    preferences,
    inventory,
    elapsedMs: Number((generationNow() - startedAt).toFixed(2)),
    telemetrySummary: summarizeCalibrationTelemetry(telemetry),
    evidence: result?.scenario
      ? summarizeCalibrationScenario(assets, result.scenario)
      : (result?.calibrationConstructionSnapshot
        ? { construction: result.calibrationConstructionSnapshot, outcome: null }
        : null)
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
  const forcedVariantIds = options.dynamicArchiving ? ["dynamicArchiving"] : [];
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
  const rebootTokens = recoveryRule === "reboot_tokens"
    ? placeRebootTokens(boardRects, tileMap, checkpoints, playerCount)
    : [];
  if (recoveryRule === "reboot_tokens" && rebootTokens.length < boardRects.length) {
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


// v49ce: automatic v49cd targeted card-pressure diagnostic retired.
// The analyzer implementation remains dormant for explicit future experiments.
