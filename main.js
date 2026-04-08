const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { render },
  { analyzeCourse, analyzeFlagLeg, analyzeGoalApproaches, scoreFlagArea },
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
  },
  {
    BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS,
    BOARD_PROFILE_DENSITY_WEIGHT,
    getBoardProfileDelta,
    getTilePenaltyForFeature
  }
] = await Promise.all([
  import(versionedPath("./render.js")),
  import(versionedPath("./analyze.js")),
  import(versionedPath("./board.js")),
  import(versionedPath("./feature-weights.js"))
]);

const ROTATIONS = [0, 90, 180, 270];
const FACINGS = ["N", "E", "S", "W"];
const DOCK_SIDES = ["left", "top", "right", "bottom"];
const CARDINAL_DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};
const LASER_BUNDLE_DEFINITIONS = [
  {
    startPhysicalId: "mb-tile-12",
    midPhysicalId: "mb-tile-11",
    endPhysicalId: "mb-tile-13",
    startId: "mb-tile-12a",
    midId: "mb-tile-11b",
    endId: "mb-tile-13a"
  },
  {
    startPhysicalId: "mb-tile-5",
    midPhysicalId: "mb-tile-4",
    endPhysicalId: "mb-tile-8",
    startId: "mb-tile-5b",
    midId: "mb-tile-4b",
    endId: "mb-tile-8b"
  }
];
const OPPOSITE_DIRS = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};
const MAX_ATTEMPTS = 40;
const DIAGNOSTIC_ATTEMPTS = 24;
const DIAGNOSTIC_PLAYER_COUNTS = [2, 4, 6];
const DIAGNOSTIC_DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
const DIAGNOSTIC_LENGTHS = ["short", "moderate", "long"];
const MIN_LENGTH_RAW = 28;
const MIN_SHARED_EDGE = 5;
const DOCK_BRIDGE_GAP = 3;
const MAX_DOCK_COUNT = 2;
const OVERLAY_UPDATE_INTERVAL = 4;
const BOARD_SELECTION_FALLBACK_ATTEMPT = 12;
const BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD = 0.16;
const BOARD_PROFILE_HAZARD_DENSITY_WEIGHT = 2.4;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
const BOARD_AUDIT_NOTES_KEY = "roborally-course-generator:board-audit-notes";
const VARIANT_COMPLEXITY = {
  actFast: 1,
  lighterGame: 1,
  lessSpammyGame: 1,
  lessDeadlyGame: 1,
  moreDeadlyGame: 1,
  classicSharedDeck: 3,
  dynamicArchiving: 1,
  hazardousFlags: 2,
  movingTargets: 2,
  lessForeshadowing: 1,
  extraDocks: 0,
  factoryRejects: 1,
  competitiveMode: 0,
  staggeredBoards: 0
};
const AUDIT_RENDER_TILE_SIZE = 40;
const AUDIT_RENDER_MARGIN = 30;
const BOARD_VIEW_MODES = {
  photos: "photos",
  icons: "icons"
};
const AUDIT_FEATURE_TYPES = [
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
  { id: "ramp", label: "Ramps" },
  { id: "repulsor", label: "Repulsor Fields" },
  { id: "start", label: "Starts" },
  { id: "teleporter", label: "Teleporters" },
  { id: "trapdoor", label: "Trapdoors" },
  { id: "wall", label: "Walls" },
  { id: "water", label: "Water" }
].sort((left, right) => left.label.localeCompare(right.label));
const PIECE_DATA_FILES = [
  "30th-docking-bay-a",
  "30th-docking-bay-b",
  "all-roads",
  "assembly",
  "black-gold",
  "blueprint",
  "cactus",
  "circles",
  "circuit-trap",
  "coliseum",
  "coming-and-going",
  "convergence",
  "docking-bay-a",
  "docking-bay-b",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "in-and-out",
  "chasm",
  "gear-box",
  "labyrinth",
  "laser-maze",
  "links",
  "locked",
  "mergers",
  "mb-docking-bay-a",
  "mb-docking-bay-b",
  "mb-tile-1a",
  "mb-tile-1b",
  "mb-tile-2a",
  "mb-tile-2b",
  "mb-tile-3a",
  "mb-tile-3b",
  "mb-tile-4a",
  "mb-tile-4b",
  "mb-tile-5a",
  "mb-tile-5b",
  "mb-tile-6a",
  "mb-tile-6b",
  "mb-tile-7a",
  "mb-tile-7b",
  "mb-tile-8a",
  "mb-tile-8b",
  "mb-tile-9a",
  "mb-tile-9b",
  "mb-tile-10a",
  "mb-tile-10b",
  "mb-tile-11a",
  "mb-tile-11b",
  "mb-tile-12a",
  "mb-tile-12b",
  "mb-tile-13a",
  "mb-tile-13b",
  "mb-tile-14a",
  "mb-tile-14b",
  "mb-tile-15a",
  "mb-tile-15b",
  "mb-tile-16a",
  "mb-tile-16b",
  "mb-tile-17a",
  "mb-tile-17b",
  "misdirection",
  "portal-palace",
  "pushy",
  "sidewinder",
  "steps",
  "stop-and-go",
  "straight-a-ways",
  "tabula-rasa",
  "tempest",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-wave",
  "the-x",
  "the-zone",
  "transition",
  "trench-run",
  "vacancy",
  "water-park",
  "winding",
  "whirlpool"
];
const VARIANT_STATES = {
  off: { label: "Not allowed", shortLabel: "No" },
  allowed: { label: "Allowed", shortLabel: "Yes" },
  forced: { label: "Always on", shortLabel: "Must" }
};
const VARIANT_DEFINITIONS = [
  {
    id: "actFast",
    label: "Act Fast",
    controlId: "variant-act-fast",
    defaultState: "off",
    description: "Programming is timed.",
    cost: VARIANT_COMPLEXITY.actFast
  },
  {
    id: "lighterGame",
    label: "A Lighter Game",
    controlId: "variant-lighter-game",
    defaultState: "off",
    description: "Removes upgrade cards and makes battery spaces inactive.",
    cost: VARIANT_COMPLEXITY.lighterGame
  },
  {
    id: "lessSpammyGame",
    label: "A Less SPAM-Y Game",
    controlId: "variant-less-spammy-game",
    defaultState: "off",
    description: "Discard all SPAM cards from hand to your discard pile at the end of programming phase.",
    cost: VARIANT_COMPLEXITY.lessSpammyGame
  },
  {
    id: "lessDeadlyGame",
    label: "A Less Deadly Game",
    controlId: "variant-less-deadly-game",
    defaultState: "off",
    description: "Treats board edges as walls while pit spaces remain pits.",
    cost: VARIANT_COMPLEXITY.lessDeadlyGame
  },
  {
    id: "moreDeadlyGame",
    label: "A More Deadly Game",
    controlId: "variant-more-deadly-game",
    defaultState: "off",
    description: "Rebooting deals 3 damage instead of 2.",
    cost: VARIANT_COMPLEXITY.moreDeadlyGame
  },
  {
    id: "dynamicArchiving",
    label: "Dynamic Archiving",
    controlId: "variant-dynamic-archiving",
    defaultState: "allowed",
    description: "Robots archive when they end a register on a checkpoint or battery space.",
    cost: VARIANT_COMPLEXITY.dynamicArchiving
  },
  {
    id: "hazardousFlags",
    label: "Hazardous Flags",
    controlId: "variant-hazardous-flags",
    defaultState: "off",
    description: "Board elements under checkpoints stay active without moving the checkpoints.",
    cost: VARIANT_COMPLEXITY.hazardousFlags
  },
  {
    id: "movingTargets",
    label: "Moving Targets",
    controlId: "variant-moving-targets",
    defaultState: "off",
    description: "Checkpoints on conveyors are treated as moving targets for generation heuristics.",
    cost: VARIANT_COMPLEXITY.movingTargets
  },
  {
    id: "extraDocks",
    label: "Extra Docks",
    controlId: "variant-extra-docks",
    defaultState: "off",
    description: "Adds an extra docking bay if the selected sets have one and the layout has room.",
    cost: VARIANT_COMPLEXITY.extraDocks,
    stateLabels: {
      off: { label: "No", shortLabel: "No" },
      allowed: { label: "Yes", shortLabel: "Yes" },
      forced: { label: "Must", shortLabel: "Must" }
    }
  },
  {
    id: "factoryRejects",
    label: "Factory Rejects",
    controlId: "variant-factory-rejects",
    defaultState: "off",
    description: "Hand size is 7 instead of 9 (Altered from previous Robo Rally editions).",
    cost: VARIANT_COMPLEXITY.factoryRejects
  },
  {
    id: "lessForeshadowing",
    label: "Less Foreshadowing",
    controlId: "variant-less-foreshadowing",
    defaultState: "off",
    description: "Decks reshuffle every turn, reducing card-draw consistency.",
    cost: VARIANT_COMPLEXITY.lessForeshadowing
  },
  {
    id: "classicSharedDeck",
    label: "Shared Deck",
    controlId: "variant-classic-shared-deck",
    defaultState: "off",
    description: "Players share one combined programming deck and spam cards go to hand.",
    cost: VARIANT_COMPLEXITY.classicSharedDeck
  },
  {
    id: "competitiveMode",
    label: "Competitive Mode",
    controlId: "variant-competitive-mode",
    defaultState: "off",
    description: "Before the game, players block starting spaces with energy cubes before choosing from the remaining starts.",
    cost: VARIANT_COMPLEXITY.competitiveMode
  },
  {
    id: "staggeredBoards",
    label: "Staggered Boards",
    controlId: "variant-staggered-boards",
    defaultState: "off",
    description: "Allows the main boards to be offset instead of forming a straight aligned block.",
    cost: VARIANT_COMPLEXITY.staggeredBoards,
    stateLabels: {
      off: { label: "Aligned", shortLabel: "Aligned" },
      allowed: { label: "Random", shortLabel: "Random" },
      forced: { label: "Staggered", shortLabel: "Offset" }
    }
  }
].sort((left, right) => left.label.localeCompare(right.label));
const VARIANT_CONTROL_IDS = Object.fromEntries(
  VARIANT_DEFINITIONS.map((variant) => [variant.id, variant.controlId])
);

const DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES = new Set(["wall", "laser", "flamethrower"]);

function isCheckpointActiveFeature(feature, options = {}) {
  if (DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES.has(feature?.type)) {
    return true;
  }

  return Boolean(options.movingTargets && feature?.type === "belt");
}

let currentScenario = null;
let cachedAssets = null;
let scenarioAnimationFrameId = null;
let boardAuditInitialized = false;
let boardAuditState = {
  pieceId: null,
  hoverTile: null,
  selectedFeatures: new Set(AUDIT_FEATURE_TYPES.map((feature) => feature.id))
};
let courseExplanationState = {
  scenarioRef: null,
  manualOpen: null
};
let lastRenderDiagnostics = {
  blankFallbackTriggered: false
};

function renderVariantControls() {
  const menuEl = document.getElementById("variant-rules-menu");
  if (!menuEl) {
    return;
  }

  menuEl.replaceChildren();
  const items = VARIANT_DEFINITIONS.map((variant) => {
    const rowEl = document.createElement("div");
    rowEl.className = "variant-rule";
    rowEl.title = variant.description;

    const nameEl = document.createElement("div");
    nameEl.className = "variant-rule-name";
    nameEl.textContent = variant.label;

    const buttonEl = document.createElement("button");
    buttonEl.id = variant.controlId;
    buttonEl.className = "variant-state";
    buttonEl.type = "button";
    buttonEl.dataset.variantId = variant.id;

    rowEl.append(nameEl, buttonEl);
    setVariantControlState(variant.id, variant.defaultState, buttonEl);
    return rowEl;
  });
  menuEl.append(...items);
}

function getVariantDefinitionLabel(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.label ?? variantId;
}

function getVariantDefinition(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId) ?? null;
}

function getVariantStateCopy(variantId, state) {
  const normalized = normalizeVariantState(state);
  return getVariantDefinition(variantId)?.stateLabels?.[normalized] ?? VARIANT_STATES[normalized];
}

function getVariantPreferenceState(preferences = {}, variantId) {
  const directState = preferences.allowedVariantRules?.[variantId];
  if (directState !== undefined) {
    return normalizeVariantState(directState);
  }

  if (variantId === "staggeredBoards" && typeof preferences.alignedLayout === "boolean") {
    return preferences.alignedLayout ? "off" : "forced";
  }

  return normalizeVariantState(
    VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.defaultState ?? "off"
  );
}

function getExtraDockModeState(preferences = {}) {
  if (preferences.extraDocks === true) {
    return "forced";
  }
  if (preferences.extraDocks === false) {
    return "off";
  }
  return getVariantPreferenceState(preferences, "extraDocks");
}

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
    piece.overlayCapable = piece.expansionId === "master-builder" && (
      piece.kind === "overlay" ||
      (piece.width === 6 && piece.height === 6)
    );
  }

  for (const piece of Object.values(pieceMap)) {
    piece.boardProfile = deriveBoardProfile(piece);
    piece.derivedBias = piece.boardProfile.bias;
  }

  const imageMap = {};
  for (const piece of Object.values(pieceMap)) {
    if (piece.image) {
      try {
        imageMap[piece.id] = await loadImage(piece.image);
      } catch (error) {
        console.warn(`Unable to load piece image for ${piece.id}: ${piece.image}`, error);
      }
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

function getGraphDiameter(graph) {
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

function isSingleSmallBoardCourseAllowed(preferences = {}) {
  return (preferences.difficulty ?? "moderate") === "easy" && (preferences.length ?? "moderate") === "short";
}

function isSmallBoardLayoutAcceptable(boardPlacements, pieceMap, layoutValidation, preferences = {}) {
  const smallBoardPlacements = boardPlacements.filter((placement) => pieceMap[placement.pieceId]?.kind === "small");
  const allSmallBoards = smallBoardPlacements.length === boardPlacements.length && boardPlacements.length > 0;
  const lengthPreference = preferences.length ?? "moderate";

  if (!allSmallBoards) {
    return true;
  }

  if (boardPlacements.length === 1) {
    return isSingleSmallBoardCourseAllowed(preferences);
  }

  if (lengthPreference === "long" && boardPlacements.length < 4) {
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
    hard: "advanced",
    brutal: "expert"
  };

  return labels[difficultyPreference] ?? String(difficultyPreference ?? "intermediate");
}

function getTuningDifficulty(difficultyPreference) {
  return difficultyPreference === "brutal" ? "hard" : (difficultyPreference ?? "moderate");
}

function formatOverlaySearchTarget(preferences = {}) {
  const parts = [];
  const lengthLabel = formatLengthLabel(preferences.length);
  const difficultyLabel = formatDifficultyLabel(preferences.difficulty);

  if (preferences.length && preferences.length !== "any") {
    parts.push(lengthLabel);
  }
  if (preferences.difficulty && preferences.difficulty !== "any") {
    parts.push(difficultyLabel);
  }

  if (!parts.length) {
    return `a setup with ${preferences.playerCount} usable starts`;
  }

  return `a ${parts.join(" ")} setup with ${preferences.playerCount} usable starts`;
}

function getSelectedExpansionIds(preferences = {}) {
  const selected = preferences.selectedExpansions ?? { roborally: true };
  return new Set(Object.entries(selected)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([expansionId]) => expansionId));
}

function formatExpansionName(expansionId) {
  const labels = {
    roborally: "Robo Rally (2023)",
    "30th-anniversary": "Robo Rally: 30th Anniversary",
    "thrills-and-spills": "Thrills & Spills",
    "master-builder": "Master Builder",
    "wet-and-wild": "Wet & Wild",
    "chaos-and-carnage": "Chaos & Carnage"
  };

  return labels[expansionId] ?? titleCaseWords(expansionId);
}

function getDifficultyThresholds() {
  return {
    easy: [0, 95],
    moderate: [90, 155],
    hard: [150, Infinity],
    brutal: [150, Infinity]
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
    case "chopShop":
      return "chop shop";
    case "belt":
      return `conveyor ${feature.dir ?? "?"}${feature.speed ? ` speed ${feature.speed}` : ""}${feature.turn ? ` turn ${feature.turn}` : ""}`;
    case "gear":
      return `gear ${feature.rotation ?? "?"}`;
    case "laser":
      return `laser ${feature.dir ?? "?"} dmg ${feature.damage ?? 1}`;
    case "trapdoor":
      return `trapdoor [${(feature.timing || []).join(", ")}]`;
    case "wall":
      return `wall ${((feature.sides || []).join(", ")) || "?"}`;
    case "repulsor":
      return `repulsor ${((feature.sides || []).join(", ")) || "?"}`;
    case "push":
    case "flamethrower":
      return `${feature.type} ${feature.dir ?? "?"} [${(feature.timing || []).join(", ")}]`;
    case "crusher":
      return `crusher [${(feature.timing || []).join(", ")}]`;
    case "homingMissile":
      return "homing missile";
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

function getFeatureTypeSymbol(featureType) {
  switch (featureType) {
    case "wall":
      return "#";
    case "belt":
      return "=>";
    case "repulsor":
      return "<>";
    case "laser":
      return "L>";
    case "trapdoor":
      return "TD";
    case "pit":
      return "PT";
    case "gear":
      return "GR";
    case "push":
      return "PS";
    case "flamethrower":
      return "FL";
    case "crusher":
      return "CR";
    case "portal":
      return "PO";
    case "teleporter":
      return "TP";
    case "randomizer":
      return "R?";
    case "homingMissile":
      return "HM";
    case "chopShop":
      return "CS";
    case "water":
      return "WA";
    case "oil":
      return "OI";
    case "ledge":
      return "LG";
    case "ramp":
      return "RA";
    case "checkpoint":
      return "F";
    case "battery":
      return "BT";
    case "start":
      return "S>";
    default:
      return featureType.slice(0, 2).toUpperCase();
  }
}

function buildAuditFeatureFilterLabel(feature) {
  const fragment = document.createDocumentFragment();
  const symbol = document.createElement("span");
  symbol.className = "audit-filter-symbol";
  symbol.textContent = getFeatureTypeSymbol(feature.id);
  symbol.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = feature.label;

  fragment.append(symbol, text);
  return fragment;
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
    showBoardLabels: false,
    showStartFacing: true,
    showWalls: true,
    showPieceImages: false,
    showFootprints: false,
    showFeatureIcons: true,
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
  const overlayBoardsRowEl = document.getElementById("setup-overlay-boards-row");
  const overlayBoardsEl = document.getElementById("setup-overlay-boards");
  const overlayTilesRowEl = document.getElementById("setup-overlay-tiles-row");
  const overlayTilesEl = document.getElementById("setup-overlay-tiles");
  const flagsEl = document.getElementById("setup-flags");
  const explanationToggleEl = document.getElementById("course-explanation-toggle");
  const explanationPanelEl = document.getElementById("course-explanation-panel");
  const explanationCopyEl = document.getElementById("course-explanation-copy");

  if (
    !fitNoteEl ||
    !summary ||
    !boardsEl ||
    !overlayBoardsRowEl ||
    !overlayBoardsEl ||
    !overlayTilesRowEl ||
    !overlayTilesEl ||
    !flagsEl ||
    !explanationToggleEl ||
    !explanationPanelEl ||
    !explanationCopyEl
  ) {
    return;
  }

  if (!scenario) {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
    summary.classList.add("hidden");
    boardsEl.textContent = "";
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
    flagsEl.textContent = "";
    explanationCopyEl.innerHTML = "";
    explanationPanelEl.classList.add("hidden");
    explanationToggleEl.setAttribute("aria-expanded", "false");
    courseExplanationState = {
      scenarioRef: null,
      manualOpen: null
    };
    return;
  }

  if (courseExplanationState.scenarioRef !== scenario) {
    courseExplanationState = {
      scenarioRef: scenario,
      manualOpen: null
    };
  }

  const boardLabels = scenario.mainBoardIds.map((pieceId) => (
    formatBoardLabel(pieceId, scenario.pieceMap)
  ));
  const overlayBoardLabels = (scenario.overlayPlacements || [])
    .filter((placement) => !isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  const overlayTileLabels = (scenario.overlayPlacements || [])
    .filter((placement) => isMiniOverlayPiece(scenario.pieceMap[placement.pieceId]))
    .map((placement) => formatBoardLabel(placement.pieceId, scenario.pieceMap));
  boardsEl.textContent = boardLabels.join(", ");
  if (overlayBoardLabels.length) {
    overlayBoardsEl.textContent = overlayBoardLabels.join(", ");
    overlayBoardsRowEl.classList.remove("hidden");
  } else {
    overlayBoardsRowEl.classList.add("hidden");
    overlayBoardsEl.textContent = "";
  }
  if (overlayTileLabels.length) {
    overlayTilesEl.textContent = overlayTileLabels.join(", ");
    overlayTilesRowEl.classList.remove("hidden");
  } else {
    overlayTilesRowEl.classList.add("hidden");
    overlayTilesEl.textContent = "";
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

  const explanationHtml = buildCourseExplanationHtml(scenario, noteParts);
  const autoOpenExplanation = noteParts.length > 0;
  const explanationVisible = courseExplanationState.manualOpen ?? autoOpenExplanation;
  explanationCopyEl.innerHTML = explanationHtml;
  explanationPanelEl.classList.toggle("hidden", !explanationVisible);
  explanationToggleEl.setAttribute("aria-expanded", explanationVisible ? "true" : "false");
  summary.classList.remove("hidden");
}

function describeCourseDifficultyBand(rawDifficulty) {
  const thresholds = getDifficultyThresholds();
  if (rawDifficulty < thresholds.easy[1]) {
    return "easy";
  }
  if (rawDifficulty < thresholds.moderate[1]) {
    return "moderate";
  }
  return "hard";
}

function describeCourseLengthBand(rawLength) {
  const thresholds = getLengthThresholds();
  if (rawLength < thresholds.short[1]) {
    return "short";
  }
  if (rawLength < thresholds.moderate[1]) {
    return "moderate";
  }
  return "long";
}

function describeCourseDifficultyText(rawDifficulty) {
  return {
    easy: "on the easier side",
    moderate: "moderate",
    hard: "on the hard side"
  }[describeCourseDifficultyBand(rawDifficulty)] ?? "moderate";
}

function describeCourseLengthText(rawLength) {
  return {
    short: "short",
    moderate: "medium-length",
    long: "long"
  }[describeCourseLengthBand(rawLength)] ?? "medium-length";
}

function describeDifficultyLead(scenario) {
  if (scenario.preferences.difficulty !== "any" && scenario.metrics.difficultyDirection !== "matched") {
    return scenario.metrics.difficultyDirection === "low"
      ? "The course comes out easier than requested"
      : "The course comes out harder than requested";
  }

  return `The course plays ${describeCourseDifficultyText(scenario.metrics.difficultyRaw)}`;
}

function describeLengthLead(scenario) {
  if (scenario.preferences.length !== "any" && scenario.metrics.lengthDirection !== "matched") {
    return scenario.metrics.lengthDirection === "low"
      ? "The course comes out shorter than requested"
      : "The course comes out longer than requested";
  }

  return `The course plays ${describeCourseLengthText(scenario.metrics.lengthRaw)}`;
}

function formatContributionLabel(id) {
  switch (id) {
    case "checkpointLoad":
      return "it uses many checkpoints";
    case "playerLoad":
      return "the player count adds turn overhead";
    case "actionLoad":
      return "routes need a lot of programmed actions";
    case "distanceLoad":
      return "checkpoints are spaced far apart";
    case "congestionLoad":
      return "traffic and blocking slow things down";
    case "flagAreaLoad":
      return "checkpoint areas are busy and awkward";
    case "movingTargetLoad":
      return "moving targets keep players repositioning";
    default:
      return null;
  }
}

function formatShortLengthReliefLabel(id) {
  switch (id) {
    case "checkpointLoad":
      return "it keeps the checkpoint count down";
    case "playerLoad":
      return "there is limited player overhead";
    case "actionLoad":
      return "routes do not need many programmed actions";
    case "distanceLoad":
      return "checkpoints stay relatively close together";
    case "congestionLoad":
      return "traffic stays fairly manageable";
    case "flagAreaLoad":
      return "checkpoint areas are not too sticky";
    case "movingTargetLoad":
      return "there is little moving-target overhead";
    default:
      return null;
  }
}

function getShortLengthReasons(scenario, contributionEntries, variantReasons = []) {
  const reasons = [];
  const inputs = scenario.metrics.lengthMetrics?.inputs ?? {};
  const contributions = scenario.metrics.lengthMetrics?.contributions ?? {};
  const playerCount = scenario.preferences.playerCount ?? inputs.playerCount ?? 4;
  const checkpointCount = scenario.checkpoints?.length ?? inputs.flagCount ?? 0;

  if (checkpointCount <= 2 || (contributions.checkpointLoad ?? 0) <= 4.4) {
    reasons.push("it keeps the checkpoint count down");
  }
  if (playerCount <= 4 || (contributions.playerLoad ?? 0) <= computePlayerTimeLoad(4)) {
    reasons.push("there is limited player overhead");
  }
  if ((contributions.actionLoad ?? 0) <= 28 || (inputs.totalActionLoad ?? 0) <= 10) {
    reasons.push("routes do not need many programmed actions");
  }
  if ((contributions.distanceLoad ?? 0) <= 12 || (inputs.totalRouteDistance ?? 0) <= 16) {
    reasons.push("checkpoints stay relatively close together");
  }
  if ((contributions.congestionLoad ?? 0) <= 1.6 || (inputs.totalCongestion ?? 0) <= 13) {
    reasons.push("traffic stays fairly manageable");
  }
  if ((contributions.flagAreaLoad ?? 0) <= 1.5 || (inputs.flagAreaScore ?? 0) <= 18) {
    reasons.push("checkpoint areas are not too sticky");
  }
  if (!scenario.movingTargets || (contributions.movingTargetLoad ?? 0) <= 1) {
    reasons.push("there is little moving-target overhead");
  }

  if (!reasons.length) {
    reasons.push(
      ...contributionEntries
        .map(([id]) => formatShortLengthReliefLabel(id))
        .filter(Boolean)
    );
  }

  reasons.push(...variantReasons);

  return reasons
    .filter((reason, index, list) => list.indexOf(reason) === index)
    .slice(0, 3);
}

function joinReasonParts(parts = []) {
  if (!parts.length) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

function averageValues(values = []) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMeaningfulVariantReasons(scenario) {
  const difficultyHigherReasons = [];
  const difficultyLowerReasons = [];
  const lengthLongerReasons = [];
  const lengthShorterReasons = [];
  const lengthContributions = scenario.metrics.lengthMetrics?.contributions ?? {};
  const movingTargetStats = scenario.movingTargetStats ?? {};

  if (scenario.movingTargets && (movingTargetStats.activeCount ?? 0) > 0) {
    if ((movingTargetStats.difficultyBonus ?? 0) >= 6) {
      difficultyHigherReasons.push("moving targets add extra uncertainty");
    }
    if ((lengthContributions.movingTargetLoad ?? 0) >= 3) {
      lengthLongerReasons.push("moving targets add extra repositioning");
    }
  }

  if (scenario.actFast && scenario.actFastMode && (
    scenario.actFastMode === "countdown_1m" ||
    scenario.actFastMode === "countdown_30s" ||
    scenario.actFastMode === "countdown_2m"
  )) {
    difficultyHigherReasons.push("Act Fast makes planning more demanding");
  }

  if (scenario.classicSharedDeck) {
    difficultyHigherReasons.push("the shared deck makes card planning less forgiving");
  }

  if (scenario.lessForeshadowing) {
    difficultyHigherReasons.push("less foreshadowing makes the route harder to plan ahead");
  }

  if (scenario.factoryRejects) {
    difficultyHigherReasons.push("Factory Rejects reduces planning flexibility");
  }

  if (scenario.competitiveMode && (scenario.metrics.fairnessStdDev ?? 0) >= 6) {
    difficultyHigherReasons.push("Competitive Mode increases pressure on weaker starts");
  }

  if (scenario.lighterGame) {
    difficultyLowerReasons.push("A Lighter Game softens the board pressure");
    lengthShorterReasons.push("A Lighter Game trims some board friction");
  }

  if (scenario.lessSpammyGame) {
    difficultyLowerReasons.push("A Less SPAM-Y Game makes recovery cleaner");
    lengthShorterReasons.push("A Less SPAM-Y Game keeps turns moving");
  }

  return {
    difficulty: {
      higher: difficultyHigherReasons,
      lower: difficultyLowerReasons
    },
    length: {
      longer: lengthLongerReasons,
      shorter: lengthShorterReasons
    }
  };
}

function getDifficultyVariantReasonsForExplanation(scenario, variantReasons, difficultyBand) {
  if (scenario.preferences.difficulty !== "any" && scenario.metrics.difficultyDirection !== "matched") {
    return scenario.metrics.difficultyDirection === "high"
      ? variantReasons.difficulty.higher
      : variantReasons.difficulty.lower;
  }

  if (difficultyBand === "hard") {
    return variantReasons.difficulty.higher;
  }
  if (difficultyBand === "easy") {
    return variantReasons.difficulty.lower;
  }

  return [
    ...variantReasons.difficulty.higher,
    ...variantReasons.difficulty.lower
  ];
}

function getLengthVariantReasonsForExplanation(scenario, variantReasons, lengthBand) {
  if (scenario.preferences.length !== "any" && scenario.metrics.lengthDirection !== "matched") {
    return scenario.metrics.lengthDirection === "high"
      ? variantReasons.length.longer
      : variantReasons.length.shorter;
  }

  if (lengthBand === "long") {
    return variantReasons.length.longer;
  }
  if (lengthBand === "short") {
    return variantReasons.length.shorter;
  }

  return [
    ...variantReasons.length.longer,
    ...variantReasons.length.shorter
  ];
}

function scoreLegDifficultyForExplanation(leg, isFirstLeg = false) {
  if (!leg?.analysis?.summary) {
    return 0;
  }

  const summary = leg.analysis.summary;
  return isFirstLeg
    ? summary.difficultyScore ?? 0
    : (
      (summary.averageRouteScore ?? 0) +
      (summary.congestionScore ?? 0) * 0.45 -
      (summary.diversityScore ?? 0) * 0.18 +
      (summary.crossLegOverlap ?? 0) * 6
    );
}

function getCheckpointDifficultyReason(scenario, difficultyBand) {
  const legs = scenario.sequence?.legs || [];
  if (!legs.length) {
    return null;
  }

  const scoredLegs = legs.map((leg, index) => ({
    checkpoint: leg.to,
    from: leg.from,
    score: scoreLegDifficultyForExplanation(leg, index === 0),
    goal: leg.analysis?.goal ?? null,
    summary: leg.analysis?.summary ?? {}
  })).filter((entry) => Number.isFinite(entry.score));

  if (scoredLegs.length < 2) {
    return null;
  }

  const mean = averageValues(scoredLegs.map((entry) => entry.score));

  if (difficultyBand === "hard") {
    const standout = scoredLegs.reduce((best, entry) => (
      !best || entry.score > best.score ? entry : best
    ), null);
    if (!standout || standout.score - mean < 14) {
      return null;
    }

    const approachSummary = standout.goal
      ? analyzeGoalApproaches(scenario.goalTileMap, standout.goal, {
        lessDeadlyGame: scenario.lessDeadlyGame
      })
      : null;
    const reasons = [];
    if (approachSummary && (approachSummary.openCount <= 2 || approachSummary.trappedCorners >= 1)) {
      reasons.push(
        approachSummary.openCount <= 1
          ? `Checkpoint ${standout.checkpoint} has only one clean entry side`
          : `Checkpoint ${standout.checkpoint} has only ${approachSummary.openCount} clean entry sides`
      );
    }
    if ((standout.summary.congestionScore ?? 0) >= 16) {
      reasons.push(`route congestion is high near Checkpoint ${standout.checkpoint}`);
    }
    if ((standout.summary.crossLegOverlap ?? 0) >= 1.2) {
      reasons.push(`routes into Checkpoint ${standout.checkpoint} overlap heavily with earlier lines`);
    }
    if (!approachSummary && (standout.summary.distinctRouteCount ?? 0) <= 2) {
      reasons.push(`there are not many clean route options into Checkpoint ${standout.checkpoint}`);
    }

    if (!reasons.length) {
      reasons.push(`Checkpoint ${standout.checkpoint} has much higher route pressure than the rest of the course`);
    }

    return joinReasonParts(reasons.slice(0, 2));
  }

  if (difficultyBand === "easy") {
    const standout = scoredLegs.reduce((best, entry) => (
      !best || entry.score < best.score ? entry : best
    ), null);
    if (!standout || mean - standout.score < 12) {
      return null;
    }

    const reasons = [];
    if ((standout.summary.congestionScore ?? 0) <= 8) {
      reasons.push(`traffic stays light around Checkpoint ${standout.checkpoint}`);
    }
    if ((standout.summary.crossLegOverlap ?? 0) <= 0.45) {
      reasons.push(`Checkpoint ${standout.checkpoint} does not force much backtracking`);
    }
    if (!standout.goal && (standout.summary.distinctRouteCount ?? 0) >= 3) {
      reasons.push(`Checkpoint ${standout.checkpoint} has several clean route options`);
    }

    if (!reasons.length) {
      reasons.push(`Checkpoint ${standout.checkpoint} is much more forgiving than the rest of the course`);
    }

    return joinReasonParts(reasons.slice(0, 2));
  }

  return null;
}

function uniqueReasons(reasons = [], limit = 3) {
  return reasons.filter((reason, index, list) => list.indexOf(reason) === index).slice(0, limit);
}

function getOpeningDifficultyReasons(firstLeg, openingForcedDistance, openingFacingChanges, difficultyBand) {
  const reasons = [];

  if (difficultyBand === "hard") {
    if (openingForcedDistance >= 3.5 || openingFacingChanges >= 2.2) {
      reasons.push("it forces several moves and facing changes before players can settle");
    }
    if ((firstLeg.averageTrafficPenalty ?? 0) >= 18) {
      reasons.push("multiple starts crowd into the same early routes");
    }
    if ((firstLeg.flagAreaScore ?? 0) >= 24) {
      reasons.push("Checkpoint 1 is surrounded by active board elements");
    }
  } else if (difficultyBand === "easy") {
    if (openingForcedDistance <= 1.4 && openingFacingChanges <= 1.1) {
      reasons.push("most starts can line up the first checkpoint without much reorientation");
    }
    if ((firstLeg.averageTrafficPenalty ?? 0) <= 12) {
      reasons.push("the dock launch does not create much early traffic");
    }
    if ((firstLeg.flagAreaScore ?? 0) <= 18) {
      reasons.push("Checkpoint 1 has a fairly calm approach area");
    }
  } else {
    if (openingForcedDistance >= 2.5 || openingFacingChanges >= 1.4) {
      reasons.push("players still need to clean up a few awkward early angles");
    }
    if ((firstLeg.averageTrafficPenalty ?? 0) >= 14) {
      reasons.push("the opening routes overlap enough to create some traffic");
    }
    if ((firstLeg.flagAreaScore ?? 0) >= 20) {
      reasons.push("Checkpoint 1 asks for some care instead of being a free pickup");
    }
  }

  return uniqueReasons(reasons, 2);
}

function getLaterCheckpointPressureReasons(scenario, difficultyBand, avgCongestion, avgBacktrack, checkpointDifficultyReason) {
  const reasons = [];

  if (difficultyBand === "hard") {
    if (avgCongestion >= 18) {
      reasons.push("later checkpoints create heavy congestion");
    }
    if (avgBacktrack >= 1.2) {
      reasons.push("later legs repeatedly overlap and force repositioning");
    }
  } else if (difficultyBand === "easy") {
    if (avgCongestion <= 12) {
      reasons.push("later checkpoints keep traffic manageable");
    }
    if (avgBacktrack <= 0.6) {
      reasons.push("later legs do not punish players with much backtracking");
    }
  } else {
    if (avgCongestion >= 14) {
      reasons.push("later checkpoints introduce some congestion after the opening");
    }
    if (avgBacktrack >= 0.8) {
      reasons.push("later legs create some route reuse and repositioning");
    }
  }

  if (checkpointDifficultyReason) {
    reasons.push(checkpointDifficultyReason.charAt(0).toLowerCase() + checkpointDifficultyReason.slice(1));
  }

  return uniqueReasons(reasons, 2);
}

function describeLengthDrivers(scenario, lengthBand, contributionEntries, lengthVariantReasons) {
  const reasons = [];
  const contributions = scenario.metrics.lengthMetrics?.contributions ?? {};

  if (lengthBand === "long") {
    if ((contributions.checkpointLoad ?? 0) >= 8.8 || scenario.checkpoints.length >= 4) {
      reasons.push("it uses enough checkpoints to stretch the route");
    }
    if ((contributions.actionLoad ?? 0) >= 35) {
      reasons.push("players need a lot of programmed movement");
    }
    if ((contributions.distanceLoad ?? 0) >= 18) {
      reasons.push("the route covers a lot of board space");
    }
    if ((contributions.congestionLoad ?? 0) >= 2.2) {
      reasons.push("traffic slows the later legs down");
    }
  } else if (lengthBand === "short") {
    if ((contributions.checkpointLoad ?? 0) <= 4.4 || scenario.checkpoints.length <= 2) {
      reasons.push("it keeps the checkpoint count low");
    }
    if ((contributions.actionLoad ?? 0) <= 28) {
      reasons.push("the routes resolve with relatively few programmed actions");
    }
    if ((contributions.distanceLoad ?? 0) <= 12) {
      reasons.push("the route does not ask for much travel");
    }
    if ((contributions.congestionLoad ?? 0) <= 1.6) {
      reasons.push("traffic rarely stalls the pace");
    }
  } else {
    if ((contributions.checkpointLoad ?? 0) >= 6.6 || scenario.checkpoints.length >= 3) {
      reasons.push("it has enough checkpoints to feel full without dragging");
    }
    if ((contributions.actionLoad ?? 0) >= 35) {
      reasons.push("players still need a fair amount of programmed movement");
    }
    if ((contributions.distanceLoad ?? 0) >= 18) {
      reasons.push("the route creates some real travel between checkpoints");
    }
    if ((contributions.congestionLoad ?? 0) >= 2.2) {
      reasons.push("some congestion adds time without turning it into a slog");
    }
  }

  reasons.push(...lengthVariantReasons);
  if (!reasons.length) {
    reasons.push(lengthBand === "long"
      ? "routes take time to resolve"
      : lengthBand === "short"
        ? "routes resolve fairly quickly"
        : "it balances travel and action load cleanly");
  }

  return uniqueReasons(reasons, 3);
}

function buildCourseExplanationHtml(scenario, noteParts = []) {
  const parts = [];
  const firstLeg = scenario.sequence.firstLeg.summary;
  const openingRoutes = scenario.sequence.firstLeg.starts
    .filter((item) => item.reachable && item.selectedRoute)
    .map((item) => item.selectedRoute);
  const laterLegs = scenario.sequence.legs.slice(1);
  const difficultyBand = describeCourseDifficultyBand(scenario.metrics.difficultyRaw);
  const lengthBand = describeCourseLengthBand(scenario.metrics.lengthRaw);
  const openingForcedDistance = openingRoutes.length
    ? averageValues(openingRoutes.map((route) => route.forcedDistance || 0))
    : 0;
  const openingFacingChanges = openingRoutes.length
    ? averageValues(openingRoutes.map((route) => {
      const manualTurns = (route.transitions || []).filter((transition) => transition.action?.type === "turn").length;
      const conveyorTurns = (route.transitions || []).reduce((sum, transition) => (
        sum + (transition.conveyorSteps || []).filter((step) => step.turned).length
      ), 0);
      return manualTurns + conveyorTurns;
    }))
    : 0;
  const avgCongestion = laterLegs.length
    ? laterLegs.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0) / laterLegs.length
    : 0;
  const avgBacktrack = laterLegs.length
    ? laterLegs.reduce((sum, leg) => sum + (leg.analysis.summary.crossLegOverlap || 0), 0) / laterLegs.length
    : 0;
  const boardPlacements = (scenario.placements || []).filter((placement) => (
    scenario.pieceMap?.[placement.pieceId]?.kind !== "dock" && !placement.overlay
  ));
  const boardHarshness = computeBoardHarshness(boardPlacements, scenario.pieceMap);
  const difficultyReasons = [];
  const variantReasons = getMeaningfulVariantReasons(scenario);
  const difficultyVariantReasons = getDifficultyVariantReasonsForExplanation(scenario, variantReasons, difficultyBand);
  const lengthVariantReasons = getLengthVariantReasonsForExplanation(scenario, variantReasons, lengthBand);

  if (difficultyBand === "hard") {
    if (firstLeg.difficultyScore >= 72 && (openingForcedDistance >= 3.5 || openingFacingChanges >= 2.2)) {
      difficultyReasons.push("the opening run includes several forced moves and facing changes");
    }
    if (firstLeg.averageTrafficPenalty >= 18 || avgCongestion >= 18) {
      difficultyReasons.push("traffic builds up around key routes");
    }
    if (firstLeg.flagAreaScore >= 24) {
      difficultyReasons.push("checkpoint areas are packed with active board elements");
    }
    if (boardHarshness.normalized >= 0.58) {
      difficultyReasons.push("the selected boards are hazard-heavy");
    }
    if (avgBacktrack >= 1.2) {
      difficultyReasons.push("later legs force route overlap and backtracking");
    }
    difficultyReasons.push(...difficultyVariantReasons);
    if (!difficultyReasons.length) {
      difficultyReasons.push("multiple route and hazard pressures stack up across the course");
    }
  } else if (difficultyBand === "easy") {
    if (boardHarshness.normalized <= 0.36) {
      difficultyReasons.push("the selected boards are relatively forgiving");
    }
    if (firstLeg.flagAreaScore <= 18) {
      difficultyReasons.push("checkpoint areas are not overly busy");
    }
    if (firstLeg.averageTrafficPenalty <= 12 && avgCongestion <= 12) {
      difficultyReasons.push("traffic stays under control");
    }
    if (avgBacktrack <= 0.6) {
      difficultyReasons.push("later legs do not force much backtracking");
    }
    if (!scenario.movingTargets) {
      difficultyReasons.push("the route stays stable from turn to turn");
    }
    if (!difficultyReasons.length) {
      difficultyReasons.push("its hazards and route pressure stay fairly controlled");
    }
    difficultyReasons.push(...difficultyVariantReasons);
  } else {
    if (firstLeg.difficultyScore >= 60) {
      if (openingForcedDistance >= 2.5 || openingFacingChanges >= 1.4) {
        difficultyReasons.push("the opening run includes a few forced moves and facing changes");
      }
    }
    if (firstLeg.averageTrafficPenalty >= 14 || avgCongestion >= 14) {
      difficultyReasons.push("there is some route congestion around important lines");
    }
    if (boardHarshness.normalized >= 0.45 && boardHarshness.normalized < 0.62) {
      difficultyReasons.push("the selected boards add some hazard pressure without becoming brutal");
    }
    if (avgBacktrack >= 0.8 && avgBacktrack < 1.6) {
      difficultyReasons.push("later legs create some overlap and repositioning");
    }
    if (!difficultyReasons.length) {
      difficultyReasons.push("it mixes manageable hazards with a few spots that still need planning");
    }
    difficultyReasons.push(...difficultyVariantReasons);
  }

  const uniqueDifficultyReasons = uniqueReasons(difficultyReasons, 3);
  const checkpointDifficultyReason = getCheckpointDifficultyReason(scenario, difficultyBand);
  const openingReasons = getOpeningDifficultyReasons(firstLeg, openingForcedDistance, openingFacingChanges, difficultyBand);
  const laterPressureReasons = getLaterCheckpointPressureReasons(
    scenario,
    difficultyBand,
    avgCongestion,
    avgBacktrack,
    checkpointDifficultyReason
  );

  const contributionEntries = Object.entries(scenario.metrics.lengthMetrics?.contributions || {})
    .filter(([id, value]) => value > 0 && (formatContributionLabel(id) || formatShortLengthReliefLabel(id)))
    .sort((left, right) => right[1] - left[1]);
  const uniqueLengthReasons = lengthBand === "short"
    ? getShortLengthReasons(scenario, contributionEntries, lengthVariantReasons)
    : describeLengthDrivers(scenario, lengthBand, contributionEntries, lengthVariantReasons);

  if (noteParts.length) {
    const mismatchFocus = scenario.metrics.difficultyFit >= scenario.metrics.lengthFit ? "difficulty" : "length";
    const multipleMismatchAxes = noteParts.length > 1;
    parts.push(`<div><strong>Fit:</strong> This course is ${noteParts.join(" and ")} than requested.${multipleMismatchAxes ? ` The larger mismatch is ${mismatchFocus}.` : ""}</div>`);
  }

  parts.push(
    `<div><strong>Difficulty:</strong> ${describeDifficultyLead(scenario)} because ${joinReasonParts(uniqueDifficultyReasons.slice(0, 3))}.</div>`
  );
  if (openingReasons.length) {
    parts.push(
      `<div><strong>Opening:</strong> The Dock to Checkpoint 1 leg ${difficultyBand === "hard" ? "is where players first feel the pressure" : difficultyBand === "easy" ? "stays comparatively forgiving" : "sets the tone"} because ${joinReasonParts(openingReasons)}.</div>`
    );
  }
  if (laterPressureReasons.length) {
    parts.push(
      `<div><strong>Later Checkpoints:</strong> ${joinReasonParts(laterPressureReasons)}.</div>`
    );
  }
  parts.push(
    `<div><strong>Length:</strong> ${describeLengthLead(scenario)} because ${joinReasonParts(uniqueLengthReasons)}.</div>`
  );

  return parts.join("");
}

function updateVariantSummary() {
  const summaryEl = document.getElementById("variant-summary");
  const states = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    label: variant.label,
    state: getVariantControlState(variant.id)
  }));
  const enabled = states.filter((entry) => entry.state !== "off");
  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = states.map((entry) => `${entry.label}: ${getVariantStateCopy(entry.id, entry.state).label}`).join(", ");
}

function updateExpansionSummary() {
  const summaryEl = document.getElementById("expansion-summary");
  const enabled = [];

  if (document.getElementById("expansion-roborally").checked) {
    enabled.push(formatExpansionName("roborally"));
  }
  if (document.getElementById("expansion-30th-anniversary").checked) {
    enabled.push(formatExpansionName("30th-anniversary"));
  }
  if (document.getElementById("expansion-master-builder").checked) {
    enabled.push(formatExpansionName("master-builder"));
  }
  if (document.getElementById("expansion-thrills-and-spills").checked) {
    enabled.push(formatExpansionName("thrills-and-spills"));
  }
    if (document.getElementById("expansion-chaos-and-carnage").checked) {
    enabled.push(formatExpansionName("chaos-and-carnage"));
  }
  if (document.getElementById("expansion-wet-and-wild").checked) {
    enabled.push(formatExpansionName("wet-and-wild"));
  }

  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = enabled.length ? enabled.join(", ") : "None";
  updateVariantAvailability();
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
      !isCheckpointActiveFeature(feature, { movingTargets: scenario.movingTargets }) &&
      feature.type !== "checkpoint"
    ));
  });
}

function hasHazardousFlagsEffect(scenario) {
  if (!scenario?.hazardousFlags) {
    return false;
  }

  return hasCheckpointBoardFeatures(
    scenario,
    (feature) => !isCheckpointActiveFeature(feature, { movingTargets: scenario.movingTargets })
  );
}

function hasMovingTargetsEffect(scenario) {
  return Boolean(scenario?.movingTargets && scenario?.movingTargetStats?.activeCount);
}

function getActFastRuleText(mode) {
  switch (mode) {
    case "countdown_3m":
      return "Act Fast: use a 3-minute programming timer. (Rulebook p. 32).";
    case "countdown_2m":
      return "Act Fast: use a 2-minute programming timer. (Rulebook p. 32).";
    case "countdown_1m":
      return "Act Fast: use a 1-minute programming timer. (Altered from Rulebook p. 32).";
    case "countdown_30s":
      return "Act Fast: use a 30-second programming timer. (Altered from Rulebook p. 32).";
    case "last_player_30s":
      return "Act Fast: when only one player remains, that player has 30 seconds to finish programming (Previous Robo Rally editions).";
    default:
      return null;
  }
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
  const photoRulesNoteEl = document.getElementById("photo-rules-note");
  const noteEl = document.getElementById("rules-note");
  const checkpointNotes = [];
  const photoNotes = [];
  const notes = [];

  if (!scenario) {
    bottomAnchorEl?.appendChild(rulesBlockEl);
    rulesBlockEl?.classList.add("hidden");
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
    photoRulesNoteEl.textContent = "";
    photoRulesNoteEl.classList.add("hidden");
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
    return;
  }

  if (!scenario.hazardousFlags && hasSuppressedCheckpointFeatures(scenario)) {
    checkpointNotes.push(
      scenario.movingTargets
        ? "Checkpoint spaces suppress board elements other than walls, lasers, and conveyors carrying moving checkpoints (Rulebook p. 15; Moving Targets variant)."
        : "Checkpoint spaces suppress board elements other than walls and lasers (Rulebook p. 15)."
    );
  }

  if (scenario.recoveryRule === "dynamic_archiving") {
    notes.push("Dynamic Archiving: No reboot tokens, robots archive when they end a register on a checkpoint or battery space (Rulebook p. 32).");
  }

  const actFastRuleText = getActFastRuleText(scenario.actFastMode);
  if (scenario.actFast && actFastRuleText) {
    notes.push(actFastRuleText);
  }

  if (hasHazardousFlagsEffect(scenario)) {
    notes.push("Hazardous Flags: board elements under checkpoints remain active, but do not affect the checkpoints (Previous Robo Rally editions).");
  }

  if (hasMovingTargetsEffect(scenario)) {
    notes.push("Moving Targets: during each register, checkpoints on conveyors move with the belts. If one would leave the conveyor or stop moving, return it to its marked re-entry space (R#) (Altered from previous Robo Rally editions).");
  }

  if (getBoardViewMode() === BOARD_VIEW_MODES.photos && (scenario.overlayPlacements?.length ?? 0) > 0) {
    photoNotes.push("Board photos are for general layout reference only. With overlays, use the physical boards or Icon View for exact placement of walls, ledges, and other border elements.");
  }

  if (scenario.competitiveMode) {
    notes.push("Competitive Mode: before the game, players take turns blocking starting spaces. (Rulebook p. 32).");
  }

  if (scenario.factoryRejects) {
    notes.push("Factory Rejects: hand size is 7 instead of 9 (Altered from previous Robo Rally editions).");
  }

  if (scenario.lessDeadlyGame) {
    notes.push("A Less Deadly Game: board edges act as walls (Rulebook p. 32).");
  }

  if (scenario.lessSpammyGame) {
    notes.push("A Less SPAM-Y Game: discard all SPAM cards from hand to your discard pile at the end of programming phase (Rulebook p. 32).");
  }

  if (scenario.moreDeadlyGame) {
    notes.push("A More Deadly Game: rebooting deals 3 damage instead of 2 (Rulebook p. 28).");
  }

  if (scenario.classicSharedDeck) {
    notes.push("Shared Deck: shuffle all players' decks as a combined programming deck, and spam cards go to hand instead of deck (Altered from previous Robo Rally editions).");
  }

  if (scenario.lighterGame) {
    notes.push("A Lighter Game: upgrade cards are removed and battery spaces are inactive (Rulebook p. 32).");
  }

  if (scenario.lessForeshadowing) {
    notes.push("Less Foreshadowing: decks reshuffle every turn (Rulebook p. 32).");
  }

  if (checkpointNotes.length) {
    checkpointNoteEl.textContent = checkpointNotes.join(" ");
    checkpointNoteEl.classList.remove("hidden");
  } else {
    checkpointNoteEl.textContent = "";
    checkpointNoteEl.classList.add("hidden");
  }

  if (photoNotes.length) {
    photoRulesNoteEl.textContent = photoNotes.join(" ");
    photoRulesNoteEl.classList.remove("hidden");
  } else {
    photoRulesNoteEl.textContent = "";
    photoRulesNoteEl.classList.add("hidden");
  }

  if (!notes.length) {
    bottomAnchorEl?.appendChild(rulesBlockEl);
    rulesBlockEl?.classList.toggle("hidden", !checkpointNotes.length && !photoNotes.length);
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
  const entries = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    label: variant.label,
    state: getVariantPreferenceState(preferences, variant.id)
  }));

  for (const entry of entries) {
    const { id, label, state } = entry;
    const normalized = normalizeVariantState(state);
    if (normalized === "off") {
      continue;
    }
    variants.push(`${label} (${getVariantStateCopy(id, normalized).label})`);
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

function setVariantControlState(variantId, state, buttonEl = null) {
  const normalized = normalizeVariantState(state);
  const button = buttonEl ?? document.getElementById(VARIANT_CONTROL_IDS[variantId]);
  if (!button) {
    return;
  }
  const stateCopy = getVariantStateCopy(variantId, normalized);

  button.dataset.state = normalized;
  button.textContent = stateCopy.shortLabel;
  button.title = stateCopy.label;
  button.setAttribute("aria-label", `${getVariantDefinitionLabel(variantId)}: ${stateCopy.label}`);
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
  const dynamicArchivingState = getVariantPreferenceState(preferences, "dynamicArchiving");
  if (chooseVariantEnabled(dynamicArchivingState, 0.5)) {
    return "dynamic_archiving";
  }

  return "reboot_tokens";
}

function chooseLessDeadlyGame(preferences) {
  const lessDeadlyState = getVariantPreferenceState(preferences, "lessDeadlyGame");
  return chooseVariantEnabled(lessDeadlyState, 0.22);
}

function chooseMoreDeadlyGame(preferences) {
  const moreDeadlyState = getVariantPreferenceState(preferences, "moreDeadlyGame");
  return chooseVariantEnabled(moreDeadlyState, 0.22);
}

function chooseLighterGame(preferences) {
  const lighterState = getVariantPreferenceState(preferences, "lighterGame");
  return chooseVariantEnabled(lighterState, 0.24);
}

function chooseHazardousFlags(preferences) {
  const hazardousFlagsState = getVariantPreferenceState(preferences, "hazardousFlags");
  return chooseVariantEnabled(hazardousFlagsState, 0.2);
}

function chooseExtraDocks(preferences) {
  const extraDocksState = getVariantPreferenceState(preferences, "extraDocks");
  return chooseVariantEnabled(extraDocksState, 0.5);
}

function chooseFactoryRejects(preferences) {
  const factoryRejectsState = getVariantPreferenceState(preferences, "factoryRejects");
  return chooseVariantEnabled(factoryRejectsState, 0.16);
}

function chooseClassicSharedDeck(preferences) {
  const classicSharedDeckState = getVariantPreferenceState(preferences, "classicSharedDeck");
  return chooseVariantEnabled(classicSharedDeckState, 0.08);
}

function chooseLessForeshadowing(preferences) {
  const lessForeshadowingState = getVariantPreferenceState(preferences, "lessForeshadowing");
  return chooseVariantEnabled(lessForeshadowingState, 0.22);
}

function sampleVariantComplexityBudget(preferences = {}) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const budgets = {
    easy: [0, 0, 0, 1, 1, 1, 2],
    moderate: [0, 0, 1, 1, 1, 2, 2, 3, 4],
    hard: [0, 1, 2, 2, 3, 3, 4, 4, 5, 6]
  };

  return sample(budgets[difficulty] || budgets.moderate);
}

function getVariantBaseChance(variantId, preferences = {}) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const byVariant = {
    actFast: { easy: 0.08, moderate: 0.16, hard: 0.2 },
    lighterGame: { easy: 0.42, moderate: 0.28, hard: 0.18 },
    lessSpammyGame: { easy: 0.32, moderate: 0.22, hard: 0.14 },
    lessDeadlyGame: { easy: 0.3, moderate: 0.2, hard: 0.14 },
    moreDeadlyGame: { easy: 0.05, moderate: 0.14, hard: 0.26 },
    classicSharedDeck: { easy: 0.01, moderate: 0.07, hard: 0.2 },
    competitiveMode: { easy: 0.08, moderate: 0.16, hard: 0.22 },
    dynamicArchiving: { easy: 0.46, moderate: 0.4, hard: 0.34 },
    extraDocks: { easy: 0.08, moderate: 0.2, hard: 0.26 },
    factoryRejects: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    hazardousFlags: { easy: 0.08, moderate: 0.16, hard: 0.24 },
    movingTargets: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    lessForeshadowing: { easy: 0.07, moderate: 0.16, hard: 0.24 },
    staggeredBoards: { easy: 0.5, moderate: 0.5, hard: 0.5 }
  };

  return byVariant[variantId]?.[difficulty] ?? 0.2;
}

function getLateEasyVariantRescueBonus(variantId, preferences = {}) {
  const attempt = preferences.generationAttempt ?? 1;
  const difficulty = getTuningDifficulty(preferences.difficulty);

  if (difficulty !== "easy" || attempt < 28) {
    return 0;
  }

  const latePhase = attempt >= 36 ? 2 : 1;
  const easingVariants = {
    lighterGame: latePhase === 2 ? 0.34 : 0.18,
    lessSpammyGame: latePhase === 2 ? 0.28 : 0.14,
    lessDeadlyGame: latePhase === 2 ? 0.24 : 0.12
  };
  const hardeningVariants = {
    actFast: -0.06,
    moreDeadlyGame: -0.12,
    classicSharedDeck: -0.08,
    competitiveMode: -0.05,
    factoryRejects: -0.08,
    hazardousFlags: -0.08,
    movingTargets: -0.1,
    lessForeshadowing: -0.08
  };

  return easingVariants[variantId] ?? hardeningVariants[variantId] ?? 0;
}

function chooseVariantBundle(preferences = {}) {
  const definitions = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    cost: variant.cost,
    defaultState: variant.defaultState
  }));
  const active = Object.fromEntries(definitions.map((entry) => [entry.id, false]));
  let usedBudget = 0;

  const forcedEntries = definitions.filter((entry) => getVariantPreferenceState(preferences, entry.id) === "forced");
  forcedEntries.forEach((entry) => {
    active[entry.id] = true;
  });

  const sampledBudget = sampleVariantComplexityBudget(preferences);
  const budget = sampledBudget;
  const allowedEntries = definitions
    .filter((entry) => getVariantPreferenceState(preferences, entry.id) === "allowed")
    .map((entry) => ({
      ...entry,
      chance: clamp(
        getVariantBaseChance(entry.id, preferences) + getLateEasyVariantRescueBonus(entry.id, preferences),
        0,
        0.95
      )
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
      (entry.id === "lessForeshadowing" && active.classicSharedDeck) ||
      (entry.id === "classicSharedDeck" && active.lessSpammyGame) ||
      (entry.id === "lessSpammyGame" && active.classicSharedDeck)
    ) {
      chance = 0;
    }

    if (Math.random() < chance) {
      active[entry.id] = true;
      usedBudget += entry.cost;
    }
  }

  return {
    alignedLayout: !active.staggeredBoards,
    actFast: active.actFast,
    competitiveMode: active.competitiveMode,
    extraDocks: active.extraDocks,
    recoveryRule: active.dynamicArchiving ? "dynamic_archiving" : "reboot_tokens",
    lighterGame: active.lighterGame,
    lessSpammyGame: active.lessSpammyGame,
    lessDeadlyGame: active.lessDeadlyGame,
    moreDeadlyGame: active.moreDeadlyGame,
    classicSharedDeck: active.classicSharedDeck,
    factoryRejects: active.factoryRejects,
    hazardousFlags: active.hazardousFlags,
    movingTargets: active.movingTargets,
    staggeredBoards: active.staggeredBoards,
    lessForeshadowing: active.lessForeshadowing,
    variantComplexityBudget: budget,
    variantComplexityUsed: usedBudget
  };
}

function isVariantForced(preferences = {}, variantId) {
  return getVariantPreferenceState(preferences, variantId) === "forced";
}

function chooseActFastMode(preferences = {}) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const table = {
    easy: [
      "countdown_3m",
      "countdown_3m",
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_1m"
    ],
    moderate: [
      "last_player_30s",
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_3m",
      "countdown_1m",
      "countdown_30s"
    ],
    hard: [
      "last_player_30s",
      "last_player_30s",
      "countdown_2m",
      "countdown_2m",
      "countdown_1m",
      "countdown_1m",
      "countdown_30s",
      "countdown_3m"
    ]
  };

  return sample(table[difficulty] || table.moderate);
}

function getPreferencesFromControls() {
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "30th-anniversary": document.getElementById("expansion-30th-anniversary").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "chaos-and-carnage": document.getElementById("expansion-chaos-and-carnage").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked
    },
    allowedVariantRules: Object.fromEntries(
      VARIANT_DEFINITIONS.map((variant) => [variant.id, getVariantControlState(variant.id)])
    )
  };
}

function applyPreferencesToControls(preferences) {
  if (!preferences) {
    return;
  }

  document.getElementById("player-count").value = String(preferences.playerCount ?? 4);
  document.getElementById("difficulty").value = preferences.difficulty ?? "any";
  document.getElementById("length").value = preferences.length ?? "any";
  document.getElementById("expansion-roborally").checked = preferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-30th-anniversary").checked = preferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = preferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = preferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = preferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = preferences.selectedExpansions?.["wet-and-wild"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    setVariantControlState(variant.id, getVariantPreferenceState(preferences, variant.id));
  });
  updateExpansionSummary();
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
  let teleporterCount = 0;
  let randomizerCount = 0;
  let crusherCount = 0;
  let pushCount = 0;
  let hazardCount = 0;

  for (const tile of tiles) {
    for (const feature of tile.features || []) {
      const delta = getBoardProfileDelta(feature);
      hazardWeight += delta.hazardWeight;
      congestionWeight += delta.congestionWeight;
      complexityWeight += delta.complexityWeight;
      swingWeight += delta.swingWeight;
      pitCount += delta.pitCount;
      beltCount += delta.beltCount;
      portalCount += delta.portalCount;
      teleporterCount += delta.teleporterCount;
      randomizerCount += delta.randomizerCount;
      crusherCount += delta.crusherCount;
      pushCount += delta.pushCount;
      hazardCount += delta.hazardCount;
    }
  }

  const bias = {
    hazard: normalizeBias(hazardWeight / area * 1.4),
    congestion: normalizeBias(congestionWeight / area * 1.2),
    complexity: normalizeBias(complexityWeight / area * 1.2)
  };
  const swinginess = normalizeBias(swingWeight / area * 1.4);
  const density = (
    hazardCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.hazard +
    beltCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.belt +
    portalCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.portal +
    pushCount * BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS.push
  ) / area;
  const hazardDensity = hazardCount / area;
  const hazardPressure = Math.max(
    0,
    (hazardDensity - BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD) * BOARD_PROFILE_HAZARD_DENSITY_WEIGHT
  );
  const overall = Number(clamp(
    bias.hazard * 0.4 +
    bias.congestion * 0.22 +
    bias.complexity * 0.24 +
    swinginess * 0.14 +
    density * BOARD_PROFILE_DENSITY_WEIGHT +
    hazardPressure,
    1,
    3.6
  ).toFixed(2));
  const band = overall <= 1.7
  ? "intro"
  : overall <= 2.25
    ? "standard"
    : overall <= 3.0
      ? "challenging"
      : "extreme";

  return {
    bias,
    swinginess,
    overall,
    density: Number(density.toFixed(3)),
    hazardDensity: Number(hazardDensity.toFixed(3)),
    band,
    signals: {
      pitCount,
      beltCount,
      portalCount,
      teleporterCount,
      randomizerCount,
      crusherCount,
      pushCount,
      hazardCount,
      hazardPressure: Number(hazardPressure.toFixed(3))
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
    return getTuningDifficulty(preferences.difficulty) === "hard" ? 1 : 2;
  }
  return 1;
}

function weightedBoardCount(lengthPreference, maxBoards, hasLargeBoards = true, preferences = {}) {
  const table = hasLargeBoards
    ? {
      short: [1, 1, 1, 2, 2],
      moderate: [1, 2, 2, 3, 3],
      long: [2, 2, 3, 3, 4]
    }
    : {
      short: [2, 2, 3, 3, 4],
      moderate: [3, 4, 4, 5, 5],
      long: [4, 5, 5, 6, 6]
    };

  const minimumCount = hasLargeBoards
    ? 1
    : Math.min(maxBoards, getMinimumSmallOnlyBoardCount(lengthPreference, preferences));
  const candidates = (table[lengthPreference] || table.moderate).filter((count) => (
    count <= maxBoards && count >= minimumCount
  ));
  return sample(candidates.length ? candidates : [Math.max(1, minimumCount)]);
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

function getRequiredDockStartCount(preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;
  const competitiveModeEnabled = typeof preferences.competitiveMode === "boolean"
    ? preferences.competitiveMode
    : getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  return competitiveModeEnabled ? playerCount * 2 : playerCount;
}

function getMaximumDockCount(preferences = {}, availableDockCount = 1) {
  const mode = getExtraDockModeState(preferences);
  const desired = mode === "off" ? 1 : MAX_DOCK_COUNT;
  return Math.max(1, Math.min(desired, availableDockCount));
}

function getDockStartCapacity(dockIds, pieceMap) {
  return dockIds.reduce((sum, dockId) => sum + (pieceMap[dockId]?.starts?.length ?? 0), 0);
}

function getDockFaceGroups(dockIds, pieceMap) {
  const groups = new Map();

  dockIds.forEach((dockId) => {
    const physicalDockId = pieceMap[dockId]?.physicalBoardId ?? dockId;
    if (!groups.has(physicalDockId)) {
      groups.set(physicalDockId, []);
    }
    groups.get(physicalDockId).push(dockId);
  });

  return [...groups.values()];
}

function variantIsAvailable(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (variantId === "extraDocks") {
    if (!pieceMap) {
      return true;
    }
    const expansionIds = getSelectedExpansionIds(preferences);
    const physicalDockCount = getDockFaceGroups(
      getAvailableDockIds(pieceMap, expansionIds),
      pieceMap
    ).length;
    return physicalDockCount >= 2;
  }

  return true;
}

function updateVariantAvailability() {
  const preferences = getPreferencesFromControls();

  VARIANT_DEFINITIONS.forEach((variant) => {
    const button = document.getElementById(variant.controlId);
    if (!button) {
      return;
    }

    const available = variantIsAvailable(variant.id, preferences);
    button.disabled = !available;

    if (!available) {
      setVariantControlState(variant.id, "off", button);
      button.title = variant.id === "extraDocks"
        ? "Requires at least two physical docking bays in the selected sets."
        : button.title;
      button.setAttribute("aria-label", `${variant.label}: unavailable`);
    } else {
      button.title = getVariantStateCopy(variant.id, button.dataset.state ?? variant.defaultState).label;
      button.setAttribute("aria-label", `${variant.label}: ${button.title}`);
    }
  });

  updateVariantSummary();
}

function canSupportRequiredDockStarts(dockIds, pieceMap, preferences = {}) {
  const dockFaceGroups = getDockFaceGroups(dockIds, pieceMap);
  const maxDockCount = getMaximumDockCount(preferences, dockFaceGroups.length);
  const bestPhysicalDocks = dockFaceGroups
    .map((group) => Math.max(...group.map((dockId) => pieceMap[dockId]?.starts?.length ?? 0)))
    .sort((left, right) => right - left)
    .slice(0, maxDockCount);
  return bestPhysicalDocks.reduce((sum, startCount) => sum + startCount, 0) >= getRequiredDockStartCount(preferences);
}

function getEligibleDockIds(pieceMap, expansionIds = null, preferences = {}) {
  return getAvailableDockIds(pieceMap, expansionIds)
    .filter((dockId) => (pieceMap[dockId]?.starts?.length ?? 0) > 0);
}

function getDockSelectionWeight(piece, preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;
  const startCount = piece?.starts?.length ?? 0;

  if (startCount <= 0) {
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

  return 1 + Math.min(0.6, startCount * 0.04);
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

function getDockConfigurations(availableDockIds, pieceMap, preferences = {}) {
  const extraDockMode = getExtraDockModeState(preferences);
  const allowExtraDock = extraDockMode !== "off";
  const requireExtraDock = extraDockMode === "forced";
  const dockFaceGroups = getDockFaceGroups(availableDockIds, pieceMap);
  const configs = [];

  dockFaceGroups.forEach((group) => {
    group.forEach((dockId) => {
      if ((pieceMap[dockId]?.starts?.length ?? 0) > 0) {
        configs.push([dockId]);
      }
    });
  });

  if (allowExtraDock) {
    for (let left = 0; left < dockFaceGroups.length; left += 1) {
      for (let right = left + 1; right < dockFaceGroups.length; right += 1) {
        for (const leftDockId of dockFaceGroups[left]) {
          for (const rightDockId of dockFaceGroups[right]) {
            const dockIds = [leftDockId, rightDockId];
            if (getDockStartCapacity(dockIds, pieceMap) > 0) {
              configs.push(dockIds);
            }
          }
        }
      }
    }
  }

  return configs
    .filter((dockIds) => (!requireExtraDock || dockIds.length > 1))
    .filter((dockIds) => dockIds.length <= getMaximumDockCount(preferences, dockFaceGroups.length))
    .filter((dockIds) => getDockStartCapacity(dockIds, pieceMap) >= getRequiredDockStartCount(preferences));
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
      hazard: 1.18,
      congestion: preferences.playerCount >= 5 ? 1.22 : 1.38,
      complexity: 1.8,
      swinginess: 1.12,
      overall: 1.55
    },
    moderate: {
      hazard: 2.15,
      congestion: preferences.playerCount >= 5 ? 1.7 : 1.9,
      complexity: 2.45,
      swinginess: 1.8,
      overall: 2.15
    },
    hard: {
      hazard: 2.85,
      congestion: preferences.playerCount >= 5 ? 2.35 : 2.55,
      complexity: 2.85,
      swinginess: 2.35,
      overall: 2.85
    }
  };

  if (preferences.difficulty === "easy" && preferences.length === "short") {
    difficultyTargets.easy = {
      hazard: 1.12,
      congestion: preferences.playerCount >= 5 ? 1.16 : 1.3,
      complexity: 1.7,
      swinginess: 1.06,
      overall: 1.47
    };
  }

  const tuningDifficulty = getTuningDifficulty(preferences.difficulty);
  const target = difficultyTargets[tuningDifficulty] || difficultyTargets.moderate;

  const mismatchWeights = tuningDifficulty === "easy"
    ? { hazard: 1.35, congestion: 1.05, complexity: 1.0, swinginess: 1.1, overall: 1.35 }
    : tuningDifficulty === "moderate"
      ? { hazard: 1.2, congestion: 1.15, complexity: 1.0, swinginess: 0.95, overall: 1.35 }
      : { hazard: 0.95, congestion: 0.9, complexity: 0.85, swinginess: 0.7, overall: 0.85 };

  const mismatch = (
    Math.abs(bias.hazard - target.hazard) * mismatchWeights.hazard +
    Math.abs(bias.congestion - target.congestion) * mismatchWeights.congestion +
    Math.abs(bias.complexity - target.complexity) * mismatchWeights.complexity +
    Math.abs((profile.swinginess ?? 2) - target.swinginess) * mismatchWeights.swinginess +
    Math.abs((profile.overall ?? 2) - target.overall) * mismatchWeights.overall
  );

  const guidancePenalty = tuningDifficulty === "easy"
    ? Math.max(0, (profile.overall ?? 2) - 1.9) * 6.5 +
      Math.max(0, (profile.swinginess ?? 2) - 1.6) * 3.5
    : tuningDifficulty === "moderate"
      ? (profile.band === "extreme" ? 3.5 : 0) +
        Math.max(0, (profile.overall ?? 2) - 2.75) * 1.2
      : 0;

  const sparsePenalty = tuningDifficulty === "hard"
    ? 0
    : (profile.density ?? 0.08) <= 0.03
      ? (tuningDifficulty === "moderate" ? 2.2 : 1.1)
      : (profile.density ?? 0.08) <= 0.055
        ? (tuningDifficulty === "moderate" ? 1.15 : 0.45)
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

function getDockTileKeySet(dockPlacements = [], pieceMap) {
  const keys = new Set();
  dockPlacements.forEach((dockPlacement) => {
    getDockTileKeys(dockPlacement, pieceMap).forEach((key) => keys.add(key));
  });
  return keys;
}

function rotateTileOffset(x, y, piece, rotation) {
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

function getFullRectOffsets(piece, rotation = 0) {
  const dims = rotatedDimensions(piece, rotation);
  const offsets = [];

  for (let y = 0; y < dims.height; y += 1) {
    for (let x = 0; x < dims.width; x += 1) {
      offsets.push({ x, y });
    }
  }

  return offsets;
}

function getPlacementOccupiedOffsets(piece, rotation = 0, options = {}) {
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

function getPlacementOccupiedTiles(piece, placement) {
  const fullRect = Boolean(placement?.overlay && !isMiniOverlayPiece(piece));
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0, { fullRect }).map(({ x, y }) => (
    `${placement.x + x},${placement.y + y}`
  ));
}

function isMiniOverlayPiece(piece) {
  return piece?.kind === "overlay";
}

function isBlankCustomBoardPiece(piece) {
  return piece?.expansionId === "master-builder" &&
    piece?.kind === "small" &&
    (piece?.tiles?.length ?? 0) === 0;
}

function chooseWeightedCount(maxCount, weightForCount) {
  if (maxCount <= 0) {
    return 0;
  }

  const bag = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = Math.max(1, Math.round(weightForCount(count)));
    for (let copy = 0; copy < copies; copy += 1) {
      bag.push(count);
    }
  }

  return sample(bag);
}

function chooseBlankBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(maxCount, (count) => {
    if (count === 0) {
      return 2;
    }

    const ratio = count / Math.max(1, maxCount);
    if (ratio >= 0.3 && ratio <= 0.7) {
      return ratio >= 0.4 && ratio <= 0.6 ? 6 : 5;
    }
    if (ratio >= 0.2 && ratio <= 0.8) {
      return 3;
    }
    return 1;
  });
}

function chooseLargeBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(4, maxCount), (count) => {
    const weights = [4, 4, 3, 2, 1];
    return weights[count] ?? 1;
  });
}

function chooseSmallBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(1, maxCount), (count) => {
    const weights = [4, 1];
    return weights[count] ?? 1;
  });
}

function getPlacementSupportTiles(placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  const supportTiles = new Set();

  for (const { x, y } of getFullRectOffsets(piece, placement.rotation ?? 0)) {
    supportTiles.add(`${placement.x + x},${placement.y + y}`);
  }

  return supportTiles;
}

function getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles) {
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
    const occupiedOffsets = isMiniOverlayPiece(overlayPiece)
      ? getPlacementOccupiedOffsets(overlayPiece, rotation)
      : getFullRectOffsets(overlayPiece, rotation);

    for (let y = minY; y <= maxY - dims.height + 1; y += 1) {
      for (let x = minX; x <= maxX - dims.width + 1; x += 1) {
        const valid = occupiedOffsets.every(({ x: dx, y: dy }) => {
          const key = `${x + dx},${y + dy}`;
          return supportTiles.has(key) && !dockTiles.has(key);
        });

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

function getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap) {
  const blankBoards = [];
  const otherBoards = [];

  for (const placement of [...boardOverlayPlacements, ...structuralPlacements]) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) {
      continue;
    }

    if (isBlankCustomBoardPiece(piece)) {
      blankBoards.push(placement);
      continue;
    }

    otherBoards.push(placement);
  }

  return { blankBoards, otherBoards };
}

function getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap) {
  const supportTiles = getPlacementSupportTiles(targetPlacement, pieceMap);
  if (targetPlacement.overlay) {
    return supportTiles;
  }

  for (const overlayPlacement of boardOverlayPlacements) {
    for (const key of getPlacementOccupiedTiles(pieceMap[overlayPlacement.pieceId], overlayPlacement)) {
      supportTiles.delete(key);
    }
  }

  return supportTiles;
}

function getOppositeSide(side) {
  return {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[side] ?? side;
}

function tileHasWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "wall" && (feature.sides || []).includes(side));
}

function tileHasLedgeOnSide(features = [], side) {
  return features.some((feature) => feature.type === "ledge" && (feature.sides || []).includes(side));
}

function tileHasLaserSupportBlock(features = [], side, options = {}) {
  if (tileHasWallOnSide(features, side)) {
    return true;
  }

  return Boolean(options.includeLowerLedge && tileHasLedgeOnSide(features, side));
}

function tileHasLaserInDirection(features = [], dir) {
  return features.some((feature) => feature.type === "laser" && feature.dir === dir);
}

function getPlacedTileFeatureMap(piece, placement) {
  const placed = placePiece(piece, placement);
  return new Map(placed.tiles.map((tile) => [`${tile.x},${tile.y}`, tile.features || []]));
}

function getCombinedPlacedTileFeatureMap(placements, pieceMap) {
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

function placementSuppresssTrackedHazard(placement, piece, currentTileMap) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const tile = currentTileMap.get(`${placement.x + x},${placement.y + y}`);
    return (tile?.features || []).some((feature) => (
      feature.type === "laser" || feature.type === "flamethrower"
    ));
  });
}

function laserTileHasValidContinuation(tile, laser, candidateFeatureMap, currentTileMap, supportTiles) {
  const sideChecks = [laser.dir, getOppositeSide(laser.dir)];

  return sideChecks.every((side) => {
    const currentFeatures = tile.features || [];
    if (tileHasLaserSupportBlock(currentFeatures, side, { includeLowerLedge: true })) {
      return true;
    }

    const delta = CARDINAL_DIRS[side];
    const neighborX = tile.x + delta.dx;
    const neighborY = tile.y + delta.dy;
    const neighborKey = `${neighborX},${neighborY}`;
    if (!supportTiles.has(neighborKey)) {
      return !currentTileMap.has(neighborKey);
    }

    const neighborFeatures = candidateFeatureMap.get(neighborKey) ?? currentTileMap.get(neighborKey)?.features ?? [];
    if (tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side))) {
      return true;
    }

    return tileHasLaserInDirection(neighborFeatures, laser.dir);
  });
}

function placementHasValidLaserSupport(placement, piece, currentTileMap, supportTiles, candidateFeatureMap = null) {
  const placed = placePiece(piece, placement);
  const effectiveFeatureMap = candidateFeatureMap ?? getPlacedTileFeatureMap(piece, placement);

  return placed.tiles.every((tile) => {
    const lasers = (tile.features || []).filter((feature) => feature.type === "laser");
    if (!lasers.length) {
      return true;
    }

    return lasers.every((laser) => laserTileHasValidContinuation(tile, laser, effectiveFeatureMap, currentTileMap, supportTiles));
  });
}

function rotateBundleOffset(offset, length, rotation) {
  if (rotation === 90) {
    return { x: 0, y: offset };
  }
  if (rotation === 180) {
    return { x: length - 1 - offset, y: 0 };
  }
  if (rotation === 270) {
    return { x: 0, y: length - 1 - offset };
  }
  return { x: offset, y: 0 };
}

function getAvailableLaserBundlePatterns(groupedMiniOverlayIds, maxTiles) {
  const patterns = [];

  LASER_BUNDLE_DEFINITIONS.forEach((definition) => {
    const hasStart = groupedMiniOverlayIds.has(definition.startPhysicalId);
    const hasMid = groupedMiniOverlayIds.has(definition.midPhysicalId);
    const hasEnd = groupedMiniOverlayIds.has(definition.endPhysicalId);

    if (hasStart && hasMid && hasEnd && maxTiles >= 3) {
      patterns.push({ ids: [definition.endId, definition.midId, definition.startId], weight: 5 });
    }
    if (hasStart && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.startId], weight: 3 });
    }
    if (hasStart && hasMid && maxTiles >= 2) {
      patterns.push({ ids: [definition.midId, definition.startId], weight: 2 });
    }
    if (hasMid && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.midId], weight: 2 });
    }
    if (hasMid && maxTiles >= 1) {
      patterns.push({ ids: [definition.midId], weight: 1 });
    }
  });

  return patterns;
}

function sampleWeightedLaserBundle(patterns) {
  const bag = [];
  patterns.forEach((pattern) => {
    for (let copy = 0; copy < pattern.weight; copy += 1) {
      bag.push(pattern);
    }
  });
  return bag.length ? sample(bag) : null;
}

function tryPlaceLaserBundleOnBoard(groupedMiniOverlayIds, pieceMap, supportTiles, dockTiles, occupiedMiniOverlayTiles, currentTileMap, remainingSlots) {
  const bundlePattern = sampleWeightedLaserBundle(getAvailableLaserBundlePatterns(groupedMiniOverlayIds, remainingSlots));
  if (!bundlePattern) {
    return null;
  }

  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return null;
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bundleLength = bundlePattern.ids.length;
  const candidateBundles = [];

  for (const rotation of ROTATIONS) {
    const width = rotation === 90 || rotation === 270 ? 1 : bundleLength;
    const height = rotation === 90 || rotation === 270 ? bundleLength : 1;

    for (let y = minY; y <= maxY - height + 1; y += 1) {
      for (let x = minX; x <= maxX - width + 1; x += 1) {
        const placements = bundlePattern.ids.map((pieceId, index) => {
          const offset = rotateBundleOffset(index, bundleLength, rotation);
          return {
            pieceId,
            x: x + offset.x,
            y: y + offset.y,
            rotation,
            overlay: true
          };
        });

        const occupiedKeys = placements.flatMap((placement) => getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement));
        if (!occupiedKeys.every((key) => supportTiles.has(key) && !dockTiles.has(key) && !occupiedMiniOverlayTiles.has(key))) {
          continue;
        }
        if (placements.some((placement) => placementSuppresssTrackedHazard(placement, pieceMap[placement.pieceId], currentTileMap))) {
          continue;
        }

        const candidateFeatureMap = getCombinedPlacedTileFeatureMap(placements, pieceMap);
        if (!placements.every((placement) => (
          placementHasValidLaserSupport(placement, pieceMap[placement.pieceId], currentTileMap, supportTiles, candidateFeatureMap)
        ))) {
          continue;
        }

        candidateBundles.push(placements);
      }
    }
  }

  if (!candidateBundles.length) {
    return null;
  }

  return sample(candidateBundles);
}

function placementTouchesSupportEdge(placement, piece, supportTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    return (
      !supportTiles.has(`${absoluteX},${absoluteY - 1}`) ||
      !supportTiles.has(`${absoluteX + 1},${absoluteY}`) ||
      !supportTiles.has(`${absoluteX},${absoluteY + 1}`) ||
      !supportTiles.has(`${absoluteX - 1},${absoluteY}`)
    );
  });
}

function placementTouchesOccupiedNeighbors(placement, piece, occupiedOverlayTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        if (occupiedOverlayTiles.has(`${absoluteX + dx},${absoluteY + dy}`)) {
          return true;
        }
      }
    }
    return false;
  });
}

function placeMiniOverlaysOnBoards(targetBoards, groupedMiniOverlayIds, pieceMap, dockPlacements, occupiedMiniOverlayTiles, countChooser, currentPlacements, boardOverlayPlacements) {
  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
  const placements = [];
  let currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;

  for (const targetPlacement of targetBoards) {
    const remainingGroups = [...groupedMiniOverlayIds.entries()];
    if (!remainingGroups.length) {
      break;
    }

    const targetCount = countChooser(remainingGroups.length, targetPlacement);
    if (targetCount <= 0) {
      continue;
    }

    const supportTiles = getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap);
    if (!supportTiles.size) {
      continue;
    }
    const targetPiece = pieceMap[targetPlacement.pieceId];
    const allowDensePacking = isBlankCustomBoardPiece(targetPiece);

    for (let placedCount = 0; placedCount < targetCount;) {
      let placed = false;
      const remainingSlots = targetCount - placedCount;
      const laserBundlePlacements = tryPlaceLaserBundleOnBoard(
        groupedMiniOverlayIds,
        pieceMap,
        supportTiles,
        dockTiles,
        occupiedMiniOverlayTiles,
        currentTileMap,
        remainingSlots
      );
      if (laserBundlePlacements?.length) {
        laserBundlePlacements.forEach((placement) => {
          getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement).forEach((key) => occupiedMiniOverlayTiles.add(key));
          placements.push(placement);
          currentPlacements.push(placement);
          groupedMiniOverlayIds.delete(getPhysicalBoardId(pieceMap[placement.pieceId]));
        });
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        placedCount += laserBundlePlacements.length;
        continue;
      }

      for (const [physicalBoardId, overlayIds] of shuffle([...groupedMiniOverlayIds.entries()])) {
        const chosenOverlayId = sample(overlayIds);
        const overlayPiece = pieceMap[chosenOverlayId];
        const legalPlacements = shuffle(
          getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles)
        ).filter((placement) => {
          if (!getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedMiniOverlayTiles.has(key))) {
            return false;
          }
          if (placementSuppresssTrackedHazard(placement, overlayPiece, currentTileMap)) {
            return false;
          }
          if (!placementHasValidLaserSupport(placement, overlayPiece, currentTileMap, supportTiles)) {
            return false;
          }
          return true;
        });

        if (!legalPlacements.length) {
          continue;
        }

        const preferredPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesSupportEdge(placement, overlayPiece, supportTiles) &&
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const fallbackPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const candidatePlacements = preferredPlacements.length
          ? preferredPlacements
          : (fallbackPlacements.length ? fallbackPlacements : legalPlacements);
        const chosenPlacement = candidatePlacements[0];
        getPlacementOccupiedTiles(overlayPiece, chosenPlacement).forEach((key) => occupiedMiniOverlayTiles.add(key));
        placements.push(chosenPlacement);
        currentPlacements.push(chosenPlacement);
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        groupedMiniOverlayIds.delete(physicalBoardId);
        placedCount += 1;
        placed = true;
        break;
      }

      if (!placed) {
        break;
      }
    }
  }

  return placements;
}

function getBoardOverlayCount(preferences, largeBoardCount, maxAvailable) {
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

function getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  return getOverlayPlacementsForSupportTiles(
    overlayPiece,
    buildMainFootprintTiles(structuralPlacements, pieceMap),
    getDockTileKeySet(dockPlacements, pieceMap)
  );
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

function getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  if (overlayPiece.width !== 6 || overlayPiece.height !== 6) {
    return getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap);
  }

  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
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

function chooseOverlayPlacements(structuralPlacements, dockPlacements, pieceMap, preferences, expansionIds) {
  const usedStructuralBoards = new Set(
    structuralPlacements.map((placement) => getPhysicalBoardId(pieceMap[placement.pieceId]))
  );
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionIds);
  const miniOverlayIds = overlayIds.filter((overlayId) => isMiniOverlayPiece(pieceMap[overlayId]));
  const boardOverlayIds = overlayIds.filter((overlayId) => (
    !isMiniOverlayPiece(pieceMap[overlayId]) &&
    !usedStructuralBoards.has(getPhysicalBoardId(pieceMap[overlayId]))
  ));

  const largeBoardCount = structuralPlacements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
  }).length;
  const groupedBoardOverlays = new Map();
  for (const overlayId of boardOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedBoardOverlays.has(physicalBoardId)) {
      groupedBoardOverlays.set(physicalBoardId, []);
    }
    groupedBoardOverlays.get(physicalBoardId).push(overlayId);
  }

  const placements = [];
  const occupiedBoardOverlayTiles = new Set();
  const occupiedMiniOverlayTiles = new Set();
  const currentPlacements = [
    ...structuralPlacements,
    ...dockPlacements
  ];
  const boardOverlayPlacements = [];

  const targetBoardOverlayCount = getBoardOverlayCount(preferences, largeBoardCount, groupedBoardOverlays.size);
  for (const groupOverlayIds of shuffle([...groupedBoardOverlays.values()]).slice(0, targetBoardOverlayCount)) {
    const chosenOverlayId = sample(groupOverlayIds);
    const overlayPiece = pieceMap[chosenOverlayId];
    const legalPlacements = (
      preferences.alignedLayout
        ? getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
        : getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
    ).filter((placement) => (
      getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedBoardOverlayTiles.has(key))
    ));
    if (!legalPlacements.length) {
      continue;
    }

    const chosenPlacement = sample(legalPlacements);
    getPlacementOccupiedTiles(overlayPiece, chosenPlacement).forEach((key) => occupiedBoardOverlayTiles.add(key));
    placements.push(chosenPlacement);
    boardOverlayPlacements.push(chosenPlacement);
    currentPlacements.push(chosenPlacement);
  }

  const groupedMiniOverlays = new Map();
  for (const overlayId of miniOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedMiniOverlays.has(physicalBoardId)) {
      groupedMiniOverlays.set(physicalBoardId, []);
    }
    groupedMiniOverlays.get(physicalBoardId).push(overlayId);
  }

  const { blankBoards, otherBoards } = getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap);
  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(blankBoards),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseBlankBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseLargeBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) < 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseSmallBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

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
      .map((boardId) => {
        const piece = pieceMap[boardId];
        const score = boardPreferencePenalty(piece, preferences, guidanceLevel);
        return { boardId, score };
      })
      .sort((a, b) => a.score - b.score);
    if (rankedFaces.length) {
      scoredGroups.push(rankedFaces[0]);
    }
  }

  const ranked = scoredGroups.sort((a, b) => a.score - b.score);

  const tuningDifficulty = getTuningDifficulty(preferences.difficulty);
  const candidatePoolSize = tuningDifficulty === "hard"
    ? Math.min(ranked.length, Math.max(count + 6, Math.ceil(ranked.length * 1)))
    : Math.min(ranked.length, Math.max(count + 4, Math.ceil(ranked.length * 0.45)));

  const candidatePool = ranked.slice(0, candidatePoolSize).map((entry) => entry.boardId);

  function getBoardPool(rankedEntries, attempt, currentPreferences, boardCount) {
    const total = rankedEntries.length;

    const getTop = (ratio, extra = 0) =>
      rankedEntries.slice(0, Math.min(total, Math.max(boardCount + extra, Math.ceil(total * ratio))));

    const currentTuningDifficulty = getTuningDifficulty(currentPreferences.difficulty);

    if (currentTuningDifficulty === "hard") {
      if (attempt < 10) return rankedEntries;
      if (attempt < 25) return getTop(0.8, 8);
      if (attempt < 35) return getTop(0.55, 5);
      return getTop(0.35, 3);
    }

    if (currentTuningDifficulty === "moderate") {
      if (attempt < 5) return rankedEntries;
      if (attempt < 20) return getTop(0.65, 6);
      if (attempt < 35) return getTop(0.45, 4);
      return getTop(0.3, 2);
    }

    if (attempt < 3) return getTop(0.75, 8);
    if (attempt < 15) return getTop(0.55, 6);
    return getTop(0.4, 4);
  }

  const attemptCount = Math.min(24, Math.max(6, ranked.length * 2));
  let bestPoolIds = candidatePool;
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const pool = getBoardPool(ranked, attempt, preferences, count);
    const poolIds = pool.map((entry) => entry.boardId);
    if (sampleDistinctBoardFaces(poolIds, count, pieceMap).length === count) {
      bestPoolIds = poolIds;
    }
  }

  return {
    subsetBoardIds: bestPoolIds,
    selectedBoardIds: sampleDistinctBoardFaces(bestPoolIds, count, pieceMap)
  };
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

function getMostDistantBoardIndex(boardPlacements, dockPlacements, pieceMap) {
  const dockCenters = (dockPlacements || []).map((dockPlacement) => getPlacementCenter(dockPlacement, pieceMap));
  if (!dockCenters.length) {
    return 0;
  }
  let bestIndex = 0;
  let bestDistance = -Infinity;

  boardPlacements.forEach((placement, index) => {
    const center = getPlacementCenter(placement, pieceMap);
    const distance = Math.min(...dockCenters.map((dockCenter) => (
      Math.abs(center.x - dockCenter.x) + Math.abs(center.y - dockCenter.y)
    )));

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

function getTileBelt(tile) {
  return (tile?.features || []).find((feature) => feature.type === "belt") ?? null;
}

function getTileWalls(tile) {
  const walls = new Set();

  for (const feature of tile?.features || []) {
    if (feature.type !== "wall") {
      continue;
    }
    for (const side of feature.sides || []) {
      walls.add(side);
    }
  }

  return walls;
}

function isBlockedBetween(tileMap, from, to, dir) {
  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  const fromWalls = getTileWalls(fromTile);
  const toWalls = getTileWalls(toTile);
  return fromWalls.has(dir) || toWalls.has(OPPOSITE_DIRS[dir]);
}

function getConveyorSuccessor(tileMap, point) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || !CARDINAL_DIRS[belt.dir]) {
    return null;
  }

  const vector = CARDINAL_DIRS[belt.dir];
  const next = {
    x: point.x + vector.dx,
    y: point.y + vector.dy
  };
  const nextTile = tileMap.get(`${next.x},${next.y}`);
  if (!nextTile || isBlockedBetween(tileMap, point, next, belt.dir) || !getTileBelt(nextTile)) {
    return null;
  }

  return next;
}

function getConveyorPredecessors(tileMap, point) {
  if (!tileMap) {
    return [];
  }

  const predecessors = [];
  for (const vector of Object.values(CARDINAL_DIRS)) {
    const previous = {
      x: point.x - vector.dx,
      y: point.y - vector.dy
    };
    const successor = getConveyorSuccessor(tileMap, previous);
    if (successor && successor.x === point.x && successor.y === point.y) {
      predecessors.push(previous);
    }
  }

  return predecessors;
}

function pointStartsClosedConveyorLoop(tileMap, point) {
  if (!tileMap) {
    return false;
  }

  const startKey = `${point.x},${point.y}`;
  const startTile = tileMap.get(startKey);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    return false;
  }

  const visited = new Set();
  let current = { x: point.x, y: point.y };

  for (let step = 0; step < 24; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      return key === startKey;
    }
    visited.add(key);

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      return false;
    }

    current = next;
  }

  return false;
}

function getMovingCheckpointTrace(tileMap, point, cache = null) {
  if (!tileMap) {
    return {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: []
    };
  }

  const cacheKey = `${point.x},${point.y}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const startTile = tileMap.get(cacheKey);
  const startBelt = getTileBelt(startTile);
  if (!startBelt || !CARDINAL_DIRS[startBelt.dir]) {
    const result = {
      moving: false,
      wraps: false,
      pathLength: 1,
      turnCount: 0,
      fastCount: 0,
      hazardLoad: 0,
      coverage: [{ x: point.x, y: point.y }]
    };
    cache?.set(cacheKey, result);
    return result;
  }

  const coverage = [];
  const visited = new Set();
  const directions = [];
  let current = { x: point.x, y: point.y };
  let wraps = false;
  let fastCount = 0;
  let hazardLoad = 0;

  for (let step = 0; step < 24; step += 1) {
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) {
      wraps = true;
      break;
    }

    visited.add(key);
    coverage.push({ x: current.x, y: current.y });
    const tile = tileMap.get(key);
    const belt = getTileBelt(tile);
    if (!belt || !CARDINAL_DIRS[belt.dir]) {
      break;
    }

    directions.push(belt.dir);
    if (belt.speed === 2) {
      fastCount += 1;
    }

    for (const feature of tile?.features || []) {
      if (feature.type === "checkpoint" || feature.type === "wall" || feature.type === "belt" || feature.type === "battery") {
        continue;
      }
      hazardLoad += getTilePenaltyForFeature(feature, { batteryActive: true });
    }

    const next = getConveyorSuccessor(tileMap, current);
    if (!next) {
      break;
    }

    current = next;
  }

  let turnCount = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) {
      turnCount += 1;
    }
  }

  const result = {
    moving: coverage.length > 1,
    wraps,
    pathLength: coverage.length,
    turnCount,
    fastCount,
    hazardLoad: Number(hazardLoad.toFixed(2)),
    coverage
  };
  cache?.set(cacheKey, result);
  return result;
}

function findMovingCheckpointReentryPoint(tileMap, point) {
  if (!tileMap) {
    return { x: point.x, y: point.y };
  }

  if (pointStartsClosedConveyorLoop(tileMap, point)) {
    return { x: point.x, y: point.y };
  }

  const queue = [{ x: point.x, y: point.y, depth: 0 }];
  const visited = new Set([`${point.x},${point.y}`]);
  let best = { x: point.x, y: point.y, depth: 0 };

  while (queue.length) {
    const current = queue.shift();
    const predecessors = getConveyorPredecessors(tileMap, current);

    if (!predecessors.length) {
      if (
        current.depth > best.depth ||
        (current.depth === best.depth && `${current.x},${current.y}` < `${best.x},${best.y}`)
      ) {
        best = current;
      }
      continue;
    }

    for (const predecessor of predecessors) {
      const key = `${predecessor.x},${predecessor.y}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({
        x: predecessor.x,
        y: predecessor.y,
        depth: current.depth + 1
      });
    }
  }

  return { x: best.x, y: best.y };
}

function summarizeMovingTargets(tileMap, checkpoints = []) {
  const traceCache = new Map();
  const active = checkpoints
    .map((checkpoint) => ({
      checkpoint,
      trace: getMovingCheckpointTrace(tileMap, checkpoint, traceCache)
    }))
    .filter((entry) => entry.trace.moving);

  if (!active.length) {
    return {
      activeCount: 0,
      totalPathLength: 0,
      totalTurns: 0,
      totalHazardLoad: 0,
      fastSegments: 0,
      coverageTiles: 0,
      wrapCount: 0,
      difficultyBonus: 0,
      lengthBonus: 0
    };
  }

  const coverageTiles = new Set();
  let totalPathLength = 0;
  let totalTurns = 0;
  let totalHazardLoad = 0;
  let fastSegments = 0;
  let wrapCount = 0;

  for (const { trace } of active) {
    totalPathLength += trace.pathLength;
    totalTurns += trace.turnCount;
    totalHazardLoad += trace.hazardLoad;
    fastSegments += trace.fastCount;
    if (trace.wraps) {
      wrapCount += 1;
    }
    trace.coverage.forEach((tile) => coverageTiles.add(`${tile.x},${tile.y}`));
  }

  const difficultyBonus = Number((
    active.length * 3.8 +
    Math.max(0, totalPathLength - active.length) * 1.15 +
    totalTurns * 0.8 +
    fastSegments * 0.55 +
    totalHazardLoad * 0.16
  ).toFixed(2));
  const lengthBonus = Number((
    active.length * 1.9 +
    Math.max(0, totalPathLength - active.length) * 0.72 +
    totalTurns * 0.35 +
    wrapCount * 0.45
  ).toFixed(2));

  return {
    activeCount: active.length,
    totalPathLength,
    totalTurns,
    totalHazardLoad: Number(totalHazardLoad.toFixed(2)),
    fastSegments,
    coverageTiles: coverageTiles.size,
    wrapCount,
    difficultyBonus,
    lengthBonus
  };
}

function collectMovingTargetReentryMarkers(tileMap, checkpoints = [], enabled = false) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  const traceCache = new Map();
  const markers = checkpoints
    .map((checkpoint, index) => {
      const trace = getMovingCheckpointTrace(tileMap, checkpoint, traceCache);
      if (!trace.moving) {
        return null;
      }

      const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
      return {
        id: index + 1,
        label: `R${index + 1}`,
        x: reentry.x,
        y: reentry.y
      };
    })
    .filter(Boolean);

  const grouped = new Map();
  markers.forEach((marker) => {
    const key = `${marker.x},${marker.y}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(marker.id);
      existing.label = `R${existing.ids.join("/")}`;
      return;
    }

    grouped.set(key, {
      ...marker,
      ids: [marker.id]
    });
  });

  return [...grouped.values()];
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

  const base = byDifficulty[getTuningDifficulty(preferences.difficulty)] ?? byDifficulty.moderate;
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
    } else if (getTuningDifficulty(preferences.difficulty) !== "hard") {
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

function getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences = {}) {
  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  const features = tile?.features || [];
  let penalty = 0;

  for (const feature of features) {
    if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall") {
      continue;
    }

    let featurePenalty = getTilePenaltyForFeature(feature, {
      batteryActive: !preferences.lighterGame
    });

    if (feature.type === "flamethrower") {
      featurePenalty += 5.5;
    } else if (feature.type === "laser") {
      featurePenalty += 3.5 + (feature.damage || 1) * 0.5;
    } else if (feature.type === "push") {
      featurePenalty += 2.8;
    } else if (feature.type === "belt") {
      featurePenalty += feature.speed === 2 ? 1.6 : 0.7;
      if (preferences.movingTargets) {
        featurePenalty *= 0.25;
      }
    } else if (feature.type === "oil") {
      featurePenalty += 2.2;
    } else if (feature.type === "portal") {
      featurePenalty += 3;
    } else if (feature.type === "teleporter") {
      featurePenalty += 3.6;
    }

    penalty += featurePenalty;
  }

  const scale = difficulty === "easy"
    ? 0.72
    : difficulty === "moderate"
      ? 0.32
      : 0;

  return Number((penalty * scale).toFixed(2));
}

function getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences = {}) {
  if (difficulty === "hard") {
    return 0;
  }

  let penalty = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > 2) {
        continue;
      }

      const tile = tileMap.get(`${candidate.x + dx},${candidate.y + dy}`);
      if (!tile) {
        penalty += difficulty === "easy" ? 0.7 : 0.25;
        continue;
      }

      for (const feature of tile.features || []) {
        if (feature.type === "checkpoint" || feature.type === "battery" || feature.type === "wall") {
          continue;
        }

        let featurePenalty = getTilePenaltyForFeature(feature, {
          batteryActive: !preferences.lighterGame
        }) * (dist === 1 ? 0.32 : 0.16);

        if (feature.type === "portal" || feature.type === "teleporter") {
          featurePenalty += dist === 1 ? 1.2 : 0.5;
        } else if (feature.type === "flamethrower") {
          featurePenalty += dist === 1 ? 1.8 : 0.8;
        } else if (feature.type === "laser") {
          featurePenalty += dist === 1 ? 1.1 : 0.45;
        } else if (feature.type === "belt" && feature.speed === 2) {
          featurePenalty += dist === 1 ? 0.7 : 0.25;
        }

        penalty += featurePenalty;
      }
    }
  }

  const scale = difficulty === "easy" ? 0.85 : 0.35;
  return Number((penalty * scale).toFixed(2));
}

function getFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, guidanceLevel, thresholds, previousFlag = null, movingTargetTraceCache = null) {
  let weight = candidate.weight ?? 1;
  const approachStats = getFlagCandidateApproachStats(tileMap, candidate);
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const lengthPreference = preferences.length ?? "moderate";
  const tilePenalty = getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences);
  const areaPenalty = getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences);

  weight += approachStats.openCount * (difficulty === "easy" ? 2.6 : 1.1);
  weight -= approachStats.pitCount * (difficulty === "easy" ? 2.2 : 0.9);
  weight -= approachStats.voidCount * (difficulty === "easy" ? 1.7 : 0.7);
  weight -= tilePenalty + areaPenalty;

  if (sequenceIndex === 0 && starts.length) {
    const distances = starts.map((start) => manhattanDistance(candidate, start));
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    if (nearest >= thresholds.nearest && averageDistance >= thresholds.average) {
      weight += difficulty === "easy" ? 4.2 : 2;
    } else {
      weight -= difficulty === "easy" ? 3.1 : 1.4;
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

  if (preferences.movingTargets) {
    const trace = getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache);
    if (trace.moving) {
      const baseBonus = difficulty === "easy"
        ? 0.9
        : difficulty === "moderate"
          ? 2.8
          : 4.4;
      weight += baseBonus;
      weight += Math.min(2.8, Math.max(0, trace.pathLength - 1) * 0.55);
      weight += trace.turnCount * 0.4;
      weight += trace.fastCount * 0.3;
    }
  }

  weight += Math.min(2, guidanceLevel * 0.35);
  if (difficulty === "easy" && lengthPreference === "short") {
    weight += 1.8;
  } else if (difficulty !== "hard" && lengthPreference !== "long") {
    weight += 0.6;
  }
  return Math.max(0.05, Number(weight.toFixed(2)));
}

function sampleFlagSequence(flagCandidates, flagCount, tileMap, starts, preferences, guidanceLevel, thresholds, movingTargetTraceCache = null) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
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
            previousFlag,
            movingTargetTraceCache
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

function pickFlags(flagCandidates, flagCount, boardPlacements, dockPlacements, pieceMap, starts = [], preferences = {}, guidanceLevel = 0) {
  const farthestBoardIndex = getMostDistantBoardIndex(boardPlacements, dockPlacements, pieceMap);
  const farthestBoardPieceId = boardPlacements[farthestBoardIndex]?.pieceId;
  const mustUseFarthestBoard = boardPlacements.length > 1 && farthestBoardPieceId;
  const firstFlagThresholds = getFirstFlagDistanceThresholds(preferences.length, guidanceLevel);
  const { tileMap } = buildResolvedMap([...boardPlacements, ...(dockPlacements || [])], pieceMap);
  const movingTargetTraceCache = preferences.movingTargets ? new Map() : null;
  const movingCandidates = preferences.movingTargets
    ? new Set(flagCandidates
      .filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache).moving)
      .map((candidate) => `${candidate.x},${candidate.y}`))
    : null;
  const requiresMovingTarget = Boolean(movingCandidates?.size);

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const sampled = sampleFlagSequence(
      flagCandidates,
      flagCount,
      tileMap,
      starts,
      preferences,
      guidanceLevel,
      firstFlagThresholds,
      movingTargetTraceCache
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

    if (requiresMovingTarget && !sampled.some((flag) => movingCandidates.has(`${flag.x},${flag.y}`))) {
      continue;
    }

    return sampled.map(({ x, y }) => ({ x, y }));
  }

  return null;
}

function applyFlagOverrides(tileMap, goals, options = {}) {
  const next = cloneTileMap(tileMap);
  const hazardousFlags = Boolean(options.hazardousFlags);
  const movingTargets = Boolean(options.movingTargets);

  goals.forEach((goal, index) => {
    const key = `${goal.x},${goal.y}`;
    const tile = next.get(key) ?? { x: goal.x, y: goal.y, features: [] };

    if (!hazardousFlags) {
      tile.features = tile.features.filter((feature) => (
        isCheckpointActiveFeature(feature, { movingTargets })
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

function createBoardPlacements(pieceMap, lengthPreference, preferences, guidanceLevel, expansionIds = null, dockPieceId = "docking-bay-a", generationAttempt = 1) {
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds);
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  const maxBoards = Math.min(hasLargeBoards ? 4 : 6, countPhysicalBoards(mainBoardIds, pieceMap));
  const boardCount = weightedBoardCount(lengthPreference, maxBoards, hasLargeBoards, preferences);
  const shouldForceFilteredSubset = generationAttempt >= BOARD_SELECTION_FALLBACK_ATTEMPT;
  let boardIds = [];

  if (!shouldForceFilteredSubset) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidateBoardIds = sampleMany(mainBoardIds, boardCount);
      if (candidateBoardIds.length !== boardCount) {
        continue;
      }
      if (!boardIdsCanSupportDock(candidateBoardIds, pieceMap, dockPieceId)) {
        continue;
      }
      boardIds = candidateBoardIds;
      break;
    }
  }

  if (boardIds.length !== boardCount || shouldForceFilteredSubset) {
    const fallbackSelection = selectBoardIdsForCourse(
      mainBoardIds,
      boardCount,
      pieceMap,
      preferences,
      guidanceLevel,
      lengthPreference
    );
    const fallbackBoardIds = fallbackSelection.selectedBoardIds ?? [];

    if (fallbackBoardIds.length === boardCount && boardIdsCanSupportDock(fallbackBoardIds, pieceMap, dockPieceId)) {
      boardIds = fallbackBoardIds;
    }
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
    const allowDockBridge = !preferences.alignedLayout && index === boardIds.length - 2;
    const extension = preferences.alignedLayout
      ? tryExtendAlignedBoardLayout(placements, nextBoardId, pieceMap)
      : tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, allowDockBridge);
    if (!extension) {
      return null;
    }

    placements = extension.placements;
    layoutValidation = extension.layoutValidation;
  }

  if (!isSmallBoardLayoutAcceptable(placements, pieceMap, layoutValidation, preferences)) {
    return null;
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
  const candidates = [];

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
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: run
        });
      }
    }
  }

  if (!options.alignedLayout && options.allowBridgePlacement) {
    const bridgeCandidate = findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
    if (bridgeCandidate) {
      candidates.push(bridgeCandidate);
    }
  }

  return candidates.length ? sample(candidates) : null;
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

function getDockPlacementsFromScenarioPlacements(placements = [], pieceMap = {}) {
  return placements.filter((placement) => pieceMap[placement.pieceId]?.kind === "dock");
}

function buildDockSummaries(boardPlacements, dockPlacements, pieceMap) {
  return dockPlacements.map((dockPlacement) => ({
    pieceId: dockPlacement.pieceId,
    flipped: Boolean((dockPlacement.rotation ?? 0) % 180),
    boundaryRun: getDockBoundaryRun(boardPlacements, dockPlacement, pieceMap)
  }));
}

function filterDockPlacementsWithReachableStarts(dockPlacements, startAnalyses, pieceMap) {
  return dockPlacements.filter((dockPlacement) => (
    (startAnalyses || []).some((startAnalysis) => (
      startAnalysis.reachable && pointOnPlacement(startAnalysis.start, dockPlacement, pieceMap)
    ))
  ));
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
  const courseAdjustedFirstLeg = options.competitiveMode
    ? {
      ...firstLeg,
      summary: {
        ...firstLeg.summary,
        outliers: []
      }
    }
    : adjustStartOutliersForCourseLength(firstLeg, totalLength);

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

function computeUsableStarts(firstLeg, preferences = {}) {
  if (preferences.competitiveMode) {
    return firstLeg.starts.filter((startAnalysis) => startAnalysis.reachable);
  }

  const outlierSet = new Set(firstLeg.summary.outliers.map((item) => item.index));
  return firstLeg.starts.filter((startAnalysis) => startAnalysis.reachable && !outlierSet.has(startAnalysis.index));
}

function computeCompetitiveBlockImpact(firstLeg, playerCount = 4) {
  const reachable = (firstLeg?.starts || [])
    .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.selectedRoute && Number.isFinite(startAnalysis.adjustedScore))
    .slice()
    .sort((left, right) => left.adjustedScore - right.adjustedScore);

  if (!reachable.length) {
    return {
      blockedStartCount: 0,
      remainingStartCount: 0,
      strongStartCount: 0,
      bestScoreDelta: 0,
      topBandDelta: 0,
      strongStartsRemoved: 0,
      meaningful: false
    };
  }

  const blockCount = Math.min(playerCount, reachable.length);
  const remaining = reachable.slice(blockCount);
  const topBandCount = Math.min(playerCount, reachable.length);
  const baselineTopBand = reachable.slice(0, topBandCount);
  const remainingTopBand = remaining.slice(0, Math.min(topBandCount, remaining.length));
  const scoreStdDev = firstLeg?.summary?.scoreStdDev ?? 0;
  const strongThreshold = (baselineTopBand[baselineTopBand.length - 1]?.adjustedScore ?? reachable[0].adjustedScore) + Math.max(4, scoreStdDev * 0.4);
  const strongStartCount = reachable.filter((item) => item.adjustedScore <= strongThreshold).length;
  const remainingStrongStartCount = remaining.filter((item) => item.adjustedScore <= strongThreshold).length;
  const bestScoreDelta = remaining.length
    ? Number((remaining[0].adjustedScore - reachable[0].adjustedScore).toFixed(2))
    : 0;
  const topBandDelta = remainingTopBand.length
    ? Number((averageValues(remainingTopBand.map((item) => item.adjustedScore)) - averageValues(baselineTopBand.map((item) => item.adjustedScore))).toFixed(2))
    : 0;
  const strongStartsRemoved = strongStartCount - remainingStrongStartCount;
  const meaningfulScoreShift = (
    bestScoreDelta >= Math.max(6, scoreStdDev * 0.7) &&
    topBandDelta >= Math.max(4, scoreStdDev * 0.45)
  );
  const meaningfulStrongDrop = strongStartsRemoved >= Math.max(2, Math.ceil(playerCount * 0.5));
  const meaningful = (
    strongStartCount >= playerCount &&
    remaining.length >= playerCount &&
    (meaningfulScoreShift || meaningfulStrongDrop)
  );

  return {
    blockedStartCount: blockCount,
    remainingStartCount: remaining.length,
    strongStartCount,
    bestScoreDelta,
    topBandDelta,
    strongStartsRemoved,
    meaningful
  };
}

function pointOnPlacement(point, placement, pieceMap) {
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

function overlayFitsWithinBoards(overlayPlacement, boardPlacements, pieceMap) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).every(({ x, y }) => (
    boardPlacements.some((placement) => (
      pointOnPlacement({ x: overlayPlacement.x + x, y: overlayPlacement.y + y }, placement, pieceMap)
    ))
  ));
}

function collectTrackedRouteTileKeys(sequence, usableStarts = []) {
  const keys = new Set();

  usableStarts.forEach((startAnalysis) => {
    (startAnalysis.selectedRoute?.path || []).forEach((point) => {
      keys.add(`${point.x},${point.y}`);
    });
  });

  sequence?.legs?.forEach((leg) => {
    (leg.analysis?.distinctRoutes || []).forEach((route) => {
      (route.path || []).forEach((point) => {
        keys.add(`${point.x},${point.y}`);
      });
    });
  });

  return keys;
}

function overlayTouchesTrackedPlay(overlayPlacement, pieceMap, routeTileKeys, checkpoints = [], radius = 2) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => {
    const absolute = {
      x: overlayPlacement.x + x,
      y: overlayPlacement.y + y
    };

    if (checkpoints.some((checkpoint) => manhattanDistance(absolute, checkpoint) <= radius)) {
      return true;
    }

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) {
          continue;
        }
        if (routeTileKeys.has(`${absolute.x + dx},${absolute.y + dy}`)) {
          return true;
        }
      }
    }

    return false;
  });
}

function overlaySitsUnderCheckpoint(overlayPlacement, pieceMap, checkpoints = []) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => (
    checkpoints.some((checkpoint) => (
      checkpoint.x === overlayPlacement.x + x &&
      checkpoint.y === overlayPlacement.y + y
    ))
  ));
}

function overlayHasCheckpointActiveFeatures(overlayPlacement, pieceMap, checkpoints = [], options = {}) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  const placed = placePiece(piece, overlayPlacement);
  return placed.tiles.some((tile) => (
    checkpoints.some((checkpoint) => checkpoint.x === tile.x && checkpoint.y === tile.y) &&
    (tile.features || []).some((feature) => isCheckpointActiveFeature(feature, options))
  ));
}

function getPlacedOverlayTiles(overlayPlacement, pieceMap) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return [];
  }

  return placePiece(piece, overlayPlacement).tiles;
}

function placementHasLaserFeature(overlayPlacement, pieceMap) {
  return getPlacedOverlayTiles(overlayPlacement, pieceMap).some((tile) => (
    (tile.features || []).some((feature) => feature.type === "laser")
  ));
}

function placementsAreLaserLinked(sourcePlacement, candidatePlacement, pieceMap) {
  const sourceTiles = getPlacedOverlayTiles(sourcePlacement, pieceMap);
  const candidateFeatureMap = new Map(
    getPlacedOverlayTiles(candidatePlacement, pieceMap).map((tile) => [`${tile.x},${tile.y}`, tile.features || []])
  );

  return sourceTiles.some((tile) => {
    const lasers = (tile.features || []).filter((feature) => feature.type === "laser");
    return lasers.some((laser) => {
      const sides = [laser.dir, getOppositeSide(laser.dir)];
      return sides.some((side) => {
        if (tileHasLaserSupportBlock(tile.features || [], side, { includeLowerLedge: true })) {
          return false;
        }

        const delta = CARDINAL_DIRS[side];
        const neighborFeatures = candidateFeatureMap.get(`${tile.x + delta.dx},${tile.y + delta.dy}`);
        if (!neighborFeatures) {
          return false;
        }

        return (
          tileHasLaserSupportBlock(tile.features || [], side, { includeLowerLedge: true }) ||
          tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side)) ||
          tileHasLaserInDirection(neighborFeatures, laser.dir)
        );
      });
    });
  });
}

function pruneIrrelevantOverlayPlacements(overlayPlacements, pieceMap, sequence, usableStarts, checkpoints, options = {}) {
  if (!overlayPlacements?.length) {
    return {
      overlayPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const hazardousFlags = Boolean(options.hazardousFlags);
  const initiallyKept = overlayPlacements.filter((placement) => (
    (
      hazardousFlags ||
      !overlaySitsUnderCheckpoint(placement, pieceMap, checkpoints) ||
      overlayHasCheckpointActiveFeatures(placement, pieceMap, checkpoints, options)
    ) &&
    overlayTouchesTrackedPlay(placement, pieceMap, routeTileKeys, checkpoints, 2)
  ));
  const keptPlacements = [...initiallyKept];
  const keptKeys = new Set(keptPlacements.map((placement) => `${placement.pieceId}@${placement.x},${placement.y},${placement.rotation ?? 0}`));

  let changed = true;
  while (changed) {
    changed = false;
    overlayPlacements.forEach((placement) => {
      const placementKey = `${placement.pieceId}@${placement.x},${placement.y},${placement.rotation ?? 0}`;
      if (keptKeys.has(placementKey) || !placementHasLaserFeature(placement, pieceMap)) {
        return;
      }

      const linkedToKeptLaser = keptPlacements.some((keptPlacement) => (
        placementHasLaserFeature(keptPlacement, pieceMap) &&
        (
          placementsAreLaserLinked(keptPlacement, placement, pieceMap) ||
          placementsAreLaserLinked(placement, keptPlacement, pieceMap)
        )
      ));
      if (!linkedToKeptLaser) {
        return;
      }

      keptPlacements.push(placement);
      keptKeys.add(placementKey);
      changed = true;
    });
  }

  return {
    overlayPlacements: keptPlacements,
    pruned: keptPlacements.length !== overlayPlacements.length
  };
}

function pruneUnusedBoardPlacements(boardPlacements, overlayPlacements, pieceMap, sequence, usableStarts, checkpoints) {
  if ((boardPlacements?.length ?? 0) <= 1) {
    return {
      boardPlacements,
      overlayPlacements,
      pruned: false
    };
  }

  const usedBoards = collectUsedBoardIndices(
    sequence,
    boardPlacements,
    pieceMap,
    usableStarts,
    checkpoints
  );

  if (usedBoards.size === 0 || usedBoards.size >= boardPlacements.length) {
    return {
      boardPlacements,
      overlayPlacements,
      pruned: false
    };
  }

  const nextBoardPlacements = boardPlacements.filter((_, index) => usedBoards.has(index));
  const nextOverlayPlacements = (overlayPlacements || []).filter((placement) => (
    overlayFitsWithinBoards(placement, nextBoardPlacements, pieceMap)
  ));

  return {
    boardPlacements: nextBoardPlacements,
    overlayPlacements: nextOverlayPlacements,
    pruned: nextBoardPlacements.length !== boardPlacements.length || nextOverlayPlacements.length !== (overlayPlacements || []).length
  };
}

function computeLaterCheckpointPressure(tileMap, checkpoints = [], preferences = {}) {
  if (!tileMap || checkpoints.length <= 1) {
    return 0;
  }

  const laterScores = checkpoints
    .slice(1)
    .map((checkpoint) => scoreFlagArea(tileMap, checkpoint, {
      playerCount: preferences.playerCount,
      lessDeadlyGame: preferences.lessDeadlyGame,
      lighterGame: preferences.lighterGame
    }))
    .filter((score) => Number.isFinite(score));

  return laterScores.length ? Number(averageValues(laterScores).toFixed(2)) : 0;
}

function computeDifficultyRaw(sequence, checkpointPressure = 0) {
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
    checkpointPressure * 0.42 +
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
  if (preferences.lessSpammyGame) {
    adjusted *= 0.93;
  }
  if (preferences.lessForeshadowing) {
    adjusted *= 1.1;
  }
  if (preferences.classicSharedDeck) {
    adjusted *= 1.11 + harshness.normalized * 0.11;
  }
  if (preferences.factoryRejects) {
    adjusted *= 1.06;
  }
  if (preferences.actFastMode) {
    const actFastBase = {
      countdown_3m: 0.7,
      countdown_2m: 1.6,
      countdown_1m: 3.1,
      countdown_30s: 5.1,
      last_player_30s: 1.9
    }[preferences.actFastMode] ?? 0;
    adjusted += Number((actFastBase * (0.9 + harshness.normalized * 0.95)).toFixed(2));
  }
  if (preferences.movingTargetStats?.activeCount) {
    adjusted += preferences.movingTargetStats.difficultyBonus;
  }

  return Number(adjusted.toFixed(2));
}

function getCompetitiveModeDifficultyBonus(fairnessStdDev = 0) {
  if (fairnessStdDev <= 2) {
    return 0;
  }
  if (fairnessStdDev <= 6) {
    return Number((((fairnessStdDev - 2) / 4) * 3.5).toFixed(2));
  }
  if (fairnessStdDev <= 10) {
    return Number((3.5 + ((fairnessStdDev - 6) / 4) * 2.5).toFixed(2));
  }
  if (fairnessStdDev <= 16) {
    return Number((6 - ((fairnessStdDev - 10) / 6) * 3).toFixed(2));
  }

  return Number(Math.max(0.5, 3 - (fairnessStdDev - 16) * 0.3).toFixed(2));
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
  const movingTargetLoad = preferences.movingTargetStats?.lengthBonus ?? 0;
  const routeLoad = actionLoad + distanceLoad;
  const frictionLoad = congestionLoad + flagAreaLoad + difficultyLoad + movingTargetLoad;
  const harshness = boardHarshness ?? computeBoardHarshness();
  let raw = Number((checkpointLoad + playerLoad + routeLoad + frictionLoad).toFixed(2));

  if (preferences.lighterGame) {
    raw = Number((raw * 0.89).toFixed(2));
  }
  if (preferences.lessSpammyGame) {
    raw = Number((raw * 0.95).toFixed(2));
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
      movingTargetLoad: Number(movingTargetLoad.toFixed(2)),
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

function getMovingTargetVolatilityPenalty(stats = {}, fairnessStdDev = 0, preferences = {}) {
  if (!stats?.activeCount) {
    return 0;
  }

  const playerScale = Math.max(1, (preferences.playerCount ?? 4) / 4);
  const raw = (
    stats.activeCount * 4.5 +
    Math.max(0, stats.totalPathLength - stats.activeCount) * 0.95 +
    stats.totalTurns * 0.8 +
    stats.fastSegments * 0.7 +
    stats.wrapCount * 1.2 +
    Math.max(0, fairnessStdDev - 6) * 0.35
  ) * playerScale;

  return Number(raw.toFixed(2));
}

function classifyCandidate(sequence, preferences, context = {}) {
  const usableStarts = computeUsableStarts(sequence.firstLeg, preferences);
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const fairnessStdDev = sequence.firstLeg.summary.scoreStdDev;
  const competitiveBlockImpact = preferences.competitiveMode
    ? computeCompetitiveBlockImpact(sequence.firstLeg, preferences.playerCount)
    : null;
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints)
    : summarizeMovingTargets(null, []);
  let difficultyRaw = applyVariantDifficultyModifiers(computeDifficultyRaw(sequence, checkpointPressure), {
    ...preferences,
    movingTargetStats
  }, boardHarshness);
  if (preferences.competitiveMode) {
    difficultyRaw = Number((difficultyRaw + getCompetitiveModeDifficultyBonus(fairnessStdDev)).toFixed(2));
  }
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );
  const lengthRaw = lengthMetrics.raw;

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

  if (preferences.competitiveMode && (
    !competitiveBlockImpact?.meaningful ||
    (competitiveBlockImpact?.strongStartCount ?? 0) < preferences.playerCount ||
    (competitiveBlockImpact?.remainingStartCount ?? 0) < preferences.playerCount
  )) {
    hardFailures.push("competitive-block-impact");
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
  const fairnessPenalty = preferences.competitiveMode
    ? 0
    : fairnessStdDev >= 14 ? fairnessStdDev - 14 : 0;
  const competitiveBlockPenalty = preferences.competitiveMode
    ? (
      Math.max(0, preferences.playerCount - (competitiveBlockImpact?.strongStartCount ?? 0)) * 16 +
      Math.max(0, preferences.playerCount - (competitiveBlockImpact?.remainingStartCount ?? 0)) * 18 +
      (competitiveBlockImpact?.meaningful ? 0 : 24)
    )
    : 0;
  const movingTargetVolatilityPenalty = getMovingTargetVolatilityPenalty(
    movingTargetStats,
    fairnessStdDev,
    preferences
  );
  const fitScore = (
    difficultyFit * 1.2 +
    lengthFit +
    fairnessPenalty * 0.5 +
    competitiveBlockPenalty +
    movingTargetVolatilityPenalty +
    Math.max(0, preferences.playerCount - usableStarts.length) * 20
  );

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
    competitiveBlockImpact,
    checkpointPressure,
    movingTargetStats,
    movingTargetVolatilityPenalty,
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
    `Act Fast used: ${scenario.actFast ? scenario.actFastMode ?? "yes" : "no"}`,
    `Competitive Mode used: ${scenario.competitiveMode ? "yes" : "no"}`,
    `Extra Docks used: ${scenario.extraDocks ? "yes" : "no"}`,
    `Factory Rejects used: ${scenario.factoryRejects ? "yes" : "no"}`,
    `Recovery used: ${scenario.recoveryRule}`,
    `A Lighter Game used: ${scenario.lighterGame ? "yes" : "no"}`,
    `A Less SPAM-Y Game used: ${scenario.lessSpammyGame ? "yes" : "no"}`,
    `A Less Deadly Game used: ${scenario.lessDeadlyGame ? "yes" : "no"}`,
    `A More Deadly Game used: ${scenario.moreDeadlyGame ? "yes" : "no"}`,
    `Shared Deck used: ${scenario.classicSharedDeck ? "yes" : "no"}`,
    `Hazardous Flags used: ${scenario.hazardousFlags ? "yes" : "no"}`,
    `Moving Targets used: ${scenario.movingTargets ? "yes" : "no"}`,
    `Less Foreshadowing used: ${scenario.lessForeshadowing ? "yes" : "no"}`,
    `Staggered Boards used: ${scenario.staggeredBoards ? "yes" : "no"}`,
    `Accepted after ${scenario.attempts} attempt(s)`,
    `Board count: ${scenario.boardCount}`,
    `Boards: ${scenario.mainBoardIds.map((pieceId, index) => `${pieceId}@${scenario.mainRotations[index]}`).join(", ")}`,
    `Flags: ${scenario.checkpoints.map((flag, index) => `#${index + 1}(${flag.x},${flag.y})`).join(", ")}`,
    scenario.rebootTokens?.length
      ? `Reboot tokens: ${scenario.rebootTokens.map((token) => `${token.pieceId}(${token.x},${token.y},${token.dir})`).join(", ")}`
      : "Reboot tokens: none",
    scenario.dockSummaries?.length
      ? `Docks: ${scenario.dockSummaries.map((dock, index) => `${index + 1}:${dock.pieceId}:${dock.boundaryRun?.side ?? "n/a"}:${dock.flipped ? "flipped" : "normal"}`).join(", ")}`
      : "Docks: none",
    `Showing leg: ${legOptions[selectedLegIndex]}`,
    `Goal flag: (${goal.x}, ${goal.y})`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.sequence.starts.length}`,
    `Difficulty raw: ${scenario.metrics.difficultyRaw}`,
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Length inputs: flags ${scenario.metrics.lengthMetrics.inputs.flagCount}, players ${scenario.metrics.lengthMetrics.inputs.playerCount}, actionScore ${scenario.metrics.lengthMetrics.inputs.totalActionLoad}, distanceScore ${scenario.metrics.lengthMetrics.inputs.totalRouteDistance}, congestion ${scenario.metrics.lengthMetrics.inputs.totalCongestion}, flagArea ${scenario.metrics.lengthMetrics.inputs.flagAreaScore}, totalDifficulty ${scenario.metrics.lengthMetrics.inputs.totalDifficulty}`,
    `Length contributions: flags ${scenario.metrics.lengthMetrics.contributions.checkpointLoad}, players ${scenario.metrics.lengthMetrics.contributions.playerLoad}, actions ${scenario.metrics.lengthMetrics.contributions.actionLoad}, distance ${scenario.metrics.lengthMetrics.contributions.distanceLoad}, congestion ${scenario.metrics.lengthMetrics.contributions.congestionLoad}, flagArea ${scenario.metrics.lengthMetrics.contributions.flagAreaLoad}, difficulty ${scenario.metrics.lengthMetrics.contributions.difficultyLoad}, moving-targets ${scenario.metrics.lengthMetrics.contributions.movingTargetLoad}`,
    `Moving target profile: active ${scenario.movingTargetStats?.activeCount ?? 0}, pathTiles ${scenario.movingTargetStats?.totalPathLength ?? 0}, uniqueCoverage ${scenario.movingTargetStats?.coverageTiles ?? 0}, turns ${scenario.movingTargetStats?.totalTurns ?? 0}, fastSegments ${scenario.movingTargetStats?.fastSegments ?? 0}, difficultyBonus ${scenario.movingTargetStats?.difficultyBonus ?? 0}, lengthBonus ${scenario.movingTargetStats?.lengthBonus ?? 0}`,
    `Moving target volatility penalty: ${scenario.metrics.movingTargetVolatilityPenalty ?? 0}`,
    scenario.metrics.competitiveBlockImpact
      ? `Competitive block impact: strongStarts ${scenario.metrics.competitiveBlockImpact.strongStartCount}, remainingAfterBlocks ${scenario.metrics.competitiveBlockImpact.remainingStartCount}, bestDelta ${scenario.metrics.competitiveBlockImpact.bestScoreDelta}, topBandDelta ${scenario.metrics.competitiveBlockImpact.topBandDelta}, strongRemoved ${scenario.metrics.competitiveBlockImpact.strongStartsRemoved}, meaningful ${scenario.metrics.competitiveBlockImpact.meaningful ? "yes" : "no"}`
      : "Competitive block impact: n/a",
    scenario.movingTargetReentryMarkers?.length
      ? `Moving target re-entry: ${scenario.movingTargetReentryMarkers.map((marker) => `${marker.label}(${marker.x},${marker.y})`).join(", ")}`
      : "Moving target re-entry: none",
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

function getBoardViewMode() {
  return document.getElementById("board-view-mode")?.value ?? BOARD_VIEW_MODES.photos;
}

function updateDevView() {
  const enabled = isDevViewEnabled();
  document.getElementById("trace-leg-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("report-panel")?.classList.toggle("hidden", !enabled);
  document.getElementById("board-audit-toggle-label")?.classList.toggle("hidden", !enabled);
  document.getElementById("run-diagnostics")?.classList.add("hidden");
  updateBoardAuditVisibility();
}

function canvasHasVisibleCourse(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return false;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return false;
  }

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelStride = Math.max(1, Math.floor((data.length / 4) / 4000));

  for (let index = 0; index < data.length; index += pixelStride * 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];

    if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) {
      return true;
    }
  }

  return false;
}

function drawCanvasFailureNotice(canvas, message) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  canvas.width = 880;
  canvas.height = 220;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f7f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#2a333a";
  ctx.font = "bold 26px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Course Render Failed", 36, 68);

  ctx.fillStyle = "#58636c";
  ctx.font = "16px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(message, 36, 108);

  ctx.fillStyle = "#7a4e00";
  ctx.font = "bold 15px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText("Try rerolling. If it happens again, inspect the generated scenario.", 36, 152);
}

function getScenarioRenderState(scenario) {
  const legSelect = document.getElementById("leg-select");
  const devViewEnabled = isDevViewEnabled();
  const selectedLegValue = !devViewEnabled
    ? "none"
    : legSelect.value === "none"
    ? "none"
    : scenario.sequence.legs.some((_, index) => String(index) === legSelect.value)
      ? legSelect.value
      : "none";
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
  const boardViewMode = getBoardViewMode();
  const iconBoardView = boardViewMode === BOARD_VIEW_MODES.icons;
  const unusableStartIndices = scenario.sequence.firstLeg.starts
    .filter((startAnalysis) => !scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index))
    .map((startAnalysis) => startAnalysis.index);

  return {
    devViewEnabled,
    goal,
    iconBoardView,
    renderAnalysis,
    selectedLegIndex,
    unusableStartIndices
  };
}

function drawScenarioCanvas(scenario) {
  lastRenderDiagnostics.blankFallbackTriggered = false;
  const {
    devViewEnabled,
    goal,
    iconBoardView,
    renderAnalysis,
    selectedLegIndex,
    unusableStartIndices
  } = getScenarioRenderState(scenario);
  const canvas = document.getElementById("canvas");
  const renderOptions = {
    placements: scenario.placements,
    goal,
    analysis: renderAnalysis,
    goals: scenario.checkpoints,
    reentryMarkers: hasMovingTargetsEffect(scenario) ? scenario.movingTargetReentryMarkers : [],
    starts: scenario.activeStarts,
    rebootTokens: scenario.rebootTokens,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    edgeOutlineColor: scenario.lessDeadlyGame ? "#f2c230" : null,
    showBoardLabels: devViewEnabled && selectedLegIndex !== null && !iconBoardView,
    showStartFacing: devViewEnabled && selectedLegIndex !== null,
    showWalls: iconBoardView || (devViewEnabled && selectedLegIndex !== null),
    showPieceImages: !iconBoardView,
    showFootprints: true,
    showFeatureIcons: iconBoardView
  };

  render(canvas, scenario.pieceMap, scenario.imageMap, renderOptions);

  if (!canvasHasVisibleCourse(canvas)) {
    render(canvas, scenario.pieceMap, scenario.imageMap, {
      ...renderOptions,
      showBoardLabels: true,
      showStartFacing: true,
      showWalls: true,
      showPieceImages: false,
      showFeatureIcons: true
    });

    if (!canvasHasVisibleCourse(canvas)) {
      console.warn("Scenario rendered blank", {
        preferences: scenario.preferences,
        placements: scenario.placements,
        checkpoints: scenario.checkpoints,
        boardCount: scenario.boardCount
      });
      lastRenderDiagnostics.blankFallbackTriggered = true;
      drawCanvasFailureNotice(canvas, "The generated course data could not be drawn to the board canvas.");
    }
  }

  return { devViewEnabled, selectedLegIndex };
}

function ensureScenarioAnimationLoop() {
  if (scenarioAnimationFrameId !== null) {
    return;
  }

  const tick = () => {
    scenarioAnimationFrameId = requestAnimationFrame(tick);
    if (!currentScenario || document.hidden) {
      return;
    }
    drawScenarioCanvas(currentScenario);
  };

  scenarioAnimationFrameId = requestAnimationFrame(tick);
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
  const renderState = drawScenarioCanvas(scenario);

  if (renderState.devViewEnabled) {
    document.getElementById("report").textContent = buildScenarioReport(scenario, renderState.selectedLegIndex ?? 0);
  }
}

function validateSelectedInventory(assets, preferences) {
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(assets.pieceMap, expansionIds, preferences);
  if (!availableDockIds.length) {
    return "The selected sets contain no docking bay. Enable a set with a docking bay to generate a course.";
  }
  if (!canSupportRequiredDockStarts(availableDockIds, assets.pieceMap, preferences)) {
    const requiredStarts = getRequiredDockStartCount(preferences);
    return `The selected sets do not provide enough dock starting spaces for this setup (${requiredStarts} needed).`;
  }
  if (!getDockConfigurations(availableDockIds, assets.pieceMap, preferences).length) {
    return getExtraDockModeState(preferences) === "forced"
      ? "Extra Docks is required, but the selected sets do not provide a valid two-dock combination."
      : "The selected sets do not provide a valid docking bay setup for these rules.";
  }

  const availableMainBoardIds = getAvailableMainBoardIds(assets.pieceMap, expansionIds);
  if (!availableMainBoardIds.length) {
    return "The selected sets contain no supported main boards for course generation yet.";
  }

  return null;
}

function getFlagRetryBudget(preferences = {}, remainingEvaluations = 1) {
  const difficulty = getTuningDifficulty(preferences.difficulty);
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
  const difficulty = getTuningDifficulty(preferences.difficulty);
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
    alignedLayout,
    actFast,
    competitiveMode,
    extraDocks,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    moreDeadlyGame,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing,
    variantComplexityBudget,
    variantComplexityUsed
  } = variantBundle;
  const actFastMode = actFast ? chooseActFastMode(preferences) : null;
  const generationPreferences = {
    ...preferences,
    generationAttempt: attempt,
    alignedLayout,
    actFast,
    actFastMode,
    competitiveMode,
    extraDocks
  };
  const dockConfigurations = weightedOrder(
    getDockConfigurations(availableDockIds, pieceMap, generationPreferences).map((dockIds) => (
      [...dockIds].sort((left, right) => getDockSelectionWeight(pieceMap[right], generationPreferences) - getDockSelectionWeight(pieceMap[left], generationPreferences))
    )),
    (dockIds) => dockIds.reduce((sum, dockId) => sum + getDockSelectionWeight(pieceMap[dockId], generationPreferences), 0)
  );
  const guidanceLevel = guidanceLevelForAttempt(attempt);
  const orderedDockIds = weightedOrder(
    availableDockIds,
    (dockId) => getDockSelectionWeight(pieceMap[dockId], generationPreferences)
  );
  let boardLayout = null;
  let dockPlacements = [];
  let dockSummaries = [];

  for (const dockConfiguration of dockConfigurations.length ? dockConfigurations : orderedDockIds.map((dockId) => [dockId])) {
    const candidateDockId = dockConfiguration[0];
    const candidateBoardLayout = createBoardPlacements(
      pieceMap,
      generationPreferences.length,
      generationPreferences,
      guidanceLevel,
      expansionIds,
      candidateDockId,
      attempt
    );
    if (!candidateBoardLayout) {
      continue;
    }

    const candidateDockPlacements = [];
    let validDockSet = true;

    for (const dockId of dockConfiguration) {
      const flipOrder = shuffle([false, true]);
      let placedDock = null;
      for (const candidateFlip of flipOrder) {
        placedDock = createDockPlacement(
          [...candidateBoardLayout.placements, ...candidateDockPlacements],
          pieceMap,
          dockId,
          candidateFlip,
          {
            alignedLayout: generationPreferences.alignedLayout,
            allowBridgePlacement: true
          }
        );
        if (placedDock) {
          candidateDockPlacements.push(placedDock.dockPlacement);
          break;
        }
      }

      if (!placedDock) {
        validDockSet = false;
        break;
      }
    }

    if (!validDockSet || !candidateDockPlacements.length) {
      continue;
    }

    boardLayout = candidateBoardLayout;
    dockPlacements = candidateDockPlacements;
    dockSummaries = buildDockSummaries(boardLayout.placements, dockPlacements, pieceMap);
    break;
  }

  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const overlayPlacements = chooseOverlayPlacements(boardLayout.placements, dockPlacements, pieceMap, generationPreferences, expansionIds);

  const placements = [
    ...boardLayout.placements,
    ...dockPlacements,
    ...overlayPlacements
  ];
  const boardRects = buildBoardRects(boardLayout.placements, pieceMap);

  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const flagCandidates = getFlagCandidates(placements, pieceMap);
  const movingTargetsForced = isVariantForced(preferences, "movingTargets");
  const movingTargetTraceCache = movingTargets ? new Map() : null;
  const movingCheckpointCandidateCount = movingTargets
    ? flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache).moving).length
    : 0;

  if (movingTargetsForced && movingCheckpointCandidateCount === 0) {
    return {
      scenario: null,
      evaluationsUsed: 1
    };
  }

  const flagCount = Math.min(weightedFlagCount(generationPreferences.length, flagCandidates.length), flagCandidates.length);
  const retryBudget = getFlagRetryBudget(generationPreferences, remainingEvaluations);
  const stallLimit = getFlagRetryStallLimit(generationPreferences);
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
      dockPlacements,
      pieceMap,
      starts,
      { ...generationPreferences, hazardousFlags, movingTargets },
      guidanceLevel
    );

    if (!checkpoints) {
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) {
        break;
      }
      continue;
    }

    let scenarioBoardPlacements = boardLayout.placements;
    let scenarioDockPlacements = dockPlacements;
    let scenarioOverlayPlacements = overlayPlacements;
    let scenarioPlacements = placements;
    let scenarioBoardRects = boardRects;
    let scenarioTileMap = tileMap;
    let goalTileMap = scenarioTileMap;
    let activeStarts = filterStartsForGoals(starts, checkpoints);
    let rebootTokens = [];
    let sequence = null;

    for (let pass = 0; pass < 4; pass += 1) {
      scenarioPlacements = [
        ...scenarioBoardPlacements,
        ...scenarioDockPlacements,
        ...scenarioOverlayPlacements
      ];
      scenarioBoardRects = buildBoardRects(scenarioBoardPlacements, pieceMap);
      const resolved = buildResolvedMap(scenarioPlacements, pieceMap);
      scenarioTileMap = resolved.tileMap;
      rebootTokens = recoveryRule === "reboot_tokens"
        ? placeRebootTokens(scenarioBoardRects, pieceMap, scenarioTileMap, checkpoints, preferences.playerCount)
        : [];
      goalTileMap = applyFlagOverrides(scenarioTileMap, checkpoints, { hazardousFlags, movingTargets });
      activeStarts = filterStartsForGoals(resolved.starts, checkpoints);
      sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, preferences.playerCount, {
        competitiveMode,
        recoveryRule,
        lessDeadlyGame,
        lessSpammyGame,
        moreDeadlyGame,
        lighterGame,
        hazardousFlags,
        lessForeshadowing,
        rebootTokens,
        boardRects: scenarioBoardRects
      });

      const prunedDockPlacements = filterDockPlacementsWithReachableStarts(scenarioDockPlacements, sequence.firstLeg.starts, pieceMap);
      if (prunedDockPlacements.length && prunedDockPlacements.length !== scenarioDockPlacements.length) {
        scenarioDockPlacements = prunedDockPlacements;
        continue;
      }

      const usableStarts = computeUsableStarts(sequence.firstLeg, { competitiveMode });
      const prunedBoards = pruneUnusedBoardPlacements(
        scenarioBoardPlacements,
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints
      );
      if (prunedBoards.pruned) {
        scenarioBoardPlacements = prunedBoards.boardPlacements;
        scenarioOverlayPlacements = prunedBoards.overlayPlacements;
        continue;
      }

      const prunedOverlays = pruneIrrelevantOverlayPlacements(
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        { hazardousFlags }
      );
      if (prunedOverlays.pruned) {
        scenarioOverlayPlacements = prunedOverlays.overlayPlacements;
        continue;
      }

      break;
    }
    const metrics = classifyCandidate(sequence, {
      ...generationPreferences,
      actFast,
      actFastMode,
      flagCount,
      classicSharedDeck,
      factoryRejects,
      hazardousFlags,
      movingTargets,
      lighterGame,
      lessSpammyGame,
      lessForeshadowing
    }, {
      boardPlacements: scenarioBoardPlacements,
      pieceMap,
      checkpoints,
      tileMap: scenarioTileMap
    });
    scenarioPlacements = [
      ...scenarioBoardPlacements,
      ...scenarioDockPlacements,
      ...scenarioOverlayPlacements
    ];
    const finalOverlayPlacements = scenarioPlacements.filter((placement) => placement.overlay);
    const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(scenarioTileMap, checkpoints, movingTargets);
    const scenario = {
      pieceMap: assets.pieceMap,
      imageMap: assets.imageMap,
      placements: scenarioPlacements,
      overlayPlacements: finalOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      dockSummaries: buildDockSummaries(scenarioBoardPlacements, scenarioDockPlacements, pieceMap),
      checkpoints,
      rebootTokens,
      goalTileMap,
      activeStarts,
      playerCount: preferences.playerCount,
      actFast,
      actFastMode,
      competitiveMode,
      extraDocks: scenarioDockPlacements.length > 1,
      factoryRejects,
      recoveryRule,
      lessDeadlyGame,
      lessSpammyGame,
      moreDeadlyGame,
      lighterGame,
      classicSharedDeck,
      hazardousFlags,
      movingTargets,
      staggeredBoards,
      lessForeshadowing,
      variantComplexityBudget,
      variantComplexityUsed,
      mainBoardIds: scenarioBoardPlacements.map((placement) => placement.pieceId),
      mainRotations: scenarioBoardPlacements.map((placement) => placement.rotation),
      boardCount: scenarioBoardPlacements.length,
      boardRects: scenarioBoardRects,
      guidanceLevel,
      sequence,
      metrics,
      movingTargetStats: metrics.movingTargetStats,
      movingTargetReentryMarkers,
      preferences: {
        ...generationPreferences,
        actFast,
        actFastMode,
        competitiveMode,
        extraDocks: scenarioDockPlacements.length > 1,
        factoryRejects,
        flagCount,
        classicSharedDeck,
        hazardousFlags,
        movingTargets,
        lessSpammyGame,
        staggeredBoards
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
    actFast: scenario.actFast,
    actFastMode: scenario.actFastMode,
    competitiveMode: scenario.competitiveMode,
    extraDocks: scenario.extraDocks,
    factoryRejects: scenario.factoryRejects,
    recoveryRule: scenario.recoveryRule,
    lessDeadlyGame: scenario.lessDeadlyGame,
    lessSpammyGame: scenario.lessSpammyGame,
    moreDeadlyGame: scenario.moreDeadlyGame,
    lighterGame: scenario.lighterGame,
    classicSharedDeck: scenario.classicSharedDeck,
    hazardousFlags: scenario.hazardousFlags,
    movingTargets: scenario.movingTargets,
    staggeredBoards: scenario.staggeredBoards,
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
  const actFast = Boolean(snapshot.actFast);
  const actFastMode = snapshot.actFastMode ?? null;
  const recoveryRule = snapshot.recoveryRule ?? "reboot_tokens";
  const competitiveMode = Boolean(snapshot.competitiveMode);
  const factoryRejects = Boolean(snapshot.factoryRejects);
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const lessSpammyGame = Boolean(snapshot.lessSpammyGame);
  const moreDeadlyGame = Boolean(snapshot.moreDeadlyGame);
  const lighterGame = Boolean(snapshot.lighterGame);
  const classicSharedDeck = Boolean(snapshot.classicSharedDeck);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const movingTargets = Boolean(snapshot.movingTargets);
  const staggeredBoards = Boolean(snapshot.staggeredBoards);
  const lessForeshadowing = Boolean(snapshot.lessForeshadowing);
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const rebootTokens = snapshot.rebootTokens || [];
  const boardPlacements = placements.filter((placement) => {
    const kind = assets.pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, assets.pieceMap);
  const extraDocks = dockPlacements.length > 1;
  const boardRects = buildBoardRects(boardPlacements, pieceMap);

  if (!dockPlacements.length || !boardPlacements.length) {
    return null;
  }

  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags, movingTargets });
  const activeStarts = filterStartsForGoals(starts, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, activeStarts, checkpoints, snapshot.preferences.playerCount, {
    competitiveMode,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    moreDeadlyGame,
    lighterGame,
    hazardousFlags,
    lessForeshadowing,
    rebootTokens,
    boardRects
  });
  const metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    actFast,
    actFastMode,
    recoveryRule,
    flagCount: checkpoints.length,
    classicSharedDeck,
    factoryRejects,
    hazardousFlags,
    movingTargets,
    lighterGame,
    lessSpammyGame,
    lessForeshadowing
  }, {
    boardPlacements,
    pieceMap,
    checkpoints,
    tileMap
  });
  const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(tileMap, checkpoints, movingTargets);

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    dockPlacements,
    dockSummaries: buildDockSummaries(boardPlacements, dockPlacements, pieceMap),
    checkpoints,
    rebootTokens,
    goalTileMap,
    activeStarts,
    playerCount: snapshot.preferences.playerCount,
    actFast,
    actFastMode,
    competitiveMode,
    extraDocks,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    moreDeadlyGame,
    lighterGame,
    classicSharedDeck,
    hazardousFlags,
    movingTargets,
    staggeredBoards,
    lessForeshadowing,
    variantComplexityBudget: 0,
    variantComplexityUsed: 0,
    mainBoardIds: boardPlacements.map((placement) => placement.pieceId),
    mainRotations: boardPlacements.map((placement) => placement.rotation),
    boardCount: boardPlacements.length,
    boardRects,
    guidanceLevel: 0,
    sequence,
    metrics,
    movingTargetStats: metrics.movingTargetStats,
    movingTargetReentryMarkers,
    preferences: {
      ...snapshot.preferences,
      actFast,
      actFastMode,
      competitiveMode,
      extraDocks,
      factoryRejects,
      recoveryRule,
      flagCount: checkpoints.length,
      classicSharedDeck,
      hazardousFlags,
      movingTargets,
      lessSpammyGame,
      staggeredBoards
    },
    attempts: snapshot.attempts ?? 0
  };
}

async function generateScenarioForPreferences(assets, preferences, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const onProgress = options.onProgress ?? null;
  let bestScenario = null;
  let crashedAttempts = 0;
  let lastAttemptError = null;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const remainingAttempts = maxAttempts - attempt;
    const attemptLabel = attempt + 1;
    let result;
    try {
      result = await createRandomCandidate(
        assets,
        preferences,
        attemptLabel,
        remainingAttempts,
        async (localEvaluations) => {
          if (!onProgress) {
            return;
          }
          const visibleAttempt = Math.min(maxAttempts, attempt + localEvaluations);
          await onProgress(visibleAttempt, maxAttempts);
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
      return {
        scenario,
        attemptsUsed: attempt,
        crashedAttempts,
        lastAttemptError,
        accepted: true
      };
    }

    if (onProgress && attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      await onProgress(attempt, maxAttempts);
    }
  }

  return {
    scenario: bestScenario,
    attemptsUsed: attempt,
    crashedAttempts,
    lastAttemptError,
    accepted: false
  };
}

function detectScenarioExplanationIssues(scenario) {
  const issues = [];
  const explanationHtml = buildCourseExplanationHtml(scenario, []);
  const checks = [
    {
      active: scenario.metrics.difficultyDirection === "high",
      tokens: ["softens the board pressure", "makes recovery cleaner"]
    },
    {
      active: scenario.metrics.difficultyDirection === "low",
      tokens: [
        "planning more demanding",
        "less forgiving",
        "harder to plan ahead",
        "reduces planning flexibility",
        "extra uncertainty"
      ]
    },
    {
      active: scenario.metrics.lengthDirection === "high",
      tokens: ["keeps turns moving", "trims some board friction"]
    },
    {
      active: scenario.metrics.lengthDirection === "low",
      tokens: ["add extra repositioning"]
    }
  ];

  checks.forEach((check) => {
    if (!check.active) {
      return;
    }
    check.tokens.forEach((token) => {
      if (explanationHtml.includes(token)) {
        issues.push(`note-contradiction:${token}`);
      }
    });
  });

  return issues;
}

function buildDiagnosticsCases(basePreferences) {
  const cases = [];

  for (const playerCount of DIAGNOSTIC_PLAYER_COUNTS) {
    for (const difficulty of DIAGNOSTIC_DIFFICULTIES) {
      for (const length of DIAGNOSTIC_LENGTHS) {
        cases.push({
          label: `${playerCount}p ${difficulty} ${length}`,
          preferences: {
            ...basePreferences,
            playerCount,
            difficulty,
            length
          }
        });
      }
    }
  }

  return cases;
}

async function runDiagnostics() {
  const button = document.getElementById("run-diagnostics");
  const reportEl = document.getElementById("report");
  const assets = await loadAssets();
  const basePreferences = getPreferencesFromControls();
  const cases = buildDiagnosticsCases(basePreferences);
  const results = [];
  const previousScenario = currentScenario;

  button.disabled = true;
  document.getElementById("dev-view").checked = true;
  updateDevView();
  reportEl.textContent = `Running diagnostics across ${cases.length} cases...\n`;

  for (const [index, testCase] of cases.entries()) {
    reportEl.textContent = `Running diagnostics: case ${index + 1} of ${cases.length}\nCurrent: ${testCase.label}\n`;
    const inventoryError = validateSelectedInventory(assets, testCase.preferences);
    if (inventoryError) {
      results.push({
        label: testCase.label,
        issues: [`inventory:${inventoryError}`]
      });
      continue;
    }

    const generation = await generateScenarioForPreferences(assets, testCase.preferences, {
      maxAttempts: DIAGNOSTIC_ATTEMPTS
    });
    const issues = [];

    if (!generation.scenario) {
      issues.push(generation.lastAttemptError
        ? `generation-failed:${generation.lastAttemptError.message}`
        : "generation-failed");
      results.push({
        label: testCase.label,
        issues,
        attemptsUsed: generation.attemptsUsed
      });
      continue;
    }

    renderScenario(generation.scenario);

    if (lastRenderDiagnostics.blankFallbackTriggered) {
      issues.push("blank-render");
    }
    issues.push(...generation.scenario.metrics.hardFailures);
    issues.push(...detectScenarioExplanationIssues(generation.scenario));

    results.push({
      label: testCase.label,
      issues: [...new Set(issues)],
      attemptsUsed: generation.attemptsUsed,
      accepted: generation.accepted,
      fitScore: generation.scenario.metrics.fitScore
    });
  }

  currentScenario = previousScenario;
  if (currentScenario) {
    renderScenario(currentScenario);
  }

  const failures = results.filter((item) => item.issues.length);
  const summaryLines = [
    `Diagnostics complete: ${results.length} cases`,
    `Failures: ${failures.length}`,
    ""
  ];

  if (failures.length) {
    failures.forEach((failure) => {
      summaryLines.push(`${failure.label}: ${failure.issues.join(", ")}${failure.fitScore !== undefined ? ` | fit ${failure.fitScore}` : ""}${failure.attemptsUsed ? ` | attempts ${failure.attemptsUsed}` : ""}`);
    });
  } else {
    summaryLines.push("No diagnostic issues detected in the sampled matrix.");
  }

  reportEl.textContent = summaryLines.join("\n");
  button.disabled = false;
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

  const generation = await generateScenarioForPreferences(assets, preferences, {
    maxAttempts: MAX_ATTEMPTS,
    onProgress: async (attempt, maxAttempts) => {
      setGeneratingOverlay(true, `Attempt ${attempt} of ${maxAttempts}: still looking for ${formatOverlaySearchTarget(preferences)}.`);
      await nextFrame();
    }
  });

  if (!generation.scenario) {
    setGeneratingOverlay(false);
    window.alert(
      generation.crashedAttempts > 0 && generation.lastAttemptError
        ? `Course generation failed after ${MAX_ATTEMPTS} attempts. Last error: ${generation.lastAttemptError.message}`
        : `Course generation failed after ${MAX_ATTEMPTS} attempts.`
    );
    return;
  }

  currentScenario = generation.scenario;
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

document.getElementById("run-diagnostics").addEventListener("click", () => {
  runDiagnostics().catch((error) => {
    document.getElementById("report").textContent = `Diagnostics failed: ${error.message}`;
    document.getElementById("run-diagnostics").disabled = false;
    console.error(error);
  });
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

document.getElementById("board-view-mode").addEventListener("change", () => {
  if (currentScenario) {
    renderScenario(currentScenario);
  }
});

document.getElementById("course-explanation-toggle").addEventListener("click", () => {
  if (!currentScenario) {
    return;
  }

  const requestedDifficulty = currentScenario.preferences.difficulty;
  const difficultyFit = currentScenario.metrics.difficultyFit ?? 0;
  const lengthFit = currentScenario.metrics.lengthFit ?? 0;
  const moderateDifficultyThreshold = requestedDifficulty === "easy" ? 20 : 14;
  const autoOpen = (
    (currentScenario.preferences.difficulty !== "any" && difficultyFit >= moderateDifficultyThreshold) ||
    (currentScenario.preferences.length !== "any" && lengthFit >= 14)
  );
  const currentlyVisible = courseExplanationState.manualOpen ?? autoOpen;
  courseExplanationState.manualOpen = !currentlyVisible;
  renderScenario(currentScenario);
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

document.getElementById("variant-rules-menu").addEventListener("click", (event) => {
  const button = event.target.closest(".variant-state");
  if (!button) {
    return;
  }

  cycleVariantControlState(button.dataset.variantId);
});

document.getElementById("expansion-roborally").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-30th-anniversary").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-master-builder").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-thrills-and-spills").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-chaos-and-carnage").addEventListener("change", () => {
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
  ensureScenarioAnimationLoop();
  renderVariantControls();
  updateExpansionSummary();
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
