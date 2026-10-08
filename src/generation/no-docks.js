// Robo Rally Course Randomizer - No Docks: starting zones along a course edge
import { NO_DOCK_START_EDGE_FEATURE_TYPES } from "./config.js";
import { getDirectionDelta } from "./layout-geometry.js";
import { sample } from "./random.js";

export function getNoDockEdgeTiles(boardRect, side) {
  const tiles = [];
  if (side === "N" || side === "S") {
    const y = side === "N" ? boardRect.y : boardRect.y + boardRect.height - 1;
    for (let x = boardRect.x; x < boardRect.x + boardRect.width; x += 1) tiles.push({ x, y });
  } else {
    const x = side === "W" ? boardRect.x : boardRect.x + boardRect.width - 1;
    for (let y = boardRect.y; y < boardRect.y + boardRect.height; y += 1) tiles.push({ x, y });
  }
  return tiles;
}

export function getNoDockInwardFacing(side) {
  return { N: "S", E: "W", S: "N", W: "E" }[side];
}

export function isNoDockStartTileClear(tile) {
  // The square itself only needs a clear floor. Passive border geometry is
  // allowed; floor features and active edge devices make the square unsuitable
  // as an offered No-Docks start.
  return Boolean(tile) && (tile.features || []).every((feature) => (
    NO_DOCK_START_EDGE_FEATURE_TYPES.has(feature.type)
  ));
}

export function buildNoDockEdgeCandidate(boardRect, side, tileMap) {
  const facing = getNoDockInwardFacing(side);
  const outward = getDirectionDelta(side);
  const starts = [];
  const edgeTiles = getNoDockEdgeTiles(boardRect, side);
  const fullyExposed = edgeTiles.every((point) => (
    !tileMap.get(`${point.x + outward.dx},${point.y + outward.dy}`)
  ));
  if (!fullyExposed) {
    return {
      boardIndex: boardRect.index,
      pieceId: boardRect.pieceId,
      side,
      facing,
      edgeLength: edgeTiles.length,
      starts: [],
      longestRun: 0,
      score: 0
    };
  }

  for (const point of edgeTiles) {
    const tile = tileMap.get(`${point.x},${point.y}`);
    if (!isNoDockStartTileClear(tile)) continue;

    // Eligibility is about the starting square itself. An inward pit, wall,
    // ledge, or other route complication does not make the square occupied;
    // contextual routing will decide whether the start is actually useful.
    starts.push({ x: point.x, y: point.y, facing });
  }

  let longestRun = 0;
  let run = 0;
  let previous = null;
  for (const start of starts) {
    const coord = side === "N" || side === "S" ? start.x : start.y;
    run = previous !== null && coord === previous + 1 ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
    previous = coord;
  }

  return {
    boardIndex: boardRect.index,
    pieceId: boardRect.pieceId,
    side,
    facing,
    edgeLength: edgeTiles.length,
    starts,
    longestRun,
    score: starts.length * 10 + longestRun * 3
  };
}

export function orderNoDockEdgeStartsCenterOut(edge) {
  const starts = [...(edge?.starts || [])];
  const horizontal = edge?.side === "N" || edge?.side === "S";
  starts.sort((left, right) => (
    horizontal ? left.x - right.x : left.y - right.y
  ));
  if (starts.length <= 2) return starts;

  const ordered = [];
  let left = Math.floor((starts.length - 1) / 2);
  let right = left + 1;
  ordered.push(starts[left]);
  left -= 1;
  while (left >= 0 || right < starts.length) {
    if (right < starts.length) ordered.push(starts[right++]);
    if (left >= 0) ordered.push(starts[left--]);
  }
  return ordered;
}

export function chooseNoDockStartingZones(boardRects, tileMap, requiredStarts, options = {}) {
  // v49er: No Docks is one FULL exposed eligible edge. Active/non-startable
  // board spaces are omitted, but generation does not pre-curate the remaining
  // starts to P+2 (or 2P). Every eligible edge square enters ordinary routing,
  // pricing, Competitive blocking, and Normal pruning; only those mechanisms may
  // reduce the offered field. Extra Docks and Sandwiched Dock remain mutually
  // exclusive with this single-zone layout.
  const candidates = [];

  for (const boardRect of boardRects) {
    for (const side of ["N", "E", "S", "W"]) {
      const edge = buildNoDockEdgeCandidate(boardRect, side, tileMap);
      if (edge.starts.length < requiredStarts) continue;

      const starts = orderNoDockEdgeStartsCenterOut(edge);
      candidates.push({
        edges: [edge],
        starts,
        zoneCount: 1,
        requiredStarts,
        targetStarts: starts.length,
        score: (edge.score || 0) + starts.length * 4
      });
    }
  }

  if (!candidates.length) return null;
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const nearBest = candidates.filter((candidate) => candidate.score >= bestScore - 10);
  return sample(nearBest);
}
