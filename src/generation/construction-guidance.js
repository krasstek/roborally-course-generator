// Robo Rally Course Randomizer - construction guidance: calibrated predictions and ranking of board and checkpoint proposals
import {
  buildCalibrationConstructionSnapshot,
  getCalibrationExpansionIds,
  summarizeCalibrationBoardProfiles,
  summarizeCalibrationLayout
} from "./calibration-features.js";
import {
  CONSTRUCTION_GUIDANCE_STAGE_POLICIES,
  getConstructionGuidanceModePolicy
} from "./generation-modes.js";
import { isMiniOverlayPiece } from "./layout-geometry.js";
import { clamp } from "./math.js";
import { getSelectedExpansionIds, normalizeBoardSpread } from "./preferences.js";
import { sample, sampleManyWeighted } from "./random.js";
import {
  bandDistance,
  computeActFastLengthLoad,
  getLegacyDifficultyThresholds,
  getLengthThresholds
} from "./targets.js";
import { getMinimumSmallOnlyBoardCount, isDynamicArchivingActive } from "./variant-availability.js";

export function getConstructionGuidanceInventoryPreset(calibration, preferences = {}, pieceMap = {}) {
  const supported = new Set(calibration?.domain?.inventoryPresets ?? []);
  if (!supported.size) return null;

  const selected = [...getSelectedExpansionIds(preferences)].sort();
  const all = getCalibrationExpansionIds(pieceMap);
  const sameIds = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );

  if (supported.has("all") && sameIds(selected, all)) {
    return "all";
  }
  if (selected.length === 1) {
    if (selected[0] === "roborally" && supported.has("core")) {
      return "core";
    }
    const smallPreset = `small:${selected[0]}`;
    return supported.has(smallPreset) ? smallPreset : null;
  }
  if (selected.length === 2 && selected.includes("roborally")) {
    const expansionId = selected.find((id) => id !== "roborally");
    const preset = `core+${expansionId}`;
    return supported.has(preset) ? preset : null;
  }
  return null;
}

export function getConstructionGuidanceFactorContribution(model, factorName, rawLevel) {
  const levels = model?.factorLevels?.[factorName] ?? [];
  if (!levels.length) return null;
  const requestedLevel = String(rawLevel);
  const coefficientForLevel = (level) => {
    if (level === levels[0]) return 0;
    // R drops aliased coefficients from the exported snapshot. For a known
    // factor level, an absent coefficient therefore represents the rank-reduced
    // zero contribution rather than an unknown level.
    const value = Number(model.coefficients?.[`${factorName}${level}`]);
    return Number.isFinite(value) ? value : 0;
  };

  if (levels.includes(requestedLevel)) {
    return coefficientForLevel(requestedLevel);
  }

  // Player count was calibrated at 2/4/6/8 while the app also supports the odd
  // counts between them. Interpolate only inside that observed range; never
  // extrapolate beyond it or interpolate any other categorical factor.
  if (factorName === "player_factor") {
    const requested = Number(rawLevel);
    const numericLevels = levels
      .map((level) => ({ level, value: Number(level) }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((left, right) => left.value - right.value);
    if (
      Number.isFinite(requested) &&
      numericLevels.length >= 2 &&
      requested >= numericLevels[0].value &&
      requested <= numericLevels.at(-1).value
    ) {
      for (let index = 1; index < numericLevels.length; index += 1) {
        const lower = numericLevels[index - 1];
        const upper = numericLevels[index];
        if (requested < lower.value || requested > upper.value) continue;
        const span = upper.value - lower.value;
        if (!(span > 0)) return coefficientForLevel(lower.level);
        const fraction = (requested - lower.value) / span;
        const lowerContribution = coefficientForLevel(lower.level);
        const upperContribution = coefficientForLevel(upper.level);
        return lowerContribution + (upperContribution - lowerContribution) * fraction;
      }
    }
  }

  return null;
}

export function evaluateConstructionGuidanceModel(model, features = {}) {
  if (!model) return null;
  let linearPredictor = Number(model.coefficients?.["(Intercept)"]);
  if (!Number.isFinite(linearPredictor)) return null;

  const factorCoefficientKeys = new Set();
  for (const [factorName, levels] of Object.entries(model.factorLevels ?? {})) {
    const contribution = getConstructionGuidanceFactorContribution(
      model,
      factorName,
      features[factorName]
    );
    if (!Number.isFinite(contribution)) return null;
    linearPredictor += contribution;
    for (const level of levels.slice(1)) {
      factorCoefficientKeys.add(`${factorName}${level}`);
    }
  }

  for (const [term, coefficient] of Object.entries(model.coefficients ?? {})) {
    if (term === "(Intercept)" || factorCoefficientKeys.has(term)) continue;
    const value = Number(features[term]);
    if (!Number.isFinite(value)) return null;
    linearPredictor += Number(coefficient) * value;
  }

  if (model.type === "logistic") {
    const probability = linearPredictor >= 0
      ? 1 / (1 + Math.exp(-linearPredictor))
      : Math.exp(linearPredictor) / (1 + Math.exp(linearPredictor));
    return {
      linearPredictor,
      value: clamp(probability, 0, 1)
    };
  }

  const value = model.targetTransform === "log1p"
    ? Math.max(0, Math.expm1(linearPredictor))
    : linearPredictor;
  return { linearPredictor, value };
}

export function getConstructionGuidanceBaseFeatures(
  calibration,
  preferences,
  pieceMap,
  boardCount,
  flagCount
) {
  const inventoryPreset = getConstructionGuidanceInventoryPreset(
    calibration,
    preferences,
    pieceMap
  );
  if (!inventoryPreset) return null;

  const difficulty = String(preferences.difficulty ?? "");
  const length = String(preferences.length ?? "");
  const boardSpread = normalizeBoardSpread(preferences.boardSpread);
  if (
    !calibration.domain.difficulties.includes(difficulty) ||
    !calibration.domain.lengths.includes(length) ||
    (calibration.domain.boardSpreads.length > 0 && !calibration.domain.boardSpreads.includes(boardSpread))
  ) {
    return null;
  }

  const safeBoardCount = Number(boardCount);
  const safeFlagCount = Number(flagCount);
  const playerCount = Number(preferences.playerCount);
  if (
    !Number.isFinite(playerCount) ||
    !calibration.domain.requestedBoardCounts.includes(safeBoardCount) ||
    !calibration.domain.requestedFlagCounts.includes(safeFlagCount)
  ) {
    return null;
  }

  return {
    player_factor: String(playerCount),
    board_factor: String(safeBoardCount),
    flag_factor: String(safeFlagCount),
    board_spread_factor: boardSpread,
    difficulty_factor: difficulty,
    length_factor: length,
    inventory_factor: inventoryPreset
  };
}

export function getConstructionGuidanceBoardFeatures(boardPlacements = [], pieceMap = {}) {
  const profileSummary = summarizeCalibrationBoardProfiles(boardPlacements, pieceMap);
  const layout = summarizeCalibrationLayout(boardPlacements, pieceMap);
  const features = {
    profile_overall: profileSummary.means.overall,
    profile_hazard: profileSummary.means.hazard,
    profile_congestion: profileSummary.means.congestion,
    profile_complexity: profileSummary.means.complexity,
    profile_swinginess: profileSummary.means.swinginess,
    profile_density: profileSummary.means.density,
    compactness: layout.compactness,
    adjacency_count: layout.adjacencyCount,
    graph_diameter: layout.graphDiameter
  };
  return Object.values(features).every((value) => Number.isFinite(Number(value)))
    ? features
    : null;
}

export function getConstructionGuidanceCheckpointFeatures({
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = [],
  starts = [],
  tileMap = new Map(),
  pieceMap = {},
  preferences = {}
} = {}) {
  const snapshot = buildCalibrationConstructionSnapshot({
    boardPlacements,
    dockPlacements,
    overlayPlacements,
    checkpoints,
    starts,
    tileMap,
    pieceMap,
    preferences
  });
  const boardFeatures = getConstructionGuidanceBoardFeatures(boardPlacements, pieceMap);
  if (!boardFeatures) return null;

  // v47 production guidance keeps checkpoint-stage coverage when static topology
  // cannot be summarized. Match calibration-analysis.R exactly: fall back each
  // unavailable static distance to its Manhattan counterpart and carry one
  // explicit missingness indicator. Missing static topology is uncertainty/work
  // evidence only; it is never interpreted as route impossibility.
  const finiteSnapshotNumber = (value) => (
    typeof value === "number" && Number.isFinite(value) ? value : null
  );
  const firstStartManhattan = finiteSnapshotNumber(snapshot?.shape?.firstStartManhattanMean);
  const firstStartStatic = finiteSnapshotNumber(snapshot?.shape?.firstStartStaticMean);
  const sequentialManhattan = finiteSnapshotNumber(snapshot?.shape?.sequentialManhattanSum);
  const sequentialStatic = finiteSnapshotNumber(snapshot?.shape?.sequentialStaticSum);
  const finalManhattan = finiteSnapshotNumber(snapshot?.shape?.finalManhattan);
  const finalStatic = finiteSnapshotNumber(snapshot?.shape?.finalStaticDistance);
  const staticTopologyMissing = Number(
    firstStartStatic === null ||
    sequentialStatic === null ||
    finalStatic === null
  );

  const features = {
    ...boardFeatures,
    first_start_manhattan_mean: firstStartManhattan,
    first_start_static_mean: firstStartStatic,
    first_start_static_fallback: firstStartStatic ?? firstStartManhattan,
    sequential_manhattan_sum: sequentialManhattan,
    sequential_static_sum: sequentialStatic,
    sequential_static_fallback: sequentialStatic ?? sequentialManhattan,
    final_manhattan: finalManhattan,
    final_static_distance: finalStatic,
    final_static_fallback: finalStatic ?? finalManhattan,
    static_topology_missing: staticTopologyMissing,
    board_depth_mean: finiteSnapshotNumber(snapshot?.shape?.boardDepthMean),
    represented_board_count: finiteSnapshotNumber(snapshot?.shape?.representedBoardCount),
    shallow_checkpoint_count: finiteSnapshotNumber(snapshot?.shape?.shallowCheckpointCount)
  };

  // Raw static values are retained for diagnostics and may legitimately be null.
  // Validate only the full-coverage production feature set consumed by the v47
  // checkpoint models; evaluateConstructionGuidanceModel will independently reject
  // any future coefficient term for which a required numeric feature is absent.
  const requiredProductionFeatures = [
    ...Object.keys(boardFeatures),
    "first_start_manhattan_mean",
    "first_start_static_fallback",
    "sequential_manhattan_sum",
    "sequential_static_fallback",
    "final_manhattan",
    "final_static_fallback",
    "static_topology_missing",
    "board_depth_mean",
    "represented_board_count",
    "shallow_checkpoint_count"
  ];
  return requiredProductionFeatures.every((key) => Number.isFinite(features[key]))
    ? features
    : null;
}

export function getConstructionGuidanceOutcomeInterval(model, predictedValue, treatment = null) {
  const spread = model?.evidence?.outOfFoldResidualSpread ?? {};
  const rmse = Number(model?.evidence?.heldOutRmse);
  let lowerOffset = Number(spread.signedP05);
  let upperOffset = Number(spread.signedP95);
  if (!Number.isFinite(lowerOffset)) lowerOffset = Number.isFinite(rmse) ? -2 * rmse : 0;
  if (!Number.isFinite(upperOffset)) upperOffset = Number.isFinite(rmse) ? 2 * rmse : 0;

  if (treatment) {
    const directLowerOffset = treatment.lowerOffset == null
      ? Number.NaN
      : Number(treatment.lowerOffset);
    const directUpperOffset = treatment.upperOffset == null
      ? Number.NaN
      : Number(treatment.upperOffset);
    if (Number.isFinite(directLowerOffset)) {
      lowerOffset += directLowerOffset;
    } else {
      const mean = Number(treatment.mean);
      const p10 = Number(treatment.p10);
      if (Number.isFinite(mean) && Number.isFinite(p10)) lowerOffset += p10 - mean;
    }
    if (Number.isFinite(directUpperOffset)) {
      upperOffset += directUpperOffset;
    } else {
      const mean = Number(treatment.mean);
      const p90 = Number(treatment.p90);
      if (Number.isFinite(mean) && Number.isFinite(p90)) upperOffset += p90 - mean;
    }
  }

  return {
    low: predictedValue + lowerOffset,
    high: predictedValue + upperOffset,
    lowerOffset,
    upperOffset
  };
}

export function getConstructionGuidanceDynamicArchivingTreatment(
  calibration,
  outcome,
  preferences = {},
  stage = null,
  features = null
) {
  if (!isDynamicArchivingActive(preferences)) return null;
  const treatment = calibration?.treatments?.dynamicArchiving;
  if (!treatment) return null;

  if (
    outcome === "length" &&
    treatment.contextualModelEnabled === true &&
    stage === treatment.lengthContextStage &&
    stage === "checkpointsKnown" &&
    treatment.lengthContextModel &&
    features
  ) {
    const evaluated = evaluateConstructionGuidanceModel(treatment.lengthContextModel, features);
    if (evaluated) {
      const spread = treatment.lengthContextModel?.evidence?.outOfFoldResidualSpread ?? {};
      const rmse = Number(treatment.lengthContextModel?.evidence?.heldOutRmse);
      let lowerOffset = Number(spread.signedP05);
      let upperOffset = Number(spread.signedP95);
      if (!Number.isFinite(lowerOffset)) lowerOffset = Number.isFinite(rmse) ? -2 * rmse : 0;
      if (!Number.isFinite(upperOffset)) upperOffset = Number.isFinite(rmse) ? 2 * rmse : 0;
      return {
        kind: "dynamic-archiving-contextual",
        mean: evaluated.value,
        p10: null,
        p90: null,
        lowerOffset,
        upperOffset
      };
    }
  }

  const prefix = outcome === "length" ? "length" : "difficulty";
  const mean = Number(treatment[`${prefix}EffectMean`]);
  const p10 = Number(treatment[`${prefix}EffectP10`]);
  const p90 = Number(treatment[`${prefix}EffectP90`]);
  return {
    kind: "dynamic-archiving-constant",
    mean: Number.isFinite(mean) ? mean : 0,
    p10: Number.isFinite(p10) ? p10 : null,
    p90: Number.isFinite(p90) ? p90 : null,
    lowerOffset: null,
    upperOffset: null
  };
}

export function isConstructionGuidanceStructuralSuccessApplicable(preferences = {}, overlayPlacements = [], pieceMap = {}) {
  const structuralOverlayCount = (overlayPlacements ?? []).filter((placement) => (
    !isMiniOverlayPiece(pieceMap[placement.pieceId])
  )).length;
  return !Boolean(
    structuralOverlayCount ||
    isDynamicArchivingActive(preferences) ||
    preferences.competitiveMode ||
    preferences.payToWin ||
    preferences.subsidizedStarts ||
    preferences.virtualBots ||
    preferences.noDocks ||
    preferences.extraDocks ||
    preferences.sandwichedDock ||
    preferences.staggeredBoards ||
    preferences.movingTargets
  );
}

export function predictConstructionGuidanceStage(
  calibration,
  stage,
  {
    preferences = {},
    pieceMap = {},
    boardCount = null,
    flagCount = null,
    boardPlacements = [],
    dockPlacements = [],
    overlayPlacements = [],
    checkpoints = [],
    starts = [],
    tileMap = new Map()
  } = {}
) {
  const models = calibration?.normalLandscape?.[stage];
  if (!models) return null;

  const resolvedBoardCount = Number.isFinite(Number(boardCount))
    ? Number(boardCount)
    : boardPlacements.length;
  const resolvedFlagCount = Number.isFinite(Number(flagCount))
    ? Number(flagCount)
    : checkpoints.length;
  const baseFeatures = getConstructionGuidanceBaseFeatures(
    calibration,
    preferences,
    pieceMap,
    resolvedBoardCount,
    resolvedFlagCount
  );
  if (!baseFeatures) return null;

  let numericFeatures = {};
  if (stage === "boardsKnown" || stage === "checkpointsKnown") {
    numericFeatures = getConstructionGuidanceBoardFeatures(boardPlacements, pieceMap);
    if (!numericFeatures) return null;
  }
  if (stage === "checkpointsKnown") {
    numericFeatures = getConstructionGuidanceCheckpointFeatures({
      boardPlacements,
      dockPlacements,
      overlayPlacements,
      checkpoints,
      starts,
      tileMap,
      pieceMap,
      preferences
    });
    if (!numericFeatures) return null;
  }
  const features = { ...baseFeatures, ...numericFeatures };

  const makeOutcome = (outcome) => {
    const model = models[outcome];
    const evaluated = evaluateConstructionGuidanceModel(model, features);
    if (!evaluated) return null;
    let predictedValue = evaluated.value;
    let treatment = null;
    if (outcome === "length" || outcome === "difficulty") {
      treatment = getConstructionGuidanceDynamicArchivingTreatment(
        calibration,
        outcome,
        preferences,
        stage,
        features
      );
      if (treatment) predictedValue += Number(treatment.mean) || 0;
    }
    if (outcome === "length") {
      predictedValue += computeActFastLengthLoad(preferences, Number(preferences.playerCount) || 4);
    }
    return {
      raw: Number(predictedValue.toFixed(2)),
      modelRaw: Number(evaluated.value.toFixed(2)),
      linearPredictor: evaluated.linearPredictor,
      rmse: Number.isFinite(Number(model.evidence?.heldOutRmse))
        ? Number(model.evidence.heldOutRmse)
        : null,
      rSquared: Number.isFinite(Number(model.evidence?.heldOutRSquared))
        ? Number(model.evidence.heldOutRSquared)
        : null,
      sampleSize: Number.isFinite(Number(model.evidence?.sampleSize))
        ? Number(model.evidence.sampleSize)
        : null,
      interval: getConstructionGuidanceOutcomeInterval(model, predictedValue, treatment),
      treatment: treatment ? {
        kind: treatment.kind,
        mean: treatment.mean,
        p10: treatment.p10,
        p90: treatment.p90,
        lowerOffset: treatment.lowerOffset,
        upperOffset: treatment.upperOffset
      } : null
    };
  };

  const length = makeOutcome("length");
  const difficulty = makeOutcome("difficulty");
  const routeEvaluation = evaluateConstructionGuidanceModel(models.routeCost, features);
  if (!length || !difficulty || !routeEvaluation) return null;

  let predictedRouteExpansions = Math.max(0, routeEvaluation.value);
  let overlayWorkMultiplier = 1;
  let overlayWorkMode = "none";
  let overlayWorkLogAdjustment = 0;
  let overlayWorkContextP95LogResidual = 0;
  const structuralOverlayCount = (overlayPlacements ?? []).filter((placement) => (
    !isMiniOverlayPiece(pieceMap[placement.pieceId])
  )).length;
  if (structuralOverlayCount > 0) {
    const workPrior = calibration?.treatments?.structuralBoardOverlay?.analysisWorkPrior;
    let contextualApplied = false;
    if (
      workPrior?.contextualModelEnabled === true &&
      stage === workPrior.contextualStage &&
      stage === "checkpointsKnown" &&
      workPrior.logRatioContextModel
    ) {
      const contextual = evaluateConstructionGuidanceModel(
        workPrior.logRatioContextModel,
        { ...features, overlay_board_count: structuralOverlayCount }
      );
      if (contextual && Number.isFinite(contextual.value)) {
        overlayWorkLogAdjustment = contextual.value;
        overlayWorkMultiplier = Math.exp(overlayWorkLogAdjustment);
        predictedRouteExpansions = Math.max(
          0,
          Math.expm1(Math.log1p(predictedRouteExpansions) + overlayWorkLogAdjustment)
        );
        const contextualP95 = Number(
          workPrior.logRatioContextModel?.evidence?.outOfFoldResidualSpread?.signedP95
        );
        overlayWorkContextP95LogResidual = Number.isFinite(contextualP95) ? contextualP95 : 0;
        overlayWorkMode = "contextual";
        contextualApplied = true;
      }
    }

    if (!contextualApplied) {
      const ratio = Number(workPrior?.medianExpansionRatio);
      if (
        Number.isFinite(ratio) && ratio > 0 &&
        !workPrior?.overlayCountSpecificEnabled &&
        !workPrior?.pieceIdentityEnabled
      ) {
        overlayWorkMultiplier = ratio;
        predictedRouteExpansions *= ratio;
        overlayWorkMode = "constant";
      }
    }
  }

  let structuralSuccessProbability = null;
  if (
    stage === "countsKnown" &&
    calibration.structuralSuccessPrior &&
    isConstructionGuidanceStructuralSuccessApplicable(preferences, overlayPlacements, pieceMap)
  ) {
    const structural = evaluateConstructionGuidanceModel(
      calibration.structuralSuccessPrior,
      features
    );
    if (structural) structuralSuccessProbability = structural.value;
  }

  const routeResidualSpread = models.routeCost.evidence?.outOfFoldResidualSpread ?? null;
  const routeSignedP95Log = Number(routeResidualSpread?.signedP95);
  const routeP95Expansions = Number.isFinite(routeSignedP95Log)
    ? (
      overlayWorkMode === "contextual"
        ? Math.max(
          0,
          Math.expm1(
            routeEvaluation.linearPredictor +
            routeSignedP95Log +
            overlayWorkLogAdjustment +
            overlayWorkContextP95LogResidual
          )
        )
        : Math.max(0, Math.expm1(routeEvaluation.linearPredictor + routeSignedP95Log)) * overlayWorkMultiplier
    )
    : null;

  return {
    stage,
    inventoryPreset: baseFeatures.inventory_factor,
    boardCount: resolvedBoardCount,
    flagCount: resolvedFlagCount,
    length,
    difficulty,
    routeCost: {
      predictedExpansions: Math.round(predictedRouteExpansions),
      modelPredictedExpansions: Math.round(Math.max(0, routeEvaluation.value)),
      log1pPrediction: routeEvaluation.linearPredictor,
      rmseLog: Number.isFinite(Number(models.routeCost.evidence?.heldOutRmse))
        ? Number(models.routeCost.evidence.heldOutRmse)
        : null,
      signedP95LogResidual: Number.isFinite(routeSignedP95Log) ? routeSignedP95Log : null,
      p95Expansions: Number.isFinite(routeP95Expansions) ? Math.round(routeP95Expansions) : null,
      rSquared: Number.isFinite(Number(models.routeCost.evidence?.heldOutRSquared))
        ? Number(models.routeCost.evidence.heldOutRSquared)
        : null,
      sampleSize: Number.isFinite(Number(models.routeCost.evidence?.sampleSize))
        ? Number(models.routeCost.evidence.sampleSize)
        : null,
      structuralOverlayWorkMultiplier: overlayWorkMultiplier,
      structuralOverlayWorkMode: overlayWorkMode,
      structuralOverlayWorkLogAdjustment: overlayWorkMode === "contextual"
        ? overlayWorkLogAdjustment
        : null
    },
    structuralSuccessProbability: Number.isFinite(structuralSuccessProbability)
      ? Number(structuralSuccessProbability.toFixed(4))
      : null,
    features
  };
}

export function getConstructionGuidanceBandScore(outcomePrediction, preference, thresholds) {
  if (preference === "any") return 1;
  if (!outcomePrediction || !thresholds?.[preference]) return 0;
  const distance = bandDistance(outcomePrediction.raw, preference, thresholds);
  const rmse = Number(outcomePrediction.rmse);
  if (!Number.isFinite(distance) || !(rmse > 0)) return 0;
  const z = distance / rmse;
  return Math.exp(-0.5 * z * z);
}

export function getMedianFinite(values = []) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getConstructionGuidancePredictionSignals(prediction, preferences = {}) {
  if (!prediction) {
    return {
      targetDesirability: 1,
      lengthDesirability: 1,
      difficultyDesirability: 1,
      structuralSuccessModifier: 1,
      predictedRouteExpansions: null,
      p95RouteExpansions: null,
      routeSignedP95LogResidual: null
    };
  }

  const lengthDesirability = getConstructionGuidanceBandScore(
    prediction.length,
    preferences.length,
    getLengthThresholds()
  );
  const difficultyDesirability = getConstructionGuidanceBandScore(
    prediction.difficulty,
    preferences.difficulty,
    getLegacyDifficultyThresholds()
  );
  const targetDesirability = Math.max(
    1e-6,
    lengthDesirability * difficultyDesirability
  );
  const structuralSuccessModifier = Number.isFinite(prediction.structuralSuccessProbability)
    ? 0.55 + prediction.structuralSuccessProbability * 0.45
    : 1;

  return {
    targetDesirability,
    lengthDesirability,
    difficultyDesirability,
    structuralSuccessModifier,
    predictedRouteExpansions: Number.isFinite(Number(prediction.routeCost?.predictedExpansions))
      ? Number(prediction.routeCost.predictedExpansions)
      : null,
    p95RouteExpansions: Number.isFinite(Number(prediction.routeCost?.p95Expansions))
      ? Number(prediction.routeCost.p95Expansions)
      : null,
    routeSignedP95LogResidual: Number.isFinite(Number(prediction.routeCost?.signedP95LogResidual))
      ? Number(prediction.routeCost.signedP95LogResidual)
      : null
  };
}

export function applyConstructionGuidanceRanking(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return [];
  const policy = getConstructionGuidanceModePolicy(preferences);
  const predictionKey = options.predictionKey ?? "prediction";
  const routeReference = getMedianFinite(candidates.map((candidate) => (
    getConstructionGuidancePredictionSignals(candidate[predictionKey], preferences).predictedRouteExpansions
  )));

  const scored = candidates.map((candidate) => {
    const prediction = candidate[predictionKey];
    const signals = getConstructionGuidancePredictionSignals(
      prediction,
      preferences
    );
    const stagePolicy = CONSTRUCTION_GUIDANCE_STAGE_POLICIES[prediction?.stage] ??
      CONSTRUCTION_GUIDANCE_STAGE_POLICIES.checkpointsKnown;
    const rankingTargetDesirability = Number.isFinite(Number(candidate.rankingTargetDesirability))
      ? Number(candidate.rankingTargetDesirability)
      : signals.targetDesirability;

    // Blend weak early target evidence toward neutral rather than letting a tiny
    // band-fit score dominate flag/board counts. Counts-known can additionally
    // supply a flag-marginalized target score, so the target may influence board
    // scale without turning flag count itself into a Short/Long control knob.
    const targetBase = (
      1 - stagePolicy.targetBlend +
      stagePolicy.targetBlend * Math.max(1e-6, rankingTargetDesirability)
    );
    const targetComponent = Math.pow(
      Math.max(1e-6, targetBase),
      policy.calibrationStrength
    );
    const effectiveRouteWorkPressure = (
      policy.routeWorkPressure * stagePolicy.routeWorkMultiplier
    );
    let workComponent = 1;
    let tailRiskComponent = 1;
    const effectiveTailRiskPressure = (
      (policy.routeWorkTailRiskPressure ?? 0) *
      (stagePolicy.routeWorkTailRiskMultiplier ?? 0)
    );
    if (
      effectiveRouteWorkPressure > 0 &&
      Number.isFinite(routeReference) &&
      routeReference > 0 &&
      Number.isFinite(signals.predictedRouteExpansions) &&
      signals.predictedRouteExpansions > 0
    ) {
      // Relative work keeps the same production policy meaningful across board
      // sizes and machines. Counts-known deliberately cares more about this than
      // target fit; later stages know enough geometry to trade work against target
      // character more intelligently. Expensive proposals are only de-prioritized.
      const relative = clamp(
        routeReference / signals.predictedRouteExpansions,
        0.25,
        4
      );
      workComponent = Math.pow(relative, effectiveRouteWorkPressure);
    }
    if (
      effectiveTailRiskPressure > 0 &&
      Number.isFinite(routeReference) &&
      routeReference > 0 &&
      Number.isFinite(signals.p95RouteExpansions) &&
      signals.p95RouteExpansions > routeReference
    ) {
      // The v7 work models include held-out signed P95 residuals on log1p work.
      // Use that evidence only as a convex ranking penalty for candidates whose
      // plausible overrun tail is large relative to the current proposal pool.
      // This never rejects a candidate: the random floor and later-attempt
      // flattening preserve the expensive tail as fallback.
      const tailRelative = clamp(
        signals.p95RouteExpansions / routeReference,
        1,
        24
      );
      tailRiskComponent = Math.pow(1 / tailRelative, effectiveTailRiskPressure);
    }
    const calibratedScore = (
      targetComponent *
      signals.structuralSuccessModifier *
      workComponent *
      tailRiskComponent
    );
    return {
      ...candidate,
      calibrationSignals: {
        ...signals,
        routeReference,
        stageTargetBlend: stagePolicy.targetBlend,
        rankingTargetDesirability,
        targetComponent,
        effectiveRouteWorkPressure,
        workComponent,
        effectiveTailRiskPressure,
        tailRiskComponent,
        calibratedScore
      }
    };
  });

  const maxScore = Math.max(
    ...scored.map((candidate) => Number(candidate.calibrationSignals?.calibratedScore) || 0),
    1e-9
  );
  return scored.map((candidate) => {
    const normalized = clamp(
      (Number(candidate.calibrationSignals?.calibratedScore) || 0) / maxScore,
      0,
      1
    );
    // explorationFloor is the literal randomizer tail: even the weakest
    // calibrated proposal keeps non-zero sampling weight.
    const weight = policy.explorationFloor +
      (1 - policy.explorationFloor) * normalized;
    return {
      ...candidate,
      weight: Math.max(1e-6, weight)
    };
  });
}

export function sampleConstructionGuidanceRankedCandidate(candidates = [], preferences = {}, options = {}) {
  if (!candidates.length) return null;
  const ranked = applyConstructionGuidanceRanking(candidates, preferences, options);
  return sampleManyWeighted(ranked, 1)[0] ?? sample(ranked);
}

export function getConstructionGuidanceIntervalMismatch(outcomePrediction, preference, thresholds, metric) {
  if (preference === "any" || !outcomePrediction || !thresholds?.[preference]) return null;
  const [low, high] = thresholds[preference];
  const predictedLow = Number(outcomePrediction.interval?.low);
  const predictedHigh = Number(outcomePrediction.interval?.high);
  if (!Number.isFinite(predictedLow) || !Number.isFinite(predictedHigh)) return null;

  if (Number.isFinite(low) && predictedHigh < low) {
    return {
      metric,
      direction: "low",
      requested: preference,
      predicted: outcomePrediction.raw,
      predictedLow,
      predictedHigh,
      boundary: low
    };
  }
  if (Number.isFinite(high) && predictedLow >= high) {
    return {
      metric,
      direction: "high",
      requested: preference,
      predicted: outcomePrediction.raw,
      predictedLow,
      predictedHigh,
      boundary: high
    };
  }
  return null;
}

export function hasConstructionGuidanceTargetGateIncompatibleVariant(preferences = {}, overlayPlacements = []) {
  // Neither the Normal target models nor the paired structural-board treatment
  // establish safe hard-gate behavior for arbitrary overlay tiles. Keep all
  // overlays on the soft-guidance path; structural board overlays still receive
  // their measured route-work multiplier below.
  const hasAnyOverlay = Boolean((overlayPlacements ?? []).length);
  return Boolean(
    hasAnyOverlay ||
    preferences.actFastMode ||
    preferences.competitiveMode ||
    preferences.payToWin ||
    preferences.subsidizedStarts ||
    preferences.virtualBots ||
    preferences.lighterGame ||
    preferences.lessSpammyGame ||
    preferences.criticalSpam ||
    preferences.criticalHaywire ||
    preferences.lessForeshadowing ||
    preferences.classicSharedDeck ||
    preferences.movingTargets ||
    preferences.cuttingFloor ||
    preferences.flamingOil ||
    preferences.repulsorOverdrive ||
    preferences.setToKill ||
    preferences.setToStun ||
    preferences.lessDeadlyGame ||
    preferences.moreDeadlyGame ||
    preferences.homeReboot ||
    preferences.hazardousFlags ||
    preferences.repairStations ||
    preferences.factoryRejects ||
    preferences.upgradeWorld ||
    preferences.startupSpinUp ||
    preferences.extraDocks ||
    preferences.noDocks ||
    preferences.sandwichedDock ||
    preferences.staggeredBoards
  );
}

export function getConstructionGuidanceGrossMismatch(
  prediction,
  preferences = {},
  overlayPlacements = []
) {
  if (
    !prediction ||
    hasConstructionGuidanceTargetGateIncompatibleVariant(preferences, overlayPlacements)
  ) {
    return { abort: false, mismatches: [] };
  }
  // Routed raw length adds confidence-weighted forecast-uncertainty time. The
  // current calibration length models were fit to the pre-uncertainty
  // metric, so they may still rank proposals but must not hard-abort a checkpoint
  // proposal on length until calibration is regenerated for the new target.
  const mismatches = [
    getConstructionGuidanceIntervalMismatch(
      prediction.difficulty,
      preferences.targetGuidanceOnlyDifficulty ? "any" : preferences.difficulty,
      getLegacyDifficultyThresholds(),
      "difficulty"
    )
  ].filter(Boolean);
  return {
    abort: mismatches.length > 0,
    mismatches
  };
}

export function getCalibratedConstructionPlan(
  maxBoards,
  hasLargeBoards,
  preferences = {},
  pieceMap = {},
  calibration = null
) {
  const explicitBoardCount = Number(preferences.calibrationBoardCount);
  const explicitFlagCount = Number(preferences.calibrationFlagCount);
  if (
    !calibration ||
    !calibration.normalLandscape?.countsKnown ||
    (Number.isInteger(explicitBoardCount) && explicitBoardCount > 0) ||
    (Number.isInteger(explicitFlagCount) && explicitFlagCount > 0)
  ) {
    return null;
  }

  const supportedBoardCounts = (calibration.domain.requestedBoardCounts ?? [])
    .filter((count) => Number.isInteger(count) && count >= 1 && count <= maxBoards)
    .sort((left, right) => left - right);
  const supportedFlagCounts = (calibration.domain.requestedFlagCounts ?? [])
    .filter((count) => Number.isInteger(count) && count >= 1)
    .sort((left, right) => left - right);
  if (!supportedBoardCounts.length || !supportedFlagCounts.length) return null;

  const maxSupportedBoardCount = Math.max(...supportedBoardCounts);
  // The calibrated count domain ends at four boards. Do not silently extrapolate
  // the categorical model to five/six-board small-board layouts.
  if (!hasLargeBoards && maxBoards > maxSupportedBoardCount) {
    return null;
  }

  const minimumBoardCount = Math.max(
    hasLargeBoards ? 1 : getMinimumSmallOnlyBoardCount(),
    preferences.sandwichedDock ? 2 : 1
  );
  const boardCounts = supportedBoardCounts.filter((count) => count >= minimumBoardCount);
  if (!boardCounts.length) return null;

  const candidates = [];

  for (const boardCount of boardCounts) {
    for (const flagCount of supportedFlagCounts) {
      const prediction = predictConstructionGuidanceStage(
        calibration,
        "countsKnown",
        {
          preferences,
          pieceMap,
          boardCount,
          flagCount
        }
      );
      if (!prediction) continue;

      const signals = getConstructionGuidancePredictionSignals(prediction, preferences);
      candidates.push({
        boardCount,
        flagCount,
        stage: "countsKnown",
        inventoryPreset: prediction.inventoryPreset,
        predictedLengthRaw: prediction.length.raw,
        predictedDifficultyRaw: prediction.difficulty.raw,
        lengthDesirability: Number(signals.lengthDesirability.toFixed(4)),
        difficultyDesirability: Number(signals.difficultyDesirability.toFixed(4)),
        targetDesirability: Number(signals.targetDesirability.toFixed(4)),
        structuralSuccessProbability: prediction.structuralSuccessProbability,
        predictedRouteExpansions: prediction.routeCost.predictedExpansions,
        lengthRmse: prediction.length.rmse,
        difficultyRmse: prediction.difficulty.rmse,
        routeCostRmseLog: prediction.routeCost.rmseLog,
        sampleSize: prediction.length.sampleSize,
        prediction
      });
    }
  }

  if (!candidates.length) return null;

  // The counts calibration is observational: more flags naturally correlated
  // with longer courses in the sampled proposal distribution. Do not convert
  // that correlation into a production instruction to add flags for Long/Hard.
  // Marginalize target desirability over all supported flag counts for each board
  // count. Early target guidance may still steer the overall board scale, while
  // flag count itself is chosen mainly by predicted work, structural plausibility
  // and the mode's explicit random tail. Actual geometry gets stronger target
  // authority at boardsKnown/checkpointsKnown.
  const targetByBoardCount = new Map();
  for (const boardCount of boardCounts) {
    const group = candidates.filter((candidate) => candidate.boardCount === boardCount);
    if (!group.length) continue;
    targetByBoardCount.set(
      boardCount,
      group.reduce((sum, candidate) => sum + candidate.targetDesirability, 0) / group.length
    );
  }
  const rankedCandidates = candidates.map((candidate) => ({
    ...candidate,
    rankingTargetDesirability: targetByBoardCount.get(candidate.boardCount) ?? candidate.targetDesirability
  }));

  const selected = sampleConstructionGuidanceRankedCandidate(
    rankedCandidates,
    preferences,
    { predictionKey: "prediction" }
  );
  if (!selected) return null;
  const { prediction, calibrationSignals, weight, rankingTargetDesirability, ...plan } = selected;
  return {
    ...plan,
    ranking: calibrationSignals
      ? {
        routeReference: calibrationSignals.routeReference,
        workComponent: calibrationSignals.workComponent,
        calibratedScore: calibrationSignals.calibratedScore,
        samplingWeight: weight
      }
      : null
  };
}

export function guidanceLevelForAttempt(attempt) {
  if (attempt >= 36) return 2;
  if (attempt >= 13) return 1;
  return 0;
}
