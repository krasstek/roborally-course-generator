// Robo Rally Course Randomizer - board profiles: hazard, congestion, density and swinginess of each board piece
import {
  BOARD_PROFILE_DENSITY_COMPONENT_WEIGHTS,
  BOARD_PROFILE_DENSITY_WEIGHT,
  getBoardProfileDelta
} from "../../feature-weights.js";
import { clamp } from "../shared/math.js";
import { normalizeBias } from "./math.js";

export const BOARD_PROFILE_HAZARD_DENSITY_THRESHOLD = 0.16;
export const BOARD_PROFILE_HAZARD_DENSITY_WEIGHT = 2.4;

export function deriveBoardProfile(piece) {
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

export function countFeatureTypeInTileMap(tileMap, featureType) {
  if (!tileMap) {
    return 0;
  }

  let total = 0;
  for (const tile of tileMap.values()) {
    total += (tile.features || []).filter((feature) => feature.type === featureType).length;
  }
  return total;
}
