#!/usr/bin/env node

// Robo Rally comparison harness ("golden master").
//
// Runs a fixed list of seeded course generations through the exact production
// path (main.js runProductionGeneration) and compares the saved-course output
// against a recorded baseline. Used as the safety net for refactoring: a purely
// mechanical change must reproduce every baseline byte for byte.
//
// Commands:
//   record   Generate every case (one fresh process each) and store the baseline.
//   check    Generate every case again and compare with the baseline.       [Check A]
//   leak     Generate every case in ONE process, in order, and compare.      [Check B]
//   restore  Reload each baseline course in a fresh process (as a page reload
//            would) and compare the reanalysis with what was generated.     [Check C]
//
// Options:
//   --dir PATH      Baseline directory (default golden-output/baseline)
//   --jobs N        Parallel worker processes (default 4)
//   --timeout S     Per-case time limit in seconds (default 180)
//   --heap-mb N     V8 heap limit per worker in MB (default 3072)
//   --only a,b      Run only these case names (substring match)
//   --skip a,b      Leave out these case names (substring match)
//   --list          Print the case list and exit
//
// Memory safety: the run refuses to start unless the machine has room for every
// worker at its heap limit plus headroom. Each result is written the moment it
// finishes (baseline/<case>.json for record, last-<command>/<case>.json
// otherwise), so an interrupted run keeps what it completed. For extra
// isolation run it in its own memory-capped scope, e.g.
//   systemd-run --user --scope -p MemoryMax=14G -p MemorySwapMax=0 node scripts/golden.js record
//
// Timing and telemetry fields are stripped before comparison; everything else
// in the serialized course (layout, starts, metrics, notes, diagnostics counts)
// must match exactly.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_DIR = dirname(dirname(SCRIPT_PATH));
const DEFAULT_DIR = join(PROJECT_DIR, "golden-output", "baseline");

// ---------------------------------------------------------------------------
// Cases

const BASE = Object.freeze({
  playerCount: 4,
  difficulty: "any",
  length: "any",
  startBalance: "standard",
  generationMode: "fast",
  boardSpread: "random",
  overlayMode: "yes",
  actFastMode: null,
  expansions: ["roborally"],
  variants: {}
});

const ALL_EXPANSIONS = [
  "roborally", "rr-dice", "30th-anniversary", "master-builder",
  "thrills-and-spills", "chaos-and-carnage", "wet-and-wild", "contamination"
];

const CASES = [
  { name: "core-any-4p" },
  { name: "core-any-2p", playerCount: 2 },
  { name: "core-any-8p", playerCount: 8 },
  { name: "core-easy-short", difficulty: "easy", length: "short" },
  { name: "core-moderate-moderate", difficulty: "moderate", length: "moderate" },
  { name: "core-hard-long", difficulty: "hard", length: "long" },
  { name: "core-brutal-epic", difficulty: "brutal", length: "epic" },
  { name: "mode-standard", generationMode: "standard" },
  { name: "mode-thorough-6p", generationMode: "thorough", playerCount: 6 },
  { name: "balance-strict", startBalance: "strict" },
  { name: "balance-off", startBalance: "off" },
  { name: "spread-tight", boardSpread: "tight" },
  { name: "overlays-off", overlayMode: "no" },
  { name: "sets-all", expansions: ALL_EXPANSIONS },
  { name: "sets-30th-master-builder", expansions: ["roborally", "30th-anniversary", "master-builder"] },
  { name: "sets-thrills-wet", expansions: ["roborally", "thrills-and-spills", "wet-and-wild"] },
  { name: "sets-chaos-contamination", expansions: ["roborally", "chaos-and-carnage", "contamination"] },
  { name: "variants-all-allowed", variants: "all-allowed", expansions: ALL_EXPANSIONS },
  { name: "forced-dynamic-archiving", variants: { dynamicArchiving: "forced" } },
  { name: "forced-no-docks", variants: { noDocks: "forced" } },
  { name: "forced-virtual-bots", variants: { virtualBots: "forced" } },
  { name: "forced-pay-to-win", variants: { payToWin: "forced" } },
  { name: "forced-subsidized-starts", variants: { subsidizedStarts: "forced" } },
  { name: "forced-competitive", variants: { competitiveMode: "forced" } },
  { name: "forced-moving-targets", variants: { movingTargets: "forced" } },
  // Standard collects several candidates; this is the case that ran for minutes
  // before the route-work budget (2026-09-29).
  { name: "standard-moving-targets", seed: 2888408162, generationMode: "standard", variants: { movingTargets: "forced" } },
  { name: "forced-staggered-boards", variants: { staggeredBoards: "forced" } },
  { name: "forced-more-deadly", variants: { moreDeadlyGame: "forced" } },
  { name: "forced-less-deadly", variants: { lessDeadlyGame: "forced" } },
  { name: "forced-hazardous-flags", variants: { hazardousFlags: "forced" } },
  { name: "forced-repair-stations", variants: { repairStations: "forced" } }
];

// FNV-1a. Small consecutive seeds give correlated first draws from the app's
// seeded generator, so each case gets a well-spread seed derived from its name
// (a case may pin an explicit seed that reproduced a specific problem).
function hash32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function buildPreferences(testCase, variantDefinitions) {
  const spec = { ...BASE, ...testCase };
  const defaults = Object.fromEntries(variantDefinitions.map((variant) => [variant.id, variant.defaultState]));
  const allowedVariantRules = spec.variants === "all-allowed"
    ? Object.fromEntries(variantDefinitions.map((variant) => [variant.id, "allowed"]))
    : { ...defaults, ...spec.variants };
  return {
    playerCount: spec.playerCount,
    difficulty: spec.difficulty,
    length: spec.length,
    startBalance: spec.startBalance,
    generationMode: spec.generationMode,
    boardSpread: spec.boardSpread,
    overlayMode: spec.overlayMode,
    actFastMode: spec.actFastMode,
    selectedExpansions: Object.fromEntries(ALL_EXPANSIONS.map((id) => [id, spec.expansions.includes(id)])),
    allowedVariantRules
  };
}

// ---------------------------------------------------------------------------
// Normalization and comparison

const VOLATILE_KEY = /(?:Ms|^ms|^startedAt|StartedAt|Duration)$/;
// Diagnostics chosen or counted by wall-clock time: the slowest search is
// picked by elapsed milliseconds, and cooperative yields/slices follow the
// browser-yield clock. They vary run to run without any change in the course.
const VOLATILE_NAMES = new Set([
  "slowestRouteSearch",
  "slowestSearch",
  "cooperativeIteratorTotals",
  "cooperativeSearchTotals",
  "cooperativeSlices"
]);

// The cheap program-availability memo deliberately survives between
// generations (capped, not cleared by clearAnalysisCaches). It never changes a
// result, only its own hit/miss counters, so the leak check ignores them.
const LEAK_TOLERATED_NAMES = new Set([
  "cheapProgramAvailabilityTotals",
  "cheapProgramUnionAvailabilityTotals"
]);

function normalize(value, extraNames = null) {
  if (Array.isArray(value)) return value.map((item) => normalize(item, extraNames));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEY.test(key) || VOLATILE_NAMES.has(key) || extraNames?.has(key)) continue;
      out[key] = normalize(value[key], extraNames);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

function hashOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function diffPaths(left, right, path = "", out = [], limit = 12) {
  if (out.length >= limit) return out;
  if (JSON.stringify(left) === JSON.stringify(right)) return out;
  const bothObjects = left && right && typeof left === "object" && typeof right === "object" &&
    Array.isArray(left) === Array.isArray(right);
  if (!bothObjects) {
    out.push({ path: path || "(root)", before: preview(left), after: preview(right) });
    return out;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    diffPaths(left[key], right[key], Array.isArray(left) ? `${path}[${key}]` : `${path}.${key}`, out, limit);
    if (out.length >= limit) break;
  }
  return out;
}

function preview(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return "(missing)";
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

// Fields a page reload must reproduce. generationDiagnostics and the guidance
// history are carried over verbatim by the save format, so they are excluded.
const RESTORE_FIELDS = [
  "placements", "checkpoints", "rebootTokens", "activeStarts",
  "blockedStartIndices", "validatedStartIndices", "startDisposition",
  "normalStartBalance", "startPricing", "payToWinPricing",
  "presentationMetrics", "courseNotesHtml"
];

// ---------------------------------------------------------------------------
// Worker (runs inside a child process)

async function loadApp() {
  const main = await import(join(PROJECT_DIR, "main.js"));
  const { VARIANT_DEFINITIONS } = await import(join(PROJECT_DIR, "variants.js"));
  const assets = await main.loadCalibrationAssets();
  return { main, assets, variantDefinitions: VARIANT_DEFINITIONS };
}

async function generateCase(app, testCase) {
  const preferences = buildPreferences(testCase, app.variantDefinitions);
  const seed = testCase.seed ?? hash32(testCase.name);
  const startedAt = performance.now();
  const generation = await app.main.generateScenarioForTesting(app.assets, preferences, { seed });
  const ms = Math.round(performance.now() - startedAt);
  const saved = generation.scenario
    ? app.main.serializeScenarioForTesting(generation.scenario)
    : null;
  const snapshot = normalize({
    ok: Boolean(saved),
    attemptsUsed: generation.attemptsUsed ?? null,
    terminationReason: generation.terminationReason ?? null,
    saved
  });
  return { name: testCase.name, seed, ms, hash: hashOf(snapshot), snapshot, raw: saved };
}

async function restoreCase(app, name, raw) {
  const startedAt = performance.now();
  // Round-trip through JSON exactly as localStorage would.
  const hydrated = await app.main.hydrateScenarioForTesting(app.assets, JSON.parse(JSON.stringify(raw)));
  const ms = Math.round(performance.now() - startedAt);
  if (!hydrated) return { name, ms, ok: false };
  const saved = normalize(app.main.serializeScenarioForTesting(hydrated));
  return {
    name,
    ms,
    ok: true,
    flags: {
      acceptanceDrift: Boolean(hydrated.hydrationAcceptanceDrift),
      acceptanceImproved: Boolean(hydrated.hydrationAcceptanceImproved),
      presentationFallback: Boolean(hydrated.hydrationPresentationFallback),
      presentationUnavailable: Boolean(hydrated.hydrationPresentationUnavailable)
    },
    fields: Object.fromEntries(RESTORE_FIELDS.map((key) => [key, saved[key] ?? null]))
  };
}

async function runWorker() {
  const [task, payloadPath] = process.argv.slice(3);
  // The app logs progress to the console; keep the IPC channel as the only output.
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  const payload = JSON.parse(await readFile(payloadPath, "utf8"));
  const app = await loadApp();
  const results = [];
  for (const item of payload.items) {
    try {
      results.push(task === "restore"
        ? await restoreCase(app, item.name, item.raw)
        : await generateCase(app, item));
    } catch (error) {
      results.push({ name: item.name, error: String(error?.stack ?? error) });
    }
  }
  await new Promise((done) => process.send({ results }, done));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Coordinator

function parseArgs(argv) {
  const hasCommand = argv[0] && !argv[0].startsWith("--");
  const options = {
    command: hasCommand ? argv[0] : null,
    dir: DEFAULT_DIR,
    jobs: 4,
    timeoutSeconds: 180,
    heapMb: 3072,
    only: null,
    skip: null,
    list: false
  };
  for (let index = hasCommand ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") options.dir = resolve(argv[++index]);
    else if (arg === "--jobs") options.jobs = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === "--timeout") options.timeoutSeconds = Math.max(10, Number(argv[++index]) || 180);
    else if (arg === "--heap-mb") options.heapMb = Math.max(512, Number(argv[++index]) || 3072);
    else if (arg === "--only") options.only = argv[++index].split(",").filter(Boolean);
    else if (arg === "--skip") options.skip = argv[++index].split(",").filter(Boolean);
    else if (arg === "--list") options.list = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function selectCases(options) {
  return CASES.filter((testCase) => (
    (!options.only || options.only.some((part) => testCase.name.includes(part))) &&
    !(options.skip ?? []).some((part) => testCase.name.includes(part))
  ));
}

function readAvailableMemoryMb() {
  try {
    const match = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+) kB/m);
    return match ? Math.floor(Number(match[1]) / 1024) : null;
  } catch {
    return null;
  }
}

// A worker that hits the time limit or crashes still yields one result per
// item, marked with the reason, so the run carries on and reports it.
async function runChild(task, items, scratchDir, label, options) {
  const payloadPath = join(scratchDir, `payload-${label}.json`);
  await writeFile(payloadPath, JSON.stringify({ items }));
  const limitMs = options.timeoutSeconds * 1000 * items.length;
  return new Promise((done) => {
    let received = null;
    let timedOut = false;
    const child = fork(SCRIPT_PATH, ["--worker", task, payloadPath], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      execArgv: [`--max-old-space-size=${options.heapMb}`]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on("message", (message) => { received = message; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limitMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (received) {
        done(received.results);
        return;
      }
      const reason = timedOut
        ? `timed out after ${Math.round(limitMs / 1000)} s`
        : `worker exited (code ${code}, signal ${signal})${/heap out of memory/i.test(stderr) ? " — heap limit reached" : ""}`;
      done(items.map((item) => ({ name: item.name, error: `${reason}\n${stderr.slice(-1500)}` })));
    });
  });
}

async function runPool(task, itemGroups, scratchDir, options, onResult) {
  const results = [];
  let next = 0;
  let finished = 0;
  const total = itemGroups.length;
  const running = new Set();
  const status = () => process.stderr.write(
    `\r  ${finished}/${total} done  running: ${[...running].join(", ").slice(0, 90).padEnd(90)}`
  );
  async function lane() {
    while (next < total) {
      const index = next++;
      const group = itemGroups[index];
      const label = group.length === 1 ? group[0].name : `${group.length} cases`;
      running.add(label);
      status();
      const groupResults = await runChild(task, group, scratchDir, `${task}-${index}`, options);
      running.delete(label);
      for (const result of groupResults) await onResult?.(result);
      results.push(...groupResults);
      finished += 1;
      status();
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.jobs, total) }, lane));
  process.stderr.write("\n");
  return results;
}

async function readBaseline(dir, cases) {
  const baseline = new Map();
  for (const testCase of cases) {
    try {
      const entry = JSON.parse(await readFile(join(dir, `${testCase.name}.json`), "utf8"));
      // Re-apply the current exclusions so a baseline recorded before a new
      // volatile field was excluded still compares cleanly.
      entry.snapshot = normalize(entry.snapshot);
      entry.hash = hashOf(entry.snapshot);
      baseline.set(testCase.name, entry);
    } catch {
      // Missing baseline entries are reported by the caller.
    }
  }
  return baseline;
}

function reportGeneration(results, baseline, extraNames = null) {
  let failures = 0;
  for (const result of results.sort((a, b) => a.name.localeCompare(b.name))) {
    let expected = baseline.get(result.name);
    if (extraNames && expected && !result.error) {
      expected = { ...expected, snapshot: normalize(expected.snapshot, extraNames) };
      expected.hash = hashOf(expected.snapshot);
      result.snapshot = normalize(result.snapshot, extraNames);
      result.hash = hashOf(result.snapshot);
    }
    if (result.error) {
      failures += 1;
      console.log(`ERROR ${result.name}\n  ${result.error.split("\n").slice(0, 4).join("\n  ")}`);
    } else if (!expected) {
      failures += 1;
      console.log(`NOBASE ${result.name} (run record first)`);
    } else if (expected.hash === result.hash) {
      console.log(`SAME  ${result.name}  ${result.ms} ms`);
    } else {
      failures += 1;
      console.log(`DIFF  ${result.name}`);
      for (const entry of diffPaths(expected.snapshot, result.snapshot)) {
        console.log(`    ${entry.path}\n      before ${entry.before}\n      after  ${entry.after}`);
      }
    }
  }
  return failures;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = selectCases(options);
  if (options.list || !options.command) {
    for (const testCase of CASES) console.log(`${testCase.name.padEnd(28)} seed ${testCase.seed ?? hash32(testCase.name)}`);
    if (!options.command) console.log("\nCommands: record | check | leak | restore   (see header of scripts/golden.js)");
    return;
  }
  const jobs = options.command === "leak" ? 1 : options.jobs;
  const availableMb = readAvailableMemoryMb();
  const neededMb = jobs * options.heapMb * 1.5 + 4096;
  if (availableMb !== null && availableMb < neededMb) {
    console.error(
      `Not starting: ${availableMb} MB available, ${Math.round(neededMb)} MB wanted ` +
      `(${jobs} worker(s) × ${options.heapMb} MB heap + headroom). Use fewer --jobs or free memory.`
    );
    process.exitCode = 2;
    return;
  }
  const scratchDir = join(dirname(options.dir), ".scratch");
  const liveDir = join(dirname(options.dir), `last-${options.command}`);
  await mkdir(scratchDir, { recursive: true });
  await mkdir(liveDir, { recursive: true });
  const saveLive = (result) => writeFile(join(liveDir, `${result.name}.json`), JSON.stringify(result));
  const startedAt = Date.now();
  let failures = 0;

  if (options.command === "record") {
    await mkdir(options.dir, { recursive: true });
    const saveBaseline = (result) => result.error
      ? saveLive(result)
      : writeFile(join(options.dir, `${result.name}.json`), JSON.stringify(result));
    const results = await runPool("generate", cases.map((testCase) => [testCase]), scratchDir, options, saveBaseline);
    for (const result of results.sort((a, b) => a.name.localeCompare(b.name))) {
      if (result.error) {
        failures += 1;
        console.log(`ERROR ${result.name}\n  ${result.error.split("\n").slice(0, 4).join("\n  ")}`);
        continue;
      }
      const saved = result.snapshot.saved;
      const target = saved?.effectiveTargetPreferences;
      console.log(
        `REC   ${result.name.padEnd(28)} ${String(result.ms).padStart(6)} ms  ` +
        (saved
          ? `${saved.placements.length} pieces, ${saved.checkpoints.length} flags, ${target?.difficulty}/${target?.length}, ` +
            `accepted ${saved.generationAcceptedAtSave}`
          : `no course (${result.snapshot.terminationReason})`)
      );
    }
  } else if (options.command === "check" || options.command === "leak") {
    const baseline = await readBaseline(options.dir, cases);
    const groups = options.command === "check"
      ? cases.map((testCase) => [testCase])
      : [cases];
    const results = await runPool("generate", groups, scratchDir, { ...options, jobs }, saveLive);
    failures = reportGeneration(
      results,
      baseline,
      options.command === "leak" ? LEAK_TOLERATED_NAMES : null
    );
  } else if (options.command === "restore") {
    const baseline = await readBaseline(options.dir, cases);
    const items = [...baseline.values()]
      .filter((entry) => entry.raw)
      .map((entry) => ({ name: entry.name, raw: entry.raw }));
    const results = await runPool("restore", items.map((item) => [item]), scratchDir, options, saveLive);
    for (const result of results.sort((a, b) => a.name.localeCompare(b.name))) {
      const expected = baseline.get(result.name);
      if (result.error || !result.ok) {
        failures += 1;
        console.log(`ERROR ${result.name}\n  ${(result.error ?? "hydration returned nothing").split("\n").slice(0, 4).join("\n  ")}`);
        continue;
      }
      const generatedFields = Object.fromEntries(RESTORE_FIELDS.map((key) => [key, expected.snapshot.saved[key] ?? null]));
      const differences = diffPaths(generatedFields, result.fields);
      const raisedFlags = Object.entries(result.flags).filter(([, value]) => value).map(([key]) => key);
      if (!differences.length && !raisedFlags.length) {
        console.log(`SAME  ${result.name}  ${result.ms} ms`);
        continue;
      }
      failures += 1;
      console.log(`DIFF  ${result.name}${raisedFlags.length ? `  [app would warn: ${raisedFlags.join(", ")}]` : ""}`);
      for (const entry of differences) {
        console.log(`    ${entry.path}\n      generated ${entry.before}\n      restored  ${entry.after}`);
      }
    }
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n${options.command}: ${cases.length} case(s), ${failures} problem(s), ${seconds} s`);
  process.exitCode = failures ? 1 : 0;
}

if (process.argv[2] === "--worker") {
  runWorker().catch((error) => {
    process.send?.({ results: [{ name: "(worker)", error: String(error?.stack ?? error) }] });
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
