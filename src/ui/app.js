// Robo Rally Course Randomizer - app start-up: page wiring, generation runs, saved course, diagnostics
import { buildCourseNoteFacts } from "../../course-notes.js";
import { clearAnalysisCachesSafe, resetAnalysisTelemetrySafe } from "../generation/analysis-api.js";
import {
  ensureScenarioImages,
  getPlacementImagePieceIds,
  loadAssets,
  pruneImageCache
} from "../generation/assets.js";
import { validateSelectedInventory } from "../generation/candidate-builder.js";
import { DIAGNOSTIC_ATTEMPTS } from "../generation/config.js";
import { isDevViewEnabled, registerGenerationEnvironment } from "../generation/environment.js";
import {
  buildDiagnosticsCases,
  detectScenarioExplanationIssues,
  generateScenarioForPreferences,
  runProductionGeneration
} from "../generation/generation-loop.js";
import { getGenerationModeProfile } from "../generation/generation-modes.js";
import { getScenarioPresentationMetrics } from "../generation/labels.js";
import {
  SAVED_SCENARIO_APP_ID,
  SAVED_SCENARIO_SCHEMA_VERSION,
  buildSavedScenarioPresentationShell,
  hydrateScenarioFromSnapshot,
  serializeScenario
} from "../generation/persistence.js";
import {
  formatCooperativeRouteProgressStage,
  generationNow,
  nextEventLoopTurn,
  nextFrame
} from "../generation/scheduling.js";
import {
  boardAuditState,
  initializeBoardAudit,
  updateBoardAuditVisibility
} from "./board-audit.js";
import {
  applyPreferencesToControls,
  closeOptionalRulesDialog,
  closeVariantPicker,
  cycleActFastControlChoice,
  cycleBoardSpreadControl,
  cycleOverlayModeControl,
  cycleVariantControlState,
  filterOptionalRulesIndex,
  getPreferencesFromControls,
  openOptionalRulesDialog,
  pageGetAvailableConcretePreferenceValues,
  renderVariantControls,
  toggleVariantCategoryStates,
  updateExpansionSummary,
  updateVariantAvailability
} from "./controls.js";
import {
  applyDevViewAvailability,
  applyRouteInspection,
  clearRouteInspection,
  clearTraceStarts,
  devFrozenGenerationSeed,
  getCanvasTileFromEvent,
  getInspectableAtTile,
  getSelectedLegIndicesFromControl,
  pageIsDevFastAlternatesEnabled,
  pageIsDevFastTrafficEnabled,
  pageIsDevRouteModelOverrideActive,
  pageIsDevViewEnabled,
  selectAllTraceStarts,
  selectDefaultTraceStarts,
  setCourseEvaluationReportText,
  tileTouchesVisibleTrace,
  updateDevView
} from "./dev-view.js";
import { closeAboutDialog, openAboutDialog } from "./dialogs.js";
import {
  requestGenerationStop,
  setGeneratingOverlay,
  setGenerationRetainedCandidateProgress,
  setGenerationStopControlState
} from "./generation-overlay.js";
import {
  buildScenarioDevOverview,
  ensureScenarioAnimationLoop,
  lastRenderDiagnostics,
  renderScenario,
  renderScenarioKeepingMapInPlace
} from "./map-view.js";
import { buildScenarioBenchmarkSummary, buildScenarioReport } from "./reports.js";
import { courseExplanationState } from "./setup-summary.js";
import {
  currentScenario,
  generationStopRequested,
  mapFeatureHighlightEnabled,
  setCurrentScenario,
  setGenerationHasRetainableCandidate,
  setGenerationStopRequested,
  setIsGenerating,
  setLastScenarioRenderTime,
  setMapFeatureHighlightEnabled
} from "./state.js";
import { showToast } from "./toast.js";

// The page answers generation's few questions about its controls (Dev View
// switches, offered difficulty/length options); headless runs keep the defaults.
if (typeof document !== "undefined") {
  registerGenerationEnvironment({
    isDevViewEnabled: pageIsDevViewEnabled,
    isDevRouteModelOverrideActive: pageIsDevRouteModelOverrideActive,
    isDevFastTrafficEnabled: pageIsDevFastTrafficEnabled,
    isDevFastAlternatesEnabled: pageIsDevFastAlternatesEnabled,
    getAvailableConcretePreferenceValues: pageGetAvailableConcretePreferenceValues
  });
}

// Mobile browsers may auto-detect number-like rule text and restyle it as a
// tappable link even though the app emitted ordinary text. Keep rules/course
// annotations visually plain; this is presentation-only and does not disable
// any deliberate controls elsewhere in the UI.
function installMobilePlainTextGuards() {
  if (typeof document === "undefined") return;

  let formatMeta = document.querySelector('meta[name="format-detection"]');
  if (!formatMeta) {
    formatMeta = document.createElement("meta");
    formatMeta.setAttribute("name", "format-detection");
    document.head?.appendChild(formatMeta);
  }
  formatMeta.setAttribute(
    "content",
    "telephone=no,date=no,address=no,email=no,url=no"
  );

  if (!document.getElementById("mobile-plain-text-guard")) {
    const style = document.createElement("style");
    style.id = "mobile-plain-text-guard";
    style.textContent = `
      .rules-note a,
      .rules-note a:link,
      .rules-note a:visited,
      .rules-note a:hover,
      .rules-note a:active,
      .rules-note [x-apple-data-detectors],
      .rules-note [data-detected-address],
      .rules-note [data-detected-date],
      .rules-note [data-detected-phone] {
        color: inherit !important;
        text-decoration: none !important;
        font: inherit !important;
        letter-spacing: inherit !important;
        cursor: text !important;
      }
    `;
    document.head?.appendChild(style);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMobilePlainTextGuards, { once: true });
  } else {
    installMobilePlainTextGuards();
  }
}

const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";

function saveScenarioSnapshot(scenario) {
  try {
    localStorage.setItem(SAVED_SCENARIO_KEY, JSON.stringify(serializeScenario(scenario)));
  } catch {
    // ignore storage failures
  }
}

function loadScenarioSnapshot() {
  try {
    const raw = localStorage.getItem(SAVED_SCENARIO_KEY);
    if (!raw) {
      return null;
    }

    const snapshot = JSON.parse(raw);
    const compatible = (
      snapshot?.savedScenarioApp === SAVED_SCENARIO_APP_ID &&
      snapshot?.savedScenarioSchema === SAVED_SCENARIO_SCHEMA_VERSION
    );
    if (!compatible) {
      localStorage.removeItem(SAVED_SCENARIO_KEY);
      showToast("Saved course was from an incompatible version and was removed.");
      return null;
    }

    return snapshot;
  } catch {
    try {
      localStorage.removeItem(SAVED_SCENARIO_KEY);
    } catch {
      // ignore storage failures
    }
    showToast("Saved course data was invalid and was removed.");
    return null;
  }
}

async function runDiagnostics() {
  const button = document.getElementById("run-diagnostics");
  const assets = await loadAssets();
  const basePreferences = getPreferencesFromControls();
  const cases = buildDiagnosticsCases(basePreferences);
  const results = [];
  const previousScenario = currentScenario;

  button.disabled = true;
  document.getElementById("dev-view").checked = true;
  updateDevView();
  setCourseEvaluationReportText(`Running diagnostics across ${cases.length} cases...\n`);

  for (const [index, testCase] of cases.entries()) {
    setCourseEvaluationReportText(`Running diagnostics: case ${index + 1} of ${cases.length}\nCurrent: ${testCase.label}\n`);
    const inventoryError = validateSelectedInventory(assets, testCase.preferences);
    if (inventoryError) {
      results.push({
        label: testCase.label,
        issues: [`inventory:${inventoryError}`]
      });
      continue;
    }

    clearAnalysisCachesSafe();
    const generation = await generateScenarioForPreferences(assets, testCase.preferences, {
      maxAttempts: DIAGNOSTIC_ATTEMPTS
    });
    const issues = [];

    if (!generation.scenario) {
      issues.push(generation.lastAttemptError
        ? `generation-failed:${generation.lastAttemptError.message}`
        : "generation-failed");
      results.push({
        label: testCase.label,
        issues,
        attemptsUsed: generation.attemptsUsed
      });
      continue;
    }

    renderScenario(generation.scenario);

    if (lastRenderDiagnostics.blankFallbackTriggered) {
      issues.push("blank-render");
    }
    issues.push(...generation.scenario.metrics.hardFailures);
    issues.push(...detectScenarioExplanationIssues(generation.scenario));

    results.push({
      label: testCase.label,
      issues: [...new Set(issues)],
      attemptsUsed: generation.attemptsUsed,
      accepted: generation.accepted,
      fitScore: generation.scenario.metrics.fitScore
    });
  }

  setCurrentScenario(previousScenario);
  if (currentScenario) {
    renderScenario(currentScenario);
  }

  const failures = results.filter((item) => item.issues.length);
  const summaryLines = [
    `Diagnostics complete: ${results.length} cases`,
    `Failures: ${failures.length}`,
    ""
  ];

  if (failures.length) {
    failures.forEach((failure) => {
      summaryLines.push(`${failure.label}: ${failure.issues.join(", ")}${failure.fitScore !== undefined ? ` | fit ${failure.fitScore}` : ""}${failure.attemptsUsed ? ` | attempts ${failure.attemptsUsed}` : ""}`);
    });
  } else {
    summaryLines.push("No diagnostic issues detected in the sampled matrix.");
  }

  setCourseEvaluationReportText(summaryLines.join("\n"));
  button.disabled = false;
}

async function start() {
  const preferences = getPreferencesFromControls();
  const generationProfile = getGenerationModeProfile(preferences);
  const maxAttempts = generationProfile.maxAttempts;
  const generationUiStartedAt = generationNow();
  setGenerationStopRequested(false);
  setGenerationHasRetainableCandidate(false);
  setGenerationStopControlState(false);
  setIsGenerating(true);

  try {
    resetAnalysisTelemetrySafe();
    setGeneratingOverlay(
      true,
      "",
      {
        attempt: 1,
        maxAttempts,
        stage: "Loading course assets",
        preferences,
        generationStartedAt: generationUiStartedAt,
        acceptableCandidateTarget: generationProfile.acceptableCandidateTarget,
        acceptableCandidatesFound: 0
      }
    );
    await nextFrame();
    const assets = await loadAssets();
    initializeBoardAudit(assets);
    const inventoryError = validateSelectedInventory(assets, preferences);
    if (inventoryError) {
      window.alert(inventoryError);
      return;
    }

    const frozenTestSeed = Number.isInteger(devFrozenGenerationSeed)
      ? devFrozenGenerationSeed
      : null;
    let lastGenerationUiYieldAt = 0;
    const generation = await runProductionGeneration(assets, preferences, {
      seed: frozenTestSeed,
      maxAttempts,
      generationOptions: {
        shouldStopRequested: () => generationStopRequested,
        onRetainableCandidate: async ({ found, target }) => {
          setGenerationRetainedCandidateProgress(found, target);
          await nextFrame();
          lastGenerationUiYieldAt = generationNow();
        },
        onCooperativeProgress: (attempt, maxAttempts, stage = "", stageContext = null) => {
          setGeneratingOverlay(
            true,
            "",
            {
              attempt,
              maxAttempts,
              stage,
              preferences,
              stageContext
            }
          );
        },
        onProgress: async (attempt, maxAttempts, stage = "", stageContext = null) => {
          setGeneratingOverlay(
            true,
            "",
            {
              attempt,
              maxAttempts,
              stage,
              preferences,
              stageContext
            }
          );
          // v12: stage messages can arrive much faster than the display can use
          // them. Keep the DOM text current, but only force a render/yield at a
          // bounded cadence instead of pausing the CPU search for every message.
          const now = generationNow();
          if (now - lastGenerationUiYieldAt >= 300) {
            lastGenerationUiYieldAt = now;
            await nextFrame();
          }
        }
      }
    });

    if (!generation.scenario) {
      if (generation.terminationReason === "user-best-so-far") {
        showToast("No course found yet.");
      } else {
        window.alert(
          generation.crashedAttempts > 0 && generation.lastAttemptError
            ? `No playable course was found after ${generation.attemptsUsed} attempts. Last error: ${generation.lastAttemptError.message}`
            : `No playable course was found after ${generation.attemptsUsed} attempts.`
        );
      }
      return;
    }

    setCurrentScenario(generation.scenario);
    selectDefaultTraceStarts(currentScenario);
    clearRouteInspection();
    await ensureScenarioImages(assets, currentScenario);
    pruneImageCache(assets, [
      ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
      boardAuditState.pieceId
    ]);
    renderScenario(currentScenario);
    currentScenario.devPerformance = {
      ...(currentScenario.devPerformance ?? {}),
      generateClickToRenderMs: Math.max(0, generationNow() - generationUiStartedAt)
    };
    setCourseEvaluationReportText(
      buildScenarioDevOverview(currentScenario, getSelectedLegIndicesFromControl(currentScenario))
    );
    saveScenarioSnapshot(currentScenario);
    setLastScenarioRenderTime(performance.now());
  } finally {
    setIsGenerating(false);
    setGeneratingOverlay(false);
    setGenerationStopRequested(false);
    setGenerationHasRetainableCandidate(false);
    setGenerationStopControlState(false);
  }
}

if (typeof document !== "undefined") {
  document.getElementById("reroll").addEventListener("click", () => {
    start().catch(console.error);
  });

  document.getElementById("use-best-so-far")?.addEventListener("click", () => {
    requestGenerationStop();
  });

  document.getElementById("about-button").addEventListener("click", () => {
    openAboutDialog();
  });
  document.getElementById("canvas")?.addEventListener("click", (event) => {
    if (!currentScenario || !isDevViewEnabled()) return;
    const tile = getCanvasTileFromEvent(event);
    applyRouteInspection(getInspectableAtTile(currentScenario, tile));
    renderScenarioKeepingMapInPlace(currentScenario);
  });

  document.getElementById("canvas")?.addEventListener("dblclick", (event) => {
    if (!currentScenario || !isDevViewEnabled()) return;
    event.preventDefault();
    const tile = getCanvasTileFromEvent(event);
    const selectedLegIndices = getSelectedLegIndicesFromControl(currentScenario);
    if (tileTouchesVisibleTrace(currentScenario, tile, selectedLegIndices)) {
      selectAllTraceStarts(currentScenario);
    } else {
      clearTraceStarts();
      clearRouteInspection();
    }
    renderScenarioKeepingMapInPlace(currentScenario);
  });



  document.getElementById("run-diagnostics").addEventListener("click", () => {
    runDiagnostics().catch((error) => {
      setCourseEvaluationReportText(`Diagnostics failed: ${error.message}`);
      document.getElementById("run-diagnostics").disabled = false;
      console.error(error);
    });
  });

  async function copyTextToClipboard(text, button, idleLabel, errorContext = "text") {
    if (!text?.trim()) {
      return;
    }

    try {
      let copied = false;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          const plainText = new Blob([text], { type: "text/plain" });
          await navigator.clipboard.write([
            new ClipboardItem({ "text/plain": plainText })
          ]);
          copied = true;
        } catch (error) {
          console.debug("Explicit text/plain clipboard write unavailable; falling back", error);
        }
      }
      if (!copied && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) {
          throw new Error("Copy command was not available");
        }
      }

      if (button) {
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = idleLabel;
        }, 1400);
      }
    } catch (error) {
      console.warn(`Unable to copy ${errorContext}`, error);
      if (button) {
        button.textContent = "Copy failed";
        window.setTimeout(() => {
          button.textContent = idleLabel;
        }, 1800);
      }
    }
  }

  async function copyCourseEvaluationSummary() {
    if (!currentScenario) {
      return;
    }
    const button = document.getElementById("copy-course-evaluation-summary");
    const text = buildScenarioBenchmarkSummary(currentScenario);
    await copyTextToClipboard(text, button, "Copy summary", "Course Evaluation summary");
  }

  async function copyCourseEvaluationAll() {
    if (!currentScenario) return;
    const button = document.getElementById("copy-course-evaluation-all");
    if (button) button.textContent = "Building…";
    await nextFrame();
    const selectedLegIndices = getSelectedLegIndicesFromControl(currentScenario);
    const text = buildScenarioReport(currentScenario, selectedLegIndices);
    await copyTextToClipboard(text, button, "Copy all", "Course Evaluation");
    // Refresh only the cheap overview so the newly measured deep-report timing is
    // visible without leaving the expensive report resident in the DOM.
    setCourseEvaluationReportText(buildScenarioDevOverview(currentScenario, selectedLegIndices));
  }

  document.getElementById("copy-course-evaluation-summary")?.addEventListener("click", () => {
    copyCourseEvaluationSummary();
  });

  document.getElementById("copy-course-evaluation-all")?.addEventListener("click", () => {
    copyCourseEvaluationAll();
  });

  document.getElementById("about-close-icon").addEventListener("click", () => {
    closeAboutDialog();
  });

  document.getElementById("about-close-button").addEventListener("click", () => {
    closeAboutDialog();
  });

  document.getElementById("about-dialog").addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog) {
      closeAboutDialog();
    }
  });

  document.getElementById("leg-select").addEventListener("change", (event) => {
    const select = event.currentTarget;
    if (select && ![...select.options].some((option) => option.selected)) {
      [...select.options].forEach((option) => { option.selected = true; });
    }
    if (currentScenario) renderScenario(currentScenario);
  });

  document.getElementById("board-view-mode").addEventListener("change", () => {
    if (currentScenario) {
      renderScenario(currentScenario);
    }
  });

  document.getElementById("map-feature-highlight")?.addEventListener("click", () => {
    if (!currentScenario) return;
    setMapFeatureHighlightEnabled(!mapFeatureHighlightEnabled);
    renderScenario(currentScenario);
  });

  document.getElementById("course-explanation-toggle").addEventListener("click", () => {
    if (!currentScenario) {
      return;
    }

    const presentationMetrics = getScenarioPresentationMetrics(currentScenario);
    const presentationScenario = presentationMetrics === currentScenario.metrics
      ? currentScenario
      : { ...currentScenario, metrics: presentationMetrics };
    const autoOpen = buildCourseNoteFacts(presentationScenario).autoOpenExplanation;
    const currentlyVisible = Boolean(
      courseExplanationState.userPinnedOpen ||
      (
        autoOpen &&
        courseExplanationState.manualClosedScenarioRef !== currentScenario
      )
    );
    if (currentlyVisible) {
      // Closing an explicitly pinned panel ends the cross-generation preference.
      // Closing an auto-opened panel only suppresses it for this scenario.
      courseExplanationState.userPinnedOpen = false;
      courseExplanationState.manualClosedScenarioRef = currentScenario;
    } else {
      // An explicit open is a session preference: keep Course Notes open for
      // subsequent generated courses until the user closes the panel.
      courseExplanationState.userPinnedOpen = true;
      courseExplanationState.manualClosedScenarioRef = null;
    }
    renderScenario(currentScenario);
  });

  document.getElementById("dev-view").addEventListener("change", () => {
    updateDevView();
    if (currentScenario) {
      renderScenario(currentScenario);
    }
  });

  document.getElementById("board-audit-toggle").addEventListener("change", () => {
    updateBoardAuditVisibility();
  });

  function handleOptionalRuleControlClick(event) {
    const button = event.target.closest(".variant-state");
    if (!button) {
      return;
    }

    if (button.dataset.unavailableReason) {
      showToast(button.dataset.unavailableReason);
      return;
    }

    if (button.dataset.boardSpreadControl) {
      cycleBoardSpreadControl();
      return;
    }

    if (button.dataset.overlayControl) {
      cycleOverlayModeControl();
      return;
    }

    if (button.dataset.variantAction === "toggle-category") {
      toggleVariantCategoryStates(button.dataset.variantCategory);
      return;
    }

    if (button.dataset.variantId === "actFast") {
      cycleActFastControlChoice();
      return;
    }

    cycleVariantControlState(button.dataset.variantId);
  }

  document.querySelectorAll("[data-variant-menu]").forEach((menuEl) => {
    menuEl.addEventListener("click", handleOptionalRuleControlClick);
  });

  document.getElementById("optional-rules-index-list")?.addEventListener("click", handleOptionalRuleControlClick);
  document.getElementById("optional-rules-title")?.addEventListener("click", openOptionalRulesDialog);
  document.getElementById("optional-rules-close-icon")?.addEventListener("click", closeOptionalRulesDialog);
  document.getElementById("optional-rules-close-button")?.addEventListener("click", closeOptionalRulesDialog);
  document.getElementById("optional-rules-search")?.addEventListener("input", (event) => {
    filterOptionalRulesIndex(event.target.value);
  });
  document.getElementById("optional-rules-dialog")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeOptionalRulesDialog();
    }
  });

  document.getElementById("player-count")?.addEventListener("change", () => {
    updateVariantAvailability();
  });

  document.getElementById("expansion-roborally").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-30th-anniversary").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-rr-dice").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-master-builder").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-thrills-and-spills").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-chaos-and-carnage").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-wet-and-wild").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.getElementById("expansion-contamination").addEventListener("change", () => {
    updateExpansionSummary();
  });

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".variant-picker").forEach((picker) => {
      if (!picker.contains(event.target)) {
        picker.removeAttribute("open");
      }
    });
  });

  document.addEventListener("focusin", (event) => {
    document.querySelectorAll(".variant-picker").forEach((picker) => {
      if (!picker.contains(event.target)) {
        picker.removeAttribute("open");
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAboutDialog();
      closeOptionalRulesDialog();
      closeVariantPicker();
    }
  });

  async function init() {
    const assets = await loadAssets();
    initializeBoardAudit(assets);
    ensureScenarioAnimationLoop();
    renderVariantControls();
    updateExpansionSummary();
    applyDevViewAvailability();
    updateDevView();
    const snapshot = loadScenarioSnapshot();

    if (snapshot) {
      applyPreferencesToControls(snapshot.preferences);
      setGenerationStopRequested(false);
      setGenerationHasRetainableCandidate(false);
      setGenerationStopControlState(false);
      setIsGenerating(true);
      setGeneratingOverlay(true, "", {
        attempt: 1,
        maxAttempts: 1,
        stage: "Reanalyzing saved course",
        preferences: snapshot.preferences,
        generationStartedAt: generationNow(),
        acceptableCandidateTarget: 1,
        acceptableCandidatesFound: 0
      });
      await nextFrame();

      const savedShell = buildSavedScenarioPresentationShell(assets, snapshot, "pending");
      if (savedShell) {
        setCurrentScenario(savedShell);
        await ensureScenarioImages(assets, currentScenario);
        pruneImageCache(assets, [
          ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
          boardAuditState.pieceId
        ]);
        try {
          renderScenario(currentScenario);
        } catch (error) {
          console.warn("Saved-course presentation shell could not be rendered before reanalysis", error);
        }
      }

      let restoredScenario = null;
      let hydrationStopped = false;
      let hydrationFailed = false;
      try {
        restoredScenario = await hydrateScenarioFromSnapshot(assets, snapshot, {
          shouldStopRequested: () => generationStopRequested,
          onStage: async (stage) => {
            setGeneratingOverlay(true, "", {
              attempt: 1,
              maxAttempts: 1,
              stage: `Reanalyzing saved course — ${stage}`,
              preferences: snapshot.preferences
            });
            await nextEventLoopTurn();
          },
          onCooperativeProgress: async (progress) => {
            setGeneratingOverlay(true, "", {
              attempt: 1,
              maxAttempts: 1,
              stage: `Reanalyzing saved course — ${formatCooperativeRouteProgressStage(progress)}`,
              preferences: snapshot.preferences
            });
            await nextEventLoopTurn();
          }
        });
      } catch (error) {
        if (error?.code === "ANALYSIS_STOP_REQUESTED") {
          hydrationStopped = true;
        } else {
          hydrationFailed = true;
          console.error("Saved-course reanalysis failed", error);
        }
      } finally {
        setIsGenerating(false);
        setGeneratingOverlay(false);
        setGenerationStopRequested(false);
        setGenerationHasRetainableCandidate(false);
        setGenerationStopControlState(false);
      }

      if (!restoredScenario && savedShell) {
        restoredScenario = {
          ...savedShell,
          hydrationPresentationStatusReason: hydrationStopped ? "reanalysis-stopped" : "reanalysis-failed",
          hydrationReanalysisPending: false,
          hydrationReanalysisStopped: hydrationStopped,
          hydrationReanalysisFailed: hydrationFailed || !hydrationStopped
        };
      }
      if (restoredScenario) {
        setCurrentScenario(restoredScenario);
        selectDefaultTraceStarts(currentScenario);
        await ensureScenarioImages(assets, currentScenario);
        pruneImageCache(assets, [
          ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
          boardAuditState.pieceId
        ]);
        renderScenario(currentScenario);
        return;
      }
    }

    await start();
  }

  init().catch(console.error);

}
