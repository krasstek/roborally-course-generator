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

function getLegPressure(leg) {
  const summary = leg?.analysis?.summary || {};
  return (summary.difficultyScore ?? summary.averageRouteScore ?? 0) +
    (summary.congestionScore ?? 0) * 0.45 +
    (summary.crossLegOverlap ?? 0) * 6 -
    (summary.diversityScore ?? 0) * 0.12;
}

function getLegLabel(leg, scenario) {
  if (leg?.from === "dock") return scenario?.virtualBots ? "Entry → 1" : "Dock → 1";
  return `${leg?.from ?? "?"} → ${leg?.to ?? "?"}`;
}

const CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD = 6;
const CHECKPOINT_PLACEMENT_COMPONENT_NOTE_THRESHOLD = 1.5;

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

  // Player-facing severity is intentionally independent of requested length and
  // difficulty. Fit scoring keeps its existing request-sensitive penalties; this
  // separate scale only decides whether a pacing quirk is substantial enough to
  // bother the player with a Course Note / result-banner advisory.
  const openingSeverity = openingFastestShortfall * 2 + openingAverageShortfall * 1.2;
  const middleSeverity = middleShortestShortfall * 2 + middleAverageShortfall * 0.8;
  const finalSeverity = finalShortfall * 2.5;
  const severity = openingSeverity + middleSeverity + finalSeverity;
  const hasDeviation = severity > 0;
  const active = severity >= CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD;

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
      threshold: CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD,
      score: 0,
      bannerText: "",
      text: ""
    };
  }

  const locations = [opening ? "opening" : null, consecutive ? "middle" : null, final ? "finish" : null].filter(Boolean);
  let noteText = "Checkpoint pacing is unusually quick.";
  if (locations.length === 1) {
    noteText = locations[0] === "opening"
      ? "The opening is unusually quick."
      : locations[0] === "middle"
        ? (middleShortestShortfall > 0 && middleAverageShortfall <= 0
          ? "One middle checkpoint leg is unusually quick."
          : "The middle checkpoints come unusually quickly.")
        : "The last leg of the course is unusually quick.";
  } else if (locations.length === 2) {
    noteText = locations.includes("opening") && locations.includes("middle")
      ? "The opening and middle checkpoints come unusually quickly."
      : locations.includes("middle") && locations.includes("finish")
        ? "The middle checkpoints and last leg are unusually quick."
        : "The opening and last leg are unusually quick.";
  } else if (locations.length === 3) {
    noteText = "Checkpoint pacing is unusually quick throughout the course.";
  }

  let bannerText = "Checkpoint pacing is tighter than usual.";
  if (locations.length === 1) {
    bannerText = locations[0] === "opening"
      ? "The opening checkpoint comes up quickly."
      : locations[0] === "middle"
        ? "Some middle checkpoints come in quick succession."
        : "The last leg of the course is unusually quick.";
  } else if (locations.length === 2) {
    bannerText = locations.includes("opening") && locations.includes("middle")
      ? "Checkpoint pacing is compressed in the opening and middle."
      : locations.includes("middle") && locations.includes("finish")
        ? "Checkpoint pacing is unusually quick through the middle and last leg."
        : "The opening and last leg are quicker than usual.";
  } else if (locations.length === 3) {
    bannerText = "Checkpoint pacing is unusually quick in the opening, middle, and last leg.";
  }

  const score = Math.min(9, 5.5 + severity / 4);
  return {
    active: true,
    hasDeviation: true,
    opening,
    final,
    consecutive,
    severity: Number(severity.toFixed(2)),
    threshold: CHECKPOINT_PLACEMENT_ADVISORY_THRESHOLD,
    score: Number(score.toFixed(2)),
    bannerText,
    text: noteText
  };
}

// Detailed start residuals are diagnostics. Course Notes receives only a
// field-level, non-advisory description of a meaningful residual pattern: no
// numbered starting spaces, z-scores, pruning mechanics or generator internals.
export function buildCourseNoteEvidence(scenario, fitNotes = []) {
  const first = scenario?.sequence?.firstLeg?.summary || {};
  const openingRoutes = selectedOpeningRoutes(scenario);
  const laterLegs = (scenario?.sequence?.legs || []).slice(1);
  const laterSummaries = laterLegs.map((leg) => leg?.analysis?.summary || {});
  const routeDrama = scenario?.metrics?.routeDrama || {};
  const contributions = scenario?.metrics?.lengthMetrics?.contributions || {};
  const fullTraffic = first.fullCourseTraffic || null;
  const contextualProfile = first.contextualSearchProfile || null;
  const normalBalance = first.normalStartBalance || null;
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
  const energyRoutes = usableStartAnalyses.map((item) => item.fullCourseRoute).filter(Boolean);
  const energyRewardValues = energyRoutes
    .map((route) => Number(route.routeEnergyEconomyRewardScore))
    .filter(Number.isFinite);
  const batteryRewardValues = energyRoutes
    .map((route) => Number(route.batteryEconomyRewardScore))
    .filter(Number.isFinite);
  const powerUpRewardValues = energyRoutes
    .map((route) => Number(route.powerUpEconomyRewardScore))
    .filter(Number.isFinite);
  const chopShopRewardValues = energyRoutes
    .map((route) => Number(route.chopShopEconomyRewardScore))
    .filter(Number.isFinite);
  const legs = scenario?.sequence?.legs || [];
  const rankedLegs = legs
    .map((leg) => ({ leg, pressure: getLegPressure(leg) }))
    .sort((a, b) => b.pressure - a.pressure);
  const averageLegPressure = average(rankedLegs.map((entry) => entry.pressure));
  const programmingPressure = scenario?.metrics?.programmingPressure || {};
  const checkpointPlacement = getCheckpointPlacementAdvisory(scenario);

  return {
    fitNotes: [...fitNotes],
    playerCount: scenario?.playerCount ?? scenario?.preferences?.playerCount ?? 0,
    difficultyRaw: scenario?.metrics?.difficultyRaw ?? 0,
    difficultyFit: scenario?.metrics?.difficultyFit ?? 0,
    difficultyDirection: scenario?.metrics?.difficultyDirection ?? "matched",
    lengthFit: scenario?.metrics?.lengthFit ?? 0,
    lengthDirection: scenario?.metrics?.lengthDirection ?? "matched",
    bestMatch: Boolean(scenario?.generationBestMatch),
    terminationReason: scenario?.generationTerminationReason ?? null,
    attempts: scenario?.attempts ?? 0,
    requestedDifficulty: scenario?.preferences?.difficulty ?? "any",
    requestedLength: scenario?.preferences?.length ?? "any",
    generationMode: scenario?.generationDiagnostics?.generationMode ?? scenario?.preferences?.generationMode ?? "standard",
    generationModeLabel: scenario?.generationDiagnostics?.generationModeLabel ?? formatGenerationModeForNotes(scenario?.preferences?.generationMode),
    generationModeProfile: scenario?.generationDiagnostics?.searchProfile ?? null,
    checkpointPlacement,
    opening: {
      traffic: first.averageTrafficPenalty ?? 0,
      overlap: first.averageOverlapPenalty ?? 0,
      rear: first.averageRearThreat ?? 0,
      lateral: first.averageLateralThreat ?? 0,
      flagArea: first.flagAreaScore ?? 0,
      forcedDistance: average(openingRoutes.map((route) => route.forcedDistance ?? 0)),
      facingChanges: getOpeningFacingChanges(openingRoutes)
    },
    later: {
      congestion: average(laterSummaries.map((summary) => summary.congestionScore ?? 0)),
      overlap: average(laterSummaries.map((summary) => summary.crossLegOverlap ?? 0)),
      diversity: average(laterSummaries.map((summary) => summary.diversityScore ?? 0)),
      distinctRoutes: average(laterSummaries.map((summary) => summary.distinctRouteCount ?? 0)),
      hardestLeg: rankedLegs[0]
        ? { label: getLegLabel(rankedLegs[0].leg, scenario), pressure: rankedLegs[0].pressure }
        : null,
      averagePressure: averageLegPressure
    },
    drama: {
      level: routeDrama.level ?? "low",
      score: routeDrama.score ?? 0,
      sharedTiles: routeDrama.sharedTiles ?? 0,
      crossings: routeDrama.crossings ?? 0,
      reverseEdges: routeDrama.reverseEdges ?? 0
    },
    pace: {
      actions: contributions.actionLoad ?? 0,
      distance: contributions.distanceLoad ?? 0,
      checkpoints: contributions.checkpointLoad ?? 0,
      congestion: contributions.congestionLoad ?? 0
    },
    trafficModel: {
      enabled: Boolean(contextualProfile?.trafficEnabled),
      confidenceWeighted: Boolean(fullTraffic?.confidenceWeighted),
      averageEffective: fullTraffic?.averagePenalty ?? first.averageTrafficPenalty ?? 0,
      averageRaw: fullTraffic?.averageRawPenalty ?? null,
      averageConfidence: fullTraffic?.averageForecastConfidence ?? 1,
      minimumConfidence: fullTraffic?.minimumForecastConfidence ?? 1,
      byLeg: trafficByLeg,
      epochs: fullTraffic?.trafficEpochsExecuted ?? 0,
      alternateDemandStarts: fullTraffic?.alternateDemandStarts ?? 0,
      alternateDemandLegs: fullTraffic?.alternateDemandLegs ?? 0,
      alternateCandidatesAdded: fullTraffic?.alternateCandidatesAdded ?? 0,
      effectiveDemandLegs: fullTraffic?.alternateEffectiveDemandLegs ?? 0,
      exploratoryDemandLegs: fullTraffic?.alternateExploratoryDemandLegs ?? 0,
      explorationUncertaintyShare: fullTraffic?.explorationUncertaintyShare ?? contextualProfile?.trafficExplorationUncertaintyShare ?? 0,
      explorationConfidenceFloor: fullTraffic?.explorationConfidenceFloor ?? contextualProfile?.trafficExplorationConfidenceFloor ?? 1,
      routeSwitches: fullTraffic?.routeSwitches ?? 0,
      startsWithAlternatives: trafficCandidates.filter((item) => (item?.candidateCount ?? 0) > 1).length,
      candidateCountMax: trafficCandidates.length
        ? Math.max(...trafficCandidates.map((item) => item?.candidateCount ?? 0))
        : 0
    },
    normalBalance: normalBalance?.active
      ? {
        active: true,
        pruned: (normalBalance.pressurePruned || []).length,
        retained: normalBalance.retainedCount ?? null,
        stdDevBefore: normalBalance.balanceStdDevBefore ?? null,
        stdDevAfter: normalBalance.balanceStdDevAfter ?? null,
        limit: normalBalance.balanceStdDevLimit ?? null,
        scoreRange: normalBalance.retainedScoreRange ?? null,
        worstScoreZ: normalBalance.worstRemainingScoreZ ?? null,
        worstActionZ: normalBalance.worstRemainingActionZ ?? null,
        reject: Boolean(normalBalance.reject),
        startResiduals: normalBalance.startResiduals?.active
          ? {
            active: true,
            retainedCount: normalBalance.startResiduals.retainedCount ?? null,
            notableCount: normalBalance.startResiduals.notableCount ?? 0,
            courseNoteCandidate: normalBalance.startResiduals.courseNoteCandidate?.active
              ? {
                active: true,
                kind: normalBalance.startResiduals.courseNoteCandidate.kind ?? null,
                strength: Number(normalBalance.startResiduals.courseNoteCandidate.strength) || 0,
                severity: normalBalance.startResiduals.courseNoteCandidate.severity ?? "minor",
                reasonId: normalBalance.startResiduals.courseNoteCandidate.reasonId ?? "overall",
                reasonLabel: normalBalance.startResiduals.courseNoteCandidate.reasonLabel ?? "overall route burden",
                notableCount: normalBalance.startResiduals.courseNoteCandidate.notableCount ?? 1
              }
              : { active: false }
          }
          : null
      }
      : null,
    competitiveBalance: competitiveBalance?.active
      ? {
        active: true,
        meanBlockChallenge: competitiveBalance.strategicDifficultyEvidence?.meanBlockChallenge ?? null,
        selectionAmbiguity: competitiveBalance.strategicDifficultyEvidence?.selectionAmbiguity ?? null,
        maxAdvantageZ: Math.max(
          0,
          ...(competitiveBalance.blockSequence || [])
            .map((entry) => Number(entry?.advantageZ))
            .filter(Number.isFinite)
        ),
        minDecisionMarginZ: Math.min(
          Infinity,
          ...(competitiveBalance.blockSequence || [])
            .map((entry) => Number(entry?.decisionMarginZ))
            .filter(Number.isFinite)
        )
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
    programming: {
      active: Boolean(programmingPressure.active),
      planningPressure: Number(programmingPressure.planningPressure) || 0,
      timedPressure: Number(programmingPressure.timedPressure) || 0,
      hazardPressure: Number(programmingPressure.hazardPressure) || 0,
      trafficPressure: Number(programmingPressure.trafficPressure) || 0,
      controlPressure: Number(programmingPressure.controlPressure) || 0,
      cardPressure: Number(programmingPressure.cardPressure) || 0,
      averageGearTurns: Number(programmingPressure.averageGearTurns) || 0,
      averageConveyorTurns: Number(programmingPressure.averageConveyorTurns) || 0,
      averageForcedSpaces: Number(programmingPressure.averageForcedSpaces) || 0
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

export function buildCourseNoteConcepts(evidence) {
  const concepts = [];
  const { opening, later, drama, pace } = evidence;
  const trafficModel = evidence.trafficModel || {};
  const programming = evidence.programming || {};

  if (evidence.checkpointPlacement?.active) {
    concepts.push(concept(
      "checkpoint-placement",
      evidence.checkpointPlacement.score ?? 6,
      "Checkpoint Pacing",
      evidence.checkpointPlacement.text
    ));
  }

  // TRAFFIC: describe where robot interaction is likely to be felt, without
  // exposing forecast confidence, search effort, or route-selection internals.
  if (trafficModel.enabled && trafficModel.confidenceWeighted) {
    const effective = Number(trafficModel.averageEffective) || 0;
    const trafficScore = Math.max(
      effective / 8,
      trafficModel.routeSwitches > 0 ? 7 : 0,
      trafficModel.alternateDemandStarts > 0 ? 5 : 0
    );
    if (trafficScore >= 3.5) {
      const firstLegTraffic = trafficModel.byLeg?.[0] || null;
      const strongestLeg = [...(trafficModel.byLeg || [])]
        .sort((a, b) => (b?.effective ?? 0) - (a?.effective ?? 0))[0] || null;
      const text = (strongestLeg?.effective ?? 0) > (firstLegTraffic?.effective ?? 0) * 1.4
        ? "Robot interaction is likely to build after the opening. Shared lanes and nearby robots may make a clean line more useful than the shortest-looking one."
        : "The main racing lines are likely to be busy. Leave room for other robots and be ready to change plans when several players want the same spaces.";
      concepts.push(concept("traffic", trafficScore, "Traffic", text));
    }

    const hasAlternatives = trafficModel.startsWithAlternatives > 0 || trafficModel.alternateCandidatesAdded > 0;
    const routeScore = trafficModel.routeSwitches > 0 ? 8 : hasAlternatives ? 6.5 : 0;
    if (routeScore >= 4) {
      const text = trafficModel.routeSwitches > 0
        ? "At least one part of the course has a worthwhile second way through when the obvious line gets crowded. A small detour can be a real racing option here."
        : "There are useful alternate lines in some busy parts of the course. Keep them in mind if another robot occupies the most direct route.";
      concepts.push(concept("route-choice", routeScore, "Alternate Lines", text));
    }
  } else if (!trafficModel.enabled && evidence.normalBalance?.active) {
    // A traffic-disabled generation mode should not make multiplayer predictions.
  } else {
    const trafficScore = Math.max(
      opening.rear / 3.2,
      opening.overlap / 3.5,
      later.congestion / 3.2,
      later.overlap * 5,
      drama.level === "high" ? 9 : drama.level === "moderate" ? 6 : 0
    );
    if (trafficScore >= 3.5) {
      concepts.push(concept(
        "traffic",
        trafficScore,
        "Traffic",
        "Several racing lines cross or overlap, so other robots are likely to matter when choosing where to go."
      ));
    }
  }

  // STARTING SPACES: detailed residuals stay in Dev. Player-facing notes must
  // never identify or recommend a numbered start. They may only mention a small
  // remaining field-level imbalance and its broad character.
  if (evidence.normalBalance?.active) {
    const balance = evidence.normalBalance;
    const residual = balance.startResiduals?.courseNoteCandidate?.active
      ? balance.startResiduals.courseNoteCandidate
      : null;
    if (balance.pruned > 0 || residual) {
      const parts = [];
      if (balance.pruned > 0) {
        parts.push("The available starting spaces are fairly close in strength.");
      }
      if (residual) {
        const severity = residual.severity === "trivial" ? "A trivial" : "A minor";
        const reasonText = {
          traffic: "some starting spaces may see a little more robot traffic than others",
          actions: "some starting spaces may require a little more programmed route work than others",
          hazard: "some starting spaces may face slightly more hazard exposure than others",
          conveyor: "some starting spaces may have to work a little harder through conveyors and forced movement than others",
          forced: "some starting spaces may have to work a little harder around forced movement than others",
          distance: "some starting spaces may have a slightly longer line through the course than others",
          overall: "some starting spaces may require a little more effort through the course than others"
        }[residual.reasonId] ?? "some starting spaces may require a little more effort through the course than others";
        parts.push(`${severity} imbalance may remain: ${reasonText}.`);
      }
      const residualScore = residual ? Math.min(1.2, (Number(residual.strength) || 0) * 0.8) : 0;
      const score = balance.pruned > 0
        ? 5.8 + Math.min(1.6, balance.pruned * 0.35) + residualScore * 0.35
        : 4.9 + residualScore;
      concepts.push(concept(
        "start-balance",
        score,
        "Starting Spaces",
        parts.join(" ")
      ));
    }
  }

  // COMPETITIVE: Special Rules explains the procedure; Course Notes only gives a
  // useful pointer about this particular set of starting choices.
  if (evidence.competitiveBalance?.active) {
    const balance = evidence.competitiveBalance;
    const blockChallenge = Number(balance.meanBlockChallenge);
    const selectionAmbiguity = Number(balance.selectionAmbiguity);
    const maxAdvantageZ = Number(balance.maxAdvantageZ);
    const minDecisionMarginZ = Number(balance.minDecisionMarginZ);
    if (Number.isFinite(blockChallenge) && blockChallenge >= 0.68) {
      concepts.push(concept(
        "competitive-start-reading",
        6.4 + Math.min(1.2, (blockChallenge - 0.68) * 3),
        "Starting Choices",
        "The stronger starting spaces are fairly close in value, so the best blocks may not be obvious. Looking over the opening routes before choosing can pay off."
      ));
    } else if (
      Number.isFinite(maxAdvantageZ) && maxAdvantageZ >= 1.25 &&
      Number.isFinite(minDecisionMarginZ) && minDecisionMarginZ >= 0.75
    ) {
      concepts.push(concept(
        "competitive-start-reading",
        5.8 + Math.min(1, (maxAdvantageZ - 1.25) * 0.5),
        "Starting Choices",
        "At least one starting space stands out as especially strong. Spotting the clearest advantage can have a noticeable effect before the race begins."
      ));
    } else if (
      Number.isFinite(selectionAmbiguity) && selectionAmbiguity >= 0.72 &&
      Number.isFinite(maxAdvantageZ) && maxAdvantageZ >= 0.55
    ) {
      concepts.push(concept(
        "competitive-start-reading",
        5.6,
        "Starting Choices",
        "Once the strongest spaces are dealt with, the remaining starts are fairly close. Small details in the opening route may decide which one you prefer."
      ));
    }
  }

  // ENERGY: this is about visible course opportunities, not how the analyzer valued them.
  if (evidence.energy?.active && evidence.energy.averageReward >= 5) {
    const energy = evidence.energy;
    const dominant = [
      { label: "Battery spaces", value: energy.averageBatteryReward },
      { label: "Power Up spaces", value: energy.averagePowerUpReward },
      { label: "Chop Shops", value: energy.averageChopShopReward }
    ].sort((a, b) => b.value - a.value)[0];
    const text = dominant?.value >= 2
      ? `${dominant.label} are worth watching on this course. A small detour can pay off when you can put the extra Energy to use soon.`
      : "Energy opportunities are important enough that a small early detour may be worthwhile if you can use the Energy soon.";
    concepts.push(concept("energy", Math.min(8, 4.5 + energy.averageReward / 5), "Energy", text));
  }

  // FACTORY MOVEMENT.
  const movementScore = opening.forcedDistance * 1.25 + opening.facingChanges * 1.1;
  if (movementScore >= 4.2) {
    const text = opening.facingChanges >= 2
      ? "The factory floor does a lot of the moving and turning here. Keep track of where conveyors and gears leave your robot facing, not just how far your cards move it."
      : "Forced movement does a useful share of the work on this course. Using the floor well can save cards, while fighting it can make the same section much slower.";
    concepts.push(concept("factory-movement", movementScore, "Factory Movement", text));
  }

  // HAZARDS: reflect the resulting course, not the optional-rule explanation.
  const hazardScore = Math.max(opening.flagArea / 4.5, programming.hazardPressure * 5);
  if (hazardScore >= 4.5) {
    const text = programming.hazardPressure >= 0.9
      ? "Hazards sit close enough to useful racing lines that a small mistake can be costly. The shortest-looking route is not always the safest choice."
      : "A few important areas put hazards close to the racing line. Give yourself some margin when a shortcut leaves little room for error.";
    concepts.push(concept("hazards", hazardScore, "Hazards", text));
  }

  // PROGRAMMING: describe course demands only. Timers/deck variants themselves are
  // explained in Special Rules and never appear here just for being active.
  if (programming.active && programming.planningPressure >= 0.52) {
    const drivers = [
      { id: "traffic", value: programming.trafficPressure },
      { id: "control", value: programming.controlPressure },
      { id: "hazard", value: programming.hazardPressure },
      { id: "cards", value: programming.cardPressure }
    ].sort((a, b) => b.value - a.value);
    const dominant = drivers[0]?.id;
    let text = "This course rewards careful programming because small mistakes can be hard to recover from.";
    if (dominant === "control") {
      text = "Several sections ask you to keep track of forced movement and facing changes. Plan where the factory leaves your robot at the end of each register.";
    } else if (dominant === "traffic") {
      text = "Busy racing lines make timing and positioning important. Programs that leave a little flexibility may fare better than plans that depend on every shared space staying clear.";
    } else if (dominant === "hazard") {
      text = "Precise programming matters around the dangerous sections. A small error can put the robot somewhere much less forgiving than intended.";
    } else if (dominant === "cards") {
      text = "Some efficient lines ask for fairly specific movement cards. It may be worth keeping a simpler backup line in mind when the hand does not cooperate.";
    }
    concepts.push(concept("programming", 4.6 + programming.planningPressure * 2.2, "Programming", text));
  }

  // TOUGHEST STRETCH: call out a distinctive leg when one clearly stands above the rest.
  const hardest = later.hardestLeg;
  if (
    hardest && Number.isFinite(hardest.pressure) && Number.isFinite(later.averagePressure) &&
    later.averagePressure > 0 && hardest.pressure >= later.averagePressure * 1.28
  ) {
    concepts.push(concept(
      "toughest-stretch",
      5.4 + Math.min(2, (hardest.pressure / later.averagePressure - 1.28) * 3),
      "Toughest Stretch",
      `${hardest.label} looks like the most demanding part of the course. Saving a little flexibility for that section may be worthwhile.`
    ));
  }

  // PACE: plain-language course character only.
  const paceScore = Math.max(
    Math.abs(evidence.lengthFit) / 4,
    pace.actions / 10,
    pace.distance / 7
  );
  if (paceScore >= 5.2) {
    const text = pace.distance >= pace.actions * 0.65
      ? "This is a travel-heavy course: much of its length comes from covering ground rather than from one especially complicated obstacle."
      : "The course gets much of its length from the number of programmed moves. Good use of conveyors and other forced movement can shorten the race noticeably.";
    concepts.push(concept("pace", paceScore, "Pace", text));
  }

  return concepts.sort((a, b) => b.score - a.score);
}

export function renderCourseNotes(concepts, evidence, options = {}) {
  const limit = Math.max(1, options.limit ?? 3);
  const chosen = concepts.slice(0, limit);
  const parts = [];

  if (!chosen.length) {
    parts.push(evidence.trafficModel?.enabled
      ? "<div><strong>Course Character:</strong> No single feature dominates this course. Expect the cards, robot positions, and how well you use the factory floor to matter more than one obvious obstacle.</div>"
      : "<div><strong>Course Character:</strong> No single feature dominates this course. Expect the cards and how well you use the factory floor to matter more than one obvious obstacle.</div>");
  } else {
    chosen.forEach((item) => {
      parts.push(`<div><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.text)}</div>`);
    });
  }

  return parts.join("");
}

export function buildCourseNotesHtml(scenario, fitNotes = [], options = {}) {
  if (!scenario) return "";

  const cacheKey = "player-facing-checkpoint-advisory-deadband-v47e";
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
