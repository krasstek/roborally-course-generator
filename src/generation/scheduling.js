// Robo Rally Course Randomizer - yielding to the page during long work, and generation timing
export function nextFrame() {
  return new Promise((resolve) => {
    // Headless runs have no animation frames; a timer turn is the equivalent yield.
    if (typeof requestAnimationFrame !== "function") {
      globalThis.setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => {
      globalThis.setTimeout(resolve, 0);
    });
  });
}

export function nextEventLoopTurn() {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.scheduler?.yield === "function"
  ) {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}


export function generationNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function formatGenerationDuration(ms) {
  if (!Number.isFinite(ms)) return "0.0s";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function makeGenerationStopRequestedError(message = "Generation stop requested at a safe boundary.") {
  const error = new Error(message);
  error.code = "ANALYSIS_STOP_REQUESTED";
  return error;
}

// UI responsiveness fallback thresholds. Calibrated route-work wording below
// takes precedence whenever the generator has a checkpoint-known work estimate.
// Player-facing route ticker is intentionally low-frequency. Cooperative browser
// yields/search slices use a moderate 300 ms cadence below: frequent enough for
// Stop/UI responsiveness, but intentionally sparse enough that yielding remains
// a usability aid rather than a dominant source of wall-clock overhead.
export const GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS = 3200;
export const GENERATION_COOPERATIVE_YIELD_INTERVAL_MS = 300;
export const GENERATION_COOPERATIVE_SEARCH_SLICE_MS = 300;
export const GENERATION_COOPERATIVE_SEARCH_CHECK_POPS = 16;

export function formatCooperativeRouteProgressStage(progress = {}, tickerStep = 0) {
  const completedCount = Math.max(1, Math.floor(Number(progress.completedCount) || 1));
  const checkedLabel = `${completedCount} starting space${completedCount === 1 ? "" : "s"} checked`;

  if (progress.phase === "route-search-slice") {
    const step = Math.max(0, Math.floor(Number(tickerStep) || 0));
    const trafficSearch = String(progress.searchKind ?? "").includes("traffic");
    const phrases = trafficSearch
      ? [
          "Route comparison is still active",
          "Still checking a difficult alternative",
          "Continuing through the current alternative"
        ]
      : [
          "Route search is still active",
          "Still checking a difficult route",
          "Continuing through the current route"
        ];
    return `${trafficSearch ? "Comparing route options" : "Checking routes"} — ${phrases[step % phrases.length]}`;
  }
  if (progress.phase === "estimated-start") {
    return `Checking route possibilities — ${checkedLabel}`;
  }
  if (progress.phase === "realized-start") {
    return `Verifying playable routes — ${checkedLabel}`;
  }
  if (progress.phase === "traffic-start") {
    return `Comparing route options — ${checkedLabel}`;
  }
  if (progress.phase === "opening-start") {
    return `Checking opening routes — ${checkedLabel}`;
  }
  if (progress.phase === "later-leg-start") {
    const legNumber = Number.isInteger(progress.legIndex) ? progress.legIndex + 1 : null;
    return legNumber
      ? `Checking later routes — leg ${legNumber}, ${checkedLabel}`
      : `Checking later routes — ${checkedLabel}`;
  }
  return `Checking routes — ${checkedLabel}`;
}
