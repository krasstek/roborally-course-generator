// Robo Rally Course Randomizer - normalising the loaded construction-guidance calibration file
export function normalizeConstructionGuidanceResidualSpread(spread = null) {
  if (!spread || typeof spread !== "object") return null;
  const normalized = {};
  for (const key of ["absoluteP50", "absoluteP80", "absoluteP90", "absoluteP95", "signedP05", "signedP95"]) {
    const value = Number(spread[key]);
    if (Number.isFinite(value)) normalized[key] = value;
  }
  return Object.keys(normalized).length ? normalized : null;
}

export function normalizeConstructionGuidanceEvidence(evidence = null) {
  if (!evidence || typeof evidence !== "object") return {};
  const normalized = {};
  for (const key of [
    "sampleSize",
    "heldOutRmse",
    "heldOutMae",
    "heldOutRSquared",
    "actualRate",
    "predictedRate",
    "heldOutBrier",
    "baselineBrier"
  ]) {
    const value = Number(evidence[key]);
    if (Number.isFinite(value)) normalized[key] = value;
  }
  const spread = normalizeConstructionGuidanceResidualSpread(evidence.outOfFoldResidualSpread);
  if (spread) normalized.outOfFoldResidualSpread = spread;
  if (evidence.predictedRange && typeof evidence.predictedRange === "object") {
    normalized.predictedRange = Object.fromEntries(
      Object.entries(evidence.predictedRange)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => Number.isFinite(value))
    );
  }
  if (Array.isArray(evidence.calibrationBins)) {
    normalized.calibrationBins = evidence.calibrationBins.map((row) => ({
      bin: String(row?.bin ?? ""),
      n: Number(row?.n) || 0,
      predictedMean: Number.isFinite(Number(row?.predictedMean)) ? Number(row.predictedMean) : null,
      actualRate: Number.isFinite(Number(row?.actualRate)) ? Number(row.actualRate) : null
    }));
  }
  return normalized;
}

export function normalizeConstructionGuidanceModel(model, expectedType = null) {
  if (!model || typeof model !== "object") return null;
  const type = String(model.type ?? "");
  if (!["linear", "logistic"].includes(type) || (expectedType && type !== expectedType)) {
    return null;
  }

  const coefficients = Object.fromEntries(
    Object.entries(model.coefficients ?? {})
      .map(([key, value]) => [String(key), Number(value)])
      .filter(([, value]) => Number.isFinite(value))
  );
  if (!Number.isFinite(coefficients["(Intercept)"])) return null;

  const factorLevels = Object.fromEntries(
    Object.entries(model.factorLevels ?? {})
      .map(([key, levels]) => [
        String(key),
        Array.isArray(levels) ? levels.map((level) => String(level)) : []
      ])
      .filter(([, levels]) => levels.length > 0)
  );
  if (!Object.keys(factorLevels).length) return null;

  const targetTransform = type === "linear"
    ? String(model.targetTransform ?? "identity")
    : "logit";
  if (type === "linear" && !["identity", "log1p"].includes(targetTransform)) {
    return null;
  }

  return {
    type,
    targetTransform,
    formula: String(model.formula ?? ""),
    coefficients,
    factorLevels,
    evidence: normalizeConstructionGuidanceEvidence(model.evidence)
  };
}

export function normalizeConstructionGuidanceCalibration(calibration) {
  if (
    Number(calibration?.schemaVersion) !== 2 ||
    calibration?.calibration !== "robo-rally-construction-guidance-production-v2" ||
    calibration?.policy?.guidanceOnly !== true ||
    calibration?.policy?.routeLegalityAuthority !== false ||
    calibration?.policy?.bandAuthority !== false
  ) {
    return null;
  }

  const normalLandscape = {};
  for (const stage of ["countsKnown", "boardsKnown", "checkpointsKnown"]) {
    const source = calibration?.normalLandscape?.[stage];
    const length = normalizeConstructionGuidanceModel(source?.length, "linear");
    const difficulty = normalizeConstructionGuidanceModel(source?.difficulty, "linear");
    const routeCost = normalizeConstructionGuidanceModel(source?.routeCost, "linear");
    if (!length || !difficulty || !routeCost) return null;
    normalLandscape[stage] = { length, difficulty, routeCost };
  }

  const structuralSuccessPrior = normalizeConstructionGuidanceModel(
    calibration?.structuralSuccessPrior,
    "logistic"
  );

  const normalizeStringArray = (values) => Array.isArray(values)
    ? values.map((value) => String(value))
    : [];
  const normalizeNumberArray = (values) => Array.isArray(values)
    ? values.map(Number).filter(Number.isFinite)
    : [];

  const dynamicArchiving = calibration?.treatments?.dynamicArchiving ?? {};
  const structuralBoardOverlay = calibration?.treatments?.structuralBoardOverlay ?? {};
  const overlayWorkPrior = structuralBoardOverlay?.analysisWorkPrior ?? {};

  const dynamicArchivingContextual = dynamicArchiving.contextualModelEnabled === true;
  const dynamicArchivingLengthContextModel = dynamicArchivingContextual
    ? normalizeConstructionGuidanceModel(dynamicArchiving.lengthContextModel, "linear")
    : null;
  if (
    dynamicArchivingContextual &&
    (
      String(dynamicArchiving.lengthContextStage ?? "") !== "checkpointsKnown" ||
      !dynamicArchivingLengthContextModel
    )
  ) {
    return null;
  }

  const overlayWorkContextual = overlayWorkPrior.contextualModelEnabled === true;
  const overlayWorkLogRatioContextModel = overlayWorkContextual
    ? normalizeConstructionGuidanceModel(overlayWorkPrior.logRatioContextModel, "linear")
    : null;
  if (
    structuralBoardOverlay.lengthDifficultyOffsetEnabled === true ||
    overlayWorkPrior.overlayCountSpecificEnabled === true ||
    overlayWorkPrior.pieceIdentityEnabled === true ||
    (
      overlayWorkContextual &&
      (
        String(overlayWorkPrior.contextualStage ?? "") !== "checkpointsKnown" ||
        !overlayWorkLogRatioContextModel
      )
    )
  ) {
    return null;
  }

  return {
    schemaVersion: 2,
    calibration: calibration.calibration,
    source: calibration.source ?? null,
    policy: calibration.policy ?? null,
    domain: {
      players: normalizeNumberArray(calibration?.domain?.players),
      requestedBoardCounts: normalizeNumberArray(calibration?.domain?.requestedBoardCounts),
      requestedFlagCounts: normalizeNumberArray(calibration?.domain?.requestedFlagCounts),
      difficulties: normalizeStringArray(calibration?.domain?.difficulties),
      lengths: normalizeStringArray(calibration?.domain?.lengths),
      boardSpreads: normalizeStringArray(calibration?.domain?.boardSpreads),
      inventoryPresets: normalizeStringArray(calibration?.domain?.inventoryPresets)
    },
    normalLandscape,
    structuralSuccessPrior,
    treatments: {
      dynamicArchiving: {
        lengthEffectMean: Number(dynamicArchiving.lengthEffectMean),
        lengthEffectMedian: Number(dynamicArchiving.lengthEffectMedian),
        lengthEffectP10: Number(dynamicArchiving.lengthEffectP10),
        lengthEffectP90: Number(dynamicArchiving.lengthEffectP90),
        difficultyEffectMean: Number(dynamicArchiving.difficultyEffectMean),
        difficultyEffectMedian: Number(dynamicArchiving.difficultyEffectMedian),
        difficultyEffectP10: Number(dynamicArchiving.difficultyEffectP10),
        difficultyEffectP90: Number(dynamicArchiving.difficultyEffectP90),
        contextualModelEnabled: dynamicArchivingContextual,
        lengthContextStage: dynamicArchivingContextual ? "checkpointsKnown" : null,
        lengthContextModel: dynamicArchivingLengthContextModel
      },
      structuralBoardOverlay: {
        lengthDifficultyOffsetEnabled: Boolean(structuralBoardOverlay.lengthDifficultyOffsetEnabled),
        analysisWorkPrior: {
          medianExpansionIncrease: Number(overlayWorkPrior.medianExpansionIncrease),
          medianExpansionRatio: Number(overlayWorkPrior.medianExpansionRatio),
          p90ExpansionRatio: Number(overlayWorkPrior.p90ExpansionRatio),
          contextualModelEnabled: overlayWorkContextual,
          contextualStage: overlayWorkContextual ? "checkpointsKnown" : null,
          logRatioContextModel: overlayWorkLogRatioContextModel,
          overlayCountSpecificEnabled: Boolean(overlayWorkPrior.overlayCountSpecificEnabled),
          pieceIdentityEnabled: Boolean(overlayWorkPrior.pieceIdentityEnabled)
        }
      }
    },
    uncertaintyNotes: calibration.uncertaintyNotes ?? null
  };
}
