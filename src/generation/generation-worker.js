// Robo Rally Course Randomizer - generation worker: runs the production
// generation off the page's main thread, so the page never freezes during a
// long route search. The page sends the loaded board data (not the photos);
// progress, Stop and the finished course travel as messages.
//
// Messages in:  { type: "start", assets: { pieceMap, constructionGuidance }, preferences, seed, maxAttempts, environment }
//               { type: "stop" }
// Messages out: { type: "progress", attempt, maxAttempts, stage, stageContext }
//               { type: "retainable", found, target }
//               { type: "done", generation }   (scenario without pieceMap/imageMap)
//               { type: "error", message, stack }
import { getDamageEconomyTelemetrySnapshot } from "../../analyze.js";
import { registerGenerationEnvironment } from "./environment.js";
import { runProductionGeneration } from "./generation-loop.js";
import { nextEventLoopTurn } from "./scheduling.js";

let stopRequested = false;
let running = false;
let lastCooperativePostAt = 0;

function post(message) {
  try {
    self.postMessage(message);
  } catch {
    // A stage context that cannot be copied only loses its details.
    if (message?.stageContext) self.postMessage({ ...message, stageContext: null });
  }
}

async function run({ assets, preferences, seed, maxAttempts, environment = null }) {
  if (environment) {
    registerGenerationEnvironment({
      isDevViewEnabled: () => Boolean(environment.devView),
      isDevRouteModelOverrideActive: () => Boolean(environment.devRouteModelOverride),
      isDevFastTrafficEnabled: () => Boolean(environment.devFastTraffic),
      isDevFastAlternatesEnabled: () => Boolean(environment.devFastAlternates),
      getAvailableConcretePreferenceValues: (selectId) => [...(environment.concreteValues?.[selectId] ?? [])]
    });
  }
  const workerAssets = { ...assets, imageMap: {}, imageLoadPromises: new Map() };
  const generation = await runProductionGeneration(workerAssets, preferences, {
    seed: Number.isInteger(seed) ? seed : null,
    maxAttempts,
    generationOptions: {
      shouldStopRequested: () => stopRequested,
      onRetainableCandidate: async ({ found, target }) => {
        post({ type: "retainable", found, target });
        await nextEventLoopTurn();
      },
      onCooperativeProgress: (attempt, max, stage = "", stageContext = null) => {
        const now = performance.now();
        if (now - lastCooperativePostAt < 100) return;
        lastCooperativePostAt = now;
        post({ type: "progress", attempt, maxAttempts: max, stage, stageContext });
      },
      onProgress: async (attempt, max, stage = "", stageContext = null) => {
        post({ type: "progress", attempt, maxAttempts: max, stage, stageContext });
        // Let a Stop message in; the page draws on its own thread.
        await nextEventLoopTurn();
      }
    }
  });

  const { scenario, ...rest } = generation;
  let transferable = null;
  if (scenario) {
    const { pieceMap, imageMap, ...scenarioRest } = scenario;
    transferable = scenarioRest;
  }
  self.postMessage({
    type: "done",
    generation: { ...rest, scenario: transferable },
    damageEconomyTelemetry: getDamageEconomyTelemetrySnapshot?.() ?? null
  });
}

self.onmessage = (event) => {
  const message = event.data ?? {};
  if (message.type === "stop") {
    stopRequested = true;
    return;
  }
  if (message.type === "start") {
    if (running) return;
    running = true;
    stopRequested = false;
    run(message)
      .catch((error) => {
        self.postMessage({ type: "error", message: error?.message ?? String(error), stack: error?.stack ?? null });
      })
      .finally(() => {
        running = false;
      });
  }
};
