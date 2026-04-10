export const BOARD_PROFILE_DENSITY_WEIGHT = 1.1;
export const BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS = {
  hazard: 1,
  belt: 0.35,
  portal: 0.85,
  push: 0.8
};
export const RANDOMIZER_CONTROL_PENALTY = 6;
export const FLAG_APPROACH_WEIGHTS = {
  singleOpenBase: 30,
  singleOpenTraffic: 18,
  doubleOpenBase: 12,
  doubleOpenTraffic: 10,
  blockedSideBase: 2.2,
  blockedSideTraffic: 2.8,
  approachCompressionBase: 2.5,
  approachCompressionTraffic: 2.5,
  trappedCornerBase: 9,
  trappedCornerTraffic: 7,
  blockedByPit: 3,
  blockedByVoid: 1.75
};

const FLAG_AREA_FEATURE_WEIGHTS = {
  wallNear: 5,
  wallFar: 2.5,
  pit: 4,
  laserBase: 2,
  flamethrower: 4,
  push: 2.5,
  crusher: 4,
  beltSlow: 1.05,
  beltFast: 1.8,
  gear: 1.5,
  portal: 1.2,
  teleporter: 2.4,
  randomizer: 3.2,
  oil: 2.2,
  ledge: 1.35,
  ramp: 0.75,
  water: 0.45,
  battery: -2,
  trapdoor: 5.2,
  repulsor: 2.4,
  chopShop: -3.2,
  homingMissile: 3.8
};

export function getTimingWeight(feature) {
  const timingCount = feature?.timing?.length ?? 0;
  return timingCount > 0 ? timingCount / 5 : 1;
}

export function getEffectiveLaserDamage(feature, options = {}) {
  const baseDamage = feature?.damage || 1;
  return options.cuttingFloor ? baseDamage * 2 : baseDamage;
}

export function getDamageDeckPressureMultipliers(options = {}) {
  let hazard = 1;
  let robotTraffic = 1;
  let reboot = 1;

  if (options.lessSpammyGame) {
    hazard *= 0.88;
    robotTraffic *= 0.92;
    reboot *= 0.88;
  }
  if (options.criticalSpam) {
    hazard *= 1.14;
    robotTraffic *= 1.08;
    reboot *= 1.15;
  }
  if (options.criticalHaywire) {
    hazard *= 1.08;
    robotTraffic *= 1.14;
    reboot *= 1.08;
  }
  if (options.permanentShutdown && options.criticalSpam) {
    hazard *= 1.08;
    robotTraffic *= 1.06;
    reboot *= 1.12;
  }

  return { hazard, robotTraffic, reboot };
}

function isDirectDamageFeature(feature) {
  return (
    feature?.type === "laser" ||
    feature?.type === "flamethrower" ||
    feature?.type === "crusher" ||
    feature?.type === "trapdoor" ||
    feature?.type === "homingMissile"
  );
}

export function getBoardProfileDelta(feature) {
  const base = {
    hazardWeight: 0,
    congestionWeight: 0,
    complexityWeight: 0,
    swingWeight: 0,
    pitCount: 0,
    beltCount: 0,
    portalCount: 0,
    teleporterCount: 0,
    randomizerCount: 0,
    crusherCount: 0,
    pushCount: 0,
    hazardCount: 0
  };

  if (!feature?.type) {
    return base;
  }

  if (feature.type === "pit") {
    return { ...base, hazardWeight: 3.2, swingWeight: 2.8, pitCount: 1, hazardCount: 1 };
  }
  if (feature.type === "laser") {
    const laserDamage = feature.damage || 1;
    return {
      ...base,
      hazardWeight: 2 + laserDamage * 0.35,
      swingWeight: 0.55 + laserDamage * 0.15,
      hazardCount: 1
    };
  }
  if (feature.type === "flamethrower") {
    const timingWeight = getTimingWeight(feature);
    return {
      ...base,
      hazardWeight: 3.3 * timingWeight,
      swingWeight: 1.2 * timingWeight,
      hazardCount: 1
    };
  }
  if (feature.type === "push") {
    const timingWeight = getTimingWeight(feature);
    return {
      ...base,
      hazardWeight: 1.3 * timingWeight,
      complexityWeight: 1.35 * timingWeight,
      swingWeight: 0.9 * timingWeight,
      pushCount: 1
    };
  }
  if (feature.type === "crusher") {
    const timingWeight = getTimingWeight(feature);
    return {
      ...base,
      hazardWeight: 3.6 * timingWeight,
      complexityWeight: 1 * timingWeight,
      swingWeight: 1.6 * timingWeight,
      crusherCount: 1,
      hazardCount: 1
    };
  }
  if (feature.type === "trapdoor") {
    const timingWeight = getTimingWeight(feature);
    return {
      ...base,
      hazardWeight: 4.2 * timingWeight,
      complexityWeight: 0.7 * timingWeight,
      swingWeight: 2 * timingWeight,
      hazardCount: 1
    };
  }
  if (feature.type === "belt") {
    return {
      ...base,
      complexityWeight: feature.speed === 2 ? 0.9 : 0.55,
      congestionWeight: feature.speed === 2 ? 0.55 : 0.22,
      beltCount: 1
    };
  }
  if (feature.type === "repulsor") {
    return {
      ...base,
      hazardWeight: 2.2,
      congestionWeight: Math.max(1, (feature.sides || []).length) * 1.1,
      complexityWeight: 1,
      swingWeight: 1.05,
      hazardCount: 1
    };
  }
  if (feature.type === "gear") {
    return { ...base, complexityWeight: 1.4 };
  }
  if (feature.type === "portal") {
    return {
      ...base,
      hazardWeight: 1.2,
      complexityWeight: 1.7,
      swingWeight: 1.6,
      portalCount: 1
    };
  }
  if (feature.type === "teleporter") {
    return {
      ...base,
      hazardWeight: 1.9,
      complexityWeight: 2.25,
      swingWeight: 1.7,
      teleporterCount: 1,
      hazardCount: 1
    };
  }
  if (feature.type === "randomizer") {
    return {
      ...base,
      hazardWeight: 1.4,
      complexityWeight: 2.2,
      swingWeight: 1.8,
      randomizerCount: 1,
      hazardCount: 1
    };
  }
  if (feature.type === "oil") {
    return { ...base, hazardWeight: 1.2, complexityWeight: 1.8, swingWeight: 0.7 };
  }
  if (feature.type === "ledge") {
    return {
      ...base,
      hazardWeight: 1,
      congestionWeight: Math.max(1, (feature.sides || []).length) * 0.95,
      swingWeight: 0.6,
      hazardCount: 1
    };
  }
  if (feature.type === "ramp") {
    return { ...base, complexityWeight: 0.8 };
  }
  if (feature.type === "water") {
    return { ...base, hazardWeight: 0.3, complexityWeight: 0.65, swingWeight: 0.25 };
  }
  if (feature.type === "wall") {
    return {
      ...base,
      congestionWeight: Math.max(1, (feature.sides || []).length) * 1.25
    };
  }
  if (feature.type === "battery") {
    return { ...base, hazardWeight: -0.35 };
  }
  if (feature.type === "chopShop") {
    return { ...base, hazardWeight: -0.65, complexityWeight: 0.15 };
  }
  if (feature.type === "homingMissile") {
    return {
      ...base,
      hazardWeight: 2.4,
      complexityWeight: 0.8,
      swingWeight: 1.2,
      hazardCount: 1
    };
  }

  return base;
}

export function getTilePenaltyForFeature(feature, options = {}) {
  if (!feature?.type) {
    return 0;
  }

  const repulsorMultiplier = options.repulsorOverdrive ? 1.7 : 1;
  const oilMultiplier = options.flamingOil ? 1.85 : 1;

  const damagePressure = getDamageDeckPressureMultipliers(options);
  const scaleHazard = (value) => (
    isDirectDamageFeature(feature)
      ? Number((value * damagePressure.hazard).toFixed(2))
      : value
  );

  if (feature.type === "laser") {
    return scaleHazard(3 + getEffectiveLaserDamage(feature, options));
  }
  if (feature.type === "flamethrower") {
    return scaleHazard(5 * getTimingWeight(feature));
  }
  if (feature.type === "push") {
    return 2 * getTimingWeight(feature);
  }
  if (feature.type === "trapdoor") {
    return scaleHazard(6 * getTimingWeight(feature));
  }
  if (feature.type === "gear") {
    return 1.5;
  }
  if (feature.type === "portal") {
    return 1.8;
  }
  if (feature.type === "teleporter") {
    return 2.5;
  }
  if (feature.type === "randomizer") {
    return RANDOMIZER_CONTROL_PENALTY;
  }
  if (feature.type === "oil") {
    return Number((2.8 * oilMultiplier).toFixed(2));
  }
  if (feature.type === "battery" && options.batteryActive) {
    return options.upgradeWorld ? -3 : -2;
  }
  if (feature.type === "chopShop" && options.batteryActive) {
    return options.upgradeWorld ? -4.7 : -3.5;
  }
  if (feature.type === "repulsor") {
    return Number((3.2 * repulsorMultiplier).toFixed(2));
  }
  if (feature.type === "homingMissile") {
    if (!options.onEntrance) {
      return 0;
    }
    const playerCount = options.playerCount ?? 4;
    return scaleHazard(Math.max(1.5, 5 - playerCount * 0.45));
  }
  if (feature.type === "ledge") {
    return 0.8;
  }
  if (feature.type === "ramp") {
    return 0.35;
  }
  if (feature.type === "water") {
    return 0.35;
  }
  if (feature.type === "crusher") {
    return scaleHazard((options.rebootDamagePenalty ?? 8) * getTimingWeight(feature));
  }

  return 0;
}

export function getFlagAreaFeatureScore(feature, dist, options = {}) {
  if (!feature?.type) {
    return 0;
  }

  const proximityWeight = dist === 0 ? 2.5 : dist === 1 ? 2 : 1;
  const damagePressure = getDamageDeckPressureMultipliers(options);
  const oilMultiplier = options.flamingOil ? 1.85 : 1;
  const scaleHazard = (value) => (
    isDirectDamageFeature(feature)
      ? Number((value * damagePressure.hazard).toFixed(2))
      : value
  );

  if (feature.type === "wall") {
    const perSide = dist <= 1 ? FLAG_AREA_FEATURE_WEIGHTS.wallNear : FLAG_AREA_FEATURE_WEIGHTS.wallFar;
    return perSide * proximityWeight * Math.max(1, (feature.sides || []).length);
  }
  if (feature.type === "pit") return FLAG_AREA_FEATURE_WEIGHTS.pit * proximityWeight;
  if (feature.type === "laser") return scaleHazard((FLAG_AREA_FEATURE_WEIGHTS.laserBase + getEffectiveLaserDamage(feature, options)) * proximityWeight);
  if (feature.type === "flamethrower") return scaleHazard(FLAG_AREA_FEATURE_WEIGHTS.flamethrower * getTimingWeight(feature) * proximityWeight);
  if (feature.type === "push") return FLAG_AREA_FEATURE_WEIGHTS.push * getTimingWeight(feature) * proximityWeight;
  if (feature.type === "crusher") return scaleHazard(FLAG_AREA_FEATURE_WEIGHTS.crusher * getTimingWeight(feature) * proximityWeight);
  if (feature.type === "trapdoor") return scaleHazard(FLAG_AREA_FEATURE_WEIGHTS.trapdoor * getTimingWeight(feature) * proximityWeight);
  if (feature.type === "belt") {
    return (feature.speed === 2 ? FLAG_AREA_FEATURE_WEIGHTS.beltFast : FLAG_AREA_FEATURE_WEIGHTS.beltSlow) * proximityWeight;
  }
  if (feature.type === "gear") return FLAG_AREA_FEATURE_WEIGHTS.gear * proximityWeight;
  if (feature.type === "portal") return FLAG_AREA_FEATURE_WEIGHTS.portal * proximityWeight;
  if (feature.type === "teleporter") return FLAG_AREA_FEATURE_WEIGHTS.teleporter * proximityWeight;
  if (feature.type === "randomizer") return FLAG_AREA_FEATURE_WEIGHTS.randomizer * proximityWeight;
  if (feature.type === "oil") return Number((FLAG_AREA_FEATURE_WEIGHTS.oil * proximityWeight * oilMultiplier).toFixed(2));
  if (feature.type === "ledge") return FLAG_AREA_FEATURE_WEIGHTS.ledge * proximityWeight;
  if (feature.type === "ramp") return FLAG_AREA_FEATURE_WEIGHTS.ramp * proximityWeight;
  if (feature.type === "water") return FLAG_AREA_FEATURE_WEIGHTS.water * proximityWeight;
  if (feature.type === "battery" && options.batteryActive) return (options.upgradeWorld ? FLAG_AREA_FEATURE_WEIGHTS.battery * 1.45 : FLAG_AREA_FEATURE_WEIGHTS.battery) * proximityWeight;
  if (feature.type === "chopShop" && options.batteryActive) return (options.upgradeWorld ? FLAG_AREA_FEATURE_WEIGHTS.chopShop * 1.35 : FLAG_AREA_FEATURE_WEIGHTS.chopShop) * proximityWeight;
  if (feature.type === "repulsor") return Number((FLAG_AREA_FEATURE_WEIGHTS.repulsor * proximityWeight * (options.repulsorOverdrive ? 1.7 : 1)).toFixed(2));
  if (feature.type === "homingMissile") return scaleHazard(FLAG_AREA_FEATURE_WEIGHTS.homingMissile * proximityWeight);

  return 0;
}
