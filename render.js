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
  function measurePieceLabel(label, x, y, styles) {
    ctx.save();
    ctx.font = "bold 14px sans-serif";
    const textWidth = ctx.measureText(label).width;
    const labelHeight = 18;
    const labelX = x + 6;
    const labelY = y + (styles.offsetY ?? 6);
    ctx.restore();

    return {
      left: labelX - 4,
      top: labelY - 2,
      right: labelX - 4 + textWidth + 8,
      bottom: labelY - 2 + labelHeight,
      textWidth,
      labelX,
      labelY,
      labelHeight
    };
  }

  function drawPieceLabel(label, x, y, styles) {
    const rect = measurePieceLabel(label, x, y, styles);

    ctx.save();
    ctx.font = "bold 14px sans-serif";

    ctx.fillStyle = styles.background;
    ctx.fillRect(rect.left, rect.top, rect.textWidth + 8, rect.labelHeight);
    ctx.fillStyle = styles.color;
    ctx.fillText(label, rect.labelX, rect.labelY + 12);
    ctx.restore();

    return rect;
  }

  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  const mainLabelRects = [];

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
    mainLabelRects.push(drawPieceLabel(label, x, y, {
      background: "rgba(17, 24, 31, 0.58)",
      color: "rgba(248, 251, 255, 0.98)"
    }));
  }

  for (const fp of footprints) {
    if (fp.kind !== "overlay") {
      continue;
    }

    const x = margin + (fp.x - bounds.minX) * tileSize;
    const y = margin + (fp.y - bounds.minY) * tileSize;
    const piece = pieces[fp.id];
    const label = piece?.name ?? fp.id;

    const overlayStyles = {
      background: "rgba(111, 201, 236, 0.55)",
      color: "rgba(9, 30, 39, 0.96)"
    };

    const defaultRect = measurePieceLabel(label, x, y, overlayStyles);
    const shouldOffset = mainLabelRects.some((rect) => rectsOverlap(rect, defaultRect));
    drawPieceLabel(label, x, y, shouldOffset ? { ...overlayStyles, offsetY: 32 } : overlayStyles);
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

function directionToAngle(dir) {
  switch (dir) {
    case "N":
      return -Math.PI / 2;
    case "E":
      return 0;
    case "S":
      return Math.PI / 2;
    case "W":
      return Math.PI;
    default:
      return 0;
  }
}

function drawDirectionArrow(ctx, cx, cy, size, dir, color = "#ffffff") {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(directionToAngle(dir));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(-size * 0.18, -size * 0.34);
  ctx.lineTo(-size * 0.18, -size * 0.12);
  ctx.lineTo(-size * 0.5, -size * 0.12);
  ctx.lineTo(-size * 0.5, size * 0.12);
  ctx.lineTo(-size * 0.18, size * 0.12);
  ctx.lineTo(-size * 0.18, size * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawIconBadge(ctx, left, top, size, options = {}) {
  ctx.save();
  ctx.fillStyle = options.fill ?? "#3d4c57";
  ctx.strokeStyle = options.stroke ?? "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, Math.max(3, size * 0.24));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBadgeText(ctx, text, left, top, size, options = {}) {
  if (!text) {
    return;
  }

  ctx.save();
  ctx.fillStyle = options.color ?? "#ffffff";
  ctx.font = `${options.bold ? "bold " : ""}${Math.max(7, Math.round(size * 0.38))}px sans-serif`;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    text,
    options.x ?? (left + size / 2),
    options.y ?? (top + size / 2)
  );
  ctx.restore();
}

function drawBadgeTiming(ctx, timing, left, top, size, options = {}) {
  if (!timing?.length) {
    return;
  }

  ctx.save();
  ctx.fillStyle = options.fill ?? "rgba(17, 23, 28, 0.82)";
  ctx.strokeStyle = options.stroke ?? "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  const width = Math.min(size - 4, Math.max(size * 0.38, 7 + timing.join("").length * 4));
  const height = Math.max(7, size * 0.3);
  ctx.beginPath();
  ctx.roundRect(left + size - width - 2, top + size - height - 2, width, height, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawBadgeText(ctx, timing.join(""), left, top, size, {
    color: "#ffffff",
    bold: true,
    x: left + size - width / 2 - 2,
    y: top + size - height / 2 - 2
  });
}

function drawFeatureIcon(ctx, feature, left, top, size) {
  const cx = left + size / 2;
  const cy = top + size / 2;

  switch (feature.type) {
    case "belt":
      drawIconBadge(ctx, left, top, size, { fill: "#2f7fb8", stroke: "#13456d" });
      drawDirectionArrow(ctx, cx, cy, size * 0.52, feature.dir, "#eff8ff");
      if (feature.speed && feature.speed > 1) {
        drawBadgeText(ctx, String(feature.speed), left, top, size, {
          color: "#ffffff",
          bold: true,
          x: left + size * 0.76,
          y: top + size * 0.28
        });
      }
      return;
    case "laser":
      drawIconBadge(ctx, left, top, size, { fill: "#d95d2a", stroke: "#7e2d12" });
      drawBadgeText(ctx, "L", left, top, size, { color: "#fff6df", bold: true });
      return;
    case "pit":
      drawIconBadge(ctx, left, top, size, { fill: "#2d2d2d", stroke: "#0f0f0f" });
      ctx.save();
      ctx.fillStyle = "#0f0f0f";
      ctx.beginPath();
      ctx.ellipse(cx, cy, size * 0.22, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    case "gear":
      drawIconBadge(ctx, left, top, size, { fill: "#8d97a0", stroke: "#48545d" });
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#e9eef1";
      for (let index = 0; index < 8; index += 1) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(size * 0.16, -size * 0.05, size * 0.12, size * 0.1);
      }
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e9eef1";
      ctx.lineWidth = Math.max(1, size * 0.08);
      const normalizedRotation = String(feature.rotation ?? "cw").toLowerCase();
      const counterClockwise = normalizedRotation === "ccw";
      const arcStart = counterClockwise ? Math.PI * 0.12 : Math.PI * 1.12;
      const arcEnd = counterClockwise ? Math.PI * 1.18 : Math.PI * 2.18;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.3, arcStart, arcEnd);
      ctx.stroke();

      const arrowAngle = counterClockwise ? arcEnd : arcStart;
      const arrowX = Math.cos(arrowAngle) * size * 0.3;
      const arrowY = Math.sin(arrowAngle) * size * 0.3;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(arrowAngle + (counterClockwise ? Math.PI / 2 : -Math.PI / 2));
      ctx.beginPath();
      ctx.moveTo(size * 0.07, 0);
      ctx.lineTo(-size * 0.07, -size * 0.06);
      ctx.lineTo(-size * 0.03, 0);
      ctx.lineTo(-size * 0.07, size * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
      drawBadgeText(ctx, counterClockwise ? "CC" : "CW", left, top, size, {
        color: "#1e2a31",
        bold: true,
        y: top + size * 0.8
      });
      return;
    case "push":
      drawIconBadge(ctx, left, top, size, { fill: "#f0a33d", stroke: "#8c5310" });
      drawDirectionArrow(ctx, cx, cy, size * 0.46, feature.dir, "#3a240a");
      drawBadgeTiming(ctx, feature.timing, left, top, size, { fill: "rgba(58, 36, 10, 0.82)" });
      return;
    case "flamethrower":
      drawIconBadge(ctx, left, top, size, { fill: "#ee7b30", stroke: "#95340a" });
      ctx.save();
      ctx.fillStyle = "#fff0ba";
      ctx.beginPath();
      ctx.moveTo(cx, top + size * 0.18);
      ctx.quadraticCurveTo(left + size * 0.82, top + size * 0.46, cx, top + size * 0.82);
      ctx.quadraticCurveTo(left + size * 0.18, top + size * 0.46, cx, top + size * 0.18);
      ctx.fill();
      ctx.restore();
      drawDirectionArrow(ctx, cx, cy, size * 0.32, feature.dir, "#6e2100");
      drawBadgeTiming(ctx, feature.timing, left, top, size, { fill: "rgba(106, 36, 9, 0.82)" });
      return;
    case "crusher":
      drawIconBadge(ctx, left, top, size, { fill: "#6d7780", stroke: "#303a42" });
      ctx.save();
      ctx.fillStyle = "#e8edf0";
      ctx.fillRect(left + size * 0.18, top + size * 0.24, size * 0.2, size * 0.52);
      ctx.fillRect(left + size * 0.62, top + size * 0.24, size * 0.2, size * 0.52);
      ctx.restore();
      drawBadgeTiming(ctx, feature.timing, left, top, size);
      return;
    case "portal":
      drawIconBadge(ctx, left, top, size, { fill: "#4b6b74", stroke: "#203a40" });
      ctx.save();
      ctx.strokeStyle = "#d8f6ff";
      ctx.lineWidth = Math.max(1.4, size * 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawBadgeText(ctx, String(feature.id ?? ""), left, top, size, {
        color: "#d8f6ff",
        bold: true,
        x: left + size * 0.76,
        y: top + size * 0.28
      });
      return;
    case "teleporter":
      drawIconBadge(ctx, left, top, size, { fill: "#4f96a8", stroke: "#1e4f5d" });
      ctx.save();
      ctx.strokeStyle = "#ebfbff";
      ctx.lineWidth = Math.max(1.2, size * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (feature.power) {
        drawBadgeText(ctx, String(feature.power), left, top, size, {
          color: "#ffffff",
          bold: true,
          x: left + size * 0.24,
          y: top + size * 0.28
        });
      }
      return;
    case "randomizer":
      drawIconBadge(ctx, left, top, size, { fill: "#8b98a4", stroke: "#43505b" });
      drawBadgeText(ctx, "?", left, top, size, { color: "#ffffff", bold: true });
      return;
    case "water":
      drawIconBadge(ctx, left, top, size, { fill: "#5aa9d6", stroke: "#245b7b" });
      ctx.save();
      ctx.strokeStyle = "#eef9ff";
      ctx.lineWidth = Math.max(1.1, size * 0.08);
      for (const row of [0.36, 0.58]) {
        ctx.beginPath();
        ctx.moveTo(left + size * 0.18, top + size * row);
        ctx.quadraticCurveTo(left + size * 0.34, top + size * (row - 0.09), left + size * 0.5, top + size * row);
        ctx.quadraticCurveTo(left + size * 0.66, top + size * (row + 0.09), left + size * 0.82, top + size * row);
        ctx.stroke();
      }
      ctx.restore();
      return;
    case "oil":
      drawIconBadge(ctx, left, top, size, { fill: "#353b42", stroke: "#13171b" });
      ctx.save();
      ctx.fillStyle = "#f1f4f6";
      ctx.beginPath();
      ctx.moveTo(cx, top + size * 0.2);
      ctx.quadraticCurveTo(left + size * 0.72, top + size * 0.44, cx, top + size * 0.78);
      ctx.quadraticCurveTo(left + size * 0.28, top + size * 0.44, cx, top + size * 0.2);
      ctx.fill();
      ctx.restore();
      return;
    case "ramp":
      drawIconBadge(ctx, left, top, size, { fill: "#b68a50", stroke: "#69451c" });
      drawDirectionArrow(ctx, cx, cy, size * 0.44, feature.dir, "#fff3d6");
      return;
    case "checkpoint":
      drawIconBadge(ctx, left, top, size, { fill: "#f0c23b", stroke: "#936500" });
      ctx.save();
      ctx.strokeStyle = "#312100";
      ctx.lineWidth = Math.max(1.1, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(left + size * 0.28, top + size * 0.2);
      ctx.lineTo(left + size * 0.28, top + size * 0.78);
      ctx.stroke();
      ctx.fillStyle = "#312100";
      ctx.beginPath();
      ctx.moveTo(left + size * 0.3, top + size * 0.22);
      ctx.lineTo(left + size * 0.72, top + size * 0.34);
      ctx.lineTo(left + size * 0.3, top + size * 0.46);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      drawBadgeText(ctx, String(feature.id ?? ""), left, top, size, {
        color: "#312100",
        bold: true,
        x: left + size * 0.72,
        y: top + size * 0.72
      });
      return;
    case "battery":
      drawIconBadge(ctx, left, top, size, { fill: "#58a463", stroke: "#25572d" });
      ctx.save();
      ctx.strokeStyle = "#f2fff1";
      ctx.lineWidth = Math.max(1.2, size * 0.08);
      ctx.strokeRect(left + size * 0.24, top + size * 0.28, size * 0.46, size * 0.4);
      ctx.fillStyle = "#f2fff1";
      ctx.fillRect(left + size * 0.7, top + size * 0.4, size * 0.08, size * 0.16);
      ctx.fillRect(left + size * 0.38, top + size * 0.38, size * 0.08, size * 0.2);
      ctx.fillRect(left + size * 0.32, top + size * 0.44, size * 0.2, size * 0.08);
      ctx.restore();
      return;
    default:
      drawIconBadge(ctx, left, top, size);
      drawBadgeText(ctx, feature.type.slice(0, 2).toUpperCase(), left, top, size, { color: "#ffffff", bold: true });
  }
}

function getFeatureIconLayer(feature) {
  switch (feature.type) {
    case "water":
    case "oil":
    case "pit":
      return "background";
    case "belt":
    case "gear":
    case "portal":
    case "teleporter":
    case "randomizer":
    case "ramp":
    case "ledge":
      return "middle";
    case "laser":
      return "laser";
    default:
      return "overlay";
  }
}

function getLayerSlots(count, x, y, tileSize, size) {
  const centerX = x + tileSize / 2;
  const centerY = y + tileSize / 2;
  const offset = tileSize * 0.18;

  if (count <= 1) {
    return [{ left: centerX - size / 2, top: centerY - size / 2 }];
  }
  if (count === 2) {
    return [
      { left: centerX - size - offset * 0.25, top: centerY - size / 2 },
      { left: centerX + offset * 0.25, top: centerY - size / 2 }
    ];
  }
  if (count === 3) {
    return [
      { left: centerX - size / 2, top: centerY - size - offset * 0.12 },
      { left: centerX - size - offset * 0.25, top: centerY + offset * 0.15 },
      { left: centerX + offset * 0.25, top: centerY + offset * 0.15 }
    ];
  }
  return [
    { left: centerX - size - offset * 0.2, top: centerY - size - offset * 0.2 },
    { left: centerX + offset * 0.2, top: centerY - size - offset * 0.2 },
    { left: centerX - size - offset * 0.2, top: centerY + offset * 0.2 },
    { left: centerX + offset * 0.2, top: centerY + offset * 0.2 }
  ];
}

function drawBackgroundFeature(ctx, feature, x, y, tileSize) {
  const cx = x + tileSize / 2;
  const cy = y + tileSize / 2;

  switch (feature.type) {
    case "water":
      ctx.save();
      ctx.fillStyle = "rgba(90, 169, 214, 0.38)";
      ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      ctx.strokeStyle = "rgba(238, 249, 255, 0.92)";
      ctx.lineWidth = Math.max(1.1, tileSize * 0.05);
      for (const row of [0.28, 0.48, 0.68]) {
        ctx.beginPath();
        ctx.moveTo(x + tileSize * 0.12, y + tileSize * row);
        ctx.quadraticCurveTo(x + tileSize * 0.28, y + tileSize * (row - 0.08), x + tileSize * 0.44, y + tileSize * row);
        ctx.quadraticCurveTo(x + tileSize * 0.6, y + tileSize * (row + 0.08), x + tileSize * 0.76, y + tileSize * row);
        ctx.quadraticCurveTo(x + tileSize * 0.88, y + tileSize * (row - 0.04), x + tileSize * 0.92, y + tileSize * row);
        ctx.stroke();
      }
      ctx.restore();
      return;
    case "oil":
      ctx.save();
      ctx.fillStyle = "rgba(33, 39, 44, 0.72)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileSize * 0.26, tileSize * 0.18, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(241, 244, 246, 0.9)";
      ctx.beginPath();
      ctx.moveTo(cx, y + tileSize * 0.22);
      ctx.quadraticCurveTo(x + tileSize * 0.7, y + tileSize * 0.46, cx, y + tileSize * 0.74);
      ctx.quadraticCurveTo(x + tileSize * 0.3, y + tileSize * 0.46, cx, y + tileSize * 0.22);
      ctx.fill();
      ctx.restore();
      return;
    case "pit":
      ctx.save();
      ctx.fillStyle = "rgba(22, 22, 22, 0.22)";
      ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      ctx.fillStyle = "#0f0f0f";
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileSize * 0.26, tileSize * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = Math.max(1, tileSize * 0.04);
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileSize * 0.2, tileSize * 0.27, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
  }
}

function drawLedgeFeature(ctx, feature, x, y, tileSize) {
  ctx.save();
  ctx.strokeStyle = "#493d2d";
  ctx.lineWidth = Math.max(2, tileSize * 0.09);

  for (const side of feature.sides || []) {
    let x1 = x;
    let y1 = y;
    let x2 = x;
    let y2 = y;
    let insetX = 0;
    let insetY = 0;

    if (side === "N") {
      x1 = x;
      y1 = y + 1;
      x2 = x + tileSize;
      y2 = y + 1;
      insetY = tileSize * 0.12;
    } else if (side === "E") {
      x1 = x + tileSize - 1;
      y1 = y;
      x2 = x + tileSize - 1;
      y2 = y + tileSize;
      insetX = -tileSize * 0.12;
    } else if (side === "S") {
      x1 = x;
      y1 = y + tileSize - 1;
      x2 = x + tileSize;
      y2 = y + tileSize - 1;
      insetY = -tileSize * 0.12;
    } else if (side === "W") {
      x1 = x + 1;
      y1 = y;
      x2 = x + 1;
      y2 = y + tileSize;
      insetX = tileSize * 0.12;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 244, 219, 0.9)";
    ctx.lineWidth = Math.max(1, tileSize * 0.04);
    ctx.beginPath();
    ctx.moveTo(x1 + insetX, y1 + insetY);
    ctx.lineTo(x2 + insetX, y2 + insetY);
    ctx.stroke();

    ctx.strokeStyle = "#493d2d";
    ctx.lineWidth = Math.max(2, tileSize * 0.09);
  }

  ctx.restore();
}

function drawRampFeature(ctx, feature, x, y, tileSize) {
  const size = tileSize * 0.34;
  let left = x + (tileSize - size) / 2;
  let top = y + (tileSize - size) / 2;

  if (feature.dir === "N") {
    top = y + 2;
  } else if (feature.dir === "S") {
    top = y + tileSize - size - 2;
  } else if (feature.dir === "E") {
    left = x + tileSize - size - 2;
  } else if (feature.dir === "W") {
    left = x + 2;
  }

  drawIconBadge(ctx, left, top, size, { fill: "#b68a50", stroke: "#69451c" });

  const cx = left + size / 2;
  const cy = top + size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(directionToAngle(feature.dir));
  ctx.fillStyle = "#fff3d6";
  ctx.beginPath();
  ctx.moveTo(size * 0.24, 0);
  ctx.lineTo(-size * 0.18, -size * 0.22);
  ctx.lineTo(-size * 0.18, size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(105, 69, 28, 0.72)";
  ctx.fillRect(-size * 0.22, -size * 0.1, size * 0.12, size * 0.2);
  ctx.restore();
}

function drawLaserFeature(ctx, feature, x, y, tileSize) {
  const beamCount = Math.max(1, Math.min(3, feature.damage ?? 1));
  const inset = tileSize * 0.16;
  const spacing = tileSize * 0.1;
  const offsets = beamCount === 1
    ? [0]
    : beamCount === 2
      ? [-spacing / 2, spacing / 2]
      : [-spacing, 0, spacing];

  ctx.save();
  ctx.strokeStyle = "rgba(212, 66, 24, 0.96)";
  ctx.lineWidth = Math.max(1.3, tileSize * 0.06);
  ctx.lineCap = "round";
  ctx.fillStyle = "rgba(255, 244, 209, 0.96)";

  offsets.forEach((offset) => {
    ctx.beginPath();
    if (feature.dir === "N" || feature.dir === "S") {
      const lineX = x + tileSize / 2 + offset;
      ctx.moveTo(lineX, y + inset);
      ctx.lineTo(lineX, y + tileSize - inset);
    } else {
      const lineY = y + tileSize / 2 + offset;
      ctx.moveTo(x + inset, lineY);
      ctx.lineTo(x + tileSize - inset, lineY);
    }
    ctx.stroke();
  });

  const arrowSize = tileSize * 0.12;
  ctx.beginPath();
  if (feature.dir === "N") {
    ctx.moveTo(x + tileSize / 2, y + inset * 0.55);
    ctx.lineTo(x + tileSize / 2 - arrowSize, y + inset + arrowSize);
    ctx.lineTo(x + tileSize / 2 + arrowSize, y + inset + arrowSize);
  } else if (feature.dir === "S") {
    ctx.moveTo(x + tileSize / 2, y + tileSize - inset * 0.55);
    ctx.lineTo(x + tileSize / 2 - arrowSize, y + tileSize - inset - arrowSize);
    ctx.lineTo(x + tileSize / 2 + arrowSize, y + tileSize - inset - arrowSize);
  } else if (feature.dir === "W") {
    ctx.moveTo(x + inset * 0.55, y + tileSize / 2);
    ctx.lineTo(x + inset + arrowSize, y + tileSize / 2 - arrowSize);
    ctx.lineTo(x + inset + arrowSize, y + tileSize / 2 + arrowSize);
  } else {
    ctx.moveTo(x + tileSize - inset * 0.55, y + tileSize / 2);
    ctx.lineTo(x + tileSize - inset - arrowSize, y + tileSize / 2 - arrowSize);
    ctx.lineTo(x + tileSize - inset - arrowSize, y + tileSize / 2 + arrowSize);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTileFeatureIcons(ctx, features, x, y, tileSize) {
  const visibleFeatures = features.filter((feature) => feature.type !== "wall");
  if (!visibleFeatures.length) {
    return;
  }

  const backgroundFeatures = visibleFeatures.filter((feature) => getFeatureIconLayer(feature) === "background");
  const ledgeFeatures = visibleFeatures.filter((feature) => feature.type === "ledge");
  const rampFeatures = visibleFeatures.filter((feature) => feature.type === "ramp");
  const middleFeatures = visibleFeatures.filter((feature) => {
    const layer = getFeatureIconLayer(feature);
    return layer === "middle" && feature.type !== "ledge" && feature.type !== "ramp";
  });
  const overlayFeatures = visibleFeatures.filter((feature) => getFeatureIconLayer(feature) === "overlay");
  const laserFeatures = visibleFeatures.filter((feature) => getFeatureIconLayer(feature) === "laser");

  backgroundFeatures.forEach((feature) => {
    drawBackgroundFeature(ctx, feature, x, y, tileSize);
  });

  ledgeFeatures.forEach((feature) => {
    drawLedgeFeature(ctx, feature, x, y, tileSize);
  });

  rampFeatures.forEach((feature) => {
    drawRampFeature(ctx, feature, x, y, tileSize);
  });

  const middleSize = middleFeatures.length > 1 ? tileSize * 0.36 : tileSize * 0.5;
  getLayerSlots(Math.min(middleFeatures.length, 4), x, y, tileSize, middleSize)
    .forEach((slot, index) => {
      const feature = middleFeatures[index];
      if (feature) {
        drawFeatureIcon(ctx, feature, slot.left, slot.top, middleSize);
      }
    });

  const overlaySize = overlayFeatures.length > 2 ? tileSize * 0.27 : tileSize * 0.31;
  getLayerSlots(Math.min(overlayFeatures.length, 4), x, y, tileSize, overlaySize)
    .forEach((slot, index) => {
      const feature = overlayFeatures[index];
      if (feature) {
        drawFeatureIcon(ctx, feature, slot.left, slot.top, overlaySize);
      }
    });

  if (overlayFeatures.length > 4) {
    const badgeSize = tileSize * 0.24;
    const left = x + tileSize - badgeSize - 2;
    const top = y + 2;
    drawIconBadge(ctx, left, top, badgeSize, { fill: "#11181d", stroke: "#4a5963" });
    drawBadgeText(ctx, `+${overlayFeatures.length - 4}`, left, top, badgeSize, {
      color: "#ffffff",
      bold: true
    });
  }

  laserFeatures.forEach((feature) => {
    drawLaserFeature(ctx, feature, x, y, tileSize);
  });
}

function drawFeatures(
  ctx,
  tileMap,
  bounds,
  tileSize,
  margin,
  showLabels = true,
  showWalls = true,
  visibleFeatureTypes = null,
  showFeatureIcons = false
) {
  ctx.save();
  ctx.font = "10px monospace";

  for (const tile of tileMap.values()) {
    const px = margin + (tile.x - bounds.minX) * tileSize;
    const py = margin + (tile.y - bounds.minY) * tileSize;
    const filteredFeatures = tile.features.filter((feature) => (
      !visibleFeatureTypes || visibleFeatureTypes.has(feature.type)
    ));

    if (showWalls) {
      filteredFeatures
        .filter((feature) => feature.type === "wall")
        .forEach((feature) => {
          drawWalls(ctx, feature.sides, px, py, tileSize);
        });
    }

    if (showFeatureIcons) {
      drawTileFeatureIcons(ctx, filteredFeatures, px, py, tileSize);
      continue;
    }

    if (!showLabels) {
      continue;
    }

    let line = 0;
    for (const feature of filteredFeatures) {
      if (feature.type === "wall") {
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

function drawReentryMarkers(ctx, markers, bounds, tileSize, margin) {
  for (const marker of markers || []) {
    const left = margin + (marker.x - bounds.minX) * tileSize;
    const top = margin + (marker.y - bounds.minY) * tileSize;
    const badgeHeight = tileSize * 0.34;
    const label = marker.label ?? "R";

    ctx.save();
    ctx.font = "bold 9px sans-serif";
    const textWidth = ctx.measureText(label).width;
    const badgeWidth = Math.max(tileSize * 0.5, textWidth + 8);
    ctx.fillStyle = "rgba(43, 122, 214, 0.96)";
    ctx.strokeStyle = "#123f7a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left + tileSize - badgeWidth - 3, top + 3, badgeWidth, badgeHeight, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      label,
      left + tileSize - badgeWidth + 2,
      top + 3 + badgeHeight * 0.72
    );
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  const showFeatureIcons = options.showFeatureIcons ?? false;
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
  drawFeatures(ctx, tileMap, bounds, tileSize, margin, showBoardLabels, showWalls, visibleFeatureTypes, showFeatureIcons);
  drawStarts(ctx, starts, bounds, tileSize, margin, unusableStartIndices, showStartFacing, visibleFeatureTypes);
  drawRebootTokens(ctx, options.rebootTokens || [], bounds, tileSize, margin);
  drawRoutes(ctx, options.analysis, bounds, tileSize, margin);
  drawGoals(ctx, options.goals || (options.goal ? [options.goal] : []), bounds, tileSize, margin);
  drawReentryMarkers(ctx, options.reentryMarkers || [], bounds, tileSize, margin);
  if (edgeOutlineColor) {
    drawBoardEdgeOutline(ctx, footprints, bounds, tileSize, margin, edgeOutlineColor);
  }
}
