#!/usr/bin/env node
// Construction-guidance benchmark: runs a fixed grid of targeted requests through
// the production Generate path and records, per run, the attempts used, the time,
// and whether the course landed in the requested bands. Point --repo at another
// checkout (e.g. a git worktree of main) to compare two versions on the same grid.
//
//   node scripts/guidance-bench.mjs --repo <dir> --out <file.jsonl> [--seeds 3] [--shard 0/4]
//
// One JSON line per run. Summarize with --summarize <file.jsonl> [...].

import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
const LENGTHS = ["short", "moderate", "long"];
const ALL_SETS = [
  "roborally", "rr-dice", "30th-anniversary", "master-builder",
  "thrills-and-spills", "chaos-and-carnage", "wet-and-wild", "contamination"
];
const SETUPS = [
  { name: "core-4p", playerCount: 4, sets: ["roborally"], variants: "default" },
  { name: "all-6p-variants", playerCount: 6, sets: ALL_SETS, variants: "all-allowed" }
];

function buildCases() {
  const cases = [];
  for (const setup of SETUPS) {
    for (const difficulty of DIFFICULTIES) {
      for (const length of LENGTHS) cases.push({ ...setup, difficulty, length, name: `${setup.name}-${difficulty}-${length}` });
    }
  }
  return cases;
}

function hash32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

async function run() {
  const repo = resolve(option("repo", "."));
  const out = option("out");
  if (!out) throw new Error("--out is required");
  const seeds = Number(option("seeds", 3));
  const [shard, shards] = String(option("shard", "0/1")).split("/").map(Number);
  const hooks = await import(join(repo, "src/generation/calibration-hooks.js"));
  const { VARIANT_DEFINITIONS } = await import(join(repo, "variants.js"));
  const { getDifficultyThresholds, getProductionLengthThresholds } = await import(join(repo, "src/generation/targets.js"));
  const assets = await hooks.loadCalibrationAssets();
  const inBand = (value, thresholds, band) => {
    const [low, high] = thresholds[band];
    return Number.isFinite(value) && value >= low && value < high;
  };

  const runs = buildCases().flatMap((testCase) => Array.from({ length: seeds }, (_, index) => ({ testCase, seed: hash32(`${testCase.name}#${index}`) })));
  const quiet = { log: console.log, warn: console.warn, debug: console.debug, info: console.info };
  for (let index = shard; index < runs.length; index += shards) {
    const { testCase, seed } = runs[index];
    const defaults = Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, variant.defaultState]));
    const preferences = {
      playerCount: testCase.playerCount,
      difficulty: testCase.difficulty,
      length: testCase.length,
      startBalance: "standard",
      generationMode: "fast",
      boardSpread: "random",
      overlayMode: "yes",
      actFastMode: null,
      selectedExpansions: Object.fromEntries(ALL_SETS.map((id) => [id, testCase.sets.includes(id)])),
      allowedVariantRules: testCase.variants === "all-allowed"
        ? Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, "allowed"]))
        : defaults
    };
    console.log = console.warn = console.debug = console.info = () => {};
    const startedAt = performance.now();
    let generation = null;
    let error = null;
    try {
      generation = await hooks.generateScenarioForTesting(assets, preferences, { seed });
    } catch (caught) {
      error = caught?.message ?? String(caught);
    }
    Object.assign(console, quiet);
    const scenario = generation?.scenario ?? null;
    const metrics = scenario?.metrics ?? {};
    const record = {
      case: testCase.name,
      seed,
      ms: Math.round(performance.now() - startedAt),
      attempts: generation?.attemptsUsed ?? scenario?.attempts ?? null,
      termination: generation?.terminationReason ?? null,
      ok: Boolean(scenario),
      acceptable: Boolean(metrics.acceptable),
      difficulty: metrics.difficultyTurnRE ?? null,
      length: metrics.lengthWallClockTurnIndex ?? null,
      difficultyHit: inBand(metrics.difficultyTurnRE, getDifficultyThresholds(), testCase.difficulty),
      lengthHit: inBand(metrics.lengthWallClockTurnIndex, getProductionLengthThresholds(), testCase.length),
      variants: scenario ? VARIANT_DEFINITIONS.map((variant) => variant.id).filter((id) => scenario[id] === true) : [],
      error
    };
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    console.log(`${index + 1}/${runs.length} ${testCase.name} ${record.ms} ms, ${record.attempts} attempts, ${record.difficultyHit && record.lengthHit ? "hit" : "miss"}`);
  }
}

function summarize(files) {
  for (const file of files) {
    const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? NaN; };
    const line = (label, subset) => {
      const both = subset.filter((row) => row.difficultyHit && row.lengthHit).length;
      console.log(`${label.padEnd(18)} n ${String(subset.length).padStart(3)} | time mean ${(mean(subset.map((row) => row.ms)) / 1000).toFixed(1)} s, median ${(median(subset.map((row) => row.ms)) / 1000).toFixed(1)} s | attempts mean ${mean(subset.map((row) => row.attempts ?? 0)).toFixed(1)} | both bands ${(100 * both / Math.max(1, subset.length)).toFixed(0)}% (difficulty ${(100 * subset.filter((row) => row.difficultyHit).length / Math.max(1, subset.length)).toFixed(0)}%, length ${(100 * subset.filter((row) => row.lengthHit).length / Math.max(1, subset.length)).toFixed(0)}%) | no course ${subset.filter((row) => !row.ok).length}`);
    };
    console.log(`\n${file}`);
    line("all", rows);
    for (const setup of SETUPS) line(setup.name, rows.filter((row) => row.case.startsWith(setup.name)));
    for (const difficulty of DIFFICULTIES) line(difficulty, rows.filter((row) => row.case.includes(`-${difficulty}-`)));
  }
}

if (args.includes("--summarize")) {
  summarize(args.filter((arg) => arg.endsWith(".jsonl")));
} else {
  run().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
