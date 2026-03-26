const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const {
  buildResolvedMap,
  getBoundaryEdges,
  getBounds,
  groupBoundaryRuns
} = await import(versionedPath("./board.js"));

function drawGrid(ctx, bounds, tileSize, margin) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;

  ctx.save();
  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x++) {
    const px = margin + x * tileSize;
    ctx.beginPath();
    ctx.moveTo(px, margin);
    ctx.lineTo(px, margin + height * tileSize);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y++) {
    const py = margin + y * tileSize;
    ctx.beginPath();
    ctx.moveTo(margin, py);
    ctx.lineTo(margin + width * tileSize, py);
    ctx.stroke();
  }

  ctx.restore();
}

function drawFootprints(ctx, footprints, pieces, bounds, tileSize, margin) {
  ctx.save();
  for (const fp of footprints) {
    if (fp.kind === "overlay") {
      continue;
    }
    const x = margin + (fp.x - bounds.minX) * tileSize;
    const y = margin + (fp.y - bounds.minY) * tileSize;
    const w = fp.width * tileSize;
    const h = fp.height * tileSize;

    ctx.fillStyle = "rgba(80, 80, 80, 0.06)";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const piece = pieces[fp.id];
    const label = piece?.name ?? fp.id;
    ctx.font = "bold 14px sans-serif";
    const textWidth = ctx.measureText(label).width;
    const labelHeight = 18;
    const labelX = x + 6;
    const labelY = y + 6;

    ctx.fillStyle = "rgba(17, 24, 31, 0.58)";
    ctx.fillRect(labelX - 4, labelY - 2, textWidth + 8, labelHeight);
    ctx.fillStyle = "rgba(248, 251, 255, 0.98)";
    ctx.fillText(label, labelX, labelY + 12);
  }
  ctx.restore();
}

function buildOutlineFootprintTiles(footprints) {
  const tiles = new Set();

  for (const footprint of footprints) {
    if (footprint.kind === "overlay") {
      continue;
    }

    for (let y = footprint.y; y < footprint.y + footprint.height; y += 1) {
      for (let x = footprint.x; x < footprint.x + footprint.width; x += 1) {
        tiles.add(`${x},${y}`);
      }
    }
  }

  return tiles;
}

function drawOverlayGlows(ctx, overlayPlacements, pieces, bounds, tileSize, margin, boardCount) {
  ctx.save();
  const glowScale = 1 + Math.max(0, boardCount - 2) * 0.14;
  for (const placement of overlayPlacements || []) {
    const piece = pieces[placement.pieceId];
    if (!piece) {
      continue;
    }
    const drawX = margin + (placement.x - bounds.minX) * tileSize;
    const drawY = margin + (placement.y - bounds.minY) * tileSize;
    const drawW = piece.width * tileSize;
    const drawH = piece.height * tileSize;

    ctx.shadowColor = "rgba(88, 190, 255, 0.6)";
    ctx.shadowBlur = 14 * glowScale;
    ctx.strokeStyle = "rgba(88, 190, 255, 0.82)";
    ctx.lineWidth = 2.75 * glowScale;
    ctx.strokeRect(drawX + 1, drawY + 1, drawW - 2, drawH - 2);
  }
  ctx.restore();
}

function drawWalls(ctx, sides, x, y, tileSize) {
  ctx.save();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;

  const left = x;
  const top = y;
  const right = x + tileSize;
  const bottom = y + tileSize;

  for (const side of sides || []) {
    ctx.beginPath();
    if (side === "N") {
      ctx.moveTo(left, top);
      ctx.lineTo(right, top);
    } else if (side === "E") {
      ctx.moveTo(right, top);
      ctx.lineTo(right, bottom);
    } else if (side === "S") {
      ctx.moveTo(left, bottom);
      ctx.lineTo(right, bottom);
    } else if (side === "W") {
      ctx.moveTo(left, top);
      ctx.lineTo(left, bottom);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawFeatures(ctx, tileMap, bounds, tileSize, margin, showLabels = true, showWalls = true, visibleFeatureTypes = null) {
  ctx.save();
  ctx.font = "10px monospace";

  for (const tile of tileMap.values()) {
    const px = margin + (tile.x - bounds.minX) * tileSize;
    const py = margin + (tile.y - bounds.minY) * tileSize;

    let line = 0;
    for (const feature of tile.features) {
      if (visibleFeatureTypes && !visibleFeatureTypes.has(feature.type)) {
        continue;
      }

      if (feature.type === "wall") {
        if (showWalls) {
          drawWalls(ctx, feature.sides, px, py, tileSize);
        }
        continue;
      }

      if (!showLabels) {
        continue;
      }

      let label = feature.type;

      if (feature.type === "belt") {
        label = `belt ${feature.dir ?? ""}${feature.speed ?? ""}`.trim();
      } else if (feature.type === "laser") {
        label = `laser${feature.dir ? " " + feature.dir : ""}`;
      } else if (feature.type === "flamethrower") {
        const timing = feature.timing?.length ? ` [${feature.timing.join(",")}]` : "";
        label = `flame${feature.dir ? " " + feature.dir : ""}${timing}`;
      } else if (feature.type === "gear") {
        label = `gear ${feature.rotation}`;
      } else if (feature.type === "checkpoint") {
        label = `cp ${feature.id}`;
      } else if (feature.type === "push") {
        const timing = feature.timing?.length ? ` [${feature.timing.join(",")}]` : "";
        label = `push ${feature.dir ?? ""}${timing}`.trim();
      } else if (feature.type === "crusher") {
        const timing = feature.timing?.length ? ` [${feature.timing.join(",")}]` : "";
        label = `crusher${timing}`;
      } else if (feature.type === "portal") {
        label = `portal ${feature.id ?? ""}`.trim();
      } else if (feature.type === "oil") {
        label = "oil";
      }

      ctx.fillStyle = "#111";
      ctx.fillText(label, px + 2, py + 11 + line * 10);
      line += 1;
    }
  }

  ctx.restore();
}

function drawStarts(ctx, starts, bounds, tileSize, margin, unusableStartIndices = new Set(), showFacing = true, visibleFeatureTypes = null) {
  if (visibleFeatureTypes && !visibleFeatureTypes.has("start")) {
    return;
  }

  ctx.save();

  starts.forEach((s, index) => {
    const px = margin + (s.x - bounds.minX) * tileSize;
    const py = margin + (s.y - bounds.minY) * tileSize;

    if (unusableStartIndices.has(index)) {
      ctx.fillStyle = "rgba(232, 137, 28, 0.88)";
      ctx.fillRect(px + 13, py + 13, tileSize - 26, tileSize - 26);
      ctx.strokeStyle = "#8a4b10";
      ctx.lineWidth = 1.25;
      ctx.strokeRect(px + 13, py + 13, tileSize - 26, tileSize - 26);
    }

    if (showFacing) {
      ctx.fillStyle = "#1f1815";
      ctx.font = "10px sans-serif";
      ctx.fillText(s.facing ?? "", px + 2, py + tileSize - 4);
    }
  });

  ctx.restore();
}

function drawGoals(ctx, goals, bounds, tileSize, margin) {
  for (const [index, goal] of (goals || []).entries()) {
    const left = margin + (goal.x - bounds.minX) * tileSize;
    const top = margin + (goal.y - bounds.minY) * tileSize;
    const py = top + tileSize / 2;

    ctx.save();
    ctx.fillStyle = "#f2b300";
    ctx.strokeStyle = "#8a6200";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + tileSize * 0.26, top + tileSize * 0.22);
    ctx.lineTo(left + tileSize * 0.26, top + tileSize * 0.78);
    ctx.lineTo(left + tileSize * 0.84, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(String(index + 1), left + tileSize * 0.4, py + 4);
    ctx.restore();
  }
}

function drawRebootTokens(ctx, rebootTokens, bounds, tileSize, margin) {
  for (const token of rebootTokens || []) {
    const left = margin + (token.x - bounds.minX) * tileSize;
    const top = margin + (token.y - bounds.minY) * tileSize;
    const size = tileSize * 0.72;
    const inset = (tileSize - size) / 2;
    const cx = left + tileSize / 2;
    const cy = top + tileSize / 2;

    ctx.save();
    ctx.fillStyle = "#73c53d";
    ctx.strokeStyle = "#2f7e1c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(left + inset, top + inset, size, size, 10);
    ctx.fill();
    ctx.stroke();

    ctx.translate(cx, cy);
    const rotation = {
      N: 0,
      E: Math.PI / 2,
      S: Math.PI,
      W: -Math.PI / 2
    }[token.dir] ?? 0;
    ctx.rotate(rotation);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.moveTo(0, -tileSize * 0.23);
    ctx.lineTo(tileSize * 0.14, -tileSize * 0.02);
    ctx.lineTo(tileSize * 0.06, -tileSize * 0.02);
    ctx.lineTo(tileSize * 0.06, tileSize * 0.2);
    ctx.lineTo(-tileSize * 0.06, tileSize * 0.2);
    ctx.lineTo(-tileSize * 0.06, -tileSize * 0.02);
    ctx.lineTo(-tileSize * 0.14, -tileSize * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawRoutes(ctx, analysis, bounds, tileSize, margin) {
  if (!analysis) return;

  const palette = ["#0d6efd", "#198754", "#dc3545", "#6f42c1", "#fd7e14", "#20c997"];

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const routeEntries = Array.isArray(analysis.routes)
    ? analysis.routes.map((route, index) => ({ index, route }))
    : analysis.starts
      .filter((startAnalysis) => startAnalysis.routes.length)
      .map((startAnalysis) => ({
        index: startAnalysis.index,
        route: startAnalysis.selectedRoute ?? startAnalysis.routes[0]
      }));

  for (const entry of routeEntries) {
    const color = palette[entry.index % palette.length];
    const selectedRoute = entry.route;

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();

    selectedRoute.path.forEach((point, index) => {
      const px = margin + (point.x - bounds.minX) * tileSize + tileSize / 2;
      const py = margin + (point.y - bounds.minY) * tileSize + tileSize / 2;

      if (index === 0 || point.jump) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });

    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "11px monospace";
    selectedRoute.transitions.forEach((transition) => {
      const label = `${transition.action[0]}:${transition.to.facing ?? ""}`;
      const px = margin + (transition.to.x - bounds.minX) * tileSize + 3;
      const py = margin + (transition.to.y - bounds.minY) * tileSize + tileSize - 6;
      ctx.fillText(label, px, py);
    });
  }

  ctx.restore();
}

function drawBoardEdgeOutline(ctx, footprints, bounds, tileSize, margin, color = "#f2c230") {
  const footprintTiles = buildOutlineFootprintTiles(footprints);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));

  if (!boundaryRuns.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;

  for (const run of boundaryRuns) {
    ctx.beginPath();

    if (run.orientation === "horizontal") {
      const y = margin + (run.line - bounds.minY) * tileSize;
      const startX = margin + (run.start - bounds.minX) * tileSize;
      const endX = margin + (run.end - bounds.minX) * tileSize;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    } else {
      const x = margin + (run.line - bounds.minX) * tileSize;
      const startY = margin + (run.start - bounds.minY) * tileSize;
      const endY = margin + (run.end - bounds.minY) * tileSize;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }

    ctx.stroke();
  }

  ctx.restore();
}

function drawPieceImages(ctx, placements, pieces, imageMap, bounds, tileSize, margin) {
  for (const placement of placements) {
    const piece = pieces[placement.pieceId];
    const img = imageMap[piece.id];
    if (!img) continue;

    const drawX = margin + (placement.x - bounds.minX) * tileSize;
    const drawY = margin + (placement.y - bounds.minY) * tileSize;

    ctx.save();
    ctx.translate(drawX, drawY);

    const wTiles = piece.width;
    const hTiles = piece.height;
    const drawW = wTiles * tileSize;
    const drawH = hTiles * tileSize;

    if (placement.rotation === 0) {
      ctx.drawImage(img, 0, 0, drawW, drawH);
    } else {
      const rot = placement.rotation * Math.PI / 180;

      if (placement.rotation === 90) {
        ctx.translate(hTiles * tileSize, 0);
      } else if (placement.rotation === 180) {
        ctx.translate(wTiles * tileSize, hTiles * tileSize);
      } else if (placement.rotation === 270) {
        ctx.translate(0, wTiles * tileSize);
      }

      ctx.rotate(rot);
      ctx.drawImage(img, 0, 0, drawW, drawH);
    }

    ctx.restore();
  }
}

export function render(canvas, pieces, imageMap = {}, options = {}) {
  const ctx = canvas.getContext("2d");
  const placements = options.placements || [
    { pieceId: "cactus", x: 5, y: 5, rotation: 0 },
    { pieceId: "docking-bay-a", x: 2, y: 5, rotation: 0 }
  ];
  const resolved = buildResolvedMap(placements, pieces);
  const tileMap = options.tileMap ?? resolved.tileMap;
  const starts = options.starts ?? resolved.starts;
  const footprints = resolved.footprints;
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const boardCount = placements.filter((placement) => {
    const piece = pieces[placement.pieceId];
    return piece?.kind !== "dock" && !placement.overlay;
  }).length;
  const bounds = getBounds(footprints, starts, options.goals || (options.goal ? [options.goal] : []));
  const unusableStartIndices = new Set(options.unusableStartIndices || []);
  const showBoardLabels = options.showBoardLabels ?? true;
  const showStartFacing = options.showStartFacing ?? true;
  const showWalls = options.showWalls ?? true;
  const showPieceImages = options.showPieceImages ?? true;
  const showFootprints = options.showFootprints ?? true;
  const edgeOutlineColor = options.edgeOutlineColor ?? null;
  const visibleFeatureTypes = options.visibleFeatureTypes
    ? new Set(options.visibleFeatureTypes)
    : null;

  const tileSize = 40;
  const margin = 30;

  const gridWidth = bounds.maxX - bounds.minX + 1;
  const gridHeight = bounds.maxY - bounds.minY + 1;

  canvas.width = gridWidth * tileSize + margin * 2;
  canvas.height = gridHeight * tileSize + margin * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showPieceImages) {
    drawPieceImages(ctx, placements, pieces, imageMap, bounds, tileSize, margin);
  }
  drawOverlayGlows(ctx, overlayPlacements, pieces, bounds, tileSize, margin, boardCount);
  if (showFootprints) {
    drawFootprints(ctx, footprints, pieces, bounds, tileSize, margin);
  }
  drawGrid(ctx, bounds, tileSize, margin);
  drawFeatures(ctx, tileMap, bounds, tileSize, margin, showBoardLabels, showWalls, visibleFeatureTypes);
  drawStarts(ctx, starts, bounds, tileSize, margin, unusableStartIndices, showStartFacing, visibleFeatureTypes);
  drawRebootTokens(ctx, options.rebootTokens || [], bounds, tileSize, margin);
  drawRoutes(ctx, options.analysis, bounds, tileSize, margin);
  drawGoals(ctx, options.goals || (options.goal ? [options.goal] : []), bounds, tileSize, margin);
  if (edgeOutlineColor) {
    drawBoardEdgeOutline(ctx, footprints, bounds, tileSize, margin, edgeOutlineColor);
  }
}
