#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateCalibrationScenario,
  listCalibrationExpansionIds,
  loadCalibrationAssets,
  reanalyzeCalibrationScenario
} from "../main.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = dirname(SCRIPT_DIR);

const DEFAULTS = Object.freeze({
  runs: 500,
  playerCount: 4,
  flagCounts: [2, 3, 4, 5, 6],
  boardCounts: [1, 2, 3, 4],
  generationMode: "balanced",
  staggeredChance: 0.5,
  maxAttemptsPerSample: 12,
  seed: Date.now() >>> 0,
  outputRoot: join(PROJECT_DIR, "calibration-output"),
  verbose: false
});

function parseIntegerList(value, fallback) {
  if (!value) return [...fallback];
  const parsed = String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  return parsed.length ? [...new Set(parsed)] : [...fallback];
}

function parseArgs(argv) {
  const options = {
    runs: DEFAULTS.runs,
    playerCount: DEFAULTS.playerCount,
    flagCounts: [...DEFAULTS.flagCounts],
    boardCounts: [...DEFAULTS.boardCounts],
    generationMode: DEFAULTS.generationMode,
    staggeredChance: DEFAULTS.staggeredChance,
    maxAttemptsPerSample: DEFAULTS.maxAttemptsPerSample,
    seed: DEFAULTS.seed,
    outputRoot: DEFAULTS.outputRoot,
    expansionIds: null,
    verbose: DEFAULTS.verbose,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--runs") {
      options.runs = Math.max(1, Math.floor(Number(next()) || DEFAULTS.runs));
    } else if (arg === "--players") {
      options.playerCount = Math.max(2, Math.floor(Number(next()) || DEFAULTS.playerCount));
    } else if (arg === "--flags") {
      options.flagCounts = parseIntegerList(next(), DEFAULTS.flagCounts);
    } else if (arg === "--boards") {
      options.boardCounts = parseIntegerList(next(), DEFAULTS.boardCounts);
    } else if (arg === "--mode") {
      options.generationMode = String(next() || DEFAULTS.generationMode).trim().toLowerCase();
    } else if (arg === "--staggered-chance") {
      const value = Number(next());
      options.staggeredChance = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULTS.staggeredChance;
    } else if (arg === "--max-attempts") {
      options.maxAttemptsPerSample = Math.max(1, Math.floor(Number(next()) || DEFAULTS.maxAttemptsPerSample));
    } else if (arg === "--seed") {
      const value = Number(next());
      options.seed = Number.isFinite(value) ? (Math.floor(value) >>> 0) : DEFAULTS.seed;
    } else if (arg === "--sets") {
      const value = String(next() || "all").trim();
      options.expansionIds = value.toLowerCase() === "all"
        ? null
        : value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--output") {
      options.outputRoot = join(PROJECT_DIR, String(next() || "calibration-output"));
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Robo Rally calibration runner\n\nUsage:\n  node calibration-runner.js [options]\n\nOptions:\n  --runs N                 Analyzable course observations to collect (default ${DEFAULTS.runs})\n  --players N              Player count (default ${DEFAULTS.playerCount})\n  --flags 2,3,4,5,6        Flag counts to sample\n  --boards 1,2,3,4         Board counts to request\n  --sets all|id,id          Expansion IDs; default is every supported set found in data/\n  --mode balanced           Generation search profile; Balanced is the calibration reference\n  --staggered-chance 0.5    Probability of allowing staggered board placement\n  --max-attempts N          Raw physical candidates tried per requested observation (default ${DEFAULTS.maxAttemptsPerSample})\n  --seed N                  Deterministic random seed\n  --output NAME             Output folder under the project root\n  --verbose, -v             Print detailed setup, raw-attempt and summary lines\n  --help                    Show this message\n\nEach requested observation retries fresh physical candidates until one is analyzable (or the per-observation attempt limit is reached). Each successfully built physical course is then evaluated twice: ordinary reboot-token\nrecovery and Dynamic Archiving. Both analyses use the same boards, rotations, layout,\ndocks and flags. No third-party packages are required.`);
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

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

function rounded(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = Array.isArray(value) ? value.join("|") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(columns, row) {
  return `${columns.map((column) => csvValue(row[column])).join(",")}\n`;
}

function rotatedSize(piece, rotation = 0) {
  const quarterTurn = rotation === 90 || rotation === 270;
  return {
    width: quarterTurn ? piece.height : piece.width,
    height: quarterTurn ? piece.width : piece.height
  };
}

function placementRect(placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  if (!piece) return null;
  const size = rotatedSize(piece, placement.rotation ?? 0);
  return {
    x: placement.x,
    y: placement.y,
    width: size.width,
    height: size.height
  };
}

function overlapLength(startA, lengthA, startB, lengthB) {
  return Math.max(0, Math.min(startA + lengthA, startB + lengthB) - Math.max(startA, startB));
}

function sharedEdgeLength(left, right) {
  if (!left || !right) return 0;
  if (left.x + left.width === right.x || right.x + right.width === left.x) {
    return overlapLength(left.y, left.height, right.y, right.height);
  }
  if (left.y + left.height === right.y || right.y + right.height === left.y) {
    return overlapLength(left.x, left.width, right.x, right.width);
  }
  return 0;
}

function pointInRect(point, rect) {
  return Boolean(rect) && point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

function graphDistances(adjacency, sources) {
  const distances = new Map();
  const queue = [];
  for (const source of sources) {
    distances.set(source, 0);
    queue.push(source);
  }
  while (queue.length) {
    const current = queue.shift();
    const nextDistance = distances.get(current) + 1;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, nextDistance);
      queue.push(next);
    }
  }
  return distances;
}

function summarizeLayout(scenario) {
  const rects = scenario.boardRects ?? [];
  if (!rects.length) {
    return {
      bboxWidth: null,
      bboxHeight: null,
      bboxArea: null,
      boardArea: null,
      compactness: null,
      adjacencyCount: 0,
      sharedEdge: 0,
      graphDiameter: null,
      dockFarthestGraphDistance: null,
      adjacency: new Map(),
      flagBoardIndices: []
    };
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;
  const bboxArea = bboxWidth * bboxHeight;
  const boardArea = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const adjacency = new Map(rects.map((_, index) => [index, new Set()]));
  let adjacencyCount = 0;
  let sharedEdge = 0;

  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      const edge = sharedEdgeLength(rects[left], rects[right]);
      if (edge <= 0) continue;
      adjacency.get(left).add(right);
      adjacency.get(right).add(left);
      adjacencyCount += 1;
      sharedEdge += edge;
    }
  }

  let graphDiameter = 0;
  for (let source = 0; source < rects.length; source += 1) {
    const distances = graphDistances(adjacency, [source]);
    for (const distance of distances.values()) graphDiameter = Math.max(graphDiameter, distance);
  }

  const pieceMap = scenario.pieceMap;
  const dockRects = (scenario.dockPlacements ?? [])
    .map((placement) => placementRect(placement, pieceMap))
    .filter(Boolean);
  const dockAdjacentBoards = new Set();
  for (let boardIndex = 0; boardIndex < rects.length; boardIndex += 1) {
    for (const dockRect of dockRects) {
      if (sharedEdgeLength(rects[boardIndex], dockRect) > 0) {
        dockAdjacentBoards.add(boardIndex);
      }
    }
  }
  const dockDistances = graphDistances(adjacency, [...dockAdjacentBoards]);
  const dockFarthestGraphDistance = dockDistances.size
    ? Math.max(...dockDistances.values())
    : null;

  const flagBoardIndices = (scenario.checkpoints ?? []).map((flag) => {
    const index = rects.findIndex((rect) => pointInRect(flag, rect));
    return index >= 0 ? index : null;
  });

  return {
    bboxWidth,
    bboxHeight,
    bboxArea,
    boardArea,
    compactness: bboxArea > 0 ? boardArea / bboxArea : null,
    adjacencyCount,
    sharedEdge,
    graphDiameter,
    dockFarthestGraphDistance,
    adjacency,
    flagBoardIndices
  };
}

function summarizeFlags(scenario, layout) {
  const flags = scenario.checkpoints ?? [];
  const starts = scenario.activeStarts ?? [];
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const firstFlag = flags[0] ?? null;
  const firstDistances = firstFlag ? starts.map((start) => manhattan(start, firstFlag)) : [];
  const sequentialDistances = [];
  const boardGraphDistances = [];
  let crossBoardLegs = 0;

  for (let index = 1; index < flags.length; index += 1) {
    sequentialDistances.push(manhattan(flags[index - 1], flags[index]));
    const fromBoard = layout.flagBoardIndices[index - 1];
    const toBoard = layout.flagBoardIndices[index];
    if (Number.isInteger(fromBoard) && Number.isInteger(toBoard)) {
      if (fromBoard !== toBoard) crossBoardLegs += 1;
      const distances = graphDistances(layout.adjacency, [fromBoard]);
      const distance = distances.get(toBoard);
      if (Number.isFinite(distance)) boardGraphDistances.push(distance);
    }
  }

  return {
    firstStartDistanceMean: mean(firstDistances),
    firstStartDistanceMin: firstDistances.length ? Math.min(...firstDistances) : null,
    firstStartDistanceMax: firstDistances.length ? Math.max(...firstDistances) : null,
    sequentialDistanceSum: sequentialDistances.reduce((sum, value) => sum + value, 0),
    sequentialDistanceMean: mean(sequentialDistances),
    sequentialDistanceMax: sequentialDistances.length ? Math.max(...sequentialDistances) : null,
    crossBoardLegs,
    boardGraphDistanceSum: boardGraphDistances.reduce((sum, value) => sum + value, 0),
    boardGraphDistanceMax: boardGraphDistances.length ? Math.max(...boardGraphDistances) : null
  };
}

function summarizeBoardProfiles(scenario) {
  const profiles = (scenario.mainBoardIds ?? [])
    .map((id) => scenario.pieceMap[id]?.boardProfile)
    .filter(Boolean);
  const profileMean = (selector) => mean(profiles.map(selector));
  const signalSum = (key) => profiles.reduce((sum, profile) => sum + (Number(profile.signals?.[key]) || 0), 0);

  return {
    profileOverallMean: profileMean((profile) => profile.overall),
    profileHazardMean: profileMean((profile) => profile.bias?.hazard),
    profileCongestionMean: profileMean((profile) => profile.bias?.congestion),
    profileComplexityMean: profileMean((profile) => profile.bias?.complexity),
    profileSwinginessMean: profileMean((profile) => profile.swinginess),
    profileDensityMean: profileMean((profile) => profile.density),
    pitCount: signalSum("pitCount"),
    beltCount: signalSum("beltCount"),
    portalCount: signalSum("portalCount"),
    teleporterCount: signalSum("teleporterCount"),
    randomizerCount: signalSum("randomizerCount"),
    crusherCount: signalSum("crusherCount"),
    pushCount: signalSum("pushCount"),
    hazardCount: signalSum("hazardCount")
  };
}

function summarizeRoutes(analysisScenario) {
  const starts = analysisScenario?.sequence?.firstLeg?.starts ?? [];
  const routes = starts
    .filter((entry) => entry?.reachable && entry?.fullCourseRoute)
    .map((entry) => entry.fullCourseRoute);
  const rebootCounts = routes.map((route) => (route.transitions ?? []).filter((transition) => transition?.rebooted).length);
  return {
    selectedRouteCount: routes.length,
    routeActionsMean: mean(routes.map((route) => Number(route.actions))),
    routeActionsMedian: median(routes.map((route) => Number(route.actions))),
    routeScoreMean: mean(routes.map((route) => Number(route.score))),
    routesUsingReboot: rebootCounts.filter((count) => count > 0).length,
    rebootCountMean: mean(rebootCounts),
    rebootCountMax: rebootCounts.length ? Math.max(...rebootCounts) : null
  };
}

function summarizeAnalysis(analysisScenario, prefix) {
  const metrics = analysisScenario?.metrics;
  const sequence = analysisScenario?.sequence;
  const first = sequence?.firstLeg?.summary;
  const lengthInputs = metrics?.lengthMetrics?.inputs ?? {};
  const lengthContributions = metrics?.lengthMetrics?.contributions ?? {};
  const later = sequence?.legs?.slice(1) ?? [];
  const route = summarizeRoutes(analysisScenario);
  const preflight = first?.coursePreflight ?? null;
  const telemetry = analysisScenario?.telemetry ?? null;

  return {
    [`${prefix}_acceptable`]: metrics?.acceptable ?? null,
    [`${prefix}_difficulty_raw`]: rounded(metrics?.difficultyRaw),
    [`${prefix}_length_raw`]: rounded(metrics?.lengthRaw),
    [`${prefix}_fairness_sd`]: rounded(metrics?.fairnessStdDev),
    [`${prefix}_checkpoint_pressure`]: rounded(metrics?.checkpointPressure),
    [`${prefix}_hard_failures`]: metrics?.hardFailures ?? [],
    [`${prefix}_usable_starts`]: metrics?.usableStarts?.length ?? null,
    [`${prefix}_total_difficulty`]: rounded(sequence?.summary?.totalDifficulty),
    [`${prefix}_total_length`]: rounded(sequence?.summary?.totalLength),
    [`${prefix}_total_actions`]: rounded(sequence?.summary?.totalActions),
    [`${prefix}_opening_difficulty`]: rounded(first?.difficultyScore),
    [`${prefix}_opening_traffic`]: rounded(first?.averageTrafficPenalty),
    [`${prefix}_flag_area`]: rounded(first?.flagAreaScore),
    [`${prefix}_later_route_score_mean`]: rounded(mean(later.map((leg) => Number(leg.analysis?.summary?.averageRouteScore)))),
    [`${prefix}_later_congestion_mean`]: rounded(mean(later.map((leg) => Number(leg.analysis?.summary?.congestionScore)))),
    [`${prefix}_route_distance`]: rounded(lengthInputs.totalRouteDistance),
    [`${prefix}_action_load_input`]: rounded(lengthInputs.totalActionLoad),
    [`${prefix}_congestion_input`]: rounded(lengthInputs.totalCongestion),
    [`${prefix}_board_harshness`]: rounded(lengthContributions.boardHarshness),
    [`${prefix}_route_load`]: rounded(lengthContributions.routeLoad),
    [`${prefix}_friction_load`]: rounded(lengthContributions.frictionLoad),
    [`${prefix}_selected_route_count`]: route.selectedRouteCount,
    [`${prefix}_route_actions_mean`]: rounded(route.routeActionsMean),
    [`${prefix}_route_actions_median`]: rounded(route.routeActionsMedian),
    [`${prefix}_route_score_mean`]: rounded(route.routeScoreMean),
    [`${prefix}_routes_using_reboot`]: route.routesUsingReboot,
    [`${prefix}_reboot_count_mean`]: rounded(route.rebootCountMean),
    [`${prefix}_reboot_count_max`]: route.rebootCountMax,
    [`${prefix}_preflight_difficulty`]: rounded(preflight?.difficultyRaw),
    [`${prefix}_preflight_length`]: rounded(preflight?.lengthRaw),
    [`${prefix}_preflight_expansions`]: preflight?.routeExpansions ?? null,
    [`${prefix}_elapsed_ms`]: rounded(analysisScenario?.elapsedMs, 2),
    [`${prefix}_searches`]: telemetry?.routeSearchCount ?? null,
    [`${prefix}_expansions`]: telemetry?.totalExpansions ?? null,
    [`${prefix}_capped_searches`]: telemetry?.cappedSearches ?? null
  };
}

function summarizeRejectionEvents(events = []) {
  const categoryCounts = new Map();
  const reasons = [];
  for (const event of events ?? []) {
    const category = event?.category || "other";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    const reason = event?.reason ? String(event.reason) : "";
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  }
  return {
    categories: [...categoryCounts.entries()]
      .map(([category, count]) => `${category}:${count}`),
    reasons
  };
}

const ANALYSIS_SUFFIXES = [
  "acceptable",
  "difficulty_raw",
  "length_raw",
  "fairness_sd",
  "checkpoint_pressure",
  "hard_failures",
  "usable_starts",
  "total_difficulty",
  "total_length",
  "total_actions",
  "opening_difficulty",
  "opening_traffic",
  "flag_area",
  "later_route_score_mean",
  "later_congestion_mean",
  "route_distance",
  "action_load_input",
  "congestion_input",
  "board_harshness",
  "route_load",
  "friction_load",
  "selected_route_count",
  "route_actions_mean",
  "route_actions_median",
  "route_score_mean",
  "routes_using_reboot",
  "reboot_count_mean",
  "reboot_count_max",
  "preflight_difficulty",
  "preflight_length",
  "preflight_expansions",
  "elapsed_ms",
  "searches",
  "expansions",
  "capped_searches"
];

const COURSE_COLUMNS = [
  "run_id",
  "candidate_index",
  "seed",
  "player_count",
  "requested_board_count",
  "actual_board_count",
  "requested_flag_count",
  "actual_flag_count",
  "staggered_requested",
  "generation_mode",
  "generation_attempts",
  "generation_failures_before_success",
  "sets",
  "normal_status",
  "dynamic_status",
  "error",
  "boards",
  "rotations",
  "bbox_width",
  "bbox_height",
  "bbox_area",
  "board_area",
  "compactness",
  "adjacency_count",
  "shared_edge",
  "graph_diameter",
  "dock_farthest_graph_distance",
  "first_start_distance_mean",
  "first_start_distance_min",
  "first_start_distance_max",
  "sequential_flag_distance_sum",
  "sequential_flag_distance_mean",
  "sequential_flag_distance_max",
  "cross_board_legs",
  "flag_board_graph_distance_sum",
  "flag_board_graph_distance_max",
  "profile_overall_mean",
  "profile_hazard_mean",
  "profile_congestion_mean",
  "profile_complexity_mean",
  "profile_swinginess_mean",
  "profile_density_mean",
  "pit_count",
  "belt_count",
  "portal_count",
  "teleporter_count",
  "randomizer_count",
  "crusher_count",
  "push_count",
  "hazard_count",
  ...ANALYSIS_SUFFIXES.map((suffix) => `normal_${suffix}`),
  ...ANALYSIS_SUFFIXES.map((suffix) => `dynamic_${suffix}`),
  "delta_difficulty_dynamic_minus_normal",
  "delta_length_dynamic_minus_normal"
];

const ATTEMPT_COLUMNS = [
  "run_id",
  "candidate_index",
  "raw_attempt_index",
  "attempt_within_candidate",
  "seed",
  "player_count",
  "requested_board_count",
  "requested_flag_count",
  "staggered_requested",
  "generation_mode",
  "sets",
  "status",
  "evaluations_used",
  "rejection_categories",
  "rejection_reasons",
  "elapsed_ms",
  "route_searches",
  "route_expansions",
  "capped_searches",
  "error"
];

const BOARD_COLUMNS = [
  "run_id",
  "candidate_index",
  "board_index",
  "piece_id",
  "physical_board_id",
  "expansion_id",
  "kind",
  "rotation",
  "x",
  "y",
  "width",
  "height",
  "profile_band",
  "profile_overall",
  "profile_hazard",
  "profile_congestion",
  "profile_complexity",
  "profile_swinginess",
  "profile_density",
  "profile_hazard_density",
  "pit_count",
  "belt_count",
  "portal_count",
  "teleporter_count",
  "randomizer_count",
  "crusher_count",
  "push_count",
  "hazard_count"
];

function buildBoardRows(runId, candidateIndex, scenario) {
  return (scenario.boardRects ?? []).map((rect, boardIndex) => {
    const piece = scenario.pieceMap[rect.pieceId];
    const profile = piece?.boardProfile ?? {};
    const signals = profile.signals ?? {};
    const placement = (scenario.placements ?? []).find((item) => item.pieceId === rect.pieceId && item.x === rect.x && item.y === rect.y && !item.overlay);
    return {
      run_id: runId,
      candidate_index: candidateIndex,
      board_index: boardIndex + 1,
      piece_id: rect.pieceId,
      physical_board_id: piece?.physicalBoardId ?? piece?.id ?? rect.pieceId,
      expansion_id: piece?.expansionId ?? "",
      kind: piece?.kind ?? "",
      rotation: placement?.rotation ?? "",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      profile_band: profile.band ?? "",
      profile_overall: rounded(profile.overall),
      profile_hazard: rounded(profile.bias?.hazard),
      profile_congestion: rounded(profile.bias?.congestion),
      profile_complexity: rounded(profile.bias?.complexity),
      profile_swinginess: rounded(profile.swinginess),
      profile_density: rounded(profile.density),
      profile_hazard_density: rounded(profile.hazardDensity),
      pit_count: signals.pitCount ?? 0,
      belt_count: signals.beltCount ?? 0,
      portal_count: signals.portalCount ?? 0,
      teleporter_count: signals.teleporterCount ?? 0,
      randomizer_count: signals.randomizerCount ?? 0,
      crusher_count: signals.crusherCount ?? 0,
      push_count: signals.pushCount ?? 0,
      hazard_count: signals.hazardCount ?? 0
    };
  });
}

function timestampId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatSeconds(ms) {
  if (!Number.isFinite(ms)) return "?";
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

function formatCompactDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${String(remainingMinutes).padStart(2, "0")}m`;
}

function clearLiveProgress() {
  if (!process.stdout.isTTY) return;
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function writeLiveProgress(message, verbose = false) {
  if (verbose || !process.stdout.isTTY) return;
  clearLiveProgress();
  process.stdout.write(message);
}

const PROGRESS_BAR_WIDTH = 32;

function renderProgressBar(completed, total, partial = 0) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const progress = Math.max(0, Math.min(1, (Number(completed) + Number(partial || 0)) / safeTotal));
  const filled = Math.max(0, Math.min(PROGRESS_BAR_WIDTH, Math.floor(progress * PROGRESS_BAR_WIDTH)));
  const bar = `${"#".repeat(filled)}${"-".repeat(PROGRESS_BAR_WIDTH - filled)}`;
  const percent = Math.floor(progress * 100);
  return `Calibration [${bar}] ${String(percent).padStart(3, " ")}% ${Math.min(Number(completed) || 0, safeTotal)}/${safeTotal}`;
}

function writeCalibrationProgress(completed, total, partial = 0, verbose = false) {
  writeLiveProgress(renderProgressBar(completed, total, partial), verbose);
}

function logProgressLine(message) {
  clearLiveProgress();
  console.log(message);
}

async function withQuietGeneratorConsole(verbose, task) {
  if (verbose) {
    return await task();
  }

  // Production generation diagnostics are valuable in the browser and in
  // --verbose calibration runs, but the default calibration terminal is meant
  // to be only a heartbeat. Keep recoverable generator chatter in the CSVs and
  // run summary instead of breaking the single in-place progress bar.
  const methods = ["log", "debug", "info", "warn", "error"];
  const originals = new Map(methods.map((method) => [method, console[method]]));
  for (const method of methods) {
    console[method] = () => {};
  }

  try {
    return await task();
  } finally {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  }
}

async function main() {
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

  Math.random = mulberry32(options.seed);

  if (options.verbose) {
    console.log("Loading Robo Rally data...");
  } else {
    writeCalibrationProgress(0, options.runs, 0, false);
  }
  const assets = await loadCalibrationAssets();
  const availableExpansionIds = listCalibrationExpansionIds(assets);
  const expansionIds = options.expansionIds?.length
    ? options.expansionIds.filter((id) => availableExpansionIds.includes(id))
    : availableExpansionIds;
  const unknownExpansionIds = options.expansionIds?.filter((id) => !availableExpansionIds.includes(id)) ?? [];
  if (unknownExpansionIds.length) {
    console.warn(`Ignoring unknown set IDs: ${unknownExpansionIds.join(", ")}`);
  }
  if (!expansionIds.length) {
    throw new Error("No supported expansion data selected.");
  }

  const runId = timestampId();
  const outputDir = join(options.outputRoot, `run-${runId}`);
  await mkdir(outputDir, { recursive: true });
  const coursesPath = join(outputDir, "calibration-courses.csv");
  const boardsPath = join(outputDir, "calibration-boards.csv");
  const attemptsPath = join(outputDir, "calibration-attempts.csv");
  const summaryPath = join(outputDir, "run-summary.txt");
  await writeFile(coursesPath, `${COURSE_COLUMNS.join(",")}\n`, "utf8");
  await writeFile(boardsPath, `${BOARD_COLUMNS.join(",")}\n`, "utf8");
  await writeFile(attemptsPath, `${ATTEMPT_COLUMNS.join(",")}\n`, "utf8");

  const startedAt = performance.now();
  let physicalScenarios = 0;
  let dynamicSuccesses = 0;
  let failures = 0;
  let rawAttempts = 0;
  let exhaustedSamples = 0;

  if (options.verbose) {
    console.log(`Run: ${runId}`);
    console.log(`Candidates: ${options.runs}; players: ${options.playerCount}; mode: ${options.generationMode}`);
    console.log(`Boards: ${options.boardCounts.join(",")}; flags: ${options.flagCounts.join(",")}; staggered chance: ${options.staggeredChance}`);
    console.log(`Raw candidate limit per observation: ${options.maxAttemptsPerSample}`);
    console.log(`Sets: ${expansionIds.join(", ")}`);
    console.log(`Seed: ${options.seed}`);
    console.log(`Output: ${outputDir}`);
    console.log("");
  } else {
    writeCalibrationProgress(0, options.runs, 0, false);
  }

  for (let candidateIndex = 1; candidateIndex <= options.runs; candidateIndex += 1) {
    const requestedBoardCount = choose(options.boardCounts);
    const requestedFlagCount = choose(options.flagCounts);
    const staggered = Math.random() < options.staggeredChance;
    let generated = null;
    let normalScenario = null;
    let dynamicScenario = null;
    let normalStatus = "no-scenario";
    let dynamicStatus = "not-run";
    let errorText = "";
    let generationAttempts = 0;

    for (let attemptWithinCandidate = 1; attemptWithinCandidate <= options.maxAttemptsPerSample; attemptWithinCandidate += 1) {
      generationAttempts = attemptWithinCandidate;
      rawAttempts += 1;
      const attemptStartedAt = performance.now();
      const livePrefix = `Obs ${candidateIndex}/${options.runs} | try ${attemptWithinCandidate}/${options.maxAttemptsPerSample} | raw ${rawAttempts}`;
      const attemptPartial = Math.min(0.8, (attemptWithinCandidate / Math.max(1, options.maxAttemptsPerSample)) * 0.8);
      writeCalibrationProgress(candidateIndex - 1, options.runs, attemptPartial, options.verbose);
      if (options.verbose) {
        console.log(
          `${livePrefix} | boards ${requestedBoardCount} | flags ${requestedFlagCount} | staggered ${staggered ? "yes" : "no"}`
        );
      }
      let attemptStatus = "no-scenario";
      let attemptError = "";
      let attemptResult = null;

      try {
        attemptResult = await withQuietGeneratorConsole(options.verbose, () =>
          generateCalibrationScenario(assets, {
            playerCount: options.playerCount,
            boardCount: requestedBoardCount,
            flagCount: requestedFlagCount,
            staggered,
            generationMode: options.generationMode,
            expansionIds
          })
        );
        if (attemptResult?.scenario) {
          attemptStatus = "scenario";
          generated = attemptResult;
          normalScenario = attemptResult.scenario;
        }
      } catch (error) {
        failures += 1;
        attemptStatus = "error";
        attemptError = error?.message ?? String(error);
        errorText = attemptError;
      }

      const rejectionSummary = summarizeRejectionEvents(attemptResult?.rejectionEvents ?? []);
      const attemptTelemetry = attemptResult?.telemetry ?? null;
      const attemptRow = {
        run_id: runId,
        candidate_index: candidateIndex,
        raw_attempt_index: rawAttempts,
        attempt_within_candidate: attemptWithinCandidate,
        seed: options.seed,
        player_count: options.playerCount,
        requested_board_count: requestedBoardCount,
        requested_flag_count: requestedFlagCount,
        staggered_requested: staggered,
        generation_mode: options.generationMode,
        sets: expansionIds,
        status: attemptStatus,
        evaluations_used: attemptResult?.evaluationsUsed ?? null,
        rejection_categories: rejectionSummary.categories,
        rejection_reasons: rejectionSummary.reasons,
        elapsed_ms: rounded(attemptResult?.elapsedMs, 2),
        route_searches: attemptTelemetry?.routeSearchCount ?? null,
        route_expansions: attemptTelemetry?.totalExpansions ?? null,
        capped_searches: attemptTelemetry?.cappedSearches ?? null,
        error: attemptError
      };
      await appendFile(attemptsPath, csvLine(ATTEMPT_COLUMNS, attemptRow), "utf8");

      if (options.verbose) {
        const attemptElapsed = performance.now() - attemptStartedAt;
        const expansionText = Number.isFinite(Number(attemptTelemetry?.totalExpansions))
          ? ` | ${attemptTelemetry.totalExpansions} exp`
          : "";
        const cappedText = Number.isFinite(Number(attemptTelemetry?.cappedSearches))
          ? ` | ${attemptTelemetry.cappedSearches} capped`
          : "";
        console.log(`  -> ${attemptStatus} | ${formatSeconds(attemptElapsed)}${expansionText}${cappedText}`);
      }

      if (normalScenario) break;
    }

    if (normalScenario) {
      physicalScenarios += 1;
      normalStatus = "ok";
      normalScenario.elapsedMs = generated.elapsedMs;
      normalScenario.telemetry = generated.telemetry;
      writeCalibrationProgress(candidateIndex - 1, options.runs, 0.9, options.verbose);
      if (options.verbose) {
        console.log(`  -> physical scenario found; running paired Dynamic Archiving analysis`);
      }
      try {
        dynamicScenario = await withQuietGeneratorConsole(options.verbose, () =>
          reanalyzeCalibrationScenario(assets, normalScenario, {
            dynamicArchiving: true,
            playerCount: options.playerCount,
            generationMode: options.generationMode
          })
        );
        if (dynamicScenario) {
          dynamicSuccesses += 1;
          dynamicStatus = "ok";
        } else {
          dynamicStatus = "no-scenario";
        }
      } catch (error) {
        dynamicStatus = "error";
        errorText = `Dynamic Archiving: ${error?.message ?? String(error)}`;
      }
    } else {
      exhaustedSamples += 1;
      normalStatus = "exhausted";
    }

    const baseRow = {
      run_id: runId,
      candidate_index: candidateIndex,
      seed: options.seed,
      player_count: options.playerCount,
      requested_board_count: requestedBoardCount,
      actual_board_count: normalScenario?.boardCount ?? normalScenario?.boardRects?.length ?? "",
      requested_flag_count: requestedFlagCount,
      actual_flag_count: normalScenario?.checkpoints?.length ?? "",
      staggered_requested: staggered,
      generation_mode: options.generationMode,
      generation_attempts: generationAttempts,
      generation_failures_before_success: normalScenario ? Math.max(0, generationAttempts - 1) : generationAttempts,
      sets: expansionIds,
      normal_status: normalStatus,
      dynamic_status: dynamicStatus,
      error: errorText,
      boards: normalScenario?.mainBoardIds ?? [],
      rotations: normalScenario?.mainRotations ?? []
    };

    if (normalScenario) {
      const layout = summarizeLayout(normalScenario);
      const flags = summarizeFlags(normalScenario, layout);
      const profiles = summarizeBoardProfiles(normalScenario);
      Object.assign(baseRow, {
        bbox_width: layout.bboxWidth,
        bbox_height: layout.bboxHeight,
        bbox_area: layout.bboxArea,
        board_area: layout.boardArea,
        compactness: rounded(layout.compactness),
        adjacency_count: layout.adjacencyCount,
        shared_edge: layout.sharedEdge,
        graph_diameter: layout.graphDiameter,
        dock_farthest_graph_distance: layout.dockFarthestGraphDistance,
        first_start_distance_mean: rounded(flags.firstStartDistanceMean),
        first_start_distance_min: flags.firstStartDistanceMin,
        first_start_distance_max: flags.firstStartDistanceMax,
        sequential_flag_distance_sum: flags.sequentialDistanceSum,
        sequential_flag_distance_mean: rounded(flags.sequentialDistanceMean),
        sequential_flag_distance_max: flags.sequentialDistanceMax,
        cross_board_legs: flags.crossBoardLegs,
        flag_board_graph_distance_sum: flags.boardGraphDistanceSum,
        flag_board_graph_distance_max: flags.boardGraphDistanceMax,
        profile_overall_mean: rounded(profiles.profileOverallMean),
        profile_hazard_mean: rounded(profiles.profileHazardMean),
        profile_congestion_mean: rounded(profiles.profileCongestionMean),
        profile_complexity_mean: rounded(profiles.profileComplexityMean),
        profile_swinginess_mean: rounded(profiles.profileSwinginessMean),
        profile_density_mean: rounded(profiles.profileDensityMean),
        pit_count: profiles.pitCount,
        belt_count: profiles.beltCount,
        portal_count: profiles.portalCount,
        teleporter_count: profiles.teleporterCount,
        randomizer_count: profiles.randomizerCount,
        crusher_count: profiles.crusherCount,
        push_count: profiles.pushCount,
        hazard_count: profiles.hazardCount
      });
      Object.assign(baseRow, summarizeAnalysis(normalScenario, "normal"));
      if (dynamicScenario) Object.assign(baseRow, summarizeAnalysis(dynamicScenario, "dynamic"));

      const normalDifficulty = baseRow.normal_difficulty_raw === "" ? NaN : Number(baseRow.normal_difficulty_raw);
      const dynamicDifficulty = baseRow.dynamic_difficulty_raw === "" ? NaN : Number(baseRow.dynamic_difficulty_raw);
      const normalLength = baseRow.normal_length_raw === "" ? NaN : Number(baseRow.normal_length_raw);
      const dynamicLength = baseRow.dynamic_length_raw === "" ? NaN : Number(baseRow.dynamic_length_raw);
      baseRow.delta_difficulty_dynamic_minus_normal = Number.isFinite(normalDifficulty) && Number.isFinite(dynamicDifficulty)
        ? rounded(dynamicDifficulty - normalDifficulty)
        : "";
      baseRow.delta_length_dynamic_minus_normal = Number.isFinite(normalLength) && Number.isFinite(dynamicLength)
        ? rounded(dynamicLength - normalLength)
        : "";

      for (const boardRow of buildBoardRows(runId, candidateIndex, normalScenario)) {
        await appendFile(boardsPath, csvLine(BOARD_COLUMNS, boardRow), "utf8");
      }
    }

    await appendFile(coursesPath, csvLine(COURSE_COLUMNS, baseRow), "utf8");

    if (options.verbose && (candidateIndex === 1 || candidateIndex % 10 === 0 || candidateIndex === options.runs)) {
      const elapsed = performance.now() - startedAt;
      const perCandidate = elapsed / candidateIndex;
      const remaining = perCandidate * (options.runs - candidateIndex);
      logProgressLine(
        `${candidateIndex}/${options.runs} observations | physical ${physicalScenarios} | DA pairs ${dynamicSuccesses} | exhausted ${exhaustedSamples} | raw attempts ${rawAttempts} | errors ${failures} | elapsed ${formatSeconds(elapsed)} | ETA ${formatSeconds(remaining)}`
      );
    } else if (!options.verbose) {
      writeCalibrationProgress(candidateIndex, options.runs, 0, false);
    }
  }

  const elapsedMs = performance.now() - startedAt;
  const summary = [
    "Robo Rally calibration run",
    `Run ID: ${runId}`,
    `Seed: ${options.seed}`,
    `Observations requested: ${options.runs}`,
    `Raw physical candidates attempted: ${rawAttempts}`,
    `Physical scenarios produced: ${physicalScenarios}`,
    `Dynamic Archiving paired analyses produced: ${dynamicSuccesses}`,
    `Observations exhausted without an analyzable scenario: ${exhaustedSamples}`,
    `Top-level generation errors: ${failures}`,
    `Players: ${options.playerCount}`,
    `Generation mode: ${options.generationMode}`,
    `Verbose console output: ${options.verbose ? "yes" : "no"}`,
    `Requested board counts: ${options.boardCounts.join(", ")}`,
    `Requested flag counts: ${options.flagCounts.join(", ")}`,
    `Staggered chance: ${options.staggeredChance}`,
    `Raw candidate limit per observation: ${options.maxAttemptsPerSample}`,
    `Sets: ${expansionIds.join(", ")}`,
    `Elapsed: ${formatSeconds(elapsedMs)}`,
    `Courses CSV: ${coursesPath}`,
    `Boards CSV: ${boardsPath}`,
    `Attempts CSV: ${attemptsPath}`,
    "",
    "Dynamic Archiving is evaluated on the same physical boards, rotations, docks and flags as the ordinary-recovery course.",
    "The runner does not modify live generator weights or acceptance rules."
  ].join("\n");
  await writeFile(summaryPath, `${summary}\n`, "utf8");

  clearLiveProgress();
  if (options.verbose) {
    console.log("");
    console.log(summary);
  } else {
    console.log(`${renderProgressBar(options.runs, options.runs)} done`);
    console.log(`Output: ${outputDir}`);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});