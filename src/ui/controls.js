// Robo Rally Course Randomizer - option controls: expansions, variant pickers and the optional rules dialog, preferences to and from controls, availability updates
import { VARIANT_CONTROL_IDS, VARIANT_DEFINITIONS } from "../../variants.js";
import { cachedAssets } from "../generation/assets.js";
import { DIAGNOSTIC_DIFFICULTIES, DIAGNOSTIC_LENGTHS } from "../generation/config.js";
import { normalizeGenerationMode } from "../generation/generation-modes.js";
import { getAvailableOverlayIds } from "../generation/overlays.js";
import {
  ACT_FAST_CONTROL_CHOICES,
  ACT_FAST_MODE_IDS,
  BOARD_SPREAD_MODES,
  OVERLAY_MODES,
  OVERLAY_MODE_CYCLE,
  formatActFastMode,
  formatExpansionName,
  formatOverlayMode,
  getSelectedExpansionIds,
  normalizeBoardSpread,
  normalizeOverlayMode
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

export function formatBoardSpreadMode(mode) {
  return normalizeBoardSpread(mode) === BOARD_SPREAD_MODES.tight ? "Tight" : "Random";
}

export function setBoardSpreadControl(mode, buttonEl = null) {
  const targets = buttonEl ? [buttonEl] : getBoardSpreadControlButtons();
  if (!targets.length) {
    return;
  }

  const normalized = normalizeBoardSpread(mode);
  targets.forEach((button) => {
    button.value = normalized;
    button.dataset.boardSpread = normalized;
    button.dataset.state = normalized === BOARD_SPREAD_MODES.tight ? "allowed" : "off";
    button.textContent = formatBoardSpreadMode(normalized);
    button.title = `Board Spread: ${formatBoardSpreadMode(normalized)}. Click to cycle Random and Tight.`;
    button.setAttribute("aria-label", button.title);
  });
}

export function cycleBoardSpreadControl() {
  const buttonEl = document.getElementById("board-spread");
  if (!buttonEl) {
    return;
  }
  const current = normalizeBoardSpread(buttonEl.value);
  const next = current === BOARD_SPREAD_MODES.tight
    ? BOARD_SPREAD_MODES.random
    : BOARD_SPREAD_MODES.tight;
  setBoardSpreadControl(next);
  updateVariantSummary();
}

export function createBoardSpreadRow(options = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-rule";
  rowEl.title = "Tight prefers more compact board arrangements without excluding large boards. With only a few boards, it usually makes little difference.";
  rowEl.dataset.ruleSearch = "board spread random tight compact layout setup layout board arrangement";

  const nameWrapEl = document.createElement("div");
  nameWrapEl.className = "variant-rule-name-wrap";
  const nameEl = document.createElement("div");
  nameEl.className = "variant-rule-name";
  nameEl.textContent = "Board Spread";
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
    descriptionEl.textContent = "Random keeps the ordinary layout mix. Tight prefers more compact arrangements without excluding large boards. With only a few boards, it usually makes little difference.";
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
  setBoardSpreadControl(primary?.value ?? BOARD_SPREAD_MODES.random, buttonEl);
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
    : "Requires overlay-capable boards or tokens in the selected sets.";
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
    button.title = `Overlays: ${formatOverlayMode(normalized)}. Click to cycle No, Tokens, Boards, Both.`;
    button.setAttribute("aria-label", button.title);
  });
}

export function updateOverlayAvailability(preferences = getPreferencesFromControls()) {
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
      buttonEl.title = `Overlays: ${formatOverlayMode(mode)}. Click to cycle No, Tokens, Boards, Both.`;
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
  const currentIndex = OVERLAY_MODE_CYCLE.indexOf(current);
  const next = OVERLAY_MODE_CYCLE[(currentIndex + 1) % OVERLAY_MODE_CYCLE.length];
  setOverlayModeControl(next);
  updateVariantSummary();
}

export function createOverlayModeRow(options = {}) {
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
  const entries = [
    { type: "board-spread", label: "Board Spread" },
    { type: "overlay", label: "Overlays" },
    ...VARIANT_DEFINITIONS.map((variant) => ({ type: "variant", label: variant.label, variant }))
  ].sort((left, right) => left.label.localeCompare(right.label));

  entries.forEach((entry) => {
    if (entry.type === "board-spread") {
      listEl.appendChild(createBoardSpreadRow({ mirror: true, showCategory: true, showDescription: true }));
      return;
    }
    if (entry.type === "overlay") {
      listEl.appendChild(createOverlayModeRow({ mirror: true, showCategory: true, showDescription: true }));
      return;
    }
    listEl.appendChild(createVariantRuleRow(entry.variant, { mirror: true, showCategory: true, showDescription: true }));
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

    const bulkRowEl = createVariantCategoryBulkRow(category);
    menuEl.appendChild(bulkRowEl);

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      menuEl.appendChild(createBoardSpreadRow());
      menuEl.appendChild(createOverlayModeRow());
    }

    variants.forEach((variant) => {
      menuEl.appendChild(createVariantRuleRow(variant));
    });
  });

  renderOptionalRulesIndex();
  updateVariantSummary();
}

export const UI_SETUP_LAYOUT_CATEGORY = "setup-layout";

export function getVariantUiCategory(variantOrCategory) {
  const category = typeof variantOrCategory === "string"
    ? variantOrCategory
    : variantOrCategory?.category;

  return category === "setup" || category === "board-layout" || category === UI_SETUP_LAYOUT_CATEGORY
    ? UI_SETUP_LAYOUT_CATEGORY
    : category;
}

export function getVariantUiCategoryLabel(variantOrCategory) {
  const category = getVariantUiCategory(variantOrCategory);
  return category === UI_SETUP_LAYOUT_CATEGORY
    ? "Setup & Layout"
    : String(category ?? "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getVariantsForUiCategory(category) {
  return VARIANT_DEFINITIONS.filter((variant) => getVariantUiCategory(variant) === category);
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
  const variantsAllowed = states.every((entry) => entry.state === "allowed" || entry.state === "forced");
  if (category !== UI_SETUP_LAYOUT_CATEGORY) {
    return variantsAllowed;
  }
  const preferences = getPreferencesFromControls();
  const boardSpreadTight = normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight;
  if (!isOverlayModeAvailable(preferences)) {
    return variantsAllowed && boardSpreadTight;
  }
  return variantsAllowed && boardSpreadTight && normalizeOverlayMode(document.getElementById("overlay-mode")?.value) === OVERLAY_MODES.yes;
}

export function countSelectedOptionalRules() {
  const variantCount = VARIANT_DEFINITIONS.filter((variant) => getVariantControlState(variant.id) !== "off").length;
  const preferences = getPreferencesFromControls();
  const overlayCount = isOverlayModeAvailable(preferences) && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no ? 1 : 0;
  const boardSpreadCount = normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight ? 1 : 0;
  return variantCount + overlayCount + boardSpreadCount;
}

export function updateVariantSummary() {
  document.querySelectorAll("[data-variant-summary]").forEach((summaryEl) => {
    const category = summaryEl.dataset.variantCategory;
    const states = getVariantCategoryStates(category);
    const enabled = states.filter((entry) => entry.state !== "off");
    let selectedCount = enabled.length;

    if (category === UI_SETUP_LAYOUT_CATEGORY) {
      const preferences = getPreferencesFromControls();
      const overlayAvailable = isOverlayModeAvailable(preferences);
      const overlayLabel = formatOverlayMode(preferences.overlayMode);
      if (normalizeBoardSpread(preferences.boardSpread) === BOARD_SPREAD_MODES.tight) {
        selectedCount += 1;
      }
      if (overlayAvailable && normalizeOverlayMode(preferences.overlayMode) !== OVERLAY_MODES.no) {
        selectedCount += 1;
      }
      summaryEl.title = [
        ...states.map((entry) => `${entry.label}: ${getVariantStateCopy(entry.id, entry.state).label}`),
        `Board Spread: ${formatBoardSpreadMode(preferences.boardSpread)}`,
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

  if (category === UI_SETUP_LAYOUT_CATEGORY) {
    const preferences = getPreferencesFromControls();
    setBoardSpreadControl(allAllowed ? BOARD_SPREAD_MODES.random : BOARD_SPREAD_MODES.tight);
    if (isOverlayModeAvailable(preferences)) {
      setOverlayModeControl(allAllowed ? OVERLAY_MODES.no : OVERLAY_MODES.yes);
    }
  }

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
  const next = variantId === "staggeredBoards"
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
  if (typeof document === "undefined") {
    // Headless runs (comparison harness) have no controls; use the full option
    // set a fresh page offers, so "Any" resolves exactly as it would there.
    if (selectId === "difficulty") return [...DIAGNOSTIC_DIFFICULTIES];
    if (selectId === "length") return [...DIAGNOSTIC_LENGTHS];
    return [];
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
  return {
    playerCount: Number(document.getElementById("player-count").value),
    difficulty: document.getElementById("difficulty").value,
    length: document.getElementById("length").value,
    startBalance: normalizeStartBalance(document.getElementById("start-balance")?.value),
    generationMode: normalizeGenerationMode(document.getElementById("generation-mode")?.value),
    boardSpread: normalizeBoardSpread(document.getElementById("board-spread")?.value),
    overlayMode: normalizeOverlayMode(document.getElementById("overlay-mode")?.value),
    actFastMode: getActFastModeFromControls(),
    selectedExpansions: {
      roborally: document.getElementById("expansion-roborally").checked,
      "rr-dice": document.getElementById("expansion-rr-dice").checked,
      "30th-anniversary": document.getElementById("expansion-30th-anniversary").checked,
      "master-builder": document.getElementById("expansion-master-builder").checked,
      "thrills-and-spills": document.getElementById("expansion-thrills-and-spills").checked,
      "chaos-and-carnage": document.getElementById("expansion-chaos-and-carnage").checked,
      "wet-and-wild": document.getElementById("expansion-wet-and-wild").checked,
      "contamination": document.getElementById("expansion-contamination").checked
    },
    allowedVariantRules: Object.fromEntries(
      VARIANT_DEFINITIONS.map((variant) => [variant.id, getVariantControlState(variant.id)])
    )
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
  document.getElementById("difficulty").value = normalizedPreferences.difficulty ?? "any";
  document.getElementById("length").value = normalizedPreferences.length ?? "any";
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
  setBoardSpreadControl(normalizedPreferences.boardSpread);
  setOverlayModeControl(normalizedPreferences.overlayMode);
  document.getElementById("expansion-roborally").checked = normalizedPreferences.selectedExpansions?.roborally ?? true;
  document.getElementById("expansion-rr-dice").checked = normalizedPreferences.selectedExpansions?.["rr-dice"] ?? false;
  document.getElementById("expansion-30th-anniversary").checked = normalizedPreferences.selectedExpansions?.["30th-anniversary"] ?? false;
  document.getElementById("expansion-master-builder").checked = normalizedPreferences.selectedExpansions?.["master-builder"] ?? false;
  document.getElementById("expansion-thrills-and-spills").checked = normalizedPreferences.selectedExpansions?.["thrills-and-spills"] ?? false;
  document.getElementById("expansion-chaos-and-carnage").checked = normalizedPreferences.selectedExpansions?.["chaos-and-carnage"] ?? false;
  document.getElementById("expansion-wet-and-wild").checked = normalizedPreferences.selectedExpansions?.["wet-and-wild"] ?? false;
  document.getElementById("expansion-contamination").checked = normalizedPreferences.selectedExpansions?.["contamination"] ?? false;
  VARIANT_DEFINITIONS.forEach((variant) => {
    if (variant.id === "actFast") {
      return;
    }
    setVariantControlState(variant.id, getVariantPreferenceState(normalizedPreferences, variant.id));
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
      `Conflicting saved Must rules were normalized. ${relaxedIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} changed to Yes.`
    );
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

export function updateVariantAvailability() {
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
