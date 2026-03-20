export function rotateDir(dir, rot) {
  if (!dir) return dir;

  const maps = {
    90: { N: "E", E: "S", S: "W", W: "N", NE: "SE", SE: "SW", SW: "NW", NW: "NE" },
    180: { N: "S", E: "W", S: "N", W: "E", NE: "SW", SE: "NW", SW: "NE", NW: "SE" },
    270: { N: "W", E: "N", S: "E", W: "S", NE: "NW", SE: "NE", SW: "SE", NW: "SW" }
  };

  if (rot === 0) return dir;
  return maps[rot]?.[dir] ?? dir;
}

export function rotateXY(x, y, width, height, rotation) {
  if (rotation === 0) return { x, y };
  if (rotation === 90) return { x: height - 1 - y, y: x };
  if (rotation === 180) return { x: width - 1 - x, y: height - 1 - y };
  if (rotation === 270) return { x: y, y: width - 1 - x };
  return { x, y };
}

export function getPlacedRect(piece, placement) {
  const dims = rotatedDimensions(piece, placement.rotation ?? 0);
  return {
    pieceId: piece.id,
    x: placement.x,
    y: placement.y,
    width: dims.width,
    height: dims.height
  };
}

export function rotatedDimensions(piece, rotation) {
  if (rotation === 90 || rotation === 270) {
    return { width: piece.height, height: piece.width };
  }

  return { width: piece.width, height: piece.height };
}

export function rotateTile(tile, piece, rotation) {
  const pos = rotateXY(tile.x, tile.y, piece.width, piece.height, rotation);
  const features = (tile.features || []).map((feature) => {
    const out = structuredClone(feature);

    if (out.dir) {
      out.dir = rotateDir(out.dir, rotation);
    }

    if (out.sides) {
      out.sides = out.sides.map((side) => rotateDir(side, rotation));
    }

    return out;
  });

  return {
    x: pos.x,
    y: pos.y,
    features
  };
}

export function rotateStart(start, piece, rotation) {
  const pos = rotateXY(start.x, start.y, piece.width, piece.height, rotation);
  const defaultFacing = piece.kind === "dock" ? rotateDir("E", rotation) : undefined;

  return {
    x: pos.x,
    y: pos.y,
    facing: start.facing ? rotateDir(start.facing, rotation) : defaultFacing
  };
}

export function placePiece(piece, placement) {
  const { x: ox, y: oy, rotation = 0, startFacingOverride } = placement;

  const tiles = (piece.tiles || []).map((tile) => {
    const rotatedTile = rotateTile(tile, piece, rotation);
    return {
      x: rotatedTile.x + ox,
      y: rotatedTile.y + oy,
      features: rotatedTile.features
    };
  });

  const starts = (piece.starts || []).map((start) => {
    const rotatedStart = rotateStart(start, piece, rotation);
    return {
      x: rotatedStart.x + ox,
      y: rotatedStart.y + oy,
      facing: startFacingOverride ?? rotatedStart.facing
    };
  });

  const dims = rotatedDimensions(piece, rotation);

  return {
    id: piece.id,
    x: ox,
    y: oy,
    width: dims.width,
    height: dims.height,
    tiles,
    starts
  };
}

export function rectanglesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getSharedEdge(a, b) {
  if (a.x + a.width === b.x || b.x + b.width === a.x) {
    const x = a.x + a.width === b.x ? b.x : a.x;
    const yStart = Math.max(a.y, b.y);
    const yEnd = Math.min(a.y + a.height, b.y + b.height);

    if (yEnd > yStart) {
      return {
        orientation: "vertical",
        length: yEnd - yStart,
        segment: { x, yStart, yEnd }
      };
    }
  }

  if (a.y + a.height === b.y || b.y + b.height === a.y) {
    const y = a.y + a.height === b.y ? b.y : a.y;
    const xStart = Math.max(a.x, b.x);
    const xEnd = Math.min(a.x + a.width, b.x + b.width);

    if (xEnd > xStart) {
      return {
        orientation: "horizontal",
        length: xEnd - xStart,
        segment: { y, xStart, xEnd }
      };
    }
  }

  return null;
}

export function isValidBoardConnection(a, b, minSharedEdge = 5) {
  if (rectanglesOverlap(a, b)) {
    return false;
  }

  const sharedEdge = getSharedEdge(a, b);
  return Boolean(sharedEdge && sharedEdge.length >= minSharedEdge);
}

function isStructuralPiece(piece) {
  return piece.kind !== "dock" && piece.kind !== "overlay";
}

export function buildBoardGraph(placements, pieces, options = {}) {
  const { minSharedEdge = 5 } = options;
  const structuralPlacements = placements.filter((placement) => isStructuralPiece(pieces[placement.pieceId]));
  const nodes = structuralPlacements.map((placement, index) => ({
    index,
    placement,
    rect: getPlacedRect(pieces[placement.pieceId], placement)
  }));
  const adjacency = new Map();
  const seams = [];

  for (const node of nodes) {
    adjacency.set(node.index, []);
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const left = nodes[i];
      const right = nodes[j];
      const seam = getSharedEdge(left.rect, right.rect);
      if (seam && seam.length >= minSharedEdge && !rectanglesOverlap(left.rect, right.rect)) {
        adjacency.get(left.index).push(right.index);
        adjacency.get(right.index).push(left.index);
        seams.push({
          from: left.index,
          to: right.index,
          ...seam
        });
      }
    }
  }

  return {
    nodes,
    adjacency,
    seams
  };
}

export function validateMainBoardLayout(placements, pieces, options = {}) {
  const { minSharedEdge = 5 } = options;
  const structuralPlacements = placements.filter((placement) => isStructuralPiece(pieces[placement.pieceId]));
  const rects = structuralPlacements.map((placement) => ({
    pieceId: placement.pieceId,
    placement,
    rect: getPlacedRect(pieces[placement.pieceId], placement)
  }));
  const errors = [];

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectanglesOverlap(rects[i].rect, rects[j].rect)) {
        errors.push(`overlap:${rects[i].pieceId}:${rects[j].pieceId}`);
      }
    }
  }

  const graph = buildBoardGraph(structuralPlacements, pieces, { minSharedEdge });
  if (graph.nodes.length > 0) {
    const seen = new Set([graph.nodes[0].index]);
    const queue = [graph.nodes[0].index];

    while (queue.length) {
      const current = queue.shift();
      for (const next of graph.adjacency.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    if (seen.size !== graph.nodes.length) {
      errors.push("disconnected-layout");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    graph,
    rects
  };
}

export function buildMainFootprintTiles(placements, pieces) {
  const tiles = new Set();

  for (const placement of placements) {
    const piece = pieces[placement.pieceId];
    if (!isStructuralPiece(piece)) {
      continue;
    }

    const rect = getPlacedRect(piece, placement);
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        tiles.add(`${x},${y}`);
      }
    }
  }

  return tiles;
}

export function getBoundaryEdges(footprintTiles) {
  const edges = [];
  const deltas = {
    N: [0, -1],
    E: [1, 0],
    S: [0, 1],
    W: [-1, 0]
  };

  for (const key of footprintTiles) {
    const [xValue, yValue] = key.split(",");
    const x = Number(xValue);
    const y = Number(yValue);

    for (const [dir, [dx, dy]] of Object.entries(deltas)) {
      const neighborKey = `${x + dx},${y + dy}`;
      if (!footprintTiles.has(neighborKey)) {
        edges.push({ x, y, dir });
      }
    }
  }

  return edges;
}

export function groupBoundaryRuns(boundaryEdges) {
  const grouped = new Map();

  for (const edge of boundaryEdges) {
    let groupKey;
    let start;
    let end;
    let orientation;

    if (edge.dir === "N") {
      groupKey = `N:${edge.y}`;
      start = edge.x;
      end = edge.x + 1;
      orientation = "horizontal";
    } else if (edge.dir === "S") {
      groupKey = `S:${edge.y + 1}`;
      start = edge.x;
      end = edge.x + 1;
      orientation = "horizontal";
    } else if (edge.dir === "W") {
      groupKey = `W:${edge.x}`;
      start = edge.y;
      end = edge.y + 1;
      orientation = "vertical";
    } else {
      groupKey = `E:${edge.x + 1}`;
      start = edge.y;
      end = edge.y + 1;
      orientation = "vertical";
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        side: edge.dir,
        line: orientation === "horizontal"
          ? Number(groupKey.split(":")[1])
          : Number(groupKey.split(":")[1]),
        orientation,
        segments: []
      });
    }

    grouped.get(groupKey).segments.push({ start, end });
  }

  const runs = [];

  for (const group of grouped.values()) {
    const segments = group.segments.sort((a, b) => a.start - b.start);
    let current = null;

    for (const segment of segments) {
      if (!current) {
        current = { start: segment.start, end: segment.end };
        continue;
      }

      if (segment.start === current.end) {
        current.end = segment.end;
      } else {
        runs.push({
          side: group.side,
          orientation: group.orientation,
          line: group.line,
          start: current.start,
          end: current.end,
          length: current.end - current.start
        });
        current = { start: segment.start, end: segment.end };
      }
    }

    if (current) {
      runs.push({
        side: group.side,
        orientation: group.orientation,
        line: group.line,
        start: current.start,
        end: current.end,
        length: current.end - current.start
      });
    }
  }

  return runs;
}

export function projectDockPlacement(run, offset, dockPiece, flipped = false) {
  const baseRotationBySide = {
    W: 0,
    N: 90,
    E: 180,
    S: 270
  };
  const facingBySide = {
    W: "E",
    N: "S",
    E: "W",
    S: "N"
  };
  const rotation = (baseRotationBySide[run.side] + (flipped ? 180 : 0)) % 360;
  const dims = rotatedDimensions(dockPiece, rotation);

  if (run.side === "W") {
    return {
      pieceId: dockPiece.id,
      x: run.line - dims.width,
      y: run.start + offset,
      rotation,
      startFacingOverride: facingBySide[run.side]
    };
  }

  if (run.side === "E") {
    return {
      pieceId: dockPiece.id,
      x: run.line,
      y: run.start + offset,
      rotation,
      startFacingOverride: facingBySide[run.side]
    };
  }

  if (run.side === "N") {
    return {
      pieceId: dockPiece.id,
      x: run.start + offset,
      y: run.line - dims.height,
      rotation,
      startFacingOverride: facingBySide[run.side]
    };
  }

  return {
    pieceId: dockPiece.id,
    x: run.start + offset,
    y: run.line,
    rotation,
    startFacingOverride: facingBySide[run.side]
  };
}

export function getValidDockRuns(boundaryRuns, dockPiece) {
  return boundaryRuns.filter((run) => run.length >= dockPiece.height);
}

export function validateDockPlacement(dockPlacement, structuralPlacements, pieces, footprintTiles) {
  const dockPiece = pieces[dockPlacement.pieceId];
  const dockRect = getPlacedRect(dockPiece, dockPlacement);
  const structuralRects = structuralPlacements.map((placement) => getPlacedRect(pieces[placement.pieceId], placement));
  const errors = [];

  for (const rect of structuralRects) {
    if (rectanglesOverlap(dockRect, rect)) {
      errors.push("dock-overlap");
      break;
    }
  }

  const frontageTiles = [];
  if (dockPlacement.startFacingOverride === "E") {
    for (let y = dockRect.y; y < dockRect.y + dockRect.height; y += 1) {
      frontageTiles.push(`${dockRect.x + dockRect.width},${y}`);
    }
  } else if (dockPlacement.startFacingOverride === "W") {
    for (let y = dockRect.y; y < dockRect.y + dockRect.height; y += 1) {
      frontageTiles.push(`${dockRect.x - 1},${y}`);
    }
  } else if (dockPlacement.startFacingOverride === "S") {
    for (let x = dockRect.x; x < dockRect.x + dockRect.width; x += 1) {
      frontageTiles.push(`${x},${dockRect.y + dockRect.height}`);
    }
  } else if (dockPlacement.startFacingOverride === "N") {
    for (let x = dockRect.x; x < dockRect.x + dockRect.width; x += 1) {
      frontageTiles.push(`${x},${dockRect.y - 1}`);
    }
  }

  if (!frontageTiles.length || frontageTiles.some((key) => !footprintTiles.has(key))) {
    errors.push("dock-frontage");
  }

  return {
    valid: errors.length === 0,
    errors,
    dockRect,
    frontageTiles
  };
}

export function buildResolvedMap(placements, pieces) {
  const tileMap = new Map();
  const starts = [];
  const footprints = [];

  for (const placement of placements) {
    const piece = pieces[placement.pieceId];
    if (!piece) {
      throw new Error(`Unknown pieceId: ${placement.pieceId}`);
    }

    const placed = placePiece(piece, placement);

    footprints.push({
      id: placed.id,
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height
    });

    for (let dy = 0; dy < placed.height; dy += 1) {
      for (let dx = 0; dx < placed.width; dx += 1) {
        const key = `${placed.x + dx},${placed.y + dy}`;
        if (!tileMap.has(key)) {
          tileMap.set(key, {
            x: placed.x + dx,
            y: placed.y + dy,
            features: []
          });
        }
      }
    }

    for (const tile of placed.tiles) {
      const key = `${tile.x},${tile.y}`;
      if (!tileMap.has(key)) {
        tileMap.set(key, {
          x: tile.x,
          y: tile.y,
          features: []
        });
      }
      tileMap.get(key).features.push(...tile.features);
    }

    starts.push(...placed.starts);
  }

  return { tileMap, starts, footprints };
}

export function getBounds(footprints, starts = [], points = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const fp of footprints) {
    minX = Math.min(minX, fp.x);
    minY = Math.min(minY, fp.y);
    maxX = Math.max(maxX, fp.x + fp.width - 1);
    maxY = Math.max(maxY, fp.y + fp.height - 1);
  }

  for (const point of [...starts, ...points]) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 20, maxY: 20 };
  }

  return { minX, minY, maxX, maxY };
}
