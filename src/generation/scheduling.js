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
