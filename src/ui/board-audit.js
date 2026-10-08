// Robo Rally Course Randomizer - board audit panel (Dev View): source image vs encoded icons, feature filters, readout
import { buildResolvedMap } from "../../board.js";
import { formatFeatureLabel } from "../../feature-meta.js";
import { render } from "../../render.js";
import { loadPieceImage } from "../generation/assets.js";
import { isDevViewEnabled } from "../generation/environment.js";
import { titleCaseWords } from "../generation/labels.js";
import { getReverseSideName, sameTile } from "../generation/layout-geometry.js";
import { formatExpansionName } from "../generation/preferences.js";

// Frozen observational fallback from the accepted v49cy 9-candidate Any-difficulty
// Short/Medium/Long calibration batch. These are normalization anchors for the
// Dev uncertainty shadow only; they are NOT production difficulty thresholds.
// v49db observational uncertainty coupling. Existing forecast confidence/exposure
// remains the baseline owner. RE-turn difficulty may only add uncertainty above
// the empirical median; it never discounts existing forecast uncertainty.
// Provisional Dev curve: q75 receives +20%; quadratic growth caps at +60%.
export const AUDIT_RENDER_MARGIN = 30;
export const BOARD_VIEW_MODES = {
  photos: "photos",
  icons: "icons"
};
export const AUDIT_FEATURE_TYPES = [
  { id: "battery", label: "Batteries" },
  { id: "belt", label: "Conveyors" },
  { id: "chopShop", label: "Chop Shops" },
  { id: "checkpoint", label: "Checkpoints" },
  { id: "crusher", label: "Crushers" },
  { id: "flamethrower", label: "Flamethrowers" },
  { id: "gear", label: "Gears" },
  { id: "homingMissile", label: "Homing Missiles" },
  { id: "laser", label: "Lasers" },
  { id: "ledge", label: "Ledges" },
  { id: "oil", label: "Oil" },
  { id: "pit", label: "Pits" },
  { id: "portal", label: "Portals" },
  { id: "push", label: "Push Panels" },
  { id: "randomizer", label: "Randomizers" },
  { id: "radiation", label: "Radiation" },
  { id: "radioactiveWaste", label: "Radioactive Waste" },
  { id: "ramp", label: "Ramps" },
  { id: "redWall", label: "Red Walls" },
  { id: "repulsor", label: "Repulsor Fields" },
  { id: "greenWall", label: "Green Walls" },
  { id: "start", label: "Starts" },
  { id: "teleporter", label: "Teleporters" },
  { id: "trapdoor", label: "Trapdoors" },
  { id: "wall", label: "Walls" },
  { id: "water", label: "Water" }
].sort((left, right) => left.label.localeCompare(right.label));

export let boardAuditInitialized = false;
export let boardAuditState = {
  pieceId: null,
  hoverTile: null,
  selectedFeatures: new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id))
};

export function isAuditFeatureVisible(featureType) {
  return boardAuditState.selectedFeatures.has(featureType);
}

export function formatBoardLabel(pieceId, pieceMap) {
  const piece = pieceMap[pieceId];
  const name = piece?.name ?? titleCaseWords(pieceId);
  const expansion = formatExpansionName(piece?.expansionId ?? "unknown");
  const reverseSide = getReverseSideName(pieceId, pieceMap);

  return reverseSide
    ? `${name} (${expansion}; reverse side: ${reverseSide})`
    : `${name} (${expansion})`;
}


export function summarizeFeature(feature) {
  return formatFeatureLabel(feature);
}

export function appendAuditReadoutLine(readout, text, options = {}) {
  const line = document.createElement("div");

  if (options.strong) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    line.append(strong);
  } else {
    line.textContent = text;
  }

  readout.append(line);
}

export function buildAuditFeatureFilterLabel(feature) {
  const fragment = document.createDocumentFragment();
  const text = document.createElement("span");
  text.textContent = feature.label;
  fragment.append(text);
  return fragment;
}

export function countBoardLasers(tileMap) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === "laser").length;
  }
  return total;
}

export function getAuditBoardOptions(pieceMap) {
  return Object.values(pieceMap)
    .filter((piece) => piece.image && piece.width > 0 && piece.height > 0)
    .sort((left, right) => formatBoardLabel(left.id, pieceMap).localeCompare(formatBoardLabel(right.id, pieceMap)));
}

export function getAuditPiece(assets) {
  return boardAuditState.pieceId ? assets.pieceMap[boardAuditState.pieceId] ?? null : null;
}

export function getAuditTileMap(piece) {
  return buildResolvedMap([{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }], { [piece.id]: piece }).tileMap;
}

export function getTileFromAuditCanvas(evt, canvas, piece) {
  if (!piece || !canvas.width || !canvas.height) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const localX = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const localY = (evt.clientY - rect.top) * (canvas.height / rect.height);
  const tileX = Math.floor(localX / (canvas.width / piece.width));
  const tileY = Math.floor(localY / (canvas.height / piece.height));

  if (tileX < 0 || tileX >= piece.width || tileY < 0 || tileY >= piece.height) {
    return null;
  }

  return { x: tileX, y: tileY };
}

export function getTileFromAuditRenderCanvas(evt, canvas, piece) {
  if (!piece || !canvas.width || !canvas.height) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const localX = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const localY = (evt.clientY - rect.top) * (canvas.height / rect.height);
  const tileSize = (canvas.width - AUDIT_RENDER_MARGIN * 2) / piece.width;
  const tileX = Math.floor((localX - AUDIT_RENDER_MARGIN) / tileSize);
  const tileY = Math.floor((localY - AUDIT_RENDER_MARGIN) / tileSize);

  if (tileX < 0 || tileX >= piece.width || tileY < 0 || tileY >= piece.height) {
    return null;
  }

  return { x: tileX, y: tileY };
}

export function drawAuditImageCanvas(canvas, piece, img, hoverTile = null) {
  const ctx = canvas.getContext("2d");
  if (!piece || !img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const tileWidth = canvas.width / piece.width;
  const tileHeight = canvas.height / piece.height;

  ctx.save();
  ctx.strokeStyle = "rgba(26, 43, 58, 0.35)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= piece.width; x += 1) {
    const px = x * tileWidth;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= piece.height; y += 1) {
    const py = y * tileHeight;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }

  if (hoverTile) {
    ctx.fillStyle = "rgba(228, 103, 36, 0.18)";
    ctx.strokeStyle = "rgba(228, 103, 36, 0.96)";
    ctx.lineWidth = 3;
    ctx.fillRect(hoverTile.x * tileWidth, hoverTile.y * tileHeight, tileWidth, tileHeight);
    ctx.strokeRect(hoverTile.x * tileWidth + 1.5, hoverTile.y * tileHeight + 1.5, tileWidth - 3, tileHeight - 3);
  }

  ctx.restore();
}

export function drawAuditRenderHover(canvas, piece, hoverTile = null) {
  if (!piece || !hoverTile) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const tileSize = (canvas.width - AUDIT_RENDER_MARGIN * 2) / piece.width;
  const left = AUDIT_RENDER_MARGIN + hoverTile.x * tileSize;
  const top = AUDIT_RENDER_MARGIN + hoverTile.y * tileSize;

  ctx.save();
  ctx.fillStyle = "rgba(228, 103, 36, 0.16)";
  ctx.strokeStyle = "rgba(228, 103, 36, 0.96)";
  ctx.lineWidth = 3;
  ctx.fillRect(left, top, tileSize, tileSize);
  ctx.strokeRect(left + 1.5, top + 1.5, tileSize - 3, tileSize - 3);
  ctx.restore();
}

export function updateAuditReadout(assets) {
  const readout = document.getElementById("audit-readout");
  const piece = getAuditPiece(assets);
  readout.replaceChildren();

  if (!piece) {
    appendAuditReadoutLine(readout, "Tile Readout", { strong: true });
    appendAuditReadoutLine(readout, "Select a board to inspect.");
    return;
  }

  const lines = [
    piece.name,
    `${piece.width}x${piece.height} tiles`,
    `${formatExpansionName(piece.expansionId ?? "unknown")}`
  ];

  if (boardAuditState.hoverTile) {
    const tileMap = getAuditTileMap(piece);
    const tile = tileMap.get(`${boardAuditState.hoverTile.x},${boardAuditState.hoverTile.y}`);
    const features = (tile?.features || [])
      .filter((feature) => isAuditFeatureVisible(feature.type))
      .map(summarizeFeature)
      .sort((left, right) => left.localeCompare(right));
    const starts = (piece.starts || [])
      .filter(() => isAuditFeatureVisible("start"))
      .filter((start) => start.x === boardAuditState.hoverTile.x && start.y === boardAuditState.hoverTile.y)
      .map((start) => `start ${start.facing ?? "E"}`);

    lines.push(`Tile (${boardAuditState.hoverTile.x}, ${boardAuditState.hoverTile.y})`);
    if (features.length || starts.length) {
      lines.push([...features, ...starts].join(" | "));
    } else {
      lines.push("No encoded features on this tile.");
    }
  } else {
    lines.push("Hover a tile in either pane to inspect its encoding.");
  }

  lines.forEach((line, index) => {
    appendAuditReadoutLine(readout, line, { strong: index === 0 });
  });
}

export function renderBoardAudit(assets) {
  const piece = getAuditPiece(assets);
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");

  if (!piece) {
    const imageCtx = imageCanvas.getContext("2d");
    const jsonCtx = jsonCanvas.getContext("2d");
    imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    jsonCtx.clearRect(0, 0, jsonCanvas.width, jsonCanvas.height);
    updateAuditReadout(assets);
    return;
  }

  if (piece.image && !assets.imageMap[piece.id]) {
    loadPieceImage(assets, piece.id).then(() => {
      if (getAuditPiece(assets)?.id === piece.id) {
        renderBoardAudit(assets);
      }
    });
  }

  drawAuditImageCanvas(imageCanvas, piece, assets.imageMap[piece.id], boardAuditState.hoverTile);
  render(jsonCanvas, assets.pieceMap, assets.imageMap, {
    placements: [{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }],
    showBoardLabels: false,
    showStartFacing: true,
    showWalls: true,
    showPieceImages: false,
    showFootprints: false,
    showFeatureIcons: true,
    visibleFeatureTypes: boardAuditState.selectedFeatures
  });
  drawAuditRenderHover(jsonCanvas, piece, boardAuditState.hoverTile);


  updateAuditReadout(assets);
}

export function updateBoardAuditVisibility() {
  const visible = isDevViewEnabled() && isBoardAuditEnabled();
  document.getElementById("board-audit-panel")?.classList.toggle("hidden", !visible);
}

export function initializeBoardAudit(assets) {
  if (boardAuditInitialized) {
    renderBoardAudit(assets);
    return;
  }

  const select = document.getElementById("audit-board-select");
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");
  const featureFilters = document.getElementById("audit-feature-filters");
  const allButton = document.getElementById("audit-filter-all");
  const noneButton = document.getElementById("audit-filter-none");
  const options = getAuditBoardOptions(assets.pieceMap);

  select.innerHTML = "";
  options.forEach((piece) => {
    const option = document.createElement("option");
    option.value = piece.id;
    option.textContent = formatBoardLabel(piece.id, assets.pieceMap);
    select.appendChild(option);
  });

  boardAuditState.pieceId = options[0]?.id ?? null;
  select.value = boardAuditState.pieceId ?? "";

  featureFilters.innerHTML = "";
  AUDIT_FEATURE_TYPES.forEach((feature) => {
    const label = document.createElement("label");
    label.className = "audit-filter-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = boardAuditState.selectedFeatures.has(feature.id);
    input.dataset.featureType = feature.id;
    input.addEventListener("change", () => {
      if (input.checked) {
        boardAuditState.selectedFeatures.add(feature.id);
      } else {
        boardAuditState.selectedFeatures.delete(feature.id);
      }
      renderBoardAudit(assets);
    });

    label.append(input, buildAuditFeatureFilterLabel(feature));
    featureFilters.appendChild(label);
  });

  allButton.addEventListener("click", () => {
    boardAuditState.selectedFeatures = new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id));
    featureFilters.querySelectorAll("input[type=\"checkbox\"]").forEach((input) => {
      input.checked = true;
    });
    renderBoardAudit(assets);
  });

  noneButton.addEventListener("click", () => {
    boardAuditState.selectedFeatures = new Set();
    featureFilters.querySelectorAll("input[type=\"checkbox\"]").forEach((input) => {
      input.checked = false;
    });
    renderBoardAudit(assets);
  });

  select.addEventListener("change", () => {
    boardAuditState.pieceId = select.value || null;
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });

  imageCanvas.addEventListener("mousemove", (evt) => {
    const nextTile = getTileFromAuditCanvas(evt, imageCanvas, getAuditPiece(assets));
    if (!sameTile(boardAuditState.hoverTile, nextTile)) {
      boardAuditState.hoverTile = nextTile;
      renderBoardAudit(assets);
    }
  });

  jsonCanvas.addEventListener("mousemove", (evt) => {
    const nextTile = getTileFromAuditRenderCanvas(evt, jsonCanvas, getAuditPiece(assets));
    if (!sameTile(boardAuditState.hoverTile, nextTile)) {
      boardAuditState.hoverTile = nextTile;
      renderBoardAudit(assets);
    }
  });

  imageCanvas.addEventListener("mouseleave", () => {
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });

  jsonCanvas.addEventListener("mouseleave", () => {
    boardAuditState.hoverTile = null;
    renderBoardAudit(assets);
  });


  boardAuditInitialized = true;
  renderBoardAudit(assets);
}

export function isBoardAuditEnabled() {
  return document.getElementById("board-audit-toggle")?.checked ?? false;
}

export function getBoardViewMode() {
  return document.getElementById("board-view-mode")?.value ?? BOARD_VIEW_MODES.photos;
}
