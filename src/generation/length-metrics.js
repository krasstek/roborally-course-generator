// Robo Rally Course Randomizer - length metrics: length owner observation, wall-clock activity, expected-length forecast and RE-native play extent
import {
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getRouteEnergyEconomyConfig,
  summarizeFixedRouteUpgradeEconomyActivity,
  summarizeIntrinsicRouteForecastConfidence
} from "../../analyze.js";
import { NORMAL_EFFECTIVE_RE_SCORE_PER_RE } from "./config.js";
import { getDevAcceptableCandidatePool } from "./dev-replay.js";
import {
  computeBoardHarshness,
  computePlayerTimeLoad,
  computeProgrammingPressureProfile,
  getREDifficultyRouteMixtureEntries,
  meanFinite
} from "./difficulty-metrics.js";
import { isDevViewEnabled } from "./environment.js";
import { formatPresentedLengthLabel, getProductionLengthTurnIndex } from "./labels.js";
import { clamp } from "./math.js";
import {
  ENERGY_ECONOMY_DRAW_EVENT_WALL_CLOCK_REGISTERS,
  ENERGY_ECONOMY_INSTALL_EVENT_WALL_CLOCK_REGISTERS,
  LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER,
  PLAY_TIME_HORIZON_MIDPOINT_TURNS,
  PLAY_TIME_HORIZON_SLOPE_TURNS,
  PLAY_TIME_RESPONSE_MAX_UPLIFT,
  classifyReferencePlayTimeTurns,
  getActFastDirectTimerReduction,
  getActFastDirectTimingMultiplier,
  getActFastPressureWeight,
  getActFastREPressureMultiplier,
  getPlayTimeHorizonActivation,
  getPlayerWallClockMultiplier
} from "./play-time.js";
import { computeCourseReachableStarts, computeUsableStarts } from "./start-balance.js";
import { computeActFastLengthLoad } from "./targets.js";

export const LENGTH_OWNER_OBSERVATION_MODEL_ID =
  "re-native-wall-clock-length-bands-v49dv";

export function getLengthEconomyActivityOptions(sequence, preferences = {}) {
  const production = sequence?.firstLeg?.summary?.coursePreflight?.routeAwareBatteryScoring ?? null;
  const config = getRouteEnergyEconomyConfig(preferences);
  const fallbackHorizonTurns = Math.max(
    0,
    (Number(sequence?.summary?.totalActions) || 0) / config.registersPerTurn
  );
  const horizonTurns = Number(production?.horizonTurns) > 0
    ? Number(production.horizonTurns)
    : fallbackHorizonTurns;
  const registerScore = Number(production?.registerScore) > 0
    ? Number(production.registerScore)
    : 6.4;
  return {
    ...preferences,
    routeAwareBatteryScoring: Boolean(
      !preferences.lighterGame && horizonTurns > 0 && registerScore > 0
    ),
    routeEnergyHorizonTurns: horizonTurns,
    routeEnergyRegisterScore: registerScore,
    startingEnergy: Number.isFinite(Number(production?.startingReserve))
      ? Number(production.startingReserve)
      : config.startingEnergy,
    startingUpgradeCards: config.startingUpgradeCards,
    maxEnergy: config.maxEnergy,
    upgradeDrawsPerTurn: config.drawsPerTurn,
    upgradeInstallsPerTurn: config.installsPerTurn,
    upgradeDrawEnergyCost: Number.isFinite(Number(production?.drawEnergyCost))
      ? Number(production.drawEnergyCost)
      : config.drawEnergyCost,
    upgradeUsefulCardRate: Number.isFinite(Number(production?.usefulUpgradeCardRate))
      ? Number(production.usefulUpgradeCardRate)
      : config.usefulUpgradeCardRate,
    upgradeUsefulEnergyPerInstall: Number.isFinite(Number(production?.usefulEnergyPerInstall))
      ? Number(production.usefulEnergyPerInstall)
      : config.usefulEnergyPerInstall,
    upgradePowerRegistersPerEnergy: config.powerRegistersPerEnergy,
    routeRegistersPerTurn: config.registersPerTurn
  };
}

export function getLengthEconomyStartingEnergyOptions(baseOptions, startAnalysis, preferences = {}) {
  if (!baseOptions || (!preferences.payToWin && !preferences.subsidizedStarts)) {
    return baseOptions;
  }
  const adjustments = [
    Number(startAnalysis?.energyCost),
    Number(startAnalysis?.lateEnergyCost)
  ].filter((value) => Number.isFinite(value) && value >= 0);
  if (!adjustments.length) return baseOptions;
  const adjustment = meanFinite(adjustments);
  const baseEnergy = getCourseStartingEnergy(baseOptions);
  const maxEnergy = getCourseMaxEnergy(baseOptions);
  const signed = preferences.subsidizedStarts ? adjustment : -adjustment;
  return {
    ...baseOptions,
    startingEnergy: clamp(Math.round(baseEnergy + signed), 0, maxEnergy)
  };
}

export function summarizeLengthEconomyWallClockActivity(
  sequence,
  preferences = {},
  context = {},
  reTurnDifficulty = null,
  playTimeMultiplier = 1
) {
  if (preferences.lighterGame) {
    return {
      active: true,
      removedByEnergyCrisis: true,
      method: "card-aware-fixed-route-upgrade-activity-v49du",
      drawEventsPerPlayer: 0,
      installEventsPerPlayer: 0,
      transactionEventsPerPlayer: 0,
      nominalActivityRegisterEquivalents: 0,
      expectedActivityRegisterEquivalents: 0,
      note: "Energy Crisis removes the Energy/upgrade economy; no blanket wall-clock multiplier is applied."
    };
  }
  const tileMap = context?.goalTileMap ?? context?.tileMap ?? null;
  const reStarts = Array.isArray(reTurnDifficulty?.perStart)
    ? reTurnDifficulty.perStart
    : [];
  if (!tileMap || !reStarts.length || typeof summarizeFixedRouteUpgradeEconomyActivity !== "function") {
    return { active: false, reason: "economy-activity-inputs-unavailable" };
  }

  const startByIndex = new Map(
    (sequence?.firstLeg?.starts ?? []).map((entry) => [entry.index, entry])
  );
  const occupancyMass = reStarts.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.occupancy) || 0),
    0
  );
  const fallbackStartWeight = reStarts.length ? 1 / reStarts.length : 0;
  const baseOptions = getLengthEconomyActivityOptions(sequence, preferences);
  let drawEventsPerPlayer = 0;
  let installEventsPerPlayer = 0;
  let openingInstallEventsPerPlayer = 0;
  let laterInstallEventsPerPlayer = 0;
  let drawEnergySpentPerPlayer = 0;
  let abstractInstallInvestmentPerPlayer = 0;
  let summarizedStartWeight = 0;

  for (const reStart of reStarts) {
    const startAnalysis = startByIndex.get(reStart.index);
    if (!startAnalysis) continue;
    const startWeight = occupancyMass > 0
      ? Math.max(0, Number(reStart.occupancy) || 0) / occupancyMass
      : fallbackStartWeight;
    if (!(startWeight > 0)) continue;
    const routeEntries = getREDifficultyRouteMixtureEntries(
      { sequence },
      startAnalysis
    );
    if (!routeEntries.length) continue;
    const routeWeightTotal = routeEntries.reduce(
      (sum, entry) => sum + Math.max(0, Number(entry?.weight) || 0),
      0
    ) || routeEntries.length;
    const startOptions = getLengthEconomyStartingEnergyOptions(
      baseOptions,
      startAnalysis,
      preferences
    );
    let startDraws = 0;
    let startInstalls = 0;
    let startOpeningInstalls = 0;
    let startLaterInstalls = 0;
    let startDrawEnergy = 0;
    let startAbstractInvestment = 0;
    let usableRouteWeight = 0;

    for (const routeEntry of routeEntries) {
      const routeWeight = routeWeightTotal > 0
        ? Math.max(0, Number(routeEntry?.weight) || 0) / routeWeightTotal
        : 1 / routeEntries.length;
      if (!(routeWeight > 0) || !routeEntry?.route) continue;
      const activity = summarizeFixedRouteUpgradeEconomyActivity(
        tileMap,
        routeEntry.route,
        startOptions
      );
      if (!activity?.active) continue;
      usableRouteWeight += routeWeight;
      startDraws += Math.max(0, Number(activity.drawEvents) || 0) * routeWeight;
      startInstalls += Math.max(0, Number(activity.installEvents) || 0) * routeWeight;
      startOpeningInstalls += Math.max(0, Number(activity.openingInstallEvents) || 0) * routeWeight;
      startLaterInstalls += Math.max(0, Number(activity.laterInstallEvents) || 0) * routeWeight;
      startDrawEnergy += Math.max(0, Number(activity.drawEnergySpent) || 0) * routeWeight;
      startAbstractInvestment += Math.max(0, Number(activity.abstractInstallInvestment) || 0) * routeWeight;
    }
    if (!(usableRouteWeight > 0)) continue;
    const normalization = 1 / usableRouteWeight;
    drawEventsPerPlayer += startDraws * normalization * startWeight;
    installEventsPerPlayer += startInstalls * normalization * startWeight;
    openingInstallEventsPerPlayer += startOpeningInstalls * normalization * startWeight;
    laterInstallEventsPerPlayer += startLaterInstalls * normalization * startWeight;
    drawEnergySpentPerPlayer += startDrawEnergy * normalization * startWeight;
    abstractInstallInvestmentPerPlayer += startAbstractInvestment * normalization * startWeight;
    summarizedStartWeight += startWeight;
  }

  if (!(summarizedStartWeight > 0)) {
    return { active: false, reason: "economy-activity-routes-unavailable" };
  }
  const normalize = 1 / summarizedStartWeight;
  drawEventsPerPlayer *= normalize;
  installEventsPerPlayer *= normalize;
  openingInstallEventsPerPlayer *= normalize;
  laterInstallEventsPerPlayer *= normalize;
  drawEnergySpentPerPlayer *= normalize;
  abstractInstallInvestmentPerPlayer *= normalize;

  const transactionEventsPerPlayer = drawEventsPerPlayer + installEventsPerPlayer;
  const nominalActivityRegisterEquivalents =
    drawEventsPerPlayer * ENERGY_ECONOMY_DRAW_EVENT_WALL_CLOCK_REGISTERS +
    installEventsPerPlayer * ENERGY_ECONOMY_INSTALL_EVENT_WALL_CLOCK_REGISTERS;
  const expectedActivityRegisterEquivalents =
    nominalActivityRegisterEquivalents * Math.max(1, Number(playTimeMultiplier) || 1);

  return {
    active: true,
    removedByEnergyCrisis: false,
    method: "card-aware-fixed-route-upgrade-activity-v49du",
    drawEventsPerPlayer: Number(drawEventsPerPlayer.toFixed(3)),
    installEventsPerPlayer: Number(installEventsPerPlayer.toFixed(3)),
    openingInstallEventsPerPlayer: Number(openingInstallEventsPerPlayer.toFixed(3)),
    laterInstallEventsPerPlayer: Number(laterInstallEventsPerPlayer.toFixed(3)),
    transactionEventsPerPlayer: Number(transactionEventsPerPlayer.toFixed(3)),
    drawEnergySpentPerPlayer: Number(drawEnergySpentPerPlayer.toFixed(3)),
    abstractInstallInvestmentPerPlayer: Number(abstractInstallInvestmentPerPlayer.toFixed(3)),
    drawEventWallClockRegisters: ENERGY_ECONOMY_DRAW_EVENT_WALL_CLOCK_REGISTERS,
    installEventWallClockRegisters: ENERGY_ECONOMY_INSTALL_EVENT_WALL_CLOCK_REGISTERS,
    nominalActivityRegisterEquivalents: Number(nominalActivityRegisterEquivalents.toFixed(3)),
    expectedActivityRegisterEquivalents: Number(expectedActivityRegisterEquivalents.toFixed(3)),
    playTimeScaling: Number(Math.max(1, Number(playTimeMultiplier) || 1).toFixed(4)),
    note: "Paid upgrade-card draws and upgrade install/play events are the wall-clock primitives. Energy/card gains affect the DP and therefore event opportunity, but get no independent time tax; abstract install-investment Energy is diagnostic only."
  };
}

export function computeLengthOwnerObservation(
  sequence,
  preferences = {},
  lengthMetrics = null,
  reTurnDifficulty = null,
  context = {}
) {
  if (!sequence?.firstLeg || !lengthMetrics) {
    return { active: false, reason: "missing-length-inputs" };
  }

  const nominalRegisters = Math.max(
    0,
    Number(lengthMetrics?.inputs?.totalActionLoad) || 0
  );
  const intrinsicForecastExtraRegisters = Math.max(
    0,
    Number(lengthMetrics?.contributions?.forecastEquivalentActions) || 0
  );
  const baselineExpectedRegisters =
    nominalRegisters + intrinsicForecastExtraRegisters;

  const reStarts = Array.isArray(reTurnDifficulty?.perStart)
    ? reTurnDifficulty.perStart
    : [];
  const startByIndex = new Map(
    (sequence.firstLeg.starts ?? []).map((entry) => [entry.index, entry])
  );
  const occupancyMass = reStarts.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.occupancy) || 0),
    0
  );
  const fallbackWeight = reStarts.length ? 1 / reStarts.length : 0;
  const startWeight = (entry) => occupancyMass > 0
    ? Math.max(0, Number(entry?.occupancy) || 0) / occupancyMass
    : fallbackWeight;
  const weightedPerTurn = (selector) => reStarts.reduce((sum, entry) => {
    const turns = Math.max(1, Number(entry?.programmingTurns) || 1);
    return sum + Math.max(0, Number(selector(entry)) || 0) / turns * startWeight(entry);
  }, 0);
  const weightedStartValue = (selector, fallback = 0) => reStarts.reduce(
    (sum, entry) => {
      const start = startByIndex.get(entry.index);
      const value = Number(selector(start, entry));
      return sum + (Number.isFinite(value) ? value : fallback) * startWeight(entry);
    },
    0
  );

  const cleanCardREPerTurn = weightedPerTurn(
    (entry) => entry.cleanCardPlausibilityRE
  );
  const damageCardSupplyREPerTurn = weightedPerTurn(
    (entry) => entry.damageCardSupplyRE
  );
  const cardREPerTurn =
    cleanCardREPerTurn + damageCardSupplyREPerTurn;
  const intrinsicMentalREPerTurn = weightedPerTurn(
    (entry) => entry.mentalRE
  );
  const trafficMentalREPerTurn = weightedStartValue((start, entry) => {
    const turns = Math.max(1, Number(entry?.programmingTurns) || 1);
    return Math.max(
      0,
      Number(start?.fullCourseTrafficAwarenessMentalRegisterEquivalents) || 0
    ) / turns;
  });
  const mentalREPerTurn =
    intrinsicMentalREPerTurn + trafficMentalREPerTurn;
  const clogREPerTurn = weightedPerTurn((entry) => entry.clogRE);
  const trafficControlREPerTurn = weightedStartValue((start, entry) => {
    const turns = Math.max(1, Number(entry?.programmingTurns) || 1);
    return Math.max(0, Number(start?.fullCourseTrafficNearby) || 0) /
      NORMAL_EFFECTIVE_RE_SCORE_PER_RE /
      turns;
  });
  const trafficDamageREPerTurn = weightedStartValue((start, entry) => {
    const turns = Math.max(1, Number(entry?.programmingTurns) || 1);
    return Math.max(
      0,
      Number(
        start?.fullCourseTrafficDamageEconomyRobotLaserIncrementRegisterEquivalents
      ) || 0
    ) / turns;
  });
  const trafficForecastConfidenceMean = reStarts.length
    ? weightedStartValue(
      (start) => Number(start?.fullCourseTrafficForecastConfidence),
      1
    )
    : 1;
  const trafficForecastConfidenceEnd = reStarts.length
    ? weightedStartValue(
      (start) => Number(start?.fullCourseTrafficForecastConfidenceEnd),
      1
    )
    : 1;

  // Deliberately retain the card×mental product as an UNCALIBRATED interaction
  // signal. The user-facing design hypothesis is that scarce/awkward cards are
  // especially failure-prone when the same turn is cognitively dense. Do not
  // turn this into extra registers until cross-length calibration supports a
  // mapping.
  const cardMentalInteractionSignal = cardREPerTurn * mentalREPerTurn;

  // v49dt keeps planningPressure outside the new owner. Player count changes
  // wall-clock table resolution, not route reliability, so it remains a
  // downstream multiplier. Four players are the 1.0 reference and every
  // one-player change affects elapsed time smoothly.
  const playerCount = Math.max(1, Number(preferences.playerCount) || 4);
  const playerResolutionMultiplierIndex = getPlayerWallClockMultiplier(
    playerCount
  );
  const actFastMode = preferences.actFastMode ?? null;
  const actFastPressureWeight = getActFastPressureWeight(actFastMode);
  const actFastREPressureMultiplier = getActFastREPressureMultiplier(
    actFastMode
  );
  const actFastDirectTimerReduction = getActFastDirectTimerReduction(
    actFastMode,
    playerCount
  );
  const explicitTimingMultiplierIndex = getActFastDirectTimingMultiplier(
    actFastMode,
    playerCount
  );

  const weightedTotal = (selector) => reStarts.reduce((sum, entry) => (
    sum + Math.max(0, Number(selector(entry)) || 0) * startWeight(entry)
  ), 0);
  const chronologicalAdverseRE = weightedTotal(
    (entry) => entry.reNativeChronologicalAdverseRE
  );
  const directLostTempoRE = weightedTotal(
    (entry) => entry.lostRegisterTempoRE
  );
  const chronologicalPlayTimeAdverseRE = weightedTotal(
    (entry) => entry.reNativeChronologicalPlayTimeAdverseRE
  );
  const chronologicalDamagePressureRE = weightedTotal(
    (entry) => entry.reNativeDamagePressureRE
  );
  const reNativeForecastConfidenceMean = reStarts.length
    ? reStarts.reduce((sum, entry) => (
      sum + (Number(entry.reNativeForecastAverageConfidence) || 1) * startWeight(entry)
    ), 0)
    : 1;
  const reNativeForecastConfidenceEnd = reStarts.length
    ? reStarts.reduce((sum, entry) => (
      sum + (Number(entry.reNativeForecastEndConfidence) || 1) * startWeight(entry)
    ), 0)
    : 1;
  const reNativeForecastEndEffectiveHorizonRE = weightedTotal(
    (entry) => entry.reNativeForecastEndEffectiveHorizonRE
  );
  const reNativeBaseEffortScale = reStarts.length
    ? reStarts.reduce((sum, entry) => (
      sum + (Number(entry.reNativeBaseEffortScale) || 1) * startWeight(entry)
    ), 0)
    : 1;
  const reNativeDamageModeratedEffortScale = reStarts.length
    ? reStarts.reduce((sum, entry) => (
      sum + (Number(entry.reNativeDamageModeratedEffortScale) || 1) * startWeight(entry)
    ), 0)
    : 1;

  // The chronological ledger already contains robot-laser damage-economy and
  // traffic-awareness mental when trafficContext is present. Nearby mechanical
  // control remains a downstream RE owner outside that ledger, so add ONLY that
  // missing component here to avoid double-counting traffic.
  const downstreamTrafficControlAdverseRE = weightedStartValue((start) => (
    Math.max(0, Number(start?.fullCourseTrafficNearby) || 0) /
      NORMAL_EFFECTIVE_RE_SCORE_PER_RE
  ));
  const basePlayTimeAdverseRE =
    chronologicalPlayTimeAdverseRE + downstreamTrafficControlAdverseRE;
  // v49dt: the timer does not create a separate fake hazard tax. Instead it
  // amplifies the completed non-tempo RE burden already present. This lets even
  // 3m/2m timers indirectly extend play through recovery without pretending the
  // timer itself adds route distance or programmed registers.
  const playTimeAdverseRE =
    basePlayTimeAdverseRE * actFastREPressureMultiplier;
  const playTimeAdverseRatio = nominalRegisters > 0
    ? playTimeAdverseRE / nominalRegisters
    : 0;
  // Burden intensity is coefficient-free and saturating. v49dl now calibrates
  // how much that burden can extend actual play using a separate nominal-turn
  // horizon gate: short races have little room for adverse burden to compound,
  // while long races approach the full response.
  const playTimeResponseShape = playTimeAdverseRatio > 0
    ? playTimeAdverseRatio / (1 + playTimeAdverseRatio)
    : 0;
  const nominalProgrammingTurns = nominalRegisters / 5;
  const playTimeHorizonActivation = getPlayTimeHorizonActivation(
    nominalProgrammingTurns
  );
  const playTimeMultiplier = 1 +
    PLAY_TIME_RESPONSE_MAX_UPLIFT *
      playTimeHorizonActivation *
      playTimeResponseShape;
  const expectedPlayRegisters = nominalRegisters * playTimeMultiplier;
  const expectedPlayProgrammingTurns = expectedPlayRegisters / 5;
  const referencePlayTimeBand = classifyReferencePlayTimeTurns(
    expectedPlayProgrammingTurns
  );

  const economyActivity = summarizeLengthEconomyWallClockActivity(
    sequence,
    preferences,
    context,
    reTurnDifficulty,
    playTimeMultiplier
  );
  const economyNominalActivityRegisterEquivalents = Math.max(
    0,
    Number(economyActivity?.nominalActivityRegisterEquivalents) || 0
  );
  const economyExpectedActivityRegisterEquivalents = Math.max(
    0,
    Number(economyActivity?.expectedActivityRegisterEquivalents) || 0
  );
  // Direct Act Fast timers compress programming time, not the separate Upgrade
  // Phase. Player-count table-resolution scaling applies to both components.
  const programmingWallClockRegisterIndex =
    expectedPlayRegisters *
    playerResolutionMultiplierIndex *
    explicitTimingMultiplierIndex;
  const economyWallClockRegisterIndex =
    economyExpectedActivityRegisterEquivalents *
    playerResolutionMultiplierIndex;
  const effectiveWallClockRegisterIndex =
    programmingWallClockRegisterIndex + economyWallClockRegisterIndex;
  const upgradePhaseMultiplierIndex = expectedPlayRegisters > 0
    ? 1 + economyExpectedActivityRegisterEquivalents / expectedPlayRegisters
    : 1;
  const wallClockMultiplierIndex = expectedPlayRegisters > 0
    ? effectiveWallClockRegisterIndex / expectedPlayRegisters
    : playerResolutionMultiplierIndex * explicitTimingMultiplierIndex;
  const baselineExpectedProgrammingTurns = baselineExpectedRegisters / 5;
  const uncertaintyShare = nominalRegisters > 0
    ? intrinsicForecastExtraRegisters / nominalRegisters
    : 0;

  return {
    active: true,
    productionOwner: false,
    calibrationReady: false,
    model: LENGTH_OWNER_OBSERVATION_MODEL_ID,
    nominalRegisters: Number(nominalRegisters.toFixed(2)),
    intrinsicForecastExtraRegisters: Number(
      intrinsicForecastExtraRegisters.toFixed(2)
    ),
    baselineExpectedRegisters: Number(baselineExpectedRegisters.toFixed(2)),
    baselineExpectedProgrammingTurns: Number(
      baselineExpectedProgrammingTurns.toFixed(2)
    ),
    uncertaintyShareOfNominal: Number(uncertaintyShare.toFixed(4)),
    playerResolutionLoadLegacyUnits: Number(
      (Number(lengthMetrics?.contributions?.playerLoad) || 0).toFixed(2)
    ),
    reNativeRoutingUncertainty: {
      calibrationReady: false,
      productionOwner: false,
      semanticRole: "credible-routing-horizon",
      driverRule: "elapsed-registers + cumulative adverse RE only; damage pressure may restore capped optional search effort but not confidence",
      averageConfidence: Number(reNativeForecastConfidenceMean.toFixed(4)),
      endConfidence: Number(reNativeForecastConfidenceEnd.toFixed(4)),
      endEffectiveHorizonRE: Number(reNativeForecastEndEffectiveHorizonRE.toFixed(2)),
      chronologicalAdverseRE: Number(chronologicalAdverseRE.toFixed(2)),
      chronologicalDamagePressureRE: Number(chronologicalDamagePressureRE.toFixed(2)),
      baseEffortScale: Number(reNativeBaseEffortScale.toFixed(4)),
      damageModeratedEffortScale: Number(reNativeDamageModeratedEffortScale.toFixed(4)),
      damageEffortCeiling: Number((reStarts[0]?.reNativeDamageEffortCeiling ?? 0.5).toFixed(4)),
      missingOwners: [
        "iterative-traffic-adverse-re-chronology"
      ]
    },
    playTimeAmplification: {
      calibrationReady: true,
      productionOwner: false,
      semanticRole: "negative-re-plus-nominal-horizon-elapsed-play",
      chronologicalPlayTimeAdverseRE: Number(chronologicalPlayTimeAdverseRE.toFixed(2)),
      directLostTempoRE: Number(directLostTempoRE.toFixed(2)),
      downstreamTrafficControlAdverseRE: Number(downstreamTrafficControlAdverseRE.toFixed(2)),
      baseAdverseREBeforeActFastPressure: Number(basePlayTimeAdverseRE.toFixed(2)),
      actFastMode,
      actFastPressureWeight: Number(actFastPressureWeight.toFixed(4)),
      actFastREPressureMultiplier: Number(actFastREPressureMultiplier.toFixed(4)),
      totalAdverseRE: Number(playTimeAdverseRE.toFixed(2)),
      adverseRatio: Number(playTimeAdverseRatio.toFixed(4)),
      responseShape: Number(playTimeResponseShape.toFixed(4)),
      nominalProgrammingTurns: Number(nominalProgrammingTurns.toFixed(4)),
      horizonActivation: Number(playTimeHorizonActivation.toFixed(4)),
      maxResponseUplift: PLAY_TIME_RESPONSE_MAX_UPLIFT,
      horizonMidpointTurns: PLAY_TIME_HORIZON_MIDPOINT_TURNS,
      horizonSlopeTurns: PLAY_TIME_HORIZON_SLOPE_TURNS,
      multiplier: Number(playTimeMultiplier.toFixed(4)),
      expectedPlayRegisters: Number(expectedPlayRegisters.toFixed(2)),
      expectedPlayProgrammingTurns: Number(expectedPlayProgrammingTurns.toFixed(2)),
      referenceFourPlayerLengthBand: referencePlayTimeBand,
      calibrationSource: "v49dk fixed-seed 4-player Any-difficulty Short/Medium/Long/Epic batch; candidate-pool cross-check",
      note: "Adverse RE supplies burden intensity via r/(1+r); nominal turns gate how much burden can compound. Coefficients 0.60 / 7.0t / 1.5t are explicit provisional calibration anchors, not final wall-clock semantics."
    },
    wallClockComposite: {
      calibrationReady: false,
      productionOwner: true,
      semanticRole: "relative-elapsed-time-index-not-minutes",
      reference: "four-player = 1.0 table-resolution multiplier",
      playerCount,
      playerResolutionMultiplierIndex: Number(
        playerResolutionMultiplierIndex.toFixed(4)
      ),
      actFastMode,
      actFastDirectTimerReduction: Number(actFastDirectTimerReduction.toFixed(4)),
      upgradePhaseMultiplierIndex: Number(upgradePhaseMultiplierIndex.toFixed(4)),
      economyActivity,
      economyNominalActivityRegisterEquivalents: Number(
        economyNominalActivityRegisterEquivalents.toFixed(3)
      ),
      economyExpectedActivityRegisterEquivalents: Number(
        economyExpectedActivityRegisterEquivalents.toFixed(3)
      ),
      programmingWallClockRegisterIndex: Number(
        programmingWallClockRegisterIndex.toFixed(2)
      ),
      economyWallClockRegisterIndex: Number(
        economyWallClockRegisterIndex.toFixed(2)
      ),
      explicitTimingMultiplierIndex: Number(explicitTimingMultiplierIndex.toFixed(4)),
      wallClockMultiplierIndex: Number(wallClockMultiplierIndex.toFixed(4)),
      effectiveWallClockRegisterIndex: Number(
        effectiveWallClockRegisterIndex.toFixed(2)
      ),
      effectiveLengthIndex: Number((
        expectedPlayProgrammingTurns * wallClockMultiplierIndex
      ).toFixed(4)),
      productionComponents: [
        "player-count table-resolution multiplier",
        "Act Fast direct programming-time multiplier",
        "card-aware upgrade draw/install transaction time"
      ],
      missingOwners: [
        "variant-specific-phase-time"
      ],
      note: "v49du adds card-aware upgrade-economy transaction time to the production wall-clock owner. Paid draws and upgrade install/play events add non-register phase time; Energy/card gains affect opportunity but have no independent time tax. Act Fast direct timing compresses programming only, not upgrade phase. Energy Crisis removes this economy component instead of blanket-scaling total length. planningPressure is not a wall-clock owner."
    },
    pressureEvidence: {
      cleanCardREPerTurn: Number(cleanCardREPerTurn.toFixed(4)),
      damageCardSupplyREPerTurn: Number(
        damageCardSupplyREPerTurn.toFixed(4)
      ),
      cardREPerTurn: Number(cardREPerTurn.toFixed(4)),
      intrinsicMentalREPerTurn: Number(
        intrinsicMentalREPerTurn.toFixed(4)
      ),
      trafficMentalREPerTurn: Number(
        trafficMentalREPerTurn.toFixed(4)
      ),
      mentalREPerTurn: Number(mentalREPerTurn.toFixed(4)),
      cardMentalInteractionSignal: Number(
        cardMentalInteractionSignal.toFixed(4)
      ),
      clogREPerTurn: Number(clogREPerTurn.toFixed(4)),
      trafficControlREPerTurn: Number(
        trafficControlREPerTurn.toFixed(4)
      ),
      trafficDamageREPerTurn: Number(
        trafficDamageREPerTurn.toFixed(4)
      ),
      trafficForecastConfidenceMean: Number(
        trafficForecastConfidenceMean.toFixed(3)
      ),
      trafficForecastConfidenceEnd: Number(
        trafficForecastConfidenceEnd.toFixed(3)
      )
    },
    legacyProductionTermsPendingRetirement: {
      distanceLoad: Number(
        (Number(lengthMetrics?.contributions?.distanceLoad) || 0).toFixed(2)
      ),
      congestionLoad: Number(
        (Number(lengthMetrics?.contributions?.congestionLoad) || 0).toFixed(2)
      ),
      programmingVariantLoad: Number(
        (Number(
          lengthMetrics?.contributions?.programmingVariantLoad
        ) || 0).toFixed(2)
      ),
      actFastLoad: Number(
        (Number(lengthMetrics?.contributions?.actFastLoad) || 0).toFixed(2)
      ),
      currentLengthRaw: Number(
        (Number(lengthMetrics?.raw) || 0).toFixed(2)
      )
    },
    phaseTimeOwnership: {
      playerCount: Math.max(1, Number(preferences.playerCount) || 4),
      playerCountOwner: "production-wall-clock-multiplier",
      upgradePhase: preferences.lighterGame
        ? "removed-by-energy-crisis"
        : "production-card-aware-draw-install-events",
      actFastMode: preferences.actFastMode ?? null,
      actFastPressureOwner: "production-adverse-re-multiplier",
      actFastDirectTimingOwner: "production-wall-clock-multiplier"
    },
    note:
      "v49du candidate observation: expected-play registers own route/play extent; player count, Act Fast direct programming timing and card-aware upgrade draw/install transactions own production wall-clock scaling. Energy Crisis removes the economy transaction component rather than blanket-scaling total length. Other variant phase-time ownership remains pending; Beginner remains [0,4.0)."
  };
}

export function buildLengthOwnerCandidatePoolShadow(selectedScenario) {
  const candidates = getDevAcceptableCandidatePool(selectedScenario);
  if (!isDevViewEnabled() || !candidates.length) {
    return {
      active: false,
      reason: candidates.length ? "not-dev" : "candidate-pool-not-retained"
    };
  }
  const entries = candidates.map((candidate, index) => {
    const observation =
      candidate.metrics?.lengthMetrics?.ownerObservationV49dl ?? null;
    if (!observation?.active) return null;
    return {
      candidate: index + 1,
      selected: candidate === selectedScenario,
      requestedLength: candidate.preferences?.length ?? "any",
      currentLengthRaw: Number(candidate.metrics?.lengthRaw),
      currentWallClockTurnIndex: getProductionLengthTurnIndex(candidate.metrics),
      currentLengthLabel: formatPresentedLengthLabel(candidate.metrics),
      nominalRegisters: observation.nominalRegisters,
      intrinsicForecastExtraRegisters:
        observation.intrinsicForecastExtraRegisters,
      baselineExpectedRegisters: observation.baselineExpectedRegisters,
      baselineExpectedProgrammingTurns:
        observation.baselineExpectedProgrammingTurns,
      reNativeForecastConfidenceMean:
        observation.reNativeRoutingUncertainty?.averageConfidence ?? 1,
      reNativeForecastConfidenceEnd:
        observation.reNativeRoutingUncertainty?.endConfidence ?? 1,
      playTimeAdverseRE:
        observation.playTimeAmplification?.totalAdverseRE ?? 0,
      playTimeAdverseRatio:
        observation.playTimeAmplification?.adverseRatio ?? 0,
      playTimeResponseShape:
        observation.playTimeAmplification?.responseShape ?? 0,
      playTimeHorizonActivation:
        observation.playTimeAmplification?.horizonActivation ?? 0,
      playTimeMultiplier:
        observation.playTimeAmplification?.multiplier ?? 1,
      expectedPlayProgrammingTurns:
        observation.playTimeAmplification?.expectedPlayProgrammingTurns ?? 0,
      referenceFourPlayerLengthBand:
        observation.playTimeAmplification?.referenceFourPlayerLengthBand ?? "n/a",
      playerWallClockMultiplierIndex:
        observation.wallClockComposite?.playerResolutionMultiplierIndex ?? 1,
      actFastMode: observation.wallClockComposite?.actFastMode ?? null,
      actFastDirectTimingMultiplierIndex:
        observation.wallClockComposite?.explicitTimingMultiplierIndex ?? 1,
      economyDrawEventsPerPlayer:
        observation.wallClockComposite?.economyActivity?.drawEventsPerPlayer ?? 0,
      economyInstallEventsPerPlayer:
        observation.wallClockComposite?.economyActivity?.installEventsPerPlayer ?? 0,
      economyExpectedActivityRegisterEquivalents:
        observation.wallClockComposite?.economyExpectedActivityRegisterEquivalents ?? 0,
      economyWallClockRegisterIndex:
        observation.wallClockComposite?.economyWallClockRegisterIndex ?? 0,
      wallClockMultiplierIndex:
        observation.wallClockComposite?.wallClockMultiplierIndex ?? 1,
      effectiveWallClockRegisterIndex:
        observation.wallClockComposite?.effectiveWallClockRegisterIndex ??
          observation.playTimeAmplification?.expectedPlayRegisters ?? 0
    };
  }).filter(Boolean);
  if (!entries.length) {
    return { active: false, reason: "candidate-length-observation-unavailable" };
  }
  return {
    active: true,
    model: LENGTH_OWNER_OBSERVATION_MODEL_ID,
    candidateCount: entries.length,
    entries
  };
}

export const LENGTH_FORECAST_SPECULATIVE_CONFIDENCE = 0.50;
export const LENGTH_FORECAST_CONFIDENCE_FLOOR = 0.06;
export const LENGTH_FORECAST_MAX_ACTION_UPLIFT = 0.55;
// Length uncertainty is a smooth premium, not a cliff at 0.50 confidence.
// Squaring normalized uncertainty keeps high-confidence registers essentially
// unchanged while letting long/hazardous low-confidence tails contribute
// progressively more expected play time. The 0.50 threshold remains diagnostic.
export const LENGTH_FORECAST_UNCERTAINTY_EXPONENT = 2.00;

export function computeExpectedLengthForecastProfile(sequence, preferences = {}) {
  const firstLeg = sequence?.firstLeg;
  if (!firstLeg?.starts?.length || typeof summarizeIntrinsicRouteForecastConfidence !== "function") {
    return {
      routeCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      averageEndConfidence: 1,
      uncertaintyEquivalentActions: 0,
      uncertainRegisters: 0,
      totalRegisters: 0
    };
  }

  const usable = computeUsableStarts(firstLeg, preferences);
  const candidates = usable.length
    ? usable
    : computeCourseReachableStarts(firstLeg);
  const profiles = candidates
    .map((entry) => entry?.fullCourseRoute)
    .filter(Boolean)
    .map((route) => summarizeIntrinsicRouteForecastConfidence(route, {
      trafficGraceRegisters: preferences.virtualBots ? 5 : 0
    }))
    .filter((profile) => profile?.registerCount > 0);

  if (!profiles.length) {
    return {
      routeCount: 0,
      averageConfidence: 1,
      minimumConfidence: 1,
      averageEndConfidence: 1,
      uncertaintyEquivalentActions: 0,
      uncertainRegisters: 0,
      totalRegisters: 0
    };
  }

  const routeEquivalentActions = [];
  const routeUncertainRegisters = [];
  let weightedConfidence = 0;
  let totalRegisters = 0;
  let minimumConfidence = 1;
  let endConfidenceSum = 0;

  for (const profile of profiles) {
    let exposure = 0;
    let uncertainRegisters = 0;
    for (const confidenceValue of profile.confidenceByRegister || []) {
      const confidence = clamp(Number(confidenceValue) || 0, LENGTH_FORECAST_CONFIDENCE_FLOOR, 1);
      weightedConfidence += confidence;
      totalRegisters += 1;
      minimumConfidence = Math.min(minimumConfidence, confidence);
      if (confidence < LENGTH_FORECAST_SPECULATIVE_CONFIDENCE) {
        uncertainRegisters += 1;
      }
      const normalizedUncertainty = clamp(
        (1 - confidence) / (1 - LENGTH_FORECAST_CONFIDENCE_FLOOR),
        0,
        1
      );
      exposure += Math.pow(normalizedUncertainty, LENGTH_FORECAST_UNCERTAINTY_EXPONENT);
    }
    routeEquivalentActions.push(exposure * LENGTH_FORECAST_MAX_ACTION_UPLIFT);
    routeUncertainRegisters.push(uncertainRegisters);
    endConfidenceSum += Number(profile.endConfidence) || 1;
    minimumConfidence = Math.min(minimumConfidence, Number(profile.minimumConfidence) || 1);
  }

  return {
    routeCount: profiles.length,
    averageConfidence: Number((totalRegisters ? weightedConfidence / totalRegisters : 1).toFixed(3)),
    minimumConfidence: Number(minimumConfidence.toFixed(3)),
    averageEndConfidence: Number((endConfidenceSum / profiles.length).toFixed(3)),
    uncertaintyEquivalentActions: Number(meanFinite(routeEquivalentActions).toFixed(2)),
    uncertainRegisters: Number(meanFinite(routeUncertainRegisters).toFixed(2)),
    totalRegisters: Number((totalRegisters / profiles.length).toFixed(2)),
    speculativeThreshold: LENGTH_FORECAST_SPECULATIVE_CONFIDENCE,
    maxActionUplift: LENGTH_FORECAST_MAX_ACTION_UPLIFT,
    exponent: LENGTH_FORECAST_UNCERTAINTY_EXPONENT,
    interactionTreatment: "traffic remains separate in congestion load"
  };
}

export function computeLengthMetrics(sequence, flagCount, playerCount, boardCount, preferences = {}, boardHarshness = null) {
  const first = sequence.firstLeg.summary;
  const later = sequence.legs.slice(1);
  const totalRouteDistance = first.lengthScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteDistance || 0), 0);
  const totalActionLoad = first.actionScore + later.reduce((sum, leg) => sum + (leg.analysis.summary.averageRouteActions || 0), 0);
  const totalCongestion = first.averageTrafficPenalty + later.reduce((sum, leg) => sum + (leg.analysis.summary.congestionScore || 0), 0);
  const safePlayerCount = Math.max(1, playerCount || 4);
  const harshness = boardHarshness ?? computeBoardHarshness();
  const programmingPressure = computeProgrammingPressureProfile(sequence);
  const forecastLengthProfile = computeExpectedLengthForecastProfile(sequence, preferences);
  const checkpointLoad = 0;
  const playerLoad = computePlayerTimeLoad(safePlayerCount);
  const actionLoad = totalActionLoad * 2.8;
  const forecastUncertaintyLoad = forecastLengthProfile.uncertaintyEquivalentActions * 2.8;
  const distanceLoad = totalRouteDistance * 0.75;
  // Traffic costs real play time even on a forgiving board. That cost rises
  // when more robots must be resolved and when collisions happen on harsher
  // boards, where displacement is more likely to trigger damage, reboots, or
  // consequential rerouting.
  const congestionWeight = (
    0.08 +
    harshness.normalized * 0.10 +
    Math.max(0, safePlayerCount - 2) * 0.015
  );
  const congestionLoad = totalCongestion * congestionWeight;
  const flagAreaLoad = 0;
  const difficultyLoad = 0;
  // v38: the moving target is already followed by the route solver. Its chase
  // therefore appears naturally in action/distance load; the old path-length
  // bonus is retained only as a diagnostic estimate, not added again here.
  const movingTargetLoad = 0;
  const movingTargetLegacyEstimate = preferences.movingTargetStats?.lengthBonus ?? 0;
  const actFastLoad = computeActFastLengthLoad(preferences, safePlayerCount);
  const preUncertaintyRouteLoad = actionLoad + distanceLoad;
  const routeLoad = preUncertaintyRouteLoad + forecastUncertaintyLoad;
  const baseFrictionLoad = congestionLoad + actFastLoad;
  const preUncertaintyRaw = playerLoad + preUncertaintyRouteLoad + baseFrictionLoad;
  const baseRaw = playerLoad + routeLoad + baseFrictionLoad;

  // v49ek: Less Foreshadowing, Shared Deck and Factory Rejects now act through
  // the card/damage RE model itself. They have no separate elapsed-time term.
  const lessForeshadowingLoad = 0;
  const sharedDeckLoad = 0;
  const programmingVariantLoad = 0;
  const frictionLoad = baseFrictionLoad;

  let compactnessRaw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));
  let raw = Number((playerLoad + routeLoad + frictionLoad).toFixed(2));
  let preUncertaintyFinalRaw = Number(preUncertaintyRaw.toFixed(2));
  const variantLengthContributions = [];
  if (preferences.lessForeshadowing) {
    variantLengthContributions.push({
      id: "lessForeshadowing",
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (preferences.classicSharedDeck) {
    variantLengthContributions.push({
      id: "classicSharedDeck",
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (preferences.factoryRejects) {
    variantLengthContributions.push({
      id: "factoryRejects",
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (actFastLoad) {
    variantLengthContributions.push({
      id: "actFast",
      kind: "direct-timer",
      delta: Number(actFastLoad.toFixed(2)),
      evidence: { mode: preferences.actFastMode ?? null }
    });
  }


  // Damage-deck variants, Cutting Floor, Flaming Oil, Set to Kill/Stun, Repair
  // Stations, and similar physical rules are intentionally absent here: v38
  // relies on their route/hazard/traffic consequences instead of re-multiplying
  // total game length after those consequences have already been measured.

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
      boardCount,
      forecastConfidenceMean: forecastLengthProfile.averageConfidence,
      forecastConfidenceMin: forecastLengthProfile.minimumConfidence,
      forecastConfidenceEnd: forecastLengthProfile.averageEndConfidence,
      forecastUncertainRegisters: forecastLengthProfile.uncertainRegisters,
      forecastTotalRegisters: forecastLengthProfile.totalRegisters
    },
    contributions: {
      checkpointLoad: Number(checkpointLoad.toFixed(2)),
      playerLoad: Number(playerLoad.toFixed(2)),
      actionLoad: Number(actionLoad.toFixed(2)),
      forecastUncertaintyLoad: Number(forecastUncertaintyLoad.toFixed(2)),
      forecastEquivalentActions: forecastLengthProfile.uncertaintyEquivalentActions,
      forecastSpeculativeThreshold: forecastLengthProfile.speculativeThreshold ?? LENGTH_FORECAST_SPECULATIVE_CONFIDENCE,
      forecastMaxActionUplift: forecastLengthProfile.maxActionUplift ?? LENGTH_FORECAST_MAX_ACTION_UPLIFT,
      preUncertaintyRaw: preUncertaintyFinalRaw,
      distanceLoad: Number(distanceLoad.toFixed(2)),
      congestionLoad: Number(congestionLoad.toFixed(2)),
      congestionWeight: Number(congestionWeight.toFixed(3)),
      boardHarshness: Number(harshness.normalized.toFixed(3)),
      flagAreaLoad: Number(flagAreaLoad.toFixed(2)),
      difficultyLoad: Number(difficultyLoad.toFixed(2)),
      movingTargetLoad: Number(movingTargetLoad.toFixed(2)),
      movingTargetLegacyEstimate: Number(movingTargetLegacyEstimate.toFixed(2)),
      actFastLoad: Number(actFastLoad.toFixed(2)),
      lessForeshadowingLoad: Number(lessForeshadowingLoad.toFixed(2)),
      sharedDeckLoad: Number(sharedDeckLoad.toFixed(2)),
      programmingVariantLoad: Number(programmingVariantLoad.toFixed(2)),
      routeLoad: Number(routeLoad.toFixed(2)),
      frictionLoad: Number(frictionLoad.toFixed(2))
    },
    variantLengthContributions,
    programmingPressure,
    forecastLengthProfile,
    method: "route-derived-plus-re-native-recovery-and-wall-clock-v49es"
  };
}

// v49du production migration: expected-play registers own route/play extent;
// player-count resolution and Act Fast direct timing scale programming time;
// card-aware upgrade draw/install transactions add explicit non-register phase
// time. Energy Crisis removes that economy component rather than blanket-scaling
// the whole game. Raw distance, standalone congestion, fixed player load and
// legacy Act Fast raw deltas remain diagnostic/construction-only. The 4.0 raw
// bridge remains transitional until final elapsed-time bands are calibrated.
export function applyRENativeExpectedPlayExtentToLengthMetrics(
  lengthMetrics,
  ownerObservation,
  preferences = {}
) {
  const play = ownerObservation?.playTimeAmplification;
  const wallClock = ownerObservation?.wallClockComposite;
  const nominalRegisters = Number(ownerObservation?.nominalRegisters);
  const expectedPlayRegisters = Number(play?.expectedPlayRegisters);
  const effectiveWallClockRegisterIndex = Number(
    wallClock?.effectiveWallClockRegisterIndex
  );
  if (
    !lengthMetrics ||
    !ownerObservation?.active ||
    !play?.calibrationReady ||
    !Number.isFinite(nominalRegisters) ||
    !Number.isFinite(expectedPlayRegisters) ||
    !Number.isFinite(effectiveWallClockRegisterIndex)
  ) {
    return lengthMetrics;
  }

  const productionEquivalentActions = Math.max(
    0,
    expectedPlayRegisters - nominalRegisters
  );
  const contributions = lengthMetrics.contributions ?? {};
  const legacyActionLoad = Math.max(
    0,
    Number(contributions.actionLoad) || 0
  );
  const legacyEquivalentActions = Math.max(
    0,
    Number(contributions.forecastEquivalentActions) || 0
  );
  const legacyForecastUncertaintyLoad = Math.max(
    0,
    Number(contributions.forecastUncertaintyLoad) ||
      legacyEquivalentActions * 2.8
  );
  const legacyDistanceLoad = Math.max(
    0,
    Number(contributions.distanceLoad) || 0
  );
  const legacyCongestionLoad = Math.max(
    0,
    Number(contributions.congestionLoad) || 0
  );
  const legacyPlayerLoad = Number(contributions.playerLoad) || 0;
  const legacyActFastLoad = Number(contributions.actFastLoad) || 0;

  const playerWallClockMultiplier = Number(
    wallClock?.playerResolutionMultiplierIndex
  ) || 1;
  const actFastDirectTimingMultiplier = Number(
    wallClock?.explicitTimingMultiplierIndex
  ) || 1;
  const actFastDirectTimerReduction = Number(
    wallClock?.actFastDirectTimerReduction
  ) || 0;
  const actFastREPressureMultiplier = Number(
    play?.actFastREPressureMultiplier
  ) || 1;
  const economyNominalActivityRegisterEquivalents = Math.max(
    0,
    Number(wallClock?.economyNominalActivityRegisterEquivalents) || 0
  );
  const economyExpectedActivityRegisterEquivalents = Math.max(
    0,
    Number(wallClock?.economyExpectedActivityRegisterEquivalents) || 0
  );
  const economyWallClockRegisterIndex = Math.max(
    0,
    Number(wallClock?.economyWallClockRegisterIndex) || 0
  );
  const programmingWallClockRegisterIndex = Math.max(
    0,
    Number(wallClock?.programmingWallClockRegisterIndex) ||
      expectedPlayRegisters * playerWallClockMultiplier * actFastDirectTimingMultiplier
  );

  const productionActionLoad =
    nominalRegisters * LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;
  const productionForecastUncertaintyLoad =
    productionEquivalentActions * LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;
  const productionExpectedPlayExtentLoad =
    expectedPlayRegisters * LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;
  const productionWallClockExtentLoad =
    effectiveWallClockRegisterIndex * LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;

  const planningPressure = Math.max(
    0,
    Number(lengthMetrics.programmingPressure?.planningPressure) || 0
  );
  const lessForeshadowingLoad = 0;
  const sharedDeckLoad = 0;
  const programmingVariantLoad = 0;
  const frictionLoad = 0;

  const productionRaw = productionWallClockExtentLoad;

  // Compactness/gross-mismatch comparison before recovery uses nominal route
  // extent plus the nominal economy transaction load. Direct Act Fast timing
  // still compresses only programming, not the Upgrade Phase.
  const preRecoveryProgrammingWallClockRegisterIndex =
    nominalRegisters *
    playerWallClockMultiplier *
    actFastDirectTimingMultiplier;
  const preRecoveryEconomyWallClockRegisterIndex =
    economyNominalActivityRegisterEquivalents * playerWallClockMultiplier;
  const preRecoveryWallClockRegisterIndex =
    preRecoveryProgrammingWallClockRegisterIndex +
    preRecoveryEconomyWallClockRegisterIndex;
  const preForecastBase =
    preRecoveryWallClockRegisterIndex *
    LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;
  const preForecastRaw = preForecastBase;

  const byId = new Map(
    (lengthMetrics.variantLengthContributions ?? []).map((entry) => [entry.id, entry])
  );
  if (byId.has("lessForeshadowing")) {
    byId.set("lessForeshadowing", {
      ...byId.get("lessForeshadowing"),
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (byId.has("classicSharedDeck")) {
    byId.set("classicSharedDeck", {
      ...byId.get("classicSharedDeck"),
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (byId.has("factoryRejects")) {
    byId.set("factoryRejects", {
      ...byId.get("factoryRejects"),
      kind: "mechanically-represented-card-re",
      delta: 0,
      evidence: { standaloneLengthEffect: false }
    });
  }
  if (preferences.actFastMode) {
    const preTimerProgrammingRegisterIndex =
      expectedPlayRegisters * playerWallClockMultiplier;
    const directTimerRawDelta =
      (programmingWallClockRegisterIndex - preTimerProgrammingRegisterIndex) *
      LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER;
    byId.set("actFast", {
      id: "actFast",
      kind: "wall-clock-timer",
      delta: Number(directTimerRawDelta.toFixed(2)),
      evidence: {
        mode: preferences.actFastMode,
        playerCount: Number(lengthMetrics.inputs?.playerCount) || 4,
        playerWallClockMultiplier: Number(playerWallClockMultiplier.toFixed(4)),
        directTimingMultiplier: Number(actFastDirectTimingMultiplier.toFixed(4)),
        directTimerReduction: Number(actFastDirectTimerReduction.toFixed(4)),
        rePressureMultiplier: Number(actFastREPressureMultiplier.toFixed(4)),
        legacyDirectRawDelta: Number(legacyActFastLoad.toFixed(2))
      }
    });
  } else {
    byId.delete("actFast");
  }
  if (preferences.lighterGame) {
    byId.set("lighterGame", {
      id: "lighterGame",
      kind: "mechanically-represented-economy-removal",
      delta: 0,
      evidence: {
        economyTransactionsRemoved: true,
        standaloneBlanketMultiplier: false
      }
    });
  } else {
    byId.delete("lighterGame");
  }

  ownerObservation.productionOwner = true;
  ownerObservation.productionRole =
    "expected-play-plus-energy-economy-wall-clock";
  if (ownerObservation.legacyProductionTermsPendingRetirement) {
    ownerObservation.legacyProductionTermsPendingRetirement = {
      ...ownerObservation.legacyProductionTermsPendingRetirement,
      distanceLoad: 0,
      congestionLoad: 0,
      actFastLoad: 0,
      playerLoad: 0,
      legacyDistanceLoadDiagnostic: Number(legacyDistanceLoad.toFixed(2)),
      legacyCongestionLoadDiagnostic: Number(legacyCongestionLoad.toFixed(2)),
      legacyPlayerLoadDiagnostic: Number(legacyPlayerLoad.toFixed(2)),
      legacyActFastLoadDiagnostic: Number(legacyActFastLoad.toFixed(2))
    };
  }
  ownerObservation.note =
    "v49dv keeps expected-play registers as route/play extent, applies player-count and Act Fast direct programming-time scaling, and adds card-aware upgrade draw/install transaction time. Final Short/Medium/Long/Epic classification and requested-length fit now use the resulting wall-clock turn index directly. Distance, standalone congestion, fixed player load, legacy Act Fast raw deltas and residual raw-score variant length terms are diagnostic/construction-only. Programming-deck variants now have no standalone length term; other variant phase-time mechanisms remain pending.";
  play.productionOwner = true;
  play.productionRole = "full-route-play-extent-with-act-fast-pressure";
  if (wallClock) {
    wallClock.productionOwner = true;
    wallClock.productionRole = "player-act-fast-plus-energy-economy-wall-clock";
  }

  lengthMetrics.raw = Number(productionRaw.toFixed(2));
  lengthMetrics.compactnessRaw = Number(productionRaw.toFixed(2));
  lengthMetrics.contributions = {
    ...contributions,
    legacyActionLoad: Number(legacyActionLoad.toFixed(2)),
    legacyForecastEquivalentActions: Number(legacyEquivalentActions.toFixed(2)),
    legacyForecastUncertaintyLoad: Number(legacyForecastUncertaintyLoad.toFixed(2)),
    legacyDistanceLoad: Number(legacyDistanceLoad.toFixed(2)),
    legacyCongestionLoad: Number(legacyCongestionLoad.toFixed(2)),
    legacyPlayerLoad: Number(legacyPlayerLoad.toFixed(2)),
    legacyActFastLoad: Number(legacyActFastLoad.toFixed(2)),
    actionLoad: Number(productionActionLoad.toFixed(2)),
    forecastEquivalentActions: Number(productionEquivalentActions.toFixed(2)),
    forecastUncertaintyLoad: Number(productionForecastUncertaintyLoad.toFixed(2)),
    productionExpectedPlayExtentLoad: Number(productionExpectedPlayExtentLoad.toFixed(2)),
    productionExpectedPlayRawPointsPerRegister:
      LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER,
    productionExpectedPlayRegisters: Number(expectedPlayRegisters.toFixed(2)),
    productionExpectedPlayProgrammingTurns: Number((expectedPlayRegisters / 5).toFixed(2)),
    productionPlayerWallClockMultiplier: Number(playerWallClockMultiplier.toFixed(4)),
    productionActFastDirectTimingMultiplier: Number(actFastDirectTimingMultiplier.toFixed(4)),
    productionActFastDirectTimerReduction: Number(actFastDirectTimerReduction.toFixed(4)),
    productionActFastREPressureMultiplier: Number(actFastREPressureMultiplier.toFixed(4)),
    productionProgrammingWallClockRegisterIndex: Number(
      programmingWallClockRegisterIndex.toFixed(2)
    ),
    productionEconomyNominalActivityRegisterEquivalents: Number(
      economyNominalActivityRegisterEquivalents.toFixed(3)
    ),
    productionEconomyExpectedActivityRegisterEquivalents: Number(
      economyExpectedActivityRegisterEquivalents.toFixed(3)
    ),
    productionEconomyWallClockRegisterIndex: Number(
      economyWallClockRegisterIndex.toFixed(2)
    ),
    productionWallClockMultiplierIndex: Number(
      (Number(wallClock?.wallClockMultiplierIndex) || 1).toFixed(4)
    ),
    productionWallClockRegisterIndex: Number(effectiveWallClockRegisterIndex.toFixed(2)),
    productionWallClockExtentLoad: Number(productionWallClockExtentLoad.toFixed(2)),
    preUncertaintyRaw: Number(preForecastRaw.toFixed(2)),
    playerLoad: 0,
    distanceLoad: 0,
    congestionLoad: 0,
    actFastLoad: 0,
    lessForeshadowingLoad: Number(lessForeshadowingLoad.toFixed(2)),
    sharedDeckLoad: Number(sharedDeckLoad.toFixed(2)),
    programmingVariantLoad: Number(programmingVariantLoad.toFixed(2)),
    routeLoad: Number(productionWallClockExtentLoad.toFixed(2)),
    frictionLoad: Number(frictionLoad.toFixed(2))
  };
  lengthMetrics.variantLengthContributions = Array.from(byId.values());

  const productionExtentOwner = {
    active: true,
    model: LENGTH_OWNER_OBSERVATION_MODEL_ID,
    semanticRole: "expected-play route/play extent",
    nominalRegisters: Number(nominalRegisters.toFixed(2)),
    legacyForecastExtraRegisters: Number(legacyEquivalentActions.toFixed(2)),
    reNativeExpectedExtraRegisters: Number(productionEquivalentActions.toFixed(2)),
    expectedPlayRegisters: Number(expectedPlayRegisters.toFixed(2)),
    expectedPlayProgrammingTurns: Number((expectedPlayRegisters / 5).toFixed(2)),
    rawPointsPerExpectedPlayRegister:
      LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER,
    legacyDistanceLoadDiagnostic: Number(legacyDistanceLoad.toFixed(2)),
    legacyCongestionLoadDiagnostic: Number(legacyCongestionLoad.toFixed(2)),
    note: "Expected-play registers remain the route/play extent owner; player count, direct programming timer effects and economy transactions are downstream wall-clock factors."
  };
  const productionWallClockOwner = {
    active: true,
    model: LENGTH_OWNER_OBSERVATION_MODEL_ID,
    semanticRole: "relative wall-clock elapsed-time index",
    playerCount: Number(lengthMetrics.inputs?.playerCount) || 4,
    playerWallClockMultiplier: Number(playerWallClockMultiplier.toFixed(4)),
    actFastMode: preferences.actFastMode ?? null,
    actFastREPressureMultiplier: Number(actFastREPressureMultiplier.toFixed(4)),
    actFastDirectTimerReduction: Number(actFastDirectTimerReduction.toFixed(4)),
    actFastDirectTimingMultiplier: Number(actFastDirectTimingMultiplier.toFixed(4)),
    economyActivity: wallClock?.economyActivity ?? null,
    economyNominalActivityRegisterEquivalents: Number(
      economyNominalActivityRegisterEquivalents.toFixed(3)
    ),
    economyExpectedActivityRegisterEquivalents: Number(
      economyExpectedActivityRegisterEquivalents.toFixed(3)
    ),
    programmingWallClockRegisterIndex: Number(
      programmingWallClockRegisterIndex.toFixed(2)
    ),
    economyWallClockRegisterIndex: Number(
      economyWallClockRegisterIndex.toFixed(2)
    ),
    wallClockMultiplierIndex: Number(
      (Number(wallClock?.wallClockMultiplierIndex) || 1).toFixed(4)
    ),
    effectiveWallClockRegisterIndex: Number(effectiveWallClockRegisterIndex.toFixed(2)),
    effectiveWallClockTurnIndex: Number((effectiveWallClockRegisterIndex / 5).toFixed(2)),
    legacyPlayerLoadDiagnostic: Number(legacyPlayerLoad.toFixed(2)),
    legacyActFastLoadDiagnostic: Number(legacyActFastLoad.toFixed(2)),
    legacyEnergyCrisisBlanketApplied: false,
    missingOwners: [
      "variant-specific-phase-time"
    ],
    note: "v49es production wall-clock owner. Upgrade-economy time comes only from card-aware paid draw and install/play events. Energy/card gains influence those events through the existing economy DP but are not independent time taxes. Act Fast direct saving applies to programming only. Energy Crisis removes economy transactions with no standalone length multiplier. This effective wall-clock turn index owns final semantic length classification and requested-length fit."
  };
  lengthMetrics.productionExtentOwner = productionExtentOwner;
  lengthMetrics.productionWallClockOwner = productionWallClockOwner;
  lengthMetrics.productionRecoveryOwner = productionExtentOwner;
  lengthMetrics.method =
    "re-native-wall-clock-length-bands-v49dv";
  return lengthMetrics;
}
