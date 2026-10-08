// Robo Rally Course Randomizer - candidate builder: one course candidate from layout to classified, routed result (createRandomCandidate), with inventory validation, retry and route-work budgets
import {
  analyzeFullCourse,
  analyzeFullCourseCooperative,
  clearAnalysisCaches,
  getAnalysisTelemetrySnapshot,
  getCompletedRouteExpansions
} from "../../analyze.js";
import { buildResolvedMap } from "../../board.js";
import {
  applyVariantAnalysisOptions,
  applyVariantGenerationOptions,
  applyVariantScenarioState
} from "../../variants.js";
import {
  analyzeFlagSequence,
  buildCoursePreflightSequence,
  buildRouteAwareBatteryScoringOptions,
  classifyCoursePreflight,
  getPreflightGrossCourseMismatch,
  mergeLightweightPrunedStarts,
  screenSandwichedExtraDockOpening
} from "./analysis-orchestration.js";
import {
  buildDockSummaries,
  createBoardPlacements,
  createDockPlacement,
  findBridgeDockPlacement,
  getBoardPlacementPlanningContext,
  getProtectedSandwichBoardIndices,
  getSandwichedDockFacingTowardCheckpoint,
  hasAlignedDockFrontage,
  hasPhysicalSandwichedDock,
  orientSandwichedDockStartsTowardCheckpoint
} from "./board-layout.js";
import {
  buildCalibrationConstructionSnapshot,
  summarizeCalibrationLayout
} from "./calibration-features.js";
import { getFallbackScenarioScore } from "./candidate-selection.js";
import {
  applyFlagOverrides,
  filterStartsForGoals,
  getCheckpointSpacingExpectationProfile,
  getFlagCandidates,
  getPlayableCheckpoints,
  pickFlags,
  pickFlagsCooperative,
  sampleCheckpointProposalWithExpectations
} from "./checkpoints.js";
import { classifyCandidate } from "./classification.js";
import {
  LIGHT_START_SURPLUS,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN
} from "./config.js";
import {
  pruneIrrelevantOverlayPlacements,
  pruneUnusedBoardPlacements,
  pruneUnusedDockPlacements
} from "./construction-cleanup.js";
import {
  getCalibratedConstructionPlan,
  getConstructionGuidanceGrossMismatch,
  guidanceLevelForAttempt,
  predictConstructionGuidanceStage,
  sampleConstructionGuidanceRankedCandidate
} from "./construction-guidance.js";
import {
  cloneContextualSearchHealth,
  compactRouteWork,
  describeGenerationRejection,
  getGenerationRejectionCategory,
  summarizeRouteSearchDelta
} from "./diagnostics.js";
import {
  isDevFastAlternatesEnabled,
  isDevFastTrafficEnabled,
  isDevRouteModelOverrideActive
} from "./environment.js";
import {
  compareWholeCourseBoardAblationStates,
  getCourseConstructionFingerprint,
  summarizeWholeCourseBoardAblationState
} from "./fingerprints.js";
import {
  getConstructionGuidanceModePolicy,
  getGenerationModeProfile,
  isCalibrationHarnessGeneration,
  normalizeGenerationMode
} from "./generation-modes.js";
import { buildBoardRects, isMiniOverlayPiece, pointOnPlacement } from "./layout-geometry.js";
import { collectMovingTargetReentryMarkers, getMovingCheckpointTrace } from "./moving-targets.js";
import { chooseNoDockStartingZones } from "./no-docks.js";
import { chooseOverlayPlacements } from "./overlays.js";
import {
  BOARD_SPREAD_MODES,
  getSelectedExpansionIds,
  normalizeBoardSpread,
  normalizeOverlayMode
} from "./preferences.js";
import { generationRandom, sample, shuffle } from "./random.js";
import { placeHomeRebootTokens, placeRebootTokens } from "./reboot-tokens.js";
import {
  GENERATION_COOPERATIVE_SEARCH_CHECK_POPS,
  GENERATION_COOPERATIVE_SEARCH_SLICE_MS,
  GENERATION_COOPERATIVE_YIELD_INTERVAL_MS,
  GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS,
  formatCooperativeRouteProgressStage,
  generationNow,
  nextEventLoopTurn,
  nextFrame
} from "./scheduling.js";
import { computeCourseReachableStarts, computeUsableStarts } from "./start-balance.js";
import { formatGrossCourseMismatch, getGrossCourseMismatch } from "./targets.js";
import {
  applyCourseVariantAvailability,
  canSupportRequiredDockStarts,
  chooseActFastMode,
  chooseVariantBundle,
  getActiveVariantConstructionRequirements,
  getAvailableMainBoardIds,
  getDockConfigurations,
  getDockSelectionWeight,
  getEligibleDockIds,
  getExtraDockModeState,
  getMaximumAvailableDockStartCapacity,
  getRequiredDockStartCount,
  getRouteAnalysisVariantOptions,
  getVariantDefinitionLabel,
  getVariantPreferenceState,
  isVariantForced,
  neutralFlagCount,
  weightedOrder
} from "./variant-availability.js";
import {
  buildVirtualRobotStarts,
  hideVirtualFlagZeroFeature,
  pickVirtualBotEntry,
  pickVirtualBotEntryFacing
} from "./virtual-bots.js";

export function validateSelectedInventory(assets, preferences) {
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(assets.pieceMap, expansionIds);
  const virtualBotsState = getVariantPreferenceState(preferences, "virtualBots");
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessSetupAvailable = virtualBotsState !== "off" || noDocksState !== "off";
  if (!availableDockIds.length && !docklessSetupAvailable) {
    return "The selected sets contain no docking bay. Enable No Docks or Virtual Bots, or select a set with a docking bay.";
  }
  const docklessSetupForced = virtualBotsState === "forced" || noDocksState === "forced";
  const docklessSetupPermitted = virtualBotsState !== "off" || noDocksState !== "off";
  if (!docklessSetupPermitted && availableDockIds.length && !canSupportRequiredDockStarts(availableDockIds, assets.pieceMap, preferences)) {
    const requiredStarts = getRequiredDockStartCount(preferences);
    const dockCapacity = getMaximumAvailableDockStartCapacity(availableDockIds, assets.pieceMap, preferences);
    return `The selected dock settings provide at most ${dockCapacity} starting spaces for this setup (${requiredStarts} needed). Allow Extra Docks or No Docks, reduce the player count, or select sets with more dock capacity.`;
  }
  if (!docklessSetupForced && availableDockIds.length && !getDockConfigurations(availableDockIds, assets.pieceMap, preferences).length && !docklessSetupPermitted) {
    return getExtraDockModeState(preferences) === "forced"
      ? "Extra Docks is required, but the selected sets do not provide a valid multiple-dock setup."
      : "The selected sets do not provide a valid docking bay setup for these rules.";
  }

  const availableMainBoardIds = getAvailableMainBoardIds(assets.pieceMap, expansionIds);
  if (!availableMainBoardIds.length) {
    return "The selected sets contain no supported main boards for course generation yet.";
  }

  return null;
}

export function getFlagRetryBudget(preferences = {}, remainingEvaluations = 1) {
  // Calibration observations remain one-proposal samples. Production retries are
  // mode-driven, not target-driven: target fit is now handled by staged
  // calibration ranking rather than Easy/Hard or Short/Long retry tables.
  if (preferences.calibrationSingleCheckpointProposal) {
    return 1;
  }
  const retriesByMode = {
    fastest: 2,
    fast: 3,
    standard: 4,
    balanced: 5,
    thorough: 6
  };
  const retries = retriesByMode[normalizeGenerationMode(preferences.generationMode)] ?? 4;
  return Math.max(1, Math.min(remainingEvaluations, retries));
}

export function getFlagRetryStallLimit(preferences = {}) {
  const limitsByMode = {
    fastest: 2,
    fast: 2,
    standard: 2,
    balanced: 3,
    thorough: 3
  };
  return limitsByMode[normalizeGenerationMode(preferences.generationMode)] ?? 2;
}

// See the route-work safety net in createRandomCandidate. Sized from the
// comparison-harness baseline (2026-09-29): ordinary candidates use a median of
// ~9k expansions and at most ~183k, at up to 8.8x the calibrated prediction
// (p90 2.5x). While no acceptable course exists yet the budget is generous so a
// hard setup still finds one; once one exists, further candidates only compete
// for "better", so an expensive one is dropped much sooner.
export const CANDIDATE_ROUTE_WORK_BUDGET_FLOOR = 200000;
export const CANDIDATE_ROUTE_WORK_BUDGET_PREDICTION_MULTIPLIER = 10;
export const EXTRA_CANDIDATE_ROUTE_WORK_BUDGET_FLOOR = 60000;
export const EXTRA_CANDIDATE_ROUTE_WORK_BUDGET_PREDICTION_MULTIPLIER = 3;

export async function createRandomCandidate(assets, preferences, attempt = 1, remainingEvaluations = 1, onEvaluation = null, onStage = null, shouldStopBeforeRetry = null, shouldStopDuringAnalysis = null, onCooperativeProgress = null, sharedEstimatedCardTransitionMemoContext = null, hasAcceptableCandidate = null) {
  if (preferences?.difficulty === "any" || preferences?.length === "any") {
    throw new Error("Generation requires concrete difficulty and length targets; resolve Any before construction.");
  }

  // v48zj: browser generation supplies one explicit memo context for the whole
  // Generate run. Direct/calibration callers that omit it still get a candidate-
  // scoped context, preserving isolation while retaining the optimized code path.
  const estimatedCardTransitionMemoContext =
    sharedEstimatedCardTransitionMemoContext &&
    typeof sharedEstimatedCardTransitionMemoContext === "object"
      ? sharedEstimatedCardTransitionMemoContext
      : { byRuleSignature: new Map() };
  if (!(estimatedCardTransitionMemoContext.byRuleSignature instanceof Map)) {
    estimatedCardTransitionMemoContext.byRuleSignature = new Map();
  }

  const { pieceMap } = assets;
  let calibrationConstructionSnapshot = null;
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(pieceMap, expansionIds);
  const variantBundle = chooseVariantBundle(preferences, { pieceMap });
  const {
    actFast,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    extraDocks,
    noDocks,
    sandwichedDock,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing
  } = variantBundle;
  const startEnergyPricing = Boolean(payToWin || subsidizedStarts);
  const variantConstructionRequirements = getActiveVariantConstructionRequirements(variantBundle);
  let effectiveNoDocks = noDocks;
  if (effectiveNoDocks) {
    variantBundle.extraDocks = false;
    variantBundle.sandwichedDock = false;
  }
  const noDocksPreferenceState = getVariantPreferenceState(preferences, "noDocks");
  if (!availableDockIds.length && !virtualBots && noDocksPreferenceState !== "off") {
    effectiveNoDocks = true;
    variantBundle.noDocks = true;
  }
  if (competitiveMode && !virtualBots && !effectiveNoDocks && !sandwichedDock) {
    const competitiveDockPreferences = {
      ...preferences,
      playerCount: preferences.playerCount,
      competitiveMode: true,
      extraDocks: Boolean(variantBundle.extraDocks)
    };
    if (
      !canSupportRequiredDockStarts(availableDockIds, pieceMap, competitiveDockPreferences) &&
      noDocksPreferenceState !== "off"
    ) {
      effectiveNoDocks = true;
      variantBundle.noDocks = true;
      variantBundle.extraDocks = false;
    }
  }
  const actFastMode = actFast ? chooseActFastMode(preferences) : null;
  const generationPreferences = applyVariantGenerationOptions({
    ...preferences,
    generationAttempt: attempt,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    subsidizedStarts,
    extraDocks,
    noDocks: effectiveNoDocks,
    sandwichedDock,
    virtualBots,
    variantConstructionRequirements
  }, variantBundle);
  const generationStageContext = {
    movingTargets: Boolean(movingTargets),
    virtualBots: Boolean(virtualBots),
    competitiveMode: Boolean(competitiveMode),
    payToWin: Boolean(payToWin),
    subsidizedStarts: Boolean(subsidizedStarts),
    extraDocks: Boolean(extraDocks),
    sandwichedDock: Boolean(sandwichedDock),
    recoveryRule: recoveryRule ?? null,
    classicSharedDeck: Boolean(classicSharedDeck),
    lessForeshadowing: Boolean(lessForeshadowing),
    factoryRejects: Boolean(factoryRejects)
  };
  const reportStage = async (message, localEvaluation = 1) => {
    if (onStage) {
      await onStage(message, localEvaluation, generationStageContext);
    }
    if (typeof shouldStopDuringAnalysis === "function" && shouldStopDuringAnalysis()) {
      const error = new Error("Generation stop requested at a safe boundary.");
      error.code = "ANALYSIS_STOP_REQUESTED";
      throw error;
    }
  };
  let lastCooperativeRouteProgressDisplayAt = Number.NEGATIVE_INFINITY;
  let cooperativeRouteProgressTickerStep = 0;

  await reportStage("Building board and dock layout", 1);

  const docklessSetup = virtualBots || effectiveNoDocks;
  const dockConfigurations = docklessSetup ? [] : weightedOrder(
    getDockConfigurations(availableDockIds, pieceMap, generationPreferences).map((dockIds) => (
      [...dockIds].sort((left, right) => getDockSelectionWeight(pieceMap[right], generationPreferences) - getDockSelectionWeight(pieceMap[left], generationPreferences))
    )),
    (dockIds) => dockIds.reduce((sum, dockId) => sum + getDockSelectionWeight(pieceMap[dockId], generationPreferences), 0)
  );
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const orderedDockIds = weightedOrder(
    availableDockIds,
    (dockId) => getDockSelectionWeight(pieceMap[dockId], generationPreferences)
  );

  const boardPlanning = getBoardPlacementPlanningContext(
    pieceMap,
    expansionIds,
    generationPreferences
  );
  const sharedConstructionGuidancePlan = getCalibratedConstructionPlan(
    boardPlanning.maxBoards,
    boardPlanning.hasLargeBoards,
    generationPreferences,
    pieceMap,
    assets.constructionGuidance
  );
  const explicitCalibrationFlagCount = Number(generationPreferences.calibrationFlagCount);
  const planningFlagCount = Number.isInteger(explicitCalibrationFlagCount) && explicitCalibrationFlagCount > 0
    ? explicitCalibrationFlagCount
    : Number.isInteger(Number(sharedConstructionGuidancePlan?.flagCount))
      ? Number(sharedConstructionGuidancePlan.flagCount)
      : neutralFlagCount(6);

  const buildOneBoardDockProposal = () => {
    let proposalBoardLayout = null;
    let proposalDockPlacements = [];
    let proposalDockSummaries = [];

    if (docklessSetup) {
      const layoutAnchors = orderedDockIds.length ? orderedDockIds : [null];
      for (const candidateDockId of layoutAnchors) {
        const candidateBoardLayout = createBoardPlacements(
          pieceMap,
          generationPreferences,
          expansionIds,
          candidateDockId,
          assets.constructionGuidance,
          sharedConstructionGuidancePlan
        );
        if (candidateBoardLayout) {
          proposalBoardLayout = candidateBoardLayout;
          break;
        }
      }
    } else {
      const configuredDockSets = sandwichedDock
        ? orderedDockIds.map((dockId) => [dockId])
        : (
          dockConfigurations.length && isVariantForced(preferences, "extraDocks")
            ? [...dockConfigurations, ...orderedDockIds.map((dockId) => [dockId])]
            : (dockConfigurations.length ? dockConfigurations : orderedDockIds.map((dockId) => [dockId]))
        );

      for (const dockConfiguration of configuredDockSets) {
        // Preserve the established dock-placement semantics. Calibration ranks
        // complete cheap board+dock proposals after they are structurally valid.
        if (!sandwichedDock || dockConfiguration.length === 1) {
          const candidateDockId = dockConfiguration[0];
          const candidateBoardLayout = createBoardPlacements(
            pieceMap,
            generationPreferences,
            expansionIds,
            candidateDockId,
            assets.constructionGuidance,
            sharedConstructionGuidancePlan
          );
          if (!candidateBoardLayout) continue;

          const candidateDockPlacements = [];
          let validDockSet = true;
          for (const dockId of dockConfiguration) {
            const flipOrder = shuffle([false, true]);
            let placedDock = null;
            for (const candidateFlip of flipOrder) {
              if (sandwichedDock && candidateDockPlacements.length === 0) {
                placedDock = findBridgeDockPlacement(
                  candidateBoardLayout.placements,
                  pieceMap,
                  dockId,
                  candidateFlip
                );
                if (
                  placedDock &&
                  generationPreferences.alignedLayout &&
                  !hasAlignedDockFrontage(candidateBoardLayout.placements, pieceMap, placedDock.dockPlacement)
                ) {
                  placedDock = null;
                }
              } else {
                placedDock = createDockPlacement(
                  [...candidateBoardLayout.placements, ...candidateDockPlacements],
                  pieceMap,
                  dockId,
                  candidateFlip,
                  { alignedLayout: generationPreferences.alignedLayout, allowBridgePlacement: true }
                );
              }
              if (placedDock) {
                candidateDockPlacements.push(placedDock.dockPlacement);
                break;
              }
            }
            if (!placedDock) { validDockSet = false; break; }
          }
          if (!validDockSet || !candidateDockPlacements.length) continue;
          proposalBoardLayout = candidateBoardLayout;
          proposalDockPlacements = candidateDockPlacements;
          proposalDockSummaries = buildDockSummaries(
            proposalBoardLayout.placements,
            proposalDockPlacements,
            pieceMap
          );
          break;
        }
      }
    }

    if (!proposalBoardLayout) return null;
    const prediction = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "boardsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: proposalBoardLayout.placements.length,
        flagCount: planningFlagCount,
        boardPlacements: proposalBoardLayout.placements,
        dockPlacements: docklessSetup ? [] : proposalDockPlacements,
        overlayPlacements: []
      }
    );
    return {
      boardLayout: proposalBoardLayout,
      dockPlacements: proposalDockPlacements,
      dockSummaries: proposalDockSummaries,
      prediction
    };
  };

  const boardProposalCount = getConstructionGuidanceModePolicy(
    generationPreferences
  ).boardProposalCount;
  const boardProposals = [];
  const seenBoardProposalKeys = new Set();
  for (let proposalIndex = 0; proposalIndex < boardProposalCount; proposalIndex += 1) {
    const proposal = buildOneBoardDockProposal();
    if (!proposal) continue;
    const key = JSON.stringify({
      boards: proposal.boardLayout.placements.map((placement) => [
        placement.pieceId,
        placement.x,
        placement.y,
        placement.rotation
      ]),
      docks: proposal.dockPlacements.map((placement) => [
        placement.pieceId,
        placement.x,
        placement.y,
        placement.rotation,
        placement.flipped
      ])
    });
    if (seenBoardProposalKeys.has(key)) continue;
    seenBoardProposalKeys.add(key);
    boardProposals.push(proposal);
  }

  let selectableBoardProposals = boardProposals;
  if (normalizeBoardSpread(generationPreferences.boardSpread) === BOARD_SPREAD_MODES.tight && boardProposals.length > 1) {
    const withFootprint = boardProposals.map((proposal) => ({
      proposal,
      area: summarizeCalibrationLayout(proposal.boardLayout?.placements ?? [], pieceMap).bboxArea
    })).filter((entry) => Number.isFinite(entry.area));
    if (withFootprint.length) {
      const minimumArea = Math.min(...withFootprint.map((entry) => entry.area));
      selectableBoardProposals = withFootprint
        .filter((entry) => entry.area === minimumArea)
        .map((entry) => entry.proposal);
    }
  }
  const selectedBoardProposal = !selectableBoardProposals.length
    ? null
    : isCalibrationHarnessGeneration(generationPreferences)
      ? sample(selectableBoardProposals)
      : sampleConstructionGuidanceRankedCandidate(
        selectableBoardProposals,
        generationPreferences,
        { predictionKey: "prediction" }
      );
  let boardLayout = selectedBoardProposal?.boardLayout ?? null;
  let dockPlacements = selectedBoardProposal?.dockPlacements ?? [];

  if (
    normalizeBoardSpread(generationPreferences.boardSpread) === BOARD_SPREAD_MODES.tight &&
    selectedBoardProposal &&
    boardProposals.length > 1
  ) {
    const layout = summarizeCalibrationLayout(selectedBoardProposal.boardLayout?.placements ?? [], pieceMap);
    await reportStage(
      `Choosing tight board spread — ${layout.bboxWidth}×${layout.bboxHeight} board bounding box`,
      1
    );
  }

  if (selectedBoardProposal?.prediction && boardProposals.length > 1) {
    await reportStage(
      `Choosing board layout — calibration ranked ${boardProposals.length} proposals; ` +
      `selected length ${selectedBoardProposal.prediction.length.raw}, ` +
      `difficulty ${selectedBoardProposal.prediction.difficulty.raw}, ` +
      `~${selectedBoardProposal.prediction.routeCost.predictedExpansions} route expansions`,
      1
    );
  }

  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const courseDockPlacements = docklessSetup ? [] : dockPlacements;
  const overlayPlacements = chooseOverlayPlacements(boardLayout.placements, courseDockPlacements, pieceMap, generationPreferences, expansionIds);
  const calibrationBoardOverlayCount = generationPreferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(generationPreferences.calibrationBoardOverlayCount);
  if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount > 0) {
    const placedBoardOverlayCount = overlayPlacements.filter((placement) => (
      !isMiniOverlayPiece(pieceMap[placement.pieceId])
    )).length;
    if (placedBoardOverlayCount < calibrationBoardOverlayCount) {
      return {
        scenario: null,
        evaluationsUsed: 1,
        rejectionEvents: [{
          evaluation: 0,
          category: "overlay-placement",
          reason: `Calibration requested ${calibrationBoardOverlayCount} structural board overlay(s), but this construction could place ${placedBoardOverlayCount}.`
        }]
      };
    }
  }
  const placements = [
    ...boardLayout.placements,
    ...courseDockPlacements,
    ...overlayPlacements
  ];
  const boardRects = buildBoardRects(boardLayout.placements, pieceMap);

  clearAnalysisCaches();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const noDockSelection = effectiveNoDocks
    ? chooseNoDockStartingZones(
      boardRects,
      tileMap,
      getRequiredDockStartCount({ ...generationPreferences, competitiveMode }),
      {
        ...generationPreferences,
        playerCount: preferences.playerCount,
        competitiveMode,
        payToWin,
        extraDocksState: "off"
      }
    )
    : null;
  if (effectiveNoDocks && !noDockSelection) {
    return { scenario: null, evaluationsUsed: 1 };
  }
  const noDockEdges = noDockSelection?.edges ?? [];
  const noDockEdge = noDockEdges[0] ?? null;
  const noDockStarts = noDockSelection?.starts ?? [];
  const setupStarts = effectiveNoDocks ? noDockStarts : starts;
  const flagCandidates = getFlagCandidates(placements, pieceMap);
  const movingTargetsForced = isVariantForced(preferences, "movingTargets");
  const movingTargetTraceCache = movingTargets ? new Map() : null;
  const movingCheckpointCandidateCount = movingTargets
    ? flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, generationPreferences).moving).length
    : 0;

  await reportStage("Preparing checkpoint candidates", 1);

  if (movingTargetsForced && movingCheckpointCandidateCount === 0) {
    return {
      scenario: null,
      evaluationsUsed: 1
    };
  }

  const calibrationFlagCount = Number(generationPreferences.calibrationFlagCount);
  const plannedFlagCount = Number(boardLayout.constructionGuidancePlan?.flagCount);
  const usePlannedFlagCount = (
    Number.isInteger(plannedFlagCount) &&
    plannedFlagCount > 0 &&
    plannedFlagCount <= flagCandidates.length
  );
  const flagCount = Math.min(
    Number.isInteger(calibrationFlagCount) && calibrationFlagCount > 0
      ? calibrationFlagCount
      : usePlannedFlagCount
        ? plannedFlagCount
        : neutralFlagCount(flagCandidates.length),
    flagCandidates.length
  );
  const constructionGuidancePrior = usePlannedFlagCount && flagCount === plannedFlagCount
    ? { ...boardLayout.constructionGuidancePlan }
    : null;
  let boardsKnownGuidance = predictConstructionGuidanceStage(
    assets.constructionGuidance,
    "boardsKnown",
    {
      preferences: generationPreferences,
      pieceMap,
      boardCount: boardLayout.placements.length,
      flagCount,
      boardPlacements: boardLayout.placements,
      dockPlacements: courseDockPlacements,
      overlayPlacements
    }
  );
  const retryBudget = getFlagRetryBudget(generationPreferences, remainingEvaluations);
  const stallLimit = getFlagRetryStallLimit(generationPreferences);
  let evaluationsUsed = 0;
  let bestScenario = null;
  let bestExtraDocksNearMissScenario = null;
  let staleRetries = 0;
  const rejectionEvents = [];
  let currentConstructionFingerprint = null;
  const recordRejectionEvent = (telemetryBefore, category, reason, details = null) => {
    const routeDelta = summarizeRouteSearchDelta(
      telemetryBefore,
      getAnalysisTelemetrySnapshot()
    );
    rejectionEvents.push({
      evaluation: evaluationsUsed,
      category: category || "other",
      reason: reason || category || "candidate rejected",
      routeSearches: routeDelta.searches,
      routeExpansions: routeDelta.expansions,
      routeSearchMs: routeDelta.durationMs,
      cappedRouteSearches: routeDelta.capped,
      contextualSearches: routeDelta.contextualSearches,
      contextualExpansions: routeDelta.contextualExpansions,
      contextualDurationMs: routeDelta.contextualDurationMs,
      contextualProfile: routeDelta.contextualProfile,
      routeSearchTotalsByKind: routeDelta.totalsByKind,
      constructionFingerprint: currentConstructionFingerprint,
      ...(details ? { diagnostics: details } : {})
    });
  };

  for (let retry = 0; retry < retryBudget; retry += 1) {
    // The generation-level expansion budget is intentionally soft, but a
    // single board candidate can contain several checkpoint-layout retries.
    // Re-check before paying for another full contextual analysis so a viable
    // fallback does not overshoot the budget by an entire retry group.
    if (
      retry > 0 &&
      shouldStopBeforeRetry &&
      shouldStopBeforeRetry({ evaluationsUsed, bestScenario })
    ) {
      break;
    }

    evaluationsUsed += 1;
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      boardLayout.placements,
      courseDockPlacements,
      overlayPlacements,
      []
    );
    if (onEvaluation) {
      await onEvaluation(evaluationsUsed, retryBudget);
    }
    await reportStage(
      retryBudget > 1
        ? `Choosing checkpoints — checkpoint try ${retry + 1} / ${retryBudget}`
        : "Choosing checkpoints",
      evaluationsUsed
    );
    const retryTelemetryBefore = getAnalysisTelemetrySnapshot();
    const checkpointPreferences = {
      ...generationPreferences,
      hazardousFlags,
      movingTargets,
      noDocks: effectiveNoDocks,
      extraDocksState: getVariantPreferenceState(preferences, "extraDocks")
    };
    const checkpointProposalCount = getConstructionGuidanceModePolicy(
      generationPreferences
    ).checkpointProposalCount;
    const checkpointProposals = [];
    const seenCheckpointProposalKeys = new Set();

    for (let proposalIndex = 0; proposalIndex < checkpointProposalCount; proposalIndex += 1) {
      if (checkpointProposalCount > 1) {
        await reportStage(
          `Choosing checkpoints — checkpoint try ${retry + 1} / ${retryBudget}; proposal ${proposalIndex + 1} / ${checkpointProposalCount}`,
          evaluationsUsed
        );
      }
      const virtualEntryCandidate = virtualBots
        ? pickVirtualBotEntry(
          flagCandidates,
          tileMap,
          boardLayout.placements,
          pieceMap,
          checkpointPreferences
        )
        : null;
      if (virtualBots && !virtualEntryCandidate) {
        continue;
      }

      const checkpointCandidatePool = virtualEntryCandidate
        ? flagCandidates.filter((candidate) => (
          candidate.x !== virtualEntryCandidate.x ||
          candidate.y !== virtualEntryCandidate.y
        ))
        : flagCandidates;
      const pickedCheckpoints = typeof shouldStopDuringAnalysis === "function"
        ? await pickFlagsCooperative(
          checkpointCandidatePool,
          flagCount,
          boardLayout.placements,
          courseDockPlacements,
          pieceMap,
          virtualBots ? [virtualEntryCandidate] : setupStarts,
          checkpointPreferences,
          {
            shouldStopRequested: shouldStopDuringAnalysis,
            cooperativeYield: async () => {
              await nextEventLoopTurn();
            }
          }
        )
        : pickFlags(
          checkpointCandidatePool,
          flagCount,
          boardLayout.placements,
          courseDockPlacements,
          pieceMap,
          virtualBots ? [virtualEntryCandidate] : setupStarts,
          checkpointPreferences
        );
      if (!pickedCheckpoints) continue;

      const virtualEntryFacing = virtualEntryCandidate && !startupSpinUp
        ? pickVirtualBotEntryFacing(tileMap, virtualEntryCandidate)
        : null;
      if (virtualBots && !startupSpinUp && !virtualEntryFacing) continue;
      const flagZero = virtualBots
        ? {
          ...virtualEntryCandidate,
          id: 0,
          ...(virtualEntryFacing ? { facing: virtualEntryFacing } : {})
        }
        : null;
      const checkpoints = virtualBots
        ? [flagZero, ...pickedCheckpoints]
        : pickedCheckpoints;
      const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
      // A physically valid Sandwiched Dock may still be a poor two-sided race if
      // every checkpoint lands on one side. Do not hard-reject that layout here:
      // final classification applies a large soft setup-use penalty so it remains
      // available only as a fallback-quality course.
      const proposalStarts = virtualBots
        ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
        : filterStartsForGoals(setupStarts, checkpoints);
      const activeStarts = (!virtualBots && sandwichedDock && !startupSpinUp)
        ? orientSandwichedDockStartsTowardCheckpoint(
          proposalStarts,
          courseDockPlacements,
          pieceMap,
          playableCheckpoints[0]
        )
        : proposalStarts;
      const prediction = predictConstructionGuidanceStage(
        assets.constructionGuidance,
        "checkpointsKnown",
        {
          preferences: generationPreferences,
          pieceMap,
          boardCount: boardLayout.placements.length,
          flagCount: playableCheckpoints.length,
          boardPlacements: boardLayout.placements,
          dockPlacements: courseDockPlacements,
          overlayPlacements,
          checkpoints: playableCheckpoints,
          starts: activeStarts,
          tileMap
        }
      );
      const mismatch = getConstructionGuidanceGrossMismatch(
        prediction,
        generationPreferences,
        overlayPlacements
      );
      const key = checkpoints
        .map((checkpoint) => `${checkpoint.x},${checkpoint.y},${checkpoint.facing ?? ""}`)
        .join("|");
      if (seenCheckpointProposalKeys.has(key)) continue;
      seenCheckpointProposalKeys.add(key);
      const spacingExpectation = getCheckpointSpacingExpectationProfile(
        playableCheckpoints,
        activeStarts,
        checkpointPreferences
      );
      checkpointProposals.push({
        flagZero,
        checkpoints,
        playableCheckpoints,
        activeStarts,
        prediction,
        mismatch,
        spacingExpectation
      });
    }

    if (!checkpointProposals.length) {
      recordRejectionEvent(
        retryTelemetryBefore,
        "checkpoint-layout",
        "checkpoint selection produced no valid flag sequence"
      );
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) {
        break;
      }
      continue;
    }

    // Stronger Manhattan spacing remains construction/debug evidence only.
    // Player-facing checkpoint quality is judged later from routed register demand,
    // so technically valid proposals are not preferred or rejected by this geometry.
    const expectationRankingPool = checkpointProposals;
    // Prefer proposals whose full OOF interval can still hit an explicit target.
    // Hidden Any targets are guidance-only and therefore never enter this gate.
    const targetCompatibleCheckpointProposals = expectationRankingPool.filter(
      (proposal) => !proposal.mismatch?.abort
    );
    const checkpointRankingPool = targetCompatibleCheckpointProposals.length
      ? targetCompatibleCheckpointProposals
      : expectationRankingPool;
    const selectedCheckpointProposal = sampleCheckpointProposalWithExpectations(
      checkpointRankingPool,
      generationPreferences,
      false
    );
    if (!selectedCheckpointProposal) {
      staleRetries += 1;
      continue;
    }

    if (selectedCheckpointProposal.prediction && checkpointProposals.length > 1) {
      await reportStage(
        `Choosing checkpoints — calibration ranked ${checkpointProposals.length} proposals; ` +
        `selected length ${selectedCheckpointProposal.prediction.length.raw}, ` +
        `difficulty ${selectedCheckpointProposal.prediction.difficulty.raw}, ` +
        `~${selectedCheckpointProposal.prediction.routeCost.predictedExpansions} route expansions`,
        evaluationsUsed
      );
    }

    const constructionGuidanceMismatch = selectedCheckpointProposal.mismatch ?? {
      abort: false,
      mismatches: []
    };
    const constructionGuidanceExploration = (
      constructionGuidanceMismatch.abort &&
      !generationPreferences.calibrationObserveTargetMisses
    )
      ? generationRandom() <
        getConstructionGuidanceModePolicy(generationPreferences).grossMismatchExplorationRate
      : false;
    if (
      constructionGuidanceMismatch.abort &&
      !constructionGuidanceExploration &&
      !generationPreferences.calibrationObserveTargetMisses
    ) {
      const mismatchText = constructionGuidanceMismatch.mismatches
        .map((entry) => (
          `${entry.metric} ${entry.direction} (pred ${Number(entry.predicted).toFixed(1)}, ` +
          `OOF interval ${Number(entry.predictedLow).toFixed(1)}..${Number(entry.predictedHigh).toFixed(1)})`
        ))
        .join("; ");
      const reason = `calibrated checkpoint guidance is grossly outside the requested target: ${mismatchText}`;
      console.debug(`Early course retry: ${reason}`);
      await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
      recordRejectionEvent(
        retryTelemetryBefore,
        "preflight-target",
        reason,
        {
          targetGate: {
            method: "calibrated-checkpoints-known",
            stage: selectedCheckpointProposal.prediction?.stage ?? null,
            predictedLengthRaw: selectedCheckpointProposal.prediction?.length?.raw ?? null,
            predictedDifficultyRaw: selectedCheckpointProposal.prediction?.difficulty?.raw ?? null,
            lengthInterval: selectedCheckpointProposal.prediction?.length?.interval ?? null,
            difficultyInterval: selectedCheckpointProposal.prediction?.difficulty?.interval ?? null,
            predictedRouteExpansions: selectedCheckpointProposal.prediction?.routeCost?.predictedExpansions ?? null,
            mismatches: constructionGuidanceMismatch.mismatches,
            routePoolSkipped: true
          }
        }
      );
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) break;
      continue;
    }

    const flagZero = selectedCheckpointProposal.flagZero;
    const checkpoints = selectedCheckpointProposal.checkpoints;
    const playableCheckpoints = selectedCheckpointProposal.playableCheckpoints;

    let scenarioBoardPlacements = boardLayout.placements;
    let scenarioDockPlacements = courseDockPlacements;
    let scenarioOverlayPlacements = overlayPlacements;
    let scenarioPlacements = placements;
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      scenarioBoardPlacements,
      scenarioDockPlacements,
      scenarioOverlayPlacements,
      checkpoints
    );
    let scenarioBoardRects = boardRects;
    let scenarioTileMap = tileMap;
    let goalTileMap = scenarioTileMap;
    let activeStarts = selectedCheckpointProposal.activeStarts;

    let checkpointsKnownGuidance = selectedCheckpointProposal.prediction;

    let rebootTokens = [];
    let sequence = null;
    let effectiveVariantBundle = variantBundle;
    let sequenceFailureCategory = "analysis";
    let sequenceFailureReason = "course analysis did not produce a sequence";
    let sequenceFailureDiagnostics = null;
    let coursePreflight = null;
    const boardCleanupAuditTrail = [];
    const wholeCourseAblationProtectedBoards = new Set();
    let pendingWholeCourseBoardAblation = null;
    // v49eg may need two full analysis passes for an orphan board that is tested
    // and then restored because the reduced course changed materially. Allow
    // enough passes for that conservative A/B behavior without making ordinary
    // generation loop indefinitely.
    const boardCleanupPassLimit = Math.max(6, scenarioBoardPlacements.length * 3 + 3);
    const classifyCurrentCleanupCourse = () => classifyCandidate(sequence, {
      ...generationPreferences,
      ...effectiveVariantBundle,
      actFast,
      actFastMode,
      flagCount,
      recoveryRule,
      classicSharedDeck,
      movingTargets
    }, {
      boardPlacements: scenarioBoardPlacements,
      overlayPlacements: scenarioOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      pieceMap,
      checkpoints: playableCheckpoints,
      activeStarts,
      tileMap: scenarioTileMap,
      goalTileMap,
      rebootTokens,
      boardCleanupAuditTrail
    });

    for (let pass = 0; pass < boardCleanupPassLimit; pass += 1) {
      scenarioPlacements = [
        ...scenarioBoardPlacements,
        ...scenarioDockPlacements,
        ...scenarioOverlayPlacements
      ];
      currentConstructionFingerprint = getCourseConstructionFingerprint(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        scenarioOverlayPlacements,
        checkpoints
      );
      scenarioBoardRects = buildBoardRects(scenarioBoardPlacements, pieceMap);
      const resolved = buildResolvedMap(scenarioPlacements, pieceMap);
      scenarioTileMap = resolved.tileMap;
      const rebootPlacementExclusions = virtualBots && flagZero
        ? [flagZero, ...playableCheckpoints]
        : playableCheckpoints;
      rebootTokens = recoveryRule === "reboot_tokens"
        ? placeRebootTokens(
          scenarioBoardRects,
          scenarioTileMap,
          rebootPlacementExclusions,
          preferences.playerCount
        )
        : recoveryRule === "home_reboot"
          ? placeHomeRebootTokens(scenarioDockPlacements, pieceMap, resolved.starts, scenarioTileMap, checkpoints, {
            lessDeadlyGame
          })
          : [];
      if (recoveryRule === "reboot_tokens" && rebootTokens.length < scenarioBoardRects.length) {
        sequenceFailureCategory = "reboot-layout";
        sequenceFailureReason = `reboot token placement could not provide ${preferences.playerCount}-robot safe capacity on every board`;
        sequence = null;
        break;
      }
      if (recoveryRule === "home_reboot") {
        const dockCountWithStarts = scenarioDockPlacements.filter((dockPlacement) => (
          resolved.starts.some((start) => pointOnPlacement(start, dockPlacement, pieceMap))
        )).length;
        if (rebootTokens.length < dockCountWithStarts) {
          sequenceFailureCategory = "reboot-layout";
          sequenceFailureReason = "home reboot placement could not cover every dock with starts";
          sequence = null;
          break;
        }
      }
      if (virtualBots) {
        const withFlagZero = applyFlagOverrides(scenarioTileMap, [flagZero], { hazardousFlags, movingTargets: false });
        goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
        goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
      } else {
        goalTileMap = applyFlagOverrides(scenarioTileMap, checkpoints, { hazardousFlags, movingTargets });
      }
      const courseAvailability = applyCourseVariantAvailability(variantBundle, goalTileMap, preferences, {
        rawTileMap: scenarioTileMap,
        checkpoints: playableCheckpoints,
        movingTargets: Boolean(variantBundle.movingTargets)
      });
      if (courseAvailability.blockedRequired.length) {
        sequenceFailureCategory = "variant-applicability";
        sequenceFailureReason = `selected variant not realizable on finished course: ${courseAvailability.blockedRequired
          .map((entry) => `${getVariantDefinitionLabel(entry.id)} (${entry.reason})`)
          .join(", ")}`;
        sequence = null;
        break;
      }
      effectiveVariantBundle = courseAvailability.variantBundle;
      const resolvedPassStarts = virtualBots
        ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
        : effectiveNoDocks
          ? filterStartsForGoals(noDockStarts, checkpoints)
          : filterStartsForGoals(resolved.starts, checkpoints);
      activeStarts = (!virtualBots && sandwichedDock && !startupSpinUp)
        ? orientSandwichedDockStartsTowardCheckpoint(
          resolvedPassStarts,
          scenarioDockPlacements,
          pieceMap,
          playableCheckpoints[0]
        )
        : resolvedPassStarts;
      if (pass === 0 && generationPreferences.calibrationCaptureEvidence) {
        calibrationConstructionSnapshot = buildCalibrationConstructionSnapshot({
          boardPlacements: scenarioBoardPlacements,
          overlayPlacements: scenarioOverlayPlacements,
          dockPlacements: scenarioDockPlacements,
          overlayPlacements: scenarioOverlayPlacements,
          checkpoints: playableCheckpoints,
          starts: activeStarts,
          tileMap: scenarioTileMap,
          pieceMap,
          preferences: generationPreferences
        });
      }
      await reportStage(
        `Evaluating starting spaces — pass ${pass + 1} / ${boardCleanupPassLimit}; ${activeStarts.length} start${activeStarts.length === 1 ? "" : "s"} with contextual leg routes`,
        evaluationsUsed
      );
      try {
        // Shared estimate→realize predicate. Route semantics never depend on
        // whether difficulty/length are constrained: Any/Any uses the same Normal
        // physical-estimate -> exact-program realization foundation. The cheap
        // preflight is an audition only and never decides start eligibility here.
        const estimateThenRealizeSharedCandidate = (
          !startEnergyPricing &&
          (
            virtualBots ||
            (!effectiveNoDocks && scenarioDockPlacements.length === 1)
          )
        );
        const variantAnalysisOptions = applyVariantAnalysisOptions({
          // Keep resource-economy inputs explicit so future optional rules can
          // vary starting Energy/cards without adding another pricing-only path.
          ...getRouteAnalysisVariantOptions(generationPreferences),
          rebootTokens,
          boardRects: scenarioBoardRects,
          difficulty: generationPreferences.difficulty,
          length: generationPreferences.length,
          generationMode: generationPreferences.generationMode,
          contextualEarlyExit: true
        }, effectiveVariantBundle);
        const estimatedCardTransitionMemoRuleSignature = [
          "literal-hg-v49ek",
          `hand:${variantAnalysisOptions.factoryRejects ? 7 : 9}`,
          `lessForeshadowing:${variantAnalysisOptions.lessForeshadowing ? 1 : 0}`,
          `classicSharedDeck:${variantAnalysisOptions.classicSharedDeck ? 1 : 0}`,
          `players:${Math.max(1, Number(variantAnalysisOptions.playerCount ?? generationPreferences.playerCount ?? preferences.playerCount) || 4)}`
        ].join("|");
        const baseAnalysisOptions = {
          ...variantAnalysisOptions,
          contextualEstimatedCardTransitionMemoContext:
            estimatedCardTransitionMemoContext,
          contextualEstimatedCardTransitionMemoRuleSignature:
            estimatedCardTransitionMemoRuleSignature
        };
        const indexedActiveStarts = activeStarts.map((start, index) => ({
          ...start,
          analysisIndex: Number.isInteger(start.analysisIndex) ? start.analysisIndex : index
        }));

        // Universal cheap audition: Flag 1 establishes intrinsic start quality,
        // while later legs use only a representative no-traffic sketch. Virtual
        // Bots share one entry, so one representative start is enough here.
        if (playableCheckpoints.length) {
          const preflightStarts = virtualBots
            ? indexedActiveStarts.slice(0, 1)
            : indexedActiveStarts;
          await reportStage(
            `Quick course preflight — ${virtualBots ? "shared entry" : `${preflightStarts.length} starts`}, no traffic`,
            evaluationsUsed
          );
          const preflightTelemetryBefore = getAnalysisTelemetrySnapshot();
          coursePreflight = buildCoursePreflightSequence(
            goalTileMap,
            preflightStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...baseAnalysisOptions,
              ...effectiveVariantBundle,
              competitiveMode,
              payToWin: startEnergyPricing,
              subsidizedStarts,
              virtualBots,
              movingTargets
            }
          );
          coursePreflight.work = compactRouteWork(summarizeRouteSearchDelta(
            preflightTelemetryBefore,
            getAnalysisTelemetrySnapshot()
          ));

          if (!coursePreflight.valid && !estimateThenRealizeSharedCandidate && !competitiveMode && !startEnergyPricing) {
            const reason = `preflight route sketch inconclusive: ${coursePreflight.reason}`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequenceFailureCategory = "preflight-route";
            sequenceFailureReason = reason;
            sequenceFailureDiagnostics = {
              preflight: {
                openingRoutedCount: coursePreflight.openingRoutedCount,
                requiredOpeningCount: coursePreflight.requiredOpeningCount,
                intrinsicPruned: coursePreflight.intrinsicOutliers?.map((entry) => entry.index) ?? [],
                openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
                openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
                work: coursePreflight.work
              }
            };
            sequence = null;
            break;
          }

          coursePreflight.metrics = classifyCoursePreflight(
            coursePreflight,
            {
              ...generationPreferences,
              ...effectiveVariantBundle,
              actFast,
              actFastMode,
              flagCount,
              classicSharedDeck,
              movingTargets
            },
            {
              boardPlacements: scenarioBoardPlacements,
              pieceMap,
              checkpoints: playableCheckpoints,
              tileMap: scenarioTileMap,
              goalTileMap
            }
          );
          const preflightMismatch = getPreflightGrossCourseMismatch(
            coursePreflight.metrics,
            generationPreferences
          );
          if (preflightMismatch.abort && !generationPreferences.calibrationObserveTargetMisses && !estimateThenRealizeSharedCandidate && !competitiveMode && !startEnergyPricing) {
            const mismatchText = formatGrossCourseMismatch(preflightMismatch);
            const reason = `preflight gross mismatch: ${mismatchText}`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequenceFailureCategory = "preflight-profile";
            sequenceFailureReason = reason;
            sequenceFailureDiagnostics = {
              preflight: {
                openingRoutedCount: coursePreflight.openingRoutedCount,
                requiredOpeningCount: coursePreflight.requiredOpeningCount,
                intrinsicPruned: coursePreflight.intrinsicOutliers?.map((entry) => entry.index) ?? [],
                openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
                openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
                difficultyRaw: coursePreflight.metrics?.difficultyRaw ?? null,
                lengthRaw: coursePreflight.metrics?.lengthRaw ?? null,
                work: coursePreflight.work
              }
            };
            sequence = null;
            break;
          }
        } else {
          coursePreflight = null;
        }

        const preflightExcludedIndices = (estimateThenRealizeSharedCandidate || competitiveMode || startEnergyPricing)
          ? new Set()
          : (coursePreflight?.excludedIndices ?? new Set());
        // Normal, Competitive, and priced starts never consume preflight outliers
        // as eligibility. Competitive must preserve every physical start for blocking;
        // priced starts must preserve the full field until downstream pricing.
        const openingSeedAnalyses = (coursePreflight?.opening?.starts ?? []).filter((entry) => (
          entry.reachable && entry.selectedRoute
        ));
        const routeAwareBatteryScoringOptions = buildRouteAwareBatteryScoringOptions(
          coursePreflight,
          { ...baseAnalysisOptions, ...effectiveVariantBundle }
        );
        // v49g production-speed baseline: keep all v49c routing/scoring/search
        // semantics, but disable the sampled per-block profiler so wall time reflects
        // ordinary generation rather than diagnostic instrumentation overhead.
        // Deterministic fingerprints/work counters remain available for verification.
        const detailedSearchProfiling = false;
        const generationMode = normalizeGenerationMode(baseAnalysisOptions.generationMode);
        const generationModeProfile = getGenerationModeProfile({ generationMode });
        const devRouteModelOverrideActive = isDevRouteModelOverrideActive();
        const devTrafficEnabled = isDevFastTrafficEnabled();
        const devAlternatesEnabled = isDevFastAlternatesEnabled();
        const modeTrafficEnabled = Boolean(generationModeProfile.trafficEnabled);
        // v35a Dev semantics: Dev View is observational. Only the explicit
        // current-mode override changes traffic behavior for the next generation.
        // The two subordinate controls override traffic scoring and traffic-driven
        // alternate discovery while all other selected-mode budgets remain intact.
        const effectiveTrafficEnabled = devRouteModelOverrideActive
          ? devTrafficEnabled
          : modeTrafficEnabled;
        const effectiveTrafficFeedbackEnabled = Boolean(
          effectiveTrafficEnabled && generationModeProfile.trafficEpochs > 0
        );
        const effectiveTrafficDrivenAlternates = Boolean(
          effectiveTrafficFeedbackEnabled && (
            devRouteModelOverrideActive ? devAlternatesEnabled : true
          )
        );
        // The old up-front alternate breadth model is intentionally not controlled
        // by the Dev checkbox anymore. Gameplay alternatives now come from traffic
        // demand; keeping legacy breadth off gives the three clean benchmark states.
        // Route-work safety net: primary route search deliberately widens to
        // exhausting the physical graph rather than calling a leg unreachable, so a
        // pathological layout can search practically forever. A candidate whose
        // analysis pass far exceeds the calibrated work prediction is dropped as too
        // expensive to verify. This is never a reachability verdict; the candidate
        // is simply not offered, and generation moves on.
        const routeWorkBaseline = getCompletedRouteExpansions();
        const predictedRouteWork = Number(checkpointsKnownGuidance?.routeCost?.predictedExpansions);
        const extraCandidate = typeof hasAcceptableCandidate === "function" && hasAcceptableCandidate();
        const routeWorkBudget = Math.max(
          extraCandidate ? EXTRA_CANDIDATE_ROUTE_WORK_BUDGET_FLOOR : CANDIDATE_ROUTE_WORK_BUDGET_FLOOR,
          Number.isFinite(predictedRouteWork)
            ? predictedRouteWork * (extraCandidate
              ? EXTRA_CANDIDATE_ROUTE_WORK_BUDGET_PREDICTION_MULTIPLIER
              : CANDIDATE_ROUTE_WORK_BUDGET_PREDICTION_MULTIPLIER)
            : 0
        );
        const productionAnalysisOptions = {
          ...baseAnalysisOptions,
          // Checked by route search every few steps (deterministic), counting the
          // completed searches of this pass plus the search in progress.
          contextualWorkGuard: (currentSearchExpansions) => {
            const routeWork = getCompletedRouteExpansions() - routeWorkBaseline + currentSearchExpansions;
            if (routeWork > routeWorkBudget) {
              const error = new Error(
                `Route verification too costly: ${routeWork} expansions (budget ${Math.round(routeWorkBudget)})`
              );
              error.code = "CANDIDATE_ROUTE_WORK_BUDGET_EXCEEDED";
              throw error;
            }
          },
          ...routeAwareBatteryScoringOptions,
          // v49al mode contract. All modes share one exact Normal model and the
          // same traffic-feedback search/judgement contract. Mode differences here
          // remain in outer construction/evaluation collection and the older
          // primary-witness/preflight breadth, not traffic alternate quality tiers.
          contextualFastCardState: true,
          contextualEstimatedEnergyGuidance: true,
          fullCourseAnalyzer: typeof shouldStopDuringAnalysis === "function"
            ? analyzeFullCourseCooperative
            : analyzeFullCourse,
          cooperativeYield: typeof shouldStopDuringAnalysis === "function"
            ? async (progress) => {
              const now = generationNow();
              const shouldRenderProgress = Boolean(
                typeof onCooperativeProgress === "function" &&
                now - lastCooperativeRouteProgressDisplayAt >= GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS
              );
              if (shouldRenderProgress) {
                lastCooperativeRouteProgressDisplayAt = now;
                onCooperativeProgress(
                  formatCooperativeRouteProgressStage(
                    progress,
                    cooperativeRouteProgressTickerStep
                  ),
                  evaluationsUsed,
                  generationStageContext
                );
                cooperativeRouteProgressTickerStep += 1;
                await nextFrame();
              } else {
                await nextEventLoopTurn();
              }
            }
            : null,
          cooperativeYieldIntervalMs: GENERATION_COOPERATIVE_YIELD_INTERVAL_MS,
          contextualCooperativeSearchSlices:
            typeof shouldStopDuringAnalysis === "function",
          contextualCooperativeSearchSliceMs:
            GENERATION_COOPERATIVE_SEARCH_SLICE_MS,
          contextualCooperativeSearchCheckPops:
            GENERATION_COOPERATIVE_SEARCH_CHECK_POPS,
          // v49j: preserve the current evaluation index through async full-course
          // stage callbacks. Passing reportStage directly lets its default local
          // evaluation (1) overwrite the overlay during checkpoint retry 2+, making
          // the visible "Course attempt x / N" counter appear to move backward.
          cooperativeStage: typeof shouldStopDuringAnalysis === "function"
            ? (stage) => reportStage(stage, evaluationsUsed)
            : null,
          shouldStopRequested: typeof shouldStopDuringAnalysis === "function"
            ? shouldStopDuringAnalysis
            : () => false,
          fastBaselineTrafficEnabled: effectiveTrafficEnabled,
          modeTrafficEnabled,
          trafficEnabledOverride: effectiveTrafficEnabled,
          contextualTrafficFeedbackEnabled: effectiveTrafficFeedbackEnabled,
          contextualTrafficDrivenAlternates: effectiveTrafficDrivenAlternates,
          contextualTrafficEpochs: effectiveTrafficFeedbackEnabled
            ? generationModeProfile.trafficEpochs
            : 0,
          contextualTrafficAlternateDemandThreshold:
            NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
          contextualTrafficAlternateMinGain:
            NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
          contextualTrafficAlternateMaxNewSearchesPerEpoch:
            generationModeProfile.trafficAlternateMaxNewSearchesPerEpoch,
          contextualTrafficAlternateMaxNewSearchesTotal:
            generationModeProfile.trafficAlternateMaxNewSearchesTotal,
          contextualTrafficAlternateExpansions:
            generationModeProfile.trafficAlternateExpansions,
          contextualTrafficAlternateMaxActions:
            generationModeProfile.trafficAlternateMaxActions,
          contextualTrafficAlternateCachedProbeMargin:
            generationModeProfile.trafficAlternateCachedProbeMargin,
          contextualTrafficAlternateCachedProbeMaxSimilarity:
            generationModeProfile.trafficAlternateCachedProbeMaxSimilarity,
          contextualTrafficAlternateLegsPerStart:
            generationModeProfile.trafficAlternateLegsPerStart,
          contextualTrafficExplorationUncertaintyShare:
            generationModeProfile.trafficExplorationUncertaintyShare,
          contextualTrafficExplorationConfidenceFloor:
            generationModeProfile.trafficExplorationConfidenceFloor,
          // Confidence never weakens the representative primary route. It only
          // scales the effort spent on optional traffic alternatives.
          contextualTrafficAlternateUncertaintyEffortFloor:
            generationModeProfile.trafficAlternateUncertaintyEffortFloor,
          contextualTrafficAlternateUncertaintyEffortExponent:
            generationModeProfile.trafficAlternateUncertaintyEffortExponent,
          skipTraffic: !effectiveTrafficEnabled,
          skipFullCourseTraffic: !effectiveTrafficEnabled,
          // Legacy up-front retention stays disabled. Traffic-driven alternates use
          // the arrival-class witness cache and bounded on-demand leg searches.
          contextualTrafficAlternativeRetention: false,
          contextualOpeningExpansions: 650,
          contextualLaterExpansions: 550,
          contextualLegMaxActions: 30,
          // The uncertainty horizon only controls optional breadth. Literal
          // programming-card depletion stays exact; the fast baseline deliberately
          // keeps Energy as route scoring rather than another dominance dimension.
          contextualUncertaintyBreadth: true,
          // Detailed per-block performance.now() timing is useful for a frozen
          // diagnostic run but should not tax ordinary generation.
          contextualDetailedProfiling: detailedSearchProfiling,
          // The full dominance projection walks every retained search key again
          // after each search. We already established the physical/program split;
          // keep it off in routine frozen-seed performance tests so diagnostics do
          // not distort generation time. It can still be enabled explicitly by a
          // dedicated diagnostic caller.
          contextualDominanceKeyProfiling: false
        };

        const sharedEstimateThenRealizeRouting = estimateThenRealizeSharedCandidate;

        // v37 priced-start semantics: Pay to Win and Subsidized Starts now use the
        // same all-start route foundation as Normal/Competitive. The universal
        // preflight remains an audition only; no bounded shortlist may silently
        // remove a physical starting space before authoritative full-course routing.
        const analysisStarts = indexedActiveStarts;

        // Shared route foundation: do not quality-prune Normal or Competitive from
        // the cheap Flag-1 sketch. On the estimate→realize path every structural
        // start first receives a complete physical course estimate; only afterward
        // is that route subjected to exact rolling-card realization. Setup-specific
        // balance/pricing interpretation happens after those milestones.
        const detailedStarts = analysisStarts;
        if (
          pass === 0 &&
          sandwichedDock &&
          !virtualBots &&
          scenarioDockPlacements.length > 1 &&
          playableCheckpoints.length
        ) {
          await reportStage(
            `Screening multiple-dock opening routes — ${scenarioDockPlacements.length} docks`,
            evaluationsUsed
          );
          const sandwichPreflight = screenSandwichedExtraDockOpening(
            goalTileMap,
            activeStarts,
            playableCheckpoints[0],
            scenarioDockPlacements,
            pieceMap,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              movingTargets
            }
          );
          if (!sandwichPreflight.valid) {
            const reason = `sandwiched extra-dock opening screen failed: ${sandwichPreflight.reachable}/${preferences.playerCount} quick routes across ${sandwichPreflight.dockCoverage}/${scenarioDockPlacements.length} docks`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequence = null;
            break;
          }
        }


        if (startEnergyPricing && !virtualBots) {
          await reportStage(
            `${subsidizedStarts ? "Subsidizing" : "Pricing Pay to Win"} starts — routing all ${analysisStarts.length} physical choices`,
            evaluationsUsed
          );
          sequence = await analyzeFlagSequence(
            goalTileMap,
            analysisStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              // Share Normal's physical-estimate -> exact-program realization
              // foundation. Player count remains the survival floor, but every
              // physical start receives authoritative primary routing evidence.
              contextualSharedLaterLegCatalogue: true,
              contextualEstimatedPrimaryRouting: true,
              contextualPhysicalTemplateRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPrimaryWitnessRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPhysicalTemplateExpansions: 700,
              contextualPhysicalTemplateMaxActions: 36,
              contextualExactRepairExpansions: 380,
              contextualOpeningSeedAnalyses: null,
              contextualSeedStartAnalyses: null,
              contextualSeedRouteStrategy: null,
              contextualRequiredStarts: preferences.playerCount
            }
          );
          if (sequence?.firstLeg?.summary) {
            const validatedCount = sequence.firstLeg.starts.filter((entry) => (
              entry.reachable && entry.fullCourseRoute
            )).length;
            sequence.firstLeg.summary.contextualSearchMode = subsidizedStarts
              ? "subsidized-starts-all-start-estimate-then-realize"
              : "pay-to-win-all-start-estimate-then-realize";
            sequence.firstLeg.summary.payToWinStaging = {
              active: true,
              sourceStartCount: indexedActiveStarts.length,
              candidateCount: indexedActiveStarts.length,
              validatedStartCount: validatedCount,
              requiredStartCount: preferences.playerCount,
              method: "all-start-normal-foundation"
            };
          }
        } else if (sharedEstimateThenRealizeRouting) {
          // v36 shared-foundation invariant: Normal and Competitive never use a hidden
          // pre-analysis shortlist. Every structurally available start is sent through primary
          // full-course route discovery. Traffic and alternate-route discovery are
          // independent optional layers; disabling them must not reduce the start
          // field being evaluated.
          const selectedStarts = detailedStarts;
          const selectedIndices = selectedStarts
            .map((start, index) => Number.isInteger(start.analysisIndex) ? start.analysisIndex : index)
            .sort((left, right) => left - right);
          const preferredPoolSize = selectedStarts.length;
          // Checkpoint-stage calibration was already evaluated before any route
          // search for this checkpoint proposal. It may reject only a gross
          // target miss whose out-of-fold residual interval lies wholly outside
          // the requested band. Route-work prediction remains diagnostic/soft
          // here; it is never interpreted as reachability or impossibility.
          const calibratedCheckpointPrediction = checkpointsKnownGuidance;

          // v29: there is deliberately no coherent-capacity gate here. Primary
          // Normal routing resolves every structural start through the two explicit
          // estimate/realize milestones. The player-count floor is consulted only
          // after those milestones have finished for the whole start field.
          let coherentCapacityGate = null;

          await reportStage(
            calibratedCheckpointPrediction
              ? `${competitiveMode ? "Refining Competitive" : "Refining Normal"} — calibration predicts length ${calibratedCheckpointPrediction.length.raw}, difficulty ${calibratedCheckpointPrediction.difficulty.raw}, ~${calibratedCheckpointPrediction.routeCost.predictedExpansions} route expansions`
              : `${competitiveMode ? "Refining Competitive" : "Refining Normal"} — ${selectedStarts.length} opening candidates after cheap preflight`,
            evaluationsUsed
          );
          sequence = await analyzeFlagSequence(
            goalTileMap,
            selectedStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...productionAnalysisOptions,
              // v33: all Normal starts receive primary full-course discovery.
              // After Flag 1, shared discovery is physical/facing/register-phase
              // only. Card and Energy forecasts guide witness ordering without
              // entering dominance; exact card/Energy replay remains per lineage.
              contextualSharedLaterLegCatalogue: true,
              // v29 Normal no longer uses the old exact/capacity primary solver.
              // Every structural start first receives an uncapped-on-miss physical
              // full-course estimate, one cached leg at a time. Exact rolling cards
              // are realized afterward; failure replans from the impossible register.
              contextualEstimatedPrimaryRouting: true,
              contextualPhysicalTemplateRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPrimaryWitnessRoutes: generationModeProfile.primaryWitnessRoutes,
              contextualPhysicalTemplateExpansions: 700,
              contextualPhysicalTemplateMaxActions: 36,
              contextualExactRepairExpansions: 380,
              // Preflight remains an audition/diagnostic only. Milestone 1 estimates
              // every opening independently and does not consume a preflight seed.
              contextualOpeningSeedAnalyses: null,
              contextualRequiredStarts: competitiveMode
                ? selectedStarts.length
                : preferences.playerCount
            }
          );

          if (sequence?.firstLeg?.summary) {
            const richRoutedStarts = sequence.firstLeg.starts.filter((entry) => (
              entry.reachable && entry.fullCourseRoute
            ));
            sequence.firstLeg.summary.contextualSearchMode = competitiveMode
              ? "competitive-normal-foundation-estimate-then-realize"
              : "normal-estimate-then-realize";
            sequence.firstLeg.summary.contextualStaging = {
              active: false,
              method: "all-start-physical-estimate+whole-route-card-realization+failure-point-replan",
              sourceStartCount: indexedActiveStarts.length,
              preliminaryRoutedCount: coursePreflight.openingRoutedCount,
              targetPoolSize: preferredPoolSize,
              selectedStartCount: richRoutedStarts.length,
              selectedIndices,
              unresolvedFillCount: Math.max(0, selectedStarts.length - richRoutedStarts.length),
              escalated: true,
              escalationReason: calibratedCheckpointPrediction
                ? "calibrated-checkpoint-guidance-passed-or-explored"
                : generationPreferences.length === "any" && generationPreferences.difficulty === "any"
                  ? "unconstrained-fit-no-route-semantic-bypass"
                  : "preflight-fit-passed",
              targetGateMethod: calibratedCheckpointPrediction
                ? "calibrated-checkpoints-known"
                : generationPreferences.length === "any" && generationPreferences.difficulty === "any"
                  ? "none-any-any"
                  : "preflight-only",
              targetGateDifficultyRaw: calibratedCheckpointPrediction?.difficulty?.raw ?? coursePreflight.metrics?.difficultyRaw ?? null,
              targetGateLengthRaw: calibratedCheckpointPrediction?.length?.raw ?? coursePreflight.metrics?.lengthRaw ?? null,
              targetGateLengthFitRaw: calibratedCheckpointPrediction?.length?.raw ?? coursePreflight.metrics?.lengthFitRaw ?? null,
              targetGateRmse: calibratedCheckpointPrediction?.length?.rmse ?? null,
              targetGateSafetyMargin: null,
              targetGateLengthInterval: calibratedCheckpointPrediction?.length?.interval ?? null,
              targetGateDifficultyInterval: calibratedCheckpointPrediction?.difficulty?.interval ?? null,
              targetGatePredictedRouteExpansions: calibratedCheckpointPrediction?.routeCost?.predictedExpansions ?? null,
              coherentCapacityGate: coherentCapacityGate
                ? {
                  active: !coherentCapacityGate.skipped,
                  survivingStarts: coherentCapacityGate.survivingStarts,
                  requiredStarts: coherentCapacityGate.requiredStarts,
                  maxExpansions: coherentCapacityGate.maxExpansions,
                  work: coherentCapacityGate.work ?? null
                }
                : null,
              preselectionSkipped: true
            };
          }
        } else {
          sequence = await analyzeFlagSequence(
            goalTileMap,
            analysisStarts,
            playableCheckpoints,
            preferences.playerCount,
            virtualBots
              ? productionAnalysisOptions
              : {
                ...productionAnalysisOptions,
                contextualOpeningSeedAnalyses: openingSeedAnalyses,
                contextualRequiredStarts: competitiveMode
                  ? analysisStarts.length
                  : preferences.playerCount
              }
          );
        }

        if (sequence?.firstLeg?.summary && coursePreflight) {
          if (preflightExcludedIndices.size) {
            const mergedFirstLeg = mergeLightweightPrunedStarts(
              sequence.firstLeg,
              {
                analyses: coursePreflight.opening?.starts ?? [],
                excludedIndices: preflightExcludedIndices,
                outliers: coursePreflight.intrinsicOutliers ?? [],
                minimumPool: Math.max(preferences.playerCount, preferences.playerCount + LIGHT_START_SURPLUS)
              },
              indexedActiveStarts.length
            );
            sequence.firstLeg = mergedFirstLeg;
            if (sequence.legs?.[0]) {
              sequence.legs[0] = { ...sequence.legs[0], analysis: mergedFirstLeg };
            }
          }
          sequence.firstLeg.summary.coursePreflight = {
            active: true,
            noTraffic: true,
            sourceStartCount: indexedActiveStarts.length,
            openingRoutedCount: coursePreflight.openingRoutedCount,
            requiredOpeningCount: coursePreflight.requiredOpeningCount,
            intrinsicPruned: (coursePreflight.intrinsicOutliers ?? []).map((entry) => entry.index),
            openingSearchedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.searchedStarts ?? indexedActiveStarts.length,
            openingUnresolvedCount: coursePreflight.opening?.summary?.capacityShortCircuit?.unresolvedStarts ?? 0,
            difficultyRaw: coursePreflight.metrics?.difficultyRaw ?? null,
            lengthRaw: coursePreflight.metrics?.lengthRaw ?? null,
            routeSearches: coursePreflight.work?.searches ?? 0,
            routeExpansions: coursePreflight.work?.expansions ?? 0,
            cappedRouteSearches: coursePreflight.work?.capped ?? 0,
            routeAwareBatteryScoring: {
              active: Boolean(productionAnalysisOptions.routeAwareBatteryScoring),
              method: "route-upgrade-economy-production-v18-flat-reserve-progress",
              horizonTurns: productionAnalysisOptions.routeEnergyHorizonTurns ?? null,
              registerScore: productionAnalysisOptions.routeEnergyRegisterScore ?? null,
              startingReserve: productionAnalysisOptions.startingEnergy ?? null,
              referenceReserve: productionAnalysisOptions.routeEnergyReferenceReserve ?? null,
              usefulUpgradeCardRate: productionAnalysisOptions.upgradeUsefulCardRate ?? null,
              drawEnergyCost: productionAnalysisOptions.upgradeDrawEnergyCost ?? null,
              usefulEnergyPerInstall: productionAnalysisOptions.upgradeUsefulEnergyPerInstall ?? null
            },
            routePool: null
          };
        }
      } catch (error) {
        if (error?.code === "CONTEXTUAL_START_CAPACITY_LOST") {
          const health = error.contextualSearchHealth ?? {};
          const rescueText = (health.capacityRescueSearches ?? 0) > 0
            ? `; capacity rescue ${health.capacityRescueSuccesses ?? 0}/${health.capacityRescueSearches ?? 0} (physical ${health.capacityPhysicalRescueSuccesses ?? 0}/${health.capacityPhysicalRescueSearches ?? 0}, horizon ${health.capacityHorizonRescueSuccesses ?? 0}/${health.capacityHorizonRescueSearches ?? 0}, expansion ${health.capacityExpansionRescueSuccesses ?? 0}/${health.capacityExpansionRescueSearches ?? 0})`
            : "";
          const sharedText = (health.catalogueLookups ?? 0) > 0
            ? `; catalogue ${health.catalogueEntries ?? 0} classes/${health.catalogueSearches ?? 0} searches, reuse ${health.catalogueCacheHits ?? 0}/${health.catalogueLookups ?? 0}, capped ${health.catalogueCappedSearches ?? 0} (+${health.catalogueSuppressedCappedLookups ?? 0} repeats suppressed), replay ${health.catalogueCompatibleLineages ?? 0}/${health.catalogueIncompatibleLineages ?? 0}`
            : "";
          const reason = `route capacity lost after leg ${health.legNumber ?? "?"}: ${health.survivingStarts ?? 0}/${health.requiredStarts ?? preferences.playerCount} required starts remain; ${health.cappedContextsThisLeg ?? 0} capped route contexts this leg (${health.zeroRouteCapFailures ?? 0} total across ${health.distinctStarts ?? 0} starts)${rescueText}${sharedText}`;
          console.debug(`Early course retry: ${reason}`);
          await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
          sequenceFailureCategory = "route-capacity";
          sequenceFailureReason = reason;
          sequenceFailureDiagnostics = {
            contextualFailure: cloneContextualSearchHealth(health)
          };
          sequence = null;
          break;
        }
        throw error;
      }

      // After the first genuine full-course analysis, abandon only candidates
      // that are wildly outside the requested difficulty/length target.
      // Competitive Mode also benefits from this gate: it skips the physical
      // pruning/reanalysis loop, but a grossly mismatched checkpoint layout
      // should not trigger additional expensive checkpoint retries on the same
      // board candidate. The provisional classification below intentionally
      // skips Competitive's block-impact simulation because this gate only
      // needs difficulty and length.
      if (pass === 0) {
        const provisionalMetrics = classifyCandidate(sequence, {
          ...generationPreferences,
          actFast,
          actFastMode,
          flagCount,
          recoveryRule,
          classicSharedDeck,
          criticalSpam,
          criticalHaywire,
          permanentShutdown,
          cuttingFloor: effectiveVariantBundle.cuttingFloor,
          flamingOil: effectiveVariantBundle.flamingOil,
          factoryRejects,
          repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
          upgradeWorld: effectiveVariantBundle.upgradeWorld,
          hazardousFlags,
          movingTargets,
          payToWin: effectiveVariantBundle.payToWin,
          subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
          lighterGame,
          lessSpammyGame,
          lessForeshadowing,
          sandwichedDock
        }, {
          boardPlacements: scenarioBoardPlacements,
          dockPlacements: scenarioDockPlacements,
          pieceMap,
          checkpoints: playableCheckpoints,
          tileMap: scenarioTileMap,
          goalTileMap,
          rebootTokens,
          skipCompetitiveBlockImpact: competitiveMode,
          skipProductionDifficulty: true
        });
        const grossMismatch = getGrossCourseMismatch(provisionalMetrics, generationPreferences);

        if (grossMismatch.abort && !generationPreferences.calibrationObserveTargetMisses) {
          const mismatchText = formatGrossCourseMismatch(grossMismatch);
          console.debug(`Early course abort: ${mismatchText}`);
          await reportStage(`Rejecting gross mismatch — ${mismatchText}`, evaluationsUsed);
          sequenceFailureCategory = "gross-mismatch";
          sequenceFailureReason = mismatchText;
          sequence = null;
          break;
        }
      }

      if (pendingWholeCourseBoardAblation) {
        await reportStage(
          `Comparing orphan-board reanalysis — pass ${pass + 1} / ${boardCleanupPassLimit}`,
          evaluationsUsed
        );
        const reducedMetrics = classifyCurrentCleanupCourse();
        const reducedSnapshot = summarizeWholeCourseBoardAblationState(
          sequence,
          reducedMetrics
        );
        const wholeCourseComparison = compareWholeCourseBoardAblationStates(
          pendingWholeCourseBoardAblation.baselineSnapshot,
          reducedSnapshot
        );

        boardCleanupAuditTrail.push({
          pass: pass + 1,
          wholeCourseAblation: true,
          decisions: [{
            boardIndex: pendingWholeCourseBoardAblation.removedBoard.boardIndex,
            pieceId: pendingWholeCourseBoardAblation.removedBoard.pieceId,
            action: wholeCourseComparison.materialDifference
              ? "restore"
              : "remove-confirmed",
            reason: wholeCourseComparison.materialDifference
              ? "whole-course-material-difference"
              : "whole-course-no-material-difference",
            comparison: wholeCourseComparison
          }]
        });

        if (wholeCourseComparison.materialDifference) {
          // The board passed the cheap fixed-route gate but the authoritative
          // reduced-course rerun changed something meaningful. Restore the exact
          // pre-test construction, protect this board for the rest of this
          // candidate, and rerun once more so the retained sequence belongs to the
          // restored physical course.
          scenarioBoardPlacements = pendingWholeCourseBoardAblation.originalBoardPlacements;
          scenarioOverlayPlacements = pendingWholeCourseBoardAblation.originalOverlayPlacements;
          sequence = pendingWholeCourseBoardAblation.baselineSequence;
          scenarioTileMap = pendingWholeCourseBoardAblation.baselineTileMap;
          goalTileMap = pendingWholeCourseBoardAblation.baselineGoalTileMap;
          rebootTokens = pendingWholeCourseBoardAblation.baselineRebootTokens;
          scenarioBoardRects = pendingWholeCourseBoardAblation.baselineBoardRects;
          activeStarts = pendingWholeCourseBoardAblation.baselineActiveStarts;
          effectiveVariantBundle = pendingWholeCourseBoardAblation.baselineEffectiveVariantBundle;
          wholeCourseAblationProtectedBoards.add(
            pendingWholeCourseBoardAblation.removedBoardPlacement
          );
          pendingWholeCourseBoardAblation = null;
          await reportStage(
            `Restoring orphan-board candidate — reduced course changed materially`,
            evaluationsUsed
          );
          continue;
        }

        // No material gameplay/presentation state changed under a complete
        // reroute/reanalysis. The tentative removal is now authoritative and
        // intentionally silent for players. Dev audit retains the A/B evidence.
        pendingWholeCourseBoardAblation = null;
      }

      // v36 Competitive now follows the ordinary physical cleanup loop too. Its
      // simulated strategic blocks are analysis-only, so removable docks/boards/
      // overlays are judged against the full validated physical start field, not
      // against the P starts used for Competitive fairness. If cleanup changes the
      // course, routing and the sequential block simulation are both rerun.
      await reportStage(`Checking route fairness and removable pieces — pass ${pass + 1} / ${boardCleanupPassLimit}`, evaluationsUsed);
      const usableStarts = competitiveMode
        ? computeCourseReachableStarts(sequence.firstLeg)
        : computeUsableStarts(sequence.firstLeg, {
          competitiveMode,
          virtualBots,
          payToWin: Boolean(effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts),
          subsidizedStarts: effectiveVariantBundle.subsidizedStarts
        });
      let pruningChanged = false;
      await reportStage(`Checking removable docks — pass ${pass + 1} / ${boardCleanupPassLimit}`, evaluationsUsed);
      const prunedDocks = pruneUnusedDockPlacements(
        scenarioDockPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints
      );
      if (prunedDocks.pruned) {
        // Keep orphan-board A/B tests isolated from unrelated physical cleanup.
        // Re-run the course after dock pruning before considering a board.
        scenarioDockPlacements = prunedDocks.dockPlacements;
        await reportStage(`Dock cleanup changed the course — reanalyzing`, evaluationsUsed);
        continue;
      }

      await reportStage(`Checking removable boards — pass ${pass + 1} / ${boardCleanupPassLimit}`, evaluationsUsed);
      const protectedSandwichBoards = sandwichedDock
        ? getProtectedSandwichBoardIndices(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        )
        : new Set();
      const prunedBoards = pruneUnusedBoardPlacements(
        scenarioBoardPlacements,
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        {
          ...generationPreferences,
          ...effectiveVariantBundle,
          protectedBoardIndices: protectedSandwichBoards,
          protectedBoardPlacements: wholeCourseAblationProtectedBoards,
          dockPlacements: scenarioDockPlacements
        }
      );
      if (prunedBoards.ablationDecisions?.length) {
        boardCleanupAuditTrail.push({
          pass: pass + 1,
          decisions: prunedBoards.ablationDecisions.map((decision) => ({
            ...decision,
            ablation: decision.ablation ? { ...decision.ablation } : null
          }))
        });
      }
      if (prunedBoards.pruned) {
        if (pass + 1 >= boardCleanupPassLimit) {
          boardCleanupAuditTrail.push({
            pass: pass + 1,
            wholeCourseAblation: true,
            decisions: [{
              boardIndex: prunedBoards.removedBoard?.boardIndex ?? null,
              pieceId: prunedBoards.removedBoard?.pieceId ?? null,
              action: "retain",
              reason: "whole-course-ablation-pass-limit"
            }]
          });
          wholeCourseAblationProtectedBoards.add(prunedBoards.removedBoardPlacement);
        } else {
          const baselineMetrics = classifyCurrentCleanupCourse();
          pendingWholeCourseBoardAblation = {
            baselineSnapshot: summarizeWholeCourseBoardAblationState(
              sequence,
              baselineMetrics
            ),
            originalBoardPlacements: [...scenarioBoardPlacements],
            originalOverlayPlacements: [...scenarioOverlayPlacements],
            baselineSequence: sequence,
            baselineTileMap: scenarioTileMap,
            baselineGoalTileMap: goalTileMap,
            baselineRebootTokens: rebootTokens,
            baselineBoardRects: scenarioBoardRects,
            baselineActiveStarts: activeStarts,
            baselineEffectiveVariantBundle: effectiveVariantBundle,
            testStartedPass: pass + 1,
            removedBoard: prunedBoards.removedBoard,
            removedBoardPlacement: prunedBoards.removedBoardPlacement
          };
          scenarioBoardPlacements = prunedBoards.boardPlacements;
          scenarioOverlayPlacements = prunedBoards.overlayPlacements;
          await reportStage(
            `Testing orphan-board removal with a full course reanalysis`,
            evaluationsUsed
          );
          continue;
        }
      }

      await reportStage(`Checking removable overlays — pass ${pass + 1} / ${boardCleanupPassLimit}`, evaluationsUsed);
      const prunedOverlays = pruneIrrelevantOverlayPlacements(
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        { hazardousFlags }
      );
      if (prunedOverlays.pruned) {
        scenarioOverlayPlacements = prunedOverlays.overlayPlacements;
        pruningChanged = true;
      }

      await reportStage(`Cleanup pass ${pass + 1} / ${boardCleanupPassLimit} complete`, evaluationsUsed);
      if (pruningChanged) {
        continue;
      }

      if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount > 0) {
        const retainedBoardOverlayCount = scenarioOverlayPlacements.filter((placement) => (
          !isMiniOverlayPiece(pieceMap[placement.pieceId])
        )).length;
        if (retainedBoardOverlayCount < calibrationBoardOverlayCount) {
          sequenceFailureCategory = "overlay-placement";
          sequenceFailureReason = `Calibration requested ${calibrationBoardOverlayCount} structural board overlay(s), but only ${retainedBoardOverlayCount} remained relevant after route cleanup.`;
          sequence = null;
          break;
        }
      }

      break;
    }
    if (!sequence && pendingWholeCourseBoardAblation) {
      // A reduced orphan-board test that cannot complete authoritative analysis
      // is itself a material difference. Do not reject an otherwise valid
      // original course because the experimental reduced construction failed;
      // restore the already-analyzed baseline and keep the board.
      const failedTest = pendingWholeCourseBoardAblation;
      boardCleanupAuditTrail.push({
        pass: (failedTest.testStartedPass ?? 0) + 1,
        wholeCourseAblation: true,
        decisions: [{
          boardIndex: failedTest.removedBoard?.boardIndex ?? null,
          pieceId: failedTest.removedBoard?.pieceId ?? null,
          action: "restore",
          reason: "whole-course-reanalysis-failed",
          comparison: {
            materialDifference: true,
            reasons: [
              `reduced-course-${sequenceFailureCategory || "analysis"}-failed`
            ],
            deltas: {
              difficultyTurnRE: null,
              lengthWallClockTurnIndex: null,
              fairnessRangeRE: null,
              trafficAveragePenalty: null
            }
          }
        }]
      });
      scenarioBoardPlacements = failedTest.originalBoardPlacements;
      scenarioOverlayPlacements = failedTest.originalOverlayPlacements;
      sequence = failedTest.baselineSequence;
      scenarioTileMap = failedTest.baselineTileMap;
      goalTileMap = failedTest.baselineGoalTileMap;
      rebootTokens = failedTest.baselineRebootTokens;
      scenarioBoardRects = failedTest.baselineBoardRects;
      activeStarts = failedTest.baselineActiveStarts;
      effectiveVariantBundle = failedTest.baselineEffectiveVariantBundle;
      wholeCourseAblationProtectedBoards.add(failedTest.removedBoardPlacement);
      pendingWholeCourseBoardAblation = null;
    }
    if (!sequence) {
      recordRejectionEvent(
        retryTelemetryBefore,
        sequenceFailureCategory,
        sequenceFailureReason,
        sequenceFailureDiagnostics
      );
      staleRetries += 1;
      continue;
    }
    if (
      sandwichedDock &&
      !hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      )
    ) {
      recordRejectionEvent(
        retryTelemetryBefore,
        "sandwiched-layout",
        "sandwiched dock structure was not preserved after pruning"
      );
      staleRetries += 1;
      continue;
    }
    if (effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts) {
      const pricedStartSummary = sequence.firstLeg.summary.payToWin ?? null;
      if (pricedStartSummary?.availabilityValid === false) {
        recordRejectionEvent(
          retryTelemetryBefore,
          effectiveVariantBundle.subsidizedStarts ? "subsidized-starts" : "pay-to-win",
          effectiveVariantBundle.subsidizedStarts
            ? "Subsidized Starts pricing left insufficient compensable starting-space availability"
            : "Pay to Win pricing left insufficient affordable starting-space availability"
        );
        staleRetries += 1;
        continue;
      }
    }
    const effectiveStartZoneCount = effectiveNoDocks
      ? (noDockEdge ? 1 : 0)
      : scenarioDockPlacements.length;
    const extraDocksRequestMismatch = Boolean(
      effectiveVariantBundle.extraDocks &&
      effectiveStartZoneCount <= 1 &&
      isVariantForced(preferences, "extraDocks")
    );
    if (effectiveVariantBundle.extraDocks && effectiveStartZoneCount <= 1) {
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: false
      };
    } else if (effectiveStartZoneCount > 1 && !effectiveVariantBundle.extraDocks) {
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: true
      };
    }
    // Route cleanup may have removed unused boards, docks, or overlays after the
    // pre-route checkpoint prediction. Refresh the retained stage diagnostics so
    // the accepted scenario reports guidance for the construction it actually uses.
    await reportStage("Recomputing retained course guidance", evaluationsUsed);
    boardsKnownGuidance = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "boardsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: scenarioBoardPlacements.length,
        flagCount: playableCheckpoints.length,
        boardPlacements: scenarioBoardPlacements,
        dockPlacements: scenarioDockPlacements,
        overlayPlacements: scenarioOverlayPlacements
      }
    );
    await reportStage("Recomputing retained checkpoint guidance", evaluationsUsed);
    checkpointsKnownGuidance = predictConstructionGuidanceStage(
      assets.constructionGuidance,
      "checkpointsKnown",
      {
        preferences: generationPreferences,
        pieceMap,
        boardCount: scenarioBoardPlacements.length,
        flagCount: playableCheckpoints.length,
        boardPlacements: scenarioBoardPlacements,
        dockPlacements: scenarioDockPlacements,
        overlayPlacements: scenarioOverlayPlacements,
        checkpoints: playableCheckpoints,
        starts: activeStarts,
        tileMap: scenarioTileMap
      }
    );

    await reportStage("Checking difficulty, length, and final fit", evaluationsUsed);
    let metrics = classifyCandidate(sequence, {
      ...generationPreferences,
      ...effectiveVariantBundle,
      actFast,
      actFastMode,
      flagCount,
      recoveryRule,
      classicSharedDeck,
      movingTargets
    }, {
      boardPlacements: scenarioBoardPlacements,
      overlayPlacements: scenarioOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      pieceMap,
      checkpoints: playableCheckpoints,
      activeStarts,
      tileMap: scenarioTileMap,
      goalTileMap,
      rebootTokens,
      boardCleanupAuditTrail
    });
    await reportStage("Final classification complete — preparing course result", evaluationsUsed);
    if (extraDocksRequestMismatch) {
      metrics = {
        ...metrics,
        acceptable: false,
        hardFailures: [...new Set([...(metrics.hardFailures ?? []), "extra-docks"])]
      };
    }
    const analyzedReachableIndices = new Set(
      computeCourseReachableStarts(sequence.firstLeg).map((entry) => entry.index)
    );
    const validatedStartIndices = [...analyzedReachableIndices];
    const validatedStartSet = new Set(validatedStartIndices);
    const usableStartSet = new Set((metrics.usableStarts ?? []).map((entry) => entry.index));
    const blockedStartIndices = virtualBots
      ? []
      : activeStarts
        .map((_, index) => index)
        .filter((index) => competitiveMode
          ? !validatedStartSet.has(index)
          : !usableStartSet.has(index)
        );
    // Reconstruction fidelity invariant: this field records the start field that
    // actually entered authoritative full-course analysis, not the smaller set
    // retained after Normal balance/pricing/selection. Generation sends every
    // active structural start through the shared route foundation; reload must do
    // the same and only then reproduce the accepted disposition. Conflating the
    // analyzed field with usable starts made reload a different five-start (etc.)
    // course evaluation instead of reconstruction of the accepted course.
    const analysisStartIndices = activeStarts.map((_, index) => index);
    const allPhysicalStartIndices = activeStarts.map((_, index) => index);
    const targetedStagingIndices = sequence.firstLeg?.summary?.contextualStaging?.selectedIndices;
    const routePoolCandidateIndices = new Set(
      Array.isArray(targetedStagingIndices) && targetedStagingIndices.length
        ? targetedStagingIndices
        : allPhysicalStartIndices
    );
    const outsidePoolIndices = virtualBots
      ? []
      : allPhysicalStartIndices.filter((index) => !routePoolCandidateIndices.has(index));
    const routeFailedIndices = virtualBots
      ? []
      : [...routePoolCandidateIndices].filter((index) => !validatedStartSet.has(index));
    const startEnergyPricingActive = Boolean(
      effectiveVariantBundle.payToWin || effectiveVariantBundle.subsidizedStarts
    );
    const payToWinPrunedIndices = startEnergyPricingActive
      ? (sequence.firstLeg.summary.payToWin?.pruned ?? []).map((entry) => entry.index)
      : [];
    const selectorUnavailableIndices = startEnergyPricingActive
      ? sequence.firstLeg.starts
        .filter((entry) => entry.payToWinUnavailable)
        .map((entry) => entry.index)
      : [];
    const normalPrunedIndices = (!competitiveMode && !startEnergyPricingActive && !virtualBots)
      ? [...validatedStartSet].filter((index) => !usableStartSet.has(index))
      : [];
    const classifiedBlockedIndices = new Set([
      ...outsidePoolIndices,
      ...routeFailedIndices,
      ...payToWinPrunedIndices,
      ...selectorUnavailableIndices,
      ...normalPrunedIndices
    ]);
    const otherBlockedIndices = blockedStartIndices.filter((index) => !classifiedBlockedIndices.has(index));
    const competitiveBalance = sequence.firstLeg?.summary?.competitiveStartBalance ?? null;
    const startDisposition = {
      physicalCount: activeStarts.length,
      validatedCount: validatedStartSet.size,
      blockedCount: blockedStartIndices.length,
      outsidePoolIndices: [...outsidePoolIndices].sort((left, right) => left - right),
      routeFailedIndices: [...routeFailedIndices].sort((left, right) => left - right),
      normalPrunedIndices: [...normalPrunedIndices].sort((left, right) => left - right),
      competitiveStrategicBlockIndices: competitiveMode
        ? [...(competitiveBalance?.blockedIndices ?? [])].sort((left, right) => left - right)
        : [],
      competitiveSelectedIndices: competitiveMode
        ? [...(competitiveBalance?.selectedIndices ?? [])].sort((left, right) => left - right)
        : [],
      pricePrunedIndices: [...payToWinPrunedIndices].sort((left, right) => left - right),
      selectorUnavailableIndices: [...selectorUnavailableIndices].sort((left, right) => left - right),
      otherBlockedIndices: [...otherBlockedIndices].sort((left, right) => left - right)
    };

    await reportStage("Finalizing course details", evaluationsUsed);
    scenarioPlacements = [
      ...scenarioBoardPlacements,
      ...scenarioDockPlacements,
      ...scenarioOverlayPlacements
    ];
    const finalOverlayPlacements = scenarioPlacements.filter((placement) => placement.overlay);
    currentConstructionFingerprint = getCourseConstructionFingerprint(
      scenarioBoardPlacements,
      scenarioDockPlacements,
      finalOverlayPlacements,
      checkpoints
    );
    const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
    const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(scenarioTileMap, playableCheckpoints, effectiveVariantBundle.movingTargets);
    const sandwichedDockFacing = (sandwichedDock && !startupSpinUp)
      ? getSandwichedDockFacingTowardCheckpoint(
        scenarioDockPlacements[0],
        pieceMap,
        playableCheckpoints[0]
      )
      : null;
    const scenario = applyVariantScenarioState({
      pieceMap: assets.pieceMap,
      imageMap: assets.imageMap,
      placements: scenarioPlacements,
      overlayPlacements: finalOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      dockSummaries: buildDockSummaries(scenarioBoardPlacements, scenarioDockPlacements, pieceMap),
      checkpoints,
      virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
      rebootTokens,
      goalTileMap,
      activeStarts,
      blockedStartIndices,
      validatedStartIndices: [...validatedStartSet].sort((left, right) => left - right),
      analysisStartIndices,
      startDisposition,
      playerCount: preferences.playerCount,
      actFast,
      actFastMode,
      payToWin: effectiveVariantBundle.payToWin,
      subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
      noDocks: effectiveNoDocks,
      sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      ),
      sandwichedDockFacing,
      noDockEdge: noDockEdge ? { boardIndex: noDockEdge.boardIndex, pieceId: noDockEdge.pieceId, side: noDockEdge.side, facing: noDockEdge.facing } : null,
      noDockEdges: noDockEdges.map((edge) => ({ boardIndex: edge.boardIndex, pieceId: edge.pieceId, side: edge.side, facing: edge.facing, edgeLength: edge.edgeLength })),
      noDockStarts,
      virtualBots,
      extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
      mainBoardIds: scenarioBoardPlacements.map((placement) => placement.pieceId),
      mainRotations: scenarioBoardPlacements.map((placement) => placement.rotation),
      boardCount: scenarioBoardPlacements.length,
      constructionFingerprint: currentConstructionFingerprint,
      boardRects: scenarioBoardRects,
      constructionGuidancePrior,
      constructionGuidanceStages: {
        boardsKnown: boardsKnownGuidance,
        checkpointsKnown: checkpointsKnownGuidance
      },
      guidanceLevel,
      sequence,
      metrics,
      movingTargetStats: metrics.movingTargetStats,
      movingTargetTimelines,
      movingTargetReentryMarkers,
      preferences: {
        ...generationPreferences,
        overlayMode: normalizeOverlayMode(generationPreferences.overlayMode),
        actFast,
        actFastMode,
        competitiveMode,
        payToWin: effectiveVariantBundle.payToWin,
        subsidizedStarts: effectiveVariantBundle.subsidizedStarts,
        extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
        noDocks: effectiveNoDocks,
        sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        ),
        factoryRejects,
        flagCount,
        virtualBots,
        classicSharedDeck,
        criticalSpam,
        criticalHaywire,
        permanentShutdown,
        cuttingFloor: effectiveVariantBundle.cuttingFloor,
        flamingOil: effectiveVariantBundle.flamingOil,
        repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
        upgradeWorld: effectiveVariantBundle.upgradeWorld,
        hazardousFlags,
        repairStations: effectiveVariantBundle.repairStations,
        movingTargets,
        lighterGame,
        lessSpammyGame,
        lessForeshadowing,
        staggeredBoards
      }
    }, effectiveVariantBundle);

    const scenarioFallbackScore = getFallbackScenarioScore(scenario);
    if (extraDocksRequestMismatch) {
      const bestNearMissScore = getFallbackScenarioScore(bestExtraDocksNearMissScenario);
      if (Number.isFinite(scenarioFallbackScore) && scenarioFallbackScore < bestNearMissScore) {
        bestExtraDocksNearMissScenario = scenario;
      }
      // This board construction cannot satisfy forced Extra Docks. Retain the
      // completed one-dock course for diagnostics only, then move on to a fresh
      // construction instead of spending checkpoint retries on a setup that can
      // never become compliant. It is never returned as a fallback course.
      staleRetries = stallLimit;
    } else {
      const bestFallbackScore = getFallbackScenarioScore(bestScenario);
      if (Number.isFinite(scenarioFallbackScore) && scenarioFallbackScore < bestFallbackScore) {
        bestScenario = scenario;
        staleRetries = 0;
      } else {
        staleRetries += 1;
      }
    }

    if (!scenario.metrics.acceptable) {
      const rejectionReason = describeGenerationRejection(
        scenario,
        "final classification"
      );
      recordRejectionEvent(
        retryTelemetryBefore,
        getGenerationRejectionCategory(scenario, rejectionReason),
        rejectionReason
      );
    }

    if (extraDocksRequestMismatch || scenario.metrics.acceptable || (retry > 0 && staleRetries >= stallLimit)) {
      break;
    }
  }

  return {
    scenario: bestScenario,
    extraDocksNearMissScenario: bestExtraDocksNearMissScenario,
    evaluationsUsed: Math.max(1, evaluationsUsed),
    rejectionEvents,
    calibrationConstructionSnapshot
  };
}
