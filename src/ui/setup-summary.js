// Robo Rally Course Randomizer - setup summary, course notes toggle and generation constraint hints
import {
  buildCourseNoteFacts,
  buildCourseNotesHtml,
  clearCourseNotesCache
} from "../../course-notes.js";
import { normalizeGenerationMode } from "../generation/generation-modes.js";
import {
  formatPresentedDifficultyLabel,
  formatPresentedLengthLabel,
  getEstimatedGameTurnsLabel,
  getProductionLengthTurnIndex,
  getScenarioPresentationMetrics
} from "../generation/labels.js";
import { isMiniOverlayPiece } from "../generation/layout-geometry.js";
import { getReloadRequestedTargetLabel } from "../generation/persistence.js";
import { getProductionLengthThresholds } from "../generation/targets.js";
import { formatBoardLabel } from "./board-audit.js";

export let courseExplanationState = {
  scenarioRef: null,
  userPinnedOpen: false,
  manualClosedScenarioRef: null
};

export function getGenerationConstraintHint(preferences = {}) {
  const mode = normalizeGenerationMode(preferences.generationMode);
  const length = preferences.length ?? "any";
  const playerCount = Number(preferences.playerCount) || 4;

  if (length === "epic") {
    return "Epic courses can take substantially longer to check.";
  }
  if (mode === "fastest" || mode === "fast") {
    return "This mode is usually quicker.";
  }
  if (mode === "balanced" || mode === "thorough") {
    return "This mode usually takes a little longer.";
  }
  if (length === "long") {
    return "Long courses can take longer to check.";
  }
  if (playerCount >= 6) {
    return "More players can make some layouts take longer to check.";
  }
  if (preferences.difficulty !== "any" || preferences.length !== "any") {
    return "A specific difficulty or length can take a few tries.";
  }
  return "";
}

export function updateCourseNotesTogglePresentation(toggleEl, visible) {
  if (!toggleEl) return;
  const expanded = Boolean(visible);
  toggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleEl.textContent = expanded ? "Hide notes" : "Show notes";
  toggleEl.title = expanded ? "Hide Course Notes" : "Show Course Notes";
  toggleEl.setAttribute("aria-label", expanded ? "Hide Course Notes" : "Show Course Notes");
}

export function updateSetupSummary(scenario) {
  const fitNoteEl = document.getElementById("fit-note");
  const summary = document.getElementById("setup-summary");
  const difficultyEl = document.getElementById("setup-difficulty");
  const lengthEl = document.getElementById("setup-length");
  const boardsEl = document.getElementById("setup-boards");
  const overlayBoardsRowEl = document.getElementById("setup-overlay-boards-row");
  const overlayBoardsEl = document.getElementById("setup-overlay-boards");
  const overlayTilesRowEl = document.getElementById("setup-overlay-tiles-row");
  const overlayTilesEl = document.getElementById("setup-overlay-tiles");
  const flagsEl = document.getElementById("setup-flags");
  const explanationToggleEl = document.getElementById("course-explanation-toggle");
  const explanationPanelEl = document.getElementById("course-explanation-panel");
  const explanationCopyEl = document.getElementById("course-explanation-copy");

  if (
    !fitNoteEl ||
    !summary ||
    !difficultyEl ||
    !lengthEl ||
    !boardsEl ||
    !overlayBoardsRowEl ||
    !overlayBoardsEl ||
    !overlayTilesRowEl ||
    !overlayTilesEl ||
    !flagsEl ||
    !explanationToggleEl ||
    !explanationPanelEl ||
    !explanationCopyEl
  ) {
    return;
  }

  if (!scenario) {
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
    summary.classList.add("hidden");
    difficultyEl.textContent = "";
    lengthEl.textContent = "";
    boardsEl.textContent = "";
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
    flagsEl.textContent = "";
    explanationCopyEl.innerHTML = "";
    explanationPanelEl.classList.add("hidden");
    updateCourseNotesTogglePresentation(explanationToggleEl, false);
    courseExplanationState = {
      ...courseExplanationState,
      scenarioRef: null,
      manualClosedScenarioRef: null
    };
    return;
  }

  if (courseExplanationState.scenarioRef !== scenario) {
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
    courseExplanationState = {
      ...courseExplanationState,
      scenarioRef: scenario,
      manualClosedScenarioRef: null
    };
  }

  const presentationMetrics = getScenarioPresentationMetrics(scenario);
  const presentationScenario = presentationMetrics === scenario.metrics
    ? scenario
    : { ...scenario, metrics: presentationMetrics };
  const presentationUnavailable = Boolean(scenario.hydrationPresentationUnavailable);
  const hydrationPending = Boolean(scenario.hydrationReanalysisPending);
  const hydrationStopped = Boolean(scenario.hydrationReanalysisStopped);
  const hydrationFailed = Boolean(scenario.hydrationReanalysisFailed);
  const actualDifficultyLabel = presentationUnavailable
    ? "Analysis unavailable"
    : formatPresentedDifficultyLabel(presentationMetrics);
  const actualLengthLabel = presentationUnavailable
    ? "Analysis unavailable"
    : formatPresentedLengthLabel(presentationMetrics);
  const estimatedTurnsLabel = presentationUnavailable
    ? null
    : getEstimatedGameTurnsLabel(presentationScenario);
  difficultyEl.textContent = actualDifficultyLabel;
  lengthEl.textContent = estimatedTurnsLabel
    ? `${actualLengthLabel} (${estimatedTurnsLabel})`
    : actualLengthLabel;

  const boardLabels = scenario.mainBoardIds.map((pieceId) => (
    formatBoardLabel(pieceId, scenario.pieceMap)
  ));
  const overlayBoardLabels = (scenario.overlayPlacements || [])
    .filter((placement) => !isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  const overlayTileLabels = (scenario.overlayPlacements || [])
    .filter((placement) => isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  boardsEl.textContent = boardLabels.join(", ");
  if (overlayBoardLabels.length) {
    overlayBoardsEl.textContent = overlayBoardLabels.join(", ");
    overlayBoardsRowEl.classList.remove("hidden");
  } else {
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
  }
  if (overlayTileLabels.length) {
    overlayTilesEl.textContent = overlayTileLabels.join(", ");
    overlayTilesRowEl.classList.remove("hidden");
  } else {
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
  }
  const visibleCheckpointCount = scenario.virtualBots
    ? Math.max(0, scenario.checkpoints.length - 1)
    : scenario.checkpoints.length;
  flagsEl.textContent = String(visibleCheckpointCount);
  if (presentationUnavailable) {
    fitNoteEl.textContent = hydrationPending
      ? "Reanalyzing this saved course. Its layout is available now; difficulty, length, and Course Notes will appear if the analysis completes."
      : hydrationStopped
        ? "Saved-course reanalysis was stopped. This older save has no stored difficulty, length, or Course Notes to show. Generating again creates a new course; it does not refresh this layout."
        : "This saved course could not be fully reanalyzed after reload, and this older save has no stored difficulty, length, or Course Notes. Generating again creates a new course; it does not refresh this layout.";
    fitNoteEl.classList.remove("hidden");
    const unavailableExplanation = hydrationPending
      ? "<div><strong>Course analysis:</strong> Reanalysis is in progress. The saved layout is shown immediately while the current routing model checks it.</div>"
      : hydrationStopped
        ? "<div><strong>Course analysis:</strong> Reanalysis was stopped. The saved layout is unchanged, but this older save has no stored analysis presentation.</div>"
        : "<div><strong>Course analysis:</strong> The saved layout is unchanged, but its analysis could not be rebuilt and this older save has no stored presentation fallback.</div>";
    const explanationVisible = Boolean(
      courseExplanationState.userPinnedOpen ||
      courseExplanationState.manualClosedScenarioRef !== scenario
    );
    explanationCopyEl.innerHTML = explanationVisible ? unavailableExplanation : "";
    explanationPanelEl.classList.toggle("hidden", !explanationVisible);
    updateCourseNotesTogglePresentation(explanationToggleEl, explanationVisible);
    summary.classList.remove("hidden");
    return;
  }
  const noteParts = [];
  if (scenario.hydrationPresentationFallback) {
    fitNoteEl.textContent = hydrationPending
      ? "Showing the saved course and its last-saved difficulty, length, and Course Notes while current analysis is rebuilt."
      : hydrationStopped
        ? "Saved-course reanalysis was stopped. The course shown is unchanged; difficulty, length, and Course Notes are the last-saved values."
        : hydrationFailed
          ? "The saved course is shown with its last-saved difficulty, length, and Course Notes because current analysis could not be rebuilt."
          : "The saved course is shown with its last-saved difficulty, length, and Course Notes because current analysis was incomplete after reload.";
    fitNoteEl.classList.remove("hidden");
  }
  const courseNoteFacts = buildCourseNoteFacts(presentationScenario);
  const difficultyMismatch = courseNoteFacts.targetMismatch.difficulty;
  const lengthMismatch = courseNoteFacts.targetMismatch.length;
  const difficultyFit = presentationMetrics.difficultyFit ?? 0;
  const lengthFit = presentationMetrics.lengthFit ?? 0;
  const requestedDifficulty = scenario.preferences.difficulty;
  const strongDifficultyThreshold = requestedDifficulty === "easy" ? 48 : 42;
  const difficultyStrength = difficultyMismatch.strength;
  const lengthStrength = lengthMismatch.strength;
  const epicUpperLength = getProductionLengthThresholds().epic[1];
  const presentedWallClockTurnIndex = getProductionLengthTurnIndex(presentationMetrics);
  const epicVeryLong = (
    scenario.preferences.length === "epic" &&
    presentationMetrics.lengthDirection === "high" &&
    Number.isFinite(presentedWallClockTurnIndex) &&
    presentedWallClockTurnIndex > epicUpperLength
  );

  const fairnessAcceptance = presentationMetrics?.fairnessAcceptance ?? null;
  const fairnessOverflowRE = Math.max(
    0,
    Number(fairnessAcceptance?.overflowRE) || 0
  );
  const fairnessOverflowWarning = Boolean(
    fairnessAcceptance?.active && fairnessOverflowRE > 1e-9
  );
  const fairnessOverflowSentence = fairnessOverflowWarning
    ? ` Starting positions are ${fairnessAcceptance?.ordinaryAcceptable ? "slightly" : "more"} uneven than the usual balance range for a course this length.`
    : "";
  const forcedEconomyEffect = presentationMetrics?.forcedEconomyEffect ?? null;
  const forcedEconomyNoEffect = Boolean(
    forcedEconomyEffect?.noMeaningfulEnergyAdjustment
  );
  const forcedEconomyNoEffectSentence = forcedEconomyNoEffect
    ? ` ${forcedEconomyEffect?.variantId === "subsidizedStarts" ? "Subsidized Starts" : "Pay to Win"} was required, but this course produced no starting-Energy changes, so that variant has little practical setup effect here.`
    : "";
  // Energy-adjustment cap saturation is generator telemetry, not player-facing
  // course advice. Players only need the actual displayed Energy adjustments and
  // the surviving/pruned starting-space set.
  const selectionWarningSentence =
    `${fairnessOverflowSentence}${forcedEconomyNoEffectSentence}`;
  const hasSelectionWarning = Boolean(selectionWarningSentence);

  if (difficultyMismatch.active && difficultyStrength) {
    noteParts.push(difficultyMismatch.direction === "low"
      ? `${difficultyStrength} easier`
      : `${difficultyStrength} harder`);
  }

  if (lengthMismatch.active && lengthStrength && !epicVeryLong) {
    noteParts.push(lengthMismatch.direction === "low"
      ? `${lengthStrength} shorter`
      : `${lengthStrength} longer`);
  }

  const shouldSuggestReroll = (
    difficultyFit >= strongDifficultyThreshold ||
    lengthFit >= 24 ||
    hasSelectionWarning ||
    (noteParts.length > 0 && (Number(presentationMetrics?.fitScore) || 0) >= 30)
  );
  const checkpointPlacementAdvisory = courseNoteFacts.checkpointPlacement;
  const epicLengthSentence = epicVeryLong
    ? " This course is very long, even for an Epic game."
    : "";
  const checkpointPlacementSentence = checkpointPlacementAdvisory?.active
    ? ` ${checkpointPlacementAdvisory.bannerText}`
    : "";
  const sandwichedMissingSideCount = courseNoteFacts.boardUse.sandwichedMissingSideCount;
  const limitedFootprintBoardCount = Number(
    courseNoteFacts.boardUse.limitedFootprintCount ??
    (
      (courseNoteFacts.boardUse.zeroRouteInfluenceCount ?? 0) +
      (courseNoteFacts.boardUse.weakTraversedCount ?? 0)
    )
  ) || 0;
  const weakBoardCount = limitedFootprintBoardCount + sandwichedMissingSideCount;
  const sandwichedUseSentence = sandwichedMissingSideCount > 0
    ? ` ${sandwichedMissingSideCount === 1
      ? "One side of the Sandwiched Dock uses only a small part of its board area. It is kept to preserve the intended sandwich."
      : "The Sandwiched Dock sides use only a small part of their board area. They are kept to preserve the intended sandwich."}`
    : "";
  const limitedFootprintSentence = limitedFootprintBoardCount > 0
    ? ` ${limitedFootprintBoardCount === 1
      ? "One board sees only a small part of its area used by the race."
      : "Some boards see only a small part of their area used by the race."}`
    : "";
  const boardUseSentence = `${sandwichedUseSentence}${limitedFootprintSentence}`;
  const extraDocksRequestMismatch = courseNoteFacts.extraDocksRequestMismatch;
  const competitiveSoftMismatch = courseNoteFacts.competitiveSoftMismatch;
  const competitiveMismatchSentence = competitiveSoftMismatch
    ? " Competitive starting positions are somewhat uneven."
    : "";

  const reloadRequestedTargetLabel = getReloadRequestedTargetLabel(scenario.preferences);
  // A saved closest-match flag is historical once current reanalysis accepts the
  // unchanged course. Do not let that old flag fall through into today's ordinary
  // "Closest match found" banner, especially for unconstrained Any / Any saves.
  const presentationGenerationBestMatch = Boolean(
    scenario.generationBestMatch && !scenario.hydrationAcceptanceImproved
  );

  if (scenario.hydrationPresentationFallback) {
    // Keep the explicit last-saved-analysis notice above. A new generation would
    // create a different course, so do not replace it with ordinary reroll advice.
  } else if (scenario.hydrationAcceptanceDrift) {
    fitNoteEl.textContent = reloadRequestedTargetLabel
      ? `This saved course was accepted when generated, but current reanalysis no longer accepts it for the requested ${reloadRequestedTargetLabel} settings. The course itself is unchanged. Generating again creates a new course.`
      : `This saved course was accepted when generated, but current reanalysis now finds an issue that would make it a closest-match result under the current analysis model. The course itself is unchanged. Generating again creates a new course.`;
    fitNoteEl.classList.remove("hidden");
  } else if (scenario.hydrationAcceptanceImproved && reloadRequestedTargetLabel) {
    fitNoteEl.textContent =
      `This course was originally saved as a closest-match fallback. Current reanalysis now accepts it for the requested ${reloadRequestedTargetLabel} settings. The course itself is unchanged.`;
    fitNoteEl.classList.remove("hidden");
  } else if (presentationGenerationBestMatch && (extraDocksRequestMismatch || noteParts.length || epicVeryLong || competitiveSoftMismatch || hasSelectionWarning)) {
    const extraDocksMismatchText = extraDocksRequestMismatch
      ? " Extra Docks was required, but this course uses one docking bay."
      : "";
    const mismatchText = noteParts.length
      ? ` It is ${noteParts.join(" and ")} than requested.`
      : "";
    const regenerateText = extraDocksRequestMismatch && !noteParts.length && !hasSelectionWarning
      ? " Regenerating may find a course with multiple docking bays."
      : (noteParts.length || hasSelectionWarning)
        ? " Regenerating may find a closer match."
        : "";
    fitNoteEl.textContent =
      `Closest match found.${extraDocksMismatchText}${mismatchText}${competitiveMismatchSentence}${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (presentationGenerationBestMatch && (checkpointPlacementAdvisory?.active || weakBoardCount > 0)) {
    const regenerateText = checkpointPlacementAdvisory?.active
      ? " Regenerating may find a closer match."
      : "";
    fitNoteEl.textContent = `Closest match found.${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (noteParts.length) {
    const rerollText = shouldSuggestReroll || checkpointPlacementAdvisory?.active
      ? " Regenerating may give a better match."
      : "";
    fitNoteEl.textContent = `Closest fit: this course is ${noteParts.join(" and ")} than requested.${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${rerollText}`;
    fitNoteEl.classList.remove("hidden");
  } else if (epicVeryLong || checkpointPlacementAdvisory?.active || weakBoardCount > 0 || hasSelectionWarning) {
    const regenerateText = checkpointPlacementAdvisory?.active
      ? " Regenerate if you prefer a more conventional layout."
      : "";
    fitNoteEl.textContent = `Course generated.${selectionWarningSentence}${epicLengthSentence}${checkpointPlacementSentence}${boardUseSentence}${regenerateText}`;
    fitNoteEl.classList.remove("hidden");
  } else {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
  }

  const autoOpenExplanation = courseNoteFacts.autoOpenExplanation;
  const explanationVisible = Boolean(
    courseExplanationState.userPinnedOpen ||
    (
      autoOpenExplanation &&
      courseExplanationState.manualClosedScenarioRef !== scenario
    )
  );
  if (explanationVisible) {
    explanationCopyEl.innerHTML = scenario.hydrationPresentationFallback && scenario.savedCourseNotesHtml
      ? scenario.savedCourseNotesHtml
      : buildCourseNotesHtml(presentationScenario, noteParts, {
        includeDiagnostics: Boolean(document.getElementById("dev-view")?.checked)
      });
  } else {
    // Course Notes are deliberately lazy: do not synthesize or retain prose
    // for a scenario the user has not opened.
    explanationCopyEl.innerHTML = "";
  }
  explanationPanelEl.classList.toggle("hidden", !explanationVisible);
  updateCourseNotesTogglePresentation(explanationToggleEl, explanationVisible);
  summary.classList.remove("hidden");
}

export function formatLegLabel(leg) {
  return leg.from === "dock" ? "Dock -> 1" : `${leg.from} -> ${leg.to}`;
}
