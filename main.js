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
const DOCK_BRIDGE_GAP = 3;
const DOCK_BRIDGE_PROBABILITY = 0.12;
const OVERLAY_UPDATE_INTERVAL = 4;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
const BOARD_AUDIT_NOTES_KEY = "roborally-course-generator:board-audit-notes";
const AUDIT_RENDER_TILE_SIZE = 40;
const AUDIT_RENDER_MARGIN = 30;
const AUDIT_FEATURE_TYPES = [
  { id: "wall", label: "Walls" },
  { id: "belt", label: "Belts" },
  { id: "laser", label: "Lasers" },
  { id: "pit", label: "Pits" },
  { id: "gear", label: "Gears" },
  { id: "push", label: "Push Panels" },
  { id: "flamethrower", label: "Flamethrowers" },
  { id: "crusher", label: "Crushers" },
  { id: "portal", label: "Portals" },
  { id: "teleporter", label: "Teleporters" },
  { id: "randomizer", label: "Randomizers" },
  { id: "water", label: "Water" },
  { id: "oil", label: "Oil" },
  { id: "ledge", label: "Ledges" },
  { id: "ramp", label: "Ramps" },
  { id: "checkpoint", label: "Checkpoints" },
  { id: "battery", label: "Batteries" },
  { id: "start", label: "Starts" }
];
const PIECE_DATA_FILES = [
  "black-gold",
  "blueprint",
  "cactus",
  "coliseum",
  "docking-bay-a",
  "docking-bay-b",
  "doubles",
  "energize",
  "in-and-out",
  "misdirection",
  "sidewinder",
  "steps",
  "tempest",
  "the-h",
  "the-keep",
  "the-o-ring",
  "transition",
  "whirlpool"
];

let currentScenario = null;
let cachedAssets = null;
let boardAuditInitialized = false;
let boardAuditState = {
  pieceId: null,
  hoverTile: null,
  selectedFeatures: new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id))
};

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

  const pieces = await Promise.all(
    PIECE_DATA_FILES.map(async (pieceId) => loadJSON(`./data/${pieceId}.json`))
  );
  const pieceMap = Object.fromEntries(
    pieces.map((piece) => [piece.id, piece])
  );

  for (const piece of Object.values(pieceMap)) {
    piece.overlayCapable = piece.expansionId === "master-builder" && piece.width === 6 && piece.height === 6;
  }

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

function sampleManyWeighted(items, count) {
  const pool = [...items];
  const out = [];

  while (pool.length && out.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(0, item.weight ?? 1), 0);
    if (totalWeight <= 0) {
      break;
    }

    let roll = Math.random() * totalWeight;
    let index = 0;

    for (; index < pool.length; index += 1) {
      roll -= Math.max(0, pool[index].weight ?? 1);
      if (roll <= 0) {
        break;
      }
    }

    out.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }

  return out;
}

function countConnectedComponents(graph) {
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

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function titleCaseWords(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLengthLabel(lengthPreference) {
  return lengthPreference === "moderate" ? "medium" : String(lengthPreference ?? "medium");
}

function formatDifficultyLabel(difficultyPreference) {
  const labels = {
    easy: "beginner",
    moderate: "intermediate",
    hard: "advanced"
  };

  return labels[difficultyPreference] ?? String(difficultyPreference ?? "intermediate");
}

function getSelectedExpansionIds(preferences = {}) {
  const selected = preferences.selectedExpansions ?? { roborally: true };
  return new Set(Object.entries(selected)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([expansionId]) => expansionId));
}

function formatExpansionName(expansionId) {
  const labels = {
    roborally: "RoboRally Base Game (2023)",
    "thrills-and-spills": "Thrills & Spills",
    "master-builder": "Master Builder",
    "wet-and-wild": "Wet & Wild"
  };

  return labels[expansionId] ?? titleCaseWords(expansionId);
}

function getReverseSideName(pieceId, pieceMap) {
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

function sameTile(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

function isAuditFeatureVisible(featureType) {
  return boardAuditState.selectedFeatures.has(featureType);
}

function formatBoardLabel(pieceId, pieceMap) {
  const piece = pieceMap[pieceId];
  const name = piece?.name ?? titleCaseWords(pieceId);
  const expansion = formatExpansionName(piece?.expansionId ?? "unknown");
  const reverseSide = getReverseSideName(pieceId, pieceMap);

  return reverseSide
    ? `${name} (${expansion}; reverse side: ${reverseSide})`
    : `${name} (${expansion})`;
}

function loadBoardAuditNotes() {
  try {
    return JSON.parse(localStorage.getItem(BOARD_AUDIT_NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveBoardAuditNote(pieceId, note) {
  const notes = loadBoardAuditNotes();
  if (note) {
    notes[pieceId] = note;
  } else {
    delete notes[pieceId];
  }

  try {
    localStorage.setItem(BOARD_AUDIT_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // ignore storage failures
  }
}

function summarizeFeature(feature) {
  switch (feature.type) {
    case "pit":
    case "oil":
    case "battery":
    case "randomizer":
    case "water":
      return feature.type;
    case "belt":
      return `belt ${feature.dir ?? "?"}${feature.speed ? ` speed ${feature.speed}` : ""}`;
    case "gear":
      return `gear ${feature.rotation ?? "?"}`;
    case "laser":
      return `laser ${feature.dir ?? "?"} dmg ${feature.damage ?? 1}`;
    case "wall":
      return `wall ${((feature.sides || []).join(", ")) || "?"}`;
    case "push":
    case "flamethrower":
      return `${feature.type} ${feature.dir ?? "?"} [${(feature.timing || []).join(", ")}]`;
    case "crusher":
      return `crusher [${(feature.timing || []).join(", ")}]`;
    case "portal":
      return `portal ${feature.id ?? "?"}`;
    case "teleporter":
      return `teleporter power ${feature.power ?? 2}`;
    case "ledge":
      return `ledge ${((feature.sides || []).join(", ")) || "?"}`;
    case "ramp":
      return `ramp ${feature.dir ?? "?"}`;
    case "checkpoint":
      return `checkpoint ${feature.id ?? "?"}`;
    default:
      return JSON.stringify(feature);
  }
}

function getAuditBoardOptions(pieceMap) {
  return Object.values(pieceMap)
    .filter((piece) => piece.image && piece.width > 0 && piece.height > 0)
    .sort((left, right) => formatBoardLabel(left.id, pieceMap).localeCompare(formatBoardLabel(right.id, pieceMap)));
}

function getAuditPiece(assets) {
  return boardAuditState.pieceId ? assets.pieceMap[boardAuditState.pieceId] ?? null : null;
}

function getAuditTileMap(piece) {
  return buildResolvedMap([{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }], { [piece.id]: piece }).tileMap;
}

function getTileFromAuditCanvas(evt, canvas, piece) {
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

function getTileFromAuditRenderCanvas(evt, canvas, piece) {
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

function drawAuditImageCanvas(canvas, piece, img, hoverTile = null) {
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

function drawAuditRenderHover(canvas, piece, hoverTile = null) {
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

function updateAuditReadout(assets) {
  const readout = document.getElementById("audit-readout");
  const piece = getAuditPiece(assets);
  if (!piece) {
    readout.innerHTML = "<strong>Tile Readout</strong>Select a board to inspect.";
    return;
  }

  const lines = [
    `<strong>${piece.name}</strong>`,
    `${piece.width}x${piece.height} tiles`,
    `${formatExpansionName(piece.expansionId ?? "unknown")}`
  ];

  if (boardAuditState.hoverTile) {
    const tileMap = getAuditTileMap(piece);
    const tile = tileMap.get(`${boardAuditState.hoverTile.x},${boardAuditState.hoverTile.y}`);
    const features = (tile?.features || [])
      .filter((feature) => isAuditFeatureVisible(feature.type))
      .map(summarizeFeature);
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

  readout.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
}

function renderBoardAudit(assets) {
  const piece = getAuditPiece(assets);
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");
  const notesInput = document.getElementById("audit-feedback");

  if (!piece) {
    const imageCtx = imageCanvas.getContext("2d");
    const jsonCtx = jsonCanvas.getContext("2d");
    imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    jsonCtx.clearRect(0, 0, jsonCanvas.width, jsonCanvas.height);
    notesInput.value = "";
    updateAuditReadout(assets);
    return;
  }

  drawAuditImageCanvas(imageCanvas, piece, assets.imageMap[piece.id], boardAuditState.hoverTile);
  render(jsonCanvas, assets.pieceMap, assets.imageMap, {
    placements: [{ pieceId: piece.id, x: 0, y: 0, rotation: 0 }],
    showBoardLabels: true,
    showStartFacing: true,
    showWalls: true,
    showPieceImages: false,
    showFootprints: false,
    visibleFeatureTypes: boardAuditState.selectedFeatures
  });
  drawAuditRenderHover(jsonCanvas, piece, boardAuditState.hoverTile);

  const notes = loadBoardAuditNotes();
  if (document.activeElement !== notesInput) {
    notesInput.value = notes[piece.id] ?? "";
  }

  updateAuditReadout(assets);
}

function updateBoardAuditVisibility() {
  document.getElementById("board-audit-panel")?.classList.toggle("hidden", !isDevViewEnabled());
}

function initializeBoardAudit(assets) {
  if (boardAuditInitialized) {
    renderBoardAudit(assets);
    return;
  }

  const select = document.getElementById("audit-board-select");
  const imageCanvas = document.getElementById("audit-image-canvas");
  const jsonCanvas = document.getElementById("audit-json-canvas");
  const notesInput = document.getElementById("audit-feedback");
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

    label.append(input, document.createTextNode(feature.label));
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

  notesInput.addEventListener("input", () => {
    const pieceId = boardAuditState.pieceId;
    if (!pieceId) {
      return;
    }

    saveBoardAuditNote(pieceId, notesInput.value.trim());
  });

  boardAuditInitialized = true;
  renderBoardAudit(assets);
}

function updateSetupSummary(scenario) {
  const summary = document.getElementById("setup-summary");
  const boardsEl = document.getElementById("setup-boards");
  const overlaysRowEl = document.getElementById("setup-overlays-row");
  const overlaysEl = document.getElementById("setup-overlays");
  const flagsEl = document.getElementById("setup-flags");

  if (!scenario) {
    summary.classList.add("hidden");
    boardsEl.textContent = "";
    overlaysRowEl.classList.add("hidden");
    overlaysEl.textContent = "";
    flagsEl.textContent = "";
    return;
  }

  const boardLabels = scenario.mainBoardIds.map((pieceId) => (
    formatBoardLabel(pieceId, scenario.pieceMap)
  ));
  const overlayLabels = (scenario.overlayPlacements || []).map((placement) => (
    formatBoardLabel(placement.pieceId, scenario.pieceMap)
  ));

  boardsEl.textContent = boardLabels.join(", ");
  if (overlayLabels.length) {
    overlaysEl.textContent = overlayLabels.join(", ");
    overlaysRowEl.classList.remove("hidden");
  } else {
    overlaysRowEl.classList.add("hidden");
    overlaysEl.textContent = "";
  }
  flagsEl.textContent = `${scenario.checkpoints.length} checkpoint${scenario.checkpoints.length === 1 ? "" : "s"}`;
  summary.classList.remove("hidden");
}

function updateVariantSummary() {
  const summaryEl = document.getElementById("variant-summary");
  const enabled = [];

  if (document.getElementById("variant-dynamic-archiving").checked) {
    enabled.push("Dynamic Archiving");
  }

  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = enabled.length ? enabled.join(", ") : "None";
}

function updateExpansionSummary() {
  const summaryEl = document.getElementById("expansion-summary");
  const enabled = [];

  if (document.getElementById("expansion-roborally").checked) {
    enabled.push(formatExpansionName("roborally"));
  }
  if (document.getElementById("expansion-master-builder").checked) {
    enabled.push(formatExpansionName("master-builder"));
  }
  if (document.getElementById("expansion-thrills-and-spills").checked) {
    enabled.push(formatExpansionName("thrills-and-spills"));
  }
  if (document.getElementById("expansion-wet-and-wild").checked) {
    enabled.push(formatExpansionName("wet-and-wild"));
  }

  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = enabled.length ? enabled.join(", ") : "None";
}

function closeVariantPicker() {
  document.querySelectorAll(".variant-picker").forEach((picker) => {
    picker.removeAttribute("open");
  });
}

function hasSuppressedCheckpointFeatures(scenario) {
  if (!scenario?.placements?.length || !scenario?.checkpoints?.length) {
    return false;
  }

  const { tileMap } = buildResolvedMap(scenario.placements, scenario.pieceMap);

  return scenario.checkpoints.some((checkpoint) => {
    const tile = tileMap.get(`${checkpoint.x},${checkpoint.y}`);
    return (tile?.features || []).some((feature) => (
      feature.type !== "wall" &&
      feature.type !== "laser" &&
      feature.type !== "checkpoint"
    ));
  });
}

function updateRulesNote(scenario) {
  const noteEl = document.getElementById("rules-note");
  const notes = [];

  if (!scenario) {
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    return;
  }

  if (hasSuppressedCheckpointFeatures(scenario)) {
    notes.push("Checkpoint spaces suppress non-wall, non-laser board elements (Game Guide p. 15).");
  }

  if (scenario.recoveryRule === "dynamic_archiving") {
    notes.push("This course uses Dynamic Archiving (Game Guide p. 32).");
  }

  if (!notes.length) {
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    return;
  }

  noteEl.textContent = notes.join(" ");
  noteEl.classList.remove("hidden");
}

function updateLegend(scenario) {
  const rebootTokenEl = document.getElementById("legend-reboot-token");
  rebootTokenEl?.classList.toggle("hidden", scenario?.recoveryRule !== "reboot_tokens");
}

function chooseRecoveryRule(preferences) {
  const dynamicArchivingAllowed = preferences.allowedVariantRules?.dynamicArchiving ?? true;
  if (dynamicArchivingAllowed && Math.random() < 0.5) {
    return "dynamic_archiving";
  }

  return "reboot_tokens";
}

function getPreferencesFromControls() {
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    alignedLayout: document.getElementById("aligned-layout").checked,
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked
    },
    allowedVariantRules: {
      dynamicArchiving: document.getElementById("variant-dynamic-archiving").checked
    }
  };
}

function applyPreferencesToControls(preferences) {
  if (!preferences) {
    return;
  }

  document.getElementById("player-count").value = String(preferences.playerCount ?? 4);
  document.getElementById("difficulty").value = preferences.difficulty ?? "moderate";
  document.getElementById("length").value = preferences.length ?? "moderate";
  document.getElementById("aligned-layout").checked = preferences.alignedLayout ?? false;
  document.getElementById("expansion-roborally").checked = preferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-master-builder").checked = preferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = preferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = preferences.selectedExpansions?.["wet-and-wild"] ?? false;
  document.getElementById("variant-dynamic-archiving").checked = preferences.allowedVariantRules?.dynamicArchiving ?? true;
  updateExpansionSummary();
  updateVariantSummary();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}

function deriveBoardBias(piece) {
  if (piece.kind !== "base" && piece.kind !== "small") {
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
      } else if (feature.type === "flamethrower") {
        hazardWeight += 2.6;
      } else if (feature.type === "push") {
        hazardWeight += 1;
        complexityWeight += 1.2;
      } else if (feature.type === "crusher") {
        hazardWeight += 2.2;
        complexityWeight += 0.8;
      } else if (feature.type === "belt") {
        complexityWeight += feature.speed === 2 ? 2 : 1.2;
      } else if (feature.type === "gear") {
        complexityWeight += 1.4;
      } else if (feature.type === "portal") {
        hazardWeight += 0.7;
        complexityWeight += 1.3;
      } else if (feature.type === "oil") {
        hazardWeight += 1.2;
        complexityWeight += 1.8;
      } else if (feature.type === "ledge") {
        hazardWeight += 0.8;
        congestionWeight += Math.max(1, (feature.sides || []).length) * 0.85;
      } else if (feature.type === "ramp") {
        complexityWeight += 0.7;
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
    .filter((piece) => piece.kind === "base" || piece.kind === "small")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function getAvailableDockIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "dock")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function getAvailableOverlayIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.overlayCapable)
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

function boardIdsCanSupportDock(boardIds, pieceMap, dockPieceId) {
  const dockPiece = pieceMap[dockPieceId];
  if (!dockPiece) {
    return false;
  }

  const totalSpanCapacity = boardIds.reduce((sum, boardId) => {
    const piece = pieceMap[boardId];
    return sum + Math.max(piece?.width ?? 0, piece?.height ?? 0);
  }, 0);

  return totalSpanCapacity >= dockPiece.height;
}

function getDockTileKeys(dockPlacement, pieceMap) {
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

function getOverlayCount(preferences, largeBoardCount, maxAvailable) {
  if (preferences.difficulty === "easy") {
    return 0;
  }

  const maxByDifficulty = preferences.difficulty === "moderate"
    ? Math.max(0, largeBoardCount - 1)
    : largeBoardCount;
  const maxCount = Math.min(maxAvailable, maxByDifficulty);
  if (maxCount <= 0) {
    return 0;
  }

  const choices = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = count === 0
      ? (preferences.difficulty === "moderate" ? 3 : 2)
      : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      choices.push(count);
    }
  }

  return sample(choices);
}

function getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacement, pieceMap) {
  const supportTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const dockTiles = getDockTileKeys(dockPlacement, pieceMap);
  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return [];
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const placements = [];

  for (const rotation of ROTATIONS) {
    const dims = rotatedDimensions(overlayPiece, rotation);
    for (let y = minY; y <= maxY - dims.height + 1; y += 1) {
      for (let x = minX; x <= maxX - dims.width + 1; x += 1) {
        let valid = true;
        for (let dy = 0; dy < dims.height && valid; dy += 1) {
          for (let dx = 0; dx < dims.width; dx += 1) {
            const key = `${x + dx},${y + dy}`;
            if (!supportTiles.has(key) || dockTiles.has(key)) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          placements.push({
            pieceId: overlayPiece.id,
            x,
            y,
            rotation,
            overlay: true
          });
        }
      }
    }
  }

  return placements;
}

function getAlignedEdgeOffsets(anchorStart, anchorLength, candidateLength) {
  if (anchorLength === candidateLength) {
    return [anchorStart];
  }

  if (candidateLength < anchorLength) {
    const slack = anchorLength - candidateLength;
    return [...new Set([
      anchorStart,
      anchorStart + Math.floor(slack / 2),
      anchorStart + slack
    ])];
  }

  const slack = candidateLength - anchorLength;
  return [...new Set([
    anchorStart - slack,
    anchorStart - Math.floor(slack / 2),
    anchorStart
  ])];
}

function createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const placements = [];

  if (side === "left" || side === "right") {
    const yOffsets = getAlignedEdgeOffsets(anchorPlacement.y, anchorDims.height, dims.height);
    const x = side === "left"
      ? anchorPlacement.x - dims.width
      : anchorPlacement.x + anchorDims.width;

    for (const y of yOffsets) {
      placements.push({ pieceId, x, y, rotation });
    }

    return placements;
  }

  const xOffsets = getAlignedEdgeOffsets(anchorPlacement.x, anchorDims.width, dims.width);
  const y = side === "top"
    ? anchorPlacement.y - dims.height
    : anchorPlacement.y + anchorDims.height;

  for (const x of xOffsets) {
    placements.push({ pieceId, x, y, rotation });
  }

  return placements;
}

function getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacement, pieceMap) {
  if (overlayPiece.width !== 6 || overlayPiece.height !== 6) {
    return getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacement, pieceMap);
  }

  const dockTiles = getDockTileKeys(dockPlacement, pieceMap);
  const placements = [];

  for (const basePlacement of structuralPlacements) {
    const basePiece = pieceMap[basePlacement.pieceId];
    const dims = rotatedDimensions(basePiece, basePlacement.rotation ?? 0);
    if (dims.width !== 12 || dims.height !== 12) {
      continue;
    }

    const anchors = [
      { dx: 0, dy: 0 },
      { dx: 6, dy: 0 },
      { dx: 0, dy: 6 },
      { dx: 6, dy: 6 },
      { dx: 3, dy: 3 }
    ];

    for (const rotation of ROTATIONS) {
      for (const anchor of anchors) {
        const placement = {
          pieceId: overlayPiece.id,
          x: basePlacement.x + anchor.dx,
          y: basePlacement.y + anchor.dy,
          rotation,
          overlay: true
        };

        let valid = true;
        for (let dy = 0; dy < 6 && valid; dy += 1) {
          for (let dx = 0; dx < 6; dx += 1) {
            if (dockTiles.has(`${placement.x + dx},${placement.y + dy}`)) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          placements.push(placement);
        }
      }
    }
  }

  return placements;
}

function chooseOverlayPlacements(structuralPlacements, dockPlacement, pieceMap, preferences, expansionIds) {
  const usedStructuralBoards = new Set(
    structuralPlacements.map((placement) => getPhysicalBoardId(pieceMap[placement.pieceId]))
  );
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionIds)
    .filter((overlayId) => !usedStructuralBoards.has(getPhysicalBoardId(pieceMap[overlayId])));
  if (!overlayIds.length) {
    return [];
  }

  const largeBoardCount = structuralPlacements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
  }).length;
  const grouped = new Map();
  for (const overlayId of overlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!grouped.has(physicalBoardId)) {
      grouped.set(physicalBoardId, []);
    }
    grouped.get(physicalBoardId).push(overlayId);
  }

  const targetCount = getOverlayCount(preferences, largeBoardCount, grouped.size);
  if (targetCount <= 0) {
    return [];
  }

  const chosenGroups = shuffle([...grouped.values()]).slice(0, targetCount);
  const placements = [];
  const occupiedOverlayTiles = new Set();

  for (const groupOverlayIds of chosenGroups) {
    const chosenOverlayId = sample(groupOverlayIds);
    const overlayPiece = pieceMap[chosenOverlayId];
    const legalPlacements = (
      preferences.alignedLayout
        ? getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacement, pieceMap)
        : getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacement, pieceMap)
    )
      .filter((placement) => {
        const dims = rotatedDimensions(overlayPiece, placement.rotation);
        for (let dy = 0; dy < dims.height; dy += 1) {
          for (let dx = 0; dx < dims.width; dx += 1) {
            if (occupiedOverlayTiles.has(`${placement.x + dx},${placement.y + dy}`)) {
              return false;
            }
          }
        }
        return true;
      });
    if (!legalPlacements.length) {
      continue;
    }
    const chosenPlacement = sample(legalPlacements);
    const dims = rotatedDimensions(overlayPiece, chosenPlacement.rotation);
    for (let dy = 0; dy < dims.height; dy += 1) {
      for (let dx = 0; dx < dims.width; dx += 1) {
        occupiedOverlayTiles.add(`${chosenPlacement.x + dx},${chosenPlacement.y + dy}`);
      }
    }
    placements.push(chosenPlacement);
  }

  return placements;
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

function smallBoardCompositionPenalty(boardIds, pieceMap) {
  const smallCount = boardIds.filter((boardId) => pieceMap[boardId]?.kind === "small").length;
  if (smallCount === 1) {
    return 1.8;
  }
  if (smallCount >= 2) {
    return 0.4;
  }
  return 0;
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

  const ranked = scoredGroups.sort((a, b) => a.score - b.score);
  let bestSelection = ranked.slice(0, count).map((entry) => entry.boardId);
  let bestScore = ranked
    .slice(0, count)
    .reduce((sum, entry) => sum + entry.score, 0) + smallBoardCompositionPenalty(bestSelection, pieceMap);

  const attemptCount = Math.min(24, Math.max(6, ranked.length * 2));
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const selection = sampleDistinctBoardFaces(boardIds, count, pieceMap);
    if (selection.length !== count) {
      continue;
    }

    const selectionScore = selection.reduce((sum, boardId) => (
      sum + boardPreferencePenalty(pieceMap[boardId], preferences, guidanceLevel)
    ), 0) + smallBoardCompositionPenalty(selection, pieceMap);

    if (selectionScore < bestScore) {
      bestSelection = selection;
      bestScore = selectionScore;
    }
  }

  return bestSelection;
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

function buildBoardRects(boardPlacements, pieceMap) {
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

function pointOnRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function getWallsAtTile(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") continue;
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

function canStepForReboot(tileMap, boardRect, from, dir) {
  const delta = {
    N: { dx: 0, dy: -1 },
    E: { dx: 1, dy: 0 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 }
  }[dir];
  const opposite = {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[dir];
  const to = {
    x: from.x + delta.dx,
    y: from.y + delta.dy
  };

  if (!pointOnRect(to, boardRect)) {
    return false;
  }

  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  if (!toTile) {
    return false;
  }

  const fromWalls = getWallsAtTile(fromTile);
  const toWalls = getWallsAtTile(toTile);
  if (fromWalls.has(dir) || toWalls.has(opposite)) {
    return false;
  }

  return !(toTile.features || []).some((feature) => feature.type === "pit");
}

function scoreRebootDirection(tileMap, boardRect, point, dir, minRunway) {
  let runway = 0;
  let current = point;

  while (runway < 3 && canStepForReboot(tileMap, boardRect, current, dir)) {
    const delta = {
      N: { dx: 0, dy: -1 },
      E: { dx: 1, dy: 0 },
      S: { dx: 0, dy: 1 },
      W: { dx: -1, dy: 0 }
    }[dir];
    current = {
      x: current.x + delta.dx,
      y: current.y + delta.dy
    };
    runway += 1;
  }

  if (runway < minRunway) {
    return null;
  }

  return runway * 4;
}

function placeRebootTokens(boardRects, pieceMap, tileMap, checkpoints, playerCount) {
  const minRunway = playerCount >= 5 ? 2 : 1;
  const dirs = ["N", "E", "S", "W"];
  const tokens = [];

  for (const boardRect of boardRects) {
    const center = {
      x: boardRect.x + (boardRect.width - 1) / 2,
      y: boardRect.y + (boardRect.height - 1) / 2
    };
    let best = null;

    for (let y = boardRect.y; y < boardRect.y + boardRect.height; y += 1) {
      for (let x = boardRect.x; x < boardRect.x + boardRect.width; x += 1) {
        const point = { x, y };
        const tile = tileMap.get(`${x},${y}`) ?? { features: [] };
        const features = tile.features || [];

        if (checkpoints.some((checkpoint) => checkpoint.x === x && checkpoint.y === y)) {
          continue;
        }

        if (features.some((feature) => feature.type === "pit")) {
          continue;
        }

        const nonPassivePenalty = features.reduce((sum, feature) => {
          if (feature.type === "wall" || feature.type === "laser" || feature.type === "checkpoint") {
            return sum;
          }
          return sum + 5;
        }, 0);
        const nearestCheckpoint = checkpoints.length
          ? Math.min(...checkpoints.map((checkpoint) => manhattanDistance(point, checkpoint)))
          : 99;
        const centerDistance = Math.abs(point.x - center.x) + Math.abs(point.y - center.y);

        for (const dir of dirs) {
          const directionScore = scoreRebootDirection(tileMap, boardRect, point, dir, minRunway);
          if (directionScore === null) {
            continue;
          }

          const score = (
            nearestCheckpoint * 2.5 +
            directionScore * 3 -
            centerDistance * 3 -
            nonPassivePenalty
          );

          if (!best || score > best.score) {
            best = {
              boardIndex: boardRect.index,
              pieceId: boardRect.pieceId,
              x,
              y,
              dir,
              score
            };
          }
        }
      }
    }

    if (best) {
      tokens.push(best);
    }
  }

  return tokens;
}

function getFlagCandidates(placements, pieceMap) {
  const candidates = [];

  for (const [placementIndex, placement] of placements.entries()) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) continue;

    const placed = placePiece(piece, placement);
    for (let dy = 0; dy < placed.height; dy += 1) {
      for (let dx = 0; dx < placed.width; dx += 1) {
        candidates.push({
          x: placed.x + dx,
          y: placed.y + dy,
          pieceId: placement.pieceId,
          placementIndex,
          weight: piece.kind === "dock" ? 0.45 : 1
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

function getConsecutiveFlagDistanceThreshold(preferences = {}, guidanceLevel = 0) {
  const byDifficulty = {
    easy: 6,
    moderate: 5,
    hard: 5
  };
  const byLengthOffset = {
    short: -2,
    moderate: 0,
    long: 1
  };

  const base = byDifficulty[preferences.difficulty] ?? byDifficulty.moderate;
  const lengthOffset = byLengthOffset[preferences.length] ?? 0;

  return Math.max(3, base + lengthOffset);
}

function getSequentialFlagDistanceThreshold(preferences = {}, pairIndex = 0, totalFlags = 0, guidanceLevel = 0) {
  const base = getConsecutiveFlagDistanceThreshold(preferences, guidanceLevel);
  const lengthPreference = preferences.length ?? "moderate";

  if (totalFlags < 2) {
    return base;
  }

  let lateBonus = 0;
  if (pairIndex === totalFlags - 2) {
    if (lengthPreference === "moderate") {
      lateBonus = 2;
    } else if (lengthPreference === "long") {
      lateBonus = 3;
    } else if ((preferences.difficulty ?? "moderate") !== "hard") {
      lateBonus = 1;
    }
  } else if (pairIndex === totalFlags - 3) {
    if (lengthPreference === "moderate") {
      lateBonus = 1;
    } else if (lengthPreference === "long") {
      lateBonus = 2;
    }
  }

  return base + lateBonus;
}

function getFirstFlagDistanceThresholds(lengthPreference, guidanceLevel) {
  const base = {
    short: { nearest: 4, average: 6 },
    moderate: { nearest: 5, average: 8 },
    long: { nearest: 6, average: 9 }
  };
  const selected = base[lengthPreference] || base.moderate;
  return {
    nearest: selected.nearest + Math.min(guidanceLevel, 1),
    average: selected.average + Math.min(guidanceLevel, 1)
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

function isValidFlagSequence(flags, preferences = {}, guidanceLevel = 0) {
  for (let index = 1; index < flags.length; index += 1) {
    const minDistance = getSequentialFlagDistanceThreshold(preferences, index - 1, flags.length, guidanceLevel);
    if (areFlagsTooClose(flags[index - 1], flags[index], minDistance)) {
      return false;
    }
  }

  return true;
}

function getFlagCandidateApproachStats(tileMap, point) {
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ];
  let openCount = 0;
  let pitCount = 0;
  let voidCount = 0;

  for (const { dx, dy } of directions) {
    const tile = tileMap.get(`${point.x + dx},${point.y + dy}`);
    if (!tile) {
      voidCount += 1;
      continue;
    }

    const features = tile.features || [];
    if (features.some((feature) => feature.type === "pit")) {
      pitCount += 1;
      continue;
    }

    openCount += 1;
  }

  return {
    openCount,
    pitCount,
    voidCount
  };
}

function getFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, guidanceLevel, thresholds, previousFlag = null) {
  let weight = candidate.weight ?? 1;
  const approachStats = getFlagCandidateApproachStats(tileMap, candidate);
  const difficulty = preferences.difficulty ?? "moderate";
  const lengthPreference = preferences.length ?? "moderate";

  weight += approachStats.openCount * (difficulty === "easy" ? 1.5 : 1.1);
  weight -= approachStats.pitCount * (difficulty === "easy" ? 1.3 : 0.9);
  weight -= approachStats.voidCount * (difficulty === "easy" ? 1 : 0.7);

  if (sequenceIndex === 0 && starts.length) {
    const distances = starts.map((start) => manhattanDistance(candidate, start));
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    if (nearest >= thresholds.nearest && averageDistance >= thresholds.average) {
      weight += difficulty === "easy" ? 3.5 : 2;
    } else {
      weight -= difficulty === "easy" ? 2.5 : 1.4;
    }
  }

  if (previousFlag) {
    const legDistance = manhattanDistance(previousFlag, candidate);
    if (lengthPreference === "short") {
      weight += legDistance <= 7 ? 2.2 : legDistance <= 10 ? 0.9 : -1.8;
    } else if (lengthPreference === "moderate") {
      weight += legDistance >= 5 && legDistance <= 10 ? 1.2 : 0;
    } else if (legDistance >= 8) {
      weight += 1.4;
    }
  }

  weight += Math.min(2, guidanceLevel * 0.35);
  if (difficulty === "easy" && lengthPreference === "short") {
    weight += 1.4;
  } else if (difficulty !== "hard" && lengthPreference !== "long") {
    weight += 0.6;
  }
  return Math.max(0.05, Number(weight.toFixed(2)));
}

function sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, guidanceLevel, thresholds) {
  const difficulty = preferences.difficulty ?? "moderate";
  const weighted = difficulty === "easy" || difficulty === "moderate";
  const pool = [...flagCandidates];
  const picked = [];

  while (pool.length && picked.length < flagCount) {
    const sequenceIndex = picked.length;
    const previousFlag = picked[sequenceIndex - 1] ?? null;
    const eligible = pool
      .filter((candidate) => (
        picked.every((flag, index) => {
          const minDistance = index === sequenceIndex - 1
            ? getSequentialFlagDistanceThreshold(preferences, index, flagCount, guidanceLevel)
            : getConsecutiveFlagDistanceThreshold(preferences, guidanceLevel);
          return !areFlagsTooClose(flag, candidate, minDistance);
        })
      ))
      .map((candidate) => ({
        ...candidate,
        weight: weighted
          ? getFlagCandidateWeight(
            candidate,
            tileMap,
            starts,
            preferences,
            sequenceIndex,
            guidanceLevel,
            thresholds,
            previousFlag
          )
          : (candidate.weight ?? 1)
      }));

    if (!eligible.length) {
      break;
    }

    const [chosen] = sampleManyWeighted(eligible, 1);
    if (!chosen) {
      break;
    }

    picked.push(chosen);
    const chosenIndex = pool.findIndex((candidate) => (
      candidate.x === chosen.x &&
      candidate.y === chosen.y &&
      candidate.pieceId === chosen.pieceId
    ));
    if (chosenIndex >= 0) {
      pool.splice(chosenIndex, 1);
    }
  }

  return picked;
}

function pickFlags(flagCandidates, flagCount, boardPlacements, dockPlacement, pieceMap, starts = [], preferences = {}, guidanceLevel = 0) {
  const farthestBoardIndex = getMostDistantBoardIndex(boardPlacements, dockPlacement, pieceMap);
  const farthestBoardPieceId = boardPlacements[farthestBoardIndex]?.pieceId;
  const mustUseFarthestBoard = boardPlacements.length > 1 && farthestBoardPieceId;
  const firstFlagThresholds = getFirstFlagDistanceThresholds(preferences.length, guidanceLevel);
  const { tileMap } = buildResolvedMap([...boardPlacements, dockPlacement], pieceMap);

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const sampled = sampleFlagSequence(
      flagCandidates,
      flagCount,
      tileMap,
      starts,
      preferences,
      guidanceLevel,
      firstFlagThresholds
    );

    if (sampled.length !== flagCount) {
      continue;
    }

    if (mustUseFarthestBoard && !sampled.some((flag) => flag.pieceId === farthestBoardPieceId)) {
      continue;
    }

    if (!isValidFlagSequence(sampled, preferences, guidanceLevel)) {
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

function createBridgeBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation, dockPiece) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side, Math.max(dockPiece.width, dockPiece.height));

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(Math.random() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width - DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width + DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height - DOCK_BRIDGE_GAP, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height + DOCK_BRIDGE_GAP, rotation };
}

function findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped) {
  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = getValidDockRuns(groupBoundaryRuns(getBoundaryEdges(footprintTiles)), dock);
  const candidates = [];

  for (const run of boundaryRuns) {
    const oppositeSide = { E: "W", W: "E", N: "S", S: "N" }[run.side];

    for (const other of boundaryRuns) {
      if (other === run || other.side !== oppositeSide || other.orientation !== run.orientation) {
        continue;
      }

      if (Math.abs(other.line - run.line) !== DOCK_BRIDGE_GAP) {
        continue;
      }

      const overlapStart = Math.max(run.start, other.start);
      const overlapEnd = Math.min(run.end, other.end);
      if (overlapEnd - overlapStart < dock.height) {
        continue;
      }

      const preferredRun = run.side === "E" || run.side === "S" ? run : other;
      const offset = overlapStart - preferredRun.start;
      const dockPlacement = projectDockPlacement(preferredRun, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid) {
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: preferredRun
        });
      }
    }
  }

  return candidates.length ? sample(candidates) : null;
}

function canBridgeDisconnectedLayout(structuralPlacements, pieceMap, dockPieceId) {
  return Boolean(
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, false) ||
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, true)
  );
}

function tryExtendBoardLayout(existingPlacements, nextBoardId, pieceMap, dockPieceId, allowDockBridge = false) {
  const nextBoard = pieceMap[nextBoardId];
  const dock = pieceMap[dockPieceId];
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

        if (allowDockBridge && validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }

    if (!allowDockBridge) {
      continue;
    }

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createBridgeBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation, dock);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }
  }

  return null;
}

function tryExtendAlignedBoardLayout(existingPlacements, nextBoardId, pieceMap) {
  const nextBoard = pieceMap[nextBoardId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const candidates = createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);

        for (const nextPlacement of shuffle(candidates)) {
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
  }

  return null;
}

function createBoardPlacements(pieceMap, lengthPreference, preferences, guidanceLevel, expansionIds = null, dockPieceId = "docking-bay-a") {
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds);
  const maxBoards = Math.min(4, countPhysicalBoards(mainBoardIds, pieceMap));
  const boardCount = weightedBoardCount(lengthPreference, maxBoards);
  let boardIds = [];

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidateBoardIds = selectBoardIdsForCourse(mainBoardIds, boardCount, pieceMap, preferences, guidanceLevel);
    if (candidateBoardIds.length !== boardCount) {
      continue;
    }
    if (!boardIdsCanSupportDock(candidateBoardIds, pieceMap, dockPieceId)) {
      continue;
    }
    boardIds = candidateBoardIds;
    break;
  }

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

  for (const [index, nextBoardId] of boardIds.slice(1).entries()) {
    const allowDockBridge = !preferences.alignedLayout && index === boardIds.length - 2 && Math.random() < DOCK_BRIDGE_PROBABILITY;
    const extension = preferences.alignedLayout
      ? tryExtendAlignedBoardLayout(placements, nextBoardId, pieceMap)
      : tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, allowDockBridge);
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

function createDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped) {
  const layoutValidation = validateMainBoardLayout(structuralPlacements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });
  if (!layoutValidation.valid && layoutValidation.errors.length === 1 && layoutValidation.errors[0] === "disconnected-layout") {
    return findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
  }

  const dock = pieceMap[dockPieceId];
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

function getDockBoundaryRun(structuralPlacements, dockPlacement, pieceMap) {
  const dock = pieceMap[dockPlacement.pieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const expectedSide = {
    E: "W",
    S: "N",
    W: "E",
    N: "S"
  }[dockPlacement.startFacingOverride] ?? null;

  return validRuns.find((run) => {
    if (expectedSide && run.side !== expectedSide) {
      return false;
    }

    const projected = projectDockPlacement(run, 0, dock, dockPlacement.rotation === (({
      W: 180,
      N: 270,
      E: 0,
      S: 90
    })[run.side] ?? 0));

    if (run.side === "W" || run.side === "E") {
      return projected.x === dockPlacement.x && dockPlacement.y >= projected.y && dockPlacement.y + dock.height <= projected.y + run.length;
    }

    return projected.y === dockPlacement.y && dockPlacement.x >= projected.x && dockPlacement.x + dock.width <= projected.x + run.length;
  }) ?? null;
}

function analyzeFlagSequence(tileMap, starts, flags, playerCount, options = {}) {
  const firstLeg = analyzeCourse(tileMap, starts, flags[0], {
    maxRoutes: 4,
    flags,
    playerCount,
    recoveryRule: options.recoveryRule,
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects
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
    const allowedFacings = [...new Set(
      previousLegRoutes
        .map((route) => route?.finalState?.facing)
        .filter((facing) => FACINGS.includes(facing))
    )];
    const analysis = analyzeFlagLeg(tileMap, flags[index - 1], flags[index], {
      facings: allowedFacings.length ? allowedFacings : FACINGS,
      routesPerFacing: 3,
      maxDistinctRoutes: 4,
      previousLegRoutes,
      playerCount,
      maxExpansions: 18000,
      recoveryRule: options.recoveryRule,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
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
    first.difficultyScore * 0.42 +
    first.averageTrafficPenalty * 0.9 +
    first.flagAreaScore * 1.15 +
    avgLegScore * 0.32 +
    avgCongestion * 0.65 +
    avgBacktrack * 20 -
    avgDiversity * 0.45
  ).toFixed(2));
}

function computeLengthMetrics(sequence, flagCount, playerCount, boardCount) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const totalRouteDistance = first.lengthScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);
  const totalActionLoad = first.actionScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteActions || 0), 0);
  const totalCongestion = first.averageTrafficPenalty + later.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0);
  const checkpointLoad = flagCount * 2.2;
  const playerLoad = (playerCount || 4) * 1.6;
  const actionLoad = totalActionLoad * 2.8;
  const distanceLoad = totalRouteDistance * 0.75;
  const congestionLoad = totalCongestion * 0.12;
  const flagAreaLoad = first.flagAreaScore * 0.08;
  const difficultyLoad = sequence.summary.totalDifficulty * 0.03;
  const routeLoad = actionLoad + distanceLoad;
  const frictionLoad = congestionLoad + flagAreaLoad + difficultyLoad;
  const raw = Number((checkpointLoad + playerLoad + routeLoad + frictionLoad).toFixed(2));

  return {
    raw,
    inputs: {
      flagCount,
      playerCount: playerCount || 4,
      totalActionLoad: Number(totalActionLoad.toFixed(2)),
      totalRouteDistance: Number(totalRouteDistance.toFixed(2)),
      totalCongestion: Number(totalCongestion.toFixed(2)),
      flagAreaScore: Number(first.flagAreaScore.toFixed(2)),
      totalDifficulty: Number(sequence.summary.totalDifficulty.toFixed(2)),
      boardCount
    },
    contributions: {
      checkpointLoad: Number(checkpointLoad.toFixed(2)),
      playerLoad: Number(playerLoad.toFixed(2)),
      actionLoad: Number(actionLoad.toFixed(2)),
      distanceLoad: Number(distanceLoad.toFixed(2)),
      congestionLoad: Number(congestionLoad.toFixed(2)),
      flagAreaLoad: Number(flagAreaLoad.toFixed(2)),
      difficultyLoad: Number(difficultyLoad.toFixed(2)),
      routeLoad: Number(routeLoad.toFixed(2)),
      frictionLoad: Number(frictionLoad.toFixed(2))
    }
  };
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
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1
  );
  const lengthRaw = lengthMetrics.raw;
  const fairnessStdDev = sequence.firstLeg.summary.scoreStdDev;

  const difficultyThresholds = {
    easy: [0, 70],
    moderate: [70, 105],
    hard: [105, Infinity]
  };
  const lengthThresholds = {
    short: [MIN_LENGTH_RAW, 130],
    moderate: [130, 180],
    long: [180, Infinity]
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
    lengthMetrics,
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
    `Requested: ${scenario.preferences.playerCount} players, ${formatDifficultyLabel(scenario.preferences.difficulty)} difficulty, ${formatLengthLabel(scenario.preferences.length)} length`,
    `Layout mode: ${scenario.preferences.alignedLayout ? "aligned" : "freeform"}`,
    `Sets: ${[...getSelectedExpansionIds(scenario.preferences)].map((id) => formatExpansionName(id)).join(", ") || "none"}`,
    `Allowed variants: ${scenario.preferences.allowedVariantRules?.dynamicArchiving ? "Dynamic Archiving" : "none"}`,
    `Recovery used: ${scenario.recoveryRule}`,
    `Accepted after ${scenario.attempts} attempt(s)`,
    `Board count: ${scenario.boardCount}`,
    `Boards: ${scenario.mainBoardIds.map((pieceId, index) => `${pieceId}@${scenario.mainRotations[index]}`).join(", ")}`,
    `Flags: ${scenario.checkpoints.map((flag, index) => `#${index + 1}(${flag.x},${flag.y})`).join(", ")}`,
    scenario.rebootTokens?.length
      ? `Reboot tokens: ${scenario.rebootTokens.map((token) => `${token.pieceId}(${token.x},${token.y},${token.dir})`).join(", ")}`
      : "Reboot tokens: none",
    `Dock side: ${scenario.dockBoundaryRun?.side ?? "n/a"}`,
    `Dock flipped: ${scenario.dockFlipped ? "yes" : "no"}`,
    `Showing leg: ${legOptions[selectedLegIndex]}`,
    `Goal flag: (${goal.x}, ${goal.y})`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.sequence.starts.length}`,
    `Difficulty raw: ${scenario.metrics.difficultyRaw}`,
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Length inputs: flags ${scenario.metrics.lengthMetrics.inputs.flagCount}, players ${scenario.metrics.lengthMetrics.inputs.playerCount}, actionScore ${scenario.metrics.lengthMetrics.inputs.totalActionLoad}, distanceScore ${scenario.metrics.lengthMetrics.inputs.totalRouteDistance}, congestion ${scenario.metrics.lengthMetrics.inputs.totalCongestion}, flagArea ${scenario.metrics.lengthMetrics.inputs.flagAreaScore}, totalDifficulty ${scenario.metrics.lengthMetrics.inputs.totalDifficulty}`,
    `Length contributions: flags ${scenario.metrics.lengthMetrics.contributions.checkpointLoad}, players ${scenario.metrics.lengthMetrics.contributions.playerLoad}, actions ${scenario.metrics.lengthMetrics.contributions.actionLoad}, distance ${scenario.metrics.lengthMetrics.contributions.distanceLoad}, congestion ${scenario.metrics.lengthMetrics.contributions.congestionLoad}, flagArea ${scenario.metrics.lengthMetrics.contributions.flagAreaLoad}, difficulty ${scenario.metrics.lengthMetrics.contributions.difficultyLoad}`,
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
  updateBoardAuditVisibility();
}

function renderScenario(scenario) {
  updateDevView();
  updateSetupSummary(scenario);
  updateRulesNote(scenario);
  updateLegend(scenario);
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
    rebootTokens: scenario.rebootTokens,
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

function validateSelectedInventory(assets, preferences) {
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getAvailableDockIds(assets.pieceMap, expansionIds);
  if (!availableDockIds.length) {
    return "The selected sets contain no docking bay. Enable a set with a docking bay to generate a course.";
  }

  const availableMainBoardIds = getAvailableMainBoardIds(assets.pieceMap, expansionIds);
  if (!availableMainBoardIds.length) {
    return "The selected sets contain no supported main boards for course generation yet.";
  }

  return null;
}

function createRandomCandidate(assets, preferences, attempt = 1) {
  const { pieceMap } = assets;
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getAvailableDockIds(pieceMap, expansionIds);
  const dockPieceId = sample(availableDockIds);
  const recoveryRule = chooseRecoveryRule(preferences);
  const dockFlipped = Math.random() < 0.5;
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const boardLayout = createBoardPlacements(pieceMap, preferences.length, preferences, guidanceLevel, expansionIds, dockPieceId);
  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const dockLayout = createDockPlacement(boardLayout.placements, pieceMap, dockPieceId, dockFlipped);
  if (!dockLayout) {
    throw new Error("Unable to place dock on assembled perimeter");
  }
  const overlayPlacements = chooseOverlayPlacements(boardLayout.placements, dockLayout.dockPlacement, pieceMap, preferences, expansionIds);

  const placements = [
    ...boardLayout.placements,
    dockLayout.dockPlacement,
    ...overlayPlacements
  ];
  const boardRects = buildBoardRects(boardLayout.placements, pieceMap);

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
  const rebootTokens = recoveryRule === "reboot_tokens"
    ? placeRebootTokens(boardRects, pieceMap, tileMap, checkpoints, preferences.playerCount)
    : [];
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, starts, checkpoints, preferences.playerCount, {
    recoveryRule,
    rebootTokens,
    boardRects
  });
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
    overlayPlacements,
    checkpoints,
    overlayPlacements,
    rebootTokens,
    goalTileMap,
    playerCount: preferences.playerCount,
    recoveryRule,
    mainBoardIds: boardLayout.boardIds,
    mainRotations: boardLayout.placements.map((placement) => placement.rotation),
    boardCount: boardLayout.boardCount,
    boardRects,
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

function serializeScenario(scenario) {
  return {
    preferences: scenario.preferences,
    recoveryRule: scenario.recoveryRule,
    placements: scenario.placements,
    checkpoints: scenario.checkpoints,
    rebootTokens: scenario.rebootTokens,
    attempts: scenario.attempts ?? 0
  };
}

function saveScenarioSnapshot(scenario) {
  try {
    localStorage.setItem(SAVED_SCENARIO_KEY, JSON.stringify(serializeScenario(scenario)));
  } catch {
    // ignore storage failures
  }
}

function loadScenarioSnapshot() {
  try {
    const raw = localStorage.getItem(SAVED_SCENARIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hydrateScenarioFromSnapshot(assets, snapshot) {
  if (!snapshot?.placements?.length || !snapshot?.checkpoints?.length || !snapshot?.preferences) {
    return null;
  }

  const { pieceMap, imageMap } = assets;
  const recoveryRule = snapshot.recoveryRule ?? "reboot_tokens";
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const rebootTokens = snapshot.rebootTokens || [];
  const boardPlacements = placements.filter((placement) => {
    const kind = assets.pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacement = placements.find((placement) => assets.pieceMap[placement.pieceId]?.kind === "dock");
  const boardRects = buildBoardRects(boardPlacements, pieceMap);

  if (!dockPlacement || !boardPlacements.length) {
    return null;
  }

  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, starts, checkpoints, snapshot.preferences.playerCount, {
    recoveryRule,
    rebootTokens,
    boardRects
  });
  const metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    recoveryRule,
    flagCount: checkpoints.length
  }, {
    boardPlacements,
    pieceMap,
    checkpoints
  });

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    checkpoints,
    rebootTokens,
    goalTileMap,
    playerCount: snapshot.preferences.playerCount,
    recoveryRule,
    mainBoardIds: boardPlacements.map((placement) => placement.pieceId),
    mainRotations: boardPlacements.map((placement) => placement.rotation),
    boardCount: boardPlacements.length,
    boardRects,
    guidanceLevel: 0,
    dockFlipped: Boolean(dockPlacement.rotation % 180),
    dockBoundaryRun: getDockBoundaryRun(boardPlacements, dockPlacement, pieceMap),
    sequence,
    metrics,
    preferences: {
      ...snapshot.preferences,
      recoveryRule,
      flagCount: checkpoints.length
    },
    attempts: snapshot.attempts ?? 0
  };
}

async function start() {
  setGeneratingOverlay(true, "Trying random setups and checking difficulty, length, and usable starts.");
  await nextFrame();
  const assets = await loadAssets();
  initializeBoardAudit(assets);
  const preferences = getPreferencesFromControls();
  const inventoryError = validateSelectedInventory(assets, preferences);
  if (inventoryError) {
    setGeneratingOverlay(false);
    window.alert(inventoryError);
    return;
  }

  let bestScenario = null;
  let crashedAttempts = 0;
  let lastAttemptError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let scenario;
    try {
      scenario = createRandomCandidate(assets, preferences, attempt);
    } catch (error) {
      crashedAttempts += 1;
      lastAttemptError = error;
      console.warn(`Attempt ${attempt} failed during generation`, error);
      continue;
    }

    scenario.attempts = attempt;

    if (!bestScenario || scenario.metrics.fitScore < bestScenario.metrics.fitScore) {
      bestScenario = scenario;
    }

    if (scenario.metrics.acceptable) {
      currentScenario = scenario;
      renderScenario(currentScenario);
      saveScenarioSnapshot(currentScenario);
      setGeneratingOverlay(false);
      return;
    }

    if (attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      setGeneratingOverlay(true, `Attempt ${attempt} of ${MAX_ATTEMPTS}: still looking for a ${formatLengthLabel(preferences.length)} ${formatDifficultyLabel(preferences.difficulty)} setup with ${preferences.playerCount} usable starts.`);
      await nextFrame();
    }
  }

  if (!bestScenario) {
    setGeneratingOverlay(false);
    window.alert(
      crashedAttempts > 0 && lastAttemptError
        ? `Course generation failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastAttemptError.message}`
        : `Course generation failed after ${MAX_ATTEMPTS} attempts.`
    );
    return;
  }

  currentScenario = bestScenario;
  renderScenario(currentScenario);
  saveScenarioSnapshot(currentScenario);
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

document.getElementById("variant-dynamic-archiving").addEventListener("change", () => {
  updateVariantSummary();
});

document.getElementById("expansion-roborally").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-master-builder").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-thrills-and-spills").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-wet-and-wild").addEventListener("change", () => {
  updateExpansionSummary();
});

document.addEventListener("click", (event) => {
  const picker = document.querySelector(".variant-picker");
  if (picker && !picker.contains(event.target)) {
    picker.removeAttribute("open");
  }
});

document.addEventListener("focusin", (event) => {
  const picker = document.querySelector(".variant-picker");
  if (picker && !picker.contains(event.target)) {
    picker.removeAttribute("open");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeVariantPicker();
  }
});

async function init() {
  const assets = await loadAssets();
  initializeBoardAudit(assets);
  updateExpansionSummary();
  updateVariantSummary();
  updateDevView();
  const snapshot = loadScenarioSnapshot();

  if (snapshot) {
    applyPreferencesToControls(snapshot.preferences);
    const restoredScenario = hydrateScenarioFromSnapshot(assets, snapshot);
    if (restoredScenario) {
      currentScenario = restoredScenario;
      renderScenario(currentScenario);
      setGeneratingOverlay(false);
      return;
    }
  }

  await start();
}

init().catch(console.error);
