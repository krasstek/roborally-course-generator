// Robo Rally Course Randomizer - layout geometry: placement offsets and rects, tile wall/laser helpers, board connectivity
import { placePiece, rotatedDimensions } from "../../board.js";

export function countConnectedComponents(graph) {
  if (!graph?.nodes?.length) {
    return 0;
  }

  const seen = new Set();
  let components = 0;

  for (const node of graph.nodes) {
    if (seen.has(node.index)) {
      continue;
    }

    components += 1;
    const queue = [node.index];
    seen.add(node.index);

    while (queue.length) {
      const current = queue.shift();
      for (const next of graph.adjacency.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  return components;
}

export function getGraphDiameter(graph) {
  if (!graph?.nodes?.length) {
    return 0;
  }

  let diameter = 0;

  for (const node of graph.nodes) {
    const seen = new Set([node.index]);
    const queue = [{ index: node.index, depth: 0 }];

    while (queue.length) {
      const current = queue.shift();
      diameter = Math.max(diameter, current.depth);

      for (const nextIndex of graph.adjacency.get(current.index) || []) {
        if (seen.has(nextIndex)) {
          continue;
        }
        seen.add(nextIndex);
        queue.push({ index: nextIndex, depth: current.depth + 1 });
      }
    }
  }

  return diameter;
}

export function isSingleSmallBoardCourseAllowed(preferences = {}) {
  return (preferences.difficulty ?? "moderate") === "easy" && (preferences.length ?? "moderate") === "short";
}

export function isSmallBoardLayoutAcceptable(boardPlacements, pieceMap, layoutValidation, preferences = {}) {
  const smallBoardPlacements = boardPlacements.filter((placement) => pieceMap[placement.pieceId]?.kind === "small");
  const allSmallBoards = smallBoardPlacements.length === boardPlacements.length && boardPlacements.length > 0;
  const lengthPreference = preferences.length ?? "moderate";

  if (!allSmallBoards) {
    return true;
  }

  if (boardPlacements.length === 1) {
    return isSingleSmallBoardCourseAllowed(preferences);
  }

  if ((lengthPreference === "long" || lengthPreference === "epic") && boardPlacements.length < 4) {
    return false;
  }

  if (boardPlacements.length < 4) {
    return true;
  }

  const rects = buildBoardRects(boardPlacements, pieceMap);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const spanWidth = maxX - minX;
  const spanHeight = maxY - minY;
  const aspectRatio = Math.max(spanWidth, spanHeight) / Math.max(1, Math.min(spanWidth, spanHeight));
  const graph = layoutValidation?.graph;
  const degrees = graph?.nodes?.map((node) => (graph.adjacency.get(node.index) || []).length) ?? [];
  const maxDegree = degrees.length ? Math.max(...degrees) : 0;
  const leafCount = degrees.filter((degree) => degree <= 1).length;
  const diameter = getGraphDiameter(graph);
  const chainLike = leafCount <= 2 && maxDegree <= 2 && diameter >= boardPlacements.length - 1;

  if (chainLike && boardPlacements.length >= 5) {
    return false;
  }

  if (aspectRatio > 3.2) {
    return false;
  }

  return true;
}

export function getReverseSideName(pieceId, pieceMap) {
  const piece = pieceMap[pieceId];
  if (!piece?.physicalBoardId) {
    return null;
  }

  const reverseSide = Object.values(pieceMap).find((candidate) => (
    candidate.id !== pieceId &&
    candidate.physicalBoardId === piece.physicalBoardId
  ));

  return reverseSide?.name ?? null;
}

export function sameTile(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

export function getPhysicalBoardId(piece) {
  return piece.physicalBoardId ?? piece.id;
}

export function countPhysicalBoards(boardIds, pieceMap) {
  return new Set(boardIds.map((boardId) => getPhysicalBoardId(pieceMap[boardId]))).size;
}

export function getDockTileKeys(dockPlacement, pieceMap) {
  const dockPiece = pieceMap[dockPlacement.pieceId];
  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const keys = new Set();

  for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      keys.add(`${x},${y}`);
    }
  }

  return keys;
}

export function getDockTileKeySet(dockPlacements = [], pieceMap) {
  const keys = new Set();
  dockPlacements.forEach((dockPlacement) => {
    getDockTileKeys(dockPlacement, pieceMap).forEach((key) => keys.add(key));
  });
  return keys;
}

export function rotateTileOffset(x, y, piece, rotation) {
  if (rotation === 90) {
    return { x: piece.height - 1 - y, y: x };
  }
  if (rotation === 180) {
    return { x: piece.width - 1 - x, y: piece.height - 1 - y };
  }
  if (rotation === 270) {
    return { x: y, y: piece.width - 1 - x };
  }
  return { x, y };
}

export function getFullRectOffsets(piece, rotation = 0) {
  const dims = rotatedDimensions(piece, rotation);
  const offsets = [];

  for (let y = 0; y < dims.height; y += 1) {
    for (let x = 0; x < dims.width; x += 1) {
      offsets.push({ x, y });
    }
  }

  return offsets;
}

export function getPlacementOccupiedOffsets(piece, rotation = 0, options = {}) {
  const useFullRect = Boolean(options.fullRect);

  if (useFullRect || !piece?.tiles?.length) {
    const dims = rotatedDimensions(piece, rotation);
    const offsets = [];

    for (let y = 0; y < dims.height; y += 1) {
      for (let x = 0; x < dims.width; x += 1) {
        offsets.push({ x, y });
      }
    }

    return offsets;
  }

  return piece.tiles.map((tile) => rotateTileOffset(tile.x, tile.y, piece, rotation));
}

export function getPlacementOccupiedTiles(piece, placement) {
  const fullRect = Boolean(placement?.overlay && !isMiniOverlayPiece(piece));
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0, { fullRect }).map(({ x, y }) => (
    `${placement.x + x},${placement.y + y}`
  ));
}

export function isMiniOverlayPiece(piece) {
  return piece?.kind === "overlay";
}

export function isBlankCustomBoardPiece(piece) {
  return piece?.expansionId === "master-builder" &&
    piece?.kind === "small" &&
    (piece?.tiles?.length ?? 0) === 0;
}

export function getOppositeSide(side) {
  return {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[side] ?? side;
}

export function tileHasWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "wall" && (feature.sides || []).includes(side));
}

export function tileHasRepulsorOnEdge(features = [], edge) {
  return features.some((feature) => feature.type === "repulsor" && (feature.sides || []).includes(edge));
}

export function tileHasRedWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "redWall" && (feature.sides || []).includes(side));
}

export function tileHasGreenWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "greenWall" && (feature.sides || []).includes(side));
}

export function tileHasLedgeOnSide(features = [], side) {
  return features.some((feature) => feature.type === "ledge" && (feature.sides || []).includes(side));
}

export function tileHasLaserSupportBlock(features = [], side, options = {}) {
  if (
    tileHasWallOnSide(features, side) ||
    tileHasRepulsorOnEdge(features, side) ||
    tileHasRedWallOnSide(features, side) ||
    tileHasGreenWallOnSide(features, side)
  ) {
    return true;
  }

  // A ledge only provides a physical laser-support wall from its LOWER tile.
  // The neighboring upper/platform tile does not have a wall face on that edge.
  // Red and green walls both count as physical laser anchors even though their
  // traversal behavior differs when they face each other across a border.
  return Boolean(options.includeLowerLedge && tileHasLedgeOnSide(features, side));
}

export function tileHasLaserInDirection(features = [], dir) {
  return features.some((feature) => feature.type === "laser" && feature.dir === dir);
}

export function getPlacedTileFeatureMap(piece, placement) {
  const placed = placePiece(piece, placement);
  return new Map(placed.tiles.map((tile) => [`${tile.x},${tile.y}`, tile.features || []]));
}

export function getCombinedPlacedTileFeatureMap(placements, pieceMap) {
  const featureMap = new Map();

  placements.forEach((placement) => {
    const placed = placePiece(pieceMap[placement.pieceId], placement);
    placed.tiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      const existing = featureMap.get(key) || [];
      featureMap.set(key, [...existing, ...(tile.features || [])]);
    });
  });

  return featureMap;
}

export function cloneTileMap(tileMap) {
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

export function buildBoardRects(boardPlacements, pieceMap) {
  return boardPlacements.map((placement, index) => {
    const piece = pieceMap[placement.pieceId];
    const dims = rotatedDimensions(piece, placement.rotation ?? 0);

    return {
      index,
      pieceId: placement.pieceId,
      x: placement.x,
      y: placement.y,
      width: dims.width,
      height: dims.height
    };
  });
}

export function pointOnRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function getWallsAtTile(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") continue;
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

export function getDirectionDelta(dir) {
  return {
    N: { dx: 0, dy: -1, opposite: "S" },
    E: { dx: 1, dy: 0, opposite: "W" },
    S: { dx: 0, dy: 1, opposite: "N" },
    W: { dx: -1, dy: 0, opposite: "E" }
  }[dir];
}

export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pointOnPlacement(point, placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  if (!piece) {
    return false;
  }

  if (placement.overlay) {
    return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some((offset) => (
      point.x === placement.x + offset.x &&
      point.y === placement.y + offset.y
    ));
  }

  const dims = rotatedDimensions(piece, placement.rotation ?? 0);

  return (
    point.x >= placement.x &&
    point.x < placement.x + dims.width &&
    point.y >= placement.y &&
    point.y < placement.y + dims.height
  );
}
