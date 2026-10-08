// Robo Rally Course Randomizer - calibration features: layout, board-profile and checkpoint summaries that construction guidance models use
import { getPlacedRect, rotatedDimensions } from "../../board.js";
import { getConstructionGuidanceStrength } from "./generation-modes.js";
import {
  buildBoardRects,
  getPhysicalBoardId,
  isMiniOverlayPiece,
  manhattanDistance,
  pointOnPlacement
} from "./layout-geometry.js";
import { isBlockedBetween } from "./moving-targets.js";
import { normalizeBoardSpread } from "./preferences.js";

export function getFlagCandidateApproachStats(tileMap, point) {
  const directions = [
    { dir: "N", dx: 0, dy: -1 },
    { dir: "E", dx: 1, dy: 0 },
    { dir: "S", dx: 0, dy: 1 },
    { dir: "W", dx: -1, dy: 0 }
  ];
  let openCount = 0;
  let pitCount = 0;
  let voidCount = 0;
  let blockedCount = 0;

  for (const { dir, dx, dy } of directions) {
    const neighbor = { x: point.x + dx, y: point.y + dy };
    const tile = tileMap.get(`${neighbor.x},${neighbor.y}`);
    if (!tile) { voidCount += 1; continue; }
    if ((tile.features || []).some((feature) => feature.type === "pit")) { pitCount += 1; continue; }
    if (isBlockedBetween(tileMap, point, neighbor, dir)) { blockedCount += 1; continue; }
    openCount += 1;
  }

  return {
    openCount,
    pitCount,
    voidCount,
    blockedCount,
    // Several genuinely open sides are a cheap proxy for a checkpoint that can
    // receive robots from different lines. Final traffic analysis decides if it
    // actually becomes contested.
    convergencePotential: Math.max(0, openCount - 1)
  };
}

export function getCandidateBoardDepth(candidate, boardPlacements = [], pieceMap = {}) {
  let bestDepth = 0;
  let boardIndex = -1;
  boardPlacements.forEach((placement, index) => {
    if (!pointOnPlacement(candidate, placement, pieceMap)) return;
    const piece = pieceMap[placement.pieceId];
    const dims = rotatedDimensions(piece, placement.rotation ?? 0);
    const localX = candidate.x - placement.x;
    const localY = candidate.y - placement.y;
    const depth = Math.max(0, Math.min(localX, localY, dims.width - 1 - localX, dims.height - 1 - localY));
    if (boardIndex < 0 || depth > bestDepth) { bestDepth = depth; boardIndex = index; }
  });
  return { boardIndex, depth: bestDepth };
}

export const CALIBRATION_CHECKPOINT_SAMPLING_REGIMES = Object.freeze(["compact", "ordinary", "stretched"]);

export function getCalibrationCheckpointSamplingRegime(preferences = {}) {
  const regime = preferences.calibrationCheckpointSamplingRegime;
  return CALIBRATION_CHECKPOINT_SAMPLING_REGIMES.includes(regime) ? regime : null;
}

export function getCalibrationExpansionIds(pieceMap = {}) {
  return [...new Set(
    Object.values(pieceMap)
      .map((piece) => piece?.expansionId)
      .filter(Boolean)
  )].sort();
}

export function getCalibrationStaticDistance(tileMap, from, to) {
  if (!from || !to) return null;
  if (from.x === to.x && from.y === to.y) return 0;
  const startKey = `${from.x},${from.y}`;
  const goalKey = `${to.x},${to.y}`;
  if (!tileMap.has(startKey) || !tileMap.has(goalKey)) return null;
  const directions = [
    { dir: "N", dx: 0, dy: -1 },
    { dir: "E", dx: 1, dy: 0 },
    { dir: "S", dx: 0, dy: 1 },
    { dir: "W", dx: -1, dy: 0 }
  ];
  const queue = [{ x: from.x, y: from.y, distance: 0 }];
  const visited = new Set([startKey]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of directions) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      const tile = tileMap.get(key);
      if (!tile || (tile.features || []).some((feature) => feature.type === "pit")) continue;
      if (isBlockedBetween(tileMap, current, next, direction.dir)) continue;
      const distance = current.distance + 1;
      if (key === goalKey) return distance;
      visited.add(key);
      queue.push({ ...next, distance });
    }
  }
  return null;
}

export function summarizeCalibrationBoardProfiles(boardPlacements = [], pieceMap = {}) {
  const boards = boardPlacements.map((placement, index) => {
    const piece = pieceMap[placement.pieceId];
    const profile = piece?.boardProfile ?? null;
    const rect = piece ? getPlacedRect(piece, placement) : null;
    return {
      index,
      pieceId: placement.pieceId,
      physicalBoardId: piece ? getPhysicalBoardId(piece) : placement.pieceId,
      expansionId: piece?.expansionId ?? null,
      kind: piece?.kind ?? null,
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y,
      width: rect?.width ?? null,
      height: rect?.height ?? null,
      profile: profile ? {
        overall: Number(profile.overall ?? 0),
        hazard: Number(profile.bias?.hazard ?? 0),
        congestion: Number(profile.bias?.congestion ?? 0),
        complexity: Number(profile.bias?.complexity ?? 0),
        swinginess: Number(profile.swinginess ?? 0),
        density: Number(profile.density ?? 0)
      } : null
    };
  });
  const meanProfile = (key) => {
    const values = boards.map((board) => Number(board.profile?.[key])).filter(Number.isFinite);
    return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : null;
  };
  return {
    boards,
    means: {
      overall: meanProfile("overall"),
      hazard: meanProfile("hazard"),
      congestion: meanProfile("congestion"),
      complexity: meanProfile("complexity"),
      swinginess: meanProfile("swinginess"),
      density: meanProfile("density")
    }
  };
}

export function summarizeCalibrationLayout(boardPlacements = [], pieceMap = {}) {
  const rects = buildBoardRects(boardPlacements, pieceMap);
  if (!rects.length) {
    return {
      bboxWidth: null,
      bboxHeight: null,
      bboxArea: null,
      boardArea: null,
      compactness: null,
      adjacencyCount: 0,
      sharedEdge: 0,
      graphDiameter: null
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
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      const a = rects[left];
      const b = rects[right];
      let edge = 0;
      if (a.x + a.width === b.x || b.x + b.width === a.x) {
        edge = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
      } else if (a.y + a.height === b.y || b.y + b.height === a.y) {
        edge = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
      }
      if (edge <= 0) continue;
      adjacency.get(left).add(right);
      adjacency.get(right).add(left);
      adjacencyCount += 1;
      sharedEdge += edge;
    }
  }
  let graphDiameter = 0;
  for (let source = 0; source < rects.length; source += 1) {
    const distances = new Map([[source, 0]]);
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const next of adjacency.get(current) ?? []) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(current) + 1);
        queue.push(next);
      }
    }
    for (const distance of distances.values()) graphDiameter = Math.max(graphDiameter, distance);
  }
  return {
    bboxWidth,
    bboxHeight,
    bboxArea,
    boardArea,
    compactness: bboxArea > 0 ? Number((boardArea / bboxArea).toFixed(4)) : null,
    adjacencyCount,
    sharedEdge,
    graphDiameter
  };
}

export function buildCalibrationConstructionSnapshot({
  boardPlacements = [],
  dockPlacements = [],
  overlayPlacements = [],
  checkpoints = [],
  starts = [],
  tileMap = new Map(),
  pieceMap = {},
  preferences = {}
} = {}) {
  const profileSummary = summarizeCalibrationBoardProfiles(boardPlacements, pieceMap);
  const layout = summarizeCalibrationLayout(boardPlacements, pieceMap);
  const checkpointRows = checkpoints.map((checkpoint, index) => {
    const boardUse = getCandidateBoardDepth(checkpoint, boardPlacements, pieceMap);
    const approach = getFlagCandidateApproachStats(tileMap, checkpoint);
    const previous = index > 0 ? checkpoints[index - 1] : null;
    return {
      index,
      x: checkpoint.x,
      y: checkpoint.y,
      boardIndex: boardUse.boardIndex,
      boardDepth: boardUse.depth,
      openApproaches: approach.openCount,
      blockedApproaches: approach.blockedCount,
      pitApproaches: approach.pitCount,
      voidApproaches: approach.voidCount,
      convergencePotential: approach.convergencePotential,
      featureTypes: [...new Set((tileMap.get(`${checkpoint.x},${checkpoint.y}`)?.features || []).map((feature) => feature.type).filter(Boolean))].sort(),
      manhattanFromPrevious: previous ? manhattanDistance(previous, checkpoint) : null,
      staticDistanceFromPrevious: previous ? getCalibrationStaticDistance(tileMap, previous, checkpoint) : null
    };
  });
  const first = checkpoints[0] ?? null;
  const firstManhattan = first
    ? starts.map((start) => manhattanDistance(start, first)).filter(Number.isFinite)
    : [];
  const firstStatic = first
    ? starts.map((start) => getCalibrationStaticDistance(tileMap, start, first)).filter(Number.isFinite)
    : [];
  const mean = (values) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : null;
  const finiteCheckpointValues = (key) => checkpointRows.map((row) => Number(row[key])).filter(Number.isFinite);
  const sequentialManhattan = finiteCheckpointValues("manhattanFromPrevious");
  const sequentialStatic = finiteCheckpointValues("staticDistanceFromPrevious");
  const depths = finiteCheckpointValues("boardDepth");
  const convergence = finiteCheckpointValues("convergencePotential");
  const representedBoards = new Set(checkpointRows.map((row) => row.boardIndex).filter((index) => index >= 0));
  const overlayBoardCount = overlayPlacements.filter((placement) => !isMiniOverlayPiece(pieceMap[placement.pieceId])).length;
  const overlayTileCount = overlayPlacements.length - overlayBoardCount;
  return {
    boardCount: boardPlacements.length,
    flagCount: checkpoints.length,
    startCount: starts.length,
    dockCount: dockPlacements.length,
    overlayCount: overlayPlacements.length,
    overlayBoardCount,
    overlayTileCount,
    boardProfiles: profileSummary,
    docks: dockPlacements.map((placement) => ({
      pieceId: placement.pieceId,
      expansionId: pieceMap[placement.pieceId]?.expansionId ?? null,
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y
    })),
    overlays: overlayPlacements.map((placement) => ({
      pieceId: placement.pieceId,
      expansionId: pieceMap[placement.pieceId]?.expansionId ?? null,
      kind: isMiniOverlayPiece(pieceMap[placement.pieceId]) ? "tile" : "board",
      rotation: placement.rotation ?? 0,
      x: placement.x,
      y: placement.y
    })),
    layout,
    checkpoints: checkpointRows,
    shape: {
      firstStartManhattanMean: mean(firstManhattan),
      firstStartManhattanMin: firstManhattan.length ? Math.min(...firstManhattan) : null,
      firstStartStaticMean: mean(firstStatic),
      firstStartStaticMin: firstStatic.length ? Math.min(...firstStatic) : null,
      sequentialManhattanSum: sequentialManhattan.length ? sequentialManhattan.reduce((sum, value) => sum + value, 0) : 0,
      sequentialManhattanMean: mean(sequentialManhattan),
      sequentialStaticSum: sequentialStatic.length ? sequentialStatic.reduce((sum, value) => sum + value, 0) : 0,
      sequentialStaticMean: mean(sequentialStatic),
      finalManhattan: sequentialManhattan.length ? sequentialManhattan.at(-1) : null,
      finalStaticDistance: sequentialStatic.length ? sequentialStatic.at(-1) : null,
      convergenceMean: mean(convergence),
      convergenceMax: convergence.length ? Math.max(...convergence) : null,
      boardDepthMean: mean(depths),
      boardDepthMin: depths.length ? Math.min(...depths) : null,
      boardDepthMax: depths.length ? Math.max(...depths) : null,
      representedBoardCount: representedBoards.size,
      shallowCheckpointCount: depths.filter((depth) => depth <= 1).length
    },
    requestContext: {
      difficulty: preferences.difficulty ?? null,
      length: preferences.length ?? null,
      recoveryRule: preferences.recoveryRule ?? null,
      generationMode: preferences.generationMode ?? null,
      boardSpread: normalizeBoardSpread(preferences.boardSpread),
      guidanceStrength: getConstructionGuidanceStrength(preferences),
      calibrationBoardOverlayCount: preferences.calibrationBoardOverlayCount != null &&
        Number.isInteger(Number(preferences.calibrationBoardOverlayCount))
        ? Number(preferences.calibrationBoardOverlayCount)
        : null,
      checkpointSamplingRegime: getCalibrationCheckpointSamplingRegime(preferences)
    }
  };
}
