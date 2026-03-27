const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { render },
  { analyzeCourse, analyzeFlagLeg },
  {
    buildMainFootprintTiles,
    buildResolvedMap,
    getDockFrontageLength,
    getBoundaryEdges,
    getValidDockRuns,
    groupBoundaryRuns,
    getPlacedRect,
    placePiece,
    projectDockPlacement,
    rotatedDimensions,
    validateDockPlacement,
    validateMainBoardLayout
  }
] = await Promise.all([
  import(versionedPath("./render.js")),
  import(versionedPath("./analyze.js")),
  import(versionedPath("./board.js"))
]);

const ROTATIONS = [0, 90, 180, 270];
const FACINGS = ["N", "E", "S", "W"];
const DOCK_SIDES = ["left", "top", "right", "bottom"];
const MAX_ATTEMPTS = 40;
const MIN_LENGTH_RAW = 28;
const MIN_SHARED_EDGE = 5;
const DOCK_BRIDGE_GAP = 3;
const DOCK_BRIDGE_PROBABILITY = 0.12;
const OVERLAY_UPDATE_INTERVAL = 4;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
const BOARD_AUDIT_NOTES_KEY = "roborally-course-generator:board-audit-notes";
const VARIANT_COMPLEXITY = {
  lighterGame: 1,
  lessDeadlyGame: 1,
  moreDeadlyGame: 1,
  classicSharedDeck: 3,
  dynamicArchiving: 1,
  hazardousFlags: 2,
  lessForeshadowing: 1
};
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
  "all-roads",
  "black-gold",
  "blueprint",
  "cactus",
  "coliseum",
  "coming-and-going",
  "docking-bay-a",
  "docking-bay-b",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "in-and-out",
  "mb-docking-bay",
  "mb-docking-bay-a",
  "misdirection",
  "sidewinder",
  "steps",
  "tempest",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-wave",
  "transition",
  "trench-run",
  "winding",
  "whirlpool"
];
const VARIANT_STATES = {
  off: { label: "Not allowed" },
  allowed: { label: "Allowed" },
  forced: { label: "Always on" }
};
const VARIANT_CONTROL_IDS = {
  lighterGame: "variant-lighter-game",
  lessDeadlyGame: "variant-less-deadly-game",
  moreDeadlyGame: "variant-more-deadly-game",
  classicSharedDeck: "variant-classic-shared-deck",
  dynamicArchiving: "variant-dynamic-archiving",
  hazardousFlags: "variant-hazardous-flags",
  lessForeshadowing: "variant-less-foreshadowing"
};

let currentScenario = null;
let cachedAssets = null;
let boardAuditInitialized = false;
let boardAuditState = {
  pieceId: null,
  hoverTile: null,
  selectedFeatures: new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id))
};

async function loadJSON(path) {
  const res = await fetch(versionedPath(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = versionedPath(src);
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
    piece.boardProfile = deriveBoardProfile(piece);
    piece.derivedBias = piece.boardProfile.bias;
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
  if (lengthPreference === "any") {
    return "any";
  }
  return lengthPreference === "moderate" ? "medium" : String(lengthPreference ?? "medium");
}

function formatDifficultyLabel(difficultyPreference) {
  const labels = {
    any: "any",
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

function getDifficultyThresholds() {
  return {
    easy: [0, 80],
    moderate: [80, 118],
    hard: [118, Infinity]
  };
}

function getLengthThresholds() {
  return {
    short: [MIN_LENGTH_RAW, 140],
    moderate: [135, 205],
    long: [180, Infinity]
  };
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
  const visible = isDevViewEnabled() && isBoardAuditEnabled();
  document.getElementById("board-audit-panel")?.classList.toggle("hidden", !visible);
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
  const fitNoteEl = document.getElementById("fit-note");
  const summary = document.getElementById("setup-summary");
  const boardsEl = document.getElementById("setup-boards");
  const overlaysRowEl = document.getElementById("setup-overlays-row");
  const overlaysEl = document.getElementById("setup-overlays");
  const flagsEl = document.getElementById("setup-flags");

  if (!scenario) {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
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
  const noteParts = [];
  const difficultyFit = scenario.metrics.difficultyFit ?? 0;
  const lengthFit = scenario.metrics.lengthFit ?? 0;
  const requestedDifficulty = scenario.preferences.difficulty;
  const moderateDifficultyThreshold = requestedDifficulty === "easy" ? 20 : 14;
  const strongDifficultyThreshold = requestedDifficulty === "easy" ? 48 : 42;
  const difficultyStrength = difficultyFit >= strongDifficultyThreshold ? "a lot" : difficultyFit >= moderateDifficultyThreshold ? "somewhat" : null;
  const lengthStrength = lengthFit >= 24 ? "a lot" : lengthFit >= 14 ? "somewhat" : null;

  if (scenario.preferences.difficulty !== "any" && difficultyStrength) {
    noteParts.push(scenario.metrics.difficultyDirection === "low"
      ? `${difficultyStrength} easier`
      : `${difficultyStrength} harder`);
  }

  if (scenario.preferences.length !== "any" && lengthStrength) {
    noteParts.push(scenario.metrics.lengthDirection === "low"
      ? `${lengthStrength} shorter`
      : `${lengthStrength} longer`);
  }

  const shouldSuggestReroll = (
    noteParts.length >= 2 ||
    difficultyFit >= strongDifficultyThreshold ||
    lengthFit >= 24
  );

  if (noteParts.length) {
    fitNoteEl.textContent = `Closest fit: this course is ${noteParts.join(" and ")} than requested.${shouldSuggestReroll ? " Rerolling may give a better match." : ""}`;
    fitNoteEl.classList.remove("hidden");
  } else {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
  }
  summary.classList.remove("hidden");
}

function updateVariantSummary() {
  const summaryEl = document.getElementById("variant-summary");
  const states = [
    ["A Lighter Game", getVariantControlState("lighterGame")],
    ["A Less Deadly Game", getVariantControlState("lessDeadlyGame")],
    ["A More Deadly Game", getVariantControlState("moreDeadlyGame")],
    ["Shared Deck", getVariantControlState("classicSharedDeck")],
    ["Dynamic Archiving", getVariantControlState("dynamicArchiving")],
    ["Hazardous Flags", getVariantControlState("hazardousFlags")],
    ["Less Foreshadowing", getVariantControlState("lessForeshadowing")]
  ];
  const enabled = states.filter(([, state]) => state !== "off");
  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = states.map(([label, state]) => `${label}: ${VARIANT_STATES[state].label}`).join(", ");
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

function hasCheckpointBoardFeatures(scenario, featureFilter = null) {
  if (!scenario?.placements?.length || !scenario?.checkpoints?.length) {
    return false;
  }

  const { tileMap } = buildResolvedMap(scenario.placements, scenario.pieceMap);

  return scenario.checkpoints.some((checkpoint) => {
    const tile = tileMap.get(`${checkpoint.x},${checkpoint.y}`);
    return (tile?.features || []).some((feature) => (
      feature.type !== "checkpoint" && (!featureFilter || featureFilter(feature))
    ));
  });
}

function updateRulesNote(scenario) {
  const rulesBlockEl = document.getElementById("rules-block");
  const topAnchorEl = document.getElementById("rules-anchor-top");
  const bottomAnchorEl = document.getElementById("rules-anchor-bottom");
  const checkpointNoteEl = document.getElementById("checkpoint-note");
  const noteEl = document.getElementById("rules-note");
  const checkpointNotes = [];
  const notes = [];

  if (!scenario) {
    bottomAnchorEl?.appendChild(rulesBlockEl);
    rulesBlockEl?.classList.add("hidden");
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    return;
  }

  if (!scenario.hazardousFlags && hasSuppressedCheckpointFeatures(scenario)) {
    checkpointNotes.push("Checkpoint spaces suppress non-wall, non-laser board elements (Game Guide p. 15).");
  }

  if (scenario.recoveryRule === "dynamic_archiving") {
    notes.push("Dynamic Archiving: instead of placing reboot tokens on each board, robots archive when they end a register on a checkpoint or battery space (Game Guide p. 32).");
  }

  if (scenario.hazardousFlags) {
    notes.push("Hazardous Flags: board elements under checkpoints remain active, but do not move or affect the checkpoints (Previous Robo Rally editions).");
  }

  if (scenario.lessDeadlyGame) {
    notes.push("A Less Deadly Game: board edges act as walls while pit spaces remain pits (Game Guide p. 32).");
  }

  if (scenario.moreDeadlyGame) {
    notes.push("A More Deadly Game: rebooting deals 3 damage instead of 2 (Game Guide p. 28).");
  }

  if (scenario.classicSharedDeck) {
    notes.push("Shared Deck: players use one combined programming deck, and spam cards go to hand instead of deck (Previous Robo Rally editions).");
  }

  if (scenario.lighterGame) {
    notes.push("A Lighter Game: upgrade cards are removed and battery spaces are inactive (Game Guide p. 32).");
  }

  if (scenario.lessForeshadowing) {
    notes.push("Less Foreshadowing: decks reshuffle every turn, reducing card-draw consistency (Game Guide p. 32).");
  }

  if (checkpointNotes.length) {
    checkpointNoteEl.textContent = checkpointNotes.join(" ");
    checkpointNoteEl.classList.remove("hidden");
  } else {
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
  }

  if (!notes.length) {
    bottomAnchorEl?.appendChild(rulesBlockEl);
    rulesBlockEl?.classList.toggle("hidden", !checkpointNotes.length);
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    return;
  }

  topAnchorEl?.appendChild(rulesBlockEl);
  rulesBlockEl?.classList.remove("hidden");
  noteEl.textContent = `SPECIAL RULES: ${notes.join(" ")}`;
  noteEl.classList.remove("hidden");
}

function describeAllowedVariants(preferences = {}) {
  const variants = [];
  const states = preferences.allowedVariantRules || {};
  const entries = [
    ["A Lighter Game", states.lighterGame ?? "off"],
    ["A Less Deadly Game", states.lessDeadlyGame ?? "off"],
    ["A More Deadly Game", states.moreDeadlyGame ?? "off"],
    ["Shared Deck", states.classicSharedDeck ?? "off"],
    ["Dynamic Archiving", states.dynamicArchiving ?? "allowed"],
    ["Hazardous Flags", states.hazardousFlags ?? "off"],
    ["Less Foreshadowing", states.lessForeshadowing ?? "off"]
  ];

  for (const [label, state] of entries) {
    const normalized = normalizeVariantState(state);
    if (normalized === "off") {
      continue;
    }
    variants.push(`${label} (${VARIANT_STATES[normalized].label})`);
  }

  return variants.length ? variants.join(", ") : "none";
}

function updateLegend(scenario) {
  const rebootTokenEl = document.getElementById("legend-reboot-token");
  rebootTokenEl?.classList.toggle("hidden", scenario?.recoveryRule !== "reboot_tokens");
}

function normalizeVariantState(value) {
  if (value === true) return "allowed";
  if (value === false) return "off";
  return value === "forced" || value === "allowed" || value === "off" ? value : "off";
}

function getVariantControlState(variantId) {
  const button = document.getElementById(VARIANT_CONTROL_IDS[variantId]);
  return normalizeVariantState(button?.dataset.state ?? "off");
}

function setVariantControlState(variantId, state) {
  const normalized = normalizeVariantState(state);
  const button = document.getElementById(VARIANT_CONTROL_IDS[variantId]);
  if (!button) {
    return;
  }

  button.dataset.state = normalized;
  button.textContent = VARIANT_STATES[normalized].label;
}

function cycleVariantControlState(variantId) {
  const current = getVariantControlState(variantId);
  const next = current === "off"
    ? "allowed"
    : current === "allowed"
      ? "forced"
      : "off";
  setVariantControlState(variantId, next);
  updateVariantSummary();
}

function chooseVariantEnabled(variantState, allowedChance = 0.5) {
  const normalized = normalizeVariantState(variantState);
  if (normalized === "forced") {
    return true;
  }
  if (normalized === "off") {
    return false;
  }
  return Math.random() < allowedChance;
}

function chooseRecoveryRule(preferences) {
  const dynamicArchivingState = preferences.allowedVariantRules?.dynamicArchiving ?? "allowed";
  if (chooseVariantEnabled(dynamicArchivingState, 0.5)) {
    return "dynamic_archiving";
  }

  return "reboot_tokens";
}

function chooseLessDeadlyGame(preferences) {
  const lessDeadlyState = preferences.allowedVariantRules?.lessDeadlyGame ?? "off";
  return chooseVariantEnabled(lessDeadlyState, 0.22);
}

function chooseMoreDeadlyGame(preferences) {
  const moreDeadlyState = preferences.allowedVariantRules?.moreDeadlyGame ?? "off";
  return chooseVariantEnabled(moreDeadlyState, 0.22);
}

function chooseLighterGame(preferences) {
  const lighterState = preferences.allowedVariantRules?.lighterGame ?? "off";
  return chooseVariantEnabled(lighterState, 0.24);
}

function chooseHazardousFlags(preferences) {
  const hazardousFlagsState = preferences.allowedVariantRules?.hazardousFlags ?? "off";
  return chooseVariantEnabled(hazardousFlagsState, 0.2);
}

function chooseClassicSharedDeck(preferences) {
  const classicSharedDeckState = preferences.allowedVariantRules?.classicSharedDeck ?? "off";
  return chooseVariantEnabled(classicSharedDeckState, 0.08);
}

function chooseLessForeshadowing(preferences) {
  const lessForeshadowingState = preferences.allowedVariantRules?.lessForeshadowing ?? "off";
  return chooseVariantEnabled(lessForeshadowingState, 0.22);
}

function sampleVariantComplexityBudget(preferences = {}) {
  const difficulty = preferences.difficulty ?? "moderate";
  const budgets = {
    easy: [0, 0, 0, 1, 1, 1, 2],
    moderate: [0, 0, 1, 1, 1, 2, 2, 3, 4],
    hard: [0, 1, 2, 2, 3, 3, 4, 4, 5, 6]
  };

  return sample(budgets[difficulty] || budgets.moderate);
}

function getVariantBaseChance(variantId, preferences = {}) {
  const difficulty = preferences.difficulty ?? "moderate";
  const byVariant = {
    lighterGame: { easy: 0.42, moderate: 0.28, hard: 0.18 },
    lessDeadlyGame: { easy: 0.3, moderate: 0.2, hard: 0.14 },
    moreDeadlyGame: { easy: 0.05, moderate: 0.14, hard: 0.26 },
    classicSharedDeck: { easy: 0.01, moderate: 0.07, hard: 0.2 },
    dynamicArchiving: { easy: 0.46, moderate: 0.4, hard: 0.34 },
    hazardousFlags: { easy: 0.08, moderate: 0.16, hard: 0.24 },
    lessForeshadowing: { easy: 0.07, moderate: 0.16, hard: 0.24 }
  };

  return byVariant[variantId]?.[difficulty] ?? 0.2;
}

function chooseVariantBundle(preferences = {}) {
  const variantStates = preferences.allowedVariantRules || {};
  const definitions = [
    { id: "lighterGame", cost: VARIANT_COMPLEXITY.lighterGame },
    { id: "lessDeadlyGame", cost: VARIANT_COMPLEXITY.lessDeadlyGame },
    { id: "moreDeadlyGame", cost: VARIANT_COMPLEXITY.moreDeadlyGame },
    { id: "classicSharedDeck", cost: VARIANT_COMPLEXITY.classicSharedDeck },
    { id: "dynamicArchiving", cost: VARIANT_COMPLEXITY.dynamicArchiving },
    { id: "hazardousFlags", cost: VARIANT_COMPLEXITY.hazardousFlags },
    { id: "lessForeshadowing", cost: VARIANT_COMPLEXITY.lessForeshadowing }
  ];
  const active = Object.fromEntries(definitions.map((entry) => [entry.id, false]));
  let usedBudget = 0;

  const forcedEntries = definitions.filter((entry) => normalizeVariantState(variantStates[entry.id] ?? "off") === "forced");
  forcedEntries.forEach((entry) => {
    active[entry.id] = true;
    usedBudget += entry.cost;
  });

  const sampledBudget = sampleVariantComplexityBudget(preferences);
  const budget = Math.max(sampledBudget, usedBudget);
  const allowedEntries = definitions
    .filter((entry) => normalizeVariantState(variantStates[entry.id] ?? "off") === "allowed")
    .map((entry) => ({
      ...entry,
      chance: getVariantBaseChance(entry.id, preferences)
    }));
  const orderedEntries = weightedOrder(
    allowedEntries,
    (entry) => Math.max(0.01, entry.chance + Math.random() * 0.08)
  );

  for (const entry of orderedEntries) {
    if (usedBudget + entry.cost > budget) {
      continue;
    }

    let chance = entry.chance;
    if (
      (entry.id === "classicSharedDeck" && active.lessForeshadowing) ||
      (entry.id === "lessForeshadowing" && active.classicSharedDeck)
    ) {
      chance *= 0.2;
    }

    if (Math.random() < chance) {
      active[entry.id] = true;
      usedBudget += entry.cost;
    }
  }

  return {
    recoveryRule: active.dynamicArchiving ? "dynamic_archiving" : "reboot_tokens",
    lighterGame: active.lighterGame,
    lessDeadlyGame: active.lessDeadlyGame,
    moreDeadlyGame: active.moreDeadlyGame,
    classicSharedDeck: active.classicSharedDeck,
    hazardousFlags: active.hazardousFlags,
    lessForeshadowing: active.lessForeshadowing,
    variantComplexityBudget: budget,
    variantComplexityUsed: usedBudget
  };
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
      lighterGame: getVariantControlState("lighterGame"),
      lessDeadlyGame: getVariantControlState("lessDeadlyGame"),
      moreDeadlyGame: getVariantControlState("moreDeadlyGame"),
      classicSharedDeck: getVariantControlState("classicSharedDeck"),
      dynamicArchiving: getVariantControlState("dynamicArchiving"),
      hazardousFlags: getVariantControlState("hazardousFlags"),
      lessForeshadowing: getVariantControlState("lessForeshadowing")
    }
  };
}

function applyPreferencesToControls(preferences) {
  if (!preferences) {
    return;
  }

  document.getElementById("player-count").value = String(preferences.playerCount ?? 4);
  document.getElementById("difficulty").value = preferences.difficulty ?? "any";
  document.getElementById("length").value = preferences.length ?? "any";
  document.getElementById("aligned-layout").checked = preferences.alignedLayout ?? false;
  document.getElementById("expansion-roborally").checked = preferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-master-builder").checked = preferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = preferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = preferences.selectedExpansions?.["wet-and-wild"] ?? false;
  setVariantControlState("lighterGame", preferences.allowedVariantRules?.lighterGame ?? "off");
  setVariantControlState("classicSharedDeck", preferences.allowedVariantRules?.classicSharedDeck ?? "off");
  setVariantControlState("dynamicArchiving", preferences.allowedVariantRules?.dynamicArchiving ?? "allowed");
  setVariantControlState("lessDeadlyGame", preferences.allowedVariantRules?.lessDeadlyGame ?? "off");
  setVariantControlState("moreDeadlyGame", preferences.allowedVariantRules?.moreDeadlyGame ?? "off");
  setVariantControlState("hazardousFlags", preferences.allowedVariantRules?.hazardousFlags ?? "off");
  setVariantControlState("lessForeshadowing", preferences.allowedVariantRules?.lessForeshadowing ?? "off");
  updateExpansionSummary();
  updateVariantSummary();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}

function deriveBoardProfile(piece) {
  if (piece.kind !== "base" && piece.kind !== "small") {
    return {
      bias: {
        hazard: 1,
        congestion: 1,
        complexity: 1
      },
      swinginess: 1,
      overall: 1,
      band: "neutral"
    };
  }

  const tiles = piece.tiles || [];
  const area = Math.max(1, piece.width * piece.height);
  let hazardWeight = 0;
  let congestionWeight = 0;
  let complexityWeight = 0;
  let swingWeight = 0;
  let pitCount = 0;
  let beltCount = 0;
  let portalCount = 0;
  let crusherCount = 0;
  let pushCount = 0;
  let hazardCount = 0;
  const getTimingWeight = (feature) => {
    const timingCount = feature?.timing?.length ?? 0;
    return timingCount > 0 ? timingCount / 5 : 1;
  };

  for (const tile of tiles) {
    for (const feature of tile.features || []) {
      if (feature.type === "pit") {
        hazardWeight += 3;
        swingWeight += 2.6;
        pitCount += 1;
        hazardCount += 1;
      } else if (feature.type === "laser") {
        hazardWeight += 2 + (feature.damage || 1) * 0.35;
        swingWeight += 0.55 + (feature.damage || 1) * 0.15;
        hazardCount += 1;
      } else if (feature.type === "flamethrower") {
        hazardWeight += 2.7 * getTimingWeight(feature);
        swingWeight += 0.9 * getTimingWeight(feature);
        hazardCount += 1;
      } else if (feature.type === "push") {
        const timingWeight = getTimingWeight(feature);
        hazardWeight += 1 * timingWeight;
        complexityWeight += 1.2 * timingWeight;
        swingWeight += 0.75 * timingWeight;
        pushCount += 1;
      } else if (feature.type === "crusher") {
        const timingWeight = getTimingWeight(feature);
        hazardWeight += 3 * timingWeight;
        complexityWeight += 0.8 * timingWeight;
        swingWeight += 1.35 * timingWeight;
        crusherCount += 1;
        hazardCount += 1;
      } else if (feature.type === "belt") {
        complexityWeight += feature.speed === 2 ? 2 : 1.2;
        congestionWeight += feature.speed === 2 ? 0.9 : 0.45;
        beltCount += 1;
      } else if (feature.type === "gear") {
        complexityWeight += 1.4;
      } else if (feature.type === "portal") {
        hazardWeight += 0.7;
        complexityWeight += 1.3;
        swingWeight += 1.25;
        portalCount += 1;
      } else if (feature.type === "oil") {
        hazardWeight += 1.2;
        complexityWeight += 1.8;
        swingWeight += 0.7;
      } else if (feature.type === "ledge") {
        hazardWeight += 0.8;
        congestionWeight += Math.max(1, (feature.sides || []).length) * 0.85;
        swingWeight += 0.45;
        hazardCount += 1;
      } else if (feature.type === "ramp") {
        complexityWeight += 0.7;
      } else if (feature.type === "wall") {
        congestionWeight += Math.max(1, (feature.sides || []).length) * 1.25;
      } else if (feature.type === "battery") {
        hazardWeight -= 0.35;
      }
    }
  }

  const bias = {
    hazard: normalizeBias(hazardWeight / area * 10),
    congestion: normalizeBias(congestionWeight / area * 9),
    complexity: normalizeBias(complexityWeight / area * 9)
  };
  const swinginess = normalizeBias(swingWeight / area * 10);
  const density = (hazardCount + beltCount + portalCount + pushCount + crusherCount) / area;
  const overall = Number(clamp(
    bias.hazard * 0.4 +
    bias.congestion * 0.22 +
    bias.complexity * 0.24 +
    swinginess * 0.14 +
    density * 3.6,
    1,
    3.6
  ).toFixed(2));
  const band = overall <= 1.48
    ? "intro"
    : overall <= 2.08
      ? "standard"
      : overall <= 2.6
        ? "challenging"
        : "extreme";

  return {
    bias,
    swinginess,
    overall,
    density: Number(density.toFixed(3)),
    band,
    signals: {
      pitCount,
      beltCount,
      portalCount,
      crusherCount,
      pushCount,
      hazardCount
    }
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
    moderate: [3, 3, 4, 4, 4],
    long: [3, 4, 4, 5, 5, 6]
  };

  const candidates = (table[lengthPreference] || table.moderate).filter((count) => count <= maxFlags);
  return sample(candidates.length ? candidates : [Math.min(2, maxFlags)]);
}

function getMinimumSmallOnlyBoardCount(lengthPreference, preferences = {}) {
  if (lengthPreference === "long") {
    return 4;
  }
  if (lengthPreference === "moderate") {
    return 3;
  }
  if (lengthPreference === "short") {
    return preferences.difficulty === "hard" ? 1 : 2;
  }
  return 1;
}

function weightedBoardCount(lengthPreference, maxBoards, hasLargeBoards = true, preferences = {}) {
  const table = {
    short: [1, 1, 1, 2, 2],
    moderate: [1, 2, 2, 3, 3],
    long: [2, 2, 3, 3, 4]
  };

  const minimumCount = hasLargeBoards
    ? 1
    : Math.min(maxBoards, getMinimumSmallOnlyBoardCount(lengthPreference, preferences));
  const candidates = (table[lengthPreference] || table.moderate).filter((count) => (
    count <= maxBoards && count >= minimumCount
  ));
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

function getEligibleDockIds(pieceMap, expansionIds = null, preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;

  return getAvailableDockIds(pieceMap, expansionIds)
    .filter((dockId) => (pieceMap[dockId]?.starts?.length ?? 0) >= playerCount);
}

function getDockSelectionWeight(piece, preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;

  if ((piece?.starts?.length ?? 0) < playerCount) {
    return 0;
  }

  if (piece?.physicalBoardId === "master-builder-docking-bay") {
    if (playerCount >= 6) {
      return 0.3;
    }
    if (playerCount >= 5) {
      return 0.45;
    }
  }

  return 1;
}

function weightedOrder(items, getWeight) {
  const remaining = [...items];
  const ordered = [];

  while (remaining.length) {
    const weights = remaining.map((item) => Math.max(0, Number(getWeight(item)) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (total <= 0) {
      ordered.push(...shuffle(remaining));
      break;
    }

    let pick = Math.random() * total;
    let selectedIndex = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      pick -= weights[index];
      if (pick <= 0) {
        selectedIndex = index;
        break;
      }
    }

    ordered.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  return ordered;
}

function getAvailableOverlayIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.overlayCapable)
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

function boardPreferencePenalty(piece, preferences, guidanceLevel) {
  const profile = piece.boardProfile ?? {
    bias: { hazard: 2, congestion: 2, complexity: 2 },
    swinginess: 2,
    overall: 2,
    band: "standard"
  };
  const bias = profile.bias;
  const difficultyTargets = {
    easy: {
      hazard: 1.12,
      congestion: preferences.playerCount >= 5 ? 1.08 : 1.22,
      complexity: 1.18,
      swinginess: 1.15,
      overall: 1.28
    },
    moderate: {
      hazard: 1.72,
      congestion: preferences.playerCount >= 5 ? 1.48 : 1.72,
      complexity: 1.72,
      swinginess: 1.65,
      overall: 1.92
    },
    hard: {
      hazard: 2.5,
      congestion: preferences.playerCount >= 5 ? 2.05 : 2.3,
      complexity: 2.35,
      swinginess: 2.2,
      overall: 2.45
    }
  };
  const target = difficultyTargets[preferences.difficulty] || difficultyTargets.moderate;
  const mismatch = (
    Math.abs(bias.hazard - target.hazard) * 1.45 +
    Math.abs(bias.congestion - target.congestion) * 1.4 +
    Math.abs(bias.complexity - target.complexity) * 1.15 +
    Math.abs((profile.swinginess ?? 2) - target.swinginess) * 1.2 +
    Math.abs((profile.overall ?? 2) - target.overall) * 1.85
  );
  const guidancePenalty = preferences.difficulty === "easy"
    ? Math.max(0, (profile.overall ?? 2) - 1.6) * 8.5 + Math.max(0, (profile.swinginess ?? 2) - 1.5) * 4.5
    : preferences.difficulty === "moderate"
      ? Math.max(0, (profile.overall ?? 2) - 2.2) * 3.2 + Math.max(0, (profile.swinginess ?? 2) - 2.05) * 1.6
      : Math.max(0, 1.3 - (profile.overall ?? 2)) * 0.35;
  const sparsePenalty = preferences.difficulty === "hard"
    ? 0
    : (profile.density ?? 0.08) <= 0.03
      ? (preferences.difficulty === "moderate" ? 2.2 : 1.1)
      : (profile.density ?? 0.08) <= 0.055
        ? (preferences.difficulty === "moderate" ? 1.15 : 0.45)
        : 0;
  const jitter = guidanceLevel === 0
    ? Math.random() * 2.4
    : guidanceLevel === 1
      ? Math.random() * 1.2
      : Math.random() * 0.45;

  return mismatch + guidancePenalty + sparsePenalty + jitter;
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

  return totalSpanCapacity >= getDockFrontageLength(dockPiece);
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

function boardSelectionCompositionPenalty(boardIds, pieceMap, lengthPreference, preferences = {}) {
  const smallCount = boardIds.filter((boardId) => pieceMap[boardId]?.kind === "small").length;
  const largeCount = boardIds.length - smallCount;
  let penalty = smallBoardCompositionPenalty(boardIds, pieceMap);

  if (largeCount === 0 && smallCount < getMinimumSmallOnlyBoardCount(lengthPreference, preferences)) {
    penalty += 250;
  }

  return penalty;
}

function selectBoardIdsForCourse(boardIds, count, pieceMap, preferences, guidanceLevel, lengthPreference) {
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
    .reduce((sum, entry) => sum + entry.score, 0) + boardSelectionCompositionPenalty(bestSelection, pieceMap, lengthPreference, preferences);

  const attemptCount = Math.min(24, Math.max(6, ranked.length * 2));
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const selection = sampleDistinctBoardFaces(boardIds, count, pieceMap);
    if (selection.length !== count) {
      continue;
    }

    const selectionScore = selection.reduce((sum, boardId) => (
      sum + boardPreferencePenalty(pieceMap[boardId], preferences, guidanceLevel)
    ), 0) + boardSelectionCompositionPenalty(selection, pieceMap, lengthPreference, preferences);

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
    moderate: 1,
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
      lateBonus = 3;
    } else if (lengthPreference === "long") {
      lateBonus = 3;
    } else if ((preferences.difficulty ?? "moderate") !== "hard") {
      lateBonus = 1;
    }
  } else if (pairIndex === totalFlags - 3) {
    if (lengthPreference === "moderate") {
      lateBonus = 2;
    } else if (lengthPreference === "long") {
      lateBonus = 2;
    }
  }

  return base + lateBonus;
}

function getFirstFlagDistanceThresholds(lengthPreference, guidanceLevel) {
  const base = {
    short: { nearest: 4, average: 6 },
    moderate: { nearest: 6, average: 9 },
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

function canUseCheckpointTile(candidate, tileMap, starts, preferences = {}) {
  if (!preferences.hazardousFlags) {
    return true;
  }

  if (starts.some((start) => start.x === candidate.x && start.y === candidate.y)) {
    return false;
  }

  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  return !(tile?.features || []).some((feature) => feature.type === "pit");
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
      weight += legDistance >= 6 && legDistance <= 12 ? 1.4 : legDistance >= 5 ? 0.5 : 0;
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
        canUseCheckpointTile(candidate, tileMap, starts, preferences) &&
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

function applyFlagOverrides(tileMap, goals, options = {}) {
  const next = cloneTileMap(tileMap);
  const hazardousFlags = Boolean(options.hazardousFlags);

  goals.forEach((goal, index) => {
    const key = `${goal.x},${goal.y}`;
    const tile = next.get(key) ?? { x: goal.x, y: goal.y, features: [] };

    if (!hazardousFlags) {
      tile.features = tile.features.filter((feature) => (
        feature.type === "laser" || feature.type === "wall"
      ));
    }
    tile.features = tile.features.filter((feature) => feature.type !== "checkpoint");
    tile.features.push({
      type: "checkpoint",
      id: index + 1
    });

    next.set(key, tile);
  });

  return next;
}

function filterStartsForGoals(starts, goals) {
  const goalKeys = new Set((goals || []).map((goal) => `${goal.x},${goal.y}`));
  return (starts || []).filter((start) => !goalKeys.has(`${start.x},${start.y}`));
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
  const dockFrontageLength = getDockFrontageLength(dock);
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
      if (overlapEnd - overlapStart < dockFrontageLength) {
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
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  const boardCount = weightedBoardCount(lengthPreference, maxBoards, hasLargeBoards, preferences);
  let boardIds = [];

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidateBoardIds = selectBoardIdsForCourse(mainBoardIds, boardCount, pieceMap, preferences, guidanceLevel, lengthPreference);
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

function getDockFrontageTiles(dockPlacement, pieceMap) {
  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return [];
  }

  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const frontage = [];

  if (dockPlacement.startFacingOverride === "E") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x + dims.width, y });
    }
  } else if (dockPlacement.startFacingOverride === "W") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x - 1, y });
    }
  } else if (dockPlacement.startFacingOverride === "S") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y + dims.height });
    }
  } else if (dockPlacement.startFacingOverride === "N") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y - 1 });
    }
  }

  return frontage;
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function getRectEdgeSpan(rect, facing) {
  if (facing === "E" || facing === "W") {
    return {
      start: rect.y,
      length: rect.height
    };
  }

  if (facing === "N" || facing === "S") {
    return {
      start: rect.x,
      length: rect.width
    };
  }

  return null;
}

function isAllowedSingleBoardDockAlignment(frontageTiles, rect, facing) {
  const edgeSpan = getRectEdgeSpan(rect, facing);
  if (!edgeSpan || !frontageTiles.length) {
    return false;
  }

  const frontageStart = (facing === "E" || facing === "W")
    ? frontageTiles[0].y
    : frontageTiles[0].x;
  const frontageLength = frontageTiles.length;
  const slack = edgeSpan.length - frontageLength;

  if (slack < 0) {
    return false;
  }

  const allowedStarts = new Set([
    edgeSpan.start,
    edgeSpan.start + slack
  ]);

  if (slack % 2 === 0) {
    allowedStarts.add(edgeSpan.start + slack / 2);
  }

  return allowedStarts.has(frontageStart);
}

function hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement) {
  const frontageTiles = getDockFrontageTiles(dockPlacement, pieceMap);
  if (!frontageTiles.length) {
    return false;
  }

  const boardRects = structuralPlacements.map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const spans = [];

  for (const point of frontageTiles) {
    const rect = boardRects.find((candidate) => pointInRect(point, candidate));
    if (!rect) {
      return false;
    }

    const previous = spans[spans.length - 1];
    if (previous?.index === rect.index) {
      previous.length += 1;
    } else {
      spans.push({ index: rect.index, length: 1 });
    }
  }

  if (spans.length === 1) {
    return isAllowedSingleBoardDockAlignment(frontageTiles, boardRects[spans[0].index], dockPlacement.startFacingOverride);
  }

  if (spans.length !== 2) {
    return false;
  }

  return spans[0].length === spans[1].length;
}

function createDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped, options = {}) {
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
  const dockFrontageLength = getDockFrontageLength(dock);

  for (const run of shuffle(validRuns)) {
    const availableOffsets = run.length - dockFrontageLength;
    const offsets = [];
    for (let offset = 0; offset <= availableOffsets; offset += 1) {
      offsets.push(offset);
    }

    for (const offset of shuffle(offsets)) {
      const dockPlacement = projectDockPlacement(run, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid && (!options.alignedLayout || hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement))) {
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
  const dockDims = rotatedDimensions(dock, dockPlacement.rotation ?? 0);
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

    return [false, true].some((flipped) => {
      const projected = projectDockPlacement(run, 0, dock, flipped);
      if (projected.rotation !== (dockPlacement.rotation ?? 0)) {
        return false;
      }

      if (run.side === "W" || run.side === "E") {
        return projected.x === dockPlacement.x && dockPlacement.y >= projected.y && dockPlacement.y + dockDims.height <= projected.y + run.length;
      }

      return projected.y === dockPlacement.y && dockPlacement.x >= projected.x && dockPlacement.x + dockDims.width <= projected.x + run.length;
    });
  }) ?? null;
}

function analyzeFlagSequence(tileMap, starts, flags, playerCount, options = {}) {
  const firstLeg = analyzeCourse(tileMap, starts, flags[0], {
    maxRoutes: 4,
    flags,
    playerCount,
    recoveryRule: options.recoveryRule,
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
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
      lessDeadlyGame: options.lessDeadlyGame,
      moreDeadlyGame: options.moreDeadlyGame,
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
  const courseAdjustedFirstLeg = adjustStartOutliersForCourseLength(firstLeg, totalLength);

  return {
    starts,
    firstLeg: courseAdjustedFirstLeg,
    legs,
    summary: {
      totalDifficulty: Number(totalDifficulty.toFixed(2)),
      totalLength: Number(totalLength.toFixed(2))
    }
  };
}

function adjustStartOutliersForCourseLength(firstLeg, totalLength) {
  const reachable = firstLeg.starts.filter((item) => item.reachable && item.selectedRoute);
  if (reachable.length < 2) {
    return firstLeg;
  }

  const firstLegLength = firstLeg.summary.lengthScore || 0;
  const safeTotalLength = Math.max(totalLength || 0, firstLegLength || 1);
  const firstLegShare = firstLegLength / safeTotalLength;
  const shortCourseFactor = clamp((160 - safeTotalLength) / 80, 0, 1);
  const longCourseFactor = clamp((safeTotalLength - 190) / 80, 0, 1);
  const firstLegShareFactor = clamp((firstLegShare - 0.24) / 0.34, 0, 1);
  const thresholdScale = clamp(
    1 - shortCourseFactor * 0.18 - firstLegShareFactor * 0.1 + longCourseFactor * 0.1,
    0.78,
    1.08
  );

  const adjustedScores = reachable.map((item) => item.adjustedScore);
  const actions = reachable.map((item) => item.bestActions);
  const scoreMean = adjustedScores.reduce((sum, value) => sum + value, 0) / adjustedScores.length;
  const actionMean = actions.reduce((sum, value) => sum + value, 0) / actions.length;
  const minActions = Math.min(...actions);
  const scoreStdDev = Math.sqrt(adjustedScores.reduce((sum, value) => sum + (value - scoreMean) ** 2, 0) / adjustedScores.length);
  const actionStdDev = Math.sqrt(actions.reduce((sum, value) => sum + (value - actionMean) ** 2, 0) / actions.length);
  const scoreThreshold = Math.max(8, scoreStdDev * 1.6) * thresholdScale;
  const actionThreshold = Math.max(2, actionStdDev * 1.05) * thresholdScale;

  const outliers = reachable
    .filter((item) => {
      const scoreGap = Math.abs(item.adjustedScore - scoreMean);
      const actionGap = item.bestActions - actionMean;
      const minActionGap = item.bestActions - minActions;
      return scoreGap > scoreThreshold || (actionGap > actionThreshold && minActionGap >= 4);
    })
    .map((item) => {
      const scoreGap = Math.abs(item.adjustedScore - scoreMean);
      const actionGap = item.bestActions - actionMean;
      const minActionGap = item.bestActions - minActions;
      return {
        index: item.index,
        score: item.adjustedScore,
        delta: Number((item.adjustedScore - scoreMean).toFixed(2)),
        actionDelta: Number((item.bestActions - actionMean).toFixed(2)),
        reasons: {
          scoreOutlier: scoreGap > scoreThreshold,
          actionOutlier: actionGap > actionThreshold,
          severeActionGap: minActionGap >= 4,
          scoreGap: Number(scoreGap.toFixed(2)),
          scoreThreshold: Number(scoreThreshold.toFixed(2)),
          actionGap: Number(actionGap.toFixed(2)),
          actionThreshold: Number(actionThreshold.toFixed(2)),
          minActionGap: Number(minActionGap.toFixed(2)),
          totalCourseLength: Number(safeTotalLength.toFixed(2)),
          firstLegShare: Number(firstLegShare.toFixed(2)),
          thresholdScale: Number(thresholdScale.toFixed(2))
        }
      };
    });

  return {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      outliers
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

function computePlayerTimeLoad(playerCount = 4) {
  const baseLoad = playerCount * 1.35;
  const tableTalkLoad = Math.max(0, playerCount - 3) * 0.45;
  const coordinationLoad = Math.max(0, playerCount - 4) ** 2 * 0.65;

  return Number((baseLoad + tableTalkLoad + coordinationLoad).toFixed(2));
}

function computeBoardHarshness(boardPlacements = [], pieceMap = {}) {
  const profiles = boardPlacements
    .map((placement) => pieceMap?.[placement.pieceId]?.boardProfile)
    .filter(Boolean);

  if (!profiles.length) {
    return {
      overall: 1.7,
      swinginess: 1.6,
      hazard: 1.6,
      normalized: 0.4
    };
  }

  const totals = profiles.reduce((sum, profile) => ({
    overall: sum.overall + (profile.overall ?? 1.7),
    swinginess: sum.swinginess + (profile.swinginess ?? 1.6),
    hazard: sum.hazard + (profile.bias?.hazard ?? 1.6)
  }), {
    overall: 0,
    swinginess: 0,
    hazard: 0
  });
  const count = profiles.length;
  const overall = totals.overall / count;
  const swinginess = totals.swinginess / count;
  const hazard = totals.hazard / count;
  const normalized = clamp(
    ((overall - 1.35) / 1.55) * 0.5 +
    ((swinginess - 1.25) / 1.65) * 0.3 +
    ((hazard - 1.25) / 1.65) * 0.2,
    0,
    1
  );

  return {
    overall: Number(overall.toFixed(2)),
    swinginess: Number(swinginess.toFixed(2)),
    hazard: Number(hazard.toFixed(2)),
    normalized: Number(normalized.toFixed(3))
  };
}

function applyVariantDifficultyModifiers(raw, preferences = {}, boardHarshness = null) {
  let adjusted = raw;
  const harshness = boardHarshness ?? computeBoardHarshness();

  if (preferences.lighterGame) {
    adjusted *= 0.96;
  }
  if (preferences.lessForeshadowing) {
    adjusted *= 1.1;
  }
  if (preferences.classicSharedDeck) {
    adjusted *= 1.11 + harshness.normalized * 0.11;
  }

  return Number(adjusted.toFixed(2));
}

function computeLengthMetrics(sequence, flagCount, playerCount, boardCount, preferences = {}, boardHarshness = null) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const totalRouteDistance = first.lengthScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);
  const totalActionLoad = first.actionScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteActions || 0), 0);
  const totalCongestion = first.averageTrafficPenalty + later.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0);
  const checkpointLoad = flagCount * 2.2;
  const playerLoad = computePlayerTimeLoad(playerCount || 4);
  const actionLoad = totalActionLoad * 2.8;
  const distanceLoad = totalRouteDistance * 0.75;
  const congestionLoad = totalCongestion * 0.12;
  const flagAreaLoad = first.flagAreaScore * 0.08;
  const difficultyLoad = sequence.summary.totalDifficulty * 0.03;
  const routeLoad = actionLoad + distanceLoad;
  const frictionLoad = congestionLoad + flagAreaLoad + difficultyLoad;
  const harshness = boardHarshness ?? computeBoardHarshness();
  let raw = Number((checkpointLoad + playerLoad + routeLoad + frictionLoad).toFixed(2));

  if (preferences.lighterGame) {
    raw = Number((raw * 0.89).toFixed(2));
  }
  if (preferences.lessForeshadowing) {
    raw = Number((raw * 1.04).toFixed(2));
  }
  if (preferences.classicSharedDeck) {
    raw = Number((raw * (1.03 + harshness.normalized * 0.05)).toFixed(2));
  }

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
  if (band === "any") {
    return 0;
  }
  const [low, high] = thresholds[band];
  if (value < low) return low - value;
  if (value >= high) return value - high;
  return 0;
}

function classifyCandidate(sequence, preferences, context = {}) {
  const usableStarts = computeUsableStarts(sequence.firstLeg);
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const difficultyRaw = applyVariantDifficultyModifiers(computeDifficultyRaw(sequence), preferences, boardHarshness);
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    preferences,
    boardHarshness
  );
  const lengthRaw = lengthMetrics.raw;
  const fairnessStdDev = sequence.firstLeg.summary.scoreStdDev;

  const difficultyThresholds = getDifficultyThresholds();
  const lengthThresholds = getLengthThresholds();

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
  const difficultyDirection = preferences.difficulty === "any"
    ? "matched"
    : difficultyRaw < difficultyThresholds[preferences.difficulty][0]
      ? "low"
      : difficultyRaw >= difficultyThresholds[preferences.difficulty][1]
        ? "high"
        : "matched";
  const lengthDirection = preferences.length === "any"
    ? "matched"
    : lengthRaw < lengthThresholds[preferences.length][0]
      ? "low"
      : lengthRaw >= lengthThresholds[preferences.length][1]
        ? "high"
        : "matched";
  const fairnessPenalty = fairnessStdDev >= 14 ? fairnessStdDev - 14 : 0;
  const fitScore = difficultyFit * 1.2 + lengthFit + fairnessPenalty * 0.5 + Math.max(0, preferences.playerCount - usableStarts.length) * 20;

  return {
    usableStarts,
    difficultyRaw,
    lengthRaw,
    difficultyFit,
    difficultyDirection,
    lengthMetrics,
    lengthFit,
    lengthDirection,
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
  const outlierReasonByIndex = new Map((summary.outliers || []).map((item) => [item.index, item.reasons ?? null]));

  function formatOutlierReasons(reasons) {
    if (!reasons) {
      return "reason unavailable";
    }

    const parts = [];
    if (reasons.scoreOutlier) {
      parts.push(`score gap ${reasons.scoreGap} > ${reasons.scoreThreshold}`);
    }
    if (reasons.actionOutlier && reasons.severeActionGap) {
      parts.push(`actions gap ${reasons.actionGap} > ${reasons.actionThreshold} and best-gap ${reasons.minActionGap} >= 3`);
    }

    return parts.join("; ") || "reason unavailable";
  }

  const lines = [
    `Requested: ${scenario.preferences.playerCount} players, ${formatDifficultyLabel(scenario.preferences.difficulty)} difficulty, ${formatLengthLabel(scenario.preferences.length)} length`,
    `Layout mode: ${scenario.preferences.alignedLayout ? "aligned" : "freeform"}`,
    `Sets: ${[...getSelectedExpansionIds(scenario.preferences)].map((id) => formatExpansionName(id)).join(", ") || "none"}`,
    `Allowed variants: ${describeAllowedVariants(scenario.preferences)}`,
    `Variant complexity: ${scenario.variantComplexityUsed ?? 0}/${scenario.variantComplexityBudget ?? 0}`,
    `Recovery used: ${scenario.recoveryRule}`,
    `A Lighter Game used: ${scenario.lighterGame ? "yes" : "no"}`,
    `A Less Deadly Game used: ${scenario.lessDeadlyGame ? "yes" : "no"}`,
    `A More Deadly Game used: ${scenario.moreDeadlyGame ? "yes" : "no"}`,
    `Shared Deck used: ${scenario.classicSharedDeck ? "yes" : "no"}`,
    `Hazardous Flags used: ${scenario.hazardousFlags ? "yes" : "no"}`,
    `Less Foreshadowing used: ${scenario.lessForeshadowing ? "yes" : "no"}`,
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
      ? `Outlier starts: ${summary.outliers.map((item) => `#${item.index + 1} (${item.delta > 0 ? "+" : ""}${item.delta}; ${formatOutlierReasons(item.reasons)})`).join(", ")}`
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
    const outlierReason = usable === "outlier"
      ? ` reason ${formatOutlierReasons(outlierReasonByIndex.get(startAnalysis.index))}`
      : "";
    lines.push(
      `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) route ${startAnalysis.selectedRouteIndex + 1}/${startAnalysis.routes.length} adjusted ${startAnalysis.adjustedScore} raw ${selected.score} traffic ${startAnalysis.trafficPenalty} overlapRaw ${startAnalysis.overlapPenalty} distance ${selected.distance} actions ${selected.actions} forced ${selected.forcedDistance} hazard ${selected.hazard}${outlierReason}`
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

function openAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.showModal || dialog.open) {
    return;
  }
  closeVariantPicker();
  dialog.showModal();
}

function closeAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.open) {
    return;
  }
  dialog.close();
}

function isDevViewEnabled() {
  return document.getElementById("dev-view")?.checked ?? true;
}

function isBoardAuditEnabled() {
  return document.getElementById("board-audit-toggle")?.checked ?? false;
}

function updateDevView() {
  const enabled = isDevViewEnabled();
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
  document.getElementById("board-audit-toggle-label")?.classList.toggle("hidden", !enabled);
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
    starts: scenario.activeStarts,
    rebootTokens: scenario.rebootTokens,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    edgeOutlineColor: scenario.lessDeadlyGame ? "#f2c230" : null,
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
  const availableDockIds = getEligibleDockIds(assets.pieceMap, expansionIds, preferences);
  if (!availableDockIds.length) {
    return "The selected sets contain no docking bay. Enable a set with a docking bay to generate a course.";
  }

  const availableMainBoardIds = getAvailableMainBoardIds(assets.pieceMap, expansionIds);
  if (!availableMainBoardIds.length) {
    return "The selected sets contain no supported main boards for course generation yet.";
  }

  return null;
}

function getFlagRetryBudget(preferences = {}, remainingEvaluations = 1) {
  const difficulty = preferences.difficulty ?? "moderate";
  const lengthPreference = preferences.length ?? "moderate";
  const table = {
    easy: { short: 3, moderate: 6, long: 7 },
    moderate: { short: 2, moderate: 4, long: 5 },
    hard: { short: 1, moderate: 2, long: 3 }
  };
  const retries = table[difficulty]?.[lengthPreference] ?? table.moderate.moderate;
  return Math.max(1, Math.min(remainingEvaluations, retries));
}

function getFlagRetryStallLimit(preferences = {}) {
  const difficulty = preferences.difficulty ?? "moderate";
  const lengthPreference = preferences.length ?? "moderate";

  if (difficulty === "easy" && lengthPreference !== "short") {
    return 3;
  }

  if (difficulty === "hard") {
    return 2;
  }

  return lengthPreference === "long" ? 3 : 2;
}

async function createRandomCandidate(assets, preferences, attempt = 1, remainingEvaluations = 1, onEvaluation = null) {
  const { pieceMap } = assets;
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(pieceMap, expansionIds, preferences);
  const variantBundle = chooseVariantBundle(preferences);
  const {
    recoveryRule,
    lessDeadlyGame,
    moreDeadlyGame,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    lessForeshadowing,
    variantComplexityBudget,
    variantComplexityUsed
  } = variantBundle;
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const orderedDockIds = weightedOrder(
    availableDockIds,
    (dockId) => getDockSelectionWeight(pieceMap[dockId], preferences)
  );
  let boardLayout = null;
  let dockLayout = null;
  let dockPieceId = null;
  let dockFlipped = false;

  for (const candidateDockId of orderedDockIds) {
    const candidateBoardLayout = createBoardPlacements(pieceMap, preferences.length, preferences, guidanceLevel, expansionIds, candidateDockId);
    if (!candidateBoardLayout) {
      continue;
    }

    const flipOrder = shuffle([false, true]);
    let candidateDockLayout = null;
    let candidateDockFlipped = false;

    for (const candidateFlip of flipOrder) {
      candidateDockLayout = createDockPlacement(candidateBoardLayout.placements, pieceMap, candidateDockId, candidateFlip, {
        alignedLayout: preferences.alignedLayout
      });
      if (candidateDockLayout) {
        candidateDockFlipped = candidateFlip;
        break;
      }
    }

    if (!candidateDockLayout) {
      continue;
    }

    dockPieceId = candidateDockId;
    dockFlipped = candidateDockFlipped;
    boardLayout = candidateBoardLayout;
    dockLayout = candidateDockLayout;
    break;
  }

  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
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
  const retryBudget = getFlagRetryBudget(preferences, remainingEvaluations);
  const stallLimit = getFlagRetryStallLimit(preferences);
  let evaluationsUsed = 0;
  let bestScenario = null;
  let staleRetries = 0;

  for (let retry = 0; retry < retryBudget; retry += 1) {
    evaluationsUsed += 1;
    if (onEvaluation) {
      await onEvaluation(evaluationsUsed, retryBudget);
    }
    const checkpoints = pickFlags(
      flagCandidates,
      flagCount,
      boardLayout.placements,
      dockLayout.dockPlacement,
      pieceMap,
      starts,
      { ...preferences, hazardousFlags },
      guidanceLevel
    );

    if (!checkpoints) {
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) {
        break;
      }
      continue;
    }

    const rebootTokens = recoveryRule === "reboot_tokens"
      ? placeRebootTokens(boardRects, pieceMap, tileMap, checkpoints, preferences.playerCount)
      : [];
    const goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags });
    const activeStarts = filterStartsForGoals(starts, checkpoints);
    const sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, preferences.playerCount, {
      recoveryRule,
      lessDeadlyGame,
      moreDeadlyGame,
      lighterGame,
      hazardousFlags,
      lessForeshadowing,
      rebootTokens,
      boardRects
    });
    const metrics = classifyCandidate(sequence, {
      ...preferences,
      flagCount,
      classicSharedDeck,
      hazardousFlags,
      lighterGame,
      lessForeshadowing
    }, {
      boardPlacements: boardLayout.placements,
      pieceMap,
      checkpoints
    });
    const scenario = {
      pieceMap: assets.pieceMap,
      imageMap: assets.imageMap,
      placements,
      overlayPlacements,
      checkpoints,
      rebootTokens,
      goalTileMap,
      activeStarts,
      playerCount: preferences.playerCount,
      recoveryRule,
      lessDeadlyGame,
      moreDeadlyGame,
      lighterGame,
      classicSharedDeck,
      hazardousFlags,
      lessForeshadowing,
      variantComplexityBudget,
      variantComplexityUsed,
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
        flagCount,
        classicSharedDeck,
        hazardousFlags
      }
    };

    if (!bestScenario || scenario.metrics.fitScore < bestScenario.metrics.fitScore) {
      bestScenario = scenario;
      staleRetries = 0;
    } else {
      staleRetries += 1;
    }

    if (scenario.metrics.acceptable || (retry > 0 && staleRetries >= stallLimit)) {
      break;
    }
  }

  return {
    scenario: bestScenario,
    evaluationsUsed: Math.max(1, evaluationsUsed)
  };
}

function serializeScenario(scenario) {
  return {
    preferences: scenario.preferences,
    recoveryRule: scenario.recoveryRule,
    lessDeadlyGame: scenario.lessDeadlyGame,
    moreDeadlyGame: scenario.moreDeadlyGame,
    lighterGame: scenario.lighterGame,
    classicSharedDeck: scenario.classicSharedDeck,
    hazardousFlags: scenario.hazardousFlags,
    lessForeshadowing: scenario.lessForeshadowing,
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
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const moreDeadlyGame = Boolean(snapshot.moreDeadlyGame);
  const lighterGame = Boolean(snapshot.lighterGame);
  const classicSharedDeck = Boolean(snapshot.classicSharedDeck);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const lessForeshadowing = Boolean(snapshot.lessForeshadowing);
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
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags });
  const activeStarts = filterStartsForGoals(starts, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, snapshot.preferences.playerCount, {
    recoveryRule,
    lessDeadlyGame,
    moreDeadlyGame,
    lighterGame,
    hazardousFlags,
    lessForeshadowing,
    rebootTokens,
    boardRects
  });
  const metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    recoveryRule,
    flagCount: checkpoints.length,
    classicSharedDeck,
    hazardousFlags,
    lighterGame,
    lessForeshadowing
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
    activeStarts,
    playerCount: snapshot.preferences.playerCount,
    recoveryRule,
    lessDeadlyGame,
    moreDeadlyGame,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    lessForeshadowing,
    variantComplexityBudget: 0,
    variantComplexityUsed: 0,
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
      flagCount: checkpoints.length,
      classicSharedDeck,
      hazardousFlags
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
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    const remainingAttempts = MAX_ATTEMPTS - attempt;
    const attemptLabel = attempt + 1;
    let result;
    try {
      result = await createRandomCandidate(
        assets,
        preferences,
        attemptLabel,
        remainingAttempts,
        async (localEvaluations) => {
          const visibleAttempt = Math.min(MAX_ATTEMPTS, attempt + localEvaluations);
          setGeneratingOverlay(
            true,
            `Attempt ${visibleAttempt} of ${MAX_ATTEMPTS}: still looking for a ${formatLengthLabel(preferences.length)} ${formatDifficultyLabel(preferences.difficulty)} setup with ${preferences.playerCount} usable starts.`
          );
          await nextFrame();
        }
      );
    } catch (error) {
      crashedAttempts += 1;
      lastAttemptError = error;
      attempt += 1;
      console.warn(`Attempt ${attemptLabel} failed during generation`, error);
      continue;
    }

    attempt += Math.max(1, result.evaluationsUsed ?? 1);
    const scenario = result.scenario;
    if (!scenario) {
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

document.getElementById("about-button").addEventListener("click", () => {
  openAboutDialog();
});

document.getElementById("about-close-icon").addEventListener("click", () => {
  closeAboutDialog();
});

document.getElementById("about-close-button").addEventListener("click", () => {
  closeAboutDialog();
});

document.getElementById("about-dialog").addEventListener("click", (event) => {
  const dialog = event.currentTarget;
  if (event.target === dialog) {
    closeAboutDialog();
  }
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

document.getElementById("board-audit-toggle").addEventListener("change", () => {
  updateBoardAuditVisibility();
});

document.getElementById("variant-dynamic-archiving").addEventListener("click", () => {
  cycleVariantControlState("dynamicArchiving");
});

document.getElementById("variant-hazardous-flags").addEventListener("click", () => {
  cycleVariantControlState("hazardousFlags");
});

document.getElementById("variant-less-deadly-game").addEventListener("click", () => {
  cycleVariantControlState("lessDeadlyGame");
});

document.getElementById("variant-more-deadly-game").addEventListener("click", () => {
  cycleVariantControlState("moreDeadlyGame");
});

document.getElementById("variant-classic-shared-deck").addEventListener("click", () => {
  cycleVariantControlState("classicSharedDeck");
});

document.getElementById("variant-lighter-game").addEventListener("click", () => {
  cycleVariantControlState("lighterGame");
});

document.getElementById("variant-less-foreshadowing").addEventListener("click", () => {
  cycleVariantControlState("lessForeshadowing");
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
  document.querySelectorAll(".variant-picker").forEach((picker) => {
    if (!picker.contains(event.target)) {
      picker.removeAttribute("open");
    }
  });
});

document.addEventListener("focusin", (event) => {
  document.querySelectorAll(".variant-picker").forEach((picker) => {
    if (!picker.contains(event.target)) {
      picker.removeAttribute("open");
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAboutDialog();
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
