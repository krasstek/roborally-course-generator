// Robo Rally Course Randomizer - course fingerprints and whole-course board ablation state
export function hashScenarioFingerprintPayload(payload) {
  const text = String(payload ?? "");
  if (!text) return null;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

export function getCourseConstructionFingerprint(
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = []
) {
  const placementKey = (placement) => [
    placement?.pieceId ?? "?",
    placement?.x ?? "?",
    placement?.y ?? "?",
    placement?.rotation ?? 0,
    placement?.flipped ? 1 : 0,
    placement?.overlay ? 1 : 0
  ].join(",");
  const checkpointKey = (checkpoint, index) => [
    checkpoint?.id ?? index + 1,
    checkpoint?.x ?? "?",
    checkpoint?.y ?? "?",
    checkpoint?.facing ?? "-"
  ].join(",");
  const payload = [
    `boards:${boardPlacements.map(placementKey).join(";")}`,
    `docks:${dockPlacements.map(placementKey).join(";")}`,
    `overlays:${overlayPlacements.map(placementKey).join(";")}`,
    `flags:${checkpoints.map(checkpointKey).join(";")}`
  ].join("|");
  return hashScenarioFingerprintPayload(payload);
}

export function getSequenceSelectedRouteFingerprint(sequence, includedIndices = null) {
  const starts = sequence?.firstLeg?.starts ?? [];
  const included = includedIndices instanceof Set ? includedIndices : null;
  const payload = starts
    .filter((entry) => (
      Number.isInteger(entry?.index) &&
      entry?.fullCourseRoute &&
      (!included || included.has(entry.index))
    ))
    .sort((left, right) => left.index - right.index)
    .map((entry) => {
      const route = entry.fullCourseRoute;
      const actions = Array.isArray(route.actionHistory) ? route.actionHistory.join(",") : "";
      const hits = Array.isArray(route.checkpointHits)
        ? route.checkpointHits.map((hit) => `${hit.checkpointId ?? hit.checkpointIndex}:${hit.action ?? "?"}:${hit.state?.x ?? "?"},${hit.state?.y ?? "?"},${hit.state?.facing ?? "?"}`).join(";")
        : "";
      return `${entry.index}|${actions}|${hits}|${route.score ?? "?"}`;
    })
    .join("||");

  return hashScenarioFingerprintPayload(payload);
}

export function getScenarioSelectedRouteFingerprint(scenario) {
  return getSequenceSelectedRouteFingerprint(scenario?.sequence);
}

export function summarizeWholeCourseBoardAblationState(sequence, metrics) {
  const finiteMetric = (value) => (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null
  );
  const summary = sequence?.firstLeg?.summary ?? {};
  const normalBalance = summary.normalStartBalance ?? null;
  const competitive = metrics?.competitiveBlockImpact ?? null;
  const priced = summary.payToWin ?? null;
  const usableStartIndices = (metrics?.usableStarts ?? [])
    .map((entry) => entry?.index)
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
  const pricingSignature = (sequence?.firstLeg?.starts ?? [])
    .filter((entry) => Number.isInteger(entry?.index))
    .sort((left, right) => left.index - right.index)
    .map((entry) => [
      entry.index,
      entry.energyCost ?? null,
      entry.lateEnergyCost ?? null,
      Boolean(entry.payToWinUnavailable),
      Boolean(entry.earlyUnavailable),
      Boolean(entry.lateUnavailable)
    ].join(":"))
    .join("|");
  const filteredHardFailures = [...(metrics?.hardFailures ?? [])]
    .filter((failure) => failure !== "unused-board")
    .sort();
  const filteredSoftFailures = [...(metrics?.softFailures ?? [])]
    .filter((failure) => failure !== "unused-board")
    .sort();

  return {
    routeFingerprint: getSequenceSelectedRouteFingerprint(
      sequence,
      new Set(usableStartIndices)
    ),
    usableStartIndices,
    pricingSignature: priced?.active ? pricingSignature : "",
    hardFailures: filteredHardFailures,
    softFailures: filteredSoftFailures,
    difficultyTurnRE: finiteMetric(metrics?.difficultyTurnRE),
    lengthWallClockTurnIndex: finiteMetric(metrics?.lengthWallClockTurnIndex),
    fairnessRangeRE: competitive?.active
      ? finiteMetric(competitive.selectedRangeRE)
      : finiteMetric(normalBalance?.retainedEffectiveRERange),
    trafficAveragePenalty: finiteMetric(summary?.fullCourseTraffic?.averagePenalty),
    competitiveSelectedIndices: competitive?.active
      ? [...(competitive.selectedIndices ?? [])].sort((left, right) => left - right)
      : [],
    meaningfulEnergyAdjustmentCount: priced?.active
      ? Number(priced.meaningfulEnergyAdjustmentCount) || 0
      : 0
  };
}

export function compareWholeCourseBoardAblationStates(before, after) {
  const reasons = [];
  const sameArray = (left = [], right = []) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
  const hasFiniteMetric = (value) => (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
  const numericDelta = (left, right) => (
    hasFiniteMetric(left) && hasFiniteMetric(right)
      ? Math.abs(Number(left) - Number(right))
      : left === right
        ? 0
        : Infinity
  );

  if (before?.routeFingerprint !== after?.routeFingerprint) {
    reasons.push("selected-route-field-changed");
  }
  if (!sameArray(before?.usableStartIndices, after?.usableStartIndices)) {
    reasons.push("usable-start-field-changed");
  }
  if (!sameArray(before?.hardFailures, after?.hardFailures)) {
    reasons.push("hard-failure-state-changed");
  }
  if (!sameArray(before?.softFailures, after?.softFailures)) {
    reasons.push("soft-failure-state-changed");
  }
  if (!sameArray(before?.competitiveSelectedIndices, after?.competitiveSelectedIndices)) {
    reasons.push("competitive-choice-set-changed");
  }
  if ((before?.pricingSignature ?? "") !== (after?.pricingSignature ?? "")) {
    reasons.push("starting-energy-setup-changed");
  }
  if ((before?.meaningfulEnergyAdjustmentCount ?? 0) !== (after?.meaningfulEnergyAdjustmentCount ?? 0)) {
    reasons.push("starting-energy-adjustment-count-changed");
  }

  const difficultyDelta = numericDelta(before?.difficultyTurnRE, after?.difficultyTurnRE);
  const lengthDelta = numericDelta(before?.lengthWallClockTurnIndex, after?.lengthWallClockTurnIndex);
  const fairnessDelta = numericDelta(before?.fairnessRangeRE, after?.fairnessRangeRE);
  const trafficDelta = numericDelta(before?.trafficAveragePenalty, after?.trafficAveragePenalty);

  if (difficultyDelta > 0.05) reasons.push("difficulty-changed");
  if (lengthDelta > 0.10) reasons.push("length-changed");
  if (fairnessDelta > 0.10) reasons.push("fairness-changed");
  if (trafficDelta > 0.50) reasons.push("traffic-changed");

  return {
    materialDifference: reasons.length > 0,
    reasons,
    deltas: {
      difficultyTurnRE: Number.isFinite(difficultyDelta) ? Number(difficultyDelta.toFixed(4)) : null,
      lengthWallClockTurnIndex: Number.isFinite(lengthDelta) ? Number(lengthDelta.toFixed(4)) : null,
      fairnessRangeRE: Number.isFinite(fairnessDelta) ? Number(fairnessDelta.toFixed(4)) : null,
      trafficAveragePenalty: Number.isFinite(trafficDelta) ? Number(trafficDelta.toFixed(4)) : null
    }
  };
}
