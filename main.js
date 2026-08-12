const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;

const [
  { render },
  { analyzeCourse, analyzeFullCourse, analyzeFlagLeg, analyzeGoalApproaches, clearAnalysisCaches, evaluateFullCourseFocusUnderOccupancy, evaluateFullCourseSubsetTraffic, getAnalysisTelemetrySnapshot, recomputeFirstLegPressure, resetAnalysisTelemetry, scoreFlagArea },
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
    getEffectiveLaserDamage,
    getTilePenaltyForFeature
  },
  {
    formatFeatureLabel,
    getFeatureTypeSymbol
  },
  {
    getVariantAvailabilityRule,
    getVariantDefinition: getRegisteredVariantDefinition,
    getVariantRequirementIds,
    VARIANT_CONTROL_IDS,
    VARIANT_DEFINITIONS,
    VARIANT_STATES,
    applyVariantAnalysisOptions,
    applyVariantGenerationOptions,
    applyVariantScenarioState,
    buildVariantBundle
  },
  { buildCourseNotesHtml, clearCourseNotesCache }
] = await Promise.all([
  import(versionedPath("./render.js")),
  import(versionedPath("./analyze.js")),
  import(versionedPath("./board.js")),
  import(versionedPath("./feature-weights.js")),
  import(versionedPath("./feature-meta.js")),
  import(versionedPath("./variants.js")),
  import(versionedPath("./course-notes.js"))
]);

// Cache clearing is a performance optimization, not a correctness requirement.
// Keep startup/generation working if the browser temporarily resolves an older
// analyze.js module that does not expose this helper.
const clearAnalysisCachesSafe = typeof clearAnalysisCaches === "function"
  ? clearAnalysisCaches
  : () => {};

const resetAnalysisTelemetrySafe = typeof resetAnalysisTelemetry === "function"
  ? resetAnalysisTelemetry
  : () => {};
const getAnalysisTelemetrySnapshotSafe = typeof getAnalysisTelemetrySnapshot === "function"
  ? getAnalysisTelemetrySnapshot
  : () => ({
    routeSearches: [],
    routeSearchCount: 0,
    totalExpansions: 0,
    totalDurationMs: 0,
    cappedSearches: 0,
    slowestSearch: null,
    totalsByKind: {},
    contextualProfileTotals: {
      queueMs: 0,
      currentKeyMs: 0,
      goalCompletionMs: 0,
      simulationMs: 0,
      actionScoringMs: 0,
      historyBuildMs: 0,
      destinationBuildMs: 0,
      nextKeyMs: 0,
      dominanceMs: 0,
      actionCandidates: 0,
      simulationCalls: 0,
      blockedTransitions: 0,
      destinationCandidates: 0,
      acceptedStates: 0,
      dominatedStates: 0,
      completedGoals: 0,
      physicalCacheHits: 0,
      physicalCacheMisses: 0
    }
  });

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
const MAX_ATTEMPTS = 20;
const GENERATION_SOFT_EXPANSION_BUDGET = 500000;
const GENERATION_SOFT_BUDGET_MIN_ATTEMPTS = 8;
const DIAGNOSTIC_ATTEMPTS = 24;
const DIAGNOSTIC_PLAYER_COUNTS = [2, 4, 6];
const DIAGNOSTIC_DIFFICULTIES = ["easy", "moderate", "hard", "brutal"];
const DIAGNOSTIC_LENGTHS = ["short", "moderate", "long"];
const MIN_LENGTH_RAW = 28;
const MIN_SHARED_EDGE = 5;
const DOCK_BRIDGE_GAP = 3;
const MAX_DOCK_COUNT = 2;
const DEFAULT_STARTING_ENERGY = 4;
// Passive border geometry that may coexist with a No-Docks starting square.
// Active edge devices (lasers, push panels, flamethrowers) are deliberately
// excluded even though they are encoded directionally on an edge: a player
// should not be offered a start directly on an active emitter/pusher tile.
const NO_DOCK_START_EDGE_FEATURE_TYPES = new Set([
  "wall",
  "redWall",
  "greenWall",
  "repulsor",
  "ledge"
]);
const START_CAPACITY_HARD_FAILURES = new Set(["usable-starts", "reachable-starts", "normal-start-balance"]);
const OVERLAY_UPDATE_INTERVAL = 4;
const LIGHT_START_MIN_POOL = 8;
const LIGHT_START_SURPLUS = 2;
const LIGHT_START_MAX_PRESSURE_POOL = 10;
const LIGHT_START_SPREAD_WEIGHT = 0.22;
const LIGHT_START_MAX_EXPANSIONS = 7000;
const LIGHT_START_MAX_ACTIONS = 18;
const LIGHT_START_OUTLIER_Z = 2.5;
const FULL_START_OUTLIER_Z = 2.25;
const NORMAL_START_FAIRNESS_STDDEV_LIMIT = 14;
const SCENARIO_RENDER_INTERVAL_MS = 125;
const BOARD_SELECTION_FALLBACK_ATTEMPT = 12;
const BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD = 0.16;
const BOARD_PROFILE_HAZARD_DENSITY_WEIGHT = 2.4;
const SAVED_SCENARIO_KEY = "roborally-course-generator:last-scenario";
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
  "concentric",
  "confusion",
  "convergence",
  "docking-bay-a",
  "docking-bay-b",
  "double-helix",
  "double-zap",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "in-and-out",
  "chasm",
  "falling",
  "gear-box",
  "labyrinth",
  "laser-maze",
  "links",
  "locked",
  "meeple",
  "mergers",
  "merry-go-round",
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
  "sampler",
  "spin-class",
  "sidewinder",
  "steps",
  "stop-and-go",
  "straight-a-ways",
  "styx",
  "tabula-rasa",
  "tempest",
  "the-abyss",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-pits",
  "the-wave",
  "the-x",
  "the-zone",
  "toasted",
  "transition",
  "trench-run",
  "vacancy",
  "water-park",
  "winding",
  "whirlpool"
];
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
let lastScenarioRenderTime = 0;
let isGenerating = false;
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
let routeInspectionState = {
  kind: null,
  key: null
};
let traceSelectionState = {
  startIndices: new Set()
};
let lastRenderDiagnostics = {
  blankFallbackTriggered: false
};

function createVariantRuleNameElement(variant) {
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = variant.label;
  return nameEl;
}

function createVariantCategoryBulkRow(category) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule variant-bulk-rule";

  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";

  const buttonEl = document.createElement("button");
  buttonEl.className = "variant-state";
  buttonEl.type = "button";
  buttonEl.dataset.variantAction = "toggle-category";
  buttonEl.dataset.variantCategory = category;

  rowEl.append(nameEl, buttonEl);
  return rowEl;
}

function getOverlayControlButtons() {
  return Array.from(document.querySelectorAll("[data-overlay-control]"));
}

function isOverlayModeAvailable(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (!pieceMap) {
    return true;
  }
  const expansionIds = getSelectedExpansionIds(preferences);
  return getAvailableOverlayIds(pieceMap, expansionIds).length > 0;
}

function getOverlayUnavailabilityReason(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  return isOverlayModeAvailable(preferences, pieceMap)
    ? null
    : "Requires overlay-capable boards or tokens in the selected sets.";
}

function setOverlayModeControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getOverlayControlButtons();
  if (!targets.length) {
    return;
  }

  const normalized = normalizeOverlayMode(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.overlayMode = normalized;
    button.dataset.state = normalized === OVERLAY_MODES.no
      ? "off"
      : normalized === OVERLAY_MODES.yes
        ? "forced"
        : "allowed";
    button.textContent = formatOverlayMode(normalized);
    button.title = `Overlays: ${formatOverlayMode(normalized)}. Click to cycle No, Tokens, Boards, Yes.`;
    button.setAttribute("aria-label", button.title);
  });
}

function updateOverlayAvailability(preferences = getPreferencesFromControls()) {
  const reason = getOverlayUnavailabilityReason(preferences);
  getOverlayControlButtons().forEach((buttonEl) => {
    if (reason) {
      buttonEl.dataset.unavailableReason = reason;
      buttonEl.classList.add("unavailable");
      buttonEl.setAttribute("aria-disabled", "true");
      buttonEl.title = reason;
      buttonEl.setAttribute("aria-label", `Overlays: unavailable. ${reason}`);
    } else {
      delete buttonEl.dataset.unavailableReason;
      buttonEl.classList.remove("unavailable");
      buttonEl.removeAttribute("aria-disabled");
      const mode = normalizeOverlayMode(buttonEl.value);
      buttonEl.title = `Overlays: ${formatOverlayMode(mode)}. Click to cycle No, Tokens, Boards, Yes.`;
      buttonEl.setAttribute("aria-label", buttonEl.title);
    }
  });
}

function cycleOverlayModeControl() {
  const buttonEl = document.getElementById("overlay-mode");
  if (!buttonEl) {
    return;
  }
  if (buttonEl.dataset.unavailableReason) {
    showToast(buttonEl.dataset.unavailableReason);
    return;
  }

  const current = normalizeOverlayMode(buttonEl.value);
  const currentIndex = OVERLAY_MODE_CYCLE.indexOf(current);
  const next = OVERLAY_MODE_CYCLE[(currentIndex + 1) % OVERLAY_MODE_CYCLE.length];
  setOverlayModeControl(next);
  updateVariantSummary();
}

function createOverlayModeRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Controls whether available overlay-capable boards and tokens may be placed as overlays.";
  rowEl.dataset.ruleSearch = "overlays board layout setup layout master builder tokens boards";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Overlays";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Setup & Layout";
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = "Allows overlay-capable boards, tokens, or both to be placed over the main factory layout.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "overlay-mode";
  }
  buttonEl.className = "variant-state overlay-state";
  buttonEl.type = "button";
  buttonEl.dataset.overlayControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("overlay-mode");
  setOverlayModeControl(primary?.value ?? OVERLAY_MODES.yes, buttonEl);
  return rowEl;
}

function normalizeActFastControlChoice(choice, variantState = null, mode = null) {
  if (ACT_FAST_CONTROL_CHOICES.some((entry) => entry.id === choice)) {
    return choice;
  }
  if (mode && ACT_FAST_MODE_IDS.has(mode)) {
    return mode;
  }
  const normalizedState = normalizeVariantState(variantState);
  return normalizedState === "allowed" ? "allowed" : normalizedState === "off" ? "off" : "allowed";
}

function getActFastControlChoice(buttonEl = null) {
  const button = buttonEl ?? document.getElementById(VARIANT_CONTROL_IDS.actFast);
  return normalizeActFastControlChoice(
    button?.dataset.actFastChoice,
    button?.dataset.state,
    button?.dataset.actFastMode
  );
}

function getActFastModeFromControls() {
  const button = document.getElementById(VARIANT_CONTROL_IDS.actFast);
  const mode = button?.dataset.actFastMode ?? null;
  return ACT_FAST_MODE_IDS.has(mode) ? mode : null;
}

function setActFastControlChoice(choice, buttonEl = null) {
  const normalizedChoice = normalizeActFastControlChoice(choice);
  const choiceDef = ACT_FAST_CONTROL_CHOICES.find((entry) => entry.id === normalizedChoice) ?? ACT_FAST_CONTROL_CHOICES[0];
  const targets = buttonEl
    ? [buttonEl]
    : Array.from(document.querySelectorAll('[data-variant-id="actFast"]'));
  targets.forEach((button) => {
    button.dataset.state = choiceDef.variantState;
    button.dataset.actFastChoice = choiceDef.id;
    if (choiceDef.mode) {
      button.dataset.actFastMode = choiceDef.mode;
    } else {
      delete button.dataset.actFastMode;
    }
    button.textContent = choiceDef.shortLabel;
    button.title = choiceDef.label;
    button.setAttribute("aria-label", `Act Fast: ${choiceDef.label}`);
  });
}

function cycleActFastControlChoice() {
  const current = getActFastControlChoice();
  const currentIndex = ACT_FAST_CONTROL_CHOICES.findIndex((entry) => entry.id === current);
  const next = ACT_FAST_CONTROL_CHOICES[(currentIndex + 1) % ACT_FAST_CONTROL_CHOICES.length];
  setActFastControlChoice(next.id);
  if (next.variantState === "forced") {
    getConflictingVariantIds("actFast").forEach((conflictId) => {
      if (getVariantControlState(conflictId) === "forced") {
        setVariantControlState(conflictId, "off");
        showToast(`${getVariantDefinitionLabel(conflictId)} was turned off because Act Fast is fixed.`);
      }
    });
  }
  updateVariantAvailability();
  updateVariantSummary();
}

function createVariantRuleRow(variant, options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = variant.description;
  rowEl.dataset.ruleSearch = [
    variant.label,
    variant.officialName,
    variant.sourceLabel,
    variant.description,
    variant.category,
    getVariantUiCategoryLabel(variant)
  ].filter(Boolean).join(" ").toLowerCase();

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = createVariantRuleNameElement(variant);
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = getVariantUiCategoryLabel(variant);
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription && variant.description) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = variant.description;
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = variant.controlId;
  }
  buttonEl.className = "variant-state";
  buttonEl.type = "button";
  buttonEl.dataset.variantId = variant.id;
  if (options.mirror) {
    buttonEl.dataset.variantMirror = "true";
  }

  rowEl.append(nameWrapEl, buttonEl);
  if (variant.id === "actFast") {
    const primary = document.getElementById(VARIANT_CONTROL_IDS.actFast);
    setActFastControlChoice(primary ? getActFastControlChoice(primary) : variant.defaultState, buttonEl);
  } else {
    setVariantControlState(variant.id, options.mirror ? getVariantControlState(variant.id) : variant.defaultState, buttonEl);
  }
  return rowEl;
}

function renderOptionalRulesIndex() {
  const listEl = document.getElementById("optional-rules-index-list");
  if (!listEl) {
    return;
  }
  listEl.replaceChildren();
  const entries = [
    { type: "overlay", label: "Overlays" },
    ...VARIANT_DEFINITIONS.map((variant) => ({ type: "variant", label: variant.label, variant }))
  ].sort((left, right) => left.label.localeCompare(right.label));

  entries.forEach((entry) => {
    if (entry.type === "overlay") {
      listEl.appendChild(createOverlayModeRow({ mirror: true, showCategory: true, showDescription: true }));
      return;
    }
    listEl.appendChild(createVariantRuleRow(entry.variant, { mirror: true, showCategory: true, showDescription: true }));
  });
  updateVariantAvailability();
}

function filterOptionalRulesIndex(query = "") {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll("#optional-rules-index-list .variant-rule").forEach((rowEl) => {
    const haystack = rowEl.dataset.ruleSearch ?? rowEl.textContent?.toLowerCase() ?? "";
    rowEl.classList.toggle("hidden", Boolean(normalized) && !haystack.includes(normalized));
  });
}

function openOptionalRulesDialog() {
  const dialog = document.getElementById("optional-rules-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  const searchEl = document.getElementById("optional-rules-search");
  if (searchEl) {
    searchEl.value = "";
    filterOptionalRulesIndex("");
    requestAnimationFrame(() => searchEl.focus());
  }
}

function closeOptionalRulesDialog() {
  const dialog = document.getElementById("optional-rules-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function renderVariantControls() {
  const menuEls = Array.from(document.querySelectorAll("[data-variant-menu]"));
  if (!menuEls.length) {
    return;
  }

  menuEls.forEach((menuEl) => {
    const category = menuEl.dataset.variantCategory;
    const variants = getVariantsForUiCategory(category);
    menuEl.replaceChildren();

    const bulkRowEl = createVariantCategoryBulkRow(category);
    menuEl.appendChild(bulkRowEl);

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      menuEl.appendChild(createOverlayModeRow());
    }

    variants.forEach((variant) => {
      menuEl.appendChild(createVariantRuleRow(variant));
    });
  });

  renderOptionalRulesIndex();
  updateVariantSummary();
}

function getVariantDefinitionLabel(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.label ?? variantId;
}

function getVariantDefinition(variantId) {
  return getRegisteredVariantDefinition(variantId);
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

async function loadPieceImage(assets, pieceId) {
  const piece = assets.pieceMap[pieceId];
  if (!piece?.image) {
    return null;
  }

  if (assets.imageMap[pieceId]) {
    return assets.imageMap[pieceId];
  }

  if (!assets.imageLoadPromises.has(pieceId)) {
    const promise = loadImage(piece.image)
      .then((img) => {
        assets.imageMap[pieceId] = img;
        return img;
      })
      .catch((error) => {
        console.warn(`Unable to load piece image for ${pieceId}: ${piece.image}`, error);
        return null;
      })
      .finally(() => {
        assets.imageLoadPromises.delete(pieceId);
      });
    assets.imageLoadPromises.set(pieceId, promise);
  }

  return assets.imageLoadPromises.get(pieceId);
}

async function loadPieceImages(assets, pieceIds) {
  await Promise.all([...new Set(pieceIds)].map((pieceId) => loadPieceImage(assets, pieceId)));
}

function getPlacementImagePieceIds(placements = [], pieceMap = {}) {
  return placements
    .map((placement) => placement.pieceId)
    .filter((pieceId) => pieceMap[pieceId]?.image);
}

async function ensureScenarioImages(assets, scenario) {
  await loadPieceImages(assets, getPlacementImagePieceIds(scenario.placements, scenario.pieceMap));
}

function pruneImageCache(assets, keepPieceIds = []) {
  const keep = new Set(keepPieceIds);

  for (const pieceId of Object.keys(assets.imageMap)) {
    if (!keep.has(pieceId)) {
      delete assets.imageMap[pieceId];
    }
  }
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

  cachedAssets = { pieceMap, imageMap: {}, imageLoadPromises: new Map() };
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
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}


function generationNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function formatGenerationDuration(ms) {
  if (!Number.isFinite(ms)) return "0.0s";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function getGenerationConstraintHint(preferences = {}) {
  const competitiveModeEnabled = typeof preferences.competitiveMode === "boolean"
    ? preferences.competitiveMode
    : getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  if (competitiveModeEnabled) {
    return "Competitive Mode evaluates extra starting choices for blocking and strategic start selection, so generation may take longer.";
  }

  const constrainedDifficulty = preferences.difficulty && preferences.difficulty !== "any";
  const constrainedLength = preferences.length && preferences.length !== "any";
  if (!constrainedDifficulty && !constrainedLength) {
    return "";
  }
  if (constrainedDifficulty && constrainedLength) {
    return "Broader difficulty or length settings may generate faster.";
  }
  if (constrainedDifficulty) {
    return "Choosing Any difficulty may generate faster.";
  }
  return "Choosing Any length may generate faster.";
}

function summarizeRouteSearchDelta(before, after) {
  const beforeCount = before?.routeSearchCount ?? 0;
  const searches = (after?.routeSearches ?? []).slice(beforeCount);
  const expansions = searches.reduce((sum, entry) => sum + (entry.expansions ?? 0), 0);
  const durationMs = searches.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  const capped = searches.filter((entry) => entry.hitExpansionCap).length;
  const slowest = searches.reduce(
    (best, entry) => !best || (entry.durationMs ?? 0) > (best.durationMs ?? 0) ? entry : best,
    null
  );
  return {
    searches: searches.length,
    expansions,
    durationMs: Number(durationMs.toFixed(2)),
    capped,
    slowest
  };
}

function formatContextualProfile(profile) {
  if (!profile) return "n/a";
  const timed = [
    ["simulate", profile.simulationMs ?? 0],
    ["actionScore", profile.actionScoringMs ?? 0],
    ["keys", (profile.currentKeyMs ?? 0) + (profile.nextKeyMs ?? 0)],
    ["dominance", profile.dominanceMs ?? 0],
    ["heap", profile.queueMs ?? 0],
    ["history", profile.historyBuildMs ?? 0],
    ["build", profile.destinationBuildMs ?? 0],
    ["goal", profile.goalCompletionMs ?? 0]
  ].sort((left, right) => right[1] - left[1]);
  return timed
    .map(([label, ms]) => `${label} ${formatGenerationDuration(ms)}`)
    .join(", ");
}

function roundCourseEvaluationNumbers(text) {
  if (typeof text !== "string" || !text) {
    return text;
  }

  return text.replace(
    /(^|[^A-Za-z0-9_])(-?\d+\.\d{3,})(?![A-Za-z0-9_])/g,
    (match, prefix, numeric) => {
      const value = Number(numeric);
      if (!Number.isFinite(value)) {
        return match;
      }
      const decimals = Math.abs(value) < 10 ? 3 : 2;
      let rendered = value.toFixed(decimals);
      rendered = rendered
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
      return `${prefix}${rendered}`;
    }
  );
}

function formatContextualCounts(profile) {
  if (!profile) return "n/a";
  return [
    `actions ${profile.actionCandidates ?? 0}`,
    `simulations ${profile.simulationCalls ?? 0}`,
    `blocked ${profile.blockedTransitions ?? 0}`,
    `destinations ${profile.destinationCandidates ?? 0}`,
    `accepted ${profile.acceptedStates ?? 0}`,
    `dominated ${profile.dominatedStates ?? 0}`,
    `goals ${profile.completedGoals ?? 0}`,
    `physicalCache ${profile.physicalCacheHits ?? 0}/${(profile.physicalCacheHits ?? 0) + (profile.physicalCacheMisses ?? 0)} hits`
  ].join(", ");
}

function describeGenerationRejection(scenario, fallbackStage = "") {
  if (!scenario) {
    return fallbackStage
      ? `no scenario after ${fallbackStage}`
      : "candidate rejected before final classification";
  }
  const reasons = [...(scenario.metrics?.hardFailures ?? [])];
  if ((scenario.metrics?.difficultyFit ?? 0) > 0) {
    reasons.push(`difficulty ${scenario.metrics.difficultyDirection ?? "mismatch"}`);
  }
  if ((scenario.metrics?.lengthFit ?? 0) > 0) {
    reasons.push(`length ${scenario.metrics.lengthDirection ?? "mismatch"}`);
  }
  return reasons.length ? reasons.join(", ") : "better fit still required";
}

function compactGenerationStage(stage = "") {
  return String(stage)
    .replace(/^Evaluating starting spaces — /, "Routing starts — ")
    .replace(/^Checking route fairness and removable pieces — /, "Checking fairness — ")
    .replace(/^Rejecting gross mismatch — /, "Rejected: ")
    .trim();
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
    brutal: "Robots. Must. Die."
  };

  return labels[difficultyPreference] ?? String(difficultyPreference ?? "intermediate");
}

function getTuningDifficulty(difficultyPreference) {
  return difficultyPreference === "brutal" ? "hard" : (difficultyPreference ?? "moderate");
}

function isHardestDifficulty(preferences = {}) {
  return preferences.difficulty === "brutal";
}

const OVERLAY_MODES = {
  no: "no",
  tokens: "tokens",
  boards: "boards",
  yes: "yes"
};

const OVERLAY_MODE_CYCLE = [
  OVERLAY_MODES.no,
  OVERLAY_MODES.tokens,
  OVERLAY_MODES.boards,
  OVERLAY_MODES.yes
];

const ACT_FAST_CONTROL_CHOICES = [
  { id: "off", variantState: "off", mode: null, shortLabel: "No", label: "Not allowed" },
  { id: "allowed", variantState: "allowed", mode: null, shortLabel: "Yes", label: "Allowed; timer mode is chosen if Act Fast is used" },
  { id: "countdown_3m", variantState: "forced", mode: "countdown_3m", shortLabel: "3 min", label: "Always on: 3-minute programming timer" },
  { id: "countdown_2m", variantState: "forced", mode: "countdown_2m", shortLabel: "2 min", label: "Always on: 2-minute programming timer" },
  { id: "countdown_1m", variantState: "forced", mode: "countdown_1m", shortLabel: "1 min", label: "Always on: 1-minute programming timer" },
  { id: "countdown_30s", variantState: "forced", mode: "countdown_30s", shortLabel: "30 sec", label: "Always on: 30-second programming timer" },
  { id: "last_player_30s", variantState: "forced", mode: "last_player_30s", shortLabel: "Last 30s", label: "Always on: last player has 30 seconds" }
];
const ACT_FAST_MODE_IDS = new Set(ACT_FAST_CONTROL_CHOICES.filter((choice) => choice.mode).map((choice) => choice.mode));

function formatActFastMode(mode) {
  return ({
    countdown_3m: "3 min",
    countdown_2m: "2 min",
    countdown_1m: "1 min",
    countdown_30s: "30 sec",
    last_player_30s: "Last player 30 sec"
  })[mode] ?? "Yes";
}

function normalizeOverlayMode(mode) {
  return Object.prototype.hasOwnProperty.call(OVERLAY_MODES, mode) ? mode : OVERLAY_MODES.yes;
}

function formatOverlayMode(mode) {
  return {
    no: "No",
    tokens: "Tokens",
    boards: "Boards",
    yes: "Yes"
  }[normalizeOverlayMode(mode)];
}

function shouldUseBoardOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.boards;
}

function shouldUseMiniOverlays(preferences = {}) {
  const mode = normalizeOverlayMode(preferences.overlayMode);
  return mode === OVERLAY_MODES.yes || mode === OVERLAY_MODES.tokens;
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
    "chaos-and-carnage": "Chaos & Carnage",
    "rr-dice": "Robo Rally Dice"
  };

  return labels[expansionId] ?? titleCaseWords(expansionId);
}

function getDifficultyThresholds() {
  return {
    easy: [0, 95],
    moderate: [90, 155],
    hard: [150, Infinity],
    // Robots. Must. Die. is intentionally a distinct top-end target rather
    // than merely Hard with a different label. The generation tuning still
    // uses the hard profile, but acceptance continues until the raw course
    // difficulty reaches this higher floor.
    brutal: [180, Infinity]
  };
}

function getLengthThresholds() {
  return {
    short: [MIN_LENGTH_RAW, 140],
    moderate: [135, 205],
    long: [180, Infinity]
  };
}

// Gross-mismatch limits are intentionally much wider than the actual
// acceptance bands. They are used only after one complete course analysis,
// and only to avoid spending additional physical-pruning/reanalysis passes on
// a candidate that is already implausibly far from the requested target.
const GROSS_DIFFICULTY_ABORT_BANDS = {
  easy: { max: 165 },
  moderate: { min: 35, max: 225 },
  hard: { min: 75 },
  brutal: { min: 90 }
};

const GROSS_LENGTH_ABORT_BANDS = {
  short: { max: 220 },
  moderate: { min: 70, max: 285 },
  long: { min: 90 }
};

function getGrossCourseMismatch(metrics, preferences = {}) {
  const difficultyBand = GROSS_DIFFICULTY_ABORT_BANDS[preferences.difficulty];
  const lengthBand = GROSS_LENGTH_ABORT_BANDS[preferences.length];

  if (difficultyBand && Number.isFinite(metrics?.difficultyRaw)) {
    if (
      Number.isFinite(difficultyBand.min) &&
      metrics.difficultyRaw < difficultyBand.min
    ) {
      return {
        abort: true,
        reason: "difficulty-too-low",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.min,
        requested: preferences.difficulty
      };
    }

    if (
      Number.isFinite(difficultyBand.max) &&
      metrics.difficultyRaw > difficultyBand.max
    ) {
      return {
        abort: true,
        reason: "difficulty-too-high",
        metric: "difficulty",
        value: metrics.difficultyRaw,
        limit: difficultyBand.max,
        requested: preferences.difficulty
      };
    }
  }

  if (lengthBand && Number.isFinite(metrics?.lengthFitRaw)) {
    if (
      Number.isFinite(lengthBand.min) &&
      metrics.lengthFitRaw < lengthBand.min
    ) {
      return {
        abort: true,
        reason: "length-too-low",
        metric: "length",
        value: metrics.lengthFitRaw,
        limit: lengthBand.min,
        requested: preferences.length
      };
    }

    if (
      Number.isFinite(lengthBand.max) &&
      metrics.lengthFitRaw > lengthBand.max
    ) {
      return {
        abort: true,
        reason: "length-too-high",
        metric: "length",
        value: metrics.lengthFitRaw,
        limit: lengthBand.max,
        requested: preferences.length
      };
    }
  }

  return {
    abort: false,
    reason: null,
    metric: null,
    value: null,
    limit: null,
    requested: null
  };
}

function formatGrossCourseMismatch(mismatch) {
  if (!mismatch?.abort) {
    return "";
  }

  const comparison = mismatch.reason.endsWith("too-low") ? "<" : ">";
  return `${mismatch.metric} ${Number(mismatch.value).toFixed(1)} ${comparison} gross ${mismatch.requested} limit ${mismatch.limit}`;
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


function summarizeFeature(feature) {
  return formatFeatureLabel(feature);
}

function appendAuditReadoutLine(readout, text, options = {}) {
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

function buildAuditFeatureFilterLabel(feature) {
  const fragment = document.createDocumentFragment();
  const text = document.createElement("span");
  text.textContent = feature.label;
  fragment.append(text);
  return fragment;
}

function countBoardLasers(tileMap) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === "laser").length;
  }
  return total;
}

function countFeatureTypeInTileMap(tileMap, featureType) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === featureType).length;
  }
  return total;
}

function countFeatureTypeInSelectedSets(featureType, pieceMap = cachedAssets?.pieceMap ?? null, preferences = {}) {
  if (!pieceMap) {
    return 0;
  }

  const expansionIds = getSelectedExpansionIds(preferences);
  let total = 0;

  for (const piece of Object.values(pieceMap)) {
    if (expansionIds && !expansionIds.has(piece.expansionId)) {
      continue;
    }
    for (const tile of piece.tiles || []) {
      total += (tile.features || []).filter((feature) => feature.type === featureType).length;
    }
  }

  return total;
}

function isNoDocksSandwichedDockPair(leftVariantId, rightVariantId) {
  return new Set([leftVariantId, rightVariantId]).size === 2 &&
    [leftVariantId, rightVariantId].includes("noDocks") &&
    [leftVariantId, rightVariantId].includes("sandwichedDock");
}

function variantsConflict(leftVariantId, rightVariantId) {
  const left = getVariantDefinition(leftVariantId);
  const right = getVariantDefinition(rightVariantId);
  return Boolean(
    left?.incompatibleWith?.includes(rightVariantId) ||
    right?.incompatibleWith?.includes(leftVariantId)
  );
}

// No Docks and Sandwiched Dock are compatible as user preferences: both may be
// Allowed so the generator can choose either setup. They still cannot be active
// on the same generated course, and Must + Must is an impossible request.
function variantsConflictInGeneratedCourse(leftVariantId, rightVariantId) {
  return variantsConflict(leftVariantId, rightVariantId) ||
    isNoDocksSandwichedDockPair(leftVariantId, rightVariantId);
}

function forcedVariantPreferencesConflict(leftVariantId, rightVariantId) {
  return variantsConflictInGeneratedCourse(leftVariantId, rightVariantId);
}

function normalizeForcedVariantPreferenceConflicts(preferences = {}) {
  const allowedVariantRules = { ...(preferences.allowedVariantRules ?? {}) };
  const forcedIds = VARIANT_DEFINITIONS
    .filter((variant) => getVariantPreferenceState(preferences, variant.id) === "forced")
    .map((variant) => variant.id)
    .sort((left, right) => left.localeCompare(right));
  const keptForcedIds = [];
  const relaxedIds = [];

  forcedIds.forEach((variantId) => {
    if (keptForcedIds.some((keptId) => forcedVariantPreferencesConflict(variantId, keptId))) {
      allowedVariantRules[variantId] = "allowed";
      relaxedIds.push(variantId);
      return;
    }
    allowedVariantRules[variantId] = "forced";
    keptForcedIds.push(variantId);
  });

  return {
    preferences: {
      ...preferences,
      allowedVariantRules
    },
    relaxedIds
  };
}

function getConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflict(variantId, variant.id))
    .map((variant) => variant.id);
}

function getCourseConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflictInGeneratedCourse(variantId, variant.id))
    .map((variant) => variant.id);
}

function getMissingRequiredVariantIds(variantId, preferences = {}, activeVariants = null, options = {}) {
  const selfState = options.selfState ?? getVariantPreferenceState(preferences, variantId);
  if (selfState === "forced" && options.allowForcedOverride !== false) {
    return [];
  }

  const requiredIds = getVariantRequirementIds(variantId);
  if (!requiredIds.length) {
    return [];
  }

  const satisfied = requiredIds.some((requiredId) => (
    activeVariants
      ? Boolean(activeVariants[requiredId])
      : getVariantPreferenceState(preferences, requiredId) !== "off"
  ));

  return satisfied ? [] : requiredIds;
}

function showToast(message) {
  const stack = document.getElementById("toast-stack");
  if (!stack || !message) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 2600);
}

function getVariantUnavailabilityReason(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (variantId === "competitiveMode" && pieceMap) {
    const playerCount = preferences.playerCount ?? 4;
    const requiredStarts = playerCount * 2;
    const noDocksState = getVariantPreferenceState(preferences, "noDocks");
    if (noDocksState === "off") {
      const expansionIds = getSelectedExpansionIds(preferences);
      const dockIds = getEligibleDockIds(pieceMap, expansionIds, preferences);
      const potentialPreferences = {
        ...preferences,
        playerCount,
        competitiveMode: true,
        allowedVariantRules: {
          ...(preferences.allowedVariantRules ?? {}),
          extraDocks: getVariantPreferenceState(preferences, "extraDocks") === "forced" ? "forced" : "allowed"
        }
      };
      const potentialCapacity = getMaximumAvailableDockStartCapacity(dockIds, pieceMap, potentialPreferences);
      if (potentialCapacity < requiredStarts) {
        return `Competitive Mode with ${playerCount} players needs ${requiredStarts} starting spaces. The selected sets can provide at most ${potentialCapacity} with available docking bays; allow No Docks, reduce the player count, or select sets with more starting capacity.`;
      }
    }
  }

  if (["extraDocks", "noDocks", "sandwichedDock"].includes(variantId)) {
    const otherStartLayoutModes = ["extraDocks", "noDocks", "sandwichedDock"]
      .filter((id) => id !== variantId);
    const forcedOther = otherStartLayoutModes.find((id) => (
      getVariantPreferenceState(preferences, id) === "forced"
    ));
    if (forcedOther) {
      return `Unavailable while ${getVariantDefinitionLabel(forcedOther)} is set to Must. Extra Docks, No Docks, and Sandwiched Dock are mutually exclusive starting-layout options.`;
    }
  }

  const forcedConflictIds = getConflictingVariantIds(variantId).filter((conflictId) => (
    getVariantPreferenceState(preferences, conflictId) === "forced"
  ));
  if (forcedConflictIds.length) {
    return `Unavailable while ${forcedConflictIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} is set to Must.`;
  }

  const missingRequiredIds = getMissingRequiredVariantIds(variantId, preferences);
  if (missingRequiredIds.length) {
    return `Requires ${missingRequiredIds.map((id) => getVariantDefinitionLabel(id)).join(" or ")} unless ${getVariantDefinitionLabel(variantId)} is set to Must.`;
  }

  const availabilityRule = getVariantAvailabilityRule(variantId);
  if (!availabilityRule) {
    return null;
  }

  if (availabilityRule.type === "physicalDockGroupsAtLeast") {
    if (variantId === "extraDocks" && getVariantPreferenceState(preferences, "noDocks") !== "off") {
      return null;
    }
    if (!pieceMap) {
      return null;
    }
    const expansionIds = getSelectedExpansionIds(preferences);
    const physicalDockCount = getDockFaceGroups(
      getAvailableDockIds(pieceMap, expansionIds),
      pieceMap
    ).length;
    return physicalDockCount >= availabilityRule.count
      ? null
      : availabilityRule.reason;
  }

  if (availabilityRule.type === "featureTypeAvailable") {
    return countFeatureTypeInSelectedSets(availabilityRule.featureType, pieceMap, preferences) > 0
      ? null
      : availabilityRule.reason;
  }

  if (availabilityRule.type === "featureTypesAnyAvailable") {
    return (availabilityRule.featureTypes || []).some((featureType) => (
      countFeatureTypeInSelectedSets(featureType, pieceMap, preferences) > 0
    ))
      ? null
      : availabilityRule.reason;
  }

  return null;
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

function renderBoardAudit(assets) {
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
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
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
    if (courseExplanationState.scenarioRef) {
      clearCourseNotesCache(courseExplanationState.scenarioRef);
    }
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
  const visibleCheckpointCount = scenario.virtualBots
    ? Math.max(0, scenario.checkpoints.length - 1)
    : scenario.checkpoints.length;
  flagsEl.textContent = `${visibleCheckpointCount} checkpoint${visibleCheckpointCount === 1 ? "" : "s"}${scenario.virtualBots ? " + entry" : ""}`;
  const noteParts = [];
  const difficultyFit = scenario.metrics.difficultyFit ?? 0;
  const lengthFit = scenario.metrics.lengthFit ?? 0;
  const requestedDifficulty = scenario.preferences.difficulty;
  const moderateDifficultyThreshold = requestedDifficulty === "easy" ? 20 : 14;
  const strongDifficultyThreshold = requestedDifficulty === "easy" ? 48 : 42;
  const difficultyStrength = difficultyFit >= strongDifficultyThreshold
    ? "a lot"
    : difficultyFit >= moderateDifficultyThreshold
      ? "somewhat"
      : scenario.generationBestMatch && difficultyFit > 0
        ? "slightly"
        : null;
  const lengthStrength = lengthFit >= 24
    ? "a lot"
    : lengthFit >= 14
      ? "somewhat"
      : scenario.generationBestMatch && lengthFit > 0
        ? "slightly"
        : null;

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

  if (scenario.generationBestMatch) {
    const mismatchText = noteParts.length
      ? ` It is ${noteParts.join(" and ")} than requested.`
      : "";
    fitNoteEl.textContent =
      `Closest match found after ${scenario.attempts} attempt${scenario.attempts === 1 ? "" : "s"}.${mismatchText} Regenerating may find a closer match.`;
    fitNoteEl.classList.remove("hidden");
  } else if (noteParts.length) {
    fitNoteEl.textContent = `Closest fit: this course is ${noteParts.join(" and ")} than requested.${shouldSuggestReroll ? " Regenerating may give a better match." : ""}`;
    fitNoteEl.classList.remove("hidden");
  } else {
    fitNoteEl.textContent = "";
    fitNoteEl.classList.add("hidden");
  }

  const autoOpenExplanation =
    scenario.generationBestMatch || noteParts.length > 0;
  const explanationVisible = courseExplanationState.manualOpen ?? autoOpenExplanation;
  if (explanationVisible) {
    explanationCopyEl.innerHTML = buildCourseNotesHtml(scenario, noteParts, {
      includeDiagnostics: Boolean(document.getElementById("dev-view")?.checked)
    });
  } else {
    // Course Notes are deliberately lazy: do not synthesize or retain prose
    // for a scenario the user has not opened.
    explanationCopyEl.innerHTML = "";
  }
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

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function averageValues(values = []) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


function formatLegLabel(leg) {
  return leg.from === "dock" ? "Dock -> 1" : `${leg.from} -> ${leg.to}`;
}

const UI_SETUP_LAYOUT_CATEGORY = "setup-layout";

function getVariantUiCategory(variantOrCategory) {
  const category = typeof variantOrCategory === "string"
    ? variantOrCategory
    : variantOrCategory?.category;

  return category === "setup" || category === UI_SETUP_LAYOUT_CATEGORY
    ? UI_SETUP_LAYOUT_CATEGORY
    : category;
}

function getVariantUiCategoryLabel(variantOrCategory) {
  const category = getVariantUiCategory(variantOrCategory);
  return category === UI_SETUP_LAYOUT_CATEGORY
    ? "Setup & Layout"
    : String(category ?? "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVariantsForUiCategory(category) {
  return VARIANT_DEFINITIONS.filter((variant) => getVariantUiCategory(variant) === category);
}

function getVariantCategoryStates(category) {
  return getVariantsForUiCategory(category)
    .map((variant) => ({
      id: variant.id,
      label: variant.label,
      state: getVariantControlState(variant.id)
    }));
}

function getVariantCategoryAllAllowed(category, states = getVariantCategoryStates(category)) {
  const variantsAllowed = states.every((entry) => entry.state === "allowed" || entry.state === "forced");
  if (category !== UI_SETUP_LAYOUT_CATEGORY) {
    return variantsAllowed;
  }
  const preferences = getPreferencesFromControls();
  if (!isOverlayModeAvailable(preferences)) {
    return variantsAllowed;
  }
  return variantsAllowed && normalizeOverlayMode(document.getElementById("overlay-mode")?.value) === OVERLAY_MODES.yes;
}

function countSelectedOptionalRules() {
  const variantCount = VARIANT_DEFINITIONS.filter((variant) => getVariantControlState(variant.id) !== "off").length;
  const preferences = getPreferencesFromControls();
  const overlayCount = isOverlayModeAvailable(preferences) && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no ? 1 : 0;
  return variantCount + overlayCount;
}

function updateVariantSummary() {
  document.querySelectorAll("[data-variant-summary]").forEach((summaryEl) => {
    const category = summaryEl.dataset.variantCategory;
    const states = getVariantCategoryStates(category);
    const enabled = states.filter((entry) => entry.state !== "off");
    let selectedCount = enabled.length;

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      const preferences = getPreferencesFromControls();
      const overlayAvailable = isOverlayModeAvailable(preferences);
      const overlayLabel = formatOverlayMode(preferences.overlayMode);
      if (overlayAvailable && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no) {
        selectedCount += 1;
      }
      summaryEl.title = [
        ...states.map((entry) => `${entry.label}: ${getVariantStateCopy(entry.id, entry.state).label}`),
        `Overlays: ${overlayLabel}${overlayAvailable ? "" : " (unavailable)"}`
      ].join(", ");
    } else {
      summaryEl.title = states.map((entry) => `${entry.label}: ${entry.id === "actFast" && getActFastModeFromControls() ? formatActFastMode(getActFastModeFromControls()) : getVariantStateCopy(entry.id, entry.state).label}`).join(", ");
    }
    summaryEl.textContent = `${selectedCount} selected`;

    const menuEl = document.querySelector(`[data-variant-menu][data-variant-category="${category}"]`);
    const bulkButton = menuEl?.querySelector('[data-variant-action="toggle-category"]');
    if (!bulkButton) {
      return;
    }

    const allAllowed = getVariantCategoryAllAllowed(category, states);
    bulkButton.textContent = allAllowed ? "No" : "Yes";
    const categoryLabel = getVariantUiCategoryLabel(category);
    bulkButton.title = allAllowed
      ? `Set optional ${categoryLabel} rules to No`
      : `Set ${categoryLabel} rules to Yes`;
    bulkButton.setAttribute("aria-label", bulkButton.title);
    const bulkName = bulkButton.parentElement?.querySelector(".variant-rule-name");
    if (bulkName) {
      bulkName.textContent = allAllowed ? "Allow none" : "Allow all";
    }
  });

  const indexButton = document.getElementById("optional-rules-title");
  if (indexButton) {
    const selectedCount = countSelectedOptionalRules();
    indexButton.textContent = `Optional Rules · ${selectedCount} selected`;
    indexButton.setAttribute("aria-label", `Open searchable optional rules list. ${selectedCount} selected.`);
  }
}

function toggleVariantCategoryStates(category) {
  const states = getVariantCategoryStates(category);
  const allAllowed = getVariantCategoryAllAllowed(category, states);

  states.forEach(({ id, state }) => {
    if (allAllowed) {
      if (state === "allowed") {
        setVariantControlState(id, "off");
      }
      return;
    }

    if (state === "off") {
      setVariantControlState(id, "allowed");
    }
  });

  if (category === UI_SETUP_LAYOUT_CATEGORY) {
    const preferences = getPreferencesFromControls();
    if (isOverlayModeAvailable(preferences)) {
      setOverlayModeControl(allAllowed ? OVERLAY_MODES.no : OVERLAY_MODES.yes);
    }
  }

  updateVariantAvailability();
  updateVariantSummary();
}

function updateExpansionSummary() {
  const summaryEl = document.getElementById("expansion-summary");
  const enabled = [];

  if (document.getElementById("expansion-roborally").checked) {
    enabled.push(formatExpansionName("roborally"));
  }
  if (document.getElementById("expansion-rr-dice").checked) {
    enabled.push(formatExpansionName("rr-dice"));
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

function getVariantImpactSummary(scenario) {
  if (!scenario) {
    return "";
  }

  const boardLaserCount = countBoardLasers(scenario.goalTileMap);
  const repulsorCount = countFeatureTypeInTileMap(scenario.goalTileMap, "repulsor");
  const batteryCount = countFeatureTypeInTileMap(scenario.goalTileMap, "battery");
  const chopShopCount = countFeatureTypeInTileMap(scenario.goalTileMap, "chopShop");
  const upgradeSpaceCount = batteryCount + chopShopCount;
  const activeImpacts = [];
  const idleImpacts = [];
  const addImpact = (variantId, detail = "") => {
    const label = getRegisteredVariantDefinition(variantId)?.label ?? variantId;
    activeImpacts.push(detail ? `${label} (${detail})` : label);
  };
  const addIdle = (variantId, detail = "") => {
    const label = getRegisteredVariantDefinition(variantId)?.label ?? variantId;
    idleImpacts.push(detail ? `${label} (${detail})` : label);
  };

  if (scenario.actFast) {
    addImpact("actFast");
  }
  if (scenario.lighterGame) {
    if (upgradeSpaceCount > 0) {
      addImpact("lighterGame", `${upgradeSpaceCount} inactive upgrade space${upgradeSpaceCount === 1 ? "" : "s"}`);
    } else {
      addIdle("lighterGame", "no batteries or chop shops on this course");
    }
  }
  if (scenario.upgradeWorld) {
    if (upgradeSpaceCount > 0) {
      addImpact("upgradeWorld", `${upgradeSpaceCount} upgrade space${upgradeSpaceCount === 1 ? "" : "s"}`);
    } else {
      addIdle("upgradeWorld", "no batteries or chop shops on this course");
    }
  }
  if (scenario.lessSpammyGame) {
    addImpact("lessSpammyGame");
  }
  if (scenario.criticalSpam) {
    addImpact("criticalSpam");
  }
  if (scenario.criticalHaywire) {
    addImpact("criticalHaywire");
  }
  if (scenario.permanentShutdown) {
    if (scenario.criticalSpam) {
      addImpact("permanentShutdown");
    } else {
      addIdle("permanentShutdown", "mostly dormant without Critical Spam");
    }
  }
  if (scenario.lessDeadlyGame) {
    addImpact("lessDeadlyGame");
  }
  if (scenario.moreDeadlyGame) {
    addImpact("moreDeadlyGame");
  }
  if (scenario.cuttingFloor) {
    if (boardLaserCount > 0) {
      addImpact("cuttingFloor", `${boardLaserCount} board laser${boardLaserCount === 1 ? "" : "s"}`);
    } else {
      addIdle("cuttingFloor", "no board lasers on this course");
    }
  }
  if (scenario.flamingOil) {
    const oilCount = countFeatureTypeInTileMap(scenario.goalTileMap, "oil");
    if (oilCount > 0) {
      addImpact("flamingOil", `${oilCount} oil slick${oilCount === 1 ? "" : "s"}`);
    } else {
      addIdle("flamingOil", "no oil slicks on this course");
    }
  }
  if (scenario.repulsorOverdrive) {
    if (repulsorCount > 0) {
      addImpact("repulsorOverdrive", `${repulsorCount} repulsor field${repulsorCount === 1 ? "" : "s"}`);
    } else {
      addIdle("repulsorOverdrive", "no repulsor fields on this course");
    }
  }
  if (scenario.setToKill) {
    addImpact("setToKill");
  }
  if (scenario.setToStun) {
    addImpact("setToStun");
  }
  if (scenario.recoveryRule === "dynamic_archiving") {
    addImpact("dynamicArchiving");
  }
  if (scenario.recoveryRule === "home_reboot") {
    addImpact("homeReboot");
  }
  if (scenario.hazardousFlags) {
    if (hasHazardousFlagsEffect(scenario)) {
      addImpact("hazardousFlags");
    } else {
      addIdle("hazardousFlags", "no hazardous checkpoint overlap on this course");
    }
  }
  if (scenario.repairStations) {
    const stationCount = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots).length;
    addImpact("repairStations", `${stationCount} repair station${stationCount === 1 ? "" : "s"}`);
  }
  if (scenario.movingTargets) {
    if (hasMovingTargetsEffect(scenario)) {
      addImpact("movingTargets", `${scenario.movingTargetStats?.activeCount ?? 0} moving checkpoint${(scenario.movingTargetStats?.activeCount ?? 0) === 1 ? "" : "s"}`);
    } else {
      addIdle("movingTargets", "no checkpoints ended up on conveyors");
    }
  }
  if (scenario.extraDocks) {
    addImpact("extraDocks");
  }
  if (scenario.noDocks) {
    addImpact("noDocks");
  }
  if (scenario.sandwichedDock) {
    addImpact("sandwichedDock");
  }
  if (scenario.factoryRejects) {
    addImpact("factoryRejects");
  }
  if (scenario.startupSpinUp) {
    addImpact("startupSpinUp");
  }
  if (scenario.virtualBots) {
    addImpact("virtualBots");
  }
  if (scenario.competitiveMode) {
    addImpact("competitiveMode");
  }
  if (scenario.payToWin) {
    const pricedStarts = (scenario.sequence.firstLeg.starts || []).filter((start) => (
      Number.isFinite(start.energyCost) && !start.payToWinUnavailable
    ));
    addImpact("payToWin", `${pricedStarts.length} priced start${pricedStarts.length === 1 ? "" : "s"}`);
  }
  if (scenario.classicSharedDeck) {
    addImpact("classicSharedDeck");
  }
  if (scenario.lessForeshadowing) {
    addImpact("lessForeshadowing");
  }
  if (scenario.staggeredBoards) {
    addImpact("staggeredBoards");
  }

  if (!activeImpacts.length && !idleImpacts.length) {
    return "";
  }

  const parts = [];
  if (activeImpacts.length) {
    parts.push(`Variant impact on this course: ${activeImpacts.join(", ")}.`);
  }
  if (idleImpacts.length) {
    parts.push(`Currently idle here: ${idleImpacts.join(", ")}.`);
  }
  return parts.join(" ");
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
  const topRulesBlockEl = document.getElementById("rules-block-top");
  const bottomRulesBlockEl = document.getElementById("rules-block-bottom");
  const topAnchorEl = document.getElementById("rules-anchor-top");
  const bottomAnchorEl = document.getElementById("rules-anchor-bottom");
  const checkpointNoteEl = document.getElementById("checkpoint-note");
  const photoRulesNoteEl = document.getElementById("photo-rules-note");
  const noteEl = document.getElementById("rules-note");
  const adviceNoteEl = document.getElementById("rules-advice-note");
  const checkpointNotes = [];
  const photoNotes = [];
  const notes = [];

  if (!scenario) {
    topAnchorEl?.appendChild(topRulesBlockEl);
    bottomAnchorEl?.appendChild(bottomRulesBlockEl);
    topRulesBlockEl?.classList.add("hidden");
    bottomRulesBlockEl?.classList.add("hidden");
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

  if (scenario.recoveryRule === "home_reboot") {
    notes.push("Home Reboot: robots reboot at the token on the dock where the robot's starting archive token is located at (Previous Robo Rally editions).");
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

  if (scenario.repairStations) {
    notes.push("Repair Stations: at the end of the fifth register, a robot on an ordinary checkpoint may remove one Damage card from its deck, discard pile, hand, or registers and place it in the damage discard pile (patterned after previous Robo Rally editions).");
  }

  if (getBoardViewMode() === BOARD_VIEW_MODES.photos && (scenario.overlayPlacements?.length ?? 0) > 0) {
    photoNotes.push("Board photos are for general layout reference only. With overlays, use the physical boards or Icon View for exact placement of walls, ledges, and other border elements.");
  }

  if (scenario.noDocks) {
    if (scenario.payToWin) {
      notes.push("No Docks: do not use a docking bay. The priced starting spaces along the indicated outer board edge replace docking-bay starting spaces.");
    } else if (scenario.startupSpinUp) {
      notes.push("No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces.");
    } else {
      notes.push("No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces; robots begin facing into the factory.");
    }
    if (scenario.startupSpinUp) {
      notes.push("Startup Spin-Up with No Docks: players may choose their robots' initial facing freely.");
    }
  }

  if (scenario.competitiveMode) {
    notes.push(
      `Competitive Mode: before the game, players take turns blocking starting spaces, then choose strategically from the remaining starts. ` +
      `The generator evaluates a larger starting pool (${scenario.playerCount * 2} starts for ${scenario.playerCount} players) to estimate those choices, so Competitive courses can take longer to generate. (Rulebook p. 32).`
    );
  }

  if (scenario.payToWin) {
    const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
    if (payToWinPricing?.hasLatePriceDifference) {
      const fallbackLatePlayerCount = Math.ceil(scenario.playerCount / 3);
      const firstLatePlayer = payToWinPricing.lateSelectorStart
        ?? (scenario.playerCount - fallbackLatePlayerCount + 1);
      const lastLatePlayer = payToWinPricing.lateSelectorEnd ?? scenario.playerCount;
      const singleLatePlayer = firstLatePlayer === lastLatePlayer;
      const latePlayerText = singleLatePlayer
        ? `player ${firstLatePlayer}`
        : `players ${firstLatePlayer}–${lastLatePlayer}`;
      const hasUnavailableSelectors = (
        (payToWinPricing.earlyUnavailableCount ?? 0) > 0 ||
        (payToWinPricing.lateUnavailableCount ?? 0) > 0
      );
      const dashText = hasUnavailableSelectors
        ? " A dash in either position means that starting space is unavailable to that selector group; a fully unavailable space uses the prohibited-start marker instead of a price."
        : "";
      notes.push(
        `Pay to Win: green starting spaces show starting energy costs, with ${payToWinPricing.startingEnergy ?? DEFAULT_STARTING_ENERGY} energy available at setup. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first cost.${dashText}`
      );
    } else {
      notes.push(`Pay to Win: green starting spaces show the starting energy cost for choosing that space. Robots have ${payToWinPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY} starting energy; a start that costs more is unavailable.`);
    }
  }

  if (scenario.factoryRejects) {
    notes.push("Factory Rejects: hand size is 7 instead of 9 (Altered from previous Robo Rally editions).");
  }

  if (scenario.lessDeadlyGame) {
    notes.push("Walled In: board edges act as walls (2023 rulebook: A Less Deadly Game, p. 32).");
  }

  if (scenario.lessSpammyGame) {
    notes.push("SPAM Filter: discard all SPAM cards from hand to your discard pile at the end of programming phase (2023 rulebook: A Less SPAM-Y Game, p. 32).");
  }

  if (scenario.criticalSpam) {
    notes.push("Critical Spam: SPAM is discarded to player discard pile instead of damage discard pile after resolution. Shutdown removes them normally (Patterned after previous Robo Rally editions).");
  }

  if (scenario.criticalHaywire) {
    notes.push("Critical Haywire: haywires placed on registers are counted to hand size when drawing cards at the beginning of programming phase (Patterned after previous Robo Rally editions).");
  }

  if (scenario.permanentShutdown) {
    notes.push("Permanent Shutdown: if you have nothing but SPAM in your hand after drawing cards at the beginning of programming phase, your robot is destroyed and you are out of the game. If only one robot is left, that player wins the game! (Patterned after previous Robo Rally editions).");
  }

  if (scenario.moreDeadlyGame) {
    notes.push("Hard Reboot: rebooting deals 3 damage instead of 2 (2023 rulebook: A More Deadly Game, p. 28).");
  }

  if (scenario.cuttingFloor) {
    notes.push("Cutting Floor: all board lasers deal double damage (ie. double board laser deals 4 damage).");
  }

  if (scenario.flamingOil) {
    notes.push("Flaming Oil: the first time in a register a given robot enters, exits, or starts the register in an oil slick, they take 1 damage.");
  }

  if (scenario.repulsorOverdrive) {
    notes.push("Repulsor Overdrive: repulsors push robots twice the amount of remaining movement.");
  }

  if (scenario.setToKill) {
    notes.push("Set to Kill: robots' main lasers deal 1 extra damage (Altered from previous Robo Rally editions).");
  }

  if (scenario.setToStun) {
    notes.push("Set to Stun: SPAM drawn as a result of robots main laser is immediately discarded to the damage discard pile without effect.");
  }

  if (scenario.virtualBots) {
    const entry = scenario.checkpoints?.[0];
    const dirText = entry?.facing ? ` facing ${entry.facing}` : "";
    const entryName = scenario.recoveryRule === "reboot_tokens" ? "starting reboot" : "entry";
    const markerDescription = scenario.recoveryRule === "reboot_tokens"
      ? "the reboot token with an orange energy cube on it"
      : "a reboot token with an orange energy cube on it";

    if (scenario.startupSpinUp) {
      notes.push(
        `Virtual Bots: do not use a docking bay or starting spaces. The ${entryName} is marked by ${markerDescription}. Place every player's Archive Token there. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`
      );
      notes.push(
        `Startup Spin-Up with Virtual Bots: in priority order, players choose the initial facing of their Virtual Bots freely at the ${entryName}.`
      );
    } else {
      notes.push(
        `Virtual Bots: do not use a docking bay or starting spaces. The ${entryName} is marked by ${markerDescription}${dirText}. Place every player's Archive Token there facing in the direction shown by the marker. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`
      );
    }
  }

  if (scenario.startupSpinUp && !scenario.virtualBots && !scenario.noDocks) {
    notes.push("Startup Spin-Up: during setup, robots can start with any facing.");
  }

  if (scenario.upgradeWorld) {
    notes.push("Upgrade World: in addition to their usual effect, robots draw one upgrade card when activating batteries and chop shops (Altered from previous Robo Rally editions).");
  }

  if (scenario.classicSharedDeck) {
    notes.push("Shared Deck: shuffle all players' decks as a combined programming deck, and spam cards go to hand instead of deck (Altered from previous Robo Rally editions).");
  }

  if (scenario.lighterGame) {
    notes.push("Energy Crisis: upgrade cards are removed and battery (and chop shop) spaces are inactive (2023 rulebook: A Lighter Game, p. 32).");
  }

  if (scenario.lessForeshadowing) {
    notes.push("Less Foreshadowing: decks reshuffle every turn (Rulebook p. 32).");
  }

  const adviceNotes = [];
  if (scenario.virtualBots && isVariantExplicitlyForced(scenario.preferences, "virtualBots")) {
    const suggestions = [];
    if (!scenario.startupSpinUp) suggestions.push("Startup Spin-Up");
    if (!scenario.dynamicArchiving) suggestions.push("Dynamic Archiving");
    if (suggestions.length) {
      adviceNotes.push(`Consider with Virtual Bots: ${suggestions.join(" and ")} ${suggestions.length === 1 ? "works" : "work"} well with this setup.`);
    }
  }
  if (adviceNoteEl) {
    if (adviceNotes.length) {
      adviceNoteEl.textContent = `RULES NOTES: ${adviceNotes.join(" ")}`;
      adviceNoteEl.classList.remove("hidden");
    } else {
      adviceNoteEl.textContent = "";
      adviceNoteEl.classList.add("hidden");
    }
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

  bottomAnchorEl?.appendChild(bottomRulesBlockEl);
  bottomRulesBlockEl?.classList.toggle("hidden", !checkpointNotes.length && !photoNotes.length);

  const hasTopRules = notes.length > 0 || adviceNotes.length > 0;
  topAnchorEl?.appendChild(topRulesBlockEl);
  topRulesBlockEl?.classList.toggle("hidden", !hasTopRules);
  if (notes.length) {
    noteEl.textContent = `SPECIAL RULES: ${notes.join(" ")}`;
    noteEl.classList.remove("hidden");
  } else {
    noteEl.textContent = "";
    noteEl.classList.add("hidden");
  }
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
    if (id === "actFast" && normalized === "forced" && ACT_FAST_MODE_IDS.has(preferences.actFastMode)) {
      variants.push(`${label} (${formatActFastMode(preferences.actFastMode)})`);
    } else {
      variants.push(`${label} (${getVariantStateCopy(id, normalized).label})`);
    }
  }

  return variants.length ? variants.join(", ") : "none";
}

function updateLegend(scenario) {
  const rebootTokenEl = document.getElementById("legend-reboot-token");
  const payToWinStartEl = document.getElementById("legend-pay-to-win-start");
  if (rebootTokenEl) {
    rebootTokenEl.textContent = scenario?.virtualBots
      ? (scenario?.rebootTokens?.length
        ? "Green markers: Virtual Bots entry and reboot token"
        : "Green marker + orange cube: Virtual Bots entry")
      : "Green marker: reboot token";
  }
  rebootTokenEl?.classList.toggle("hidden", !scenario?.virtualBots && !["reboot_tokens", "home_reboot"].includes(scenario?.recoveryRule));
  payToWinStartEl?.classList.toggle("hidden", !scenario?.payToWin);
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
  if (variantId === "actFast") {
    if (normalized === "off" || normalized === "allowed") {
      setActFastControlChoice(normalized, buttonEl);
      return;
    }
    const currentChoice = getActFastControlChoice(buttonEl);
    setActFastControlChoice(ACT_FAST_MODE_IDS.has(currentChoice) ? currentChoice : "allowed", buttonEl);
    return;
  }

  const targets = buttonEl
    ? [buttonEl]
    : Array.from(document.querySelectorAll(`[data-variant-id="${variantId}"]`));
  if (!targets.length) {
    return;
  }
  const stateCopy = getVariantStateCopy(variantId, normalized);

  targets.forEach((button) => {
    button.dataset.state = normalized;
    button.textContent = stateCopy.shortLabel;
    button.title = stateCopy.label;
    button.setAttribute("aria-label", `${getVariantDefinitionLabel(variantId)}: ${stateCopy.label}`);
  });
}

function cycleVariantControlState(variantId) {
  const current = getVariantControlState(variantId);
  const next = current === "off"
    ? "allowed"
    : current === "allowed"
      ? "forced"
      : "off";
  setVariantControlState(variantId, next);
  if (next === "forced") {
    getConflictingVariantIds(variantId).forEach((conflictId) => {
      if (getVariantControlState(conflictId) === "forced") {
        setVariantControlState(conflictId, "off");
        showToast(`${getVariantDefinitionLabel(conflictId)} was turned off because ${getVariantDefinitionLabel(variantId)} is set to Must.`);
      }
    });
  }
  updateVariantAvailability();
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
  const homeRebootState = getVariantPreferenceState(preferences, "homeReboot");
  const dynamicArchivingState = getVariantPreferenceState(preferences, "dynamicArchiving");
  if (chooseVariantEnabled(homeRebootState, 0.18)) {
    return "home_reboot";
  }
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
    easy: [0, 0, 0, 0, 1, 1, 1, 2],
    moderate: [0, 0, 1, 1, 1, 2, 2, 3],
    hard: [0, 1, 2, 2, 3, 3, 4, 4, 5, 6]
  };

  return sample(budgets[difficulty] || budgets.moderate);
}

function getVariantBaseChance(variantId, preferences = {}) {
  const hardestBlockedVariants = new Set([
    "lighterGame",
    "lessSpammyGame",
    "lessDeadlyGame",
    "setToStun",
    "startupSpinUp"
  ]);
  if (
    isHardestDifficulty(preferences) &&
    hardestBlockedVariants.has(variantId) &&
    getVariantPreferenceState(preferences, variantId) !== "forced"
  ) {
    return 0;
  }

  const difficulty = getTuningDifficulty(preferences.difficulty);
  const byVariant = {
    actFast: { easy: 0.08, moderate: 0.16, hard: 0.2 },
    lighterGame: { easy: 0.42, moderate: 0.28, hard: 0.18 },
    lessSpammyGame: { easy: 0.32, moderate: 0.22, hard: 0.14 },
    criticalSpam: { easy: 0.08, moderate: 0.15, hard: 0.24 },
    criticalHaywire: { easy: 0.08, moderate: 0.14, hard: 0.22 },
    permanentShutdown: { easy: 0.02, moderate: 0.06, hard: 0.12 },
    lessDeadlyGame: { easy: 0.3, moderate: 0.2, hard: 0.14 },
    moreDeadlyGame: { easy: 0.05, moderate: 0.14, hard: 0.26 },
    cuttingFloor: { easy: 0.04, moderate: 0.12, hard: 0.2 },
    flamingOil: { easy: 0.04, moderate: 0.1, hard: 0.18 },
    repulsorOverdrive: { easy: 0.01, moderate: 0.03, hard: 0.06 },
    setToKill: { easy: 0.05, moderate: 0.14, hard: 0.22 },
    setToStun: { easy: 0.12, moderate: 0.14, hard: 0.08 },
    upgradeWorld: { easy: 0.08, moderate: 0.14, hard: 0.18 },
    classicSharedDeck: { easy: 0.01, moderate: 0.07, hard: 0.2 },
    competitiveMode: { easy: 0.08, moderate: 0.16, hard: 0.22 },
    payToWin: { easy: 0.1, moderate: 0.18, hard: 0.2 },
    dynamicArchiving: { easy: 0.24, moderate: 0.4, hard: 0.34 },
    extraDocks: { easy: 0.08, moderate: 0.2, hard: 0.26 },
    factoryRejects: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    startupSpinUp: { easy: 0.08, moderate: 0.14, hard: 0.1 },
    hazardousFlags: { easy: 0.08, moderate: 0.16, hard: 0.24 },
    repairStations: { easy: 0.2, moderate: 0.15, hard: 0.1 },
    movingTargets: { easy: 0.06, moderate: 0.14, hard: 0.22 },
    homeReboot: { easy: 0.06, moderate: 0.12, hard: 0.18 },
    lessForeshadowing: { easy: 0.07, moderate: 0.16, hard: 0.24 },
    staggeredBoards: { easy: 0.18, moderate: 0.42, hard: 0.5 },
    virtualBots: { easy: 0.06, moderate: 0.14, hard: 0.2 },
    noDocks: { easy: 0.07, moderate: 0.16, hard: 0.22 },
    sandwichedDock: { easy: 0.04, moderate: 0.04, hard: 0.04 }
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
    payToWin: -0.04,
    factoryRejects: -0.08,
    hazardousFlags: -0.08,
    movingTargets: -0.1,
    lessForeshadowing: -0.08
  };

  return easingVariants[variantId] ?? hardeningVariants[variantId] ?? 0;
}

function chooseVariantBundle(preferences = {}, options = {}) {
  const { preferences: normalizedPreferences } = normalizeForcedVariantPreferenceConflicts(preferences);
  const definitions = VARIANT_DEFINITIONS.map((variant) => ({
    id: variant.id,
    cost: variant.cost,
    defaultState: variant.defaultState
  }));
  const active = Object.fromEntries(definitions.map((entry) => [entry.id, false]));
  let usedBudget = 0;
  const pieceMap = options.pieceMap ?? cachedAssets?.pieceMap ?? null;
  const collectionAvailableEntries = definitions.filter((entry) => (
    variantIsAvailable(entry.id, normalizedPreferences, pieceMap)
  ));

  const forcedEntries = collectionAvailableEntries.filter((entry) => getVariantPreferenceState(normalizedPreferences, entry.id) === "forced");
  forcedEntries.forEach((entry) => {
    if (getCourseConflictingVariantIds(entry.id).some((conflictId) => active[conflictId])) {
      return;
    }
    active[entry.id] = true;
  });

  const sampledBudget = sampleVariantComplexityBudget(normalizedPreferences);
  const budget = sampledBudget;
  const allowedEntries = collectionAvailableEntries
    .filter((entry) => getVariantPreferenceState(normalizedPreferences, entry.id) === "allowed")
    .map((entry) => ({
      ...entry,
      chance: clamp(
        getVariantBaseChance(entry.id, normalizedPreferences) + getLateEasyVariantRescueBonus(entry.id, normalizedPreferences),
        0,
        0.95
      )
    }));
  const orderedEntries = weightedOrder(
    allowedEntries,
    (entry) => Math.max(0.01, entry.chance + Math.random() * 0.08)
  ).sort((left, right) => {
    if (left.id === "permanentShutdown" && right.id !== "permanentShutdown") {
      return 1;
    }
    if (right.id === "permanentShutdown" && left.id !== "permanentShutdown") {
      return -1;
    }
    return 0;
  });

  for (const entry of orderedEntries) {
    if (usedBudget + entry.cost > budget) {
      continue;
    }

    let chance = entry.chance;
    const forcedConflictIds = getCourseConflictingVariantIds(entry.id).filter((variantId) => active[variantId] && getVariantPreferenceState(normalizedPreferences, variantId) === "forced");
    const activeConflictIds = getCourseConflictingVariantIds(entry.id).filter((variantId) => active[variantId]);
    const missingRequiredIds = getMissingRequiredVariantIds(entry.id, normalizedPreferences, active);
    if (
      activeConflictIds.length ||
      missingRequiredIds.length ||
      forcedConflictIds.length
    ) {
      chance = 0;
    }

    if (Math.random() < chance) {
      active[entry.id] = true;
      usedBudget += entry.cost;
    }
  }

  return buildVariantBundle(active, { budget, usedBudget });
}

function isVariantForced(preferences = {}, variantId) {
  return getVariantPreferenceState(preferences, variantId) === "forced";
}

function isVariantExplicitlyForced(preferences = {}, variantId) {
  if (isVariantForced(preferences, variantId)) {
    return true;
  }
  return variantId === "actFast" && Boolean(preferences.actFastMode);
}

function chooseActFastMode(preferences = {}) {
  const fixedMode = ACT_FAST_MODE_IDS.has(preferences.actFastMode) ? preferences.actFastMode : null;
  if (fixedMode && getVariantPreferenceState(preferences, "actFast") === "forced") {
    return fixedMode;
  }

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
    overlayMode: normalizeOverlayMode(document.getElementById("overlay-mode")?.value),
    actFastMode: getActFastModeFromControls(),
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "rr-dice": document.getElementById("expansion-rr-dice").checked,
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

  const {
    preferences: normalizedPreferences,
    relaxedIds
  } = normalizeForcedVariantPreferenceConflicts(preferences);

  document.getElementById("player-count").value = String(normalizedPreferences.playerCount ?? 4);
  document.getElementById("difficulty").value = normalizedPreferences.difficulty ?? "any";
  document.getElementById("length").value = normalizedPreferences.length ?? "any";
  setOverlayModeControl(normalizedPreferences.overlayMode);
  document.getElementById("expansion-roborally").checked = normalizedPreferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-rr-dice").checked = normalizedPreferences.selectedExpansions?.["rr-dice"] ?? false;
  document.getElementById("expansion-30th-anniversary").checked = normalizedPreferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = normalizedPreferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = normalizedPreferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = normalizedPreferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = normalizedPreferences.selectedExpansions?.["wet-and-wild"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    if (variant.id === "actFast") {
      return;
    }
    setVariantControlState(variant.id, getVariantPreferenceState(normalizedPreferences, variant.id));
  });
  const actFastState = getVariantPreferenceState(normalizedPreferences, "actFast");
  const actFastChoice = actFastState === "forced" && ACT_FAST_MODE_IDS.has(normalizedPreferences.actFastMode)
    ? normalizedPreferences.actFastMode
    : actFastState === "allowed"
      ? "allowed"
      : "off";
  setActFastControlChoice(actFastChoice);
  updateExpansionSummary();

  if (relaxedIds.length) {
    showToast(
      `Conflicting saved Must rules were normalized. ${relaxedIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} changed to Yes.`
    );
  }
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

function shouldUseTargetGuidedBoardSelection(preferences = {}, generationAttempt = 1) {
  // Beginner + Short is the narrowest ordinary target: random board faces are
  // much more likely to create excess hazard/complexity than to land inside
  // the requested band. Use the existing board-profile guidance immediately
  // for that target, while preserving the broader random-first behavior for
  // other requests until the normal fallback point.
  return (
    (getTuningDifficulty(preferences.difficulty) === "easy" && preferences.length === "short") ||
    generationAttempt >= BOARD_SELECTION_FALLBACK_ATTEMPT
  );
}

function weightedFlagCount(lengthPreference, maxFlags, preferences = {}) {
  const table = {
    short: [2, 2, 2, 3, 3],
    moderate: [3, 3, 4, 4, 4],
    long: [3, 4, 4, 5, 5, 6]
  };

  const candidates = (table[lengthPreference] || table.moderate).filter((count) => count <= maxFlags);
  if (isDynamicArchivingActive(preferences) && candidates.length) {
    const highCount = Math.max(...candidates);
    candidates.push(highCount, highCount);
  }

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
  return !getVariantUnavailabilityReason(variantId, preferences, pieceMap);
}

function getVariantCourseUnavailabilityReason(variantId, tileMap) {
  const availabilityRule = getVariantAvailabilityRule(variantId);
  if (!availabilityRule) {
    return null;
  }

  if (availabilityRule.type === "featureTypeAvailable") {
    return countFeatureTypeInTileMap(tileMap, availabilityRule.featureType) > 0
      ? null
      : `No ${availabilityRule.featureType} features on this course.`;
  }

  if (availabilityRule.type === "featureTypesAnyAvailable") {
    return (availabilityRule.featureTypes || []).some((featureType) => (
      countFeatureTypeInTileMap(tileMap, featureType) > 0
    ))
      ? null
      : `None of ${availabilityRule.featureTypes.join(", ")} are on this course.`;
  }

  return null;
}

function applyCourseVariantAvailability(variantBundle, tileMap, preferences = {}) {
  const nextBundle = { ...variantBundle };
  const blockedForced = [];

  for (const variant of VARIANT_DEFINITIONS) {
    if (!nextBundle[variant.id]) {
      continue;
    }

    const unavailableReason = getVariantCourseUnavailabilityReason(variant.id, tileMap);
    if (!unavailableReason) {
      continue;
    }

    if (isVariantForced(preferences, variant.id)) {
      blockedForced.push({ id: variant.id, reason: unavailableReason });
      continue;
    }

    nextBundle[variant.id] = false;
  }

  return {
    variantBundle: nextBundle,
    blockedForced
  };
}

function getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences = {}) {
  const dockFaceGroups = getDockFaceGroups(dockIds, pieceMap);
  const maxDockCount = getMaximumDockCount(preferences, dockFaceGroups.length);
  return dockFaceGroups
    .map((group) => Math.max(...group.map((dockId) => pieceMap[dockId]?.starts?.length ?? 0)))
    .sort((left, right) => right - left)
    .slice(0, maxDockCount)
    .reduce((sum, startCount) => sum + startCount, 0);
}

function updatePlayerCountAvailability(preferences = getPreferencesFromControls()) {
  const select = document.getElementById("player-count");
  if (!select || !cachedAssets?.pieceMap) {
    return;
  }

  const competitiveModeEnabled = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const expansionIds = getSelectedExpansionIds(preferences);
  const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds, preferences);
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessOptionPermitted = noDocksState !== "off";

  Array.from(select.options).forEach((option) => {
    const playerCount = Number(option.value);
    option.disabled = false;
    option.title = "";

    if (!competitiveModeEnabled) {
      return;
    }

    const requiredStarts = playerCount * 2;
    const capacityPreferences = { ...preferences, playerCount, competitiveMode: true };
    const dockCapacity = getMaximumAvailableDockStartCapacity(
      dockIds,
      cachedAssets.pieceMap,
      capacityPreferences
    );
    const supportedByDocks = dockCapacity >= requiredStarts;
    if (!supportedByDocks && !docklessOptionPermitted) {
      option.disabled = true;
      option.title = `Competitive Mode with ${playerCount} players needs ${requiredStarts} starting spaces; current dock settings provide at most ${dockCapacity}. Allow a compatible starting-layout option with enough capacity, reduce the player count, or select sets with more dock capacity.`;
    } else if (!supportedByDocks && docklessOptionPermitted) {
      option.title = `Competitive Mode needs ${requiredStarts} starts. The selected docks provide ${dockCapacity}, so this player count requires a single No Docks edge with at least ${requiredStarts} legal starting spaces.`;
    } else {
      option.title = `Competitive Mode needs ${requiredStarts} starts; the current dock settings can provide ${dockCapacity}.`;
    }
  });

  const selectedOption = select.selectedOptions?.[0];
  select.title = competitiveModeEnabled
    ? (selectedOption?.title || `Competitive Mode needs twice as many starting spaces as players.`)
    : "";
}

function updateVariantAvailability() {
  let preferences = getPreferencesFromControls();

  const competitiveModeForced = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const extraDocksState = getVariantPreferenceState(preferences, "extraDocks");
  if (competitiveModeForced && noDocksState === "off" && extraDocksState === "off" && cachedAssets?.pieceMap) {
    const expansionIds = getSelectedExpansionIds(preferences);
    const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds, preferences);
    const requiredStarts = getRequiredDockStartCount({ ...preferences, competitiveMode: true });
    const currentCapacity = getMaximumAvailableDockStartCapacity(dockIds, cachedAssets.pieceMap, preferences);
    const relaxedPreferences = {
      ...preferences,
      allowedVariantRules: {
        ...(preferences.allowedVariantRules ?? {}),
        extraDocks: "allowed"
      }
    };
    const relaxedCapacity = getMaximumAvailableDockStartCapacity(
      dockIds,
      cachedAssets.pieceMap,
      relaxedPreferences
    );
    if (currentCapacity < requiredStarts && relaxedCapacity >= requiredStarts) {
      setVariantControlState("extraDocks", "allowed");
      showToast(
        `Extra Docks was set to Yes because Competitive Mode with ${preferences.playerCount} players needs ${requiredStarts} starting spaces.`
      );
      preferences = getPreferencesFromControls();
    }
  }

  VARIANT_DEFINITIONS.forEach((variant) => {
    const buttons = Array.from(document.querySelectorAll(`[data-variant-id="${variant.id}"]`));
    if (!buttons.length) {
      return;
    }

    const available = variantIsAvailable(variant.id, preferences);
    const primaryButton = document.getElementById(variant.controlId) ?? buttons[0];
    const previousState = normalizeVariantState(primaryButton.dataset.state ?? variant.defaultState);

    if (!available) {
      const reason = getVariantUnavailabilityReason(variant.id, preferences)
        ?? `${variant.label} is unavailable with the current setup.`;
      const fallbackState = previousState === "forced" || previousState === "allowed" ? "allowed" : "off";
      setVariantControlState(variant.id, fallbackState);
      buttons.forEach((button) => {
        button.disabled = false;
        button.dataset.unavailableReason = reason;
        button.classList.add("unavailable");
        button.setAttribute("aria-disabled", "true");
        button.title = reason;
        button.setAttribute("aria-label", `${variant.label}: unavailable. ${reason}`);
      });
      if (previousState === "forced") {
        showToast(
          `${variant.label} was relaxed to Yes. ${reason}`
        );
      }
    } else {
      buttons.forEach((button) => {
        button.disabled = false;
        delete button.dataset.unavailableReason;
        button.classList.remove("unavailable");
        button.removeAttribute("aria-disabled");
        if (variant.id === "actFast") {
          const choiceDef = ACT_FAST_CONTROL_CHOICES.find((entry) => entry.id === getActFastControlChoice(button)) ?? ACT_FAST_CONTROL_CHOICES[0];
          button.title = choiceDef.label;
          button.setAttribute("aria-label", `Act Fast: ${choiceDef.label}`);
        } else {
          button.title = getVariantStateCopy(variant.id, button.dataset.state ?? variant.defaultState).label;
          button.setAttribute("aria-label", `${variant.label}: ${button.title}`);
        }
      });
    }
  });

  preferences = getPreferencesFromControls();
  updatePlayerCountAvailability(preferences);
  updateOverlayAvailability(preferences);
  updateVariantSummary();
}

function canSupportRequiredDockStarts(dockIds, pieceMap, preferences = {}) {
  return getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences) >= getRequiredDockStartCount(preferences);
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

function tileHasRepulsorOnEdge(features = [], edge) {
  return features.some((feature) => feature.type === "repulsor" && (feature.sides || []).includes(edge));
}

function tileHasRedWallOnSide(features = [], side) {
  return features.some((feature) => feature.type === "redWall" && (feature.sides || []).includes(side));
}

function tileHasLedgeOnSide(features = [], side) {
  return features.some((feature) => feature.type === "ledge" && (feature.sides || []).includes(side));
}

function tileHasLaserSupportBlock(features = [], side, options = {}) {
  if (
    tileHasWallOnSide(features, side) ||
    tileHasRepulsorOnEdge(features, side) ||
    tileHasRedWallOnSide(features, side)
  ) {
    return true;
  }

  // A ledge only provides a physical laser-support wall from its LOWER tile.
  // The neighboring upper/platform tile does not have a wall face on that edge.
  // Green wall markers never provide support by themselves.
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
    if (tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side), { includeLowerLedge: false })) {
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
  if (normalizeOverlayMode(preferences.overlayMode) === OVERLAY_MODES.no) {
    return [];
  }

  const usedStructuralBoards = new Set(
    structuralPlacements.map((placement) => getPhysicalBoardId(pieceMap[placement.pieceId]))
  );
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionIds);
  const miniOverlayIds = shouldUseMiniOverlays(preferences)
    ? overlayIds.filter((overlayId) => isMiniOverlayPiece(pieceMap[overlayId]))
    : [];
  const boardOverlayIds = shouldUseBoardOverlays(preferences)
    ? overlayIds.filter((overlayId) => (
      !isMiniOverlayPiece(pieceMap[overlayId]) &&
      !usedStructuralBoards.has(getPhysicalBoardId(pieceMap[overlayId]))
    ))
    : [];

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

function canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints = [], options = {}) {
  return checkpoints.some((checkpoint) => {
    const analysis = analyzeFlagLeg(tileMap, point, checkpoint, {
      facings: FACINGS,
      routesPerFacing: 1,
      maxDistinctRoutes: 1,
      maxExpansions: 8000,
      playerCount: 1,
      recoveryRule: "dynamic_archiving",
      lessDeadlyGame: options.lessDeadlyGame
    });

    return Number.isFinite(analysis.summary.bestRouteScore);
  });
}

function placeHomeRebootTokens(dockPlacements, pieceMap, starts = [], tileMap, checkpoints = [], options = {}) {
  const tokens = [];
  const startKeys = new Set(starts.map((start) => `${start.x},${start.y}`));
  const checkpointKeys = new Set(checkpoints.map((checkpoint) => `${checkpoint.x},${checkpoint.y}`));

  dockPlacements.forEach((dockPlacement, dockIndex) => {
    const dockStarts = starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap));
    if (!dockStarts.length) {
      return;
    }

    const piece = pieceMap[dockPlacement.pieceId];
    const occupiedOffsets = getPlacementOccupiedOffsets(piece, dockPlacement.rotation ?? 0);
    const candidatePoints = occupiedOffsets
      .map((offset) => ({
        x: dockPlacement.x + offset.x,
        y: dockPlacement.y + offset.y
      }))
      .filter((point) => !startKeys.has(`${point.x},${point.y}`))
      .filter((point) => !checkpointKeys.has(`${point.x},${point.y}`))
      .filter((point) => {
        const tile = tileMap?.get(`${point.x},${point.y}`) ?? { features: [] };
        return !(tile.features || []).some((feature) => feature.type === "pit");
      })
      .filter((point) => canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints, options));

    if (!candidatePoints.length) {
      return;
    }

    const dims = rotatedDimensions(piece, dockPlacement.rotation ?? 0);
    const center = {
      x: dockPlacement.x + (dims.width - 1) / 2,
      y: dockPlacement.y + (dims.height - 1) / 2
    };
    const token = candidatePoints
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - center.x) + Math.abs(left.y - center.y);
        const rightDistance = Math.abs(right.x - center.x) + Math.abs(right.y - center.y);
        return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
      })[0];

    tokens.push({
      dockIndex,
      pieceId: dockPlacement.pieceId,
      x: token.x,
      y: token.y,
      startKeys: dockStarts.map((start) => `${start.x},${start.y}`)
    });
  });

  return tokens;
}

function getNoDockEdgeTiles(boardRect, side) {
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

function getNoDockInwardFacing(side) {
  return { N: "S", E: "W", S: "N", W: "E" }[side];
}

function getDirectionDelta(dir) {
  return {
    N: { dx: 0, dy: -1, opposite: "S" },
    E: { dx: 1, dy: 0, opposite: "W" },
    S: { dx: 0, dy: 1, opposite: "N" },
    W: { dx: -1, dy: 0, opposite: "E" }
  }[dir];
}

function isNoDockStartTileClear(tile) {
  // The square itself only needs a clear floor. Passive border geometry is
  // allowed; floor features and active edge devices make the square unsuitable
  // as an offered No-Docks start.
  return Boolean(tile) && (tile.features || []).every((feature) => (
    NO_DOCK_START_EDGE_FEATURE_TYPES.has(feature.type)
  ));
}

function buildNoDockEdgeCandidate(boardRect, side, tileMap) {
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

function orderNoDockEdgeStartsCenterOut(edge) {
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

function getNoDockStartTargetCount(requiredStarts, options = {}) {
  const playerCount = Math.max(1, Number(options.playerCount ?? requiredStarts ?? 1));
  const competitiveMode = typeof options.competitiveMode === "boolean"
    ? options.competitiveMode
    : getVariantPreferenceState(options, "competitiveMode") === "forced";

  // Competitive deliberately needs its full 2P strategic candidate pool.
  // Normal and Pay to Win benefit from a small two-start reserve so one failed
  // route or fairness/pricing exclusion does not instantly make a P-player
  // No-Docks setup impossible. The reserve is a target, not a hard capacity
  // requirement: a legal edge with only P or P+1 starts can still be used.
  return competitiveMode
    ? Math.max(requiredStarts, playerCount * 2)
    : Math.max(requiredStarts, playerCount + 2);
}

function chooseNoDockStartingZones(boardRects, tileMap, requiredStarts, options = {}) {
  // v23: No Docks is deliberately a single-zone layout mode. Extra Docks and
  // Sandwiched Dock are mutually exclusive with it, so do not combine edges.
  const targetStarts = getNoDockStartTargetCount(requiredStarts, options);
  const candidates = [];

  for (const boardRect of boardRects) {
    for (const side of ["N", "E", "S", "W"]) {
      const edge = buildNoDockEdgeCandidate(boardRect, side, tileMap);
      if (edge.starts.length < requiredStarts) continue;

      const ordered = orderNoDockEdgeStartsCenterOut(edge);
      const starts = ordered.slice(0, Math.min(targetStarts, ordered.length));
      candidates.push({
        edges: [edge],
        starts,
        zoneCount: 1,
        requiredStarts,
        targetStarts,
        score: (edge.score || 0) + starts.length * 4
      });
    }
  }

  if (!candidates.length) return null;
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const nearBest = candidates.filter((candidate) => candidate.score >= bestScore - 10);
  return sample(nearBest);
}

function chooseNoDockStartingEdge(boardRects, tileMap, requiredStarts) {
  const selection = chooseNoDockStartingZones(boardRects, tileMap, requiredStarts, {
    extraDocksState: "off"
  });
  return selection?.edges?.[0] ?? null;
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

function getMostDistantBoardIndexFromStarts(boardPlacements, starts, pieceMap) {
  if (!(starts || []).length) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = -Infinity;
  boardPlacements.forEach((placement, index) => {
    const center = getPlacementCenter(placement, pieceMap);
    const distance = Math.min(...starts.map((start) => (
      Math.abs(center.x - start.x) + Math.abs(center.y - start.y)
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

function getMovingTraceStepLimit(tileMap, options = {}) {
  if (Number.isFinite(options.maxTraceSteps)) {
    return Math.max(1, options.maxTraceSteps);
  }

  return Math.min(180, Math.max(48, tileMap?.size ?? 48));
}

function pointStartsClosedConveyorLoop(tileMap, point, options = {}) {
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

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);

  for (let step = 0; step < maxTraceSteps; step += 1) {
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

function getMovingCheckpointTrace(tileMap, point, cache = null, options = {}) {
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

  const maxTraceSteps = getMovingTraceStepLimit(tileMap, options);
  const cacheKey = `${point.x},${point.y}:${maxTraceSteps}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const startTile = tileMap.get(`${point.x},${point.y}`);
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

  for (let step = 0; step < maxTraceSteps; step += 1) {
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
      hazardLoad += getTilePenaltyForFeature(feature, {
        batteryActive: true,
        lessSpammyGame: options.lessSpammyGame,
        criticalSpam: options.criticalSpam,
        criticalHaywire: options.criticalHaywire,
        permanentShutdown: options.permanentShutdown
      });
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

  if (pointStartsClosedConveyorLoop(tileMap, point, { maxTraceSteps: getMovingTraceStepLimit(tileMap) })) {
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

function summarizeMovingTargets(tileMap, checkpoints = [], options = {}) {
  const traceCache = new Map();
  const active = checkpoints
    .map((checkpoint) => ({
      checkpoint,
      trace: getMovingCheckpointTrace(tileMap, checkpoint, traceCache, options)
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
    active.length * 1.6 +
    Math.max(0, totalPathLength - active.length) * 0.42 +
    totalTurns * 0.3 +
    fastSegments * 0.22 +
    totalHazardLoad * 0.08
  ).toFixed(2));
  const lengthBonus = Number((
    active.length * 0.75 +
    Math.max(0, totalPathLength - active.length) * 0.25 +
    totalTurns * 0.14 +
    wrapCount * 0.2
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

function moveCheckpointOneConveyorStep(tileMap, point, eligibleSpeed, reentry) {
  const tile = tileMap?.get(`${point.x},${point.y}`);
  const belt = getTileBelt(tile);
  if (!belt || belt.speed !== eligibleSpeed || !CARDINAL_DIRS[belt.dir]) {
    return { ...point };
  }

  const next = getConveyorSuccessor(tileMap, point);
  if (!next) {
    return { ...reentry };
  }

  return next;
}

function advanceMovingCheckpointRegister(tileMap, point, reentry) {
  let current = { ...point };

  for (let step = 0; step < 2; step += 1) {
    const next = moveCheckpointOneConveyorStep(tileMap, current, 2, reentry);
    if (next.x === current.x && next.y === current.y) {
      break;
    }
    current = next;
  }

  current = moveCheckpointOneConveyorStep(tileMap, current, 1, reentry);
  return current;
}

function buildMovingCheckpointTimeline(tileMap, checkpoint, id, options = {}) {
  const trace = getMovingCheckpointTrace(tileMap, checkpoint, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  if (!trace.moving) {
    return null;
  }

  const reentry = findMovingCheckpointReentryPoint(tileMap, checkpoint);
  const reentryTrace = getMovingCheckpointTrace(tileMap, reentry, null, {
    ...options,
    maxTraceSteps: options.maxTraceSteps ?? getMovingTraceStepLimit(tileMap)
  });
  const maxActions = options.maxActions ?? 16;
  const positions = [{ x: checkpoint.x, y: checkpoint.y }];
  const seen = new Map([[`${checkpoint.x},${checkpoint.y}`, 0]]);
  let current = { x: checkpoint.x, y: checkpoint.y };
  let periodStart = null;
  let periodLength = null;

  for (let action = 1; action <= maxActions; action += 1) {
    current = advanceMovingCheckpointRegister(tileMap, current, reentry);
    positions.push({ x: current.x, y: current.y });
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) {
      periodStart = seen.get(key);
      periodLength = action - periodStart;
      break;
    }
    seen.set(key, action);
  }

  return {
    id,
    reentry,
    positions,
    displayPositions: reentryTrace.coverage?.length ? reentryTrace.coverage : trace.coverage?.length ? trace.coverage : positions,
    periodStart: periodStart ?? Math.max(0, positions.length - 1),
    periodLength: periodLength ?? 0,
    maxActions,
    trace
  };
}

function buildMovingTargetTimelines(tileMap, checkpoints = [], enabled = false, options = {}) {
  if (!enabled || !tileMap || !checkpoints.length) {
    return [];
  }

  return checkpoints.map((checkpoint, index) => (
    buildMovingCheckpointTimeline(tileMap, checkpoint, index + 1, options)
  ));
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

function isFirstFlagFarEnough(flag, starts, thresholds, options = {}) {
  if (!starts.length) {
    return true;
  }

  const entries = starts.map((start) => ({
    start,
    distance: manhattanDistance(flag, start),
    zoneKey: start.noDockZoneKey ?? null
  }));
  const zoneKeys = new Set(entries.map((entry) => entry.zoneKey).filter(Boolean));
  const multiZoneNoDocks = Boolean(options.noDocks && zoneKeys.size > 1);

  if (!multiZoneNoDocks) {
    const distances = entries.map((entry) => entry.distance);
    const nearest = Math.min(...distances);
    const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    return nearest >= thresholds.nearest && averageDistance >= thresholds.average;
  }

  // Multiple No-Docks zones deliberately carry a small reserve. Requiring the
  // first checkpoint to clear the normal nearest-distance threshold from every
  // reserve start can make two well-separated edges geometrically impossible.
  // Instead require enough starts to field the players after spending the
  // reserve; final route/fairness pruning decides which starts are actually kept.
  const playerCount = Math.max(1, Number(options.playerCount ?? starts.length));
  const qualifying = entries.filter((entry) => entry.distance >= thresholds.nearest);
  if (qualifying.length < Math.min(playerCount, starts.length)) {
    return false;
  }

  const extraDocksForced = options.extraDocksState === "forced" ||
    getVariantPreferenceState(options, "extraDocks") === "forced";
  if (extraDocksForced) {
    const qualifyingZones = new Set(qualifying.map((entry) => entry.zoneKey).filter(Boolean));
    if (qualifyingZones.size < Math.min(2, zoneKeys.size)) {
      return false;
    }
  }

  // Judge the same P starts that could remain after the reserve is pruned.
  const retainedDistances = qualifying
    .map((entry) => entry.distance)
    .sort((left, right) => right - left)
    .slice(0, Math.min(playerCount, qualifying.length));
  const retainedAverage = retainedDistances.reduce((sum, value) => sum + value, 0) /
    Math.max(1, retainedDistances.length);
  return retainedAverage >= thresholds.average;
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
      batteryActive: !preferences.lighterGame,
      cuttingFloor: preferences.cuttingFloor,
      criticalSpam: preferences.criticalSpam,
      criticalHaywire: preferences.criticalHaywire,
      permanentShutdown: preferences.permanentShutdown
    });

    if (feature.type === "flamethrower") {
      featurePenalty += 5.5;
    } else if (feature.type === "laser") {
      featurePenalty += 3.5 + getEffectiveLaserDamage(feature, preferences) * 0.5;
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
          batteryActive: !preferences.lighterGame,
          cuttingFloor: preferences.cuttingFloor,
          criticalSpam: preferences.criticalSpam,
          criticalHaywire: preferences.criticalHaywire,
          permanentShutdown: preferences.permanentShutdown
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

function isDynamicArchivingActive(preferences = {}) {
  return preferences.recoveryRule === "dynamic_archiving";
}

function isArchiveFeature(feature, preferences = {}) {
  return feature?.type === "checkpoint" || feature?.type === "battery";
}

function getDynamicArchivingCandidateBonus(candidate, tileMap, preferences = {}) {
  if (!isDynamicArchivingActive(preferences)) {
    return 0;
  }

  let bonus = 0;
  const tile = tileMap.get(`${candidate.x},${candidate.y}`);
  if ((tile?.features || []).some((feature) => isArchiveFeature(feature, preferences))) {
    bonus += 3.2;
  }

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > 1) {
        continue;
      }

      const adjacentTile = tileMap.get(`${candidate.x + dx},${candidate.y + dy}`);
      if ((adjacentTile?.features || []).some((feature) => isArchiveFeature(feature, preferences))) {
        bonus += 0.7;
      }
    }
  }

  return Number(Math.min(4.6, bonus).toFixed(2));
}

function getFlagCandidateWeight(candidate, tileMap, starts, preferences, sequenceIndex, guidanceLevel, thresholds, previousFlag = null, movingTargetTraceCache = null) {
  let weight = candidate.weight ?? 1;
  const approachStats = getFlagCandidateApproachStats(tileMap, candidate);
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const lengthPreference = preferences.length ?? "moderate";
  const tilePenalty = getFlagCandidateTilePenalty(candidate, tileMap, difficulty, preferences);
  const areaPenalty = getFlagCandidateAreaPenalty(candidate, tileMap, difficulty, preferences);
  const dynamicArchivingBonus = getDynamicArchivingCandidateBonus(candidate, tileMap, preferences);

  weight += approachStats.openCount * (difficulty === "easy" ? 2.6 : 1.1);
  weight -= approachStats.pitCount * (difficulty === "easy" ? 2.2 : 0.9);
  weight -= approachStats.voidCount * (difficulty === "easy" ? 1.7 : 0.7);
  weight -= tilePenalty + areaPenalty;
  weight += dynamicArchivingBonus;

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
    const trace = getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences);
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
        (sequenceIndex !== 0 || isFirstFlagFarEnough(candidate, starts, thresholds, preferences)) &&
        picked.every((flag, index) => {
          const minDistance = index === sequenceIndex - 1
            ? getSequentialFlagDistanceThreshold(preferences, index, flagCount, guidanceLevel)
            : getConsecutiveFlagDistanceThreshold(preferences, guidanceLevel);
          return !areFlagsTooClose(flag, candidate, minDistance);
        })
      ))
      .map((candidate) => {
        const dynamicArchivingBonus = getDynamicArchivingCandidateBonus(candidate, tileMap, preferences);
        return {
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
            : (candidate.weight ?? 1) + dynamicArchivingBonus
        };
      });

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
  const farthestBoardIndex = preferences.noDocks && starts.length
    ? getMostDistantBoardIndexFromStarts(boardPlacements, starts, pieceMap)
    : getMostDistantBoardIndex(boardPlacements, dockPlacements, pieceMap);
  const farthestBoardPieceId = boardPlacements[farthestBoardIndex]?.pieceId;
  const mustUseFarthestBoard = boardPlacements.length > 1 && farthestBoardPieceId;
  const firstFlagThresholds = getFirstFlagDistanceThresholds(preferences.length, guidanceLevel);
  const { tileMap } = buildResolvedMap([...boardPlacements, ...(dockPlacements || [])], pieceMap);
  const movingTargetTraceCache = preferences.movingTargets ? new Map() : null;
  const movingCandidates = preferences.movingTargets
    ? new Set(flagCandidates
      .filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, preferences).moving)
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

    if (!isFirstFlagFarEnough(sampled[0], starts, firstFlagThresholds, preferences)) {
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

function hideVirtualFlagZeroFeature(tileMap, flagZero) {
  if (!flagZero) return tileMap;
  const next = cloneTileMap(tileMap);
  const key = `${flagZero.x},${flagZero.y}`;
  const tile = next.get(key);
  if (tile) {
    tile.features = (tile.features || []).filter((feature) => feature.type !== "checkpoint");
    next.set(key, tile);
  }
  return next;
}

function getVirtualBotEntryDirections(tileMap, point) {
  const deltas = {
    N: { dx: 0, dy: -1, opposite: "S" },
    E: { dx: 1, dy: 0, opposite: "W" },
    S: { dx: 0, dy: 1, opposite: "N" },
    W: { dx: -1, dy: 0, opposite: "E" }
  };
  return Object.entries(deltas).filter(([dir, d]) => {
    const fromTile = tileMap.get(`${point.x},${point.y}`);
    const toTile = tileMap.get(`${point.x + d.dx},${point.y + d.dy}`);
    if (!toTile) return false;
    if (getWallsAtTile(fromTile).has(dir) || getWallsAtTile(toTile).has(d.opposite)) return false;
    return !(toTile.features || []).some((feature) => feature.type === "pit");
  }).map(([dir]) => dir);
}

function getPlayableCheckpoints(checkpoints = [], virtualBots = false) {
  return virtualBots ? checkpoints.slice(1) : checkpoints;
}

function buildVirtualRobotStarts(flagZero, playerCount = 4, startupSpinUp = false) {
  if (!flagZero) return [];
  return Array.from({ length: Math.max(1, playerCount) }, (_, index) => ({
    x: flagZero.x,
    y: flagZero.y,
    ...(startupSpinUp ? {} : { facing: flagZero.facing ?? "E" }),
    virtualRobotIndex: index
  }));
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

function placementsOverlapArea(leftPlacement, rightPlacement, pieceMap) {
  const leftPiece = pieceMap[leftPlacement?.pieceId];
  const rightPiece = pieceMap[rightPlacement?.pieceId];
  if (!leftPiece || !rightPiece) return false;
  const left = getPlacedRect(leftPiece, leftPlacement);
  const right = getPlacedRect(rightPiece, rightPlacement);
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

function dockPlacementOverlapsBlockers(dockPlacement, blockingPlacements, pieceMap) {
  return (blockingPlacements || []).some((blocker) => placementsOverlapArea(dockPlacement, blocker, pieceMap));
}

// Sandwiched Dock used to work with the legacy bridge helper above. Keep that
// path untouched and use this separate helper only for additional docks on a
// sandwich layout, whose factory boards are intentionally disconnected.
function findBoundaryDockPlacementOnBoards(boardPlacements, pieceMap, dockPieceId, dockFlipped, blockingPlacements = [], options = {}) {
  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(boardPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const dockFrontageLength = getDockFrontageLength(dock);
  const candidates = [];

  for (const run of shuffle(validRuns)) {
    const availableOffsets = run.length - dockFrontageLength;
    const offsets = [];
    for (let offset = 0; offset <= availableOffsets; offset += 1) offsets.push(offset);

    for (const offset of shuffle(offsets)) {
      const dockPlacement = projectDockPlacement(run, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, boardPlacements, pieceMap, footprintTiles);
      if (!dockValidation.valid) continue;
      if (dockPlacementOverlapsBlockers(dockPlacement, blockingPlacements, pieceMap)) continue;
      if (options.alignedLayout && !hasAlignedDockFrontage(boardPlacements, pieceMap, dockPlacement)) continue;
      candidates.push({ dockPlacement, dockValidation, boundaryRun: run });
    }
  }

  return candidates.length ? sample(candidates) : null;
}

function findAdditionalBridgeDockPlacement(boardPlacements, pieceMap, dockPieceId, dockFlipped, blockingPlacements = [], options = {}) {
  // The legacy helper samples one valid bridge. Retry a few times so a second
  // bridge can avoid an already placed dock without changing legacy behavior.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = findBridgeDockPlacement(boardPlacements, pieceMap, dockPieceId, dockFlipped);
    if (!candidate) return null;
    if (dockPlacementOverlapsBlockers(candidate.dockPlacement, blockingPlacements, pieceMap)) continue;
    if (options.alignedLayout && !hasAlignedDockFrontage(boardPlacements, pieceMap, candidate.dockPlacement)) continue;
    return candidate;
  }
  return null;
}

function canBridgeDisconnectedLayout(structuralPlacements, pieceMap, dockPieceId) {
  return Boolean(
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, false) ||
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, true)
  );
}

function tryExtendBoardLayout(existingPlacements, nextBoardId, pieceMap, dockPieceId, allowDockBridge = false, options = {}) {
  const nextBoard = pieceMap[nextBoardId];
  const dock = pieceMap[dockPieceId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    if (!options.bridgeOnly) {
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
  const allowBlankMiniBoards = preferences.difficulty === "easy" || shouldUseMiniOverlays(preferences);
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds).filter((boardId) => (
    allowBlankMiniBoards || !isBlankCustomBoardPiece(pieceMap[boardId])
  ));
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  const maxBoards = Math.min(hasLargeBoards ? 4 : 6, countPhysicalBoards(mainBoardIds, pieceMap));
  let boardCount = weightedBoardCount(lengthPreference, maxBoards, hasLargeBoards, preferences);
  if (preferences.sandwichedDock && maxBoards >= 2) {
    boardCount = Math.max(2, boardCount);
  }
  const shouldForceFilteredSubset = shouldUseTargetGuidedBoardSelection(
    preferences,
    generationAttempt
  );
  const requireDockSupport = !preferences.noDocks && !preferences.virtualBots;
  const hasDockPiece = Boolean(dockPieceId && pieceMap[dockPieceId]);
  let boardIds = [];

  if (!shouldForceFilteredSubset) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidateBoardIds = sampleDistinctBoardFaces(mainBoardIds, boardCount, pieceMap);
      if (candidateBoardIds.length !== boardCount) {
        continue;
      }
      if (requireDockSupport && !boardIdsCanSupportDock(candidateBoardIds, pieceMap, dockPieceId)) {
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

    if (fallbackBoardIds.length === boardCount && (!requireDockSupport || boardIdsCanSupportDock(fallbackBoardIds, pieceMap, dockPieceId))) {
      boardIds = fallbackBoardIds;
    }
  }

  if (boardIds.length !== boardCount || (preferences.sandwichedDock && boardCount < 2)) {
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
    const isFinalBoard = index === boardIds.length - 2;
    const forceDockBridge = Boolean(preferences.sandwichedDock && isFinalBoard && hasDockPiece);
    const allowDockBridge = forceDockBridge || (!preferences.alignedLayout && isFinalBoard);
    let extension = null;

    if (forceDockBridge) {
      // A sandwiched dock is deliberately the bridge between two board components.
      // Staggering may offset the opposing long-side frontage; aligned layouts use
      // the same bridge geometry but require the dock frontage alignment below.
      extension = tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, true, {
        bridgeOnly: true
      });
    } else {
      extension = preferences.alignedLayout
        ? tryExtendAlignedBoardLayout(placements, nextBoardId, pieceMap)
        : tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, allowDockBridge && hasDockPiece);
    }

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

function getIntervalCoverageLength(intervals = []) {
  if (!intervals.length) return 0;
  const ordered = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let total = 0;
  let currentStart = ordered[0]?.[0] ?? 0;
  let currentEnd = ordered[0]?.[1] ?? 0;

  for (const [start, end] of ordered.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  return total + Math.max(0, currentEnd - currentStart);
}

function getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap) {
  if (!dockPlacement) {
    return { valid: false, boardIndices: [] };
  }

  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return { valid: false, boardIndices: [] };
  }

  const dockRect = getPlacedRect(dockPiece, dockPlacement);
  const boardRects = (boardPlacements || []).map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const horizontal = dockRect.width >= dockRect.height;
  const sideA = [];
  const sideB = [];
  const sideAIndices = new Set();
  const sideBIndices = new Set();

  for (const rect of boardRects) {
    if (horizontal) {
      const start = Math.max(rect.x, dockRect.x);
      const end = Math.min(rect.x + rect.width, dockRect.x + dockRect.width);
      if (end <= start) continue;

      if (rect.y + rect.height === dockRect.y) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.y === dockRect.y + dockRect.height) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    } else {
      const start = Math.max(rect.y, dockRect.y);
      const end = Math.min(rect.y + rect.height, dockRect.y + dockRect.height);
      if (end <= start) continue;

      if (rect.x + rect.width === dockRect.x) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.x === dockRect.x + dockRect.width) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    }
  }

  const requiredCoverage = horizontal ? dockRect.width : dockRect.height;
  const sideACoverage = getIntervalCoverageLength(sideA);
  const sideBCoverage = getIntervalCoverageLength(sideB);
  const valid = (
    sideACoverage >= requiredCoverage &&
    sideBCoverage >= requiredCoverage &&
    sideAIndices.size > 0 &&
    sideBIndices.size > 0
  );

  return {
    valid,
    boardIndices: valid
      ? [...new Set([...sideAIndices, ...sideBIndices])]
      : [],
    sideACoverage,
    sideBCoverage,
    requiredCoverage
  };
}

function getProtectedSandwichBoardIndices(boardPlacements, dockPlacements, pieceMap) {
  const protectedIndices = new Set();

  for (const dockPlacement of dockPlacements || []) {
    const structure = getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap);
    if (!structure.valid) continue;
    structure.boardIndices.forEach((index) => protectedIndices.add(index));
  }

  return protectedIndices;
}

function hasPhysicalSandwichedDock(boardPlacements, dockPlacements, pieceMap) {
  return (dockPlacements || []).some((dockPlacement) => (
    getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap).valid
  ));
}

function buildDockSummaries(boardPlacements, dockPlacements, pieceMap) {
  return dockPlacements.map((dockPlacement) => ({
    pieceId: dockPlacement.pieceId,
    flipped: Boolean((dockPlacement.rotation ?? 0) % 180),
    boundaryRun: getDockBoundaryRun(boardPlacements, dockPlacement, pieceMap)
  }));
}

function getRouteAnalysisVariantOptions(options = {}) {
  return {
    lessDeadlyGame: options.lessDeadlyGame,
    moreDeadlyGame: options.moreDeadlyGame,
    lighterGame: options.lighterGame,
    upgradeWorld: options.upgradeWorld,
    lessSpammyGame: options.lessSpammyGame,
    criticalSpam: options.criticalSpam,
    criticalHaywire: options.criticalHaywire,
    permanentShutdown: options.permanentShutdown,
    cuttingFloor: options.cuttingFloor,
    flamingOil: options.flamingOil,
    repulsorOverdrive: options.repulsorOverdrive
  };
}

function getPayToWinTrafficScaleMultiplier(playerCount = 4) {
  return clamp((playerCount || 4) / 4, 0.5, 1);
}

function getPayToWinAnalysisOptions(options = {}, playerCount = 4) {
  return options.payToWin
    ? {
      ...options,
      trafficScaleMultiplier: getPayToWinTrafficScaleMultiplier(playerCount)
    }
    : options;
}

function getCourseStartingEnergy(options = {}) {
  const explicitStartingEnergy = Number(options.startingEnergy);
  if (Number.isFinite(explicitStartingEnergy)) {
    return Math.max(0, Math.floor(explicitStartingEnergy));
  }

  const startingEnergyDelta = Number(options.startingEnergyDelta);
  return Math.max(
    0,
    DEFAULT_STARTING_ENERGY + (Number.isFinite(startingEnergyDelta) ? Math.trunc(startingEnergyDelta) : 0)
  );
}

function getPayToWinDenialCost(options = {}) {
  return getCourseStartingEnergy(options) + 1;
}

function getPayToWinRemovalBias(options = {}) {
  let bias = 0;
  if (options.length === "short") {
    bias += 1;
  } else if (options.length === "long") {
    bias -= 1;
  }

  if (options.difficulty === "easy") {
    bias += 1;
  } else if (options.difficulty === "hard" || options.difficulty === "brutal") {
    bias -= 1;
  }

  return bias;
}

function getPayToWinCostEntries(firstLeg, excludedIndices = new Set()) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));

  if (!activeStarts.length) {
    return { entries: [], costUnit: 1, minScore: 0, maxScore: 0 };
  }

  const adjustedScores = activeStarts.map((item) => item.adjustedScore);
  const minScore = Math.min(...adjustedScores);
  const maxScore = Math.max(...adjustedScores);
  const costUnit = Math.max(1, minScore / 10);
  const entries = activeStarts.map((item) => ({
    startAnalysis: item,
    index: item.index,
    adjustedScore: item.adjustedScore,
    energyCost: Math.max(0, Math.floor((maxScore - item.adjustedScore) / costUnit))
  }));

  return {
    entries,
    costUnit: Number(costUnit.toFixed(2)),
    minScore,
    maxScore
  };
}

function getPayToWinLatePricingConfig(startCount, playerCount) {
  const safePlayerCount = Math.max(1, playerCount ?? 1);
  const latePlayerCount = Math.ceil(safePlayerCount / 3);
  const lateSelectorStart = safePlayerCount - latePlayerCount + 1;
  const surplusStarts = Math.max(0, startCount - safePlayerCount);

  return {
    lateSelectorStart,
    lateSelectorEnd: safePlayerCount,
    latePlayerCount,
    surplusStarts
  };
}

function unrankPayToWinCombination(items, chooseCount, rank) {
  if (chooseCount <= 0) {
    return [];
  }

  const result = [];
  let offset = 0;
  let remaining = chooseCount;
  let workingRank = Math.max(0, rank);

  while (remaining > 0 && offset < items.length) {
    for (
      let position = offset;
      position <= items.length - remaining;
      position += 1
    ) {
      const suffixCount = getCombinationCount(
        items.length - position - 1,
        remaining - 1,
        1000000000
      );

      if (workingRank < suffixCount) {
        result.push(items[position]);
        offset = position + 1;
        remaining -= 1;
        break;
      }

      workingRank -= suffixCount;
    }
  }

  return result;
}

function samplePayToWinKnownSelections(
  otherIndices,
  knownCount,
  sampleLimit = 6
) {
  if (knownCount <= 0) {
    return [[]];
  }
  if (knownCount >= otherIndices.length) {
    return [[...otherIndices]];
  }

  const total = getCombinationCount(
    otherIndices.length,
    knownCount,
    1000000000
  );
  const sampleCount = Math.max(1, Math.min(sampleLimit, total));

  if (total <= sampleCount) {
    const combinations = [];
    const chosen = [];
    const visit = (offset) => {
      if (chosen.length === knownCount) {
        combinations.push([...chosen]);
        return;
      }
      const needed = knownCount - chosen.length;
      for (
        let position = offset;
        position <= otherIndices.length - needed;
        position += 1
      ) {
        chosen.push(otherIndices[position]);
        visit(position + 1);
        chosen.pop();
      }
    };
    visit(0);
    return combinations;
  }

  const sampled = [];
  const seen = new Set();
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rank = Math.min(
      total - 1,
      Math.floor(((sample + 0.5) * total) / sampleCount)
    );
    const combination = unrankPayToWinCombination(
      otherIndices,
      knownCount,
      rank
    );
    const key = combination.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      sampled.push(combination);
    }
  }

  return sampled;
}

function getPayToWinLateCostEntries(
  firstLeg,
  tileMap,
  excludedIndices = new Set(),
  playerCount = 4,
  options = {}
) {
  const activeStarts = (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    item.fullCourseRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
  const config = getPayToWinLatePricingConfig(
    activeStarts.length,
    playerCount
  );

  if (!activeStarts.length) {
    return {
      entries: [],
      costUnit: 1,
      minScore: 0,
      maxScore: 0,
      scenarioSamples: 0,
      ...config
    };
  }

  let scenarioSamples = 0;
  const activeIndices = activeStarts.map((item) => item.index);
  const scoreByIndex = new Map();

  for (const item of activeStarts) {
    const otherIndices = activeIndices.filter(
      (index) => index !== item.index
    );
    const baselineFirstTotal = (
      (item.bestScore ?? item.selectedRoute?.score ?? 0) +
      (item.trafficPenalty ?? 0)
    );
    const baselineFullTotal = (
      (item.courseEstimate?.totalScore ?? item.fullCourseRoute?.score ?? 0) +
      (
        item.courseEstimate?.fullCourseTrafficPenalty ??
        item.fullCourseTrafficPenalty ??
        0
      )
    );
    const scenarioScores = [];

    for (
      let selector = config.lateSelectorStart;
      selector <= config.lateSelectorEnd;
      selector += 1
    ) {
      const knownCount = Math.min(
        otherIndices.length,
        selector - 1
      );
      const knownSamples = samplePayToWinKnownSelections(
        otherIndices,
        knownCount,
        options.payToWinLateScenarioSamples ?? 6
      );

      for (const knownIndices of knownSamples) {
        const knownSet = new Set(knownIndices);
        const futurePlayers = Math.max(0, playerCount - selector);
        const unresolvedIndices = otherIndices.filter(
          (index) => !knownSet.has(index)
        );
        const futureOccupancy = unresolvedIndices.length
          ? Math.min(1, futurePlayers / unresolvedIndices.length)
          : 0;
        const occupancyByIndex = new Map(
          activeIndices.map((index) => [index, 0])
        );
        occupancyByIndex.set(item.index, 1);
        knownIndices.forEach((index) => (
          occupancyByIndex.set(index, 1)
        ));
        unresolvedIndices.forEach((index) => (
          occupancyByIndex.set(index, futureOccupancy)
        ));

        const scenario = evaluateFullCourseFocusUnderOccupancy(
          tileMap,
          firstLeg,
          firstLeg.flags,
          item.index,
          occupancyByIndex,
          {
            ...options,
            playerCount,
            payToWin: true,
            fullCourseTrafficPasses: 1
          }
        );

        if (!scenario) {
          continue;
        }

        const firstLegDelta =
          scenario.firstLegTotal - baselineFirstTotal;
        const fullCourseDelta =
          scenario.fullTotal - baselineFullTotal;
        const lateAdjustedScore = (
          item.adjustedScore +
          firstLegDelta +
          clamp(fullCourseDelta * 0.32, -10, 10)
        );

        if (Number.isFinite(lateAdjustedScore)) {
          scenarioScores.push(lateAdjustedScore);
          scenarioSamples += 1;
        }
      }
    }

    scoreByIndex.set(
      item.index,
      scenarioScores.length
        ? averageValues(scenarioScores)
        : item.adjustedScore
    );
  }

  const scoredStarts = activeStarts.map((item) => ({
    startAnalysis: item,
    index: item.index,
    adjustedScore: item.adjustedScore,
    lateAdjustedScore: Number(
      (scoreByIndex.get(item.index) ?? item.adjustedScore).toFixed(2)
    )
  }));
  const lateScores = scoredStarts.map((item) => item.lateAdjustedScore);
  const minScore = Math.min(...lateScores);
  const maxScore = Math.max(...lateScores);
  const costUnit = Math.max(1, minScore / 10);
  const entries = scoredStarts.map((item) => {
    const calculatedLateEnergyCost = Math.max(
      0,
      Math.floor(
        (maxScore - item.lateAdjustedScore) / costUnit
      )
    );

    return {
      ...item,
      calculatedLateEnergyCost,
      lateEnergyCost: calculatedLateEnergyCost,
      lateUnavailable: calculatedLateEnergyCost >= getPayToWinDenialCost(options)
    };
  });

  return {
    entries,
    costUnit: Number(costUnit.toFixed(2)),
    minScore,
    maxScore,
    scenarioSamples,
    ...config
  };
}

function formatPayToWinEnergyCost(startAnalysis) {
  if (startAnalysis?.energyCost === null || startAnalysis?.energyCost === undefined) {
    return null;
  }

  const normalCost = Number(startAnalysis.energyCost);
  const lateCost = Number(startAnalysis.lateEnergyCost);
  const earlyUnavailable = Boolean(startAnalysis.earlyUnavailable);
  const lateUnavailable = Boolean(startAnalysis.lateUnavailable);

  if (earlyUnavailable && lateUnavailable) {
    return "—/—";
  }

  if (earlyUnavailable) {
    return Number.isFinite(lateCost) ? `—/${lateCost}` : "—";
  }

  if (lateUnavailable) {
    return `${normalCost}/—`;
  }

  if (Number.isFinite(lateCost) && lateCost !== normalCost) {
    return `${normalCost}/${lateCost}`;
  }

  return String(normalCost);
}

function choosePayToWinPruneEntry(entries, options = {}) {
  if (!entries.length) {
    return null;
  }

  const bias = getPayToWinRemovalBias(options);
  if (bias > 0) {
    return [...entries].sort((left, right) => right.adjustedScore - left.adjustedScore || left.index - right.index)[0];
  }
  if (bias < 0) {
    return [...entries].sort((left, right) => left.adjustedScore - right.adjustedScore || left.index - right.index)[0];
  }

  const meanScore = averageValues(entries.map((entry) => entry.adjustedScore));
  return [...entries].sort((left, right) => (
    Math.abs(right.adjustedScore - meanScore) - Math.abs(left.adjustedScore - meanScore) ||
    left.adjustedScore - right.adjustedScore ||
    left.index - right.index
  ))[0];
}

function getActivePruningStarts(firstLeg, excludedIndices = new Set()) {
  return (firstLeg.starts || []).filter((item) => (
    item.reachable &&
    item.selectedRoute &&
    Number.isFinite(item.adjustedScore) &&
    !excludedIndices.has(item.index)
  ));
}

function runIterativeStartBalancing(firstLeg, tileMap, playerCount, analysisOptions = {}, chooser, options = {}) {
  const baseFirstLeg = {
    ...firstLeg,
    summary: {
      ...firstLeg.summary,
      outliers: [...(firstLeg.summary.outliers || [])]
    }
  };
  const excludedIndices = new Set(options.initialExcludedIndices ?? []);
  const removals = [];
  // The incoming first-leg analysis already contains route-pressure scoring.
  // Recompute immediately only when an earlier lightweight stage has already
  // excluded starts; Pay to Win and untrimmed normal setups can reuse it.
  let currentFirstLeg = excludedIndices.size
    ? recomputeFirstLegPressure(tileMap, baseFirstLeg, {
      playerCount,
      ...analysisOptions,
      excludedIndices: [...excludedIndices]
    })
    : baseFirstLeg;

  for (let pass = 0; pass < (options.maxPasses ?? 12); pass += 1) {
    const activeStarts = getActivePruningStarts(currentFirstLeg, excludedIndices);
    const removal = chooser({
      baseFirstLeg,
      currentFirstLeg,
      activeStarts,
      excludedIndices,
      removals,
      pass: pass + 1
    });

    if (!removal || excludedIndices.has(removal.index)) {
      break;
    }

    excludedIndices.add(removal.index);
    removals.push({
      ...removal,
      pass: pass + 1
    });

    currentFirstLeg = recomputeFirstLegPressure(tileMap, baseFirstLeg, {
      playerCount,
      ...analysisOptions,
      excludedIndices: [...excludedIndices]
    });
  }

  return {
    baseFirstLeg,
    currentFirstLeg,
    excludedIndices,
    removals
  };
}

function applyPayToWinStartPricing(firstLeg, tileMap, playerCount, options = {}) {
  const analysisOptions = getPayToWinAnalysisOptions({
    ...options,
    ...getRouteAnalysisVariantOptions(options),
    payToWin: true
  }, playerCount);
  const bias = getPayToWinRemovalBias(options);
  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ currentFirstLeg, excludedIndices }) => {
      const costState = getPayToWinCostEntries(currentFirstLeg, excludedIndices);
      // Never price-prune below the number of robots that must be able to start.
      if (costState.entries.length <= playerCount) {
        return null;
      }

      const denialCost = getPayToWinDenialCost(options);
      const expensiveEntries = costState.entries.filter((entry) => entry.energyCost >= denialCost);
      if (!expensiveEntries.length) {
        return null;
      }

      // A price above available starting energy means the active start spread is too wide; it is not
      // necessarily the start that should be removed. Pay to Win deliberately
      // trims from either end according to the requested setup:
      //   short/easy -> remove the weakest (longer/harder) start
      //   long/hard  -> remove the strongest (shorter/easier) start
      //   neutral    -> remove the end farthest from the mean
      // Pricing is then recomputed after that removal.
      const removed = choosePayToWinPruneEntry(costState.entries, options);
      if (!removed) {
        return null;
      }

      return {
        index: removed.index,
        score: removed.adjustedScore,
        energyCost: removed.energyCost,
        reason: bias > 0
          ? "removed weakest start for a short/easier setup"
          : bias < 0
            ? "removed strongest start for a long/harder setup"
            : "removed start farthest from the remaining mean"
      };
    },
    { maxPasses: 12 }
  );

  const { currentFirstLeg, excludedIndices, removals: pruned } = result;
  const startingEnergy = getCourseStartingEnergy(options);
  const denialCost = getPayToWinDenialCost(options);
  const finalCostState = getPayToWinCostEntries(currentFirstLeg, excludedIndices);
  const costByIndex = new Map(finalCostState.entries.map((entry) => [entry.index, entry.energyCost]));
  const earlyUnavailableByIndex = new Map(finalCostState.entries.map((entry) => [
    entry.index,
    entry.energyCost >= denialCost
  ]));
  const lateCostState = getPayToWinLateCostEntries(
    currentFirstLeg,
    tileMap,
    excludedIndices,
    playerCount,
    options
  );
  const lateCostByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateEnergyCost]));
  const lateUnavailableByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateUnavailable]));
  const lateAdjustedScoreByIndex = new Map(lateCostState.entries.map((entry) => [entry.index, entry.lateAdjustedScore]));
  const earlyUnavailableCount = finalCostState.entries.filter((entry) => earlyUnavailableByIndex.get(entry.index)).length;
  const lateUnavailableCount = lateCostState.entries.filter((entry) => entry.lateUnavailable).length;
  const fullyUnavailableEntries = finalCostState.entries.filter((entry) => (
    earlyUnavailableByIndex.get(entry.index) &&
    lateUnavailableByIndex.get(entry.index)
  ));
  const fullyUnavailableIndices = new Set(fullyUnavailableEntries.map((entry) => entry.index));
  const fullyUnavailableCount = fullyUnavailableEntries.length;
  const maxUnavailable = Math.max(0, finalCostState.entries.length - playerCount);
  const maxEarlyUnavailable = maxUnavailable;
  const maxLateUnavailable = maxUnavailable;
  const earlyAvailabilityValid = earlyUnavailableCount <= maxEarlyUnavailable;
  const lateAvailabilityValid = lateUnavailableCount <= maxLateUnavailable;
  const pricedStartCount = Math.max(0, finalCostState.entries.length - fullyUnavailableCount);
  const availabilityValid = (
    pricedStartCount >= playerCount &&
    earlyAvailabilityValid &&
    lateAvailabilityValid
  );
  const hasLatePriceDifference = lateCostState.entries.some((entry) => (
    costByIndex.has(entry.index) &&
    (
      earlyUnavailableByIndex.get(entry.index) ||
      entry.lateUnavailable ||
      entry.lateEnergyCost !== costByIndex.get(entry.index)
    )
  ));
  const latePriceHigherCount = lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost > costByIndex.get(entry.index)
  )).length;
  const latePriceLowerCount = lateCostState.entries.filter((entry) => (
    costByIndex.has(entry.index) &&
    !earlyUnavailableByIndex.get(entry.index) &&
    !entry.lateUnavailable &&
    entry.lateEnergyCost < costByIndex.get(entry.index)
  )).length;
  const activeScores = finalCostState.entries.map((entry) => entry.adjustedScore);
  const meanScore = activeScores.length ? averageValues(activeScores) : 0;
  const prunedOutliers = pruned.map((item) => ({
    index: item.index,
    score: item.score,
    delta: Number((item.score - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinPruned: true,
      energyCost: item.energyCost,
      outlierPass: item.pass,
      removalReason: item.reason,
      costThreshold: denialCost
    }
  }));
  const unavailableOutliers = fullyUnavailableEntries.map((item) => ({
    index: item.index,
    score: item.adjustedScore,
    delta: Number((item.adjustedScore - meanScore).toFixed(2)),
    actionDelta: 0,
    reasons: {
      payToWinUnavailable: true,
      energyCost: item.energyCost,
      lateEnergyCost: lateCostByIndex.get(item.index),
      startingEnergy,
      costThreshold: denialCost
    }
  }));
  const outliers = [...prunedOutliers, ...unavailableOutliers];

  return {
    ...currentFirstLeg,
    starts: currentFirstLeg.starts.map((startAnalysis) => ({
      ...startAnalysis,
      energyCost: costByIndex.has(startAnalysis.index) ? costByIndex.get(startAnalysis.index) : null,
      earlyUnavailable: earlyUnavailableByIndex.get(startAnalysis.index) ?? false,
      lateEnergyCost: lateCostByIndex.has(startAnalysis.index) ? lateCostByIndex.get(startAnalysis.index) : null,
      lateUnavailable: lateUnavailableByIndex.get(startAnalysis.index) ?? false,
      payToWinUnavailable: fullyUnavailableIndices.has(startAnalysis.index),
      lateAdjustedScore: lateAdjustedScoreByIndex.has(startAnalysis.index)
        ? lateAdjustedScoreByIndex.get(startAnalysis.index)
        : null
    })),
    summary: {
      ...currentFirstLeg.summary,
      outliers,
      payToWin: {
        active: true,
        startingEnergy,
        denialCost,
        costUnit: finalCostState.costUnit,
        lateCostUnit: lateCostState.costUnit,
        pruned,
        pricedStartCount,
        trafficScaleMultiplier: getPayToWinTrafficScaleMultiplier(playerCount),
        lateSelectorStart: lateCostState.lateSelectorStart,
        lateSelectorEnd: lateCostState.lateSelectorEnd,
        surplusStarts: Math.max(0, pricedStartCount - playerCount),
        lateTrafficModel: "conditional-draft",
        lateScenarioSamples: lateCostState.scenarioSamples,
        earlyUnavailableCount,
        maxEarlyUnavailable,
        earlyAvailabilityValid,
        lateUnavailableCount,
        maxLateUnavailable,
        lateAvailabilityValid,
        fullyUnavailableCount,
        availabilityValid,
        latePriceHigherCount,
        latePriceLowerCount,
        hasLatePriceDifference
      }
    }
  };
}

function getExpectedRouteTileSet(route, goal = null) {
  const goalKey = goal ? `${goal.x},${goal.y}` : null;
  const set = new Set();
  (route?.path || []).forEach((point, index, path) => {
    const key = `${point.x},${point.y}`;
    if (goalKey && index === path.length - 1 && key === goalKey) {
      return;
    }
    set.add(key);
  });
  return set;
}


function medianValue(values) {
  const finite = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!finite.length) {
    return 0;
  }
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

function getRobustOutlierStats(entries, scoreKey = "adjustedScore") {
  const values = entries.map((entry) => entry[scoreKey]).filter(Number.isFinite);
  const center = medianValue(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = medianValue(deviations);
  const robustScale = Math.max(1.5, mad * 1.4826);

  return {
    center,
    mad,
    robustScale
  };
}

function rankNormalStartOutliers(entries, scoreKey = "adjustedScore", zThreshold = FULL_START_OUTLIER_Z) {
  if (entries.length < 3) {
    return [];
  }

  const scoreStats = getRobustOutlierStats(entries, scoreKey);
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const minimumScoreDelta = Math.max(5, Math.abs(scoreStats.center) * 0.08);

  return entries
    .map((entry) => {
      const score = entry[scoreKey];
      const scoreDelta = score - scoreStats.center;
      const scoreZ = Math.abs(scoreDelta) / scoreStats.robustScale;
      const actionDelta = Number.isFinite(entry.bestActions)
        ? entry.bestActions - actionStats.center
        : 0;
      const actionZ = Number.isFinite(entry.bestActions)
        ? Math.abs(actionDelta) / actionStats.robustScale
        : 0;
      const qualifies = (
        scoreZ >= zThreshold && Math.abs(scoreDelta) >= minimumScoreDelta
      ) || (
        actionZ >= zThreshold + 0.35 && Math.abs(actionDelta) >= 2
      );

      return {
        entry,
        score,
        scoreDelta,
        scoreZ,
        actionDelta,
        actionZ,
        qualifies,
        strength: Math.max(scoreZ, actionZ * 0.9)
      };
    })
    .filter((item) => item.qualifies)
    .sort((left, right) => (
      right.strength - left.strength ||
      Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta) ||
      left.entry.index - right.entry.index
    ));
}

function getNormalStartDispersion(entries, scoreKey = "adjustedScore") {
  const values = entries
    .map((entry) => entry[scoreKey])
    .filter(Number.isFinite);
  if (values.length < 2) {
    return 0;
  }

  const mean = averageValues(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  );
}

function getNormalStartBalanceDiagnostics(entry, entries) {
  const scoreStats = getRobustOutlierStats(entries, "adjustedScore");
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const scoreDelta = entry.adjustedScore - scoreStats.center;
  const actionDelta = Number.isFinite(entry.bestActions)
    ? entry.bestActions - actionStats.center
    : 0;

  return {
    scoreZ: Math.abs(scoreDelta) / scoreStats.robustScale,
    actionZ: Number.isFinite(entry.bestActions)
      ? Math.abs(actionDelta) / actionStats.robustScale
      : 0,
    scoreDelta,
    actionDelta
  };
}

function chooseNormalStartBalanceRemoval(entries, playerCount, stdDevLimit = NORMAL_START_FAIRNESS_STDDEV_LIMIT) {
  const minimumStarts = Math.max(1, playerCount || 1);
  if (entries.length <= minimumStarts) {
    return null;
  }

  const currentStdDev = getNormalStartDispersion(entries);
  const rankedOutliers = rankNormalStartOutliers(
    entries,
    "adjustedScore",
    FULL_START_OUTLIER_Z
  );

  if (rankedOutliers.length) {
    const ranked = rankedOutliers[0];
    const retained = entries.filter((entry) => entry.index !== ranked.entry.index);
    return {
      index: ranked.entry.index,
      score: ranked.entry.adjustedScore,
      actions: ranked.entry.bestActions,
      balanceDispersionPruned: false,
      scoreZ: ranked.scoreZ,
      actionZ: ranked.actionZ,
      scoreDelta: ranked.scoreDelta,
      actionDelta: ranked.actionDelta,
      balanceStdDevBefore: currentStdDev,
      balanceStdDevAfterEstimate: getNormalStartDispersion(retained)
    };
  }

  if (currentStdDev <= stdDevLimit) {
    return null;
  }

  const candidates = entries.map((entry) => {
    const retained = entries.filter((item) => item.index !== entry.index);
    return {
      entry,
      scoreStdDev: getNormalStartDispersion(retained),
      actionStdDev: getNormalStartDispersion(retained, "bestActions")
    };
  }).sort((left, right) => (
    left.scoreStdDev - right.scoreStdDev ||
    left.actionStdDev - right.actionStdDev ||
    left.entry.index - right.entry.index
  ));

  const best = candidates[0];
  if (!best || best.scoreStdDev >= currentStdDev - 0.01) {
    return null;
  }

  const diagnostics = getNormalStartBalanceDiagnostics(best.entry, entries);
  return {
    index: best.entry.index,
    score: best.entry.adjustedScore,
    actions: best.entry.bestActions,
    balanceDispersionPruned: true,
    scoreZ: diagnostics.scoreZ,
    actionZ: diagnostics.actionZ,
    scoreDelta: diagnostics.scoreDelta,
    actionDelta: diagnostics.actionDelta,
    balanceStdDevBefore: currentStdDev,
    balanceStdDevAfterEstimate: best.scoreStdDev
  };
}

function getLightweightPressurePoolTarget(startCount, playerCount) {
  if (startCount <= 6) {
    return startCount;
  }

  // RoboRally tops out at eight players. Keep two reserve starts at the
  // eight-player ceiling, but do not send more than ten starts into the
  // much more expensive full-course route-pressure phase. Smaller games
  // retain an eight-start pressure pool so route choice is still meaningful.
  return Math.min(
    startCount,
    LIGHT_START_MAX_PRESSURE_POOL,
    Math.max(LIGHT_START_MIN_POOL, playerCount + LIGHT_START_SURPLUS)
  );
}

function getLightweightPoolTrimRanking(entries) {
  if (!entries.length) {
    return [];
  }

  const scoreStats = getRobustOutlierStats(entries, "bestScore");
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  return entries.map((entry) => {
    const scoreDeviation = Math.abs(entry.bestScore - scoreStats.center) / scoreStats.robustScale;
    const actionDeviation = Number.isFinite(entry.bestActions)
      ? Math.abs(entry.bestActions - actionStats.center) / actionStats.robustScale
      : 0;
    return {
      entry,
      scoreDeviation,
      actionDeviation,
      centralityCost: scoreDeviation + actionDeviation * 0.55
    };
  });
}

function selectLightweightPressurePool(entries, targetCount) {
  if (entries.length <= targetCount) {
    return new Set(entries.map((entry) => entry.index));
  }

  const ranked = getLightweightPoolTrimRanking(entries);
  const remaining = ranked.slice();
  const selected = [];

  while (selected.length < targetCount && remaining.length) {
    let bestIndex = 0;
    let bestValue = Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const start = candidate.entry.start ?? {};
      let spreadBonus = 0;

      if (selected.length && Number.isFinite(start.x) && Number.isFinite(start.y)) {
        const nearestDistance = Math.min(...selected.map((selectedEntry) => {
          const selectedStart = selectedEntry.entry.start ?? {};
          if (!Number.isFinite(selectedStart.x) || !Number.isFinite(selectedStart.y)) {
            return 0;
          }
          return Math.abs(start.x - selectedStart.x) + Math.abs(start.y - selectedStart.y);
        }));
        spreadBonus = Math.min(4, nearestDistance) * LIGHT_START_SPREAD_WEIGHT;
      }

      // Prefer the statistically central first-leg cluster, with a modest
      // spatial-spread bonus so a large dock is not reduced to one tiny
      // contiguous patch merely because its intrinsic scores are similar.
      const value = candidate.centralityCost - spreadBonus;
      if (value < bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return new Set(selected.map((item) => item.entry.index));
}

function getLightweightStartPruning(tileMap, starts, flags, playerCount, options = {}) {
  const minimumPool = getLightweightPressurePoolTarget(starts.length, playerCount);
  if (
    options.competitiveMode ||
    options.payToWin ||
    starts.length <= minimumPool ||
    !flags.length
  ) {
    return {
      starts: starts.map((start, index) => ({ ...start, analysisIndex: index })),
      analyses: [],
      excludedIndices: new Set(),
      outliers: [],
      minimumPool,
      active: false
    };
  }

  const firstGoal = flags[0];
  const lightweight = analyzeCourse(tileMap, starts, firstGoal, {
    flags: [firstGoal],
    maxRoutes: 1,
    skipTraffic: true,
    playerCount,
    maxActions: LIGHT_START_MAX_ACTIONS,
    maxExpansions: LIGHT_START_MAX_EXPANSIONS,
    recoveryRule: options.recoveryRule,
    ...getRouteAnalysisVariantOptions(options),
    startupSpinUp: options.startupSpinUp,
    rebootTokens: options.rebootTokens,
    boardRects: options.boardRects,
    dynamicGoal: options.movingTargetTimelines?.[0] ?? null
  });
  const analyses = lightweight.starts;
  const active = analyses.filter((analysis) => (
    analysis.reachable &&
    analysis.selectedRoute &&
    Number.isFinite(analysis.bestScore)
  ));
  const excludedIndices = new Set();
  const outliers = [];

  // Stage 1: remove only strong intrinsic first-leg outliers. This is the
  // fairness-preserving part of the cheap pass.
  while (active.length - excludedIndices.size > minimumPool) {
    const remaining = active.filter((analysis) => !excludedIndices.has(analysis.index));
    const ranked = rankNormalStartOutliers(
      remaining.map((analysis) => ({
        ...analysis,
        adjustedScore: analysis.bestScore
      })),
      "adjustedScore",
      LIGHT_START_OUTLIER_Z
    );
    const candidate = ranked[0];
    if (!candidate) {
      break;
    }

    excludedIndices.add(candidate.entry.index);
    outliers.push({
      index: candidate.entry.index,
      score: candidate.score,
      delta: Number(candidate.scoreDelta.toFixed(2)),
      actionDelta: Number(candidate.actionDelta.toFixed(2)),
      reasons: {
        lightweightPruned: true,
        stage: "intrinsic-first-leg-outlier",
        scoreZ: Number(candidate.scoreZ.toFixed(2)),
        actionZ: Number(candidate.actionZ.toFixed(2)),
        minimumPool,
        maxExpansions: LIGHT_START_MAX_EXPANSIONS
      }
    });
  }

  // Stage 2: a 12- or 24-space setup can still contain no formal outlier.
  // In that case deliberately trim the cheap-analysis pool before invoking
  // full-course multi-route pressure. At most 8-10 starts survive this stage.
  const remainingAfterOutliers = active.filter((analysis) => !excludedIndices.has(analysis.index));
  if (remainingAfterOutliers.length > minimumPool) {
    const retainedIndices = selectLightweightPressurePool(remainingAfterOutliers, minimumPool);
    const trimRanking = getLightweightPoolTrimRanking(remainingAfterOutliers);
    const rankByIndex = new Map(trimRanking.map((item) => [item.entry.index, item]));

    remainingAfterOutliers.forEach((analysis) => {
      if (retainedIndices.has(analysis.index)) {
        return;
      }

      excludedIndices.add(analysis.index);
      const ranking = rankByIndex.get(analysis.index);
      outliers.push({
        index: analysis.index,
        score: analysis.bestScore,
        delta: Number(((analysis.bestScore ?? 0) - medianValue(remainingAfterOutliers.map((item) => item.bestScore))).toFixed(2)),
        actionDelta: 0,
        reasons: {
          lightweightPruned: true,
          lightweightPoolTrim: true,
          stage: "intrinsic-first-leg-pool-trim",
          centralityCost: Number((ranking?.centralityCost ?? 0).toFixed(2)),
          minimumPool,
          sourcePool: starts.length,
          maxExpansions: LIGHT_START_MAX_EXPANSIONS
        }
      });
    });
  }

  return {
    starts: starts
      .map((start, index) => ({ ...start, analysisIndex: index }))
      .filter((start) => !excludedIndices.has(start.analysisIndex)),
    analyses,
    excludedIndices,
    outliers,
    minimumPool,
    active: excludedIndices.size > 0
  };
}

function mergeLightweightPrunedStarts(firstLeg, prePruning, originalStartCount) {
  if (!prePruning.excludedIndices.size) {
    return firstLeg;
  }

  const fullByIndex = new Map(firstLeg.starts.map((analysis) => [analysis.index, analysis]));
  const lightweightByIndex = new Map(prePruning.analyses.map((analysis) => [analysis.index, analysis]));
  const mergedStarts = [];

  for (let index = 0; index < originalStartCount; index += 1) {
    if (fullByIndex.has(index)) {
      mergedStarts.push(fullByIndex.get(index));
      continue;
    }

    const lightweight = lightweightByIndex.get(index);
    if (!lightweight) {
      continue;
    }

    mergedStarts.push({
      ...lightweight,
      prePruned: true,
      fullCourseRoutes: [],
      fullCourseRoute: null,
      fullCourseRouteIndex: null,
      fullCourseTrafficPenalty: 0,
      courseEstimate: null,
      courseScoreAdjustment: 0
    });
  }

  return {
    ...firstLeg,
    starts: mergedStarts,
    summary: {
      ...firstLeg.summary,
      totalStarts: originalStartCount,
      // Pre-pruned starts only had the cheap first-leg check, so do not count
      // them as full-course reachable without running the expensive search.
      reachableStarts: firstLeg.summary.reachableStarts,
      outliers: [...prePruning.outliers],
      lightweightStartPruning: {
        active: true,
        minimumPool: prePruning.minimumPool,
        pruned: prePruning.outliers.map((outlier) => outlier.index),
        maxExpansions: LIGHT_START_MAX_EXPANSIONS
      }
    }
  };
}

function interleaveStartsByDock(starts = [], dockPlacements = [], pieceMap = {}) {
  const queues = dockPlacements.map((dockPlacement, dockIndex) => ({
    dockIndex,
    starts: starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap))
  }));
  const unassigned = starts.filter((start) => !dockPlacements.some((dockPlacement) => (
    pointOnPlacement(start, dockPlacement, pieceMap)
  )));
  const ordered = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const queue of queues) {
      if (!queue.starts.length) continue;
      ordered.push({ start: queue.starts.shift(), dockIndex: queue.dockIndex });
      progressed = true;
    }
  }

  unassigned.forEach((start) => ordered.push({ start, dockIndex: null }));
  return ordered;
}

function screenSandwichedExtraDockOpening(
  tileMap,
  starts,
  goal,
  dockPlacements,
  pieceMap,
  playerCount,
  options = {}
) {
  if (!goal || (dockPlacements?.length ?? 0) < 2 || options.movingTargets) {
    return { valid: true, tested: 0, reachable: 0, dockCoverage: 0, skipped: true };
  }

  const requiredReachable = Math.max(1, Number(playerCount ?? 1));
  const ordered = interleaveStartsByDock(starts, dockPlacements, pieceMap);
  const reachableDockIndices = new Set();
  let reachable = 0;
  let tested = 0;

  for (let offset = 0; offset < ordered.length; offset += 1) {
    const { start, dockIndex } = ordered[offset];
    tested += 1;
    const lightweight = analyzeCourse(tileMap, [start], goal, {
      flags: [goal],
      maxRoutes: 1,
      skipTraffic: true,
      playerCount: Math.max(1, Number(playerCount ?? 1)),
      maxActions: Math.max(24, LIGHT_START_MAX_ACTIONS),
      maxExpansions: LIGHT_START_MAX_EXPANSIONS,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects
    });
    const analysis = lightweight.starts?.[0];
    if (analysis?.reachable && analysis.selectedRoute) {
      reachable += 1;
      if (dockIndex !== null) reachableDockIndices.add(dockIndex);
    }

    const everyDockRepresented = dockPlacements.every((_, index) => reachableDockIndices.has(index));
    if (reachable >= requiredReachable && everyDockRepresented) {
      return {
        valid: true,
        tested,
        reachable,
        dockCoverage: reachableDockIndices.size,
        skipped: false
      };
    }

    const remaining = ordered.length - offset - 1;
    if (reachable + remaining < requiredReachable) break;

    const uncoveredDockWithoutRemainingStart = dockPlacements.some((_, dockIndexCandidate) => (
      !reachableDockIndices.has(dockIndexCandidate) &&
      !ordered.slice(offset + 1).some((item) => item.dockIndex === dockIndexCandidate)
    ));
    if (uncoveredDockWithoutRemainingStart) break;
  }

  return {
    valid: false,
    tested,
    reachable,
    dockCoverage: reachableDockIndices.size,
    skipped: false
  };
}

function analyzeFlagSequence(tileMap, starts, flags, playerCount, options = {}) {
  const movingTargetTimelines = options.movingTargetTimelines ?? buildMovingTargetTimelines(
    tileMap,
    flags,
    options.movingTargets,
    { maxActions: options.movingTargetMaxActions ?? 16 }
  );
  const contextualLegSearch = true;
  const prePruning = contextualLegSearch
    ? {
      starts: starts.map((start, index) => ({
        ...start,
        analysisIndex: index
      })),
      analyses: [],
      excludedIndices: new Set(),
      outliers: [],
      minimumPool: starts.length,
      active: false
    }
    : getLightweightStartPruning(
      tileMap,
      starts,
      flags,
      playerCount,
      {
        ...options,
        movingTargetTimelines
      }
    );
  const lateRouteCount = contextualLegSearch
    ? 2
    : (
      !options.competitiveMode &&
      !options.payToWin &&
      prePruning.starts.length <= prePruning.minimumPool
    )
      ? 3
      : 2;
  const analyzedFirstLeg = analyzeFullCourse(
    tileMap,
    prePruning.starts,
    flags,
    getPayToWinAnalysisOptions({
      maxRoutes: lateRouteCount,
      maxActions: Math.max(24, flags.length * 18 + 8),
      maxExpansions: 52000,
      flags,
      playerCount,
      recoveryRule: options.recoveryRule,
      ...getRouteAnalysisVariantOptions(options),
      startupSpinUp: options.startupSpinUp,
      rebootTokens: options.rebootTokens,
      boardRects: options.boardRects,
      dynamicGoals: movingTargetTimelines,
      payToWin: options.payToWin,
      contextualLegSearch,
      contextualEarlyExit: Boolean(options.contextualEarlyExit),
      diverseFullCourseSearch: false
    }, playerCount)
  );
  const firstLeg = contextualLegSearch
    ? analyzedFirstLeg
    : mergeLightweightPrunedStarts(
      analyzedFirstLeg,
      prePruning,
      starts.length
    );

  const legs = [
    {
      from: "dock",
      to: 1,
      analysis: firstLeg
    }
  ];

  (firstLeg.expectedLegAnalyses || []).forEach((analysis, index) => {
    legs.push({
      from: index + 1,
      to: index + 2,
      analysis
    });
  });

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
  const totalActions = legs.reduce((sum, leg) => {
    if (leg.analysis.summary.actionScore !== undefined) {
      return sum + leg.analysis.summary.actionScore;
    }

    return sum + (leg.analysis.summary.averageRouteActions || 0);
  }, 0);
  const courseAdjustedFirstLeg = (options.competitiveMode || options.virtualBots)
    ? {
      ...firstLeg,
      summary: {
        ...firstLeg.summary,
        outliers: []
      }
    }
    : options.payToWin
      ? applyPayToWinStartPricing(firstLeg, tileMap, playerCount, {
        ...options,
        totalActions,
        totalLength
      })
      : adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, {
        ...getRouteAnalysisVariantOptions(options),
        totalActions
      });

  const adjustedLegs = [
    {
      ...legs[0],
      analysis: courseAdjustedFirstLeg
    },
    ...(courseAdjustedFirstLeg.expectedLegAnalyses || []).map((analysis, index) => ({
      from: index + 1,
      to: index + 2,
      analysis
    }))
  ];

  return {
    starts,
    firstLeg: courseAdjustedFirstLeg,
    legs: adjustedLegs,
    movingTargetTimelines,
    summary: {
      totalDifficulty: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.difficultyScore !== undefined) {
            return sum + leg.analysis.summary.difficultyScore;
          }

          return sum + leg.analysis.summary.averageRouteScore + leg.analysis.summary.congestionScore - leg.analysis.summary.diversityScore * 0.2;
        }, 0)
      ).toFixed(2)),
      totalLength: Number((
        adjustedLegs.reduce((sum, leg) => {
          if (leg.analysis.summary.lengthScore !== undefined) {
            return sum + leg.analysis.summary.lengthScore;
          }

          return sum + leg.analysis.summary.averageRouteDistance;
        }, 0)
      ).toFixed(2))
    }
  };
}

function adjustStartOutliersForCourseLength(firstLeg, totalLength, tileMap, playerCount, options = {}) {
  const analysisOptions = getRouteAnalysisVariantOptions(options);
  const prePrunedOutliers = (firstLeg.summary.outliers || []).filter(
    (item) => item.reasons?.lightweightPruned
  );
  const initialExcludedIndices = new Set(
    prePrunedOutliers.map((item) => item.index)
  );
  const initialActive = getActivePruningStarts(
    firstLeg,
    initialExcludedIndices
  );
  const initialStdDev = getNormalStartDispersion(initialActive);
  const maximumNormalPasses = Math.max(
    0,
    initialActive.length - Math.max(1, playerCount || 1)
  );

  // Normal mode borrows Pay to Win's iterative balancing framework, but not its
  // pricing-specific chooser. Remove one start, recompute occupancy / route
  // pressure, and only then decide whether another start still needs pruning.
  // Player count is a floor, never a target: a balanced 12-start field stays 12.
  const result = runIterativeStartBalancing(
    firstLeg,
    tileMap,
    playerCount,
    analysisOptions,
    ({ activeStarts }) => chooseNormalStartBalanceRemoval(
      activeStarts,
      playerCount,
      NORMAL_START_FAIRNESS_STDDEV_LIMIT
    ),
    {
      initialExcludedIndices: [...initialExcludedIndices],
      maxPasses: maximumNormalPasses
    }
  );

  const {
    currentFirstLeg,
    excludedIndices,
    removals
  } = result;
  const remainingActive = getActivePruningStarts(
    currentFirstLeg,
    excludedIndices
  );
  const remainingOutliers = rankNormalStartOutliers(
    remainingActive,
    "adjustedScore",
    FULL_START_OUTLIER_Z
  );
  const remainingStdDev = getNormalStartDispersion(remainingActive);
  const badLimit = Math.ceil((playerCount || 1) * 0.25);

  const pressureRemovals = removals.map((removed, removalIndex) => {
    const actualStdDevAfter = removalIndex + 1 < removals.length
      ? removals[removalIndex + 1].balanceStdDevBefore
      : remainingStdDev;
    return {
      index: removed.index,
      score: removed.score,
      actions: removed.actions,
      pass: removed.pass,
      diagnostics: {
        normalBalancePruned: true,
        balanceDispersionPruned: Boolean(removed.balanceDispersionPruned),
        stage: removed.balanceDispersionPruned
          ? "iterative-traffic-fairness-dispersion"
          : "iterative-traffic-fairness-outlier",
        scoreZ: Number((removed.scoreZ ?? 0).toFixed(2)),
        actionZ: Number((removed.actionZ ?? 0).toFixed(2)),
        scoreDelta: Number((removed.scoreDelta ?? 0).toFixed(2)),
        actionDelta: Number((removed.actionDelta ?? 0).toFixed(2)),
        balanceStdDevBefore: Number((removed.balanceStdDevBefore ?? 0).toFixed(2)),
        balanceStdDevAfter: Number((actualStdDevAfter ?? 0).toFixed(2)),
        balanceStdDevAfterEstimate: Number((removed.balanceStdDevAfterEstimate ?? 0).toFixed(2)),
        balanceStdDevLimit: NORMAL_START_FAIRNESS_STDDEV_LIMIT,
        removalReason: removed.balanceDispersionPruned
          ? "removed to reduce start-score dispersion, then recomputed occupancy before the next pruning decision"
          : "removed traffic-aware outlier, then recomputed occupancy before the next pruning decision",
        totalCourseLength: Number((totalLength || 0).toFixed(2)),
        totalCourseActions: Number(
          (options.totalActions || 0).toFixed(2)
        )
      }
    };
  });

  // If the iterative process reaches the player-count floor or cannot improve
  // the field and it is still outside the Normal balance criteria, reject the
  // course rather than silently accepting an unbalanced start set.
  const shouldReject = (
    remainingOutliers.length > 0 ||
    remainingStdDev > NORMAL_START_FAIRNESS_STDDEV_LIMIT
  );

  const activeScores = remainingActive
    .map((entry) => entry.adjustedScore)
    .filter(Number.isFinite);
  const meanScore = activeScores.length
    ? averageValues(activeScores)
    : 0;

  const lateOutliers = pressureRemovals.map((removal) => ({
    index: removal.index,
    score: removal.score,
    delta: Number((removal.score - meanScore).toFixed(2)),
    actionDelta: Number((removal.actions ?? 0).toFixed(2)),
    reasons: removal.diagnostics
  }));
  const allOutliers = [
    ...prePrunedOutliers,
    ...lateOutliers
  ];

  return {
    ...currentFirstLeg,
    summary: {
      ...currentFirstLeg.summary,
      outliers: allOutliers,
      normalStartBalance: {
        active: true,
        staged: true,
        iterative: true,
        intrinsicPrePruning: Boolean(
          firstLeg.summary.lightweightStartPruning?.active
        ),
        contextualLegRoutes: Boolean(
          firstLeg.summary.contextualLegRoutes
        ),
        lightweightPruned: prePrunedOutliers.map(
          (item) => item.index
        ),
        pressurePruned: pressureRemovals,
        dispersionPruned: pressureRemovals
          .filter((item) => item.diagnostics?.balanceDispersionPruned)
          .map((item) => item.index),
        trafficRecomputations: pressureRemovals.length + (initialExcludedIndices.size ? 1 : 0),
        balanceStdDevBefore: Number(initialStdDev.toFixed(2)),
        balanceStdDevAfter: Number(remainingStdDev.toFixed(2)),
        balanceStdDevLimit: NORMAL_START_FAIRNESS_STDDEV_LIMIT,
        remainingBadStarts: remainingOutliers.map((item) => ({
          index: item.entry.index,
          score: item.score,
          scoreZ: Number(item.scoreZ.toFixed(2)),
          actionZ: Number(item.actionZ.toFixed(2))
        })),
        badLimit,
        reject: shouldReject
      }
    }
  };
}

function computeUsableStarts(firstLeg, preferences = {}) {
  if (preferences.competitiveMode || preferences.virtualBots) {
    return firstLeg.starts.filter((startAnalysis) => startAnalysis.reachable);
  }

  const outlierSet = new Set(firstLeg.summary.outliers.map((item) => item.index));
  return firstLeg.starts.filter((startAnalysis) => startAnalysis.reachable && !outlierSet.has(startAnalysis.index));
}

function hasStartCapacityHardFailure(scenario) {
  return (scenario?.metrics?.hardFailures || []).some((failure) => START_CAPACITY_HARD_FAILURES.has(failure));
}

function isViableFallbackScenario(scenario) {
  return Boolean(
    scenario?.metrics &&
    (scenario.metrics.hardFailures || []).length === 0
  );
}

function getCompetitiveBalanceProfile(entries = []) {
  const scores = entries.map((entry) => entry.adjustedScore).filter(Number.isFinite);
  const actions = entries.map((entry) => entry.bestActions).filter(Number.isFinite);
  const scoreStats = getRobustOutlierStats(entries, "adjustedScore");
  const actionStats = getRobustOutlierStats(entries, "bestActions");
  const outliers = rankNormalStartOutliers(entries, "adjustedScore", FULL_START_OUTLIER_Z);
  const scoreRange = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
  const actionRange = actions.length ? Math.max(...actions) - Math.min(...actions) : 0;
  const worstScoreZ = entries.length
    ? Math.max(...entries.map((entry) => Math.abs(entry.adjustedScore - scoreStats.center) / scoreStats.robustScale))
    : 0;
  const worstActionZ = entries.length
    ? Math.max(...entries.map((entry) => Number.isFinite(entry.bestActions)
      ? Math.abs(entry.bestActions - actionStats.center) / actionStats.robustScale
      : 0))
    : 0;
  const objective = (
    outliers.length * 1000 +
    Math.max(worstScoreZ, worstActionZ * 0.9) * 55 +
    scoreRange * 0.18 +
    actionRange * 1.2
  );
  return {
    outliers,
    scoreRange: Number(scoreRange.toFixed(2)),
    actionRange: Number(actionRange.toFixed(2)),
    worstScoreZ: Number(worstScoreZ.toFixed(2)),
    worstActionZ: Number(worstActionZ.toFixed(2)),
    objective: Number(objective.toFixed(3))
  };
}

function getCombinationCount(n, k, cap = 50001) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = (value * (n - k + index)) / index;
    if (value >= cap) return cap;
  }
  return Math.round(value);
}


function selectCompetitivePreferredStarts(firstLeg, playerCount = 4) {
  const candidates = (firstLeg?.starts || []).filter((entry) => (
    entry.reachable &&
    entry.selectedRoute &&
    Number.isFinite(entry.adjustedScore) &&
    Number.isFinite(entry.bestActions)
  ));
  const targetCount = Math.max(1, Math.min(playerCount, candidates.length));
  if (candidates.length <= targetCount) {
    return candidates.map((entry) => entry.index);
  }

  let best = null;
  const chosen = [];
  let visited = 0;
  const visitLimit = 20000;
  const consider = () => {
    visited += 1;
    const entries = chosen.map((position) => candidates[position]);
    const profile = getCompetitiveBalanceProfile(entries);
    if (!best || profile.objective < best.profile.objective - 0.001) {
      best = { indices: entries.map((entry) => entry.index), profile };
    }
  };
  const visit = (offset) => {
    if (visited >= visitLimit) return;
    if (chosen.length === targetCount) {
      consider();
      return;
    }
    const needed = targetCount - chosen.length;
    for (let position = offset; position <= candidates.length - needed; position += 1) {
      chosen.push(position);
      visit(position + 1);
      chosen.pop();
      if (visited >= visitLimit) break;
    }
  };
  visit(0);

  if (best) return best.indices;

  return [...candidates]
    .sort((left, right) => left.adjustedScore - right.adjustedScore)
    .slice(0, targetCount)
    .map((entry) => entry.index);
}

function getCompetitiveBlockedIndices(firstLeg, selectedIndices, playerCount = 4) {
  const selectedSet = new Set(selectedIndices);
  const selectedEntries = (firstLeg?.starts || []).filter((entry) => selectedSet.has(entry.index));
  const selectedCenter = selectedEntries.length
    ? medianValue(selectedEntries.map((entry) => entry.adjustedScore))
    : 0;
  return (firstLeg?.starts || [])
    .filter((entry) => entry.reachable && !selectedSet.has(entry.index))
    .sort((left, right) => (
      Math.abs((right.adjustedScore ?? selectedCenter) - selectedCenter) -
      Math.abs((left.adjustedScore ?? selectedCenter) - selectedCenter)
    ))
    .slice(0, Math.max(0, playerCount))
    .map((entry) => entry.index);
}

function computeCompetitiveBlockImpact(
  firstLeg,
  tileMap,
  flags,
  playerCount = 4,
  options = {}
) {
  const staging = firstLeg?.summary?.competitiveStaging;
  if (staging?.active) {
    const selected = (firstLeg?.starts || []).filter((entry) => (
      entry.reachable && entry.selectedRoute && Number.isFinite(entry.adjustedScore)
    ));
    const profile = getCompetitiveBalanceProfile(selected);
    const acceptable = (
      selected.length >= playerCount &&
      profile.outliers.length === 0 &&
      profile.worstScoreZ < FULL_START_OUTLIER_Z &&
      profile.worstActionZ < FULL_START_OUTLIER_Z + 0.35
    );
    return {
      blockedStartCount: staging.blockedIndices?.length ?? Math.min(playerCount, staging.sourceStartCount ?? 0),
      remainingStartCount: staging.remainingAfterBlocks ?? Math.max(0, (staging.sourceStartCount ?? selected.length) - playerCount),
      blockedIndices: staging.blockedIndices ?? [],
      selectedStartCount: selected.length,
      selectedIndices: selected.map((entry) => entry.index),
      remainingOutlierCount: profile.outliers.length,
      scoreRange: profile.scoreRange,
      actionRange: profile.actionRange,
      worstScoreZ: profile.worstScoreZ,
      worstActionZ: profile.worstActionZ,
      acceptable,
      method: "staged-perfect-blocks+perfect-starts",
      trafficSubsetsTested: 0
    };
  }

  const reachable = (firstLeg?.starts || [])
    .filter((startAnalysis) => (
      startAnalysis.reachable &&
      startAnalysis.selectedRoute &&
      Number.isFinite(startAnalysis.adjustedScore)
    ));
  const blockCount = Math.max(
    0,
    Math.min(playerCount, reachable.length)
  );
  const requiredRemaining = Math.max(1, playerCount);

  if (reachable.length < blockCount + requiredRemaining) {
    return {
      blockedStartCount: blockCount,
      remainingStartCount: Math.max(0, reachable.length - blockCount),
      blockedIndices: [],
      remainingOutlierCount: Infinity,
      scoreRange: Infinity,
      actionRange: Infinity,
      worstScoreZ: Infinity,
      worstActionZ: Infinity,
      acceptable: false,
      method: "insufficient-starts",
      trafficSubsetsTested: 0
    };
  }

  const cheapCandidates = [];
  const cheapLimit = 64;
  const keepCheapCandidate = (blockedIndices, method) => {
    const blockedSet = new Set(blockedIndices);
    const remaining = reachable.filter(
      (entry) => !blockedSet.has(entry.index)
    );
    const profile = getCompetitiveBalanceProfile(remaining);
    cheapCandidates.push({
      blockedIndices: [...blockedIndices],
      remainingIndices: remaining.map((entry) => entry.index),
      cheapObjective: profile.objective,
      method
    });
    cheapCandidates.sort(
      (left, right) => left.cheapObjective - right.cheapObjective
    );
    if (cheapCandidates.length > cheapLimit) {
      cheapCandidates.length = cheapLimit;
    }
  };

  const combinationCount = getCombinationCount(
    reachable.length,
    blockCount
  );

  if (combinationCount <= 20000) {
    const chosen = [];
    const visit = (offset) => {
      if (chosen.length === blockCount) {
        keepCheapCandidate(
          chosen.map((position) => reachable[position].index),
          "exact-prefilter"
        );
        return;
      }
      const needed = blockCount - chosen.length;
      for (
        let position = offset;
        position <= reachable.length - needed;
        position += 1
      ) {
        chosen.push(position);
        visit(position + 1);
        chosen.pop();
      }
    };
    visit(0);
  } else {
    const beamWidth = 96;
    let beam = [{
      blockedIndices: [],
      nextOffset: 0,
      objective: getCompetitiveBalanceProfile(reachable).objective
    }];

    for (let depth = 0; depth < blockCount; depth += 1) {
      const nextBeam = [];
      for (const state of beam) {
        for (
          let position = state.nextOffset;
          position < reachable.length;
          position += 1
        ) {
          const blockedIndices = [
            ...state.blockedIndices,
            reachable[position].index
          ];
          const blockedSet = new Set(blockedIndices);
          const remaining = reachable.filter(
            (entry) => !blockedSet.has(entry.index)
          );
          nextBeam.push({
            blockedIndices,
            nextOffset: position + 1,
            objective: getCompetitiveBalanceProfile(remaining).objective
          });
        }
      }
      nextBeam.sort(
        (left, right) => left.objective - right.objective
      );
      beam = nextBeam.slice(0, beamWidth);
    }

    beam.slice(0, cheapLimit).forEach((state) => (
      keepCheapCandidate(state.blockedIndices, "beam-prefilter")
    ));
  }

  let best = null;
  for (const candidate of cheapCandidates) {
    const evaluated = evaluateFullCourseSubsetTraffic(
      tileMap,
      firstLeg,
      flags,
      candidate.remainingIndices,
      {
        ...options,
        playerCount,
        payToWin: false,
        fullCourseTrafficPasses: 2
      }
    );
    const profile = getCompetitiveBalanceProfile(evaluated.entries);
    const denseCandidate = {
      ...candidate,
      profile,
      evaluated
    };

    if (
      !best ||
      denseCandidate.profile.objective <
        best.profile.objective - 0.001
    ) {
      best = denseCandidate;
    }
  }

  const profile = best?.profile ??
    getCompetitiveBalanceProfile(reachable);
  const remainingStartCount = best?.remainingIndices?.length ??
    reachable.length;
  const acceptable = (
    remainingStartCount >= requiredRemaining &&
    profile.outliers.length === 0 &&
    profile.worstScoreZ < FULL_START_OUTLIER_Z &&
    profile.worstActionZ < FULL_START_OUTLIER_Z + 0.35
  );

  return {
    blockedStartCount: blockCount,
    remainingStartCount,
    blockedIndices: best?.blockedIndices ?? [],
    remainingOutlierCount: profile.outliers.length,
    scoreRange: profile.scoreRange,
    actionRange: profile.actionRange,
    worstScoreZ: profile.worstScoreZ,
    worstActionZ: profile.worstActionZ,
    acceptable,
    method: best
      ? `${best.method}+traffic`
      : "none",
    trafficSubsetsTested: cheapCandidates.length
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

function placementTouchesTrackedRoute(placement, pieceMap, routeTileKeys) {
  const piece = pieceMap[placement.pieceId];
  if (!piece || !routeTileKeys?.size) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => (
    routeTileKeys.has(`${placement.x + x},${placement.y + y}`)
  ));
}

function pruneUnusedDockPlacements(dockPlacements, pieceMap, sequence, usableStarts, checkpoints) {
  if ((dockPlacements?.length ?? 0) <= 1) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const keptDockPlacements = dockPlacements.filter((dockPlacement) => (
    usableStarts.some((startAnalysis) => pointOnPlacement(startAnalysis.start, dockPlacement, pieceMap)) ||
    checkpoints.some((checkpoint) => pointOnPlacement(checkpoint, dockPlacement, pieceMap)) ||
    placementTouchesTrackedRoute(dockPlacement, pieceMap, routeTileKeys)
  ));

  if (!keptDockPlacements.length) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  return {
    dockPlacements: keptDockPlacements,
    pruned: keptDockPlacements.length !== dockPlacements.length
  };
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
          tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side), { includeLowerLedge: true }) ||
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

function pruneUnusedBoardPlacements(boardPlacements, overlayPlacements, pieceMap, sequence, usableStarts, checkpoints, options = {}) {
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
  for (const index of options.protectedBoardIndices || []) {
    if (Number.isInteger(index) && index >= 0 && index < boardPlacements.length) {
      usedBoards.add(index);
    }
  }

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
      lighterGame: preferences.lighterGame,
      flamingOil: preferences.flamingOil
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
  const safePlayerCount = Math.max(1, playerCount || 4);
  // Every additional robot slows register resolution even on an open board:
  // more cards must be resolved and more ordering state must be tracked.
  // Keep that 2 -> 3 -> 4 growth explicit, then add a steeper coordination
  // cost for larger tables where interactions become harder to follow.
  const baseResolutionLoad = safePlayerCount * 1.55;
  const orderingLoad = Math.max(0, safePlayerCount - 1) * 0.55;
  const largeTableLoad = Math.max(0, safePlayerCount - 4) ** 2 * 0.55;

  return Number((baseResolutionLoad + orderingLoad + largeTableLoad).toFixed(2));
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

function getSharedDeckPlayerPressure(playerCount = 4) {
  return clamp(((playerCount || 4) - 2) / 4, 0, 1);
}

const VARIANT_DIFFICULTY_ACCOUNTING = Object.freeze({
  actFast: "explicit",
  lighterGame: "mechanical+explicit",
  upgradeWorld: "mechanical",
  lessSpammyGame: "mechanical+explicit",
  criticalSpam: "mechanical+explicit",
  criticalHaywire: "mechanical+explicit",
  permanentShutdown: "mechanical+explicit",
  lessDeadlyGame: "mechanical",
  moreDeadlyGame: "mechanical",
  cuttingFloor: "mechanical+explicit",
  flamingOil: "mechanical+explicit",
  repulsorOverdrive: "mechanical",
  setToKill: "mechanical",
  setToStun: "mechanical",
  dynamicArchiving: "mechanical",
  homeReboot: "mechanical",
  hazardousFlags: "mechanical",
  repairStations: "mechanical",
  movingTargets: "mechanical+explicit",
  extraDocks: "layout-derived",
  noDocks: "layout-derived",
  sandwichedDock: "layout-derived",
  factoryRejects: "explicit",
  startupSpinUp: "mechanical",
  virtualBots: "mechanical",
  lessForeshadowing: "explicit",
  classicSharedDeck: "explicit",
  competitiveMode: "explicit+balance-gate",
  payToWin: "explicit+pricing",
  staggeredBoards: "layout-derived"
});

function applyVariantDifficultyModifiers(raw, preferences = {}, boardHarshness = null) {
  let adjusted = raw;
  const harshness = boardHarshness ?? computeBoardHarshness();

  if (preferences.lighterGame) {
    adjusted *= 0.96;
  }
  if (preferences.lessSpammyGame) {
    adjusted *= 0.95;
  }
  if (preferences.criticalSpam) {
    adjusted *= 1.03 + harshness.normalized * 0.035;
  }
  if (preferences.criticalHaywire) {
    adjusted *= 1.035 + harshness.normalized * 0.04;
  }
  if (preferences.permanentShutdown && preferences.criticalSpam) {
    adjusted *= 1.01 + harshness.normalized * 0.05;
  }
  if (preferences.lessForeshadowing) {
    adjusted *= 1.1;
  }
  if (preferences.cuttingFloor) {
    adjusted += Math.min(10, countBoardLasers(preferences.goalTileMap) * 0.45);
  }
  if (preferences.flamingOil) {
    adjusted += Math.min(8, countFeatureTypeInTileMap(preferences.goalTileMap, "oil") * 0.38);
  }
  if (preferences.classicSharedDeck) {
    const sharedDeckPressure = getSharedDeckPlayerPressure(preferences.playerCount);
    adjusted *= (
      1.04 +
      sharedDeckPressure * 0.07 +
      harshness.normalized * (0.04 + sharedDeckPressure * 0.07)
    );
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

  // Setup-choice rules whose difficulty is primarily strategic rather than
  // geometric need a small explicit contribution. These apply identically
  // whether the rule was randomly selected or explicitly forced.
  if (preferences.competitiveMode) {
    adjusted += 1.8;
  }
  if (preferences.payToWin) {
    adjusted += 1.4;
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

function computeDifficultyLengthLoad(totalDifficulty = 0, flagCount = 0) {
  const baselineDifficulty = Math.max(75, flagCount * 55);
  const baselineLoad = Math.min(totalDifficulty, baselineDifficulty) * 0.025;
  const pressureLoad = Math.min(Math.max(0, totalDifficulty - baselineDifficulty), 260) * 0.075;
  return Number((baselineLoad + pressureLoad).toFixed(2));
}

function computeActFastLengthLoad(preferences = {}, playerCount = 4) {
  const safePlayerCount = playerCount || 4;
  const mode = preferences.actFastMode;
  const byMode = {
    countdown_1m: -4.5,
    countdown_30s: -7,
    last_player_30s: safePlayerCount >= 5
      ? -4
      : safePlayerCount >= 4
        ? -2.5
        : 0
  };

  return byMode[mode] ?? 0;
}

function computeLengthMetrics(sequence, flagCount, playerCount, boardCount, preferences = {}, boardHarshness = null) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const totalRouteDistance = first.lengthScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);
  const totalActionLoad = first.actionScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteActions || 0), 0);
  const totalCongestion = first.averageTrafficPenalty + later.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0);
  const safePlayerCount = Math.max(1, playerCount || 4);
  const harshness = boardHarshness ?? computeBoardHarshness();
  const checkpointLoad = 0;
  const playerLoad = computePlayerTimeLoad(safePlayerCount);
  const actionLoad = totalActionLoad * 2.8;
  const distanceLoad = totalRouteDistance * 0.75;
  // Traffic costs real play time even on a forgiving board. That cost rises
  // when more robots must be resolved and when collisions happen on harsher
  // boards, where displacement is more likely to trigger damage, reboots, or
  // consequential rerouting. Difficulty is therefore folded into this
  // interaction term via the existing physical board-harshness profile rather
  // than added again as a generic length penalty.
  const congestionWeight = (
    0.08 +
    harshness.normalized * 0.10 +
    Math.max(0, safePlayerCount - 2) * 0.015
  );
  const congestionLoad = totalCongestion * congestionWeight;
  const flagAreaLoad = 0;
  const difficultyLoad = 0;
  const movingTargetLoad = preferences.movingTargetStats?.lengthBonus ?? 0;
  const actFastLoad = computeActFastLengthLoad(preferences, safePlayerCount);
  const routeLoad = actionLoad + distanceLoad;
  const frictionLoad = congestionLoad + movingTargetLoad + actFastLoad;
  let compactnessRaw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));
  let raw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));

  if (preferences.lighterGame) {
    compactnessRaw = Number((compactnessRaw * 0.89).toFixed(2));
    raw = Number((raw * 0.89).toFixed(2));
  }
  if (preferences.lessSpammyGame) {
    compactnessRaw = Number((compactnessRaw * 0.97).toFixed(2));
    raw = Number((raw * 0.97).toFixed(2));
  }
  if (preferences.criticalSpam) {
    const multiplier = 1.015 + harshness.normalized * 0.015;
    compactnessRaw = Number((compactnessRaw * multiplier).toFixed(2));
    raw = Number((raw * multiplier).toFixed(2));
  }
  if (preferences.criticalHaywire) {
    const multiplier = 1.015 + harshness.normalized * 0.02;
    compactnessRaw = Number((compactnessRaw * multiplier).toFixed(2));
    raw = Number((raw * multiplier).toFixed(2));
  }
  if (preferences.lessForeshadowing) {
    compactnessRaw = Number((compactnessRaw * 1.04).toFixed(2));
    raw = Number((raw * 1.04).toFixed(2));
  }
  if (preferences.classicSharedDeck) {
    const sharedDeckPressure = getSharedDeckPlayerPressure(playerCount);
    const multiplier = (
      1.01 +
      sharedDeckPressure * 0.02 +
      harshness.normalized * (0.015 + sharedDeckPressure * 0.035)
    );
    compactnessRaw = Number((compactnessRaw * multiplier).toFixed(2));
    raw = Number((raw * multiplier).toFixed(2));
  }

  return {
    raw,
    compactnessRaw,
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
      congestionWeight: Number(congestionWeight.toFixed(3)),
      boardHarshness: Number(harshness.normalized.toFixed(3)),
      flagAreaLoad: Number(flagAreaLoad.toFixed(2)),
      difficultyLoad: Number(difficultyLoad.toFixed(2)),
      movingTargetLoad: Number(movingTargetLoad.toFixed(2)),
      actFastLoad: Number(actFastLoad.toFixed(2)),
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

function shouldUseCompactLengthFit(preferences = {}) {
  return preferences.length === "short" && getTuningDifficulty(preferences.difficulty) === "hard";
}

function getMovingTargetVolatilityPenalty(stats = {}, fairnessStdDev = 0, preferences = {}) {
  if (!stats?.activeCount) {
    return 0;
  }

  const playerScale = Math.max(1, (preferences.playerCount ?? 4) / 4);
  const raw = (
    stats.activeCount * 2 +
    Math.max(0, stats.totalPathLength - stats.activeCount) * 0.35 +
    stats.totalTurns * 0.3 +
    stats.fastSegments * 0.28 +
    stats.wrapCount * 0.5 +
    Math.max(0, fairnessStdDev - 6) * 0.16
  ) * playerScale;

  return Number(raw.toFixed(2));
}

function getFullCourseExpectedRoutes(sequence) {
  return (sequence?.firstLeg?.starts || [])
    .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.fullCourseRoute)
    .map((startAnalysis) => ({
      startIndex: startAnalysis.index,
      route: startAnalysis.fullCourseRoute
    }));
}

function getRouteDramaProfile(sequence, preferences = {}) {
  const entries = getFullCourseExpectedRoutes(sequence);
  if (entries.length <= 1) {
    return {
      level: "none",
      score: 0,
      penalty: 0,
      crossings: 0,
      sharedTiles: 0,
      sharedTilePairs: 0,
      reverseEdges: 0,
      pairCount: 0
    };
  }

  let sharedTilePairs = 0;
  let reverseEdges = 0;
  const sharedTiles = new Set();

  function routeTileIndex(route) {
    const map = new Map();
    (route.path || []).forEach((point, index) => {
      const key = `${point.x},${point.y}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(index);
    });
    return map;
  }

  function routeEdges(route) {
    const edges = new Set();
    const path = route.path || [];
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (to.jump) {
        continue;
      }
      edges.add(`${from.x},${from.y}>${to.x},${to.y}`);
    }
    return edges;
  }

  const indexed = entries.map((entry) => ({
    ...entry,
    tiles: routeTileIndex(entry.route),
    edges: routeEdges(entry.route)
  }));

  for (let left = 0; left < indexed.length; left += 1) {
    for (let right = left + 1; right < indexed.length; right += 1) {
      for (const [key, leftIndices] of indexed[left].tiles.entries()) {
        const rightIndices = indexed[right].tiles.get(key);
        if (!rightIndices) {
          continue;
        }
        sharedTiles.add(key);
        sharedTilePairs += 1;
      }

      for (const edge of indexed[left].edges) {
        const [from, to] = edge.split(">");
        if (indexed[right].edges.has(`${to}>${from}`)) {
          reverseEdges += 1;
        }
      }
    }
  }

  const pairCount = (entries.length * (entries.length - 1)) / 2;
  const normalizedShared = pairCount ? sharedTilePairs / pairCount : 0;
  const normalizedReverse = pairCount ? reverseEdges / pairCount : 0;
  const score = Number(Math.min(40, normalizedShared * 2.2 + normalizedReverse * 1.6).toFixed(2));
  const target = preferences.length === "short" || preferences.difficulty === "easy"
    ? 2.5
    : preferences.length === "long" || preferences.difficulty === "hard" || preferences.difficulty === "brutal"
      ? 7
      : 5;
  const weakPenaltyScale = preferences.length === "short" || preferences.difficulty === "easy" ? 0.35 : 1;
  const weakPenalty = Math.max(0, target - score) * weakPenaltyScale;
  const excessivePenalty = Math.max(0, score - 20) * 0.45;
  const penalty = Number((weakPenalty + excessivePenalty).toFixed(2));
  const level = score >= 14 ? "high" : score >= 7 ? "moderate" : score >= 3 ? "low" : "none";

  return {
    level,
    score,
    penalty,
    crossings: sharedTilePairs,
    sharedTiles: sharedTiles.size,
    sharedTilePairs,
    reverseEdges,
    pairCount
  };
}

function getFinalLegAnticlimax(sequence, preferences = {}) {
  const finalLeg = sequence?.legs?.at(-1);
  if (!finalLeg || sequence.legs.length <= 1) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const routes = finalLeg.analysis?.distinctRoutes || finalLeg.analysis?.routes || [];
  const actions = routes
    .map((route) => route.actions)
    .filter(Number.isFinite);
  if (!actions.length) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const fastestActions = Math.min(...actions);
  const shortfall = Math.max(0, 5 - fastestActions);
  const lengthScale = preferences.length === "short"
    ? 0.25
    : preferences.length === "long"
      ? 1.25
      : 0.85;
  const difficultyScale = preferences.difficulty === "easy"
    ? 0.55
    : preferences.difficulty === "hard" || preferences.difficulty === "brutal"
      ? 1.15
      : 0.9;
  const penalty = Number((shortfall * shortfall * 3.5 * lengthScale * difficultyScale).toFixed(2));

  return {
    active: penalty > 0,
    fastestActions,
    penalty,
    routeCount: routes.length
  };
}

function classifyCandidate(sequence, preferences, context = {}) {
  const usableStarts = computeUsableStarts(sequence.firstLeg, preferences);
  const boardHarshness = computeBoardHarshness(context.boardPlacements, context.pieceMap);
  const fairnessStdDev = sequence.firstLeg.summary.scoreStdDev;
  const skipCompetitiveBlockImpact = Boolean(context.skipCompetitiveBlockImpact);
  const competitiveBlockImpact = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? computeCompetitiveBlockImpact(
      sequence.firstLeg,
      context.goalTileMap ?? context.tileMap,
      context.checkpoints ?? sequence.firstLeg.flags ?? [],
      preferences.playerCount,
      preferences
    )
    : null;
  const checkpointPressure = computeLaterCheckpointPressure(
    context.tileMap,
    context.checkpoints,
    preferences
  );
  const movingTargetStats = preferences.movingTargets
    ? summarizeMovingTargets(context.tileMap, context.checkpoints, preferences)
    : summarizeMovingTargets(null, [], preferences);
  let difficultyRaw = applyVariantDifficultyModifiers(computeDifficultyRaw(sequence, checkpointPressure), {
    ...preferences,
    movingTargetStats,
    goalTileMap: context.goalTileMap ?? context.tileMap
  }, boardHarshness);
  const lengthMetrics = computeLengthMetrics(
    sequence,
    preferences.flagCount,
    preferences.playerCount,
    context.boardPlacements?.length ?? 1,
    { ...preferences, movingTargetStats },
    boardHarshness
  );
  const lengthRaw = lengthMetrics.raw;
  const lengthFitRaw = shouldUseCompactLengthFit(preferences)
    ? lengthMetrics.compactnessRaw
    : lengthRaw;

  const difficultyThresholds = getDifficultyThresholds();
  const lengthThresholds = getLengthThresholds();

  const hardFailures = [];
  if (lengthFitRaw < MIN_LENGTH_RAW) {
    hardFailures.push("too-short");
  }
  if (usableStarts.length < preferences.playerCount) {
    hardFailures.push("usable-starts");
  }

  if (sequence.firstLeg.summary.reachableStarts < preferences.playerCount) {
    hardFailures.push("reachable-starts");
  }

  if (sequence.firstLeg.summary.normalStartBalance?.reject) {
    hardFailures.push("normal-start-balance");
  }

  if (preferences.competitiveMode && !skipCompetitiveBlockImpact && !competitiveBlockImpact?.acceptable) {
    hardFailures.push("competitive-start-balance");
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
  const lengthFit = bandDistance(lengthFitRaw, preferences.length, lengthThresholds);
  const difficultyDirection = preferences.difficulty === "any"
    ? "matched"
    : difficultyRaw < difficultyThresholds[preferences.difficulty][0]
      ? "low"
      : difficultyRaw >= difficultyThresholds[preferences.difficulty][1]
        ? "high"
        : "matched";
  const lengthDirection = preferences.length === "any"
    ? "matched"
    : lengthFitRaw < lengthThresholds[preferences.length][0]
      ? "low"
      : lengthFitRaw >= lengthThresholds[preferences.length][1]
        ? "high"
        : "matched";
  const fairnessPenalty = preferences.competitiveMode
    ? 0
    : fairnessStdDev >= 14 ? fairnessStdDev - 14 : 0;
  const competitiveBlockPenalty = preferences.competitiveMode && !skipCompetitiveBlockImpact
    ? (
      Math.max(0, preferences.playerCount - (competitiveBlockImpact?.remainingStartCount ?? 0)) * 18 +
      (competitiveBlockImpact?.remainingOutlierCount ?? 0) * 24 +
      Math.max(0, (competitiveBlockImpact?.worstScoreZ ?? 0) - 1.5) * 4 +
      Math.max(0, (competitiveBlockImpact?.worstActionZ ?? 0) - 1.8) * 3
    )
    : 0;
  const movingTargetVolatilityPenalty = getMovingTargetVolatilityPenalty(
    movingTargetStats,
    fairnessStdDev,
    preferences
  );
  const finalLegAnticlimax = getFinalLegAnticlimax(sequence, preferences);
  const routeDrama = getRouteDramaProfile(sequence, preferences);
  const fitScore = (
    difficultyFit * 1.2 +
    lengthFit +
    fairnessPenalty * 0.5 +
    competitiveBlockPenalty +
    movingTargetVolatilityPenalty +
    finalLegAnticlimax.penalty +
    routeDrama.penalty +
    Math.max(0, preferences.playerCount - usableStarts.length) * 20
  );

  return {
    usableStarts,
    difficultyRaw,
    lengthRaw,
    lengthFitRaw,
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
    finalLegAnticlimax,
    routeDrama,
    acceptable: hardFailures.length === 0 && difficultyFit === 0 && lengthFit === 0,
    hardFailures,
    fitScore: Number(fitScore.toFixed(2))
  };
}


function buildScenarioCopySummary(scenario) {
  if (!scenario) {
    return "No course generated.";
  }

  const summary = scenario.sequence?.firstLeg?.summary ?? {};
  const diagnostics = scenario.generationDiagnostics ?? null;
  const balance = summary.normalStartBalance ?? null;
  const competitive = scenario.metrics?.competitiveBlockImpact ?? null;
  const payToWin = summary.payToWin ?? null;
  const contextualCache = summary.contextualLegCache ?? null;
  const profile = diagnostics?.contextualProfileTotals ?? null;
  const playableCheckpoints = getPlayableCheckpoints(
    scenario.checkpoints ?? [],
    scenario.virtualBots
  );
  const selectedSets = [...getSelectedExpansionIds(scenario.preferences ?? {})]
    .map((id) => formatExpansionName(id))
    .join(", ") || "none";
  const variantImpact = getVariantImpactSummary(scenario) || "none";
  const resultLabel = scenario.generationBestMatch
    ? `closest match, ${scenario.attempts ?? "?"} attempt(s), termination ${scenario.generationTerminationReason ?? diagnostics?.terminationReason ?? "attempt-limit"}`
    : `accepted, ${scenario.attempts ?? "?"} attempt(s)`;

  const lines = [
    `Requested: ${scenario.preferences?.playerCount ?? "?"}p, ${formatDifficultyLabel(scenario.preferences?.difficulty)} / ${formatLengthLabel(scenario.preferences?.length)}`,
    `Sets: ${selectedSets}`,
    `Variants: ${variantImpact}`,
    `Result: ${resultLabel}`
  ];

  if (diagnostics) {
    lines.push(
      `Generation: ${formatGenerationDuration(diagnostics.totalMs)} total, ${formatGenerationDuration(diagnostics.routeSearchMs)} route search, ${diagnostics.routeSearches ?? 0} searches, ${diagnostics.routeExpansions ?? 0} expansions, ${diagnostics.cappedRouteSearches ?? 0} capped`
    );
    if (diagnostics.slowestRouteSearch) {
      const slowest = diagnostics.slowestRouteSearch;
      lines.push(
        `Slowest: ${slowest.kind ?? "route"} ${formatGenerationDuration(slowest.durationMs)}, ${slowest.expansions ?? 0}/${slowest.maxExpansions ?? 0} expansions, ${slowest.returnedRoutes ?? 0} routes`
      );
    }
    if (profile) {
      lines.push(
        `Physical cache: ${profile.physicalCacheHits ?? 0}/${(profile.physicalCacheHits ?? 0) + (profile.physicalCacheMisses ?? 0)} hits`
      );
    }
  }

  lines.push(
    `Course: ${scenario.boardCount ?? scenario.mainBoardIds?.length ?? 0} board(s), ${playableCheckpoints.length} flag(s)`,
    `Boards: ${(scenario.mainBoardIds ?? []).map((pieceId, index) => `${pieceId}@${scenario.mainRotations?.[index] ?? 0}`).join(", ") || "none"}`,
    scenario.competitiveMode && summary.competitiveStaging?.active
      ? `Starts: ${summary.competitiveStaging.routedStartCount ?? "?"} routed -> ${scenario.metrics?.usableStarts?.length ?? "?"} selected / ${summary.competitiveStaging.sourceStartCount ?? "?"} total`
      : `Starts: ${summary.reachableStarts ?? "?"} reachable -> ${scenario.metrics?.usableStarts?.length ?? "?"} usable / ${scenario.sequence?.starts?.length ?? "?"} total`
  );

  if (balance?.active) {
    const pruned = balance.pressurePruned ?? [];
    const prunedText = pruned.length
      ? pruned.map((item) => {
        const diagnostics = item.diagnostics ?? {};
        const kind = diagnostics.balanceDispersionPruned ? "balance" : "outlier";
        const zBits = [];
        if (Number.isFinite(diagnostics.scoreZ)) zBits.push(`scoreZ ${diagnostics.scoreZ}`);
        if (Number.isFinite(diagnostics.actionZ)) zBits.push(`actionZ ${diagnostics.actionZ}`);
        return `#${item.index + 1} ${kind} p${item.pass ?? "?"}${zBits.length ? ` (${zBits.join(", ")})` : ""}`;
      }).join(", ")
      : "none";
    lines.push(
      `Normal balance: ${balance.iterative ? "iterative" : (balance.staged ? "staged" : "legacy")}, pruned ${prunedText}`,
      `Balance stddev: ${balance.balanceStdDevBefore ?? "n/a"} -> ${balance.balanceStdDevAfter ?? scenario.metrics?.fairnessStdDev ?? "n/a"} / ${balance.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, traffic recomputations ${balance.trafficRecomputations ?? 0}, remainingBad ${(balance.remainingBadStarts ?? []).length}, reject ${balance.reject ? "yes" : "no"}`
    );
  } else if (scenario.competitiveMode && competitive) {
    lines.push(
      `Competitive balance: blocked ${competitive.blockedStartCount ?? 0}, remaining choices ${competitive.remainingStartCount ?? 0}, selected ${competitive.selectedStartCount ?? scenario.metrics?.usableStarts?.length ?? 0}, selectedOutliers ${competitive.remainingOutlierCount ?? "n/a"}, acceptable ${competitive.acceptable ? "yes" : "no"}, method ${competitive.method ?? "n/a"}`
    );
  } else if (scenario.payToWin && payToWin?.active) {
    lines.push(
      `Pay to Win: startingEnergy ${payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}, priced ${payToWin.pricedStartCount ?? "n/a"}, pruned ${(payToWin.pruned ?? []).length}, fullyUnavailable ${payToWin.fullyUnavailableCount ?? 0}, earlyUnavailable ${payToWin.earlyUnavailableCount ?? 0}/${payToWin.maxEarlyUnavailable ?? 0}, lateUnavailable ${payToWin.lateUnavailableCount ?? 0}/${payToWin.maxLateUnavailable ?? 0}, surplusStarts ${payToWin.surplusStarts ?? 0}`
    );
  }

  lines.push(
    `Fairness: stddev ${scenario.metrics?.fairnessStdDev ?? "n/a"}, score ${summary.fairnessScore ?? "n/a"}`,
    `Difficulty raw: ${scenario.metrics?.difficultyRaw ?? "n/a"}`,
    `Length raw: ${scenario.metrics?.lengthRaw ?? "n/a"}`,
    `Course scores: difficulty ${summary.difficultyScore ?? "n/a"}, length ${summary.lengthScore ?? "n/a"}, actions ${summary.actionScore ?? "n/a"}, overall ${summary.overallScore ?? "n/a"}`
  );

  if (contextualCache) {
    lines.push(
      `Contextual cache: cappedContexts ${contextualCache.zeroRouteCapFailures ?? 0} across ${contextualCache.zeroRouteFailureStarts ?? 0} starts, survivors ${contextualCache.survivingStarts ?? "n/a"}/${contextualCache.requiredSurvivingStarts ?? "n/a"}, exactHits ${contextualCache.exactHits ?? 0}, templateHits ${contextualCache.templateHits ?? 0}, misses ${contextualCache.misses ?? 0}`
    );
  }

  if (scenario.metrics?.hardFailures?.length) {
    lines.push(`Hard failures: ${scenario.metrics.hardFailures.join(", ")}`);
  }

  return roundCourseEvaluationNumbers(lines.join("\n"));
}

function buildScenarioReport(scenario, selectedLegIndex) {
  const summary = scenario.sequence.firstLeg.summary;
  const legOptions = scenario.sequence.legs.map((leg, index) => (
    index === 0 ? (scenario.virtualBots ? "Entry -> 1" : "Dock -> 1") : `${leg.from} -> ${leg.to}`
  ));
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const goal = selectedLegIndex === null
    ? playableCheckpoints.at(-1) ?? playableCheckpoints[0]
    : playableCheckpoints[selectedLegIndex] ?? playableCheckpoints[0];
  const outlierReasonByIndex = new Map((summary.outliers || []).map((item) => [item.index, item.reasons ?? null]));

  function formatOutlierReasons(reasons) {
    if (!reasons) {
      return "reason unavailable";
    }

    const parts = [];
    if (reasons.payToWinPruned) {
      const threshold = reasons.costThreshold ?? 5;
      if (Number.isFinite(reasons.energyCost) && reasons.energyCost >= threshold) {
        parts.push(`Pay to Win cost ${reasons.energyCost} >= ${threshold}`);
      } else {
        parts.push(
          `Pay to Win price spread required pruning; removed start priced ${Number.isFinite(reasons.energyCost) ? `${reasons.energyCost}E` : "outside the retained range"}`
        );
      }
    }
    if (reasons.payToWinUnavailable) {
      const startingEnergy = reasons.startingEnergy ?? DEFAULT_STARTING_ENERGY;
      const early = Number.isFinite(reasons.energyCost) ? `${reasons.energyCost}E` : "unavailable";
      const late = Number.isFinite(reasons.lateEnergyCost) ? `${reasons.lateEnergyCost}E` : "unavailable";
      parts.push(`Pay to Win unavailable to all selectors (${early}/${late}; ${startingEnergy} starting energy)`);
    }
    if (reasons.normalBalancePruned) {
      const zText = Number.isFinite(reasons.scoreZ)
        ? ` (score z ${Number(reasons.scoreZ).toFixed(2)})`
        : "";
      if (reasons.balanceDispersionPruned) {
        const spreadText = Number.isFinite(reasons.balanceStdDevBefore) && Number.isFinite(reasons.balanceStdDevAfter)
          ? ` (stddev ${reasons.balanceStdDevBefore} -> ${reasons.balanceStdDevAfter})`
          : "";
        parts.push(`removed to tighten normal start balance${spreadText}`);
      } else {
        parts.push(`removed traffic-aware start outlier${zText}`);
      }
    }
    if (reasons.removalReason) {
      parts.push(reasons.removalReason);
    }
    if (reasons.outlierPass) {
      parts.push(`pass ${reasons.outlierPass}`);
    }

    return parts.join("; ") || "reason unavailable";
  }

  function describeMovingTargetHit(route) {
    if (!route?.movingTarget || !route.hitTarget) {
      return null;
    }

    const flagLabel = route.movingTarget.checkpointId ?? "?";
    const spaceLabel = route.movingTarget.space ?? "?";
    return `flag ${flagLabel} space ${spaceLabel} (${route.hitTarget.x},${route.hitTarget.y}) after ${route.actions} register${route.actions === 1 ? "" : "s"}`;
  }

  function describeLegMovingTargetHits(leg) {
    if (leg.analysis.starts) {
      return leg.analysis.starts
        .map((startAnalysis) => {
          const description = describeMovingTargetHit(startAnalysis.selectedRoute);
          return description ? `start #${startAnalysis.index + 1} -> ${description}` : null;
        })
        .filter(Boolean);
    }

    return (leg.analysis.distinctRoutes || [])
      .map((route, index) => {
        const description = describeMovingTargetHit(route);
        return description ? `route ${index + 1} -> ${description}` : null;
      })
      .filter(Boolean);
  }

  const movingTargetHitLines = scenario.sequence.legs
    .flatMap((leg) => describeLegMovingTargetHits(leg).map((description) => (
      `Leg ${leg.from} -> ${leg.to}: ${description}`
    )));

  const lines = [
    `Requested: ${scenario.preferences.playerCount} players, ${formatDifficultyLabel(scenario.preferences.difficulty)} difficulty, ${formatLengthLabel(scenario.preferences.length)} length`,
    `Layout mode: ${scenario.preferences.alignedLayout ? "aligned" : "freeform"}`,
    `Sets: ${[...getSelectedExpansionIds(scenario.preferences)].map((id) => formatExpansionName(id)).join(", ") || "none"}`,
    `Allowed variants: ${describeAllowedVariants(scenario.preferences)}`,
    `Variant complexity: ${scenario.variantComplexityUsed ?? 0}/${scenario.variantComplexityBudget ?? 0}`,
    `Variant impact: ${getVariantImpactSummary(scenario) || "none"}`,
    `Act Fast used: ${scenario.actFast ? scenario.actFastMode ?? "yes" : "no"}`,
    `Competitive Mode used: ${scenario.competitiveMode ? "yes" : "no"}`,
    `Virtual Bots used: ${scenario.virtualBots ? "yes" : "no"}`,
    `Pay to Win used: ${scenario.payToWin ? "yes" : "no"}`,
    `Extra Docks used: ${scenario.extraDocks ? "yes" : "no"}`,
    `No Docks used: ${scenario.noDocks ? "yes" : "no"}${scenario.noDocks && (scenario.noDockEdges?.length ?? 0) ? ` (${scenario.noDockEdges.map((edge) => `${edge.pieceId} ${edge.side} full edge${edge.edgeLength ? ` ${edge.edgeLength}-wide` : ""} facing ${edge.facing}`).join("; ")})` : scenario.noDockEdge ? ` (${scenario.noDockEdge.pieceId} ${scenario.noDockEdge.side} full edge, facing ${scenario.noDockEdge.facing})` : ""}`,
    `Factory Rejects used: ${scenario.factoryRejects ? "yes" : "no"}`,
    `Recovery used: ${scenario.recoveryRule}`,
    `Energy Crisis / A Lighter Game used: ${scenario.lighterGame ? "yes" : "no"}`,
    `SPAM Filter / A Less SPAM-Y Game used: ${scenario.lessSpammyGame ? "yes" : "no"}`,
    `Walled In / A Less Deadly Game used: ${scenario.lessDeadlyGame ? "yes" : "no"}`,
    `Hard Reboot / A More Deadly Game used: ${scenario.moreDeadlyGame ? "yes" : "no"}`,
    `Flaming Oil used: ${scenario.flamingOil ? "yes" : "no"}`,
    `Shared Deck used: ${scenario.classicSharedDeck ? "yes" : "no"}`,
    `Hazardous Flags used: ${scenario.hazardousFlags ? "yes" : "no"}`,
    `Repair Stations used: ${scenario.repairStations ? "yes" : "no"}`,
    `Moving Targets used: ${scenario.movingTargets ? "yes" : "no"}`,
    `Less Foreshadowing used: ${scenario.lessForeshadowing ? "yes" : "no"}`,
    `Staggered Boards used: ${scenario.staggeredBoards ? "yes" : "no"}`,
    scenario.generationBestMatch
      ? `Closest match after ${scenario.attempts} attempt(s)`
      : `Accepted after ${scenario.attempts} attempt(s)`,
    scenario.generationBestMatch
      ? `Best-match termination: ${scenario.generationTerminationReason ?? "attempt-limit"}`
      : "Best-match termination: n/a",
    scenario.generationDiagnostics
      ? `Generation timing: total ${formatGenerationDuration(scenario.generationDiagnostics.totalMs)}, routeSearch ${formatGenerationDuration(scenario.generationDiagnostics.routeSearchMs)}, searches ${scenario.generationDiagnostics.routeSearches}, expansions ${scenario.generationDiagnostics.routeExpansions}, capped ${scenario.generationDiagnostics.cappedRouteSearches}, softBudget ${scenario.generationDiagnostics.softExpansionBudget ?? GENERATION_SOFT_EXPANSION_BUDGET}`
      : "Generation timing: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch
      ? `Slowest route search: ${scenario.generationDiagnostics.slowestRouteSearch.kind} ${formatGenerationDuration(scenario.generationDiagnostics.slowestRouteSearch.durationMs)}, expansions ${scenario.generationDiagnostics.slowestRouteSearch.expansions}/${scenario.generationDiagnostics.slowestRouteSearch.maxExpansions}, returned ${scenario.generationDiagnostics.slowestRouteSearch.returnedRoutes}`
      : "Slowest route search: n/a",
    scenario.generationDiagnostics?.contextualProfileTotals
      ? `Contextual profiler totals: ${formatContextualProfile(scenario.generationDiagnostics.contextualProfileTotals)}`
      : "Contextual profiler totals: n/a",
    scenario.generationDiagnostics?.contextualProfileTotals
      ? `Contextual profiler counts: ${formatContextualCounts(scenario.generationDiagnostics.contextualProfileTotals)}`
      : "Contextual profiler counts: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch?.contextualProfile
      ? `Slowest contextual breakdown: ${formatContextualProfile(scenario.generationDiagnostics.slowestRouteSearch.contextualProfile)}`
      : "Slowest contextual breakdown: n/a",
    scenario.generationDiagnostics?.slowestRouteSearch?.contextualProfile
      ? `Slowest contextual counts: ${formatContextualCounts(scenario.generationDiagnostics.slowestRouteSearch.contextualProfile)}`
      : "Slowest contextual counts: n/a",
    ...(scenario.generationDiagnostics?.attempts?.length
      ? [
        "Generation attempts:",
        ...scenario.generationDiagnostics.attempts.map((entry) => {
          const range = entry.startAttempt === entry.endAttempt
            ? `${entry.startAttempt}`
            : `${entry.startAttempt}-${entry.endAttempt}`;
          const slowest = entry.slowestRouteSearch
            ? `, worstSearch ${formatGenerationDuration(entry.slowestRouteSearch.durationMs)}/${entry.slowestRouteSearch.expansions}exp`
            : "";
          const topStages = [...(entry.stages || [])]
            .filter((stage) => Number.isFinite(stage.ms) && stage.ms >= 25)
            .sort((left, right) => right.ms - left.ms)
            .slice(0, 3)
            .map((stage) => `${stage.stage} ${formatGenerationDuration(stage.ms)}`)
            .join(" | ");
          return `  attempt ${range}: ${formatGenerationDuration(entry.elapsedMs)}, ${entry.outcome}, routeSearches ${entry.routeSearches}, expansions ${entry.routeExpansions}, routeSearch ${formatGenerationDuration(entry.routeSearchMs)}${slowest}${topStages ? `, topStages ${topStages}` : ""}, reason ${entry.reason}`;
        })
      ]
      : []),
    `Board count: ${scenario.boardCount}`,
    `Overlays requested: ${formatOverlayMode(scenario.preferences.overlayMode)}`,
    `Boards: ${scenario.mainBoardIds.map((pieceId, index) => `${pieceId}@${scenario.mainRotations[index]}`).join(", ")}`,
    `Flags: ${scenario.checkpoints.map((flag, index) => `${scenario.virtualBots && index === 0 ? "#0" : `#${scenario.virtualBots ? index : index + 1}`}(${flag.x},${flag.y})${scenario.virtualBots && index === 0 && flag.facing ? `/${flag.facing}` : ""}`).join(", ")}`,
    scenario.rebootTokens?.length
      ? `Reboot tokens: ${scenario.rebootTokens.map((token) => `${token.pieceId}(${token.x},${token.y},${token.dir})`).join(", ")}`
      : "Reboot tokens: none",
    scenario.dockSummaries?.length
      ? `Docks: ${scenario.dockSummaries.map((dock, index) => `${index + 1}:${dock.pieceId}:${dock.boundaryRun?.side ?? "n/a"}:${dock.flipped ? "flipped" : "normal"}`).join(", ")}`
      : "Docks: none",
    `Showing leg: ${selectedLegIndex === null ? "All legs" : legOptions[selectedLegIndex]}`,
    `Goal flag: ${selectedLegIndex === null ? "all checkpoints" : `(${goal.x}, ${goal.y})`}`,
    `Usable starts: ${scenario.metrics.usableStarts.length}/${scenario.sequence.starts.length}`,
    `Difficulty raw: ${scenario.metrics.difficultyRaw}`,
    `Length raw: ${scenario.metrics.lengthRaw}`,
    `Length inputs: flags ${scenario.metrics.lengthMetrics.inputs.flagCount}, players ${scenario.metrics.lengthMetrics.inputs.playerCount}, actionScore ${scenario.metrics.lengthMetrics.inputs.totalActionLoad}, distanceScore ${scenario.metrics.lengthMetrics.inputs.totalRouteDistance}, congestion ${scenario.metrics.lengthMetrics.inputs.totalCongestion}, flagArea ${scenario.metrics.lengthMetrics.inputs.flagAreaScore}, totalDifficulty ${scenario.metrics.lengthMetrics.inputs.totalDifficulty}`,
    `Length contributions: flags ${scenario.metrics.lengthMetrics.contributions.checkpointLoad}, players ${scenario.metrics.lengthMetrics.contributions.playerLoad}, actions ${scenario.metrics.lengthMetrics.contributions.actionLoad}, distance ${scenario.metrics.lengthMetrics.contributions.distanceLoad}, congestion ${scenario.metrics.lengthMetrics.contributions.congestionLoad} (weight ${scenario.metrics.lengthMetrics.contributions.congestionWeight}; harshness ${scenario.metrics.lengthMetrics.contributions.boardHarshness}), flagArea ${scenario.metrics.lengthMetrics.contributions.flagAreaLoad}, difficulty ${scenario.metrics.lengthMetrics.contributions.difficultyLoad}, moving-targets ${scenario.metrics.lengthMetrics.contributions.movingTargetLoad}, act-fast ${scenario.metrics.lengthMetrics.contributions.actFastLoad}`,
    `Moving target profile: active ${scenario.movingTargetStats?.activeCount ?? 0}, pathTiles ${scenario.movingTargetStats?.totalPathLength ?? 0}, uniqueCoverage ${scenario.movingTargetStats?.coverageTiles ?? 0}, turns ${scenario.movingTargetStats?.totalTurns ?? 0}, fastSegments ${scenario.movingTargetStats?.fastSegments ?? 0}, difficultyBonus ${scenario.movingTargetStats?.difficultyBonus ?? 0}, lengthBonus ${scenario.movingTargetStats?.lengthBonus ?? 0}`,
    `Moving target volatility penalty: ${scenario.metrics.movingTargetVolatilityPenalty ?? 0}`,
    scenario.metrics.finalLegAnticlimax?.active
      ? `Final leg anticlimax penalty: ${scenario.metrics.finalLegAnticlimax.penalty} (fastest expected route ${scenario.metrics.finalLegAnticlimax.fastestActions} registers)`
      : "Final leg anticlimax penalty: none",
    scenario.metrics.routeDrama
      ? `Route drama: ${scenario.metrics.routeDrama.level}, score ${scenario.metrics.routeDrama.score}, penalty ${scenario.metrics.routeDrama.penalty}, sharedTiles ${scenario.metrics.routeDrama.sharedTiles}, crossings ${scenario.metrics.routeDrama.crossings}, reverseEdges ${scenario.metrics.routeDrama.reverseEdges}`
      : "Route drama: n/a",    scenario.metrics.competitiveBlockImpact
      ? `Competitive balance simulation: blocked ${scenario.metrics.competitiveBlockImpact.blockedStartCount} [${scenario.metrics.competitiveBlockImpact.blockedIndices.join(", ")}], remaining ${scenario.metrics.competitiveBlockImpact.remainingStartCount}, selected ${scenario.metrics.competitiveBlockImpact.selectedStartCount ?? "n/a"} [${(scenario.metrics.competitiveBlockImpact.selectedIndices ?? []).join(", ")}], outliers ${scenario.metrics.competitiveBlockImpact.remainingOutlierCount}, scoreRange ${scenario.metrics.competitiveBlockImpact.scoreRange}, actionRange ${scenario.metrics.competitiveBlockImpact.actionRange}, worstZ ${scenario.metrics.competitiveBlockImpact.worstScoreZ}/${scenario.metrics.competitiveBlockImpact.worstActionZ}, acceptable ${scenario.metrics.competitiveBlockImpact.acceptable ? "yes" : "no"}, method ${scenario.metrics.competitiveBlockImpact.method}, trafficSubsets ${scenario.metrics.competitiveBlockImpact.trafficSubsetsTested ?? 0}`
      : "Competitive balance simulation: n/a",
    summary.payToWin?.active
      ? `Pay to Win costs: startingEnergy ${summary.payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY}, denialCost ${summary.payToWin.denialCost ?? ((summary.payToWin.startingEnergy ?? DEFAULT_STARTING_ENERGY) + 1)}, priced ${summary.payToWin.pricedStartCount ?? "n/a"}, unit ${summary.payToWin.costUnit}, lateUnit ${summary.payToWin.lateCostUnit ?? summary.payToWin.costUnit}, trafficScale ${summary.payToWin.trafficScaleMultiplier}, latePlayers ${summary.payToWin.lateSelectorStart ?? "n/a"}-${summary.payToWin.lateSelectorEnd ?? "n/a"}, surplusStarts ${summary.payToWin.surplusStarts ?? 0}, lateModel ${summary.payToWin.lateTrafficModel ?? "n/a"}, lateSamples ${summary.payToWin.lateScenarioSamples ?? 0}, earlyUnavailable ${summary.payToWin.earlyUnavailableCount ?? 0}/${summary.payToWin.maxEarlyUnavailable ?? 0}, lateUnavailable ${summary.payToWin.lateUnavailableCount ?? 0}/${summary.payToWin.maxLateUnavailable ?? 0}, fullyUnavailable ${summary.payToWin.fullyUnavailableCount ?? 0}, availabilityValid ${summary.payToWin.availabilityValid === false ? "no" : "yes"}, lateHigher ${summary.payToWin.latePriceHigherCount ?? 0}, lateLower ${summary.payToWin.latePriceLowerCount ?? 0}, slashPrices ${summary.payToWin.hasLatePriceDifference ? "yes" : "no"}, pruned ${summary.payToWin.pruned.length ? summary.payToWin.pruned.map((item) => `#${item.index + 1}(${item.energyCost}E; pass ${item.pass})`).join(", ") : "none"}`
      : "Pay to Win costs: n/a",
    summary.normalStartBalance?.active
      ? `Normal start balance: ${summary.normalStartBalance.iterative ? "iterative" : (summary.normalStartBalance.staged ? "staged" : "legacy")}, intrinsicPrePrune ${summary.normalStartBalance.intrinsicPrePruning ? "yes" : "no"}, lightweightPruned ${(summary.normalStartBalance.lightweightPruned ?? []).length ? (summary.normalStartBalance.lightweightPruned ?? []).map((index) => `#${index + 1}`).join(", ") : "none"}, pressurePruned ${(summary.normalStartBalance.pressurePruned ?? []).length ? (summary.normalStartBalance.pressurePruned ?? []).map((item) => `#${item.index + 1}(${item.diagnostics?.balanceDispersionPruned ? "balance; " : ""}scoreZ ${item.diagnostics?.scoreZ ?? "n/a"}; actionZ ${item.diagnostics?.actionZ ?? "n/a"}; pass ${item.pass ?? "n/a"})`).join(", ") : "none"}, stddev ${summary.normalStartBalance.balanceStdDevBefore ?? "n/a"}->${summary.normalStartBalance.balanceStdDevAfter ?? "n/a"}/${summary.normalStartBalance.balanceStdDevLimit ?? NORMAL_START_FAIRNESS_STDDEV_LIMIT}, trafficRecomputations ${summary.normalStartBalance.trafficRecomputations ?? 0}, remainingBad ${(summary.normalStartBalance.remainingBadStarts ?? []).length}, reject ${summary.normalStartBalance.reject ? "yes" : "no"}`
      : "Normal start balance: n/a",
    scenario.movingTargetReentryMarkers?.length
      ? `Moving target re-entry: ${scenario.movingTargetReentryMarkers.map((marker) => `${marker.label}(${marker.x},${marker.y})`).join(", ")}`
      : "Moving target re-entry: none",
    movingTargetHitLines.length
      ? `Moving target hits: ${movingTargetHitLines.join("; ")}`
      : "Moving target hits: none",
    `Fairness stddev: ${scenario.metrics.fairnessStdDev}`,
    `Course difficulty score: ${summary.difficultyScore}`,
    `Course length score: ${summary.lengthScore}`,
    `Course action score: ${summary.actionScore}`,
    `Flag area score: ${summary.flagAreaScore}`,
    `Average traffic penalty: ${summary.averageTrafficPenalty}`,
    `Average overlap penalty: ${summary.averageOverlapPenalty ?? 0}`,
    `Average lateral threat: ${summary.averageLateralThreat ?? 0}`,
    `Average rear threat: ${summary.averageRearThreat ?? 0}`,
    summary.courseContinuationWeighted
      ? `Start full-course continuation: mean ${summary.courseContinuationMean}, weighted into start scores`
      : "Start full-course continuation: n/a",
    summary.fullCourseTraffic
      ? `Full-course route pressure: passes ${summary.fullCourseTraffic.passes}, switches ${summary.fullCourseTraffic.routeSwitches}, avgPenalty ${summary.fullCourseTraffic.averagePenalty}`
      : "Full-course route pressure: n/a",
    summary.contextualLegCache
      ? `Contextual leg cache: exactEntries ${summary.contextualLegCache.entries ?? 0}, templateEntries ${summary.contextualLegCache.templateEntries ?? 0}, exactHits ${summary.contextualLegCache.exactHits ?? 0}, templateHits ${summary.contextualLegCache.templateHits ?? 0}, misses ${summary.contextualLegCache.misses ?? 0}, templateFallbacks ${summary.contextualLegCache.templateFallbacks ?? 0}, cappedContexts ${summary.contextualLegCache.zeroRouteCapFailures ?? 0} across ${summary.contextualLegCache.zeroRouteFailureStarts ?? 0} starts, survivors ${summary.contextualLegCache.survivingStarts ?? "n/a"}/${summary.contextualLegCache.requiredSurvivingStarts ?? "n/a"}`
      : "Contextual leg cache: n/a",
    `Route overlap score: ${summary.overlapScore}`,
    `Fairness score: ${summary.fairnessScore}`,
    `Overall course score: ${summary.overallScore}`,
    `Sequence total difficulty: ${scenario.sequence.summary.totalDifficulty}`,
    `Sequence total length: ${scenario.sequence.summary.totalLength}`,
    summary.outliers.length
      ? `Pruned starts: ${summary.outliers.map((item) => `#${item.index + 1} (${item.delta > 0 ? "+" : ""}${item.delta}; ${formatOutlierReasons(item.reasons)})`).join(", ")}`
      : "Pruned starts: none",
    summary.outliers.length
      ? "Pruned adjusted scores are pass-context estimates from the pruning pass where the start was dropped; compare final adjusted scores only between usable starts."
      : "",
    "",
    "Leg summaries:",
    ...scenario.sequence.legs.map((leg) => {
      if (leg.analysis.summary.difficultyScore !== undefined) {
        return `Leg ${leg.from} -> ${leg.to}: difficulty ${leg.analysis.summary.difficultyScore}, length ${leg.analysis.summary.lengthScore}`;
      }

      return leg.analysis.summary.expectedRobotPaths
        ? `Leg ${leg.from} -> ${leg.to}: expectedPaths ${leg.analysis.summary.expectedRouteCount}, avgScore ${leg.analysis.summary.averageRouteScore}, avgLength ${leg.analysis.summary.averageRouteDistance}, congestion ${leg.analysis.summary.congestionScore}, backtrack ${leg.analysis.summary.crossLegOverlap}`
        : `Leg ${leg.from} -> ${leg.to}: routes ${leg.analysis.summary.routeCount}, distinct ${leg.analysis.summary.distinctRouteCount}, avgScore ${leg.analysis.summary.averageRouteScore}, avgLength ${leg.analysis.summary.averageRouteDistance}, diversity ${leg.analysis.summary.diversityScore}, congestion ${leg.analysis.summary.congestionScore}, backtrack ${leg.analysis.summary.crossLegOverlap}`;
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
    const adjustedLabel = usable === "outlier" ? "outlierEstimate" : "finalAdjusted";
    const formattedEnergyCost = scenario.payToWin ? formatPayToWinEnergyCost(startAnalysis) : null;
    const energyCost = formattedEnergyCost !== null
      ? ` energy ${formattedEnergyCost}${Number.isFinite(startAnalysis.lateAdjustedScore) ? ` lateAdjusted ${startAnalysis.lateAdjustedScore}` : ""}`
      : "";
    const courseEstimate = startAnalysis.courseEstimate
      ? ` courseAdj ${startAnalysis.courseScoreAdjustment ?? 0} courseScore ${startAnalysis.courseEstimate.totalScore} courseActions ${startAnalysis.courseEstimate.totalActions} courseTraffic ${startAnalysis.courseEstimate.fullCourseTrafficPenalty ?? 0} courseRoute ${(startAnalysis.courseEstimate.selectedRouteIndex ?? 0) + 1}/${startAnalysis.courseEstimate.candidateCount ?? 1}`
      : "";
    lines.push(
      `Start #${startAnalysis.index + 1} ${usable} at (${startAnalysis.start.x}, ${startAnalysis.start.y}) route ${startAnalysis.selectedRouteIndex + 1}/${startAnalysis.routes.length} ${adjustedLabel} ${startAnalysis.adjustedScore}${energyCost}${courseEstimate} raw ${selected.score} traffic ${startAnalysis.trafficPenalty} ranged ${startAnalysis.trafficRanged ?? startAnalysis.rearThreat ?? 0} nearby ${startAnalysis.trafficNearby ?? startAnalysis.lateralThreat ?? 0} competition ${startAnalysis.trafficCompetition ?? startAnalysis.overlapPenalty ?? 0} occupancy-scale ${startAnalysis.trafficScale ?? 0} distance ${selected.distance} actions ${selected.actions} forced ${selected.forcedDistance} hazard ${selected.hazard}${selected.movingTarget ? ` hit flag ${selected.movingTarget.checkpointId} space ${selected.movingTarget.space ?? "?"}` : ""}${outlierReason}`
    );
  }

  return lines.map(roundCourseEvaluationNumbers).join("\n");
}

let generationOverlayState = {
  attempt: 1,
  stage: "",
  preferences: null
};

function getGenerationUserFacingState(stage = "", attempt = 1) {
  const raw = String(stage || "").toLowerCase();

  if (raw.includes("competitive")) {
    return {
      heading: "Evaluating competitive starts",
      activity: "Comparing a larger starting pool so players can block and choose starts strategically."
    };
  }

  if (
    raw.includes("another course") ||
    raw.includes("another checkpoint") ||
    raw.includes("no exact fit")
  ) {
    return {
      heading: "Trying another course",
      activity: "The previous layout did not meet the course checks, so the app is trying another setup."
    };
  }

  if (
    raw.includes("loading") ||
    raw.includes("setting up") ||
    raw.includes("choosing checkpoint") ||
    raw.includes("building") ||
    raw.includes("layout")
  ) {
    return {
      heading: "Building the course",
      activity: "Placing boards, checkpoints, and setup elements."
    };
  }

  if (
    raw.includes("routing") ||
    raw.includes("route") ||
    raw.includes("starting spaces") ||
    raw.includes("contextual")
  ) {
    return {
      heading: "Finding good routes",
      activity: "Exploring different ways through the course from the available starts."
    };
  }

  if (
    raw.includes("fairness") ||
    raw.includes("balanc") ||
    raw.includes("competitive") ||
    raw.includes("traffic")
  ) {
    return {
      heading: "Balancing the starts",
      activity: "Comparing route interactions and checking that the starting choices are reasonable."
    };
  }

  if (
    raw.includes("pricing") ||
    raw.includes("pay to win") ||
    raw.includes("finishing") ||
    raw.includes("candidate complete")
  ) {
    return {
      heading: "Finishing up",
      activity: "Checking the final course details and optional-rule effects."
    };
  }

  return {
    heading: "Generating Course",
    activity: "Trying a course setup and checking that it works."
  };
}

function setGeneratingOverlay(visible, text = "", details = {}) {
  const overlay = document.getElementById("generating-overlay");
  if (!overlay) return;

  overlay.classList.toggle("visible", visible);
  if (!visible) {
    return;
  }

  generationOverlayState = {
    ...generationOverlayState,
    ...details
  };

  const attempt = details.attempt ?? generationOverlayState.attempt ?? 1;
  const stage = details.stage ?? generationOverlayState.stage ?? text;
  const userState = getGenerationUserFacingState(stage, attempt);

  const headingEl = document.getElementById("overlay-heading");
  const attemptEl = document.getElementById("overlay-attempt");
  const activityEl = document.getElementById("overlay-text");
  const hintEl = document.getElementById("overlay-hint");

  if (headingEl) {
    headingEl.textContent = userState.heading;
  }
  if (attemptEl) {
    attemptEl.textContent = `Course attempt ${Math.max(1, attempt)}`;
  }
  if (activityEl) {
    activityEl.textContent = userState.activity;
  }
  if (hintEl) {
    const preferences = details.preferences ?? generationOverlayState.preferences ?? {};
    const hint = getGenerationConstraintHint(preferences);
    hintEl.textContent = hint;
    hintEl.classList.toggle("hidden", !hint);
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

function isOutlierRoutesEnabled() {
  return document.getElementById("show-outlier-routes")?.checked ?? false;
}


function getLegRouteEntries(scenario, legIndex, options = {}) {
  const leg = scenario?.sequence?.legs?.[legIndex];
  if (!leg) {
    return [];
  }

  if (legIndex === 0) {
    const outlierInfoByIndex = new Map((scenario.sequence.firstLeg.summary.outliers || []).map((item) => [item.index, item]));
    return leg.analysis.starts
      .filter((startAnalysis) => startAnalysis.routes?.length && startAnalysis.selectedRoute)
      .filter((startAnalysis) => options.includeOutliers || !outlierInfoByIndex.has(startAnalysis.index))
      .map((startAnalysis) => ({
        id: `start:${startAnalysis.index}`,
        label: `Start ${startAnalysis.index + 1}`,
        route: startAnalysis.selectedRoute,
        startAnalysis,
        outlierInfo: outlierInfoByIndex.get(startAnalysis.index) ?? null
      }));
  }

  return (leg.analysis.distinctRoutes || []).map((route, index) => ({
    id: `route:${index}`,
    label: Number.isFinite(route.startIndex) ? `Start ${route.startIndex + 1}` : `Route ${index + 1}`,
    route,
    routeIndex: index
  }));
}

function getFocusedRouteEntry(scenario, legIndex) {
  if (routeInspectionState.kind !== "start") return null;
  const startIndex = Number(routeInspectionState.key);
  const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
  const fullRoute = startAnalysis?.fullCourseRoute;
  if (!fullRoute) return null;
  const route = legIndex === null ? fullRoute : fullRoute.legRoutes?.[legIndex];
  if (!route) return null;
  return {
    id: `start:${startIndex}`,
    label: legIndex === null
      ? `Start ${startIndex + 1} — all legs`
      : `Start ${startIndex + 1} — ${formatLegLabel(scenario.sequence.legs[legIndex])}`,
    route,
    startAnalysis
  };
}

function formatRouteActions(route) {
  const actions = (route?.transitions || []).map((transition) => transition.action).filter(Boolean);
  return actions.length ? actions.join(" -> ") : "none";
}

function formatTraceState(state) {
  if (!state) return "";
  return `(${state.x},${state.y})${state.facing ? ` ${state.facing}` : ""}`;
}

function formatBoardTraceEvent(event) {
  if (!event) return null;
  if (event.type === "conveyor") {
    const facing = event.facingBefore && event.facingAfter && event.facingBefore !== event.facingAfter
      ? `; facing ${event.facingBefore}→${event.facingAfter}`
      : "";
    return `conveyor ${event.dir}${event.speed === 2 ? "×2" : ""} ${formatTraceState(event.from)}→${formatTraceState(event.to)}${facing}`;
  }
  if (event.type === "oil") return `oil slide ${event.dir} ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "pusher") return `pusher ${formatTraceState(event.from)}→${formatTraceState(event.to)}`;
  if (event.type === "gear") return `gear at (${event.at.x},${event.at.y}); facing ${event.facingBefore}→${event.facingAfter}`;
  return null;
}

function formatChronologicalRouteTrace(route) {
  if (!route?.transitions?.length) return ["Trace: none"];

  const startAction = route.absoluteStartAction ?? 0;
  const checkpointHits = Array.isArray(route.checkpointHits)
    ? route.checkpointHits
    : route.checkpointHit ? [route.checkpointHit] : [];
  const hitsByAction = new Map();
  checkpointHits.forEach((hit) => {
    const absoluteAction = hit.action ?? route.absoluteActions;
    if (!Number.isFinite(absoluteAction)) return;
    const items = hitsByAction.get(absoluteAction) ?? [];
    items.push(hit);
    hitsByAction.set(absoluteAction, items);
  });

  return route.transitions.map((transition, index) => {
    const registerNumber = startAction + index + 1;
    const pieces = [
      `${registerNumber}. ${transition.action}`,
      `${formatTraceState(transition.from)}→${formatTraceState(transition.to)}`
    ];
    const boardParts = (transition.boardEvents || []).map(formatBoardTraceEvent).filter(Boolean);
    if (boardParts.length) pieces.push(boardParts.join("; "));
    else if ((transition.conveyorSteps || []).length) {
      pieces.push(transition.conveyorSteps
        .map((step) => formatBoardTraceEvent({ type: "conveyor", ...step }))
        .join("; "));
    } else if (transition.gearTurned) {
      pieces.push("gear turn");
    }

    const hits = hitsByAction.get(registerNumber) ?? [];
    if (hits.length) pieces.push(hits.map((hit) => `FLAG ${hit.checkpointId ?? hit.checkpointIndex + 1}`).join(", "));
    return pieces.join(" → ");
  });
}

function formatRouteDetail(scenario, entry) {
  const route = entry?.route;
  if (!route) {
    return [];
  }

  const lines = [
    `${entry.label}: ${route.actions} register${route.actions === 1 ? "" : "s"}, distance ${route.distance}, forced ${route.forcedDistance}, raw score ${route.score}`,
    ...formatChronologicalRouteTrace(route)
  ];

  if (route.hazard || route.rebootCount || route.conveyorComplexity) {
    lines.push(`Pressure: hazard ${route.hazard}, conveyor ${route.conveyorComplexity}, reboots ${route.rebootCount}`);
  }

  if (route.movingTarget?.space && route.hitTarget) {
    lines.push(`Moving target: flag ${route.movingTarget.checkpointId} space ${route.movingTarget.space} at (${route.hitTarget.x}, ${route.hitTarget.y})`);
  }

  if (entry.startAnalysis) {
    const startStatus = entry.outlierInfo ? "outlier" : "usable";
    const trafficPenalty = entry.startAnalysis.trafficPenalty ?? 0;
    const adjustedLabel = entry.outlierInfo ? "Outlier pass estimate" : "Final adjusted score";
    lines.push(`${adjustedLabel}: ${entry.startAnalysis.adjustedScore} (${startStatus}; raw ${route.score} + traffic ${trafficPenalty})`);
    if (entry.startAnalysis.energyCost !== null && entry.startAnalysis.energyCost !== undefined) {
      const formattedCost = formatPayToWinEnergyCost(entry.startAnalysis);
      const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
      if (payToWinPricing?.hasLatePriceDifference && formattedCost?.includes("/")) {
        const fallbackLatePlayerCount = Math.ceil(scenario.playerCount / 3);
        const firstLatePlayer = payToWinPricing.lateSelectorStart
          ?? (scenario.playerCount - fallbackLatePlayerCount + 1);
        const lastLatePlayer = payToWinPricing.lateSelectorEnd ?? scenario.playerCount;
        const singleLatePlayer = firstLatePlayer === lastLatePlayer;
        const latePlayerText = singleLatePlayer
          ? `player ${firstLatePlayer}`
          : `players ${firstLatePlayer}–${lastLatePlayer}`;
        if (entry.startAnalysis.earlyUnavailable && entry.startAnalysis.lateUnavailable) {
          lines.push(`Pay to Win: unavailable to both earlier selectors and ${latePlayerText}`);
        } else if (entry.startAnalysis.earlyUnavailable) {
          lines.push(`Pay to Win: unavailable to earlier selectors; costs ${entry.startAnalysis.lateEnergyCost} starting energy for ${latePlayerText}`);
        } else if (entry.startAnalysis.lateUnavailable) {
          lines.push(`Pay to Win: costs ${entry.startAnalysis.energyCost} starting energy for earlier selectors; unavailable to ${latePlayerText}`);
        } else {
          lines.push(`Pay to Win: costs ${formattedCost} starting energy; ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second cost`);
        }
      } else {
        lines.push(`Pay to Win: costs ${formattedCost} starting energy`);
      }
    }
    if (entry.startAnalysis.courseEstimate) {
      lines.push(`Full-course estimate: ${entry.startAnalysis.courseEstimate.totalActions} registers, score ${entry.startAnalysis.courseEstimate.totalScore}, adjustment ${entry.startAnalysis.courseScoreAdjustment ?? 0}`);
      lines.push(`Full-course route pressure: candidate ${(entry.startAnalysis.courseEstimate.selectedRouteIndex ?? 0) + 1}/${entry.startAnalysis.courseEstimate.candidateCount ?? 1}, penalty ${entry.startAnalysis.courseEstimate.fullCourseTrafficPenalty ?? 0}`);
      lines.push("Map route: selected start's expected path through all checkpoints");
    }
    lines.push(`Traffic: ranged ${entry.startAnalysis.trafficRanged ?? entry.startAnalysis.rearThreat ?? 0}, nearby ${entry.startAnalysis.trafficNearby ?? entry.startAnalysis.lateralThreat ?? 0}, route competition ${entry.startAnalysis.trafficCompetition ?? entry.startAnalysis.overlapPenalty ?? 0}`);
    if (entry.outlierInfo) {
      lines.push(`Not comparable with final usable-start adjusted scores; this was measured in the pruning pass where it dropped.`);
      lines.push(`Outlier delta: score ${entry.outlierInfo.delta}, actions ${entry.outlierInfo.actionDelta}`);
    }
  }

  return lines;
}

function getCheckpointInspectionLines(scenario, checkpointIndex) {
  const checkpoint = scenario.checkpoints[checkpointIndex];
  if (!checkpoint) {
    return [];
  }

  const incomingLeg = scenario.sequence.legs[checkpointIndex];
  const areaScore = scoreFlagArea(scenario.goalTileMap, checkpoint, {
    playerCount: scenario.playerCount,
    ...getRouteAnalysisVariantOptions(scenario.preferences)
  });
  const lines = [
    `Checkpoint ${checkpointIndex + 1}: (${checkpoint.x}, ${checkpoint.y})`,
    `Incoming leg: ${incomingLeg ? formatLegLabel(incomingLeg) : "n/a"}`,
    `Area risk: ${areaScore}`
  ];

  if (incomingLeg?.analysis?.summary) {
    const summary = incomingLeg.analysis.summary;
    if (summary.difficultyScore !== undefined) {
      lines.push(`Route profile: difficulty ${summary.difficultyScore}, length ${summary.lengthScore}, traffic ${summary.averageTrafficPenalty}`);
      const incomingStarts = scenario.sequence.firstLeg.starts
        .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.selectedRoute)
        .map((startAnalysis) => ({
          startIndex: startAnalysis.index,
          actions: startAnalysis.selectedRoute.actions,
          score: startAnalysis.selectedRoute.score
        }));
      if (incomingStarts.length) {
        const fastest = [...incomingStarts].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingStarts].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingStarts].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingStarts.length}, fastest Start ${fastest.startIndex + 1} (${fastest.actions} registers), slowest Start ${slowest.startIndex + 1} (${slowest.actions}), hardest Start ${hardest.startIndex + 1} (score ${hardest.score})`);
      }
    } else {
      lines.push(summary.expectedRobotPaths
        ? `Route profile: ${summary.expectedRouteCount} expected robot paths, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`
        : `Route profile: ${summary.distinctRouteCount} distinct routes, average length ${summary.averageRouteDistance}, congestion ${summary.congestionScore}`);
      const incomingRoutes = incomingLeg.analysis.distinctRoutes || [];
      if (summary.expectedRobotPaths && incomingRoutes.length) {
        const fastest = [...incomingRoutes].sort((left, right) => left.actions - right.actions || left.score - right.score)[0];
        const slowest = [...incomingRoutes].sort((left, right) => right.actions - left.actions || right.score - left.score)[0];
        const hardest = [...incomingRoutes].sort((left, right) => right.score - left.score || right.actions - left.actions)[0];
        lines.push(`Expected incoming starts: ${incomingRoutes.length}, fastest Start ${(fastest.startIndex ?? 0) + 1} (${fastest.actions} registers), slowest Start ${(slowest.startIndex ?? 0) + 1} (${slowest.actions}), hardest Start ${(hardest.startIndex ?? 0) + 1} (score ${hardest.score})`);
      }
    }
  }

  const timeline = scenario.movingTargetTimelines?.[checkpointIndex];
  if (timeline?.positions?.length > 1) {
    lines.push(`Moving target: re-entry (${timeline.reentry.x}, ${timeline.reentry.y}), ${timeline.displayPositions?.length ?? timeline.positions.length} path spaces`);
  }

  return lines;
}

function updateInspectionDetail(scenario, selectedLegIndex) {
  const detailEl = document.getElementById("inspection-detail");
  if (!detailEl) {
    return;
  }

  const visible = Boolean(scenario && isDevViewEnabled() && routeInspectionState.kind);
  detailEl.classList.toggle("hidden", !visible);
  detailEl.replaceChildren();
  if (!visible) {
    return;
  }

  const focused = getFocusedRouteEntry(scenario, selectedLegIndex);
  const lines = routeInspectionState.kind === "start" && focused
    ? formatRouteDetail(scenario, focused)
    : routeInspectionState.kind === "checkpoint"
      ? getCheckpointInspectionLines(scenario, Number(routeInspectionState.key))
      : [];

  lines.forEach((line, index) => {
    const row = document.createElement("div");
    if (index === 0) {
      const strong = document.createElement("strong");
      strong.textContent = line;
      row.append(strong);
    } else {
      row.textContent = line;
    }
    detailEl.append(row);
  });
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
  document.getElementById("outlier-routes-toggle-label")?.classList.toggle("hidden", !enabled);
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


function getCanvasTileFromEvent(event) {
  const canvas = document.getElementById("canvas");
  const state = canvas?.__roborallyRenderState;
  if (!canvas || !state) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const tileX = Math.floor((canvasX - state.margin) / state.tileSize) + state.bounds.minX;
  const tileY = Math.floor((canvasY - state.margin) / state.tileSize) + state.bounds.minY;

  if (tileX < state.bounds.minX || tileX > state.bounds.maxX || tileY < state.bounds.minY || tileY > state.bounds.maxY) {
    return null;
  }

  return { x: tileX, y: tileY };
}

function getInspectableAtTile(scenario, tile) {
  if (!scenario || !tile) {
    return null;
  }

  const startAnalysis = scenario.sequence.firstLeg.starts.find((analysis) => (
    analysis.start.x === tile.x && analysis.start.y === tile.y
  ));
  if (startAnalysis) {
    return {
      kind: "start",
      key: String(startAnalysis.index)
    };
  }

  const checkpointIndex = scenario.checkpoints.findIndex((checkpoint) => (
    checkpoint.x === tile.x && checkpoint.y === tile.y
  ));
  if (checkpointIndex >= 0) {
    return {
      kind: "checkpoint",
      key: String(checkpointIndex)
    };
  }

  return null;
}

function sameInspection(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.key === right.key);
}

function clearRouteInspection() {
  routeInspectionState = { kind: null, key: null };
}

function getTraceableStartIndices(scenario) {
  return scenario.sequence.firstLeg.starts
    .filter((entry) => entry.reachable && entry.fullCourseRoute)
    .map((entry) => entry.index);
}

function toggleTraceStart(startIndex) {
  const next = new Set(traceSelectionState.startIndices);
  if (next.has(startIndex)) next.delete(startIndex);
  else next.add(startIndex);
  traceSelectionState = { startIndices: next };
}

function selectAllTraceStarts(scenario) {
  traceSelectionState = { startIndices: new Set(getTraceableStartIndices(scenario)) };
}

function clearTraceStarts() {
  traceSelectionState = { startIndices: new Set() };
}

function applyRouteInspection(inspection) {
  if (!inspection) {
    clearRouteInspection();
    return;
  }
  if (inspection.kind === "start") {
    const startIndex = Number(inspection.key);
    toggleTraceStart(startIndex);
    routeInspectionState = { kind: "start", key: String(startIndex) };
    return;
  }
  routeInspectionState = sameInspection(routeInspectionState, inspection)
    ? { kind: null, key: null }
    : inspection;
}

function getSelectedTraceRoutes(scenario, selectedLegIndex) {
  const routes = [];
  for (const startIndex of traceSelectionState.startIndices) {
    const startAnalysis = scenario.sequence.firstLeg.starts.find((entry) => entry.index === startIndex);
    const fullRoute = startAnalysis?.fullCourseRoute;
    if (!fullRoute) continue;
    const route = selectedLegIndex === null ? fullRoute : fullRoute.legRoutes?.[selectedLegIndex];
    if (!route) continue;
    routes.push({ ...route, startIndex, traceIndex: startIndex });
  }
  return routes;
}

function tileTouchesVisibleTrace(scenario, tile, selectedLegIndex) {
  if (!tile) return false;
  return getSelectedTraceRoutes(scenario, selectedLegIndex).some((route) =>
    (route.path || []).some((point) => point.x === tile.x && point.y === tile.y)
  );
}


function getFullCourseStartRenderAnalysis(firstLeg, starts) {
  return {
    ...firstLeg,
    starts: starts.map((startAnalysis) => ({
      ...startAnalysis,
      selectedRoute: startAnalysis.fullCourseRoute ?? startAnalysis.selectedRoute
    }))
  };
}

function getScenarioRenderState(scenario) {
  const legSelect = document.getElementById("leg-select");
  const devViewEnabled = isDevViewEnabled();
  const selectedLegValue = devViewEnabled ? (legSelect?.value ?? "all") : "all";
  const selectedLegIndex = selectedLegValue === "all" ? null : Number(selectedLegValue);
  const playableCheckpoints = getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots);
  const goal = selectedLegIndex === null
    ? playableCheckpoints.at(-1) ?? playableCheckpoints[0]
    : playableCheckpoints[selectedLegIndex] ?? playableCheckpoints[0];
  const renderAnalysis = devViewEnabled ? { routes: getSelectedTraceRoutes(scenario, selectedLegIndex) } : null;
  const boardViewMode = getBoardViewMode();
  const iconBoardView = boardViewMode === BOARD_VIEW_MODES.icons;
  const unusableStartIndices = scenario.sequence.firstLeg.starts
    .filter((startAnalysis) => !scenario.metrics.usableStarts.some((item) => item.index === startAnalysis.index))
    .map((startAnalysis) => startAnalysis.index);
  const startNumberByKey = scenario.competitiveMode
    ? new Map(scenario.activeStarts.map((start, index) => [
      `${start.x},${start.y}`, index + 1
    ]))
    : new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
      `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.index + 1
    ]));
  const energyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.energyCost
  ]));
  const lateEnergyCostByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateEnergyCost
  ]));
  const earlyUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.earlyUnavailable ?? false
  ]));
  const lateUnavailableByKey = new Map(scenario.sequence.firstLeg.starts.map((startAnalysis) => [
    `${startAnalysis.start.x},${startAnalysis.start.y}`, startAnalysis.lateUnavailable ?? false
  ]));
  const selectedStartKeys = new Set(
    scenario.sequence.firstLeg.starts
      .filter((startAnalysis) => traceSelectionState.startIndices.has(startAnalysis.index))
      .map((startAnalysis) => `${startAnalysis.start.x},${startAnalysis.start.y}`)
  );
  const startLabels = devViewEnabled
    ? scenario.activeStarts.map((start) => startNumberByKey.get(`${start.x},${start.y}`) ?? "")
    : [];
  const selectedStartIndices = devViewEnabled
    ? scenario.activeStarts
      .map((start, index) => selectedStartKeys.has(`${start.x},${start.y}`) ? index : null)
      .filter((index) => index !== null)
    : [];
  const startEnergyCosts = scenario.payToWin
    ? scenario.activeStarts.map((start) => energyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startLateEnergyCosts = scenario.payToWin
    ? scenario.activeStarts.map((start) => lateEnergyCostByKey.get(`${start.x},${start.y}`))
    : [];
  const startEarlyUnavailable = scenario.payToWin
    ? scenario.activeStarts.map((start) => earlyUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];
  const startLateUnavailable = scenario.payToWin
    ? scenario.activeStarts.map((start) => lateUnavailableByKey.get(`${start.x},${start.y}`) ?? false)
    : [];

  return {
    devViewEnabled, goal, iconBoardView, renderAnalysis, selectedLegIndex,
    startLabels, selectedStartIndices, startEnergyCosts, startLateEnergyCosts,
    startEarlyUnavailable, startLateUnavailable, unusableStartIndices
  };
}

function drawScenarioCanvas(scenario, options = {}) {
  if (!options.skipBlankCheck) {
    lastRenderDiagnostics.blankFallbackTriggered = false;
  }
  const {
    devViewEnabled,
    goal,
    iconBoardView,
    renderAnalysis,
    selectedLegIndex,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    unusableStartIndices
  } = getScenarioRenderState(scenario);
  const canvas = document.getElementById("canvas");
  const renderOptions = {
    placements: scenario.placements,
    goal,
    analysis: renderAnalysis,
    goals: getPlayableCheckpoints(scenario.checkpoints, scenario.virtualBots),
    virtualBotEntry: scenario.virtualBots ? scenario.virtualBotEntry : null,
    reentryMarkers: hasMovingTargetsEffect(scenario) ? scenario.movingTargetReentryMarkers : [],
    movingTargetTimelines: hasMovingTargetsEffect(scenario) ? scenario.movingTargetTimelines : [],
    showMovingTargetDetails: devViewEnabled,
    showMovingTargetHits: devViewEnabled,
    starts: scenario.virtualBots ? [] : scenario.activeStarts,
    startLabels,
    selectedStartIndices,
    startEnergyCosts,
    startLateEnergyCosts,
    startEarlyUnavailable,
    startLateUnavailable,
    rebootTokens: scenario.rebootTokens,
    tileMap: scenario.goalTileMap,
    unusableStartIndices,
    edgeOutlineColor: scenario.lessDeadlyGame ? "#f2c230" : null,
    showBoardLabels: false,
    showStartFacing: devViewEnabled,
    showAllStartMarkers: devViewEnabled && !scenario.virtualBots,
    noDockStarts: Boolean(scenario.noDocks),
    hideUnusableStarts: Boolean(scenario.noDocks && !devViewEnabled && !scenario.payToWin),
    showWalls: iconBoardView || devViewEnabled,
    showPieceImages: !iconBoardView,
    showFootprints: true,
    showFeatureIcons: iconBoardView
  };

  render(canvas, scenario.pieceMap, scenario.imageMap, renderOptions);

  if (!options.skipBlankCheck && !canvasHasVisibleCourse(canvas)) {
    render(canvas, scenario.pieceMap, scenario.imageMap, {
      ...renderOptions,
      showBoardLabels: false,
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
    if (!currentScenario || document.hidden || isGenerating) {
      return;
    }
    const now = performance.now();
    if (now - lastScenarioRenderTime < SCENARIO_RENDER_INTERVAL_MS) {
      return;
    }
    lastScenarioRenderTime = now;
    drawScenarioCanvas(currentScenario, { skipBlankCheck: true });
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
    label: index === 0 ? (scenario.virtualBots ? "Entry → 1" : "Start → 1") : `${leg.from} → ${leg.to}`
  }));
  const previousLegValue = legSelect?.value ?? "all";
  if (legSelect) {
    legSelect.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All legs";
    legSelect.appendChild(all);
    legOptions.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      legSelect.appendChild(el);
    });
    legSelect.value = previousLegValue === "all" || legOptions.some((o) => o.value === previousLegValue)
      ? previousLegValue
      : "all";
  }
  const renderState = drawScenarioCanvas(scenario);
  updateInspectionDetail(scenario, renderState.selectedLegIndex);
  if (devViewEnabled) {
    document.getElementById("report").textContent = buildScenarioReport(scenario, renderState.selectedLegIndex);
  }
}

function validateSelectedInventory(assets, preferences) {
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(assets.pieceMap, expansionIds, preferences);
  const virtualBotsState = getVariantPreferenceState(preferences, "virtualBots");
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessSetupAvailable = virtualBotsState !== "off" || noDocksState !== "off";
  if (!availableDockIds.length && !docklessSetupAvailable) {
    return "The selected sets contain no docking bay. Enable No Docks or Virtual Bots, or select a set with a docking bay.";
  }
  const docklessSetupForced = virtualBotsState === "forced" || noDocksState === "forced";
  const docklessSetupPermitted = virtualBotsState !== "off" || noDocksState !== "off";
  if (!docklessSetupPermitted && availableDockIds.length && !canSupportRequiredDockStarts(availableDockIds, assets.pieceMap, preferences)) {
    const requiredStarts = getRequiredDockStartCount(preferences);
    const dockCapacity = getMaximumAvailableDockStartCapacity(availableDockIds, assets.pieceMap, preferences);
    return `The selected dock settings provide at most ${dockCapacity} starting spaces for this setup (${requiredStarts} needed). Allow Extra Docks or No Docks, reduce the player count, or select sets with more dock capacity.`;
  }
  if (!docklessSetupForced && availableDockIds.length && !getDockConfigurations(availableDockIds, assets.pieceMap, preferences).length && !docklessSetupPermitted) {
    return getExtraDockModeState(preferences) === "forced"
      ? "Extra Docks is required, but the selected sets do not provide a valid multiple-dock setup."
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

async function createRandomCandidate(assets, preferences, attempt = 1, remainingEvaluations = 1, onEvaluation = null, onStage = null, shouldStopBeforeRetry = null) {
  const { pieceMap } = assets;
  const expansionIds = getSelectedExpansionIds(preferences);
  const availableDockIds = getEligibleDockIds(pieceMap, expansionIds, preferences);
  const variantBundle = chooseVariantBundle(preferences, { pieceMap });
  const {
    alignedLayout,
    actFast,
    competitiveMode,
    payToWin,
    extraDocks,
    noDocks,
    sandwichedDock,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    moreDeadlyGame,
    flamingOil,
    lighterGame,
    classicSharedDeck,
    repulsorOverdrive,
    hazardousFlags,
    repairStations,
    movingTargets,
    staggeredBoards,
    lessForeshadowing,
    variantComplexityBudget,
    variantComplexityUsed
  } = variantBundle;
  let effectiveNoDocks = noDocks;
  if (effectiveNoDocks) {
    variantBundle.extraDocks = false;
    variantBundle.sandwichedDock = false;
  }
  const noDocksPreferenceState = getVariantPreferenceState(preferences, "noDocks");
  if (!availableDockIds.length && !virtualBots && noDocksPreferenceState !== "off") {
    effectiveNoDocks = true;
    variantBundle.noDocks = true;
  }
  if (competitiveMode && !virtualBots && !effectiveNoDocks && !sandwichedDock) {
    const competitiveDockPreferences = {
      ...preferences,
      playerCount: preferences.playerCount,
      competitiveMode: true,
      extraDocks: Boolean(variantBundle.extraDocks)
    };
    if (
      !canSupportRequiredDockStarts(availableDockIds, pieceMap, competitiveDockPreferences) &&
      noDocksPreferenceState !== "off"
    ) {
      effectiveNoDocks = true;
      variantBundle.noDocks = true;
      variantBundle.extraDocks = false;
    }
  }
  const actFastMode = actFast ? chooseActFastMode(preferences) : null;
  const generationPreferences = applyVariantGenerationOptions({
    ...preferences,
    generationAttempt: attempt,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    extraDocks,
    noDocks: effectiveNoDocks,
    sandwichedDock,
    virtualBots
  }, variantBundle);
  const reportStage = async (message, localEvaluation = 1) => {
    if (onStage) {
      await onStage(message, localEvaluation);
    }
  };

  await reportStage("Building board and dock layout", 1);

  const docklessSetup = virtualBots || effectiveNoDocks;
  const dockConfigurations = docklessSetup ? [] : weightedOrder(
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

  if (docklessSetup) {
    const layoutAnchors = orderedDockIds.length ? orderedDockIds : [null];
    for (const candidateDockId of layoutAnchors) {
      const candidateBoardLayout = createBoardPlacements(
        pieceMap, generationPreferences.length, generationPreferences, guidanceLevel, expansionIds, candidateDockId, attempt
      );
      if (candidateBoardLayout) {
        boardLayout = candidateBoardLayout;
        break;
      }
    }
  } else {
    const configuredDockSets = sandwichedDock
      ? orderedDockIds.map((dockId) => [dockId])
      : (dockConfigurations.length ? dockConfigurations : orderedDockIds.map((dockId) => [dockId]));

    for (const dockConfiguration of configuredDockSets) {
      // Preserve the pre-v18 path exactly for ordinary layouts and for a single
      // Sandwiched Dock. This is the known-working behavior we are regressing to.
      if (!sandwichedDock || dockConfiguration.length === 1) {
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
        if (!candidateBoardLayout) continue;

        const candidateDockPlacements = [];
        let validDockSet = true;
        for (const dockId of dockConfiguration) {
          const flipOrder = shuffle([false, true]);
          let placedDock = null;
          for (const candidateFlip of flipOrder) {
            if (sandwichedDock && candidateDockPlacements.length === 0) {
              placedDock = findBridgeDockPlacement(
                candidateBoardLayout.placements,
                pieceMap,
                dockId,
                candidateFlip
              );
              if (
                placedDock &&
                generationPreferences.alignedLayout &&
                !hasAlignedDockFrontage(candidateBoardLayout.placements, pieceMap, placedDock.dockPlacement)
              ) {
                placedDock = null;
              }
            } else {
              placedDock = createDockPlacement(
                [...candidateBoardLayout.placements, ...candidateDockPlacements],
                pieceMap,
                dockId,
                candidateFlip,
                { alignedLayout: generationPreferences.alignedLayout, allowBridgePlacement: true }
              );
            }
            if (placedDock) {
              candidateDockPlacements.push(placedDock.dockPlacement);
              break;
            }
          }
          if (!placedDock) { validDockSet = false; break; }
        }
        if (!validDockSet || !candidateDockPlacements.length) continue;
        boardLayout = candidateBoardLayout;
        dockPlacements = candidateDockPlacements;
        dockSummaries = buildDockSummaries(boardLayout.placements, dockPlacements, pieceMap);
        break;
      }

    }
  }

  if (!boardLayout) {
    throw new Error("Unable to create a valid board layout");
  }

  const courseDockPlacements = docklessSetup ? [] : dockPlacements;
  const overlayPlacements = chooseOverlayPlacements(boardLayout.placements, courseDockPlacements, pieceMap, generationPreferences, expansionIds);
  const placements = [
    ...boardLayout.placements,
    ...courseDockPlacements,
    ...overlayPlacements
  ];
  const boardRects = buildBoardRects(boardLayout.placements, pieceMap);

  clearAnalysisCachesSafe();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const noDockSelection = effectiveNoDocks
    ? chooseNoDockStartingZones(
      boardRects,
      tileMap,
      getRequiredDockStartCount({ ...generationPreferences, competitiveMode }),
      {
        ...generationPreferences,
        playerCount: preferences.playerCount,
        competitiveMode,
        payToWin,
        extraDocksState: "off"
      }
    )
    : null;
  if (effectiveNoDocks && !noDockSelection) {
    return { scenario: null, evaluationsUsed: 1 };
  }
  const noDockEdges = noDockSelection?.edges ?? [];
  const noDockEdge = noDockEdges[0] ?? null;
  const noDockStarts = noDockSelection?.starts ?? [];
  const noDockUsesMultipleZones = false;
  const setupStarts = effectiveNoDocks ? noDockStarts : starts;
  const flagCandidates = getFlagCandidates(placements, pieceMap);
  const movingTargetsForced = isVariantForced(preferences, "movingTargets");
  const movingTargetTraceCache = movingTargets ? new Map() : null;
  const movingCheckpointCandidateCount = movingTargets
    ? flagCandidates.filter((candidate) => getMovingCheckpointTrace(tileMap, candidate, movingTargetTraceCache, generationPreferences).moving).length
    : 0;

  await reportStage("Preparing checkpoint candidates", 1);

  if (movingTargetsForced && movingCheckpointCandidateCount === 0) {
    return {
      scenario: null,
      evaluationsUsed: 1
    };
  }

  const flagCount = Math.min(weightedFlagCount(generationPreferences.length, flagCandidates.length, generationPreferences), flagCandidates.length);
  const retryBudget = getFlagRetryBudget(generationPreferences, remainingEvaluations);
  const stallLimit = getFlagRetryStallLimit(generationPreferences);
  let evaluationsUsed = 0;
  let bestScenario = null;
  let staleRetries = 0;

  for (let retry = 0; retry < retryBudget; retry += 1) {
    // The generation-level expansion budget is intentionally soft, but a
    // single board candidate can contain several checkpoint-layout retries.
    // Re-check before paying for another full contextual analysis so a viable
    // fallback does not overshoot the budget by an entire retry group.
    if (
      retry > 0 &&
      shouldStopBeforeRetry &&
      shouldStopBeforeRetry({ evaluationsUsed, bestScenario })
    ) {
      break;
    }

    evaluationsUsed += 1;
    if (onEvaluation) {
      await onEvaluation(evaluationsUsed, retryBudget);
    }
    await reportStage(
      retryBudget > 1
        ? `Choosing checkpoints — checkpoint try ${retry + 1} / ${retryBudget}`
        : "Choosing checkpoints",
      evaluationsUsed
    );
    const pickedCheckpoints = pickFlags(
      flagCandidates,
      flagCount + (virtualBots ? 1 : 0),
      boardLayout.placements,
      courseDockPlacements,
      pieceMap,
      virtualBots ? [] : setupStarts,
      {
        ...generationPreferences,
        hazardousFlags,
        movingTargets,
        noDocks: effectiveNoDocks,
        extraDocksState: getVariantPreferenceState(preferences, "extraDocks")
      },
      guidanceLevel
    );

    if (!pickedCheckpoints) {
      staleRetries += 1;
      if (retry > 0 && staleRetries >= stallLimit) {
        break;
      }
      continue;
    }

    const virtualEntryCandidate = virtualBots ? pickedCheckpoints[0] : null;
    const virtualEntryDirections = virtualEntryCandidate
      ? getVirtualBotEntryDirections(tileMap, virtualEntryCandidate)
      : [];
    if (virtualBots && !virtualEntryDirections.length) {
      continue;
    }
    const flagZero = virtualBots
      ? {
        ...virtualEntryCandidate,
        id: 0,
        facing: sample(virtualEntryDirections)
      }
      : null;
    const checkpoints = virtualBots
      ? [flagZero, ...pickedCheckpoints.slice(1)]
      : pickedCheckpoints;
    const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);

    let scenarioBoardPlacements = boardLayout.placements;
    let scenarioDockPlacements = courseDockPlacements;
    let scenarioOverlayPlacements = overlayPlacements;
    let scenarioPlacements = placements;
    let scenarioBoardRects = boardRects;
    let scenarioTileMap = tileMap;
    let goalTileMap = scenarioTileMap;
    let activeStarts = virtualBots
      ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
      : filterStartsForGoals(setupStarts, checkpoints);
    let rebootTokens = [];
    let sequence = null;
    let effectiveVariantBundle = variantBundle;

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
        ? placeRebootTokens(scenarioBoardRects, pieceMap, scenarioTileMap, playableCheckpoints, preferences.playerCount)
        : recoveryRule === "home_reboot"
          ? placeHomeRebootTokens(scenarioDockPlacements, pieceMap, resolved.starts, scenarioTileMap, checkpoints, {
            lessDeadlyGame
          })
          : [];
      if (virtualBots && recoveryRule === "reboot_tokens" && flagZero) {
        const entryBoard = scenarioBoardRects.find((rect) => pointOnRect(flagZero, rect));
        if (entryBoard) {
          rebootTokens = rebootTokens.filter((token) => token.boardIndex !== entryBoard.index);
        }
      }
      if (recoveryRule === "home_reboot") {
        const dockCountWithStarts = scenarioDockPlacements.filter((dockPlacement) => (
          resolved.starts.some((start) => pointOnPlacement(start, dockPlacement, pieceMap))
        )).length;
        if (rebootTokens.length < dockCountWithStarts) {
          sequence = null;
          break;
        }
      }
      if (virtualBots) {
        const withFlagZero = applyFlagOverrides(scenarioTileMap, [flagZero], { hazardousFlags, movingTargets: false });
        goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
        goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
      } else {
        goalTileMap = applyFlagOverrides(scenarioTileMap, checkpoints, { hazardousFlags, movingTargets });
      }
      const courseAvailability = applyCourseVariantAvailability(variantBundle, goalTileMap, preferences);
      if (courseAvailability.blockedForced.length) {
        sequence = null;
        break;
      }
      effectiveVariantBundle = courseAvailability.variantBundle;
      activeStarts = virtualBots
        ? buildVirtualRobotStarts(flagZero, preferences.playerCount, startupSpinUp)
        : effectiveNoDocks
          ? filterStartsForGoals(noDockStarts, checkpoints)
          : filterStartsForGoals(resolved.starts, checkpoints);
      await reportStage(
        `Evaluating starting spaces — pass ${pass + 1} / 4; ${activeStarts.length} start${activeStarts.length === 1 ? "" : "s"} with contextual leg routes`,
        evaluationsUsed
      );
      try {
        const baseAnalysisOptions = applyVariantAnalysisOptions({
          rebootTokens,
          boardRects: scenarioBoardRects,
          difficulty: generationPreferences.difficulty,
          length: generationPreferences.length,
          contextualEarlyExit: true
        }, effectiveVariantBundle);

        if (
          pass === 0 &&
          sandwichedDock &&
          !competitiveMode &&
          !virtualBots &&
          scenarioDockPlacements.length > 1 &&
          playableCheckpoints.length
        ) {
          await reportStage(
            `Screening multiple-dock opening routes — ${scenarioDockPlacements.length} docks`,
            evaluationsUsed
          );
          const sandwichPreflight = screenSandwichedExtraDockOpening(
            goalTileMap,
            activeStarts,
            playableCheckpoints[0],
            scenarioDockPlacements,
            pieceMap,
            preferences.playerCount,
            {
              ...baseAnalysisOptions,
              movingTargets
            }
          );
          if (!sandwichPreflight.valid) {
            const reason = `sandwiched extra-dock opening screen failed: ${sandwichPreflight.reachable}/${preferences.playerCount} quick routes across ${sandwichPreflight.dockCoverage}/${scenarioDockPlacements.length} docks`;
            console.debug(`Early course retry: ${reason}`);
            await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
            sequence = null;
            break;
          }
        }


        if (competitiveMode && !virtualBots) {
          await reportStage(
            `Checking all competitive starts — ${activeStarts.length} starting spaces`,
            evaluationsUsed
          );
          const indexedStarts = activeStarts.map((start, index) => ({
            ...start,
            analysisIndex: index
          }));
          const preliminary = analyzeFlagSequence(
            goalTileMap,
            indexedStarts,
            playableCheckpoints,
            preferences.playerCount,
            {
              ...baseAnalysisOptions,
              contextualOpeningRoutes: 1,
              contextualLaterRoutes: 1,
              contextualBeamWidth: 1,
              contextualCompletionPool: 1,
              skipFullCourseTraffic: true
            }
          );
          const preliminaryCache = preliminary.firstLeg.summary.contextualLegCache ?? {};
          const routedStarts = preliminary.firstLeg.starts.filter((entry) => entry.reachable);
          const failedStarts = preliminary.firstLeg.starts.filter((entry) => !entry.reachable);
          if (
            failedStarts.length ||
            routedStarts.length !== indexedStarts.length
          ) {
            const reason = `competitive start validation failed: ${failedStarts.length} unrouted; ${preliminaryCache.zeroRouteCapFailures ?? 0} capped route contexts recorded`;
            console.debug(`Early course abort: ${reason}`);
            await reportStage(`Trying another course — ${reason}`, evaluationsUsed);
            sequence = null;
            break;
          }

          const selectedIndices = selectCompetitivePreferredStarts(
            preliminary.firstLeg,
            preferences.playerCount
          );
          const selectedSet = new Set(selectedIndices);
          const selectedStarts = indexedStarts.filter((start) => selectedSet.has(start.analysisIndex));
          if (selectedStarts.length < preferences.playerCount) {
            sequence = null;
            break;
          }
          const blockedIndices = getCompetitiveBlockedIndices(
            preliminary.firstLeg,
            selectedIndices,
            preferences.playerCount
          );
          await reportStage(
            `Refining competitive starts — ${selectedStarts.length} player-selected starts`,
            evaluationsUsed
          );
          sequence = analyzeFlagSequence(
            goalTileMap,
            selectedStarts,
            playableCheckpoints,
            preferences.playerCount,
            baseAnalysisOptions
          );
          sequence.firstLeg.summary.competitiveStaging = {
            active: true,
            sourceStartCount: indexedStarts.length,
            routedStartCount: routedStarts.length,
            selectedIndices,
            blockedIndices,
            remainingAfterBlocks: Math.max(0, indexedStarts.length - blockedIndices.length),
            preliminaryCache,
            preliminaryScoreStdDev: preliminary.firstLeg.summary.scoreStdDev ?? 0,
            method: "all-start-validity+perfect-selection"
          };
        } else {
          sequence = analyzeFlagSequence(
            goalTileMap,
            activeStarts,
            playableCheckpoints,
            preferences.playerCount,
            baseAnalysisOptions
          );
        }
      } catch (error) {
        if (error?.code === "CONTEXTUAL_START_CAPACITY_LOST") {
          const health = error.contextualSearchHealth ?? {};
          const reason = `route capacity lost after leg ${health.legNumber ?? "?"}: ${health.survivingStarts ?? 0}/${health.requiredStarts ?? preferences.playerCount} required starts remain; ${health.cappedContextsThisLeg ?? 0} capped route contexts this leg (${health.zeroRouteCapFailures ?? 0} total across ${health.distinctStarts ?? 0} starts)`;
          console.debug(`Early course retry: ${reason}`);
          await reportStage(`Trying another checkpoint layout — ${reason}`, evaluationsUsed);
          sequence = null;
          break;
        }
        throw error;
      }

      // After the first genuine full-course analysis, abandon only candidates
      // that are wildly outside the requested difficulty/length target.
      // Competitive Mode also benefits from this gate: it skips the physical
      // pruning/reanalysis loop, but a grossly mismatched checkpoint layout
      // should not trigger additional expensive checkpoint retries on the same
      // board candidate. The provisional classification below intentionally
      // skips Competitive's block-impact simulation because this gate only
      // needs difficulty and length.
      if (pass === 0) {
        const provisionalMetrics = classifyCandidate(sequence, {
          ...generationPreferences,
          actFast,
          actFastMode,
          flagCount,
          classicSharedDeck,
          criticalSpam,
          criticalHaywire,
          permanentShutdown,
          cuttingFloor: effectiveVariantBundle.cuttingFloor,
          flamingOil: effectiveVariantBundle.flamingOil,
          factoryRejects,
          repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
          upgradeWorld: effectiveVariantBundle.upgradeWorld,
          hazardousFlags,
          movingTargets,
          payToWin: effectiveVariantBundle.payToWin,
          lighterGame,
          lessSpammyGame,
          lessForeshadowing
        }, {
          boardPlacements: scenarioBoardPlacements,
          pieceMap,
          checkpoints: playableCheckpoints,
          tileMap: scenarioTileMap,
          goalTileMap,
          skipCompetitiveBlockImpact: competitiveMode
        });
        const grossMismatch = getGrossCourseMismatch(provisionalMetrics, generationPreferences);

        if (grossMismatch.abort) {
          const mismatchText = formatGrossCourseMismatch(grossMismatch);
          console.debug(`Early course abort: ${mismatchText}`);
          await reportStage(`Rejecting gross mismatch — ${mismatchText}`, evaluationsUsed);
          sequence = null;
          break;
        }
      }

      // Competitive Mode keeps every legal starting space on the rendered board,
      // but evaluates the course using the player-selected staged shortlist.
      // There is no dock/board/overlay pruning pass after this analysis.
      if (competitiveMode) {
        break;
      }

      await reportStage(`Checking route fairness and removable pieces — pass ${pass + 1} / 4`, evaluationsUsed);
      const usableStarts = computeUsableStarts(sequence.firstLeg, {
        competitiveMode,
        virtualBots,
        payToWin: effectiveVariantBundle.payToWin
      });
      let pruningChanged = false;
      const prunedDocks = pruneUnusedDockPlacements(
        scenarioDockPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints
      );
      if (prunedDocks.pruned) {
        scenarioDockPlacements = prunedDocks.dockPlacements;
        pruningChanged = true;
      }

      const protectedSandwichBoards = sandwichedDock
        ? getProtectedSandwichBoardIndices(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        )
        : new Set();
      const prunedBoards = pruneUnusedBoardPlacements(
        scenarioBoardPlacements,
        scenarioOverlayPlacements,
        pieceMap,
        sequence,
        usableStarts,
        checkpoints,
        { protectedBoardIndices: protectedSandwichBoards }
      );
      if (prunedBoards.pruned) {
        scenarioBoardPlacements = prunedBoards.boardPlacements;
        scenarioOverlayPlacements = prunedBoards.overlayPlacements;
        pruningChanged = true;
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
        pruningChanged = true;
      }

      if (pruningChanged) {
        continue;
      }

      break;
    }
    if (!sequence) {
      staleRetries += 1;
      continue;
    }
    if (
      sandwichedDock &&
      !hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      )
    ) {
      staleRetries += 1;
      continue;
    }
    if (
      effectiveVariantBundle.payToWin &&
      sequence.firstLeg.summary.payToWin?.availabilityValid === false
    ) {
      staleRetries += 1;
      continue;
    }
    const finalUsableStarts = computeUsableStarts(sequence.firstLeg, {
      competitiveMode,
      virtualBots,
      payToWin: effectiveVariantBundle.payToWin
    });
    const effectiveStartZoneCount = effectiveNoDocks
      ? (noDockEdge ? 1 : 0)
      : scenarioDockPlacements.length;
    if (effectiveVariantBundle.extraDocks && effectiveStartZoneCount <= 1) {
      if (isVariantForced(preferences, "extraDocks")) {
        staleRetries += 1;
        continue;
      }
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: false
      };
    } else if (effectiveStartZoneCount > 1 && !effectiveVariantBundle.extraDocks) {
      effectiveVariantBundle = {
        ...effectiveVariantBundle,
        extraDocks: true
      };
    }
    await reportStage("Checking difficulty, length, and final fit", evaluationsUsed);
    const metrics = classifyCandidate(sequence, {
      ...generationPreferences,
      ...effectiveVariantBundle,
      actFast,
      actFastMode,
      flagCount,
      classicSharedDeck,
      movingTargets
    }, {
      boardPlacements: scenarioBoardPlacements,
      pieceMap,
      checkpoints: playableCheckpoints,
      tileMap: scenarioTileMap,
      goalTileMap
    });
    scenarioPlacements = [
      ...scenarioBoardPlacements,
      ...scenarioDockPlacements,
      ...scenarioOverlayPlacements
    ];
    const finalOverlayPlacements = scenarioPlacements.filter((placement) => placement.overlay);
    const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
    const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(scenarioTileMap, playableCheckpoints, effectiveVariantBundle.movingTargets);
    const scenario = applyVariantScenarioState({
      pieceMap: assets.pieceMap,
      imageMap: assets.imageMap,
      placements: scenarioPlacements,
      overlayPlacements: finalOverlayPlacements,
      dockPlacements: scenarioDockPlacements,
      dockSummaries: buildDockSummaries(scenarioBoardPlacements, scenarioDockPlacements, pieceMap),
      checkpoints,
      virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
      rebootTokens,
      goalTileMap,
      activeStarts,
      playerCount: preferences.playerCount,
      actFast,
      actFastMode,
      payToWin: effectiveVariantBundle.payToWin,
      noDocks: effectiveNoDocks,
      sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
        scenarioBoardPlacements,
        scenarioDockPlacements,
        pieceMap
      ),
      noDockEdge: noDockEdge ? { boardIndex: noDockEdge.boardIndex, pieceId: noDockEdge.pieceId, side: noDockEdge.side, facing: noDockEdge.facing } : null,
      noDockEdges: noDockEdges.map((edge) => ({ boardIndex: edge.boardIndex, pieceId: edge.pieceId, side: edge.side, facing: edge.facing, edgeLength: edge.edgeLength })),
      noDockStarts,
      virtualBots,
      extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
      mainBoardIds: scenarioBoardPlacements.map((placement) => placement.pieceId),
      mainRotations: scenarioBoardPlacements.map((placement) => placement.rotation),
      boardCount: scenarioBoardPlacements.length,
      boardRects: scenarioBoardRects,
      guidanceLevel,
      sequence,
      metrics,
      movingTargetStats: metrics.movingTargetStats,
      movingTargetTimelines,
      movingTargetReentryMarkers,
      preferences: {
        ...generationPreferences,
        overlayMode: normalizeOverlayMode(generationPreferences.overlayMode),
        actFast,
        actFastMode,
        competitiveMode,
        extraDocks: effectiveNoDocks ? false : scenarioDockPlacements.length > 1,
        noDocks: effectiveNoDocks,
        sandwichedDock: sandwichedDock && hasPhysicalSandwichedDock(
          scenarioBoardPlacements,
          scenarioDockPlacements,
          pieceMap
        ),
        factoryRejects,
        flagCount,
        virtualBots,
        classicSharedDeck,
        criticalSpam,
        criticalHaywire,
        permanentShutdown,
        cuttingFloor: effectiveVariantBundle.cuttingFloor,
        flamingOil: effectiveVariantBundle.flamingOil,
        repulsorOverdrive: effectiveVariantBundle.repulsorOverdrive,
        upgradeWorld: effectiveVariantBundle.upgradeWorld,
        hazardousFlags,
        repairStations: effectiveVariantBundle.repairStations,
        movingTargets,
        payToWin: effectiveVariantBundle.payToWin,
        lighterGame,
        lessSpammyGame,
        lessForeshadowing,
        staggeredBoards
      }
    }, effectiveVariantBundle);

    if (!hasStartCapacityHardFailure(scenario) && (!bestScenario || scenario.metrics.fitScore < bestScenario.metrics.fitScore)) {
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
    payToWin: scenario.payToWin,
    extraDocks: scenario.extraDocks,
    noDocks: scenario.noDocks,
    sandwichedDock: scenario.sandwichedDock,
    noDockEdge: scenario.noDockEdge,
    noDockEdges: scenario.noDockEdges ?? (scenario.noDockEdge ? [scenario.noDockEdge] : []),
    noDockStarts: scenario.noDockStarts,
    factoryRejects: scenario.factoryRejects,
    recoveryRule: scenario.recoveryRule,
    lessDeadlyGame: scenario.lessDeadlyGame,
    lessSpammyGame: scenario.lessSpammyGame,
    criticalSpam: scenario.criticalSpam,
    criticalHaywire: scenario.criticalHaywire,
    permanentShutdown: scenario.permanentShutdown,
    startupSpinUp: scenario.startupSpinUp,
    virtualBots: scenario.virtualBots,
    moreDeadlyGame: scenario.moreDeadlyGame,
    homeReboot: scenario.homeReboot,
    cuttingFloor: scenario.cuttingFloor,
    flamingOil: scenario.flamingOil,
    repulsorOverdrive: scenario.repulsorOverdrive,
    upgradeWorld: scenario.upgradeWorld,
    lighterGame: scenario.lighterGame,
    classicSharedDeck: scenario.classicSharedDeck,
    hazardousFlags: scenario.hazardousFlags,
    repairStations: scenario.repairStations,
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
  const payToWin = Boolean(snapshot.payToWin);
  const noDocks = Boolean(snapshot.noDocks);
  const sandwichedDock = Boolean(snapshot.sandwichedDock);
  const noDockStarts = snapshot.noDockStarts || [];
  const factoryRejects = Boolean(snapshot.factoryRejects);
  const lessDeadlyGame = Boolean(snapshot.lessDeadlyGame);
  const lessSpammyGame = Boolean(snapshot.lessSpammyGame);
  const criticalSpam = Boolean(snapshot.criticalSpam);
  const criticalHaywire = Boolean(snapshot.criticalHaywire);
  const permanentShutdown = Boolean(snapshot.permanentShutdown);
  const moreDeadlyGame = Boolean(snapshot.moreDeadlyGame);
  const homeReboot = Boolean(snapshot.homeReboot || recoveryRule === "home_reboot");
  const cuttingFloor = Boolean(snapshot.cuttingFloor);
  const flamingOil = Boolean(snapshot.flamingOil);
  const repulsorOverdrive = Boolean(snapshot.repulsorOverdrive);
  const startupSpinUp = Boolean(snapshot.startupSpinUp);
  const virtualBots = Boolean(snapshot.virtualBots);
  const upgradeWorld = Boolean(snapshot.upgradeWorld);
  const lighterGame = Boolean(snapshot.lighterGame);
  const classicSharedDeck = Boolean(snapshot.classicSharedDeck);
  const hazardousFlags = Boolean(snapshot.hazardousFlags);
  const repairStations = Boolean(snapshot.repairStations);
  const movingTargets = Boolean(snapshot.movingTargets);
  const staggeredBoards = Boolean(snapshot.staggeredBoards);
  const lessForeshadowing = Boolean(snapshot.lessForeshadowing);
  const placements = snapshot.placements;
  const checkpoints = snapshot.checkpoints;
  const boardPlacements = placements.filter((placement) => {
    const kind = assets.pieceMap[placement.pieceId]?.kind;
    return kind !== "dock" && !placement.overlay;
  });
  const overlayPlacements = placements.filter((placement) => placement.overlay);
  const dockPlacements = getDockPlacementsFromScenarioPlacements(placements, assets.pieceMap);
  const snapshotNoDockEdges = snapshot.noDockEdges ?? (snapshot.noDockEdge ? [snapshot.noDockEdge] : []);
  const extraDocks = noDocks ? snapshotNoDockEdges.length > 1 : dockPlacements.length > 1;
  const boardRects = buildBoardRects(boardPlacements, pieceMap);

  if ((!virtualBots && !noDocks && !dockPlacements.length) || !boardPlacements.length) {
    return null;
  }

  clearAnalysisCachesSafe();
  const { tileMap, starts } = buildResolvedMap(placements, pieceMap);
  const rebootTokens = recoveryRule === "home_reboot"
    ? placeHomeRebootTokens(dockPlacements, pieceMap, starts, tileMap, checkpoints, {
      lessDeadlyGame
    })
    : (snapshot.rebootTokens || []);
  const flagZero = virtualBots ? checkpoints[0] : null;
  const playableCheckpoints = getPlayableCheckpoints(checkpoints, virtualBots);
  let goalTileMap;
  if (virtualBots) {
    const withFlagZero = applyFlagOverrides(tileMap, [flagZero], { hazardousFlags, movingTargets: false });
    goalTileMap = applyFlagOverrides(withFlagZero, playableCheckpoints, { hazardousFlags, movingTargets });
    goalTileMap = hideVirtualFlagZeroFeature(goalTileMap, flagZero);
  } else {
    goalTileMap = applyFlagOverrides(tileMap, checkpoints, { hazardousFlags, movingTargets });
  }
  const activeStarts = virtualBots
    ? buildVirtualRobotStarts(flagZero, snapshot.preferences.playerCount, startupSpinUp)
    : noDocks
      ? filterStartsForGoals(noDockStarts, checkpoints)
      : filterStartsForGoals(starts, checkpoints);
  const sequence = analyzeFlagSequence(goalTileMap, activeStarts, playableCheckpoints, snapshot.preferences.playerCount, applyVariantAnalysisOptions({
    rebootTokens,
    boardRects,
    difficulty: snapshot.preferences.difficulty,
    length: snapshot.preferences.length
  }, {
    competitiveMode,
    payToWin,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    moreDeadlyGame,
    homeReboot,
    cuttingFloor,
    flamingOil,
    repulsorOverdrive,
    startupSpinUp,
    virtualBots,
    upgradeWorld,
    lighterGame,
    hazardousFlags,
    repairStations,
    lessForeshadowing
  }));
  const metrics = classifyCandidate(sequence, {
    ...snapshot.preferences,
    actFast,
    actFastMode,
    recoveryRule,
    flagCount: playableCheckpoints.length,
    classicSharedDeck,
    cuttingFloor,
    flamingOil,
    factoryRejects,
    hazardousFlags,
    repairStations,
    movingTargets,
    payToWin,
    startupSpinUp,
    repulsorOverdrive,
    upgradeWorld,
    lighterGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    flamingOil,
    lessForeshadowing
  }, {
    boardPlacements,
    pieceMap,
    checkpoints: playableCheckpoints,
    tileMap,
    goalTileMap
  });
  const movingTargetTimelines = sequence.movingTargetTimelines ?? [];
  const movingTargetReentryMarkers = collectMovingTargetReentryMarkers(tileMap, playableCheckpoints, movingTargets);

  return {
    pieceMap,
    imageMap,
    placements,
    overlayPlacements,
    dockPlacements,
    dockSummaries: buildDockSummaries(boardPlacements, dockPlacements, pieceMap),
    checkpoints,
    virtualBotEntry: flagZero ? { x: flagZero.x, y: flagZero.y, dir: flagZero.facing } : null,
    rebootTokens,
    goalTileMap,
    activeStarts,
    playerCount: snapshot.preferences.playerCount,
    actFast,
    actFastMode,
    competitiveMode,
    payToWin,
    noDocks,
    sandwichedDock,
    noDockEdge: snapshot.noDockEdge ?? snapshotNoDockEdges[0] ?? null,
    noDockEdges: snapshotNoDockEdges,
    noDockStarts,
    extraDocks,
    factoryRejects,
    recoveryRule,
    lessDeadlyGame,
    lessSpammyGame,
    criticalSpam,
    criticalHaywire,
    permanentShutdown,
    startupSpinUp,
    virtualBots,
    moreDeadlyGame,
    homeReboot,
    cuttingFloor,
    flamingOil,
    repulsorOverdrive,
    upgradeWorld,
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
    movingTargetTimelines,
    movingTargetReentryMarkers,
    preferences: {
      ...snapshot.preferences,
      overlayMode: normalizeOverlayMode(snapshot.preferences.overlayMode),
      actFast,
      actFastMode,
      competitiveMode,
      payToWin,
      noDocks,
      sandwichedDock,
      extraDocks,
      factoryRejects,
      recoveryRule,
      flagCount: playableCheckpoints.length,
      classicSharedDeck,
      homeReboot,
      cuttingFloor,
      flamingOil,
      repulsorOverdrive,
      startupSpinUp,
      virtualBots,
      upgradeWorld,
      hazardousFlags,
      repairStations,
      movingTargets,
      lessSpammyGame,
      criticalSpam,
      criticalHaywire,
      permanentShutdown,
      staggeredBoards
    },
    attempts: snapshot.attempts ?? 0
  };
}

async function generateScenarioForPreferences(assets, preferences, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const onProgress = options.onProgress ?? null;
  const generationStartedAt = generationNow();
  const generationDiagnostics = {
    startedAt: generationStartedAt,
    attempts: [],
    totalMs: 0,
    totalEvaluations: 0,
    routeSearches: 0,
    routeExpansions: 0,
    routeSearchMs: 0,
    cappedRouteSearches: 0,
    slowestRouteSearch: null,
    contextualProfileTotals: null,
    terminationReason: null,
    softExpansionBudget: GENERATION_SOFT_EXPANSION_BUDGET,
    softBudgetMinAttempts: GENERATION_SOFT_BUDGET_MIN_ATTEMPTS
  };
  let bestScenario = null;
  let crashedAttempts = 0;
  let lastAttemptError = null;
  let attempt = 0;
  let terminationReason = null;

  const attachDiagnostics = (scenario) => {
    if (!scenario) return scenario;
    const telemetry = getAnalysisTelemetrySnapshotSafe();
    generationDiagnostics.totalMs = Number((generationNow() - generationStartedAt).toFixed(2));
    generationDiagnostics.totalEvaluations = attempt;
    generationDiagnostics.routeSearches = telemetry.routeSearchCount ?? 0;
    generationDiagnostics.routeExpansions = telemetry.totalExpansions ?? 0;
    generationDiagnostics.routeSearchMs = telemetry.totalDurationMs ?? 0;
    generationDiagnostics.cappedRouteSearches = telemetry.cappedSearches ?? 0;
    generationDiagnostics.slowestRouteSearch = telemetry.slowestSearch ?? null;
    generationDiagnostics.contextualProfileTotals = telemetry.contextualProfileTotals ?? null;
    generationDiagnostics.terminationReason = terminationReason;
    scenario.generationDiagnostics = {
      ...generationDiagnostics,
      attempts: generationDiagnostics.attempts.map((entry) => ({
        ...entry,
        stages: (entry.stages || []).map((stage) => ({ ...stage })),
        slowestRouteSearch: entry.slowestRouteSearch
          ? { ...entry.slowestRouteSearch }
          : null
      }))
    };
    return scenario;
  };

  while (attempt < maxAttempts) {
    const workSnapshot = getAnalysisTelemetrySnapshotSafe();
    const softBudgetReached = (
      attempt >= GENERATION_SOFT_BUDGET_MIN_ATTEMPTS &&
      bestScenario &&
      (workSnapshot.totalExpansions ?? 0) >= GENERATION_SOFT_EXPANSION_BUDGET
    );
    if (softBudgetReached) {
      terminationReason = "soft-expansion-budget";
      break;
    }

    const remainingAttempts = maxAttempts - attempt;
    const attemptLabel = attempt + 1;
    const candidateStartedAt = generationNow();
    const telemetryBefore = getAnalysisTelemetrySnapshotSafe();
    const stageTimings = [];
    let lastStage = "Setting up a new candidate";
    let stageStartedAt = candidateStartedAt;

    const recordStageBoundary = (nextStage) => {
      const now = generationNow();
      if (lastStage) {
        stageTimings.push({
          stage: compactGenerationStage(lastStage),
          ms: Number((now - stageStartedAt).toFixed(2))
        });
      }
      lastStage = nextStage;
      stageStartedAt = now;
    };

    if (onProgress) {
      await onProgress(attemptLabel, maxAttempts, lastStage);
    }

    let result;
    try {
      result = await createRandomCandidate(
        assets,
        preferences,
        attemptLabel,
        remainingAttempts,
        async (localEvaluations) => {
          if (!onProgress || localEvaluations <= 1) {
            return;
          }
          const visibleAttempt = Math.min(maxAttempts, attempt + localEvaluations);
          await onProgress(
            visibleAttempt,
            maxAttempts,
            "Trying another checkpoint layout on this board"
          );
        },
        async (stage, localEvaluations = 1) => {
          recordStageBoundary(stage);
          if (!onProgress) {
            return;
          }
          const visibleAttempt = Math.min(maxAttempts, attempt + Math.max(1, localEvaluations));
          await onProgress(visibleAttempt, maxAttempts, stage);
        },
        ({ evaluationsUsed: localEvaluations, bestScenario: candidateBestScenario }) => {
          const completedEvaluations = attempt + Math.max(0, localEvaluations);
          if (completedEvaluations < GENERATION_SOFT_BUDGET_MIN_ATTEMPTS) {
            return false;
          }
          if (!bestScenario && !isViableFallbackScenario(candidateBestScenario)) {
            return false;
          }
          const work = getAnalysisTelemetrySnapshotSafe();
          return (work.totalExpansions ?? 0) >= GENERATION_SOFT_EXPANSION_BUDGET;
        }
      );
    } catch (error) {
      recordStageBoundary("Crashed");
      crashedAttempts += 1;
      lastAttemptError = error;
      attempt += 1;
      const telemetryAfter = getAnalysisTelemetrySnapshotSafe();
      const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
      generationDiagnostics.attempts.push({
        startAttempt: attemptLabel,
        endAttempt: attemptLabel,
        evaluationsUsed: 1,
        elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
        outcome: "crashed",
        reason: error?.message ?? String(error),
        stages: stageTimings,
        routeSearches: routeDelta.searches,
        routeExpansions: routeDelta.expansions,
        routeSearchMs: routeDelta.durationMs,
        cappedRouteSearches: routeDelta.capped,
        slowestRouteSearch: routeDelta.slowest
      });
      console.warn(`Attempt ${attemptLabel} failed during generation`, error);
      continue;
    }

    const evaluationsUsed = Math.max(1, result.evaluationsUsed ?? 1);
    attempt += evaluationsUsed;
    const scenario = result.scenario;
    const lastMeaningfulStage = lastStage;
    recordStageBoundary(scenario ? "Candidate complete" : "Candidate rejected");

    const telemetryAfter = getAnalysisTelemetrySnapshotSafe();
    const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
    const attemptRecord = {
      startAttempt: attemptLabel,
      endAttempt: Math.min(maxAttempts, attemptLabel + evaluationsUsed - 1),
      evaluationsUsed,
      elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
      outcome: scenario?.metrics?.acceptable ? "accepted" : "rejected",
      reason: scenario?.metrics?.acceptable
        ? "accepted"
        : describeGenerationRejection(scenario, lastMeaningfulStage),
      stages: stageTimings,
      routeSearches: routeDelta.searches,
      routeExpansions: routeDelta.expansions,
      routeSearchMs: routeDelta.durationMs,
      cappedRouteSearches: routeDelta.capped,
      slowestRouteSearch: routeDelta.slowest
    };
    generationDiagnostics.attempts.push(attemptRecord);

    if (!scenario) {
      continue;
    }

    scenario.attempts = attempt;

    if (isViableFallbackScenario(scenario) && (!bestScenario || scenario.metrics.fitScore < bestScenario.metrics.fitScore)) {
      bestScenario = scenario;
    }

    if (scenario.metrics.acceptable) {
      terminationReason = "accepted";
      scenario.generationBestMatch = false;
      scenario.generationTerminationReason = terminationReason;
      attachDiagnostics(scenario);
      return {
        scenario,
        attemptsUsed: attempt,
        crashedAttempts,
        lastAttemptError,
        accepted: true,
        terminationReason,
        generationDiagnostics: scenario.generationDiagnostics
      };
    }

    if (onProgress && attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      await onProgress(attempt, maxAttempts, "No exact fit yet — continuing the search");
    }
  }

  if (!terminationReason) {
    terminationReason = attempt >= maxAttempts
      ? "attempt-limit"
      : "search-ended";
  }

  if (bestScenario) {
    bestScenario.generationBestMatch = true;
    bestScenario.generationTerminationReason = terminationReason;
    bestScenario.attempts = attempt;
  }
  attachDiagnostics(bestScenario);

  return {
    scenario: bestScenario,
    attemptsUsed: attempt,
    crashedAttempts,
    lastAttemptError,
    accepted: false,
    terminationReason,
    generationDiagnostics:
      bestScenario?.generationDiagnostics ?? generationDiagnostics
  };
}

function detectScenarioExplanationIssues(scenario) {
  const issues = [];
  const explanationHtml = buildCourseNotesHtml(scenario, [], { includeDiagnostics: true });
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

    clearAnalysisCachesSafe();
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
  const preferences = getPreferencesFromControls();
  isGenerating = true;

  try {
    resetAnalysisTelemetrySafe();
    setGeneratingOverlay(
      true,
      "",
      {
        attempt: 1,
        stage: "Loading course assets",
        preferences
      }
    );
    await nextFrame();
    const assets = await loadAssets();
    initializeBoardAudit(assets);
    const inventoryError = validateSelectedInventory(assets, preferences);
    if (inventoryError) {
      window.alert(inventoryError);
      return;
    }

    clearAnalysisCachesSafe();
    const generation = await generateScenarioForPreferences(assets, preferences, {
      maxAttempts: MAX_ATTEMPTS,
      onProgress: async (attempt, maxAttempts, stage = "") => {
        setGeneratingOverlay(
          true,
          "",
          {
            attempt,
            stage,
            preferences
          }
        );
        await nextFrame();
      }
    });

    if (!generation.scenario) {
      window.alert(
        generation.crashedAttempts > 0 && generation.lastAttemptError
          ? `No playable course was found after ${MAX_ATTEMPTS} attempts. Last error: ${generation.lastAttemptError.message}`
          : `No playable course was found after ${MAX_ATTEMPTS} attempts.`
      );
      return;
    }

    currentScenario = generation.scenario;
    clearTraceStarts();
    clearRouteInspection();
    await ensureScenarioImages(assets, currentScenario);
    pruneImageCache(assets, [
      ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
      boardAuditState.pieceId
    ]);
    renderScenario(currentScenario);
    saveScenarioSnapshot(currentScenario);
    lastScenarioRenderTime = performance.now();
  } finally {
    isGenerating = false;
    setGeneratingOverlay(false);
  }
}

document.getElementById("reroll").addEventListener("click", () => {
  start().catch(console.error);
});

document.getElementById("about-button").addEventListener("click", () => {
  openAboutDialog();
});
document.getElementById("canvas")?.addEventListener("click", (event) => {
  if (!currentScenario || !isDevViewEnabled()) return;
  const tile = getCanvasTileFromEvent(event);
  applyRouteInspection(getInspectableAtTile(currentScenario, tile));
  renderScenario(currentScenario);
});

document.getElementById("canvas")?.addEventListener("dblclick", (event) => {
  if (!currentScenario || !isDevViewEnabled()) return;
  event.preventDefault();
  const tile = getCanvasTileFromEvent(event);
  const legValue = document.getElementById("leg-select")?.value ?? "all";
  const legIndex = legValue === "all" ? null : Number(legValue);
  if (tileTouchesVisibleTrace(currentScenario, tile, legIndex)) {
    selectAllTraceStarts(currentScenario);
  } else {
    clearTraceStarts();
    clearRouteInspection();
  }
  renderScenario(currentScenario);
});



document.getElementById("run-diagnostics").addEventListener("click", () => {
  runDiagnostics().catch((error) => {
    document.getElementById("report").textContent = `Diagnostics failed: ${error.message}`;
    document.getElementById("run-diagnostics").disabled = false;
    console.error(error);
  });
});

async function copyTextToClipboard(text, button, idleLabel, errorContext = "text") {
  if (!text?.trim()) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) {
        throw new Error("Copy command was not available");
      }
    }

    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = idleLabel;
      }, 1400);
    }
  } catch (error) {
    console.warn(`Unable to copy ${errorContext}`, error);
    if (button) {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = idleLabel;
      }, 1800);
    }
  }
}

async function copyCourseEvaluationSummary() {
  if (!currentScenario) {
    return;
  }
  const button = document.getElementById("copy-course-evaluation-summary");
  const text = buildScenarioCopySummary(currentScenario);
  await copyTextToClipboard(text, button, "Copy summary", "Course Evaluation summary");
}

async function copyCourseEvaluationAll() {
  const reportEl = document.getElementById("report");
  const button = document.getElementById("copy-course-evaluation-all");
  const text = reportEl?.textContent ?? "";
  await copyTextToClipboard(text, button, "Copy all", "Course Evaluation");
}

document.getElementById("copy-course-evaluation-summary")?.addEventListener("click", () => {
  copyCourseEvaluationSummary();
});

document.getElementById("copy-course-evaluation-all")?.addEventListener("click", () => {
  copyCourseEvaluationAll();
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
  if (currentScenario) renderScenario(currentScenario);
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
    currentScenario.generationBestMatch ||
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

document.getElementById("show-outlier-routes").addEventListener("change", () => {
  if (currentScenario) {
    renderScenario(currentScenario);
  }
});

document.getElementById("board-audit-toggle").addEventListener("change", () => {
  updateBoardAuditVisibility();
});

function handleOptionalRuleControlClick(event) {
  const button = event.target.closest(".variant-state");
  if (!button) {
    return;
  }

  if (button.dataset.unavailableReason) {
    showToast(button.dataset.unavailableReason);
    return;
  }

  if (button.dataset.overlayControl) {
    cycleOverlayModeControl();
    return;
  }

  if (button.dataset.variantAction === "toggle-category") {
    toggleVariantCategoryStates(button.dataset.variantCategory);
    return;
  }

  if (button.dataset.variantId === "actFast") {
    cycleActFastControlChoice();
    return;
  }

  cycleVariantControlState(button.dataset.variantId);
}

document.querySelectorAll("[data-variant-menu]").forEach((menuEl) => {
  menuEl.addEventListener("click", handleOptionalRuleControlClick);
});

document.getElementById("optional-rules-index-list")?.addEventListener("click", handleOptionalRuleControlClick);
document.getElementById("optional-rules-title")?.addEventListener("click", openOptionalRulesDialog);
document.getElementById("optional-rules-close-icon")?.addEventListener("click", closeOptionalRulesDialog);
document.getElementById("optional-rules-close-button")?.addEventListener("click", closeOptionalRulesDialog);
document.getElementById("optional-rules-search")?.addEventListener("input", (event) => {
  filterOptionalRulesIndex(event.target.value);
});
document.getElementById("optional-rules-dialog")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeOptionalRulesDialog();
  }
});

document.getElementById("player-count")?.addEventListener("change", () => {
  updateVariantAvailability();
});

document.getElementById("expansion-roborally").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-30th-anniversary").addEventListener("change", () => {
  updateExpansionSummary();
});

document.getElementById("expansion-rr-dice").addEventListener("change", () => {
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
    closeOptionalRulesDialog();
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
      await ensureScenarioImages(assets, currentScenario);
      pruneImageCache(assets, [
        ...getPlacementImagePieceIds(currentScenario.placements, currentScenario.pieceMap),
        boardAuditState.pieceId
      ]);
      renderScenario(currentScenario);
      setGeneratingOverlay(false);
      return;
    }
  }

  await start();
}

init().catch(console.error);
