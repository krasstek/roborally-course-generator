#!/usr/bin/env node

// Robo Rally calibration runner v5f
// Zero third-party Node dependencies. Designed to run fully offline.

import { appendFile, mkdir, readFile, stat, truncate, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { fork } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = dirname(SCRIPT_DIR);

const DEFAULTS = Object.freeze({
  count: 2000,
  seed: Date.now() >>> 0,
  analysisMode: "balanced",
  pairedRecoveryRate: 0.25,
  modePairRate: 0.10,
  output: null,
  resume: false,
  pilot: false,
  expansionIds: null,
  timeoutSeconds: 120,
  study: "general",
  overlayCount: null,
  overlayPlacementRetries: 12
});

const PLAYERS = Object.freeze([2, 4, 6, 8]);
const DIFFICULTIES = Object.freeze(["easy", "moderate", "hard", "brutal"]);
const LENGTHS = Object.freeze(["short", "moderate", "long"]);
const FLAG_COUNTS = Object.freeze([2, 3, 4, 5, 6]);
const OVERLAY_STUDY_BLOCK_SIZE = 20;
const BLOCK_STRATA = Object.freeze([
  "normal", "normal", "normal", "normal", "normal",
  "normal", "normal", "normal", "normal", "normal",
  "dynamic-archiving", "dynamic-archiving", "dynamic-archiving", "dynamic-archiving",
  "board-overlay", "board-overlay", "board-overlay",
  "structural-variant", "structural-variant",
  "exploratory"
]);
const STRUCTURAL_VARIANTS = Object.freeze([
  "staggeredBoards",
  "movingTargets",
  "competitiveMode",
  "payToWin",
  "subsidizedStarts",
  "virtualBots",
  "noDocks",
  "extraDocks",
  "sandwichedDock"
]);
const MODE_PAIR_CHOICES = Object.freeze(["fastest", "standard", "thorough"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    seedProvided: false,
    countProvided: false,
    timeoutProvided: false,
    studyProvided: false,
    overlayCountProvided: false,
    overlayPlacementRetriesProvided: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--count" || arg === "--runs") {
      options.count = Math.max(1, Math.floor(Number(next()) || DEFAULTS.count));
      options.countProvided = true;
    } else if (arg === "--pilot") {
      options.pilot = true;
      if (!options.countProvided) options.count = 60;
    } else if (arg === "--overlay-study") {
      options.study = "overlay";
      options.studyProvided = true;
      if (!options.countProvided && !options.pilot) options.count = 500;
    } else if (arg === "--overlay-count") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--overlay-count requires an integer >= 1.");
      }
      options.study = "overlay";
      options.studyProvided = true;
      options.overlayCount = value;
      options.overlayCountProvided = true;
      if (!options.countProvided && !options.pilot) options.count = 300;
    } else if (arg === "--overlay-placement-retries") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--overlay-placement-retries requires an integer >= 1.");
      }
      options.overlayPlacementRetries = value;
      options.overlayPlacementRetriesProvided = true;
    } else if (arg === "--seed") {
      const value = Number(next());
      if (!Number.isFinite(value)) throw new Error("--seed requires an integer.");
      options.seed = Math.floor(value) >>> 0;
      options.seedProvided = true;
    } else if (arg === "--analysis-mode") {
      options.analysisMode = String(next() || DEFAULTS.analysisMode).trim().toLowerCase();
    } else if (arg === "--paired-recovery-rate") {
      options.pairedRecoveryRate = clamp(Number(next()), 0, 1);
    } else if (arg === "--mode-pair-rate") {
      options.modePairRate = clamp(Number(next()), 0, 1);
    } else if (arg === "--sets") {
      const value = String(next() || "all").trim();
      options.expansionIds = value.toLowerCase() === "all"
        ? null
        : value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--output") {
      options.output = String(next() || "").trim();
    } else if (arg === "--timeout-seconds") {
      const value = Number(next());
      if (!Number.isFinite(value) || value < 1) throw new Error("--timeout-seconds requires a number >= 1.");
      options.timeoutSeconds = value;
      options.timeoutProvided = true;
    } else if (arg === "--resume") {
      options.resume = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["fastest", "fast", "standard", "balanced", "thorough"].includes(options.analysisMode)) {
    throw new Error(`Unknown analysis mode: ${options.analysisMode}`);
  }
  return options;
}

function printHelp() {
  console.log(`Robo Rally calibration runner v5f\n\nUsage:\n  node tools/calibration-runner.js [options]\n\nOptions:\n  --count N                  Total observations to collect (default ${DEFAULTS.count})\n  --pilot                    Convenience mode: 60 observations unless --count is supplied\n  --overlay-study            Targeted structural-overlay study; defaults to 500 observations\n  --overlay-count N          In overlay study, force exactly N structural overlay boards; defaults to 300 observations\n  --overlay-placement-retries N  Cheap construction proposals per forced-overlay observation (default ${DEFAULTS.overlayPlacementRetries})\n  --seed N                   Deterministic master seed\n  --analysis-mode MODE       Reference route effort: fastest|fast|standard|balanced|thorough\n  --paired-recovery-rate P   Normal/DA constructions receiving same-course recovery counterfactual (default ${DEFAULTS.pairedRecoveryRate})\n  --mode-pair-rate P         Eligible courses receiving one extra route-effort counterfactual (default ${DEFAULTS.modePairRate})\n  --sets all|id,id            Restrict every observation to these expansion IDs\n  --output PATH              JSONL output path (default calibration-output/calibration-raw-<timestamp>.jsonl)\n  --timeout-seconds N        Hard wall-clock ceiling per observation (default ${DEFAULTS.timeoutSeconds}s)\n  --resume                   Continue an existing JSONL file; schedule/seed come from its header\n  --help                     Show this message\n\nThe runner uses only Node built-ins and local project files. Network access is explicitly blocked. Each primary observation runs in its own child process so pathological synchronous route searches can be terminated safely. A timeout is recorded as calibration data, not as route impossibility or a harness error. In --overlay-study mode every proposal requests a real structural board overlay (80% one overlay, 20% two unless --overlay-count is supplied) and every successful scenario receives a same-course no-overlay counterfactual. Structural overlay-board studies exclude small-board-only presets because overlay boards are not physically stacked on those layouts. When a fixed overlay count is requested, cheap construction failures are resampled up to the configured proposal limit; analyzed route failures, timeouts, and errors are never resampled. The final observation records how many construction proposals were needed. Normal console output is one updating progress line; only unexpected actionable errors are printed separately.`);
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function hash32(...values) {
  let state = 0x811c9dc5;
  for (const value of values) {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      state ^= text.charCodeAt(index);
      state = Math.imul(state, 0x01000193) >>> 0;
    }
  }
  return state >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function rounded(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function compactRejections(events = []) {
  return events.map((event) => ({
    category: event?.category ?? null,
    reason: event?.reason ?? null
  }));
}

function makeOutputPath(options) {
  if (options.output) {
    return isAbsolute(options.output) ? options.output : resolve(PROJECT_DIR, options.output);
  }
  return join(PROJECT_DIR, "calibration-output", `calibration-raw-${timestampId()}.jsonl`);
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function repairTrailingPartialLine(path) {
  const buffer = await readFile(path);
  if (!buffer.length || buffer.at(-1) === 10) return;
  const lastNewline = buffer.lastIndexOf(10);
  await truncate(path, lastNewline >= 0 ? lastNewline + 1 : 0);
}

async function readJsonl(path) {
  await repairTrailingPartialLine(path);
  const text = await readFile(path, "utf8");
  const lines = text.split(/\n/).filter((line) => line.trim());
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

async function appendRecord(path, record) {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function withQuietGeneratorConsole(callback) {
  const originalDebug = console.debug;
  const originalInfo = console.info;
  console.debug = () => {};
  console.info = () => {};
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      console.debug = originalDebug;
      console.info = originalInfo;
    });
}

function uniquePresetKey(expansionIds) {
  return [...expansionIds].sort().join("|");
}

function buildInventoryPresets(assets, allInventory, describeCalibrationInventory, forcedExpansionIds = null) {
  if (forcedExpansionIds?.length) {
    const inventory = describeCalibrationInventory(assets, forcedExpansionIds);
    return [{ id: "custom", label: "custom", ...inventory }];
  }

  const baseId = allInventory.baseExpansionId;
  const summaries = allInventory.expansionSummary ?? [];
  const candidateSets = [];
  if (baseId) candidateSets.push({ id: "core", ids: [baseId] });
  for (const summary of summaries) {
    if (summary.expansionId === baseId || summary.boardFaces <= 0) continue;
    candidateSets.push({ id: `core+${summary.expansionId}`, ids: [baseId, summary.expansionId].filter(Boolean) });
    if (summary.smallBoardFaces > 0 && summary.docks > 0) {
      candidateSets.push({ id: `small:${summary.expansionId}`, ids: [summary.expansionId] });
    }
  }
  candidateSets.push({ id: "all", ids: allInventory.expansionIds });

  const seen = new Set();
  const presets = [];
  for (const candidate of candidateSets) {
    const key = uniquePresetKey(candidate.ids);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const inventory = describeCalibrationInventory(assets, candidate.ids);
    if (inventory.maxBoardCount < 1) continue;
    // Ordinary strata need at least one physical dock. No-Docks remains sampled
    // inside otherwise viable inventories so the treatment is comparable.
    if (!inventory.dockIds.length) continue;
    presets.push({ id: candidate.id, label: candidate.id, ...inventory });
  }
  if (!presets.length) throw new Error("No viable calibration inventory presets were found.");
  return presets;
}

function overlayCapablePresets(presets, playerCount = null) {
  const candidates = presets.filter((preset) => (
    !String(preset.id || "").startsWith("small:") &&
    preset.overlayBoardIds?.length &&
    preset.maxBoardCount >= 1 &&
    (!Number.isFinite(playerCount) || (preset.maxSingleDockStartCount ?? 0) >= playerCount)
  ));
  return candidates;
}

function pickPreset(presets, stratum, random, playerCount = null) {
  if (stratum === "board-overlay") {
    const overlayPresets = overlayCapablePresets(presets, playerCount);
    if (overlayPresets.length) return choose(overlayPresets, random);
  }
  const startCompatible = Number.isFinite(playerCount)
    ? presets.filter((preset) => (preset.maxSingleDockStartCount ?? 0) >= playerCount)
    : [];
  return choose(startCompatible.length ? startCompatible : presets, random);
}

function buildOverlayStudyPlan(index, config, presets) {
  const blockIndex = Math.floor(index / OVERLAY_STUDY_BLOCK_SIZE);
  const slotIndex = index % OVERLAY_STUDY_BLOCK_SIZE;
  const scheduleSeed = hash32(config.seed, "overlay-study-plan", index);
  const random = mulberry32(scheduleSeed);
  const playerCount = PLAYERS[(blockIndex + slotIndex) % PLAYERS.length];
  const preset = pickPreset(presets, "board-overlay", random, playerCount);
  if (!preset?.overlayBoardIds?.length) {
    throw new Error(`No overlay-capable inventory can support ${playerCount} players.`);
  }

  const difficulty = ["moderate", "hard", "brutal"][(blockIndex + slotIndex * 2) % 3];
  const length = LENGTHS[(blockIndex * 2 + slotIndex) % LENGTHS.length];
  const maxBoardCount = Math.max(1, preset.maxBoardCount || 1);
  const forcedBoardOverlayCount = Number.isInteger(config.overlayCount) ? config.overlayCount : (slotIndex % 5 === 4 ? 2 : 1);
  const productionMinimumBoards = difficulty === "moderate"
    ? forcedBoardOverlayCount + 1
    : forcedBoardOverlayCount;
  const minimumBoardCount = Math.min(maxBoardCount, Math.max(1, productionMinimumBoards));
  const boardSpan = Math.max(1, maxBoardCount - minimumBoardCount + 1);
  const boardCount = minimumBoardCount + ((blockIndex * 2 + slotIndex * 3) % boardSpan);
  const flagCount = FLAG_COUNTS[(blockIndex * 3 + slotIndex) % FLAG_COUNTS.length];
  const pairedMode = random() < config.modePairRate
    ? MODE_PAIR_CHOICES[(blockIndex + slotIndex) % MODE_PAIR_CHOICES.length]
    : null;

  return {
    index,
    blockIndex,
    slotIndex,
    stratum: "board-overlay",
    study: "overlay",
    observationSeed: hash32(config.seed, "observation", index),
    playerCount,
    difficulty,
    length,
    boardCount,
    flagCount,
    inventoryPreset: preset.id,
    expansionIds: preset.expansionIds,
    maxBoardCount,
    overlayMode: "boards",
    forcedBoardOverlayCount,
    forcedVariantIds: [],
    guidanceStrength: 1,
    pairedRecovery: false,
    pairedMode
  };
}

function buildObservationPlan(index, config, presets) {
  if (config.study === "overlay") {
    return buildOverlayStudyPlan(index, config, presets);
  }

  const blockIndex = Math.floor(index / BLOCK_STRATA.length);
  const slotIndex = index % BLOCK_STRATA.length;
  const stratum = BLOCK_STRATA[slotIndex];
  const scheduleSeed = hash32(config.seed, "plan", index);
  const random = mulberry32(scheduleSeed);
  let difficulty = DIFFICULTIES[(blockIndex + slotIndex * 3) % DIFFICULTIES.length];
  const length = LENGTHS[(blockIndex * 2 + slotIndex) % LENGTHS.length];
  const playerCount = PLAYERS[(blockIndex + slotIndex) % PLAYERS.length];
  const preset = pickPreset(
    presets,
    stratum,
    random,
    stratum === "structural-variant" ? null : playerCount
  );
  const maxBoardCount = Math.max(1, preset.maxBoardCount || 1);
  let boardCount = 1 + ((blockIndex * 2 + slotIndex * 3) % maxBoardCount);
  const flagCount = FLAG_COUNTS[(blockIndex * 3 + slotIndex) % FLAG_COUNTS.length];
  const forcedVariantIds = [];
  let overlayMode = "no";
  let forcedBoardOverlayCount = null;
  let guidanceStrength = 1;

  if (stratum === "dynamic-archiving") forcedVariantIds.push("dynamicArchiving");
  if (stratum === "board-overlay") {
    overlayMode = "boards";
    forcedBoardOverlayCount = 1;
    // Production intentionally suppresses board overlays on Easy. Keep native
    // overlay observations inside the region where board overlays can occur.
    if (difficulty === "easy") difficulty = ["moderate", "hard", "brutal"][(blockIndex + slotIndex) % 3];
    if (difficulty === "moderate" && maxBoardCount >= 2) boardCount = Math.max(boardCount, 2);
  }
  if (stratum === "structural-variant") {
    forcedVariantIds.push(STRUCTURAL_VARIANTS[(blockIndex * 2 + slotIndex) % STRUCTURAL_VARIANTS.length]);
  }
  if (stratum === "exploratory") guidanceStrength = 0.35;

  const recoveryPairEligible = stratum === "normal" || stratum === "dynamic-archiving";
  const pairedRecovery = recoveryPairEligible && random() < config.pairedRecoveryRate;
  const modePairEligible = ["normal", "dynamic-archiving", "board-overlay"].includes(stratum);
  const pairedMode = modePairEligible && random() < config.modePairRate
    ? MODE_PAIR_CHOICES[(blockIndex + slotIndex) % MODE_PAIR_CHOICES.length]
    : null;

  return {
    index,
    blockIndex,
    slotIndex,
    stratum,
    study: "general",
    observationSeed: hash32(config.seed, "observation", index),
    playerCount,
    difficulty,
    length,
    boardCount,
    flagCount,
    inventoryPreset: preset.id,
    expansionIds: preset.expansionIds,
    maxBoardCount,
    overlayMode,
    forcedBoardOverlayCount,
    forcedVariantIds,
    guidanceStrength,
    pairedRecovery,
    pairedMode
  };
}

function makeRunHeader(config, presets) {
  return {
    recordType: "run",
    schemaVersion: 1,
    harness: "construction-guidance-v2",
    runId: config.runId,
    createdAt: new Date().toISOString(),
    seed: config.seed,
    config: {
      count: config.count,
      study: config.study,
      overlayCount: Number.isInteger(config.overlayCount) ? config.overlayCount : null,
      overlayPlacementRetries: config.overlayPlacementRetries,
      analysisMode: config.analysisMode,
      pairedRecoveryRate: config.pairedRecoveryRate,
      modePairRate: config.modePairRate,
      blockSize: config.study === "overlay" ? OVERLAY_STUDY_BLOCK_SIZE : BLOCK_STRATA.length,
      strataPerBlock: config.study === "overlay"
        ? { "board-overlay": OVERLAY_STUDY_BLOCK_SIZE }
        : BLOCK_STRATA.reduce((counts, stratum) => {
          counts[stratum] = (counts[stratum] || 0) + 1;
          return counts;
        }, {}),
      players: PLAYERS,
      difficulties: config.study === "overlay" ? ["moderate", "hard", "brutal"] : DIFFICULTIES,
      lengths: LENGTHS,
      flagCounts: FLAG_COUNTS,
      restrictedExpansionIds: config.expansionIds,
      timeoutSeconds: config.timeoutSeconds
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      offlineGuard: true,
      thirdPartyNodeDependencies: false
    },
    inventoryPresets: presets.map((preset) => ({
      id: preset.id,
      expansionIds: preset.expansionIds,
      maxBoardCount: preset.maxBoardCount,
      physicalBoardCount: preset.physicalBoardCount,
      maxSingleDockStartCount: preset.maxSingleDockStartCount ?? 0,
      hasLargeBoards: preset.hasLargeBoards,
      dockCount: preset.dockIds?.length ?? 0,
      overlayBoardCount: preset.overlayBoardIds?.length ?? 0,
      overlayTileCount: preset.overlayTileIds?.length ?? 0
    }))
  };
}

function assertResumeCompatible(header, options) {
  if (header.recordType !== "run" || header.schemaVersion !== 1) {
    throw new Error("The existing file is not a v5 calibration JSONL run.");
  }
  if (options.seedProvided && (options.seed >>> 0) !== (header.seed >>> 0)) {
    throw new Error(`Resume seed mismatch: file uses ${header.seed}, command requested ${options.seed}.`);
  }
  if (options.analysisMode !== DEFAULTS.analysisMode && options.analysisMode !== header.config?.analysisMode) {
    throw new Error(`Resume analysis-mode mismatch: file uses ${header.config?.analysisMode}.`);
  }
  if (options.studyProvided && options.study !== (header.config?.study ?? "general")) {
    throw new Error(`Resume study mismatch: file uses ${header.config?.study ?? "general"}.`);
  }
  if (options.overlayCountProvided && options.overlayCount !== (header.config?.overlayCount ?? null)) {
    throw new Error(`Resume overlay-count mismatch: file uses ${header.config?.overlayCount ?? "mixed"}, command requested ${options.overlayCount}.`);
  }
  if (options.overlayPlacementRetriesProvided && options.overlayPlacementRetries !== (header.config?.overlayPlacementRetries ?? DEFAULTS.overlayPlacementRetries)) {
    throw new Error(`Resume overlay-placement-retries mismatch: file uses ${header.config?.overlayPlacementRetries ?? DEFAULTS.overlayPlacementRetries}.`);
  }
}



function installOfflineGuard() {
  globalThis.fetch = async () => {
    throw new Error("Calibration runner is offline-only; network access is disabled.");
  };
}

async function runObservationInWorker(request) {
  installOfflineGuard();
  const {
    generateCalibrationObservation,
    loadCalibrationAssets,
    reanalyzeCalibrationScenario
  } = await import("../main.js");

  const assets = await loadCalibrationAssets();
  const { plan, config } = request;
  const observationStartedAt = performance.now();
  const generated = await withQuietGeneratorConsole(() => generateCalibrationObservation(assets, {
    seed: plan.observationSeed,
    playerCount: plan.playerCount,
    difficulty: plan.difficulty,
    length: plan.length,
    boardCount: plan.boardCount,
    flagCount: plan.flagCount,
    generationMode: config.analysisMode,
    expansionIds: plan.expansionIds,
    overlayMode: plan.overlayMode,
    boardOverlayCount: plan.forcedBoardOverlayCount,
    forcedVariantIds: plan.forcedVariantIds,
    guidanceStrength: plan.guidanceStrength,
    unguidedBoardSelection: true,
    singleCheckpointProposal: true
  }));

  const counterfactuals = [];
  const sourceScenario = generated?.scenario ?? null;

  if (sourceScenario && plan.pairedRecovery) {
    const sourceIsDynamic = plan.forcedVariantIds.includes("dynamicArchiving");
    try {
      const paired = await withQuietGeneratorConsole(() => reanalyzeCalibrationScenario(assets, sourceScenario, {
        dynamicArchiving: !sourceIsDynamic,
        generationMode: config.analysisMode
      }));
      if (paired) {
        counterfactuals.push({
          kind: "recovery-rule",
          treatment: sourceIsDynamic ? "reboot_tokens" : "dynamic_archiving",
          elapsedMs: paired.elapsedMs,
          work: paired.telemetrySummary,
          evidence: paired.evidence
        });
      }
    } catch (error) {
      counterfactuals.push({ kind: "recovery-rule", status: "error", error: error?.message ?? String(error) });
    }
  }

  if (sourceScenario && plan.stratum === "board-overlay" && Number(generated?.evidence?.construction?.overlayBoardCount || 0) > 0) {
    try {
      const paired = await withQuietGeneratorConsole(() => reanalyzeCalibrationScenario(assets, sourceScenario, {
        dynamicArchiving: false,
        removeOverlays: true,
        generationMode: config.analysisMode
      }));
      if (paired) {
        counterfactuals.push({
          kind: "remove-board-overlays",
          treatment: "base-topology",
          elapsedMs: paired.elapsedMs,
          work: paired.telemetrySummary,
          evidence: paired.evidence
        });
      }
    } catch (error) {
      counterfactuals.push({ kind: "remove-board-overlays", status: "error", error: error?.message ?? String(error) });
    }
  }

  if (sourceScenario && plan.pairedMode) {
    const sourceIsDynamic = plan.forcedVariantIds.includes("dynamicArchiving");
    try {
      const paired = await withQuietGeneratorConsole(() => reanalyzeCalibrationScenario(assets, sourceScenario, {
        dynamicArchiving: sourceIsDynamic,
        generationMode: plan.pairedMode
      }));
      if (paired) {
        counterfactuals.push({
          kind: "generation-mode-effort",
          treatment: plan.pairedMode,
          elapsedMs: paired.elapsedMs,
          work: paired.telemetrySummary,
          evidence: paired.evidence
        });
      }
    } catch (error) {
      counterfactuals.push({ kind: "generation-mode-effort", status: "error", error: error?.message ?? String(error) });
    }
  }

  const measuredElapsed = performance.now() - observationStartedAt;
  const generationStatus = generated?.calibrationStatus
    ?? (generated?.scenario
      ? "scenario"
      : generated?.evidence?.construction
        ? "analyzed-rejection"
        : "construction-rejection");

  return {
    generationStatus,
    measuredElapsed,
    generated: {
      elapsedMs: generated?.elapsedMs ?? rounded(measuredElapsed, 2),
      evaluationsUsed: generated?.evaluationsUsed ?? null,
      rejectionEvents: compactRejections(generated?.rejectionEvents ?? []),
      telemetrySummary: generated?.telemetrySummary ?? null,
      evidence: generated?.evidence ?? null
    },
    counterfactuals
  };
}

async function workerMain() {
  const encoded = process.env.ROBORALLY_CALIBRATION_REQUEST;
  if (!encoded) throw new Error("Calibration worker request is missing.");
  const request = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  const payload = await runObservationInWorker(request);
  if (typeof process.send === "function") {
    await new Promise((resolve, reject) => {
      process.send({ type: "result", payload }, (error) => error ? reject(error) : resolve());
    });
    if (process.connected) process.disconnect();
  }
}

function runObservationWorker(request, timeoutMs) {
  return new Promise((resolve) => {
    const encodedRequest = Buffer.from(JSON.stringify(request), "utf8").toString("base64url");
    const child = fork(fileURLToPath(import.meta.url), ["--worker"], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        ROBORALLY_CALIBRATION_REQUEST: encodedRequest
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });

    let settled = false;
    let workerMessage = null;
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      // Route analysis is synchronous; only process isolation can provide a real
      // wall-clock ceiling. SIGKILL is intentional here so an infinite loop or
      // runaway search cannot hold an unattended overnight calibration hostage.
      child.kill("SIGKILL");
      finish({ kind: "timeout", timeoutMs });
    }, timeoutMs);

    child.on("message", (message) => {
      if (message?.type === "result") workerMessage = message.payload;
    });

    child.on("error", (error) => {
      finish({ kind: "error", error: `${error?.name ?? "Error"}: ${error?.message ?? String(error)}` });
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      if (workerMessage) {
        finish({ kind: "result", payload: workerMessage });
        return;
      }
      const stderrText = stderr.trim();
      const detail = stderrText || `worker exited with code ${code ?? "n/a"}${signal ? ` signal ${signal}` : ""}`;
      finish({ kind: "error", error: detail });
    });
  });
}

function makeTimeoutRecord(config, plan, timeoutMs) {
  return {
    recordType: "observation",
    schemaVersion: 1,
    runId: config.runId,
    index: plan.index,
    blockIndex: plan.blockIndex,
    slotIndex: plan.slotIndex,
    stratum: plan.stratum,
    seed: plan.observationSeed,
    plan: {
      playerCount: plan.playerCount,
      difficulty: plan.difficulty,
      length: plan.length,
      boardCount: plan.boardCount,
      flagCount: plan.flagCount,
      inventoryPreset: plan.inventoryPreset,
      expansionIds: plan.expansionIds,
      overlayMode: plan.overlayMode,
      forcedBoardOverlayCount: plan.forcedBoardOverlayCount,
      forcedVariantIds: plan.forcedVariantIds,
      guidanceStrength: plan.guidanceStrength,
      study: plan.study,
      referenceAnalysisMode: config.analysisMode
    },
    sampling: {
      proposalAttempts: plan.samplingProposalAttempts ?? 1,
      discardedConstructionRejections: plan.discardedConstructionRejections ?? 0,
      proposalLimit: plan.samplingProposalLimit ?? 1,
      proposalElapsedMs: plan.samplingProposalElapsedMs ?? null
    },
    generation: {
      status: "timeout",
      elapsedMs: timeoutMs,
      evaluationsUsed: null,
      rejectionEvents: [],
      error: null,
      timeout: {
        limitMs: timeoutMs,
        role: "calibration-operational-ceiling-not-route-impossibility"
      }
    },
    work: null,
    evidence: null,
    counterfactuals: []
  };
}

function makeObservationRecord(config, plan, payload) {
  return {
    recordType: "observation",
    schemaVersion: 1,
    runId: config.runId,
    index: plan.index,
    blockIndex: plan.blockIndex,
    slotIndex: plan.slotIndex,
    stratum: plan.stratum,
    seed: plan.observationSeed,
    plan: {
      playerCount: plan.playerCount,
      difficulty: plan.difficulty,
      length: plan.length,
      boardCount: plan.boardCount,
      flagCount: plan.flagCount,
      inventoryPreset: plan.inventoryPreset,
      expansionIds: plan.expansionIds,
      overlayMode: plan.overlayMode,
      forcedBoardOverlayCount: plan.forcedBoardOverlayCount,
      forcedVariantIds: plan.forcedVariantIds,
      guidanceStrength: plan.guidanceStrength,
      study: plan.study,
      referenceAnalysisMode: config.analysisMode
    },
    sampling: {
      proposalAttempts: plan.samplingProposalAttempts ?? 1,
      discardedConstructionRejections: plan.discardedConstructionRejections ?? 0,
      proposalLimit: plan.samplingProposalLimit ?? 1,
      proposalElapsedMs: plan.samplingProposalElapsedMs ?? null
    },
    generation: {
      status: payload.generationStatus,
      elapsedMs: payload.generated?.elapsedMs ?? rounded(payload.measuredElapsed, 2),
      evaluationsUsed: payload.generated?.evaluationsUsed ?? null,
      rejectionEvents: payload.generated?.rejectionEvents ?? [],
      error: null
    },
    work: payload.generated?.telemetrySummary ?? null,
    evidence: payload.generated?.evidence ?? null,
    counterfactuals: payload.counterfactuals ?? []
  };
}

async function main() {
  if (process.argv.includes("--worker")) {
    try {
      await workerMain();
    } catch (error) {
      console.error(error?.stack ?? error?.message ?? String(error));
      process.exitCode = 1;
    }
    return;
  }

  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Run with --help for usage.");
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }

  installOfflineGuard();

  const {
    describeCalibrationInventory,
    loadCalibrationAssets
  } = await import("../main.js");

  const outputPath = makeOutputPath(options);
  const exists = await fileExists(outputPath);
  let header = null;
  let completed = 0;
  let config;

  if (options.resume) {
    if (!exists) throw new Error(`Cannot resume missing file: ${outputPath}`);
    const records = await readJsonl(outputPath);
    header = records.find((record) => record.recordType === "run") ?? null;
    if (!header) throw new Error("Resume file has no run header.");
    assertResumeCompatible(header, options);
    completed = records.filter((record) => record.recordType === "observation").length;
    config = {
      runId: header.runId,
      seed: header.seed >>> 0,
      count: options.countProvided ? options.count : Math.max(header.config?.count ?? 0, completed),
      analysisMode: header.config?.analysisMode ?? DEFAULTS.analysisMode,
      pairedRecoveryRate: header.config?.pairedRecoveryRate ?? DEFAULTS.pairedRecoveryRate,
      modePairRate: header.config?.modePairRate ?? DEFAULTS.modePairRate,
      study: header.config?.study ?? "general",
      overlayCount: header.config?.overlayCount ?? null,
      overlayPlacementRetries: header.config?.overlayPlacementRetries ?? DEFAULTS.overlayPlacementRetries,
      expansionIds: header.config?.restrictedExpansionIds ?? null,
      timeoutSeconds: options.timeoutProvided
        ? options.timeoutSeconds
        : (header.config?.timeoutSeconds ?? DEFAULTS.timeoutSeconds)
    };
  } else {
    if (exists) throw new Error(`Output already exists; use --resume or choose another path: ${outputPath}`);
    config = {
      runId: timestampId(),
      seed: options.seed >>> 0,
      count: options.count,
      analysisMode: options.analysisMode,
      pairedRecoveryRate: options.pairedRecoveryRate,
      modePairRate: options.modePairRate,
      study: options.study,
      overlayCount: options.overlayCount,
      overlayPlacementRetries: options.overlayPlacementRetries,
      expansionIds: options.expansionIds,
      timeoutSeconds: options.timeoutSeconds
    };
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const assets = await loadCalibrationAssets();
  const allInventory = describeCalibrationInventory(assets, config.expansionIds);
  const presets = buildInventoryPresets(
    assets,
    allInventory,
    describeCalibrationInventory,
    config.expansionIds
  );

  if (!options.resume) {
    header = makeRunHeader(config, presets);
    await writeFile(outputPath, `${JSON.stringify(header)}\n`, "utf8");
  }

  if (completed >= config.count) {
    process.stdout.write(`\r${config.count}/${config.count} | complete\n`);
    return;
  }

  const elapsedSamples = [];
  let scenarioCount = 0;
  let rejectionCount = 0;
  let setupInvalidCount = 0;
  let timeoutCount = 0;
  let errorCount = 0;
  let counterfactualCount = 0;
  let resampledConstructionCount = 0;
  let previousErrorSignature = null;
  let consecutiveSameErrors = 0;
  const seenErrorSignatures = new Set();
  const timeoutMs = Math.max(1000, Math.round(config.timeoutSeconds * 1000));

  for (let index = completed; index < config.count; index += 1) {
    const basePlan = buildObservationPlan(index, config, presets);
    const proposalLimit = (config.study === "overlay" && Number.isInteger(config.overlayCount))
      ? Math.max(1, config.overlayPlacementRetries)
      : 1;
    let plan = basePlan;
    let workerResult = null;
    let discardedConstructionRejections = 0;
    let proposalAttempts = 0;
    let proposalElapsedMs = 0;

    for (let proposalAttempt = 0; proposalAttempt < proposalLimit; proposalAttempt += 1) {
      proposalAttempts = proposalAttempt + 1;
      plan = {
        ...basePlan,
        observationSeed: proposalAttempt === 0
          ? basePlan.observationSeed
          : hash32(config.seed, "overlay-construction-retry", index, proposalAttempt),
        samplingProposalAttempts: proposalAttempts,
        discardedConstructionRejections,
        samplingProposalLimit: proposalLimit
      };
      workerResult = await runObservationWorker({
        plan,
        config: {
          analysisMode: config.analysisMode
        }
      }, timeoutMs);

      if (workerResult.kind === "result") {
        const attemptElapsed = Number(workerResult.payload?.measuredElapsed);
        if (Number.isFinite(attemptElapsed)) proposalElapsedMs += attemptElapsed;
      } else if (workerResult.kind === "timeout") {
        proposalElapsedMs += Number(workerResult.timeoutMs) || timeoutMs;
      }

      if (workerResult.kind !== "result") break;
      if (workerResult.payload?.generationStatus !== "construction-rejection") break;
      if (proposalAttempt + 1 >= proposalLimit) break;
      discardedConstructionRejections += 1;
    }

    plan = {
      ...plan,
      samplingProposalAttempts: proposalAttempts,
      discardedConstructionRejections,
      samplingProposalLimit: proposalLimit,
      samplingProposalElapsedMs: rounded(proposalElapsedMs, 2)
    };

    resampledConstructionCount += discardedConstructionRejections;

    let record;
    let generationStatus;
    if (workerResult.kind === "timeout") {
      timeoutCount += 1;
      generationStatus = "timeout";
      record = makeTimeoutRecord(config, plan, timeoutMs);
      previousErrorSignature = null;
      consecutiveSameErrors = 0;
    } else if (workerResult.kind === "error") {
      errorCount += 1;
      generationStatus = "error";
      const signature = String(workerResult.error || "Unknown calibration worker error").split("\n")[0];
      consecutiveSameErrors = signature === previousErrorSignature
        ? consecutiveSameErrors + 1
        : 1;
      previousErrorSignature = signature;
      if (!seenErrorSignatures.has(signature)) {
        seenErrorSignatures.add(signature);
        console.error(`\nUnexpected calibration error at observation ${index + 1}: ${signature}`);
      }
      record = {
        ...makeTimeoutRecord(config, plan, timeoutMs),
        generation: {
          status: "error",
          elapsedMs: null,
          evaluationsUsed: null,
          rejectionEvents: [],
          error: workerResult.error,
          timeout: null
        }
      };
    } else {
      const payload = workerResult.payload;
      generationStatus = payload.generationStatus;
      record = makeObservationRecord(config, plan, payload);
      previousErrorSignature = null;
      consecutiveSameErrors = 0;
      if (generationStatus === "scenario") scenarioCount += 1;
      else if (generationStatus === "setup-invalid") setupInvalidCount += 1;
      else rejectionCount += 1;
      if (generationStatus !== "setup-invalid") {
        const measuredElapsed = Number(plan.samplingProposalElapsedMs ?? payload.measuredElapsed);
        if (Number.isFinite(measuredElapsed)) elapsedSamples.push(measuredElapsed);
      }
      counterfactualCount += (payload.counterfactuals ?? []).filter((entry) => entry?.status !== "error").length;
    }

    await appendRecord(outputPath, record);

    const medianSeconds = quantile(elapsedSamples, 0.5);
    process.stdout.write(
      `\r${index + 1}/${config.count} | scenarios ${scenarioCount} | rejected ${rejectionCount} | setup-skip ${setupInvalidCount} | timeouts ${timeoutCount} | errors ${errorCount} | counterfactuals ${counterfactualCount} | resampled ${resampledConstructionCount} | median ${medianSeconds == null ? "n/a" : rounded(medianSeconds / 1000, 2)}s   `
    );

    if (generationStatus === "error" && consecutiveSameErrors >= 3) {
      throw new Error(
        `Aborting after ${consecutiveSameErrors} consecutive identical unexpected calibration errors: ${previousErrorSignature}`
      );
    }
  }

  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
