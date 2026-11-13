// Robo Rally Course Randomizer - square-swap rules (variant batch 1, 2026-11-13)
//
// Each of these rules turns one printed element into another for the whole game.
// Generation and reload analyse a pieceMap whose tiles already carry the swap;
// route search, pricing and caches stay unchanged. The course map, setup summary
// and Special Rules text keep the printed pieceMap (players set up the printed
// boards and apply the rule), so a swapped piece keeps its id and images and
// points back to the printed piece (`printed`). A swapped feature records the
// printed element it came from (`printedType`) where a rule must still see it
// (a battery played as a pit stop still archives).

const ALL_REGISTERS = Object.freeze([1, 2, 3, 4, 5]);

// One colour for every teleporter under Space Bridge Network; printed space
// bridge tokens keep their own colours.
export const TELEPORTER_NETWORK_BRIDGE_ID = "teleporter-network";

const hasType = (features, type) => features.some((feature) => feature.type === type);

// Applied in this order. Cold Storage and Radioactive Gunk never come together
// (variants.js); Gunk runs first so the Factory Stood Still check sees the
// added water/waste currents.
export const SQUARE_SWAP_RULES = Object.freeze([
  {
    id: "radioactiveGunk",
    swap(features) {
      const water = hasType(features, "water");
      const waste = hasType(features, "radioactiveWaste");
      if (water === waste) return features;
      return water
        ? [...features, { type: "radioactiveWaste", printedType: "water" }]
        : [...features, { type: "water", printedType: "radioactiveWaste" }];
    }
  },
  {
    id: "coldStorage",
    // Water is ice: it moves like oil (and is oil in every way except for
    // Flaming Oil, which never comes with it). Its currents stop.
    swap(features) {
      if (!hasType(features, "water")) return features;
      return [
        ...features.filter((feature) => feature.type !== "water" && feature.type !== "belt"),
        { type: "oil", printedType: "water" }
      ];
    }
  },
  {
    id: "factoryStoodStill",
    // Conveyors stop; water and waste currents keep running.
    swap(features) {
      if (!hasType(features, "belt")) return features;
      if (hasType(features, "water") || hasType(features, "radioactiveWaste")) return features;
      return features.filter((feature) => feature.type !== "belt");
    }
  },
  {
    id: "lavaPits",
    swap: (features) => replaceType(features, "firePit", () => ({ type: "pit" }))
  },
  {
    id: "batteryPitStops",
    swap: (features) => replaceType(features, "battery", () => ({ type: "pitStop", printedType: "battery" }))
  },
  {
    id: "spaceBridgeNetwork",
    swap: (features) => replaceType(features, "teleporter", () => ({
      type: "spaceBridge",
      id: TELEPORTER_NETWORK_BRIDGE_ID,
      printedType: "teleporter"
    }))
  },
  {
    id: "napalmDeath",
    swap: (features) => replaceType(features, "flamethrower", (feature) => ({ ...feature, timing: [...ALL_REGISTERS] }))
  },
  {
    id: "pistonCup",
    swap: (features) => replaceType(features, "push", (feature) => ({ ...feature, timing: [...ALL_REGISTERS] }))
  }
]);

export const SQUARE_SWAP_RULE_IDS = Object.freeze(SQUARE_SWAP_RULES.map((rule) => rule.id));

function replaceType(features, type, make) {
  if (!hasType(features, type)) return features;
  return features.map((feature) => (feature.type === type ? make(feature) : feature));
}

// The active swaps in application order, as a stable key ("" = none).
export function getSquareSwapSignature(rules = {}) {
  return SQUARE_SWAP_RULE_IDS.filter((id) => Boolean(rules?.[id])).join(",");
}

export function hasSquareSwaps(rules = {}) {
  return getSquareSwapSignature(rules) !== "";
}

function swapPiece(piece, activeRules) {
  let changed = false;
  const tiles = (piece.tiles || []).map((tile) => {
    let features = tile.features || [];
    for (const rule of activeRules) features = rule.swap(features);
    if (features === (tile.features || [])) return tile;
    changed = true;
    return { ...tile, features };
  });
  return changed ? { ...piece, tiles, printed: piece } : piece;
}

// pieceMap -> signature -> swapped pieceMap. Memoized so repeated calls return
// the same objects (the tile-map caches downstream are keyed by identity).
const SWAPPED_PIECE_MAP_CACHE = new WeakMap();

// The pieceMap the analysis plays on under the rules in `rules` (a variant
// bundle, saved snapshot or scenario: anything with the rule ids as flags).
// Returns `pieceMap` itself when no swap rule is active.
export function applySquareSwapsToPieceMap(pieceMap, rules = {}) {
  if (!pieceMap) return pieceMap;
  const signature = getSquareSwapSignature(rules);
  if (!signature) return pieceMap;
  let bySignature = SWAPPED_PIECE_MAP_CACHE.get(pieceMap);
  if (!bySignature) {
    bySignature = new Map();
    SWAPPED_PIECE_MAP_CACHE.set(pieceMap, bySignature);
  }
  const cached = bySignature.get(signature);
  if (cached) return cached;
  const activeRules = SQUARE_SWAP_RULES.filter((rule) => rules[rule.id]);
  const swapped = Object.fromEntries(
    Object.entries(pieceMap).map(([pieceId, piece]) => [pieceId, swapPiece(piece, activeRules)])
  );
  bySignature.set(signature, swapped);
  return swapped;
}

export function getPrintedPiece(piece) {
  return piece?.printed ?? piece;
}

export function isPrintedFeatureType(feature, type) {
  return feature?.type === type || feature?.printedType === type;
}
