// Robo Rally Course Randomizer - assets: board data files, calibration guidance and board photos
import { deriveBoardProfile } from "./board-profile.js";
import { normalizeConstructionGuidanceCalibration } from "./guidance-calibration.js";

// Module imports get their ?v= version from the import map in index.html; the
// version is still appended by hand to board data fetches and board photos.
export const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") ?? "";
export const VERSION_SUFFIX = ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : "";
export const versionedPath = (path) => `${path}${VERSION_SUFFIX}`;


// Versioned strings stored in diagnostic `method` fields are compatibility
// identifiers, not ordinary comments. They may appear in saved/debug output and
// should only be renamed alongside an explicit migration or schema decision.

export const PIECE_DATA_FILES = [
  "30th-docking-bay-a",
  "30th-docking-bay-b",
  "all-roads",
  "assembly",
  "back-stretch",
  "black-gold",
  "blueprint",
  "bounce-house",
  "cactus",
  "check-in",
  "circles",
  "circuit-trap",
  "coliseum",
  "coming-and-going",
  "concentric",
  "confusion",
  "convergence",
  "diablo-desert",
  "dirt-boss-derby",
  "discovery",
  "docking-bay-a",
  "docking-bay-b",
  "downtown-delta",
  "double-helix",
  "double-zap",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "in-and-out",
  "chasm",
  "falling",
  "gear-box",
  "labyrinth",
  "laser-maze",
  "links",
  "locked",
  "maccadams-motorway",
  "meeple",
  "mergers",
  "merry-go-round",
  "mine",
  "mb-docking-bay-a",
  "mb-docking-bay-b",
  "mb-tile-1a",
  "mb-tile-1b",
  "mb-tile-2a",
  "mb-tile-2b",
  "mb-tile-3a",
  "mb-tile-3b",
  "mb-tile-4a",
  "mb-tile-4b",
  "mb-tile-5a",
  "mb-tile-5b",
  "mb-tile-6a",
  "mb-tile-6b",
  "mb-tile-7a",
  "mb-tile-7b",
  "mb-tile-8a",
  "mb-tile-8b",
  "mb-tile-9a",
  "mb-tile-9b",
  "mb-tile-10a",
  "mb-tile-10b",
  "mb-tile-11a",
  "mb-tile-11b",
  "mb-tile-12a",
  "mb-tile-12b",
  "mb-tile-13a",
  "mb-tile-13b",
  "mb-tile-14a",
  "mb-tile-14b",
  "mb-tile-15a",
  "mb-tile-15b",
  "mb-tile-16a",
  "mb-tile-16b",
  "mb-tile-17a",
  "mb-tile-17b",
  "misdirection",
  "portal-palace",
  "pushy",
  "reactor-core",
  "renegade-run",
  "sampler",
  "shake-n-bake",
  "sidewinder",
  "space-bridge-red",
  "space-bridge-blue",
  "speedia-qualifier",
  "spill",
  "spin-class",
  "starting-tile-a",
  "starting-tile-b",
  "steps",
  "stop-and-go",
  "straight-a-ways",
  "styx",
  "tabula-rasa",
  "tempest",
  "the-abyss",
  "the-crumplezone",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-pits",
  "the-wave",
  "the-x",
  "the-zone",
  "toasted",
  "transition",
  "trench-run",
  "vacancy",
  "vortex-valley",
  "water-park",
  "winding",
  "whirlpool"
];

export let cachedAssets = null;

export async function loadJSON(path) {
  // Browser generation uses fetch as before. The calibration runner imports this
  // module directly in Node, where project data should be read from disk rather
  // than through a web server. No external package is needed for either path.
  if (typeof window === "undefined" && typeof process !== "undefined") {
    const { readFile } = await import("node:fs/promises");
    // Data paths are relative to the project root (this module is two levels down).
    const fileUrl = new URL(path, new URL("../../", import.meta.url));
    return JSON.parse(await readFile(fileUrl, "utf8"));
  }

  const res = await fetch(versionedPath(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

export async function loadOptionalJSON(path) {
  try {
    return await loadJSON(path);
  } catch {
    // Calibration is an optimization only. A missing or stale calibration file
    // must never prevent ordinary course generation.
    return null;
  }
}

export async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = versionedPath(src);
  });
}

export async function loadPieceImage(assets, pieceId) {
  const piece = assets.pieceMap[pieceId];
  if (!piece?.image) {
    return null;
  }

  if (assets.imageMap[pieceId]) {
    return assets.imageMap[pieceId];
  }

  if (!assets.imageLoadPromises.has(pieceId)) {
    const promise = loadImage(piece.image)
      .then((img) => {
        assets.imageMap[pieceId] = img;
        return img;
      })
      .catch((error) => {
        console.warn(`Unable to load piece image for ${pieceId}: ${piece.image}`, error);
        return null;
      })
      .finally(() => {
        assets.imageLoadPromises.delete(pieceId);
      });
    assets.imageLoadPromises.set(pieceId, promise);
  }

  return assets.imageLoadPromises.get(pieceId);
}

export async function loadPieceImages(assets, pieceIds) {
  await Promise.all([...new Set(pieceIds)].map((pieceId) => loadPieceImage(assets, pieceId)));
}

export function getPlacementImagePieceIds(placements = [], pieceMap = {}) {
  return placements
    .map((placement) => placement.pieceId)
    .filter((pieceId) => pieceMap[pieceId]?.image);
}

export async function ensureScenarioImages(assets, scenario) {
  await loadPieceImages(assets, getPlacementImagePieceIds(scenario.placements, scenario.pieceMap));
}

export function pruneImageCache(assets, keepPieceIds = []) {
  const keep = new Set(keepPieceIds);

  for (const pieceId of Object.keys(assets.imageMap)) {
    if (!keep.has(pieceId)) {
      delete assets.imageMap[pieceId];
    }
  }
}

// A data file with "count": n describes n identical physical pieces (mines,
// space bridges). They load as n copies with ids "<id>-a", "<id>-b", ... and
// physical ids "<physicalBoardId>-a", ...: the ids the separate files used to
// have, so saved courses keep loading. Both sides of a double-sided token
// (space-bridge-red / -blue, physical id space-bridge) expand to matching
// letters, so copy "a" of each colour is one physical token. Copies carry a
// non-enumerable copyOf / copyCount for the board audit.
const COPY_LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function expandCountedPiece(piece) {
  const count = Math.floor(Number(piece?.count) || 0);
  if (!(count > 1)) {
    if (piece && "count" in piece) {
      const { count: _count, ...single } = piece;
      return [single];
    }
    return [piece];
  }
  if (count > COPY_LETTERS.length) {
    throw new Error(`${piece.id}: count ${count} is more than ${COPY_LETTERS.length}`);
  }
  const { count: _count, ...base } = piece;
  return [...COPY_LETTERS.slice(0, count)].map((letter) => {
    const copy = {
      ...base,
      id: `${base.id}-${letter}`,
      physicalBoardId: `${base.physicalBoardId ?? base.id}-${letter}`
    };
    Object.defineProperty(copy, "copyOf", { value: base.id, enumerable: false });
    Object.defineProperty(copy, "copyCount", { value: count, enumerable: false });
    return copy;
  });
}

export async function loadAssets() {
  if (cachedAssets) {
    return cachedAssets;
  }

  const [pieces, rawConstructionGuidance, preflightGate] = await Promise.all([
    Promise.all(
      PIECE_DATA_FILES.map(async (pieceId) => loadJSON(`./data/${pieceId}.json`))
    ),
    loadOptionalJSON("./calibration/construction-guidance.json"),
    // Optional like the guidance: without it, attempts are never stopped early.
    loadOptionalJSON("./calibration/preflight-gate.json")
  ]);
  const pieceMap = Object.fromEntries(
    pieces.flatMap(expandCountedPiece).map((piece) => [piece.id, piece])
  );
  const constructionGuidance = normalizeConstructionGuidanceCalibration(rawConstructionGuidance);

  for (const piece of Object.values(pieceMap)) {
    // Decided by content, not by set (user 2026-11-03): every overlay token
    // and every 6x6 board can be placed as an overlay.
    piece.overlayCapable = piece.kind === "overlay" ||
      (piece.width === 6 && piece.height === 6);
  }

  for (const piece of Object.values(pieceMap)) {
    piece.boardProfile = deriveBoardProfile(piece);
    piece.derivedBias = piece.boardProfile.bias;
  }

  cachedAssets = {
    pieceMap,
    imageMap: {},
    imageLoadPromises: new Map(),
    constructionGuidance,
    preflightGate
  };
  return cachedAssets;
}
