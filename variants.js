export const VARIANT_STATES = {
  off: { label: "Not allowed", shortLabel: "No" },
  allowed: { label: "Allowed", shortLabel: "Yes" },
  forced: { label: "Always on", shortLabel: "Must" }
};

const VARIANT_COMPLEXITY = {
  actFast: 1,
  lighterGame: 1,
  upgradeWorld: 1,
  lessSpammyGame: 1,
  criticalSpam: 1,
  criticalHaywire: 1,
  permanentShutdown: 1,
  lessDeadlyGame: 1,
  moreDeadlyGame: 1,
  cuttingFloor: 1,
  flamingOil: 1,
  repulsorOverdrive: 1,
  setToKill: 1,
  setToStun: 1,
  classicSharedDeck: 3,
  dynamicArchiving: 1,
  hazardousFlags: 2,
  movingTargets: 2,
  lessForeshadowing: 1,
  extraDocks: 1,
  factoryRejects: 1,
  startupSpinUp: 1,
  competitiveMode: 1,
  staggeredBoards: 1
};

const VARIANT_CATEGORIES = {
  timing: "timing",
  board: "board",
  danger: "danger",
  checkpoints: "checkpoints",
  deck: "deck",
  setup: "setup"
};

function applyBooleanField(field) {
  return (bundle) => {
    bundle[field] = true;
  };
}

const VARIANT_DEFINITION_ROWS = [
  {
    id: "actFast",
    label: "Act Fast",
    category: VARIANT_CATEGORIES.timing,
    controlId: "variant-act-fast",
    defaultState: "off",
    description: "Programming is timed.",
    cost: VARIANT_COMPLEXITY.actFast,
    applyBundle: applyBooleanField("actFast")
  },
  {
    id: "lighterGame",
    label: "A Lighter Game",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-lighter-game",
    defaultState: "off",
    description: "Removes upgrade cards and makes battery spaces inactive.",
    cost: VARIANT_COMPLEXITY.lighterGame,
    incompatibleWith: ["upgradeWorld"],
    applyBundle: applyBooleanField("lighterGame")
  },
  {
    id: "upgradeWorld",
    label: "Upgrade World",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-upgrade-world",
    defaultState: "off",
    description: "Activating batteries and chop shops also draws an upgrade card.",
    cost: VARIANT_COMPLEXITY.upgradeWorld,
    incompatibleWith: ["lighterGame"],
    availability: {
      type: "featureTypesAnyAvailable",
      featureTypes: ["battery", "chopShop"],
      reason: "Requires batteries or chop shops in the selected sets."
    },
    applyBundle: applyBooleanField("upgradeWorld")
  },
  {
    id: "lessSpammyGame",
    label: "A Less SPAM-Y Game",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-less-spammy-game",
    defaultState: "off",
    description: "Discard all SPAM cards from hand to your discard pile at the end of programming phase.",
    cost: VARIANT_COMPLEXITY.lessSpammyGame,
    incompatibleWith: ["criticalSpam", "classicSharedDeck"],
    applyBundle: applyBooleanField("lessSpammyGame")
  },
  {
    id: "criticalSpam",
    label: "Critical Spam",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-critical-spam",
    defaultState: "off",
    description: "SPAM is discarded to player discard pile instead of damage discard pile after resolution. Shutdown removes it normally.",
    cost: VARIANT_COMPLEXITY.criticalSpam,
    incompatibleWith: ["lessSpammyGame"],
    applyBundle: applyBooleanField("criticalSpam")
  },
  {
    id: "criticalHaywire",
    label: "Critical Haywire",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-critical-haywire",
    defaultState: "off",
    description: "Haywires placed on registers count against hand size when drawing cards at the start of programming.",
    cost: VARIANT_COMPLEXITY.criticalHaywire,
    applyBundle: applyBooleanField("criticalHaywire")
  },
  {
    id: "permanentShutdown",
    label: "Permanent Shutdown",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-permanent-shutdown",
    defaultState: "off",
    description: "A player that has nothing but SPAM in hand after drawing cards has their robot destroyed and is out of the game.",
    cost: VARIANT_COMPLEXITY.permanentShutdown,
    requiresAnyOf: ["criticalSpam"],
    applyBundle: applyBooleanField("permanentShutdown")
  },
  {
    id: "lessDeadlyGame",
    label: "A Less Deadly Game",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-less-deadly-game",
    defaultState: "off",
    description: "Treats board edges as walls.",
    cost: VARIANT_COMPLEXITY.lessDeadlyGame,
    applyBundle: applyBooleanField("lessDeadlyGame")
  },
  {
    id: "moreDeadlyGame",
    label: "A More Deadly Game",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-more-deadly-game",
    defaultState: "off",
    description: "Rebooting deals 3 damage instead of 2.",
    cost: VARIANT_COMPLEXITY.moreDeadlyGame,
    applyBundle: applyBooleanField("moreDeadlyGame")
  },
  {
    id: "cuttingFloor",
    label: "Cutting Floor",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-cutting-floor",
    defaultState: "off",
    description: "All board lasers deal double damage.",
    cost: VARIANT_COMPLEXITY.cuttingFloor,
    availability: {
      type: "featureTypeAvailable",
      featureType: "laser",
      reason: "Requires board lasers in the selected sets."
    },
    applyBundle: applyBooleanField("cuttingFloor")
  },
  {
    id: "flamingOil",
    label: "Flaming Oil",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-flaming-oil",
    defaultState: "off",
    description: "The first oil contact each register deals 1 damage.",
    cost: VARIANT_COMPLEXITY.flamingOil,
    availability: {
      type: "featureTypeAvailable",
      featureType: "oil",
      reason: "Requires oil slicks in the selected sets."
    },
    applyBundle: applyBooleanField("flamingOil")
  },
  {
    id: "repulsorOverdrive",
    label: "Repulsor Overdrive",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-repulsor-overdrive",
    defaultState: "off",
    description: "Repulsors push robots twice the remaining movement.",
    cost: VARIANT_COMPLEXITY.repulsorOverdrive,
    availability: {
      type: "featureTypeAvailable",
      featureType: "repulsor",
      reason: "Requires repulsor fields in the selected sets."
    },
    applyBundle: applyBooleanField("repulsorOverdrive")
  },
  {
    id: "setToKill",
    label: "Set to Kill",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-set-to-kill",
    defaultState: "off",
    description: "Robots' main lasers deal 1 extra damage.",
    cost: VARIANT_COMPLEXITY.setToKill,
    applyBundle: applyBooleanField("setToKill")
  },
  {
    id: "setToStun",
    label: "Set to Stun",
    category: VARIANT_CATEGORIES.danger,
    controlId: "variant-set-to-stun",
    defaultState: "off",
    description: "SPAM from robots' main lasers is immediately discarded to the damage discard pile without effect.",
    cost: VARIANT_COMPLEXITY.setToStun,
    applyBundle: applyBooleanField("setToStun")
  },
  {
    id: "dynamicArchiving",
    label: "Dynamic Archiving",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-dynamic-archiving",
    defaultState: "allowed",
    description: "Robots archive when they end a register on a checkpoint or battery space.",
    cost: VARIANT_COMPLEXITY.dynamicArchiving,
    incompatibleWith: ["homeReboot"],
    applyBundle: (bundle) => {
      bundle.recoveryRule = "dynamic_archiving";
    }
  },
  {
    id: "homeReboot",
    label: "Home Reboot",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-home-reboot",
    defaultState: "off",
    description: "Robots reboot at the token on their home dock.",
    cost: 0,
    incompatibleWith: ["dynamicArchiving"],
    applyBundle: (bundle) => {
      bundle.recoveryRule = "home_reboot";
    }
  },
  {
    id: "hazardousFlags",
    label: "Hazardous Flags",
    category: VARIANT_CATEGORIES.checkpoints,
    controlId: "variant-hazardous-flags",
    defaultState: "off",
    description: "Board elements under checkpoints stay active without moving the checkpoints.",
    cost: VARIANT_COMPLEXITY.hazardousFlags,
    applyBundle: applyBooleanField("hazardousFlags")
  },
  {
    id: "movingTargets",
    label: "Moving Targets",
    category: VARIANT_CATEGORIES.checkpoints,
    controlId: "variant-moving-targets",
    defaultState: "off",
    description: "Checkpoints on conveyors are treated as moving targets for generation heuristics.",
    cost: VARIANT_COMPLEXITY.movingTargets,
    applyBundle: applyBooleanField("movingTargets")
  },
  {
    id: "extraDocks",
    label: "Extra Docks",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-extra-docks",
    defaultState: "off",
    description: "Adds an extra docking bay if the selected sets have one and the layout has room.",
    cost: VARIANT_COMPLEXITY.extraDocks,
    availability: {
      type: "physicalDockGroupsAtLeast",
      count: 2,
      reason: "Requires at least two physical docking bays in the selected sets."
    },
    stateLabels: {
      off: { label: "No", shortLabel: "No" },
      allowed: { label: "Yes", shortLabel: "Yes" },
      forced: { label: "Must", shortLabel: "Must" }
    },
    applyBundle: applyBooleanField("extraDocks")
  },
  {
    id: "factoryRejects",
    label: "Factory Rejects",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-factory-rejects",
    defaultState: "off",
    description: "Hand size is 7 instead of 9 (Altered from previous Robo Rally editions).",
    cost: VARIANT_COMPLEXITY.factoryRejects,
    applyBundle: applyBooleanField("factoryRejects")
  },
  {
    id: "startupSpinUp",
    label: "Startup Spin-Up",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-startup-spin-up",
    defaultState: "off",
    description: "During setup, robots can start with any facing.",
    cost: VARIANT_COMPLEXITY.startupSpinUp,
    applyBundle: applyBooleanField("startupSpinUp")
  },
  {
    id: "lessForeshadowing",
    label: "Less Foreshadowing",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-less-foreshadowing",
    defaultState: "off",
    description: "Decks reshuffle every turn, reducing card-draw consistency.",
    cost: VARIANT_COMPLEXITY.lessForeshadowing,
    incompatibleWith: ["classicSharedDeck"],
    applyBundle: applyBooleanField("lessForeshadowing")
  },
  {
    id: "classicSharedDeck",
    label: "Shared Deck",
    category: VARIANT_CATEGORIES.deck,
    controlId: "variant-classic-shared-deck",
    defaultState: "off",
    description: "Players share one combined programming deck and spam cards go to hand.",
    cost: VARIANT_COMPLEXITY.classicSharedDeck,
    incompatibleWith: ["lessSpammyGame", "lessForeshadowing"],
    applyBundle: applyBooleanField("classicSharedDeck")
  },
  {
    id: "competitiveMode",
    label: "Competitive Mode",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-competitive-mode",
    defaultState: "off",
    description: "Before the game, players block starting spaces with energy cubes before choosing from the remaining starts.",
    cost: VARIANT_COMPLEXITY.competitiveMode,
    applyBundle: applyBooleanField("competitiveMode")
  },
  {
    id: "staggeredBoards",
    label: "Staggered Boards",
    category: VARIANT_CATEGORIES.board,
    controlId: "variant-staggered-boards",
    defaultState: "off",
    description: "Allows the main boards to be offset instead of forming a straight aligned block.",
    cost: VARIANT_COMPLEXITY.staggeredBoards,
    stateLabels: {
      off: { label: "Aligned", shortLabel: "Aligned" },
      allowed: { label: "Random", shortLabel: "Random" },
      forced: { label: "Staggered", shortLabel: "Offset" }
    },
    applyBundle: (bundle) => {
      bundle.staggeredBoards = true;
      bundle.alignedLayout = false;
    }
  }
];

export const VARIANT_DEFINITIONS = VARIANT_DEFINITION_ROWS
  .map((variant) => ({ ...variant }))
  .sort((left, right) => left.label.localeCompare(right.label));

export const VARIANT_CONTROL_IDS = Object.fromEntries(
  VARIANT_DEFINITIONS.map((variant) => [variant.id, variant.controlId])
);

export function getVariantDefinition(variantId) {
  return VARIANT_DEFINITIONS.find((variant) => variant.id === variantId) ?? null;
}

export function getVariantRequirementIds(variantId) {
  return getVariantDefinition(variantId)?.requiresAnyOf ?? [];
}

export function getVariantAvailabilityRule(variantId) {
  return getVariantDefinition(variantId)?.availability ?? null;
}

export function getVariantDefinitionsByCategory() {
  return VARIANT_DEFINITIONS.reduce((groups, variant) => {
    const current = groups.get(variant.category) ?? [];
    current.push(variant);
    groups.set(variant.category, current);
    return groups;
  }, new Map());
}

export function buildVariantBundle(activeVariants = {}, options = {}) {
  const bundle = {
    alignedLayout: true,
    recoveryRule: "reboot_tokens",
    variantComplexityBudget: options.budget ?? 0,
    variantComplexityUsed: options.usedBudget ?? 0
  };

  VARIANT_DEFINITIONS.forEach((variant) => {
    const active = Boolean(activeVariants[variant.id]);
    bundle[variant.id] = active;
    if (active) {
      variant.applyBundle?.(bundle, activeVariants, options);
    }
  });

  return bundle;
}

export function applyVariantGenerationOptions(baseOptions = {}, variantBundle = {}) {
  return {
    ...baseOptions,
    alignedLayout: variantBundle.alignedLayout ?? baseOptions.alignedLayout,
    actFast: Boolean(variantBundle.actFast),
    competitiveMode: Boolean(variantBundle.competitiveMode),
    extraDocks: Boolean(variantBundle.extraDocks)
  };
}

export function applyVariantAnalysisOptions(baseOptions = {}, variantBundle = {}) {
  return {
    ...baseOptions,
    competitiveMode: Boolean(variantBundle.competitiveMode),
    recoveryRule: variantBundle.recoveryRule ?? baseOptions.recoveryRule,
    lessDeadlyGame: Boolean(variantBundle.lessDeadlyGame),
    lessSpammyGame: Boolean(variantBundle.lessSpammyGame),
    criticalSpam: Boolean(variantBundle.criticalSpam),
    criticalHaywire: Boolean(variantBundle.criticalHaywire),
    permanentShutdown: Boolean(variantBundle.permanentShutdown),
    moreDeadlyGame: Boolean(variantBundle.moreDeadlyGame),
    cuttingFloor: Boolean(variantBundle.cuttingFloor),
    flamingOil: Boolean(variantBundle.flamingOil),
    repulsorOverdrive: Boolean(variantBundle.repulsorOverdrive),
    setToKill: Boolean(variantBundle.setToKill),
    setToStun: Boolean(variantBundle.setToStun),
    upgradeWorld: Boolean(variantBundle.upgradeWorld),
    lighterGame: Boolean(variantBundle.lighterGame),
    startupSpinUp: Boolean(variantBundle.startupSpinUp),
    hazardousFlags: Boolean(variantBundle.hazardousFlags),
    movingTargets: Boolean(variantBundle.movingTargets),
    lessForeshadowing: Boolean(variantBundle.lessForeshadowing)
  };
}

export function applyVariantScenarioState(baseScenario = {}, variantBundle = {}) {
  const next = {
    ...baseScenario,
    recoveryRule: variantBundle.recoveryRule ?? baseScenario.recoveryRule,
    variantComplexityBudget: variantBundle.variantComplexityBudget ?? baseScenario.variantComplexityBudget ?? 0,
    variantComplexityUsed: variantBundle.variantComplexityUsed ?? baseScenario.variantComplexityUsed ?? 0
  };

  VARIANT_DEFINITIONS.forEach((variant) => {
    next[variant.id] = Boolean(variantBundle[variant.id]);
  });

  return next;
}
