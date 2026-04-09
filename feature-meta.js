function formatTiming(timing, separator = ",") {
  return timing?.length ? ` [${timing.join(separator)}]` : "";
}

export function normalizeSides(sides) {
  const validSides = new Set(["N", "E", "S", "W"]);
  return [...new Set((sides || []).filter((side) => validSides.has(side)))].sort();
}

export function normalizeTiming(timing) {
  return [...new Set((timing || []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5))]
    .sort((a, b) => a - b);
}

export function normalizeBeltTurn(turn) {
  return turn === "left" || turn === "right" || turn === "both" ? turn : undefined;
}

export function normalizeFeature(feature) {
  if (!feature || typeof feature !== "object" || typeof feature.type !== "string") {
    return null;
  }

  switch (feature.type) {
    case "pit":
    case "oil":
    case "battery":
    case "randomizer":
    case "water":
    case "chopShop":
    case "homingMissile":
      return { type: feature.type };
    case "belt": {
      const normalizedBelt = {
        type: "belt",
        dir: feature.dir || "N",
        speed: feature.speed === 2 ? 2 : 1
      };
      const turn = normalizeBeltTurn(feature.turn);
      if (turn) normalizedBelt.turn = turn;
      return normalizedBelt;
    }
    case "gear":
      return {
        type: "gear",
        rotation: feature.rotation === "ccw" ? "ccw" : "cw"
      };
    case "laser":
      return {
        type: "laser",
        dir: feature.dir || "N",
        damage: Number.isFinite(feature.damage) && feature.damage > 0 ? Number(feature.damage) : 1
      };
    case "wall":
    case "repulsor":
      return {
        type: feature.type,
        sides: normalizeSides(feature.sides)
      };
    case "push":
      return {
        type: "push",
        dir: feature.dir || "N",
        timing: normalizeTiming(feature.timing)
      };
    case "trapdoor":
      return {
        type: "trapdoor",
        timing: normalizeTiming(feature.timing)
      };
    case "flamethrower":
      return {
        type: "flamethrower",
        dir: feature.dir || "N",
        timing: normalizeTiming(feature.timing)
      };
    case "crusher":
      return {
        type: "crusher",
        timing: normalizeTiming(feature.timing)
      };
    case "portal":
      return {
        type: "portal",
        id: String(feature.id || "1")
      };
    case "teleporter":
      return {
        type: "teleporter",
        power: Number.isFinite(feature.power) && feature.power > 0 ? Number(feature.power) : 2
      };
    case "ledge":
      return {
        type: "ledge",
        sides: normalizeSides(feature.sides)
      };
    case "ramp":
      return {
        type: "ramp",
        dir: feature.dir || "N"
      };
    case "checkpoint":
      return {
        type: "checkpoint",
        id: Number.isFinite(feature.id) ? Number(feature.id) : 1
      };
    default:
      return JSON.parse(JSON.stringify(feature));
  }
}

export function cloneFeature(feature) {
  return normalizeFeature(feature);
}

export function formatFeatureLabel(feature, options = {}) {
  const compact = Boolean(options.compact);

  switch (feature?.type) {
    case "pit":
    case "oil":
    case "battery":
    case "randomizer":
    case "water":
      return feature.type;
    case "chopShop":
      return "chop shop";
    case "belt":
      if (compact) {
        return `conveyor ${feature.dir ?? ""}${feature.speed ?? ""}${feature.turn ? ` ${feature.turn}` : ""}`.trim();
      }
      return `conveyor ${feature.dir ?? "?"}${feature.speed ? ` speed ${feature.speed}` : ""}${feature.turn ? ` turn ${feature.turn}` : ""}`;
    case "gear":
      return `gear ${feature.rotation ?? "?"}`;
    case "laser":
      return compact
        ? `laser${feature.dir ? ` ${feature.dir}` : ""}`
        : `laser ${feature.dir ?? "?"} dmg ${feature.damage ?? 1}`;
    case "trapdoor":
      return `trapdoor${formatTiming(feature.timing, compact ? "," : ", ")}`;
    case "wall":
      return `wall ${((feature.sides || []).join(compact ? "," : ", ")) || "?"}`;
    case "repulsor":
      return `repulsor ${((feature.sides || []).join(compact ? "," : ", ")) || "?"}`;
    case "push":
      return compact
        ? `push ${feature.dir ?? ""}${formatTiming(feature.timing, ",")}`.trim()
        : `push ${feature.dir ?? "?"} [${(feature.timing || []).join(", ")}]`;
    case "flamethrower":
      return compact
        ? `flame${feature.dir ? ` ${feature.dir}` : ""}${formatTiming(feature.timing, ",")}`
        : `flamethrower ${feature.dir ?? "?"} [${(feature.timing || []).join(", ")}]`;
    case "crusher":
      return `crusher${formatTiming(feature.timing, compact ? "," : ", ")}`;
    case "homingMissile":
      return "homing missile";
    case "portal":
      return `portal ${feature.id ?? "?"}`;
    case "teleporter":
      return `teleporter power ${feature.power ?? 2}`;
    case "ledge":
      return `ledge ${((feature.sides || []).join(compact ? "," : ", ")) || "?"}`;
    case "ramp":
      return `ramp ${feature.dir ?? "?"}`;
    case "checkpoint":
      return compact ? `cp ${feature.id ?? "?"}` : `checkpoint ${feature.id ?? "?"}`;
    default:
      return JSON.stringify(feature);
  }
}

export function summarizeFeatureDetails(feature) {
  switch (feature?.type) {
    case "pit":
      return "pit";
    case "oil":
      return "oil";
    case "belt":
      return `conveyor dir=${feature.dir} speed=${feature.speed}${feature.turn ? ` turn=${feature.turn}` : ""}`;
    case "gear":
      return `gear rotation=${feature.rotation}`;
    case "laser":
      return `laser dir=${feature.dir ?? "?"} damage=${feature.damage ?? 1}`;
    case "wall":
      return `wall sides=${(feature.sides || []).join(",")}`;
    case "repulsor":
      return `repulsor sides=${(feature.sides || []).join(",")}`;
    case "push":
      return `push dir=${feature.dir} timing=${(feature.timing || []).join(",")}`;
    case "flamethrower":
      return `flamethrower dir=${feature.dir} timing=${(feature.timing || []).join(",")}`;
    case "crusher":
      return `crusher timing=${(feature.timing || []).join(",")}`;
    case "trapdoor":
      return `trapdoor timing=${(feature.timing || []).join(",")}`;
    case "portal":
      return `portal id=${feature.id}`;
    case "teleporter":
      return `teleporter power=${feature.power ?? 2}`;
    case "randomizer":
      return "randomizer";
    case "ledge":
      return `ledge sides=${(feature.sides || []).join(",")}`;
    case "ramp":
      return `ramp dir=${feature.dir}`;
    case "water":
      return "water";
    case "checkpoint":
      return `checkpoint id=${feature.id}`;
    case "battery":
      return "battery";
    case "chopShop":
      return "chop shop";
    case "homingMissile":
      return "homing missile";
    default:
      return JSON.stringify(feature);
  }
}

export function getFeatureTypeSymbol(featureType) {
  switch (featureType) {
    case "wall":
      return "#";
    case "belt":
      return "=>";
    case "repulsor":
      return "<>";
    case "laser":
      return "L>";
    case "trapdoor":
      return "TD";
    case "pit":
      return "PT";
    case "gear":
      return "GR";
    case "push":
      return "PS";
    case "flamethrower":
      return "FL";
    case "crusher":
      return "CR";
    case "portal":
      return "PO";
    case "teleporter":
      return "TP";
    case "randomizer":
      return "R?";
    case "homingMissile":
      return "HM";
    case "chopShop":
      return "CS";
    case "water":
      return "WA";
    case "oil":
      return "OI";
    case "ledge":
      return "LG";
    case "ramp":
      return "RA";
    case "checkpoint":
      return "F";
    case "battery":
      return "BT";
    case "start":
      return "S>";
    default:
      return featureType.slice(0, 2).toUpperCase();
  }
}
