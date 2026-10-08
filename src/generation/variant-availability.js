// Robo Rally Course Randomizer - what can be built from the selected sets and rules: board/dock inventory and capacities, variant rules, conflicts, availability and variant-bundle selection
import {
  VARIANT_DEFINITIONS,
  VARIANT_STATES,
  buildVariantBundle,
  getVariantAvailabilityRule,
  getVariantConstructionRequirement,
  getVariantDefinition as getRegisteredVariantDefinition,
  getVariantExclusiveGroupConflict,
  getVariantRequirementIds
} from "../../variants.js";
import { cachedAssets } from "./assets.js";
import { countFeatureTypeInTileMap } from "./board-profile.js";
import { MAX_DOCK_COUNT } from "./config.js";
import { clamp } from "./math.js";
import { getMovingCheckpointTrace } from "./moving-targets.js";
import {
  ACT_FAST_MODE_IDS,
  getSelectedExpansionIds,
  getTuningDifficulty,
  isHardestDifficulty
} from "./preferences.js";
import { generationRandom, sample, shuffle } from "./random.js";
import { applyVariantAnalysisOptions } from "../../variants.js";

export const DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES = new Set(["wall", "redWall", "greenWall", "laser"]);

export function isCheckpointActiveFeature(feature, options = {}) {
  if (DEFAULT_CHECKPOINT_ACTIVE_FEATURE_TYPES.has(feature?.type)) {
    return true;
  }

  return Boolean(options.movingTargets && feature?.type === "belt");
}

export function getVariantDefinitionLabel(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.label ?? variantId;
}

export function getVariantDefinition(variantId) {
  return getRegisteredVariantDefinition(variantId);
}

export function getVariantStateCopy(variantId, state) {
  const normalized = normalizeVariantState(state);
  return getVariantDefinition(variantId)?.stateLabels?.[normalized] ?? VARIANT_STATES[normalized];
}

export function getVariantPreferenceState(preferences = {}, variantId) {
  const directState = preferences.allowedVariantRules?.[variantId];
  if (directState !== undefined) {
    return normalizeVariantState(directState);
  }

  if (variantId === "staggeredBoards" && typeof preferences.alignedLayout === "boolean") {
    return preferences.alignedLayout ? "off" : "allowed";
  }

  return normalizeVariantState(
    VARIANT_DEFINITIONS.find((variant) => variant.id === variantId)?.defaultState ?? "off"
  );
}

export function getExtraDockModeState(preferences = {}) {
  if (preferences.extraDocks === true) {
    return "forced";
  }
  if (preferences.extraDocks === false) {
    return "off";
  }
  return getVariantPreferenceState(preferences, "extraDocks");
}

export function countFeatureTypeInSelectedSets(featureType, pieceMap = cachedAssets?.pieceMap ?? null, preferences = {}) {
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

export function isHazardousFlagEligibleUnderlyingFeature(feature, options = {}) {
  if (!feature || feature.type === "checkpoint" || feature.type === "pit") {
    return false;
  }
  return !isCheckpointActiveFeature(feature, { movingTargets: Boolean(options.movingTargets) });
}

export function boardPieceSatisfiesConstructionRequirement(piece, requirement, options = {}) {
  if (!piece || !requirement) return false;
  const features = (piece.tiles || []).flatMap((tile) => tile.features || []);

  if (requirement.type === "boardFeatureAnyOf") {
    const featureTypes = new Set(requirement.featureTypes || []);
    return features.some((feature) => featureTypes.has(feature.type));
  }

  if (requirement.type === "checkpointSuppressibleBoardFeature") {
    return features.some((feature) => isHazardousFlagEligibleUnderlyingFeature(feature, options));
  }

  return false;
}

export function getActiveVariantConstructionRequirements(variantBundle = {}) {
  return VARIANT_DEFINITIONS
    .filter((variant) => Boolean(variantBundle?.[variant.id]))
    .map((variant) => ({
      variantId: variant.id,
      label: variant.label,
      ...(getVariantConstructionRequirement(variant.id) ?? {})
    }))
    .filter((requirement) => requirement.type);
}

export function getVariantConstructionInventoryUnavailabilityReason(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  const requirement = getVariantConstructionRequirement(variantId);
  if (!requirement || !pieceMap) return null;
  const expansionIds = getSelectedExpansionIds(preferences);
  const boardIds = getAvailableMainBoardIds(pieceMap, expansionIds);
  const movingTargets = getVariantPreferenceState(preferences, "movingTargets") === "forced";
  return boardIds.some((boardId) => boardPieceSatisfiesConstructionRequirement(
    pieceMap[boardId],
    requirement,
    { movingTargets }
  ))
    ? null
    : (requirement.reason ?? "No selected main board can support this rule.");
}

export function variantsConflict(leftVariantId, rightVariantId) {
  const pair = new Set([leftVariantId, rightVariantId]);
  // Energy Crisis / A Lighter Game removes Energy and upgrades from the game, so
  // starting-Energy prices or subsidies have no rules meaning. Keep this guard
  // local even if the variant registry also declares the incompatibility.
  if (
    pair.has("lighterGame") &&
    (pair.has("payToWin") || pair.has("subsidizedStarts"))
  ) {
    return true;
  }
  if (getVariantExclusiveGroupConflict(leftVariantId, rightVariantId)) {
    return true;
  }
  const left = getVariantDefinition(leftVariantId);
  const right = getVariantDefinition(rightVariantId);
  return Boolean(
    left?.incompatibleWith?.includes(rightVariantId) ||
    right?.incompatibleWith?.includes(leftVariantId)
  );
}

// Exclusive-group conflicts describe variants that cannot be active together on
// one generated course. Multiple members may still be Allowed as user preferences;
// the control logic only resolves conflicts when more than one is set to Must.
export function variantsConflictInGeneratedCourse(leftVariantId, rightVariantId) {
  return variantsConflict(leftVariantId, rightVariantId);
}

export function forcedVariantPreferencesConflict(leftVariantId, rightVariantId) {
  return variantsConflictInGeneratedCourse(leftVariantId, rightVariantId);
}

export function normalizeForcedVariantPreferenceConflicts(preferences = {}) {
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

export function getConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflict(variantId, variant.id))
    .map((variant) => variant.id);
}

export function getCourseConflictingVariantIds(variantId) {
  return VARIANT_DEFINITIONS
    .filter((variant) => variant.id !== variantId && variantsConflictInGeneratedCourse(variantId, variant.id))
    .map((variant) => variant.id);
}

export function getMissingRequiredVariantIds(variantId, preferences = {}, activeVariants = null, options = {}) {
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

export function getVariantUnavailabilityReason(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  if (variantId === "competitiveMode" && pieceMap) {
    const playerCount = preferences.playerCount ?? 4;
    const requiredStarts = playerCount * 2;
    const noDocksState = getVariantPreferenceState(preferences, "noDocks");
    if (noDocksState === "off") {
      const expansionIds = getSelectedExpansionIds(preferences);
      const dockIds = getEligibleDockIds(pieceMap, expansionIds);
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

  const forcedConflictIds = getConflictingVariantIds(variantId).filter((conflictId) => (
    getVariantPreferenceState(preferences, conflictId) === "forced"
  ));
  if (forcedConflictIds.length) {
    const exclusiveConflict = forcedConflictIds
      .map((conflictId) => ({
        conflictId,
        group: getVariantExclusiveGroupConflict(variantId, conflictId)
      }))
      .find((entry) => entry.group);
    if (exclusiveConflict) {
      return `Unavailable while ${getVariantDefinitionLabel(exclusiveConflict.conflictId)} is set to Must. ${exclusiveConflict.group.description ?? "Only one rule from this mutually exclusive group can be active."}`;
    }
    return `Unavailable while ${forcedConflictIds.map((id) => getVariantDefinitionLabel(id)).join(", ")} is set to Must.`;
  }

  const missingRequiredIds = getMissingRequiredVariantIds(variantId, preferences);
  if (missingRequiredIds.length) {
    return `Requires ${missingRequiredIds.map((id) => getVariantDefinitionLabel(id)).join(" or ")} unless ${getVariantDefinitionLabel(variantId)} is set to Must.`;
  }

  const constructionUnavailability = getVariantConstructionInventoryUnavailabilityReason(variantId, preferences, pieceMap);
  if (constructionUnavailability) {
    return constructionUnavailability;
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

export function normalizeVariantState(value) {
  if (value === true) return "allowed";
  if (value === false) return "off";
  return value === "forced" || value === "allowed" || value === "off" ? value : "off";
}

export function sampleVariantComplexityBudget(preferences = {}) {
  // Production resolves Difficulty=Any to a concrete target before candidate
  // construction/variant sampling, so this budget follows that resolved target.
  // The moderate fallback exists only for defensive/direct callers.
  const difficulty = getTuningDifficulty(preferences.difficulty);
  const budgets = {
    easy: [0, 0, 0, 0, 1, 1, 1, 2],
    moderate: [0, 0, 1, 1, 1, 2, 2, 3],
    hard: [0, 1, 2, 2, 3, 3, 4, 4, 5, 6]
  };

  return sample(budgets[difficulty] || budgets.moderate);
}

export function getVariantBaseChance(variantId, preferences = {}) {
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
    subsidizedStarts: { easy: 0.1, moderate: 0.18, hard: 0.2 },
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

export function getLateEasyVariantRescueBonus(variantId, preferences = {}) {
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
    subsidizedStarts: -0.04,
    factoryRejects: -0.08,
    hazardousFlags: -0.08,
    movingTargets: -0.1,
    lessForeshadowing: -0.08
  };

  return easingVariants[variantId] ?? hardeningVariants[variantId] ?? 0;
}

export function chooseVariantBundle(preferences = {}, options = {}) {
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

  // Forced / Must / must-like selections are explicit user decisions. They are
  // activated outside the OPTIONAL complexity budget and never consume/reduce it.
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
    (entry) => Math.max(0.01, entry.chance + generationRandom() * 0.08)
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

    if (generationRandom() < chance) {
      active[entry.id] = true;
      usedBudget += entry.cost;
    }
  }

  return buildVariantBundle(active, { budget, usedBudget });
}

export function isVariantForced(preferences = {}, variantId) {
  return getVariantPreferenceState(preferences, variantId) === "forced";
}

export function isVariantExplicitlyForced(preferences = {}, variantId) {
  if (isVariantForced(preferences, variantId)) {
    return true;
  }
  return variantId === "actFast" && Boolean(preferences.actFastMode);
}

export function chooseActFastMode(preferences = {}) {
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

// Neutral fallbacks are deliberately target-agnostic. Missing calibration may
// reduce efficiency, but it must not silently revive the old hand-written
// Short/Long/Easy/Hard construction policy.
export function neutralFlagCount(maxFlags) {
  const candidates = [];
  for (let count = 2; count <= Math.min(6, maxFlags); count += 1) {
    candidates.push(count);
  }
  return sample(candidates.length ? candidates : [Math.max(1, Math.min(2, maxFlags))]);
}

export function getMinimumSmallOnlyBoardCount() {
  // Small-board viability is enforced by layout/dock/start checks. Requested
  // length/difficulty are not structural minimum-board rules.
  return 1;
}

export function neutralBoardCount(maxBoards) {
  const candidates = [];
  for (let count = 1; count <= maxBoards; count += 1) {
    candidates.push(count);
  }
  return sample(candidates.length ? candidates : [1]);
}

export function getAvailableMainBoardIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "base" || piece.kind === "small")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

export function getAvailableDockIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.kind === "dock")
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

export function getRequiredDockStartCount(preferences = {}) {
  const playerCount = preferences.playerCount ?? 4;
  const competitiveModeEnabled = typeof preferences.competitiveMode === "boolean"
    ? preferences.competitiveMode
    : getVariantPreferenceState(preferences, "competitiveMode") === "forced";
  return competitiveModeEnabled ? playerCount * 2 : playerCount;
}

export function getMaximumDockCount(preferences = {}, availableDockCount = 1) {
  const mode = getExtraDockModeState(preferences);
  const desired = mode === "off" ? 1 : MAX_DOCK_COUNT;
  return Math.max(1, Math.min(desired, availableDockCount));
}

export function getDockStartCapacity(dockIds, pieceMap) {
  return dockIds.reduce((sum, dockId) => sum + (pieceMap[dockId]?.starts?.length ?? 0), 0);
}

export function getDockFaceGroups(dockIds, pieceMap) {
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

export function variantIsAvailable(variantId, preferences = {}, pieceMap = cachedAssets?.pieceMap ?? null) {
  return !getVariantUnavailabilityReason(variantId, preferences, pieceMap);
}

export function getVariantCourseUnavailabilityReason(variantId, tileMap, context = {}) {
  const rawTileMap = context.rawTileMap ?? tileMap;
  const checkpoints = context.checkpoints ?? [];

  // v49es realized-applicability ownership: Moving Targets and Hazardous Flags
  // depend on checkpoint placement, not merely on whether the selected sets could
  // have supplied a compatible board feature. A selected complexity-consuming
  // rule must be capable of mattering on the finished course. It does NOT need
  // to appear on a retained route or actually trigger during play.
  if (variantId === "movingTargets") {
    const traceCache = new Map();
    const hasMovingCheckpoint = checkpoints.some((checkpoint) => (
      getMovingCheckpointTrace(rawTileMap, checkpoint, traceCache).moving
    ));
    return hasMovingCheckpoint
      ? null
      : "No checkpoint is on a conveyor that can move it on this course.";
  }

  if (variantId === "hazardousFlags") {
    const movingTargets = Boolean(context.movingTargets);
    const hasSuppressedCoveredFeature = checkpoints.some((checkpoint) => {
      const tile = rawTileMap?.get(`${checkpoint.x},${checkpoint.y}`);
      return (tile?.features || []).some((feature) => (
        isHazardousFlagEligibleUnderlyingFeature(feature, { movingTargets })
      ));
    });
    return hasSuppressedCoveredFeature
      ? null
      : "No checkpoint covers a normally suppressed board element on this course.";
  }

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

export function applyCourseVariantAvailability(variantBundle, tileMap, preferences = {}, context = {}) {
  const nextBundle = { ...variantBundle };
  const blockedRequired = [];
  const deactivatedZeroCost = [];

  for (const variant of VARIANT_DEFINITIONS) {
    if (!nextBundle[variant.id]) {
      continue;
    }

    const unavailableReason = getVariantCourseUnavailabilityReason(variant.id, tileMap, context);
    if (!unavailableReason) {
      continue;
    }

    // Must always means realized applicability. Allowed rules that consume the
    // optional complexity budget have the same requirement: if a rule costs
    // clutter budget, the finished course must contain the physical circumstance
    // that makes the rule capable of mattering. Do not spend budget on an inert
    // rule and then silently switch it off. Zero-cost setup choices may still be
    // normalized away by their dedicated setup machinery.
    if (isVariantForced(preferences, variant.id) || Number(variant.cost ?? 0) > 0) {
      blockedRequired.push({ id: variant.id, reason: unavailableReason });
      continue;
    }

    nextBundle[variant.id] = false;
    deactivatedZeroCost.push({ id: variant.id, reason: unavailableReason });
  }

  return {
    variantBundle: nextBundle,
    blockedRequired,
    deactivatedZeroCost
  };
}

export function getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences = {}) {
  const dockFaceGroups = getDockFaceGroups(dockIds, pieceMap);
  const maxDockCount = getMaximumDockCount(preferences, dockFaceGroups.length);
  return dockFaceGroups
    .map((group) => Math.max(...group.map((dockId) => pieceMap[dockId]?.starts?.length ?? 0)))
    .sort((left, right) => right - left)
    .slice(0, maxDockCount)
    .reduce((sum, startCount) => sum + startCount, 0);
}

export function canSupportRequiredDockStarts(dockIds, pieceMap, preferences = {}) {
  return getMaximumAvailableDockStartCapacity(dockIds, pieceMap, preferences) >= getRequiredDockStartCount(preferences);
}

export function getEligibleDockIds(pieceMap, expansionIds = null) {
  return getAvailableDockIds(pieceMap, expansionIds)
    .filter((dockId) => (pieceMap[dockId]?.starts?.length ?? 0) > 0);
}

export function getDockSelectionWeight(piece, preferences = {}) {
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

export function weightedOrder(items, getWeight) {
  const remaining = [...items];
  const ordered = [];

  while (remaining.length) {
    const weights = remaining.map((item) => Math.max(0, Number(getWeight(item)) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (total <= 0) {
      ordered.push(...shuffle(remaining));
      break;
    }

    let pick = generationRandom() * total;
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

export function getDockConfigurations(availableDockIds, pieceMap, preferences = {}) {
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

export function isDynamicArchivingActive(preferences = {}) {
  return preferences.recoveryRule === "dynamic_archiving";
}

export function getRouteAnalysisVariantOptions(options = {}) {
  // v38: variants.js is the authoritative route-analysis projection. Main only
  // layers non-variant route-economy tuning values and Act Fast's chosen mode on
  // top of that projection. This prevents registry mechanics such as Set to Kill,
  // Set to Stun, Repair Stations, or Less Foreshadowing from silently disappearing
  // in a second hand-maintained option list.
  const variantOptions = applyVariantAnalysisOptions({}, options);
  return {
    ...variantOptions,
    actFastMode: options.actFastMode ?? null,
    routeAwareBatteryScoring: options.routeAwareBatteryScoring,
    routeEnergyHorizonTurns: options.routeEnergyHorizonTurns,
    routeEnergyRegisterScore: options.routeEnergyRegisterScore,
    routeEnergyReferenceReserve: options.routeEnergyReferenceReserve,
    startingEnergy: options.startingEnergy ?? variantOptions.startingEnergy,
    startingEnergyDelta: options.startingEnergyDelta ?? variantOptions.startingEnergyDelta,
    startingUpgradeCards: options.startingUpgradeCards ?? variantOptions.startingUpgradeCards,
    startingUpgradeCardDelta: options.startingUpgradeCardDelta ?? variantOptions.startingUpgradeCardDelta,
    maxEnergy: options.maxEnergy ?? variantOptions.maxEnergy,
    upgradeDrawsPerTurn: options.upgradeDrawsPerTurn ?? variantOptions.upgradeDrawsPerTurn,
    upgradeInstallsPerTurn: options.upgradeInstallsPerTurn ?? variantOptions.upgradeInstallsPerTurn,
    upgradeDrawEnergyCost: options.upgradeDrawEnergyCost ?? variantOptions.upgradeDrawEnergyCost,
    upgradeUsefulCardRate: options.upgradeUsefulCardRate ?? variantOptions.upgradeUsefulCardRate,
    upgradeUsefulEnergyPerInstall: options.upgradeUsefulEnergyPerInstall ?? variantOptions.upgradeUsefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: options.upgradePowerRegistersPerEnergy ?? variantOptions.upgradePowerRegistersPerEnergy,
    routeRegistersPerTurn: options.routeRegistersPerTurn ?? variantOptions.routeRegistersPerTurn
  };
}
