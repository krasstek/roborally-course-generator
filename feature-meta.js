function formatTiming(timing, separator = ",") {
  return timing?.length ? ` [${timing.join(separator)}]` : "";
}

export function formatFeatureLabel(feature, options = {}) {
  const compact = Boolean(options.compact);

  switch (feature?.type) {
    case "pit":
    case "oil":
    case "battery":
    case "randomizer":
    case "water":
    case "radiation":
      return feature.type;
    case "radioactiveWaste":
      return "radioactive waste";
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
    case "redWall":
      return `red wall ${((feature.sides || []).join(compact ? "," : ", ")) || "?"}`;
    case "greenWall":
      return `green wall ${((feature.sides || []).join(compact ? "," : ", ")) || "?"}`;
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
