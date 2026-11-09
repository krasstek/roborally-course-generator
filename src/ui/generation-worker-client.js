// Robo Rally Course Randomizer - page side of the generation worker
// (src/generation/generation-worker.js). Same call shape as
// runProductionGeneration, so the Generate handler can use either. Falls back
// to running on the page when a module worker cannot be started.
import { VERSION_SUFFIX } from "../generation/assets.js";
import {
  getAvailableConcretePreferenceValues,
  isDevFastAlternatesEnabled,
  isDevFastTrafficEnabled,
  isDevRouteModelOverrideActive,
  isDevViewEnabled
} from "../generation/environment.js";
import { runProductionGeneration } from "../generation/generation-loop.js";

let worker = null;
let workerUnavailable = false;

function getWorker() {
  if (worker || workerUnavailable) return worker;
  try {
    const url = new URL(`../generation/generation-worker.js${VERSION_SUFFIX}`, import.meta.url);
    worker = new Worker(url, { type: "module" });
  } catch (error) {
    console.warn("Generation worker unavailable; generating on the page.", error);
    workerUnavailable = true;
    worker = null;
  }
  return worker;
}

// options: { seed, maxAttempts, shouldStopRequested, onProgress, onRetainableCandidate }
export async function runGenerationInWorker(assets, preferences, options = {}) {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return runProductionGeneration(assets, preferences, {
      seed: options.seed,
      maxAttempts: options.maxAttempts,
      generationOptions: {
        shouldStopRequested: options.shouldStopRequested,
        onProgress: options.onProgress,
        onCooperativeProgress: options.onProgress,
        onRetainableCandidate: options.onRetainableCandidate
      }
    });
  }

  return new Promise((resolve, reject) => {
    let stopSent = false;
    const stopPoll = setInterval(() => {
      if (!stopSent && options.shouldStopRequested?.()) {
        stopSent = true;
        activeWorker.postMessage({ type: "stop" });
      }
    }, 100);

    const finish = () => {
      clearInterval(stopPoll);
      activeWorker.onmessage = null;
      activeWorker.onerror = null;
    };

    activeWorker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "progress") {
        options.onProgress?.(message.attempt, message.maxAttempts, message.stage, message.stageContext);
      } else if (message.type === "retainable") {
        options.onRetainableCandidate?.({ found: message.found, target: message.target });
      } else if (message.type === "done") {
        finish();
        const generation = message.generation;
        if (generation?.scenario) {
          // Board data and photos stay on the page; the worker sends the rest.
          generation.scenario.pieceMap = assets.pieceMap;
          generation.scenario.imageMap = assets.imageMap;
          generation.scenario.generationDamageEconomyTelemetry = message.damageEconomyTelemetry ?? null;
        }
        resolve(generation);
      } else if (message.type === "error") {
        finish();
        const error = new Error(message.message);
        if (message.stack) error.stack = message.stack;
        reject(error);
      }
    };
    activeWorker.onerror = (event) => {
      finish();
      // A worker that fails to load (e.g. an old browser without module
      // workers) is retired; this run continues on the page.
      worker?.terminate();
      worker = null;
      workerUnavailable = true;
      event.preventDefault?.();
      console.warn("Generation worker failed; generating on the page.", event.message);
      runGenerationInWorker(assets, preferences, options).then(resolve, reject);
    };

    activeWorker.postMessage({
      type: "start",
      assets: {
        pieceMap: assets.pieceMap,
        constructionGuidance: assets.constructionGuidance,
        preflightGate: assets.preflightGate ?? null
      },
      preferences,
      seed: options.seed,
      maxAttempts: options.maxAttempts,
      // The page's answers to what generation asks of its host
      // (environment.js), taken when Generate is pressed.
      environment: {
        devView: isDevViewEnabled(),
        devRouteModelOverride: isDevRouteModelOverrideActive(),
        devFastTraffic: isDevFastTrafficEnabled(),
        devFastAlternates: isDevFastAlternatesEnabled(),
        concreteValues: {
          difficulty: getAvailableConcretePreferenceValues("difficulty"),
          length: getAvailableConcretePreferenceValues("length")
        }
      }
    });
  });
}
