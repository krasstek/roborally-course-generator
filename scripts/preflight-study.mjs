// Preflight study (ROADMAP D5): how well do the numbers known after the quick
// course preflight predict where a course ends up? Runs single production
// attempts (createRandomCandidate + the final evaluation), letting courses that
// miss their targets run to the end (studyObserveTargetMisses), and records per
// attempt the preflight numbers, the construction guidance prediction, the final
// outcome and the time spent before and after the preflight. One JSON line per
// attempt. Fit with tools/preflight-fit.R. Rerun after new boards, rules or a
// calibration round:
//
//   node scripts/preflight-study.mjs --out calibration-output/preflight-study/run.jsonl \
//     [--count 300] [--shard 0/6] [--seed 1] [--repo .]
//
// Requests are drawn the way phones use the app: 2-6 players, Fast and
// Standard, any target band, random set selections (core always), default
// variant permissions. Heavy runs belong in a memory-capped scope:
//   systemd-run --user --scope -p MemoryMax=14G -p MemorySwapMax=0 ...
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const out = option("out");
if (!out) throw new Error("--out is required");
const repo = resolve(option("repo", "."));
const count = Math.max(1, Number(option("count", 300)));
const [shardIndex, shardCount] = (option("shard", "0/1")).split("/").map(Number);
const baseSeed = Number(option("seed", 1)) >>> 0;

const hooks = await import(`${repo}/src/generation/calibration-hooks.js`);
const { createRandomCandidate } = await import(`${repo}/src/generation/candidate-builder.js`);
const { evaluateFinishedCourse } = await import(`${repo}/src/generation/persistence.js`);
const { withGenerationRandomSeed } = await import(`${repo}/src/generation/random.js`);
const { clearAnalysisCaches, getCompletedRouteExpansions } = await import(`${repo}/analyze.js`);
const { VARIANT_DEFINITIONS } = await import(`${repo}/variants.js`);
const assets = await hooks.loadCalibrationAssets();

const EXTRA_SETS = [
  "rr-dice", "30th-anniversary", "master-builder", "thrills-and-spills",
  "chaos-and-carnage", "wet-and-wild", "contamination", "turn-and-burn", "transformers"
];
const ALL_SETS = ["roborally", ...EXTRA_SETS];
const DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
const LENGTHS = ["short", "moderate", "long", "epic"];
const defaults = Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, variant.defaultState]));

// Small deterministic generator for the request draw (independent of the
// app's generator, which each attempt seeds itself).
function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawRequest(index) {
  const random = mulberry(baseSeed * 1000003 + index);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const sets = ["roborally", ...EXTRA_SETS.filter(() => random() < 0.35)];
  return {
    index,
    attemptSeed: Math.floor(random() * 4294967296) >>> 0,
    preferences: {
      playerCount: 2 + Math.floor(random() * 5),
      difficulty: pick(DIFFICULTIES),
      length: pick(LENGTHS),
      startBalance: "normal",
      generationMode: random() < 0.7 ? "fast" : "standard",
      boardSpread: "random",
      overlayMode: "yes",
      selectedExpansions: Object.fromEntries(ALL_SETS.map((id) => [id, sets.includes(id)])),
      allowedVariantRules: defaults,
      studyObserveTargetMisses: true
    }
  };
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

async function runAttempt(request) {
  clearAnalysisCaches();
  const stageTimes = [];
  const startedAt = performance.now();
  const expansionsBefore = getCompletedRouteExpansions();
  let preflightEndedAt = null;
  let preflightExpansions = null;
  let sawPreflight = false;
  const onStage = (stage) => {
    const now = performance.now();
    stageTimes.push(stage);
    if (sawPreflight && preflightEndedAt === null) {
      preflightEndedAt = now;
      preflightExpansions = getCompletedRouteExpansions() - expansionsBefore;
    }
    if (String(stage).startsWith("Quick course preflight")) sawPreflight = true;
  };
  let result = null;
  let error = null;
  let sunkPreflight = null;
  // Several checkpoint layouts may be tried inside one attempt; keep the last
  // preflight (the one the attempt's outcome belongs to).
  const preferences = { ...request.preferences, studyPreflightSink: (summary) => { sunkPreflight = summary; } };
  try {
    result = await withGenerationRandomSeed(request.attemptSeed, () => createRandomCandidate(
      assets, preferences, 1, 1, null, onStage, null
    ));
  } catch (caught) {
    error = caught?.code ?? caught?.message ?? String(caught);
  }
  const builtAt = performance.now();
  let evaluated = null;
  if (result?.scenario) {
    try {
      evaluated = await withGenerationRandomSeed(request.attemptSeed ^ 0x5bd1e995, () => (
        evaluateFinishedCourse(assets, result.scenario, request.preferences)
      ));
    } catch (caught) {
      error = `final-evaluation: ${caught?.code ?? caught?.message ?? String(caught)}`;
    }
  }
  const endedAt = performance.now();
  const scenario = evaluated ?? result?.scenario ?? null;
  const preflight = sunkPreflight ?? scenario?.sequence?.firstLeg?.summary?.coursePreflight ?? null;
  const guidance = (scenario ?? result?.scenario)?.constructionGuidanceStages?.checkpointsKnown ?? null;
  const rejection = result?.rejectionEvents?.at?.(-1) ?? null;
  const metrics = evaluated?.metrics ?? null;
  const prefs = request.preferences;
  return {
    index: request.index,
    attemptSeed: request.attemptSeed,
    request: {
      playerCount: prefs.playerCount,
      difficulty: prefs.difficulty,
      length: prefs.length,
      generationMode: prefs.generationMode,
      sets: ALL_SETS.filter((id) => prefs.selectedExpansions[id])
    },
    construction: scenario
      ? {
        boards: (scenario.mainBoardIds ?? []).length,
        overlays: (scenario.placements ?? []).filter((placement) => placement.overlay).length,
        checkpoints: (scenario.checkpoints ?? []).length - (scenario.virtualBots ? 1 : 0),
        starts: (scenario.activeStarts ?? []).length,
        variants: VARIANT_DEFINITIONS.filter((variant) => (
          variant.id === "dynamicArchiving" ? scenario.recoveryRule === "dynamic_archiving"
            : variant.id === "homeReboot" ? scenario.recoveryRule === "home_reboot"
              : Boolean(scenario[variant.id])
        )).map((variant) => variant.id)
      }
      : null,
    preflight: preflight
      ? {
        reached: true,
        difficultyRaw: num(preflight.difficultyRaw),
        lengthRaw: num(preflight.lengthRaw),
        openingRouted: num(preflight.openingRoutedCount),
        openingRequired: num(preflight.requiredOpeningCount),
        openingSearched: num(preflight.openingSearchedCount),
        openingUnresolved: num(preflight.openingUnresolvedCount),
        intrinsicPruned: (preflight.intrinsicPruned ?? []).length,
        sourceStarts: num(preflight.sourceStartCount),
        boards: num(preflight.boards),
        checkpoints: num(preflight.checkpoints),
        variants: preflight.variants ?? null,
        routeExpansions: num(preflight.routeExpansions),
        cappedSearches: num(preflight.cappedRouteSearches)
      }
      : { reached: sawPreflight },
    guidance: preflight?.guidanceDifficultyLog != null
      ? {
        difficultyLog: num(preflight.guidanceDifficultyLog),
        lengthLog: num(preflight.guidanceLengthLog),
        predictedExpansions: num(preflight.guidancePredictedExpansions)
      }
      : guidance
      ? {
        difficultyLog: num(guidance.difficulty?.logPrediction),
        lengthLog: num(guidance.length?.logPrediction),
        predictedExpansions: num(guidance.routeCost?.predictedExpansions)
      }
      : null,
    outcome: {
      built: Boolean(result?.scenario),
      evaluated: Boolean(evaluated),
      acceptable: Boolean(metrics?.acceptable),
      exactTargetMatch: Boolean(metrics?.exactTargetMatch),
      difficultyTurnRE: num(metrics?.difficultyTurnRE),
      lengthWallClockTurnIndex: num(metrics?.lengthWallClockTurnIndex),
      hardFailures: [...(metrics?.hardFailures ?? [])],
      softFailures: [...(metrics?.softFailures ?? [])],
      rejectionCategory: result?.scenario ? null : (rejection?.category ?? null),
      rejectionReason: result?.scenario ? null : String(rejection?.reason ?? "").slice(0, 160),
      error
    },
    timing: {
      totalMs: Number((endedAt - startedAt).toFixed(1)),
      buildMs: Number((builtAt - startedAt).toFixed(1)),
      toPreflightEndMs: preflightEndedAt === null ? null : Number((preflightEndedAt - startedAt).toFixed(1)),
      expansionsTotal: getCompletedRouteExpansions() - expansionsBefore,
      expansionsToPreflightEnd: preflightExpansions
    }
  };
}

let written = 0;
for (let index = 0; index < count; index += 1) {
  if (index % shardCount !== shardIndex) continue;
  const row = await runAttempt(drawRequest(index));
  appendFileSync(out, `${JSON.stringify(row)}\n`);
  written += 1;
  if (written % 10 === 0) console.log(`${new Date().toISOString()} shard ${shardIndex}/${shardCount}: ${written} attempts`);
}
console.log(`done: ${written} attempts -> ${out}`);
