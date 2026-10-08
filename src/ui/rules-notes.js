// Robo Rally Course Randomizer - rules notes under the map, variant impact summary and legend
import { buildResolvedMap } from "../../board.js";
import {
  VARIANT_DEFINITIONS,
  getVariantDefinition,
  getVariantGuidanceRules
} from "../../variants.js";
import { cachedAssets } from "../generation/assets.js";
import { countFeatureTypeInTileMap } from "../generation/board-profile.js";
import { getPlayableCheckpoints } from "../generation/checkpoints.js";
import { DEFAULT_STARTING_ENERGY } from "../generation/config.js";
import { ACT_FAST_MODE_IDS, formatActFastMode } from "../generation/preferences.js";
import {
  getCourseConflictingVariantIds,
  getVariantPreferenceState,
  getVariantStateCopy,
  isCheckpointActiveFeature,
  isVariantExplicitlyForced,
  normalizeVariantState,
  variantIsAvailable
} from "../generation/variant-availability.js";
import { BOARD_VIEW_MODES, countBoardLasers, getBoardViewMode } from "./board-audit.js";

export function hasSuppressedCheckpointFeatures(scenario) {
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

export function hasHazardousFlagsEffect(scenario) {
  if (!scenario?.hazardousFlags) {
    return false;
  }

  return hasCheckpointBoardFeatures(
    scenario,
    (feature) => !isCheckpointActiveFeature(feature, { movingTargets: scenario.movingTargets })
  );
}

export function hasMovingTargetsEffect(scenario) {
  return Boolean(scenario?.movingTargets && scenario?.movingTargetStats?.activeCount);
}

export function getVariantImpactSummary(scenario) {
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
    const label = getVariantDefinition(variantId)?.label ?? variantId;
    activeImpacts.push(detail ? `${label} (${detail})` : label);
  };
  const addIdle = (variantId, detail = "") => {
    const label = getVariantDefinition(variantId)?.label ?? variantId;
    idleImpacts.push(detail ? `${label} (${detail})` : label);
  };

  if (scenario.actFast) {
    addImpact("actFast");
  }
  if (scenario.lighterGame) {
    addImpact(
      "lighterGame",
      upgradeSpaceCount > 0
        ? `${upgradeSpaceCount} upgrade space${upgradeSpaceCount === 1 ? "" : "s"} with Energy/upgrade effects disabled; upgrade phase removed`
        : "upgrade phase removed"
    );
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
  if (scenario.subsidizedStarts) {
    const offeredStarts = (scenario.sequence.firstLeg.starts || []).filter((start) => (
      Number.isFinite(start.energyCost) && !start.payToWinUnavailable
    ));
    addImpact("subsidizedStarts", `${offeredStarts.length} offered start${offeredStarts.length === 1 ? "" : "s"}`);
  } else if (scenario.payToWin) {
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

export function formatRuleReference({
  source = "rulebook",
  edition = 2023,
  page = null,
  section = null,
  relation = "direct",
  qualifier = null
} = {}) {
  let sourceText = "";

  if (source === "rulebook") {
    const editionText = edition == null || String(edition).trim() === ""
      ? ""
      : `${edition} `;
    sourceText = `${editionText}rulebook`;
    if (section) sourceText += `: ${section}`;
    if (page !== null && page !== undefined && page !== "") {
      sourceText += `${section ? "," : ""} p. ${page}`;
    }
  } else if (source === "previous-editions") {
    sourceText = "previous Robo Rally editions";
  } else {
    sourceText = String(source ?? "").trim();
  }

  if (!sourceText) return "";
  if (qualifier) sourceText += `; ${qualifier}`;

  if (relation === "altered") return `Altered from ${sourceText}`;
  if (relation === "patterned") return `Patterned after ${sourceText}`;
  return sourceText.charAt(0).toUpperCase() + sourceText.slice(1);
}

export function appendRuleReference(text, referenceOptions = {}) {
  const reference = formatRuleReference(referenceOptions);
  const trimmed = String(text ?? "").trim();
  if (!trimmed || !reference) return trimmed;
  const base = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  return `${base} (${reference}).`;
}

export function getActFastRuleText(mode) {
  switch (mode) {
    case "countdown_3m":
      return appendRuleReference("Act Fast: use a 3-minute programming timer.", { page: 32 });
    case "countdown_2m":
      return appendRuleReference("Act Fast: use a 2-minute programming timer.", { page: 32 });
    case "countdown_1m":
      return appendRuleReference("Act Fast: use a 1-minute programming timer.", { page: 32, relation: "altered" });
    case "countdown_30s":
      return appendRuleReference("Act Fast: use a 30-second programming timer.", { page: 32, relation: "altered" });
    case "last_player_30s":
      return appendRuleReference("Act Fast: when only one player remains, that player has 30 seconds to finish programming.", { source: "previous-editions" });
    default:
      return null;
  }
}

export function hasCheckpointBoardFeatures(scenario, featureFilter = null) {
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

export function isVariantGuidanceSourceActive(scenario, variantId, activation = "active") {
  if (!scenario || !variantId) return false;
  if (activation === "forced") {
    return isVariantExplicitlyForced(scenario.preferences ?? {}, variantId);
  }
  return Boolean(scenario[variantId]) || (
    variantId === "dynamicArchiving" && scenario.recoveryRule === "dynamic_archiving"
  ) || (
    variantId === "homeReboot" && scenario.recoveryRule === "home_reboot"
  );
}

export function isVariantGuidanceTargetActive(scenario, variantId) {
  if (!scenario || !variantId) return false;
  if (variantId === "dynamicArchiving") return scenario.recoveryRule === "dynamic_archiving";
  if (variantId === "homeReboot") return scenario.recoveryRule === "home_reboot";
  return Boolean(scenario[variantId]);
}

export function variantGuidanceTargetIsLegal(variantId, scenario) {
  if (!variantId || !scenario) return false;
  const preferences = scenario.preferences ?? {};
  const pieceMap = cachedAssets?.pieceMap ?? null;
  if (!variantIsAvailable(variantId, preferences, pieceMap)) return false;

  const conflicts = getCourseConflictingVariantIds(variantId);
  return !conflicts.some((conflictId) => isVariantGuidanceTargetActive(scenario, conflictId));
}

export function buildVariantRuleGuidanceNotes(scenario) {
  if (!scenario) return { suggestions: [], warnings: [] };
  const suggestionTargetsBySource = new Map();
  const warnings = [];

  for (const source of VARIANT_DEFINITIONS) {
    const rules = getVariantGuidanceRules(source.id) || [];
    for (const rule of rules) {
      if (!isVariantGuidanceSourceActive(scenario, source.id, rule.sourceActivation ?? "active")) {
        continue;
      }

      const targetId = rule.targetId ?? null;
      const targetActive = targetId ? isVariantGuidanceTargetActive(scenario, targetId) : false;
      if (rule.kind === "suggest") {
        if (targetId && (targetActive || !variantGuidanceTargetIsLegal(targetId, scenario))) {
          continue;
        }
        const target = targetId ? getVariantDefinition(targetId) : null;
        if (!target?.label) continue;
        if (!suggestionTargetsBySource.has(source.id)) {
          suggestionTargetsBySource.set(source.id, {
            sourceLabel: source.label,
            targetLabels: []
          });
        }
        suggestionTargetsBySource.get(source.id).targetLabels.push(target.label);
        continue;
      }

      if (rule.kind === "warning") {
        if (targetId && !targetActive) continue;
        if (rule.text) warnings.push(rule.text);
      }
    }
  }

  return {
    suggestions: [...suggestionTargetsBySource.values()],
    warnings
  };
}

export function capitalizeRuleNoteBody(text) {
  return String(text ?? "").replace(/[A-Za-z]/, (letter) => letter.toUpperCase());
}

export function splitRuleNoteEntry(text) {
  const trimmed = String(text ?? "").trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) {
    return { label: "", body: capitalizeRuleNoteBody(trimmed) };
  }
  return {
    label: trimmed.slice(0, colonIndex).trim(),
    body: capitalizeRuleNoteBody(trimmed.slice(colonIndex + 1).trim())
  };
}

export function appendRuleNoteHeading(noteEl, text) {
  const headingEl = document.createElement("strong");
  headingEl.className = "rules-note-heading";
  headingEl.textContent = text;
  noteEl.appendChild(headingEl);
}

export function appendRuleNoteEntry(noteEl, text) {
  const { label, body } = splitRuleNoteEntry(text);
  const entryEl = document.createElement("span");
  entryEl.className = "rules-note-entry";
  if (label) {
    const labelEl = document.createElement("strong");
    labelEl.className = "rules-note-rule-name";
    labelEl.textContent = `${label}:`;
    entryEl.appendChild(labelEl);
    if (body) entryEl.appendChild(document.createTextNode(` ${body}`));
  } else {
    entryEl.textContent = body;
  }
  noteEl.appendChild(entryEl);
}

export function appendNamedList(parentEl, labels) {
  labels.forEach((label, index) => {
    if (index > 0) {
      parentEl.appendChild(document.createTextNode(
        index === labels.length - 1 ? " and " : ", "
      ));
    }
    const labelEl = document.createElement("strong");
    labelEl.className = "rules-note-rule-name";
    labelEl.textContent = label;
    parentEl.appendChild(labelEl);
  });
}

export function renderVariantRuleGuidanceNote(noteEl, guidance) {
  noteEl.replaceChildren();
  appendRuleNoteHeading(noteEl, "RULES NOTES:");

  if (guidance.suggestions.length) {
    noteEl.appendChild(document.createTextNode(" "));
    const entryEl = document.createElement("span");
    entryEl.className = "rules-note-entry";
    entryEl.appendChild(document.createTextNode("Suggestion: "));
    guidance.suggestions.forEach((suggestion, index) => {
      if (index > 0) entryEl.appendChild(document.createTextNode(" "));
      const sourceEl = document.createElement("strong");
      sourceEl.className = "rules-note-rule-name";
      sourceEl.textContent = suggestion.sourceLabel;
      entryEl.appendChild(sourceEl);
      entryEl.appendChild(document.createTextNode(" pairs well with "));
      appendNamedList(entryEl, suggestion.targetLabels);
      entryEl.appendChild(document.createTextNode("."));
    });
    noteEl.appendChild(entryEl);
  }

  for (const warning of guidance.warnings) {
    noteEl.appendChild(document.createTextNode(" "));
    appendRuleNoteEntry(noteEl, `Note: ${warning}`);
  }
}

export function renderSpecialRulesNote(noteEl, notes) {
  noteEl.replaceChildren();
  appendRuleNoteHeading(noteEl, "SPECIAL RULES:");
  notes.forEach((note) => {
    noteEl.appendChild(document.createTextNode(" "));
    appendRuleNoteEntry(noteEl, note);
  });
}

export function updateRulesNote(scenario) {
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
    noteEl.replaceChildren();
    noteEl.classList.add("hidden");
    if (adviceNoteEl) {
      adviceNoteEl.replaceChildren();
      adviceNoteEl.classList.add("hidden");
    }
    return;
  }

  if (!scenario.hazardousFlags && hasSuppressedCheckpointFeatures(scenario)) {
    checkpointNotes.push(
      scenario.movingTargets
        ? appendRuleReference(
          "Checkpoint spaces suppress board elements other than walls, lasers, and conveyors carrying moving checkpoints.",
          { page: 15, qualifier: "Moving Targets variant" }
        )
        : appendRuleReference(
          "Checkpoint spaces suppress board elements other than walls and lasers.",
          { page: 15 }
        )
    );
  }

  if (scenario.recoveryRule === "dynamic_archiving") {
    notes.push(appendRuleReference(
      "Dynamic Archiving: do not use reboot tokens. A robot archives when it ends a register on a checkpoint or battery space.",
      { page: 32 }
    ));
  }

  if (scenario.recoveryRule === "home_reboot") {
    notes.push(appendRuleReference(
      "Home Reboot: a robot reboots at the token on the dock where its starting Archive Token was placed.",
      { source: "previous-editions" }
    ));
  }

  const actFastRuleText = getActFastRuleText(scenario.actFastMode);
  if (scenario.actFast && actFastRuleText) {
    notes.push(actFastRuleText);
  }

  if (hasHazardousFlagsEffect(scenario)) {
    notes.push(appendRuleReference(
      "Hazardous Checkpoints: board elements under checkpoints remain active, but do not affect the checkpoints.",
      { source: "previous-editions" }
    ));
  }

  if (hasMovingTargetsEffect(scenario)) {
    notes.push(appendRuleReference(
      "Moving Targets: during each register, checkpoints on conveyors move with the belts. If one would leave the conveyor or stop moving, return it to its marked re-entry space (R#).",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.repairStations) {
    notes.push(appendRuleReference(
      "Repair Stations: at the end of the fifth register, a robot on an ordinary checkpoint may remove one Damage card from its deck, discard pile, hand, or registers and place it in the damage discard pile.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (getBoardViewMode() === BOARD_VIEW_MODES.photos && (scenario.overlayPlacements?.length ?? 0) > 0) {
    photoNotes.push("Board photos are for general layout reference only. With overlays, use the physical boards or Icon View for exact placement of walls, ledges, and other border elements.");
  }

  if (scenario.noDocks) {
    let noDockText;
    if (scenario.subsidizedStarts) {
      noDockText = "No Docks: do not use a docking bay. The subsidized starting spaces along the indicated outer board edge replace docking-bay starting spaces.";
    } else if (scenario.payToWin) {
      noDockText = "No Docks: do not use a docking bay. The priced starting spaces along the indicated outer board edge replace docking-bay starting spaces.";
    } else {
      noDockText = "No Docks: do not use a docking bay. White circles along the indicated outer board edge are the available starting spaces.";
    }
    if (!scenario.startupSpinUp) {
      const noDockFacing = scenario.noDockEdge?.facing ?? scenario.noDockEdges?.[0]?.facing ?? null;
      if (noDockFacing) {
        noDockText += ` Robots start facing ${noDockFacing} on the displayed map.`;
      }
    }
    notes.push(noDockText);
    if (scenario.startupSpinUp) {
      notes.push(appendRuleReference(
        "Startup Spin-Up: players may choose their robots' initial facing freely.",
        { source: "previous-editions", relation: "patterned" }
      ));
    }
  }

  if (scenario.sandwichedDock) {
    if (scenario.startupSpinUp) {
      notes.push("Sandwiched Dock: robots start on the docking bay.");
    } else if (scenario.sandwichedDockFacing) {
      notes.push(`Sandwiched Dock: robots start on the docking bay, facing ${scenario.sandwichedDockFacing} toward checkpoint 1 on the displayed map.`);
    } else {
      notes.push("Sandwiched Dock: robots start on the docking bay, facing toward checkpoint 1.");
    }
  }

  if (scenario.competitiveMode) {
    notes.push(
      `Competitive Mode: before the game, players take turns blocking starting spaces, then choose strategically from the remaining starts. ` +
      appendRuleReference(
        `All shown starting spaces are available when blocking begins. Good blocking rewards players who can read the course and identify the strongest starts before the race.`,
        { page: 32 }
      )
    );

    {
      const competitiveFailures = new Set([
        ...(scenario.metrics?.hardFailures ?? []),
        ...(scenario.metrics?.softFailures ?? [])
      ]);
      const unavailableIndices = scenario.sequence?.firstLeg?.summary?.competitiveStaging?.unavailableIndices
        ?? scenario.blockedStartIndices
        ?? [];
      if (competitiveFailures.has("competitive-start-availability") || unavailableIndices.length) {
        const unavailableText = unavailableIndices.length
          ? ` #${unavailableIndices.map((index) => index + 1).join(", #")}`
          : "";
        notes.push(
          `Competitive starting-space warning: do not use ${unavailableIndices.length || "some"} starting space${unavailableIndices.length === 1 ? "" : "s"}${unavailableText}. These are unavailable for this course and are not player blocks.`
        );
      }
    }
  }

  if (scenario.subsidizedStarts) {
    const subsidyPricing = scenario.sequence.firstLeg.summary.payToWin;
    const baseStartingEnergy = subsidyPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY;
    if (subsidyPricing?.hasLatePriceDifference) {
      const firstLatePlayer = subsidyPricing.lateSelectorStart ?? scenario.playerCount;
      const lastLatePlayer = subsidyPricing.lateSelectorEnd ?? scenario.playerCount;
      const singleLatePlayer = firstLatePlayer === lastLatePlayer;
      const latePlayerText = singleLatePlayer
        ? `player ${firstLatePlayer}`
        : `players ${firstLatePlayer}–${lastLatePlayer}`;
      const hasUnavailableSelectors = (
        (subsidyPricing.earlyUnavailableCount ?? 0) > 0 ||
        (subsidyPricing.lateUnavailableCount ?? 0) > 0
      );
      const dashText = hasUnavailableSelectors
        ? " A dash in either position means that starting space cannot be sufficiently compensated for that selector group; a fully unavailable space uses the prohibited-start marker instead of a subsidy."
        : "";
      notes.push(
        `Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first subsidy.${dashText} Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`
      );
    } else {
      notes.push(`Subsidized Starts: light-blue starting spaces show extra starting Energy granted for choosing that space. Add the shown amount to the normal ${baseStartingEnergy} starting Energy. Prohibited starting spaces are not available for selection. Resolve starting-space selection and subsidies before dealing or revealing any starting upgrade cards.`);
    }
  }

  if (scenario.payToWin) {
    const payToWinPricing = scenario.sequence.firstLeg.summary.payToWin;
    const baseStartingEnergy = payToWinPricing?.startingEnergy ?? DEFAULT_STARTING_ENERGY;
    if (payToWinPricing?.hasLatePriceDifference) {
      const firstLatePlayer = payToWinPricing.lateSelectorStart
        ?? scenario.playerCount;
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
        `Pay to Win: green starting spaces show starting Energy costs. Pay the shown cost from your ${baseStartingEnergy} starting Energy when choosing a starting space. ${latePlayerText} ${singleLatePlayer ? "uses" : "use"} the second value after the slash; earlier players use the first cost.${dashText} Resolve Pay to Win starting-space selection before dealing or revealing any starting upgrade cards.`
      );
    } else {
      notes.push(`Pay to Win: green starting spaces show the starting Energy cost for choosing that space. Pay that cost from your ${baseStartingEnergy} starting Energy when choosing a starting space; a start whose cost exceeds your available starting Energy is unavailable. Resolve Pay to Win starting-space selection before dealing or revealing any starting upgrade cards.`);
    }
  }

  if (scenario.factoryRejects) {
    notes.push(appendRuleReference(
      "Factory Rejects: hand size is 7 instead of 9.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.lessDeadlyGame) {
    notes.push(appendRuleReference(
      "Walled In: board edges act as walls.",
      { section: "A Less Deadly Game", page: 32 }
    ));
  }

  if (scenario.lessSpammyGame) {
    notes.push(appendRuleReference(
      "SPAM Filter: at the end of the programming phase, discard all SPAM cards from your hand to your discard pile.",
      { section: "A Less SPAM-Y Game", page: 32 }
    ));
  }

  if (scenario.criticalSpam) {
    notes.push(appendRuleReference(
      "Critical Spam: after a SPAM card resolves, put it in the player's discard pile instead of the damage discard pile. Shutdown removes SPAM normally.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.criticalHaywire) {
    notes.push(appendRuleReference(
      "Critical Haywire: Haywire cards on registers count against hand size when drawing cards at the start of the programming phase.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.permanentShutdown) {
    notes.push(appendRuleReference(
      "Permanent Shutdown: if you have nothing but SPAM in your hand after drawing cards at the beginning of programming phase, your robot is destroyed and you are out of the game. If only one robot is left, that player wins the game!",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.moreDeadlyGame) {
    notes.push(appendRuleReference(
      "Hard Reboot: rebooting deals 3 damage instead of 2.",
      { section: "A More Deadly Game", page: 28 }
    ));
  }

  if (scenario.cuttingFloor) {
    notes.push("Cutting Floor: all board lasers deal double damage; for example, a double board laser deals 4 damage.");
  }

  if (scenario.flamingOil) {
    notes.push("Flaming Oil: when a robot enters any oil slick during a register, it takes 1 damage. If it ends that register on oil, it takes 1 additional damage. Multiple oil spaces entered during the same register still deal only 1 entry damage.");
  }

  if (scenario.repulsorOverdrive) {
    notes.push("Repulsor Overdrive: repulsors push robots twice the full distance of the triggering Move card.");
  }

  if (scenario.setToKill) {
    notes.push(appendRuleReference(
      "Set to Kill: robots' main lasers deal double damage.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.setToStun) {
    notes.push("Set to Stun: put SPAM drawn from damage caused by robots' main lasers in the damage discard pile.");
  }

  if (scenario.virtualBots) {
    const entryName = "shared starting space";

    if (scenario.startupSpinUp) {
      notes.push(
        appendRuleReference(
          `Virtual Bots: No docking bay is used. The ${entryName} is marked with a white circle. Place every player's Archive Token there. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
      notes.push(
        appendRuleReference(
          `Startup Spin-Up: in priority order, players choose the initial facing of their Virtual Bots freely at the ${entryName}.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
    } else {
      const entryFacing = scenario.virtualBotEntry?.dir;
      notes.push(
        appendRuleReference(
          `Virtual Bots: No docking bay is used. The ${entryName} is marked with a white circle. Place every player's Archive Token there${entryFacing ? ` facing ${entryFacing}` : ""}. These Archive Tokens are the robots' Virtual Bots. Virtual Bots move and are affected by the factory floor normally, including conveyors, pushers, gears, pits, board lasers, and other board elements, but they do not interact with robots or other Virtual Bots: they do not push or block them, and robot weapons cannot affect Virtual Bots or be used by Virtual Bots against other robots. Resolve all five registers of the first turn this way. At the end of each turn, any Virtual Bot that does not share its space with another robot or Virtual Bot is replaced by that player's robot miniature; from then on that robot follows the normal rules. A Virtual Bot sharing a space remains virtual until the end of a later turn when it is alone.`,
          { source: "previous-editions", relation: "patterned" }
        )
      );
    }
  }

  if (scenario.startupSpinUp && !scenario.virtualBots && !scenario.noDocks) {
    notes.push(appendRuleReference(
      "Startup Spin-Up: during setup, robots can start with any facing.",
      { source: "previous-editions", relation: "patterned" }
    ));
  }

  if (scenario.upgradeWorld) {
    notes.push(appendRuleReference(
      "Upgrade World: in addition to their usual effect, robots draw one upgrade card when activating batteries and chop shops.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.classicSharedDeck) {
    notes.push(appendRuleReference(
      "Shared Deck: use one shared programming deck. Damage SPAM goes directly into the affected player's hand.",
      { source: "previous-editions", relation: "altered" }
    ));
  }

  if (scenario.lighterGame) {
    notes.push(appendRuleReference(
      scenario.recoveryRule === "dynamic_archiving"
        ? "Energy Crisis: remove upgrade cards from the game; Battery and Chop Shop spaces provide no Energy or upgrade effects. Battery spaces are still used for archiving."
        : "Energy Crisis: remove upgrade cards from the game; Battery and Chop Shop spaces provide no Energy or upgrade effects.",
      { section: "A Lighter Game", page: 32 }
    ));
  }

  if (scenario.lessForeshadowing) {
    notes.push(appendRuleReference(
      "Less Foreshadowing: at the end of each round, shuffle your programming deck, discard pile, and non-damage cards in hand together to form a new programming deck.",
      { page: 32 }
    ));
  }

  // v39a: Special Rules may also surface optional rule guidance. This is distinct
  // from Course Notes: these entries describe relationships between rules, while
  // Course Notes remain solely about the character of the generated course.
  //
  // Guidance is registry-driven. Suggestions are shown only when their target is
  // legal and available for the current collection/preferences; warnings may be
  // authored later for combinations that are legal but noteworthy. Hard blocks,
  // prerequisites, and collection availability remain separate registry concepts.
  const guidanceNotes = buildVariantRuleGuidanceNotes(scenario);
  if (adviceNoteEl) {
    if (guidanceNotes.suggestions.length || guidanceNotes.warnings.length) {
      renderVariantRuleGuidanceNote(adviceNoteEl, guidanceNotes);
      adviceNoteEl.classList.remove("hidden");
    } else {
      adviceNoteEl.replaceChildren();
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

  const hasTopRules = notes.length > 0;
  topAnchorEl?.appendChild(topRulesBlockEl);
  topRulesBlockEl?.classList.toggle("hidden", !hasTopRules);
  if (notes.length) {
    renderSpecialRulesNote(noteEl, notes);
    noteEl.classList.remove("hidden");
  } else {
    noteEl.replaceChildren();
    noteEl.classList.add("hidden");
  }
}

export function describeAllowedVariants(preferences = {}) {
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
    } else if (id === "actFast" && normalized === "forced") {
      variants.push(`${label} (Must; random timer mode)`);
    } else {
      variants.push(`${label} (${getVariantStateCopy(id, normalized).label})`);
    }
  }

  return variants.length ? variants.join(", ") : "none";
}

export function updateLegend(scenario) {
  const rebootTokenEl = document.getElementById("legend-reboot-token");
  const payToWinStartEl = document.getElementById("legend-pay-to-win-start");
  if (rebootTokenEl) {
    rebootTokenEl.textContent = "Green marker: reboot token";
  }
  rebootTokenEl?.classList.toggle("hidden", !["reboot_tokens", "home_reboot"].includes(scenario?.recoveryRule));
  if (payToWinStartEl) {
    payToWinStartEl.textContent = scenario?.subsidizedStarts
      ? "Light-blue square: extra starting Energy subsidy"
      : "Green square: Pay to Win starting Energy cost";
  }
  payToWinStartEl?.classList.toggle("hidden", !(scenario?.payToWin || scenario?.subsidizedStarts));
}
