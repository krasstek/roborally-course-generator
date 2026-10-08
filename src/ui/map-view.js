// Robo Rally Course Randomizer - map view: canvas rendering and animation, trace pickers, key-space highlight, Dev overview
import { render } from "../../render.js";
import { getPlayableCheckpoints } from "../generation/checkpoints.js";
import { formatDevMilliseconds } from "../generation/dev-replay.js";
import { isDevViewEnabled } from "../generation/environment.js";
import { isMiniOverlayPiece } from "../generation/layout-geometry.js";
import { formatStartBalanceLabel, normalizeStartBalance } from "../generation/start-balance.js";
import { BOARD_VIEW_MODES, getBoardViewMode } from "./board-audit.js";
import { MAIN_BUILD_ID } from "./build-info.js";
import {
  clearRouteInspection,
  getSelectedLegIndicesFromControl,
  getSelectedTraceRoutes,
  getTraceableStartIndices,
  normalizeSelectedLegIndices,
  setCourseEvaluationReportText,
  setTraceSelectionState,
  traceSelectionState,
  updateDevStartResidualTable,
  updateDevView,
  updateInspectionDetail
} from "./dev-view.js";
import { buildScenarioBenchmarkSummary } from "./reports.js";
import { hasMovingTargetsEffect, updateLegend, updateRulesNote } from "./rules-notes.js";
import { formatLegLabel, updateSetupSummary } from "./setup-summary.js";
import {
  currentScenario,
  isGenerating,
  lastScenarioRenderTime,
  mapFeatureHighlightEnabled,
  setLastScenarioRenderTime
} from "./state.js";

export const SCENARIO_RENDER_INTERVAL_MS = 125;

export let scenarioAnimationFrameId = null;

export let lastRenderDiagnostics = {
  blankFallbackTriggered: false
};

export function canvasHasVisibleCourse(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return false;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return false;
  }

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelStride = Math.max(1, Math.floor((data.length / 4) / 4000));

  for (let index = 0; index < data.length; index += pixelStride * 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];

    if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) {
      return true;
    }
  }

  return false;
}

export function drawCanvasFailureNotice(canvas, message) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  canvas.width = 880;
  canvas.height = 220;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f7f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#2a333a";
  ctx.font = "bold 26px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Course Render Failed", 36, 68);

  ctx.fillStyle = "#58636c";
  ctx.font = "16px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(message, 36, 108);

  ctx.fillStyle = "#7a4e00";
  ctx.font = "bold 15px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Try rerolling. If it happens again, inspect the generated scenario.", 36, 152);
}


export function getTracePickerSummary(prefix, selectedLabels, totalCount) {
  const lead = prefix ? `${prefix}: ` : "";
  if (!totalCount) return `${lead}None`;
  if (selectedLabels.length === totalCount) return `${lead}All (${totalCount})`;
  if (!selectedLabels.length) return `${lead}None`;
  if (selectedLabels.length <= 3) return `${lead}${selectedLabels.join(", ")}`;
  return `${lead}${selectedLabels.length}/${totalCount}`;
}

export function styleDevPicker(details) {
  // Reuse the app's existing Sets / Optional Rules picker visual language.
  // The Dev pickers intentionally do not maintain a separate inline-styled UI.
  details.removeAttribute("style");
  details.className = "variant-picker dev-trace-picker";
}

export function createDevPickerPanel() {
  const panel = document.createElement("div");
  panel.className = "variant-menu dev-trace-menu";
  return panel;
}

export function ensureTraceLegPicker(scenario, legOptions) {
  const select = document.getElementById("leg-select");
  const parent = select?.parentElement;
  if (!select || !parent || !isDevViewEnabled()) {
    document.getElementById("trace-leg-picker")?.remove();
    return;
  }

  let details = document.getElementById("trace-leg-picker");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    details = document.createElement("details");
    details.id = "trace-leg-picker";
    parent.insertBefore(details, select);
  }
  details.replaceChildren();
  details.open = wasOpen;
  styleDevPicker(details);

  const selectedValues = new Set([...select.options].filter((option) => option.selected).map((option) => option.value));
  const selectedLabels = legOptions.filter((option) => selectedValues.has(option.value)).map((option) => option.label);
  const summary = document.createElement("summary");
  summary.textContent = getTracePickerSummary("", selectedLabels, legOptions.length);
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  details.append(summary);

  const panel = createDevPickerPanel();

  legOptions.forEach((option) => {
    const label = document.createElement("label");
    label.className = "variant-option dev-trace-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedValues.has(option.value);
    checkbox.addEventListener("change", () => {
      const target = [...select.options].find((item) => item.value === option.value);
      if (target) target.selected = checkbox.checked;
      // Preserve the established invariant that Trace Leg never has an accidental
      // empty state: if the last box is cleared, restore it immediately.
      if (![...select.options].some((item) => item.selected)) {
        if (target) target.selected = true;
      }
      if (currentScenario) renderScenarioKeepingMapInPlace(currentScenario);
    });
    label.append(checkbox, document.createTextNode(option.label));
    panel.append(label);
  });
  details.append(panel);
}

export function ensureTraceStartPicker(scenario) {
  const legSelect = document.getElementById("leg-select");
  const parent = document.getElementById("trace-start-picker-host") ?? legSelect?.parentElement;
  if (!legSelect || !parent || !isDevViewEnabled()) {
    document.getElementById("trace-start-picker")?.remove();
    return;
  }

  const traceableIndices = getTraceableStartIndices(scenario);
  if (!traceableIndices.length) {
    document.getElementById("trace-start-picker")?.remove();
    return;
  }

  let details = document.getElementById("trace-start-picker");
  const wasOpen = Boolean(details?.open);
  if (!details) {
    details = document.createElement("details");
    details.id = "trace-start-picker";
    if (parent === legSelect.parentElement) {
      parent.insertBefore(details, legSelect);
    } else {
      parent.append(details);
    }
  }
  details.replaceChildren();
  details.open = wasOpen;
  styleDevPicker(details);

  const selected = traceableIndices.filter((index) => traceSelectionState.startIndices.has(index));
  const selectedLabels = selected.map((index) => `#${index + 1}`);
  const summary = document.createElement("summary");
  summary.textContent = getTracePickerSummary("", selectedLabels, traceableIndices.length);
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  details.append(summary);

  const panel = createDevPickerPanel();

  traceableIndices.forEach((startIndex) => {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const start = startAnalysis?.start;
    const label = document.createElement("label");
    label.className = "variant-option dev-trace-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = traceSelectionState.startIndices.has(startIndex);
    checkbox.addEventListener("change", () => {
      const next = new Set(traceSelectionState.startIndices);
      if (checkbox.checked) next.add(startIndex);
      else next.delete(startIndex);
      setTraceSelectionState({ startIndices: next });
      // Changing the visible-start set returns Course Evaluation to its
      // selection-owned route detail/summary instead of leaving a checkpoint
      // inspection pinned beside a new route selection.
      clearRouteInspection();
      if (currentScenario) renderScenarioKeepingMapInPlace(currentScenario);
    });
    const status = startAnalysis?.reachable && startAnalysis?.fullCourseRoute ? "" : " (unavailable)";
    const coords = start ? ` (${start.x},${start.y})` : "";
    label.append(checkbox, document.createTextNode(`Start ${startIndex + 1}${coords}${status}`));
    panel.append(label);
  });
  details.append(panel);
}

export function getMapFeatureHighlightTargets(scenario) {
  const checkpointCount = getPlayableCheckpoints(
    scenario?.checkpoints ?? [],
    Boolean(scenario?.virtualBots)
  ).length;
  const overlayTileCount = (scenario?.placements ?? []).filter((placement) => (
    placement?.overlay && isMiniOverlayPiece(scenario?.pieceMap?.[placement.pieceId])
  )).length;
  const rebootTokenCount = (scenario?.rebootTokens ?? []).length;
  // No Docks and Virtual Bots replace the docks with fixed starting spaces.
  const fixedStartCount = scenario?.virtualBots
    ? (scenario.virtualBotEntry ? 1 : 0)
    : scenario?.noDocks
      ? (scenario.activeStarts ?? []).length
      : 0;

  return {
    checkpointCount,
    overlayTileCount,
    rebootTokenCount,
    fixedStartCount,
    hasTargets: checkpointCount > 0 || overlayTileCount > 0 || rebootTokenCount > 0 || fixedStartCount > 0
  };
}

export function updateMapFeatureHighlightControl(scenario) {
  const controls = document.getElementById("map-highlight-controls");
  const button = document.getElementById("map-feature-highlight");
  if (!controls || !button) return;

  const targets = getMapFeatureHighlightTargets(scenario);
  controls.classList.toggle("hidden", !targets.hasTargets);
  if (!targets.hasTargets) {
    button.setAttribute("aria-pressed", "false");
    return;
  }

  const active = Boolean(mapFeatureHighlightEnabled);
  button.setAttribute("aria-pressed", active ? "true" : "false");

  if (active) {
    button.textContent = "Show full board";
    button.title = "Restore the board to normal brightness.";
    button.setAttribute("aria-label", "Show full board");
    return;
  }

  const targetNames = [
    targets.checkpointCount > 0 ? "checkpoints" : null,
    targets.rebootTokenCount > 0 ? "reboot tokens" : null,
    targets.fixedStartCount > 0 ? "starting spaces" : null,
    targets.overlayTileCount > 0 ? "overlay tiles" : null
  ].filter(Boolean);
  // A short label keeps the button narrow on phones; the tooltip lists everything.
  const label = targetNames.length === 1 ? `Highlight ${targetNames[0]}` : "Highlight key spaces";
  const targetDescription = targetNames.length > 1
    ? `${targetNames.slice(0, -1).join(", ")} and ${targetNames.at(-1)}`
    : targetNames[0];

  button.textContent = label;
  button.title = `Dim the rest of the course so ${targetDescription} are easier to spot.`;
  button.setAttribute("aria-label", label);
}

export function getScenarioRenderState(scenario) {
  const devViewEnabled = isDevViewEnabled();
  const selectedLegIndices = devViewEnabled
    ? getSelectedLegIndicesFromControl(scenario)
    : normalizeSelectedLegIndices(scenario, null);
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const lastSelectedLegIndex = selectedLegIndices.length
    ? Math.max(...selectedLegIndices)
    : Math.max(0, playableCheckpoints.length - 1);
  const goal = playableCheckpoints[lastSelectedLegIndex] ?? playableCheckpoints.at(-1) ?? playableCheckpoints[0];
  const renderAnalysis = devViewEnabled ? { routes: getSelectedTraceRoutes(scenario, selectedLegIndices) } : null;
  const boardViewMode = getBoardViewMode();
  const iconBoardView = boardViewMode === BOARD_VIEW_MODES.icons;
  // v49am reload fidelity: an incomplete/stopped/failed saved-course reanalysis is
  // not authoritative evidence that previously accepted starting spaces disappeared.
  // The snapshot already preserves the accepted active field + blocked disposition, so
  // keep rendering that saved disposition until hydration is structurally complete.
  const preserveSavedStartDisposition = Boolean(
    scenario.hydrationPresentationFallback ||
    scenario.hydrationPresentationUnavailable ||
    scenario.hydrationReanalysisPending ||
    scenario.hydrationReanalysisStopped ||
    scenario.hydrationReanalysisFailed
  );
  const metricUnusableStartIndices = (
    scenario.competitiveMode ||
    preserveSavedStartDisposition ||
    scenario.hydrationStartDispositionRestored
  )
    ? []
    : scenario.sequence.firstLeg.starts
      .filter((startAnalysis) => !scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index))
      .map((startAnalysis) => startAnalysis.index);
  const competitiveDevBlockIndices = (
    devViewEnabled && scenario.competitiveMode
      ? (scenario.startDisposition?.competitiveStrategicBlockIndices ?? [])
      : []
  );
  const unusableStartIndices = [...new Set([
    ...(scenario.blockedStartIndices ?? []),
    ...metricUnusableStartIndices,
    ...competitiveDevBlockIndices
  ])].sort((left, right) => left - right);
  // Number the physical start field, not merely the analyzed subset. Accepted
  // courses resolve every physical start to available or blocked, so Dev View
  // never needs the old unlabeled "S" fallback.
  const startNumberByKey = new Map(scenario.activeStarts.map((start, index) => [
    `${start.x},${start.y}`, index + 1
  ]));
  const energyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.energyCost
  ]));
  const lateEnergyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateEnergyCost
  ]));
  const earlyUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.earlyUnavailable ?? false
  ]));
  const lateUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateUnavailable ?? false
  ]));
  const selectedStartKeys = new Set(
    scenario.sequence.firstLeg.starts
      .filter((startAnalysis) => traceSelectionState.startIndices.has(startAnalysis.index))
      .map((startAnalysis) => `${startAnalysis.start.x},${startAnalysis.start.y}`)
  );
  const competitiveExpectedSelectedIndices = new Set(
    devViewEnabled && scenario.competitiveMode
      ? (scenario.startDisposition?.competitiveSelectedIndices ??
        scenario.sequence.firstLeg?.summary?.competitiveStartBalance?.selectedIndices ?? [])
      : []
  );
  const startLabels = devViewEnabled
    ? scenario.activeStarts.map((start, index) => {
      const number = startNumberByKey.get(`${start.x},${start.y}`) ?? "";
      return competitiveExpectedSelectedIndices.has(index) ? `${number}★` : number;
    })
    : [];
  const selectedStartIndices = devViewEnabled
    ? scenario.activeStarts
      .map((start, index) => selectedStartKeys.has(`${start.x},${start.y}`) ? index : null)
      .filter((index) => index !== null)
    : [];
  const startEnergyPricing = Boolean(scenario.payToWin || scenario.subsidizedStarts);
  const startEnergyCosts = startEnergyPricing
    ? scenario.activeStarts.map((start) => energyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startLateEnergyCosts = startEnergyPricing
    ? scenario.activeStarts.map((start) => lateEnergyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startEarlyUnavailable = startEnergyPricing
    ? scenario.activeStarts.map((start) => earlyUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];
  const startLateUnavailable = startEnergyPricing
    ? scenario.activeStarts.map((start) => lateUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];

  const highlightTargets = getMapFeatureHighlightTargets(scenario);

  return {
    devViewEnabled, goal, iconBoardView, renderAnalysis, selectedLegIndices,
    startLabels, selectedStartIndices, startEnergyCosts, startLateEnergyCosts,
    startEarlyUnavailable, startLateUnavailable,
    startEnergyIsSubsidy: Boolean(scenario.subsidizedStarts), unusableStartIndices,
    highlightMapFeatures: Boolean(mapFeatureHighlightEnabled && highlightTargets.hasTargets)
  };
}

export function drawScenarioCanvas(scenario, options = {}) {
  if (!options.skipBlankCheck) {
    lastRenderDiagnostics.blankFallbackTriggered = false;
  }
  const {
    devViewEnabled,
    goal,
    iconBoardView,
    renderAnalysis,
    selectedLegIndices,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    startEnergyIsSubsidy,
    unusableStartIndices,
    highlightMapFeatures
  } = getScenarioRenderState(scenario);
  const canvas = document.getElementById("canvas");
  const renderOptions = {
    placements: scenario.placements,
    goal,
    analysis: renderAnalysis,
    goals: getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots),
    virtualBotEntry: scenario.virtualBots ? scenario.virtualBotEntry : null,
    reentryMarkers: hasMovingTargetsEffect(scenario) ? scenario.movingTargetReentryMarkers : [],
    // Moving-target path/timeline data is a Dev-only visualization. Normal view
    // keeps only the playable checkpoint plus its entry/re-entry marker; do not
    // even pass hidden path coordinates to the renderer, since they otherwise
    // expand canvas bounds despite the path itself being visually suppressed.
    movingTargetTimelines: devViewEnabled && hasMovingTargetsEffect(scenario)
      ? scenario.movingTargetTimelines
      : [],
    showMovingTargetDetails: devViewEnabled,
    showMovingTargetHits: devViewEnabled,
    starts: scenario.virtualBots ? [] : scenario.activeStarts,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    startEnergyIsSubsidy,
    rebootTokens: scenario.rebootTokens,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    edgeOutlineColor: scenario.lessDeadlyGame ? "#f2c230" : null,
    showBoardLabels: false,
    showStartFacing: devViewEnabled,
    showAllStartMarkers: devViewEnabled && !scenario.virtualBots,
    noDockStarts: Boolean(scenario.noDocks),
    // No-Docks normal view shows only playable starting spaces. Pricing labels belong
    // on the retained choices; prohibited/pruned physical edge spaces remain Dev-only.
    hideUnusableStarts: Boolean(scenario.noDocks && !devViewEnabled),
    showWalls: iconBoardView || devViewEnabled,
    showPieceImages: !iconBoardView,
    showFootprints: true,
    showFeatureIcons: iconBoardView,
    highlightMapFeatures
  };

  render(canvas, scenario.pieceMap, scenario.imageMap, renderOptions);

  if (!options.skipBlankCheck && !canvasHasVisibleCourse(canvas)) {
    render(canvas, scenario.pieceMap, scenario.imageMap, {
      ...renderOptions,
      showBoardLabels: false,
      showStartFacing: true,
      showWalls: true,
      showPieceImages: false,
      showFeatureIcons: true
    });

    if (!canvasHasVisibleCourse(canvas)) {
      console.warn("Scenario rendered blank", {
        preferences: scenario.preferences,
        placements: scenario.placements,
        checkpoints: scenario.checkpoints,
        boardCount: scenario.boardCount
      });
      lastRenderDiagnostics.blankFallbackTriggered = true;
      drawCanvasFailureNotice(canvas, "The generated course data could not be drawn to the board canvas.");
    }
  }

  return { devViewEnabled, selectedLegIndices };
}

export function ensureScenarioAnimationLoop() {
  if (scenarioAnimationFrameId !== null) {
    return;
  }

  const tick = () => {
    scenarioAnimationFrameId = requestAnimationFrame(tick);
    if (!currentScenario || document.hidden || isGenerating) {
      return;
    }
    const now = performance.now();
    if (now - lastScenarioRenderTime < SCENARIO_RENDER_INTERVAL_MS) {
      return;
    }
    setLastScenarioRenderTime(now);
    drawScenarioCanvas(currentScenario, { skipBlankCheck: true });
  };

  scenarioAnimationFrameId = requestAnimationFrame(tick);
}

export function buildScenarioDevOverview(scenario, selectedLegIndices) {
  const normalizedLegs = normalizeSelectedLegIndices(scenario, selectedLegIndices);
  const legLabels = normalizedLegs.map((index) => formatLegLabel(scenario.sequence.legs[index]));
  const deepMs = Number(scenario?.devPerformance?.lastDeepReportMs);
  const renderMs = Number(scenario?.devPerformance?.lastRenderMs);
  const ledgerMs = Number(scenario?.devPerformance?.lastLedgerReplayMs);
  const cheapShadowMs = Number(scenario?.devPerformance?.lastCheapShadowMs);
  const damageFoundationMs = Number(scenario?.devPerformance?.lastDamageFoundationMs);
  const clickToRenderMs = Number(scenario?.devPerformance?.generateClickToRenderMs);
  const lines = [
    "Course Evaluation — quick Dev overview",
    `UI build: ${MAIN_BUILD_ID}`,
    `Start balance: ${formatStartBalanceLabel(scenario.preferences?.startBalance)} (${normalizeStartBalance(scenario.preferences?.startBalance)})`,
    `Trace legs: ${legLabels.length === scenario.sequence.legs.length ? "all real legs" : legLabels.join(", ") || "all real legs"}`,
    "Deep per-route/register replay is lazy. Click a start for structured route detail; use Copy All for the full event-level diagnostic ledger.",
    `Automatic v49cd targeted card-pressure search: disabled (the capped experiment is closed as inconclusive).`,
    Number.isFinite(clickToRenderMs) ? `Generate click → first rendered course: ${formatDevMilliseconds(clickToRenderMs)}` : null,
    Number.isFinite(renderMs) ? `Last Dev render: ${formatDevMilliseconds(renderMs)}` : null,
    Number.isFinite(deepMs)
      ? `Last deep Copy All build: ${formatDevMilliseconds(deepMs)} (RE ledgers ${formatDevMilliseconds(ledgerMs)}, cheap-card shadows ${formatDevMilliseconds(cheapShadowMs)}, damage foundation ${formatDevMilliseconds(damageFoundationMs)})`
      : null,
    "",
    buildScenarioBenchmarkSummary(scenario)
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// Dev View taps re-render the whole scenario, which rebuilds the pickers above
// the map and the panels around it. On phones a change in their height shifted
// the map under the user's finger; this keeps the map where it was on screen.
export function renderScenarioKeepingMapInPlace(scenario) {
  const canvas = document.getElementById("canvas");
  const topBefore = canvas?.getBoundingClientRect().top;
  renderScenario(scenario);
  const topAfter = canvas?.getBoundingClientRect().top;
  if (Number.isFinite(topBefore) && Number.isFinite(topAfter) && Math.abs(topAfter - topBefore) > 1) {
    window.scrollBy(0, topAfter - topBefore);
  }
}

export function renderScenario(scenario) {
  const renderStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  updateDevView();
  updateSetupSummary(scenario);
  updateRulesNote(scenario);
  updateLegend(scenario);
  updateMapFeatureHighlightControl(scenario);
  const legSelect = document.getElementById("leg-select");
  const legOptions = scenario.sequence.legs.map((leg, index) => ({
    value: String(index),
    label: index === 0 ? (scenario.virtualBots ? "Entry → 1" : "Start → 1") : `${leg.from} → ${leg.to}`
  }));
  const previousSelectedValues = legSelect
    ? [...legSelect.options].filter((option) => option.selected).map((option) => option.value)
    : [];
  if (legSelect) {
    // v49cg keeps the native multi-select as an internal state carrier, while a
    // compact checkbox dropdown provides the visible interaction. This avoids
    // platform-specific Command/Ctrl multi-select behavior without changing the
    // existing selection semantics.
    legSelect.multiple = true;
    legSelect.size = Math.max(2, Math.min(6, legOptions.length));
    legSelect.setAttribute("aria-label", "Trace legs (internal state)");
    legSelect.style.display = "none";
    legSelect.innerHTML = "";
    const retainedSelection = new Set(previousSelectedValues.filter((value) =>
      legOptions.some((option) => option.value === value)
    ));
    legOptions.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      el.selected = retainedSelection.size ? retainedSelection.has(option.value) : true;
      legSelect.appendChild(el);
    });
  }
  ensureTraceLegPicker(scenario, legOptions);
  ensureTraceStartPicker(scenario);
  const canvasStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  const renderState = drawScenarioCanvas(scenario);
  const canvasMs = Number.isFinite(canvasStartedAt) ? performance.now() - canvasStartedAt : 0;
  updateInspectionDetail(scenario, renderState.selectedLegIndices);
  updateDevStartResidualTable(scenario);
  const overviewStartedAt = typeof performance !== "undefined" ? performance.now() : NaN;
  setCourseEvaluationReportText(
    buildScenarioDevOverview(scenario, renderState.selectedLegIndices)
  );
  const overviewMs = Number.isFinite(overviewStartedAt) ? performance.now() - overviewStartedAt : 0;
  const renderMs = Number.isFinite(renderStartedAt) ? performance.now() - renderStartedAt : 0;
  scenario.devPerformance = {
    ...(scenario.devPerformance ?? {}),
    lastRenderMs: renderMs,
    lastCanvasMs: canvasMs,
    lastOverviewMs: overviewMs
  };
}
