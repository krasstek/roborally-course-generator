// Robo Rally Course Randomizer - normalising the loaded construction-guidance calibration file
//
// Schema 3 (tools/calibration-fit-guidance.R): per construction stage, linear
// models for difficulty (RE per turn, log scale), length (wall-clock turns, log
// scale) and route work (log1p expansions), a logistic structural-success model
// at countsKnown, and the paired same-course effects of the rule variants.
export const CONSTRUCTION_GUIDANCE_STAGES = Object.freeze(["countsKnown", "boardsKnown", "checkpointsKnown"]);

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function normalizeEvidence(evidence = null) {
  const normalized = {};
  for (const key of ["n", "heldOutRmse", "heldOutRSquared", "signedP05", "signedP95", "heldOutBandHitRate"]) {
    const value = finite(evidence?.[key]);
    if (value !== null) normalized[key] = value;
  }
  return normalized;
}

export function normalizeConstructionGuidanceModel(model, expectedType = "linear") {
  if (!model || typeof model !== "object" || model.type !== expectedType) return null;
  const intercept = finite(model.intercept);
  if (intercept === null) return null;
  const targetTransform = expectedType === "logistic" ? "logit" : String(model.targetTransform ?? "identity");
  if (!["identity", "log", "log1p", "logit"].includes(targetTransform)) return null;

  const factors = {};
  for (const [name, factor] of Object.entries(model.factors ?? {})) {
    const levels = Array.isArray(factor?.levels) ? factor.levels.map(String) : [];
    const coefficients = Array.isArray(factor?.coefficients) ? factor.coefficients.map((value) => finite(value) ?? 0) : [];
    if (!levels.length || levels.length !== coefficients.length) return null;
    factors[name] = { levels, coefficients };
  }
  const numeric = {};
  for (const [name, value] of Object.entries(model.numeric ?? {})) {
    numeric[name] = finite(value) ?? 0;
  }
  const evidence = normalizeEvidence(model.evidence);
  if (expectedType === "linear" && !(evidence.heldOutRmse > 0)) return null;
  return { type: expectedType, targetTransform, intercept, factors, numeric, evidence };
}

function normalizeEffect(effect = null) {
  return {
    n: finite(effect?.n) ?? 0,
    mean: finite(effect?.mean) ?? 0,
    sd: finite(effect?.sd)
  };
}

export function normalizeConstructionGuidanceCalibration(calibration) {
  if (
    Number(calibration?.schemaVersion) !== 3 ||
    calibration?.calibration !== "robo-rally-construction-guidance-v3"
  ) {
    return null;
  }

  const stages = {};
  for (const stage of CONSTRUCTION_GUIDANCE_STAGES) {
    const source = calibration.stages?.[stage];
    const difficulty = normalizeConstructionGuidanceModel(source?.difficulty);
    const length = normalizeConstructionGuidanceModel(source?.length);
    const routeCost = normalizeConstructionGuidanceModel(source?.routeCost);
    if (!difficulty || !length || !routeCost) return null;
    if (difficulty.targetTransform !== "log" || length.targetTransform !== "log" || routeCost.targetTransform !== "log1p") {
      return null;
    }
    stages[stage] = {
      difficulty,
      length,
      routeCost,
      structuralSuccess: normalizeConstructionGuidanceModel(source?.structuralSuccess, "logistic")
    };
  }

  const ruleVariantEffects = {};
  for (const [variantId, effect] of Object.entries(calibration.ruleVariantEffects ?? {})) {
    ruleVariantEffects[variantId] = {
      difficultyLog: normalizeEffect(effect?.difficultyLog),
      lengthLog: normalizeEffect(effect?.lengthLog),
      failureRateWhenSwitchedOn: finite(effect?.failureRateWhenSwitchedOn)
    };
  }

  const numbers = (values) => (Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : []);
  const strings = (values) => (Array.isArray(values) ? values.map(String) : []);
  return {
    schemaVersion: 3,
    calibration: calibration.calibration,
    source: calibration.source ?? null,
    domain: {
      players: numbers(calibration.domain?.players),
      boardCounts: numbers(calibration.domain?.boardCounts),
      flagCounts: numbers(calibration.domain?.flagCounts),
      boardSpreads: strings(calibration.domain?.boardSpreads),
      inventoryPresets: strings(calibration.domain?.inventoryPresets)
    },
    layoutVariants: strings(calibration.layoutVariants),
    ruleVariantEffects,
    stages
  };
}
