export const VARIANT_STATES = {
  off: { label: "Not allowed", shortLabel: "No" },
  allowed: { label: "Allowed", shortLabel: "Yes" },
  forced: { label: "Always on", shortLabel: "Must" }
};

// Variant complexity is ONLY the OPTIONAL generation budget used to avoid
// generated courses becoming long lists of special rules. It is not difficulty,
// RE, or mental-event count. User-forced / Must / must-like selections are
// deliberate user choices and NEVER consume this optional budget.
//
// Scale semantics (v49em):
//   0 = essentially self-executing setup/simplification: no meaningful extra
//       scenario procedure or rule-state burden needs to be carried through play;
//   1 = one additional rule/procedure/strategic setup evaluation, whether it is
//       resolved before play or persists during play;
//   2 = unusually stateful / programming-complex rule that materially increases
//       the amount of special-rule state players must track.
//
// Complexity is deliberately broader than per-turn mental RE. For example,
// Pay to Win has setup price evaluation (complexity 1) but no programming-turn
// memory event; Home Reboot is effectively ordinary reboot play with a friendlier
// destination (complexity 0).
//
// Mental burden is modeled separately by per-variant metadata below. A complexity
// cost does not imply a mental event, and a rule may have complexity 1 while its
// physical setup/card state makes a separate remember-the-rule event unnecessary.
const VARIANT_COMPLEXITY = {
  actFast: 1,
  lighterGame: 0,
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
  classicSharedDeck: 1,
  dynamicArchiving: 1,
  homeReboot: 0,
  hazardousFlags: 1,
  movingTargets: 2,
  lessForeshadowing: 1,
  extraDocks: 0,
  factoryRejects: 1,
  startupSpinUp: 0,
  competitiveMode: 1,
  payToWin: 1,
  subsidizedStarts: 1,
  staggeredBoards: 0,
  virtualBots: 1,
  noDocks: 0,
  sandwichedDock: 0,
  repairStations: 1
};

const VARIANT_CATEGORIES = {
  factoryFloor: "factory-floor",
  programming: "programming",
  robots: "robots",
  setup: "setup",
  boardLayout: "board-layout"
};

function applyBooleanField(field) {
  return (bundle) => {
    bundle[field] = true;
  };
}

export const VARIANT_EXCLUSIVE_GROUPS = Object.freeze({
  startingSpaceSetup: Object.freeze({
    label: "starting-space setup",
    description: "Virtual Bots, Competitive Mode, Pay to Win, and Subsidized Starts are mutually exclusive starting-space setups; only one can be active on a generated course."
  }),
  dockLayout: Object.freeze({
    label: "dock layout",
    description: "Virtual Bots, Extra Docks, No Docks, and Sandwiched Dock are mutually exclusive starting-layout options; only one can be active on a generated course."
  }),
  recoveryRule: Object.freeze({
    label: "recovery rule",
    description: "Dynamic Archiving and Home Reboot are mutually exclusive recovery rules; only one can be active on a generated course."
  })
});

const VARIANT_DEFINITION_ROWS = [
  {
    id: "actFast",
    label: "Act Fast",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-act-fast",
    defaultState: "off",
    description: "Programming is timed.",
    cost: VARIANT_COMPLEXITY.actFast,
    complexityRationale: "A programming timer is one persistent rule players must follow every round.",
    applyBundle: applyBooleanField("actFast")
  },
  {
    id: "lighterGame",
    label: "Energy Crisis",
    officialName: "A Lighter Game",
    sourceLabel: "2023 rulebook",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-lighter-game",
    defaultState: "off",
    description: "Remove upgrade cards from the game. Battery and Chop Shop spaces provide no Energy or upgrade effects.",
    cost: VARIANT_COMPLEXITY.lighterGame,
    complexityRationale: "Simplifies the game by removing the upgrade phase/resource system; the changed spaces are self-executing rather than extra rule-state to manage.",
    incompatibleWith: ["upgradeWorld", "payToWin", "subsidizedStarts"],
    applyBundle: applyBooleanField("lighterGame")
  },
  {
    id: "upgradeWorld",
    label: "Upgrade World",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-upgrade-world",
    defaultState: "off",
    description: "Activating batteries and chop shops also draws an upgrade card.",
    cost: VARIANT_COMPLEXITY.upgradeWorld,
    complexityRationale: "Battery/Chop Shop activations gain one persistent extra upgrade-draw rule.",
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
    label: "SPAM Filter",
    officialName: "A Less SPAM-Y Game",
    sourceLabel: "2023 rulebook",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-less-spammy-game",
    defaultState: "off",
    description: "Discard all SPAM cards from hand to your discard pile at the end of programming phase.",
    cost: VARIANT_COMPLEXITY.lessSpammyGame,
    complexityRationale: "End-of-programming SPAM filtering is one recurring in-game procedure.",
    // Shared Deck has no personal discard pile for this rule to use.
    incompatibleWith: ["criticalSpam", "classicSharedDeck"],
    applyBundle: applyBooleanField("lessSpammyGame")
  },
  {
    id: "criticalSpam",
    label: "Critical Spam",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-critical-spam",
    defaultState: "off",
    description: "SPAM is discarded to player discard pile instead of damage discard pile after resolution. Shutdown removes it normally.",
    cost: VARIANT_COMPLEXITY.criticalSpam,
    complexityRationale: "SPAM persistence/discard destination changes through play as one recurring damage rule.",
    incompatibleWith: ["lessSpammyGame"],
    recommendations: [
      {
        targetId: "criticalHaywire",
        text: "Critical Haywire pairs well with Critical SPAM for a harsher damage game."
      },
      {
        targetId: "permanentShutdown",
        text: "Permanent Shutdown pairs well with Critical SPAM when you want damage to carry a real risk of elimination."
      }
    ],
    applyBundle: applyBooleanField("criticalSpam")
  },
  {
    id: "criticalHaywire",
    label: "Critical Haywire",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-critical-haywire",
    defaultState: "off",
    description: "Haywires placed on registers count against hand size when drawing cards at the start of programming.",
    cost: VARIANT_COMPLEXITY.criticalHaywire,
    complexityRationale: "Haywire changes the draw/hand-size rule throughout play.",
    recommendations: [
      {
        targetId: "criticalSpam",
        text: "Critical SPAM pairs well with Critical Haywire for a harsher damage game."
      }
    ],
    applyBundle: applyBooleanField("criticalHaywire")
  },
  {
    id: "permanentShutdown",
    label: "Permanent Shutdown",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-permanent-shutdown",
    defaultState: "off",
    description: "A player that has nothing but SPAM in hand after drawing cards has their robot destroyed and is out of the game.",
    cost: VARIANT_COMPLEXITY.permanentShutdown,
    complexityRationale: "Adds one persistent elimination condition tied to heavy SPAM accumulation.",
    mentalEvent: {
      cadence: "none",
      rationale: "Permanent Shutdown changes the strategic value of accumulating SPAM; it does not add a separate remember-the-rule event during ordinary programming."
    },
    requiresAnyOf: ["criticalSpam"],
    applyBundle: applyBooleanField("permanentShutdown")
  },
  {
    id: "lessDeadlyGame",
    label: "Walled In",
    officialName: "A Less Deadly Game",
    sourceLabel: "2023 rulebook",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-less-deadly-game",
    defaultState: "off",
    description: "Treats board edges as walls.",
    cost: VARIANT_COMPLEXITY.lessDeadlyGame,
    complexityRationale: "Board edges behave as walls throughout play, one persistent movement rule.",
    applyBundle: applyBooleanField("lessDeadlyGame")
  },
  {
    id: "moreDeadlyGame",
    label: "Hard Reboot",
    officialName: "A More Deadly Game",
    sourceLabel: "2023 rulebook",
    category: VARIANT_CATEGORIES.robots,
    controlId: "variant-more-deadly-game",
    defaultState: "off",
    description: "Rebooting deals 3 damage instead of 2.",
    cost: VARIANT_COMPLEXITY.moreDeadlyGame,
    complexityRationale: "Reboot damage changes throughout play, one persistent recovery rule.",
    applyBundle: applyBooleanField("moreDeadlyGame")
  },
  {
    id: "cuttingFloor",
    label: "Cutting Floor",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-cutting-floor",
    defaultState: "off",
    description: "All board lasers deal double damage.",
    cost: VARIANT_COMPLEXITY.cuttingFloor,
    complexityRationale: "One persistent in-game rule changes an existing board element; players must remember that board lasers are more dangerous.",
    mentalEvent: {
      cadence: "once-per-game-turn",
      trigger: "board-laser-relevant",
      eventType: "variant-rule:cutting-floor",
      rationale: "Remember once in a turn that board lasers deal double damage when board-laser danger is relevant; repeated lasers in the same turn do not create repeated memory events."
    },
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
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-flaming-oil",
    defaultState: "off",
    description: "Oil slicks deal 1 damage when a robot enters any oil during a register, and 1 additional damage if it ends that register on oil.",
    cost: VARIANT_COMPLEXITY.flamingOil,
    complexityRationale: "Oil gains one persistent damage rule that matters whenever oil is encountered.",
    mentalEvent: {
      cadence: "once-per-game-turn",
      trigger: "flaming-oil-relevant",
      eventType: "variant-rule:flaming-oil",
      rationale: "Remember once in a turn that oil is damaging when Flaming Oil is actually relevant; multiple oil spaces or both entry/end damage in that turn do not create repeated memory events."
    },
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
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-repulsor-overdrive",
    defaultState: "off",
    description: "Repulsors push robots twice the full distance of the triggering Move card.",
    cost: VARIANT_COMPLEXITY.repulsorOverdrive,
    complexityRationale: "Repulsors gain one persistent altered-movement rule.",
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
    category: VARIANT_CATEGORIES.robots,
    controlId: "variant-set-to-kill",
    defaultState: "off",
    description: "Robots' main lasers deal double damage.",
    cost: VARIANT_COMPLEXITY.setToKill,
    complexityRationale: "Robot main lasers gain one persistent damage-resolution rule; no separate programming-turn mental event.",
    applyBundle: applyBooleanField("setToKill")
  },
  {
    id: "setToStun",
    label: "Set to Stun",
    category: VARIANT_CATEGORIES.robots,
    controlId: "variant-set-to-stun",
    defaultState: "off",
    description: "Put SPAM drawn from damage caused by robots' main lasers in the damage discard pile.",
    cost: VARIANT_COMPLEXITY.setToStun,
    complexityRationale: "Robot main-laser damage gains one persistent SPAM-resolution rule; no separate programming-turn mental event.",
    applyBundle: applyBooleanField("setToStun")
  },
  {
    id: "dynamicArchiving",
    label: "Dynamic Archiving",
    category: VARIANT_CATEGORIES.robots,
    controlId: "variant-dynamic-archiving",
    defaultState: "allowed",
    description: "Robots archive when they end a register on a checkpoint or battery space.",
    cost: VARIANT_COMPLEXITY.dynamicArchiving,
    complexityRationale: "Archive location changes dynamically during play, one persistent recovery rule.",
    exclusiveGroups: ["recoveryRule"],
    applyBundle: (bundle) => {
      bundle.recoveryRule = "dynamic_archiving";
    }
  },
  {
    id: "homeReboot",
    label: "Home Reboot",
    category: VARIANT_CATEGORIES.robots,
    controlId: "variant-home-reboot",
    defaultState: "off",
    description: "Robots reboot at the reboot token on their home dock.",
    cost: VARIANT_COMPLEXITY.homeReboot,
    complexityRationale: "Uses the ordinary reboot procedure with a fixed home-dock destination; it adds essentially no extra scenario-management burden.",
    exclusiveGroups: ["recoveryRule"],
    applyBundle: (bundle) => {
      bundle.recoveryRule = "home_reboot";
    }
  },
  {
    id: "hazardousFlags",
    label: "Hazardous Flags",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-hazardous-flags",
    defaultState: "off",
    description: "Board elements under checkpoints stay active without moving the checkpoints.",
    cost: VARIANT_COMPLEXITY.hazardousFlags,
    complexityRationale: "One persistent rule keeps covered board elements active under checkpoints.",
    applyBundle: applyBooleanField("hazardousFlags")
  },
  {
    id: "repairStations",
    label: "Repair Stations",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-repair-stations",
    defaultState: "off",
    description: "At the end of register 5, a robot on an ordinary checkpoint removes 1 Damage card. The Virtual Bots entry is not a repair station.",
    cost: VARIANT_COMPLEXITY.repairStations,
    complexityRationale: "Ordinary checkpoints gain one persistent end-of-turn repair rule.",
    mentalEvent: {
      cadence: "once-per-game-turn",
      trigger: "repair-station-relevant",
      eventType: "variant-rule:repair-station",
      rationale: "Remember once in a turn that an ordinary checkpoint can repair at register 5 when the selected route actually ends register 5 there."
    },
    applyBundle: applyBooleanField("repairStations")
  },
  {
    id: "movingTargets",
    label: "Moving Targets",
    category: VARIANT_CATEGORIES.factoryFloor,
    controlId: "variant-moving-targets",
    defaultState: "off",
    description: "During each register, checkpoints on conveyors move with the belts; return them to their marked re-entry spaces when they would leave the conveyor or stop moving.",
    cost: VARIANT_COMPLEXITY.movingTargets,
    complexityRationale: "Moving checkpoints create unusually stateful turn-by-turn programming consequences, so this is the current clear complexity-2 rule.",
    applyBundle: applyBooleanField("movingTargets")
  },
  {
    id: "extraDocks",
    label: "Extra Docks",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-extra-docks",
    defaultState: "off",
    description: "Use more than one physical docking bay.",
    cost: VARIANT_COMPLEXITY.extraDocks,
    complexityRationale: "Setup-only dock-layout choice; once robots start, no additional rule remains in play.",
    exclusiveGroups: ["dockLayout"],
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
    id: "noDocks",
    label: "No Docks",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-no-docks",
    defaultState: "off",
    description: "Use one full exposed outer board edge as the starting zone instead of a docking bay.",
    cost: VARIANT_COMPLEXITY.noDocks,
    complexityRationale: "Setup-only starting-zone choice; once robots start, no additional rule remains in play.",
    exclusiveGroups: ["dockLayout"],
    incompatibleWith: ["homeReboot"],
    applyBundle: applyBooleanField("noDocks")
  },
  {
    id: "sandwichedDock",
    label: "Sandwiched Dock",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-sandwiched-dock",
    defaultState: "off",
    description: "Place a physical docking bay between factory boards, with factory boards adjoining both long sides.",
    cost: VARIANT_COMPLEXITY.sandwichedDock,
    complexityRationale: "Setup-only dock placement; once robots start, no additional rule remains in play.",
    exclusiveGroups: ["dockLayout"],
    applyBundle: applyBooleanField("sandwichedDock")
  },
  {
    id: "factoryRejects",
    label: "Factory Rejects",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-factory-rejects",
    defaultState: "off",
    description: "Hand size is 7 instead of 9.",
    sourceRelation: { source: "previous-editions", relation: "altered" },
    cost: VARIANT_COMPLEXITY.factoryRejects,
    complexityRationale: "One simple programming-phase procedure changes the draw count; it adds rule-list clutter but no separate during-programming reminder.",
    mentalEvent: {
      cadence: "none",
      rationale: "The smaller hand is already physically present when choosing cards, so there is no separate remember-the-rule planning event."
    },
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
    complexityRationale: "Setup-only facing choice; it creates no persistent rule after play begins.",
    applyBundle: applyBooleanField("startupSpinUp")
  },
  {
    id: "virtualBots",
    label: "Virtual Bots",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-virtual-bots",
    defaultState: "off",
    description: "Removes docking bays and starts every robot as a Virtual Bot from one shared entry point. Virtual Bots move normally but do not interact with robots or other Virtual Bots until they become physical robots at the end of a turn.",
    cost: VARIANT_COMPLEXITY.virtualBots,
    complexityRationale: "Virtual/non-interacting state persists into opening play, so this is an in-game rule rather than setup-only, but it is still one compact rule package.",
    exclusiveGroups: ["startingSpaceSetup", "dockLayout"],
    incompatibleWith: ["homeReboot"],
    recommendations: [
      {
        targetId: "startupSpinUp",
        text: "Startup Spin-Up pairs well with the shared-entry setup by giving each robot more freedom in how it leaves the start."
      },
      {
        targetId: "dynamicArchiving",
        text: "Dynamic Archiving pairs well with the shared-entry setup by letting recovery points develop naturally during the race."
      }
    ],
    applyBundle: applyBooleanField("virtualBots")
  },
  {
    id: "lessForeshadowing",
    label: "Less Foreshadowing",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-less-foreshadowing",
    defaultState: "off",
    description: "At the end of each round, shuffle your programming deck, discard pile, and non-damage cards in hand together to form a new programming deck.",
    cost: VARIANT_COMPLEXITY.lessForeshadowing,
    complexityRationale: "The deck-reset procedure recurs every round, so it is one persistent special rule even though it adds no separate programming-time mental event.",
    mentalEvent: {
      cadence: "none",
      rationale: "The reset determines the cards physically available before programming; it is not an extra fact the player must remember while choosing the program."
    },
    applyBundle: applyBooleanField("lessForeshadowing")
  },
  {
    id: "classicSharedDeck",
    label: "Shared Deck",
    category: VARIANT_CATEGORIES.programming,
    controlId: "variant-classic-shared-deck",
    defaultState: "off",
    description: "Use one shared programming deck. Damage SPAM gained by a player goes directly into that player's next hand.",
    cost: VARIANT_COMPLEXITY.classicSharedDeck,
    complexityRationale: "The shared draw/damage procedure is one persistent special rule; it changes card state but requires no separate programming-time reminder.",
    mentalEvent: {
      cadence: "none",
      rationale: "The shared draw environment changes card availability itself; it does not add a separate remember-the-rule event while selecting a program."
    },
    // SPAM Filter depends on a personal discard pile, which Shared Deck removes.
    incompatibleWith: ["lessSpammyGame"],
    applyBundle: applyBooleanField("classicSharedDeck")
  },
  {
    id: "competitiveMode",
    label: "Competitive Mode",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-competitive-mode",
    defaultState: "off",
    description: "Before the game, players take turns blocking starting spaces, then choose strategically from the remaining starts.",
    cost: VARIANT_COMPLEXITY.competitiveMode,
    complexityRationale: "Blocking and strategic start selection add one substantial setup procedure even though the rule is finished before normal play begins.",
    exclusiveGroups: ["startingSpaceSetup"],
    recommendations: [
      {
        targetId: "lighterGame",
        text: "Energy Crisis / A Lighter Game pairs well with Competitive Mode when you want the starting-space contest to be less affected by upgrades and Energy."
      }
    ],
    applyBundle: applyBooleanField("competitiveMode")
  },
  {
    id: "payToWin",
    label: "Pay to Win",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-pay-to-win",
    defaultState: "off",
    description: "Some starting spaces cost starting Energy; pay the shown cost when choosing a start.",
    cost: VARIANT_COMPLEXITY.payToWin,
    complexityRationale: "Starting-space price evaluation adds one setup decision layer even though no special rule remains after starting spaces are chosen.",
    exclusiveGroups: ["startingSpaceSetup"],
    incompatibleWith: ["lighterGame"],
    applyBundle: applyBooleanField("payToWin")
  },
  {
    id: "subsidizedStarts",
    label: "Subsidized Starts",
    category: VARIANT_CATEGORIES.setup,
    controlId: "variant-subsidized-starts",
    defaultState: "off",
    description: "Some starting spaces grant extra starting Energy; add the shown subsidy when choosing a start.",
    cost: VARIANT_COMPLEXITY.subsidizedStarts,
    complexityRationale: "Starting-space subsidy evaluation adds one setup decision layer even though no special rule remains after starting spaces are chosen.",
    exclusiveGroups: ["startingSpaceSetup"],
    incompatibleWith: ["lighterGame"],
    applyBundle: applyBooleanField("subsidizedStarts")
  },
  {
    id: "staggeredBoards",
    label: "Staggered Boards",
    category: VARIANT_CATEGORIES.boardLayout,
    controlId: "variant-staggered-boards",
    defaultState: "off",
    description: "Allows the main boards to be offset instead of forming a straight aligned block.",
    cost: VARIANT_COMPLEXITY.staggeredBoards,
    complexityRationale: "Board offset is embodied by the physical layout; there is no special rule to remember after setup.",
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

export function getVariantMentalEventRule(variantId) {
  return getVariantDefinition(variantId)?.mentalEvent ?? null;
}

export function getActiveVariantMentalEventRules(activeVariants = {}) {
  return VARIANT_DEFINITIONS
    .filter((variant) => (
      Boolean(activeVariants?.[variant.id]) &&
      variant?.mentalEvent?.cadence === "once-per-game-turn" &&
      variant?.mentalEvent?.trigger
    ))
    .map((variant) => ({
      variantId: variant.id,
      label: variant.label,
      ...variant.mentalEvent
    }));
}

export function getVariantRequirementIds(variantId) {
  return getVariantDefinition(variantId)?.requiresAnyOf ?? [];
}

export function getVariantExclusiveGroupIds(variantId) {
  return getVariantDefinition(variantId)?.exclusiveGroups ?? [];
}

export function getVariantExclusiveGroupDefinition(groupId) {
  return VARIANT_EXCLUSIVE_GROUPS[groupId] ?? null;
}

export function getVariantExclusiveGroupConflict(leftVariantId, rightVariantId) {
  if (!leftVariantId || !rightVariantId || leftVariantId === rightVariantId) {
    return null;
  }
  const rightGroups = new Set(getVariantExclusiveGroupIds(rightVariantId));
  const sharedGroupId = getVariantExclusiveGroupIds(leftVariantId)
    .find((groupId) => rightGroups.has(groupId));
  if (!sharedGroupId) {
    return null;
  }
  return {
    id: sharedGroupId,
    ...(getVariantExclusiveGroupDefinition(sharedGroupId) ?? {})
  };
}

export function getVariantAvailabilityRule(variantId) {
  return getVariantDefinition(variantId)?.availability ?? null;
}

// Soft rule relationships are deliberately separate from hard incompatibilities,
// prerequisites, and collection availability. Main evaluates these against the
// current selection/collection so suggestions and warnings can react to context
// without changing whether a rule is legal.
//
// `recommendations` is a compact UI-only shorthand for the common case where a
// Must rule suggests one or more companion rules. Keep the returned guidance
// shape stable so Main's existing availability/conflict filtering remains the
// only consumer behavior. Legacy `guidance` entries remain supported for future
// warning types or recommendation rules that need a different activation policy.
export function getVariantGuidanceRules(variantId) {
  const variant = getVariantDefinition(variantId);
  if (!variant) return [];

  const recommendations = (variant.recommendations ?? [])
    .filter((recommendation) => recommendation?.targetId && recommendation?.text)
    .map((recommendation) => ({
      kind: "suggest",
      targetId: recommendation.targetId,
      sourceActivation: "forced",
      text: recommendation.text
    }));

  return [
    ...(variant.guidance ?? []),
    ...recommendations
  ];
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
      variant.applyBundle?.(bundle);
    }
  });

  return bundle;
}

export function applyVariantGenerationOptions(baseOptions = {}, variantBundle = {}) {
  // v38: generation and analysis share one authoritative variant projection.
  // Main may add construction-only fields, but it should not maintain a second
  // hand-written list of route-analysis variant flags.
  return {
    ...baseOptions,
    ...applyVariantAnalysisOptions(baseOptions, variantBundle),
    alignedLayout: variantBundle.alignedLayout ?? baseOptions.alignedLayout,
    actFast: Boolean(variantBundle.actFast),
    competitiveMode: Boolean(variantBundle.competitiveMode),
    payToWin: Boolean(variantBundle.payToWin || variantBundle.subsidizedStarts),
    subsidizedStarts: Boolean(variantBundle.subsidizedStarts),
    extraDocks: Boolean(variantBundle.extraDocks),
    noDocks: Boolean(variantBundle.noDocks),
    sandwichedDock: Boolean(variantBundle.sandwichedDock),
    virtualBots: Boolean(variantBundle.virtualBots),
    recoveryRule: variantBundle.recoveryRule ?? baseOptions.recoveryRule
  };
}

export function applyVariantAnalysisOptions(baseOptions = {}, variantBundle = {}) {
  const virtualBots = Boolean(variantBundle.virtualBots);
  const numeric = (key) => {
    const raw = variantBundle[key];
    return raw !== null && raw !== undefined && Number.isFinite(Number(raw))
      ? Number(raw)
      : baseOptions[key];
  };

  return {
    ...baseOptions,
    // Preserve the complete registry bundle first. Analyze ignores construction-
    // only fields it does not understand, while future route-relevant variants no
    // longer disappear merely because this normalizing function was not edited.
    ...variantBundle,
    // Programming / information rules are projected too even when a particular
    // Analyze revision only uses them for uncertainty or diagnostics. This keeps
    // the registry as the single route-analysis boundary.
    actFast: Boolean(variantBundle.actFast),
    factoryRejects: Boolean(variantBundle.factoryRejects),
    classicSharedDeck: Boolean(variantBundle.classicSharedDeck),
    lessForeshadowing: Boolean(variantBundle.lessForeshadowing),
    competitiveMode: Boolean(variantBundle.competitiveMode),
    payToWin: Boolean(variantBundle.payToWin || variantBundle.subsidizedStarts),
    subsidizedStarts: Boolean(variantBundle.subsidizedStarts),
    recoveryRule: variantBundle.recoveryRule ?? baseOptions.recoveryRule,

    // Resource knobs stay open for optional rules that alter starting Energy or
    // starting upgrade cards. Undefined values simply preserve the caller base.
    startingEnergy: numeric("startingEnergy"),
    startingEnergyDelta: numeric("startingEnergyDelta"),
    startingUpgradeCards: numeric("startingUpgradeCards"),
    startingUpgradeCardDelta: numeric("startingUpgradeCardDelta"),
    maxEnergy: numeric("maxEnergy"),
    upgradeDrawsPerTurn: numeric("upgradeDrawsPerTurn"),
    upgradeInstallsPerTurn: numeric("upgradeInstallsPerTurn"),
    upgradeDrawEnergyCost: numeric("upgradeDrawEnergyCost"),
    upgradeUsefulCardRate: numeric("upgradeUsefulCardRate"),
    upgradeUsefulEnergyPerInstall: numeric("upgradeUsefulEnergyPerInstall"),
    upgradePowerRegistersPerEnergy: numeric("upgradePowerRegistersPerEnergy"),
    routeRegistersPerTurn: numeric("routeRegistersPerTurn"),

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
    virtualBots,
    // Virtual Bots still create full strategic traffic from register 1. Only the
    // *uncertainty* clock is held for the first turn; Analyze interprets this as
    // five known-traffic registers before normal time/interaction decay begins.
    trafficGraceRegisters: virtualBots ? 5 : 0,
    hazardousFlags: Boolean(variantBundle.hazardousFlags),
    repairStations: Boolean(variantBundle.repairStations),
    movingTargets: Boolean(variantBundle.movingTargets)
  };
}

export function applyVariantScenarioState(baseScenario = {}, variantBundle = {}) {
  const next = {
    ...baseScenario,
    recoveryRule: variantBundle.recoveryRule ?? baseScenario.recoveryRule,
    startingEnergy: Number.isFinite(variantBundle.startingEnergy)
      ? Number(variantBundle.startingEnergy)
      : baseScenario.startingEnergy,
    startingEnergyDelta: Number.isFinite(variantBundle.startingEnergyDelta)
      ? Number(variantBundle.startingEnergyDelta)
      : baseScenario.startingEnergyDelta,
    variantComplexityBudget: variantBundle.variantComplexityBudget ?? baseScenario.variantComplexityBudget ?? 0,
    variantComplexityUsed: variantBundle.variantComplexityUsed ?? baseScenario.variantComplexityUsed ?? 0
  };

  VARIANT_DEFINITIONS.forEach((variant) => {
    next[variant.id] = Boolean(variantBundle[variant.id]);
  });

  return next;
}
