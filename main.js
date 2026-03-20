import { render } from "./render.js";
import { analyzeCourse, analyzeFlagLeg } from "./analyze.js";
import {
  buildMainFootprintTiles,
  buildResolvedMap,
  getBoundaryEdges,
  getValidDockRuns,
  groupBoundaryRuns,
  placePiece,
  projectDockPlacement,
  rotatedDimensions,
  validateDockPlacement,
  validateMainBoardLayout
} from "./board.js";

const ROTATIONS = [0, 90, 180, 270];
const FACINGS = ["N", "E", "S", "W"];
const DOCK_SIDES = ["left", "top", "right", "bottom"];
const MAX_ATTEMPTS = 120;
const MIN_LENGTH_RAW = 28;
const MIN_SHARED_EDGE = 5;
const OVERLAY_UPDATE_INTERVAL = 4;

let currentScenario = null;
let cachedAssets = null;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadAssets() {
  if (cachedAssets) {
    return cachedAssets;
  }

  const cactus = await loadJSON("./data/cactus.json");
  const energize = await loadJSON("./data/energize.json");
  const misdirection = await loadJSON("./data/misdirection.json");
  const steps = await loadJSON("./data/steps.json");
  const inAndOut = await loadJSON("./data/in-and-out.json");
  const theKeep = await loadJSON("./data/the-keep.json");
  const tempest = await loadJSON("./data/tempest.json");
  const sidewinder = await loadJSON("./data/sidewinder.json");
  const dock = await loadJSON("./data/docking-bay-a.json");
  const pieceMap = {
    cactus,
    energize,
    misdirection,
    steps,
    "in-and-out": inAndOut,
    "the-keep": theKeep,
    tempest,
    sidewinder,
    "docking-bay-a": dock
  };

  for (const piece of Object.values(pieceMap)) {
    piece.derivedBias = deriveBoardBias(piece);
  }

  const imageMap = {};
  for (const piece of Object.values(pieceMap)) {
    if (piece.image) {
      imageMap[piece.id] = await loadImage(piece.image);
    }
  }

  cachedAssets = { pieceMap, imageMap };
  return cachedAssets;
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const out = [...items];

  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }

  return out;
}

function sampleMany(items, count) {
  const pool = [...items];
  const out = [];

  while (pool.length && out.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }

  return out;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}

function deriveBoardBias(piece) {
  if (piece.kind !== "base") {
    return {
      hazard: 1,
      congestion: 1,
      complexity: 1
    };
  }

  const tiles = piece.tiles || [];
  const area = Math.max(1, piece.width * piece.height);
  let hazardWeight = 0;
  let congestionWeight = 0;
  let complexityWeight = 0;

  for (const tile of tiles) {
    for (const feature of tile.features || []) {
      if (feature.type === "pit") {
        hazardWeight += 3;
      } else if (feature.type === "laser") {
        hazardWeight += 2 + (feature.damage || 1) * 0.35;
      } else if (feature.type === "push") {
        hazardWeight += 1;
        complexityWeight += 1.2;
      } else if (feature.type === "belt") {
        complexityWeight += feature.speed === 2 ? 2 : 1.2;
      } else if (feature.type === "gear") {
        complexityWeight += 1.4;
      } else if (feature.type === "wall") {
        congestionWeight += Math.max(1, (feature.sides || []).length) * 1.25;
      } else if (feature.type === "battery") {
        hazardWeight -= 0.35;
      }
    }
  }

  return {
    hazard: normalizeBias(hazardWeight / area * 10),
    congestion: normalizeBias(congestionWeight / area * 9),
    complexity: normalizeBias(complexityWeight / area * 9)
  };
}

function guidanceLevelForAttempt(attempt) {
  if (attempt >= 36) return 2;
  if (attempt >= 13) return 1;
  return 0;
}

function weightedFlagCount(lengthPreference, maxFlags) {
  const table = {
    short: [2, 2, 2, 3, 3],
    moderate: [2, 3, 3, 4, 4],
    long: [3, 4, 4, 5, 5, 6]
  };

  const candidates = (table[lengthPreference] || table.moderate).filter((count) => count <= maxFlags);
  return sample(candidates.length ? candidates : [Math.min(2, maxFlags)]);
}

function weightedBoardCount(lengthPreference, maxBoards) {
  const table = {
    short: [1, 1, 1, 2, 2],
    moderate: [1, 2, 2, 2, 3],
    long: [2, 2, 3, 3, 4]
  };

  const candidates = (table[lengthPreference] || table.moderate).filter((count) => count <= maxBoards);
  return sample(candidates.length ? candidates : [1]);
}

function getAvailableMainBoardIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "base")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function boardPreferencePenalty(piece, preferences, guidanceLevel) {
  const bias = piece.derivedBias ?? { hazard: 2, congestion: 2, complexity: 2 };
  const difficultyTargets = {
    easy: { hazard: 1.15, congestion: preferences.playerCount >= 5 ? 1.1 : 1.25, complexity: 1.25 },
    moderate: { hazard: 1.85, congestion: preferences.playerCount >= 5 ? 1.55 : 1.8, complexity: 1.8 },
    hard: { hazard: 2.55, congestion: preferences.playerCount >= 5 ? 2.05 : 2.35, complexity: 2.4 }
  };
  const target = difficultyTargets[preferences.difficulty] || difficultyTargets.moderate;
  const mismatch = (
    Math.abs(bias.hazard - target.hazard) * 1.2 +
    Math.abs(bias.congestion - target.congestion) * 1.35 +
    Math.abs(bias.complexity - target.complexity) * 1
  );
  const jitter = guidanceLevel === 0
    ? Math.random() * 2.4
    : guidanceLevel === 1
      ? Math.random() * 1.2
      : Math.random() * 0.45;

  return mismatch + jitter;
}

function getPhysicalBoardId(piece) {
  return piece.physicalBoardId ?? piece.id;
}

function countPhysicalBoards(boardIds, pieceMap) {
  return new Set(boardIds.map((boardId) => getPhysicalBoardId(pieceMap[boardId]))).size;
}

function sampleDistinctBoardFaces(boardIds, count, pieceMap) {
  const pool = shuffle(boardIds);
  const selected = [];
  const usedPhysicalBoards = new Set();

  for (const boardId of pool) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
    if (usedPhysicalBoards.has(physicalBoardId)) {
      continue;
    }

    selected.push(boardId);
    usedPhysicalBoards.add(physicalBoardId);

    if (selected.length >= count) {
      break;
    }
  }

  return selected;
}

function selectBoardIdsForCourse(boardIds, count, pieceMap, preferences, guidanceLevel) {
  const grouped = new Map();

  for (const boardId of boardIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
    if (!grouped.has(physicalBoardId)) {
      grouped.set(physicalBoardId, []);
    }
    grouped.get(physicalBoardId).push(boardId);
  }

  const scoredGroups = [];
  for (const groupBoardIds of grouped.values()) {
    const rankedFaces = groupBoardIds
      .map((boardId) => ({
        boardId,
        score: boardPreferencePenalty(pieceMap[boardId], preferences, guidanceLevel)
      }))
      .sort((a, b) => a.score - b.score);

    if (rankedFaces.length) {
      scoredGroups.push(rankedFaces[0]);
    }
  }

  return scoredGroups
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((entry) => entry.boardId);
}

function cloneTileMap(tileMap) {
  const copy = new Map();

  for (const [key, tile] of tileMap.entries()) {
    copy.set(key, {
      x: tile.x,
      y: tile.y,
      features: tile.features.map((feature) => structuredClone(feature))
    });
  }

  return copy;
}

function getFlagCandidates(placements, pieceMap) {
  const candidates = [];

  for (const [placementIndex, placement] of placements.entries()) {
    const piece = pieceMap[placement.pieceId];
    if (!piece || piece.kind === "dock") continue;

    const placed = placePiece(piece, placement);
    for (let dy = 0; dy < placed.height; dy += 1) {
      for (let dx = 0; dx < placed.width; dx += 1) {
        candidates.push({
          x: placed.x + dx,
          y: placed.y + dy,
          pieceId: placement.pieceId,
          placementIndex
        });
      }
    }
  }

  return candidates;
}

function getPlacementCenter(placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  const dims = rotatedDimensions(piece, placement.rotation ?? 0);
  return {
    x: placement.x + (dims.width - 1) / 2,
    y: placement.y + (dims.height - 1) / 2
  };
}

function getMostDistantBoardIndex(boardPlacements, dockPlacement, pieceMap) {
  const dockCenter = getPlacementCenter(dockPlacement, pieceMap);
  let bestIndex = 0;
  let bestDistance = -Infinity;

  boardPlacements.forEach((placement, index) => {
    const center = getPlacementCenter(placement, pieceMap);
    const distance = Math.abs(center.x - dockCenter.x) + Math.abs(center.y - dockCenter.y);

    if (distance > bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function areFlagsTooClose(left, right, minDistance = 3) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) < minDistance;
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getFirstFlagDistanceThresholds(lengthPreference, guidanceLevel) {
  const base = {
    short: { nearest: 5, average: 8 },
    moderate: { nearest: 6, average: 9 },
    long: { nearest: 7, average: 10 }
  };
  const selected = base[lengthPreference] || base.moderate;
  return {
    nearest: selected.nearest + guidanceLevel,
    average: selected.average + guidanceLevel
  };
}

function isFirstFlagFarEnough(flag, starts, thresholds) {
  if (!starts.length) {
    return true;
  }

  const distances = starts.map((start) => manhattanDistance(flag, start));
  const nearest = Math.min(...distances);
  const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;

  return nearest >= thresholds.nearest && averageDistance >= thresholds.average;
}

function isValidFlagSequence(flags) {
  for (let index = 1; index < flags.length; index += 1) {
    if (areFlagsTooClose(flags[index - 1], flags[index])) {
      return false;
    }
  }

  return true;
}

function pickFlags(flagCandidates, flagCount, boardPlacements, dockPlacement, pieceMap, starts = [], preferences = {}, guidanceLevel = 0) {
  const farthestBoardIndex = getMostDistantBoardIndex(boardPlacements, dockPlacement, pieceMap);
  const farthestBoardPieceId = boardPlacements[farthestBoardIndex]?.pieceId;
  const mustUseFarthestBoard = boardPlacements.length > 1 && farthestBoardPieceId;
  const firstFlagThresholds = getFirstFlagDistanceThresholds(preferences.length, guidanceLevel);

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const sampled = sampleMany(flagCandidates, flagCount);

    if (sampled.length !== flagCount) {
      continue;
    }

    if (mustUseFarthestBoard && !sampled.some((flag) => flag.pieceId === farthestBoardPieceId)) {
      continue;
    }

    if (!isValidFlagSequence(sampled)) {
      continue;
    }

    if (!isFirstFlagFarEnough(sampled[0], starts, firstFlagThresholds)) {
      continue;
    }

    return sampled.map(({ x, y }) => ({ x, y }));
  }

  return null;
}

function applyFlagOverrides(tileMap, goals) {
  const next = cloneTileMap(tileMap);

  goals.forEach((goal, index) => {
    const key = `${goal.x},${goal.y}`;
    const tile = next.get(key) ?? { x: goal.x, y: goal.y, features: [] };

    tile.features = tile.features.filter((feature) => (
      feature.type === "laser" || feature.type === "wall"
    ));
    tile.features.push({
      type: "checkpoint",
      id: index + 1
    });

    next.set(key, tile);
  });

  return next;
}

function getAttachmentRange(anchorPlacement, anchorPiece, candidatePiece, candidateRotation, side, minSharedEdge = MIN_SHARED_EDGE) {
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const candidateDims = rotatedDimensions(candidatePiece, candidateRotation);

  if (side === "left" || side === "right") {
    return {
      min: anchorPlacement.y - candidateDims.height + minSharedEdge,
      max: anchorPlacement.y + anchorDims.height - minSharedEdge
    };
  }

  return {
    min: anchorPlacement.x - candidateDims.width + minSharedEdge,
    max: anchorPlacement.x + anchorDims.width - minSharedEdge
  };
}

function createAttachedBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side);

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(Math.random() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height, rotation };
}

function tryExtendBoardLayout(existingPlacements, nextBoardId, pieceMap) {
  const nextBoard = pieceMap[nextBoardId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createAttachedBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.valid) {
          return {
            placements: candidatePlacements,
            layoutValidation: validation
          };
        }
      }
    }
  }

  return null;
}

function createBoardPlacements(pieceMap, lengthPreference, preferences, guidanceLevel, expansionIds = null) {
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds);
  const maxBoards = Math.min(4, countPhysicalBoards(mainBoardIds, pieceMap));
  const boardCount = weightedBoardCount(lengthPreference, maxBoards);
  const boardIds = selectBoardIdsForCourse(mainBoardIds, boardCount, pieceMap, preferences, guidanceLevel);
  if (boardIds.length !== boardCount) {
    return null;
  }
  const firstBoard = pieceMap[boardIds[0]];
  let placements = [{
    pieceId: firstBoard.id,
    x: 24,
    y: 24,
    rotation: sample(ROTATIONS)
  }];

  let layoutValidation = validateMainBoardLayout(placements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });

  for (const nextBoardId of boardIds.slice(1)) {
    const extension = tryExtendBoardLayout(placements, nextBoardId, pieceMap);
    if (!extension) {
      return null;
    }

    placements = extension.placements;
    layoutValidation = extension.layoutValidation;
  }

  return {
    placements,
    boardIds,
    boardCount,
    layoutValidation
  };
}

function createDockPlacement(structuralPlacements, pieceMap, dockFlipped) {
  const dock = pieceMap["docking-bay-a"];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);

  for (const run of shuffle(validRuns)) {
    const availableOffsets = run.length - dock.height;
    const offsets = [];
    for (let offset = 0; offset <= availableOffsets; offset += 1) {
      offsets.push(offset);
    }

    for (const offset of shuffle(offsets)) {
      const dockPlacement = projectDockPlacement(run, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid) {
        return {
          dockPlacement,
          dockValidation,
          boundaryRun: run
        };
      }
    }
  }

  return null;
}

function analyzeFlagSequence(tileMap, starts, flags, playerCount) {
  const firstLeg = analyzeCourse(tileMap, starts, flags[0], {
    maxRoutes: 4,
    flags,
    playerCount
  });

  const legs = [
    {
      from: "dock",
      to: 1,
      analysis: firstLeg
    }
  ];

  let previousLegRoutes = firstLeg.starts
    .map((start) => start.selectedRoute)
    .filter(Boolean);

  for (let index = 1; index < flags.length; index += 1) {
    const analysis = analyzeFlagLeg(tileMap, flags[index - 1], flags[index], {
      facings: FACINGS,
      routesPerFacing: 3,
      maxDistinctRoutes: 4,
      previousLegRoutes,
      maxExpansions: 18000
    });

    legs.push({
      from: index,
      to: index + 1,
      analysis
    });

    previousLegRoutes = analysis.distinctRoutes;
  }

  const totalDifficulty = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.difficultyScore !== undefined) {
      return sum + leg.analysis.summary.difficultyScore;
    }

    return sum + leg.analysis.summary.averageRouteScore + leg.analysis.summary.congestionScore - leg.analysis.summary.diversityScore * 0.2;
  }, 0);

  const totalLength = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.lengthScore !== undefined) {
      return sum + leg.analysis.summary.lengthScore;
    }

    return sum + leg.analysis.summary.averageRouteDistance;
  }, 0);

  return {
    starts,
    firstLeg,
    legs,
    summary: {
      totalDifficulty: Number(totalDifficulty.toFixed(2)),
      totalLength: Number(totalLength.toFixed(2))
    }
  };
}

function computeUsableStarts(firstLeg) {
  const outlierSet = new Set(firstLeg.summary.outliers.map((item) => item.index));
  return firstLeg.starts.filter((startAnalysis) => startAnalysis.reachable && !outlierSet.has(startAnalysis.index));
}

function pointOnPlacement(point, placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  const dims = rotatedDimensions(piece, placement.rotation ?? 0);

  return (
    point.x >= placement.x &&
    point.x < placement.x + dims.width &&
    point.y >= placement.y &&
    point.y < placement.y + dims.height
  );
}

function collectUsedBoardIndices(sequence, boardPlacements, pieceMap, usableStarts, checkpoints) {
  const used = new Set();

  checkpoints.forEach((checkpoint) => {
    boardPlacements.forEach((placement, index) => {
      if (pointOnPlacement(checkpoint, placement, pieceMap)) {
        used.add(index);
      }
    });
  });

  usableStarts.forEach((startAnalysis) => {
    const route = startAnalysis.selectedRoute;
    if (!route) {
      return;
    }

    route.path.forEach((point) => {
      boardPlacements.forEach((placement, index) => {
        if (pointOnPlacement(point, placement, pieceMap)) {
          used.add(index);
        }
      });
    });
  });

  sequence.legs.slice(1).forEach((leg) => {
    for (const route of leg.analysis.distinctRoutes || []) {
      route.path.forEach((point) => {
        boardPlacements.forEach((placement, index) => {
          if (pointOnPlacement(point, placement, pieceMap)) {
            used.add(index);
          }
        });
      });
    }
  });

  return used;
}

function computeDifficultyRaw(sequence) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const avgLegScore = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.averageRouteScore, 0) / later.length : 0;
  const avgCongestion = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.congestionScore, 0) / later.length : 0;
  const avgDiversity = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.diversityScore, 0) / later.length : 0;
  const avgBacktrack = later.length ? later.reduce((sum, leg) => sum + leg.analysis.summary.crossLegOverlap, 0) / later.length : 0;

  return Number((
    first.difficultyScore * 0.45 +
    first.averageTrafficPenalty * 1.2 +
    first.flagAreaScore * 0.8 +
    avgLegScore * 0.35 +
    avgCongestion * 0.8 +
    avgBacktrack * 20 -
    avgDiversity * 0.45
  ).toFixed(2));
}

function computeLengthRaw(sequence, flagCount) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const laterAverageLength = later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);

  return Number((first.lengthScore * 1.2 + laterAverageLength + flagCount * 4).toFixed(2));
}

function bandDistance(value, band, thresholds) {
  const [low, high] = thresholds[band];
  if (value < low) return low - value;
  if (value >= high) return value - high;
  return 0;
}

function classifyCandidate(sequence, preferences, context = {}) {
  const usableStarts = computeUsableStarts(sequence.firstLeg);
  const difficultyRaw = computeDifficultyRaw(sequence);
  const lengthRaw = computeLengthRaw(sequence, preferences.flagCount);
  const fairnessStdDev = sequence.firstLeg.summary.scoreStdDev;

  const difficultyThresholds = {
    easy: [0, 70],
    moderate: [70, 105],
    hard: [105, Infinity]
  };
  const lengthThresholds = {
    short: [MIN_LENGTH_RAW, 40],
    moderate: [40, 58],
    long: [58, Infinity]
  };

  const hardFailures = [];
  if (lengthRaw < MIN_LENGTH_RAW) {
    hardFailures.push("too-short");
  }
  if (usableStarts.length < preferences.playerCount) {
    hardFailures.push("usable-starts");
  }

  if (sequence.firstLeg.summary.reachableStarts < preferences.playerCount) {
    hardFailures.push("reachable-starts");
  }

  if (context.boardPlacements?.length > 1 && context.pieceMap && context.checkpoints) {
    const usedBoards = collectUsedBoardIndices(
      sequence,
      context.boardPlacements,
      context.pieceMap,
      usableStarts,
      context.checkpoints
    );

    if (usedBoards.size < context.boardPlacements.length) {
      hardFailures.push("unused-board");
    }
  }

  for (const leg of sequence.legs.slice(1)) {
    if (leg.analysis.summary.distinctRouteCount === 0) {
      hardFailures.push(`leg-${leg.from}-${leg.to}`);
    }
  }

  const difficultyFit = bandDistance(difficultyRaw, preferences.difficulty, difficultyThresholds);
  const lengthFit = bandDistance(lengthRaw, preferences.length, lengthThresholds);
  const fairnessPenalty = fairnessStdDev >= 14 ? fairnessStdDev - 14 : 0;
  const fitScore = difficultyFit * 1.2 + lengthFit + fairnessPenalty * 0.5 + Math.max(0, preferences.playerCount - usableStarts.length) * 20;

  return {
    usableStarts,
    difficultyRaw,
    lengthRaw,
    fairnessStdDev,
    acceptable: hardFailures.length === 0 && difficultyFit === 0 && lengthFit === 0,
    hardFailures,
    fitScore: Number(fitScore.toFixed(2))
  };
}

function buildScenarioReport(scenario, selectedLegIndex) {
  const summary = scenario.sequence.firstLeg.summary;
  const legOptions = scenario.sequence.legs.map((leg, index) => (
    index === 0 ? "Dock -> 1" : `${leg.from} -> ${leg.to}`
  ));
  const goal = scenario.checkpoints[selectedLegIndex === 0 ? 0 : selectedLegIndex];

  const lines = [
    `Requested: ${scenario.preferences.playerCount} players, ${scenario.preferences.difficulty} difficulty, ${scenario.preferences.length} length`,
    `Accepted after ${scenario.attempts} attempt(s)`,
    `Board count: ${scenario.boardCount}`,
    `Boards: ${scenario.mainBoardIds.map((pieceId, index) => `${pieceId}@${scenario.mainRotations[index]}`).join(", ")}`,
    `Flags: ${scenario.checkpoints.map((flag, index) => `#${index + 1}(${flag.x},${flag.y})`).join(", ")}`,
    `Dock side: ${scenario.dockBoundaryRun?.side ?? "n/a"}`,
    `Dock flipped: ${scenario.dockFlipped ? "yes" : "no"}`,
    `Showing leg: ${legOptions[selectedLegIndex]}`,
    `Goal flag: (${goal.x}, ${goal.y})`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.sequence.starts.length}`,
    `Difficulty raw: ${scenario.metrics.difficultyRaw}`,
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Fairness stddev: ${scenario.metrics.fairnessStdDev}`,
    `Course difficulty score: ${summary.difficultyScore}`,
    `Course length score: ${summary.lengthScore}`,
    `Course action score: ${summary.actionScore}`,
    `Flag area score: ${summary.flagAreaScore}`,
    `Average traffic penalty: ${summary.averageTrafficPenalty}`,
    `Route overlap score: ${summary.overlapScore}`,
    `Fairness score: ${summary.fairnessScore}`,
    `Overall course score: ${summary.overallScore}`,
    `Sequence total difficulty: ${scenario.sequence.summary.totalDifficulty}`,
    `Sequence total length: ${scenario.sequence.summary.totalLength}`,
    summary.outliers.length
      ? `Outlier starts: ${summary.outliers.map((item) => `#${item.index + 1} (${item.delta > 0 ? "+" : ""}${item.delta})`).join(", ")}`
      : "Outlier starts: none",
    "",
    "Leg summaries:",
    ...scenario.sequence.legs.map((leg) => {
      if (leg.analysis.summary.difficultyScore !== undefined) {
        return `Leg ${leg.from} -> ${leg.to}: difficulty ${leg.analysis.summary.difficultyScore}, length ${leg.analysis.summary.lengthScore}`;
      }

      return `Leg ${leg.from} -> ${leg.to}: routes ${leg.analysis.summary.routeCount}, distinct ${leg.analysis.summary.distinctRouteCount}, avgScore ${leg.analysis.summary.averageRouteScore}, avgLength ${leg.analysis.summary.averageRouteDistance}, diversity ${leg.analysis.summary.diversityScore}, congestion ${leg.analysis.summary.congestionScore}, backtrack ${leg.analysis.summary.crossLegOverlap}`;
    }),
    "",
    "Per-start best routes:"
  ];

  for (const startAnalysis of scenario.sequence.firstLeg.starts) {
    if (!startAnalysis.reachable) {
      lines.push(
        `Start #${startAnalysis.index + 1} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) unreachable`
      );
      continue;
    }

    const selected = startAnalysis.selectedRoute;
    const usable = scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index) ? "usable" : "outlier";
    lines.push(
      `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) route ${startAnalysis.selectedRouteIndex + 1}/${startAnalysis.routes.length} adjusted ${startAnalysis.adjustedScore} raw ${selected.score} traffic ${startAnalysis.trafficPenalty} overlapRaw ${startAnalysis.overlapPenalty} distance ${selected.distance} actions ${selected.actions} forced ${selected.forcedDistance} hazard ${selected.hazard}`
    );
  }

  return lines.join("\n");
}

function setGeneratingOverlay(visible, text = "") {
  const overlay = document.getElementById("generating-overlay");
  const overlayText = document.getElementById("overlay-text");
  overlay.classList.toggle("visible", visible);
  if (text) {
    overlayText.textContent = text;
  }
}

function isDevViewEnabled() {
  return document.getElementById("dev-view")?.checked ?? true;
}

function updateDevView() {
  const enabled = isDevViewEnabled();
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
}

function renderScenario(scenario) {
  updateDevView();
  const legSelect = document.getElementById("leg-select");
  const devViewEnabled = isDevViewEnabled();
  const legOptions = scenario.sequence.legs.map((leg, index) => ({
    value: String(index),
    label: index === 0 ? "Dock -> 1" : `${leg.from} -> ${leg.to}`
  }));

  const previousLegValue = legSelect.value;
  legSelect.innerHTML = "";
  const noneElement = document.createElement("option");
  noneElement.value = "none";
  noneElement.textContent = "None";
  legSelect.appendChild(noneElement);
  legOptions.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    legSelect.appendChild(element);
  });

  const selectedLegValue = !devViewEnabled
    ? "none"
    : previousLegValue === "none"
    ? "none"
    : legOptions.some((option) => option.value === previousLegValue)
      ? previousLegValue
      : "none";
  legSelect.value = selectedLegValue;

  const selectedLegIndex = selectedLegValue === "none" ? null : Number(selectedLegValue);
  const displayedLeg = selectedLegIndex === null ? null : scenario.sequence.legs[selectedLegIndex];
  const goal = selectedLegIndex === null
    ? scenario.checkpoints[0]
    : scenario.checkpoints[selectedLegIndex === 0 ? 0 : selectedLegIndex];
  const renderAnalysis = selectedLegIndex === null
    ? null
    : selectedLegIndex === 0
      ? scenario.sequence.firstLeg
      : { routes: displayedLeg.analysis.distinctRoutes };
  const unusableStartIndices = scenario.sequence.firstLeg.starts
    .filter((startAnalysis) => !scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index))
    .map((startAnalysis) => startAnalysis.index);

  render(document.getElementById("canvas"), scenario.pieceMap, scenario.imageMap, {
    placements: scenario.placements,
    goal,
    analysis: renderAnalysis,
    goals: scenario.checkpoints,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    showBoardLabels: devViewEnabled && selectedLegIndex !== null,
    showStartFacing: devViewEnabled && selectedLegIndex !== null,
    showWalls: devViewEnabled && selectedLegIndex !== null
  });

  if (devViewEnabled) {
    document.getElementById("report").textContent = buildScenarioReport(scenario, selectedLegIndex ?? 0);
  }
}

function createRandomCandidate(assets, preferences, attempt = 1) {
  const { pieceMap } = assets;
  const dockFlipped = Math.random() < 0.5;
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const boardLayout = createBoardPlacements(pieceMap, preferences.length, preferences, guidanceLevel);
  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const dockLayout = createDockPlacement(boardLayout.placements, pieceMap, dockFlipped);
  if (!dockLayout) {
    throw new Error("Unable to place dock on assembled perimeter");
  }

  const placements = [
    ...boardLayout.placements,
    dockLayout.dockPlacement
  ];

  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const flagCandidates = getFlagCandidates(placements, pieceMap);
  const flagCount = Math.min(weightedFlagCount(preferences.length, flagCandidates.length), flagCandidates.length);
  const checkpoints = pickFlags(
    flagCandidates,
    flagCount,
    boardLayout.placements,
    dockLayout.dockPlacement,
    pieceMap,
    starts,
    preferences,
    guidanceLevel
  );
  if (!checkpoints) {
    throw new Error("Unable to choose a valid flag sequence");
  }
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, starts, checkpoints, preferences.playerCount);
  const metrics = classifyCandidate(sequence, {
    ...preferences,
    flagCount
  }, {
    boardPlacements: boardLayout.placements,
    pieceMap,
    checkpoints
  });

  return {
    pieceMap: assets.pieceMap,
    imageMap: assets.imageMap,
    placements,
    checkpoints,
    goalTileMap,
    playerCount: preferences.playerCount,
    mainBoardIds: boardLayout.boardIds,
    mainRotations: boardLayout.placements.map((placement) => placement.rotation),
    boardCount: boardLayout.boardCount,
    guidanceLevel,
    dockFlipped,
    dockBoundaryRun: dockLayout.boundaryRun,
    sequence,
    metrics,
    preferences: {
      ...preferences,
      flagCount
    }
  };
}

async function start() {
  setGeneratingOverlay(true, "Trying random setups and checking difficulty, length, and usable starts.");
  await nextFrame();
  const assets = await loadAssets();
  const preferences = {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value
  };

  let bestScenario = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const scenario = createRandomCandidate(assets, preferences, attempt);
    scenario.attempts = attempt;

    if (!bestScenario || scenario.metrics.fitScore < bestScenario.metrics.fitScore) {
      bestScenario = scenario;
    }

    if (scenario.metrics.acceptable) {
      currentScenario = scenario;
      renderScenario(currentScenario);
      setGeneratingOverlay(false);
      return;
    }

    if (attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      setGeneratingOverlay(true, `Attempt ${attempt} of ${MAX_ATTEMPTS}: still looking for a ${preferences.length} ${preferences.difficulty} setup with ${preferences.playerCount} usable starts.`);
      await nextFrame();
    }
  }

  currentScenario = bestScenario;
  renderScenario(currentScenario);
  setGeneratingOverlay(false);
}

document.getElementById("reroll").addEventListener("click", () => {
  start().catch(console.error);
});

document.getElementById("leg-select").addEventListener("change", () => {
  if (currentScenario) {
    renderScenario(currentScenario);
  }
});

document.getElementById("dev-view").addEventListener("change", () => {
  updateDevView();
  if (currentScenario) {
    renderScenario(currentScenario);
  }
});

start().catch(console.error);
