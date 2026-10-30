// VERSION START: v49ef-rehydration-alert-cleanup
// Robo Rally Course Randomizer - player-facing course notes
const notesCache = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function average(values = []) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}


function formatGenerationModeForNotes(mode) {
  const labels = {
    fastest: "Fastest",
    fast: "Fast",
    standard: "Standard",
    balanced: "Balanced",
    thorough: "Thorough"
  };
  return labels[String(mode || "standard").toLowerCase()] || "Standard";
}

function selectedOpeningRoutes(scenario) {
  const usableIndices = new Set(
    Array.isArray(scenario?.metrics?.usableStarts)
      ? scenario.metrics.usableStarts.map((item) => item.index)
      : []
  );
  return (scenario?.sequence?.firstLeg?.starts || [])
    .filter((item) => (
      item.reachable &&
      item.selectedRoute &&
      (!usableIndices.size || usableIndices.has(item.index))
    ))
    .map((item) => item.selectedRoute);
}

function getOpeningFacingChanges(routes) {
  return average(routes.map((route) => {
    const manualTurns = (route.transitions || []).filter((transition) => transition.action?.type === "turn").length;
    const conveyorTurns = (route.transitions || []).reduce((sum, transition) => (
      sum + (transition.conveyorSteps || []).filter((step) => step.turned).length
    ), 0);
    return manualTurns + conveyorTurns;
  }));
}

const CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD = 6;
const SHORT_CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD = 9;
const CHECKPOINT_PLACEMENT_COMPONENT_NOTE_THRESHOLD = 1.5;

function normalizeTargetBand(rawBand) {
  if (!rawBand || !Number.isFinite(Number(rawBand.min))) return null;
  const maxRaw = rawBand.maxExclusive;
  const maxExclusive = maxRaw === null ? null : Number(maxRaw);
  if (maxExclusive !== null && !Number.isFinite(maxExclusive)) return null;
  return { min: Number(rawBand.min), maxExclusive };
}

function getTargetMismatchFact(scenario, kind) {
  const metrics = scenario?.metrics ?? {};
  const preferences = scenario?.preferences ?? {};
  const isDifficulty = kind === "difficulty";
  const requested = isDifficulty ? preferences.difficulty : preferences.length;
  const guidanceOnly = isDifficulty
    ? Boolean(preferences.targetGuidanceOnlyDifficulty)
    : Boolean(preferences.targetGuidanceOnlyLength);
  // Difficulty target mismatch follows the same completed-RE/turn value that
  // owns production classification. Legacy difficultyRaw is intentionally not
  // a player-facing semantic fallback; incompatible old saved snapshots are
  // rejected at the saved-course schema boundary.
  const rawValue = Number(isDifficulty
    ? metrics.difficultyTurnRE
    : (metrics.lengthWallClockTurnIndex
      ?? metrics.lengthMetrics?.productionWallClockOwner?.effectiveWallClockTurnIndex
      ?? metrics.lengthFitRaw
      ?? metrics.lengthRaw));
  const fit = Number(isDifficulty ? metrics.difficultyFit : metrics.lengthFit) || 0;
  const fallbackDirection = isDifficulty
    ? (metrics.difficultyDirection ?? "matched")
    : (metrics.lengthDirection ?? "matched");
  const band = normalizeTargetBand(isDifficulty
    ? metrics.difficultyTargetBand
    : metrics.lengthTargetBand);

  if (requested === "any" || guidanceOnly) {
    return { active: false, direction: "matched", strength: null, fit, rawValue, band };
  }

  let direction = fallbackDirection;
  if (band && Number.isFinite(rawValue)) {
    direction = rawValue < band.min
      ? "low"
      : (band.maxExclusive !== null && rawValue >= band.maxExclusive)
        ? "high"
        : "matched";
  }

  const active = direction === "low" || direction === "high";
  if (!active) {
    return { active: false, direction: "matched", strength: null, fit, rawValue, band };
  }

  const moderateThreshold = isDifficulty
    ? (requested === "easy" ? 20 : 14)
    : 14;
  const strongThreshold = isDifficulty
    ? (requested === "easy" ? 48 : 42)
    : 24;
  const classifierGross = isDifficulty
    ? Boolean(metrics.targetAcceptance?.grossDifficultyMismatch)
    : Boolean(metrics.targetAcceptance?.grossLengthMismatch);
  // Production targetAcceptance already owns semantic cliff handling (including
  // Intermediate -> Robots. Must. Die.). Course Notes consumes that result
  // instead of duplicating a second legacy/raw difficulty classifier.
  const strength = classifierGross || fit >= strongThreshold
    ? "a lot"
    : fit >= moderateThreshold
      ? "somewhat"
      : "slightly";

  return { active: true, direction, strength, fit, rawValue, band };
}

function isForcedExtraDocksPreference(preferences = {}) {
  if (preferences.extraDocks === true) return true;
  return preferences.allowedVariantRules?.extraDocks === "forced";
}

export function buildCourseNoteFacts(scenario) {
  const metrics = scenario?.metrics ?? {};
  const footprintMetric = metrics.boardFootprintUse ?? metrics.meaningfulBoardUse ?? null;
  const boardUseBoards = Array.isArray(footprintMetric?.boards)
    ? footprintMetric.boards
    : [];
  const gameplayRelevanceBoards = Array.isArray(metrics.boardGameplayRelevance?.boards)
    ? metrics.boardGameplayRelevance.boards
    : [];
  const sandwichedMissingSideCount = scenario?.sandwichedDock
    ? Number(metrics.sandwichedDockUse?.missingSideCount) || 0
    : 0;
  const sandwichedMissingBoardIndices = new Set(
    metrics.sandwichedDockUse?.missingSideBoardIndices ?? []
  );
  // Boards no route enters. The final evaluation drops a board whose removal
  // leaves the course unchanged, so one that remains affects the routes beside
  // it (or carries the only dock).
  const zeroRouteInfluenceCount = scenario?.sandwichedDock
    ? 0
    : boardUseBoards.filter((board) => (
      board?.weakUse && (Number(board?.uniqueRouteTiles) || 0) === 0
    )).length;
  const weakTraversedCount = boardUseBoards.filter((board) => (
    board?.weakUse &&
    (Number(board?.uniqueRouteTiles) || 0) > 0 &&
    !sandwichedMissingBoardIndices.has(board?.boardIndex)
  )).length;
  const limitedFootprintCount = boardUseBoards.filter((board) => (
    board?.weakUse &&
    !sandwichedMissingBoardIndices.has(board?.boardIndex)
  )).length;
  const pendingAblationCount = gameplayRelevanceBoards.filter((board) => (
    board?.relevanceStatus === "pending-ablation"
  )).length;
  const difficultyMismatch = getTargetMismatchFact(scenario, "difficulty");
  const lengthMismatch = getTargetMismatchFact(scenario, "length");
  const checkpointPlacement = getCheckpointPlacementAdvisory(scenario);
  const extraDocksRequestMismatch = Boolean(
    scenario?.generationBestMatch &&
    isForcedExtraDocksPreference(scenario?.preferences ?? {}) &&
    !scenario?.extraDocks
  );
  const competitiveSoftMismatch = Boolean(
    scenario?.competitiveMode &&
    (metrics.softFailures ?? []).includes("competitive-start-balance")
  );

  return {
    targetMismatch: {
      difficulty: difficultyMismatch,
      length: lengthMismatch
    },
    checkpointPlacement,
    boardUse: {
      zeroRouteInfluenceCount,
      weakTraversedCount,
      limitedFootprintCount,
      pendingAblationCount,
      sandwichedMissingSideCount
    },
    extraDocksRequestMismatch,
    competitiveSoftMismatch,
    autoOpenExplanation: Boolean(
      difficultyMismatch.active ||
      lengthMismatch.active ||
      checkpointPlacement?.active ||
      sandwichedMissingSideCount > 0 ||
      zeroRouteInfluenceCount > 0
    )
  };
}

export function getCheckpointPlacementAdvisory(scenario) {
  const openingRoute = scenario?.metrics?.openingLegAnticlimax ?? null;
  const middleRoute = scenario?.metrics?.intermediateCheckpointPacing ?? null;
  const finalRoute = scenario?.metrics?.finalLegAnticlimax ?? null;

  const openingFastest = Number.isFinite(openingRoute?.fastestActions)
    ? openingRoute.fastestActions
    : null;
  const openingAverage = Number.isFinite(openingRoute?.averageActions)
    ? openingRoute.averageActions
    : null;
  const middleShortest = Number.isFinite(middleRoute?.shortestAverageActions)
    ? middleRoute.shortestAverageActions
    : null;
  const middleAverage = Number.isFinite(middleRoute?.averageActions)
    ? middleRoute.averageActions
    : null;
  const finalFastest = Number.isFinite(finalRoute?.fastestActions)
    ? finalRoute.fastestActions
    : null;

  const openingFastestShortfall = openingFastest === null ? 0 : Math.max(0, 4 - openingFastest);
  const openingAverageShortfall = openingAverage === null ? 0 : Math.max(0, 6 - openingAverage);
  const middleShortestShortfall = middleShortest === null ? 0 : Math.max(0, 4 - middleShortest);
  const middleAverageShortfall = middleAverage === null ? 0 : Math.max(0, 6 - middleAverage);
  const finalShortfall = finalFastest === null ? 0 : Math.max(0, 6 - finalFastest);

  // Player-facing severity uses the same route evidence regardless of request.
  // Fit scoring keeps its existing request-sensitive penalties. Only the display
  // threshold is more tolerant when the player explicitly requested a Short course,
  // where mildly quick checkpoint pacing is expected rather than noteworthy.
  const openingSeverity = openingFastestShortfall * 2 + openingAverageShortfall * 1.2;
  const middleSeverity = middleShortestShortfall * 2 + middleAverageShortfall * 0.8;
  const finalSeverity = finalShortfall * 2.5;
  const severity = openingSeverity + middleSeverity + finalSeverity;
  const hasDeviation = severity > 0;
  const advisoryThreshold = scenario?.preferences?.length === "short"
    ? SHORT_CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD
    : CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD;
  const active = severity >= advisoryThreshold;

  const opening = active && openingSeverity >= CHECKPOINT_PLACEMENT_COMPONENT_NOTE_THRESHOLD;
  const consecutive = active && middleSeverity >= CHECKPOINT_PLACEMENT_COMPONENT_NOTE_THRESHOLD;
  const final = active && finalSeverity >= CHECKPOINT_PLACEMENT_COMPONENT_NOTE_THRESHOLD;

  if (!active) {
    return {
      active: false,
      hasDeviation,
      opening: false,
      final: false,
      consecutive: false,
      severity: Number(severity.toFixed(2)),
      threshold: advisoryThreshold,
      score: 0,
      bannerText: "",
      text: ""
    };
  }

  // One sentence for both the course note and the fit banner, naming the short
  // sections: "The opening and the last leg are short."
  const oneMiddleLeg = middleShortestShortfall > 0 && middleAverageShortfall <= 0;
  const sections = [
    opening ? "the opening" : null,
    consecutive ? (oneMiddleLeg ? "one middle leg" : "the middle legs") : null,
    final ? "the last leg" : null
  ].filter(Boolean);
  let text = "Checkpoint legs are shorter than usual.";
  if (sections.length === 3) {
    text = "Checkpoint legs are short throughout the course.";
  } else if (sections.length) {
    const subject = sections.join(" and ");
    const plural = sections.length > 1 || sections[0] === "the middle legs";
    text = `${subject[0].toUpperCase()}${subject.slice(1)} ${plural ? "are" : "is"} short.`;
  }

  const score = Math.min(9, 5.5 + severity / 4);
  return {
    active: true,
    hasDeviation: true,
    opening,
    final,
    consecutive,
    severity: Number(severity.toFixed(2)),
    threshold: advisoryThreshold,
    score: Number(score.toFixed(2)),
    bannerText: text,
    text
  };
}

// Detailed start residuals are diagnostics. Course Notes receives only a
// field-level, non-advisory description of a meaningful residual pattern: no
// numbered starting spaces, z-scores, pruning mechanics or generator internals.
export function buildCourseNoteEvidence(scenario, fitNotes = []) {
  const first = scenario?.sequence?.firstLeg?.summary || {};
  const openingRoutes = selectedOpeningRoutes(scenario);
  const fullTraffic = first.fullCourseTraffic || null;
  const contextualProfile = first.contextualSearchProfile || null;
  const fairnessAcceptance = scenario?.metrics?.fairnessAcceptance ?? null;
  const competitiveBalance = first.competitiveStartBalance || null;
  const trafficByLeg = Array.isArray(fullTraffic?.averageTrafficByLeg)
    ? fullTraffic.averageTrafficByLeg
    : [];
  const trafficCandidates = Array.isArray(fullTraffic?.candidateDiagnostics)
    ? fullTraffic.candidateDiagnostics
    : [];
  const usableStartAnalyses = Array.isArray(scenario?.metrics?.usableStarts)
    ? scenario.metrics.usableStarts
    : (scenario?.sequence?.firstLeg?.starts || []).filter((item) => item.reachable && item.fullCourseRoute);
  const ownedRoutes = usableStartAnalyses
    .map((item) => item.fullCourseRoute)
    .filter(Boolean);
  const energyRewardValues = ownedRoutes
    .map((route) => Number(route.routeEnergyEconomyRewardScore))
    .filter(Number.isFinite);
  const batteryRewardValues = ownedRoutes
    .map((route) => Number(route.batteryEconomyRewardScore))
    .filter(Number.isFinite);
  const powerUpRewardValues = ownedRoutes
    .map((route) => Number(route.powerUpEconomyRewardScore))
    .filter(Number.isFinite);
  const chopShopRewardValues = ownedRoutes
    .map((route) => Number(route.chopShopEconomyRewardScore))
    .filter(Number.isFinite);

  const routeOwnerBurdenPerTurn = (route, keys) => {
    const components = route?.normalFairnessIntrinsicREComponents ?? null;
    if (!components) return null;
    const programmed = Number(components.programmedRegisterRE ?? route?.actions);
    if (!(programmed > 0)) return null;
    const total = keys.reduce((sum, key) => {
      const value = Number(components[key]);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return total * 5 / programmed;
  };
  const cardBurdenPerTurn = average(ownedRoutes
    .map((route) => routeOwnerBurdenPerTurn(route, ["cleanCardPlausibilityRE"]))
    .filter(Number.isFinite));
  const damageBurdenPerTurn = average(ownedRoutes
    .map((route) => routeOwnerBurdenPerTurn(route, ["damageCardSupplyRE", "clogRE"]))
    .filter(Number.isFinite));
  const mentalBurdenPerTurn = average(ownedRoutes
    .map((route) => routeOwnerBurdenPerTurn(route, ["mentalRE"]))
    .filter(Number.isFinite));
  const burdenCoverage = ownedRoutes.filter((route) => route?.normalFairnessIntrinsicREComponents).length;

  // Offered starts' route lengths and what evens them out. Traffic is the gap
  // between effective and intrinsic RE; a route's own cost is intrinsic RE
  // beyond its programmed registers (card, damage, planning).
  const pricedStarts = usableStartAnalyses
    .map((item) => {
      const registers = Number(item.normalFairnessRegisterCount);
      const effective = Number(item.normalFairnessEffectiveRE);
      const intrinsic = Number(item.normalFairnessIntrinsicRE);
      const components = item.fullCourseRoute?.normalFairnessIntrinsicREComponents ?? {};
      const part = (key) => Number(components[key]) || 0;
      return {
        registers,
        effective,
        traffic: effective - intrinsic,
        own: intrinsic - (Number(components.programmedRegisterRE) || registers),
        card: part("cleanCardPlausibilityRE"),
        damage: part("damageCardSupplyRE") + part("clogRE"),
        mental: part("mentalRE")
      };
    })
    .filter((item) => item.registers > 0 && Number.isFinite(item.effective) && Number.isFinite(item.traffic));
  const startLengths = (() => {
    if (pricedStarts.length < 2) return null;
    const sorted = [...pricedStarts].sort((a, b) => a.registers - b.registers);
    const shortest = sorted[0];
    const longest = sorted[sorted.length - 1];
    const medianRegisters = sorted[Math.floor((sorted.length - 1) / 2)].registers;
    const extra = (key) => shortest[key] - longest[key];
    const ownCause = ["damage", "card", "mental"].sort((a, b) => extra(b) - extra(a))[0];
    return {
      spread: longest.registers - shortest.registers,
      relativeSpread: (longest.registers - shortest.registers) / medianRegisters,
      balancedBy: extra("traffic") >= extra("own") ? "traffic" : ownCause
    };
  })();
  const totalEffective = pricedStarts.reduce((sum, item) => sum + item.effective, 0);
  const trafficShare = totalEffective > 0
    ? pricedStarts.reduce((sum, item) => sum + item.traffic, 0) / totalEffective
    : null;

  const facts = buildCourseNoteFacts(scenario);
  const checkpointPlacement = facts.checkpointPlacement;
  const {
    zeroRouteInfluenceCount,
    weakTraversedCount,
    limitedFootprintCount,
    pendingAblationCount,
    sandwichedMissingSideCount
  } = facts.boardUse;

  const competitiveBlockSequence = Array.isArray(competitiveBalance?.blockSequence)
    ? competitiveBalance.blockSequence
    : [];
  const competitiveAdvantageRE = competitiveBlockSequence
    .map((entry) => Number(entry?.advantageVsMedianRE ?? entry?.advantageVsMedian))
    .filter(Number.isFinite);
  const competitiveDecisionMarginsRE = competitiveBlockSequence
    .map((entry) => Number(entry?.decisionMarginRE ?? entry?.decisionMargin))
    .filter(Number.isFinite);

  return {
    fitNotes: [...fitNotes],
    difficultyTurnRE: scenario?.metrics?.difficultyTurnRE ?? null,
    difficultyFit: scenario?.metrics?.difficultyFit ?? 0,
    difficultyDirection: facts.targetMismatch.difficulty.direction,
    lengthFit: scenario?.metrics?.lengthFit ?? 0,
    lengthDirection: facts.targetMismatch.length.direction,
    targetMismatch: facts.targetMismatch,
    fairnessOverflow: {
      active: Boolean(
        fairnessAcceptance?.active &&
        (Number(fairnessAcceptance?.overflowRE) || 0) > 1e-9
      ),
      overflowRE: Math.max(0, Number(fairnessAcceptance?.overflowRE) || 0),
      rangeLimit: Math.max(0, Number(fairnessAcceptance?.rangeLimit) || 0),
      softOverflowAllowance: Math.max(
        0,
        Number(fairnessAcceptance?.softOverflowAllowance) || 0
      ),
      fitPenalty: Math.max(0, Number(fairnessAcceptance?.fitPenalty) || 0),
      ordinaryAcceptable: fairnessAcceptance?.ordinaryAcceptable !== false
    },
    bestMatch: Boolean(scenario?.generationBestMatch),
    terminationReason: scenario?.generationTerminationReason ?? null,
    attempts: scenario?.attempts ?? 0,
    requestedDifficulty: scenario?.preferences?.difficulty ?? "any",
    requestedLength: scenario?.preferences?.length ?? "any",
    playerCount: Number(scenario?.preferences?.playerCount ?? scenario?.playerCount) || null,
    generationMode: scenario?.generationDiagnostics?.generationMode ?? scenario?.preferences?.generationMode ?? "standard",
    generationModeLabel: scenario?.generationDiagnostics?.generationModeLabel ?? formatGenerationModeForNotes(scenario?.preferences?.generationMode),
    generationModeProfile: scenario?.generationDiagnostics?.searchProfile ?? null,
    checkpointPlacement,
    boardUse: {
      zeroRouteInfluenceCount,
      weakTraversedCount,
      limitedFootprintCount,
      pendingAblationCount,
      sandwichedMissingSideCount
    },
    opening: {
      forcedDistance: average(openingRoutes.map((route) => route.forcedDistance ?? 0)),
      facingChanges: getOpeningFacingChanges(openingRoutes)
    },
    trafficModel: {
      enabled: Boolean(contextualProfile?.trafficEnabled),
      confidenceWeighted: Boolean(fullTraffic?.confidenceWeighted),
      averageEffective: fullTraffic?.averagePenalty ?? first.averageTrafficPenalty ?? 0,
      shareOfRE: trafficShare,
      byLeg: trafficByLeg,
      routeSwitches: fullTraffic?.routeSwitches ?? 0,
      startsWithAlternatives: trafficCandidates.filter((item) => (item?.candidateCount ?? 0) > 1).length,
      alternateCandidatesAdded: fullTraffic?.alternateCandidatesAdded ?? 0
    },
    startLengths,
    competitiveBalance: competitiveBalance?.active
      ? {
        active: true,
        meanBlockChallenge: competitiveBalance.strategicDifficultyEvidence?.meanBlockChallenge ?? null,
        selectionAmbiguity: competitiveBalance.strategicDifficultyEvidence?.selectionAmbiguity ?? null,
        maxAdvantageRE: competitiveAdvantageRE.length ? Math.max(...competitiveAdvantageRE) : null,
        minDecisionMarginRE: competitiveDecisionMarginsRE.length ? Math.min(...competitiveDecisionMarginsRE) : null,
        selectedRangeRE: Number(competitiveBalance.selectedRangeRE ?? competitiveBalance.scoreRange),
        softRangeRE: Number(competitiveBalance.balanceRangeLimit)
      }
      : null,
    energy: {
      active: energyRewardValues.length > 0,
      averageReward: average(energyRewardValues),
      maxReward: energyRewardValues.length ? Math.max(...energyRewardValues) : 0,
      averageBatteryReward: average(batteryRewardValues),
      averagePowerUpReward: average(powerUpRewardValues),
      averageChopShopReward: average(chopShopRewardValues)
    },
    ownedBurden: {
      active: burdenCoverage > 0,
      routeCount: ownedRoutes.length,
      coveredRouteCount: burdenCoverage,
      cardPerTurn: cardBurdenPerTurn,
      damagePerTurn: damageBurdenPerTurn,
      mentalPerTurn: mentalBurdenPerTurn
    },
    variants: {
      actFast: Boolean(scenario?.actFast),
      classicSharedDeck: Boolean(scenario?.classicSharedDeck),
      lessForeshadowing: Boolean(scenario?.lessForeshadowing),
      factoryRejects: Boolean(scenario?.factoryRejects),
      flamingOil: Boolean(scenario?.flamingOil),
      setToKill: Boolean(scenario?.setToKill),
      setToStun: Boolean(scenario?.setToStun),
      repulsorOverdrive: Boolean(scenario?.repulsorOverdrive),
      dynamicArchiving: scenario?.recoveryRule === "dynamic_archiving",
      homeReboot: scenario?.recoveryRule === "home_reboot",
      startupSpinUp: Boolean(scenario?.startupSpinUp),
      payToWin: Boolean(scenario?.payToWin),
      competitiveMode: Boolean(scenario?.competitiveMode)
    }
  };
}

function concept(id, score, title, text) {
  return { id, score, title, text };
}

// Board Footprint wording, shared by the course note and the fit banner. Says
// what players see on the table, not the app's route assumptions.
export function getBoardFootprintSentences(notEnteredCount, lightlyUsedCount) {
  const parts = [];
  if (notEnteredCount > 0) {
    parts.push(notEnteredCount === 1
      ? "One board lies off the paths between checkpoints, but its edges and hazards still matter when robots get pushed."
      : "Some boards lie off the paths between checkpoints, but their edges and hazards still matter when robots get pushed.");
  }
  if (lightlyUsedCount > 0) {
    parts.push(lightlyUsedCount === 1
      ? "One board is crossed only along an edge or a narrow corridor."
      : "Some boards are crossed only along edges or narrow corridors.");
  }
  return parts;
}

export function buildCourseNoteConcepts(evidence) {
  const concepts = [];
  const { opening } = evidence;
  const trafficModel = evidence.trafficModel || {};
  const ownedBurden = evidence.ownedBurden || {};

  if (evidence.checkpointPlacement?.active) {
    concepts.push(concept(
      "checkpoint-placement",
      evidence.checkpointPlacement.score ?? 6,
      "Checkpoint Pacing",
      evidence.checkpointPlacement.text
    ));
  }

  const sandwichedMissingSideCount = Number(evidence.boardUse?.sandwichedMissingSideCount) || 0;
  if (sandwichedMissingSideCount > 0) {
    concepts.push(concept(
      "sandwiched-side-use",
      6.2,
      "Sandwiched Dock Use",
      sandwichedMissingSideCount === 1
        ? "One side of the Sandwiched Dock has no checkpoints and may see little direct race use. Keep the full sandwich assembled; the unused-looking side is part of the intended setup."
        : "The Sandwiched Dock sides have no checkpoints and may see little direct race use. Keep the full sandwich assembled; those boards are part of the intended setup."
    ));
  }

  // BOARD FOOTPRINT: a board the routes cross only a little, and a board no
  // route enters but that still affects the routes beside it, are different
  // situations and get different wording (one note, so they share one slot).
  const lightlyUsedCount = Number(evidence.boardUse?.weakTraversedCount) || 0;
  const notEnteredCount = Number(evidence.boardUse?.zeroRouteInfluenceCount) || 0;
  if (lightlyUsedCount > 0 || notEnteredCount > 0) {
    const parts = getBoardFootprintSentences(notEnteredCount, lightlyUsedCount);
    parts.push(lightlyUsedCount + notEnteredCount === 1 ? "Keep it in the layout." : "Keep them in the layout.");
    concepts.push(concept(
      "limited-board-footprint",
      (notEnteredCount > 0 ? 5 : 4.6) + Math.min(0.4, Math.max(0, lightlyUsedCount + notEnteredCount - 1) * 0.15),
      "Board Footprint",
      parts.join(" ")
    ));
  }

  // TRAFFIC: nearly every course has some, so the note appears only when
  // traffic is an unusually large share of the offered starts' real cost for
  // this player count: about the top quarter of generated courses (2026-10-16
  // sample: 26% of effective RE at 4 players, 31% at 6; typical 22% / 27%).
  // The alternate-line sentence needs traffic to have actually switched a route.
  const trafficShareThreshold = 0.16 + 0.025 * (Number(evidence.playerCount) || 4);
  if (
    trafficModel.enabled && trafficModel.confidenceWeighted &&
    Number(trafficModel.shareOfRE) >= trafficShareThreshold
  ) {
    const share = Number(trafficModel.shareOfRE);
    const trafficScore = 5 + Math.min(2.5, (share - trafficShareThreshold) * 20);
    const firstLegTraffic = trafficModel.byLeg?.[0] || null;
    const strongestLeg = [...(trafficModel.byLeg || [])]
      .sort((a, b) => (b?.effective ?? 0) - (a?.effective ?? 0))[0] || null;
    const buildsLater = (strongestLeg?.effective ?? 0) > (firstLegTraffic?.effective ?? 0) * 1.4;
    let text = buildsLater
      ? "Robot interaction is likely to build after the opening. Shared lanes can make a clean line more useful than the shortest-looking one."
      : "The main racing lines are likely to be busy. Leave room for other robots and be ready to change plans when several players want the same spaces.";
    if (trafficModel.routeSwitches > 0) {
      text += " At least one busy section has a worthwhile alternate line when the obvious route is crowded.";
    }
    concepts.push(concept("traffic", trafficScore, "Traffic", text));
  }

  // START LENGTHS: when the offered starts' routes differ a lot in length,
  // players may read the shorter ones as simply better. Explain what evens them
  // out. Threshold: about the top fifth of generated courses' offered starts
  // (2026-10-16 sample: spread 25%+ of the median route; typical 15%) and at
  // least one full turn. Competitive has its own start notes.
  // STARTING SPACES (below) reports a meaningful accepted range overflow.
  const fairnessOverflow = evidence.fairnessOverflow ?? null;
  const meaningfulRangeOverflow = Boolean(
    fairnessOverflow?.active &&
    (
      (Number(fairnessOverflow.fitPenalty) || 0) >= 4 ||
      (Number(fairnessOverflow.overflowRE) || 0) >=
        Math.max(0.4, (Number(fairnessOverflow.softOverflowAllowance) || 0) * 0.5)
    )
  );

  // When Starting Spaces reports uneven starts, it is the message that matters;
  // Start Routes covers the same ground, so it is left out (user 2026-10-30).
  const startLengths = evidence.startLengths;
  if (
    startLengths && !evidence.variants?.competitiveMode && !meaningfulRangeOverflow &&
    startLengths.spread >= 5 && startLengths.relativeSpread >= 0.25
  ) {
    const ownCost = {
      damage: "more damage",
      card: "awkward card sequences",
      mental: "tricky timing"
    }[startLengths.balancedBy];
    concepts.push(concept(
      "start-lengths",
      5.4 + Math.min(1.4, (startLengths.relativeSpread - 0.25) * 4),
      "Start Routes",
      startLengths.balancedBy === "traffic"
        ? `Some starting spaces have noticeably shorter routes, but they run through the busiest parts of the course; the longer routes are quieter. Overall the starts are balanced.`
        : `Some starting spaces have noticeably shorter routes, but those routes cost more along the way (${ownCost}). Overall the starts are balanced.`
    ));
  }

  // STARTING SPACES: ordinary in-range fairness is silent. Only a meaningful
  // accepted overflow or fallback mismatch is worth telling the player about.
  {
    if (meaningfulRangeOverflow) {
      concepts.push(concept(
        "start-balance-range",
        fairnessOverflow.ordinaryAcceptable ? 5.8 : 7.2,
        "Starting Spaces",
        fairnessOverflow.ordinaryAcceptable
          ? "The remaining starting choices are a little more uneven than usual for a course this length. Starting position may matter a bit more in the opening."
          : "The remaining starting choices are noticeably uneven for a course this length. Starting position may matter more than usual."
      ));
    }
  }

  // COMPETITIVE: Special Rules explains the procedure. This note describes only
  // the RE-native strategic shape of the actual block sequence / final choice set.
  if (evidence.competitiveBalance?.active) {
    const balance = evidence.competitiveBalance;
    const blockChallenge = Number(balance.meanBlockChallenge);
    const selectionAmbiguity = Number(balance.selectionAmbiguity);
    const maxAdvantageRE = Number(balance.maxAdvantageRE);
    const minDecisionMarginRE = Number(balance.minDecisionMarginRE);
    const softRangeRE = Number(balance.softRangeRE);
    const selectedRangeRE = Number(balance.selectedRangeRE);
    if (Number.isFinite(blockChallenge) && blockChallenge >= 0.68) {
      concepts.push(concept(
        "competitive-start-reading",
        6.4 + Math.min(1.2, (blockChallenge - 0.68) * 3),
        "Starting Choices",
        "The strongest starting spaces are close enough that the best blocks may not be obvious. Looking over the opening routes before choosing can pay off."
      ));
    } else if (
      Number.isFinite(maxAdvantageRE) &&
      maxAdvantageRE >= Math.max(1.5, Number.isFinite(softRangeRE) ? softRangeRE * 0.5 : 1.5) &&
      Number.isFinite(minDecisionMarginRE) && minDecisionMarginRE >= 0.75
    ) {
      concepts.push(concept(
        "competitive-start-reading",
        5.9 + Math.min(1, (maxAdvantageRE - 1.5) * 0.2),
        "Starting Choices",
        "At least one starting space has a clear advantage before the blocks are resolved. Identifying that advantage can matter before the race begins."
      ));
    } else if (
      Number.isFinite(selectionAmbiguity) && selectionAmbiguity >= 0.72 &&
      Number.isFinite(selectedRangeRE) && Number.isFinite(softRangeRE) && selectedRangeRE <= softRangeRE
    ) {
      concepts.push(concept(
        "competitive-start-reading",
        5.6,
        "Starting Choices",
        "After the strongest spaces are dealt with, the expected choices are fairly close. Small details in the opening route may decide which one you prefer."
      ));
    }
  }

  // ENERGY: describe visible course opportunities, not internal pricing math.
  if (evidence.energy?.active && evidence.energy.averageReward >= 5) {
    const energy = evidence.energy;
    const dominant = [
      { label: "Battery spaces", value: energy.averageBatteryReward },
      { label: "Energy gain spaces", value: energy.averagePowerUpReward },
      { label: "Chop Shops", value: energy.averageChopShopReward }
    ].sort((a, b) => b.value - a.value)[0];
    const text = dominant?.value >= 2
      ? `${dominant.label} are worth watching on this course. A small detour can pay off when you can put the extra Energy to use soon.`
      : "Energy opportunities are important enough that a small detour may be worthwhile when you can use the Energy soon.";
    concepts.push(concept("energy", Math.min(8, 4.5 + energy.averageReward / 5), "Energy", text));
  }

  // FACTORY MOVEMENT: direct selected-route facts, not a semantic difficulty owner.
  const movementScore = opening.forcedDistance * 1.25 + opening.facingChanges * 1.1;
  if (movementScore >= 4.2) {
    const text = opening.facingChanges >= 2
      ? "The factory floor does a lot of the moving and turning here. Track where conveyors and gears leave your robot facing, not just how far the programmed cards move it."
      : "Forced movement does a useful share of the work here. Using the floor well can save cards; fighting it can make the same section much slower.";
    concepts.push(concept("factory-movement", movementScore, "Factory Movement", text));
  }

  // COMPLETED-RE BURDEN: one narrow programming note, chosen from the production
  // ledger rather than the retired planningPressure / flagAreaScore composites.
  // Only the strongest non-tempo owner is surfaced to avoid redundant notes.
  if (ownedBurden.active) {
    const burdens = [
      { id: "card", value: Number(ownedBurden.cardPerTurn) || 0 },
      { id: "damage", value: Number(ownedBurden.damagePerTurn) || 0 },
      { id: "mental", value: Number(ownedBurden.mentalPerTurn) || 0 }
    ].sort((a, b) => b.value - a.value);
    const dominant = burdens[0];
    if (dominant?.value >= 1.25) {
      const score = Math.min(7.4, 4.5 + dominant.value * 1.15);
      if (dominant.id === "card") {
        concepts.push(concept(
          "card-demands",
          score,
          "Card Demands",
          "The efficient routes put noticeable pressure on card availability. Keep a workable backup line in mind for hands that do not support the ideal program."
        ));
      } else if (dominant.id === "damage") {
        concepts.push(concept(
          "damage-pressure",
          score,
          "Damage Pressure",
          "The expected routes put meaningful pressure on damage management and reliable control. Leaving some recovery margin can be more valuable than squeezing every register out of the shortest line."
        ));
      } else {
        concepts.push(concept(
          "planning-load",
          score,
          "Planning Load",
          "Several turns combine enough board-state and timing decisions that it is easy to lose track of one detail. Check the full register sequence before committing to a tight line."
        ));
      }
    }
  }

  return concepts.sort((a, b) => b.score - a.score);
}

export function renderCourseNotes(concepts, evidence, options = {}) {
  const limit = Math.max(1, options.limit ?? 3);
  const chosen = concepts.slice(0, limit);
  const parts = [];

  if (!chosen.length) {
    parts.push(evidence.trafficModel?.enabled
      ? "<div><strong>Course Character:</strong> No single feature stands out. Route choice, robot positions, and efficient use of the factory floor should matter more than any one obstacle.</div>"
      : "<div><strong>Course Character:</strong> No single feature stands out. Card flexibility and efficient use of the factory floor should matter more than any one obstacle.</div>");
  } else {
    chosen.forEach((item) => {
      parts.push(`<div><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.text)}</div>`);
    });
  }

  return parts.join("");
}

export function buildCourseNotesHtml(scenario, fitNotes = [], options = {}) {
  if (!scenario) return "";

  const cacheKey = "player-facing-shared-facts-v49ef-rehydration-alert-cleanup";
  let scenarioCache = notesCache.get(scenario);
  if (!scenarioCache) {
    scenarioCache = new Map();
    notesCache.set(scenario, scenarioCache);
  }
  if (scenarioCache.has(cacheKey)) {
    return scenarioCache.get(cacheKey);
  }

  const evidence = buildCourseNoteEvidence(scenario, fitNotes);
  const concepts = buildCourseNoteConcepts(evidence);
  const html = renderCourseNotes(concepts, evidence, options);
  scenarioCache.set(cacheKey, html);
  return html;
}

export function clearCourseNotesCache(scenario = null) {
  if (scenario) {
    notesCache.delete(scenario);
  }
}
// VERSION END: v49ef-rehydration-alert-cleanup
