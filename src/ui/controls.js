// Robo Rally Course Randomizer - option controls: expansions, variant pickers and the optional rules dialog, preferences to and from controls, availability updates
import { VARIANT_CONTROL_IDS, VARIANT_DEFINITIONS, isLayoutPreferenceVariant } from "../../variants.js";
import { cachedAssets } from "../generation/assets.js";
import { normalizeGenerationMode } from "../generation/generation-modes.js";
import { getAvailableOverlayIds, getAvailableOverlayKinds } from "../generation/overlays.js";
import {
  ACT_FAST_CONTROL_CHOICES,
  ACT_FAST_MODE_IDS,
  BOARD_SPREAD_CHOICES,
  OVERLAY_MODES,
  OVERLAY_MODE_CYCLE,
  OVERLAY_REBOOT_MODES,
  CHECKPOINT_FLOOR_MODES,
  formatActFastMode,
  formatExpansionName,
  applyBoardSpreadChoice,
  formatOverlayMode,
  getBoardSpreadChoice,
  getSelectedExpansionIds,
  normalizeOptionalRuleCount,
  normalizeOverlayMode,
  normalizeOverlayReboot,
  normalizeCheckpointFloor,
  shouldUseBoardOverlays
} from "../generation/preferences.js";
import { normalizeStartBalance } from "../generation/start-balance.js";
import {
  getConflictingVariantIds,
  getEligibleDockIds,
  getMaximumAvailableDockStartCapacity,
  getRequiredDockStartCount,
  getVariantDefinitionLabel,
  getVariantPreferenceState,
  getVariantStateCopy,
  getVariantUnavailabilityReason,
  normalizeForcedVariantPreferenceConflicts,
  normalizeVariantState,
  variantIsAvailable
} from "../generation/variant-availability.js";
import { showToast } from "./toast.js";
import { TARGET_BAND_ORDER, formatTargetSelection, parseTargetSelection } from "../generation/target-selection.js";

export function createVariantRuleNameElement(variant) {
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = variant.label;
  return nameEl;
}

export function createVariantCategoryBulkRow(category) {
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

export function getBoardSpreadControlButtons() {
  return Array.from(document.querySelectorAll("[data-board-spread-control]"));
}

const BOARD_SPREAD_CHOICE_CYCLE = [
  BOARD_SPREAD_CHOICES.spread,
  BOARD_SPREAD_CHOICES.staggered,
  BOARD_SPREAD_CHOICES.tight
];

function normalizeBoardSpreadChoice(value) {
  return BOARD_SPREAD_CHOICE_CYCLE.includes(value) ? value : BOARD_SPREAD_CHOICES.spread;
}

export function formatBoardSpreadMode(choice) {
  return {
    tight: "Tight",
    spread: "Spread",
    staggered: "Staggered"
  }[normalizeBoardSpreadChoice(choice)];
}

function getBoardSpreadTitle(choice) {
  return {
    tight: "Board Spread: Tight. Makes several arrangements and keeps the most compact. Click for Spread.",
    spread: "Board Spread: Spread. Any shape with board edges lined up, such as a long row or an L; may still come out tight. Click for Staggered.",
    staggered: "Board Spread: Staggered. Boards may also sit shifted along a shared edge; may still come out lined up or tight. Click for Tight."
  }[normalizeBoardSpreadChoice(choice)];
}

export function setBoardSpreadControl(choice, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getBoardSpreadControlButtons();
  if (!targets.length) {
    return;
  }

  const normalized = normalizeBoardSpreadChoice(choice);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.boardSpread = normalized;
    button.dataset.state = normalized === BOARD_SPREAD_CHOICES.spread ? "off" : "allowed";
    button.textContent = formatBoardSpreadMode(normalized);
    button.title = getBoardSpreadTitle(normalized);
    button.setAttribute("aria-label", button.title);
  });
}

export function cycleBoardSpreadControl() {
  const buttonEl = document.getElementById("board-spread");
  if (!buttonEl) {
    return;
  }
  const current = normalizeBoardSpreadChoice(buttonEl.value);
  const next = BOARD_SPREAD_CHOICE_CYCLE[(BOARD_SPREAD_CHOICE_CYCLE.indexOf(current) + 1) % BOARD_SPREAD_CHOICE_CYCLE.length];
  setBoardSpreadControl(next);
  updateVariantSummary();
}

export function createBoardSpreadRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "How freely the boards may be arranged: Tight, Spread or Staggered. Each step allows everything the previous one does.";
  rowEl.dataset.ruleSearch = "board spread tight staggered offset compact layout board arrangement";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Board Spread";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Layout";
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = "Tight makes several arrangements and keeps the most compact. Spread allows any shape with board edges lined up, such as a long row or an L. Staggered also lets a board sit shifted along the edge it shares with another. Each choice may still come out like the stricter ones.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "board-spread";
  }
  buttonEl.className = "variant-state board-spread-state";
  buttonEl.type = "button";
  buttonEl.dataset.boardSpreadControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("board-spread");
  setBoardSpreadControl(primary?.value ?? BOARD_SPREAD_CHOICES.spread, buttonEl);
  return rowEl;
}

export function getOverlayControlButtons() {
  return Array.from(document.querySelectorAll("[data-overlay-control]"));
}

export function isOverlayModeAvailable(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (!pieceMap) {
    return true;
  }
  const expansionIds = getSelectedExpansionIds(preferences);
  return getAvailableOverlayIds(pieceMap, expansionIds).length > 0;
}

export function getOverlayUnavailabilityReason(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  return isOverlayModeAvailable(preferences, pieceMap)
    ? null
    : "Requires overlay tokens or 6x6 boards in the selected sets.";
}

function getOverlayKinds(preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (!pieceMap) {
    return { tokens: true, boards: true };
  }
  return getAvailableOverlayKinds(pieceMap, getSelectedExpansionIds(preferences));
}

// Only the modes that can place something with the selected sets; "Both"
// appears only when both tokens and 6x6 boards exist.
function getOverlayModeCycle(kinds) {
  return OVERLAY_MODE_CYCLE.filter((mode) => (
    mode === OVERLAY_MODES.no ||
    (mode === OVERLAY_MODES.tokens && kinds.tokens) ||
    (mode === OVERLAY_MODES.boards && kinds.boards) ||
    (mode === OVERLAY_MODES.yes && kinds.tokens && kinds.boards)
  ));
}

// The fullest mode the selected sets allow (the "all allowed" state).
function getFullestOverlayMode(kinds) {
  const cycle = getOverlayModeCycle(kinds);
  return cycle[cycle.length - 1];
}

// The mode that places the same pieces as `mode` among the available ones.
function fitOverlayModeToKinds(mode, kinds) {
  const normalized = normalizeOverlayMode(mode);
  if (getOverlayModeCycle(kinds).includes(normalized)) {
    return normalized;
  }
  if (normalized === OVERLAY_MODES.yes) {
    return getFullestOverlayMode(kinds);
  }
  return OVERLAY_MODES.no;
}

let currentOverlayModeCycle = OVERLAY_MODE_CYCLE;

function getOverlayModeTitle(mode) {
  return `Overlays: ${formatOverlayMode(mode)}. Click to cycle ${currentOverlayModeCycle.map(formatOverlayMode).join(", ")}.`;
}

export function setOverlayModeControl(mode, buttonEl = null) {
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
    button.title = getOverlayModeTitle(normalized);
    button.setAttribute("aria-label", button.title);
  });
}

export function updateOverlayAvailability(preferences = getPreferencesFromControls()) {
  const reason = getOverlayUnavailabilityReason(preferences);
  if (!reason) {
    const kinds = getOverlayKinds(preferences);
    currentOverlayModeCycle = getOverlayModeCycle(kinds);
    const primary = document.getElementById("overlay-mode");
    if (primary) {
      const fitted = fitOverlayModeToKinds(primary.value, kinds);
      if (fitted !== normalizeOverlayMode(primary.value)) {
        setOverlayModeControl(fitted);
      }
    }
  }
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
      buttonEl.title = getOverlayModeTitle(mode);
      buttonEl.setAttribute("aria-label", buttonEl.title);
    }
  });
}

export function cycleOverlayModeControl() {
  const buttonEl = document.getElementById("overlay-mode");
  if (!buttonEl) {
    return;
  }
  if (buttonEl.dataset.unavailableReason) {
    showToast(buttonEl.dataset.unavailableReason);
    return;
  }

  const current = normalizeOverlayMode(buttonEl.value);
  const cycle = getOverlayModeCycle(getOverlayKinds(getPreferencesFromControls()));
  const currentIndex = cycle.indexOf(current);
  const next = cycle[(currentIndex + 1) % cycle.length];
  setOverlayModeControl(next);
  updateOverlayRebootAvailability(getPreferencesFromControls());
  updateVariantSummary();
}

export function createOverlayModeRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Controls whether available overlay-capable boards and tokens may be placed as overlays.";
  rowEl.dataset.ruleSearch = "overlays board layout layout master builder tokens boards";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Overlays";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Layout";
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

export function getOverlayRebootControlButtons() {
  return Array.from(document.querySelectorAll("[data-overlay-reboot-control]"));
}

export function formatOverlayRebootMode(mode) {
  return normalizeOverlayReboot(mode) === OVERLAY_REBOOT_MODES.own ? "Own" : "Shared";
}

function getOverlayRebootTitle(mode) {
  return normalizeOverlayReboot(mode) === OVERLAY_REBOOT_MODES.own
    ? "Overlay Reboot Tokens: Own. Each overlay board has its own reboot token. Click for Shared."
    : "Overlay Reboot Tokens: Shared. A robot destroyed on an overlay board reboots at the token of the board underneath. Click for Own.";
}

export function setOverlayRebootControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getOverlayRebootControlButtons();
  const normalized = normalizeOverlayReboot(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.state = normalized === OVERLAY_REBOOT_MODES.own ? "allowed" : "off";
    button.textContent = formatOverlayRebootMode(normalized);
    if (!button.dataset.unavailableReason) {
      button.title = getOverlayRebootTitle(normalized);
      button.setAttribute("aria-label", button.title);
    }
  });
}

export function cycleOverlayRebootControl() {
  const buttonEl = document.getElementById("overlay-reboot");
  if (!buttonEl) {
    return;
  }
  setOverlayRebootControl(
    normalizeOverlayReboot(buttonEl.value) === OVERLAY_REBOOT_MODES.own
      ? OVERLAY_REBOOT_MODES.shared
      : OVERLAY_REBOOT_MODES.own
  );
  updateVariantSummary();
}

// Only meaningful when overlay boards can be placed and reboot tokens are used.
function getOverlayRebootUnavailabilityReason(preferences) {
  if (getOverlayUnavailabilityReason(preferences) || !getOverlayKinds(preferences).boards) {
    return "Requires 6x6 boards in the selected sets (placed as overlay boards).";
  }
  if (!shouldUseBoardOverlays(preferences)) {
    return "Applies to overlay boards: set Overlays to Boards or Both.";
  }
  return null;
}

function updateOverlayRebootAvailability(preferences) {
  const reason = getOverlayRebootUnavailabilityReason(preferences);
  getOverlayRebootControlButtons().forEach((buttonEl) => {
    // Shown only when overlay boards can be placed (2026-11-10).
    buttonEl.closest(".variant-rule")?.classList.toggle("hidden", Boolean(reason));
    if (reason) {
      buttonEl.dataset.unavailableReason = reason;
      buttonEl.classList.add("unavailable");
      buttonEl.setAttribute("aria-disabled", "true");
      buttonEl.title = reason;
      buttonEl.setAttribute("aria-label", `Overlay Reboot Tokens: unavailable. ${reason}`);
    } else {
      delete buttonEl.dataset.unavailableReason;
      buttonEl.classList.remove("unavailable");
      buttonEl.removeAttribute("aria-disabled");
      buttonEl.title = getOverlayRebootTitle(buttonEl.value);
      buttonEl.setAttribute("aria-label", buttonEl.title);
    }
  });
}

export function createOverlayRebootRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Whether each overlay board has its own reboot token, or robots destroyed on it use the token of the board underneath.";
  rowEl.dataset.ruleSearch = "overlay reboot tokens boards master builder layout";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Overlay Reboot Tokens";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Layout";
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = "Own gives each overlay board its own reboot token. Shared lets a robot destroyed on an overlay board reboot at the token of the board underneath.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "overlay-reboot";
  }
  buttonEl.className = "variant-state overlay-reboot-state";
  buttonEl.type = "button";
  buttonEl.dataset.overlayRebootControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("overlay-reboot");
  setOverlayRebootControl(primary?.value ?? OVERLAY_REBOOT_MODES.own, buttonEl);
  return rowEl;
}

export function getCheckpointFloorControlButtons() {
  return Array.from(document.querySelectorAll("[data-checkpoint-floor-control]"));
}

export function formatCheckpointFloorMode(mode) {
  return normalizeCheckpointFloor(mode) === CHECKPOINT_FLOOR_MODES.clear ? "Clear floor" : "Any";
}

function getCheckpointFloorTitle(mode) {
  return normalizeCheckpointFloor(mode) === CHECKPOINT_FLOOR_MODES.clear
    ? "Checkpoint Squares: Clear floor. Checkpoints sit only on plain floor (walls allowed), as in the 1994 first edition. Click for Any."
    : "Checkpoint Squares: Any. Checkpoints may sit on board elements. Click for Clear floor.";
}

export function setCheckpointFloorControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getCheckpointFloorControlButtons();
  const normalized = normalizeCheckpointFloor(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.state = normalized === CHECKPOINT_FLOOR_MODES.clear ? "allowed" : "off";
    button.textContent = formatCheckpointFloorMode(normalized);
    button.title = getCheckpointFloorTitle(normalized);
    button.setAttribute("aria-label", button.title);
  });
}

export function cycleCheckpointFloorControl() {
  const buttonEl = document.getElementById("checkpoint-floor");
  if (!buttonEl) {
    return;
  }
  setCheckpointFloorControl(
    normalizeCheckpointFloor(buttonEl.value) === CHECKPOINT_FLOOR_MODES.clear
      ? CHECKPOINT_FLOOR_MODES.any
      : CHECKPOINT_FLOOR_MODES.clear
  );
  // Clear floor makes Hazardous Checkpoints and Moving Targets unavailable.
  updateVariantAvailability();
}

export function createCheckpointFloorRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Whether checkpoints may sit on board elements, or only on plain floor as in the 1994 first edition.";
  rowEl.dataset.ruleSearch = "checkpoint squares clear floor plain 1994 first edition layout";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Checkpoint Squares";
  nameWrapEl.appendChild(nameEl);
  if (options.showCategory) {
    const categoryEl = document.createElement("div");
    categoryEl.className = "variant-rule-category";
    categoryEl.textContent = "Layout";
    nameWrapEl.appendChild(categoryEl);
  }
  if (options.showDescription) {
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "variant-rule-description";
    descriptionEl.textContent = "Any lets checkpoints sit on board elements. Clear floor keeps them on plain floor (walls allowed), as in the 1994 first edition; Hazardous Checkpoints and Moving Targets are then unavailable.";
    nameWrapEl.appendChild(descriptionEl);
  }

  const buttonEl = document.createElement("button");
  if (!options.mirror) {
    buttonEl.id = "checkpoint-floor";
  }
  buttonEl.className = "variant-state checkpoint-floor-state";
  buttonEl.type = "button";
  buttonEl.dataset.checkpointFloorControl = "true";

  rowEl.append(nameWrapEl, buttonEl);

  const primary = document.getElementById("checkpoint-floor");
  setCheckpointFloorControl(primary?.value ?? CHECKPOINT_FLOOR_MODES.any, buttonEl);
  return rowEl;
}

export function normalizeActFastControlChoice(choice, variantState = null, mode = null) {
  if (ACT_FAST_CONTROL_CHOICES.some((entry) => entry.id === choice)) {
    return choice;
  }
  if (mode && ACT_FAST_MODE_IDS.has(mode)) {
    return mode;
  }
  const normalizedState = normalizeVariantState(variantState);
  if (normalizedState === "forced") return "forced_random";
  return normalizedState === "allowed" ? "allowed" : "off";
}

export function getActFastControlChoice(buttonEl = null) {
  const button = buttonEl ?? document.getElementById(VARIANT_CONTROL_IDS.actFast);
  return normalizeActFastControlChoice(
    button?.dataset.actFastChoice,
    button?.dataset.state,
    button?.dataset.actFastMode
  );
}

export function getActFastModeFromControls() {
  const button = document.getElementById(VARIANT_CONTROL_IDS.actFast);
  const mode = button?.dataset.actFastMode ?? null;
  return ACT_FAST_MODE_IDS.has(mode) ? mode : null;
}

export function setActFastControlChoice(choice, buttonEl = null) {
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

export function cycleActFastControlChoice() {
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

export function createVariantRuleRow(variant, options = {}) {
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

export function renderOptionalRulesIndex() {
  const listEl = document.getElementById("optional-rules-index-list");
  if (!listEl) {
    return;
  }
  listEl.replaceChildren();
  // Rules only; the layout preferences live in the Layout picker.
  VARIANT_DEFINITIONS
    .filter((variant) => !isLayoutPreferenceVariant(variant))
    .sort((left, right) => left.label.localeCompare(right.label))
    .forEach((variant) => {
      listEl.appendChild(createVariantRuleRow(variant, { mirror: true, showCategory: true, showDescription: true }));
    });
  updateVariantAvailability();
}

export function filterOptionalRulesIndex(query = "") {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll("#optional-rules-index-list .variant-rule").forEach((rowEl) => {
    const haystack = rowEl.dataset.ruleSearch ?? rowEl.textContent?.toLowerCase() ?? "";
    rowEl.classList.toggle("hidden", Boolean(normalized) && !haystack.includes(normalized));
  });
}

export function openOptionalRulesDialog() {
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

export function closeOptionalRulesDialog() {
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

export function renderVariantControls() {
  const menuEls = Array.from(document.querySelectorAll("[data-variant-menu]"));
  if (!menuEls.length) {
    return;
  }

  menuEls.forEach((menuEl) => {
    const category = menuEl.dataset.variantCategory;
    const variants = getVariantsForUiCategory(category);
    menuEl.replaceChildren();

    if (category === UI_LAYOUT_CATEGORY) {
      // Descriptions shown inline: phones never display hover titles.
      menuEl.appendChild(createBoardSpreadRow({ showDescription: true }));
      menuEl.appendChild(createOverlayModeRow({ showDescription: true }));
      menuEl.appendChild(createOverlayRebootRow({ showDescription: true }));
      menuEl.appendChild(createCheckpointFloorRow({ showDescription: true }));
    } else {
      menuEl.appendChild(createVariantCategoryBulkRow(category));
    }

    variants.forEach((variant) => {
      menuEl.appendChild(createVariantRuleRow(variant, { showDescription: category === UI_LAYOUT_CATEGORY }));
    });
  });

  renderOptionalRulesIndex();
  updateVariantSummary();
}

// The Layout picker (outside Optional Rules) holds the layout preferences:
// Board Spread (incl. Staggered Boards), Overlays, Overlay Reboot Tokens,
// Checkpoint Squares, Extra Docks and Sandwiched Dock (2026-11-10).
export const UI_LAYOUT_CATEGORY = "layout";

export function getVariantUiCategory(variantOrCategory) {
  const category = typeof variantOrCategory === "string"
    ? variantOrCategory
    : variantOrCategory?.category;

  return category === "board-layout" ? UI_LAYOUT_CATEGORY : category;
}

export function getVariantUiCategoryLabel(variantOrCategory) {
  return String(getVariantUiCategory(variantOrCategory) ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Staggered Boards has no row of its own: it is the Staggered choice of Board Spread.
export function getVariantsForUiCategory(category) {
  return VARIANT_DEFINITIONS.filter((variant) => (
    getVariantUiCategory(variant) === category && variant.id !== "staggeredBoards"
  ));
}

export function getVariantCategoryStates(category) {
  return getVariantsForUiCategory(category)
    .map((variant) => ({
      id: variant.id,
      label: variant.label,
      state: getVariantControlState(variant.id)
    }));
}

export function getVariantCategoryAllAllowed(category, states = getVariantCategoryStates(category)) {
  return states.every((entry) => entry.state === "allowed" || entry.state === "forced");
}

// Optional rules only: layout preferences are not rules.
export function countSelectedOptionalRules() {
  return VARIANT_DEFINITIONS.filter((variant) => (
    !isLayoutPreferenceVariant(variant) && getVariantControlState(variant.id) !== "off"
  )).length;
}

export function updateLayoutSummary() {
  const summaryEl = document.getElementById("layout-summary");
  if (!summaryEl) {
    return;
  }
  const preferences = getPreferencesFromControls();
  const spreadLabel = formatBoardSpreadMode(document.getElementById("board-spread")?.value);
  const overlayAvailable = isOverlayModeAvailable(preferences);
  const overlaysOn = overlayAvailable && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no;
  summaryEl.textContent = overlaysOn ? `${spreadLabel} · Overlays` : spreadLabel;
  summaryEl.title = [
    `Board Spread: ${spreadLabel}`,
    `Overlays: ${formatOverlayMode(preferences.overlayMode)}${overlayAvailable ? "" : " (unavailable)"}`,
    ...(shouldUseBoardOverlays(preferences) && overlayAvailable ? [`Overlay Reboot Tokens: ${formatOverlayRebootMode(preferences.overlayReboot)}`] : []),
    `Checkpoint Squares: ${formatCheckpointFloorMode(preferences.checkpointFloor)}`,
    ...getVariantsForUiCategory(UI_LAYOUT_CATEGORY).map((variant) => (
      `${variant.label}: ${getVariantStateCopy(variant.id, getVariantControlState(variant.id)).label}`
    ))
  ].join(", ");
}

export function updateVariantSummary() {
  document.querySelectorAll("[data-variant-summary]").forEach((summaryEl) => {
    const category = summaryEl.dataset.variantCategory;
    const states = getVariantCategoryStates(category);
    const enabled = states.filter((entry) => entry.state !== "off");
    let selectedCount = enabled.length;

    {
      summaryEl.title = states.map((entry) => `${entry.label}: ${entry.id === "actFast" && getActFastModeFromControls() ? formatActFastMode(getActFastModeFromControls()) : getVariantStateCopy(entry.id, entry.state).label}`).join(", ");
    }
    summaryEl.textContent = `${selectedCount} selected`;

    const menuEl = document.querySelector(`[data-variant-menu][data-variant-category="${category}"]`);
    const bulkButton = menuEl?.querySelector('[data-variant-action="toggle-category"]');
    if (!bulkButton) {
      return;
    }

    const allAllowed = getVariantCategoryAllAllowed(category, states);
    bulkButton.textContent = allAllowed ? "No" : "Allow";
    const categoryLabel = getVariantUiCategoryLabel(category);
    bulkButton.title = allAllowed
      ? `Set optional ${categoryLabel} rules to No`
      : `Set ${categoryLabel} rules to Allow`;
    bulkButton.setAttribute("aria-label", bulkButton.title);
    const bulkName = bulkButton.parentElement?.querySelector(".variant-rule-name");
    if (bulkName) {
      bulkName.textContent = allAllowed ? "Allow none" : "Allow all";
    }
  });

  updateLayoutSummary();

  const indexButton = document.getElementById("optional-rules-title");
  if (indexButton) {
    const selectedCount = countSelectedOptionalRules();
    indexButton.textContent = `Optional Rules · ${selectedCount} selected`;
    indexButton.setAttribute("aria-label", `Open searchable optional rules list. ${selectedCount} selected.`);
  }
}

export function toggleVariantCategoryStates(category) {
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

  updateVariantAvailability();
  updateVariantSummary();
}

export function updateExpansionSummary() {
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
  if (document.getElementById("expansion-contamination").checked) {
    enabled.push(formatExpansionName("contamination"));
  }
  if (document.getElementById("expansion-turn-and-burn").checked) {
    enabled.push(formatExpansionName("turn-and-burn"));
  }

  if (document.getElementById("expansion-transformers").checked) {
    enabled.push(formatExpansionName("transformers"));
  }

  summaryEl.textContent = `${enabled.length} selected`;
  summaryEl.title = enabled.length ? enabled.join(", ") : "None";
  updateVariantAvailability();
}

export function closeVariantPicker() {
  document.querySelectorAll(".variant-picker").forEach((picker) => {
    picker.removeAttribute("open");
  });
}

export function getVariantControlState(variantId) {
  const button = document.getElementById(VARIANT_CONTROL_IDS[variantId]);
  return normalizeVariantState(button?.dataset.state ?? "off");
}

export function setVariantControlState(variantId, state, buttonEl = null) {
  const normalized = normalizeVariantState(state);
  if (variantId === "actFast") {
    if (normalized === "off" || normalized === "allowed") {
      setActFastControlChoice(normalized, buttonEl);
      return;
    }
    const currentChoice = getActFastControlChoice(buttonEl);
    setActFastControlChoice(ACT_FAST_MODE_IDS.has(currentChoice) ? currentChoice : "forced_random", buttonEl);
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

export function cycleVariantControlState(variantId) {
  const current = getVariantControlState(variantId);
  const next = isLayoutPreferenceVariant(variantId)
    ? (current === "off" ? "allowed" : "off")
    : current === "off"
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

export function pageGetAvailableConcretePreferenceValues(selectId) {
  // Difficulty / Length pickers: every band offered by the picker.
  const pickerInputs = getTargetPickerInputs(selectId);
  if (pickerInputs.length) {
    return pickerInputs.filter((inputEl) => !inputEl.disabled).map((inputEl) => inputEl.value);
  }
  const select = document.getElementById(selectId);
  if (!select) {
    return [];
  }

  return Array.from(select.options ?? [])
    .filter((option) => {
      const value = String(option.value ?? "").trim();
      const parent = option.parentElement;
      const parentDisabled = parent?.tagName === "OPTGROUP" && Boolean(parent.disabled);
      return Boolean(
        value &&
        value !== "any" &&
        !option.disabled &&
        !option.hidden &&
        !parentDisabled
      );
    })
    .map((option) => String(option.value).trim());
}

export function getPreferencesFromControls() {
  const boardSpreadPreferences = applyBoardSpreadChoice(
    normalizeBoardSpreadChoice(document.getElementById("board-spread")?.value)
  );
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    startBalance: normalizeStartBalance(document.getElementById("start-balance")?.value),
    generationMode: normalizeGenerationMode(document.getElementById("generation-mode")?.value),
    boardSpread: boardSpreadPreferences.boardSpread,
    optionalRuleCount: normalizeOptionalRuleCount(document.getElementById("optional-rule-count")?.value),
    overlayMode: normalizeOverlayMode(document.getElementById("overlay-mode")?.value),
    overlayReboot: normalizeOverlayReboot(document.getElementById("overlay-reboot")?.value),
    checkpointFloor: normalizeCheckpointFloor(document.getElementById("checkpoint-floor")?.value),
    actFastMode: getActFastModeFromControls(),
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "rr-dice": document.getElementById("expansion-rr-dice").checked,
      "30th-anniversary": document.getElementById("expansion-30th-anniversary").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "chaos-and-carnage": document.getElementById("expansion-chaos-and-carnage").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked,
      "contamination": document.getElementById("expansion-contamination").checked,
      "turn-and-burn": document.getElementById("expansion-turn-and-burn").checked,
      "transformers": document.getElementById("expansion-transformers").checked
    },
    allowedVariantRules: {
      ...Object.fromEntries(
        VARIANT_DEFINITIONS.map((variant) => [variant.id, getVariantControlState(variant.id)])
      ),
      staggeredBoards: boardSpreadPreferences.staggeredBoards
    }
  };
}

export function applyPreferencesToControls(preferences) {
  if (!preferences) {
    return;
  }

  const {
    preferences: normalizedPreferences,
    relaxedIds
  } = normalizeForcedVariantPreferenceConflicts(preferences);

  document.getElementById("player-count").value = String(normalizedPreferences.playerCount ?? 4);
  document.getElementById("difficulty").value = formatTargetSelection(normalizedPreferences.difficulty ?? "any", "difficulty");
  document.getElementById("length").value = formatTargetSelection(normalizedPreferences.length ?? "any", "length");
  syncTargetPickerFromValue("difficulty");
  syncTargetPickerFromValue("length");
  const startBalanceEl = document.getElementById("start-balance");
  if (startBalanceEl) {
    startBalanceEl.value = normalizeStartBalance(normalizedPreferences.startBalance);
  }
  const generationModeEl = document.getElementById("generation-mode");
  if (generationModeEl) {
    // Missing means a pre-Mode saved scenario, whose search behavior was the
    // current Balanced profile. Fresh pages still default to Standard in HTML.
    generationModeEl.value = normalizedPreferences.generationMode
      ? normalizeGenerationMode(normalizedPreferences.generationMode)
      : "balanced";
  }
  // Older saves keep Staggered Boards as its own rule: Yes or Must reads as Staggered.
  setBoardSpreadControl(getBoardSpreadChoice(
    normalizedPreferences,
    getVariantPreferenceState(normalizedPreferences, "staggeredBoards")
  ));
  const ruleCountEl = document.getElementById("optional-rule-count");
  if (ruleCountEl) {
    ruleCountEl.value = String(normalizeOptionalRuleCount(normalizedPreferences.optionalRuleCount));
  }
  setOverlayModeControl(normalizedPreferences.overlayMode);
  setOverlayRebootControl(normalizedPreferences.overlayReboot);
  setCheckpointFloorControl(normalizedPreferences.checkpointFloor);
  document.getElementById("expansion-roborally").checked = normalizedPreferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-rr-dice").checked = normalizedPreferences.selectedExpansions?.["rr-dice"] ?? false;
  document.getElementById("expansion-30th-anniversary").checked = normalizedPreferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = normalizedPreferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = normalizedPreferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = normalizedPreferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = normalizedPreferences.selectedExpansions?.["wet-and-wild"] ?? false;
  document.getElementById("expansion-contamination").checked = normalizedPreferences.selectedExpansions?.["contamination"] ?? false;
  document.getElementById("expansion-turn-and-burn").checked = normalizedPreferences.selectedExpansions?.["turn-and-burn"] ?? false;
  document.getElementById("expansion-transformers").checked = normalizedPreferences.selectedExpansions?.["transformers"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    if (variant.id === "actFast") {
      return;
    }
    const state = getVariantPreferenceState(normalizedPreferences, variant.id);
    // Layout preferences have no Must: a saved Must reads as Yes.
    setVariantControlState(variant.id, isLayoutPreferenceVariant(variant) && state === "forced" ? "allowed" : state);
  });
  const actFastState = getVariantPreferenceState(normalizedPreferences, "actFast");
  const actFastChoice = actFastState === "forced"
    ? (ACT_FAST_MODE_IDS.has(normalizedPreferences.actFastMode) ? normalizedPreferences.actFastMode : "forced_random")
    : actFastState === "allowed"
      ? "allowed"
      : "off";
  setActFastControlChoice(actFastChoice);
  updateExpansionSummary();

  if (relaxedIds.length) {
    showToast(
      `Conflicting saved Must rules were normalized. ${relaxedIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} changed to Allow.`
    );
  }
}

// Current Robo Rally sets play up to 6; only the 30th Anniversary Edition
// supports 7-8 players (earlier editions' 8 is not the standard now).
const MAX_PLAYERS_WITHOUT_30TH_ANNIVERSARY = 6;

function getMaxPlayerCount(expansionIds) {
  return expansionIds.has("30th-anniversary") ? Infinity : MAX_PLAYERS_WITHOUT_30TH_ANNIVERSARY;
}

// Brings the player count within what the selected sets support (also after a
// restored save); runs before anything else reads the count.
function clampPlayerCountToSets() {
  const select = document.getElementById("player-count");
  if (!select) return;
  const maxPlayers = getMaxPlayerCount(getSelectedExpansionIds(getPreferencesFromControls()));
  const previous = select.value;
  if (previous && Number(previous) <= maxPlayers) return;
  select.value = String(Math.min(maxPlayers, MAX_PLAYERS_WITHOUT_30TH_ANNIVERSARY));
  if (previous) {
    showToast(`Player count set to ${select.value}: 7-8 players needs Robo Rally 30th Anniversary Edition.`);
  }
}

export function updatePlayerCountAvailability(preferences = getPreferencesFromControls()) {
  const select = document.getElementById("player-count");
  if (!select || !cachedAssets?.pieceMap) {
    return;
  }

  const competitiveModeEnabled = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const expansionIds = getSelectedExpansionIds(preferences);
  const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds);
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const docklessOptionPermitted = noDocksState !== "off";
  const maxPlayers = getMaxPlayerCount(expansionIds);

  Array.from(select.options).forEach((option) => {
    const playerCount = Number(option.value);
    option.disabled = false;
    option.title = "";

    if (playerCount > maxPlayers) {
      option.disabled = true;
      option.title = "7-8 players needs Robo Rally 30th Anniversary Edition.";
      return;
    }

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

export function updateVariantAvailability() {
  clampPlayerCountToSets();
  let preferences = getPreferencesFromControls();

  const competitiveModeForced = getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  const noDocksState = getVariantPreferenceState(preferences, "noDocks");
  const extraDocksState = getVariantPreferenceState(preferences, "extraDocks");
  if (competitiveModeForced && noDocksState === "off" && extraDocksState === "off" && cachedAssets?.pieceMap) {
    const expansionIds = getSelectedExpansionIds(preferences);
    const dockIds = getEligibleDockIds(cachedAssets.pieceMap, expansionIds);
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
        `Extra Docks was set to Allow because Competitive Mode with ${preferences.playerCount} players needs ${requiredStarts} starting spaces.`
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
          `${variant.label} was relaxed to Allow. ${reason}`
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
  updateOverlayRebootAvailability(preferences);
  updateVariantSummary();
}

// Phones never show hover titles (user 2026-11-11): a "?" after each field title
// that has one toggles the same text under the field. Desktop keeps the hover.
export function installFieldHelp() {
  document.querySelectorAll(".controls > label[title], .optional-rules-fields > label[title]").forEach((labelEl) => {
    const titleNode = [...labelEl.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!titleNode || labelEl.querySelector(".field-help-toggle")) return;
    const titleText = titleNode.textContent.trim();
    const rowEl = document.createElement("span");
    rowEl.className = "field-title";
    rowEl.append(titleText);
    const buttonEl = document.createElement("button");
    buttonEl.type = "button";
    buttonEl.className = "field-help-toggle";
    buttonEl.textContent = "?";
    buttonEl.setAttribute("aria-label", `About ${titleText}`);
    buttonEl.setAttribute("aria-expanded", "false");
    rowEl.append(buttonEl);
    titleNode.replaceWith(rowEl);
    const helpEl = document.createElement("span");
    helpEl.className = "field-help";
    helpEl.hidden = true;
    helpEl.textContent = labelEl.title;
    labelEl.append(helpEl);
    buttonEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      helpEl.hidden = !helpEl.hidden;
      buttonEl.setAttribute("aria-expanded", String(!helpEl.hidden));
    });
  });
}

// Difficulty and Length pickers: checkboxes in a picker like Sets; a hidden
// input with the same id keeps the saved value ("any", "hard" or
// "moderate,hard"; target-selection.js) so the rest of the page reads it as before.
const TARGET_SUMMARY_LABELS = {
  difficulty: { easy: "Beginner", moderate: "Intermediate", hard: "Advanced", brutal: "Robots. Must. Die." },
  length: { short: "Short", moderate: "Medium", long: "Long", epic: "Epic" }
};

function getTargetPickerInputs(axis) {
  return [...document.querySelectorAll(`[data-target-axis="${axis}"] input[type="checkbox"]`)];
}

function updateTargetPickerSummary(axis) {
  const summaryEl = document.getElementById(`${axis}-summary`);
  if (!summaryEl) return;
  const picked = parseTargetSelection(document.getElementById(axis)?.value, axis);
  const labels = picked.map((band) => TARGET_SUMMARY_LABELS[axis][band]);
  // Closed picker: the name when one is picked, otherwise a count (as Sets);
  // none or all picked reads "Any".
  summaryEl.textContent = !picked.length || picked.length === TARGET_BAND_ORDER[axis].length
    ? "Any"
    : picked.length === 1
      ? labels[0]
      : `${picked.length} selected`;
  summaryEl.title = picked.length ? labels.join(", ") : "Any";
}

export function syncTargetPickerFromValue(axis) {
  const picked = new Set(parseTargetSelection(document.getElementById(axis)?.value, axis));
  getTargetPickerInputs(axis).forEach((inputEl) => {
    inputEl.checked = picked.has(inputEl.value);
  });
  updateTargetPickerSummary(axis);
}

export function installTargetPickers() {
  for (const axis of Object.keys(TARGET_BAND_ORDER)) {
    getTargetPickerInputs(axis).forEach((inputEl) => {
      inputEl.addEventListener("change", () => {
        const hiddenEl = document.getElementById(axis);
        if (!hiddenEl) return;
        hiddenEl.value = formatTargetSelection(
          getTargetPickerInputs(axis).filter((entry) => entry.checked).map((entry) => entry.value),
          axis
        );
        updateTargetPickerSummary(axis);
      });
    });
    syncTargetPickerFromValue(axis);
  }
}
