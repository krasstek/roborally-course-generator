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

function selectedOpeningRoutes(scenario) {
  return (scenario?.sequence?.firstLeg?.starts || [])
    .filter((item) => item.reachable && item.selectedRoute)
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

export function buildCourseNoteEvidence(scenario, fitNotes = []) {
  const first = scenario?.sequence?.firstLeg?.summary || {};
  const openingRoutes = selectedOpeningRoutes(scenario);
  const laterLegs = (scenario?.sequence?.legs || []).slice(1);
  const laterSummaries = laterLegs.map((leg) => leg?.analysis?.summary || {});
  const routeDrama = scenario?.metrics?.routeDrama || {};
  const contributions = scenario?.metrics?.lengthMetrics?.contributions || {};
  const legs = scenario?.sequence?.legs || [];
  const rankedLegs = legs
    .map((leg) => ({ leg, pressure: getLegPressure(leg) }))
    .sort((a, b) => b.pressure - a.pressure);

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
        : null
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
  const { opening, later, drama, pace, variants } = evidence;

  // TRAFFIC: synthesize overlap, rear exposure and later convergence into one idea.
  const trafficScore = Math.max(
    opening.rear / 3.2,
    opening.overlap / 3.5,
    later.congestion / 3.2,
    later.overlap * 5,
    drama.level === "high" ? 9 : drama.level === "moderate" ? 6 : 0
  );
  if (trafficScore >= 3.5) {
    let text;
    if (opening.rear >= 16 && later.congestion >= 14) {
      text = "Traffic matters throughout the race: the opening already exposes lead robots to pressure from behind, and later efficient routes continue to converge. A slightly longer lane can be worthwhile if it avoids becoming the robot everyone follows and shoots at.";
    } else if (later.congestion >= 14 || later.overlap >= 0.9) {
      text = later.distinctRoutes >= 2.6
        ? "Several viable lines exist, but the efficient ones converge often enough that later legs should be chosen with other robots in mind rather than by distance alone."
        : "Later legs funnel robots onto much the same lines, so the front robot is likely to feel sustained pressure from blocking, pushing and fire from behind.";
    } else if (opening.rear >= 16) {
      text = "The opening lanes create meaningful rear pressure. Getting ahead is useful, but staying directly in front of another robot for too long can be more expensive than taking a cleaner line.";
    } else {
      text = "Robot interaction is likely to matter on the main routes: shared lanes and crossings make position relative to the other robots part of route choice.";
    }
    concepts.push(concept("traffic", trafficScore, "Traffic", text));
  }

  // ROUTE CHOICE: route diversity and backtracking are one idea, not separate notes.
  const constrained = later.distinctRoutes > 0 && later.distinctRoutes <= 1.7;
  const varied = later.distinctRoutes >= 3 && later.overlap <= 0.65;
  const routeScore = constrained
    ? 7 + later.overlap * 3
    : varied
      ? 5.5 + Math.max(0, 0.8 - later.overlap) * 2
      : later.overlap >= 1.1
        ? 6 + later.overlap * 2
        : 0;
  if (routeScore >= 4) {
    const text = constrained
      ? "The later course has few genuinely distinct efficient routes. Expect repeated use of the same corridors, so timing and robot order may matter more than finding a completely separate path."
      : varied
        ? "The later checkpoints leave room for genuinely different approaches. Detours are plausible enough that avoiding traffic or a bad factory lane need not mean giving up the race."
        : "Later legs tend to reuse earlier corridors, so route choice is often about when to leave and rejoin the main line rather than finding an entirely separate path.";
    concepts.push(concept("route-choice", routeScore, "Route Choice", text));
  }

  // FACTORY MOVEMENT: forced motion + facing changes describe reliance on the floor.
  const movementScore = opening.forcedDistance * 1.25 + opening.facingChanges * 1.1;
  if (movementScore >= 4.2) {
    const text = opening.facingChanges >= 2
      ? "The factory floor does a significant share of the movement and also changes facing. Planning where a conveyor or other forced move leaves the robot is more important than counting programmed spaces alone."
      : "Forced movement contributes materially to efficient routes. Using the floor well can save programmed movement, while missing those lines makes the same leg noticeably less efficient.";
    concepts.push(concept("factory-movement", movementScore, "Factory Movement", text));
  }

  // HAZARD / CONTROL: merge variants that make existing exposure more consequential.
  let hazardScore = opening.flagArea / 4.5;
  const hazardModifiers = [];
  if (variants.flamingOil) { hazardScore += 2.2; hazardModifiers.push("oil"); }
  if (variants.setToKill) { hazardScore += 2.2; hazardModifiers.push("laser fire"); }
  if (variants.repulsorOverdrive) { hazardScore += 1.8; hazardModifiers.push("repulsors"); }
  if (variants.setToStun) hazardScore -= 1.5;
  if (hazardScore >= 4.5) {
    let text = "Important spaces carry enough factory pressure that a geometrically short route is not automatically the safest or cheapest route in play.";
    if (hazardModifiers.length === 1) {
      text = `${hazardModifiers[0][0].toUpperCase()}${hazardModifiers[0].slice(1)} is especially consequential under the selected rules, so exposure to it deserves more weight than a small distance saving.`;
    } else if (hazardModifiers.length > 1) {
      text = `The selected rules amplify ${hazardModifiers.slice(0, -1).join(", ")} and ${hazardModifiers.at(-1)}, making hazardous shortcuts meaningfully less forgiving than their geometry suggests.`;
    }
    concepts.push(concept("hazards", hazardScore, "Hazards", text));
  }

  // PLANNING: rules that affect information/card control belong in one note.
  const planningFactors = [
    variants.actFast && "limited programming time",
    variants.classicSharedDeck && "shared card availability",
    variants.lessForeshadowing && "less advance information",
    variants.factoryRejects && "reduced programming flexibility"
  ].filter(Boolean);
  if (planningFactors.length) {
    const score = 4.5 + planningFactors.length * 1.4;
    const joined = planningFactors.length === 1
      ? planningFactors[0]
      : `${planningFactors.slice(0, -1).join(", ")} and ${planningFactors.at(-1)}`;
    concepts.push(concept(
      "planning",
      score,
      "Programming",
      `The selected rules make programming itself part of the challenge through ${joined}. This matters independently of the physical route difficulty.`
    ));
  }

  // RECOVERY: only note when recovery changes tactical meaning, not to restate rules.
  if (variants.dynamicArchiving || variants.homeReboot) {
    const score = variants.dynamicArchiving ? 5.2 : 4.2;
    const text = variants.dynamicArchiving
      ? "Recovery position is unusually strategic here: where a robot archives can change the value of risky shortcuts and failed approaches, so the shortest safe line is not always the only sensible one."
      : "The recovery setup makes the cost of a bad fall depend strongly on where it happens, so risky shortcuts should be judged by their reboot consequence as well as their immediate danger.";
    concepts.push(concept("recovery", score, "Recovery", text));
  }

  // PACE: only surface it when one driver is distinctive or the generated fit missed.
  const paceScore = Math.max(
    Math.abs(evidence.lengthFit) / 4,
    pace.actions / 10,
    pace.distance / 7,
    pace.congestion / 2
  );
  if (paceScore >= 5.2) {
    let text;
    if (pace.congestion >= 4) {
      text = "The course's expected duration comes as much from robot congestion as from raw travel distance; clean progress can speed it up substantially.";
    } else if (pace.distance >= pace.actions * 0.65) {
      text = "Travel distance is the main source of course length. The route is physically substantial rather than merely complicated by programming overhead.";
    } else {
      text = "Programmed action load is a major part of the course length, so efficient use of forced movement can noticeably shorten the race.";
    }
    concepts.push(concept("pace", paceScore, "Pace", text));
  }

  return concepts.sort((a, b) => b.score - a.score);
}

function renderBestMatchAdvice(evidence) {
  if (!evidence.bestMatch) return "";

  const suggestions = ["Regenerate to try for a closer match"];
  if (
    evidence.requestedDifficulty !== "any" &&
    evidence.difficultyFit > 0
  ) {
    suggestions.push("choose Any difficulty to give the generator more options");
  }
  if (
    evidence.requestedLength !== "any" &&
    evidence.lengthFit > 0
  ) {
    suggestions.push("choose Any length to give the generator more options");
  }

  const suggestionText = suggestions.length === 1
    ? `${suggestions[0]}.`
    : `${suggestions[0]}; alternatively, ${suggestions.slice(1).join(" and ")}.`;

  return `<div><strong>Closest match found:</strong> The generator did not find a full match within its search budget. ${escapeHtml(suggestionText)}</div>`;
}

function renderFit(fitNotes) {
  if (!fitNotes.length) return "";
  return `<div><strong>Fit:</strong> This course is ${escapeHtml(fitNotes.join(" and "))} than requested. The notes below describe how it is likely to play despite that mismatch.</div>`;
}

export function renderCourseNotes(concepts, evidence, options = {}) {
  const limit = Math.max(1, options.limit ?? 4);
  const chosen = concepts.slice(0, limit);
  const parts = [];

  if (evidence.bestMatch) {
    parts.push(renderBestMatchAdvice(evidence));
  }

  if (evidence.fitNotes.length) {
    parts.push(renderFit(evidence.fitNotes));
  }

  if (!chosen.length) {
    parts.push("<div><strong>Character:</strong> No single feature dominates this course. Route length, factory pressure and traffic are comparatively balanced, so play should depend more on the actual cards and robot positions than on one obvious board theme.</div>");
  } else {
    chosen.forEach((item) => {
      parts.push(`<div><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.text)}</div>`);
    });
  }

  return parts.join("");
}

export function buildCourseNotesHtml(scenario, fitNotes = [], options = {}) {
  if (!scenario) return "";

  const cacheKey = `${scenario.generationBestMatch ? "best" : "accepted"}::${scenario.generationTerminationReason ?? "-"}::${fitNotes.join("|")}`;
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
