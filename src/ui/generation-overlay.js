// Robo Rally Course Randomizer - the Generating overlay: progress text, slow hints, Stop / best-so-far controls
import { getGenerationModeProfile } from "../generation/generation-modes.js";
import { generationNow } from "../generation/scheduling.js";
import { getGenerationConstraintHint } from "./setup-summary.js";
import {
  generationHasRetainableCandidate,
  generationStopRequested,
  isGenerating,
  setGenerationHasRetainableCandidate,
  setGenerationStopRequested
} from "./state.js";

export let generationOverlayState = {
  attempt: 1,
  maxAttempts: 1,
  stage: "",
  preferences: null,
  stageContext: null,
  semanticKey: "general",
  semanticStartedAt: 0,
  generationStartedAt: 0,
  acceptableCandidateTarget: 1,
  acceptableCandidatesFound: 0,
  slowTimerId: null
};

export const GENERATION_SLOW_STAGE_MS = Object.freeze({
  rehydrate: 2800,
  building: 4200,
  checkpoints: 3200,
  routes: 3200,
  alternatives: 2800,
  balance: 2800,
  economy: 2600,
  competitive: 2800,
  movingTargets: 2800,
  retry: 4200,
  finishing: 3000,
  general: 4200
});

// Coarse player-facing route-work wording from the closed v47 calibration.
// The checkpoint-known route-work diagnostics observed about 9.5k expansions at
// the median and 34.9k at p90. These bands are presentation only: they never
// change search budgets, proposal ranking, legality, acceptance, or timing.
export const V47_ROUTE_WORK_DISPLAY_BANDS = Object.freeze({
  medianExpansions: 9502,
  p90Expansions: 34912
});

export function getCalibratedRouteWorkOverlayHint(stage = "") {
  const match = String(stage || "").match(/~([0-9][0-9,]*)\s+route expansions/i);
  if (!match) return "";
  const predictedExpansions = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(predictedExpansions)) return "";

  if (predictedExpansions < V47_ROUTE_WORK_DISPLAY_BANDS.medianExpansions) {
    return "This layout looks fairly straightforward to check.";
  }
  if (predictedExpansions <= V47_ROUTE_WORK_DISPLAY_BANDS.p90Expansions) {
    return "";
  }
  return "This layout may take longer than usual to check.";
}

export function classifyGenerationStage(stage = "", stageContext = null) {
  const raw = String(stage || "").toLowerCase();
  if (raw.includes("reanalyzing saved course") || raw.includes("saved course reanalysis")) return "rehydrate";
  if (
    raw.includes("another course") || raw.includes("another checkpoint") ||
    raw.includes("no exact fit") || raw.includes("fallback") ||
    raw.includes("rejecting") || raw.includes("inconclusive")
  ) return "retry";
  if (raw.includes("loading") || raw.includes("setting up") || raw.includes("building") || raw.includes("layout")) return "building";
  if (raw.includes("checkpoint")) return stageContext?.movingTargets ? "movingTargets" : "checkpoints";
  if (raw.includes("subsid") || raw.includes("pricing") || raw.includes("pay to win")) return "economy";
  if (raw.includes("competitive")) return "competitive";
  if (raw.includes("alternate")) return "alternatives";
  if (raw.includes("fairness") || raw.includes("balanc") || raw.includes("removable")) return "balance";
  if (
    raw.includes("routing") || raw.includes("route") || raw.includes("starting spaces") ||
    raw.includes("preflight") || raw.includes("refining") || raw.includes("evaluating starting")
  ) return "routes";
  if (raw.includes("traffic")) return "alternatives";
  if (
    raw.includes("difficulty") || raw.includes("length") || raw.includes("final fit") ||
    raw.includes("final classification") || raw.includes("finalizing") ||
    raw.includes("guidance") || raw.includes("finishing") || raw.includes("candidate complete")
  ) return "finishing";
  return "general";
}

export function getGenerationSlowHint(key, stageContext = null) {
  if (stageContext?.movingTargets && (key === "movingTargets" || key === "routes" || key === "alternatives")) {
    return "Moving checkpoints give this layout a few more possibilities to check.";
  }
  if (stageContext?.competitiveMode && (key === "competitive" || key === "balance" || key === "routes")) {
    return "The extra starting choices are taking a little longer to compare.";
  }
  if ((stageContext?.payToWin || stageContext?.subsidizedStarts) && (key === "economy" || key === "balance" || key === "routes")) {
    return "The starting choices are taking a little longer to balance.";
  }
  if (stageContext?.recoveryRule === "dynamic_archiving" && key === "routes") {
    return "Flexible reboot choices give this layout a little more to check.";
  }
  if ((stageContext?.extraDocks || stageContext?.sandwichedDock) && (key === "routes" || key === "balance")) {
    return "Multiple starting areas give this layout more opening choices to compare.";
  }
  if (key === "rehydrate") return "The saved layout is being checked with the current routing model. You can stop and keep its last-saved presentation.";
  if (key === "alternatives") return "This layout has several plausible ways through the busy parts.";
  if (key === "routes") return "This layout has some tricky routes to check.";
  if (key === "balance" || key === "economy" || key === "competitive") return "This setup has several starting choices to compare.";
  if (key === "checkpoints" || key === "movingTargets") return "This layout has several checkpoint arrangements to consider.";
  if (key === "retry") return "Finding a close match is taking a few tries.";
  return "This course is taking a little longer to check.";
}

export function getGenerationUserFacingState(stage = "", options = {}) {
  const stageContext = options.stageContext ?? null;
  const key = options.key ?? classifyGenerationStage(stage, stageContext);
  const elapsedMs = Math.max(0, Number(options.elapsedMs) || 0);
  const slowThreshold = GENERATION_SLOW_STAGE_MS[key] ?? GENERATION_SLOW_STAGE_MS.general;
  const slow = elapsedMs >= slowThreshold;

  let heading = "Generating course";
  let activity = "Trying a course setup and checking that it plays well.";
  if (key === "rehydrate") {
    heading = "Reanalyzing saved course";
    activity = "Rebuilding route, traffic, and balance analysis for the saved layout.";
  } else if (key === "retry") {
    heading = "Trying another layout";
    activity = "The previous layout did not work out, so another one is being tried.";
  } else if (key === "building") {
    heading = "Building the course";
    activity = "Choosing boards and arranging the course.";
  } else if (key === "checkpoints") {
    heading = "Placing checkpoints";
    activity = "Choosing checkpoint positions that make a playable race.";
  } else if (key === "movingTargets") {
    heading = "Placing moving checkpoints";
    activity = "Checking where the moving checkpoints work well on this layout.";
  } else if (key === "routes") {
    heading = slow ? "Checking some tricky routes" : "Checking the routes";
    activity = "Making sure the course works well from the available starts.";
  } else if (key === "alternatives") {
    heading = "Comparing route options";
    activity = "Looking for useful alternatives where the racing lines may get busy.";
  } else if (key === "balance") {
    heading = "Balancing the starts";
    activity = "Checking that the available starting choices make sense together.";
  } else if (key === "economy") {
    heading = "Balancing the starting choices";
    activity = "Checking the Energy adjustments for the available starts.";
  } else if (key === "competitive") {
    heading = "Checking competitive starts";
    activity = "Comparing the extra starting choices used for blocking and selection.";
  } else if (key === "finishing") {
    heading = "Finishing the course";
    activity = "Checking the final difficulty, length, and setup.";
  }

  const rawStage = String(stage || "").toLowerCase();
  const checkpointProposalMatch = String(stage || "").match(/proposal\s+(\d+)\s*\/\s*(\d+)/i);
  const checkedStartsMatch = String(stage || "").match(/(\d+) starting spaces? checked/i);
  const checkedStarts = checkedStartsMatch ? Number(checkedStartsMatch[1]) : null;
  const cleanupPassMatch = String(stage || "").match(/pass\s+(\d+)/i);
  const cleanupPass = cleanupPassMatch ? Number(cleanupPassMatch[1]) : null;
  if (key === "rehydrate") {
    const detail = String(stage || "").split("—").slice(1).join("—").trim();
    activity = detail || "Rebuilding route, traffic, and balance analysis for the saved layout.";
  } else if (rawStage.includes("choosing checkpoints") && checkpointProposalMatch) {
    heading = "Placing checkpoints";
    activity = `Checking checkpoint option ${Number(checkpointProposalMatch[1])} of ${Number(checkpointProposalMatch[2])} for this layout.`;
  } else if (rawStage.includes("checking route possibilities") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Checking the routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for possible routes.`;
  } else if (rawStage.includes("verifying playable routes") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Verifying the routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for playable routes.`;
  } else if (rawStage.includes("comparing route options") && checkedStarts) {
    heading = "Comparing route options";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked for useful alternatives.`;
  } else if (rawStage.includes("checking opening routes") && checkedStarts) {
    heading = slow ? "Checking some tricky routes" : "Checking opening routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked.`;
  } else if (rawStage.includes("checking later routes") && checkedStarts) {
    const legMatch = String(stage || "").match(/leg\s+(\d+)/i);
    const legNumber = legMatch ? Number(legMatch[1]) : null;
    heading = slow ? "Checking some tricky routes" : "Checking later routes";
    activity = `${checkedStarts} starting space${checkedStarts === 1 ? "" : "s"} checked${legNumber ? ` on route leg ${legNumber}` : ""}.`;
  } else if (
    rawStage.startsWith("checking routes —") ||
    rawStage.startsWith("comparing route options —")
  ) {
    // Cooperative route-search slices are genuine liveness evidence, but they do
    // not represent a percentage or completed-start count. Surface their restrained
    // ticker text instead of collapsing back to the generic route-stage sentence.
    const detail = String(stage || "").split("—").slice(1).join("—").trim();
    if (detail) {
      activity = `${detail.charAt(0).toUpperCase()}${detail.slice(1)}${/[.!?]$/.test(detail) ? "" : "."}`;
    }
  } else if (rawStage.includes("balancing routed starting choices")) {
    heading = "Balancing the starts";
    const balancePassMatch = String(stage || "").match(/pass\s+(\d+)\s+complete/i);
    const balanceCountMatch = String(stage || "").match(/(\d+)\s+starts?\s+remain/i);
    const balancePass = balancePassMatch ? Number(balancePassMatch[1]) : null;
    const balanceCount = balanceCountMatch ? Number(balanceCountMatch[1]) : null;
    activity = Number.isFinite(balanceCount)
      ? `${balanceCount} routed starting choice${balanceCount === 1 ? "" : "s"} remain${balancePass ? ` after balance pass ${balancePass}` : ""}.`
      : "Balancing the routed starting choices.";
  } else if (rawStage.includes("route fairness and removable pieces")) {
    heading = "Cleaning up the course";
    activity = cleanupPass
      ? `Starting cleanup pass ${cleanupPass}.`
      : "Starting a cleanup pass.";
  } else if (rawStage.includes("removable docks")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking docking areas.`;
  } else if (rawStage.includes("removable boards")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking boards.`;
  } else if (rawStage.includes("removable overlays")) {
    heading = "Cleaning up the course";
    activity = `${cleanupPass ? `Cleanup pass ${cleanupPass}: ` : ""}checking overlays.`;
  } else if (rawStage.includes("cleanup pass")) {
    heading = "Cleaning up the course";
    activity = cleanupPass
      ? `Cleanup pass ${cleanupPass} complete.`
      : "Cleanup pass complete.";
  } else if (rawStage.includes("recomputing retained course guidance")) {
    heading = "Rechecking the course";
    activity = "Updating the retained layout guidance after cleanup.";
  } else if (rawStage.includes("recomputing retained checkpoint guidance")) {
    heading = "Rechecking the course";
    activity = "Updating checkpoint guidance for the retained layout.";
  } else if (rawStage.includes("final classification complete")) {
    heading = "Finishing the course";
    activity = "The final fit check is complete; preparing the course result.";
  } else if (rawStage.includes("finalizing course details")) {
    heading = "Finishing the course";
    activity = "Assembling the final course details.";
  }

  return {
    key,
    heading,
    activity,
    slow,
    calibratedWorkHint: getCalibratedRouteWorkOverlayHint(stage),
    slowHint: slow ? getGenerationSlowHint(key, stageContext) : ""
  };
}

export function setGenerationStopControlState(requested = false, hasRetainableCandidate = generationHasRetainableCandidate) {
  const button = document.getElementById("use-best-so-far");
  if (!button) return;
  button.disabled = Boolean(requested);
  button.textContent = requested
    ? "Stopping…"
    : hasRetainableCandidate
      ? "Use Best So Far"
      : "Stop";
  button.setAttribute("aria-disabled", requested ? "true" : "false");
}

export function setGenerationRetainedCandidateProgress(found, target) {
  generationOverlayState.acceptableCandidatesFound = Math.max(0, Math.floor(Number(found) || 0));
  generationOverlayState.acceptableCandidateTarget = Math.max(1, Math.floor(Number(target) || 1));
  setGenerationHasRetainableCandidate(generationOverlayState.acceptableCandidatesFound > 0);
  setGenerationStopControlState(generationStopRequested);
  renderGeneratingOverlayState();
}

export function requestGenerationStop() {
  if (!isGenerating || generationStopRequested) return;
  setGenerationStopRequested(true);
  setGenerationStopControlState(true);
}

export function updateGeneratingOverlayText(element, text) {
  if (!element || element.textContent === text) return;
  element.textContent = text;
  element.classList.remove("overlay-copy-refresh");
  void element.offsetWidth;
  element.classList.add("overlay-copy-refresh");
}

export function renderGeneratingOverlayState() {
  const overlay = document.getElementById("generating-overlay");
  if (!overlay?.classList.contains("visible")) return;

  const now = generationNow();
  const elapsedMs = Math.max(0, now - (generationOverlayState.semanticStartedAt || now));
  const userState = getGenerationUserFacingState(
    generationOverlayState.stage,
    {
      key: generationOverlayState.semanticKey,
      elapsedMs,
      stageContext: generationOverlayState.stageContext
    }
  );
  const headingEl = document.getElementById("overlay-heading");
  const attemptEl = document.getElementById("overlay-attempt");
  const activityEl = document.getElementById("overlay-text");
  const hintEl = document.getElementById("overlay-hint");

  updateGeneratingOverlayText(headingEl, userState.heading);
  if (attemptEl) {
    attemptEl.textContent = generationOverlayState.semanticKey === "rehydrate"
      ? "Saved course"
      : `Course attempt ${Math.max(1, generationOverlayState.attempt)} / ${generationOverlayState.maxAttempts}`;
  }
  updateGeneratingOverlayText(activityEl, userState.activity);
  if (hintEl) {
    const hint = userState.calibratedWorkHint || userState.slowHint || getGenerationConstraintHint(generationOverlayState.preferences ?? {});
    updateGeneratingOverlayText(hintEl, hint);
    hintEl.classList.toggle("hidden", !hint);
  }
}

export function scheduleGeneratingOverlaySlowRefresh() {
  if (generationOverlayState.slowTimerId !== null) {
    window.clearTimeout(generationOverlayState.slowTimerId);
    generationOverlayState.slowTimerId = null;
  }
  const key = generationOverlayState.semanticKey;
  const threshold = GENERATION_SLOW_STAGE_MS[key] ?? GENERATION_SLOW_STAGE_MS.general;
  const startedAt = generationOverlayState.semanticStartedAt;
  generationOverlayState.slowTimerId = window.setTimeout(() => {
    if (
      generationOverlayState.semanticKey === key &&
      generationOverlayState.semanticStartedAt === startedAt
    ) {
      renderGeneratingOverlayState();
    }
  }, threshold + 40);
}

export function setGeneratingOverlay(visible, text = "", details = {}) {
  const overlay = document.getElementById("generating-overlay");
  if (!overlay) return;

  overlay.classList.toggle("visible", visible);
  if (!visible) {
    if (generationOverlayState.slowTimerId !== null) {
      window.clearTimeout(generationOverlayState.slowTimerId);
    }
    generationOverlayState.slowTimerId = null;
    return;
  }

  const now = generationNow();
  const attempt = details.attempt ?? generationOverlayState.attempt ?? 1;
  const stage = details.stage ?? generationOverlayState.stage ?? text;
  const stageContext = details.stageContext !== undefined
    ? details.stageContext
    : generationOverlayState.stageContext ?? null;
  const semanticKey = classifyGenerationStage(stage, stageContext);
  const attemptChanged = attempt !== generationOverlayState.attempt;
  const semanticChanged = semanticKey !== generationOverlayState.semanticKey;

  generationOverlayState = {
    ...generationOverlayState,
    ...details,
    attempt,
    maxAttempts: details.maxAttempts ?? generationOverlayState.maxAttempts ?? getGenerationModeProfile(details.preferences ?? generationOverlayState.preferences ?? {}).maxAttempts,
    stage,
    preferences: details.preferences ?? generationOverlayState.preferences ?? {},
    stageContext,
    semanticKey,
    semanticStartedAt: attemptChanged || semanticChanged || !generationOverlayState.semanticStartedAt
      ? now
      : generationOverlayState.semanticStartedAt,
    generationStartedAt: details.generationStartedAt ?? generationOverlayState.generationStartedAt ?? now,
    acceptableCandidateTarget: details.acceptableCandidateTarget ?? generationOverlayState.acceptableCandidateTarget ?? 1,
    acceptableCandidatesFound: details.acceptableCandidatesFound ?? generationOverlayState.acceptableCandidatesFound ?? 0,
    slowTimerId: generationOverlayState.slowTimerId
  };

  renderGeneratingOverlayState();
  scheduleGeneratingOverlaySlowRefresh();
}
